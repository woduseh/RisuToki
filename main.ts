'use strict';
import { captureFileBaseline, assertFileUnchanged } from './src/lib/file-baseline';
import { captureDocumentSaveScope } from './src/lib/document-save-scope';

import { app, BrowserWindow, ipcMain, dialog, net, shell, type MessageBoxOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import {
  extractPrimaryLuaFromTriggerScripts,
  mergePrimaryLuaIntoTriggerScripts,
  normalizeTriggerScripts,
  openCharx,
  openRisum,
  openRisup,
  saveCharx,
  saveRisum,
  saveRisup,
  stringifyTriggerScripts,
  type LoadedDocumentData,
} from './src/charx-io';
import type { RendererDocumentData, RendererDocumentPatch } from './src/lib/document-types';
import {
  startApiServer as startApiServerImpl,
  type McpApiServer,
  type McpReferenceFile,
  type McpSessionStatus,
} from './src/lib/mcp-api-server';
import type { RuntimeMetadata } from './src/lib/mcp-runtime-contract';
import { buildRuntimeMetadata } from './src/lib/mcp-runtime-contract';
import { cleanupAgentsMd, initAgentsMdManager } from './src/lib/agents-md-manager';
import { initAssetManager, invalidateAssetsMapCache } from './src/lib/asset-manager';
import { writeFileAtomicSync } from './src/lib/atomic-write';
import { initAutosaveManager } from './src/lib/autosave-manager';
import { resolveCloseWindowAction, shouldPromptForUnsavedClose } from './src/lib/close-window-policy';
import { resolveGuideRootDirs, resolveSkillRootDirs } from './src/lib/content-roots';
import {
  applyRendererUpdates as applyUpdates,
  serializeActiveDocument as serializeForRenderer,
  hasRendererDocumentChanges,
} from './src/lib/renderer-document-state';
import {
  extractDocumentToProject,
  getProjectFileType,
  listProjectTree,
  loadProjectData as loadProjectDataImpl,
  readProjectFile,
  reassembleProjectDocument,
  saveProjectData,
  writeProjectFile,
} from './src/lib/folder-workspace';
import { initGuidesManager, resolveBuiltInGuidePath } from './src/lib/guides-manager';
import { askRendererCloseConfirm, askRendererConfirm, initIpcConfirm } from './src/lib/ipc-confirm';
import { createMainStateStore } from './src/lib/main-state-store';
import {
  cleanupCodexMcpConfig,
  cleanupJsonMcpConfig,
  initMcpConfig,
  writeCurrentMcpConfig,
} from './src/lib/mcp-config';
import * as referenceStoreRuntime from './src/lib/reference-store';
import {
  combineCssSections,
  combineLuaSections,
  detectCssBlockClose,
  detectCssBlockOpen,
  detectCssSectionInline,
  detectLuaSection,
  parseCssSections,
  parseLuaSections,
} from './src/lib/section-parser';
import { markRecoveryDocumentActiveForPath, syncRecoveryAfterExplicitSave } from './src/lib/session-recovery-main';
import { createSessionRecoveryManager } from './src/lib/session-recovery-manager';
import { initTerminalManager, killTerminal } from './src/lib/terminal-manager';
import { initMainUtilityIpc } from './src/lib/main-utility-ipc';
import { importCharacterCardByPath } from './src/lib/character-card-import';
import {
  checkForAppUpdates,
  createUpdatePromptStore,
  fetchLatestReleaseVersion,
  LATEST_RELEASE_PAGE_URL,
} from './src/lib/app-update-manager';

// ---------------------------------------------------------------------------
// Interfaces for .cjs modules and local types
// ---------------------------------------------------------------------------

interface ReferenceRecord extends McpReferenceFile {
  fileName: string;
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
  currentProjectPath: string | null;
  currentData: LoadedDocumentData | null;
  currentFileBaseline: Record<string, unknown> | null;
  referenceFiles: ReferenceRecord[];
  referenceManifestStatus: ReferenceManifestStatus | null;
  terminalCwd: string | null;
  resetCurrentDocument(data: LoadedDocumentData): void;
  setCurrentDocument(filePath: string, data: LoadedDocumentData): void;
  setCurrentProject(projectPath: string, data: LoadedDocumentData, sourceFilePath?: string | null): void;
  clearCurrentProject(): void;
  setCurrentFileBaseline(baseline: Record<string, unknown> | null): void;
  setReferenceFiles(files: ReferenceRecord[]): void;
  setReferenceManifestStatus(status: ReferenceManifestStatus | null): void;
  setTerminalCwd(cwd: string | null): void;
}

interface SaveResult {
  success: boolean;
  path?: string;
  error?: string;
}

type OpenFileResult =
  | { success: true; data: Record<string, unknown>; path?: string; sourceFormat?: string; imported?: boolean }
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
  document?: RendererDocumentData | null;
  success: boolean;
  error?: string;
  renderer?: RendererSessionStatus | null;
  suggestion?: string;
}

