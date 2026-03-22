import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Section {
  name: string;
  content: string;
}

export interface CssCacheEntry {
  sections: Section[];
  prefix: string;
  suffix: string;
}

export interface McpApiDeps {
  /** Return the current in-memory document data (mutated directly by routes). */
  getCurrentData: () => any;
  /** Return the loaded reference files array. */
  getReferenceFiles: () => any[];
  /** Show a confirmation dialog in the renderer and resolve with the user's choice. */
  askRendererConfirm: (title: string, message: string) => Promise<boolean>;
  /** Broadcast an IPC message to all windows (main + popouts). */
  broadcastToAll: (channel: string, ...args: any[]) => void;
  /** Broadcast an MCP status event to the renderer. */
  broadcastMcpStatus: (payload: Record<string, unknown>) => void;
  /** Called once the HTTP server begins listening, providing the assigned port. */
  onListening: (port: number) => void;
  /** Invalidate the cached assets map (call after mutating data.assets). */
  invalidateAssetsMapCache?: () => void;

  // Section parsing
  parseLuaSections: (lua: string) => Section[];
  combineLuaSections: (sections: Section[]) => string;
  detectLuaSection: (line: string) => string | null;
  parseCssSections: (css: string) => CssCacheEntry;
  combineCssSections: (sections: Section[], prefix: string, suffix: string) => string;
  detectCssSectionInline: (line: string) => string | null;
  detectCssBlockOpen: (line: string) => boolean;
  detectCssBlockClose: (line: string) => boolean;

  // charx-io helpers
  normalizeTriggerScripts: (data: any) => any;
  extractPrimaryLua: (scripts: any) => string;
  mergePrimaryLua: (scripts: any, lua: string) => any;
  stringifyTriggerScripts: (scripts: any) => string;

  // skills directory
  getSkillsDir: () => string;
}

