// Typed Zod schemas for MCP HTTP API request bodies.
// Replaces ad-hoc typeof chains with declarative validation.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Reusable atoms
// ---------------------------------------------------------------------------

/** Coerce non-string values to undefined so callers fall back to defaults. */
const lenientString = z.preprocess((v) => (typeof v === 'string' ? v : undefined), z.string().optional());

/** Coerce numeric strings to numbers and invalid values to undefined. */
const lenientNumber = z.preprocess((v) => {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : undefined;
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}, z.number().optional());

/** Coerce truthy values to boolean (body may carry `1` / `0`). */
const boolish = z.union([z.boolean(), z.number()]).transform(Boolean);

/** Position enum that coerces invalid values to undefined (caller defaults to 'end'). */
const positionEnum = z.preprocess(
  (v) => (['start', 'end', 'after', 'before'].includes(v as string) ? v : undefined),
  z.enum(['start', 'end', 'after', 'before']).optional(),
);

// ---------------------------------------------------------------------------
// dry_run / dryRun conflict guard
// ---------------------------------------------------------------------------

/** True when both `dry_run` and `dryRun` are present with conflicting boolean values. */
function hasDryRunConflict(d: Record<string, unknown>): boolean {
  const a = d.dry_run;
  const b = d.dryRun;
  if (a === undefined || b === undefined) return false;
  return Boolean(a) !== Boolean(b);
}

const DRY_RUN_CONFLICT_MSG = {
  message:
    'dry_run and dryRun are both present with conflicting values. Use dry_run (canonical); dryRun is a deprecated alias.',
  path: ['dryRun'],
};

// ---------------------------------------------------------------------------
// Field editing request bodies
// ---------------------------------------------------------------------------

/** POST /field/:name  (write_field) — content can be any defined value. */
export const writeFieldBodySchema = z
  .object({})
  .catchall(z.unknown())
  .refine((d) => (d as Record<string, unknown>).content !== undefined, {
    message: 'Missing "content"',
    path: ['content'],
  });
export type WriteFieldBody = { content: unknown; [k: string]: unknown };

/** POST /field/batch  (read_field_batch) */
export const fieldBatchReadSchema = z.object({
  fields: z.array(z.string()),
});
export type FieldBatchReadBody = z.infer<typeof fieldBatchReadSchema>;

/** Single entry inside a batch-write request. */
const batchWriteEntrySchema = z.object({
  field: z.string().min(1),
  content: z.unknown(),
});

/** POST /field/batch-write  (write_field_batch) */
export const fieldBatchWriteSchema = z.object({
  entries: z.array(batchWriteEntrySchema),
});
export type FieldBatchWriteBody = z.infer<typeof fieldBatchWriteSchema>;

// ---------------------------------------------------------------------------
// Text-editing operations (shared across field / lorebook / lua / css)
// ---------------------------------------------------------------------------

/** POST .../replace  (replace_in_field, replace_in_lorebook, …) */
export const replaceBodySchema = z
  .object({
    find: z.string().min(1),
    replace: z.string().optional(),
    regex: boolish.optional(),
    flags: lenientString,
    dry_run: boolish.optional(),
    dryRun: boolish.optional(),
    // lorebook replace adds an optional target field name
    field: z.string().optional(),
  })
  .refine((d) => !hasDryRunConflict(d), DRY_RUN_CONFLICT_MSG);
export type ReplaceBody = z.infer<typeof replaceBodySchema>;

/** POST .../block-replace  (replace_block_in_field, …) */
export const blockReplaceBodySchema = z
  .object({
    start_anchor: z.string().min(1),
    end_anchor: z.string().min(1),
    content: z.string().optional(),
    include_anchors: z.boolean().optional(),
    dry_run: boolish.optional(),
    dryRun: boolish.optional(),
  })
  .refine((d) => !hasDryRunConflict(d), DRY_RUN_CONFLICT_MSG);
export type BlockReplaceBody = z.infer<typeof blockReplaceBodySchema>;

/** POST .../insert  (insert_in_field, insert_in_lorebook, …) */
export const insertBodySchema = z.object({
  content: z.string(),
  position: positionEnum,
  anchor: z.string().optional(),
});
export type InsertBody = z.infer<typeof insertBodySchema>;

/** Single replacement inside a batch-replace request. */
const batchReplacementSchema = z.object({
  find: z.string().min(1),
  replace: z.string().optional(),
  regex: boolish.optional(),
  flags: lenientString,
});
export type BatchReplacement = z.infer<typeof batchReplacementSchema>;

/** POST .../batch-replace  (replace_in_field_batch, …) */
export const batchReplaceBodySchema = z
  .object({
    replacements: z.array(batchReplacementSchema),
    dry_run: boolish.optional(),
    dryRun: boolish.optional(),
  })
  .refine((d) => !hasDryRunConflict(d), DRY_RUN_CONFLICT_MSG);
export type BatchReplaceBody = z.infer<typeof batchReplaceBodySchema>;

// ---------------------------------------------------------------------------
// Search request bodies
// ---------------------------------------------------------------------------

