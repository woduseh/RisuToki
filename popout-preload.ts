import { contextBridge, ipcRenderer } from 'electron';

type PopoutBridge = Window['popoutAPI'];
type PopoutTerminalStatus = Parameters<Parameters<PopoutBridge['onTerminalStatus']>[0]>[0];

const popoutAPI: PopoutBridge = {
  getType: () => new URLSearchParams(window.location.search).get('type') || 'terminal',
  getRequestId: () => new URLSearchParams(window.location.search).get('requestId'),
  dock: () => ipcRenderer.invoke('popout-dock'),
  terminalIsRunning: () => ipcRenderer.invoke('terminal-is-running'),
  terminalStart: (cols, rows) => ipcRenderer.invoke('terminal-start', cols, rows),
  terminalInput: (data) => ipcRenderer.send('terminal-input', data),
  terminalResize: (cols, rows) => ipcRenderer.send('terminal-resize', cols, rows),
  onTerminalData: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string) => cb(data);
    ipcRenderer.on('terminal-data', listener);
    return () => ipcRenderer.removeListener('terminal-data', listener);
  },
  onTerminalExit: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('terminal-exit', listener);
    return () => ipcRenderer.removeListener('terminal-exit', listener);
  },
  onTerminalStatus: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, event: PopoutTerminalStatus) => cb(event);
    ipcRenderer.on('terminal-status', listener);
    return () => ipcRenderer.removeListener('terminal-status', listener);
  },
  getSidebarData: () => ipcRenderer.invoke('popout-sidebar-data'),
  sidebarClick: (itemId) => ipcRenderer.send('popout-sidebar-click', itemId),
  onSidebarDataChanged: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('sidebar-data-changed', listener);
    return () => ipcRenderer.removeListener('sidebar-data-changed', listener);
  },
  getEditorData: (requestId) => ipcRenderer.invoke('get-editor-popout-data', requestId),
  editorChange: (tabId, content) => ipcRenderer.send('editor-popout-change', tabId, content),
  editorSave: () => ipcRenderer.send('editor-popout-save'),
  getPreviewData: (requestId) => ipcRenderer.invoke('get-preview-popout-data', requestId),
  getAllAssetsMap: () => ipcRenderer.invoke('get-all-assets-map'),
  getRefsData: () => ipcRenderer.invoke('popout-refs-data'),
  refsItemClick: (tabId) => ipcRenderer.send('popout-refs-click', tabId),
  onRefsDataChanged: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('refs-data-changed', listener);
    return () => ipcRenderer.removeListener('refs-data-changed', listener);
  },
};

contextBridge.exposeInMainWorld('popoutAPI', popoutAPI);
