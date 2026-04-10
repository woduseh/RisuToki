import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { handleCbsRoute } from './mcp-cbs-routes';
import {
  buildFolderInfoMap,
  canonicalizeLorebookFolderRefs,
  getFolderRef,
  getFolderUuid,
  normalizeFolderRef,
  resolveLorebookFolderRef,
} from './lorebook-folders';
import { SEARCHABLE_TEXT_FIELDS, searchAllTextSurfaces, searchTextBlock } from './mcp-search';
import {
  parsePromptTemplate,
  serializePromptTemplate,
  parseFormatingOrder,
  collectFormatingOrderWarnings,
  validateLocalStopStringsText,
  validatePresetBiasText,
  validatePromptTemplateText,
  validateFormatingOrderText,
  type PromptItemModel,
} from './risup-prompt-model';
import { mcpSuccess, errorRecoveryMeta, type McpErrorInfo, type McpSuccessOptions } from './mcp-response-envelope';
import { normalizeLF, extToMime, cloneJson } from './shared-utils';
import { REF_SCALAR_FIELDS, REF_ALLOWED_READ_FIELDS, getRefFileType } from './reference-store';
import {
  replaceBodySchema,
  blockReplaceBodySchema,
  insertBodySchema,
  batchReplaceBodySchema,
  searchBodySchema,
  searchAllBodySchema,
  fieldBatchReadSchema,
  fieldBatchWriteSchema,
  externalDocumentBodySchema,
  validateBody,
  type ExternalDocumentBody,
} from './mcp-request-schemas';
import {
  BOOLEAN_FIELD_NAMES,
  FIELD_RESERVED_PATHS,
  MAX_FIELD_BATCH,
  NUMBER_FIELD_NAMES,
  SUPPORTED_EXTERNAL_FILE_TYPES,
  buildFieldBatchReadResults,
  buildFieldReadResponsePayload,
  getFieldAccessRules,
  getStringMutationFieldStatus,
  getUnknownFieldHint,
  type SupportedFileType,
} from './mcp-field-access';

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

export interface McpPendingRecoveryStatus {
  autosavePath: string;
  dirtyFields: string[];
  sourceFilePath: string;
  staleWarning: string | null;
}

export interface McpLastRestoredStatus {
  appVersion: string;
  autosavePath: string;
  dirtyFields: string[];
  savedAt: string;
  sourceFilePath: string | null;
  sourceFileType: 'charx' | 'risum' | 'risup';
}

export interface McpRendererSessionStatus {
  autosaveDir: string;
  autosaveEnabled: boolean;
  autosaveInterval: number;
  dirtyFieldCount: number;
  dirtyFields: string[];
  documentSwitchInProgress: boolean;
  hasUnsavedChanges: boolean;
}

export interface McpSessionStatus {
  currentFilePath: string | null;
  currentFileType: 'charx' | 'risum' | 'risup' | null;
  lastRestored: McpLastRestoredStatus | null;
  pendingRecovery: McpPendingRecoveryStatus | null;
  renderer: McpRendererSessionStatus | null;
}

export interface McpApiDeps {
  /** Return the current in-memory document data (mutated directly by routes). */
  getCurrentData: () => any;
  /** Return the loaded reference files array. */
  getReferenceFiles: () => any[];
  /** Show a confirmation dialog in the renderer and resolve with the user's choice. */
  askRendererConfirm: (title: string, message: string) => Promise<boolean>;
  /** Ask the renderer to switch the active document to a specific external file path. */
  requestRendererOpenFile: (request: RendererOpenFileRequest) => Promise<RendererOpenFileResponse>;
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
  openExternalDocument: (filePath: string) => any;
  normalizeTriggerScripts: (data: any) => any;
  extractPrimaryLua: (scripts: any) => string;
  mergePrimaryLua: (scripts: any, lua: string) => any;
  stringifyTriggerScripts: (scripts: any) => string;

  // skills directory
  getSkillsDir: () => string;