/** POST /field/:name/search  (search_in_field) */
export const searchBodySchema = z.object({
  query: z.string().min(1),
  regex: boolish.optional(),
  flags: lenientString,
  context_chars: lenientNumber,
  max_matches: lenientNumber,
});
export type SearchBody = z.infer<typeof searchBodySchema>;

/** POST /search-all  (search_all_fields) */
export const searchAllBodySchema = z.object({
  query: z.string().min(1),
  regex: boolish.optional(),
  flags: lenientString,
  include_lorebook: z.boolean().optional(),
  include_greetings: z.boolean().optional(),
  context_chars: lenientNumber,
  max_matches_per_field: lenientNumber,
  max_matches_total: lenientNumber,
});
export type SearchAllBody = z.infer<typeof searchAllBodySchema>;

// ---------------------------------------------------------------------------
// Asset request bodies
// ---------------------------------------------------------------------------

const assetFileNameSchema = z.string().min(1, 'fileName과 base64 데이터가 필요합니다.');
const assetBase64Schema = z.string().min(1, 'fileName과 base64 데이터가 필요합니다.');
const risumAssetNameSchema = z.string().min(1, 'name과 base64 데이터가 필요합니다.');
const risumAssetBase64Schema = z.string().min(1, 'name과 base64 데이터가 필요합니다.');

/** POST /asset/add  (add_charx_asset) */
export const assetAddBodySchema = z.object({
  fileName: assetFileNameSchema,
  base64: assetBase64Schema,
  folder: lenientString,
});
export type AssetAddBody = z.infer<typeof assetAddBodySchema>;

/** POST /asset/:idx/delete  (delete_charx_asset) */
export const assetDeleteBodySchema = z.object({
  expected_path: lenientString,
});
export type AssetDeleteBody = z.infer<typeof assetDeleteBodySchema>;

/** POST /asset/:idx/rename  (rename_charx_asset) */
export const assetRenameBodySchema = z.object({
  newName: z.string().min(1, '유효한 newName이 필요합니다.'),
  expected_path: lenientString,
});
export type AssetRenameBody = z.infer<typeof assetRenameBodySchema>;

/** POST /assets/compress-webp  (compress_assets_webp) */
export const assetCompressWebpBodySchema = z
  .object({
    asset_family: z.enum(['charx', 'risum']).optional(),
    quality: lenientNumber,
    recompressWebp: boolish.optional(),
    dry_run: boolish.optional(),
    dryRun: boolish.optional(),
  })
  .refine((d) => !hasDryRunConflict(d), DRY_RUN_CONFLICT_MSG);
export type AssetCompressWebpBody = z.infer<typeof assetCompressWebpBodySchema>;

/** POST /risum-asset/add  (add_risum_asset) */
export const risumAssetAddBodySchema = z.object({
  name: risumAssetNameSchema,
  path: lenientString,
  base64: risumAssetBase64Schema,
});
export type RisumAssetAddBody = z.infer<typeof risumAssetAddBodySchema>;

/** POST /risum-asset/:idx/delete  (delete_risum_asset) */
export const risumAssetDeleteBodySchema = z.object({
  expected_path: lenientString,
});
export type RisumAssetDeleteBody = z.infer<typeof risumAssetDeleteBodySchema>;

// ---------------------------------------------------------------------------
// External document request bodies
// ---------------------------------------------------------------------------

/** Probe / open requests that carry a file_path field. */
export const externalDocumentBodySchema = z
  .object({
    file_path: z.string().min(1),
    save_current: z.boolean().optional(),
  })
  .catchall(z.unknown());
export type ExternalDocumentBody = z.infer<typeof externalDocumentBodySchema>;

// ---------------------------------------------------------------------------
// Additive MCP facade v1 public contract
// ---------------------------------------------------------------------------

export const FACADE_V1_CONTRACT_ID = 'risutoki.facade.v1' as const;

export const FACADE_V1_LIMITS = {
  maxBatchItems: 50,
  maxBytes: 64 * 1024,
  maxMatches: 100,
} as const;

export const FACADE_V1_TARGET_KINDS = ['active', 'external', 'reference', 'guidance', 'session'] as const;
export type FacadeV1TargetKind = (typeof FACADE_V1_TARGET_KINDS)[number];

export const FACADE_V1_TOOL_NAMES = [
  'inspect_document',
  'read_content',
  'search_document',
  'analyze_content',
  'preview_edit',
  'apply_edit',
  'validate_content',
  'load_guidance',
  'manage_items',
  'manage_assets',
  'manage_file',
] as const;
export type FacadeV1ToolName = (typeof FACADE_V1_TOOL_NAMES)[number];

export const FACADE_V1_FUTURE_TOOL_NAMES = [] as const;

export type FacadeV1ToolMutability = 'read-only' | 'preview' | 'mutating';

export interface FacadeV1ToolContract {
  name: string;
  lifecycle: 'v1' | 'future-candidate';
  mutability: FacadeV1ToolMutability;
  preference: 'preferred' | 'legacy';
}

