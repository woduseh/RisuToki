import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ADVISOR_IDS, CHATBOT_CATEGORIES } from './pluni-persona';
import {
  buildAgentProfileMarkdown,
  getAgentFileName,
  AGENT_PROFILE_DIR,
  syncAgentProfiles,
  cleanupAgentProfiles,
  type AgentProfileState,
} from './copilot-agent-profile-manager';

// ── Temp directory helpers (follows skill-link-sync.test.ts pattern) ──

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-agent-profiles-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── Markdown generation ────────────────────────────────────────────

describe('buildAgentProfileMarkdown', () => {
  it.each([...ADVISOR_IDS])('generates non-empty markdown for advisor "%s"', (id) => {
    const md = buildAgentProfileMarkdown(id, 'solo');
    expect(md.length).toBeGreaterThan(0);
  });

  it('includes the advisor name in the output', () => {
    for (const id of ADVISOR_IDS) {
      const md = buildAgentProfileMarkdown(id, 'solo');
      // name should appear (capitalised)
      expect(md).toMatch(new RegExp(id.charAt(0).toUpperCase() + id.slice(1)));
    }
  });

  it('includes the advisor role', () => {
    const md = buildAgentProfileMarkdown('pluni', 'solo');
    expect(md.toLowerCase()).toMatch(/emotion|resonan|archetyp/);
  });

  it('includes category-specific focus', () => {
    const solo = buildAgentProfileMarkdown('kotone', 'solo');
    const world = buildAgentProfileMarkdown('kotone', 'world-sim');
    expect(solo).not.toBe(world);
  });

  it('includes model-seat hint', () => {
    const md = buildAgentProfileMarkdown('sophia', 'solo');
    expect(md).toContain('1:1:1');
  });

  it('produces stable output for the same inputs', () => {
    const a = buildAgentProfileMarkdown('pluni', 'multi-char');
    const b = buildAgentProfileMarkdown('pluni', 'multi-char');
    expect(a).toBe(b);
  });

  it.each([...CHATBOT_CATEGORIES])('works for every category "%s"', (cat) => {
    for (const id of ADVISOR_IDS) {
      expect(() => buildAgentProfileMarkdown(id, cat)).not.toThrow();
    }
  });

  // ── Enriched markdown content tests ──────────────────────────────

  it('contains a Tone section for each advisor', () => {
    for (const id of ADVISOR_IDS) {
      const md = buildAgentProfileMarkdown(id, 'solo');
      expect(md).toMatch(/##\s*Tone/);
    }
  });

  it('contains an Analytical Toolkit section for each advisor', () => {
    for (const id of ADVISOR_IDS) {
      const md = buildAgentProfileMarkdown(id, 'solo');
      expect(md).toMatch(/##\s*Analytical Toolkit/);
    }
  });

  it('contains a Method section for each advisor', () => {
    for (const id of ADVISOR_IDS) {
      const md = buildAgentProfileMarkdown(id, 'solo');
      expect(md).toMatch(/##\s*Method/);
    }
  });

  it('contains an Expected Deliverables section for each advisor', () => {
    for (const id of ADVISOR_IDS) {
      const md = buildAgentProfileMarkdown(id, 'solo');
      expect(md).toMatch(/##\s*Expected Deliverables/);
    }
  });

  it('contains a Lens Selection Rule section for each advisor', () => {
    for (const id of ADVISOR_IDS) {
      const md = buildAgentProfileMarkdown(id, 'solo');
      expect(md).toMatch(/##\s*Lens Selection/);
    }
  });

  it('Pluni markdown references emotional/psychological concepts', () => {
    const md = buildAgentProfileMarkdown('pluni', 'solo');
    const lower = md.toLowerCase();
    expect(lower).toMatch(/emotion|empathy|archetype/);
    expect(lower).toMatch(/warm|disappoint/);
  });

  it('Sophia markdown references structural/systems concepts', () => {
    const md = buildAgentProfileMarkdown('sophia', 'solo');
    const lower = md.toLowerCase();
    expect(lower).toMatch(/narrat|structur|system/);
    expect(lower).toMatch(/solution|fix/);
  });

  it('Kotone markdown references aesthetic/deconstructive concepts', () => {
    const md = buildAgentProfileMarkdown('kotone', 'solo');
    const lower = md.toLowerCase();
    expect(lower).toMatch(/aesthetic|deconstruct|postmodern/);
    expect(lower).toMatch(/rigorous|rigor/);
  });

  it('markdown adapts focus content per category', () => {
    const solo = buildAgentProfileMarkdown('pluni', 'solo');
    const worldSim = buildAgentProfileMarkdown('pluni', 'world-sim');
    const multiChar = buildAgentProfileMarkdown('pluni', 'multi-char');
    // all three should be distinct
    expect(new Set([solo, worldSim, multiChar]).size).toBe(3);
  });
});

// ── Frontmatter validation ─────────────────────────────────────────

describe('buildAgentProfileMarkdown — frontmatter', () => {
  it('starts with YAML frontmatter delimiters', () => {
    for (const id of ADVISOR_IDS) {
      const md = buildAgentProfileMarkdown(id, 'solo');
      expect(md.startsWith('---\n')).toBe(true);
      // closing delimiter exists
      expect(md.indexOf('\n---\n', 4)).toBeGreaterThan(0);
    }
  });

  it('includes a name field in frontmatter', () => {
    for (const id of ADVISOR_IDS) {
      const md = buildAgentProfileMarkdown(id, 'solo');
      const fmEnd = md.indexOf('\n---\n', 4);
      const frontmatter = md.slice(0, fmEnd);
      expect(frontmatter).toMatch(/^name:\s/m);
    }
  });

  it('includes a description field in frontmatter', () => {
    for (const id of ADVISOR_IDS) {
      const md = buildAgentProfileMarkdown(id, 'solo');
      const fmEnd = md.indexOf('\n---\n', 4);
      const frontmatter = md.slice(0, fmEnd);
      expect(frontmatter).toMatch(/^description:\s/m);
    }
  });

  it('includes tools in frontmatter', () => {
    const md = buildAgentProfileMarkdown('pluni', 'solo');
    const fmEnd = md.indexOf('\n---\n', 4);
    const frontmatter = md.slice(0, fmEnd);
    expect(frontmatter).toContain('tools:');
  });

  it('markdown body follows the closing frontmatter delimiter', () => {
    for (const id of ADVISOR_IDS) {
      const md = buildAgentProfileMarkdown(id, 'solo');
      const fmEnd = md.indexOf('\n---\n', 4);
      const body = md.slice(fmEnd + 5); // skip \n---\n
      expect(body.trim().length).toBeGreaterThan(0);
      expect(body).toContain('# '); // has markdown headings
    }
  });
});

// ── File path generation ───────────────────────────────────────────

describe('getAgentFileName', () => {
  it.each([...ADVISOR_IDS])('returns a .agent.md filename for advisor "%s"', (id) => {
    const name = getAgentFileName(id);
    expect(name).toMatch(/\.agent\.md$/);
  });

  it('filenames are unique per advisor', () => {
    const names = ADVISOR_IDS.map(getAgentFileName);
    expect(new Set(names).size).toBe(3);
  });

  it('filenames include the advisor id', () => {
    for (const id of ADVISOR_IDS) {
      expect(getAgentFileName(id).toLowerCase()).toContain(id);
    }
  });
});

describe('AGENT_PROFILE_DIR', () => {
  it('is ".github/agents" (relative path segments)', () => {
    expect(AGENT_PROFILE_DIR).toBe(path.join('.github', 'agents'));
  });
});

// ── Sync: creates fresh files ──────────────────────────────────────

describe('syncAgentProfiles', () => {
  it('creates .github/agents directory if it does not exist', () => {
    const root = makeTempRoot();
    const state = syncAgentProfiles(root, 'solo');
    const agentsDir = path.join(root, '.github', 'agents');

    expect(fs.existsSync(agentsDir)).toBe(true);
    expect(state.entries.length).toBe(3);
  });

  it('writes one markdown file per advisor', () => {
    const root = makeTempRoot();
    syncAgentProfiles(root, 'solo');

    for (const id of ADVISOR_IDS) {
      const filePath = path.join(root, '.github', 'agents', getAgentFileName(id));
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('state tracks which files are created fresh vs backed up', () => {
    const root = makeTempRoot();
    const state = syncAgentProfiles(root, 'solo');

    for (const entry of state.entries) {
      expect(entry.hadExistingFile).toBe(false);
      expect(entry.originalContent).toBeNull();
    }
  });

  it('returns the absolute file paths', () => {
    const root = makeTempRoot();
    const state = syncAgentProfiles(root, 'solo');

    for (const entry of state.entries) {
      expect(path.isAbsolute(entry.filePath)).toBe(true);
      expect(entry.filePath.startsWith(root)).toBe(true);
    }
  });
});

// ── Sync: overwrite handling ───────────────────────────────────────

describe('syncAgentProfiles — overwrite safety', () => {
  it('backs up pre-existing file content', () => {
    const root = makeTempRoot();
    const agentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const fileName = getAgentFileName('pluni');
    const existingContent = '# My custom Pluni agent\nDo not lose this.';
    fs.writeFileSync(path.join(agentsDir, fileName), existingContent, 'utf-8');

    const state = syncAgentProfiles(root, 'solo');

    const pluniEntry = state.entries.find((e) => e.advisorId === 'pluni');
    expect(pluniEntry).toBeDefined();
    expect(pluniEntry!.hadExistingFile).toBe(true);
    expect(pluniEntry!.originalContent).toBe(existingContent);
  });

  it('overwrites the file with generated content', () => {
    const root = makeTempRoot();
    const agentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const fileName = getAgentFileName('pluni');
    fs.writeFileSync(path.join(agentsDir, fileName), 'old content', 'utf-8');

    syncAgentProfiles(root, 'solo');

    const content = fs.readFileSync(path.join(agentsDir, fileName), 'utf-8');
    expect(content).not.toBe('old content');
    expect(content.length).toBeGreaterThan(0);
  });

  it('re-sync to a different category updates content', () => {
    const root = makeTempRoot();
    const state1 = syncAgentProfiles(root, 'solo');
    const state2 = syncAgentProfiles(root, 'world-sim', state1);

    // second sync should preserve the original backup, not the first sync's generated content
    for (const entry of state2.entries) {
      expect(entry.hadExistingFile).toBe(false);
      expect(entry.originalContent).toBeNull();
    }

    // file content should have changed
    const filePath = path.join(root, '.github', 'agents', getAgentFileName('pluni'));
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('world-sim');
  });
});

// ── Cleanup ────────────────────────────────────────────────────────

describe('cleanupAgentProfiles', () => {
  it('deletes files that were created fresh', () => {
    const root = makeTempRoot();
    const state = syncAgentProfiles(root, 'solo');

    cleanupAgentProfiles(state);

    for (const entry of state.entries) {
      expect(fs.existsSync(entry.filePath)).toBe(false);
    }
  });

  it('restores original content when a file was backed up', () => {
    const root = makeTempRoot();
    const agentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const fileName = getAgentFileName('pluni');
    const originalContent = '# Existing custom content\nPreserve me.';
    fs.writeFileSync(path.join(agentsDir, fileName), originalContent, 'utf-8');

    const state = syncAgentProfiles(root, 'solo');
    cleanupAgentProfiles(state);

    const restored = fs.readFileSync(path.join(agentsDir, fileName), 'utf-8');
    expect(restored).toBe(originalContent);
  });

  it('is idempotent — second cleanup does not throw', () => {
    const root = makeTempRoot();
    const state = syncAgentProfiles(root, 'solo');

    cleanupAgentProfiles(state);
    expect(() => cleanupAgentProfiles(state)).not.toThrow();
  });

  it('handles mixed pre-existing and fresh files', () => {
    const root = makeTempRoot();
    const agentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    // Only pluni has a pre-existing file
    const pluniFile = getAgentFileName('pluni');
    const pluniOriginal = '# Pre-existing Pluni';
    fs.writeFileSync(path.join(agentsDir, pluniFile), pluniOriginal, 'utf-8');

    const state = syncAgentProfiles(root, 'solo');
    cleanupAgentProfiles(state);

    // pluni should be restored
    expect(fs.readFileSync(path.join(agentsDir, pluniFile), 'utf-8')).toBe(pluniOriginal);

    // kotone and sophia should be deleted
    expect(fs.existsSync(path.join(agentsDir, getAgentFileName('kotone')))).toBe(false);
    expect(fs.existsSync(path.join(agentsDir, getAgentFileName('sophia')))).toBe(false);
  });
});

describe('cleanupAgentProfiles — null originalContent guard', () => {
  it('does not crash when hadExistingFile is true but originalContent is null', () => {
    const root = makeTempRoot();
    const agentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const filePath = path.join(agentsDir, 'pluni.agent.md');
    fs.writeFileSync(filePath, 'current content', 'utf-8');

    // Simulate corrupted state: hadExistingFile=true but originalContent=null
    const corruptedState: AgentProfileState = {
      entries: [
        {
          advisorId: 'pluni',
          filePath,
          hadExistingFile: true,
          originalContent: null, // inconsistent with hadExistingFile
          legacyFilePath: null,
          legacyOriginalContent: null,
        },
      ],
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Should not throw
    expect(() => cleanupAgentProfiles(corruptedState)).not.toThrow();

    // The file should be left as-is (not written with "null" or corrupted)
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toBe('current content');

    // Should NOT have logged a warning (the guard prevents the error path entirely)
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// ── Stale file tracking ────────────────────────────────────────────

describe('syncAgentProfiles — stale file tracking', () => {
  it('re-sync preserves original backups from first sync', () => {
    const root = makeTempRoot();
    const agentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const pluniFile = getAgentFileName('pluni');
    const originalContent = '# User pluni file';
    fs.writeFileSync(path.join(agentsDir, pluniFile), originalContent, 'utf-8');

    const state1 = syncAgentProfiles(root, 'solo');
    const state2 = syncAgentProfiles(root, 'multi-char', state1);

    // After cleanup of re-synced state, originals should be restored
    cleanupAgentProfiles(state2);

    expect(fs.readFileSync(path.join(agentsDir, pluniFile), 'utf-8')).toBe(originalContent);
    expect(fs.existsSync(path.join(agentsDir, getAgentFileName('kotone')))).toBe(false);
  });
});

// ── Legacy file migration ──────────────────────────────────────────

describe('syncAgentProfiles — legacy migration', () => {
  it('removes legacy .md files during sync', () => {
    const root = makeTempRoot();
    const agentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    // Create legacy files
    for (const id of ADVISOR_IDS) {
      fs.writeFileSync(path.join(agentsDir, `${id}.md`), `# Legacy ${id}`, 'utf-8');
    }

    syncAgentProfiles(root, 'solo');

    for (const id of ADVISOR_IDS) {
      // Legacy file should be removed
      expect(fs.existsSync(path.join(agentsDir, `${id}.md`))).toBe(false);
      // Canonical file should exist
      expect(fs.existsSync(path.join(agentsDir, getAgentFileName(id)))).toBe(true);
    }
  });

  it('restores legacy .md files on cleanup if they preexisted', () => {
    const root = makeTempRoot();
    const agentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const legacyContent = '# User legacy pluni';
    const legacyPath = path.join(agentsDir, 'pluni.md');
    fs.writeFileSync(legacyPath, legacyContent, 'utf-8');

    const state = syncAgentProfiles(root, 'solo');
    cleanupAgentProfiles(state);

    // Legacy file should be restored
    expect(fs.readFileSync(legacyPath, 'utf-8')).toBe(legacyContent);
    // Canonical file should be deleted (was created fresh)
    expect(fs.existsSync(path.join(agentsDir, getAgentFileName('pluni')))).toBe(false);
  });

  it('no stale legacy files for fresh sessions', () => {
    const root = makeTempRoot();
    syncAgentProfiles(root, 'solo');

    for (const id of ADVISOR_IDS) {
      expect(fs.existsSync(path.join(root, '.github', 'agents', `${id}.md`))).toBe(false);
    }
  });

  it('re-sync preserves legacy backups from first sync', () => {
    const root = makeTempRoot();
    const agentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const legacyContent = '# User legacy kotone';
    fs.writeFileSync(path.join(agentsDir, 'kotone.md'), legacyContent, 'utf-8');

    const state1 = syncAgentProfiles(root, 'solo');
    const state2 = syncAgentProfiles(root, 'world-sim', state1);

    cleanupAgentProfiles(state2);

    // Legacy file should still be restored after re-sync + cleanup
    expect(fs.readFileSync(path.join(agentsDir, 'kotone.md'), 'utf-8')).toBe(legacyContent);
    // Canonical file should be deleted
    expect(fs.existsSync(path.join(agentsDir, getAgentFileName('kotone')))).toBe(false);
  });

  it('handles both canonical and legacy pre-existing files', () => {
    const root = makeTempRoot();
    const agentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const canonicalContent = '# User canonical pluni';
    const legacyContent = '# User legacy pluni';
    fs.writeFileSync(path.join(agentsDir, getAgentFileName('pluni')), canonicalContent, 'utf-8');
    fs.writeFileSync(path.join(agentsDir, 'pluni.md'), legacyContent, 'utf-8');

    const state = syncAgentProfiles(root, 'solo');
    cleanupAgentProfiles(state);

    // Both should be restored
    expect(fs.readFileSync(path.join(agentsDir, getAgentFileName('pluni')), 'utf-8')).toBe(canonicalContent);
    expect(fs.readFileSync(path.join(agentsDir, 'pluni.md'), 'utf-8')).toBe(legacyContent);
  });
});
