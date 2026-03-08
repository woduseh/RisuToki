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
exports.getGuidesDir = getGuidesDir;
exports.getGuidesListResult = getGuidesListResult;
exports.initGuidesManager = initGuidesManager;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let deps;
const sessionGuides = [];
// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------
function getGuidesDir() {
    return electron_1.app.isPackaged
        ? path.join(process.resourcesPath, 'guides')
        : path.join(deps.getDirname(), 'guides');
}
function getGuidesListResult() {
    const guidesDir = getGuidesDir();
    let builtIn = [];
    try {
        builtIn = fs.readdirSync(guidesDir).filter(f => f.endsWith('.md')).sort();
    }
    catch (e) {
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
function initGuidesManager(d) {
    deps = d;
    electron_1.ipcMain.handle('list-guides', () => {
        return getGuidesListResult();
    });
    electron_1.ipcMain.handle('read-guide', (_, filename) => {
        const sg = sessionGuides.find(g => g.filename === filename);
        if (sg)
            return sg.content;
        const filePath = path.join(getGuidesDir(), filename);
        try {
            return fs.readFileSync(filePath, 'utf-8');
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn('[main] Failed to read guide:', filename, msg);
            return null;
        }
    });
    electron_1.ipcMain.handle('write-guide', (_, filename, content) => {
        const sg = sessionGuides.find(g => g.filename === filename);
        if (sg) {
            sg.content = content;
            return true;
        }
        const guidesDir = getGuidesDir();
        const filePath = path.join(guidesDir, filename);
        const existedBefore = fs.existsSync(filePath);
        try {
            fs.mkdirSync(guidesDir, { recursive: true });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn('[main] mkdir guides failed:', msg);
        }
        try {
            fs.writeFileSync(filePath, content, 'utf-8');
            if (!existedBefore) {
                deps.broadcastRefsDataChanged();
            }
            return true;
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn('[main] Failed to write guide:', filename, msg);
            return false;
        }
    });
    electron_1.ipcMain.handle('import-guide', async () => {
        const mainWin = deps.getMainWindow();
        if (!mainWin)
            return [];
        const result = await electron_1.dialog.showOpenDialog(mainWin, {
            title: '가이드 파일 불러오기 (세션 전용)',
            filters: [{ name: 'Markdown / Text', extensions: ['md', 'txt'] }],
            properties: ['openFile', 'multiSelections'],
        });
        if (result.canceled || !result.filePaths.length)
            return [];
        const imported = [];
        const guidesDir = getGuidesDir();
        let builtInNames = [];
        try {
            builtInNames = fs.readdirSync(guidesDir).filter(f => f.endsWith('.md'));
        }
        catch (e) {
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
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.warn('[main] Failed to import guide:', fp, msg);
            }
        }
        if (imported.length > 0) {
            deps.broadcastRefsDataChanged();
        }
        return imported;
    });
    electron_1.ipcMain.handle('delete-guide', (_, filename) => {
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
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn('[main] Failed to delete guide:', filename, msg);
            return false;
        }
    });
}
