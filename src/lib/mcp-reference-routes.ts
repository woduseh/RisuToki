import * as http from 'http';
import { fieldRangeFingerprint, safeFieldRange } from './mcp-field-range';

import {
  MAX_RISUP_PROMPT_BATCH,
  buildReferenceFieldReadPayload,
  getHiddenFieldReadBlock,
  isReferenceTextField,
  normalizeLorebookEntryForResponse,
  normalizeRegexEntryForResponse,
  projectLorebookEntryForResponse,
  promptItemPreview,
  readJsonBody,
  referenceDataWithFileType,
} from './mcp-api-helpers';
import type { McpApiDeps, Section } from './mcp-api-server';
import {
  MAX_FIELD_BATCH,
  collectHiddenFieldWarnings,
  getFieldAccessRules,
  getHiddenFieldInfo,
  getUnknownFieldHint,
  isHiddenField,
} from './mcp-field-access';
import { resolveLorebookFolderRef } from './lorebook-folders';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';
import { fieldBatchReadSchema, searchBodySchema } from './mcp-request-schemas';
import { searchTextBlock } from './mcp-search';
import { collectFormatingOrderWarnings, parseFormatingOrder, parsePromptTemplate } from './risup-prompt-model';
import { getGreetingFieldName, getRefFileType, REF_SCALAR_FIELDS } from './reference-shared';
import { normalizeLF } from './shared-utils';
import type { ZodType } from 'zod';

/* eslint-disable @typescript-eslint/no-explicit-any */

type JsonBody = Record<string, unknown>;

type ReferenceApiDeps = Pick<
  McpApiDeps,
  'getReferenceFiles' | 'normalizeTriggerScripts' | 'parseCssSections' | 'parseLuaSections' | 'stringifyTriggerScripts'
>;

export interface ReferenceRouteDeps {
  api: ReferenceApiDeps;
  parseBody: <T>(
    res: http.ServerResponse,
    body: JsonBody,
    schema: ZodType<T>,
    meta: { action: string; target: string; suggestion?: string },
  ) => T | null;
  broadcastStatus: (payload: Record<string, unknown>) => void;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, options: McpSuccessOptions) => void;
  mcpError: (res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown) => void;
}

