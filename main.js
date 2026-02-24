'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { openCharx, saveCharx } = require('./src/charx-io');

let mainWindow;
let currentFilePath = null;
let currentData = null;
let ptyProcess = null;
let popoutWindows = {}; // { terminal: BrowserWindow, sidebar: BrowserWindow }

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
let apiServer = null;
let apiPort = null;
let apiToken = null;

// Reference files (read-only, shared with MCP)
let referenceFiles = []; // [{ fileName, data }]

// Editor popout data relay
let editorPopoutData = null; // { tabId, label, language, content, readOnly }

// Broadcast to main window + all popout windows
function broadcastToAll(channel, ...args) {
  const allWindows = [mainWindow, ...Object.values(popoutWindows)];
  for (const win of allWindows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }
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

  mainWindow.loadFile('src/renderer/index.html');
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
    if (currentData && !isClosingForReal) {
      e.preventDefault();
      askRendererCloseConfirm().then((choice) => {
        if (choice === 0) {
          // 저장하고 닫기
          if (currentFilePath) {
            try { saveCharx(currentFilePath, currentData); } catch (err) {}
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
  createWindow();
  startApiServer();
});
app.on('window-all-closed', () => {
  if (ptyProcess) { ptyProcess.kill(); ptyProcess = null; }
  if (apiServer) { apiServer.close(); apiServer = null; }
  // Cleanup .mcp.json from CWD
  try {
    const fs = require('fs');
    const cwd = currentFilePath ? path.dirname(currentFilePath) : process.cwd();
    const mcpPath = path.join(cwd, '.mcp.json');
    if (fs.existsSync(mcpPath)) fs.unlinkSync(mcpPath);
  } catch (e) { /* ignore */ }
  // Cleanup autosave file
  if (currentFilePath) {
    try {
      const fs = require('fs');
      const dir = path.dirname(currentFilePath);
      const base = path.basename(currentFilePath);
      const autosavePath = path.join(dir, `.${base}.autosave.charx`);
      if (fs.existsSync(autosavePath)) fs.unlinkSync(autosavePath);
    } catch (e) { /* ignore */ }
  }
  app.quit();
});

// --- IPC Handlers ---

// New file
ipcMain.handle('new-file', async () => {
  currentFilePath = null;
  currentData = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'New Character',
    description: '',
    personality: '',
    scenario: '',
    creatorcomment: '',
    tags: [],
    firstMessage: '{{char}}가 당신을 바라봅니다.\n\n"안녕하세요, 처음 뵙겠습니다."',
    globalNote: '[시스템 노트]\n이 캐릭터의 대화 스타일과 성격을 여기에 작성하세요.',
    css: '',
    defaultVariables: '',
    lua: '-- ===== main =====\n-- 메인 트리거 스크립트\n\n-- ===== utils =====\n-- 유틸리티 함수\n',
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
  };
  mainWindow.setTitle('RisuToki - New');
  return serializeForRenderer(currentData);
});

// Open file dialog + parse charx
ipcMain.handle('open-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Character Card', extensions: ['charx'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return null;

    currentFilePath = result.filePaths[0];
    console.log('[main] Opening:', currentFilePath);
    currentData = openCharx(currentFilePath);
    console.log('[main] Parsed OK, name:', currentData.name);
    mainWindow.setTitle(`RisuToki - ${path.basename(currentFilePath)}`);
    return serializeForRenderer(currentData);
  } catch (err) {
    console.error('[main] open-file error:', err);
    return null;
  }
});

// Save to current path
ipcMain.handle('save-file', async (_, updatedFields) => {
  if (!currentData) return { success: false, error: 'No file open' };
  applyUpdates(currentData, updatedFields);

  if (!currentFilePath) {
    return await saveAs(updatedFields);
  }
  saveCharx(currentFilePath, currentData);
  return { success: true, path: currentFilePath };
});

// Save As
ipcMain.handle('save-file-as', async (_, updatedFields) => {
  if (!currentData) return { success: false, error: 'No file open' };
  applyUpdates(currentData, updatedFields);

  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Character Card', extensions: ['charx'] }],
    defaultPath: currentFilePath || 'untitled.charx'
  });
  if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

  currentFilePath = result.filePath;
  saveCharx(currentFilePath, currentData);
  mainWindow.setTitle(`RisuToki - ${path.basename(currentFilePath)}`);
  return { success: true, path: currentFilePath };
});

// Get current file path (for terminal context)
ipcMain.handle('get-file-path', () => currentFilePath);

// Open reference file (read-only, doesn't replace main file)
ipcMain.handle('open-reference', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Character Card', extensions: ['charx'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const refPath = result.filePaths[0];
    const refData = openCharx(refPath);
    const ref = {
      fileName: path.basename(refPath),
      filePath: refPath,
      data: serializeForRenderer(refData)
    };
    // Store for MCP access (prevent duplicate)
    if (!referenceFiles.some(r => r.fileName === ref.fileName)) {
      referenceFiles.push(ref);
    }
    return ref;
  } catch (err) {
    console.error('[main] open-reference error:', err);
    return null;
  }
});

