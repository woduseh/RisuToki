import * as http from 'http';

import { resolve as cbsResolve, generateCombinations } from './cbs-evaluator';
import {
  extractToggleValues,
  extractToggles,
  parse,
  resolveInnerExpressions,
  type ToggleMap,
  validateNesting,
} from './cbs-parser';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';

export interface CbsEntry {
  path: string;
  text: string;
}

export interface CbsRouteDeps {
  getCurrentData: () => Record<string, unknown> | null;
  openExternalDocument?: (filePath: string) => Record<string, unknown>;
  readJsonBody: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    routePath: string,
    broadcastStatus: (payload: Record<string, unknown>) => void,
  ) => Promise<Record<string, unknown> | null>;
  broadcastStatus: (payload: Record<string, unknown>) => void;
  jsonRes: (res: http.ServerResponse, data: Record<string, unknown>) => void;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, opts: McpSuccessOptions) => void;
  mcpError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void;
}

const CBS_SCAN_FIELD_NAMES = [
  'globalNote',
  'firstMessage',
  'description',
  'personality',
  'scenario',
  'systemPrompt',
  'exampleMessage',
  'additionalText',
  'mainPrompt',
  'jailbreak',
];

function hasCbsSyntax(text: string): boolean {
  return text.includes('{{#when') || text.includes('{{getglobalvar');
}

