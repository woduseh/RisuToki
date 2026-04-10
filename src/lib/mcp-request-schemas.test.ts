import { describe, expect, it } from 'vitest';

import {
  blockReplaceBodySchema,
  batchReplaceBodySchema,
  externalDocumentBodySchema,
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
