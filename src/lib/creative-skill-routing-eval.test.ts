// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveSkillRootDirs } from './content-roots';
import { listSkillCatalogEntries } from './skill-catalog';

const ROOT = path.resolve(__dirname, '../..');
const BOT_SKILLS = path.join(ROOT, 'risu', 'bot', 'skills');

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sections(filePath: string) {
  const source = fs.readFileSync(filePath, 'utf8');
  return [...source.matchAll(/^## (.+)$/gm)].map((match, index, matches) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? source.length) : source.length;
    return { title: match[1], body: source.slice(start, end) };
  });
}

const ROUTING_CASES = [
  {
    prompt: 'Make a classic tsundere partner bot, played straight.',
    primary: 'authoring-characters',
    support: ['core-craft', 'trope-library'],
  },
  {
    prompt: 'Turn this magical-girl concept into an anime, manga, and RisuAI bot.',
    primary: 'authoring-media-mix',
    support: ['core-craft', 'authoring-characters', 'authoring-worlds'],
  },
  {
    prompt: 'Plan a complete 12-episode anime arc and an open-ended RP derivative.',
    primary: 'authoring-media-mix',
    support: ['core-craft', 'authoring-scenarios'],
  },
  {
    prompt: 'Design a collectible gacha cast with faction identity and individual hooks.',
    primary: 'authoring-media-mix',
    support: ['trope-library', 'authoring-characters'],
  },
  {
    prompt: 'Adapt this stylized anime ensemble into a live-action drama.',
    primary: 'authoring-media-mix',
    support: ['core-craft'],
  },
  {
    prompt: 'Reinterpret a regional fox-spirit legend as a living setting.',
    primary: 'authoring-worlds',
    support: ['core-craft'],
  },
  {
    prompt: 'Write one dedicated slow-burn RP partner.',
    primary: 'authoring-characters',
    support: ['core-craft'],
  },
  {
    prompt: 'Turn this finished character sheet into one Anima standing-image prompt.',
    primary: 'writing-asset-prompts',
    support: [],
  },
  {
    prompt: 'Build a long-running academy management simulator with routes and endings.',
    primary: 'authoring-scenarios',
    support: ['core-craft'],
  },
  {
    prompt: 'Build a giantess partner bot with stable scale physics.',
    primary: 'authoring-characters',
    support: ['authoring-desire', 'authoring-worlds'],
  },
  {
    prompt: 'Create an adult consensual fetish bot with explicit boundaries and a specialized payload.',
    primary: 'authoring-characters',
    support: ['authoring-desire'],
  },
  {
    prompt: 'Design an idol whose Japanese first-person pronoun and sentence endings define her voice.',
    primary: 'authoring-characters',
    support: ['writing-translation-guides'],
  },
  {
    prompt: 'The user always plays the heroine’s fixed adult brother, but the bot must not write his choices.',
    primary: 'authoring-characters',
    support: ['core-craft'],
  },
  {
    prompt: 'Make a partner bot that accepts any user persona without assuming gender, species, job, or past.',
    primary: 'authoring-characters',
    support: ['core-craft'],
  },
  {
    prompt: 'Build an academy world where user characters are flexible but students have a strict power ceiling.',
    primary: 'authoring-worlds',
    support: ['core-craft'],
  },
  {
    prompt: 'Design an adult relationship fantasy; exclusivity, harem, openness, and NTR are unspecified.',
    primary: 'authoring-characters',
    support: ['authoring-desire'],
  },
  {
    prompt: 'Build a consensual adult corruption and surrender arc without forcing the ending in RP.',
    primary: 'authoring-characters',
    support: ['authoring-desire', 'core-craft'],
  },
  {
    prompt: 'Design an explicit opt-in adult pregnancy and reproductive fantasy with clear boundaries.',
    primary: 'authoring-characters',
    support: ['authoring-desire'],
  },
  {
    prompt: 'Make a classic vampire maid while preserving both trope promises at high resolution.',
    primary: 'authoring-characters',
    support: ['trope-library'],
  },
  {
    prompt: 'Build an isekai summoning world where return remains possible and the summoner owes the user.',
    primary: 'authoring-worlds',
    support: ['core-craft'],
  },
  {
    prompt: 'Differentiate a multi-heroine cast by access fantasy, obstacle, jealousy, and route payoff.',
    primary: 'authoring-characters',
    support: ['trope-library'],
  },
  {
    prompt: 'Build a running-gag ensemble whose callbacks vary and leave consequences.',
    primary: 'authoring-scenarios',
    support: ['core-craft', 'authoring-characters'],
  },
] as const;