const COMPILED_ROOT = __dirname;
const APP_ROOT = path.resolve(COMPILED_ROOT, '..', '..');

const loadProjectData = loadProjectDataImpl as (projectPath: string) => LoadedDocumentData;

const {
  normalizeReferencePath,
  upsertReferenceRecord,
  removeReferenceRecord,
  serializeReferenceManifestPaths,
  parseReferenceManifest,
  validateReferenceManifestPaths,
} = referenceStoreRuntime as unknown as {
  normalizeReferencePath: (filePath: string) => string;
  upsertReferenceRecord: (records: ReferenceRecord[], record: ReferenceRecord) => ReferenceRecord[];
  removeReferenceRecord: (records: ReferenceRecord[], identifier: string) => ReferenceRecord[];
  serializeReferenceManifestPaths: (paths: string[]) => { version: number; paths: string[] };
  parseReferenceManifest: (value: unknown) => string[];
  validateReferenceManifestPaths: (
    paths: string[],
    opts: { existsSync: (filePath: string) => boolean },
  ) => { validPaths: string[]; issues: ReferenceManifestIssue[] };
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
const mainState = createMainStateStore() as unknown as MainStateStore;

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
let projectWatcher: fs.FSWatcher | null = null;
let projectWatchTimer: NodeJS.Timeout | null = null;
let suppressProjectWatchUntil = 0;
let currentImportSourcePath: string | null = null;
let currentImportSourceFormat: string | null = null;

// ---------------------------------------------------------------------------
// Document open helper (shared by open-file and recovery)
// ---------------------------------------------------------------------------

function openDocumentByPath(filePath: string): LoadedDocumentData {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.risum') return openRisum(filePath);
  if (ext === '.risup') return openRisup(filePath);
  return openCharx(filePath);
}

function getSourceFormat(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  if (ext === 'charx' || ext === 'risum' || ext === 'risup' || ext === 'png' || ext === 'json') return ext;
  if (ext === 'jpg' || ext === 'jpeg') return ext;
  return ext || 'file';
}

function isCharacterCardImportPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.png' || ext === '.json';
}

function clearImportSource(): void {
  currentImportSourcePath = null;
  currentImportSourceFormat = null;
}

function getDocumentFileType(data: LoadedDocumentData): 'charx' | 'risum' | 'risup' {
  if (data._fileType === 'risum' || data._fileType === 'risup') return data._fileType;
  return 'charx';
}

function getArtifactTypeFromPath(filePath: string | null): 'charx' | 'risum' | 'risup' | 'unknown' {
  const extension = filePath ? path.extname(filePath).toLowerCase() : '';
  if (extension === '.charx') return 'charx';
  if (extension === '.risum') return 'risum';
  if (extension === '.risup') return 'risup';
  return 'unknown';
}

function getSaveDialogOptionsForFileType(fileType: 'charx' | 'risum' | 'risup'): {
  filters: { name: string; extensions: string[] }[];
  defaultExt: string;
} {
  if (fileType === 'risum') {
    return { filters: [{ name: 'RisuAI Module', extensions: ['risum'] }], defaultExt: '.risum' };
  }
  if (fileType === 'risup') {
    return { filters: [{ name: 'RisuAI Preset', extensions: ['risup'] }], defaultExt: '.risup' };
  }
  return { filters: [{ name: 'Character Card', extensions: ['charx'] }], defaultExt: '.charx' };
}

function sameDocumentPath(a: string, b: string): boolean {
  const normalizedA = path.normalize(a);
  const normalizedB = path.normalize(b);
  if (process.platform === 'win32') {
    return normalizedA.toLowerCase() === normalizedB.toLowerCase();
  }
  return normalizedA === normalizedB;
}

