import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { LoadedDocumentData, TriggerScript } from '../charx-io';
import * as lorebookIo from './lorebook-io';
import { handleAssetRoute } from './mcp-asset-routes';
import { handleCbsRoute } from './mcp-cbs-routes';
import { handleProbeRoute } from './mcp-probe-routes';
import { handleStructuredItemRoute } from './mcp-structured-item-routes';
import { handleSectionRoute } from './mcp-section-routes';
import { handleRisupPromptRoute } from './mcp-risup-prompt-routes';
import { handleReferenceRoute } from './mcp-reference-routes';
import { createExternalDocumentReaders, handleExternalRoute } from './mcp-external-routes';
import { handleFieldRoute, type FieldSnapshot } from './mcp-field-routes';
import { handleLorebookRoute } from './mcp-lorebook-routes';
import {
  parseYamlFrontmatter,
  jsonRes,
  logMcpMutation,
  promptItemPreview,
  type McpNoOpInfo,
  jsonMcpError,
  jsonMcpNoOp,
  readJsonBody,
  LOREBOOK_ALLOWED_FIELDS,
  hashSurface,
  measureSurface,
  getPointerValue,
  getSurfaceReadBlock,
  getSurfaceMutationBlock,
  getSurfacePatchMutationBlock,
  validateTouchedRisupJsonFields,
  applySurfacePatch,
  buildSurfaceList,
  inferDocumentFileType,
  replaceStringInSurface,
  setPointerValue,
  normalizeLorebookEntryFolderIdentity,
  buildLorebookListResponse,
  buildRegexListResponse,
  buildLuaListResponse,
  buildCssListResponse,
  buildGreetingListResponse,
  buildTriggerListResponse,
  createLuaCache,
  createCssCache,
  ensureAssetExpectedPath,
} from './mcp-api-helpers';
import { handleSurfaceRoute } from './mcp-surface-routes';
import { canonicalizeLorebookFolderRefs, getFolderRef } from './lorebook-folders';
import { inferSkillRootScope, type ResolvedSkillRoot, type SkillScope } from './content-roots';
import { listSkillCatalogEntries, resolveSkillCatalogFile } from './skill-catalog';
import { mcpSuccess, type McpErrorInfo, type McpSuccessOptions } from './mcp-response-envelope';
import type { RuntimeMetadata } from './mcp-runtime-contract';
import { extToMime, cloneJson } from './shared-utils';
import { validateBody } from './mcp-request-schemas';
import { collectHiddenFieldWarnings, redactHiddenFields, type SupportedFileType } from './mcp-field-access';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Section {
  name: string;
  content: string;
}

export interface CssCacheEntry {
  sections: Section[];
  prefix: string;
  suffix: string;
}

export interface McpPendingRecoveryStatus {
  autosavePath: string;
  dirtyFields: string[];
  sourceFilePath: string;
  staleWarning: string | null;
}

export interface McpLastRestoredStatus {
  appVersion: string;
  autosavePath: string;
  dirtyFields: string[];
  savedAt: string;
  sourceFilePath: string | null;
  sourceFileType: 'charx' | 'risum' | 'risup';
}

export interface McpRendererSessionStatus {
  autosaveDir: string;
  autosaveEnabled: boolean;
  autosaveInterval: number;
  dirtyFieldCount: number;
  dirtyFields: string[];
  documentSwitchInProgress: boolean;
  hasUnsavedChanges: boolean;
}

export interface McpReferenceFile {
  id?: string;
  fileName?: string;
  name?: string;
  filePath: string;
  fileType?: SupportedFileType;
  data: Record<string, any>;
}

export interface McpReferenceManifestStatus {
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: string;
}

export interface McpActiveFileBaseline {
  path: string;
  mtimeMs: number;
  size: number;
  sha256: string;
  capturedAt: string;
}

export interface McpSessionStatus {
  currentFilePath: string | null;
  currentFileType: 'charx' | 'risum' | 'risup' | null;
  activeFileBaseline?: McpActiveFileBaseline | null;
  lastRestored: McpLastRestoredStatus | null;
  pendingRecovery: McpPendingRecoveryStatus | null;
  renderer: McpRendererSessionStatus | null;
  referenceManifestStatus?: McpReferenceManifestStatus | null;
  runtime?: RuntimeMetadata | null;
}

export interface McpApiDeps {
  /** Return the current in-memory document data (mutated directly by routes). */
  getCurrentData: () => LoadedDocumentData | null;
  /** Return the loaded reference files array. */
  getReferenceFiles: () => McpReferenceFile[];
  /** Show a confirmation dialog in the renderer and resolve with the user's choice. */
  askRendererConfirm: (title: string, message: string) => Promise<boolean>;
  /** Ask the renderer to switch the active document to a specific external file path. */
  requestRendererOpenFile: (request: RendererOpenFileRequest) => Promise<RendererOpenFileResponse>;
  /** Ask the app to save the current document. */
  saveCurrentDocument?: () => Promise<{ success: boolean; path?: string; error?: string }>;
  /** Broadcast an IPC message to the main renderer. */
  broadcastToAll: (channel: string, ...args: unknown[]) => void;
  /** Broadcast an MCP status event to the renderer. */
  broadcastMcpStatus: (payload: Record<string, unknown>) => void;
  /** Called once the HTTP server begins listening, providing the assigned port. */
  onListening: (port: number) => void;
  /** Invalidate the cached assets map (call after mutating asset source fields). */
  invalidateAssetsMapCache?: () => void;

