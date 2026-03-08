'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  openCharx,
  saveCharx,
  openRisum,
  saveRisum,
  extractPrimaryLuaFromTriggerScripts,
  mergePrimaryLuaIntoTriggerScripts,
  normalizeTriggerScripts,
  stringifyTriggerScripts
} = require('./src/charx-io');
const {
  normalizeReferencePath,
  upsertReferenceRecord,
  removeReferenceRecord,
  serializeReferenceManifest,
  parseReferenceManifest,
  validateReferenceManifestPaths
} = require('./src/lib/reference-store.cjs');
const { buildRefsPopoutData } = require('./src/lib/refs-popout-data.cjs');
const { createPopoutPayloadStore } = require('./src/lib/popout-payload-store.cjs');
const { createMainStateStore } = require('./src/lib/main-state-store.cjs');
const { startApiServer: startApiServerImpl } = require('./src/lib/mcp-api-server');
const { initTerminalManager, killTerminal } = require('./src/lib/terminal-manager');
const { initMcpConfig, writeCurrentMcpConfig, cleanupJsonMcpConfig, cleanupCodexMcpConfig } = require('./src/lib/mcp-config');
const { initAgentsMdManager, cleanupAgentsMd } = require('./src/lib/agents-md-manager');
const { initAssetManager, invalidateAssetsMapCache } = require('./src/lib/asset-manager');
const { initSyncServer, stopSyncServer } = require('./src/lib/sync-server');
const { initGuidesManager, getGuidesDir, getGuidesListResult } = require('./src/lib/guides-manager');

let mainWindow;
let popoutWindows = {}; // { terminal: BrowserWindow, sidebar: BrowserWindow }
const mainState = createMainStateStore();
const popoutPayloadStore = createPopoutPayloadStore();

// MCP confirmation via renderer (MomoTalk style popup)
let mcpConfirmId = 0;
const mcpConfirmCallbacks = {};

function askRendererConfirm(title, message) {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) { resolve(false); return; }
    const id = ++mcpConfirmId;
    mcpConfirmCallbacks[id] = resolve;
    mainWindow.webContents.send('mcp-confirm-request', id, title, message);
    // Timeout fallback (30s)
    setTimeout(() => { if (mcpConfirmCallbacks[id]) { delete mcpConfirmCallbacks[id]; resolve(false); } }, 30000);
  });
}

ipcMain.on('mcp-confirm-response', (_, id, allowed) => {
  if (mcpConfirmCallbacks[id]) {
    mcpConfirmCallbacks[id](allowed);
    delete mcpConfirmCallbacks[id];
  }
});

// Close confirm via renderer (MomoTalk style, 3 buttons)
function askRendererCloseConfirm() {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) { resolve(1); return; }
    const id = ++mcpConfirmId;
    mcpConfirmCallbacks[id] = resolve;
    mainWindow.webContents.send('close-confirm-request', id);
  });
}

ipcMain.on('close-confirm-response', (_, id, choice) => {
  if (mcpConfirmCallbacks[id]) {
    mcpConfirmCallbacks[id](choice);
    delete mcpConfirmCallbacks[id];
  }
});

// MCP API server
let mcpApi = null; // { server, token, invalidateSectionCaches }
let apiPort = null;
let apiToken = null;

// Sync hash (incremented on data changes, read by sync server)
let syncHash = 0;

function getReferenceStatePath() {
  return path.join(app.getPath('userData'), 'reference-files.json');
}

