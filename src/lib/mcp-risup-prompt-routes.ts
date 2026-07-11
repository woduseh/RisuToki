import * as http from 'http';

import {
  MAX_RISUP_PROMPT_BATCH,
  buildRisupPromptSnippetSummary,
  collectRisupFormatingOrderWarningsForPrompt,
  ensureRisupPromptExpectedIdentity,
  findPromptItemMatchedFields,
  getRisupPromptSnippetLibraryFilePath,
  hasExplicitPromptItemId,
  logMcpMutation,
  promptItemPreview,
  readJsonBody,
  resolveUniqueRisupPromptId,
  validatePromptItemInput,
} from './mcp-api-helpers';
import type { McpApiDeps } from './mcp-api-server';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';
import { getRefFileType } from './reference-shared';
import {
  collectFormatingOrderWarnings,
  duplicatePromptItem,
  parseFormatingOrder,
  parsePromptTemplate,
  parsePromptTemplateFromText,
  serializePromptTemplate,
  serializePromptTemplateSubsetToText,
  serializePromptTemplateToText,
  type PromptItemModel,
} from './risup-prompt-model';
import { diffRisupPromptData, diffRisupPromptWithText } from './risup-prompt-compare';
import {
  canonicalizeRisupPromptSnippetText,
  deleteRisupPromptSnippet,
  listRisupPromptSnippets,
  readRisupPromptSnippet,
  saveRisupPromptSnippet,
} from './risup-prompt-snippet-store';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RisupPromptRouteDeps {
  api: McpApiDeps;
  broadcastStatus: (payload: Record<string, unknown>) => void;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, options: McpSuccessOptions) => void;
  mcpError: (res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown) => void;
}

