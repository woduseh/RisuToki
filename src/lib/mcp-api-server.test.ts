// @vitest-environment node
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openCharx, openRisum, openRisup, saveCharx, saveRisum, saveRisup, type CharxData } from '../charx-io';
import { resolveSkillRootDirs } from './content-roots';
import { parsePromptTemplate, parsePromptTemplateFromText, serializePromptTemplateToText } from './risup-prompt-model';

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

function openExternalDocumentForTest(filePath: string): CharxData {
  if (filePath.endsWith('.risum')) return openRisum(filePath);
  if (filePath.endsWith('.risup')) return openRisup(filePath);
  return openCharx(filePath);
}

function saveExternalDocumentForTest(filePath: string, data: SearchFixture | CharxData): void {
  if (filePath.endsWith('.risum')) {
    saveRisum(filePath, data as unknown as CharxData);
    return;
  }
  if (filePath.endsWith('.risup')) {
    saveRisup(filePath, data as unknown as CharxData);
    return;
  }
  saveCharx(filePath, data as unknown as CharxData);
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
  regex?: Array<{
    comment?: string;
    type?: string;
    find?: string;
    replace?: string;
    in?: string | string[];
    out?: string | string[];
    flag?: string;
    ableFlag?: string;
  }>;
  [key: string]: unknown;
}

type StartApiServer = typeof import('./mcp-api-server').startApiServer;

interface SearchSurface {
  target: string;
  [key: string]: unknown;
}

interface TestPendingRecoveryStatus {
  autosavePath: string;
  dirtyFields: string[];
  sourceFilePath: string;
  staleWarning: string | null;
}

interface TestLastRestoredStatus {
  appVersion: string;
  autosavePath: string;
  dirtyFields: string[];
  savedAt: string;
  sourceFilePath: string | null;
  sourceFileType: 'charx' | 'risum' | 'risup';
}

interface TestRendererSessionStatus {
  autosaveDir: string;
  autosaveEnabled: boolean;
  autosaveInterval: number;
  dirtyFieldCount: number;
  dirtyFields: string[];
  documentSwitchInProgress: boolean;
  hasUnsavedChanges: boolean;
}

interface TestSessionStatus {
  currentFilePath: string | null;
  currentFileType: 'charx' | 'risum' | 'risup' | null;
  lastRestored: TestLastRestoredStatus | null;
  pendingRecovery: TestPendingRecoveryStatus | null;
  renderer: TestRendererSessionStatus | null;
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

function createExternalCharxFixture(overrides: Partial<CharxData> = {}): { dir: string; filePath: string } {
  const dir = fs.mkdtempSync(path.join(TEST_DIR, 'external-charx-'));
  const filePath = path.join(dir, 'external.charx');
  const data = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'External Char',
    description: 'External description text.',
    personality: '',
    scenario: '',
    creatorcomment: '',
    tags: [],
    exampleMessage: '',
    systemPrompt: '',
    creator: '',
    characterVersion: '1.0.0',
    nickname: '',
    source: [],
    creationDate: 0,
    modificationDate: 0,
    additionalText: '',
    license: '',
    firstMessage: 'Hello external.',
    alternateGreetings: ['Alt external'],
    groupOnlyGreetings: ['Group external'],
    globalNote: 'External note.',
    css: '/* section: main */',
    defaultVariables: 'mode=external',
    lua: '-- ===== main =====\nprint("external")\n',
    triggerScripts: [
      {
        comment: 'main',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: '-- ===== main =====\nprint("external")\n' }],
        lowLevelAccess: false,
      },
    ],
    lorebook: [
      {
        comment: 'External Lore',
        key: 'alpha',
        secondkey: '',
        content: 'Lore body',
        insertorder: 100,
        alwaysActive: false,
        selective: false,
        mode: 'normal',
      },
    ],
    regex: [{ comment: 'External Regex', type: 'editoutput', find: 'foo', replace: 'bar', flag: 'g' }],
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    _risuExt: {},
    _card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {},
    },
    ...overrides,
  } as CharxData;
  saveCharx(filePath, data);
  return { dir, filePath };
}

function createExternalRisumFixture(overrides: SearchFixture = {}): { dir: string; filePath: string } {
  const dir = fs.mkdtempSync(path.join(TEST_DIR, 'external-risum-'));
  const filePath = path.join(dir, 'external.risum');
  saveRisum(filePath, {
    _fileType: 'risum',
    name: 'External Module',
    description: 'Module description',
    moduleName: 'External Module',
    moduleNamespace: 'external.module',
    lowLevelAccess: false,
    hideIcon: false,
    lorebook: [],
    regex: [],
    ...overrides,
  } as unknown as CharxData);
  return { dir, filePath };
}

function createExternalRisupFixture(overrides: SearchFixture = {}): { dir: string; filePath: string } {
  const dir = fs.mkdtempSync(path.join(TEST_DIR, 'external-risup-'));
  const filePath = path.join(dir, 'external.risup');
  saveRisup(filePath, {
    _fileType: 'risup',
    name: 'External Preset',
    promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', text: 'External preset', role: 'system' }]),
    formatingOrder: JSON.stringify(['main', 'description']),
    presetBias: '[]',
    localStopStrings: '[]',
    ...overrides,
  } as unknown as CharxData);
  return { dir, filePath };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

interface TestDepsOverrides {
  getSessionStatus?: () => TestSessionStatus;
  parseLuaSections?: (lua: string) => Array<{ name: string; content: string }>;
  parseCssSections?: (css: string) => {
    sections: Array<{ name: string; content: string }>;
    prefix: string;
    suffix: string;
  };
  openExternalDocument?: (filePath: string) => CharxData;
  userDataPath?: string;
  broadcastToAll?: (channel: string, ...args: unknown[]) => void;
  requestRendererOpenFile?: (request: {
    filePath: string;
    fileType: 'charx' | 'risum' | 'risup';
    saveCurrent: boolean;
    targetLabel: string;
  }) => Promise<{
    success: boolean;
    alreadyOpen?: boolean;
    canceled?: boolean;
    error?: string;
    filePath?: string;
    fileType?: 'charx' | 'risum' | 'risup';
    name?: string;
    suggestion?: string;
  }>;
}

async function startTestApiServer(
  currentData: SearchFixture | null,
  referenceFiles: Array<{ fileName: string; data: SearchFixture }> = [],
  skillRoots?: string | string[],
  overrides?: TestDepsOverrides,
) {
  let activeData: SearchFixture | CharxData | null = currentData;
  let activeFilePath: string | null = overrides?.getSessionStatus?.().currentFilePath ?? null;
  const modulePath = './mcp-api-server.ts';
  const { startApiServer } = (await import(modulePath)) as { startApiServer: StartApiServer };
  let resolvePort!: (port: number) => void;
  const portPromise = new Promise<number>((resolve) => {
    resolvePort = resolve;
  });

  const api = startApiServer({
    getCurrentData: () => activeData,
    getReferenceFiles: () => referenceFiles,
    askRendererConfirm: async () => true,
    requestRendererOpenFile:
      overrides?.requestRendererOpenFile ??
      (async (request) => {
        activeData = openExternalDocumentForTest(request.filePath);
        activeFilePath = request.filePath;
        const openedName =
          activeData && typeof activeData === 'object' && 'name' in activeData
            ? String((activeData as { name?: unknown }).name || 'Untitled')
            : 'Untitled';
        return {
          success: true,
          filePath: request.filePath,
          fileType: request.fileType,
          name: openedName,
        };
      }),
    broadcastToAll:
      overrides?.broadcastToAll ??
      ((channel: string, ...args: unknown[]) => {
        void channel;
        void args;
      }),
    broadcastMcpStatus: (payload: Record<string, unknown>) => {
      void payload;
    },
    onListening: (port) => resolvePort(port),
    parseLuaSections: overrides?.parseLuaSections ?? parseLuaSections,
    combineLuaSections,
    detectLuaSection,
    parseCssSections: overrides?.parseCssSections ?? parseCssSections,
    combineCssSections,
    detectCssSectionInline,
    detectCssBlockOpen,
    detectCssBlockClose,
    openExternalDocument: overrides?.openExternalDocument ?? openExternalDocumentForTest,
    saveExternalDocument: (filePath: string, _fileType: 'charx' | 'risum' | 'risup', data: SearchFixture | CharxData) =>
      saveExternalDocumentForTest(filePath, data),
    normalizeTriggerScripts: (data: unknown) => data,
    extractPrimaryLua: () => '',
    mergePrimaryLua: (scripts: unknown, lua: string) => {
      void lua;
      return scripts;
    },
    stringifyTriggerScripts: (scripts: unknown) => JSON.stringify(scripts),
    getSkillRoots: () =>
      Array.isArray(skillRoots)
        ? skillRoots
        : skillRoots
          ? [skillRoots]
          : resolveSkillRootDirs(path.join(__dirname, '..', '..')).map((root) => root.absolutePath),
    getUserDataPath: () => overrides?.userDataPath ?? path.join(os.tmpdir(), 'risutoki-mcp-api-test-user-data'),
    getCurrentFilePath: () => activeFilePath,
    getSessionStatus:
      overrides?.getSessionStatus ??
      (() => ({
        currentFilePath: null,
        currentFileType: null,
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      })),
  } as Parameters<StartApiServer>[0]);

  api.invalidateSectionCaches();
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
        operations: [{ op: 'replace', path: '/regex/0/comment', value: 'External New' }],
      });
      expect(patched.status).toBe(200);
      expect(patched.data.success).toBe(true);
      expect((openCharx(fixture.filePath) as unknown as SearchFixture).regex?.[0]?.comment).toBe('External New');
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

