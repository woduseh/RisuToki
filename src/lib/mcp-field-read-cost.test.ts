// @vitest-environment node
import { serialize } from 'v8';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeServer, createSearchFixture, postJson, startTestApiServer } from './mcp-api-test-harness';

vi.mock('v8', async (importOriginal) => {
  const actual = await importOriginal<typeof import('v8')>();
  return { ...actual, serialize: vi.fn(actual.serialize) };
});

afterEach(() => vi.clearAllMocks());

describe('MCP field reads with binary assets', () => {
  it.each(['charx', 'risum', 'risup'] as const)(
    'reads and searches %s text without serializing unrelated document assets',
    async (fileType) => {
      const bytes = Buffer.alloc(1024 * 1024, 42);
      const data = createSearchFixture();
      data._fileType = fileType;
      data.assets = [{ path: 'assets/portrait.webp', data: bytes }];
      const confirm = vi.fn(async () => true);
      const api = await startTestApiServer(data, [], undefined, { askRendererConfirm: confirm });
      try {
        for (const [route, body, expected] of [
          ['/field/batch', { fields: ['name', 'description'] }, { count: 2 }],
          ['/field/description/search', { query: 'alpha' }, { totalMatches: 1 }],
          ['/search-all', { query: 'alpha' }, { totalMatches: 4 }],
        ] as const) {
          const response = await postJson(api.port, api.token, route, body);
          expect(response.status).toBe(200);
          expect(response.data).toMatchObject(expected);
        }
        expect(serialize).not.toHaveBeenCalled();
        expect(confirm).not.toHaveBeenCalled();
        expect(bytes.equals(Buffer.alloc(bytes.length, 42))).toBe(true);
      } finally {
        await closeServer(api.server);
      }
    },
  );

  it('keeps authentication, request validation and field visibility checks on reads', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const unauthorized = await postJson(api.port, 'wrong-token', '/field/batch', { fields: ['description'] });
      expect(unauthorized.status).toBe(401);
      for (const [route, body] of [
        ['/field/batch', { fields: 'description' }],
        ['/field/description/search', { query: '[', regex: true }],
        ['/field/groupOnlyGreetings/search', { query: 'alpha' }],
        ['/search-all', { query: '' }],
      ] as const) {
        const response = await postJson(api.port, api.token, route, body);
        expect(response.status).toBe(400);
      }
      expect(serialize).not.toHaveBeenCalled();
    } finally {
      await closeServer(api.server);
    }
  });

  it.each(['/field/description', '/field/batch-write'])(
    'still detects a same-size binary edit during confirmation for %s',
    async (route) => {
      const bytes = Buffer.from([0, 1, 2, 3]);
      const data = { description: 'original', assets: [{ path: 'assets/image.png', data: bytes }] };
      const api = await startTestApiServer(data, [], undefined, {
        askRendererConfirm: async () => {
          bytes[0] = 255;
          return true;
        },
      });
      try {
        const update = { content: 'replacement' };
        const body = route.endsWith('batch-write') ? { entries: [{ field: 'description', ...update }] } : update;
        const response = await postJson(api.port, api.token, route, body);
        expect(response.status).toBe(409);
        expect(data.description).toBe('original');
        expect(bytes[0]).toBe(255);
        expect(serialize).toHaveBeenCalled();
      } finally {
        await closeServer(api.server);
      }
    },
  );

  it.each([true, false])('honors the write confirmation result (%s)', async (allowed) => {
    const data = { description: 'original' };
    const confirm = vi.fn(async () => allowed);
    const api = await startTestApiServer(data, [], undefined, { askRendererConfirm: confirm });
    try {
      await postJson(api.port, api.token, '/field/description', { content: 'replacement' });
      expect(confirm).toHaveBeenCalledOnce();
      expect(data.description).toBe(allowed ? 'replacement' : 'original');
      expect(serialize).toHaveBeenCalled();
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP structured reads with binary assets', () => {
  it.each(['charx', 'risum', 'risup'] as const)(
    'does not snapshot unrelated %s assets for batch, search or analysis',
    async (fileType) => {
      const bytes = Buffer.alloc(1024 * 1024, 42);
      const data = {
        ...createSearchFixture(),
        _fileType: fileType,
        assets: [{ path: 'assets/portrait.webp', data: bytes }],
        lua: '-- ===== main =====\nprint("alpha")\n',
        css: '<style>\n/* ===== main ===== */\n.test { color: red; }\n</style>',
        regex: [{ comment: 'alpha', type: 'editdisplay', find: 'alpha', replace: 'beta', flag: 'g' }],
        triggerScripts: [{ comment: 'alpha', type: 'start', conditions: [], effect: [] }],
        promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', role: 'system', text: 'alpha' }]),
        formatingOrder: '[]',
      };
      const reference = { fileName: `reference.${fileType}`, data: { ...data, assets: [] } };
      const before = JSON.stringify({ ...data, assets: undefined });
      const confirm = vi.fn(async () => true);
      const api = await startTestApiServer(data, [reference], undefined, { askRendererConfirm: confirm });
      const requests: Array<[string, Record<string, unknown>]> = [
        ['/lorebook/batch', { indices: [0] }],
        ['/regex/batch', { indices: [0] }],
        ['/trigger/batch', { indices: [0] }],
        ['/greeting/alternate/batch', { indices: [0] }],
        ['/lua/batch', { indices: [0] }],
        ['/css-section/batch', { indices: [0] }],
        ['/lorebook/diff', { index: 0, refIndex: 0, refEntryIndex: 0 }],
        ['/cbs/simulate', { field: 'description', toggles: {} }],
        ['/cbs/diff', { field: 'description', toggles: { toggle_demo: '1' } }],
      ];
      if (fileType === 'risup')
        requests.push(
          ['/risup/prompt-item/batch', { indices: [0] }],
          ['/risup/prompt-items/search', { query: 'alpha' }],
          ['/risup/prompt-diff', { refIndex: 0 }],
        );
      try {
        for (const [route, body] of requests) {
          const response = await postJson<Record<string, unknown>>(api.port, api.token, route, body);
          expect(response.status, `${route}: ${JSON.stringify(response.data)}`).toBe(200);
          if (route.endsWith('/batch')) expect(response.data.count, route).toBe(1);
        }
        for (const [route] of requests.filter(([route]) => route.endsWith('/batch'))) {
          expect((await postJson(api.port, api.token, route, { indices: 'invalid' })).status, route).toBe(400);
        }
        expect(serialize).not.toHaveBeenCalled();
        expect(confirm).not.toHaveBeenCalled();
        expect(JSON.stringify({ ...data, assets: undefined })).toBe(before);
        expect(bytes.equals(Buffer.alloc(bytes.length, 42))).toBe(true);
      } finally {
        await closeServer(api.server);
      }
    },
  );
});
