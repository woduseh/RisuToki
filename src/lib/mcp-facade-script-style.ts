import * as crypto from 'crypto';

import { combineCssSections, combineLuaSections, parseCssSections, parseLuaSections } from './section-parser';
import { parsePromptTemplate, type PromptItemModel } from './risup-prompt-model';
import {
  asRecord,
  buildGuard,
  facadeApiError,
  greetingPreview,
  guardConflict,
  guardValue,
  isApiError,
  lorebookReplaceField,
  mergeGuards,
  normalizeBatchEntries,
  recordNumber,
  recordString,
  replacementString,
  route,
  stableJson,
  stringGuardValue,
  stringGuardValueAtPath,
  type ApiErrorResult,
  type FacadeRoute,
} from './mcp-facade-runtime';
import type {
  FacadeV1ContentSelector,
  FacadeV1EditOperation,
  FacadeV1Guard,
  FacadeV1Target,
} from './mcp-request-schemas';

export type FacadeApiRequest = (method: string, urlPath: string, body?: Record<string, unknown>) => Promise<unknown>;
export type ScriptStyleFamily = 'trigger' | 'lua' | 'css';
export type TextSection = { name: string; content: string };

export function createFacadeScriptStyleEngine(apiRequest: FacadeApiRequest) {
  function itemByIndex(
    data: unknown,
    collectionKey: 'entries' | 'items',
    index: number,
  ): Record<string, unknown> | undefined {
    const collection = asRecord(data)?.[collectionKey];
    if (!Array.isArray(collection)) return undefined;
    for (const item of collection) {
      const record = asRecord(item);
      if (recordNumber(record, 'index') === index) return record;
    }
    return undefined;
  }

  function rewriteOperationBatchContent(
    operation: FacadeV1EditOperation,
    collectionKey: 'entries' | 'writes',
    entries: Array<Record<string, unknown>>,
  ): void {
    operation.content = { ...(asRecord(operation.content) ?? {}), [collectionKey]: entries };
  }

  function selectorTags(selector: FacadeV1ContentSelector): string[] {
    const selectorRecord = selector as FacadeV1ContentSelector & { tags?: string[] };
    if (Array.isArray(selectorRecord.tags)) return selectorRecord.tags.filter((tag) => typeof tag === 'string');
    if (Array.isArray(selector.fields)) return selector.fields.filter((tag) => typeof tag === 'string');
    return [];
  }

  function risupPromptItemPreview(item: PromptItemModel): string {
    if (!item.supported) return `[unsupported: ${item.type ?? 'unknown'}]`;
    if ('text' in item && typeof item.text === 'string') {
      return item.text.slice(0, 80) + (item.text.length > 80 ? '...' : '');
    }
    if ('defaultText' in item && typeof item.defaultText === 'string' && item.defaultText.length > 0) {
      return item.defaultText.slice(0, 80) + (item.defaultText.length > 80 ? '...' : '');
    }
    if ('innerFormat' in item && typeof item.innerFormat === 'string' && item.innerFormat.length > 0) {
      return `[innerFormat: ${item.innerFormat.slice(0, 60)}]`;
    }
    if (item.type === 'chat' && 'rangeStart' in item && 'rangeEnd' in item) {
      return `[range: ${item.rangeStart}-${item.rangeEnd}]`;
    }
    if (item.type === 'cache' && 'name' in item) {
      return `[cache: ${item.name}]`;
    }
    return `[${item.type ?? 'unknown'}]`;
  }

  function risupPromptItemSummary(item: PromptItemModel, index: number): Record<string, unknown> {
    const summary: Record<string, unknown> = {
      index,
      id: item.id ?? null,
      type: item.type ?? null,
      supported: item.supported,
      preview: risupPromptItemPreview(item),
    };
    if (item.supported && 'name' in item && item.name !== undefined) summary.name = item.name;
    return summary;
  }

  function risupPromptSearchFields(item: PromptItemModel): Array<{ field: string; value: string }> {
    const fields: Array<{ field: string; value: string }> = [];
    const push = (field: string, value: unknown) => {
      if (typeof value === 'string' && value.length > 0) fields.push({ field, value });
    };
    if (!item.supported) {
      push('raw', JSON.stringify(item.rawValue));
      return fields;
    }
    push('id', item.id);
    push('type', item.type);
    if ('name' in item) push('name', item.name);
    if ('text' in item) push('text', item.text);
    if ('innerFormat' in item) push('innerFormat', item.innerFormat);
    if ('defaultText' in item) push('defaultText', item.defaultText);
    return fields;
  }

  function findRisupPromptItemMatchedFields(item: PromptItemModel, query: string): string[] {
    const needle = query.toLowerCase();
    return risupPromptSearchFields(item)
      .filter(({ value }) => value.toLowerCase().includes(needle))
      .map(({ field }) => field);
  }

  async function readExternalRisupPromptModel(filePath: string): Promise<
    | {
        rawText: string;
        model: ReturnType<typeof parsePromptTemplate>;
        routes: FacadeRoute[];
      }
    | ApiErrorResult
  > {
    const routePath = '/external/surface/read';
    const read = await apiRequest('POST', routePath, { file_path: filePath, path: '/promptTemplate' });
    if (isApiError(read)) return read;
    const value = asRecord(read)?.value;
    if (typeof value !== 'string') {
      return facadeApiError(
        400,
        'External risup promptTemplate is not a string',
        'Use inspect_document on the external .risup file, then repair promptTemplate before using risup-prompt selectors.',
        { file_path: filePath },
        ['inspect_document', 'read_content'],
      );
    }
    const model = parsePromptTemplate(value);
    if (model.state === 'invalid') {
      return facadeApiError(
        400,
        `Invalid external promptTemplate: ${model.parseError}`,
        'Use read_content with selector { field: "promptTemplate" } or a granular external field route to inspect and repair the raw promptTemplate.',
        { file_path: filePath, parseError: model.parseError },
        ['read_content', 'search_document'],
      );
    }
    return {
      rawText: value,
      model,
      routes: [route('external_read_surface', 'POST', routePath)],
    };
  }

  const EXTERNAL_LOREBOOK_ALLOWED_FIELDS = new Set([
    'key',
    'secondkey',
    'comment',
    'content',
    'mode',
    'insertorder',
    'order',
    'priority',
    'activationPercent',
    'alwaysActive',
    'forceActivation',
    'selective',
    'constant',
    'useRegex',
    'folder',
    'extentions',
    'id',
  ]);

  const EXTERNAL_REGEX_ALLOWED_FIELDS = new Set([
    'comment',
    'type',
    'find',
    'replace',
    'in',
    'out',
    'flag',
    'ableFlag',
  ]);
  const EXTERNAL_LOREBOOK_REPLACEABLE_FIELDS = new Set(['content', 'comment', 'key', 'secondkey']);

  function hashStableValue(value: unknown): string {
    return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
  }

  function stableIdentityHash(prefix: string, value: unknown): string {
    return `${prefix}_${hashStableValue(value).slice(0, 16)}`;
  }

  function normalizeLFString(value: string): string {
    return value.replace(/\r\n?/g, '\n');
  }

  function jsonPointerSegment(segment: string | number): string {
    return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
  }

  function pickAllowedRecordFields(source: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      if (allowed.has(key)) result[key] = source[key];
    }
    return result;
  }

  function externalLorebookStableId(
    entry: Record<string, unknown>,
    index: number,
    lorebook: Record<string, unknown>[],
  ): string {
    return stableIdentityHash('lb', {
      mode: entry.mode || 'normal',
      comment: entry.comment || '',
      key: entry.key || '',
      secondkey: entry.secondkey || '',
      content: entry.content || '',
      folder: entry.folder || '',
      indexHint: index,
      total: lorebook.length,
    });
  }

  function externalLorebookSummary(
    entry: Record<string, unknown>,
    index: number,
    lorebook: Record<string, unknown>[],
  ): Record<string, unknown> {
    const content = typeof entry.content === 'string' ? entry.content : '';
    return {
      index,
      id: externalLorebookStableId(entry, index, lorebook),
      comment: recordString(entry, 'comment') ?? '',
      key: recordString(entry, 'key') ?? '',
      secondkey: recordString(entry, 'secondkey') ?? '',
      mode: recordString(entry, 'mode') ?? 'normal',
      contentSize: content.length,
      preview: greetingPreview(content),
    };
  }

  function normalizeExternalRegexEntry(entry: Record<string, unknown> | undefined): Record<string, unknown> {
    const normalized = { ...(entry ?? {}) };
    if (!normalized.find && normalized.in) normalized.find = normalized.in;
    if (!normalized.replace && normalized.out) normalized.replace = normalized.out;
    if (normalized.find === undefined) normalized.find = '';
    if (normalized.replace === undefined) normalized.replace = '';
    delete normalized.in;
    delete normalized.out;
    return normalized;
  }

  function externalRegexEntryPreview(entry: Record<string, unknown> | undefined): string {
    const normalized = normalizeExternalRegexEntry(entry);
    return greetingPreview(`${recordString(normalized, 'find') ?? ''}\n${recordString(normalized, 'replace') ?? ''}`);
  }

  function externalRegexEntryHash(entry: Record<string, unknown> | undefined): string {
    const normalized = normalizeExternalRegexEntry(entry);
    return hashStableValue({
      comment: recordString(normalized, 'comment') ?? '',
      type: recordString(normalized, 'type') ?? '',
      find: recordString(normalized, 'find') ?? '',
      replace: recordString(normalized, 'replace') ?? '',
    });
  }

  function externalRegexSummary(entry: Record<string, unknown>, index: number): Record<string, unknown> {
    const normalized = normalizeExternalRegexEntry(entry);
    return {
      index,
      comment: recordString(normalized, 'comment') ?? '',
      type: recordString(normalized, 'type') ?? '',
      findSize: (recordString(normalized, 'find') ?? '').length,
      replaceSize: (recordString(normalized, 'replace') ?? '').length,
      preview: externalRegexEntryPreview(entry),
      hash: externalRegexEntryHash(entry),
    };
  }

  function externalGreetingHash(content: string): string {
    return hashStableValue(normalizeLFString(content));
  }

  function externalGreetingSummary(content: string, index: number): Record<string, unknown> {
    return {
      index,
      contentSize: content.length,
      preview: greetingPreview(content),
      hash: externalGreetingHash(content),
    };
  }

  async function readExternalSurfaceValue(
    filePath: string,
    surfacePath: string,
  ): Promise<{ value: unknown; routes: FacadeRoute[]; raw: Record<string, unknown> } | ApiErrorResult> {
    const routePath = '/external/surface/read';
    const read = await apiRequest('POST', routePath, { file_path: filePath, path: surfacePath });
    if (isApiError(read)) return read;
    const record = asRecord(read);
    return {
      value: record?.value,
      raw: record ?? {},
      routes: [route('external_read_surface', 'POST', routePath)],
    };
  }

  async function readExternalRecordArraySurface(
    filePath: string,
    surfacePath: string,
    family: string,
  ): Promise<{ entries: Record<string, unknown>[]; routes: FacadeRoute[] } | ApiErrorResult> {
    const read = await readExternalSurfaceValue(filePath, surfacePath);
    if (isApiError(read)) return read;
    if (!Array.isArray(read.value)) {
      return facadeApiError(
        400,
        `External ${family} surface is not an array`,
        'Inspect the external file surface, then retry with a supported structured selector.',
        { file_path: filePath, path: surfacePath, type: typeof read.value },
        ['inspect_document', 'read_content'],
      );
    }
    const invalidIndex = read.value.findIndex((entry) => !asRecord(entry));
    if (invalidIndex >= 0) {
      return facadeApiError(
        400,
        `External ${family} entry is not an object`,
        'Use a raw surface patch or repair the structured array before using facade structured item selectors.',
        { file_path: filePath, path: surfacePath, index: invalidIndex },
        ['read_content'],
      );
    }
    return { entries: read.value.map((entry) => asRecord(entry) ?? {}), routes: read.routes };
  }

  async function readExternalStringArraySurface(
    filePath: string,
    surfacePath: string,
    family: string,
  ): Promise<{ entries: string[]; routes: FacadeRoute[] } | ApiErrorResult> {
    const read = await readExternalSurfaceValue(filePath, surfacePath);
    if (isApiError(read)) return read;
    if (!Array.isArray(read.value) || !read.value.every((entry) => typeof entry === 'string')) {
      return facadeApiError(
        400,
        `External ${family} surface is not a string array`,
        'Inspect the external file surface, then retry with a supported greeting selector.',
        { file_path: filePath, path: surfacePath },
        ['inspect_document', 'read_content'],
      );
    }
    return { entries: read.value as string[], routes: read.routes };
  }

  function validateExternalIndices(count: number, indices: number[], label: string): ApiErrorResult | undefined {
    const invalid = indices.find((index) => index < 0 || index >= count);
    if (invalid !== undefined) {
      return facadeApiError(
        400,
        `${label} index out of range: ${invalid}`,
        'Refresh the item summaries and retry with a current index or stable identity selector.',
        { index: invalid, count },
        ['read_content'],
      );
    }
    return undefined;
  }

  function resolveExternalLorebookSelectorIndices(
    lorebook: Record<string, unknown>[],
    selector: FacadeV1ContentSelector,
    action: string,
  ): number[] | ApiErrorResult {
    const resolveId = (id: string): number | ApiErrorResult => {
      const matches = lorebook
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry, index }) => externalLorebookStableId(entry, index, lorebook) === id)
        .map(({ index }) => index);
      if (matches.length === 0) {
        return facadeApiError(404, `External lorebook id not found: ${id}`, 'Refresh lorebook summaries and retry.', {
          action,
          id,
        });
      }
      if (matches.length > 1) {
        return facadeApiError(
          409,
          `External lorebook id is not unique: ${id}`,
          'Use an index selector plus expected_comment after refreshing the lorebook list.',
          { action, id, indices: matches },
        );
      }
      return matches[0];
    };

    if (selector.id) {
      const index = resolveId(selector.id);
      return typeof index === 'number' ? [index] : index;
    }
    if (selector.ids) {
      const indices: number[] = [];
      for (const id of selector.ids) {
        const index = resolveId(id);
        if (typeof index !== 'number') return index;
        indices.push(index);
      }
      return indices;
    }
    const indices = selector.index !== undefined ? [selector.index] : selector.indices;
    if (!indices) return lorebook.map((_, index) => index);
    const invalid = validateExternalIndices(lorebook.length, indices, 'External lorebook');
    return invalid ?? indices;
  }

  function resolveExternalRegexSelectorIndices(
    entries: Record<string, unknown>[],
    selector: FacadeV1ContentSelector,
    action: string,
  ): number[] | ApiErrorResult {
    if (selector.identity) {
      const { comment, preview, hash } = selector.identity;
      if (!comment && !preview && !hash) {
        return facadeApiError(
          400,
          'Regex identity requires comment, preview, or hash',
          'Use read_content/list regex summaries and retry with a unique identity.',
          { action },
          ['read_content'],
        );
      }
      const matches = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => {
          if (comment !== undefined && (recordString(entry, 'comment') ?? '') !== comment) return false;
          if (preview !== undefined && externalRegexEntryPreview(entry) !== preview) return false;
          if (hash !== undefined && externalRegexEntryHash(entry) !== hash) return false;
          return true;
        })
        .map(({ index }) => index);
      if (matches.length === 0) {
        return facadeApiError(
          404,
          'External regex identity did not match any entry',
          'Refresh regex summaries and retry.',
          {
            action,
            identity: selector.identity,
          },
        );
      }
      if (matches.length > 1) {
        return facadeApiError(
          409,
          'External regex identity matched multiple entries',
          'Add hash/preview to the identity or use an index selector with expected_comment.',
          { action, indices: matches },
        );
      }
      return matches;
    }
    const indices = selector.index !== undefined ? [selector.index] : selector.indices;
    if (!indices) return entries.map((_, index) => index);
    const invalid = validateExternalIndices(entries.length, indices, 'External regex');
    return invalid ?? indices;
  }

  function resolveExternalGreetingSelectorIndices(
    entries: string[],
    selector: FacadeV1ContentSelector,
    action: string,
  ): number[] | ApiErrorResult {
    if (selector.identity) {
      const { preview, hash } = selector.identity;
      if (!preview && !hash) {
        return facadeApiError(
          400,
          'Greeting identity requires preview or hash',
          'Use read_content/list greeting summaries and retry with a unique identity.',
          { action },
          ['read_content'],
        );
      }
      const matches = entries
        .map((content, index) => ({ content, index }))
        .filter(({ content }) => {
          if (preview !== undefined && greetingPreview(content) !== preview) return false;
          if (hash !== undefined && externalGreetingHash(content) !== hash) return false;
          return true;
        })
        .map(({ index }) => index);
      if (matches.length === 0) {
        return facadeApiError(
          404,
          'External greeting identity did not match any entry',
          'Refresh greeting summaries and retry.',
          { action, identity: selector.identity },
        );
      }
      if (matches.length > 1) {
        return facadeApiError(
          409,
          'External greeting identity matched multiple entries',
          'Add hash to the identity or use an index selector with expected_preview.',
          { action, indices: matches },
        );
      }
      return matches;
    }
    const indices = selector.index !== undefined ? [selector.index] : selector.indices;
    if (!indices) return entries.map((_, index) => index);
    const invalid = validateExternalIndices(entries.length, indices, 'External greeting');
    return invalid ?? indices;
  }

  async function readExternalStructuredSelector(
    target: FacadeV1Target,
    selector: FacadeV1ContentSelector,
  ): Promise<{ data: unknown; routes: FacadeRoute[] } | ApiErrorResult> {
    if (target.kind !== 'external') {
      return facadeApiError(400, 'External structured read requires target.kind="external"', 'Use an external target.');
    }
    if (selector.family === 'lorebook') {
      const read = await readExternalRecordArraySurface(target.file_path, '/lorebook', 'lorebook');
      if (isApiError(read)) return read;
      const indices = resolveExternalLorebookSelectorIndices(read.entries, selector, 'read external lorebook');
      if (!Array.isArray(indices)) return indices;
      const selected = selector.id || selector.ids || selector.index !== undefined || selector.indices;
      return {
        data: {
          file_path: target.file_path,
          count: indices.length,
          total: read.entries.length,
          entries: indices.map((index) => ({
            ...externalLorebookSummary(read.entries[index], index, read.entries),
            ...(selected ? { entry: read.entries[index] } : {}),
          })),
        },
        routes: read.routes,
      };
    }
    if (selector.family === 'regex') {
      const read = await readExternalRecordArraySurface(target.file_path, '/regex', 'regex');
      if (isApiError(read)) return read;
      const indices = resolveExternalRegexSelectorIndices(read.entries, selector, 'read external regex');
      if (!Array.isArray(indices)) return indices;
      const selected = selector.identity || selector.index !== undefined || selector.indices;
      return {
        data: {
          file_path: target.file_path,
          count: indices.length,
          total: read.entries.length,
          entries: indices.map((index) => ({
            ...externalRegexSummary(read.entries[index], index),
            ...(selected ? { entry: read.entries[index] } : {}),
          })),
        },
        routes: read.routes,
      };
    }
    if (selector.family === 'greeting') {
      if (!selector.greeting_type) {
        return facadeApiError(
          400,
          'External greeting selectors require greeting_type',
          'Set greeting_type="alternate"; groupOnlyGreetings remains protected by the hidden/deprecated field policy.',
          { selector },
        );
      }
      const surfacePath = selector.greeting_type === 'alternate' ? '/alternateGreetings' : '/groupOnlyGreetings';
      const read = await readExternalStringArraySurface(target.file_path, surfacePath, 'greeting');
      if (isApiError(read)) return read;
      const indices = resolveExternalGreetingSelectorIndices(read.entries, selector, 'read external greeting');
      if (!Array.isArray(indices)) return indices;
      const selected = selector.identity || selector.index !== undefined || selector.indices;
      return {
        data: {
          file_path: target.file_path,
          type: selector.greeting_type,
          count: indices.length,
          total: read.entries.length,
          items: indices.map((index) => ({
            ...externalGreetingSummary(read.entries[index], index),
            ...(selected ? { content: read.entries[index] } : {}),
          })),
        },
        routes: read.routes,
      };
    }
    return facadeApiError(
      400,
      'Unsupported external structured selector',
      'Use lorebook, regex, or greeting selectors.',
    );
  }

  function computeTextReplacement(
    content: string,
    operation: FacadeV1EditOperation,
  ): { matchCount: number; newContent: string } | ApiErrorResult {
    if (!operation.find) return facadeApiError(400, 'replace_text requires find', 'Provide operations[].find.');
    const findStr = normalizeLFString(operation.find);
    const replaceStr = normalizeLFString(typeof operation.replace === 'string' ? operation.replace : '');
    const normalizedContent = normalizeLFString(content);
    if (operation.regex) {
      try {
        const re = new RegExp(findStr, operation.flags || 'g');
        const matches = normalizedContent.match(re);
        return { matchCount: matches ? matches.length : 0, newContent: normalizedContent.replace(re, replaceStr) };
      } catch (error) {
        return facadeApiError(
          400,
          'Invalid replace_text regex',
          'Check operations[].find and operations[].flags, then retry preview_edit.',
          { error: (error as Error).message },
        );
      }
    }
    let matchCount = 0;
    let searchFrom = 0;
    while (true) {
      const pos = normalizedContent.indexOf(findStr, searchFrom);
      if (pos === -1) break;
      matchCount++;
      searchFrom = pos + findStr.length;
    }
    return { matchCount, newContent: normalizedContent.split(findStr).join(replaceStr) };
  }

  const FACADE_SURFACE_REPLACE_MAX_MATCHES = 1000;

  function computeSurfaceReplacement(
    value: unknown,
    operation: FacadeV1EditOperation,
  ): { matchCount: number; nextValue: unknown } | ApiErrorResult {
    if (!operation.find) return facadeApiError(400, 'replace_text requires find', 'Provide operations[].find.');
    const findStr = normalizeLFString(operation.find);
    const replaceStr = normalizeLFString(typeof operation.replace === 'string' ? operation.replace : '');
    let matchCount = 0;
    let pattern: RegExp | undefined;
    if (operation.regex) {
      try {
        pattern = new RegExp(findStr, operation.flags || 'g');
      } catch (error) {
        return facadeApiError(
          400,
          'Invalid replace_text regex',
          'Check operations[].find and operations[].flags, then retry preview_edit.',
          { error: (error as Error).message },
        );
      }
    }
    const visit = (node: unknown): unknown => {
      if (typeof node === 'string') {
        if (pattern) {
          const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
          const localMatches = [...node.matchAll(re)].length;
          matchCount += localMatches;
          if (matchCount > FACADE_SURFACE_REPLACE_MAX_MATCHES)
            throw new Error(`Too many matches (>${FACADE_SURFACE_REPLACE_MAX_MATCHES})`);
          return node.replace(re, replaceStr);
        }
        const localMatches = findStr ? node.split(findStr).length - 1 : 0;
        matchCount += localMatches;
        if (matchCount > FACADE_SURFACE_REPLACE_MAX_MATCHES)
          throw new Error(`Too many matches (>${FACADE_SURFACE_REPLACE_MAX_MATCHES})`);
        return findStr ? node.split(findStr).join(replaceStr) : node;
      }
      if (Array.isArray(node)) return node.map(visit);
      if (node && typeof node === 'object') {
        const next: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(node as Record<string, unknown>)) next[key] = visit(child);
        return next;
      }
      return node;
    };
    try {
      return { matchCount, nextValue: visit(value) };
    } catch (error) {
      return facadeApiError(
        413,
        'Too many surface replace_text matches',
        'Narrow the selector or use a more specific find pattern.',
        {
          error: (error as Error).message,
          max_matches: FACADE_SURFACE_REPLACE_MAX_MATCHES,
        },
      );
    }
  }

  const SCRIPT_STYLE_FAMILIES = new Set(['trigger', 'lua', 'css']);
  const EXTERNAL_TRIGGER_ALLOWED_FIELDS = new Set(['comment', 'type', 'conditions', 'effect', 'lowLevelAccess']);

  function isScriptStyleFamily(value: unknown): value is ScriptStyleFamily {
    return typeof value === 'string' && SCRIPT_STYLE_FAMILIES.has(value);
  }

  function scriptStyleRouteParts(family: ScriptStyleFamily): {
    listTool: string;
    readTool: string;
    batchTool: string;
    writeTool: string;
    replaceTool?: string;
    insertTool?: string;
    deleteTool?: string;
    listPath: string;
    readPath: (index: number) => string;
    batchPath: string;
    writePath: (index: number) => string;
    replacePath?: (index: number) => string;
    insertPath?: (index: number) => string;
    deletePath?: (index: number) => string;
  } {
    if (family === 'trigger') {
      return {
        listTool: 'list_triggers',
        readTool: 'read_trigger',
        batchTool: 'read_trigger_batch',
        writeTool: 'write_trigger',
        deleteTool: 'delete_trigger',
        listPath: '/triggers',
        readPath: (index) => `/trigger/${index}`,
        batchPath: '/trigger/batch',
        writePath: (index) => `/trigger/${index}`,
        deletePath: (index) => `/trigger/${index}/delete`,
      };
    }
    if (family === 'lua') {
      return {
        listTool: 'list_lua',
        readTool: 'read_lua',
        batchTool: 'read_lua_batch',
        writeTool: 'write_lua',
        replaceTool: 'replace_in_lua',
        insertTool: 'insert_in_lua',
        deleteTool: 'delete_lua_section',
        listPath: '/lua',
        readPath: (index) => `/lua/${index}`,
        batchPath: '/lua/batch',
        writePath: (index) => `/lua/${index}`,
        replacePath: (index) => `/lua/${index}/replace`,
        insertPath: (index) => `/lua/${index}/insert`,
        deletePath: (index) => `/lua/${index}/delete`,
      };
    }
    return {
      listTool: 'list_css',
      readTool: 'read_css',
      batchTool: 'read_css_batch',
      writeTool: 'write_css',
      replaceTool: 'replace_in_css',
      insertTool: 'insert_in_css',
      deleteTool: 'delete_css_section',
      listPath: '/css-section',
      readPath: (index) => `/css-section/${index}`,
      batchPath: '/css-section/batch',
      writePath: (index) => `/css-section/${index}`,
      replacePath: (index) => `/css-section/${index}/replace`,
      insertPath: (index) => `/css-section/${index}/insert`,
      deletePath: (index) => `/css-section/${index}/delete`,
    };
  }

  function sectionPreview(content: string): string {
    return content.slice(0, 100) + (content.length > 100 ? '…' : '');
  }

  function sectionHash(content: string): string {
    return hashStableValue(normalizeLFString(content));
  }

  function sectionSummary(section: TextSection, index: number): Record<string, unknown> {
    return {
      index,
      name: section.name,
      contentSize: section.content.length,
      preview: sectionPreview(section.content),
      hash: sectionHash(section.content),
    };
  }

  function triggerSummary(entry: Record<string, unknown>, index: number): Record<string, unknown> {
    return {
      index,
      comment: recordString(entry, 'comment') ?? '',
      type: recordString(entry, 'type') ?? '',
      conditionCount: Array.isArray(entry.conditions) ? entry.conditions.length : 0,
      effectCount: Array.isArray(entry.effect) ? entry.effect.length : 0,
      lowLevelAccess: !!entry.lowLevelAccess,
      preview: externalTriggerPreview(entry),
      hash: externalTriggerHash(entry),
    };
  }

  function externalTriggerPreview(entry: Record<string, unknown>): string {
    return greetingPreview(`${recordString(entry, 'comment') ?? ''}\n${recordString(entry, 'type') ?? ''}`);
  }

  function externalTriggerHash(entry: Record<string, unknown>): string {
    return hashStableValue({
      comment: recordString(entry, 'comment') ?? '',
      type: recordString(entry, 'type') ?? '',
      conditions: Array.isArray(entry.conditions) ? entry.conditions : [],
      effect: Array.isArray(entry.effect) ? entry.effect : [],
      lowLevelAccess: !!entry.lowLevelAccess,
    });
  }

  function resolveTriggerSelectorIndices(
    entries: Record<string, unknown>[],
    selector: FacadeV1ContentSelector,
    action: string,
  ): number[] | ApiErrorResult {
    if (selector.identity) {
      const { comment, preview, hash } = selector.identity;
      if (!comment && !preview && !hash) {
        return facadeApiError(
          400,
          'Trigger identity requires comment, preview, or hash',
          'Use read_content trigger summaries and retry with a unique identity.',
          { action },
          ['read_content'],
        );
      }
      const matches = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => {
          if (comment !== undefined && (recordString(entry, 'comment') ?? '') !== comment) return false;
          if (preview !== undefined && externalTriggerPreview(entry) !== preview) return false;
          if (hash !== undefined && externalTriggerHash(entry) !== hash) return false;
          return true;
        })
        .map(({ index }) => index);
      if (matches.length === 0) {
        return facadeApiError(404, 'Trigger identity did not match any entry', 'Refresh trigger summaries and retry.', {
          action,
          identity: selector.identity,
        });
      }
      if (matches.length > 1) {
        return facadeApiError(
          409,
          'Trigger identity matched multiple entries',
          'Add hash/preview to the identity or use an index selector with expected_comment.',
          { action, indices: matches },
        );
      }
      return matches;
    }
    const indices = selector.index !== undefined ? [selector.index] : selector.indices;
    if (!indices) return entries.map((_, index) => index);
    const invalid = validateExternalIndices(entries.length, indices, 'Trigger');
    return invalid ?? indices;
  }

  function resolveSectionSelectorIndices(
    sections: TextSection[],
    selector: FacadeV1ContentSelector,
    action: string,
  ): number[] | ApiErrorResult {
    if (selector.identity) {
      const { comment, preview, hash } = selector.identity;
      if (!comment && !preview && !hash) {
        return facadeApiError(
          400,
          'Section identity requires comment/name, preview, or hash',
          'Use read_content section summaries and retry with a unique identity.',
          { action },
          ['read_content'],
        );
      }
      const matches = sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => {
          if (comment !== undefined && section.name !== comment) return false;
          if (preview !== undefined && sectionPreview(section.content) !== preview) return false;
          if (hash !== undefined && sectionHash(section.content) !== hash) return false;
          return true;
        })
        .map(({ index }) => index);
      if (matches.length === 0) {
        return facadeApiError(404, 'Section identity did not match any entry', 'Refresh section summaries and retry.', {
          action,
          identity: selector.identity,
        });
      }
      if (matches.length > 1) {
        return facadeApiError(
          409,
          'Section identity matched multiple entries',
          'Add hash/preview to the identity or use an index selector with expected guards.',
          { action, indices: matches },
        );
      }
      return matches;
    }
    const indices = selector.index !== undefined ? [selector.index] : selector.indices;
    if (!indices) return sections.map((_, index) => index);
    const invalid = validateExternalIndices(sections.length, indices, 'Section');
    return invalid ?? indices;
  }

  function selectedSelector(selector: FacadeV1ContentSelector): boolean {
    return !!selector.identity || selector.index !== undefined || !!selector.indices || !!selector.id || !!selector.ids;
  }

  async function readExternalTextSurface(
    filePath: string,
    surfacePath: '/lua' | '/css',
    family: 'lua' | 'css',
  ): Promise<{ text: string; routes: FacadeRoute[] } | ApiErrorResult> {
    const read = await readExternalSurfaceValue(filePath, surfacePath);
    if (isApiError(read)) return read;
    if (read.value === undefined || read.value === null) return { text: '', routes: read.routes };
    if (typeof read.value !== 'string') {
      return facadeApiError(
        400,
        `External ${family} surface is not a string`,
        'Inspect the external file surface, then retry with a supported structured selector.',
        { file_path: filePath, path: surfacePath, type: typeof read.value },
        ['inspect_document', 'read_content'],
      );
    }
    return { text: read.value, routes: read.routes };
  }

  async function readExternalScriptStyleSelector(
    target: FacadeV1Target,
    selector: FacadeV1ContentSelector,
  ): Promise<{ data: unknown; routes: FacadeRoute[] } | ApiErrorResult> {
    if (target.kind !== 'external') {
      return facadeApiError(
        400,
        'External script/style read requires target.kind="external"',
        'Use an external target.',
      );
    }
    if (selector.family === 'trigger') {
      const read = await readExternalRecordArraySurface(target.file_path, '/triggerScripts', 'trigger');
      if (isApiError(read)) return read;
      const indices = resolveTriggerSelectorIndices(read.entries, selector, 'read external trigger');
      if (!Array.isArray(indices)) return indices;
      const selected = selectedSelector(selector);
      return {
        data: {
          file_path: target.file_path,
          count: indices.length,
          total: read.entries.length,
          items: indices.map((index) => ({
            ...triggerSummary(read.entries[index], index),
            ...(selected ? { trigger: read.entries[index] } : {}),
          })),
        },
        routes: read.routes,
      };
    }
    if (selector.family === 'lua' || selector.family === 'css') {
      const surfacePath = selector.family === 'lua' ? '/lua' : '/css';
      const read = await readExternalTextSurface(target.file_path, surfacePath, selector.family);
      if (isApiError(read)) return read;
      const parsed =
        selector.family === 'lua'
          ? { sections: parseLuaSections(read.text) as TextSection[] }
          : (parseCssSections(read.text) as { sections: TextSection[]; prefix: string; suffix: string });
      const indices = resolveSectionSelectorIndices(parsed.sections, selector, `read external ${selector.family}`);
      if (!Array.isArray(indices)) return indices;
      const selected = selectedSelector(selector);
      return {
        data: {
          file_path: target.file_path,
          count: indices.length,
          total: parsed.sections.length,
          sections: indices.map((index) => ({
            ...sectionSummary(parsed.sections[index], index),
            ...(selected ? { content: parsed.sections[index].content } : {}),
          })),
        },
        routes: read.routes,
      };
    }
    return facadeApiError(400, 'Unsupported external script/style selector', 'Use trigger, lua, or css selectors.');
  }

  function contentStringFromOperation(operation: FacadeV1EditOperation, action: string): string | ApiErrorResult {
    const record = asRecord(operation.content);
    const value = record && typeof record.content === 'string' ? record.content : operation.content;
    if (typeof value !== 'string') {
      return facadeApiError(400, `${action} requires string content`, 'Set operations[].content to a string.', {
        operation,
      });
    }
    return normalizeLFString(value);
  }

  function insertSpecFromOperation(
    content: string,
    operation: FacadeV1EditOperation,
  ): { newContent: string; position: string; anchor?: string; insertedSize: number } | ApiErrorResult {
    const record = asRecord(operation.content);
    const insertContent = contentStringFromOperation(operation, 'insert_text');
    if (isApiError(insertContent)) return insertContent;
    const position = operation.position ?? recordString(record, 'position') ?? 'end';
    const anchor = operation.anchor ?? recordString(record, 'anchor');
    const normalizedContent = normalizeLFString(content);
    if (position === 'end') {
      return {
        newContent: normalizedContent + '\n' + insertContent,
        position,
        insertedSize: insertContent.length,
      };
    }
    if (position === 'start') {
      return {
        newContent: insertContent + '\n' + normalizedContent,
        position,
        insertedSize: insertContent.length,
      };
    }
    if ((position === 'after' || position === 'before') && anchor) {
      const normalizedAnchor = normalizeLFString(anchor);
      const anchorPos = normalizedContent.indexOf(normalizedAnchor);
      if (anchorPos === -1) {
        return facadeApiError(
          404,
          'insert_text anchor not found',
          'Refresh the section content, then retry with a current anchor or position start/end.',
          { position, anchor: normalizedAnchor.slice(0, 120) },
          ['read_content', 'preview_edit'],
        );
      }
      if (position === 'after') {
        const insertAt = anchorPos + normalizedAnchor.length;
        return {
          newContent: normalizedContent.slice(0, insertAt) + '\n' + insertContent + normalizedContent.slice(insertAt),
          position,
          anchor: normalizedAnchor,
          insertedSize: insertContent.length,
        };
      }
      return {
        newContent: normalizedContent.slice(0, anchorPos) + insertContent + '\n' + normalizedContent.slice(anchorPos),
        position,
        anchor: normalizedAnchor,
        insertedSize: insertContent.length,
      };
    }
    return facadeApiError(
      400,
      'insert_text requires a valid position',
      'Use content as a string or { content, position: "start"|"end"|"before"|"after", anchor? }. Anchor is required for before/after.',
      { position },
    );
  }

  async function resolveActiveScriptStyleIndex(
    family: ScriptStyleFamily,
    selector: FacadeV1ContentSelector,
  ): Promise<{ index: number; routes: FacadeRoute[] } | ApiErrorResult> {
    if (selector.index !== undefined) return { index: selector.index, routes: [] };
    if (selector.indices && selector.indices.length === 1) return { index: selector.indices[0], routes: [] };
    if (selector.indices && selector.indices.length !== 1) {
      return facadeApiError(
        400,
        `${family} mutation requires one item`,
        'Use selector.index or a single-entry selector.indices for preview_edit/apply_edit script/style mutations.',
        { selector },
      );
    }
    if (!selector.identity) {
      return facadeApiError(
        400,
        `${family} mutation requires an item selector`,
        'Use read_content to list items, then retry with selector.index or a unique identity.',
        { selector },
        ['read_content'],
      );
    }

    const parts = scriptStyleRouteParts(family);
    const listed = await apiRequest('GET', parts.listPath);
    if (isApiError(listed)) return listed;
    const record = asRecord(listed);
    const entries =
      family === 'trigger'
        ? Array.isArray(record?.items)
          ? (record?.items as Record<string, unknown>[])
          : []
        : Array.isArray(record?.sections)
          ? (record?.sections as Record<string, unknown>[])
          : [];
    const { comment, preview, hash } = selector.identity;
    const matches = entries
      .map((entry) => ({ entry, index: recordNumber(entry, 'index') }))
      .filter(({ entry, index }) => {
        if (index === undefined) return false;
        if (comment !== undefined) {
          const nameOrComment =
            family === 'trigger' ? (recordString(entry, 'comment') ?? '') : (recordString(entry, 'name') ?? '');
          if (nameOrComment !== comment) return false;
        }
        if (preview !== undefined && recordString(entry, 'preview') !== preview) return false;
        if (hash !== undefined && recordString(entry, 'hash') !== hash) return false;
        return true;
      })
      .map(({ index }) => index)
      .filter((index): index is number => index !== undefined);
    if (matches.length === 0) {
      return facadeApiError(404, `${family} identity did not match any item`, 'Refresh item summaries and retry.', {
        identity: selector.identity,
      });
    }
    if (matches.length > 1) {
      return facadeApiError(
        409,
        `${family} identity matched multiple items`,
        'Add hash/preview to the identity or use selector.index.',
        { indices: matches },
      );
    }
    return { index: matches[0], routes: [route(parts.listTool, 'GET', parts.listPath)] };
  }

  async function readActiveScriptStyleItem(
    family: ScriptStyleFamily,
    selector: FacadeV1ContentSelector,
  ): Promise<
    | { index: number; data: Record<string, unknown>; routes: FacadeRoute[]; current: Record<string, unknown> }
    | ApiErrorResult
  > {
    const resolved = await resolveActiveScriptStyleIndex(family, selector);
    if (isApiError(resolved)) return resolved;
    const parts = scriptStyleRouteParts(family);
    const readPath = parts.readPath(resolved.index);
    const data = await apiRequest('GET', readPath);
    if (isApiError(data)) return data;
    const dataRecord = asRecord(data) ?? {};
    const current = family === 'trigger' ? (asRecord(dataRecord.trigger) ?? {}) : dataRecord;
    return {
      index: resolved.index,
      data: dataRecord,
      current,
      routes: [...resolved.routes, route(parts.readTool, 'GET', readPath)],
    };
  }

  function activeSectionGuards(current: Record<string, unknown>, sourceTool: string): FacadeV1Guard[] {
    const guards: FacadeV1Guard[] = [];
    const hash = recordString(current, 'hash');
    const preview = recordString(current, 'preview');
    if (hash !== undefined) guards.push(buildGuard('expected_hash', hash, '/expected_hash', [sourceTool], '/hash'));
    if (preview !== undefined)
      guards.push(buildGuard('expected_preview', preview, '/expected_preview', [sourceTool], '/preview'));
    return guards;
  }

  function checkActiveSectionGuards(
    guards: FacadeV1Guard[] | undefined,
    current: Record<string, unknown>,
    targetLabel: string,
  ): ApiErrorResult | undefined {
    return (
      guardConflict(guards, 'expected_hash', recordString(current, 'hash'), targetLabel) ??
      guardConflict(guards, 'expected_preview', recordString(current, 'preview'), targetLabel)
    );
  }

  function checkExternalSectionGuards(
    guards: FacadeV1Guard[] | undefined,
    section: TextSection,
    targetLabel: string,
  ): ApiErrorResult | undefined {
    return (
      guardConflict(guards, 'expected_section_hash', sectionHash(section.content), targetLabel) ??
      guardConflict(guards, 'expected_section_preview', sectionPreview(section.content), targetLabel)
    );
  }

  function externalSectionGuards(section: TextSection): FacadeV1Guard[] {
    return [
      buildGuard(
        'expected_section_hash',
        sectionHash(section.content),
        '/expected_section_hash',
        ['read_content'],
        '/hash',
      ),
      buildGuard(
        'expected_section_preview',
        sectionPreview(section.content),
        '/expected_section_preview',
        ['read_content'],
        '/preview',
      ),
    ];
  }

  async function previewActiveScriptStyleMutation(
    operation: FacadeV1EditOperation,
  ): Promise<
    { data: unknown; routes: FacadeRoute[]; touched: string[]; requiredGuards: FacadeV1Guard[] } | ApiErrorResult
  > {
    const family = operation.selector.family;
    if (!isScriptStyleFamily(family)) {
      return facadeApiError(400, 'Unsupported script/style family', 'Use trigger, lua, or css selectors.');
    }
    const read = await readActiveScriptStyleItem(family, operation.selector);
    if (isApiError(read)) return read;
    const parts = scriptStyleRouteParts(family);
    const touched = [`${family}:${read.index}`];

    if (family === 'trigger') {
      const currentComment = recordString(read.current, 'comment') ?? '';
      const conflict = guardConflict(operation.guards, 'expected_comment', currentComment, `trigger:${read.index}`);
      if (conflict) return conflict;
      const commentGuard = buildGuard(
        'expected_comment',
        currentComment,
        '/expected_comment',
        [parts.readTool],
        '/trigger/comment',
      );
      if (operation.op === 'write_content') {
        const data = asRecord(operation.content);
        if (!data) {
          return facadeApiError(
            400,
            'trigger write_content requires an object',
            'Set operations[].content to trigger fields.',
          );
        }
        const picked = pickAllowedRecordFields(data, EXTERNAL_TRIGGER_ALLOWED_FIELDS);
        return {
          data: {
            dryRun: true,
            operation: 'write_content',
            index: read.index,
            currentComment,
            updatedKeys: Object.keys(picked),
          },
          routes: [...read.routes, route(parts.writeTool, 'POST', parts.writePath(read.index))],
          touched,
          requiredGuards: mergeGuards(operation.guards, [commentGuard]),
        };
      }
      if (operation.op === 'delete_item') {
        return {
          data: { dryRun: true, operation: 'delete_item', index: read.index, currentComment },
          routes: [
            ...read.routes,
            route(parts.deleteTool ?? 'delete_trigger', 'POST', parts.deletePath?.(read.index) ?? ''),
          ],
          touched,
          requiredGuards: mergeGuards(operation.guards, [commentGuard]),
        };
      }
      return facadeApiError(
        400,
        `Unsupported trigger preview operation: ${operation.op}`,
        'Trigger facade mutations currently support write_content and delete_item.',
        { operation },
      );
    }

    const conflict = checkActiveSectionGuards(operation.guards, read.current, `${family}:${read.index}`);
    if (conflict) return conflict;
    const currentContent = recordString(read.current, 'content') ?? '';
    const sourceTool = parts.readTool;
    const guards = activeSectionGuards(read.current, sourceTool);

    if (operation.op === 'write_content') {
      const newContent = contentStringFromOperation(operation, `${family} write_content`);
      if (isApiError(newContent)) return newContent;
      return {
        data: {
          dryRun: true,
          operation: 'write_content',
          index: read.index,
          name: recordString(read.current, 'name') ?? '',
          oldSize: currentContent.length,
          newSize: newContent.length,
        },
        routes: [...read.routes, route(parts.writeTool, 'POST', parts.writePath(read.index))],
        touched,
        requiredGuards: mergeGuards(operation.guards, guards),
      };
    }

    if (operation.op === 'replace_text') {
      const replacement = computeTextReplacement(currentContent, operation);
      if (isApiError(replacement)) return replacement;
      if (replacement.matchCount === 0) {
        return facadeApiError(
          404,
          `No matching text in ${family} section`,
          'Refresh the section content or adjust find/regex/flags before retrying.',
          { index: read.index },
          ['read_content', 'preview_edit'],
        );
      }
      return {
        data: {
          dryRun: true,
          operation: 'replace_text',
          index: read.index,
          name: recordString(read.current, 'name') ?? '',
          matchCount: replacement.matchCount,
          oldSize: currentContent.length,
          newSize: replacement.newContent.length,
        },
        routes: [
          ...read.routes,
          route(parts.replaceTool ?? `${family}_replace`, 'POST', parts.replacePath?.(read.index) ?? ''),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, guards),
      };
    }

    if (operation.op === 'insert_text') {
      const inserted = insertSpecFromOperation(currentContent, operation);
      if (isApiError(inserted)) return inserted;
      return {
        data: {
          dryRun: true,
          operation: 'insert_text',
          index: read.index,
          name: recordString(read.current, 'name') ?? '',
          position: inserted.position,
          oldSize: currentContent.length,
          newSize: inserted.newContent.length,
          insertedSize: inserted.insertedSize,
        },
        routes: [
          ...read.routes,
          route(parts.insertTool ?? `${family}_insert`, 'POST', parts.insertPath?.(read.index) ?? ''),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, guards),
      };
    }

    if (operation.op === 'delete_item') {
      const routePath = parts.deletePath?.(read.index);
      if (!routePath) {
        return facadeApiError(400, `${family} delete route is unavailable`, 'Retry with a current server.');
      }
      return {
        data: {
          dryRun: true,
          operation: 'delete_item',
          index: read.index,
          name: recordString(read.current, 'name') ?? '',
          oldSize: currentContent.length,
        },
        routes: [...read.routes, route(parts.deleteTool ?? `delete_${family}_section`, 'POST', routePath)],
        touched,
        requiredGuards: mergeGuards(operation.guards, guards),
      };
    }

    return facadeApiError(
      400,
      `Unsupported ${family} preview operation: ${operation.op}`,
      'Script/style facade mutations support write_content, replace_text, insert_text, and delete_item.',
      { operation },
    );
  }

  async function applyActiveScriptStyleMutation(
    operation: FacadeV1EditOperation,
    guards: FacadeV1Guard[] | undefined,
  ): Promise<{ data: unknown; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    const family = operation.selector.family;
    if (!isScriptStyleFamily(family)) {
      return facadeApiError(400, 'Unsupported script/style family', 'Use trigger, lua, or css selectors.');
    }
    const read = await readActiveScriptStyleItem(family, operation.selector);
    if (isApiError(read)) return read;
    const parts = scriptStyleRouteParts(family);
    const touched = [`${family}:${read.index}`];

    if (family === 'trigger') {
      const currentComment = recordString(read.current, 'comment') ?? '';
      const conflict = guardConflict(guards, 'expected_comment', currentComment, `trigger:${read.index}`);
      if (conflict) return conflict;
      if (operation.op === 'write_content') {
        const data = asRecord(operation.content);
        if (!data) {
          return facadeApiError(
            400,
            'trigger write_content requires an object',
            'Set operations[].content to trigger fields.',
          );
        }
        const picked = pickAllowedRecordFields(data, EXTERNAL_TRIGGER_ALLOWED_FIELDS);
        const routePath = parts.writePath(read.index);
        const applied = await apiRequest('POST', routePath, {
          ...picked,
          expected_comment: stringGuardValue(guards, 'expected_comment'),
        });
        return isApiError(applied)
          ? applied
          : { data: applied, routes: [...read.routes, route(parts.writeTool, 'POST', routePath)], touched };
      }
      if (operation.op === 'delete_item') {
        const routePath = parts.deletePath?.(read.index);
        if (!routePath)
          return facadeApiError(400, 'Trigger delete route is unavailable', 'Retry with a current server.');
        const applied = await apiRequest('POST', routePath, {
          expected_comment: stringGuardValue(guards, 'expected_comment'),
        });
        return isApiError(applied)
          ? applied
          : {
              data: applied,
              routes: [...read.routes, route(parts.deleteTool ?? 'delete_trigger', 'POST', routePath)],
              touched,
            };
      }
      return facadeApiError(
        400,
        `Unsupported trigger apply operation: ${operation.op}`,
        'Use write_content or delete_item.',
      );
    }

    const conflict = checkActiveSectionGuards(guards, read.current, `${family}:${read.index}`);
    if (conflict) return conflict;
    const currentContent = recordString(read.current, 'content') ?? '';

    if (operation.op === 'write_content') {
      const content = contentStringFromOperation(operation, `${family} write_content`);
      if (isApiError(content)) return content;
      const routePath = parts.writePath(read.index);
      const applied = await apiRequest('POST', routePath, {
        content,
        expected_hash: stringGuardValue(guards, 'expected_hash'),
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(applied)
        ? applied
        : { data: applied, routes: [...read.routes, route(parts.writeTool, 'POST', routePath)], touched };
    }

    if (operation.op === 'replace_text') {
      const replacement = computeTextReplacement(currentContent, operation);
      if (isApiError(replacement)) return replacement;
      if (replacement.matchCount === 0) {
        return facadeApiError(404, `No matching text in ${family} section`, 'Refresh the section and retry.');
      }
      const routePath = parts.replacePath?.(read.index);
      if (!routePath)
        return facadeApiError(400, `${family} replace route is unavailable`, 'Retry with a current server.');
      const applied = await apiRequest('POST', routePath, {
        find: operation.find,
        replace: typeof operation.replace === 'string' ? operation.replace : '',
        regex: operation.regex,
        flags: operation.flags,
        expected_hash: stringGuardValue(guards, 'expected_hash'),
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(applied)
        ? applied
        : {
            data: applied,
            routes: [...read.routes, route(parts.replaceTool ?? `${family}_replace`, 'POST', routePath)],
            touched,
          };
    }

    if (operation.op === 'insert_text') {
      const inserted = insertSpecFromOperation(currentContent, operation);
      if (isApiError(inserted)) return inserted;
      const contentRecord = asRecord(operation.content);
      const insertContent = contentStringFromOperation(operation, `${family} insert_text`);
      if (isApiError(insertContent)) return insertContent;
      const routePath = parts.insertPath?.(read.index);
      if (!routePath)
        return facadeApiError(400, `${family} insert route is unavailable`, 'Retry with a current server.');
      const applied = await apiRequest('POST', routePath, {
        content: insertContent,
        position: inserted.position,
        anchor: recordString(contentRecord, 'anchor'),
        expected_hash: stringGuardValue(guards, 'expected_hash'),
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(applied)
        ? applied
        : {
            data: applied,
            routes: [...read.routes, route(parts.insertTool ?? `${family}_insert`, 'POST', routePath)],
            touched,
          };
    }

    if (operation.op === 'delete_item') {
      const routePath = parts.deletePath?.(read.index);
      if (!routePath) {
        return facadeApiError(400, `${family} delete route is unavailable`, 'Retry with a current server.');
      }
      const applied = await apiRequest('POST', routePath, {
        expected_hash: stringGuardValue(guards, 'expected_hash'),
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(applied)
        ? applied
        : {
            data: applied,
            routes: [...read.routes, route(parts.deleteTool ?? `delete_${family}_section`, 'POST', routePath)],
            touched,
          };
    }

    return facadeApiError(400, `Unsupported ${family} apply operation: ${operation.op}`, 'Re-run preview_edit.');
  }

  interface ExternalStructuredPatchPlan {
    data: Record<string, unknown>;
    operations: Array<Record<string, unknown>>;
    routes: FacadeRoute[];
    touched: string[];
    requiredGuards: FacadeV1Guard[];
  }

  function externalExpectedHashGuard(beforeHash: string): FacadeV1Guard {
    return buildGuard(
      'expected_hash',
      beforeHash,
      '/expected_hash',
      ['preview_edit'],
      '/result/previews/*/data/before_hash',
    );
  }

  async function buildExternalScriptStylePatchPlan(
    target: FacadeV1Target,
    operation: FacadeV1EditOperation,
    guards: FacadeV1Guard[] | undefined,
  ): Promise<ExternalStructuredPatchPlan | ApiErrorResult> {
    if (target.kind !== 'external') {
      return facadeApiError(
        400,
        'External script/style mutation requires target.kind="external"',
        'Use an unopened external .charx/.risum file target or open the file and use active selectors.',
      );
    }
    const family = operation.selector.family;
    if (!isScriptStyleFamily(family)) {
      return facadeApiError(400, 'Unsupported external script/style family', 'Use trigger, lua, or css selectors.');
    }

    if (family === 'trigger') {
      const read = await readExternalRecordArraySurface(target.file_path, '/triggerScripts', 'trigger');
      if (isApiError(read)) return read;
      const indices = resolveTriggerSelectorIndices(
        read.entries,
        operation.selector,
        `external trigger ${operation.op}`,
      );
      if (!Array.isArray(indices)) return indices;
      if (indices.length !== 1) {
        return facadeApiError(
          400,
          'External trigger mutation requires one item',
          'Use selector.index or a unique selector.identity for trigger write/delete operations.',
          { selector: operation.selector, count: indices.length },
        );
      }
      const index = indices[0];
      const currentEntry = read.entries[index];
      const currentComment = recordString(currentEntry, 'comment') ?? '';
      const conflict = guardConflict(guards, 'expected_comment', currentComment, `external:trigger:${index}`);
      if (conflict) return conflict;
      const commentGuard = buildGuard(
        'expected_comment',
        currentComment,
        '/expected_comment',
        ['read_content'],
        '/items/*/comment',
      );
      const targetPath = `/triggerScripts/${jsonPointerSegment(index)}`;
      const touched = [`external:${target.file_path}:trigger:${index}`];

      if (operation.op === 'write_content') {
        const data = asRecord(operation.content);
        if (!data) {
          return facadeApiError(
            400,
            'External trigger write_content requires an object',
            'Set operations[].content to partial trigger script fields.',
            { operation },
          );
        }
        const picked = pickAllowedRecordFields(data, EXTERNAL_TRIGGER_ALLOWED_FIELDS);
        if (Object.keys(picked).length === 0) {
          return facadeApiError(
            400,
            'External trigger write_content has no supported fields',
            'Provide at least one supported trigger script field.',
            { supportedFields: [...EXTERNAL_TRIGGER_ALLOWED_FIELDS] },
          );
        }
        return {
          data: {
            dryRun: true,
            operation: 'write_content',
            index,
            currentComment,
            updatedKeys: Object.keys(picked),
          },
          operations: [{ op: 'replace', path: targetPath, value: { ...currentEntry, ...picked } }],
          routes: read.routes,
          touched,
          requiredGuards: mergeGuards(guards, [commentGuard]),
        };
      }

      if (operation.op === 'delete_item') {
        return {
          data: { dryRun: true, operation: 'delete_item', index, currentComment },
          operations: [{ op: 'remove', path: targetPath }],
          routes: read.routes,
          touched,
          requiredGuards: mergeGuards(guards, [commentGuard]),
        };
      }

      return facadeApiError(
        400,
        `Unsupported external trigger operation: ${operation.op}`,
        'External trigger facade mutations currently support write_content and delete_item.',
        { operation },
      );
    }

    const surfacePath = family === 'lua' ? '/lua' : '/css';
    const read = await readExternalTextSurface(target.file_path, surfacePath, family);
    if (isApiError(read)) return read;
    const parsed =
      family === 'lua'
        ? { sections: parseLuaSections(read.text) as TextSection[], prefix: '', suffix: '' }
        : (parseCssSections(read.text) as { sections: TextSection[]; prefix: string; suffix: string });
    const indices = resolveSectionSelectorIndices(
      parsed.sections,
      operation.selector,
      `external ${family} ${operation.op}`,
    );
    if (!Array.isArray(indices)) return indices;
    if (indices.length !== 1) {
      return facadeApiError(
        400,
        `External ${family} mutation requires one section`,
        'Use selector.index or a unique selector.identity for section write/replace/insert/delete operations.',
        { selector: operation.selector, count: indices.length },
      );
    }
    const index = indices[0];
    const section = parsed.sections[index];
    const conflict = checkExternalSectionGuards(guards, section, `external:${family}:${index}`);
    if (conflict) return conflict;
    const nextSections = parsed.sections.map((item) => ({ ...item }));
    const touched = [`external:${target.file_path}:${family}:${index}`];

    let data: Record<string, unknown>;
    if (operation.op === 'write_content') {
      const newContent = contentStringFromOperation(operation, `external ${family} write_content`);
      if (isApiError(newContent)) return newContent;
      nextSections[index] = { ...section, content: newContent };
      data = {
        dryRun: true,
        operation: 'write_content',
        index,
        name: section.name,
        oldSize: section.content.length,
        newSize: newContent.length,
      };
    } else if (operation.op === 'replace_text') {
      const replacement = computeTextReplacement(section.content, operation);
      if (isApiError(replacement)) return replacement;
      if (replacement.matchCount === 0) {
        return facadeApiError(
          404,
          `No matching text in external ${family} section`,
          'Refresh the section content or adjust find/regex/flags before retrying.',
          { index },
          ['read_content', 'preview_edit'],
        );
      }
      nextSections[index] = { ...section, content: replacement.newContent };
      data = {
        dryRun: true,
        operation: 'replace_text',
        index,
        name: section.name,
        matchCount: replacement.matchCount,
        oldSize: section.content.length,
        newSize: replacement.newContent.length,
      };
    } else if (operation.op === 'insert_text') {
      const inserted = insertSpecFromOperation(section.content, operation);
      if (isApiError(inserted)) return inserted;
      nextSections[index] = { ...section, content: inserted.newContent };
      data = {
        dryRun: true,
        operation: 'insert_text',
        index,
        name: section.name,
        position: inserted.position,
        oldSize: section.content.length,
        newSize: inserted.newContent.length,
        insertedSize: inserted.insertedSize,
      };
    } else if (operation.op === 'delete_item') {
      if (nextSections.length <= 1) {
        return facadeApiError(
          400,
          `Cannot delete the only external ${family} section`,
          'Use write_content with an empty string if you want to clear the section while preserving the surface.',
          { index },
        );
      }
      nextSections.splice(index, 1);
      data = {
        dryRun: true,
        operation: 'delete_item',
        index,
        name: section.name,
        oldSize: section.content.length,
      };
    } else {
      return facadeApiError(
        400,
        `Unsupported external ${family} operation: ${operation.op}`,
        'External lua/css facade mutations support write_content, replace_text, insert_text, and delete_item.',
        { operation },
      );
    }

    const newSurface =
      family === 'lua'
        ? combineLuaSections(nextSections)
        : combineCssSections(nextSections, parsed.prefix, parsed.suffix);
    return {
      data,
      operations: [{ op: 'replace', path: surfacePath, value: newSurface }],
      routes: read.routes,
      touched,
      requiredGuards: mergeGuards(guards, externalSectionGuards(section)),
    };
  }

  async function buildExternalStructuredPatchPlan(
    target: FacadeV1Target,
    operation: FacadeV1EditOperation,
    guards: FacadeV1Guard[] | undefined,
  ): Promise<ExternalStructuredPatchPlan | ApiErrorResult> {
    if (target.kind !== 'external') {
      return facadeApiError(
        400,
        'External structured mutation requires target.kind="external"',
        'Use an unopened external .charx/.risum file target or open the file and use active selectors.',
      );
    }

    if (operation.selector.family === 'lorebook') {
      const read = await readExternalRecordArraySurface(target.file_path, '/lorebook', 'lorebook');
      if (isApiError(read)) return read;
      const indices = resolveExternalLorebookSelectorIndices(
        read.entries,
        operation.selector,
        `external lorebook ${operation.op}`,
      );
      if (!Array.isArray(indices)) return indices;
      if (indices.length !== 1) {
        return facadeApiError(
          400,
          'External lorebook mutation requires one item',
          'Use selector.id or selector.index for lorebook write/delete/replace operations.',
          { selector: operation.selector, count: indices.length },
        );
      }
      const index = indices[0];
      const currentEntry = read.entries[index];
      const currentComment = recordString(currentEntry, 'comment') ?? '';
      const conflict = guardConflict(guards, 'expected_comment', currentComment, `external:lorebook:${index}`);
      if (conflict) return conflict;
      const commentGuard = buildGuard(
        'expected_comment',
        currentComment,
        '/expected_comment',
        ['read_content'],
        '/entries/*/comment',
      );
      const targetPath = `/lorebook/${jsonPointerSegment(index)}`;
      const touched = [`external:${target.file_path}:lorebook:${index}`];

      if (operation.op === 'write_content') {
        const data = asRecord(operation.content);
        if (!data) {
          return facadeApiError(
            400,
            'External lorebook write_content requires an object',
            'Set operations[].content to partial lorebook entry data.',
            { operation },
          );
        }
        const picked = pickAllowedRecordFields(data, EXTERNAL_LOREBOOK_ALLOWED_FIELDS);
        if (Object.keys(picked).length === 0) {
          return facadeApiError(
            400,
            'External lorebook write_content has no supported fields',
            'Provide at least one supported lorebook entry field.',
            { supportedFields: [...EXTERNAL_LOREBOOK_ALLOWED_FIELDS] },
          );
        }
        return {
          data: {
            dryRun: true,
            operation: 'write_content',
            index,
            id: externalLorebookStableId(currentEntry, index, read.entries),
            currentComment,
            updatedKeys: Object.keys(picked),
          },
          operations: [{ op: 'replace', path: targetPath, value: { ...currentEntry, ...picked } }],
          routes: read.routes,
          touched,
          requiredGuards: mergeGuards(guards, [commentGuard]),
        };
      }

      if (operation.op === 'delete_item') {
        return {
          data: {
            dryRun: true,
            operation: 'delete_item',
            index,
            id: externalLorebookStableId(currentEntry, index, read.entries),
            currentComment,
          },
          operations: [{ op: 'remove', path: targetPath }],
          routes: read.routes,
          touched,
          requiredGuards: mergeGuards(guards, [commentGuard]),
        };
      }

      if (operation.op === 'replace_text') {
        const field = lorebookReplaceField(operation) ?? 'content';
        if (!EXTERNAL_LOREBOOK_REPLACEABLE_FIELDS.has(field)) {
          return facadeApiError(
            400,
            `External lorebook field "${field}" does not support replace_text`,
            `Supported fields: ${[...EXTERNAL_LOREBOOK_REPLACEABLE_FIELDS].join(', ')}`,
            { field },
          );
        }
        const oldContent = typeof currentEntry[field] === 'string' ? (currentEntry[field] as string) : '';
        const replacement = computeTextReplacement(oldContent, operation);
        if (isApiError(replacement)) return replacement;
        if (replacement.matchCount === 0) {
          return facadeApiError(
            404,
            'No matching text in external lorebook entry',
            'Refresh the entry content or adjust find/regex/flags before retrying.',
            { index, field },
            ['read_content', 'preview_edit'],
          );
        }
        return {
          data: {
            dryRun: true,
            operation: 'replace_text',
            index,
            id: externalLorebookStableId(currentEntry, index, read.entries),
            currentComment,
            field,
            matchCount: replacement.matchCount,
            oldSize: oldContent.length,
            newSize: replacement.newContent.length,
          },
          operations: [
            {
              op: 'replace',
              path: `${targetPath}/${jsonPointerSegment(field)}`,
              value: replacement.newContent,
            },
          ],
          routes: read.routes,
          touched: [`external:${target.file_path}:lorebook:${index}:${field}`],
          requiredGuards: mergeGuards(guards, [commentGuard]),
        };
      }
    }

    if (operation.selector.family === 'regex') {
      const read = await readExternalRecordArraySurface(target.file_path, '/regex', 'regex');
      if (isApiError(read)) return read;
      const indices = resolveExternalRegexSelectorIndices(
        read.entries,
        operation.selector,
        `external regex ${operation.op}`,
      );
      if (!Array.isArray(indices)) return indices;
      const touched = indices.map((index) => `external:${target.file_path}:regex:${index}`);

      if (operation.op === 'write_content') {
        const writes =
          operation.selector.indices && operation.selector.indices.length > 0
            ? normalizeBatchEntries(operation, 'data')
            : undefined;
        if (writes && isApiError(writes)) return writes;
        const patchOperations: Array<Record<string, unknown>> = [];
        const previews: Array<Record<string, unknown>> = [];
        const derivedGuards: FacadeV1Guard[] = [];
        const writeRecords = writes ?? indices.map((index) => ({ index, data: asRecord(operation.content) }));
        for (const [position, write] of writeRecords.entries()) {
          const index = recordNumber(write, 'index');
          const data = asRecord(write.data);
          if (index === undefined || !data) {
            return facadeApiError(
              400,
              'External regex write_content requires object data',
              'Set operations[].content to partial regex entry data, or align content.entries with selector.indices.',
              { write, position },
            );
          }
          const currentEntry = read.entries[index];
          const currentComment = recordString(currentEntry, 'comment') ?? '';
          const expectedComment =
            recordString(write, 'expected_comment') ??
            (writes
              ? stringGuardValueAtPath(guards, 'expected_comment', `/entries/${position}/expected_comment`)
              : stringGuardValue(guards, 'expected_comment'));
          if (expectedComment !== undefined && expectedComment !== currentComment) {
            return facadeApiError(
              409,
              'Stale guard mismatch for expected_comment',
              'Refresh external regex summaries, then run preview_edit again.',
              {
                target: `external:regex:${index}`,
                guard: 'expected_comment',
                expected: expectedComment,
                actual: currentComment,
              },
              ['read_content', 'preview_edit'],
            );
          }
          const picked = pickAllowedRecordFields(data, EXTERNAL_REGEX_ALLOWED_FIELDS);
          if (Object.keys(picked).length === 0) {
            return facadeApiError(
              400,
              'External regex write_content has no supported fields',
              'Provide at least one supported regex entry field.',
              { supportedFields: [...EXTERNAL_REGEX_ALLOWED_FIELDS] },
            );
          }
          patchOperations.push({
            op: 'replace',
            path: `/regex/${jsonPointerSegment(index)}`,
            value: { ...currentEntry, ...picked },
          });
          previews.push({ index, currentComment, updatedKeys: Object.keys(picked) });
          derivedGuards.push(
            buildGuard(
              'expected_comment',
              currentComment,
              writes ? `/entries/${position}/expected_comment` : '/expected_comment',
              ['read_content'],
              '/entries/*/comment',
            ),
          );
        }
        return {
          data: { dryRun: true, operation: 'write_content', count: patchOperations.length, entries: previews },
          operations: patchOperations,
          routes: read.routes,
          touched,
          requiredGuards: mergeGuards(guards, derivedGuards),
        };
      }

      if (operation.op === 'delete_item') {
        if (indices.length !== 1) {
          return facadeApiError(
            400,
            'External regex delete_item requires one item',
            'Use selector.identity or selector.index for regex delete operations.',
            { selector: operation.selector, count: indices.length },
          );
        }
        const index = indices[0];
        const currentEntry = read.entries[index];
        const currentComment = recordString(currentEntry, 'comment') ?? '';
        const conflict = guardConflict(guards, 'expected_comment', currentComment, `external:regex:${index}`);
        if (conflict) return conflict;
        return {
          data: { dryRun: true, operation: 'delete_item', index, currentComment },
          operations: [{ op: 'remove', path: `/regex/${jsonPointerSegment(index)}` }],
          routes: read.routes,
          touched,
          requiredGuards: mergeGuards(guards, [
            buildGuard('expected_comment', currentComment, '/expected_comment', ['read_content'], '/entries/*/comment'),
          ]),
        };
      }
    }

    if (operation.selector.family === 'greeting') {
      if (operation.selector.greeting_type !== 'alternate') {
        return facadeApiError(
          400,
          'External greeting mutations support alternate greetings only',
          'groupOnlyGreetings is deprecated and protected from normal mutation.',
          { selector: operation.selector },
        );
      }
      const read = await readExternalStringArraySurface(target.file_path, '/alternateGreetings', 'greeting');
      if (isApiError(read)) return read;
      const indices = resolveExternalGreetingSelectorIndices(
        read.entries,
        operation.selector,
        `external greeting ${operation.op}`,
      );
      if (!Array.isArray(indices)) return indices;
      const touched = indices.map((index) => `external:${target.file_path}:greeting:alternate:${index}`);

      if (operation.op === 'write_content') {
        const writes =
          operation.selector.indices && operation.selector.indices.length > 0
            ? normalizeBatchEntries(operation, 'content')
            : undefined;
        if (writes && isApiError(writes)) return writes;
        const patchOperations: Array<Record<string, unknown>> = [];
        const previews: Array<Record<string, unknown>> = [];
        const derivedGuards: FacadeV1Guard[] = [];
        const writeRecords = writes ?? indices.map((index) => ({ index, content: operation.content }));
        for (const [position, write] of writeRecords.entries()) {
          const index = recordNumber(write, 'index');
          if (index === undefined) {
            return facadeApiError(
              400,
              'External greeting write_content requires an index',
              'Use selector.index, selector.identity, or aligned selector.indices plus content.writes.',
              { write, position },
            );
          }
          const currentContent = read.entries[index];
          const currentPreview = greetingPreview(currentContent);
          const expectedPreview =
            recordString(write, 'expected_preview') ??
            (writes
              ? stringGuardValueAtPath(guards, 'expected_preview', `/writes/${position}/expected_preview`)
              : stringGuardValue(guards, 'expected_preview'));
          if (expectedPreview !== undefined && expectedPreview !== currentPreview) {
            return facadeApiError(
              409,
              'Stale guard mismatch for expected_preview',
              'Refresh external greeting summaries, then run preview_edit again.',
              {
                target: `external:greeting:alternate:${index}`,
                guard: 'expected_preview',
                expected: expectedPreview,
                actual: currentPreview,
              },
              ['read_content', 'preview_edit'],
            );
          }
          const newContent = replacementString(write.content);
          patchOperations.push({
            op: 'replace',
            path: `/alternateGreetings/${jsonPointerSegment(index)}`,
            value: newContent,
          });
          previews.push({ index, oldSize: currentContent.length, newSize: newContent.length });
          derivedGuards.push(
            buildGuard(
              'expected_preview',
              currentPreview,
              writes ? `/writes/${position}/expected_preview` : '/expected_preview',
              ['read_content'],
              '/items/*/preview',
            ),
          );
        }
        return {
          data: {
            dryRun: true,
            operation: 'write_content',
            type: 'alternate',
            count: patchOperations.length,
            writes: previews,
          },
          operations: patchOperations,
          routes: read.routes,
          touched,
          requiredGuards: mergeGuards(guards, derivedGuards),
        };
      }

      if (operation.op === 'delete_item') {
        const contentRecord = asRecord(operation.content);
        const expectedPreviews = Array.isArray(contentRecord?.expected_previews)
          ? contentRecord.expected_previews
          : undefined;
        const patchOperations: Array<Record<string, unknown>> = [];
        const previews: Array<Record<string, unknown>> = [];
        const derivedGuards: FacadeV1Guard[] = [];
        for (const [position, index] of indices.entries()) {
          const currentContent = read.entries[index];
          const currentPreview = greetingPreview(currentContent);
          const expectedPreview =
            typeof expectedPreviews?.[position] === 'string'
              ? expectedPreviews[position]
              : indices.length > 1
                ? stringGuardValueAtPath(guards, 'expected_previews', `/expected_previews/${position}`)
                : stringGuardValue(guards, 'expected_preview');
          if (expectedPreview !== undefined && expectedPreview !== currentPreview) {
            return facadeApiError(
              409,
              'Stale guard mismatch for expected_preview',
              'Refresh external greeting summaries, then run preview_edit again.',
              {
                target: `external:greeting:alternate:${index}`,
                guard: 'expected_preview',
                expected: expectedPreview,
                actual: currentPreview,
              },
              ['read_content', 'preview_edit'],
            );
          }
          previews.push({ index, preview: currentPreview, oldSize: currentContent.length });
          derivedGuards.push(
            buildGuard(
              indices.length > 1 ? 'expected_previews' : 'expected_preview',
              currentPreview,
              indices.length > 1 ? `/expected_previews/${position}` : '/expected_preview',
              ['read_content'],
              '/items/*/preview',
            ),
          );
        }
        for (const index of [...indices].sort((a, b) => b - a)) {
          patchOperations.push({ op: 'remove', path: `/alternateGreetings/${jsonPointerSegment(index)}` });
        }
        return {
          data: { dryRun: true, operation: 'delete_item', type: 'alternate', count: indices.length, deletes: previews },
          operations: patchOperations,
          routes: read.routes,
          touched,
          requiredGuards: mergeGuards(guards, derivedGuards),
        };
      }
    }

    return facadeApiError(
      400,
      `Unsupported external structured operation: ${operation.op}`,
      'External structured facade parity currently supports lorebook write/delete/replace, regex write/delete, and alternate greeting write/delete.',
      { operation },
    );
  }

  async function previewExternalStructuredMutation(
    target: FacadeV1Target,
    operation: FacadeV1EditOperation,
  ): Promise<
    { data: unknown; routes: FacadeRoute[]; touched: string[]; requiredGuards: FacadeV1Guard[] } | ApiErrorResult
  > {
    const plan = await buildExternalStructuredPatchPlan(target, operation, operation.guards);
    if (isApiError(plan)) return plan;
    const routePath = '/external/surface/patch';
    const dryRun = await apiRequest('POST', routePath, {
      file_path: target.kind === 'external' ? target.file_path : undefined,
      operations: plan.operations,
      dry_run: true,
      expected_hash: guardValue(operation.guards, 'expected_hash'),
    });
    if (isApiError(dryRun)) return dryRun;
    const beforeHash = recordString(asRecord(dryRun), 'before_hash');
    return {
      data: { ...plan.data, ...(asRecord(dryRun) ?? {}) },
      routes: [...plan.routes, route('external_patch_surface', 'POST', routePath)],
      touched: plan.touched,
      requiredGuards: mergeGuards(plan.requiredGuards, [
        beforeHash ? externalExpectedHashGuard(beforeHash) : undefined,
      ]),
    };
  }

  async function applyExternalStructuredMutation(
    target: FacadeV1Target,
    operation: FacadeV1EditOperation,
    guards: FacadeV1Guard[] | undefined,
  ): Promise<{ data: unknown; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    const plan = await buildExternalStructuredPatchPlan(target, operation, guards);
    if (isApiError(plan)) return plan;
    const routePath = '/external/surface/patch';
    const data = await apiRequest('POST', routePath, {
      file_path: target.kind === 'external' ? target.file_path : undefined,
      operations: plan.operations,
      expected_hash: guardValue(guards, 'expected_hash'),
    });
    return isApiError(data)
      ? data
      : {
          data: { ...(asRecord(data) ?? {}), operation: operation.op, structured_family: operation.selector.family },
          routes: [...plan.routes, route('external_patch_surface', 'POST', routePath)],
          touched: plan.touched,
        };
  }
  return {
    itemByIndex,
    rewriteOperationBatchContent,
    selectorTags,
    risupPromptItemPreview,
    risupPromptItemSummary,
    findRisupPromptItemMatchedFields,
    readExternalRisupPromptModel,
    EXTERNAL_LOREBOOK_ALLOWED_FIELDS,
    EXTERNAL_REGEX_ALLOWED_FIELDS,
    EXTERNAL_LOREBOOK_REPLACEABLE_FIELDS,
    hashStableValue,
    normalizeLFString,
    jsonPointerSegment,
    pickAllowedRecordFields,
    externalLorebookStableId,
    externalLorebookSummary,
    externalRegexSummary,
    externalGreetingSummary,
    readExternalSurfaceValue,
    readExternalRecordArraySurface,
    readExternalStringArraySurface,
    readExternalStructuredSelector,
    computeSurfaceReplacement,
    EXTERNAL_TRIGGER_ALLOWED_FIELDS,
    isScriptStyleFamily,
    scriptStyleRouteParts,
    sectionSummary,
    triggerSummary,
    readExternalTextSurface,
    readExternalScriptStyleSelector,
    contentStringFromOperation,
    insertSpecFromOperation,
    resolveActiveScriptStyleIndex,
    previewActiveScriptStyleMutation,
    applyActiveScriptStyleMutation,
    externalExpectedHashGuard,
    buildExternalScriptStylePatchPlan,
    previewExternalStructuredMutation,
    applyExternalStructuredMutation,
  };
}

export type FacadeScriptStyleEngine = ReturnType<typeof createFacadeScriptStyleEngine>;
