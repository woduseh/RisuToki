import * as http from 'http';

import {
  REGEX_ALLOWED_FIELDS,
  buildRegexListResponse,
  ensureGreetingExpectedPreview,
  ensureRegexExpectedComment,
  ensureTriggerExpectedComment,
  getFieldMutationBlock,
  getGreetingHash,
  getGreetingPreview,
  getHiddenFieldReadBlock,
  getRegexEntryComment,
  getRegexEntryHash,
  getRegexEntryPreview,
  logMcpMutation,
  normalizeRegexEntryForResponse,
  normalizeRegexType,
  pickAllowedFields,
  readJsonBody,
  resolveUniqueGreetingIdentity,
  resolveUniqueRegexIdentity,
  type McpNoOpInfo,
} from './mcp-api-helpers';
import type { McpApiDeps } from './mcp-api-server';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';
import { getGreetingFieldName } from './reference-shared';
import { normalizeLF } from './shared-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */

type StructuredItemApiDeps = Pick<
  McpApiDeps,
  'askRendererConfirm' | 'broadcastToAll' | 'extractPrimaryLua' | 'stringifyTriggerScripts'
>;

export interface StructuredItemRouteDeps {
  api: StructuredItemApiDeps;
  broadcastStatus: (payload: Record<string, unknown>) => void;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, options: McpSuccessOptions) => void;
  mcpError: (res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown) => void;
  mcpNoOp: (res: http.ServerResponse, info: McpNoOpInfo, extra?: Record<string, unknown>) => void;
}