function activateOpenedDocument(filePath: string, nextData: LoadedDocumentData): Record<string, unknown> {
  stopProjectWatcher();
  clearImportSource();
  mainState.setCurrentDocument(filePath, nextData);
  mainState.setCurrentFileBaseline(captureFileBaseline(filePath));
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

function activateProjectDocument(
  projectPath: string,
  nextData: LoadedDocumentData,
  sourceFilePath?: string | null,
): Record<string, unknown> {
  clearImportSource();
  mainState.setCurrentProject(projectPath, nextData, sourceFilePath || null);
  mainState.setCurrentFileBaseline(sourceFilePath ? captureFileBaseline(sourceFilePath) : null);
  invalidateAssetsMapCache();
  if (mcpApi) mcpApi.invalidateSectionCaches();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(`RisuToki - ${path.basename(projectPath)} [Project]`);
  }
  if (apiPort) writeCurrentMcpConfig();
  broadcastSidebarDataChanged();
  startProjectWatcher(projectPath);
  return serializeForRenderer(mainState.currentData!);
}

function activateImportedDocument(
  sourcePath: string,
  sourceFormat: string,
  nextData: LoadedDocumentData,
): Record<string, unknown> {
  stopProjectWatcher();
  mainState.resetCurrentDocument(nextData);
  mainState.setCurrentFileBaseline(null);
  currentImportSourcePath = sourcePath;
  currentImportSourceFormat = sourceFormat;
  invalidateAssetsMapCache();
  if (mcpApi) mcpApi.invalidateSectionCaches();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(`RisuToki - ${path.basename(sourcePath)} [Imported]`);
  }
  if (apiPort) writeCurrentMcpConfig();
  broadcastSidebarDataChanged();
  return serializeForRenderer(mainState.currentData!);
}

function openDocumentIntoWorkspaceResult(filePath: string): {
  data: Record<string, unknown>;
  path: string;
  sourceFormat: string;
  imported?: boolean;
} {
  const normalizedPath = path.normalize(filePath);
  const sourceFormat = getSourceFormat(normalizedPath);
  console.log('[main] Opening:', normalizedPath);
  if (isCharacterCardImportPath(normalizedPath)) {
    const imported = importCharacterCardByPath(normalizedPath);
    const serialized = activateImportedDocument(normalizedPath, imported.format, imported.data);
    console.log('[main] Imported OK, name:', mainState.currentData!.name, 'format:', imported.format);
    return { data: serialized, path: normalizedPath, sourceFormat: imported.format, imported: true };
  }

  let nextData: LoadedDocumentData;
  try {
    nextData = openDocumentByPath(normalizedPath);
  } catch (error) {
    if (sourceFormat === 'jpg' || sourceFormat === 'jpeg') {
      throw new Error(
        `JPEG Character Card 데이터를 찾지 못했습니다. RisuAI 카드 ZIP 프리루드가 포함된 .jpg/.jpeg 파일인지 확인하세요. (${(error as Error).message})`,
      );
    }
    throw error;
  }
  const serialized = activateOpenedDocument(normalizedPath, nextData);
  console.log(
    '[main] Parsed OK, name:',
    mainState.currentData!.name,
    'type:',
    getDocumentFileType(mainState.currentData!),
  );
  return { data: serialized, path: normalizedPath, sourceFormat };
}

function openDocumentIntoWorkspace(filePath: string): Record<string, unknown> {
  return openDocumentIntoWorkspaceResult(filePath).data;
}

function stopProjectWatcher(): void {
  if (projectWatchTimer) {
    clearTimeout(projectWatchTimer);
    projectWatchTimer = null;
  }
  if (projectWatcher) {
    projectWatcher.close();
    projectWatcher = null;
  }
}

function startProjectWatcher(projectPath: string): void {
  stopProjectWatcher();
  try {
    projectWatcher = fs.watch(projectPath, { recursive: true }, (_event, fileName) => {
      if (Date.now() < suppressProjectWatchUntil) return;
      const name = String(fileName || '');
      if (!name || name.startsWith('.risutoki')) return;
      if (projectWatchTimer) clearTimeout(projectWatchTimer);
      projectWatchTimer = setTimeout(() => {
        projectWatchTimer = null;
        if (!mainState.currentProjectPath) return;
        broadcastToAll('project-folder-changed', { path: mainState.currentProjectPath, fileName: name });
      }, 250);
    });
  } catch (error) {
    console.warn('[main] failed to watch project folder:', error);
  }
}

