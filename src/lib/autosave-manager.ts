import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AutosaveManagerDeps {
  getCurrentData: () => any;
  getCurrentFilePath: () => string | null;
  getMainWindow: () => BrowserWindow | null;
  saveCharx: (filePath: string, data: any) => void;
  applyUpdates: (data: any, fields: any) => void;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: AutosaveManagerDeps;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initAutosaveManager(d: AutosaveManagerDeps): void {
  deps = d;

  ipcMain.handle('autosave-file', async (_, updatedFields: any) => {
    const currentData = deps.getCurrentData();
    if (!currentData) return { success: false, error: 'No data' };
    const customDir: string | undefined = updatedFields._autosaveDir;
    const currentFilePath = deps.getCurrentFilePath();
    if (!currentFilePath && !customDir) return { success: false, error: 'No file path and no autosave dir' };
    try {
      deps.applyUpdates(currentData, updatedFields);
      const dir = customDir || path.dirname(currentFilePath!);
      const base = currentFilePath
        ? path.basename(currentFilePath, path.extname(currentFilePath))
        : (currentData.name || 'untitled');
      const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
      const autosaveName = `${base}_autosave_${ts}.charx`;
      const autosavePath = path.join(dir, autosaveName);
      fs.mkdirSync(dir, { recursive: true });
      deps.saveCharx(autosavePath, currentData);
      return { success: true, path: autosavePath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[main] autosave error:', err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('cleanup-autosave', (_, customDir?: string) => {
    const currentFilePath = deps.getCurrentFilePath();
    if (!currentFilePath) return false;
    const dir = customDir || path.dirname(currentFilePath);
    const base = path.basename(currentFilePath, path.extname(currentFilePath));
    const prefix = `${base}_autosave_`;
    try {
      const files = fs.readdirSync(dir)
        .filter((f: string) => f.startsWith(prefix) && f.endsWith('.charx'))
        .sort().reverse();
      for (const f of files) {
        fs.unlinkSync(path.join(dir, f));
        console.log('[main] Autosave cleaned:', f);
      }
      return true;
    } catch (e: unknown) {
      console.error('[main] cleanup-autosave error:', e);
      return false;
    }
  });

  ipcMain.handle('pick-autosave-dir', async () => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '자동저장 폴더 선택',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
}
