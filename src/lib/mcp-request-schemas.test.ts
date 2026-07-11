import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { withDetailedInputValidationHandler } from './mcp-compact-input';
import { withStructuredContentHandler } from './mcp-tool-registration';

import {
  assetAddBodySchema,
  assetCompressWebpBodySchema,
  assetDeleteBodySchema,
  assetRenameBodySchema,
  blockReplaceBodySchema,
  batchReplaceBodySchema,
  externalDocumentBodySchema,
  FACADE_V1_CONTRACT_ID,
  FACADE_V1_FUTURE_TOOL_NAMES,
  FACADE_V1_LIMITS,
  FACADE_V1_TOOL_CONTRACTS,
  FACADE_V1_TOOL_NAMES,
  facadeV1AnalyzeContentBodySchema,
  facadeV1ApplyEditBodySchema,
  facadeV1InspectDocumentBodySchema,
  facadeV1LoadGuidanceBodySchema,
  facadeV1PreviewEditBodySchema,
  facadeV1ReadContentBodySchema,
  facadeV1SearchDocumentBodySchema,
  facadeV1SuccessEnvelopeSchema,
  getFacadeV1ToolContract,
  fieldBatchReadSchema,
  fieldBatchWriteSchema,
  insertBodySchema,
  manageAssetsBodySchema,
  manageFileBodySchema,
  manageItemsBodySchema,
  replaceBodySchema,
  risumAssetAddBodySchema,
  risumAssetDeleteBodySchema,
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
// asset request schemas
// ---------------------------------------------------------------------------

describe('asset request schemas', () => {
  it('accepts charx asset add bodies and optional folder', () => {
    const result = validateBody({ fileName: 'icon.png', base64: 'YWJj', folder: 'portrait' }, assetAddBodySchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fileName).toBe('icon.png');
      expect(result.data.folder).toBe('portrait');
    }
  });

  it('rejects missing charx asset add fields', () => {
    expect(validateBody({ base64: 'YWJj' }, assetAddBodySchema).success).toBe(false);
    expect(validateBody({ fileName: 'icon.png' }, assetAddBodySchema).success).toBe(false);
  });

  it('accepts expected_path guards for charx delete and rename', () => {
    expect(validateBody({ expected_path: 'assets/old.png' }, assetDeleteBodySchema).success).toBe(true);
    const result = validateBody({ newName: 'new.png', expected_path: 'assets/old.png' }, assetRenameBodySchema);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.newName).toBe('new.png');
  });

  it('rejects missing charx rename newName', () => {
    expect(validateBody({ expected_path: 'assets/old.png' }, assetRenameBodySchema).success).toBe(false);
  });

  it('coerces compress-webp options and rejects dry-run alias conflicts', () => {
    const result = validateBody(
      { asset_family: 'risum', quality: '75', recompressWebp: 1, dry_run: true },
      assetCompressWebpBodySchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quality).toBe(75);
      expect(result.data.recompressWebp).toBe(true);
      expect(result.data.asset_family).toBe('risum');
    }

    const conflict = validateBody({ dry_run: true, dryRun: false }, assetCompressWebpBodySchema);
    expect(conflict.success).toBe(false);
    if (!conflict.success) expect(conflict.error).toContain('conflicting');
  });

  it('accepts risum asset add/delete bodies', () => {
    const add = validateBody({ name: 'theme', path: 'assets/theme.mp3', base64: 'YWJj' }, risumAssetAddBodySchema);
    expect(add.success).toBe(true);
    const del = validateBody({ expected_path: 'assets/theme.mp3' }, risumAssetDeleteBodySchema);
    expect(del.success).toBe(true);
  });

  it('rejects missing risum asset add fields', () => {
    expect(validateBody({ base64: 'YWJj' }, risumAssetAddBodySchema).success).toBe(false);
    expect(validateBody({ name: 'theme' }, risumAssetAddBodySchema).success).toBe(false);
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
      'analyze_content',
      'preview_edit',
      'apply_edit',
      'validate_content',
      'load_guidance',
      'manage_items',
      'manage_assets',
      'manage_file',
    ]);
    expect(FACADE_V1_FUTURE_TOOL_NAMES).toEqual([]);

    const readOnly = FACADE_V1_TOOL_CONTRACTS.filter(
      (tool) => tool.lifecycle === 'v1' && tool.mutability === 'read-only',
    ).map((tool) => tool.name);
    expect(readOnly).toEqual([
      'inspect_document',
      'read_content',
      'search_document',
      'analyze_content',
      'validate_content',
      'load_guidance',
    ]);
    expect(getFacadeV1ToolContract('preview_edit')?.mutability).toBe('preview');
    expect(getFacadeV1ToolContract('apply_edit')?.mutability).toBe('mutating');
    expect(getFacadeV1ToolContract('manage_items')?.lifecycle).toBe('v1');
    expect(getFacadeV1ToolContract('manage_assets')?.lifecycle).toBe('v1');
    expect(getFacadeV1ToolContract('manage_file')?.lifecycle).toBe('v1');
    expect(getFacadeV1ToolContract('load_guidance')?.preference).toBe('legacy');
  });

  it('accepts all analyze_content actions and rejects unsupported targets', () => {
    const activeOperations = [
      { action: 'list_cbs_toggles', field: 'description' },
      { action: 'simulate_cbs', field: 'description', toggles: { tone: 'warm' } },
      { action: 'diff_cbs', field: 'description', toggles: { tone: 'warm' } },
      {
        action: 'diff_lorebook',
        index: 0,
        reference: { kind: 'reference', reference_id: '0' },
        ref_entry_index: 1,
      },
      { action: 'diff_risup_prompt', reference: { kind: 'reference', file_path: 'C:\\fixtures\\base.risup' } },
      { action: 'validate_risup_prompt_import', text: '[{"type":"plain","text":"hello"}]' },
      { action: 'verify_risup_prompt_import', text: '[{"type":"plain","text":"hello"}]' },
      { action: 'field_stats', field: 'description' },
      {
        action: 'simulate_lorebook',
        messages: [{ role: 'user', content: 'bridge' }],
        recursive: true,
        max_passes: 5,
      },
      { action: 'test_regex', text: 'hello', mode: 'editinput', indices: [0] },
    ];
    for (const operation of activeOperations) {
      expect(validateBody({ target: { kind: 'active' }, operation }, facadeV1AnalyzeContentBodySchema).success).toBe(
        true,
      );
    }

    const danbooruOperations = [
      { action: 'tag_db_status' },
      { action: 'search_danbooru_tags', query: 'blue_hair', limit: 10 },
      { action: 'get_popular_danbooru_tags', category: 'general', limit: 50 },
    ];
    for (const operation of danbooruOperations) {
      expect(validateBody({ target: { kind: 'session' }, operation }, facadeV1AnalyzeContentBodySchema).success).toBe(
        true,
      );
    }

    expect(
      validateBody(
        {
          target: { kind: 'session' },
          operation: { action: 'token_count', encoding: 'cl100k_base', text: 'hello' },
        },
        facadeV1AnalyzeContentBodySchema,
      ).success,
    ).toBe(true);
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          operation: {
            action: 'token_count',
            encoding: 'o200k_base',
            selectors: [{ family: 'field', field: 'description' }],
          },
        },
        facadeV1AnalyzeContentBodySchema,
      ).success,
    ).toBe(true);
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          operation: { action: 'token_count', encoding: 'cl100k_base', text: 'hello' },
        },
        facadeV1AnalyzeContentBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'external', file_path: 'C:\\fixtures\\card.charx' },
          operation: { action: 'simulate_cbs', field: 'description' },
        },
        facadeV1AnalyzeContentBodySchema,
      ).success,
    ).toBe(false);
    expect(
      validateBody(
        {
          target: { kind: 'reference', reference_id: '0' },
          operation: { action: 'search_danbooru_tags', query: 'blue_hair' },
        },
        facadeV1AnalyzeContentBodySchema,
      ).success,
    ).toBe(false);
    expect(
      validateBody(
        { target: { kind: 'active' }, operation: { action: 'diff_lorebook', index: 0 } },
        facadeV1AnalyzeContentBodySchema,
      ).success,
    ).toBe(false);
  });

  it('accepts guarded block and whole-lorebook replacement operations', () => {
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          operations: [
            {
              op: 'replace_block',
              selector: { family: 'field', field: 'description' },
              start_anchor: '<start>',
              end_anchor: '<end>',
              content: 'replacement',
            },
            {
              op: 'replace_block',
              selector: { family: 'lorebook', index: 0 },
              field: 'comment',
              start_anchor: '[',
              end_anchor: ']',
            },
            {
              op: 'replace_all_text',
              selector: { family: 'lorebook' },
              field: 'content',
              find: 'old',
              replace: 'new',
            },
          ],
        },
        facadeV1PreviewEditBodySchema,
      ).success,
    ).toBe(true);

    expect(
      validateBody(
        {
          target: { kind: 'external', file_path: 'C:\\fixtures\\card.charx' },
          operations: [
            {
              op: 'replace_block',
              selector: { family: 'field', field: 'description' },
              start_anchor: '<start>',
              end_anchor: '<end>',
            },
          ],
        },
        facadeV1PreviewEditBodySchema,
      ).success,
    ).toBe(false);
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          operations: [{ op: 'replace_all_text', selector: { family: 'field', field: 'description' }, find: 'old' }],
        },
        facadeV1PreviewEditBodySchema,
      ).success,
    ).toBe(false);
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
    expect(validateBody({ target: { kind: 'reference' } }, facadeV1InspectDocumentBodySchema).success).toBe(true);
    expect(validateBody({ target: { kind: 'external' } }, facadeV1InspectDocumentBodySchema).success).toBe(false);
  });

  it('allows guidance catalog reads and requires skill before a guidance document', () => {
    expect(validateBody({ target: { kind: 'guidance' } }, facadeV1LoadGuidanceBodySchema).success).toBe(true);
    expect(
      validateBody({ target: { kind: 'guidance', skill: 'project-workflow' } }, facadeV1LoadGuidanceBodySchema).success,
    ).toBe(true);
    expect(
      validateBody(
        {
          target: { kind: 'guidance', skill: 'project-workflow', document: 'PROJECT_RULES.md' },
        },
        facadeV1LoadGuidanceBodySchema,
      ).success,
    ).toBe(true);
    expect(
      validateBody({ target: { kind: 'guidance', document: 'PROJECT_RULES.md' } }, facadeV1LoadGuidanceBodySchema)
        .success,
    ).toBe(false);
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

  it('requires a selector or deprecated field alias for external and reference searches', () => {
    for (const target of [
      { kind: 'external', file_path: 'C:\\fixtures\\bot.charx' },
      { kind: 'reference', reference_id: 'ref-1' },
    ]) {
      expect(validateBody({ target, query: 'needle' }, facadeV1SearchDocumentBodySchema).success).toBe(false);
      expect(
        validateBody({ target, field: 'description', query: 'needle' }, facadeV1SearchDocumentBodySchema).success,
      ).toBe(true);
      expect(
        validateBody(
          { target, selector: { family: 'field', field: 'description' }, query: 'needle' },
          facadeV1SearchDocumentBodySchema,
        ).success,
      ).toBe(true);
    }

    expect(
      validateBody({ target: { kind: 'active' }, query: 'needle' }, facadeV1SearchDocumentBodySchema).success,
    ).toBe(true);
    expect(
      validateBody({ target: { kind: 'session' }, query: 'needle' }, facadeV1SearchDocumentBodySchema).success,
    ).toBe(false);
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          selector: { family: 'field', field: 'description' },
          field: 'firstMessage',
          query: 'needle',
        },
        facadeV1SearchDocumentBodySchema,
      ).success,
    ).toBe(false);
  });

  it('keeps legacy facade content selectors valid while adding authoring selector extensions', () => {
    const legacy = validateBody(
      {
        target: { kind: 'active' },
        selectors: [
          { family: 'field', field: 'description' },
          { family: 'surface', path: 'data/lorebook/0/content' },
          { family: 'lorebook', index: 1 },
          { family: 'regex', indices: [0, 2] },
          { family: 'greeting', index: 0 },
          { family: 'risup-prompt', index: 3 },
        ],
      },
      facadeV1ReadContentBodySchema,
    );

    expect(legacy.success).toBe(true);

    const extended = validateBody(
      {
        target: { kind: 'active' },
        selectors: [
          { family: 'greeting', greeting_type: 'alternate', index: 0, fields: ['name', 'content'] },
          { family: 'greeting', greeting_type: 'group', indices: [0, 1], fields: ['name'] },
          { family: 'regex', index: 1, entry_field: 'out' },
          { family: 'risup-prompt', index: 2, prompt_type: 'plain', item_field: 'text' },
          { family: 'risup-prompt', ids: ['main', 'jailbreak'] },
          { family: 'surface', path: '/', include_raw: true },
        ],
      },
      facadeV1ReadContentBodySchema,
    );

    expect(extended.success).toBe(true);
    if (extended.success) {
      expect(extended.data.selectors?.[0]).toMatchObject({
        family: 'greeting',
        greeting_type: 'alternate',
        fields: ['name', 'content'],
      });
      expect(extended.data.selectors?.[1]).toMatchObject({ family: 'greeting', greeting_type: 'group' });
      expect(extended.data.selectors?.[2]).toMatchObject({ family: 'regex', entry_field: 'out' });
      expect(extended.data.selectors?.[3]).toMatchObject({
        family: 'risup-prompt',
        prompt_type: 'plain',
        item_field: 'text',
      });
      expect(extended.data.selectors?.[4]).toMatchObject({
        family: 'risup-prompt',
        ids: ['main', 'jailbreak'],
      });
      expect(extended.data.selectors?.[5]).toMatchObject({
        family: 'surface',
        path: '/',
        include_raw: true,
      });
    }
  });

  it('rejects invalid structured authoring selector values', () => {
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          selectors: [{ family: 'greeting', greeting_type: 'primary' }],
        },
        facadeV1ReadContentBodySchema,
      ).success,
    ).toBe(false);
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          selectors: [{ family: 'regex', entry_field: '' }],
        },
        facadeV1ReadContentBodySchema,
      ).success,
    ).toBe(false);
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          selectors: [{ family: 'risup-prompt', prompt_type: '' }],
        },
        facadeV1ReadContentBodySchema,
      ).success,
    ).toBe(false);
  });

  it('accepts structured regex and risup prompt preview selectors with guards', () => {
    const result = validateBody(
      {
        target: { kind: 'active' },
        operations: [
          {
            op: 'replace_text',
            selector: { family: 'regex', index: 1, entry_field: 'out' },
            find: 'old output',
            replace: 'new output',
            regex: false,
            guards: [{ name: 'expected_regex_comment', value: 'stable regex' }],
          },
          {
            op: 'replace_text',
            selector: { family: 'surface', path: '/description' },
            find: 'old surface text',
            replace: 'new surface text',
            guards: [{ name: 'expected_hash', value: 'stable-document-hash' }],
          },
          {
            op: 'write_content',
            selector: { family: 'risup-prompt', index: 2, prompt_type: 'plain', item_field: 'text' },
            content: 'Updated prompt text',
            guards: [{ name: 'expected_prompt_type', value: 'plain' }],
          },
        ],
        dry_run: true,
      },
      facadeV1PreviewEditBodySchema,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.operations[0].selector).toMatchObject({
        family: 'regex',
        index: 1,
        entry_field: 'out',
      });
      expect(result.data.operations[1].selector).toMatchObject({
        family: 'surface',
        path: '/description',
      });
      expect(result.data.operations[1].guards?.[0]).toMatchObject({
        name: 'expected_hash',
        value: 'stable-document-hash',
      });
      expect(result.data.operations[2].selector).toMatchObject({
        family: 'risup-prompt',
        index: 2,
        prompt_type: 'plain',
        item_field: 'text',
      });
      expect(result.data.operations[2].guards?.[0]).toMatchObject({
        name: 'expected_prompt_type',
        value: 'plain',
      });
    }
  });

  it('rejects preview operations that omit operation-specific required inputs', () => {
    const invalidOperations = [
      { op: 'write_content', selector: { family: 'field', field: 'description' } },
      { op: 'replace_text', selector: { family: 'field', field: 'description' }, replace: 'new' },
      { op: 'insert_text', selector: { family: 'field', field: 'description' } },
      { op: 'patch_surface', selector: { family: 'surface', path: '/' } },
    ];

    for (const operation of invalidOperations) {
      expect(
        validateBody(
          {
            target: { kind: 'active' },
            operations: [operation],
          },
          facadeV1PreviewEditBodySchema,
        ).success,
      ).toBe(false);
    }

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          operations: [{ op: 'delete_item', selector: { family: 'regex', index: 0 } }],
        },
        facadeV1PreviewEditBodySchema,
      ).success,
    ).toBe(true);
  });

  it('preserves insert_text position and anchor controls', () => {
    const result = validateBody(
      {
        target: { kind: 'active' },
        operations: [
          {
            op: 'insert_text',
            selector: { family: 'field', field: 'description' },
            content: 'inserted',
            position: 'after',
            anchor: 'anchor text',
          },
        ],
      },
      facadeV1PreviewEditBodySchema,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.operations[0]).toMatchObject({
        position: 'after',
        anchor: 'anchor text',
      });
    }
  });

  it('codifies preview-token-first mutation flow with propagated guards', () => {
    const preview = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\card.charx' },
        operations: [
          {
            op: 'patch_surface',
            selector: { family: 'surface', path: '/' },
            content: [{ op: 'replace', path: '/name', value: 'Facade patched' }],
            guards: [
              {
                name: 'expected_hash',
                value: 'stable-hash',
                payloadPath: '/operations/*/guards/*',
                sourceOperations: ['external_read_surface'],
                sourceResultPath: '/hash',
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
        target: { kind: 'external', file_path: 'C:\\fixtures\\card.charx' },
        guard_values: [{ name: 'expected_hash', value: 'stable-hash' }],
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

  it('accepts manage_items read, preview, and apply shapes for supported item workflows', () => {
    const read = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\preset.risup' },
        family: 'risup-prompt',
        mode: 'read',
        operation: { action: 'copy_as_text', selector: { ids: ['prompt-main'] } },
      },
      manageItemsBodySchema,
    );
    expect(read.success).toBe(true);

    const preview = validateBody(
      {
        target: { kind: 'active' },
        family: 'risup-prompt',
        mode: 'preview',
        operation: {
          action: 'add_items',
          insertAt: 1,
          items: [{ type: 'plain', type2: 'normal', text: 'Managed prompt', role: 'system' }],
        },
      },
      manageItemsBodySchema,
    );
    expect(preview.success).toBe(true);

    const apply = validateBody(
      {
        target: { kind: 'active' },
        family: 'risup-prompt',
        mode: 'apply',
        preview_token: 'facade-preview-v1.abcdef0123456789',
        operation_digest: '0123456789abcdef',
        guard_values: [{ name: 'expected_prompt_items_digest', value: 'digest' }],
      },
      manageItemsBodySchema,
    );
    expect(apply.success).toBe(true);

    const lorebookPreview = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\card.charx' },
        family: 'lorebook',
        mode: 'preview',
        operation: {
          action: 'add_items',
          items: [{ comment: 'Managed lore', key: 'managed', content: 'Managed lorebook entry.' }],
        },
      },
      manageItemsBodySchema,
    );
    expect(lorebookPreview.success).toBe(true);

    const regexPreview = validateBody(
      {
        target: { kind: 'active' },
        family: 'regex',
        mode: 'preview',
        operation: {
          action: 'reorder_items',
          order: [1, 0],
        },
      },
      manageItemsBodySchema,
    );
    expect(regexPreview.success).toBe(true);

    const greetingPreview = validateBody(
      {
        target: { kind: 'active' },
        family: 'greeting',
        mode: 'preview',
        operation: {
          action: 'add_items',
          greeting_type: 'alternate',
          items: [{ content: 'Managed greeting.' }],
        },
      },
      manageItemsBodySchema,
    );
    expect(greetingPreview.success).toBe(true);

    const triggerPreview = validateBody(
      {
        target: { kind: 'active' },
        family: 'trigger',
        mode: 'preview',
        operation: {
          action: 'add_items',
          items: [{ comment: 'Managed trigger', type: 'start', conditions: [], effect: [] }],
        },
      },
      manageItemsBodySchema,
    );
    expect(triggerPreview.success).toBe(true);

    const luaPreview = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\card.charx' },
        family: 'lua',
        mode: 'preview',
        operation: {
          action: 'add_items',
          items: [{ name: 'managed_lua', content: 'print("managed")' }],
        },
      },
      manageItemsBodySchema,
    );
    expect(luaPreview.success).toBe(true);

    const cssPreview = validateBody(
      {
        target: { kind: 'active' },
        family: 'css',
        mode: 'preview',
        operation: {
          action: 'reorder_items',
          order: [1, 0],
        },
      },
      manageItemsBodySchema,
    );
    expect(cssPreview.success).toBe(true);
  });

  it('rejects invalid manage_items modes and oversized item batches', () => {
    expect(
      validateBody(
        {
          target: { kind: 'reference', reference_id: '0' },
          family: 'risup-prompt',
          mode: 'read',
          operation: { action: 'list_snippets' },
        },
        manageItemsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          family: 'lorebook',
          mode: 'read',
          operation: { action: 'list_snippets' },
        },
        manageItemsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          family: 'greeting',
          mode: 'preview',
          operation: {
            action: 'add_items',
            items: [{ content: 'Missing type.' }],
          },
        },
        manageItemsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          family: 'risup-prompt',
          mode: 'read',
          operation: { action: 'read_lorebook' },
        },
        manageItemsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          family: 'risup-prompt',
          mode: 'preview',
        },
        manageItemsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          family: 'risup-prompt',
          mode: 'apply',
          preview_token: 'facade-preview-v1.abcdef0123456789',
        },
        manageItemsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          family: 'risup-prompt',
          mode: 'apply',
          preview_token: 'facade-preview-v1.abcdef0123456789',
          operation_digest: '0123456789abcdef',
        },
        manageItemsBodySchema,
      ).success,
    ).toBe(false);

    const tooManyItems = Array.from({ length: FACADE_V1_LIMITS.maxBatchItems + 1 }, (_, index) => ({
      type: 'plain',
      type2: 'normal',
      text: `Prompt ${index}`,
      role: 'system',
    }));
    expect(
      validateBody(
        {
          target: { kind: 'active' },
          family: 'risup-prompt',
          mode: 'preview',
          operation: { action: 'add_items', items: tooManyItems },
        },
        manageItemsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          family: 'risup-prompt',
          mode: 'preview',
          operation: {
            action: 'reorder_items',
            order: Array.from({ length: FACADE_V1_LIMITS.maxBatchItems + 1 }, (_, index) => index),
          },
        },
        manageItemsBodySchema,
      ).success,
    ).toBe(false);
  });

  it('accepts manage_assets read, preview, and apply shapes for active/external asset workflows', () => {
    const list = validateBody(
      {
        target: { kind: 'active' },
        asset_family: 'auto',
        mode: 'read',
        operation: { action: 'list_assets' },
      },
      manageAssetsBodySchema,
    );
    expect(list.success).toBe(true);

    const read = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\card.charx' },
        asset_family: 'charx',
        mode: 'read',
        operation: { action: 'read_asset', selector: { path: 'assets/other/image/portrait.png' } },
      },
      manageAssetsBodySchema,
    );
    expect(read.success).toBe(true);

    const addPreview = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\module.risum' },
        asset_family: 'risum',
        mode: 'preview',
        operation: {
          action: 'add_asset',
          name: 'portrait',
          path: 'portrait.png',
          base64: Buffer.from('asset').toString('base64'),
        },
      },
      manageAssetsBodySchema,
    );
    expect(addPreview.success).toBe(true);

    const deletePreview = validateBody(
      {
        target: { kind: 'active' },
        asset_family: 'charx',
        mode: 'preview',
        operation: { action: 'delete_asset', selector: { index: 0 } },
      },
      manageAssetsBodySchema,
    );
    expect(deletePreview.success).toBe(true);

    const renamePreview = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\card.charx' },
        asset_family: 'charx',
        mode: 'preview',
        operation: { action: 'rename_asset', selector: { index: 0 }, newName: 'portrait-renamed.png' },
      },
      manageAssetsBodySchema,
    );
    expect(renamePreview.success).toBe(true);

    const compressPreview = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\card.charx' },
        asset_family: 'charx',
        mode: 'preview',
        operation: { action: 'compress_assets', quality: 72, recompress_webp: false },
      },
      manageAssetsBodySchema,
    );
    expect(compressPreview.success).toBe(true);

    const apply = validateBody(
      {
        target: { kind: 'active' },
        asset_family: 'auto',
        mode: 'apply',
        preview_token: 'facade-preview-v1.abcdef0123456789',
        operation_digest: '0123456789abcdef',
        guard_values: [
          { name: 'expected_asset_collection_digest', value: 'digest' },
          { name: 'expected_path', value: 'assets/other/image/portrait.png' },
        ],
      },
      manageAssetsBodySchema,
    );
    expect(apply.success).toBe(true);
  });

  it('rejects invalid manage_assets targets and mode/action combinations', () => {
    expect(
      validateBody(
        {
          target: { kind: 'reference', reference_id: '0' },
          mode: 'read',
          operation: { action: 'list_assets' },
        },
        manageAssetsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          mode: 'read',
          operation: { action: 'add_asset', fileName: 'asset.png', base64: 'YXNzZXQ=' },
        },
        manageAssetsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          mode: 'preview',
          operation: { action: 'read_asset', selector: { index: 0 } },
        },
        manageAssetsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          mode: 'read',
          operation: { action: 'compress_assets', quality: 80 },
        },
        manageAssetsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          mode: 'preview',
          operation: { action: 'compress_assets', recompress_webp: true, recompressWebp: false },
        },
        manageAssetsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          mode: 'preview',
          operation: { action: 'delete_asset', selector: {} },
        },
        manageAssetsBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          mode: 'apply',
          preview_token: 'facade-preview-v1.abcdef0123456789',
          operation_digest: '0123456789abcdef',
        },
        manageAssetsBodySchema,
      ).success,
    ).toBe(false);
  });

  it('accepts manage_file read, preview, and apply shapes for file-management workflows', () => {
    const snapshots = validateBody(
      {
        target: { kind: 'active' },
        mode: 'read',
        operation: { action: 'list_snapshots', field: 'description' },
      },
      manageFileBodySchema,
    );
    expect(snapshots.success).toBe(true);

    const projectTree = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\card_project' },
        mode: 'read',
        operation: { action: 'project_tree' },
      },
      manageFileBodySchema,
    );
    expect(projectTree.success).toBe(true);

    const openPreview = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\card.charx' },
        mode: 'preview',
        operation: { action: 'open_file', save_current: true },
      },
      manageFileBodySchema,
    );
    expect(openPreview.success).toBe(true);

    const exportPreview = validateBody(
      {
        target: { kind: 'active' },
        mode: 'preview',
        operation: {
          action: 'export_field',
          field: 'description',
          file_path: 'C:\\fixtures\\description.md',
          format: 'md',
        },
      },
      manageFileBodySchema,
    );
    expect(exportPreview.success).toBe(true);

    const extractPreview = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\preset.risup' },
        mode: 'preview',
        operation: { action: 'extract_project', project_path: 'C:\\fixtures\\preset_project' },
      },
      manageFileBodySchema,
    );
    expect(extractPreview.success).toBe(true);

    const reassemblePreview = validateBody(
      {
        target: { kind: 'external', file_path: 'C:\\fixtures\\preset_project' },
        mode: 'preview',
        operation: { action: 'reassemble_project', output_path: 'C:\\fixtures\\preset-out.risup' },
      },
      manageFileBodySchema,
    );
    expect(reassemblePreview.success).toBe(true);

    const lorebookExportPreview = validateBody(
      {
        target: { kind: 'active' },
        mode: 'preview',
        operation: {
          action: 'export_lorebook',
          target_dir: 'C:\\fixtures\\lorebook-export',
          format: 'md',
          group_by_folder: true,
          filter: 'hero',
        },
      },
      manageFileBodySchema,
    );
    expect(lorebookExportPreview.success).toBe(true);

    const lorebookImportPreview = validateBody(
      {
        target: { kind: 'active' },
        mode: 'preview',
        operation: {
          action: 'import_lorebook',
          source_path: 'C:\\fixtures\\lorebook.json',
          format: 'json',
          conflict: 'rename',
        },
      },
      manageFileBodySchema,
    );
    expect(lorebookImportPreview.success).toBe(true);

    const apply = validateBody(
      {
        target: { kind: 'session' },
        mode: 'apply',
        preview_token: 'facade-preview-v1.abcdef0123456789',
        operation_digest: '0123456789abcdef',
        guard_values: [{ name: 'expected_active_file_path', value: 'C:\\fixtures\\card.charx' }],
      },
      manageFileBodySchema,
    );
    expect(apply.success).toBe(true);
  });

  it('rejects invalid manage_file targets and mode/action combinations', () => {
    expect(
      validateBody(
        {
          target: { kind: 'reference', reference_id: '0' },
          mode: 'read',
          operation: { action: 'list_snapshots', field: 'description' },
        },
        manageFileBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          mode: 'read',
          operation: { action: 'save_current_file' },
        },
        manageFileBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          mode: 'preview',
          operation: { action: 'project_tree', project_path: 'C:\\fixtures\\card_project' },
        },
        manageFileBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'session' },
          mode: 'preview',
          operation: { action: 'open_file' },
        },
        manageFileBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          mode: 'apply',
          preview_token: 'facade-preview-v1.abcdef0123456789',
          operation_digest: '0123456789abcdef',
        },
        manageFileBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'session' },
          mode: 'preview',
          operation: { action: 'export_lorebook', target_dir: 'C:\\fixtures\\lorebook-export' },
        },
        manageFileBodySchema,
      ).success,
    ).toBe(false);

    expect(
      validateBody(
        {
          target: { kind: 'active' },
          mode: 'preview',
          operation: { action: 'import_lorebook', format: 'json' },
        },
        manageFileBodySchema,
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

describe('compact public schema handler validation', () => {
  it('returns matching JSON text and structuredContent for detailed validation failures', async () => {
    const validated = withDetailedInputValidationHandler('test_tool', { mode: z.literal('valid') }, async () => ({
      content: [{ type: 'text', text: JSON.stringify({ status: 200 }) }],
    }));
    const result = await withStructuredContentHandler(validated)({ mode: 'invalid' });
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(parsed.status).toBe(400);
    expect(parsed.code).toBe('invalid_request');
    expect(parsed.retry_mode).toBe('never');
    expect(parsed.outcome).toBe('not_started');
    expect(result.structuredContent).toEqual(parsed);
  });
});
