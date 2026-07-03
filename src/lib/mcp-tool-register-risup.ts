import { z } from 'zod';

import { MCP_TOOL_DESCRIPTIONS } from './mcp-tool-descriptions';
import type { McpToolRegistrationDeps, McpToolServer } from './mcp-tool-registration';

export function registerRisupTools(server: McpToolServer, deps: McpToolRegistrationDeps): void {
  const { apiRequest, textResult } = deps;

  // ===== Risup Prompt Item Tools =====

  server.tool('list_risup_prompt_items', MCP_TOOL_DESCRIPTIONS['list_risup_prompt_items'], {}, async () =>
    textResult(await apiRequest('GET', '/risup/prompt-items')),
  );

  server.tool(
    'search_in_risup_prompt_items',
    MCP_TOOL_DESCRIPTIONS['search_in_risup_prompt_items'],
    {
      query: z.string().min(1).describe('Substring to search for inside prompt items.'),
      caseSensitive: z.boolean().optional().describe('When true, use case-sensitive matching. Default: false.'),
    },
    async ({ query, caseSensitive }) =>
      textResult(await apiRequest('POST', '/risup/prompt-items/search', { query, caseSensitive })),
  );

  server.tool(
    'read_risup_prompt_item',
    MCP_TOOL_DESCRIPTIONS['read_risup_prompt_item'],
    {
      index: z
        .number()
        .describe('Zero-based index of the prompt item. Use list_risup_prompt_items to find valid indices.'),
    },
    async ({ index }) => textResult(await apiRequest('GET', `/risup/prompt-item/${index}`)),
  );

  server.tool(
    'read_risup_prompt_item_batch',
    MCP_TOOL_DESCRIPTIONS['read_risup_prompt_item_batch'],
    {
      indices: z.array(z.number()).max(50).describe('Zero-based prompt item indices to read (maximum 50).'),
    },
    async ({ indices }) => textResult(await apiRequest('POST', '/risup/prompt-item/batch', { indices })),
  );

  server.tool(
    'write_risup_prompt_item',
    MCP_TOOL_DESCRIPTIONS['write_risup_prompt_item'],
    {
      index: z
        .number()
        .describe('Zero-based index of the prompt item to replace. Use list_risup_prompt_items to find valid indices.'),
      item: z
        .record(z.string(), z.unknown())
        .describe(
          'Replacement item object. Must be a supported type. Example: { "type": "plain", "type2": "normal", "text": "...", "role": "system" }',
        ),
      expected_type: z
        .string()
        .optional()
        .describe('Optional stale-index guard: the current prompt item type must still match.'),
      expected_preview: z
        .string()
        .optional()
        .describe(
          'Optional stale-index guard: the current prompt item preview from list_risup_prompt_items must still match.',
        ),
    },
    async ({ index, item, expected_type, expected_preview }) =>
      textResult(await apiRequest('POST', `/risup/prompt-item/${index}`, { item, expected_type, expected_preview })),
  );

  server.tool(
    'write_risup_prompt_item_batch',
    MCP_TOOL_DESCRIPTIONS['write_risup_prompt_item_batch'],
    {
      writes: z
        .array(
          z.object({
            index: z.number().describe('Zero-based index of the prompt item to replace.'),
            item: z
              .record(z.string(), z.unknown())
              .describe('Replacement item object. Must be a supported prompt item type.'),
            expected_type: z
              .string()
              .optional()
              .describe('Optional stale-index guard: the current prompt item type must still match.'),
            expected_preview: z
              .string()
              .optional()
              .describe('Optional stale-index guard: the current prompt item preview must still match.'),
          }),
        )
        .max(50)
        .describe('Batch replacement payload [{ index, item }, ...] (maximum 50).'),
    },
    async ({ writes }) => textResult(await apiRequest('POST', '/risup/prompt-item/batch-write', { writes })),
  );

  server.tool(
    'add_risup_prompt_item',
    MCP_TOOL_DESCRIPTIONS['add_risup_prompt_item'],
    {
      item: z
        .record(z.string(), z.unknown())
        .describe(
          'Item object to add. Must be a supported type. Example: { "type": "jailbreak", "type2": "normal", "text": "...", "role": "system" }',
        ),
      insertAt: z.number().optional().describe('Zero-based insertion position. Default: append to the end.'),
    },
    async ({ item, insertAt }) => textResult(await apiRequest('POST', '/risup/prompt-item/add', { item, insertAt })),
  );

  server.tool(
    'add_risup_prompt_item_batch',
    MCP_TOOL_DESCRIPTIONS['add_risup_prompt_item_batch'],
    {
      items: z
        .array(z.record(z.string(), z.unknown()))
        .max(50)
        .describe('Prompt item objects to append [{...}, {...}] (maximum 50).'),
      insertAt: z.number().optional().describe('Zero-based insertion position. Default: append to the end.'),
    },
    async ({ items, insertAt }) =>
      textResult(await apiRequest('POST', '/risup/prompt-item/batch-add', { items, insertAt })),
  );

  server.tool(
    'delete_risup_prompt_item',
    MCP_TOOL_DESCRIPTIONS['delete_risup_prompt_item'],
    {
      index: z
        .number()
        .describe('Zero-based index of the prompt item to delete. Use list_risup_prompt_items to find valid indices.'),
      expected_type: z
        .string()
        .optional()
        .describe('Optional stale-index guard: the current prompt item type must still match.'),
      expected_preview: z
        .string()
        .optional()
        .describe('Optional stale-index guard: the current prompt item preview must still match.'),
    },
    async ({ index, expected_type, expected_preview }) =>
      textResult(await apiRequest('POST', `/risup/prompt-item/${index}/delete`, { expected_type, expected_preview })),
  );

  server.tool(
    'batch_delete_risup_prompt_items',
    MCP_TOOL_DESCRIPTIONS['batch_delete_risup_prompt_items'],
    {
      indices: z.array(z.number()).max(50).describe('Zero-based indices of prompt items to delete (maximum 50).'),
      expected_types: z
        .array(z.string())
        .max(50)
        .optional()
        .describe('Optional stale-index guard: expected types aligned with indices array order.'),
      expected_previews: z
        .array(z.string())
        .max(50)
        .optional()
        .describe('Optional stale-index guard: expected previews aligned with indices array order.'),
    },
    async ({ indices, expected_types, expected_previews }) =>
      textResult(
        await apiRequest('POST', '/risup/prompt-item/batch-delete', {
          indices,
          expected_types,
          expected_previews,
        }),
      ),
  );

  server.tool(
    'reorder_risup_prompt_items',
    MCP_TOOL_DESCRIPTIONS['reorder_risup_prompt_items'],
    {
      order: z
        .array(z.number())
        .describe('New order as a permutation of [0, 1, ..., n-1]. Example: [2, 0, 1] moves item 2 to position 0.'),
    },
    async ({ order }) => textResult(await apiRequest('POST', '/risup/prompt-item/reorder', { order })),
  );

  server.tool(
    'read_risup_prompt_item_by_id',
    MCP_TOOL_DESCRIPTIONS['read_risup_prompt_item_by_id'],
    { item_id: z.string().min(1).describe('Stable prompt item id from list_risup_prompt_items.') },
    async ({ item_id }) =>
      textResult(await apiRequest('GET', `/risup/prompt-item-by-id/${encodeURIComponent(item_id)}`)),
  );

  server.tool(
    'write_risup_prompt_item_by_id',
    MCP_TOOL_DESCRIPTIONS['write_risup_prompt_item_by_id'],
    {
      item_id: z.string().min(1),
      item: z.record(z.string(), z.unknown()).describe('Replacement supported prompt item object.'),
      expected_type: z.string().optional(),
      expected_preview: z.string().optional(),
    },
    async ({ item_id, item, expected_type, expected_preview }) =>
      textResult(
        await apiRequest('POST', `/risup/prompt-item-by-id/${encodeURIComponent(item_id)}`, {
          item,
          expected_type,
          expected_preview,
        }),
      ),
  );

  server.tool(
    'delete_risup_prompt_item_by_id',
    MCP_TOOL_DESCRIPTIONS['delete_risup_prompt_item_by_id'],
    {
      item_id: z.string().min(1),
      expected_type: z.string().optional(),
      expected_preview: z.string().optional(),
    },
    async ({ item_id, expected_type, expected_preview }) =>
      textResult(
        await apiRequest('POST', `/risup/prompt-item-by-id/${encodeURIComponent(item_id)}/delete`, {
          expected_type,
          expected_preview,
        }),
      ),
  );

  server.tool(
    'write_risup_prompt_item_by_id_batch',
    MCP_TOOL_DESCRIPTIONS['write_risup_prompt_item_by_id_batch'],
    {
      writes: z
        .array(
          z.object({
            item_id: z.string().min(1),
            item: z.record(z.string(), z.unknown()),
            expected_type: z.string().optional(),
            expected_preview: z.string().optional(),
          }),
        )
        .max(50),
    },
    async ({ writes }) => textResult(await apiRequest('POST', '/risup/prompt-item/batch-write-by-id', { writes })),
  );

  server.tool(
    'batch_delete_risup_prompt_items_by_id',
    MCP_TOOL_DESCRIPTIONS['batch_delete_risup_prompt_items_by_id'],
    {
      item_ids: z.array(z.string().min(1)).max(50),
      expected_types: z.array(z.string()).max(50).optional(),
      expected_previews: z.array(z.string()).max(50).optional(),
    },
    async ({ item_ids, expected_types, expected_previews }) =>
      textResult(
        await apiRequest('POST', '/risup/prompt-item/batch-delete-by-id', {
          item_ids,
          expected_types,
          expected_previews,
        }),
      ),
  );

  server.tool(
    'reorder_risup_prompt_items_by_id',
    MCP_TOOL_DESCRIPTIONS['reorder_risup_prompt_items_by_id'],
    { order_ids: z.array(z.string().min(1)).describe('Full prompt item id permutation in the desired order.') },
    async ({ order_ids }) => textResult(await apiRequest('POST', '/risup/prompt-item/reorder-by-id', { order_ids })),
  );

  server.tool('read_risup_formating_order', MCP_TOOL_DESCRIPTIONS['read_risup_formating_order'], {}, async () =>
    textResult(await apiRequest('GET', '/risup/formating-order')),
  );

  server.tool(
    'write_risup_formating_order',
    MCP_TOOL_DESCRIPTIONS['write_risup_formating_order'],
    {
      items: z
        .array(z.object({ token: z.string().describe('Formating order token (e.g. "main", "chats", "lorebook")') }))
        .describe(
          'Ordered list of token objects. Known tokens: main, jailbreak, chats, lorebook, globalNote, authorNote, lastChat, description, postEverything, personaPrompt. Unknown string tokens are accepted.',
        ),
    },
    async ({ items }) => textResult(await apiRequest('POST', '/risup/formating-order', { items })),
  );

  server.tool(
    'diff_risup_prompt',
    MCP_TOOL_DESCRIPTIONS['diff_risup_prompt'],
    {
      refIndex: z
        .number()
        .describe('Reference file index from list_references. The selected reference must be a .risup preset.'),
    },
    async ({ refIndex }) => textResult(await apiRequest('POST', '/risup/prompt-diff', { refIndex })),
  );

  server.tool('export_risup_prompt_to_text', MCP_TOOL_DESCRIPTIONS['export_risup_prompt_to_text'], {}, async () =>
    textResult(await apiRequest('GET', '/risup/prompt-text')),
  );

  server.tool(
    'copy_risup_prompt_items_as_text',
    MCP_TOOL_DESCRIPTIONS['copy_risup_prompt_items_as_text'],
    {
      indices: z
        .array(z.number())
        .min(1)
        .max(50)
        .describe('Zero-based prompt item indices to export as text, in output order.'),
    },
    async ({ indices }) => textResult(await apiRequest('POST', '/risup/prompt-text/copy', { indices })),
  );

  server.tool(
    'import_risup_prompt_from_text',
    MCP_TOOL_DESCRIPTIONS['import_risup_prompt_from_text'],
    {
      text: z.string().describe('Structured prompt text, usually from export_risup_prompt_to_text after manual edits.'),
      dry_run: z
        .boolean()
        .optional()
        .describe('When true, validate and preview the import without writing promptTemplate.'),
      mode: z
        .enum(['replace', 'append'])
        .optional()
        .describe(
          'replace = overwrite the whole template (default), append = insert parsed items into the current template.',
        ),
      insertAt: z
        .number()
        .optional()
        .describe('When mode="append", zero-based insertion position. Default: append to the end.'),
    },
    async ({ text, dry_run, mode, insertAt }) =>
      textResult(await apiRequest('POST', '/risup/prompt-text/import', { text, dry_run, mode, insertAt })),
  );

  server.tool('list_risup_prompt_snippets', MCP_TOOL_DESCRIPTIONS['list_risup_prompt_snippets'], {}, async () =>
    textResult(await apiRequest('GET', '/risup/prompt-snippets')),
  );

  server.tool(
    'read_risup_prompt_snippet',
    MCP_TOOL_DESCRIPTIONS['read_risup_prompt_snippet'],
    {
      identifier: z.string().describe('Snippet id or exact snippet name from list_risup_prompt_snippets.'),
    },
    async ({ identifier }) => textResult(await apiRequest('POST', '/risup/prompt-snippets/read', { identifier })),
  );

  server.tool(
    'save_risup_prompt_snippet',
    MCP_TOOL_DESCRIPTIONS['save_risup_prompt_snippet'],
    {
      name: z.string().describe('Snippet name. Saving the same name again updates the existing snippet.'),
      text: z.string().optional().describe('Structured prompt text to persist as a snippet.'),
      indices: z
        .array(z.number())
        .min(1)
        .max(50)
        .optional()
        .describe('Current promptTemplate indices to serialize and save as a snippet. Requires an open .risup file.'),
    },
    async ({ name, text, indices }) =>
      textResult(await apiRequest('POST', '/risup/prompt-snippets/save', { name, text, indices })),
  );

  server.tool(
    'insert_risup_prompt_snippet',
    MCP_TOOL_DESCRIPTIONS['insert_risup_prompt_snippet'],
    {
      identifier: z.string().describe('Snippet id or exact snippet name from list_risup_prompt_snippets.'),
      dry_run: z
        .boolean()
        .optional()
        .describe('When true, validate and preview the insertion without writing promptTemplate.'),
      insertAt: z.number().optional().describe('Zero-based insertion position. Default: append to the end.'),
    },
    async ({ identifier, dry_run, insertAt }) =>
      textResult(await apiRequest('POST', '/risup/prompt-snippets/insert', { identifier, dry_run, insertAt })),
  );

  server.tool(
    'delete_risup_prompt_snippet',
    MCP_TOOL_DESCRIPTIONS['delete_risup_prompt_snippet'],
    {
      identifier: z.string().describe('Snippet id or exact snippet name from list_risup_prompt_snippets.'),
    },
    async ({ identifier }) => textResult(await apiRequest('POST', '/risup/prompt-snippets/delete', { identifier })),
  );

  server.tool(
    'validate_risup_prompt_import',
    MCP_TOOL_DESCRIPTIONS['validate_risup_prompt_import'],
    {
      text: z.string().describe('The same structured prompt text that was passed to import_risup_prompt_from_text.'),
    },
    async ({ text }) => textResult(await apiRequest('POST', '/risup/prompt-text/verify', { text })),
  );
}
