// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { openCharx } from '../charx-io';
import { closeServer, createExternalFixtureHelpers, postJson, startTestApiServer } from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';
import { createFacadeEditEngine, type FacadeEditEngineDeps } from './mcp-facade-edit';
import { facadeApiError, isApiError } from './mcp-facade-runtime';
import { facadeV1EditOperationSchema, type FacadeV1EditOperation, type FacadeV1Target } from './mcp-request-schemas';

const TEST_DIR = useMcpApiTestDir('facade-field-replace');
const { createExternalCharxFixture } = createExternalFixtureHelpers(TEST_DIR);

function createEditEngine(apiRequest: FacadeEditEngineDeps['apiRequest']) {
  return createFacadeEditEngine({
    apiRequest,
    content: {},
    items: {},
    scriptStyle: { isScriptStyleFamily: () => false },
  } as unknown as FacadeEditEngineDeps);
}

function createPreviewEngine(response: unknown) {
  const apiRequest = vi.fn(async () => response);
  return { ...createEditEngine(apiRequest), apiRequest };
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

const regexReplacement = {
  source: 'FOO1 foo22 foo333suffix',
  find: '\\bfoo(\\d+)\\b',
  replace: 'bar$1',
  options: { regex: true, flags: 'gi' },
  expected: 'bar1 bar22 foo333suffix',
  matches: ['FOO1', 'foo22'],
};
const literalReplacement = {
  source: 'F.O foo f.o f.o',
  find: 'f.o',
  replace: '$1',
  expected: 'F.O foo $1 $1',
  matches: ['f.o', 'f.o'],
};

describe.each(['active', 'external'] as const)('%s field replacements through real HTTP routes', (kind) => {
  it.each([
    { name: 'regex matching, case-insensitive flags and capture replacement', ...regexReplacement, allowed: true },
    { name: 'literal mode by default', ...literalReplacement, options: {}, allowed: true },
    {
      name: 'explicit literal mode even with regex flags',
      ...literalReplacement,
      options: { regex: false, flags: 'gi' },
      allowed: true,
    },
    { name: 'confirmation refusal after a regex preview', ...regexReplacement, allowed: false },
  ])('preserves $name in preview and apply', async ({ source, find, replace, options, expected, matches, allowed }) => {
    const currentData = { description: source };
    const external = kind === 'external' ? createExternalCharxFixture({ description: source }) : undefined;
    const target: FacadeV1Target = external ? { kind: 'external', file_path: external.filePath } : { kind: 'active' };
    const readContent = () => (external ? openCharx(external.filePath).description : currentData.description);
    const confirm = vi.fn(async () => allowed);
    const api = await startTestApiServer(currentData, [], undefined, {
      userDataPath: TEST_DIR,
      askRendererConfirm: confirm,
    });
    try {
      const engine = createEditEngine(async (method, routePath, body) => {
        expect(method).toBe('POST');
        const response = await postJson<Record<string, unknown>>(api.port, api.token, routePath, body);
        return response.status < 400
          ? response.data
          : facadeApiError(response.status, String(response.data.error), String(response.data.suggestion));
      });
      const operation = facadeV1EditOperationSchema.parse({
        op: 'replace_text',
        selector: { family: 'field', field: 'description' },
        find,
        replace,
        ...options,
      });

      const preview = await engine.previewFacadeOperation(target, operation);
      expect(preview).toMatchObject({
        data: {
          dryRun: true,
          matchCount: matches.length,
          newSize: expected.length,
          previews: matches.map((match) => expect.objectContaining({ match })),
        },
      });
      expect(readContent()).toBe(source);
      expect(confirm).not.toHaveBeenCalled();
      if (isApiError(preview)) throw new Error('Unexpected preview error');

      const applied = await engine.applyFacadeOperation(target, operation, preview.requiredGuards);
      if (allowed) {
        expect(applied).toMatchObject({
          data: { success: true, matchCount: matches.length, newSize: expected.length },
        });
        expect(readContent()).toBe(expected);
      } else {
        expect(applied).toMatchObject({ __apiError: true, status: 403 });
        expect(readContent()).toBe(source);
      }
      expect(confirm).toHaveBeenCalledTimes(1);
      if (external) expect(currentData.description).toBe(source);
    } finally {
      await closeServer(api.server);
    }
  });
});
