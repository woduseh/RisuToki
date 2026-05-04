import * as fs from 'fs';
import * as http from 'http';

import { parsePromptTemplate } from './risup-prompt-model';
import { getRefFileType } from './reference-store';
import type { McpSuccessOptions } from './mcp-response-envelope';
import type { McpApiDeps, McpSessionStatus } from './mcp-api-server';

const SESSION_STATUS_TIMEOUT_MS = 250;

export function fileStatMetadata(filePath: string | null | undefined): {
  path: string | null;
  exists: boolean | null;
  mtimeMs: number | null;
  size: number | null;
  unavailableReason: string | null;
} {
  if (!filePath) {
    return {
      path: null,
      exists: null,
      mtimeMs: null,
      size: null,
      unavailableReason: 'no_file_path',
    };
  }
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return {
        path: filePath,
        exists: true,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        unavailableReason: 'path_is_not_file',
      };
    }
    return { path: filePath, exists: true, mtimeMs: stat.mtimeMs, size: stat.size, unavailableReason: null };
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : null;
    return {
      path: filePath,
      exists: code === 'ENOENT' ? false : null,
      mtimeMs: null,
      size: null,
      unavailableReason: code === 'ENOENT' ? 'file_missing' : `stat_unavailable${code ? `:${code}` : ''}`,
    };
  }
}

export interface SessionRouteDeps {
  getCurrentFilePath?: McpApiDeps['getCurrentFilePath'];
  getReferenceFiles: McpApiDeps['getReferenceFiles'];
  getSessionStatus?: McpApiDeps['getSessionStatus'];
  normalizeTriggerScripts: McpApiDeps['normalizeTriggerScripts'];
  getCssSectionCount: (css: string) => number;
  getLuaSectionCount: (lua: string) => number;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, opts: McpSuccessOptions) => void;
}