export async function handleReferenceRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  url: URL,
  routeDeps: ReferenceRouteDeps,
): Promise<boolean> {
  const deps = routeDeps.api;
  const { broadcastStatus, jsonResSuccess, mcpError, parseBody } = routeDeps;

  async function dispatch(): Promise<void | false> {
    // ----------------------------------------------------------------
    // GET /references — list loaded reference files
    // ----------------------------------------------------------------
    if (parts[0] === 'references' && !parts[1] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const refs = refFiles.map((r: any, i: number) => {
        const fileType = getRefFileType(r);
        const refData = referenceDataWithFileType(r);
        const refId = r.id || r.filePath || r.fileName;
        const fields: Record<string, unknown>[] = [];
        const pushStringField = (name: string) => {
          if (isHiddenField(refData, name)) return;
          const value = refData[name];
          if (typeof value === 'string' && value) {
            fields.push({ name, size: value.length });
          }
        };
        // lua / css — standalone complex surfaces
        pushStringField('lua');
        pushStringField('css');
        // Shared scalar fields
        for (const sf of REF_SCALAR_FIELDS) {
          if (isHiddenField(refData, sf.id)) continue;
          const val = refData[sf.id];
          if (sf.isArray) {
            if (Array.isArray(val) && val.length > 0) fields.push({ name: sf.id, count: val.length, type: 'array' });
          } else if (sf.id === 'triggerScripts') {
            if (typeof val === 'string' && val !== '[]') fields.push({ name: sf.id, size: val.length });
          } else if (val) {
            fields.push({ name: sf.id, size: typeof val === 'string' ? val.length : 0 });
          }
        }
        if (fileType === 'risum') {
          pushStringField('moduleDescription');
          pushStringField('cjs');
          pushStringField('backgroundEmbedding');
        }
        if (fileType === 'risup') {
          for (const fieldName of [
            'mainPrompt',
            'jailbreak',
            'promptTemplate',
            'formatingOrder',
            'templateDefaultVariables',
          ]) {
            pushStringField(fieldName);
          }
        }
        // Complex array surfaces
        if (r.data.lorebook?.length) fields.push({ name: 'lorebook', count: r.data.lorebook.length, type: 'array' });
        if (r.data.regex?.length) fields.push({ name: 'regex', count: r.data.regex.length, type: 'array' });
        return {
          index: i,
          id: refId,
          fileName: r.fileName,
          fileType,
          fields,
          hiddenFieldWarnings: collectHiddenFieldWarnings(refData),
        };
      });
      return jsonResSuccess(
        res,
        { count: refs.length, references: refs },
        {
          toolName: 'list_references',
          summary: `Listed ${refs.length} reference file(s)`,
          artifacts: { count: refs.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/greetings/:type — list reference greetings
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'greetings' &&
      parts[3] &&
      !parts[4] &&
      req.method === 'GET'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'list reference greetings',
          target: `reference:${idx}:greetings:${parts[3]}`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const greetingType = parts[3];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'list reference greetings',
          target: `reference:${idx}:greetings:${greetingType}`,
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
        });
      }
      const ref = refFiles[idx];
      const hiddenBlock = getHiddenFieldReadBlock(referenceDataWithFileType(ref), fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'list reference greetings',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `reference:${idx}:greetings:${greetingType}`,
        });
      }
      const arr: string[] = Array.isArray(ref.data[fieldName]) ? ref.data[fieldName] : [];
      let items = arr.map((g: string, i: number) => ({
        index: i,
        contentSize: g.length,
        preview: g.slice(0, 100) + (g.length > 100 ? '…' : ''),
      }));
      const filterParam = url.searchParams.get('filter');
      if (filterParam) {
        const q = filterParam.toLowerCase();
        items = items.filter((entry) => (arr[entry.index] || '').toLowerCase().includes(q));
      }
      const contentFilterParam = url.searchParams.get('content_filter');
      if (contentFilterParam) {
        const cq = contentFilterParam.toLowerCase();
        items = items.filter((entry) => (arr[entry.index] || '').toLowerCase().includes(cq));
        items = items.map((entry) => {
          const rawContent = arr[entry.index] || '';
          const lowered = rawContent.toLowerCase();
          const matchPos = lowered.indexOf(cq);
          if (matchPos >= 0) {
            const start = Math.max(0, matchPos - 50);
            const end = Math.min(rawContent.length, matchPos + cq.length + 50);
            return {
              ...entry,
              contentMatch:
                (start > 0 ? '…' : '') + rawContent.slice(start, end) + (end < rawContent.length ? '…' : ''),
            };
          }
          return entry;
        });
      }
      return jsonResSuccess(
        res,
        {
          refIndex: idx,
          fileName: ref.fileName,
          type: greetingType,
          field: fieldName,
          count: items.length,
          total: arr.length,
          items,
        },
        {
          toolName: 'list_reference_greetings',
          summary: `Listed ${items.length} ${greetingType} reference greetings`,
          artifacts: { refIndex: idx, count: items.length, total: arr.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /reference/:idx/greeting/:type/batch — batch read reference greetings
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'greeting' &&
      parts[3] &&
      parts[4] === 'batch' &&
      !parts[5] &&
      req.method === 'POST'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'batch read reference greetings',
          target: `reference:${idx}:greeting:${parts[3]}:batch`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const greetingType = parts[3];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'batch read reference greetings',
          target: `reference:${idx}:greeting:${greetingType}:batch`,
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
        });
      }
      const body = await readJsonBody(req, res, `reference/${idx}/greeting/${greetingType}/batch`, broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read reference greetings',
          target: `reference:${idx}:greeting:${greetingType}:batch`,
          message: 'indices must be an array of numbers',
        });
      }
      const MAX_BATCH = 50;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read reference greetings',
          target: `reference:${idx}:greeting:${greetingType}:batch`,
          message: `Maximum ${MAX_BATCH} indices per batch`,
        });
      }
      const ref = refFiles[idx];
      const hiddenBlock = getHiddenFieldReadBlock(referenceDataWithFileType(ref), fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'batch read reference greetings',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `reference:${idx}:greeting:${greetingType}:batch`,
        });
      }
      const arr: string[] = Array.isArray(ref.data[fieldName]) ? ref.data[fieldName] : [];
      const items = indices.map((entryIdx: number) => {
        if (typeof entryIdx !== 'number' || entryIdx < 0 || entryIdx >= arr.length) return null;
        return { index: entryIdx, content: arr[entryIdx] };
      });
      const validCount = items.filter(Boolean).length;
      return jsonResSuccess(
        res,
        {
          refIndex: idx,
          fileName: ref.fileName,
          type: greetingType,
          field: fieldName,
          count: validCount,
          total: indices.length,
          items,
        },
        {
          toolName: 'read_reference_greeting_batch',
          summary: `Batch read ${validCount}/${indices.length} ${greetingType} reference greetings`,
          artifacts: { refIndex: idx, count: validCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/greeting/:type/:entryIdx — read single reference greeting
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'greeting' &&
      parts[3] &&
      parts[4] &&
      !parts[5] &&
      req.method === 'GET'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference greeting',
          target: `reference:${idx}:greeting:${parts[3]}:${parts[4]}`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const greetingType = parts[3];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'read reference greeting',
          target: `reference:${idx}:greeting:${greetingType}`,
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
        });
      }
      const ref = refFiles[idx];
      const hiddenBlock = getHiddenFieldReadBlock(referenceDataWithFileType(ref), fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'read reference greeting',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `reference:${idx}:greeting:${greetingType}`,
        });
      }
      const arr: string[] = Array.isArray(ref.data[fieldName]) ? ref.data[fieldName] : [];
      const entryIdx = parseInt(parts[4], 10);
      if (isNaN(entryIdx) || entryIdx < 0 || entryIdx >= arr.length) {
        return mcpError(res, 400, {
          action: 'read reference greeting',
          target: `reference:${idx}:greeting:${greetingType}:${entryIdx}`,
          message: `Greeting index ${entryIdx} out of range (0..${arr.length - 1})`,
          suggestion: `list_reference_greetings로 유효한 index를 확인하세요.`,
        });
      }
      return jsonResSuccess(
        res,
        { refIndex: idx, fileName: ref.fileName, type: greetingType, entryIndex: entryIdx, content: arr[entryIdx] },
        {
          toolName: 'read_reference_greeting',
          summary: `Read ${greetingType} reference greeting [${entryIdx}]`,
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/triggers — list reference trigger scripts
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'triggers' && !parts[3] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'list reference triggers',
          target: `reference:${idx}:triggers`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const normalized = deps.normalizeTriggerScripts(ref.data.triggerScripts || []);
      const scripts = Array.isArray(normalized) ? normalized : [];
      const items = scripts.map((t: any, i: number) => ({
        index: i,
        comment: t.comment || '',
        type: t.type || '',
        conditionCount: Array.isArray(t.conditions) ? t.conditions.length : 0,
        effectCount: Array.isArray(t.effect) ? t.effect.length : 0,
        lowLevelAccess: !!t.lowLevelAccess,
      }));
      return jsonResSuccess(
        res,
        { refIndex: idx, fileName: ref.fileName, count: scripts.length, items },
        {
          toolName: 'list_reference_triggers',
          summary: `Listed ${scripts.length} reference trigger scripts`,
          artifacts: { refIndex: idx, count: scripts.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /reference/:idx/trigger/batch — batch read reference trigger scripts
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'trigger' &&
      parts[3] === 'batch' &&
      !parts[4] &&
      req.method === 'POST'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'batch read reference triggers',
          target: `reference:${idx}:trigger:batch`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const body = await readJsonBody(req, res, `reference/${idx}/trigger/batch`, broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read reference triggers',
          target: `reference:${idx}:trigger:batch`,
          message: 'indices must be an array of numbers',
        });
      }
      const MAX_BATCH = 50;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read reference triggers',
          target: `reference:${idx}:trigger:batch`,
          message: `Maximum ${MAX_BATCH} indices per batch`,
        });
      }
      const ref = refFiles[idx];
      const normalized = deps.normalizeTriggerScripts(ref.data.triggerScripts || []);
      const scripts = Array.isArray(normalized) ? normalized : [];
      const triggers = indices.map((triggerIdx: number) => {
        if (typeof triggerIdx !== 'number' || triggerIdx < 0 || triggerIdx >= scripts.length) return null;
        return { index: triggerIdx, trigger: scripts[triggerIdx] };
      });
      const validCount = triggers.filter(Boolean).length;
      return jsonResSuccess(
        res,
        {
          refIndex: idx,
          fileName: ref.fileName,
          count: validCount,
          total: indices.length,
          triggers,
        },
        {
          toolName: 'read_reference_trigger_batch',
          summary: `Batch read ${validCount}/${indices.length} reference trigger scripts`,
          artifacts: { refIndex: idx, count: validCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/trigger/:triggerIdx — read single reference trigger script
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'trigger' &&
      parts[3] &&
      !parts[4] &&
      req.method === 'GET'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference trigger',
          target: `reference:${idx}:trigger:${parts[3]}`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const normalized = deps.normalizeTriggerScripts(ref.data.triggerScripts || []);
      const scripts = Array.isArray(normalized) ? normalized : [];
      const triggerIdx = parseInt(parts[3], 10);
      if (isNaN(triggerIdx) || triggerIdx < 0 || triggerIdx >= scripts.length) {
        return mcpError(res, 400, {
          action: 'read reference trigger',
          target: `reference:${idx}:trigger:${triggerIdx}`,
          message: `Trigger index ${triggerIdx} out of range (0..${scripts.length - 1})`,
          suggestion: 'list_reference_triggers로 유효한 index를 확인하세요.',
        });
      }
      return jsonResSuccess(
        res,
        { refIndex: idx, fileName: ref.fileName, triggerIndex: triggerIdx, trigger: scripts[triggerIdx] },
        {
          toolName: 'read_reference_trigger',
          summary: `Read reference trigger [${triggerIdx}] "${scripts[triggerIdx].comment || ''}"`,
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/lorebook — list reference lorebook entries (compact)
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'lorebook' && !parts[3] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference lorebook',
          target: `reference:${idx}:lorebook`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const lorebook = ref.data.lorebook || [];

      // Parse preview_length
      const previewLengthParam = url.searchParams.get('preview_length');
      const previewLength =
        previewLengthParam !== null ? Math.min(Math.max(parseInt(previewLengthParam, 10) || 0, 0), 500) : 150;

      let entries = lorebook.map((e: any, i: number) => {
        const content = e.content || '';
        const normalized = normalizeLorebookEntryForResponse(e, lorebook);
        const entry: Record<string, unknown> = {
          index: i,
          comment: normalized.comment || '',
          key: normalized.key || '',
          mode: normalized.mode || 'normal',
          alwaysActive: !!normalized.alwaysActive,
          contentSize: content.length,
          folder: normalized.folder || '',
        };
        if (previewLength > 0) {
          entry.contentPreview = content.slice(0, previewLength) + (content.length > previewLength ? '…' : '');
        }
        return entry;
      });
      // Filter by folder UUID
      const folderParam = url.searchParams.get('folder');
      if (folderParam) {
        const folderId = resolveLorebookFolderRef(folderParam, lorebook);
        entries = entries.filter((e: any) => e.folder === folderId);
      }
      const filterParam = url.searchParams.get('filter');
      if (filterParam) {
        const q = filterParam.toLowerCase();
        entries = entries.filter((e: any) => e.comment.toLowerCase().includes(q) || e.key.toLowerCase().includes(q));
      }
      // Filter by content keyword
      const contentFilterParam = url.searchParams.get('content_filter');
      if (contentFilterParam) {
        const cq = contentFilterParam.toLowerCase();
        entries = entries.filter((_e: any) => {
          const content = (lorebook[(_e as any).index]?.content || '').toLowerCase();
          return content.includes(cq);
        });
        // Add match context preview for content_filter results
        entries = entries.map((e: any) => {
          const content = (lorebook[e.index]?.content || '').toLowerCase();
          const matchPos = content.indexOf(contentFilterParam.toLowerCase());
          if (matchPos >= 0) {
            const rawContent = lorebook[e.index]?.content || '';
            const start = Math.max(0, matchPos - 50);
            const end = Math.min(rawContent.length, matchPos + contentFilterParam.length + 50);
            e.contentMatch =
              (start > 0 ? '…' : '') + rawContent.slice(start, end) + (end < rawContent.length ? '…' : '');
          }
          return e;
        });
      }
      // Filter by content NOT containing keyword
      const contentFilterNotParam = url.searchParams.get('content_filter_not');
      if (contentFilterNotParam) {
        const nq = contentFilterNotParam.toLowerCase();
        entries = entries.filter((_e: any) => {
          const content = (lorebook[(_e as any).index]?.content || '').toLowerCase();
          return !content.includes(nq);
        });
      }
      return jsonResSuccess(
        res,
        { index: idx, fileName: ref.fileName, count: entries.length, entries },
        {
          toolName: 'list_reference_lorebook',
          summary: `Listed ${entries.length} lorebook entries in reference ${idx}`,
          artifacts: { refIndex: idx, count: entries.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /reference/:idx/lorebook/batch — batch read reference lorebook
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'lorebook' &&
      parts[3] === 'batch' &&
      req.method === 'POST'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'batch read reference lorebook',
          target: `reference:${idx}:lorebook:batch`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const body = await readJsonBody(req, res, `reference/${idx}/lorebook/batch`, broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read reference lorebook',
          target: `reference:${idx}:lorebook:batch`,
          message: 'indices must be an array of numbers',
        });
      }
      const MAX_BATCH = 50;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read reference lorebook',
          target: `reference:${idx}:lorebook:batch`,
          message: `Maximum ${MAX_BATCH} indices per batch`,
        });
      }
      const lorebook = refFiles[idx].data.lorebook || [];
      const requestedFields: string[] | undefined = body.fields;
      const entries = indices.map((entryIdx: number) => {
        if (typeof entryIdx !== 'number' || entryIdx < 0 || entryIdx >= lorebook.length) return null;
        return {
          index: entryIdx,
          entry: projectLorebookEntryForResponse(lorebook[entryIdx], lorebook, requestedFields),
        };
      });
      const batchCount = entries.filter(Boolean).length;
      return jsonResSuccess(
        res,
        {
          refIndex: idx,
          fileName: refFiles[idx].fileName,
          count: batchCount,
          total: indices.length,
          entries,
        },
        {
          toolName: 'read_reference_lorebook_batch',
          summary: `Batch read ${batchCount}/${indices.length} reference lorebook entries`,
          artifacts: { refIndex: idx, count: batchCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/lorebook/:entryIdx — read single reference lorebook entry
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'lorebook' && parts[3] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference lorebook',
          target: `reference:${idx}:lorebook:${parts[3]}`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const lorebook = ref.data.lorebook || [];
      const entryIdx = parseInt(parts[3], 10);
      if (isNaN(entryIdx) || entryIdx < 0 || entryIdx >= lorebook.length) {
        return mcpError(res, 400, {
          action: 'read reference lorebook',
          target: `reference:${idx}:lorebook:${entryIdx}`,
          message: `Lorebook entry index ${entryIdx} out of range (0-${lorebook.length - 1})`,
        });
      }
      return jsonResSuccess(
        res,
        {
          refIndex: idx,
          fileName: ref.fileName,
          entryIndex: entryIdx,
          entry: normalizeLorebookEntryForResponse(lorebook[entryIdx], lorebook),
        },
        {
          toolName: 'read_reference_lorebook',
          summary: `Read reference ${idx} lorebook entry ${entryIdx}`,
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/regex — list reference regex entries (compact)
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'regex' && !parts[3] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference regex',
          target: `reference:${idx}:regex`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const regexArr = ref.data.regex || [];
      const entries = regexArr.map((e: Record<string, unknown>, i: number) => ({
        index: i,
        comment: e.comment || '',
        type: e.type || '',
        findSize: typeof e.find === 'string' ? e.find.length : typeof e.in === 'string' ? (e.in as string).length : 0,
        replaceSize:
          typeof e.replace === 'string' ? e.replace.length : typeof e.out === 'string' ? (e.out as string).length : 0,
      }));
      return jsonResSuccess(
        res,
        { refIndex: idx, fileName: ref.fileName, count: entries.length, entries },
        {
          toolName: 'list_reference_regex',
          summary: `Listed ${entries.length} regex entries in reference ${idx}`,
          artifacts: { refIndex: idx, count: entries.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /reference/:idx/regex/batch — batch read reference regex entries
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'regex' && parts[3] === 'batch' && req.method === 'POST') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'batch read reference regex',
          target: `reference:${idx}:regex:batch`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const body = await readJsonBody(req, res, `reference/${idx}/regex/batch`, broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read reference regex',
          target: `reference:${idx}:regex:batch`,
          message: 'indices must be an array of numbers',
        });
      }
      const MAX_BATCH = 50;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read reference regex',
          target: `reference:${idx}:regex:batch`,
          message: `Maximum ${MAX_BATCH} indices per batch`,
        });
      }
      const ref = refFiles[idx];
      const regexArr = (ref.data.regex as Record<string, unknown>[]) || [];
      const entries = indices.map((entryIdx: number) => {
        if (typeof entryIdx !== 'number' || entryIdx < 0 || entryIdx >= regexArr.length) return null;
        return { index: entryIdx, entry: normalizeRegexEntryForResponse(regexArr[entryIdx]) };
      });
      const validCount = entries.filter(Boolean).length;
      return jsonResSuccess(
        res,
        {
          refIndex: idx,
          fileName: ref.fileName,
          count: validCount,
          total: indices.length,
          entries,
        },
        {
          toolName: 'read_reference_regex_batch',
          summary: `Batch read ${validCount}/${indices.length} reference regex entries`,
          artifacts: { refIndex: idx, count: validCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/regex/:entryIdx — read single reference regex entry
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'regex' && parts[3] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference regex',
          target: `reference:${idx}:regex:${parts[3]}`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const regexArr = ref.data.regex || [];
      const entryIdx = parseInt(parts[3], 10);
      if (isNaN(entryIdx) || entryIdx < 0 || entryIdx >= regexArr.length) {
        return mcpError(res, 400, {
          action: 'read reference regex',
          target: `reference:${idx}:regex:${entryIdx}`,
          message: `Regex entry index ${entryIdx} out of range (0-${regexArr.length - 1})`,
        });
      }
      const entry = normalizeRegexEntryForResponse(regexArr[entryIdx]);
      return jsonResSuccess(
        res,
        { refIndex: idx, fileName: ref.fileName, entryIndex: entryIdx, entry },
        {
          toolName: 'read_reference_regex',
          summary: `Read reference ${idx} regex entry ${entryIdx}`,
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/lua — list reference Lua sections
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'lua' && !parts[3] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference lua',
          target: `reference:${idx}:lua`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const luaCode = ref.data.lua || '';
      if (!luaCode) {
        return jsonResSuccess(
          res,
          { index: idx, fileName: ref.fileName, count: 0, sections: [] },
          {
            toolName: 'list_reference_lua',
            summary: `Listed 0 Lua sections in reference ${idx} (empty)`,
            artifacts: { refIndex: idx, count: 0 },
          },
        );
      }
      const sections = deps.parseLuaSections(luaCode);
      const result = sections.map((s, i) => ({
        index: i,
        name: s.name,
        contentSize: s.content.length,
      }));
      return jsonResSuccess(
        res,
        { index: idx, fileName: ref.fileName, count: result.length, sections: result },
        {
          toolName: 'list_reference_lua',
          summary: `Listed ${result.length} Lua section(s) in reference ${idx}`,
          artifacts: { refIndex: idx, count: result.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /reference/:idx/lua/batch — batch read reference Lua sections
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'lua' && parts[3] === 'batch' && req.method === 'POST') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'batch read reference lua',
          target: `reference:${idx}:lua:batch`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const body = await readJsonBody(req, res, `reference/${idx}/lua/batch`, broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read reference lua',
          target: `reference:${idx}:lua:batch`,
          message: 'indices must be an array of numbers',
        });
      }
      const MAX_BATCH = 20;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read reference lua',
          target: `reference:${idx}:lua:batch`,
          message: `Maximum ${MAX_BATCH} indices per batch`,
        });
      }
      const luaCode = refFiles[idx].data.lua || '';
      const sections = luaCode ? deps.parseLuaSections(luaCode) : [];
      const result = indices.map((sIdx: number) => {
        if (typeof sIdx !== 'number' || sIdx < 0 || sIdx >= sections.length) return null;
        return { index: sIdx, name: sections[sIdx].name, content: sections[sIdx].content };
      });
      const luaBatchCount = result.filter(Boolean).length;
      return jsonResSuccess(
        res,
        {
          refIndex: idx,
          fileName: refFiles[idx].fileName,
          count: luaBatchCount,
          total: indices.length,
          sections: result,
        },
        {
          toolName: 'read_reference_lua_batch',
          summary: `Batch read ${luaBatchCount}/${indices.length} reference Lua sections`,
          artifacts: { refIndex: idx, count: luaBatchCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/lua/:sectionIdx — read single reference Lua section
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'lua' && parts[3] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference lua',
          target: `reference:${idx}:lua:${parts[3]}`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const luaCode = ref.data.lua || '';
      const sections = luaCode ? deps.parseLuaSections(luaCode) : [];
      const sectionIdx = parseInt(parts[3], 10);
      if (isNaN(sectionIdx) || sectionIdx < 0 || sectionIdx >= sections.length) {
        return mcpError(res, 400, {
          action: 'read reference lua',
          target: `reference:${idx}:lua:${sectionIdx}`,
          message: `Lua section index ${sectionIdx} out of range (0-${sections.length - 1})`,
        });
      }
      return jsonResSuccess(
        res,
        {
          refIndex: idx,
          fileName: ref.fileName,
          sectionIndex: sectionIdx,
          name: sections[sectionIdx].name,
          content: sections[sectionIdx].content,
        },
        {
          toolName: 'read_reference_lua',
          summary: `Read reference ${idx} Lua section ${sectionIdx} ("${sections[sectionIdx].name}")`,
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/css — list reference CSS sections
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'css' && !parts[3] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference css',
          target: `reference:${idx}:css`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const cssCode = ref.data.css || '';
      if (!cssCode) {
        return jsonResSuccess(
          res,
          { index: idx, fileName: ref.fileName, count: 0, sections: [] },
          {
            toolName: 'list_reference_css',
            summary: `Listed 0 CSS sections in reference ${idx} (empty)`,
            artifacts: { refIndex: idx, count: 0 },
          },
        );
      }
      const cssResult = deps.parseCssSections(cssCode);
      const result = cssResult.sections.map((s, i) => ({
        index: i,
        name: s.name,
        contentSize: s.content.length,
      }));
      return jsonResSuccess(
        res,
        { index: idx, fileName: ref.fileName, count: result.length, sections: result },
        {
          toolName: 'list_reference_css',
          summary: `Listed ${result.length} CSS section(s) in reference ${idx}`,
          artifacts: { refIndex: idx, count: result.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /reference/:idx/css/batch — batch read reference CSS sections
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'css' && parts[3] === 'batch' && req.method === 'POST') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'batch read reference css',
          target: `reference:${idx}:css:batch`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const body = await readJsonBody(req, res, `reference/${idx}/css/batch`, broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read reference css',
          target: `reference:${idx}:css:batch`,
          message: 'indices must be an array of numbers',
        });
      }
      const MAX_BATCH = 20;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read reference css',
          target: `reference:${idx}:css:batch`,
          message: `Maximum ${MAX_BATCH} indices per batch`,
        });
      }
      const cssCode = refFiles[idx].data.css || '';
      const cssResult = cssCode
        ? deps.parseCssSections(cssCode)
        : { sections: [] as Section[], prefix: '', suffix: '' };
      const result = indices.map((sIdx: number) => {
        if (typeof sIdx !== 'number' || sIdx < 0 || sIdx >= cssResult.sections.length) return null;
        return { index: sIdx, name: cssResult.sections[sIdx].name, content: cssResult.sections[sIdx].content };
      });
      const cssBatchCount = result.filter(Boolean).length;
      return jsonResSuccess(
        res,
        {
          refIndex: idx,
          fileName: refFiles[idx].fileName,
          count: cssBatchCount,
          total: indices.length,
          sections: result,
        },
        {
          toolName: 'read_reference_css_batch',
          summary: `Batch read ${cssBatchCount}/${indices.length} reference CSS sections`,
          artifacts: { refIndex: idx, count: cssBatchCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/css/:sectionIdx — read single reference CSS section
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] === 'css' && parts[3] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference css',
          target: `reference:${idx}:css:${parts[3]}`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const cssCode = ref.data.css || '';
      const cssResult = cssCode
        ? deps.parseCssSections(cssCode)
        : { sections: [] as Section[], prefix: '', suffix: '' };
      const sectionIdx = parseInt(parts[3], 10);
      if (isNaN(sectionIdx) || sectionIdx < 0 || sectionIdx >= cssResult.sections.length) {
        return mcpError(res, 400, {
          action: 'read reference css',
          target: `reference:${idx}:css:${sectionIdx}`,
          message: `CSS section index ${sectionIdx} out of range (0-${cssResult.sections.length - 1})`,
        });
      }
      return jsonResSuccess(
        res,
        {
          refIndex: idx,
          fileName: ref.fileName,
          sectionIndex: sectionIdx,
          name: cssResult.sections[sectionIdx].name,
          content: cssResult.sections[sectionIdx].content,
        },
        {
          toolName: 'read_reference_css',
          summary: `Read reference ${idx} CSS section ${sectionIdx} ("${cssResult.sections[sectionIdx].name}")`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /reference/:idx/field/batch — read multiple reference fields
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'field' &&
      parts[3] === 'batch' &&
      !parts[4] &&
      req.method === 'POST'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference field batch',
          target: `reference:${idx}:field:batch`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const body = await readJsonBody(req, res, `reference/${idx}/field/batch`, broadcastStatus);
      if (!body) return;
      const parsed = parseBody(res, body, fieldBatchReadSchema, {
        action: 'read reference field batch',
        target: `reference:${idx}:field:batch`,
        suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "fields": ["name", "description"] }',
      });
      if (!parsed) return;
      const fields = parsed.fields;
      if (fields.length === 0) {
        return mcpError(res, 400, {
          action: 'read reference field batch',
          message: 'fields must be a non-empty string array',
          suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "fields": ["name", "description"] }',
          target: `reference:${idx}:field:batch`,
        });
      }
      if (fields.length > MAX_FIELD_BATCH) {
        return mcpError(res, 400, {
          action: 'read reference field batch',
          message: `Maximum ${MAX_FIELD_BATCH} fields per batch`,
          suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 필드로 나누어 여러 번 호출하세요.`,
          target: `reference:${idx}:field:batch`,
        });
      }

      const ref = refFiles[idx];
      const refData = referenceDataWithFileType(ref);
      const rules = getFieldAccessRules(refData);
      const results = fields.map((fieldName) => {
        const hidden = getHiddenFieldInfo(refData, fieldName);
        if (hidden) {
          return {
            field: fieldName,
            hidden: true,
            category: hidden.category,
            error: `Hidden deprecated/reserved/legacy field: ${fieldName}`,
            suggestion: hidden.suggestion,
          };
        }
        const payload = buildReferenceFieldReadPayload(refData, fieldName, deps);
        if (payload) {
          return payload;
        }
        return { field: fieldName, error: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}` };
      });

      return jsonResSuccess(
        res,
        { index: idx, fileName: ref.fileName, count: results.length, fields: results },
        {
          toolName: 'read_reference_field_batch',
          summary: `Read ${results.length} fields from reference ${idx}`,
          artifacts: { count: results.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /reference/:idx/field/:name/search — search within a reference field
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'field' &&
      parts[3] &&
      parts[4] === 'search' &&
      !parts[5] &&
      req.method === 'POST'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      const fieldName = decodeURIComponent(parts[3]);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'search in reference field',
          target: `reference:${idx}:field:${fieldName}:search`,
          message: `Reference index ${idx} out of range`,
        });
      }
      if (!isReferenceTextField(fieldName)) {
        return mcpError(res, 400, {
          action: 'search in reference field',
          message: `"${fieldName}" 필드는 검색을 지원하지 않습니다.`,
          suggestion: '문자열 타입 reference 필드에만 사용 가능합니다.',
          target: `reference:${idx}:field:${fieldName}:search`,
        });
      }
      const body = await readJsonBody(req, res, `reference/${idx}/field/${fieldName}/search`, broadcastStatus);
      if (!body) return;
      const parsed = parseBody(res, body, searchBodySchema, {
        action: 'search in reference field',
        target: `reference:${idx}:field:${fieldName}:search`,
        suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
      });
      if (!parsed) return;

      const ref = refFiles[idx];
      const refData = referenceDataWithFileType(ref);
      const hiddenBlock = getHiddenFieldReadBlock(refData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'search in reference field',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `reference:${idx}:field:${fieldName}:search`,
        });
      }
      const content = normalizeLF(
        typeof refData[fieldName] === 'string' ? refData[fieldName] : String(refData[fieldName] ?? ''),
      );
      const queryStr = normalizeLF(String(parsed.query));
      const contextChars = Math.max(0, Math.min(Number(parsed.context_chars) || 100, 500));
      const maxMatches = Math.max(1, Math.min(Number(parsed.max_matches) || 20, 100));
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
            index: idx,
            fileName: ref.fileName,
            field: fieldName,
            query: result.query,
            totalMatches: result.totalMatches,
            returnedMatches: result.returnedMatches,
            fieldLength: result.contentLength,
            matches: result.matches,
          },
          {
            toolName: 'search_in_reference_field',
            summary: `Found ${result.totalMatches} match(es) in reference ${idx} field "${fieldName}"`,
            artifacts: { fieldName, totalMatches: result.totalMatches },
          },
        );
      } catch (err) {
        return mcpError(res, 400, {
          action: 'search in reference field',
          message: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
          target: `reference:${idx}:field:${fieldName}:search`,
        });
      }
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/field/:name/range — read a substring of a reference field
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'field' &&
      parts[3] &&
      parts[4] === 'range' &&
      !parts[5] &&
      req.method === 'GET'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      const fieldName = decodeURIComponent(parts[3]);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference field range',
          target: `reference:${idx}:field:${fieldName}:range`,
          message: `Reference index ${idx} out of range`,
        });
      }
      if (!isReferenceTextField(fieldName)) {
        return mcpError(res, 400, {
          action: 'read reference field range',
          message: `"${fieldName}" 필드는 범위 읽기를 지원하지 않습니다.`,
          suggestion: '문자열 타입 reference 필드에만 사용 가능합니다.',
          target: `reference:${idx}:field:${fieldName}:range`,
        });
      }

      const ref = refFiles[idx];
      const refData = referenceDataWithFileType(ref);
      const hiddenBlock = getHiddenFieldReadBlock(refData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'read reference field range',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `reference:${idx}:field:${fieldName}:range`,
        });
      }
      const rawContent = typeof refData[fieldName] === 'string' ? refData[fieldName] : String(refData[fieldName] ?? '');
      const facadeRange = url.searchParams.get('facade_range') === '1';
      const content = facadeRange ? normalizeLF(rawContent) : rawContent;
      const MAX_RANGE_LENGTH = 10000;
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const length = Math.max(1, Math.min(Number(url.searchParams.get('length')) || 2000, MAX_RANGE_LENGTH));
      const selected = facadeRange
        ? safeFieldRange(content, offset, length)
        : { offset, content: content.slice(offset, offset + length) };
      const slice = selected.content;

      return jsonResSuccess(
        res,
        {
          index: idx,
          fileName: ref.fileName,
          field: fieldName,
          totalLength: content.length,
          offset: selected.offset,
          length: slice.length,
          hasMore: offset + length < content.length,
          content: slice,
          ...(facadeRange ? { range_fingerprint: fieldRangeFingerprint(rawContent, ref.filePath, fieldName) } : {}),
        },
        {
          toolName: 'read_reference_field_range',
          summary: `Read ${slice.length} chars from reference ${idx} field "${fieldName}" at offset ${offset}`,
          artifacts: { fieldName, offset, length: slice.length, totalLength: content.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/risup/prompt-items — list reference risup prompt items
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'risup' &&
      parts[3] === 'prompt-items' &&
      !parts[4] &&
      req.method === 'GET'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'list reference risup prompt items',
          target: `reference:${idx}:risup:promptTemplate`,
          message: `Reference index ${idx} out of range`,
        });
      }

      const ref = refFiles[idx];
      if (getRefFileType(ref) !== 'risup') {
        return mcpError(res, 400, {
          action: 'list reference risup prompt items',
          message: 'Selected reference file is not a risup preset.',
          suggestion: 'list_references로 fileType이 "risup"인 reference를 선택하세요.',
          target: `reference:${idx}:risup:promptTemplate`,
        });
      }

      const refData = referenceDataWithFileType(ref);
      const rawText = typeof refData.promptTemplate === 'string' ? refData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'list reference risup prompt items',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion:
            'read_reference_field(index, "promptTemplate") 또는 read_reference_field_range로 원문을 확인하세요.',
          target: `reference:${idx}:risup:promptTemplate`,
          details: { parseError: model.parseError },
        });
      }

      const items = model.items.map((item, i) => {
        const entry: Record<string, unknown> = {
          index: i,
          id: item.id ?? null,
          type: item.type ?? null,
          supported: item.supported,
          preview: promptItemPreview(item),
        };
        if (item.supported && item.name !== undefined) {
          entry.name = item.name;
        }
        return entry;
      });

      return jsonResSuccess(
        res,
        {
          index: idx,
          fileName: ref.fileName,
          count: model.items.length,
          state: model.state,
          hasUnsupportedContent: model.hasUnsupportedContent,
          items,
        },
        {
          toolName: 'list_reference_risup_prompt_items',
          summary: `Listed ${model.items.length} prompt items in reference ${idx} (state: ${model.state})`,
          artifacts: { count: model.items.length, state: model.state },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /reference/:idx/risup/prompt-items/batch — batch read reference risup prompt items
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'risup' &&
      parts[3] === 'prompt-items' &&
      parts[4] === 'batch' &&
      !parts[5] &&
      req.method === 'POST'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'batch read reference risup prompt items',
          target: `reference:${idx}:risup:promptTemplate:batch`,
          message: `Reference index ${idx} out of range`,
        });
      }

      const ref = refFiles[idx];
      if (getRefFileType(ref) !== 'risup') {
        return mcpError(res, 400, {
          action: 'batch read reference risup prompt items',
          message: 'Selected reference file is not a risup preset.',
          suggestion: 'list_references로 fileType이 "risup"인 reference를 선택하세요.',
          target: `reference:${idx}:risup:promptTemplate:batch`,
        });
      }

      const body = await readJsonBody(req, res, `reference/${idx}/risup/prompt-items/batch`, broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read reference risup prompt items',
          message: 'indices must be an array of numbers',
          suggestion: 'indices를 숫자 index 배열로 전달하세요. 예: { "indices": [0, 1] }',
          target: `reference:${idx}:risup:promptTemplate:batch`,
        });
      }
      if (indices.length > MAX_RISUP_PROMPT_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read reference risup prompt items',
          message: `Maximum ${MAX_RISUP_PROMPT_BATCH} indices per batch`,
          suggestion: `요청을 ${MAX_RISUP_PROMPT_BATCH}개 이하의 index로 나누어 여러 번 호출하세요.`,
          target: `reference:${idx}:risup:promptTemplate:batch`,
        });
      }

      const refData = referenceDataWithFileType(ref);
      const rawText = typeof refData.promptTemplate === 'string' ? refData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'batch read reference risup prompt items',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion:
            'read_reference_field(index, "promptTemplate") 또는 read_reference_field_range로 원문을 확인하세요.',
          target: `reference:${idx}:risup:promptTemplate:batch`,
          details: { parseError: model.parseError },
        });
      }

      const entries = indices.map((itemIdx: number) => {
        if (typeof itemIdx !== 'number' || itemIdx < 0 || itemIdx >= model.items.length) {
          return null;
        }
        const item = model.items[itemIdx];
        return {
          index: itemIdx,
          id: item.id ?? null,
          item: item.rawValue,
          supported: item.supported,
          type: item.type ?? null,
        };
      });
      const validCount = entries.filter(Boolean).length;
      return jsonResSuccess(
        res,
        {
          index: idx,
          fileName: ref.fileName,
          count: validCount,
          total: indices.length,
          entries,
        },
        {
          toolName: 'read_reference_risup_prompt_item_batch',
          summary: `Batch read ${validCount}/${indices.length} prompt items in reference ${idx}`,
          artifacts: { count: validCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/risup/prompt-item/:itemIdx — read a reference risup prompt item
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'risup' &&
      parts[3] === 'prompt-item' &&
      parts[4] &&
      !parts[5] &&
      req.method === 'GET'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      const itemIdx = parseInt(parts[4], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference risup prompt item',
          target: `reference:${idx}:risup:promptTemplate:${parts[4]}`,
          message: `Reference index ${idx} out of range`,
        });
      }

      const ref = refFiles[idx];
      if (getRefFileType(ref) !== 'risup') {
        return mcpError(res, 400, {
          action: 'read reference risup prompt item',
          message: 'Selected reference file is not a risup preset.',
          suggestion: 'list_references로 fileType이 "risup"인 reference를 선택하세요.',
          target: `reference:${idx}:risup:promptTemplate:${parts[4]}`,
        });
      }

      const refData = referenceDataWithFileType(ref);
      const rawText = typeof refData.promptTemplate === 'string' ? refData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'read reference risup prompt item',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion:
            'read_reference_field(index, "promptTemplate") 또는 read_reference_field_range로 원문을 확인하세요.',
          target: `reference:${idx}:risup:promptTemplate:${parts[4]}`,
        });
      }
      if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= model.items.length) {
        return mcpError(res, 400, {
          action: 'read reference risup prompt item',
          message: `Index ${parts[4]} out of range (0–${model.items.length - 1})`,
          suggestion: 'list_reference_risup_prompt_items로 유효한 index를 확인하세요.',
          target: `reference:${idx}:risup:promptTemplate:${parts[4]}`,
        });
      }

      const item = model.items[itemIdx];
      return jsonResSuccess(
        res,
        {
          index: idx,
          fileName: ref.fileName,
          itemIndex: itemIdx,
          id: item.id ?? null,
          item: item.rawValue,
          supported: item.supported,
          type: item.type,
        },
        {
          toolName: 'read_reference_risup_prompt_item',
          summary: `Read reference ${idx} prompt item [${itemIdx}] (type: ${item.type ?? 'unknown'})`,
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/risup/formating-order — read reference risup formating order
    // ----------------------------------------------------------------
    if (
      parts[0] === 'reference' &&
      parts[1] &&
      parts[2] === 'risup' &&
      parts[3] === 'formating-order' &&
      !parts[4] &&
      req.method === 'GET'
    ) {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference risup formating order',
          target: `reference:${idx}:risup:formatingOrder`,
          message: `Reference index ${idx} out of range`,
        });
      }

      const ref = refFiles[idx];
      if (getRefFileType(ref) !== 'risup') {
        return mcpError(res, 400, {
          action: 'read reference risup formating order',
          message: 'Selected reference file is not a risup preset.',
          suggestion: 'list_references로 fileType이 "risup"인 reference를 선택하세요.',
          target: `reference:${idx}:risup:formatingOrder`,
        });
      }

      const refData = (ref.data || {}) as Record<string, unknown>;
      const rawText = typeof refData.formatingOrder === 'string' ? refData.formatingOrder : '';
      const model = parseFormatingOrder(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'read reference risup formating order',
          message: `Invalid formatingOrder: ${model.parseError}`,
          suggestion:
            'read_reference_field(index, "formatingOrder") 또는 read_reference_field_range로 원문을 확인하세요.',
          target: `reference:${idx}:risup:formatingOrder`,
          details: { parseError: model.parseError },
        });
      }

      const items = model.items.map((item, i) => ({ index: i, token: item.token, known: item.known }));
      const promptRaw = typeof refData.promptTemplate === 'string' ? refData.promptTemplate : '';
      const promptModel = parsePromptTemplate(promptRaw);
      const warnings = promptModel.state !== 'invalid' ? collectFormatingOrderWarnings(promptModel, model) : [];

      return jsonResSuccess(
        res,
        { index: idx, fileName: ref.fileName, state: model.state, items, warnings },
        {
          toolName: 'read_reference_risup_formating_order',
          summary: `Read reference ${idx} formating order (${items.length} tokens, state: ${model.state})`,
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /reference/:idx/:field — read a reference file's field
    // ----------------------------------------------------------------
    if (parts[0] === 'reference' && parts[1] && parts[2] && !parts[3] && req.method === 'GET') {
      const refFiles = deps.getReferenceFiles();
      const idx = parseInt(parts[1], 10);
      const fieldName = decodeURIComponent(parts[2]);
      if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'read reference field',
          target: `reference:${idx}:${fieldName}`,
          message: `Reference index ${idx} out of range`,
        });
      }
      const ref = refFiles[idx];
      const refData = (ref.data || {}) as Record<string, unknown>;
      const rules = getFieldAccessRules(refData);
      const hiddenBlock = getHiddenFieldReadBlock(refData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'read reference field',
          target: `reference:${idx}:${fieldName}`,
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
        });
      }
      const payload = buildReferenceFieldReadPayload(refData, fieldName, deps);
      if (!payload) {
        return mcpError(res, 400, {
          action: 'read reference field',
          target: `reference:${idx}:${fieldName}`,
          message: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}`,
        });
      }
      return jsonResSuccess(
        res,
        {
          index: idx,
          fileName: ref.fileName,
          ...payload,
        },
        {
          toolName: 'read_reference_field',
          summary: `Read reference ${idx} field "${fieldName}"`,
        },
      );
    }

    return false;
  }

  const handled = await dispatch();
  return handled !== false;
}
