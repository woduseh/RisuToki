import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';

import type { CssCacheEntry, McpApiDeps, Section } from './mcp-api-server';
import {
  buildFolderInfoMap,
  canonicalizeLorebookFolderRefs,
  getFolderRef,
  getFolderUuid,
  normalizeFolderRef,
  resolveLorebookFolderRef,
} from './lorebook-folders';
import { SEARCHABLE_TEXT_FIELDS } from './mcp-search';
import {
  collectFormatingOrderWarnings,
  parseFormatingOrder,
  parsePromptTemplate,
  type PromptItemModel,
} from './risup-prompt-model';
import { isRisupJsonTextFieldName, validateRisupJsonTextField } from './risup-json-fields';
import { getRisupPromptSnippetLibraryPath, type RisupPromptSnippet } from './risup-prompt-snippet-store';
import { errorRecoveryMeta, normalizeMcpErrorEnvelope, type McpErrorInfo } from './mcp-response-envelope';
import { cloneJson, normalizeLF } from './shared-utils';
import { REF_ALLOWED_READ_FIELDS, getGreetingFieldName, getRefFileType } from './reference-shared';
import {
  BOOLEAN_FIELD_NAMES,
  NUMBER_FIELD_NAMES,
  SUPPORTED_EXTERNAL_FILE_TYPES,
  buildFieldReadResponsePayload,
  collectHiddenFieldWarnings,
  getFieldAccessRules,
  getHiddenFieldInfo,
  getUnknownFieldHint,
  isHiddenField,
  type SupportedFileType,
} from './mcp-field-access';

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_SURFACE_REPLACE_MATCHES = 1000;

// In-memory snapshot storage for field rollback (cleared on file reload)
export interface FieldSnapshot {
  id: string;
  field: string;
  timestamp: string;
  size: number;
  content: unknown;
}
export const fieldSnapshots = new Map<string, FieldSnapshot[]>();

