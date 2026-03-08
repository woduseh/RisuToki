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
exports.invalidateAssetsMapCache = invalidateAssetsMapCache;
exports.initAssetManager = initAssetManager;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let deps;
let _assetsMapCache = null;
// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------
function invalidateAssetsMapCache() {
    _assetsMapCache = null;
}
// ---------------------------------------------------------------------------
// Init — register IPC handlers
// ---------------------------------------------------------------------------
function initAssetManager(d) {
    deps = d;
    electron_1.ipcMain.handle('get-asset-list', () => {
        const data = deps.getCurrentData();
        if (!data)
            return [];
        return (data.assets || []).map((a) => ({
            path: a.path,
            size: a.data.length,
        }));
    });
    electron_1.ipcMain.handle('get-asset-data', (_, assetPath) => {
        const data = deps.getCurrentData();
        if (!data)
            return null;
        const asset = data.assets.find((a) => a.path === assetPath);
        if (!asset)
            return null;
        return asset.data.toString('base64');
    });
    electron_1.ipcMain.handle('get-all-assets-map', () => {
        const data = deps.getCurrentData();
        if (!data)
            return { assets: {}, debug: 'no data' };
        if (_assetsMapCache)
            return _assetsMapCache;
        const result = {};
        const debug = {};
        // 1) risuExt.additionalAssets — [[name, dataUri], ...]
        const risuExt = data._risuExt || {};
        const additionalAssets = risuExt.additionalAssets || [];
        debug.additionalAssets = additionalAssets.length;
        for (const aa of additionalAssets) {
            if (Array.isArray(aa) && aa[0]) {
                result[aa[0]] = aa[1] || '';
            }
        }
        // 2) cardAssets (card.json data.assets) — all URI types
        const cardAssets = data.cardAssets || [];
        debug.cardAssets = cardAssets.length;
        let cardResolved = 0;
        const cardFailed = [];
        for (const ca of cardAssets) {
            const name = ca.name || '';
            if (!name || result[name])
                continue;
            const uri = ca.uri || '';
            if (uri.startsWith('ccdefault:')) {
                const zipPath = uri.slice('ccdefault:'.length);
                const asset = data.assets.find((a) => a.path === zipPath);
                if (asset) {
                    const ext = (ca.ext || 'png').toLowerCase();
                    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' :
                        ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
                    result[name] = `data:${mime};base64,${asset.data.toString('base64')}`;
                    cardResolved++;
                }
                else {
                    const targetName = zipPath.split('/').pop().replace(/\.[^.]+$/, '');
                    const fallback = data.assets.find((a) => {
                        const fn = a.path.split('/').pop().replace(/\.[^.]+$/, '');
                        return fn === targetName;
                    });
                    if (fallback) {
                        const ext = (ca.ext || 'png').toLowerCase();
                        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' :
                            ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
                        result[name] = `data:${mime};base64,${fallback.data.toString('base64')}`;
                        cardResolved++;
                    }
                    else {
                        cardFailed.push(name);
                    }
                }
            }
            else if (uri.startsWith('embeded://')) {
                const zipPath = uri.slice('embeded://'.length);
                const asset = data.assets.find((a) => a.path === zipPath);
                if (asset) {
                    const ext = (ca.ext || zipPath.split('.').pop() || 'png').toLowerCase();
                    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' :
                        ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
                    result[name] = `data:${mime};base64,${asset.data.toString('base64')}`;
                    cardResolved++;
                }
                else {
                    cardFailed.push(name);
                }
            }
            else if (uri.startsWith('data:')) {
                result[name] = uri;
                cardResolved++;
            }
            else if (uri.startsWith('http://') || uri.startsWith('https://')) {
                result[name] = uri;
                cardResolved++;
            }
            else if (uri) {
                result[name] = uri;
                cardResolved++;
            }
            else {
                cardFailed.push(name);
            }
        }
        debug.cardResolved = cardResolved;
        if (cardFailed.length > 0)
            debug.cardFailed = cardFailed.slice(0, 20);
        // 3) module.risum assets (risumAssets + module.assets metadata)
        const modAssets = data._moduleData?.module?.assets || [];
        const risumBinaries = data.risumAssets || [];
        debug.modAssets = modAssets.length;
        debug.risumBinaries = risumBinaries.length;
        if (modAssets.length > 0)
            debug.modAssetSample = JSON.stringify(modAssets[0]).substring(0, 300);
        for (let i = 0; i < modAssets.length; i++) {
            const ma = modAssets[i];
            const name = ma.name || (Array.isArray(ma) ? ma[0] : '') || '';
            if (!name || result[name])
                continue;
            const idx = typeof ma.index === 'number' ? ma.index : i;
            const bin = risumBinaries[idx];
            if (bin) {
                const ext = (ma.ext || (Array.isArray(ma) ? ma[2] : '') || 'png').toLowerCase();
                const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' :
                    ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
                result[name] = `data:${mime};base64,${Buffer.isBuffer(bin) ? bin.toString('base64') : Buffer.from(bin).toString('base64')}`;
            }
        }
        // 4) zip assets — filename-based mapping (fallback)
        debug.zipAssets = (data.assets || []).length;
        for (const asset of (data.assets || [])) {
            const fileName = asset.path.split('/').pop();
            const nameNoExt = fileName.replace(/\.[^.]+$/, '');
            if (result[nameNoExt])
                continue;
            const ext = fileName.split('.').pop().toLowerCase();
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' :
                ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
            result[nameNoExt] = `data:${mime};base64,${asset.data.toString('base64')}`;
        }
        debug.totalResolved = Object.keys(result).length;
        _assetsMapCache = { assets: result, debug };
        return _assetsMapCache;
    });
    // Add asset via file dialog
    electron_1.ipcMain.handle('add-asset', async (_, targetFolder) => {
        const data = deps.getCurrentData();
        if (!data)
            return null;
        invalidateAssetsMapCache();
        const folder = targetFolder || 'other';
        const basePath = folder === 'icon' ? 'assets/icon' : 'assets/other/image';
        const mainWin = deps.getMainWindow();
        if (!mainWin)
            return null;
        const result = await electron_1.dialog.showOpenDialog(mainWin, {
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
            properties: ['openFile', 'multiSelections'],
        });
        if (result.canceled || !result.filePaths.length)
            return null;
        const added = [];
        for (const filePath of result.filePaths) {
            const fileName = path.basename(filePath);
            const assetPath = `${basePath}/${fileName}`;
            if (data.assets.find((a) => a.path === assetPath))
                continue;
            const fileData = fs.readFileSync(filePath);
            data.assets.push({ path: assetPath, data: fileData });
            const ext = path.extname(fileName).replace('.', '').toUpperCase();
            const metaName = path.basename(fileName, path.extname(fileName));
            data.xMeta[metaName] = { type: ext === 'JPG' ? 'JPEG' : ext };
            added.push({ path: assetPath, size: fileData.length });
        }
        return added;
    });
    // Add asset from drag-dropped buffer
    electron_1.ipcMain.handle('add-asset-buffer', (_, fileName, base64Data, targetFolder) => {
        const data = deps.getCurrentData();
        if (!data)
            return null;
        invalidateAssetsMapCache();
        const folder = targetFolder || 'other';
        const basePath = folder === 'icon' ? 'assets/icon' : 'assets/other/image';
        const assetPath = `${basePath}/${fileName}`;
        if (data.assets.find((a) => a.path === assetPath))
            return null;
        const buf = Buffer.from(base64Data, 'base64');
        data.assets.push({ path: assetPath, data: buf });
        const ext = path.extname(fileName).replace('.', '').toUpperCase();
        const metaName = path.basename(fileName, path.extname(fileName));
        data.xMeta[metaName] = { type: ext === 'JPG' ? 'JPEG' : ext };
        return { path: assetPath, size: buf.length };
    });
    // Delete asset
    electron_1.ipcMain.handle('delete-asset', (_, assetPath) => {
        const data = deps.getCurrentData();
        if (!data)
            return false;
        invalidateAssetsMapCache();
        const idx = data.assets.findIndex((a) => a.path === assetPath);
        if (idx === -1)
            return false;
        data.assets.splice(idx, 1);
        return true;
    });
    // Rename asset
    electron_1.ipcMain.handle('rename-asset', (_, oldPath, newName) => {
        const data = deps.getCurrentData();
        if (!data)
            return null;
        const asset = data.assets.find((a) => a.path === oldPath);
        if (!asset)
            return null;
        const dir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
        const newPath = dir + newName;
        asset.path = newPath;
        return newPath;
    });
    // Pick background image
    electron_1.ipcMain.handle('pick-bg-image', async () => {
        const mainWin = deps.getMainWindow();
        if (!mainWin)
            return null;
        const result = await electron_1.dialog.showOpenDialog(mainWin, {
            filters: [{ name: 'Images', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp'] }],
            properties: ['openFile'],
        });
        if (result.canceled || !result.filePaths[0])
            return null;
        const filePath = result.filePaths[0];
        const data = fs.readFileSync(filePath);
        const ext = path.extname(filePath).replace('.', '').toLowerCase();
        const mime = ext === 'gif' ? 'image/gif' : ext === 'png' ? 'image/png' :
            ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mime};base64,${data.toString('base64')}`;
    });
    // Pick BGM audio file
    electron_1.ipcMain.handle('pick-bgm', async () => {
        const mainWin = deps.getMainWindow();
        if (!mainWin)
            return null;
        const result = await electron_1.dialog.showOpenDialog(mainWin, {
            filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac'] }],
            properties: ['openFile'],
        });
        if (result.canceled || !result.filePaths[0])
            return null;
        return result.filePaths[0];
    });
}
