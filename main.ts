'use strict';

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Type-only imports from local TypeScript modules (erased at compile time)
import type { CharxData } from './src/charx-io';
import type { McpApiServer, Section, CssCacheEntry, McpSessionStatus } from './src/lib/mcp-api-server';
import { writeFileAtomicSync } from './src/lib/atomic-write';
import { resolveSkillRootDirs } from './src/lib/content-roots';
import { markRecoveryDocumentActiveForPath, syncRecoveryAfterExplicitSave } from './src/lib/session-recovery-main';

// ---------------------------------------------------------------------------
// Interfaces for .cjs modules and local types
// ---------------------------------------------------------------------------

interface ReferenceRecord {
  id?: string;
  fileName: string;
  filePath: string;
  fileType?: 'charx' | 'risum' | 'risup';
  data: Record<string, unknown>;
}

interface ReferenceManifestIssue {
  filePath: string;
  reason: string;
  detail?: string;
}

interface ReferenceManifestStatus {
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: string;
}

interface MainStateStore {
  currentFilePath: string | null;
  currentData: CharxData | null;
  referenceFiles: ReferenceRecord[];
  referenceManifestStatus: ReferenceManifestStatus | null;
  terminalCwd: string | null;
  resetCurrentDocument(data: CharxData): void;
  setCurrentDocument(filePath: string, data: CharxData): void;
  setReferenceFiles(files: ReferenceRecord[]): void;
  setReferenceManifestStatus(status: ReferenceManifestStatus | null): void;
  setTerminalCwd(cwd: string | null): void;
}

interface PopoutPayloadStore {
  clear: (type: string, requestId?: string) => void;
  peek: (type: string) => { requestId: string; data: unknown } | null;
  prepare: (type: string, data: unknown) => string;
  waitFor: (type: string, requestId: string, timeoutMs?: number) => Promise<unknown>;
}

interface GuidesListResult {
  builtIn: string[];
  session: string[];
}

interface SaveResult {
  success: boolean;
  path?: string;
  error?: string;
}

type OpenFileResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; canceled: true }
  | { success: false; canceled?: false; error: string };

interface RendererOpenFileRequest {
  filePath: string;
  fileType: 'charx' | 'risum' | 'risup';
  saveCurrent: boolean;
  targetLabel: string;
}

interface RendererOpenFileResponse {
  success: boolean;
  alreadyOpen?: boolean;
  canceled?: boolean;
  error?: string;
  filePath?: string;
  fileType?: 'charx' | 'risum' | 'risup';
  name?: string;
  suggestion?: string;
}

interface RendererSessionStatus {
  autosaveDir: string;
  autosaveEnabled: boolean;
  autosaveInterval: number;
  dirtyFieldCount: number;
  dirtyFields: string[];
  documentSwitchInProgress: boolean;
  hasUnsavedChanges: boolean;
}

