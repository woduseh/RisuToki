import * as http from 'http';

import {
  buildLuaListResponse,
  buildSectionReadPayload,
  ensureSectionExpectedIdentity,
  getSectionHash,
  getSectionPreview,
  logMcpMutation,
  readJsonBody,
  type McpNoOpInfo,
} from './mcp-api-helpers';
import type { CssCacheEntry, McpApiDeps, Section } from './mcp-api-server';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';
import { normalizeLF } from './shared-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */

type SectionApiDeps = Pick<
  McpApiDeps,
  | 'askRendererConfirm'
  | 'broadcastToAll'
  | 'combineCssSections'
  | 'combineLuaSections'
  | 'detectCssBlockClose'
  | 'detectCssBlockOpen'
  | 'detectCssSectionInline'
  | 'detectLuaSection'
  | 'mergePrimaryLua'
  | 'parseLuaSections'
>;

export interface SectionRouteDeps {
  api: SectionApiDeps;
  luaCache: { get(lua: string): Section[] };
  cssCache: { get(css: string): CssCacheEntry };
  broadcastStatus: (payload: Record<string, unknown>) => void;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, options: McpSuccessOptions) => void;
  mcpError: (res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown) => void;
  mcpNoOp: (res: http.ServerResponse, info: McpNoOpInfo, extra?: Record<string, unknown>) => void;
}

