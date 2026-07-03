import * as http from 'http';
import type { ZodType } from 'zod';

import {
  buildFieldInventory,
  getFieldMutationBlock,
  getHiddenFieldReadBlock,
  getRisupStructuredFieldError,
  getRisupStructuredFieldSuggestion,
  logMcpMutation,
  readJsonBody,
  type FieldSnapshot,
  type McpNoOpInfo,
} from './mcp-api-helpers';
import type { McpApiDeps } from './mcp-api-server';
import {
  BOOLEAN_FIELD_NAMES,
  FIELD_RESERVED_PATHS,
  MAX_FIELD_BATCH,
  NUMBER_FIELD_NAMES,
  buildFieldBatchReadResults,
  buildFieldReadResponsePayload,
  getFieldAccessRules,
  getStringMutationFieldStatus,
  getUnknownFieldHint,
} from './mcp-field-access';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';
import {
  batchReplaceBodySchema,
  blockReplaceBodySchema,
  fieldBatchReadSchema,
  fieldBatchWriteSchema,
  insertBodySchema,
  replaceBodySchema,
  searchAllBodySchema,
  searchBodySchema,
} from './mcp-request-schemas';
import { SEARCHABLE_TEXT_FIELDS, searchAllTextSurfaces, searchTextBlock } from './mcp-search';
import { isRisupJsonTextFieldName } from './risup-json-fields';
import { handleSessionStatusRoute } from './mcp-session-routes';
import { cloneJson, normalizeLF } from './shared-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */

type JsonBody = Record<string, unknown>;
type ParseBody = <T>(
  res: http.ServerResponse,
  body: JsonBody,
  schema: ZodType<T>,
  meta: { action: string; target: string; suggestion?: string },
) => T | null;

type FieldApiDeps = Pick<
  McpApiDeps,
  | 'askRendererConfirm'
  | 'broadcastToAll'
  | 'extractPrimaryLua'
  | 'getCurrentFilePath'
  | 'getReferenceFiles'
  | 'getRuntimeInfo'
  | 'getSessionStatus'
  | 'mergePrimaryLua'
  | 'normalizeTriggerScripts'
  | 'stringifyTriggerScripts'
>;

export interface FieldRouteDeps {
  api: FieldApiDeps;
  fieldSnapshots: Map<string, FieldSnapshot[]>;
  acquireFieldMutex: (fieldName: string) => Promise<() => void>;
  getCssSectionCount: (css: string) => number;
  getLuaSectionCount: (lua: string) => number;
  parseBody: ParseBody;
  broadcastStatus: (payload: Record<string, unknown>) => void;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, options: McpSuccessOptions) => void;
  mcpError: (res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown) => void;
  mcpNoOp: (res: http.ServerResponse, info: McpNoOpInfo, extra?: Record<string, unknown>) => void;
}