export const FACADE_V1_TOOL_CONTRACTS: readonly FacadeV1ToolContract[] = [
  { name: 'inspect_document', lifecycle: 'v1', mutability: 'read-only', preference: 'preferred' },
  { name: 'read_content', lifecycle: 'v1', mutability: 'read-only', preference: 'preferred' },
  { name: 'search_document', lifecycle: 'v1', mutability: 'read-only', preference: 'preferred' },
  { name: 'analyze_content', lifecycle: 'v1', mutability: 'read-only', preference: 'preferred' },
  { name: 'preview_edit', lifecycle: 'v1', mutability: 'preview', preference: 'preferred' },
  { name: 'apply_edit', lifecycle: 'v1', mutability: 'mutating', preference: 'preferred' },
  { name: 'validate_content', lifecycle: 'v1', mutability: 'read-only', preference: 'preferred' },
  { name: 'load_guidance', lifecycle: 'v1', mutability: 'read-only', preference: 'legacy' },
  { name: 'manage_items', lifecycle: 'v1', mutability: 'mutating', preference: 'preferred' },
  { name: 'manage_assets', lifecycle: 'v1', mutability: 'mutating', preference: 'preferred' },
  { name: 'manage_file', lifecycle: 'v1', mutability: 'mutating', preference: 'preferred' },
];

export function getFacadeV1ToolContract(name: string): FacadeV1ToolContract | undefined {
  return FACADE_V1_TOOL_CONTRACTS.find((tool) => tool.name === name);
}

const facadeMaxBytesSchema = z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional();

export const facadeV1GuidanceTargetSchema = z
  .object({
    kind: z.literal('guidance'),
    skill: z.string().min(1).optional(),
    document: z.string().min(1).optional(),
    guide: z.string().min(1).optional(),
  })
  .refine((d) => d.document === undefined || d.skill !== undefined, {
    message: 'guidance document requires skill',
    path: ['skill'],
  })
  .refine((d) => d.guide === undefined || (d.skill === undefined && d.document === undefined), {
    message: 'guidance guide cannot be combined with skill or document',
    path: ['guide'],
  });

export const facadeV1TargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('active'),
    document: z.literal('current').optional(),
  }),
  z.object({
    kind: z.literal('external'),
    file_path: z.string().min(1),
  }),
  z.object({
    kind: z.literal('reference'),
    reference_id: z.string().min(1).optional(),
    file_path: z.string().min(1).optional(),
  }),
  facadeV1GuidanceTargetSchema,
  z.object({
    kind: z.literal('session'),
  }),
]);
export type FacadeV1Target = z.infer<typeof facadeV1TargetSchema>;

export const facadeV1ContentSelectorSchema = z.object({
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
  path: z.string().min(1).optional(),
  include_raw: z.boolean().optional(),
  field: z.string().min(1).optional(),
  index: z.number().int().nonnegative().optional(),
  indices: z.array(z.number().int().nonnegative()).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
  id: z.string().min(1).optional(),
  ids: z.array(z.string().min(1)).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
  identity: z
    .object({
      comment: z.string().optional(),
      preview: z.string().optional(),
      hash: z.string().optional(),
    })
    .optional(),
  greeting_type: z.enum(['alternate', 'group']).optional(),
  entry_field: z.string().min(1).optional(),
  item_field: z.string().min(1).optional(),
  prompt_type: z.string().min(1).optional(),
  fields: z.array(z.string().min(1)).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
  tags: z.array(z.string().min(1)).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
});
export type FacadeV1ContentSelector = z.infer<typeof facadeV1ContentSelectorSchema>;

export const facadeV1GuardSchema = z.object({
  name: z.string().min(1),
  value: z.unknown(),
  payloadPath: z.string().min(1).optional(),
  sourceOperations: z.array(z.string().min(1)).optional(),
  sourceResultPath: z.string().min(1).optional(),
});
export type FacadeV1Guard = z.infer<typeof facadeV1GuardSchema>;

export const facadeV1InspectDocumentBodySchema = z.object({
  target: facadeV1TargetSchema,
  max_bytes: facadeMaxBytesSchema,
});
export type FacadeV1InspectDocumentBody = z.infer<typeof facadeV1InspectDocumentBodySchema>;

