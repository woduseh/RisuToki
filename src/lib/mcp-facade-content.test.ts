import { describe, expect, it } from 'vitest';

import { createFacadeContentEngine, type FacadeContentEngineDeps } from './mcp-facade-content';

function createBoundingEngine() {
  return createFacadeContentEngine({
    apiRequest: async () => ({}),
    danbooru: {},
    items: {},
    scriptStyle: {},
  } as unknown as FacadeContentEngineDeps);
}

describe('facade semantic response bounds', () => {
  it.each(['read_content', 'preview_edit', 'apply_edit'])(
    'bounds %s results without splitting UTF-8 or losing final evidence',
    (tool) => {
      const engine = createBoundingEngine();
      const target = { kind: 'active', document: 'current' };
      const preview = {
        preview_token: 'facade-preview-v1.test-token-1234567890',
        operation_digest: '0123456789abcdef',
        required_guards: [{ name: 'expected_hash', value: 'abc123' }],
      };
      const result = {
        preview_token: preview.preview_token,
        operation_digest: preview.operation_digest,
        guard_values: preview.required_guards,
        target,
        touched_targets: ['field:description'],
        evidence: { verified: true, digest: 'final-digest' },
        success: true,
        items: Array.from({ length: 80 }, (_, index) => ({
          index,
          content: `가🙂-${index}-`.repeat(500),
        })),
      };
      const bounded = engine.boundFacadePayload(
        {
          status: 200,
          summary: `${tool} completed`,
          facade: { tool, target },
          result,
          preview,
          artifacts: { final_validation: true },
        },
        24 * 1024,
      );
      const boundedResult = bounded.result as Record<string, unknown>;

      expect(Buffer.byteLength(JSON.stringify(boundedResult), 'utf8')).toBeLessThanOrEqual(24 * 1024);
      expect(JSON.stringify(boundedResult)).not.toContain('\uFFFD');
      expect(boundedResult.truncated).toBe(true);
      expect(Number(boundedResult.omitted_count)).toBeGreaterThan(0);
      expect(boundedResult.next_cursor).toBeNull();
      expect(boundedResult.preview_token).toBe(result.preview_token);
      expect(boundedResult.operation_digest).toBe(result.operation_digest);
      expect(boundedResult.guard_values).toEqual(result.guard_values);
      expect(boundedResult.target).toEqual(target);
      expect(boundedResult.touched_targets).toEqual(result.touched_targets);
      expect(boundedResult.evidence).toEqual(result.evidence);
      expect(boundedResult.success).toBe(true);
      expect(bounded.preview).toEqual(preview);
      expect((bounded.artifacts as Record<string, unknown>).final_validation).toBe(true);
    },
  );

  it('preserves protected evidence above the requested bound when it still fits the hard cap', () => {
    const engine = createBoundingEngine();
    const evidence = {
      verified: true,
      transcript: '검증🙂'.repeat(4_000),
    };
    const bounded = engine.boundFacadePayload(
      {
        status: 200,
        summary: 'apply_edit completed',
        facade: { tool: 'apply_edit', target: { kind: 'active' } },
        result: {
          preview_token: 'facade-preview-v1.large-evidence',
          operation_digest: 'large-evidence-digest',
          guard_values: [{ name: 'expected_hash', value: 'abc123' }],
          target: { kind: 'active', document: 'current' },
          evidence,
          success: true,
          items: Array.from({ length: 80 }, (_, index) => ({
            index,
            content: `가🙂-${index}-`.repeat(500),
          })),
        },
      },
      24 * 1024,
    );
    const boundedResult = bounded.result as Record<string, unknown>;
    const returnedBytes = Buffer.byteLength(JSON.stringify(boundedResult), 'utf8');

    expect(returnedBytes).toBeGreaterThan(24 * 1024);
    expect(returnedBytes).toBeLessThanOrEqual(64 * 1024);
    expect(boundedResult.evidence).toEqual(evidence);
    expect(boundedResult.guard_values).toEqual([{ name: 'expected_hash', value: 'abc123' }]);
    expect(boundedResult.protected_fields_preserved).toBe(true);
    expect(boundedResult.requested_max_bytes_exceeded).toBe(true);
    expect(boundedResult.hard_max_bytes).toBe(64 * 1024);
  });

  it('returns an explicit inspect-outcome summary instead of exceeding the hard cap', () => {
    const engine = createBoundingEngine();
    const bounded = engine.boundFacadePayload(
      {
        status: 200,
        summary: 'apply_edit completed',
        facade: { tool: 'apply_edit', target: { kind: 'active' } },
        result: {
          preview_token: 'facade-preview-v1.hard-overflow',
          operation_digest: 'hard-overflow-digest',
          target: { kind: 'active', document: 'current' },
          evidence: { transcript: '검증🙂'.repeat(8_000) },
          success: true,
          items: [{ content: '나🙂'.repeat(40_000) }],
        },
      },
      24 * 1024,
    );
    const boundedResult = bounded.result as Record<string, unknown>;

    expect(Buffer.byteLength(JSON.stringify(boundedResult), 'utf8')).toBeLessThanOrEqual(64 * 1024);
    expect(boundedResult.preview_token).toBe('facade-preview-v1.hard-overflow');
    expect(boundedResult.operation_digest).toBe('hard-overflow-digest');
    expect(boundedResult.code).toBe('protected_result_exceeds_hard_cap');
    expect(boundedResult.protected_fields_preserved).toBe(false);
    expect(boundedResult.retry_mode).toBe('inspect_outcome');
    expect(boundedResult.outcome).toBe('unknown');
  });

  it('forwards the request AbortSignal to online Danbooru analysis', async () => {
    const controller = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const engine = createFacadeContentEngine({
      apiRequest: async () => ({}),
      danbooru: {
        ensureTagsLoaded: () => undefined,
        formatTags: () => [],
        getDanbooruStatus: () => ({ loaded: true, tagCount: 0, filePath: '', fileExists: false }),
        getPopular: () => [],
        getPopularGrouped: () => ({}),
        searchWithOnline: async (_query: string, _category?: string, _limit?: number, signal?: AbortSignal) => {
          observedSignal = signal;
          return [];
        },
        validateTags: async () => [],
      },
      items: {},
      scriptStyle: {},
      getAbortSignal: () => controller.signal,
    } as unknown as FacadeContentEngineDeps);

    await engine.analyzeFacadeOperation(
      { kind: 'active' },
      { action: 'search_danbooru_tags', query: 'blue_hair', limit: 5 },
    );

    expect(observedSignal).toBe(controller.signal);
  });
});