function persistReferenceFiles() {
  try {
    const statePath = getReferenceStatePath();
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(
      statePath,
      JSON.stringify(serializeReferenceManifest(mainState.referenceFiles), null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('[main] failed to persist references:', error);
  }
}

function restoreReferenceRecord(filePath) {
  const normalizedPath = normalizeReferencePath(filePath);
  const refData = normalizedPath.endsWith('.risum') ? openRisum(normalizedPath) : openCharx(normalizedPath);
  return {
    fileName: path.basename(normalizedPath),
    filePath: normalizedPath,
    data: serializeForRenderer(refData)
  };
}

function addReferenceRecord(ref) {
  mainState.setReferenceFiles(upsertReferenceRecord(mainState.referenceFiles, {
    ...ref,
    filePath: normalizeReferencePath(ref.filePath)
  }));
  persistReferenceFiles();
}

function broadcastRefsDataChanged() {
  broadcastToAll('refs-data-changed');
}

function describeReferenceManifestIssue(issue) {
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

function loadPersistedReferenceFiles() {
  const statePath = getReferenceStatePath();
  mainState.setReferenceManifestStatus(null);
  if (!fs.existsSync(statePath)) return;

  try {
    const persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const restored = [];
    const issues = [];
    const { validPaths, issues: manifestIssues } = validateReferenceManifestPaths(
      parseReferenceManifest(persisted),
      { existsSync: (filePath) => fs.existsSync(filePath) }
    );
    issues.push(...manifestIssues);

    for (const refPath of validPaths) {
      try {
        restored.push(restoreReferenceRecord(refPath));
      } catch (error) {
        console.error('[main] failed to restore reference file:', refPath, error);
        issues.push({
          filePath: refPath,
          reason: 'restore-failed',
          detail: error instanceof Error ? error.message : String(error)
        });
      }
    }

    mainState.setReferenceFiles(restored);
    persistReferenceFiles();
    if (issues.length > 0) {
      mainState.setReferenceManifestStatus({
        level: 'warn',
        message: `참고 파일 ${issues.length}개를 복원하지 못해 목록에서 정리했습니다.`,
        detail: issues.slice(0, 3).map(describeReferenceManifestIssue).join(' | ')
      });
    }
  } catch (error) {
    console.error('[main] failed to load persisted references:', error);
    mainState.setReferenceFiles([]);
    mainState.setReferenceManifestStatus({
      level: 'error',
      message: '저장된 참고 파일 목록을 읽지 못했습니다.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

// Broadcast to main window + all popout windows
function broadcastToAll(channel, ...args) {
  if (channel === 'data-updated') syncHash++;
  const allWindows = [mainWindow, ...Object.values(popoutWindows)];
  for (const win of allWindows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }
  if (channel === 'data-updated') {
    for (const win of Object.values(popoutWindows)) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('sidebar-data-changed');
      }
    }
  }
}

function broadcastSidebarDataChanged() {
  broadcastToAll('sidebar-data-changed');
}

function broadcastMcpStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mcp-status', payload);
  }
}

function getRendererEntryUrl(entryFile, query = {}) {
  if (!process.env.VITE_DEV_SERVER_URL) return null;

  const url = new URL(entryFile, process.env.VITE_DEV_SERVER_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function loadRendererPage(windowRef, entryFile, query = {}) {
  const devUrl = getRendererEntryUrl(entryFile, query);
  if (devUrl) {
    return windowRef.loadURL(devUrl);
  }

  return windowRef.loadFile(path.join(__dirname, 'dist', entryFile), { query });
}

function createWindow() {
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
      nodeIntegration: false
    }
  });

  loadRendererPage(mainWindow, 'index.html').catch((error) => {
    console.error('Failed to load main renderer', error);
  });
  mainWindow.setMenuBarVisibility(false);

  // F12 → DevTools 토글
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // 창 닫기 전 저장 확인 (MomoTalk 스타일)
  let isClosingForReal = false;
  mainWindow.on('close', (e) => {
    if (mainState.currentData && !isClosingForReal) {
      e.preventDefault();
      askRendererCloseConfirm().then((choice) => {
        if (choice === 0) {
          // 저장하고 닫기
          if (mainState.currentFilePath) {
            try { saveCharx(mainState.currentFilePath, mainState.currentData); } catch (err) { console.error('[main] Failed to save before close:', err); }
          }
          isClosingForReal = true;
          mainWindow.close();
        } else if (choice === 1) {
          // 저장 안 하고 닫기
          isClosingForReal = true;
          mainWindow.close();
        }
        // choice === 2: 취소 — 아무것도 안 함
      });
    }
  });
}

app.whenReady().then(() => {
  loadPersistedReferenceFiles();
  createWindow();
  mcpApi = startApiServerImpl({
    getCurrentData: () => mainState.currentData,
    getReferenceFiles: () => mainState.referenceFiles,
    askRendererConfirm,
    broadcastToAll,
    broadcastMcpStatus,
    onListening(port) {
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
    normalizeTriggerScripts,
    extractPrimaryLua: extractPrimaryLuaFromTriggerScripts,
    mergePrimaryLua: mergePrimaryLuaIntoTriggerScripts,
    stringifyTriggerScripts,
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
    getDirname: () => __dirname,
    getGuidesDir,
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

  // Initialize RisuAI sync server
  initSyncServer({
    getCurrentData: () => mainState.currentData,
    broadcastToAll,
    getSyncHash: () => syncHash,
  });
});
app.on('window-all-closed', () => {
  killTerminal();
  stopSyncServer();
  if (mcpApi) { mcpApi.server.close(); mcpApi = null; }
  cleanupJsonMcpConfig(path.join(os.homedir(), '.mcp.json'));
  cleanupJsonMcpConfig(path.join(os.homedir(), '.copilot', 'mcp-config.json'));
  // Cleanup Codex MCP config
  cleanupCodexMcpConfig();
  cleanupAgentsMd();
  // Cleanup autosave file
  if (mainState.currentFilePath) {
    try {
      const dir = path.dirname(mainState.currentFilePath);
      const base = path.basename(mainState.currentFilePath);
      const autosavePath = path.join(dir, `.${base}.autosave.charx`);
      if (fs.existsSync(autosavePath)) fs.unlinkSync(autosavePath);
    } catch (e) { console.warn('[main] Failed to cleanup autosave:', e.message); }
  }
  app.quit();
});

// --- IPC Handlers ---

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
    triggerScripts: [{
      comment: '',
      type: 'start',
      conditions: [],
      effect: [{
        type: 'triggerlua',
        code: '-- ===== main =====\n-- 메인 트리거 스크립트\n\n-- ===== utils =====\n-- 유틸리티 함수\n'
      }],
      lowLevelAccess: false
    }],
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
        extentions: {}
      }
    ],
    regex: [
      {
        comment: '샘플 정규식',
        type: 'editoutput',
        find: '\\*\\*(.+?)\\*\\*',
        replace: '<b>$1</b>',
        flag: 'g'
      }
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
    _moduleData: null
  });
  mainWindow.setTitle('RisuToki - New');
  broadcastSidebarDataChanged();
  return serializeForRenderer(mainState.currentData);
});

