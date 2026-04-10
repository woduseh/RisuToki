import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { normalizeFolderRef } from './lorebook-folders';
import { extToMime } from './shared-utils';

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
          const mime = extToMime(ext);
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
            const mime = extToMime(ext);
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
          const mime = extToMime(ext);
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
        const mime = extToMime(ext);
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
      const mime = extToMime(ext);
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

  // Export lorebook to files (UI dialog)
  ipcMain.handle('export-lorebook', async (_, opts?: { format?: 'md' | 'json'; groupByFolder?: boolean }) => {
    const data = deps.getCurrentData();
    if (!data || !data.lorebook) {
      return { ok: false, error: 'No lorebook data' };
    }

    const mainWin = deps.getMainWindow();
    if (!mainWin) return { ok: false, error: 'No window' };

    const result = await dialog.showOpenDialog(mainWin, {
      title: '로어북 내보내기 폴더 선택',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'Cancelled' };

    try {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const mod = require('./lorebook-io') as typeof import('./lorebook-io');
      /* eslint-enable @typescript-eslint/no-require-imports */
      const format = opts?.format || 'md';
      const exportOpts = {
        format: format as 'md' | 'json',
        groupByFolder: opts?.groupByFolder !== false,
        includeMetadata: true,
        sourceName: String(data.name || 'unknown'),
      };
      const exportResult =
        format === 'json'
          ? await mod.exportToJson(data.lorebook, result.filePaths[0], exportOpts)
          : await mod.exportToMarkdown(data.lorebook, result.filePaths[0], exportOpts);
      return { ok: true, ...exportResult };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Import lorebook from files (UI dialog)
  ipcMain.handle(
    'import-lorebook',
    async (
      _,
      opts?: { format?: 'md' | 'json'; conflict?: 'skip' | 'overwrite' | 'rename'; createFolders?: boolean },
    ) => {
      const data = deps.getCurrentData();
      if (!data) return { ok: false, error: 'No file open' };

      const mainWin = deps.getMainWindow();
      if (!mainWin) return { ok: false, error: 'No window' };

      const format = opts?.format || 'md';
      let sourcePath: string;

      if (format === 'json') {
        const result = await dialog.showOpenDialog(mainWin, {
          title: '로어북 JSON 파일 선택',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile'],
        });
        if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'Cancelled' };
        sourcePath = result.filePaths[0];
      } else {
        const result = await dialog.showOpenDialog(mainWin, {
          title: '로어북 마크다운 폴더 선택',
          properties: ['openDirectory'],
        });
        if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'Cancelled' };
        sourcePath = result.filePaths[0];
      }

      try {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const mod = require('./lorebook-io') as typeof import('./lorebook-io');
        /* eslint-enable @typescript-eslint/no-require-imports */

        const importEntries =
          format === 'json' ? await mod.importFromJson(sourcePath) : await mod.importFromMarkdown(sourcePath);

        if (importEntries.length === 0) return { ok: true, imported: 0, message: 'No entries found' };

        if (!data.lorebook) data.lorebook = [];
        const existingFolderMap = mod.buildFolderMap(data.lorebook);
        const resolution = mod.resolveImportConflicts(importEntries, data.lorebook, existingFolderMap, {
          conflict: opts?.conflict || 'skip',
          createFolders: opts?.createFolders !== false,
        });

        // Create new folders
        const allFolderByName = new Map<string, string>();
        for (const [id, name] of existingFolderMap) allFolderByName.set(name, id);
        for (const folderName of resolution.newFolders) {
          const folderId = crypto.randomUUID();
          data.lorebook.push({
            comment: folderName,
            key: normalizeFolderRef(folderId),
            content: '',
            mode: 'folder',
            insertorder: 100,
            folder: '',
          });
          allFolderByName.set(folderName, normalizeFolderRef(folderId));
        }

        // Add entries with folder assignment
        for (const entry of resolution.toAdd) {
          const ie = importEntries.find((x) => x.data === entry || x.data.comment === entry.comment);
          if (ie?.folderName) {
            const fId = allFolderByName.get(ie.folderName);
            if (fId) entry.folder = normalizeFolderRef(fId);
          }
          data.lorebook.push(entry);
        }

        // Overwrite existing
        for (const { index, data: newData } of resolution.toOverwrite) {
          Object.assign(data.lorebook[index], newData);
        }

        return {
          ok: true,
          imported: resolution.toAdd.length,
          overwritten: resolution.toOverwrite.length,
          skipped: resolution.skipped.length,
          foldersCreated: resolution.newFolders.length,
        };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  // Export field to file (UI dialog)
  ipcMain.handle('export-field', async (_, field: string, format?: 'md' | 'txt') => {
    const data = deps.getCurrentData();
    if (!data) return { ok: false, error: 'No file open' };

    const value = (data as Record<string, unknown>)[field];
    if (value === undefined || value === null) return { ok: false, error: `Field "${field}" not found` };

    const mainWin = deps.getMainWindow();
    if (!mainWin) return { ok: false, error: 'No window' };

    const ext = format === 'md' ? 'md' : 'txt';
    const result = await dialog.showSaveDialog(mainWin, {
      title: `"${field}" 필드 내보내기`,
      defaultPath: `${field}.${ext}`,
      filters: [{ name: ext === 'md' ? 'Markdown' : 'Text', extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, error: 'Cancelled' };

    try {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const mod = require('./lorebook-io') as typeof import('./lorebook-io');
      /* eslint-enable @typescript-eslint/no-require-imports */
      const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      const exportResult = await mod.exportFieldToFile(field, content, result.filePath, format || 'txt');
      return { ok: true, ...exportResult };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
    const mime = extToMime(ext);
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
