import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { openCharx, openRisum, openRisup, saveCharx, saveRisum, saveRisup, type CharxData } from '../src/charx-io';
import { startApiServer } from '../src/lib/mcp-api-server';

const TEST_DIR = path.join(__dirname, '_mcp-search-tmp');

function parseLuaSections() {
  return [];
}

function combineLuaSections() {
  return '';
}

function detectLuaSection() {
  return null;
}

function parseCssSections(css: string) {
  return css.trim().length > 0
    ? { sections: [{ name: 'main', content: css }], prefix: '', suffix: '' }
    : { sections: [], prefix: '', suffix: '' };
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

function saveExternalDocumentForTest(filePath: string, data: CharxData): void {
  if (filePath.endsWith('.risum')) {
    saveRisum(filePath, data as unknown as CharxData);
    return;
  }
  if (filePath.endsWith('.risup')) {
    saveRisup(filePath, data as unknown as CharxData);
    return;
  }
  saveCharx(filePath, data);
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
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TEST_DIR, 'probe-mcp-'));
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

function dogfoodCardData(name: string, description: string): CharxData {
  return {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name,
    description,
    personality: 'Facade-first',
    scenario: 'Standalone MCP dogfood scenario.',
    creatorcomment: 'Executable facade dogfood fixture',
    tags: ['facade', 'dogfood'],
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
    firstMessage: 'Facade hello.',
    alternateGreetings: ['Facade alternate hello.'],
    groupOnlyGreetings: ['Facade group hello.'],
    globalNote: 'Destructive preview keeps this note until apply.',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: [],
    lorebook: [
      {
        comment: 'Facade Lore',
        key: 'facade',
        secondkey: '',
        content: 'Facade lore body.',
        insertorder: 100,
        alwaysActive: false,
        selective: false,
        mode: 'normal',
      },
    ],
    regex: [{ comment: 'Facade Regex', type: 'editoutput', find: 'Facade', replace: 'Surface', flag: 'g' }],
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

function createDogfoodFixtures(): {
  dir: string;
  mainFile: string;
  externalFile: string;
  referenceRisum: string;
  referenceRisup: string;
  referenceCharx: string;
  userDataDir: string;
} {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TEST_DIR, 'facade-dogfood-'));
  const mainFile = path.join(dir, 'active.charx');
  const externalFile = path.join(dir, 'external.charx');
  const referenceRisum = path.join(dir, 'reference.risum');
  const referenceRisup = path.join(dir, 'reference.risup');
  const referenceCharx = path.join(dir, 'reference.charx');
  const userDataDir = path.join(dir, 'user-data');

  saveCharx(mainFile, dogfoodCardData('Facade Active', 'Alpha facade dogfood description.'));
  saveCharx(externalFile, dogfoodCardData('Facade External', 'External facade dogfood description.'));
  saveCharx(referenceCharx, dogfoodCardData('Facade Reference Card', 'Reference charx facade dogfood description.'));
  saveRisum(referenceRisum, {
    _fileType: 'risum',
    name: 'Facade Reference Module',
    description: 'Reference risum facade dogfood description.',
    moduleName: 'Facade Reference Module',
    moduleNamespace: 'facade.reference',
    lowLevelAccess: false,
    hideIcon: false,
    lorebook: [
      {
        comment: 'Reference Facade Lore',
        key: 'reference-facade',
        secondkey: '',
        content: 'Reference facade lore body.',
        insertorder: 100,
        alwaysActive: false,
        selective: false,
        mode: 'normal',
      },
    ],
    alternateGreetings: ['Reference alternate hello.'],
    groupOnlyGreetings: ['Reference group hello.'],
    regex: [{ comment: 'Reference Regex', type: 'editoutput', find: 'Reference', replace: 'Mirror', flag: 'g' }],
  } as unknown as CharxData);
  saveRisup(referenceRisup, {
    _fileType: 'risup',
    name: 'Facade Reference Preset',
    description: 'Reference risup facade dogfood description.',
    promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Preset facade prompt', role: 'system' }]),
    formatingOrder: JSON.stringify(['main', 'description']),
    presetBias: '[]',
    localStopStrings: '[]',
  } as unknown as CharxData);

  return { dir, mainFile, externalFile, referenceRisum, referenceRisup, referenceCharx, userDataDir };
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
  let activeFilePath: string | null = null;

  const api = startApiServer({
    getCurrentData: () => activeData,
    getReferenceFiles: () => [],
    askRendererConfirm: async () => true,
    requestRendererOpenFile: async (request) => {
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
    saveExternalDocument: (filePath, _fileType, data) => saveExternalDocumentForTest(filePath, data),
    normalizeTriggerScripts: (data: unknown) => data,
    extractPrimaryLua: () => '',
    mergePrimaryLua: (scripts: unknown, lua: string) => {
      void lua;
      return scripts;
    },
    stringifyTriggerScripts: (scripts: unknown) => JSON.stringify(scripts),
    getSkillRoots: () => [path.join(__dirname, '..', 'skills')],
    getUserDataPath: () => path.join(TEST_DIR, 'api-user-data'),
    getCurrentFilePath: () => activeFilePath,
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

function assertToolListMetadata(
  tools: Array<{ name: string; _meta?: Record<string, unknown> }>,
  toolName: string,
  expected: {
    family: string;
    staleGuards: string[];
    staleGuardDetails?: Array<Record<string, unknown>>;
    requiresConfirmation?: boolean;
    supportsDryRun?: boolean;
    surfaceKind?: string;
    recommendation?: string;
    workflowStages?: string[];
    profiles?: string[];
    defaultProfile?: string;
  },
) {
  const tool = tools.find((candidate) => candidate.name === toolName);
  assert.ok(tool, `${toolName} should be registered`);
  assert.equal(tool._meta?.['risutoki/family'], expected.family);
  assert.deepEqual(tool._meta?.['risutoki/staleGuards'], expected.staleGuards);
  if (expected.surfaceKind !== undefined) {
    assert.equal(tool._meta?.['risutoki/surfaceKind'], expected.surfaceKind);
  }
  if (expected.recommendation !== undefined) {
    assert.equal(tool._meta?.['risutoki/recommendation'], expected.recommendation);
  }
  if (expected.workflowStages !== undefined) {
    assert.deepEqual(tool._meta?.['risutoki/workflowStages'], expected.workflowStages);
  }
  if (expected.profiles !== undefined) {
    assert.deepEqual(tool._meta?.['risutoki/profiles'], expected.profiles);
  }
  if (expected.defaultProfile !== undefined) {
    assert.equal(tool._meta?.['risutoki/defaultProfile'], expected.defaultProfile);
  }
  if (expected.staleGuardDetails !== undefined) {
    assert.deepEqual(tool._meta?.['risutoki/staleGuardDetails'], expected.staleGuardDetails);
  }
  assert.equal(tool._meta?.['risutoki/requiresConfirmation'], expected.requiresConfirmation);
  assert.equal(tool._meta?.['risutoki/supportsDryRun'], expected.supportsDryRun);
}

type McpCallJson = Record<string, unknown>;

interface StandaloneClientRuntime {
  client: Client;
  stderrChunks: string[];
  close: () => Promise<void>;
}

async function startStandaloneClient(options: {
  file?: string;
  refs?: string[];
  userDataDir: string;
  allowWrites?: boolean;
}): Promise<StandaloneClientRuntime> {
  const args = [
    path.join(__dirname, '..', 'toki-mcp-server.js'),
    '--standalone',
    '--user-data-dir',
    options.userDataDir,
  ];
  if (options.allowWrites) args.push('--allow-writes');
  if (options.file) args.push('--file', options.file);
  for (const ref of options.refs ?? []) args.push('--ref', ref);

  const client = new Client({ name: 'mcp-facade-dogfood-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    cwd: path.join(__dirname, '..'),
    stderr: 'pipe',
  });
  const stderrChunks: string[] = [];
  const stderrStream = transport.stderr;
  if (stderrStream) stderrStream.on('data', (chunk) => stderrChunks.push(String(chunk)));
  await client.connect(transport);

  return {
    client,
    stderrChunks,
    close: async () => {
      await client.close().catch(() => undefined);
    },
  };
}

async function callJson(
  runtime: StandaloneClientRuntime,
  name: string,
  args: Record<string, unknown>,
  options: { expectError?: boolean } = {},
): Promise<McpCallJson> {
  const result = await runtime.client.callTool({ name, arguments: args });
  const text = extractTextContent(result.content);
  if (options.expectError) {
    assert.equal(result.isError, true, `${name} should return a structured MCP error`);
  } else {
    assert.ok(!result.isError, `${name} should succeed: ${text}`);
  }
  return JSON.parse(text) as McpCallJson;
}

function nestedRecord(value: unknown, label: string): McpCallJson {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} should be an object`);
  return value as McpCallJson;
}

function nestedArray(value: unknown, label: string): unknown[] {
  assert.ok(Array.isArray(value), `${label} should be an array`);
  return value;
}

function routedTools(envelope: McpCallJson): string[] {
  const artifacts = nestedRecord(envelope.artifacts, 'artifacts');
  const tools = artifacts.routed_tools;
  assert.ok(Array.isArray(tools), 'artifacts.routed_tools should be present for facade metrics');
  return tools.map(String);
}

async function runStandaloneFacadeDogfood(): Promise<void> {
  const fixture = createDogfoodFixtures();
  const activeTarget = { kind: 'active' };
  const referenceTarget = { kind: 'reference', reference_id: '0' };
  const presetReferenceTarget = { kind: 'reference', reference_id: '1' };
  const cardReferenceTarget = { kind: 'reference', reference_id: '2' };
  const externalTarget = { kind: 'external', file_path: fixture.externalFile };
  const facadeOnlyCalls: string[] = [];
  const metrics = {
    toolListByteCost: 0,
    facadeToolListByteCost: 0,
    activeWorkflowCallCount: 0,
    wrongToolAvoidance: true,
    granularFallbackFrequency: 0,
    staleGuardReuse: false,
    finalArtifactEquality: false,
  };

  let runtime: StandaloneClientRuntime | null = null;
  let recoveryRuntime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startStandaloneClient({
      file: fixture.mainFile,
      refs: [fixture.referenceRisum, fixture.referenceRisup, fixture.referenceCharx],
      userDataDir: fixture.userDataDir,
      allowWrites: true,
    });

    const tools = await runtime.client.listTools();
    metrics.toolListByteCost = Buffer.byteLength(JSON.stringify(tools.tools), 'utf-8');
    metrics.facadeToolListByteCost = Buffer.byteLength(
      JSON.stringify(
        tools.tools.filter((tool) =>
          [
            'inspect_document',
            'list_tool_profiles',
            'read_content',
            'search_document',
            'preview_edit',
            'apply_edit',
            'validate_content',
            'load_guidance',
          ].includes(tool.name),
        ),
      ),
      'utf-8',
    );
    assert.ok(metrics.toolListByteCost > metrics.facadeToolListByteCost);

    for (const name of [
      'inspect_document',
      'list_tool_profiles',
      'search_document',
      'read_content',
      'preview_edit',
      'apply_edit',
      'validate_content',
      'load_guidance',
    ]) {
      const tool = tools.tools.find((candidate) => candidate.name === name);
      assert.equal(tool?._meta?.['risutoki/surfaceKind'], 'facade');
      assert.equal(tool?._meta?.['risutoki/recommendation'], 'preferred');
      assert.ok(Array.isArray(tool?._meta?.['risutoki/workflowStages']));
    }

    facadeOnlyCalls.push('inspect_document');
    const profileCatalog = await callJson(runtime, 'list_tool_profiles', { profile: 'facade-first' });
    const profile = nestedRecord(profileCatalog.profile, 'profile catalog');
    assert.equal(profile.resolvedProfile, 'facade-first');
    assert.equal(profile.toolsListBehavior, 'unfiltered-compatible');
    const profileTools = nestedArray(profile.tools, 'profile catalog.tools');
    assert.ok(profileTools.length < tools.tools.length, 'facade-first profile catalog should be compact');
    assert.ok(profileTools.some((tool) => nestedRecord(tool, 'profile tool').name === 'inspect_document'));
    const fullProfileCatalog = await callJson(runtime, 'list_tool_profiles', { profile: 'full' });
    const fullProfile = nestedRecord(fullProfileCatalog.profile, 'full profile catalog');
    assert.equal(fullProfile.resolvedProfile, 'advanced-full');
    assert.equal(nestedArray(fullProfile.tools, 'full profile tools').length, tools.tools.length);

    const inspect = await callJson(runtime, 'inspect_document', { target: activeTarget, max_bytes: 32000 });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(inspect), ['session_status', 'list_fields', 'list_surfaces']);
    const inspectResult = nestedRecord(inspect.result, 'inspect result');
    const surfaces = nestedRecord(inspectResult.surfaces, 'inspect result.surfaces');
    const rootHash = String(surfaces.document_hash ?? '');
    assert.ok(rootHash.length > 0, 'active inspect should expose document_hash for stale guard reuse');

    facadeOnlyCalls.push('search_document');
    const search = await callJson(runtime, 'search_document', {
      target: activeTarget,
      query: 'Alpha',
      context_chars: 12,
      max_matches: 5,
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(search), ['search_all_fields']);

    facadeOnlyCalls.push('read_content');
    const readBefore = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(readBefore), ['read_field']);

    const lorebookReadBefore = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'lorebook', index: 0 }],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(lorebookReadBefore), ['read_lorebook']);
    const lorebookReadItems = nestedArray(
      nestedRecord(lorebookReadBefore.result, 'lorebook read result').items,
      'lorebook read result.items',
    );
    const lorebookData = nestedRecord(
      nestedRecord(lorebookReadItems[0], 'lorebook read item').data,
      'lorebook read data',
    );
    assert.equal(nestedRecord(lorebookData.entry, 'lorebook entry').content, 'Facade lore body.');

    const activeRegexReads = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'regex' }, { family: 'regex', index: 0 }, { family: 'regex', indices: [0] }],
    });
    assert.deepEqual(routedTools(activeRegexReads), ['list_regex', 'read_regex', 'read_regex_batch']);
    const activeRegexItems = nestedArray(
      nestedRecord(activeRegexReads.result, 'active regex read result').items,
      'active regex read result.items',
    );
    const activeRegexData = nestedRecord(
      nestedRecord(activeRegexItems[1], 'active regex item').data,
      'active regex data',
    );
    assert.equal(nestedRecord(activeRegexData.entry, 'active regex entry').comment, 'Facade Regex');

    const activeGreetingReads = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [
        { family: 'greeting', greeting_type: 'alternate' },
        { family: 'greeting', greeting_type: 'alternate', index: 0 },
        { family: 'greeting', greeting_type: 'alternate', indices: [0] },
        { family: 'greeting', greeting_type: 'group' },
      ],
    });
    assert.deepEqual(routedTools(activeGreetingReads), [
      'list_greetings',
      'read_greeting',
      'read_greeting_batch',
      'list_greetings',
    ]);
    const activeGreetingItems = nestedArray(
      nestedRecord(activeGreetingReads.result, 'active greeting read result').items,
      'active greeting read result.items',
    );
    const activeGreetingData = nestedRecord(
      nestedRecord(activeGreetingItems[1], 'active greeting item').data,
      'active greeting data',
    );
    assert.equal(activeGreetingData.content, 'Facade alternate hello.');

    const missingGreetingType = await callJson(
      runtime,
      'read_content',
      { target: activeTarget, selectors: [{ family: 'greeting' }] },
      { expectError: true },
    );
    assert.equal(missingGreetingType.status, 400);
    assert.match(String(missingGreetingType.suggestion ?? ''), /greeting_type/);

    facadeOnlyCalls.push('validate_content');
    const validation = await callJson(runtime, 'validate_content', {
      target: activeTarget,
      selectors: [{ family: 'lorebook' }],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(validation), ['validate_lorebook_keys']);
    const validationResult = nestedRecord(validation.result, 'validation result');
    const validations = nestedArray(validationResult.validations, 'validation result.validations');
    const lorebookValidation = nestedRecord(nestedRecord(validations[0], 'validation item').data, 'validation data');
    assert.equal(lorebookValidation.issueCount, 0);

    facadeOnlyCalls.push('preview_edit');
    const preview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'description' },
          find: 'Alpha',
          replace: 'Omega',
        },
      ],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(preview), ['replace_in_field']);
    const previewInfo = nestedRecord(preview.preview, 'preview');

    facadeOnlyCalls.push('apply_edit');
    const apply = await callJson(runtime, 'apply_edit', {
      preview_token: previewInfo.preview_token,
      operation_digest: previewInfo.operation_digest,
      target: activeTarget,
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(apply), ['replace_in_field']);

    const lorebookPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'lorebook', index: 0, field: 'content' },
          find: 'Facade',
          replace: 'Updated facade',
          guards: [{ name: 'expected_comment', value: 'Facade Lore' }],
        },
      ],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(lorebookPreview), ['replace_in_lorebook']);
    const lorebookPreviewResult = nestedRecord(lorebookPreview.result, 'lorebook preview result');
    assert.ok(
      nestedArray(lorebookPreviewResult.touched_targets, 'lorebook touched targets').includes('lorebook:0:content'),
    );
    assert.ok(
      nestedArray(lorebookPreviewResult.guard_values, 'lorebook guard values').some(
        (guard) => nestedRecord(guard, 'lorebook guard').name === 'expected_comment',
      ),
    );
    const lorebookPreviewInfo = nestedRecord(lorebookPreview.preview, 'lorebook preview');
    const lorebookApply = await callJson(runtime, 'apply_edit', {
      preview_token: lorebookPreviewInfo.preview_token,
      operation_digest: lorebookPreviewInfo.operation_digest,
      target: activeTarget,
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(lorebookApply), ['replace_in_lorebook']);
    assert.deepEqual(lorebookApply.next_actions, ['validate_content', 'read_content', 'diff_lorebook']);
    const lorebookApplyArtifacts = nestedRecord(lorebookApply.artifacts, 'lorebook apply artifacts');
    assert.deepEqual(lorebookApplyArtifacts.edited_families, ['lorebook']);
    assert.ok(
      nestedArray(lorebookApplyArtifacts.post_edit_validation, 'lorebook post-edit validation').some((item) => {
        const validationItem = nestedRecord(item, 'lorebook post-edit validation item');
        return (
          validationItem.family === 'lorebook' &&
          nestedArray(validationItem.tools, 'validation tools').includes('validate_content')
        );
      }),
    );
    assert.ok(
      nestedArray(lorebookApplyArtifacts.recommended_reads, 'lorebook recommended reads').some(
        (item) => nestedRecord(item, 'lorebook recommended read').tool === 'read_content',
      ),
    );
    assert.ok(
      nestedArray(lorebookApplyArtifacts.recommended_diffs, 'lorebook recommended diffs').some(
        (item) => nestedRecord(item, 'lorebook recommended diff').tool === 'diff_lorebook',
      ),
    );

    const staleLorebookPreview = await callJson(
      runtime,
      'preview_edit',
      {
        target: activeTarget,
        operations: [
          {
            op: 'replace_text',
            selector: { family: 'lorebook', index: 0, field: 'content' },
            find: 'Updated facade',
            replace: 'Stale facade',
            guards: [{ name: 'expected_comment', value: 'Wrong Lore' }],
          },
        ],
      },
      { expectError: true },
    );
    assert.equal(staleLorebookPreview.status, 409);

    const save = await callJson(runtime, 'save_current_file', {});
    metrics.activeWorkflowCallCount += 1;
    assert.equal(save.success, true);

    const persisted = openCharx(fixture.mainFile);
    const readAfter = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    const afterItems = nestedArray(
      nestedRecord(readAfter.result, 'read after result').items,
      'read after result.items',
    );
    const afterData = nestedRecord(nestedRecord(afterItems[0], 'read after item').data, 'read after item.data');
    assert.equal(afterData.content, persisted.description);
    assert.equal(persisted.description, 'Omega facade dogfood description.');
    assert.equal((persisted.lorebook[0] as { content?: string } | undefined)?.content, 'Updated facade lore body.');
    metrics.finalArtifactEquality = true;

    const referenceInspect = await callJson(runtime, 'inspect_document', { target: referenceTarget });
    assert.deepEqual(routedTools(referenceInspect), ['list_references']);
    const referenceRead = await callJson(runtime, 'read_content', {
      target: referenceTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    assert.deepEqual(routedTools(referenceRead), ['read_reference_field']);
    const referenceItems = nestedArray(
      nestedRecord(referenceRead.result, 'reference read result').items,
      'reference read result.items',
    );
    const referenceData = nestedRecord(nestedRecord(referenceItems[0], 'reference read item').data, 'reference data');
    assert.equal(referenceData.content, openRisum(fixture.referenceRisum).description);
    const referenceLorebookList = await callJson(runtime, 'read_content', {
      target: referenceTarget,
      selectors: [{ family: 'lorebook' }],
    });
    assert.deepEqual(routedTools(referenceLorebookList), ['list_reference_lorebook']);
    const referenceLorebookRead = await callJson(runtime, 'read_content', {
      target: referenceTarget,
      selectors: [{ family: 'lorebook', index: 0 }],
    });
    assert.deepEqual(routedTools(referenceLorebookRead), ['read_reference_lorebook']);
    const referenceLorebookItems = nestedArray(
      nestedRecord(referenceLorebookRead.result, 'reference lorebook result').items,
      'reference lorebook items',
    );
    const referenceLorebookData = nestedRecord(
      nestedRecord(referenceLorebookItems[0], 'reference lorebook item').data,
      'reference lorebook data',
    );
    assert.equal(
      nestedRecord(referenceLorebookData.entry, 'reference lorebook entry').content,
      'Reference facade lore body.',
    );

    const referenceRegexReads = await callJson(runtime, 'read_content', {
      target: referenceTarget,
      selectors: [{ family: 'regex' }, { family: 'regex', index: 0 }, { family: 'regex', indices: [0] }],
    });
    assert.deepEqual(routedTools(referenceRegexReads), [
      'list_reference_regex',
      'read_reference_regex',
      'read_reference_regex_batch',
    ]);
    const referenceRegexItems = nestedArray(
      nestedRecord(referenceRegexReads.result, 'reference regex read result').items,
      'reference regex read result.items',
    );
    const referenceRegexData = nestedRecord(
      nestedRecord(referenceRegexItems[1], 'reference regex item').data,
      'reference regex data',
    );
    assert.equal(nestedRecord(referenceRegexData.entry, 'reference regex entry').comment, 'Reference Regex');

    const referenceGreetingReads = await callJson(runtime, 'read_content', {
      target: cardReferenceTarget,
      selectors: [
        { family: 'greeting', greeting_type: 'alternate' },
        { family: 'greeting', greeting_type: 'alternate', index: 0 },
        { family: 'greeting', greeting_type: 'alternate', indices: [0] },
        { family: 'greeting', greeting_type: 'group' },
      ],
    });
    assert.deepEqual(routedTools(referenceGreetingReads), [
      'list_reference_greetings',
      'read_reference_greeting',
      'read_reference_greeting_batch',
      'list_reference_greetings',
    ]);
    const referenceGreetingItems = nestedArray(
      nestedRecord(referenceGreetingReads.result, 'reference greeting read result').items,
      'reference greeting read result.items',
    );
    const referenceGreetingData = nestedRecord(
      nestedRecord(referenceGreetingItems[1], 'reference greeting item').data,
      'reference greeting data',
    );
    assert.equal(referenceGreetingData.content, 'Facade alternate hello.');

    const referenceSearch = await callJson(runtime, 'search_document', {
      target: referenceTarget,
      field: 'description',
      query: 'risum',
    });
    assert.deepEqual(routedTools(referenceSearch), ['search_in_reference_field']);
    const presetReferenceRead = await callJson(runtime, 'read_content', {
      target: presetReferenceTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    assert.deepEqual(routedTools(presetReferenceRead), ['read_reference_field']);
    const presetReferenceItems = nestedArray(
      nestedRecord(presetReferenceRead.result, 'preset reference read result').items,
      'preset reference read result.items',
    );
    const presetReferenceData = nestedRecord(
      nestedRecord(presetReferenceItems[0], 'preset reference read item').data,
      'preset reference data',
    );
    assert.equal(presetReferenceData.content, openRisup(fixture.referenceRisup).description);
    const presetPromptReads = await callJson(runtime, 'read_content', {
      target: presetReferenceTarget,
      selectors: [
        { family: 'risup-prompt' },
        { family: 'risup-prompt', index: 0 },
        { family: 'risup-prompt', indices: [0] },
      ],
    });
    assert.deepEqual(routedTools(presetPromptReads), [
      'list_reference_risup_prompt_items',
      'read_reference_risup_prompt_item',
      'read_reference_risup_prompt_item_batch',
    ]);
    const presetPromptItems = nestedArray(
      nestedRecord(presetPromptReads.result, 'preset prompt read result').items,
      'preset prompt read result.items',
    );
    const presetPromptData = nestedRecord(
      nestedRecord(presetPromptItems[1], 'preset prompt item').data,
      'preset prompt data',
    );
    assert.equal(nestedRecord(presetPromptData.item, 'preset prompt data.item').text, 'Preset facade prompt');

    facadeOnlyCalls.push('load_guidance');
    const guidance = await callJson(runtime, 'load_guidance', {
      target: { kind: 'guidance', skill: 'using-mcp-tools' },
      max_bytes: 4096,
    });
    assert.deepEqual(routedTools(guidance), ['read_skill']);

    const externalInspect = await callJson(runtime, 'inspect_document', { target: externalTarget });
    assert.deepEqual(routedTools(externalInspect), ['inspect_external_file']);
    const externalRead = await callJson(runtime, 'read_content', {
      target: externalTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    assert.deepEqual(routedTools(externalRead), ['probe_field']);
    facadeOnlyCalls.push('preview_edit');
    const externalPreview = await callJson(runtime, 'preview_edit', {
      target: externalTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'description' },
          find: 'External',
          replace: 'Edited external',
        },
      ],
    });
    assert.deepEqual(routedTools(externalPreview), ['external_replace_in_field']);
    const externalPreviewInfo = nestedRecord(externalPreview.preview, 'external preview');
    facadeOnlyCalls.push('apply_edit');
    const externalApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalPreviewInfo.preview_token,
      operation_digest: externalPreviewInfo.operation_digest,
      target: externalTarget,
    });
    assert.deepEqual(routedTools(externalApply), ['external_replace_in_field']);
    assert.equal(openCharx(fixture.externalFile).description, 'Edited external facade dogfood description.');

    const refreshedInspect = await callJson(runtime, 'inspect_document', { target: activeTarget, max_bytes: 32000 });
    const refreshedSurfaces = nestedRecord(
      nestedRecord(refreshedInspect.result, 'refreshed inspect result').surfaces,
      'refreshed inspect surfaces',
    );
    const refreshedRootHash = String(refreshedSurfaces.document_hash ?? '');
    assert.ok(refreshedRootHash.length > 0 && refreshedRootHash !== rootHash);

    const destructivePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'patch_surface',
          selector: { family: 'surface', path: '/' },
          content: [{ op: 'remove', path: '/globalNote' }],
          guards: [
            {
              name: 'expected_hash',
              value: refreshedRootHash,
              payloadPath: '/expected_hash',
              sourceOperations: ['inspect_document'],
              sourceResultPath: '/result/surfaces/document_hash',
            },
          ],
        },
      ],
    });
    assert.deepEqual(routedTools(destructivePreview), ['patch_surface']);
    assert.equal(openCharx(fixture.mainFile).globalNote, 'Destructive preview keeps this note until apply.');
    const destructivePreviewInfo = nestedRecord(destructivePreview.preview, 'destructive preview');
    assert.deepEqual(destructivePreviewInfo.required_guards, [
      {
        name: 'expected_hash',
        value: refreshedRootHash,
        payloadPath: '/expected_hash',
        sourceOperations: ['inspect_document'],
        sourceResultPath: '/result/surfaces/document_hash',
      },
    ]);
    metrics.staleGuardReuse = true;

    recoveryRuntime = await startStandaloneClient({
      refs: [fixture.referenceRisum],
      userDataDir: path.join(fixture.dir, 'recovery-user-data'),
    });
    const sessionInspect = await callJson(recoveryRuntime, 'inspect_document', { target: { kind: 'session' } });
    assert.deepEqual(routedTools(sessionInspect), ['session_status']);
    const noActiveRead = await callJson(
      recoveryRuntime,
      'read_content',
      { target: activeTarget, selectors: [{ family: 'field', field: 'description' }] },
      { expectError: true },
    );
    assert.equal(noActiveRead.status, 400);
    assert.equal(noActiveRead.target, 'document:current');
    const recoveryExternalInspect = await callJson(recoveryRuntime, 'inspect_document', {
      target: { kind: 'external', file_path: fixture.mainFile },
    });
    assert.deepEqual(routedTools(recoveryExternalInspect), ['inspect_external_file']);
    const opened = await callJson(recoveryRuntime, 'open_file', { file_path: fixture.mainFile });
    assert.equal(opened.file_path, fixture.mainFile);
    assert.equal(opened.file_type, 'charx');
    const recoveredRead = await callJson(recoveryRuntime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    assert.deepEqual(routedTools(recoveredRead), ['read_field']);
    const openedPreset = await callJson(recoveryRuntime, 'open_file', { file_path: fixture.referenceRisup });
    assert.equal(openedPreset.file_type, 'risup');
    const activePresetPromptReads = await callJson(recoveryRuntime, 'read_content', {
      target: activeTarget,
      selectors: [
        { family: 'risup-prompt' },
        { family: 'risup-prompt', index: 0 },
        { family: 'risup-prompt', indices: [0] },
      ],
    });
    assert.deepEqual(routedTools(activePresetPromptReads), [
      'list_risup_prompt_items',
      'read_risup_prompt_item',
      'read_risup_prompt_item_batch',
    ]);
    const activePresetSearch = await callJson(recoveryRuntime, 'search_document', {
      target: activeTarget,
      field: 'risup-prompt',
      query: 'Preset',
    });
    assert.deepEqual(routedTools(activePresetSearch), ['search_in_risup_prompt_items']);

    const wrongTools = ['read_field', 'write_field', 'replace_in_field', 'patch_surface'];
    metrics.wrongToolAvoidance = facadeOnlyCalls.every((name) => !wrongTools.includes(name));
    assert.equal(metrics.wrongToolAvoidance, true);
    assert.equal(metrics.activeWorkflowCallCount, 10);
    assert.equal(metrics.granularFallbackFrequency, 0);
    assert.equal(metrics.staleGuardReuse, true);
    assert.equal(metrics.finalArtifactEquality, true);
  } catch (error) {
    const stderrText = [runtime, recoveryRuntime]
      .flatMap((candidate) => candidate?.stderrChunks ?? [])
      .join('')
      .trim();
    const detail =
      error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error, null, 2);
    throw new Error(stderrText ? `${detail}\n\nStandalone MCP stderr:\n${stderrText}` : detail);
  } finally {
    if (recoveryRuntime) await recoveryRuntime.close();
    if (runtime) await runtime.close();
    fs.rmSync(fixture.dir, { recursive: true, force: true });
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
    for (const toolName of [
      'probe_field',
      'probe_field_batch',
      'probe_lorebook',
      'probe_regex',
      'probe_lua',
      'probe_css',
      'probe_greetings',
      'probe_triggers',
      'probe_risup_prompt_items',
      'probe_risup_formating_order',
      'inspect_external_file',
      'external_write_field',
      'external_write_field_batch',
      'external_search_in_field',
      'external_read_field_range',
      'external_replace_in_field',
      'external_insert_in_field',
    ]) {
      assert.ok(
        tools.tools.some((tool) => tool.name === toolName),
        `${toolName} should be registered`,
      );
    }
    assert.ok(
      tools.tools.some((tool) => tool.name === 'open_file'),
      'open_file should be registered',
    );
    assertToolListMetadata(tools.tools, 'list_fields', {
      family: 'field',
      staleGuards: [],
    });
    assertToolListMetadata(tools.tools, 'write_lorebook', {
      family: 'lorebook',
      staleGuards: ['expected_comment'],
      staleGuardDetails: [
        {
          name: 'expected_comment',
          payloadPath: '/expected_comment',
          sourceOperations: ['list_lorebook', 'read_lorebook'],
          sourceResultPath: '/entries/*/comment or /comment',
          retry: 'On 409, refresh with the source operation(s), then retry with current guard value(s).',
        },
      ],
      requiresConfirmation: true,
      supportsDryRun: false,
      workflowStages: ['apply'],
    });
    assertToolListMetadata(tools.tools, 'replace_in_field', {
      family: 'field',
      staleGuards: [],
      requiresConfirmation: true,
      supportsDryRun: true,
      workflowStages: ['preview', 'apply'],
    });
    assertToolListMetadata(tools.tools, 'open_file', {
      family: 'probe',
      staleGuards: [],
      requiresConfirmation: false,
      supportsDryRun: false,
    });
    assertToolListMetadata(tools.tools, 'external_replace_in_field', {
      family: 'external',
      staleGuards: [],
      requiresConfirmation: true,
      supportsDryRun: true,
      workflowStages: ['preview', 'apply'],
    });
    for (const toolName of [
      'inspect_document',
      'list_tool_profiles',
      'read_content',
      'search_document',
      'preview_edit',
      'apply_edit',
      'validate_content',
      'load_guidance',
    ]) {
      assert.ok(
        tools.tools.some((tool) => tool.name === toolName),
        `${toolName} should be registered as a first-wave facade tool`,
      );
    }
    assertToolListMetadata(tools.tools, 'inspect_document', {
      family: 'session',
      staleGuards: [],
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['discover'],
      profiles: ['facade-first', 'authoring', 'advanced-full', 'readonly'],
      defaultProfile: 'facade-first',
    });
    assertToolListMetadata(tools.tools, 'list_tool_profiles', {
      family: 'session',
      staleGuards: [],
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['discover'],
      profiles: ['facade-first', 'authoring', 'advanced-full', 'readonly'],
      defaultProfile: 'facade-first',
    });
    assertToolListMetadata(tools.tools, 'preview_edit', {
      family: 'surface',
      staleGuards: [],
      requiresConfirmation: false,
      supportsDryRun: true,
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['preview'],
      profiles: ['facade-first', 'authoring', 'advanced-full'],
      defaultProfile: 'facade-first',
    });
    assertToolListMetadata(tools.tools, 'apply_edit', {
      family: 'surface',
      staleGuards: [],
      requiresConfirmation: true,
      supportsDryRun: false,
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['apply'],
      profiles: ['facade-first', 'authoring', 'advanced-full'],
      defaultProfile: 'facade-first',
    });

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

    const inspectFacade = await client.callTool({
      name: 'inspect_document',
      arguments: {
        target: { kind: 'active' },
      },
    });
    const inspectFacadeText = extractTextContent(inspectFacade.content);
    assert.ok(!inspectFacade.isError, `inspect_document should succeed: ${inspectFacadeText}`);
    const inspectFacadeJson = JSON.parse(inspectFacadeText) as {
      facade?: { tool?: string };
      result?: { routed_legacy?: Array<{ tool?: string }> };
    };
    assert.equal(inspectFacadeJson.facade?.tool, 'inspect_document');
    assert.ok(
      inspectFacadeJson.result?.routed_legacy?.some((entry) => entry.tool === 'session_status'),
      'inspect_document should report routed session_status legacy route',
    );

    const previewFacade = await client.callTool({
      name: 'preview_edit',
      arguments: {
        target: { kind: 'active' },
        operations: [
          {
            op: 'replace_text',
            selector: { family: 'field', field: 'description' },
            find: 'Field Alpha',
            replace: 'Field Beta',
          },
        ],
        dry_run: true,
      },
    });
    const previewFacadeText = extractTextContent(previewFacade.content);
    assert.ok(!previewFacade.isError, `preview_edit should succeed: ${previewFacadeText}`);
    const previewFacadeJson = JSON.parse(previewFacadeText) as {
      preview?: { preview_token?: string; operation_digest?: string };
      result?: { routed_legacy?: Array<{ tool?: string }>; touched_targets?: string[] };
    };
    assert.ok(previewFacadeJson.preview?.preview_token, 'preview_edit should return a preview token');
    assert.ok(previewFacadeJson.preview?.operation_digest, 'preview_edit should return an operation digest');
    assert.ok(previewFacadeJson.result?.touched_targets?.includes('field:description'));
    assert.ok(previewFacadeJson.result?.routed_legacy?.some((entry) => entry.tool === 'replace_in_field'));

    const applyFacade = await client.callTool({
      name: 'apply_edit',
      arguments: {
        target: { kind: 'active' },
        preview_token: previewFacadeJson.preview.preview_token,
        operation_digest: previewFacadeJson.preview.operation_digest,
      },
    });
    const applyFacadeText = extractTextContent(applyFacade.content);
    assert.ok(!applyFacade.isError, `apply_edit should succeed: ${applyFacadeText}`);
    const applyFacadeJson = JSON.parse(applyFacadeText) as {
      facade?: { tool?: string };
      result?: { routed_legacy?: Array<{ tool?: string }>; touched_targets?: string[] };
    };
    assert.equal(applyFacadeJson.facade?.tool, 'apply_edit');
    assert.ok(applyFacadeJson.result?.routed_legacy?.some((entry) => entry.tool === 'replace_in_field'));
    assert.ok(applyFacadeJson.result?.touched_targets?.includes('field:description'));

    const readFacade = await client.callTool({
      name: 'read_content',
      arguments: {
        target: { kind: 'active' },
        selectors: [{ family: 'field', field: 'description' }],
      },
    });
    const readFacadeText = extractTextContent(readFacade.content);
    assert.ok(!readFacade.isError, `read_content should succeed: ${readFacadeText}`);
    const readFacadeJson = JSON.parse(readFacadeText) as {
      result?: { items?: Array<{ data?: { content?: string } }> };
    };
    assert.equal(readFacadeJson.result?.items?.[0]?.data?.content, 'Field Beta is searchable.');

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

    const probeCss = await client.callTool({
      name: 'probe_css',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const probeCssText = extractTextContent(probeCss.content);
    assert.ok(!probeCss.isError, `probe_css should succeed: ${probeCssText}`);
    const probeCssJson = JSON.parse(probeCssText) as {
      count?: number;
    };
    assert.equal(probeCssJson.count, 1);

    const probeGreetings = await client.callTool({
      name: 'probe_greetings',
      arguments: {
        file_path: probeFixture.filePath,
        type: 'alternate',
      },
    });
    const probeGreetingsText = extractTextContent(probeGreetings.content);
    assert.ok(!probeGreetings.isError, `probe_greetings should succeed: ${probeGreetingsText}`);
    const probeGreetingsJson = JSON.parse(probeGreetingsText) as {
      count?: number;
      type?: string;
    };
    assert.equal(probeGreetingsJson.type, 'alternate');
    assert.equal(probeGreetingsJson.count, 1);

    const probeTriggers = await client.callTool({
      name: 'probe_triggers',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const probeTriggersText = extractTextContent(probeTriggers.content);
    assert.ok(!probeTriggers.isError, `probe_triggers should succeed: ${probeTriggersText}`);
    const probeTriggersJson = JSON.parse(probeTriggersText) as {
      count?: number;
    };
    assert.equal(probeTriggersJson.count, 1);

    const inspectExternal = await client.callTool({
      name: 'inspect_external_file',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const inspectExternalText = extractTextContent(inspectExternal.content);
    assert.ok(!inspectExternal.isError, `inspect_external_file should succeed: ${inspectExternalText}`);
    const inspectExternalJson = JSON.parse(inspectExternalText) as {
      file_path?: string;
      file_type?: string;
      surfaceCounts?: { lorebook?: number; regex?: number };
    };
    assert.equal(inspectExternalJson.file_path, probeFixture.filePath);
    assert.equal(inspectExternalJson.file_type, 'charx');
    assert.equal(inspectExternalJson.surfaceCounts?.lorebook, 2);
    assert.equal(inspectExternalJson.surfaceCounts?.regex, 1);

    const externalSearch = await client.callTool({
      name: 'external_search_in_field',
      arguments: {
        file_path: probeFixture.filePath,
        field: 'description',
        query: 'description',
      },
    });
    const externalSearchText = extractTextContent(externalSearch.content);
    assert.ok(!externalSearch.isError, `external_search_in_field should succeed: ${externalSearchText}`);
    const externalSearchJson = JSON.parse(externalSearchText) as {
      totalMatches?: number;
      field?: string;
    };
    assert.equal(externalSearchJson.field, 'description');
    assert.equal(externalSearchJson.totalMatches, 1);

    const externalRange = await client.callTool({
      name: 'external_read_field_range',
      arguments: {
        file_path: probeFixture.filePath,
        field: 'description',
        offset: 0,
        length: 5,
      },
    });
    const externalRangeText = extractTextContent(externalRange.content);
    assert.ok(!externalRange.isError, `external_read_field_range should succeed: ${externalRangeText}`);
    const externalRangeJson = JSON.parse(externalRangeText) as {
      content?: string;
    };
    assert.equal(externalRangeJson.content, 'Probe');

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
    await runStandaloneFacadeDogfood();
    console.log('facade-first standalone MCP dogfood eval passed');
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
