import * as http from 'http';
import * as crypto from 'crypto';

import { buildCharxZip, type CharxData } from '../charx-io';
import { validateCharxExportCompatibilityZip } from './charx-export-compatibility';
import { canonicalizeLorebookFolderRefs } from './lorebook-folders';
import {
  LOREBOOK_ALLOWED_FIELDS,
  buildLorebookListResponse,
  ensureLorebookExpectedComment,
  getLorebookEntryComment,
  getLorebookEntryLabel,
  logMcpMutation,
  normalizeLorebookEntryFolderIdentity,
  normalizeLorebookEntryForResponse,
  pickAllowedFields,
  projectLorebookEntryForResponse,
  readJsonBody,
  resolveUniqueLorebookId,
  type McpNoOpInfo,
} from './mcp-api-helpers';
import type { McpApiDeps } from './mcp-api-server';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';
import { cloneJson, normalizeLF } from './shared-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */

type LorebookApiDeps = Pick<McpApiDeps, 'askRendererConfirm' | 'broadcastToAll' | 'getReferenceFiles'>;

export interface LorebookRouteDeps {
  api: LorebookApiDeps;
  broadcastStatus: (payload: Record<string, unknown>) => void;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, options: McpSuccessOptions) => void;
  mcpError: (res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown) => void;
  mcpNoOp: (res: http.ServerResponse, info: McpNoOpInfo, extra?: Record<string, unknown>) => void;
}

