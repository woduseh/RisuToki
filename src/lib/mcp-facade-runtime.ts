// eslint-disable-next-line @typescript-eslint/no-require-imports
import crypto = require('crypto');

import type {
  FacadeV1ContentSelector,
  FacadeV1EditOperation,
  FacadeV1Guard,
  FacadeV1Target,
  ManageAssetsFamily,
  ManageAssetsOperation,
  ManageFileOperation,
  ManageItemsFamily,
  ManageItemsOperation,
} from './mcp-request-schemas';

/** Sentinel key marking an API or infrastructure error resolved instead of thrown. */
export const API_ERROR_KEY = '__apiError' as const;
export const FACADE_PREVIEW_TTL_MS = 10 * 60 * 1000;

export interface ApiErrorResult {
  [API_ERROR_KEY]: true;
  status: number;
  [key: string]: unknown;
}

export interface FacadeRoute {
  tool: string;
  method: string;
  route: string;
}

export interface FacadePreviewEntry {
  token: string;
  operationDigest: string;
  target: FacadeV1Target;
  operations: FacadeV1EditOperation[];
  routes: FacadeRoute[];
  touchedTargets: string[];
  requiredGuards: FacadeV1Guard[];
  expiresAtMs: number;
}

export interface ManageItemsPreviewEntry {
  token: string;
  operationDigest: string;
  target: FacadeV1Target;
  family: ManageItemsFamily;
  operation: ManageItemsOperation;
  routes: FacadeRoute[];
  touchedTargets: string[];
  requiredGuards: FacadeV1Guard[];
  expiresAtMs: number;
}

export interface ManageAssetsPreviewEntry {
  token: string;
  operationDigest: string;
  target: FacadeV1Target;
  assetFamily: ManageAssetsFamily | undefined;
  operation: ManageAssetsOperation;
  routes: FacadeRoute[];
  touchedTargets: string[];
  requiredGuards: FacadeV1Guard[];
  expiresAtMs: number;
}

export interface ManageFilePreviewEntry {
  token: string;
  operationDigest: string;
  target: FacadeV1Target;
  operation: ManageFileOperation;
  routes: FacadeRoute[];
  touchedTargets: string[];
  requiredGuards: FacadeV1Guard[];
  expiresAtMs: number;
}

export const facadePreviewStore = new Map<string, FacadePreviewEntry>();
export const manageItemsPreviewStore = new Map<string, ManageItemsPreviewEntry>();
export const manageAssetsPreviewStore = new Map<string, ManageAssetsPreviewEntry>();
export const manageFilePreviewStore = new Map<string, ManageFilePreviewEntry>();

export function isApiError(data: unknown): data is ApiErrorResult {
  return !!data && typeof data === 'object' && (data as Record<string, unknown>)[API_ERROR_KEY] === true;
}

export function facadeApiError(
  status: number,
  error: string,
  suggestion: string,
  details?: Record<string, unknown>,
  nextActions?: string[],
): ApiErrorResult {
  return {
    [API_ERROR_KEY]: true as const,
    status,
    error,
    suggestion,
    ...(details ? { details } : {}),
    ...(nextActions ? { next_actions: nextActions } : {}),
  };
}

export function isReadOnlyFacadeFieldPayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  return record.readOnly === true || record.deprecated === true;
}