async function getSessionStatusWithTimeout(
  getSessionStatus: (() => Promise<McpSessionStatus> | McpSessionStatus) | undefined,
): Promise<McpSessionStatus | null> {
  if (!getSessionStatus) return null;
  try {
    return await Promise.race([
      Promise.resolve(getSessionStatus()),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SESSION_STATUS_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export async function handleSessionStatusRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  currentData: Record<string, unknown> | null,
  fieldSnapshots: ReadonlyMap<string, readonly unknown[]>,
  deps: SessionRouteDeps,
): Promise<boolean> {
  if (!(parts[0] === 'session' && parts[1] === 'status' && !parts[2] && req.method === 'GET')) {
    return false;
  }

  const status = await getSessionStatusWithTimeout(deps.getSessionStatus);
  const snapshotSummary = [...fieldSnapshots.entries()]
    .filter(([, snaps]) => snaps.length > 0)
    .map(([field, snaps]) => ({ field, count: snaps.length }))
    .sort((a, b) => a.field.localeCompare(b.field));
  const totalSnapshots = snapshotSummary.reduce((sum, entry) => sum + entry.count, 0);
  const documentName =
    currentData && typeof currentData.name === 'string' && currentData.name.trim() ? currentData.name : null;
  const documentFileType =
    status?.currentFileType ??
    (currentData && (currentData._fileType === 'risum' || currentData._fileType === 'risup')
      ? currentData._fileType
      : currentData
        ? 'charx'
        : null);
  const loaded = !!currentData;
  const activeFilePath = status?.currentFilePath ?? deps.getCurrentFilePath?.() ?? null;
  const activeFileStat = fileStatMetadata(activeFilePath);
  const dirtyKnown = !!status?.renderer;
  const surfaceSummary = loaded
    ? (() => {
        const lorebookCount = Array.isArray(currentData.lorebook) ? currentData.lorebook.length : 0;
        const regexCount = Array.isArray(currentData.regex) ? currentData.regex.length : 0;
        const alternateGreetingCount = Array.isArray(currentData.alternateGreetings)
          ? currentData.alternateGreetings.length
          : 0;
        const groupGreetingCount = Array.isArray(currentData.groupOnlyGreetings)
          ? currentData.groupOnlyGreetings.length
          : 0;
        const normalizedTriggers = deps.normalizeTriggerScripts(currentData.triggerScripts || []);
        const triggerCount = Array.isArray(normalizedTriggers) ? normalizedTriggers.length : 0;
        const luaCode = typeof currentData.lua === 'string' ? currentData.lua : '';
        const cssCode = typeof currentData.css === 'string' ? currentData.css : '';
        const luaSectionCount = luaCode.trim() ? deps.getLuaSectionCount(luaCode) : 0;
        const cssSectionCount = cssCode.trim() ? deps.getCssSectionCount(cssCode) : 0;
        let risupPromptItemCount: number | null = null;
        let risupPromptState: 'empty' | 'invalid' | 'valid' | null = null;
        if (documentFileType === 'risup') {
          const promptModel = parsePromptTemplate(
            typeof currentData.promptTemplate === 'string' ? currentData.promptTemplate : '',
          );
          risupPromptItemCount = promptModel.items.length;
          risupPromptState = promptModel.state;
        }
        return {
          lorebookCount,
          regexCount,
          alternateGreetingCount,
          groupGreetingCount,
          triggerCount,
          luaSectionCount,
          cssSectionCount,
          risupPromptItemCount,
          risupPromptState,
        };
      })()
    : null;

  const refFiles = deps.getReferenceFiles();
  const refsSummary = refFiles.map((ref, index) => {
    const refRecord = asRecord(ref) ?? {};
    const filePathValue = refRecord.filePath;
    const fileNameValue = refRecord.fileName;
    const refFilePath = typeof filePathValue === 'string' ? filePathValue : null;
    const refFileName = typeof fileNameValue === 'string' ? fileNameValue : undefined;
    const refData = asRecord(refRecord.data);
    const stat = fileStatMetadata(refFilePath);
    return {
      index,
      id: refRecord.id || refRecord.filePath || refRecord.fileName,
      fileName: refRecord.fileName,
      filePath: refFilePath,
      fileType: getRefFileType({ fileName: refFileName, data: refData ?? undefined }),
      exists: stat.exists,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      unavailableReason: stat.unavailableReason,
    };
  });
  const referenceManifestStatus = status?.referenceManifestStatus ?? null;
  const integrity = {
    activeFile: {
      path: activeFileStat.path,
      fileType: documentFileType,
      exists: activeFileStat.exists,
      mtimeMs: activeFileStat.mtimeMs,
      size: activeFileStat.size,
      unavailableReason: activeFileStat.unavailableReason,
    },
    dirty: dirtyKnown
      ? {
          known: true,
          hasUnsavedChanges: status.renderer!.hasUnsavedChanges,
          dirtyFieldCount: status.renderer!.dirtyFieldCount,
          dirtyFields: status.renderer!.dirtyFields,
          unavailableReason: null,
        }
      : {
          known: false,
          hasUnsavedChanges: null,
          dirtyFieldCount: null,
          dirtyFields: [],
          unavailableReason: 'renderer_status_unavailable',
        },
    autosave: status?.renderer
      ? {
          available: true,
          enabled: status.renderer.autosaveEnabled,
          interval: status.renderer.autosaveInterval,
          dir: status.renderer.autosaveDir,
          unavailableReason: null,
        }
      : {
          available: false,
          enabled: null,
          interval: null,
          dir: null,
          unavailableReason: 'renderer_status_unavailable',
        },
    save: {
      lastSavedAt: activeFileStat.mtimeMs !== null ? new Date(activeFileStat.mtimeMs).toISOString() : null,
      mtimeMs: activeFileStat.mtimeMs,
      unavailableReason: activeFileStat.unavailableReason,
    },
    recovery: {
      lastRestoredAvailable: !!status?.lastRestored,
      pendingRecoveryAvailable: !!status?.pendingRecovery,
      lastRestored: status?.lastRestored ?? null,
      pendingRecovery: status?.pendingRecovery ?? null,
      unavailableReason: status ? null : 'session_status_unavailable',
    },
    referenceManifest: {
      available: !!referenceManifestStatus,
      status: referenceManifestStatus,
      unavailableReason: referenceManifestStatus ? null : 'reference_manifest_status_unavailable',
    },
    references: {
      count: refsSummary.length,
      files: refsSummary,
    },
  };

  deps.jsonResSuccess(
    res,
    {
      loaded,
      document: {
        filePath: activeFilePath,
        fileType: documentFileType,
        name: documentName,
      },
      renderer: status?.renderer ?? null,
      recovery: {
        lastRestored: status?.lastRestored ?? null,
        pendingRecovery: status?.pendingRecovery ?? null,
      },
      snapshots: {
        byField: snapshotSummary,
        totalFields: snapshotSummary.length,
        totalSnapshots,
      },
      surfaceSummary,
      references: {
        count: refsSummary.length,
        files: refsSummary,
        manifestStatus: referenceManifestStatus,
      },
      integrity,
    },
    {
      toolName: 'session_status',
      summary: loaded
        ? `Session status for "${documentName ?? 'Untitled'}" (${totalSnapshots} snapshot${totalSnapshots === 1 ? '' : 's'}, ${refsSummary.length} ref${refsSummary.length === 1 ? '' : 's'})`
        : refsSummary.length > 0
          ? `No document loaded but ${refsSummary.length} reference file(s) available — use list_references to inspect`
          : `Session status (no document loaded, no references)`,
      nextActions: !loaded && refsSummary.length > 0 ? ['list_references', 'open_file'] : undefined,
      artifacts: {
        filePath: status?.currentFilePath ?? null,
        loaded,
        totalSnapshots,
        referenceCount: refsSummary.length,
        hasSurfaceSummary: !!surfaceSummary,
      },
    },
  );
  return true;
}
