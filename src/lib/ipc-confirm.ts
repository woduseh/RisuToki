import { ipcMain, BrowserWindow } from 'electron';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IpcConfirmDeps {
  getMainWindow: () => BrowserWindow | null;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: IpcConfirmDeps;
let mcpConfirmId = 0;
const mcpConfirmCallbacks: Record<number, (value: boolean | number) => void> = {};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Show MCP confirmation popup via renderer. Resolves `true` if allowed. */
export function askRendererConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve(false);
      return;
    }
    const id = ++mcpConfirmId;
    mcpConfirmCallbacks[id] = resolve as (v: boolean | number) => void;
    mainWindow.webContents.send('mcp-confirm-request', id, title, message);
    // Timeout fallback (10 min — MCP operations on large files need generous time)
    setTimeout(() => {
      if (mcpConfirmCallbacks[id]) {
        delete mcpConfirmCallbacks[id];
        resolve(false);
      }
    }, 600000);
  });
}

/** Show close-confirm popup via renderer. Resolves 0=save+close, 1=close, 2=cancel. */
export function askRendererCloseConfirm(): Promise<number> {
  return new Promise((resolve) => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve(1);
      return;
    }
    const id = ++mcpConfirmId;
    mcpConfirmCallbacks[id] = resolve as (v: boolean | number) => void;
    mainWindow.webContents.send('close-confirm-request', id);
  });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initIpcConfirm(d: IpcConfirmDeps): void {
  deps = d;

  ipcMain.on('mcp-confirm-response', (_, id: number, allowed: boolean) => {
    if (mcpConfirmCallbacks[id]) {
      mcpConfirmCallbacks[id](allowed);
      delete mcpConfirmCallbacks[id];
    }
  });

  ipcMain.on('close-confirm-response', (_, id: number, choice: number) => {
    if (mcpConfirmCallbacks[id]) {
      mcpConfirmCallbacks[id](choice);
      delete mcpConfirmCallbacks[id];
    }
  });
}