export async function handleSectionRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  currentData: Record<string, any>,
  routeDeps: SectionRouteDeps,
): Promise<boolean> {
  const deps = routeDeps.api;
  const { broadcastStatus, cssCache, jsonResSuccess, luaCache, mcpError, mcpNoOp } = routeDeps;

  async function dispatch(): Promise<void | false> {
    // ----------------------------------------------------------------
    // GET /lua — list Lua sections
    // ----------------------------------------------------------------
    if (parts[0] === 'lua' && !parts[1] && req.method === 'GET') {
      const luaListPayload = buildLuaListResponse(String(currentData.lua || ''), deps.parseLuaSections);
      return jsonResSuccess(res, luaListPayload, {
        toolName: 'list_lua',
        summary: `Listed ${luaListPayload.count} Lua sections`,
        artifacts: { count: luaListPayload.count },
      });
    }

    // ----------------------------------------------------------------
    // GET /lua/:idx — read Lua section
    // ----------------------------------------------------------------
    if (parts[0] === 'lua' && parts[1] && req.method === 'GET') {
      const sections = luaCache.get(currentData.lua);
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= sections.length) {
        return mcpError(res, 400, {
          action: 'read lua section',
          message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
          suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 확인하세요.',
          target: `lua:${idx}`,
        });
      }
      return jsonResSuccess(res, buildSectionReadPayload(idx, sections[idx]), {
        toolName: 'read_lua',
        summary: `Read Lua section [${idx}] "${sections[idx].name}" (${sections[idx].content.length} chars)`,
      });
    }

    // ----------------------------------------------------------------
    // POST /lua/batch — batch read Lua sections
    // ----------------------------------------------------------------
    if (parts[0] === 'lua' && parts[1] === 'batch' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lua/batch', broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read lua sections',
          message: 'indices must be an array of numbers',
          suggestion: '{ "indices": [0, 1, 2] } 형식으로 전송하세요.',
          target: 'lua:batch',
        });
      }
      const MAX_BATCH = 20;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read lua sections',
          message: `Maximum ${MAX_BATCH} indices per batch`,
          suggestion: `인덱스를 ${MAX_BATCH}개 이하로 나누어 전송하세요.`,
          target: 'lua:batch',
        });
      }
      const sections = luaCache.get(currentData.lua);
      const result = indices.map((idx: number) => {
        if (typeof idx !== 'number' || idx < 0 || idx >= sections.length) return null;
        return buildSectionReadPayload(idx, sections[idx]);
      });
      return jsonResSuccess(
        res,
        { count: result.filter(Boolean).length, total: indices.length, sections: result },
        {
          toolName: 'read_lua',
          summary: `Batch read ${result.filter(Boolean).length}/${indices.length} Lua sections`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /lua/add — add new Lua section
    // ----------------------------------------------------------------
    if (parts[0] === 'lua' && parts[1] === 'add' && !parts[2] && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'lua/add', broadcastStatus);
      if (!body) return;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return mcpError(res, 400, {
          action: 'add lua section',
          message: 'Missing or empty "name" for new Lua section',
          suggestion: '새 섹션의 name을 요청 본문에 포함하세요.',
          target: 'lua:add',
        });
      }
      const content = typeof body.content === 'string' ? body.content : '';
      const sections = luaCache.get(currentData.lua);
      const duplicate = sections.find((s) => s.name === name);
      if (duplicate) {
        return mcpError(res, 400, {
          action: 'add lua section',
          details: { existingIndex: sections.indexOf(duplicate) },
          message: `Section "${name}" already exists`,
          suggestion: '기존 섹션을 수정하거나 다른 이름을 사용하세요.',
          target: 'lua:add',
        });
      }

      const allowed = await deps.askRendererConfirm(
        'MCP 추가 요청',
        `AI 어시스턴트가 새 Lua 섹션 "${name}"을(를) 추가하려 합니다.`,
      );

      if (allowed) {
        sections.push({ name, content });
        currentData.lua = deps.combineLuaSections(sections);
        currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
        logMcpMutation('add lua section', `lua:add`, { sectionName: name, newIndex: sections.length - 1 });
        deps.broadcastToAll('data-updated', 'lua', currentData.lua);
        deps.broadcastToAll('data-updated', 'triggerScripts', currentData.triggerScripts);
        return jsonResSuccess(
          res,
          { success: true, index: sections.length - 1, name, contentSize: content.length },
          {
            toolName: 'add_lua_section',
            summary: `Added Lua section [${sections.length - 1}] "${name}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'add lua section',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
          target: 'lua:add',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lua/:idx — write Lua section
    // ----------------------------------------------------------------
    if (parts[0] === 'lua' && parts[1] && !parts[2] && req.method === 'POST') {
      const sections = luaCache.get(currentData.lua);
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= sections.length) {
        return mcpError(res, 400, {
          action: 'write lua section',
          message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
          suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
          target: `lua:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `lua/${idx}`, broadcastStatus);
      if (!body) return;
      if (body.content === undefined) {
        return mcpError(res, 400, {
          action: 'write lua section',
          message: 'Missing "content"',
          suggestion: 'content 필드를 포함한 요청 본문을 보내세요.',
          target: `lua:${idx}`,
        });
      }
      if (
        !ensureSectionExpectedIdentity(
          res,
          'lua',
          idx,
          sections[idx],
          body.expected_hash,
          body.expected_preview,
          'write lua section',
          `lua:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const sectionName = sections[idx].name;
      const oldSize = sections[idx].content.length;
      const newSize = body.content.length;

      const allowed = await deps.askRendererConfirm(
        'MCP 수정 요청',
        `AI 어시스턴트가 Lua 섹션 "${sectionName}" (index ${idx})을 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`,
      );

      if (allowed) {
        const sepLines = body.content.split('\n').filter((l: string) => deps.detectLuaSection(l) !== null);
        let warning: string | undefined;
        if (sepLines.length > 0) {
          warning = `주의: 내용에 섹션 구분자 패턴이 ${sepLines.length}건 포함되어 있습니다. 의도치 않은 섹션 분할이 발생할 수 있습니다.`;
        }
        sections[idx].content = body.content;
        currentData.lua = deps.combineLuaSections(sections);
        currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
        logMcpMutation('write lua section', `lua:${idx}`, { sectionName, oldSize, newSize });
        deps.broadcastToAll('data-updated', 'lua', currentData.lua);
        deps.broadcastToAll('data-updated', 'triggerScripts', currentData.triggerScripts);
        return jsonResSuccess(
          res,
          { success: true, index: idx, name: sectionName, size: newSize, warning },
          {
            toolName: 'write_lua',
            summary: `Updated Lua section [${idx}] "${sectionName}" (${oldSize} → ${newSize} chars)`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'write lua section',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 변경 요청을 허용한 뒤 다시 시도하세요.',
          target: `lua:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lua/:idx/delete — delete Lua section
    // ----------------------------------------------------------------
    if (parts[0] === 'lua' && parts[1] && parts[2] === 'delete' && !parts[3] && req.method === 'POST') {
      const sections = luaCache.get(currentData.lua);
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= sections.length) {
        return mcpError(res, 400, {
          action: 'delete lua section',
          message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
          suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
          target: `lua:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `lua/${idx}/delete`, broadcastStatus);
      if (!body) return;
      if (
        !ensureSectionExpectedIdentity(
          res,
          'lua',
          idx,
          sections[idx],
          body.expected_hash,
          body.expected_preview,
          'delete lua section',
          `lua:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const section = sections[idx];
      const allowed = await deps.askRendererConfirm(
        'MCP 삭제 요청',
        `AI 어시스턴트가 Lua 섹션 "${section.name}" (index ${idx})을 삭제하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'delete lua section',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: `lua:${idx}`,
        });
      }
      sections.splice(idx, 1);
      currentData.lua = deps.combineLuaSections(sections);
      currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
      logMcpMutation('delete lua section', `lua:${idx}`, { sectionName: section.name });
      deps.broadcastToAll('data-updated', 'lua', currentData.lua);
      deps.broadcastToAll('data-updated', 'triggerScripts', currentData.triggerScripts);
      return jsonResSuccess(
        res,
        { success: true, deleted: idx, name: section.name },
        { toolName: 'delete_lua_section', summary: `Deleted Lua section [${idx}] "${section.name}"` },
      );
    }

    // ----------------------------------------------------------------
    // POST /lua/:idx/replace
    // ----------------------------------------------------------------
    if (parts[0] === 'lua' && parts[1] && parts[2] === 'replace' && req.method === 'POST') {
      const sections = luaCache.get(currentData.lua);
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= sections.length) {
        return mcpError(res, 400, {
          action: 'replace lua section content',
          message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
          suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
          target: `lua:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `lua/${idx}/replace`, broadcastStatus);
      if (!body) return;
      if (!body.find) {
        return mcpError(res, 400, {
          action: 'replace lua section content',
          message: 'Missing "find"',
          suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
          target: `lua:${idx}`,
        });
      }
      if (
        !ensureSectionExpectedIdentity(
          res,
          'lua',
          idx,
          sections[idx],
          body.expected_hash,
          body.expected_preview,
          'replace lua section content',
          `lua:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      if (
        !ensureSectionExpectedIdentity(
          res,
          'css',
          idx,
          sections[idx],
          body.expected_hash,
          body.expected_preview,
          'replace css section content',
          `css-section:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      if (
        !ensureSectionExpectedIdentity(
          res,
          'css',
          idx,
          sections[idx],
          body.expected_hash,
          body.expected_preview,
          'replace css section content',
          `css-section:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const sectionName = sections[idx].name;
      const content = normalizeLF(sections[idx].content);
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
            action: 'replace lua section content',
            message: '일치하는 항목 없음',
            suggestion: 'read_lua로 현재 섹션 내용을 확인하고 find/regex/flags를 조정하세요.',
            target: `lua:${idx}`,
          },
          { matchCount: 0 },
        );
      }

      const allowed = await deps.askRendererConfirm(
        'MCP 치환 요청',
        `AI 어시스턴트가 Lua 섹션 "${sectionName}" (index ${idx})에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
      );

      if (allowed) {
        sections[idx].content = newContent;
        currentData.lua = deps.combineLuaSections(sections);
        currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
        logMcpMutation('replace lua section content', `lua:${idx}`, { sectionName, matchCount });
        deps.broadcastToAll('data-updated', 'lua', currentData.lua);
        deps.broadcastToAll('data-updated', 'triggerScripts', currentData.triggerScripts);
        return jsonResSuccess(
          res,
          {
            success: true,
            index: idx,
            name: sectionName,
            matchCount,
            oldSize: content.length,
            newSize: newContent.length,
          },
          {
            toolName: 'replace_in_lua',
            summary: `Replaced ${matchCount} match(es) in Lua section [${idx}] "${sectionName}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'replace lua section content',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
          target: `lua:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /lua/:idx/insert
    // ----------------------------------------------------------------
    if (parts[0] === 'lua' && parts[1] && parts[2] === 'insert' && req.method === 'POST') {
      const sections = luaCache.get(currentData.lua);
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= sections.length) {
        return mcpError(res, 400, {
          action: 'insert lua section content',
          message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
          suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
          target: `lua:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `lua/${idx}/insert`, broadcastStatus);
      if (!body) return;
      if (body.content === undefined) {
        return mcpError(res, 400, {
          action: 'insert lua section content',
          message: 'Missing "content"',
          suggestion: '삽입할 content를 요청 본문에 포함하세요.',
          target: `lua:${idx}`,
        });
      }
      if (
        !ensureSectionExpectedIdentity(
          res,
          'lua',
          idx,
          sections[idx],
          body.expected_hash,
          body.expected_preview,
          'insert lua section content',
          `lua:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      if (
        !ensureSectionExpectedIdentity(
          res,
          'css',
          idx,
          sections[idx],
          body.expected_hash,
          body.expected_preview,
          'insert css section content',
          `css-section:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      if (
        !ensureSectionExpectedIdentity(
          res,
          'css',
          idx,
          sections[idx],
          body.expected_hash,
          body.expected_preview,
          'insert css section content',
          `css-section:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const sectionName = sections[idx].name;
      const oldContent = normalizeLF(sections[idx].content);
      let newContent: string;
      const position: string = body.position || 'end';
      const insContent = normalizeLF(body.content);

      if (position === 'end') {
        newContent = oldContent + '\n' + insContent;
      } else if (position === 'start') {
        newContent = insContent + '\n' + oldContent;
      } else if ((position === 'after' || position === 'before') && body.anchor) {
        const anchorNorm = normalizeLF(body.anchor);
        const anchorPos = oldContent.indexOf(anchorNorm);
        if (anchorPos === -1) {
          return mcpNoOp(res, {
            action: 'insert lua section content',
            message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
            suggestion:
              'read_lua로 현재 섹션 내용을 확인해 anchor 문자열을 다시 지정하거나 position을 start/end로 변경하세요.',
            target: `lua:${idx}`,
          });
        }
        if (position === 'after') {
          const insertAt = anchorPos + anchorNorm.length;
          newContent = oldContent.slice(0, insertAt) + '\n' + insContent + oldContent.slice(insertAt);
        } else {
          newContent = oldContent.slice(0, anchorPos) + insContent + '\n' + oldContent.slice(anchorPos);
        }
      } else {
        return mcpError(res, 400, {
          action: 'insert lua section content',
          message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
          suggestion: '{ "position": "after", "anchor": "기준 문자열" } 형식으로 anchor를 포함하세요.',
          target: `lua:${idx}`,
        });
      }

      const preview = insContent.substring(0, 100) + (insContent.length > 100 ? '...' : '');
      const allowed = await deps.askRendererConfirm(
        'MCP 삽입 요청',
        `AI 어시스턴트가 Lua 섹션 "${sectionName}" (index ${idx})에 코드를 삽입하려 합니다.\n위치: ${position}${body.anchor ? ' "' + body.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
      );

      if (allowed) {
        const separatorLines = newContent
          .split('\n')
          .filter((l) => deps.detectLuaSection(l) !== null && !oldContent.includes(l));
        let warning = '';
        if (separatorLines.length > 0) {
          for (const sepLine of separatorLines) {
            const escaped = sepLine.replace(/={3,}/g, (m) => m.slice(0, 2) + '·' + m.slice(3));
            newContent = newContent.replace(sepLine, escaped);
          }
          warning = ` (경고: 섹션 구분자 ${separatorLines.length}건을 이스케이프 처리했습니다)`;
        }
        sections[idx].content = newContent;
        currentData.lua = deps.combineLuaSections(sections);
        currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
        logMcpMutation('insert lua section content', `lua:${idx}`, {
          sectionName,
          position,
          oldSize: oldContent.length,
          newSize: newContent.length,
        });
        deps.broadcastToAll('data-updated', 'lua', currentData.lua);
        deps.broadcastToAll('data-updated', 'triggerScripts', currentData.triggerScripts);
        return jsonResSuccess(
          res,
          {
            success: true,
            index: idx,
            name: sectionName,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
            warning: warning || undefined,
          },
          {
            toolName: 'insert_in_lua',
            summary: `Inserted content at ${position} in Lua section [${idx}] "${sectionName}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'insert lua section content',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삽입 요청을 허용한 뒤 다시 시도하세요.',
          target: `lua:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // GET /css-section — list CSS sections
    // ----------------------------------------------------------------
    if (parts[0] === 'css-section' && !parts[1] && req.method === 'GET') {
      const { sections } = cssCache.get(currentData.css);
      const result = sections.map((section, index) => ({
        index,
        name: section.name,
        contentSize: section.content.length,
        preview: getSectionPreview(section.content),
        hash: getSectionHash(section.content),
      }));
      return jsonResSuccess(
        res,
        { count: result.length, sections: result },
        {
          toolName: 'list_css',
          summary: `Listed ${result.length} CSS sections`,
          artifacts: { count: result.length },
        },
      );
    }

    // ----------------------------------------------------------------
    // GET /css-section/:idx — read CSS section
    // ----------------------------------------------------------------
    if (parts[0] === 'css-section' && parts[1] && !parts[2] && req.method === 'GET') {
      const { sections } = cssCache.get(currentData.css);
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= sections.length) {
        return mcpError(res, 400, {
          action: 'read css section',
          message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
          suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 확인하세요.',
          target: `css-section:${idx}`,
        });
      }
      return jsonResSuccess(res, buildSectionReadPayload(idx, sections[idx]), {
        toolName: 'read_css',
        summary: `Read CSS section [${idx}] "${sections[idx].name}" (${sections[idx].content.length} chars)`,
      });
    }

    // ----------------------------------------------------------------
    // POST /css-section/batch — batch read CSS sections
    // ----------------------------------------------------------------
    if (parts[0] === 'css-section' && parts[1] === 'batch' && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'css-section/batch', broadcastStatus);
      if (!body) return;
      const indices: number[] = body.indices;
      if (!Array.isArray(indices)) {
        return mcpError(res, 400, {
          action: 'batch read css sections',
          message: 'indices must be an array of numbers',
          suggestion: '{ "indices": [0, 1, 2] } 형식으로 전송하세요.',
          target: 'css-section:batch',
        });
      }
      const MAX_BATCH = 20;
      if (indices.length > MAX_BATCH) {
        return mcpError(res, 400, {
          action: 'batch read css sections',
          message: `Maximum ${MAX_BATCH} indices per batch`,
          suggestion: `인덱스를 ${MAX_BATCH}개 이하로 나누어 전송하세요.`,
          target: 'css-section:batch',
        });
      }
      const { sections } = cssCache.get(currentData.css);
      const result = indices.map((idx: number) => {
        if (typeof idx !== 'number' || idx < 0 || idx >= sections.length) return null;
        return buildSectionReadPayload(idx, sections[idx]);
      });
      return jsonResSuccess(
        res,
        { count: result.filter(Boolean).length, total: indices.length, sections: result },
        {
          toolName: 'read_css',
          summary: `Batch read ${result.filter(Boolean).length}/${indices.length} CSS sections`,
        },
      );
    }

    // ----------------------------------------------------------------
    // POST /css-section/add — add new CSS section
    // ----------------------------------------------------------------
    if (parts[0] === 'css-section' && parts[1] === 'add' && !parts[2] && req.method === 'POST') {
      const body = await readJsonBody(req, res, 'css-section/add', broadcastStatus);
      if (!body) return;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return mcpError(res, 400, {
          action: 'add css section',
          message: 'Missing or empty "name" for new CSS section',
          suggestion: '새 섹션의 name을 요청 본문에 포함하세요.',
          target: 'css-section:add',
        });
      }
      const content = typeof body.content === 'string' ? body.content : '';
      const { sections, prefix, suffix } = cssCache.get(currentData.css);
      const duplicate = sections.find((s) => s.name === name);
      if (duplicate) {
        return mcpError(res, 400, {
          action: 'add css section',
          details: { existingIndex: sections.indexOf(duplicate) },
          message: `Section "${name}" already exists`,
          suggestion: '기존 섹션을 수정하거나 다른 이름을 사용하세요.',
          target: 'css-section:add',
        });
      }

      const allowed = await deps.askRendererConfirm(
        'MCP 추가 요청',
        `AI 어시스턴트가 새 CSS 섹션 "${name}"을(를) 추가하려 합니다.`,
      );

      if (allowed) {
        sections.push({ name, content });
        currentData.css = deps.combineCssSections(sections, prefix, suffix);
        logMcpMutation('add css section', `css-section:add`, { sectionName: name, newIndex: sections.length - 1 });
        deps.broadcastToAll('data-updated', 'css', currentData.css);
        return jsonResSuccess(
          res,
          { success: true, index: sections.length - 1, name, contentSize: content.length },
          {
            toolName: 'add_css_section',
            summary: `Added CSS section [${sections.length - 1}] "${name}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'add css section',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
          target: 'css-section:add',
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /css-section/:idx — write CSS section
    // ----------------------------------------------------------------
    if (parts[0] === 'css-section' && parts[1] && !parts[2] && req.method === 'POST') {
      const { sections, prefix, suffix } = cssCache.get(currentData.css);
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= sections.length) {
        return mcpError(res, 400, {
          action: 'write css section',
          message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
          suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
          target: `css-section:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `css-section/${idx}`, broadcastStatus);
      if (!body) return;
      if (body.content === undefined) {
        return mcpError(res, 400, {
          action: 'write css section',
          message: 'Missing "content"',
          suggestion: 'content 필드를 포함한 요청 본문을 보내세요.',
          target: `css-section:${idx}`,
        });
      }
      if (
        !ensureSectionExpectedIdentity(
          res,
          'css',
          idx,
          sections[idx],
          body.expected_hash,
          body.expected_preview,
          'write css section',
          `css-section:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const sectionName = sections[idx].name;
      const oldSize = sections[idx].content.length;
      const newSize = body.content.length;

      const allowed = await deps.askRendererConfirm(
        'MCP 수정 요청',
        `AI 어시스턴트가 CSS 섹션 "${sectionName}" (index ${idx})을 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`,
      );

      if (allowed) {
        sections[idx].content = body.content;
        currentData.css = deps.combineCssSections(sections, prefix, suffix);
        logMcpMutation('write css section', `css-section:${idx}`, { sectionName, oldSize, newSize });
        deps.broadcastToAll('data-updated', 'css', currentData.css);
        return jsonResSuccess(
          res,
          { success: true, index: idx, name: sectionName, size: newSize },
          {
            toolName: 'write_css',
            summary: `Updated CSS section [${idx}] "${sectionName}" (${oldSize} → ${newSize} chars)`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'write css section',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 변경 요청을 허용한 뒤 다시 시도하세요.',
          target: `css-section:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /css-section/:idx/delete — delete CSS section
    // ----------------------------------------------------------------
    if (parts[0] === 'css-section' && parts[1] && parts[2] === 'delete' && !parts[3] && req.method === 'POST') {
      const { sections, prefix, suffix } = cssCache.get(currentData.css);
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= sections.length) {
        return mcpError(res, 400, {
          action: 'delete css section',
          message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
          suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
          target: `css-section:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `css-section/${idx}/delete`, broadcastStatus);
      if (!body) return;
      if (
        !ensureSectionExpectedIdentity(
          res,
          'css',
          idx,
          sections[idx],
          body.expected_hash,
          body.expected_preview,
          'delete css section',
          `css-section:${idx}`,
          mcpError,
        )
      ) {
        return;
      }
      const section = sections[idx];
      const allowed = await deps.askRendererConfirm(
        'MCP 삭제 요청',
        `AI 어시스턴트가 CSS 섹션 "${section.name}" (index ${idx})을 삭제하려 합니다.`,
      );
      if (!allowed) {
        return mcpError(res, 403, {
          action: 'delete css section',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
          target: `css-section:${idx}`,
        });
      }
      sections.splice(idx, 1);
      currentData.css = deps.combineCssSections(sections, prefix, suffix);
      logMcpMutation('delete css section', `css-section:${idx}`, { sectionName: section.name });
      deps.broadcastToAll('data-updated', 'css', currentData.css);
      return jsonResSuccess(
        res,
        { success: true, deleted: idx, name: section.name },
        { toolName: 'delete_css_section', summary: `Deleted CSS section [${idx}] "${section.name}"` },
      );
    }

    // ----------------------------------------------------------------
    // POST /css-section/:idx/replace
    // ----------------------------------------------------------------
    if (parts[0] === 'css-section' && parts[1] && parts[2] === 'replace' && req.method === 'POST') {
      const { sections, prefix, suffix } = cssCache.get(currentData.css);
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= sections.length) {
        return mcpError(res, 400, {
          action: 'replace css section content',
          message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
          suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
          target: `css-section:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `css-section/${idx}/replace`, broadcastStatus);
      if (!body) return;
      if (!body.find) {
        return mcpError(res, 400, {
          action: 'replace css section content',
          message: 'Missing "find"',
          suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
          target: `css-section:${idx}`,
        });
      }
      const sectionName = sections[idx].name;
      const content = normalizeLF(sections[idx].content);
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
            action: 'replace css section content',
            message: '일치하는 항목 없음',
            suggestion: 'read_css로 현재 섹션 내용을 확인하고 find/regex/flags를 조정하세요.',
            target: `css-section:${idx}`,
          },
          { matchCount: 0 },
        );
      }

      const allowed = await deps.askRendererConfirm(
        'MCP 치환 요청',
        `AI 어시스턴트가 CSS 섹션 "${sectionName}" (index ${idx})에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
      );

      if (allowed) {
        sections[idx].content = newContent;
        currentData.css = deps.combineCssSections(sections, prefix, suffix);
        logMcpMutation('replace css section content', `css-section:${idx}`, { sectionName, matchCount });
        deps.broadcastToAll('data-updated', 'css', currentData.css);
        return jsonResSuccess(
          res,
          {
            success: true,
            index: idx,
            name: sectionName,
            matchCount,
            oldSize: content.length,
            newSize: newContent.length,
          },
          {
            toolName: 'replace_in_css',
            summary: `Replaced ${matchCount} match(es) in CSS section [${idx}] "${sectionName}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'replace css section content',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
          target: `css-section:${idx}`,
        });
      }
    }

    // ----------------------------------------------------------------
    // POST /css-section/:idx/insert
    // ----------------------------------------------------------------
    if (parts[0] === 'css-section' && parts[1] && parts[2] === 'insert' && req.method === 'POST') {
      const { sections, prefix, suffix } = cssCache.get(currentData.css);
      const idx = parseInt(parts[1], 10);
      if (isNaN(idx) || idx < 0 || idx >= sections.length) {
        return mcpError(res, 400, {
          action: 'insert css section content',
          message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
          suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
          target: `css-section:${idx}`,
        });
      }
      const body = await readJsonBody(req, res, `css-section/${idx}/insert`, broadcastStatus);
      if (!body) return;
      if (body.content === undefined) {
        return mcpError(res, 400, {
          action: 'insert css section content',
          message: 'Missing "content"',
          suggestion: '삽입할 content를 요청 본문에 포함하세요.',
          target: `css-section:${idx}`,
        });
      }
      const sectionName = sections[idx].name;
      const oldContent = normalizeLF(sections[idx].content);
      let newContent: string;
      const position: string = body.position || 'end';
      const insContent = normalizeLF(body.content);

      if (position === 'end') {
        newContent = oldContent + '\n' + insContent;
      } else if (position === 'start') {
        newContent = insContent + '\n' + oldContent;
      } else if ((position === 'after' || position === 'before') && body.anchor) {
        const anchorNorm = normalizeLF(body.anchor);
        const anchorPos = oldContent.indexOf(anchorNorm);
        if (anchorPos === -1) {
          return mcpNoOp(res, {
            action: 'insert css section content',
            message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
            suggestion:
              'read_css로 현재 섹션 내용을 확인해 anchor 문자열을 다시 지정하거나 position을 start/end로 변경하세요.',
            target: `css-section:${idx}`,
          });
        }
        if (position === 'after') {
          const insertAt = anchorPos + anchorNorm.length;
          newContent = oldContent.slice(0, insertAt) + '\n' + insContent + oldContent.slice(insertAt);
        } else {
          newContent = oldContent.slice(0, anchorPos) + insContent + '\n' + oldContent.slice(anchorPos);
        }
      } else {
        return mcpError(res, 400, {
          action: 'insert css section content',
          message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
          suggestion: '{ "position": "before", "anchor": "기준 문자열" } 형식으로 anchor를 포함하세요.',
          target: `css-section:${idx}`,
        });
      }

      const preview = insContent.substring(0, 100) + (insContent.length > 100 ? '...' : '');
      const allowed = await deps.askRendererConfirm(
        'MCP 삽입 요청',
        `AI 어시스턴트가 CSS 섹션 "${sectionName}" (index ${idx})에 코드를 삽입하려 합니다.\n위치: ${position}${body.anchor ? ' "' + body.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
      );

      if (allowed) {
        const newLines = newContent.split('\n');
        let warning = '';
        let escapedCount = 0;
        for (let li = 0; li < newLines.length; li++) {
          const line = newLines[li];
          if (oldContent.includes(line)) continue;
          if (
            deps.detectCssSectionInline(line) !== null ||
            deps.detectCssBlockOpen(line) ||
            deps.detectCssBlockClose(line)
          ) {
            newLines[li] = line.replace(/={3,}/g, (m) => m.slice(0, 2) + '·' + m.slice(3));
            escapedCount++;
          }
        }
        if (escapedCount > 0) {
          newContent = newLines.join('\n');
          warning = ` (경고: CSS 섹션 구분자 ${escapedCount}건을 이스케이프 처리했습니다)`;
        }
        sections[idx].content = newContent;
        currentData.css = deps.combineCssSections(sections, prefix, suffix);
        logMcpMutation('insert css section content', `css-section:${idx}`, {
          sectionName,
          position,
          oldSize: oldContent.length,
          newSize: newContent.length,
        });
        deps.broadcastToAll('data-updated', 'css', currentData.css);
        return jsonResSuccess(
          res,
          {
            success: true,
            index: idx,
            name: sectionName,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
            warning: warning || undefined,
          },
          {
            toolName: 'insert_in_css',
            summary: `Inserted content at ${position} in CSS section [${idx}] "${sectionName}"`,
          },
        );
      } else {
        return mcpError(res, 403, {
          action: 'insert css section content',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 삽입 요청을 허용한 뒤 다시 시도하세요.',
          target: `css-section:${idx}`,
        });
      }
    }

    return false;
  }

  const handled = await dispatch();
  return handled !== false;
}
