import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export class FileConflictError extends Error {}

export function captureFileBaseline(filePath: string) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return {
      path: filePath,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      sha256: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
      capturedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Reuse the opened/saved baseline; timestamps alone cannot detect same-size edits. */
export function assertFileUnchanged(
  filePath: string,
  baseline: { path?: unknown; sha256?: unknown } | null | undefined,
): void {
  const current = captureFileBaseline(filePath);
  const normalize = (value: string) => {
    const absolute = path.resolve(value);
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  };
  if (
    !current ||
    !baseline ||
    typeof baseline.path !== 'string' ||
    normalize(baseline.path) !== normalize(filePath) ||
    current.sha256 !== baseline.sha256
  ) {
    throw new FileConflictError(
      'File changed outside RisuToki or its baseline is unavailable. Reopen it or Save As a different file.',
    );
  }
}
