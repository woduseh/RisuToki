import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFacadeContentEngine, type FacadeContentEngineDeps } from './mcp-facade-content';
import { createFacadeEditEngine, type FacadeEditEngineDeps } from './mcp-facade-edit';
import { facadePreviewStore, isApiError } from './mcp-facade-runtime';
import { normalizeMcpErrorEnvelope } from './mcp-response-envelope';
import { registerFacadeTools, type FacadeToolRegistrationDeps } from './mcp-tool-register-facade';
import type { McpToolResult, McpToolServer } from './mcp-tool-registration';

type Handler = (args: Record<string, unknown>) => Promise<McpToolResult>;

const target = { kind: 'external', file_path: 'C:/synthetic/outcome.charx' };
const noOp = {
  status: 200,
  success: false,
  code: 'no_op',
  outcome: 'unchanged',
  retryable: false,
  retry_mode: 'never',
  matchCount: 0,
  message: 'No matching text',
};

function createOutcomeHarness(responses: Record<string, unknown>[]) {
  const handlers = new Map<string, Handler>();
  const apiRequest = vi.fn(async (_method: string, _route: string, body?: Record<string, unknown>) =>
    body?.dry_run ? { dryRun: true, matchCount: 1 } : responses.shift(),
  );
  const content = createFacadeContentEngine({
    apiRequest,
    danbooru: {},
    items: {},
    scriptStyle: {},
  } as unknown as FacadeContentEngineDeps);
  const edit = createFacadeEditEngine({
    apiRequest,
    content,
    items: {},
    scriptStyle: { isScriptStyleFamily: () => false },
  } as unknown as FacadeEditEngineDeps);
  registerFacadeTools(
    {
      tool: (name: string, _description: string, _schema: unknown, handler: Handler) => handlers.set(name, handler),
    } as unknown as McpToolServer,
    {
      apiRequest,
      content,
      edit,
      assets: {},
      items: {},
      files: {},
      scriptStyle: {},
      safeToolHandler: (_name: string, handler: Handler) => handler,
      textResult: (data: unknown) => ({
        content: [{ type: 'text', text: JSON.stringify(isApiError(data) ? normalizeMcpErrorEnvelope(data) : data) }],
      }),
    } as unknown as FacadeToolRegistrationDeps,
  );
  async function call(name: string, args: Record<string, unknown>) {
    const result = await handlers.get(name)!(args);
    return JSON.parse((result.content[0] as { text: string }).text);
  }
  async function preview(count = 1) {
    return call('preview_edit', {
      target,
      operations: Array.from({ length: count }, (_, index) => ({
        op: 'replace_text',
        selector: { family: 'field', field: `field${index}` },
        find: 'original',
        replace: 'updated',
      })),
    });
  }
  async function apply(count = 1) {
    const result = await preview(count);
    return call('apply_edit', {
      target,
      preview_token: result.preview.preview_token,
      operation_digest: result.preview.operation_digest,
    });
  }
  return { apiRequest, call, preview, apply };
}

afterEach(() => facadePreviewStore.clear());

describe('facade edit outcome reporting', () => {
  it.each([false, true])('preserves an unknown first mutation outcome (details=%s)', async (withDetails) => {
    const cause = {
      __apiError: true,
      status: 504,
      error: 'Mutation response timed out',
      code: 'mutation_timeout',
      retryable: false,
      retry_mode: 'inspect_outcome',
      outcome: 'unknown',
      ...(withDetails ? { details: { request_id: 'synthetic' } } : {}),
    };
    const result = await createOutcomeHarness([cause]).apply();
    expect(result).toMatchObject({
      code: 'mutation_timeout',
      retryable: false,
      retry_mode: 'inspect_outcome',
      outcome: 'unknown',
      details: {
        preview_token_consumed: true,
        partial: false,
        applied_count: 0,
        cause: { code: 'mutation_timeout', outcome: 'unknown', ...(withDetails ? { details: cause.details } : {}) },
      },
    });
  });

  it.each(['partial', 'unknown'] as const)('preserves %s after earlier edits have applied', async (outcome) => {
    const cause = {
      __apiError: true,
      status: 504,
      error: 'Incomplete mutation response',
      code: 'mutation_timeout',
      retryable: false,
      retry_mode: 'inspect_outcome',
      outcome,
      details: { request_id: 'synthetic' },
    };
    const result = await createOutcomeHarness([{ success: true }, cause]).apply(2);
    expect(result).toMatchObject({
      code: 'partial_apply',
      retryable: false,
      retry_mode: 'inspect_outcome',
      outcome: 'partial',
      details: { partial: true, applied_count: 1, cause: { outcome } },
    });
  });

  it('retains partial effects inside the first failed operation', async () => {
    const result = await createOutcomeHarness([
      {
        __apiError: true,
        status: 409,
        error: 'Only part of this operation applied',
        outcome: 'partial',
        details: { partial: true },
      },
    ]).apply();
    expect(result).toMatchObject({
      code: 'partial_apply',
      retryable: false,
      retry_mode: 'inspect_outcome',
      outcome: 'partial',
      details: { partial: true, applied_count: 0, cause: { outcome: 'partial' } },
    });
  });

  it('does not count an earlier no-op as an applied mutation after a conflict', async () => {
    const result = await createOutcomeHarness([noOp, { __apiError: true, status: 409, error: 'Stale guard' }]).apply(2);
    expect(result).toMatchObject({
      code: 'conflict',
      outcome: 'not_started',
      details: { partial: false, applied_count: 0, noop_count: 1 },
    });
  });

  it('reports an HTTP-200 no-op without claiming an applied edit', async () => {
    const harness = createOutcomeHarness([noOp]);
    const result = await harness.apply();
    expect(result).toMatchObject({
      status: 200,
      success: false,
      outcome: 'unchanged',
      retryable: false,
      retry_mode: 'never',
      result: { applied_count: 0, noop_count: 1 },
      artifacts: { count: 0 },
    });
    expect(result.result.applied[0].data).toEqual(noOp);
    expect(result.summary).not.toContain('Applied 1');
  });

  it('distinguishes applied edits from no-ops in a mixed batch', async () => {
    const harness = createOutcomeHarness([noOp, { success: true, matchCount: 1 }]);
    const result = await harness.apply(2);
    expect(result).toMatchObject({
      success: false,
      outcome: 'partial',
      retryable: false,
      retry_mode: 'inspect_outcome',
      result: { applied_count: 1, noop_count: 1 },
      artifacts: { count: 1 },
    });
    expect(result.result.applied).toHaveLength(2);
  });

  it('does not recommend apply for a preview with no matching text', async () => {
    const harness = createOutcomeHarness([]);
    harness.apiRequest.mockResolvedValue(noOp);
    const result = await harness.preview();
    expect(result).toMatchObject({
      success: false,
      outcome: 'unchanged',
      result: { applicable_count: 0, noop_count: 1 },
    });
    expect(result.next_actions).not.toContain('apply_edit');
    expect(result.result.previews[0].data).toEqual(noOp);
  });
});
