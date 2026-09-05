// @vitest-environment node
/**
 * Doc-drift guards — mechanical tests that keep docs, skills, taxonomy
 * references, and MODULE_MAP aligned with the actual codebase.
 *
 * These tests catch silent documentation rot by cross-referencing:
 *   1. Skill frontmatter `related_tools` against the tool taxonomy
 *   2. Skill directory names against frontmatter `name` fields
 *   3. MODULE_MAP.md module listings against actual src/lib/*.ts files
 *   4. MCP_TOOL_SURFACE.md tool references against the taxonomy
 *   5. FAMILY_NEXT_ACTIONS tool references against the taxonomy
 *   6. Canonical architecture entrypoints against the current single-renderer runtime
 *   7. Contributor validation guidance against CI contract gates
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'node:module';
import { resolveSkillRootDirs } from './content-roots';
import { ALL_TOOL_NAMES, TOOL_FAMILIES } from './mcp-tool-taxonomy';
import { FAMILY_NEXT_ACTIONS } from './mcp-response-envelope';
import { FACADE_V1_FUTURE_TOOL_NAMES, FACADE_V1_TOOL_NAMES } from './mcp-request-schemas';
import { listSkillCatalogEntries } from './skill-catalog';

const ROOT = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(ROOT, 'docs');

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Parse YAML frontmatter from a SKILL.md file (lightweight, no external deps). */
function parseSkillFrontmatter(filePath: string): Record<string, unknown> {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result: Record<string, unknown> = {};

  for (const line of yaml.split('\n')) {
    const kvMatch = line.match(/^(\w[\w_-]*)\s*:\s*(.+)$/);
    if (!kvMatch) continue;
    const [, key, rawValue] = kvMatch;
    const trimmed = rawValue.trim();

    // Handle inline JSON arrays: ['a', 'b'] or ["a", "b"]
    if (trimmed.startsWith('[')) {
      try {
        // Normalize single quotes to double quotes for JSON.parse
        result[key] = JSON.parse(trimmed.replace(/'/g, '"'));
      } catch {
        result[key] = trimmed;
      }
    } else {
      // Strip surrounding quotes
      result[key] = trimmed.replace(/^['"]|['"]$/g, '');
    }
  }
  return result;
}

/** Get all skill directories that contain SKILL.md. */
function getSkillEntries(): {
  dir: string;
  name: string;
  frontmatter: Record<string, unknown>;
  rootRelativePath: string;
}[] {
  return listSkillCatalogEntries(resolveSkillRootDirs(ROOT)).map((entry) => ({
    dir: entry.name,
    name: entry.name,
    frontmatter: parseSkillFrontmatter(path.join(entry.dirPath, 'SKILL.md')),
    rootRelativePath: entry.rootRelativePath,
  }));
}

/** Extract src/lib module paths referenced in MODULE_MAP.md. */
function extractModuleMapPaths(): string[] {
  const mapPath = path.join(DOCS_DIR, 'MODULE_MAP.md');
  if (!fs.existsSync(mapPath)) return [];
  const content = fs.readFileSync(mapPath, 'utf-8');
  // Match backtick-wrapped src/lib/ paths like `src/lib/foo.ts`
  const matches = content.matchAll(/`(src\/lib\/[\w-]+\.ts)`/g);
  return [...matches].map((m) => m[1]);
}

/** Extract all tool names mentioned in MCP_TOOL_SURFACE.md. */
function extractToolSurfaceToolNames(): string[] {
  const surfacePath = path.join(DOCS_DIR, 'MCP_TOOL_SURFACE.md');
  if (!fs.existsSync(surfacePath)) return [];
  const content = fs.readFileSync(surfacePath, 'utf-8');
  // Tool names appear in backtick-wrapped form: `tool_name`
  const matches = content.matchAll(/`(\w+)`/g);
  const allNames = new Set<string>();
  const taxonomySet = new Set(ALL_TOOL_NAMES);
  for (const m of matches) {
    // Only include names that look like tool names (contain underscore or match known tools)
    if (taxonomySet.has(m[1]) || m[1].includes('_')) {
      allNames.add(m[1]);
    }
  }
  return [...allNames];
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Skills ↔ Taxonomy alignment
// ────────────────────────────────────────────────────────────────────────────

describe('skills ↔ taxonomy alignment', () => {
  const skills = getSkillEntries();
  const taxonomySet = new Set(ALL_TOOL_NAMES);

  it('discovers skills (sanity check)', () => {
    expect(skills.length).toBeGreaterThan(0);
  });

  it('every skill related_tools entry is a real taxonomy tool', () => {
    const mismatches: string[] = [];
    for (const skill of skills) {
      const relatedTools = skill.frontmatter['related_tools'];
      if (!Array.isArray(relatedTools)) continue;
      for (const tool of relatedTools) {
        if (!taxonomySet.has(tool)) {
          mismatches.push(`${skill.dir}: "${tool}" not in TOOL_TAXONOMY`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('skill directory name matches frontmatter name', () => {
    const mismatches: string[] = [];
    for (const skill of skills) {
      const fmName = skill.frontmatter['name'];
      if (fmName && fmName !== skill.dir) {
        mismatches.push(`dir="${skill.dir}" vs name="${fmName}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('every skill has required frontmatter fields (name, description)', () => {
    const missing: string[] = [];
    for (const skill of skills) {
      if (!skill.frontmatter['name']) missing.push(`${skill.dir}: missing "name"`);
      if (!skill.frontmatter['description']) missing.push(`${skill.dir}: missing "description"`);
    }
    expect(missing).toEqual([]);
  });

  it('skill README indexes reference real directories in their own root', () => {
    const missing: string[] = [];

    for (const skillRoot of resolveSkillRootDirs(ROOT)) {
      const readmePath = path.join(skillRoot.absolutePath, 'README.md');
      if (!fs.existsSync(readmePath)) continue;

      const content = fs.readFileSync(readmePath, 'utf-8');
      const linkMatches = content.matchAll(/\[[\w-]+\]\(([\w-]+)\/?\)/g);
      const referencedDirs = [...linkMatches].map((m) => m[1]);
      const actualDirs = new Set(
        fs.readdirSync(skillRoot.absolutePath).filter((entry) => {
          const dirPath = path.join(skillRoot.absolutePath, entry);
          return fs.statSync(dirPath).isDirectory() && fs.existsSync(path.join(dirPath, 'SKILL.md'));
        }),
      );

      for (const referencedDir of referencedDirs) {
        if (!actualDirs.has(referencedDir)) {
          missing.push(`${skillRoot.relativePath}: ${referencedDir}`);
        }
      }
    }

    expect(missing, 'Skill README index references nonexistent directories').toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. MODULE_MAP.md ↔ src/lib coverage
// ────────────────────────────────────────────────────────────────────────────

describe('MODULE_MAP ↔ src/lib coverage', () => {
  const libDir = path.join(ROOT, 'src', 'lib');
  const actualModules = fs
    .readdirSync(libDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .map((f) => `src/lib/${f}`)
    .sort();

  const mapPaths = extractModuleMapPaths();
  const mapPathSet = new Set(mapPaths);

  it('MODULE_MAP has no phantom modules (listed but nonexistent)', () => {
    const libPathsOnDisk = new Set(actualModules);
    // Also check non-lib paths that MODULE_MAP may reference
    const phantoms = mapPaths.filter((p) => p.startsWith('src/lib/') && !libPathsOnDisk.has(p));
    expect(phantoms).toEqual([]);
  });

  it('every src/lib module is listed in MODULE_MAP', () => {
    const uncovered = actualModules.filter((mod) => !mapPathSet.has(mod));
    expect(uncovered, 'src/lib modules not covered by MODULE_MAP.md').toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. MCP_TOOL_SURFACE.md ↔ taxonomy alignment
// ────────────────────────────────────────────────────────────────────────────

describe('MCP_TOOL_SURFACE.md ↔ taxonomy alignment', () => {
  const taxonomySet = new Set(ALL_TOOL_NAMES);
  const declaredFacadeNames = new Set<string>([...FACADE_V1_TOOL_NAMES, ...FACADE_V1_FUTURE_TOOL_NAMES]);
  const surfaceToolNames = extractToolSurfaceToolNames();
  const surfacePath = path.join(DOCS_DIR, 'MCP_TOOL_SURFACE.md');
  const errorContractPath = path.join(DOCS_DIR, 'MCP_ERROR_CONTRACT.md');

  // Known non-tool backtick tokens that appear in MCP_TOOL_SURFACE.md
  // (file paths, envelope function names, field names, etc.)
  const KNOWN_NON_TOOLS = new Set([
    'artifacts',
    'byte_size',
    'next_actions',
    'next_cursor',
    'source_path',
    'expected_source_hash',
    'success',
    'error',
    'data',
    'mcpSuccess',
    'mcpError',
    'mcpNoOp',
    'mcp_session',
    'mcp_read',
    'mcp_edit',
    'artifacts.byte_size',
    '_meta',
    'file_path',
    'reference_id',
    'preview_token',
    'operation_digest',
    'required_guards',
    'expected_comment',
    'expected_comments',
    'expected_preview',
    'expected_previews',
    'expected_type',
    'expected_types',
    'expected_hash',
    'expected_content_hash',
    'actual_hash',
    'expected_path',
    'expected_asset_collection_digest',
    'expected_prompt_items_digest',
    'expected_snippet_updated_at',
    'expected_item_collection_digest',
    'expected_lorebook_collection_digest',
    'expected_file_state_digest',
    'expected_active_file_path',
    'expected_output_state_digest',
    'expected_source_state_digest',
    'expected_project_tree_digest',
    'dry_run',
    'compress_assets',
    'RISUTOKI_MCP_TOOL_PROFILE',
    'replace_text',
    'field_stats',
    'token_count',
    'simulate_lorebook',
    'test_regex',
    'verify_risup_prompt_import',
    'max_matches',
    'applied_count',
    'failed_operation',
    'remaining_count',
    'retry_mode',
    'omitted_count',
  ]);

  it('every tool name in MCP_TOOL_SURFACE.md exists in taxonomy', () => {
    const orphans = surfaceToolNames.filter(
      (name) =>
        !taxonomySet.has(name) && !declaredFacadeNames.has(name) && !KNOWN_NON_TOOLS.has(name) && name.includes('_'),
    );
    expect(orphans, 'MCP_TOOL_SURFACE.md references tools not in TOOL_TAXONOMY').toEqual([]);
  });

  it('core MCP contract docs exist', () => {
    expect(fs.existsSync(surfacePath), 'Missing docs/MCP_TOOL_SURFACE.md').toBe(true);
    expect(fs.existsSync(errorContractPath), 'Missing docs/MCP_ERROR_CONTRACT.md').toBe(true);
  });

  it('every taxonomy family has a section in MCP_TOOL_SURFACE.md', () => {
    const content = fs.readFileSync(surfacePath, 'utf-8');
    const undocumented: string[] = [];
    for (const family of TOOL_FAMILIES) {
      // Family sections use ### `family-name` headers
      if (!content.includes(`\`${family}\``) && !content.includes(`### ${family}`)) {
        undocumented.push(family);
      }
    }
    expect(undocumented, 'taxonomy families not documented in MCP_TOOL_SURFACE.md').toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. FAMILY_NEXT_ACTIONS ↔ taxonomy alignment
// ────────────────────────────────────────────────────────────────────────────

describe('FAMILY_NEXT_ACTIONS ↔ taxonomy alignment', () => {
  const taxonomySet = new Set(ALL_TOOL_NAMES);

  it('every tool in FAMILY_NEXT_ACTIONS exists in TOOL_TAXONOMY', () => {
    const phantoms: string[] = [];
    for (const [family, tools] of Object.entries(FAMILY_NEXT_ACTIONS)) {
      for (const tool of tools) {
        if (!taxonomySet.has(tool)) {
          phantoms.push(`${family}: "${tool}" not in TOOL_TAXONOMY`);
        }
      }
    }
    expect(phantoms).toEqual([]);
  });

  it('FAMILY_NEXT_ACTIONS covers every TOOL_FAMILIES entry', () => {
    const actionFamilies = new Set(Object.keys(FAMILY_NEXT_ACTIONS));
    const missing = TOOL_FAMILIES.filter((f) => !actionFamilies.has(f));
    expect(missing, 'families without FAMILY_NEXT_ACTIONS entries').toEqual([]);
  });

  it('FAMILY_NEXT_ACTIONS has no extra families beyond TOOL_FAMILIES', () => {
    const familySet = new Set<string>(TOOL_FAMILIES);
    const extra = Object.keys(FAMILY_NEXT_ACTIONS).filter((f) => !familySet.has(f));
    expect(extra, 'FAMILY_NEXT_ACTIONS contains families not in TOOL_FAMILIES').toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Agent guidance ownership and startup budget
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Bundled project guide (risu/common/docs/CLAUDE.md)
// ────────────────────────────────────────────────────────────────────────────

describe('bundled project guide stays facade-first', () => {
  const guidePath = path.join(ROOT, 'risu', 'common', 'docs', 'CLAUDE.md');
  const guide = fs.readFileSync(guidePath, 'utf-8');

  it('teaches the default facade workflow and the skill bootstrap tools', () => {
    for (const tool of [
      'inspect_document',
      'read_content',
      'preview_edit',
      'apply_edit',
      'validate_content',
      'list_skills',
      'read_skill',
    ]) {
      expect(guide, tool).toContain(`\`${tool}\``);
    }
    expect(guide).toContain('"kind": "guidance"');
    expect(guide).toContain('"guide"');
  });

  it('does not present granular tools as the primary workflow', () => {
    // Tool tables and call-style instructions for granular tools were the legacy failure mode.
    expect(guide).not.toMatch(
      /\|\s*`(?:list|read|write|add|delete|replace_in|insert_in)_(?:lua|css|field|fields|lorebook|regex)`/u,
    );
    expect(guide).not.toMatch(/(?:read|write)_field\(/u);
  });

  it('names only skills that exist in the catalog', () => {
    const catalog = new Set(getSkillEntries().map((entry) => entry.name));
    const named = [
      ...guide.matchAll(/`((?:authoring|writing|prompt-family|file-structure|using-mcp)[a-z0-9-]*)`/gu),
    ].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((name) => !catalog.has(name))).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. Canonical architecture and contributor workflow
// ────────────────────────────────────────────────────────────────────────────

describe('canonical architecture and contributor workflow stay current', () => {
  const architecturePath = path.join(DOCS_DIR, 'analysis', 'ARCHITECTURE.md');
  const contributingPath = path.join(ROOT, 'CONTRIBUTING.md');
  const ciPath = path.join(ROOT, '.github', 'workflows', 'ci.yml');

  it('documents the current single-renderer runtime and existing entrypoints', () => {
    const architecture = fs.readFileSync(architecturePath, 'utf-8');
    const requiredEntrypoints = [
      { docReference: 'main.ts', filePath: 'main.ts' },
      { docReference: 'preload.ts', filePath: 'preload.ts' },
      { docReference: 'src/main.ts', filePath: 'src/main.ts' },
      { docReference: 'src/app/controller.ts', filePath: 'src/app/controller.ts' },
      { docReference: 'toki-mcp-server.ts', filePath: 'toki-mcp-server.ts' },
      { docReference: 'src/lib/mcp-api-server.ts', filePath: 'src/lib/mcp-api-server.ts' },
      { docReference: 'mcp-tool-register-facade.ts', filePath: 'src/lib/mcp-tool-register-facade.ts' },
      { docReference: 'mcp-facade-edit.ts', filePath: 'src/lib/mcp-facade-edit.ts' },
    ];

    expect(architecture).toContain('one main process, one Vue renderer, one preload bridge');
    for (const entrypoint of requiredEntrypoints) {
      expect(architecture, `ARCHITECTURE.md must document ${entrypoint.docReference}`).toContain(
        entrypoint.docReference,
      );
      expect(fs.existsSync(path.join(ROOT, entrypoint.filePath)), `${entrypoint.filePath} must exist`).toBe(true);
    }
  });

  it('does not reference removed pop-out runtime files or volatile line-count snapshots', () => {
    const architecture = fs.readFileSync(architecturePath, 'utf-8');
    const removedRuntimePaths = [
      'popout-preload.ts',
      'src/popout.ts',
      'src/popout/controller.ts',
      'src/lib/popout-manager.ts',
      'window.popoutAPI',
    ];

    for (const removedPath of removedRuntimePaths) {
      expect(architecture, `ARCHITECTURE.md references removed runtime path ${removedPath}`).not.toContain(removedPath);
    }
    expect(architecture).not.toMatch(/~\d[\d,]* lines/i);
  });

  it('keeps contributor validation and CI aligned on replay, contracts, and platform builds', () => {
    const contributing = fs.readFileSync(contributingPath, 'utf-8');
    const ci = fs.readFileSync(ciPath, 'utf-8');
    const require = createRequire(path.join(ROOT, 'package.json'));
    const { createPlan } = require('./build/validation-plan.js') as {
      createPlan: (options: { profile: string }) => { steps: { id: string }[] };
    };
    const ciSteps = createPlan({ profile: 'ci' }).steps.map((step) => step.id);
    const windowsSteps = createPlan({ profile: 'windows' }).steps.map((step) => step.id);
    for (const step of [
      'lint',
      'typecheck-vue',
      'typecheck-electron',
      'typecheck-node',
      'unit',
      'tooling-tests',
      'rpack',
      'charx',
      'references',
      'mcp-tests',
      'replay',
      'contracts',
      'renderer',
    ]) {
      expect(ciSteps, `CI profile must include ${step}`).toContain(step);
    }
    expect(windowsSteps).toEqual(expect.arrayContaining(['electron', 'renderer']));
    expect(ci).toContain('npm run validate:ci');
    expect(ci).toContain('npm run validate -- --profile windows');
    expect(contributing).toContain('npm run validate:full');
    expect(contributing).toContain('.build/validation/');
    expect(ci.match(/if: always\(\)/g)).toHaveLength(2);
    expect(ci.match(/include-hidden-files: true/g)).toHaveLength(2);
    expect(ci).toContain('.build/validation/**/report.json');
    expect(contributing).not.toContain('Popout terminal');
  });
});
