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
});
export type SearchAllBody = z.infer<typeof searchAllBodySchema>;

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
  'preview_edit',
  'apply_edit',
  'validate_content',
  'load_guidance',
] as const;
export type FacadeV1ToolName = (typeof FACADE_V1_TOOL_NAMES)[number];

export const FACADE_V1_FUTURE_TOOL_NAMES = ['manage_items', 'manage_assets', 'manage_file'] as const;

export type FacadeV1ToolMutability = 'read-only' | 'preview' | 'mutating';

export interface FacadeV1ToolContract {
  name: string;
  lifecycle: 'v1' | 'future-candidate';
  mutability: FacadeV1ToolMutability;
  preference: 'preferred';
}

export const FACADE_V1_TOOL_CONTRACTS: readonly FacadeV1ToolContract[] = [
  { name: 'inspect_document', lifecycle: 'v1', mutability: 'read-only', preference: 'preferred' },
  { name: 'read_content', lifecycle: 'v1', mutability: 'read-only', preference: 'preferred' },
  { name: 'search_document', lifecycle: 'v1', mutability: 'read-only', preference: 'preferred' },
  { name: 'preview_edit', lifecycle: 'v1', mutability: 'preview', preference: 'preferred' },
  { name: 'apply_edit', lifecycle: 'v1', mutability: 'mutating', preference: 'preferred' },
  { name: 'validate_content', lifecycle: 'v1', mutability: 'read-only', preference: 'preferred' },
  { name: 'load_guidance', lifecycle: 'v1', mutability: 'read-only', preference: 'preferred' },
  { name: 'manage_items', lifecycle: 'future-candidate', mutability: 'mutating', preference: 'preferred' },
  { name: 'manage_assets', lifecycle: 'future-candidate', mutability: 'mutating', preference: 'preferred' },
  { name: 'manage_file', lifecycle: 'future-candidate', mutability: 'mutating', preference: 'preferred' },
];

export function getFacadeV1ToolContract(name: string): FacadeV1ToolContract | undefined {
  return FACADE_V1_TOOL_CONTRACTS.find((tool) => tool.name === name);
}

const facadeMaxBytesSchema = z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional();

export const facadeV1TargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('active'),
    document: z.literal('current').optional(),
  }),
  z.object({
    kind: z.literal('external'),
    file_path: z.string().min(1),
  }),
  z
    .object({
      kind: z.literal('reference'),
      reference_id: z.string().min(1).optional(),
      file_path: z.string().min(1).optional(),
    })
    .refine((d) => d.reference_id !== undefined || d.file_path !== undefined, {
      message: 'reference target requires reference_id or file_path',
      path: ['reference_id'],
    }),
  z
    .object({
      kind: z.literal('guidance'),
      skill: z.string().min(1).optional(),
      document: z.string().min(1).optional(),
    })
    .refine((d) => d.skill !== undefined || d.document !== undefined, {
      message: 'guidance target requires skill or document',
      path: ['skill'],
    }),
  z.object({
    kind: z.literal('session'),
  }),
]);
export type FacadeV1Target = z.infer<typeof facadeV1TargetSchema>;

export const facadeV1ContentSelectorSchema = z.object({
  family: z
    .enum(['field', 'surface', 'lorebook', 'regex', 'greeting', 'trigger', 'lua', 'css', 'asset', 'risup-prompt'])
    .optional(),
  path: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
  index: z.number().int().nonnegative().optional(),
  indices: z.array(z.number().int().nonnegative()).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
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

export const facadeV1SearchDocumentBodySchema = z.object({
  target: facadeV1TargetSchema,
  query: z.string().min(1),
  regex: boolish.optional(),
  flags: lenientString,
  context_chars: lenientNumber,
  max_matches: z.number().int().positive().max(FACADE_V1_LIMITS.maxMatches).optional(),
  max_bytes: facadeMaxBytesSchema,
});
export type FacadeV1SearchDocumentBody = z.infer<typeof facadeV1SearchDocumentBodySchema>;

const facadeV1EditOperationSchema = z.object({
  op: z.enum(['write_content', 'replace_text', 'insert_text', 'delete_item', 'patch_surface']),
  selector: facadeV1ContentSelectorSchema,
  content: z.unknown().optional(),
  find: z.string().min(1).optional(),
  replace: z.string().optional(),
  guards: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
});
export type FacadeV1EditOperation = z.infer<typeof facadeV1EditOperationSchema>;

export const facadeV1PreviewEditBodySchema = z
  .object({
    target: facadeV1TargetSchema,
    operations: z.array(facadeV1EditOperationSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems),
    dry_run: boolish.optional(),
    dryRun: boolish.optional(),
    max_bytes: facadeMaxBytesSchema,
  })
  .refine((d) => !hasDryRunConflict(d), DRY_RUN_CONFLICT_MSG);
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
  target: z
    .object({
      kind: z.literal('guidance'),
      skill: z.string().min(1).optional(),
      document: z.string().min(1).optional(),
    })
    .refine((d) => d.skill !== undefined || d.document !== undefined, {
      message: 'guidance target requires skill or document',
      path: ['skill'],
    }),
  max_bytes: facadeMaxBytesSchema,
});
export type FacadeV1LoadGuidanceBody = z.infer<typeof facadeV1LoadGuidanceBodySchema>;

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
