import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { handleCbsRoute } from './mcp-cbs-routes';
import { handleProbeRoute, type ProbeDocumentRequest } from './mcp-probe-routes';
import { fileStatMetadata, handleSessionStatusRoute } from './mcp-session-routes';
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
  duplicatePromptItem,
  parsePromptTemplate,
  parsePromptTemplateFromText,
  serializePromptTemplate,
  serializePromptTemplateSubsetToText,
  serializePromptTemplateToText,
  parseFormatingOrder,
  collectFormatingOrderWarnings,
  validateLocalStopStringsText,
  validatePresetBiasText,
  validatePromptTemplateText,
  validateFormatingOrderText,
  type PromptItemModel,
} from './risup-prompt-model';
import { diffRisupPromptData, diffRisupPromptWithText } from './risup-prompt-compare';
import { listSkillCatalogEntries, resolveSkillCatalogFile } from './skill-catalog';
import {
  canonicalizeRisupPromptSnippetText,
  deleteRisupPromptSnippet,
  getRisupPromptSnippetLibraryPath,
  listRisupPromptSnippets,
  readRisupPromptSnippet,
  saveRisupPromptSnippet,
  type RisupPromptSnippet,
} from './risup-prompt-snippet-store';
import { mcpSuccess, errorRecoveryMeta, type McpErrorInfo, type McpSuccessOptions } from './mcp-response-envelope';
import { normalizeLF, extToMime, cloneJson } from './shared-utils';
import { REF_SCALAR_FIELDS, REF_ALLOWED_READ_FIELDS, getGreetingFieldName, getRefFileType } from './reference-store';
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

export interface McpReferenceManifestStatus {
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: string;
}

export interface McpSessionStatus {
  currentFilePath: string | null;
  currentFileType: 'charx' | 'risum' | 'risup' | null;
  lastRestored: McpLastRestoredStatus | null;
  pendingRecovery: McpPendingRecoveryStatus | null;
  renderer: McpRendererSessionStatus | null;
  referenceManifestStatus?: McpReferenceManifestStatus | null;
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
  /** Ask the app to save the current document. */
  saveCurrentDocument?: () => Promise<{ success: boolean; path?: string; error?: string }>;
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
  saveExternalDocument: (filePath: string, fileType: SupportedFileType, data: any) => void;
  normalizeTriggerScripts: (data: any) => any;
  extractPrimaryLua: (scripts: any) => string;
  mergePrimaryLua: (scripts: any, lua: string) => any;
  stringifyTriggerScripts: (scripts: any) => string;

  // skills directories
  getSkillRoots: () => string[];

  // user data directory for sidecar state
  getUserDataPath: () => string;

  // session metadata
  getSessionStatus?: () => Promise<McpSessionStatus> | McpSessionStatus;
  getCurrentFilePath?: () => string | null;
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
const MAX_SURFACE_REPLACE_MATCHES = 1000;

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
  const indentedMatch = block.match(new RegExp(`^${key}:\\s*\\r?\\n((?:[ \\t]+[^\\n]*\\r?\\n?)+)`, 'm'));
  const rawArray = (match?.[1] ?? indentedMatch?.[1]?.replace(/\r?\n/g, ' ') ?? '').trim();
  if (!rawArray) return [];
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

function collectRisupFormatingOrderWarningsForPrompt(
  currentData: Record<string, unknown>,
  promptModel: ReturnType<typeof parsePromptTemplate>,
): string[] {
  if (promptModel.state === 'invalid') return [];
  const rawOrder = typeof currentData.formatingOrder === 'string' ? currentData.formatingOrder : '';
  const orderModel = parseFormatingOrder(rawOrder);
  if (orderModel.state === 'invalid') return [];
  return collectFormatingOrderWarnings(promptModel, orderModel);
}

function getRisupPromptSnippetLibraryFilePath(deps: McpApiDeps): string {
  return getRisupPromptSnippetLibraryPath(deps.getUserDataPath());
}

function buildRisupPromptSnippetSummary(snippet: RisupPromptSnippet): {
  id: string;
  name: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: snippet.id,
    name: snippet.name,
    itemCount: snippet.itemCount,
    createdAt: snippet.createdAt,
    updatedAt: snippet.updatedAt,
  };
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

const MAX_RISUP_PROMPT_BATCH = 50;

function hasExplicitPromptItemId(item: unknown): boolean {
  return (
    !!item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    typeof (item as Record<string, unknown>).id === 'string' &&
    !!(item as Record<string, unknown>).id
  );
}

function getPromptItemSearchFields(item: PromptItemModel): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value: string }> = [];
  const push = (field: string, value: string | undefined): void => {
    if (typeof value === 'string' && value.length > 0) {
      fields.push({ field, value });
    }
  };

  if (!item.supported) {
    push('raw', JSON.stringify(item.rawValue));
    return fields;
  }

  switch (item.type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
    case 'chatML':
      push('text', item.text);
      push('name', item.name);
      break;
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
      push('innerFormat', item.innerFormat);
      push('name', item.name);
      break;
    case 'authornote':
      push('defaultText', item.defaultText);
      push('innerFormat', item.innerFormat);
      push('name', item.name);
      break;
    case 'chat':
      push('name', item.name);
      break;
    case 'cache':
      push('name', item.name);
      break;
  }

  return fields;
}

function findPromptItemMatchedFields(item: PromptItemModel, query: string, caseSensitive: boolean): string[] {
  const needle = caseSensitive ? query : query.toLowerCase();
  return getPromptItemSearchFields(item)
    .filter(({ value }) => {
      const haystack = caseSensitive ? value : value.toLowerCase();
      return haystack.includes(needle);
    })
    .map(({ field }) => field);
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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashSurface(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function measureSurface(value: unknown): { type: string; byteSize: number; count?: number; preview?: string } {
  if (Array.isArray(value))
    return { type: 'array', byteSize: Buffer.byteLength(stableJson(value)), count: value.length };
  if (value && typeof value === 'object') {
    return { type: 'object', byteSize: Buffer.byteLength(stableJson(value)), count: Object.keys(value).length };
  }
  if (typeof value === 'string') {
    return {
      type: 'string',
      byteSize: Buffer.byteLength(value),
      preview: value.slice(0, 120) + (value.length > 120 ? '…' : ''),
    };
  }
  return { type: value === null ? 'null' : typeof value, byteSize: Buffer.byteLength(stableJson(value)) };
}

function parseJsonPointer(pointer: string | undefined): string[] {
  if (!pointer || pointer === '/') return [];
  if (!pointer.startsWith('/')) throw new Error('path must be a JSON Pointer beginning with "/"');
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function assertSafePointerToken(token: string): void {
  if (token === '__proto__' || token === 'prototype' || token === 'constructor') {
    throw new Error(`Unsafe path token: ${token}`);
  }
}

function getPointerValue(root: unknown, pointer: string | undefined): unknown {
  let current = root;
  for (const token of parseJsonPointer(pointer)) {
    assertSafePointerToken(token);
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new Error(`Array index out of range: ${token}`);
      }
      current = current[index];
      continue;
    }
    if (!current || typeof current !== 'object' || !(token in (current as Record<string, unknown>))) {
      throw new Error(`Path not found: ${pointer}`);
    }
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

function getPointerParent(root: unknown, pointer: string): { parent: unknown; key: string } {
  const tokens = parseJsonPointer(pointer);
  if (tokens.length === 0) throw new Error('Cannot mutate the document root with this operation');
  const key = tokens[tokens.length - 1];
  assertSafePointerToken(key);
  const parentPointer = tokens
    .slice(0, -1)
    .map((token) => token.replace(/~/g, '~0').replace(/\//g, '~1'))
    .join('/');
  return { parent: getPointerValue(root, parentPointer ? `/${parentPointer}` : ''), key };
}

function setPointerValue(root: unknown, pointer: string, value: unknown, allowAdd: boolean): void {
  const { parent, key } = getPointerParent(root, pointer);
  if (Array.isArray(parent)) {
    if (key === '-') {
      if (!allowAdd) throw new Error('"-" array append is only valid for add operations');
      parent.push(value);
      return;
    }
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index > parent.length || (!allowAdd && index >= parent.length)) {
      throw new Error(`Array index out of range: ${key}`);
    }
    if (allowAdd && index === parent.length) parent.push(value);
    else parent[index] = value;
    return;
  }
  if (!parent || typeof parent !== 'object') throw new Error('Parent path is not an object or array');
  if (!allowAdd && !(key in (parent as Record<string, unknown>))) throw new Error(`Path not found: ${pointer}`);
  (parent as Record<string, unknown>)[key] = value;
}

function removePointerValue(root: unknown, pointer: string): unknown {
  const { parent, key } = getPointerParent(root, pointer);
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length)
      throw new Error(`Array index out of range: ${key}`);
    return parent.splice(index, 1)[0];
  }
  if (!parent || typeof parent !== 'object' || !(key in (parent as Record<string, unknown>))) {
    throw new Error(`Path not found: ${pointer}`);
  }
  const record = parent as Record<string, unknown>;
  const old = record[key];
  delete record[key];
  return old;
}

function clonePatchValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  return cloneJson(value);
}

function applySurfacePatch(
  target: Record<string, unknown>,
  operations: unknown[],
): {
  changed: number;
  touchedTopLevel: string[];
} {
  const touched = new Set<string>();
  let changed = 0;
  for (const rawOp of operations) {
    if (!rawOp || typeof rawOp !== 'object') throw new Error('Each patch operation must be an object');
    const op = rawOp as Record<string, unknown>;
    const kind = op.op;
    const pathValue = op.path;
    if (kind !== 'add' && kind !== 'replace' && kind !== 'remove') {
      throw new Error('Unsupported patch op. Use add, replace, or remove.');
    }
    if (typeof pathValue !== 'string') throw new Error('Patch operation path must be a string');
    const topLevel = parseJsonPointer(pathValue)[0];
    if (topLevel) touched.add(topLevel);
    if (kind === 'remove') {
      removePointerValue(target, pathValue);
    } else {
      if (!('value' in op)) throw new Error(`${kind} operation requires a value`);
      setPointerValue(target, pathValue, clonePatchValue(op.value), kind === 'add');
    }
    changed++;
  }
  return { changed, touchedTopLevel: [...touched] };
}

function buildSurfaceList(data: Record<string, unknown>, fileType: SupportedFileType): Record<string, unknown>[] {
  const rules = getFieldAccessRules(data);
  const names = new Set<string>([
    ...rules.allowedFields,
    'lorebook',
    'regex',
    'alternateGreetings',
    'groupOnlyGreetings',
    'triggerScripts',
    'lua',
    'css',
    'assets',
    'cardAssets',
    'risumAssets',
    '_risuExt',
    '_moduleData',
  ]);
  if (fileType === 'risup') {
    names.add('promptTemplate');
    names.add('formatingOrder');
    names.add('presetBias');
    names.add('localStopStrings');
  }
  return [...names]
    .filter((name) => Object.prototype.hasOwnProperty.call(data, name))
    .sort()
    .map((name) => {
      const value = data[name];
      const measure = measureSurface(value);
      return {
        name,
        path: `/${name}`,
        ...measure,
        hash: hashSurface(value),
        dedicatedToolFamily:
          name === 'lorebook'
            ? 'lorebook'
            : name === 'regex'
              ? 'regex'
              : name === 'triggerScripts'
                ? 'trigger'
                : name === 'lua'
                  ? 'lua'
                  : name === 'css'
                    ? 'css'
                    : name === 'promptTemplate' || name === 'formatingOrder'
                      ? 'risup-prompt'
                      : name === 'alternateGreetings' || name === 'groupOnlyGreetings'
                        ? 'greeting'
                        : undefined,
      };
    });
}

function replaceStringInSurface(
  value: unknown,
  find: string,
  replacement: string,
  regexMode: boolean,
  flags?: string,
): {
  next: unknown;
  matches: number;
} {
  let matches = 0;
  const pattern = regexMode ? new RegExp(find, flags || 'g') : null;
  const visit = (node: unknown): unknown => {
    if (typeof node === 'string') {
      if (regexMode) {
        const re = new RegExp(pattern!.source, pattern!.flags.includes('g') ? pattern!.flags : `${pattern!.flags}g`);
        const localMatches = [...node.matchAll(re)].length;
        matches += localMatches;
        if (matches > MAX_SURFACE_REPLACE_MATCHES)
          throw new Error(`Too many matches (>${MAX_SURFACE_REPLACE_MATCHES})`);
        return node.replace(re, replacement);
      }
      const localMatches = find ? node.split(find).length - 1 : 0;
      matches += localMatches;
      if (matches > MAX_SURFACE_REPLACE_MATCHES) throw new Error(`Too many matches (>${MAX_SURFACE_REPLACE_MATCHES})`);
      return find ? node.split(find).join(replacement) : node;
    }
    if (Array.isArray(node)) return node.map(visit);
    if (node && typeof node === 'object') {
      const next: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) next[key] = visit(child);
      return next;
    }
    return node;
  };
  return { next: visit(value), matches };
}

