import * as path from 'path';

export type ReferenceFileType = 'charx' | 'risum' | 'risup';
export type GreetingType = 'alternate' | 'group';
export type GreetingFieldName = 'alternateGreetings' | 'groupOnlyGreetings';

// ---------------------------------------------------------------------------
// Shared reference scalar-field definitions
// ---------------------------------------------------------------------------
// Single source of truth for which scalar fields are exposed on references.
// Used by sidebar-refs, refs-popout-data, mcp-api-server (list / read), and
// openRefTabById so they never drift out of sync.

export interface RefScalarFieldDef {
  /** Field key on the reference data object. */
  id: string;
  /** Human-readable label (Korean UI). */
  label: string;
  /** Editor language hint (used by sidebar tab). */
  lang: string;
  /** If true the value is a string-array, not a plain string. */
  isArray?: boolean;
}

/**
 * Scalar fields exposed on reference files — shared across all consumers.
 *
 * Order matters: sidebar/popout render fields in this order.
 * Complex surfaces (lua, css, lorebook, regex) are handled separately.
 */
export const REF_SCALAR_FIELDS: readonly RefScalarFieldDef[] = [
  { id: 'globalNote', label: '글로벌노트', lang: 'plaintext' },
  { id: 'firstMessage', label: '첫 메시지', lang: 'html' },
  { id: 'triggerScripts', label: '트리거 스크립트', lang: 'json' },
  { id: 'alternateGreetings', label: '추가 첫 메시지', lang: 'json', isArray: true },
  { id: 'groupOnlyGreetings', label: '그룹 전용 인사말', lang: 'json', isArray: true },
  { id: 'description', label: '설명', lang: 'plaintext' },
  { id: 'defaultVariables', label: '기본 변수', lang: 'plaintext' },
] as const;

/**
 * Scalar field IDs that are simple strings (not arrays) and can be read via
 * the generic `read_reference_field` MCP route.
 */
export const REF_ALLOWED_READ_FIELDS: readonly string[] = [
  'lua',
  'css',
  'name',
  ...REF_SCALAR_FIELDS.filter((f) => !f.isArray).map((f) => f.id),
] as const;

export function getGreetingFieldName(greetingType: string): GreetingFieldName | null {
  if (greetingType === 'alternate') return 'alternateGreetings';
  if (greetingType === 'group') return 'groupOnlyGreetings';
  return null;
}

/**
 * Derive a stable fileType string from a reference record's data or fileName.
 */
export function getRefFileType(ref: { fileName?: string; data?: Record<string, unknown> }): ReferenceFileType {
  if (ref.data && (ref.data._fileType === 'risum' || ref.data._fileType === 'risup')) return ref.data._fileType;
  const ext = path.extname(ref.fileName || '').toLowerCase();
  if (ext === '.risum') return 'risum';
  if (ext === '.risup') return 'risup';
  return 'charx';
}

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface ReferenceRecord {
  id?: string;
  fileName?: string;
  filePath?: string;
  fileType?: ReferenceFileType;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReferenceManifest {
  version: number;
  paths: string[];
}

export interface ValidationIssue {
  filePath: string;
  reason: string;
}

export interface ValidationResult {
  validPaths: string[];
  issues: ValidationIssue[];
}

interface ValidateOptions {
  existsSync?: (filePath: string) => boolean;
  allowedExtensions?: string[];
}

export function normalizeReferencePath(filePath: string | undefined | null): string {
  if (!filePath) return '';
  return path.resolve(String(filePath));
}

export function getReferenceIdentity(recordOrPath: string | ReferenceRecord): string {
  if (typeof recordOrPath === 'string') {
    return normalizeReferencePath(recordOrPath);
  }
  return normalizeReferencePath(recordOrPath?.filePath);
}

export function upsertReferenceRecord(records: ReferenceRecord[], record: ReferenceRecord): ReferenceRecord[] {
  const identity = getReferenceIdentity(record);
  if (!identity) return records.slice();

  const next = records.slice();
  const index = next.findIndex((entry) => getReferenceIdentity(entry) === identity);
  if (index >= 0) {
    next[index] = record;
  } else {
    next.push(record);
  }
  return next;
}

export function removeReferenceRecord(
  records: ReferenceRecord[],
  identifier: string | ReferenceRecord,
): ReferenceRecord[] {
  const identity = getReferenceIdentity(identifier);
  if (identity) {
    return records.filter((entry) => getReferenceIdentity(entry) !== identity);
  }

  const fileName = typeof identifier === 'string' ? identifier : identifier?.fileName;
  if (!fileName) return records.slice();
  return records.filter((entry) => entry.fileName !== fileName);
}

export function serializeReferenceManifest(records: ReferenceRecord[]): ReferenceManifest {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    const identity = getReferenceIdentity(record);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    paths.push(identity);
  }

  return { version: 1, paths };
}

export function parseReferenceManifest(value: unknown): string[] {
  const rawPaths = Array.isArray(value)
    ? value
    : Array.isArray((value as Record<string, unknown>)?.paths)
      ? ((value as Record<string, unknown>).paths as unknown[])
      : [];

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const filePath of rawPaths) {
    const identity = normalizeReferencePath(filePath as string);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    normalized.push(identity);
  }

  return normalized;
}

export function validateReferenceManifestPaths(value: unknown, options: ValidateOptions = {}): ValidationResult {
  const existsSync = options.existsSync || (() => true);
  const allowedExtensions = options.allowedExtensions || ['.charx', '.risum', '.risup'];
  const parsedPaths = Array.isArray(value) ? (value as string[]) : parseReferenceManifest(value);
  const validPaths: string[] = [];
  const issues: ValidationIssue[] = [];

  for (const filePath of parsedPaths) {
    const extension = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      issues.push({ filePath, reason: 'unsupported-extension' });
      continue;
    }
    if (!existsSync(filePath)) {
      issues.push({ filePath, reason: 'missing-file' });
      continue;
    }
    validPaths.push(filePath);
  }

  return { validPaths, issues };
}