export const facadeV1ReadContentBodySchema = z.object({
  target: facadeV1TargetSchema,
  selectors: z.array(facadeV1ContentSelectorSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
  max_bytes: facadeMaxBytesSchema,
});
export type FacadeV1ReadContentBody = z.infer<typeof facadeV1ReadContentBodySchema>;

export const facadeV1SearchDocumentBodySchema = z
  .object({
    target: facadeV1TargetSchema,
    query: z.string().min(1),
    selector: facadeV1ContentSelectorSchema.optional(),
    field: z.string().min(1).optional(),
    regex: boolish.optional(),
    flags: lenientString,
    context_chars: lenientNumber,
    max_matches: z.number().int().positive().max(FACADE_V1_LIMITS.maxMatches).optional(),
    max_bytes: facadeMaxBytesSchema,
  })
  .superRefine((body, ctx) => {
    const selectedField = body.selector?.field ?? body.field;
    const selectedFamily = body.selector?.family;
    if (body.selector && selectedFamily !== 'field' && selectedFamily !== 'risup-prompt') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'search_document selector supports field or risup-prompt families',
        path: ['selector', 'family'],
      });
    }
    if (selectedFamily === 'field' && !selectedField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'field search selector requires selector.field',
        path: ['selector', 'field'],
      });
    }
    if (body.selector?.field && body.field && body.selector.field !== body.field) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'selector.field and deprecated field alias must match',
        path: ['field'],
      });
    }
    if ((body.target.kind === 'external' || body.target.kind === 'reference') && !body.selector && !body.field) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${body.target.kind} search requires selector or deprecated field alias`,
        path: ['selector'],
      });
    }
    if (body.target.kind === 'guidance' || body.target.kind === 'session') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `search_document does not support ${body.target.kind} targets`,
        path: ['target', 'kind'],
      });
    }
  });
export type FacadeV1SearchDocumentBody = z.infer<typeof facadeV1SearchDocumentBodySchema>;

const facadeV1ReferenceTargetSchema = z
  .object({
    kind: z.literal('reference'),
    reference_id: z.string().min(1).optional(),
    file_path: z.string().min(1).optional(),
  })
  .refine((d) => d.reference_id !== undefined || d.file_path !== undefined, {
    message: 'reference target requires reference_id or file_path',
    path: ['reference_id'],
  });

export const facadeV1AnalyzeOperationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list_cbs_toggles'),
    field: z.string().min(1).optional(),
    lorebook_index: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal('simulate_cbs'),
    field: z.string().min(1),
    lorebook_index: z.number().int().nonnegative().optional(),
    toggles: z.record(z.string(), z.string()).optional(),
    all_combos: z.boolean().optional(),
    compact: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('diff_cbs'),
    field: z.string().min(1),
    lorebook_index: z.number().int().nonnegative().optional(),
    toggles: z.record(z.string(), z.string()),
  }),
  z.object({
    action: z.literal('tag_db_status'),
  }),
  z.object({
    action: z.literal('search_danbooru_tags'),
    query: z.string().min(1),
    category: z.enum(['general', 'artist', 'copyright', 'character', 'meta']).optional(),
    limit: z.number().int().positive().max(50).optional(),
  }),
  z.object({
    action: z.literal('get_popular_danbooru_tags'),
    category: z.enum(['general', 'artist', 'copyright', 'character', 'meta']).optional(),
    limit: z.number().int().positive().max(500).optional(),
    group_by_semantic: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('diff_lorebook'),
    index: z.number().int().nonnegative(),
    reference: facadeV1ReferenceTargetSchema,
    ref_entry_index: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal('diff_risup_prompt'),
    reference: facadeV1ReferenceTargetSchema,
  }),
  z.object({
    action: z.literal('validate_risup_prompt_import'),
    text: z.string().min(1),
  }),
  z.object({
    action: z.literal('verify_risup_prompt_import'),
    text: z.string().min(1),
  }),
  z.object({
    action: z.literal('field_stats'),
    field: z.string().min(1),
  }),
  z
    .object({
      action: z.literal('token_count'),
      encoding: z.enum(['cl100k_base', 'o200k_base']),
      text: z.string().optional(),
      selectors: z.array(facadeV1ContentSelectorSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
    })
    .refine((operation) => (operation.text === undefined) !== (operation.selectors === undefined), {
      message: 'token_count requires exactly one of text or selectors',
      path: ['text'],
    }),
  z.object({
    action: z.literal('simulate_lorebook'),
    messages: z
      .array(
        z.object({
          role: z.enum(['char', 'user', 'assistant', 'system']),
          content: z.string(),
        }),
      )
      .min(1)
      .max(1000),
    scan_depth: z.number().int().min(0).max(100).optional(),
    recursive: z.boolean().optional(),
    max_passes: z.number().int().min(1).max(10).optional(),
    include_content: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('test_regex'),
    text: z.string(),
    mode: z.enum(['editinput', 'editoutput', 'editdisplay', 'editrequest']),
    indices: z.array(z.number().int().nonnegative()).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
  }),
]);
export type FacadeV1AnalyzeOperation = z.infer<typeof facadeV1AnalyzeOperationSchema>;

export const facadeV1AnalyzeContentBodySchema = z
  .object({
    target: facadeV1TargetSchema,
    operation: facadeV1AnalyzeOperationSchema,
    max_bytes: facadeMaxBytesSchema,
  })
  .superRefine((body, ctx) => {
    const danbooruActions = new Set(['tag_db_status', 'search_danbooru_tags', 'get_popular_danbooru_tags']);
    if (danbooruActions.has(body.operation.action)) {
      if (body.target.kind !== 'active' && body.target.kind !== 'session') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Danbooru analysis supports active or session targets',
          path: ['target', 'kind'],
        });
      }
      return;
    }
    if (body.operation.action === 'token_count' && body.operation.text !== undefined) {
      if (body.target.kind !== 'session') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'direct token_count text requires a session target',
          path: ['target', 'kind'],
        });
      }
      return;
    }
    const portableActions = new Set(['token_count', 'simulate_lorebook', 'test_regex']);
    if (
      portableActions.has(body.operation.action) &&
      (body.target.kind === 'active' || body.target.kind === 'external' || body.target.kind === 'reference')
    ) {
      return;
    }
    if (body.target.kind !== 'active') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${body.operation.action} requires an active target`,
        path: ['target', 'kind'],
      });
    }
  });
