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
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
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

function normalizeWorkflowMirrorMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\]\(\.\.\/\.\.\/docs\/([^)]+)\)/g, (_match, file) => `](${file})`)
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Skills ↔ Taxonomy alignment
// ────────────────────────────────────────────────────────────────────────────

describe('skills ↔ taxonomy alignment', () => {
  const skills = getSkillEntries();
  const taxonomySet = new Set(ALL_TOOL_NAMES);

  it('finds at least 10 skills (sanity check)', () => {
    expect(skills.length).toBeGreaterThanOrEqual(10);
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

  it('MODULE_MAP covers at least 80 modules (sanity check)', () => {
    const libOnlyPaths = mapPaths.filter((p) => p.startsWith('src/lib/'));
    expect(libOnlyPaths.length).toBeGreaterThanOrEqual(80);
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
    'actual_hash',
    'dry_run',
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
// 5. Workflow doc mirror sync
// ────────────────────────────────────────────────────────────────────────────

describe('workflow doc mirrors stay in sync', () => {
  const docsWorkflowPath = path.join(DOCS_DIR, 'MCP_WORKFLOW.md');
  const skillWorkflowPath = path.join(ROOT, 'skills', 'project-workflow', 'MCP_WORKFLOW.md');

  it('skills/project-workflow/MCP_WORKFLOW.md matches docs/MCP_WORKFLOW.md after link normalization', () => {
    expect(fs.existsSync(docsWorkflowPath), 'Missing docs/MCP_WORKFLOW.md').toBe(true);
    expect(fs.existsSync(skillWorkflowPath), 'Missing skills/project-workflow/MCP_WORKFLOW.md').toBe(true);

    const docsContent = normalizeWorkflowMirrorMarkdown(fs.readFileSync(docsWorkflowPath, 'utf-8'));
    const skillContent = normalizeWorkflowMirrorMarkdown(fs.readFileSync(skillWorkflowPath, 'utf-8'));
    expect(skillContent).toEqual(docsContent);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. (removed — docs/superpowers/ was deleted as a historical artifact)
// ────────────────────────────────────────────────────────────────────────────
