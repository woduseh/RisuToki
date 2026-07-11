import { z } from 'zod';

import type { McpToolHandler } from './mcp-tool-registration';
import { normalizeMcpErrorEnvelope } from './mcp-response-envelope';

export const MCP_DEFAULT_TOOLS_LIST_MAX_BYTES = 42 * 1024;
export const MCP_SINGLE_TOOL_MAX_BYTES = 10 * 1024;

export const STRUCTURED_DEFAULT_TOOL_NAMES = [
  'apply_edit',
  'analyze_content',
  'inspect_document',
  'list_skills',
  'list_tool_profiles',
  'manage_assets',
  'manage_file',
  'manage_items',
  'preview_edit',
  'read_content',
  'read_skill',
  'search_document',
  'validate_content',
] as const;

export type StructuredDefaultToolName = (typeof STRUCTURED_DEFAULT_TOOL_NAMES)[number];

const structuredDefaultToolNameSet = new Set<string>(STRUCTURED_DEFAULT_TOOL_NAMES);

export function isStructuredDefaultToolName(name: string): name is StructuredDefaultToolName {
  return structuredDefaultToolNameSet.has(name);
}

function compactObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).passthrough();
}

const maxBytesSchema = z
  .number()
  .int()
  .min(1)
  .max(64 * 1024)
  .optional();

const compactTargetSchema = compactObject({
  kind: z.enum(['active', 'external', 'reference', 'guidance', 'session']),
});

const compactSelectorSchema = compactObject({
  family: z
    .enum([
      'field',
      'surface',
      'lorebook',
      'regex',
      'greeting',
      'trigger',
      'lua',
      'css',
      'asset',
      'risup-prompt',
      'cbs',
      'danbooru',
      'plugin-v3',
      'risum',
    ])
    .optional(),
});

const compactGuardSchema = compactObject({
  name: z.string(),
  value: z.unknown(),
});

const compactAnalyzeOperationSchema = compactObject({
  action: z.enum([
    'list_cbs_toggles',
    'simulate_cbs',
    'diff_cbs',
    'tag_db_status',
    'search_danbooru_tags',
    'get_popular_danbooru_tags',
    'diff_lorebook',
    'diff_risup_prompt',
    'validate_risup_prompt_import',
    'verify_risup_prompt_import',
    'field_stats',
    'token_count',
    'simulate_lorebook',
    'test_regex',
  ]),
});

const compactEditOperationSchema = compactObject({
  op: z.enum([
    'write_content',
    'replace_text',
    'insert_text',
    'delete_item',
    'patch_surface',
    'replace_block',
    'replace_all_text',
  ]),
  selector: compactSelectorSchema,
});

const compactManageItemsOperationSchema = compactObject({
  action: z.enum([
    'list_snippets',
    'read_snippet',
    'copy_as_text',
    'add_items',
    'reorder_items',
    'import_text',
    'save_snippet',
    'insert_snippet',
    'delete_snippet',
  ]),
});

const compactManageAssetsOperationSchema = compactObject({
  action: z.enum(['list_assets', 'read_asset', 'add_asset', 'delete_asset', 'rename_asset', 'compress_assets']),
});

const compactManageFileOperationSchema = compactObject({
  action: z.enum([
    'list_snapshots',
    'project_tree',
    'open_file',
    'save_current_file',
    'snapshot_field',
    'restore_snapshot',
    'export_field',
    'extract_project',
    'reassemble_project',
    'export_lorebook',
    'import_lorebook',
  ]),
});

const previewTokenFields = {
  preview_token: z.string().optional(),
  operation_digest: z.string().optional(),
  guard_values: z.array(compactGuardSchema).max(50).optional(),
  max_bytes: maxBytesSchema,
};

/**
 * Public schemas stay small enough for tool discovery. The original detailed
 * raw shape is still parsed immediately before the handler runs.
 */
