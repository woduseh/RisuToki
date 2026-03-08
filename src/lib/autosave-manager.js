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
exports.initAutosaveManager = initAutosaveManager;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let deps;
// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
function initAutosaveManager(d) {
    deps = d;
    electron_1.ipcMain.handle('autosave-file', async (_, updatedFields) => {
        const currentData = deps.getCurrentData();
        if (!currentData)
            return { success: false, error: 'No data' };
        const customDir = updatedFields._autosaveDir;
        const currentFilePath = deps.getCurrentFilePath();
        if (!currentFilePath && !customDir)
            return { success: false, error: 'No file path and no autosave dir' };
        try {
            deps.applyUpdates(currentData, updatedFields);
            const dir = customDir || path.dirname(currentFilePath);
            const base = currentFilePath
                ? path.basename(currentFilePath, path.extname(currentFilePath))
                : (currentData.name || 'untitled');
            const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
            const autosaveName = `${base}_autosave_${ts}.charx`;
            const autosavePath = path.join(dir, autosaveName);
            fs.mkdirSync(dir, { recursive: true });
            deps.saveCharx(autosavePath, currentData);
            return { success: true, path: autosavePath };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[main] autosave error:', err);
            return { success: false, error: message };
        }
    });
    electron_1.ipcMain.handle('cleanup-autosave', (_, customDir) => {
        const currentFilePath = deps.getCurrentFilePath();
        if (!currentFilePath)
            return false;
        const dir = customDir || path.dirname(currentFilePath);
        const base = path.basename(currentFilePath, path.extname(currentFilePath));
        const prefix = `${base}_autosave_`;
        try {
            const files = fs.readdirSync(dir)
                .filter((f) => f.startsWith(prefix) && f.endsWith('.charx'))
                .sort().reverse();
            for (const f of files) {
                fs.unlinkSync(path.join(dir, f));
                console.log('[main] Autosave cleaned:', f);
            }
            return true;
        }
        catch (e) {
            console.error('[main] cleanup-autosave error:', e);
            return false;
        }
    });
    electron_1.ipcMain.handle('pick-autosave-dir', async () => {
        const mainWindow = deps.getMainWindow();
        if (!mainWindow)
            return null;
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: '자동저장 폴더 선택',
            properties: ['openDirectory'],
        });
        if (result.canceled || !result.filePaths.length)
            return null;
        return result.filePaths[0];
    });
}