describe('MCP API external unopened-file routes', () => {
  it('inspects unopened charx files and exposes missing probe surfaces', async () => {
    const fixture = createExternalCharxFixture();
    const api = await startTestApiServer(null, [], undefined, {
      parseLuaSections: (lua) => [{ name: 'main', content: lua }],
      parseCssSections: (css) => ({ sections: [{ name: 'main', content: css }], prefix: '', suffix: '' }),
    });

    try {
      const inspect = await postJson<Record<string, unknown>>(api.port, api.token, '/external/inspect', {
        file_path: fixture.filePath,
      });
      expect(inspect.status).toBe(200);
      expect(inspect.data).toMatchObject({
        file_path: fixture.filePath,
        file_type: 'charx',
        name: 'External Char',
      });
      expect(inspect.data.surfaceCounts).toMatchObject({
        lorebook: 1,
        regex: 1,
        alternateGreetings: 1,
        groupOnlyGreetings: 1,
        triggerScripts: 1,
        cssSections: 1,
        luaSections: 1,
      });

      const css = await postJson<{ count: number }>(api.port, api.token, '/probe/css', {
        file_path: fixture.filePath,
      });
      expect(css.status).toBe(200);
      expect(css.data.count).toBe(1);

      const greetings = await postJson<{ type: string; count: number }>(
        api.port,
        api.token,
        '/probe/greetings/alternate',
        {
          file_path: fixture.filePath,
        },
      );
      expect(greetings.status).toBe(200);
      expect(greetings.data).toMatchObject({ type: 'alternate', count: 1 });

      const triggers = await postJson<{ count: number }>(api.port, api.token, '/probe/triggers', {
        file_path: fixture.filePath,
      });
      expect(triggers.status).toBe(200);
      expect(triggers.data.count).toBe(1);
    } finally {
      await closeServer(api.server);
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('probes unopened risup prompt items and formating order', async () => {
    const fixture = createExternalRisupFixture();
    const api = await startTestApiServer(null);

    try {
      const promptItems = await postJson<{ count: number; state: string }>(
        api.port,
        api.token,
        '/probe/risup/prompt-items',
        {
          file_path: fixture.filePath,
        },
      );
      expect(promptItems.status).toBe(200);
      expect(promptItems.data).toMatchObject({ count: 1, state: 'valid' });

      const formatingOrder = await postJson<{ state: string; items: Array<{ token: string }> }>(
        api.port,
        api.token,
        '/probe/risup/formating-order',
        {
          file_path: fixture.filePath,
        },
      );
      expect(formatingOrder.status).toBe(200);
      expect(formatingOrder.data.state).toBe('valid');
      expect(formatingOrder.data.items.map((item) => item.token)).toEqual(['main', 'description']);
    } finally {
      await closeServer(api.server);
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('writes unopened charx structured fields and persists them to disk', async () => {
    const fixture = createExternalCharxFixture();
    const api = await startTestApiServer(null);

    try {
      const response = await postJson<{ success: boolean; field: string; newSize: number }>(
        api.port,
        api.token,
        '/external/field/groupOnlyGreetings',
        {
          file_path: fixture.filePath,
          content: ['Group external', 'Second group line'],
        },
      );
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({ success: true, field: 'groupOnlyGreetings', newSize: 2 });

      const reopened = openCharx(fixture.filePath);
      expect(reopened.groupOnlyGreetings).toEqual(['Group external', 'Second group line']);
    } finally {
      await closeServer(api.server);
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('writes unopened risum and risup files without switching the active document', async () => {
    const risumFixture = createExternalRisumFixture();
    const risupFixture = createExternalRisupFixture();
    const api = await startTestApiServer(null);

    try {
      const risumRes = await postJson<{ success: boolean; updated: Array<{ field: string }> }>(
        api.port,
        api.token,
        '/external/field/batch-write',
        {
          file_path: risumFixture.filePath,
          entries: [
            { field: 'moduleName', content: 'Updated Module' },
            { field: 'lowLevelAccess', content: true },
          ],
        },
      );
      expect(risumRes.status).toBe(200);
      expect(risumRes.data.success).toBe(true);
      expect(risumRes.data.updated.map((entry) => entry.field)).toEqual(['moduleName', 'lowLevelAccess']);

      const reopenedRisum = openRisum(risumFixture.filePath);
      expect(reopenedRisum.moduleName).toBe('Updated Module');
      expect(reopenedRisum.lowLevelAccess).toBe(true);

      const risupRes = await postJson<{ success: boolean; field: string }>(
        api.port,
        api.token,
        '/external/field/formatingOrder',
        {
          file_path: risupFixture.filePath,
          content: '["main","chats"]',
        },
      );
      expect(risupRes.status).toBe(200);
      expect(risupRes.data).toMatchObject({ success: true, field: 'formatingOrder' });

      const reopenedRisup = openRisup(risupFixture.filePath);
      expect(reopenedRisup.formatingOrder).toBe('["main","chats"]');
    } finally {
      await closeServer(api.server);
      fs.rmSync(risumFixture.dir, { recursive: true, force: true });
      fs.rmSync(risupFixture.dir, { recursive: true, force: true });
    }
  });

  it('rejects external writes when the target file is already active in the UI session', async () => {
    const fixture = createExternalCharxFixture();
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: fixture.filePath,
        currentFileType: 'charx',
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      }),
    });

    try {
      const response = await postJson<Record<string, unknown>>(api.port, api.token, '/external/field/description', {
        file_path: fixture.filePath,
        content: 'Should be blocked',
      });
      expect(response.status).toBe(409);
      expect(response.data).toMatchObject({
        error: 'The requested file is already open in the UI session.',
        target: 'external:field:description',
      });
    } finally {
      await closeServer(api.server);
      fs.rmSync(fixture.dir, { recursive: true, force: true });
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

  function createPlainSnippetText(text: string): string {
    return serializePromptTemplateToText(
      parsePromptTemplate(JSON.stringify([{ type: 'plain', type2: 'normal', text, role: 'system' }])),
    );
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

  it('batch-reads prompt items and preserves nulls for invalid indices', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{
        count: number;
        total: number;
        entries: Array<{ index: number; type: string | null; supported: boolean } | null>;
      }>(api.port, api.token, '/risup/prompt-item/batch', {
        indices: [0, 99, 2],
      });
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(2);
      expect(res.data.total).toBe(3);
      expect(res.data.entries[0]).toMatchObject({ index: 0, type: 'plain', supported: true });
      expect(res.data.entries[1]).toBeNull();
      expect(res.data.entries[2]).toMatchObject({ index: 2, type: 'lorebook', supported: true });
    } finally {
      await closeServer(api.server);
    }
  });

  it('searches prompt items by substring across text-bearing fields', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{
        count: number;
        matches: Array<{ index: number; matched_fields: string[] }>;
      }>(api.port, api.token, '/risup/prompt-items/search', {
        query: 'hello',
      });
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.matches[0].index).toBe(0);
      expect(res.data.matches[0].matched_fields).toContain('text');
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

  it('batch-writes multiple prompt items in one request', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; count: number }>(
        api.port,
        api.token,
        '/risup/prompt-item/batch-write',
        {
          writes: [
            { index: 0, item: { type: 'plain', type2: 'normal', text: 'Batch updated', role: 'user' } },
            { index: 2, item: { type: 'lorebook', name: 'Lore entry' } },
          ],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.count).toBe(2);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed[0].text).toBe('Batch updated');
      expect(parsed[0].role).toBe('user');
      expect(parsed[2].type).toBe('lorebook');
      expect(parsed[2].name).toBe('Lore entry');
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

  it('batch-adds new prompt items', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; count: number; indices: number[] }>(
        api.port,
        api.token,
        '/risup/prompt-item/batch-add',
        {
          items: [
            { type: 'jailbreak', type2: 'normal', text: 'First batch item', role: 'system' },
            { type: 'persona', name: 'Batch persona' },
          ],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.count).toBe(2);
      expect(res.data.indices).toEqual([3, 4]);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(5);
      expect(parsed[3].type).toBe('jailbreak');
      expect(parsed[4].type).toBe('persona');
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

  it('diffs the current risup prompt against a reference risup preset', async () => {
    const currentData = createRisupFixture();
    const referenceData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Reference world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
      formatingOrder: JSON.stringify(['main', 'chats', 'description']),
    };
    const api = await startTestApiServer(currentData, [{ fileName: 'ref-preset.risup', data: referenceData }]);
    try {
      const res = await postJson<{
        identical: boolean;
        changedSections: string[];
        promptTemplate: { currentCount: number; linesAdded: number; linesRemoved: number };
        formatingOrder: { reordered: boolean; currentTokens: string[]; referenceTokens: string[] };
      }>(api.port, api.token, '/risup/prompt-diff', {
        refIndex: 0,
      });
      expect(res.status).toBe(200);
      expect(res.data.identical).toBe(false);
      expect(res.data.changedSections).toEqual(['promptTemplate', 'formatingOrder']);
      expect(res.data.promptTemplate.currentCount).toBe(3);
      expect(res.data.promptTemplate.linesAdded).toBeGreaterThan(0);
      expect(res.data.promptTemplate.linesRemoved).toBeGreaterThan(0);
      expect(res.data.formatingOrder.reordered).toBe(true);
      expect(res.data.formatingOrder.currentTokens).toEqual(['main', 'description', 'chats']);
      expect(res.data.formatingOrder.referenceTokens).toEqual(['main', 'chats', 'description']);
    } finally {
      await closeServer(api.server);
    }
  });

  it('exports promptTemplate to structured text', async () => {
    const currentData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello\n===\nWorld', role: 'system', customExtraField: 'keep me' },
        { id: 'legacy-unknown-1', type: 'futureType', data: { x: 1 } },
      ]),
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(currentData);
    try {
      const res = await getJson<{ count: number; hasUnsupportedContent: boolean; text: string }>(
        api.port,
        api.token,
        '/risup/prompt-text',
      );
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(2);
      expect(res.data.hasUnsupportedContent).toBe(true);
      expect(res.data.text).toContain('### [plain] ###');
      expect(res.data.text).toContain('extra-json: {"customExtraField":"keep me"}');
      expect(res.data.text).toContain('### [raw] ###');
    } finally {
      await closeServer(api.server);
    }
  });

  it('copies selected prompt items to text in the requested order', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ count: number; indices: number[]; text: string }>(
        api.port,
        api.token,
        '/risup/prompt-text/copy',
        {
          indices: [2, 0],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(2);
      expect(res.data.indices).toEqual([2, 0]);

      const parsed = parsePromptTemplateFromText(res.data.text);
      expect(parsed.state).toBe('valid');
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].type).toBe('lorebook');
      expect(parsed.items[1].type).toBe('plain');
    } finally {
      await closeServer(api.server);
    }
  });

  it('supports dry-run import for prompt text without mutating promptTemplate', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    const sourceText = serializePromptTemplateToText(
      parsePromptTemplate(
        JSON.stringify([
          { type: 'chatML', text: 'Imported', name: 'Prompt block' },
          { type: 'chat', rangeStart: 1, rangeEnd: 3 },
        ]),
      ),
    );
    try {
      const res = await postJson<{
        dry_run: boolean;
        success: boolean;
        count: number;
        orderWarnings: string[];
        items: Array<{ type: string | null }>;
      }>(api.port, api.token, '/risup/prompt-text/import', { text: sourceText, dry_run: true });
      expect(res.status).toBe(200);
      expect(res.data.dry_run).toBe(true);
      expect(res.data.success).toBe(true);
      expect(res.data.count).toBe(2);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      expect(res.data.items[0].type).toBe('chatML');
      expect(currentData.promptTemplate).toBe(createRisupFixture().promptTemplate);
    } finally {
      await closeServer(api.server);
    }
  });

  it('imports structured prompt text and replaces promptTemplate', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    const sourceItems = [
      { type: 'plain', type2: 'normal', text: 'Imported text', role: 'bot', customExtraField: 'keep me' },
      { id: 'legacy-unknown-1', type: 'futureType', data: { x: 1 } },
    ];
    const sourceText = serializePromptTemplateToText(parsePromptTemplate(JSON.stringify(sourceItems)));
    try {
      const res = await postJson<{
        success: boolean;
        count: number;
        hasUnsupportedContent: boolean;
        orderWarnings: string[];
      }>(api.port, api.token, '/risup/prompt-text/import', { text: sourceText });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.count).toBe(2);
      expect(res.data.hasUnsupportedContent).toBe(true);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toMatchObject({
        type: 'plain',
        text: 'Imported text',
        role: 'bot',
        customExtraField: 'keep me',
      });
      expect(parsed[1]).toMatchObject({ id: 'legacy-unknown-1', type: 'futureType', data: { x: 1 } });
    } finally {
      await closeServer(api.server);
    }
  });

  it('imports structured prompt text in append mode with fresh ids', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    const sourceItems = [
      { id: 'shared-id', type: 'plain', type2: 'normal', text: 'Appended text', role: 'system' },
      { id: 'legacy-unknown-1', type: 'futureType', data: { x: 1 } },
    ];
    const sourceText = serializePromptTemplateToText(parsePromptTemplate(JSON.stringify(sourceItems)));
    try {
      const res = await postJson<{
        success: boolean;
        mode: string;
        count: number;
        insertAt: number;
        orderWarnings: string[];
      }>(api.port, api.token, '/risup/prompt-text/import', { text: sourceText, mode: 'append', insertAt: 1 });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.mode).toBe('append');
      expect(res.data.count).toBe(2);
      expect(res.data.insertAt).toBe(1);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);

      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(5);
      expect(parsed[1]).toMatchObject({ type: 'plain', text: 'Appended text' });
      expect(parsed[1].id).not.toBe('shared-id');
      expect(parsed[2]).toMatchObject({ type: 'futureType', data: { x: 1 } });
      expect(parsed[2].id).not.toBe('legacy-unknown-1');
      expect(parsed[3].type).toBe('chat');
    } finally {
      await closeServer(api.server);
    }
  });

  it('saves, lists, and reads persistent risup prompt snippets', async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'risup-prompt-snippet-api-'));
    const api = await startTestApiServer(createRisupFixture(), [], undefined, { userDataPath });
    try {
      const saveRes = await postJson<{
        created: boolean;
        source: string;
        snippet: { id: string; name: string; itemCount: number };
        items: Array<{ index: number }>;
      }>(api.port, api.token, '/risup/prompt-snippets/save', {
        name: 'Intro blocks',
        indices: [0, 2],
      });
      expect(saveRes.status).toBe(200);
      expect(saveRes.data.created).toBe(true);
      expect(saveRes.data.source).toBe('indices');
      expect(saveRes.data.snippet).toMatchObject({ name: 'Intro blocks', itemCount: 2 });
      expect(saveRes.data.items).toHaveLength(2);

      const listRes = await getJson<{
        count: number;
        snippets: Array<{ id: string; name: string; itemCount: number }>;
      }>(api.port, api.token, '/risup/prompt-snippets');
      expect(listRes.status).toBe(200);
      expect(listRes.data.count).toBe(1);
      expect(listRes.data.snippets[0]).toMatchObject({ name: 'Intro blocks', itemCount: 2 });

      const readRes = await postJson<{
        count: number;
        snippet: { id: string; name: string };
        text: string;
      }>(api.port, api.token, '/risup/prompt-snippets/read', {
        identifier: saveRes.data.snippet.id,
      });
      expect(readRes.status).toBe(200);
      expect(readRes.data.snippet.name).toBe('Intro blocks');
      expect(readRes.data.count).toBe(2);

      const parsed = parsePromptTemplateFromText(readRes.data.text);
      expect(parsed.state).toBe('valid');
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].type).toBe('plain');
      expect(parsed.items[1].type).toBe('lorebook');
    } finally {
      await closeServer(api.server);
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it('supports dry-run and insertion for persistent risup prompt snippets', async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'risup-prompt-snippet-api-'));
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData, [], undefined, { userDataPath });
    try {
      const saveRes = await postJson<{ snippet: { name: string } }>(
        api.port,
        api.token,
        '/risup/prompt-snippets/save',
        {
          name: 'Single insert',
          text: createPlainSnippetText('Inserted text'),
        },
      );
      expect(saveRes.status).toBe(200);

      const dryRunRes = await postJson<{
        dry_run: boolean;
        success: boolean;
        count: number;
        insertAt: number;
        snippet: { name: string };
      }>(api.port, api.token, '/risup/prompt-snippets/insert', {
        identifier: 'Single insert',
        insertAt: 1,
        dry_run: true,
      });
      expect(dryRunRes.status).toBe(200);
      expect(dryRunRes.data.dry_run).toBe(true);
      expect(dryRunRes.data.success).toBe(true);
      expect(dryRunRes.data.count).toBe(1);
      expect(dryRunRes.data.insertAt).toBe(1);
      expect(dryRunRes.data.snippet.name).toBe('Single insert');
      expect(currentData.promptTemplate).toBe(createRisupFixture().promptTemplate);

      const insertRes = await postJson<{
        success: boolean;
        count: number;
        insertAt: number;
        snippet: { name: string };
      }>(api.port, api.token, '/risup/prompt-snippets/insert', {
        identifier: 'Single insert',
        insertAt: 1,
      });
      expect(insertRes.status).toBe(200);
      expect(insertRes.data.success).toBe(true);
      expect(insertRes.data.count).toBe(1);
      expect(insertRes.data.insertAt).toBe(1);

      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(4);
      expect(parsed[1]).toMatchObject({ type: 'plain', text: 'Inserted text' });
      expect(parsed[2].type).toBe('chat');
    } finally {
      await closeServer(api.server);
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it('deletes persistent risup prompt snippets by exact name', async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'risup-prompt-snippet-api-'));
    const api = await startTestApiServer(createRisupFixture(), [], undefined, { userDataPath });
    try {
      const saveRes = await postJson<{ snippet: { name: string } }>(
        api.port,
        api.token,
        '/risup/prompt-snippets/save',
        {
          name: 'Delete me',
          text: createPlainSnippetText('Delete me'),
        },
      );
      expect(saveRes.status).toBe(200);

      const deleteRes = await postJson<{ success: boolean; snippet: { name: string } }>(
        api.port,
        api.token,
        '/risup/prompt-snippets/delete',
        { identifier: 'Delete me' },
      );
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.data.success).toBe(true);
      expect(deleteRes.data.snippet.name).toBe('Delete me');

      const listRes = await getJson<{ count: number }>(api.port, api.token, '/risup/prompt-snippets');
      expect(listRes.status).toBe(200);
      expect(listRes.data.count).toBe(0);
    } finally {
      await closeServer(api.server);
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it('returns 400 for malformed prompt text imports', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/prompt-text/import', {
        text: '### [plain] ###\nrole: system\nbody-lines: nope\n---\nhello\n===',
      });
      expect(res.status).toBe(400);
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

