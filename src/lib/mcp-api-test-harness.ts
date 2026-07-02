// @vitest-environment node
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

import { openCharx, openRisum, openRisup, saveCharx, saveRisum, saveRisup, type CharxData } from '../charx-io';
import { resolveSkillRootDirs } from './content-roots';
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
} from './mcp-section-parser';

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

export interface TestDepsOverrides {
  getSessionStatus?: () => TestSessionStatus | Promise<TestSessionStatus>;
  getRuntimeInfo?: () => RuntimeMetadata;
  parseLuaSections?: (lua: string) => Array<{ name: string; content: string }>;
  parseCssSections?: (css: string) => {
    sections: Array<{ name: string; content: string }>;
    prefix: string;
    suffix: string;
  };
  openExternalDocument?: (filePath: string) => CharxData;
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

// Defaults intentionally use the production section parsers from mcp-section-parser
// (same as the headless server) so harness behavior matches runtime behavior.
// Tests that need custom section shapes can still inject overrides.

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

export function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function startTestApiServer(
  currentData: SearchFixture | CharxData | null,
  referenceFiles: Array<{ id?: string; fileName: string; filePath?: string; data: SearchFixture | CharxData }> = [],
  skillRoots?: string | string[],
  overrides?: TestDepsOverrides,
) {
  let activeData: SearchFixture | CharxData | null = currentData;
  const initialStatus = overrides?.getSessionStatus?.();
  let activeFilePath: string | null =
    initialStatus && !(initialStatus instanceof Promise) ? initialStatus.currentFilePath : null;
  const { startApiServer } = (await import('./mcp-api-server.js')) as { startApiServer: StartApiServer };
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
