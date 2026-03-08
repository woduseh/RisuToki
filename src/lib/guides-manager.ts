import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GuidesManagerDeps {
  getMainWindow: () => BrowserWindow | null;
  getDirname: () => string;
  broadcastRefsDataChanged: () => void;
}

export interface GuidesListResult {
  builtIn: string[];
  session: string[];
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: GuidesManagerDeps;
const sessionGuides: { filename: string; content: string }[] = [];

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function getGuidesDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath!, 'guides')
    : path.join(deps.getDirname(), 'guides');
}

export function getGuidesListResult(): GuidesListResult {
  const guidesDir = getGuidesDir();
  let builtIn: string[] = [];
  try {
    builtIn = fs.readdirSync(guidesDir).filter(f => f.endsWith('.md')).sort();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[main] Failed to read guides dir:', msg);
  }
  return {
    builtIn,
    session: sessionGuides.map(g => g.filename),
  };
}

// ---------------------------------------------------------------------------
// Init — register IPC handlers
// ---------------------------------------------------------------------------

export function initGuidesManager(d: GuidesManagerDeps): void {
  deps = d;

  ipcMain.handle('list-guides', () => {
    return getGuidesListResult();
  });

  ipcMain.handle('read-guide', (_, filename: string) => {
    const sg = sessionGuides.find(g => g.filename === filename);
    if (sg) return sg.content;
    const filePath = path.join(getGuidesDir(), filename);
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[main] Failed to read guide:', filename, msg);
      return null;
    }
  });

  ipcMain.handle('write-guide', (_, filename: string, content: string) => {
    const sg = sessionGuides.find(g => g.filename === filename);
    if (sg) { sg.content = content; return true; }
    const guidesDir = getGuidesDir();
    const filePath = path.join(guidesDir, filename);
    const existedBefore = fs.existsSync(filePath);
    try { fs.mkdirSync(guidesDir, { recursive: true }); } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[main] mkdir guides failed:', msg);
    }
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      if (!existedBefore) {
        deps.broadcastRefsDataChanged();
      }
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[main] Failed to write guide:', filename, msg);
      return false;
    }
  });

  ipcMain.handle('import-guide', async () => {
    const mainWin = deps.getMainWindow();
    if (!mainWin) return [];
    const result = await dialog.showOpenDialog(mainWin, {
      title: '가이드 파일 불러오기 (세션 전용)',
      filters: [{ name: 'Markdown / Text', extensions: ['md', 'txt'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return [];
    const imported: string[] = [];
    const guidesDir = getGuidesDir();
    let builtInNames: string[] = [];
    try { builtInNames = fs.readdirSync(guidesDir).filter(f => f.endsWith('.md')); } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[main] Failed to read guides dir for dedup:', msg);
    }
    for (const fp of result.filePaths) {
      let name = path.basename(fp);
      try {
        const content = fs.readFileSync(fp, 'utf-8');
        const ext = path.extname(name);
        const base = name.slice(0, -ext.length);
        let n = 1;
        while (builtInNames.includes(name) || sessionGuides.some(g => g.filename === name)) {
          n++;
          name = `${base} (${n})${ext}`;
        }
        sessionGuides.push({ filename: name, content });
        imported.push(name);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[main] Failed to import guide:', fp, msg);
      }
    }
    if (imported.length > 0) {
      deps.broadcastRefsDataChanged();
    }
    return imported;
  });

  ipcMain.handle('delete-guide', (_, filename: string) => {
    const sgIdx = sessionGuides.findIndex(g => g.filename === filename);
    if (sgIdx >= 0) {
      sessionGuides.splice(sgIdx, 1);
      deps.broadcastRefsDataChanged();
      return true;
    }
    const filePath = path.join(getGuidesDir(), filename);
    try {
      fs.unlinkSync(filePath);
      deps.broadcastRefsDataChanged();
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[main] Failed to delete guide:', filename, msg);
      return false;
    }
  });
}