interface RendererSessionStatusResponse {
  success: boolean;
  error?: string;
  renderer?: RendererSessionStatus | null;
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// Runtime imports (typed require — compiled by tsconfig.node-libs.json)
// ---------------------------------------------------------------------------

const {
  openCharx,
  saveCharx,
  openRisum,
  saveRisum,
  openRisup,
  saveRisup,
  extractPrimaryLuaFromTriggerScripts,
  mergePrimaryLuaIntoTriggerScripts,
  normalizeTriggerScripts,
  stringifyTriggerScripts,
} = require('./src/charx-io') as {
  openCharx: (filePath: string) => CharxData;
  saveCharx: (filePath: string, data: CharxData) => void;
  openRisum: (filePath: string) => CharxData;
  saveRisum: (filePath: string, data: CharxData) => void;
  openRisup: (filePath: string) => CharxData;
  saveRisup: (filePath: string, data: CharxData) => void;
  extractPrimaryLuaFromTriggerScripts: (triggerScripts: unknown) => string;
  mergePrimaryLuaIntoTriggerScripts: (triggerScripts: unknown, lua: unknown) => unknown[];
  normalizeTriggerScripts: (triggerScripts: unknown) => unknown[];
  stringifyTriggerScripts: (triggerScripts: unknown) => string;
};

const {
  normalizeReferencePath,
  upsertReferenceRecord,
  removeReferenceRecord,
  serializeReferenceManifestPaths,
  parseReferenceManifest,
  validateReferenceManifestPaths,
} = require('./src/lib/reference-store') as {
  normalizeReferencePath: (filePath: string) => string;
  upsertReferenceRecord: (records: ReferenceRecord[], record: ReferenceRecord) => ReferenceRecord[];
  removeReferenceRecord: (records: ReferenceRecord[], identifier: string) => ReferenceRecord[];
  serializeReferenceManifestPaths: (paths: string[]) => { version: number; paths: string[] };
  parseReferenceManifest: (value: unknown) => string[];
  validateReferenceManifestPaths: (
    paths: string[],
    opts: { existsSync: (p: string) => boolean },
  ) => { validPaths: string[]; issues: ReferenceManifestIssue[] };
};

const { buildRefsPopoutData } = require('./src/lib/refs-popout-data') as {
  buildRefsPopoutData: (guidesListResult: GuidesListResult, referenceFiles: ReferenceRecord[]) => unknown;
};

const { createPopoutPayloadStore } = require('./src/lib/popout-payload-store') as {
  createPopoutPayloadStore: () => PopoutPayloadStore;
};

const { createMainStateStore } = require('./src/lib/main-state-store') as {
  createMainStateStore: () => MainStateStore;
};

const { startApiServer: startApiServerImpl } = require('./src/lib/mcp-api-server') as {
  startApiServer: (deps: {
    getCurrentData: () => CharxData | null;
    getReferenceFiles: () => ReferenceRecord[];
    askRendererConfirm: (title: string, message: string) => Promise<boolean>;
    requestRendererOpenFile: (request: RendererOpenFileRequest) => Promise<RendererOpenFileResponse>;
    saveCurrentDocument?: () => Promise<SaveResult>;
    broadcastToAll: (channel: string, ...args: unknown[]) => void;
    broadcastMcpStatus: (payload: Record<string, unknown>) => void;
    onListening: (port: number) => void;
    parseLuaSections: (lua: string) => Section[];
    combineLuaSections: (sections: Section[]) => string;
    detectLuaSection: (line: string) => string | null;
    parseCssSections: (css: string) => CssCacheEntry;
    combineCssSections: (sections: Section[], prefix: string, suffix: string) => string;
    detectCssSectionInline: (line: string) => string | null;
    detectCssBlockOpen: (line: string) => boolean;
    detectCssBlockClose: (line: string) => boolean;
    openExternalDocument: (filePath: string) => CharxData;
    saveExternalDocument: (filePath: string, fileType: 'charx' | 'risum' | 'risup', data: CharxData) => void;
    normalizeTriggerScripts: (data: unknown) => unknown;
    extractPrimaryLua: (scripts: unknown) => string;
    mergePrimaryLua: (scripts: unknown, lua: string) => unknown;
    stringifyTriggerScripts: (scripts: unknown) => string;
    getSkillRoots: () => string[];
    getUserDataPath: () => string;
    getSessionStatus: () => Promise<McpSessionStatus>;
    getCurrentFilePath: () => string | null;
  }) => McpApiServer;
};

const { initTerminalManager, killTerminal } = require('./src/lib/terminal-manager') as {
  initTerminalManager: (deps: {
    broadcastToAll: (channel: string, ...args: unknown[]) => void;
    getCurrentFilePath: () => string | null;
    getApiPort: () => number | null;
    getApiToken: () => string | null;
  }) => void;
  killTerminal: () => void;
};

const { initMcpConfig, writeCurrentMcpConfig, cleanupJsonMcpConfig, cleanupCodexMcpConfig } =
  require('./src/lib/mcp-config') as {
    initMcpConfig: (deps: {
      getApiPort: () => number | null;
      getApiToken: () => string | null;
      getDirname: () => string;
      isPackaged: () => boolean;
    }) => void;
    writeCurrentMcpConfig: () => string | null;
    cleanupJsonMcpConfig: (configPath: string) => void;
    cleanupCodexMcpConfig: () => void;
  };

const { initAgentsMdManager, cleanupAgentsMd } = require('./src/lib/agents-md-manager') as {
  initAgentsMdManager: (deps: {
    getCurrentFilePath: () => string | null;
    getTerminalCwd: () => string | null;
    getDirname: () => string;
    resolveGuidePath: (filename: string) => string | null;
  }) => void;
  cleanupAgentsMd: () => void;
};

const { initAssetManager, invalidateAssetsMapCache } = require('./src/lib/asset-manager') as {
  initAssetManager: (deps: {
    getCurrentData: () => CharxData | null;
    getMainWindow: () => BrowserWindow | null;
  }) => void;
  invalidateAssetsMapCache: () => void;
};

const { initGuidesManager, getGuidesDir, getGuidesListResult, resolveBuiltInGuidePath } =
  require('./src/lib/guides-manager') as {
    initGuidesManager: (deps: {
      getMainWindow: () => BrowserWindow | null;
      getDirname: () => string;
      broadcastRefsDataChanged: () => void;
    }) => void;
    getGuidesDir: () => string;
    getGuidesListResult: () => GuidesListResult;
    resolveBuiltInGuidePath: (filename: string) => string | null;
  };

const { initIpcConfirm, askRendererConfirm, askRendererCloseConfirm } = require('./src/lib/ipc-confirm') as {
  initIpcConfirm: (deps: { getMainWindow: () => BrowserWindow | null }) => void;
  askRendererConfirm: (title: string, message: string) => Promise<boolean>;
  askRendererCloseConfirm: () => Promise<number>;
};

const { initPopoutManager, getPopoutWindows } = require('./src/lib/popout-manager') as {
  initPopoutManager: (deps: {
    getMainWindow: () => BrowserWindow | null;
    getCurrentData: () => CharxData | null;
    getReferenceFiles: () => ReferenceRecord[];
    loadRendererPage: (
      win: BrowserWindow,
      entryFile: string,
      query?: Record<string, string | undefined>,
    ) => Promise<void>;
    getGuidesDir: () => string;
    getGuidesListResult: () => GuidesListResult;
    buildRefsPopoutData: (guidesListResult: GuidesListResult, referenceFiles: ReferenceRecord[]) => unknown;
    getDirname: () => string;
    popoutPayloadStore: PopoutPayloadStore;
  }) => void;
  getPopoutWindows: () => Record<string, BrowserWindow>;
};

const { initAutosaveManager } = require('./src/lib/autosave-manager') as {
  initAutosaveManager: (deps: {
    getCurrentData: () => CharxData | null;
    getCurrentFilePath: () => string | null;
    getMainWindow: () => BrowserWindow | null;
    saveCharx: (filePath: string, data: CharxData) => void;
    saveRisum: (filePath: string, data: CharxData) => void;
    saveRisup: (filePath: string, data: CharxData) => void;
    readFileSync: (filePath: string, encoding: BufferEncoding) => string;
    writeFileSync: (filePath: string, data: string) => void;
    writeFileAtomicSync?: (filePath: string, data: string) => void;
    mkdirSync: (dirPath: string, options?: { recursive: boolean }) => void;
    readdirSync: (dirPath: string) => string[];
    unlinkSync: (filePath: string) => void;
    applyUpdates: (data: CharxData, fields: Record<string, unknown>) => void;
    onAutosaveSuccess?: (autosavePath: string, sidecarPath: string) => void;
  }) => void;
};

const { resolveCloseWindowAction } = require('./src/lib/close-window-policy') as {
  resolveCloseWindowAction: (input: { choice: number; saveResult?: SaveResult }) => {
    action: 'save' | 'close' | 'stay';
    errorMessage: string | null;
  };
};

const { createSessionRecoveryManager } = require('./src/lib/session-recovery-manager') as {
  createSessionRecoveryManager: (deps: {
    readFileSync: (path: string, encoding: BufferEncoding) => string;
    writeFileSync: (path: string, data: string) => void;
    writeFileAtomicSync?: (path: string, data: string) => void;
    existsSync: (path: string) => boolean;
    statSync: (path: string) => { mtimeMs: number };
    unlinkSync: (path: string) => void;
    userDataPath: string;
    openDocument: (filePath: string) => CharxData;
    setCurrentDocument: (filePath: string, data: CharxData) => void;
  }) => import('./src/lib/session-recovery-manager').SessionRecoveryManager;
};

const { initDataSerializer, serializeForRenderer, applyUpdates } = require('./src/lib/data-serializer') as {
  initDataSerializer: (deps: {
    stringifyTriggerScripts: (ts: unknown) => string;
    normalizeTriggerScripts: (ts: unknown) => unknown[];
    extractPrimaryLuaFromTriggerScripts: (ts: unknown) => string;
    mergePrimaryLuaIntoTriggerScripts: (ts: unknown, lua: string) => unknown[];
  }) => void;
  serializeForRenderer: (data: CharxData) => Record<string, unknown>;
  applyUpdates: (data: CharxData, fields: Record<string, unknown>) => void;
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
const mainState: MainStateStore = createMainStateStore();
const popoutPayloadStore: PopoutPayloadStore = createPopoutPayloadStore();

// MCP API server
let mcpApi: McpApiServer | null = null;
let apiPort: number | null = null;
let apiToken: string | null = null;

// Session recovery
let recoveryManager: ReturnType<typeof createSessionRecoveryManager> | null = null;
let rendererOpenRequestId = 0;
const rendererOpenCallbacks: Record<number, (response: RendererOpenFileResponse) => void> = {};
const RENDERER_OPEN_TIMEOUT_MS = 60000;
let rendererSessionStatusRequestId = 0;
const rendererSessionStatusCallbacks: Record<number, (response: RendererSessionStatusResponse) => void> = {};
const RENDERER_SESSION_STATUS_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Document open helper (shared by open-file and recovery)
// ---------------------------------------------------------------------------

function openDocumentByPath(filePath: string): CharxData {
  if (filePath.endsWith('.risum')) return openRisum(filePath);
  if (filePath.endsWith('.risup')) return openRisup(filePath);
  return openCharx(filePath);
}

function getDocumentFileType(data: CharxData): 'charx' | 'risum' | 'risup' {
  if (data._fileType === 'risum' || data._fileType === 'risup') return data._fileType;
  return 'charx';
}

function sameDocumentPath(a: string, b: string): boolean {
  const normalizedA = path.normalize(a);
  const normalizedB = path.normalize(b);
  if (process.platform === 'win32') {
    return normalizedA.toLowerCase() === normalizedB.toLowerCase();
  }
  return normalizedA === normalizedB;
}

function activateOpenedDocument(filePath: string, nextData: CharxData): Record<string, unknown> {
  mainState.setCurrentDocument(filePath, nextData);
  invalidateAssetsMapCache();
  if (mcpApi) mcpApi.invalidateSectionCaches();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(`RisuToki - ${path.basename(mainState.currentFilePath!)}`);
  }
  if (apiPort) writeCurrentMcpConfig();
  broadcastSidebarDataChanged();
  markRecoveryDocumentActiveForPath(recoveryManager, filePath).catch((e) =>
    console.warn('[main] recovery markDocumentActive error:', e),
  );
  return serializeForRenderer(mainState.currentData!);
}

function openDocumentIntoWorkspace(filePath: string): Record<string, unknown> {
  const normalizedPath = path.normalize(filePath);
  console.log('[main] Opening:', normalizedPath);
  const nextData = openDocumentByPath(normalizedPath);
  const serialized = activateOpenedDocument(normalizedPath, nextData);
  console.log(
    '[main] Parsed OK, name:',
    mainState.currentData!.name,
    'type:',
    getDocumentFileType(mainState.currentData!),
  );
  return serialized;
}

function requestRendererOpenFile(request: RendererOpenFileRequest): Promise<RendererOpenFileResponse> {
  const normalizedPath = path.normalize(request.filePath);
  if (
    mainState.currentFilePath &&
    mainState.currentData &&
    sameDocumentPath(mainState.currentFilePath, normalizedPath)
  ) {
    return Promise.resolve({
      success: true,
      alreadyOpen: true,
      filePath: mainState.currentFilePath,
      fileType: getDocumentFileType(mainState.currentData),
      name: String(mainState.currentData.name || path.basename(mainState.currentFilePath)),
    });
  }

  const targetWindow = mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    return Promise.resolve({
      success: false,
      error: 'Main renderer window is not available.',
      suggestion: 'RisuToki 메인 창이 열린 상태에서 다시 시도하세요.',
    });
  }

