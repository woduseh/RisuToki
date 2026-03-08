"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPopoutWindows = getPopoutWindows;
exports.initPopoutManager = initPopoutManager;
const electron_1 = require("electron");
const path = __importStar(require("path"));
// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let deps;
const popoutWindows = {};
// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------
/** Return the live popout-window map (used by broadcastToAll in main). */
function getPopoutWindows() {
    return popoutWindows;
}
// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
function initPopoutManager(d) {
    deps = d;
    // --- Popout create / lifecycle ---
    electron_1.ipcMain.handle('popout-create', async (_, panelType, requestId) => {
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
        const popout = new electron_1.BrowserWindow({
            width: isPreview ? 420 : (isEditor ? 900 : (isTerminal ? 700 : 320)),
            height: isPreview ? 700 : (isEditor ? 700 : (isTerminal ? 500 : 650)),
            minWidth: isPreview ? 320 : (isEditor ? 400 : (isTerminal ? 300 : 200)),
            minHeight: isPreview ? 400 : 200,
            parent: mainWindow,
            frame: false,
            title: isEditor ? 'RisuToki' : (isTerminal ? 'TokiTalk' : (isRefs ? '참고자료' : '항목')),
            icon: path.join(dirname, 'assets', 'icon.png'),
            webPreferences: {
                preload: path.join(dirname, 'popout-preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
            },
        });
        const query = { type: panelType };
        if (requestId)
            query.requestId = requestId;
        deps.loadRendererPage(popout, 'popout.html', query).catch((error) => {
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
    electron_1.ipcMain.handle('set-editor-popout-data', (_, data) => {
        return deps.popoutPayloadStore.prepare('editor', data);
    });
    electron_1.ipcMain.handle('get-editor-popout-data', (_, requestId) => {
        return deps.popoutPayloadStore.waitFor('editor', requestId);
    });
    electron_1.ipcMain.on('editor-popout-change', (_, tabId, content) => {
        const mw = deps.getMainWindow();
        if (mw && !mw.isDestroyed()) {
            mw.webContents.send('editor-popout-change', tabId, content);
        }
    });
    electron_1.ipcMain.on('editor-popout-save', () => {
        const mw = deps.getMainWindow();
        if (mw && !mw.isDestroyed()) {
            mw.webContents.send('editor-popout-save');
        }
    });
    // --- Dock / close ---
    electron_1.ipcMain.handle('popout-dock', (event) => {
        for (const [type, win] of Object.entries(popoutWindows)) {
            if (win && !win.isDestroyed() && win.webContents === event.sender) {
                win.close();
                return type;
            }
        }
        return null;
    });
    electron_1.ipcMain.handle('popout-close', (_, panelType) => {
        if (popoutWindows[panelType] && !popoutWindows[panelType].isDestroyed()) {
            popoutWindows[panelType].close();
        }
        return true;
    });
    // --- Preview popout data relay ---
    electron_1.ipcMain.handle('set-preview-popout-data', (_, data) => {
        return deps.popoutPayloadStore.prepare('preview', data);
    });
    electron_1.ipcMain.handle('get-preview-popout-data', (_, requestId) => {
        return deps.popoutPayloadStore.waitFor('preview', requestId);
    });
    // --- Guides path ---
    electron_1.ipcMain.handle('get-guides-path', () => {
        return deps.getGuidesDir();
    });
    // --- Sidebar popout ---
    electron_1.ipcMain.handle('popout-sidebar-data', () => {
        const currentData = deps.getCurrentData();
        if (!currentData)
            return { items: [] };
        const items = [];
        // Lua
        items.push({ label: 'Lua (통합)', icon: '{}', id: 'lua', indent: 0 });
        // Singles
        const singles = [
            { id: 'globalNote', label: '글로벌노트', icon: '📝' },
            { id: 'firstMessage', label: '첫 메시지', icon: '💬' },
            { id: 'assetPromptTemplate', label: '에셋 프롬프트 템플릿', icon: '🖼️' },
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
                if (entry.mode === 'folder')
                    continue;
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
    electron_1.ipcMain.on('popout-sidebar-click', (_, itemId) => {
        const mw = deps.getMainWindow();
        if (mw && !mw.isDestroyed()) {
            mw.webContents.send('popout-sidebar-click', itemId);
        }
    });
    // --- Refs popout ---
    electron_1.ipcMain.handle('popout-refs-data', () => {
        return deps.buildRefsPopoutData(deps.getGuidesListResult(), deps.getReferenceFiles());
    });
    electron_1.ipcMain.on('popout-refs-click', (_, tabId) => {
        const mw = deps.getMainWindow();
        if (mw && !mw.isDestroyed()) {
            mw.webContents.send('popout-refs-click', tabId);
        }
    });
}
