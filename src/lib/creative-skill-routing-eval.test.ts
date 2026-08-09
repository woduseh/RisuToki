// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveSkillRootDirs } from './content-roots';
import { listSkillCatalogEntries } from './skill-catalog';

const ROOT = path.resolve(__dirname, '../..');
const SKILL_ROOTS = resolveSkillRootDirs(ROOT);
const CATALOG = listSkillCatalogEntries(SKILL_ROOTS);

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function wordCount(source: string) {
  return source.trim() ? source.trim().split(/\s+/u).length : 0;
}

function skillSource(name: string) {
  const entry = CATALOG.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`Missing skill: ${name}`);
  return fs.readFileSync(path.join(entry.dirPath, 'SKILL.md'), 'utf8');
}

function skillDescription(source: string) {
  const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? '';
  const raw = frontmatter.match(/^description:\s*(.+)$/mu)?.[1]?.trim() ?? '';
  return raw.replace(/^(['"])([\s\S]*)\1$/u, '$2');
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
    'writing-arca-html',
    'writing-trigger-scripts',
    'writing-asset-prompts',
    'writing-danbooru-tags',
  ],
  'risu/bot/AGENTS.md': [
    'authoring-media-mix',
    'authoring-characters',
    'authoring-worlds',
    'authoring-self-introduction-sheets',
    'authoring-lorebook-bots',
    'authoring-scenarios',
    'authoring-desire',
    'trope-library',
    'writing-translation-guides',
    'core-craft',
  ],
  'risu/prompts/AGENTS.md': [
    'writing-risup-presets',
    'prompt-preset-sync',
    'mythos-prompt-development',
    'mythos-prompt-maintenance',
  ],
  'risu/modules/AGENTS.md': ['writing-risum-modules'],
  'risu/plugins/AGENTS.md': ['writing-plugins-v3'],
};

describe('agent eval: deterministic Skill routing and context budgets', () => {
  it('keeps the unified 28-Skill catalog unique', () => {
    const names = CATALOG.map((entry) => entry.name);
    expect(names).toHaveLength(28);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps every description trigger-rich, bounded, and role-explicit', () => {
    for (const entry of CATALOG) {
      const description = skillDescription(skillSource(entry.name));
      expect(description, `${entry.name}: description`).toContain('Use when');
      expect(description, `${entry.name}: exclusion`).toContain('Do not use when');
      expect(description, `${entry.name}: role`).toMatch(/(?:Primary|Support) skill/u);
      expect(wordCount(description), `${entry.name}: description words`).toBeLessThanOrEqual(80);
    }
  });

  it('keeps main Skill files within progressive-disclosure budgets', () => {
    let total = 0;
    for (const entry of CATALOG) {
      const source = skillSource(entry.name);
      const words = wordCount(source);
      total += words;
      const cap =
        entry.name === 'project-workflow'
          ? 600
          : entry.name === 'using-mcp-tools'
            ? 900
            : entry.name === 'core-craft'
              ? 700
              : 1_000;
      expect(words, `${entry.name}: ${words}/${cap} words`).toBeLessThanOrEqual(cap);
      expect(source, `${entry.name}: runtime smoke table`).not.toMatch(/^## .*Smoke.*$/gimu);
      expect(source, `${entry.name}: user-specific absolute path`).not.toMatch(/[A-Za-z]:[\\/]Users[\\/]/u);
    }
    expect(total).toBeLessThanOrEqual(24_000);
  });

  it('keeps referenced Markdown files resolvable', () => {
    for (const entry of CATALOG) {
      const source = skillSource(entry.name);
      for (const reference of markdownReferences(source)) {
        if (/^(?:https?:|#)/iu.test(reference)) continue;
        const relativePath = decodeURIComponent(reference.split('#', 1)[0]);
        expect(fs.existsSync(path.resolve(entry.dirPath, relativePath)), `${entry.name}: ${reference}`).toBe(true);
      }
    }
  });

  it('keeps root and representative authoring routes below their budgets', () => {
    const rootRouter = read('AGENTS.md');
    const botRouter = read('risu/bot/AGENTS.md');
    expect(wordCount(rootRouter)).toBeLessThanOrEqual(450);
    expect(rootRouter).not.toMatch(/project-workflow.{0,80}(?:mandatory|every session)/isu);
    expect(botRouter).not.toMatch(/core-craft.{0,80}(?:always|alongside)/isu);

    const representativeWords =
      wordCount(rootRouter) +
      wordCount(botRouter) +
      wordCount(skillSource('using-mcp-tools')) +
      wordCount(skillSource('authoring-characters'));
    expect(representativeWords).toBeLessThanOrEqual(4_500);
  });

  it('keeps each subtree router complete without preloading support Skills', () => {
    for (const [routerPath, skills] of Object.entries(ROUTER_SKILLS)) {
      const router = read(routerPath);
      for (const skill of skills) {
        expect(router, `${routerPath}: ${skill}`).toContain(`\`${skill}\``);
      }
    }
  });

  it('makes known collision boundaries explicit in frontmatter', () => {
    const pairs = [
      ['project-workflow', 'using-mcp-tools'],
      ['mythos-prompt-development', 'mythos-prompt-maintenance'],
      ['prompt-preset-sync', 'mythos-prompt-maintenance'],
      ['writing-trigger-scripts', 'writing-lua-scripts'],
      ['authoring-lorebook-bots', 'writing-lorebooks'],
    ] as const;
    for (const [skill, handoff] of pairs) {
      expect(skillDescription(skillSource(skill)), `${skill} -> ${handoff}`).toContain(handoff);
    }
    const coreDescription = skillDescription(skillSource('core-craft'));
    expect(coreDescription).toContain('Support skill');
    expect(coreDescription).toContain('return to the primary');
  });

  it('keeps RisuAI scripting layers distinct while exposing verified interoperability', () => {
    const cbs = skillSource('writing-cbs-syntax');
    const lua = skillSource('writing-lua-scripts');
    const regex = skillSource('writing-regex-scripts');
    const triggers = skillSource('writing-trigger-scripts');
    const plugins = skillSource('writing-plugins-v3');
    const interop = read('risu/common/skills/writing-trigger-scripts/RUNTIME_INTEROP.md');
    const pluginQuickRef = read('risu/plugins/docs/API_QUICKREF.md');

    expect(cbs).toContain('runVar');
    expect(cbs).toContain('../writing-trigger-scripts/RUNTIME_INTEROP.md');
    expect(lua).toContain('engines are cached by execution mode');
    expect(lua).toContain('Returning `false` only sets `stopSending`');
    expect(regex).toContain('`editprocess`: canonical upstream/persisted');
    expect(regex).toContain('`editrequest`: RisuToki convenience alias');
    expect(triggers).toContain('[`RUNTIME_INTEROP.md`](RUNTIME_INTEROP.md)');
    expect(plugins).toContain('Both `risuai` and its runtime alias `Risuai` are valid');
    expect(pluginQuickRef).toContain('Cached properties such as `apiVersion` are read directly');
    expect(interop).toContain('The saved chat receives a `runVar` pass');
    expect(interop).toContain("RisuToki's `editrequest` is an input alias");
    expect(interop).toContain('Returning `false` or calling `stopChat` sets `stopSending`');
  });

  it('preserves dark creative intent while separating RP authorship from content', () => {
    const botRouter = read('risu/bot/AGENTS.md');
    const coreCraft = skillSource('core-craft');
    const characters = skillSource('authoring-characters');
    const userPosition = read('risu/bot/skills/core-craft/USER_POSITION.md');

    expect(botRouter).toContain('Creative choices need not converge on one “correct”');
    expect(botRouter).toContain('this authorship boundary does not sanitize coercion');
    expect(botRouter).not.toMatch(/normal safety boundaries|consent, user agency, or safety boundaries/iu);
    expect(coreCraft).toContain('Art has no single optimal answer.');
    expect(coreCraft).toContain(
      'Productive wrongness preserves chosen anchors and consequences; accidental incoherence loses them.',
    );
    expect(coreCraft).toContain(
      'Preserve the requested intensity, moral ambiguity, transgression, ugliness, and consequence.',
    );
    expect(coreCraft).not.toMatch(/allowed dark material|normal safety boundaries/iu);
    expect(characters).toContain('This is an authorship boundary, not a content-softening rule');
    expect(userPosition).not.toContain('breaks safety');
  });

  it('keeps desire outcome policy mode-specific instead of consent-defaulted', () => {
    const desire = skillSource('authoring-desire');
    const catalog = read('risu/bot/skills/authoring-desire/DESIRE_CATALOG.md');
    const examples = read('risu/bot/skills/authoring-desire/WORKED_EXAMPLE.md');

    expect(desire).toContain('## Mode contract');
    expect(desire).toContain('This authorship boundary does not make fictional coercion');
    expect(desire).toContain('including non-consensual, coercive, degrading, corruptive, or irreversible outcomes');
    expect(desire).toContain('Treat consent, willingness, refusal, incapacity, and inevitability as possible facts');
    expect(desire).not.toMatch(
      /Turn an allowed fantasy|escalation responds to state and consent|coercive inevitability/iu,
    );
    expect(catalog).toContain('consensual, coerced, institutional, supernatural, or mixed');
    expect(catalog).toContain('refusal is defined as possible, futile, forbidden, removed, or merely symbolic');
    expect(catalog).toContain('including body-only focus when intended');
    expect(examples).toContain('## Contrast: Imposed Irreversible Corruption');
    expect(examples).toContain('## Contrast: Coercive Pressure in Emergent RP');
  });

  it('uses one material clarification instead of rigid questionnaires', () => {
    for (const skill of ['authoring-characters', 'authoring-desire']) {
      const source = skillSource(skill);
      expect(source, skill).toContain('Ask at most one');
      expect(source, skill).not.toMatch(/always ask|ask all|five questions|question 1/iu);
    }
  });
});