// Open file dialog + parse charx
ipcMain.handle('open-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [
        { name: 'RisuAI Files', extensions: ['charx', 'risum'] },
        { name: 'Character Card', extensions: ['charx'] },
        { name: 'RisuAI Module', extensions: ['risum'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const nextFilePath = result.filePaths[0];
    console.log('[main] Opening:', nextFilePath);
    const nextData = nextFilePath.endsWith('.risum')
      ? openRisum(nextFilePath)
      : openCharx(nextFilePath);
    mainState.setCurrentDocument(nextFilePath, nextData);
    console.log('[main] Parsed OK, name:', mainState.currentData.name, 'type:', mainState.currentData._fileType || 'charx');
    invalidateAssetsMapCache();
    if (mcpApi) mcpApi.invalidateSectionCaches();
    mainWindow.setTitle(`RisuToki - ${path.basename(mainState.currentFilePath)}`);
    // Refresh Claude MCP config so Claude Code can find it
    if (apiPort) writeCurrentMcpConfig();
    broadcastSidebarDataChanged();
    return serializeForRenderer(mainState.currentData);
  } catch (err) {
    console.error('[main] open-file error:', err);
    return null;
  }
});

// Save to current path
async function saveCurrentFileAs(updatedFields) {
  try {
    applyUpdates(mainState.currentData, updatedFields);

    const isRisum = mainState.currentData._fileType === 'risum';
    const filters = isRisum
      ? [{ name: 'RisuAI Module', extensions: ['risum'] }]
      : [{ name: 'Character Card', extensions: ['charx'] }];
    const defaultExt = isRisum ? '.risum' : '.charx';

    const result = await dialog.showSaveDialog(mainWindow, {
      filters,
      defaultPath: mainState.currentFilePath || `untitled${defaultExt}`
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

    mainState.setCurrentDocument(result.filePath, mainState.currentData);
    if (isRisum) {
      saveRisum(mainState.currentFilePath, mainState.currentData);
    } else {
      saveCharx(mainState.currentFilePath, mainState.currentData);
    }
    mainWindow.setTitle(`RisuToki - ${path.basename(mainState.currentFilePath)}`);
    return { success: true, path: mainState.currentFilePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

ipcMain.handle('save-file', async (_, updatedFields) => {
  if (!mainState.currentData) return { success: false, error: 'No file open' };
  try {
    applyUpdates(mainState.currentData, updatedFields);
    invalidateAssetsMapCache();
    if (mcpApi) mcpApi.invalidateSectionCaches();

    if (!mainState.currentFilePath) {
      return saveCurrentFileAs(updatedFields);
    }
    if (mainState.currentData._fileType === 'risum') {
      saveRisum(mainState.currentFilePath, mainState.currentData);
    } else {
      saveCharx(mainState.currentFilePath, mainState.currentData);
    }
    return { success: true, path: mainState.currentFilePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save As
ipcMain.handle('save-file-as', async (_, updatedFields) => {
  if (!mainState.currentData) return { success: false, error: 'No file open' };
  return saveCurrentFileAs(updatedFields);
});

// Get current file path (for terminal context)
ipcMain.handle('get-file-path', () => mainState.currentFilePath);

ipcMain.handle('list-references', () => mainState.referenceFiles);
ipcMain.handle('get-reference-manifest-status', () => mainState.referenceManifestStatus);

// Open reference file (read-only, doesn't replace main file) — supports multi-select
ipcMain.handle('open-reference', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [
        { name: 'RisuAI Files', extensions: ['charx', 'risum'] },
        { name: 'Character Card', extensions: ['charx'] },
        { name: 'RisuAI Module', extensions: ['risum'] }
      ],
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || !result.filePaths.length) return null;
    const refs = [];
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
ipcMain.handle('open-reference-path', async (_, filePath) => {
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
ipcMain.handle('remove-reference', (_, fileIdentifier) => {
  const next = removeReferenceRecord(mainState.referenceFiles, fileIdentifier);
  if (next.length === mainState.referenceFiles.length) {
    return true;
  }
  mainState.setReferenceFiles(next);
  persistReferenceFiles();
  broadcastRefsDataChanged();
  return true;
});

// Remove all reference files
ipcMain.handle('remove-all-references', () => {
  if (mainState.referenceFiles.length === 0) {
    return true;
  }
  mainState.setReferenceFiles([]);
  persistReferenceFiles();
  broadcastRefsDataChanged();
  return true;
});

// Get working directory for terminal
ipcMain.handle('get-cwd', () => {
  return mainState.currentFilePath ? path.dirname(mainState.currentFilePath) : process.cwd();
});

// --- DevTools ---
ipcMain.handle('toggle-devtools', () => {
  mainWindow.webContents.toggleDevTools();
});

// --- Open folder in file explorer ---
ipcMain.handle('open-folder', (_, folderPath) => {
  const { shell } = require('electron');
  shell.openPath(folderPath);
});

// --- Get autosave info ---
ipcMain.handle('get-autosave-info', (_, customDir) => {
  const dir = customDir || (mainState.currentFilePath ? path.dirname(mainState.currentFilePath) : null);
  if (!dir) return null;
  const base = mainState.currentFilePath ? path.basename(mainState.currentFilePath, path.extname(mainState.currentFilePath)) : '';
  return { dir, prefix: base ? `${base}_autosave_` : '', hasFile: !!mainState.currentFilePath };
});

// --- Assistant prompt info ---
ipcMain.handle('get-claude-prompt', () => {
  if (!mainState.currentData) return null;
  const fileName = mainState.currentFilePath ? path.basename(mainState.currentFilePath) : 'new file';
  const stats = [];
  if (mainState.currentData.lua) stats.push(`Lua: ${(mainState.currentData.lua.length/1024).toFixed(0)}KB`);
  if (mainState.currentData.lorebook?.length) stats.push(`로어북: ${mainState.currentData.lorebook.length}개`);
  if (mainState.currentData.regex?.length) stats.push(`정규식: ${mainState.currentData.regex.length}개`);
  if (mainState.currentData.globalNote) stats.push(`글로벌노트: ${(mainState.currentData.globalNote.length/1024).toFixed(0)}KB`);
  if (mainState.currentData.css) stats.push(`CSS: ${(mainState.currentData.css.length/1024).toFixed(0)}KB`);

  return {
    fileName,
    name: mainState.currentData.name || '',
    stats: stats.join(', '),
    cwd: mainState.currentFilePath ? path.dirname(mainState.currentFilePath) : process.cwd()
  };
});

// --- MCP ---

ipcMain.handle('get-mcp-info', () => {
  if (!apiPort || !apiToken) return null;
  return {
    port: apiPort,
    token: apiToken,
    mcpServerPath: path.join(__dirname, 'toki-mcp-server.js')
  };
});

// Import JSON file (for lorebook/regex)
ipcMain.handle('import-json', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || !result.filePaths.length) return null;

  const imported = [];
  for (const filePath of result.filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(content);
      imported.push({ fileName: path.basename(filePath), data: json });
    } catch (e) { console.warn('[main] Skipping invalid reference file:', filePath, e.message); }
  }
  return imported;
});

// --- Autosave ---
ipcMain.handle('autosave-file', async (_, updatedFields) => {
  if (!mainState.currentData) return { success: false, error: 'No data' };
  const customDir = updatedFields._autosaveDir;
  if (!mainState.currentFilePath && !customDir) return { success: false, error: 'No file path and no autosave dir' };
  try {
    applyUpdates(mainState.currentData, updatedFields);
    const dir = customDir || path.dirname(mainState.currentFilePath);
    const base = mainState.currentFilePath ? path.basename(mainState.currentFilePath, path.extname(mainState.currentFilePath)) : (mainState.currentData.name || 'untitled');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15); // 20260224_123456
    const autosaveName = `${base}_autosave_${ts}.charx`;
    const autosavePath = path.join(dir, autosaveName);
    fs.mkdirSync(dir, { recursive: true });
    saveCharx(autosavePath, mainState.currentData);
    return { success: true, path: autosavePath };
  } catch (err) {
    console.error('[main] autosave error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('cleanup-autosave', (_, customDir) => {
  // Cleanup old autosave files (keep latest 5)
  if (!mainState.currentFilePath) return false;
  const dir = customDir || path.dirname(mainState.currentFilePath);
  const base = path.basename(mainState.currentFilePath, path.extname(mainState.currentFilePath));
  const prefix = `${base}_autosave_`;
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith(prefix) && f.endsWith('.charx'))
      .sort().reverse();
    // Delete all autosave files (called on manual save)
    for (const f of files) {
      fs.unlinkSync(path.join(dir, f));
      console.log('[main] Autosave cleaned:', f);
    }
    return true;
  } catch (e) {
    console.error('[main] cleanup-autosave error:', e);
    return false;
  }
});

ipcMain.handle('pick-autosave-dir', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '자동저장 폴더 선택',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// --- Persona files ---
ipcMain.handle('read-persona', (_, name) => {
  const filePath = path.join(__dirname, 'assets', 'persona', `${name}.txt`);
  try { return fs.readFileSync(filePath, 'utf-8'); } catch (e) { console.warn('[main] Failed to read persona:', name, e.message); return null; }
});

ipcMain.handle('write-persona', (_, name, content) => {
  const dir = path.join(__dirname, 'assets', 'persona');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* exists */ }
  const filePath = path.join(dir, `${name}.txt`);
  try { fs.writeFileSync(filePath, content, 'utf-8'); return true; } catch (e) { console.warn('[main] Failed to write persona:', name, e.message); return false; }
});

ipcMain.handle('list-personas', () => {
  const dir = path.join(__dirname, 'assets', 'persona');
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.txt')).map(f => f.replace('.txt', '')); } catch (e) { console.warn('[main] Failed to list personas:', e.message); return []; }
});

// --- System Prompt (temp file for Claude CLI) ---
ipcMain.handle('write-system-prompt', (_, content) => {
  const tmpFile = path.join(os.tmpdir(), 'toki-system-prompt.txt');
  fs.writeFileSync(tmpFile, content, 'utf-8');
  return { filePath: tmpFile, platform: process.platform };
});

// --- Popout Windows ---

ipcMain.handle('popout-create', async (_, panelType, requestId) => {
  // Close existing popout of same type
  if (popoutWindows[panelType] && !popoutWindows[panelType].isDestroyed()) {
    popoutWindows[panelType].close();
    delete popoutWindows[panelType];
  }

  const isTerminal = panelType === 'terminal';
  const isEditor = panelType === 'editor';
  const isPreview = panelType === 'preview';
  const isRefs = panelType === 'refs';
  if ((isEditor || isPreview) && !requestId) {
    console.warn(`[main] missing popout payload requestId for ${panelType}`);
    return false;
  }
  const popout = new BrowserWindow({
    width: isPreview ? 420 : (isEditor ? 900 : (isTerminal ? 700 : 320)),
    height: isPreview ? 700 : (isEditor ? 700 : (isTerminal ? 500 : 650)),
    minWidth: isPreview ? 320 : (isEditor ? 400 : (isTerminal ? 300 : 200)),
    minHeight: isPreview ? 400 : 200,
    parent: mainWindow,
    frame: false,
    title: isEditor ? 'RisuToki' : (isTerminal ? 'TokiTalk' : (isRefs ? '참고자료' : '항목')),
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'popout-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadRendererPage(popout, 'popout.html', { type: panelType, requestId }).catch((error) => {
    console.error(`Failed to load ${panelType} popout`, error);
  });

  popoutWindows[panelType] = popout;

  popout.on('closed', () => {
    delete popoutWindows[panelType];
    if (panelType === 'editor' || panelType === 'preview') {
      popoutPayloadStore.clear(panelType, requestId);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('popout-closed', panelType);
    }
  });

  return true;
});

// Editor popout data relay
ipcMain.handle('set-editor-popout-data', (_, data) => {
  return popoutPayloadStore.prepare('editor', data);
});

ipcMain.handle('get-editor-popout-data', (_, requestId) => {
  return popoutPayloadStore.waitFor('editor', requestId);
});

// Editor popout → main window: content changed
ipcMain.on('editor-popout-change', (_, tabId, content) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('editor-popout-change', tabId, content);
  }
});

// Editor popout → main window: request save
ipcMain.on('editor-popout-save', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('editor-popout-save');
  }
});

ipcMain.handle('popout-dock', (event) => {
  // Find which popout window sent this
  for (const [type, win] of Object.entries(popoutWindows)) {
    if (win && !win.isDestroyed() && win.webContents === event.sender) {
      win.close();
      // popout 'closed' event handler notifies mainWindow
      return type;
    }
  }
  return null;
});

ipcMain.handle('popout-close', (_, panelType) => {
  if (popoutWindows[panelType] && !popoutWindows[panelType].isDestroyed()) {
    popoutWindows[panelType].close();
  }
  return true;
});

// Preview popout data relay
ipcMain.handle('set-preview-popout-data', (_, data) => {
  return popoutPayloadStore.prepare('preview', data);
});

ipcMain.handle('get-preview-popout-data', (_, requestId) => {
  return popoutPayloadStore.waitFor('preview', requestId);
});

// Guides absolute path
ipcMain.handle('get-guides-path', () => {
  return getGuidesDir();
});

// Sidebar popout: provide tree data
ipcMain.handle('popout-sidebar-data', () => {
  if (!mainState.currentData) return { items: [] };

  const items = [];

  // Lua
  items.push({ label: 'Lua (통합)', icon: '{}', id: 'lua', indent: 0 });

  // Singles
  const singles = [
    { id: 'globalNote', label: '글로벌노트', icon: '📝' },
    { id: 'firstMessage', label: '첫 메시지', icon: '💬' },
    { id: 'assetPromptTemplate', label: '에셋 프롬프트 템플릿', icon: '🖼️' },
    { id: 'triggerScripts', label: '트리거 스크립트', icon: '🪝' },
    { id: 'alternateGreetings', label: '추가 첫 메시지', icon: '💭' },
    { id: 'groupOnlyGreetings', label: '그룹 첫 메시지', icon: '👥' },
    { id: 'css', label: 'CSS', icon: '🎨' },
    { id: 'defaultVariables', label: '기본변수', icon: '⚙' },
    { id: 'description', label: '설명', icon: '📄' },
  ];
  for (const s of singles) {
    items.push({ label: s.label, icon: s.icon, id: s.id, indent: 0 });
  }

  // Lorebook
  if (mainState.currentData.lorebook && mainState.currentData.lorebook.length > 0) {
    items.push({ label: '로어북', icon: '📚', isHeader: true, indent: 0 });
    for (let i = 0; i < mainState.currentData.lorebook.length; i++) {
      const entry = mainState.currentData.lorebook[i];
      if (entry.mode === 'folder') continue;
      items.push({
        label: entry.comment || `entry_${i}`,
        icon: '·',
        id: `lore_${i}`,
        indent: 1
      });
    }
  }

  // Regex
  if (mainState.currentData.regex && mainState.currentData.regex.length > 0) {
    items.push({ label: '정규식', icon: '⚡', isHeader: true, indent: 0 });
    for (let i = 0; i < mainState.currentData.regex.length; i++) {
      items.push({
        label: mainState.currentData.regex[i].comment || `regex_${i}`,
        icon: '·',
        id: `regex_${i}`,
        indent: 1
      });
    }
  }

  return { items };
});

// Sidebar popout click → forward to main window
ipcMain.on('popout-sidebar-click', (_, itemId) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('popout-sidebar-click', itemId);
  }
});

// Refs popout: provide guide list + reference files tree
ipcMain.handle('popout-refs-data', () => {
  return buildRefsPopoutData(getGuidesListResult(), mainState.referenceFiles);
});

// Refs popout click → forward to main window
ipcMain.on('popout-refs-click', (_, tabId) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('popout-refs-click', tabId);
  }
});

