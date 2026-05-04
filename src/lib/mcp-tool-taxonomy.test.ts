// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  TOOL_TAXONOMY,
  TOOL_FAMILIES,
  ALL_TOOL_NAMES,
  DRY_RUN_TOOL_NAMES,
  NO_CONFIRMATION_TOOL_NAMES,
  TOOL_META_KEYS,
  TOOL_RECOMMENDATIONS,
  TOOL_STALE_GUARD_DETAILS,
  TOOL_SURFACE_PROFILE_ALIASES,
  TOOL_SURFACE_PROFILE_CONTRACTS,
  TOOL_SURFACE_PROFILE_NAMES,
  TOOL_SURFACE_KINDS,
  TOOL_WORKFLOW_STAGES,
  DEFAULT_TOOL_SURFACE_PROFILE,
  buildToolSurfaceProfileCatalog,
  getToolProfilesForTool,
  getToolSurfaceProfileContract,
  getToolWorkflowStages,
  listToolsForSurfaceProfile,
  resolveToolSurfaceProfileName,
  getToolFamily,
  getToolAnnotations,
  getToolMeta,
  getToolMutationMeta,
  getToolsByFamily,
} from './mcp-tool-taxonomy';
import type { StaleGuardDetail } from './mcp-tool-taxonomy';
import { FAMILY_NEXT_ACTIONS } from './mcp-response-envelope';

// ────────────────────────────────────────────────────────────────────────────
// Extract tool names from toki-mcp-server.ts source
// ────────────────────────────────────────────────────────────────────────────

function extractRegisteredToolNames(): string[] {
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../../toki-mcp-server.ts'), 'utf-8');
  const matches = serverSrc.matchAll(/server\.tool\(\s*'([^']+)'/g);
  return [...matches].map((m) => m[1]).sort();
}

function extractRegisteredToolBlocks(): Map<string, string> {
  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../../toki-mcp-server.ts'), 'utf-8');
  const matches = [...serverSrc.matchAll(/server\.tool\(\s*'([^']+)'/g)];
  const blocks = new Map<string, string>();
  for (let i = 0; i < matches.length; i += 1) {
    const name = matches[i][1];
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? serverSrc.length) : serverSrc.length;
    blocks.set(name, serverSrc.slice(start, end));
  }
  return blocks;
}

const registeredTools = extractRegisteredToolNames();
const registeredToolBlocks = extractRegisteredToolBlocks();
const noConfirmationToolSet = new Set<string>(NO_CONFIRMATION_TOOL_NAMES);
const dryRunToolSet = new Set<string>(DRY_RUN_TOOL_NAMES);

type BaselineMetricName =
  | 'tool-list-byte-cost'
  | 'tool-call-count'
  | 'wrong-tool-avoidance'
  | 'dry-run-compliance'
  | 'stale-recovery'
  | 'final-artifact-equality';

interface FacadeBaselineScenario {
  id: string;
  proposedFacadeTool: 'mcp_read' | 'mcp_edit' | 'mcp_session';
  currentGranularWorkflow: readonly string[];
  expectedFacadeWorkflow: readonly string[];
  currentToolCallCount: number;
  expectedFacadeToolCallCount: number;
  metrics: readonly BaselineMetricName[];
  wrongToolAvoidance: readonly string[];
  dryRunRequired?: boolean;
  staleRecoveryRequired?: boolean;
  finalArtifactEquality?: string;
}

const PROPOSED_FACADE_TOOL_FIXTURE = [
  { name: 'mcp_session', purpose: 'Summarize session/no-file-open state and route open/recovery choices.' },
  { name: 'mcp_read', purpose: 'Read active, external, and reference targets through one routed facade.' },
  { name: 'mcp_edit', purpose: 'Plan, dry-run, guard, apply, and verify active/external mutations.' },
] as const;

