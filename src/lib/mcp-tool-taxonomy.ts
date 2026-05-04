/**
 * MCP Tool Taxonomy — Single source of truth for tool families and behavior hints.
 *
 * Every MCP tool registered in toki-mcp-server.ts MUST appear here.
 * Tests enforce bidirectional completeness: no orphan tools, no phantom entries.
 *
 * Families align with the surface-family inventory in baseline-route-inventory.md.
 * Behavior hints map to the MCP SDK ToolAnnotations spec (2025-03-26):
 *   - readOnlyHint:    true → tool does NOT mutate state
 *   - destructiveHint: true → tool may irreversibly delete/overwrite data
 *   - idempotentHint:  true → calling N times ≡ calling once (same args → same result)
 *   - openWorldHint:   true → tool interacts with external systems (network, filesystem)
 *
 * Additional mutation capability metadata is exposed separately through MCP tool `_meta`
 * because the SDK strips unknown keys from `annotations`.
 */

// ────────────────────────────────────────────────────────────────────────────
// Family definitions
// ────────────────────────────────────────────────────────────────────────────

export const TOOL_FAMILIES = [
  'field',
  'probe',
  'external',
  'lorebook',
  'regex',
  'greeting',
  'trigger',
  'lua',
  'css',
  'reference',
  'charx-asset',
  'risum-asset',
  'asset-compression',
  'risup-prompt',
  'skill',
  'danbooru',
  'cbs',
  'snapshot',
  'search',
  'surface',
  'lorebook-io',
  'session',
] as const;

