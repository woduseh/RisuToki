import { parseLorebookDecorators, type PreviewLoreDecorators } from './lorebook-decorators';
import type { PreviewLorebookEntry, PreviewLoreMatch, PreviewMessage, PreviewRegexScript } from './preview-session';

export interface RegexTraceEntry {
  index: number;
  comment: string;
  mode: string;
  order: number;
  flags: string;
  matchCount: number;
  changed: boolean;
  before: string;
  after: string;
  error?: string;
}

export interface RegexPipelineResult {
  original: string;
  result: string;
  mode: string;
  ok: boolean;
  trace: RegexTraceEntry[];
}

export interface LorebookSimulationMatch extends PreviewLoreMatch {
  activationPass: number;
  triggeredBy: Array<{ type: 'chat' } | { type: 'lorebook'; index: number }>;
  content?: string;
  comment?: string;
}

export interface LorebookSimulationResult {
  matches: LorebookSimulationMatch[];
  passes: number;
  recursive: boolean;
  maxPasses: number;
  truncatedRecursiveScan: boolean;
  probabilityMode: 'deterministic-preview';
  tokenBudgetApplied: false;
}

export interface LorebookMatchOptions {
  onRegexError?: (error: { entryIndex: number; key: string; message: string }) => void;
  signal?: AbortSignal;
}

type LoreRuntimeEntry = PreviewLorebookEntry & {
  content?: string;
  insertorder?: number;
  order?: number;
  secondkey?: string;
  selective?: boolean;
  useRegex?: boolean;
  activationPercent?: number | null;
};

type LoreMatchWithEntry = PreviewLoreMatch & { entry: LoreRuntimeEntry };