export interface McpApiServer {
  server: http.Server;
  token: string;
  /** Force-invalidate the internal Lua / CSS section caches. */
  invalidateSectionCaches: () => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk: Buffer | string) => {
      bytes += Buffer.byteLength(chunk as string);
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`));
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** Extract name and description from YAML frontmatter (--- delimited). */
function parseYamlFrontmatter(raw: string): { name: string; description: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { name: '', description: '' };
  const block = m[1];
  const nameMatch = block.match(/^name:\s*"?([^"\n]*)"?\s*$/m);
  const descMatch = block.match(/^description:\s*"((?:[^"\\]|\\.)*)"\s*$/m) || block.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : '',
  };
}

function jsonRes(res: http.ServerResponse, data: unknown, status?: number): void {
  res.writeHead(status || 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function logMcpMutation(action: string, target: string, details: Record<string, unknown>): void {
  console.log(`[main][mcp] ${action}:`, { target, ...details });
}

interface McpErrorInfo {
  action: string;
  target: string;
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
  rejected?: boolean;
}

function jsonMcpError(
  res: http.ServerResponse,
  status: number,
  info: McpErrorInfo,
  broadcastStatus: (payload: Record<string, unknown>) => void,
  error?: unknown,
): void {
  const payload: Record<string, unknown> = {
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
  } else {
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

async function readJsonBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  context: string,
  broadcastStatus: (payload: Record<string, unknown>) => void,
): Promise<Record<string, any> | null> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (sizeError) {
    jsonMcpError(
      res,
      413,
      {
        action: `${context} request`,
        message: '요청 본문이 너무 큽니다 (최대 10MB).',
        suggestion: '본문 크기를 줄여서 다시 시도하세요.',
        target: context,
      },
      broadcastStatus,
      sizeError,
    );
    return null;
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    jsonMcpError(
      res,
      400,
      {
        action: `${context} request`,
        message: '요청 본문 JSON이 올바르지 않습니다.',
        suggestion: '유효한 JSON 객체를 다시 보내세요.',
        details: { bodyLength: raw.length },
        target: context,
      },
      broadcastStatus,
      error,
    );
    return null;
  }
}

// Allowed fields for lorebook/regex entries — prevents prototype pollution
const LOREBOOK_ALLOWED_FIELDS = new Set([
  'key',
  'secondkey',
  'comment',
  'content',
  'mode',
  'insertorder',
  'order',
  'priority',
  'alwaysActive',
  'forceActivation',
  'selective',
  'constant',
  'useRegex',
  'folder',
  'extentions',
  'id',
]);

const REGEX_ALLOWED_FIELDS = new Set(['comment', 'type', 'find', 'replace', 'in', 'out', 'flag', 'ableFlag']);

function pickAllowedFields(source: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (allowed.has(key)) result[key] = source[key];
  }
  return result;
}

/** RisuAI expects lowercase regex types (editdisplay, editoutput, etc.) */
function normalizeRegexType(entry: Record<string, unknown>): void {
  if (typeof entry.type === 'string') entry.type = entry.type.toLowerCase();
}

// ---------------------------------------------------------------------------
// Section caching (mirrors the hot-path cache from main.js)
// ---------------------------------------------------------------------------

interface SectionCacheState<T> {
  source: string | null;
  result: T | null;
}

function createLuaCache(parse: (lua: string) => Section[]): { get(lua: string): Section[]; invalidate(): void } {
  const cache: SectionCacheState<Section[]> = { source: null, result: null };
  return {
    get(lua: string): Section[] {
      if (lua !== cache.source) {
        cache.source = lua;
        cache.result = parse(lua);
      }
      // Return deep copy so callers can mutate safely
      return cache.result!.map((s) => ({ name: s.name, content: s.content }));
    },
    invalidate() {
      cache.source = null;
      cache.result = null;
    },
  };
}

function createCssCache(parse: (css: string) => CssCacheEntry): {
  get(css: string): CssCacheEntry;
  invalidate(): void;
} {
  const cache: SectionCacheState<CssCacheEntry> = { source: null, result: null };
  return {
    get(css: string): CssCacheEntry {
      if (css !== cache.source) {
        cache.source = css;
        cache.result = parse(css);
      }
      // Return deep copy of sections
      return {
        sections: cache.result!.sections.map((s) => ({ name: s.name, content: s.content })),
        prefix: cache.result!.prefix,
        suffix: cache.result!.suffix,
      };
    },
    invalidate() {
      cache.source = null;
      cache.result = null;
    },
  };
}

// ---------------------------------------------------------------------------
// startApiServer
// ---------------------------------------------------------------------------

export function startApiServer(deps: McpApiDeps): McpApiServer {
  const token = crypto.randomBytes(32).toString('hex');
  const luaCache = createLuaCache(deps.parseLuaSections);
  const cssCache = createCssCache(deps.parseCssSections);

  const broadcastStatus = deps.broadcastMcpStatus;

  // Mutex map to prevent parallel write conflicts on the same field
  const fieldWriteMutex = new Map<string, Promise<void>>();
  function acquireFieldMutex(fieldName: string): Promise<() => void> {
    const prev = fieldWriteMutex.get(fieldName) || Promise.resolve();
    let releaseFn: () => void;
    const next = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });
    fieldWriteMutex.set(
      fieldName,
      prev.then(() => next),
    );
    return prev.then(() => releaseFn!);
  }

  // Shorthand to emit an MCP error response
  function mcpError(res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown): void {
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

    const url = new URL(req.url!, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      // ----------------------------------------------------------------
      // GET /fields
      // ----------------------------------------------------------------
      if (req.method === 'GET' && parts[0] === 'fields' && !parts[1]) {
        const fileType = currentData._fileType || 'charx';
        const isRisum = fileType === 'risum';
        const isRisup = fileType === 'risup';
        const isCharx = !isRisum && !isRisup;

        const fieldNames = [
          'name',
          'description',
          'firstMessage',
          'globalNote',
          'css',
          'defaultVariables',
          'triggerScripts',
          'lua',
        ];
        const fields: Record<string, unknown>[] = fieldNames.map((f) => {
          const val =
            f === 'triggerScripts' ? deps.stringifyTriggerScripts(currentData.triggerScripts) : currentData[f] || '';
          const len = typeof val === 'string' ? val.length : String(val).length;
          return {
            name: f,
            size: len,
            sizeKB: (len / 1024).toFixed(1) + 'KB',
          };
        });
        fields.push({
          name: 'alternateGreetings',
          count: (currentData.alternateGreetings || []).length,
          type: 'array',
        });
        fields.push({
          name: 'groupOnlyGreetings',
          count: (currentData.groupOnlyGreetings || []).length,
          type: 'array',
        });
        fields.push({ name: 'lorebook', count: (currentData.lorebook || []).length, type: 'array' });
        fields.push({ name: 'regex', count: (currentData.regex || []).length, type: 'array' });

        // Charx card.data fields
        if (isCharx) {
          const charxStringFields = [
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
          ];
          for (const f of charxStringFields) {
            fields.push({ name: f, size: ((currentData[f] as string) || '').length, type: 'string' });
          }
          fields.push({ name: 'tags', count: (currentData.tags || []).length, type: 'array' });
          fields.push({ name: 'source', count: (currentData.source || []).length, type: 'array' });
          fields.push({ name: 'creationDate', value: currentData.creationDate ?? 0, type: 'number (read-only)' });
          fields.push({
            name: 'modificationDate',
            value: currentData.modificationDate ?? 0,
            type: 'number (read-only)',
          });
        }

        // Risum module-specific fields
        if (isRisum) {
          const risumStringFields = [
            'cjs',
            'backgroundEmbedding',
            'moduleNamespace',
            'customModuleToggle',
            'mcpUrl',
            'moduleId',
            'moduleName',
            'moduleDescription',
          ];
          for (const f of risumStringFields) {
            fields.push({ name: f, size: ((currentData[f] as string) || '').length, type: 'string' });
          }
          fields.push({ name: 'lowLevelAccess', value: !!currentData.lowLevelAccess, type: 'boolean' });
          fields.push({ name: 'hideIcon', value: !!currentData.hideIcon, type: 'boolean' });
        }

        // Risup preset-specific fields
        if (isRisup) {
          const risupStringFields = [
            'mainPrompt',
            'jailbreak',
            'aiModel',
            'subModel',
            'apiType',
            'promptTemplate',
            'presetBias',
            'formatingOrder',
            'presetImage',
            'thinkingType',
            'adaptiveThinkingEffort',
            'instructChatTemplate',
            'JinjaTemplate',
            'customPromptTemplateToggle',
            'templateDefaultVariables',
            'moduleIntergration',
            'jsonSchema',
            'extractJson',
            'groupTemplate',
            'groupOtherBotRole',
            'autoSuggestPrompt',
            'autoSuggestPrefix',
            'localStopStrings',
            'systemContentReplacement',
            'systemRoleReplacement',
          ];
          for (const f of risupStringFields) {
            fields.push({ name: f, size: ((currentData[f] as string) || '').length, type: 'string' });
          }
          const risupNumberFields = [
            'temperature',
            'maxContext',
            'maxResponse',
            'frequencyPenalty',
            'presencePenalty',
            'top_p',
            'top_k',
            'repetition_penalty',
            'min_p',
            'top_a',
            'reasonEffort',
            'thinkingTokens',
            'verbosity',
          ];
          for (const f of risupNumberFields) {
            fields.push({ name: f, value: currentData[f] ?? 0, type: 'number' });
          }
          const risupBoolFields = [
            'promptPreprocess',
            'useInstructPrompt',
            'jsonSchemaEnabled',
            'strictJsonSchema',
            'autoSuggestClean',
            'outputImageModal',
            'fallbackWhenBlankResponse',
          ];
          for (const f of risupBoolFields) {
            fields.push({ name: f, value: !!currentData[f], type: 'boolean' });
          }
        }

        return jsonRes(res, { fileType, fields });
      }

      // ----------------------------------------------------------------
      // GET/POST /field/:name
      // ----------------------------------------------------------------
      const fieldReservedPaths = ['batch', 'export'];
      if (parts[0] === 'field' && parts[1] && !parts[2] && !fieldReservedPaths.includes(parts[1])) {
        const fieldName = decodeURIComponent(parts[1]);
        const allowedFields = [
          'name',
          'description',
          'firstMessage',
          'alternateGreetings',
          'groupOnlyGreetings',
          'globalNote',
          'css',
          'defaultVariables',
          'triggerScripts',
          'lua',
        ];
        // Charx card.data fields (additional character metadata)
        const charxFields = [
          'personality',
          'scenario',
          'creatorcomment',
          'tags',
          'exampleMessage',
          'systemPrompt',
          'creator',
          'characterVersion',
          'nickname',
          'source',
          'additionalText',
          'license',
        ];
        const charxReadOnlyFields = ['creationDate', 'modificationDate'];
        const risumFields = [
          'cjs',
          'lowLevelAccess',
          'hideIcon',
          'backgroundEmbedding',
          'moduleNamespace',
          'customModuleToggle',
          'mcpUrl',
          'moduleName',
          'moduleDescription',
        ];
        const risumReadOnlyFields = ['moduleId'];
        const risupFields = [
          // Basic
          'mainPrompt',
          'jailbreak',
          'temperature',
          'maxContext',
          'maxResponse',
          'frequencyPenalty',
          'presencePenalty',
          'aiModel',
          'subModel',
          'apiType',
          'promptPreprocess',
          'promptTemplate',
          'presetBias',
          'formatingOrder',
          'presetImage',
          // Sampling
          'top_p',
          'top_k',
          'repetition_penalty',
          'min_p',
          'top_a',
          // Thinking / reasoning
          'reasonEffort',
          'thinkingTokens',
          'thinkingType',
          'adaptiveThinkingEffort',
          // Templates & formatting
          'useInstructPrompt',
          'instructChatTemplate',
          'JinjaTemplate',
          'customPromptTemplateToggle',
          'templateDefaultVariables',
          'moduleIntergration',
          // JSON schema
          'jsonSchemaEnabled',
          'jsonSchema',
          'strictJsonSchema',
          'extractJson',
          // Group & misc
          'groupTemplate',
          'groupOtherBotRole',
          'autoSuggestPrompt',
          'autoSuggestPrefix',
          'autoSuggestClean',
          'localStopStrings',
          'outputImageModal',
          'verbosity',
          'fallbackWhenBlankResponse',
          'systemContentReplacement',
          'systemRoleReplacement',
        ];
        const isRisum = (currentData._fileType || 'charx') === 'risum';
        const isRisup = (currentData._fileType || 'charx') === 'risup';
        const isCharx = !isRisum && !isRisup;
        const allReadOnly = [...(isRisum ? risumReadOnlyFields : []), ...(isCharx ? charxReadOnlyFields : [])];
        const allAllowed = [
          ...allowedFields,
          ...(isCharx ? [...charxFields, ...charxReadOnlyFields] : []),
          ...(isRisum ? [...risumFields, ...risumReadOnlyFields] : []),
          ...(isRisup ? risupFields : []),
        ];

        if (!allAllowed.includes(fieldName)) {
          const hint = isRisum
            ? '(risum 필드 포함)'
            : isRisup
              ? '(risup 프리셋 필드 포함)'
              : '(charx 파일에서는 risum/risup 전용 필드를 사용할 수 없습니다)';
          return jsonRes(res, { error: `Unknown field: ${fieldName} ${hint}` }, 400);
        }

        if (req.method === 'GET') {
          if (fieldName === 'triggerScripts') {
            return jsonRes(res, {
              field: fieldName,
              content: deps.stringifyTriggerScripts(currentData.triggerScripts),
            });
          }
          // Array fields
          if (['alternateGreetings', 'groupOnlyGreetings', 'tags', 'source'].includes(fieldName)) {
            return jsonRes(res, { field: fieldName, content: currentData[fieldName] || [] });
          }
          // Boolean fields
          const boolFields = [
            'lowLevelAccess',
            'hideIcon',
            'promptPreprocess',
            'useInstructPrompt',
            'jsonSchemaEnabled',
            'strictJsonSchema',
            'autoSuggestClean',
            'outputImageModal',
            'fallbackWhenBlankResponse',
          ];
          if (boolFields.includes(fieldName)) {
            return jsonRes(res, { field: fieldName, content: !!currentData[fieldName], type: 'boolean' });
          }
          // Number fields
          const numFields = [
            'temperature',
            'maxContext',
            'maxResponse',
            'frequencyPenalty',
            'presencePenalty',
            'top_p',
            'top_k',
            'repetition_penalty',
            'min_p',
            'top_a',
            'reasonEffort',
            'thinkingTokens',
            'verbosity',
            'creationDate',
            'modificationDate',
          ];
          if (numFields.includes(fieldName)) {
            return jsonRes(res, { field: fieldName, content: currentData[fieldName] ?? 0, type: 'number' });
          }
          return jsonRes(res, { field: fieldName, content: currentData[fieldName] || '' });
        }

        if (req.method === 'POST') {
          // Read-only fields check
          if (allReadOnly.includes(fieldName)) {
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
          // Validate content type: must be string or array (for alternateGreetings/groupOnlyGreetings)
          const arrayFields = ['alternateGreetings', 'groupOnlyGreetings'];
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
            if (fieldName === 'alternateGreetings' || fieldName === 'groupOnlyGreetings') {
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
              return jsonRes(res, {
                success: true,
                field: fieldName,
                size: deps.stringifyTriggerScripts(currentData.triggerScripts).length,
              });
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
            return jsonRes(res, { success: true, field: fieldName, size: content.length });
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
        const fields: string[] = body.fields;
        if (!Array.isArray(fields) || fields.length === 0) {
          return jsonRes(res, { error: 'fields must be a non-empty string array' }, 400);
        }
        const MAX_BATCH = 20;
        if (fields.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} fields per batch` }, 400);
        }
        const isRisum = (currentData._fileType || 'charx') === 'risum';
        const isRisup = (currentData._fileType || 'charx') === 'risup';
        const isCharx = !isRisum && !isRisup;
        const allowedFields = [
          'name',
          'description',
          'firstMessage',
          'alternateGreetings',
          'groupOnlyGreetings',
          'globalNote',
          'css',
          'defaultVariables',
          'triggerScripts',
          'lua',
        ];
        const charxFields = [
          'personality',
          'scenario',
          'creatorcomment',
          'tags',
          'exampleMessage',
          'systemPrompt',
          'creator',
          'characterVersion',
          'nickname',
          'source',
          'additionalText',
          'license',
          'creationDate',
          'modificationDate',
        ];
        const risumFieldsBatch = [
          'cjs',
          'lowLevelAccess',
          'hideIcon',
          'backgroundEmbedding',
          'moduleNamespace',
          'customModuleToggle',
          'mcpUrl',
          'moduleName',
          'moduleDescription',
          'moduleId',
        ];
        const risupFieldsBatch = [
          'mainPrompt',
          'jailbreak',
          'temperature',
          'maxContext',
          'maxResponse',
          'frequencyPenalty',
          'presencePenalty',
          'aiModel',
          'subModel',
          'apiType',
          'promptPreprocess',
          'promptTemplate',
          'presetBias',
          'formatingOrder',
          'presetImage',
          'top_p',
          'top_k',
          'repetition_penalty',
          'min_p',
          'top_a',
          'reasonEffort',
          'thinkingTokens',
          'thinkingType',
          'adaptiveThinkingEffort',
          'useInstructPrompt',
          'instructChatTemplate',
          'JinjaTemplate',
          'customPromptTemplateToggle',
          'templateDefaultVariables',
          'moduleIntergration',
          'jsonSchemaEnabled',
          'jsonSchema',
          'strictJsonSchema',
          'extractJson',
          'groupTemplate',
          'groupOtherBotRole',
          'autoSuggestPrompt',
          'autoSuggestPrefix',
          'autoSuggestClean',
          'localStopStrings',
          'outputImageModal',
          'verbosity',
          'fallbackWhenBlankResponse',
          'systemContentReplacement',
          'systemRoleReplacement',
        ];
        const allAllowedBatch = [
          ...allowedFields,
          ...(isCharx ? charxFields : []),
          ...(isRisum ? risumFieldsBatch : []),
          ...(isRisup ? risupFieldsBatch : []),
        ];
        const boolFields = [
          'lowLevelAccess',
          'hideIcon',
          'promptPreprocess',
          'useInstructPrompt',
          'jsonSchemaEnabled',
          'strictJsonSchema',
          'autoSuggestClean',
          'outputImageModal',
          'fallbackWhenBlankResponse',
        ];
        const numFields = [
          'temperature',
          'maxContext',
          'maxResponse',
          'frequencyPenalty',
          'presencePenalty',
          'top_p',
          'top_k',
          'repetition_penalty',
          'min_p',
          'top_a',
          'reasonEffort',
          'thinkingTokens',
          'verbosity',
          'creationDate',
          'modificationDate',
        ];
        const arrayFields = ['alternateGreetings', 'groupOnlyGreetings', 'tags', 'source'];

        const results = fields.map((fieldName: string) => {
          if (!allAllowedBatch.includes(fieldName)) {
            return { field: fieldName, error: `Unknown field: ${fieldName}` };
          }
          if (fieldName === 'triggerScripts') {
            return { field: fieldName, content: deps.stringifyTriggerScripts(currentData.triggerScripts) };
          }
          if (arrayFields.includes(fieldName)) {
            return { field: fieldName, content: currentData[fieldName] || [], type: 'array' };
          }
          if (boolFields.includes(fieldName)) {
            return { field: fieldName, content: !!currentData[fieldName], type: 'boolean' };
          }
          if (numFields.includes(fieldName)) {
            return { field: fieldName, content: currentData[fieldName] ?? 0, type: 'number' };
          }
          return { field: fieldName, content: currentData[fieldName] || '' };
        });
        return jsonRes(res, { count: results.length, fields: results });
      }

      // ----------------------------------------------------------------
      // POST /field/:name/replace — replace text in a string field
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'replace' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        // Reuse field validation from the main field handler
        const stringFieldsForReplace = [
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
        ];
        const readOnlyFieldsReplace = ['creationDate', 'modificationDate', 'moduleId'];
        if (readOnlyFieldsReplace.includes(fieldName)) {
          return mcpError(res, 400, {
            action: 'replace in field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        if (!stringFieldsForReplace.includes(fieldName)) {
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
        if (!body.find) {
          return mcpError(res, 400, {
            action: 'replace in field',
            message: 'Missing "find"',
            suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
            target: `field:${fieldName}`,
          });
        }
        // Acquire mutex to prevent parallel writes on same field
        const release = await acquireFieldMutex(fieldName);
        try {
          const content: string = currentData[fieldName] || '';
          const findStr: string = body.find;
          const replaceStr: string = body.replace !== undefined ? body.replace : '';
          const useRegex = !!body.regex;
          const flags: string = body.flags || 'g';
          const dryRun = !!body.dry_run;
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
            return jsonRes(res, {
              success: false,
              message: '일치하는 항목 없음',
              matchCount: 0,
              ...(dryRun ? { dryRun: true } : {}),
            });
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
            return jsonRes(res, {
              dryRun: true,
              field: fieldName,
              matchCount,
              fieldLength: content.length,
              previews,
              newSize: newContent.length,
            });
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
            return jsonRes(res, {
              success: true,
              field: fieldName,
              matchCount,
              oldSize: content.length,
              newSize: newContent.length,
            });
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
      // POST /field/:name/insert — insert text into a string field
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'insert' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const stringFieldsForInsert = [
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
        ];
        const readOnlyFieldsInsert = ['creationDate', 'modificationDate', 'moduleId'];
        if (readOnlyFieldsInsert.includes(fieldName)) {
          return mcpError(res, 400, {
            action: 'insert in field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        if (!stringFieldsForInsert.includes(fieldName)) {
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
        if (body.content === undefined) {
          return mcpError(res, 400, {
            action: 'insert in field',
            message: 'Missing "content"',
            suggestion: '삽입할 content를 요청 본문에 포함하세요.',
            target: `field:${fieldName}`,
          });
        }
        // Acquire mutex to prevent parallel writes on same field
        const release = await acquireFieldMutex(fieldName);
        try {
          const oldContent: string = currentData[fieldName] || '';
          let newContent: string;
          const position: string = body.position || 'end';
          if (position === 'end') {
            newContent = oldContent + '\n' + body.content;
          } else if (position === 'start') {
            newContent = body.content + '\n' + oldContent;
          } else if ((position === 'after' || position === 'before') && body.anchor) {
            const anchorPos = oldContent.indexOf(body.anchor);
            if (anchorPos === -1) {
              return jsonRes(res, {
                success: false,
                message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
              });
            }
            if (position === 'after') {
              const insertAt = anchorPos + body.anchor.length;
              newContent = oldContent.slice(0, insertAt) + '\n' + body.content + oldContent.slice(insertAt);
            } else {
              newContent = oldContent.slice(0, anchorPos) + body.content + '\n' + oldContent.slice(anchorPos);
            }
          } else {
            return jsonRes(res, { error: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다' }, 400);
          }
          const preview = body.content.substring(0, 100) + (body.content.length > 100 ? '...' : '');
          const allowed = await deps.askRendererConfirm(
            'MCP 필드 삽입 요청',
            `AI 어시스턴트가 "${fieldName}" 필드에 내용을 삽입하려 합니다.\n위치: ${position}${body.anchor ? ' "' + body.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
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
            return jsonRes(res, {
              success: true,
              field: fieldName,
              position,
              oldSize: oldContent.length,
              newSize: newContent.length,
            });
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
        const stringFieldsForBatchReplace = [
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
        ];
        if (!stringFieldsForBatchReplace.includes(fieldName)) {
          return mcpError(res, 400, {
            action: 'batch replace in field',
            message: `"${fieldName}" 필드는 문자열 치환을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}/batch-replace`, broadcastStatus);
        if (!body) return;
        const replacements: Array<{ find: string; replace?: string; regex?: boolean; flags?: string }> =
          body.replacements;
        if (!Array.isArray(replacements) || replacements.length === 0) {
          return jsonRes(res, { error: 'replacements must be a non-empty array' }, 400);
        }
        const MAX_BATCH = 50;
        if (replacements.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} replacements per batch` }, 400);
        }
        for (const r of replacements) {
          if (!r.find) {
            return jsonRes(res, { error: 'Each replacement must include "find"' }, 400);
          }
        }
        const dryRun = !!body.dry_run;
        // Acquire mutex to prevent parallel writes
        const release = await acquireFieldMutex(fieldName);
        try {
          let content: string = currentData[fieldName] || '';
          const originalSize = content.length;
          // Apply replacements sequentially, collecting match info
          const results = replacements.map((r) => {
            const findStr: string = r.find;
            const replaceStr: string = r.replace !== undefined ? r.replace : '';
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
            return jsonRes(res, {
              success: false,
              message: '모든 치환에서 일치하는 항목 없음',
              results,
              ...(dryRun ? { dryRun: true } : {}),
            });
          }
          if (dryRun) {
            return jsonRes(res, {
              dryRun: true,
              field: fieldName,
              totalMatches,
              originalSize,
              newSize: content.length,
              results,
            });
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
            return jsonRes(res, {
              success: true,
              field: fieldName,
              totalMatches,
              originalSize,
              newSize: content.length,
              results,
            });
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
      // POST /field/:name/search — search text in a string field (read-only)
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'search' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const searchableFields = [
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
          // Read-only fields are also searchable
          'creationDate',
          'modificationDate',
          'moduleId',
        ];
        if (!searchableFields.includes(fieldName)) {
          return mcpError(res, 400, {
            action: 'search in field',
            message: `"${fieldName}" 필드는 검색을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}/search`, broadcastStatus);
        if (!body) return;
        if (!body.query) {
          return mcpError(res, 400, {
            action: 'search in field',
            message: 'Missing "query"',
            suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
            target: `field:${fieldName}`,
          });
        }
        const content: string =
          typeof currentData[fieldName] === 'string' ? currentData[fieldName] : String(currentData[fieldName] ?? '');
        const queryStr: string = body.query;
        const contextChars: number = Math.max(0, Math.min(Number(body.context_chars) || 100, 500));
        const maxMatches: number = Math.max(1, Math.min(Number(body.max_matches) || 20, 100));
        const useRegex = !!body.regex;
        const flags: string = body.flags || (useRegex ? 'gi' : '');

        interface SearchMatch {
          match: string;
          before: string;
          after: string;
          position: number;
          line: number;
        }
        const matches: SearchMatch[] = [];

        try {
          if (useRegex) {
            const re = new RegExp(queryStr, flags.includes('g') ? flags : flags + 'g');
            let m: RegExpExecArray | null;
            while ((m = re.exec(content)) !== null) {
              const pos = m.index;
              const matchText = m[0];
              const before = content.slice(Math.max(0, pos - contextChars), pos);
              const after = content.slice(pos + matchText.length, pos + matchText.length + contextChars);
              const line = content.slice(0, pos).split('\n').length;
              matches.push({ match: matchText, before, after, position: pos, line });
              if (matches.length >= maxMatches) break;
              // Prevent infinite loop on zero-length matches
              if (matchText.length === 0) re.lastIndex++;
            }
          } else {
            let searchFrom = 0;
            const queryLower = queryStr.toLowerCase();
            const contentLower = content.toLowerCase();
            while (matches.length < maxMatches) {
              const pos = contentLower.indexOf(queryLower, searchFrom);
              if (pos === -1) break;
              const matchText = content.slice(pos, pos + queryStr.length);
              const before = content.slice(Math.max(0, pos - contextChars), pos);
              const after = content.slice(pos + queryStr.length, pos + queryStr.length + contextChars);
              const line = content.slice(0, pos).split('\n').length;
              matches.push({ match: matchText, before, after, position: pos, line });
              searchFrom = pos + queryStr.length;
            }
          }
        } catch (err) {
          return mcpError(res, 400, {
            action: 'search in field',
            message: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
            target: `field:${fieldName}`,
          });
        }

        // Count total matches (may exceed maxMatches)
        let totalMatches = matches.length;
        if (matches.length >= maxMatches) {
          // Count remaining matches without storing them
          if (useRegex) {
            const re = new RegExp(queryStr, flags.includes('g') ? flags : flags + 'g');
            const allMatches = content.match(re);
            totalMatches = allMatches ? allMatches.length : matches.length;
          } else {
            let searchFrom = 0;
            const queryLower = queryStr.toLowerCase();
            const contentLower = content.toLowerCase();
            totalMatches = 0;
            while (true) {
              const pos = contentLower.indexOf(queryLower, searchFrom);
              if (pos === -1) break;
              totalMatches++;
              searchFrom = pos + queryStr.length;
            }
          }
        }

        return jsonRes(res, {
          field: fieldName,
          query: queryStr,
          totalMatches,
          returnedMatches: matches.length,
          fieldLength: content.length,
          matches,
        });
      }

      // ----------------------------------------------------------------
      // GET /field/:name/range — read a substring of a field (read-only)
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'range' && !parts[3] && req.method === 'GET') {
        const fieldName = decodeURIComponent(parts[1]);
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
        return jsonRes(res, {
          field: fieldName,
          totalLength: content.length,
          offset,
          length: slice.length,
          hasMore: offset + length < content.length,
          content: slice,
        });
      }

      // ----------------------------------------------------------------
      // GET /lorebook
      // ----------------------------------------------------------------
      if (parts[0] === 'lorebook' && !parts[1] && req.method === 'GET') {
        const rawEntries = currentData.lorebook || [];

        // Build folder summary
        const folderMap = new Map<string, { name: string; entryCount: number }>();
        for (const e of rawEntries) {
          if (e.mode === 'folder') {
            const folderId = `folder:${e.id || ''}`;
            folderMap.set(folderId, { name: e.comment || '', entryCount: 0 });
          }
        }
        for (const e of rawEntries) {
          if (e.mode !== 'folder' && e.folder) {
            const info = folderMap.get(e.folder);
            if (info) info.entryCount++;
          }
        }
        const folders = Array.from(folderMap.entries()).map(([id, info]) => ({
          id,
          name: info.name,
          entryCount: info.entryCount,
        }));

        // Parse preview_length
        const previewLengthParam = url.searchParams.get('preview_length');
        const previewLength =
          previewLengthParam !== null ? Math.min(Math.max(parseInt(previewLengthParam, 10) || 0, 0), 500) : 150;

        let entries = rawEntries.map((e: any, i: number) => {
          const content = e.content || '';
          const entry: Record<string, unknown> = {
            index: i,
            comment: e.comment || '',
            key: e.key || '',
            mode: e.mode || 'normal',
            alwaysActive: !!e.alwaysActive,
            contentSize: content.length,
            folder: e.folder || '',
          };
          if (previewLength > 0) {
            entry.contentPreview = content.slice(0, previewLength) + (content.length > previewLength ? '…' : '');
          }
          return entry;
        });

        // Filter by folder UUID
        const folderParam = url.searchParams.get('folder');
        if (folderParam) {
          const folderId = folderParam.startsWith('folder:') ? folderParam : `folder:${folderParam}`;
          entries = entries.filter((e: any) => e.folder === folderId);
        }

        // Filter by keyword (comment/key)
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
            const content = (rawEntries[(_e as any).index]?.content || '').toLowerCase();
            return content.includes(cq);
          });
          // Add match context preview for content_filter results
          entries = entries.map((e: any) => {
            const content = (rawEntries[e.index]?.content || '').toLowerCase();
            const matchPos = content.indexOf(cq);
            if (matchPos >= 0) {
              const rawContent = rawEntries[e.index]?.content || '';
              const start = Math.max(0, matchPos - 50);
              const end = Math.min(rawContent.length, matchPos + cq.length + 50);
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
            const content = (rawEntries[(_e as any).index]?.content || '').toLowerCase();
            return !content.includes(nq);
          });
        }
        return jsonRes(res, { count: entries.length, folders, entries });
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
          return jsonRes(res, { error: `Index ${idx} out of range` }, 400);
        }
        return jsonRes(res, { index: idx, entry: currentData.lorebook[idx] });
      }

      // ----------------------------------------------------------------
      // POST /lorebook/batch — batch read multiple entries
      // ----------------------------------------------------------------
      if (parts[0] === 'lorebook' && parts[1] === 'batch' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'lorebook/batch', broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return jsonRes(res, { error: 'indices must be an array of numbers' }, 400);
        }
        const MAX_BATCH = 50;
        if (indices.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} indices per batch` }, 400);
        }
        const lorebook = currentData.lorebook || [];
        const requestedFields: string[] | undefined = body.fields;
        const entries = indices.map((idx: number) => {
          if (typeof idx !== 'number' || idx < 0 || idx >= lorebook.length) return null;
          if (requestedFields && Array.isArray(requestedFields)) {
            const projected: Record<string, unknown> = {};
            for (const f of requestedFields) {
              if (f in lorebook[idx]) projected[f] = lorebook[idx][f];
            }
            return { index: idx, entry: projected };
          }
          return { index: idx, entry: lorebook[idx] };
        });
        return jsonRes(res, { count: entries.filter(Boolean).length, total: indices.length, entries });
      }

      // ----------------------------------------------------------------
      // POST /lorebook/batch-write — batch modify multiple entries
      // ----------------------------------------------------------------
      if (parts[0] === 'lorebook' && parts[1] === 'batch-write' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'lorebook/batch-write', broadcastStatus);
        if (!body) return;
        const entries: Array<{ index: number; data: Record<string, unknown> }> = body.entries;
        if (!Array.isArray(entries) || entries.length === 0) {
          return jsonRes(res, { error: 'entries must be a non-empty array of {index, data}' }, 400);
        }
        const MAX_BATCH = 50;
        if (entries.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} entries per batch` }, 400);
        }
        const lorebook = currentData.lorebook || [];
        // Validate all indices first
        const invalid = entries.filter(
          (e) => typeof e.index !== 'number' || e.index < 0 || e.index >= lorebook.length || !lorebook[e.index],
        );
        if (invalid.length > 0) {
          return jsonRes(res, { error: `Invalid indices: ${invalid.map((e) => e.index).join(', ')}` }, 400);
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
            return { index: e.index, success: true };
          });
          logMcpMutation('batch write lorebook', 'lorebook:batch-write', { count: entries.length });
          deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
          return jsonRes(res, { success: true, count: results.length, results });
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
          return jsonRes(res, { error: 'index (current lorebook entry index) is required' }, 400);
        }
        if (typeof refIndex !== 'number' || typeof refEntryIndex !== 'number') {
          return jsonRes(res, { error: 'refIndex and refEntryIndex are required' }, 400);
        }
        const lorebook = currentData.lorebook || [];
        if (index < 0 || index >= lorebook.length) {
          return jsonRes(res, { error: `Current entry index ${index} out of range` }, 400);
        }
        const refFiles = deps.getReferenceFiles();
        if (refIndex < 0 || refIndex >= refFiles.length) {
          return jsonRes(res, { error: `Reference file index ${refIndex} out of range` }, 400);
        }
        const refLorebook = refFiles[refIndex].data.lorebook || [];
        if (refEntryIndex < 0 || refEntryIndex >= refLorebook.length) {
          return jsonRes(res, { error: `Reference entry index ${refEntryIndex} out of range` }, 400);
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
        return jsonRes(res, {
          index,
          refIndex,
          refEntryIndex,
          currentComment: current.comment || '',
          referenceComment: reference.comment || '',
          referenceFile: refFiles[refIndex].fileName,
          identical: diffs.length === 0,
          diffCount: diffs.length,
          diffs,
        });
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

        return jsonRes(res, {
          totalEntries: lorebook.filter((e: any) => e.mode !== 'folder').length,
          issueCount: issues.length,
          issues: issues.sort((a, b) => a.index - b.index),
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
          return jsonRes(res, { error: `Source index ${sourceIdx} out of range` }, 400);
        }
        const source = currentData.lorebook[sourceIdx];
        const sourceName = source.comment || `entry_${sourceIdx}`;

        const allowed = await deps.askRendererConfirm(
          'MCP 복제 요청',
          `AI 어시스턴트가 로어북 항목 "${sourceName}" (index ${sourceIdx})을 복제하려 합니다.`,
        );

        if (allowed) {
          const clone = JSON.parse(JSON.stringify(source));
          // Apply overrides
          if (body.overrides && typeof body.overrides === 'object') {
            Object.assign(clone, pickAllowedFields(body.overrides, LOREBOOK_ALLOWED_FIELDS));
          }
          // Generate new ID to avoid conflicts
          clone.id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
          currentData.lorebook.push(clone);
          const newIndex = currentData.lorebook.length - 1;
          logMcpMutation('clone lorebook entry', `lorebook:clone`, { sourceIdx, sourceName, newIndex });
          deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
          return jsonRes(res, { success: true, sourceIndex: sourceIdx, newIndex, comment: clone.comment || '' });
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
        const entryName: string = currentData.lorebook[idx].comment || `entry_${idx}`;

        const allowed = await deps.askRendererConfirm(
          'MCP 수정 요청',
          `AI 어시스턴트가 로어북 항목 "${entryName}" (index ${idx})을 수정하려 합니다.\n현재 에디터에서 수정 중인 내용이 덮어씌워질 수 있습니다.`,
        );

        if (allowed) {
          Object.assign(currentData.lorebook[idx], pickAllowedFields(body, LOREBOOK_ALLOWED_FIELDS));
          logMcpMutation('update lorebook entry', `lorebook:${idx}`, { entryName, updatedKeys: Object.keys(body) });
          deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
          return jsonRes(res, { success: true, index: idx });
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
              order: 100,
              priority: 0,
              selective: false,
              alwaysActive: false,
              mode: 'normal',
              extentions: {},
            },
            pickAllowedFields(body, LOREBOOK_ALLOWED_FIELDS),
          );
          if (!currentData.lorebook) currentData.lorebook = [];
          currentData.lorebook.push(entry);
          logMcpMutation('add lorebook entry', 'lorebook:add', {
            entryName: name,
            newIndex: currentData.lorebook.length - 1,
          });
          deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
          return jsonRes(res, { success: true, index: currentData.lorebook.length - 1 });
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
          return jsonRes(res, { error: 'entries must be a non-empty array' }, 400);
        }
        const MAX_BATCH = 50;
        if (entries.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} entries per batch` }, 400);
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
                order: 100,
                priority: 0,
                selective: false,
                alwaysActive: false,
                mode: 'normal',
                extentions: {},
              },
              pickAllowedFields(entryData, LOREBOOK_ALLOWED_FIELDS),
            );
            currentData.lorebook.push(entry);
            const newIndex = currentData.lorebook.length - 1;
            results.push({ index: newIndex, comment: (entry.comment as string) || `entry_${newIndex}` });
          }
          logMcpMutation('batch add lorebook entries', 'lorebook:batch-add', {
            count: entries.length,
            entries: results,
          });
          deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
          return jsonRes(res, { success: true, added: results.length, entries: results });
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
          return jsonRes(res, { error: 'indices must be a non-empty array' }, 400);
        }
        const MAX_BATCH = 50;
        if (indices.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} deletions per batch` }, 400);
        }

        const lorebook = currentData.lorebook || [];
        for (const idx of indices) {
          if (typeof idx !== 'number' || idx < 0 || idx >= lorebook.length || !lorebook[idx]) {
            return jsonRes(res, { error: `Invalid index: ${idx}` }, 400);
          }
        }

        const entryNames = indices.map((idx) => `${idx}: ${lorebook[idx].comment || `entry_${idx}`}`);
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
          return jsonRes(res, { success: true, deleted: deleted.length, entries: deleted });
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
        const findStr: string = body.find;
        const replaceStr: string = body.replace !== undefined ? body.replace : '';
        const useRegex = !!body.regex;
        const flags: string = body.flags || 'g';
        const dryRun = !!body.dry_run;

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
          const content: string = entry[targetField] || '';
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
          return jsonRes(res, {
            success: false,
            message: '전체 로어북에서 일치하는 항목 없음',
            totalEntries: lorebook.length,
            matchedEntries: 0,
            totalMatches: 0,
            field: targetField,
            ...(dryRun ? { dryRun: true } : {}),
          });
        }

        const totalMatches = results.reduce((s, r) => s + r.matchCount, 0);

        // Dry-run: return match info without modifying
        if (dryRun) {
          return jsonRes(res, {
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
          });
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
          return jsonRes(res, {
            success: true,
            field: targetField,
            matchedEntries: results.length,
            totalMatches,
            results: results.map((r) => ({
              index: r.index,
              comment: r.comment,
              matchCount: r.matchCount,
            })),
          });
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
        const replacements: Array<{
          index: number;
          find: string;
          replace?: string;
          regex?: boolean;
          flags?: string;
        }> = body.replacements;
        if (!Array.isArray(replacements) || replacements.length === 0) {
          return jsonRes(res, { error: 'replacements must be a non-empty array' }, 400);
        }
        const MAX_BATCH = 50;
        if (replacements.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} replacements per batch` }, 400);
        }
        const lorebook = currentData.lorebook || [];
        // Validate indices and find strings
        for (const r of replacements) {
          if (typeof r.index !== 'number' || r.index < 0 || r.index >= lorebook.length || !lorebook[r.index]) {
            return jsonRes(res, { error: `Invalid index: ${r.index}` }, 400);
          }
          if (!r.find) {
            return jsonRes(res, { error: `Missing "find" for index ${r.index}` }, 400);
          }
        }
        // Pre-compute matches for each replacement
        const results = replacements.map((r) => {
          const entry = lorebook[r.index];
          const content: string = (entry && entry.content) || '';
          const findStr: string = r.find;
          const replaceStr: string = r.replace !== undefined ? r.replace : '';
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
          return jsonRes(res, {
            success: false,
            message: '모든 항목에서 일치하는 내용 없음',
            results: results.map((r) => ({ index: r.index, comment: r.comment, matchCount: 0, skipped: true })),
          });
        }
        const summary = activeResults.map((r) => `  [${r.index}] "${r.comment}": ${r.matchCount}건`).join('\n');
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
          return jsonRes(res, {
            success: true,
            count: activeResults.length,
            results: results.map((r) => ({
              index: r.index,
              comment: r.comment,
              matchCount: r.matchCount,
              skipped: r.skipped,
            })),
          });
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
        }> = body.insertions;
        if (!Array.isArray(insertions) || insertions.length === 0) {
          return jsonRes(res, { error: 'insertions must be a non-empty array' }, 400);
        }
        const MAX_BATCH = 50;
        if (insertions.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} insertions per batch` }, 400);
        }
        const lorebook = currentData.lorebook || [];
        // Validate
        for (const ins of insertions) {
          if (typeof ins.index !== 'number' || ins.index < 0 || ins.index >= lorebook.length || !lorebook[ins.index]) {
            return jsonRes(res, { error: `Invalid index: ${ins.index}` }, 400);
          }
          if (ins.content === undefined) {
            return jsonRes(res, { error: `Missing "content" for index ${ins.index}` }, 400);
          }
        }
        // Pre-compute new contents
        const results = insertions.map((ins) => {
          const entry = lorebook[ins.index];
          const oldContent: string = (entry && entry.content) || '';
          const position = ins.position || 'end';
          let newContent: string;
          let error: string | undefined;
          if (position === 'end') {
            newContent = oldContent + '\n' + ins.content;
          } else if (position === 'start') {
            newContent = ins.content + '\n' + oldContent;
          } else if ((position === 'after' || position === 'before') && ins.anchor) {
            const anchorPos = oldContent.indexOf(ins.anchor);
            if (anchorPos === -1) {
              error = `앵커를 찾을 수 없음: ${ins.anchor.substring(0, 60)}`;
              newContent = oldContent;
            } else if (position === 'after') {
              const insertAt = anchorPos + ins.anchor.length;
              newContent = oldContent.slice(0, insertAt) + '\n' + ins.content + oldContent.slice(insertAt);
            } else {
              newContent = oldContent.slice(0, anchorPos) + ins.content + '\n' + oldContent.slice(anchorPos);
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
          return jsonRes(res, {
            success: false,
            errors: errors.map((r) => ({ index: r.index, error: r.error })),
          });
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
          return jsonRes(res, {
            success: true,
            count: results.length,
            results: results.map((r) => ({
              index: r.index,
              comment: r.comment,
              position: r.position,
              oldSize: r.oldSize,
              newSize: r.newSize,
            })),
          });
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
        const entryName: string = currentData.lorebook[idx].comment || `entry_${idx}`;
        const content: string = currentData.lorebook[idx][targetField] || '';
        const findStr: string = body.find;
        const replaceStr: string = body.replace !== undefined ? body.replace : '';
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
          return jsonRes(res, { success: false, message: '일치하는 항목 없음', matchCount: 0, field: targetField });
        }

        const fieldLabel = targetField === 'content' ? '' : ` [${targetField}]`;
        const allowed = await deps.askRendererConfirm(
          'MCP 치환 요청',
          `AI 어시스턴트가 로어북 항목 "${entryName}" (index ${idx})${fieldLabel}에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
        );

        if (allowed) {
          currentData.lorebook[idx][targetField] = newContent;
          logMcpMutation('replace lorebook field', `lorebook:${idx}`, { entryName, field: targetField, matchCount });
          deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
          return jsonRes(res, {
            success: true,
            index: idx,
            comment: entryName,
            field: targetField,
            matchCount,
            oldSize: content.length,
            newSize: newContent.length,
          });
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
        if (body.content === undefined) {
          return mcpError(res, 400, {
            action: 'insert lorebook content',
            message: 'Missing "content"',
            suggestion: '삽입할 content를 요청 본문에 포함하세요.',
            target: `lorebook:${idx}`,
          });
        }
        const entryName: string = currentData.lorebook[idx].comment || `entry_${idx}`;
        const oldContent: string = currentData.lorebook[idx].content || '';
        let newContent: string;
        const position: string = body.position || 'end';

        if (position === 'end') {
          newContent = oldContent + '\n' + body.content;
        } else if (position === 'start') {
          newContent = body.content + '\n' + oldContent;
        } else if ((position === 'after' || position === 'before') && body.anchor) {
          const anchorPos = oldContent.indexOf(body.anchor);
          if (anchorPos === -1) {
            return jsonRes(res, {
              success: false,
              message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
            });
          }
          if (position === 'after') {
            const insertAt = anchorPos + body.anchor.length;
            newContent = oldContent.slice(0, insertAt) + '\n' + body.content + oldContent.slice(insertAt);
          } else {
            newContent = oldContent.slice(0, anchorPos) + body.content + '\n' + oldContent.slice(anchorPos);
          }
        } else {
          return jsonRes(res, { error: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다' }, 400);
        }

        const preview = body.content.substring(0, 100) + (body.content.length > 100 ? '...' : '');
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
          return jsonRes(res, {
            success: true,
            index: idx,
            comment: entryName,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
          });
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
        const entryName: string = currentData.lorebook[idx].comment || `entry_${idx}`;

        const allowed = await deps.askRendererConfirm(
          'MCP 삭제 요청',
          `AI 어시스턴트가 로어북 항목 "${entryName}" (index ${idx})을 삭제하려 합니다.`,
        );

        if (allowed) {
          currentData.lorebook.splice(idx, 1);
          logMcpMutation('delete lorebook entry', `lorebook:${idx}`, { entryName });
          deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
          return jsonRes(res, { success: true, deleted: idx });
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

      // ----------------------------------------------------------------
      // GET /regex
      // ----------------------------------------------------------------
      if (parts[0] === 'regex' && !parts[1] && req.method === 'GET') {
        const entries = (currentData.regex || []).map((e: any, i: number) => ({
          index: i,
          comment: e.comment || '',
          type: e.type || '',
          findSize: (e.find || e.in || '').length,
          replaceSize: (e.replace || e.out || '').length,
        }));
        return jsonRes(res, { count: entries.length, entries });
      }

      // ----------------------------------------------------------------
      // GET /regex/:idx
      // ----------------------------------------------------------------
      if (parts[0] === 'regex' && parts[1] && req.method === 'GET') {
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= (currentData.regex || []).length) {
          return jsonRes(res, { error: `Index ${idx} out of range` }, 400);
        }
        const entry = { ...currentData.regex[idx] };
        // Normalize legacy in/out → find/replace before removing duplicates
        if (!entry.find && entry.in) entry.find = entry.in;
        if (!entry.replace && entry.out) entry.replace = entry.out;
        if (entry.find === undefined) entry.find = '';
        if (entry.replace === undefined) entry.replace = '';
        delete entry.in;
        delete entry.out;
        return jsonRes(res, { index: idx, entry });
      }

      // ----------------------------------------------------------------
      // POST /regex/:idx (modify existing)
      // ----------------------------------------------------------------
      if (
        parts[0] === 'regex' &&
        parts[1] &&
        !['add', 'batch-add', 'batch-write'].includes(parts[1]) &&
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
          return jsonRes(res, { success: true, index: idx });
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
          return jsonRes(res, { success: true, index: currentData.regex.length - 1 });
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
          return jsonRes(res, { error: 'entries must be a non-empty array' }, 400);
        }
        const MAX_BATCH = 50;
        if (entries.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} entries per batch` }, 400);
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
          return jsonRes(res, { success: true, added: results.length, entries: results });
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
          return jsonRes(res, { error: 'entries must be a non-empty array of {index, data}' }, 400);
        }
        const MAX_BATCH = 50;
        if (batchEntries.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} entries per batch` }, 400);
        }
        const regexArr = currentData.regex || [];
        for (const e of batchEntries) {
          const idx = Number(e.index);
          if (isNaN(idx) || idx < 0 || idx >= regexArr.length) {
            return jsonRes(res, { error: `Index ${e.index} out of range (0-${regexArr.length - 1})` }, 400);
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
          return jsonRes(res, { success: true, modified: results.length, entries: results });
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
        const targetField: string = body.field;
        if (targetField !== 'find' && targetField !== 'replace') {
          return jsonRes(res, { error: 'field must be "find" or "replace"' }, 400);
        }
        if (!body.find) {
          return jsonRes(res, { error: 'Missing "find" (search string)' }, 400);
        }
        const entry = currentData.regex[idx];
        const entryName: string = entry.comment || `regex_${idx}`;
        const content: string = (targetField === 'find' ? entry.find || entry.in : entry.replace || entry.out) || '';
        const findStr: string = body.find;
        const replaceStr: string = body.replace !== undefined ? body.replace : '';
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
          return jsonRes(res, { success: false, message: '일치하는 항목 없음', matchCount: 0 });
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
          return jsonRes(res, {
            success: true,
            index: idx,
            comment: entryName,
            field: targetField,
            matchCount,
            oldSize: content.length,
            newSize: newContent.length,
          });
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
        const targetField: string = body.field;
        if (targetField !== 'find' && targetField !== 'replace') {
          return jsonRes(res, { error: 'field must be "find" or "replace"' }, 400);
        }
        if (body.content === undefined) {
          return jsonRes(res, { error: 'Missing "content"' }, 400);
        }
        const entry = currentData.regex[idx];
        const entryName: string = entry.comment || `regex_${idx}`;
        const oldContent: string = (targetField === 'find' ? entry.find || entry.in : entry.replace || entry.out) || '';
        let newContent: string;
        const position: string = body.position || 'end';

        if (position === 'end') {
          newContent = oldContent + body.content;
        } else if (position === 'start') {
          newContent = body.content + oldContent;
        } else if ((position === 'after' || position === 'before') && body.anchor) {
          const anchorPos = oldContent.indexOf(body.anchor);
          if (anchorPos === -1) {
            return jsonRes(res, {
              success: false,
              message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
            });
          }
          if (position === 'after') {
            const insertAt = anchorPos + body.anchor.length;
            newContent = oldContent.slice(0, insertAt) + body.content + oldContent.slice(insertAt);
          } else {
            newContent = oldContent.slice(0, anchorPos) + body.content + oldContent.slice(anchorPos);
          }
        } else {
          return jsonRes(res, { error: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다' }, 400);
        }

        const preview = body.content.substring(0, 100) + (body.content.length > 100 ? '...' : '');
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
          return jsonRes(res, {
            success: true,
            index: idx,
            comment: entryName,
            field: targetField,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
          });
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
        const entryName: string = currentData.regex[idx].comment || `regex_${idx}`;

        const allowed = await deps.askRendererConfirm(
          'MCP 삭제 요청',
          `AI 어시스턴트가 정규식 항목 "${entryName}" (index ${idx})을 삭제하려 합니다.`,
        );

        if (allowed) {
          currentData.regex.splice(idx, 1);
          logMcpMutation('delete regex entry', `regex:${idx}`, { entryName });
          deps.broadcastToAll('data-updated', 'regex', currentData.regex);
          return jsonRes(res, { success: true, deleted: idx });
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
      // GREETINGS  (alternateGreetings / groupOnlyGreetings)
      // ================================================================

      // ----------------------------------------------------------------
      // GET /greetings/:type — list greetings with index, size, preview
      // ----------------------------------------------------------------
      if (parts[0] === 'greetings' && parts[1] && !parts[2] && req.method === 'GET') {
        const greetingType = parts[1]; // "alternate" | "group"
        const fieldName =
          greetingType === 'alternate' ? 'alternateGreetings' : greetingType === 'group' ? 'groupOnlyGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'list greetings',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
            target: `greetings:${greetingType}`,
          });
        }
        const arr: string[] = currentData[fieldName] || [];
        let items = arr.map((g: string, i: number) => {
          const entry: Record<string, unknown> = {
            index: i,
            contentSize: g.length,
            preview: g.slice(0, 100) + (g.length > 100 ? '…' : ''),
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
        return jsonRes(res, { type: greetingType, field: fieldName, count: items.length, total: arr.length, items });
      }

      // ----------------------------------------------------------------
      // GET /greeting/:type/:idx — read single greeting
      // ----------------------------------------------------------------
      if (parts[0] === 'greeting' && parts[1] && parts[2] && !parts[3] && req.method === 'GET') {
        const greetingType = parts[1];
        const fieldName =
          greetingType === 'alternate' ? 'alternateGreetings' : greetingType === 'group' ? 'groupOnlyGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'read greeting',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
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
        return jsonRes(res, { type: greetingType, index: idx, content: arr[idx] });
      }

      // ----------------------------------------------------------------
      // POST /greeting/:type/add — add greeting
      // ----------------------------------------------------------------
      if (parts[0] === 'greeting' && parts[1] && parts[2] === 'add' && req.method === 'POST') {
        const greetingType = parts[1];
        const fieldName =
          greetingType === 'alternate' ? 'alternateGreetings' : greetingType === 'group' ? 'groupOnlyGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'add greeting',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
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
          return jsonRes(res, { success: true, type: greetingType, index: newIdx });
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
        const fieldName =
          greetingType === 'alternate' ? 'alternateGreetings' : greetingType === 'group' ? 'groupOnlyGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'batch write greetings',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
            target: `greeting:${greetingType}:batch-write`,
          });
        }
        const body = await readJsonBody(req, res, `greeting/${greetingType}/batch-write`, broadcastStatus);
        if (!body) return;
        const writes: Array<{ index: number; content: string }> = body.writes;
        if (!Array.isArray(writes) || writes.length === 0) {
          return jsonRes(res, { error: 'writes must be a non-empty array of {index, content}' }, 400);
        }
        const MAX_BATCH = 50;
        if (writes.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} writes per batch` }, 400);
        }
        const arr: string[] = currentData[fieldName] || [];
        const invalid = writes.filter((w) => typeof w.index !== 'number' || w.index < 0 || w.index >= arr.length);
        if (invalid.length > 0) {
          return jsonRes(res, { error: `Invalid indices: ${invalid.map((w) => w.index).join(', ')}` }, 400);
        }
        const summary = writes
          .map((w) => `  [${w.index}]: ${w.content.substring(0, 60)}${w.content.length > 60 ? '...' : ''}`)
          .join('\n');
        const allowed = await deps.askRendererConfirm(
          'MCP 일괄 수정 요청',
          `AI 어시스턴트가 ${greetingType} 인사말 ${writes.length}개를 일괄 수정하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
        );
        if (allowed) {
          for (const w of writes) {
            arr[w.index] = w.content;
          }
          currentData[fieldName] = arr;
          logMcpMutation('batch write greetings', `greeting:${greetingType}:batch-write`, { count: writes.length });
          deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
          return jsonRes(res, { success: true, type: greetingType, count: writes.length });
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
        const fieldName =
          greetingType === 'alternate' ? 'alternateGreetings' : greetingType === 'group' ? 'groupOnlyGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'reorder greetings',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
            target: `greeting:${greetingType}:reorder`,
          });
        }
        const body = await readJsonBody(req, res, `greeting/${greetingType}/reorder`, broadcastStatus);
        if (!body) return;
        const newOrder: number[] = body.order;
        const arr: string[] = currentData[fieldName] || [];
        if (!Array.isArray(newOrder) || newOrder.length !== arr.length) {
          return jsonRes(res, { error: `order must be an array of length ${arr.length} (current count)` }, 400);
        }
        // Validate: must be a permutation of 0..n-1
        const sorted = [...newOrder].sort((a, b) => a - b);
        const expected = Array.from({ length: arr.length }, (_, i) => i);
        if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
          return jsonRes(res, { error: 'order must be a permutation of [0, 1, ..., n-1]' }, 400);
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
          return jsonRes(res, { success: true, type: greetingType, count: reordered.length });
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
      if (
        parts[0] === 'greeting' &&
        parts[1] &&
        parts[2] &&
        parts[2] !== 'add' &&
        parts[3] !== 'delete' &&
        req.method === 'POST'
      ) {
        const greetingType = parts[1];
        const fieldName =
          greetingType === 'alternate' ? 'alternateGreetings' : greetingType === 'group' ? 'groupOnlyGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'write greeting',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
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
          return jsonRes(res, { success: true, type: greetingType, index: idx, size: body.content.length });
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
        const fieldName =
          greetingType === 'alternate' ? 'alternateGreetings' : greetingType === 'group' ? 'groupOnlyGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'delete greeting',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
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
        const label = greetingType === 'alternate' ? '추가 첫 메시지' : '그룹 전용 인사말';

        const allowed = await deps.askRendererConfirm(
          'MCP 삭제 요청',
          `AI 어시스턴트가 ${label} #${idx}을(를) 삭제하려 합니다.`,
        );

        if (allowed) {
          currentData[fieldName].splice(idx, 1);
          logMcpMutation('delete greeting', `greeting:${greetingType}:${idx}`, {});
          deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
          return jsonRes(res, { success: true, type: greetingType, deleted: idx });
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
        const fieldName =
          greetingType === 'alternate' ? 'alternateGreetings' : greetingType === 'group' ? 'groupOnlyGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'batch delete greetings',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
            target: `greeting:${greetingType}`,
          });
        }
        const body = await readJsonBody(req, res, `greeting/${greetingType}/batch-delete`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
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
        const label = greetingType === 'alternate' ? '추가 첫 메시지' : '그룹 전용 인사말';
        const allowed = await deps.askRendererConfirm(
          'MCP 일괄 삭제 요청',
          `AI 어시스턴트가 ${label} ${uniqueIndices.length}개 (index: ${uniqueIndices.join(', ')})를 삭제하려 합니다.`,
        );

        if (allowed) {
          for (const idx of uniqueIndices) {
            currentData[fieldName].splice(idx, 1);
          }
          logMcpMutation('batch delete greetings', `greeting:${greetingType}`, {
            count: uniqueIndices.length,
            indices: uniqueIndices,
          });
          deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
          return jsonRes(res, {
            success: true,
            type: greetingType,
            deletedCount: uniqueIndices.length,
            deletedIndices: uniqueIndices,
          });
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
        return jsonRes(res, { count: scripts.length, items });
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
        return jsonRes(res, { index: idx, trigger: scripts[idx] });
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
          deps.broadcastToAll(
            'data-updated',
            'triggerScripts',
            deps.stringifyTriggerScripts(currentData.triggerScripts),
          );
          deps.broadcastToAll('data-updated', 'lua', currentData.lua);
          return jsonRes(res, { success: true, index: newIdx });
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
        const name = scripts[idx].comment || `trigger_${idx}`;

        const allowed = await deps.askRendererConfirm(
          'MCP 삭제 요청',
          `AI 어시스턴트가 트리거 스크립트 "${name}" (index ${idx})을 삭제하려 합니다.`,
        );

        if (allowed) {
          currentData.triggerScripts.splice(idx, 1);
          currentData.lua = deps.extractPrimaryLua(currentData.triggerScripts);
          logMcpMutation('delete trigger', `trigger:${idx}`, { entryName: name });
          deps.broadcastToAll(
            'data-updated',
            'triggerScripts',
            deps.stringifyTriggerScripts(currentData.triggerScripts),
          );
          deps.broadcastToAll('data-updated', 'lua', currentData.lua);
          return jsonRes(res, { success: true, deleted: idx });
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
      if (parts[0] === 'trigger' && parts[1] && !parts[2] && req.method === 'POST') {
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
          deps.broadcastToAll(
            'data-updated',
            'triggerScripts',
            deps.stringifyTriggerScripts(currentData.triggerScripts),
          );
          deps.broadcastToAll('data-updated', 'lua', currentData.lua);
          return jsonRes(res, { success: true, index: idx });
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

      // ----------------------------------------------------------------
      // GET /lua — list Lua sections
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && !parts[1] && req.method === 'GET') {
        const sections = luaCache.get(currentData.lua);
        const result = sections.map((s, i) => ({
          index: i,
          name: s.name,
          contentSize: s.content.length,
        }));
        return jsonRes(res, { count: result.length, sections: result });
      }

      // ----------------------------------------------------------------
      // GET /lua/:idx — read Lua section
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && parts[1] && req.method === 'GET') {
        const sections = luaCache.get(currentData.lua);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return jsonRes(res, { error: `Lua section index ${idx} out of range (0-${sections.length - 1})` }, 400);
        }
        return jsonRes(res, { index: idx, name: sections[idx].name, content: sections[idx].content });
      }

      // ----------------------------------------------------------------
      // POST /lua/batch — batch read Lua sections
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && parts[1] === 'batch' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'lua/batch', broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return jsonRes(res, { error: 'indices must be an array of numbers' }, 400);
        }
        const MAX_BATCH = 20;
        if (indices.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} indices per batch` }, 400);
        }
        const sections = luaCache.get(currentData.lua);
        const result = indices.map((idx: number) => {
          if (typeof idx !== 'number' || idx < 0 || idx >= sections.length) return null;
          return { index: idx, name: sections[idx].name, content: sections[idx].content };
        });
        return jsonRes(res, { count: result.filter(Boolean).length, total: indices.length, sections: result });
      }

      // ----------------------------------------------------------------
      // POST /lua/add — add new Lua section
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && parts[1] === 'add' && !parts[2] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'lua/add', broadcastStatus);
        if (!body) return;
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
          return jsonRes(res, { error: 'Missing or empty "name" for new Lua section' }, 400);
        }
        const content = typeof body.content === 'string' ? body.content : '';
        const sections = luaCache.get(currentData.lua);
        const duplicate = sections.find((s) => s.name === name);
        if (duplicate) {
          return jsonRes(
            res,
            { error: `Section "${name}" already exists`, existingIndex: sections.indexOf(duplicate) },
            400,
          );
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
          return jsonRes(res, { success: true, index: sections.length - 1, name, contentSize: content.length });
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
          return jsonRes(res, { success: true, index: idx, name: sectionName, size: newSize, warning });
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
        const sectionName = sections[idx].name;
        const content = sections[idx].content;
        const findStr: string = body.find;
        const replaceStr: string = body.replace !== undefined ? body.replace : '';
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
          return jsonRes(res, { success: false, message: '일치하는 항목 없음', matchCount: 0 });
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
          return jsonRes(res, {
            success: true,
            index: idx,
            name: sectionName,
            matchCount,
            oldSize: content.length,
            newSize: newContent.length,
          });
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
        const sectionName = sections[idx].name;
        const oldContent = sections[idx].content;
        let newContent: string;
        const position: string = body.position || 'end';

        if (position === 'end') {
          newContent = oldContent + '\n' + body.content;
        } else if (position === 'start') {
          newContent = body.content + '\n' + oldContent;
        } else if ((position === 'after' || position === 'before') && body.anchor) {
          const anchorPos = oldContent.indexOf(body.anchor);
          if (anchorPos === -1) {
            return jsonRes(res, {
              success: false,
              message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
            });
          }
          if (position === 'after') {
            const insertAt = anchorPos + body.anchor.length;
            newContent = oldContent.slice(0, insertAt) + '\n' + body.content + oldContent.slice(insertAt);
          } else {
            newContent = oldContent.slice(0, anchorPos) + body.content + '\n' + oldContent.slice(anchorPos);
          }
        } else {
          return jsonRes(res, { error: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다' }, 400);
        }

        const preview = body.content.substring(0, 100) + (body.content.length > 100 ? '...' : '');
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
          return jsonRes(res, {
            success: true,
            index: idx,
            name: sectionName,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
            warning: warning || undefined,
          });
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
        const result = sections.map((s, i) => ({
          index: i,
          name: s.name,
          contentSize: s.content.length,
        }));
        return jsonRes(res, { count: result.length, sections: result });
      }

      // ----------------------------------------------------------------
      // GET /css-section/:idx — read CSS section
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && parts[1] && !parts[2] && req.method === 'GET') {
        const { sections } = cssCache.get(currentData.css);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return jsonRes(res, { error: `CSS section index ${idx} out of range (0-${sections.length - 1})` }, 400);
        }
        return jsonRes(res, { index: idx, name: sections[idx].name, content: sections[idx].content });
      }

      // ----------------------------------------------------------------
      // POST /css-section/batch — batch read CSS sections
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && parts[1] === 'batch' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'css-section/batch', broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return jsonRes(res, { error: 'indices must be an array of numbers' }, 400);
        }
        const MAX_BATCH = 20;
        if (indices.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} indices per batch` }, 400);
        }
        const { sections } = cssCache.get(currentData.css);
        const result = indices.map((idx: number) => {
          if (typeof idx !== 'number' || idx < 0 || idx >= sections.length) return null;
          return { index: idx, name: sections[idx].name, content: sections[idx].content };
        });
        return jsonRes(res, { count: result.filter(Boolean).length, total: indices.length, sections: result });
      }

      // ----------------------------------------------------------------
      // POST /css-section/add — add new CSS section
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && parts[1] === 'add' && !parts[2] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'css-section/add', broadcastStatus);
        if (!body) return;
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
          return jsonRes(res, { error: 'Missing or empty "name" for new CSS section' }, 400);
        }
        const content = typeof body.content === 'string' ? body.content : '';
        const { sections, prefix, suffix } = cssCache.get(currentData.css);
        const duplicate = sections.find((s) => s.name === name);
        if (duplicate) {
          return jsonRes(
            res,
            { error: `Section "${name}" already exists`, existingIndex: sections.indexOf(duplicate) },
            400,
          );
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
          return jsonRes(res, { success: true, index: sections.length - 1, name, contentSize: content.length });
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
          return jsonRes(res, { success: true, index: idx, name: sectionName, size: newSize });
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
        const content = sections[idx].content;
        const findStr: string = body.find;
        const replaceStr: string = body.replace !== undefined ? body.replace : '';
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
          return jsonRes(res, { success: false, message: '일치하는 항목 없음', matchCount: 0 });
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
          return jsonRes(res, {
            success: true,
            index: idx,
            name: sectionName,
            matchCount,
            oldSize: content.length,
            newSize: newContent.length,
          });
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
        const oldContent = sections[idx].content;
        let newContent: string;
        const position: string = body.position || 'end';

        if (position === 'end') {
          newContent = oldContent + '\n' + body.content;
        } else if (position === 'start') {
          newContent = body.content + '\n' + oldContent;
        } else if ((position === 'after' || position === 'before') && body.anchor) {
          const anchorPos = oldContent.indexOf(body.anchor);
          if (anchorPos === -1) {
            return jsonRes(res, {
              success: false,
              message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
            });
          }
          if (position === 'after') {
            const insertAt = anchorPos + body.anchor.length;
            newContent = oldContent.slice(0, insertAt) + '\n' + body.content + oldContent.slice(insertAt);
          } else {
            newContent = oldContent.slice(0, anchorPos) + body.content + '\n' + oldContent.slice(anchorPos);
          }
        } else {
          return jsonRes(res, { error: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다' }, 400);
        }

        const preview = body.content.substring(0, 100) + (body.content.length > 100 ? '...' : '');
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
          return jsonRes(res, {
            success: true,
            index: idx,
            name: sectionName,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
            warning: warning || undefined,
          });
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

      // ----------------------------------------------------------------
      // GET /references — list loaded reference files
      // ----------------------------------------------------------------
      if (parts[0] === 'references' && !parts[1] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const refs = refFiles.map((r: any, i: number) => {
          const fields: Record<string, unknown>[] = [];
          for (const f of ['lua', 'globalNote', 'firstMessage', 'css', 'description', 'defaultVariables']) {
            if (r.data[f]) fields.push({ name: f, size: r.data[f].length });
          }
          if (r.data.triggerScripts && r.data.triggerScripts !== '[]')
            fields.push({ name: 'triggerScripts', size: r.data.triggerScripts.length });
          if (r.data.alternateGreetings?.length)
            fields.push({ name: 'alternateGreetings', count: r.data.alternateGreetings.length, type: 'array' });
          if (r.data.groupOnlyGreetings?.length)
            fields.push({ name: 'groupOnlyGreetings', count: r.data.groupOnlyGreetings.length, type: 'array' });
          if (r.data.lorebook?.length) fields.push({ name: 'lorebook', count: r.data.lorebook.length, type: 'array' });
          if (r.data.regex?.length) fields.push({ name: 'regex', count: r.data.regex.length, type: 'array' });
          return { index: i, fileName: r.fileName, fields };
        });
        return jsonRes(res, { count: refs.length, references: refs });
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/lorebook — list reference lorebook entries (compact)
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'lorebook' && !parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const ref = refFiles[idx];
        const lorebook = ref.data.lorebook || [];

        // Parse preview_length
        const previewLengthParam = url.searchParams.get('preview_length');
        const previewLength =
          previewLengthParam !== null ? Math.min(Math.max(parseInt(previewLengthParam, 10) || 0, 0), 500) : 150;

        let entries = lorebook.map((e: any, i: number) => {
          const content = e.content || '';
          const entry: Record<string, unknown> = {
            index: i,
            comment: e.comment || '',
            key: e.key || '',
            mode: e.mode || 'normal',
            alwaysActive: !!e.alwaysActive,
            contentSize: content.length,
            folder: e.folder || '',
          };
          if (previewLength > 0) {
            entry.contentPreview = content.slice(0, previewLength) + (content.length > previewLength ? '…' : '');
          }
          return entry;
        });
        // Filter by folder UUID
        const folderParam = url.searchParams.get('folder');
        if (folderParam) {
          const folderId = folderParam.startsWith('folder:') ? folderParam : `folder:${folderParam}`;
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
        return jsonRes(res, { index: idx, fileName: ref.fileName, count: entries.length, entries });
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
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const body = await readJsonBody(req, res, `reference/${idx}/lorebook/batch`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return jsonRes(res, { error: 'indices must be an array of numbers' }, 400);
        }
        const MAX_BATCH = 50;
        if (indices.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} indices per batch` }, 400);
        }
        const lorebook = refFiles[idx].data.lorebook || [];
        const requestedFields: string[] | undefined = body.fields;
        const entries = indices.map((entryIdx: number) => {
          if (typeof entryIdx !== 'number' || entryIdx < 0 || entryIdx >= lorebook.length) return null;
          if (requestedFields && Array.isArray(requestedFields)) {
            const projected: Record<string, unknown> = {};
            for (const f of requestedFields) {
              if (f in lorebook[entryIdx]) projected[f] = lorebook[entryIdx][f];
            }
            return { index: entryIdx, entry: projected };
          }
          return { index: entryIdx, entry: lorebook[entryIdx] };
        });
        return jsonRes(res, {
          refIndex: idx,
          fileName: refFiles[idx].fileName,
          count: entries.filter(Boolean).length,
          total: indices.length,
          entries,
        });
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/lorebook/:entryIdx — read single reference lorebook entry
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'lorebook' && parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const ref = refFiles[idx];
        const lorebook = ref.data.lorebook || [];
        const entryIdx = parseInt(parts[3], 10);
        if (isNaN(entryIdx) || entryIdx < 0 || entryIdx >= lorebook.length) {
          return jsonRes(
            res,
            { error: `Lorebook entry index ${entryIdx} out of range (0-${lorebook.length - 1})` },
            400,
          );
        }
        return jsonRes(res, { refIndex: idx, fileName: ref.fileName, entryIndex: entryIdx, entry: lorebook[entryIdx] });
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/regex — list reference regex entries (compact)
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'regex' && !parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
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
        return jsonRes(res, { refIndex: idx, fileName: ref.fileName, count: entries.length, entries });
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/regex/:entryIdx — read single reference regex entry
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'regex' && parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const ref = refFiles[idx];
        const regexArr = ref.data.regex || [];
        const entryIdx = parseInt(parts[3], 10);
        if (isNaN(entryIdx) || entryIdx < 0 || entryIdx >= regexArr.length) {
          return jsonRes(res, { error: `Regex entry index ${entryIdx} out of range (0-${regexArr.length - 1})` }, 400);
        }
        const entry = { ...regexArr[entryIdx] };
        // Normalize legacy in/out → find/replace
        if (!entry.find && entry.in) entry.find = entry.in;
        if (!entry.replace && entry.out) entry.replace = entry.out;
        if (entry.find === undefined) entry.find = '';
        if (entry.replace === undefined) entry.replace = '';
        delete entry.in;
        delete entry.out;
        return jsonRes(res, { refIndex: idx, fileName: ref.fileName, entryIndex: entryIdx, entry });
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/lua — list reference Lua sections
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'lua' && !parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const ref = refFiles[idx];
        const luaCode = ref.data.lua || '';
        if (!luaCode) {
          return jsonRes(res, { index: idx, fileName: ref.fileName, count: 0, sections: [] });
        }
        const sections = deps.parseLuaSections(luaCode);
        const result = sections.map((s, i) => ({
          index: i,
          name: s.name,
          contentSize: s.content.length,
        }));
        return jsonRes(res, { index: idx, fileName: ref.fileName, count: result.length, sections: result });
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/lua/batch — batch read reference Lua sections
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'lua' && parts[3] === 'batch' && req.method === 'POST') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const body = await readJsonBody(req, res, `reference/${idx}/lua/batch`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return jsonRes(res, { error: 'indices must be an array of numbers' }, 400);
        }
        const MAX_BATCH = 20;
        if (indices.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} indices per batch` }, 400);
        }
        const luaCode = refFiles[idx].data.lua || '';
        const sections = luaCode ? deps.parseLuaSections(luaCode) : [];
        const result = indices.map((sIdx: number) => {
          if (typeof sIdx !== 'number' || sIdx < 0 || sIdx >= sections.length) return null;
          return { index: sIdx, name: sections[sIdx].name, content: sections[sIdx].content };
        });
        return jsonRes(res, {
          refIndex: idx,
          fileName: refFiles[idx].fileName,
          count: result.filter(Boolean).length,
          total: indices.length,
          sections: result,
        });
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/lua/:sectionIdx — read single reference Lua section
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'lua' && parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const ref = refFiles[idx];
        const luaCode = ref.data.lua || '';
        const sections = luaCode ? deps.parseLuaSections(luaCode) : [];
        const sectionIdx = parseInt(parts[3], 10);
        if (isNaN(sectionIdx) || sectionIdx < 0 || sectionIdx >= sections.length) {
          return jsonRes(
            res,
            { error: `Lua section index ${sectionIdx} out of range (0-${sections.length - 1})` },
            400,
          );
        }
        return jsonRes(res, {
          refIndex: idx,
          fileName: ref.fileName,
          sectionIndex: sectionIdx,
          name: sections[sectionIdx].name,
          content: sections[sectionIdx].content,
        });
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/css — list reference CSS sections
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'css' && !parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const ref = refFiles[idx];
        const cssCode = ref.data.css || '';
        if (!cssCode) {
          return jsonRes(res, { index: idx, fileName: ref.fileName, count: 0, sections: [] });
        }
        const cssResult = deps.parseCssSections(cssCode);
        const result = cssResult.sections.map((s, i) => ({
          index: i,
          name: s.name,
          contentSize: s.content.length,
        }));
        return jsonRes(res, { index: idx, fileName: ref.fileName, count: result.length, sections: result });
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/css/batch — batch read reference CSS sections
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'css' && parts[3] === 'batch' && req.method === 'POST') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const body = await readJsonBody(req, res, `reference/${idx}/css/batch`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return jsonRes(res, { error: 'indices must be an array of numbers' }, 400);
        }
        const MAX_BATCH = 20;
        if (indices.length > MAX_BATCH) {
          return jsonRes(res, { error: `Maximum ${MAX_BATCH} indices per batch` }, 400);
        }
        const cssCode = refFiles[idx].data.css || '';
        const cssResult = cssCode
          ? deps.parseCssSections(cssCode)
          : { sections: [] as Section[], prefix: '', suffix: '' };
        const result = indices.map((sIdx: number) => {
          if (typeof sIdx !== 'number' || sIdx < 0 || sIdx >= cssResult.sections.length) return null;
          return { index: sIdx, name: cssResult.sections[sIdx].name, content: cssResult.sections[sIdx].content };
        });
        return jsonRes(res, {
          refIndex: idx,
          fileName: refFiles[idx].fileName,
          count: result.filter(Boolean).length,
          total: indices.length,
          sections: result,
        });
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/css/:sectionIdx — read single reference CSS section
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'css' && parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const ref = refFiles[idx];
        const cssCode = ref.data.css || '';
        const cssResult = cssCode
          ? deps.parseCssSections(cssCode)
          : { sections: [] as Section[], prefix: '', suffix: '' };
        const sectionIdx = parseInt(parts[3], 10);
        if (isNaN(sectionIdx) || sectionIdx < 0 || sectionIdx >= cssResult.sections.length) {
          return jsonRes(
            res,
            { error: `CSS section index ${sectionIdx} out of range (0-${cssResult.sections.length - 1})` },
            400,
          );
        }
        return jsonRes(res, {
          refIndex: idx,
          fileName: ref.fileName,
          sectionIndex: sectionIdx,
          name: cssResult.sections[sectionIdx].name,
          content: cssResult.sections[sectionIdx].content,
        });
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/:field — read a reference file's field
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        const fieldName = decodeURIComponent(parts[2]);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const ref = refFiles[idx];
        if (fieldName === 'lorebook') {
          return jsonRes(res, {
            index: idx,
            fileName: ref.fileName,
            field: 'lorebook',
            content: ref.data.lorebook || [],
          });
        }
        if (fieldName === 'regex') {
          return jsonRes(res, { index: idx, fileName: ref.fileName, field: 'regex', content: ref.data.regex || [] });
        }
        if (fieldName === 'triggerScripts') {
          return jsonRes(res, {
            index: idx,
            fileName: ref.fileName,
            field: 'triggerScripts',
            content: ref.data.triggerScripts || '[]',
          });
        }
        if (fieldName === 'alternateGreetings' || fieldName === 'groupOnlyGreetings') {
          return jsonRes(res, {
            index: idx,
            fileName: ref.fileName,
            field: fieldName,
            content: ref.data[fieldName] || [],
          });
        }
        const allowedRefFields = [
          'lua',
          'globalNote',
          'firstMessage',
          'css',
          'description',
          'defaultVariables',
          'name',
        ];
        if (!allowedRefFields.includes(fieldName)) {
          return jsonRes(res, { error: `Unknown field: ${fieldName}` }, 400);
        }
        return jsonRes(res, {
          index: idx,
          fileName: ref.fileName,
          field: fieldName,
          content: ref.data[fieldName] || '',
        });
      }

      // ----------------------------------------------------------------
      // GET /assets — list all assets (path + size)
      // ----------------------------------------------------------------
      if (parts[0] === 'assets' && !parts[1] && req.method === 'GET') {
        const assets = currentData.assets || [];
        return jsonRes(res, {
          count: assets.length,
          assets: assets.map((a: any, i: number) => ({
            index: i,
            path: a.path,
            size: a.data ? a.data.length : 0,
          })),
        });
      }

      // ----------------------------------------------------------------
      // GET /asset/:idx — read asset as base64
      // ----------------------------------------------------------------
      if (parts[0] === 'asset' && parts[1] && !parts[2] && req.method === 'GET') {
        const assets = currentData.assets || [];
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= assets.length) {
          return mcpError(res, 400, {
            action: 'read_asset',
            message: `에셋 index ${idx}이(가) 범위를 벗어났습니다 (0–${assets.length - 1}).`,
            suggestion: 'list_assets 또는 GET /assets 로 유효한 index를 다시 확인하세요.',
            target: `asset:${idx}`,
          });
        }
        const asset = assets[idx];
        const ext = (asset.path.split('.').pop() || 'png').toLowerCase();
        const mime =
          ext === 'png'
            ? 'image/png'
            : ext === 'webp'
              ? 'image/webp'
              : ext === 'gif'
                ? 'image/gif'
                : ext === 'svg'
                  ? 'image/svg+xml'
                  : 'image/jpeg';
        return jsonRes(res, {
          index: idx,
          path: asset.path,
          size: asset.data ? asset.data.length : 0,
          mimeType: mime,
          base64: asset.data ? asset.data.toString('base64') : '',
        });
      }

      // ----------------------------------------------------------------
      // POST /asset/add — add asset from base64 data
      // ----------------------------------------------------------------
      if (parts[0] === 'asset' && parts[1] === 'add' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const fileName: string = body.fileName || '';
        const base64Data: string = body.base64 || '';
        const folder: string = body.folder || 'other';
        if (!fileName || !base64Data) {
          return jsonRes(res, { error: 'fileName과 base64 데이터가 필요합니다.' }, 400);
        }
        if (!/^[a-zA-Z0-9가-힣._\- ]+$/.test(fileName)) {
          return jsonRes(res, { error: '파일명에 허용되지 않는 문자가 포함되어 있습니다.' }, 400);
        }
        const allowed = await deps.askRendererConfirm(
          'MCP 에셋 추가 요청',
          `AI 어시스턴트가 에셋 "${fileName}" (폴더: ${folder})을(를) 추가하려 합니다. 허용하시겠습니까?`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'add_asset',
            message: '사용자가 에셋 추가를 거부했습니다.',
            rejected: true,
            suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
            target: fileName,
          });
        }
        const basePath = folder === 'icon' ? 'assets/icon' : 'assets/other/image';
        const assetPath = `${basePath}/${fileName}`;
        if (currentData.assets.find((a: any) => a.path === assetPath)) {
          return jsonRes(res, { error: `에셋 경로 "${assetPath}"가 이미 존재합니다.` }, 409);
        }
        const buf = Buffer.from(base64Data, 'base64');
        currentData.assets.push({ path: assetPath, data: buf });
        // Sync cardAssets for RisuAI (charx only)
        if (Array.isArray(currentData.cardAssets)) {
          const ext = fileName.includes('.') ? fileName.split('.').pop()! : '';
          const name = ext ? fileName.slice(0, -(ext.length + 1)) : fileName;
          currentData.cardAssets.push({
            type: folder === 'icon' ? 'icon' : 'x-risu-asset',
            uri: `embeded://${assetPath}`,
            name,
            ext,
          });
        }
        deps.broadcastToAll('data-updated', { field: 'assets' });
        return jsonRes(res, { ok: true, path: assetPath, size: buf.length });
      }

      // ----------------------------------------------------------------
      // POST /asset/:idx/delete — delete asset by index
      // ----------------------------------------------------------------
      if (parts[0] === 'asset' && parts[1] && parts[2] === 'delete' && req.method === 'POST') {
        const assets = currentData.assets || [];
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= assets.length) {
          return mcpError(res, 400, {
            action: 'delete_asset',
            message: `에셋 index ${idx}이(가) 범위를 벗어났습니다 (0–${assets.length - 1}).`,
            suggestion: 'list_assets 또는 GET /assets 로 유효한 index를 다시 확인하세요.',
            target: `asset:${idx}`,
          });
        }
        const assetToDelete = assets[idx];
        const allowed = await deps.askRendererConfirm(
          'MCP 에셋 삭제 요청',
          `AI 어시스턴트가 에셋 "${assetToDelete.path}"을(를) 삭제하려 합니다. 허용하시겠습니까?`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'delete_asset',
            message: '사용자가 에셋 삭제를 거부했습니다.',
            rejected: true,
            suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
            target: `asset:${idx}`,
          });
        }
        assets.splice(idx, 1);
        // Remove from cardAssets
        if (Array.isArray(currentData.cardAssets)) {
          const uri = `embeded://${assetToDelete.path}`;
          const caIdx = (currentData.cardAssets as { uri?: string }[]).findIndex((a) => a.uri === uri);
          if (caIdx >= 0) currentData.cardAssets.splice(caIdx, 1);
        }
        deps.broadcastToAll('data-updated', { field: 'assets' });
        return jsonRes(res, { ok: true, deleted: assetToDelete.path });
      }

      // ----------------------------------------------------------------
      // POST /asset/:idx/rename — rename asset
      // ----------------------------------------------------------------
      if (parts[0] === 'asset' && parts[1] && parts[2] === 'rename' && req.method === 'POST') {
        const assets = currentData.assets || [];
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= assets.length) {
          return mcpError(res, 400, {
            action: 'rename_asset',
            message: `에셋 index ${idx}이(가) 범위를 벗어났습니다 (0–${assets.length - 1}).`,
            suggestion: 'list_assets 또는 GET /assets 로 유효한 index를 다시 확인하세요.',
            target: `asset:${idx}`,
          });
        }
        const body = JSON.parse(await readBody(req));
        const newName: string = body.newName || '';
        if (!newName || !/^[a-zA-Z0-9가-힣._\- ]+$/.test(newName)) {
          return jsonRes(res, { error: '유효한 newName이 필요합니다.' }, 400);
        }
        const asset = assets[idx];
        const oldPath = asset.path;
        const allowed = await deps.askRendererConfirm(
          'MCP 에셋 이름 변경 요청',
          `AI 어시스턴트가 에셋 "${oldPath}"의 이름을 "${newName}"(으)로 변경하려 합니다. 허용하시겠습니까?`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'rename_asset',
            message: '사용자가 에셋 이름 변경을 거부했습니다.',
            rejected: true,
            suggestion: '앱에서 이름 변경 요청을 허용한 뒤 다시 시도하세요.',
            target: `asset:${idx}`,
          });
        }
        const dir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
        const newPath = dir + newName;
        asset.path = newPath;
        // Update cardAssets
        if (Array.isArray(currentData.cardAssets)) {
          const oldUri = `embeded://${oldPath}`;
          const ca = (currentData.cardAssets as Record<string, unknown>[]).find((a) => a.uri === oldUri);
          if (ca) {
            const ext = newName.includes('.') ? newName.split('.').pop()! : '';
            ca.uri = `embeded://${newPath}`;
            ca.name = ext ? newName.slice(0, -(ext.length + 1)) : newName;
            ca.ext = ext;
          }
        }
        deps.broadcastToAll('data-updated', { field: 'assets' });
        return jsonRes(res, { ok: true, oldPath, newPath });
      }

      // ----------------------------------------------------------------
      // POST /assets/compress-webp — compress all assets to WebP
      // ----------------------------------------------------------------
      if (parts[0] === 'assets' && parts[1] === 'compress-webp' && req.method === 'POST') {
        const assets: { path: string; data: Buffer }[] = currentData.assets || [];
        if (assets.length === 0) {
          return mcpError(res, 400, {
            action: 'compress-webp',
            message: 'No assets found in file.',
            target: 'assets',
          });
        }

        const body = await readJsonBody(req, res, 'assets/compress-webp', broadcastStatus);
        if (!body) return;

        const quality = typeof body.quality === 'number' ? body.quality : 80;
        const recompressWebp = body.recompressWebp === true;

        // Lazy-load image compressor
        let compressAssetsToWebP: typeof import('./image-compressor').compressAssetsToWebP;
        let updateAssetReferences: typeof import('./image-compressor').updateAssetReferences;
        let formatBytes: typeof import('./image-compressor').formatBytes;
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const mod = require('./image-compressor');
          compressAssetsToWebP = mod.compressAssetsToWebP;
          updateAssetReferences = mod.updateAssetReferences;
          formatBytes = mod.formatBytes;
        } catch (err: unknown) {
          return mcpError(res, 500, {
            action: 'compress-webp',
            message: `Image compressor module not available: ${err instanceof Error ? err.message : String(err)}`,
            target: 'assets',
          });
        }

        // Pre-compute to show in confirmation
        const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'tif', 'avif', 'webp']);
        const convertible = assets.filter((a) => {
          const ext = a.path.split('.').pop()?.toLowerCase() || '';
          if (ext === 'svg') return false;
          if (ext === 'webp' && !recompressWebp) return false;
          return imageExts.has(ext);
        });

        if (convertible.length === 0) {
          return jsonRes(res, {
            ok: true,
            message: 'No convertible assets found.',
            stats: {
              total: assets.length,
              converted: 0,
              skipped: assets.length,
              failed: 0,
              larger: 0,
              originalSize: assets.reduce((s, a) => s + a.data.length, 0),
              compressedSize: assets.reduce((s, a) => s + a.data.length, 0),
              savedBytes: 0,
              savedPercent: 0,
            },
          });
        }

        const totalSize = assets.reduce((s, a) => s + a.data.length, 0);
        const allowed = await deps.askRendererConfirm(
          'WebP 에셋 압축',
          `${convertible.length}개 이미지를 WebP (품질 ${quality})로 변환합니다.\n` +
            `전체 에셋: ${assets.length}개 (${formatBytes(totalSize)})\n` +
            `변환 대상: ${convertible.length}개\n\n` +
            `원본 파일은 교체되며 되돌릴 수 없습니다.`,
        );

        if (!allowed) {
          return mcpError(res, 403, {
            action: 'compress-webp',
            message: 'User rejected the compression request.',
            target: 'assets',
            rejected: true,
          });
        }

        try {
          const result = await compressAssetsToWebP(assets, {
            quality,
            recompressWebp,
          });

          // Build path map for reference updates
          const pathMap = new Map<string, string>();
          for (const d of result.details) {
            if (d.status === 'converted' && d.originalPath !== d.newPath) {
              pathMap.set(d.originalPath, d.newPath);
            }
          }

          // Replace assets in-place
          currentData.assets = result.assets;

          // Update references if paths changed
          let refsUpdated = { cardAssetsUpdated: 0, xMetaUpdated: 0 };
          if (pathMap.size > 0) {
            refsUpdated = updateAssetReferences(pathMap, currentData.cardAssets || [], currentData.xMeta || {});
          }

          deps.broadcastToAll('data-updated', { field: 'assets' });
          logMcpMutation('compress-webp', 'assets', {
            quality,
            converted: result.stats.converted,
            savedBytes: result.stats.savedBytes,
          });

          return jsonRes(res, {
            ok: true,
            stats: result.stats,
            referencesUpdated: refsUpdated,
            details: result.details.map((d) => ({
              originalPath: d.originalPath,
              newPath: d.newPath,
              originalSize: d.originalSize,
              newSize: d.newSize,
              status: d.status,
              reason: d.reason,
            })),
          });
        } catch (err: unknown) {
          return mcpError(res, 500, {
            action: 'compress-webp',
            message: `Compression failed: ${err instanceof Error ? err.message : String(err)}`,
            target: 'assets',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /lorebook/export — export lorebook to files
      // ----------------------------------------------------------------
      if (parts[0] === 'lorebook' && parts[1] === 'export' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'lorebook/export', broadcastStatus);
        if (!body) return;

        const targetDir = typeof body.target_dir === 'string' ? body.target_dir.trim() : '';
        if (!targetDir) {
          return mcpError(res, 400, {
            action: 'export-lorebook',
            message: 'target_dir is required.',
            target: 'lorebook',
          });
        }

        const format = body.format === 'json' ? 'json' : 'md';
        const groupByFolder = body.group_by_folder !== false;
        const filter = typeof body.filter === 'string' ? body.filter : undefined;
        const folder = typeof body.folder === 'string' ? body.folder : undefined;

        // Filter entries
        let entries = [...((currentData.lorebook as Record<string, unknown>[]) || [])];
        if (filter) {
          const lowerFilter = filter.toLowerCase();
          entries = entries.filter((e) => {
            const comment = String(e.comment || '').toLowerCase();
            const key = String(e.key || '').toLowerCase();
            return comment.includes(lowerFilter) || key.includes(lowerFilter) || e.mode === 'folder';
          });
        }
        if (folder) {
          const folderId = folder.startsWith('folder:') ? folder : `folder:${folder}`;
          entries = entries.filter((e) => e.folder === folderId || e.mode === 'folder');
        }

        const nonFolderCount = entries.filter((e) => e.mode !== 'folder').length;
        if (nonFolderCount === 0) {
          return mcpError(res, 400, {
            action: 'export-lorebook',
            message: 'No entries to export.',
            target: 'lorebook',
          });
        }

        // User confirmation
        const confirmMsg =
          `AI 어시스턴트가 로어북 ${nonFolderCount}개 항목을 내보내려 합니다.\n\n` +
          `형식: ${format.toUpperCase()}\n` +
          `경로: ${targetDir}`;
        const allowed = await deps.askRendererConfirm('MCP 내보내기 요청', confirmMsg);
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'export-lorebook',
            message: 'User rejected export.',
            target: 'lorebook',
          });
        }

        try {
          // Lazy-load lorebook-io
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const lorebookIo = require('./lorebook-io') as typeof import('./lorebook-io');

          const options = {
            format: format as 'md' | 'json',
            groupByFolder,
            includeMetadata: true,
            sourceName: String((currentData as Record<string, unknown>).name || 'unknown'),
          };

          const result =
            format === 'json'
              ? await lorebookIo.exportToJson(entries, targetDir, options)
              : await lorebookIo.exportToMarkdown(entries, targetDir, options);

          broadcastStatus({
            type: 'success',
            action: 'export-lorebook',
            message: `Exported ${result.exportedCount} entries to ${format.toUpperCase()}.`,
          });

          return jsonRes(res, result);
        } catch (err: unknown) {
          return mcpError(res, 500, {
            action: 'export-lorebook',
            message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
            target: 'lorebook',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /lorebook/import — import lorebook from files
      // ----------------------------------------------------------------
      if (parts[0] === 'lorebook' && parts[1] === 'import' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'lorebook/import', broadcastStatus);
        if (!body) return;

        const format = body.format === 'json' ? 'json' : 'md';
        const sourcePath = typeof body.source_path === 'string' ? body.source_path.trim() : '';
        const sourceDir = typeof body.source_dir === 'string' ? body.source_dir.trim() : '';
        const source = format === 'json' ? sourcePath : sourceDir;

        if (!source) {
          return mcpError(res, 400, {
            action: 'import-lorebook',
            message:
              format === 'json' ? 'source_path is required for JSON format.' : 'source_dir is required for MD format.',
            target: 'lorebook',
          });
        }

        const createFolders = body.create_folders !== false;
        const conflict = ['skip', 'overwrite', 'rename'].includes(body.conflict)
          ? (body.conflict as 'skip' | 'overwrite' | 'rename')
          : 'skip';
        const dryRun = body.dry_run === true;

        try {
          // Lazy-load lorebook-io
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const lorebookIo = require('./lorebook-io') as typeof import('./lorebook-io');

          // Parse import entries
          const importEntries =
            format === 'json' ? await lorebookIo.importFromJson(source) : await lorebookIo.importFromMarkdown(source);

          if (importEntries.length === 0) {
            return jsonRes(res, {
              success: true,
              totalFound: 0,
              imported: 0,
              message: 'No entries found to import.',
            });
          }

          // Resolve conflicts
          const existingEntries = (currentData.lorebook as Record<string, unknown>[]) || [];
          const existingFolderMap = lorebookIo.buildFolderMap(existingEntries);
          const resolution = lorebookIo.resolveImportConflicts(importEntries, existingEntries, existingFolderMap, {
            conflict,
            createFolders,
          });

          // Dry run: return preview without changes
          if (dryRun) {
            return jsonRes(res, {
              success: true,
              dryRun: true,
              totalFound: importEntries.length,
              toAdd: resolution.toAdd.length,
              toOverwrite: resolution.toOverwrite.length,
              skipped: resolution.skipped.length,
              renamed: resolution.renamed.length,
              newFolders: resolution.newFolders,
              skippedEntries: resolution.skipped,
              renamedEntries: resolution.renamed,
            });
          }

          // User confirmation
          const summary = [
            `AI 어시스턴트가 로어북에 항목을 가져오려 합니다.`,
            ``,
            `파일 수: ${importEntries.length}개`,
            `추가: ${resolution.toAdd.length}개`,
            resolution.toOverwrite.length > 0 ? `덮어쓰기: ${resolution.toOverwrite.length}개` : '',
            resolution.skipped.length > 0 ? `건너뛰기: ${resolution.skipped.length}개` : '',
            resolution.renamed.length > 0 ? `이름 변경: ${resolution.renamed.length}개` : '',
            resolution.newFolders.length > 0 ? `새 폴더: ${resolution.newFolders.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('\n');

          const allowed = await deps.askRendererConfirm('MCP 가져오기 요청', summary);
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'import-lorebook',
              message: 'User rejected import.',
              target: 'lorebook',
            });
          }

          // Execute import
          const errors: string[] = [];
          let foldersCreated = 0;

          // 1. Create new folders first
          const newFolderIds = new Map<string, string>(); // folderName → folderId
          for (const folderName of resolution.newFolders) {
            const folderEntry: Record<string, unknown> = {
              comment: folderName,
              key: '',
              content: '',
              mode: 'folder',
              id: crypto.randomUUID(),
              insertorder: 100,
            };
            (currentData.lorebook as unknown[]).push(folderEntry);
            newFolderIds.set(folderName, `folder:${folderEntry.id as string}`);
            foldersCreated++;
          }

          // Merge new folder IDs with existing
          const allFolderByName = new Map<string, string>();
          for (const [id, name] of existingFolderMap) {
            allFolderByName.set(name, id);
          }
          for (const [name, id] of newFolderIds) {
            allFolderByName.set(name, id);
          }

          // 2. Add new entries
          for (const entry of resolution.toAdd) {
            // Find folder ID from the import entry's folderName
            const importEntry = importEntries.find((ie) => ie.data === entry || ie.data.comment === entry.comment);
            if (importEntry?.folderName) {
              const folderId = allFolderByName.get(importEntry.folderName);
              if (folderId) {
                entry.folder = folderId;
              }
            }
            (currentData.lorebook as unknown[]).push(entry);
          }

          // 3. Overwrite existing entries
          for (const { index, data } of resolution.toOverwrite) {
            const existing = (currentData.lorebook as Record<string, unknown>[])[index];
            if (existing) {
              for (const [key, value] of Object.entries(data)) {
                if (LOREBOOK_ALLOWED_FIELDS.has(key)) {
                  existing[key] = value;
                }
              }
            }
          }

          // Broadcast update
          deps.broadcastToAll('data-updated', {
            lorebook: currentData.lorebook,
          });

          broadcastStatus({
            type: 'success',
            action: 'import-lorebook',
            message: `Imported ${resolution.toAdd.length + resolution.toOverwrite.length} entries.`,
          });

          return jsonRes(res, {
            success: true,
            totalFound: importEntries.length,
            imported: resolution.toAdd.length,
            overwritten: resolution.toOverwrite.length,
            skipped: resolution.skipped.length,
            renamed: resolution.renamed.length,
            foldersCreated,
            errors,
          });
        } catch (err: unknown) {
          return mcpError(res, 500, {
            action: 'import-lorebook',
            message: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
            target: 'lorebook',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /field/export — export a field to a file
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] === 'export' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'field/export', broadcastStatus);
        if (!body) return;

        const field = typeof body.field === 'string' ? body.field.trim() : '';
        const filePath = typeof body.file_path === 'string' ? body.file_path.trim() : '';
        const format = body.format === 'md' ? 'md' : 'txt';

        if (!field) {
          return mcpError(res, 400, {
            action: 'export-field',
            message: 'field is required.',
            target: 'field',
          });
        }
        if (!filePath) {
          return mcpError(res, 400, {
            action: 'export-field',
            message: 'file_path is required.',
            target: 'field',
          });
        }

        const value = (currentData as Record<string, unknown>)[field];
        if (value === undefined || value === null) {
          return mcpError(res, 404, {
            action: 'export-field',
            message: `Field "${field}" not found or empty.`,
            target: 'field',
          });
        }

        const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

        // User confirmation
        const confirmMsg =
          `AI 어시스턴트가 "${field}" 필드를 파일로 내보내려 합니다.\n\n` +
          `경로: ${filePath}\n` +
          `크기: ${Buffer.byteLength(content, 'utf-8').toLocaleString()} bytes`;
        const allowed = await deps.askRendererConfirm('MCP 필드 내보내기', confirmMsg);
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'export-field',
            message: 'User rejected export.',
            target: 'field',
          });
        }

        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const lorebookIo = require('./lorebook-io') as typeof import('./lorebook-io');
          const result = await lorebookIo.exportFieldToFile(field, content, filePath, format);

          broadcastStatus({
            type: 'success',
            action: 'export-field',
            message: `Exported "${field}" to ${filePath}.`,
          });

          return jsonRes(res, result);
        } catch (err: unknown) {
          return mcpError(res, 500, {
            action: 'export-field',
            message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
            target: 'field',
          });
        }
      }

      // ----------------------------------------------------------------
      // GET /risum-assets — list embedded risum module assets
      // ----------------------------------------------------------------
      if (parts[0] === 'risum-assets' && !parts[1] && req.method === 'GET') {
        const risumAssets: Buffer[] = currentData.risumAssets || [];
        const modAssets: unknown[] =
          (((currentData._moduleData as Record<string, unknown>)?.module as Record<string, unknown>)
            ?.assets as unknown[]) ||
          ((currentData._moduleData as Record<string, unknown>)?.assets as unknown[]) ||
          [];
        const items = risumAssets.map((buf: Buffer, i: number) => {
          const meta = Array.isArray(modAssets[i]) ? (modAssets[i] as string[]) : null;
          return {
            index: i,
            name: meta?.[0] || `asset_${i}`,
            path: meta?.[2] || '',
            size: buf.length,
          };
        });
        return jsonRes(res, { count: items.length, assets: items });
      }

      // ----------------------------------------------------------------
      // GET /risum-asset/:idx — read risum asset as base64
      // ----------------------------------------------------------------
      if (parts[0] === 'risum-asset' && parts[1] && !parts[2] && req.method === 'GET') {
        const risumAssets: Buffer[] = currentData.risumAssets || [];
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= risumAssets.length) {
          return mcpError(res, 400, {
            action: 'read_risum_asset',
            message: `리슘 에셋 index ${idx}이(가) 범위를 벗어났습니다 (0–${risumAssets.length - 1}).`,
            suggestion: 'list_risum_assets 또는 GET /risum-assets 로 유효한 index를 다시 확인하세요.',
            target: `risum-asset:${idx}`,
          });
        }
        const modAssets: unknown[] =
          (((currentData._moduleData as Record<string, unknown>)?.module as Record<string, unknown>)
            ?.assets as unknown[]) ||
          ((currentData._moduleData as Record<string, unknown>)?.assets as unknown[]) ||
          [];
        const meta = Array.isArray(modAssets[idx]) ? (modAssets[idx] as string[]) : null;
        const assetBuf = risumAssets[idx];
        return jsonRes(res, {
          index: idx,
          name: meta?.[0] || `asset_${idx}`,
          path: meta?.[2] || '',
          size: assetBuf.length,
          base64: assetBuf.toString('base64'),
        });
      }

      // ----------------------------------------------------------------
      // POST /risum-asset/add — add risum asset from base64
      // ----------------------------------------------------------------
      if (parts[0] === 'risum-asset' && parts[1] === 'add' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const assetName: string = body.name || '';
        const assetPath: string = body.path || '';
        const base64Data: string = body.base64 || '';
        if (!assetName || !base64Data) {
          return jsonRes(res, { error: 'name과 base64 데이터가 필요합니다.' }, 400);
        }
        const allowed = await deps.askRendererConfirm(
          'MCP 리슘 에셋 추가 요청',
          `AI 어시스턴트가 리슘 에셋 "${assetName}"을(를) 추가하려 합니다. 허용하시겠습니까?`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'add_risum_asset',
            message: '사용자가 에셋 추가를 거부했습니다.',
            rejected: true,
            suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
            target: assetName,
          });
        }
        const buf = Buffer.from(base64Data, 'base64');
        if (!currentData.risumAssets) currentData.risumAssets = [];
        currentData.risumAssets.push(buf);
        // Update module asset metadata
        const modData = currentData._moduleData as Record<string, unknown>;
        if (modData) {
          const mod = (modData.module as Record<string, unknown>) || modData;
          if (!Array.isArray(mod.assets)) mod.assets = [];
          (mod.assets as unknown[]).push([assetName, '', assetPath || assetName]);
        }
        // Sync to card.json assets (charx only)
        const addFileType = currentData._fileType || 'charx';
        if (addFileType === 'charx' && Array.isArray(currentData.cardAssets)) {
          const ext = (assetPath || assetName).split('.').pop() || 'png';
          currentData.cardAssets.push({
            type: 'module',
            uri: `embeded://${assetPath || assetName}`,
            name: assetName,
            ext,
          });
        }
        if (deps.invalidateAssetsMapCache) deps.invalidateAssetsMapCache();
        deps.broadcastToAll('data-updated', { field: 'risumAssets' });
        return jsonRes(res, { ok: true, index: currentData.risumAssets.length - 1, name: assetName, size: buf.length });
      }

      // ----------------------------------------------------------------
      // POST /risum-asset/:idx/delete — delete risum asset
      // ----------------------------------------------------------------
      if (parts[0] === 'risum-asset' && parts[1] && parts[2] === 'delete' && req.method === 'POST') {
        const risumAssets: Buffer[] = currentData.risumAssets || [];
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= risumAssets.length) {
          return mcpError(res, 400, {
            action: 'delete_risum_asset',
            message: `리슘 에셋 index ${idx}이(가) 범위를 벗어났습니다 (0–${risumAssets.length - 1}).`,
            suggestion: 'list_risum_assets 또는 GET /risum-assets 로 유효한 index를 다시 확인하세요.',
            target: `risum-asset:${idx}`,
          });
        }
        const modAssets: unknown[] =
          (((currentData._moduleData as Record<string, unknown>)?.module as Record<string, unknown>)
            ?.assets as unknown[]) ||
          ((currentData._moduleData as Record<string, unknown>)?.assets as unknown[]) ||
          [];
        const meta = Array.isArray(modAssets[idx]) ? (modAssets[idx] as string[]) : null;
        const deleteName = meta?.[0] || `asset_${idx}`;
        const allowed = await deps.askRendererConfirm(
          'MCP 리슘 에셋 삭제 요청',
          `AI 어시스턴트가 리슘 에셋 "${deleteName}"을(를) 삭제하려 합니다. 허용하시겠습니까?`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'delete_risum_asset',
            message: '사용자가 에셋 삭제를 거부했습니다.',
            rejected: true,
            suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
            target: `risum-asset:${idx}`,
          });
        }
        risumAssets.splice(idx, 1);
        // Also remove from module metadata
        if (Array.isArray(modAssets) && idx < modAssets.length) {
          modAssets.splice(idx, 1);
        }
        // Sync removal from card.json assets (charx only)
        const delFileType = currentData._fileType || 'charx';
        if (delFileType === 'charx' && Array.isArray(currentData.cardAssets)) {
          const cardIdx = (currentData.cardAssets as { name?: string }[]).findIndex((ca) => ca.name === deleteName);
          if (cardIdx >= 0) currentData.cardAssets.splice(cardIdx, 1);
        }
        if (deps.invalidateAssetsMapCache) deps.invalidateAssetsMapCache();
        deps.broadcastToAll('data-updated', { field: 'risumAssets' });
        return jsonRes(res, { ok: true, deleted: deleteName });
      }

      // ----------------------------------------------------------------
      // GET /skills — list available skill documents
      // ----------------------------------------------------------------
      if (parts[0] === 'skills' && !parts[1] && req.method === 'GET') {
        const skillsDir = deps.getSkillsDir();
        try {
          const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
          const skills: { name: string; description: string; files: string[] }[] = [];
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
            if (!fs.existsSync(skillMdPath)) continue;
            const raw = fs.readFileSync(skillMdPath, 'utf-8');
            const fm = parseYamlFrontmatter(raw);
            const dirFiles = fs.readdirSync(path.join(skillsDir, entry.name)).filter((f) => f.endsWith('.md'));
            skills.push({
              name: fm.name || entry.name,
              description: fm.description || '',
              files: dirFiles,
            });
          }
          return jsonRes(res, { count: skills.length, skills });
        } catch {
          return jsonRes(res, { count: 0, skills: [], error: 'Skills directory not found' });
        }
      }

      // ----------------------------------------------------------------
      // GET /skills/:name — read SKILL.md of a specific skill
      // GET /skills/:name/:file — read a reference file within a skill
      // ----------------------------------------------------------------
      if (parts[0] === 'skills' && parts[1] && req.method === 'GET') {
        const skillName = decodeURIComponent(parts[1]);
        const fileName = parts[2] ? decodeURIComponent(parts[2]) : 'SKILL.md';
        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
          return jsonRes(res, { error: 'Invalid file name' }, 400);
        }
        const filePath = path.join(deps.getSkillsDir(), skillName, fileName);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          return jsonRes(res, { skill: skillName, file: fileName, content });
        } catch {
          return mcpError(res, 404, {
            action: 'read_skill',
            message: `Skill file not found: ${skillName}/${fileName}`,
            suggestion: 'list_skills로 사용 가능한 스킬 목록을 확인하세요.',
            target: `skills/${skillName}/${fileName}`,
          });
        }
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
    } catch (err) {
      mcpError(
        res,
        500,
        {
          action: `${req.method} ${url.pathname}`,
          message: (err as Error).message,
          suggestion: '요청 payload와 현재 열려 있는 데이터를 확인한 뒤 다시 시도하세요.',
          target: url.pathname,
        },
        err,
      );
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