describe('MCP API risup prompt stable IDs and warnings', () => {
  function createRisupFixture(): SearchFixture {
    return {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'chats']),
    };
  }

  it('GET /risup/prompt-items includes id on each item', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{
        items: Array<{ index: number; id: string | null; type: string; supported: boolean }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(200);
      for (const item of res.data.items) {
        expect(item).toHaveProperty('id');
        if (item.supported) {
          expect(typeof item.id).toBe('string');
          expect(item.id!.length).toBeGreaterThan(0);
        }
      }
    } finally {
      await closeServer(api.server);
    }
  });

  it('unsupported items expose id as null without breaking shape', async () => {
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
        items: Array<{ index: number; id: string | null; type: string | null; supported: boolean }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(200);
      expect(res.data.items[0].supported).toBe(false);
      expect(res.data.items[0].id).toBeNull();
      expect(res.data.items[0]).toHaveProperty('type');
      expect(res.data.items[0]).toHaveProperty('preview');
      expect(res.data.items[1].supported).toBe(true);
      expect(typeof res.data.items[1].id).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('GET /risup/prompt-item/:idx includes id', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{
        index: number;
        id: string | null;
        item: Record<string, unknown>;
        supported: boolean;
        type: string;
      }>(api.port, api.token, '/risup/prompt-item/0');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('id');
      expect(typeof res.data.id).toBe('string');
      expect(res.data.id!.length).toBeGreaterThan(0);
    } finally {
      await closeServer(api.server);
    }
  });

  it('add route generates id through parse/serialize flow', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const newItem = { type: 'jailbreak', type2: 'normal', text: 'JB text', role: 'system' };
      const res = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/risup/prompt-item/add', {
        item: newItem,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      // Re-read — the serialized promptTemplate should contain id via parse→serialize flow
      const listRes = await getJson<{
        items: Array<{ index: number; id: string | null }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(listRes.status).toBe(200);
      const addedItem = listRes.data.items[res.data.index];
      expect(typeof addedItem.id).toBe('string');
      expect(addedItem.id!.length).toBeGreaterThan(0);
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch add route assigns distinct generated ids to identical new items', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const newItem = { type: 'plain', type2: 'normal', text: 'Repeat me', role: 'system' };
      const res = await postJson<{ success: boolean; indices: number[] }>(
        api.port,
        api.token,
        '/risup/prompt-item/batch-add',
        {
          items: [newItem, newItem],
        },
      );
      expect(res.status).toBe(200);

      const listRes = await getJson<{
        items: Array<{ index: number; id: string | null }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(listRes.status).toBe(200);
      const firstAdded = listRes.data.items[res.data.indices[0]];
      const secondAdded = listRes.data.items[res.data.indices[1]];
      expect(typeof firstAdded.id).toBe('string');
      expect(typeof secondAdded.id).toBe('string');
      expect(firstAdded.id).not.toBe(secondAdded.id);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write route preserves provided id through parse/serialize flow', async () => {
    const currentData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { id: 'my-custom-id', type: 'plain', type2: 'normal', text: 'Original', role: 'system' },
      ]),
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/risup/prompt-item/0', {
        item: { id: 'my-custom-id', type: 'plain', type2: 'normal', text: 'Updated', role: 'system' },
      });
      expect(res.status).toBe(200);

      const readRes = await getJson<{
        id: string | null;
        item: Record<string, unknown>;
      }>(api.port, api.token, '/risup/prompt-item/0');
      expect(readRes.status).toBe(200);
      expect(readRes.data.id).toBe('my-custom-id');
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch write preserves existing ids when replacement items omit them', async () => {
    const currentData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { id: 'keep-me', type: 'plain', type2: 'normal', text: 'Original', role: 'system' },
        { id: 'keep-chat', type: 'chat', rangeStart: 0, rangeEnd: 'end' },
      ]),
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; count: number }>(
        api.port,
        api.token,
        '/risup/prompt-item/batch-write',
        {
          writes: [{ index: 0, item: { type: 'plain', type2: 'normal', text: 'Updated', role: 'user' } }],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const readRes = await getJson<{
        id: string | null;
        item: Record<string, unknown>;
      }>(api.port, api.token, '/risup/prompt-item/0');
      expect(readRes.status).toBe(200);
      expect(readRes.data.id).toBe('keep-me');
      expect(readRes.data.item.text).toBe('Updated');
    } finally {
      await closeServer(api.server);
    }
  });

  it('GET /risup/formating-order includes empty warnings for clean fixtures', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
        { type: 'description' },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'chats', 'lorebook']),
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        state: string;
        items: Array<{ token: string }>;
        warnings: string[];
      }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('warnings');
      expect(Array.isArray(res.data.warnings)).toBe(true);
      expect(res.data.warnings).toHaveLength(0);
    } finally {
      await closeServer(api.server);
    }
  });

  it('GET /risup/formating-order includes warnings for duplicate tokens', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]),
      formatingOrder: JSON.stringify(['main', 'main', 'chats']),
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        state: string;
        warnings: string[];
      }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      expect(res.data.warnings.length).toBeGreaterThan(0);
      expect(res.data.warnings.some((w: string) => w.includes('Duplicate'))).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('GET /risup/formating-order includes warnings for dangling references', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]),
      formatingOrder: JSON.stringify(['main', 'lorebook']),
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        state: string;
        warnings: string[];
      }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      expect(res.data.warnings.some((w: string) => w.includes('Dangling'))).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('GET /risup/formating-order returns empty warnings when promptTemplate is invalid JSON', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: 'NOT_VALID_JSON',
      formatingOrder: JSON.stringify(['main', 'chats']),
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        state: string;
        items: Array<{ token: string }>;
        warnings: string[];
      }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('warnings');
      expect(res.data.warnings).toEqual([]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('raw write_field("promptTemplate") round-trips explicit ids', async () => {
    const explicitId = 'user-provided-id-42';
    const templateWithId = JSON.stringify([
      { id: explicitId, type: 'plain', type2: 'normal', text: 'With ID', role: 'system' },
    ]);
    const currentData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: templateWithId,
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(currentData);
    try {
      // Write via raw field write
      const writeRes = await postJson<{ success: boolean }>(api.port, api.token, '/field/promptTemplate', {
        content: templateWithId,
      });
      expect(writeRes.status).toBe(200);

      // Re-read via MCP prompt-item route
      const readRes = await getJson<{
        id: string | null;
        item: Record<string, unknown>;
      }>(api.port, api.token, '/risup/prompt-item/0');
      expect(readRes.status).toBe(200);
      expect(readRes.data.id).toBe(explicitId);
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

// ---------------------------------------------------------------------------
// Structured error-envelope regression tests for array-CRUD route families.
//
// These tests verify that validation guards in regex, greetings, lua-section,
// and css-section routes return the structured mcpError() envelope (with
// `action`, `error`, `status`, `target`) instead of the bare
// `jsonRes({ error })` shape.
//
// Per strict TDD: written to fail against the current bare-error production
// code so that subsequent production changes can be validated.
// ---------------------------------------------------------------------------

interface McpErrorEnvelope {
  action: string;
  error: string;
  status: number;
  target: string;
  retryable?: boolean;
  next_actions?: string[];
  rejected?: boolean;
  suggestion?: string;
  details?: unknown;
}

interface McpNoOpEnvelope extends McpErrorEnvelope {
  success: false;
  message: string;
  matchCount?: number;
  field?: string;
  results?: unknown;
  errors?: unknown;
  startAnchorFoundAt?: number;
  dryRun?: boolean;
}

function expectMcpNoOpEnvelope(data: McpNoOpEnvelope, expected: { action: string; target: string }): void {
  expect(data).toHaveProperty('success', false);
  expect(data).toHaveProperty('action', expected.action);
  expect(data).toHaveProperty('status', 200);
  expect(data).toHaveProperty('target', expected.target);
  expect(data).toHaveProperty('error', data.message);
  expect(data.suggestion).toBeDefined();
}

function expectMcpSuccessArtifacts(data: Record<string, unknown>): void {
  expect(typeof data.artifacts).toBe('object');
  expect((data.artifacts as Record<string, unknown>).byte_size).toEqual(expect.any(Number));
  expect((data.artifacts as Record<string, unknown>).byte_size as number).toBeGreaterThan(0);
}

describe('MCP API structured error envelopes — regex routes', () => {
  it('returns a structured error envelope for out-of-range index in POST /regex/batch-write', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      regex: [{ comment: 'test-regex', type: 'editoutput', find: 'foo', replace: 'bar' }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/regex/batch-write', {
        entries: [{ index: 999, data: { find: 'x', replace: 'y' } }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured no-op envelope for anchor miss in POST /regex/:idx/insert', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      regex: [{ comment: 'test-regex', type: 'editoutput', find: 'foo', replace: 'bar' }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/regex/0/insert', {
        field: 'find',
        content: 'baz',
        position: 'after',
        anchor: 'missing-anchor',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'insert regex field',
        target: 'regex:0:insert',
      });
      expect(res.data.error).toContain('앵커 문자열');
      expect(res.data.message).toContain('missing-anchor');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — greeting routes', () => {
  it('returns a structured error envelope for invalid permutation in POST /greeting/alternate/reorder', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      alternateGreetings: ['Hello', 'Hi', 'Hey'],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/greeting/alternate/reorder', {
        order: [0, 0, 0],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('permutation');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — lua-section routes', () => {
  it('returns a structured error envelope for invalid index in GET /lua/:idx', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/lua/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read lua section');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for non-array indices in POST /lua/batch', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/batch', {
        indices: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('indices must be an array');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for exceeding max batch size in POST /lua/batch', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const indices = Array.from({ length: 21 }, (_, i) => i);
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/batch', { indices });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('Maximum');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for missing name in POST /lua/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/add', {
        content: 'some code',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('Missing');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns details.existingIndex for duplicate section name in POST /lua/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseLuaSections: () => [{ name: 'TestSection', content: 'code here' }],
    });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/add', {
        name: 'TestSection',
        content: 'new code',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('already exists');
      expect(res.data.details).toEqual({ existingIndex: 0 });
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for anchor-required in POST /lua/:idx/insert', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseLuaSections: () => [{ name: 'TestSection', content: 'code here' }],
    });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/0/insert', {
        content: 'new code',
        position: 'after',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('anchor');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured no-op envelope for no matches in POST /lua/:idx/replace', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseLuaSections: () => [{ name: 'TestSection', content: 'print("hello")' }],
    });
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/lua/0/replace', {
        find: 'missing-value',
        replace: 'updated',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'replace lua section content',
        target: 'lua:0',
      });
      expect(res.data.message).toBe('일치하는 항목 없음');
      expect(res.data.matchCount).toBe(0);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API insert-regex-field action consistency', () => {
  it('uses canonical action "insert regex field" when field is invalid', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      regex: [{ comment: 'test-regex', type: 'editoutput', find: 'foo', replace: 'bar' }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/regex/0/insert', {
        field: 'invalid_field',
        content: 'hello',
      });
      expect(res.status).toBe(400);
      expect(res.data.action).toBe('insert regex field');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — css-section routes', () => {
  it('returns a structured error envelope for invalid index in GET /css-section/:idx', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/css-section/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read css section');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for non-array indices in POST /css-section/batch', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/batch', {
        indices: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('indices must be an array');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for exceeding max batch size in POST /css-section/batch', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const indices = Array.from({ length: 21 }, (_, i) => i);
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/batch', { indices });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('Maximum');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for missing name in POST /css-section/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/add', {
        content: 'some css',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('Missing');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns details.existingIndex for duplicate section name in POST /css-section/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseCssSections: () => ({ sections: [{ name: 'TestSection', content: 'css here' }], prefix: '', suffix: '' }),
    });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/add', {
        name: 'TestSection',
        content: 'new css',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('already exists');
      expect(res.data.details).toEqual({ existingIndex: 0 });
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for anchor-required in POST /css-section/:idx/insert', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseCssSections: () => ({ sections: [{ name: 'TestSection', content: 'css here' }], prefix: '', suffix: '' }),
    });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/0/insert', {
        content: 'new css',
        position: 'before',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('anchor');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured no-op envelope for anchor miss in POST /css-section/:idx/insert', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseCssSections: () => ({
        sections: [{ name: 'TestSection', content: 'body { color: red; }' }],
        prefix: '',
        suffix: '',
      }),
    });
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/css-section/0/insert', {
        content: 'p { color: blue; }',
        position: 'before',
        anchor: 'missing-anchor',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'insert css section content',
        target: 'css-section:0',
      });
      expect(res.data.error).toContain('앵커 문자열');
      expect(res.data.message).toContain('missing-anchor');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — field routes', () => {
  it('returns a structured error envelope for GET /field/not-a-real-field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/field/not-a-real-field');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:not-a-real-field');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/not-a-real-field (method-aware)', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/not-a-real-field', {
        content: 'x',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'update field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:not-a-real-field');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch with fields: not-an-array', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch', {
        fields: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read field batch');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch');
      // Schema validation rejects non-array fields with a type error
      expect(res.data.error).toMatch(/array|non-empty/i);
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch with 21 fields', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const fields = Array.from({ length: 21 }, (_, i) => `field${i}`);
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch', { fields });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read field batch');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch');
      expect(res.data.error).toContain('Maximum');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch with non-string array member', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch', {
        fields: ['name', 42],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read field batch');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch');
      expect(res.data.error).toContain('string');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with entries: []', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch-write');
      expect(res.data.error).toContain('non-empty');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with 21 entries', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const entries = Array.from({ length: 21 }, (_, i) => ({ field: `f${i}`, content: 'x' }));
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', { entries });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch-write');
      expect(res.data.error).toContain('Maximum');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with missing field/content', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ content: 'hello' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch-write');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with read-only field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'creationDate', content: '2024-01-01' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:creationDate');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with unsupported field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'lorebook', content: '{}' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:lorebook');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with unknown field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'not-a-real-field', content: 'x' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:not-a-real-field');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with boolean type mismatch', async () => {
    const fixture: SearchFixture = { _fileType: 'risum' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'hideIcon', content: 'yes' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:hideIcon');
      expect(res.data.error).toContain('boolean');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with excluded array field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'alternateGreetings', content: 'not-an-array' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:alternateGreetings');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with string type mismatch', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'name', content: 12345 }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:name');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/description/insert with position after and no anchor', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/description/insert', {
        content: 'hello',
        position: 'after',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'insert in field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:description');
      expect(res.data.error).toContain('anchor');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/description/batch-replace with replacements: []', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/description/batch-replace', {
        replacements: [],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch replace in field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:description');
      expect(res.data.error).toContain('non-empty');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/description/batch-replace with 51 replacements', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const replacements = Array.from({ length: 51 }, (_, i) => ({ find: `f${i}`, replace: `r${i}` }));
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/description/batch-replace', {
        replacements,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch replace in field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:description');
      expect(res.data.error).toContain('Maximum');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/description/batch-replace with one replacement missing find', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/description/batch-replace', {
        replacements: [{ replace: 'bar' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch replace in field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:description');
      expect(res.data.error).toContain('find');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured no-op envelope for POST /field/description/replace with no matches', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/field/description/replace', {
        find: 'missing-value',
        replace: 'updated',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'replace in field',
        target: 'field:description',
      });
      expect(res.data.message).toBe('일치하는 항목 없음');
      expect(res.data.matchCount).toBe(0);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured no-op envelope for POST /field/description/block-replace when end anchor is missing', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      description: 'START\nField Alpha is searchable.',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/field/description/block-replace', {
        start_anchor: 'START',
        end_anchor: 'END',
        content: 'replacement',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'block replace in field',
        target: 'field:description',
      });
      expect(res.data.error).toContain('끝 앵커');
      expect(res.data.startAnchorFoundAt).toBe(0);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with number type mismatch', async () => {
    const fixture: SearchFixture = { _fileType: 'risup' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'temperature', content: 'not-a-number' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:temperature');
      expect(res.data.error).toContain('number');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with JSON-field non-string rejection', async () => {
    const fixture: SearchFixture = { _fileType: 'risup', promptTemplate: '[]' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'promptTemplate', content: 12345 }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:promptTemplate');
      expect(res.data.error).toContain('문자열');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with JSON parse/shape validation failure', async () => {
    const fixture: SearchFixture = { _fileType: 'risup', formatingOrder: '[]', promptTemplate: '[]' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'formatingOrder', content: '{not valid json' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:formatingOrder');
      expect(res.data.suggestion).toBeDefined();
      expect(res.data.details).toBeDefined();
      expect(res.data.details).toHaveProperty('parseError');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with charx deprecated field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'personality', content: 'new value' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:personality');
      expect(res.data.error).toContain('읽기 전용');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns unknown-field envelope for POST /field/batch-write with moduleId on charx', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'moduleId', content: 'mod-123' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:moduleId');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns unknown-field envelope for POST /field/batch-write with creationDate on risup', async () => {
    const fixture: SearchFixture = { _fileType: 'risup' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'creationDate', content: '2026-04-01T00:00:00.000Z' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:creationDate');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with surface-invalid field on charx', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'mainPrompt', content: 'new prompt' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:mainPrompt');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — reference routes', () => {
  const referenceFiles = [
    {
      fileName: 'ref.charx',
      data: {
        lorebook: [{ comment: 'Entry A', key: 'a', content: 'content-a' }],
        regex: [{ comment: 'test-regex', type: 'editoutput', find: 'foo', replace: 'bar' }],
        lua: '',
        css: '',
      },
    },
  ];

  it('returns a structured error envelope for GET /reference/99/lorebook (out-of-range ref index)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/99/lorebook');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:99:lorebook');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /reference/0/lorebook/batch with invalid indices', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/lorebook/batch', {
        indices: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch read reference lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:lorebook:batch');
      expect(res.data.error).toContain('indices must be an array');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for GET /reference/0/lorebook/999 (invalid entry index)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/lorebook/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:lorebook:999');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for GET /reference/0/regex/999 (invalid entry index)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/regex/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference regex');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:regex:999');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /reference/0/lua/batch with oversized indices', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const indices = Array.from({ length: 21 }, (_, i) => i);
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/lua/batch', { indices });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch read reference lua');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:lua:batch');
      expect(res.data.error).toContain('Maximum');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for GET /reference/0/lua/999 (invalid section index)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/lua/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference lua');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:lua:999');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /reference/0/css/batch with invalid indices', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/css/batch', {
        indices: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch read reference css');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:css:batch');
      expect(res.data.error).toContain('indices must be an array');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for GET /reference/0/css/999 (invalid section index)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/css/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference css');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:css:999');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for GET /reference/0/badfield (unknown field)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/badfield');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:badfield');
      expect(res.data.error).toContain('Unknown field');
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