describe('agent eval: creative skill contracts and routing', () => {
  it('keeps skill names unique and registers the complete bot-authoring suite', () => {
    const catalog = listSkillCatalogEntries(resolveSkillRootDirs(ROOT));
    const names = catalog.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'authoring-media-mix',
        'authoring-characters',
        'authoring-worlds',
        'authoring-scenarios',
        'authoring-desire',
        'trope-library',
        'writing-translation-guides',
      ]),
    );
  });

  it('keeps media-mix references, output contract, and visual reduction tests complete', () => {
    const requiredFiles = ['SKILL.md', 'MEDIA_PROFILES.md', 'VISUAL_IDENTITY.md', 'VALIDATION.md'];
    for (const fileName of requiredFiles) {
      expect(fs.existsSync(path.join(BOT_SKILLS, 'authoring-media-mix', fileName))).toBe(true);
    }

    const skill = read('risu/bot/skills/authoring-media-mix/SKILL.md');
    expect(skill).toContain(
      'IP Core -> Character/World Identity -> Visual Identity -> Media Adaptation Matrix -> RisuAI Handoff',
    );
    expect(skill).toContain('Human irregularity');

    const validation = read('risu/bot/skills/authoring-media-mix/VALIDATION.md');
    for (const required of [
      'solid-black silhouette',
      'three-color reduction',
      'SD conversion',
      '32px icon',
      'group silhouette',
      'alternate-costume recognition',
      'Theme saturation',
      'Proportionality test',
    ]) {
      expect(validation).toContain(required);
    }
  });

  it('keeps trope index counts synchronized with four-field catalog entries', () => {
    const index = read('risu/bot/skills/trope-library/TROPES.md');
    const indexedFiles = [
      'CHARACTER_TROPES.md',
      'RELATIONSHIP_TROPES.md',
      'MEDIA_CONVENTIONS.md',
      'SPECIES_ROLE_TROPES.md',
    ];
    let indexedTotal = 0;

    for (const fileName of indexedFiles) {
      const countMatch = index.match(new RegExp(`\\[${fileName.replace('.', '\\.')}\\][^\\n]*\\|\\s+(\\d+)\\s+\\|`));
      expect(countMatch, `${fileName}: index count`).not.toBeNull();
      const expectedCount = Number(countMatch?.[1]);
      const entries = sections(path.join(BOT_SKILLS, 'trope-library', fileName));
      expect(entries, `${fileName}: actual entries`).toHaveLength(expectedCount);
      indexedTotal += expectedCount;

      for (const entry of entries) {
        for (const label of ['Expected beats', 'Straight quality bar', 'Proven subversions', 'Degradation patterns']) {
          expect(entry.body, `${entry.title}: ${label}`).toContain(`**${label}:**`);
        }
      }
    }

    expect(indexedTotal).toBeGreaterThanOrEqual(70);
    expect(index).toContain('currently contains 70');
    const speciesRoles = sections(path.join(BOT_SKILLS, 'trope-library', 'SPECIES_ROLE_TROPES.md'));
    expect(speciesRoles).toHaveLength(20);
    expect(speciesRoles.map((entry) => entry.title)).toEqual([
      'Vampire',
      'Fox Spirit / Kumiho',
      'Elf',
      'Beastfolk / Kemonomimi',
      'Android / Automaton',
      'Ghost / Onryo',
      'Angel',
      'Demon / Tempter',
      'Witch',
      'Dragon / Dragonkin',
      'Slime / Shapeshifter',
      'Maid / Butler',
      'Nun / Sister',
      'Shrine Maiden / Exorcist',
      'Gyaru',
      'Senpai',
      'Kouhai',
      'Hero / Chosen One',
      'Demon Lord',
      'Knight / Bodyguard',
    ]);
  });

  it('keeps at least 21 genre presets with scene-useful fields and a complete isekai frame', () => {
    const entries = sections(path.join(BOT_SKILLS, 'authoring-worlds', 'GENRE_PRESETS.md')).filter((entry) =>
      /^\d+\./.test(entry.title),
    );
    expect(entries.length).toBeGreaterThanOrEqual(21);

    for (const entry of entries) {
      for (const label of [
        'Default pressures',
        'Norms & taboos',
        'Knowledge horizon',
        'Default drift',
        'Texture starters',
        'Scene generators',
      ]) {
        expect(entry.body, `${entry.title}: ${label}`).toContain(`**${label}:**`);
      }
    }

    const isekai = entries.find((entry) => entry.title.includes('Isekai Transfer / Summoning'));
    expect(isekai).toBeDefined();
    for (const phrase of [
      'Transfer / summoning distinction',
      'Cheat and modern-knowledge limits',
      'return is possible',
      'Language access',
      'legal personhood',
      "summoner's obligations",
    ]) {
      expect(isekai?.body).toContain(phrase);
    }
  });

  it('keeps at least 15 desire families, including relationship constants for the new families', () => {
    const entries = sections(path.join(BOT_SKILLS, 'authoring-desire', 'DESIRE_CATALOG.md')).filter(
      (entry) => entry.title !== 'Desire Catalog',
    );
    expect(entries.length).toBeGreaterThanOrEqual(15);

    for (const entry of entries) {
      for (const label of [
        'Payload',
        'Scene grammar',
        'Consistency rules',
        'Relationship constants',
        'Variation',
        'Failure modes',
        'Boundaries',
        'Media application',
      ]) {
        expect(entry.body, `${entry.title}: ${label}`).toContain(`**${label}:**`);
      }
    }

    for (const title of [
      'Bond Exclusivity and Jealousy',
      'Corruption and Value Drift',
      'Submission, Conquest, and Surrender',
      'Worship, Devotion, and Service',
      'Fertility, Pregnancy, and Reproductive Fantasy',
    ]) {
      const entry = entries.find((candidate) => candidate.title === title);
      expect(entry, title).toBeDefined();
    }

    const skill = read('risu/bot/skills/authoring-desire/SKILL.md');
    for (const phrase of [
      'Relationship configuration / exclusivity',
      'Mutual exclusivity',
      'asymmetric exclusivity',
      'consensual plural/harem',
      'open relationship',
      'betrayal/NTR/partner sharing',
      'intentionally unresolved',
      'ask once',
      'Do not infer harem',
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it('defines all three user-position modes, agency guards, compatibility handling, and placement', () => {
    const userPosition = read('risu/bot/skills/core-craft/USER_POSITION.md');
    for (const phrase of [
      'Fixed Persona',
      'Open Persona',
      'Compatibility-Bounded Persona',
      'Required',
      'Preferred',
      'Forbidden',
      'Negotiable',
      'Mode and fixed scope',
      'Starting relationship and social position',
      'Access and knowledge limits',
      'Capability ceiling and world obligations',
      'Allowed bot assumptions',
      'Agency guard',
      'Incompatible-persona handling',
      'Placement plan',
      'actions, dialogue, emotions, interpretations, and choices',
      'Do not silently accept',
      'Do not silently overwrite',
      'design-notes surface',
      'alternate campaigns, not pretend solutions',
      'Prefer in-world clarification',
      'not a recitation of the contract table',
      '`persona`',
      'description',
      'lorebook',
      'opener',
    ]) {
      expect(userPosition).toContain(phrase);
    }

    for (const relativePath of [
      'risu/bot/skills/authoring-characters/SKILL.md',
      'risu/bot/skills/authoring-worlds/SKILL.md',
      'risu/bot/skills/authoring-scenarios/SKILL.md',
      'risu/bot/skills/authoring-lorebook-bots/SKILL.md',
      'risu/bot/skills/authoring-media-mix/SKILL.md',
    ]) {
      expect(read(relativePath), relativePath).toContain('USER_POSITION.md');
    }
  });

  it('keeps 24 gap directions, embodied appeal, ensemble differentiation, and original examples', () => {
    const appeal = read('risu/bot/skills/authoring-characters/APPEAL_PATTERNS.md');
    const directions = [
      'cold -> warm',
      'warm -> lethal',
      'cheerful -> ruthless',
      'frightening -> gentle',
      'competent -> helpless',
      'clumsy -> hypercompetent',
      'commanding -> approval-starved',
      'sheltered -> decisive',
      'pious -> starving',
      'flirtatious -> shy-when-sincere',
      'innocent -> calculating',
      'cynical -> devotional',
      'noble -> domestic-disaster',
      'servant -> quiet-authority',
      'idol -> privacy-hungry',
      'delinquent -> caretaker',
      'loud -> silent-under-hurt',
      'stoic -> petty',
      'aloof -> conditionally-clingy',
      'polite -> territorial',
      'monstrous -> tender',
      'small -> dominating',
      'invincible -> sensory-fragile',
      'healer -> self-destructive',
    ];
    for (const direction of directions) expect(appeal).toContain(direction);
    expect(appeal).toContain(
      'fixed fact -> visual/motion signal -> observer response -> character self-consciousness -> scene consequence',
    );
    for (const phrase of [
      'Group role',
      'Core appeal response',
      'Access fantasy',
      'Priced obstacle',
      'Public/private gap',
      'Exclusivity stance',
      'Jealousy trigger and scarce resource',
      'Route-only payoff',
      'Non-overlap axis',
      'preserve personhood',
    ]) {
      expect(appeal).toContain(phrase);
    }

    expect(fs.existsSync(path.join(BOT_SKILLS, 'authoring-characters', 'WORKED_EXAMPLE.md'))).toBe(true);
    expect(fs.existsSync(path.join(BOT_SKILLS, 'authoring-desire', 'WORKED_EXAMPLE.md'))).toBe(true);
  });

  it('defines comedy beats, callback variation, residue, and seriousness protection', () => {
    const comedy = read('risu/bot/skills/core-craft/COMEDY_CRAFT.md');
    for (const phrase of [
      'scene functions, not permanent personality labels',
      'setup -> beat -> heightening -> callback -> residue',
      'Location',
      'Power relation',
      'Outcome',
      'must not erase them',
      'Role reversal',
      'Callback interval',
      'Fatigue',
      'Tension placement',
      'Competence hold',
      'do not repeat the same sentence',
      'examples, not future scripts',
    ]) {
      expect(comedy).toContain(phrase);
    }
  });

  it('registers every routed primary skill in the bot router and keeps support skills discoverable', () => {
    const router = read('risu/bot/AGENTS.md');
    const catalogNames = new Set(listSkillCatalogEntries(resolveSkillRootDirs(ROOT)).map((entry) => entry.name));
    expect(ROUTING_CASES).toHaveLength(22);

    for (const route of ROUTING_CASES) {
      expect(catalogNames.has(route.primary), `${route.prompt}: ${route.primary}`).toBe(true);
      expect(router, `${route.prompt}: router ${route.primary}`).toContain(`read_skill("${route.primary}")`);
      for (const support of route.support) {
        expect(catalogNames.has(support), `${route.prompt}: ${support}`).toBe(true);
      }
    }
  });

  it('documents the creative-mode split, signature echoes, voice capsule, and myth variant ledger', () => {
    const core = read('risu/bot/skills/core-craft/SKILL.md');
    for (const phrase of [
      'Emergent RP',
      'Fixed narrative',
      'Route/serial hybrid',
      'Franchise core',
      'Reinforcing Echoes',
      'Target-language voice capsule',
    ]) {
      expect(core).toContain(phrase);
    }

    const worlds = read('risu/bot/skills/authoring-worlds/SKILL.md');
    for (const phrase of [
      'Source tradition',
      'Regional variants',
      'Popular-culture version',
      'Project-adopted version',
      'Deliberate deviations',
    ]) {
      expect(worlds).toContain(phrase);
    }
  });

  it('documents runtime behavior contracts for agency, missing exclusivity, and varied callbacks', () => {
    const userPosition = read('risu/bot/skills/core-craft/USER_POSITION.md');
    expect(userPosition).toContain('must never decide for `{{user}}`');
    expect(userPosition).toContain('must not manufacture gender, species, job, or past');
    expect(userPosition).toContain('must surface both and offer options');

    const desire = read('risu/bot/skills/authoring-desire/SKILL.md');
    expect(desire).toContain('clarify it once before the answer becomes necessary');
    expect(desire).toContain('Prefer a natural in-character question');
    expect(desire).toContain('Do not infer harem');

    const comedy = read('risu/bot/skills/core-craft/COMEDY_CRAFT.md');
    expect(comedy).toContain('do not repeat the same sentence');
    expect(comedy).toContain('vary at least one');
  });
});