  // session metadata
  getSessionStatus?: () => Promise<McpSessionStatus> | McpSessionStatus;
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

export interface RendererOpenFileRequest {
  filePath: string;
  fileType: SupportedFileType;
  saveCurrent: boolean;
  targetLabel: string;
}

export interface RendererOpenFileResponse {
  success: boolean;
  alreadyOpen?: boolean;
  canceled?: boolean;
  error?: string;
  filePath?: string;
  fileType?: SupportedFileType;
  name?: string;
  suggestion?: string;
}

// In-memory snapshot storage for field rollback (cleared on file reload)
interface FieldSnapshot {
  id: string;
  field: string;
  timestamp: string;
  size: number;
  content: unknown;
}
const fieldSnapshots = new Map<string, FieldSnapshot[]>();

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

interface SkillFrontmatter {
  name: string;
  description: string;
  tags: string[];
  relatedTools: string[];
}

function parseFrontmatterScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1).trim();
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseFrontmatterString(block: string, key: string): string {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)\\s*$`, 'm'));
  return match ? parseFrontmatterScalar(match[1]) : '';
}

function parseInlineStringArray(block: string, key: string): string[] {
  const match = block.match(new RegExp(`^${key}:\\s*(\\[[^\\n]*\\])\\s*$`, 'm'));
  if (!match) return [];
  const rawArray = match[1].trim();
  try {
    const parsed = JSON.parse(rawArray) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    if (!(rawArray.startsWith('[') && rawArray.endsWith(']'))) return [];
    const inner = rawArray.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((item) => parseFrontmatterScalar(item))
      .filter((item) => item.length > 0);
  }
}

/** Extract supported skill metadata fields from YAML frontmatter (--- delimited). */
function parseYamlFrontmatter(raw: string): SkillFrontmatter {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { name: '', description: '', tags: [], relatedTools: [] };
  const block = m[1];
  return {
    name: parseFrontmatterString(block, 'name'),
    description: parseFrontmatterString(block, 'description'),
    tags: parseInlineStringArray(block, 'tags'),
    relatedTools: parseInlineStringArray(block, 'related_tools'),
  };
}

function jsonRes(res: http.ServerResponse, data: unknown, status?: number): void {
  res.writeHead(status || 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function logMcpMutation(action: string, target: string, details: Record<string, unknown>): void {
  console.log(`[main][mcp] ${action}:`, { target, ...details });
}

function promptItemPreview(item: PromptItemModel): string {
  if (!item.supported) {
    return `[unsupported: ${item.type ?? 'unknown'}]`;
  }
  switch (item.type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
    case 'chatML': {
      const t = item.text || '';
      return t.slice(0, 80) + (t.length > 80 ? '…' : '');
    }
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
      return item.innerFormat ? `[innerFormat: ${item.innerFormat.slice(0, 60)}]` : `[${item.type}]`;
    case 'authornote': {
      const dt = item.defaultText;
      const inf = item.innerFormat;
      return dt
        ? dt.slice(0, 80) + (dt.length > 80 ? '…' : '')
        : inf
          ? `[innerFormat: ${inf.slice(0, 60)}]`
          : '[authornote]';
    }
    case 'chat':
      return `[range: ${item.rangeStart}–${item.rangeEnd}]`;
    case 'cache':
      return `[cache: ${item.name}, depth ${item.depth}, role ${item.role}]`;
  }
}

/**
 * Validate a raw item object as a supported prompt item.
 * Returns the parsed model on success, or an error string on failure.
 */
function validatePromptItemInput(item: unknown): { model: PromptItemModel } | { error: string } {
  const testModel = parsePromptTemplate(JSON.stringify([item]));
  if (testModel.state === 'invalid' || testModel.items.length === 0) {
    return { error: testModel.parseError || 'Invalid item structure.' };
  }
  const parsed = testModel.items[0];
  if (!parsed.supported) {
    return {
      error: `Unsupported item type: "${parsed.type ?? 'unknown'}". Use write_field("promptTemplate") for raw/unsupported structures.`,
    };
  }
  return { model: parsed };
}

const REFERENCE_TEXT_FIELDS = new Set<string>([...SEARCHABLE_TEXT_FIELDS, 'promptTemplate', 'formatingOrder']);

function isReferenceTextField(fieldName: string): boolean {
  return REFERENCE_TEXT_FIELDS.has(fieldName) || REF_ALLOWED_READ_FIELDS.includes(fieldName);
}

function buildReferenceFieldReadPayload(
  refData: Record<string, unknown>,
  fieldName: string,
  deps: Pick<McpApiDeps, 'stringifyTriggerScripts'>,
): Record<string, unknown> | null {
  if (fieldName === 'lorebook') {
    const lorebook = Array.isArray(refData.lorebook) ? (refData.lorebook as Array<Record<string, unknown>>) : [];
    return {
      field: 'lorebook',
      content: lorebook.map((entry) => normalizeLorebookEntryForResponse(entry, lorebook)),
    };
  }
  if (fieldName === 'regex') {
    return {
      field: 'regex',
      content: Array.isArray(refData.regex) ? refData.regex : [],
    };
  }

  const rules = getFieldAccessRules(refData);
  if (!rules.allowedFields.includes(fieldName)) {
    return null;
  }
  return buildFieldReadResponsePayload(refData, fieldName, deps);
}

function getRisupStructuredFieldError(fieldName: string, content: unknown): string | null {
  if (
    fieldName !== 'promptTemplate' &&
    fieldName !== 'formatingOrder' &&
    fieldName !== 'presetBias' &&
    fieldName !== 'localStopStrings'
  ) {
    return null;
  }
  if (typeof content !== 'string') {
    return `"${fieldName}" must be a string`;
  }
  if (fieldName === 'promptTemplate') {
    return validatePromptTemplateText(content);
  }
  if (fieldName === 'formatingOrder') {
    return validateFormatingOrderText(content);
  }
  if (fieldName === 'presetBias') {
    return validatePresetBiasText(content);
  }
  return validateLocalStopStringsText(content);
}

function getRisupStructuredFieldSuggestion(fieldName: string): string {
  return fieldName === 'promptTemplate'
    ? 'promptTemplate은 JSON 배열 문자열이어야 합니다.'
    : fieldName === 'formatingOrder'
      ? 'formatingOrder는 문자열 토큰만 포함한 JSON 배열 문자열이어야 합니다.'
      : fieldName === 'presetBias'
        ? 'presetBias는 [string, number] 쌍만 포함한 JSON 배열 문자열이어야 합니다.'
        : 'localStopStrings는 문자열만 포함한 JSON 배열 문자열이어야 합니다.';
}

type McpNoOpInfo = Omit<McpErrorInfo, 'rejected'>;

function jsonMcpError(
  res: http.ServerResponse,
  status: number,
  info: McpErrorInfo,
  broadcastStatus: (payload: Record<string, unknown>) => void,
  error?: unknown,
): void {
  const recovery = errorRecoveryMeta(info.target, status);
  const payload: Record<string, unknown> = {
    action: info.action,
    details: info.details,
    error: info.message,
    next_actions: recovery.next_actions,
    rejected: !!info.rejected,
    retryable: recovery.retryable,
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

function jsonMcpNoOp(res: http.ServerResponse, info: McpNoOpInfo, extra: Record<string, unknown> = {}): void {
  const recovery = errorRecoveryMeta(info.target, 200);
  jsonRes(res, {
    ...extra,
    action: info.action,
    details: info.details,
    error: info.message,
    message: info.message,
    next_actions: recovery.next_actions,
    retryable: false,
    status: 200,
    success: false,
    suggestion: info.suggestion,
    target: info.target,
  });
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

const REGEX_ALLOWED_FIELDS = new Set(['comment', 'type', 'find', 'replace', 'in', 'out', 'flag', 'ableFlag']);

function pickAllowedFields(source: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (allowed.has(key)) result[key] = source[key];
  }
  return result;
}

function normalizeLorebookEntryFolderIdentity(entry: Record<string, unknown>): void {
  if (entry.mode === 'folder') {
    const folderUuid = getFolderUuid(entry) || crypto.randomUUID();
    entry.key = normalizeFolderRef(folderUuid);
    entry.folder = '';
    return;
  }

  entry.folder = normalizeFolderRef(entry.folder);
}

function normalizeLorebookEntryForResponse(
  entry: Record<string, unknown>,
  lorebook: Record<string, unknown>[],
): Record<string, unknown> {
  const normalized = { ...entry };
  if (normalized.mode === 'folder') {
    normalized.key = getFolderRef(normalized) || '';
    normalized.folder = '';
    return normalized;
  }

  normalized.folder = resolveLorebookFolderRef(normalized.folder, lorebook);
  return normalized;
}

function projectLorebookEntryForResponse(
  entry: Record<string, unknown>,
  lorebook: Record<string, unknown>[],
  requestedFields?: string[],
): Record<string, unknown> {
  const normalized = normalizeLorebookEntryForResponse(entry, lorebook);
  if (!requestedFields || !Array.isArray(requestedFields)) {
    return normalized;
  }

  const projected: Record<string, unknown> = {};
  for (const field of requestedFields) {
    if (field in normalized) {
      projected[field] = normalized[field];
    }
  }
  return projected;
}

function buildLorebookListResponse(rawEntries: Record<string, unknown>[], url: URL): Record<string, unknown> {
  const folderMap = new Map<string, { name: string; entryCount: number }>();
  for (const [folderId, info] of buildFolderInfoMap(rawEntries)) {
    folderMap.set(folderId, { name: info.name, entryCount: 0 });
  }
  for (const entry of rawEntries) {
    if (entry.mode !== 'folder' && entry.folder) {
      const info = folderMap.get(resolveLorebookFolderRef(entry.folder, rawEntries));
      if (info) info.entryCount++;
    }
  }
  const folders = Array.from(folderMap.entries()).map(([id, info]) => ({
    id,
    name: info.name,
    entryCount: info.entryCount,
  }));

  const previewLengthParam = url.searchParams.get('preview_length');
  const previewLength =
    previewLengthParam !== null ? Math.min(Math.max(parseInt(previewLengthParam, 10) || 0, 0), 500) : 150;

  let entries = rawEntries.map((entry, index) => {
    const content = (entry.content as string) || '';
    const normalized = normalizeLorebookEntryForResponse(entry, rawEntries);
    const responseEntry: Record<string, unknown> = {
      index,
      comment: normalized.comment || '',
      key: normalized.key || '',
      mode: normalized.mode || 'normal',
      alwaysActive: !!normalized.alwaysActive,
      contentSize: content.length,
      folder: normalized.folder || '',
    };
    if (previewLength > 0) {
      responseEntry.contentPreview = content.slice(0, previewLength) + (content.length > previewLength ? '…' : '');
    }
    return responseEntry;
  });

  const folderParam = url.searchParams.get('folder');
  if (folderParam) {
    const folderId = resolveLorebookFolderRef(folderParam, rawEntries);
    entries = entries.filter((entry) => entry.folder === folderId);
  }

  const filterParam = url.searchParams.get('filter');
  if (filterParam) {
    const q = filterParam.toLowerCase();
    entries = entries.filter(
      (entry) =>
        String(entry.comment || '')
          .toLowerCase()
          .includes(q) ||
        String(entry.key || '')
          .toLowerCase()
          .includes(q),
    );
  }

  const contentFilterParam = url.searchParams.get('content_filter');
  if (contentFilterParam) {
    const q = contentFilterParam.toLowerCase();
    entries = entries.filter((entry) => {
      const content = ((rawEntries[Number(entry.index)]?.content as string) || '').toLowerCase();
      return content.includes(q);
    });
    entries = entries.map((entry) => {
      const rawContent = (rawEntries[Number(entry.index)]?.content as string) || '';
      const lower = rawContent.toLowerCase();
      const matchPos = lower.indexOf(q);
      if (matchPos >= 0) {
        const start = Math.max(0, matchPos - 50);
        const end = Math.min(rawContent.length, matchPos + q.length + 50);
        entry.contentMatch =
          (start > 0 ? '…' : '') + rawContent.slice(start, end) + (end < rawContent.length ? '…' : '');
      }
      return entry;
    });
  }

  const contentFilterNotParam = url.searchParams.get('content_filter_not');
  if (contentFilterNotParam) {
    const q = contentFilterNotParam.toLowerCase();
    entries = entries.filter((entry) => {
      const content = ((rawEntries[Number(entry.index)]?.content as string) || '').toLowerCase();
      return !content.includes(q);
    });
  }

  return { count: entries.length, folders, entries };
}

function buildRegexListResponse(regexEntries: Record<string, unknown>[]): Record<string, unknown> {
  const entries = regexEntries.map((entry, index) => ({
    index,
    comment: entry.comment || '',
    type: entry.type || '',
    findSize: String(entry.find || entry.in || '').length,
    replaceSize: String(entry.replace || entry.out || '').length,
  }));
  return { count: entries.length, entries };
}

function buildLuaListResponse(luaCode: string, parseLuaSections: (lua: string) => Section[]): Record<string, unknown> {
  const sections = parseLuaSections(luaCode);
  return {
    count: sections.length,
    sections: sections.map((section, index) => ({
      index,
      name: section.name,
      contentSize: section.content.length,
    })),
  };
}

function hasTraversalSegments(rawPath: string): boolean {
  return rawPath.split(/[\\/]+/).some((segment) => segment === '..');
}

function getExternalFileType(filePath: string): SupportedFileType | null {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
  return SUPPORTED_EXTERNAL_FILE_TYPES.has(ext as SupportedFileType) ? (ext as SupportedFileType) : null;
}

/** RisuAI expects lowercase regex types (editdisplay, editoutput, etc.) + name mapping */
function normalizeRegexType(entry: Record<string, unknown>): void {
  if (typeof entry.type === 'string') {
    const lower = entry.type.toLowerCase();
    // Map legacy Risutoki names to RisuAI names
    const REGEX_TYPE_MAP: Record<string, string> = {
      editrequest: 'editprocess',
      edittranslation: 'edittrans',
    };
    entry.type = REGEX_TYPE_MAP[lower] || lower;
  }
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
  let openFileRequestInFlight = false;

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

  function mcpNoOp(res: http.ServerResponse, info: McpNoOpInfo, extra: Record<string, unknown> = {}): void {
    jsonMcpNoOp(res, info, extra);
  }

  /**
   * Parse a raw request body with a Zod schema, returning typed data or
   * sending an mcpError and returning null.
   */
  function parseBody<T>(
    res: http.ServerResponse,
    body: Record<string, unknown>,
    schema: import('zod').ZodType<T>,
    meta: { action: string; target: string; suggestion?: string },
  ): T | null {
    const result = validateBody(body, schema);
    if (result.success) return result.data;
    const fieldHint = result.path ? ` (at "${result.path}")` : '';
    mcpError(res, 400, {
      action: meta.action,
      target: meta.target,
      message: `${result.error}${fieldHint}`,
      suggestion: meta.suggestion ?? '요청 본문의 구조와 필드 타입을 다시 확인하세요.',
    });
    return null;
  }

  // Shorthand to emit an MCP success response with envelope enrichment
  function jsonResSuccess(res: http.ServerResponse, payload: Record<string, unknown>, opts: McpSuccessOptions): void {
    jsonRes(res, mcpSuccess(payload, opts));
  }

  async function resolveExternalDocumentRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    routePath: string,
    action: string,
    target: string,
  ): Promise<{ body: ExternalDocumentBody; filePath: string; fileType: SupportedFileType } | null> {
    const rawBody = await readJsonBody(req, res, routePath, broadcastStatus);
    if (!rawBody) return null;
    const parsed = parseBody(res, rawBody, externalDocumentBodySchema, {
      action,
      target,
      suggestion: '절대 경로의 file_path를 요청 본문에 포함하세요.',
    });
    if (!parsed) return null;
    const rawPath = parsed.file_path.trim();
    if (!rawPath) {
      mcpError(res, 400, {
        action,
        target,
        message: 'Missing "file_path"',
        suggestion: '절대 경로의 file_path를 요청 본문에 포함하세요.',
      });
      return null;
    }
    if (hasTraversalSegments(rawPath)) {
      mcpError(res, 400, {
        action,
        target,
        message: 'file_path must not include ".." path traversal segments',
        suggestion: '정규화된 절대 경로를 사용하고 ".." 세그먼트는 제거하세요.',
      });
      return null;
    }
    if (!path.isAbsolute(rawPath)) {
      mcpError(res, 400, {
        action,
        target,
        message: 'file_path must be an absolute path',
        suggestion: '예: C:\\path\\to\\file.charx 형식의 절대 경로를 사용하세요.',
      });
      return null;
    }

    const filePath = path.normalize(rawPath);
    const fileType = getExternalFileType(filePath);
    if (!fileType) {
      mcpError(res, 400, {
        action,
        target,
        message: `Unsupported file extension: ${path.extname(filePath) || '(none)'}`,
        suggestion: '지원되는 확장자는 .charx, .risum, .risup 입니다.',
      });
      return null;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch (error) {
      mcpError(
        res,
        400,
        {
          action,
          target,
          message: `External file not found: ${filePath}`,
          suggestion: 'file_path가 실제 존재하는 카드/모듈/프리셋 파일을 가리키는지 확인하세요.',
        },
        error,
      );
      return null;
    }
    if (!stat.isFile()) {
      mcpError(res, 400, {
        action,
        target,
        message: `file_path must point to a file: ${filePath}`,
        suggestion: '디렉터리가 아니라 실제 .charx/.risum/.risup 파일 경로를 사용하세요.',
      });
      return null;
    }

    return {
      body: parsed,
      filePath,
      fileType,
    };
  }

  async function readProbeDocumentRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    routePath: string,
    action: string,
    target: string,
  ): Promise<{
    body: ExternalDocumentBody;
    data: Record<string, unknown>;
    filePath: string;
    fileType: SupportedFileType;
  } | null> {
    const request = await resolveExternalDocumentRequest(req, res, routePath, action, target);
    if (!request) return null;

    try {
      return {
        ...request,
        data: deps.openExternalDocument(request.filePath),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mcpError(
        res,
        400,
        {
          action,
          target,
          message: `Failed to open ${request.fileType} file: ${message}`,
          suggestion: '손상되지 않은 유효한 .charx/.risum/.risup 파일인지 확인하세요.',
        },
        error,
      );
      return null;
    }
  }

  const server = http.createServer(async (req, res) => {
    // Auth check
    if (req.headers.authorization !== `Bearer ${token}`) {
      return mcpError(res, 401, {
        action: 'authenticate request',
        target: 'request:auth',
        message: 'Unauthorized',
        suggestion: '유효한 TOKI_TOKEN으로 Authorization Bearer 헤더를 다시 보내세요.',
      });
    }
    const url = new URL(req.url!, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      // ----------------------------------------------------------------
      // POST /probe/field/:name — read a field from an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'probe' &&
        parts[1] === 'field' &&
        parts[2] &&
        !parts[3] &&
        parts[2] !== 'batch' &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `probe/field/${fieldName}`,
          'probe field',
          `probe:field:${fieldName}`,
        );
        if (!probe) return;
        const rules = getFieldAccessRules(probe.data);
        if (!rules.allowedFields.includes(fieldName)) {
          return mcpError(res, 400, {
            action: 'probe field',
            message: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}`,
            suggestion: 'probe_field_batch 또는 list_fields 로 허용된 필드를 다시 확인하세요.',
            target: `probe:field:${fieldName}`,
          });
        }
        const probePayload = buildFieldReadResponsePayload(probe.data, fieldName, deps);
        return jsonResSuccess(res, probePayload, {
          toolName: 'probe_field',
          summary: `Probed field "${fieldName}" from external file`,
        });
      }

      // ----------------------------------------------------------------
      // POST /probe/field/batch — read multiple fields from an unopened file
      // ----------------------------------------------------------------
      if (parts[0] === 'probe' && parts[1] === 'field' && parts[2] === 'batch' && !parts[3] && req.method === 'POST') {
        const probe = await readProbeDocumentRequest(
          req,
          res,
          'probe/field/batch',
          'probe field batch',
          'probe:field:batch',
        );
        if (!probe) return;
        const fields = probe.body.fields;
        if (!Array.isArray(fields) || fields.length === 0) {
          return mcpError(res, 400, {
            action: 'probe field batch',
            message: 'fields must be a non-empty string array',
            suggestion:
              'fields 를 문자열 배열로 전달하세요. 예: { "file_path": "...", "fields": ["name", "description"] }',
            target: 'probe:field:batch',
          });
        }
        if (!fields.every((field): field is string => typeof field === 'string')) {
          return mcpError(res, 400, {
            action: 'probe field batch',
            message: 'fields must be a non-empty string array — every element must be a string',
            suggestion: 'fields 배열의 모든 항목이 문자열인지 확인하세요.',
            target: 'probe:field:batch',
          });
        }
        if (fields.length > MAX_FIELD_BATCH) {
          return mcpError(res, 400, {
            action: 'probe field batch',
            message: `Maximum ${MAX_FIELD_BATCH} fields per batch`,
            suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 필드로 나누어 여러 번 호출하세요.`,
            target: 'probe:field:batch',
          });
        }
        const results = buildFieldBatchReadResults(probe.data, fields, deps);
        return jsonResSuccess(
          res,
          { count: results.length, fields: results },
          {
            toolName: 'probe_field_batch',
            summary: `Probed ${results.length} field(s) from external file`,
            artifacts: { count: results.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /probe/lorebook — list lorebook entries from an unopened file
      // ----------------------------------------------------------------
      if (parts[0] === 'probe' && parts[1] === 'lorebook' && !parts[2] && req.method === 'POST') {
        const probe = await readProbeDocumentRequest(req, res, 'probe/lorebook', 'probe lorebook', 'probe:lorebook');
        if (!probe) return;
        const probeLbPayload = buildLorebookListResponse((probe.data.lorebook as Record<string, unknown>[]) || [], url);
        return jsonResSuccess(res, probeLbPayload, {
          toolName: 'probe_lorebook',
          summary: `Probed lorebook from external file (${(probeLbPayload as any).count ?? 0} entries)`,
          artifacts: { count: (probeLbPayload as any).count ?? 0 },
        });
      }

      // ----------------------------------------------------------------
      // POST /probe/regex — list regex entries from an unopened file
      // ----------------------------------------------------------------
      if (parts[0] === 'probe' && parts[1] === 'regex' && !parts[2] && req.method === 'POST') {
        const probe = await readProbeDocumentRequest(req, res, 'probe/regex', 'probe regex', 'probe:regex');
        if (!probe) return;
        const probeRxPayload = buildRegexListResponse((probe.data.regex as Record<string, unknown>[]) || []);
        return jsonResSuccess(res, probeRxPayload, {
          toolName: 'probe_regex',
          summary: `Probed regex from external file (${(probeRxPayload as any).count ?? 0} entries)`,
          artifacts: { count: (probeRxPayload as any).count ?? 0 },
        });
      }

      // ----------------------------------------------------------------
      // POST /probe/lua — list Lua sections from an unopened file
      // ----------------------------------------------------------------
      if (parts[0] === 'probe' && parts[1] === 'lua' && !parts[2] && req.method === 'POST') {
        const probe = await readProbeDocumentRequest(req, res, 'probe/lua', 'probe lua', 'probe:lua');
        if (!probe) return;
        const probeLuaPayload = buildLuaListResponse(String(probe.data.lua || ''), deps.parseLuaSections);
        return jsonResSuccess(res, probeLuaPayload, {
          toolName: 'probe_lua',
          summary: `Probed Lua from external file (${(probeLuaPayload as any).count ?? 0} sections)`,
          artifacts: { count: (probeLuaPayload as any).count ?? 0 },
        });
      }

      if (req.method === 'POST' && url.pathname === '/open-file') {
        const request = await resolveExternalDocumentRequest(req, res, 'open-file', 'open file', 'open:file');
        if (!request) return;

        if (request.body.save_current !== undefined && typeof request.body.save_current !== 'boolean') {
          return mcpError(res, 400, {
            action: 'open file',
            message: 'save_current must be a boolean when provided',
            suggestion: 'save_current는 true 또는 false 로만 전달하세요.',
            target: 'open:file',
          });
        }

        if (openFileRequestInFlight) {
          return mcpError(res, 409, {
            action: 'open file',
            message: 'Another open_file request is already in progress',
            suggestion: '현재 문서 전환이 끝난 뒤 다시 시도하세요.',
            target: 'open:file',
          });
        }

        openFileRequestInFlight = true;
        try {
          const response = await deps.requestRendererOpenFile({
            filePath: request.filePath,
            fileType: request.fileType,
            saveCurrent: request.body.save_current === true,
            targetLabel: path.basename(request.filePath),
          });
          if (!response.success) {
            return mcpError(res, response.canceled ? 409 : 500, {
              action: 'open file',
              message: response.error || 'Renderer could not open the requested file.',
              suggestion:
                response.suggestion ||
                (response.canceled
                  ? '현재 문서의 저장/교체를 마친 뒤 다시 시도하세요.'
                  : 'RisuToki 메인 창과 renderer가 정상 동작 중인지 확인하세요.'),
              target: 'open:file',
            });
          }
          return jsonResSuccess(
            res,
            {
              file_path: response.filePath || request.filePath,
              file_type: response.fileType || request.fileType,
              name: response.name || path.basename(request.filePath),
              already_open: response.alreadyOpen === true,
              switched: response.alreadyOpen !== true,
              save_current: request.body.save_current === true,
            },
            {
              toolName: 'open_file',
              summary: `Opened ${response.name || path.basename(request.filePath)}${response.alreadyOpen ? ' (already open)' : ''}`,
              artifacts: {
                filePath: response.filePath || request.filePath,
                alreadyOpen: response.alreadyOpen === true,
              },
            },
          );
        } catch (error) {
          return mcpError(
            res,
            500,
            {
              action: 'open file',
              message: error instanceof Error ? error.message : String(error),
              suggestion: 'RisuToki 메인 창과 renderer 상태를 확인한 뒤 다시 시도하세요.',
              target: 'open:file',
            },
            error,
          );
        } finally {
          openFileRequestInFlight = false;
        }
      }

      const isSessionStatusRoute = parts[0] === 'session' && parts[1] === 'status' && !parts[2] && req.method === 'GET';
      const isReferenceRoute = parts[0] === 'references' || parts[0] === 'reference';
      const currentData = deps.getCurrentData();
      if (!currentData && !isSessionStatusRoute && !isReferenceRoute) {
        return mcpError(res, 400, {
          action: 'require current document',
          target: 'document:current',
          message: 'No file open',
          suggestion:
            'open_file를 사용하거나 에디터에서 파일을 먼저 연 뒤 다시 시도하세요. 참고 자료가 로드되어 있다면 list_references는 파일 없이도 사용 가능합니다.',
        });
      }

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
        fields.push({ name: 'lorebook', count: (currentData.lorebook || []).length, type: 'array' });
        fields.push({ name: 'regex', count: (currentData.regex || []).length, type: 'array' });

        // Charx card.data fields
        if (isCharx) {
          const charxStringFields = ['creatorcomment', 'exampleMessage', 'systemPrompt', 'creator', 'characterVersion'];
          for (const f of charxStringFields) {
            fields.push({ name: f, size: ((currentData[f] as string) || '').length, type: 'string' });
          }
          // Read-only charx fields (RisuAI deprecated/passthrough — editing disabled, data preserved in file I/O)
          const charxReadOnlyFields = ['personality', 'scenario', 'nickname', 'additionalText', 'license'];
          for (const f of charxReadOnlyFields) {
            const val = (currentData[f] as string) || '';
            if (val.length > 0) {
              fields.push({ name: f, size: val.length, type: 'string (read-only)' });
            }
          }
          const readOnlyArrayFields = [
            { name: 'tags', data: currentData.tags },
            { name: 'source', data: currentData.source },
          ];
          for (const af of readOnlyArrayFields) {
            const arr = (af.data as string[]) || [];
            if (arr.length > 0) {
              fields.push({ name: af.name, count: arr.length, type: 'array (read-only)' });
            }
          }
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

        return jsonResSuccess(
          res,
          { fileType, fields },
          {
            toolName: 'list_fields',
            summary: `Listed ${fields.length} fields (${fileType})`,
            artifacts: { count: fields.length, fileType },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET/POST /field/:name
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && !parts[2] && !FIELD_RESERVED_PATHS.includes(parts[1])) {
        const fieldName = decodeURIComponent(parts[1]);
        const rules = getFieldAccessRules(currentData);

        if (!rules.allowedFields.includes(fieldName)) {
          const action = req.method === 'GET' ? 'read field' : 'update field';
          return mcpError(res, 400, {
            action,
            message: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}`,
            suggestion: 'list_fields 또는 GET /field/batch 로 허용된 필드를 다시 확인하세요.',
            target: `field:${fieldName}`,
          });
        }

        if (req.method === 'GET') {
          const readPayload = buildFieldReadResponsePayload(currentData, fieldName, deps);
          return jsonResSuccess(res, readPayload, {
            toolName: 'read_field',
            summary: `Read field "${fieldName}"`,
            artifacts: { fieldName },
          });
        }

        if (req.method === 'POST') {
          // Read-only fields check
          if (rules.readOnlyFields.includes(fieldName)) {
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
          // Validate content type: must be string or array (for alternateGreetings)
          const arrayFields = ['alternateGreetings'];
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
          const risupStructuredFieldError = getRisupStructuredFieldError(fieldName, body.content);
          if (risupStructuredFieldError) {
            return mcpError(res, 400, {
              action: 'update field',
              message: `Invalid ${fieldName}: ${risupStructuredFieldError}`,
              suggestion: getRisupStructuredFieldSuggestion(fieldName),
              target: `field:${fieldName}`,
              details: { parseError: risupStructuredFieldError },
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
            if (fieldName === 'alternateGreetings') {
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
              const tsSize = deps.stringifyTriggerScripts(currentData.triggerScripts).length;
              return jsonResSuccess(
                res,
                {
                  success: true,
                  field: fieldName,
                  size: tsSize,
                },
                {
                  toolName: 'write_field',
                  summary: `Updated triggerScripts (${tsSize} chars)`,
                  artifacts: { fieldName, size: tsSize },
                },
              );
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
            return jsonResSuccess(
              res,
              { success: true, field: fieldName, size: content.length },
              {
                toolName: 'write_field',
                summary: `Updated "${fieldName}" (${oldSize}→${content.length} chars)`,
                artifacts: { fieldName, oldSize, newSize: content.length },
              },
            );
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
        const parsed = parseBody(res, body, fieldBatchReadSchema, {
          action: 'read field batch',
          target: 'field:batch',
          suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "fields": ["name", "description"] }',
        });
        if (!parsed) return;
        const fields = parsed.fields;
        if (fields.length === 0) {
          return mcpError(res, 400, {
            action: 'read field batch',
            message: 'fields must be a non-empty string array',
            suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "fields": ["name", "description"] }',
            target: 'field:batch',
          });
        }
        if (fields.length > MAX_FIELD_BATCH) {
          return mcpError(res, 400, {
            action: 'read field batch',
            message: `Maximum ${MAX_FIELD_BATCH} fields per batch`,
            suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 필드로 나누어 여러 번 호출하세요.`,
            target: 'field:batch',
          });
        }
        const results = buildFieldBatchReadResults(currentData, fields, deps);
        return jsonResSuccess(
          res,
          { count: results.length, fields: results },
          {
            toolName: 'read_field_batch',
            summary: `Read ${results.length} fields`,
            artifacts: { count: results.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /field/batch-write — write multiple fields at once (single confirmation)
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] === 'batch-write' && !parts[2] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'field/batch-write', broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, fieldBatchWriteSchema, {
          action: 'batch write field',
          target: 'field:batch-write',
          suggestion:
            'entries 를 { field, content } 객체 배열로 전달하세요. 예: { "entries": [{ "field": "name", "content": "새 이름" }] }',
        });
        if (!parsed) return;
        const entries = parsed.entries;
        if (entries.length === 0) {
          return mcpError(res, 400, {
            action: 'batch write field',
            message: 'entries must be a non-empty array of {field, content}',
            suggestion:
              'entries 를 { field, content } 객체 배열로 전달하세요. 예: { "entries": [{ "field": "name", "content": "새 이름" }] }',
            target: 'field:batch-write',
          });
        }
        if (entries.length > MAX_FIELD_BATCH) {
          return mcpError(res, 400, {
            action: 'batch write field',
            message: `Maximum ${MAX_FIELD_BATCH} entries per batch`,
            suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 항목으로 나누어 여러 번 호출하세요.`,
            target: 'field:batch-write',
          });
        }
        // Surface-aware validation (mirrors single-field POST /field/:name)
        const rules = getFieldAccessRules(currentData);
        const readOnlyFields = rules.readOnlyFields;
        const deprecatedFields = rules.deprecatedFields;
        // Exclude complex fields that need special handling
        const excludedFields = ['triggerScripts', 'alternateGreetings', 'lorebook'];
        // Validate all entries before asking for confirmation
        const validatedEntries: Array<{
          field: string;
          content: unknown;
          oldSize: number;
          newSize: number;
          type: string;
        }> = [];
        const boolFields = BOOLEAN_FIELD_NAMES;
        const numFields = NUMBER_FIELD_NAMES;
        const jsonFields = ['promptTemplate', 'presetBias', 'formatingOrder', 'localStopStrings'];
        const surfaceWritable = new Set(
          rules.allowedFields.filter(
            (field) =>
              !readOnlyFields.includes(field) && !deprecatedFields.includes(field) && !excludedFields.includes(field),
          ),
        );

        for (const entry of entries) {
          if (!entry.field || entry.content === undefined) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `각 항목에 "field"와 "content"가 필요합니다.`,
              suggestion: '각 항목을 { "field": "<필드명>", "content": <값> } 형태로 전달하세요.',
              target: 'field:batch-write',
            });
          }
          if (readOnlyFields.includes(entry.field)) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `"${entry.field}" 필드는 읽기 전용입니다.`,
              suggestion: `"${entry.field}" 항목을 entries 배열에서 제거하세요. 이 필드는 시스템이 자동 관리합니다.`,
              target: `field:${entry.field}`,
            });
          }
          if (deprecatedFields.includes(entry.field)) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `"${entry.field}" 필드는 charx에서 읽기 전용(deprecated)입니다.`,
              suggestion: `이 필드는 수정할 수 없습니다. entries 배열에서 "${entry.field}" 항목을 제거하세요.`,
              target: `field:${entry.field}`,
            });
          }
          if (excludedFields.includes(entry.field)) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `"${entry.field}" 필드는 batch-write에서 지원하지 않습니다. write_field를 개별 사용하세요.`,
              suggestion: `"${entry.field}" 항목을 entries에서 제거하고 POST /field/${entry.field} 로 개별 호출하세요.`,
              target: `field:${entry.field}`,
            });
          }
          if (!surfaceWritable.has(entry.field)) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `Unknown field: ${entry.field} ${getUnknownFieldHint(rules)}`,
              suggestion: 'list_fields 또는 GET /field/batch 로 허용된 필드를 다시 확인하세요.',
              target: `field:${entry.field}`,
            });
          }
          // Type validation
          let type = 'string';
          if (boolFields.includes(entry.field)) {
            type = 'boolean';
            if (typeof entry.content !== 'boolean') {
              return mcpError(res, 400, {
                action: 'batch write field',
                message: `"${entry.field}"는 boolean 타입이어야 합니다.`,
                suggestion: `"${entry.field}" 값을 true 또는 false 로 전달하세요. (현재: ${typeof entry.content})`,
                target: `field:${entry.field}`,
              });
            }
          } else if (numFields.includes(entry.field)) {
            type = 'number';
            if (typeof entry.content !== 'number') {
              return mcpError(res, 400, {
                action: 'batch write field',
                message: `"${entry.field}"는 number 타입이어야 합니다.`,
                suggestion: `"${entry.field}" 값을 숫자로 전달하세요. (현재: ${typeof entry.content})`,
                target: `field:${entry.field}`,
              });
            }
          } else if (jsonFields.includes(entry.field)) {
            type = 'json';
            if (typeof entry.content !== 'string') {
              return mcpError(res, 400, {
                action: 'batch write field',
                message: `"${entry.field}"는 문자열 타입이어야 합니다.`,
                suggestion: `"${entry.field}" 값을 JSON 문자열로 전달하세요. (현재: ${typeof entry.content})`,
                target: `field:${entry.field}`,
              });
            }
            const structuredError = getRisupStructuredFieldError(entry.field, entry.content);
            if (structuredError) {
              return mcpError(res, 400, {
                action: 'batch write field',
                message: `Invalid ${entry.field}: ${structuredError}`,
                suggestion: getRisupStructuredFieldSuggestion(entry.field),
                target: `field:${entry.field}`,
                details: { parseError: structuredError },
              });
            }
          } else {
            if (typeof entry.content !== 'string') {
              return mcpError(res, 400, {
                action: 'batch write field',
                message: `"${entry.field}"는 문자열 타입이어야 합니다.`,
                suggestion: `"${entry.field}" 값을 문자열로 전달하세요. (현재: ${typeof entry.content})`,
                target: `field:${entry.field}`,
              });
            }
          }
          const oldVal = currentData[entry.field];
          const oldSize = type === 'boolean' || type === 'number' ? String(oldVal ?? '').length : (oldVal || '').length;
          const newSize =
            type === 'boolean' || type === 'number' ? String(entry.content).length : (entry.content as string).length;
          validatedEntries.push({ field: entry.field, content: entry.content, oldSize, newSize, type });
        }

        // Build summary for confirmation
        const summary = validatedEntries.map((e) => `• ${e.field}: ${e.oldSize}→${e.newSize}`).join('\n');
        const allowed = await deps.askRendererConfirm(
          'MCP 필드 일괄 수정 요청',
          `AI 어시스턴트가 ${validatedEntries.length}개 필드를 수정하려 합니다:\n${summary}`,
        );
        if (allowed) {
          const results: Array<{ field: string; success: boolean; oldSize: number; newSize: number }> = [];
          for (const entry of validatedEntries) {
            let content = entry.content;
            // Strip <style> wrapper from CSS
            if (entry.field === 'css' && typeof content === 'string') {
              content = content.replace(/^\s*<style[^>]*>\s*/i, '').replace(/\s*<\/style>\s*$/i, '');
            }
            currentData[entry.field] = content;
            if (entry.field === 'lua') {
              currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
              deps.broadcastToAll(
                'data-updated',
                'triggerScripts',
                deps.stringifyTriggerScripts(currentData.triggerScripts),
              );
            }
            deps.broadcastToAll('data-updated', entry.field, content);
            results.push({ field: entry.field, success: true, oldSize: entry.oldSize, newSize: entry.newSize });
          }
          logMcpMutation('batch write fields', 'field:batch-write', {
            count: results.length,
            fields: results.map((r) => r.field),
          });
          return jsonResSuccess(
            res,
            { success: true, count: results.length, results },
            {
              toolName: 'write_field_batch',
              summary: `Batch-wrote ${results.length} fields`,
              artifacts: { count: results.length, fields: results.map((r) => r.field) },
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'batch write field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 일괄 수정 요청을 허용한 뒤 다시 시도하세요.',
            target: 'field:batch-write',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /field/:name/replace — replace text in a string field
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'replace' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const mutationFieldStatus = getStringMutationFieldStatus(fieldName);
        if (mutationFieldStatus === 'read-only') {
          return mcpError(res, 400, {
            action: 'replace in field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        if (mutationFieldStatus !== 'ok') {
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
        const parsed = parseBody(res, body, replaceBodySchema, {
          action: 'replace in field',
          target: `field:${fieldName}`,
          suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;
        // Acquire mutex to prevent parallel writes on same field
        const release = await acquireFieldMutex(fieldName);
        try {
          const content: string = normalizeLF(currentData[fieldName] || '');
          const findStr: string = normalizeLF(parsed.find);
          const replaceStr: string = parsed.replace !== undefined ? normalizeLF(parsed.replace) : '';
          const useRegex = !!parsed.regex;
          const flags: string = parsed.flags || 'g';
          const dryRun = !!(parsed.dry_run ?? parsed.dryRun);
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
            return mcpNoOp(
              res,
              {
                action: 'replace in field',
                message: '일치하는 항목 없음',
                suggestion:
                  'read_field 또는 search_in_field로 현재 내용을 다시 확인하고 find/regex/flags를 조정하세요.',
                target: `field:${fieldName}`,
              },
              {
                matchCount: 0,
                ...(dryRun ? { dryRun: true } : {}),
              },
            );
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
            return jsonResSuccess(
              res,
              {
                dryRun: true,
                field: fieldName,
                matchCount,
                fieldLength: content.length,
                previews,
                newSize: newContent.length,
              },
              {
                toolName: 'replace_in_field',
                summary: `Dry-run: ${matchCount} match(es) in "${fieldName}"`,
                artifacts: { matchCount, fieldLength: content.length },
              },
            );
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
            return jsonResSuccess(
              res,
              {
                success: true,
                field: fieldName,
                matchCount,
                oldSize: content.length,
                newSize: newContent.length,
              },
              {
                toolName: 'replace_in_field',
                summary: `Replaced ${matchCount} match(es) in "${fieldName}" (${content.length}→${newContent.length})`,
                artifacts: { fieldName, matchCount, oldSize: content.length, newSize: newContent.length },
              },
            );
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
      // POST /field/:name/block-replace — replace a multiline block between two anchors
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'block-replace' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const mutationFieldStatus = getStringMutationFieldStatus(fieldName);
        if (mutationFieldStatus === 'read-only') {
          return mcpError(res, 400, {
            action: 'block replace in field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        if (mutationFieldStatus !== 'ok') {
          return mcpError(res, 400, {
            action: 'block replace in field',
            message: `"${fieldName}" 필드는 블록 치환을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}/block-replace`, broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, blockReplaceBodySchema, {
          action: 'block replace in field',
          target: `field:${fieldName}`,
          suggestion: '블록의 시작과 끝을 나타내는 앵커 문자열이 필요합니다.',
        });
        if (!parsed) return;
        const release = await acquireFieldMutex(fieldName);
        try {
          const content = normalizeLF(currentData[fieldName] || '');
          const startAnchor = normalizeLF(parsed.start_anchor);
          const endAnchor = normalizeLF(parsed.end_anchor);
          const newBlock: string = parsed.content !== undefined ? normalizeLF(parsed.content) : '';
          const includeAnchors = parsed.include_anchors !== false; // default true: anchors are replaced too
          const dryRun = !!(parsed.dry_run ?? parsed.dryRun);

          const startPos = content.indexOf(startAnchor);
          if (startPos === -1) {
            return mcpNoOp(res, {
              action: 'block replace in field',
              message: `시작 앵커를 찾을 수 없음: ${startAnchor.substring(0, 80)}`,
              suggestion:
                'read_field 또는 read_field_range로 현재 내용을 확인해 start_anchor/end_anchor를 다시 지정하세요.',
              target: `field:${fieldName}`,
            });
          }
          const searchAfter = startPos + startAnchor.length;
          const endPos = content.indexOf(endAnchor, searchAfter);
          if (endPos === -1) {
            return mcpNoOp(
              res,
              {
                action: 'block replace in field',
                message: `끝 앵커를 찾을 수 없음 (시작 앵커 이후): ${endAnchor.substring(0, 80)}`,
                suggestion:
                  'read_field 또는 read_field_range로 현재 내용을 확인해 start_anchor/end_anchor를 다시 지정하세요.',
                target: `field:${fieldName}`,
              },
              { startAnchorFoundAt: startPos },
            );
          }

          // Determine what range to replace
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
                field: fieldName,
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
                toolName: 'replace_block_in_field',
                summary: `Dry-run: block in "${fieldName}" (${oldBlock.length}→${newBlock.length} chars)`,
                artifacts: { oldBlockSize: oldBlock.length, newBlockSize: newBlock.length },
              },
            );
          }

          const allowed = await deps.askRendererConfirm(
            'MCP 블록 치환 요청',
            `AI 어시스턴트가 "${fieldName}" 필드에서 블록 치환하려 합니다.\n시작: ${startAnchor.substring(0, 60)}\n끝: ${endAnchor.substring(0, 60)}\n블록 크기: ${oldBlock.length}→${newBlock.length}자`,
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
            logMcpMutation('block replace in field', `field:${fieldName}`, {
              startAnchorAt: startPos,
              endAnchorAt: endPos,
              oldBlockSize: oldBlock.length,
              newBlockSize: newBlock.length,
            });
            deps.broadcastToAll('data-updated', fieldName, newContent);
            return jsonResSuccess(
              res,
              {
                success: true,
                field: fieldName,
                startAnchorAt: startPos,
                endAnchorAt: endPos,
                includeAnchors,
                oldBlockSize: oldBlock.length,
                newBlockSize: newBlock.length,
                oldSize: content.length,
                newSize: newContent.length,
              },
              {
                toolName: 'replace_block_in_field',
                summary: `Replaced block in "${fieldName}" (${oldBlock.length}→${newBlock.length} chars)`,
                artifacts: { oldBlockSize: oldBlock.length, newBlockSize: newBlock.length },
              },
            );
          } else {
            return mcpError(res, 403, {
              action: 'block replace in field',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 블록 치환 요청을 허용한 뒤 다시 시도하세요.',
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
        const mutationFieldStatus = getStringMutationFieldStatus(fieldName);
        if (mutationFieldStatus === 'read-only') {
          return mcpError(res, 400, {
            action: 'insert in field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        if (mutationFieldStatus !== 'ok') {
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
        const parsed = parseBody(res, body, insertBodySchema, {
          action: 'insert in field',
          target: `field:${fieldName}`,
          suggestion: '삽입할 content를 요청 본문에 포함하세요.',
        });
        if (!parsed) return;
        // Acquire mutex to prevent parallel writes on same field
        const release = await acquireFieldMutex(fieldName);
        try {
          const oldContent: string = normalizeLF(currentData[fieldName] || '');
          let newContent: string;
          const position: string = parsed.position || 'end';
          const insertContent = normalizeLF(parsed.content);
          if (position === 'end') {
            newContent = oldContent + '\n' + insertContent;
          } else if (position === 'start') {
            newContent = insertContent + '\n' + oldContent;
          } else if ((position === 'after' || position === 'before') && parsed.anchor) {
            const anchorPos = oldContent.indexOf(normalizeLF(parsed.anchor));
            if (anchorPos === -1) {
              return mcpNoOp(res, {
                action: 'insert in field',
                message: `앵커 문자열을 찾을 수 없음: ${parsed.anchor.substring(0, 80)}`,
                suggestion:
                  'read_field 또는 read_field_range로 현재 내용을 확인해 anchor 문자열을 다시 지정하거나 position을 start/end로 변경하세요.',
                target: `field:${fieldName}`,
              });
            }
            if (position === 'after') {
              const insertAt = anchorPos + normalizeLF(parsed.anchor).length;
              newContent = oldContent.slice(0, insertAt) + '\n' + insertContent + oldContent.slice(insertAt);
            } else {
              newContent = oldContent.slice(0, anchorPos) + insertContent + '\n' + oldContent.slice(anchorPos);
            }
          } else {
            return mcpError(res, 400, {
              action: 'insert in field',
              message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
              suggestion:
                'anchor 에 삽입 위치를 지정하는 텍스트를 전달하세요. 예: { "position": "after", "anchor": "기준 텍스트" }',
              target: `field:${fieldName}`,
            });
          }
          const preview = parsed.content.substring(0, 100) + (parsed.content.length > 100 ? '...' : '');
          const allowed = await deps.askRendererConfirm(
            'MCP 필드 삽입 요청',
            `AI 어시스턴트가 "${fieldName}" 필드에 내용을 삽입하려 합니다.\n위치: ${position}${parsed.anchor ? ' "' + parsed.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
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
            return jsonResSuccess(
              res,
              {
                success: true,
                field: fieldName,
                position,
                oldSize: oldContent.length,
                newSize: newContent.length,
              },
              {
                toolName: 'insert_in_field',
                summary: `Inserted into "${fieldName}" at ${position} (${oldContent.length}→${newContent.length} chars)`,
                artifacts: { oldSize: oldContent.length, newSize: newContent.length },
              },
            );
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
        const mutationFieldStatus = getStringMutationFieldStatus(fieldName);
        if (mutationFieldStatus === 'read-only') {
          return mcpError(res, 400, {
            action: 'batch replace in field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        if (mutationFieldStatus !== 'ok') {
          return mcpError(res, 400, {
            action: 'batch replace in field',
            message: `"${fieldName}" 필드는 문자열 치환을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}/batch-replace`, broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, batchReplaceBodySchema, {
          action: 'batch replace in field',
          target: `field:${fieldName}`,
          suggestion:
            'replacements 를 { find, replace } 객체 배열로 전달하세요. 예: { "replacements": [{ "find": "old", "replace": "new" }] }',
        });
        if (!parsed) return;
        const replacements = parsed.replacements;
        if (replacements.length === 0) {
          return mcpError(res, 400, {
            action: 'batch replace in field',
            message: 'replacements must be a non-empty array',
            suggestion:
              'replacements 를 { find, replace } 객체 배열로 전달하세요. 예: { "replacements": [{ "find": "old", "replace": "new" }] }',
            target: `field:${fieldName}`,
          });
        }
        const MAX_BATCH = 50;
        if (replacements.length > MAX_BATCH) {
          return mcpError(res, 400, {
            action: 'batch replace in field',
            message: `Maximum ${MAX_BATCH} replacements per batch`,
            suggestion: `요청을 ${MAX_BATCH}개 이하의 치환으로 나누어 여러 번 호출하세요.`,
            target: `field:${fieldName}`,
          });
        }
        const dryRun = !!(parsed.dry_run ?? parsed.dryRun);
        // Acquire mutex to prevent parallel writes
        const release = await acquireFieldMutex(fieldName);
        try {
          let content: string = normalizeLF(currentData[fieldName] || '');
          const originalSize = content.length;
          // Apply replacements sequentially, collecting match info
          const results = replacements.map((r) => {
            const findStr: string = normalizeLF(r.find);
            const replaceStr: string = r.replace !== undefined ? normalizeLF(r.replace) : '';
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
            return mcpNoOp(
              res,
              {
                action: 'batch replace in field',
                message: '모든 치환에서 일치하는 항목 없음',
                suggestion: 'results를 확인하고 각 find/replace/regex/flags를 조정한 뒤 다시 시도하세요.',
                target: `field:${fieldName}`,
              },
              {
                results,
                ...(dryRun ? { dryRun: true } : {}),
              },
            );
          }
          if (dryRun) {
            return jsonResSuccess(
              res,
              {
                dryRun: true,
                field: fieldName,
                totalMatches,
                originalSize,
                newSize: content.length,
                results,
              },
              {
                toolName: 'replace_in_field_batch',
                summary: `Dry-run: ${totalMatches} total match(es) in "${fieldName}"`,
                artifacts: { totalMatches, fieldLength: originalSize },
              },
            );
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
            return jsonResSuccess(
              res,
              {
                success: true,
                field: fieldName,
                totalMatches,
                originalSize,
                newSize: content.length,
                results,
              },
              {
                toolName: 'replace_in_field_batch',
                summary: `Batch replaced ${totalMatches} match(es) in "${fieldName}"`,
                artifacts: { totalMatches, originalSize, newSize: content.length },
              },
            );
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
      // POST /search-all — search across string fields, greetings, lorebook
      // ----------------------------------------------------------------
      if (parts[0] === 'search-all' && !parts[1] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'search-all', broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, searchAllBodySchema, {
          action: 'search all fields',
          target: '/search-all',
          suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;

        try {
          const searchResult = searchAllTextSurfaces(currentData, {
            query: normalizeLF(String(parsed.query)),
            regex: !!parsed.regex,
            flags: parsed.flags,
            includeLorebook: parsed.include_lorebook !== false,
            includeGreetings: parsed.include_greetings !== false,
            contextChars: Math.max(0, Math.min(Number(parsed.context_chars) || 60, 300)),
            maxMatchesPerSurface: Math.max(1, Math.min(Number(parsed.max_matches_per_field) || 5, 20)),
          });
          const totalHits = Array.isArray(searchResult.surfaces)
            ? (searchResult.surfaces as Array<{ totalMatches?: number }>).reduce(
                (sum, s) => sum + (s.totalMatches || 0),
                0,
              )
            : 0;
          return jsonResSuccess(res, searchResult as unknown as Record<string, unknown>, {
            toolName: 'search_all_fields',
            summary: `Searched all fields: ${totalHits} total match(es)`,
            artifacts: { totalMatches: totalHits },
          });
        } catch (err) {
          return mcpError(res, 400, {
            action: 'search all fields',
            message: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
            target: '/search-all',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /field/:name/search — search text in a string field (read-only)
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'search' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        if (!SEARCHABLE_TEXT_FIELDS.includes(fieldName as (typeof SEARCHABLE_TEXT_FIELDS)[number])) {
          return mcpError(res, 400, {
            action: 'search in field',
            message: `"${fieldName}" 필드는 검색을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}/search`, broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, searchBodySchema, {
          action: 'search in field',
          target: `field:${fieldName}`,
          suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;
        const content: string = normalizeLF(
          typeof currentData[fieldName] === 'string' ? currentData[fieldName] : String(currentData[fieldName] ?? ''),
        );
        const queryStr: string = normalizeLF(String(parsed.query));
        const contextChars: number = Math.max(0, Math.min(Number(parsed.context_chars) || 100, 500));
        const maxMatches: number = Math.max(1, Math.min(Number(parsed.max_matches) || 20, 100));
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
              field: fieldName,
              query: result.query,
              totalMatches: result.totalMatches,
              returnedMatches: result.returnedMatches,
              fieldLength: result.contentLength,
              matches: result.matches,
            },
            {
              toolName: 'search_in_field',
              summary: `Found ${result.totalMatches} match(es) in "${fieldName}"`,
              artifacts: { fieldName, totalMatches: result.totalMatches },
            },
          );
        } catch (err) {
          return mcpError(res, 400, {
            action: 'search in field',
            message: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
            target: `field:${fieldName}`,
          });
        }
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
        return jsonResSuccess(
          res,
          {
            field: fieldName,
            totalLength: content.length,
            offset,
            length: slice.length,
            hasMore: offset + length < content.length,
            content: slice,
          },
          {
            toolName: 'read_field_range',
            summary: `Read ${slice.length} chars from "${fieldName}" at offset ${offset}`,
            artifacts: { fieldName, offset, length: slice.length, totalLength: content.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /field/:name/snapshot — save current field value as a snapshot
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'snapshot' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const content = currentData[fieldName];
        if (content === undefined) {
          return mcpError(res, 400, {
            action: 'snapshot field',
            message: `"${fieldName}" 필드를 찾을 수 없습니다.`,
            target: `field:${fieldName}`,
          });
        }
        const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const snapshot = {
          id: snapshotId,
          field: fieldName,
          timestamp: new Date().toISOString(),
          size: typeof content === 'string' ? content.length : JSON.stringify(content).length,
          content: typeof content === 'string' ? content : cloneJson(content),
        };
        if (!fieldSnapshots.has(fieldName)) fieldSnapshots.set(fieldName, []);
        const snaps = fieldSnapshots.get(fieldName)!;
        snaps.push(snapshot);
        // Keep max 10 snapshots per field
        if (snaps.length > 10) snaps.shift();
        return jsonResSuccess(
          res,
          {
            success: true,
            snapshotId,
            field: fieldName,
            size: snapshot.size,
            timestamp: snapshot.timestamp,
            totalSnapshots: snaps.length,
          },
          {
            toolName: 'snapshot_field',
            summary: `Snapshot created for "${fieldName}" (${snapshot.size} chars)`,
            artifacts: { fieldName, snapshotId, size: snapshot.size },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /field/:name/snapshots — list snapshots for a field
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'snapshots' && !parts[3] && req.method === 'GET') {
        const fieldName = decodeURIComponent(parts[1]);
        const snaps = fieldSnapshots.get(fieldName) || [];
        return jsonResSuccess(
          res,
          {
            field: fieldName,
            count: snaps.length,
            snapshots: snaps.map((s) => ({ id: s.id, timestamp: s.timestamp, size: s.size })),
          },
          {
            toolName: 'list_snapshots',
            summary: `${snaps.length} snapshot(s) for "${fieldName}"`,
            artifacts: { fieldName, count: snaps.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /session/status — inspect the current MCP-visible session state
      // ----------------------------------------------------------------
      if (parts[0] === 'session' && parts[1] === 'status' && !parts[2] && req.method === 'GET') {
        const status = deps.getSessionStatus ? await deps.getSessionStatus() : null;
        const snapshotSummary = [...fieldSnapshots.entries()]
          .filter(([, snaps]) => snaps.length > 0)
          .map(([field, snaps]) => ({ field, count: snaps.length }))
          .sort((a, b) => a.field.localeCompare(b.field));
        const totalSnapshots = snapshotSummary.reduce((sum, entry) => sum + entry.count, 0);
        const documentName =
          currentData &&
          typeof currentData === 'object' &&
          typeof currentData.name === 'string' &&
          currentData.name.trim()
            ? currentData.name
            : null;
        const documentFileType =
          status?.currentFileType ??
          (currentData &&
          typeof currentData === 'object' &&
          (currentData._fileType === 'risum' || currentData._fileType === 'risup')
            ? currentData._fileType
            : currentData
              ? 'charx'
              : null);
        const loaded = !!currentData;

        // Reference summary
        const refFiles = deps.getReferenceFiles();
        const refsSummary = refFiles.map((r: any, i: number) => ({
          index: i,
          id: r.id || r.filePath || r.fileName,
          fileName: r.fileName,
          fileType: getRefFileType(r),
        }));

        return jsonResSuccess(
          res,
          {
            loaded,
            document: {
              filePath: status?.currentFilePath ?? null,
              fileType: documentFileType,
              name: documentName,
            },
            renderer: status?.renderer ?? null,
            recovery: {
              lastRestored: status?.lastRestored ?? null,
              pendingRecovery: status?.pendingRecovery ?? null,
            },
            snapshots: {
              byField: snapshotSummary,
              totalFields: snapshotSummary.length,
              totalSnapshots,
            },
            references: {
              count: refsSummary.length,
              files: refsSummary,
            },
          },
          {
            toolName: 'session_status',
            summary: loaded
              ? `Session status for "${documentName ?? 'Untitled'}" (${totalSnapshots} snapshot${totalSnapshots === 1 ? '' : 's'}, ${refsSummary.length} ref${refsSummary.length === 1 ? '' : 's'})`
              : refsSummary.length > 0
                ? `No document loaded but ${refsSummary.length} reference file(s) available — use list_references to inspect`
                : `Session status (no document loaded, no references)`,
            artifacts: {
              filePath: status?.currentFilePath ?? null,
              loaded,
              totalSnapshots,
              referenceCount: refsSummary.length,
            },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /field/:name/restore — restore a field from a snapshot
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'restore' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const body = await readJsonBody(req, res, `field/${fieldName}/restore`, broadcastStatus);
        if (!body) return;
        const snapshotId: string = body.snapshot_id;
        if (!snapshotId) {
          return mcpError(res, 400, {
            action: 'restore field',
            message: 'Missing "snapshot_id"',
            suggestion: 'list_snapshots로 스냅샷 ID를 확인한 뒤 전달하세요.',
            target: `field:${fieldName}`,
          });
        }
        const snaps = fieldSnapshots.get(fieldName) || [];
        const snapshot = snaps.find((s) => s.id === snapshotId);
        if (!snapshot) {
          return mcpError(res, 400, {
            action: 'restore field',
            message: `스냅샷을 찾을 수 없음: ${snapshotId}`,
            suggestion: 'list_snapshots로 유효한 스냅샷 ID를 확인하세요.',
            target: `field:${fieldName}`,
          });
        }
        const currentSize =
          typeof currentData[fieldName] === 'string'
            ? currentData[fieldName].length
            : JSON.stringify(currentData[fieldName] ?? '').length;
        const allowed = await deps.askRendererConfirm(
          'MCP 스냅샷 복원 요청',
          `AI 어시스턴트가 "${fieldName}" 필드를 스냅샷으로 복원하려 합니다.\n스냅샷: ${snapshotId}\n시점: ${snapshot.timestamp}\n현재 크기: ${currentSize}자 → 스냅샷 크기: ${snapshot.size}자`,
        );
        if (allowed) {
          currentData[fieldName] =
            typeof snapshot.content === 'string' ? snapshot.content : cloneJson(snapshot.content);
          if (fieldName === 'lua') {
            currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
            deps.broadcastToAll(
              'data-updated',
              'triggerScripts',
              deps.stringifyTriggerScripts(currentData.triggerScripts),
            );
          }
          logMcpMutation('restore field snapshot', `field:${fieldName}`, {
            snapshotId,
            restoredSize: snapshot.size,
          });
          deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
          return jsonResSuccess(
            res,
            {
              success: true,
              field: fieldName,
              snapshotId,
              restoredSize: snapshot.size,
              timestamp: snapshot.timestamp,
            },
            {
              toolName: 'restore_snapshot',
              summary: `Restored "${fieldName}" from snapshot ${snapshotId} (${snapshot.size} chars)`,
              artifacts: { fieldName, snapshotId, restoredSize: snapshot.size },
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'restore field',
            message: '사용자가 거부했습니다',
            rejected: true,
            target: `field:${fieldName}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // GET /field/:name/stats — get field statistics (read-only)
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'stats' && !parts[3] && req.method === 'GET') {
        const fieldName = decodeURIComponent(parts[1]);
        const raw = currentData[fieldName];
        if (raw === undefined) {
          return mcpError(res, 400, {
            action: 'get field stats',
            message: `"${fieldName}" 필드를 찾을 수 없습니다.`,
            target: `field:${fieldName}`,
          });
        }
        if (typeof raw !== 'string') {
          return jsonResSuccess(
            res,
            {
              field: fieldName,
              type: Array.isArray(raw) ? 'array' : typeof raw,
              size: JSON.stringify(raw).length,
            },
            {
              toolName: 'get_field_stats',
              summary: `Stats for "${fieldName}" (${Array.isArray(raw) ? 'array' : typeof raw})`,
              artifacts: { fieldName },
            },
          );
        }
        const content = raw as string;
        const lines = content.split('\n');
        const words = content.split(/\s+/).filter((w) => w.length > 0);
        // Count CBS tags
        const cbsTags = (content.match(/\{\{[^}]+\}\}/g) || []).length;
        // Count HTML tags
        const htmlTags = (content.match(/<[^>]+>/g) || []).length;
        return jsonResSuccess(
          res,
          {
            field: fieldName,
            type: 'string',
            characters: content.length,
            lines: lines.length,
            words: words.length,
            cbsTags,
            htmlTags,
            emptyLines: lines.filter((l) => l.trim() === '').length,
            longestLine: Math.max(...lines.map((l) => l.length)),
          },
          {
            toolName: 'get_field_stats',
            summary: `Stats for "${fieldName}" (${content.length} chars, ${lines.length} lines)`,
            artifacts: { fieldName, characters: content.length, lines: lines.length },
          },
        );
      }

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
        const sourceName = source.comment || `entry_${sourceIdx}`;

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
        const entryName: string = currentData.lorebook[idx].comment || `entry_${idx}`;

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
            { success: true, added: results.length, entries: results },
            {
              toolName: 'add_lorebook',
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
          return jsonResSuccess(
            res,
            { success: true, deleted: deleted.length, entries: deleted },
            {
              toolName: 'delete_lorebook',
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
        const replacements: Array<{
          index: number;
          find: string;
          replace?: string;
          regex?: boolean;
          flags?: string;
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
              toolName: 'replace_across_all_lorebook',
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
              toolName: 'write_lorebook',
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
        const content: string = normalizeLF(currentData.lorebook[idx][targetField] || '');
        const findStr: string = normalizeLF(body.find);
        const replaceStr: string = body.replace !== undefined ? normalizeLF(body.replace) : '';
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
              action: 'replace lorebook field',
              message: '일치하는 항목 없음',
              suggestion:
                'read_lorebook 또는 list_lorebook로 현재 내용을 확인하고 find/field/regex/flags를 조정하세요.',
              target: `lorebook:${idx}`,
            },
            { matchCount: 0, field: targetField },
          );
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

        const comment = entry.comment || `#${idx}`;
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
        if (body.content === undefined) {
          return mcpError(res, 400, {
            action: 'insert lorebook content',
            message: 'Missing "content"',
            suggestion: '삽입할 content를 요청 본문에 포함하세요.',
            target: `lorebook:${idx}`,
          });
        }
        const entryName: string = currentData.lorebook[idx].comment || `entry_${idx}`;
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
        const entryName: string = currentData.lorebook[idx].comment || `entry_${idx}`;

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
        const entry = { ...currentData.regex[idx] };
        // Normalize legacy in/out → find/replace before removing duplicates
        if (!entry.find && entry.in) entry.find = entry.in;
        if (!entry.replace && entry.out) entry.replace = entry.out;
        if (entry.find === undefined) entry.find = '';
        if (entry.replace === undefined) entry.replace = '';
        delete entry.in;
        delete entry.out;
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
            { success: true, modified: results.length, entries: results },
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
      // GREETINGS  (alternateGreetings only — groupOnlyGreetings deprecated)
      // ================================================================

      // ----------------------------------------------------------------
      // GET /greetings/:type — list greetings with index, size, preview
      // ----------------------------------------------------------------
      if (parts[0] === 'greetings' && parts[1] && !parts[2] && req.method === 'GET') {
        const greetingType = parts[1]; // "alternate" | "group"
        const fieldName = greetingType === 'alternate' ? 'alternateGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'list greetings',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate"만 사용 가능합니다. ("group"은 지원 중단됨)',
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
      // GET /greeting/:type/:idx — read single greeting
      // ----------------------------------------------------------------
      if (parts[0] === 'greeting' && parts[1] && parts[2] && !parts[3] && req.method === 'GET') {
        const greetingType = parts[1];
        const fieldName = greetingType === 'alternate' ? 'alternateGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'read greeting',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate"만 사용 가능합니다. ("group"은 지원 중단됨)',
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
      // POST /greeting/:type/add — add greeting
      // ----------------------------------------------------------------
      if (parts[0] === 'greeting' && parts[1] && parts[2] === 'add' && req.method === 'POST') {
        const greetingType = parts[1];
        const fieldName = greetingType === 'alternate' ? 'alternateGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'add greeting',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate"만 사용 가능합니다. ("group"은 지원 중단됨)',
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
        const fieldName = greetingType === 'alternate' ? 'alternateGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'batch write greetings',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate"만 사용 가능합니다. ("group"은 지원 중단됨)',
            target: `greeting:${greetingType}:batch-write`,
          });
        }
        const body = await readJsonBody(req, res, `greeting/${greetingType}/batch-write`, broadcastStatus);
        if (!body) return;
        const writes: Array<{ index: number; content: string }> = body.writes;
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
          return jsonResSuccess(
            res,
            { success: true, type: greetingType, count: writes.length },
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
        const fieldName = greetingType === 'alternate' ? 'alternateGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'reorder greetings',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate"만 사용 가능합니다. ("group"은 지원 중단됨)',
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
      const greetingReservedPaths = ['add', 'batch-write', 'batch-delete', 'reorder'];
      if (
        parts[0] === 'greeting' &&
        parts[1] &&
        parts[2] &&
        !greetingReservedPaths.includes(parts[2]) &&
        parts[3] !== 'delete' &&
        req.method === 'POST'
      ) {
        const greetingType = parts[1];
        const fieldName = greetingType === 'alternate' ? 'alternateGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'write greeting',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate"만 사용 가능합니다. ("group"은 지원 중단됨)',
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
        const fieldName = greetingType === 'alternate' ? 'alternateGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'delete greeting',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate"만 사용 가능합니다. ("group"은 지원 중단됨)',
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
          return jsonResSuccess(
            res,
            { success: true, type: greetingType, deleted: idx },
            {
              toolName: 'write_greeting',
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
        const fieldName = greetingType === 'alternate' ? 'alternateGreetings' : null;
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'batch delete greetings',
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate"만 사용 가능합니다. ("group"은 지원 중단됨)',
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
          return jsonResSuccess(
            res,
            {
              success: true,
              type: greetingType,
              deletedCount: uniqueIndices.length,
              deletedIndices: uniqueIndices,
            },
            {
              toolName: 'batch_write_greeting',
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
          return jsonResSuccess(
            res,
            { success: true, deleted: idx },
            {
              toolName: 'write_trigger',
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
        return jsonResSuccess(
          res,
          { index: idx, name: sections[idx].name, content: sections[idx].content },
          {
            toolName: 'read_lua',
            summary: `Read Lua section [${idx}] "${sections[idx].name}" (${sections[idx].content.length} chars)`,
          },
        );
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
          return { index: idx, name: sections[idx].name, content: sections[idx].content };
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
        const result = sections.map((s, i) => ({
          index: i,
          name: s.name,
          contentSize: s.content.length,
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
        return jsonResSuccess(
          res,
          { index: idx, name: sections[idx].name, content: sections[idx].content },
          {
            toolName: 'read_css',
            summary: `Read CSS section [${idx}] "${sections[idx].name}" (${sections[idx].content.length} chars)`,
          },
        );
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
          return { index: idx, name: sections[idx].name, content: sections[idx].content };
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

      // ----------------------------------------------------------------
      // GET /references — list loaded reference files
      // ----------------------------------------------------------------
      if (parts[0] === 'references' && !parts[1] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const refs = refFiles.map((r: any, i: number) => {
          const fileType = getRefFileType(r);
          const refId = r.id || r.filePath || r.fileName;
          const fields: Record<string, unknown>[] = [];
          const pushStringField = (name: string) => {
            const value = r.data?.[name];
            if (typeof value === 'string' && value) {
              fields.push({ name, size: value.length });
            }
          };
          // lua / css — standalone complex surfaces
          pushStringField('lua');
          pushStringField('css');
          // Shared scalar fields
          for (const sf of REF_SCALAR_FIELDS) {
            const val = r.data[sf.id];
            if (sf.isArray) {
              if (Array.isArray(val) && val.length > 0) fields.push({ name: sf.id, count: val.length, type: 'array' });
            } else if (sf.id === 'triggerScripts') {
              if (val && val !== '[]') fields.push({ name: sf.id, size: val.length });
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
        const entry = { ...regexArr[entryIdx] };
        // Normalize legacy in/out → find/replace
        if (!entry.find && entry.in) entry.find = entry.in;
        if (!entry.replace && entry.out) entry.replace = entry.out;
        if (entry.find === undefined) entry.find = '';
        if (entry.replace === undefined) entry.replace = '';
        delete entry.in;
        delete entry.out;
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
        const refData = (ref.data || {}) as Record<string, unknown>;
        const rules = getFieldAccessRules(refData);
        const results = fields.map((fieldName) => {
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
        const refData = (ref.data || {}) as Record<string, unknown>;
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
        const refData = (ref.data || {}) as Record<string, unknown>;
        const content = typeof refData[fieldName] === 'string' ? refData[fieldName] : String(refData[fieldName] ?? '');
        const MAX_RANGE_LENGTH = 10000;
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        const length = Math.max(1, Math.min(Number(url.searchParams.get('length')) || 2000, MAX_RANGE_LENGTH));
        const slice = content.slice(offset, offset + length);

        return jsonResSuccess(
          res,
          {
            index: idx,
            fileName: ref.fileName,
            field: fieldName,
            totalLength: content.length,
            offset,
            length: slice.length,
            hasMore: offset + length < content.length,
            content: slice,
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

        const refData = (ref.data || {}) as Record<string, unknown>;
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

        const refData = (ref.data || {}) as Record<string, unknown>;
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

      // ----------------------------------------------------------------
      // GET /assets — list all assets (path + size)
      // ----------------------------------------------------------------
      if (parts[0] === 'assets' && !parts[1] && req.method === 'GET') {
        const assets = currentData.assets || [];
        return jsonResSuccess(
          res,
          {
            count: assets.length,
            assets: assets.map((a: any, i: number) => ({
              index: i,
              path: a.path,
              size: a.data ? a.data.length : 0,
            })),
          },
          {
            toolName: 'list_charx_assets',
            summary: `Listed ${assets.length} charx asset(s)`,
            artifacts: { count: assets.length },
          },
        );
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
        const mime = extToMime(ext);
        return jsonResSuccess(
          res,
          {
            index: idx,
            path: asset.path,
            size: asset.data ? asset.data.length : 0,
            mimeType: mime,
            base64: asset.data ? asset.data.toString('base64') : '',
          },
          {
            toolName: 'read_charx_asset',
            summary: `Read charx asset ${idx} (${asset.path}, ${asset.data ? asset.data.length : 0} bytes)`,
            artifacts: { index: idx, path: asset.path, size: asset.data ? asset.data.length : 0 },
          },
        );
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
          return mcpError(res, 400, {
            action: 'add_asset',
            message: 'fileName과 base64 데이터가 필요합니다.',
            target: 'asset:add',
          });
        }
        if (!/^[a-zA-Z0-9가-힣._\- ]+$/.test(fileName)) {
          return mcpError(res, 400, {
            action: 'add_asset',
            message: '파일명에 허용되지 않는 문자가 포함되어 있습니다.',
            target: 'asset:add',
          });
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
          return mcpError(res, 409, {
            action: 'add_asset',
            message: `에셋 경로 "${assetPath}"가 이미 존재합니다.`,
            suggestion: '다른 파일명이나 폴더를 사용하세요.',
            target: `asset:${assetPath}`,
          });
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
        return jsonResSuccess(
          res,
          { ok: true, path: assetPath, size: buf.length },
          {
            toolName: 'add_charx_asset',
            summary: `Added charx asset "${assetPath}" (${buf.length} bytes)`,
            artifacts: { path: assetPath, size: buf.length },
          },
        );
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
        return jsonResSuccess(
          res,
          { ok: true, deleted: assetToDelete.path },
          {
            toolName: 'delete_charx_asset',
            summary: `Deleted charx asset "${assetToDelete.path}"`,
            artifacts: { deleted: assetToDelete.path },
          },
        );
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
          return mcpError(res, 400, {
            action: 'rename_asset',
            message: '유효한 newName이 필요합니다.',
            target: `asset:${idx}`,
          });
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
        return jsonResSuccess(
          res,
          { ok: true, oldPath, newPath },
          {
            toolName: 'rename_charx_asset',
            summary: `Renamed charx asset "${oldPath}" → "${newPath}"`,
            artifacts: { oldPath, newPath },
          },
        );
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
          return jsonResSuccess(
            res,
            {
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
            },
            {
              toolName: 'compress_assets_webp',
              summary: 'No convertible assets found',
              artifacts: { total: assets.length, converted: 0, skipped: assets.length },
            },
          );
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

          return jsonResSuccess(
            res,
            {
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
            },
            {
              toolName: 'compress_assets_webp',
              summary: `Compressed ${result.stats.converted} asset(s), saved ${result.stats.savedBytes} bytes`,
              artifacts: { converted: result.stats.converted, savedBytes: result.stats.savedBytes },
            },
          );
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
          const folderId = resolveLorebookFolderRef(folder, entries);
          entries = entries.filter(
            (e) => resolveLorebookFolderRef(e.folder, entries) === folderId || e.mode === 'folder',
          );
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

          return jsonResSuccess(res, result as unknown as Record<string, unknown>, {
            toolName: 'export_lorebook_to_files',
            summary: `Exported ${result.exportedCount} lorebook entries to ${format.toUpperCase()}`,
            artifacts: { exportedCount: result.exportedCount, format },
          });
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
        const dryRun = !!(body.dry_run ?? body.dryRun);

        try {
          // Lazy-load lorebook-io
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const lorebookIo = require('./lorebook-io') as typeof import('./lorebook-io');

          // Parse import entries
          const importEntries =
            format === 'json' ? await lorebookIo.importFromJson(source) : await lorebookIo.importFromMarkdown(source);

          if (importEntries.length === 0) {
            return jsonResSuccess(
              res,
              {
                success: true,
                totalFound: 0,
                imported: 0,
                message: 'No entries found to import.',
              },
              {
                toolName: 'import_lorebook_from_files',
                summary: 'No entries found to import',
                artifacts: { totalFound: 0, imported: 0 },
              },
            );
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
            return jsonResSuccess(
              res,
              {
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
              },
              {
                toolName: 'import_lorebook_from_files',
                summary: `Dry-run: ${importEntries.length} entries found (${resolution.toAdd.length} new, ${resolution.toOverwrite.length} overwrite)`,
                artifacts: {
                  totalFound: importEntries.length,
                  toAdd: resolution.toAdd.length,
                  toOverwrite: resolution.toOverwrite.length,
                },
              },
            );
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
              key: crypto.randomUUID(),
              content: '',
              mode: 'folder',
              folder: '',
              insertorder: 100,
            };
            (currentData.lorebook as unknown[]).push(folderEntry);
            const folderRef = getFolderRef(folderEntry);
            if (folderRef) {
              newFolderIds.set(folderName, folderRef);
            }
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
            entry.folder = lorebookIo.resolveImportedFolderRef(entry, allFolderByName);
            normalizeLorebookEntryFolderIdentity(entry);
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
              existing.folder = lorebookIo.resolveImportedFolderRef(data, allFolderByName);
              normalizeLorebookEntryFolderIdentity(existing);
            }
          }

          canonicalizeLorebookFolderRefs((currentData.lorebook as Record<string, unknown>[]) || []);

          // Broadcast update
          deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);

          broadcastStatus({
            type: 'success',
            action: 'import-lorebook',
            message: `Imported ${resolution.toAdd.length + resolution.toOverwrite.length} entries.`,
          });

          const importedCount = resolution.toAdd.length + resolution.toOverwrite.length;
          return jsonResSuccess(
            res,
            {
              success: true,
              totalFound: importEntries.length,
              imported: resolution.toAdd.length,
              overwritten: resolution.toOverwrite.length,
              skipped: resolution.skipped.length,
              renamed: resolution.renamed.length,
              foldersCreated,
              errors,
            },
            {
              toolName: 'import_lorebook_from_files',
              summary: `Imported ${importedCount} lorebook entries (${resolution.toAdd.length} new, ${resolution.toOverwrite.length} overwritten)`,
              artifacts: {
                totalFound: importEntries.length,
                imported: resolution.toAdd.length,
                overwritten: resolution.toOverwrite.length,
              },
            },
          );
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

          return jsonResSuccess(res, result as Record<string, unknown>, {
            toolName: 'export_field_to_file',
            summary: `Exported "${field}" to ${filePath}`,
            artifacts: {
              filePath: (result as Record<string, unknown>).filePath,
              size: (result as Record<string, unknown>).size,
            },
          });
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
        return jsonResSuccess(
          res,
          { count: items.length, assets: items },
          {
            toolName: 'list_risum_assets',
            summary: `Listed ${items.length} risum asset(s)`,
            artifacts: { count: items.length },
          },
        );
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
        const risumAssetName = meta?.[0] || `asset_${idx}`;
        return jsonResSuccess(
          res,
          {
            index: idx,
            name: risumAssetName,
            path: meta?.[2] || '',
            size: assetBuf.length,
            base64: assetBuf.toString('base64'),
          },
          {
            toolName: 'read_risum_asset',
            summary: `Read risum asset ${idx} ("${risumAssetName}", ${assetBuf.length} bytes)`,
            artifacts: { index: idx, name: risumAssetName, size: assetBuf.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /risum-asset/add — add risum asset from base64
      // ----------------------------------------------------------------
      if (parts[0] === 'risum-asset' && parts[1] === 'add' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const assetName: string = body.name || '';
        const assetPath: string = body.path || '';
        const base64Data: string = body.base64 || '';
        const assetExt = ((assetPath || assetName).split('.').pop() || 'png').toLowerCase();
        if (!assetName || !base64Data) {
          return mcpError(res, 400, {
            action: 'add_risum_asset',
            message: 'name과 base64 데이터가 필요합니다.',
            target: 'risum-asset:add',
          });
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
          (mod.assets as unknown[]).push([assetName, '', assetExt]);
        }
        // Sync to card.json assets (charx only)
        const addFileType = currentData._fileType || 'charx';
        if (addFileType === 'charx' && Array.isArray(currentData.cardAssets)) {
          currentData.cardAssets.push({
            type: 'x-risu-asset',
            uri: `embeded://${assetPath || assetName}`,
            name: assetName,
            ext: assetExt,
          });
        }
        if (deps.invalidateAssetsMapCache) deps.invalidateAssetsMapCache();
        deps.broadcastToAll('data-updated', { field: 'risumAssets' });
        return jsonResSuccess(
          res,
          { ok: true, index: currentData.risumAssets.length - 1, name: assetName, size: buf.length },
          {
            toolName: 'add_risum_asset',
            summary: `Added risum asset "${assetName}" (${buf.length} bytes)`,
            artifacts: { name: assetName, size: buf.length },
          },
        );
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
        return jsonResSuccess(
          res,
          { ok: true, deleted: deleteName },
          {
            toolName: 'delete_risum_asset',
            summary: `Deleted risum asset "${deleteName}"`,
            artifacts: { deleted: deleteName },
          },
        );
      }

      if (
        await handleCbsRoute(req, res, parts, url, {
          getCurrentData: deps.getCurrentData,
          readJsonBody,
          broadcastStatus,
          jsonRes,
          jsonResSuccess,
          mcpError,
        })
      ) {
        return;
      }

      // ================================================================
      // RISUP: Prompt Items & Formating Order
      // ================================================================

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
        const newItems = [...model.items, validation.model];
        const newText = serializePromptTemplate({ items: newItems });
        const newIdx = newItems.length - 1;

        const allowed = await deps.askRendererConfirm(
          'MCP 추가 요청',
          `AI 어시스턴트가 promptTemplate에 새 항목(type: ${validation.model.type})을 추가하려 합니다.`,
        );
        if (allowed) {
          currentData.promptTemplate = newText;
          logMcpMutation('add risup prompt item', 'risup:promptTemplate', {
            type: validation.model.type,
            newIndex: newIdx,
          });
          deps.broadcastToAll('data-updated', 'promptTemplate', newText);
          return jsonResSuccess(
            res,
            { success: true, index: newIdx },
            {
              toolName: 'write_risup_prompt_item',
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
          logMcpMutation('reorder risup prompt items', 'risup:promptTemplate', { count: model.items.length });
          deps.broadcastToAll('data-updated', 'promptTemplate', newText);
          return jsonResSuccess(
            res,
            { success: true, order: newOrder },
            {
              toolName: 'write_risup_prompt_item',
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
        !['add', 'reorder'].includes(parts[2]) &&
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
        const deletedType = model.items[idx].type ?? 'unknown';

        const allowed = await deps.askRendererConfirm(
          'MCP 삭제 요청',
          `AI 어시스턴트가 promptTemplate의 항목 #${idx} (type: ${deletedType})을(를) 삭제하려 합니다.`,
        );
        if (allowed) {
          const newItems = model.items.filter((_, i) => i !== idx);
          const newText = serializePromptTemplate({ items: newItems });
          currentData.promptTemplate = newText;
          logMcpMutation('delete risup prompt item', 'risup:promptTemplate', { idx, deletedType });
          deps.broadcastToAll('data-updated', 'promptTemplate', newText);
          return jsonResSuccess(
            res,
            { success: true, deleted: idx },
            {
              toolName: 'write_risup_prompt_item',
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
      // POST /risup/prompt-item/:idx — write/update prompt item
      // ----------------------------------------------------------------
      if (
        parts[0] === 'risup' &&
        parts[1] === 'prompt-item' &&
        parts[2] &&
        !parts[3] &&
        !['add', 'reorder'].includes(parts[2]) &&
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

        const allowed = await deps.askRendererConfirm(
          'MCP 수정 요청',
          `AI 어시스턴트가 promptTemplate의 항목 #${idx} (type: ${validation.model.type})을(를) 수정하려 합니다.`,
        );
        if (allowed) {
          const newItems = model.items.map((item, i) => (i === idx ? validation.model : item));
          const newText = serializePromptTemplate({ items: newItems });
          currentData.promptTemplate = newText;
          logMcpMutation('write risup prompt item', `risup:promptTemplate:${idx}`, { type: validation.model.type });
          deps.broadcastToAll('data-updated', 'promptTemplate', newText);
          return jsonResSuccess(
            res,
            { success: true, index: idx },
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
          logMcpMutation('write risup formating order', 'risup:formatingOrder', {
            oldSize: oldValue.length,
            newSize: newValue.length,
            count: newTokens.length,
          });
          deps.broadcastToAll('data-updated', 'formatingOrder', newValue);
          return jsonResSuccess(
            res,
            { success: true, count: newTokens.length },
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
      // GET /skills — list available skill documents
      // ----------------------------------------------------------------
      if (parts[0] === 'skills' && !parts[1] && req.method === 'GET') {
        const skillsDir = deps.getSkillsDir();
        try {
          const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
          const skills: Array<{
            name: string;
            description: string;
            tags: string[];
            relatedTools: string[];
            files: string[];
          }> = [];
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
            if (!fs.existsSync(skillMdPath)) continue;
            const raw = fs.readFileSync(skillMdPath, 'utf-8');
            const fm = parseYamlFrontmatter(raw);
            const dirFiles = fs
              .readdirSync(path.join(skillsDir, entry.name))
              .filter((f) => f.endsWith('.md'))
              .sort((a, b) => a.localeCompare(b));
            skills.push({
              name: fm.name || entry.name,
              description: fm.description || '',
              tags: fm.tags,
              relatedTools: fm.relatedTools,
              files: dirFiles,
            });
          }
          skills.sort((a, b) => a.name.localeCompare(b.name));
          return jsonResSuccess(
            res,
            { count: skills.length, skills },
            {
              toolName: 'list_skills',
              summary: `Listed ${skills.length} skill(s)`,
              artifacts: { count: skills.length },
            },
          );
        } catch {
          return jsonResSuccess(
            res,
            { count: 0, skills: [], error: 'Skills directory not found' },
            {
              toolName: 'list_skills',
              summary: 'Skills directory not found',
              artifacts: { count: 0 },
            },
          );
        }
      }

      // ----------------------------------------------------------------
      // GET /skills/:name — read SKILL.md of a specific skill
      // GET /skills/:name/:file — read a reference file within a skill
      // ----------------------------------------------------------------
      if (parts[0] === 'skills' && parts[1] && req.method === 'GET') {
        const skillName = decodeURIComponent(parts[1]);
        const fileName = parts[2] ? decodeURIComponent(parts[2]) : 'SKILL.md';
        if (skillName.includes('..') || skillName.includes('/') || skillName.includes('\\')) {
          return mcpError(res, 400, {
            action: 'read_skill',
            message: 'Invalid skill name',
            suggestion: 'Skill name must not contain path separators or "..".',
            target: `skills:${skillName}:${fileName}`,
          });
        }
        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
          return mcpError(res, 400, {
            action: 'read_skill',
            message: 'Invalid file name',
            suggestion: 'File name must not contain path separators or "..".',
            target: `skills:${skillName}:${fileName}`,
          });
        }
        const filePath = path.join(deps.getSkillsDir(), skillName, fileName);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          return jsonResSuccess(
            res,
            { skill: skillName, file: fileName, content },
            {
              toolName: 'read_skill',
              summary: `Read skill ${skillName}/${fileName} (${content.length} chars)`,
              artifacts: { skill: skillName, file: fileName, size: content.length },
            },
          );
        } catch {
          return mcpError(res, 404, {
            action: 'read_skill',
            message: `Skill file not found: ${skillName}/${fileName}`,
            suggestion: 'list_skills로 사용 가능한 스킬 목록을 확인하세요.',
            target: `skills:${skillName}:${fileName}`,
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
      fieldSnapshots.clear();
    },
  };
}