const FACADE_BASELINE_SCENARIOS: readonly FacadeBaselineScenario[] = [
  {
    id: 'active-external-reference-routing',
    proposedFacadeTool: 'mcp_read',
    currentGranularWorkflow: [
      'session_status',
      'read_field',
      'inspect_external_file',
      'external_search_in_field',
      'list_references',
      'read_reference_field',
    ],
    expectedFacadeWorkflow: ['mcp_session', 'mcp_read:active', 'mcp_read:external', 'mcp_read:reference'],
    currentToolCallCount: 6,
    expectedFacadeToolCallCount: 4,
    metrics: ['tool-list-byte-cost', 'tool-call-count', 'wrong-tool-avoidance', 'final-artifact-equality'],
    wrongToolAvoidance: ['external tools must not target the active document', 'reference tools must stay read-only'],
    finalArtifactEquality: 'active/external/reference reads return the same target text as granular routes',
  },
  {
    id: 'batch-vs-single-edit-choice',
    proposedFacadeTool: 'mcp_edit',
    currentGranularWorkflow: ['list_lorebook', 'replace_in_lorebook_batch', 'read_lorebook_batch'],
    expectedFacadeWorkflow: ['mcp_edit:plan-batch', 'mcp_edit:apply-batch', 'mcp_read:verify-batch'],
    currentToolCallCount: 3,
    expectedFacadeToolCallCount: 3,
    metrics: ['tool-call-count', 'wrong-tool-avoidance', 'final-artifact-equality'],
    wrongToolAvoidance: ['choose replace_in_lorebook_batch instead of looping replace_in_lorebook'],
    finalArtifactEquality: 'batched replacements equal the per-entry final lorebook content',
  },
  {
    id: 'stale-guard-refresh-retry',
    proposedFacadeTool: 'mcp_edit',
    currentGranularWorkflow: ['list_lua', 'write_lua:409', 'read_lua', 'write_lua:retry', 'read_lua:verify'],
    expectedFacadeWorkflow: ['mcp_edit:guarded-write', 'mcp_edit:auto-refresh-retry', 'mcp_read:verify'],
    currentToolCallCount: 5,
    expectedFacadeToolCallCount: 3,
    metrics: ['tool-call-count', 'stale-recovery', 'final-artifact-equality'],
    wrongToolAvoidance: ['refresh with staleGuardDetails sourceOperations before retrying'],
    staleRecoveryRequired: true,
    finalArtifactEquality: 'retry uses refreshed expected_hash and writes only the intended section',
  },
  {
    id: 'dry-run-first-destructive-edit',
    proposedFacadeTool: 'mcp_edit',
    currentGranularWorkflow: [
      'list_charx_assets',
      'compress_assets_webp:dry_run',
      'compress_assets_webp:apply',
      'list_charx_assets:verify',
    ],
    expectedFacadeWorkflow: ['mcp_edit:preview-required', 'mcp_edit:apply-after-preview', 'mcp_read:verify'],
    currentToolCallCount: 4,
    expectedFacadeToolCallCount: 3,
    metrics: ['tool-call-count', 'dry-run-compliance', 'final-artifact-equality'],
    wrongToolAvoidance: ['do not apply lossy asset compression before dry_run preview'],
    dryRunRequired: true,
    finalArtifactEquality:
      'dry-run leaves assets unchanged; committed compression matches the previewed final artifact',
  },
  {
    id: 'no-file-open-workflow',
    proposedFacadeTool: 'mcp_session',
    currentGranularWorkflow: ['session_status', 'list_references', 'open_file', 'list_fields'],
    expectedFacadeWorkflow: ['mcp_session:no-file-open', 'mcp_read:references', 'mcp_session:open-file'],
    currentToolCallCount: 4,
    expectedFacadeToolCallCount: 3,
    metrics: ['tool-call-count', 'wrong-tool-avoidance', 'final-artifact-equality'],
    wrongToolAvoidance: ['avoid active-document reads until open_file succeeds'],
    finalArtifactEquality: 'post-open active reads match the opened artifact',
  },
];