function inferDocumentFileType(data: Record<string, unknown>, fallback?: SupportedFileType | null): SupportedFileType {
  if (fallback === 'risum' || fallback === 'risup' || fallback === 'charx') return fallback;
  if (data._fileType === 'risum' || data._fileType === 'risup') return data._fileType;
  return 'charx';
}

function getLorebookEntryComment(entry: Record<string, unknown> | undefined): string {
  return typeof entry?.comment === 'string' ? entry.comment : '';
}

function getLorebookEntryLabel(entry: Record<string, unknown> | undefined, index: number): string {
  const comment = getLorebookEntryComment(entry);
  return comment || `entry_${index}`;
}

function ensureExpectedStringMatch(
  res: http.ServerResponse,
  index: number,
  actualValue: string,
  expectedValue: unknown,
  config: {
    parameterName: string;
    actualKey: string;
    resourceLabel: string;
    identityLabel: string;
    action: string;
    target: string;
    suggestion: string;
    onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void;
  },
): boolean {
  if (expectedValue === undefined) return true;
  if (typeof expectedValue !== 'string') {
    config.onError(res, 400, {
      action: config.action,
      message: `${config.parameterName} must be a string when provided`,
      suggestion: config.suggestion,
      target: config.target,
    });
    return false;
  }
  if (actualValue === expectedValue) return true;
  config.onError(res, 409, {
    action: config.action,
    message: `Stale ${config.resourceLabel} index ${index}: expected ${config.identityLabel} "${expectedValue}" but found "${actualValue}"`,
    suggestion: config.suggestion,
    target: config.target,
    details: { [config.parameterName]: expectedValue, [config.actualKey]: actualValue },
  });
  return false;
}

function ensureLorebookExpectedComment(
  res: http.ServerResponse,
  index: number,
  entry: Record<string, unknown> | undefined,
  expectedComment: unknown,
  action: string,
  target: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): boolean {
  return ensureExpectedStringMatch(res, index, getLorebookEntryComment(entry), expectedComment, {
    parameterName: 'expected_comment',
    actualKey: 'actual_comment',
    resourceLabel: 'lorebook',
    identityLabel: 'comment',
    action,
    target,
    suggestion: 'list_lorebook로 최신 index/comment를 다시 확인한 뒤 다시 시도하세요.',
    onError,
  });
}

function getRegexEntryComment(entry: Record<string, unknown> | undefined): string {
  return typeof entry?.comment === 'string' ? entry.comment : '';
}

function ensureRegexExpectedComment(
  res: http.ServerResponse,
  index: number,
  entry: Record<string, unknown> | undefined,
  expectedComment: unknown,
  action: string,
  target: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): boolean {
  return ensureExpectedStringMatch(res, index, getRegexEntryComment(entry), expectedComment, {
    parameterName: 'expected_comment',
    actualKey: 'actual_comment',
    resourceLabel: 'regex',
    identityLabel: 'comment',
    action,
    target,
    suggestion: 'list_regex로 최신 index/comment를 다시 확인한 뒤 다시 시도하세요.',
    onError,
  });
}

function getTriggerEntryComment(entry: Record<string, unknown> | undefined): string {
  return typeof entry?.comment === 'string' ? entry.comment : '';
}

function ensureTriggerExpectedComment(
  res: http.ServerResponse,
  index: number,
  entry: Record<string, unknown> | undefined,
  expectedComment: unknown,
  action: string,
  target: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): boolean {
  return ensureExpectedStringMatch(res, index, getTriggerEntryComment(entry), expectedComment, {
    parameterName: 'expected_comment',
    actualKey: 'actual_comment',
    resourceLabel: 'trigger',
    identityLabel: 'comment',
    action,
    target,
    suggestion: 'list_triggers로 최신 index/comment를 다시 확인한 뒤 다시 시도하세요.',
    onError,
  });
}

function getGreetingPreview(content: string): string {
  return content.slice(0, 100) + (content.length > 100 ? '…' : '');
}

function ensureGreetingExpectedPreview(
  res: http.ServerResponse,
  index: number,
  content: string | undefined,
  expectedPreview: unknown,
  action: string,
  target: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): boolean {
  return ensureExpectedStringMatch(res, index, getGreetingPreview(content ?? ''), expectedPreview, {
    parameterName: 'expected_preview',
    actualKey: 'actual_preview',
    resourceLabel: 'greeting',
    identityLabel: 'preview',
    action,
    target,
    suggestion: 'list_greetings로 최신 index/preview를 다시 확인한 뒤 다시 시도하세요.',
    onError,
  });
}

function getSectionPreview(content: string): string {
  return content.slice(0, 100) + (content.length > 100 ? '…' : '');
}

function getSectionHash(content: string): string {
  return hashSurface(normalizeLF(content));
}

function buildSectionReadPayload(index: number, section: Section): Record<string, unknown> {
  return {
    index,
    name: section.name,
    content: section.content,
    contentSize: section.content.length,
    preview: getSectionPreview(section.content),
    hash: getSectionHash(section.content),
  };
}

function ensureSectionExpectedIdentity(
  res: http.ServerResponse,
  family: 'lua' | 'css',
  index: number,
  section: Section,
  expectedHash: unknown,
  expectedPreview: unknown,
  action: string,
  target: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): boolean {
  const label = family === 'lua' ? 'Lua section' : 'CSS section';
  const suggestion =
    family === 'lua'
      ? 'list_lua 또는 read_lua로 최신 index/hash/preview를 다시 확인한 뒤 다시 시도하세요.'
      : 'list_css 또는 read_css로 최신 index/hash/preview를 다시 확인한 뒤 다시 시도하세요.';
  if (
    !ensureExpectedStringMatch(res, index, getSectionHash(section.content), expectedHash, {
      parameterName: 'expected_hash',
      actualKey: 'actual_hash',
      resourceLabel: label,
      identityLabel: 'hash',
      action,
      target,
      suggestion,
      onError,
    })
  ) {
    return false;
  }
  return ensureExpectedStringMatch(res, index, getSectionPreview(section.content), expectedPreview, {
    parameterName: 'expected_preview',
    actualKey: 'actual_preview',
    resourceLabel: label,
    identityLabel: 'preview',
    action,
    target,
    suggestion,
    onError,
  });
}

