import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

import {
  openCharx,
  openRisum,
  openRisup,
  saveCharx,
  saveRisum,
  saveRisup,
  type LoadedDocumentData,
} from '../src/charx-io';
import { startApiServer } from '../src/lib/mcp-api-server';
import { MCP_SINGLE_TOOL_MAX_BYTES } from '../src/lib/mcp-compact-input';
import type { RuntimeMetadata } from '../src/lib/mcp-runtime-contract';
import {
  combineCssSections as combineCssSectionsImpl,
  combineLuaSections as combineLuaSectionsImpl,
  detectCssBlockClose as detectCssBlockCloseImpl,
  detectCssBlockOpen as detectCssBlockOpenImpl,
  detectCssSectionInline as detectCssSectionInlineImpl,
  detectLuaSection as detectLuaSectionImpl,
  parseCssSections as parseCssSectionsImpl,
  parseLuaSections as parseLuaSectionsImpl,
} from '../src/lib/section-parser';
import { callJson, type McpCallJson, type StandaloneClientRuntime } from './mcp-test-client';

export const PROJECT_ROOT = process.cwd();
export const TEST_DIR = path.join(PROJECT_ROOT, '.build', 'test-tmp', 'mcp-search');
export const MCP_RUNTIME_WASM = ['tiktoken_bg.wasm', 'glue.wasm'];

for (const asset of MCP_RUNTIME_WASM) {
  assert.equal(
    fs.existsSync(path.resolve(PROJECT_ROOT, asset)),
    true,
    `build:mcp must copy ${asset} beside toki-mcp-server.js`,
  );
}

export function parseLuaSections(lua = '') {
  return parseLuaSectionsImpl(lua);
}

export function combineLuaSections(sections: Array<{ name: string; content: string }> = []) {
  return combineLuaSectionsImpl(sections);
}

export function detectLuaSection(line = '') {
  return detectLuaSectionImpl(line);
}

export function parseCssSections(css: string) {
  return parseCssSectionsImpl(css);
}

export function combineCssSections(sections: Array<{ name: string; content: string }> = [], prefix = '', suffix = '') {
  return combineCssSectionsImpl(sections, prefix, suffix);
}

export function detectCssSectionInline(line = '') {
  return detectCssSectionInlineImpl(line);
}

export async function createCompressiblePngBase64(): Promise<string> {
  const sharpModule = await import('sharp');
  const width = 512;
  const height = 512;
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = (index * 73 + 41) % 256;
  }
  const buffer = await sharpModule
    .default(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
  return buffer.toString('base64');
}

export function detectCssBlockOpen(line = '') {
  return detectCssBlockOpenImpl(line);
}

export function detectCssBlockClose(line = '') {
  return detectCssBlockCloseImpl(line);
}

export function openExternalDocumentForTest(filePath: string): LoadedDocumentData {
  if (filePath.endsWith('.risum')) return openRisum(filePath);
  if (filePath.endsWith('.risup')) return openRisup(filePath);
  return openCharx(filePath);
}

export function saveExternalDocumentForTest(filePath: string, data: LoadedDocumentData): void {
  if (filePath.endsWith('.risum')) {
    saveRisum(filePath, data as unknown as LoadedDocumentData);
    return;
  }
  if (filePath.endsWith('.risup')) {
    saveRisup(filePath, data as unknown as LoadedDocumentData);
    return;
  }
  saveCharx(filePath, data);
}