  const id = ++rendererOpenRequestId;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (!rendererOpenCallbacks[id]) return;
      delete rendererOpenCallbacks[id];
      resolve({
        success: false,
        error: 'Timed out waiting for renderer response.',
        suggestion: '열기 확인 팝업이나 저장 대화상자가 열려 있지 않은지 확인하세요.',
      });
    }, RENDERER_OPEN_TIMEOUT_MS);

    rendererOpenCallbacks[id] = (response) => {
      clearTimeout(timeout);
      resolve(response);
    };
    targetWindow.webContents.send('mcp-open-file-request', id, {
      ...request,
      filePath: normalizedPath,
    });
  });
}

ipcMain.on('mcp-open-file-response', (_event, id: number, response: RendererOpenFileResponse) => {
  if (!rendererOpenCallbacks[id]) return;
  rendererOpenCallbacks[id](response);
  delete rendererOpenCallbacks[id];
});

function requestRendererSessionStatus(): Promise<RendererSessionStatusResponse> {
  const targetWindow = mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    return Promise.resolve({
      success: false,
      error: 'Main renderer window is not available.',
      suggestion: 'RisuToki 메인 창이 열린 상태에서 다시 시도하세요.',
    });
  }

  const id = ++rendererSessionStatusRequestId;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (!rendererSessionStatusCallbacks[id]) return;
      delete rendererSessionStatusCallbacks[id];
      resolve({
        success: false,
        error: 'Timed out waiting for renderer session status.',
        suggestion: '메인 렌더러가 응답 가능한 상태인지 확인하세요.',
      });
    }, RENDERER_SESSION_STATUS_TIMEOUT_MS);

    rendererSessionStatusCallbacks[id] = (response) => {
      clearTimeout(timeout);
      resolve(response);
    };
    targetWindow.webContents.send('mcp-session-status-request', id);
  });
}

ipcMain.on('mcp-session-status-response', (_event, id: number, response: RendererSessionStatusResponse) => {
  if (!rendererSessionStatusCallbacks[id]) return;
  rendererSessionStatusCallbacks[id](response);
  delete rendererSessionStatusCallbacks[id];
});

async function getCurrentMcpSessionStatus(): Promise<McpSessionStatus> {
  const rendererResponse = await requestRendererSessionStatus();
  const pendingRecovery = recoveryManager ? await recoveryManager.getPendingRecovery() : null;
  const lastRestored = recoveryManager?.getLastRestoredProvenance() ?? null;
  return {
    currentFilePath: mainState.currentFilePath,
    currentFileType: mainState.currentData ? getDocumentFileType(mainState.currentData) : null,
    lastRestored: lastRestored
      ? {
          appVersion: lastRestored.appVersion,
          autosavePath: lastRestored.autosavePath,
          dirtyFields: [...lastRestored.dirtyFields],
          savedAt: lastRestored.savedAt,
          sourceFilePath: lastRestored.sourceFilePath,
          sourceFileType: lastRestored.sourceFileType,
        }
      : null,
    pendingRecovery: pendingRecovery
      ? {
          autosavePath: pendingRecovery.autosavePath,
          dirtyFields: [...pendingRecovery.provenance.dirtyFields],
          sourceFilePath: pendingRecovery.sourceFilePath,
          staleWarning: pendingRecovery.staleWarning,
        }
      : null,
    renderer: rendererResponse.success ? (rendererResponse.renderer ?? null) : null,
    referenceManifestStatus: mainState.referenceManifestStatus,
  };
}

// ---------------------------------------------------------------------------
// Reference file helpers
// ---------------------------------------------------------------------------

let referenceManifestPaths: string[] = [];

function getReferenceStatePath(): string {
  return path.join(app.getPath('userData'), 'reference-files.json');
}

function getReferencePathsForPersist(): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const addPath = (filePath: string | undefined): void => {
    const identity = normalizeReferencePath(filePath || '');
    if (!identity || seen.has(identity)) return;
    seen.add(identity);
    paths.push(identity);
  };

  for (const filePath of referenceManifestPaths) addPath(filePath);
  for (const record of mainState.referenceFiles) addPath(record.filePath);
  return paths;
}

function rememberReferenceManifestPath(filePath: string): void {
  referenceManifestPaths = serializeReferenceManifestPaths([...referenceManifestPaths, filePath]).paths;
}

function forgetReferenceManifestPath(filePath: string): boolean {
  const identity = normalizeReferencePath(filePath);
  if (!identity) return false;
  const next = referenceManifestPaths.filter((entry) => normalizeReferencePath(entry) !== identity);
  const removed = next.length !== referenceManifestPaths.length;
  referenceManifestPaths = next;
  return removed;
}