function extractRegexOrder(flagStr: string): number {
  const match = flagStr.match(/<order\s+(\d+)>/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function extractRegexActions(flagStr: string): string[] {
  return [...flagStr.matchAll(/<(.+?)>/g)].flatMap((match) =>
    match[1]
      .split(',')
      .map((action) => action.trim())
      .filter((action) => action && !action.startsWith('order ')),
  );
}

function regexFlags(script: PreviewRegexScript): string {
  let flags = String(script.ableFlag === true ? (script.flag ?? script.flags ?? 'g') : 'g')
    .replace(/<.+?>/g, '')
    .split('')
    .filter((character) => 'dgimsuvy'.includes(character))
    .join('');
  if (!flags) flags = 'g';
  return [...new Set(flags)].join('');
}

function countRegexMatches(text: string, regex: RegExp): number {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  return [...text.matchAll(new RegExp(regex.source, flags))].length;
}

export function runRegexPipeline(
  text: string,
  scripts: PreviewRegexScript[],
  mode: string,
  selectedIndices?: number[],
  signal?: AbortSignal,
): RegexPipelineResult {
  const original = text;
  const modeLower = mode.toLowerCase();
  const selected = selectedIndices ? new Set(selectedIndices) : null;
  const ordered = scripts
    .map((script, index) => ({
      script,
      index: typeof script.__mcpIndex === 'number' ? script.__mcpIndex : index,
    }))
    .filter(({ script, index }) => {
      const type = String(script.type || '').toLowerCase();
      return (
        (!selected || selected.has(index)) && type === modeLower && type !== 'disabled' && !!(script.find || script.in)
      );
    })
    .sort(({ script: a }, { script: b }) => {
      const orderA = (a.replaceOrder as number | undefined) ?? extractRegexOrder(String(a.flag ?? a.flags ?? ''));
      const orderB = (b.replaceOrder as number | undefined) ?? extractRegexOrder(String(b.flag ?? b.flags ?? ''));
      return orderB - orderA;
    });

  const trace: RegexTraceEntry[] = [];
  for (const { script, index } of ordered) {
    signal?.throwIfAborted();
    const before = text;
    const find = script.find || script.in || '';
    const replace = script.replace || script.out || '';
    const flagSource = String(script.flag ?? script.flags ?? '');
    const actions = extractRegexActions(flagSource);
    const flags = regexFlags(script);
    const order =
      (script.replaceOrder as number | undefined) ?? extractRegexOrder(String(script.flag ?? script.flags ?? ''));
    try {
      const regex = new RegExp(find, flags);
      const matchCount = countRegexMatches(before, regex);
      let replacement = replace.replaceAll('$n', '\n').replaceAll('{{data}}', '$&');
      if (replacement.endsWith('>') && !actions.includes('no_end_nl')) replacement += '\n';
      const moveTop = replacement.startsWith('@@move_top') || actions.includes('move_top');
      const moveBottom = replacement.startsWith('@@move_bottom') || actions.includes('move_bottom');

      if (moveTop || moveBottom) {
        const moveReplacement = replacement.replace(/^@@move_(?:top|bottom)\s*/, '');
        const matches = regex.global ? [...before.matchAll(regex)] : [before.match(regex)].filter(Boolean);
        text = before.replace(regex, '');
        const singleFlags = flags.replace(/[gy]/g, '');
        const singleRegex = new RegExp(find, singleFlags);
        for (const match of matches) {
          if (!match) continue;
          const moved = match[0].replace(singleRegex, moveReplacement);
          text = moveTop ? `${moved}\n${text}` : `${text}\n${moved}`;
        }
      } else {
        text = before.replace(regex, replacement);
      }
      trace.push({
        index,
        comment: String(script.comment || ''),
        mode: modeLower,
        order,
        flags,
        matchCount,
        changed: before !== text,
        before,
        after: text,
      });
    } catch (error) {
      trace.push({
        index,
        comment: String(script.comment || ''),
        mode: modeLower,
        order,
        flags,
        matchCount: 0,
        changed: false,
        before,
        after: before,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    original,
    result: text,
    mode: modeLower,
    ok: trace.every((entry) => !entry.error),
    trace,
  };
}

function buildSearchText(messages: Array<{ content: string }>, depth: number): string {
  if (depth <= 0) return '';
  return messages
    .slice(-depth)
    .map((message) => message.content)
    .join(' ')
    .toLowerCase();
}

function testKeyMatch(
  key: string,
  searchText: string,
  useRegex: boolean,
  fullWord: boolean,
  onRegexError?: (key: string, message: string) => void,
): boolean {
  if (useRegex) {
    try {
      return new RegExp(key, 'i').test(searchText);
    } catch (error) {
      onRegexError?.(key, error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  const normalizedKey = key.toLowerCase();
  if (fullWord) {
    return new RegExp(`\\b${normalizedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(searchText);
  }
  return searchText.includes(normalizedKey);
}

function findMatchingKeys(
  keys: string[],
  searchText: string,
  useRegex: boolean,
  fullWord: boolean,
  onRegexError?: (key: string, message: string) => void,
): string[] {
  return keys.filter((key) => testKeyMatch(key, searchText, useRegex, fullWord, onRegexError));
}

function deterministicRoll(entryIndex: number): number {
  return ((entryIndex * 2654435761) >>> 0) % 101;
}

function attachLoreMetadata(
  match: LoreMatchWithEntry,
  decorators: PreviewLoreDecorators | undefined,
  warnings: string[] | undefined,
  effectivePercent: number | undefined | null,
  entryScanDepth: number,
  globalScanDepth: number,
  entryIndex: number,
): void {
  if (decorators && Object.keys(decorators).length > 0) match.decorators = decorators;
  if (entryScanDepth !== globalScanDepth) match.effectiveScanDepth = entryScanDepth;
  if (warnings?.length) match.warnings = warnings;
  if (effectivePercent != null && effectivePercent > 0 && effectivePercent < 100) {
    match.activationPercent = effectivePercent;
    match.probabilityRoll = deterministicRoll(entryIndex);
  }
}

export function matchLorebookEntries(
  messages: PreviewMessage[],
  lorebook: PreviewLorebookEntry[],
  scanDepth = 10,
  options: LorebookMatchOptions = {},
): PreviewLoreMatch[] {
  if (!lorebook.length) return [];
  const defaultSearchText = buildSearchText(messages, scanDepth);
  const activated: LoreMatchWithEntry[] = [];

  for (let index = 0; index < lorebook.length; index++) {
    options.signal?.throwIfAborted();
    const entry = lorebook[index] as LoreRuntimeEntry;
    if (entry.mode === 'folder') continue;
    const parsed = entry.content ? parseLorebookDecorators(String(entry.content)) : null;
    const decorators = parsed?.decorators;
    if (decorators?.dontActivate) continue;

    const effectivePercent = decorators?.probability ?? entry.activationPercent;
    if (effectivePercent === 0) continue;
    const entryScanDepth = decorators?.scanDepth ?? scanDepth;
    const searchText = entryScanDepth === scanDepth ? defaultSearchText : buildSearchText(messages, entryScanDepth);
    const fullWord = decorators?.matchFullWord ?? false;
    const excluded = decorators?.excludeKeys ? findMatchingKeys(decorators.excludeKeys, searchText, false, false) : [];
    if (excluded.length > 0) continue;

    let reason: string | undefined;
    let matchedKeys: string[] | undefined;
    if (decorators?.activate) {
      reason = '@@activate';
    } else {
      if (effectivePercent != null && effectivePercent > 0 && effectivePercent < 100) {
        if (deterministicRoll(index) > effectivePercent) continue;
      }
      if (entry.alwaysActive) {
        reason = 'alwaysActive';
      } else {
        const keys = String(entry.key || '')
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean);
        matchedKeys = findMatchingKeys(
          keys,
          searchText,
          entry.useRegex ?? false,
          fullWord,
          options.onRegexError
            ? (key, message) => options.onRegexError?.({ entryIndex: index, key, message })
            : undefined,
        );
        if (entry.selective && entry.secondkey) {
          const secondKeys = entry.secondkey
            .split(',')
            .map((key) => key.trim())
            .filter(Boolean);
          if (matchedKeys.length === 0 || findMatchingKeys(secondKeys, searchText, false, fullWord).length === 0) {
            continue;
          }
          reason = 'key+secondkey';
        } else if (matchedKeys.length > 0) {
          reason = `key: ${matchedKeys[0]}`;
        }
      }
    }
    if (!reason) continue;
    if (
      !decorators?.activate &&
      decorators?.additionalKeys?.length &&
      findMatchingKeys(decorators.additionalKeys, searchText, false, fullWord).length < decorators.additionalKeys.length
    ) {
      continue;
    }

    const match: LoreMatchWithEntry = { index, entry, reason };
    if (matchedKeys?.length) match.matchedKeys = matchedKeys;
    if (decorators?.excludeKeys?.length) match.excludedKeys = decorators.excludeKeys;
    attachLoreMetadata(match, decorators, parsed?.warnings, effectivePercent, entryScanDepth, scanDepth, index);
    activated.push(match);
  }

  return activated
    .sort((a, b) => (a.entry.insertorder || a.entry.order || 100) - (b.entry.insertorder || b.entry.order || 100))
    .map(({ entry, ...match }) => {
      void entry;
      return match;
    });
}

export function simulateLorebookActivation(options: {
  messages: PreviewMessage[];
  lorebook: PreviewLorebookEntry[];
  scanDepth?: number;
  recursive?: boolean;
  maxPasses?: number;
  includeContent?: boolean;
  signal?: AbortSignal;
}): LorebookSimulationResult {
  const scanDepth = options.scanDepth ?? 10;
  const recursive = options.recursive ?? false;
  const maxPasses = Math.max(1, Math.min(options.maxPasses ?? 5, 10));
  const active = new Set<number>();
  const matches: LorebookSimulationMatch[] = [];
  const corpus: PreviewMessage[] = options.messages.map((message) => ({ ...message }));
  let passes = 0;
  let foundOnLastPass = false;

  while (passes < (recursive ? maxPasses : 1)) {
    options.signal?.throwIfAborted();
    passes++;
    const passMatches = matchLorebookEntries(corpus, options.lorebook, scanDepth, { signal: options.signal }).filter(
      (match) => !active.has(match.index),
    );
    foundOnLastPass = passMatches.length > 0;
    if (!foundOnLastPass) break;
    for (const match of passMatches) {
      options.signal?.throwIfAborted();
      active.add(match.index);
      const entry = options.lorebook[match.index] as LoreRuntimeEntry;
      const content = String(entry.content || '');
      const strippedContent = parseLorebookDecorators(content).body;
      matches.push({
        ...match,
        activationPass: passes,
        triggeredBy:
          passes === 1
            ? [{ type: 'chat' }]
            : matches
                .filter((candidate) => candidate.activationPass === passes - 1)
                .map((candidate) => ({ type: 'lorebook' as const, index: candidate.index })),
        comment: String(entry.comment || ''),
        ...(options.includeContent ? { content: strippedContent } : {}),
      });
      if (recursive && strippedContent) corpus.push({ role: 'char', content: strippedContent });
    }
    if (!recursive) break;
  }

  return {
    matches,
    passes,
    recursive,
    maxPasses,
    truncatedRecursiveScan: recursive && passes >= maxPasses && foundOnLastPass,
    probabilityMode: 'deterministic-preview',
    tokenBudgetApplied: false,
  };
}