function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf-8');
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('MCP Tool Taxonomy', () => {
  // ── Completeness ──────────────────────────────────────────────────────

  it('covers every tool registered in toki-mcp-server.ts (no orphans)', () => {
    const taxonomyNames = new Set(ALL_TOOL_NAMES);
    const orphans = registeredTools.filter((name) => !taxonomyNames.has(name));
    expect(orphans).toEqual([]);
  });

  it('contains no phantom tools absent from toki-mcp-server.ts', () => {
    const registeredSet = new Set(registeredTools);
    const phantoms = ALL_TOOL_NAMES.filter((name) => !registeredSet.has(name));
    expect(phantoms).toEqual([]);
  });

  it('has at least 100 tools (sanity check against extraction failure)', () => {
    expect(registeredTools.length).toBeGreaterThanOrEqual(100);
    expect(ALL_TOOL_NAMES.length).toBeGreaterThanOrEqual(100);
  });

  // ── Family coverage ───────────────────────────────────────────────────

  it('assigns every tool to a valid family', () => {
    const validFamilies = new Set<string>(TOOL_FAMILIES);
    for (const [name, entry] of Object.entries(TOOL_TAXONOMY)) {
      expect(validFamilies.has(entry.family), `${name} has invalid family '${entry.family}'`).toBe(true);
    }
  });

  it('every declared family has at least one tool', () => {
    const byFamily = getToolsByFamily();
    for (const family of TOOL_FAMILIES) {
      expect(byFamily[family].length, `family '${family}' is empty`).toBeGreaterThan(0);
    }
  });

  // ── Naming convention alignment ────────────────────────────────────────

  it('probe_* tools belong to the probe family', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.startsWith('probe_')) {
        expect(getToolFamily(name), `${name} should be in probe family`).toBe('probe');
      }
    }
  });

  it('*_reference_* tools belong to the reference family', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.includes('reference')) {
        expect(getToolFamily(name), `${name} should be in reference family`).toBe('reference');
      }
    }
  });

  it('*_cbs* tools belong to the cbs family', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.includes('cbs')) {
        expect(getToolFamily(name), `${name} should be in cbs family`).toBe('cbs');
      }
    }
  });

  it('*_danbooru* / tag_db_status tools belong to the danbooru family', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.includes('danbooru') || name === 'tag_db_status') {
        expect(getToolFamily(name), `${name} should be in danbooru family`).toBe('danbooru');
      }
    }
  });

  // ── Behavior hint consistency ──────────────────────────────────────────

  it('read-only tools never have destructiveHint=true', () => {
    for (const [name, entry] of Object.entries(TOOL_TAXONOMY)) {
      if (entry.hints.readOnlyHint === true) {
        expect(entry.hints.destructiveHint, `${name}: readOnly tool must not be destructive`).not.toBe(true);
      }
    }
  });

  it('destructive tools always have readOnlyHint=false or undefined', () => {
    for (const [name, entry] of Object.entries(TOOL_TAXONOMY)) {
      if (entry.hints.destructiveHint === true) {
        expect(entry.hints.readOnlyHint, `${name}: destructive tool must not be readOnly`).not.toBe(true);
      }
    }
  });

  it('reference family tools are all read-only', () => {
    const byFamily = getToolsByFamily();
    for (const name of byFamily['reference']) {
      const hints = getToolAnnotations(name);
      expect(hints?.readOnlyHint, `${name} in reference family should be readOnly`).toBe(true);
    }
  });

  it('cbs family tools are all read-only (no side effects)', () => {
    const byFamily = getToolsByFamily();
    for (const name of byFamily['cbs']) {
      const hints = getToolAnnotations(name);
      expect(hints?.readOnlyHint, `${name} in cbs family should be readOnly`).toBe(true);
    }
  });

  it('delete_* tools have destructiveHint=true', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.startsWith('delete_') || name.startsWith('batch_delete_')) {
        const hints = getToolAnnotations(name);
        expect(hints?.destructiveHint, `${name} should have destructiveHint=true`).toBe(true);
      }
    }
  });

  it('compress_assets_webp is destructive (lossy, irreversible compression)', () => {
    const hints = getToolAnnotations('compress_assets_webp');
    expect(hints?.destructiveHint).toBe(true);
    expect(hints?.readOnlyHint).not.toBe(true);
  });

  it('list_* tools are read-only', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.startsWith('list_')) {
        const hints = getToolAnnotations(name);
        expect(hints?.readOnlyHint, `${name} should be readOnly`).toBe(true);
      }
    }
  });

  it('read_* tools are read-only', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (name.startsWith('read_')) {
        const hints = getToolAnnotations(name);
        expect(hints?.readOnlyHint, `${name} should be readOnly`).toBe(true);
      }
    }
  });

  it('read-only tools do not expose mutation metadata', () => {
    for (const name of ALL_TOOL_NAMES) {
      const hints = getToolAnnotations(name);
      if (hints?.readOnlyHint === true) {
        expect(getToolMutationMeta(name), `${name} should not expose mutation metadata`).toBeUndefined();
      }
    }
  });

  it('non-read-only tools expose confirmation metadata with only reviewed exceptions', () => {
    for (const name of ALL_TOOL_NAMES) {
      const hints = getToolAnnotations(name);
      if (hints?.readOnlyHint === true) continue;
      const meta = getToolMutationMeta(name);
      expect(meta, `${name} should expose mutation metadata`).toBeDefined();
      expect(meta?.requiresConfirmation, `${name} confirmation metadata mismatch`).toBe(
        !noConfirmationToolSet.has(name),
      );
    }
  });

  it('supportsDryRun metadata matches the reviewed tool list', () => {
    for (const name of ALL_TOOL_NAMES) {
      const hints = getToolAnnotations(name);
      const meta = getToolMutationMeta(name);
      if (hints?.readOnlyHint === true) {
        expect(meta, `${name} should not have dry-run metadata`).toBeUndefined();
        continue;
      }
      expect(meta?.supportsDryRun, `${name} dry-run metadata mismatch`).toBe(dryRunToolSet.has(name));
    }
  });

  it('tool metadata exposes family for read and write tools', () => {
    expect(getToolMeta('list_fields')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.family]: 'field',
        [TOOL_META_KEYS.staleGuards]: [],
        [TOOL_META_KEYS.staleGuardDetails]: [],
        [TOOL_META_KEYS.surfaceKind]: 'granular',
        [TOOL_META_KEYS.recommendation]: 'advanced',
        [TOOL_META_KEYS.workflowStages]: ['discover'],
      }),
    );
    expect(getToolMeta('write_lorebook')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.family]: 'lorebook',
        [TOOL_META_KEYS.workflowStages]: ['apply'],
        [TOOL_META_KEYS.requiresConfirmation]: true,
        [TOOL_META_KEYS.supportsDryRun]: false,
      }),
    );
  });

  it('tool metadata exposes stale guard parameter names', () => {
    expect(getToolMeta('write_lorebook')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.staleGuards]: ['expected_comment'],
      }),
    );
    expect(getToolMeta('patch_surface')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.staleGuards]: ['expected_hash'],
      }),
    );
    expect(getToolMeta('batch_delete_risup_prompt_items')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.staleGuards]: ['expected_types', 'expected_previews'],
      }),
    );
  });

  it('tool metadata classifies facade tools as preferred and granular tools as advanced', () => {
    expect(TOOL_SURFACE_KINDS).toEqual(['facade', 'granular']);
    expect(TOOL_RECOMMENDATIONS).toEqual(['preferred', 'advanced', 'legacy']);

    const facadeNames = new Set([
      'inspect_document',
      'list_tool_profiles',
      'read_content',
      'search_document',
      'preview_edit',
      'apply_edit',
      'validate_content',
      'load_guidance',
    ]);
    for (const name of ALL_TOOL_NAMES) {
      const meta = getToolMeta(name);
      expect(meta?.[TOOL_META_KEYS.surfaceKind], `${name} surface kind mismatch`).toBe(
        facadeNames.has(name) ? 'facade' : 'granular',
      );
      expect(meta?.[TOOL_META_KEYS.recommendation], `${name} recommendation mismatch`).toBe(
        facadeNames.has(name) ? 'preferred' : 'advanced',
      );
    }
  });

  it('defines the tool surface profile contract with the catalog facade instead of unsafe server filtering', () => {
    expect(TOOL_SURFACE_PROFILE_NAMES).toEqual(['facade-first', 'authoring', 'advanced-full', 'readonly']);
    expect(DEFAULT_TOOL_SURFACE_PROFILE).toBe('facade-first');
    expect(TOOL_SURFACE_PROFILE_ALIASES).toEqual({ advanced: 'advanced-full', full: 'advanced-full' });
    expect(resolveToolSurfaceProfileName(undefined)).toBe('facade-first');
    expect(resolveToolSurfaceProfileName('full')).toBe('advanced-full');
    expect(resolveToolSurfaceProfileName('ADVANCED')).toBe('advanced-full');
    expect(resolveToolSurfaceProfileName('unknown')).toBeUndefined();

    const contractsByName = new Map(TOOL_SURFACE_PROFILE_CONTRACTS.map((profile) => [profile.name, profile]));
    expect([...contractsByName.keys()]).toEqual(TOOL_SURFACE_PROFILE_NAMES);
    expect(contractsByName.get('facade-first')).toEqual(
      expect.objectContaining({
        default: true,
        filteringStatus: 'catalog-facade',
        legacyEscapeHatch: 'advanced-full',
      }),
    );
    expect(contractsByName.get('readonly')).toEqual(
      expect.objectContaining({
        readonly: true,
        filteringStatus: 'catalog-facade',
      }),
    );
    expect(getToolSurfaceProfileContract('advanced')).toBe(contractsByName.get('advanced-full'));
  });

  it('profile metadata keeps facade-first preferred and advanced-full as the granular escape hatch', () => {
    for (const name of [
      'inspect_document',
      'list_tool_profiles',
      'read_content',
      'search_document',
      'preview_edit',
      'apply_edit',
      'validate_content',
      'load_guidance',
    ]) {
      expect(getToolProfilesForTool(name), `${name} should be in facade-first`).toContain('facade-first');
      expect(getToolProfilesForTool(name), `${name} should remain available in advanced-full`).toContain(
        'advanced-full',
      );
    }

    expect(getToolProfilesForTool('write_lorebook')).toEqual(expect.arrayContaining(['authoring', 'advanced-full']));
    expect(getToolProfilesForTool('write_lorebook')).not.toContain('facade-first');
    expect(getToolProfilesForTool('write_lorebook')).not.toContain('readonly');

    for (const name of ALL_TOOL_NAMES) {
      expect(getToolProfilesForTool(name), `${name} should be available through advanced-full`).toContain(
        'advanced-full',
      );
    }
  });

  it('builds profile-specific catalogs while leaving advanced-full as the complete escape hatch', () => {
    const facadeCatalog = buildToolSurfaceProfileCatalog();
    expect(facadeCatalog).toEqual(
      expect.objectContaining({
        defaultProfile: 'facade-first',
        resolvedProfile: 'facade-first',
        filteringStatus: 'catalog-facade',
        toolsListBehavior: 'unfiltered-compatible',
        legacyEscapeHatch: 'advanced-full',
      }),
    );
    expect(facadeCatalog?.tools.map((tool) => tool.name)).toEqual(listToolsForSurfaceProfile('facade-first'));
    expect(facadeCatalog?.tools.map((tool) => tool.name)).toEqual([
      'apply_edit',
      'inspect_document',
      'list_tool_profiles',
      'load_guidance',
      'preview_edit',
      'read_content',
      'search_document',
      'validate_content',
    ]);
    expect(facadeCatalog?.counts.allTools).toBe(ALL_TOOL_NAMES.length);
    expect(facadeCatalog?.counts.hiddenFromToolsList).toBe(0);
    expect(facadeCatalog?.counts.profileTools).toBeLessThan(facadeCatalog?.counts.allTools ?? 0);

    const fullCatalog = buildToolSurfaceProfileCatalog('full');
    expect(fullCatalog?.resolvedProfile).toBe('advanced-full');
    expect(fullCatalog?.legacyEscapeHatch).toBe(false);
    expect(fullCatalog?.tools.map((tool) => tool.name)).toEqual(ALL_TOOL_NAMES);
    expect(listToolsForSurfaceProfile('unknown')).toEqual([]);
    expect(buildToolSurfaceProfileCatalog('unknown')).toBeUndefined();
  });

  it('readonly profile includes only readOnlyHint tools and excludes preview/apply mutations', () => {
    expect(getToolProfilesForTool('inspect_document')).toContain('readonly');
    expect(getToolProfilesForTool('list_tool_profiles')).toContain('readonly');
    expect(getToolProfilesForTool('read_content')).toContain('readonly');
    expect(getToolProfilesForTool('search_document')).toContain('readonly');
    expect(getToolProfilesForTool('validate_content')).toContain('readonly');
    expect(getToolProfilesForTool('load_guidance')).toContain('readonly');
    expect(getToolProfilesForTool('preview_edit')).not.toContain('readonly');
    expect(getToolProfilesForTool('apply_edit')).not.toContain('readonly');

    for (const name of ALL_TOOL_NAMES) {
      if (!getToolProfilesForTool(name).includes('readonly')) continue;
      expect(getToolAnnotations(name)?.readOnlyHint, `${name} is in readonly profile`).toBe(true);
      expect(getToolAnnotations(name)?.destructiveHint, `${name} is in readonly profile`).not.toBe(true);
    }
  });

  it('tool metadata exposes profile membership and default profile for client-side catalog fallback', () => {
    expect(getToolMeta('inspect_document')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.profiles]: ['facade-first', 'authoring', 'advanced-full', 'readonly'],
        [TOOL_META_KEYS.defaultProfile]: 'facade-first',
      }),
    );
    expect(getToolMeta('apply_edit')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.profiles]: ['facade-first', 'authoring', 'advanced-full'],
        [TOOL_META_KEYS.defaultProfile]: 'facade-first',
      }),
    );
    expect(getToolMeta('write_lorebook')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.profiles]: ['authoring', 'advanced-full'],
        [TOOL_META_KEYS.defaultProfile]: 'facade-first',
      }),
    );
  });

  it('derives workflow stages for facade read, validation, preview, and apply flows', () => {
    expect(TOOL_WORKFLOW_STAGES).toEqual(['discover', 'read', 'search', 'validate', 'preview', 'apply']);
    expect(getToolWorkflowStages('inspect_document')).toEqual(['discover']);
    expect(getToolWorkflowStages('read_content')).toEqual(['read']);
    expect(getToolWorkflowStages('search_document')).toEqual(['search']);
    expect(getToolWorkflowStages('validate_content')).toEqual(['validate']);
    expect(getToolWorkflowStages('preview_edit')).toEqual(['preview']);
    expect(getToolWorkflowStages('apply_edit')).toEqual(['apply']);
    expect(getToolWorkflowStages('write_lorebook')).toEqual(['apply']);
    expect(getToolWorkflowStages('replace_in_field')).toEqual(['preview', 'apply']);
  });

  it('exposes workflow stages in tool metadata and profile catalogs', () => {
    expect(getToolMeta('inspect_document')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.workflowStages]: ['discover'],
      }),
    );
    expect(getToolMeta('read_content')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.workflowStages]: ['read'],
      }),
    );
    expect(getToolMeta('search_document')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.workflowStages]: ['search'],
      }),
    );
    expect(getToolMeta('validate_content')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.workflowStages]: ['validate'],
      }),
    );
    expect(getToolMeta('preview_edit')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.workflowStages]: ['preview'],
      }),
    );
    expect(getToolMeta('apply_edit')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.workflowStages]: ['apply'],
      }),
    );
    expect(getToolMeta('write_lorebook')).toEqual(
      expect.objectContaining({
        [TOOL_META_KEYS.workflowStages]: ['apply'],
      }),
    );

    const representativeStages = [
      ['inspect_document', ['discover']],
      ['read_content', ['read']],
      ['search_document', ['search']],
      ['validate_content', ['validate']],
      ['preview_edit', ['preview']],
      ['apply_edit', ['apply']],
    ] as const;
    for (const profileName of ['facade-first', 'authoring'] as const) {
      const catalog = buildToolSurfaceProfileCatalog(profileName);
      for (const [toolName, workflowStages] of representativeStages) {
        expect(
          catalog?.tools.find((tool) => tool.name === toolName),
          `${profileName}:${toolName}`,
        ).toEqual(
          expect.objectContaining({
            workflowStages,
            readOnly: getToolAnnotations(toolName)?.readOnlyHint === true,
          }),
        );
      }
    }

    const readonlyCatalog = buildToolSurfaceProfileCatalog('readonly');
    for (const [toolName, workflowStages] of representativeStages.slice(0, 4)) {
      expect(
        readonlyCatalog?.tools.find((tool) => tool.name === toolName),
        `readonly:${toolName}`,
      ).toEqual(expect.objectContaining({ workflowStages, readOnly: true }));
    }
    expect(readonlyCatalog?.tools.some((tool) => tool.name === 'preview_edit')).toBe(false);
    expect(readonlyCatalog?.tools.some((tool) => tool.name === 'apply_edit')).toBe(false);
  });

  it('readonly profile tools never advertise preview or apply workflow stages', () => {
    for (const name of ALL_TOOL_NAMES) {
      if (!getToolProfilesForTool(name).includes('readonly')) continue;
      expect(getToolWorkflowStages(name), `${name} readonly workflow stages`).not.toContain('preview');
      expect(getToolWorkflowStages(name), `${name} readonly workflow stages`).not.toContain('apply');
    }
  });

  it('structured stale guard details stay aligned with legacy guard names', () => {
    for (const name of ALL_TOOL_NAMES) {
      const meta = getToolMeta(name);
      const staleGuards = meta?.[TOOL_META_KEYS.staleGuards] as readonly string[];
      const staleGuardDetails = meta?.[TOOL_META_KEYS.staleGuardDetails] as readonly StaleGuardDetail[];
      expect(
        staleGuardDetails.map((detail) => detail.name),
        `${name} structured stale guards should match legacy names`,
      ).toEqual(staleGuards);
      expect(TOOL_STALE_GUARD_DETAILS[name] ?? []).toEqual(staleGuardDetails);
    }
  });

  it('structured stale guard details describe nested batch guard payloads', () => {
    const details = getToolMeta('write_lorebook_batch')?.[
      TOOL_META_KEYS.staleGuardDetails
    ] as readonly StaleGuardDetail[];

    expect(details).toEqual([
      expect.objectContaining({
        name: 'expected_comment',
        payloadPath: '/entries/*/expected_comment',
        alignedWithPath: '/entries/*/index',
        sourceOperations: ['list_lorebook', 'read_lorebook'],
        retry: expect.stringContaining('On 409'),
      }),
    ]);
  });

  it('structured stale guard details describe single-entry guard payloads', () => {
    const details = getToolMeta('write_lorebook')?.[TOOL_META_KEYS.staleGuardDetails] as readonly StaleGuardDetail[];

    expect(details).toEqual([
      expect.objectContaining({
        name: 'expected_comment',
        payloadPath: '/expected_comment',
        sourceOperations: ['list_lorebook', 'read_lorebook'],
        sourceResultPath: '/entries/*/comment or /comment',
        retry: expect.stringContaining('refresh'),
      }),
    ]);
  });

  it('tools marked as requiring confirmation say so in the registered description', () => {
    for (const name of ALL_TOOL_NAMES) {
      const meta = getToolMutationMeta(name);
      if (!meta?.requiresConfirmation) continue;
      const block = registeredToolBlocks.get(name);
      expect(block, `${name} should have a registered tool block`).toBeDefined();
      expect(block, `${name} description should mention confirmation`).toMatch(
        /사용자 확인 필요|Requires user confirmation/,
      );
    }
  });

  it('tools marked as supporting dry_run mention dry_run in the registered tool block', () => {
    for (const name of DRY_RUN_TOOL_NAMES) {
      const block = registeredToolBlocks.get(name);
      expect(block, `${name} should have a registered tool block`).toBeDefined();
      expect(block, `${name} should mention dry_run`).toMatch(/\bdry_run\b/);
    }
  });

  // ── Helper function tests ──────────────────────────────────────────────

  it('getToolFamily returns correct family for known tools', () => {
    expect(getToolFamily('list_fields')).toBe('field');
    expect(getToolFamily('probe_field')).toBe('probe');
    expect(getToolFamily('validate_cbs')).toBe('cbs');
    expect(getToolFamily('list_lorebook')).toBe('lorebook');
  });

  it('getToolFamily returns undefined for unknown tools', () => {
    expect(getToolFamily('nonexistent_tool')).toBeUndefined();
  });

  it('getToolAnnotations returns hints object for known tools', () => {
    const hints = getToolAnnotations('list_fields');
    expect(hints).toBeDefined();
    expect(hints?.readOnlyHint).toBe(true);
  });

  it('getToolsByFamily returns sorted arrays', () => {
    const byFamily = getToolsByFamily();
    for (const family of TOOL_FAMILIES) {
      const tools = byFamily[family];
      const sorted = [...tools].sort();
      expect(tools).toEqual(sorted);
    }
  });

  // ── Cross-cutting capability detection ─────────────────────────────────

  it('families with batch tools include both read and write families', () => {
    const batchTools = ALL_TOOL_NAMES.filter((n) => n.includes('batch') || n.startsWith('batch_'));
    expect(batchTools.length).toBeGreaterThan(10);

    const batchFamilies = new Set(batchTools.map((n) => getToolFamily(n)));
    expect(batchFamilies.size).toBeGreaterThan(3);
  });

  // ── Taxonomy count stability ───────────────────────────────────────────

  it('taxonomy tool count matches server registration count', () => {
    expect(ALL_TOOL_NAMES.length).toBe(registeredTools.length);
  });
});

