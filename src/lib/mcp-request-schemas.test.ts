import { describe, expect, it } from 'vitest';

import {
  blockReplaceBodySchema,
  batchReplaceBodySchema,
  externalDocumentBodySchema,
  FACADE_V1_CONTRACT_ID,
  FACADE_V1_FUTURE_TOOL_NAMES,
  FACADE_V1_LIMITS,
  FACADE_V1_TOOL_CONTRACTS,
  FACADE_V1_TOOL_NAMES,
  facadeV1ApplyEditBodySchema,
  facadeV1InspectDocumentBodySchema,
  facadeV1PreviewEditBodySchema,
  facadeV1ReadContentBodySchema,
  facadeV1SearchDocumentBodySchema,
  facadeV1SuccessEnvelopeSchema,
  getFacadeV1ToolContract,
  fieldBatchReadSchema,
  fieldBatchWriteSchema,
  insertBodySchema,
  replaceBodySchema,
  searchAllBodySchema,
  searchBodySchema,
  validateBody,
  writeFieldBodySchema,
} from './mcp-request-schemas';

// ---------------------------------------------------------------------------
// validateBody helper
// ---------------------------------------------------------------------------

describe('validateBody', () => {
  it('returns typed data on success', () => {
    const result = validateBody({ find: 'hello' }, replaceBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.find).toBe('hello');
    }
  });

  it('returns error + path on failure', () => {
    const result = validateBody({}, replaceBodySchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.path).toBe('find');
      expect(result.error).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// writeFieldBodySchema
// ---------------------------------------------------------------------------

describe('writeFieldBodySchema', () => {
  it('accepts any content value', () => {
    expect(validateBody({ content: 'hello' }, writeFieldBodySchema).success).toBe(true);
    expect(validateBody({ content: 42 }, writeFieldBodySchema).success).toBe(true);
    expect(validateBody({ content: true }, writeFieldBodySchema).success).toBe(true);
    expect(validateBody({ content: ['a', 'b'] }, writeFieldBodySchema).success).toBe(true);
  });

  it('rejects missing content', () => {
    const result = validateBody({}, writeFieldBodySchema);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fieldBatchReadSchema
// ---------------------------------------------------------------------------

describe('fieldBatchReadSchema', () => {
  it('accepts valid string arrays', () => {
    const result = validateBody({ fields: ['name', 'description'] }, fieldBatchReadSchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fields).toEqual(['name', 'description']);
    }
  });

  it('rejects non-array fields', () => {
    expect(validateBody({ fields: 'name' }, fieldBatchReadSchema).success).toBe(false);
  });

  it('rejects arrays with non-string elements', () => {
    expect(validateBody({ fields: [42] }, fieldBatchReadSchema).success).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(validateBody({}, fieldBatchReadSchema).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fieldBatchWriteSchema
// ---------------------------------------------------------------------------

describe('fieldBatchWriteSchema', () => {
  it('accepts valid entries', () => {
    const result = validateBody({ entries: [{ field: 'name', content: 'value' }] }, fieldBatchWriteSchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entries).toHaveLength(1);
      expect(result.data.entries[0].field).toBe('name');
    }
  });

  it('rejects entries with empty field name', () => {
    const result = validateBody({ entries: [{ field: '', content: 'v' }] }, fieldBatchWriteSchema);
    expect(result.success).toBe(false);
  });

  it('rejects non-array entries', () => {
    expect(validateBody({ entries: 'not-array' }, fieldBatchWriteSchema).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// replaceBodySchema
// ---------------------------------------------------------------------------

describe('replaceBodySchema', () => {
  it('accepts minimal replace body (find only)', () => {
    const result = validateBody({ find: 'hello' }, replaceBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.find).toBe('hello');
      expect(result.data.replace).toBeUndefined();
      expect(result.data.regex).toBeUndefined();
    }
  });

  it('accepts full replace body', () => {
    const result = validateBody(
      { find: 'old', replace: 'new', regex: true, flags: 'gi', dry_run: true },
      replaceBodySchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.find).toBe('old');
      expect(result.data.replace).toBe('new');
      expect(result.data.regex).toBe(true);
      expect(result.data.flags).toBe('gi');
      expect(result.data.dry_run).toBe(true);
    }
  });

  it('coerces numeric boolish values', () => {
    const result = validateBody({ find: 'x', regex: 1, dry_run: 0 }, replaceBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.regex).toBe(true);
      expect(result.data.dry_run).toBe(false);
    }
  });

  it('accepts optional lorebook field target', () => {
    const result = validateBody({ find: 'old', field: 'comment' }, replaceBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.field).toBe('comment');
    }
  });

  it('rejects empty find', () => {
    expect(validateBody({ find: '' }, replaceBodySchema).success).toBe(false);
  });

  it('rejects missing find', () => {
    expect(validateBody({ replace: 'new' }, replaceBodySchema).success).toBe(false);
  });

  it('rejects non-string find', () => {
    expect(validateBody({ find: 42 }, replaceBodySchema).success).toBe(false);
  });

  it('accepts dry_run alone', () => {
    const result = validateBody({ find: 'x', dry_run: true }, replaceBodySchema);
    expect(result.success).toBe(true);
  });

  it('accepts dryRun alone', () => {
    const result = validateBody({ find: 'x', dryRun: true }, replaceBodySchema);
    expect(result.success).toBe(true);
  });

  it('accepts both dry_run and dryRun when they agree', () => {
    const result = validateBody({ find: 'x', dry_run: true, dryRun: true }, replaceBodySchema);
    expect(result.success).toBe(true);
  });

  it('rejects conflicting dry_run and dryRun', () => {
    const result = validateBody({ find: 'x', dry_run: true, dryRun: false }, replaceBodySchema);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('conflicting');
  });
});

// ---------------------------------------------------------------------------
// blockReplaceBodySchema
// ---------------------------------------------------------------------------

describe('blockReplaceBodySchema', () => {
  it('accepts valid block replace body', () => {
    const result = validateBody(
      { start_anchor: '<!-- START -->', end_anchor: '<!-- END -->', content: 'new block' },
      blockReplaceBodySchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.start_anchor).toBe('<!-- START -->');
      expect(result.data.end_anchor).toBe('<!-- END -->');
      expect(result.data.content).toBe('new block');
      expect(result.data.include_anchors).toBeUndefined();
    }
  });

  it('defaults include_anchors to undefined (caller defaults to true)', () => {
    const result = validateBody({ start_anchor: 'A', end_anchor: 'B' }, blockReplaceBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.include_anchors).toBeUndefined();
    }
  });

  it('rejects missing start_anchor', () => {
    const result = validateBody({ end_anchor: 'B' }, blockReplaceBodySchema);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.path).toBe('start_anchor');
  });

  it('rejects missing end_anchor', () => {
    const result = validateBody({ start_anchor: 'A' }, blockReplaceBodySchema);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.path).toBe('end_anchor');
  });

  it('rejects conflicting dry_run and dryRun', () => {
    const result = validateBody(
      { start_anchor: 'A', end_anchor: 'B', dry_run: true, dryRun: false },
      blockReplaceBodySchema,
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('conflicting');
  });
});

// ---------------------------------------------------------------------------
// insertBodySchema
// ---------------------------------------------------------------------------

describe('insertBodySchema', () => {
  it('accepts insert with default position (end)', () => {
    const result = validateBody({ content: 'new text' }, insertBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('new text');
      expect(result.data.position).toBeUndefined();
    }
  });

  it('accepts insert with anchor', () => {
    const result = validateBody({ content: 'insert', position: 'after', anchor: 'marker' }, insertBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.position).toBe('after');
      expect(result.data.anchor).toBe('marker');
    }
  });

  it('coerces invalid position to undefined (caller defaults to end)', () => {
    const result = validateBody({ content: 'text', position: 'middle' }, insertBodySchema);
    // Non-enum position values are coerced to undefined, not rejected
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.position).toBeUndefined();
    }
  });

  it('coerces numeric position to undefined', () => {
    const result = validateBody({ content: 'text', position: 0 }, insertBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.position).toBeUndefined();
    }
  });

  it('rejects missing content', () => {
    expect(validateBody({}, insertBodySchema).success).toBe(false);
  });

  it('rejects non-string content', () => {
    expect(validateBody({ content: 42 }, insertBodySchema).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// batchReplaceBodySchema
// ---------------------------------------------------------------------------

describe('batchReplaceBodySchema', () => {
  it('accepts valid batch replacements', () => {
    const result = validateBody(
      {
        replacements: [
          { find: 'a', replace: 'b' },
          { find: 'c', replace: 'd', regex: true, flags: 'gi' },
        ],
      },
      batchReplaceBodySchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.replacements).toHaveLength(2);
      expect(result.data.replacements[1].regex).toBe(true);
    }
  });

  it('rejects empty replacements array', () => {
    // Empty array is structurally valid in Zod; the caller checks length limits
    const result = validateBody({ replacements: [] }, batchReplaceBodySchema);
    expect(result.success).toBe(true);
  });

  it('rejects missing find in a replacement entry', () => {
    const result = validateBody({ replacements: [{ replace: 'b' }] }, batchReplaceBodySchema);
    expect(result.success).toBe(false);
  });

  it('rejects non-array replacements', () => {
    expect(validateBody({ replacements: 'bad' }, batchReplaceBodySchema).success).toBe(false);
  });

  it('rejects conflicting dry_run and dryRun', () => {
    const result = validateBody(
      { replacements: [{ find: 'a', replace: 'b' }], dry_run: false, dryRun: true },
      batchReplaceBodySchema,
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('conflicting');
  });
});

// ---------------------------------------------------------------------------
// searchBodySchema
// ---------------------------------------------------------------------------

describe('searchBodySchema', () => {
  it('accepts minimal search body', () => {
    const result = validateBody({ query: 'hello' }, searchBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe('hello');
    }
  });

  it('accepts full search body', () => {
    const result = validateBody(
      { query: 'test', regex: true, flags: 'gi', context_chars: 200, max_matches: 50 },
      searchBodySchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.regex).toBe(true);
      expect(result.data.context_chars).toBe(200);
    }
  });

  it('coerces numeric string options to numbers', () => {
    const result = validateBody({ query: 'test', context_chars: '120', max_matches: '8' }, searchBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context_chars).toBe(120);
      expect(result.data.max_matches).toBe(8);
    }
  });

  it('coerces invalid numeric strings to undefined', () => {
    const result = validateBody({ query: 'test', context_chars: 'wide', max_matches: 'many' }, searchBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context_chars).toBeUndefined();
      expect(result.data.max_matches).toBeUndefined();
    }
  });

  it('rejects empty query', () => {
    expect(validateBody({ query: '' }, searchBodySchema).success).toBe(false);
  });

  it('rejects missing query', () => {
    expect(validateBody({}, searchBodySchema).success).toBe(false);
  });

  it('coerces non-string flags to undefined', () => {
    const result = validateBody({ query: 'x', flags: 123 }, searchBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flags).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// searchAllBodySchema
// ---------------------------------------------------------------------------

describe('searchAllBodySchema', () => {
  it('accepts minimal search-all body', () => {
    const result = validateBody({ query: 'find me' }, searchAllBodySchema);
    expect(result.success).toBe(true);
  });

  it('accepts full search-all body', () => {
    const result = validateBody(
      {
        query: 'test',
        regex: false,
        flags: 'i',
        include_lorebook: false,
        include_greetings: true,
        context_chars: 60,
        max_matches_per_field: 5,
      },
      searchAllBodySchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.include_lorebook).toBe(false);
    }
  });

  it('coerces numeric string options to numbers', () => {
    const result = validateBody(
      { query: 'test', context_chars: '60', max_matches_per_field: '4' },
      searchAllBodySchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context_chars).toBe(60);
      expect(result.data.max_matches_per_field).toBe(4);
    }
  });

  it('coerces invalid numeric strings to undefined', () => {
    const result = validateBody(
      { query: 'test', context_chars: 'wide', max_matches_per_field: 'many' },
      searchAllBodySchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context_chars).toBeUndefined();
      expect(result.data.max_matches_per_field).toBeUndefined();
    }
  });

  it('rejects missing query', () => {
    expect(validateBody({ regex: true }, searchAllBodySchema).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// externalDocumentBodySchema
// ---------------------------------------------------------------------------

describe('externalDocumentBodySchema', () => {
  it('accepts valid file_path', () => {
    const result = validateBody({ file_path: 'C:\\path\\to\\file.charx' }, externalDocumentBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.file_path).toBe('C:\\path\\to\\file.charx');
    }
  });

  it('preserves extra fields via catchall', () => {
    const result = validateBody(
      { file_path: '/path/file.risum', save_current: true, extra: 42 },
      externalDocumentBodySchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.save_current).toBe(true);
      expect((result.data as Record<string, unknown>).extra).toBe(42);
    }
  });

  it('rejects empty file_path', () => {
    expect(validateBody({ file_path: '' }, externalDocumentBodySchema).success).toBe(false);
  });

  it('rejects missing file_path', () => {
    expect(validateBody({}, externalDocumentBodySchema).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Facade v1 public contract
// ---------------------------------------------------------------------------

describe('facade v1 contract schemas', () => {
  it('defines a smaller first-wave facade tool set and future candidates', () => {
    expect(FACADE_V1_TOOL_NAMES).toEqual([
      'inspect_document',
      'read_content',
      'search_document',
      'preview_edit',
      'apply_edit',
      'validate_content',
      'load_guidance',
    ]);
    expect(FACADE_V1_FUTURE_TOOL_NAMES).toEqual(['manage_items', 'manage_assets', 'manage_file']);

    const readOnly = FACADE_V1_TOOL_CONTRACTS.filter(
      (tool) => tool.lifecycle === 'v1' && tool.mutability === 'read-only',
    ).map((tool) => tool.name);
    expect(readOnly).toEqual([
      'inspect_document',
      'read_content',
      'search_document',
      'validate_content',
      'load_guidance',
    ]);
    expect(getFacadeV1ToolContract('preview_edit')?.mutability).toBe('preview');
    expect(getFacadeV1ToolContract('apply_edit')?.mutability).toBe('mutating');
    expect(getFacadeV1ToolContract('manage_assets')?.lifecycle).toBe('future-candidate');
  });

  it('uses explicit target discriminators for active, external, reference, guidance, and session routes', () => {
    const targets = [
      { kind: 'active', document: 'current' },
      { kind: 'external', file_path: 'C:\\fixtures\\bot.charx' },
      { kind: 'reference', reference_id: 'ref-1' },
      { kind: 'guidance', skill: 'using-mcp-tools' },
      { kind: 'session' },
    ];

    for (const target of targets) {
      expect(validateBody({ target }, facadeV1InspectDocumentBodySchema).success).toBe(true);
    }
    expect(validateBody({ target: { kind: 'reference' } }, facadeV1InspectDocumentBodySchema).success).toBe(false);
    expect(validateBody({ target: { kind: 'external' } }, facadeV1InspectDocumentBodySchema).success).toBe(false);
  });

  it('bounds read/search batches and max_bytes for context-safe facade calls', () => {
    const tooManySelectors = Array.from({ length: FACADE_V1_LIMITS.maxBatchItems + 1 }, (_, index) => ({
      family: 'field',
      field: `field_${index}`,
    }));

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          selectors: tooManySelectors,
        },
        facadeV1ReadContentBodySchema,
      ).success,
    ).toBe(false);
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          query: 'needle',
          max_matches: FACADE_V1_LIMITS.maxMatches + 1,
        },
        facadeV1SearchDocumentBodySchema,
      ).success,
    ).toBe(false);
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          max_bytes: FACADE_V1_LIMITS.maxBytes + 1,
        },
        facadeV1ReadContentBodySchema,
      ).success,
    ).toBe(false);
  });

  it('codifies preview-token-first mutation flow with propagated guards', () => {
    const preview = validateBody(
      {
        target: { kind: 'active' },
        operations: [
          {
            op: 'replace_text',
            selector: { family: 'lorebook', index: 2 },
            find: 'old',
            replace: 'new',
            guards: [
              {
                name: 'expected_comment',
                value: 'stable comment',
                payloadPath: '/operations/*/guards/*',
                sourceOperations: ['list_lorebook', 'read_lorebook'],
                sourceResultPath: '/entries/*/comment or /comment',
              },
            ],
          },
        ],
        dry_run: true,
      },
      facadeV1PreviewEditBodySchema,
    );
    expect(preview.success).toBe(true);

    const apply = validateBody(
      {
        preview_token: 'facade-preview-v1.abcdef0123456789',
        operation_digest: '0123456789abcdef',
        target: { kind: 'active' },
        guard_values: [{ name: 'expected_comment', value: 'stable comment' }],
      },
      facadeV1ApplyEditBodySchema,
    );
    expect(apply.success).toBe(true);

    expect(
      validateBody(
        {
          preview_token: 'missing-prefix',
          operation_digest: '0123456789abcdef',
          target: { kind: 'active' },
        },
        facadeV1ApplyEditBodySchema,
      ).success,
    ).toBe(false);
  });

  it('locks the additive facade success envelope shape', () => {
    const result = validateBody(
      {
        status: 200,
        summary: 'Previewed 1 edit',
        next_actions: ['apply_edit', 'read_content'],
        artifacts: { byte_size: 512, operation_count: 1 },
        facade: {
          contract: FACADE_V1_CONTRACT_ID,
          version: 'v1',
          tool: 'preview_edit',
          mutability: 'preview',
          target: { kind: 'active' },
          truncated: false,
          max_bytes: FACADE_V1_LIMITS.maxBytes,
        },
        preview: {
          preview_token: 'facade-preview-v1.abcdef0123456789',
          operation_digest: '0123456789abcdef',
          expires_at: '2026-01-01T00:00:00.000Z',
          required_guards: [{ name: 'expected_hash', value: 'abc123' }],
        },
      },
      facadeV1SuccessEnvelopeSchema,
    );

    expect(result.success).toBe(true);
  });
});