function persistReferenceFiles(): void {
  try {
    const statePath = getReferenceStatePath();
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const manifest = serializeReferenceManifestPaths(getReferencePathsForPersist());
    const data = JSON.stringify(manifest, null, 2);
    writeFileAtomicSync(statePath, data, { encoding: 'utf8' });
    referenceManifestPaths = manifest.paths;
  } catch (error) {
    console.error('[main] failed to persist references:', error);
  }
}

function restoreReferenceRecord(filePath: string): ReferenceRecord {
  const normalizedPath = normalizeReferencePath(filePath);
  let refData;
  if (normalizedPath.endsWith('.risum')) refData = openRisum(normalizedPath);
  else if (normalizedPath.endsWith('.risup')) refData = openRisup(normalizedPath);
  else refData = openCharx(normalizedPath);
  const fileType: 'charx' | 'risum' | 'risup' =
    refData._fileType === 'risum' || refData._fileType === 'risup' ? refData._fileType : 'charx';
  return {
    id: normalizedPath,
    fileName: path.basename(normalizedPath),
    filePath: normalizedPath,
    fileType,
    data: serializeForRenderer(refData),
  };
}

function addReferenceRecord(ref: ReferenceRecord): void {
  rememberReferenceManifestPath(ref.filePath);
  mainState.setReferenceFiles(
    upsertReferenceRecord(mainState.referenceFiles, {
      ...ref,
      filePath: normalizeReferencePath(ref.filePath),
    }),
  );
  persistReferenceFiles();
}

function broadcastRefsDataChanged(): void {
  broadcastToAll('refs-data-changed');
}

function describeReferenceManifestIssue(issue: ReferenceManifestIssue): string {
  if (issue.reason === 'missing-file') {
    return `누락됨: ${issue.filePath}`;
  }
  if (issue.reason === 'unsupported-extension') {
    return `지원되지 않는 확장자: ${issue.filePath}`;
  }
  if (issue.reason === 'restore-failed') {
    return `불러오기 실패: ${issue.filePath} (${issue.detail})`;
  }
  return `${issue.filePath}`;
}

