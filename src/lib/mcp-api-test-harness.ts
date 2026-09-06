// @vitest-environment node
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

import { openCharx, openRisum, openRisup, saveCharx, saveRisum, saveRisup, type LoadedDocumentData } from '../charx-io';
import { resolveGuideRootDirs, resolveSkillRootDirs, type ResolvedGuideRoot } from './content-roots';
import type { RuntimeMetadata } from './mcp-runtime-contract';
import {
  combineCssSections,
  combineLuaSections,
  detectCssBlockClose,
  detectCssBlockOpen,
  detectCssSectionInline,
  detectLuaSection,
  parseCssSections,
  parseLuaSections,
} from './section-parser';

export interface SearchFixture {
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

export interface SearchSurface {
  target: string;
  [key: string]: unknown;
}

type StartApiServer = typeof import('./mcp-api-server').startApiServer;

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

export interface TestSessionStatus {
  currentFilePath: string | null;
  currentFileType: 'charx' | 'risum' | 'risup' | null;
  activeFileBaseline?: {
    path: string;
    mtimeMs: number;
    size: number;
    sha256: string;
    capturedAt: string;
  } | null;
  lastRestored: TestLastRestoredStatus | null;
  pendingRecovery: TestPendingRecoveryStatus | null;
  renderer: TestRendererSessionStatus | null;
  referenceManifestStatus?: { level: 'info' | 'warn' | 'error'; message: string; detail?: string } | null;
  runtime?: RuntimeMetadata | null;
}

export interface TestSessionStatusPayload {
  document: Record<string, unknown>;
  references: {
    manifestStatus: unknown;
    files: unknown[];
  };
  integrity: {
    activeFile: Record<string, unknown>;
    save: Record<string, unknown>;
    dirty: Record<string, unknown>;
    referenceManifest: Record<string, unknown>;
  };
}

export interface McpErrorEnvelope {
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

export interface McpNoOpEnvelope extends McpErrorEnvelope {
  success: false;
  message: string;
  matchCount?: number;
  field?: string;
  results?: unknown;
  errors?: unknown;
  startAnchorFoundAt?: number;
  dryRun?: boolean;
}

export interface McpRecoveryEnvelope {
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

export interface McpNoOpRecoveryEnvelope extends McpRecoveryEnvelope {
  success: false;
  message: string;
}

export interface TestDepsOverrides {
  onActivity?: (record: import('./mcp-activity-types').McpActivityRecord) => void;
  getActivityDocument?: () => import('./mcp-activity-types').McpActivityTarget | undefined;
  hasRendererDraftChanges?: () => Promise<boolean>;
  askRendererConfirm?: (title: string, message: string) => Promise<boolean>;
  getCurrentData?: () => LoadedDocumentData | null;
  guideRoots?: ResolvedGuideRoot[];
  getSessionStatus?: () => TestSessionStatus | Promise<TestSessionStatus>;
  getRuntimeInfo?: () => RuntimeMetadata;
  parseLuaSections?: (lua: string) => Array<{ name: string; content: string }>;
  combineLuaSections?: (sections: Array<{ name: string; content: string }>) => string;
  detectLuaSection?: (line: string) => string | null;
  parseCssSections?: (css: string) => {
    sections: Array<{ name: string; content: string }>;
    prefix: string;
    suffix: string;
  };
  combineCssSections?: (sections: Array<{ name: string; content: string }>, prefix: string, suffix: string) => string;
  detectCssSectionInline?: (line: string) => string | null;
  detectCssBlockOpen?: (line: string) => boolean;
  detectCssBlockClose?: (line: string) => boolean;
  openExternalDocument?: (filePath: string) => LoadedDocumentData;
  userDataPath?: string;
  broadcastToAll?: (channel: string, ...args: unknown[]) => void;
  invalidateAssetsMapCache?: () => void;
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

export const MCP_API_TEST_DIR = path.join(__dirname, '..', '..', 'test', '_mcp-api-server-tmp');
export const MCP_API_FIXED_SKILL_ROOT = path.join(__dirname, '..', '..', 'test', 'fixtures', 'skill-roots');

// Defaults intentionally use the production section parsers from section-parser
// (same as the headless server) so harness behavior matches runtime behavior.
// Tests that need custom section shapes can still inject overrides.

export function openExternalDocumentForTest(filePath: string): LoadedDocumentData {
  if (filePath.endsWith('.risum')) return openRisum(filePath);
  if (filePath.endsWith('.risup')) return openRisup(filePath);
  return openCharx(filePath);
}

function saveExternalDocumentForTest(filePath: string, data: SearchFixture | LoadedDocumentData): void {
  if (filePath.endsWith('.risum')) {
    saveRisum(filePath, data as unknown as LoadedDocumentData);
    return;
  }
  if (filePath.endsWith('.risup')) {
    saveRisup(filePath, data as unknown as LoadedDocumentData);
    return;
  }
  saveCharx(filePath, data as unknown as LoadedDocumentData);
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

export function createExternalFixtureHelpers(testDir: string) {
  function createExternalCharxFixture(overrides: Partial<LoadedDocumentData> = {}): { dir: string; filePath: string } {
    const dir = fs.mkdtempSync(path.join(testDir, 'external-charx-'));
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
    } as LoadedDocumentData;
    saveCharx(filePath, data);
    return { dir, filePath };
  }

  function createExternalRisumFixture(overrides: SearchFixture = {}): { dir: string; filePath: string } {
    const dir = fs.mkdtempSync(path.join(testDir, 'external-risum-'));
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
    } as unknown as LoadedDocumentData);
    return { dir, filePath };
  }

