// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveGuideRootDirs, resolveSkillRootDirs } from './content-roots';
import { listSkillCatalogEntries } from './skill-catalog';

const ROOT = path.resolve(__dirname, '../..');
const SKILL_ROOTS = resolveSkillRootDirs(ROOT);
const CATALOG = listSkillCatalogEntries(SKILL_ROOTS);
const GUIDE_ROOTS = resolveGuideRootDirs(ROOT);

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function skillSource(name: string) {
  const entry = CATALOG.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`Missing skill: ${name}`);
  return fs.readFileSync(path.join(entry.dirPath, 'SKILL.md'), 'utf8');
}

function markdownReferences(source: string) {
  return [...source.matchAll(/\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/giu)].map((match) => match[1]);
}

const ROUTER_SKILLS: Record<string, readonly string[]> = {
  'risu/common/AGENTS.md': [
    'file-structure-reference',
    'writing-cbs-syntax',
    'writing-lorebooks',
    'writing-regex-scripts',
    'writing-lua-scripts',
    'writing-html-css',
    'writing-restricted-wysiwyg-html',
    'writing-trigger-scripts',
    'writing-standing-image-prompts',
  ],
  'risu/bot/AGENTS.md': ['authoring-bots', 'writing-translation-guides'],
  'risu/prompts/AGENTS.md': ['writing-risup-presets', 'prompt-family'],
  'risu/modules/AGENTS.md': ['writing-risum-modules'],
  'risu/plugins/AGENTS.md': ['writing-plugins-v3'],
};

describe('agent eval: Skill discovery and reference contracts', () => {
  it('discovers a nonempty catalog with unique names and portable sources', () => {
    const names = CATALOG.map((entry) => entry.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of CATALOG) {
      expect(skillSource(entry.name), entry.name).not.toMatch(/[A-Za-z]:[\\/]Users[\\/]/u);
    }
  });

  it('keeps referenced Markdown files resolvable and in-skill references servable by read_skill', () => {
    for (const entry of CATALOG) {
      for (const file of entry.files.filter((name) => name.endsWith('.md'))) {
        const sourcePath = path.join(entry.dirPath, file);
        const source = fs.readFileSync(sourcePath, 'utf8');
        for (const reference of markdownReferences(source)) {
          if (/^(?:https?:|#)/iu.test(reference)) continue;
          const relativePath = decodeURIComponent(reference.split('#', 1)[0]);
          const resolved = path.resolve(path.dirname(sourcePath), relativePath);
          expect(fs.existsSync(resolved), `${entry.name}: ${reference}`).toBe(true);
          const withinSkill = path.relative(entry.dirPath, resolved).replace(/\\/gu, '/');
          if (withinSkill.startsWith('..')) {
            const owner = CATALOG.find((candidate) => !path.relative(candidate.dirPath, resolved).startsWith('..'));
            if (owner) {
              const withinOwner = path.relative(owner.dirPath, resolved).replace(/\\/gu, '/');
              expect(owner.files, `${entry.name}: ${reference} is not served by read_skill(${owner.name})`).toContain(
                withinOwner,
              );
              continue;
            }
            const servedByGuideRoot = GUIDE_ROOTS.some(
              (root) => !path.relative(root.absolutePath, resolved).startsWith('..'),
            );
            expect(servedByGuideRoot, `${entry.name}: ${reference} is outside every skill and guide root`).toBe(true);
            continue;
          }
          expect(entry.files, `${entry.name}: ${reference} is not served by read_skill`).toContain(withinSkill);
        }
      }
    }
  });

  it('keeps each subtree router complete without preloading support Skills', () => {
    for (const [routerPath, skills] of Object.entries(ROUTER_SKILLS)) {
      const router = read(routerPath);
      for (const skill of skills) {
        expect(router, `${routerPath}: ${skill}`).toContain(`\`${skill}\``);
      }
    }
  });

  it('keeps Skill UI prompts explicit about the invoked Skill', () => {
    for (const entry of CATALOG) {
      const metadataPath = path.join(entry.dirPath, 'agents', 'openai.yaml');
      if (!fs.existsSync(metadataPath)) continue;
      expect(fs.readFileSync(metadataPath, 'utf8'), entry.name).toContain(`$${entry.name}`);
    }
  });
});