export async function handleFieldRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  url: URL,
  currentData: Record<string, any>,
  routeDeps: FieldRouteDeps,
): Promise<boolean> {
  const deps = routeDeps.api;
  const {
    acquireFieldMutex,
    broadcastStatus,
    fieldSnapshots,
    getCssSectionCount,
    getLuaSectionCount,
    jsonResSuccess,
    mcpError,
    mcpNoOp,
    parseBody,
  } = routeDeps;

  async function dispatch(): Promise<void | false> {
    // ----------------------------------------------------------------
    // GET /fields
    // ----------------------------------------------------------------
    if (req.method === 'GET' && parts[0] === 'fields' && !parts[1]) {
      const inventory = buildFieldInventory(currentData, deps);
      return jsonResSuccess(
        res,
        {
          fileType: inventory.fileType,
          fields: inventory.fields,
          hiddenFieldWarnings: inventory.hiddenFieldWarnings,
        },
        {
          toolName: 'list_fields',
          summary: `Listed ${inventory.fields.length} fields (${inventory.fileType})`,
          artifacts: { count: inventory.fields.length, fileType: inventory.fileType },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET/POST /field/:name
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && !parts[2] && !FIELD_RESERVED_PATHS.includes(parts[1])) {
      const fieldName = decodeURIComponent(parts[1]);
      const rules = getFieldAccessRules(currentData);
      const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);

      if (!hiddenBlock && !rules.allowedFields.includes(fieldName)) {
        const action = req.method === 'GET' ? 'read field' : 'update field';
        return mcpError(res, 400, {
          action,
          message: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}`,
          suggestion: 'list_fields 또는 GET /field/batch 로 허용된 필드를 다시 확인하세요.',
          target: `field:${fieldName}`,
        });
      }

      if (req.method === 'GET') {
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'read field',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `field:${fieldName}`,
          });
        }
        const readPayload = buildFieldReadResponsePayload(currentData, fieldName, deps);
        return jsonResSuccess(res, readPayload, {
          toolName: 'read_field',
          summary: `Read field "${fieldName}"`,
          artifacts: { fieldName },
        });
      }

      if (req.method === 'POST') {
        if (hiddenBlock) {
          const mutationBlock = getFieldMutationBlock(currentData, fieldName) ?? hiddenBlock;
          return mcpError(res, 400, {
            action: 'update field',
            message: mutationBlock.message,
            suggestion: mutationBlock.suggestion,
            target: `field:${fieldName}`,
          });
        }
        const mutationBlock = getFieldMutationBlock(currentData, fieldName);
        if (mutationBlock) {
          return mcpError(res, 400, {
            action: 'update field',
            message: mutationBlock.message,
            suggestion: mutationBlock.suggestion,
            target: `field:${fieldName}`,
          });
        }
        // Read-only fields check
        if (rules.readOnlyFields.includes(fieldName)) {
          return mcpError(res, 400, {
            action: 'update field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}`, broadcastStatus);
        if (!body) return;
        if (body.content === undefined) {
          return mcpError(res, 400, {
            action: 'update field',
            message: 'Missing "content"',
            suggestion: 'content 필드를 포함한 요청 본문을 보내세요.',
            target: `field:${fieldName}`,
          });
        }
        // Validate content type: must be string or array (for alternateGreetings)
        const arrayFields = ['alternateGreetings'];
        if (arrayFields.includes(fieldName)) {
          if (!Array.isArray(body.content)) {
            return mcpError(res, 400, {
              action: 'update field',
              message: `"${fieldName}" must be an array`,
              suggestion: '문자열 배열 형태로 값을 다시 보내세요.',
              target: `field:${fieldName}`,
            });
          }
        } else if (fieldName !== 'triggerScripts' && typeof body.content !== 'string') {
          return mcpError(res, 400, {
            action: 'update field',
            message: `"${fieldName}" must be a string`,
            suggestion: '문자열 형태로 값을 다시 보내세요.',
            target: `field:${fieldName}`,
          });
        }
        const risupStructuredFieldError = getRisupStructuredFieldError(fieldName, body.content);
        if (risupStructuredFieldError) {
          return mcpError(res, 400, {
            action: 'update field',
            message: `Invalid ${fieldName}: ${risupStructuredFieldError}`,
            suggestion: getRisupStructuredFieldSuggestion(fieldName),
            target: `field:${fieldName}`,
            details: { parseError: risupStructuredFieldError },
          });
        }
        const oldSize =
          fieldName === 'triggerScripts'
            ? deps.stringifyTriggerScripts(currentData.triggerScripts).length
            : Array.isArray(currentData[fieldName])
              ? currentData[fieldName].length
              : (currentData[fieldName] || '').length;
        const newSize =
          fieldName === 'triggerScripts'
            ? String(body.content || '').length
            : Array.isArray(body.content)
              ? body.content.length
              : body.content.length;

        const allowed = await deps.askRendererConfirm(
          'MCP 수정 요청',
          `AI 어시스턴트가 "${fieldName}" 필드를 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`,
        );

        if (allowed) {
          let content = body.content;
          if (fieldName === 'alternateGreetings') {
            content = (content as unknown[]).map((item: unknown) => String(item));
          }
          // Strip <style> wrapper from CSS to prevent nesting
          if (fieldName === 'css') {
            content = content.replace(/^\s*<style[^>]*>\s*/i, '').replace(/\s*<\/style>\s*$/i, '');
          }
          if (fieldName === 'triggerScripts') {
            try {
              currentData.triggerScripts = deps.normalizeTriggerScripts(content);
              currentData.lua = deps.extractPrimaryLua(currentData.triggerScripts);
            } catch (error) {
              return mcpError(
                res,
                400,
                {
                  action: 'update field',
                  message: (error as Error).message,
                  suggestion: 'triggerScripts JSON 구조와 스크립트 배열 형식을 확인하세요.',
                  target: 'field:triggerScripts',
                },
                error,
              );
            }
            logMcpMutation('update field', 'field:triggerScripts', { oldSize, newSize });
            deps.broadcastToAll(
              'data-updated',
              'triggerScripts',
              deps.stringifyTriggerScripts(currentData.triggerScripts),
            );
            deps.broadcastToAll('data-updated', 'lua', currentData.lua);
            const tsSize = deps.stringifyTriggerScripts(currentData.triggerScripts).length;
            return jsonResSuccess(
              res,
              {
                success: true,
                field: fieldName,
                size: tsSize,
              },
              {
                toolName: 'write_field',
                summary: `Updated triggerScripts (${tsSize} chars)`,
                artifacts: { fieldName, size: tsSize },
              },
            );
          }
          currentData[fieldName] = content;
          if (fieldName === 'lua') {
            currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
            deps.broadcastToAll(
              'data-updated',
              'triggerScripts',
              deps.stringifyTriggerScripts(currentData.triggerScripts),
            );
          }
          logMcpMutation('update field', `field:${fieldName}`, { oldSize, newSize });
          deps.broadcastToAll('data-updated', fieldName, content);
          return jsonResSuccess(
            res,
            { success: true, field: fieldName, size: content.length },
            {
              toolName: 'write_field',
              summary: `Updated "${fieldName}" (${oldSize}→${content.length} chars)`,
              artifacts: { fieldName, oldSize, newSize: content.length },
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'update field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 변경 요청을 허용한 뒤 다시 시도하세요.',
            target: `field:${fieldName}`,
          });
        }
      }
    }

    // ----------------------------------------------------------------
    // POST /field/batch — read multiple fields at once
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] === 'batch' && !parts[2] && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'field/batch', broadcastStatus);
      if (!body) return;
      const parsed = parseBody(res, body, fieldBatchReadSchema, {
        action: 'read field batch',
        target: 'field:batch',
        suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "fields": ["name", "description"] }',
      });
      if (!parsed) return;
      const fields = parsed.fields;
      if (fields.length === 0) {
        return mcpError(res, 400, {
          action: 'read field batch',
          message: 'fields must be a non-empty string array',
          suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "fields": ["name", "description"] }',
          target: 'field:batch',
        });
      }
      if (fields.length > MAX_FIELD_BATCH) {
        return mcpError(res, 400, {
          action: 'read field batch',
          message: `Maximum ${MAX_FIELD_BATCH} fields per batch`,
          suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 필드로 나누어 여러 번 호출하세요.`,
          target: 'field:batch',
        });
      }
      const results = buildFieldBatchReadResults(currentData, fields, deps);
      return jsonResSuccess(
        res,
        { count: results.length, fields: results },
        {
          toolName: 'read_field_batch',
          summary: `Read ${results.length} fields`,
          artifacts: { count: results.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /field/batch-write — write multiple fields at once (single confirmation)
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] === 'batch-write' && !parts[2] && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'field/batch-write', broadcastStatus);
      if (!body) return;
      const parsed = parseBody(res, body, fieldBatchWriteSchema, {
        action: 'batch write field',
        target: 'field:batch-write',
        suggestion:
          'entries 를 { field, content } 객체 배열로 전달하세요. 예: { "entries": [{ "field": "name", "content": "새 이름" }] }',
      });
      if (!parsed) return;
      const entries = parsed.entries;
      if (entries.length === 0) {
        return mcpError(res, 400, {
          action: 'batch write field',
          message: 'entries must be a non-empty array of {field, content}',
          suggestion:
            'entries 를 { field, content } 객체 배열로 전달하세요. 예: { "entries": [{ "field": "name", "content": "새 이름" }] }',
          target: 'field:batch-write',
        });
      }
      if (entries.length > MAX_FIELD_BATCH) {
        return mcpError(res, 400, {
          action: 'batch write field',
          message: `Maximum ${MAX_FIELD_BATCH} entries per batch`,
          suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 항목으로 나누어 여러 번 호출하세요.`,
          target: 'field:batch-write',
        });
      }
      // Surface-aware validation (mirrors single-field POST /field/:name)
      const rules = getFieldAccessRules(currentData);
      const readOnlyFields = rules.readOnlyFields;
      const deprecatedFields = rules.deprecatedFields;
      // Exclude complex fields that need special handling
      const excludedFields = ['triggerScripts', 'alternateGreetings', 'lorebook'];
      // Validate all entries before asking for confirmation
      const validatedEntries: Array<{
        field: string;
        content: unknown;
        oldSize: number;
        newSize: number;
        type: string;
      }> = [];
      const boolFields = BOOLEAN_FIELD_NAMES;
      const numFields = NUMBER_FIELD_NAMES;
      const surfaceWritable = new Set(
        rules.allowedFields.filter(
          (field) =>
            !readOnlyFields.includes(field) && !deprecatedFields.includes(field) && !excludedFields.includes(field),
        ),
      );

      for (const entry of entries) {
        if (!entry.field || entry.content === undefined) {
          return mcpError(res, 400, {
            action: 'batch write field',
            message: `각 항목에 "field"와 "content"가 필요합니다.`,
            suggestion: '각 항목을 { "field": "<필드명>", "content": <값> } 형태로 전달하세요.',
            target: 'field:batch-write',
          });
        }
        const mutationBlock = getFieldMutationBlock(currentData, entry.field);
        if (mutationBlock) {
          return mcpError(res, 400, {
            action: 'batch write field',
            message: mutationBlock.message,
            suggestion: mutationBlock.suggestion,
            target: `field:${entry.field}`,
          });
        }
        if (readOnlyFields.includes(entry.field)) {
          return mcpError(res, 400, {
            action: 'batch write field',
            message: `"${entry.field}" 필드는 읽기 전용입니다.`,
            suggestion: `"${entry.field}" 항목을 entries 배열에서 제거하세요. 이 필드는 시스템이 자동 관리합니다.`,
            target: `field:${entry.field}`,
          });
        }
        if (deprecatedFields.includes(entry.field)) {
          return mcpError(res, 400, {
            action: 'batch write field',
            message: `"${entry.field}" 필드는 charx에서 읽기 전용(deprecated)입니다.`,
            suggestion: `이 필드는 수정할 수 없습니다. entries 배열에서 "${entry.field}" 항목을 제거하세요.`,
            target: `field:${entry.field}`,
          });
        }
        if (excludedFields.includes(entry.field)) {
          return mcpError(res, 400, {
            action: 'batch write field',
            message: `"${entry.field}" 필드는 batch-write에서 지원하지 않습니다. write_field를 개별 사용하세요.`,
            suggestion: `"${entry.field}" 항목을 entries에서 제거하고 POST /field/${entry.field} 로 개별 호출하세요.`,
            target: `field:${entry.field}`,
          });
        }
        if (!surfaceWritable.has(entry.field)) {
          return mcpError(res, 400, {
            action: 'batch write field',
            message: `Unknown field: ${entry.field} ${getUnknownFieldHint(rules)}`,
            suggestion: 'list_fields 또는 GET /field/batch 로 허용된 필드를 다시 확인하세요.',
            target: `field:${entry.field}`,
          });
        }
        // Type validation
        let type = 'string';
        if (boolFields.includes(entry.field)) {
          type = 'boolean';
          if (typeof entry.content !== 'boolean') {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `"${entry.field}"는 boolean 타입이어야 합니다.`,
              suggestion: `"${entry.field}" 값을 true 또는 false 로 전달하세요. (현재: ${typeof entry.content})`,
              target: `field:${entry.field}`,
            });
          }
        } else if (numFields.includes(entry.field)) {
          type = 'number';
          if (typeof entry.content !== 'number') {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `"${entry.field}"는 number 타입이어야 합니다.`,
              suggestion: `"${entry.field}" 값을 숫자로 전달하세요. (현재: ${typeof entry.content})`,
              target: `field:${entry.field}`,
            });
          }
        } else if (isRisupJsonTextFieldName(entry.field)) {
          type = 'json';
          if (typeof entry.content !== 'string') {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `"${entry.field}"는 문자열 타입이어야 합니다.`,
              suggestion: `"${entry.field}" 값을 JSON 문자열로 전달하세요. (현재: ${typeof entry.content})`,
              target: `field:${entry.field}`,
            });
          }
          const structuredError = getRisupStructuredFieldError(entry.field, entry.content);
          if (structuredError) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `Invalid ${entry.field}: ${structuredError}`,
              suggestion: getRisupStructuredFieldSuggestion(entry.field),
              target: `field:${entry.field}`,
              details: { parseError: structuredError },
            });
          }
        } else {
          if (typeof entry.content !== 'string') {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `"${entry.field}"는 문자열 타입이어야 합니다.`,
              suggestion: `"${entry.field}" 값을 문자열로 전달하세요. (현재: ${typeof entry.content})`,
              target: `field:${entry.field}`,
            });
          }
        }
        const oldVal = currentData[entry.field];
        const oldSize = type === 'boolean' || type === 'number' ? String(oldVal ?? '').length : (oldVal || '').length;
        const newSize =
          type === 'boolean' || type === 'number' ? String(entry.content).length : (entry.content as string).length;
        validatedEntries.push({ field: entry.field, content: entry.content, oldSize, newSize, type });
      }

      // Build summary for confirmation
      const summary = validatedEntries.map((e) => `• ${e.field}: ${e.oldSize}→${e.newSize}`).join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 필드 일괄 수정 요청',
        `AI 어시스턴트가 ${validatedEntries.length}개 필드를 수정하려 합니다:\n${summary}`,
      );
      if (allowed) {
        const results: Array<{ field: string; success: boolean; oldSize: number; newSize: number }> = [];
        for (const entry of validatedEntries) {
          let content = entry.content;
          // Strip <style> wrapper from CSS
          if (entry.field === 'css' && typeof content === 'string') {
            content = content.replace(/^\s*<style[^>]*>\s*/i, '').replace(/\s*<\/style>\s*$/i, '');
          }
          currentData[entry.field] = content;
          if (entry.field === 'lua') {
            currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
            deps.broadcastToAll(
              'data-updated',
              'triggerScripts',
              deps.stringifyTriggerScripts(currentData.triggerScripts),
            );
          }
          deps.broadcastToAll('data-updated', entry.field, content);
          results.push({ field: entry.field, success: true, oldSize: entry.oldSize, newSize: entry.newSize });
        }
        logMcpMutation('batch write fields', 'field:batch-write', {
          count: results.length,
          fields: results.map((r) => r.field),
        });
        return jsonResSuccess(
          res,
          { success: true, count: results.length, results },
          {
            toolName: 'write_field_batch',
            summary: `Batch-wrote ${results.length} fields`,
            artifacts: { count: results.length, fields: results.map((r) => r.field) },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'batch write field',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 일괄 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: 'field:batch-write',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /field/:name/replace — replace text in a string field
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && parts[2] === 'replace' && !parts[3] && req.method === 'POST') {
      const fieldName = decodeURIComponent(parts[1]);
      const mutationFieldStatus = getStringMutationFieldStatus(fieldName, currentData);
      if (mutationFieldStatus === 'read-only') {
        return mcpError(res, 400, {
          action: 'replace in field',
          message: `"${fieldName}" 필드는 읽기 전용입니다.`,
          suggestion: '이 필드는 수정할 수 없습니다.',
          target: `field:${fieldName}`,
        });
      }
      if (mutationFieldStatus !== 'ok') {
        return mcpError(res, 400, {
          action: 'replace in field',
          message: `"${fieldName}" 필드는 문자열 치환을 지원하지 않습니다.`,
          suggestion:
            '문자열 타입 필드에만 사용 가능합니다. 배열/boolean/number/triggerScripts 필드는 write_field를 사용하세요.',
          target: `field:${fieldName}`,
        });
      }
      const body = await readJsonBody(req, res, `field/${fieldName}/replace`, broadcastStatus);
      if (!body) return;
      const parsed = parseBody(res, body, replaceBodySchema, {
        action: 'replace in field',
        target: `field:${fieldName}`,
        suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
      });
      if (!parsed) return;
      // Acquire mutex to prevent parallel writes on same field
      const release = await acquireFieldMutex(fieldName);
      try {
        const content: string = normalizeLF(currentData[fieldName] || '');
        const findStr: string = normalizeLF(parsed.find);
        const replaceStr: string = parsed.replace !== undefined ? normalizeLF(parsed.replace) : '';
        const useRegex = !!parsed.regex;
        const flags: string = parsed.flags || 'g';
        const dryRun = !!(parsed.dry_run ?? parsed.dryRun);
        let newContent: string;
        let matchCount: number;

        // Collect match positions for dry-run preview
        const matchPositions: Array<{ position: number; match: string }> = [];
        if (useRegex) {
          const re = new RegExp(findStr, flags);
          if (dryRun) {
            let m: RegExpExecArray | null;
            const reExec = new RegExp(findStr, flags.includes('g') ? flags : flags + 'g');
            while ((m = reExec.exec(content)) !== null) {
              matchPositions.push({ position: m.index, match: m[0] });
              if (!reExec.global) break;
            }
            matchCount = matchPositions.length;
          } else {
            const matches = content.match(re);
            matchCount = matches ? matches.length : 0;
          }
          newContent = content.replace(re, replaceStr);
        } else {
          matchCount = 0;
          let searchFrom = 0;
          while (true) {
            const pos = content.indexOf(findStr, searchFrom);
            if (pos === -1) break;
            matchCount++;
            if (dryRun) matchPositions.push({ position: pos, match: findStr });
            searchFrom = pos + findStr.length;
          }
          newContent = content.split(findStr).join(replaceStr);
        }
        if (matchCount === 0) {
          return mcpNoOp(
            res,
            {
              action: 'replace in field',
              message: '일치하는 항목 없음',
              suggestion: 'read_field 또는 search_in_field로 현재 내용을 다시 확인하고 find/regex/flags를 조정하세요.',
              target: `field:${fieldName}`,
            },
            {
              matchCount: 0,
              ...(dryRun ? { dryRun: true } : {}),
            },
          );
        }

        // Dry-run: return match preview without modifying data
        if (dryRun) {
          const contextChars = 60;
          const maxPreviewMatches = 30;
          const previews = matchPositions.slice(0, maxPreviewMatches).map((mp) => {
            const before = content.substring(Math.max(0, mp.position - contextChars), mp.position);
            const after = content.substring(
              mp.position + mp.match.length,
              mp.position + mp.match.length + contextChars,
            );
            return { position: mp.position, match: mp.match.substring(0, 200), before, after };
          });
          return jsonResSuccess(
            res,
            {
              dryRun: true,
              field: fieldName,
              matchCount,
              fieldLength: content.length,
              previews,
              newSize: newContent.length,
            },
            {
              toolName: 'replace_in_field',
              summary: `Dry-run: ${matchCount} match(es) in "${fieldName}"`,
              artifacts: { matchCount, fieldLength: content.length },
            },
          );
        }

        const allowed = await deps.askRendererConfirm(
          'MCP 필드 치환 요청',
          `AI 어시스턴트가 "${fieldName}" 필드에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
        );
        if (allowed) {
          currentData[fieldName] = newContent;
          if (fieldName === 'lua') {
            currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
            deps.broadcastToAll(
              'data-updated',
              'triggerScripts',
              deps.stringifyTriggerScripts(currentData.triggerScripts),
            );
          }
          logMcpMutation('replace in field', `field:${fieldName}`, { matchCount });
          deps.broadcastToAll('data-updated', fieldName, newContent);
          return jsonResSuccess(
            res,
            {
              success: true,
              field: fieldName,
              matchCount,
              oldSize: content.length,
              newSize: newContent.length,
            },
            {
              toolName: 'replace_in_field',
              summary: `Replaced ${matchCount} match(es) in "${fieldName}" (${content.length}→${newContent.length})`,
              artifacts: { fieldName, matchCount, oldSize: content.length, newSize: newContent.length },
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'replace in field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
            target: `field:${fieldName}`,
          });
        }
      } finally {
        release();
      }
    }

    // ----------------------------------------------------------------
    // POST /field/:name/block-replace — replace a multiline block between two anchors
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && parts[2] === 'block-replace' && !parts[3] && req.method === 'POST') {
      const fieldName = decodeURIComponent(parts[1]);
      const mutationFieldStatus = getStringMutationFieldStatus(fieldName, currentData);
      if (mutationFieldStatus === 'read-only') {
        return mcpError(res, 400, {
          action: 'block replace in field',
          message: `"${fieldName}" 필드는 읽기 전용입니다.`,
          suggestion: '이 필드는 수정할 수 없습니다.',
          target: `field:${fieldName}`,
        });
      }
      if (mutationFieldStatus !== 'ok') {
        return mcpError(res, 400, {
          action: 'block replace in field',
          message: `"${fieldName}" 필드는 블록 치환을 지원하지 않습니다.`,
          suggestion: '문자열 타입 필드에만 사용 가능합니다.',
          target: `field:${fieldName}`,
        });
      }
      const body = await readJsonBody(req, res, `field/${fieldName}/block-replace`, broadcastStatus);
      if (!body) return;
      const parsed = parseBody(res, body, blockReplaceBodySchema, {
        action: 'block replace in field',
        target: `field:${fieldName}`,
        suggestion: '블록의 시작과 끝을 나타내는 앵커 문자열이 필요합니다.',
      });
      if (!parsed) return;
      const release = await acquireFieldMutex(fieldName);
      try {
        const content = normalizeLF(currentData[fieldName] || '');
        const startAnchor = normalizeLF(parsed.start_anchor);
        const endAnchor = normalizeLF(parsed.end_anchor);
        const newBlock: string = parsed.content !== undefined ? normalizeLF(parsed.content) : '';
        const includeAnchors = parsed.include_anchors !== false; // default true: anchors are replaced too
        const dryRun = !!(parsed.dry_run ?? parsed.dryRun);

        const startPos = content.indexOf(startAnchor);
        if (startPos === -1) {
          return mcpNoOp(res, {
            action: 'block replace in field',
            message: `시작 앵커를 찾을 수 없음: ${startAnchor.substring(0, 80)}`,
            suggestion:
              'read_field 또는 read_field_range로 현재 내용을 확인해 start_anchor/end_anchor를 다시 지정하세요.',
            target: `field:${fieldName}`,
          });
        }
        const searchAfter = startPos + startAnchor.length;
        const endPos = content.indexOf(endAnchor, searchAfter);
        if (endPos === -1) {
          return mcpNoOp(
            res,
            {
              action: 'block replace in field',
              message: `끝 앵커를 찾을 수 없음 (시작 앵커 이후): ${endAnchor.substring(0, 80)}`,
              suggestion:
                'read_field 또는 read_field_range로 현재 내용을 확인해 start_anchor/end_anchor를 다시 지정하세요.',
              target: `field:${fieldName}`,
            },
            { startAnchorFoundAt: startPos },
          );
        }

        // Determine what range to replace
        let replaceStart: number, replaceEnd: number;
        if (includeAnchors) {
          replaceStart = startPos;
          replaceEnd = endPos + endAnchor.length;
        } else {
          replaceStart = startPos + startAnchor.length;
          replaceEnd = endPos;
        }
        const oldBlock = content.slice(replaceStart, replaceEnd);
        const newContent = content.slice(0, replaceStart) + newBlock + content.slice(replaceEnd);

        if (dryRun) {
          return jsonResSuccess(
            res,
            {
              dryRun: true,
              field: fieldName,
              startAnchorAt: startPos,
              endAnchorAt: endPos,
              includeAnchors,
              oldBlockSize: oldBlock.length,
              oldBlockPreview: oldBlock.substring(0, 300) + (oldBlock.length > 300 ? '...' : ''),
              newBlockSize: newBlock.length,
              newBlockPreview: newBlock.substring(0, 300) + (newBlock.length > 300 ? '...' : ''),
              fieldLength: content.length,
              newFieldLength: newContent.length,
            },
            {
              toolName: 'replace_block_in_field',
              summary: `Dry-run: block in "${fieldName}" (${oldBlock.length}→${newBlock.length} chars)`,
              artifacts: { oldBlockSize: oldBlock.length, newBlockSize: newBlock.length },
            },
          );
        }

        const allowed = await deps.askRendererConfirm(
          'MCP 블록 치환 요청',
          `AI 어시스턴트가 "${fieldName}" 필드에서 블록 치환하려 합니다.\n시작: ${startAnchor.substring(0, 60)}\n끝: ${endAnchor.substring(0, 60)}\n블록 크기: ${oldBlock.length}→${newBlock.length}자`,
        );
        if (allowed) {
          currentData[fieldName] = newContent;
          if (fieldName === 'lua') {
            currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
            deps.broadcastToAll(
              'data-updated',
              'triggerScripts',
              deps.stringifyTriggerScripts(currentData.triggerScripts),
            );
          }
          logMcpMutation('block replace in field', `field:${fieldName}`, {
            startAnchorAt: startPos,
            endAnchorAt: endPos,
            oldBlockSize: oldBlock.length,
            newBlockSize: newBlock.length,
          });
          deps.broadcastToAll('data-updated', fieldName, newContent);
          return jsonResSuccess(
            res,
            {
              success: true,
              field: fieldName,
              startAnchorAt: startPos,
              endAnchorAt: endPos,
              includeAnchors,
              oldBlockSize: oldBlock.length,
              newBlockSize: newBlock.length,
              oldSize: content.length,
              newSize: newContent.length,
            },
            {
              toolName: 'replace_block_in_field',
              summary: `Replaced block in "${fieldName}" (${oldBlock.length}→${newBlock.length} chars)`,
              artifacts: { oldBlockSize: oldBlock.length, newBlockSize: newBlock.length },
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'block replace in field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 블록 치환 요청을 허용한 뒤 다시 시도하세요.',
            target: `field:${fieldName}`,
          });
        }
      } finally {
        release();
      }
    }

    // ----------------------------------------------------------------
    // POST /field/:name/insert — insert text into a string field
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && parts[2] === 'insert' && !parts[3] && req.method === 'POST') {
      const fieldName = decodeURIComponent(parts[1]);
      const mutationFieldStatus = getStringMutationFieldStatus(fieldName, currentData);
      if (mutationFieldStatus === 'read-only') {
        return mcpError(res, 400, {
          action: 'insert in field',
          message: `"${fieldName}" 필드는 읽기 전용입니다.`,
          suggestion: '이 필드는 수정할 수 없습니다.',
          target: `field:${fieldName}`,
        });
      }
      if (mutationFieldStatus !== 'ok') {
        return mcpError(res, 400, {
          action: 'insert in field',
          message: `"${fieldName}" 필드는 텍스트 삽입을 지원하지 않습니다.`,
          suggestion:
            '문자열 타입 필드에만 사용 가능합니다. 배열/boolean/number/triggerScripts 필드는 write_field를 사용하세요.',
          target: `field:${fieldName}`,
        });
      }
      const body = await readJsonBody(req, res, `field/${fieldName}/insert`, broadcastStatus);
      if (!body) return;
      const parsed = parseBody(res, body, insertBodySchema, {
        action: 'insert in field',
        target: `field:${fieldName}`,
        suggestion: '삽입할 content를 요청 본문에 포함하세요.',
      });
      if (!parsed) return;
      // Acquire mutex to prevent parallel writes on same field
      const release = await acquireFieldMutex(fieldName);
      try {
        const oldContent: string = normalizeLF(currentData[fieldName] || '');
        let newContent: string;
        const position: string = parsed.position || 'end';
        const insertContent = normalizeLF(parsed.content);
        if (position === 'end') {
          newContent = oldContent + '\n' + insertContent;
        } else if (position === 'start') {
          newContent = insertContent + '\n' + oldContent;
        } else if ((position === 'after' || position === 'before') && parsed.anchor) {
          const anchorPos = oldContent.indexOf(normalizeLF(parsed.anchor));
          if (anchorPos === -1) {
            return mcpNoOp(res, {
              action: 'insert in field',
              message: `앵커 문자열을 찾을 수 없음: ${parsed.anchor.substring(0, 80)}`,
              suggestion:
                'read_field 또는 read_field_range로 현재 내용을 확인해 anchor 문자열을 다시 지정하거나 position을 start/end로 변경하세요.',
              target: `field:${fieldName}`,
            });
          }
          if (position === 'after') {
            const insertAt = anchorPos + normalizeLF(parsed.anchor).length;
            newContent = oldContent.slice(0, insertAt) + '\n' + insertContent + oldContent.slice(insertAt);
          } else {
            newContent = oldContent.slice(0, anchorPos) + insertContent + '\n' + oldContent.slice(anchorPos);
          }
        } else {
          return mcpError(res, 400, {
            action: 'insert in field',
            message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
            suggestion:
              'anchor 에 삽입 위치를 지정하는 텍스트를 전달하세요. 예: { "position": "after", "anchor": "기준 텍스트" }',
            target: `field:${fieldName}`,
          });
        }
        const preview = parsed.content.substring(0, 100) + (parsed.content.length > 100 ? '...' : '');
        const allowed = await deps.askRendererConfirm(
          'MCP 필드 삽입 요청',
          `AI 어시스턴트가 "${fieldName}" 필드에 내용을 삽입하려 합니다.\n위치: ${position}${parsed.anchor ? ' "' + parsed.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
        );
        if (allowed) {
          currentData[fieldName] = newContent;
          if (fieldName === 'lua') {
            currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
            deps.broadcastToAll(
              'data-updated',
              'triggerScripts',
              deps.stringifyTriggerScripts(currentData.triggerScripts),
            );
          }
          logMcpMutation('insert in field', `field:${fieldName}`, {
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
          });
          deps.broadcastToAll('data-updated', fieldName, newContent);
          return jsonResSuccess(
            res,
            {
              success: true,
              field: fieldName,
              position,
              oldSize: oldContent.length,
              newSize: newContent.length,
            },
            {
              toolName: 'insert_in_field',
              summary: `Inserted into "${fieldName}" at ${position} (${oldContent.length}→${newContent.length} chars)`,
              artifacts: { oldSize: oldContent.length, newSize: newContent.length },
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'insert in field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 삽입 요청을 허용한 뒤 다시 시도하세요.',
            target: `field:${fieldName}`,
          });
        }
      } finally {
        release();
      }
    }

    // ----------------------------------------------------------------
    // POST /field/:name/batch-replace — sequential multi-replace on same field
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && parts[2] === 'batch-replace' && !parts[3] && req.method === 'POST') {
      const fieldName = decodeURIComponent(parts[1]);
      const mutationFieldStatus = getStringMutationFieldStatus(fieldName, currentData);
      if (mutationFieldStatus === 'read-only') {
        return mcpError(res, 400, {
          action: 'batch replace in field',
          message: `"${fieldName}" 필드는 읽기 전용입니다.`,
          suggestion: '이 필드는 수정할 수 없습니다.',
          target: `field:${fieldName}`,
        });
      }
      if (mutationFieldStatus !== 'ok') {
        return mcpError(res, 400, {
          action: 'batch replace in field',
          message: `"${fieldName}" 필드는 문자열 치환을 지원하지 않습니다.`,
          suggestion: '문자열 타입 필드에만 사용 가능합니다.',
          target: `field:${fieldName}`,
        });
      }
      const body = await readJsonBody(req, res, `field/${fieldName}/batch-replace`, broadcastStatus);
      if (!body) return;
      const parsed = parseBody(res, body, batchReplaceBodySchema, {
        action: 'batch replace in field',
        target: `field:${fieldName}`,
        suggestion:
          'replacements 를 { find, replace } 객체 배열로 전달하세요. 예: { "replacements": [{ "find": "old", "replace": "new" }] }',
      });
      if (!parsed) return;
      const replacements = parsed.replacements;
      if (replacements.length === 0) {
        return mcpError(res, 400, {
          action: 'batch replace in field',
          message: 'replacements must be a non-empty array',
          suggestion:
            'replacements 를 { find, replace } 객체 배열로 전달하세요. 예: { "replacements": [{ "find": "old", "replace": "new" }] }',
          target: `field:${fieldName}`,
        });
      }
      const MAX_BATCH = 50;
      if (replacements.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch replace in field',
          message: `Maximum ${MAX_BATCH} replacements per batch`,
          suggestion: `요청을 ${MAX_BATCH}개 이하의 치환으로 나누어 여러 번 호출하세요.`,
          target: `field:${fieldName}`,
        });
      }
      const dryRun = !!(parsed.dry_run ?? parsed.dryRun);
      // Acquire mutex to prevent parallel writes
      const release = await acquireFieldMutex(fieldName);
      try {
        let content: string = normalizeLF(currentData[fieldName] || '');
        const originalSize = content.length;
        // Apply replacements sequentially, collecting match info
        const results = replacements.map((r) => {
          const findStr: string = normalizeLF(r.find);
          const replaceStr: string = r.replace !== undefined ? normalizeLF(r.replace) : '';
          const useRegex = !!r.regex;
          const flags: string = r.flags || 'g';
          let matchCount: number;
          if (useRegex) {
            const re = new RegExp(findStr, flags);
            const matches = content.match(re);
            matchCount = matches ? matches.length : 0;
            content = content.replace(re, replaceStr);
          } else {
            matchCount = 0;
            let searchFrom = 0;
            while (true) {
              const pos = content.indexOf(findStr, searchFrom);
              if (pos === -1) break;
              matchCount++;
              searchFrom = pos + findStr.length;
            }
            content = content.split(findStr).join(replaceStr);
          }
          return { find: findStr.substring(0, 80), matchCount };
        });
        const totalMatches = results.reduce((s, r) => s + r.matchCount, 0);
        if (totalMatches === 0) {
          return mcpNoOp(
            res,
            {
              action: 'batch replace in field',
              message: '모든 치환에서 일치하는 항목 없음',
              suggestion: 'results를 확인하고 각 find/replace/regex/flags를 조정한 뒤 다시 시도하세요.',
              target: `field:${fieldName}`,
            },
            {
              results,
              ...(dryRun ? { dryRun: true } : {}),
            },
          );
        }
        if (dryRun) {
          return jsonResSuccess(
            res,
            {
              dryRun: true,
              field: fieldName,
              totalMatches,
              originalSize,
              newSize: content.length,
              results,
            },
            {
              toolName: 'replace_in_field_batch',
              summary: `Dry-run: ${totalMatches} total match(es) in "${fieldName}"`,
              artifacts: { totalMatches, fieldLength: originalSize },
            },
          );
        }
        const summary = results
          .filter((r) => r.matchCount > 0)
          .map((r) => `  "${r.find}": ${r.matchCount}건`)
          .join('\n');
        const allowed = await deps.askRendererConfirm(
          'MCP 필드 일괄 치환 요청',
          `AI 어시스턴트가 "${fieldName}" 필드에서 ${replacements.length}개 치환 (총 ${totalMatches}건)을 적용하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
        );
        if (allowed) {
          currentData[fieldName] = content;
          if (fieldName === 'lua') {
            currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
            deps.broadcastToAll(
              'data-updated',
              'triggerScripts',
              deps.stringifyTriggerScripts(currentData.triggerScripts),
            );
          }
          logMcpMutation('batch replace in field', `field:${fieldName}`, {
            totalMatches,
            count: replacements.length,
          });
          deps.broadcastToAll('data-updated', fieldName, content);
          return jsonResSuccess(
            res,
            {
              success: true,
              field: fieldName,
              totalMatches,
              originalSize,
              newSize: content.length,
              results,
            },
            {
              toolName: 'replace_in_field_batch',
              summary: `Batch replaced ${totalMatches} match(es) in "${fieldName}"`,
              artifacts: { totalMatches, originalSize, newSize: content.length },
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'batch replace in field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 일괄 치환 요청을 허용한 뒤 다시 시도하세요.',
            target: `field:${fieldName}`,
          });
        }
      } finally {
        release();
      }
    }

    // ----------------------------------------------------------------
    // POST /search-all — search across string fields, greetings, lorebook
    // ----------------------------------------------------------------
    if (parts[0] === 'search-all' && !parts[1] && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'search-all', broadcastStatus);
      if (!body) return;
      const parsed = parseBody(res, body, searchAllBodySchema, {
        action: 'search all fields',
        target: '/search-all',
        suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
      });
      if (!parsed) return;

      try {
        const searchResult = searchAllTextSurfaces(currentData, {
          query: normalizeLF(String(parsed.query)),
          regex: !!parsed.regex,
          flags: parsed.flags,
          includeLorebook: parsed.include_lorebook !== false,
          includeGreetings: parsed.include_greetings !== false,
          contextChars: Math.max(0, Math.min(Number(parsed.context_chars) || 60, 300)),
          maxMatchesPerSurface: Math.max(1, Math.min(Number(parsed.max_matches_per_field) || 5, 20)),
          maxMatchesTotal:
            parsed.max_matches_total === undefined
              ? undefined
              : Math.max(1, Math.min(Number(parsed.max_matches_total) || 1, 100)),
        });
        const totalHits = Array.isArray(searchResult.surfaces)
          ? (searchResult.surfaces as Array<{ totalMatches?: number }>).reduce(
              (sum, s) => sum + (s.totalMatches || 0),
              0,
            )
          : 0;
        return jsonResSuccess(res, searchResult as unknown as Record<string, unknown>, {
          toolName: 'search_all_fields',
          summary: `Searched all fields: ${totalHits} total match(es)`,
          artifacts: { totalMatches: totalHits },
        });
      } catch (err) {
        return mcpError(res, 400, {
          action: 'search all fields',
          message: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
          target: '/search-all',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /field/:name/search — search text in a string field (read-only)
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && parts[2] === 'search' && !parts[3] && req.method === 'POST') {
      const fieldName = decodeURIComponent(parts[1]);
      const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'search in field',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `field:${fieldName}`,
        });
      }
      if (!SEARCHABLE_TEXT_FIELDS.includes(fieldName as (typeof SEARCHABLE_TEXT_FIELDS)[number])) {
        return mcpError(res, 400, {
          action: 'search in field',
          message: `"${fieldName}" 필드는 검색을 지원하지 않습니다.`,
          suggestion: '문자열 타입 필드에만 사용 가능합니다.',
          target: `field:${fieldName}`,
        });
      }
      const body = await readJsonBody(req, res, `field/${fieldName}/search`, broadcastStatus);
      if (!body) return;
      const parsed = parseBody(res, body, searchBodySchema, {
        action: 'search in field',
        target: `field:${fieldName}`,
        suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
      });
      if (!parsed) return;
      const content: string = normalizeLF(
        typeof currentData[fieldName] === 'string' ? currentData[fieldName] : String(currentData[fieldName] ?? ''),
      );
      const queryStr: string = normalizeLF(String(parsed.query));
      const contextChars: number = Math.max(0, Math.min(Number(parsed.context_chars) || 100, 500));
      const maxMatches: number = Math.max(1, Math.min(Number(parsed.max_matches) || 20, 100));
      const useRegex = !!parsed.regex;
      const flags = parsed.flags ?? (useRegex ? 'gi' : undefined);

      try {
        const result = searchTextBlock(content, {
          query: queryStr,
          regex: useRegex,
          flags,
          contextChars,
          maxMatches,
        });

        return jsonResSuccess(
          res,
          {
            field: fieldName,
            query: result.query,
            totalMatches: result.totalMatches,
            returnedMatches: result.returnedMatches,
            fieldLength: result.contentLength,
            matches: result.matches,
          },
          {
            toolName: 'search_in_field',
            summary: `Found ${result.totalMatches} match(es) in "${fieldName}"`,
            artifacts: { fieldName, totalMatches: result.totalMatches },
          },
        );
      } catch (err) {
        return mcpError(res, 400, {
          action: 'search in field',
          message: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
          target: `field:${fieldName}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // GET /field/:name/range — read a substring of a field (read-only)
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && parts[2] === 'range' && !parts[3] && req.method === 'GET') {
      const fieldName = decodeURIComponent(parts[1]);
      const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'read field range',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `field:${fieldName}`,
        });
      }
      const rangeReadableFields = [
        'name',
        'description',
        'firstMessage',
        'globalNote',
        'css',
        'defaultVariables',
        'lua',
        'personality',
        'scenario',
        'creatorcomment',
        'exampleMessage',
        'systemPrompt',
        'creator',
        'characterVersion',
        'nickname',
        'additionalText',
        'license',
        'cjs',
        'backgroundEmbedding',
        'moduleNamespace',
        'customModuleToggle',
        'mcpUrl',
        'moduleName',
        'moduleDescription',
        'mainPrompt',
        'jailbreak',
        'aiModel',
        'subModel',
        'apiType',
        'instructChatTemplate',
        'JinjaTemplate',
        'templateDefaultVariables',
        'moduleIntergration',
        'jsonSchema',
        'extractJson',
        'groupTemplate',
        'groupOtherBotRole',
        'autoSuggestPrompt',
        'autoSuggestPrefix',
        'systemContentReplacement',
        'systemRoleReplacement',
        'creationDate',
        'modificationDate',
        'moduleId',
      ];
      if (!rangeReadableFields.includes(fieldName)) {
        return mcpError(res, 400, {
          action: 'read field range',
          message: `"${fieldName}" 필드는 범위 읽기를 지원하지 않습니다.`,
          suggestion: '문자열 타입 필드에만 사용 가능합니다.',
          target: `field:${fieldName}`,
        });
      }
      const content: string =
        typeof currentData[fieldName] === 'string' ? currentData[fieldName] : String(currentData[fieldName] ?? '');
      const MAX_RANGE_LENGTH = 10000;
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const length = Math.max(1, Math.min(Number(url.searchParams.get('length')) || 2000, MAX_RANGE_LENGTH));
      const slice = content.slice(offset, offset + length);
      return jsonResSuccess(
        res,
        {
          field: fieldName,
          totalLength: content.length,
          offset,
          length: slice.length,
          hasMore: offset + length < content.length,
          content: slice,
        },
        {
          toolName: 'read_field_range',
          summary: `Read ${slice.length} chars from "${fieldName}" at offset ${offset}`,
          artifacts: { fieldName, offset, length: slice.length, totalLength: content.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /field/:name/snapshot — save current field value as a snapshot
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && parts[2] === 'snapshot' && !parts[3] && req.method === 'POST') {
      const fieldName = decodeURIComponent(parts[1]);
      const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'snapshot field',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `field:${fieldName}`,
        });
      }
      const content = currentData[fieldName];
      if (content === undefined) {
        return mcpError(res, 400, {
          action: 'snapshot field',
          message: `"${fieldName}" 필드를 찾을 수 없습니다.`,
          target: `field:${fieldName}`,
        });
      }
      const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const snapshot = {
        id: snapshotId,
        field: fieldName,
        timestamp: new Date().toISOString(),
        size: typeof content === 'string' ? content.length : JSON.stringify(content).length,
        content: typeof content === 'string' ? content : cloneJson(content),
      };
      if (!fieldSnapshots.has(fieldName)) fieldSnapshots.set(fieldName, []);
      const snaps = fieldSnapshots.get(fieldName)!;
      snaps.push(snapshot);
      // Keep max 10 snapshots per field
      if (snaps.length > 10) snaps.shift();
      return jsonResSuccess(
        res,
        {
          success: true,
          snapshotId,
          field: fieldName,
          size: snapshot.size,
          timestamp: snapshot.timestamp,
          totalSnapshots: snaps.length,
        },
        {
          toolName: 'snapshot_field',
          summary: `Snapshot created for "${fieldName}" (${snapshot.size} chars)`,
          artifacts: { fieldName, snapshotId, size: snapshot.size },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /field/:name/snapshots — list snapshots for a field
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && parts[2] === 'snapshots' && !parts[3] && req.method === 'GET') {
      const fieldName = decodeURIComponent(parts[1]);
      const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'list snapshots',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `field:${fieldName}`,
        });
      }
      const snaps = fieldSnapshots.get(fieldName) || [];
      return jsonResSuccess(
        res,
        {
          field: fieldName,
          count: snaps.length,
          snapshots: snaps.map((s) => ({ id: s.id, timestamp: s.timestamp, size: s.size })),
        },
        {
          toolName: 'list_snapshots',
          summary: `${snaps.length} snapshot(s) for "${fieldName}"`,
          artifacts: { fieldName, count: snaps.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /session/status — inspect the current MCP-visible session state
    // ----------------------------------------------------------------
    if (
      await handleSessionStatusRoute(req, res, parts, currentData as Record<string, unknown> | null, fieldSnapshots, {
        getCurrentFilePath: deps.getCurrentFilePath,
        getReferenceFiles: deps.getReferenceFiles,
        getSessionStatus: deps.getSessionStatus,
        getRuntimeInfo: deps.getRuntimeInfo,
        normalizeTriggerScripts: deps.normalizeTriggerScripts,
        getCssSectionCount,
        getLuaSectionCount,
        jsonResSuccess,
      })
    ) {
      return;
    }

    // ----------------------------------------------------------------
    // POST /field/:name/restore — restore a field from a snapshot
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && parts[2] === 'restore' && !parts[3] && req.method === 'POST') {
      const fieldName = decodeURIComponent(parts[1]);
      const body = await readJsonBody(req, res, `field/${fieldName}/restore`, broadcastStatus);
      if (!body) return;
      const snapshotId: string = body.snapshot_id;
      if (!snapshotId) {
        return mcpError(res, 400, {
          action: 'restore field',
          message: 'Missing "snapshot_id"',
          suggestion: 'list_snapshots로 스냅샷 ID를 확인한 뒤 전달하세요.',
          target: `field:${fieldName}`,
        });
      }
      const snaps = fieldSnapshots.get(fieldName) || [];
      const snapshot = snaps.find((s) => s.id === snapshotId);
      if (!snapshot) {
        return mcpError(res, 400, {
          action: 'restore field',
          message: `스냅샷을 찾을 수 없음: ${snapshotId}`,
          suggestion: 'list_snapshots로 유효한 스냅샷 ID를 확인하세요.',
          target: `field:${fieldName}`,
        });
      }
      const currentSize =
        typeof currentData[fieldName] === 'string'
          ? currentData[fieldName].length
          : JSON.stringify(currentData[fieldName] ?? '').length;
      const allowed = await deps.askRendererConfirm(
        'MCP 스냅샷 복원 요청',
        `AI 어시스턴트가 "${fieldName}" 필드를 스냅샷으로 복원하려 합니다.\n스냅샷: ${snapshotId}\n시점: ${snapshot.timestamp}\n현재 크기: ${currentSize}자 → 스냅샷 크기: ${snapshot.size}자`,
      );
      if (allowed) {
        currentData[fieldName] = typeof snapshot.content === 'string' ? snapshot.content : cloneJson(snapshot.content);
        if (fieldName === 'lua') {
          currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
          deps.broadcastToAll(
            'data-updated',
            'triggerScripts',
            deps.stringifyTriggerScripts(currentData.triggerScripts),
          );
        }
        logMcpMutation('restore field snapshot', `field:${fieldName}`, {
          snapshotId,
          restoredSize: snapshot.size,
        });
        deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
        return jsonResSuccess(
          res,
          {
            success: true,
            field: fieldName,
            snapshotId,
            restoredSize: snapshot.size,
            timestamp: snapshot.timestamp,
          },
          {
            toolName: 'restore_snapshot',
            summary: `Restored "${fieldName}" from snapshot ${snapshotId} (${snapshot.size} chars)`,
            artifacts: { fieldName, snapshotId, restoredSize: snapshot.size },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'restore field',
          message: '사용자가 거부했습니다',
          rejected: true,
          target: `field:${fieldName}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // GET /field/:name/stats — get field statistics (read-only)
    // ----------------------------------------------------------------
    if (parts[0] === 'field' && parts[1] && parts[2] === 'stats' && !parts[3] && req.method === 'GET') {
      const fieldName = decodeURIComponent(parts[1]);
      const raw = currentData[fieldName];
      if (raw === undefined) {
        return mcpError(res, 400, {
          action: 'get field stats',
          message: `"${fieldName}" 필드를 찾을 수 없습니다.`,
          target: `field:${fieldName}`,
        });
      }
      if (typeof raw !== 'string') {
        return jsonResSuccess(
          res,
          {
            field: fieldName,
            type: Array.isArray(raw) ? 'array' : typeof raw,
            size: JSON.stringify(raw).length,
          },
          {
            toolName: 'get_field_stats',
            summary: `Stats for "${fieldName}" (${Array.isArray(raw) ? 'array' : typeof raw})`,
            artifacts: { fieldName },
          },
        );
      }
      const content = raw as string;
      const lines = content.split('\n');
      const words = content.split(/\s+/).filter((w) => w.length > 0);
      // Count CBS tags
      const cbsTags = (content.match(/\{\{[^}]+\}\}/g) || []).length;
      // Count HTML tags
      const htmlTags = (content.match(/<[^>]+>/g) || []).length;
      return jsonResSuccess(
        res,
        {
          field: fieldName,
          type: 'string',
          characters: content.length,
          lines: lines.length,
          words: words.length,
          cbsTags,
          htmlTags,
          emptyLines: lines.filter((l) => l.trim() === '').length,
          longestLine: Math.max(...lines.map((l) => l.length)),
        },
        {
          toolName: 'get_field_stats',
          summary: `Stats for "${fieldName}" (${content.length} chars, ${lines.length} lines)`,
          artifacts: { fieldName, characters: content.length, lines: lines.length },
        },
      );
    }

    return false;
  }

  const handled = await dispatch();
  return handled !== false;
}