describe('MCP API structured error envelopes — asset routes', () => {
  it('returns a structured error envelope for missing fileName in POST /asset/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/add', {
        base64: Buffer.from('asset-bytes').toString('base64'),
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'add_asset');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'asset:add');
      expect(res.data).toHaveProperty('error', 'fileName과 base64 데이터가 필요합니다.');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for invalid file name characters in POST /asset/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/add', {
        fileName: 'bad/name.png',
        base64: Buffer.from('asset-bytes').toString('base64'),
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'add_asset');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'asset:add');
      expect(res.data).toHaveProperty('error', '파일명에 허용되지 않는 문자가 포함되어 있습니다.');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for duplicate asset paths in POST /asset/add', async () => {
    const assetPath = 'assets/other/image/duplicate.png';
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [{ path: assetPath, data: Buffer.from('existing-asset') }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/add', {
        fileName: 'duplicate.png',
        base64: Buffer.from('new-asset').toString('base64'),
      });
      expect(res.status).toBe(409);
      expect(res.data).toHaveProperty('action', 'add_asset');
      expect(res.data).toHaveProperty('status', 409);
      expect(res.data).toHaveProperty('target', `asset:${assetPath}`);
      expect(res.data).toHaveProperty('error', `에셋 경로 "${assetPath}"가 이미 존재합니다.`);
      expect(res.data).toHaveProperty('suggestion', '다른 파일명이나 폴더를 사용하세요.');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for invalid newName in POST /asset/:idx/rename', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [{ path: 'assets/other/image/original.png', data: Buffer.from('asset-bytes') }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/0/rename', {
        newName: 'bad/name.png',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'rename_asset');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'asset:0');
      expect(res.data).toHaveProperty('error', '유효한 newName이 필요합니다.');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — risum-asset routes', () => {
  it('returns a structured error envelope for missing name in POST /risum-asset/add', async () => {
    const fixture: SearchFixture = {
      _fileType: 'charx',
      risumAssets: [],
      cardAssets: [],
      _moduleData: {
        module: {
          assets: [],
        },
      },
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risum-asset/add', {
        path: 'assets/audio/theme.mp3',
        base64: Buffer.from('fake-audio').toString('base64'),
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'add_risum_asset');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'risum-asset:add');
      expect(res.data).toHaveProperty('error', 'name과 base64 데이터가 필요합니다.');
    } finally {
      await closeServer(api.server);
    }
  });
});

// ---------------------------------------------------------------------------
// Structured error-envelope tests — risup reorder / formating-order / skills
//
// Task 3: Verify that remaining bare jsonRes({ error }) guards return the
// structured mcpError() envelope (action, error, status, target).
// ---------------------------------------------------------------------------

describe('MCP API structured error envelopes — global guards', () => {
  it('returns a structured error envelope for unauthorized requests', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, 'wrong-token', '/fields');
      expect(res.status).toBe(401);
      expect(res.data).toHaveProperty('action', 'authenticate request');
      expect(res.data).toHaveProperty('status', 401);
      expect(res.data).toHaveProperty('target', 'request:auth');
      expect(res.data).toHaveProperty('error', 'Unauthorized');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope when no file is open', async () => {
    const api = await startTestApiServer(null);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/fields');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'require current document');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'document:current');
      expect(res.data).toHaveProperty('error', 'No file open');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('allows GET /references without a main document and includes fileType metadata', async () => {
    const api = await startTestApiServer(null, [
      {
        fileName: 'preset.risup',
        data: {
          _fileType: 'risup',
          mainPrompt: 'Preset main prompt',
          promptTemplate: '[{"type":"plain","text":"hi"}]',
          formatingOrder: '["main"]',
        },
      },
    ]);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/references');
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.references).toEqual([
        expect.objectContaining({
          index: 0,
          id: 'preset.risup',
          fileName: 'preset.risup',
          fileType: 'risup',
        }),
      ]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('supports batch/search/range reads against reference text surfaces without a main document', async () => {
    const api = await startTestApiServer(null, [
      {
        fileName: 'bot.charx',
        data: {
          description: 'needle in the reference haystack',
          firstMessage: 'Hello reference world',
          alternateGreetings: ['hello reference'],
          triggerScripts: [{ comment: 'ref trigger', type: 'input', conditions: [], effect: [] }],
        },
      },
    ]);
    try {
      const batch = await postJson<Record<string, unknown>>(api.port, api.token, '/reference/0/field/batch', {
        fields: ['description', 'alternateGreetings', 'triggerScripts'],
      });
      expect(batch.status).toBe(200);
      expect(batch.data.fields).toEqual([
        expect.objectContaining({ field: 'description', content: 'needle in the reference haystack' }),
        expect.objectContaining({ field: 'alternateGreetings', type: 'array', content: ['hello reference'] }),
        expect.objectContaining({ field: 'triggerScripts' }),
      ]);

      const search = await postJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/reference/0/field/description/search',
        {
          query: 'needle',
        },
      );
      expect(search.status).toBe(200);
      expect(search.data.field).toBe('description');
      expect(search.data.totalMatches).toBe(1);

      const range = await getJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/reference/0/field/firstMessage/range?offset=6&length=9',
      );
      expect(range.status).toBe(200);
      expect(range.data.field).toBe('firstMessage');
      expect(range.data.content).toBe('reference');
      expect(range.data.hasMore).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('supports structured greeting and trigger reads against references without a main document', async () => {
    const api = await startTestApiServer(null, [
      {
        fileName: 'bot.charx',
        data: {
          alternateGreetings: ['hello reference'],
          groupOnlyGreetings: ['group-only reference'],
          triggerScripts: [
            {
              comment: 'ref trigger',
              type: 'input',
              conditions: [{ type: 'match' }],
              effect: [{ type: 'reply' }],
              lowLevelAccess: true,
            },
          ],
        },
      },
    ]);
    try {
      const alternateList = await getJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/reference/0/greetings/alternate',
      );
      expect(alternateList.status).toBe(200);
      expect(alternateList.data.field).toBe('alternateGreetings');
      expect(alternateList.data.count).toBe(1);

      const groupEntry = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/greeting/group/0');
      expect(groupEntry.status).toBe(200);
      expect(groupEntry.data.type).toBe('group');
      expect(groupEntry.data.content).toBe('group-only reference');

      const triggerList = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/triggers');
      expect(triggerList.status).toBe(200);
      expect(triggerList.data.count).toBe(1);
      expect(triggerList.data.items).toEqual([
        expect.objectContaining({
          index: 0,
          comment: 'ref trigger',
          type: 'input',
          conditionCount: 1,
          effectCount: 1,
          lowLevelAccess: true,
        }),
      ]);

      const triggerEntry = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/trigger/0');
      expect(triggerEntry.status).toBe(200);
      expect(triggerEntry.data.triggerIndex).toBe(0);
      expect(triggerEntry.data.trigger).toEqual(
        expect.objectContaining({
          comment: 'ref trigger',
          type: 'input',
        }),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('reads structured risup prompt surfaces from references', async () => {
    const api = await startTestApiServer(null, [
      {
        fileName: 'preset.risup',
        data: {
          _fileType: 'risup',
          promptTemplate: JSON.stringify([
            { type: 'plain', text: 'Hello preset', role: 'system' },
            { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
          ]),
          formatingOrder: JSON.stringify(['main', 'description']),
        },
      },
    ]);
    try {
      const list = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/risup/prompt-items');
      expect(list.status).toBe(200);
      expect(list.data.count).toBe(2);
      expect(list.data.items).toEqual([
        expect.objectContaining({ index: 0, type: 'plain', supported: true }),
        expect.objectContaining({ index: 1, type: 'chat', supported: true }),
      ]);

      const item = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/risup/prompt-item/0');
      expect(item.status).toBe(200);
      expect(item.data.itemIndex).toBe(0);
      expect(item.data.type).toBe('plain');

      const order = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/risup/formating-order');
      expect(order.status).toBe(200);
      expect(order.data.items).toEqual([
        { index: 0, token: 'main', known: true },
        { index: 1, token: 'description', known: true },
      ]);
      expect(order.data.warnings).toEqual(['Dangling formatingOrder token: "description" has no matching prompt item']);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — risup reorder routes', () => {
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

  it('returns a structured error envelope for wrong-length order in POST /risup/prompt-item/reorder', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      // Fixture has 3 prompt items; send only 2 indices.
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risup/prompt-item/reorder', {
        order: [0, 1],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'reorder risup prompt items');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'risup:promptTemplate');
      expect(res.data.error).toContain('order must be an array of length');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for non-permutation order in POST /risup/prompt-item/reorder', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      // Fixture has 3 prompt items; send correct length but invalid permutation.
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risup/prompt-item/reorder', {
        order: [0, 0, 0],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'reorder risup prompt items');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'risup:promptTemplate');
      expect(res.data.error).toContain('permutation');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — risup formating-order routes', () => {
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

  it('returns a structured error envelope for non-array items in POST /risup/formating-order', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risup/formating-order', {
        items: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'write risup formating order');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'risup:formatingOrder');
      expect(res.data.error).toContain('items must be an array');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — skills routes', () => {
  it('returns a structured error envelope for traversal-shaped skill name in GET /skills/:name', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-skill-name-traversal-envelope');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'my-skill', {
      'SKILL.md': `---\nname: my-skill\ndescription: 'test'\n---\n# Skill\n`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/skills/..%2F..%2Foutside');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read_skill');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'skills:../../outside:SKILL.md');
      expect(res.data.error).toContain('Invalid skill name');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for traversal-shaped file name in GET /skills/:name/:file', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-traversal-envelope');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'my-skill', {
      'SKILL.md': `---\nname: my-skill\ndescription: 'test'\n---\n# Skill\n`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/skills/my-skill/..%2F..%2Fpackage.json');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read_skill');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'skills:my-skill:../../package.json');
      expect(res.data.error).toContain('Invalid file name');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a colon-delimited target for missing files in GET /skills/:name/:file', async () => {
    const skillsDir = path.join(TEST_DIR, 'skills-missing-envelope');
    await fs.promises.rm(skillsDir, { recursive: true, force: true });
    await writeSkillFixture(skillsDir, 'my-skill', {
      'SKILL.md': `---\nname: my-skill\ndescription: 'test'\n---\n# Skill\n`,
    });

    const api = await startTestApiServer(createSearchFixture(), [], skillsDir);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/skills/my-skill/MISSING.md');
      expect(res.status).toBe(404);
      expect(res.data).toHaveProperty('action', 'read_skill');
      expect(res.data).toHaveProperty('status', 404);
      expect(res.data).toHaveProperty('target', 'skills:my-skill:MISSING.md');
      expect(res.data.error).toContain('Skill file not found: my-skill/MISSING.md');
    } finally {
      await closeServer(api.server);
    }
  });
});

