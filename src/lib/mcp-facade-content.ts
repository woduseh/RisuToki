// eslint-disable-next-line @typescript-eslint/no-require-imports
import fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import path = require('path');

import { get_encoding } from '@dqbd/tiktoken';
import { LuaFactory } from 'wasmoon';
import { validateCharxExportCompatibilityFile } from './charx-export-compatibility';
import { runRegexPipeline, simulateLorebookActivation } from './content-simulation';
import {
  asRecord,
  facadeApiError,
  isApiError,
  recordNumber,
  recordString,
  route,
  selectorFamily,
  selectorTarget,
  uniqueStrings,
  type ApiErrorResult,
  type FacadePreviewEntry,
  type FacadeRoute,
} from './mcp-facade-runtime';
import type { FacadeItemsEngine } from './mcp-facade-items';
import type { FacadeApiRequest, FacadeScriptStyleEngine } from './mcp-facade-script-style';
import {
  FACADE_V1_CONTRACT_ID,
  FACADE_V1_LIMITS,
  type FacadeV1AnalyzeOperation,
  type FacadeV1ContentSelector,
  type FacadeV1EditOperation,
  type FacadeV1Target,
  type FacadeV1ToolMutability,
} from './mcp-request-schemas';
import { mcpSuccess } from './mcp-response-envelope';

interface DanbooruTagLike {
  id: number;
  name: string;
  category: number;
  count: number;
}

interface DanbooruTagValidationLike {
  tag: string;
  status: 'valid' | 'invalid' | 'unknown';
  valid: boolean | null;
  category?: string;
  post_count?: number;
  suggestions?: string[];
}

interface FacadeContentDanbooruDeps {
  ensureTagsLoaded: () => void;
  formatTags: (tags: DanbooruTagLike[]) => Array<{ name: string; category: string; post_count: number }>;
  getDanbooruStatus: () => {
    loaded: boolean;
    tagCount: number;
    filePath: string;
    fileExists: boolean;
  };
  getPopular: (category?: string, limit?: number) => DanbooruTagLike[];
  getPopularGrouped: () => Record<string, string[]>;
  searchWithOnline: (query: string, category?: string, limit?: number) => Promise<DanbooruTagLike[]>;
  validateTags: (tags: string[], onlineFallback?: boolean) => Promise<DanbooruTagValidationLike[]>;
}

type FacadeContentItemsDeps = Pick<FacadeItemsEngine, 'resolveRisupPromptSelectorIndices'>;
type FacadeContentScriptStyleDeps = Pick<
  FacadeScriptStyleEngine,
  | 'isScriptStyleFamily'
  | 'jsonPointerSegment'
  | 'readExternalRisupPromptModel'
  | 'readExternalScriptStyleSelector'
  | 'readExternalStructuredSelector'
  | 'readExternalSurfaceValue'
  | 'resolveActiveScriptStyleIndex'
  | 'risupPromptItemPreview'
  | 'risupPromptItemSummary'
  | 'scriptStyleRouteParts'
  | 'selectorTags'
>;

export interface FacadeContentEngineDeps {
  apiRequest: FacadeApiRequest;
  danbooru: FacadeContentDanbooruDeps;
  items: FacadeContentItemsDeps;
  scriptStyle: FacadeContentScriptStyleDeps;
}

