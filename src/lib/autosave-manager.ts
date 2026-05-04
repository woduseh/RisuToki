import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import type { RecoveryFileType, AutosaveProvenance } from './session-recovery';
import { SIDECAR_SUFFIX, getAutosaveExtension, getAutosaveSidecarPath } from './session-recovery';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTOSAVE_EXTENSIONS = new Set(['.charx', '.risum', '.risup']);
// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AutosaveManagerDeps {
  getCurrentData: () => any;
  getCurrentFilePath: () => string | null;
  getMainWindow: () => BrowserWindow | null;
  saveCharx: (filePath: string, data: any) => void;
  saveRisum: (filePath: string, data: any) => void;
  saveRisup: (filePath: string, data: any) => void;
  readFileSync: (filePath: string, encoding: BufferEncoding) => string;
  writeFileSync: (filePath: string, data: string) => void;
  writeFileAtomicSync?: (filePath: string, data: string) => void;
  mkdirSync: (dirPath: string, options?: { recursive: boolean }) => void;
  readdirSync: (dirPath: string) => string[];
  unlinkSync: (filePath: string) => void;
  applyUpdates: (data: any, fields: any) => void;
  onAutosaveSuccess?: (autosavePath: string, sidecarPath: string) => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const VALID_FILE_TYPES: ReadonlySet<string> = new Set(['charx', 'risum', 'risup']);
const INTERNAL_FIELD_PREFIX = '_';

function normalizeRecoveryFileType(raw: unknown): RecoveryFileType {
  if (typeof raw === 'string' && VALID_FILE_TYPES.has(raw)) {
    return raw as RecoveryFileType;
  }
  return 'charx';
}

function getWriterForType(fileType: RecoveryFileType, d: AutosaveManagerDeps): (filePath: string, data: any) => void {
  switch (fileType) {
    case 'risum':
      return d.saveRisum;
    case 'risup':
      return d.saveRisup;
    default:
      return d.saveCharx;
  }
}

function extractDirtyFields(updatedFields: Record<string, unknown>): string[] {
  return Object.keys(updatedFields).filter((k) => !k.startsWith(INTERNAL_FIELD_PREFIX));
}

function buildProvenance(params: {
  sourceFilePath: string | null;
  sourceFileType: RecoveryFileType;
  autosavePath: string;
  dirtyFields: string[];
}): AutosaveProvenance {
  return {
    sourceFilePath: params.sourceFilePath,
    sourceFileType: params.sourceFileType,
    autosavePath: params.autosavePath,
    savedAt: new Date().toISOString(),
    dirtyFields: params.dirtyFields,
    appVersion:
      typeof process !== 'undefined' && process.env?.npm_package_version ? process.env.npm_package_version : 'unknown',
  };
}

function writeJsonSidecar(filePath: string, data: string): void {
  const writer = deps.writeFileAtomicSync ?? deps.writeFileSync;
  writer(filePath, data);
}

/**
 * Matches autosave artifact files: `{base}_autosave_{timestamp}.{ext}`
 * and their sidecar files: `{base}_autosave_{timestamp}.{ext}.toki-recovery.json`
 */
function isAutosaveArtifact(fileName: string, basePrefix: string): boolean {
  if (!fileName.startsWith(basePrefix)) return false;
  const rest = fileName.slice(basePrefix.length);
  // Must be an artifact (.charx/.risum/.risup) or a sidecar of one
  for (const ext of AUTOSAVE_EXTENSIONS) {
    if (rest.endsWith(ext) || rest.endsWith(ext + SIDECAR_SUFFIX)) {
      return true;
    }
  }
  return false;
}

function isAutosavePayload(fileName: string): boolean {
  return [...AUTOSAVE_EXTENSIONS].some((ext) => fileName.endsWith(ext));
}

function getAutosavePayloadFileName(fileName: string): string | null {
  const payloadFileName = fileName.endsWith(SIDECAR_SUFFIX) ? fileName.slice(0, -SIDECAR_SUFFIX.length) : fileName;
  return isAutosavePayload(payloadFileName) ? payloadFileName : null;
}

function sourcePathsMatch(a: string, b: string): boolean {
  return path.normalize(a) === path.normalize(b);
}

function readCleanupSidecarSourceFilePath(sidecarPath: string): string | null {
  const raw = deps.readFileSync(sidecarPath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<AutosaveProvenance>;
  return typeof parsed.sourceFilePath === 'string' ? parsed.sourceFilePath : null;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: AutosaveManagerDeps;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initAutosaveManager(d: AutosaveManagerDeps): void {
  deps = d;

  ipcMain.handle('autosave-file', async (_, updatedFields: any) => {
    const currentData = deps.getCurrentData();
    if (!currentData) return { success: false, error: 'No data' };
    const customDir: string | undefined = updatedFields._autosaveDir;
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
      autosavePath = path.join(dir, `${base}_autosave_${ts}${extension}`);
      sidecarPath = getAutosaveSidecarPath(autosavePath);

      deps.mkdirSync(dir, { recursive: true });

      const writer = getWriterForType(fileType, deps);
      shouldCleanupArtifact = true;
      writer(autosavePath, currentData);

      const dirtyFields = extractDirtyFields(updatedFields);
      const provenance = buildProvenance({
        sourceFilePath: currentFilePath,
        sourceFileType: fileType,
        autosavePath,
        dirtyFields,
      });
      writeJsonSidecar(sidecarPath, JSON.stringify(provenance, null, 2));

      if (deps.onAutosaveSuccess) deps.onAutosaveSuccess(autosavePath, sidecarPath);

      return { success: true, path: autosavePath };
    } catch (err: unknown) {
      try {
        if (shouldCleanupArtifact && autosavePath) {
          deps.unlinkSync(autosavePath);
        }
        if (sidecarPath) {
          deps.unlinkSync(sidecarPath);
        }
      } catch {
        // Ignore cleanup failures here; the original autosave error remains primary.
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
      const files = deps.readdirSync(dir).filter((f: string) => isAutosaveArtifact(f, prefix));
      for (const fileName of files) {
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
        if (group.sidecarFileName) {
          const sidecarPath = path.join(dir, group.sidecarFileName);
          let sourceFilePath: string | null = null;
          try {
            sourceFilePath = readCleanupSidecarSourceFilePath(sidecarPath);
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
          if (!sourcePathsMatch(sourceFilePath, currentFilePath)) {
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
