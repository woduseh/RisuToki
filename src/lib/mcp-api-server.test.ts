import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function parseLuaSections() {
  return [];
}

function combineLuaSections() {
  return '';
}

function detectLuaSection() {
  return null;
}

function parseCssSections() {
  return { sections: [], prefix: '', suffix: '' };
}

function combineCssSections() {
  return '';
}

function detectCssSectionInline() {
  return null;
}

function detectCssBlockOpen() {
  return false;
}

function detectCssBlockClose() {
  return false;
}

interface SearchFixture {
  description?: string;
  firstMessage?: string;
  alternateGreetings?: string[];
  groupOnlyGreetings?: string[];
  lorebook?: Array<{
    comment?: string;
    key?: string;
    content?: string;
    mode?: string;
    folder?: string;
    id?: string;
  }>;
  [key: string]: unknown;
}

type StartApiServer = typeof import('./mcp-api-server').startApiServer;

interface SearchSurface {
  target: string;
  [key: string]: unknown;
}

function createSearchFixture(): SearchFixture {
  return {
    description: 'Field Alpha is searchable.',
    firstMessage: 'First alpha hello.',
    globalNote: 'No match here.',
    alternateGreetings: ['Alternate Alpha greeting.', 'Secondary hello.'],
    groupOnlyGreetings: ['Read-only alpha group greeting.'],
    lorebook: [
      {
        comment: 'Bridge lore',
        key: 'bridge',
        content: 'Lore alpha entry.',
      },
      {
        comment: 'Quiet lore',
        key: 'quiet',
        content: 'Nothing interesting.',
      },
    ],
  };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function startTestApiServer(
  currentData: SearchFixture,
  referenceFiles: Array<{ fileName: string; data: SearchFixture }> = [],
) {
  const modulePath = './mcp-api-server.ts';
  const { startApiServer } = (await import(modulePath)) as { startApiServer: StartApiServer };
  let resolvePort!: (port: number) => void;
  const portPromise = new Promise<number>((resolve) => {
    resolvePort = resolve;
  });

  const api = startApiServer({
    getCurrentData: () => currentData,
    getReferenceFiles: () => referenceFiles,
    askRendererConfirm: async () => true,
    broadcastToAll: (channel: string, ...args: unknown[]) => {
      void channel;
      void args;
    },
    broadcastMcpStatus: (payload: Record<string, unknown>) => {
      void payload;
    },
    onListening: (port) => resolvePort(port),
    parseLuaSections,
    combineLuaSections,
    detectLuaSection,
    parseCssSections,
    combineCssSections,
    detectCssSectionInline,
    detectCssBlockOpen,
    detectCssBlockClose,
    normalizeTriggerScripts: (data: unknown) => data,
    extractPrimaryLua: () => '',
    mergePrimaryLua: (scripts: unknown, lua: string) => {
      void lua;
      return scripts;
    },
    stringifyTriggerScripts: (scripts: unknown) => JSON.stringify(scripts),
    getSkillsDir: () => path.join(__dirname, '..', '..', 'skills'),
  });

  const port = await portPromise;
  return { ...api, port };
}

async function postJson<T>(
  port: number,
  token: string,
  urlPath: string,
  body: unknown,
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf-8');
            resolve({
              status: res.statusCode ?? 0,
              data: JSON.parse(raw) as T,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Request timeout')));
    req.write(payload);
    req.end();
  });
}

async function getJson<T>(port: number, token: string, urlPath: string): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf-8');
            resolve({
              status: res.statusCode ?? 0,
              data: JSON.parse(raw) as T,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Request timeout')));
    req.end();
  });
}