// Open reference file by path (for drag-and-drop)
ipcMain.handle('open-reference-path', async (_, filePath) => {
  try {
    const refData = openCharx(filePath);
    const ref = {
      fileName: path.basename(filePath),
      filePath: filePath,
      data: serializeForRenderer(refData)
    };
    if (!referenceFiles.some(r => r.fileName === ref.fileName)) {
      referenceFiles.push(ref);
    }
    return ref;
  } catch (err) {
    console.error('[main] open-reference-path error:', err);
    return null;
  }
});

// Remove reference file
ipcMain.handle('remove-reference', (_, fileName) => {
  const idx = referenceFiles.findIndex(r => r.fileName === fileName);
  if (idx !== -1) referenceFiles.splice(idx, 1);
  return true;
});

// Remove all reference files
ipcMain.handle('remove-all-references', () => {
  referenceFiles = [];
  return true;
});

// Pick background image (gif/png/jpg)
ipcMain.handle('pick-bg-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Images', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const fs = require('fs');
  const filePath = result.filePaths[0];
  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  const mime = ext === 'gif' ? 'image/gif' : ext === 'png' ? 'image/png' :
               ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${data.toString('base64')}`;
});

// Pick BGM audio file
ipcMain.handle('pick-bgm', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

// Get working directory for terminal
ipcMain.handle('get-cwd', () => {
  return currentFilePath ? path.dirname(currentFilePath) : process.cwd();
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
  const dir = customDir || (currentFilePath ? path.dirname(currentFilePath) : null);
  if (!dir) return null;
  const base = currentFilePath ? path.basename(currentFilePath, path.extname(currentFilePath)) : '';
  return { dir, prefix: base ? `${base}_autosave_` : '', hasFile: !!currentFilePath };
});

// --- Terminal (node-pty) ---

ipcMain.handle('terminal-start', async (_, cols, rows) => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }

  const pty = require('node-pty');
  const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
  const cwd = currentFilePath ? path.dirname(currentFilePath) : process.cwd();

  // Clean env: remove CLAUDECODE so nested claude sessions work
  const cleanEnv = Object.assign({}, process.env);
  delete cleanEnv.CLAUDECODE;

  // Inject MCP API info for toki-mcp-server
  if (apiPort && apiToken) {
    cleanEnv.TOKI_PORT = String(apiPort);
    cleanEnv.TOKI_TOKEN = apiToken;
  }

  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: cols || 120,
    rows: rows || 24,
    cwd,
    env: cleanEnv
  });

  ptyProcess.onData((data) => broadcastToAll('terminal-data', data));

  ptyProcess.onExit(() => {
    broadcastToAll('terminal-exit');
    ptyProcess = null;
  });

  return true;
});

ipcMain.on('terminal-input', (_, data) => {
  if (ptyProcess) ptyProcess.write(data);
});

ipcMain.on('terminal-resize', (_, cols, rows) => {
  if (ptyProcess) ptyProcess.resize(cols, rows);
});

ipcMain.handle('terminal-stop', () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  return true;
});

// --- Claude prompt ---
ipcMain.handle('get-claude-prompt', () => {
  if (!currentData) return null;
  const fileName = currentFilePath ? path.basename(currentFilePath) : 'new file';
  const stats = [];
  if (currentData.lua) stats.push(`Lua: ${(currentData.lua.length/1024).toFixed(0)}KB`);
  if (currentData.lorebook?.length) stats.push(`로어북: ${currentData.lorebook.length}개`);
  if (currentData.regex?.length) stats.push(`정규식: ${currentData.regex.length}개`);
  if (currentData.globalNote) stats.push(`글로벌노트: ${(currentData.globalNote.length/1024).toFixed(0)}KB`);
  if (currentData.css) stats.push(`CSS: ${(currentData.css.length/1024).toFixed(0)}KB`);

  return {
    fileName,
    name: currentData.name || '',
    stats: stats.join(', '),
    cwd: currentFilePath ? path.dirname(currentFilePath) : process.cwd()
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

function writeCurrentMcpConfig() {
  if (!apiPort || !apiToken) return null;
  const fs = require('fs');

  const cwd = currentFilePath ? path.dirname(currentFilePath) : process.cwd();
  const configPath = path.join(cwd, '.mcp.json');

  let serverPath = path.join(__dirname, 'toki-mcp-server.js');
  if (app.isPackaged) {
    serverPath = serverPath.replace('app.asar', 'app.asar.unpacked');
  }

  const config = {
    mcpServers: {
      'risutoki': {
        type: 'stdio',
        command: 'node',
        args: [serverPath],
        env: {
          TOKI_PORT: String(apiPort),
          TOKI_TOKEN: apiToken
        }
      }
    }
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log('[main] MCP config written:', configPath);
  return configPath;
}

ipcMain.handle('write-mcp-config', () => {
  return writeCurrentMcpConfig();
});

// --- Image assets ---

ipcMain.handle('get-asset-list', () => {
  if (!currentData) return [];
  return (currentData.assets || []).map(a => ({
    path: a.path,
    size: a.data.length
  }));
});

ipcMain.handle('get-asset-data', (_, assetPath) => {
  if (!currentData) return null;
  const asset = currentData.assets.find(a => a.path === assetPath);
  if (!asset) return null;
  return asset.data.toString('base64');
});

// Add asset via file dialog (targetFolder: 'icon' or 'other')
ipcMain.handle('add-asset', async (_, targetFolder) => {
  if (!currentData) return null;
  const folder = targetFolder || 'other';
  const basePath = folder === 'icon' ? 'assets/icon' : 'assets/other/image';
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || !result.filePaths.length) return null;

  const fs = require('fs');
  const added = [];
  for (const filePath of result.filePaths) {
    const fileName = path.basename(filePath);
    const assetPath = `${basePath}/${fileName}`;
    // Avoid duplicates
    if (currentData.assets.find(a => a.path === assetPath)) continue;
    const data = fs.readFileSync(filePath);
    currentData.assets.push({ path: assetPath, data });
    // Add x_meta
    const ext = path.extname(fileName).replace('.', '').toUpperCase();
    const metaName = path.basename(fileName, path.extname(fileName));
    currentData.xMeta[metaName] = { type: ext === 'JPG' ? 'JPEG' : ext };
    added.push({ path: assetPath, size: data.length });
  }
  return added;
});

// Add asset from drag-dropped buffer (targetFolder: 'icon' or 'other')
ipcMain.handle('add-asset-buffer', (_, fileName, base64Data, targetFolder) => {
  if (!currentData) return null;
  const folder = targetFolder || 'other';
  const basePath = folder === 'icon' ? 'assets/icon' : 'assets/other/image';
  const assetPath = `${basePath}/${fileName}`;
  if (currentData.assets.find(a => a.path === assetPath)) return null;
  const data = Buffer.from(base64Data, 'base64');
  currentData.assets.push({ path: assetPath, data });
  const ext = path.extname(fileName).replace('.', '').toUpperCase();
  const metaName = path.basename(fileName, path.extname(fileName));
  currentData.xMeta[metaName] = { type: ext === 'JPG' ? 'JPEG' : ext };
  return { path: assetPath, size: data.length };
});

// Delete asset
ipcMain.handle('delete-asset', (_, assetPath) => {
  if (!currentData) return false;
  const idx = currentData.assets.findIndex(a => a.path === assetPath);
  if (idx === -1) return false;
  currentData.assets.splice(idx, 1);
  return true;
});

// Rename asset
ipcMain.handle('rename-asset', (_, oldPath, newName) => {
  if (!currentData) return null;
  const asset = currentData.assets.find(a => a.path === oldPath);
  if (!asset) return null;
  const dir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
  const newPath = dir + newName;
  asset.path = newPath;
  return newPath;
});

// Import JSON file (for lorebook/regex)
ipcMain.handle('import-json', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || !result.filePaths.length) return null;

  const fs = require('fs');
  const imported = [];
  for (const filePath of result.filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(content);
      imported.push({ fileName: path.basename(filePath), data: json });
    } catch (e) { /* skip invalid */ }
  }
  return imported;
});

// --- Autosave ---
ipcMain.handle('autosave-file', async (_, updatedFields) => {
  if (!currentData) return { success: false, error: 'No data' };
  const customDir = updatedFields._autosaveDir;
  if (!currentFilePath && !customDir) return { success: false, error: 'No file path and no autosave dir' };
  applyUpdates(currentData, updatedFields);
  const dir = customDir || path.dirname(currentFilePath);
  const base = currentFilePath ? path.basename(currentFilePath, path.extname(currentFilePath)) : (currentData.name || 'untitled');
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15); // 20260224_123456
  const autosaveName = `${base}_autosave_${ts}.charx`;
  const autosavePath = path.join(dir, autosaveName);
  try {
    const fs = require('fs');
    fs.mkdirSync(dir, { recursive: true });
    saveCharx(autosavePath, currentData);
    return { success: true, path: autosavePath };
  } catch (err) {
    console.error('[main] autosave error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('cleanup-autosave', (_, customDir) => {
  // Cleanup old autosave files (keep latest 5)
  if (!currentFilePath) return false;
  const fs = require('fs');
  const dir = customDir || path.dirname(currentFilePath);
  const base = path.basename(currentFilePath, path.extname(currentFilePath));
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
  const fs = require('fs');
  const filePath = path.join(__dirname, 'assets', 'persona', `${name}.txt`);
  try { return fs.readFileSync(filePath, 'utf-8'); } catch (e) { return null; }
});

ipcMain.handle('write-persona', (_, name, content) => {
  const fs = require('fs');
  const dir = path.join(__dirname, 'assets', 'persona');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* exists */ }
  const filePath = path.join(dir, `${name}.txt`);
  try { fs.writeFileSync(filePath, content, 'utf-8'); return true; } catch (e) { return false; }
});

ipcMain.handle('list-personas', () => {
  const fs = require('fs');
  const dir = path.join(__dirname, 'assets', 'persona');
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.txt')).map(f => f.replace('.txt', '')); } catch (e) { return []; }
});

// --- System Prompt (temp file for Claude CLI) ---
ipcMain.handle('write-system-prompt', (_, content) => {
  const fs = require('fs');
  const os = require('os');
  const tmpFile = path.join(os.tmpdir(), 'toki-system-prompt.txt');
  fs.writeFileSync(tmpFile, content, 'utf-8');
  return { filePath: tmpFile, platform: process.platform };
});

// --- Guides ---
// Packaged: extraResources → process.resourcesPath/guides
// Dev: __dirname/guides
function getGuidesDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'guides')
    : path.join(__dirname, 'guides');
}

ipcMain.handle('list-guides', () => {
  const fs = require('fs');
  const guidesDir = getGuidesDir();
  try {
    return fs.readdirSync(guidesDir).filter(f => f.endsWith('.md')).sort();
  } catch (e) { return []; }
});

ipcMain.handle('read-guide', (_, filename) => {
  const fs = require('fs');
  const filePath = path.join(getGuidesDir(), filename);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) { return null; }
});

ipcMain.handle('write-guide', (_, filename, content) => {
  const fs = require('fs');
  const guidesDir = getGuidesDir();
  try { fs.mkdirSync(guidesDir, { recursive: true }); } catch (e) { /* exists */ }
  try { fs.writeFileSync(path.join(guidesDir, filename), content, 'utf-8'); return true; } catch (e) { return false; }
});

ipcMain.handle('import-guide', async () => {
  const { dialog } = require('electron');
  const fs = require('fs');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '가이드 파일 불러오기',
    filters: [{ name: 'Markdown / Text', extensions: ['md', 'txt'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || !result.filePaths.length) return [];
  const guidesDir = getGuidesDir();
  try { fs.mkdirSync(guidesDir, { recursive: true }); } catch (e) { /* exists */ }
  const imported = [];
  for (const fp of result.filePaths) {
    const name = path.basename(fp);
    const dest = path.join(guidesDir, name);
    try { fs.copyFileSync(fp, dest); imported.push(name); } catch (e) { /* skip */ }
  }
  return imported;
});

// --- Popout Windows ---

ipcMain.handle('terminal-is-running', () => !!ptyProcess);

ipcMain.handle('popout-create', async (_, panelType) => {
  // Close existing popout of same type
  if (popoutWindows[panelType] && !popoutWindows[panelType].isDestroyed()) {
    popoutWindows[panelType].close();
    delete popoutWindows[panelType];
  }

  const isTerminal = panelType === 'terminal';
  const isEditor = panelType === 'editor';
  const popout = new BrowserWindow({
    width: isEditor ? 900 : (isTerminal ? 700 : 320),
    height: isEditor ? 700 : (isTerminal ? 500 : 650),
    minWidth: isEditor ? 400 : (isTerminal ? 300 : 200),
    minHeight: 200,
    parent: mainWindow,
    frame: false,
    title: isEditor ? 'RisuToki' : (isTerminal ? 'TokiTalk' : '항목'),
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'popout-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  popout.loadFile('src/renderer/popout.html', {
    query: { type: panelType }
  });

  popoutWindows[panelType] = popout;

  popout.on('closed', () => {
    delete popoutWindows[panelType];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('popout-closed', panelType);
    }
  });

  return true;
});

// Editor popout data relay
ipcMain.handle('set-editor-popout-data', (_, data) => {
  editorPopoutData = data;
  return true;
});

ipcMain.handle('get-editor-popout-data', () => {
  return editorPopoutData;
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

// Sidebar popout: provide tree data
ipcMain.handle('popout-sidebar-data', () => {
  if (!currentData) return { items: [] };

  const items = [];

  // Lua
  items.push({ label: 'Lua (통합)', icon: '{}', id: 'lua', indent: 0 });

  // Singles
  const singles = [
    { id: 'globalNote', label: '글로벌노트', icon: '📝' },
    { id: 'firstMessage', label: '첫 메시지', icon: '💬' },
    { id: 'css', label: 'CSS', icon: '🎨' },
    { id: 'defaultVariables', label: '기본변수', icon: '⚙' },
    { id: 'description', label: '설명', icon: '📄' },
  ];
  for (const s of singles) {
    items.push({ label: s.label, icon: s.icon, id: s.id, indent: 0 });
  }

  // Lorebook
  if (currentData.lorebook && currentData.lorebook.length > 0) {
    items.push({ label: '로어북', icon: '📚', isHeader: true, indent: 0 });
    for (let i = 0; i < currentData.lorebook.length; i++) {
      const entry = currentData.lorebook[i];
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
  if (currentData.regex && currentData.regex.length > 0) {
    items.push({ label: '정규식', icon: '⚡', isHeader: true, indent: 0 });
    for (let i = 0; i < currentData.regex.length; i++) {
      items.push({
        label: currentData.regex[i].comment || `regex_${i}`,
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

// --- Lua Section Parsing (mirrors renderer logic) ---

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
  // Merge empty sections with following section
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

// --- Helpers ---

function serializeForRenderer(data) {
  // Don't send binary assets/internal fields to renderer
  return {
    name: data.name,
    description: data.description,
    firstMessage: data.firstMessage,
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
  const allowed = ['name', 'description', 'firstMessage', 'globalNote',
    'css', 'defaultVariables', 'lua', 'lorebook', 'regex'];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      data[key] = fields[key];
    }
  }
}

// --- MCP HTTP API Server ---

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => resolve(body));
  });
}

function jsonRes(res, data, status) {
  res.writeHead(status || 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function startApiServer() {
  apiToken = crypto.randomBytes(32).toString('hex');

  apiServer = http.createServer(async (req, res) => {
    // Auth check
    if (req.headers.authorization !== `Bearer ${apiToken}`) {
      return jsonRes(res, { error: 'Unauthorized' }, 401);
    }
    if (!currentData) {
      return jsonRes(res, { error: 'No file open' }, 400);
    }

    const url = new URL(req.url, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      // GET /fields
      if (req.method === 'GET' && parts[0] === 'fields' && !parts[1]) {
        const fieldNames = ['name', 'description', 'firstMessage', 'globalNote', 'css', 'defaultVariables', 'lua'];
        const fields = fieldNames.map(f => ({
          name: f, size: (currentData[f] || '').length,
          sizeKB: ((currentData[f] || '').length / 1024).toFixed(1) + 'KB'
        }));
        fields.push({ name: 'lorebook', count: (currentData.lorebook || []).length, type: 'array' });
        fields.push({ name: 'regex', count: (currentData.regex || []).length, type: 'array' });
        return jsonRes(res, { fields });
      }

      // GET/POST /field/:name
      if (parts[0] === 'field' && parts[1]) {
        const fieldName = decodeURIComponent(parts[1]);
        const allowed = ['name', 'description', 'firstMessage', 'globalNote', 'css', 'defaultVariables', 'lua'];
        if (!allowed.includes(fieldName)) {
          return jsonRes(res, { error: `Unknown field: ${fieldName}` }, 400);
        }

        if (req.method === 'GET') {
          return jsonRes(res, { field: fieldName, content: currentData[fieldName] || '' });
        }

        if (req.method === 'POST') {
          const body = JSON.parse(await readBody(req));
          if (body.content === undefined) {
            return jsonRes(res, { error: 'Missing "content"' }, 400);
          }
          const oldSize = (currentData[fieldName] || '').length;
          const newSize = body.content.length;

          const allowed = await askRendererConfirm(
            'MCP 수정 요청',
            `Claude가 "${fieldName}" 필드를 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`
          );

          if (allowed) {
            currentData[fieldName] = body.content;
            broadcastToAll('data-updated', fieldName, body.content);
            return jsonRes(res, { success: true, field: fieldName, size: newSize });
          } else {
            return jsonRes(res, { error: '사용자가 거부했습니다', rejected: true }, 403);
          }
        }
      }

      // GET /lorebook
      if (parts[0] === 'lorebook' && !parts[1] && req.method === 'GET') {
        const entries = (currentData.lorebook || []).map((e, i) => ({
          index: i, comment: e.comment || '', key: e.key || '',
          mode: e.mode || 'normal', alwaysActive: !!e.alwaysActive,
          contentSize: (e.content || '').length
        }));
        return jsonRes(res, { count: entries.length, entries });
      }

      // GET /lorebook/:idx
      if (parts[0] === 'lorebook' && parts[1] && req.method === 'GET') {
        const idx = parseInt(parts[1], 10);
        if (idx < 0 || idx >= (currentData.lorebook || []).length) {
          return jsonRes(res, { error: `Index ${idx} out of range` }, 400);
        }
        return jsonRes(res, { index: idx, entry: currentData.lorebook[idx] });
      }

      // POST /lorebook/:idx (modify existing)
      if (parts[0] === 'lorebook' && parts[1] && parts[1] !== 'add' && !parts[2] && req.method === 'POST') {
        const idx = parseInt(parts[1], 10);
        if (idx < 0 || idx >= (currentData.lorebook || []).length) {
          return jsonRes(res, { error: `Index ${idx} out of range` }, 400);
        }
        const body = JSON.parse(await readBody(req));
        const entryName = currentData.lorebook[idx].comment || `entry_${idx}`;

        const allowed = await askRendererConfirm(
          'MCP 수정 요청',
          `Claude가 로어북 항목 "${entryName}" (index ${idx})을 수정하려 합니다.\n현재 에디터에서 수정 중인 내용이 덮어씌워질 수 있습니다.`
        );

        if (allowed) {
          Object.assign(currentData.lorebook[idx], body);
          broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
          return jsonRes(res, { success: true, index: idx });
        } else {
          return jsonRes(res, { error: '사용자가 거부했습니다', rejected: true }, 403);
        }
      }

      // POST /lorebook/add
      if (parts[0] === 'lorebook' && parts[1] === 'add' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const name = body.comment || '새 항목';

        const allowed = await askRendererConfirm(
          'MCP 추가 요청',
          `Claude가 새 로어북 항목 "${name}"을(를) 추가하려 합니다.`
        );

        if (allowed) {
          const entry = Object.assign({
            key: '', secondkey: '', comment: '', content: '',
            order: 100, priority: 0, selective: false,
            alwaysActive: false, mode: 'normal', extentions: {}
          }, body);
          if (!currentData.lorebook) currentData.lorebook = [];
          currentData.lorebook.push(entry);
          broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
          return jsonRes(res, { success: true, index: currentData.lorebook.length - 1 });
        } else {
          return jsonRes(res, { error: '사용자가 거부했습니다', rejected: true }, 403);
        }
      }

      // POST /lorebook/:idx/delete
      if (parts[0] === 'lorebook' && parts[2] === 'delete' && req.method === 'POST') {
        const idx = parseInt(parts[1], 10);
        if (idx < 0 || idx >= (currentData.lorebook || []).length) {
          return jsonRes(res, { error: `Index ${idx} out of range` }, 400);
        }
        const entryName = currentData.lorebook[idx].comment || `entry_${idx}`;

        const allowed = await askRendererConfirm(
          'MCP 삭제 요청',
          `Claude가 로어북 항목 "${entryName}" (index ${idx})을 삭제하려 합니다.`
        );

        if (allowed) {
          currentData.lorebook.splice(idx, 1);
          broadcastToAll('data-updated', 'lorebook', currentData.lorebook);
          return jsonRes(res, { success: true, deleted: idx });
        } else {
          return jsonRes(res, { error: '사용자가 거부했습니다', rejected: true }, 403);
        }
      }

      // GET /regex
      if (parts[0] === 'regex' && !parts[1] && req.method === 'GET') {
        const entries = (currentData.regex || []).map((e, i) => ({
          index: i, comment: e.comment || '', type: e.type || ''
        }));
        return jsonRes(res, { count: entries.length, entries });
      }

      // GET /regex/:idx
      if (parts[0] === 'regex' && parts[1] && req.method === 'GET') {
        const idx = parseInt(parts[1], 10);
        if (idx < 0 || idx >= (currentData.regex || []).length) {
          return jsonRes(res, { error: `Index ${idx} out of range` }, 400);
        }
        return jsonRes(res, { index: idx, entry: currentData.regex[idx] });
      }

      // POST /regex/:idx (modify existing)
      if (parts[0] === 'regex' && parts[1] && parts[1] !== 'add' && !parts[2] && req.method === 'POST') {
        const idx = parseInt(parts[1], 10);
        if (idx < 0 || idx >= (currentData.regex || []).length) {
          return jsonRes(res, { error: `Index ${idx} out of range` }, 400);
        }
        const body = JSON.parse(await readBody(req));
        const entryName = currentData.regex[idx].comment || `regex_${idx}`;

        const allowed = await askRendererConfirm(
          'MCP 수정 요청',
          `Claude가 정규식 항목 "${entryName}" (index ${idx})을 수정하려 합니다.\n현재 에디터에서 수정 중인 내용이 덮어씌워질 수 있습니다.`
        );

        if (allowed) {
          Object.assign(currentData.regex[idx], body);
          broadcastToAll('data-updated', 'regex', currentData.regex);
          return jsonRes(res, { success: true, index: idx });
        } else {
          return jsonRes(res, { error: '사용자가 거부했습니다', rejected: true }, 403);
        }
      }

      // POST /regex/add
      if (parts[0] === 'regex' && parts[1] === 'add' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const name = body.comment || '새 정규식';

        const allowed = await askRendererConfirm(
          'MCP 추가 요청',
          `Claude가 새 정규식 항목 "${name}"을(를) 추가하려 합니다.`
        );

        if (allowed) {
          const entry = Object.assign({
            comment: '', type: 'editoutput', find: '', replace: '', flag: 'g'
          }, body);
          if (!currentData.regex) currentData.regex = [];
          currentData.regex.push(entry);
          broadcastToAll('data-updated', 'regex', currentData.regex);
          return jsonRes(res, { success: true, index: currentData.regex.length - 1 });
        } else {
          return jsonRes(res, { error: '사용자가 거부했습니다', rejected: true }, 403);
        }
      }

      // POST /regex/:idx/delete
      if (parts[0] === 'regex' && parts[2] === 'delete' && req.method === 'POST') {
        const idx = parseInt(parts[1], 10);
        if (idx < 0 || idx >= (currentData.regex || []).length) {
          return jsonRes(res, { error: `Index ${idx} out of range` }, 400);
        }
        const entryName = currentData.regex[idx].comment || `regex_${idx}`;

        const allowed = await askRendererConfirm(
          'MCP 삭제 요청',
          `Claude가 정규식 항목 "${entryName}" (index ${idx})을 삭제하려 합니다.`
        );

        if (allowed) {
          currentData.regex.splice(idx, 1);
          broadcastToAll('data-updated', 'regex', currentData.regex);
          return jsonRes(res, { success: true, deleted: idx });
        } else {
          return jsonRes(res, { error: '사용자가 거부했습니다', rejected: true }, 403);
        }
      }

      // GET /lua — list Lua sections
      if (parts[0] === 'lua' && !parts[1] && req.method === 'GET') {
        const sections = parseLuaSections(currentData.lua);
        const result = sections.map((s, i) => ({
          index: i, name: s.name, contentSize: s.content.length
        }));
        return jsonRes(res, { count: result.length, sections: result });
      }

      // GET /lua/:idx — read Lua section
      if (parts[0] === 'lua' && parts[1] && req.method === 'GET') {
        const sections = parseLuaSections(currentData.lua);
        const idx = parseInt(parts[1], 10);
        if (idx < 0 || idx >= sections.length) {
          return jsonRes(res, { error: `Lua section index ${idx} out of range (0-${sections.length - 1})` }, 400);
        }
        return jsonRes(res, { index: idx, name: sections[idx].name, content: sections[idx].content });
      }

      // POST /lua/:idx — write Lua section
      if (parts[0] === 'lua' && parts[1] && req.method === 'POST') {
        const sections = parseLuaSections(currentData.lua);
        const idx = parseInt(parts[1], 10);
        if (idx < 0 || idx >= sections.length) {
          return jsonRes(res, { error: `Lua section index ${idx} out of range (0-${sections.length - 1})` }, 400);
        }
        const body = JSON.parse(await readBody(req));
        if (body.content === undefined) {
          return jsonRes(res, { error: 'Missing "content"' }, 400);
        }
        const sectionName = sections[idx].name;
        const oldSize = sections[idx].content.length;
        const newSize = body.content.length;

        const allowed = await askRendererConfirm(
          'MCP 수정 요청',
          `Claude가 Lua 섹션 "${sectionName}" (index ${idx})을 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`
        );

        if (allowed) {
          sections[idx].content = body.content;
          currentData.lua = combineLuaSections(sections);
          broadcastToAll('data-updated', 'lua', currentData.lua);
          return jsonRes(res, { success: true, index: idx, name: sectionName, size: newSize });
        } else {
          return jsonRes(res, { error: '사용자가 거부했습니다', rejected: true }, 403);
        }
      }

      // POST /lua/:idx/replace — find-and-replace within a Lua section
      if (parts[0] === 'lua' && parts[1] && parts[2] === 'replace' && req.method === 'POST') {
        const sections = parseLuaSections(currentData.lua);
        const idx = parseInt(parts[1], 10);
        if (idx < 0 || idx >= sections.length) {
          return jsonRes(res, { error: `Lua section index ${idx} out of range (0-${sections.length - 1})` }, 400);
        }
        const body = JSON.parse(await readBody(req));
        if (!body.find) {
          return jsonRes(res, { error: 'Missing "find"' }, 400);
        }
        const sectionName = sections[idx].name;
        const content = sections[idx].content;
        const findStr = body.find;
        const replaceStr = body.replace !== undefined ? body.replace : '';
        const useRegex = !!body.regex;
        const flags = body.flags || 'g';

        let newContent;
        let matchCount;
        if (useRegex) {
          const re = new RegExp(findStr, flags);
          const matches = content.match(re);
          matchCount = matches ? matches.length : 0;
          newContent = content.replace(re, replaceStr);
        } else {
          // Count occurrences
          matchCount = 0;
          let searchFrom = 0;
          while (true) {
            const pos = content.indexOf(findStr, searchFrom);
            if (pos === -1) break;
            matchCount++;
            searchFrom = pos + findStr.length;
          }
          // Replace all occurrences
          newContent = content.split(findStr).join(replaceStr);
        }

        if (matchCount === 0) {
          return jsonRes(res, { success: false, message: '일치하는 항목 없음', matchCount: 0 });
        }

        const allowed = await askRendererConfirm(
          'MCP 치환 요청',
          `Claude가 Lua 섹션 "${sectionName}" (index ${idx})에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`
        );

        if (allowed) {
          sections[idx].content = newContent;
          currentData.lua = combineLuaSections(sections);
          broadcastToAll('data-updated', 'lua', currentData.lua);
          return jsonRes(res, { success: true, index: idx, name: sectionName, matchCount, oldSize: content.length, newSize: newContent.length });
        } else {
          return jsonRes(res, { error: '사용자가 거부했습니다', rejected: true }, 403);
        }
      }

      // POST /lua/:idx/insert — insert content into a Lua section
      if (parts[0] === 'lua' && parts[1] && parts[2] === 'insert' && req.method === 'POST') {
        const sections = parseLuaSections(currentData.lua);
        const idx = parseInt(parts[1], 10);
        if (idx < 0 || idx >= sections.length) {
          return jsonRes(res, { error: `Lua section index ${idx} out of range (0-${sections.length - 1})` }, 400);
        }
        const body = JSON.parse(await readBody(req));
        if (body.content === undefined) {
          return jsonRes(res, { error: 'Missing "content"' }, 400);
        }
        const sectionName = sections[idx].name;
        const oldContent = sections[idx].content;
        let newContent;
        const position = body.position || 'end'; // 'start' | 'end' | 'after' | 'before'

        if (position === 'end') {
          newContent = oldContent + '\n' + body.content;
        } else if (position === 'start') {
          newContent = body.content + '\n' + oldContent;
        } else if ((position === 'after' || position === 'before') && body.anchor) {
          const anchorPos = oldContent.indexOf(body.anchor);
          if (anchorPos === -1) {
            return jsonRes(res, { success: false, message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}` });
          }
          if (position === 'after') {
            const insertAt = anchorPos + body.anchor.length;
            newContent = oldContent.slice(0, insertAt) + '\n' + body.content + oldContent.slice(insertAt);
          } else {
            newContent = oldContent.slice(0, anchorPos) + body.content + '\n' + oldContent.slice(anchorPos);
          }
        } else {
          return jsonRes(res, { error: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다' }, 400);
        }

        const preview = body.content.substring(0, 100) + (body.content.length > 100 ? '...' : '');
        const allowed = await askRendererConfirm(
          'MCP 삽입 요청',
          `Claude가 Lua 섹션 "${sectionName}" (index ${idx})에 코드를 삽입하려 합니다.\n위치: ${position}${body.anchor ? ' "' + body.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`
        );

        if (allowed) {
          sections[idx].content = newContent;
          currentData.lua = combineLuaSections(sections);
          broadcastToAll('data-updated', 'lua', currentData.lua);
          return jsonRes(res, { success: true, index: idx, name: sectionName, position, oldSize: oldContent.length, newSize: newContent.length });
        } else {
          return jsonRes(res, { error: '사용자가 거부했습니다', rejected: true }, 403);
        }
      }

      // GET /references — list loaded reference files
      if (parts[0] === 'references' && !parts[1] && req.method === 'GET') {
        const refs = referenceFiles.map((r, i) => {
          const fields = [];
          for (const f of ['lua', 'globalNote', 'firstMessage', 'css', 'description', 'defaultVariables']) {
            if (r.data[f]) fields.push({ name: f, size: r.data[f].length });
          }
          if (r.data.lorebook?.length) fields.push({ name: 'lorebook', count: r.data.lorebook.length, type: 'array' });
          if (r.data.regex?.length) fields.push({ name: 'regex', count: r.data.regex.length, type: 'array' });
          return { index: i, fileName: r.fileName, fields };
        });
        return jsonRes(res, { count: refs.length, references: refs });
      }

      // GET /reference/:idx/:field — read a reference file's field
      if (parts[0] === 'reference' && parts[1] && parts[2] && req.method === 'GET') {
        const idx = parseInt(parts[1], 10);
        const fieldName = decodeURIComponent(parts[2]);
        if (idx < 0 || idx >= referenceFiles.length) {
          return jsonRes(res, { error: `Reference index ${idx} out of range` }, 400);
        }
        const ref = referenceFiles[idx];
        if (fieldName === 'lorebook') {
          return jsonRes(res, { index: idx, fileName: ref.fileName, field: 'lorebook', content: ref.data.lorebook || [] });
        }
        if (fieldName === 'regex') {
          return jsonRes(res, { index: idx, fileName: ref.fileName, field: 'regex', content: ref.data.regex || [] });
        }
        const allowed = ['lua', 'globalNote', 'firstMessage', 'css', 'description', 'defaultVariables', 'name'];
        if (!allowed.includes(fieldName)) {
          return jsonRes(res, { error: `Unknown field: ${fieldName}` }, 400);
        }
        return jsonRes(res, { index: idx, fileName: ref.fileName, field: fieldName, content: ref.data[fieldName] || '' });
      }

      jsonRes(res, { error: 'Not found' }, 404);
    } catch (err) {
      console.error('[main] API error:', err);
      jsonRes(res, { error: err.message }, 500);
    }
  });

  apiServer.listen(0, '127.0.0.1', () => {
    apiPort = apiServer.address().port;
    console.log(`[main] MCP API server on 127.0.0.1:${apiPort}`);
    // Auto-write .mcp.json so MCP tools always have correct port
    writeCurrentMcpConfig();
  });
}
