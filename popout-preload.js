"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const popoutAPI = {
    getType: () => new URLSearchParams(window.location.search).get('type') || 'terminal',
    getRequestId: () => new URLSearchParams(window.location.search).get('requestId'),
    dock: () => electron_1.ipcRenderer.invoke('popout-dock'),
    terminalIsRunning: () => electron_1.ipcRenderer.invoke('terminal-is-running'),
    terminalStart: (cols, rows) => electron_1.ipcRenderer.invoke('terminal-start', cols, rows),
    terminalInput: (data) => electron_1.ipcRenderer.send('terminal-input', data),
    terminalResize: (cols, rows) => electron_1.ipcRenderer.send('terminal-resize', cols, rows),
    onTerminalData: (cb) => {
        electron_1.ipcRenderer.on('terminal-data', (_event, data) => cb(data));
    },
    onTerminalExit: (cb) => {
        electron_1.ipcRenderer.on('terminal-exit', () => cb());
    },
    onTerminalStatus: (cb) => {
        electron_1.ipcRenderer.on('terminal-status', (_event, event) => cb(event));
    },
    getSidebarData: () => electron_1.ipcRenderer.invoke('popout-sidebar-data'),
    sidebarClick: (itemId) => electron_1.ipcRenderer.send('popout-sidebar-click', itemId),
    onSidebarDataChanged: (cb) => {
        electron_1.ipcRenderer.on('sidebar-data-changed', () => cb());
    },
    getEditorData: (requestId) => electron_1.ipcRenderer.invoke('get-editor-popout-data', requestId),
    editorChange: (tabId, content) => electron_1.ipcRenderer.send('editor-popout-change', tabId, content),
    editorSave: () => electron_1.ipcRenderer.send('editor-popout-save'),
    getPreviewData: (requestId) => electron_1.ipcRenderer.invoke('get-preview-popout-data', requestId),
    getAllAssetsMap: () => electron_1.ipcRenderer.invoke('get-all-assets-map'),
    getRefsData: () => electron_1.ipcRenderer.invoke('popout-refs-data'),
    refsItemClick: (tabId) => electron_1.ipcRenderer.send('popout-refs-click', tabId),
    onRefsDataChanged: (cb) => {
        electron_1.ipcRenderer.on('refs-data-changed', () => cb());
    }
};
electron_1.contextBridge.exposeInMainWorld('popoutAPI', popoutAPI);