function saveCurrentProject(updatedFields: RendererDocumentPatch): SaveResult {
  if (!mainState.currentData || !mainState.currentProjectPath) return { success: false, error: 'No project open' };
  applyUpdates(mainState.currentData, updatedFields);
  invalidateAssetsMapCache();
  if (mcpApi) mcpApi.invalidateSectionCaches();
  suppressProjectWatchUntil = Date.now() + 1000;
  saveProjectData(mainState.currentProjectPath, mainState.currentData);
  return { success: true, path: mainState.currentProjectPath };
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
    activeFileBaseline: mainState.currentFileBaseline as McpSessionStatus['activeFileBaseline'],
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

function getAppBackedRuntimeInfo(): RuntimeMetadata {
  const appVersion = app.getVersion();
  return buildRuntimeMetadata({
    serverVersion: appVersion,
    appVersion,
    packageVersion: appVersion,
    buildTime: null,
    commit: null,
    runtimeMode: 'app-backed',
  });
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
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
  return windowRef.loadFile(path.join(APP_ROOT, 'dist', entryFile), { query: cleanQuery });
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
    icon: path.join(APP_ROOT, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(COMPILED_ROOT, 'preload.js'),
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
    try {
      const status = await requestRendererSessionStatus();
      if (!status.success || !status.document || !mainState.currentData) {
        return { success: false, error: 'Cannot read the current editor draft. Keep the window open and retry.' };
      }
      applyUpdates(mainState.currentData, status.document);
      return await saveCurrentDocumentFromMcp();
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  function closeWindowForReal(): void {
    isClosingForReal = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  }

  mainWindow.on('close', (e) => {
    if (!mainState.currentData || isClosingForReal) return;

    e.preventDefault();
    Promise.resolve()
      .then(async () => {
        const status = await requestRendererSessionStatus().catch((err) => {
          console.error('[main] Failed to read renderer dirty status before close:', err);
          return null;
        });

        if (
          !shouldPromptForUnsavedClose({
            hasCurrentDocument: !!mainState.currentData,
            status,
          })
        ) {
          closeWindowForReal();
          return;
        }

        const choice = await askRendererCloseConfirm();
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
          closeWindowForReal();
        }
      })
      .catch((err) => {
        console.error('[main] Close confirmation failed:', err);
        dialog.showErrorBox('종료 확인 실패', '창 닫기 확인 중 오류가 발생해 창을 닫지 않았습니다.');
      });
  });
}

function showUpdateMessageBox(options: MessageBoxOptions) {
  if (mainWindow && !mainWindow.isDestroyed()) return dialog.showMessageBox(mainWindow, options);
  return dialog.showMessageBox(options);
}

function scheduleAppUpdateCheck(): void {
  const timer = setTimeout(() => {
    void checkForAppUpdates({
      isPackaged: app.isPackaged,
      isPortable: !!process.env.PORTABLE_EXECUTABLE_FILE,
      currentVersion: app.getVersion(),
      promptStore: createUpdatePromptStore(app.getPath('userData')),
      installedUpdater: autoUpdater,
      fetchLatestReleaseVersion: () => fetchLatestReleaseVersion(net.fetch.bind(net) as typeof fetch),
      async confirmInstalledUpdate(latestVersion, currentVersion) {
        const result = await showUpdateMessageBox({
          type: 'info',
          title: 'RisuToki 업데이트',
          message: `RisuToki ${latestVersion} 업데이트가 있습니다.`,
          detail: `현재 버전: ${currentVersion}\n업데이트를 다운로드할까요? 다운로드가 끝나면 앱을 정상 종료할 때 자동으로 설치됩니다.`,
          buttons: ['업데이트', '나중에'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
        return result.response === 0;
      },
      async confirmPortableUpdate(latestVersion, currentVersion) {
        const result = await showUpdateMessageBox({
          type: 'info',
          title: 'RisuToki 업데이트',
          message: `RisuToki ${latestVersion} 업데이트가 있습니다.`,
          detail: `현재 버전: ${currentVersion}\nGitHub 릴리스 페이지에서 새 포터블 버전을 받을 수 있습니다.`,
          buttons: ['릴리스 페이지 열기', '나중에'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
        return result.response === 0;
      },
      async notifyInstalledUpdateReady(latestVersion) {
        await showUpdateMessageBox({
          type: 'info',
          title: '업데이트 다운로드 완료',
          message: `RisuToki ${latestVersion} 업데이트를 다운로드했습니다.`,
          detail: '작업을 저장하고 앱을 정상 종료하면 업데이트가 자동으로 설치됩니다.',
          buttons: ['확인'],
          defaultId: 0,
          noLink: true,
        });
      },
      notifyInstalledUpdateError(message) {
        dialog.showErrorBox('업데이트 다운로드 실패', `업데이트를 다운로드하지 못했습니다.\n\n${message}`);
      },
      openLatestRelease: () => shell.openExternal(LATEST_RELEASE_PAGE_URL),
      logError(message, error) {
        console.warn(`[update] ${message}:`, error);
      },
    });
  }, 5000);
  timer.unref();
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

  mcpApi = startApiServerImpl({
    getCurrentData: () => mainState.currentData,
    getReferenceFiles: () => mainState.referenceFiles,
    askRendererConfirm,
    hasRendererDraftChanges: async () => {
      const response = await requestRendererSessionStatus();
      return (
        !response.success ||
        !!response.renderer?.documentSwitchInProgress ||
        !mainState.currentData ||
        hasRendererDocumentChanges(mainState.currentData, response.document)
      );
    },
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
      resolveSkillRootDirs(app.isPackaged ? process.resourcesPath! : APP_ROOT).map((root) => root.absolutePath),
    getGuideRoots: () => resolveGuideRootDirs(app.isPackaged ? process.resourcesPath! : APP_ROOT),
    getUserDataPath: () => app.getPath('userData'),
    getSessionStatus: getCurrentMcpSessionStatus,
    getCurrentFilePath: () => mainState.currentFilePath,
    getRuntimeInfo: getAppBackedRuntimeInfo,
  });
  apiToken = mcpApi.token;

  // Initialize terminal (node-pty) IPC handlers
  initTerminalManager({
    broadcastToAll,
    getCurrentFilePath: () => mainState.currentFilePath,
    getApiPort: () => apiPort,
    getApiToken: () => apiToken,
    getMcpServerPath: () => path.join(APP_ROOT, 'toki-mcp-server.js').replace('app.asar', 'app.asar.unpacked'),
  });

  // Initialize MCP config management
  initMcpConfig({
    getApiPort: () => apiPort,
    getApiToken: () => apiToken,
    getDirname: () => APP_ROOT,
    isPackaged: () => app.isPackaged,
  });

  // Initialize AGENTS.md management
  initAgentsMdManager({
    getCurrentFilePath: () => mainState.currentFilePath,
    getTerminalCwd: () => mainState.terminalCwd,
    getDirname: () => APP_ROOT,
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
    getDirname: () => APP_ROOT,
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
    onAutosaveSuccess: (autosavePath, sidecarPath) => recoveryManager?.updateAutosavePaths(autosavePath, sidecarPath),
  });

  // Initialize session recovery manager (after autosave so the callback can reference it)
  recoveryManager = createSessionRecoveryManager({
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    writeFileSync: (p, data) => fs.writeFileSync(p, data),
    writeFileAtomicSync: (p, data) => writeFileAtomicSync(p, data, { encoding: 'utf8' }),
    existsSync: (p) => fs.existsSync(p),
    statSync: (p) => fs.statSync(p),
    userDataPath: app.getPath('userData'),
    openDocument: (filePath) => openDocumentByPath(filePath),
    setCurrentDocument: (filePath, data) => {
      mainState.setCurrentDocument(filePath, data);
      mainState.setCurrentFileBaseline(captureFileBaseline(filePath));
    },
  });

  scheduleAppUpdateCheck();
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
  cleanupJsonMcpConfig(path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json'));
  // Remove any RisuToki entry left by versions that configured legacy Gemini CLI.
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
  clearImportSource();
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
  } as LoadedDocumentData);
  mainWindow!.setTitle('RisuToki - New');
  broadcastSidebarDataChanged();
  return serializeForRenderer(mainState.currentData!);
});

// Open file dialog + parse charx
ipcMain.handle('open-file', async (): Promise<OpenFileResult> => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      filters: [
        { name: 'RisuAI Files', extensions: ['charx', 'risum', 'risup', 'png', 'json', 'jpg', 'jpeg'] },
        { name: 'Character Card', extensions: ['charx'] },
        { name: 'PNG/JSON Character Card', extensions: ['png', 'json'] },
        { name: 'JPEG Character Card', extensions: ['jpg', 'jpeg'] },
        { name: 'RisuAI Module', extensions: ['risum'] },
        { name: 'Bot Preset', extensions: ['risup'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    const opened = openDocumentIntoWorkspaceResult(result.filePaths[0]);
    return { success: true, ...opened };
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

async function handleExtractDocumentToProject() {
  try {
    const source = await dialog.showOpenDialog(mainWindow!, {
      filters: [
        { name: 'RisuAI Files', extensions: ['charx', 'risum', 'risup'] },
        { name: 'Character Card', extensions: ['charx'] },
        { name: 'RisuAI Module', extensions: ['risum'] },
        { name: 'RisuAI Preset', extensions: ['risup'] },
      ],
      properties: ['openFile'],
    });
    if (source.canceled || !source.filePaths[0]) return { success: false, canceled: true };
    const sourceType = path.extname(source.filePaths[0]).toLowerCase().replace('.', '') || 'project';
    const defaultName = `${path.basename(source.filePaths[0], path.extname(source.filePaths[0]))}_${sourceType}`;
    const target = await dialog.showOpenDialog(mainWindow!, {
      title: '프로젝트 폴더 선택',
      defaultPath: path.join(path.dirname(source.filePaths[0]), defaultName),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (target.canceled || !target.filePaths[0]) return { success: false, canceled: true };
    extractDocumentToProject(source.filePaths[0], target.filePaths[0]);
    const data = loadProjectData(target.filePaths[0]);
    (data as unknown as Record<string, unknown>)._sourceFilePath = source.filePaths[0];
    return {
      success: true,
      data: activateProjectDocument(target.filePaths[0], data, source.filePaths[0]),
      projectPath: target.filePaths[0],
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

ipcMain.handle('extract-document-to-project', handleExtractDocumentToProject);
ipcMain.handle('extract-charx-to-project', handleExtractDocumentToProject);

ipcMain.handle('open-project-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'RisuToki 프로젝트 폴더 열기',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    const data = loadProjectData(result.filePaths[0]);
    return {
      success: true,
      data: activateProjectDocument(result.filePaths[0], data),
      projectPath: result.filePaths[0],
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('open-project-folder-path', async (_event, projectPath: string) => {
  try {
    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      throw new Error('Missing project folder path');
    }
    const normalizedPath = path.normalize(projectPath.trim());
    const data = loadProjectData(normalizedPath);
    return {
      success: true,
      data: activateProjectDocument(normalizedPath, data),
      projectPath: normalizedPath,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

function assertProjectCloneTarget(sourcePath: string, targetPath: string): void {
  const source = path.resolve(sourcePath);
  const target = path.resolve(targetPath);
  if (source === target) {
    throw new Error('원본 프로젝트 폴더와 같은 위치로는 복제할 수 없습니다.');
  }
  const relative = path.relative(source, target);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new Error('원본 프로젝트 폴더 내부로는 복제할 수 없습니다.');
  }
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error('복제 대상 폴더가 비어 있지 않습니다.');
  }
}

ipcMain.handle('clone-project-folder', async () => {
  try {
    if (!mainState.currentProjectPath) {
      return { success: false, error: 'No project folder open' };
    }
    const defaultName = `${path.basename(mainState.currentProjectPath)}_copy`;
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '프로젝트 복제 대상 폴더 선택',
      defaultPath: path.join(path.dirname(mainState.currentProjectPath), defaultName),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };

    const sourcePath = path.resolve(mainState.currentProjectPath);
    const targetPath = path.resolve(result.filePaths[0]);
    assertProjectCloneTarget(sourcePath, targetPath);
    fs.mkdirSync(targetPath, { recursive: true });
    fs.cpSync(sourcePath, targetPath, { recursive: true });
    const data = loadProjectData(targetPath);
    return {
      success: true,
      data: activateProjectDocument(targetPath, data, mainState.currentFilePath),
      projectPath: targetPath,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('reload-project-folder', async () => {
  try {
    if (!mainState.currentProjectPath) return { success: false, error: 'No project folder open' };
    const data = loadProjectData(mainState.currentProjectPath);
    return {
      success: true,
      data: activateProjectDocument(mainState.currentProjectPath, data, mainState.currentFilePath),
      projectPath: mainState.currentProjectPath,
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('save-project-folder', async (_event, updatedFields: RendererDocumentPatch) => {
  try {
    return saveCurrentProject(updatedFields || {});
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

async function handleReassembleProjectDocument(_event: unknown, updatedFields?: RendererDocumentPatch) {
  if (!mainState.currentProjectPath) return { success: false, error: 'No project folder open' };
  const assertSaveScope = captureDocumentSaveScope(mainState);
  try {
    if (updatedFields && mainState.currentData) saveCurrentProject(updatedFields);
    const fileType = getProjectFileType(mainState.currentProjectPath);
    const { filters, defaultExt } = getSaveDialogOptionsForFileType(fileType);
    const result = await dialog.showSaveDialog(mainWindow!, {
      filters,
      defaultPath:
        mainState.currentFilePath ||
        path.join(
          path.dirname(mainState.currentProjectPath),
          `${path.basename(mainState.currentProjectPath)}${defaultExt}`,
        ),
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    assertSaveScope();
    if (mainState.currentFilePath && sameDocumentPath(result.filePath, mainState.currentFilePath)) {
      assertFileUnchanged(result.filePath, mainState.currentFileBaseline);
    }
    reassembleProjectDocument(mainState.currentProjectPath, result.filePath);
    mainState.currentFilePath = result.filePath;
    mainState.setCurrentFileBaseline(captureFileBaseline(result.filePath));
    return { success: true, path: result.filePath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

ipcMain.handle('reassemble-project-document', handleReassembleProjectDocument);
ipcMain.handle('reassemble-project-charx', handleReassembleProjectDocument);

ipcMain.handle('get-project-path', () => mainState.currentProjectPath);
ipcMain.handle('get-project-tree', () =>
  mainState.currentProjectPath ? listProjectTree(mainState.currentProjectPath) : null,
);
ipcMain.handle('read-project-file', (_event, relativePath: string) => {
  if (!mainState.currentProjectPath) throw new Error('No project folder open');
  return readProjectFile(mainState.currentProjectPath, relativePath);
});
ipcMain.handle('write-project-file', (_event, relativePath: string, content: string) => {
  if (!mainState.currentProjectPath) throw new Error('No project folder open');
  suppressProjectWatchUntil = Date.now() + 1000;
  writeProjectFile(mainState.currentProjectPath, relativePath, content);
  return true;
});
ipcMain.handle('watch-project-folder', () => {
  if (!mainState.currentProjectPath) return false;
  startProjectWatcher(mainState.currentProjectPath);
  return true;
});
ipcMain.handle('unwatch-project-folder', () => {
  stopProjectWatcher();
  return true;
});

async function saveCurrentDocumentFromMcp(): Promise<SaveResult> {
  if (!mainState.currentData) return { success: false, error: 'No file open' };
  if (mainState.currentProjectPath) {
    return saveCurrentProject({});
  }
  if (!mainState.currentFilePath) {
    return saveCurrentFileAs({});
  }
  try {
    assertFileUnchanged(mainState.currentFilePath, mainState.currentFileBaseline);
    invalidateAssetsMapCache();
    if (mcpApi) mcpApi.invalidateSectionCaches();
    if (mainState.currentData._fileType === 'risum') {
      saveRisum(mainState.currentFilePath, mainState.currentData);
    } else if (mainState.currentData._fileType === 'risup') {
      saveRisup(mainState.currentFilePath, mainState.currentData);
    } else {
      saveCharx(mainState.currentFilePath, mainState.currentData);
    }
    mainState.setCurrentFileBaseline(captureFileBaseline(mainState.currentFilePath));
    if (recoveryManager) recoveryManager.clearAutosavePaths();
    return { success: true, path: mainState.currentFilePath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// Save to current path
async function saveCurrentFileAs(updatedFields: RendererDocumentPatch): Promise<SaveResult> {
  const assertSaveScope = captureDocumentSaveScope(mainState);
  try {
    if (mainState.currentProjectPath) {
      applyUpdates(mainState.currentData!, updatedFields);
      const fileType = getProjectFileType(mainState.currentProjectPath);
      const { filters, defaultExt } = getSaveDialogOptionsForFileType(fileType);
      const result = await dialog.showSaveDialog(mainWindow!, {
        filters,
        defaultPath:
          mainState.currentFilePath ||
          path.join(
            path.dirname(mainState.currentProjectPath),
            `${path.basename(mainState.currentProjectPath)}${defaultExt}`,
          ),
      });
      if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
      assertSaveScope();
      if (mainState.currentFilePath && sameDocumentPath(result.filePath, mainState.currentFilePath)) {
        assertFileUnchanged(result.filePath, mainState.currentFileBaseline);
      }
      saveCurrentProject({});
      reassembleProjectDocument(mainState.currentProjectPath, result.filePath);
      mainState.currentFilePath = result.filePath;
      mainState.setCurrentFileBaseline(captureFileBaseline(result.filePath));
      return { success: true, path: result.filePath };
    }

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
    assertSaveScope();
    if (mainState.currentFilePath && sameDocumentPath(result.filePath, mainState.currentFilePath)) {
      assertFileUnchanged(result.filePath, mainState.currentFileBaseline);
    }

    if (fileType === 'risum') {
      saveRisum(result.filePath, mainState.currentData!);
    } else if (fileType === 'risup') {
      saveRisup(result.filePath, mainState.currentData!);
    } else {
      saveCharx(result.filePath, mainState.currentData!);
    }
    clearImportSource();
    mainState.setCurrentDocument(result.filePath, mainState.currentData!);
    mainState.setCurrentFileBaseline(captureFileBaseline(result.filePath));
    mainWindow!.setTitle(`RisuToki - ${path.basename(mainState.currentFilePath!)}`);
    return { success: true, path: mainState.currentFilePath! };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

ipcMain.handle('save-file', async (_event, updatedFields: RendererDocumentPatch) => {
  if (!mainState.currentData) return { success: false, error: 'No file open' };
  try {
    if (mainState.currentProjectPath) {
      const result = saveCurrentProject(updatedFields);
      if (recoveryManager) recoveryManager.clearAutosavePaths();
      return result;
    }

    if (!mainState.currentFilePath) {
      const result = await saveCurrentFileAs(updatedFields);
      syncRecoveryAfterExplicitSave(recoveryManager, result).catch((e) =>
        console.warn('[main] recovery sync after save error:', e),
      );
      return result;
    }

    assertFileUnchanged(mainState.currentFilePath, mainState.currentFileBaseline);
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
    mainState.setCurrentFileBaseline(captureFileBaseline(mainState.currentFilePath));
    // After explicit save, clear stale autosave paths from recovery record
    if (recoveryManager) recoveryManager.clearAutosavePaths();
    return { success: true, path: mainState.currentFilePath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// Save As
ipcMain.handle('save-file-as', async (_event, updatedFields: RendererDocumentPatch) => {
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
    (mainState.currentProjectPath ? mainState.currentProjectPath : null) ||
    (currentImportSourcePath ? path.dirname(currentImportSourcePath) : null) ||
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

// Open links from rendered guide previews without allowing local files or
// executable/custom protocols to cross the renderer boundary.
ipcMain.handle('open-external-url', async (_event, rawUrl: string): Promise<boolean> => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const url = new URL(rawUrl.trim());
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return false;
    await shell.openExternal(url.toString());
    return true;
  } catch {
    return false;
  }
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
  const fileName = mainState.currentFilePath
    ? path.basename(mainState.currentFilePath)
    : currentImportSourcePath
      ? `${path.basename(currentImportSourcePath)} (${currentImportSourceFormat || 'import'})`
      : 'new file';
  const stats: string[] = [];
  if (mainState.currentData.lua) stats.push(`Lua: ${(mainState.currentData.lua.length / 1024).toFixed(0)}KB`);
  if (mainState.currentData.lorebook?.length) stats.push(`로어북: ${mainState.currentData.lorebook.length}개`);
  if (mainState.currentData.regex?.length) stats.push(`정규식: ${mainState.currentData.regex.length}개`);
  if (mainState.currentData.globalNote)
    stats.push(`글로벌노트: ${(mainState.currentData.globalNote.length / 1024).toFixed(0)}KB`);
  if (mainState.currentData.css) stats.push(`CSS: ${(mainState.currentData.css.length / 1024).toFixed(0)}KB`);

  return {
    artifactType: getArtifactTypeFromPath(mainState.currentFilePath || currentImportSourcePath),
    fileName,
    name: mainState.currentData.name || '',
    stats: stats.join(', '),
    cwd: mainState.currentFilePath
      ? path.dirname(mainState.currentFilePath)
      : currentImportSourcePath
        ? path.dirname(currentImportSourcePath)
        : process.cwd(),
  };
});

initMainUtilityIpc({
  appRoot: APP_ROOT,
  getMainWindow: () => mainWindow,
  getMcpInfo: () => (apiPort && apiToken ? { port: apiPort, token: apiToken } : null),
  getUserDataPath: () => app.getPath('userData'),
});
