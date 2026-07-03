// @vitest-environment node
import * as fs from 'fs';
import * as path from 'path';

import { describe, expect, it } from 'vitest';
import {
  closeServer,
  createLegacyTestApiServer,
  createSearchFixture,
  getJson,
  postJson,
  type McpErrorEnvelope,
  type McpNoOpEnvelope,
  type SearchFixture,
} from './mcp-api-test-harness';
import { expectMcpNoOpEnvelope, useMcpApiTestDir } from './mcp-api-vitest-helpers';

const FOLDER_UUID_RE = /^folder:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_DIR = useMcpApiTestDir('lorebook-routes');
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

describe('MCP API lorebook folder mutations', () => {
  it('creates canonical folder:uuid keys for folder entries added through /lorebook/add', async () => {
    const currentData: SearchFixture = { lorebook: [] };
    const api = await startTestApiServer(currentData);

    try {
      const response = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/lorebook/add', {
        comment: 'Imported Folder',
        mode: 'folder',
      });

      expect(response.status).toBe(200);
      expect(currentData.lorebook).toHaveLength(1);
      expect(currentData.lorebook?.[0]).toMatchObject({
        comment: 'Imported Folder',
        mode: 'folder',
        folder: '',
      });
      expect(currentData.lorebook?.[0]?.key).toMatch(FOLDER_UUID_RE);
    } finally {
      await closeServer(api.server);
    }
  });

  it('creates canonical folder:uuid keys for folder entries added through /lorebook/batch-add', async () => {
    const currentData: SearchFixture = { lorebook: [] };
    const api = await startTestApiServer(currentData);

    try {
      const response = await postJson<{ success: boolean; added: number }>(api.port, api.token, '/lorebook/batch-add', {
        entries: [
          { comment: 'Folder One', mode: 'folder' },
          { comment: 'Regular Entry', mode: 'normal' },
          { comment: 'Folder Two', mode: 'folder' },
        ],
      });

      expect(response.status).toBe(200);
      expect(response.data.added).toBe(3);
      expect(currentData.lorebook).toHaveLength(3);
      expect(currentData.lorebook?.[0]?.key).toMatch(FOLDER_UUID_RE);
      expect(currentData.lorebook?.[1]?.key).toBe('');
      expect(currentData.lorebook?.[2]?.key).toMatch(FOLDER_UUID_RE);
      expect(currentData.lorebook?.[0]?.key).not.toBe(currentData.lorebook?.[2]?.key);
    } finally {
      await closeServer(api.server);
    }
  });

  it('preserves canonical folder keys when updating legacy folders through /lorebook/:idx', async () => {
    const currentData: SearchFixture = {
      lorebook: [{ comment: 'Legacy Folder', mode: 'folder', key: '', id: 'legacy-folder-uuid', content: '' }],
    };
    const api = await startTestApiServer(currentData);

    try {
      const response = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/lorebook/0', {
        comment: 'Renamed Legacy Folder',
      });

      expect(response.status).toBe(200);
      expect(currentData.lorebook?.[0]).toMatchObject({
        comment: 'Renamed Legacy Folder',
        mode: 'folder',
        key: 'folder:legacy-folder-uuid',
        folder: '',
      });
    } finally {
      await closeServer(api.server);
    }
  });

  it('normalizes child folder refs during /lorebook/batch-write', async () => {
    const currentData: SearchFixture = {
      lorebook: [{ comment: 'Regular Entry', mode: 'normal', key: '', folder: '' }],
    };
    const api = await startTestApiServer(currentData);

    try {
      const response = await postJson<{ success: boolean; count: number }>(
        api.port,
        api.token,
        '/lorebook/batch-write',
        {
          entries: [{ index: 0, data: { folder: 'folder-uuid-2' } }],
        },
      );

      expect(response.status).toBe(200);
      expect(response.data.count).toBe(1);
      expect(currentData.lorebook?.[0]?.folder).toBe('folder:folder-uuid-2');
    } finally {
      await closeServer(api.server);
    }
  });

  it('assigns a new canonical folder key when cloning folder entries', async () => {
    const currentData: SearchFixture = {
      lorebook: [{ comment: 'Folder A', mode: 'folder', key: 'folder:folder-uuid-1', content: '', folder: '' }],
    };
    const api = await startTestApiServer(currentData);

    try {
      const response = await postJson<{ success: boolean; newIndex: number }>(api.port, api.token, '/lorebook/clone', {
        index: 0,
      });

      expect(response.status).toBe(200);
      expect(currentData.lorebook).toHaveLength(2);
      expect(currentData.lorebook?.[1]).toMatchObject({
        comment: 'Folder A',
        mode: 'folder',
        folder: '',
      });
      expect(currentData.lorebook?.[1]?.key).toMatch(FOLDER_UUID_RE);
      expect(currentData.lorebook?.[1]?.key).not.toBe('folder:folder-uuid-1');
    } finally {
      await closeServer(api.server);
    }
  });

  it('counts legacy child refs under canonical folder keys in GET /lorebook', async () => {
    const currentData: SearchFixture = {
      lorebook: [
        { comment: 'Folder A', mode: 'folder', key: 'canonical-folder-uuid', id: 'legacy-folder-id', content: '' },
        { comment: 'Child A', mode: 'normal', key: '', folder: 'folder:legacy-folder-id', content: 'child' },
      ],
    };
    const api = await startTestApiServer(currentData);

    try {
      const response = await getJson<{
        folders: Array<{ id: string; name: string; entryCount: number }>;
        entries: Array<{ folder: string }>;
      }>(api.port, api.token, '/lorebook');

      expect(response.status).toBe(200);
      expect(response.data.folders).toEqual([{ id: 'folder:canonical-folder-uuid', name: 'Folder A', entryCount: 1 }]);
      expect(response.data.entries[1]?.folder).toBe('folder:canonical-folder-uuid');
    } finally {
      await closeServer(api.server);
    }
  });

  it('keeps canonical folder assignment for rename-conflict imports', async () => {
    const sourcePath = path.join(TEST_DIR, 'rename-import.json');
    await fs.promises.writeFile(
      sourcePath,
      JSON.stringify({
        folders: [{ id: 'folder:folder-uuid-1', name: 'Characters' }],
        entries: [{ comment: 'Alice', content: 'Imported Alice', folder: 'folder:folder-uuid-1' }],
      }),
      'utf-8',
    );

    const currentData: SearchFixture = {
      lorebook: [
        { comment: 'Characters', mode: 'folder', key: 'folder-uuid-1', content: '' },
        { comment: 'Alice', mode: 'normal', key: 'alice', folder: '', content: 'Existing Alice' },
      ],
    };
    const api = await startTestApiServer(currentData);

    try {
      const response = await postJson<{ success: boolean; imported: number; renamed: number }>(
        api.port,
        api.token,
        '/lorebook/import',
        {
          format: 'json',
          source_path: sourcePath,
          conflict: 'rename',
        },
      );

      expect(response.status).toBe(200);
      const renamedEntry = currentData.lorebook?.find((entry) => entry.comment === 'Alice (2)');
      expect(renamedEntry).toMatchObject({
        comment: 'Alice (2)',
        folder: 'folder:folder-uuid-1',
        content: 'Imported Alice',
      });
    } finally {
      await closeServer(api.server);
    }
  });

  it('updates folder placement for overwrite-conflict imports', async () => {
    const sourcePath = path.join(TEST_DIR, 'overwrite-import.json');
    await fs.promises.writeFile(
      sourcePath,
      JSON.stringify({
        folders: [{ id: 'folder:folder-uuid-1', name: 'Characters' }],
        entries: [{ comment: 'Alice', content: 'Imported Alice' }],
      }),
      'utf-8',
    );

    const currentData: SearchFixture = {
      lorebook: [
        { comment: 'Characters', mode: 'folder', key: 'folder-uuid-1', content: '' },
        { comment: 'Alice', mode: 'normal', key: 'alice', folder: 'folder:folder-uuid-1', content: 'Existing Alice' },
      ],
    };
    const api = await startTestApiServer(currentData);

    try {
      const response = await postJson<{ success: boolean; overwritten: number }>(
        api.port,
        api.token,
        '/lorebook/import',
        {
          format: 'json',
          source_path: sourcePath,
          conflict: 'overwrite',
        },
      );

      expect(response.status).toBe(200);
      const overwrittenEntry = currentData.lorebook?.find((entry) => entry.comment === 'Alice');
      expect(overwrittenEntry).toMatchObject({
        comment: 'Alice',
        folder: '',
        content: 'Imported Alice',
      });
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API lorebook compatibility fields', () => {
  it('updates activationPercent through /lorebook/:idx', async () => {
    const currentData: SearchFixture = {
      lorebook: [
        {
          comment: 'Chance Entry',
          mode: 'normal',
          key: 'chance',
          content: 'content',
          activationPercent: 25,
        },
      ],
    };
    const api = await startTestApiServer(currentData);

    try {
      const response = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/lorebook/0', {
        activationPercent: 80,
      });

      expect(response.status).toBe(200);
      expect(currentData.lorebook?.[0]).toMatchObject({
        activationPercent: 80,
      });
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API lorebook folder reads', () => {
  it('returns canonical folder identity from lorebook read endpoints', async () => {
    const currentData: SearchFixture = {
      lorebook: [
        { comment: 'Folder A', mode: 'folder', key: '', id: 'legacy-folder-id', content: '' },
        {
          comment: 'Folder B',
          mode: 'folder',
          key: 'folder:canonical-folder-uuid',
          id: 'legacy-folder-id-b',
          content: '',
        },
        { comment: 'Child B', mode: 'normal', key: '', folder: 'folder:legacy-folder-id-b', content: 'child' },
      ],
    };
    const api = await startTestApiServer(currentData);

    try {
      const single = await getJson<{ entry: { key: string; folder?: string } }>(api.port, api.token, '/lorebook/0');
      expect(single.status).toBe(200);
      expect(single.data.entry.key).toBe('folder:legacy-folder-id');

      const batch = await postJson<{ entries: Array<{ entry: { folder: string } }> }>(
        api.port,
        api.token,
        '/lorebook/batch',
        {
          indices: [2],
          fields: ['folder'],
        },
      );
      expect(batch.status).toBe(200);
      expect(batch.data.entries[0]?.entry.folder).toBe('folder:canonical-folder-uuid');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns canonical folder identity from reference lorebook read endpoints', async () => {
    const referenceFiles = [
      {
        fileName: 'ref.charx',
        data: {
          lorebook: [
            {
              comment: 'Folder A',
              mode: 'folder',
              key: 'folder:canonical-folder-uuid',
              id: 'legacy-folder-id',
              content: '',
            },
            { comment: 'Child A', mode: 'normal', key: '', folder: 'folder:legacy-folder-id', content: 'child' },
          ],
        },
      },
    ];
    const api = await startTestApiServer({ lorebook: [] }, referenceFiles);

    try {
      const single = await getJson<{ entry: { key: string } }>(api.port, api.token, '/reference/0/lorebook/0');
      expect(single.status).toBe(200);
      expect(single.data.entry.key).toBe('folder:canonical-folder-uuid');

      const batch = await postJson<{ entries: Array<{ entry: { folder: string } }> }>(
        api.port,
        api.token,
        '/reference/0/lorebook/batch',
        {
          indices: [1],
          fields: ['folder'],
        },
      );
      expect(batch.status).toBe(200);
      expect(batch.data.entries[0]?.entry.folder).toBe('folder:canonical-folder-uuid');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — lorebook read and diff routes', () => {
  it('returns a structured error envelope for GET /lorebook/999', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read lorebook entry');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:999');
      expect(res.data.error).toContain('out of range');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /lorebook/batch with indices: not-an-array', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch', {
        indices: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch read lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch');
      expect(res.data.error).toContain('array');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /lorebook/batch with 51 indices', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch', {
        indices: Array.from({ length: 51 }, (_, i) => i),
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch read lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch');
      expect(res.data.error).toContain('Maximum');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /lorebook/diff with missing index', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture, [
      { fileName: 'ref.charx', data: { lorebook: createSearchFixture().lorebook } },
    ]);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/diff', {});
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'diff lorebook entry');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:diff');
      expect(res.data.error).toContain('index');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /lorebook/diff with missing reference indices', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture, [
      { fileName: 'ref.charx', data: { lorebook: createSearchFixture().lorebook } },
    ]);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/diff', { index: 0 });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'diff lorebook entry');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:diff');
      expect(res.data.error).toContain('refIndex');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /lorebook/diff with current entry out of range', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture, [
      { fileName: 'ref.charx', data: { lorebook: createSearchFixture().lorebook } },
    ]);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/diff', {
        index: 999,
        refIndex: 0,
        refEntryIndex: 0,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'diff lorebook entry');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:diff');
      expect(res.data.error).toContain('out of range');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /lorebook/diff with reference file out of range', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture, [
      { fileName: 'ref.charx', data: { lorebook: createSearchFixture().lorebook } },
    ]);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/diff', {
        index: 0,
        refIndex: 999,
        refEntryIndex: 0,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'diff lorebook entry');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:diff');
      expect(res.data.error).toContain('out of range');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /lorebook/diff with reference entry out of range', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture, [
      { fileName: 'ref.charx', data: { lorebook: createSearchFixture().lorebook } },
    ]);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/diff', {
        index: 0,
        refIndex: 0,
        refEntryIndex: 999,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'diff lorebook entry');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:diff');
      expect(res.data.error).toContain('out of range');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /lorebook/clone with source index out of range', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/clone', {
        index: 999,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'clone lorebook entry');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:clone:999');
      expect(res.data.error).toContain('out of range');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — lorebook mutation routes', () => {
  // ── POST /lorebook/batch-write ─────────────────────────────────────
  it('batch-write: entries not array → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-write', {
        entries: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-write');
      expect(res.data.error).toContain('non-empty array');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-write: empty entries → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-write', {
        entries: [],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-write');
      expect(res.data.error).toContain('non-empty array');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-write: exceeds max batch size → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const entries = Array.from({ length: 51 }, (_, i) => ({ index: 0, data: { content: `x${i}` } }));
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-write', { entries });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-write');
      expect(res.data.error).toContain('50');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-write: invalid index → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-write', {
        entries: [{ index: 999, data: { content: 'x' } }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-write');
      expect(res.data.error).toContain('Invalid');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-write: missing data object → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-write', {
        entries: [{ index: 0 }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-write');
      expect(res.data.error).toContain('data');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  // ── POST /lorebook/batch-add ───────────────────────────────────────
  it('batch-add: entries not array → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-add', {
        entries: 42,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch add lorebook entries');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-add');
      expect(res.data.error).toContain('non-empty array');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-add: exceeds max batch size → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const entries = Array.from({ length: 51 }, () => ({ content: 'x' }));
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-add', { entries });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch add lorebook entries');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-add');
      expect(res.data.error).toContain('50');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  // ── POST /lorebook/batch-delete ────────────────────────────────────
  it('batch-delete: indices not array → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-delete', {
        indices: 'bad',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch delete lorebook entries');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-delete');
      expect(res.data.error).toContain('non-empty array');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-delete: exceeds max batch size → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const indices = Array.from({ length: 51 }, (_, i) => i);
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-delete', { indices });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch delete lorebook entries');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-delete');
      expect(res.data.error).toContain('50');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-delete: invalid index → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-delete', {
        indices: [999],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch delete lorebook entries');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-delete');
      expect(res.data.error).toContain('Invalid');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-delete: expected_comments mismatch → 409 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-delete', {
        indices: [0],
        expected_comments: ['Wrong lore'],
      });
      expect(res.status).toBe(409);
      expect(res.data).toHaveProperty('action', 'batch delete lorebook entries');
      expect(res.data).toHaveProperty('status', 409);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-delete');
      expect(res.data.error).toContain('Stale lorebook index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  // ── POST /lorebook/batch-replace ───────────────────────────────────
  it('batch-replace: replacements not array → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-replace', {
        replacements: null,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch replace lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-replace');
      expect(res.data.error).toContain('non-empty array');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-replace: exceeds max batch size → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const replacements = Array.from({ length: 51 }, () => ({ index: 0, find: 'x', replace: 'y' }));
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-replace', { replacements });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch replace lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-replace');
      expect(res.data.error).toContain('50');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-replace: invalid index → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-replace', {
        replacements: [{ index: 999, find: 'x', replace: 'y' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch replace lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-replace');
      expect(res.data.error).toContain('Invalid');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-replace: missing find → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-replace', {
        replacements: [{ index: 0, replace: 'y' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch replace lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-replace');
      expect(res.data.error).toContain('find');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-replace: dry_run previews matches without mutating lorebook', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/batch-replace', {
        replacements: [{ index: 0, find: 'alpha', replace: 'beta', expected_comment: 'Bridge lore' }],
        dry_run: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.dryRun).toBe(true);
      expect(res.data.count).toBe(1);
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.matchCount).toBe(1);
      expect(fixture.lorebook?.[0]?.content).toBe('Lore alpha entry.');
    } finally {
      await closeServer(api.server);
    }
  });

  // ── POST /lorebook/batch-insert ────────────────────────────────────
  it('batch-insert: insertions not array → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-insert', {
        insertions: 'oops',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch insert lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-insert');
      expect(res.data.error).toContain('non-empty array');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-insert: exceeds max batch size → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const insertions = Array.from({ length: 51 }, () => ({ index: 0, content: 'x' }));
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-insert', { insertions });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch insert lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-insert');
      expect(res.data.error).toContain('50');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-insert: invalid index → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-insert', {
        insertions: [{ index: 999, content: 'x' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch insert lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-insert');
      expect(res.data.error).toContain('Invalid');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-insert: missing content → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-insert', {
        insertions: [{ index: 0 }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch insert lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-insert');
      expect(res.data.error).toContain('content');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-insert: anchor miss returns a structured no-op envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/lorebook/batch-insert', {
        insertions: [{ index: 0, position: 'after', anchor: 'missing-anchor', content: 'new text' }],
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'batch insert lorebook',
        target: 'lorebook:batch-insert',
      });
      expect(res.data.errors).toEqual([{ index: 0, error: '앵커를 찾을 수 없음: missing-anchor' }]);
    } finally {
      await closeServer(api.server);
    }
  });

  // ── POST /lorebook/:idx/insert — anchor required ──────────────────
  it('insert: anchor required for after/before position → 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/0/insert', {
        content: 'new text',
        position: 'after',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'insert lorebook content');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:0');
      expect(res.data.error).toContain('anchor');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace: no matches returns a structured no-op envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/lorebook/0/replace', {
        find: 'missing-value',
        replace: 'updated',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'replace lorebook field',
        target: 'lorebook:0',
      });
      expect(res.data.message).toBe('일치하는 항목 없음');
      expect(res.data.matchCount).toBe(0);
      expect(res.data.field).toBe('content');
    } finally {
      await closeServer(api.server);
    }
  });
});