function getLorebookEntries(currentData: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(currentData.lorebook)
    ? currentData.lorebook.filter(
        (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
      )
    : [];
}

export function collectCbsEntries(
  currentData: Record<string, unknown>,
  fieldFilter?: string,
  lorebookIndex?: number,
): CbsEntry[] {
  const entries: CbsEntry[] = [];
  const lorebook = getLorebookEntries(currentData);

  if (lorebookIndex !== undefined) {
    if (!Number.isInteger(lorebookIndex) || lorebookIndex < 0 || lorebookIndex >= lorebook.length) {
      return entries;
    }
    const content = typeof lorebook[lorebookIndex].content === 'string' ? lorebook[lorebookIndex].content : '';
    if (hasCbsSyntax(content)) {
      entries.push({ path: `lorebook[${lorebookIndex}].content`, text: content });
    }
    return entries;
  }

  if (fieldFilter) {
    let text = '';
    if (fieldFilter.startsWith('lorebook[')) {
      const match = fieldFilter.match(/^lorebook\[(\d+)\]\.content$/);
      if (match) {
        const index = parseInt(match[1], 10);
        if (index >= 0 && index < lorebook.length && typeof lorebook[index].content === 'string') {
          text = lorebook[index].content;
        }
      }
    } else if (typeof currentData[fieldFilter] === 'string') {
      text = currentData[fieldFilter];
    }
    if (text && hasCbsSyntax(text)) {
      entries.push({ path: fieldFilter, text });
    }
    return entries;
  }

  for (const fieldName of CBS_SCAN_FIELD_NAMES) {
    const value = currentData[fieldName];
    if (typeof value === 'string' && hasCbsSyntax(value)) {
      entries.push({ path: fieldName, text: value });
    }
  }

  const alternateGreetings = Array.isArray(currentData.alternateGreetings) ? currentData.alternateGreetings : [];
  for (let index = 0; index < alternateGreetings.length; index++) {
    const greeting = alternateGreetings[index];
    if (typeof greeting === 'string' && hasCbsSyntax(greeting)) {
      entries.push({ path: `alternateGreetings[${index}]`, text: greeting });
    }
  }

  for (let index = 0; index < lorebook.length; index++) {
    const rawContent = lorebook[index].content;
    const content = typeof rawContent === 'string' ? rawContent : '';
    if (hasCbsSyntax(content)) {
      entries.push({ path: `lorebook[${index}].content`, text: content });
    }
  }

  return entries;
}

export function normalizeCbsToggles(toggles: Record<string, unknown>): ToggleMap {
  const result: ToggleMap = {};
  for (const [key, value] of Object.entries(toggles)) {
    const normalizedKey = key.startsWith('toggle_') ? key : `toggle_${key}`;
    result[normalizedKey] = String(value);
  }
  return result;
}

function parseLorebookIndex(rawValue: string | null): number | undefined {
  if (rawValue === null) return undefined;
  const parsed = parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requireCurrentData(
  res: http.ServerResponse,
  deps: Pick<CbsRouteDeps, 'getCurrentData' | 'mcpError'>,
  action: string,
): Record<string, unknown> | null {
  const currentData = deps.getCurrentData();
  if (!currentData) {
    deps.mcpError(res, 400, { action, target: 'cbs', message: 'No file loaded' });
    return null;
  }
  return currentData;
}

export async function handleCbsRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  url: URL,
  deps: CbsRouteDeps,
): Promise<boolean> {
  if (parts[0] !== 'cbs') {
    return false;
  }

  if (parts[1] === 'validate' && !parts[2] && req.method === 'GET') {
    const filePath = url.searchParams.get('file_path') || undefined;
    let currentData: Record<string, unknown> | null;

    if (filePath) {
      if (!deps.openExternalDocument) {
        deps.mcpError(res, 500, {
          action: 'cbs/validate',
          target: 'cbs',
          message: 'External document loading not available',
        });
        return true;
      }
      try {
        currentData = deps.openExternalDocument(filePath);
      } catch (error) {
        deps.mcpError(res, 400, {
          action: 'cbs/validate',
          target: 'cbs',
          message: `Failed to load external file: ${error instanceof Error ? error.message : String(error)}`,
        });
        return true;
      }
    } else {
      currentData = requireCurrentData(res, deps, 'cbs/validate');
    }
    if (!currentData) return true;

    const fieldFilter = url.searchParams.get('field') || undefined;
    const lorebookIndex = parseLorebookIndex(url.searchParams.get('lorebook_index'));
    const allCombos = url.searchParams.get('all_combos') === 'true';
    const cbsEntries = collectCbsEntries(currentData, fieldFilter, lorebookIndex);
    const maxValidateCombos = 1024;
    const results: Record<string, unknown>[] = [];
    let passed = 0;
    let failed = 0;

    for (const entry of cbsEntries) {
      const validation = validateNesting(entry.text);
      const item: Record<string, unknown> = {
        path: entry.path,
        valid: validation.valid,
        opens: validation.openCount,
        closes: validation.closeCount,
      };
      if (!validation.valid) {
        item.errors = validation.errors;
      }

      if (allCombos && validation.valid) {
        const toggleNames = Array.from(extractToggles(entry.text));
        const valueMap: Record<string, string[]> = {};
        for (const toggleName of toggleNames) {
          valueMap[toggleName] = Array.from(extractToggleValues(entry.text, toggleName));
          if (valueMap[toggleName].length === 0) {
            valueMap[toggleName] = ['0', '1'];
          }
        }
        const combos = generateCombinations(toggleNames, valueMap);
        if (combos.length > maxValidateCombos) {
          item.combo_warning = `${combos.length} combinations exceed limit of ${maxValidateCombos}, skipped`;
        } else {
          const comboErrors: string[] = [];
          for (const combo of combos) {
            try {
              const resolved = resolveInnerExpressions(entry.text, combo);
              const parsed = parse(resolved);
              cbsResolve(resolved, parsed.blocks, combo);
            } catch (error) {
              comboErrors.push(`combo ${JSON.stringify(combo)}: ${(error as Error).message}`);
              if (comboErrors.length >= 5) {
                comboErrors.push('... (truncated)');
                break;
              }
            }
          }
          if (comboErrors.length > 0) {
            item.valid = false;
            item.combo_errors = comboErrors;
          }
          item.combos_tested = Math.min(combos.length, maxValidateCombos);
        }
      }

      if (item.valid) {
        passed++;
      } else {
        failed++;
      }
      results.push(item);
    }

    deps.jsonRes(res, {
      valid: failed === 0,
      entries: results,
      summary: { total: results.length, passed, failed },
    });
    return true;
  }

  if (parts[1] === 'toggles' && !parts[2] && req.method === 'GET') {
    const currentData = requireCurrentData(res, deps, 'cbs/toggles');
    if (!currentData) return true;

    const fieldFilter = url.searchParams.get('field') || undefined;
    const lorebookIndex = parseLorebookIndex(url.searchParams.get('lorebook_index'));
    const cbsEntries = collectCbsEntries(currentData, fieldFilter, lorebookIndex);
    const toggleMap: Record<string, { conditions: Set<string>; fields: Set<string> }> = {};

    for (const entry of cbsEntries) {
      for (const toggleName of extractToggles(entry.text)) {
        if (!toggleMap[toggleName]) {
          toggleMap[toggleName] = { conditions: new Set(), fields: new Set() };
        }
        toggleMap[toggleName].fields.add(entry.path);
        for (const value of extractToggleValues(entry.text, toggleName)) {
          toggleMap[toggleName].conditions.add(value);
        }
      }
    }

    const toggles: Record<string, { conditions: string[]; fields: string[] }> = {};
    for (const [name, data] of Object.entries(toggleMap)) {
      toggles[name] = {
        conditions: Array.from(data.conditions).sort(),
        fields: Array.from(data.fields),
      };
    }

    deps.jsonResSuccess(
      res,
      { toggles, count: Object.keys(toggles).length },
      {
        toolName: 'list_cbs_toggles',
        summary: `Found ${Object.keys(toggles).length} CBS toggle(s)`,
        artifacts: { count: Object.keys(toggles).length },
      },
    );
    return true;
  }

  if (parts[1] === 'simulate' && !parts[2] && req.method === 'POST') {
    const currentData = requireCurrentData(res, deps, 'cbs/simulate');
    if (!currentData) return true;

    const body = await deps.readJsonBody(req, res, 'cbs/simulate', deps.broadcastStatus);
    if (!body) return true;

    const field = typeof body.field === 'string' ? body.field : '';
    if (!field) {
      deps.mcpError(res, 400, { action: 'cbs/simulate', target: 'cbs', message: 'field is required' });
      return true;
    }

    const lorebookIndex = typeof body.lorebook_index === 'number' ? body.lorebook_index : undefined;
    const userToggles =
      typeof body.toggles === 'object' && body.toggles !== null && !Array.isArray(body.toggles)
        ? (body.toggles as Record<string, unknown>)
        : {};
    const allCombos = body.all_combos === true;
    const compact = body.compact !== false;
    const maxSimulateCombos = 256;
    const cbsEntries = collectCbsEntries(currentData, field, lorebookIndex);

    if (cbsEntries.length === 0) {
      deps.jsonResSuccess(
        res,
        { field, message: 'No CBS content found in specified field' },
        {
          toolName: 'simulate_cbs',
          summary: `No CBS content found in field "${field}"`,
        },
      );
      return true;
    }

    const entry = cbsEntries[0];
    const text = entry.text;
    const normalizedToggles = normalizeCbsToggles(userToggles);

    if (allCombos) {
      const toggleNames = Array.from(extractToggles(text));
      const valueMap: Record<string, string[]> = {};
      for (const toggleName of toggleNames) {
        valueMap[toggleName] = Array.from(extractToggleValues(text, toggleName));
        if (valueMap[toggleName].length === 0) {
          valueMap[toggleName] = ['0', '1'];
        }
      }
      const combos = generateCombinations(toggleNames, valueMap);
      if (combos.length > maxSimulateCombos) {
        deps.mcpError(res, 400, {
          action: 'cbs/simulate',
          target: 'cbs',
          message: `${combos.length} combinations exceed limit of ${maxSimulateCombos}`,
        });
        return true;
      }

      const results: Record<string, unknown>[] = [];
      for (const combo of combos) {
        try {
          const resolved = resolveInnerExpressions(text, combo);
          const parsed = parse(resolved);
          let result = cbsResolve(resolved, parsed.blocks, combo);
          if (compact) {
            result = result.replace(/\n{3,}/g, '\n\n').trim();
          }
          results.push({
            toggles: combo,
            resolved_length: result.length,
            resolved: result,
          });
        } catch (error) {
          results.push({ toggles: combo, error: (error as Error).message });
        }
      }

      deps.jsonResSuccess(
        res,
        {
          field: entry.path,
          original_length: text.length,
          combos: results.length,
          results,
        },
        {
          toolName: 'simulate_cbs',
          summary: `Simulated CBS for ${entry.path} (${results.length} combos)`,
          artifacts: { combos: results.length, originalLength: text.length },
        },
      );
      return true;
    }

    try {
      const resolved = resolveInnerExpressions(text, normalizedToggles);
      const parsed = parse(resolved);
      let result = cbsResolve(resolved, parsed.blocks, normalizedToggles);
      if (compact) {
        result = result.replace(/\n{3,}/g, '\n\n').trim();
      }

      deps.jsonResSuccess(
        res,
        {
          field: entry.path,
          toggles: normalizedToggles,
          original_length: text.length,
          resolved: result,
          resolved_length: result.length,
        },
        {
          toolName: 'simulate_cbs',
          summary: `Simulated CBS for ${entry.path} (${text.length}→${result.length} chars)`,
          artifacts: { originalLength: text.length, resolvedLength: result.length },
        },
      );
    } catch (error) {
      deps.mcpError(res, 400, {
        action: 'cbs/simulate',
        target: 'cbs',
        message: `CBS resolve error: ${(error as Error).message}`,
      });
    }
    return true;
  }

  if (parts[1] === 'diff' && !parts[2] && req.method === 'POST') {
    const currentData = requireCurrentData(res, deps, 'cbs/diff');
    if (!currentData) return true;

    const body = await deps.readJsonBody(req, res, 'cbs/diff', deps.broadcastStatus);
    if (!body) return true;

    const field = typeof body.field === 'string' ? body.field : '';
    if (!field) {
      deps.mcpError(res, 400, { action: 'cbs/diff', target: 'cbs', message: 'field is required' });
      return true;
    }
    const toggles =
      typeof body.toggles === 'object' && body.toggles !== null && !Array.isArray(body.toggles)
        ? (body.toggles as Record<string, unknown>)
        : null;
    if (!toggles || Object.keys(toggles).length === 0) {
      deps.mcpError(res, 400, { action: 'cbs/diff', target: 'cbs', message: 'toggles is required' });
      return true;
    }

    const lorebookIndex = typeof body.lorebook_index === 'number' ? body.lorebook_index : undefined;
    const cbsEntries = collectCbsEntries(currentData, field, lorebookIndex);
    if (cbsEntries.length === 0) {
      deps.jsonResSuccess(
        res,
        { field, changed: false, message: 'No CBS content found in specified field' },
        {
          toolName: 'diff_cbs',
          summary: `No CBS content found in field "${field}"`,
        },
      );
      return true;
    }

    const entry = cbsEntries[0];
    const text = entry.text;
    const normalizedToggles = normalizeCbsToggles(toggles);
    const baseline: ToggleMap = {};
    for (const toggleName of extractToggles(text)) {
      baseline[toggleName] = '0';
    }

    try {
      const resolvedBase = resolveInnerExpressions(text, baseline);
      const parsedBase = parse(resolvedBase);
      const baseResult = cbsResolve(resolvedBase, parsedBase.blocks, baseline)
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      const resolvedTarget = resolveInnerExpressions(text, normalizedToggles);
      const parsedTarget = parse(resolvedTarget);
      const targetResult = cbsResolve(resolvedTarget, parsedTarget.blocks, normalizedToggles)
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      const baseLines = baseResult.split('\n');
      const targetLines = targetResult.split('\n');
      const added: string[] = [];
      const removed: string[] = [];
      const baseSet = new Set(baseLines);
      const targetSet = new Set(targetLines);

      for (const line of targetLines) {
        if (!baseSet.has(line)) {
          added.push(line);
        }
      }
      for (const line of baseLines) {
        if (!targetSet.has(line)) {
          removed.push(line);
        }
      }

      deps.jsonResSuccess(
        res,
        {
          field: entry.path,
          changed: added.length > 0 || removed.length > 0,
          toggles: normalizedToggles,
          baseline_length: baseResult.length,
          target_length: targetResult.length,
          added_lines: added,
          removed_lines: removed,
        },
        {
          toolName: 'diff_cbs',
          summary: `CBS diff for ${entry.path}: ${added.length} added, ${removed.length} removed`,
          artifacts: { addedCount: added.length, removedCount: removed.length },
        },
      );
    } catch (error) {
      deps.mcpError(res, 400, {
        action: 'cbs/diff',
        target: 'cbs',
        message: `CBS diff error: ${(error as Error).message}`,
      });
    }
    return true;
  }

  return false;
}