export type FacadeV1AnalyzeContentBody = z.infer<typeof facadeV1AnalyzeContentBodySchema>;

const facadeEditOperationBase = {
  selector: facadeV1ContentSelectorSchema,
  field: z.string().min(1).optional(),
  guards: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
};

const facadeRequiredContentSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

export const facadeV1EditOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('write_content'),
    ...facadeEditOperationBase,
    content: facadeRequiredContentSchema,
  }),
  z.object({
    op: z.literal('replace_text'),
    ...facadeEditOperationBase,
    find: z.string().min(1),
    replace: z.string().optional(),
    regex: boolish.optional(),
    flags: lenientString,
  }),
  z.object({
    op: z.literal('insert_text'),
    ...facadeEditOperationBase,
    content: facadeRequiredContentSchema,
    position: z.enum(['end', 'start', 'after', 'before']).optional(),
    anchor: z.string().min(1).optional(),
  }),
  z.object({
    op: z.literal('delete_item'),
    ...facadeEditOperationBase,
    content: z.unknown().optional(),
  }),
  z.object({
    op: z.literal('patch_surface'),
    ...facadeEditOperationBase,
    content: facadeRequiredContentSchema,
  }),
  z.object({
    op: z.literal('replace_block'),
    ...facadeEditOperationBase,
    start_anchor: z.string().min(1),
    end_anchor: z.string().min(1),
    content: z.string().optional(),
    include_anchors: z.boolean().optional(),
  }),
  z.object({
    op: z.literal('replace_all_text'),
    ...facadeEditOperationBase,
    find: z.string().min(1),
    replace: z.string().optional(),
    regex: boolish.optional(),
    flags: lenientString,
    field: z.enum(['content', 'comment', 'key', 'secondkey']).optional(),
  }),
]);
export type FacadeV1EditOperation = z.infer<typeof facadeV1EditOperationSchema> & {
  content?: unknown;
  find?: string;
  replace?: string;
  regex?: boolean;
  flags?: string;
  start_anchor?: string;
  end_anchor?: string;
  include_anchors?: boolean;
  position?: 'end' | 'start' | 'after' | 'before';
  anchor?: string;
};