export const MCP_COMPACT_INPUT_SCHEMAS: Record<StructuredDefaultToolName, z.ZodTypeAny> = {
  inspect_document: compactObject({
    target: compactTargetSchema,
    max_bytes: maxBytesSchema,
  }),
  list_tool_profiles: compactObject({
    profile: z.string().optional(),
  }),
  read_content: compactObject({
    target: compactTargetSchema,
    selectors: z.array(compactSelectorSchema).min(1).max(50).optional(),
    max_bytes: maxBytesSchema,
  }),
  search_document: compactObject({
    target: compactTargetSchema,
    query: z.string(),
    selector: compactSelectorSchema.optional(),
    field: z.string().optional(),
    regex: z.boolean().optional(),
    flags: z.string().optional(),
    context_chars: z.number().optional(),
    max_matches: z.number().int().min(1).max(500).optional(),
    max_bytes: maxBytesSchema,
  }),
  analyze_content: compactObject({
    target: compactTargetSchema,
    operation: compactAnalyzeOperationSchema,
    max_bytes: maxBytesSchema,
  }),
  validate_content: compactObject({
    target: compactTargetSchema,
    selectors: z.array(compactSelectorSchema).min(1).max(50).optional(),
    max_bytes: maxBytesSchema,
  }),
  preview_edit: compactObject({
    target: compactTargetSchema,
    operations: z.array(compactEditOperationSchema).min(1).max(50),
    dry_run: z.boolean().optional(),
    max_bytes: maxBytesSchema,
  }),
  apply_edit: compactObject({
    preview_token: z.string(),
    operation_digest: z.string(),
    target: compactTargetSchema,
    guard_values: z.array(compactGuardSchema).max(50).optional(),
    max_bytes: maxBytesSchema,
  }),
  manage_items: compactObject({
    target: compactTargetSchema,
    family: z.enum(['risup-prompt', 'lorebook', 'regex', 'greeting', 'trigger', 'lua', 'css']),
    mode: z.enum(['read', 'preview', 'apply']),
    operation: compactManageItemsOperationSchema.optional(),
    ...previewTokenFields,
  }),
  manage_assets: compactObject({
    target: compactTargetSchema,
    asset_family: z.enum(['auto', 'charx', 'risum']).optional(),
    mode: z.enum(['read', 'preview', 'apply']),
    operation: compactManageAssetsOperationSchema.optional(),
    ...previewTokenFields,
  }),
  manage_file: compactObject({
    target: compactTargetSchema,
    mode: z.enum(['read', 'preview', 'apply']),
    operation: compactManageFileOperationSchema.optional(),
    ...previewTokenFields,
  }),
  list_skills: compactObject({
    scopes: z
      .array(z.enum(['product', 'common', 'bot', 'prompts', 'modules', 'plugins']))
      .max(6)
      .optional(),
    query: z.string().optional(),
    detail: z.enum(['summary', 'full']).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    cursor: z.string().optional(),
  }),
  read_skill: compactObject({
    name: z.string(),
    file: z.string().optional(),
    cursor: z.string().optional(),
    max_bytes: maxBytesSchema,
  }),
};

export function getCompactInputSchema(name: string): z.ZodTypeAny | undefined {
  return isStructuredDefaultToolName(name) ? MCP_COMPACT_INPUT_SCHEMAS[name] : undefined;
}

/** Keep the pre-1.14 detailed Zod shape as the final handler-side validator. */
export function withDetailedInputValidationHandler<TArgs extends Record<string, unknown>>(
  name: string,
  inputShape: z.ZodRawShape,
  handler: McpToolHandler<TArgs>,
): McpToolHandler<Record<string, unknown>> {
  const detailedSchema = z.object(inputShape);
  return async (args, extra) => {
    const parsed = await detailedSchema.safeParseAsync(args);
    if (!parsed.success) {
      const payload = normalizeMcpErrorEnvelope({
        status: 400,
        action: `validate ${name} input`,
        target: `tool:${name}`,
        error: `Invalid arguments for tool ${name}: ${parsed.error.message}`,
        suggestion: 'Inspect the tool input schema and correct the invalid arguments before retrying.',
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        isError: true,
      };
    }
    return handler(parsed.data as TArgs, extra);
  };
}