export function readBody(req: http.IncomingMessage): Promise<string> {
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

export interface SkillFrontmatter {
  name: string;
  description: string;
  tags: string[];
  relatedTools: string[];
}

export function parseFrontmatterScalar(value: string): string {
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

export function parseFrontmatterString(block: string, key: string): string {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)\\s*$`, 'm'));
  return match ? parseFrontmatterScalar(match[1]) : '';
}

export function parseInlineStringArray(block: string, key: string): string[] {
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
export function parseYamlFrontmatter(raw: string): SkillFrontmatter {
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

export function jsonRes(res: http.ServerResponse, data: unknown, status?: number): void {
  res.writeHead(status || 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function logMcpMutation(action: string, target: string, details: Record<string, unknown>): void {
  console.log(`[main][mcp] ${action}:`, { target, ...details });
}

export function promptItemPreview(item: PromptItemModel): string {
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

export function collectRisupFormatingOrderWarningsForPrompt(
  currentData: Record<string, unknown>,
  promptModel: ReturnType<typeof parsePromptTemplate>,
): string[] {
  if (promptModel.state === 'invalid') return [];
  const rawOrder = typeof currentData.formatingOrder === 'string' ? currentData.formatingOrder : '';
  const orderModel = parseFormatingOrder(rawOrder);
  if (orderModel.state === 'invalid') return [];
  return collectFormatingOrderWarnings(promptModel, orderModel);
}

export function getRisupPromptSnippetLibraryFilePath(deps: McpApiDeps): string {
  return getRisupPromptSnippetLibraryPath(deps.getUserDataPath());
}

export function buildRisupPromptSnippetSummary(snippet: RisupPromptSnippet): {
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
export function validatePromptItemInput(item: unknown): { model: PromptItemModel } | { error: string } {
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

export const MAX_RISUP_PROMPT_BATCH = 50;

export function hasExplicitPromptItemId(item: unknown): boolean {
  return (
    !!item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    typeof (item as Record<string, unknown>).id === 'string' &&
    !!(item as Record<string, unknown>).id
  );
}

export function getPromptItemSearchFields(item: PromptItemModel): Array<{ field: string; value: string }> {
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

export function findPromptItemMatchedFields(item: PromptItemModel, query: string, caseSensitive: boolean): string[] {
  const needle = caseSensitive ? query : query.toLowerCase();
  return getPromptItemSearchFields(item)
    .filter(({ value }) => {
      const haystack = caseSensitive ? value : value.toLowerCase();
      return haystack.includes(needle);
    })
    .map(({ field }) => field);
}

export const REFERENCE_TEXT_FIELDS = new Set<string>([...SEARCHABLE_TEXT_FIELDS, 'promptTemplate', 'formatingOrder']);

export function isReferenceTextField(fieldName: string): boolean {
  return REFERENCE_TEXT_FIELDS.has(fieldName) || REF_ALLOWED_READ_FIELDS.includes(fieldName);
}

export function buildReferenceFieldReadPayload(
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
  if (isHiddenField(refData, fieldName)) {
    return null;
  }
  if (!rules.allowedFields.includes(fieldName)) {
    return null;
  }
  return buildFieldReadResponsePayload(refData, fieldName, deps);
}

export function referenceDataWithFileType(ref: {
  data?: unknown;
  fileName?: unknown;
  filePath?: unknown;
}): Record<string, unknown> {
  const data =
    ref.data && typeof ref.data === 'object' && !Array.isArray(ref.data) ? (ref.data as Record<string, unknown>) : {};
  if (data._fileType === 'risum' || data._fileType === 'risup') return data;
  return { ...data, _fileType: getRefFileType(ref as Parameters<typeof getRefFileType>[0]) };
}

export function getRisupStructuredFieldError(fieldName: string, content: unknown): string | null {
  if (!isRisupJsonTextFieldName(fieldName)) return null;
  return validateRisupJsonTextField(fieldName, content);
}

export function getRisupStructuredFieldSuggestion(fieldName: string): string {
  return fieldName === 'promptTemplate'
    ? 'promptTemplate은 JSON 배열 문자열이어야 합니다.'
    : fieldName === 'formatingOrder'
      ? 'formatingOrder는 문자열 토큰만 포함한 JSON 배열 문자열이어야 합니다.'
      : fieldName === 'presetBias'
        ? 'presetBias는 [string, number] 쌍만 포함한 JSON 배열 문자열이어야 합니다.'
        : fieldName === 'localStopStrings'
          ? 'localStopStrings는 문자열만 포함한 JSON 배열 문자열이어야 합니다.'
          : `${fieldName}은(는) 유효한 JSON 문자열이어야 합니다.`;
}

export type McpNoOpInfo = Omit<McpErrorInfo, 'rejected'>;

export function jsonMcpError(
  res: http.ServerResponse,
  status: number,
  info: McpErrorInfo,
  broadcastStatus: (payload: Record<string, unknown>) => void,
  error?: unknown,
): void {
  const payload = normalizeMcpErrorEnvelope({
    action: info.action,
    code: info.code,
    details: info.details,
    error: info.message,
    outcome: info.outcome,
    rejected: !!info.rejected,
    retryable: info.retryable,
    retry_mode: info.retry_mode,
    status,
    suggestion: info.suggestion,
    target: info.target,
  });
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

export function jsonMcpNoOp(res: http.ServerResponse, info: McpNoOpInfo, extra: Record<string, unknown> = {}): void {
  const recovery = errorRecoveryMeta(info.target, 200);
  jsonRes(res, {
    ...extra,
    action: info.action,
    code: recovery.code,
    details: info.details,
    error: info.message,
    message: info.message,
    next_actions: recovery.next_actions,
    outcome: recovery.outcome,
    retryable: false,
    retry_mode: recovery.retry_mode,
    status: 200,
    success: false,
    suggestion: info.suggestion,
    target: info.target,
  });
}

export async function readJsonBody(
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
export const LOREBOOK_ALLOWED_FIELDS = new Set([
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

export const REGEX_ALLOWED_FIELDS = new Set(['comment', 'type', 'find', 'replace', 'in', 'out', 'flag', 'ableFlag']);

export function pickAllowedFields(source: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (allowed.has(key)) result[key] = source[key];
  }
  return result;
}

export function stableJson(value: unknown): string {
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

export function hashSurface(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

export function measureSurface(value: unknown): { type: string; byteSize: number; count?: number; preview?: string } {
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

export function parseJsonPointer(pointer: string | undefined): string[] {
  if (!pointer || pointer === '/') return [];
  if (!pointer.startsWith('/')) throw new Error('path must be a JSON Pointer beginning with "/"');
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function assertSafePointerToken(token: string): void {
  if (token === '__proto__' || token === 'prototype' || token === 'constructor') {
    throw new Error(`Unsafe path token: ${token}`);
  }
}

export function getPointerValue(root: unknown, pointer: string | undefined): unknown {
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

export function getFieldMutationBlock(
  currentData: Record<string, unknown>,
  fieldName: string,
): { message: string; suggestion: string } | null {
  const rules = getFieldAccessRules(currentData);
  if (rules.deprecatedFields.includes(fieldName)) {
    return {
      message: `"${fieldName}" 필드는 deprecated/비권장 필드라 수정할 수 없습니다.`,
      suggestion: '최신 필드나 전용 구조화 도구를 사용하고 이 필드는 호환 읽기 용도로만 유지하세요.',
    };
  }
  if (rules.readOnlyFields.includes(fieldName)) {
    return {
      message: `"${fieldName}" 필드는 읽기 전용입니다.`,
      suggestion: '이 필드는 비권장/예약 호환 필드이거나 시스템 관리 필드라 수정할 수 없습니다.',
    };
  }
  return null;
}

export function getHiddenFieldReadBlock(
  currentData: Record<string, unknown>,
  fieldName: string,
): { message: string; suggestion: string; category: string } | null {
  const hidden = getHiddenFieldInfo(currentData, fieldName);
  if (!hidden) return null;
  return {
    category: hidden.category,
    message: `"${fieldName}" 필드는 ${hidden.reason}라 일반 조회에서 숨겨집니다.`,
    suggestion: hidden.suggestion,
  };
}

export function getSurfaceReadBlock(
  currentData: Record<string, unknown>,
  pointer: string,
): { fieldName: string; message: string; suggestion: string; category: string } | null {
  const topLevel = parseJsonPointer(pointer)[0];
  if (!topLevel) return null;
  const block = getHiddenFieldReadBlock(currentData, topLevel);
  return block ? { fieldName: topLevel, ...block } : null;
}

export function getSurfaceMutationBlock(
  currentData: Record<string, unknown>,
  pointer: string,
): { fieldName: string; message: string; suggestion: string } | null {
  const topLevel = parseJsonPointer(pointer)[0];
  if (!topLevel) {
    return {
      fieldName: '/',
      message: '문서 루트 surface는 직접 수정할 수 없습니다.',
      suggestion: '비권장/읽기 전용 필드 보호를 위해 수정 가능한 top-level path를 지정하세요.',
    };
  }
  const block = getFieldMutationBlock(currentData, topLevel);
  return block ? { fieldName: topLevel, ...block } : null;
}

export function getSurfacePatchMutationBlock(
  currentData: Record<string, unknown>,
  operations: unknown[],
): { fieldName: string; message: string; suggestion: string } | null {
  for (const rawOp of operations) {
    if (!rawOp || typeof rawOp !== 'object') continue;
    const pathValue = (rawOp as Record<string, unknown>).path;
    if (typeof pathValue !== 'string') continue;
    const block = getSurfaceMutationBlock(currentData, pathValue);
    if (block) return block;
  }
  return null;
}

export function getPointerParent(root: unknown, pointer: string): { parent: unknown; key: string } {
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

export function setPointerValue(root: unknown, pointer: string, value: unknown, allowAdd: boolean): void {
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
    if (allowAdd) parent.splice(index, 0, value);
    else parent[index] = value;
    return;
  }
  if (!parent || typeof parent !== 'object') throw new Error('Parent path is not an object or array');
  if (!allowAdd && !(key in (parent as Record<string, unknown>))) throw new Error(`Path not found: ${pointer}`);
  (parent as Record<string, unknown>)[key] = value;
}

export function validateTouchedRisupJsonFields(data: Record<string, unknown>, touchedTopLevel: string[]): void {
  if (data._fileType !== 'risup') return;
  for (const fieldName of touchedTopLevel) {
    if (!isRisupJsonTextFieldName(fieldName) || data[fieldName] === undefined) continue;
    const error = validateRisupJsonTextField(fieldName, data[fieldName]);
    if (error) throw new Error(`Invalid ${fieldName}: ${error}`);
  }
}

export function removePointerValue(root: unknown, pointer: string): unknown {
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

export function clonePatchValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  return cloneJson(value);
}

export function applySurfacePatch(
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

export function buildSurfaceList(
  data: Record<string, unknown>,
  fileType: SupportedFileType,
): Record<string, unknown>[] {
  const rules = getFieldAccessRules(data);
  const surfaceWritableFields = rules.allowedFields.filter(
    (field) =>
      !rules.readOnlyFields.includes(field) &&
      !rules.deprecatedFields.includes(field) &&
      !rules.hiddenFields.includes(field),
  );
  const names = new Set<string>([
    ...surfaceWritableFields,
    'lorebook',
    'regex',
    'alternateGreetings',
    'triggerScripts',
    'lua',
    'css',
    'assets',
    'cardAssets',
    'risumAssets',
    '_risuExt',
    '_moduleData',
  ]);
  for (const hiddenField of rules.hiddenFields) {
    names.delete(hiddenField);
  }
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

export function replaceStringInSurface(
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

export function inferDocumentFileType(
  data: Record<string, unknown>,
  fallback?: SupportedFileType | null,
): SupportedFileType {
  if (fallback === 'risum' || fallback === 'risup' || fallback === 'charx') return fallback;
  if (data._fileType === 'risum' || data._fileType === 'risup') return data._fileType;
  return 'charx';
}

export function getLorebookEntryComment(entry: Record<string, unknown> | undefined): string {
  return typeof entry?.comment === 'string' ? entry.comment : '';
}

export function getLorebookEntryLabel(entry: Record<string, unknown> | undefined, index: number): string {
  const comment = getLorebookEntryComment(entry);
  return comment || `entry_${index}`;
}

export function stableIdentityHash(prefix: string, value: unknown): string {
  return `${prefix}_${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}`;
}

export function getLorebookEntryStableId(
  entry: Record<string, unknown>,
  index: number,
  lorebook: Record<string, unknown>[],
): string {
  if (entry.mode === 'folder') {
    const folderUuid = getFolderUuid(entry);
    if (folderUuid) return `folder_${folderUuid}`;
  }
  return stableIdentityHash('lb', {
    mode: entry.mode || 'normal',
    comment: entry.comment || '',
    key: entry.key || '',
    secondkey: entry.secondkey || '',
    content: entry.content || '',
    folder: resolveLorebookFolderRef(entry.folder, lorebook) || '',
    indexHint: index,
  });
}

export function buildLorebookIdIndex(lorebook: Record<string, unknown>[]): Map<string, number[]> {
  const byId = new Map<string, number[]>();
  lorebook.forEach((entry, index) => {
    const id = getLorebookEntryStableId(entry, index, lorebook);
    byId.set(id, [...(byId.get(id) || []), index]);
  });
  return byId;
}

export function resolveUniqueLorebookId(
  res: http.ServerResponse,
  lorebook: Record<string, unknown>[],
  id: unknown,
  action: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): number | null {
  if (typeof id !== 'string' || !id) {
    onError(res, 400, {
      action,
      message: 'id must be a non-empty string',
      suggestion: 'list_lorebook에서 받은 id를 사용하거나 index 기반 도구로 fallback하세요.',
      target: 'lorebook:id',
    });
    return null;
  }
  const matches = buildLorebookIdIndex(lorebook).get(id) || [];
  if (matches.length === 0) {
    onError(res, 404, {
      action,
      message: `Lorebook id not found: ${id}`,
      suggestion: 'list_lorebook로 최신 id를 다시 확인한 뒤 재시도하세요.',
      target: `lorebook:${id}`,
    });
    return null;
  }
  if (matches.length > 1) {
    onError(res, 409, {
      action,
      message: `Lorebook id collision: ${id}`,
      suggestion: 'id 충돌이 있으므로 index + expected_comment 기반 도구를 사용하세요.',
      target: `lorebook:${id}`,
      details: { id, indices: matches },
    });
    return null;
  }
  return matches[0];
}

export function ensureExpectedStringMatch(
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

export function ensureLorebookExpectedComment(
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

export function getRegexEntryComment(entry: Record<string, unknown> | undefined): string {
  return typeof entry?.comment === 'string' ? entry.comment : '';
}

export function getRegexEntryPreview(entry: Record<string, unknown> | undefined): string {
  if (!entry) return '';
  const normalized = normalizeRegexEntryForResponse(entry);
  return getSectionPreview(`${normalized.find || ''}\n${normalized.replace || ''}`);
}

export function getRegexEntryHash(entry: Record<string, unknown> | undefined): string {
  if (!entry) return hashSurface('');
  const normalized = normalizeRegexEntryForResponse(entry);
  return hashSurface({
    comment: normalized.comment || '',
    type: normalized.type || '',
    find: normalized.find || '',
    replace: normalized.replace || '',
  });
}

export function resolveUniqueRegexIdentity(
  res: http.ServerResponse,
  regexEntries: Record<string, unknown>[],
  identity: unknown,
  action: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): number | null {
  const record = identity && typeof identity === 'object' ? (identity as Record<string, unknown>) : {};
  const comment = typeof record.comment === 'string' ? record.comment : undefined;
  const preview = typeof record.preview === 'string' ? record.preview : undefined;
  const hash = typeof record.hash === 'string' ? record.hash : undefined;
  if (!comment && !preview && !hash) {
    onError(res, 400, {
      action,
      message: 'identity requires comment, preview, or hash',
      suggestion:
        'list_regex에서 comment를 확인하고, 중복 가능성이 있으면 read_regex의 preview/hash를 함께 사용하세요.',
      target: 'regex:identity',
    });
    return null;
  }
  const matches = regexEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      if (comment !== undefined && getRegexEntryComment(entry) !== comment) return false;
      if (preview !== undefined && getRegexEntryPreview(entry) !== preview) return false;
      if (hash !== undefined && getRegexEntryHash(entry) !== hash) return false;
      return true;
    })
    .map(({ index }) => index);
  if (matches.length === 0) {
    onError(res, 404, {
      action,
      message: 'Regex identity did not match any entry',
      suggestion: 'list_regex/read_regex로 최신 identity를 다시 확인한 뒤 재시도하세요.',
      target: 'regex:identity',
    });
    return null;
  }
  if (matches.length > 1) {
    onError(res, 409, {
      action,
      message: 'Regex identity matched multiple entries',
      suggestion: 'comment가 중복됩니다. hash를 함께 제공하거나 index + expected_comment 도구를 사용하세요.',
      target: 'regex:identity',
      details: { indices: matches },
    });
    return null;
  }
  return matches[0];
}

export function ensureRegexExpectedComment(
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

export function getTriggerEntryComment(entry: Record<string, unknown> | undefined): string {
  return typeof entry?.comment === 'string' ? entry.comment : '';
}

export function ensureTriggerExpectedComment(
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

export function getGreetingPreview(content: string): string {
  return content.slice(0, 100) + (content.length > 100 ? '…' : '');
}

export function getGreetingHash(content: string): string {
  return hashSurface(normalizeLF(content));
}

export function resolveUniqueGreetingIdentity(
  res: http.ServerResponse,
  arr: string[],
  identity: unknown,
  action: string,
  target: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): number | null {
  const record = identity && typeof identity === 'object' ? (identity as Record<string, unknown>) : {};
  const preview = typeof record.preview === 'string' ? record.preview : undefined;
  const hash = typeof record.hash === 'string' ? record.hash : undefined;
  if (!preview && !hash) {
    onError(res, 400, {
      action,
      message: 'identity requires preview or hash',
      suggestion: 'list_greetings에서 preview/hash를 확인한 뒤 재시도하세요.',
      target,
    });
    return null;
  }
  const matches = arr
    .map((content, index) => ({ content, index }))
    .filter(({ content }) => {
      if (preview !== undefined && getGreetingPreview(content) !== preview) return false;
      if (hash !== undefined && getGreetingHash(content) !== hash) return false;
      return true;
    })
    .map(({ index }) => index);
  if (matches.length === 0) {
    onError(res, 404, {
      action,
      message: 'Greeting identity did not match any entry',
      suggestion: 'list_greetings로 최신 preview/hash를 다시 확인한 뒤 재시도하세요.',
      target,
    });
    return null;
  }
  if (matches.length > 1) {
    onError(res, 409, {
      action,
      message: 'Greeting identity matched multiple entries',
      suggestion: '동일 preview/hash가 여러 개입니다. index + expected_preview 도구를 사용하세요.',
      target,
      details: { indices: matches },
    });
    return null;
  }
  return matches[0];
}

export function ensureGreetingExpectedPreview(
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

export function getSectionPreview(content: string): string {
  return content.slice(0, 100) + (content.length > 100 ? '…' : '');
}

export function getSectionHash(content: string): string {
  return hashSurface(normalizeLF(content));
}

export function buildSectionReadPayload(index: number, section: Section): Record<string, unknown> {
  return {
    index,
    name: section.name,
    content: section.content,
    contentSize: section.content.length,
    preview: getSectionPreview(section.content),
    hash: getSectionHash(section.content),
  };
}

export function ensureSectionExpectedIdentity(
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

export function ensureAssetExpectedPath(
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

export function getPromptItemType(item: PromptItemModel): string {
  return item.type ?? 'unknown';
}

export function resolveUniqueRisupPromptId(
  res: http.ServerResponse,
  model: { items: PromptItemModel[] },
  id: unknown,
  action: string,
  onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
): number | null {
  if (typeof id !== 'string' || !id) {
    onError(res, 400, {
      action,
      message: 'item_id must be a non-empty string',
      suggestion: 'list_risup_prompt_items에서 받은 id를 사용하세요.',
      target: 'risup:promptTemplate',
    });
    return null;
  }
  const matches = model.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.supported && item.id === id)
    .map(({ index }) => index);
  if (matches.length === 0) {
    onError(res, 404, {
      action,
      message: `Prompt item id not found: ${id}`,
      suggestion: 'list_risup_prompt_items로 최신 id를 다시 확인한 뒤 재시도하세요.',
      target: `risup:promptTemplate:${id}`,
    });
    return null;
  }
  if (matches.length > 1) {
    onError(res, 409, {
      action,
      message: `Prompt item id collision: ${id}`,
      suggestion: 'id 충돌이 있으므로 index + expected_type/expected_preview 도구를 사용하세요.',
      target: `risup:promptTemplate:${id}`,
      details: { id, indices: matches },
    });
    return null;
  }
  return matches[0];
}

export function ensureRisupPromptExpectedIdentity(
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

export function normalizeLorebookEntryFolderIdentity(entry: Record<string, unknown>): void {
  if (entry.mode === 'folder') {
    const folderUuid = getFolderUuid(entry) || crypto.randomUUID();
    entry.key = normalizeFolderRef(folderUuid);
    entry.folder = '';
    return;
  }

  entry.folder = normalizeFolderRef(entry.folder);
}

export function normalizeLorebookEntryForResponse(
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

export function projectLorebookEntryForResponse(
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

export function buildLorebookListResponse(rawEntries: Record<string, unknown>[], url: URL): Record<string, unknown> {
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
      id: getLorebookEntryStableId(entry, index, rawEntries),
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

export function buildRegexListResponse(regexEntries: Record<string, unknown>[]): Record<string, unknown> {
  const entries = regexEntries.map((entry, index) => ({
    index,
    comment: entry.comment || '',
    type: entry.type || '',
    findSize: String(entry.find || entry.in || '').length,
    replaceSize: String(entry.replace || entry.out || '').length,
    preview: getRegexEntryPreview(entry),
    hash: getRegexEntryHash(entry),
  }));
  return { count: entries.length, entries };
}

export function normalizeRegexEntryForResponse(entry: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...entry };
  if (!normalized.find && normalized.in) normalized.find = normalized.in;
  if (!normalized.replace && normalized.out) normalized.replace = normalized.out;
  if (normalized.find === undefined) normalized.find = '';
  if (normalized.replace === undefined) normalized.replace = '';
  delete normalized.in;
  delete normalized.out;
  return normalized;
}

export function buildLuaListResponse(
  luaCode: string,
  parseLuaSections: (lua: string) => Section[],
): Record<string, unknown> {
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

export function buildCssListResponse(
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

export function buildGreetingListResponse(arr: string[], greetingType: string, url: URL): Record<string, unknown> {
  const fieldName = getGreetingFieldName(greetingType);
  let items = arr.map((content, index) => ({
    index,
    contentSize: content.length,
    preview: getGreetingPreview(content),
    hash: getGreetingHash(content),
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

export function buildTriggerListResponse(triggerScripts: unknown): Record<string, unknown> {
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

export function buildFieldInventory(
  currentData: Record<string, unknown>,
  deps: Pick<McpApiDeps, 'stringifyTriggerScripts'>,
): { fileType: SupportedFileType; fields: Record<string, unknown>[]; hiddenFieldWarnings: Record<string, unknown>[] } {
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
  fields.push({
    name: 'lorebook',
    count: Array.isArray(currentData.lorebook) ? currentData.lorebook.length : 0,
    type: 'array',
  });
  fields.push({ name: 'regex', count: Array.isArray(currentData.regex) ? currentData.regex.length : 0, type: 'array' });

  if (isCharx) {
    const charxStringFields = ['creatorcomment', 'exampleMessage', 'creator', 'characterVersion'];
    for (const fieldName of charxStringFields) {
      fields.push({ name: fieldName, size: String(currentData[fieldName] || '').length, type: 'string' });
    }
    fields.push({ name: 'creationDate', value: currentData.creationDate ?? 0, type: 'number (read-only)' });
    fields.push({ name: 'modificationDate', value: currentData.modificationDate ?? 0, type: 'number (read-only)' });
  }

  if (isRisum) {
    const risumStringFields = [
      'backgroundEmbedding',
      'moduleNamespace',
      'customModuleToggle',
      'moduleId',
      'moduleName',
      'moduleDescription',
    ];
    for (const fieldName of risumStringFields) {
      fields.push({ name: fieldName, size: String(currentData[fieldName] || '').length, type: 'string' });
    }
    fields.push({ name: 'mcpUrl', size: String(currentData.mcpUrl || '').length, type: 'string (read-only)' });
    fields.push({ name: 'lowLevelAccess', value: !!currentData.lowLevelAccess, type: 'boolean' });
    fields.push({ name: 'hideIcon', value: !!currentData.hideIcon, type: 'boolean' });
  }

  if (isRisup) {
    const risupStringFields = [
      'aiModel',
      'subModel',
      'apiType',
      'promptTemplate',
      'presetBias',
      'formatingOrder',
      'presetImage',
      'thinkingType',
      'adaptiveThinkingEffort',
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
      'promptSettings',
      'customAPIFormat',
      'openrouterProvider',
      'seperateParameters',
      'fallbackModels',
      'seperateModels',
      'modelTools',
      'customFlags',
      'dynamicOutput',
      'deepseekThinkingType',
      'deepseekReasoningEffort',
      'proxyRequestModel',
      'openrouterRequestModel',
      'customProxyRequestModel',
      'reverseProxyOobaArgs',
      'koboldURL',
      'forceReplaceUrl',
      'textgenWebUIStreamURL',
      'textgenWebUIBlockingURL',
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
      'localNetworkTimeoutSec',
    ];
    for (const fieldName of risupNumberFields) {
      fields.push({ name: fieldName, value: currentData[fieldName] ?? 0, type: 'number' });
    }
    const risupBoolFields = [
      'promptPreprocess',
      'jsonSchemaEnabled',
      'strictJsonSchema',
      'autoSuggestClean',
      'outputImageModal',
      'fallbackWhenBlankResponse',
      'seperateParametersEnabled',
      'enableCustomFlags',
      'localNetworkMode',
    ];
    for (const fieldName of risupBoolFields) {
      fields.push({ name: fieldName, value: !!currentData[fieldName], type: 'boolean' });
    }
  }

  const rules = getFieldAccessRules(currentData);
  const visibleFields = fields.filter(
    (field) => typeof field.name !== 'string' || !rules.hiddenFields.includes(field.name),
  );
  for (const field of visibleFields) {
    if (typeof field.name !== 'string') continue;
    if (rules.readOnlyFields.includes(field.name) || rules.deprecatedFields.includes(field.name)) {
      const type = typeof field.type === 'string' ? field.type : 'unknown';
      if (!type.includes('read-only')) {
        field.type = `${type} (read-only)`;
      }
    }
  }

  return {
    fileType,
    fields: visibleFields,
    hiddenFieldWarnings: collectHiddenFieldWarnings(currentData).map((warning) => ({ ...warning })),
  };
}

export function sameDocumentPath(a: string, b: string): boolean {
  const normalizedA = path.normalize(a);
  const normalizedB = path.normalize(b);
  if (process.platform === 'win32') {
    return normalizedA.toLowerCase() === normalizedB.toLowerCase();
  }
  return normalizedA === normalizedB;
}

export async function getCurrentSessionFilePath(
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

export type ExternalFieldKind =
  | 'string'
  | 'boolean'
  | 'number'
  | 'string-array'
  | 'triggerScripts'
  | 'lorebook'
  | 'regex';

export interface ExternalFieldAccess {
  allowed: boolean;
  kind?: ExternalFieldKind;
  readOnly?: boolean;
  message?: string;
  suggestion?: string;
}

export function getExternalFieldAccess(currentData: Record<string, unknown>, fieldName: string): ExternalFieldAccess {
  const rules = getFieldAccessRules(currentData);
  const fileType: SupportedFileType =
    currentData._fileType === 'risum' || currentData._fileType === 'risup' ? currentData._fileType : 'charx';

  const mutationBlock = getFieldMutationBlock(currentData, fieldName);
  if (mutationBlock) {
    return {
      allowed: false,
      readOnly: true,
      message: mutationBlock.message,
      suggestion: mutationBlock.suggestion,
    };
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

export function isExternalReadableStringField(currentData: Record<string, unknown>, fieldName: string): boolean {
  const rules = getFieldAccessRules(currentData);
  if (isHiddenField(currentData, fieldName)) return false;
  if (!rules.allowedFields.includes(fieldName)) return false;
  if (BOOLEAN_FIELD_NAMES.includes(fieldName) || NUMBER_FIELD_NAMES.includes(fieldName)) return false;
  return !['alternateGreetings', 'triggerScripts', 'lorebook', 'regex'].includes(fieldName);
}

export function getExternalFieldMeasure(
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

export function applyExternalFieldMutation(
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

export function hasTraversalSegments(rawPath: string): boolean {
  return rawPath.split(/[\\/]+/).some((segment) => segment === '..');
}

export function getExternalFileType(filePath: string): SupportedFileType | null {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
  return SUPPORTED_EXTERNAL_FILE_TYPES.has(ext as SupportedFileType) ? (ext as SupportedFileType) : null;
}

/** RisuAI expects lowercase regex types (editdisplay, editoutput, etc.) + name mapping */
export function normalizeRegexType(entry: Record<string, unknown>): void {
  if (typeof entry.type === 'string') {
    const lower = entry.type.toLowerCase();
    // Map legacy Risutoki names to RisuAI names
    const REGEX_TYPE_MAP: Record<string, string> = {
      editrequest: 'editprocess',
      edittranslation: 'edittrans',
    };
    entry.type = REGEX_TYPE_MAP[lower] || lower;
  }
  if (entry.in === undefined && entry.find !== undefined) entry.in = entry.find;
  if (entry.out === undefined && entry.replace !== undefined) entry.out = entry.replace;
  if (entry.find === undefined && entry.in !== undefined) entry.find = entry.in;
  if (entry.replace === undefined && entry.out !== undefined) entry.replace = entry.out;
}

// ---------------------------------------------------------------------------
// Section caching (mirrors the hot-path cache from main.js)
// ---------------------------------------------------------------------------

export interface SectionCacheState<T> {
  source: string | null;
  result: T | null;
}

export function createLuaCache(parse: (lua: string) => Section[]): { get(lua: string): Section[]; invalidate(): void } {
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

export function createCssCache(parse: (css: string) => CssCacheEntry): {
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