describe('agent eval: validation workflows stay discovery-first', () => {
  it('keeps every CBS follow-up tool read-only', () => {
    for (const toolName of FAMILY_NEXT_ACTIONS.cbs) {
      const hints = getToolAnnotations(toolName);
      expect(hints?.readOnlyHint, `${toolName} should remain readOnly for CBS recovery flows`).toBe(true);
      expect(hints?.destructiveHint, `${toolName} should not become destructive`).not.toBe(true);
    }
  });

  it('keeps lorebook validation available without suggesting destructive recovery', () => {
    expect(getToolAnnotations('validate_lorebook_keys')?.readOnlyHint).toBe(true);
    expect(FAMILY_NEXT_ACTIONS.lorebook).toContain('validate_lorebook_keys');
    for (const toolName of FAMILY_NEXT_ACTIONS.cbs) {
      expect(toolName.startsWith('write_') || toolName.startsWith('delete_')).toBe(false);
    }
  });
});

describe('agent eval: facade-first baseline fixtures', () => {
  it('keeps proposed facade names as future fixtures, not registered granular tools', () => {
    const currentNames = new Set(ALL_TOOL_NAMES);
    for (const facadeTool of PROPOSED_FACADE_TOOL_FIXTURE) {
      expect(currentNames.has(facadeTool.name), `${facadeTool.name} should remain unimplemented in this baseline`).toBe(
        false,
      );
      expect(facadeTool.purpose.length).toBeGreaterThan(20);
    }
  });

  it('captures comparison-friendly routing and safety metrics for the facade migration', () => {
    const requiredScenarioIds = [
      'active-external-reference-routing',
      'batch-vs-single-edit-choice',
      'stale-guard-refresh-retry',
      'dry-run-first-destructive-edit',
      'no-file-open-workflow',
    ];
    expect(FACADE_BASELINE_SCENARIOS.map((scenario) => scenario.id)).toEqual(requiredScenarioIds);

    for (const scenario of FACADE_BASELINE_SCENARIOS) {
      expect(scenario.currentToolCallCount).toBe(scenario.currentGranularWorkflow.length);
      expect(scenario.expectedFacadeToolCallCount).toBe(scenario.expectedFacadeWorkflow.length);
      expect(scenario.expectedFacadeToolCallCount).toBeLessThanOrEqual(scenario.currentToolCallCount);
      expect(scenario.metrics).toContain('tool-call-count');
      expect(scenario.finalArtifactEquality, `${scenario.id} should define final artifact equality`).toEqual(
        expect.any(String),
      );

      for (const workflowStep of scenario.currentGranularWorkflow) {
        const toolName = workflowStep.split(':')[0];
        expect(ALL_TOOL_NAMES, `${scenario.id} references missing current tool ${toolName}`).toContain(toolName);
      }
    }
  });

  it('measures current tool-list byte cost against the proposed compact facade fixture', () => {
    const currentToolListFixture = ALL_TOOL_NAMES.map((name) => ({
      name,
      annotations: getToolAnnotations(name),
      meta: getToolMeta(name),
    }));
    const currentByteCost = jsonByteLength(currentToolListFixture);
    const facadeByteCost = jsonByteLength(PROPOSED_FACADE_TOOL_FIXTURE);

    expect(currentToolListFixture.length).toBeGreaterThan(100);
    expect(PROPOSED_FACADE_TOOL_FIXTURE.length).toBe(3);
    expect(currentByteCost).toBeGreaterThan(facadeByteCost);
    expect(Math.ceil(currentByteCost / 4)).toBeGreaterThan(Math.ceil(facadeByteCost / 4));
  });

  it('flags wrong-tool avoidance and batch preference before facade tools exist', () => {
    const routingScenario = FACADE_BASELINE_SCENARIOS.find(
      (scenario) => scenario.id === 'active-external-reference-routing',
    );
    expect(routingScenario?.wrongToolAvoidance).toEqual(
      expect.arrayContaining([
        'external tools must not target the active document',
        'reference tools must stay read-only',
      ]),
    );
    expect(getToolAnnotations('read_reference_field')?.readOnlyHint).toBe(true);
    expect(getToolAnnotations('external_write_field')?.openWorldHint).toBe(true);

    const batchScenario = FACADE_BASELINE_SCENARIOS.find((scenario) => scenario.id === 'batch-vs-single-edit-choice');
    expect(batchScenario?.currentGranularWorkflow).toContain('replace_in_lorebook_batch');
    expect(batchScenario?.currentGranularWorkflow).not.toContain('replace_in_lorebook');
    expect(getToolMutationMeta('replace_in_lorebook_batch')?.supportsDryRun).toBe(true);
  });

  it('requires dry-run compliance and stale recovery metadata for risky baseline workflows', () => {
    const dryRunScenario = FACADE_BASELINE_SCENARIOS.find(
      (scenario) => scenario.id === 'dry-run-first-destructive-edit',
    );
    expect(dryRunScenario?.dryRunRequired).toBe(true);
    expect(dryRunScenario?.metrics).toContain('dry-run-compliance');
    expect(getToolMutationMeta('compress_assets_webp')?.supportsDryRun).toBe(true);
    expect(getToolAnnotations('compress_assets_webp')?.destructiveHint).toBe(true);

    const staleScenario = FACADE_BASELINE_SCENARIOS.find((scenario) => scenario.id === 'stale-guard-refresh-retry');
    expect(staleScenario?.staleRecoveryRequired).toBe(true);
    expect(staleScenario?.metrics).toContain('stale-recovery');
    expect(getToolMeta('write_lua')?.[TOOL_META_KEYS.staleGuardDetails]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'expected_hash',
          sourceOperations: ['list_lua', 'read_lua'],
          retry: expect.stringContaining('refresh'),
        }),
      ]),
    );
  });
});
