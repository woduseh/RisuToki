import { z } from 'zod';

import type { createDanbooruEngine } from './mcp-danbooru-engine';
import { MCP_TOOL_DESCRIPTIONS } from './mcp-tool-descriptions';
import type { McpToolRegistrationDeps, McpToolServer } from './mcp-tool-registration';

interface ValidationToolRegistrationDeps extends McpToolRegistrationDeps {
  danbooruEngine: ReturnType<typeof createDanbooruEngine>;
}

export function registerValidationTools(server: McpToolServer, deps: ValidationToolRegistrationDeps): void {
  const { apiRequest, danbooruEngine, textResult } = deps;

  // ===== Danbooru Tools (local — no apiRequest) =====

  server.tool('tag_db_status', MCP_TOOL_DESCRIPTIONS['tag_db_status'], {}, async () => {
    const status = danbooruEngine.getStatus();
    return textResult({
      ...status,
      ...(status.loaded
        ? {}
        : {
            suggestion: status.fileExists
              ? 'Tags file found but failed to parse. Check file format.'
              : 'Tags file not found. Ensure resources/Danbooru Tag.txt is packaged.',
          }),
    });
  });

  server.tool(
    'validate_danbooru_tags',
    MCP_TOOL_DESCRIPTIONS['validate_danbooru_tags'],
    {
      tags: z
        .array(z.string())
        .describe('List of tags to validate (e.g. ["blue_eyes", "long_hair", "school_uniform"])'),
      online_fallback: z
        .boolean()
        .optional()
        .describe('If true, check Danbooru API for tags not found locally (default: true)'),
    },
    async ({ tags, online_fallback }) => {
      danbooruEngine.ensureTagsLoaded();
      const onlineFallback = online_fallback !== false;
      const results = await danbooruEngine.validateTags(tags, onlineFallback);
      const validCount = results.filter((result) => result.status === 'valid').length;
      const invalidCount = results.filter((result) => result.status === 'invalid').length;
      const unknownCount = results.filter((result) => result.status === 'unknown').length;
      return textResult({
        summary:
          `${validCount}/${tags.length} tags valid` +
          `${invalidCount > 0 ? `, ${invalidCount} invalid` : ''}` +
          `${unknownCount > 0 ? `, ${unknownCount} unknown` : ''}`,
        counts: { valid: validCount, invalid: invalidCount, unknown: unknownCount },
        network_degraded: results.some((result) => result.status === 'unknown'),
        results,
      });
    },
  );

  server.tool(
    'search_danbooru_tags',
    MCP_TOOL_DESCRIPTIONS['search_danbooru_tags'],
    {
      query: z.string().describe('Search query (e.g. "blue_eye", "long_h*", "school"). Supports * wildcard.'),
      category: z.string().optional().describe('Filter by tag category: general, artist, copyright, character, meta'),
      limit: z.number().optional().describe('Max results (default: 20, max: 50)'),
    },
    async ({ query, category, limit }) => {
      danbooruEngine.ensureTagsLoaded();
      const effectiveLimit = Math.min(limit || 20, 50);
      const results = await danbooruEngine.searchWithOnline(query, category, effectiveLimit);
      return textResult({ query, count: results.length, tags: danbooruEngine.formatTags(results) });
    },
  );

  server.tool(
    'get_popular_danbooru_tags',
    MCP_TOOL_DESCRIPTIONS['get_popular_danbooru_tags'],
    {
      category: z.string().optional().describe('Filter by tag category: general, artist, copyright, character, meta'),
      limit: z.number().optional().describe('Max results per group or total (default: 100, max: 500)'),
      group_by_semantic: z
        .boolean()
        .optional()
        .describe('If true, returns tags grouped by semantic category (hair_color, eye_color, clothing, pose, etc.)'),
    },
    async ({ category, limit, group_by_semantic }) => {
      danbooruEngine.ensureTagsLoaded();
      if (group_by_semantic) {
        const groups = danbooruEngine.getPopularGrouped();
        return textResult({
          description:
            'Popular Danbooru tags grouped by semantic category. Use these as reference when writing prompts.',
          groups,
        });
      }
      const effectiveLimit = Math.min(limit || 100, 500);
      const results = danbooruEngine.getPopular(category, effectiveLimit);
      return textResult({ count: results.length, tags: danbooruEngine.formatTags(results) });
    },
  );

  // ==================== CBS Validation ====================

  server.tool(
    'validate_cbs',
    MCP_TOOL_DESCRIPTIONS['validate_cbs'],
    {
      field: z
        .string()
        .optional()
        .describe('Specific field to validate (e.g., globalNote, description). Omit to scan all fields.'),
      lorebook_index: z.number().optional().describe('Specific lorebook entry index to validate.'),
      all_combos: z
        .boolean()
        .optional()
        .describe('Test all toggle combinations for resolve errors (max 1024 combos). Default: false.'),
      file_path: z
        .string()
        .optional()
        .describe(
          'Absolute path to an external .charx/.risum/.risup file. When provided, validates CBS in that file instead of the current document.',
        ),
    },
    async ({ field, lorebook_index, all_combos, file_path }) => {
      const params = new URLSearchParams();
      if (field) params.set('field', field);
      if (lorebook_index !== undefined) params.set('lorebook_index', String(lorebook_index));
      if (all_combos) params.set('all_combos', 'true');
      if (file_path) params.set('file_path', file_path);
      const qs = params.toString();
      const result = await apiRequest('GET', `/cbs/validate${qs ? '?' + qs : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'list_cbs_toggles',
    MCP_TOOL_DESCRIPTIONS['list_cbs_toggles'],
    {
      field: z.string().optional().describe('Specific field to scan. Omit to scan all fields.'),
      lorebook_index: z.number().optional().describe('Specific lorebook entry index to scan.'),
    },
    async ({ field, lorebook_index }) => {
      const params = new URLSearchParams();
      if (field) params.set('field', field);
      if (lorebook_index !== undefined) params.set('lorebook_index', String(lorebook_index));
      const qs = params.toString();
      const result = await apiRequest('GET', `/cbs/toggles${qs ? '?' + qs : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'simulate_cbs',
    MCP_TOOL_DESCRIPTIONS['simulate_cbs'],
    {
      field: z.string().describe('Field to simulate (e.g., globalNote, description). Required.'),
      lorebook_index: z.number().optional().describe('Lorebook entry index (if field is a lorebook entry).'),
      toggles: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          'Toggle values as {name: value} object. toggle_ prefix auto-added. Example: {"Narration": "0", "Claude": "1"}',
        ),
      all_combos: z.boolean().optional().describe('Generate all toggle combinations (max 256). Default: false.'),
      compact: z.boolean().optional().describe('Compress consecutive blank lines. Default: true.'),
    },
    async ({ field, lorebook_index, toggles, all_combos, compact }) => {
      const body: Record<string, unknown> = { field };
      if (lorebook_index !== undefined) body.lorebook_index = lorebook_index;
      if (toggles) body.toggles = toggles;
      if (all_combos !== undefined) body.all_combos = all_combos;
      if (compact !== undefined) body.compact = compact;
      const result = await apiRequest('POST', '/cbs/simulate', body);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'diff_cbs',
    MCP_TOOL_DESCRIPTIONS['diff_cbs'],
    {
      field: z.string().describe('Field to compare (e.g., globalNote, description). Required.'),
      lorebook_index: z.number().optional().describe('Lorebook entry index (if field is a lorebook entry).'),
      toggles: z
        .record(z.string(), z.string())
        .describe('Toggle values to compare against baseline. toggle_ prefix auto-added. Example: {"Narration": "3"}'),
    },
    async ({ field, lorebook_index, toggles }) => {
      const body: Record<string, unknown> = { field, toggles };
      if (lorebook_index !== undefined) body.lorebook_index = lorebook_index;
      const result = await apiRequest('POST', '/cbs/diff', body);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}