export function cleanupFacadePreviews(): void {
  const now = Date.now();
  for (const [token, entry] of facadePreviewStore.entries()) {
    if (entry.expiresAtMs <= now) facadePreviewStore.delete(token);
  }
  for (const [token, entry] of manageItemsPreviewStore.entries()) {
    if (entry.expiresAtMs <= now) manageItemsPreviewStore.delete(token);
  }
  for (const [token, entry] of manageAssetsPreviewStore.entries()) {
    if (entry.expiresAtMs <= now) manageAssetsPreviewStore.delete(token);
  }
  for (const [token, entry] of manageFilePreviewStore.entries()) {
    if (entry.expiresAtMs <= now) manageFilePreviewStore.delete(token);
  }
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function operationDigest(target: FacadeV1Target, operations: FacadeV1EditOperation[]): string {
  return crypto.createHash('sha256').update(stableJson({ target, operations })).digest('hex');
}

export function manageItemsOperationDigest(
  target: FacadeV1Target,
  family: ManageItemsFamily,
  operation: ManageItemsOperation,
): string {
  return crypto.createHash('sha256').update(stableJson({ target, family, operation })).digest('hex');
}

export function manageAssetsOperationDigest(
  target: FacadeV1Target,
  assetFamily: ManageAssetsFamily | undefined,
  operation: ManageAssetsOperation,
): string {
  return crypto.createHash('sha256').update(stableJson({ target, assetFamily, operation })).digest('hex');
}

export function manageFileOperationDigest(target: FacadeV1Target, operation: ManageFileOperation): string {
  return crypto.createHash('sha256').update(stableJson({ target, operation })).digest('hex');
}

export function makePreviewToken(): string {
  return `facade-preview-v1.${crypto.randomBytes(18).toString('base64url')}`;
}

export function sameTarget(a: FacadeV1Target, b: FacadeV1Target): boolean {
  return stableJson(a) === stableJson(b);
}

export function route(tool: string, method: string, routePath: string): FacadeRoute {
  return { tool, method, route: routePath };
}

export function selectorTarget(selector: FacadeV1ContentSelector): string {
  if (selector.family === 'lorebook') {
    if (selector.id) return `lorebook:${selector.id}${selector.field ? `:${selector.field}` : ''}`;
    if (selector.ids) return `lorebook:[${selector.ids.join(',')}]${selector.field ? `:${selector.field}` : ''}`;
    if (selector.index !== undefined) return `lorebook:${selector.index}${selector.field ? `:${selector.field}` : ''}`;
    if (selector.indices)
      return `lorebook:[${selector.indices.join(',')}]${selector.field ? `:${selector.field}` : ''}`;
    return 'lorebook';
  }
  if (selector.family === 'greeting') {
    const type = selector.greeting_type ?? 'unknown';
    if (selector.identity) return `greeting:${type}:identity`;
    if (selector.index !== undefined) return `greeting:${type}:${selector.index}`;
    if (selector.indices) return `greeting:${type}:[${selector.indices.join(',')}]`;
    return `greeting:${type}`;
  }
  if (selector.family === 'regex' || selector.family === 'risup-prompt') {
    if (selector.id) return `${selector.family}:${selector.id}`;
    if (selector.ids) return `${selector.family}:[${selector.ids.join(',')}]`;
    if (selector.identity) return `${selector.family}:identity`;
    if (selector.index !== undefined) return `${selector.family}:${selector.index}`;
    if (selector.indices) return `${selector.family}:[${selector.indices.join(',')}]`;
    return selector.family;
  }
  if (selector.family === 'surface' || selector.path) return `surface:${selector.path ?? '/'}`;
  if (selector.field) return `field:${selector.field}`;
  if (selector.family && selector.index !== undefined) return `${selector.family}:${selector.index}`;
  return selector.family ?? 'document';
}

export function selectorFamily(selector: FacadeV1ContentSelector): string {
  if (selector.family) return selector.family;
  if (selector.path) return 'surface';
  if (selector.field) return 'field';
  return 'document';
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function guardValue(guards: FacadeV1Guard[] | undefined, name: string): unknown {
  return guards?.find((guard) => guard.name === name)?.value;
}

export function stringGuardValue(guards: FacadeV1Guard[] | undefined, name: string): string | undefined {
  const value = guardValue(guards, name);
  return typeof value === 'string' ? value : undefined;
}

export function stringGuardValueAtPath(
  guards: FacadeV1Guard[] | undefined,
  name: string,
  payloadPath: string,
): string | undefined {
  const value = guards?.find((guard) => guard.name === name && guard.payloadPath === payloadPath)?.value;
  return typeof value === 'string' ? value : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function recordString(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const item = value?.[key];
  return typeof item === 'string' ? item : undefined;
}

export function recordNumber(value: Record<string, unknown> | undefined, key: string): number | undefined {
  const item = value?.[key];
  return typeof item === 'number' && Number.isInteger(item) ? item : undefined;
}

export function buildGuard(
  name: string,
  value: string,
  payloadPath: string,
  sourceOperations: string[],
  sourceResultPath: string,
): FacadeV1Guard {
  return { name, value, payloadPath, sourceOperations, sourceResultPath };
}

export function normalizeBatchEntries(
  operation: FacadeV1EditOperation,
  payloadKey: 'data' | 'content' | 'item',
): Array<Record<string, unknown>> | ApiErrorResult {
  const indices = operation.selector.indices;
  const ids = operation.selector.ids;
  const targetKeys = indices ?? ids;
  if (!targetKeys || targetKeys.length === 0) {
    return facadeApiError(
      400,
      'Batch structured edits require selector.indices or selector.ids',
      'Provide selector.indices or selector.ids and align content entries to those targets.',
      { operation },
      ['read_content', 'preview_edit'],
    );
  }

  const content = operation.content;
  const contentRecord = asRecord(content);
  const rawEntries =
    (contentRecord && Array.isArray(contentRecord.entries) && contentRecord.entries) ||
    (contentRecord && Array.isArray(contentRecord.writes) && contentRecord.writes) ||
    (Array.isArray(content) && content);

  if (!rawEntries || rawEntries.length !== targetKeys.length) {
    return facadeApiError(
      400,
      'Batch structured edit content must align with selector.indices or selector.ids',
      'Use content.entries/content.writes or a content array with the same length and order as the selector targets.',
      { selector: operation.selector },
      ['read_content', 'preview_edit'],
    );
  }

  return rawEntries.map((entry, position) => {
    const record = asRecord(entry);
    const base =
      indices !== undefined
        ? { index: record ? (recordNumber(record, 'index') ?? indices[position]) : indices[position] }
        : { item_id: record ? (recordString(record, 'item_id') ?? ids?.[position]) : ids?.[position] };
    if (!record) return { ...base, [payloadKey]: entry };
    if (
      payloadKey in record ||
      'expected_comment' in record ||
      'expected_preview' in record ||
      'expected_type' in record
    ) {
      return { ...record, ...base };
    }
    return { ...base, [payloadKey]: record };
  });
}

export function mergeGuards(
  existingGuards: FacadeV1Guard[] | undefined,
  derivedGuards: Array<FacadeV1Guard | undefined>,
): FacadeV1Guard[] {
  const merged = [...(existingGuards ?? [])];
  for (const guard of derivedGuards) {
    if (!guard) continue;
    if (!merged.some((candidate) => candidate.name === guard.name && candidate.payloadPath === guard.payloadPath)) {
      merged.push(guard);
    }
  }
  return merged;
}

export function guardConflict(
  guards: FacadeV1Guard[] | undefined,
  guardName: string,
  currentValue: string | undefined,
  target: string,
): ApiErrorResult | undefined {
  const expectedValue = stringGuardValue(guards, guardName);
  if (expectedValue === undefined || currentValue === undefined || expectedValue === currentValue) return undefined;
  return facadeApiError(
    409,
    `Stale guard mismatch for ${guardName}`,
    'Refresh the item list/read result, then run preview_edit again with the current guard value.',
    { target, guard: guardName, expected: expectedValue, actual: currentValue },
  );
}

export function lorebookReplaceField(operation: FacadeV1EditOperation): string | undefined {
  return operation.field ?? operation.selector.field;
}

export function replacementString(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function greetingPreview(content: string): string {
  return content.slice(0, 100) + (content.length > 100 ? '…' : '');
}
