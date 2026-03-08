import * as path from 'path';

export interface ReferenceRecord {
  fileName?: string;
  filePath?: string;
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

export function removeReferenceRecord(records: ReferenceRecord[], identifier: string | ReferenceRecord): ReferenceRecord[] {
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
      ? (value as Record<string, unknown>).paths as unknown[]
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
  const allowedExtensions = options.allowedExtensions || ['.charx', '.risum'];
  const parsedPaths = Array.isArray(value) ? value as string[] : parseReferenceManifest(value);
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
