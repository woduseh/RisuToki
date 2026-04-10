// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mcpSuccess, FAMILY_NEXT_ACTIONS, errorRecoveryMeta } from './mcp-response-envelope';
import { TOOL_FAMILIES, TOOL_TAXONOMY, getToolsByFamily } from './mcp-tool-taxonomy';
import type { ToolFamily } from './mcp-tool-taxonomy';

// ────────────────────────────────────────────────────────────────────────────
// Core contract tests
// ────────────────────────────────────────────────────────────────────────────

describe('mcpSuccess envelope', () => {
  it('adds status, summary, next_actions, artifacts to a plain payload', () => {
    const payload = { success: true, field: 'name', size: 42 };
    const result = mcpSuccess(payload, {
      toolName: 'write_field',
      summary: 'Wrote field "name" (42 chars)',
    });

    expect(result.status).toBe(200);
    expect(result.summary).toBe('Wrote field "name" (42 chars)');
    expect(Array.isArray(result.next_actions)).toBe(true);
    expect(result.artifacts).toBeDefined();
    // original fields preserved
    expect(result.success).toBe(true);
    expect(result.field).toBe('name');
    expect(result.size).toBe(42);
  });

  it('never overwrites existing payload keys', () => {
    const payload = { success: true, field: 'description', customKey: 'keep me' };
    const result = mcpSuccess(payload, {
      toolName: 'read_field',
      summary: 'Read field "description"',
    });

    expect(result.customKey).toBe('keep me');
    expect(result.success).toBe(true);
    expect(result.field).toBe('description');
  });

  it('uses provided artifacts when given', () => {
    const payload = { success: true };
    const result = mcpSuccess(payload, {
      toolName: 'write_field',
      summary: 'Wrote field',
      artifacts: { fieldName: 'persona', oldSize: 100, newSize: 200 },
    });

    expect(result.artifacts).toEqual(expect.objectContaining({ fieldName: 'persona', oldSize: 100, newSize: 200 }));
    expect((result.artifacts as Record<string, unknown>).byte_size).toEqual(expect.any(Number));
  });

  it('adds artifacts.byte_size when custom artifacts are provided', () => {
    const payload = { success: true };
    const artifacts = { fieldName: 'persona', oldSize: 100, newSize: 200 };
    const expectedWithoutByteSize = {
      ...payload,
      status: 200,
      summary: 'Wrote field',
      next_actions: FAMILY_NEXT_ACTIONS.field,
      artifacts,
    };
    const result = mcpSuccess(payload, {
      toolName: 'write_field',
      summary: 'Wrote field',
      artifacts,
    });

    expect(result.artifacts).toEqual({
      ...artifacts,
      byte_size: Buffer.byteLength(JSON.stringify(expectedWithoutByteSize), 'utf8'),
    });
  });

  it('defaults artifacts to empty object when not provided', () => {
    const payload = { success: true };
    const result = mcpSuccess(payload, {
      toolName: 'list_fields',
      summary: 'Listed fields',
    });

    expect(result.artifacts).toEqual({
      byte_size: expect.any(Number),
    });
  });

  it('adds artifacts.byte_size when artifacts are omitted', () => {
    const payload = { success: true };
    const expectedWithoutByteSize = {
      ...payload,
      status: 200,
      summary: 'Listed fields',
      next_actions: FAMILY_NEXT_ACTIONS.field,
      artifacts: {},
    };
    const result = mcpSuccess(payload, {
      toolName: 'list_fields',
      summary: 'Listed fields',
    });

    expect(result.artifacts).toEqual({
      byte_size: Buffer.byteLength(JSON.stringify(expectedWithoutByteSize), 'utf8'),
    });
  });

  it('uses explicit nextActions override when provided', () => {
    const payload = { count: 5 };
    const result = mcpSuccess(payload, {
      toolName: 'list_fields',
      summary: 'Listed 5 fields',
      nextActions: ['read_field', 'write_field'],
    });

    expect(result.next_actions).toEqual(['read_field', 'write_field']);
  });

  it('derives next_actions from taxonomy family when toolName is given', () => {
    const payload = { success: true };
    const result = mcpSuccess(payload, {
      toolName: 'write_field',
      summary: 'Wrote field',
    });

    expect(Array.isArray(result.next_actions)).toBe(true);
    expect((result.next_actions as string[]).length).toBeGreaterThan(0);
  });

  it('returns empty next_actions when toolName is unknown', () => {
    const payload = { success: true };
    const result = mcpSuccess(payload, {
      toolName: 'nonexistent_tool',
      summary: 'Did something',
    });

    expect(result.next_actions).toEqual([]);
  });

  it('returns empty next_actions when toolName is omitted', () => {
    const payload = { success: true };
    const result = mcpSuccess(payload, {
      summary: 'Generic success',
    });

    expect(result.next_actions).toEqual([]);
  });

  it('status is always 200 for success envelope', () => {
    const result = mcpSuccess({}, { summary: 'OK' });
    expect(result.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Additive-only guarantee
// ────────────────────────────────────────────────────────────────────────────

describe('additive-only contract', () => {
  it('does not remove any keys from the original payload', () => {
    const payload = {
      success: true,
      field: 'x',
      size: 10,
      warning: 'test',
      nested: { a: 1 },
    };
    const originalKeys = Object.keys(payload);
    const result = mcpSuccess(payload, {
      toolName: 'write_field',
      summary: 'Test',
    });

    for (const key of originalKeys) {
      expect(key in result, `key "${key}" should be preserved`).toBe(true);
    }
  });

  it('does not mutate the original payload object', () => {
    const payload = { success: true, field: 'name' };
    const payloadCopy = { ...payload };
    mcpSuccess(payload, { toolName: 'read_field', summary: 'Read' });

    expect(payload).toEqual(payloadCopy);
  });

  it('preserves original values even when envelope key names collide', () => {
    // If a response already has `summary` (unlikely but defensive)
    const payload = { success: true, summary: 'original summary' };
    const result = mcpSuccess(payload, {
      toolName: 'read_field',
      summary: 'Envelope summary',
    });

    // Envelope summary wins — this is a known override for envelope fields
    expect(result.summary).toBe('Envelope summary');
    // But all OTHER original fields remain
    expect(result.success).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FAMILY_NEXT_ACTIONS coverage
// ────────────────────────────────────────────────────────────────────────────

describe('FAMILY_NEXT_ACTIONS', () => {
  it('covers every tool family in the taxonomy', () => {
    for (const family of TOOL_FAMILIES) {
      expect(family in FAMILY_NEXT_ACTIONS, `FAMILY_NEXT_ACTIONS should cover family "${family}"`).toBe(true);
    }
  });

  it('every suggested tool name in next_actions exists in the taxonomy', () => {
    const allTools = new Set(Object.keys(TOOL_TAXONOMY));
    for (const [family, actions] of Object.entries(FAMILY_NEXT_ACTIONS)) {
      for (const action of actions) {
        expect(
          allTools.has(action),
          `FAMILY_NEXT_ACTIONS["${family}"] suggests "${action}" which is not in TOOL_TAXONOMY`,
        ).toBe(true);
      }
    }
  });

  it('next_actions arrays are not excessively large (≤10 per family)', () => {
    for (const [family, actions] of Object.entries(FAMILY_NEXT_ACTIONS)) {
      expect(
        actions.length,
        `FAMILY_NEXT_ACTIONS["${family}"] has ${actions.length} entries (max 10)`,
      ).toBeLessThanOrEqual(10);
    }
  });

  it('next_actions for write families include at least one read tool', () => {
    const writeFamilies: ToolFamily[] = ['field', 'lorebook', 'regex', 'greeting', 'trigger', 'lua', 'css'];
    const byFamily = getToolsByFamily();

    for (const family of writeFamilies) {
      const actions = FAMILY_NEXT_ACTIONS[family];
      const familyTools = byFamily[family];
      const readTools = familyTools.filter((t) => t.startsWith('list_') || t.startsWith('read_'));
      const hasReadSuggestion = actions.some((a) => readTools.includes(a));
      expect(hasReadSuggestion, `FAMILY_NEXT_ACTIONS["${family}"] should include at least one read/list tool`).toBe(
        true,
      );
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Integration-style: verify envelope on realistic payloads
// ────────────────────────────────────────────────────────────────────────────

describe('realistic payload enrichment', () => {
  it('enriches a field write response', () => {
    const payload = { success: true, field: 'description', size: 512 };
    const result = mcpSuccess(payload, {
      toolName: 'write_field',
      summary: 'Updated description (512 chars)',
      artifacts: { fieldName: 'description', size: 512 },
    });

    expect(result.success).toBe(true);
    expect(result.field).toBe('description');
    expect(result.size).toBe(512);
    expect(result.status).toBe(200);
    expect(result.summary).toBe('Updated description (512 chars)');
    expect(result.artifacts).toEqual(expect.objectContaining({ fieldName: 'description', size: 512 }));
    expect((result.artifacts as Record<string, unknown>).byte_size).toEqual(expect.any(Number));
    expect((result.next_actions as string[]).length).toBeGreaterThan(0);
  });

  it('enriches a field read response', () => {
    const payload = { field: 'name', value: 'Haruto', type: 'string', size: 6 };
    const result = mcpSuccess(payload, {
      toolName: 'read_field',
      summary: 'Read field "name" (6 chars)',
    });

    expect(result.field).toBe('name');
    expect(result.value).toBe('Haruto');
    expect(result.status).toBe(200);
    expect(result.summary).toBe('Read field "name" (6 chars)');
  });

  it('enriches a list_lorebook response', () => {
    const payload = { count: 3, entries: [{ index: 0, comment: 'A' }] };
    const result = mcpSuccess(payload, {
      toolName: 'list_lorebook',
      summary: 'Listed 3 lorebook entries',
      artifacts: { count: 3 },
    });

    expect(result.count).toBe(3);
    expect(result.entries).toBeDefined();
    expect(result.status).toBe(200);
    expect((result.next_actions as string[]).length).toBeGreaterThan(0);
  });

  it('enriches a search_in_field response', () => {
    const payload = { field: 'description', matchCount: 2, matches: ['a', 'b'] };
    const result = mcpSuccess(payload, {
      toolName: 'search_in_field',
      summary: 'Found 2 matches in description',
      artifacts: { matchCount: 2 },
    });

    expect(result.field).toBe('description');
    expect(result.matchCount).toBe(2);
    expect(result.status).toBe(200);
    expect(Array.isArray(result.next_actions)).toBe(true);
  });

  it('enriches a snapshot_field response', () => {
    const payload = { success: true, snapshotId: 'abc123' };
    const result = mcpSuccess(payload, {
      toolName: 'snapshot_field',
      summary: 'Snapshot created: abc123',
      artifacts: { snapshotId: 'abc123' },
    });

    expect(result.success).toBe(true);
    expect(result.snapshotId).toBe('abc123');
    expect(result.status).toBe(200);
    expect((result.next_actions as string[]).length).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Reference family
  // ──────────────────────────────────────────────────────────────────────

  it('enriches a list_references response', () => {
    const payload = { count: 2, references: [{ index: 0, fileName: 'a.charx' }] };
    const result = mcpSuccess(payload, {
      toolName: 'list_references',
      summary: 'Listed 2 reference files',
      artifacts: { count: 2 },
    });
    expect(result.count).toBe(2);
    expect(result.references).toBeDefined();
    expect(result.status).toBe(200);
    expect(result.next_actions as string[]).toEqual(FAMILY_NEXT_ACTIONS.reference);
  });

  it('enriches a read_reference_lorebook response', () => {
    const payload = { refIndex: 0, fileName: 'a.charx', entryIndex: 1, entry: { comment: 'Test' } };
    const result = mcpSuccess(payload, {
      toolName: 'read_reference_lorebook',
      summary: 'Read reference lorebook entry 1',
    });
    expect(result.refIndex).toBe(0);
    expect(result.entryIndex).toBe(1);
    expect(result.status).toBe(200);
  });

  it('enriches a list_reference_lua response', () => {
    const payload = { index: 0, fileName: 'a.charx', count: 3, sections: [] };
    const result = mcpSuccess(payload, {
      toolName: 'list_reference_lua',
      summary: 'Listed 3 Lua sections in reference 0',
      artifacts: { count: 3 },
    });
    expect(result.count).toBe(3);
    expect(result.status).toBe(200);
  });

  it('enriches a read_reference_field response', () => {
    const payload = { index: 0, fileName: 'a.charx', field: 'description', content: 'hello' };
    const result = mcpSuccess(payload, {
      toolName: 'read_reference_field',
      summary: 'Read reference field "description"',
    });
    expect(result.field).toBe('description');
    expect(result.content).toBe('hello');
    expect(result.status).toBe(200);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Probe family
  // ──────────────────────────────────────────────────────────────────────

  it('enriches a probe_field response', () => {
    const payload = { field: 'name', value: 'Test', type: 'string', size: 4 };
    const result = mcpSuccess(payload, {
      toolName: 'probe_field',
      summary: 'Probed field "name" (4 chars)',
    });
    expect(result.field).toBe('name');
    expect(result.value).toBe('Test');
    expect(result.status).toBe(200);
    expect(result.next_actions as string[]).toEqual(FAMILY_NEXT_ACTIONS.probe);
  });

  it('enriches a probe_field_batch response', () => {
    const payload = { count: 2, fields: [{ field: 'name' }, { field: 'description' }] };
    const result = mcpSuccess(payload, {
      toolName: 'probe_field_batch',
      summary: 'Probed 2 fields from external file',
      artifacts: { count: 2 },
    });
    expect(result.count).toBe(2);
    expect(result.status).toBe(200);
  });

  it('enriches a probe_lorebook response', () => {
    const payload = { count: 5, entries: [] };
    const result = mcpSuccess(payload, {
      toolName: 'probe_lorebook',
      summary: 'Probed 5 lorebook entries',
      artifacts: { count: 5 },
    });
    expect(result.count).toBe(5);
    expect(result.status).toBe(200);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Open-file
  // ──────────────────────────────────────────────────────────────────────

  it('enriches an open_file response', () => {
    const payload = {
      file_path: '/test.charx',
      file_type: 'charx',
      name: 'test.charx',
      already_open: false,
      switched: true,
      save_current: false,
    };
    const result = mcpSuccess(payload, {
      toolName: 'open_file',
      summary: 'Opened test.charx',
      artifacts: { filePath: '/test.charx', alreadyOpen: false },
    });
    expect(result.file_path).toBe('/test.charx');
    expect(result.switched).toBe(true);
    expect(result.status).toBe(200);
    expect(result.next_actions as string[]).toEqual(FAMILY_NEXT_ACTIONS.probe);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Skills family
  // ──────────────────────────────────────────────────────────────────────

  it('enriches a list_skills response', () => {
    const payload = { count: 3, skills: [{ name: 'writing-cbs-syntax' }] };
    const result = mcpSuccess(payload, {
      toolName: 'list_skills',
      summary: 'Listed 3 skills',
      artifacts: { count: 3 },
    });
    expect(result.count).toBe(3);
    expect(result.status).toBe(200);
    expect(result.next_actions as string[]).toEqual(FAMILY_NEXT_ACTIONS.skill);
  });

  it('enriches a read_skill response', () => {
    const payload = { skill: 'writing-cbs-syntax', file: 'SKILL.md', content: '# CBS' };
    const result = mcpSuccess(payload, {
      toolName: 'read_skill',
      summary: 'Read skill writing-cbs-syntax/SKILL.md',
    });
    expect(result.skill).toBe('writing-cbs-syntax');
    expect(result.content).toBe('# CBS');
    expect(result.status).toBe(200);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Charx asset family
  // ──────────────────────────────────────────────────────────────────────

  it('enriches a list_charx_assets response', () => {
    const payload = { count: 2, assets: [{ index: 0, path: 'assets/icon/a.png', size: 100 }] };
    const result = mcpSuccess(payload, {
      toolName: 'list_charx_assets',
      summary: 'Listed 2 charx assets',
      artifacts: { count: 2 },
    });
    expect(result.count).toBe(2);
    expect(result.status).toBe(200);
    expect(result.next_actions as string[]).toEqual(FAMILY_NEXT_ACTIONS['charx-asset']);
  });

  it('enriches a read_charx_asset response', () => {
    const payload = { index: 0, path: 'assets/icon/a.png', size: 100, mimeType: 'image/png', base64: 'AAAA' };
    const result = mcpSuccess(payload, {
      toolName: 'read_charx_asset',
      summary: 'Read charx asset assets/icon/a.png (100 bytes)',
    });
    expect(result.path).toBe('assets/icon/a.png');
    expect(result.status).toBe(200);
  });

  it('enriches an add_charx_asset response', () => {
    const payload = { ok: true, path: 'assets/icon/b.png', size: 200 };
    const result = mcpSuccess(payload, {
      toolName: 'add_charx_asset',
      summary: 'Added charx asset assets/icon/b.png (200 bytes)',
      artifacts: { path: 'assets/icon/b.png', size: 200 },
    });
    expect(result.ok).toBe(true);
    expect(result.path).toBe('assets/icon/b.png');
    expect(result.status).toBe(200);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Risum asset family
  // ──────────────────────────────────────────────────────────────────────

  it('enriches a list_risum_assets response', () => {
    const payload = { count: 1, assets: [{ index: 0, name: 'bg', size: 500 }] };
    const result = mcpSuccess(payload, {
      toolName: 'list_risum_assets',
      summary: 'Listed 1 risum asset',
      artifacts: { count: 1 },
    });
    expect(result.count).toBe(1);
    expect(result.status).toBe(200);
    expect(result.next_actions as string[]).toEqual(FAMILY_NEXT_ACTIONS['risum-asset']);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Asset compression family
  // ──────────────────────────────────────────────────────────────────────

  it('enriches a compress_assets_webp response', () => {
    const payload = { ok: true, stats: { converted: 3, savedBytes: 1024 }, details: [] };
    const result = mcpSuccess(payload, {
      toolName: 'compress_assets_webp',
      summary: 'Compressed 3 assets, saved 1024 bytes',
      artifacts: { converted: 3, savedBytes: 1024 },
    });
    expect(result.ok).toBe(true);
    expect(result.stats).toBeDefined();
    expect(result.status).toBe(200);
    expect(result.next_actions as string[]).toEqual(FAMILY_NEXT_ACTIONS['asset-compression']);
  });

  // ──────────────────────────────────────────────────────────────────────
  // CBS family
  // ──────────────────────────────────────────────────────────────────────

  // Note: validate_cbs is intentionally exempt from the envelope in production
  // because its structured `summary` object would collide with the envelope's
  // string `summary`. This test exercises mcpSuccess() in isolation only.
  it('enriches a validate_cbs response', () => {
    const payload = { valid: true, entries: [], summary: { total: 5, passed: 5, failed: 0 } };
    const result = mcpSuccess(payload, {
      toolName: 'validate_cbs',
      summary: 'Validated CBS: 5 passed, 0 failed',
      artifacts: { total: 5, passed: 5, failed: 0 },
    });
    expect(result.valid).toBe(true);
    expect(result.status).toBe(200);
    expect(result.next_actions as string[]).toEqual(FAMILY_NEXT_ACTIONS.cbs);
  });

  it('enriches a list_cbs_toggles response', () => {
    const payload = { toggles: { mood: { conditions: ['happy'], fields: ['description'] } }, count: 1 };
    const result = mcpSuccess(payload, {
      toolName: 'list_cbs_toggles',
      summary: 'Found 1 CBS toggle',
      artifacts: { count: 1 },
    });
    expect(result.toggles).toBeDefined();
    expect(result.count).toBe(1);
    expect(result.status).toBe(200);
  });

  it('enriches a simulate_cbs response', () => {
    const payload = {
      field: 'description',
      toggles: { mood: '1' },
      original_length: 100,
      resolved: 'hello',
      resolved_length: 5,
    };
    const result = mcpSuccess(payload, {
      toolName: 'simulate_cbs',
      summary: 'Simulated CBS for description (100→5 chars)',
    });
    expect(result.field).toBe('description');
    expect(result.resolved).toBe('hello');
    expect(result.status).toBe(200);
  });

  it('enriches a diff_cbs response', () => {
    const payload = {
      field: 'description',
      changed: true,
      toggles: { mood: '1' },
      added_lines: ['a'],
      removed_lines: ['b'],
    };
    const result = mcpSuccess(payload, {
      toolName: 'diff_cbs',
      summary: 'CBS diff: 1 added, 1 removed',
      artifacts: { addedCount: 1, removedCount: 1 },
    });
    expect(result.changed).toBe(true);
    expect(result.added_lines).toEqual(['a']);
    expect(result.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// errorRecoveryMeta() — unit tests
// ---------------------------------------------------------------------------
describe('errorRecoveryMeta()', () => {
  it('returns retryable: false for 400 status', () => {
    const meta = errorRecoveryMeta('field:name', 400);
    expect(meta.retryable).toBe(false);
  });

  it('returns retryable: false for 401 status', () => {
    const meta = errorRecoveryMeta('request:auth', 401);
    expect(meta.retryable).toBe(false);
  });

  it('returns retryable: true for 409 status', () => {
    const meta = errorRecoveryMeta('asset:test.png', 409);
    expect(meta.retryable).toBe(true);
  });

  it('returns retryable: true for 500 status', () => {
    const meta = errorRecoveryMeta('open:file', 500);
    expect(meta.retryable).toBe(true);
  });

  it('returns retryable: false for 200 status (no-op)', () => {
    const meta = errorRecoveryMeta('field:description', 200);
    expect(meta.retryable).toBe(false);
  });

  it('resolves next_actions from field family target prefix', () => {
    const meta = errorRecoveryMeta('field:name', 400);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS.field);
  });

  it('resolves next_actions from lorebook family target prefix', () => {
    const meta = errorRecoveryMeta('lorebook:3', 400);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS.lorebook);
  });

  it('resolves next_actions from regex family target prefix', () => {
    const meta = errorRecoveryMeta('regex:0', 400);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS.regex);
  });

  it('resolves next_actions from css-section target prefix alias', () => {
    const meta = errorRecoveryMeta('css-section:0', 400);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS.css);
  });

  it('resolves next_actions from open target prefix alias', () => {
    const meta = errorRecoveryMeta('open:file', 500);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS.probe);
  });

  it('resolves next_actions from greetings target prefix alias', () => {
    const meta = errorRecoveryMeta('greetings:alternate', 400);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS.greeting);
  });

  it('resolves next_actions from skills target prefix alias', () => {
    const meta = errorRecoveryMeta('skills:using-mcp-tools:SKILL.md', 400);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS.skill);
  });

  it('resolves next_actions from assets target without a colon', () => {
    const meta = errorRecoveryMeta('assets', 400);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS['charx-asset']);
  });

  it('resolves next_actions from search-all target without a colon', () => {
    const meta = errorRecoveryMeta('/search-all', 400);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS.search);
  });

  it('resolves next_actions from asset (charx-asset) family target prefix', () => {
    const meta = errorRecoveryMeta('asset:foo.png', 409);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS['charx-asset']);
  });

  it('resolves open_file + list_references + session_status for document:current special target', () => {
    const meta = errorRecoveryMeta('document:current', 400);
    expect(meta.next_actions).toEqual(['open_file', 'list_references', 'session_status']);
  });

  it('returns empty next_actions for unknown target prefix', () => {
    const meta = errorRecoveryMeta('request:auth', 401);
    expect(meta.next_actions).toEqual([]);
  });

  it('returns empty next_actions for target with no colon', () => {
    const meta = errorRecoveryMeta('unknown', 400);
    expect(meta.next_actions).toEqual([]);
  });
});

describe('agent eval: response contracts stay deterministic for agents', () => {
  it('keeps context-budget sizing monotonic across progressively larger success payloads', () => {
    const small = mcpSuccess({ content: 'alpha' }, { toolName: 'read_field', summary: 'Read small field' });
    const medium = mcpSuccess(
      { content: 'alpha'.repeat(40) },
      { toolName: 'read_field', summary: 'Read medium field' },
    );
    const large = mcpSuccess({ content: 'alpha'.repeat(400) }, { toolName: 'read_field', summary: 'Read large field' });

    const smallSize = (small.artifacts as Record<string, unknown>).byte_size as number;
    const mediumSize = (medium.artifacts as Record<string, unknown>).byte_size as number;
    const largeSize = (large.artifacts as Record<string, unknown>).byte_size as number;

    expect(smallSize).toBeGreaterThan(0);
    expect(mediumSize).toBeGreaterThan(smallSize);
    expect(largeSize).toBeGreaterThan(mediumSize);
  });

  it('keeps field-family recovery guidance stable across validation, conflict, and server errors', () => {
    const validation = errorRecoveryMeta('field:description', 400);
    const conflict = errorRecoveryMeta('field:description', 409);
    const server = errorRecoveryMeta('field:description', 500);

    expect(validation.retryable).toBe(false);
    expect(conflict.retryable).toBe(true);
    expect(server.retryable).toBe(true);
    expect(validation.next_actions).toEqual(FAMILY_NEXT_ACTIONS.field);
    expect(conflict.next_actions).toEqual(FAMILY_NEXT_ACTIONS.field);
    expect(server.next_actions).toEqual(FAMILY_NEXT_ACTIONS.field);
  });
});

describe('agent eval: recovery guidance chooses the next safe tool', () => {
  it('keeps field validation failures discovery-first and non-retryable', () => {
    const meta = errorRecoveryMeta('field:description', 400);

    expect(meta.retryable).toBe(false);
    expect(meta.next_actions).toEqual(FAMILY_NEXT_ACTIONS.field);
  });

  it('keeps no-document failures steering toward open_file, list_references, and session_status', () => {
    const meta = errorRecoveryMeta('document:current', 400);

    expect(meta.retryable).toBe(false);
    expect(meta.next_actions).toEqual(['open_file', 'list_references', 'session_status']);
  });
});
