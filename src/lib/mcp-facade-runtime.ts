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
