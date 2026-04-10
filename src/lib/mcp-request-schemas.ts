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