export async function handleLorebookRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  url: URL,
  currentData: Record<string, any>,
  routeDeps: LorebookRouteDeps,
): Promise<boolean> {
  const deps = routeDeps.api;
  const { broadcastStatus, jsonResSuccess, mcpError, mcpNoOp } = routeDeps;

  async function dispatch(): Promise<void | false> {
    // ----------------------------------------------------------------
    // GET /lorebook
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && !parts[1] && req.method === 'GET') {
      const lbPayload = buildLorebookListResponse((currentData.lorebook as Record<string, unknown>[]) || [], url);
      const lbCount = typeof lbPayload.count === 'number' ? lbPayload.count : 0;
      return jsonResSuccess(res, lbPayload, {
        toolName: 'list_lorebook',
        summary: `Listed ${lbCount} lorebook entries`,
        artifacts: { count: lbCount },
      });
    }

    // ----------------------------------------------------------------
    // GET /lorebook/:idx
    // ----------------------------------------------------------------
    const lorebookReservedPaths = [
      'batch',
      'batch-write',
      'batch-replace',
      'batch-insert',
      'batch-add',
      'batch-delete',
      'replace-all',
      'add',
      'diff',
      'validate',
      'clone',
      'export',
      'import',
    ];
    if (parts[0] === 'lorebook' && parts[1] && !lorebookReservedPaths.includes(parts[1]) && req.method === 'GET') {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.lorebook || []).length) {
        return mcpError(res, 400, {
          action: 'read lorebook entry',
          message: `Index ${idx} out of range`,
          suggestion: 'list_lorebook 또는 GET /lorebook 으로 유효한 index를 다시 확인하세요.',
          target: `lorebook:${idx}`,
        });
      }
      const lbEntry = normalizeLorebookEntryForResponse(currentData.lorebook[idx], currentData.lorebook || []);
      return jsonResSuccess(
        res,
        {
          index: idx,
          entry: lbEntry,
        },
        {
          toolName: 'read_lorebook',
          summary: `Read lorebook entry [${idx}] "${(lbEntry as Record<string, unknown>).comment || ''}"`,
          artifacts: { index: idx, comment: (lbEntry as Record<string, unknown>).comment || '' },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /lorebook/batch — batch read multiple entries
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'batch' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/batch', broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read lorebook',
          message: 'indices must be an array of numbers',
          suggestion: 'indices를 숫자 index 배열로 전달하세요. 예: { "indices": [0, 1] }',
          target: 'lorebook:batch',
        });
      }
      const MAX_BATCH = 50;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read lorebook',
          message: `Maximum ${MAX_BATCH} indices per batch`,
          suggestion: `요청을 ${MAX_BATCH}개 이하의 index로 나누어 여러 번 호출하세요.`,
          target: 'lorebook:batch',
        });
      }
      const lorebook = currentData.lorebook || [];
      const requestedFields: string[] | undefined = body.fields;
      const entries = indices.map((idx: number) => {
        if (typeof idx !== 'number' || idx < 0 || idx >= lorebook.length) return null;
        return { index: idx, entry: projectLorebookEntryForResponse(lorebook[idx], lorebook, requestedFields) };
      });
      const validCount = entries.filter(Boolean).length;
      return jsonResSuccess(
        res,
        { count: validCount, total: indices.length, entries },
        {
          toolName: 'read_lorebook_batch',
          summary: `Batch read ${validCount}/${indices.length} lorebook entries`,
          artifacts: { count: validCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /lorebook/by-id/:id — read entry by calculated stable id
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'by-id' && parts[2] && !parts[3] && req.method === 'GET') {
      const lorebook = (currentData.lorebook as Record<string, unknown>[]) || [];
      const id = decodeURIComponent(parts[2]);
      const idx = resolveUniqueLorebookId(res, lorebook, id, 'read lorebook by id', mcpError);
      if (idx === null) return;
      const lbEntry = normalizeLorebookEntryForResponse(lorebook[idx], lorebook);
      return jsonResSuccess(
        res,
        { index: idx, id, entry: lbEntry },
        {
          toolName: 'read_lorebook_by_id',
          summary: `Read lorebook entry id ${id} at [${idx}]`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /lorebook/by-id/:id — write entry by calculated stable id
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'by-id' && parts[2] && !parts[3] && req.method === 'POST') {
      const lorebook = (currentData.lorebook as Record<string, unknown>[]) || [];
      const id = decodeURIComponent(parts[2]);
      const idx = resolveUniqueLorebookId(res, lorebook, id, 'write lorebook by id', mcpError);
      if (idx === null) return;
      const body = await readJsonBody(req, res, `lorebook/by-id/${id}`, broadcastStatus);
      if (!body) return;
      if (
        !ensureLorebookExpectedComment(
          res,
          idx,
          lorebook[idx],
          body.expected_comment,
          'write lorebook by id',
          `lorebook:${id}`,
          mcpError,
        )
      )
        return;
      const newData = body.data || body.entry;
      if (!newData || typeof newData !== 'object' || Array.isArray(newData)) {
        return mcpError(res, 400, {
          action: 'write lorebook by id',
          message: 'data must be an object',
          suggestion: '{ "data": { ... } } 형식으로 전달하세요.',
          target: `lorebook:${id}`,
        });
      }
      const entryName = getLorebookEntryLabel(lorebook[idx], idx);
      const allowed = await deps.askRendererConfirm(
        'MCP 수정 요청',
        `AI 어시스턴트가 로어북 항목 "${entryName}" (id ${id}, index ${idx})을(를) 수정하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'write lorebook by id',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: `lorebook:${id}`,
        });
      }
      Object.assign(lorebook[idx], newData as Record<string, unknown>);
      canonicalizeLorebookFolderRefs(lorebook);
      logMcpMutation('write lorebook by id', `lorebook:${id}`, { index: idx });
      deps.broadcastToAll('data-updated', 'lorebook', lorebook);
      return jsonResSuccess(
        res,
        { success: true, id, index: idx, entry: normalizeLorebookEntryForResponse(lorebook[idx], lorebook) },
        { toolName: 'write_lorebook_by_id', summary: `Updated lorebook id ${id}` },
      );
    }

    // ----------------------------------------------------------------
    // POST /lorebook/by-id/:id/delete — delete entry by calculated stable id
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'by-id' && parts[2] && parts[3] === 'delete' && req.method === 'POST') {
      const lorebook = (currentData.lorebook as Record<string, unknown>[]) || [];
      const id = decodeURIComponent(parts[2]);
      const idx = resolveUniqueLorebookId(res, lorebook, id, 'delete lorebook by id', mcpError);
      if (idx === null) return;
      const body = await readJsonBody(req, res, `lorebook/by-id/${id}/delete`, broadcastStatus);
      if (!body) return;
      if (
        !ensureLorebookExpectedComment(
          res,
          idx,
          lorebook[idx],
          body.expected_comment,
          'delete lorebook by id',
          `lorebook:${id}`,
          mcpError,
        )
      )
        return;
      const entryName = getLorebookEntryLabel(lorebook[idx], idx);
      const allowed = await deps.askRendererConfirm(
        'MCP 삭제 요청',
        `AI 어시스턴트가 로어북 항목 "${entryName}" (id ${id}, index ${idx})을(를) 삭제하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'delete lorebook by id',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: `lorebook:${id}`,
        });
      }
      lorebook.splice(idx, 1);
      canonicalizeLorebookFolderRefs(lorebook);
      logMcpMutation('delete lorebook by id', `lorebook:${id}`, { index: idx });
      deps.broadcastToAll('data-updated', 'lorebook', lorebook);
      return jsonResSuccess(
        res,
        { success: true, deleted: id, index: idx },
        { toolName: 'delete_lorebook_by_id', summary: `Deleted lorebook id ${id}` },
      );
    }

    // ----------------------------------------------------------------
    // POST /lorebook/batch-write-by-id — batch write entries by calculated stable ids
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'batch-write-by-id' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/batch-write-by-id', broadcastStatus);
      if (!body) return;
      const entries: Array<{ id: string; data: Record<string, unknown>; expected_comment?: unknown }> = body.entries;
      if (!Array.isArray(entries) || entries.length === 0 || entries.length > 50) {
        return mcpError(res, 400, {
          action: 'batch write lorebook by id',
          message: 'entries must be a non-empty array with at most 50 items',
          suggestion: '{ "entries": [{ "id": "...", "data": { ... } }] } 형식으로 전달하세요.',
          target: 'lorebook:batch-write-by-id',
        });
      }
      const lorebook = (currentData.lorebook as Record<string, unknown>[]) || [];
      const seen = new Set<string>();
      const resolved: Array<{ id: string; index: number; data: Record<string, unknown> }> = [];
      for (const [position, entry] of entries.entries()) {
        if (
          !entry ||
          typeof entry.id !== 'string' ||
          seen.has(entry.id) ||
          !entry.data ||
          typeof entry.data !== 'object' ||
          Array.isArray(entry.data)
        ) {
          return mcpError(res, 400, {
            action: 'batch write lorebook by id',
            message: `Invalid batch entry at position ${position}`,
            suggestion: '각 항목은 중복 없는 id와 data 객체를 포함해야 합니다.',
            target: 'lorebook:batch-write-by-id',
          });
        }
        seen.add(entry.id);
        const index = resolveUniqueLorebookId(res, lorebook, entry.id, 'batch write lorebook by id', mcpError);
        if (index === null) return;
        if (
          !ensureLorebookExpectedComment(
            res,
            index,
            lorebook[index],
            entry.expected_comment,
            'batch write lorebook by id',
            `lorebook:${entry.id}`,
            mcpError,
          )
        )
          return;
        resolved.push({ id: entry.id, index, data: entry.data });
      }
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 수정 요청',
        `AI 어시스턴트가 로어북 항목 ${resolved.length}개를 id 기준으로 일괄 수정하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'batch write lorebook by id',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 일괄 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: 'lorebook:batch-write-by-id',
        });
      }
      for (const entry of resolved) Object.assign(lorebook[entry.index], entry.data);
      canonicalizeLorebookFolderRefs(lorebook);
      logMcpMutation('batch write lorebook by id', 'lorebook:batch-write-by-id', { count: resolved.length });
      deps.broadcastToAll('data-updated', 'lorebook', lorebook);
      return jsonResSuccess(
        res,
        {
          success: true,
          count: resolved.length,
          results: resolved.map((entry) => ({ id: entry.id, index: entry.index })),
        },
        {
          toolName: 'write_lorebook_by_id_batch',
          summary: `Batch updated ${resolved.length} lorebook entries by id`,
          artifacts: { count: resolved.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /lorebook/batch-delete-by-id — batch delete entries by calculated stable ids
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'batch-delete-by-id' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/batch-delete-by-id', broadcastStatus);
      if (!body) return;
      const ids: string[] = body.ids;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
        return mcpError(res, 400, {
          action: 'batch delete lorebook by id',
          message: 'ids must be a non-empty array with at most 50 items',
          suggestion: '{ "ids": ["..."] } 형식으로 전달하세요.',
          target: 'lorebook:batch-delete-by-id',
        });
      }
      const lorebook = (currentData.lorebook as Record<string, unknown>[]) || [];
      const seen = new Set<string>();
      const expectedComments: unknown[] | undefined = Array.isArray(body.expected_comments)
        ? body.expected_comments
        : undefined;
      const resolved: Array<{ id: string; index: number; comment: string }> = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (typeof id !== 'string' || !id || seen.has(id)) {
          return mcpError(res, 400, {
            action: 'batch delete lorebook by id',
            message: `Invalid or duplicate id at position ${i}`,
            suggestion: '중복 없는 ids 배열을 사용하세요.',
            target: 'lorebook:batch-delete-by-id',
          });
        }
        seen.add(id);
        const index = resolveUniqueLorebookId(res, lorebook, id, 'batch delete lorebook by id', mcpError);
        if (index === null) return;
        if (
          !ensureLorebookExpectedComment(
            res,
            index,
            lorebook[index],
            expectedComments?.[i],
            'batch delete lorebook by id',
            `lorebook:${id}`,
            mcpError,
          )
        )
          return;
        resolved.push({ id, index, comment: getLorebookEntryComment(lorebook[index]) });
      }
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 삭제 요청',
        `AI 어시스턴트가 로어북 항목 ${resolved.length}개를 id 기준으로 일괄 삭제하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'batch delete lorebook by id',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 일괄 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: 'lorebook:batch-delete-by-id',
        });
      }
      for (const entry of [...resolved].sort((a, b) => b.index - a.index)) lorebook.splice(entry.index, 1);
      canonicalizeLorebookFolderRefs(lorebook);
      logMcpMutation('batch delete lorebook by id', 'lorebook:batch-delete-by-id', { count: resolved.length });
      deps.broadcastToAll('data-updated', 'lorebook', lorebook);
      return jsonResSuccess(
        res,
        { success: true, count: resolved.length, deleted: ids, indices: resolved.map((entry) => entry.index) },
        {
          toolName: 'batch_delete_lorebook_by_id',
          summary: `Batch deleted ${resolved.length} lorebook entries by id`,
          artifacts: { count: resolved.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /lorebook/batch-write — batch modify multiple entries
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'batch-write' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/batch-write', broadcastStatus);
      if (!body) return;
      const entries: Array<{ index: number; data: Record<string, unknown> }> = body.entries;
      if (!Array.isArray(entries) || entries.length === 0) {
        return mcpError(res, 400, {
          action: 'batch write lorebook',
          target: 'lorebook:batch-write',
          message: 'entries must be a non-empty array of {index, data}',
          suggestion: 'entries 배열에 {index, data} 객체를 하나 이상 포함하세요.',
        });
      }
      const MAX_BATCH = 50;
      if (entries.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch write lorebook',
          target: 'lorebook:batch-write',
          message: `Maximum ${MAX_BATCH} entries per batch`,
          suggestion: `한 번에 최대 ${MAX_BATCH}개까지만 전송할 수 있습니다. 요청을 분할하세요.`,
        });
      }
      const lorebook = currentData.lorebook || [];
      // Validate all indices first
      const invalid = entries.filter(
        (e) => typeof e.index !== 'number' || e.index < 0 || e.index >= lorebook.length || !lorebook[e.index],
      );
      if (invalid.length > 0) {
        return mcpError(res, 400, {
          action: 'batch write lorebook',
          target: 'lorebook:batch-write',
          message: `Invalid indices: ${invalid.map((e) => e.index).join(', ')}`,
          suggestion: 'GET /lorebook 으로 유효한 index 범위를 확인하세요.',
        });
      }
      const missingData = entries.filter((e) => !e.data || typeof e.data !== 'object' || Array.isArray(e.data));
      if (missingData.length > 0) {
        return mcpError(res, 400, {
          action: 'batch write lorebook',
          target: 'lorebook:batch-write',
          message: `Missing "data" object for indices: ${missingData.map((e) => e.index).join(', ')}`,
          suggestion:
            '각 entries 항목에 수정할 필드 값을 담은 data 객체를 포함하세요. 예: { "index": 0, "data": { "content": "..." } }',
        });
      }
      for (const entry of entries) {
        if (
          !ensureLorebookExpectedComment(
            res,
            entry.index,
            lorebook[entry.index],
            (entry as { expected_comment?: unknown }).expected_comment,
            'batch write lorebook',
            'lorebook:batch-write',
            mcpError,
          )
        ) {
          return;
        }
      }
      // Build summary for confirmation
      const summary = entries
        .map(
          (e) =>
            `  [${e.index}] "${lorebook[e.index].comment || `entry_${e.index}`}": ${Object.keys(e.data).join(', ')}`,
        )
        .join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 수정 요청',
        `AI 어시스턴트가 로어북 항목 ${entries.length}개를 일괄 수정하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
      );
      if (allowed) {
        const results = entries.map((e) => {
          Object.assign(lorebook[e.index], pickAllowedFields(e.data, LOREBOOK_ALLOWED_FIELDS));
          normalizeLorebookEntryFolderIdentity(lorebook[e.index]);
          return { index: e.index, success: true };
        });
        canonicalizeLorebookFolderRefs(lorebook);
        logMcpMutation('batch write lorebook', 'lorebook:batch-write', { count: entries.length });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          { success: true, count: results.length, results },
          {
            toolName: 'write_lorebook_batch',
            summary: `Batch updated ${results.length} lorebook entries`,
            artifacts: { count: results.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'batch write lorebook',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 일괄 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: 'lorebook:batch-write',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/diff — diff current vs reference lorebook entry
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'diff' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/diff', broadcastStatus);
      if (!body) return;
      const { index, refIndex, refEntryIndex } = body;
      if (typeof index !== 'number') {
        return mcpError(res, 400, {
          action: 'diff lorebook entry',
          message: 'index (current lorebook entry index) is required',
          suggestion: '비교할 현재 로어북 항목의 index를 요청 본문에 포함하세요.',
          target: 'lorebook:diff',
        });
      }
      if (typeof refIndex !== 'number' || typeof refEntryIndex !== 'number') {
        return mcpError(res, 400, {
          action: 'diff lorebook entry',
          message: 'refIndex and refEntryIndex are required',
          suggestion: '비교 대상 reference 파일 index와 lorebook entry index를 함께 전달하세요.',
          target: 'lorebook:diff',
        });
      }
      const lorebook = currentData.lorebook || [];
      if (index < 0 || index >= lorebook.length) {
        return mcpError(res, 400, {
          action: 'diff lorebook entry',
          message: `Current entry index ${index} out of range`,
          suggestion: 'GET /lorebook 또는 list_lorebook 으로 유효한 현재 entry index를 다시 확인하세요.',
          target: 'lorebook:diff',
        });
      }
      const refFiles = deps.getReferenceFiles();
      if (refIndex < 0 || refIndex >= refFiles.length) {
        return mcpError(res, 400, {
          action: 'diff lorebook entry',
          message: `Reference file index ${refIndex} out of range`,
          suggestion: 'GET /reference 로 유효한 reference file index를 확인한 뒤 다시 시도하세요.',
          target: 'lorebook:diff',
        });
      }
      const refLorebook = refFiles[refIndex].data.lorebook || [];
      if (refEntryIndex < 0 || refEntryIndex >= refLorebook.length) {
        return mcpError(res, 400, {
          action: 'diff lorebook entry',
          message: `Reference entry index ${refEntryIndex} out of range`,
          suggestion: '선택한 reference 파일의 lorebook entry index를 다시 확인하세요.',
          target: 'lorebook:diff',
        });
      }
      const current = lorebook[index];
      const reference = refLorebook[refEntryIndex];

      // Compare key fields
      const fields = [
        'key',
        'secondkey',
        'comment',
        'content',
        'mode',
        'insertorder',
        'alwaysActive',
        'selective',
        'useRegex',
      ];
      const diffs: Array<{ field: string; current: unknown; reference: unknown }> = [];
      for (const f of fields) {
        const cv = current[f] ?? '';
        const rv = reference[f] ?? '';
        if (String(cv) !== String(rv)) {
          if (f === 'content') {
            // Line-level diff for content
            const cLines = String(cv).split('\n');
            const rLines = String(rv).split('\n');
            const added: string[] = [];
            const removed: string[] = [];
            const rSet = new Set(rLines);
            const cSet = new Set(cLines);
            for (const l of cLines) {
              if (!rSet.has(l)) added.push(l);
            }
            for (const l of rLines) {
              if (!cSet.has(l)) removed.push(l);
            }
            diffs.push({
              field: f,
              current: `${cLines.length} lines (${String(cv).length} chars)`,
              reference: `${rLines.length} lines (${String(rv).length} chars)`,
              linesAdded: added.length,
              linesRemoved: removed.length,
              addedPreview: added.slice(0, 10).map((l: string) => l.substring(0, 100)),
              removedPreview: removed.slice(0, 10).map((l: string) => l.substring(0, 100)),
            } as any);
          } else {
            diffs.push({ field: f, current: cv, reference: rv });
          }
        }
      }
      return jsonResSuccess(
        res,
        {
          index,
          refIndex,
          refEntryIndex,
          currentComment: current.comment || '',
          referenceComment: reference.comment || '',
          referenceFile: refFiles[refIndex].fileName,
          identical: diffs.length === 0,
          diffCount: diffs.length,
          diffs,
        },
        {
          toolName: 'diff_lorebook',
          summary:
            diffs.length === 0
              ? `Lorebook entry [${index}] is identical to reference`
              : `Found ${diffs.length} differences in lorebook entry [${index}]`,
          artifacts: { diffCount: diffs.length, identical: diffs.length === 0 },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /lorebook/validate — validate lorebook keys for common issues
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'validate' && req.method === 'GET') {
      const lorebook = currentData.lorebook || [];
      const issues: Array<{ index: number; comment: string; type: string; detail: string }> = [];
      const keyIndex = new Map<string, number[]>();

      for (let i = 0; i < lorebook.length; i++) {
        const entry = lorebook[i];
        if (entry.mode === 'folder') continue;
        const comment = entry.comment || `entry_${i}`;
        const key: string = entry.key || '';

        // Check trailing/leading commas
        if (key.match(/,\s*$/)) {
          issues.push({ index: i, comment, type: 'trailing_comma', detail: `key에 후행 쉼표: "${key.slice(-20)}"` });
        }
        if (key.match(/^\s*,/)) {
          issues.push({ index: i, comment, type: 'leading_comma', detail: `key에 선행 쉼표: "${key.slice(0, 20)}"` });
        }
        // Check trailing/leading whitespace in individual keys
        const keys = key.split(',');
        for (const k of keys) {
          if (k !== k.trim() && k.trim().length > 0) {
            issues.push({
              index: i,
              comment,
              type: 'whitespace',
              detail: `키워드에 불필요한 공백: "${k}" → "${k.trim()}"`,
            });
            break; // one per entry
          }
        }
        // Check empty key segments
        const emptySegments = keys.filter((k) => k.trim() === '' && key.includes(',')).length;
        if (emptySegments > 0) {
          issues.push({ index: i, comment, type: 'empty_segment', detail: `빈 키 세그먼트 ${emptySegments}개` });
        }
        // Track duplicate keys across entries
        for (const k of keys) {
          const trimmed = k.trim().toLowerCase();
          if (!trimmed) continue;
          if (!keyIndex.has(trimmed)) keyIndex.set(trimmed, []);
          keyIndex.get(trimmed)!.push(i);
        }
      }

      // Report duplicate keys
      for (const [key, indices] of keyIndex.entries()) {
        if (indices.length > 1) {
          const comments = indices.map((i) => `[${i}] ${lorebook[i].comment || `entry_${i}`}`).join(', ');
          issues.push({
            index: indices[0],
            comment: `중복 키`,
            type: 'duplicate_key',
            detail: `키 "${key}"가 ${indices.length}개 항목에 중복: ${comments}`,
          });
        }
      }

      const totalEntries = lorebook.filter((e: any) => e.mode !== 'folder').length;
      return jsonResSuccess(
        res,
        {
          totalEntries,
          issueCount: issues.length,
          issues: issues.sort((a, b) => a.index - b.index),
        },
        {
          toolName: 'validate_lorebook_keys',
          summary: `Validated ${totalEntries} lorebook entries, found ${issues.length} issues`,
          artifacts: { totalEntries, issueCount: issues.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /charx/export-compatibility — validate RisuAI upload compatibility
    // ----------------------------------------------------------------
    if (parts[0] === 'charx' && parts[1] === 'export-compatibility' && !parts[2] && req.method === 'GET') {
      const fileType = currentData._fileType || 'charx';
      if (fileType !== 'charx') {
        return mcpError(res, 400, {
          action: 'validate charx export compatibility',
          message: 'RisuAI export compatibility validation is only available for .charx documents.',
          suggestion: 'Open a .charx file or use a validator that matches the current document type.',
          target: `document:${fileType}`,
        });
      }
      const zip = buildCharxZip(cloneJson(currentData) as CharxData);
      const result = validateCharxExportCompatibilityZip(zip);
      const payload: Record<string, unknown> = { ...result };
      return jsonResSuccess(res, payload, {
        toolName: 'validate_charx_export_compatibility',
        summary: result.summary,
        artifacts: {
          ok: result.ok,
          issueCount: result.issueCount,
          uploadRiskCount: result.counts['upload-risk'],
          autoFixableCount: result.counts['auto-fixable'],
          manualReviewCount: result.counts['manual-review'],
        },
      });
    }

    // ----------------------------------------------------------------
    // POST /lorebook/clone — clone a lorebook entry
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'clone' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/clone', broadcastStatus);
      if (!body) return;
      const sourceIdx = body.index;
      if (typeof sourceIdx !== 'number' || sourceIdx < 0 || sourceIdx >= (currentData.lorebook || []).length) {
        return mcpError(res, 400, {
          action: 'clone lorebook entry',
          message: `Source index ${sourceIdx} out of range`,
          suggestion: '복제할 원본 lorebook index를 GET /lorebook 또는 list_lorebook 으로 다시 확인하세요.',
          target: `lorebook:clone:${sourceIdx}`,
        });
      }
      const source = currentData.lorebook[sourceIdx];
      if (
        !ensureLorebookExpectedComment(
          res,
          sourceIdx,
          source,
          body.expected_comment,
          'clone lorebook entry',
          `lorebook:clone:${sourceIdx}`,
          mcpError,
        )
      ) {
        return;
      }
      const sourceName = getLorebookEntryLabel(source, sourceIdx);

      const allowed = await deps.askRendererConfirm(
        'MCP 복제 요청',
        `AI 어시스턴트가 로어북 항목 "${sourceName}" (index ${sourceIdx})을 복제하려 합니다.`,
      );

      if (allowed) {
        const clone = cloneJson(source);
        // Apply overrides
        if (body.overrides && typeof body.overrides === 'object') {
          Object.assign(clone, pickAllowedFields(body.overrides, LOREBOOK_ALLOWED_FIELDS));
        }
        if (clone.mode === 'folder') {
          clone.key = crypto.randomUUID();
          clone.folder = '';
          delete clone.id;
        } else {
          // Generate new ID to avoid conflicts
          clone.id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
          normalizeLorebookEntryFolderIdentity(clone);
        }
        currentData.lorebook.push(clone);
        canonicalizeLorebookFolderRefs(currentData.lorebook);
        const newIndex = currentData.lorebook.length - 1;
        logMcpMutation('clone lorebook entry', `lorebook:clone`, { sourceIdx, sourceName, newIndex });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          { success: true, sourceIndex: sourceIdx, newIndex, comment: clone.comment || '' },
          {
            toolName: 'clone_lorebook',
            summary: `Cloned lorebook entry [${sourceIdx}] → [${newIndex}]`,
            artifacts: { sourceIndex: sourceIdx, newIndex },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'clone lorebook entry',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 복제 요청을 허용한 뒤 다시 시도하세요.',
          target: `lorebook:clone:${sourceIdx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/:idx (modify existing)
    // ----------------------------------------------------------------
    if (
      parts[0] === 'lorebook' &&
      parts[1] &&
      !lorebookReservedPaths.includes(parts[1]) &&
      !parts[2] &&
      req.method === 'POST'
    ) {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.lorebook || []).length || !currentData.lorebook[idx]) {
        return mcpError(res, 400, {
          action: 'update lorebook entry',
          message: `Index ${idx} out of range or entry missing`,
          suggestion: 'list_lorebook 또는 GET /lorebook 으로 유효한 index를 다시 확인하세요.',
          target: `lorebook:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `lorebook/${idx}`, broadcastStatus);
      if (!body) return;
      if (
        !ensureLorebookExpectedComment(
          res,
          idx,
          currentData.lorebook[idx],
          body.expected_comment,
          'update lorebook entry',
          `lorebook:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const entryName: string = getLorebookEntryLabel(currentData.lorebook[idx], idx);

      const allowed = await deps.askRendererConfirm(
        'MCP 수정 요청',
        `AI 어시스턴트가 로어북 항목 "${entryName}" (index ${idx})을 수정하려 합니다.\n현재 에디터에서 수정 중인 내용이 덮어씌워질 수 있습니다.`,
      );

      if (allowed) {
        Object.assign(currentData.lorebook[idx], pickAllowedFields(body, LOREBOOK_ALLOWED_FIELDS));
        normalizeLorebookEntryFolderIdentity(currentData.lorebook[idx]);
        canonicalizeLorebookFolderRefs(currentData.lorebook);
        logMcpMutation('update lorebook entry', `lorebook:${idx}`, { entryName, updatedKeys: Object.keys(body) });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          { success: true, index: idx },
          {
            toolName: 'write_lorebook',
            summary: `Updated lorebook entry [${idx}] "${entryName}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'update lorebook entry',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 변경 요청을 허용한 뒤 다시 시도하세요.',
          target: `lorebook:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/add
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'add' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/add', broadcastStatus);
      if (!body) return;
      const name = body.comment || '새 항목';

      const allowed = await deps.askRendererConfirm(
        'MCP 추가 요청',
        `AI 어시스턴트가 새 로어북 항목 "${name}"을(를) 추가하려 합니다.`,
      );

      if (allowed) {
        const entry = Object.assign(
          {
            key: '',
            secondkey: '',
            comment: '',
            content: '',
            folder: '',
            order: 100,
            priority: 0,
            selective: false,
            alwaysActive: false,
            mode: 'normal',
            extentions: {},
          },
          pickAllowedFields(body, LOREBOOK_ALLOWED_FIELDS),
        );
        normalizeLorebookEntryFolderIdentity(entry);
        if (!currentData.lorebook) currentData.lorebook = [];
        currentData.lorebook.push(entry);
        canonicalizeLorebookFolderRefs(currentData.lorebook);
        logMcpMutation('add lorebook entry', 'lorebook:add', {
          entryName: name,
          newIndex: currentData.lorebook.length - 1,
        });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        const addedIdx = currentData.lorebook.length - 1;
        return jsonResSuccess(
          res,
          { success: true, index: addedIdx },
          {
            toolName: 'add_lorebook',
            summary: `Added lorebook entry [${addedIdx}] "${name}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'add lorebook entry',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
          target: 'lorebook:add',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/batch-add — batch add multiple entries
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'batch-add' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/batch-add', broadcastStatus);
      if (!body) return;
      const entries: Array<Record<string, unknown>> = body.entries;
      if (!Array.isArray(entries) || entries.length === 0) {
        return mcpError(res, 400, {
          action: 'batch add lorebook entries',
          target: 'lorebook:batch-add',
          message: 'entries must be a non-empty array',
          suggestion: 'entries 배열에 추가할 항목 객체를 하나 이상 포함하세요.',
        });
      }
      const MAX_BATCH = 50;
      if (entries.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch add lorebook entries',
          target: 'lorebook:batch-add',
          message: `Maximum ${MAX_BATCH} entries per batch`,
          suggestion: `한 번에 최대 ${MAX_BATCH}개까지만 추가할 수 있습니다. 요청을 분할하세요.`,
        });
      }

      const names = entries.map((e, i) => (e.comment as string) || `entry_${i}`);
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 추가 요청',
        `AI 어시스턴트가 ${entries.length}개의 로어북 항목을 추가하려 합니다:\n${names.map((n, i) => `  ${i + 1}. ${n}`).join('\n')}`,
      );

      if (allowed) {
        if (!currentData.lorebook) currentData.lorebook = [];
        const results: Array<{ index: number; comment: string }> = [];
        for (const entryData of entries) {
          const entry = Object.assign(
            {
              key: '',
              secondkey: '',
              comment: '',
              content: '',
              folder: '',
              order: 100,
              priority: 0,
              selective: false,
              alwaysActive: false,
              mode: 'normal',
              extentions: {},
            },
            pickAllowedFields(entryData, LOREBOOK_ALLOWED_FIELDS),
          );
          normalizeLorebookEntryFolderIdentity(entry);
          currentData.lorebook.push(entry);
          const newIndex = currentData.lorebook.length - 1;
          results.push({ index: newIndex, comment: (entry.comment as string) || `entry_${newIndex}` });
        }
        canonicalizeLorebookFolderRefs(currentData.lorebook);
        logMcpMutation('batch add lorebook entries', 'lorebook:batch-add', {
          count: entries.length,
          entries: results,
        });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          { success: true, added: results.length, entries: results, results },
          {
            toolName: 'add_lorebook_batch',
            summary: `Batch added ${results.length} lorebook entries`,
            artifacts: { added: results.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'batch add lorebook entries',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
          target: 'lorebook:batch-add',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/batch-delete — batch delete multiple entries
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'batch-delete' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/batch-delete', broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices) || indices.length === 0) {
        return mcpError(res, 400, {
          action: 'batch delete lorebook entries',
          target: 'lorebook:batch-delete',
          message: 'indices must be a non-empty array',
          suggestion: 'indices 배열에 삭제할 index를 하나 이상 포함하세요.',
        });
      }
      const MAX_BATCH = 50;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch delete lorebook entries',
          target: 'lorebook:batch-delete',
          message: `Maximum ${MAX_BATCH} deletions per batch`,
          suggestion: `한 번에 최대 ${MAX_BATCH}개까지만 삭제할 수 있습니다. 요청을 분할하세요.`,
        });
      }

      const lorebook = currentData.lorebook || [];
      const expectedComments = body.expected_comments;
      if (expectedComments !== undefined) {
        if (!Array.isArray(expectedComments) || expectedComments.length !== indices.length) {
          return mcpError(res, 400, {
            action: 'batch delete lorebook entries',
            target: 'lorebook:batch-delete',
            message: 'expected_comments must be an array with the same length as indices',
            suggestion: 'expected_comments를 indices와 같은 순서/길이의 comment 배열로 보내거나 생략하세요.',
          });
        }
        if (expectedComments.some((comment) => typeof comment !== 'string')) {
          return mcpError(res, 400, {
            action: 'batch delete lorebook entries',
            target: 'lorebook:batch-delete',
            message: 'expected_comments entries must all be strings',
            suggestion: 'expected_comments에는 문자열 comment만 포함하세요.',
          });
        }
      }
      for (const idx of indices) {
        if (typeof idx !== 'number' || idx < 0 || idx >= lorebook.length || !lorebook[idx]) {
          return mcpError(res, 400, {
            action: 'batch delete lorebook entries',
            target: 'lorebook:batch-delete',
            message: `Invalid index: ${idx}`,
            suggestion: 'GET /lorebook 으로 유효한 index 범위를 확인하세요.',
          });
        }
      }
      if (Array.isArray(expectedComments)) {
        for (const [position, idx] of indices.entries()) {
          if (
            !ensureLorebookExpectedComment(
              res,
              idx,
              lorebook[idx],
              expectedComments[position],
              'batch delete lorebook entries',
              'lorebook:batch-delete',
              mcpError,
            )
          ) {
            return;
          }
        }
      }

      const entryNames = indices.map((idx) => `${idx}: ${getLorebookEntryLabel(lorebook[idx], idx)}`);
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 삭제 요청',
        `AI 어시스턴트가 ${indices.length}개의 로어북 항목을 삭제하려 합니다:\n${entryNames.map((n) => `  - ${n}`).join('\n')}`,
      );

      if (allowed) {
        // Sort descending to avoid index shift issues
        const sorted = [...indices].sort((a, b) => b - a);
        const deleted: Array<{ index: number; comment: string }> = [];
        for (const idx of sorted) {
          deleted.push({ index: idx, comment: lorebook[idx].comment || `entry_${idx}` });
          currentData.lorebook.splice(idx, 1);
        }
        logMcpMutation('batch delete lorebook entries', 'lorebook:batch-delete', {
          count: indices.length,
          entries: deleted,
        });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          { success: true, deleted: deleted.length, entries: deleted, results: deleted },
          {
            toolName: 'batch_delete_lorebook',
            summary: `Batch deleted ${deleted.length} lorebook entries`,
            artifacts: { deleted: deleted.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'batch delete lorebook entries',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: 'lorebook:batch-delete',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/replace-all — global find & replace across ALL lorebook entries
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'replace-all' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/replace-all', broadcastStatus);
      if (!body) return;
      if (!body.find) {
        return mcpError(res, 400, {
          action: 'replace all lorebook',
          message: 'Missing "find"',
          suggestion: 'find 문자열을 포함한 요청 본문을 보내세요.',
          target: 'lorebook:replace-all',
        });
      }
      const REPLACEABLE_FIELDS = ['content', 'comment', 'key', 'secondkey'];
      const targetField: string = body.field || 'content';
      if (!REPLACEABLE_FIELDS.includes(targetField)) {
        return mcpError(res, 400, {
          action: 'replace all lorebook',
          message: `field "${targetField}"는 지원하지 않습니다.`,
          suggestion: `지원 필드: ${REPLACEABLE_FIELDS.join(', ')}`,
          target: 'lorebook:replace-all',
        });
      }
      const lorebook = currentData.lorebook || [];
      const findStr: string = normalizeLF(body.find);
      const replaceStr: string = body.replace !== undefined ? normalizeLF(body.replace) : '';
      const useRegex = !!body.regex;
      const flags: string = body.flags || 'g';
      const dryRun = !!(body.dry_run ?? body.dryRun);

      const results: Array<{
        index: number;
        comment: string;
        matchCount: number;
        newContent: string;
        oldSize: number;
      }> = [];

      for (let i = 0; i < lorebook.length; i++) {
        const entry = lorebook[i];
        if (!entry || entry.mode === 'folder') continue;
        const content: string = normalizeLF(entry[targetField] || '');
        if (!content) continue;

        let matchCount: number;
        let newContent: string;
        if (useRegex) {
          const re = new RegExp(findStr, flags);
          const matches = content.match(re);
          matchCount = matches ? matches.length : 0;
          newContent = content.replace(re, replaceStr);
        } else {
          matchCount = 0;
          let searchFrom = 0;
          while (true) {
            const pos = content.indexOf(findStr, searchFrom);
            if (pos === -1) break;
            matchCount++;
            searchFrom = pos + findStr.length;
          }
          newContent = content.split(findStr).join(replaceStr);
        }

        if (matchCount > 0) {
          results.push({
            index: i,
            comment: entry.comment || `entry_${i}`,
            matchCount,
            newContent,
            oldSize: content.length,
          });
        }
      }

      if (results.length === 0) {
        return mcpNoOp(
          res,
          {
            action: 'replace all lorebook',
            message: '전체 로어북에서 일치하는 항목 없음',
            suggestion:
              'list_lorebook 또는 read_lorebook_batch로 현재 내용을 확인하고 find/field/regex/flags를 조정하세요.',
            target: 'lorebook:replace-all',
          },
          {
            totalEntries: lorebook.length,
            matchedEntries: 0,
            totalMatches: 0,
            field: targetField,
            ...(dryRun ? { dryRun: true } : {}),
          },
        );
      }

      const totalMatches = results.reduce((s, r) => s + r.matchCount, 0);

      // Dry-run: return match info without modifying
      if (dryRun) {
        return jsonResSuccess(
          res,
          {
            dryRun: true,
            field: targetField,
            totalEntries: lorebook.length,
            matchedEntries: results.length,
            totalMatches,
            results: results.map((r) => ({
              index: r.index,
              comment: r.comment,
              matchCount: r.matchCount,
            })),
          },
          {
            toolName: 'replace_across_all_lorebook',
            summary: `Dry-run: ${totalMatches} match(es) across ${results.length} lorebook entries`,
            artifacts: { totalMatches, matchedEntries: results.length, totalEntries: lorebook.length },
          },
        );
      }

      const summary = results
        .slice(0, 20)
        .map((r) => `  [${r.index}] "${r.comment}": ${r.matchCount}건`)
        .join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 전체 로어북 치환 요청',
        `AI 어시스턴트가 로어북 ${results.length}개 항목의 ${targetField} 필드에서 총 ${totalMatches}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}\n\n${summary}${results.length > 20 ? `\n... 외 ${results.length - 20}개 항목` : ''}`,
      );

      if (allowed) {
        for (const r of results) {
          lorebook[r.index][targetField] = r.newContent;
        }
        logMcpMutation('replace all lorebook', 'lorebook:replace-all', {
          field: targetField,
          matchedEntries: results.length,
          totalMatches,
        });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          {
            success: true,
            field: targetField,
            matchedEntries: results.length,
            totalMatches,
            results: results.map((r) => ({
              index: r.index,
              comment: r.comment,
              matchCount: r.matchCount,
            })),
          },
          {
            toolName: 'replace_across_all_lorebook',
            summary: `Replaced ${totalMatches} matches across ${results.length} lorebook entries`,
            artifacts: { matchedEntries: results.length, totalMatches },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'replace all lorebook',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 일괄 치환 요청을 허용한 뒤 다시 시도하세요.',
          target: 'lorebook:replace-all',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/batch-replace — batch replace text in multiple entries
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'batch-replace' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/batch-replace', broadcastStatus);
      if (!body) return;
      const dryRun = !!(body.dry_run ?? body.dryRun);
      const replacements: Array<{
        index: number;
        find: string;
        replace?: string;
        regex?: boolean;
        flags?: string;
        expected_comment?: string;
      }> = body.replacements;
      if (!Array.isArray(replacements) || replacements.length === 0) {
        return mcpError(res, 400, {
          action: 'batch replace lorebook',
          target: 'lorebook:batch-replace',
          message: 'replacements must be a non-empty array',
          suggestion: 'replacements 배열에 {index, find, replace} 객체를 하나 이상 포함하세요.',
        });
      }
      const MAX_BATCH = 50;
      if (replacements.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch replace lorebook',
          target: 'lorebook:batch-replace',
          message: `Maximum ${MAX_BATCH} replacements per batch`,
          suggestion: `한 번에 최대 ${MAX_BATCH}개까지만 치환할 수 있습니다. 요청을 분할하세요.`,
        });
      }
      const lorebook = currentData.lorebook || [];
      // Validate indices and find strings
      for (const r of replacements) {
        if (typeof r.index !== 'number' || r.index < 0 || r.index >= lorebook.length || !lorebook[r.index]) {
          return mcpError(res, 400, {
            action: 'batch replace lorebook',
            target: 'lorebook:batch-replace',
            message: `Invalid index: ${r.index}`,
            suggestion: 'GET /lorebook 으로 유효한 index 범위를 확인하세요.',
          });
        }
        if (!r.find) {
          return mcpError(res, 400, {
            action: 'batch replace lorebook',
            target: 'lorebook:batch-replace',
            message: `Missing "find" for index ${r.index}`,
            suggestion: '각 replacement 객체에 검색할 find 문자열을 포함하세요.',
          });
        }
        if (
          !ensureLorebookExpectedComment(
            res,
            r.index,
            lorebook[r.index],
            r.expected_comment,
            'batch replace lorebook',
            'lorebook:batch-replace',
            mcpError,
          )
        ) {
          return;
        }
      }
      // Pre-compute matches for each replacement
      const results = replacements.map((r) => {
        const entry = lorebook[r.index];
        const content: string = normalizeLF((entry && entry.content) || '');
        const findStr: string = normalizeLF(r.find);
        const replaceStr: string = r.replace !== undefined ? normalizeLF(r.replace) : '';
        const useRegex = !!r.regex;
        const flags: string = r.flags || 'g';
        let matchCount: number;
        let newContent: string;
        if (useRegex) {
          const re = new RegExp(findStr, flags);
          const matches = content.match(re);
          matchCount = matches ? matches.length : 0;
          newContent = content.replace(re, replaceStr);
        } else {
          matchCount = 0;
          let searchFrom = 0;
          while (true) {
            const pos = content.indexOf(findStr, searchFrom);
            if (pos === -1) break;
            matchCount++;
            searchFrom = pos + findStr.length;
          }
          newContent = content.split(findStr).join(replaceStr);
        }
        return {
          index: r.index,
          comment: (entry && entry.comment) || `entry_${r.index}`,
          matchCount,
          newContent,
          skipped: matchCount === 0,
        };
      });
      const activeResults = results.filter((r) => !r.skipped);
      if (activeResults.length === 0) {
        return mcpNoOp(
          res,
          {
            action: 'batch replace lorebook',
            message: '모든 항목에서 일치하는 내용 없음',
            suggestion: 'results를 확인해 index별 find/replace/regex/flags를 조정한 뒤 다시 시도하세요.',
            target: 'lorebook:batch-replace',
          },
          {
            results: results.map((r) => ({ index: r.index, comment: r.comment, matchCount: 0, skipped: true })),
          },
        );
      }
      const summary = activeResults.map((r) => `  [${r.index}] "${r.comment}": ${r.matchCount}건`).join('\n');
      if (dryRun) {
        return jsonResSuccess(
          res,
          {
            success: true,
            dryRun: true,
            count: activeResults.length,
            results: results.map((r) => ({
              index: r.index,
              comment: r.comment,
              matchCount: r.matchCount,
              skipped: r.skipped,
            })),
          },
          {
            toolName: 'replace_in_lorebook_batch',
            summary: `Dry-run: matched ${activeResults.length} lorebook replacements`,
            artifacts: { count: activeResults.length, dryRun: true },
          },
        );
      }
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 치환 요청',
        `AI 어시스턴트가 로어북 ${activeResults.length}개 항목에서 치환하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
      );
      if (allowed) {
        for (const r of activeResults) {
          lorebook[r.index].content = r.newContent;
        }
        logMcpMutation('batch replace lorebook', 'lorebook:batch-replace', {
          count: activeResults.length,
          totalMatches: activeResults.reduce((s, r) => s + r.matchCount, 0),
        });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          {
            success: true,
            count: activeResults.length,
            results: results.map((r) => ({
              index: r.index,
              comment: r.comment,
              matchCount: r.matchCount,
              skipped: r.skipped,
            })),
          },
          {
            toolName: 'replace_in_lorebook_batch',
            summary: `Batch replaced in ${activeResults.length} lorebook entries`,
            artifacts: { count: activeResults.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'batch replace lorebook',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 일괄 치환 요청을 허용한 뒤 다시 시도하세요.',
          target: 'lorebook:batch-replace',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/batch-insert — batch insert text into multiple entries
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] === 'batch-insert' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lorebook/batch-insert', broadcastStatus);
      if (!body) return;
      const insertions: Array<{
        index: number;
        content: string;
        position?: string;
        anchor?: string;
        expected_comment?: string;
      }> = body.insertions;
      if (!Array.isArray(insertions) || insertions.length === 0) {
        return mcpError(res, 400, {
          action: 'batch insert lorebook',
          target: 'lorebook:batch-insert',
          message: 'insertions must be a non-empty array',
          suggestion: 'insertions 배열에 {index, content} 객체를 하나 이상 포함하세요.',
        });
      }
      const MAX_BATCH = 50;
      if (insertions.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch insert lorebook',
          target: 'lorebook:batch-insert',
          message: `Maximum ${MAX_BATCH} insertions per batch`,
          suggestion: `한 번에 최대 ${MAX_BATCH}개까지만 삽입할 수 있습니다. 요청을 분할하세요.`,
        });
      }
      const lorebook = currentData.lorebook || [];
      // Validate
      for (const ins of insertions) {
        if (typeof ins.index !== 'number' || ins.index < 0 || ins.index >= lorebook.length || !lorebook[ins.index]) {
          return mcpError(res, 400, {
            action: 'batch insert lorebook',
            target: 'lorebook:batch-insert',
            message: `Invalid index: ${ins.index}`,
            suggestion: 'GET /lorebook 으로 유효한 index 범위를 확인하세요.',
          });
        }
        if (ins.content === undefined) {
          return mcpError(res, 400, {
            action: 'batch insert lorebook',
            target: 'lorebook:batch-insert',
            message: `Missing "content" for index ${ins.index}`,
            suggestion: '각 insertion 객체에 삽입할 content 문자열을 포함하세요.',
          });
        }
        if (
          !ensureLorebookExpectedComment(
            res,
            ins.index,
            lorebook[ins.index],
            ins.expected_comment,
            'batch insert lorebook',
            'lorebook:batch-insert',
            mcpError,
          )
        ) {
          return;
        }
      }
      // Pre-compute new contents
      const results = insertions.map((ins) => {
        const entry = lorebook[ins.index];
        const oldContent: string = normalizeLF((entry && entry.content) || '');
        const position = ins.position || 'end';
        let newContent: string;
        let error: string | undefined;
        const insContent = normalizeLF(ins.content);
        if (position === 'end') {
          newContent = oldContent + '\n' + insContent;
        } else if (position === 'start') {
          newContent = insContent + '\n' + oldContent;
        } else if ((position === 'after' || position === 'before') && ins.anchor) {
          const normalizedAnchor = normalizeLF(ins.anchor);
          const anchorPos = oldContent.indexOf(normalizedAnchor);
          if (anchorPos === -1) {
            error = `앵커를 찾을 수 없음: ${ins.anchor.substring(0, 60)}`;
            newContent = oldContent;
          } else if (position === 'after') {
            const insertAt = anchorPos + normalizedAnchor.length;
            newContent = oldContent.slice(0, insertAt) + '\n' + insContent + oldContent.slice(insertAt);
          } else {
            newContent = oldContent.slice(0, anchorPos) + insContent + '\n' + oldContent.slice(anchorPos);
          }
        } else {
          error = 'position이 "after"/"before"일 때 anchor가 필요합니다';
          newContent = oldContent;
        }
        return {
          index: ins.index,
          comment: (entry && entry.comment) || `entry_${ins.index}`,
          position,
          newContent,
          oldSize: oldContent.length,
          newSize: newContent.length,
          error,
        };
      });
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        return mcpNoOp(
          res,
          {
            action: 'batch insert lorebook',
            message: '하나 이상의 삽입 요청에 오류가 있습니다',
            suggestion: 'errors 배열의 index/error를 확인해 anchor/position/content를 수정한 뒤 다시 시도하세요.',
            target: 'lorebook:batch-insert',
          },
          {
            errors: errors.map((r) => ({ index: r.index, error: r.error })),
          },
        );
      }
      const summary = results
        .map((r) => `  [${r.index}] "${r.comment}": ${r.position}, +${r.newSize - r.oldSize} chars`)
        .join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 삽입 요청',
        `AI 어시스턴트가 로어북 ${results.length}개 항목에 내용을 삽입하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
      );
      if (allowed) {
        for (const r of results) {
          lorebook[r.index].content = r.newContent;
        }
        logMcpMutation('batch insert lorebook', 'lorebook:batch-insert', { count: results.length });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          {
            success: true,
            count: results.length,
            results: results.map((r) => ({
              index: r.index,
              comment: r.comment,
              position: r.position,
              oldSize: r.oldSize,
              newSize: r.newSize,
            })),
          },
          {
            toolName: 'insert_in_lorebook_batch',
            summary: `Batch inserted content into ${results.length} lorebook entries`,
            artifacts: { count: results.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'batch insert lorebook',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 일괄 삽입 요청을 허용한 뒤 다시 시도하세요.',
          target: 'lorebook:batch-insert',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/:idx/replace — replace text in lorebook entry field
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] && parts[2] === 'replace' && req.method === 'POST') {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.lorebook || []).length || !currentData.lorebook[idx]) {
        return mcpError(res, 400, {
          action: 'replace lorebook content',
          message: `Index ${idx} out of range or entry missing`,
          suggestion: 'list_lorebook 또는 GET /lorebook 으로 유효한 index를 다시 확인하세요.',
          target: `lorebook:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `lorebook/${idx}/replace`, broadcastStatus);
      if (!body) return;
      if (
        !ensureLorebookExpectedComment(
          res,
          idx,
          currentData.lorebook[idx],
          body.expected_comment,
          'replace lorebook field',
          `lorebook:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      if (!body.find) {
        return mcpError(res, 400, {
          action: 'replace lorebook content',
          message: 'Missing "find"',
          suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
          target: `lorebook:${idx}`,
        });
      }
      const LOREBOOK_REPLACEABLE_FIELDS = ['content', 'comment', 'key', 'secondkey'];
      const targetField: string = body.field || 'content';
      if (!LOREBOOK_REPLACEABLE_FIELDS.includes(targetField)) {
        return mcpError(res, 400, {
          action: 'replace lorebook field',
          message: `field "${targetField}"는 치환을 지원하지 않습니다.`,
          suggestion: `지원 필드: ${LOREBOOK_REPLACEABLE_FIELDS.join(', ')}`,
          target: `lorebook:${idx}`,
        });
      }
      const entryName: string = getLorebookEntryLabel(currentData.lorebook[idx], idx);
      const content: string = normalizeLF(currentData.lorebook[idx][targetField] || '');
      const findStr: string = normalizeLF(body.find);
      const replaceStr: string = body.replace !== undefined ? normalizeLF(body.replace) : '';
      const useRegex = !!body.regex;
      const flags: string = body.flags || 'g';
      const dryRun = !!(body.dry_run ?? body.dryRun);

      let newContent: string;
      let matchCount: number;
      if (useRegex) {
        const re = new RegExp(findStr, flags);
        const matches = content.match(re);
        matchCount = matches ? matches.length : 0;
        newContent = content.replace(re, replaceStr);
      } else {
        matchCount = 0;
        let searchFrom = 0;
        while (true) {
          const pos = content.indexOf(findStr, searchFrom);
          if (pos === -1) break;
          matchCount++;
          searchFrom = pos + findStr.length;
        }
        newContent = content.split(findStr).join(replaceStr);
      }

      if (matchCount === 0) {
        return mcpNoOp(
          res,
          {
            action: 'replace lorebook field',
            message: '일치하는 항목 없음',
            suggestion: 'read_lorebook 또는 list_lorebook로 현재 내용을 확인하고 find/field/regex/flags를 조정하세요.',
            target: `lorebook:${idx}`,
          },
          { matchCount: 0, field: targetField },
        );
      }

      const fieldLabel = targetField === 'content' ? '' : ` [${targetField}]`;
      if (dryRun) {
        return jsonResSuccess(
          res,
          {
            dryRun: true,
            index: idx,
            comment: entryName,
            field: targetField,
            matchCount,
            oldSize: content.length,
            newSize: newContent.length,
          },
          {
            toolName: 'replace_in_lorebook',
            summary: `Dry-run: ${matchCount} match(es) in lorebook entry [${idx}] "${entryName}"`,
            artifacts: { matchCount, oldSize: content.length, newSize: newContent.length },
          },
        );
      }

      const allowed = await deps.askRendererConfirm(
        'MCP 치환 요청',
        `AI 어시스턴트가 로어북 항목 "${entryName}" (index ${idx})${fieldLabel}에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
      );

      if (allowed) {
        currentData.lorebook[idx][targetField] = newContent;
        logMcpMutation('replace lorebook field', `lorebook:${idx}`, { entryName, field: targetField, matchCount });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          {
            success: true,
            index: idx,
            comment: entryName,
            field: targetField,
            matchCount,
            oldSize: content.length,
            newSize: newContent.length,
          },
          {
            toolName: 'replace_in_lorebook',
            summary: `Replaced ${matchCount} matches in lorebook entry [${idx}] "${entryName}"`,
            artifacts: { matchCount, oldSize: content.length, newSize: newContent.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'replace lorebook field',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
          target: `lorebook:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/:idx/block-replace — replace multiline block between two anchors
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] && parts[2] === 'block-replace' && req.method === 'POST') {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.lorebook || []).length || !currentData.lorebook[idx]) {
        return mcpError(res, 400, {
          action: 'block replace lorebook',
          message: `Index ${idx} out of range or entry missing`,
          suggestion: 'list_lorebook 또는 GET /lorebook 으로 유효한 index를 다시 확인하세요.',
          target: `lorebook:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `lorebook/${idx}/block-replace`, broadcastStatus);
      if (!body) return;
      if (
        !ensureLorebookExpectedComment(
          res,
          idx,
          currentData.lorebook[idx],
          body.expected_comment,
          'block replace lorebook',
          `lorebook:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      if (!body.start_anchor || !body.end_anchor) {
        return mcpError(res, 400, {
          action: 'block replace lorebook',
          message: 'Missing "start_anchor" or "end_anchor"',
          suggestion: '블록의 시작과 끝을 나타내는 앵커 문자열이 필요합니다.',
          target: `lorebook:${idx}`,
        });
      }
      const targetField: string = body.field || 'content';
      const validFields = ['content', 'comment', 'key', 'secondkey'];
      if (!validFields.includes(targetField)) {
        return mcpError(res, 400, {
          action: 'block replace lorebook',
          message: `"${targetField}" 필드는 지원하지 않습니다. content/comment/key/secondkey만 가능합니다.`,
          target: `lorebook:${idx}`,
        });
      }
      const entry = currentData.lorebook[idx];
      const rawContent: string = (entry[targetField] || '') as string;
      const content = normalizeLF(rawContent);
      const startAnchor = normalizeLF(body.start_anchor);
      const endAnchor = normalizeLF(body.end_anchor);
      const newBlock: string = body.content !== undefined ? normalizeLF(body.content) : '';
      const includeAnchors = body.include_anchors !== false;
      const dryRun = !!(body.dry_run ?? body.dryRun);

      const startPos = content.indexOf(startAnchor);
      if (startPos === -1) {
        return mcpNoOp(res, {
          action: 'block replace lorebook',
          message: `시작 앵커를 찾을 수 없음: ${startAnchor.substring(0, 80)}`,
          suggestion: 'read_lorebook로 현재 내용을 확인해 start_anchor/end_anchor를 다시 지정하세요.',
          target: `lorebook:${idx}`,
        });
      }
      const searchAfter = startPos + startAnchor.length;
      const endPos = content.indexOf(endAnchor, searchAfter);
      if (endPos === -1) {
        return mcpNoOp(
          res,
          {
            action: 'block replace lorebook',
            message: `끝 앵커를 찾을 수 없음 (시작 앵커 이후): ${endAnchor.substring(0, 80)}`,
            suggestion: 'read_lorebook로 현재 내용을 확인해 start_anchor/end_anchor를 다시 지정하세요.',
            target: `lorebook:${idx}`,
          },
          { startAnchorFoundAt: startPos },
        );
      }

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
            index: idx,
            field: targetField,
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
            toolName: 'replace_in_lorebook',
            summary: `Dry-run: block in lorebook #${idx} "${targetField}" (${oldBlock.length}→${newBlock.length} chars)`,
            artifacts: { index: idx, oldBlockSize: oldBlock.length, newBlockSize: newBlock.length },
          },
        );
      }

      const comment = getLorebookEntryLabel(entry, idx);
      const allowed = await deps.askRendererConfirm(
        'MCP 로어북 블록 치환',
        `AI 어시스턴트가 로어북 [${comment}]의 ${targetField}에서 블록 치환하려 합니다.\n시작: ${startAnchor.substring(0, 50)}\n끝: ${endAnchor.substring(0, 50)}\n블록: ${oldBlock.length}→${newBlock.length}자`,
      );
      if (allowed) {
        entry[targetField] = newContent;
        logMcpMutation('block replace lorebook', `lorebook:${idx}`, {
          field: targetField,
          oldBlockSize: oldBlock.length,
          newBlockSize: newBlock.length,
        });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          {
            success: true,
            index: idx,
            field: targetField,
            startAnchorAt: startPos,
            endAnchorAt: endPos,
            includeAnchors,
            oldBlockSize: oldBlock.length,
            newBlockSize: newBlock.length,
            oldSize: content.length,
            newSize: newContent.length,
          },
          {
            toolName: 'replace_block_in_lorebook',
            summary: `Block-replaced in lorebook entry [${idx}]`,
            artifacts: { oldBlockSize: oldBlock.length, newBlockSize: newBlock.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'block replace lorebook',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 블록 치환 요청을 허용한 뒤 다시 시도하세요.',
          target: `lorebook:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/:idx/insert — insert text into lorebook content
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[1] && parts[2] === 'insert' && req.method === 'POST') {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.lorebook || []).length || !currentData.lorebook[idx]) {
        return mcpError(res, 400, {
          action: 'insert lorebook content',
          message: `Index ${idx} out of range or entry missing`,
          suggestion: 'list_lorebook 또는 GET /lorebook 으로 유효한 index를 다시 확인하세요.',
          target: `lorebook:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `lorebook/${idx}/insert`, broadcastStatus);
      if (!body) return;
      if (
        !ensureLorebookExpectedComment(
          res,
          idx,
          currentData.lorebook[idx],
          body.expected_comment,
          'insert lorebook content',
          `lorebook:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      if (body.content === undefined) {
        return mcpError(res, 400, {
          action: 'insert lorebook content',
          message: 'Missing "content"',
          suggestion: '삽입할 content를 요청 본문에 포함하세요.',
          target: `lorebook:${idx}`,
        });
      }
      const entryName: string = getLorebookEntryLabel(currentData.lorebook[idx], idx);
      const oldContent: string = normalizeLF(currentData.lorebook[idx].content || '');
      let newContent: string;
      const position: string = body.position || 'end';
      const insContent = normalizeLF(body.content);

      if (position === 'end') {
        newContent = oldContent + '\n' + insContent;
      } else if (position === 'start') {
        newContent = insContent + '\n' + oldContent;
      } else if ((position === 'after' || position === 'before') && body.anchor) {
        const anchorPos = oldContent.indexOf(normalizeLF(body.anchor));
        if (anchorPos === -1) {
          return mcpNoOp(res, {
            action: 'insert lorebook content',
            message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
            suggestion:
              'read_lorebook로 현재 내용을 확인해 anchor 문자열을 다시 지정하거나 position을 start/end로 변경하세요.',
            target: `lorebook:${idx}`,
          });
        }
        if (position === 'after') {
          const insertAt = anchorPos + normalizeLF(body.anchor).length;
          newContent = oldContent.slice(0, insertAt) + '\n' + insContent + oldContent.slice(insertAt);
        } else {
          newContent = oldContent.slice(0, anchorPos) + insContent + '\n' + oldContent.slice(anchorPos);
        }
      } else {
        return mcpError(res, 400, {
          action: 'insert lorebook content',
          target: `lorebook:${idx}`,
          message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
          suggestion: '{ "position": "after", "anchor": "기준 문자열" } 형식으로 anchor를 포함하세요.',
        });
      }

      const preview = insContent.substring(0, 100) + (insContent.length > 100 ? '...' : '');
      const allowed = await deps.askRendererConfirm(
        'MCP 삽입 요청',
        `AI 어시스턴트가 로어북 항목 "${entryName}" (index ${idx})에 내용을 삽입하려 합니다.\n위치: ${position}${body.anchor ? ' "' + body.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
      );

      if (allowed) {
        currentData.lorebook[idx].content = newContent;
        logMcpMutation('insert lorebook content', `lorebook:${idx}`, {
          entryName,
          position,
          oldSize: oldContent.length,
          newSize: newContent.length,
        });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          {
            success: true,
            index: idx,
            comment: entryName,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
          },
          {
            toolName: 'insert_in_lorebook',
            summary: `Inserted content into lorebook entry [${idx}] "${entryName}"`,
            artifacts: { position, oldSize: oldContent.length, newSize: newContent.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'insert lorebook content',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삽입 요청을 허용한 뒤 다시 시도하세요.',
          target: `lorebook:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lorebook/:idx/delete
    // ----------------------------------------------------------------
    if (parts[0] === 'lorebook' && parts[2] === 'delete' && req.method === 'POST') {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.lorebook || []).length || !currentData.lorebook[idx]) {
        return mcpError(res, 400, {
          action: 'delete lorebook entry',
          message: `Index ${idx} out of range or entry missing`,
          suggestion: 'list_lorebook 또는 GET /lorebook 으로 유효한 index를 다시 확인하세요.',
          target: `lorebook:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `lorebook/${idx}/delete`, broadcastStatus);
      if (!body) return;
      if (
        !ensureLorebookExpectedComment(
          res,
          idx,
          currentData.lorebook[idx],
          body.expected_comment,
          'delete lorebook entry',
          `lorebook:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const entryName: string = getLorebookEntryLabel(currentData.lorebook[idx], idx);

      const allowed = await deps.askRendererConfirm(
        'MCP 삭제 요청',
        `AI 어시스턴트가 로어북 항목 "${entryName}" (index ${idx})을 삭제하려 합니다.`,
      );

      if (allowed) {
        currentData.lorebook.splice(idx, 1);
        logMcpMutation('delete lorebook entry', `lorebook:${idx}`, { entryName });
        deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
        return jsonResSuccess(
          res,
          { success: true, deleted: idx },
          {
            toolName: 'delete_lorebook',
            summary: `Deleted lorebook entry [${idx}] "${entryName}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'delete lorebook entry',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: `lorebook:${idx}`,
        });
      }
    }

    return false;
  }

  return (await dispatch()) !== false;
}
