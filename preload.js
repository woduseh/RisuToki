"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const tokiAPI = {
    newFile: () => electron_1.ipcRenderer.invoke('new-file'),
    openFile: () => electron_1.ipcRenderer.invoke('open-file'),
    openReference: () => electron_1.ipcRenderer.invoke('open-reference'),
    openReferencePath: (filePath) => electron_1.ipcRenderer.invoke('open-reference-path', filePath),
    listReferences: () => electron_1.ipcRenderer.invoke('list-references'),
    getReferenceManifestStatus: () => electron_1.ipcRenderer.invoke('get-reference-manifest-status'),
    removeReference: (fileIdentifier) => electron_1.ipcRenderer.invoke('remove-reference', fileIdentifier),
    removeAllReferences: () => electron_1.ipcRenderer.invoke('remove-all-references'),
    saveFile: (updatedFields) => electron_1.ipcRenderer.invoke('save-file', updatedFields),
    saveFileAs: (updatedFields) => electron_1.ipcRenderer.invoke('save-file-as', updatedFields),
    getFilePath: () => electron_1.ipcRenderer.invoke('get-file-path'),
    getCwd: () => electron_1.ipcRenderer.invoke('get-cwd'),
    terminalStart: (cols, rows) => electron_1.ipcRenderer.invoke('terminal-start', cols, rows),
    terminalIsRunning: () => electron_1.ipcRenderer.invoke('terminal-is-running'),
    terminalInput: (data) => electron_1.ipcRenderer.send('terminal-input', data),
    terminalResize: (cols, rows) => electron_1.ipcRenderer.send('terminal-resize', cols, rows),
    terminalStop: () => electron_1.ipcRenderer.invoke('terminal-stop'),
    onTerminalData: (cb) => {
        electron_1.ipcRenderer.on('terminal-data', (_event, data) => cb(data));
    },
    onTerminalExit: (cb) => {
        electron_1.ipcRenderer.on('terminal-exit', () => cb());
    },
    onTerminalStatus: (cb) => {
        electron_1.ipcRenderer.on('terminal-status', (_event, event) => cb(event));
    },
    getClaudePrompt: () => electron_1.ipcRenderer.invoke('get-claude-prompt'),
    getMcpInfo: () => electron_1.ipcRenderer.invoke('get-mcp-info'),
    writeMcpConfig: () => electron_1.ipcRenderer.invoke('write-mcp-config'),
    writeCopilotMcpConfig: () => electron_1.ipcRenderer.invoke('write-copilot-mcp-config'),
    writeCodexMcpConfig: () => electron_1.ipcRenderer.invoke('write-codex-mcp-config'),
    writeGeminiMcpConfig: () => electron_1.ipcRenderer.invoke('write-gemini-mcp-config'),
    writeAgentsMd: (content) => electron_1.ipcRenderer.invoke('write-agents-md', content),
    cleanupAgentsMd: () => electron_1.ipcRenderer.invoke('cleanup-agents-md'),
    onDataUpdated: (cb) => {
        electron_1.ipcRenderer.on('data-updated', (_event, field, value) => cb(field, value));
    },
    onMcpConfirmRequest: (cb) => {
        electron_1.ipcRenderer.on('mcp-confirm-request', (_event, id, title, message) => cb(id, title, message));
    },
    sendMcpConfirmResponse: (id, allowed) => electron_1.ipcRenderer.send('mcp-confirm-response', id, allowed),
    onMcpStatus: (cb) => {
        electron_1.ipcRenderer.on('mcp-status', (_event, payload) => cb(payload));
    },
    onCloseConfirmRequest: (cb) => {
        electron_1.ipcRenderer.on('close-confirm-request', (_event, id) => cb(id));
    },
    sendCloseConfirmResponse: (id, choice) => electron_1.ipcRenderer.send('close-confirm-response', id, choice),
    getAssetList: () => electron_1.ipcRenderer.invoke('get-asset-list'),
    getAssetData: (assetPath) => electron_1.ipcRenderer.invoke('get-asset-data', assetPath),
    getAllAssetsMap: () => electron_1.ipcRenderer.invoke('get-all-assets-map'),
    addAsset: (targetFolder) => electron_1.ipcRenderer.invoke('add-asset', targetFolder),
    addAssetBuffer: (fileName, base64, targetFolder) => electron_1.ipcRenderer.invoke('add-asset-buffer', fileName, base64, targetFolder),
    deleteAsset: (assetPath) => electron_1.ipcRenderer.invoke('delete-asset', assetPath),
    renameAsset: (oldPath, newName) => electron_1.ipcRenderer.invoke('rename-asset', oldPath, newName),
    reorderAsset: (fromPath, toIdx) => electron_1.ipcRenderer.invoke('reorder-asset', fromPath, toIdx),
    importJson: () => electron_1.ipcRenderer.invoke('import-json'),
    autosaveFile: (updatedFields) => electron_1.ipcRenderer.invoke('autosave-file', updatedFields),
    cleanupAutosave: (customDir) => electron_1.ipcRenderer.invoke('cleanup-autosave', customDir),
    writeSystemPrompt: (content) => electron_1.ipcRenderer.invoke('write-system-prompt', content),
    readPersona: (name) => electron_1.ipcRenderer.invoke('read-persona', name),
    writePersona: (name, content) => electron_1.ipcRenderer.invoke('write-persona', name, content),
    listPersonas: () => electron_1.ipcRenderer.invoke('list-personas'),
    listGuides: () => electron_1.ipcRenderer.invoke('list-guides'),
    readGuide: (filename) => electron_1.ipcRenderer.invoke('read-guide', filename),
    writeGuide: (filename, content) => electron_1.ipcRenderer.invoke('write-guide', filename, content),
    importGuide: () => electron_1.ipcRenderer.invoke('import-guide'),
    deleteGuide: (filename) => electron_1.ipcRenderer.invoke('delete-guide', filename),
    pickBgImage: () => electron_1.ipcRenderer.invoke('pick-bg-image'),
    pickBgm: () => electron_1.ipcRenderer.invoke('pick-bgm'),
    openFolder: (folderPath) => electron_1.ipcRenderer.invoke('open-folder', folderPath),
    getAutosaveInfo: (customDir) => electron_1.ipcRenderer.invoke('get-autosave-info', customDir),
    pickAutosaveDir: () => electron_1.ipcRenderer.invoke('pick-autosave-dir'),
    startSync: (port) => electron_1.ipcRenderer.invoke('start-sync', port),
    stopSync: () => electron_1.ipcRenderer.invoke('stop-sync'),
    onSyncStatus: (cb) => {
        electron_1.ipcRenderer.on('sync-status', (_event, active, port) => cb(active, port));
    },
    toggleDevTools: () => electron_1.ipcRenderer.invoke('toggle-devtools'),
    popoutPanel: (type, requestId) => electron_1.ipcRenderer.invoke('popout-create', type, requestId),
    closePopout: (type) => electron_1.ipcRenderer.invoke('popout-close', type),
    onPopoutClosed: (cb) => {
        electron_1.ipcRenderer.on('popout-closed', (_event, type) => cb(type));
    },
    onPopoutSidebarClick: (cb) => {
        electron_1.ipcRenderer.on('popout-sidebar-click', (_event, itemId) => cb(itemId));
    },
    onPopoutRefsClick: (cb) => {
        electron_1.ipcRenderer.on('popout-refs-click', (_event, tabId) => cb(tabId));
    },
    setEditorPopoutData: (data) => electron_1.ipcRenderer.invoke('set-editor-popout-data', data),
    onEditorPopoutChange: (cb) => {
        electron_1.ipcRenderer.on('editor-popout-change', (_event, tabId, content) => cb(tabId, content));
    },
    onEditorPopoutSave: (cb) => {
        electron_1.ipcRenderer.on('editor-popout-save', () => cb());
    },
    setPreviewPopoutData: (data) => electron_1.ipcRenderer.invoke('set-preview-popout-data', data),
    getGuidesPath: () => electron_1.ipcRenderer.invoke('get-guides-path'),
};
electron_1.contextBridge.exposeInMainWorld('tokiAPI', tokiAPI);
