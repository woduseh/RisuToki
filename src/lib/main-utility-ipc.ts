import { dialog, ipcMain, type BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { createPersonaStore, type PersonaStore } from './persona-store';

export interface MainUtilityIpcDeps {
  appRoot: string;
  getMainWindow: () => BrowserWindow | null;
  getMcpInfo: () => { port: number; token: string } | null;
  getUserDataPath: () => string;
  createPersonaStore?: (bundledDir: string, userDir: string) => PersonaStore;
}

export function initMainUtilityIpc(deps: MainUtilityIpcDeps): void {
  const personaStoreFactory = deps.createPersonaStore ?? createPersonaStore;
  const getPersonaStore = () =>
    personaStoreFactory(path.join(deps.appRoot, 'assets', 'persona'), path.join(deps.getUserDataPath(), 'personas'));

  ipcMain.handle('get-mcp-info', () => {
    const info = deps.getMcpInfo();
    if (!info) return null;
    return {
      ...info,
      mcpServerPath: path.join(deps.appRoot, 'toki-mcp-server.js'),
    };
  });

  ipcMain.handle('import-json', async () => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return null;

    const imported: { fileName: string; data: unknown }[] = [];
    for (const filePath of result.filePaths) {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        imported.push({ fileName: path.basename(filePath), data: JSON.parse(content) as unknown });
      } catch (error: unknown) {
        console.warn('[main] Skipping invalid reference file:', filePath, (error as Error).message);
      }
    }
    return imported;
  });

  ipcMain.handle('read-persona', async (_event, name: string) => {
    try {
      return await getPersonaStore().read(name);
    } catch (error: unknown) {
      console.warn('[main] Failed to read persona:', name, (error as Error).message);
      return null;
    }
  });

  ipcMain.handle('write-persona', async (_event, name: string, content: string) => {
    try {
      return await getPersonaStore().write(name, content);
    } catch (error: unknown) {
      console.warn('[main] Failed to write persona:', name, (error as Error).message);
      return false;
    }
  });

  ipcMain.handle('list-personas', async () => {
    try {
      return await getPersonaStore().list();
    } catch (error: unknown) {
      console.warn('[main] Failed to list personas:', (error as Error).message);
      return [];
    }
  });

  ipcMain.handle('write-system-prompt', async (_event, content: string) => {
    const tmpFile = path.join(os.tmpdir(), 'toki-system-prompt.txt');
    await fs.promises.writeFile(tmpFile, content, 'utf-8');
    return { filePath: tmpFile, platform: process.platform };
  });
}
