import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import type { LoadedDocumentData } from '../charx-io';
import type { RendererDocumentPatch } from './document-types';
import type { RecoveryFileType, AutosaveProvenance } from './session-recovery';
import { SIDECAR_SUFFIX, getAutosaveExtension, getAutosaveSidecarPath } from './session-recovery';

const AUTOSAVE_EXTENSIONS = new Set(['.charx', '.risum', '.risup']);

export interface AutosaveManagerDeps {
  getCurrentData: () => LoadedDocumentData | null;
  getCurrentFilePath: () => string | null;
  getMainWindow: () => BrowserWindow | null;
  saveCharx: (filePath: string, data: LoadedDocumentData) => void;
  saveRisum: (filePath: string, data: LoadedDocumentData) => void;
  saveRisup: (filePath: string, data: LoadedDocumentData) => void;
  readFileSync: (filePath: string, encoding: BufferEncoding) => string;
  writeFileSync: (filePath: string, data: string) => void;
  writeFileAtomicSync?: (filePath: string, data: string) => void;
  mkdirSync: (dirPath: string, options?: { recursive: boolean }) => void;
  readdirSync: (dirPath: string) => string[];
  unlinkSync: (filePath: string) => void;
  applyUpdates: (data: LoadedDocumentData, fields: RendererDocumentPatch) => void;
  onAutosaveSuccess?: (autosavePath: string, sidecarPath: string) => void | Promise<void>;
}

function normalizeRecoveryFileType(raw: unknown): RecoveryFileType {
  return raw === 'risum' || raw === 'risup' ? raw : 'charx';
}

function getAutosavePayloadFileName(fileName: string): string | null {
  const payloadFileName = fileName.endsWith(SIDECAR_SUFFIX) ? fileName.slice(0, -SIDECAR_SUFFIX.length) : fileName;
  return AUTOSAVE_EXTENSIONS.has(path.extname(payloadFileName)) ? payloadFileName : null;
}

export function initAutosaveManager(deps: AutosaveManagerDeps): void {
  const writers = { charx: deps.saveCharx, risum: deps.saveRisum, risup: deps.saveRisup };
  const writeSidecar = deps.writeFileAtomicSync ?? deps.writeFileSync;

  ipcMain.handle('autosave-file', async (_, updatedFields: RendererDocumentPatch) => {
    const currentData = deps.getCurrentData();
    if (!currentData) return { success: false, error: 'No data' };
    const customDir = typeof updatedFields._autosaveDir === 'string' ? updatedFields._autosaveDir : undefined;
    const currentFilePath = deps.getCurrentFilePath();
    if (!currentFilePath && !customDir) return { success: false, error: 'No file path and no autosave dir' };
    let autosavePath: string | null = null;
    let sidecarPath: string | null = null;
    let shouldCleanupArtifact = false;
    try {
      deps.applyUpdates(currentData, updatedFields);

      const fileType = normalizeRecoveryFileType(currentData._fileType);
      const extension = getAutosaveExtension(fileType);
      const dir = customDir || path.dirname(currentFilePath!);
      const base = currentFilePath
        ? path.basename(currentFilePath, path.extname(currentFilePath))
        : currentData.name || 'untitled';
      const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      autosavePath = path.join(dir, `${base}_autosave_${ts}_${randomUUID()}${extension}`);
      sidecarPath = getAutosaveSidecarPath(autosavePath);

      deps.mkdirSync(dir, { recursive: true });

      shouldCleanupArtifact = true;
      writers[fileType](autosavePath, currentData);

      const provenance: AutosaveProvenance = {
        sourceFilePath: currentFilePath,
        sourceFileType: fileType,
        autosavePath,
        savedAt: new Date().toISOString(),
        dirtyFields: Object.keys(updatedFields).filter((key) => !key.startsWith('_')),
        appVersion: process.env.npm_package_version || 'unknown',
      };
      writeSidecar(sidecarPath, JSON.stringify(provenance, null, 2));
      // A complete recovery pair remains useful even when its session pointer cannot be written.
      shouldCleanupArtifact = false;
      await deps.onAutosaveSuccess?.(autosavePath, sidecarPath);

      return { success: true, path: autosavePath };
    } catch (err: unknown) {
      if (shouldCleanupArtifact) {
        for (const filePath of [autosavePath, sidecarPath]) {
          if (!filePath) continue;
          try {
            deps.unlinkSync(filePath);
          } catch {
            // Attempt both files and preserve the original autosave failure.
          }
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error('[main] autosave error:', err);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('cleanup-autosave', (_, customDir?: string) => {
    const currentFilePath = deps.getCurrentFilePath();
    if (!currentFilePath) return false;
    const dir = customDir || path.dirname(currentFilePath);
    const base = path.basename(currentFilePath, path.extname(currentFilePath));
    const prefix = `${base}_autosave_`;
    try {
      const cleanupGroups = new Map<string, { payloadFileName: string | null; sidecarFileName: string | null }>();
      for (const fileName of deps.readdirSync(dir)) {
        if (!fileName.startsWith(prefix)) continue;
        const payloadFileName = getAutosavePayloadFileName(fileName);
        if (!payloadFileName) continue;
        const group = cleanupGroups.get(payloadFileName) ?? { payloadFileName: null, sidecarFileName: null };
        if (fileName.endsWith(SIDECAR_SUFFIX)) {
          group.sidecarFileName = fileName;
        } else {
          group.payloadFileName = fileName;
        }
        cleanupGroups.set(payloadFileName, group);
      }

      const groups = [...cleanupGroups.entries()].sort(([a], [b]) => b.localeCompare(a));
      for (const [, group] of groups) {
        // An unowned legacy payload could belong to another document with the same basename.
        if (!group.sidecarFileName) continue;
        if (group.sidecarFileName) {
          const sidecarPath = path.join(dir, group.sidecarFileName);
          let sourceFilePath: string | null = null;
          try {
            const parsed = JSON.parse(deps.readFileSync(sidecarPath, 'utf-8')) as Partial<AutosaveProvenance> | null;
            sourceFilePath = typeof parsed?.sourceFilePath === 'string' ? parsed.sourceFilePath : null;
          } catch (e: unknown) {
            console.warn('[main] Skipping autosave cleanup with unreadable sidecar:', group.sidecarFileName, e);
            continue;
          }

          if (!sourceFilePath) {
            console.warn(
              '[main] Skipping autosave cleanup with missing sidecar sourceFilePath:',
              group.sidecarFileName,
            );
            continue;
          }
          if (path.normalize(sourceFilePath) !== path.normalize(currentFilePath)) {
            continue;
          }
        }

        const filesToDelete = [group.payloadFileName, group.sidecarFileName].filter((f): f is string => f !== null);
        for (const f of filesToDelete) {
          deps.unlinkSync(path.join(dir, f));
          console.log('[main] Autosave cleaned:', f);
        }
      }
      return true;
    } catch (e: unknown) {
      console.error('[main] cleanup-autosave error:', e);
      return false;
    }
  });

  ipcMain.handle('pick-autosave-dir', async () => {
    const mainWindow = deps.getMainWindow();
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '자동저장 폴더 선택',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
}