// ---------------------------------------------------------------------------
// External file probe routes (TDD – tests written before production code)
// ---------------------------------------------------------------------------

describe('MCP API open-file route', () => {
  const OPEN_FILE_DIR = path.join(TEST_DIR, 'open-file-fixtures');

  function openRouteCardData(): CharxData {
    return {
      name: 'Opened Via MCP',
      description: 'Opened through open-file route.',
      personality: 'Calm',
      scenario: 'Open route room',
      creatorcomment: 'Created for open-file tests',
      tags: ['open-file'],
      exampleMessage: '',
      systemPrompt: '',
      creator: '',
      characterVersion: '1.0.0',
      nickname: '',
      source: [],
      creationDate: 0,
      modificationDate: 0,
      additionalText: '',
      license: '',
      firstMessage: 'Hello from open_file.',
      alternateGreetings: [],
      groupOnlyGreetings: [],
      globalNote: '',
      css: '',
      defaultVariables: '',
      lua: '',
      triggerScripts: [],
      lorebook: [],
      regex: [],
      assets: [],
      xMeta: {},
      risumAssets: [],
      cardAssets: [],
      _risuExt: {},
      _card: {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
          extensions: { risuai: {} },
          character_book: { entries: [] },
          assets: [],
        },
      },
      _moduleData: null,
      _presetData: null,
    };
  }

  async function writeOpenFixture(filePath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    saveCharx(filePath, openRouteCardData());
  }

  it('opens an external file even when no editor document is currently open', async () => {
    const filePath = path.join(OPEN_FILE_DIR, 'open-target.charx');
    await writeOpenFixture(filePath);
    const api = await startTestApiServer(null);
    try {
      const res = await postJson<{
        file_path?: string;
        file_type?: string;
        name?: string;
        switched?: boolean;
      }>(api.port, api.token, '/open-file', {
        file_path: filePath,
      });
      expect(res.status).toBe(200);
      expect(res.data.file_path).toBe(filePath);
      expect(res.data.file_type).toBe('charx');
      expect(res.data.name).toBe('Opened Via MCP');
      expect(res.data.switched).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('passes save_current through to the renderer-open dependency', async () => {
    const filePath = path.join(OPEN_FILE_DIR, 'save-current.charx');
    await writeOpenFixture(filePath);
    let capturedSaveCurrent: boolean | null = null;
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      requestRendererOpenFile: async (request) => {
        capturedSaveCurrent = request.saveCurrent;
        return {
          success: true,
          filePath: request.filePath,
          fileType: request.fileType,
          name: 'Opened Via MCP',
        };
      },
    });
    try {
      const res = await postJson<{ save_current?: boolean }>(api.port, api.token, '/open-file', {
        file_path: filePath,
        save_current: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.save_current).toBe(true);
      expect(capturedSaveCurrent).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured 409 envelope when renderer-side document replacement is canceled', async () => {
    const filePath = path.join(OPEN_FILE_DIR, 'cancelled.charx');
    await writeOpenFixture(filePath);
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      requestRendererOpenFile: async () => ({
        success: false,
        canceled: true,
        error: 'Document replacement was canceled or the current file could not be saved.',
      }),
    });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/open-file', {
        file_path: filePath,
      });
      expect(res.status).toBe(409);
      expect(res.data).toHaveProperty('action', 'open file');
      expect(res.data).toHaveProperty('status', 409);
      expect(res.data).toHaveProperty('target', 'open:file');
      expect(res.data.error).toContain('canceled');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects concurrent open-file requests with a structured 409 envelope', async () => {
    const filePath = path.join(OPEN_FILE_DIR, 'concurrent.charx');
    await writeOpenFixture(filePath);
    let releaseFirst!: () => void;
    const firstRequestGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      requestRendererOpenFile: async (request) => {
        await firstRequestGate;
        return {
          success: true,
          filePath: request.filePath,
          fileType: request.fileType,
          name: 'Opened Via MCP',
        };
      },
    });
    try {
      const firstRequest = postJson(api.port, api.token, '/open-file', {
        file_path: filePath,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const secondRes = await postJson<McpErrorEnvelope>(api.port, api.token, '/open-file', {
        file_path: filePath,
      });
      expect(secondRes.status).toBe(409);
      expect(secondRes.data).toHaveProperty('action', 'open file');
      expect(secondRes.data).toHaveProperty('target', 'open:file');
      expect(secondRes.data.error).toContain('already in progress');
      releaseFirst();
      const firstRes = await firstRequest;
      expect(firstRes.status).toBe(200);
    } finally {
      await closeServer(api.server);
    }
  });

  it('agent eval: no-file-open guard recovers after open-file and returns a bounded success envelope', async () => {
    const filePath = path.join(OPEN_FILE_DIR, 'agent-eval-recovery.charx');
    await writeOpenFixture(filePath);
    const api = await startTestApiServer(null);
    try {
      const blocked = await getJson<McpErrorEnvelope>(api.port, api.token, '/fields');
      expect(blocked.status).toBe(400);
      expect(blocked.data.target).toBe('document:current');
      expect(blocked.data.retryable).toBe(false);
      expect(blocked.data.next_actions).toEqual(['open_file', 'list_references', 'session_status']);

      const opened = await postJson<Record<string, unknown>>(api.port, api.token, '/open-file', {
        file_path: filePath,
      });
      expect(opened.status).toBe(200);

      const recovered = await getJson<Record<string, unknown>>(api.port, api.token, '/fields');
      expect(recovered.status).toBe(200);
      expect(Array.isArray(recovered.data.fields)).toBe(true);
      expect((recovered.data.fields as unknown[]).length).toBeGreaterThan(0);
      expect((recovered.data.artifacts as Record<string, unknown>).byte_size).toEqual(expect.any(Number));
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API external file probe routes', () => {
  const PROBE_DIR = path.join(TEST_DIR, 'probe-fixtures');
  interface ProbeErrorEnvelope {
    action?: string;
    error?: string;
    status?: number;
    suggestion?: string;
    target?: string;
  }

  /** Create a valid .charx fixture through the real serializer path. */
  function writeCharxFixture(filePath: string, data: CharxData): void {
    saveCharx(filePath, data);
    openCharx(filePath);
  }

  /** Canonical charx payload used by probe tests. */
  function probeCardData(): CharxData {
    return {
      name: 'ProbeChar',
      description: 'Probe description field.',
      personality: 'Calm',
      scenario: 'Probe room',
      creatorcomment: 'Created for probe tests',
      tags: ['probe', 'charx'],
      exampleMessage: '',
      systemPrompt: '',
      creator: '',
      characterVersion: '1.0.0',
      nickname: '',
      source: [],
      creationDate: 0,
      modificationDate: 0,
      additionalText: '',
      license: '',
      firstMessage: 'Hello from probe.',
      alternateGreetings: ['Alt greeting 1'],
      groupOnlyGreetings: ['Group only probe greeting'],
      globalNote: 'Probe system note.',
      css: '/* probe css */',
      defaultVariables: 'mode=probe',
      lua: '-- ===== main =====\nprint("hello")\n',
      triggerScripts: [
        {
          comment: 'main',
          type: 'start',
          conditions: [],
          effect: [{ type: 'triggerlua', code: '-- ===== main =====\nprint("hello")\n' }],
          lowLevelAccess: false,
        },
      ],
      lorebook: [
        {
          comment: 'Lore A',
          key: 'alpha',
          secondkey: '',
          content: 'Alpha lore body.',
          insertorder: 100,
          alwaysActive: false,
          selective: false,
          mode: 'normal',
        },
        {
          comment: 'Lore B',
          key: 'beta',
          secondkey: '',
          content: 'Beta lore body.',
          insertorder: 200,
          alwaysActive: false,
          selective: false,
          mode: 'normal',
        },
      ],
      regex: [{ comment: 'Regex A', type: 'editoutput', find: 'foo', replace: 'bar', flag: 'g' }],
      moduleId: 'probe-module',
      moduleName: 'Probe Module',
      moduleDescription: 'Probe module description',
      assets: [{ path: 'assets/test.bin', data: Buffer.from([1, 2, 3, 4]) }],
      xMeta: { portrait: { width: 128, height: 128 } },
      risumAssets: [Buffer.from('embedded-asset')],
      cardAssets: [{ type: 'icon', uri: 'assets/test.bin', name: 'test.bin' }],
      _risuExt: {},
      _card: {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
          extensions: { risuai: {} },
          character_book: { entries: [] },
          assets: [],
        },
      },
      _moduleData: null,
      _presetData: null,
    };
  }

  let probeCharxPath: string;

  beforeAll(async () => {
    await fs.promises.mkdir(PROBE_DIR, { recursive: true });
    probeCharxPath = path.join(PROBE_DIR, 'probe-test.charx');
    writeCharxFixture(probeCharxPath, probeCardData());
  });

  // ── 1. Path validation ──────────────────────────────────────────────

  it('rejects empty file_path with a structured 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<ProbeErrorEnvelope>(api.port, api.token, '/probe/field/description', {
        file_path: '',
      });
      expect(res.status).toBe(400);
      expect(res.data.status).toBe(400);
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects file_path with path traversal (..) with a structured 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<ProbeErrorEnvelope>(api.port, api.token, '/probe/field/description', {
        file_path: `${PROBE_DIR}${path.sep}..${path.sep}..${path.sep}etc${path.sep}passwd.charx`,
      });
      expect(res.status).toBe(400);
      expect(res.data.status).toBe(400);
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects file_path with unsupported extension with a structured 400 envelope', async () => {
    const txtPath = path.join(PROBE_DIR, 'not-a-card.txt');
    await fs.promises.writeFile(txtPath, 'plain text', 'utf-8');

    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<ProbeErrorEnvelope>(api.port, api.token, '/probe/field/description', {
        file_path: txtPath,
      });
      expect(res.status).toBe(400);
      expect(res.data.status).toBe(400);
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects file_path pointing to a non-existent file with a structured 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<ProbeErrorEnvelope>(api.port, api.token, '/probe/field/description', {
        file_path: path.join(PROBE_DIR, 'does-not-exist.charx'),
      });
      expect(res.status).toBe(400);
      expect(res.data.status).toBe(400);
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects corrupted .charx probe files with a structured 400 envelope', async () => {
    const corruptPath = path.join(PROBE_DIR, 'corrupt.charx');
    await fs.promises.writeFile(corruptPath, 'not a zip archive', 'utf-8');

    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<ProbeErrorEnvelope>(api.port, api.token, '/probe/field/description', {
        file_path: corruptPath,
      });
      expect(res.status).toBe(400);
      expect(res.data.status).toBe(400);
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  // ── 2. Probe single field read ──────────────────────────────────────

  it('reads a single field from an unopened charx file via probe', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<{ field: string; content: string }>(api.port, api.token, '/probe/field/description', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(res.data.field).toBe('description');
      expect(res.data.content).toBe('Probe description field.');
    } finally {
      await closeServer(api.server);
    }
  });

  // ── 3. Probe batch field read ───────────────────────────────────────

  it('batch-reads multiple fields from an unopened charx file via probe', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<{
        count: number;
        fields: Array<{ field: string; content: string }>;
      }>(api.port, api.token, '/probe/field/batch', {
        file_path: probeCharxPath,
        fields: ['description', 'firstMessage'],
      });
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(2);
      expect(res.data.fields).toHaveLength(2);
      expect(res.data.fields[0]).toMatchObject({ field: 'description', content: 'Probe description field.' });
      expect(res.data.fields[1]).toMatchObject({ field: 'firstMessage', content: 'Hello from probe.' });
    } finally {
      await closeServer(api.server);
    }
  });

  // ── 4. Probe lorebook / regex / lua listing ─────────────────────────

  it('lists lorebook entries from an unopened charx file via probe', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<{
        entries: Array<{ index: number; comment: string }>;
      }>(api.port, api.token, '/probe/lorebook', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(res.data.entries).toHaveLength(2);
      expect(res.data.entries[0].comment).toBe('Lore A');
      expect(res.data.entries[1].comment).toBe('Lore B');
    } finally {
      await closeServer(api.server);
    }
  });

  it('lists regex entries from an unopened charx file via probe', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<{
        entries: Array<{ index: number; comment: string }>;
      }>(api.port, api.token, '/probe/regex', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(res.data.entries).toHaveLength(1);
      expect(res.data.entries[0].comment).toBe('Regex A');
    } finally {
      await closeServer(api.server);
    }
  });

  it('lists lua sections from an unopened charx file via probe', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<{
        sections: Array<{ name: string }>;
      }>(api.port, api.token, '/probe/lua', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.sections)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // ── 5. Probe isolation: does NOT depend on getCurrentData() ─────────

  it('returns probe data independent of the active document state', async () => {
    const activeData = createSearchFixture();
    activeData.description = 'Active document description (should not appear in probe)';

    const api = await startTestApiServer(activeData);
    try {
      const res = await postJson<{ field: string; content: string }>(api.port, api.token, '/probe/field/description', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(res.data.content).toBe('Probe description field.');
      expect(res.data.content).not.toContain('Active document');
    } finally {
      await closeServer(api.server);
    }
  });

  it('does not mutate getCurrentData() when probing an external file', async () => {
    const activeData = createSearchFixture();
    const originalDescription = activeData.description;

    const api = await startTestApiServer(activeData);
    try {
      const res = await postJson<{ content: string }>(api.port, api.token, '/probe/field/description', {
        file_path: probeCharxPath,
      });

      // Probe must succeed (route exists and reads external file)
      expect(res.status).toBe(200);
      // Active document must be unchanged after probe
      expect(activeData.description).toBe(originalDescription);
    } finally {
      await closeServer(api.server);
    }
  });

  it('can probe an unopened file even when no editor document is open', async () => {
    const api = await startTestApiServer(null);
    try {
      const res = await postJson<{ field: string; content: string }>(api.port, api.token, '/probe/field/description', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(res.data.field).toBe('description');
      expect(res.data.content).toBe('Probe description field.');
    } finally {
      await closeServer(api.server);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Success envelope integration tests
// ────────────────────────────────────────────────────────────────────────────

describe('MCP API success response envelope', () => {
  /**
   * Verify that envelope fields (status, summary, next_actions, artifacts)
   * are present on migrated success responses, without removing any
   * existing top-level fields.
   */

  it('list_fields response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/fields');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(Array.isArray(res.data.fields)).toBe(true);
      expect(typeof res.data.fileType).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_field response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.field).toBe('description');
      expect(typeof res.data.content).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_field response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description', {
        content: 'Updated description for envelope test.',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.field).toBe('description');
      expect(typeof res.data.size).toBe('number');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect((res.data.summary as string).includes('description')).toBe(true);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expect((res.data.next_actions as string[]).length).toBeGreaterThan(0);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_field_batch response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/batch', {
        fields: ['name', 'description'],
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.fields)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('search_in_field response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/search', {
        query: 'Alpha',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.field).toBe('description');
      expect(typeof res.data.totalMatches).toBe('number');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect((res.data.summary as string).includes('match')).toBe(true);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('list_lorebook response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.entries)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_lorebook response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook/0');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.index).toBe(0);
      expect(typeof res.data.entry).toBe('object');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('snapshot_field response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/snapshot', {});
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.snapshotId).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('list_snapshots response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description/snapshots');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.field).toBe('description');
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.snapshots)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status response includes session metadata and snapshot totals', async () => {
    const fixture = { ...createSearchFixture(), name: 'Status Card' };
    const api = await startTestApiServer(fixture, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: 'C:\\cards\\status-card.charx',
        currentFileType: 'charx',
        lastRestored: {
          appVersion: '0.39.5',
          autosavePath: 'C:\\autosave\\status-card_autosave_2.charx',
          dirtyFields: ['name'],
          savedAt: '2026-04-10T00:00:00.000Z',
          sourceFilePath: 'C:\\cards\\status-card.charx',
          sourceFileType: 'charx',
        },
        pendingRecovery: {
          autosavePath: 'C:\\autosave\\status-card_autosave_3.charx',
          dirtyFields: ['description'],
          sourceFilePath: 'C:\\cards\\status-card.charx',
          staleWarning: null,
        },
        renderer: {
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: true,
          autosaveInterval: 120000,
          dirtyFieldCount: 2,
          dirtyFields: ['description', 'firstMessage'],
          documentSwitchInProgress: false,
          hasUnsavedChanges: true,
        },
      }),
    });
    try {
      await postJson(api.port, api.token, '/field/description/snapshot', {});

      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.loaded).toBe(true);
      expect(res.data.document).toEqual({
        filePath: 'C:\\cards\\status-card.charx',
        fileType: 'charx',
        name: 'Status Card',
      });
      expect(res.data.renderer).toEqual({
        autosaveDir: 'C:\\autosave',
        autosaveEnabled: true,
        autosaveInterval: 120000,
        dirtyFieldCount: 2,
        dirtyFields: ['description', 'firstMessage'],
        documentSwitchInProgress: false,
        hasUnsavedChanges: true,
      });
      expect(res.data.recovery).toEqual({
        lastRestored: {
          appVersion: '0.39.5',
          autosavePath: 'C:\\autosave\\status-card_autosave_2.charx',
          dirtyFields: ['name'],
          savedAt: '2026-04-10T00:00:00.000Z',
          sourceFilePath: 'C:\\cards\\status-card.charx',
          sourceFileType: 'charx',
        },
        pendingRecovery: {
          autosavePath: 'C:\\autosave\\status-card_autosave_3.charx',
          dirtyFields: ['description'],
          sourceFilePath: 'C:\\cards\\status-card.charx',
          staleWarning: null,
        },
      });
      expect(res.data.snapshots).toEqual({
        byField: [{ count: 1, field: 'description' }],
        totalFields: 1,
        totalSnapshots: 1,
      });
      expect(res.data.surfaceSummary).toEqual({
        lorebookCount: 2,
        regexCount: 0,
        alternateGreetingCount: 2,
        groupGreetingCount: 1,
        triggerCount: 0,
        luaSectionCount: 0,
        cssSectionCount: 0,
        risupPromptItemCount: null,
        risupPromptState: null,
      });
      expect(res.data.references).toEqual({
        count: 0,
        files: [],
      });
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status remains available when no document is open', async () => {
    const api = await startTestApiServer(null, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: null,
        currentFileType: null,
        lastRestored: null,
        pendingRecovery: null,
        renderer: {
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: false,
          autosaveInterval: 120000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        },
      }),
    });
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.loaded).toBe(false);
      expect(res.data.document).toEqual({
        filePath: null,
        fileType: null,
        name: null,
      });
      expect(res.data.references).toEqual({
        count: 0,
        files: [],
      });
      expect(res.data.renderer).toEqual({
        autosaveDir: 'C:\\autosave',
        autosaveEnabled: false,
        autosaveInterval: 120000,
        dirtyFieldCount: 0,
        dirtyFields: [],
        documentSwitchInProgress: false,
        hasUnsavedChanges: false,
      });
      expect(res.data.recovery).toEqual({
        lastRestored: null,
        pendingRecovery: null,
      });
      expect(res.data.snapshots).toEqual({
        byField: [],
        totalFields: 0,
        totalSnapshots: 0,
      });
      expect(res.data.surfaceSummary).toBeNull();
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status surfaceSummary reports risup prompt counts for risup documents', async () => {
    const fixture: SearchFixture = {
      _fileType: 'risup',
      name: 'Status Preset',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello', role: 'system' },
        { type: 'persona', text: 'Persona block' },
      ]),
      formatingOrder: '["main"]',
      alternateGreetings: ['Alt greeting'],
      groupOnlyGreetings: [],
      lorebook: [],
      regex: [{ comment: 'status-regex', type: 'editoutput', in: 'foo', out: 'bar' }],
      triggerScripts: [{ comment: 'status-trigger', type: 'start', conditions: [], effect: [], lowLevelAccess: false }],
      lua: '---@name main\nprint("hello")',
      css: '/* ===== main ===== */\nbody { color: red; }',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: 'C:\\presets\\status-preset.risup',
        currentFileType: 'risup',
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      }),
      parseLuaSections: (lua: string) => (lua.trim() ? [{ name: 'main', content: lua.trim() }] : []),
      parseCssSections: (css: string) =>
        css.trim()
          ? { sections: [{ name: 'main', content: css.trim() }], prefix: '', suffix: '' }
          : { sections: [], prefix: '', suffix: '' },
    });
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.loaded).toBe(true);
      expect(res.data.document).toEqual({
        filePath: 'C:\\presets\\status-preset.risup',
        fileType: 'risup',
        name: 'Status Preset',
      });
      expect(res.data.surfaceSummary).toEqual({
        lorebookCount: 0,
        regexCount: 1,
        alternateGreetingCount: 1,
        groupGreetingCount: 0,
        triggerCount: 1,
        luaSectionCount: 1,
        cssSectionCount: 1,
        risupPromptItemCount: 2,
        risupPromptState: 'valid',
      });
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  describe('agent eval: session-aware mutation workflows', () => {
    it('session_status -> snapshot_field -> session_status updates snapshot totals', async () => {
      const sessionStatus: TestSessionStatus = {
        currentFilePath: 'C:\\cards\\agent-eval.charx',
        currentFileType: 'charx',
        lastRestored: null,
        pendingRecovery: null,
        renderer: {
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: true,
          autosaveInterval: 120000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        },
      };
      const api = await startTestApiServer({ ...createSearchFixture(), name: 'Agent Eval Card' }, [], undefined, {
        getSessionStatus: () => sessionStatus,
      });
      try {
        const before = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(before.status).toBe(200);
        expect(before.data.loaded).toBe(true);
        expect(before.data.snapshots).toEqual({
          byField: [],
          totalFields: 0,
          totalSnapshots: 0,
        });
        expectMcpSuccessArtifacts(before.data);

        const snapshot = await postJson<Record<string, unknown>>(
          api.port,
          api.token,
          '/field/description/snapshot',
          {},
        );
        expect(snapshot.status).toBe(200);
        expectMcpSuccessArtifacts(snapshot.data);

        const after = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(after.status).toBe(200);
        expect(after.data.snapshots).toEqual({
          byField: [{ count: 1, field: 'description' }],
          totalFields: 1,
          totalSnapshots: 1,
        });
        expectMcpSuccessArtifacts(after.data);
      } finally {
        await closeServer(api.server);
      }
    });

    it('session_status -> write_field -> session_status reflects dirty renderer state', async () => {
      const sessionStatus: TestSessionStatus = {
        currentFilePath: 'C:\\cards\\agent-eval.charx',
        currentFileType: 'charx',
        lastRestored: null,
        pendingRecovery: null,
        renderer: {
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: true,
          autosaveInterval: 120000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        },
      };
      const api = await startTestApiServer({ ...createSearchFixture(), name: 'Agent Eval Card' }, [], undefined, {
        getSessionStatus: () => sessionStatus,
        broadcastToAll: (channel: string, ...args: unknown[]) => {
          if (channel !== 'data-updated' || !sessionStatus.renderer) return;
          const [fieldName] = args;
          if (typeof fieldName !== 'string') return;
          const dirtyFields = new Set(sessionStatus.renderer.dirtyFields);
          dirtyFields.add(fieldName);
          sessionStatus.renderer.dirtyFields = [...dirtyFields].sort();
          sessionStatus.renderer.dirtyFieldCount = sessionStatus.renderer.dirtyFields.length;
          sessionStatus.renderer.hasUnsavedChanges = sessionStatus.renderer.dirtyFieldCount > 0;
        },
      });
      try {
        const before = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(before.status).toBe(200);
        expect(before.data.renderer).toEqual({
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: true,
          autosaveInterval: 120000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        });

        const write = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description', {
          content: 'Agent-updated description.',
        });
        expect(write.status).toBe(200);
        expectMcpSuccessArtifacts(write.data);

        const after = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(after.status).toBe(200);
        expect(after.data.renderer).toEqual({
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: true,
          autosaveInterval: 120000,
          dirtyFieldCount: 1,
          dirtyFields: ['description'],
          documentSwitchInProgress: false,
          hasUnsavedChanges: true,
        });
        expectMcpSuccessArtifacts(after.data);
      } finally {
        await closeServer(api.server);
      }
    });

    it('session_status -> open-file -> session_status reports the loaded document', async () => {
      const filePath = path.join(TEST_DIR, 'agent-eval-status-open.charx');
      const sessionStatus: TestSessionStatus = {
        currentFilePath: null,
        currentFileType: null,
        lastRestored: null,
        pendingRecovery: null,
        renderer: {
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: false,
          autosaveInterval: 120000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        },
      };
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      saveCharx(filePath, {
        name: 'Opened Via Agent Eval',
        description: 'Loaded after session_status inspection.',
        personality: 'Calm',
        scenario: 'Agent eval route',
        creatorcomment: '',
        tags: [],
        exampleMessage: '',
        systemPrompt: '',
        creator: '',
        characterVersion: '1.0.0',
        nickname: '',
        source: [],
        creationDate: 0,
        modificationDate: 0,
        additionalText: '',
        license: '',
        firstMessage: 'Hello.',
        alternateGreetings: [],
        groupOnlyGreetings: [],
        globalNote: '',
        css: '',
        defaultVariables: '',
        lua: '',
        triggerScripts: [],
        lorebook: [],
        regex: [],
        assets: [],
        xMeta: {},
        risumAssets: [],
        cardAssets: [],
        _risuExt: {},
        _card: {
          spec: 'chara_card_v3',
          spec_version: '3.0',
          data: {
            extensions: { risuai: {} },
            character_book: { entries: [] },
            assets: [],
          },
        },
        _moduleData: null,
        _presetData: null,
      });
      const api = await startTestApiServer(null, [], undefined, {
        getSessionStatus: () => sessionStatus,
      });
      try {
        const before = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(before.status).toBe(200);
        expect(before.data.loaded).toBe(false);

        const opened = await postJson<Record<string, unknown>>(api.port, api.token, '/open-file', {
          file_path: filePath,
        });
        expect(opened.status).toBe(200);
        expectMcpSuccessArtifacts(opened.data);

        sessionStatus.currentFilePath = filePath;
        sessionStatus.currentFileType = 'charx';

        const after = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(after.status).toBe(200);
        expect(after.data.loaded).toBe(true);
        expect(after.data.document).toEqual({
          filePath,
          fileType: 'charx',
          name: 'Opened Via Agent Eval',
        });
        expectMcpSuccessArtifacts(after.data);
      } finally {
        await closeServer(api.server);
      }
    });
  });

  describe('agent eval: cross-family orchestration flows', () => {
    it('read_field -> write_field -> read_field roundtrips field content', async () => {
      const api = await startTestApiServer(createSearchFixture());
      try {
        const firstRead = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description');
        expect(firstRead.status).toBe(200);
        expect(firstRead.data.content).toBe('Field Alpha is searchable.');
        expectMcpSuccessArtifacts(firstRead.data);

        const write = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description', {
          content: 'Field Alpha was updated by an agent eval.',
        });
        expect(write.status).toBe(200);
        expect(write.data.success).toBe(true);
        expectMcpSuccessArtifacts(write.data);

        const secondRead = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description');
        expect(secondRead.status).toBe(200);
        expect(secondRead.data.content).toBe('Field Alpha was updated by an agent eval.');
        expectMcpSuccessArtifacts(secondRead.data);
      } finally {
        await closeServer(api.server);
      }
    });

    it('probe_field -> open-file -> read_field transitions from unopened to active document', async () => {
      const filePath = path.join(TEST_DIR, 'agent-eval-probe-open.charx');
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      saveCharx(filePath, {
        name: 'Probe/Open Eval',
        description: 'Probe first, then open, then read.',
        personality: 'Calm',
        scenario: 'Probe route',
        creatorcomment: '',
        tags: [],
        exampleMessage: '',
        systemPrompt: '',
        creator: '',
        characterVersion: '1.0.0',
        nickname: '',
        source: [],
        creationDate: 0,
        modificationDate: 0,
        additionalText: '',
        license: '',
        firstMessage: 'Hello.',
        alternateGreetings: [],
        groupOnlyGreetings: [],
        globalNote: '',
        css: '',
        defaultVariables: '',
        lua: '',
        triggerScripts: [],
        lorebook: [],
        regex: [],
        assets: [],
        xMeta: {},
        risumAssets: [],
        cardAssets: [],
        _risuExt: {},
        _card: {
          spec: 'chara_card_v3',
          spec_version: '3.0',
          data: {
            extensions: { risuai: {} },
            character_book: { entries: [] },
            assets: [],
          },
        },
        _moduleData: null,
        _presetData: null,
      });
      const api = await startTestApiServer(null);
      try {
        const probe = await postJson<Record<string, unknown>>(api.port, api.token, '/probe/field/description', {
          file_path: filePath,
        });
        expect(probe.status).toBe(200);
        expect(probe.data.content).toBe('Probe first, then open, then read.');
        expectMcpSuccessArtifacts(probe.data);

        const open = await postJson<Record<string, unknown>>(api.port, api.token, '/open-file', {
          file_path: filePath,
        });
        expect(open.status).toBe(200);
        expect(open.data.file_path).toBe(filePath);
        expectMcpSuccessArtifacts(open.data);

        const read = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description');
        expect(read.status).toBe(200);
        expect(read.data.content).toBe('Probe first, then open, then read.');
        expectMcpSuccessArtifacts(read.data);
      } finally {
        await closeServer(api.server);
      }
    });

    it('list_lorebook -> write_lorebook -> read_lorebook roundtrips lorebook content', async () => {
      const api = await startTestApiServer(createSearchFixture());
      try {
        const listed = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook');
        expect(listed.status).toBe(200);
        expect(listed.data.count).toBe(2);
        expectMcpSuccessArtifacts(listed.data);

        const written = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/0', {
          content: 'Lore alpha entry updated by agent eval.',
        });
        expect(written.status).toBe(200);
        expect(written.data.success).toBe(true);
        expectMcpSuccessArtifacts(written.data);

        const read = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook/0');
        expect(read.status).toBe(200);
        expect((read.data.entry as Record<string, unknown>).content).toBe('Lore alpha entry updated by agent eval.');
        expectMcpSuccessArtifacts(read.data);
      } finally {
        await closeServer(api.server);
      }
    });
  });

  it('envelope does not break error responses (no envelope on errors)', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/field/nonexistent_field');
      expect(res.status).toBe(400);
      // Error responses should NOT have success envelope fields
      expect(res.data.error).toBeDefined();
      expect(res.data.action).toBeDefined();
      // next_actions IS present on errors (recovery metadata contract)
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      // summary should NOT be present on errors (success-only field)
      expect(res.data.summary).toBeUndefined();
    } finally {
      await closeServer(api.server);
    }
  });
});