export interface SearchFixture {
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

export interface McpStatusPayload {
  action?: string;
  status?: number;
  target?: string;
  [key: string]: unknown;
}

export function createSearchFixture(): SearchFixture {
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

export function createProbeFixture(): { dir: string; filePath: string } {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TEST_DIR, 'probe-mcp-'));
  const filePath = path.join(dir, 'probe-test.charx');
  const data: LoadedDocumentData = {
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

export function dogfoodCardData(name: string, description: string): LoadedDocumentData {
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
    css: '<style>\n/* ============================================================\n   main\n   ============================================================ */\n.facade-alpha { color: red; }\n/* ============================================================\n   removable\n   ============================================================ */\n.facade-removable { display: none; }\n</style>',
    defaultVariables: '',
    lua:
      '-- ===== main =====\nlocal label = "Alpha"\nprint(label)\n' +
      '-- ===== runtime_guard =====\nerror("compile-only validation must not execute this")\n' +
      '-- ===== broken =====\nlocal =\n',
    triggerScripts: [
      {
        comment: 'Facade Trigger',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: '-- ===== main =====\nlocal label = "Alpha"\nprint(label)\n' }],
        lowLevelAccess: false,
      },
    ],
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

export function createDogfoodFixtures(): {
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

  const activeCard = dogfoodCardData('Facade Active', 'Alpha facade dogfood description.');
  activeCard.defaultVariables = '한글🙂'.repeat(20_000);
  saveCharx(mainFile, activeCard);
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
  } as unknown as LoadedDocumentData);
  saveRisup(referenceRisup, {
    _fileType: 'risup',
    name: 'Facade Reference Preset',
    description: 'Reference risup facade dogfood description.',
    promptTemplate: JSON.stringify([
      { type: 'plain', type2: 'normal', text: 'Preset facade prompt', role: 'system' },
      { type: 'plain', type2: 'normal', text: 'Preset removable prompt', role: 'system' },
    ]),
    formatingOrder: JSON.stringify(['main', 'description']),
    presetBias: '[]',
    localStopStrings: '[]',
  } as unknown as LoadedDocumentData);

  return { dir, mainFile, externalFile, referenceRisum, referenceRisup, referenceCharx, userDataDir };
}

export function createFolderWorkspaceMcpFixtures(dir: string): { risumFile: string; risupFile: string } {
  const risumFile = path.join(dir, 'workspace-module.risum');
  const risupFile = path.join(dir, 'workspace-preset.risup');

  saveRisum(risumFile, {
    _fileType: 'risum',
    name: 'Workspace Module',
    description: 'Workspace module description.',
    moduleName: 'Workspace Module',
    moduleDescription: 'Workspace module description.',
    moduleNamespace: 'workspace.module',
    lowLevelAccess: false,
    hideIcon: false,
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    risumAssets: [Buffer.from('workspace-risum-asset')],
  } as unknown as LoadedDocumentData);

  saveRisup(risupFile, {
    _fileType: 'risup',
    name: 'Workspace Preset',
    promptTemplate: JSON.stringify([
      { type: 'plain', type2: 'normal', text: 'Workspace modern prompt.', role: 'system' },
    ]),
    mainPrompt: 'Workspace main prompt.',
    jailbreak: 'Workspace jailbreak.',
    globalNote: 'Workspace global note.',
    _compressionMode: 'gzip',
    _presetData: {
      name: 'Workspace Preset',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Workspace modern prompt.', role: 'system' },
      ]),
      mainPrompt: 'Workspace main prompt.',
      jailbreak: 'Workspace jailbreak.',
      globalNote: 'Workspace global note.',
      openAIKey: 'must-not-survive',
      proxyKey: 'must-not-survive',
    },
  } as unknown as LoadedDocumentData);

  return { risumFile, risupFile };
}

export function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function startTestApiServer(currentData: SearchFixture, options: { runtime?: RuntimeMetadata } = {}) {
  let resolvePort!: (port: number) => void;
  const portPromise = new Promise<number>((resolve) => {
    resolvePort = resolve;
  });
  const mcpStatuses: McpStatusPayload[] = [];
  let activeData: SearchFixture | LoadedDocumentData | null = currentData;
  let activeFilePath: string | null = null;

  const api = startApiServer({
    getCurrentData: () => activeData as LoadedDocumentData | null,
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
    normalizeTriggerScripts: (data: unknown) => (Array.isArray(data) ? data : []),
    extractPrimaryLua: (scripts: unknown) => {
      if (!Array.isArray(scripts)) return '';
      return scripts
        .flatMap((script) => {
          const effect = script && typeof script === 'object' ? (script as { effect?: unknown }).effect : undefined;
          if (!Array.isArray(effect)) return [];
          return effect
            .map((item) =>
              item &&
              typeof item === 'object' &&
              (item as { type?: unknown }).type === 'triggerlua' &&
              typeof (item as { code?: unknown }).code === 'string'
                ? String((item as { code?: unknown }).code)
                : '',
            )
            .filter((code) => code.length > 0);
        })
        .join('\n\n');
    },
    mergePrimaryLua: (scripts: unknown, lua: string) => {
      void lua;
      return Array.isArray(scripts) ? scripts : [];
    },
    stringifyTriggerScripts: (scripts: unknown) => JSON.stringify(scripts),
    getSkillRoots: () => [path.join(PROJECT_ROOT, 'skills')],
    getUserDataPath: () => path.join(TEST_DIR, 'api-user-data'),
    getCurrentFilePath: () => activeFilePath,
    ...(options.runtime ? { getRuntimeInfo: () => options.runtime as RuntimeMetadata } : {}),
  });

  const port = await portPromise;
  return { ...api, port, mcpStatuses };
}

