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
 *   - `next_actions` are deterministic: derived from the tool's family in the taxonomy
 *     unless explicitly overridden.
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
  /** Key details from the operation (counts, sizes, names). */
  artifacts?: Record<string, unknown>;
  /** Explicit override for suggested follow-up tool names. */
  nextActions?: string[];
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
  reference: ['list_references', 'list_reference_lorebook', 'list_reference_regex'],
  'charx-asset': ['list_charx_assets', 'read_charx_asset', 'add_charx_asset'],
  'risum-asset': ['list_risum_assets', 'read_risum_asset', 'add_risum_asset'],
  'asset-compression': ['compress_assets_webp', 'list_charx_assets'],
  'risup-prompt': ['list_risup_prompt_items', 'read_risup_prompt_item', 'read_risup_formating_order'],
  skill: ['list_skills', 'read_skill'],
  danbooru: ['validate_danbooru_tags', 'search_danbooru_tags', 'get_popular_danbooru_tags'],
  cbs: ['validate_cbs', 'simulate_cbs', 'diff_cbs'],
  snapshot: ['list_snapshots', 'snapshot_field', 'restore_snapshot'],
  search: ['search_in_field', 'search_all_fields', 'read_field'],
  'lorebook-io': ['list_lorebook', 'export_lorebook_to_files', 'import_lorebook_from_files'],
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
  return {
    ...payload,
    status: 200,
    summary: opts.summary,
    next_actions: nextActions,
    artifacts: opts.artifacts ?? {},
  };
}

function resolveNextActions(opts: McpSuccessOptions): string[] {
  if (opts.nextActions) return opts.nextActions;
  if (!opts.toolName) return [];
  const entry = TOOL_TAXONOMY[opts.toolName];
  if (!entry) return [];
  return FAMILY_NEXT_ACTIONS[entry.family] ?? [];
}

// Compile-time check: ensure FAMILY_NEXT_ACTIONS covers all families
(function _coverageCheck() {
  const _: Record<ToolFamily, string[]> = FAMILY_NEXT_ACTIONS;
  void _;
  void TOOL_FAMILIES;
})();