// ================================================================
// Envelope migration: lorebook write/batch, regex, greeting, trigger
// ================================================================
describe('MCP envelope — lorebook/regex/greeting/trigger CRUD families', () => {
  function createEnvelopeFixture(): SearchFixture {
    return {
      ...createSearchFixture(),
      regex: [
        { comment: 'test-regex', type: 'editoutput', in: 'foo', out: 'bar', find: 'foo', replace: 'bar', flag: 'g' },
      ],
      triggerScripts: [{ comment: 'test-trigger', type: 'start', conditions: [], effect: [], lowLevelAccess: false }],
    };
  }

  // --- Lorebook family ---

  it('read_lorebook_batch response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/batch', {
        indices: [0],
      });
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(1);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_lorebook response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/0', {
        content: 'updated lore',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(0);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_lorebook rejects stale expected_comment with 409 envelope', async () => {
    const api = await startTestApiServer(createEnvelopeFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/0', {
        content: 'updated lore',
        expected_comment: 'Wrong lore',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('lorebook:0');
      expect(res.data.error).toContain('Stale lorebook index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch_delete_lorebook response includes results alias', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/batch-delete', {
        indices: [0],
        expected_comments: ['Bridge lore'],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.deleted).toBe(1);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.comment).toBe('Bridge lore');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('validate_lorebook_keys response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook/validate');
      expect(res.status).toBe(200);
      expect(typeof res.data.totalEntries).toBe('number');
      expect(typeof res.data.issueCount).toBe('number');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('diff_lorebook response includes envelope fields', async () => {
    const refData: SearchFixture = {
      lorebook: [{ comment: 'Bridge lore', key: 'bridge', content: 'Different reference.' }],
    };
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture, [{ fileName: 'ref.charx', data: refData }]);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/diff', {
        index: 0,
        refIndex: 0,
        refEntryIndex: 0,
      });
      expect(res.status).toBe(200);
      expect(typeof res.data.identical).toBe('boolean');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Regex family ---

  it('list_regex response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/regex');
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_regex response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/regex/0');
      expect(res.status).toBe(200);
      expect(res.data.index).toBe(0);
      expect(res.data.entry).toBeDefined();
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_regex_batch response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/regex/batch', {
        indices: [0, 99],
      });
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_regex response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/regex/0', {
        comment: 'updated-regex',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_regex rejects stale expected_comment with 409 envelope', async () => {
    const api = await startTestApiServer(createEnvelopeFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/regex/0', {
        comment: 'updated-regex',
        expected_comment: 'wrong-regex',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('regex:0');
      expect(res.data.error).toContain('Stale regex index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_regex_batch response includes results alias', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/regex/batch-write', {
        entries: [{ index: 0, data: { comment: 'batch-regex' }, expected_comment: 'test-regex' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.comment).toBe('batch-regex');
      expect(res.data.status).toBe(200);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Greeting family ---

  it('list_greetings response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/greetings/alternate');
      expect(res.status).toBe(200);
      expect(typeof res.data.count).toBe('number');
      expect(res.data.type).toBe('alternate');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_greeting response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/greeting/alternate/0');
      expect(res.status).toBe(200);
      expect(res.data.index).toBe(0);
      expect(typeof res.data.content).toBe('string');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_greeting_batch response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/greeting/alternate/batch', {
        indices: [0, 99],
      });
      expect(res.status).toBe(200);
      expect(res.data.type).toBe('alternate');
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_greeting response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/greeting/alternate/0', {
        content: 'updated greeting',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_greeting rejects stale expected_preview with 409 envelope', async () => {
    const api = await startTestApiServer(createEnvelopeFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/greeting/alternate/0', {
        content: 'updated greeting',
        expected_preview: 'Wrong preview',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('greeting:alternate:0');
      expect(res.data.error).toContain('Stale greeting index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch_write_greeting response includes results alias', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/greeting/alternate/batch-write', {
        writes: [{ index: 0, content: 'updated greeting', expected_preview: 'Alternate Alpha greeting.' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.type).toBe('alternate');
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.preview).toBe('updated greeting');
      expect(res.data.status).toBe(200);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch_delete_greeting rejects stale expected_previews with 409 envelope', async () => {
    const api = await startTestApiServer(createEnvelopeFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/greeting/alternate/batch-delete', {
        indices: [0],
        expected_previews: ['Wrong preview'],
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('greeting:alternate:batch-delete');
      expect(res.data.error).toContain('Stale greeting index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch_delete_greeting response includes results alias', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/greeting/alternate/batch-delete', {
        indices: [0],
        expected_previews: ['Alternate Alpha greeting.'],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.deletedCount).toBe(1);
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.preview).toBe('Alternate Alpha greeting.');
      expect(res.data.status).toBe(200);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Trigger family ---

  it('list_triggers response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/triggers');
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_trigger response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/trigger/0');
      expect(res.status).toBe(200);
      expect(res.data.index).toBe(0);
      expect(res.data.trigger).toBeDefined();
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_trigger_batch response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/trigger/batch', {
        indices: [0, 99],
      });
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.triggers)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_trigger response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/trigger/0', {
        comment: 'updated-trigger',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('delete_trigger rejects stale expected_comment with 409 envelope', async () => {
    const api = await startTestApiServer(createEnvelopeFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/trigger/0/delete', {
        expected_comment: 'wrong-trigger',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('trigger:0');
      expect(res.data.error).toContain('Stale trigger index 0');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP envelope — reference batch readers', () => {
  function createReferenceBatchFixture(): SearchFixture {
    return {
      ...createSearchFixture(),
      regex: [
        { comment: 'ref-regex', type: 'editoutput', in: 'foo', out: 'bar', find: 'foo', replace: 'bar', flag: 'g' },
      ],
      triggerScripts: [{ comment: 'ref-trigger', type: 'start', conditions: [], effect: [], lowLevelAccess: false }],
    };
  }

  it('read_reference_greeting_batch response includes envelope fields', async () => {
    const api = await startTestApiServer(createSearchFixture(), [
      { fileName: 'ref.charx', data: createReferenceBatchFixture() },
    ]);
    try {
      const res = await postJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/reference/0/greeting/alternate/batch',
        {
          indices: [0, 99],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.refIndex).toBe(0);
      expect(res.data.type).toBe('alternate');
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_reference_trigger_batch response includes envelope fields', async () => {
    const api = await startTestApiServer(createSearchFixture(), [
      { fileName: 'ref.charx', data: createReferenceBatchFixture() },
    ]);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/reference/0/trigger/batch', {
        indices: [0, 99],
      });
      expect(res.status).toBe(200);
      expect(res.data.refIndex).toBe(0);
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.triggers)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_reference_regex_batch response includes envelope fields', async () => {
    const api = await startTestApiServer(createSearchFixture(), [
      { fileName: 'ref.charx', data: createReferenceBatchFixture() },
    ]);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/reference/0/regex/batch', {
        indices: [0, 99],
      });
      expect(res.status).toBe(200);
      expect(res.data.refIndex).toBe(0);
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_reference_risup_prompt_item_batch response includes envelope fields', async () => {
    const api = await startTestApiServer(createSearchFixture(), [
      {
        fileName: 'ref.risup',
        data: {
          _fileType: 'risup',
          promptTemplate: JSON.stringify([
            { id: 'prompt-1', type: 'plain', type2: 'normal', text: 'Hello', role: 'system' },
          ]),
        },
      },
    ]);
    try {
      const res = await postJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/reference/0/risup/prompt-items/batch',
        {
          indices: [0, 99],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.index).toBe(0);
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });
});

