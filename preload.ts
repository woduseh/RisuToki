import { contextBridge, ipcRenderer } from 'electron';

type TokiApi = Window['tokiAPI'];
type TokiTerminalStatus = Parameters<Parameters<TokiApi['onTerminalStatus']>[0]>[0];
type TokiMcpStatus = Parameters<Parameters<TokiApi['onMcpStatus']>[0]>[0];

const tokiAPI: TokiApi = {
  newFile: () => ipcRenderer.invoke('new-file'),
  openFile: () => ipcRenderer.invoke('open-file'),
  openReference: () => ipcRenderer.invoke('open-reference'),
  openReferencePath: (filePath) => ipcRenderer.invoke('open-reference-path', filePath),
  listReferences: () => ipcRenderer.invoke('list-references'),
  getReferenceManifestStatus: () => ipcRenderer.invoke('get-reference-manifest-status'),
  removeReference: (fileIdentifier) => ipcRenderer.invoke('remove-reference', fileIdentifier),
  removeAllReferences: () => ipcRenderer.invoke('remove-all-references'),
  saveFile: (updatedFields) => ipcRenderer.invoke('save-file', updatedFields),
  saveFileAs: (updatedFields) => ipcRenderer.invoke('save-file-as', updatedFields),
  getFilePath: () => ipcRenderer.invoke('get-file-path'),
  getCwd: () => ipcRenderer.invoke('get-cwd'),
  terminalStart: (cols, rows) => ipcRenderer.invoke('terminal-start', cols, rows),
  terminalIsRunning: () => ipcRenderer.invoke('terminal-is-running'),
  terminalInput: (data) => ipcRenderer.send('terminal-input', data),
  terminalResize: (cols, rows) => ipcRenderer.send('terminal-resize', cols, rows),
  terminalStop: () => ipcRenderer.invoke('terminal-stop'),
  onTerminalData: (cb) => {
    ipcRenderer.on('terminal-data', (_event, data: string) => cb(data));
  },
  onTerminalExit: (cb) => {
    ipcRenderer.on('terminal-exit', () => cb());
  },
  onTerminalStatus: (cb) => {
    ipcRenderer.on('terminal-status', (_event, event: TokiTerminalStatus) => cb(event));
  },
  getClaudePrompt: () => ipcRenderer.invoke('get-claude-prompt'),
  getMcpInfo: () => ipcRenderer.invoke('get-mcp-info'),
  writeMcpConfig: () => ipcRenderer.invoke('write-mcp-config'),
  writeCopilotMcpConfig: () => ipcRenderer.invoke('write-copilot-mcp-config'),
  writeCodexMcpConfig: () => ipcRenderer.invoke('write-codex-mcp-config'),
  writeGeminiMcpConfig: () => ipcRenderer.invoke('write-gemini-mcp-config'),
  writeAgentsMd: (content) => ipcRenderer.invoke('write-agents-md', content),
  cleanupAgentsMd: () => ipcRenderer.invoke('cleanup-agents-md'),
  onDataUpdated: (cb) => {
    ipcRenderer.on('data-updated', (_event, field: string, value: unknown) => cb(field, value));
  },
  onMcpConfirmRequest: (cb) => {
    ipcRenderer.on('mcp-confirm-request', (_event, id: number, title: string, message: string) =>
      cb(id, title, message),
    );
  },
  sendMcpConfirmResponse: (id, allowed) => ipcRenderer.send('mcp-confirm-response', id, allowed),
  onMcpStatus: (cb) => {
    ipcRenderer.on('mcp-status', (_event, payload: TokiMcpStatus) => cb(payload));
  },
  onCloseConfirmRequest: (cb) => {
    ipcRenderer.on('close-confirm-request', (_event, id: number) => cb(id));
  },
  sendCloseConfirmResponse: (id, choice) => ipcRenderer.send('close-confirm-response', id, choice),
  getAssetList: () => ipcRenderer.invoke('get-asset-list'),
  getAssetData: (assetPath) => ipcRenderer.invoke('get-asset-data', assetPath),
  getAllAssetsMap: () => ipcRenderer.invoke('get-all-assets-map'),
  addAsset: (targetFolder) => ipcRenderer.invoke('add-asset', targetFolder),
  addAssetBuffer: (fileName, base64, targetFolder) =>
    ipcRenderer.invoke('add-asset-buffer', fileName, base64, targetFolder),
  deleteAsset: (assetPath) => ipcRenderer.invoke('delete-asset', assetPath),
  renameAsset: (oldPath, newName) => ipcRenderer.invoke('rename-asset', oldPath, newName),
  reorderAsset: (fromPath, toIdx) => ipcRenderer.invoke('reorder-asset', fromPath, toIdx),
  compressAssetsWebp: (opts) => ipcRenderer.invoke('compress-assets-webp', opts),
  exportLorebook: (opts) => ipcRenderer.invoke('export-lorebook', opts),
  importLorebook: (opts) => ipcRenderer.invoke('import-lorebook', opts),
  exportField: (field, format) => ipcRenderer.invoke('export-field', field, format),
  importJson: () => ipcRenderer.invoke('import-json'),
  autosaveFile: (updatedFields) => ipcRenderer.invoke('autosave-file', updatedFields),
  cleanupAutosave: (customDir) => ipcRenderer.invoke('cleanup-autosave', customDir),
  writeSystemPrompt: (content) => ipcRenderer.invoke('write-system-prompt', content),
  readPersona: (name) => ipcRenderer.invoke('read-persona', name),
  writePersona: (name, content) => ipcRenderer.invoke('write-persona', name, content),
  listPersonas: () => ipcRenderer.invoke('list-personas'),
  listGuides: () => ipcRenderer.invoke('list-guides'),
  readGuide: (filename) => ipcRenderer.invoke('read-guide', filename),
  writeGuide: (filename, content) => ipcRenderer.invoke('write-guide', filename, content),
  importGuide: () => ipcRenderer.invoke('import-guide'),
  deleteGuide: (filename) => ipcRenderer.invoke('delete-guide', filename),
  pickBgImage: () => ipcRenderer.invoke('pick-bg-image'),
  pickBgm: () => ipcRenderer.invoke('pick-bgm'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  getAutosaveInfo: (customDir) => ipcRenderer.invoke('get-autosave-info', customDir),
  pickAutosaveDir: () => ipcRenderer.invoke('pick-autosave-dir'),
  startSync: (port) => ipcRenderer.invoke('start-sync', port),
  stopSync: () => ipcRenderer.invoke('stop-sync'),
  onSyncStatus: (cb) => {
    ipcRenderer.on('sync-status', (_event, active: boolean, port: number | null) => cb(active, port));
  },
  toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
  popoutPanel: (type, requestId) => ipcRenderer.invoke('popout-create', type, requestId),
  closePopout: (type) => ipcRenderer.invoke('popout-close', type),
  onPopoutClosed: (cb) => {
    ipcRenderer.on('popout-closed', (_event, type: string) => cb(type));
  },
  onPopoutSidebarClick: (cb) => {
    ipcRenderer.on('popout-sidebar-click', (_event, itemId: string) => cb(itemId));
  },
  onPopoutRefsClick: (cb) => {
    ipcRenderer.on('popout-refs-click', (_event, tabId: string) => cb(tabId));
  },
  setEditorPopoutData: (data) => ipcRenderer.invoke('set-editor-popout-data', data),
  onEditorPopoutChange: (cb) => {
    ipcRenderer.on('editor-popout-change', (_event, tabId: string, content: string) => cb(tabId, content));
  },
  onEditorPopoutSave: (cb) => {
    ipcRenderer.on('editor-popout-save', () => cb());
  },
  setPreviewPopoutData: (data) => ipcRenderer.invoke('set-preview-popout-data', data),
  getGuidesPath: () => ipcRenderer.invoke('get-guides-path'),
};

contextBridge.exposeInMainWorld('tokiAPI', tokiAPI);
