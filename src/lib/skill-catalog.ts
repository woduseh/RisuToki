import fs from 'node:fs';
import path from 'node:path';

import type { ResolvedSkillRoot, SkillScope } from './content-roots';

export interface SkillCatalogEntry {
  readonly name: string;
  readonly dirPath: string;
  readonly rootPath: string;
  readonly rootRelativePath: string;
  readonly scope: SkillScope;
  readonly files: string[];
}

const SKILL_REFERENCE_DIR = 'references';
const SKILL_FILE_NAME_PATTERN = /^[^/\\]+\.md$/u;

/** Skill documents that `read_skill` serves: top-level `*.md` plus `references/*.md`, nothing deeper. */
export function isReadableSkillFileName(fileName: string) {
  if (fileName.includes('..') || fileName.includes('\\')) return false;
  if (SKILL_FILE_NAME_PATTERN.test(fileName)) return true;
  const prefix = `${SKILL_REFERENCE_DIR}/`;
  return fileName.startsWith(prefix) && SKILL_FILE_NAME_PATTERN.test(fileName.slice(prefix.length));
}

function listMarkdownFileNames(dirPath: string) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return [];
  return fs
    .readdirSync(dirPath)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b));
}

function getSkillMarkdownFiles(dirPath: string) {
  const references = listMarkdownFileNames(path.join(dirPath, SKILL_REFERENCE_DIR)).map(
    (fileName) => `${SKILL_REFERENCE_DIR}/${fileName}`,
  );
  return [...listMarkdownFileNames(dirPath), ...references];
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
        scope: skillRoot.scope,
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