// --- Lua Section Parsing (passed to MCP API server as deps) ---

function detectLuaSection(line) {
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

function parseLuaSections(luaCode) {
  if (!luaCode || !luaCode.trim()) return [{ name: 'main', content: '' }];
  const lines = luaCode.split('\n');
  const sections = [];
  let currentName = null;
  let currentLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionName = detectLuaSection(line);
    if (sectionName !== null) {
      if (currentName !== null) {
        sections.push({ name: currentName, content: currentLines.join('\n').trim() });
      }
      if (sectionName === '') {
        const nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
        const commentMatch = nextLine.match(/^--\s*(.+)$/);
        if (commentMatch && detectLuaSection(nextLine) === null) {
          currentName = commentMatch[1].trim();
          i++;
          const closingLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
          if (detectLuaSection(closingLine) !== null) i++;
        } else {
          currentName = `section_${sections.length}`;
        }
      } else {
        const nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
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
  const merged = [];
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

function combineLuaSections(sections) {
  return sections.map(s => `-- ===== ${s.name} =====\n${s.content}`).join('\n\n');
}

// --- CSS Section Parsing ---

function detectCssSectionInline(line) {
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

function detectCssBlockOpen(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('/*')) return false;
  if (trimmed.endsWith('*/')) return false;
  const after = trimmed.slice(2).trim();
  return /^={6,}$/.test(after);
}

function detectCssBlockClose(line) {
  const trimmed = line.trim();
  if (!trimmed.endsWith('*/')) return false;
  const before = trimmed.slice(0, -2).trim();
  return /^={6,}$/.test(before);
}

function parseCssSections(cssCode) {
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
  const sections = [];
  let currentName = null;
  let currentLines = [];

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
      const nameLines = [];
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (detectCssBlockClose(lines[j])) { closed = true; break; }
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
  const merged = [];
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

function combineCssSections(sections, prefix, suffix) {
  const eq = '============================================================';
  const body = sections.map(s =>
    `/* ${eq}\n   ${s.name}\n   ${eq} */\n${s.content}`
  ).join('\n\n');
  const effectivePrefix = prefix || '<style>\n';
  const effectiveSuffix = suffix || '\n</style>';
  return effectivePrefix + body + effectiveSuffix;
}

// --- Helpers ---

function serializeForRenderer(data) {
  // Don't send binary assets/internal fields to renderer
  return {
    _fileType: data._fileType || 'charx',
    name: data.name,
    description: data.description,
    firstMessage: data.firstMessage,
    triggerScripts: stringifyTriggerScripts(data.triggerScripts),
    alternateGreetings: data.alternateGreetings || [],
    groupOnlyGreetings: data.groupOnlyGreetings || [],
    globalNote: data.globalNote,
    css: data.css,
    defaultVariables: data.defaultVariables,
    lua: data.lua,
    lorebook: data.lorebook,
    regex: data.regex,
    moduleName: data.moduleName
  };
}

function applyUpdates(data, fields) {
  if (!fields) return;
  const allowed = ['name', 'description', 'firstMessage', 'alternateGreetings', 'groupOnlyGreetings', 'globalNote',
    'css', 'defaultVariables', 'triggerScripts', 'lua', 'lorebook', 'regex'];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      if (key === 'triggerScripts') {
        data.triggerScripts = normalizeTriggerScripts(fields.triggerScripts);
        data.lua = extractPrimaryLuaFromTriggerScripts(data.triggerScripts);
        continue;
      }
      data[key] = fields[key];
      if (key === 'lua') {
        data.triggerScripts = mergePrimaryLuaIntoTriggerScripts(data.triggerScripts, data.lua);
      }
    }
  }
  // CSS 필드에 <style> 태그가 없으면 강제로 감싸기
  if (fields.css !== undefined && data.css && data.css.trim()) {
    if (!/<style[\s>]/i.test(data.css)) {
      data.css = '<style>\n' + data.css + '\n</style>';
    }
  }
}