function ensureAssetExpectedPath(
  res: http.ServerResponse,
  index: number,
  actualPath: string,
  expectedPath: unknown,
  action: string,
  target: string,
  suggestion: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): boolean {
  return ensureExpectedStringMatch(res, index, actualPath, expectedPath, {
    parameterName: 'expected_path',
    actualKey: 'actual_path',
    resourceLabel: 'asset',
    identityLabel: 'path',
    action,
    target,
    suggestion,
    onError,
  });
}

function getPromptItemType(item: PromptItemModel): string {
  return item.type ?? 'unknown';
}

function ensureRisupPromptExpectedIdentity(
  res: http.ServerResponse,
  index: number,
  item: PromptItemModel,
  expectedType: unknown,
  expectedPreview: unknown,
  action: string,
  target: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): boolean {
  if (
    !ensureExpectedStringMatch(res, index, getPromptItemType(item), expectedType, {
      parameterName: 'expected_type',
      actualKey: 'actual_type',
      resourceLabel: 'risup prompt item',
      identityLabel: 'type',
      action,
      target,
      suggestion: 'list_risup_prompt_items로 최신 index/type/preview를 다시 확인한 뒤 다시 시도하세요.',
      onError,
    })
  ) {
    return false;
  }
  return ensureExpectedStringMatch(res, index, promptItemPreview(item), expectedPreview, {
    parameterName: 'expected_preview',
    actualKey: 'actual_preview',
    resourceLabel: 'risup prompt item',
    identityLabel: 'preview',
    action,
    target,
    suggestion: 'list_risup_prompt_items로 최신 index/type/preview를 다시 확인한 뒤 다시 시도하세요.',
    onError,
  });
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

function normalizeRegexEntryForResponse(entry: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...entry };
  if (!normalized.find && normalized.in) normalized.find = normalized.in;
  if (!normalized.replace && normalized.out) normalized.replace = normalized.out;
  if (normalized.find === undefined) normalized.find = '';
  if (normalized.replace === undefined) normalized.replace = '';
  delete normalized.in;
  delete normalized.out;
  return normalized;
}

function buildLuaListResponse(luaCode: string, parseLuaSections: (lua: string) => Section[]): Record<string, unknown> {
  const sections = parseLuaSections(luaCode);
  return {
    count: sections.length,
    sections: sections.map((section, index) => ({
      index,
      name: section.name,
      contentSize: section.content.length,
      preview: getSectionPreview(section.content),
      hash: getSectionHash(section.content),
    })),
  };
}

function buildCssListResponse(
  cssCode: string,
  parseCssSections: (css: string) => CssCacheEntry,
): Record<string, unknown> {
  const { sections } = parseCssSections(cssCode);
  return {
    count: sections.length,
    sections: sections.map((section, index) => ({
      index,
      name: section.name,
      contentSize: section.content.length,
      preview: getSectionPreview(section.content),
      hash: getSectionHash(section.content),
    })),
  };
}

function buildGreetingListResponse(arr: string[], greetingType: string, url: URL): Record<string, unknown> {
  const fieldName = getGreetingFieldName(greetingType);
  let items = arr.map((content, index) => ({
    index,
    contentSize: content.length,
    preview: getGreetingPreview(content),
  }));

  const filterParam = url.searchParams.get('filter');
  if (filterParam) {
    const q = filterParam.toLowerCase();
    items = items.filter((entry) => (arr[entry.index] || '').toLowerCase().includes(q));
  }

  const contentFilterParam = url.searchParams.get('content_filter');
  if (contentFilterParam) {
    const q = contentFilterParam.toLowerCase();
    items = items.filter((entry) => (arr[entry.index] || '').toLowerCase().includes(q));
    items = items.map((entry) => {
      const rawContent = arr[entry.index] || '';
      const lowered = rawContent.toLowerCase();
      const matchPos = lowered.indexOf(q);
      if (matchPos >= 0) {
        const start = Math.max(0, matchPos - 50);
        const end = Math.min(rawContent.length, matchPos + q.length + 50);
        return {
          ...entry,
          contentMatch: (start > 0 ? '…' : '') + rawContent.slice(start, end) + (end < rawContent.length ? '…' : ''),
        };
      }
      return entry;
    });
  }

  return {
    type: greetingType,
    field: fieldName,
    count: items.length,
    total: arr.length,
    items,
  };
}

function buildTriggerListResponse(triggerScripts: unknown): Record<string, unknown> {
  const scripts = Array.isArray(triggerScripts) ? triggerScripts : [];
  return {
    count: scripts.length,
    items: scripts.map((script: any, index: number) => ({
      index,
      comment: script.comment || '',
      type: script.type || '',
      conditionCount: Array.isArray(script.conditions) ? script.conditions.length : 0,
      effectCount: Array.isArray(script.effect) ? script.effect.length : 0,
      lowLevelAccess: !!script.lowLevelAccess,
    })),
  };
}

function buildFieldInventory(
  currentData: Record<string, unknown>,
  deps: Pick<McpApiDeps, 'stringifyTriggerScripts'>,
): { fileType: SupportedFileType; fields: Record<string, unknown>[] } {
  const fileType: SupportedFileType =
    currentData._fileType === 'risum' || currentData._fileType === 'risup' ? currentData._fileType : 'charx';
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
  const fields: Record<string, unknown>[] = fieldNames.map((fieldName) => {
    const value =
      fieldName === 'triggerScripts'
        ? deps.stringifyTriggerScripts(currentData.triggerScripts)
        : currentData[fieldName] || '';
    const length = typeof value === 'string' ? value.length : String(value).length;
    return {
      name: fieldName,
      size: length,
      sizeKB: `${(length / 1024).toFixed(1)}KB`,
    };
  });

  fields.push({
    name: 'alternateGreetings',
    count: Array.isArray(currentData.alternateGreetings) ? currentData.alternateGreetings.length : 0,
    type: 'array',
  });
  if (isCharx) {
    fields.push({
      name: 'groupOnlyGreetings',
      count: Array.isArray((currentData as any).groupOnlyGreetings)
        ? (currentData as any).groupOnlyGreetings.length
        : 0,
      type: 'array',
    });
  }
  fields.push({
    name: 'lorebook',
    count: Array.isArray(currentData.lorebook) ? currentData.lorebook.length : 0,
    type: 'array',
  });
  fields.push({ name: 'regex', count: Array.isArray(currentData.regex) ? currentData.regex.length : 0, type: 'array' });

  if (isCharx) {
    const charxStringFields = ['creatorcomment', 'exampleMessage', 'systemPrompt', 'creator', 'characterVersion'];
    for (const fieldName of charxStringFields) {
      fields.push({ name: fieldName, size: String(currentData[fieldName] || '').length, type: 'string' });
    }
    const charxReadOnlyFields = ['personality', 'scenario', 'nickname', 'additionalText', 'license'];
    for (const fieldName of charxReadOnlyFields) {
      const value = String(currentData[fieldName] || '');
      if (value.length > 0) {
        fields.push({ name: fieldName, size: value.length, type: 'string (read-only)' });
      }
    }
    const readOnlyArrayFields = [
      { name: 'tags', data: currentData.tags },
      { name: 'source', data: currentData.source },
    ];
    for (const field of readOnlyArrayFields) {
      const arr = Array.isArray(field.data) ? field.data : [];
      if (arr.length > 0) {
        fields.push({ name: field.name, count: arr.length, type: 'array (read-only)' });
      }
    }
    fields.push({ name: 'creationDate', value: currentData.creationDate ?? 0, type: 'number (read-only)' });
    fields.push({ name: 'modificationDate', value: currentData.modificationDate ?? 0, type: 'number (read-only)' });
  }

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
    for (const fieldName of risumStringFields) {
      fields.push({ name: fieldName, size: String(currentData[fieldName] || '').length, type: 'string' });
    }
    fields.push({ name: 'lowLevelAccess', value: !!currentData.lowLevelAccess, type: 'boolean' });
    fields.push({ name: 'hideIcon', value: !!currentData.hideIcon, type: 'boolean' });
  }

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
    for (const fieldName of risupStringFields) {
      fields.push({ name: fieldName, size: String(currentData[fieldName] || '').length, type: 'string' });
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
    for (const fieldName of risupNumberFields) {
      fields.push({ name: fieldName, value: currentData[fieldName] ?? 0, type: 'number' });
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
    for (const fieldName of risupBoolFields) {
      fields.push({ name: fieldName, value: !!currentData[fieldName], type: 'boolean' });
    }
  }

  return { fileType, fields };
}

function sameDocumentPath(a: string, b: string): boolean {
  const normalizedA = path.normalize(a);
  const normalizedB = path.normalize(b);
  if (process.platform === 'win32') {
    return normalizedA.toLowerCase() === normalizedB.toLowerCase();
  }
  return normalizedA === normalizedB;
}

async function getCurrentSessionFilePath(
  deps: Pick<McpApiDeps, 'getCurrentFilePath' | 'getSessionStatus'>,
): Promise<string | null> {
  if (typeof deps.getCurrentFilePath === 'function') {
    return deps.getCurrentFilePath();
  }
  if (typeof deps.getSessionStatus === 'function') {
    const status = await deps.getSessionStatus();
    return status?.currentFilePath ?? null;
  }
  return null;
}

type ExternalFieldKind = 'string' | 'boolean' | 'number' | 'string-array' | 'triggerScripts' | 'lorebook' | 'regex';

interface ExternalFieldAccess {
  allowed: boolean;
  kind?: ExternalFieldKind;
  readOnly?: boolean;
  message?: string;
  suggestion?: string;
}

