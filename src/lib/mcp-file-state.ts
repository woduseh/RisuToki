import * as fs from 'node:fs';
import * as path from 'node:path';
import { captureFileBaseline, FileConflictError } from './file-baseline';
import { fingerprintSurface } from './mcp-surface-fingerprint';

export interface FilePathState {
  path: string;
  exists: boolean;
  kind: 'file' | 'directory' | 'other' | 'missing';
  size: number | null;
  mtimeMs: number | null;
}

export function filePathState(filePath: string): FilePathState {
  const resolved = path.resolve(filePath);
  try {
    const stat = fs.statSync(resolved);
    return {
      path: resolved,
      exists: true,
      kind: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { path: resolved, exists: false, kind: 'missing', size: null, mtimeMs: null };
  }
}

function fileContentHash(filePath: string): string {
  const baseline = captureFileBaseline(filePath);
  if (!baseline) throw new FileConflictError(`Cannot read file baseline: ${filePath}`);
  return baseline.sha256;
}

/** The facade preview and the write owner must compare the same on-disk state. */
export function filePathStateDigest(filePath: string): string {
  const state = filePathState(filePath);
  return fingerprintSurface({
    path: state.path,
    exists: state.exists,
    kind: state.kind,
    size: state.size,
    mtimeMs: state.mtimeMs,
    sha256: state.kind === 'file' ? fileContentHash(state.path) : undefined,
    treeDigest: state.kind === 'directory' ? projectTreeDigest(state.path) : undefined,
  }).hash;
}

export function projectTreeDigest(projectPath: string): string {
  const resolved = path.resolve(projectPath);
  const entries: Array<Record<string, unknown>> = [];
  const walk = (dirPath: string) => {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.risutoki') continue;
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(resolved, fullPath).replace(/\\/g, '/');
      const stat = fs.statSync(fullPath);
      entries.push({
        relativePath,
        kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        size: entry.isFile() ? stat.size : null,
        sha256: entry.isFile() ? fileContentHash(fullPath) : undefined,
        mtimeMs: stat.mtimeMs,
      });
      if (entry.isDirectory()) walk(fullPath);
    }
  };
  walk(resolved);
  entries.sort((a, b) => String(a.relativePath).localeCompare(String(b.relativePath)));
  return fingerprintSurface(entries).hash;
}

export function projectTreeDigestOrMissing(projectPath: string): string {
  const state = filePathState(projectPath);
  if (!state.exists || state.kind !== 'directory') return filePathStateDigest(projectPath);
  return projectTreeDigest(projectPath);
}