  function createExternalRisupFixture(overrides: SearchFixture = {}): { dir: string; filePath: string } {
    const dir = fs.mkdtempSync(path.join(testDir, 'external-risup-'));
    const filePath = path.join(dir, 'external.risup');
    saveRisup(filePath, {
      _fileType: 'risup',
      name: 'External Preset',
      promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', text: 'External preset', role: 'system' }]),
      formatingOrder: JSON.stringify(['main', 'description']),
      presetBias: '[]',
      localStopStrings: '[]',
      ...overrides,
    } as unknown as LoadedDocumentData);
    return { dir, filePath };
  }

  return {
    createExternalCharxFixture,
    createExternalRisumFixture,
    createExternalRisupFixture,
  };
}

export function mapSurfacesByTarget(surfaces: SearchSurface[]) {
  return new Map(surfaces.map((surface) => [surface.target, surface]));
}

export async function writeSkillFixture(
  rootDir: string,
  skillName: string,
  files: Record<string, string>,
): Promise<void> {
  const skillDir = path.join(rootDir, skillName);
  await fs.promises.mkdir(skillDir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(async ([fileName, content]) => {
      const filePath = path.join(skillDir, fileName);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content, 'utf-8');
    }),
  );
}

export function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function startTestApiServer(
  currentData: SearchFixture | LoadedDocumentData | null,
  referenceFiles: Array<{
    id?: string;
    fileName: string;
    filePath?: string;
    data: SearchFixture | LoadedDocumentData;
  }> = [],
  skillRoots?: string | string[],
  overrides?: TestDepsOverrides,
) {
  let activeData: SearchFixture | LoadedDocumentData | null = currentData;
  const initialStatus = overrides?.getSessionStatus?.();
  let activeFilePath: string | null =
    initialStatus && !(initialStatus instanceof Promise) ? initialStatus.currentFilePath : null;
  const { startApiServer } = (await import('./mcp-api-server.js')) as { startApiServer: StartApiServer };
  let resolvePort!: (port: number) => void;
  const portPromise = new Promise<number>((resolve) => {
    resolvePort = resolve;
  });

  const api = startApiServer({
    hasRendererDraftChanges: overrides?.hasRendererDraftChanges,
    getCurrentData: overrides?.getCurrentData ?? (() => activeData),
    getReferenceFiles: () => referenceFiles,
    askRendererConfirm: overrides?.askRendererConfirm ?? (async () => true),
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
    onActivity: overrides?.onActivity,
    getActivityDocument: overrides?.getActivityDocument,
    onListening: (port) => resolvePort(port),
    parseLuaSections: overrides?.parseLuaSections ?? parseLuaSections,
    combineLuaSections: overrides?.combineLuaSections ?? combineLuaSections,
    detectLuaSection: overrides?.detectLuaSection ?? detectLuaSection,
    parseCssSections: overrides?.parseCssSections ?? parseCssSections,
    combineCssSections: overrides?.combineCssSections ?? combineCssSections,
    detectCssSectionInline: overrides?.detectCssSectionInline ?? detectCssSectionInline,
    detectCssBlockOpen: overrides?.detectCssBlockOpen ?? detectCssBlockOpen,
    detectCssBlockClose: overrides?.detectCssBlockClose ?? detectCssBlockClose,
    openExternalDocument: overrides?.openExternalDocument ?? openExternalDocumentForTest,
    saveExternalDocument: (
      filePath: string,
      _fileType: 'charx' | 'risum' | 'risup',
      data: SearchFixture | LoadedDocumentData,
    ) => saveExternalDocumentForTest(filePath, data),
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
    getGuideRoots: () => overrides?.guideRoots ?? resolveGuideRootDirs(path.join(__dirname, '..', '..')),
    getUserDataPath: () => overrides?.userDataPath ?? path.join(os.tmpdir(), 'risutoki-mcp-api-test-user-data'),
    getRuntimeInfo: overrides?.getRuntimeInfo,
    invalidateAssetsMapCache: overrides?.invalidateAssetsMapCache,
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

export async function startLegacyTestApiServer(
  currentData: SearchFixture | LoadedDocumentData | null,
  referenceFiles: Array<{
    id?: string;
    fileName: string;
    filePath?: string;
    data: SearchFixture | LoadedDocumentData;
  }> = [],
  skillRoots?: string | string[],
  overrides?: TestDepsOverrides,
) {
  return startTestApiServer(currentData, referenceFiles, skillRoots, {
    parseLuaSections: () => [],
    combineLuaSections: () => '',
    detectLuaSection: () => null,
    parseCssSections: () => ({ sections: [], prefix: '', suffix: '' }),
    combineCssSections: () => '',
    detectCssSectionInline: () => null,
    detectCssBlockOpen: () => false,
    detectCssBlockClose: () => false,
    ...overrides,
  });
}

export function createLegacyTestApiServer(testDir: string) {
  return (
    currentData: SearchFixture | LoadedDocumentData | null,
    referenceFiles: Array<{
      id?: string;
      fileName: string;
      filePath?: string;
      data: SearchFixture | LoadedDocumentData;
    }> = [],
    skillRoots?: string | string[],
    overrides?: TestDepsOverrides,
  ) =>
    startLegacyTestApiServer(currentData, referenceFiles, skillRoots, {
      userDataPath: path.join(testDir, 'user-data'),
      ...overrides,
    });
}

export async function postJson<T>(
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

export async function getJson<T>(port: number, token: string, urlPath: string): Promise<{ status: number; data: T }> {
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
