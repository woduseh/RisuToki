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
    activationPercent?: number;
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
  skillsDir?: string,
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
    getSkillsDir: () => skillsDir ?? path.join(__dirname, '..', '..', 'skills'),
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

async function writeSkillFixture(rootDir: string, skillName: string, files: Record<string, string>): Promise<void> {
  const skillDir = path.join(rootDir, skillName);
  await fs.promises.mkdir(skillDir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([fileName, content]) =>
      fs.promises.writeFile(path.join(skillDir, fileName), content, 'utf-8'),
    ),
  );
}

const FOLDER_UUID_RE = /^folder:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

describe('MCP API risum asset compatibility', () => {
  it('stores risum asset metadata with ext semantics and x-risu-asset card type on add', async () => {
    const currentData: SearchFixture = {
      _fileType: 'charx',
      risumAssets: [],
      cardAssets: [],
      _moduleData: {
        module: {
          assets: [],
        },
      },
    };
    const api = await startTestApiServer(currentData);

    try {
      const response = await postJson<{ ok: boolean; index: number; name: string; size: number }>(
        api.port,
        api.token,
        '/risum-asset/add',
        {
          name: 'themeAudio',
          path: 'assets/audio/theme.mp3',
          base64: Buffer.from('fake-audio').toString('base64'),
        },
      );

      expect(response.status).toBe(200);
      expect((currentData._moduleData as { module: { assets: string[][] } }).module.assets).toEqual([
        ['themeAudio', '', 'mp3'],
      ]);
      expect(currentData.cardAssets).toEqual([
        {
          type: 'x-risu-asset',
          uri: 'embeded://assets/audio/theme.mp3',
          name: 'themeAudio',
          ext: 'mp3',
        },
      ]);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API risup prompt-item routes', () => {
  function createRisupFixture(): SearchFixture {
    return {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'chats']),
      presetBias: '[["hello",5]]',
      localStopStrings: '["END"]',
    };
  }

  it('lists prompt items with type/supported/preview metadata', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{
        count: number;
        state: string;
        hasUnsupportedContent: boolean;
        items: Array<{ index: number; type: string; supported: boolean; preview: string }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(3);
      expect(res.data.state).toBe('valid');
      expect(res.data.hasUnsupportedContent).toBe(false);
      expect(res.data.items).toHaveLength(3);
      expect(res.data.items[0]).toMatchObject({ index: 0, type: 'plain', supported: true });
      expect(res.data.items[1]).toMatchObject({ index: 1, type: 'chat', supported: true });
      expect(res.data.items[2]).toMatchObject({ index: 2, type: 'lorebook', supported: true });
      expect(typeof res.data.items[0].preview).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('exposes unsupported items with metadata in list', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'unknowntype', foo: 'bar' },
        { type: 'plain', type2: 'normal', text: 'Hello', role: 'system' },
      ]),
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        hasUnsupportedContent: boolean;
        items: Array<{ supported: boolean; type: string | null }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(200);
      expect(res.data.hasUnsupportedContent).toBe(true);
      expect(res.data.items[0].supported).toBe(false);
      expect(res.data.items[0].type).toBe('unknowntype');
      expect(res.data.items[1].supported).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('reads one prompt item by index', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{
        index: number;
        item: Record<string, unknown>;
        supported: boolean;
        type: string;
      }>(api.port, api.token, '/risup/prompt-item/0');
      expect(res.status).toBe(200);
      expect(res.data.index).toBe(0);
      expect(res.data.supported).toBe(true);
      expect(res.data.type).toBe('plain');
      expect(res.data.item).toMatchObject({ type: 'plain', text: 'Hello world' });
    } finally {
      await closeServer(api.server);
    }
  });

  it('writes one prompt item and mutates currentData.promptTemplate', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const newItem = { type: 'plain', type2: 'normal', text: 'Updated text', role: 'user' };
      const res = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/risup/prompt-item/0', {
        item: newItem,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(0);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed[0].text).toBe('Updated text');
      expect(parsed[0].role).toBe('user');
    } finally {
      await closeServer(api.server);
    }
  });

  it('adds a new prompt item', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const newItem = { type: 'jailbreak', type2: 'normal', text: 'New jailbreak', role: 'system' };
      const res = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/risup/prompt-item/add', {
        item: newItem,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(3);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(4);
      expect(parsed[3].type).toBe('jailbreak');
    } finally {
      await closeServer(api.server);
    }
  });

  it('deletes a prompt item', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; deleted: number }>(
        api.port,
        api.token,
        '/risup/prompt-item/1/delete',
        {},
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.deleted).toBe(1);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(2);
      expect(parsed[0].type).toBe('plain');
      expect(parsed[1].type).toBe('lorebook');
    } finally {
      await closeServer(api.server);
    }
  });

  it('reorders prompt items', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; order: number[] }>(
        api.port,
        api.token,
        '/risup/prompt-item/reorder',
        { order: [2, 0, 1] },
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.order).toEqual([2, 0, 1]);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed[0].type).toBe('lorebook'); // was index 2
      expect(parsed[1].type).toBe('plain'); // was index 0
      expect(parsed[2].type).toBe('chat'); // was index 1
    } finally {
      await closeServer(api.server);
    }
  });

  it('reads the formating order', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{
        state: string;
        items: Array<{ index: number; token: string; known: boolean }>;
      }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      expect(res.data.state).toBe('valid');
      expect(res.data.items).toHaveLength(3);
      expect(res.data.items[0]).toMatchObject({ index: 0, token: 'main', known: true });
      expect(res.data.items[1]).toMatchObject({ index: 1, token: 'description', known: true });
      expect(res.data.items[2]).toMatchObject({ index: 2, token: 'chats', known: true });
    } finally {
      await closeServer(api.server);
    }
  });

  it('writes the formating order', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; count: number }>(api.port, api.token, '/risup/formating-order', {
        items: [{ token: 'chats' }, { token: 'main' }, { token: 'lorebook' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.count).toBe(3);
      const parsed = JSON.parse(currentData.formatingOrder as string) as string[];
      expect(parsed).toEqual(['chats', 'main', 'lorebook']);
    } finally {
      await closeServer(api.server);
    }
  });

  it('accepts unknown string tokens in formating-order write', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; count: number }>(api.port, api.token, '/risup/formating-order', {
        items: [{ token: 'main' }, { token: 'customUnknownToken' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const parsed = JSON.parse(currentData.formatingOrder as string) as string[];
      expect(parsed).toContain('customUnknownToken');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 for invalid prompt item index (GET)', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{ error: string }>(api.port, api.token, '/risup/prompt-item/99');
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 for invalid prompt item index (POST write)', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/prompt-item/99', {
        item: { type: 'plain', type2: 'normal', text: 'x', role: 'system' },
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when writing unsupported item type', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/prompt-item/0', {
        item: { type: 'unknowntype', foo: 'bar' },
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when adding unsupported item type', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/prompt-item/add', {
        item: { type: 'unknowntype', foo: 'bar' },
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when current promptTemplate is invalid JSON', async () => {
    const data: SearchFixture = { _fileType: 'risup', promptTemplate: 'NOT_VALID_JSON', formatingOrder: '[]' };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{ error: string; details?: { parseError: string } }>(
        api.port,
        api.token,
        '/risup/prompt-items',
      );
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when current formatingOrder is invalid JSON', async () => {
    const data: SearchFixture = { _fileType: 'risup', promptTemplate: '[]', formatingOrder: 'NOT_VALID_JSON' };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{ error: string }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when current formatingOrder contains mixed-type entries', async () => {
    const data: SearchFixture = { _fileType: 'risup', promptTemplate: '[]', formatingOrder: '["main", 42, "chats"]' };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{ error: string }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 for non-risup file type', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await getJson<{ error: string }>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when formating-order items contain non-string tokens', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/formating-order', {
        items: [{ token: 'main' }, { token: 123 }],
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 for invalid reorder (wrong length)', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/prompt-item/reorder', {
        order: [0, 1], // only 2, but there are 3 items
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects generic field writes with invalid promptTemplate JSON shape', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/promptTemplate', {
        content: '{"broken":true}',
      });

      expect(res.status).toBe(400);
      expect(currentData.promptTemplate).toBe(createRisupFixture().promptTemplate);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects generic field writes with mixed-type formatingOrder arrays', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/formatingOrder', {
        content: '["main", 42]',
      });

      expect(res.status).toBe(400);
      expect(currentData.formatingOrder).toBe(createRisupFixture().formatingOrder);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects batch field writes when promptTemplate is not a valid JSON array', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/batch-write', {
        entries: [
          {
            field: 'promptTemplate',
            content: '{"broken":true}',
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(currentData.promptTemplate).toBe(createRisupFixture().promptTemplate);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects batch field writes when formatingOrder is not a string JSON array', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/batch-write', {
        entries: [
          {
            field: 'formatingOrder',
            content: ['main', 'description'],
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(currentData.formatingOrder).toBe(createRisupFixture().formatingOrder);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects generic field writes with invalid presetBias pair shapes', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/presetBias', {
        content: '[["hello"]]',
      });

      expect(res.status).toBe(400);
      expect(currentData.presetBias).toBe(createRisupFixture().presetBias);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects generic field writes with non-string localStopStrings entries', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/localStopStrings', {
        content: '["END", 42]',
      });

      expect(res.status).toBe(400);
      expect(currentData.localStopStrings).toBe(createRisupFixture().localStopStrings);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects batch field writes when presetBias entries are not [string, number] pairs', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/batch-write', {
        entries: [
          {
            field: 'presetBias',
            content: '[["hello"]]',
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(currentData.presetBias).toBe(createRisupFixture().presetBias);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects batch field writes when localStopStrings contains non-string entries', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/batch-write', {
        entries: [
          {
            field: 'localStopStrings',
            content: '["END", 42]',
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(currentData.localStopStrings).toBe(createRisupFixture().localStopStrings);
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

describe('MCP API skills routes', () => {
  it('lists custom skills with parsed additive metadata', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-metadata');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'reference-skill', {
      'SKILL.md': `---
name: reference-skill
description: 'Reference skill for tests'
tags: ["reference", "metadata"]
related_tools: ["list_lorebook", "read_lorebook"]
---

# Reference Skill
`,
      'REFERENCE.md': '# More detail\n',
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);

    try {
      const response = await getJson<{
        count: number;
        skills: Array<{
          name: string;
          description: string;
          tags: string[];
          relatedTools: string[];
          files: string[];
        }>;
      }>(api.port, api.token, '/skills');

      expect(response.status).toBe(200);
      expect(response.data.count).toBe(1);
      expect(response.data.skills).toEqual([
        {
          name: 'reference-skill',
          description: 'Reference skill for tests',
          tags: ['reference', 'metadata'],
          relatedTools: ['list_lorebook', 'read_lorebook'],
          files: ['REFERENCE.md', 'SKILL.md'],
        },
      ]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('defaults missing additive metadata to empty arrays', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-defaults');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'minimal-skill', {
      'SKILL.md': `---
name: minimal-skill
description: 'Minimal frontmatter'
---

# Minimal Skill
`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);

    try {
      const response = await getJson<{
        count: number;
        skills: Array<{
          name: string;
          description: string;
          tags: string[];
          relatedTools: string[];
          files: string[];
        }>;
      }>(api.port, api.token, '/skills');

      expect(response.status).toBe(200);
      expect(response.data.skills).toEqual([
        {
          name: 'minimal-skill',
          description: 'Minimal frontmatter',
          tags: [],
          relatedTools: [],
          files: ['SKILL.md'],
        },
      ]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('parses YAML flow arrays that use single-quoted strings', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-yaml-flow');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'yaml-flow-skill', {
      'SKILL.md': `---
name: yaml-flow-skill
description: 'Parses YAML flow arrays'
tags: ['workflow', 'metadata']
related_tools: ['search_all_fields', 'write_field_batch']
---

# YAML Flow Skill
`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);

    try {
      const response = await getJson<{
        count: number;
        skills: Array<{
          name: string;
          description: string;
          tags: string[];
          relatedTools: string[];
          files: string[];
        }>;
      }>(api.port, api.token, '/skills');

      expect(response.status).toBe(200);
      expect(response.data.skills).toEqual([
        {
          name: 'yaml-flow-skill',
          description: 'Parses YAML flow arrays',
          tags: ['workflow', 'metadata'],
          relatedTools: ['search_all_fields', 'write_field_batch'],
          files: ['SKILL.md'],
        },
      ]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('discovers the extracted built-in reference skills', async () => {
    const api = await startTestApiServer(createSearchFixture());

    try {
      const response = await getJson<{
        count: number;
        skills: Array<{
          name: string;
          tags: string[];
          relatedTools: string[];
        }>;
      }>(api.port, api.token, '/skills');

      expect(response.status).toBe(200);
      expect(response.data.count).toBeGreaterThan(0);
      expect(response.data.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'file-structure-reference',
            tags: expect.arrayContaining(['reference', 'charx']),
            relatedTools: expect.arrayContaining(['list_fields', 'read_field']),
          }),
          expect.objectContaining({
            name: 'using-mcp-tools',
            tags: expect.arrayContaining(['workflow', 'mcp']),
            relatedTools: expect.arrayContaining(['search_all_fields', 'write_field_batch']),
          }),
          expect.objectContaining({
            name: 'writing-danbooru-tags',
            tags: expect.arrayContaining(['danbooru', 'assets']),
            relatedTools: expect.arrayContaining(['validate_danbooru_tags', 'search_danbooru_tags']),
          }),
        ]),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('reads specific skill files and blocks path traversal', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-read');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'reference-skill', {
      'SKILL.md': `---
name: reference-skill
description: 'Reference skill for file reads'
---

# Reference Skill
`,
      'REFERENCE.md': '# Reference appendix\n',
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);

    try {
      const detail = await getJson<{
        skill: string;
        file: string;
        content: string;
      }>(api.port, api.token, '/skills/reference-skill/REFERENCE.md');

      expect(detail.status).toBe(200);
      expect(detail.data).toMatchObject({
        skill: 'reference-skill',
        file: 'REFERENCE.md',
      });
      expect(detail.data.content).toContain('# Reference appendix');

      const blocked = await getJson<{ error: string }>(
        api.port,
        api.token,
        '/skills/reference-skill/..%2F..%2Fpackage.json',
      );

      expect(blocked.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });
});
