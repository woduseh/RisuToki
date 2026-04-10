/**
 * MCP Success Response Envelope — additive observation contract for agent tooling.
 *
 * This module provides a shared helper that enriches MCP success responses with
 * structured observation fields (`status`, `summary`, `next_actions`, `artifacts`)
 * to improve agent reasoning without breaking existing clients.
 *
 * Contract:
 *   - All existing top-level fields in the original payload are preserved.
 *   - Envelope fields are merged at the top level (never wrapped under `data`).
 *   - The original payload object is never mutated.
 *   - `status` is always 200 for success responses.
 *   - `next_actions` are deterministic: explicit override → per-tool override → family default.
 */

import { TOOL_TAXONOMY, TOOL_FAMILIES } from './mcp-tool-taxonomy';
import type { ToolFamily } from './mcp-tool-taxonomy';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface McpSuccessOptions {
  /** Tool name used to derive family-based next_actions. */
  toolName?: string;
  /** Human-readable one-liner describing the outcome. */
  summary: string;
  /** Key details from the operation (counts, sizes, names). `byte_size` is added automatically. */
  artifacts?: Record<string, unknown>;
  /** Explicit override for suggested follow-up tool names. */
  nextActions?: string[];
}

export interface McpErrorInfo {
  action: string;
  target: string;
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
  rejected?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Family → suggested next actions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic next-action suggestions per tool family.
 * After a tool in family X completes, agents benefit from knowing
 * which tools are logical follow-ups.
 */
export const FAMILY_NEXT_ACTIONS: Record<ToolFamily, string[]> = {
  field: ['list_fields', 'read_field', 'search_in_field', 'write_field'],
  probe: ['open_file', 'probe_field', 'probe_lorebook'],
  lorebook: ['list_lorebook', 'read_lorebook', 'write_lorebook', 'validate_lorebook_keys'],
  regex: ['list_regex', 'read_regex', 'write_regex'],
  greeting: ['list_greetings', 'read_greeting', 'write_greeting'],
  trigger: ['list_triggers', 'read_trigger', 'write_trigger'],
  lua: ['list_lua', 'read_lua', 'write_lua'],
  css: ['list_css', 'read_css', 'write_css'],
  reference: [
    'list_references',
    'search_in_reference_field',
    'read_reference_field_range',
    'list_reference_lorebook',
    'list_reference_lua',
    'list_reference_css',
    'list_reference_regex',
    'list_reference_greetings',
    'list_reference_triggers',
    'list_reference_risup_prompt_items',
  ],
  'charx-asset': ['list_charx_assets', 'read_charx_asset', 'add_charx_asset'],
  'risum-asset': ['list_risum_assets', 'read_risum_asset', 'add_risum_asset'],
  'asset-compression': ['compress_assets_webp', 'list_charx_assets'],
  'risup-prompt': [
    'list_risup_prompt_items',
    'search_in_risup_prompt_items',
    'read_risup_formating_order',
    'diff_risup_prompt',
    'export_risup_prompt_to_text',
    'import_risup_prompt_from_text',
    'list_risup_prompt_snippets',
    'read_risup_prompt_snippet',
    'save_risup_prompt_snippet',
    'insert_risup_prompt_snippet',
  ],
  skill: ['list_skills', 'read_skill'],
  danbooru: ['validate_danbooru_tags', 'search_danbooru_tags', 'get_popular_danbooru_tags'],
  cbs: ['validate_cbs', 'simulate_cbs', 'diff_cbs'],
  snapshot: ['list_snapshots', 'snapshot_field', 'restore_snapshot'],
  search: ['search_in_field', 'search_all_fields', 'read_field'],
  'lorebook-io': ['list_lorebook', 'export_lorebook_to_files', 'import_lorebook_from_files'],
  session: ['session_status', 'open_file', 'list_references', 'list_snapshots'],
};

/**
 * Narrower follow-up suggestions for high-traffic tools whose best next step is
 * more specific than the generic family default.
 */
export const TOOL_NEXT_ACTIONS: Partial<Record<keyof typeof TOOL_TAXONOMY, string[]>> = {
  open_file: ['session_status', 'list_fields', 'list_references'],
  read_field: ['search_in_field', 'read_field_range', 'get_field_stats', 'snapshot_field', 'write_field'],
  write_field: ['read_field', 'search_in_field', 'get_field_stats', 'snapshot_field'],
  read_field_batch: ['search_in_field', 'read_field_range', 'write_field_batch', 'snapshot_field'],
  search_in_field: [
    'read_field_range',
    'snapshot_field',
    'replace_in_field',
    'replace_block_in_field',
    'insert_in_field',
  ],
  list_references: [
    'read_reference_field',
    'search_in_reference_field',
    'read_reference_field_range',
    'list_reference_lorebook',
    'list_reference_risup_prompt_items',
  ],
  read_reference_field: ['list_references', 'search_in_reference_field', 'read_reference_field_range'],
  read_reference_field_batch: ['list_references', 'search_in_reference_field', 'read_reference_field_range'],
  read_risup_prompt_item_batch: [
    'read_risup_formating_order',
    'diff_risup_prompt',
    'write_risup_prompt_item_batch',
    'export_risup_prompt_to_text',
  ],
  write_risup_prompt_item: ['list_risup_prompt_items', 'read_risup_formating_order', 'diff_risup_prompt'],
  write_risup_prompt_item_batch: ['list_risup_prompt_items', 'read_risup_formating_order', 'diff_risup_prompt'],
  add_risup_prompt_item: ['list_risup_prompt_items', 'read_risup_formating_order', 'diff_risup_prompt'],
  add_risup_prompt_item_batch: ['list_risup_prompt_items', 'read_risup_formating_order', 'diff_risup_prompt'],
};

// ────────────────────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────────────────────

/**
 * Enrich an MCP success payload with structured observation fields.
 *
 * - Returns a **new** object; never mutates the input `payload`.
 * - Envelope fields (`status`, `summary`, `next_actions`, `artifacts`) are
 *   merged at the top level, overriding any same-named keys in the payload.
 * - All other payload keys are preserved as-is.
 */
export function mcpSuccess(payload: Record<string, unknown>, opts: McpSuccessOptions): Record<string, unknown> {
  const nextActions = resolveNextActions(opts);
  const artifacts = createArtifacts(payload, opts, nextActions);
  return {
    ...payload,
    status: 200,
    summary: opts.summary,
    next_actions: nextActions,
    artifacts,
  };
}

function resolveNextActions(opts: McpSuccessOptions): string[] {
  if (opts.nextActions) return opts.nextActions;
  if (!opts.toolName) return [];
  const toolOverride = TOOL_NEXT_ACTIONS[opts.toolName];
  if (toolOverride) return toolOverride;
  const entry = TOOL_TAXONOMY[opts.toolName];
  if (!entry) return [];
  return FAMILY_NEXT_ACTIONS[entry.family] ?? [];
}

function createArtifacts(
  payload: Record<string, unknown>,
  opts: McpSuccessOptions,
  nextActions: string[],
): Record<string, unknown> {
  const baseArtifacts = opts.artifacts ?? {};
  const responseWithoutByteSize = {
    ...payload,
    status: 200,
    summary: opts.summary,
    next_actions: nextActions,
    artifacts: baseArtifacts,
  };

  return {
    ...baseArtifacts,
    byte_size: Buffer.byteLength(JSON.stringify(responseWithoutByteSize), 'utf8'),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Error/no-op recovery metadata
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map from MCP error `target` prefixes to tool families.
 * The target format is `prefix:...`; we extract the first segment.
 */
const TARGET_PREFIX_TO_FAMILY: Record<string, ToolFamily> = {
  field: 'field',
  probe: 'probe',
  open: 'probe',
  lorebook: 'lorebook',
  regex: 'regex',
  greeting: 'greeting',
  greetings: 'greeting',
  trigger: 'trigger',
  lua: 'lua',
  css: 'css',
  'css-section': 'css',
  reference: 'reference',
  asset: 'charx-asset',
  assets: 'charx-asset',
  'risum-asset': 'risum-asset',
  risup: 'risup-prompt',
  skill: 'skill',
  skills: 'skill',
  danbooru: 'danbooru',
  cbs: 'cbs',
  snapshot: 'snapshot',
  search: 'search',
  session: 'session',
  '/search-all': 'search',
};

/**
 * Special next_actions for targets that don't map to a tool family.
 */
const SPECIAL_TARGET_NEXT_ACTIONS: Record<string, string[]> = {
  'document:current': ['open_file', 'list_references', 'session_status'],
};

export interface McpErrorRecoveryMeta {
  retryable: boolean;
  next_actions: string[];
}

/**
 * Derive recovery metadata for error/no-op responses.
 *
 * - `retryable`: true only for conflict (409) and server-error (5xx) statuses
 * - `next_actions`: derived from the `target` prefix using the tool taxonomy
 */
export function errorRecoveryMeta(target: string, status: number): McpErrorRecoveryMeta {
  const retryable = status === 409 || status >= 500;
  const nextActions = resolveErrorNextActions(target);
  return { retryable, next_actions: nextActions };
}

function resolveErrorNextActions(target: string): string[] {
  // Check special full-target overrides first
  if (SPECIAL_TARGET_NEXT_ACTIONS[target]) {
    return SPECIAL_TARGET_NEXT_ACTIONS[target];
  }
  // Extract prefix before first colon
  const prefix = target.split(':')[0];
  const family = TARGET_PREFIX_TO_FAMILY[prefix];
  if (!family) return [];
  return FAMILY_NEXT_ACTIONS[family] ?? [];
}

// Compile-time check: ensure FAMILY_NEXT_ACTIONS covers all families
(function _coverageCheck() {
  const _: Record<ToolFamily, string[]> = FAMILY_NEXT_ACTIONS;
  void _;
  void TOOL_FAMILIES;
})();