export type ToolFamily = (typeof TOOL_FAMILIES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Behavior hint presets (reusable combos to reduce repetition)
// ────────────────────────────────────────────────────────────────────────────

interface BehaviorHints {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface MutationMeta {
  requiresConfirmation: boolean;
  supportsDryRun: boolean;
}

export const TOOL_SURFACE_KINDS = ['facade', 'granular'] as const;
export type ToolSurfaceKind = (typeof TOOL_SURFACE_KINDS)[number];

export const TOOL_RECOMMENDATIONS = ['preferred', 'advanced', 'legacy'] as const;
export type ToolRecommendation = (typeof TOOL_RECOMMENDATIONS)[number];

export const TOOL_SURFACE_PROFILE_NAMES = ['facade-first', 'authoring', 'advanced-full', 'readonly'] as const;
export type ToolSurfaceProfileName = (typeof TOOL_SURFACE_PROFILE_NAMES)[number];

export const DEFAULT_TOOL_SURFACE_PROFILE: ToolSurfaceProfileName = 'facade-first';

export const TOOL_WORKFLOW_STAGES = ['discover', 'read', 'search', 'validate', 'preview', 'apply'] as const;
export type ToolWorkflowStage = (typeof TOOL_WORKFLOW_STAGES)[number];

export const TOOL_SURFACE_PROFILE_ALIASES = {
  advanced: 'advanced-full',
  full: 'advanced-full',
} as const satisfies Record<string, ToolSurfaceProfileName>;

export type ToolSurfaceProfileFilteringStatus = 'catalog-facade';

export interface ToolSurfaceProfileContract {
  name: ToolSurfaceProfileName;
  aliases: readonly string[];
  default: boolean;
  readonly: boolean;
  filteringStatus: ToolSurfaceProfileFilteringStatus;
  includedCategories: readonly string[];
  excludedCategories: readonly string[];
  legacyEscapeHatch: ToolSurfaceProfileName | false;
  clientRequest: readonly string[];
  discovery: readonly string[];
  description: string;
}

const PROFILE_METADATA_DISCOVERY = [
  'tools/list _meta risutoki/profiles',
  'tools/list _meta risutoki/defaultProfile',
  'list_tool_profiles profile-specific catalog facade',
  'docs/MCP_TOOL_SURFACE.md profile catalog',
] as const;

const PROFILE_CLIENT_REQUEST = [
  'Call list_tool_profiles with the exact profile name for a compact profile-specific catalog.',
  'Keep tools/list unfiltered for MCP client compatibility and use advanced-full as the escape hatch.',
] as const;

export const TOOL_SURFACE_PROFILE_CONTRACTS: readonly ToolSurfaceProfileContract[] = [
  {
    name: 'facade-first',
    aliases: [],
    default: true,
    readonly: false,
    filteringStatus: 'catalog-facade',
    includedCategories: ['facade preferred tools'],
    excludedCategories: ['granular tools from the compact facade-first catalog unless advanced-full is requested'],
    legacyEscapeHatch: 'advanced-full',
    clientRequest: PROFILE_CLIENT_REQUEST,
    discovery: PROFILE_METADATA_DISCOVERY,
    description:
      'Default planning profile. Prefer first-wave facade tools for covered inspect/read/search/preview/apply workflows and switch to advanced-full for granular escape hatches.',
  },
  {
    name: 'authoring',
    aliases: [],
    default: false,
    readonly: false,
    filteringStatus: 'catalog-facade',
    includedCategories: [
      'facade preferred tools',
      'field/surface/search',
      'structured authoring families',
      'reference/skill/cbs/danbooru guidance',
      'asset item families',
    ],
    excludedCategories: ['external direct file mutation', 'session/file-open controls', 'snapshots', 'imports/exports'],
    legacyEscapeHatch: 'advanced-full',
    clientRequest: PROFILE_CLIENT_REQUEST,
    discovery: PROFILE_METADATA_DISCOVERY,
    description:
      'Authoring-focused profile for editing content structures while keeping direct file/session administration as an advanced escape hatch.',
  },
  {
    name: 'advanced-full',
    aliases: ['advanced', 'full'],
    default: false,
    readonly: false,
    filteringStatus: 'catalog-facade',
    includedCategories: ['all registered tools', 'all granular fallback tools', 'legacy compatibility routes'],
    excludedCategories: [],
    legacyEscapeHatch: false,
    clientRequest: PROFILE_CLIENT_REQUEST,
    discovery: PROFILE_METADATA_DISCOVERY,
    description:
      'Complete compatibility profile. Use when facade-first or authoring cannot express the task, when exact legacy payloads matter, or during debugging/parity work.',
  },
  {
    name: 'readonly',
    aliases: [],
    default: false,
    readonly: true,
    filteringStatus: 'catalog-facade',
    includedCategories: ['tools annotated readOnlyHint=true'],
    excludedCategories: [
      'preview_edit',
      'apply_edit',
      'all mutating or destructive tools',
      'session/file-open mutations',
    ],
    legacyEscapeHatch: 'advanced-full',
    clientRequest: PROFILE_CLIENT_REQUEST,
    discovery: PROFILE_METADATA_DISCOVERY,
    description:
      'Inspection-only profile. The catalog includes only readOnlyHint=true tools; preview and apply flows are excluded.',
  },
];

export interface ToolMeta {
  family: ToolFamily;
  staleGuards: readonly string[];
  staleGuardDetails: readonly StaleGuardDetail[];
  surfaceKind?: ToolSurfaceKind;
  recommendation?: ToolRecommendation;
  workflowStages?: readonly ToolWorkflowStage[];
  requiresConfirmation?: boolean;
  supportsDryRun?: boolean;
}

export interface StaleGuardDetail {
  name: string;
  payloadPath: string;
  sourceOperations: readonly string[];
  sourceResultPath: string;
  alignedWithPath?: string;
  retry: string;
}

export const TOOL_META_KEYS = {
  family: 'risutoki/family',
  staleGuards: 'risutoki/staleGuards',
  staleGuardDetails: 'risutoki/staleGuardDetails',
  surfaceKind: 'risutoki/surfaceKind',
  recommendation: 'risutoki/recommendation',
  workflowStages: 'risutoki/workflowStages',
  profiles: 'risutoki/profiles',
  defaultProfile: 'risutoki/defaultProfile',
  requiresConfirmation: 'risutoki/requiresConfirmation',
  supportsDryRun: 'risutoki/supportsDryRun',
} as const;

export const TOOL_MUTATION_META_KEYS = {
  requiresConfirmation: TOOL_META_KEYS.requiresConfirmation,
  supportsDryRun: TOOL_META_KEYS.supportsDryRun,
} as const;

export const NO_CONFIRMATION_TOOL_NAMES = ['open_file', 'save_current_file', 'snapshot_field', 'preview_edit'] as const;

export const DRY_RUN_TOOL_NAMES = [
  'replace_in_field',
  'external_replace_in_field',
  'replace_in_field_batch',
  'replace_block_in_field',
  'replace_block_in_lorebook',
  'replace_in_lorebook_batch',
  'replace_across_all_lorebook',
  'import_lorebook_from_files',
  'import_risup_prompt_from_text',
  'insert_risup_prompt_snippet',
  'patch_surface',
  'replace_in_surface',
  'external_patch_surface',
  'compress_assets_webp',
  'preview_edit',
] as const;

const NO_CONFIRMATION_TOOL_NAME_SET = new Set<string>(NO_CONFIRMATION_TOOL_NAMES);
const DRY_RUN_TOOL_NAME_SET = new Set<string>(DRY_RUN_TOOL_NAMES);

const AUTHORING_PROFILE_FAMILIES = new Set<ToolFamily>([
  'field',
  'search',
  'surface',
  'lorebook',
  'regex',
  'greeting',
  'trigger',
  'lua',
  'css',
  'reference',
  'charx-asset',
  'risum-asset',
  'risup-prompt',
  'skill',
  'danbooru',
  'cbs',
]);

export const TOOL_STALE_GUARD_NAMES: Record<string, readonly string[]> = {
  patch_surface: ['expected_hash'],
  external_patch_surface: ['expected_hash'],

  write_lorebook: ['expected_comment'],
  write_lorebook_batch: ['expected_comment'],
  clone_lorebook: ['expected_comment'],
  delete_lorebook: ['expected_comment'],
  batch_delete_lorebook: ['expected_comments'],
  replace_in_lorebook: ['expected_comment'],
  insert_in_lorebook: ['expected_comment'],
  replace_block_in_lorebook: ['expected_comment'],
  replace_in_lorebook_batch: ['expected_comment'],
  insert_in_lorebook_batch: ['expected_comment'],

  write_regex: ['expected_comment'],
  write_regex_batch: ['expected_comment'],
  delete_regex: ['expected_comment'],
  replace_in_regex: ['expected_comment'],
  insert_in_regex: ['expected_comment'],

  write_greeting: ['expected_preview'],
  batch_write_greeting: ['expected_preview'],
  delete_greeting: ['expected_preview'],
  batch_delete_greeting: ['expected_previews'],

  write_trigger: ['expected_comment'],
  delete_trigger: ['expected_comment'],

  write_lua: ['expected_hash', 'expected_preview'],
  replace_in_lua: ['expected_hash', 'expected_preview'],
  insert_in_lua: ['expected_hash', 'expected_preview'],

  write_css: ['expected_hash', 'expected_preview'],
  replace_in_css: ['expected_hash', 'expected_preview'],
  insert_in_css: ['expected_hash', 'expected_preview'],

  delete_charx_asset: ['expected_path'],
  rename_charx_asset: ['expected_path'],
  delete_risum_asset: ['expected_path'],

  write_risup_prompt_item: ['expected_type', 'expected_preview'],
  write_risup_prompt_item_batch: ['expected_type', 'expected_preview'],
  delete_risup_prompt_item: ['expected_type', 'expected_preview'],
  batch_delete_risup_prompt_items: ['expected_types', 'expected_previews'],
};

const RETRY_WITH_REFRESH = 'On 409, refresh with the source operation(s), then retry with current guard value(s).';

const STALE_GUARD_SOURCES = {
  surfaceHash: {
    sourceOperations: ['list_surfaces', 'read_surface'],
    sourceResultPath: '/hash',
    retry: RETRY_WITH_REFRESH,
  },
  externalSurfaceHash: {
    sourceOperations: ['external_read_surface'],
    sourceResultPath: '/hash',
    retry: RETRY_WITH_REFRESH,
  },
  lorebookComment: {
    sourceOperations: ['list_lorebook', 'read_lorebook'],
    sourceResultPath: '/entries/*/comment or /comment',
    retry: RETRY_WITH_REFRESH,
  },
  regexComment: {
    sourceOperations: ['list_regex', 'read_regex'],
    sourceResultPath: '/entries/*/comment or /comment',
    retry: RETRY_WITH_REFRESH,
  },
  greetingPreview: {
    sourceOperations: ['list_greetings', 'read_greeting'],
    sourceResultPath: '/greetings/*/preview or /preview',
    retry: RETRY_WITH_REFRESH,
  },
  triggerComment: {
    sourceOperations: ['list_triggers', 'read_trigger'],
    sourceResultPath: '/triggers/*/comment or /comment',
    retry: RETRY_WITH_REFRESH,
  },
  luaSectionHash: {
    sourceOperations: ['list_lua', 'read_lua'],
    sourceResultPath: '/sections/*/hash or /hash',
    retry: RETRY_WITH_REFRESH,
  },
  luaSectionPreview: {
    sourceOperations: ['list_lua', 'read_lua'],
    sourceResultPath: '/sections/*/preview or /preview',
    retry: RETRY_WITH_REFRESH,
  },
  cssSectionHash: {
    sourceOperations: ['list_css', 'read_css'],
    sourceResultPath: '/sections/*/hash or /hash',
    retry: RETRY_WITH_REFRESH,
  },
  cssSectionPreview: {
    sourceOperations: ['list_css', 'read_css'],
    sourceResultPath: '/sections/*/preview or /preview',
    retry: RETRY_WITH_REFRESH,
  },
  charxAssetPath: {
    sourceOperations: ['list_charx_assets', 'read_charx_asset'],
    sourceResultPath: '/assets/*/path or /path',
    retry: RETRY_WITH_REFRESH,
  },
  risumAssetPath: {
    sourceOperations: ['list_risum_assets', 'read_risum_asset'],
    sourceResultPath: '/assets/*/path or /path',
    retry: RETRY_WITH_REFRESH,
  },
  risupPromptType: {
    sourceOperations: ['list_risup_prompt_items', 'read_risup_prompt_item'],
    sourceResultPath: '/items/*/type or /type',
    retry: RETRY_WITH_REFRESH,
  },
  risupPromptPreview: {
    sourceOperations: ['list_risup_prompt_items', 'read_risup_prompt_item'],
    sourceResultPath: '/items/*/preview or /preview',
    retry: RETRY_WITH_REFRESH,
  },
} as const satisfies Record<string, Omit<StaleGuardDetail, 'name' | 'payloadPath' | 'alignedWithPath'>>;

function staleGuardDetail(
  name: string,
  payloadPath: string,
  source: Omit<StaleGuardDetail, 'name' | 'payloadPath' | 'alignedWithPath'>,
  alignedWithPath?: string,
): StaleGuardDetail {
  return {
    name,
    payloadPath,
    ...source,
    ...(alignedWithPath ? { alignedWithPath } : {}),
  };
}

const expectedHash = (payloadPath = '/expected_hash') =>
  staleGuardDetail('expected_hash', payloadPath, STALE_GUARD_SOURCES.surfaceHash);
const expectedComment = (payloadPath = '/expected_comment', alignedWithPath?: string) =>
  staleGuardDetail('expected_comment', payloadPath, STALE_GUARD_SOURCES.lorebookComment, alignedWithPath);
const expectedRegexComment = (payloadPath = '/expected_comment', alignedWithPath?: string) =>
  staleGuardDetail('expected_comment', payloadPath, STALE_GUARD_SOURCES.regexComment, alignedWithPath);
const expectedGreetingPreview = (payloadPath = '/expected_preview', alignedWithPath?: string) =>
  staleGuardDetail('expected_preview', payloadPath, STALE_GUARD_SOURCES.greetingPreview, alignedWithPath);
const expectedTriggerComment = () =>
  staleGuardDetail('expected_comment', '/expected_comment', STALE_GUARD_SOURCES.triggerComment);
const expectedLuaHash = () => staleGuardDetail('expected_hash', '/expected_hash', STALE_GUARD_SOURCES.luaSectionHash);
const expectedLuaPreview = () =>
  staleGuardDetail('expected_preview', '/expected_preview', STALE_GUARD_SOURCES.luaSectionPreview);
const expectedCssHash = () => staleGuardDetail('expected_hash', '/expected_hash', STALE_GUARD_SOURCES.cssSectionHash);
const expectedCssPreview = () =>
  staleGuardDetail('expected_preview', '/expected_preview', STALE_GUARD_SOURCES.cssSectionPreview);
const expectedCharxAssetPath = () =>
  staleGuardDetail('expected_path', '/expected_path', STALE_GUARD_SOURCES.charxAssetPath);
const expectedRisumAssetPath = () =>
  staleGuardDetail('expected_path', '/expected_path', STALE_GUARD_SOURCES.risumAssetPath);
const expectedRisupType = (payloadPath = '/expected_type', alignedWithPath?: string) =>
  staleGuardDetail('expected_type', payloadPath, STALE_GUARD_SOURCES.risupPromptType, alignedWithPath);
const expectedRisupPreview = (payloadPath = '/expected_preview', alignedWithPath?: string) =>
  staleGuardDetail('expected_preview', payloadPath, STALE_GUARD_SOURCES.risupPromptPreview, alignedWithPath);

export const TOOL_STALE_GUARD_DETAILS: Record<string, readonly StaleGuardDetail[]> = {
  patch_surface: [expectedHash()],
  external_patch_surface: [
    staleGuardDetail('expected_hash', '/expected_hash', STALE_GUARD_SOURCES.externalSurfaceHash),
  ],

  write_lorebook: [expectedComment()],
  write_lorebook_batch: [expectedComment('/entries/*/expected_comment', '/entries/*/index')],
  clone_lorebook: [expectedComment()],
  delete_lorebook: [expectedComment()],
  batch_delete_lorebook: [
    staleGuardDetail('expected_comments', '/expected_comments/*', STALE_GUARD_SOURCES.lorebookComment, '/indices/*'),
  ],
  replace_in_lorebook: [expectedComment()],
  insert_in_lorebook: [expectedComment()],
  replace_block_in_lorebook: [expectedComment()],
  replace_in_lorebook_batch: [expectedComment('/entries/*/expected_comment', '/entries/*/index')],
  insert_in_lorebook_batch: [expectedComment('/entries/*/expected_comment', '/entries/*/index')],

  write_regex: [expectedRegexComment()],
  write_regex_batch: [expectedRegexComment('/entries/*/expected_comment', '/entries/*/index')],
  delete_regex: [expectedRegexComment()],
  replace_in_regex: [expectedRegexComment()],
  insert_in_regex: [expectedRegexComment()],

  write_greeting: [expectedGreetingPreview()],
  batch_write_greeting: [expectedGreetingPreview('/writes/*/expected_preview', '/writes/*/index')],
  delete_greeting: [expectedGreetingPreview()],
  batch_delete_greeting: [
    staleGuardDetail('expected_previews', '/expected_previews/*', STALE_GUARD_SOURCES.greetingPreview, '/indices/*'),
  ],

  write_trigger: [expectedTriggerComment()],
  delete_trigger: [expectedTriggerComment()],

  write_lua: [expectedLuaHash(), expectedLuaPreview()],
  replace_in_lua: [expectedLuaHash(), expectedLuaPreview()],
  insert_in_lua: [expectedLuaHash(), expectedLuaPreview()],

  write_css: [expectedCssHash(), expectedCssPreview()],
  replace_in_css: [expectedCssHash(), expectedCssPreview()],
  insert_in_css: [expectedCssHash(), expectedCssPreview()],

  delete_charx_asset: [expectedCharxAssetPath()],
  rename_charx_asset: [expectedCharxAssetPath()],
  delete_risum_asset: [expectedRisumAssetPath()],

  write_risup_prompt_item: [expectedRisupType(), expectedRisupPreview()],
  write_risup_prompt_item_batch: [
    expectedRisupType('/writes/*/expected_type', '/writes/*/index'),
    expectedRisupPreview('/writes/*/expected_preview', '/writes/*/index'),
  ],
  delete_risup_prompt_item: [expectedRisupType(), expectedRisupPreview()],
  batch_delete_risup_prompt_items: [
    staleGuardDetail('expected_types', '/expected_types/*', STALE_GUARD_SOURCES.risupPromptType, '/indices/*'),
    staleGuardDetail('expected_previews', '/expected_previews/*', STALE_GUARD_SOURCES.risupPromptPreview, '/indices/*'),
  ],
};

const RO_IDEMPOTENT: BehaviorHints = { readOnlyHint: true, idempotentHint: true };
const WRITE: BehaviorHints = { readOnlyHint: false };
const WRITE_IDEMPOTENT: BehaviorHints = { readOnlyHint: false, idempotentHint: true };
const DESTRUCTIVE: BehaviorHints = { readOnlyHint: false, destructiveHint: true };
const OPEN_WORLD_RO: BehaviorHints = { readOnlyHint: true, openWorldHint: true };
const OPEN_WORLD_WRITE: BehaviorHints = { readOnlyHint: false, openWorldHint: true };

// ────────────────────────────────────────────────────────────────────────────
// Tool entry
// ────────────────────────────────────────────────────────────────────────────

export interface ToolEntry {
  family: ToolFamily;
  hints: BehaviorHints;
  surfaceKind?: ToolSurfaceKind;
  recommendation?: ToolRecommendation;
}

// ────────────────────────────────────────────────────────────────────────────
// Canonical tool → family + hints map
// ────────────────────────────────────────────────────────────────────────────

export const TOOL_TAXONOMY: Record<string, ToolEntry> = {
  // ── Facade v1 (preferred additive tools) ───────────────────────────────
  inspect_document: { family: 'session', hints: RO_IDEMPOTENT, surfaceKind: 'facade', recommendation: 'preferred' },
  list_tool_profiles: { family: 'session', hints: RO_IDEMPOTENT, surfaceKind: 'facade', recommendation: 'preferred' },
  read_content: { family: 'surface', hints: RO_IDEMPOTENT, surfaceKind: 'facade', recommendation: 'preferred' },
  search_document: { family: 'search', hints: RO_IDEMPOTENT, surfaceKind: 'facade', recommendation: 'preferred' },
  preview_edit: { family: 'surface', hints: WRITE, surfaceKind: 'facade', recommendation: 'preferred' },
  apply_edit: { family: 'surface', hints: WRITE, surfaceKind: 'facade', recommendation: 'preferred' },
  validate_content: { family: 'surface', hints: RO_IDEMPOTENT, surfaceKind: 'facade', recommendation: 'preferred' },
  load_guidance: { family: 'skill', hints: OPEN_WORLD_RO, surfaceKind: 'facade', recommendation: 'preferred' },

  // ── Field ──────────────────────────────────────────────────────────────
  list_fields: { family: 'field', hints: RO_IDEMPOTENT },
  read_field: { family: 'field', hints: RO_IDEMPOTENT },
  read_field_batch: { family: 'field', hints: RO_IDEMPOTENT },
  write_field: { family: 'field', hints: WRITE_IDEMPOTENT },
  write_field_batch: { family: 'field', hints: WRITE },
  replace_in_field: { family: 'field', hints: WRITE },
  replace_in_field_batch: { family: 'field', hints: WRITE },
  replace_block_in_field: { family: 'field', hints: WRITE },
  insert_in_field: { family: 'field', hints: WRITE },
  read_field_range: { family: 'field', hints: RO_IDEMPOTENT },
  get_field_stats: { family: 'field', hints: RO_IDEMPOTENT },
  export_field_to_file: { family: 'field', hints: OPEN_WORLD_WRITE },

  // ── Search ─────────────────────────────────────────────────────────────
  search_in_field: { family: 'search', hints: RO_IDEMPOTENT },
  search_all_fields: { family: 'search', hints: RO_IDEMPOTENT },

  // ── Snapshot ───────────────────────────────────────────────────────────
  snapshot_field: { family: 'snapshot', hints: WRITE },
  list_snapshots: { family: 'snapshot', hints: RO_IDEMPOTENT },
  restore_snapshot: { family: 'snapshot', hints: WRITE },

  // ── Session ────────────────────────────────────────────────────────────
  session_status: { family: 'session', hints: RO_IDEMPOTENT },
  save_current_file: { family: 'session', hints: WRITE },

  // ── Surface ────────────────────────────────────────────────────────────
  list_surfaces: { family: 'surface', hints: RO_IDEMPOTENT },
  read_surface: { family: 'surface', hints: RO_IDEMPOTENT },
  patch_surface: { family: 'surface', hints: WRITE },
  replace_in_surface: { family: 'surface', hints: WRITE },

  // ── Probe / Open ───────────────────────────────────────────────────────
  probe_field: { family: 'probe', hints: RO_IDEMPOTENT },
  probe_field_batch: { family: 'probe', hints: RO_IDEMPOTENT },
  probe_lorebook: { family: 'probe', hints: RO_IDEMPOTENT },
  probe_regex: { family: 'probe', hints: RO_IDEMPOTENT },
  probe_lua: { family: 'probe', hints: RO_IDEMPOTENT },
  probe_css: { family: 'probe', hints: RO_IDEMPOTENT },
  probe_greetings: { family: 'probe', hints: RO_IDEMPOTENT },
  probe_triggers: { family: 'probe', hints: RO_IDEMPOTENT },
  probe_risup_prompt_items: { family: 'probe', hints: RO_IDEMPOTENT },
  probe_risup_formating_order: { family: 'probe', hints: RO_IDEMPOTENT },
  open_file: { family: 'probe', hints: WRITE },

  // ── External unopened-file editing ─────────────────────────────────────
  inspect_external_file: { family: 'external', hints: OPEN_WORLD_RO },
  external_write_field: { family: 'external', hints: OPEN_WORLD_WRITE },
  external_write_field_batch: { family: 'external', hints: OPEN_WORLD_WRITE },
  external_search_in_field: { family: 'external', hints: OPEN_WORLD_RO },
  external_read_field_range: { family: 'external', hints: OPEN_WORLD_RO },
  external_replace_in_field: { family: 'external', hints: OPEN_WORLD_WRITE },
  external_insert_in_field: { family: 'external', hints: OPEN_WORLD_WRITE },
  external_read_surface: { family: 'external', hints: OPEN_WORLD_RO },
  external_patch_surface: { family: 'external', hints: OPEN_WORLD_WRITE },

  // ── Lorebook ───────────────────────────────────────────────────────────
  list_lorebook: { family: 'lorebook', hints: RO_IDEMPOTENT },
  read_lorebook: { family: 'lorebook', hints: RO_IDEMPOTENT },
  read_lorebook_batch: { family: 'lorebook', hints: RO_IDEMPOTENT },
  write_lorebook: { family: 'lorebook', hints: WRITE_IDEMPOTENT },
  write_lorebook_batch: { family: 'lorebook', hints: WRITE },
  add_lorebook: { family: 'lorebook', hints: WRITE },
  add_lorebook_batch: { family: 'lorebook', hints: WRITE },
  delete_lorebook: { family: 'lorebook', hints: DESTRUCTIVE },
  batch_delete_lorebook: { family: 'lorebook', hints: DESTRUCTIVE },
  clone_lorebook: { family: 'lorebook', hints: WRITE },
  replace_in_lorebook: { family: 'lorebook', hints: WRITE },
  replace_in_lorebook_batch: { family: 'lorebook', hints: WRITE },
  replace_block_in_lorebook: { family: 'lorebook', hints: WRITE },
  insert_in_lorebook: { family: 'lorebook', hints: WRITE },
  insert_in_lorebook_batch: { family: 'lorebook', hints: WRITE },
  replace_across_all_lorebook: { family: 'lorebook', hints: WRITE },
  diff_lorebook: { family: 'lorebook', hints: RO_IDEMPOTENT },
  validate_lorebook_keys: { family: 'lorebook', hints: RO_IDEMPOTENT },

  // ── Lorebook I/O ───────────────────────────────────────────────────────
  export_lorebook_to_files: { family: 'lorebook-io', hints: OPEN_WORLD_WRITE },
  import_lorebook_from_files: { family: 'lorebook-io', hints: OPEN_WORLD_WRITE },

  // ── Regex ──────────────────────────────────────────────────────────────
  list_regex: { family: 'regex', hints: RO_IDEMPOTENT },
  read_regex: { family: 'regex', hints: RO_IDEMPOTENT },
  read_regex_batch: { family: 'regex', hints: RO_IDEMPOTENT },
  write_regex: { family: 'regex', hints: WRITE_IDEMPOTENT },
  write_regex_batch: { family: 'regex', hints: WRITE },
  add_regex: { family: 'regex', hints: WRITE },
  add_regex_batch: { family: 'regex', hints: WRITE },
  delete_regex: { family: 'regex', hints: DESTRUCTIVE },
  replace_in_regex: { family: 'regex', hints: WRITE },
  insert_in_regex: { family: 'regex', hints: WRITE },

  // ── Greeting ───────────────────────────────────────────────────────────
  list_greetings: { family: 'greeting', hints: RO_IDEMPOTENT },
  read_greeting: { family: 'greeting', hints: RO_IDEMPOTENT },
  read_greeting_batch: { family: 'greeting', hints: RO_IDEMPOTENT },
  write_greeting: { family: 'greeting', hints: WRITE_IDEMPOTENT },
  add_greeting: { family: 'greeting', hints: WRITE },
  delete_greeting: { family: 'greeting', hints: DESTRUCTIVE },
  batch_delete_greeting: { family: 'greeting', hints: DESTRUCTIVE },
  batch_write_greeting: { family: 'greeting', hints: WRITE },
  reorder_greetings: { family: 'greeting', hints: WRITE_IDEMPOTENT },

  // ── Trigger ────────────────────────────────────────────────────────────
  list_triggers: { family: 'trigger', hints: RO_IDEMPOTENT },
  read_trigger: { family: 'trigger', hints: RO_IDEMPOTENT },
  read_trigger_batch: { family: 'trigger', hints: RO_IDEMPOTENT },
  write_trigger: { family: 'trigger', hints: WRITE_IDEMPOTENT },
  add_trigger: { family: 'trigger', hints: WRITE },
  delete_trigger: { family: 'trigger', hints: DESTRUCTIVE },

  // ── Lua Section ────────────────────────────────────────────────────────
  list_lua: { family: 'lua', hints: RO_IDEMPOTENT },
  read_lua: { family: 'lua', hints: RO_IDEMPOTENT },
  read_lua_batch: { family: 'lua', hints: RO_IDEMPOTENT },
  write_lua: { family: 'lua', hints: WRITE_IDEMPOTENT },
  replace_in_lua: { family: 'lua', hints: WRITE },
  insert_in_lua: { family: 'lua', hints: WRITE },
  add_lua_section: { family: 'lua', hints: WRITE },

  // ── CSS Section ────────────────────────────────────────────────────────
  list_css: { family: 'css', hints: RO_IDEMPOTENT },
  read_css: { family: 'css', hints: RO_IDEMPOTENT },
  read_css_batch: { family: 'css', hints: RO_IDEMPOTENT },
  write_css: { family: 'css', hints: WRITE_IDEMPOTENT },
  replace_in_css: { family: 'css', hints: WRITE },
  insert_in_css: { family: 'css', hints: WRITE },
  add_css_section: { family: 'css', hints: WRITE },

  // ── Reference (read-only) ──────────────────────────────────────────────
  list_references: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_field: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_field_batch: { family: 'reference', hints: RO_IDEMPOTENT },
  search_in_reference_field: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_field_range: { family: 'reference', hints: RO_IDEMPOTENT },
  list_reference_greetings: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_greeting: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_greeting_batch: { family: 'reference', hints: RO_IDEMPOTENT },
  list_reference_triggers: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_trigger: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_trigger_batch: { family: 'reference', hints: RO_IDEMPOTENT },
  list_reference_lorebook: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_lorebook: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_lorebook_batch: { family: 'reference', hints: RO_IDEMPOTENT },
  list_reference_regex: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_regex: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_regex_batch: { family: 'reference', hints: RO_IDEMPOTENT },
  list_reference_lua: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_lua: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_lua_batch: { family: 'reference', hints: RO_IDEMPOTENT },
  list_reference_css: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_css: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_css_batch: { family: 'reference', hints: RO_IDEMPOTENT },
  list_reference_risup_prompt_items: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_risup_prompt_item: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_risup_prompt_item_batch: { family: 'reference', hints: RO_IDEMPOTENT },
  read_reference_risup_formating_order: { family: 'reference', hints: RO_IDEMPOTENT },

  // ── Charx Asset ────────────────────────────────────────────────────────
  list_charx_assets: { family: 'charx-asset', hints: RO_IDEMPOTENT },
  read_charx_asset: { family: 'charx-asset', hints: RO_IDEMPOTENT },
  add_charx_asset: { family: 'charx-asset', hints: WRITE },
  delete_charx_asset: { family: 'charx-asset', hints: DESTRUCTIVE },
  rename_charx_asset: { family: 'charx-asset', hints: WRITE_IDEMPOTENT },

  // ── Risum Asset ────────────────────────────────────────────────────────
  list_risum_assets: { family: 'risum-asset', hints: RO_IDEMPOTENT },
  read_risum_asset: { family: 'risum-asset', hints: RO_IDEMPOTENT },
  add_risum_asset: { family: 'risum-asset', hints: WRITE },
  delete_risum_asset: { family: 'risum-asset', hints: DESTRUCTIVE },

  // ── Asset Compression ──────────────────────────────────────────────────
  compress_assets_webp: { family: 'asset-compression', hints: DESTRUCTIVE },

  // ── Risup Prompt ───────────────────────────────────────────────────────
  list_risup_prompt_items: { family: 'risup-prompt', hints: RO_IDEMPOTENT },
  read_risup_prompt_item: { family: 'risup-prompt', hints: RO_IDEMPOTENT },
  read_risup_prompt_item_batch: { family: 'risup-prompt', hints: RO_IDEMPOTENT },
  search_in_risup_prompt_items: { family: 'risup-prompt', hints: RO_IDEMPOTENT },
  write_risup_prompt_item: { family: 'risup-prompt', hints: WRITE_IDEMPOTENT },
  write_risup_prompt_item_batch: { family: 'risup-prompt', hints: WRITE },
  add_risup_prompt_item: { family: 'risup-prompt', hints: WRITE },
  add_risup_prompt_item_batch: { family: 'risup-prompt', hints: WRITE },
  delete_risup_prompt_item: { family: 'risup-prompt', hints: DESTRUCTIVE },
  batch_delete_risup_prompt_items: { family: 'risup-prompt', hints: DESTRUCTIVE },
  reorder_risup_prompt_items: { family: 'risup-prompt', hints: WRITE_IDEMPOTENT },
  read_risup_formating_order: { family: 'risup-prompt', hints: RO_IDEMPOTENT },
  write_risup_formating_order: { family: 'risup-prompt', hints: WRITE_IDEMPOTENT },
  diff_risup_prompt: { family: 'risup-prompt', hints: RO_IDEMPOTENT },
  export_risup_prompt_to_text: { family: 'risup-prompt', hints: RO_IDEMPOTENT },
  copy_risup_prompt_items_as_text: { family: 'risup-prompt', hints: RO_IDEMPOTENT },
  import_risup_prompt_from_text: { family: 'risup-prompt', hints: WRITE },
  list_risup_prompt_snippets: { family: 'risup-prompt', hints: OPEN_WORLD_RO },
  read_risup_prompt_snippet: { family: 'risup-prompt', hints: OPEN_WORLD_RO },
  save_risup_prompt_snippet: { family: 'risup-prompt', hints: OPEN_WORLD_WRITE },
  insert_risup_prompt_snippet: { family: 'risup-prompt', hints: OPEN_WORLD_WRITE },
  delete_risup_prompt_snippet: { family: 'risup-prompt', hints: { ...DESTRUCTIVE, openWorldHint: true } },
  validate_risup_prompt_import: { family: 'risup-prompt', hints: RO_IDEMPOTENT },

  // ── Skill / Docs ───────────────────────────────────────────────────────
  list_skills: { family: 'skill', hints: RO_IDEMPOTENT },
  read_skill: { family: 'skill', hints: OPEN_WORLD_RO },

  // ── Danbooru (MCP-only, no HTTP routes) ────────────────────────────────
  tag_db_status: { family: 'danbooru', hints: RO_IDEMPOTENT },
  validate_danbooru_tags: { family: 'danbooru', hints: OPEN_WORLD_RO },
  search_danbooru_tags: { family: 'danbooru', hints: OPEN_WORLD_RO },
  get_popular_danbooru_tags: { family: 'danbooru', hints: RO_IDEMPOTENT },

  // ── CBS Validation ─────────────────────────────────────────────────────
  validate_cbs: { family: 'cbs', hints: RO_IDEMPOTENT },
  list_cbs_toggles: { family: 'cbs', hints: RO_IDEMPOTENT },
  simulate_cbs: { family: 'cbs', hints: RO_IDEMPOTENT },
  diff_cbs: { family: 'cbs', hints: RO_IDEMPOTENT },
};

// ────────────────────────────────────────────────────────────────────────────
// Derived constants & helpers
// ────────────────────────────────────────────────────────────────────────────

/** Sorted list of all tool names in the taxonomy. */
export const ALL_TOOL_NAMES: readonly string[] = Object.keys(TOOL_TAXONOMY).sort();

/** Get the family for a tool name. Returns undefined if the tool is not in the taxonomy. */
export function getToolFamily(name: string): ToolFamily | undefined {
  return TOOL_TAXONOMY[name]?.family;
}

/** Get MCP SDK ToolAnnotations for a tool. Returns undefined if not in taxonomy. */
export function getToolAnnotations(name: string): BehaviorHints | undefined {
  return TOOL_TAXONOMY[name]?.hints;
}

/**
 * Return additive mutation capability metadata for tools that mutate state.
 *
 * Read-only tools return undefined because they do not participate in confirmation or dry-run flows.
 * Non-read-only tools default to confirmation=true unless explicitly exempted.
 */
export function getToolMutationMeta(name: string): MutationMeta | undefined {
  const hints = TOOL_TAXONOMY[name]?.hints;
  if (!hints) return undefined;
  if (hints.readOnlyHint === true) return undefined;
  return {
    requiresConfirmation: !NO_CONFIRMATION_TOOL_NAME_SET.has(name),
    supportsDryRun: DRY_RUN_TOOL_NAME_SET.has(name),
  };
}

function toolNameHasSegment(name: string, segment: string): boolean {
  return name.split('_').includes(segment);
}

export function getToolWorkflowStages(name: string): readonly ToolWorkflowStage[] {
  const entry = TOOL_TAXONOMY[name];
  if (!entry) return [];

  const stages = new Set<ToolWorkflowStage>();

  if (
    name === 'list_tool_profiles' ||
    name.startsWith('inspect_') ||
    name.startsWith('list_') ||
    name.startsWith('session_')
  ) {
    stages.add('discover');
  }
  if (
    name === 'read_content' ||
    name === 'load_guidance' ||
    toolNameHasSegment(name, 'read') ||
    name.startsWith('probe_')
  ) {
    stages.add('read');
  }
  if (toolNameHasSegment(name, 'search')) {
    stages.add('search');
  }
  if (
    toolNameHasSegment(name, 'validate') ||
    toolNameHasSegment(name, 'diff') ||
    toolNameHasSegment(name, 'simulate')
  ) {
    stages.add('validate');
  }

  if (entry.hints.readOnlyHint !== true) {
    if (name === 'preview_edit' || DRY_RUN_TOOL_NAME_SET.has(name)) {
      stages.add('preview');
    }
    if (name !== 'preview_edit') {
      stages.add('apply');
    }
  } else if (stages.size === 0) {
    stages.add('read');
  }

  return TOOL_WORKFLOW_STAGES.filter((stage) => stages.has(stage));
}

export function resolveToolSurfaceProfileName(name: string | undefined): ToolSurfaceProfileName | undefined {
  if (!name) return DEFAULT_TOOL_SURFACE_PROFILE;
  const normalized = name.trim().toLowerCase();
  if ((TOOL_SURFACE_PROFILE_NAMES as readonly string[]).includes(normalized)) {
    return normalized as ToolSurfaceProfileName;
  }
  return TOOL_SURFACE_PROFILE_ALIASES[normalized as keyof typeof TOOL_SURFACE_PROFILE_ALIASES];
}

export function getToolSurfaceProfileContract(name: string): ToolSurfaceProfileContract | undefined {
  const resolved = resolveToolSurfaceProfileName(name);
  if (!resolved) return undefined;
  return TOOL_SURFACE_PROFILE_CONTRACTS.find((profile) => profile.name === resolved);
}

export function getToolProfilesForTool(name: string): readonly ToolSurfaceProfileName[] {
  const entry = TOOL_TAXONOMY[name];
  if (!entry) return [];

  const profiles = new Set<ToolSurfaceProfileName>(['advanced-full']);
  const surfaceKind = entry.surfaceKind ?? 'granular';

  if (surfaceKind === 'facade') {
    profiles.add('facade-first');
    profiles.add('authoring');
  }
  if (AUTHORING_PROFILE_FAMILIES.has(entry.family)) {
    profiles.add('authoring');
  }
  if (entry.hints.readOnlyHint === true) {
    profiles.add('readonly');
  }

  return TOOL_SURFACE_PROFILE_NAMES.filter((profile) => profiles.has(profile));
}

export interface ToolSurfaceProfileCatalogTool {
  name: string;
  family: ToolFamily;
  surfaceKind: ToolSurfaceKind;
  recommendation: ToolRecommendation;
  workflowStages: readonly ToolWorkflowStage[];
  readOnly: boolean;
}

export interface ToolSurfaceProfileCatalog {
  defaultProfile: ToolSurfaceProfileName;
  requestedProfile: string | undefined;
  resolvedProfile: ToolSurfaceProfileName;
  filteringStatus: ToolSurfaceProfileFilteringStatus;
  toolsListBehavior: 'unfiltered-compatible';
  legacyEscapeHatch: ToolSurfaceProfileName | false;
  aliases: typeof TOOL_SURFACE_PROFILE_ALIASES;
  profiles: readonly ToolSurfaceProfileContract[];
  tools: readonly ToolSurfaceProfileCatalogTool[];
  counts: {
    profileTools: number;
    allTools: number;
    hiddenFromToolsList: 0;
  };
  requestPath: readonly string[];
}

export function listToolsForSurfaceProfile(profileName?: string): readonly string[] {
  const resolved = resolveToolSurfaceProfileName(profileName);
  if (!resolved) return [];
  return ALL_TOOL_NAMES.filter((name) => getToolProfilesForTool(name).includes(resolved));
}

export function buildToolSurfaceProfileCatalog(profileName?: string): ToolSurfaceProfileCatalog | undefined {
  const resolved = resolveToolSurfaceProfileName(profileName);
  if (!resolved) return undefined;
  const contract = getToolSurfaceProfileContract(resolved);
  if (!contract) return undefined;
  const tools = listToolsForSurfaceProfile(resolved).map((name) => {
    const entry = TOOL_TAXONOMY[name];
    return {
      name,
      family: entry.family,
      surfaceKind: entry.surfaceKind ?? 'granular',
      recommendation: entry.recommendation ?? 'advanced',
      workflowStages: getToolWorkflowStages(name),
      readOnly: entry.hints.readOnlyHint === true,
    };
  });
  return {
    defaultProfile: DEFAULT_TOOL_SURFACE_PROFILE,
    requestedProfile: profileName,
    resolvedProfile: resolved,
    filteringStatus: contract.filteringStatus,
    toolsListBehavior: 'unfiltered-compatible',
    legacyEscapeHatch: contract.legacyEscapeHatch,
    aliases: TOOL_SURFACE_PROFILE_ALIASES,
    profiles: TOOL_SURFACE_PROFILE_CONTRACTS,
    tools,
    counts: {
      profileTools: tools.length,
      allTools: ALL_TOOL_NAMES.length,
      hiddenFromToolsList: 0,
    },
    requestPath: [
      `Call list_tool_profiles with profile="${resolved}" to get this compact catalog.`,
      'Use the returned tool names for local planning; tools/list remains unfiltered for client compatibility.',
      contract.legacyEscapeHatch
        ? `Escalate to ${contract.legacyEscapeHatch} when this profile cannot express the workflow.`
        : 'This profile is the full legacy-compatible tool surface.',
    ],
  };
}

/** Build the MCP `_meta` payload for a tool, if it exposes mutation capability metadata. */
export function getToolMeta(name: string): Record<string, unknown> | undefined {
  const family = getToolFamily(name);
  if (!family) return undefined;
  const mutationMeta = getToolMutationMeta(name);
  const meta: Record<string, unknown> = {
    [TOOL_META_KEYS.family]: family,
    [TOOL_META_KEYS.staleGuards]: TOOL_STALE_GUARD_NAMES[name] ?? [],
    [TOOL_META_KEYS.staleGuardDetails]: TOOL_STALE_GUARD_DETAILS[name] ?? [],
    [TOOL_META_KEYS.surfaceKind]: TOOL_TAXONOMY[name]?.surfaceKind ?? 'granular',
    [TOOL_META_KEYS.recommendation]: TOOL_TAXONOMY[name]?.recommendation ?? 'advanced',
    [TOOL_META_KEYS.workflowStages]: getToolWorkflowStages(name),
    [TOOL_META_KEYS.profiles]: getToolProfilesForTool(name),
    [TOOL_META_KEYS.defaultProfile]: DEFAULT_TOOL_SURFACE_PROFILE,
  };
  if (mutationMeta) {
    meta[TOOL_META_KEYS.requiresConfirmation] = mutationMeta.requiresConfirmation;
    meta[TOOL_META_KEYS.supportsDryRun] = mutationMeta.supportsDryRun;
  }
  return meta;
}

/**
 * Build a family → tool-name[] lookup.
 * Useful for tests and documentation generation.
 */
export function getToolsByFamily(): Record<ToolFamily, string[]> {
  const result = {} as Record<ToolFamily, string[]>;
  for (const family of TOOL_FAMILIES) {
    result[family] = [];
  }
  for (const [name, entry] of Object.entries(TOOL_TAXONOMY)) {
    result[entry.family].push(name);
  }
  for (const family of TOOL_FAMILIES) {
    result[family].sort();
  }
  return result;
}