function mapSurfacesByTarget(surfaces: SearchSurface[]) {
  return new Map(surfaces.map((surface) => [surface.target, surface]));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_DIR = path.join(__dirname, '..', '..', 'test', '_mcp-api-server-tmp');

beforeAll(async () => {
  await fs.promises.mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
});

describe('MCP API search routes', () => {
  it('keeps the existing authenticated POST /field/:name/search route working', async () => {
    const api = await startTestApiServer(createSearchFixture());

    try {
      const response = await postJson<{
        field: string;
        query: string;
        totalMatches: number;
        returnedMatches: number;
        matches: Array<{ match: string }>;
      }>(api.port, api.token, '/field/description/search', {
        query: 'alpha',
        context_chars: 12,
        max_matches: 5,
      });

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        field: 'description',
        query: 'alpha',
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'Alpha' }],
      });
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns structured JSON search results instead of the 404 MCP fallback', async () => {
    const api = await startTestApiServer(createSearchFixture());

    try {
      const response = await postJson<Record<string, unknown>>(api.port, api.token, '/search-all', {
        query: 'alpha',
        include_lorebook: true,
        include_greetings: true,
        context_chars: 12,
        max_matches_per_field: 5,
      });

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        query: 'alpha',
        regex: false,
        contextChars: 12,
        maxMatchesPerSurface: 5,
        totalMatches: 5,
      });

      const surfaces = (response.data.surfaces ?? []) as SearchSurface[];
      expect(surfaces).toHaveLength(5);
      expect(surfaces.map((surface) => surface.target).sort()).toEqual(
        [
          'field:description',
          'field:firstMessage',
          'greeting:alternate:0',
          'greeting:groupOnly:0',
          'lorebook:0',
        ].sort(),
      );

      const surfacesByTarget = mapSurfacesByTarget(surfaces);

      expect(surfacesByTarget.get('field:description')).toMatchObject({
        surfaceType: 'field',
        target: 'field:description',
        field: 'description',
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'Alpha' }],
      });
      expect(surfacesByTarget.get('field:firstMessage')).toMatchObject({
        surfaceType: 'field',
        target: 'field:firstMessage',
        field: 'firstMessage',
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'alpha' }],
      });
      expect(surfacesByTarget.get('greeting:alternate:0')).toMatchObject({
        surfaceType: 'greeting',
        target: 'greeting:alternate:0',
        field: 'alternateGreetings',
        greetingType: 'alternate',
        index: 0,
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'Alpha' }],
      });
      expect(surfacesByTarget.get('greeting:groupOnly:0')).toMatchObject({
        surfaceType: 'greeting',
        target: 'greeting:groupOnly:0',
        field: 'groupOnlyGreetings',
        greetingType: 'groupOnly',
        index: 0,
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'alpha' }],
      });
      expect(surfacesByTarget.get('lorebook:0')).toMatchObject({
        surfaceType: 'lorebook',
        target: 'lorebook:0',
        index: 0,
        comment: 'Bridge lore',
        key: 'bridge',
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'alpha' }],
      });
    } finally {
      await closeServer(api.server);
    }
  });

  it('ignores non-string flags values instead of turning them into misleading regex errors', async () => {
    const api = await startTestApiServer(createSearchFixture());

    try {
      const response = await postJson<Record<string, unknown>>(api.port, api.token, '/search-all', {
        query: 'alpha',
        flags: 123,
        include_lorebook: true,
        include_greetings: true,
      });

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        query: 'alpha',
        regex: false,
        totalMatches: 5,
      });
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API lorebook folder mutations', () => {
  it('creates canonical key uuids for folder entries added through /lorebook/add', async () => {
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
      expect(currentData.lorebook?.[0]?.key).toMatch(UUID_RE);
    } finally {
      await closeServer(api.server);
    }
  });

  it('creates canonical key uuids for folder entries added through /lorebook/batch-add', async () => {
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
      expect(currentData.lorebook?.[0]?.key).toMatch(UUID_RE);
      expect(currentData.lorebook?.[1]?.key).toBe('');
      expect(currentData.lorebook?.[2]?.key).toMatch(UUID_RE);
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
        key: 'legacy-folder-uuid',
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
      lorebook: [{ comment: 'Folder A', mode: 'folder', key: 'folder-uuid-1', content: '', folder: '' }],
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
      expect(currentData.lorebook?.[1]?.key).toMatch(UUID_RE);
      expect(currentData.lorebook?.[1]?.key).not.toBe('folder-uuid-1');
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

describe('MCP API lorebook folder reads', () => {
  it('returns canonical folder identity from lorebook read endpoints', async () => {
    const currentData: SearchFixture = {
      lorebook: [
        { comment: 'Folder A', mode: 'folder', key: '', id: 'legacy-folder-id', content: '' },
        { comment: 'Folder B', mode: 'folder', key: 'canonical-folder-uuid', id: 'legacy-folder-id-b', content: '' },
        { comment: 'Child B', mode: 'normal', key: '', folder: 'folder:legacy-folder-id-b', content: 'child' },
      ],
    };
    const api = await startTestApiServer(currentData);

    try {
      const single = await getJson<{ entry: { key: string; folder?: string } }>(api.port, api.token, '/lorebook/0');
      expect(single.status).toBe(200);
      expect(single.data.entry.key).toBe('legacy-folder-id');

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
            { comment: 'Folder A', mode: 'folder', key: 'canonical-folder-uuid', id: 'legacy-folder-id', content: '' },
            { comment: 'Child A', mode: 'normal', key: '', folder: 'folder:legacy-folder-id', content: 'child' },
          ],
        },
      },
    ];
    const api = await startTestApiServer({ lorebook: [] }, referenceFiles);

    try {
      const single = await getJson<{ entry: { key: string } }>(api.port, api.token, '/reference/0/lorebook/0');
      expect(single.status).toBe(200);
      expect(single.data.entry.key).toBe('canonical-folder-uuid');

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
