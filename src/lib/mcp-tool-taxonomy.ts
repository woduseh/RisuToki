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

export const TOOL_MUTATION_META_KEYS = {
  requiresConfirmation: 'risutoki/requiresConfirmation',
  supportsDryRun: 'risutoki/supportsDryRun',
} as const;

export const NO_CONFIRMATION_TOOL_NAMES = ['open_file', 'snapshot_field'] as const;

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
] as const;

const NO_CONFIRMATION_TOOL_NAME_SET = new Set<string>(NO_CONFIRMATION_TOOL_NAMES);
const DRY_RUN_TOOL_NAME_SET = new Set<string>(DRY_RUN_TOOL_NAMES);

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
}

// ────────────────────────────────────────────────────────────────────────────
// Canonical tool → family + hints map
// ────────────────────────────────────────────────────────────────────────────

export const TOOL_TAXONOMY: Record<string, ToolEntry> = {
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

/** Build the MCP `_meta` payload for a tool, if it exposes mutation capability metadata. */
export function getToolMeta(name: string): Record<string, unknown> | undefined {
  const mutationMeta = getToolMutationMeta(name);
  if (!mutationMeta) return undefined;
  return {
    [TOOL_MUTATION_META_KEYS.requiresConfirmation]: mutationMeta.requiresConfirmation,
    [TOOL_MUTATION_META_KEYS.supportsDryRun]: mutationMeta.supportsDryRun,
  };
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