// ================================================================
// Envelope migration: lua section, css section, risup prompt families
// ================================================================
describe('MCP envelope — lua/css section and risup prompt families', () => {
  function createLuaCssFixture(): SearchFixture {
    return {
      ...createSearchFixture(),
      lua: '---@name main\nprint("hello")\n---@name utils\nlocal x = 1',
      css: '/* ===== main ===== */\nbody { color: red; }\n/* ===== theme ===== */\n.dark { color: white; }',
    };
  }

  const luaCssOverrides: TestDepsOverrides = {
    parseLuaSections: () => [
      { name: 'main', content: 'print("hello")' },
      { name: 'utils', content: 'local x = 1' },
    ],
    parseCssSections: () => ({
      sections: [
        { name: 'main', content: 'body { color: red; }' },
        { name: 'theme', content: '.dark { color: white; }' },
      ],
      prefix: '',
      suffix: '',
    }),
  };

  function createRisupEnvelopeFixture(): SearchFixture {
    return {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'chats']),
    };
  }

  // --- Lua section family ---

  it('list_lua response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/lua');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.sections)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_lua response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/lua/0');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.index).toBe(0);
      expect(typeof res.data.name).toBe('string');
      expect(typeof res.data.content).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('lua batch read response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/batch', {
        indices: [0, 1],
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(typeof res.data.total).toBe('number');
      expect(Array.isArray(res.data.sections)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('add_lua_section response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/add', {
        name: 'newSection',
        content: 'local y = 2',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.index).toBe('number');
      expect(res.data.name).toBe('newSection');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_lua response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/0', {
        content: 'print("updated")',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(0);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace_in_lua response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/0/replace', {
        find: 'hello',
        replace: 'world',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.matchCount).toBe('number');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('insert_in_lua response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/0/insert', {
        content: '-- new line',
        position: 'end',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.position).toBe('end');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- CSS section family ---

  it('list_css response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/css-section');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.sections)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_css response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/css-section/0');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.index).toBe(0);
      expect(typeof res.data.name).toBe('string');
      expect(typeof res.data.content).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('css batch read response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/batch', {
        indices: [0, 1],
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(typeof res.data.total).toBe('number');
      expect(Array.isArray(res.data.sections)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('add_css_section response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/add', {
        name: 'newCss',
        content: '.new { display: block; }',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.index).toBe('number');
      expect(res.data.name).toBe('newCss');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_css response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/0', {
        content: 'body { color: blue; }',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(0);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace_in_css response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/0/replace', {
        find: 'red',
        replace: 'blue',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.matchCount).toBe('number');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('insert_in_css response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/0/insert', {
        content: '.extra { margin: 0; }',
        position: 'end',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.position).toBe('end');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Risup prompt family ---

  it('list_risup_prompt_items response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(res.data.state).toBe('valid');
      expect(Array.isArray(res.data.items)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_risup_prompt_item response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/0');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.index).toBe(0);
      expect(res.data.type).toBe('plain');
      expect(typeof res.data.supported).toBe('boolean');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_risup_prompt_item_batch response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/batch', {
        indices: [0, 1],
      });
      expect(res.status).toBe(200);
      expect(typeof res.data.count).toBe('number');
      expect(typeof res.data.total).toBe('number');
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('search_in_risup_prompt_items response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-items/search', {
        query: 'hello',
      });
      expect(res.status).toBe(200);
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.matches)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_risup_prompt_item response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/0', {
        item: { type: 'plain', type2: 'normal', text: 'Updated text', role: 'system' },
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(0);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_risup_prompt_item_batch response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/batch-write', {
        writes: [{ index: 0, item: { type: 'plain', type2: 'normal', text: 'Batch edit', role: 'system' } }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.results)).toBe(true);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_risup_prompt_item rejects stale expected_type with 409 envelope', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risup/prompt-item/0', {
        item: { type: 'plain', type2: 'normal', text: 'Updated text', role: 'system' },
        expected_type: 'chat',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('risup:promptTemplate:0');
      expect(res.data.error).toContain('Stale risup prompt item index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('add_risup_prompt_item response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/add', {
        item: { type: 'plain', type2: 'normal', text: 'New item', role: 'system' },
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.index).toBe('number');
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('add_risup_prompt_item_batch response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/batch-add', {
        items: [{ type: 'plain', type2: 'normal', text: 'Batch new item', role: 'system' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.indices)).toBe(true);
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.type).toBe('plain');
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('reorder_risup_prompt_items response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/reorder', {
        order: [2, 0, 1],
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.order)).toBe(true);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('delete_risup_prompt_item response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/0/delete', {});
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.deleted).toBe(0);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_risup_formating_order response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.state).toBe('string');
      expect(Array.isArray(res.data.items)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_risup_formating_order response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/formating-order', {
        items: [{ token: 'main' }, { token: 'description' }, { token: 'chats' }],
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.count).toBe('number');
      expect(res.data.warnings).toEqual(['Dangling formatingOrder token: "description" has no matching prompt item']);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('diff_risup_prompt response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const referenceData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Different reference', role: 'system' }]),
      formatingOrder: JSON.stringify(['main']),
    };
    const api = await startTestApiServer(fixture, [{ fileName: 'compare.risup', data: referenceData }]);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-diff', { refIndex: 0 });
      expect(res.status).toBe(200);
      expect(typeof res.data.identical).toBe('boolean');
      expect(Array.isArray(res.data.changedSections)).toBe(true);
      expect(typeof res.data.promptTemplate).toBe('object');
      expect(typeof res.data.formatingOrder).toBe('object');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });
});