export const facadeV1PreviewEditBodySchema = z
  .object({
    target: facadeV1TargetSchema,
    operations: z.array(facadeV1EditOperationSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems),
    dry_run: boolish.optional(),
    dryRun: boolish.optional(),
    max_bytes: facadeMaxBytesSchema,
  })
  .refine((d) => !hasDryRunConflict(d), DRY_RUN_CONFLICT_MSG)
  .superRefine((body, ctx) => {
    body.operations.forEach((operation, index) => {
      if ((operation.op === 'replace_block' || operation.op === 'replace_all_text') && body.target.kind !== 'active') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${operation.op} requires an active target`,
          path: ['operations', index, 'op'],
        });
      }
      if (operation.op === 'replace_block') {
        const isField = operation.selector.family === 'field' && !!operation.selector.field;
        const isSingleLorebook =
          operation.selector.family === 'lorebook' &&
          (operation.selector.index !== undefined || !!operation.selector.id);
        if (!isField && !isSingleLorebook) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'replace_block requires a string field or one lorebook index/id selector',
            path: ['operations', index, 'selector'],
          });
        }
      }
      if (operation.op === 'replace_all_text' && operation.selector.family !== 'lorebook') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'replace_all_text requires selector.family="lorebook"',
          path: ['operations', index, 'selector', 'family'],
        });
      }
    });
  });
export type FacadeV1PreviewEditBody = z.infer<typeof facadeV1PreviewEditBodySchema>;

export const facadeV1PreviewTokenSchema = z
  .string()
  .regex(/^facade-preview-v1\.[A-Za-z0-9._-]{16,}$/, 'Invalid facade preview token');

export const facadeV1ApplyEditBodySchema = z.object({
  preview_token: facadeV1PreviewTokenSchema,
  operation_digest: z.string().min(16),
  target: facadeV1TargetSchema,
  guard_values: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
  max_bytes: facadeMaxBytesSchema,
});
export type FacadeV1ApplyEditBody = z.infer<typeof facadeV1ApplyEditBodySchema>;

export const facadeV1ValidateContentBodySchema = z.object({
  target: facadeV1TargetSchema,
  selectors: z.array(facadeV1ContentSelectorSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
  max_bytes: facadeMaxBytesSchema,
});
export type FacadeV1ValidateContentBody = z.infer<typeof facadeV1ValidateContentBodySchema>;

export const facadeV1LoadGuidanceBodySchema = z.object({
  target: facadeV1GuidanceTargetSchema,
  max_bytes: facadeMaxBytesSchema,
});
export type FacadeV1LoadGuidanceBody = z.infer<typeof facadeV1LoadGuidanceBodySchema>;

export const manageItemsFamilySchema = z.enum([
  'risup-prompt',
  'lorebook',
  'regex',
  'greeting',
  'trigger',
  'lua',
  'css',
]);
export type ManageItemsFamily = z.infer<typeof manageItemsFamilySchema>;

const manageItemsSelectorSchema = z.object({
  index: z.number().int().nonnegative().optional(),
  indices: z.array(z.number().int().nonnegative()).min(1).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
  id: z.string().min(1).optional(),
  ids: z.array(z.string().min(1)).min(1).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
});

export const manageItemsOperationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list_snippets'),
  }),
  z.object({
    action: z.literal('read_snippet'),
    identifier: z.string().min(1),
  }),
  z.object({
    action: z.literal('copy_as_text'),
    selector: manageItemsSelectorSchema,
  }),
  z.object({
    action: z.literal('add_items'),
    items: z
      .array(z.union([z.record(z.string(), z.unknown()), z.string()]))
      .min(1)
      .max(FACADE_V1_LIMITS.maxBatchItems),
    insertAt: z.number().int().nonnegative().optional(),
    greeting_type: z.enum(['alternate', 'group']).optional(),
  }),
  z.object({
    action: z.literal('reorder_items'),
    order_ids: z.array(z.string().min(1)).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
    order: z.array(z.number().int().nonnegative()).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
    greeting_type: z.enum(['alternate', 'group']).optional(),
  }),
  z.object({
    action: z.literal('import_text'),
    text: z.string().min(1),
    import_mode: z.enum(['replace', 'append']).optional(),
    insertAt: z.number().int().nonnegative().optional(),
  }),
  z
    .object({
      action: z.literal('save_snippet'),
      name: z.string().min(1),
      text: z.string().optional(),
      selector: manageItemsSelectorSchema.optional(),
    })
    .refine((d) => (d.text !== undefined) !== (d.selector !== undefined), {
      message: 'save_snippet requires exactly one of text or selector',
      path: ['text'],
    }),
  z.object({
    action: z.literal('insert_snippet'),
    identifier: z.string().min(1),
    insertAt: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal('delete_snippet'),
    identifier: z.string().min(1),
  }),
]);
export type ManageItemsOperation = z.infer<typeof manageItemsOperationSchema>;

export const manageItemsBodySchema = z
  .object({
    target: facadeV1TargetSchema,
    family: manageItemsFamilySchema,
    mode: z.enum(['read', 'preview', 'apply']),
    operation: manageItemsOperationSchema.optional(),
    preview_token: facadeV1PreviewTokenSchema.optional(),
    operation_digest: z.string().min(16).optional(),
    guard_values: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
    max_bytes: facadeMaxBytesSchema,
  })
  .refine((d) => (d.mode === 'apply' ? d.preview_token !== undefined && d.operation_digest !== undefined : true), {
    message: 'apply mode requires preview_token and operation_digest',
    path: ['preview_token'],
  })
  .refine((d) => (d.mode === 'apply' ? d.guard_values !== undefined && d.guard_values.length > 0 : true), {
    message: 'apply mode requires guard_values',
    path: ['guard_values'],
  })
  .refine((d) => (d.mode === 'read' || d.mode === 'preview' ? d.operation !== undefined : true), {
    message: 'read/preview mode requires operation',
    path: ['operation'],
  })
  .refine((d) => d.target.kind === 'active' || d.target.kind === 'external', {
    message: 'manage_items supports only active or external targets',
    path: ['target', 'kind'],
  })
  .superRefine((d, ctx) => {
    if (!d.operation || d.mode === 'apply') return;
    const readActions = new Set(['list_snippets', 'read_snippet', 'copy_as_text']);
    const previewActions = new Set([
      'add_items',
      'reorder_items',
      'import_text',
      'save_snippet',
      'insert_snippet',
      'delete_snippet',
    ]);
    if (d.mode === 'read' && !readActions.has(d.operation.action)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'read mode supports list_snippets, read_snippet, and copy_as_text',
        path: ['operation', 'action'],
      });
    }
    if (d.mode === 'preview' && !previewActions.has(d.operation.action)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'preview mode supports mutating item operations',
        path: ['operation', 'action'],
      });
    }
    if (d.family !== 'risup-prompt' && !['add_items', 'reorder_items'].includes(d.operation.action)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'structured item management supports add_items and reorder_items only',
        path: ['operation', 'action'],
      });
    }
    if (
      d.family === 'greeting' &&
      ['add_items', 'reorder_items'].includes(d.operation.action) &&
      !('greeting_type' in d.operation && d.operation.greeting_type)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'greeting item management requires greeting_type',
        path: ['operation', 'greeting_type'],
      });
    }
  });
export type ManageItemsBody = z.infer<typeof manageItemsBodySchema>;

export const manageAssetsFamilySchema = z.enum(['auto', 'charx', 'risum']).default('auto');
export type ManageAssetsFamily = z.infer<typeof manageAssetsFamilySchema>;

const manageAssetsSelectorSchema = z
  .object({
    index: z.number().int().nonnegative().optional(),
    path: z.string().min(1).optional(),
  })
  .refine((d) => d.index !== undefined || d.path !== undefined, {
    message: 'asset selector requires index or path',
    path: ['index'],
  });

export const manageAssetsOperationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list_assets'),
  }),
  z.object({
    action: z.literal('read_asset'),
    selector: manageAssetsSelectorSchema,
  }),
  z.object({
    action: z.literal('add_asset'),
    name: z.string().min(1).optional(),
    fileName: z.string().min(1).optional(),
    path: z.string().optional(),
    folder: z.enum(['icon', 'other']).optional(),
    base64: z.string().min(1),
  }),
  z.object({
    action: z.literal('delete_asset'),
    selector: manageAssetsSelectorSchema,
  }),
  z.object({
    action: z.literal('rename_asset'),
    selector: manageAssetsSelectorSchema,
    newName: z.string().min(1),
  }),
  z.object({
    action: z.literal('compress_assets'),
    quality: z.number().min(0).max(100).optional(),
    recompress_webp: z.boolean().optional(),
    recompressWebp: z.boolean().optional(),
  }),
]);
export type ManageAssetsOperation = z.infer<typeof manageAssetsOperationSchema>;

export const manageAssetsBodySchema = z
  .object({
    target: facadeV1TargetSchema,
    asset_family: manageAssetsFamilySchema.optional(),
    mode: z.enum(['read', 'preview', 'apply']),
    operation: manageAssetsOperationSchema.optional(),
    preview_token: facadeV1PreviewTokenSchema.optional(),
    operation_digest: z.string().min(16).optional(),
    guard_values: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
    max_bytes: facadeMaxBytesSchema,
  })
  .refine((d) => (d.mode === 'apply' ? d.preview_token !== undefined && d.operation_digest !== undefined : true), {
    message: 'apply mode requires preview_token and operation_digest',
    path: ['preview_token'],
  })
  .refine((d) => (d.mode === 'apply' ? d.guard_values !== undefined && d.guard_values.length > 0 : true), {
    message: 'apply mode requires guard_values',
    path: ['guard_values'],
  })
  .refine((d) => (d.mode === 'read' || d.mode === 'preview' ? d.operation !== undefined : true), {
    message: 'read/preview mode requires operation',
    path: ['operation'],
  })
  .refine((d) => d.target.kind === 'active' || d.target.kind === 'external', {
    message: 'manage_assets supports only active or external targets',
    path: ['target', 'kind'],
  })
  .superRefine((d, ctx) => {
    if (!d.operation || d.mode === 'apply') return;
    const readActions = new Set(['list_assets', 'read_asset']);
    const previewActions = new Set(['add_asset', 'delete_asset', 'rename_asset', 'compress_assets']);
    if (d.mode === 'read' && !readActions.has(d.operation.action)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'read mode supports list_assets and read_asset',
        path: ['operation', 'action'],
      });
    }
    if (d.mode === 'preview' && !previewActions.has(d.operation.action)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'preview mode supports add_asset, delete_asset, rename_asset, and compress_assets',
        path: ['operation', 'action'],
      });
    }
    if (
      d.operation.action === 'compress_assets' &&
      d.operation.recompress_webp !== undefined &&
      d.operation.recompressWebp !== undefined &&
      d.operation.recompress_webp !== d.operation.recompressWebp
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'recompress_webp and recompressWebp must match when both are provided',
        path: ['operation', 'recompress_webp'],
      });
    }
  });
export type ManageAssetsBody = z.infer<typeof manageAssetsBodySchema>;

export const manageFileOperationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list_snapshots'),
    field: z.string().min(1),
  }),
  z.object({
    action: z.literal('project_tree'),
    project_path: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal('open_file'),
    file_path: z.string().min(1).optional(),
    save_current: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('save_current_file'),
  }),
  z.object({
    action: z.literal('snapshot_field'),
    field: z.string().min(1),
  }),
  z.object({
    action: z.literal('restore_snapshot'),
    field: z.string().min(1),
    snapshot_id: z.string().min(1),
  }),
  z.object({
    action: z.literal('export_field'),
    field: z.string().min(1),
    file_path: z.string().min(1),
    format: z.enum(['md', 'txt']).optional(),
  }),
  z.object({
    action: z.literal('extract_project'),
    file_path: z.string().min(1).optional(),
    project_path: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal('reassemble_project'),
    project_path: z.string().min(1).optional(),
    output_path: z.string().min(1),
  }),
  z.object({
    action: z.literal('export_lorebook'),
    target_dir: z.string().min(1),
    format: z.enum(['md', 'json']).optional(),
    group_by_folder: z.boolean().optional(),
    filter: z.string().min(1).optional(),
    folder: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal('import_lorebook'),
    source_dir: z.string().min(1).optional(),
    source_path: z.string().min(1).optional(),
    format: z.enum(['md', 'json']).optional(),
    create_folders: z.boolean().optional(),
    conflict: z.enum(['skip', 'overwrite', 'rename']).optional(),
  }),
]);
export type ManageFileOperation = z.infer<typeof manageFileOperationSchema>;

export const manageFileBodySchema = z
  .object({
    target: facadeV1TargetSchema,
    mode: z.enum(['read', 'preview', 'apply']),
    operation: manageFileOperationSchema.optional(),
    preview_token: facadeV1PreviewTokenSchema.optional(),
    operation_digest: z.string().min(16).optional(),
    guard_values: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
    max_bytes: facadeMaxBytesSchema,
  })
  .refine((d) => (d.mode === 'apply' ? d.preview_token !== undefined && d.operation_digest !== undefined : true), {
    message: 'apply mode requires preview_token and operation_digest',
    path: ['preview_token'],
  })
  .refine((d) => (d.mode === 'apply' ? d.guard_values !== undefined && d.guard_values.length > 0 : true), {
    message: 'apply mode requires guard_values',
    path: ['guard_values'],
  })
  .refine((d) => (d.mode === 'read' || d.mode === 'preview' ? d.operation !== undefined : true), {
    message: 'read/preview mode requires operation',
    path: ['operation'],
  })
  .refine((d) => d.target.kind === 'active' || d.target.kind === 'external' || d.target.kind === 'session', {
    message: 'manage_file supports active, external, or session targets',
    path: ['target', 'kind'],
  })
  .superRefine((d, ctx) => {
    if (!d.operation || d.mode === 'apply') return;
    const readActions = new Set(['list_snapshots', 'project_tree']);
    const previewActions = new Set([
      'open_file',
      'save_current_file',
      'snapshot_field',
      'restore_snapshot',
      'export_field',
      'extract_project',
      'reassemble_project',
      'export_lorebook',
      'import_lorebook',
    ]);
    if (d.mode === 'read' && !readActions.has(d.operation.action)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'read mode supports list_snapshots and project_tree',
        path: ['operation', 'action'],
      });
    }
    if (d.mode === 'preview' && !previewActions.has(d.operation.action)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'preview mode supports mutating file operations',
        path: ['operation', 'action'],
      });
    }
    if (d.operation.action === 'open_file' && d.target.kind !== 'external' && !d.operation.file_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'open_file requires target.kind="external" or operation.file_path',
        path: ['operation', 'file_path'],
      });
    }
    if (d.operation.action === 'extract_project' && d.target.kind !== 'external' && !d.operation.file_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'extract_project requires target.kind="external" or operation.file_path',
        path: ['operation', 'file_path'],
      });
    }
    if (d.operation.action === 'reassemble_project' && d.target.kind !== 'external' && !d.operation.project_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reassemble_project requires target.kind="external" or operation.project_path',
        path: ['operation', 'project_path'],
      });
    }
    if (d.operation.action === 'import_lorebook') {
      const format = d.operation.format ?? 'md';
      if (format === 'json' && !d.operation.source_path) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'import_lorebook JSON format requires source_path',
          path: ['operation', 'source_path'],
        });
      }
      if (format === 'md' && !d.operation.source_dir) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'import_lorebook MD format requires source_dir',
          path: ['operation', 'source_dir'],
        });
      }
    }
    if (
      (d.operation.action === 'export_lorebook' || d.operation.action === 'import_lorebook') &&
      d.target.kind !== 'active'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${d.operation.action} requires an active target`,
        path: ['target', 'kind'],
      });
    }
  });
