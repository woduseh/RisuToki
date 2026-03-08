"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startApiServer = startApiServer;
const http = __importStar(require("http"));
const crypto = __importStar(require("crypto"));
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function readBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => resolve(body));
    });
}
function jsonRes(res, data, status) {
    res.writeHead(status || 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
function logMcpMutation(action, target, details) {
    console.log(`[main][mcp] ${action}:`, { target, ...details });
}
function jsonMcpError(res, status, info, broadcastStatus, error) {
    const payload = {
        action: info.action,
        details: info.details,
        error: info.message,
        rejected: !!info.rejected,
        status,
        suggestion: info.suggestion,
        target: info.target,
    };
    const logger = status >= 500 ? console.error : console.warn;
    if (error) {
        logger(`[main][mcp] ${info.action}:`, payload, error);
    }
    else {
        logger(`[main][mcp] ${info.action}:`, payload);
    }
    broadcastStatus({
        action: info.action,
        level: status >= 500 ? 'error' : 'warn',
        message: info.message,
        rejected: !!info.rejected,
        status,
        suggestion: info.suggestion,
        target: info.target,
    });
    jsonRes(res, payload, status);
}
async function readJsonBody(req, res, context, broadcastStatus) {
    const raw = await readBody(req);
    if (!raw.trim())
        return {};
    try {
        return JSON.parse(raw);
    }
    catch (error) {
        jsonMcpError(res, 400, {
            action: `${context} request`,
            message: '요청 본문 JSON이 올바르지 않습니다.',
            suggestion: '유효한 JSON 객체를 다시 보내세요.',
            details: { bodyLength: raw.length },
            target: context,
        }, broadcastStatus, error);
        return null;
    }
}
function createLuaCache(parse) {
    const cache = { source: null, result: null };
    return {
        get(lua) {
            if (lua !== cache.source) {
                cache.source = lua;
                cache.result = parse(lua);
            }
            // Return deep copy so callers can mutate safely
            return cache.result.map(s => ({ name: s.name, content: s.content }));
        },
        invalidate() { cache.source = null; cache.result = null; },
    };
}
function createCssCache(parse) {
    const cache = { source: null, result: null };
    return {
        get(css) {
            if (css !== cache.source) {
                cache.source = css;
                cache.result = parse(css);
            }
            // Return deep copy of sections
            return {
                sections: cache.result.sections.map(s => ({ name: s.name, content: s.content })),
                prefix: cache.result.prefix,
                suffix: cache.result.suffix,
            };
        },
        invalidate() { cache.source = null; cache.result = null; },
    };
}
// ---------------------------------------------------------------------------
// startApiServer
// ---------------------------------------------------------------------------
function startApiServer(deps) {
    const token = crypto.randomBytes(32).toString('hex');
    const luaCache = createLuaCache(deps.parseLuaSections);
    const cssCache = createCssCache(deps.parseCssSections);
    const broadcastStatus = deps.broadcastMcpStatus;
    // Shorthand to emit an MCP error response
    function mcpError(res, status, info, error) {
        jsonMcpError(res, status, info, broadcastStatus, error);
    }
    const server = http.createServer(async (req, res) => {
        // Auth check
        if (req.headers.authorization !== `Bearer ${token}`) {
            return jsonRes(res, { error: 'Unauthorized' }, 401);
        }
        const currentData = deps.getCurrentData();
        if (!currentData) {
            return jsonRes(res, { error: 'No file open' }, 400);
        }
        const url = new URL(req.url, 'http://127.0.0.1');
        const parts = url.pathname.split('/').filter(Boolean);
        try {
            // ----------------------------------------------------------------
            // GET /fields
            // ----------------------------------------------------------------
            if (req.method === 'GET' && parts[0] === 'fields' && !parts[1]) {
                const fieldNames = ['name', 'description', 'firstMessage', 'globalNote', 'css', 'defaultVariables', 'triggerScripts', 'lua'];
                const fields = fieldNames.map(f => ({
                    name: f,
                    size: (f === 'triggerScripts' ? deps.stringifyTriggerScripts(currentData.triggerScripts) : (currentData[f] || '')).length,
                    sizeKB: (((f === 'triggerScripts' ? deps.stringifyTriggerScripts(currentData.triggerScripts) : (currentData[f] || '')).length) / 1024).toFixed(1) + 'KB',
                }));
                fields.push({ name: 'alternateGreetings', count: (currentData.alternateGreetings || []).length, type: 'array' });
                fields.push({ name: 'groupOnlyGreetings', count: (currentData.groupOnlyGreetings || []).length, type: 'array' });
                fields.push({ name: 'lorebook', count: (currentData.lorebook || []).length, type: 'array' });
                fields.push({ name: 'regex', count: (currentData.regex || []).length, type: 'array' });
                return jsonRes(res, { fields });
            }
            // ----------------------------------------------------------------
            // GET/POST /field/:name
            // ----------------------------------------------------------------
            if (parts[0] === 'field' && parts[1]) {
                const fieldName = decodeURIComponent(parts[1]);
                const allowedFields = ['name', 'description', 'firstMessage', 'alternateGreetings', 'groupOnlyGreetings', 'globalNote', 'css', 'defaultVariables', 'triggerScripts', 'lua'];
                if (!allowedFields.includes(fieldName)) {
                    return jsonRes(res, { error: `Unknown field: ${fieldName}` }, 400);
                }
                if (req.method === 'GET') {
                    if (fieldName === 'triggerScripts') {
                        return jsonRes(res, { field: fieldName, content: deps.stringifyTriggerScripts(currentData.triggerScripts) });
                    }
                    if (fieldName === 'alternateGreetings' || fieldName === 'groupOnlyGreetings') {
                        return jsonRes(res, { field: fieldName, content: currentData[fieldName] || [] });
                    }
                    return jsonRes(res, { field: fieldName, content: currentData[fieldName] || '' });
                }
                if (req.method === 'POST') {
                    const body = await readJsonBody(req, res, `field/${fieldName}`, broadcastStatus);
                    if (!body)
                        return;
                    if (body.content === undefined) {
                        return mcpError(res, 400, {
                            action: 'update field',
                            message: 'Missing "content"',
                            suggestion: 'content 필드를 포함한 요청 본문을 보내세요.',
                            target: `field:${fieldName}`,
                        });
                    }
                    const oldSize = fieldName === 'triggerScripts'
                        ? deps.stringifyTriggerScripts(currentData.triggerScripts).length
                        : (Array.isArray(currentData[fieldName]) ? currentData[fieldName].length : (currentData[fieldName] || '').length);
                    const newSize = fieldName === 'triggerScripts'
                        ? String(body.content || '').length
                        : (Array.isArray(body.content) ? body.content.length : body.content.length);
                    const allowed = await deps.askRendererConfirm('MCP 수정 요청', `AI 어시스턴트가 "${fieldName}" 필드를 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`);
                    if (allowed) {
                        let content = body.content;
                        if (fieldName === 'alternateGreetings' || fieldName === 'groupOnlyGreetings') {
                            if (!Array.isArray(content)) {
                                return mcpError(res, 400, {
                                    action: 'update field',
                                    message: `"${fieldName}" must be an array`,
                                    suggestion: '문자열 배열 형태로 값을 다시 보내세요.',
                                    target: `field:${fieldName}`,
                                });
                            }
                            content = content.map((item) => String(item));
                        }
                        // Strip <style> wrapper from CSS to prevent nesting
                        if (fieldName === 'css') {
                            content = content.replace(/^\s*<style[^>]*>\s*/i, '').replace(/\s*<\/style>\s*$/i, '');
                        }
                        if (fieldName === 'triggerScripts') {
                            try {
                                currentData.triggerScripts = deps.normalizeTriggerScripts(content);
                                currentData.lua = deps.extractPrimaryLua(currentData.triggerScripts);
                            }
                            catch (error) {
                                return mcpError(res, 400, {
                                    action: 'update field',
                                    message: error.message,
                                    suggestion: 'triggerScripts JSON 구조와 스크립트 배열 형식을 확인하세요.',
                                    target: 'field:triggerScripts',
                                }, error);
                            }
                            logMcpMutation('update field', 'field:triggerScripts', { oldSize, newSize });
                            deps.broadcastToAll('data-updated', 'triggerScripts', deps.stringifyTriggerScripts(currentData.triggerScripts));
                            deps.broadcastToAll('data-updated', 'lua', currentData.lua);
                            return jsonRes(res, { success: true, field: fieldName, size: deps.stringifyTriggerScripts(currentData.triggerScripts).length });
                        }
                        currentData[fieldName] = content;
                        if (fieldName === 'lua') {
                            currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
                            deps.broadcastToAll('data-updated', 'triggerScripts', deps.stringifyTriggerScripts(currentData.triggerScripts));
                        }
                        logMcpMutation('update field', `field:${fieldName}`, { oldSize, newSize });
                        deps.broadcastToAll('data-updated', fieldName, content);
                        return jsonRes(res, { success: true, field: fieldName, size: content.length });
                    }
                    else {
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
            // GET /lorebook
            // ----------------------------------------------------------------
            if (parts[0] === 'lorebook' && !parts[1] && req.method === 'GET') {
                let entries = (currentData.lorebook || []).map((e, i) => ({
                    index: i, comment: e.comment || '', key: e.key || '',
                    mode: e.mode || 'normal', alwaysActive: !!e.alwaysActive,
                    contentSize: (e.content || '').length,
                }));
                const filterParam = url.searchParams.get('filter');
                if (filterParam) {
                    const q = filterParam.toLowerCase();
                    entries = entries.filter((e) => e.comment.toLowerCase().includes(q) || e.key.toLowerCase().includes(q));
                }
                return jsonRes(res, { count: entries.length, entries });
            }
            // ----------------------------------------------------------------
            // GET /lorebook/:idx
            // ----------------------------------------------------------------
            if (parts[0] === 'lorebook' && parts[1] && req.method === 'GET') {
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= (currentData.lorebook || []).length) {
                    return jsonRes(res, { error: `Index ${idx} out of range` }, 400);
                }
                return jsonRes(res, { index: idx, entry: currentData.lorebook[idx] });
            }
            // ----------------------------------------------------------------
            // POST /lorebook/:idx (modify existing)
            // ----------------------------------------------------------------
            if (parts[0] === 'lorebook' && parts[1] && parts[1] !== 'add' && !parts[2] && req.method === 'POST') {
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= (currentData.lorebook || []).length) {
                    return mcpError(res, 400, {
                        action: 'update lorebook entry',
                        message: `Index ${idx} out of range`,
                        suggestion: 'list_lorebook 또는 GET /lorebook 으로 유효한 index를 다시 확인하세요.',
                        target: `lorebook:${idx}`,
                    });
                }
                const body = await readJsonBody(req, res, `lorebook/${idx}`, broadcastStatus);
                if (!body)
                    return;
                const entryName = currentData.lorebook[idx].comment || `entry_${idx}`;
                const allowed = await deps.askRendererConfirm('MCP 수정 요청', `AI 어시스턴트가 로어북 항목 "${entryName}" (index ${idx})을 수정하려 합니다.\n현재 에디터에서 수정 중인 내용이 덮어씌워질 수 있습니다.`);
                if (allowed) {
                    Object.assign(currentData.lorebook[idx], body);
                    logMcpMutation('update lorebook entry', `lorebook:${idx}`, { entryName, updatedKeys: Object.keys(body) });
                    deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
                    return jsonRes(res, { success: true, index: idx });
                }
                else {
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
                if (!body)
                    return;
                const name = body.comment || '새 항목';
                const allowed = await deps.askRendererConfirm('MCP 추가 요청', `AI 어시스턴트가 새 로어북 항목 "${name}"을(를) 추가하려 합니다.`);
                if (allowed) {
                    const entry = Object.assign({
                        key: '', secondkey: '', comment: '', content: '',
                        order: 100, priority: 0, selective: false,
                        alwaysActive: false, mode: 'normal', extentions: {},
                    }, body);
                    if (!currentData.lorebook)
                        currentData.lorebook = [];
                    currentData.lorebook.push(entry);
                    logMcpMutation('add lorebook entry', 'lorebook:add', { entryName: name, newIndex: currentData.lorebook.length - 1 });
                    deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
                    return jsonRes(res, { success: true, index: currentData.lorebook.length - 1 });
                }
                else {
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
            // POST /lorebook/:idx/delete
            // ----------------------------------------------------------------
            if (parts[0] === 'lorebook' && parts[2] === 'delete' && req.method === 'POST') {
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= (currentData.lorebook || []).length) {
                    return mcpError(res, 400, {
                        action: 'delete lorebook entry',
                        message: `Index ${idx} out of range`,
                        suggestion: 'list_lorebook 또는 GET /lorebook 으로 유효한 index를 다시 확인하세요.',
                        target: `lorebook:${idx}`,
                    });
                }
                const entryName = currentData.lorebook[idx].comment || `entry_${idx}`;
                const allowed = await deps.askRendererConfirm('MCP 삭제 요청', `AI 어시스턴트가 로어북 항목 "${entryName}" (index ${idx})을 삭제하려 합니다.`);
                if (allowed) {
                    currentData.lorebook.splice(idx, 1);
                    logMcpMutation('delete lorebook entry', `lorebook:${idx}`, { entryName });
                    deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
                    return jsonRes(res, { success: true, deleted: idx });
                }
                else {
                    return mcpError(res, 403, {
                        action: 'delete lorebook entry',
                        message: '사용자가 거부했습니다',
                        rejected: true,
                        suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
                        target: `lorebook:${idx}`,
                    });
                }
            }
            // ----------------------------------------------------------------
            // GET /regex
            // ----------------------------------------------------------------
            if (parts[0] === 'regex' && !parts[1] && req.method === 'GET') {
                const entries = (currentData.regex || []).map((e, i) => ({
                    index: i, comment: e.comment || '', type: e.type || '',
                }));
                return jsonRes(res, { count: entries.length, entries });
            }
            // ----------------------------------------------------------------
            // GET /regex/:idx
            // ----------------------------------------------------------------
            if (parts[0] === 'regex' && parts[1] && req.method === 'GET') {
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= (currentData.regex || []).length) {
                    return jsonRes(res, { error: `Index ${idx} out of range` }, 400);
                }
                const entry = { ...currentData.regex[idx] };
                delete entry.in;
                delete entry.out;
                return jsonRes(res, { index: idx, entry });
            }
            // ----------------------------------------------------------------
            // POST /regex/:idx (modify existing)
            // ----------------------------------------------------------------
            if (parts[0] === 'regex' && parts[1] && parts[1] !== 'add' && !parts[2] && req.method === 'POST') {
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= (currentData.regex || []).length) {
                    return mcpError(res, 400, {
                        action: 'update regex entry',
                        message: `Index ${idx} out of range`,
                        suggestion: 'list_regex 또는 GET /regex 로 유효한 index를 다시 확인하세요.',
                        target: `regex:${idx}`,
                    });
                }
                const body = await readJsonBody(req, res, `regex/${idx}`, broadcastStatus);
                if (!body)
                    return;
                const entryName = currentData.regex[idx].comment || `regex_${idx}`;
                const allowed = await deps.askRendererConfirm('MCP 수정 요청', `AI 어시스턴트가 정규식 항목 "${entryName}" (index ${idx})을 수정하려 합니다.\n현재 에디터에서 수정 중인 내용이 덮어씌워질 수 있습니다.`);
                if (allowed) {
                    Object.assign(currentData.regex[idx], body);
                    const entry = currentData.regex[idx];
                    if (body.find !== undefined && body.in === undefined)
                        entry.in = body.find;
                    if (body.in !== undefined && body.find === undefined)
                        entry.find = body.in;
                    if (body.replace !== undefined && body.out === undefined)
                        entry.out = body.replace;
                    if (body.out !== undefined && body.replace === undefined)
                        entry.replace = body.out;
                    logMcpMutation('update regex entry', `regex:${idx}`, { entryName, updatedKeys: Object.keys(body) });
                    deps.broadcastToAll('data-updated', 'regex', currentData.regex);
                    return jsonRes(res, { success: true, index: idx });
                }
                else {
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
                if (!body)
                    return;
                const name = body.comment || '새 정규식';
                const allowed = await deps.askRendererConfirm('MCP 추가 요청', `AI 어시스턴트가 새 정규식 항목 "${name}"을(를) 추가하려 합니다.`);
                if (allowed) {
                    const entry = Object.assign({
                        comment: '', type: 'editoutput', find: '', replace: '', flag: 'g',
                    }, body);
                    if (entry.find && !entry.in)
                        entry.in = entry.find;
                    if (entry.in && !entry.find)
                        entry.find = entry.in;
                    if (entry.replace && !entry.out)
                        entry.out = entry.replace;
                    if (entry.out && !entry.replace)
                        entry.replace = entry.out;
                    if (!currentData.regex)
                        currentData.regex = [];
                    currentData.regex.push(entry);
                    logMcpMutation('add regex entry', 'regex:add', { entryName: name, newIndex: currentData.regex.length - 1 });
                    deps.broadcastToAll('data-updated', 'regex', currentData.regex);
                    return jsonRes(res, { success: true, index: currentData.regex.length - 1 });
                }
                else {
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
            // POST /regex/:idx/delete
            // ----------------------------------------------------------------
            if (parts[0] === 'regex' && parts[2] === 'delete' && req.method === 'POST') {
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= (currentData.regex || []).length) {
                    return mcpError(res, 400, {
                        action: 'delete regex entry',
                        message: `Index ${idx} out of range`,
                        suggestion: 'list_regex 또는 GET /regex 로 유효한 index를 다시 확인하세요.',
                        target: `regex:${idx}`,
                    });
                }
                const entryName = currentData.regex[idx].comment || `regex_${idx}`;
                const allowed = await deps.askRendererConfirm('MCP 삭제 요청', `AI 어시스턴트가 정규식 항목 "${entryName}" (index ${idx})을 삭제하려 합니다.`);
                if (allowed) {
                    currentData.regex.splice(idx, 1);
                    logMcpMutation('delete regex entry', `regex:${idx}`, { entryName });
                    deps.broadcastToAll('data-updated', 'regex', currentData.regex);
                    return jsonRes(res, { success: true, deleted: idx });
                }
                else {
                    return mcpError(res, 403, {
                        action: 'delete regex entry',
                        message: '사용자가 거부했습니다',
                        rejected: true,
                        suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
                        target: `regex:${idx}`,
                    });
                }
            }
            // ----------------------------------------------------------------
            // GET /lua — list Lua sections
            // ----------------------------------------------------------------
            if (parts[0] === 'lua' && !parts[1] && req.method === 'GET') {
                const sections = luaCache.get(currentData.lua);
                const result = sections.map((s, i) => ({
                    index: i, name: s.name, contentSize: s.content.length,
                }));
                return jsonRes(res, { count: result.length, sections: result });
            }
            // ----------------------------------------------------------------
            // GET /lua/:idx — read Lua section
            // ----------------------------------------------------------------
            if (parts[0] === 'lua' && parts[1] && req.method === 'GET') {
                const sections = luaCache.get(currentData.lua);
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= sections.length) {
                    return jsonRes(res, { error: `Lua section index ${idx} out of range (0-${sections.length - 1})` }, 400);
                }
                return jsonRes(res, { index: idx, name: sections[idx].name, content: sections[idx].content });
            }
            // ----------------------------------------------------------------
            // POST /lua/:idx — write Lua section
            // ----------------------------------------------------------------
            if (parts[0] === 'lua' && parts[1] && !parts[2] && req.method === 'POST') {
                const sections = luaCache.get(currentData.lua);
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= sections.length) {
                    return mcpError(res, 400, {
                        action: 'write lua section',
                        message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
                        suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
                        target: `lua:${idx}`,
                    });
                }
                const body = await readJsonBody(req, res, `lua/${idx}`, broadcastStatus);
                if (!body)
                    return;
                if (body.content === undefined) {
                    return mcpError(res, 400, {
                        action: 'write lua section',
                        message: 'Missing "content"',
                        suggestion: 'content 필드를 포함한 요청 본문을 보내세요.',
                        target: `lua:${idx}`,
                    });
                }
                const sectionName = sections[idx].name;
                const oldSize = sections[idx].content.length;
                const newSize = body.content.length;
                const allowed = await deps.askRendererConfirm('MCP 수정 요청', `AI 어시스턴트가 Lua 섹션 "${sectionName}" (index ${idx})을 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`);
                if (allowed) {
                    const sepLines = body.content.split('\n').filter((l) => deps.detectLuaSection(l) !== null);
                    let warning;
                    if (sepLines.length > 0) {
                        warning = `주의: 내용에 섹션 구분자 패턴이 ${sepLines.length}건 포함되어 있습니다. 의도치 않은 섹션 분할이 발생할 수 있습니다.`;
                    }
                    sections[idx].content = body.content;
                    currentData.lua = deps.combineLuaSections(sections);
                    logMcpMutation('write lua section', `lua:${idx}`, { sectionName, oldSize, newSize });
                    deps.broadcastToAll('data-updated', 'lua', currentData.lua);
                    return jsonRes(res, { success: true, index: idx, name: sectionName, size: newSize, warning });
                }
                else {
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
            // POST /lua/:idx/replace
            // ----------------------------------------------------------------
            if (parts[0] === 'lua' && parts[1] && parts[2] === 'replace' && req.method === 'POST') {
                const sections = luaCache.get(currentData.lua);
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= sections.length) {
                    return mcpError(res, 400, {
                        action: 'replace lua section content',
                        message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
                        suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
                        target: `lua:${idx}`,
                    });
                }
                const body = await readJsonBody(req, res, `lua/${idx}/replace`, broadcastStatus);
                if (!body)
                    return;
                if (!body.find) {
                    return mcpError(res, 400, {
                        action: 'replace lua section content',
                        message: 'Missing "find"',
                        suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
                        target: `lua:${idx}`,
                    });
                }
                const sectionName = sections[idx].name;
                const content = sections[idx].content;
                const findStr = body.find;
                const replaceStr = body.replace !== undefined ? body.replace : '';
                const useRegex = !!body.regex;
                const flags = body.flags || 'g';
                let newContent;
                let matchCount;
                if (useRegex) {
                    const re = new RegExp(findStr, flags);
                    const matches = content.match(re);
                    matchCount = matches ? matches.length : 0;
                    newContent = content.replace(re, replaceStr);
                }
                else {
                    matchCount = 0;
                    let searchFrom = 0;
                    while (true) {
                        const pos = content.indexOf(findStr, searchFrom);
                        if (pos === -1)
                            break;
                        matchCount++;
                        searchFrom = pos + findStr.length;
                    }
                    newContent = content.split(findStr).join(replaceStr);
                }
                if (matchCount === 0) {
                    return jsonRes(res, { success: false, message: '일치하는 항목 없음', matchCount: 0 });
                }
                const allowed = await deps.askRendererConfirm('MCP 치환 요청', `AI 어시스턴트가 Lua 섹션 "${sectionName}" (index ${idx})에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`);
                if (allowed) {
                    sections[idx].content = newContent;
                    currentData.lua = deps.combineLuaSections(sections);
                    logMcpMutation('replace lua section content', `lua:${idx}`, { sectionName, matchCount });
                    deps.broadcastToAll('data-updated', 'lua', currentData.lua);
                    return jsonRes(res, { success: true, index: idx, name: sectionName, matchCount, oldSize: content.length, newSize: newContent.length });
                }
                else {
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
                if (idx < 0 || idx >= sections.length) {
                    return mcpError(res, 400, {
                        action: 'insert lua section content',
                        message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
                        suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
                        target: `lua:${idx}`,
                    });
                }
                const body = await readJsonBody(req, res, `lua/${idx}/insert`, broadcastStatus);
                if (!body)
                    return;
                if (body.content === undefined) {
                    return mcpError(res, 400, {
                        action: 'insert lua section content',
                        message: 'Missing "content"',
                        suggestion: '삽입할 content를 요청 본문에 포함하세요.',
                        target: `lua:${idx}`,
                    });
                }
                const sectionName = sections[idx].name;
                const oldContent = sections[idx].content;
                let newContent;
                const position = body.position || 'end';
                if (position === 'end') {
                    newContent = oldContent + '\n' + body.content;
                }
                else if (position === 'start') {
                    newContent = body.content + '\n' + oldContent;
                }
                else if ((position === 'after' || position === 'before') && body.anchor) {
                    const anchorPos = oldContent.indexOf(body.anchor);
                    if (anchorPos === -1) {
                        return jsonRes(res, { success: false, message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}` });
                    }
                    if (position === 'after') {
                        const insertAt = anchorPos + body.anchor.length;
                        newContent = oldContent.slice(0, insertAt) + '\n' + body.content + oldContent.slice(insertAt);
                    }
                    else {
                        newContent = oldContent.slice(0, anchorPos) + body.content + '\n' + oldContent.slice(anchorPos);
                    }
                }
                else {
                    return jsonRes(res, { error: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다' }, 400);
                }
                const preview = body.content.substring(0, 100) + (body.content.length > 100 ? '...' : '');
                const allowed = await deps.askRendererConfirm('MCP 삽입 요청', `AI 어시스턴트가 Lua 섹션 "${sectionName}" (index ${idx})에 코드를 삽입하려 합니다.\n위치: ${position}${body.anchor ? ' "' + body.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`);
                if (allowed) {
                    const separatorLines = newContent.split('\n').filter(l => deps.detectLuaSection(l) !== null && !oldContent.includes(l));
                    let warning = '';
                    if (separatorLines.length > 0) {
                        for (const sepLine of separatorLines) {
                            const escaped = sepLine.replace(/={3,}/g, m => m.slice(0, 2) + '·' + m.slice(3));
                            newContent = newContent.replace(sepLine, escaped);
                        }
                        warning = ` (경고: 섹션 구분자 ${separatorLines.length}건을 이스케이프 처리했습니다)`;
                    }
                    sections[idx].content = newContent;
                    currentData.lua = deps.combineLuaSections(sections);
                    logMcpMutation('insert lua section content', `lua:${idx}`, { sectionName, position, oldSize: oldContent.length, newSize: newContent.length });
                    deps.broadcastToAll('data-updated', 'lua', currentData.lua);
                    return jsonRes(res, { success: true, index: idx, name: sectionName, position, oldSize: oldContent.length, newSize: newContent.length, warning: warning || undefined });
                }
                else {
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
                const result = sections.map((s, i) => ({
                    index: i, name: s.name, contentSize: s.content.length,
                }));
                return jsonRes(res, { count: result.length, sections: result });
            }
            // ----------------------------------------------------------------
            // GET /css-section/:idx — read CSS section
            // ----------------------------------------------------------------
            if (parts[0] === 'css-section' && parts[1] && !parts[2] && req.method === 'GET') {
                const { sections } = cssCache.get(currentData.css);
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= sections.length) {
                    return jsonRes(res, { error: `CSS section index ${idx} out of range (0-${sections.length - 1})` }, 400);
                }
                return jsonRes(res, { index: idx, name: sections[idx].name, content: sections[idx].content });
            }
            // ----------------------------------------------------------------
            // POST /css-section/:idx — write CSS section
            // ----------------------------------------------------------------
            if (parts[0] === 'css-section' && parts[1] && !parts[2] && req.method === 'POST') {
                const { sections, prefix, suffix } = cssCache.get(currentData.css);
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= sections.length) {
                    return mcpError(res, 400, {
                        action: 'write css section',
                        message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
                        suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
                        target: `css-section:${idx}`,
                    });
                }
                const body = await readJsonBody(req, res, `css-section/${idx}`, broadcastStatus);
                if (!body)
                    return;
                if (body.content === undefined) {
                    return mcpError(res, 400, {
                        action: 'write css section',
                        message: 'Missing "content"',
                        suggestion: 'content 필드를 포함한 요청 본문을 보내세요.',
                        target: `css-section:${idx}`,
                    });
                }
                const sectionName = sections[idx].name;
                const oldSize = sections[idx].content.length;
                const newSize = body.content.length;
                const allowed = await deps.askRendererConfirm('MCP 수정 요청', `AI 어시스턴트가 CSS 섹션 "${sectionName}" (index ${idx})을 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`);
                if (allowed) {
                    sections[idx].content = body.content;
                    currentData.css = deps.combineCssSections(sections, prefix, suffix);
                    logMcpMutation('write css section', `css-section:${idx}`, { sectionName, oldSize, newSize });
                    deps.broadcastToAll('data-updated', 'css', currentData.css);
                    return jsonRes(res, { success: true, index: idx, name: sectionName, size: newSize });
                }
                else {
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
            // POST /css-section/:idx/replace
            // ----------------------------------------------------------------
            if (parts[0] === 'css-section' && parts[1] && parts[2] === 'replace' && req.method === 'POST') {
                const { sections, prefix, suffix } = cssCache.get(currentData.css);
                const idx = parseInt(parts[1], 10);
                if (idx < 0 || idx >= sections.length) {
                    return mcpError(res, 400, {
                        action: 'replace css section content',
                        message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
                        suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
                        target: `css-section:${idx}`,
                    });
                }
                const body = await readJsonBody(req, res, `css-section/${idx}/replace`, broadcastStatus);
                if (!body)
                    return;
                if (!body.find) {
                    return mcpError(res, 400, {
                        action: 'replace css section content',
                        message: 'Missing "find"',
                        suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
                        target: `css-section:${idx}`,
                    });
                }
                const sectionName = sections[idx].name;
                const content = sections[idx].content;
                const findStr = body.find;
                const replaceStr = body.replace !== undefined ? body.replace : '';
                const useRegex = !!body.regex;
                const flags = body.flags || 'g';
                let newContent;
                let matchCount;
                if (useRegex) {
                    const re = new RegExp(findStr, flags);
                    const matches = content.match(re);
                    matchCount = matches ? matches.length : 0;
                    newContent = content.replace(re, replaceStr);
                }
                else {
                    matchCount = 0;
                    let searchFrom = 0;
                    while (true) {
                        const pos = content.indexOf(findStr, searchFrom);
                        if (pos === -1)
                            break;
                        matchCount++;
                        searchFrom = pos + findStr.length;
                    }
                    newContent = content.split(findStr).join(replaceStr);
                }
                if (matchCount === 0) {
                    return jsonRes(res, { success: false, message: '일치하는 항목 없음', matchCount: 0 });
                }
                const allowed = await deps.askRendererConfirm('MCP 치환 요청', `AI 어시스턴트가 CSS 섹션 "${sectionName}" (index ${idx})에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`);
                if (allowed) {
                    sections[idx].content = newContent;
                    currentData.css = deps.combineCssSections(sections, prefix, suffix);
                    logMcpMutation('replace css section content', `css-section:${idx}`, { sectionName, matchCount });
                    deps.broadcastToAll('data-updated', 'css', currentData.css);
                    return jsonRes(res, { success: true, index: idx, name: sectionName, matchCount, oldSize: content.length, newSize: newContent.length });
                }
                else {
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
                if (idx < 0 || idx >= sections.length) {
                    return mcpError(res, 400, {
                        action: 'insert css section content',
                        message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
                        suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
                        target: `css-section:${idx}`,
                    });
                }
                const body = await readJsonBody(req, res, `css-section/${idx}/insert`, broadcastStatus);
                if (!body)
                    return;
                if (body.content === undefined) {
                    return mcpError(res, 400, {
                        action: 'insert css section content',
                        message: 'Missing "content"',
                        suggestion: '삽입할 content를 요청 본문에 포함하세요.',
                        target: `css-section:${idx}`,
                    });
                }
                const sectionName = sections[idx].name;
                const oldContent = sections[idx].content;
                let newContent;
                const position = body.position || 'end';
                if (position === 'end') {
                    newContent = oldContent + '\n' + body.content;
                }
                else if (position === 'start') {
                    newContent = body.content + '\n' + oldContent;
                }
                else if ((position === 'after' || position === 'before') && body.anchor) {
                    const anchorPos = oldContent.indexOf(body.anchor);
                    if (anchorPos === -1) {
                        return jsonRes(res, { success: false, message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}` });
                    }
                    if (position === 'after') {
                        const insertAt = anchorPos + body.anchor.length;
                        newContent = oldContent.slice(0, insertAt) + '\n' + body.content + oldContent.slice(insertAt);
                    }
                    else {
                        newContent = oldContent.slice(0, anchorPos) + body.content + '\n' + oldContent.slice(anchorPos);
                    }
                }
                else {
                    return jsonRes(res, { error: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다' }, 400);
                }
                const preview = body.content.substring(0, 100) + (body.content.length > 100 ? '...' : '');
                const allowed = await deps.askRendererConfirm('MCP 삽입 요청', `AI 어시스턴트가 CSS 섹션 "${sectionName}" (index ${idx})에 코드를 삽입하려 합니다.\n위치: ${position}${body.anchor ? ' "' + body.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`);
                if (allowed) {
                    const newLines = newContent.split('\n');
                    let warning = '';
                    let escapedCount = 0;
                    for (let li = 0; li < newLines.length; li++) {
                        const line = newLines[li];
                        if (oldContent.includes(line))
                            continue;
                        if (deps.detectCssSectionInline(line) !== null || deps.detectCssBlockOpen(line) || deps.detectCssBlockClose(line)) {
                            newLines[li] = line.replace(/={3,}/g, m => m.slice(0, 2) + '·' + m.slice(3));
                            escapedCount++;
                        }
                    }
                    if (escapedCount > 0) {
                        newContent = newLines.join('\n');
                        warning = ` (경고: CSS 섹션 구분자 ${escapedCount}건을 이스케이프 처리했습니다)`;
                    }
                    sections[idx].content = newContent;
                    currentData.css = deps.combineCssSections(sections, prefix, suffix);
                    logMcpMutation('insert css section content', `css-section:${idx}`, { sectionName, position, oldSize: oldContent.length, newSize: newContent.length });
                    deps.broadcastToAll('data-updated', 'css', currentData.css);
                    return jsonRes(res, { success: true, index: idx, name: sectionName, position, oldSize: oldContent.length, newSize: newContent.length, warning: warning || undefined });
                }
                else {
                    return mcpError(res, 403, {
                        action: 'insert css section content',
                        message: '사용자가 거부했습니다',
                        rejected: true,
                        suggestion: '앱에서 삽입 요청을 허용한 뒤 다시 시도하세요.',
                        target: `css-section:${idx}`,
                    });
                }
            }
            // ----------------------------------------------------------------
            // GET /references — list loaded reference files
            // ----------------------------------------------------------------
            if (parts[0] === 'references' && !parts[1] && req.method === 'GET') {
                const refFiles = deps.getReferenceFiles();
                const refs = refFiles.map((r, i) => {
                    const fields = [];
                    for (const f of ['lua', 'globalNote', 'firstMessage', 'css', 'description', 'defaultVariables']) {
                        if (r.data[f])
                            fields.push({ name: f, size: r.data[f].length });
                    }
                    if (r.data.triggerScripts && r.data.triggerScripts !== '[]')
                        fields.push({ name: 'triggerScripts', size: r.data.triggerScripts.length });
                    if (r.data.alternateGreetings?.length)
                        fields.push({ name: 'alternateGreetings', count: r.data.alternateGreetings.length, type: 'array' });
                    if (r.data.groupOnlyGreetings?.length)
                        fields.push({ name: 'groupOnlyGreetings', count: r.data.groupOnlyGreetings.length, type: 'array' });
                    if (r.data.lorebook?.length)
                        fields.push({ name: 'lorebook', count: r.data.lorebook.length, type: 'array' });
                    if (r.data.regex?.length)
                        fields.push({ name: 'regex', count: r.data.regex.length, type: 'array' });
                    return { index: i, fileName: r.fileName, fields };
                });
                return jsonRes(res, { count: refs.length, references: refs });
            }
            // ----------------------------------------------------------------
            // GET /reference/:idx/:field — read a reference file's field
            // ----------------------------------------------------------------
            if (parts[0] === 'reference' && parts[1] && parts[2] && req.method === 'GET') {
                const refFiles = deps.getReferenceFiles();
                const idx = parseInt(parts[1], 10);
                const fieldName = decodeURIComponent(parts[2]);
                if (idx < 0 || idx >= refFiles.length) {
                    return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
                }
                const ref = refFiles[idx];
                if (fieldName === 'lorebook') {
                    return jsonRes(res, { index: idx, fileName: ref.fileName, field: 'lorebook', content: ref.data.lorebook || [] });
                }
                if (fieldName === 'regex') {
                    return jsonRes(res, { index: idx, fileName: ref.fileName, field: 'regex', content: ref.data.regex || [] });
                }
                if (fieldName === 'triggerScripts') {
                    return jsonRes(res, { index: idx, fileName: ref.fileName, field: 'triggerScripts', content: ref.data.triggerScripts || '[]' });
                }
                if (fieldName === 'alternateGreetings' || fieldName === 'groupOnlyGreetings') {
                    return jsonRes(res, { index: idx, fileName: ref.fileName, field: fieldName, content: ref.data[fieldName] || [] });
                }
                const allowedRefFields = ['lua', 'globalNote', 'firstMessage', 'css', 'description', 'defaultVariables', 'name'];
                if (!allowedRefFields.includes(fieldName)) {
                    return jsonRes(res, { error: `Unknown field: ${fieldName}` }, 400);
                }
                return jsonRes(res, { index: idx, fileName: ref.fileName, field: fieldName, content: ref.data[fieldName] || '' });
            }
            // ----------------------------------------------------------------
            // 404 fallback
            // ----------------------------------------------------------------
            mcpError(res, 404, {
                action: `${req.method} ${url.pathname}`,
                message: 'Not found',
                suggestion: '지원되는 MCP 엔드포인트 경로를 다시 확인하세요.',
                target: url.pathname,
            });
        }
        catch (err) {
            mcpError(res, 500, {
                action: `${req.method} ${url.pathname}`,
                message: err.message,
                suggestion: '요청 payload와 현재 열려 있는 데이터를 확인한 뒤 다시 시도하세요.',
                target: url.pathname,
            }, err);
        }
    });
    server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        console.log(`[main] MCP API server on 127.0.0.1:${port}`);
        deps.onListening(port);
    });
    return {
        server,
        token,
        invalidateSectionCaches() {
            luaCache.invalidate();
            cssCache.invalidate();
        },
    };
}