export async function handleRisupPromptRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  currentData: Record<string, any>,
  routeDeps: RisupPromptRouteDeps,
): Promise<boolean> {
  const deps = routeDeps.api;
  const { broadcastStatus, jsonResSuccess, mcpError } = routeDeps;

  async function dispatch(): Promise<void | false> {
    // ----------------------------------------------------------------
    // GET /risup/prompt-items — list all prompt items
    // ----------------------------------------------------------------
    if (parts[0] === 'risup' && parts[1] === 'prompt-items' && !parts[2] && req.method === 'GET') {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'list risup prompt items',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'list risup prompt items',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 promptTemplate을 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
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
          count: model.items.length,
          state: model.state,
          hasUnsupportedContent: model.hasUnsupportedContent,
          items,
        },
        {
          toolName: 'list_risup_prompt_items',
          summary: `Listed ${model.items.length} prompt items (state: ${model.state})`,
          artifacts: { count: model.items.length, state: model.state },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-items/search — search prompt items by text/name
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-items' &&
      parts[2] === 'search' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'search risup prompt items',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'search risup prompt items',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 promptTemplate을 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
          details: { parseError: model.parseError },
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-items/search', broadcastStatus);
      if (!body) return;
      const query = typeof body.query === 'string' ? body.query : '';
      if (!query.trim()) {
        return mcpError(res, 400, {
          action: 'search risup prompt items',
          message: 'query must be a non-empty string',
          suggestion: '{ "query": "찾을 문자열" } 형식으로 전달하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const caseSensitive = body.caseSensitive === true;
      const matches = model.items
        .map((item, index) => {
          const matchedFields = findPromptItemMatchedFields(item, query, caseSensitive);
          if (matchedFields.length === 0) return null;
          return {
            index,
            id: item.id ?? null,
            type: item.type ?? null,
            supported: item.supported,
            preview: promptItemPreview(item),
            matched_fields: matchedFields,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      return jsonResSuccess(
        res,
        { query, caseSensitive, count: matches.length, matches },
        {
          toolName: 'search_in_risup_prompt_items',
          summary: `Found ${matches.length} prompt items matching "${query}"`,
          artifacts: { count: matches.length, query },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/batch — batch read prompt items
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] === 'batch' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'batch read risup prompt items',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'batch read risup prompt items',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 promptTemplate을 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
          details: { parseError: model.parseError },
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-item/batch', broadcastStatus);
      if (!body) return;
      const indices = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read risup prompt items',
          message: 'indices must be an array of numbers',
          suggestion: 'indices를 숫자 index 배열로 전달하세요. 예: { "indices": [0, 1] }',
          target: 'risup:promptTemplate',
        });
      }
      if (indices.length > MAX_RISUP_PROMPT_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read risup prompt items',
          message: `Maximum ${MAX_RISUP_PROMPT_BATCH} indices per batch`,
          suggestion: `요청을 ${MAX_RISUP_PROMPT_BATCH}개 이하의 index로 나누어 여러 번 호출하세요.`,
          target: 'risup:promptTemplate',
        });
      }
      const entries = indices.map((idx: number) => {
        if (typeof idx !== 'number' || idx < 0 || idx >= model.items.length) {
          return null;
        }
        const item = model.items[idx];
        return {
          index: idx,
          id: item.id ?? null,
          item: item.rawValue,
          supported: item.supported,
          type: item.type ?? null,
        };
      });
      const validCount = entries.filter(Boolean).length;
      return jsonResSuccess(
        res,
        { count: validCount, total: indices.length, entries },
        {
          toolName: 'read_risup_prompt_item_batch',
          summary: `Batch read ${validCount}/${indices.length} prompt items`,
          artifacts: { count: validCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /risup/prompt-item-by-id/:id — read prompt item by stable id
    // ----------------------------------------------------------------
    if (parts[0] === 'risup' && parts[1] === 'prompt-item-by-id' && parts[2] && !parts[3] && req.method === 'GET') {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'read risup prompt item by id',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const model = parsePromptTemplate(
        typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '',
      );
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'read risup prompt item by id',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const idx = resolveUniqueRisupPromptId(
        res,
        model,
        decodeURIComponent(parts[2]),
        'read risup prompt item by id',
        mcpError,
      );
      if (idx === null) return;
      const item = model.items[idx];
      return jsonResSuccess(
        res,
        {
          index: idx,
          id: item.id ?? null,
          item: item.rawValue,
          supported: item.supported,
          type: item.type,
          preview: promptItemPreview(item),
        },
        {
          toolName: 'read_risup_prompt_item_by_id',
          summary: `Read prompt item id ${item.id} at [${idx}]`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item-by-id/:id — write prompt item by stable id
    // ----------------------------------------------------------------
    if (parts[0] === 'risup' && parts[1] === 'prompt-item-by-id' && parts[2] && !parts[3] && req.method === 'POST') {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'write risup prompt item by id',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const model = parsePromptTemplate(
        typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '',
      );
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'write risup prompt item by id',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const id = decodeURIComponent(parts[2]);
      const idx = resolveUniqueRisupPromptId(res, model, id, 'write risup prompt item by id', mcpError);
      if (idx === null) return;
      const body = await readJsonBody(req, res, `risup/prompt-item-by-id/${id}`, broadcastStatus);
      if (!body) return;
      if (
        !ensureRisupPromptExpectedIdentity(
          res,
          idx,
          model.items[idx],
          body.expected_type,
          body.expected_preview,
          'write risup prompt item by id',
          `risup:promptTemplate:${id}`,
          mcpError,
        )
      )
        return;
      const validation = validatePromptItemInput(body.item);
      if ('error' in validation) {
        return mcpError(res, 400, {
          action: 'write risup prompt item by id',
          message: validation.error,
          suggestion:
            'Supported prompt item type이 필요합니다. unsupported/raw shape는 write_field("promptTemplate") fallback을 사용하세요.',
          target: `risup:promptTemplate:${id}`,
        });
      }
      if (validation.model.supported && !hasExplicitPromptItemId(body.item)) validation.model.id = id;
      const allowed = await deps.askRendererConfirm(
        'MCP 수정 요청',
        `AI 어시스턴트가 promptTemplate 항목 id ${id} (index ${idx})을(를) 수정하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'write risup prompt item by id',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: `risup:promptTemplate:${id}`,
        });
      }
      const newItems = model.items.map((item, i) => (i === idx ? validation.model : item));
      const newText = serializePromptTemplate({ items: newItems });
      currentData.promptTemplate = newText;
      const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
      logMcpMutation('write risup prompt item by id', `risup:promptTemplate:${id}`, {
        index: idx,
        type: validation.model.type,
      });
      deps.broadcastToAll('data-updated', 'promptTemplate', newText);
      return jsonResSuccess(
        res,
        { success: true, id, index: idx, orderWarnings },
        { toolName: 'write_risup_prompt_item_by_id', summary: `Updated prompt item id ${id}` },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item-by-id/:id/delete — delete prompt item by stable id
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item-by-id' &&
      parts[2] &&
      parts[3] === 'delete' &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'delete risup prompt item by id',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const model = parsePromptTemplate(
        typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '',
      );
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'delete risup prompt item by id',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const id = decodeURIComponent(parts[2]);
      const idx = resolveUniqueRisupPromptId(res, model, id, 'delete risup prompt item by id', mcpError);
      if (idx === null) return;
      const body = await readJsonBody(req, res, `risup/prompt-item-by-id/${id}/delete`, broadcastStatus);
      if (!body) return;
      if (
        !ensureRisupPromptExpectedIdentity(
          res,
          idx,
          model.items[idx],
          body.expected_type,
          body.expected_preview,
          'delete risup prompt item by id',
          `risup:promptTemplate:${id}`,
          mcpError,
        )
      )
        return;
      const deletedType = model.items[idx].type ?? 'unknown';
      const allowed = await deps.askRendererConfirm(
        'MCP 삭제 요청',
        `AI 어시스턴트가 promptTemplate 항목 id ${id} (index ${idx}, type: ${deletedType})을(를) 삭제하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'delete risup prompt item by id',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: `risup:promptTemplate:${id}`,
        });
      }
      const newItems = model.items.filter((_, i) => i !== idx);
      const newText = serializePromptTemplate({ items: newItems });
      currentData.promptTemplate = newText;
      const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
      logMcpMutation('delete risup prompt item by id', `risup:promptTemplate:${id}`, { index: idx, deletedType });
      deps.broadcastToAll('data-updated', 'promptTemplate', newText);
      return jsonResSuccess(
        res,
        { success: true, deleted: id, index: idx, orderWarnings },
        { toolName: 'delete_risup_prompt_item_by_id', summary: `Deleted prompt item id ${id}` },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/add — add new prompt item
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] === 'add' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'add risup prompt item',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'add risup prompt item',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
          details: { parseError: model.parseError },
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-item/add', broadcastStatus);
      if (!body) return;
      const validation = validatePromptItemInput(body.item);
      if ('error' in validation) {
        return mcpError(res, 400, {
          action: 'add risup prompt item',
          message: validation.error,
          suggestion:
            'Supported types: plain, jailbreak, cot, chatML, persona, description, lorebook, postEverything, memory, authornote, chat, cache. For unsupported shapes use write_field("promptTemplate").',
          target: 'risup:promptTemplate',
        });
      }
      if (validation.model.supported && !hasExplicitPromptItemId(body.item)) {
        validation.model.id = '';
      }
      const newItems: PromptItemModel[] = [...model.items];
      let newIdx: number;
      if (body.insertAt !== undefined) {
        const insertAt = body.insertAt;
        if (!Number.isInteger(insertAt) || insertAt < 0 || insertAt > model.items.length) {
          return mcpError(res, 400, {
            action: 'add risup prompt item',
            message: `insertAt (${insertAt}) is out of range [0, ${model.items.length}]`,
            suggestion: `0 ~ ${model.items.length} 사이의 정수를 사용하세요.`,
            target: 'risup:promptTemplate',
          });
        }
        newItems.splice(insertAt, 0, validation.model);
        newIdx = insertAt;
      } else {
        newItems.push(validation.model);
        newIdx = newItems.length - 1;
      }
      const newText = serializePromptTemplate({ items: newItems });

      const allowed = await deps.askRendererConfirm(
        'MCP 추가 요청',
        `AI 어시스턴트가 promptTemplate에 새 항목(type: ${validation.model.type})을 추가하려 합니다.`,
      );
      if (allowed) {
        currentData.promptTemplate = newText;
        const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
        logMcpMutation('add risup prompt item', 'risup:promptTemplate', {
          type: validation.model.type,
          newIndex: newIdx,
        });
        deps.broadcastToAll('data-updated', 'promptTemplate', newText);
        return jsonResSuccess(
          res,
          { success: true, index: newIdx, orderWarnings },
          {
            toolName: 'add_risup_prompt_item',
            summary: `Added prompt item [${newIdx}] (type: ${validation.model.type})`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'add risup prompt item',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
          target: 'risup:promptTemplate',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/batch-add — add multiple prompt items
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] === 'batch-add' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'batch add risup prompt items',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'batch add risup prompt items',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
          details: { parseError: model.parseError },
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-item/batch-add', broadcastStatus);
      if (!body) return;
      const itemsRaw = body.items;
      if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
        return mcpError(res, 400, {
          action: 'batch add risup prompt items',
          message: 'items must be a non-empty array of prompt item objects',
          suggestion: '{ "items": [{ ... }, { ... }] } 형식으로 전달하세요.',
          target: 'risup:promptTemplate',
        });
      }
      if (itemsRaw.length > MAX_RISUP_PROMPT_BATCH) {
        return mcpError(res, 400, {
          action: 'batch add risup prompt items',
          message: `Maximum ${MAX_RISUP_PROMPT_BATCH} items per batch`,
          suggestion: `요청을 ${MAX_RISUP_PROMPT_BATCH}개 이하의 항목으로 나누어 여러 번 호출하세요.`,
          target: 'risup:promptTemplate',
        });
      }
      const validated = itemsRaw.map((item, index) => {
        const validation = validatePromptItemInput(item);
        if ('error' in validation) {
          return { error: validation.error, index };
        }
        if (validation.model.supported && !hasExplicitPromptItemId(item)) {
          validation.model.id = '';
        }
        return { index, model: validation.model };
      });
      const invalid = validated.find((entry): entry is { error: string; index: number } => 'error' in entry);
      if (invalid) {
        return mcpError(res, 400, {
          action: 'batch add risup prompt items',
          message: `Invalid item at batch index ${invalid.index}: ${invalid.error}`,
          suggestion:
            'Supported types: plain, jailbreak, cot, chatML, persona, description, lorebook, postEverything, memory, authornote, chat, cache.',
          target: 'risup:promptTemplate',
          details: { invalidIndex: invalid.index },
        });
      }
      const validEntries = validated.filter(
        (entry): entry is { index: number; model: PromptItemModel } => 'model' in entry,
      );
      const models = validEntries.map((entry) => entry.model);
      const newItems: PromptItemModel[] = [...model.items];
      let insertStart: number;
      if (body.insertAt !== undefined) {
        const insertAt = body.insertAt;
        if (!Number.isInteger(insertAt) || insertAt < 0 || insertAt > model.items.length) {
          return mcpError(res, 400, {
            action: 'batch add risup prompt items',
            message: `insertAt (${insertAt}) is out of range [0, ${model.items.length}]`,
            suggestion: `0 ~ ${model.items.length} 사이의 정수를 사용하세요.`,
            target: 'risup:promptTemplate',
          });
        }
        newItems.splice(insertAt, 0, ...models);
        insertStart = insertAt;
      } else {
        insertStart = newItems.length;
        newItems.push(...models);
      }
      const newText = serializePromptTemplate({ items: newItems });
      const indices = models.map((_, offset) => insertStart + offset);
      const summary = models
        .map((entry, offset) => `  [${indices[offset]}] type: ${entry.type ?? 'unknown'}`)
        .join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 추가 요청',
        `AI 어시스턴트가 promptTemplate에 항목 ${models.length}개를 일괄 추가하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
      );
      if (allowed) {
        currentData.promptTemplate = newText;
        const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
        logMcpMutation('batch add risup prompt items', 'risup:promptTemplate', { count: models.length });
        deps.broadcastToAll('data-updated', 'promptTemplate', newText);
        const results = indices.map((index, offset) => ({ index, type: models[offset]?.type ?? null }));
        return jsonResSuccess(
          res,
          { success: true, count: models.length, indices, orderWarnings, results },
          {
            toolName: 'add_risup_prompt_item_batch',
            summary: `Batch added ${models.length} prompt items`,
            artifacts: { count: models.length },
          },
        );
      }
      return mcpError(res, 403, {
        action: 'batch add risup prompt items',
        message: '사용자가 거부했습니다',
        rejected: true,
        suggestion: '앱에서 일괄 추가 요청을 허용한 뒤 다시 시도하세요.',
        target: 'risup:promptTemplate',
      });
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/batch-write-by-id — update multiple prompt items by id
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] === 'batch-write-by-id' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'batch write risup prompt items by id',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const model = parsePromptTemplate(
        typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '',
      );
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'batch write risup prompt items by id',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-item/batch-write-by-id', broadcastStatus);
      if (!body) return;
      const writes = body.writes;
      if (!Array.isArray(writes) || writes.length === 0 || writes.length > MAX_RISUP_PROMPT_BATCH) {
        return mcpError(res, 400, {
          action: 'batch write risup prompt items by id',
          message: `writes must be a non-empty array with at most ${MAX_RISUP_PROMPT_BATCH} items`,
          suggestion: '{ "writes": [{ "item_id": "...", "item": { ... } }] } 형식으로 전달하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const seen = new Set<string>();
      const resolved: Array<{ id: string; index: number; model: PromptItemModel }> = [];
      for (const [batchIndex, write] of writes.entries()) {
        const id = typeof write?.item_id === 'string' ? write.item_id : '';
        if (!id || seen.has(id)) {
          return mcpError(res, 400, {
            action: 'batch write risup prompt items by id',
            message: !id ? `Missing item_id at batch index ${batchIndex}` : `Duplicate item_id ${id}`,
            suggestion: '중복 없는 item_id 배열을 사용하세요.',
            target: 'risup:promptTemplate',
          });
        }
        seen.add(id);
        const index = resolveUniqueRisupPromptId(res, model, id, 'batch write risup prompt items by id', mcpError);
        if (index === null) return;
        if (
          !ensureRisupPromptExpectedIdentity(
            res,
            index,
            model.items[index],
            write.expected_type,
            write.expected_preview,
            'batch write risup prompt items by id',
            `risup:promptTemplate:${id}`,
            mcpError,
          )
        )
          return;
        const validation = validatePromptItemInput(write.item);
        if ('error' in validation) {
          return mcpError(res, 400, {
            action: 'batch write risup prompt items by id',
            message: `Invalid item at batch index ${batchIndex}: ${validation.error}`,
            suggestion: 'Supported prompt item type이 필요합니다.',
            target: `risup:promptTemplate:${id}`,
          });
        }
        if (validation.model.supported && !hasExplicitPromptItemId(write.item)) validation.model.id = id;
        resolved.push({ id, index, model: validation.model });
      }
      const summary = resolved
        .map((entry) => `  ${entry.id} -> [${entry.index}] type: ${entry.model.type ?? 'unknown'}`)
        .join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 수정 요청',
        `AI 어시스턴트가 promptTemplate 항목 ${resolved.length}개를 id 기준으로 일괄 수정하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'batch write risup prompt items by id',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 일괄 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const writeMap = new Map(resolved.map((entry) => [entry.index, entry.model]));
      const newItems = model.items.map((item, index) => writeMap.get(index) ?? item);
      const newText = serializePromptTemplate({ items: newItems });
      currentData.promptTemplate = newText;
      const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
      logMcpMutation('batch write risup prompt items by id', 'risup:promptTemplate', { count: resolved.length });
      deps.broadcastToAll('data-updated', 'promptTemplate', newText);
      return jsonResSuccess(
        res,
        {
          success: true,
          count: resolved.length,
          orderWarnings,
          results: resolved.map((entry) => ({ id: entry.id, index: entry.index, type: entry.model.type ?? null })),
        },
        {
          toolName: 'write_risup_prompt_item_by_id_batch',
          summary: `Batch updated ${resolved.length} prompt items by id`,
          artifacts: { count: resolved.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/batch-delete-by-id — delete multiple prompt items by id
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] === 'batch-delete-by-id' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'batch delete risup prompt items by id',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const model = parsePromptTemplate(
        typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '',
      );
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'batch delete risup prompt items by id',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-item/batch-delete-by-id', broadcastStatus);
      if (!body) return;
      const itemIds: string[] = body.item_ids;
      if (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > MAX_RISUP_PROMPT_BATCH) {
        return mcpError(res, 400, {
          action: 'batch delete risup prompt items by id',
          message: `item_ids must be a non-empty array with at most ${MAX_RISUP_PROMPT_BATCH} items`,
          suggestion: '{ "item_ids": ["..."] } 형식으로 전달하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const seen = new Set<string>();
      const resolved: Array<{ id: string; index: number; type: string }> = [];
      for (let i = 0; i < itemIds.length; i++) {
        const id = itemIds[i];
        if (typeof id !== 'string' || !id || seen.has(id)) {
          return mcpError(res, 400, {
            action: 'batch delete risup prompt items by id',
            message: !id ? `Invalid item id at position ${i}` : `Duplicate item_id ${id}`,
            suggestion: '중복 없는 item_ids 배열을 사용하세요.',
            target: 'risup:promptTemplate',
          });
        }
        seen.add(id);
        const index = resolveUniqueRisupPromptId(res, model, id, 'batch delete risup prompt items by id', mcpError);
        if (index === null) return;
        const expectedTypes: string[] | undefined = body.expected_types;
        const expectedPreviews: string[] | undefined = body.expected_previews;
        if (
          !ensureRisupPromptExpectedIdentity(
            res,
            index,
            model.items[index],
            expectedTypes?.[i],
            expectedPreviews?.[i],
            'batch delete risup prompt items by id',
            `risup:promptTemplate:${id}`,
            mcpError,
          )
        )
          return;
        resolved.push({ id, index, type: model.items[index].type ?? 'unknown' });
      }
      const summary = resolved.map((entry) => `  ${entry.id} -> [${entry.index}] type: ${entry.type}`).join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 삭제 요청',
        `AI 어시스턴트가 promptTemplate 항목 ${resolved.length}개를 id 기준으로 일괄 삭제하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'batch delete risup prompt items by id',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 일괄 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const deleteSet = new Set(resolved.map((entry) => entry.index));
      const newItems = model.items.filter((_, index) => !deleteSet.has(index));
      const newText = serializePromptTemplate({ items: newItems });
      currentData.promptTemplate = newText;
      const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
      logMcpMutation('batch delete risup prompt items by id', 'risup:promptTemplate', { count: resolved.length });
      deps.broadcastToAll('data-updated', 'promptTemplate', newText);
      return jsonResSuccess(
        res,
        {
          success: true,
          count: resolved.length,
          deleted: itemIds,
          indices: resolved.map((entry) => entry.index),
          orderWarnings,
        },
        {
          toolName: 'batch_delete_risup_prompt_items_by_id',
          summary: `Batch deleted ${resolved.length} prompt items by id`,
          artifacts: { count: resolved.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/reorder-by-id — reorder prompt items by full id permutation
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] === 'reorder-by-id' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'reorder risup prompt items by id',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const model = parsePromptTemplate(
        typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '',
      );
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'reorder risup prompt items by id',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-item/reorder-by-id', broadcastStatus);
      if (!body) return;
      const orderIds: string[] = body.order_ids;
      const currentIds = model.items.map((item) => (item.supported ? item.id : undefined));
      if (!Array.isArray(orderIds) || orderIds.length !== model.items.length || currentIds.some((id) => !id)) {
        return mcpError(res, 400, {
          action: 'reorder risup prompt items by id',
          message: `order_ids must include every current supported prompt item id exactly once (${model.items.length} items)`,
          suggestion: 'unsupported/raw prompt item이 있으면 기존 reorder_risup_prompt_items index 도구를 사용하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const expectedIds = [...(currentIds as string[])].sort();
      const actualIds = [...orderIds].sort();
      if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
        return mcpError(res, 400, {
          action: 'reorder risup prompt items by id',
          message: 'order_ids must be a full permutation of current prompt item ids',
          suggestion: 'list_risup_prompt_items로 최신 id 순서를 확인하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const idToItem = new Map(model.items.map((item) => [item.id, item] as const));
      const newItems = orderIds.map((id) => idToItem.get(id)!);
      const allowed = await deps.askRendererConfirm(
        'MCP 순서 변경 요청',
        `AI 어시스턴트가 promptTemplate 항목 ${model.items.length}개의 순서를 id 기준으로 변경하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'reorder risup prompt items by id',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 순서 변경 요청을 허용한 뒤 다시 시도하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const newText = serializePromptTemplate({ items: newItems });
      currentData.promptTemplate = newText;
      const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
      logMcpMutation('reorder risup prompt items by id', 'risup:promptTemplate', { count: model.items.length });
      deps.broadcastToAll('data-updated', 'promptTemplate', newText);
      return jsonResSuccess(
        res,
        { success: true, order_ids: orderIds, orderWarnings },
        {
          toolName: 'reorder_risup_prompt_items_by_id',
          summary: `Reordered ${model.items.length} prompt items by id`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/reorder — reorder prompt items
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] === 'reorder' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'reorder risup prompt items',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'reorder risup prompt items',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-item/reorder', broadcastStatus);
      if (!body) return;
      const newOrder: number[] = body.order;
      if (!Array.isArray(newOrder) || newOrder.length !== model.items.length) {
        return mcpError(res, 400, {
          action: 'reorder risup prompt items',
          message: `order must be an array of length ${model.items.length} (current item count)`,
          target: 'risup:promptTemplate',
        });
      }
      const sorted = [...newOrder].sort((a, b) => a - b);
      const expected = Array.from({ length: model.items.length }, (_, i) => i);
      if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
        return mcpError(res, 400, {
          action: 'reorder risup prompt items',
          message: 'order must be a permutation of [0, 1, ..., n-1]',
          target: 'risup:promptTemplate',
        });
      }

      const reordered = newOrder.map((i) => model.items[i]);
      const newText = serializePromptTemplate({ items: reordered });

      const allowed = await deps.askRendererConfirm(
        'MCP 순서 변경 요청',
        `AI 어시스턴트가 promptTemplate 항목 ${model.items.length}개의 순서를 변경하려 합니다.`,
      );
      if (allowed) {
        currentData.promptTemplate = newText;
        const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
        logMcpMutation('reorder risup prompt items', 'risup:promptTemplate', { count: model.items.length });
        deps.broadcastToAll('data-updated', 'promptTemplate', newText);
        return jsonResSuccess(
          res,
          { success: true, order: newOrder, orderWarnings },
          {
            toolName: 'reorder_risup_prompt_items',
            summary: `Reordered ${model.items.length} prompt items`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'reorder risup prompt items',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 순서 변경 요청을 허용한 뒤 다시 시도하세요.',
          target: 'risup:promptTemplate',
        });
      }
    }

    // ----------------------------------------------------------------
    // GET /risup/prompt-item/:idx — read single prompt item
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] &&
      !parts[3] &&
      !['add', 'reorder', 'batch', 'batch-add', 'batch-write'].includes(parts[2]) &&
      req.method === 'GET'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'read risup prompt item',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'read risup prompt item',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const idx = parseInt(parts[2], 10);
      if (isNaN(idx) || idx < 0 || idx >= model.items.length) {
        return mcpError(res, 400, {
          action: 'read risup prompt item',
          message: `Index ${parts[2]} out of range (0–${model.items.length - 1})`,
          suggestion: 'list_risup_prompt_items로 유효한 index를 확인하세요.',
          target: `risup:promptTemplate:${parts[2]}`,
        });
      }
      const item = model.items[idx];
      return jsonResSuccess(
        res,
        {
          index: idx,
          id: item.id ?? null,
          item: item.rawValue,
          supported: item.supported,
          type: item.type,
        },
        {
          toolName: 'read_risup_prompt_item',
          summary: `Read prompt item [${idx}] (type: ${item.type ?? 'unknown'})`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/:idx/delete — delete prompt item
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] &&
      parts[3] === 'delete' &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'delete risup prompt item',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'delete risup prompt item',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const idx = parseInt(parts[2], 10);
      if (isNaN(idx) || idx < 0 || idx >= model.items.length) {
        return mcpError(res, 400, {
          action: 'delete risup prompt item',
          message: `Index ${parts[2]} out of range (0–${model.items.length - 1})`,
          suggestion: 'list_risup_prompt_items로 유효한 index를 확인하세요.',
          target: `risup:promptTemplate:${parts[2]}`,
        });
      }
      const body = await readJsonBody(req, res, `risup/prompt-item/${idx}/delete`, broadcastStatus);
      if (!body) return;
      if (
        !ensureRisupPromptExpectedIdentity(
          res,
          idx,
          model.items[idx],
          body.expected_type,
          body.expected_preview,
          'delete risup prompt item',
          `risup:promptTemplate:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const deletedType = model.items[idx].type ?? 'unknown';

      const allowed = await deps.askRendererConfirm(
        'MCP 삭제 요청',
        `AI 어시스턴트가 promptTemplate의 항목 #${idx} (type: ${deletedType})을(를) 삭제하려 합니다.`,
      );
      if (allowed) {
        const newItems = model.items.filter((_, i) => i !== idx);
        const newText = serializePromptTemplate({ items: newItems });
        currentData.promptTemplate = newText;
        const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
        logMcpMutation('delete risup prompt item', 'risup:promptTemplate', { idx, deletedType });
        deps.broadcastToAll('data-updated', 'promptTemplate', newText);
        return jsonResSuccess(
          res,
          { success: true, deleted: idx, orderWarnings },
          {
            toolName: 'delete_risup_prompt_item',
            summary: `Deleted prompt item [${idx}] (type: ${deletedType})`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'delete risup prompt item',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: `risup:promptTemplate:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/batch-delete — delete multiple prompt items
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] === 'batch-delete' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'batch delete risup prompt items',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'batch delete risup prompt items',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-item/batch-delete', broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices) || indices.length === 0) {
        return mcpError(res, 400, {
          action: 'batch delete risup prompt items',
          message: 'indices must be a non-empty array of numbers',
          suggestion: '{ "indices": [0, 2, 5] } 형식으로 전달하세요.',
          target: 'risup:promptTemplate',
        });
      }
      if (indices.length > MAX_RISUP_PROMPT_BATCH) {
        return mcpError(res, 400, {
          action: 'batch delete risup prompt items',
          message: `Maximum ${MAX_RISUP_PROMPT_BATCH} indices per batch`,
          suggestion: `요청을 ${MAX_RISUP_PROMPT_BATCH}개 이하의 인덱스로 나누어 여러 번 호출하세요.`,
          target: 'risup:promptTemplate',
        });
      }
      const indexSet = new Set(indices);
      if (indexSet.size !== indices.length) {
        return mcpError(res, 400, {
          action: 'batch delete risup prompt items',
          message: 'Duplicate indices detected',
          suggestion: '중복 없는 인덱스 배열을 사용하세요.',
          target: 'risup:promptTemplate',
        });
      }
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        if (!Number.isInteger(idx) || idx < 0 || idx >= model.items.length) {
          return mcpError(res, 400, {
            action: 'batch delete risup prompt items',
            message: `Index ${idx} out of range (0–${model.items.length - 1})`,
            suggestion: 'list_risup_prompt_items로 유효한 index를 확인하세요.',
            target: 'risup:promptTemplate',
          });
        }
        const expected_types: string[] | undefined = body.expected_types;
        const expected_previews: string[] | undefined = body.expected_previews;
        if (
          !ensureRisupPromptExpectedIdentity(
            res,
            idx,
            model.items[idx],
            expected_types?.[i],
            expected_previews?.[i],
            'batch delete risup prompt items',
            `risup:promptTemplate:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
      }
      const deletedSummary = indices.map((idx) => `  [${idx}] type: ${model.items[idx]?.type ?? 'unknown'}`).join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 삭제 요청',
        `AI 어시스턴트가 promptTemplate의 항목 ${indices.length}개를 일괄 삭제하려 합니다.\n\n${deletedSummary.substring(0, 500)}${deletedSummary.length > 500 ? '\n...' : ''}`,
      );
      if (allowed) {
        const newItems = model.items.filter((_, i) => !indexSet.has(i));
        const newText = serializePromptTemplate({ items: newItems });
        currentData.promptTemplate = newText;
        const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
        logMcpMutation('batch delete risup prompt items', 'risup:promptTemplate', {
          count: indices.length,
          indices,
        });
        deps.broadcastToAll('data-updated', 'promptTemplate', newText);
        return jsonResSuccess(
          res,
          { success: true, deleted: indices, count: indices.length, orderWarnings },
          {
            toolName: 'batch_delete_risup_prompt_items',
            summary: `Batch deleted ${indices.length} prompt items`,
            artifacts: { count: indices.length },
          },
        );
      }
      return mcpError(res, 403, {
        action: 'batch delete risup prompt items',
        message: '사용자가 거부했습니다',
        rejected: true,
        suggestion: '앱에서 일괄 삭제 요청을 허용한 뒤 다시 시도하세요.',
        target: 'risup:promptTemplate',
      });
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/batch-write — update multiple prompt items
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] === 'batch-write' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'batch write risup prompt items',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'batch write risup prompt items',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
          details: { parseError: model.parseError },
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-item/batch-write', broadcastStatus);
      if (!body) return;
      const writes = body.writes;
      if (!Array.isArray(writes) || writes.length === 0) {
        return mcpError(res, 400, {
          action: 'batch write risup prompt items',
          message: 'writes must be a non-empty array of {index, item}',
          suggestion: '{ "writes": [{ "index": 0, "item": { ... } }] } 형식으로 전달하세요.',
          target: 'risup:promptTemplate',
        });
      }
      if (writes.length > MAX_RISUP_PROMPT_BATCH) {
        return mcpError(res, 400, {
          action: 'batch write risup prompt items',
          message: `Maximum ${MAX_RISUP_PROMPT_BATCH} writes per batch`,
          suggestion: `요청을 ${MAX_RISUP_PROMPT_BATCH}개 이하의 항목으로 나누어 여러 번 호출하세요.`,
          target: 'risup:promptTemplate',
        });
      }
      for (const write of writes) {
        const index = typeof write?.index === 'number' ? write.index : NaN;
        if (Number.isInteger(index) && index >= 0 && index < model.items.length) {
          if (
            !ensureRisupPromptExpectedIdentity(
              res,
              index,
              model.items[index],
              (write as { expected_type?: unknown }).expected_type,
              (write as { expected_preview?: unknown }).expected_preview,
              'batch write risup prompt items',
              'risup:promptTemplate',
              mcpError,
            )
          ) {
            return;
          }
        }
      }
      const seen = new Set<number>();
      const validatedWrites = writes.map((write, batchIndex) => {
        const index = typeof write?.index === 'number' ? write.index : NaN;
        if (!Number.isInteger(index) || index < 0 || index >= model.items.length) {
          return { error: `Invalid index at batch position ${batchIndex}`, batchIndex };
        }
        if (seen.has(index)) {
          return { error: `Duplicate index ${index} in writes`, batchIndex };
        }
        seen.add(index);
        const validation = validatePromptItemInput(write.item);
        if ('error' in validation) {
          return { error: validation.error, batchIndex };
        }
        const existingItem = model.items[index];
        if (validation.model.supported && !hasExplicitPromptItemId(write.item)) {
          validation.model.id = existingItem.supported ? existingItem.id : '';
        }
        return { batchIndex, index, model: validation.model };
      });
      const invalidWrite = validatedWrites.find(
        (entry): entry is { error: string; batchIndex: number } => 'error' in entry,
      );
      if (invalidWrite) {
        return mcpError(res, 400, {
          action: 'batch write risup prompt items',
          message: invalidWrite.error,
          suggestion:
            '{ "writes": [{ "index": 0, "item": { "type": "plain", "type2": "normal", "text": "...", "role": "system" } }] } 형식을 확인하세요.',
          target: 'risup:promptTemplate',
          details: { invalidBatchIndex: invalidWrite.batchIndex },
        });
      }
      const validWrites = validatedWrites.filter(
        (entry): entry is { batchIndex: number; index: number; model: PromptItemModel } => 'model' in entry,
      );
      const writeMap = new Map(validWrites.map((entry) => [entry.index, entry.model]));
      const summary = validWrites
        .map((entry) => `  [${entry.index}] type: ${entry.model.type ?? 'unknown'}`)
        .join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 수정 요청',
        `AI 어시스턴트가 promptTemplate 항목 ${validWrites.length}개를 일괄 수정하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
      );
      if (allowed) {
        const newItems = model.items.map((item, index) => writeMap.get(index) ?? item);
        const newText = serializePromptTemplate({ items: newItems });
        currentData.promptTemplate = newText;
        const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
        logMcpMutation('batch write risup prompt items', 'risup:promptTemplate', { count: validWrites.length });
        deps.broadcastToAll('data-updated', 'promptTemplate', newText);
        return jsonResSuccess(
          res,
          {
            success: true,
            count: validWrites.length,
            orderWarnings,
            results: validWrites.map((entry) => ({ index: entry.index, type: entry.model.type ?? null })),
          },
          {
            toolName: 'write_risup_prompt_item_batch',
            summary: `Batch updated ${validWrites.length} prompt items`,
            artifacts: { count: validWrites.length },
          },
        );
      }
      return mcpError(res, 403, {
        action: 'batch write risup prompt items',
        message: '사용자가 거부했습니다',
        rejected: true,
        suggestion: '앱에서 일괄 수정 요청을 허용한 뒤 다시 시도하세요.',
        target: 'risup:promptTemplate',
      });
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-item/:idx — write/update prompt item
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-item' &&
      parts[2] &&
      !parts[3] &&
      !['add', 'reorder', 'batch', 'batch-add', 'batch-write'].includes(parts[2]) &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'write risup prompt item',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'write risup prompt item',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
        });
      }
      const idx = parseInt(parts[2], 10);
      if (isNaN(idx) || idx < 0 || idx >= model.items.length) {
        return mcpError(res, 400, {
          action: 'write risup prompt item',
          message: `Index ${parts[2]} out of range (0–${model.items.length - 1})`,
          suggestion: 'list_risup_prompt_items로 유효한 index를 확인하세요.',
          target: `risup:promptTemplate:${parts[2]}`,
        });
      }
      const body = await readJsonBody(req, res, `risup/prompt-item/${idx}`, broadcastStatus);
      if (!body) return;
      if (
        !ensureRisupPromptExpectedIdentity(
          res,
          idx,
          model.items[idx],
          body.expected_type,
          body.expected_preview,
          'write risup prompt item',
          `risup:promptTemplate:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const validation = validatePromptItemInput(body.item);
      if ('error' in validation) {
        return mcpError(res, 400, {
          action: 'write risup prompt item',
          message: validation.error,
          suggestion:
            'Supported types: plain, jailbreak, cot, chatML, persona, description, lorebook, postEverything, memory, authornote, chat, cache. For unsupported shapes use write_field("promptTemplate").',
          target: `risup:promptTemplate:${idx}`,
        });
      }
      const existingItem = model.items[idx];
      if (validation.model.supported && !hasExplicitPromptItemId(body.item)) {
        validation.model.id = existingItem.supported ? existingItem.id : '';
      }

      const allowed = await deps.askRendererConfirm(
        'MCP 수정 요청',
        `AI 어시스턴트가 promptTemplate의 항목 #${idx} (type: ${validation.model.type})을(를) 수정하려 합니다.`,
      );
      if (allowed) {
        const newItems = model.items.map((item, i) => (i === idx ? validation.model : item));
        const newText = serializePromptTemplate({ items: newItems });
        currentData.promptTemplate = newText;
        const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, parsePromptTemplate(newText));
        logMcpMutation('write risup prompt item', `risup:promptTemplate:${idx}`, { type: validation.model.type });
        deps.broadcastToAll('data-updated', 'promptTemplate', newText);
        return jsonResSuccess(
          res,
          { success: true, index: idx, orderWarnings },
          {
            toolName: 'write_risup_prompt_item',
            summary: `Updated prompt item [${idx}] (type: ${validation.model.type})`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'write risup prompt item',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: `risup:promptTemplate:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // GET /risup/formating-order — read formating order
    // ----------------------------------------------------------------
    if (parts[0] === 'risup' && parts[1] === 'formating-order' && !parts[2] && req.method === 'GET') {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'read risup formating order',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:formatingOrder',
        });
      }
      const rawText = typeof currentData.formatingOrder === 'string' ? currentData.formatingOrder : '';
      const model = parseFormatingOrder(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'read risup formating order',
          message: `Invalid formatingOrder: ${model.parseError}`,
          suggestion: 'write_field("formatingOrder")로 수정하거나 초기화하세요.',
          target: 'risup:formatingOrder',
          details: { parseError: model.parseError },
        });
      }
      const items = model.items.map((item, i) => ({ index: i, token: item.token, known: item.known }));
      const promptRaw = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const promptModel = parsePromptTemplate(promptRaw);
      const warnings = promptModel.state !== 'invalid' ? collectFormatingOrderWarnings(promptModel, model) : [];
      return jsonResSuccess(
        res,
        { state: model.state, items, warnings },
        {
          toolName: 'read_risup_formating_order',
          summary: `Read formating order (${items.length} tokens, state: ${model.state})`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/formating-order — write formating order
    // ----------------------------------------------------------------
    if (parts[0] === 'risup' && parts[1] === 'formating-order' && !parts[2] && req.method === 'POST') {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'write risup formating order',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:formatingOrder',
        });
      }
      const body = await readJsonBody(req, res, 'risup/formating-order', broadcastStatus);
      if (!body) return;
      const itemsRaw: unknown = body.items;
      if (!Array.isArray(itemsRaw)) {
        return mcpError(res, 400, {
          action: 'write risup formating order',
          message: 'items must be an array of {token: string}',
          suggestion: '{ items: [{ token: "main" }, { token: "chats" }] } 형식으로 전달하세요.',
          target: 'risup:formatingOrder',
        });
      }
      for (let i = 0; i < itemsRaw.length; i++) {
        const it = itemsRaw[i];
        if (!it || typeof it !== 'object' || typeof (it as Record<string, unknown>).token !== 'string') {
          return mcpError(res, 400, {
            action: 'write risup formating order',
            message: `Item at index ${i} must have a string "token" field.`,
            suggestion: '{ items: [{ token: "main" }, { token: "chats" }] } 형식으로 전달하세요.',
            target: 'risup:formatingOrder',
            details: { invalidIndex: i },
          });
        }
      }
      const newTokens = (itemsRaw as Array<{ token: string }>).map((it) => it.token);
      const newValue = JSON.stringify(newTokens, null, 2);
      const oldValue = typeof currentData.formatingOrder === 'string' ? currentData.formatingOrder : '';

      const allowed = await deps.askRendererConfirm(
        'MCP 수정 요청',
        `AI 어시스턴트가 formatingOrder를 ${newTokens.length}개 토큰으로 수정하려 합니다.`,
      );
      if (allowed) {
        currentData.formatingOrder = newValue;
        const promptRaw = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
        const promptModel = parsePromptTemplate(promptRaw);
        const warnings =
          promptModel.state !== 'invalid'
            ? collectFormatingOrderWarnings(promptModel, parseFormatingOrder(newValue))
            : [];
        logMcpMutation('write risup formating order', 'risup:formatingOrder', {
          oldSize: oldValue.length,
          newSize: newValue.length,
          count: newTokens.length,
        });
        deps.broadcastToAll('data-updated', 'formatingOrder', newValue);
        return jsonResSuccess(
          res,
          { success: true, count: newTokens.length, warnings },
          {
            toolName: 'write_risup_formating_order',
            summary: `Updated formating order (${newTokens.length} tokens)`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'write risup formating order',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: 'risup:formatingOrder',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-diff — compare current risup prompt vs reference
    // ----------------------------------------------------------------
    if (parts[0] === 'risup' && parts[1] === 'prompt-diff' && !parts[2] && req.method === 'POST') {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'diff risup prompt',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-diff', broadcastStatus);
      if (!body) return;
      if (!Number.isInteger(body.refIndex) || body.refIndex < 0) {
        return mcpError(res, 400, {
          action: 'diff risup prompt',
          message: 'refIndex must be a non-negative integer',
          suggestion: '{ "refIndex": 0 } 형식으로 전달하세요. list_references 결과의 index를 사용합니다.',
          target: 'risup:promptTemplate',
        });
      }

      const refFiles = deps.getReferenceFiles();
      const refIndex = body.refIndex as number;
      if (refIndex >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'diff risup prompt',
          message: `Reference index ${refIndex} out of range`,
          suggestion: 'list_references로 유효한 reference index를 확인하세요.',
          target: 'risup:promptTemplate',
        });
      }

      const ref = refFiles[refIndex];
      if (getRefFileType(ref) !== 'risup') {
        return mcpError(res, 400, {
          action: 'diff risup prompt',
          message: 'Selected reference file is not a risup preset.',
          suggestion: 'list_references로 fileType이 "risup"인 reference를 선택하세요.',
          target: 'risup:promptTemplate',
        });
      }

      const currentPromptRaw = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const currentPromptModel = parsePromptTemplate(currentPromptRaw);
      if (currentPromptModel.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'diff risup prompt',
          message: `Invalid current promptTemplate: ${currentPromptModel.parseError}`,
          suggestion: 'write_field("promptTemplate")로 현재 promptTemplate을 먼저 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
          details: { parseError: currentPromptModel.parseError },
        });
      }

      const currentOrderRaw = typeof currentData.formatingOrder === 'string' ? currentData.formatingOrder : '';
      const currentOrderModel = parseFormatingOrder(currentOrderRaw);
      if (currentOrderModel.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'diff risup prompt',
          message: `Invalid current formatingOrder: ${currentOrderModel.parseError}`,
          suggestion: 'write_field("formatingOrder")로 현재 formatingOrder를 먼저 수정하거나 초기화하세요.',
          target: 'risup:formatingOrder',
          details: { parseError: currentOrderModel.parseError },
        });
      }

      const refData = (ref.data || {}) as Record<string, unknown>;
      const referencePromptRaw = typeof refData.promptTemplate === 'string' ? refData.promptTemplate : '';
      const referencePromptModel = parsePromptTemplate(referencePromptRaw);
      if (referencePromptModel.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'diff risup prompt',
          message: `Invalid reference promptTemplate: ${referencePromptModel.parseError}`,
          suggestion:
            'list_reference_risup_prompt_items 또는 read_reference_field로 reference promptTemplate을 확인하세요.',
          target: `reference:${refIndex}:risup:promptTemplate`,
          details: { parseError: referencePromptModel.parseError },
        });
      }

      const referenceOrderRaw = typeof refData.formatingOrder === 'string' ? refData.formatingOrder : '';
      const referenceOrderModel = parseFormatingOrder(referenceOrderRaw);
      if (referenceOrderModel.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'diff risup prompt',
          message: `Invalid reference formatingOrder: ${referenceOrderModel.parseError}`,
          suggestion:
            'read_reference_risup_formating_order 또는 read_reference_field로 reference formatingOrder를 확인하세요.',
          target: `reference:${refIndex}:risup:formatingOrder`,
          details: { parseError: referenceOrderModel.parseError },
        });
      }

      const diff = diffRisupPromptData(
        currentPromptModel,
        currentOrderModel,
        referencePromptModel,
        referenceOrderModel,
      );
      return jsonResSuccess(
        res,
        {
          refIndex,
          referenceFile: ref.fileName,
          identical: diff.identical,
          changedSections: diff.changedSections,
          promptTemplate: diff.promptTemplate,
          formatingOrder: diff.formatingOrder,
        },
        {
          toolName: 'diff_risup_prompt',
          summary: diff.identical
            ? `Current risup prompt is identical to reference ${refIndex}`
            : `Found risup prompt differences vs reference ${refIndex}`,
          artifacts: {
            identical: diff.identical,
            changedSectionCount: diff.changedSections.length,
            promptLinesAdded: diff.promptTemplate.linesAdded,
            promptLinesRemoved: diff.promptTemplate.linesRemoved,
          },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /risup/prompt-text — export promptTemplate as structured text
    // ----------------------------------------------------------------
    if (parts[0] === 'risup' && parts[1] === 'prompt-text' && !parts[2] && req.method === 'GET') {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'export risup prompt to text',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'export risup prompt to text',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
          details: { parseError: model.parseError },
        });
      }
      const text = serializePromptTemplateToText(model);
      return jsonResSuccess(
        res,
        {
          count: model.items.length,
          state: model.state,
          hasUnsupportedContent: model.hasUnsupportedContent,
          text,
        },
        {
          toolName: 'export_risup_prompt_to_text',
          summary: `Exported ${model.items.length} prompt item(s) to text`,
          artifacts: { count: model.items.length, hasUnsupportedContent: model.hasUnsupportedContent },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-text/copy — export selected prompt items as text
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-text' &&
      parts[2] === 'copy' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'copy risup prompt items as text',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'copy risup prompt items as text',
          message: `Invalid promptTemplate: ${model.parseError}`,
          suggestion: 'write_field("promptTemplate")로 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
          details: { parseError: model.parseError },
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-text/copy', broadcastStatus);
      if (!body) return;
      const indices = body.indices;
      if (!Array.isArray(indices) || indices.length === 0) {
        return mcpError(res, 400, {
          action: 'copy risup prompt items as text',
          message: 'indices must be a non-empty array of numbers',
          suggestion: '{ "indices": [0, 2] } 형식으로 전달하세요.',
          target: 'risup:promptTemplate',
        });
      }
      if (indices.length > MAX_RISUP_PROMPT_BATCH) {
        return mcpError(res, 400, {
          action: 'copy risup prompt items as text',
          message: `Maximum ${MAX_RISUP_PROMPT_BATCH} indices per batch`,
          suggestion: `요청을 ${MAX_RISUP_PROMPT_BATCH}개 이하의 index로 나누어 여러 번 호출하세요.`,
          target: 'risup:promptTemplate',
        });
      }
      for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        if (!Number.isInteger(index) || index < 0 || index >= model.items.length) {
          return mcpError(res, 400, {
            action: 'copy risup prompt items as text',
            message: `Invalid index at position ${i}: ${String(index)}`,
            suggestion: 'list_risup_prompt_items로 유효한 index를 확인하세요.',
            target: 'risup:promptTemplate',
            details: { invalidIndex: index, batchIndex: i },
          });
        }
      }
      const text = serializePromptTemplateSubsetToText(model, indices as number[]);
      const items = (indices as number[]).map((index) => {
        const item = model.items[index];
        return {
          index,
          id: item.id ?? null,
          type: item.type ?? null,
          supported: item.supported,
          preview: promptItemPreview(item),
        };
      });
      return jsonResSuccess(
        res,
        {
          count: items.length,
          indices,
          hasUnsupportedContent: items.some((item) => item.supported === false),
          text,
          items,
        },
        {
          toolName: 'copy_risup_prompt_items_as_text',
          summary: `Copied ${items.length} prompt item(s) to text`,
          artifacts: { count: items.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-text/import — import promptTemplate text format
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-text' &&
      parts[2] === 'import' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'import risup prompt from text',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-text/import', broadcastStatus);
      if (!body) return;
      if (typeof body.text !== 'string') {
        return mcpError(res, 400, {
          action: 'import risup prompt from text',
          message: 'text must be a string',
          suggestion: '{ "text": "### [plain] ###\\n..." } 형식으로 전달하세요.',
          target: 'risup:promptTemplate',
        });
      }

      const imported = parsePromptTemplateFromText(body.text);
      if (imported.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'import risup prompt from text',
          message: `Invalid prompt text: ${imported.parseError}`,
          suggestion: 'export_risup_prompt_to_text 결과 형식을 유지하면서 text를 수정한 뒤 다시 시도하세요.',
          target: 'risup:promptTemplate',
          details: { parseError: imported.parseError },
        });
      }

      const mode = body.mode === undefined ? 'replace' : body.mode;
      if (mode !== 'replace' && mode !== 'append') {
        return mcpError(res, 400, {
          action: 'import risup prompt from text',
          message: 'mode must be "replace" or "append"',
          suggestion: '{ "text": "...", "mode": "append", "insertAt": 3 } 형식으로 전달하세요.',
          target: 'risup:promptTemplate',
        });
      }

      let itemsForPreview = imported.items;
      let existingCount = 0;
      let resolvedInsertAt: number | null = null;
      if (mode === 'append') {
        const currentPromptText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
        const currentModel = parsePromptTemplate(currentPromptText);
        if (currentModel.state === 'invalid') {
          return mcpError(res, 400, {
            action: 'import risup prompt from text',
            message: `Invalid current promptTemplate: ${currentModel.parseError}`,
            suggestion: 'write_field("promptTemplate")로 현재 promptTemplate을 먼저 수정하거나 초기화하세요.',
            target: 'risup:promptTemplate',
            details: { parseError: currentModel.parseError },
          });
        }
        existingCount = currentModel.items.length;
        if (body.insertAt === undefined) {
          resolvedInsertAt = existingCount;
        } else if (!Number.isInteger(body.insertAt) || body.insertAt < 0 || body.insertAt > existingCount) {
          return mcpError(res, 400, {
            action: 'import risup prompt from text',
            message: `insertAt must be an integer between 0 and ${existingCount}`,
            suggestion: '{ "text": "...", "mode": "append", "insertAt": 0 } 형식으로 전달하세요.',
            target: 'risup:promptTemplate',
          });
        } else {
          resolvedInsertAt = body.insertAt as number;
        }
        itemsForPreview = imported.items.map((item) => duplicatePromptItem(item));
      }

      const itemSummaries = itemsForPreview.map((item, index) => ({
        index,
        id: item.id ?? null,
        type: item.type ?? null,
        supported: item.supported,
        preview: promptItemPreview(item),
      }));
      let previewPromptModel = imported;
      if (mode === 'append') {
        const currentPromptText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
        const currentModel = parsePromptTemplate(currentPromptText);
        if (currentModel.state === 'invalid') {
          return mcpError(res, 400, {
            action: 'import risup prompt from text',
            message: `Invalid current promptTemplate: ${currentModel.parseError}`,
            suggestion: 'write_field("promptTemplate")로 현재 promptTemplate을 먼저 수정하거나 초기화하세요.',
            target: 'risup:promptTemplate',
            details: { parseError: currentModel.parseError },
          });
        }
        const previewPromptText = serializePromptTemplate({
          items: [
            ...currentModel.items.slice(0, resolvedInsertAt ?? currentModel.items.length),
            ...itemsForPreview,
            ...currentModel.items.slice(resolvedInsertAt ?? currentModel.items.length),
          ],
        });
        previewPromptModel = parsePromptTemplate(previewPromptText);
      }
      const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, previewPromptModel);
      const dryRun = body.dry_run === true || body.dryRun === true;
      if (dryRun) {
        return jsonResSuccess(
          res,
          {
            dry_run: true,
            success: true,
            mode,
            count: imported.items.length,
            state: imported.state,
            hasUnsupportedContent: imported.hasUnsupportedContent,
            insertAt: resolvedInsertAt,
            orderWarnings,
            total_after: mode === 'append' ? existingCount + imported.items.length : imported.items.length,
            items: itemSummaries,
          },
          {
            toolName: 'import_risup_prompt_from_text',
            summary: `Validated ${mode} prompt text import (${imported.items.length} item(s))`,
            artifacts: { count: imported.items.length, dry_run: true, mode },
          },
        );
      }

      let newPromptTemplate = serializePromptTemplate(imported);
      if (mode === 'append') {
        const currentPromptText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
        const currentModel = parsePromptTemplate(currentPromptText);
        if (currentModel.state === 'invalid') {
          return mcpError(res, 400, {
            action: 'import risup prompt from text',
            message: `Invalid current promptTemplate: ${currentModel.parseError}`,
            suggestion: 'write_field("promptTemplate")로 현재 promptTemplate을 먼저 수정하거나 초기화하세요.',
            target: 'risup:promptTemplate',
            details: { parseError: currentModel.parseError },
          });
        }
        const insertionIndex = resolvedInsertAt ?? currentModel.items.length;
        const appendedItems = imported.items.map((item) => duplicatePromptItem(item));
        newPromptTemplate = serializePromptTemplate({
          items: [
            ...currentModel.items.slice(0, insertionIndex),
            ...appendedItems,
            ...currentModel.items.slice(insertionIndex),
          ],
        });
      }
      const summary = itemSummaries
        .slice(0, 8)
        .map((item) => `  [${item.index}] ${item.type ?? 'unknown'}${item.supported ? '' : ' (raw)'}`)
        .join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 텍스트 가져오기 요청',
        mode === 'append'
          ? `AI 어시스턴트가 text serializer 형식의 항목 ${imported.items.length}개를 promptTemplate 위치 ${resolvedInsertAt ?? 0}에 삽입하려 합니다.\n\n${summary}${itemSummaries.length > 8 ? '\n...' : ''}`
          : `AI 어시스턴트가 text serializer 형식에서 promptTemplate 전체를 ${imported.items.length}개 항목으로 교체하려 합니다.\n\n${summary}${itemSummaries.length > 8 ? '\n...' : ''}`,
      );
      if (allowed) {
        currentData.promptTemplate = newPromptTemplate;
        const appliedPromptModel = parsePromptTemplate(newPromptTemplate);
        const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, appliedPromptModel);
        logMcpMutation('import risup prompt from text', 'risup:promptTemplate', {
          count: imported.items.length,
          hasUnsupportedContent: imported.hasUnsupportedContent,
          mode,
          insertAt: resolvedInsertAt,
        });
        deps.broadcastToAll('data-updated', 'promptTemplate', newPromptTemplate);
        return jsonResSuccess(
          res,
          {
            success: true,
            mode,
            count: imported.items.length,
            hasUnsupportedContent: imported.hasUnsupportedContent,
            insertAt: resolvedInsertAt,
            orderWarnings,
          },
          {
            toolName: 'import_risup_prompt_from_text',
            summary:
              mode === 'append'
                ? `Appended ${imported.items.length} prompt item(s) from text`
                : `Imported ${imported.items.length} prompt item(s) from text`,
            artifacts: { count: imported.items.length, hasUnsupportedContent: imported.hasUnsupportedContent, mode },
          },
        );
      }
      return mcpError(res, 403, {
        action: 'import risup prompt from text',
        message: '사용자가 거부했습니다',
        rejected: true,
        suggestion: '앱에서 가져오기 요청을 허용한 뒤 다시 시도하세요.',
        target: 'risup:promptTemplate',
      });
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-text/verify — validate import result
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-text' &&
      parts[2] === 'verify' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'validate risup prompt import',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }

      const body = await readJsonBody(req, res, 'risup/prompt-text/verify', broadcastStatus);
      if (!body) return;

      const text = typeof body.text === 'string' ? body.text : undefined;
      if (!text) {
        return mcpError(res, 400, {
          action: 'validate risup prompt import',
          message: '"text" (string) is required',
          target: 'risup:promptTemplate',
        });
      }

      const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const model = parsePromptTemplate(rawText);
      if (model.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'validate risup prompt import',
          message: `Invalid promptTemplate: ${model.parseError}`,
          target: 'risup:promptTemplate',
        });
      }

      const result = diffRisupPromptWithText(model, text);

      if (result.error) {
        return mcpError(res, 400, {
          action: 'validate risup prompt import',
          message: `Failed to parse source text: ${result.error}`,
          target: 'risup:promptTemplate',
        });
      }

      return jsonResSuccess(
        res,
        { items: result.items, summary: result.summary },
        {
          toolName: 'validate_risup_prompt_import',
          summary:
            result.summary.mismatched === 0
              ? `All ${result.summary.total} item(s) match`
              : `${result.summary.mismatched} of ${result.summary.total} item(s) differ`,
          artifacts: result.summary,
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /risup/prompt-snippets — list persistent snippet summaries
    // ----------------------------------------------------------------
    if (parts[0] === 'risup' && parts[1] === 'prompt-snippets' && !parts[2] && req.method === 'GET') {
      try {
        const snippets = listRisupPromptSnippets(getRisupPromptSnippetLibraryFilePath(deps));
        return jsonResSuccess(
          res,
          {
            count: snippets.length,
            snippets,
          },
          {
            toolName: 'list_risup_prompt_snippets',
            summary: `Listed ${snippets.length} risup prompt snippet(s)`,
            artifacts: { count: snippets.length },
          },
        );
      } catch (error) {
        return mcpError(res, 500, {
          action: 'list risup prompt snippets',
          message: `Failed to read prompt snippet library: ${(error as Error).message}`,
          suggestion: '손상된 sidecar JSON을 정리하거나 라이브러리 파일 권한을 확인하세요.',
          target: 'risup:prompt-snippets',
          details: { error: (error as Error).message },
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-snippets/read — read one persistent snippet
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-snippets' &&
      parts[2] === 'read' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const body = await readJsonBody(req, res, 'risup/prompt-snippets/read', broadcastStatus);
      if (!body) return;
      if (typeof body.identifier !== 'string' || body.identifier.trim().length === 0) {
        return mcpError(res, 400, {
          action: 'read risup prompt snippet',
          message: 'identifier must be a non-empty string',
          suggestion: '{ "identifier": "snippet id or exact name" } 형식으로 전달하세요.',
          target: 'risup:prompt-snippets',
        });
      }

      let snippet = null;
      try {
        snippet = readRisupPromptSnippet(getRisupPromptSnippetLibraryFilePath(deps), body.identifier);
      } catch (error) {
        return mcpError(res, 500, {
          action: 'read risup prompt snippet',
          message: `Failed to read prompt snippet library: ${(error as Error).message}`,
          suggestion: '손상된 sidecar JSON을 정리하거나 라이브러리 파일 권한을 확인하세요.',
          target: 'risup:prompt-snippets',
          details: { error: (error as Error).message },
        });
      }
      if (!snippet) {
        return mcpError(res, 404, {
          action: 'read risup prompt snippet',
          message: `Prompt snippet not found: ${body.identifier}`,
          suggestion: 'list_risup_prompt_snippets로 사용 가능한 snippet id/name을 확인하세요.',
          target: 'risup:prompt-snippets',
        });
      }

      try {
        const normalized = canonicalizeRisupPromptSnippetText(snippet.text);
        return jsonResSuccess(
          res,
          {
            snippet: buildRisupPromptSnippetSummary(snippet),
            text: normalized.text,
            count: normalized.itemCount,
            hasUnsupportedContent: normalized.hasUnsupportedContent,
          },
          {
            toolName: 'read_risup_prompt_snippet',
            summary: `Read risup prompt snippet "${snippet.name}"`,
            artifacts: { count: normalized.itemCount, hasUnsupportedContent: normalized.hasUnsupportedContent },
          },
        );
      } catch (error) {
        return mcpError(res, 409, {
          action: 'read risup prompt snippet',
          message: `Stored snippet text is invalid: ${(error as Error).message}`,
          suggestion:
            'save_risup_prompt_snippet으로 같은 이름의 snippet을 덮어쓰거나 delete_risup_prompt_snippet으로 제거하세요.',
          target: 'risup:prompt-snippets',
          details: { snippet: buildRisupPromptSnippetSummary(snippet), error: (error as Error).message },
          code: 'invalid_stored_data',
          retryable: false,
          retry_mode: 'never',
          outcome: 'not_started',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-snippets/save — save/upsert persistent snippet
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-snippets' &&
      parts[2] === 'save' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const body = await readJsonBody(req, res, 'risup/prompt-snippets/save', broadcastStatus);
      if (!body) return;
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return mcpError(res, 400, {
          action: 'save risup prompt snippet',
          message: 'name must be a non-empty string',
          suggestion:
            '{ "name": "Reusable block", "indices": [0, 1] } 또는 { "name": "Reusable block", "text": "..." } 형식으로 전달하세요.',
          target: 'risup:prompt-snippets',
        });
      }

      const hasText = typeof body.text === 'string';
      const hasIndices = Array.isArray(body.indices);
      if ((hasText && hasIndices) || (!hasText && !hasIndices)) {
        return mcpError(res, 400, {
          action: 'save risup prompt snippet',
          message: 'Provide exactly one of text or indices',
          suggestion:
            '기존 serializer text를 저장하려면 text만, 현재 promptTemplate 블록을 저장하려면 indices만 전달하세요.',
          target: 'risup:prompt-snippets',
        });
      }

      let sourceText = '';
      let source = 'text';
      let sourceItems: Array<{
        index: number;
        id: string | null;
        type: string | null;
        supported: boolean;
        preview: string;
      }> = [];

      if (hasText) {
        sourceText = body.text as string;
      } else {
        if (!currentData) {
          return mcpError(res, 400, {
            action: 'save risup prompt snippet',
            message: 'No file open',
            suggestion: 'indices로 저장하려면 .risup 파일을 먼저 여세요. 파일 없이 저장하려면 text를 사용하세요.',
            target: 'document:current',
          });
        }
        const fileType = currentData._fileType || 'charx';
        if (fileType !== 'risup') {
          return mcpError(res, 400, {
            action: 'save risup prompt snippet',
            message: 'Current file is not a risup preset.',
            suggestion: 'indices로 저장하려면 .risup 파일을 연 뒤 다시 시도하세요.',
            target: 'risup:promptTemplate',
          });
        }
        const rawText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
        const model = parsePromptTemplate(rawText);
        if (model.state === 'invalid') {
          return mcpError(res, 400, {
            action: 'save risup prompt snippet',
            message: `Invalid promptTemplate: ${model.parseError}`,
            suggestion: 'write_field("promptTemplate")로 현재 promptTemplate을 먼저 수정하거나 초기화하세요.',
            target: 'risup:promptTemplate',
            details: { parseError: model.parseError },
          });
        }
        const indices = body.indices as unknown[];
        if (indices.length === 0) {
          return mcpError(res, 400, {
            action: 'save risup prompt snippet',
            message: 'indices must be a non-empty array of numbers',
            suggestion: '{ "name": "Reusable block", "indices": [0, 2] } 형식으로 전달하세요.',
            target: 'risup:promptTemplate',
          });
        }
        if (indices.length > MAX_RISUP_PROMPT_BATCH) {
          return mcpError(res, 400, {
            action: 'save risup prompt snippet',
            message: `Maximum ${MAX_RISUP_PROMPT_BATCH} indices per batch`,
            suggestion: `요청을 ${MAX_RISUP_PROMPT_BATCH}개 이하의 index로 나누어 여러 번 호출하세요.`,
            target: 'risup:promptTemplate',
          });
        }
        const resolvedIndices = indices as number[];
        for (let i = 0; i < resolvedIndices.length; i++) {
          const index = resolvedIndices[i];
          if (!Number.isInteger(index) || index < 0 || index >= model.items.length) {
            return mcpError(res, 400, {
              action: 'save risup prompt snippet',
              message: `Invalid index at position ${i}: ${String(index)}`,
              suggestion: 'list_risup_prompt_items로 유효한 index를 확인하세요.',
              target: 'risup:promptTemplate',
              details: { invalidIndex: index, batchIndex: i },
            });
          }
        }
        source = 'indices';
        sourceText = serializePromptTemplateSubsetToText(model, resolvedIndices);
        sourceItems = resolvedIndices.map((index) => ({
          index,
          id: model.items[index].id ?? null,
          type: model.items[index].type ?? null,
          supported: model.items[index].supported,
          preview: promptItemPreview(model.items[index]),
        }));
      }

      let previewCount = 0;
      try {
        const normalized = canonicalizeRisupPromptSnippetText(sourceText);
        sourceText = normalized.text;
        previewCount = normalized.itemCount;
      } catch (error) {
        return mcpError(res, 400, {
          action: 'save risup prompt snippet',
          message: `Invalid snippet text: ${(error as Error).message}`,
          suggestion:
            source === 'indices'
              ? '현재 promptTemplate 블록이 serializer로 변환 가능한지 확인하세요.'
              : 'export_risup_prompt_to_text 또는 copy_risup_prompt_items_as_text 결과 형식을 유지하면서 text를 수정하세요.',
          target: 'risup:prompt-snippets',
          details: { error: (error as Error).message },
        });
      }

      const summary = sourceItems
        .slice(0, 8)
        .map((item) => `  [${item.index}] ${item.type ?? 'unknown'}${item.supported ? '' : ' (raw)'}`)
        .join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 스니펫 저장 요청',
        source === 'indices'
          ? `AI 어시스턴트가 promptTemplate 항목 ${sourceItems.length}개를 영구 snippet "${body.name.trim()}"로 저장하려 합니다.\n\n${summary}${sourceItems.length > 8 ? '\n...' : ''}`
          : `AI 어시스턴트가 serializer text ${previewCount}개 항목을 영구 snippet "${body.name.trim()}"로 저장하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'save risup prompt snippet',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 저장 요청을 허용한 뒤 다시 시도하세요.',
          target: 'risup:prompt-snippets',
        });
      }

      try {
        const saved = saveRisupPromptSnippet(getRisupPromptSnippetLibraryFilePath(deps), {
          name: body.name,
          text: sourceText,
        });
        const snippetSummary = buildRisupPromptSnippetSummary(saved.snippet);
        logMcpMutation('save risup prompt snippet', 'risup:prompt-snippets', {
          count: saved.snippet.itemCount,
          created: saved.created,
          source,
          snippetName: saved.snippet.name,
        });
        deps.broadcastToAll('risup-prompt-snippets-updated', {
          action: saved.created ? 'created' : 'updated',
          snippet: snippetSummary,
        });
        return jsonResSuccess(
          res,
          {
            created: saved.created,
            source,
            hasUnsupportedContent: saved.hasUnsupportedContent,
            snippet: snippetSummary,
            items: sourceItems,
          },
          {
            toolName: 'save_risup_prompt_snippet',
            summary: `${saved.created ? 'Saved' : 'Updated'} risup prompt snippet "${saved.snippet.name}"`,
            artifacts: { count: saved.snippet.itemCount, created: saved.created, source },
          },
        );
      } catch (error) {
        return mcpError(res, 500, {
          action: 'save risup prompt snippet',
          message: `Failed to save prompt snippet: ${(error as Error).message}`,
          suggestion: 'sidecar JSON 파일 권한을 확인하거나 userData 디렉터리 접근 문제를 점검하세요.',
          target: 'risup:prompt-snippets',
          details: { error: (error as Error).message },
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-snippets/insert — insert a stored snippet
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-snippets' &&
      parts[2] === 'insert' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      if (!currentData) {
        return mcpError(res, 400, {
          action: 'insert risup prompt snippet',
          message: 'No file open',
          suggestion: 'snippet을 삽입하려면 .risup 파일을 먼저 여세요.',
          target: 'document:current',
        });
      }
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'risup') {
        return mcpError(res, 400, {
          action: 'insert risup prompt snippet',
          message: 'Current file is not a risup preset.',
          suggestion: 'Open a .risup file first.',
          target: 'risup:promptTemplate',
        });
      }
      const body = await readJsonBody(req, res, 'risup/prompt-snippets/insert', broadcastStatus);
      if (!body) return;
      if (typeof body.identifier !== 'string' || body.identifier.trim().length === 0) {
        return mcpError(res, 400, {
          action: 'insert risup prompt snippet',
          message: 'identifier must be a non-empty string',
          suggestion: '{ "identifier": "snippet id or exact name", "insertAt": 0 } 형식으로 전달하세요.',
          target: 'risup:prompt-snippets',
        });
      }

      let snippet = null;
      try {
        snippet = readRisupPromptSnippet(getRisupPromptSnippetLibraryFilePath(deps), body.identifier);
      } catch (error) {
        return mcpError(res, 500, {
          action: 'insert risup prompt snippet',
          message: `Failed to read prompt snippet library: ${(error as Error).message}`,
          suggestion: '손상된 sidecar JSON을 정리하거나 라이브러리 파일 권한을 확인하세요.',
          target: 'risup:prompt-snippets',
          details: { error: (error as Error).message },
        });
      }
      if (!snippet) {
        return mcpError(res, 404, {
          action: 'insert risup prompt snippet',
          message: `Prompt snippet not found: ${body.identifier}`,
          suggestion: 'list_risup_prompt_snippets로 사용 가능한 snippet id/name을 확인하세요.',
          target: 'risup:prompt-snippets',
        });
      }

      const currentPromptText = typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '';
      const currentModel = parsePromptTemplate(currentPromptText);
      if (currentModel.state === 'invalid') {
        return mcpError(res, 400, {
          action: 'insert risup prompt snippet',
          message: `Invalid current promptTemplate: ${currentModel.parseError}`,
          suggestion: 'write_field("promptTemplate")로 현재 promptTemplate을 먼저 수정하거나 초기화하세요.',
          target: 'risup:promptTemplate',
          details: { parseError: currentModel.parseError },
        });
      }

      const imported = parsePromptTemplateFromText(snippet.text);
      if (imported.state === 'invalid') {
        return mcpError(res, 409, {
          action: 'insert risup prompt snippet',
          message: `Stored snippet text is invalid: ${imported.parseError}`,
          suggestion:
            'save_risup_prompt_snippet으로 같은 이름의 snippet을 덮어쓰거나 delete_risup_prompt_snippet으로 제거하세요.',
          target: 'risup:prompt-snippets',
          details: { snippet: buildRisupPromptSnippetSummary(snippet), parseError: imported.parseError },
        });
      }

      let resolvedInsertAt = currentModel.items.length;
      if (body.insertAt !== undefined) {
        if (!Number.isInteger(body.insertAt) || body.insertAt < 0 || body.insertAt > currentModel.items.length) {
          return mcpError(res, 400, {
            action: 'insert risup prompt snippet',
            message: `insertAt must be an integer between 0 and ${currentModel.items.length}`,
            suggestion: '{ "identifier": "snippet id or exact name", "insertAt": 0 } 형식으로 전달하세요.',
            target: 'risup:promptTemplate',
          });
        }
        resolvedInsertAt = body.insertAt as number;
      }

      const insertedItems = imported.items.map((item) => duplicatePromptItem(item));
      const itemSummaries = insertedItems.map((item, index) => ({
        index,
        id: item.id ?? null,
        type: item.type ?? null,
        supported: item.supported,
        preview: promptItemPreview(item),
      }));
      const previewPromptText = serializePromptTemplate({
        items: [
          ...currentModel.items.slice(0, resolvedInsertAt),
          ...insertedItems,
          ...currentModel.items.slice(resolvedInsertAt),
        ],
      });
      const previewPromptModel = parsePromptTemplate(previewPromptText);
      const orderWarnings = collectRisupFormatingOrderWarningsForPrompt(currentData, previewPromptModel);
      const dryRun = body.dry_run === true || body.dryRun === true;
      if (dryRun) {
        return jsonResSuccess(
          res,
          {
            dry_run: true,
            success: true,
            count: imported.items.length,
            insertAt: resolvedInsertAt,
            hasUnsupportedContent: imported.hasUnsupportedContent,
            orderWarnings,
            snippet: buildRisupPromptSnippetSummary(snippet),
            total_after: currentModel.items.length + imported.items.length,
            items: itemSummaries,
          },
          {
            toolName: 'insert_risup_prompt_snippet',
            summary: `Validated insertion of risup prompt snippet "${snippet.name}"`,
            artifacts: { count: imported.items.length, dry_run: true },
          },
        );
      }

      const summary = itemSummaries
        .slice(0, 8)
        .map((item) => `  [${item.index}] ${item.type ?? 'unknown'}${item.supported ? '' : ' (raw)'}`)
        .join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 스니펫 삽입 요청',
        `AI 어시스턴트가 snippet "${snippet.name}"의 항목 ${imported.items.length}개를 promptTemplate 위치 ${resolvedInsertAt}에 삽입하려 합니다.\n\n${summary}${itemSummaries.length > 8 ? '\n...' : ''}`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'insert risup prompt snippet',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삽입 요청을 허용한 뒤 다시 시도하세요.',
          target: 'risup:promptTemplate',
        });
      }

      currentData.promptTemplate = previewPromptText;
      logMcpMutation('insert risup prompt snippet', 'risup:promptTemplate', {
        count: imported.items.length,
        insertAt: resolvedInsertAt,
        snippetName: snippet.name,
        hasUnsupportedContent: imported.hasUnsupportedContent,
      });
      deps.broadcastToAll('data-updated', 'promptTemplate', previewPromptText);
      return jsonResSuccess(
        res,
        {
          success: true,
          count: imported.items.length,
          insertAt: resolvedInsertAt,
          hasUnsupportedContent: imported.hasUnsupportedContent,
          orderWarnings,
          snippet: buildRisupPromptSnippetSummary(snippet),
        },
        {
          toolName: 'insert_risup_prompt_snippet',
          summary: `Inserted risup prompt snippet "${snippet.name}"`,
          artifacts: { count: imported.items.length, insertAt: resolvedInsertAt },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /risup/prompt-snippets/delete — delete one snippet
    // ----------------------------------------------------------------
    if (
      parts[0] === 'risup' &&
      parts[1] === 'prompt-snippets' &&
      parts[2] === 'delete' &&
      !parts[3] &&
      req.method === 'POST'
    ) {
      const body = await readJsonBody(req, res, 'risup/prompt-snippets/delete', broadcastStatus);
      if (!body) return;
      if (typeof body.identifier !== 'string' || body.identifier.trim().length === 0) {
        return mcpError(res, 400, {
          action: 'delete risup prompt snippet',
          message: 'identifier must be a non-empty string',
          suggestion: '{ "identifier": "snippet id or exact name" } 형식으로 전달하세요.',
          target: 'risup:prompt-snippets',
        });
      }

      let snippet = null;
      try {
        snippet = readRisupPromptSnippet(getRisupPromptSnippetLibraryFilePath(deps), body.identifier);
      } catch (error) {
        return mcpError(res, 500, {
          action: 'delete risup prompt snippet',
          message: `Failed to read prompt snippet library: ${(error as Error).message}`,
          suggestion: '손상된 sidecar JSON을 정리하거나 라이브러리 파일 권한을 확인하세요.',
          target: 'risup:prompt-snippets',
          details: { error: (error as Error).message },
        });
      }
      if (!snippet) {
        return mcpError(res, 404, {
          action: 'delete risup prompt snippet',
          message: `Prompt snippet not found: ${body.identifier}`,
          suggestion: 'list_risup_prompt_snippets로 사용 가능한 snippet id/name을 확인하세요.',
          target: 'risup:prompt-snippets',
        });
      }

      const allowed = await deps.askRendererConfirm(
        'MCP 스니펫 삭제 요청',
        `AI 어시스턴트가 영구 snippet "${snippet.name}" (${snippet.itemCount}개 항목)을 삭제하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'delete risup prompt snippet',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: 'risup:prompt-snippets',
        });
      }

      try {
        const removed = deleteRisupPromptSnippet(getRisupPromptSnippetLibraryFilePath(deps), body.identifier);
        if (!removed) {
          return mcpError(res, 404, {
            action: 'delete risup prompt snippet',
            message: `Prompt snippet not found: ${body.identifier}`,
            suggestion: 'list_risup_prompt_snippets로 사용 가능한 snippet id/name을 확인하세요.',
            target: 'risup:prompt-snippets',
          });
        }
        const snippetSummary = buildRisupPromptSnippetSummary(removed);
        logMcpMutation('delete risup prompt snippet', 'risup:prompt-snippets', {
          count: removed.itemCount,
          snippetName: removed.name,
        });
        deps.broadcastToAll('risup-prompt-snippets-updated', {
          action: 'deleted',
          snippet: snippetSummary,
        });
        return jsonResSuccess(
          res,
          {
            success: true,
            snippet: snippetSummary,
          },
          {
            toolName: 'delete_risup_prompt_snippet',
            summary: `Deleted risup prompt snippet "${removed.name}"`,
            artifacts: { count: removed.itemCount },
          },
        );
      } catch (error) {
        return mcpError(res, 500, {
          action: 'delete risup prompt snippet',
          message: `Failed to delete prompt snippet: ${(error as Error).message}`,
          suggestion: 'sidecar JSON 파일 권한을 확인하거나 userData 디렉터리 접근 문제를 점검하세요.',
          target: 'risup:prompt-snippets',
          details: { error: (error as Error).message },
        });
      }
    }

    return false;
  }

  return (await dispatch()) !== false;
}