export type ManageFileBody = z.infer<typeof manageFileBodySchema>;

export const facadeV1SuccessEnvelopeSchema = z
  .object({
    status: z.literal(200),
    summary: z.string().min(1),
    next_actions: z.array(z.string()),
    artifacts: z
      .object({
        byte_size: z.number().int().nonnegative(),
      })
      .catchall(z.unknown()),
    facade: z
      .object({
        contract: z.literal(FACADE_V1_CONTRACT_ID),
        version: z.literal('v1'),
        tool: z.enum(FACADE_V1_TOOL_NAMES),
        mutability: z.enum(['read-only', 'preview', 'mutating']),
        target: facadeV1TargetSchema.optional(),
        truncated: z.boolean().optional(),
        max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
      })
      .catchall(z.unknown()),
    result: z.unknown().optional(),
    preview: z
      .object({
        preview_token: facadeV1PreviewTokenSchema,
        operation_digest: z.string().min(16),
        expires_at: z.string().min(1),
        required_guards: z.array(facadeV1GuardSchema).optional(),
      })
      .catchall(z.unknown())
      .optional(),
  })
  .catchall(z.unknown());
export type FacadeV1SuccessEnvelope = z.infer<typeof facadeV1SuccessEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

export interface BodyValidationSuccess<T> {
  success: true;
  data: T;
}

export interface BodyValidationFailure {
  success: false;
  /** Human-readable error description. */
  error: string;
  /** Dot-joined path to the failing field (empty string for root-level issues). */
  path: string;
}

export type BodyValidationResult<T> = BodyValidationSuccess<T> | BodyValidationFailure;

/**
 * Validate a parsed request body against a Zod schema.
 *
 * Returns a discriminated union so the caller can decide how to surface the
 * error (e.g. via `mcpError`).  The schema itself is pure — no HTTP coupling.
 */
export function validateBody<T>(body: Record<string, unknown>, schema: z.ZodType<T>): BodyValidationResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const issue = result.error.issues[0];
  return {
    success: false,
    error: issue?.message ?? 'Validation failed',
    path: issue?.path.join('.') ?? '',
  };
}
