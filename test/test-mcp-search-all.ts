import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { openCharx, openRisum, openRisup, saveCharx, type CharxData } from '../src/charx-io';
import { startApiServer } from '../src/lib/mcp-api-server';

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

interface SearchFixture {
  description?: string;
  firstMessage?: string;
  alternateGreetings?: string[];
  groupOnlyGreetings?: string[];
  lorebook?: Array<{
    comment?: string;
    key?: string;
    content?: string;
  }>;
  [key: string]: unknown;
}

interface McpStatusPayload {
  action?: string;
  status?: number;
  target?: string;
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

function createProbeFixture(): { dir: string; filePath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-probe-mcp-'));
  const filePath = path.join(dir, 'probe-test.charx');
  const data: CharxData = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
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
  saveCharx(filePath, data);
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

async function startTestApiServer(currentData: SearchFixture) {
  let resolvePort!: (port: number) => void;
  const portPromise = new Promise<number>((resolve) => {
    resolvePort = resolve;
  });
  const mcpStatuses: McpStatusPayload[] = [];
  let activeData: SearchFixture | CharxData | null = currentData;

  const api = startApiServer({
    getCurrentData: () => activeData,
    getReferenceFiles: () => [],
    askRendererConfirm: async () => true,
    requestRendererOpenFile: async (request) => {
      activeData = openExternalDocumentForTest(request.filePath);
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
    },
    broadcastToAll: (channel: string, ...args: unknown[]) => {
      void channel;
      void args;
    },
    broadcastMcpStatus: (payload: Record<string, unknown>) => {
      mcpStatuses.push(payload);
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
    openExternalDocument: openExternalDocumentForTest,
    normalizeTriggerScripts: (data: unknown) => data,
    extractPrimaryLua: () => '',
    mergePrimaryLua: (scripts: unknown, lua: string) => {
      void lua;
      return scripts;
    },
    stringifyTriggerScripts: (scripts: unknown) => JSON.stringify(scripts),
    getSkillsDir: () => path.join(__dirname, '..', 'skills'),
  });

  const port = await portPromise;
  return { ...api, port, mcpStatuses };
}

function buildChildEnv(port: number, token: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  env.TOKI_PORT = String(port);
  env.TOKI_TOKEN = token;
  return env;
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      const record = entry as Record<string, unknown>;
      return record.type === 'text' && typeof record.text === 'string' ? record.text : '';
    })
    .filter((value) => value.length > 0)
    .join('\n');
}

function mapSurfacesByTarget(surfaces: Array<{ target?: string }>) {
  return new Map(
    surfaces
      .filter((surface): surface is { target: string; [key: string]: unknown } => typeof surface.target === 'string')
      .map((surface) => [surface.target, surface]),
  );
}

function assertSurfaceSummary(
  surface: { [key: string]: unknown } | undefined,
  expected: {
    surfaceType: string;
    target: string;
    totalMatches: number;
    returnedMatches: number;
    field?: string;
    greetingType?: string;
    index?: number;
    comment?: string;
    key?: string;
    firstMatch?: string;
  },
) {
  assert.ok(surface, `Missing expected surface: ${expected.target}`);
  assert.equal(surface.surfaceType, expected.surfaceType);
  assert.equal(surface.target, expected.target);
  assert.equal(surface.totalMatches, expected.totalMatches);
  assert.equal(surface.returnedMatches, expected.returnedMatches);
  if (expected.field !== undefined) assert.equal(surface.field, expected.field);
  if (expected.greetingType !== undefined) assert.equal(surface.greetingType, expected.greetingType);
  if (expected.index !== undefined) assert.equal(surface.index, expected.index);
  if (expected.comment !== undefined) assert.equal(surface.comment, expected.comment);
  if (expected.key !== undefined) assert.equal(surface.key, expected.key);
  if (expected.firstMatch !== undefined) {
    const matches = Array.isArray(surface.matches) ? surface.matches : [];
    assert.ok(matches.length > 0, `Expected ${expected.target} to include at least one match`);
    const firstMatch = matches[0];
    assert.equal(
      firstMatch && typeof firstMatch === 'object' ? (firstMatch as { match?: unknown }).match : undefined,
      expected.firstMatch,
    );
  }
}

(async function run() {
  const api = await startTestApiServer(createSearchFixture());
  let probeFixture: { dir: string; filePath: string } | null = null;
  const client = new Client({ name: 'mcp-search-smoke-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'toki-mcp-server.js')],
    cwd: path.join(__dirname, '..'),
    env: buildChildEnv(api.port, api.token),
    stderr: 'pipe',
  });

  const stderrChunks: string[] = [];
  const stderrStream = transport.stderr;
  if (stderrStream) {
    stderrStream.on('data', (chunk) => {
      stderrChunks.push(String(chunk));
    });
  }

  let connected = false;

  try {
    probeFixture = createProbeFixture();
    await client.connect(transport);
    connected = true;

    const tools = await client.listTools();
    assert.ok(
      tools.tools.some((tool) => tool.name === 'search_all_fields'),
      'search_all_fields should be registered before the route contract is implemented',
    );
    for (const toolName of ['probe_field', 'probe_field_batch', 'probe_lorebook', 'probe_regex', 'probe_lua']) {
      assert.ok(
        tools.tools.some((tool) => tool.name === toolName),
        `${toolName} should be registered`,
      );
    }
    assert.ok(
      tools.tools.some((tool) => tool.name === 'open_file'),
      'open_file should be registered',
    );

    const fieldSearch = await client.callTool({
      name: 'search_in_field',
      arguments: {
        field: 'description',
        query: 'alpha',
        context_chars: 12,
        max_matches: 5,
      },
    });
    const fieldSearchText = extractTextContent(fieldSearch.content);
    assert.ok(!fieldSearch.isError, `search_in_field should succeed in the MCP smoke test: ${fieldSearchText}`);
    const fieldSearchJson = JSON.parse(fieldSearchText) as {
      field?: string;
      totalMatches?: number;
      returnedMatches?: number;
    };
    assert.equal(fieldSearchJson.field, 'description');
    assert.equal(fieldSearchJson.totalMatches, 1);
    assert.equal(fieldSearchJson.returnedMatches, 1);

    const result = await client.callTool({
      name: 'search_all_fields',
      arguments: {
        query: 'alpha',
        include_lorebook: true,
        include_greetings: true,
        context_chars: 12,
        max_matches_per_field: 5,
      },
    });

    const textContent = extractTextContent(result.content);
    if (result.isError) {
      const searchAllFailure = api.mcpStatuses.find(
        (payload) => payload.action === 'POST /search-all' || payload.target === '/search-all',
      );
      assert.ok(
        searchAllFailure,
        `Expected broadcastMcpStatus to capture the /search-all route failure: ${textContent}`,
      );
      assert.equal(searchAllFailure.action, 'POST /search-all');
      assert.equal(searchAllFailure.status, 404);
      assert.equal(searchAllFailure.target, '/search-all');
      throw new Error(
        `Expected structured search_all_fields JSON, got MCP error: ${textContent}\nRoute failure: ${JSON.stringify(searchAllFailure)}`,
      );
    }

    const parsed = JSON.parse(textContent) as {
      totalMatches?: number;
      surfaces?: Array<{ target?: string; [key: string]: unknown }>;
    };

    assert.equal(parsed.totalMatches, 5);
    assert.equal(parsed.surfaces?.length, 5);
    assert.deepEqual(
      parsed.surfaces?.map((surface) => surface.target).sort(),
      ['field:description', 'field:firstMessage', 'greeting:alternate:0', 'greeting:groupOnly:0', 'lorebook:0'].sort(),
    );

    const surfacesByTarget = mapSurfacesByTarget(parsed.surfaces ?? []);
    assertSurfaceSummary(surfacesByTarget.get('field:description'), {
      surfaceType: 'field',
      target: 'field:description',
      field: 'description',
      totalMatches: 1,
      returnedMatches: 1,
      firstMatch: 'Alpha',
    });
    assertSurfaceSummary(surfacesByTarget.get('field:firstMessage'), {
      surfaceType: 'field',
      target: 'field:firstMessage',
      field: 'firstMessage',
      totalMatches: 1,
      returnedMatches: 1,
      firstMatch: 'alpha',
    });
    assertSurfaceSummary(surfacesByTarget.get('greeting:alternate:0'), {
      surfaceType: 'greeting',
      target: 'greeting:alternate:0',
      field: 'alternateGreetings',
      greetingType: 'alternate',
      index: 0,
      totalMatches: 1,
      returnedMatches: 1,
      firstMatch: 'Alpha',
    });
    assertSurfaceSummary(surfacesByTarget.get('greeting:groupOnly:0'), {
      surfaceType: 'greeting',
      target: 'greeting:groupOnly:0',
      field: 'groupOnlyGreetings',
      greetingType: 'groupOnly',
      index: 0,
      totalMatches: 1,
      returnedMatches: 1,
      firstMatch: 'alpha',
    });
    assertSurfaceSummary(surfacesByTarget.get('lorebook:0'), {
      surfaceType: 'lorebook',
      target: 'lorebook:0',
      index: 0,
      comment: 'Bridge lore',
      key: 'bridge',
      totalMatches: 1,
      returnedMatches: 1,
      firstMatch: 'alpha',
    });

    const probeField = await client.callTool({
      name: 'probe_field',
      arguments: {
        file_path: probeFixture.filePath,
        field: 'description',
      },
    });
    const probeFieldText = extractTextContent(probeField.content);
    assert.ok(!probeField.isError, `probe_field should succeed: ${probeFieldText}`);
    const probeFieldJson = JSON.parse(probeFieldText) as { field?: string; content?: string };
    assert.equal(probeFieldJson.field, 'description');
    assert.equal(probeFieldJson.content, 'Probe description field.');

    const probeFieldBatch = await client.callTool({
      name: 'probe_field_batch',
      arguments: {
        file_path: probeFixture.filePath,
        fields: ['description', 'firstMessage'],
      },
    });
    const probeFieldBatchText = extractTextContent(probeFieldBatch.content);
    assert.ok(!probeFieldBatch.isError, `probe_field_batch should succeed: ${probeFieldBatchText}`);
    const probeFieldBatchJson = JSON.parse(probeFieldBatchText) as {
      count?: number;
      fields?: Array<{ field?: string; content?: string }>;
    };
    assert.equal(probeFieldBatchJson.count, 2);
    assert.deepEqual(
      probeFieldBatchJson.fields?.map((entry) => ({ field: entry.field, content: entry.content })),
      [
        { field: 'description', content: 'Probe description field.' },
        { field: 'firstMessage', content: 'Hello from probe.' },
      ],
    );

    const probeLorebook = await client.callTool({
      name: 'probe_lorebook',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const probeLorebookText = extractTextContent(probeLorebook.content);
    assert.ok(!probeLorebook.isError, `probe_lorebook should succeed: ${probeLorebookText}`);
    const probeLorebookJson = JSON.parse(probeLorebookText) as {
      entries?: Array<{ comment?: string }>;
    };
    assert.deepEqual(
      probeLorebookJson.entries?.map((entry) => entry.comment),
      ['Lore A', 'Lore B'],
    );

    const probeRegex = await client.callTool({
      name: 'probe_regex',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const probeRegexText = extractTextContent(probeRegex.content);
    assert.ok(!probeRegex.isError, `probe_regex should succeed: ${probeRegexText}`);
    const probeRegexJson = JSON.parse(probeRegexText) as {
      entries?: Array<{ comment?: string }>;
    };
    assert.deepEqual(
      probeRegexJson.entries?.map((entry) => entry.comment),
      ['Regex A'],
    );

    const probeLua = await client.callTool({
      name: 'probe_lua',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const probeLuaText = extractTextContent(probeLua.content);
    assert.ok(!probeLua.isError, `probe_lua should succeed: ${probeLuaText}`);
    const probeLuaJson = JSON.parse(probeLuaText) as {
      sections?: unknown[];
    };
    assert.ok(Array.isArray(probeLuaJson.sections), 'probe_lua should return a sections array');

    const openFile = await client.callTool({
      name: 'open_file',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const openFileText = extractTextContent(openFile.content);
    assert.ok(!openFile.isError, `open_file should succeed: ${openFileText}`);
    const openFileJson = JSON.parse(openFileText) as {
      file_path?: string;
      file_type?: string;
      name?: string;
      switched?: boolean;
    };
    assert.equal(openFileJson.file_path, probeFixture.filePath);
    assert.equal(openFileJson.file_type, 'charx');
    assert.equal(openFileJson.name, 'ProbeChar');
    assert.equal(openFileJson.switched, true);

    const currentFieldAfterOpen = await client.callTool({
      name: 'read_field',
      arguments: {
        field: 'description',
      },
    });
    const currentFieldAfterOpenText = extractTextContent(currentFieldAfterOpen.content);
    assert.ok(
      !currentFieldAfterOpen.isError,
      `read_field after open_file should succeed: ${currentFieldAfterOpenText}`,
    );
    const currentFieldAfterOpenJson = JSON.parse(currentFieldAfterOpenText) as {
      content?: string;
      field?: string;
    };
    assert.equal(currentFieldAfterOpenJson.field, 'description');
    assert.equal(currentFieldAfterOpenJson.content, 'Probe description field.');

    console.log('search_all_fields MCP smoke test passed');
  } catch (error) {
    const stderrText = stderrChunks.join('').trim();
    const detail =
      error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error, null, 2);
    throw new Error(stderrText ? `${detail}\n\nMCP stderr:\n${stderrText}` : detail);
  } finally {
    if (connected) {
      await client.close().catch(() => undefined);
    } else {
      await transport.close().catch(() => undefined);
    }
    await closeServer(api.server);
    if (probeFixture) {
      fs.rmSync(probeFixture.dir, { recursive: true, force: true });
    }
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