export function createFacadeContentEngine({ apiRequest, danbooru, items, scriptStyle }: FacadeContentEngineDeps) {
  const {
    ensureTagsLoaded,
    formatTags,
    getDanbooruStatus,
    getPopular,
    getPopularGrouped,
    searchWithOnline,
    validateTags,
  } = danbooru;
  const { resolveRisupPromptSelectorIndices } = items;
  const {
    isScriptStyleFamily,
    jsonPointerSegment,
    readExternalRisupPromptModel,
    readExternalScriptStyleSelector,
    readExternalStructuredSelector,
    readExternalSurfaceValue,
    resolveActiveScriptStyleIndex,
    risupPromptItemPreview,
    risupPromptItemSummary,
    scriptStyleRouteParts,
    selectorTags,
  } = scriptStyle;

  // ==================== Facade v1 Helpers ====================

  function surfaceValueOverview(value: unknown): Record<string, unknown> {
    if (Array.isArray(value)) {
      return {
        kind: 'array',
        length: value.length,
        sampleTypes: value
          .slice(0, 10)
          .map((item) => (Array.isArray(item) ? 'array' : item === null ? 'null' : typeof item)),
      };
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record);
      return {
        kind: 'object',
        keyCount: keys.length,
        keys: keys.slice(0, 80),
        omittedKeys: Math.max(0, keys.length - 80),
        childSummary: Object.fromEntries(
          keys.slice(0, 30).map((key) => {
            const child = record[key];
            if (Array.isArray(child)) return [key, { kind: 'array', length: child.length }];
            if (child && typeof child === 'object')
              return [key, { kind: 'object', keyCount: Object.keys(child).length }];
            if (typeof child === 'string') return [key, { kind: 'string', length: child.length }];
            return [key, { kind: child === null ? 'null' : typeof child }];
          }),
        ),
      };
    }
    if (typeof value === 'string') return { kind: 'string', length: value.length, preview: value.slice(0, 300) };
    return { kind: value === null ? 'null' : typeof value };
  }

  function maybeOverviewSurfaceRead(data: unknown, selector: FacadeV1ContentSelector): unknown {
    const pathValue = selector.path ?? '/';
    if (selector.include_raw === true || (pathValue !== '/' && pathValue !== '')) return data;
    const record = asRecord(data);
    if (!record || !('value' in record)) return data;
    return {
      ...record,
      value: undefined,
      overview: surfaceValueOverview(record.value),
      raw_omitted: true,
      continuation_hint:
        'Root surface raw JSON is omitted by default. Re-run read_content with selector.include_raw=true and explicit max_bytes, or choose a narrower selector.path.',
    };
  }

  function hasRisupPromptImportContext(operation: FacadeV1EditOperation): boolean {
    const content = operation.content;
    if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
    const keys = Object.keys(content);
    return keys.some((key) =>
      ['import', 'imported', 'source', 'source_text', 'sourcePath', 'source_path'].includes(key),
    );
  }

  function applyEditPostEditMetadata(entry: FacadePreviewEntry): {
    nextActions: string[];
    artifacts: Record<string, unknown>;
  } {
    const editedFamilies = uniqueStrings(
      entry.operations.map((operation) => selectorFamily(operation.selector)),
    ).sort();
    const touchedSelectors = entry.operations.map((operation) => operation.selector);
    const hasImportContext = entry.operations.some(
      (operation) => selectorFamily(operation.selector) === 'risup-prompt' && hasRisupPromptImportContext(operation),
    );
    const nextActions: string[] = [];
    const postEditValidation: Array<Record<string, unknown>> = [];
    const recommendedReads: Array<Record<string, unknown>> = [];
    const recommendedDiffs: Array<Record<string, unknown>> = [];

    if (editedFamilies.includes('lorebook')) {
      nextActions.push('validate_content', 'read_content', 'analyze_content');
      postEditValidation.push({
        family: 'lorebook',
        tools: ['validate_content'],
        reason: 'Check active lorebook key hygiene after lorebook mutations.',
      });
      recommendedReads.push({
        family: 'lorebook',
        tool: 'read_content',
        target: entry.target,
        selectors: touchedSelectors.filter((selector) => selectorFamily(selector) === 'lorebook'),
      });
      recommendedDiffs.push({
        family: 'lorebook',
        tool: 'analyze_content',
        operation: { action: 'diff_lorebook' },
        selectors: touchedSelectors.filter((selector) => selectorFamily(selector) === 'lorebook'),
        note: 'Run when a reference lorebook entry is available for comparison.',
      });
    }

    if (editedFamilies.includes('risup-prompt')) {
      nextActions.push('validate_content', 'read_content', 'analyze_content');
      postEditValidation.push({
        family: 'risup-prompt',
        tools: hasImportContext ? ['validate_content', 'analyze_content'] : ['validate_content'],
        reason: hasImportContext
          ? 'Import/source context was present; verify the imported prompt structure.'
          : 'Check promptTemplate/formatingOrder structure, then read back the edited item.',
      });
      recommendedReads.push({
        family: 'risup-prompt',
        tool: 'read_content',
        target: entry.target,
        selectors: touchedSelectors.filter((selector) => selectorFamily(selector) === 'risup-prompt'),
      });
      recommendedDiffs.push({
        family: 'risup-prompt',
        tool: 'analyze_content',
        operation: { action: 'diff_risup_prompt' },
        ...(hasImportContext ? { import_validation_operation: { action: 'verify_risup_prompt_import' } } : {}),
      });
    }

    if (editedFamilies.some((family) => family === 'field' || family === 'surface')) {
      nextActions.push('read_content', 'search_document');
      recommendedReads.push({
        family: 'field-surface',
        tool: 'read_content',
        target: entry.target,
        selectors: touchedSelectors.filter((selector) => {
          const family = selectorFamily(selector);
          return family === 'field' || family === 'surface';
        }),
      });
    }

    for (const family of editedFamilies) {
      if (!['field', 'surface', 'lorebook', 'risup-prompt'].includes(family)) {
        nextActions.push('read_content', 'search_document');
        recommendedReads.push({
          family,
          tool: 'read_content',
          target: entry.target,
          selectors: touchedSelectors.filter((selector) => selectorFamily(selector) === family),
          note: 'Unsupported facade edit family; use readback/search before choosing granular validators.',
        });
      }
    }

    if (nextActions.length === 0) nextActions.push('read_content', 'search_document');

    return {
      nextActions: uniqueStrings(nextActions),
      artifacts: {
        edited_families: editedFamilies,
        post_edit_validation: postEditValidation,
        recommended_reads: recommendedReads,
        recommended_diffs: recommendedDiffs,
      },
    };
  }

  function facadeEnvelope(
    tool: string,
    mutability: FacadeV1ToolMutability,
    target: FacadeV1Target | undefined,
    result: Record<string, unknown>,
    summary: string,
    nextActions: string[],
    artifacts: Record<string, unknown> = {},
    maxBytes?: number,
  ) {
    let truncated = false;
    let finalResult: Record<string, unknown> = result;
    const serializedResult = JSON.stringify(result);
    const resultBytes = Buffer.byteLength(serializedResult, 'utf8');
    if (maxBytes && resultBytes > maxBytes) {
      truncated = true;
      const continuationHint =
        'Narrow the selector, use search_document, or pass an explicit max_bytes when you need a larger bounded read.';
      const sourceBytes = Buffer.from(serializedResult, 'utf8');
      let low = 0;
      let high = Math.min(sourceBytes.length, maxBytes);
      let best: Record<string, unknown> = {
        truncated: true,
        preview: '',
        original_byte_size: resultBytes,
        returned_byte_size: 0,
        continuation_hint: continuationHint,
      };
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        let end = mid;
        let preview = '';
        while (end >= 0) {
          const candidateBytes = sourceBytes.subarray(0, end);
          preview = candidateBytes.toString('utf8');
          if (Buffer.from(preview, 'utf8').equals(candidateBytes)) break;
          end--;
        }
        const candidate: Record<string, unknown> = {
          truncated: true,
          preview,
          original_byte_size: resultBytes,
          preview_byte_size: end,
          returned_byte_size: 0,
          continuation_hint: continuationHint,
        };
        let candidateSize = 0;
        for (let iteration = 0; iteration < 4; iteration++) {
          candidate.returned_byte_size = candidateSize;
          const nextSize = Buffer.byteLength(JSON.stringify(candidate), 'utf8');
          if (nextSize === candidateSize) break;
          candidateSize = nextSize;
        }
        candidate.returned_byte_size = Buffer.byteLength(JSON.stringify(candidate), 'utf8');
        if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') <= maxBytes) {
          best = candidate;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      finalResult = best;
    }
    const returnedResultBytes = Buffer.byteLength(JSON.stringify(finalResult), 'utf8');

    return mcpSuccess(
      {
        facade: {
          contract: FACADE_V1_CONTRACT_ID,
          version: 'v1',
          tool,
          mutability,
          ...(target ? { target } : {}),
          ...(maxBytes ? { max_bytes: maxBytes } : {}),
          ...(truncated ? { truncated: true } : {}),
          response_bytes: returnedResultBytes,
          original_response_bytes: resultBytes,
        },
        result: finalResult,
      },
      {
        toolName: tool,
        summary,
        nextActions,
        artifacts: {
          ...artifacts,
          result_byte_size: resultBytes,
          returned_byte_size: returnedResultBytes,
          ...(truncated
            ? {
                truncated: true,
                original_byte_size: resultBytes,
                continuation_hint:
                  'Narrow the selector, use search_document, or pass an explicit max_bytes when you need a larger bounded read.',
              }
            : {}),
        },
      },
    );
  }

  async function resolveReferenceIndex(target: FacadeV1Target): Promise<number | ApiErrorResult> {
    if (target.kind !== 'reference')
      return facadeApiError(400, 'Target is not a reference', 'Use target.kind="reference".');
    if (target.reference_id && /^\d+$/.test(target.reference_id)) return Number(target.reference_id);
    const refs = await apiRequest('GET', '/references');
    if (isApiError(refs)) return refs;
    const files = referenceEntriesFromResponse(refs);
    const index = files.findIndex((ref, i) => {
      const candidates = [
        String(i),
        ...(typeof ref.index === 'number' ? [String(ref.index)] : []),
        ref.id,
        ref.filePath,
        ref.file_path,
        ref.fileName,
        ref.name,
      ].filter((value): value is string => typeof value === 'string');
      return candidates.includes(target.reference_id ?? '') || candidates.includes(target.file_path ?? '');
    });
    if (index < 0) {
      return facadeApiError(
        404,
        'Reference target not found',
        'Call list_references, then retry with reference_id as its index.',
      );
    }
    return index;
  }

  function referenceEntriesFromResponse(refs: unknown): Array<Record<string, unknown>> {
    const record = asRecord(refs);
    const entries = Array.isArray(record?.references)
      ? record.references
      : Array.isArray(record?.files)
        ? record.files
        : [];
    return entries.filter(
      (entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry),
    );
  }

  async function readFacadeSelector(
    target: FacadeV1Target,
    selector: FacadeV1ContentSelector,
  ): Promise<{ data: unknown; routes: FacadeRoute[] } | ApiErrorResult> {
    if (target.kind === 'active') {
      if (selector.family === 'lorebook') {
        if (selector.id) {
          const lorebookRoute = `/lorebook/by-id/${encodeURIComponent(selector.id)}`;
          const data = await apiRequest('GET', lorebookRoute);
          return isApiError(data) ? data : { data, routes: [route('read_lorebook_by_id', 'GET', lorebookRoute)] };
        }
        if (selector.index !== undefined) {
          const lorebookRoute = `/lorebook/${selector.index}`;
          const data = await apiRequest('GET', lorebookRoute);
          return isApiError(data) ? data : { data, routes: [route('read_lorebook', 'GET', lorebookRoute)] };
        }
        if (selector.indices) {
          const data = await apiRequest('POST', '/lorebook/batch', {
            indices: selector.indices,
            ...(selector.field ? { fields: [selector.field] } : {}),
          });
          return isApiError(data) ? data : { data, routes: [route('read_lorebook_batch', 'POST', '/lorebook/batch')] };
        }
        const data = await apiRequest('GET', '/lorebook');
        return isApiError(data) ? data : { data, routes: [route('list_lorebook', 'GET', '/lorebook')] };
      }
      if (selector.family === 'regex') {
        if (selector.identity) {
          const data = await apiRequest('POST', '/regex/by-identity/read', { identity: selector.identity });
          return isApiError(data)
            ? data
            : { data, routes: [route('read_regex_by_identity', 'POST', '/regex/by-identity/read')] };
        }
        if (selector.index !== undefined) {
          const regexRoute = `/regex/${selector.index}`;
          const data = await apiRequest('GET', regexRoute);
          return isApiError(data) ? data : { data, routes: [route('read_regex', 'GET', regexRoute)] };
        }
        if (selector.indices) {
          const data = await apiRequest('POST', '/regex/batch', { indices: selector.indices });
          return isApiError(data) ? data : { data, routes: [route('read_regex_batch', 'POST', '/regex/batch')] };
        }
        const data = await apiRequest('GET', '/regex');
        return isApiError(data) ? data : { data, routes: [route('list_regex', 'GET', '/regex')] };
      }
      if (selector.family === 'greeting') {
        if (!selector.greeting_type) {
          return facadeApiError(
            400,
            'Unsupported greeting selector',
            'read_content greeting selectors require greeting_type="alternate" or "group"; the facade will not guess between alternateGreetings and groupOnlyGreetings.',
            { selector },
          );
        }
        const type = encodeURIComponent(selector.greeting_type);
        if (selector.identity) {
          const greetingRoute = `/greeting/${type}/by-hash/read`;
          const data = await apiRequest('POST', greetingRoute, { identity: selector.identity });
          return isApiError(data) ? data : { data, routes: [route('read_greeting_by_hash', 'POST', greetingRoute)] };
        }
        if (selector.index !== undefined) {
          const greetingRoute = `/greeting/${type}/${selector.index}`;
          const data = await apiRequest('GET', greetingRoute);
          return isApiError(data) ? data : { data, routes: [route('read_greeting', 'GET', greetingRoute)] };
        }
        if (selector.indices) {
          const greetingRoute = `/greeting/${type}/batch`;
          const data = await apiRequest('POST', greetingRoute, { indices: selector.indices });
          return isApiError(data) ? data : { data, routes: [route('read_greeting_batch', 'POST', greetingRoute)] };
        }
        const greetingRoute = `/greetings/${type}`;
        const data = await apiRequest('GET', greetingRoute);
        return isApiError(data) ? data : { data, routes: [route('list_greetings', 'GET', greetingRoute)] };
      }
      if (selector.family === 'risup-prompt') {
        if (selector.id) {
          const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(selector.id)}`;
          const data = await apiRequest('GET', promptRoute);
          return isApiError(data)
            ? data
            : { data, routes: [route('read_risup_prompt_item_by_id', 'GET', promptRoute)] };
        }
        if (selector.index !== undefined) {
          const promptRoute = `/risup/prompt-item/${selector.index}`;
          const data = await apiRequest('GET', promptRoute);
          return isApiError(data) ? data : { data, routes: [route('read_risup_prompt_item', 'GET', promptRoute)] };
        }
        if (selector.indices) {
          const data = await apiRequest('POST', '/risup/prompt-item/batch', { indices: selector.indices });
          return isApiError(data)
            ? data
            : { data, routes: [route('read_risup_prompt_item_batch', 'POST', '/risup/prompt-item/batch')] };
        }
        const data = await apiRequest('GET', '/risup/prompt-items');
        return isApiError(data)
          ? data
          : { data, routes: [route('list_risup_prompt_items', 'GET', '/risup/prompt-items')] };
      }
      if (isScriptStyleFamily(selector.family)) {
        const parts = scriptStyleRouteParts(selector.family);
        if (selector.index !== undefined) {
          const itemRoute = parts.readPath(selector.index);
          const data = await apiRequest('GET', itemRoute);
          return isApiError(data) ? data : { data, routes: [route(parts.readTool, 'GET', itemRoute)] };
        }
        if (selector.indices) {
          const data = await apiRequest('POST', parts.batchPath, { indices: selector.indices });
          return isApiError(data) ? data : { data, routes: [route(parts.batchTool, 'POST', parts.batchPath)] };
        }
        if (selector.identity) {
          const resolved = await resolveActiveScriptStyleIndex(selector.family, selector);
          if (isApiError(resolved)) return resolved;
          const itemRoute = parts.readPath(resolved.index);
          const data = await apiRequest('GET', itemRoute);
          return isApiError(data)
            ? data
            : { data, routes: [...resolved.routes, route(parts.readTool, 'GET', itemRoute)] };
        }
        const data = await apiRequest('GET', parts.listPath);
        return isApiError(data) ? data : { data, routes: [route(parts.listTool, 'GET', parts.listPath)] };
      }
      if (selector.family === 'surface' || selector.path) {
        const pathValue = selector.path ?? '/';
        const data = await apiRequest('POST', '/surface/read', { path: pathValue });
        return isApiError(data)
          ? data
          : {
              data: maybeOverviewSurfaceRead(data, selector),
              routes: [route('read_surface', 'POST', '/surface/read')],
            };
      }
      if (selector.field) {
        const fieldRoute = `/field/${encodeURIComponent(selector.field)}`;
        const data = await apiRequest('GET', fieldRoute);
        return isApiError(data) ? data : { data, routes: [route('read_field', 'GET', fieldRoute)] };
      }
    }

    if (target.kind === 'external') {
      if (selector.family === 'lorebook' || selector.family === 'regex' || selector.family === 'greeting') {
        return readExternalStructuredSelector(target, selector);
      }
      if (selector.family === 'risup-prompt') {
        const externalPrompt = await readExternalRisupPromptModel(target.file_path);
        if (isApiError(externalPrompt)) return externalPrompt;
        const indices = resolveRisupPromptSelectorIndices(externalPrompt.model, selector, 'read external risup prompt');
        if (!Array.isArray(indices)) return indices;
        if (selector.id || selector.index !== undefined || selector.ids || selector.indices) {
          const entries = indices.map((index) => {
            const item = externalPrompt.model.items[index];
            return {
              index,
              id: item.id ?? null,
              item: item.rawValue,
              supported: item.supported,
              type: item.type ?? null,
              preview: risupPromptItemPreview(item),
            };
          });
          return {
            data: {
              file_path: target.file_path,
              count: entries.length,
              total: indices.length,
              entries,
            },
            routes: externalPrompt.routes,
          };
        }
        return {
          data: {
            file_path: target.file_path,
            count: externalPrompt.model.items.length,
            state: externalPrompt.model.state,
            hasUnsupportedContent: externalPrompt.model.hasUnsupportedContent,
            items: externalPrompt.model.items.map(risupPromptItemSummary),
          },
          routes: externalPrompt.routes,
        };
      }
      if (isScriptStyleFamily(selector.family)) {
        return readExternalScriptStyleSelector(target, selector);
      }
      if (selector.family === 'surface' || selector.path) {
        const data = await apiRequest('POST', '/external/surface/read', {
          file_path: target.file_path,
          path: selector.path ?? '/',
        });
        return isApiError(data)
          ? data
          : {
              data: maybeOverviewSurfaceRead(data, selector),
              routes: [route('external_read_surface', 'POST', '/external/surface/read')],
            };
      }
      if (selector.field) {
        const fieldRoute = `/probe/field/${encodeURIComponent(selector.field)}`;
        const data = await apiRequest('POST', fieldRoute, { file_path: target.file_path });
        return isApiError(data) ? data : { data, routes: [route('probe_field', 'POST', fieldRoute)] };
      }
    }

    if (target.kind === 'reference') {
      const index = await resolveReferenceIndex(target);
      if (typeof index !== 'number') return index;
      if (selector.family === 'lorebook') {
        if (selector.index !== undefined) {
          const lorebookRoute = `/reference/${index}/lorebook/${selector.index}`;
          const data = await apiRequest('GET', lorebookRoute);
          return isApiError(data) ? data : { data, routes: [route('read_reference_lorebook', 'GET', lorebookRoute)] };
        }
        if (selector.indices) {
          const data = await apiRequest('POST', `/reference/${index}/lorebook/batch`, {
            indices: selector.indices,
            ...(selector.field ? { fields: [selector.field] } : {}),
          });
          return isApiError(data)
            ? data
            : {
                data,
                routes: [route('read_reference_lorebook_batch', 'POST', `/reference/${index}/lorebook/batch`)],
              };
        }
        const lorebookRoute = `/reference/${index}/lorebook`;
        const data = await apiRequest('GET', lorebookRoute);
        return isApiError(data) ? data : { data, routes: [route('list_reference_lorebook', 'GET', lorebookRoute)] };
      }
      if (selector.family === 'regex') {
        if (selector.index !== undefined) {
          const regexRoute = `/reference/${index}/regex/${selector.index}`;
          const data = await apiRequest('GET', regexRoute);
          return isApiError(data) ? data : { data, routes: [route('read_reference_regex', 'GET', regexRoute)] };
        }
        if (selector.indices) {
          const regexRoute = `/reference/${index}/regex/batch`;
          const data = await apiRequest('POST', regexRoute, { indices: selector.indices });
          return isApiError(data) ? data : { data, routes: [route('read_reference_regex_batch', 'POST', regexRoute)] };
        }
        const regexRoute = `/reference/${index}/regex`;
        const data = await apiRequest('GET', regexRoute);
        return isApiError(data) ? data : { data, routes: [route('list_reference_regex', 'GET', regexRoute)] };
      }
      if (selector.family === 'greeting') {
        if (!selector.greeting_type) {
          return facadeApiError(
            400,
            'Unsupported greeting selector',
            'read_content greeting selectors require greeting_type="alternate" or "group"; the facade will not guess between alternateGreetings and groupOnlyGreetings.',
            { selector },
          );
        }
        const type = encodeURIComponent(selector.greeting_type);
        if (selector.index !== undefined) {
          const greetingRoute = `/reference/${index}/greeting/${type}/${selector.index}`;
          const data = await apiRequest('GET', greetingRoute);
          return isApiError(data) ? data : { data, routes: [route('read_reference_greeting', 'GET', greetingRoute)] };
        }
        if (selector.indices) {
          const greetingRoute = `/reference/${index}/greeting/${type}/batch`;
          const data = await apiRequest('POST', greetingRoute, { indices: selector.indices });
          return isApiError(data)
            ? data
            : { data, routes: [route('read_reference_greeting_batch', 'POST', greetingRoute)] };
        }
        const greetingRoute = `/reference/${index}/greetings/${type}`;
        const data = await apiRequest('GET', greetingRoute);
        return isApiError(data) ? data : { data, routes: [route('list_reference_greetings', 'GET', greetingRoute)] };
      }
      if (selector.family === 'risup-prompt') {
        if (selector.index !== undefined) {
          const promptRoute = `/reference/${index}/risup/prompt-item/${selector.index}`;
          const data = await apiRequest('GET', promptRoute);
          return isApiError(data)
            ? data
            : { data, routes: [route('read_reference_risup_prompt_item', 'GET', promptRoute)] };
        }
        if (selector.indices) {
          const promptRoute = `/reference/${index}/risup/prompt-items/batch`;
          const data = await apiRequest('POST', promptRoute, { indices: selector.indices });
          return isApiError(data)
            ? data
            : { data, routes: [route('read_reference_risup_prompt_item_batch', 'POST', promptRoute)] };
        }
        const promptRoute = `/reference/${index}/risup/prompt-items`;
        const data = await apiRequest('GET', promptRoute);
        return isApiError(data)
          ? data
          : { data, routes: [route('list_reference_risup_prompt_items', 'GET', promptRoute)] };
      }
      if (isScriptStyleFamily(selector.family)) {
        if (selector.index !== undefined) {
          const itemRoute =
            selector.family === 'trigger'
              ? `/reference/${index}/trigger/${selector.index}`
              : `/reference/${index}/${selector.family}/${selector.index}`;
          const toolName =
            selector.family === 'trigger'
              ? 'read_reference_trigger'
              : selector.family === 'lua'
                ? 'read_reference_lua'
                : 'read_reference_css';
          const data = await apiRequest('GET', itemRoute);
          return isApiError(data) ? data : { data, routes: [route(toolName, 'GET', itemRoute)] };
        }
        if (selector.indices) {
          const batchRoute =
            selector.family === 'trigger'
              ? `/reference/${index}/trigger/batch`
              : `/reference/${index}/${selector.family}/batch`;
          const toolName =
            selector.family === 'trigger'
              ? 'read_reference_trigger_batch'
              : selector.family === 'lua'
                ? 'read_reference_lua_batch'
                : 'read_reference_css_batch';
          const data = await apiRequest('POST', batchRoute, { indices: selector.indices });
          return isApiError(data) ? data : { data, routes: [route(toolName, 'POST', batchRoute)] };
        }
        const listRoute =
          selector.family === 'trigger' ? `/reference/${index}/triggers` : `/reference/${index}/${selector.family}`;
        const toolName =
          selector.family === 'trigger'
            ? 'list_reference_triggers'
            : selector.family === 'lua'
              ? 'list_reference_lua'
              : 'list_reference_css';
        const data = await apiRequest('GET', listRoute);
        return isApiError(data) ? data : { data, routes: [route(toolName, 'GET', listRoute)] };
      }
      if (selector.field) {
        const fieldRoute = `/reference/${index}/${encodeURIComponent(selector.field)}`;
        const data = await apiRequest('GET', fieldRoute);
        return isApiError(data) ? data : { data, routes: [route('read_reference_field', 'GET', fieldRoute)] };
      }
    }

    return facadeApiError(
      400,
      `Unsupported read_content selector for target kind "${target.kind}"`,
      'read_content supports active/reference lorebook, regex, greeting, and risup-prompt selectors; field and surface selectors remain available for active/external targets.',
      { selector },
    );
  }

  async function validateFacadeSelectors(
    target: FacadeV1Target,
    selectors: FacadeV1ContentSelector[] | undefined,
  ): Promise<{ result: Record<string, unknown>; routes: FacadeRoute[]; touchedTargets: string[] } | ApiErrorResult> {
    const luaSelectors = selectors?.filter((selector) => selector.family === 'lua' || selector.family === 'trigger');
    if (luaSelectors?.length && luaSelectors.length === selectors?.length) {
      const validations: Array<{ selector: FacadeV1ContentSelector; data: unknown }> = [];
      const routes: FacadeRoute[] = [];
      const touchedTargets: string[] = [];
      for (const selector of luaSelectors) {
        const validation = await validateLuaFacadeSelector(target, selector);
        if (isApiError(validation)) return validation;
        validations.push({ selector, data: validation.data });
        routes.push(...validation.routes);
        touchedTargets.push(...validation.touchedTargets);
      }
      return {
        result: {
          validations,
          routed_legacy: routes,
          touched_targets: uniqueStrings(touchedTargets),
        },
        routes,
        touchedTargets: uniqueStrings(touchedTargets),
      };
    }

    if (target.kind !== 'active') {
      if (target.kind === 'external') {
        const exportCompatibilitySelector = selectors?.find(
          (selector) => selector.family === 'asset' || selector.field === 'exportCompatibility',
        );
        if (exportCompatibilitySelector) {
          const data = validateExternalCharxExportCompatibility(target.file_path);
          if (isApiError(data)) return data;
          const routes = [route('validate_charx_export_compatibility', 'FILE', 'validateCharxExportCompatibilityFile')];
          const touchedTarget = `external:${target.file_path}:charx-exportCompatibility`;
          return {
            result: {
              validations: [{ selector: exportCompatibilitySelector, data }],
              routed_legacy: routes,
              touched_targets: [touchedTarget],
              source_workflow: true,
            },
            routes,
            touchedTargets: [touchedTarget],
          };
        }
        const risumSelector = selectors?.find((selector) => selector.family === 'risum');
        if (risumSelector) {
          const validation = await validateExternalRisumSemanticFields(target.file_path, risumSelector);
          if (isApiError(validation)) return validation;
          const touchedTarget = `external:${target.file_path}:risum`;
          return {
            result: {
              validations: [{ selector: risumSelector, data: validation.data }],
              routed_legacy: validation.routes,
              touched_targets: [touchedTarget],
              source_workflow: true,
            },
            routes: validation.routes,
            touchedTargets: [touchedTarget],
          };
        }
      }
      if (selectors?.some((selector) => selector.family === 'plugin-v3') && target.kind === 'external') {
        const scan = scanPluginV3Source(target.file_path);
        if (isApiError(scan)) return scan;
        return {
          result: {
            validations: [{ selector: selectors[0], data: scan }],
            routed_legacy: [],
            touched_targets: [`plugin-v3:${target.file_path}`],
            source_workflow: true,
          },
          routes: [],
          touchedTargets: [`plugin-v3:${target.file_path}`],
        };
      }
      if (
        target.kind === 'external' &&
        selectors?.some((selector) => selector.family === 'risup-prompt' || selector.field === 'promptTemplate')
      ) {
        const externalPrompt = await readExternalRisupPromptModel(target.file_path);
        if (isApiError(externalPrompt)) return externalPrompt;
        return {
          result: {
            validations: [
              {
                selector: selectors[0],
                data: {
                  file_path: target.file_path,
                  state: externalPrompt.model.state,
                  count: externalPrompt.model.items.length,
                  hasUnsupportedContent: externalPrompt.model.hasUnsupportedContent,
                  ok: externalPrompt.model.state !== 'invalid',
                },
              },
            ],
            routed_legacy: externalPrompt.routes,
            touched_targets: [`external:${target.file_path}:risup-prompt`],
            source_workflow: true,
          },
          routes: externalPrompt.routes,
          touchedTargets: [`external:${target.file_path}:risup-prompt`],
        };
      }
      return facadeApiError(
        400,
        `Unsupported validate_content target kind "${target.kind}"`,
        'validate_content supports active-document validators plus external .charx export compatibility, external .risum semantic fields, external Plugin v3, and external .risup prompt scans. Use inspect_document/read_content for other external or reference preflight.',
        undefined,
        ['inspect_document', 'read_content'],
      );
    }

    const actualSelectors: FacadeV1ContentSelector[] =
      selectors && selectors.length > 0 ? selectors : [{ family: 'lorebook' }];
    const validations: Array<{ selector: FacadeV1ContentSelector; data: unknown }> = [];
    const routes: FacadeRoute[] = [];
    const touchedTargets: string[] = [];

    for (const selector of actualSelectors) {
      if (selector.family === 'lua' || selector.family === 'trigger') {
        const validation = await validateLuaFacadeSelector(target, selector);
        if (isApiError(validation)) return validation;
        validations.push({ selector, data: validation.data });
        routes.push(...validation.routes);
        touchedTargets.push(...validation.touchedTargets);
        continue;
      }

      if (selector.family === 'lorebook') {
        const data = await apiRequest('GET', '/lorebook/validate');
        if (isApiError(data)) return data;
        validations.push({ selector, data });
        routes.push(route('validate_lorebook_keys', 'GET', '/lorebook/validate'));
        touchedTargets.push('lorebook');
        continue;
      }

      if (selector.family === 'risup-prompt' || selector.field === 'promptTemplate') {
        const data = await apiRequest('GET', '/risup/prompt-items');
        if (isApiError(data)) return data;
        validations.push({ selector, data });
        routes.push(route('list_risup_prompt_items', 'GET', '/risup/prompt-items'));
        touchedTargets.push('risup:promptTemplate');
        continue;
      }

      if (selector.family === 'regex') {
        const list = await apiRequest('GET', '/regex');
        if (isApiError(list)) return list;
        const listEntries = Array.isArray(asRecord(list)?.entries)
          ? (asRecord(list)?.entries as Record<string, unknown>[])
          : [];
        const indices =
          selector.index !== undefined
            ? [selector.index]
            : (selector.indices ?? listEntries.map((entry) => Number(entry.index)));
        const data = await apiRequest('POST', '/regex/batch', { indices });
        if (isApiError(data)) return data;
        validations.push({ selector, data: validateRegexEntries(data) });
        routes.push(route('list_regex', 'GET', '/regex'), route('read_regex_batch', 'POST', '/regex/batch'));
        touchedTargets.push(selector.index !== undefined || selector.indices ? selectorTarget(selector) : 'regex');
        continue;
      }

      if (selector.family === 'cbs' || (selector.field && selector.field.toLowerCase().includes('cbs'))) {
        const params = new URLSearchParams();
        if (selector.field) params.set('field', selector.field);
        if (selector.index !== undefined) params.set('lorebook_index', String(selector.index));
        const qs = params.toString();
        const data = await apiRequest('GET', `/cbs/validate${qs ? '?' + qs : ''}`);
        if (isApiError(data)) return data;
        validations.push({ selector, data });
        routes.push(route('validate_cbs', 'GET', `/cbs/validate${qs ? '?' + qs : ''}`));
        touchedTargets.push(selectorTarget(selector));
        continue;
      }

      if (selector.family === 'danbooru') {
        const tags = selectorTags(selector);
        if (tags.length === 0) {
          return facadeApiError(
            400,
            'Danbooru validation requires tags',
            'Provide selector.tags (preferred) or selector.fields as the Danbooru tags to validate.',
            { selector },
            ['validate_danbooru_tags'],
          );
        }
        ensureTagsLoaded();
        const data = await validateTags(tags, true);
        const counts = {
          valid: data.filter((result) => result.status === 'valid').length,
          invalid: data.filter((result) => result.status === 'invalid').length,
          unknown: data.filter((result) => result.status === 'unknown').length,
        };
        validations.push({
          selector,
          data: {
            summary: `${counts.valid} valid, ${counts.invalid} invalid, ${counts.unknown} unknown`,
            counts,
            network_degraded: counts.unknown > 0,
            results: data,
          },
        });
        routes.push(route('validate_danbooru_tags', 'MCP', 'mcp://validate_danbooru_tags'));
        touchedTargets.push('danbooru');
        continue;
      }

      if (selector.family === 'asset' || selector.field === 'exportCompatibility') {
        const data = await apiRequest('GET', '/charx/export-compatibility');
        if (isApiError(data)) return data;
        validations.push({ selector, data });
        routes.push(route('validate_charx_export_compatibility', 'GET', '/charx/export-compatibility'));
        touchedTargets.push('charx:exportCompatibility');
        continue;
      }

      if (selector.family === 'plugin-v3') {
        return facadeApiError(
          400,
          'Plugin v3 validation is a source workflow',
          'Use target.kind="external" with the .js/.ts plugin source file, then call load_guidance for writing-plugins-v3.',
          { selector },
          ['load_guidance', 'validate_content'],
        );
      }

      if (selector.family === 'risum') {
        const fields = selector.fields ?? [
          'moduleNamespace',
          'namespace',
          'lowLevelAccess',
          'backgroundEmbedding',
          'customModuleToggle',
          'mcpUrl',
          'cjs',
        ];
        const data = await apiRequest('POST', '/field/batch', { fields });
        if (isApiError(data)) return data;
        const record = asRecord(data);
        const results = Array.isArray(record?.results) ? record.results : [];
        validations.push({
          selector,
          data: {
            fields,
            fields_result: data,
            consistency: {
              ok: true,
              warnings: results
                .map((result) => asRecord(result))
                .filter((result) => result?.ok === false || result?.error)
                .map((result) => ({ field: result?.field, error: result?.error ?? 'missing or unreadable' })),
            },
          },
        });
        routes.push(route('read_field_batch', 'POST', '/field/batch'));
        touchedTargets.push('risum');
        continue;
      }

      if (selector.field === 'formatingOrder') {
        const data = await apiRequest('GET', '/risup/formating-order');
        if (isApiError(data)) return data;
        validations.push({ selector, data });
        routes.push(route('read_risup_formating_order', 'GET', '/risup/formating-order'));
        touchedTargets.push('risup:formatingOrder');
        continue;
      }

      return facadeApiError(
        400,
        'Unsupported validate_content selector',
        'validate_content supports active lorebook, regex, CBS, Danbooru, charx export compatibility, risup-prompt, risum semantic fields, promptTemplate, and formatingOrder selectors; keep granular validators for imports, diffs, simulations, and unsupported source shapes.',
        { selector },
        ['validate_cbs', 'validate_danbooru_tags', 'read_content'],
      );
    }

    const uniqueTouchedTargets = uniqueStrings(touchedTargets);
    return {
      result: {
        validations,
        routed_legacy: routes,
        touched_targets: uniqueTouchedTargets,
        remaining_gaps: [
          'Exact legacy payloads, unsupported raw/batch/debug shapes, and non-artifact filesystem operations remain granular/advanced routes.',
        ],
      },
      routes,
      touchedTargets: uniqueTouchedTargets,
    };
  }

  interface LuaValidationSource {
    source: string;
    target: string;
    name: string;
  }

  function collectLuaValidationSources(family: 'lua' | 'trigger', data: unknown): LuaValidationSource[] {
    const record = asRecord(data);
    if (!record) return [];
    if (family === 'lua') {
      const directContent = recordString(record, 'content');
      if (directContent !== undefined) {
        return [
          {
            source: directContent,
            target: `lua:${recordNumber(record, 'index') ?? 0}`,
            name: recordString(record, 'name') ?? 'Lua section',
          },
        ];
      }
      const sections = Array.isArray(record.sections) ? record.sections : [];
      return sections.flatMap((item, position) => {
        const section = asRecord(item);
        const content = recordString(section, 'content');
        if (content === undefined) return [];
        const index = recordNumber(section, 'index') ?? position;
        return [
          {
            source: content,
            target: `lua:${index}`,
            name: recordString(section, 'name') ?? `Lua section ${index}`,
          },
        ];
      });
    }

    const triggerRecords: Array<{ index: number; trigger: Record<string, unknown> }> = [];
    if (asRecord(record.trigger)) {
      triggerRecords.push({ index: recordNumber(record, 'index') ?? 0, trigger: asRecord(record.trigger)! });
    }
    for (const key of ['triggers', 'items']) {
      const collection = Array.isArray(record[key]) ? (record[key] as unknown[]) : [];
      for (const [position, item] of collection.entries()) {
        const itemRecord = asRecord(item);
        const trigger = asRecord(itemRecord?.trigger);
        if (trigger) triggerRecords.push({ index: recordNumber(itemRecord, 'index') ?? position, trigger });
      }
    }
    return triggerRecords.flatMap(({ index, trigger }) => {
      const effects = Array.isArray(trigger.effect) ? trigger.effect : [];
      return effects.flatMap((effect, effectIndex) => {
        const effectRecord = asRecord(effect);
        const code = recordString(effectRecord, 'code');
        const type = recordString(effectRecord, 'type');
        if (!code || (type !== undefined && type !== 'triggerlua')) return [];
        return [
          {
            source: code,
            target: `trigger:${index}:effect:${effectIndex}`,
            name: `${recordString(trigger, 'comment') ?? `Trigger ${index}`} effect ${effectIndex}`,
          },
        ];
      });
    });
  }

  async function validateLuaFacadeSelector(
    target: FacadeV1Target,
    selector: FacadeV1ContentSelector,
  ): Promise<{ data: unknown; routes: FacadeRoute[]; touchedTargets: string[] } | ApiErrorResult> {
    const family = selector.family;
    if (family !== 'lua' && family !== 'trigger') {
      return facadeApiError(
        400,
        'Lua validation requires lua or trigger selector',
        'Use selector.family="lua" or "trigger".',
      );
    }
    const list = await readFacadeSelector(target, { family });
    if (isApiError(list)) return list;
    const countValue = asRecord(list.data)?.count;
    const count = typeof countValue === 'number' ? countValue : 0;
    const indices =
      selector.index !== undefined
        ? [selector.index]
        : (selector.indices ?? Array.from({ length: count }, (_, index) => index));
    const batchSize = family === 'lua' ? 20 : FACADE_V1_LIMITS.maxBatchItems;
    const sources: LuaValidationSource[] = [];
    const routes = [...list.routes];
    for (let offset = 0; offset < indices.length; offset += batchSize) {
      const batch = await readFacadeSelector(target, { family, indices: indices.slice(offset, offset + batchSize) });
      if (isApiError(batch)) return batch;
      routes.push(...batch.routes);
      sources.push(...collectLuaValidationSources(family, batch.data));
    }

    const factory = new LuaFactory();
    const engine = await factory.createEngine();
    const results: Array<Record<string, unknown>> = [];
    try {
      for (const source of sources) {
        engine.global.set('__risutoki_source', source.source);
        try {
          await engine.doString(`
          local fn, err = load(__risutoki_source, "=${source.target}", "t", {})
          if fn == nil then error(err, 0) end
        `);
          results.push({ target: source.target, name: source.name, ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const location = message.match(/:(\d+):/);
          results.push({
            target: source.target,
            name: source.name,
            ok: false,
            ...(location ? { line: Number(location[1]) } : {}),
            message,
          });
        }
      }
    } finally {
      engine.global.close();
    }
    return {
      data: {
        ok: results.every((result) => result.ok === true),
        count: results.length,
        results,
        execution: 'compile_only',
      },
      routes,
      touchedTargets: indices.map((index) => `${family}:${index}`),
    };
  }

  async function readAllFacadeCollectionEntries(
    target: FacadeV1Target,
    family: 'lorebook' | 'regex',
    requestedIndices?: number[],
  ): Promise<{ entries: Record<string, unknown>[]; routes: FacadeRoute[] } | ApiErrorResult> {
    const list = await readFacadeSelector(target, { family });
    if (isApiError(list)) return list;
    const listRecord = asRecord(list.data);
    const totalCandidate = listRecord?.total ?? listRecord?.count;
    const total = typeof totalCandidate === 'number' && Number.isInteger(totalCandidate) ? totalCandidate : 0;
    const indices = requestedIndices ?? Array.from({ length: total }, (_, index) => index);
    const entries: Record<string, unknown>[] = [];
    const routes = [...list.routes];
    for (let offset = 0; offset < indices.length; offset += FACADE_V1_LIMITS.maxBatchItems) {
      const batchIndices = indices.slice(offset, offset + FACADE_V1_LIMITS.maxBatchItems);
      const batch = await readFacadeSelector(target, { family, indices: batchIndices });
      if (isApiError(batch)) return batch;
      routes.push(...batch.routes);
      const rawBatchEntries = asRecord(batch.data)?.entries;
      const batchEntries = Array.isArray(rawBatchEntries) ? rawBatchEntries : [];
      for (const item of batchEntries) {
        const record = asRecord(item);
        const entry = asRecord(record?.entry);
        if (entry) {
          entries.push({
            ...entry,
            ...(typeof record?.index === 'number' ? { __mcpIndex: record.index } : {}),
          });
        }
      }
    }
    return { entries, routes };
  }

  function analysisTextValue(data: unknown): string {
    const record = asRecord(data);
    for (const key of ['content', 'value', 'text']) {
      if (typeof record?.[key] === 'string') return record[key] as string;
    }
    if (record?.entry !== undefined) return JSON.stringify(record.entry);
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  async function analyzeFacadeOperation(
    target: FacadeV1Target,
    operation: FacadeV1AnalyzeOperation,
  ): Promise<{ data: unknown; routes: FacadeRoute[]; touchedTargets: string[] } | ApiErrorResult> {
    if (operation.action === 'tag_db_status') {
      return {
        data: getDanbooruStatus(),
        routes: [route('tag_db_status', 'MCP', 'mcp://tag_db_status')],
        touchedTargets: ['danbooru:status'],
      };
    }

    if (operation.action === 'search_danbooru_tags') {
      ensureTagsLoaded();
      const results = await searchWithOnline(operation.query, operation.category, operation.limit ?? 20);
      return {
        data: { query: operation.query, count: results.length, tags: formatTags(results) },
        routes: [route('search_danbooru_tags', 'MCP', 'mcp://search_danbooru_tags')],
        touchedTargets: ['danbooru:search'],
      };
    }

    if (operation.action === 'get_popular_danbooru_tags') {
      ensureTagsLoaded();
      const popularTags = operation.group_by_semantic
        ? undefined
        : getPopular(operation.category, operation.limit ?? 100);
      const data = operation.group_by_semantic
        ? {
            description: 'Popular Danbooru tags grouped by semantic category.',
            groups: getPopularGrouped(),
          }
        : {
            count: popularTags!.length,
            tags: formatTags(popularTags!),
          };
      return {
        data,
        routes: [route('get_popular_danbooru_tags', 'MCP', 'mcp://get_popular_danbooru_tags')],
        touchedTargets: ['danbooru:popular'],
      };
    }

    if (operation.action === 'token_count') {
      const items: Array<{ selector?: FacadeV1ContentSelector; input?: 'text'; characters: number; tokens: number }> =
        [];
      const routes: FacadeRoute[] = [];
      const encoding = get_encoding(operation.encoding);
      try {
        const sources: Array<{ selector?: FacadeV1ContentSelector; input?: 'text'; text: string }> = [];
        if (operation.text !== undefined) {
          sources.push({ input: 'text', text: operation.text });
        } else {
          for (const selector of operation.selectors ?? []) {
            const read = await readFacadeSelector(target, selector);
            if (isApiError(read)) return read;
            routes.push(...read.routes);
            sources.push({ selector, text: analysisTextValue(read.data) });
          }
        }
        const inputBytes = sources.reduce((sum, source) => sum + Buffer.byteLength(source.text, 'utf8'), 0);
        if (inputBytes > 1024 * 1024) {
          return facadeApiError(
            413,
            'token_count input exceeds 1MB',
            'Narrow the selectors or count the content in smaller batches.',
            { input_bytes: inputBytes, max_input_bytes: 1024 * 1024 },
          );
        }
        for (const source of sources) {
          items.push({
            ...(source.selector ? { selector: source.selector } : { input: 'text' as const }),
            characters: Array.from(source.text).length,
            tokens: encoding.encode(source.text).length,
          });
        }
        return {
          data: {
            encoding: operation.encoding,
            exact_for_encoding: true,
            model_equivalence: 'not_asserted',
            total_tokens: items.reduce((sum, item) => sum + item.tokens, 0),
            total_characters: items.reduce((sum, item) => sum + item.characters, 0),
            items,
          },
          routes,
          touchedTargets: operation.selectors?.map((selector) => selectorTarget(selector)) ?? [
            'token-count:direct-text',
          ],
        };
      } finally {
        encoding.free();
      }
    }

    if (operation.action === 'simulate_lorebook') {
      const collection = await readAllFacadeCollectionEntries(target, 'lorebook');
      if (isApiError(collection)) return collection;
      const messages = operation.messages.map((message) => ({
        role: message.role === 'assistant' || message.role === 'system' ? ('char' as const) : message.role,
        content: message.content,
      }));
      return {
        data: simulateLorebookActivation({
          messages,
          lorebook: collection.entries,
          scanDepth: operation.scan_depth,
          recursive: operation.recursive,
          maxPasses: operation.max_passes,
          includeContent: operation.include_content,
        }),
        routes: collection.routes,
        touchedTargets: ['lorebook'],
      };
    }

    if (operation.action === 'test_regex') {
      const collection = await readAllFacadeCollectionEntries(target, 'regex', operation.indices);
      if (isApiError(collection)) return collection;
      return {
        data: runRegexPipeline(operation.text, collection.entries, operation.mode),
        routes: collection.routes,
        touchedTargets: operation.indices?.map((index) => `regex:${index}`) ?? ['regex'],
      };
    }

    if (target.kind !== 'active') {
      return facadeApiError(
        400,
        `${operation.action} requires an active target`,
        'Open the document and retry with target.kind="active".',
        { target, operation },
        ['inspect_document', 'analyze_content'],
      );
    }

    if (operation.action === 'field_stats') {
      const routePath = `/field/${encodeURIComponent(operation.field)}/stats`;
      const data = await apiRequest('GET', routePath);
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('get_field_stats', 'GET', routePath)],
            touchedTargets: [`field:${operation.field}`],
          };
    }

    if (operation.action === 'list_cbs_toggles') {
      const params = new URLSearchParams();
      if (operation.field) params.set('field', operation.field);
      if (operation.lorebook_index !== undefined) params.set('lorebook_index', String(operation.lorebook_index));
      const query = params.toString();
      const routePath = `/cbs/toggles${query ? `?${query}` : ''}`;
      const data = await apiRequest('GET', routePath);
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('list_cbs_toggles', 'GET', routePath)],
            touchedTargets: [operation.field ? `cbs:${operation.field}` : 'cbs'],
          };
    }

    if (operation.action === 'simulate_cbs') {
      const routePath = '/cbs/simulate';
      const data = await apiRequest('POST', routePath, {
        field: operation.field,
        lorebook_index: operation.lorebook_index,
        toggles: operation.toggles,
        all_combos: operation.all_combos,
        compact: operation.compact,
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('simulate_cbs', 'POST', routePath)],
            touchedTargets: [`cbs:${operation.field}`],
          };
    }

    if (operation.action === 'diff_cbs') {
      const routePath = '/cbs/diff';
      const data = await apiRequest('POST', routePath, {
        field: operation.field,
        lorebook_index: operation.lorebook_index,
        toggles: operation.toggles,
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('diff_cbs', 'POST', routePath)],
            touchedTargets: [`cbs:${operation.field}`],
          };
    }

    if (operation.action === 'diff_lorebook') {
      const refIndex = await resolveReferenceIndex(operation.reference);
      if (typeof refIndex !== 'number') return refIndex;
      const routePath = '/lorebook/diff';
      const data = await apiRequest('POST', routePath, {
        index: operation.index,
        refIndex,
        refEntryIndex: operation.ref_entry_index,
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('list_references', 'GET', '/references'), route('diff_lorebook', 'POST', routePath)],
            touchedTargets: [
              `lorebook:${operation.index}`,
              `reference:${refIndex}:lorebook:${operation.ref_entry_index}`,
            ],
          };
    }

    if (operation.action === 'diff_risup_prompt') {
      const refIndex = await resolveReferenceIndex(operation.reference);
      if (typeof refIndex !== 'number') return refIndex;
      const routePath = '/risup/prompt-diff';
      const data = await apiRequest('POST', routePath, { refIndex });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('list_references', 'GET', '/references'), route('diff_risup_prompt', 'POST', routePath)],
            touchedTargets: ['risup:promptTemplate', `reference:${refIndex}:risup`],
          };
    }

    const routePath = '/risup/prompt-text/verify';
    const data = await apiRequest('POST', routePath, { text: operation.text });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [route('validate_risup_prompt_import', 'POST', routePath)],
          touchedTargets: ['risup:promptTemplate'],
        };
  }

  function validateRegexEntries(data: unknown): Record<string, unknown> {
    const entries = Array.isArray(asRecord(data)?.entries) ? (asRecord(data)?.entries as unknown[]) : [];
    const results = entries.map((entry) => {
      const record = asRecord(entry);
      const index = recordNumber(record, 'index');
      const regexEntry = asRecord(record?.entry) ?? record;
      const find = recordString(regexEntry, 'find') ?? '';
      const flag = recordString(regexEntry, 'flag') ?? '';
      const regexMode = flag.length > 0 || regexEntry?.type === 'editoutput' || regexEntry?.type === 'editinput';
      if (!find) return { index, ok: false, warning: 'empty find pattern' };
      if (!regexMode) return { index, ok: true, mode: 'literal' };
      try {
        new RegExp(find, flag.replace(/[^dgimsuvy]/g, ''));
        return { index, ok: true, mode: 'regex' };
      } catch (error) {
        return { index, ok: false, error: (error as Error).message, pattern: find, flag };
      }
    });
    return {
      count: results.length,
      ok: results.every((result) => result.ok === true),
      results,
    };
  }

  function validateExternalCharxExportCompatibility(filePath: string): Record<string, unknown> | ApiErrorResult {
    if (path.extname(filePath).toLowerCase() !== '.charx') {
      return facadeApiError(
        400,
        'Charx export compatibility validation expects a .charx file',
        'Pass target.kind="external" with a .charx file path and selector { family: "asset" } or { field: "exportCompatibility" }.',
        { file_path: filePath },
        ['inspect_document', 'read_content'],
      );
    }
    if (!fs.existsSync(filePath)) {
      return facadeApiError(
        404,
        'External .charx file could not be found',
        'Check the filesystem path, then retry validate_content.',
        { file_path: filePath },
        ['inspect_document'],
      );
    }
    try {
      return {
        file_path: filePath,
        ...validateCharxExportCompatibilityFile(filePath),
      };
    } catch (error) {
      return facadeApiError(
        400,
        'External .charx export compatibility validation failed',
        'Inspect the external file and confirm it is a readable .charx archive before retrying validate_content.',
        { file_path: filePath, error: (error as Error).message },
        ['inspect_document', 'manage_file'],
      );
    }
  }

  async function validateExternalRisumSemanticFields(
    filePath: string,
    selector: FacadeV1ContentSelector,
  ): Promise<{ data: Record<string, unknown>; routes: FacadeRoute[] } | ApiErrorResult> {
    if (path.extname(filePath).toLowerCase() !== '.risum') {
      return facadeApiError(
        400,
        'Risum semantic validation expects a .risum file',
        'Pass target.kind="external" with a .risum file path and selector { family: "risum" }.',
        { file_path: filePath },
        ['inspect_document', 'read_content'],
      );
    }
    if (!fs.existsSync(filePath)) {
      return facadeApiError(
        404,
        'External .risum file could not be found',
        'Check the filesystem path, then retry validate_content.',
        { file_path: filePath },
        ['inspect_document'],
      );
    }
    const fields = selector.fields ?? [
      'moduleNamespace',
      'namespace',
      'lowLevelAccess',
      'backgroundEmbedding',
      'customModuleToggle',
      'mcpUrl',
      'cjs',
    ];
    const routes: FacadeRoute[] = [];
    const results: Array<Record<string, unknown>> = [];
    for (const field of fields) {
      if (field === 'cjs') {
        results.push({
          field,
          ok: true,
          skipped: true,
          reason: 'reserved hidden field',
        });
        continue;
      }
      const surfacePath = `/${jsonPointerSegment(field)}`;
      const read = await readExternalSurfaceValue(filePath, surfacePath);
      routes.push(route('external_read_surface', 'POST', '/external/surface/read'));
      if (isApiError(read)) {
        results.push({
          field,
          ok: false,
          error: recordString(asRecord(read), 'error') ?? recordString(asRecord(read), 'message') ?? 'unreadable',
        });
        continue;
      }
      const record = asRecord(read);
      const hasValue = !!record && Object.prototype.hasOwnProperty.call(record, 'value');
      const value = record?.value;
      results.push({
        field,
        ok: true,
        present: hasValue,
        type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
      });
    }
    const warnings = results
      .filter((result) => result.ok === false || result.skipped === true)
      .map((result) => ({
        field: result.field,
        ...(result.error ? { error: result.error } : {}),
        ...(result.skipped ? { skipped: result.skipped, reason: result.reason } : {}),
      }));
    return {
      data: {
        file_path: filePath,
        fields,
        results,
        consistency: {
          ok: results.every((result) => result.ok !== false),
          warnings,
        },
      },
      routes,
    };
  }

  function scanPluginV3Source(filePath: string): Record<string, unknown> | ApiErrorResult {
    if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) {
      return facadeApiError(
        400,
        'Plugin v3 validation expects a source file',
        'Pass target.kind="external" with a .js or .ts Plugin API v3 source file path.',
        { file_path: filePath },
        ['load_guidance', 'read_content'],
      );
    }
    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      return facadeApiError(
        404,
        'Plugin source file could not be read',
        'Check the filesystem path and permissions, then retry validate_content.',
        { file_path: filePath, error: (error as Error).message },
        ['load_guidance'],
      );
    }
    const headerMatch = source.match(/^\s*(?:\/\*\*?([\s\S]*?)\*\/|\/\/\s*(.+)(?:\r?\n\/\/\s*(.+))*)/);
    const header = headerMatch ? headerMatch[0].slice(0, 2000) : '';
    const permissionMatches = [...source.matchAll(/permissions?\s*[:=]\s*(\[[\s\S]*?\])/g)].map((match) => match[1]);
    const apiCalls = [...source.matchAll(/\brisuai\.[A-Za-z0-9_.]+/g)].map((match) => match[0]);
    const registrations = [...source.matchAll(/\b(register(?:UI|Provider|Mcp|MCP)|add(?:Button|Panel|Provider))/g)].map(
      (match) => match[0],
    );
    const unsafePatterns = [
      ['eval', /\beval\s*\(/],
      ['Function constructor', /\bnew\s+Function\s*\(/],
      ['document global', /\bdocument\./],
      ['window global', /\bwindow\./],
    ]
      .filter(([, pattern]) => (pattern as RegExp).test(source))
      .map(([name]) => name);
    return {
      source_file: filePath,
      metadata_header: {
        present: header.length > 0,
        preview: header,
        has_plugin_v3_marker: /plugin\s*(api)?\s*v?3|apiVersion\s*[:=]\s*['"]?3/i.test(header + source.slice(0, 4000)),
      },
      permissions: {
        declarations: permissionMatches,
        count: permissionMatches.length,
      },
      api_scan: {
        risuai_calls: uniqueStrings(apiCalls).slice(0, 100),
        registrations: uniqueStrings(registrations),
        unsafe_patterns: unsafePatterns,
      },
      guidance: {
        route: 'load_guidance',
        skill: 'writing-plugins-v3',
        note: '.js/.ts Plugin v3 files are source files, not .charx/.risum/.risup MCP artifacts.',
      },
    };
  }

  return {
    hasRisupPromptImportContext,
    applyEditPostEditMetadata,
    facadeEnvelope,
    resolveReferenceIndex,
    referenceEntriesFromResponse,
    readFacadeSelector,
    validateFacadeSelectors,
    analyzeFacadeOperation,
  };
}

export type FacadeContentEngine = ReturnType<typeof createFacadeContentEngine>;