  // Section parsing
  parseLuaSections: (lua: string) => Section[];
  combineLuaSections: (sections: Section[]) => string;
  detectLuaSection: (line: string) => string | null;
  parseCssSections: (css: string) => CssCacheEntry;
  combineCssSections: (sections: Section[], prefix: string, suffix: string) => string;
  detectCssSectionInline: (line: string) => string | null;
  detectCssBlockOpen: (line: string) => boolean;
  detectCssBlockClose: (line: string) => boolean;

  // charx-io helpers
  openExternalDocument: (filePath: string) => LoadedDocumentData;
  saveExternalDocument: (filePath: string, fileType: SupportedFileType, data: LoadedDocumentData) => void;
  normalizeTriggerScripts: (data: unknown) => TriggerScript[];
  extractPrimaryLua: (scripts: unknown) => string;
  mergePrimaryLua: (scripts: unknown, lua: string) => TriggerScript[];
  stringifyTriggerScripts: (scripts: unknown) => string;

  // skills directories
  getSkillRoots: () => string[];

  // user data directory for sidecar state
  getUserDataPath: () => string;

  // session metadata
  getSessionStatus?: () => Promise<McpSessionStatus> | McpSessionStatus;
  getCurrentFilePath?: () => string | null;
  getRuntimeInfo?: () => RuntimeMetadata;
}

const ASSET_MAP_SOURCE_FIELDS = new Set(['assets', 'cardAssets', 'xMeta', '_risuExt', 'risumAssets', '_moduleData']);

function touchesAssetMapSource(fields: readonly string[]): boolean {
  return fields.some((field) => ASSET_MAP_SOURCE_FIELDS.has(field));
}

export interface McpApiServer {
  server: http.Server;
  token: string;
  /** Force-invalidate the internal Lua / CSS section caches. */
  invalidateSectionCaches: () => void;
}

const SKILL_SCOPES = new Set<SkillScope>(['product', 'common', 'bot', 'prompts', 'modules', 'plugins']);
const SKILL_BOOTSTRAP_MAX_BYTES = 64 * 1024;

function resolvedSkillRoots(rootPaths: string[]): ResolvedSkillRoot[] {
  return rootPaths.map((rootPath) => ({
    absolutePath: rootPath,
    relativePath: rootPath,
    scope: inferSkillRootScope(rootPath),
  }));
}

function skillCursorBinding(value: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex').slice(0, 24);
}

function encodeSkillCursor(kind: 'list' | 'read', offset: number, binding: string): string {
  return Buffer.from(`risutoki-skill-v2:${kind}:${binding}:${offset}`, 'utf8').toString('base64url');
}

