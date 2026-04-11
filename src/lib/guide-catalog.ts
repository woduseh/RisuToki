import fs from 'node:fs';
import path from 'node:path';

import type { ResolvedGuideRoot } from './content-roots';

export interface GuideCatalogEntry {
  readonly name: string;
  readonly filePath: string;
  readonly rootPath: string;
  readonly rootRelativePath: string;
  readonly relativePathWithinRoot: string;
}

function walkMarkdownFiles(dirPath: string, currentRelativePath = ''): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const nextRelativePath = currentRelativePath ? path.join(currentRelativePath, entry.name) : entry.name;
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(absolutePath, nextRelativePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(nextRelativePath);
    }
  }

  return results;
}

function normalizePath(value: string) {
  return value.replace(/\\/g, '/');
}

function formatGuideName(guideRoot: ResolvedGuideRoot, relativePathWithinRoot: string) {
  const normalizedRelativePath = normalizePath(relativePathWithinRoot);
  return guideRoot.prefix ? `${guideRoot.prefix}/${normalizedRelativePath}` : normalizedRelativePath;
}

export function listGuideCatalogEntries(guideRoots: readonly ResolvedGuideRoot[]): GuideCatalogEntry[] {
  const entries: GuideCatalogEntry[] = [];

  for (const guideRoot of guideRoots) {
    const rootEntries = walkMarkdownFiles(guideRoot.absolutePath).sort((a, b) => a.localeCompare(b));
    for (const relativePathWithinRoot of rootEntries) {
      entries.push({
        name: formatGuideName(guideRoot, relativePathWithinRoot),
        filePath: path.join(guideRoot.absolutePath, relativePathWithinRoot),
        rootPath: guideRoot.absolutePath,
        rootRelativePath: guideRoot.relativePath,
        relativePathWithinRoot: normalizePath(relativePathWithinRoot),
      });
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveGuideCatalogEntry(
  guideRoots: readonly ResolvedGuideRoot[],
  guideName: string,
): GuideCatalogEntry | null {
  const normalizedGuideName = normalizePath(guideName)
    .trim()
    .replace(/^\.\/+/, '');
  const allEntries = listGuideCatalogEntries(guideRoots);

  const exactMatch = allEntries.find((entry) => entry.name === normalizedGuideName);
  if (exactMatch) {
    return exactMatch;
  }

  if (!normalizedGuideName.includes('/')) {
    const basenameMatches = allEntries.filter(
      (entry) => path.posix.basename(entry.relativePathWithinRoot) === normalizedGuideName,
    );
    if (basenameMatches.length === 1) {
      return basenameMatches[0];
    }
  }

  return null;
}
