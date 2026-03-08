import { ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PopoutManagerDeps {
  getMainWindow: () => BrowserWindow | null;
  getCurrentData: () => any;
  getReferenceFiles: () => any[];
  loadRendererPage: (windowRef: BrowserWindow, entryFile: string, query?: Record<string, string>) => Promise<void>;
  getGuidesDir: () => string;
  getGuidesListResult: () => any;
  buildRefsPopoutData: (guidesListResult: any, referenceFiles: any[]) => any;
  getDirname: () => string;
  popoutPayloadStore: {
    prepare: (type: string, data: any) => string;
    waitFor: (type: string, requestId: string) => Promise<any>;
    clear: (type: string, requestId?: string) => void;
  };
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: PopoutManagerDeps;
const popoutWindows: Record<string, BrowserWindow> = {};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Return the live popout-window map (used by broadcastToAll in main). */
export function getPopoutWindows(): Record<string, BrowserWindow> {
  return popoutWindows;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initPopoutManager(d: PopoutManagerDeps): void {
  deps = d;

  // --- Popout create / lifecycle ---

  ipcMain.handle('popout-create', async (_, panelType: string, requestId?: string) => {
    if (popoutWindows[panelType] && !popoutWindows[panelType].isDestroyed()) {
      popoutWindows[panelType].close();
      delete popoutWindows[panelType];
    }

    const isTerminal = panelType === 'terminal';
    const isEditor = panelType === 'editor';
    const isPreview = panelType === 'preview';
    const isRefs = panelType === 'refs';
    if ((isEditor || isPreview) && !requestId) {
      console.warn(`[main] missing popout payload requestId for ${panelType}`);
      return false;
    }

    const dirname = deps.getDirname();
    const mainWindow = deps.getMainWindow();
    const popout = new BrowserWindow({
      width: isPreview ? 420 : isEditor ? 900 : isTerminal ? 700 : 320,
      height: isPreview ? 700 : isEditor ? 700 : isTerminal ? 500 : 650,
      minWidth: isPreview ? 320 : isEditor ? 400 : isTerminal ? 300 : 200,
      minHeight: isPreview ? 400 : 200,
      parent: mainWindow!,
      frame: false,
      title: isEditor ? 'RisuToki' : isTerminal ? 'TokiTalk' : isRefs ? '참고자료' : '항목',
      icon: path.join(dirname, 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(dirname, 'popout-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const query: Record<string, string> = { type: panelType };
    if (requestId) query.requestId = requestId;
    deps.loadRendererPage(popout, 'popout.html', query).catch((error: unknown) => {
      console.error(`Failed to load ${panelType} popout`, error);
    });

    popoutWindows[panelType] = popout;

    popout.on('closed', () => {
      delete popoutWindows[panelType];
      if (panelType === 'editor' || panelType === 'preview') {
        deps.popoutPayloadStore.clear(panelType, requestId);
      }
      const mw = deps.getMainWindow();
      if (mw && !mw.isDestroyed()) {
        mw.webContents.send('popout-closed', panelType);
      }
    });

    return true;
  });

  // --- Editor popout data relay ---

  ipcMain.handle('set-editor-popout-data', (_, data: any) => {
    return deps.popoutPayloadStore.prepare('editor', data);
  });

  ipcMain.handle('get-editor-popout-data', (_, requestId: string) => {
    return deps.popoutPayloadStore.waitFor('editor', requestId);
  });

  ipcMain.on('editor-popout-change', (_, tabId: string, content: string) => {
    const mw = deps.getMainWindow();
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('editor-popout-change', tabId, content);
    }
  });

  ipcMain.on('editor-popout-save', () => {
    const mw = deps.getMainWindow();
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('editor-popout-save');
    }
  });

  // --- Dock / close ---

  ipcMain.handle('popout-dock', (event) => {
    for (const [type, win] of Object.entries(popoutWindows)) {
      if (win && !win.isDestroyed() && win.webContents === event.sender) {
        win.close();
        return type;
      }
    }
    return null;
  });

  ipcMain.handle('popout-close', (_, panelType: string) => {
    if (popoutWindows[panelType] && !popoutWindows[panelType].isDestroyed()) {
      popoutWindows[panelType].close();
    }
    return true;
  });

  // --- Preview popout data relay ---

  ipcMain.handle('set-preview-popout-data', (_, data: any) => {
    return deps.popoutPayloadStore.prepare('preview', data);
  });

  ipcMain.handle('get-preview-popout-data', (_, requestId: string) => {
    return deps.popoutPayloadStore.waitFor('preview', requestId);
  });

  // --- Guides path ---

  ipcMain.handle('get-guides-path', () => {
    return deps.getGuidesDir();
  });

  // --- Sidebar popout ---

  ipcMain.handle('popout-sidebar-data', () => {
    const currentData = deps.getCurrentData();
    if (!currentData) return { items: [] };

    const items: any[] = [];

    // Lua
    items.push({ label: 'Lua (통합)', icon: '{}', id: 'lua', indent: 0 });

    // Singles
    const singles = [
      { id: 'globalNote', label: '글로벌노트', icon: '📝' },
      { id: 'firstMessage', label: '첫 메시지', icon: '💬' },
      { id: 'triggerScripts', label: '트리거 스크립트', icon: '🪝' },
      { id: 'alternateGreetings', label: '추가 첫 메시지', icon: '💭' },
      { id: 'groupOnlyGreetings', label: '그룹 첫 메시지', icon: '👥' },
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
          indent: 1,
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
          indent: 1,
        });
      }
    }

    return { items };
  });

  ipcMain.on('popout-sidebar-click', (_, itemId: string) => {
    const mw = deps.getMainWindow();
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('popout-sidebar-click', itemId);
    }
  });

  // --- Refs popout ---

  ipcMain.handle('popout-refs-data', () => {
    return deps.buildRefsPopoutData(deps.getGuidesListResult(), deps.getReferenceFiles());
  });

  ipcMain.on('popout-refs-click', (_, tabId: string) => {
    const mw = deps.getMainWindow();
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('popout-refs-click', tabId);
    }
  });
}