function getExternalFieldAccess(currentData: Record<string, unknown>, fieldName: string): ExternalFieldAccess {
  const rules = getFieldAccessRules(currentData);
  const fileType: SupportedFileType =
    currentData._fileType === 'risum' || currentData._fileType === 'risup' ? currentData._fileType : 'charx';

  if (fieldName === 'groupOnlyGreetings') {
    if (fileType !== 'charx') {
      return {
        allowed: false,
        message: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}`,
        suggestion: 'inspect_external_file 또는 probe_greetings로 사용 가능한 표면을 다시 확인하세요.',
      };
    }
    return { allowed: true, kind: 'string-array' };
  }

  if (fieldName === 'lorebook') {
    if (fileType === 'risup') {
      return {
        allowed: false,
        message: '"lorebook" 표면은 risup 프리셋에서 지원되지 않습니다.',
        suggestion: 'inspect_external_file 또는 probe_risup_prompt_items로 사용 가능한 risup 표면을 확인하세요.',
      };
    }
    return { allowed: true, kind: 'lorebook' };
  }

  if (fieldName === 'regex') {
    return { allowed: true, kind: 'regex' };
  }

  if (rules.readOnlyFields.includes(fieldName) || rules.deprecatedFields.includes(fieldName)) {
    return {
      allowed: false,
      readOnly: true,
      message: `"${fieldName}" 필드는 읽기 전용입니다.`,
      suggestion: '이 필드는 수정할 수 없습니다.',
    };
  }

  if (!rules.allowedFields.includes(fieldName)) {
    return {
      allowed: false,
      message: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}`,
      suggestion: 'probe_field_batch 또는 inspect_external_file로 허용된 필드를 다시 확인하세요.',
    };
  }

  if (fieldName === 'triggerScripts') return { allowed: true, kind: 'triggerScripts' };
  if (fieldName === 'alternateGreetings') return { allowed: true, kind: 'string-array' };
  if (BOOLEAN_FIELD_NAMES.includes(fieldName)) return { allowed: true, kind: 'boolean' };
  if (NUMBER_FIELD_NAMES.includes(fieldName)) return { allowed: true, kind: 'number' };
  return { allowed: true, kind: 'string' };
}

function isExternalReadableStringField(currentData: Record<string, unknown>, fieldName: string): boolean {
  const rules = getFieldAccessRules(currentData);
  if (!rules.allowedFields.includes(fieldName)) return false;
  if (BOOLEAN_FIELD_NAMES.includes(fieldName) || NUMBER_FIELD_NAMES.includes(fieldName)) return false;
  return !['alternateGreetings', 'triggerScripts', 'lorebook', 'regex'].includes(fieldName);
}

function getExternalFieldMeasure(
  currentData: Record<string, unknown>,
  fieldName: string,
  deps: Pick<McpApiDeps, 'stringifyTriggerScripts'>,
): number {
  if (fieldName === 'triggerScripts') {
    return deps.stringifyTriggerScripts(currentData.triggerScripts).length;
  }
  const value = currentData[fieldName];
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'string') return value.length;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value).length;
  return 0;
}

