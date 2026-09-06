import type { IpcRenderer } from 'electron';

type TokiApi = Window['tokiAPI'];
type TokiTerminalStatus = Parameters<Parameters<TokiApi['onTerminalStatus']>[0]>[0];
type TokiMcpStatus = Parameters<Parameters<TokiApi['onMcpStatus']>[0]>[0];

export function createTokiApi(ipcRenderer: IpcRenderer): TokiApi {
  return {
    newFile: () => ipcRenderer.invoke('new-file'),
    openFile: () => ipcRenderer.invoke('open-file'),
    openFilePath: (filePath) => ipcRenderer.invoke('open-file-path', filePath),
    extractDocumentToProject: () => ipcRenderer.invoke('extract-document-to-project'),
    extractCharxToProject: () => ipcRenderer.invoke('extract-document-to-project'),
    openProjectFolder: () => ipcRenderer.invoke('open-project-folder'),
    openProjectFolderPath: (projectPath) => ipcRenderer.invoke('open-project-folder-path', projectPath),
    cloneProjectFolder: () => ipcRenderer.invoke('clone-project-folder'),
    reloadProjectFolder: () => ipcRenderer.invoke('reload-project-folder'),
    saveProjectFolder: (updatedFields) => ipcRenderer.invoke('save-project-folder', updatedFields),
    reassembleProjectDocument: (updatedFields) => ipcRenderer.invoke('reassemble-project-document', updatedFields),
    reassembleProjectCharx: (updatedFields) => ipcRenderer.invoke('reassemble-project-document', updatedFields),
    getProjectPath: () => ipcRenderer.invoke('get-project-path'),
    getProjectTree: () => ipcRenderer.invoke('get-project-tree'),
    readProjectFile: (relativePath) => ipcRenderer.invoke('read-project-file', relativePath),
    writeProjectFile: (relativePath, content) => ipcRenderer.invoke('write-project-file', relativePath, content),
    watchProjectFolder: () => ipcRenderer.invoke('watch-project-folder'),
    unwatchProjectFolder: () => ipcRenderer.invoke('unwatch-project-folder'),
    openReference: () => ipcRenderer.invoke('open-reference'),
    openReferencePath: (filePath) => ipcRenderer.invoke('open-reference-path', filePath),
    listReferences: () => ipcRenderer.invoke('list-references'),
    getReferenceManifestStatus: () => ipcRenderer.invoke('get-reference-manifest-status'),
    removeReference: (fileIdentifier) => ipcRenderer.invoke('remove-reference', fileIdentifier),
    removeAllReferences: () => ipcRenderer.invoke('remove-all-references'),
    saveFile: (updatedFields) => ipcRenderer.invoke('save-file', updatedFields),
    saveFileAs: (updatedFields) => ipcRenderer.invoke('save-file-as', updatedFields),
    getFilePath: () => ipcRenderer.invoke('get-file-path'),
    getMcpActivity: () => ipcRenderer.invoke('get-mcp-activity'),
    onMcpActivity: (callback) => {
      const listener = (_event: unknown, payload: Parameters<typeof callback>[0]) => callback(payload);
      ipcRenderer.on('mcp-activity', listener);
      return () => {
        ipcRenderer.removeListener('mcp-activity', listener);
      };
    },
    getPreviewAssetInventory: () => ipcRenderer.invoke('get-preview-asset-inventory'),
    getDocumentReview: (draft) => ipcRenderer.invoke('get-document-review', draft),
    restoreReviewAsset: (request) => ipcRenderer.invoke('restore-review-asset', request),
    getCwd: () => ipcRenderer.invoke('get-cwd'),
    setTerminalCwd: (cwd) => ipcRenderer.invoke('set-terminal-cwd', cwd),
    terminalStart: (cols, rows) => ipcRenderer.invoke('terminal-start', cols, rows),
    terminalNewSession: (name) => ipcRenderer.invoke('terminal-new-session', name),
    terminalStartSession: (sessionId, cols, rows, name) =>
      ipcRenderer.invoke('terminal-start-session', sessionId, cols, rows, name),
    terminalInputSession: (sessionId, data) => ipcRenderer.send('terminal-input-session', sessionId, data),
    terminalResizeSession: (sessionId, cols, rows) =>
      ipcRenderer.send('terminal-resize-session', sessionId, cols, rows),
    terminalStopSession: (sessionId) => ipcRenderer.invoke('terminal-stop-session', sessionId),
    terminalListSessions: () => ipcRenderer.invoke('terminal-list-sessions'),
    terminalRenameSession: (sessionId, name) => ipcRenderer.invoke('terminal-rename-session', sessionId, name),
    terminalIsSessionRunning: (sessionId) => ipcRenderer.invoke('terminal-is-session-running', sessionId),
    terminalIsRunning: () => ipcRenderer.invoke('terminal-is-running'),
    terminalInput: (data) => ipcRenderer.send('terminal-input', data),
    terminalResize: (cols, rows) => ipcRenderer.send('terminal-resize', cols, rows),
    terminalStop: () => ipcRenderer.invoke('terminal-stop'),
    onTerminalData: (cb) => {
      ipcRenderer.on('terminal-data', (_event, data: string) => cb(data));
    },
    onTerminalDataSession: (cb) => {
      const listener = (_event: unknown, sessionId: string, data: string) => cb(sessionId, data);
      ipcRenderer.on('terminal-data-session', listener);
      return () => ipcRenderer.removeListener('terminal-data-session', listener);
    },
    onTerminalExit: (cb) => {
      ipcRenderer.on('terminal-exit', () => cb());
    },
    onTerminalExitSession: (cb) => {
      const listener = (_event: unknown, sessionId: string) => cb(sessionId);
      ipcRenderer.on('terminal-exit-session', listener);
      return () => ipcRenderer.removeListener('terminal-exit-session', listener);
    },
    onTerminalStatus: (cb) => {
      ipcRenderer.on('terminal-status', (_event, event: TokiTerminalStatus) => cb(event));
    },
    onTerminalStatusSession: (cb) => {
      const listener = (_event: unknown, sessionId: string, event: TokiTerminalStatus) => cb(sessionId, event);
      ipcRenderer.on('terminal-status-session', listener);
      return () => ipcRenderer.removeListener('terminal-status-session', listener);
    },
    getClaudePrompt: () => ipcRenderer.invoke('get-claude-prompt'),
    getMcpInfo: () => ipcRenderer.invoke('get-mcp-info'),
    writeMcpConfig: () => ipcRenderer.invoke('write-mcp-config'),
    writeCopilotMcpConfig: () => ipcRenderer.invoke('write-copilot-mcp-config'),
    writeCodexMcpConfig: (projectRoot) => ipcRenderer.invoke('write-codex-mcp-config', projectRoot),
    writeAntigravityMcpConfig: () => ipcRenderer.invoke('write-antigravity-mcp-config'),
    writeAgentsMd: (content, projectRoot) => ipcRenderer.invoke('write-agents-md', content, projectRoot),
    cleanupAgentsMd: () => ipcRenderer.invoke('cleanup-agents-md'),
    onDataUpdated: (cb) => {
      ipcRenderer.on('data-updated', (_event, field: string, value: unknown) => cb(field, value));
    },
    onProjectFolderChanged: (cb) => {
      ipcRenderer.on('project-folder-changed', (_event, payload: Parameters<typeof cb>[0]) => cb(payload));
    },
    onMcpConfirmRequest: (cb) => {
      ipcRenderer.on('mcp-confirm-request', (_event, id: number, title: string, message: string) =>
        cb(id, title, message),
      );
    },
    sendMcpConfirmResponse: (id, allowed) => ipcRenderer.send('mcp-confirm-response', id, allowed),
    onMcpOpenFileRequest: (cb) => {
      ipcRenderer.on('mcp-open-file-request', (_event, id: number, request: Parameters<typeof cb>[1]) =>
        cb(id, request),
      );
    },
    sendMcpOpenFileResponse: (id, response) => ipcRenderer.send('mcp-open-file-response', id, response),
    onMcpSessionStatusRequest: (cb) => {
      ipcRenderer.on('mcp-session-status-request', (_event, id: number) => cb(id));
    },
    sendMcpSessionStatusResponse: (id, response) => ipcRenderer.send('mcp-session-status-response', id, response),
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
    deleteAssets: (assetPaths) => ipcRenderer.invoke('delete-assets', assetPaths),
    renameAsset: (oldPath, newName) => ipcRenderer.invoke('rename-asset', oldPath, newName),
    renameAssetsBatch: (operations) => ipcRenderer.invoke('rename-assets-batch', operations),
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
    openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
    getAutosaveInfo: (customDir) => ipcRenderer.invoke('get-autosave-info', customDir),
    pickAutosaveDir: () => ipcRenderer.invoke('pick-autosave-dir'),
    getPendingSessionRecovery: () => ipcRenderer.invoke('get-pending-session-recovery'),
    resolvePendingSessionRecovery: (action) => ipcRenderer.invoke('resolve-pending-session-recovery', action),
    toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
    resolveGuidePath: (filename) => ipcRenderer.invoke('resolve-guide-path', filename),
  };
}
