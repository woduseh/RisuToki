// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mcpSuccess, FAMILY_NEXT_ACTIONS } from './mcp-response-envelope';
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

    expect(result.artifacts).toEqual({ fieldName: 'persona', oldSize: 100, newSize: 200 });
  });

  it('defaults artifacts to empty object when not provided', () => {
    const payload = { success: true };
    const result = mcpSuccess(payload, {
      toolName: 'list_fields',
      summary: 'Listed fields',
    });

    expect(result.artifacts).toEqual({});
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

  it('next_actions arrays are not excessively large (≤6 per family)', () => {
    for (const [family, actions] of Object.entries(FAMILY_NEXT_ACTIONS)) {
      expect(
        actions.length,
        `FAMILY_NEXT_ACTIONS["${family}"] has ${actions.length} entries (max 6)`,
      ).toBeLessThanOrEqual(6);
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
    expect(result.artifacts).toEqual({ fieldName: 'description', size: 512 });
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
});
