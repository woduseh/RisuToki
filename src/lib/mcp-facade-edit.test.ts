import { describe, expect, it, vi } from 'vitest';

import { createFacadeEditEngine, type FacadeEditEngineDeps } from './mcp-facade-edit';
import { isApiError } from './mcp-facade-runtime';
import type { FacadeV1EditOperation } from './mcp-request-schemas';

function createPreviewEngine(response: unknown) {
  const apiRequest = vi.fn(async () => response);
  const engine = createFacadeEditEngine({
    apiRequest,
    content: {},
    items: {},
    scriptStyle: { isScriptStyleFamily: () => false },
  } as unknown as FacadeEditEngineDeps);
  return { ...engine, apiRequest };
}

describe('ID-based edit previews', () => {
  it.each(['write_content', 'delete_item'] as const)('previews lorebook %s without a write', async (op) => {
    const engine = createPreviewEngine({ index: 3, entry: { comment: 'current' } });
    const operation: FacadeV1EditOperation = {
      selector: { family: 'lorebook', id: 'entry/a' },
      ...(op === 'write_content' ? { op, content: { content: 'new text' } } : { op }),
    };
    const result = await engine.previewFacadeOperation({ kind: 'active' }, operation);
    expect(isApiError(result)).toBe(false);
    expect(engine.apiRequest.mock.calls).toEqual([['GET', '/lorebook/by-id/entry%2Fa']]);
    expect(operation.selector.index).toBe(3);
    expect(result).toMatchObject({
      data: {
        dryRun: true,
        resolved_id: 'entry/a',
        resolved_index: 3,
        currentComment: 'current',
        ...(op === 'write_content' ? { updatedKeys: ['content'] } : { operation: 'delete_item' }),
      },
      requiredGuards: [{ name: 'expected_comment', value: 'current' }],
    });
    if (isApiError(result)) throw new Error('Unexpected API error');
    expect(result.routes[1]?.route).toBe(`/lorebook/by-id/entry%2Fa${op === 'delete_item' ? '/delete' : ''}`);
  });

  it.each(['write_content', 'delete_item'] as const)('previews prompt %s with both guards', async (op) => {
    const engine = createPreviewEngine({ index: 2, item: { type: 'plain' }, preview: 'original' });
    const result = await engine.previewFacadeOperation(
      { kind: 'active' },
      {
        selector: { family: 'risup-prompt', id: 'prompt/a' },
        ...(op === 'write_content' ? { op, content: { type: 'chat' } } : { op }),
      },
    );
    expect(isApiError(result)).toBe(false);
    expect(engine.apiRequest.mock.calls).toEqual([['GET', '/risup/prompt-item-by-id/prompt%2Fa']]);
    expect(result).toMatchObject({
      data: {
        resolved_index: 2,
        currentType: 'plain',
        currentPreview: 'original',
        ...(op === 'write_content' ? { replacementType: 'chat' } : { operation: 'delete_item' }),
      },
      requiredGuards: [
        { name: 'expected_type', value: 'plain' },
        { name: 'expected_preview', value: 'original' },
      ],
    });
    if (isApiError(result)) throw new Error('Unexpected API error');
    expect(result.routes[1]?.route).toBe(`/risup/prompt-item-by-id/prompt%2Fa${op === 'delete_item' ? '/delete' : ''}`);
  });

  it.each([
    ['lorebook', 'expected_comment', { index: 0, entry: { comment: 'current' } }],
    ['risup-prompt', 'expected_type', { index: 0, type: 'plain' }],
    ['risup-prompt', 'expected_preview', { index: 0, preview: 'current' }],
  ] as const)('rejects stale %s %s before producing an applicable preview', async (family, name, response) => {
    for (const op of ['write_content', 'delete_item'] as const) {
      const engine = createPreviewEngine(response);
      const result = await engine.previewFacadeOperation(
        { kind: 'active' },
        {
          op,
          selector: { family, id: 'stable-id' },
          content: {},
          guards: [{ name, value: 'stale' }],
        },
      );
      expect(result).toMatchObject({ __apiError: true, status: 409 });
      expect(engine.apiRequest).toHaveBeenCalledTimes(1);
    }
  });
});
