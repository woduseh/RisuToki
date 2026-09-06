import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { deserialize, serialize } from 'node:v8';
import { isDeepStrictEqual } from 'node:util';

import { normalizeFolderRef } from './lorebook-folders';
import { serializeActiveDocument } from './renderer-document-state';
import { buildPreviewAssets, buildPreviewAssetInventory, type PreviewAssetsResult } from './preview-assets';
import { extToMime } from './shared-utils';
import { addAssetReferences, deleteAssetReferences, renameAssetReferences, validateAssetFileName } from './asset-utils';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AssetManagerDeps {
  getCurrentData: () => any;
  getMainWindow: () => BrowserWindow | null;
  onAssetsChanged?: () => void;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: AssetManagerDeps;
let _assetsMapCache: PreviewAssetsResult | null = null;

interface AssetBatchRenameOperation {
  oldPath: string;
  newName: string;
}

interface PlannedAssetRename {
  oldPath: string;
  newPath: string;
  newName: string;
}

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot).toLowerCase() : '';
}

function planAssetRenameOperations(
  data: any,
  operations: AssetBatchRenameOperation[],
): {
  planned: PlannedAssetRename[];
  conflicts: string[];
} {
  const assets = Array.isArray(data?.assets) ? data.assets : [];
  const selectedPaths = new Set(operations.map((operation) => operation.oldPath));
  const selectedPathLower = new Set([...selectedPaths].map((assetPath) => assetPath.toLowerCase()));
  const seenOldPaths = new Set<string>();
  const plannedPaths = new Set<string>();
  const planned: PlannedAssetRename[] = [];
  const conflicts: string[] = [];

  for (const operation of operations) {
    const oldPath = typeof operation.oldPath === 'string' ? operation.oldPath : '';
    const newName = typeof operation.newName === 'string' ? operation.newName.trim() : '';
    const asset = assets.find((item: any) => item.path === oldPath);
    const originalName = oldPath.split('/').pop() || oldPath;

    if (!oldPath || !asset) {
      conflicts.push(`${oldPath || '(unknown)'}: 에셋을 찾을 수 없습니다.`);
      continue;
    }
    if (seenOldPaths.has(oldPath)) {
      conflicts.push(`${oldPath}: 중복된 변경 요청입니다.`);
      continue;
    }
    seenOldPaths.add(oldPath);
    if (!newName) {
      conflicts.push(`${originalName}: 새 이름이 비어 있습니다.`);
      continue;
    }
    if (validateAssetFileName(newName)) {
      conflicts.push(`${newName}: 파일명에 사용할 수 없는 문자가 있습니다.`);
      continue;
    }

    const oldExtension = fileExtension(originalName);
    const newExtension = fileExtension(newName);
    if (oldExtension !== newExtension) {
      conflicts.push(`${newName}: 확장자는 ${oldExtension || '(없음)'} 그대로 유지해야 합니다.`);
      continue;
    }

    const dir = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/') + 1) : '';
    const newPath = `${dir}${newName}`;
    const normalizedNewPath = newPath.toLowerCase();

    if (plannedPaths.has(normalizedNewPath)) {
      conflicts.push(`${newName}: 일괄 변경 결과끼리 중복됩니다.`);
      continue;
    }
    if (selectedPathLower.has(normalizedNewPath) && normalizedNewPath !== oldPath.toLowerCase()) {
      conflicts.push(`${newName}: 선택된 다른 에셋의 기존 경로와 충돌합니다.`);
      continue;
    }
    if (assets.some((item: any) => item !== asset && item.path.toLowerCase() === normalizedNewPath)) {
      conflicts.push(`${newName}: 같은 경로에 이미 존재합니다.`);
      continue;
    }

    plannedPaths.add(normalizedNewPath);
    planned.push({ oldPath, newPath, newName });
  }

  return { planned, conflicts };
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
  const notifyAssetsChanged = (data: any): void => {
    invalidateAssetsMapCache();
    if (deps.getCurrentData() === data) deps.onAssetsChanged?.();
  };

  ipcMain.handle('get-asset-list', () => {
    const data = deps.getCurrentData();
    if (!data) return [];
    return (data.assets || []).map((a: any) => ({
      path: a.path,
      size: a.data.length,
    }));
  });

  ipcMain.handle('get-preview-asset-inventory', () => {
    const data = deps.getCurrentData();
    return {
      ...buildPreviewAssetInventory(data || {}),
      documentId: data ? serializeActiveDocument(data)._documentId : null,
    };
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
    _assetsMapCache = buildPreviewAssets(data);
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
    if (deps.getCurrentData() !== data) return null;

    const added: { path: string; size: number }[] = [];
    const pending: { path: string; data: Buffer }[] = [];
    for (const filePath of result.filePaths) {
      const fileName = path.basename(filePath);
      if (validateAssetFileName(fileName)) continue;
      const assetPath = `${basePath}/${fileName}`;
      if (data.assets.find((a: any) => a.path === assetPath) || pending.some((asset) => asset.path === assetPath))
        continue;
      const fileData = fs.readFileSync(filePath);
      pending.push({ path: assetPath, data: fileData });
    }
    for (const asset of pending) {
      data.assets.push(asset);
      addAssetReferences(data, asset.path, folder === 'icon' ? 'icon' : 'other');
      added.push({ path: asset.path, size: asset.data.length });
    }
    if (added.length) notifyAssetsChanged(data);
    return added;
  });

  // Add asset from drag-dropped buffer
  ipcMain.handle('add-asset-buffer', (_, fileName: string, base64Data: string, targetFolder: string) => {
    const data = deps.getCurrentData();
    if (!data) return null;
    if (validateAssetFileName(fileName)) return null;
    invalidateAssetsMapCache();
    const folder = targetFolder || 'other';
    const basePath = folder === 'icon' ? 'assets/icon' : 'assets/other/image';
    const assetPath = `${basePath}/${fileName}`;
    if (data.assets.find((a: any) => a.path === assetPath)) return null;
    const buf = Buffer.from(base64Data, 'base64');
    data.assets.push({ path: assetPath, data: buf });
    addAssetReferences(data, assetPath, folder === 'icon' ? 'icon' : 'other');
    notifyAssetsChanged(data);
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
    deleteAssetReferences(data, assetPath);
    notifyAssetsChanged(data);
    return true;
  });

  // Delete multiple assets in one cache invalidation/update pass
  ipcMain.handle('delete-assets', (_, assetPaths: string[]) => {
    const data = deps.getCurrentData();
    if (!data || !Array.isArray(assetPaths)) return false;
    invalidateAssetsMapCache();
    const targets = new Set(assetPaths);
    const removed = data.assets.filter((a: any) => targets.has(a.path));
    if (!removed.length) return false;
    data.assets = data.assets.filter((a: any) => !targets.has(a.path));
    for (const asset of removed) deleteAssetReferences(data, asset.path);
    notifyAssetsChanged(data);
    return true;
  });

  // Rename asset
  ipcMain.handle('rename-asset', (_, oldPath: string, newName: string) => {
    const data = deps.getCurrentData();
    if (!data) return null;
    if (validateAssetFileName(newName)) return null;
    const asset = data.assets.find((a: any) => a.path === oldPath);
    if (!asset) return null;
    const dir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
    const newPath = dir + newName;
    if (data.assets.some((a: any) => a !== asset && a.path === newPath)) return null;
    if (oldPath === newPath) return newPath;
    asset.path = newPath;
    renameAssetReferences(data, oldPath, newPath);
    invalidateAssetsMapCache();
    notifyAssetsChanged(data);
    return newPath;
  });

  // Rename multiple assets after a full preflight so references update atomically.
  ipcMain.handle('rename-assets-batch', (_, operations: AssetBatchRenameOperation[]) => {
    const data = deps.getCurrentData();
    if (!data) return { ok: false, error: 'No file open' };
    if (!Array.isArray(operations) || operations.length === 0) {
      return { ok: false, error: 'No rename operations' };
    }

    const { planned, conflicts } = planAssetRenameOperations(data, operations);
    if (conflicts.length > 0 || planned.length !== operations.length) {
      return { ok: false, conflicts };
    }

    const changes = planned.filter((item) => item.oldPath !== item.newPath);
    for (const item of changes) {
      const asset = data.assets.find((entry: any) => entry.path === item.oldPath);
      if (!asset) return { ok: false, conflicts: [`${item.oldPath}: 에셋을 찾을 수 없습니다.`] };
      asset.path = item.newPath;
      renameAssetReferences(data, item.oldPath, item.newPath);
    }

    invalidateAssetsMapCache();
    if (changes.length) notifyAssetsChanged(data);
    return {
      ok: true,
      renamed: planned.map(({ oldPath, newPath }) => ({ oldPath, newPath })),
    };
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
    if (localFrom === -1 || !Number.isInteger(toIdx) || toIdx < 0 || toIdx >= groupIndices.length) return false;
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
    notifyAssetsChanged(data);
    return true;
  });

  // Compress all image assets to WebP
  ipcMain.handle('compress-assets-webp', async (_, opts?: { quality?: number; recompressWebp?: boolean }) => {
    const data = deps.getCurrentData();
    if (!data || !data.assets || data.assets.length === 0) {
      return { ok: false, error: 'No assets found' };
    }

    try {
      const assetState = () => ({ assets: data.assets, cardAssets: data.cardAssets, xMeta: data.xMeta });
      const snapshot = deserialize(serialize(assetState()));
      const mod = await import('./image-compressor.js');
      const { compressAssetsToWebP, updateAssetReferences } = mod;

      const result = await compressAssetsToWebP(snapshot.assets, {
        quality: opts?.quality ?? 80,
        recompressWebp: opts?.recompressWebp ?? false,
      });
      if (deps.getCurrentData() !== data || !isDeepStrictEqual(assetState(), snapshot)) {
        return { ok: false, error: '압축 중 문서나 에셋이 변경되어 결과를 적용하지 않았습니다.' };
      }
      if (isDeepStrictEqual(data.assets, result.assets)) return { ok: true, stats: result.stats };

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
      notifyAssetsChanged(data);
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
      const mod = await import('./lorebook-io.js');
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
        const mod = await import('./lorebook-io.js');

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
      const mod = await import('./lorebook-io.js');
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
