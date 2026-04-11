import fs from 'node:fs';
import path from 'node:path';

import type { ResolvedSkillRoot } from './content-roots';

export interface SkillCatalogEntry {
  readonly name: string;
  readonly dirPath: string;
  readonly rootPath: string;
  readonly rootRelativePath: string;
  readonly files: string[];
}

function getSkillMarkdownFiles(dirPath: string) {
  return fs
    .readdirSync(dirPath)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b));
}

export function listSkillCatalogEntries(skillRoots: readonly ResolvedSkillRoot[]): SkillCatalogEntry[] {
  const seen = new Map<string, SkillCatalogEntry>();

  for (const skillRoot of skillRoots) {
    const entries = fs.readdirSync(skillRoot.absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(skillRoot.absolutePath, entry.name);
      const skillMdPath = path.join(dirPath, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;
      if (seen.has(entry.name)) {
        const existing = seen.get(entry.name)!;
        throw new Error(
          `Duplicate skill directory "${entry.name}" in ${existing.rootRelativePath} and ${skillRoot.relativePath}`,
        );
      }

      seen.set(entry.name, {
        name: entry.name,
        dirPath,
        rootPath: skillRoot.absolutePath,
        rootRelativePath: skillRoot.relativePath,
        files: getSkillMarkdownFiles(dirPath),
      });
    }
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveSkillCatalogFile(skillRoots: readonly ResolvedSkillRoot[], skillName: string, fileName: string) {
  for (const skillRoot of skillRoots) {
    const filePath = path.join(skillRoot.absolutePath, skillName, fileName);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }

  return null;
}
