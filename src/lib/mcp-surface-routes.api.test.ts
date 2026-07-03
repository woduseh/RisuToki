// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { openCharx } from '../charx-io';
import {
  closeServer,
  createExternalFixtureHelpers,
  createLegacyTestApiServer,
  getJson,
  postJson,
  type SearchFixture,
} from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';

const TEST_DIR = useMcpApiTestDir('surface-routes');
const { createExternalCharxFixture } = createExternalFixtureHelpers(TEST_DIR);
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

describe('MCP API surface routes', () => {
  it('lists, reads, and patches current document surfaces by JSON Pointer', async () => {
    const currentData: SearchFixture = {
      name: 'Surface Bot',
      firstMessage: 'Hello',
      regex: [{ comment: 'Old Regex', find: 'foo', replace: 'bar' }],
    };
    const api = await startTestApiServer(currentData);

    try {
      const list = await getJson<{
        count: number;
        document_hash: string;
        surfaces: Array<{ name: string; hash: string }>;
      }>(api.port, api.token, '/surfaces');
      expect(list.status).toBe(200);
      expect(list.data.surfaces.some((surface) => surface.name === 'regex')).toBe(true);

      const read = await postJson<{ value: string; hash: string }>(api.port, api.token, '/surface/read', {
        path: '/regex/0/comment',
      });
      expect(read.status).toBe(200);
      expect(read.data.value).toBe('Old Regex');

      const dryRun = await postJson<{ dry_run: boolean; changed: number }>(api.port, api.token, '/surface/patch', {
        expected_hash: list.data.document_hash,
        dry_run: true,
        operations: [{ op: 'replace', path: '/regex/0/comment', value: 'New Regex' }],
      });
      expect(dryRun.status).toBe(200);
      expect(dryRun.data.dry_run).toBe(true);
      expect(currentData.regex?.[0]?.comment).toBe('Old Regex');

      const patched = await postJson<{ success: boolean; touched: string[] }>(api.port, api.token, '/surface/patch', {
        expected_hash: list.data.document_hash,
        operations: [{ op: 'replace', path: '/regex/0/comment', value: 'New Regex' }],
      });
      expect(patched.status).toBe(200);
      expect(patched.data.success).toBe(true);
      expect(patched.data.touched).toContain('regex');
      expect(currentData.regex?.[0]?.comment).toBe('New Regex');
    } finally {
      await closeServer(api.server);
    }
  });

  it('uses RFC 6902 array insertion, append, and replace semantics', async () => {
    const currentData: SearchFixture = {
      alternateGreetings: ['first', 'third'],
    };
    const api = await startTestApiServer(currentData);

    try {
      const patched = await postJson<{ success: boolean }>(api.port, api.token, '/surface/patch', {
        operations: [
          { op: 'add', path: '/alternateGreetings/1', value: 'second' },
          { op: 'add', path: '/alternateGreetings/-', value: 'fourth' },
          { op: 'replace', path: '/alternateGreetings/0', value: 'FIRST' },
        ],
      });
      expect(patched.status).toBe(200);
      expect(currentData.alternateGreetings).toEqual(['FIRST', 'second', 'third', 'fourth']);

      const rejected = await postJson<Record<string, unknown>>(api.port, api.token, '/surface/patch', {
        operations: [{ op: 'replace', path: '/alternateGreetings/99', value: 'invalid' }],
      });
      expect(rejected.status).toBe(400);
      expect(currentData.alternateGreetings).toEqual(['FIRST', 'second', 'third', 'fourth']);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects malformed risup JSON field patches before mutating current data', async () => {
    const currentData: SearchFixture = {
      _fileType: 'risup',
      promptSettings: '{}',
    };
    const api = await startTestApiServer(currentData);

    try {
      const rejected = await postJson<Record<string, unknown>>(api.port, api.token, '/surface/patch', {
        operations: [{ op: 'replace', path: '/promptSettings', value: '{broken' }],
      });
      expect(rejected.status).toBe(400);
      expect(rejected.data.error).toContain('Invalid promptSettings');
      expect(currentData.promptSettings).toBe('{}');
    } finally {
      await closeServer(api.server);
    }
  });

  it('invalidates asset map cache when surface patches touch asset source fields', async () => {
    const currentData: SearchFixture = {
      name: 'Asset Surface Bot',
      cardAssets: [{ name: 'old', uri: 'embeded://assets/old.png', ext: 'png' }],
      xMeta: {},
      assets: [{ path: 'assets/old.png', data: Buffer.from('old') }],
    };
    const invalidateAssetsMapCache = vi.fn();
    const api = await startTestApiServer(currentData, [], undefined, { invalidateAssetsMapCache });

    try {
      const list = await getJson<{ document_hash: string }>(api.port, api.token, '/surfaces');
      const patched = await postJson<{ success: boolean; touched: string[] }>(api.port, api.token, '/surface/patch', {
        expected_hash: list.data.document_hash,
        operations: [{ op: 'replace', path: '/cardAssets/0/name', value: 'new' }],
      });

      expect(patched.status).toBe(200);
      expect(patched.data.touched).toContain('cardAssets');
      expect(invalidateAssetsMapCache).toHaveBeenCalledTimes(1);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replaces text recursively under a current document surface', async () => {
    const currentData: SearchFixture = {
      lorebook: [{ comment: 'Alpha', content: 'Hinano says hello. Hinano smiles.' }],
    };
    const api = await startTestApiServer(currentData);

    try {
      const replaced = await postJson<{ success: boolean; matchCount: number }>(
        api.port,
        api.token,
        '/surface/replace',
        {
          path: '/lorebook/0',
          find: 'Hinano',
          replace: 'Hina',
        },
      );
      expect(replaced.status).toBe(200);
      expect(replaced.data.success).toBe(true);
      expect(replaced.data.matchCount).toBe(2);
      expect(currentData.lorebook?.[0]?.content).toBe('Hina says hello. Hina smiles.');
    } finally {
      await closeServer(api.server);
    }
  });

  it('patches unopened external file surfaces and rejects the active file path', async () => {
    const fixture = createExternalCharxFixture({
      regex: [{ comment: 'External Old', type: 'editoutput', find: 'a', replace: 'b', flag: 'g' }],
    });
    const api = await startTestApiServer(null, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: null,
        currentFileType: null,
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      }),
    });

    try {
      const read = await postJson<{ value: string }>(api.port, api.token, '/external/surface/read', {
        file_path: fixture.filePath,
        path: '/regex/0/comment',
      });
      expect(read.status).toBe(200);
      expect(read.data.value).toBe('External Old');

      const patched = await postJson<{ success: boolean }>(api.port, api.token, '/external/surface/patch', {
        file_path: fixture.filePath,
        operations: [
          { op: 'replace', path: '/regex/0/comment', value: 'External New' },
          { op: 'add', path: '/alternateGreetings/0', value: 'Inserted first' },
        ],
      });
      expect(patched.status).toBe(200);
      expect(patched.data.success).toBe(true);
      const reopened = openCharx(fixture.filePath) as unknown as SearchFixture;
      expect(reopened.regex?.[0]?.comment).toBe('External New');
      expect(reopened.alternateGreetings?.[0]).toBe('Inserted first');
    } finally {
      await closeServer(api.server);
    }

    const activeApi = await startTestApiServer({ name: 'Active' }, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: fixture.filePath,
        currentFileType: 'charx',
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      }),
    });
    try {
      const rejected = await postJson<Record<string, unknown>>(
        activeApi.port,
        activeApi.token,
        '/external/surface/patch',
        {
          file_path: fixture.filePath,
          operations: [{ op: 'replace', path: '/name', value: 'Blocked' }],
        },
      );
      expect(rejected.status).toBe(409);
    } finally {
      await closeServer(activeApi.server);
    }
  });
});