export function mapSurfacesByTarget(surfaces: Array<{ target?: string }>) {
  return new Map(
    surfaces
      .filter((surface): surface is { target: string; [key: string]: unknown } => typeof surface.target === 'string')
      .map((surface) => [surface.target, surface]),
  );
}

export function assertSurfaceSummary(
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

export function assertToolListMetadata(
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

export function readStandaloneLog(userDataDir: string): string {
  return fs.readFileSync(path.join(userDataDir, 'mcp-server.log'), 'utf-8');
}

export function nestedRecord(value: unknown, label: string): McpCallJson {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} should be an object`);
  return value as McpCallJson;
}

export function nestedArray(value: unknown, label: string): unknown[] {
  assert.ok(Array.isArray(value), `${label} should be an array`);
  return value;
}

export function assertDefaultToolSchemas(
  tools: Array<{ name: string; inputSchema: unknown; outputSchema?: unknown }>,
): void {
  const commonOutputFields = ['status', 'summary', 'result', 'artifacts', 'next_actions', 'preview', 'error'];
  const unboundedTools = new Set(['list_skills', 'list_tool_profiles']);
  for (const tool of tools) {
    const toolBytes = Buffer.byteLength(JSON.stringify(tool), 'utf8');
    assert.ok(
      toolBytes <= MCP_SINGLE_TOOL_MAX_BYTES,
      `${tool.name} schema is ${toolBytes} bytes; budget is ${MCP_SINGLE_TOOL_MAX_BYTES}`,
    );
    const outputSchema = nestedRecord(tool.outputSchema, `${tool.name} output schema`);
    const outputProperties = nestedRecord(outputSchema.properties, `${tool.name} output properties`);
    for (const field of commonOutputFields) {
      assert.ok(field in outputProperties, `${tool.name} output schema should expose ${field}`);
    }
    if (!unboundedTools.has(tool.name)) {
      const inputSchema = nestedRecord(tool.inputSchema, `${tool.name} input schema`);
      const inputProperties = nestedRecord(inputSchema.properties, `${tool.name} input properties`);
      const maxBytes = nestedRecord(inputProperties.max_bytes, `${tool.name} max_bytes schema`);
      assert.equal(maxBytes.maximum, 64 * 1024, `${tool.name} max_bytes should retain the 64KB hard cap`);
    }
  }
}

export function assertToolProfileRuntimeHealth(catalog: McpCallJson, expectedRuntime?: RuntimeMetadata): McpCallJson {
  const runtime = nestedRecord(catalog.runtime, 'tool profile runtime');
  assert.equal(typeof runtime.serverVersion, 'string');
  assert.equal(typeof runtime.appVersion, 'string');
  assert.equal(typeof runtime.packageVersion, 'string');
  assert.ok(runtime.runtimeMode === 'standalone' || runtime.runtimeMode === 'app-backed');
  const skew = nestedRecord(runtime.skew, 'tool profile runtime.skew');
  assert.equal(typeof skew.detected, 'boolean');
  const skewWarnings = nestedArray(skew.warnings, 'tool profile runtime.skew.warnings');
  assert.ok(skewWarnings.every((warning) => typeof warning === 'string'));
  if (expectedRuntime) assert.deepEqual(runtime, expectedRuntime);

  const runtimeHealth = nestedRecord(catalog.runtimeHealth, 'tool profile runtimeHealth');
  assert.equal(typeof runtimeHealth.startedAt, 'string');
  assert.equal(typeof runtimeHealth.pid, 'number');
  assert.ok(runtimeHealth.runtimeMode === 'standalone' || runtimeHealth.runtimeMode === 'app-backed');
  assert.equal(typeof runtimeHealth.apiTimeoutCount, 'number');
  assert.equal(typeof runtimeHealth.apiNetworkErrorCount, 'number');
  assert.equal(typeof runtimeHealth.uncaughtExceptionCount, 'number');
  assert.equal(typeof runtimeHealth.standaloneLogPath, 'string');

  const health = nestedRecord(catalog.health, 'tool profile health');
  for (const field of ['facadeTools', 'readonlyTools', 'advancedTools', 'allTools'] as const) {
    assert.equal(typeof health[field], 'number', `health.${field} should be numeric`);
    assert.ok((health[field] as number) > 0, `health.${field} should be positive`);
  }
  assert.ok((health.advancedTools as number) <= (health.allTools as number));
  nestedArray(health.missingWorkflowStages, 'health.missingWorkflowStages');
  nestedArray(health.unknownRecommendation, 'health.unknownRecommendation');
  nestedArray(health.unknownSurfaceKind, 'health.unknownSurfaceKind');

  const artifacts = nestedRecord(catalog.artifacts, 'tool profile artifacts');
  assert.equal(artifacts.runtime_mode, runtime.runtimeMode);
  assert.deepEqual(artifacts.runtime_health, runtimeHealth);
  assert.equal(artifacts.runtime_skew_detected, skew.detected);
  assert.deepEqual(artifacts.runtime_skew_warnings, skewWarnings);
  assert.deepEqual(artifacts.catalog_health, health);
  if (skew.detected) {
    assert.match(String(catalog.summary), /Runtime skew detected/);
  }
  return runtime;
}

export function routedTools(envelope: McpCallJson): string[] {
  const artifacts = nestedRecord(envelope.artifacts, 'artifacts');
  const tools = artifacts.routed_tools;
  assert.ok(Array.isArray(tools), 'artifacts.routed_tools should be present for facade metrics');
  return tools.map(String);
}

export type RealCorpusFamily = 'charx' | 'risup' | 'risum';

export interface RealCorpusFacadeCase {
  family: RealCorpusFamily;
  filePath: string;
  field: string;
  content: string;
  query: string;
}

export function collectRealCorpusFiles(rootRelative: string, extension: string, limit = 80): string[] {
  const root = path.join(PROJECT_ROOT, rootRelative);
  const files: string[] = [];
  if (!fs.existsSync(root)) return files;

  function walk(dir: string): void {
    if (files.length >= limit) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= limit) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name.toLowerCase().endsWith(extension)) files.push(fullPath);
    }
  }

  walk(root);
  return files.sort();
}

export function firstSearchQuery(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.match(/\S{2,24}/u)?.[0] ?? compact.slice(0, Math.min(compact.length, 24));
}

export function firstStringField(data: unknown, fields: readonly string[]): { field: string; content: string } | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== 'string') continue;
    const content = value.trim();
    if (content.length > 0) return { field, content };
  }
  return null;
}

export function findRealCorpusCase(
  family: RealCorpusFamily,
  rootRelative: string,
  extension: string,
  opener: (filePath: string) => unknown,
  preferredFields: readonly string[],
): RealCorpusFacadeCase | null {
  for (const filePath of collectRealCorpusFiles(rootRelative, extension)) {
    try {
      const field = firstStringField(opener(filePath), preferredFields);
      if (!field) continue;
      const query = firstSearchQuery(field.content);
      if (!query) continue;
      return { family, filePath, field: field.field, content: field.content, query };
    } catch {
      // Keep scanning the ignored local corpus; one malformed artifact should not mask other real fixtures.
    }
  }
  return null;
}

export function buildRealCorpusFacadeCases(): RealCorpusFacadeCase[] {
  return [
    findRealCorpusCase('charx', 'risu/bot', '.charx', openCharx, ['description', 'firstMessage', 'name']),
    findRealCorpusCase('risup', 'risu/prompts', '.risup', openRisup, [
      'description',
      'name',
      'mainPrompt',
      'promptTemplate',
    ]),
    findRealCorpusCase('risum', 'risu/modules', '.risum', openRisum, [
      'description',
      'moduleDescription',
      'moduleName',
      'name',
    ]),
  ].filter((candidate): candidate is RealCorpusFacadeCase => candidate !== null);
}
export function createManageItemsFixtures(): {
  dir: string;
  activeRisup: string;
  activeRisum: string;
  externalRisup: string;
  activeCharx: string;
  externalCharx: string;
  externalRisum: string;
  userDataDir: string;
} {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TEST_DIR, 'manage-items-'));
  const activeRisup = path.join(dir, 'active.risup');
  const activeRisum = path.join(dir, 'active.risum');
  const externalRisup = path.join(dir, 'external.risup');
  const activeCharx = path.join(dir, 'active.charx');
  const externalCharx = path.join(dir, 'external.charx');
  const externalRisum = path.join(dir, 'external.risum');
  const userDataDir = path.join(dir, 'user-data');
  const basePreset = (name: string) =>
    ({
      _fileType: 'risup',
      name,
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: `${name} main prompt.`, role: 'system' },
        { type: 'jailbreak', type2: 'normal', text: `${name} jailbreak prompt.`, role: 'system' },
      ]),
      formatingOrder: JSON.stringify(['main', 'jailbreak']),
      presetBias: '[]',
      localStopStrings: '[]',
    }) as unknown as LoadedDocumentData;
  saveRisup(activeRisup, basePreset('Active managed'));
  saveRisup(externalRisup, basePreset('External managed'));
  saveRisum(activeRisum, {
    _fileType: 'risum',
    name: 'Active managed module',
    description: 'Active manage_assets module.',
    moduleName: 'Active managed module',
    moduleDescription: 'Active manage_assets module.',
    moduleNamespace: 'active.managed',
    lowLevelAccess: false,
    hideIcon: false,
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    risumAssets: [],
    _moduleData: { module: { assets: [] } },
  } as unknown as LoadedDocumentData);
  saveCharx(activeCharx, dogfoodCardData('Active managed card', 'Active manage_items structured card.'));
  saveCharx(externalCharx, dogfoodCardData('External managed card', 'External manage_items structured card.'));
  saveRisum(externalRisum, {
    _fileType: 'risum',
    name: 'External managed module',
    description: 'External manage_assets module.',
    moduleName: 'External managed module',
    moduleDescription: 'External manage_assets module.',
    moduleNamespace: 'external.managed',
    lowLevelAccess: false,
    hideIcon: false,
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    risumAssets: [],
    _moduleData: { module: { assets: [] } },
  } as unknown as LoadedDocumentData);
  return { dir, activeRisup, activeRisum, externalRisup, activeCharx, externalCharx, externalRisum, userDataDir };
}

export function risupPromptItems(filePath: string): Array<Record<string, unknown>> {
  const data = openRisup(filePath);
  return JSON.parse(String(data.promptTemplate || '[]')) as Array<Record<string, unknown>>;
}

export function previewToken(envelope: McpCallJson, label: string): McpCallJson {
  return nestedRecord(envelope.preview, label);
}

export async function currentPromptIds(runtime: StandaloneClientRuntime): Promise<string[]> {
  const read = await callJson(runtime, 'read_content', {
    target: { kind: 'active' },
    selectors: [{ family: 'risup-prompt' }],
  });
  const resultItems = nestedArray(nestedRecord(read.result, 'prompt read result').items, 'prompt read result.items');
  const data = nestedRecord(nestedRecord(resultItems[0], 'prompt read item').data, 'prompt read data');
  return nestedArray(data.items, 'prompt summary items').map((item) =>
    String(nestedRecord(item, 'prompt summary item').id),
  );
}

export async function applyManagePreview(
  runtime: StandaloneClientRuntime,
  target: Record<string, unknown>,
  previewEnvelope: McpCallJson,
  family: string = 'risup-prompt',
): Promise<McpCallJson> {
  const preview = previewToken(previewEnvelope, 'manage_items preview');
  return callJson(runtime, 'manage_items', {
    target,
    family,
    mode: 'apply',
    preview_token: preview.preview_token,
    operation_digest: preview.operation_digest,
    guard_values: preview.required_guards,
  });
}

export async function applyManageAssetsPreview(
  runtime: StandaloneClientRuntime,
  target: Record<string, unknown>,
  previewEnvelope: McpCallJson,
  assetFamily: string,
): Promise<McpCallJson> {
  const preview = previewToken(previewEnvelope, 'manage_assets preview');
  return callJson(runtime, 'manage_assets', {
    target,
    asset_family: assetFamily,
    mode: 'apply',
    preview_token: preview.preview_token,
    operation_digest: preview.operation_digest,
    guard_values: preview.required_guards,
  });
}

export async function applyManageFilePreview(
  runtime: StandaloneClientRuntime,
  target: Record<string, unknown>,
  previewEnvelope: McpCallJson,
): Promise<McpCallJson> {
  const preview = previewToken(previewEnvelope, 'manage_file preview');
  return callJson(runtime, 'manage_file', {
    target,
    mode: 'apply',
    preview_token: preview.preview_token,
    operation_digest: preview.operation_digest,
    guard_values: preview.required_guards,
  });
}