function decodeSkillCursor(kind: 'list' | 'read', cursor: string | null, binding: string): number | null {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const match = new RegExp(`^risutoki-skill-v2:${kind}:${binding}:(\\d+)$`).exec(decoded);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function utf8SliceAtBoundary(source: Buffer, offset: number, maxBytes: number): { text: string; nextOffset: number } {
  let end = Math.min(source.length, offset + maxBytes);
  while (end > offset) {
    const candidate = source.subarray(offset, end);
    const text = candidate.toString('utf8');
    if (Buffer.from(text, 'utf8').equals(candidate)) return { text, nextOffset: end };
    end -= 1;
  }
  return { text: '', nextOffset: offset };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export interface RendererOpenFileRequest {
  filePath: string;
  fileType: SupportedFileType;
  saveCurrent: boolean;
  targetLabel: string;
}

export interface RendererOpenFileResponse {
  success: boolean;
  alreadyOpen?: boolean;
  canceled?: boolean;
  error?: string;
  filePath?: string;
  fileType?: SupportedFileType;
  name?: string;
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// startApiServer
// ---------------------------------------------------------------------------

export function startApiServer(deps: McpApiDeps): McpApiServer {
  const fieldSnapshots = new Map<string, FieldSnapshot[]>();
  const token = crypto.randomBytes(32).toString('hex');
  const expectedAuthDigest = crypto.createHash('sha256').update(`Bearer ${token}`).digest();

  // Constant-time bearer comparison: hash both sides to a fixed length so
  // timingSafeEqual never throws on length mismatch and leaks no prefix timing.
  function isAuthorized(authorization: string | undefined): boolean {
    if (typeof authorization !== 'string') return false;
    const providedDigest = crypto.createHash('sha256').update(authorization).digest();
    return crypto.timingSafeEqual(providedDigest, expectedAuthDigest);
  }

  const luaCache = createLuaCache(deps.parseLuaSections);
  const cssCache = createCssCache(deps.parseCssSections);
  const openFileRequestState = { inFlight: false };

  const broadcastStatus = deps.broadcastMcpStatus;

  // Mutex map to prevent parallel write conflicts on the same field
  const fieldWriteMutex = new Map<string, Promise<void>>();
  function acquireFieldMutex(fieldName: string): Promise<() => void> {
    const prev = fieldWriteMutex.get(fieldName) || Promise.resolve();
    let releaseFn: () => void;
    const next = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });
    fieldWriteMutex.set(
      fieldName,
      prev.then(() => next),
    );
    return prev.then(() => releaseFn!);
  }

  // Shorthand to emit an MCP error response
  function mcpError(res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown): void {
    jsonMcpError(res, status, info, broadcastStatus, error);
  }

  function mcpNoOp(res: http.ServerResponse, info: McpNoOpInfo, extra: Record<string, unknown> = {}): void {
    jsonMcpNoOp(res, info, extra);
  }

  /**
   * Parse a raw request body with a Zod schema, returning typed data or
   * sending an mcpError and returning null.
   */
  function parseBody<T>(
    res: http.ServerResponse,
    body: Record<string, unknown>,
    schema: import('zod').ZodType<T>,
    meta: { action: string; target: string; suggestion?: string },
  ): T | null {
    const result = validateBody(body, schema);
    if (result.success) return result.data;
    const fieldHint = result.path ? ` (at "${result.path}")` : '';
    mcpError(res, 400, {
      action: meta.action,
      target: meta.target,
      message: `${result.error}${fieldHint}`,
      suggestion: meta.suggestion ?? '요청 본문의 구조와 필드 타입을 다시 확인하세요.',
    });
    return null;
  }

  // Shorthand to emit an MCP success response with envelope enrichment
  function jsonResSuccess(res: http.ServerResponse, payload: Record<string, unknown>, opts: McpSuccessOptions): void {
    jsonRes(res, mcpSuccess(payload, opts));
  }

  const externalDocumentReaders = createExternalDocumentReaders({
    openExternalDocument: deps.openExternalDocument,
    readJsonBody,
    parseBody,
    broadcastStatus,
    mcpError,
  });

  const server = http.createServer(async (req, res) => {
    // Auth check (constant-time comparison)
    if (!isAuthorized(req.headers.authorization)) {
      return mcpError(res, 401, {
        action: 'authenticate request',
        target: 'request:auth',
        message: 'Unauthorized',
        suggestion: '유효한 TOKI_TOKEN으로 Authorization Bearer 헤더를 다시 보내세요.',
      });
    }
    const url = new URL(req.url!, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      if (
        await handleProbeRoute(req, res, parts, url, {
          parseLuaSections: deps.parseLuaSections,
          parseCssSections: deps.parseCssSections,
          stringifyTriggerScripts: deps.stringifyTriggerScripts,
          readProbeDocumentRequest: externalDocumentReaders.readProbeDocumentRequest,
          mcpError,
          jsonResSuccess,
          buildLorebookListResponse,
          buildRegexListResponse,
          buildLuaListResponse,
          buildCssListResponse,
          buildGreetingListResponse,
          buildTriggerListResponse,
          promptItemPreview,
        })
      ) {
        return;
      }

      if (
        await handleExternalRoute(req, res, parts, url, {
          api: deps,
          documentReaders: externalDocumentReaders,
          openFileRequestState,
          acquireFieldMutex,
          parseBody,
          jsonResSuccess,
          mcpError,
          mcpNoOp,
        })
      ) {
        return;
      }

      const isSessionStatusRoute = parts[0] === 'session' && parts[1] === 'status' && !parts[2] && req.method === 'GET';
      const isReferenceRoute = parts[0] === 'references' || parts[0] === 'reference';
      const isRisupPromptSnippetRoute = parts[0] === 'risup' && parts[1] === 'prompt-snippets';
      const isSkillRoute = parts[0] === 'skills' && req.method === 'GET';
      const currentData = deps.getCurrentData();
      if (!currentData && !isSessionStatusRoute && !isReferenceRoute && !isRisupPromptSnippetRoute && !isSkillRoute) {
        return mcpError(res, 400, {
          action: 'require current document',
          target: 'document:current',
          message: 'No file open',
          suggestion:
            'open_file를 사용하거나 에디터에서 파일을 먼저 연 뒤 다시 시도하세요. 참고 자료가 로드되어 있다면 list_references는 파일 없이도 사용 가능합니다.',
        });
      }
      // Routes that support an empty editor session return before reading the
      // document. The remaining route handlers operate on a loaded document.
      const activeData = currentData as LoadedDocumentData;

      if (
        await handleSurfaceRoute(req, res, parts, activeData, {
          askRendererConfirm: deps.askRendererConfirm,
          broadcastToAll: deps.broadcastToAll,
          getSessionStatus: deps.getSessionStatus,
          invalidateAssetsMapCache: deps.invalidateAssetsMapCache,
          readJsonBody,
          broadcastStatus,
          jsonResSuccess,
          mcpError,
          mcpNoOp,
          inferDocumentFileType,
          buildSurfaceList,
          hashSurface,
          collectHiddenFieldWarnings,
          getSurfaceReadBlock,
          getPointerValue,
          redactHiddenFields,
          measureSurface,
          getSurfacePatchMutationBlock,
          cloneJson,
          applySurfacePatch,
          validateTouchedRisupJsonFields,
          touchesAssetMapSource,
          logMcpMutation,
          getSurfaceMutationBlock,
          replaceStringInSurface,
          setPointerValue,
        })
      ) {
        return;
      }

      // ----------------------------------------------------------------
      // POST /document/save — save current document to disk
      // ----------------------------------------------------------------
      if (parts[0] === 'document' && parts[1] === 'save' && !parts[2] && req.method === 'POST') {
        if (!deps.saveCurrentDocument) {
          return mcpError(res, 501, {
            action: 'save current document',
            message: 'Current document save is not available in this runtime.',
            suggestion: '에디터 UI의 저장 기능을 사용하거나 open_file(save_current=true)를 사용하세요.',
            target: 'document:save',
          });
        }
        const result = await deps.saveCurrentDocument();
        if (!result.success) {
          return mcpError(res, 500, {
            action: 'save current document',
            message: result.error || 'Failed to save current document',
            suggestion: '현재 파일 경로와 저장 권한을 확인하세요.',
            target: 'document:save',
          });
        }
        return jsonResSuccess(
          res,
          { success: true, path: result.path ?? null },
          {
            toolName: 'save_current_file',
            summary: `Saved current document${result.path ? ` to ${path.basename(result.path)}` : ''}`,
          },
        );
      }

      if (
        await handleFieldRoute(req, res, parts, url, activeData, {
          api: deps,
          fieldSnapshots,
          acquireFieldMutex,
          getCssSectionCount: (css) => cssCache.get(css).sections.length,
          getLuaSectionCount: (lua) => luaCache.get(lua).length,
          parseBody,
          broadcastStatus,
          jsonResSuccess,
          mcpError,
          mcpNoOp,
        })
      ) {
        return;
      }

      if (
        await handleLorebookRoute(req, res, parts, url, activeData, {
          api: deps,
          broadcastStatus,
          jsonResSuccess,
          mcpError,
          mcpNoOp,
        })
      ) {
        return;
      }

      if (
        await handleStructuredItemRoute(req, res, parts, url, activeData, {
          api: deps,
          broadcastStatus,
          jsonResSuccess,
          mcpError,
          mcpNoOp,
        })
      ) {
        return;
      }

      if (
        await handleSectionRoute(req, res, parts, activeData, {
          api: deps,
          luaCache,
          cssCache,
          broadcastStatus,
          jsonResSuccess,
          mcpError,
          mcpNoOp,
        })
      ) {
        return;
      }

      if (
        await handleReferenceRoute(req, res, parts, url, {
          api: deps,
          parseBody,
          broadcastStatus,
          jsonResSuccess,
          mcpError,
        })
      ) {
        return;
      }

      if (
        await handleAssetRoute(req, res, parts, activeData, {
          askRendererConfirm: deps.askRendererConfirm,
          broadcastToAll: deps.broadcastToAll,
          invalidateAssetsMapCache: deps.invalidateAssetsMapCache,
          readJsonBody,
          parseBody,
          broadcastStatus,
          jsonResSuccess,
          mcpError,
          ensureAssetExpectedPath,
          extToMime,
          logMcpMutation,
        })
      ) {
        return;
      }

      // ----------------------------------------------------------------
      // POST /lorebook/export — export lorebook to files
      // ----------------------------------------------------------------
      if (parts[0] === 'lorebook' && parts[1] === 'export' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'lorebook/export', broadcastStatus);
        if (!body) return;

        const targetDir = typeof body.target_dir === 'string' ? body.target_dir.trim() : '';
        if (!targetDir) {
          return mcpError(res, 400, {
            action: 'export-lorebook',
            message: 'target_dir is required.',
            target: 'lorebook',
          });
        }

        const format = body.format === 'json' ? 'json' : 'md';
        const groupByFolder = body.group_by_folder !== false;
        const filter = typeof body.filter === 'string' ? body.filter : undefined;
        const folder = typeof body.folder === 'string' ? body.folder : undefined;

        const entries = [...((activeData.lorebook as Record<string, unknown>[]) || [])];

        try {
          const options = {
            format: format as 'md' | 'json',
            groupByFolder,
            includeMetadata: true,
            sourceName: String((activeData as Record<string, unknown>).name || 'unknown'),
            filter,
            folder,
          };
          const plan = lorebookIo.planLorebookExport(entries, targetDir, options);
          if (plan.exportedCount === 0) {
            return mcpError(res, 400, {
              action: 'export-lorebook',
              message: 'No entries to export.',
              target: 'lorebook',
            });
          }

          // User confirmation
          const confirmMsg =
            `AI 어시스턴트가 로어북 ${plan.exportedCount}개 항목을 내보내려 합니다.\n\n` +
            `형식: ${format.toUpperCase()}\n` +
            `경로: ${targetDir}`;
          const allowed = await deps.askRendererConfirm('MCP 내보내기 요청', confirmMsg);
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'export-lorebook',
              message: 'User rejected export.',
              target: 'lorebook',
            });
          }

          const result =
            format === 'json'
              ? await lorebookIo.exportToJson(entries, targetDir, options)
              : await lorebookIo.exportToMarkdown(entries, targetDir, options);

          broadcastStatus({
            type: 'success',
            action: 'export-lorebook',
            message: `Exported ${result.exportedCount} entries to ${format.toUpperCase()}.`,
          });

          return jsonResSuccess(res, result as unknown as Record<string, unknown>, {
            toolName: 'export_lorebook_to_files',
            summary: `Exported ${result.exportedCount} lorebook entries to ${format.toUpperCase()}`,
            artifacts: { exportedCount: result.exportedCount, format },
          });
        } catch (err: unknown) {
          return mcpError(res, 500, {
            action: 'export-lorebook',
            message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
            target: 'lorebook',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /lorebook/import — import lorebook from files
      // ----------------------------------------------------------------
      if (parts[0] === 'lorebook' && parts[1] === 'import' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'lorebook/import', broadcastStatus);
        if (!body) return;

        const format = body.format === 'json' ? 'json' : 'md';
        const sourcePath = typeof body.source_path === 'string' ? body.source_path.trim() : '';
        const sourceDir = typeof body.source_dir === 'string' ? body.source_dir.trim() : '';
        const source = format === 'json' ? sourcePath : sourceDir;

        if (!source) {
          return mcpError(res, 400, {
            action: 'import-lorebook',
            message:
              format === 'json' ? 'source_path is required for JSON format.' : 'source_dir is required for MD format.',
            target: 'lorebook',
          });
        }

        const createFolders = body.create_folders !== false;
        const conflict = ['skip', 'overwrite', 'rename'].includes(body.conflict)
          ? (body.conflict as 'skip' | 'overwrite' | 'rename')
          : 'skip';
        const dryRun = !!(body.dry_run ?? body.dryRun);
        let lorebookRollback: typeof activeData.lorebook | null = null;

        try {
          // Parse import entries
          const importEntries =
            format === 'json' ? await lorebookIo.importFromJson(source) : await lorebookIo.importFromMarkdown(source);

          if (importEntries.length === 0) {
            return jsonResSuccess(
              res,
              {
                success: true,
                totalFound: 0,
                imported: 0,
                message: 'No entries found to import.',
              },
              {
                toolName: 'import_lorebook_from_files',
                summary: 'No entries found to import',
                artifacts: { totalFound: 0, imported: 0 },
              },
            );
          }

          // Resolve conflicts
          const existingEntries = (activeData.lorebook as Record<string, unknown>[]) || [];
          const existingFolderMap = lorebookIo.buildFolderMap(existingEntries);
          const resolution = lorebookIo.resolveImportConflicts(importEntries, existingEntries, existingFolderMap, {
            conflict,
            createFolders,
          });

          // Dry run: return preview without changes
          if (dryRun) {
            return jsonResSuccess(
              res,
              {
                success: true,
                dryRun: true,
                totalFound: importEntries.length,
                toAdd: resolution.toAdd.length,
                toOverwrite: resolution.toOverwrite.length,
                skipped: resolution.skipped.length,
                renamed: resolution.renamed.length,
                newFolders: resolution.newFolders,
                skippedEntries: resolution.skipped,
                renamedEntries: resolution.renamed,
              },
              {
                toolName: 'import_lorebook_from_files',
                summary: `Dry-run: ${importEntries.length} entries found (${resolution.toAdd.length} new, ${resolution.toOverwrite.length} overwrite)`,
                artifacts: {
                  totalFound: importEntries.length,
                  toAdd: resolution.toAdd.length,
                  toOverwrite: resolution.toOverwrite.length,
                },
              },
            );
          }

          // User confirmation
          const summary = [
            `AI 어시스턴트가 로어북에 항목을 가져오려 합니다.`,
            ``,
            `파일 수: ${importEntries.length}개`,
            `추가: ${resolution.toAdd.length}개`,
            resolution.toOverwrite.length > 0 ? `덮어쓰기: ${resolution.toOverwrite.length}개` : '',
            resolution.skipped.length > 0 ? `건너뛰기: ${resolution.skipped.length}개` : '',
            resolution.renamed.length > 0 ? `이름 변경: ${resolution.renamed.length}개` : '',
            resolution.newFolders.length > 0 ? `새 폴더: ${resolution.newFolders.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('\n');

          const allowed = await deps.askRendererConfirm('MCP 가져오기 요청', summary);
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'import-lorebook',
              message: 'User rejected import.',
              target: 'lorebook',
            });
          }

          // Execute import
          lorebookRollback = cloneJson(activeData.lorebook || []) as typeof activeData.lorebook;
          const errors: string[] = [];
          let foldersCreated = 0;

          // 1. Create new folders first
          const newFolderIds = new Map<string, string>(); // folderName → folderId
          for (const folderName of resolution.newFolders) {
            const folderEntry: Record<string, unknown> = {
              comment: folderName,
              key: crypto.randomUUID(),
              content: '',
              mode: 'folder',
              folder: '',
              insertorder: 100,
            };
            (activeData.lorebook as unknown[]).push(folderEntry);
            const folderRef = getFolderRef(folderEntry);
            if (folderRef) {
              newFolderIds.set(folderName, folderRef);
            }
            foldersCreated++;
          }

          // Merge new folder IDs with existing
          const allFolderByName = new Map<string, string>();
          for (const [id, name] of existingFolderMap) {
            allFolderByName.set(name, id);
          }
          for (const [name, id] of newFolderIds) {
            allFolderByName.set(name, id);
          }

          // 2. Add new entries
          for (const entry of resolution.toAdd) {
            entry.folder = lorebookIo.resolveImportedFolderRef(entry, allFolderByName);
            normalizeLorebookEntryFolderIdentity(entry);
            (activeData.lorebook as unknown[]).push(entry);
          }

          // 3. Overwrite existing entries
          for (const { index, data } of resolution.toOverwrite) {
            const existing = (activeData.lorebook as Record<string, unknown>[])[index];
            if (existing) {
              for (const [key, value] of Object.entries(data)) {
                if (LOREBOOK_ALLOWED_FIELDS.has(key)) {
                  existing[key] = value;
                }
              }
              existing.folder = lorebookIo.resolveImportedFolderRef(data, allFolderByName);
              normalizeLorebookEntryFolderIdentity(existing);
            }
          }

          canonicalizeLorebookFolderRefs((activeData.lorebook as Record<string, unknown>[]) || []);

          // Broadcast update
          deps.broadcastToAll('data-updated', 'lorebook', activeData.lorebook);

          broadcastStatus({
            type: 'success',
            action: 'import-lorebook',
            message: `Imported ${resolution.toAdd.length + resolution.toOverwrite.length} entries.`,
          });

          const importedCount = resolution.toAdd.length + resolution.toOverwrite.length;
          return jsonResSuccess(
            res,
            {
              success: true,
              totalFound: importEntries.length,
              imported: resolution.toAdd.length,
              overwritten: resolution.toOverwrite.length,
              skipped: resolution.skipped.length,
              renamed: resolution.renamed.length,
              foldersCreated,
              errors,
            },
            {
              toolName: 'import_lorebook_from_files',
              summary: `Imported ${importedCount} lorebook entries (${resolution.toAdd.length} new, ${resolution.toOverwrite.length} overwritten)`,
              artifacts: {
                totalFound: importEntries.length,
                imported: resolution.toAdd.length,
                overwritten: resolution.toOverwrite.length,
              },
            },
          );
        } catch (err: unknown) {
          const rolledBack = lorebookRollback !== null;
          if (lorebookRollback) {
            activeData.lorebook = lorebookRollback;
            try {
              deps.broadcastToAll('data-updated', 'lorebook', activeData.lorebook);
            } catch {
              // The in-memory rollback is authoritative even if renderer notification fails.
            }
          }
          return mcpError(res, 500, {
            action: 'import-lorebook',
            message: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
            target: 'lorebook',
            details: { rolled_back: rolledBack },
            code: 'mutation_failed',
            retryable: false,
            retry_mode: 'never',
            outcome: rolledBack ? 'unchanged' : 'not_started',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /field/export — export a field to a file
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] === 'export' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'field/export', broadcastStatus);
        if (!body) return;

        const field = typeof body.field === 'string' ? body.field.trim() : '';
        const filePath = typeof body.file_path === 'string' ? body.file_path.trim() : '';
        const format = body.format === 'md' ? 'md' : 'txt';

        if (!field) {
          return mcpError(res, 400, {
            action: 'export-field',
            message: 'field is required.',
            target: 'field',
          });
        }
        if (!filePath) {
          return mcpError(res, 400, {
            action: 'export-field',
            message: 'file_path is required.',
            target: 'field',
          });
        }

        const value = (activeData as Record<string, unknown>)[field];
        if (value === undefined || value === null) {
          return mcpError(res, 404, {
            action: 'export-field',
            message: `Field "${field}" not found or empty.`,
            target: 'field',
          });
        }

        const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

        // User confirmation
        const confirmMsg =
          `AI 어시스턴트가 "${field}" 필드를 파일로 내보내려 합니다.\n\n` +
          `경로: ${filePath}\n` +
          `크기: ${Buffer.byteLength(content, 'utf-8').toLocaleString()} bytes`;
        const allowed = await deps.askRendererConfirm('MCP 필드 내보내기', confirmMsg);
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'export-field',
            message: 'User rejected export.',
            target: 'field',
          });
        }

        try {
          const result = await lorebookIo.exportFieldToFile(field, content, filePath, format);

          broadcastStatus({
            type: 'success',
            action: 'export-field',
            message: `Exported "${field}" to ${filePath}.`,
          });

          return jsonResSuccess(res, result as Record<string, unknown>, {
            toolName: 'export_field_to_file',
            summary: `Exported "${field}" to ${filePath}`,
            artifacts: {
              filePath: (result as Record<string, unknown>).filePath,
              size: (result as Record<string, unknown>).size,
            },
          });
        } catch (err: unknown) {
          return mcpError(res, 500, {
            action: 'export-field',
            message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
            target: 'field',
          });
        }
      }

      if (
        await handleCbsRoute(req, res, parts, url, {
          getCurrentData: deps.getCurrentData,
          openExternalDocument: deps.openExternalDocument,
          readJsonBody,
          broadcastStatus,
          jsonRes,
          jsonResSuccess,
          mcpError,
        })
      ) {
        return;
      }

      // ================================================================
      // RISUP: Prompt Items & Formating Order
      // ================================================================

      if (
        await handleRisupPromptRoute(req, res, parts, activeData, {
          api: deps,
          broadcastStatus,
          jsonResSuccess,
          mcpError,
        })
      ) {
        return;
      }

      // ----------------------------------------------------------------
      // GET /skills — list available skill documents
      // ----------------------------------------------------------------
      if (parts[0] === 'skills' && !parts[1] && req.method === 'GET') {
        try {
          const requestedScopes = url.searchParams
            .getAll('scope')
            .flatMap((value) => value.split(','))
            .map((value) => value.trim())
            .filter(Boolean);
          if (requestedScopes.some((scope) => !SKILL_SCOPES.has(scope as SkillScope))) {
            return mcpError(res, 400, {
              action: 'list_skills',
              message: 'Invalid skill scope',
              suggestion: 'Use product, common, bot, prompts, modules, or plugins.',
              target: 'skills:catalog',
            });
          }
          const detail = url.searchParams.get('detail') ?? 'full';
          if (detail !== 'summary' && detail !== 'full') {
            return mcpError(res, 400, {
              action: 'list_skills',
              message: 'Invalid skill detail mode',
              suggestion: 'Use detail=summary or detail=full.',
              target: 'skills:catalog',
            });
          }
          const limitValue = url.searchParams.get('limit');
          const limit = limitValue === null ? null : Number(limitValue);
          if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
            return mcpError(res, 400, {
              action: 'list_skills',
              message: 'Invalid skill page limit',
              suggestion: 'Use an integer limit from 1 through 50.',
              target: 'skills:catalog',
            });
          }
          const query = (url.searchParams.get('query') ?? '').trim().toLocaleLowerCase();
          const cursorBinding = skillCursorBinding({
            scopes: [...requestedScopes].sort(),
            query,
            detail,
            limit,
          });
          const cursorValue = url.searchParams.get('cursor');
          const offset = decodeSkillCursor('list', cursorValue, cursorBinding);
          if (offset === null) {
            return mcpError(res, 400, {
              action: 'list_skills',
              message: 'Invalid skill cursor',
              suggestion: 'Use the opaque next_cursor returned by list_skills.',
              target: 'skills:catalog',
            });
          }
          const skillRoots = resolvedSkillRoots(deps.getSkillRoots());
          const entries = listSkillCatalogEntries(skillRoots);
          const skills: Array<{
            name: string;
            description: string;
            tags: string[];
            relatedTools: string[];
            files: string[];
            scope: SkillScope;
          }> = [];
          for (const entry of entries) {
            const skillMdPath = path.join(entry.dirPath, 'SKILL.md');
            const raw = fs.readFileSync(skillMdPath, 'utf-8');
            const fm = parseYamlFrontmatter(raw);
            skills.push({
              name: fm.name || entry.name,
              description: fm.description || '',
              tags: fm.tags,
              relatedTools: fm.relatedTools,
              files: entry.files,
              scope: entry.scope,
            });
          }
          skills.sort((a, b) => a.name.localeCompare(b.name));
          const scopeSet = new Set(requestedScopes as SkillScope[]);
          const filtered = skills.filter((skill) => {
            if (scopeSet.size > 0 && !scopeSet.has(skill.scope)) return false;
            if (!query) return true;
            return [skill.name, skill.description, ...skill.tags, ...skill.relatedTools]
              .join('\n')
              .toLocaleLowerCase()
              .includes(query);
          });
          if (offset > filtered.length) {
            return mcpError(res, 400, {
              action: 'list_skills',
              message: 'Skill cursor is outside the filtered catalog',
              suggestion: 'Restart pagination without cursor after changing filters.',
              target: 'skills:catalog',
            });
          }
          const pageSize = limit ?? (cursorValue ? 50 : filtered.length);
          const page = filtered.slice(offset, offset + pageSize);
          const nextOffset = offset + page.length;
          const nextCursor = nextOffset < filtered.length ? encodeSkillCursor('list', nextOffset, cursorBinding) : null;
          const projected =
            detail === 'summary' ? page.map(({ name, description, scope }) => ({ name, description, scope })) : page;
          const optionsUsed =
            requestedScopes.length > 0 ||
            query.length > 0 ||
            detail !== 'full' ||
            limit !== null ||
            cursorValue !== null;
          return jsonResSuccess(
            res,
            {
              count: projected.length,
              skills: projected,
              ...(optionsUsed
                ? {
                    total_count: filtered.length,
                    detail,
                    next_cursor: nextCursor,
                    truncated: nextCursor !== null,
                  }
                : {}),
            },
            {
              toolName: 'list_skills',
              summary: `Listed ${projected.length} of ${filtered.length} skill(s)`,
              artifacts: { count: projected.length, total_count: filtered.length, next_cursor: nextCursor },
            },
          );
        } catch {
          return jsonResSuccess(
            res,
            { count: 0, skills: [], error: 'Skills directory not found' },
            {
              toolName: 'list_skills',
              summary: 'Skills directory not found',
              artifacts: { count: 0 },
            },
          );
        }
      }

      // ----------------------------------------------------------------
      // GET /skills/:name — read SKILL.md of a specific skill
      // GET /skills/:name/:file — read a reference file within a skill
      // ----------------------------------------------------------------
      if (parts[0] === 'skills' && parts[1] && req.method === 'GET') {
        const skillName = decodeURIComponent(parts[1]);
        const fileName = parts[2] ? decodeURIComponent(parts[2]) : 'SKILL.md';
        if (skillName.includes('..') || skillName.includes('/') || skillName.includes('\\')) {
          return mcpError(res, 400, {
            action: 'read_skill',
            message: 'Invalid skill name',
            suggestion: 'Skill name must not contain path separators or "..".',
            target: `skills:${skillName}:${fileName}`,
          });
        }
        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
          return mcpError(res, 400, {
            action: 'read_skill',
            message: 'Invalid file name',
            suggestion: 'File name must not contain path separators or "..".',
            target: `skills:${skillName}:${fileName}`,
          });
        }
        const skillRoots = resolvedSkillRoots(deps.getSkillRoots());
        const filePath = resolveSkillCatalogFile(skillRoots, skillName, fileName);
        try {
          if (!filePath) {
            throw new Error('missing skill file');
          }
          const fullContent = fs.readFileSync(filePath, 'utf-8');
          const cursorBinding = skillCursorBinding({
            skill: skillName,
            file: fileName,
            content_sha256: crypto.createHash('sha256').update(fullContent, 'utf8').digest('hex'),
          });
          const maxBytesValue = url.searchParams.get('max_bytes');
          const requestedMaxBytes = maxBytesValue === null ? null : Number(maxBytesValue);
          if (
            requestedMaxBytes !== null &&
            (!Number.isInteger(requestedMaxBytes) ||
              requestedMaxBytes < 1 ||
              requestedMaxBytes > SKILL_BOOTSTRAP_MAX_BYTES)
          ) {
            return mcpError(res, 400, {
              action: 'read_skill',
              message: 'Invalid max_bytes',
              suggestion: `Use an integer max_bytes from 1 through ${SKILL_BOOTSTRAP_MAX_BYTES}.`,
              target: `skills:${skillName}:${fileName}`,
            });
          }
          const cursorValue = url.searchParams.get('cursor');
          const offset = decodeSkillCursor('read', cursorValue, cursorBinding);
          const source = Buffer.from(fullContent, 'utf8');
          if (offset === null || offset > source.length) {
            return mcpError(res, 400, {
              action: 'read_skill',
              message: 'Invalid skill cursor',
              suggestion: 'Use the opaque next_cursor returned by read_skill.',
              target: `skills:${skillName}:${fileName}`,
            });
          }
          const prefix = source.subarray(0, offset).toString('utf8');
          if (Buffer.byteLength(prefix, 'utf8') !== offset) {
            return mcpError(res, 400, {
              action: 'read_skill',
              message: 'Skill cursor is not on a UTF-8 boundary',
              suggestion: 'Use the opaque next_cursor returned by read_skill.',
              target: `skills:${skillName}:${fileName}`,
            });
          }
          const bounded = requestedMaxBytes !== null || cursorValue !== null;
          const maxBytes = requestedMaxBytes ?? SKILL_BOOTSTRAP_MAX_BYTES;
          const slice = bounded
            ? utf8SliceAtBoundary(source, offset, maxBytes)
            : { text: fullContent, nextOffset: source.length };
          if (bounded && slice.nextOffset === offset && offset < source.length) {
            return mcpError(res, 400, {
              action: 'read_skill',
              message: 'max_bytes is too small to include the next complete UTF-8 code point',
              suggestion: 'Increase max_bytes to at least 4 and retry without changing the cursor.',
              target: `skills:${skillName}:${fileName}`,
            });
          }
          const nextCursor =
            slice.nextOffset < source.length ? encodeSkillCursor('read', slice.nextOffset, cursorBinding) : null;
          return jsonResSuccess(
            res,
            {
              skill: skillName,
              file: fileName,
              content: slice.text,
              ...(bounded
                ? {
                    offset_bytes: offset,
                    returned_bytes: Buffer.byteLength(slice.text, 'utf8'),
                    total_bytes: source.length,
                    max_bytes: maxBytes,
                    next_cursor: nextCursor,
                    truncated: nextCursor !== null,
                  }
                : {}),
            },
            {
              toolName: 'read_skill',
              summary: `Read skill ${skillName}/${fileName} (${Buffer.byteLength(slice.text, 'utf8')} bytes)`,
              artifacts: {
                skill: skillName,
                file: fileName,
                size: Buffer.byteLength(slice.text, 'utf8'),
                total_size: source.length,
                next_cursor: nextCursor,
              },
            },
          );
        } catch {
          return mcpError(res, 404, {
            action: 'read_skill',
            message: `Skill file not found: ${skillName}/${fileName}`,
            suggestion: 'list_skills로 사용 가능한 스킬 목록을 확인하세요.',
            target: `skills:${skillName}:${fileName}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // 404 fallback
      // ----------------------------------------------------------------
      mcpError(res, 404, {
        action: `${req.method} ${url.pathname}`,
        message: 'Not found',
        suggestion: '지원되는 MCP 엔드포인트 경로를 다시 확인하세요.',
        target: url.pathname,
      });
    } catch (err) {
      mcpError(
        res,
        500,
        {
          action: `${req.method} ${url.pathname}`,
          message: (err as Error).message,
          suggestion: '요청 payload와 현재 열려 있는 데이터를 확인한 뒤 다시 시도하세요.',
          target: url.pathname,
        },
        err,
      );
    }
  });

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    console.error(`[main] MCP API server on 127.0.0.1:${port}`);
    deps.onListening(port);
  });

  return {
    server,
    token,
    invalidateSectionCaches() {
      luaCache.invalidate();
      cssCache.invalidate();
      fieldSnapshots.clear();
    },
  };
}
