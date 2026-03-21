import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AssetManagerDeps {
  getCurrentData: () => any;
  getMainWindow: () => BrowserWindow | null;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: AssetManagerDeps;
let _assetsMapCache: { assets: Record<string, string>; debug: Record<string, any> } | null = null;

// ---------------------------------------------------------------------------
// MIME helpers
// ---------------------------------------------------------------------------

function getMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/jpeg';
  }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function invalidateAssetsMapCache(): void {
  _assetsMapCache = null;
}

// ---------------------------------------------------------------------------
// Init — register IPC handlers
// ---------------------------------------------------------------------------

export function initAssetManager(d: AssetManagerDeps): void {
  deps = d;

  ipcMain.handle('get-asset-list', () => {
    const data = deps.getCurrentData();
    if (!data) return [];
    return (data.assets || []).map((a: any) => ({
      path: a.path,
      size: a.data.length,
    }));
  });

  ipcMain.handle('get-asset-data', (_, assetPath: string) => {
    const data = deps.getCurrentData();
    if (!data) return null;
    const asset = data.assets.find((a: any) => a.path === assetPath);
    if (!asset) return null;
    return asset.data.toString('base64');
  });

  ipcMain.handle('get-all-assets-map', () => {
    const data = deps.getCurrentData();
    if (!data) return { assets: {}, debug: 'no data' };
    if (_assetsMapCache) return _assetsMapCache;
    const result: Record<string, string> = {};
    const debug: Record<string, any> = {};

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
    const cardFailed: string[] = [];
    for (const ca of cardAssets) {
      const name = ca.name || '';
      if (!name || result[name]) continue;
      const uri: string = ca.uri || '';
      if (uri.startsWith('ccdefault:')) {
        const zipPath = uri.slice('ccdefault:'.length);
        const asset = data.assets.find((a: any) => a.path === zipPath);
        if (asset) {
          const ext = (ca.ext || 'png').toLowerCase();
          const mime = getMimeType(ext);
          result[name] = `data:${mime};base64,${asset.data.toString('base64')}`;
          cardResolved++;
        } else {
          const targetName = zipPath
            .split('/')
            .pop()!
            .replace(/\.[^.]+$/, '');
          const fallback = data.assets.find((a: any) => {
            const fn = a.path
              .split('/')
              .pop()!
              .replace(/\.[^.]+$/, '');
            return fn === targetName;
          });
          if (fallback) {
            const ext = (ca.ext || 'png').toLowerCase();
            const mime = getMimeType(ext);
            result[name] = `data:${mime};base64,${fallback.data.toString('base64')}`;
            cardResolved++;
          } else {
            cardFailed.push(name);
          }
        }
      } else if (uri.startsWith('embeded://')) {
        const zipPath = uri.slice('embeded://'.length);
        const asset = data.assets.find((a: any) => a.path === zipPath);
        if (asset) {
          const ext = (ca.ext || zipPath.split('.').pop() || 'png').toLowerCase();
          const mime = getMimeType(ext);
          result[name] = `data:${mime};base64,${asset.data.toString('base64')}`;
          cardResolved++;
        } else {
          cardFailed.push(name);
        }
      } else if (uri.startsWith('data:')) {
        result[name] = uri;
        cardResolved++;
      } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
        result[name] = uri;
        cardResolved++;
      } else if (uri) {
        result[name] = uri;
        cardResolved++;
      } else {
        cardFailed.push(name);
      }
    }
    debug.cardResolved = cardResolved;
    if (cardFailed.length > 0) debug.cardFailed = cardFailed.slice(0, 20);

    // 3) module.risum assets (risumAssets + module.assets metadata)
    const modAssets = data._moduleData?.module?.assets || [];
    const risumBinaries = data.risumAssets || [];
    debug.modAssets = modAssets.length;
    debug.risumBinaries = risumBinaries.length;
    if (modAssets.length > 0) debug.modAssetSample = JSON.stringify(modAssets[0]).substring(0, 300);
    for (let i = 0; i < modAssets.length; i++) {
      const ma = modAssets[i];
      const name = ma.name || (Array.isArray(ma) ? ma[0] : '') || '';
      if (!name || result[name]) continue;
      const idx = typeof ma.index === 'number' ? ma.index : i;
      const bin = risumBinaries[idx];
      if (bin) {
        const ext = (ma.ext || (Array.isArray(ma) ? ma[2] : '') || 'png').toLowerCase();
        const mime = getMimeType(ext);
        result[name] =
          `data:${mime};base64,${Buffer.isBuffer(bin) ? bin.toString('base64') : Buffer.from(bin).toString('base64')}`;
      }
    }

    // 4) zip assets — filename-based mapping (fallback)
    debug.zipAssets = (data.assets || []).length;
    for (const asset of data.assets || []) {
      const fileName: string = asset.path.split('/').pop()!;
      const nameNoExt = fileName.replace(/\.[^.]+$/, '');
      if (result[nameNoExt]) continue;
      const ext = fileName.split('.').pop()!.toLowerCase();
      const mime = getMimeType(ext);
      result[nameNoExt] = `data:${mime};base64,${asset.data.toString('base64')}`;
    }

    debug.totalResolved = Object.keys(result).length;

    _assetsMapCache = { assets: result, debug };
    return _assetsMapCache;
  });

  // Add asset via file dialog
  ipcMain.handle('add-asset', async (_, targetFolder: string) => {
    const data = deps.getCurrentData();
    if (!data) return null;
    invalidateAssetsMapCache();
    const folder = targetFolder || 'other';
    const basePath = folder === 'icon' ? 'assets/icon' : 'assets/other/image';
    const mainWin = deps.getMainWindow();
    if (!mainWin) return null;
    const result = await dialog.showOpenDialog(mainWin, {
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return null;

    const added: { path: string; size: number }[] = [];
    for (const filePath of result.filePaths) {
      const fileName = path.basename(filePath);
      const assetPath = `${basePath}/${fileName}`;
      if (data.assets.find((a: any) => a.path === assetPath)) continue;
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
  ipcMain.handle('add-asset-buffer', (_, fileName: string, base64Data: string, targetFolder: string) => {
    const data = deps.getCurrentData();
    if (!data) return null;
    invalidateAssetsMapCache();
    const folder = targetFolder || 'other';
    const basePath = folder === 'icon' ? 'assets/icon' : 'assets/other/image';
    const assetPath = `${basePath}/${fileName}`;
    if (data.assets.find((a: any) => a.path === assetPath)) return null;
    const buf = Buffer.from(base64Data, 'base64');
    data.assets.push({ path: assetPath, data: buf });
    const ext = path.extname(fileName).replace('.', '').toUpperCase();
    const metaName = path.basename(fileName, path.extname(fileName));
    data.xMeta[metaName] = { type: ext === 'JPG' ? 'JPEG' : ext };
    return { path: assetPath, size: buf.length };
  });

  // Delete asset
  ipcMain.handle('delete-asset', (_, assetPath: string) => {
    const data = deps.getCurrentData();
    if (!data) return false;
    invalidateAssetsMapCache();
    const idx = data.assets.findIndex((a: any) => a.path === assetPath);
    if (idx === -1) return false;
    data.assets.splice(idx, 1);
    return true;
  });

  // Rename asset
  ipcMain.handle('rename-asset', (_, oldPath: string, newName: string) => {
    const data = deps.getCurrentData();
    if (!data) return null;
    const asset = data.assets.find((a: any) => a.path === oldPath);
    if (!asset) return null;
    const dir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
    const newPath = dir + newName;
    asset.path = newPath;
    return newPath;
  });

  // Reorder asset (move within same folder group)
  ipcMain.handle('reorder-asset', (_, fromPath: string, toIdx: number) => {
    const data = deps.getCurrentData();
    if (!data || !data.assets) return false;
    const fromIdx = data.assets.findIndex((a: any) => a.path === fromPath);
    if (fromIdx === -1) return false;
    // Determine folder group (e.g., "icon" or "other")
    const fromParts = data.assets[fromIdx].path.split('/');
    const fromGroup = fromParts[1] === 'icon' ? 'icon' : 'other';
    // Build group-local indices
    const groupIndices: number[] = [];
    for (let i = 0; i < data.assets.length; i++) {
      const parts = data.assets[i].path.split('/');
      const group = parts[1] === 'icon' ? 'icon' : 'other';
      if (group === fromGroup) groupIndices.push(i);
    }
    const localFrom = groupIndices.indexOf(fromIdx);
    if (localFrom === -1 || toIdx < 0 || toIdx >= groupIndices.length) return false;
    if (localFrom === toIdx) return false;
    // Perform the move
    const [item] = data.assets.splice(fromIdx, 1);
    // Recalculate target absolute index after removal
    const adjustedGroupIndices: number[] = [];
    for (let i = 0; i < data.assets.length; i++) {
      const parts = data.assets[i].path.split('/');
      const group = parts[1] === 'icon' ? 'icon' : 'other';
      if (group === fromGroup) adjustedGroupIndices.push(i);
    }
    const targetAbsIdx =
      toIdx < adjustedGroupIndices.length
        ? adjustedGroupIndices[toIdx]
        : adjustedGroupIndices.length > 0
          ? adjustedGroupIndices[adjustedGroupIndices.length - 1] + 1
          : data.assets.length;
    data.assets.splice(targetAbsIdx, 0, item);
    return true;
  });

  // Compress all image assets to WebP
  ipcMain.handle('compress-assets-webp', async (_, opts?: { quality?: number; recompressWebp?: boolean }) => {
    const data = deps.getCurrentData();
    if (!data || !data.assets || data.assets.length === 0) {
      return { ok: false, error: 'No assets found' };
    }

    try {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const mod = require('./image-compressor') as typeof import('./image-compressor');
      /* eslint-enable @typescript-eslint/no-require-imports */
      const { compressAssetsToWebP, updateAssetReferences } = mod;

      const result = await compressAssetsToWebP(data.assets, {
        quality: opts?.quality ?? 80,
        recompressWebp: opts?.recompressWebp ?? false,
      });

      // Build path map for reference updates
      const pathMap = new Map<string, string>();
      for (const d of result.details) {
        if (d.status === 'converted' && d.originalPath !== d.newPath) {
          pathMap.set(d.originalPath, d.newPath);
        }
      }

      data.assets = result.assets;

      if (pathMap.size > 0) {
        updateAssetReferences(pathMap, data.cardAssets || [], data.xMeta || {});
      }

      invalidateAssetsMapCache();
      return { ok: true, stats: result.stats };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // Pick background image
  ipcMain.handle('pick-bg-image', async () => {
    const mainWin = deps.getMainWindow();
    if (!mainWin) return null;
    const result = await dialog.showOpenDialog(mainWin, {
      filters: [{ name: 'Images', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).replace('.', '').toLowerCase();
    const mime =
      ext === 'gif' ? 'image/gif' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${data.toString('base64')}`;
  });

  // Pick BGM audio file
  ipcMain.handle('pick-bgm', async () => {
    const mainWin = deps.getMainWindow();
    if (!mainWin) return null;
    const result = await dialog.showOpenDialog(mainWin, {
      filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
}