function applyExternalFieldMutation(
  currentData: Record<string, unknown>,
  fieldName: string,
  content: unknown,
  deps: Pick<
    McpApiDeps,
    'normalizeTriggerScripts' | 'extractPrimaryLua' | 'mergePrimaryLua' | 'stringifyTriggerScripts'
  >,
):
  | { success: true; size: number }
  | { success: false; message: string; suggestion: string; details?: Record<string, unknown> } {
  const access = getExternalFieldAccess(currentData, fieldName);
  if (!access.allowed || !access.kind) {
    return {
      success: false,
      message: access.message || `Unsupported field: ${fieldName}`,
      suggestion: access.suggestion || 'inspect_external_file로 허용된 표면을 다시 확인하세요.',
    };
  }

  if (access.kind === 'string-array') {
    if (!Array.isArray(content)) {
      return {
        success: false,
        message: `"${fieldName}" must be an array of strings`,
        suggestion: '문자열 배열 형태로 값을 다시 보내세요.',
      };
    }
    currentData[fieldName] = content.map((item) => String(item));
    return { success: true, size: getExternalFieldMeasure(currentData, fieldName, deps) };
  }

  if (access.kind === 'lorebook') {
    if (!Array.isArray(content)) {
      return {
        success: false,
        message: '"lorebook" must be an array of lorebook entries',
        suggestion: 'lorebook 전체 배열을 JSON 배열 형태로 다시 보내세요.',
      };
    }
    const nextLorebook = canonicalizeLorebookFolderRefs(cloneJson(content as Record<string, unknown>[]));
    currentData.lorebook = nextLorebook;
    return { success: true, size: getExternalFieldMeasure(currentData, fieldName, deps) };
  }

  if (access.kind === 'regex') {
    if (!Array.isArray(content)) {
      return {
        success: false,
        message: '"regex" must be an array of regex entries',
        suggestion: 'regex 전체 배열을 JSON 배열 형태로 다시 보내세요.',
      };
    }
    const nextRegex = cloneJson(content as Record<string, unknown>[]);
    for (const entry of nextRegex) {
      if (entry && typeof entry === 'object') {
        normalizeRegexType(entry);
      }
    }
    currentData.regex = nextRegex;
    return { success: true, size: getExternalFieldMeasure(currentData, fieldName, deps) };
  }

  if (access.kind === 'boolean') {
    if (typeof content !== 'boolean') {
      return {
        success: false,
        message: `"${fieldName}"는 boolean 타입이어야 합니다.`,
        suggestion: `"${fieldName}" 값을 true 또는 false 로 전달하세요.`,
      };
    }
    currentData[fieldName] = content;
    return { success: true, size: getExternalFieldMeasure(currentData, fieldName, deps) };
  }

  if (access.kind === 'number') {
    if (typeof content !== 'number') {
      return {
        success: false,
        message: `"${fieldName}"는 number 타입이어야 합니다.`,
        suggestion: `"${fieldName}" 값을 숫자로 전달하세요.`,
      };
    }
    currentData[fieldName] = content;
    return { success: true, size: getExternalFieldMeasure(currentData, fieldName, deps) };
  }

  if (access.kind === 'triggerScripts') {
    try {
      currentData.triggerScripts = deps.normalizeTriggerScripts(content);
      currentData.lua = deps.extractPrimaryLua(currentData.triggerScripts);
      return { success: true, size: getExternalFieldMeasure(currentData, fieldName, deps) };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        suggestion: 'triggerScripts JSON 구조와 스크립트 배열 형식을 확인하세요.',
      };
    }
  }

  if (typeof content !== 'string') {
    return {
      success: false,
      message: `"${fieldName}" must be a string`,
      suggestion: '문자열 형태로 값을 다시 보내세요.',
    };
  }

  const risupStructuredFieldError = getRisupStructuredFieldError(fieldName, content);
  if (risupStructuredFieldError) {
    return {
      success: false,
      message: `Invalid ${fieldName}: ${risupStructuredFieldError}`,
      suggestion: getRisupStructuredFieldSuggestion(fieldName),
      details: { parseError: risupStructuredFieldError },
    };
  }

  let normalizedContent = content;
  if (fieldName === 'css') {
    normalizedContent = normalizedContent.replace(/^\s*<style[^>]*>\s*/i, '').replace(/\s*<\/style>\s*$/i, '');
  }
  currentData[fieldName] = normalizedContent;
  if (fieldName === 'lua') {
    currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua as string);
  }
  return { success: true, size: getExternalFieldMeasure(currentData, fieldName, deps) };
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
  ): Promise<ProbeDocumentRequest | null> {
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
      if (
        await handleProbeRoute(req, res, parts, url, {
          parseLuaSections: deps.parseLuaSections,
          parseCssSections: deps.parseCssSections,
          stringifyTriggerScripts: deps.stringifyTriggerScripts,
          readProbeDocumentRequest,
          mcpError,
          jsonResSuccess,
          buildLorebookListResponse,
          buildRegexListResponse,
          buildLuaListResponse,
          buildCssListResponse,
          buildGreetingListResponse,
          buildTriggerListResponse,
          promptItemPreview,
        })
      ) {
        return;
      }

      // ----------------------------------------------------------------
      // POST /external/inspect — inspect an unopened file without switching the UI document
      // ----------------------------------------------------------------
      if (parts[0] === 'external' && parts[1] === 'inspect' && !parts[2] && req.method === 'POST') {
        const probe = await readProbeDocumentRequest(
          req,
          res,
          'external/inspect',
          'inspect external file',
          'external:file',
        );
        if (!probe) return;
        const inventory = buildFieldInventory(probe.data, deps);
        const cssSections = buildCssListResponse(String(probe.data.css || ''), deps.parseCssSections);
        const luaSections = buildLuaListResponse(String(probe.data.lua || ''), deps.parseLuaSections);
        const stat = fileStatMetadata(probe.filePath);
        return jsonResSuccess(
          res,
          {
            file_path: probe.filePath,
            file_type: probe.fileType,
            integrity: {
              path: stat.path,
              exists: stat.exists,
              mtimeMs: stat.mtimeMs,
              size: stat.size,
              unavailableReason: stat.unavailableReason,
            },
            name: String(probe.data.name || path.basename(probe.filePath)),
            fieldCount: inventory.fields.length,
            fields: inventory.fields,
            surfaceCounts: {
              lorebook: Array.isArray(probe.data.lorebook) ? probe.data.lorebook.length : 0,
              regex: Array.isArray(probe.data.regex) ? probe.data.regex.length : 0,
              alternateGreetings: Array.isArray(probe.data.alternateGreetings)
                ? probe.data.alternateGreetings.length
                : 0,
              groupOnlyGreetings:
                probe.fileType === 'charx' && Array.isArray((probe.data as Record<string, unknown>).groupOnlyGreetings)
                  ? ((probe.data as Record<string, unknown>).groupOnlyGreetings as unknown[]).length
                  : 0,
              triggerScripts: Array.isArray(probe.data.triggerScripts) ? probe.data.triggerScripts.length : 0,
              cssSections: (cssSections as { count?: number }).count ?? 0,
              luaSections: (luaSections as { count?: number }).count ?? 0,
              risupPromptItems:
                probe.fileType === 'risup'
                  ? (() => {
                      const model = parsePromptTemplate(
                        typeof probe.data.promptTemplate === 'string' ? probe.data.promptTemplate : '',
                      );
                      return model.state === 'invalid' ? null : model.items.length;
                    })()
                  : null,
            },
          },
          {
            toolName: 'inspect_external_file',
            summary: `Inspected ${path.basename(probe.filePath)} (${inventory.fileType})`,
            artifacts: { fileType: inventory.fileType, fieldCount: inventory.fields.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /external/field/batch-write — write multiple fields in an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] === 'batch-write' &&
        !parts[3] &&
        req.method === 'POST'
      ) {
        const probe = await readProbeDocumentRequest(
          req,
          res,
          'external/field/batch-write',
          'external batch write field',
          'external:field:batch-write',
        );
        if (!probe) return;

        const currentFilePath = await getCurrentSessionFilePath(deps);
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external batch write field',
            message: 'The requested file is already open in the UI session.',
            suggestion:
              '현재 열린 문서는 external_* 대신 기존 write_field_batch 같은 active-document 도구를 사용하세요.',
            target: 'external:field:batch-write',
          });
        }

        const parsed = parseBody(res, probe.body as Record<string, unknown>, fieldBatchWriteSchema, {
          action: 'external batch write field',
          target: 'external:field:batch-write',
          suggestion:
            'entries 를 { field, content } 객체 배열로 전달하세요. 예: { "file_path": "...", "entries": [{ "field": "name", "content": "새 이름" }] }',
        });
        if (!parsed) return;
        const entries = parsed.entries;
        if (entries.length === 0) {
          return mcpError(res, 400, {
            action: 'external batch write field',
            message: 'entries must be a non-empty array of {field, content}',
            suggestion:
              'entries 를 { field, content } 객체 배열로 전달하세요. 예: { "file_path": "...", "entries": [{ "field": "name", "content": "새 이름" }] }',
            target: 'external:field:batch-write',
          });
        }
        if (entries.length > MAX_FIELD_BATCH) {
          return mcpError(res, 400, {
            action: 'external batch write field',
            message: `Maximum ${MAX_FIELD_BATCH} entries per batch`,
            suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 항목으로 나누어 여러 번 호출하세요.`,
            target: 'external:field:batch-write',
          });
        }

        const draftData = deps.openExternalDocument(probe.filePath) as Record<string, unknown>;
        const validatedEntries: Array<{ field: string; oldSize: number; newSize: number }> = [];
        for (const entry of entries) {
          const field = entry.field;
          if (!field || entry.content === undefined) {
            return mcpError(res, 400, {
              action: 'external batch write field',
              message: '각 항목에 "field"와 "content"가 필요합니다.',
              suggestion: '각 항목을 { "field": "<필드명>", "content": <값> } 형태로 전달하세요.',
              target: 'external:field:batch-write',
            });
          }
          const oldSize = getExternalFieldMeasure(draftData, field, deps);
          const applied = applyExternalFieldMutation(draftData, field, entry.content, deps);
          if (!applied.success) {
            return mcpError(res, 400, {
              action: 'external batch write field',
              message: applied.message,
              suggestion: applied.suggestion,
              target: `external:field:${field}`,
              details: applied.details,
            });
          }
          validatedEntries.push({ field, oldSize, newSize: applied.size });
        }

        const summary = validatedEntries
          .map((entry) => `${entry.field}: ${entry.oldSize} -> ${entry.newSize}`)
          .join('\n');
        const allowed = await deps.askRendererConfirm(
          'MCP 외부 파일 배치 수정 요청',
          `AI 어시스턴트가 UI에 열리지 않은 파일을 수정하려 합니다.\n파일: ${probe.filePath}\n항목 수: ${validatedEntries.length}\n${summary}`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'external batch write field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
            target: 'external:field:batch-write',
          });
        }

        const release = await acquireFieldMutex(`external:${probe.filePath}`);
        try {
          for (const entry of entries) {
            const applied = applyExternalFieldMutation(probe.data, entry.field, entry.content, deps);
            if (!applied.success) {
              return mcpError(res, 400, {
                action: 'external batch write field',
                message: applied.message,
                suggestion: applied.suggestion,
                target: `external:field:${entry.field}`,
                details: applied.details,
              });
            }
          }
          deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data);
          logMcpMutation('external batch write field', 'external:field:batch-write', {
            filePath: probe.filePath,
            count: validatedEntries.length,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              file_path: probe.filePath,
              file_type: probe.fileType,
              updated: validatedEntries,
            },
            {
              toolName: 'external_write_field_batch',
              summary: `Updated ${validatedEntries.length} field(s) in ${path.basename(probe.filePath)}`,
              artifacts: { count: validatedEntries.length, fileType: probe.fileType },
            },
          );
        } catch (error) {
          return mcpError(
            res,
            500,
            {
              action: 'external batch write field',
              message: error instanceof Error ? error.message : String(error),
              suggestion: '대상 파일이 저장 가능한 상태인지 확인한 뒤 다시 시도하세요.',
              target: 'external:field:batch-write',
            },
            error,
          );
        } finally {
          release();
        }
      }

      // ----------------------------------------------------------------
      // POST /external/field/:name — write a field in an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] &&
        !parts[3] &&
        parts[2] !== 'batch-write' &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `external/field/${fieldName}`,
          'external write field',
          `external:field:${fieldName}`,
        );
        if (!probe) return;

        const currentFilePath = await getCurrentSessionFilePath(deps);
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external write field',
            message: 'The requested file is already open in the UI session.',
            suggestion: '현재 열린 문서는 external_* 대신 기존 write_field 도구를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }

        if (!Object.prototype.hasOwnProperty.call(probe.body, 'content')) {
          return mcpError(res, 400, {
            action: 'external write field',
            message: 'content is required',
            suggestion: '{ "file_path": "...", "content": ... } 형식으로 값을 전달하세요.',
            target: `external:field:${fieldName}`,
          });
        }

        const oldSize = getExternalFieldMeasure(probe.data, fieldName, deps);
        const applied = applyExternalFieldMutation(
          probe.data,
          fieldName,
          (probe.body as Record<string, unknown>).content,
          deps,
        );
        if (!applied.success) {
          return mcpError(res, 400, {
            action: 'external write field',
            message: applied.message,
            suggestion: applied.suggestion,
            target: `external:field:${fieldName}`,
            details: applied.details,
          });
        }

        const allowed = await deps.askRendererConfirm(
          'MCP 외부 파일 수정 요청',
          `AI 어시스턴트가 UI에 열리지 않은 파일을 수정하려 합니다.\n파일: ${probe.filePath}\n필드: ${fieldName}\n크기: ${oldSize} -> ${applied.size}`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'external write field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
            target: `external:field:${fieldName}`,
          });
        }

        const release = await acquireFieldMutex(`external:${probe.filePath}:${fieldName}`);
        try {
          deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data);
          logMcpMutation('external write field', `external:field:${fieldName}`, {
            filePath: probe.filePath,
            oldSize,
            newSize: applied.size,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              file_path: probe.filePath,
              file_type: probe.fileType,
              field: fieldName,
              oldSize,
              newSize: applied.size,
            },
            {
              toolName: 'external_write_field',
              summary: `Updated "${fieldName}" in ${path.basename(probe.filePath)} (${oldSize}->${applied.size})`,
              artifacts: { fieldName, oldSize, newSize: applied.size, fileType: probe.fileType },
            },
          );
        } catch (error) {
          return mcpError(
            res,
            500,
            {
              action: 'external write field',
              message: error instanceof Error ? error.message : String(error),
              suggestion: '대상 파일이 저장 가능한 상태인지 확인한 뒤 다시 시도하세요.',
              target: `external:field:${fieldName}`,
            },
            error,
          );
        } finally {
          release();
        }
      }

      // ----------------------------------------------------------------
      // POST /external/field/:name/search — search a text field in an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] &&
        parts[3] === 'search' &&
        !parts[4] &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `external/field/${fieldName}/search`,
          'external search in field',
          `external:field:${fieldName}`,
        );
        if (!probe) return;
        if (!isExternalReadableStringField(probe.data, fieldName)) {
          return mcpError(res, 400, {
            action: 'external search in field',
            message: `"${fieldName}" 필드는 외부 문자열 검색을 지원하지 않습니다.`,
            suggestion:
              '문자열 타입 필드에만 사용 가능합니다. 구조화된 표면은 probe_* 또는 external_write_field를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        const parsed = parseBody(res, probe.body as Record<string, unknown>, searchBodySchema, {
          action: 'external search in field',
          target: `external:field:${fieldName}`,
          suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;

        const content = normalizeLF(
          typeof probe.data[fieldName] === 'string'
            ? (probe.data[fieldName] as string)
            : String(probe.data[fieldName] ?? ''),
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
              file_path: probe.filePath,
              field: fieldName,
              query: result.query,
              totalMatches: result.totalMatches,
              returnedMatches: result.returnedMatches,
              fieldLength: result.contentLength,
              matches: result.matches,
            },
            {
              toolName: 'external_search_in_field',
              summary: `Found ${result.totalMatches} match(es) in "${fieldName}" from ${path.basename(probe.filePath)}`,
              artifacts: { fieldName, totalMatches: result.totalMatches },
            },
          );
        } catch (error) {
          return mcpError(res, 400, {
            action: 'external search in field',
            message: `Invalid regex: ${error instanceof Error ? error.message : String(error)}`,
            target: `external:field:${fieldName}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /external/field/:name/range — read part of a text field in an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] &&
        parts[3] === 'range' &&
        !parts[4] &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `external/field/${fieldName}/range`,
          'external read field range',
          `external:field:${fieldName}`,
        );
        if (!probe) return;
        if (!isExternalReadableStringField(probe.data, fieldName)) {
          return mcpError(res, 400, {
            action: 'external read field range',
            message: `"${fieldName}" 필드는 외부 범위 읽기를 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `external:field:${fieldName}`,
          });
        }
        const content =
          typeof probe.data[fieldName] === 'string'
            ? (probe.data[fieldName] as string)
            : String(probe.data[fieldName] ?? '');
        const MAX_RANGE_LENGTH = 10000;
        const offset = Math.max(0, Number((probe.body as Record<string, unknown>).offset) || 0);
        const length = Math.max(
          1,
          Math.min(Number((probe.body as Record<string, unknown>).length) || 2000, MAX_RANGE_LENGTH),
        );
        const slice = content.slice(offset, offset + length);
        return jsonResSuccess(
          res,
          {
            file_path: probe.filePath,
            field: fieldName,
            offset,
            length: slice.length,
            requestedLength: length,
            totalLength: content.length,
            content: slice,
          },
          {
            toolName: 'external_read_field_range',
            summary: `Read ${slice.length} chars from "${fieldName}" in ${path.basename(probe.filePath)}`,
            artifacts: { fieldName, offset, length: slice.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /external/field/:name/replace — replace text in an unopened file field
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] &&
        parts[3] === 'replace' &&
        !parts[4] &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `external/field/${fieldName}/replace`,
          'external replace in field',
          `external:field:${fieldName}`,
        );
        if (!probe) return;

        const currentFilePath = await getCurrentSessionFilePath(deps);
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external replace in field',
            message: 'The requested file is already open in the UI session.',
            suggestion: '현재 열린 문서는 external_* 대신 기존 replace_in_field 도구를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        if (!isExternalReadableStringField(probe.data, fieldName)) {
          return mcpError(res, 400, {
            action: 'external replace in field',
            message: `"${fieldName}" 필드는 외부 문자열 치환을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다. 구조화된 표면은 external_write_field를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        const parsed = parseBody(res, probe.body as Record<string, unknown>, replaceBodySchema, {
          action: 'external replace in field',
          target: `external:field:${fieldName}`,
          suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;

        const release = await acquireFieldMutex(`external:${probe.filePath}:${fieldName}`);
        try {
          const content = normalizeLF(String(probe.data[fieldName] ?? ''));
          const findStr = normalizeLF(parsed.find);
          const replaceStr = parsed.replace !== undefined ? normalizeLF(parsed.replace) : '';
          const useRegex = !!parsed.regex;
          const flags = parsed.flags || 'g';
          const dryRun = !!(parsed.dry_run ?? parsed.dryRun);
          let newContent: string;
          let matchCount: number;
          const matchPositions: Array<{ position: number; match: string }> = [];

          if (useRegex) {
            const re = new RegExp(findStr, flags);
            if (dryRun) {
              let match: RegExpExecArray | null;
              const reExec = new RegExp(findStr, flags.includes('g') ? flags : flags + 'g');
              while ((match = reExec.exec(content)) !== null) {
                matchPositions.push({ position: match.index, match: match[0] });
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
                action: 'external replace in field',
                message: '일치하는 항목 없음',
                suggestion: 'external_search_in_field로 현재 내용을 다시 확인하고 find/regex/flags를 조정하세요.',
                target: `external:field:${fieldName}`,
              },
              {
                matchCount: 0,
                ...(dryRun ? { dryRun: true } : {}),
              },
            );
          }

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
                file_path: probe.filePath,
                field: fieldName,
                matchCount,
                fieldLength: content.length,
                previews,
                newSize: newContent.length,
              },
              {
                toolName: 'external_replace_in_field',
                summary: `Dry-run: ${matchCount} match(es) in "${fieldName}" from ${path.basename(probe.filePath)}`,
                artifacts: { matchCount, fieldLength: content.length },
              },
            );
          }

          const allowed = await deps.askRendererConfirm(
            'MCP 외부 파일 치환 요청',
            `AI 어시스턴트가 UI에 열리지 않은 파일의 "${fieldName}" 필드에서 ${matchCount}건 치환하려 합니다.\n파일: ${probe.filePath}\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
          );
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'external replace in field',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
              target: `external:field:${fieldName}`,
            });
          }

          probe.data[fieldName] = newContent;
          if (fieldName === 'lua') {
            probe.data.triggerScripts = deps.mergePrimaryLua(probe.data.triggerScripts, String(probe.data.lua || ''));
          }
          deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data);
          logMcpMutation('external replace in field', `external:field:${fieldName}`, {
            filePath: probe.filePath,
            matchCount,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              file_path: probe.filePath,
              field: fieldName,
              matchCount,
              oldSize: content.length,
              newSize: newContent.length,
            },
            {
              toolName: 'external_replace_in_field',
              summary: `Replaced ${matchCount} match(es) in "${fieldName}" from ${path.basename(probe.filePath)}`,
              artifacts: { fieldName, matchCount, oldSize: content.length, newSize: newContent.length },
            },
          );
        } catch (error) {
          return mcpError(
            res,
            500,
            {
              action: 'external replace in field',
              message: error instanceof Error ? error.message : String(error),
              suggestion: '대상 파일이 저장 가능한 상태인지 확인한 뒤 다시 시도하세요.',
              target: `external:field:${fieldName}`,
            },
            error,
          );
        } finally {
          release();
        }
      }

      // ----------------------------------------------------------------
      // POST /external/field/:name/insert — insert text into an unopened file field
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] &&
        parts[3] === 'insert' &&
        !parts[4] &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `external/field/${fieldName}/insert`,
          'external insert in field',
          `external:field:${fieldName}`,
        );
        if (!probe) return;

        const currentFilePath = await getCurrentSessionFilePath(deps);
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external insert in field',
            message: 'The requested file is already open in the UI session.',
            suggestion: '현재 열린 문서는 external_* 대신 기존 insert_in_field 도구를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        if (!isExternalReadableStringField(probe.data, fieldName)) {
          return mcpError(res, 400, {
            action: 'external insert in field',
            message: `"${fieldName}" 필드는 외부 텍스트 삽입을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다. 구조화된 표면은 external_write_field를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        const parsed = parseBody(res, probe.body as Record<string, unknown>, insertBodySchema, {
          action: 'external insert in field',
          target: `external:field:${fieldName}`,
          suggestion: '삽입할 content를 요청 본문에 포함하세요.',
        });
        if (!parsed) return;

        const release = await acquireFieldMutex(`external:${probe.filePath}:${fieldName}`);
        try {
          const oldContent = normalizeLF(String(probe.data[fieldName] ?? ''));
          const position = parsed.position || 'end';
          const insertContent = normalizeLF(parsed.content);
          let newContent: string;

          if (position === 'end') {
            newContent = oldContent + '\n' + insertContent;
          } else if (position === 'start') {
            newContent = insertContent + '\n' + oldContent;
          } else if ((position === 'after' || position === 'before') && parsed.anchor) {
            const anchorPos = oldContent.indexOf(normalizeLF(parsed.anchor));
            if (anchorPos === -1) {
              return mcpNoOp(res, {
                action: 'external insert in field',
                message: `앵커 문자열을 찾을 수 없음: ${parsed.anchor.substring(0, 80)}`,
                suggestion:
                  'external_read_field_range 또는 external_search_in_field로 현재 내용을 확인한 뒤 anchor를 다시 지정하세요.',
                target: `external:field:${fieldName}`,
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
              action: 'external insert in field',
              message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
              suggestion: '{ "position": "after", "anchor": "기준 텍스트" } 형식으로 anchor를 전달하세요.',
              target: `external:field:${fieldName}`,
            });
          }

          const preview = parsed.content.substring(0, 100) + (parsed.content.length > 100 ? '...' : '');
          const allowed = await deps.askRendererConfirm(
            'MCP 외부 파일 삽입 요청',
            `AI 어시스턴트가 UI에 열리지 않은 파일의 "${fieldName}" 필드에 내용을 삽입하려 합니다.\n파일: ${probe.filePath}\n위치: ${position}${parsed.anchor ? ' "' + parsed.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
          );
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'external insert in field',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
              target: `external:field:${fieldName}`,
            });
          }

          probe.data[fieldName] = newContent;
          if (fieldName === 'lua') {
            probe.data.triggerScripts = deps.mergePrimaryLua(probe.data.triggerScripts, String(probe.data.lua || ''));
          }
          deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data);
          logMcpMutation('external insert in field', `external:field:${fieldName}`, {
            filePath: probe.filePath,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              file_path: probe.filePath,
              field: fieldName,
              position,
              oldSize: oldContent.length,
              newSize: newContent.length,
            },
            {
              toolName: 'external_insert_in_field',
              summary: `Inserted into "${fieldName}" in ${path.basename(probe.filePath)} (${oldContent.length}->${newContent.length})`,
              artifacts: { oldSize: oldContent.length, newSize: newContent.length, position },
            },
          );
        } catch (error) {
          return mcpError(
            res,
            500,
            {
              action: 'external insert in field',
              message: error instanceof Error ? error.message : String(error),
              suggestion: '대상 파일이 저장 가능한 상태인지 확인한 뒤 다시 시도하세요.',
              target: `external:field:${fieldName}`,
            },
            error,
          );
        } finally {
          release();
        }
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

      // ----------------------------------------------------------------
      // POST /external/surface/read — JSON Pointer read from an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'surface' &&
        parts[2] === 'read' &&
        !parts[3] &&
        req.method === 'POST'
      ) {
        const probe = await readProbeDocumentRequest(
          req,
          res,
          'external/surface/read',
          'external read surface',
          'external:surface:read',
        );
        if (!probe) return;
        const currentFilePath = deps.getCurrentFilePath ? deps.getCurrentFilePath() : null;
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external read surface',
            message: 'The requested file is already open in the UI session.',
            suggestion: '현재 열린 문서는 read_surface를 사용하세요.',
            target: 'external:surface:read',
          });
        }
        const pointer = typeof probe.body.path === 'string' ? probe.body.path : '';
        try {
          const value = getPointerValue(probe.data, pointer);
          return jsonResSuccess(
            res,
            {
              file_path: probe.filePath,
              file_type: probe.fileType,
              path: pointer || '/',
              value,
              hash: hashSurface(value),
              ...measureSurface(value),
            },
            {
              toolName: 'external_read_surface',
              summary: `Read surface ${pointer || '/'} from ${path.basename(probe.filePath)}`,
            },
          );
        } catch (error) {
          return mcpError(res, 400, {
            action: 'external read surface',
            message: error instanceof Error ? error.message : String(error),
            suggestion: 'list_surfaces 또는 inspect_external_file로 대상 path를 확인하세요.',
            target: `external:surface:${pointer || '/'}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /external/surface/patch — JSON Patch an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'surface' &&
        parts[2] === 'patch' &&
        !parts[3] &&
        req.method === 'POST'
      ) {
        const probe = await readProbeDocumentRequest(
          req,
          res,
          'external/surface/patch',
          'external patch surface',
          'external:surface:patch',
        );
        if (!probe) return;
        const currentFilePath = deps.getCurrentFilePath ? deps.getCurrentFilePath() : null;
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external patch surface',
            message: 'The requested file is already open in the UI session.',
            suggestion: '현재 열린 문서는 patch_surface를 사용하세요.',
            target: 'external:surface:patch',
          });
        }
        const operations = Array.isArray(probe.body.operations) ? probe.body.operations : null;
        if (!operations || operations.length === 0) {
          return mcpError(res, 400, {
            action: 'external patch surface',
            message: 'operations must be a non-empty JSON Patch array',
            suggestion:
              '{ "file_path": "...", "operations": [{ "op": "replace", "path": "/name", "value": "..." }] } 형태로 전달하세요.',
            target: 'external:surface:patch',
          });
        }
        const expectedHash = typeof probe.body.expected_hash === 'string' ? probe.body.expected_hash : undefined;
        const beforeHash = hashSurface(probe.data);
        if (expectedHash && expectedHash !== beforeHash) {
          return mcpError(res, 409, {
            action: 'external patch surface',
            message: 'Stale external document hash',
            suggestion: 'external_read_surface로 최신 hash를 확인한 뒤 다시 시도하세요.',
            target: 'external:surface:patch',
            details: { expected_hash: expectedHash, actual_hash: beforeHash },
          });
        }
        const draft = cloneJson(probe.data) as Record<string, unknown>;
        try {
          const result = applySurfacePatch(draft, operations);
          const afterHash = hashSurface(draft);
          if (probe.body.dry_run === true) {
            return jsonResSuccess(
              res,
              {
                dry_run: true,
                file_path: probe.filePath,
                changed: result.changed,
                touched: result.touchedTopLevel,
                before_hash: beforeHash,
                after_hash: afterHash,
              },
              {
                toolName: 'external_patch_surface',
                summary: `Dry-run: patch ${result.changed} operation(s) in ${path.basename(probe.filePath)}`,
              },
            );
          }
          const allowed = await deps.askRendererConfirm(
            'MCP 외부 surface 수정 요청',
            `AI 어시스턴트가 UI에 열리지 않은 파일의 surface를 수정하려 합니다.\n파일: ${probe.filePath}\n작업 수: ${result.changed}\n대상: ${result.touchedTopLevel.join(', ') || '/'}`,
          );
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'external patch surface',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
              target: 'external:surface:patch',
            });
          }
          deps.saveExternalDocument(probe.filePath, probe.fileType, draft);
          logMcpMutation('external patch surface', 'external:surface:patch', {
            filePath: probe.filePath,
            changed: result.changed,
            touched: result.touchedTopLevel,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              file_path: probe.filePath,
              file_type: probe.fileType,
              changed: result.changed,
              touched: result.touchedTopLevel,
              before_hash: beforeHash,
              after_hash: afterHash,
            },
            {
              toolName: 'external_patch_surface',
              summary: `Patched ${result.changed} operation(s) in ${path.basename(probe.filePath)}`,
              artifacts: { count: result.changed, fileType: probe.fileType },
            },
          );
        } catch (error) {
          return mcpError(res, 400, {
            action: 'external patch surface',
            message: error instanceof Error ? error.message : String(error),
            suggestion: 'JSON Pointer path와 patch operation을 확인하세요.',
            target: 'external:surface:patch',
          });
        }
      }

      const isSessionStatusRoute = parts[0] === 'session' && parts[1] === 'status' && !parts[2] && req.method === 'GET';
      const isReferenceRoute = parts[0] === 'references' || parts[0] === 'reference';
      const isRisupPromptSnippetRoute = parts[0] === 'risup' && parts[1] === 'prompt-snippets';
      const currentData = deps.getCurrentData();
      if (!currentData && !isSessionStatusRoute && !isReferenceRoute && !isRisupPromptSnippetRoute) {
        return mcpError(res, 400, {
          action: 'require current document',
          target: 'document:current',
          message: 'No file open',
          suggestion:
            'open_file를 사용하거나 에디터에서 파일을 먼저 연 뒤 다시 시도하세요. 참고 자료가 로드되어 있다면 list_references는 파일 없이도 사용 가능합니다.',
        });
      }

      // ----------------------------------------------------------------
      // GET /surfaces — list current document editable JSON surfaces
      // ----------------------------------------------------------------
      if (req.method === 'GET' && parts[0] === 'surfaces' && !parts[1]) {
        const status = deps.getSessionStatus ? await deps.getSessionStatus() : null;
        const fileType = inferDocumentFileType(currentData, status?.currentFileType);
        const surfaces = buildSurfaceList(currentData, fileType);
        return jsonResSuccess(
          res,
          { fileType, count: surfaces.length, document_hash: hashSurface(currentData), surfaces },
          {
            toolName: 'list_surfaces',
            summary: `Listed ${surfaces.length} editable surface(s) (${fileType})`,
            artifacts: { count: surfaces.length, fileType },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /surface/read — JSON Pointer read from current document
      // ----------------------------------------------------------------
      if (parts[0] === 'surface' && parts[1] === 'read' && !parts[2] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'surface/read', broadcastStatus);
        if (!body) return;
        const pointer = typeof body.path === 'string' ? body.path : '';
        try {
          const value = getPointerValue(currentData, pointer);
          return jsonResSuccess(
            res,
            { path: pointer || '/', value, hash: hashSurface(value), ...measureSurface(value) },
            {
              toolName: 'read_surface',
              summary: `Read surface ${pointer || '/'}`,
            },
          );
        } catch (error) {
          return mcpError(res, 400, {
            action: 'read surface',
            message: error instanceof Error ? error.message : String(error),
            suggestion: 'list_surfaces로 대상 path를 확인하세요.',
            target: `surface:${pointer || '/'}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /surface/patch — JSON Patch current document
      // ----------------------------------------------------------------
      if (parts[0] === 'surface' && parts[1] === 'patch' && !parts[2] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'surface/patch', broadcastStatus);
        if (!body) return;
        const operations = Array.isArray(body.operations) ? body.operations : null;
        if (!operations || operations.length === 0) {
          return mcpError(res, 400, {
            action: 'patch surface',
            message: 'operations must be a non-empty JSON Patch array',
            suggestion: '{ "operations": [{ "op": "replace", "path": "/name", "value": "..." }] } 형태로 전달하세요.',
            target: 'surface:patch',
          });
        }
        const expectedHash = typeof body.expected_hash === 'string' ? body.expected_hash : undefined;
        const beforeHash = hashSurface(currentData);
        if (expectedHash && expectedHash !== beforeHash) {
          return mcpError(res, 409, {
            action: 'patch surface',
            message: 'Stale current document hash',
            suggestion: 'read_surface 또는 list_surfaces로 최신 hash를 확인한 뒤 다시 시도하세요.',
            target: 'surface:patch',
            details: { expected_hash: expectedHash, actual_hash: beforeHash },
          });
        }
        const draft = cloneJson(currentData) as Record<string, unknown>;
        try {
          const result = applySurfacePatch(draft, operations);
          const afterHash = hashSurface(draft);
          if (body.dry_run === true) {
            return jsonResSuccess(
              res,
              {
                dry_run: true,
                changed: result.changed,
                touched: result.touchedTopLevel,
                before_hash: beforeHash,
                after_hash: afterHash,
              },
              {
                toolName: 'patch_surface',
                summary: `Dry-run: patch ${result.changed} operation(s)`,
              },
            );
          }
          const allowed = await deps.askRendererConfirm(
            'MCP surface 수정 요청',
            `AI 어시스턴트가 현재 문서의 surface를 수정하려 합니다.\n작업 수: ${result.changed}\n대상: ${result.touchedTopLevel.join(', ') || '/'}`,
          );
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'patch surface',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
              target: 'surface:patch',
            });
          }
          Object.keys(currentData).forEach((key) => delete currentData[key]);
          Object.assign(currentData, draft);
          for (const field of result.touchedTopLevel) {
            deps.broadcastToAll('data-updated', field, currentData[field]);
          }
          if (result.touchedTopLevel.includes('assets') && deps.invalidateAssetsMapCache) {
            deps.invalidateAssetsMapCache();
          }
          logMcpMutation('patch surface', 'surface:patch', {
            changed: result.changed,
            touched: result.touchedTopLevel,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              changed: result.changed,
              touched: result.touchedTopLevel,
              before_hash: beforeHash,
              after_hash: afterHash,
            },
            {
              toolName: 'patch_surface',
              summary: `Patched ${result.changed} operation(s)`,
              artifacts: { count: result.changed },
            },
          );
        } catch (error) {
          return mcpError(res, 400, {
            action: 'patch surface',
            message: error instanceof Error ? error.message : String(error),
            suggestion: 'JSON Pointer path와 patch operation을 확인하세요.',
            target: 'surface:patch',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /surface/replace — replace text recursively under a JSON surface
      // ----------------------------------------------------------------
      if (parts[0] === 'surface' && parts[1] === 'replace' && !parts[2] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'surface/replace', broadcastStatus);
        if (!body) return;
        if (typeof body.path !== 'string' || typeof body.find !== 'string') {
          return mcpError(res, 400, {
            action: 'replace in surface',
            message: 'path and find must be strings',
            suggestion: '{ "path": "/regex/0", "find": "...", "replace": "..." } 형태로 전달하세요.',
            target: 'surface:replace',
          });
        }
        const replacement = typeof body.replace === 'string' ? body.replace : '';
        try {
          const beforeHash = hashSurface(currentData);
          const oldValue = getPointerValue(currentData, body.path);
          const { next, matches } = replaceStringInSurface(
            oldValue,
            body.find,
            replacement,
            body.regex === true,
            typeof body.flags === 'string' ? body.flags : undefined,
          );
          const afterHash = hashSurface(next);
          if (body.dry_run === true) {
            return jsonResSuccess(
              res,
              { dry_run: true, path: body.path, matchCount: matches, before_hash: beforeHash, value_hash: afterHash },
              {
                toolName: 'replace_in_surface',
                summary: `Dry-run: ${matches} match(es) under ${body.path}`,
                artifacts: { matchCount: matches },
              },
            );
          }
          if (matches === 0) {
            return mcpNoOp(res, {
              action: 'replace in surface',
              message: 'No matches found',
              suggestion: 'read_surface로 현재 값을 확인한 뒤 find 문자열을 다시 지정하세요.',
              target: `surface:${body.path}`,
            });
          }
          const allowed = await deps.askRendererConfirm(
            'MCP surface 치환 요청',
            `AI 어시스턴트가 현재 문서의 ${body.path} surface에서 ${matches}건 치환하려 합니다.`,
          );
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'replace in surface',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
              target: `surface:${body.path}`,
            });
          }
          setPointerValue(currentData, body.path, next, false);
          const topLevel = parseJsonPointer(body.path)[0];
          if (topLevel) deps.broadcastToAll('data-updated', topLevel, currentData[topLevel]);
          return jsonResSuccess(
            res,
            {
              success: true,
              path: body.path,
              matchCount: matches,
              before_hash: beforeHash,
              after_hash: hashSurface(currentData),
            },
            {
              toolName: 'replace_in_surface',
              summary: `Replaced ${matches} match(es) under ${body.path}`,
              artifacts: { matchCount: matches },
            },
          );
        } catch (error) {
          return mcpError(res, 400, {
            action: 'replace in surface',
            message: error instanceof Error ? error.message : String(error),
            suggestion: 'path, find, regex flags를 확인하세요.',
            target: `surface:${String(body.path || '/')}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /document/save — save current document to disk
      // ----------------------------------------------------------------
      if (parts[0] === 'document' && parts[1] === 'save' && !parts[2] && req.method === 'POST') {
        if (!deps.saveCurrentDocument) {
          return mcpError(res, 501, {
            action: 'save current document',
            message: 'Current document save is not available in this runtime.',
            suggestion: '에디터 UI의 저장 기능을 사용하거나 open_file(save_current=true)를 사용하세요.',
            target: 'document:save',
          });
        }
        const result = await deps.saveCurrentDocument();
        if (!result.success) {
          return mcpError(res, 500, {
            action: 'save current document',
            message: result.error || 'Failed to save current document',
            suggestion: '현재 파일 경로와 저장 권한을 확인하세요.',
            target: 'document:save',
          });
        }
        return jsonResSuccess(
          res,
          { success: true, path: result.path ?? null },
          {
            toolName: 'save_current_file',
            summary: `Saved current document${result.path ? ` to ${path.basename(result.path)}` : ''}`,
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /fields
      // ----------------------------------------------------------------
      if (req.method === 'GET' && parts[0] === 'fields' && !parts[1]) {
        const inventory = buildFieldInventory(currentData, deps);
        return jsonResSuccess(
          res,
          { fileType: inventory.fileType, fields: inventory.fields },
          {
            toolName: 'list_fields',
            summary: `Listed ${inventory.fields.length} fields (${inventory.fileType})`,
            artifacts: { count: inventory.fields.length, fileType: inventory.fileType },
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
      if (
        await handleSessionStatusRoute(req, res, parts, currentData as Record<string, unknown> | null, fieldSnapshots, {
          getCurrentFilePath: deps.getCurrentFilePath,
          getReferenceFiles: deps.getReferenceFiles,
          getSessionStatus: deps.getSessionStatus,
          normalizeTriggerScripts: deps.normalizeTriggerScripts,
          getCssSectionCount: (css) => cssCache.get(css).sections.length,
          getLuaSectionCount: (lua) => luaCache.get(lua).length,
          jsonResSuccess,
        })
      ) {
        return;
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
              suggestion:
                'read_lorebook 또는 list_lorebook로 현재 내용을 확인하고 find/field/regex/flags를 조정하세요.',
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
        const fieldName = getGreetingFieldName(greetingType);
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
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'regex' &&
        parts[3] === 'batch' &&
        req.method === 'POST'
      ) {
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

        const refData = (ref.data || {}) as Record<string, unknown>;
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
        const body = await readJsonBody(req, res, `asset/${idx}/delete`, broadcastStatus);
        if (!body) return;
        const assetToDelete = assets[idx];
        if (
          !ensureAssetExpectedPath(
            res,
            idx,
            assetToDelete.path,
            body.expected_path,
            'delete_asset',
            `asset:${idx}`,
            'list_assets 또는 GET /assets 로 최신 index/path를 다시 확인하세요.',
            mcpError,
          )
        ) {
          return;
        }
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
        if (
          !ensureAssetExpectedPath(
            res,
            idx,
            oldPath,
            body.expected_path,
            'rename_asset',
            `asset:${idx}`,
            'list_assets 또는 GET /assets 로 최신 index/path를 다시 확인하세요.',
            mcpError,
          )
        ) {
          return;
        }
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
              ...(body.dry_run === true || body.dryRun === true ? { dry_run: true, preview: [] } : {}),
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
        const preview = convertible.map((a) => ({
          index: assets.indexOf(a),
          path: a.path,
          size: a.data.length,
          newPath: a.path.replace(/\.[^.]+$/, '.webp'),
        }));
        if (body.dry_run === true || body.dryRun === true) {
          return jsonResSuccess(
            res,
            {
              ok: true,
              dry_run: true,
              quality,
              recompressWebp,
              stats: {
                total: assets.length,
                convertible: convertible.length,
                skipped: assets.length - convertible.length,
                originalSize: totalSize,
              },
              preview,
            },
            {
              toolName: 'compress_assets_webp',
              summary: `Dry-run: ${convertible.length} asset(s) would be considered for WebP compression`,
              artifacts: { total: assets.length, convertible: convertible.length, dry_run: true },
            },
          );
        }

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
        const body = await readJsonBody(req, res, `risum-asset/${idx}/delete`, broadcastStatus);
        if (!body) return;
        const meta = Array.isArray(modAssets[idx]) ? (modAssets[idx] as string[]) : null;
        const deleteName = meta?.[0] || `asset_${idx}`;
        const deletePath = meta?.[2] || deleteName;
        if (
          !ensureAssetExpectedPath(
            res,
            idx,
            deletePath,
            body.expected_path,
            'delete_risum_asset',
            `risum-asset:${idx}`,
            'list_risum_assets 또는 GET /risum-assets 로 최신 index/path를 다시 확인하세요.',
            mcpError,
          )
        ) {
          return;
        }
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
          openExternalDocument: deps.openExternalDocument,
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
        const deletedSummary = indices
          .map((idx) => `  [${idx}] type: ${model.items[idx]?.type ?? 'unknown'}`)
          .join('\n');
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

      // ----------------------------------------------------------------
      // GET /skills — list available skill documents
      // ----------------------------------------------------------------
      if (parts[0] === 'skills' && !parts[1] && req.method === 'GET') {
        try {
          const skillRoots = deps.getSkillRoots().map((rootPath) => ({
            absolutePath: rootPath,
            relativePath: rootPath,
            scope: 'product' as const,
          }));
          const entries = listSkillCatalogEntries(skillRoots);
          const skills: Array<{
            name: string;
            description: string;
            tags: string[];
            relatedTools: string[];
            files: string[];
          }> = [];
          for (const entry of entries) {
            const skillMdPath = path.join(entry.dirPath, 'SKILL.md');
            const raw = fs.readFileSync(skillMdPath, 'utf-8');
            const fm = parseYamlFrontmatter(raw);
            skills.push({
              name: fm.name || entry.name,
              description: fm.description || '',
              tags: fm.tags,
              relatedTools: fm.relatedTools,
              files: entry.files,
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
        const skillRoots = deps.getSkillRoots().map((rootPath) => ({
          absolutePath: rootPath,
          relativePath: rootPath,
          scope: 'product' as const,
        }));
        const filePath = resolveSkillCatalogFile(skillRoots, skillName, fileName);
        try {
          if (!filePath) {
            throw new Error('missing skill file');
          }
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
    console.error(`[main] MCP API server on 127.0.0.1:${port}`);
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