export async function handleStructuredItemRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  url: URL,
  currentData: Record<string, any>,
  routeDeps: StructuredItemRouteDeps,
): Promise<boolean> {
  const deps = routeDeps.api;
  const { broadcastStatus, jsonResSuccess, mcpError, mcpNoOp } = routeDeps;

  async function dispatch(): Promise<void | false> {
    // ----------------------------------------------------------------
    // GET /regex
    // ----------------------------------------------------------------
    if (parts[0] === 'regex' && !parts[1] && req.method === 'GET') {
      const regexList = buildRegexListResponse((currentData.regex as Record<string, unknown>[]) || []);
      return jsonResSuccess(res, regexList, {
        toolName: 'list_regex',
        summary: `Listed ${regexList.count} regex entries`,
      });
    }

    // ----------------------------------------------------------------
    // POST /regex/by-identity/read|write|delete — safe identity-based regex operations
    // ----------------------------------------------------------------
    if (parts[0] === 'regex' && parts[1] === 'by-identity' && parts[2] && !parts[3] && req.method === 'POST') {
      const actionName = parts[2];
      const body = await readJsonBody(req, res, `regex/by-identity/${actionName}`, broadcastStatus);
      if (!body) return;
      const regexEntries = (currentData.regex as Record<string, unknown>[]) || [];
      const idx = resolveUniqueRegexIdentity(
        res,
        regexEntries,
        body.identity,
        `${actionName} regex by identity`,
        mcpError,
      );
      if (idx === null) return;
      if (actionName === 'read') {
        const entry = normalizeRegexEntryForResponse(regexEntries[idx]);
        return jsonResSuccess(
          res,
          {
            index: idx,
            entry,
            preview: getRegexEntryPreview(regexEntries[idx]),
            hash: getRegexEntryHash(regexEntries[idx]),
          },
          { toolName: 'read_regex_by_identity', summary: `Read regex entry [${idx}] by identity` },
        );
      }
      if (actionName === 'write') {
        if (
          !ensureRegexExpectedComment(
            res,
            idx,
            regexEntries[idx],
            body.expected_comment,
            'write regex by identity',
            `regex:${idx}`,
            mcpError,
          )
        )
          return;
        const data = body.data;
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return mcpError(res, 400, {
            action: 'write regex by identity',
            message: 'data must be an object',
            suggestion: '{ "identity": { ... }, "data": { ... } } 형식으로 전달하세요.',
            target: `regex:${idx}`,
          });
        }
        const entryName = getRegexEntryComment(regexEntries[idx]) || `regex_${idx}`;
        const allowed = await deps.askRendererConfirm(
          'MCP 수정 요청',
          `AI 어시스턴트가 정규식 항목 "${entryName}" (index ${idx})을(를) identity 기준으로 수정하려 합니다.`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'write regex by identity',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
            target: `regex:${idx}`,
          });
        }
        Object.assign(regexEntries[idx], data as Record<string, unknown>);
        logMcpMutation('write regex by identity', `regex:${idx}`, { idx });
        deps.broadcastToAll('data-updated', 'regex', regexEntries);
        return jsonResSuccess(
          res,
          { success: true, index: idx, entry: normalizeRegexEntryForResponse(regexEntries[idx]) },
          { toolName: 'write_regex_by_identity', summary: `Updated regex [${idx}] by identity` },
        );
      }
      if (actionName === 'delete') {
        if (
          !ensureRegexExpectedComment(
            res,
            idx,
            regexEntries[idx],
            body.expected_comment,
            'delete regex by identity',
            `regex:${idx}`,
            mcpError,
          )
        )
          return;
        const entryName = getRegexEntryComment(regexEntries[idx]) || `regex_${idx}`;
        const allowed = await deps.askRendererConfirm(
          'MCP 삭제 요청',
          `AI 어시스턴트가 정규식 항목 "${entryName}" (index ${idx})을(를) identity 기준으로 삭제하려 합니다.`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'delete regex by identity',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
            target: `regex:${idx}`,
          });
        }
        regexEntries.splice(idx, 1);
        logMcpMutation('delete regex by identity', `regex:${idx}`, { idx });
        deps.broadcastToAll('data-updated', 'regex', regexEntries);
        return jsonResSuccess(
          res,
          { success: true, deleted: idx },
          { toolName: 'delete_regex_by_identity', summary: `Deleted regex [${idx}] by identity` },
        );
      }
      return mcpError(res, 400, {
        action: 'regex by identity',
        message: `Unsupported by-identity action: ${actionName}`,
        suggestion: 'read, write, delete 중 하나를 사용하세요.',
        target: 'regex:identity',
      });
    }

    // ----------------------------------------------------------------
    // GET /regex/:idx
    // ----------------------------------------------------------------
    if (parts[0] === 'regex' && parts[1] && req.method === 'GET') {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.regex || []).length) {
        return mcpError(res, 400, {
          action: 'get regex entry',
          message: `Index ${idx} out of range`,
          suggestion: 'GET /regex 로 유효한 index 목록을 확인하세요.',
          target: `regex:${idx}`,
        });
      }
      const entry = normalizeRegexEntryForResponse(currentData.regex[idx]);
      return jsonResSuccess(
        res,
        { index: idx, entry },
        {
          toolName: 'read_regex',
          summary: `Read regex entry [${idx}] "${entry.comment || ''}"`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /regex/batch — batch read multiple regex entries
    // ----------------------------------------------------------------
    if (parts[0] === 'regex' && parts[1] === 'batch' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'regex/batch', broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read regex',
          message: 'indices must be an array of numbers',
          suggestion: 'indices를 숫자 index 배열로 전달하세요. 예: { "indices": [0, 1] }',
          target: 'regex:batch',
        });
      }
      const MAX_BATCH = 50;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read regex',
          message: `Maximum ${MAX_BATCH} indices per batch`,
          suggestion: `요청을 ${MAX_BATCH}개 이하의 index로 나누어 여러 번 호출하세요.`,
          target: 'regex:batch',
        });
      }
      const regexEntries = (currentData.regex as Record<string, unknown>[]) || [];
      const entries = indices.map((idx: number) => {
        if (typeof idx !== 'number' || idx < 0 || idx >= regexEntries.length) return null;
        return { index: idx, entry: normalizeRegexEntryForResponse(regexEntries[idx]) };
      });
      const validCount = entries.filter(Boolean).length;
      return jsonResSuccess(
        res,
        { count: validCount, total: indices.length, entries },
        {
          toolName: 'read_regex_batch',
          summary: `Batch read ${validCount}/${indices.length} regex entries`,
          artifacts: { count: validCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /regex/:idx (modify existing)
    // ----------------------------------------------------------------
    if (
      parts[0] === 'regex' &&
      parts[1] &&
      !['add', 'batch', 'batch-add', 'batch-write'].includes(parts[1]) &&
      !parts[2] &&
      req.method === 'POST'
    ) {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.regex || []).length) {
        return mcpError(res, 400, {
          action: 'update regex entry',
          message: `Index ${idx} out of range`,
          suggestion: 'list_regex 또는 GET /regex 로 유효한 index를 다시 확인하세요.',
          target: `regex:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `regex/${idx}`, broadcastStatus);
      if (!body) return;
      if (
        !ensureRegexExpectedComment(
          res,
          idx,
          currentData.regex[idx],
          body.expected_comment,
          'update regex entry',
          `regex:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const entryName: string = currentData.regex[idx].comment || `regex_${idx}`;

      const allowed = await deps.askRendererConfirm(
        'MCP 수정 요청',
        `AI 어시스턴트가 정규식 항목 "${entryName}" (index ${idx})을 수정하려 합니다.\n현재 에디터에서 수정 중인 내용이 덮어씌워질 수 있습니다.`,
      );

      if (allowed) {
        Object.assign(currentData.regex[idx], pickAllowedFields(body, REGEX_ALLOWED_FIELDS));
        const entry = currentData.regex[idx];
        if (body.find !== undefined && body.in === undefined) entry.in = body.find;
        if (body.in !== undefined && body.find === undefined) entry.find = body.in;
        if (body.replace !== undefined && body.out === undefined) entry.out = body.replace;
        if (body.out !== undefined && body.replace === undefined) entry.replace = body.out;
        normalizeRegexType(entry);
        logMcpMutation('update regex entry', `regex:${idx}`, { entryName, updatedKeys: Object.keys(body) });
        deps.broadcastToAll('data-updated', 'regex', currentData.regex);
        return jsonResSuccess(
          res,
          { success: true, index: idx },
          {
            toolName: 'write_regex',
            summary: `Updated regex entry [${idx}] "${entryName}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'update regex entry',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 변경 요청을 허용한 뒤 다시 시도하세요.',
          target: `regex:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /regex/add
    // ----------------------------------------------------------------
    if (parts[0] === 'regex' && parts[1] === 'add' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'regex/add', broadcastStatus);
      if (!body) return;
      const name = body.comment || '새 정규식';

      const allowed = await deps.askRendererConfirm(
        'MCP 추가 요청',
        `AI 어시스턴트가 새 정규식 항목 "${name}"을(를) 추가하려 합니다.`,
      );

      if (allowed) {
        const defaults: Record<string, unknown> = {
          comment: '',
          type: 'editoutput',
          find: '',
          replace: '',
          flag: 'g',
        };
        const entry: Record<string, unknown> = Object.assign(defaults, pickAllowedFields(body, REGEX_ALLOWED_FIELDS));
        if (entry.find && !entry.in) entry.in = entry.find;
        if (entry.in && !entry.find) entry.find = entry.in;
        if (entry.replace && !entry.out) entry.out = entry.replace;
        if (entry.out && !entry.replace) entry.replace = entry.out;
        normalizeRegexType(entry);
        if (!currentData.regex) currentData.regex = [];
        currentData.regex.push(entry);
        logMcpMutation('add regex entry', 'regex:add', { entryName: name, newIndex: currentData.regex.length - 1 });
        deps.broadcastToAll('data-updated', 'regex', currentData.regex);
        const addedRegexIdx = currentData.regex.length - 1;
        return jsonResSuccess(
          res,
          { success: true, index: addedRegexIdx },
          {
            toolName: 'add_regex',
            summary: `Added regex entry [${addedRegexIdx}] "${name}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'add regex entry',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
          target: 'regex:add',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /regex/batch-add — batch add regex entries
    // ----------------------------------------------------------------
    if (parts[0] === 'regex' && parts[1] === 'batch-add' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'regex/batch-add', broadcastStatus);
      if (!body) return;
      const entries: Record<string, unknown>[] = body.entries;
      if (!Array.isArray(entries) || entries.length === 0) {
        return mcpError(res, 400, {
          action: 'batch add regex entries',
          message: 'entries must be a non-empty array',
          suggestion: '{ "entries": [ { "find": "...", "replace": "..." } ] } 형식으로 전송하세요.',
          target: 'regex:batch-add',
        });
      }
      const MAX_BATCH = 50;
      if (entries.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch add regex entries',
          message: `Maximum ${MAX_BATCH} entries per batch`,
          suggestion: `항목을 ${MAX_BATCH}개 이하로 나누어 전송하세요.`,
          target: 'regex:batch-add',
        });
      }

      const names = entries.map((e, i) => (typeof e.comment === 'string' ? e.comment : `regex_${i}`));
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 추가 요청',
        `AI 어시스턴트가 정규식 항목 ${entries.length}개를 추가하려 합니다:\n${names.map((n, i) => `  ${i + 1}. ${n}`).join('\n')}`,
      );

      if (allowed) {
        if (!currentData.regex) currentData.regex = [];
        const results: Array<{ index: number; comment: string }> = [];
        for (const e of entries) {
          const defaults: Record<string, unknown> = {
            comment: '',
            type: 'editoutput',
            find: '',
            replace: '',
            flag: 'g',
          };
          const entry = Object.assign(defaults, pickAllowedFields(e, REGEX_ALLOWED_FIELDS));
          if (entry.find && !entry.in) entry.in = entry.find;
          if (entry.in && !entry.find) entry.find = entry.in;
          if (entry.replace && !entry.out) entry.out = entry.replace;
          if (entry.out && !entry.replace) entry.replace = entry.out;
          normalizeRegexType(entry);
          currentData.regex.push(entry);
          results.push({ index: currentData.regex.length - 1, comment: String(entry.comment || '') });
        }
        logMcpMutation('batch add regex entries', 'regex:batch-add', { count: results.length });
        deps.broadcastToAll('data-updated', 'regex', currentData.regex);
        return jsonResSuccess(
          res,
          { success: true, added: results.length, entries: results },
          {
            toolName: 'add_regex_batch',
            summary: `Batch added ${results.length} regex entries`,
            artifacts: { added: results.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'batch add regex entries',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
          target: 'regex:batch-add',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /regex/batch-write — batch modify regex entries
    // ----------------------------------------------------------------
    if (parts[0] === 'regex' && parts[1] === 'batch-write' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'regex/batch-write', broadcastStatus);
      if (!body) return;
      const batchEntries: Array<{ index: number; data: Record<string, unknown> }> = body.entries;
      if (!Array.isArray(batchEntries) || batchEntries.length === 0) {
        return mcpError(res, 400, {
          action: 'batch write regex entries',
          message: 'entries must be a non-empty array of {index, data}',
          suggestion: '{ "entries": [ { "index": 0, "data": { ... } } ] } 형식으로 전송하세요.',
          target: 'regex:batch-write',
        });
      }
      const MAX_BATCH = 50;
      if (batchEntries.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch write regex entries',
          message: `Maximum ${MAX_BATCH} entries per batch`,
          suggestion: `항목을 ${MAX_BATCH}개 이하로 나누어 전송하세요.`,
          target: 'regex:batch-write',
        });
      }
      const regexArr = currentData.regex || [];
      for (const e of batchEntries) {
        const idx = Number(e.index);
        if (isNaN(idx) || idx < 0 || idx >= regexArr.length) {
          return mcpError(res, 400, {
            action: 'batch write regex entries',
            message: `Index ${e.index} out of range (0-${regexArr.length - 1})`,
            suggestion: 'GET /regex 로 유효한 index 목록을 확인하세요.',
            target: `regex:batch-write`,
          });
        }
        if (
          !ensureRegexExpectedComment(
            res,
            idx,
            regexArr[idx],
            (e as { expected_comment?: unknown }).expected_comment,
            'batch write regex entries',
            'regex:batch-write',
            mcpError,
          )
        ) {
          return;
        }
      }

      const summaryLines = batchEntries.map((e) => {
        const name = regexArr[e.index]?.comment || `regex_${e.index}`;
        return `  [${e.index}] ${name}: ${Object.keys(e.data || {}).join(', ')}`;
      });
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 수정 요청',
        `AI 어시스턴트가 정규식 항목 ${batchEntries.length}개를 수정하려 합니다:\n${summaryLines.join('\n')}`,
      );

      if (allowed) {
        const results: Array<{ index: number; comment: string; updatedKeys: string[] }> = [];
        for (const e of batchEntries) {
          const idx = Number(e.index);
          Object.assign(regexArr[idx], pickAllowedFields(e.data, REGEX_ALLOWED_FIELDS));
          const entry = regexArr[idx];
          if (e.data.find !== undefined && e.data.in === undefined) entry.in = e.data.find;
          if (e.data.in !== undefined && e.data.find === undefined) entry.find = e.data.in;
          if (e.data.replace !== undefined && e.data.out === undefined) entry.out = e.data.replace;
          if (e.data.out !== undefined && e.data.replace === undefined) entry.replace = e.data.out;
          normalizeRegexType(entry);
          results.push({ index: idx, comment: String(entry.comment || ''), updatedKeys: Object.keys(e.data || {}) });
        }
        logMcpMutation('batch write regex entries', 'regex:batch-write', { count: results.length });
        deps.broadcastToAll('data-updated', 'regex', currentData.regex);
        return jsonResSuccess(
          res,
          { success: true, modified: results.length, entries: results, results },
          {
            toolName: 'write_regex_batch',
            summary: `Batch modified ${results.length} regex entries`,
            artifacts: { modified: results.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'batch write regex entries',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: 'regex:batch-write',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /regex/:idx/replace — replace text in regex entry field
    // ----------------------------------------------------------------
    if (parts[0] === 'regex' && parts[1] && parts[2] === 'replace' && !parts[3] && req.method === 'POST') {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.regex || []).length) {
        return mcpError(res, 400, {
          action: 'replace regex field',
          message: `Index ${idx} out of range`,
          suggestion: 'list_regex 또는 GET /regex 로 유효한 index를 다시 확인하세요.',
          target: `regex:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `regex/${idx}/replace`, broadcastStatus);
      if (!body) return;
      if (
        !ensureRegexExpectedComment(
          res,
          idx,
          currentData.regex[idx],
          body.expected_comment,
          'replace regex field',
          `regex:${idx}:replace`,
          mcpError,
        )
      ) {
        return;
      }
      const targetField: string = body.field;
      if (targetField !== 'find' && targetField !== 'replace') {
        return mcpError(res, 400, {
          action: 'replace regex field',
          message: 'field must be "find" or "replace"',
          suggestion: '"field" 값은 "find" 또는 "replace"만 허용됩니다.',
          target: `regex:${idx}:replace`,
        });
      }
      if (!body.find) {
        return mcpError(res, 400, {
          action: 'replace regex field',
          message: 'Missing "find" (search string)',
          suggestion: '"find" 필드에 검색할 문자열을 지정하세요.',
          target: `regex:${idx}:replace`,
        });
      }
      const entry = currentData.regex[idx];
      const entryName: string = entry.comment || `regex_${idx}`;
      const content: string = normalizeLF(
        (targetField === 'find' ? entry.find || entry.in : entry.replace || entry.out) || '',
      );
      const findStr: string = normalizeLF(body.find);
      const replaceStr: string = normalizeLF(body.replace !== undefined ? body.replace : '');
      const useRegex = !!body.regex;
      const flags: string = body.flags || 'g';

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
            action: 'replace regex field',
            message: '일치하는 항목 없음',
            suggestion: 'read_regex로 현재 필드를 확인하고 find/regex/flags를 조정하세요.',
            target: `regex:${idx}:replace`,
          },
          { matchCount: 0 },
        );
      }

      const allowed = await deps.askRendererConfirm(
        'MCP 치환 요청',
        `AI 어시스턴트가 정규식 항목 "${entryName}" (index ${idx})의 ${targetField} 필드에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
      );

      if (allowed) {
        if (targetField === 'find') {
          entry.find = newContent;
          entry.in = newContent;
        } else {
          entry.replace = newContent;
          entry.out = newContent;
        }
        logMcpMutation('replace regex field', `regex:${idx}`, { entryName, field: targetField, matchCount });
        deps.broadcastToAll('data-updated', 'regex', currentData.regex);
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
            toolName: 'replace_in_regex',
            summary: `Replaced ${matchCount} matches in regex entry [${idx}] "${entryName}"`,
            artifacts: { matchCount, oldSize: content.length, newSize: newContent.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'replace regex field',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
          target: `regex:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /regex/:idx/insert — insert text into regex entry field
    // ----------------------------------------------------------------
    if (parts[0] === 'regex' && parts[1] && parts[2] === 'insert' && !parts[3] && req.method === 'POST') {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.regex || []).length) {
        return mcpError(res, 400, {
          action: 'insert regex field',
          message: `Index ${idx} out of range`,
          suggestion: 'list_regex 또는 GET /regex 로 유효한 index를 다시 확인하세요.',
          target: `regex:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `regex/${idx}/insert`, broadcastStatus);
      if (!body) return;
      if (
        !ensureRegexExpectedComment(
          res,
          idx,
          currentData.regex[idx],
          body.expected_comment,
          'insert regex field',
          `regex:${idx}:insert`,
          mcpError,
        )
      ) {
        return;
      }
      const targetField: string = body.field;
      if (targetField !== 'find' && targetField !== 'replace') {
        return mcpError(res, 400, {
          action: 'insert regex field',
          message: 'field must be "find" or "replace"',
          suggestion: '"field" 값은 "find" 또는 "replace"만 허용됩니다.',
          target: `regex:${idx}:insert`,
        });
      }
      if (body.content === undefined) {
        return mcpError(res, 400, {
          action: 'insert regex field',
          message: 'Missing "content"',
          suggestion: '"content" 필드에 삽입할 내용을 지정하세요.',
          target: `regex:${idx}:insert`,
        });
      }
      const entry = currentData.regex[idx];
      const entryName: string = entry.comment || `regex_${idx}`;
      const oldContent: string = normalizeLF(
        (targetField === 'find' ? entry.find || entry.in : entry.replace || entry.out) || '',
      );
      let newContent: string;
      const position: string = body.position || 'end';
      const insContent = normalizeLF(body.content);

      if (position === 'end') {
        newContent = oldContent + insContent;
      } else if (position === 'start') {
        newContent = insContent + oldContent;
      } else if ((position === 'after' || position === 'before') && body.anchor) {
        const anchorNorm = normalizeLF(body.anchor);
        const anchorPos = oldContent.indexOf(anchorNorm);
        if (anchorPos === -1) {
          return mcpNoOp(res, {
            action: 'insert regex field',
            message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
            suggestion:
              'read_regex로 현재 필드를 확인해 anchor 문자열을 다시 지정하거나 position을 start/end로 변경하세요.',
            target: `regex:${idx}:insert`,
          });
        }
        if (position === 'after') {
          const insertAt = anchorPos + anchorNorm.length;
          newContent = oldContent.slice(0, insertAt) + insContent + oldContent.slice(insertAt);
        } else {
          newContent = oldContent.slice(0, anchorPos) + insContent + oldContent.slice(anchorPos);
        }
      } else {
        return mcpError(res, 400, {
          action: 'insert regex field',
          message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
          suggestion: '"anchor" 필드에 기준 문자열을 지정하세요.',
          target: `regex:${idx}:insert`,
        });
      }

      const preview = insContent.substring(0, 100) + (insContent.length > 100 ? '...' : '');
      const allowed = await deps.askRendererConfirm(
        'MCP 삽입 요청',
        `AI 어시스턴트가 정규식 항목 "${entryName}" (index ${idx})의 ${targetField} 필드에 내용을 삽입하려 합니다.\n위치: ${position}${body.anchor ? ' "' + body.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
      );

      if (allowed) {
        if (targetField === 'find') {
          entry.find = newContent;
          entry.in = newContent;
        } else {
          entry.replace = newContent;
          entry.out = newContent;
        }
        logMcpMutation('insert regex field', `regex:${idx}`, {
          entryName,
          field: targetField,
          position,
          oldSize: oldContent.length,
          newSize: newContent.length,
        });
        deps.broadcastToAll('data-updated', 'regex', currentData.regex);
        return jsonResSuccess(
          res,
          {
            success: true,
            index: idx,
            comment: entryName,
            field: targetField,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
          },
          {
            toolName: 'insert_in_regex',
            summary: `Inserted content into regex entry [${idx}] "${entryName}"`,
            artifacts: { position, oldSize: oldContent.length, newSize: newContent.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'insert regex field',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삽입 요청을 허용한 뒤 다시 시도하세요.',
          target: `regex:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /regex/:idx/delete
    // ----------------------------------------------------------------
    if (parts[0] === 'regex' && parts[2] === 'delete' && req.method === 'POST') {
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= (currentData.regex || []).length) {
        return mcpError(res, 400, {
          action: 'delete regex entry',
          message: `Index ${idx} out of range`,
          suggestion: 'list_regex 또는 GET /regex 로 유효한 index를 다시 확인하세요.',
          target: `regex:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `regex/${idx}/delete`, broadcastStatus);
      if (!body) return;
      if (
        !ensureRegexExpectedComment(
          res,
          idx,
          currentData.regex[idx],
          body.expected_comment,
          'delete regex entry',
          `regex:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const entryName: string = currentData.regex[idx].comment || `regex_${idx}`;

      const allowed = await deps.askRendererConfirm(
        'MCP 삭제 요청',
        `AI 어시스턴트가 정규식 항목 "${entryName}" (index ${idx})을 삭제하려 합니다.`,
      );

      if (allowed) {
        currentData.regex.splice(idx, 1);
        logMcpMutation('delete regex entry', `regex:${idx}`, { entryName });
        deps.broadcastToAll('data-updated', 'regex', currentData.regex);
        return jsonResSuccess(
          res,
          { success: true, deleted: idx },
          {
            toolName: 'delete_regex',
            summary: `Deleted regex entry [${idx}] "${entryName}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'delete regex entry',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: `regex:${idx}`,
        });
      }
    }

    // ================================================================
    // GREETINGS
    // ================================================================

    // ----------------------------------------------------------------
    // GET /greetings/:type — list greetings with index, size, preview
    // ----------------------------------------------------------------
    if (parts[0] === 'greetings' && parts[1] && !parts[2] && req.method === 'GET') {
      const greetingType = parts[1]; // "alternate" | "group"
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'list greetings',
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          target: `greetings:${greetingType}`,
        });
      }
      const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'list greetings',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `greetings:${greetingType}`,
        });
      }
      const arr: string[] = currentData[fieldName] || [];
      let items = arr.map((g: string, i: number) => {
        const entry: Record<string, unknown> = {
          index: i,
          contentSize: g.length,
          preview: g.slice(0, 100) + (g.length > 100 ? '…' : ''),
          hash: getGreetingHash(g),
        };
        return entry;
      });
      // Filter by keyword in preview/content
      const filterParam = url.searchParams.get('filter');
      if (filterParam) {
        const q = filterParam.toLowerCase();
        items = items.filter((_e: any) => {
          const content = (arr[_e.index] || '').toLowerCase();
          return content.includes(q);
        });
      }
      // Filter by content keyword with match context
      const contentFilterParam = url.searchParams.get('content_filter');
      if (contentFilterParam) {
        const cq = contentFilterParam.toLowerCase();
        items = items.filter((_e: any) => {
          const content = (arr[_e.index] || '').toLowerCase();
          return content.includes(cq);
        });
        items = items.map((e: any) => {
          const content = (arr[e.index] || '').toLowerCase();
          const matchPos = content.indexOf(cq);
          if (matchPos >= 0) {
            const rawContent = arr[e.index] || '';
            const start = Math.max(0, matchPos - 50);
            const end = Math.min(rawContent.length, matchPos + cq.length + 50);
            e.contentMatch =
              (start > 0 ? '…' : '') + rawContent.slice(start, end) + (end < rawContent.length ? '…' : '');
          }
          return e;
        });
      }
      return jsonResSuccess(
        res,
        { type: greetingType, field: fieldName, count: items.length, total: arr.length, items },
        {
          toolName: 'list_greetings',
          summary: `Listed ${items.length} ${greetingType} greetings`,
          artifacts: { count: items.length, total: arr.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /greeting/:type/by-hash/read|write|delete — identity-based greeting operations
    // ----------------------------------------------------------------
    if (
      parts[0] === 'greeting' &&
      parts[1] &&
      parts[2] === 'by-hash' &&
      parts[3] &&
      !parts[4] &&
      req.method === 'POST'
    ) {
      const greetingType = parts[1];
      const actionName = parts[3];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: `${actionName} greeting by hash`,
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          target: `greeting:${greetingType}`,
        });
      }
      const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: `${actionName} greeting by hash`,
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `greeting:${greetingType}`,
        });
      }
      if (greetingType === 'group' && (actionName === 'write' || actionName === 'delete')) {
        return mcpError(res, 400, {
          action: `${actionName} greeting by hash`,
          message: 'groupOnlyGreetings is read-only',
          suggestion: 'alternate 인사말 또는 지원되는 현재 필드를 사용하세요.',
          target: `greeting:${greetingType}`,
        });
      }
      const body = await readJsonBody(req, res, `greeting/${greetingType}/by-hash/${actionName}`, broadcastStatus);
      if (!body) return;
      const arr: string[] = currentData[fieldName] || [];
      const idx = resolveUniqueGreetingIdentity(
        res,
        arr,
        body.identity,
        `${actionName} greeting by hash`,
        `greeting:${greetingType}`,
        mcpError,
      );
      if (idx === null) return;
      if (actionName === 'read') {
        return jsonResSuccess(
          res,
          {
            type: greetingType,
            index: idx,
            content: arr[idx],
            preview: getGreetingPreview(arr[idx] || ''),
            hash: getGreetingHash(arr[idx] || ''),
          },
          { toolName: 'read_greeting_by_hash', summary: `Read ${greetingType} greeting [${idx}] by identity` },
        );
      }
      if (actionName === 'write') {
        if (
          !ensureGreetingExpectedPreview(
            res,
            idx,
            arr[idx],
            body.expected_preview,
            'write greeting by hash',
            `greeting:${greetingType}:${idx}`,
            mcpError,
          )
        )
          return;
        if (typeof body.content !== 'string') {
          return mcpError(res, 400, {
            action: 'write greeting by hash',
            message: 'content must be a string',
            suggestion: '{ "identity": { "hash": "..." }, "content": "..." } 형식으로 전달하세요.',
            target: `greeting:${greetingType}:${idx}`,
          });
        }
        const preview = body.content.slice(0, 60) + (body.content.length > 60 ? '…' : '');
        const allowed = await deps.askRendererConfirm(
          'MCP 수정 요청',
          `AI 어시스턴트가 ${greetingType} 인사말 #${idx}을(를) identity 기준으로 수정하려 합니다: "${preview}"`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'write greeting by hash',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
            target: `greeting:${greetingType}:${idx}`,
          });
        }
        arr[idx] = body.content;
        currentData[fieldName] = arr;
        logMcpMutation('write greeting by hash', `greeting:${greetingType}:${idx}`, { idx });
        deps.broadcastToAll('data-updated', fieldName, arr);
        return jsonResSuccess(
          res,
          { success: true, type: greetingType, index: idx, preview: getGreetingPreview(arr[idx]) },
          { toolName: 'write_greeting_by_hash', summary: `Updated ${greetingType} greeting [${idx}] by identity` },
        );
      }
      if (actionName === 'delete') {
        if (
          !ensureGreetingExpectedPreview(
            res,
            idx,
            arr[idx],
            body.expected_preview,
            'delete greeting by hash',
            `greeting:${greetingType}:${idx}`,
            mcpError,
          )
        )
          return;
        const allowed = await deps.askRendererConfirm(
          'MCP 삭제 요청',
          `AI 어시스턴트가 ${greetingType} 인사말 #${idx}을(를) identity 기준으로 삭제하려 합니다.`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'delete greeting by hash',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
            target: `greeting:${greetingType}:${idx}`,
          });
        }
        arr.splice(idx, 1);
        currentData[fieldName] = arr;
        logMcpMutation('delete greeting by hash', `greeting:${greetingType}:${idx}`, { idx });
        deps.broadcastToAll('data-updated', fieldName, arr);
        return jsonResSuccess(
          res,
          { success: true, type: greetingType, deleted: idx },
          { toolName: 'delete_greeting_by_hash', summary: `Deleted ${greetingType} greeting [${idx}] by identity` },
        );
      }
      return mcpError(res, 400, {
        action: 'greeting by hash',
        message: `Unsupported by-hash action: ${actionName}`,
        suggestion: 'read, write, delete 중 하나를 사용하세요.',
        target: `greeting:${greetingType}`,
      });
    }

    // ----------------------------------------------------------------
    // GET /greeting/:type/:idx — read single greeting
    // ----------------------------------------------------------------
    if (parts[0] === 'greeting' && parts[1] && parts[2] && !parts[3] && req.method === 'GET') {
      const greetingType = parts[1];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'read greeting',
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          target: `greeting:${greetingType}`,
        });
      }
      const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'read greeting',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `greeting:${greetingType}`,
        });
      }
      const arr: string[] = currentData[fieldName] || [];
      const idx = parseInt(parts[2], 10);
      if (isNaN(idx) || idx < 0 || idx >= arr.length) {
        return mcpError(res, 400, {
          action: 'read greeting',
          message: `Index ${parts[2]} out of range (0..${arr.length - 1})`,
          suggestion: `list_greetings로 유효한 index를 확인하세요.`,
          target: `greeting:${greetingType}:${parts[2]}`,
        });
      }
      return jsonResSuccess(
        res,
        { type: greetingType, index: idx, content: arr[idx] },
        {
          toolName: 'read_greeting',
          summary: `Read ${greetingType} greeting [${idx}]`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /greeting/:type/batch — batch read multiple greetings
    // ----------------------------------------------------------------
    if (parts[0] === 'greeting' && parts[1] && parts[2] === 'batch' && !parts[3] && req.method === 'POST') {
      const greetingType = parts[1];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'batch read greetings',
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          target: `greeting:${greetingType}:batch`,
        });
      }
      const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
      if (hiddenBlock) {
        return mcpError(res, 400, {
          action: 'batch read greetings',
          message: hiddenBlock.message,
          suggestion: hiddenBlock.suggestion,
          target: `greeting:${greetingType}:batch`,
        });
      }
      const body = await readJsonBody(req, res, `greeting/${greetingType}/batch`, broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read greetings',
          message: 'indices must be an array of numbers',
          suggestion: '{ "indices": [0, 1] } 형식으로 전송하세요.',
          target: `greeting:${greetingType}:batch`,
        });
      }
      const MAX_BATCH = 50;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read greetings',
          message: `Maximum ${MAX_BATCH} indices per batch`,
          suggestion: `인덱스를 ${MAX_BATCH}개 이하로 나누어 전송하세요.`,
          target: `greeting:${greetingType}:batch`,
        });
      }
      const arr: string[] = currentData[fieldName] || [];
      const items = indices.map((idx: number) => {
        if (typeof idx !== 'number' || idx < 0 || idx >= arr.length) return null;
        return { index: idx, content: arr[idx] };
      });
      const validCount = items.filter(Boolean).length;
      return jsonResSuccess(
        res,
        { type: greetingType, field: fieldName, count: validCount, total: indices.length, items },
        {
          toolName: 'read_greeting_batch',
          summary: `Batch read ${validCount}/${indices.length} ${greetingType} greetings`,
          artifacts: { count: validCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /greeting/:type/add — add greeting
    // ----------------------------------------------------------------
    if (parts[0] === 'greeting' && parts[1] && parts[2] === 'add' && req.method === 'POST') {
      const greetingType = parts[1];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'add greeting',
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          target: `greeting:${greetingType}:add`,
        });
      }
      const mutationBlock = getFieldMutationBlock(currentData, fieldName);
      if (mutationBlock) {
        return mcpError(res, 400, {
          action: 'add greeting',
          message: mutationBlock.message,
          suggestion: mutationBlock.suggestion,
          target: `greeting:${greetingType}:add`,
        });
      }
      const body = await readJsonBody(req, res, `greeting/${greetingType}/add`, broadcastStatus);
      if (!body) return;
      if (typeof body.content !== 'string') {
        return mcpError(res, 400, {
          action: 'add greeting',
          message: 'content 필드(string)가 필요합니다.',
          suggestion: '{ "content": "인사말 텍스트" } 형식으로 전달하세요.',
          target: `greeting:${greetingType}:add`,
        });
      }
      const preview = body.content.slice(0, 60) + (body.content.length > 60 ? '…' : '');
      const label = greetingType === 'alternate' ? '추가 첫 메시지' : '그룹 전용 인사말';

      const allowed = await deps.askRendererConfirm(
        'MCP 추가 요청',
        `AI 어시스턴트가 새 ${label}을(를) 추가하려 합니다: "${preview}"`,
      );

      if (allowed) {
        if (!currentData[fieldName]) currentData[fieldName] = [];
        currentData[fieldName].push(body.content);
        const newIdx = currentData[fieldName].length - 1;
        logMcpMutation('add greeting', `greeting:${greetingType}:add`, { newIndex: newIdx });
        deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
        return jsonResSuccess(
          res,
          { success: true, type: greetingType, index: newIdx },
          {
            toolName: 'write_greeting',
            summary: `Added ${greetingType} greeting [${newIdx}]`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'add greeting',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
          target: `greeting:${greetingType}:add`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /greeting/:type/batch-write — batch modify multiple greetings
    // ----------------------------------------------------------------
    if (parts[0] === 'greeting' && parts[1] && parts[2] === 'batch-write' && req.method === 'POST') {
      const greetingType = parts[1];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'batch write greetings',
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          target: `greeting:${greetingType}:batch-write`,
        });
      }
      const mutationBlock = getFieldMutationBlock(currentData, fieldName);
      if (mutationBlock) {
        return mcpError(res, 400, {
          action: 'batch write greetings',
          message: mutationBlock.message,
          suggestion: mutationBlock.suggestion,
          target: `greeting:${greetingType}:batch-write`,
        });
      }
      const body = await readJsonBody(req, res, `greeting/${greetingType}/batch-write`, broadcastStatus);
      if (!body) return;
      const writes: Array<{ index: number; content: string; expected_preview?: unknown }> = body.writes;
      if (!Array.isArray(writes) || writes.length === 0) {
        return mcpError(res, 400, {
          action: 'batch write greetings',
          message: 'writes must be a non-empty array of {index, content}',
          suggestion: '{ "writes": [ { "index": 0, "content": "..." } ] } 형식으로 전송하세요.',
          target: `greeting:${greetingType}:batch-write`,
        });
      }
      const MAX_BATCH = 50;
      if (writes.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch write greetings',
          message: `Maximum ${MAX_BATCH} writes per batch`,
          suggestion: `항목을 ${MAX_BATCH}개 이하로 나누어 전송하세요.`,
          target: `greeting:${greetingType}:batch-write`,
        });
      }
      const arr: string[] = currentData[fieldName] || [];
      const invalid = writes.filter((w) => typeof w.index !== 'number' || w.index < 0 || w.index >= arr.length);
      if (invalid.length > 0) {
        return mcpError(res, 400, {
          action: 'batch write greetings',
          message: `Invalid indices: ${invalid.map((w) => w.index).join(', ')}`,
          suggestion: `유효한 index 범위는 0-${arr.length - 1}입니다.`,
          target: `greeting:${greetingType}:batch-write`,
        });
      }
      for (const write of writes) {
        if (
          !ensureGreetingExpectedPreview(
            res,
            write.index,
            arr[write.index],
            write.expected_preview,
            'batch write greetings',
            `greeting:${greetingType}:batch-write`,
            mcpError,
          )
        ) {
          return;
        }
      }
      const summary = writes
        .map((w) => `  [${w.index}]: ${w.content.substring(0, 60)}${w.content.length > 60 ? '...' : ''}`)
        .join('\n');
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 수정 요청',
        `AI 어시스턴트가 ${greetingType} 인사말 ${writes.length}개를 일괄 수정하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
      );
      if (allowed) {
        const results = writes.map((write) => ({ index: write.index, preview: getGreetingPreview(write.content) }));
        for (const w of writes) {
          arr[w.index] = w.content;
        }
        currentData[fieldName] = arr;
        logMcpMutation('batch write greetings', `greeting:${greetingType}:batch-write`, { count: writes.length });
        deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
        return jsonResSuccess(
          res,
          { success: true, type: greetingType, count: writes.length, results },
          {
            toolName: 'batch_write_greeting',
            summary: `Batch updated ${writes.length} ${greetingType} greetings`,
            artifacts: { count: writes.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'batch write greetings',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 일괄 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: `greeting:${greetingType}:batch-write`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /greeting/:type/reorder — reorder greetings
    // ----------------------------------------------------------------
    if (parts[0] === 'greeting' && parts[1] && parts[2] === 'reorder' && req.method === 'POST') {
      const greetingType = parts[1];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'reorder greetings',
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          target: `greeting:${greetingType}:reorder`,
        });
      }
      const mutationBlock = getFieldMutationBlock(currentData, fieldName);
      if (mutationBlock) {
        return mcpError(res, 400, {
          action: 'reorder greetings',
          message: mutationBlock.message,
          suggestion: mutationBlock.suggestion,
          target: `greeting:${greetingType}:reorder`,
        });
      }
      const body = await readJsonBody(req, res, `greeting/${greetingType}/reorder`, broadcastStatus);
      if (!body) return;
      const newOrder: number[] = body.order;
      const arr: string[] = currentData[fieldName] || [];
      if (!Array.isArray(newOrder) || newOrder.length !== arr.length) {
        return mcpError(res, 400, {
          action: 'reorder greetings',
          message: `order must be an array of length ${arr.length} (current count)`,
          suggestion: `"order"는 길이 ${arr.length}인 배열이어야 합니다.`,
          target: `greeting:${greetingType}:reorder`,
        });
      }
      // Validate: must be a permutation of 0..n-1
      const sorted = [...newOrder].sort((a, b) => a - b);
      const expected = Array.from({ length: arr.length }, (_, i) => i);
      if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
        return mcpError(res, 400, {
          action: 'reorder greetings',
          message: 'order must be a permutation of [0, 1, ..., n-1]',
          suggestion: '"order" 배열은 0부터 n-1까지의 순열이어야 합니다.',
          target: `greeting:${greetingType}:reorder`,
        });
      }
      const preview = newOrder.slice(0, 10).join(', ') + (newOrder.length > 10 ? '...' : '');
      const allowed = await deps.askRendererConfirm(
        'MCP 순서 변경 요청',
        `AI 어시스턴트가 ${greetingType} 인사말 ${arr.length}개의 순서를 변경하려 합니다.\n새 순서: [${preview}]`,
      );
      if (allowed) {
        const reordered = newOrder.map((i) => arr[i]);
        currentData[fieldName] = reordered;
        logMcpMutation('reorder greetings', `greeting:${greetingType}:reorder`, { count: arr.length });
        deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
        return jsonResSuccess(
          res,
          { success: true, type: greetingType, count: reordered.length },
          {
            toolName: 'batch_write_greeting',
            summary: `Reordered ${reordered.length} ${greetingType} greetings`,
            artifacts: { count: reordered.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'reorder greetings',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 순서 변경 요청을 허용한 뒤 다시 시도하세요.',
          target: `greeting:${greetingType}:reorder`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /greeting/:type/:idx — write single greeting
    // ----------------------------------------------------------------
    const greetingReservedPaths = ['add', 'batch', 'batch-write', 'batch-delete', 'reorder'];
    if (
      parts[0] === 'greeting' &&
      parts[1] &&
      parts[2] &&
      !greetingReservedPaths.includes(parts[2]) &&
      parts[3] !== 'delete' &&
      req.method === 'POST'
    ) {
      const greetingType = parts[1];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'write greeting',
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          target: `greeting:${greetingType}`,
        });
      }
      const mutationBlock = getFieldMutationBlock(currentData, fieldName);
      if (mutationBlock) {
        return mcpError(res, 400, {
          action: 'write greeting',
          message: mutationBlock.message,
          suggestion: mutationBlock.suggestion,
          target: `greeting:${greetingType}`,
        });
      }
      const arr: string[] = currentData[fieldName] || [];
      const idx = parseInt(parts[2], 10);
      if (isNaN(idx) || idx < 0 || idx >= arr.length) {
        return mcpError(res, 400, {
          action: 'write greeting',
          message: `Index ${parts[2]} out of range (0..${arr.length - 1})`,
          suggestion: `list_greetings로 유효한 index를 확인하세요.`,
          target: `greeting:${greetingType}:${parts[2]}`,
        });
      }
      const body = await readJsonBody(req, res, `greeting/${greetingType}/${idx}`, broadcastStatus);
      if (!body) return;
      if (typeof body.content !== 'string') {
        return mcpError(res, 400, {
          action: 'write greeting',
          message: 'content 필드(string)가 필요합니다.',
          suggestion: '{ "content": "수정할 인사말 텍스트" } 형식으로 전달하세요.',
          target: `greeting:${greetingType}:${idx}`,
        });
      }
      if (
        !ensureGreetingExpectedPreview(
          res,
          idx,
          arr[idx],
          body.expected_preview,
          'write greeting',
          `greeting:${greetingType}:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const label = greetingType === 'alternate' ? '추가 첫 메시지' : '그룹 전용 인사말';

      const allowed = await deps.askRendererConfirm(
        'MCP 수정 요청',
        `AI 어시스턴트가 ${label} #${idx}을(를) 수정하려 합니다.`,
      );

      if (allowed) {
        currentData[fieldName][idx] = body.content;
        logMcpMutation('update greeting', `greeting:${greetingType}:${idx}`, {
          oldSize: arr[idx]?.length ?? 0,
          newSize: body.content.length,
        });
        deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
        return jsonResSuccess(
          res,
          { success: true, type: greetingType, index: idx, size: body.content.length },
          {
            toolName: 'write_greeting',
            summary: `Updated ${greetingType} greeting [${idx}]`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'write greeting',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: `greeting:${greetingType}:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /greeting/:type/:idx/delete — delete greeting
    // ----------------------------------------------------------------
    if (parts[0] === 'greeting' && parts[1] && parts[2] && parts[3] === 'delete' && req.method === 'POST') {
      const greetingType = parts[1];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'delete greeting',
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          target: `greeting:${greetingType}`,
        });
      }
      const mutationBlock = getFieldMutationBlock(currentData, fieldName);
      if (mutationBlock) {
        return mcpError(res, 400, {
          action: 'delete greeting',
          message: mutationBlock.message,
          suggestion: mutationBlock.suggestion,
          target: `greeting:${greetingType}`,
        });
      }
      const arr: string[] = currentData[fieldName] || [];
      const idx = parseInt(parts[2], 10);
      if (isNaN(idx) || idx < 0 || idx >= arr.length) {
        return mcpError(res, 400, {
          action: 'delete greeting',
          message: `Index ${parts[2]} out of range (0..${arr.length - 1})`,
          suggestion: `list_greetings로 유효한 index를 확인하세요.`,
          target: `greeting:${greetingType}:${parts[2]}`,
        });
      }
      const body = await readJsonBody(req, res, `greeting/${greetingType}/${idx}/delete`, broadcastStatus);
      if (!body) return;
      if (
        !ensureGreetingExpectedPreview(
          res,
          idx,
          arr[idx],
          body.expected_preview,
          'delete greeting',
          `greeting:${greetingType}:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const label = greetingType === 'alternate' ? '추가 첫 메시지' : '그룹 전용 인사말';

      const allowed = await deps.askRendererConfirm(
        'MCP 삭제 요청',
        `AI 어시스턴트가 ${label} #${idx}을(를) 삭제하려 합니다.`,
      );

      if (allowed) {
        currentData[fieldName].splice(idx, 1);
        logMcpMutation('delete greeting', `greeting:${greetingType}:${idx}`, {});
        deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
        return jsonResSuccess(
          res,
          { success: true, type: greetingType, deleted: idx },
          {
            toolName: 'delete_greeting',
            summary: `Deleted ${greetingType} greeting [${idx}]`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'delete greeting',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: `greeting:${greetingType}:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /greeting/:type/batch-delete — batch delete greetings
    // ----------------------------------------------------------------
    if (parts[0] === 'greeting' && parts[1] && parts[2] === 'batch-delete' && req.method === 'POST') {
      const greetingType = parts[1];
      const fieldName = getGreetingFieldName(greetingType);
      if (!fieldName) {
        return mcpError(res, 400, {
          action: 'batch delete greetings',
          message: `Unknown greeting type: "${greetingType}"`,
          suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          target: `greeting:${greetingType}`,
        });
      }
      const mutationBlock = getFieldMutationBlock(currentData, fieldName);
      if (mutationBlock) {
        return mcpError(res, 400, {
          action: 'batch delete greetings',
          message: mutationBlock.message,
          suggestion: mutationBlock.suggestion,
          target: `greeting:${greetingType}`,
        });
      }
      const body = await readJsonBody(req, res, `greeting/${greetingType}/batch-delete`, broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      const expectedPreviews = body.expected_previews;
      if (!Array.isArray(indices) || indices.length === 0) {
        return mcpError(res, 400, {
          action: 'batch delete greetings',
          message: 'indices must be a non-empty array of numbers',
          suggestion: 'indices: [0, 2, 5] 형식으로 삭제할 인사말 인덱스를 전달하세요.',
          target: `greeting:${greetingType}`,
        });
      }
      const MAX_BATCH = 50;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch delete greetings',
          message: `Maximum ${MAX_BATCH} deletions per batch`,
          suggestion: `${MAX_BATCH}개 이하로 나누어 호출하세요.`,
          target: `greeting:${greetingType}`,
        });
      }
      const arr: string[] = currentData[fieldName] || [];
      const uniqueIndices = [...new Set(indices)].sort((a, b) => b - a); // desc for safe splice
      for (const idx of uniqueIndices) {
        if (typeof idx !== 'number' || isNaN(idx) || idx < 0 || idx >= arr.length) {
          return mcpError(res, 400, {
            action: 'batch delete greetings',
            message: `Invalid index: ${idx} (range: 0..${arr.length - 1})`,
            suggestion: 'list_greetings로 유효한 index를 확인하세요.',
            target: `greeting:${greetingType}:${idx}`,
          });
        }
      }
      if (expectedPreviews !== undefined) {
        if (!Array.isArray(expectedPreviews) || expectedPreviews.length !== indices.length) {
          return mcpError(res, 400, {
            action: 'batch delete greetings',
            message: 'expected_previews must be an array with the same length as indices',
            suggestion: 'expected_previews에는 indices와 같은 순서/길이로 list_greetings의 preview 값을 넣으세요.',
            target: `greeting:${greetingType}`,
          });
        }
        for (const [position, idx] of indices.entries()) {
          if (
            !ensureGreetingExpectedPreview(
              res,
              idx,
              arr[idx],
              expectedPreviews[position],
              'batch delete greetings',
              `greeting:${greetingType}:batch-delete`,
              mcpError,
            )
          ) {
            return;
          }
        }
      }
      const label = greetingType === 'alternate' ? '추가 첫 메시지' : '그룹 전용 인사말';
      const allowed = await deps.askRendererConfirm(
        'MCP 일괄 삭제 요청',
        `AI 어시스턴트가 ${label} ${uniqueIndices.length}개 (index: ${uniqueIndices.join(', ')})를 삭제하려 합니다.`,
      );

      if (allowed) {
        const results = uniqueIndices.map((idx) => ({ index: idx, preview: getGreetingPreview(arr[idx] || '') }));
        for (const idx of uniqueIndices) {
          currentData[fieldName].splice(idx, 1);
        }
        logMcpMutation('batch delete greetings', `greeting:${greetingType}`, {
          count: uniqueIndices.length,
          indices: uniqueIndices,
        });
        deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
        return jsonResSuccess(
          res,
          {
            success: true,
            type: greetingType,
            deletedCount: uniqueIndices.length,
            deletedIndices: uniqueIndices,
            results,
          },
          {
            toolName: 'batch_delete_greeting',
            summary: `Batch deleted ${uniqueIndices.length} ${greetingType} greetings`,
            artifacts: { deletedCount: uniqueIndices.length },
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'batch delete greetings',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: `greeting:${greetingType}`,
        });
      }
    }

    // ================================================================
    // TRIGGER SCRIPTS
    // ================================================================

    // ----------------------------------------------------------------
    // GET /triggers — list trigger scripts
    // ----------------------------------------------------------------
    if (parts[0] === 'triggers' && !parts[1] && req.method === 'GET') {
      const scripts = currentData.triggerScripts || [];
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
        { count: scripts.length, items },
        {
          toolName: 'list_triggers',
          summary: `Listed ${scripts.length} trigger scripts`,
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /trigger/:idx — read single trigger script
    // ----------------------------------------------------------------
    if (parts[0] === 'trigger' && parts[1] && !parts[2] && req.method === 'GET') {
      const scripts = currentData.triggerScripts || [];
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= scripts.length) {
        return mcpError(res, 400, {
          action: 'read trigger',
          message: `Index ${parts[1]} out of range (0..${scripts.length - 1})`,
          suggestion: 'list_triggers로 유효한 index를 확인하세요.',
          target: `trigger:${parts[1]}`,
        });
      }
      return jsonResSuccess(
        res,
        { index: idx, trigger: scripts[idx] },
        {
          toolName: 'read_trigger',
          summary: `Read trigger script [${idx}] "${scripts[idx].comment || ''}"`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /trigger/batch — batch read trigger scripts
    // ----------------------------------------------------------------
    if (parts[0] === 'trigger' && parts[1] === 'batch' && !parts[2] && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'trigger/batch', broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read triggers',
          message: 'indices must be an array of numbers',
          suggestion: '{ "indices": [0, 1] } 형식으로 전송하세요.',
          target: 'trigger:batch',
        });
      }
      const MAX_BATCH = 50;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read triggers',
          message: `Maximum ${MAX_BATCH} indices per batch`,
          suggestion: `인덱스를 ${MAX_BATCH}개 이하로 나누어 전송하세요.`,
          target: 'trigger:batch',
        });
      }
      const scripts = currentData.triggerScripts || [];
      const triggers = indices.map((idx: number) => {
        if (typeof idx !== 'number' || idx < 0 || idx >= scripts.length) return null;
        return { index: idx, trigger: scripts[idx] };
      });
      const validCount = triggers.filter(Boolean).length;
      return jsonResSuccess(
        res,
        { count: validCount, total: indices.length, triggers },
        {
          toolName: 'read_trigger_batch',
          summary: `Batch read ${validCount}/${indices.length} trigger scripts`,
          artifacts: { count: validCount, total: indices.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /trigger/add — add new trigger script
    // ----------------------------------------------------------------
    if (parts[0] === 'trigger' && parts[1] === 'add' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'trigger/add', broadcastStatus);
      if (!body) return;
      const name = body.comment || '새 트리거';

      const allowed = await deps.askRendererConfirm(
        'MCP 추가 요청',
        `AI 어시스턴트가 새 트리거 스크립트 "${name}"을(를) 추가하려 합니다.`,
      );

      if (allowed) {
        const trigger = {
          comment: body.comment || '',
          type: body.type || 'start',
          conditions: Array.isArray(body.conditions) ? body.conditions : [],
          effect: Array.isArray(body.effect) ? body.effect : [],
          lowLevelAccess: !!body.lowLevelAccess,
        };
        if (!currentData.triggerScripts) currentData.triggerScripts = [];
        currentData.triggerScripts.push(trigger);
        const newIdx = currentData.triggerScripts.length - 1;
        currentData.lua = deps.extractPrimaryLua(currentData.triggerScripts);
        logMcpMutation('add trigger', 'trigger:add', { entryName: name, newIndex: newIdx });
        deps.broadcastToAll('data-updated', 'triggerScripts', deps.stringifyTriggerScripts(currentData.triggerScripts));
        deps.broadcastToAll('data-updated', 'lua', currentData.lua);
        return jsonResSuccess(
          res,
          { success: true, index: newIdx },
          {
            toolName: 'write_trigger',
            summary: `Added trigger script [${newIdx}] "${name}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'add trigger',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
          target: 'trigger:add',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /trigger/:idx/delete — delete trigger script
    // ----------------------------------------------------------------
    if (parts[0] === 'trigger' && parts[1] && parts[2] === 'delete' && req.method === 'POST') {
      const scripts = currentData.triggerScripts || [];
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= scripts.length) {
        return mcpError(res, 400, {
          action: 'delete trigger',
          message: `Index ${parts[1]} out of range (0..${scripts.length - 1})`,
          suggestion: 'list_triggers로 유효한 index를 확인하세요.',
          target: `trigger:${parts[1]}`,
        });
      }
      const body = await readJsonBody(req, res, `trigger/${idx}/delete`, broadcastStatus);
      if (!body) return;
      if (
        !ensureTriggerExpectedComment(
          res,
          idx,
          scripts[idx],
          body.expected_comment,
          'delete trigger',
          `trigger:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const name = scripts[idx].comment || `trigger_${idx}`;

      const allowed = await deps.askRendererConfirm(
        'MCP 삭제 요청',
        `AI 어시스턴트가 트리거 스크립트 "${name}" (index ${idx})을 삭제하려 합니다.`,
      );

      if (allowed) {
        currentData.triggerScripts.splice(idx, 1);
        currentData.lua = deps.extractPrimaryLua(currentData.triggerScripts);
        logMcpMutation('delete trigger', `trigger:${idx}`, { entryName: name });
        deps.broadcastToAll('data-updated', 'triggerScripts', deps.stringifyTriggerScripts(currentData.triggerScripts));
        deps.broadcastToAll('data-updated', 'lua', currentData.lua);
        return jsonResSuccess(
          res,
          { success: true, deleted: idx },
          {
            toolName: 'delete_trigger',
            summary: `Deleted trigger script [${idx}] "${name}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'delete trigger',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: `trigger:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /trigger/:idx — write single trigger script
    // ----------------------------------------------------------------
    if (parts[0] === 'trigger' && parts[1] && parts[1] !== 'batch' && !parts[2] && req.method === 'POST') {
      const scripts = currentData.triggerScripts || [];
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= scripts.length) {
        return mcpError(res, 400, {
          action: 'write trigger',
          message: `Index ${parts[1]} out of range (0..${scripts.length - 1})`,
          suggestion: 'list_triggers로 유효한 index를 확인하세요.',
          target: `trigger:${parts[1]}`,
        });
      }
      const body = await readJsonBody(req, res, `trigger/${idx}`, broadcastStatus);
      if (!body) return;
      if (
        !ensureTriggerExpectedComment(
          res,
          idx,
          scripts[idx],
          body.expected_comment,
          'write trigger',
          `trigger:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const name = body.comment || scripts[idx].comment || `trigger_${idx}`;

      const allowed = await deps.askRendererConfirm(
        'MCP 수정 요청',
        `AI 어시스턴트가 트리거 스크립트 "${name}" (index ${idx})을(를) 수정하려 합니다.`,
      );

      if (allowed) {
        const updated: Record<string, unknown> = { ...scripts[idx] };
        if (body.comment !== undefined) updated.comment = body.comment;
        if (body.type !== undefined) updated.type = body.type;
        if (body.conditions !== undefined) updated.conditions = body.conditions;
        if (body.effect !== undefined) updated.effect = body.effect;
        if (body.lowLevelAccess !== undefined) updated.lowLevelAccess = !!body.lowLevelAccess;
        currentData.triggerScripts[idx] = updated;
        currentData.lua = deps.extractPrimaryLua(currentData.triggerScripts);
        logMcpMutation('update trigger', `trigger:${idx}`, { entryName: name });
        deps.broadcastToAll('data-updated', 'triggerScripts', deps.stringifyTriggerScripts(currentData.triggerScripts));
        deps.broadcastToAll('data-updated', 'lua', currentData.lua);
        return jsonResSuccess(
          res,
          { success: true, index: idx },
          {
            toolName: 'write_trigger',
            summary: `Updated trigger script [${idx}] "${name}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'write trigger',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: `trigger:${idx}`,
        });
      }
    }

    return false;
  }

  return (await dispatch()) !== false;
}