function loadPersistedReferenceFiles(): void {
  const statePath = getReferenceStatePath();
  mainState.setReferenceManifestStatus(null);
  if (!fs.existsSync(statePath)) return;

  try {
    const persisted: unknown = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const restored: ReferenceRecord[] = [];
    const issues: ReferenceManifestIssue[] = [];
    referenceManifestPaths = parseReferenceManifest(persisted);
    const { validPaths, issues: manifestIssues } = validateReferenceManifestPaths(referenceManifestPaths, {
      existsSync: () => true,
    });
    issues.push(...manifestIssues);

    for (const refPath of validPaths) {
      if (!fs.existsSync(refPath)) {
        issues.push({ filePath: refPath, reason: 'missing-file' });
        continue;
      }
      try {
        restored.push(restoreReferenceRecord(refPath));
      } catch (error) {
        console.error('[main] failed to restore reference file:', refPath, error);
        issues.push({
          filePath: refPath,
          reason: 'restore-failed',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    mainState.setReferenceFiles(restored);
    if (issues.length > 0) {
      mainState.setReferenceManifestStatus({
        level: 'warn',
        message: `참고 파일 ${issues.length}개를 복원하지 못했습니다. 저장된 목록은 유지됩니다.`,
        detail: issues.slice(0, 3).map(describeReferenceManifestIssue).join(' | '),
      });
    }
  } catch (error) {
    console.error('[main] failed to load persisted references:', error);
    referenceManifestPaths = [];
    mainState.setReferenceFiles([]);
    mainState.setReferenceManifestStatus({
      level: 'error',
      message: '저장된 참고 파일 목록을 읽지 못했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

function broadcastToAll(channel: string, ...args: unknown[]): void {
  const allWindows = [mainWindow, ...Object.values(getPopoutWindows())];
  for (const win of allWindows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
      // Send sidebar-data-changed to popout windows in the same loop
      if (channel === 'data-updated' && win !== mainWindow) {
        win.webContents.send('sidebar-data-changed');
      }
    }
  }
}

function broadcastSidebarDataChanged(): void {
  broadcastToAll('sidebar-data-changed');
}

function broadcastMcpStatus(payload: Record<string, unknown>): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mcp-status', payload);
  }
}

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

function getRendererEntryUrl(entryFile: string, query: Record<string, string | undefined> = {}): string | null {
  if (!process.env.VITE_DEV_SERVER_URL) return null;

  const url = new URL(entryFile, process.env.VITE_DEV_SERVER_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function loadRendererPage(
  windowRef: BrowserWindow,
  entryFile: string,
  query: Record<string, string | undefined> = {},
): Promise<void> {
  const devUrl = getRendererEntryUrl(entryFile, query);
  if (devUrl) {
    return windowRef.loadURL(devUrl);
  }

  // Filter out undefined values for loadFile which requires Record<string, string>
  const cleanQuery: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) cleanQuery[key] = value;
  }
  return windowRef.loadFile(path.join(__dirname, 'dist', entryFile), { query: cleanQuery });
}

// ---------------------------------------------------------------------------
// createWindow
// ---------------------------------------------------------------------------

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'RisuToki',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadRendererPage(mainWindow, 'index.html').catch((error) => {
    console.error('Failed to load main renderer', error);
  });
  mainWindow.setMenuBarVisibility(false);

  // F12 → DevTools 토글
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow!.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // 창 닫기 전 저장 확인 (MomoTalk 스타일)
  let isClosingForReal = false;
  async function saveDocumentBeforeClose(): Promise<SaveResult> {
    if (!mainState.currentData) {
      return { success: false, error: 'No file open' };
    }

    if (!mainState.currentFilePath) {
      return saveCurrentFileAs({});
    }

    try {
      const fileType = mainState.currentData._fileType;
      if (fileType === 'risum') {
        saveRisum(mainState.currentFilePath, mainState.currentData);
      } else if (fileType === 'risup') {
        saveRisup(mainState.currentFilePath, mainState.currentData);
      } else {
        saveCharx(mainState.currentFilePath, mainState.currentData);
      }
      return { success: true, path: mainState.currentFilePath };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  mainWindow.on('close', (e) => {
    if (mainState.currentData && !isClosingForReal) {
      e.preventDefault();
      askRendererCloseConfirm()
        .then(async (choice) => {
          let decision = resolveCloseWindowAction({ choice });
          if (decision.action === 'save') {
            const saveResult = await saveDocumentBeforeClose();
            if (!saveResult.success) {
              console.error('[main] Failed to save before close:', saveResult.error);
            }
            decision = resolveCloseWindowAction({ choice, saveResult });
          }

          if (decision.errorMessage) {
            dialog.showErrorBox('저장 실패', decision.errorMessage);
          }

          if (decision.action === 'close') {
            isClosingForReal = true;
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
          }
        })
        .catch((err) => {
          console.error('[main] Close confirmation failed:', err);
          dialog.showErrorBox('종료 확인 실패', '창 닫기 확인 중 오류가 발생해 창을 닫지 않았습니다.');
        });
    }
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  loadPersistedReferenceFiles();
  createWindow();

  // Initialize IPC confirm dialogs
  initIpcConfirm({
    getMainWindow: () => mainWindow,
  });

  // Initialize data serialization helpers
  initDataSerializer({
    stringifyTriggerScripts,
    normalizeTriggerScripts,
    extractPrimaryLuaFromTriggerScripts,
    mergePrimaryLuaIntoTriggerScripts,
  });

  mcpApi = startApiServerImpl({
    getCurrentData: () => mainState.currentData,
    getReferenceFiles: () => mainState.referenceFiles,
    askRendererConfirm,
    requestRendererOpenFile,
    saveCurrentDocument: () => saveCurrentDocumentFromMcp(),
    broadcastToAll,
    broadcastMcpStatus,
    onListening(port: number) {
      apiPort = port;
      writeCurrentMcpConfig();
    },
    parseLuaSections,
    combineLuaSections,
    detectLuaSection,
    parseCssSections,
    combineCssSections,
    detectCssSectionInline,
    detectCssBlockOpen,
    detectCssBlockClose,
    openExternalDocument: openDocumentByPath,
    saveExternalDocument: (filePath, fileType, data) => {
      if (fileType === 'risum') {
        saveRisum(filePath, data);
        return;
      }
      if (fileType === 'risup') {
        saveRisup(filePath, data);
        return;
      }
      saveCharx(filePath, data);
    },
    normalizeTriggerScripts,
    extractPrimaryLua: extractPrimaryLuaFromTriggerScripts,
    mergePrimaryLua: mergePrimaryLuaIntoTriggerScripts,
    stringifyTriggerScripts,
    getSkillRoots: () =>
      resolveSkillRootDirs(app.isPackaged ? process.resourcesPath! : __dirname).map((root) => root.absolutePath),
    getUserDataPath: () => app.getPath('userData'),
    getSessionStatus: getCurrentMcpSessionStatus,
    getCurrentFilePath: () => mainState.currentFilePath,
  });
  apiToken = mcpApi.token;

  // Initialize terminal (node-pty) IPC handlers
  initTerminalManager({
    broadcastToAll,
    getCurrentFilePath: () => mainState.currentFilePath,
    getApiPort: () => apiPort,
    getApiToken: () => apiToken,
  });

  // Initialize MCP config management
  initMcpConfig({
    getApiPort: () => apiPort,
    getApiToken: () => apiToken,
    getDirname: () => __dirname,
    isPackaged: () => app.isPackaged,
  });

  // Initialize AGENTS.md management
  initAgentsMdManager({
    getCurrentFilePath: () => mainState.currentFilePath,
    getTerminalCwd: () => mainState.terminalCwd,
    getDirname: () => __dirname,
    resolveGuidePath: resolveBuiltInGuidePath,
  });

  // Initialize asset management
  initAssetManager({
    getCurrentData: () => mainState.currentData,
    getMainWindow: () => mainWindow,
  });

  // Initialize guides management
  initGuidesManager({
    getMainWindow: () => mainWindow,
    getDirname: () => __dirname,
    broadcastRefsDataChanged,
  });

  // Initialize autosave management
  initAutosaveManager({
    getCurrentData: () => mainState.currentData,
    getCurrentFilePath: () => mainState.currentFilePath,
    getMainWindow: () => mainWindow,
    saveCharx,
    saveRisum,
    saveRisup,
    readFileSync: (filePath, encoding) => fs.readFileSync(filePath, encoding),
    writeFileSync: (filePath, data) => fs.writeFileSync(filePath, data),
    writeFileAtomicSync: (filePath, data) => writeFileAtomicSync(filePath, data, { encoding: 'utf8' }),
    mkdirSync: (dirPath, options) => fs.mkdirSync(dirPath, options),
    readdirSync: (dirPath) => fs.readdirSync(dirPath),
    unlinkSync: (filePath) => fs.unlinkSync(filePath),
    applyUpdates,
    onAutosaveSuccess: (autosavePath, sidecarPath) => {
      if (recoveryManager) {
        recoveryManager
          .updateAutosavePaths(autosavePath, sidecarPath)
          .catch((e) => console.warn('[main] recovery updateAutosavePaths error:', e));
      }
    },
  });

  // Initialize session recovery manager (after autosave so the callback can reference it)
  recoveryManager = createSessionRecoveryManager({
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    writeFileSync: (p, data) => fs.writeFileSync(p, data),
    writeFileAtomicSync: (p, data) => writeFileAtomicSync(p, data, { encoding: 'utf8' }),
    existsSync: (p) => fs.existsSync(p),
    statSync: (p) => fs.statSync(p),
    unlinkSync: (p) => fs.unlinkSync(p),
    userDataPath: app.getPath('userData'),
    openDocument: (filePath) => openDocumentByPath(filePath),
    setCurrentDocument: (filePath, data) => mainState.setCurrentDocument(filePath, data),
  });

  // Initialize popout window management
  initPopoutManager({
    getMainWindow: () => mainWindow,
    getCurrentData: () => mainState.currentData,
    getReferenceFiles: () => mainState.referenceFiles,
    loadRendererPage,
    getGuidesDir,
    getGuidesListResult,
    buildRefsPopoutData,
    getDirname: () => __dirname,
    popoutPayloadStore,
  });
});

app.on('window-all-closed', () => {
  // Mark clean exit for session recovery
  if (recoveryManager) {
    try {
      recoveryManager.markCleanExit();
    } catch (e) {
      console.warn('[main] Failed to mark clean exit:', (e as Error).message);
    }
  }
  killTerminal();
  if (mcpApi) {
    mcpApi.server.close();
    mcpApi = null;
  }
  cleanupJsonMcpConfig(path.join(os.homedir(), '.mcp.json'));
  cleanupJsonMcpConfig(path.join(os.homedir(), '.copilot', 'mcp-config.json'));
  cleanupJsonMcpConfig(path.join(os.homedir(), '.gemini', 'settings.json'));
  // Cleanup Codex MCP config
  cleanupCodexMcpConfig();
  cleanupAgentsMd();
  app.quit();
});

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

// New file
ipcMain.handle('new-file', async () => {
  mainState.resetCurrentDocument({
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'New Character',
    description: '',
    personality: '',
    scenario: '',
    creatorcomment: '',
    tags: [],
    firstMessage: '{{char}}가 당신을 바라봅니다.\n\n"안녕하세요, 처음 뵙겠습니다."',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: '[시스템 노트]\n이 캐릭터의 대화 스타일과 성격을 여기에 작성하세요.',
    css: '/* ============================================================\n   main\n   ============================================================ */\n/* 메인 스타일시트 */\n\n/* ============================================================\n   layout\n   ============================================================ */\n/* 레이아웃 관련 스타일 */\n',
    defaultVariables: '',
    lua: '-- ===== main =====\n-- 메인 트리거 스크립트\n\n-- ===== utils =====\n-- 유틸리티 함수\n',
    triggerScripts: [
      {
        comment: '',
        type: 'start',
        conditions: [],
        effect: [
          {
            type: 'triggerlua',
            code: '-- ===== main =====\n-- 메인 트리거 스크립트\n\n-- ===== utils =====\n-- 유틸리티 함수\n',
          },
        ],
        lowLevelAccess: false,
      },
    ],
    lorebook: [
      {
        key: '캐릭터,이름',
        secondkey: '',
        comment: '캐릭터 기본 정보 (샘플)',
        content: '{{char}}은(는) 샘플 캐릭터입니다.\n이 항목을 수정하거나 삭제하고, 원하는 로어북을 추가하세요.',
        order: 100,
        priority: 0,
        selective: false,
        alwaysActive: false,
        mode: 'normal',
        extentions: {},
      },
    ],
    regex: [
      {
        comment: '샘플 정규식',
        type: 'editoutput',
        find: '\\*\\*(.+?)\\*\\*',
        replace: '<b>$1</b>',
        flag: 'g',
      },
    ],
    moduleId: '',
    moduleName: 'New Module',
    moduleDescription: '',
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    _risuExt: {},
    _card: { spec: 'chara_card_v3', spec_version: '3.0', data: { extensions: { risuai: {} } } },
    _moduleData: null,
    _presetData: null,
  } as CharxData);
  mainWindow!.setTitle('RisuToki - New');
  broadcastSidebarDataChanged();
  return serializeForRenderer(mainState.currentData!);
});

// Open file dialog + parse charx
ipcMain.handle('open-file', async (): Promise<OpenFileResult> => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      filters: [
        { name: 'RisuAI Files', extensions: ['charx', 'risum', 'risup'] },
        { name: 'Character Card', extensions: ['charx'] },
        { name: 'RisuAI Module', extensions: ['risum'] },
        { name: 'Bot Preset', extensions: ['risup'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    return { success: true, data: openDocumentIntoWorkspace(result.filePaths[0]) };
  } catch (err) {
    console.error('[main] open-file error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('open-file-path', async (_event, filePath: string) => {
  try {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Missing file path');
    }
    return openDocumentIntoWorkspace(filePath.trim());
  } catch (err) {
    console.error('[main] open-file-path error:', err);
    throw err;
  }
});

async function saveCurrentDocumentFromMcp(): Promise<SaveResult> {
  if (!mainState.currentData) return { success: false, error: 'No file open' };
  if (!mainState.currentFilePath) {
    return saveCurrentFileAs({});
  }
  try {
    invalidateAssetsMapCache();
    if (mcpApi) mcpApi.invalidateSectionCaches();
    if (mainState.currentData._fileType === 'risum') {
      saveRisum(mainState.currentFilePath, mainState.currentData);
    } else if (mainState.currentData._fileType === 'risup') {
      saveRisup(mainState.currentFilePath, mainState.currentData);
    } else {
      saveCharx(mainState.currentFilePath, mainState.currentData);
    }
    if (recoveryManager) recoveryManager.clearAutosavePaths();
    return { success: true, path: mainState.currentFilePath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// Save to current path
async function saveCurrentFileAs(updatedFields: Record<string, unknown>): Promise<SaveResult> {
  try {
    applyUpdates(mainState.currentData!, updatedFields);
    invalidateAssetsMapCache();
    if (mcpApi) mcpApi.invalidateSectionCaches();

    const fileType = mainState.currentData!._fileType;
    let filters: { name: string; extensions: string[] }[];
    let defaultExt: string;
    if (fileType === 'risum') {
      filters = [{ name: 'RisuAI Module', extensions: ['risum'] }];
      defaultExt = '.risum';
    } else if (fileType === 'risup') {
      filters = [{ name: 'Bot Preset', extensions: ['risup'] }];
      defaultExt = '.risup';
    } else {
      filters = [{ name: 'Character Card', extensions: ['charx'] }];
      defaultExt = '.charx';
    }

    const result = await dialog.showSaveDialog(mainWindow!, {
      filters,
      defaultPath: mainState.currentFilePath || `untitled${defaultExt}`,
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

    if (fileType === 'risum') {
      saveRisum(result.filePath, mainState.currentData!);
    } else if (fileType === 'risup') {
      saveRisup(result.filePath, mainState.currentData!);
    } else {
      saveCharx(result.filePath, mainState.currentData!);
    }
    mainState.setCurrentDocument(result.filePath, mainState.currentData!);
    mainWindow!.setTitle(`RisuToki - ${path.basename(mainState.currentFilePath!)}`);
    return { success: true, path: mainState.currentFilePath! };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

ipcMain.handle('save-file', async (_event, updatedFields: Record<string, unknown>) => {
  if (!mainState.currentData) return { success: false, error: 'No file open' };
  try {
    if (!mainState.currentFilePath) {
      const result = await saveCurrentFileAs(updatedFields);
      syncRecoveryAfterExplicitSave(recoveryManager, result).catch((e) =>
        console.warn('[main] recovery sync after save error:', e),
      );
      return result;
    }

    applyUpdates(mainState.currentData, updatedFields);
    invalidateAssetsMapCache();
    if (mcpApi) mcpApi.invalidateSectionCaches();

    if (mainState.currentData._fileType === 'risum') {
      saveRisum(mainState.currentFilePath, mainState.currentData);
    } else if (mainState.currentData._fileType === 'risup') {
      saveRisup(mainState.currentFilePath, mainState.currentData);
    } else {
      saveCharx(mainState.currentFilePath, mainState.currentData);
    }
    // After explicit save, clear stale autosave paths from recovery record
    if (recoveryManager) recoveryManager.clearAutosavePaths();
    return { success: true, path: mainState.currentFilePath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// Save As
ipcMain.handle('save-file-as', async (_event, updatedFields: Record<string, unknown>) => {
  if (!mainState.currentData) return { success: false, error: 'No file open' };
  const result = await saveCurrentFileAs(updatedFields);
  syncRecoveryAfterExplicitSave(recoveryManager, result).catch((e) =>
    console.warn('[main] recovery sync after save error:', e),
  );
  return result;
});

// Get current file path (for terminal context)
ipcMain.handle('get-file-path', () => mainState.currentFilePath);

ipcMain.handle('list-references', () => mainState.referenceFiles);
ipcMain.handle('get-reference-manifest-status', () => mainState.referenceManifestStatus);

// Open reference file (read-only, doesn't replace main file) — supports multi-select
ipcMain.handle('open-reference', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      filters: [
        { name: 'RisuAI Files', extensions: ['charx', 'risum', 'risup'] },
        { name: 'Character Card', extensions: ['charx'] },
        { name: 'RisuAI Module', extensions: ['risum'] },
        { name: 'RisuAI Preset', extensions: ['risup'] },
      ],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const refs: ReferenceRecord[] = [];
    for (const refPath of result.filePaths) {
      try {
        const ref = restoreReferenceRecord(refPath);
        addReferenceRecord(ref);
        refs.push(ref);
      } catch (e) {
        console.error('[main] open-reference error for:', refPath, e);
      }
    }
    if (refs.length > 0) {
      broadcastRefsDataChanged();
    }
    return refs.length === 1 ? refs[0] : refs;
  } catch (err) {
    console.error('[main] open-reference error:', err);
    return null;
  }
});

// Open reference file by path (for drag-and-drop)
ipcMain.handle('open-reference-path', async (_event, filePath: string) => {
  try {
    const ref = restoreReferenceRecord(filePath);
    addReferenceRecord(ref);
    broadcastRefsDataChanged();
    return ref;
  } catch (err) {
    console.error('[main] open-reference-path error:', err);
    return null;
  }
});

// Remove reference file
ipcMain.handle('remove-reference', (_event, fileIdentifier: string) => {
  const next = removeReferenceRecord(mainState.referenceFiles, fileIdentifier);
  const removedFromManifest = forgetReferenceManifestPath(fileIdentifier);
  if (next.length === mainState.referenceFiles.length && !removedFromManifest) {
    return true;
  }
  mainState.setReferenceFiles(next);
  persistReferenceFiles();
  broadcastRefsDataChanged();
  return true;
});

// Remove all reference files
ipcMain.handle('remove-all-references', () => {
  if (mainState.referenceFiles.length === 0 && referenceManifestPaths.length === 0) {
    return true;
  }
  referenceManifestPaths = [];
  mainState.setReferenceFiles([]);
  persistReferenceFiles();
  broadcastRefsDataChanged();
  return true;
});

// Get working directory for terminal (prefers tracked terminal cwd)
ipcMain.handle('get-cwd', () => {
  const cwd = mainState.terminalCwd;
  return (
    (cwd && path.isAbsolute(cwd) ? cwd : null) ||
    (mainState.currentFilePath ? path.dirname(mainState.currentFilePath) : null) ||
    process.cwd()
  );
});

// Sync tracked terminal cwd from renderer-side heuristic parser
ipcMain.handle('set-terminal-cwd', (_event, cwd: string | null) => {
  if (cwd !== null && (typeof cwd !== 'string' || !path.isAbsolute(cwd))) {
    console.warn('[main] set-terminal-cwd: ignoring non-absolute value:', cwd);
    return false;
  }
  mainState.setTerminalCwd(cwd);
  return true;
});

// --- DevTools ---
ipcMain.handle('toggle-devtools', () => {
  mainWindow!.webContents.toggleDevTools();
});

// --- Open folder in file explorer ---
ipcMain.handle('open-folder', (_event, folderPath: string) => {
  shell.openPath(folderPath);
});

// --- Get autosave info ---
ipcMain.handle('get-autosave-info', (_event, customDir?: string) => {
  const dir = customDir || (mainState.currentFilePath ? path.dirname(mainState.currentFilePath) : null);
  if (!dir) return null;
  const base = mainState.currentFilePath
    ? path.basename(mainState.currentFilePath, path.extname(mainState.currentFilePath))
    : '';
  return { dir, prefix: base ? `${base}_autosave_` : '', hasFile: !!mainState.currentFilePath };
});

// --- Session recovery IPC ---
ipcMain.handle('get-pending-session-recovery', async () => {
  if (!recoveryManager) return null;
  return recoveryManager.getPendingRecovery();
});

ipcMain.handle('resolve-pending-session-recovery', async (_event, action: 'restore' | 'open-original' | 'ignore') => {
  if (!recoveryManager) return null;
  const candidate = await recoveryManager.getPendingRecovery();
  if (!candidate) return null;

  if (action === 'restore') {
    await recoveryManager.restoreFromRecovery(candidate);
    invalidateAssetsMapCache();
    if (mcpApi) mcpApi.invalidateSectionCaches();
    mainWindow!.setTitle(`RisuToki - ${path.basename(mainState.currentFilePath!)}`);
    broadcastSidebarDataChanged();
    return {
      action: 'restore' as const,
      data: serializeForRenderer(mainState.currentData!),
      recovery: {
        autosavePath: candidate.autosavePath,
        provenance: candidate.provenance,
      },
    };
  }

  if (action === 'open-original') {
    await recoveryManager.openOriginal(candidate);
    invalidateAssetsMapCache();
    if (mcpApi) mcpApi.invalidateSectionCaches();
    mainWindow!.setTitle(`RisuToki - ${path.basename(mainState.currentFilePath!)}`);
    broadcastSidebarDataChanged();
    return {
      action: 'open-original' as const,
      data: serializeForRenderer(mainState.currentData!),
    };
  }

  // action === 'ignore'
  recoveryManager.ignoreRecovery();
  return null;
});

// --- Assistant prompt info ---
ipcMain.handle('get-claude-prompt', () => {
  if (!mainState.currentData) return null;
  const fileName = mainState.currentFilePath ? path.basename(mainState.currentFilePath) : 'new file';
  const stats: string[] = [];
  if (mainState.currentData.lua) stats.push(`Lua: ${(mainState.currentData.lua.length / 1024).toFixed(0)}KB`);
  if (mainState.currentData.lorebook?.length) stats.push(`로어북: ${mainState.currentData.lorebook.length}개`);
  if (mainState.currentData.regex?.length) stats.push(`정규식: ${mainState.currentData.regex.length}개`);
  if (mainState.currentData.globalNote)
    stats.push(`글로벌노트: ${(mainState.currentData.globalNote.length / 1024).toFixed(0)}KB`);
  if (mainState.currentData.css) stats.push(`CSS: ${(mainState.currentData.css.length / 1024).toFixed(0)}KB`);

  return {
    fileName,
    name: mainState.currentData.name || '',
    stats: stats.join(', '),
    cwd: mainState.currentFilePath ? path.dirname(mainState.currentFilePath) : process.cwd(),
  };
});

// --- MCP ---
ipcMain.handle('get-mcp-info', () => {
  if (!apiPort || !apiToken) return null;
  return {
    port: apiPort,
    token: apiToken,
    mcpServerPath: path.join(__dirname, 'toki-mcp-server.js'),
  };
});

// Import JSON file (for lorebook/regex)
ipcMain.handle('import-json', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || !result.filePaths.length) return null;

  const imported: { fileName: string; data: unknown }[] = [];
  for (const filePath of result.filePaths) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const json: unknown = JSON.parse(content);
      imported.push({ fileName: path.basename(filePath), data: json });
    } catch (e) {
      console.warn('[main] Skipping invalid reference file:', filePath, (e as Error).message);
    }
  }
  return imported;
});

// --- Persona files ---
function isValidPersonaName(name: unknown): name is string {
  return typeof name === 'string' && /^[a-zA-Z0-9가-힣_\- ]+$/.test(name) && name.length <= 128;
}

ipcMain.handle('read-persona', async (_event, name: string) => {
  if (!isValidPersonaName(name)) {
    console.warn('[main] Invalid persona name:', name);
    return null;
  }
  const filePath = path.join(__dirname, 'assets', 'persona', `${name}.txt`);
  if (!filePath.startsWith(path.join(__dirname, 'assets', 'persona'))) {
    console.warn('[main] Path traversal blocked:', name);
    return null;
  }
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (e) {
    console.warn('[main] Failed to read persona:', name, (e as Error).message);
    return null;
  }
});

ipcMain.handle('write-persona', async (_event, name: string, content: string) => {
  if (!isValidPersonaName(name)) {
    console.warn('[main] Invalid persona name:', name);
    return false;
  }
  const dir = path.join(__dirname, 'assets', 'persona');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* exists */
  }
  const filePath = path.join(dir, `${name}.txt`);
  if (!filePath.startsWith(dir)) {
    console.warn('[main] Path traversal blocked:', name);
    return false;
  }
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (e) {
    console.warn('[main] Failed to write persona:', name, (e as Error).message);
    return false;
  }
});

ipcMain.handle('list-personas', async () => {
  const dir = path.join(__dirname, 'assets', 'persona');
  try {
    const files = await fs.promises.readdir(dir);
    return files.filter((f: string) => f.endsWith('.txt')).map((f: string) => f.replace('.txt', ''));
  } catch (e) {
    console.warn('[main] Failed to list personas:', (e as Error).message);
    return [];
  }
});

// --- System Prompt (temp file for Claude CLI) ---
ipcMain.handle('write-system-prompt', async (_event, content: string) => {
  const tmpFile = path.join(os.tmpdir(), 'toki-system-prompt.txt');
  await fs.promises.writeFile(tmpFile, content, 'utf-8');
  return { filePath: tmpFile, platform: process.platform };
});

// ---------------------------------------------------------------------------
// Lua Section Parsing (passed to MCP API server as deps)
// ---------------------------------------------------------------------------

function detectLuaSection(line: string): string | null {
  const trimmed = line.trim();
  if (!/^-{2,3}/.test(trimmed)) return null;
  const eqGroups = trimmed.match(/={3,}/g);
  if (!eqGroups) return null;
  const totalEq = eqGroups.reduce((sum, m) => sum + m.length, 0);
  if (totalEq < 6) return null;
  const inlineMatch = trimmed.match(/^-{2,3}\s*={3,}\s+(.+?)\s+={3,}\s*$/);
  if (inlineMatch) return inlineMatch[1].trim();
  if (/^-{2,3}\s*={6,}\s*$/.test(trimmed)) return '';
  return null;
}

function parseLuaSections(luaCode: string): Section[] {
  if (!luaCode || !luaCode.trim()) return [{ name: 'main', content: '' }];
  const lines = luaCode.split('\n');
  const sections: Section[] = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionName = detectLuaSection(line);
    if (sectionName !== null) {
      if (currentName !== null) {
        sections.push({ name: currentName, content: currentLines.join('\n').trim() });
      }
      if (sectionName === '') {
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        const commentMatch = nextLine.match(/^--\s*(.+)$/);
        if (commentMatch && detectLuaSection(nextLine) === null) {
          currentName = commentMatch[1].trim();
          i++;
          const closingLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
          if (detectLuaSection(closingLine) !== null) i++;
        } else {
          currentName = `section_${sections.length}`;
        }
      } else {
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        if (nextLine && detectLuaSection(nextLine) === '') i++;
        currentName = sectionName;
      }
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentName !== null) {
    sections.push({ name: currentName, content: currentLines.join('\n').trim() });
  }
  if (sections.length === 0) {
    sections.push({ name: 'main', content: luaCode.trim() });
  }
  const merged: Section[] = [];
  for (let i = 0; i < sections.length; i++) {
    if (!sections[i].content && i + 1 < sections.length) {
      merged.push({ name: sections[i].name, content: sections[i + 1].content });
      i++;
    } else {
      merged.push(sections[i]);
    }
  }
  return merged;
}

function combineLuaSections(sections: Section[]): string {
  return sections.map((s) => `-- ===== ${s.name} =====\n${s.content}`).join('\n\n');
}

// ---------------------------------------------------------------------------
// CSS Section Parsing
// ---------------------------------------------------------------------------

function detectCssSectionInline(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('/*') || !trimmed.endsWith('*/')) return null;
  const inner = trimmed.slice(2, -2).trim();
  const eqGroups = inner.match(/={3,}/g);
  if (!eqGroups) return null;
  const totalEq = eqGroups.reduce((sum, m) => sum + m.length, 0);
  if (totalEq < 6) return null;
  const inlineMatch = inner.match(/^={3,}\s+(.+?)\s+={3,}$/);
  if (inlineMatch) return inlineMatch[1].trim();
  return null;
}

function detectCssBlockOpen(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('/*')) return false;
  if (trimmed.endsWith('*/')) return false;
  const after = trimmed.slice(2).trim();
  return /^={6,}$/.test(after);
}

function detectCssBlockClose(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.endsWith('*/')) return false;
  const before = trimmed.slice(0, -2).trim();
  return /^={6,}$/.test(before);
}

function parseCssSections(cssCode: string): CssCacheEntry {
  let prefix = '';
  let suffix = '';
  if (!cssCode || !cssCode.trim()) return { sections: [{ name: 'main', content: '' }], prefix, suffix };

  let work = cssCode;
  const openMatch = work.match(/^(\s*<style[^>]*>\s*\n?)/i);
  const closeMatch = work.match(/(\n?\s*<\/style>\s*)$/i);
  if (openMatch && closeMatch) {
    prefix = openMatch[1];
    suffix = closeMatch[1];
    work = work.slice(openMatch[1].length, work.length - closeMatch[1].length);
  }

  const lines = work.split('\n');
  const sections: Section[] = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inlineName = detectCssSectionInline(line);
    if (inlineName !== null) {
      if (currentName !== null) {
        sections.push({ name: currentName, content: currentLines.join('\n').trim() });
      }
      currentName = inlineName;
      currentLines = [];
      continue;
    }
    if (detectCssBlockOpen(line)) {
      const nameLines: string[] = [];
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (detectCssBlockClose(lines[j])) {
          closed = true;
          break;
        }
        const text = lines[j].trim();
        if (text) nameLines.push(text);
        j++;
      }
      if (closed && nameLines.length > 0) {
        if (currentName !== null) {
          sections.push({ name: currentName, content: currentLines.join('\n').trim() });
        }
        currentName = nameLines[0];
        currentLines = [];
        i = j;
        continue;
      }
    }
    currentLines.push(line);
  }

  if (currentName !== null) {
    sections.push({ name: currentName, content: currentLines.join('\n').trim() });
  }
  if (sections.length === 0) {
    sections.push({ name: 'main', content: cssCode.trim() });
  }
  const merged: Section[] = [];
  for (let i = 0; i < sections.length; i++) {
    if (!sections[i].content && i + 1 < sections.length) {
      merged.push({ name: sections[i].name, content: sections[i + 1].content });
      i++;
    } else {
      merged.push(sections[i]);
    }
  }
  return { sections: merged, prefix, suffix };
}

function combineCssSections(sections: Section[], prefix: string, suffix: string): string {
  const eq = '============================================================';
  const body = sections.map((s) => `/* ${eq}\n   ${s.name}\n   ${eq} */\n${s.content}`).join('\n\n');
  const effectivePrefix = prefix || '<style>\n';
  const effectiveSuffix = suffix || '\n</style>';
  return effectivePrefix + body + effectiveSuffix;
}