// ================================================================
// Envelope migration: residual bare jsonRes → jsonResSuccess
// ================================================================
describe('MCP API response envelope — residual success migration', () => {
  // --- Group 1: Field dry-run previews ---

  it('replace_in_field dry-run includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/replace', {
        find: 'searchable',
        replace: 'findable',
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(typeof res.data.matchCount).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace_block_in_field dry-run includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/block-replace', {
        start_anchor: 'Field',
        end_anchor: 'searchable',
        content: 'NEW',
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(typeof res.data.oldBlockSize).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace_in_field_batch dry-run includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/batch-replace', {
        replacements: [{ find: 'searchable', replace: 'findable' }],
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(typeof res.data.totalMatches).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 2: Field mutation successes ---

  it('replace_block_in_field success includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/block-replace', {
        start_anchor: 'Field',
        end_anchor: 'searchable',
        content: 'NEW',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(typeof res.data.oldBlockSize).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('insert_in_field success includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/insert', {
        content: 'INSERTED',
        position: 0,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.field).toBe('description');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace_in_field_batch success includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/batch-replace', {
        replacements: [{ find: 'searchable', replace: 'findable' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(typeof res.data.totalMatches).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 3: Lorebook dry-run previews ---

  it('replace_across_all_lorebook dry-run includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/replace-all', {
        find: 'alpha',
        replace: 'beta',
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(typeof res.data.totalMatches).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('lorebook block-replace dry-run includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/0/block-replace', {
        start_anchor: 'Lore',
        end_anchor: 'entry.',
        content: 'NEW',
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(typeof res.data.oldBlockSize).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 4: validate_cbs ---

  it('validate_cbs preserves its structured summary payload', async () => {
    const fixture = { ...createSearchFixture(), description: '{{#when toggle_test::1}}yes{{/when}}' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/cbs/validate');
      expect(res.status).toBe(200);
      expect(res.data.valid).toBe(true);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(res.data.summary).toEqual({ total: 1, passed: 1, failed: 0 });
      expect(res.data).not.toHaveProperty('status');
      expect(res.data).not.toHaveProperty('next_actions');
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 5: list_skills fallback ---

  it('list_skills fallback includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture, [], 'C:\\non\\existent\\path\\skills_missing_12345');
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/skills');
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(0);
      expect(Array.isArray(res.data.skills)).toBe(true);
      expect(typeof res.data.error).toBe('string');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 6: import_lorebook_from_files ---

  it('import_lorebook_from_files empty result includes envelope fields', async () => {
    const importDir = path.join(TEST_DIR, 'envelope-import-empty');
    await fs.promises.rm(importDir, { recursive: true, force: true });
    await fs.promises.mkdir(importDir, { recursive: true });
    const sourcePath = path.join(importDir, 'empty.json');
    await fs.promises.writeFile(sourcePath, JSON.stringify({ entries: [] }, null, 2), 'utf-8');

    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/import', {
        format: 'json',
        source_path: sourcePath,
      });
      expect(res.status).toBe(200);
      expect(res.data.totalFound).toBe(0);
      expect(res.data.imported).toBe(0);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('import_lorebook_from_files dry-run includes envelope fields', async () => {
    const importDir = path.join(TEST_DIR, 'envelope-import-dry-run');
    await fs.promises.rm(importDir, { recursive: true, force: true });
    await fs.promises.mkdir(importDir, { recursive: true });
    const sourcePath = path.join(importDir, 'dry-run.json');
    await fs.promises.writeFile(
      sourcePath,
      JSON.stringify(
        {
          entries: [{ comment: 'Imported dry run', key: 'imported-dry-run', content: 'Imported dry-run content.' }],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/import', {
        format: 'json',
        source_path: sourcePath,
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(res.data.totalFound).toBe(1);
      expect(res.data.toAdd).toBe(1);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expect(fixture.lorebook).toHaveLength(2);
    } finally {
      await closeServer(api.server);
    }
  });

  it('import_lorebook_from_files prefers dry_run when both casing variants are provided', async () => {
    const importDir = path.join(TEST_DIR, 'envelope-import-casing-precedence');
    await fs.promises.rm(importDir, { recursive: true, force: true });
    await fs.promises.mkdir(importDir, { recursive: true });
    const sourcePath = path.join(importDir, 'casing-precedence.json');
    await fs.promises.writeFile(
      sourcePath,
      JSON.stringify(
        {
          entries: [
            { comment: 'Imported precedence', key: 'imported-precedence', content: 'Imported precedence content.' },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/import', {
        format: 'json',
        source_path: sourcePath,
        dry_run: false,
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data).not.toHaveProperty('dryRun');
      expect(res.data.imported).toBe(1);
      expect(res.data.status).toBe(200);
    } finally {
      await closeServer(api.server);
    }
  });

  it('import_lorebook_from_files success broadcasts lorebook updates with the standard channel shape', async () => {
    const importDir = path.join(TEST_DIR, 'envelope-import-success');
    await fs.promises.rm(importDir, { recursive: true, force: true });
    await fs.promises.mkdir(importDir, { recursive: true });
    const sourcePath = path.join(importDir, 'success.json');
    await fs.promises.writeFile(
      sourcePath,
      JSON.stringify(
        {
          entries: [{ comment: 'Imported live', key: 'imported-live', content: 'Imported success content.' }],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const broadcasts: Array<[string, ...unknown[]]> = [];
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      broadcastToAll: (channel, ...args) => {
        broadcasts.push([channel, ...args]);
      },
    });
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/import', {
        format: 'json',
        source_path: sourcePath,
      });
      expect(res.status).toBe(200);
      expect(res.data.imported).toBe(1);
      expect(res.data.status).toBe(200);
      const lorebookBroadcast = broadcasts.find(
        (call) => call[0] === 'data-updated' && call[1] === 'lorebook' && Array.isArray(call[2]),
      );
      expect(lorebookBroadcast).toBeDefined();
      expect(
        (lorebookBroadcast?.[2] as Array<Record<string, unknown>>).some((entry) => entry.comment === 'Imported live'),
      ).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 7: export_field_to_file ---

  it('export_field_to_file includes envelope fields', async () => {
    const exportDir = path.join(TEST_DIR, 'envelope-export-field');
    await fs.promises.rm(exportDir, { recursive: true, force: true });
    await fs.promises.mkdir(exportDir, { recursive: true });
    const targetPath = path.join(exportDir, 'description.txt');
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/export', {
        field: 'description',
        file_path: targetPath,
        format: 'txt',
      });
      expect(res.status).toBe(200);
      expect(res.data.filePath).toBe(path.resolve(targetPath));
      expect(typeof res.data.size).toBe('number');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      await expect(fs.promises.readFile(path.resolve(targetPath), 'utf-8')).resolves.toBe(fixture.description);
    } finally {
      await closeServer(api.server);
    }
  });
});

// ---------------------------------------------------------------------------
// Recovery metadata contract — `retryable` and `next_actions` on error/no-op
//
// These tests verify that mcpError() and mcpNoOp() responses expose additive
// machine-readable recovery metadata (`retryable`, `next_actions`) so agents
// can programmatically decide how to recover from failures.
// ---------------------------------------------------------------------------

interface McpRecoveryEnvelope {
  action: string;
  error: string;
  status: number;
  target: string;
  retryable: boolean;
  next_actions: string[];
  suggestion?: string;
  rejected?: boolean;
  details?: unknown;
}

interface McpNoOpRecoveryEnvelope extends McpRecoveryEnvelope {
  success: false;
  message: string;
}

describe('MCP error recovery metadata — global guards', () => {
  it('unauthorized guard returns retryable: false and empty next_actions', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await getJson<McpRecoveryEnvelope>(api.port, 'wrong-token', '/fields');
      expect(res.status).toBe(401);
      expect(res.data.retryable).toBe(false);
      expect(res.data.next_actions).toEqual([]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('no-file-open guard returns retryable: false and next_actions with open_file, list_references, session_status', async () => {
    const api = await startTestApiServer(null);
    try {
      const res = await getJson<McpRecoveryEnvelope>(api.port, api.token, '/fields');
      expect(res.status).toBe(400);
      expect(res.data.retryable).toBe(false);
      expect(res.data.next_actions).toEqual(['open_file', 'list_references', 'session_status']);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP error recovery metadata — 400 validation', () => {
  it('unknown field GET returns retryable: false and field-family next_actions', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await getJson<McpRecoveryEnvelope>(api.port, api.token, '/field/not-a-real-field');
      expect(res.status).toBe(400);
      expect(res.data.retryable).toBe(false);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expect(res.data.next_actions.length).toBeGreaterThan(0);
      expect(res.data.next_actions).toContain('list_fields');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP error recovery metadata — 409 conflict', () => {
  it('duplicate asset returns retryable: true', async () => {
    const assetPath = 'assets/other/image/recovery-dup.png';
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      assets: [{ path: assetPath, data: Buffer.from('existing-asset') }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpRecoveryEnvelope>(api.port, api.token, '/asset/add', {
        fileName: 'recovery-dup.png',
        base64: Buffer.from('new-asset').toString('base64'),
      });
      expect(res.status).toBe(409);
      expect(res.data.retryable).toBe(true);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP error recovery metadata — no-op responses', () => {
  it('field replace no-match returns retryable: false and field-family next_actions', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpNoOpRecoveryEnvelope>(api.port, api.token, '/field/description/replace', {
        find: 'nonexistent-string-xyz',
        replace: 'replacement',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(false);
      expect(res.data.retryable).toBe(false);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expect(res.data.next_actions.length).toBeGreaterThan(0);
      expect(res.data.next_actions).toContain('search_in_field');
    } finally {
      await closeServer(api.server);
    }
  });
});
