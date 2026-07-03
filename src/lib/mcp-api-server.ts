import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as lorebookIo from './lorebook-io';
import { handleAssetRoute } from './mcp-asset-routes';
import { handleCbsRoute } from './mcp-cbs-routes';
import { handleProbeRoute, type ProbeDocumentRequest } from './mcp-probe-routes';
import { fileStatMetadata, handleSessionStatusRoute } from './mcp-session-routes';
import { handleStructuredItemRoute } from './mcp-structured-item-routes';
import { handleRisupPromptRoute } from './mcp-risup-prompt-routes';
import { handleLorebookRoute } from './mcp-lorebook-routes';
import {
  fieldSnapshots,
  parseYamlFrontmatter,
  jsonRes,
  logMcpMutation,
  promptItemPreview,
  MAX_RISUP_PROMPT_BATCH,
  isReferenceTextField,
  buildReferenceFieldReadPayload,
  referenceDataWithFileType,
  getRisupStructuredFieldError,
  getRisupStructuredFieldSuggestion,
  McpNoOpInfo,
  jsonMcpError,
  jsonMcpNoOp,
  readJsonBody,
  LOREBOOK_ALLOWED_FIELDS,
  hashSurface,
  measureSurface,
  getPointerValue,
  getFieldMutationBlock,
  getHiddenFieldReadBlock,
  getSurfaceReadBlock,
  getSurfaceMutationBlock,
  getSurfacePatchMutationBlock,
  validateTouchedRisupJsonFields,
  applySurfacePatch,
  buildSurfaceList,
  inferDocumentFileType,
  replaceStringInSurface,
  setPointerValue,
  getSectionPreview,
  getSectionHash,
  buildSectionReadPayload,
  ensureSectionExpectedIdentity,
  normalizeLorebookEntryFolderIdentity,
  normalizeLorebookEntryForResponse,
  projectLorebookEntryForResponse,
  buildLorebookListResponse,
  buildRegexListResponse,
  normalizeRegexEntryForResponse,
  buildLuaListResponse,
  buildCssListResponse,
  buildGreetingListResponse,
  buildTriggerListResponse,
  buildFieldInventory,
  sameDocumentPath,
  getCurrentSessionFilePath,
  getExternalFieldAccess,
  isExternalReadableStringField,
  getExternalFieldMeasure,
  applyExternalFieldMutation,
  hasTraversalSegments,
  getExternalFileType,
  createLuaCache,
  createCssCache,
  ensureAssetExpectedPath,
} from './mcp-api-helpers';
import { handleSurfaceRoute } from './mcp-surface-routes';
import { canonicalizeLorebookFolderRefs, getFolderRef, resolveLorebookFolderRef } from './lorebook-folders';
import { SEARCHABLE_TEXT_FIELDS, searchAllTextSurfaces, searchTextBlock } from './mcp-search';
import { parsePromptTemplate, parseFormatingOrder, collectFormatingOrderWarnings } from './risup-prompt-model';
import { isRisupJsonTextFieldName } from './risup-json-fields';
import { listSkillCatalogEntries, resolveSkillCatalogFile } from './skill-catalog';
import { mcpSuccess, type McpErrorInfo, type McpSuccessOptions } from './mcp-response-envelope';
import type { RuntimeMetadata } from './mcp-runtime-contract';
import { normalizeLF, extToMime, cloneJson } from './shared-utils';
import { REF_SCALAR_FIELDS, getGreetingFieldName, getRefFileType } from './reference-shared';
import {
  replaceBodySchema,
  blockReplaceBodySchema,
  insertBodySchema,
  batchReplaceBodySchema,
  searchBodySchema,
  searchAllBodySchema,
  fieldBatchReadSchema,
  fieldBatchWriteSchema,
  externalDocumentBodySchema,
  validateBody,
  type ExternalDocumentBody,
} from './mcp-request-schemas';
import {
  BOOLEAN_FIELD_NAMES,
  FIELD_RESERVED_PATHS,
  MAX_FIELD_BATCH,
  NUMBER_FIELD_NAMES,
  buildFieldBatchReadResults,
  buildFieldReadResponsePayload,
  collectHiddenFieldWarnings,
  getFieldAccessRules,
  getHiddenFieldInfo,
  getStringMutationFieldStatus,
  getUnknownFieldHint,
  isHiddenField,
  redactHiddenFields,
  type SupportedFileType,
} from './mcp-field-access';

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
  getCurrentData: () => any;
  /** Return the loaded reference files array. */
  getReferenceFiles: () => any[];
  /** Show a confirmation dialog in the renderer and resolve with the user's choice. */
  askRendererConfirm: (title: string, message: string) => Promise<boolean>;
  /** Ask the renderer to switch the active document to a specific external file path. */
  requestRendererOpenFile: (request: RendererOpenFileRequest) => Promise<RendererOpenFileResponse>;
  /** Ask the app to save the current document. */
  saveCurrentDocument?: () => Promise<{ success: boolean; path?: string; error?: string }>;
  /** Broadcast an IPC message to all windows (main + popouts). */
  broadcastToAll: (channel: string, ...args: any[]) => void;
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
  openExternalDocument: (filePath: string) => any;
  saveExternalDocument: (filePath: string, fileType: SupportedFileType, data: any) => void;
  normalizeTriggerScripts: (data: any) => any;
  extractPrimaryLua: (scripts: any) => string;
  mergePrimaryLua: (scripts: any, lua: string) => any;
  stringifyTriggerScripts: (scripts: any) => string;

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
  let openFileRequestInFlight = false;

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

  async function resolveExternalDocumentRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    routePath: string,
    action: string,
    target: string,
  ): Promise<{ body: ExternalDocumentBody; filePath: string; fileType: SupportedFileType } | null> {
    const rawBody = await readJsonBody(req, res, routePath, broadcastStatus);
    if (!rawBody) return null;
    const parsed = parseBody(res, rawBody, externalDocumentBodySchema, {
      action,
      target,
      suggestion: '절대 경로의 file_path를 요청 본문에 포함하세요.',
    });
    if (!parsed) return null;
    const rawPath = parsed.file_path.trim();
    if (!rawPath) {
      mcpError(res, 400, {
        action,
        target,
        message: 'Missing "file_path"',
        suggestion: '절대 경로의 file_path를 요청 본문에 포함하세요.',
      });
      return null;
    }
    if (hasTraversalSegments(rawPath)) {
      mcpError(res, 400, {
        action,
        target,
        message: 'file_path must not include ".." path traversal segments',
        suggestion: '정규화된 절대 경로를 사용하고 ".." 세그먼트는 제거하세요.',
      });
      return null;
    }
    if (!path.isAbsolute(rawPath)) {
      mcpError(res, 400, {
        action,
        target,
        message: 'file_path must be an absolute path',
        suggestion: '예: C:\\path\\to\\file.charx 형식의 절대 경로를 사용하세요.',
      });
      return null;
    }

    const filePath = path.normalize(rawPath);
    const fileType = getExternalFileType(filePath);
    if (!fileType) {
      mcpError(res, 400, {
        action,
        target,
        message: `Unsupported file extension: ${path.extname(filePath) || '(none)'}`,
        suggestion: '지원되는 확장자는 .charx, .risum, .risup 입니다.',
      });
      return null;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch (error) {
      mcpError(
        res,
        400,
        {
          action,
          target,
          message: `External file not found: ${filePath}`,
          suggestion: 'file_path가 실제 존재하는 카드/모듈/프리셋 파일을 가리키는지 확인하세요.',
        },
        error,
      );
      return null;
    }
    if (!stat.isFile()) {
      mcpError(res, 400, {
        action,
        target,
        message: `file_path must point to a file: ${filePath}`,
        suggestion: '디렉터리가 아니라 실제 .charx/.risum/.risup 파일 경로를 사용하세요.',
      });
      return null;
    }

    return {
      body: parsed,
      filePath,
      fileType,
    };
  }

  async function readProbeDocumentRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    routePath: string,
    action: string,
    target: string,
  ): Promise<ProbeDocumentRequest | null> {
    const request = await resolveExternalDocumentRequest(req, res, routePath, action, target);
    if (!request) return null;

    try {
      return {
        ...request,
        data: deps.openExternalDocument(request.filePath),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mcpError(
        res,
        400,
        {
          action,
          target,
          message: `Failed to open ${request.fileType} file: ${message}`,
          suggestion: '손상되지 않은 유효한 .charx/.risum/.risup 파일인지 확인하세요.',
        },
        error,
      );
      return null;
    }
  }

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
          readProbeDocumentRequest,
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

      // ----------------------------------------------------------------
      // POST /external/inspect — inspect an unopened file without switching the UI document
      // ----------------------------------------------------------------
      if (parts[0] === 'external' && parts[1] === 'inspect' && !parts[2] && req.method === 'POST') {
        const probe = await readProbeDocumentRequest(
          req,
          res,
          'external/inspect',
          'inspect external file',
          'external:file',
        );
        if (!probe) return;
        const inventory = buildFieldInventory(probe.data, deps);
        const cssSections = buildCssListResponse(String(probe.data.css || ''), deps.parseCssSections);
        const luaSections = buildLuaListResponse(String(probe.data.lua || ''), deps.parseLuaSections);
        const stat = fileStatMetadata(probe.filePath);
        return jsonResSuccess(
          res,
          {
            file_path: probe.filePath,
            file_type: probe.fileType,
            integrity: {
              path: stat.path,
              exists: stat.exists,
              mtimeMs: stat.mtimeMs,
              size: stat.size,
              unavailableReason: stat.unavailableReason,
            },
            name: String(probe.data.name || path.basename(probe.filePath)),
            fieldCount: inventory.fields.length,
            fields: inventory.fields,
            hiddenFieldWarnings: inventory.hiddenFieldWarnings,
            surfaceCounts: {
              lorebook: Array.isArray(probe.data.lorebook) ? probe.data.lorebook.length : 0,
              regex: Array.isArray(probe.data.regex) ? probe.data.regex.length : 0,
              alternateGreetings: Array.isArray(probe.data.alternateGreetings)
                ? probe.data.alternateGreetings.length
                : 0,
              triggerScripts: Array.isArray(probe.data.triggerScripts) ? probe.data.triggerScripts.length : 0,
              cssSections: (cssSections as { count?: number }).count ?? 0,
              luaSections: (luaSections as { count?: number }).count ?? 0,
              risupPromptItems:
                probe.fileType === 'risup'
                  ? (() => {
                      const model = parsePromptTemplate(
                        typeof probe.data.promptTemplate === 'string' ? probe.data.promptTemplate : '',
                      );
                      return model.state === 'invalid' ? null : model.items.length;
                    })()
                  : null,
            },
          },
          {
            toolName: 'inspect_external_file',
            summary: `Inspected ${path.basename(probe.filePath)} (${inventory.fileType})`,
            artifacts: { fileType: inventory.fileType, fieldCount: inventory.fields.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /external/field/batch-write — write multiple fields in an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] === 'batch-write' &&
        !parts[3] &&
        req.method === 'POST'
      ) {
        const probe = await readProbeDocumentRequest(
          req,
          res,
          'external/field/batch-write',
          'external batch write field',
          'external:field:batch-write',
        );
        if (!probe) return;

        const currentFilePath = await getCurrentSessionFilePath(deps);
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external batch write field',
            message: 'The requested file is already open in the UI session.',
            suggestion:
              '현재 열린 문서는 external_* 대신 기존 write_field_batch 같은 active-document 도구를 사용하세요.',
            target: 'external:field:batch-write',
          });
        }

        const parsed = parseBody(res, probe.body as Record<string, unknown>, fieldBatchWriteSchema, {
          action: 'external batch write field',
          target: 'external:field:batch-write',
          suggestion:
            'entries 를 { field, content } 객체 배열로 전달하세요. 예: { "file_path": "...", "entries": [{ "field": "name", "content": "새 이름" }] }',
        });
        if (!parsed) return;
        const entries = parsed.entries;
        if (entries.length === 0) {
          return mcpError(res, 400, {
            action: 'external batch write field',
            message: 'entries must be a non-empty array of {field, content}',
            suggestion:
              'entries 를 { field, content } 객체 배열로 전달하세요. 예: { "file_path": "...", "entries": [{ "field": "name", "content": "새 이름" }] }',
            target: 'external:field:batch-write',
          });
        }
        if (entries.length > MAX_FIELD_BATCH) {
          return mcpError(res, 400, {
            action: 'external batch write field',
            message: `Maximum ${MAX_FIELD_BATCH} entries per batch`,
            suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 항목으로 나누어 여러 번 호출하세요.`,
            target: 'external:field:batch-write',
          });
        }

        const draftData = deps.openExternalDocument(probe.filePath) as Record<string, unknown>;
        const validatedEntries: Array<{ field: string; oldSize: number; newSize: number }> = [];
        for (const entry of entries) {
          const field = entry.field;
          if (!field || entry.content === undefined) {
            return mcpError(res, 400, {
              action: 'external batch write field',
              message: '각 항목에 "field"와 "content"가 필요합니다.',
              suggestion: '각 항목을 { "field": "<필드명>", "content": <값> } 형태로 전달하세요.',
              target: 'external:field:batch-write',
            });
          }
          const oldSize = getExternalFieldMeasure(draftData, field, deps);
          const applied = applyExternalFieldMutation(draftData, field, entry.content, deps);
          if (!applied.success) {
            return mcpError(res, 400, {
              action: 'external batch write field',
              message: applied.message,
              suggestion: applied.suggestion,
              target: `external:field:${field}`,
              details: applied.details,
            });
          }
          validatedEntries.push({ field, oldSize, newSize: applied.size });
        }

        const summary = validatedEntries
          .map((entry) => `${entry.field}: ${entry.oldSize} -> ${entry.newSize}`)
          .join('\n');
        const allowed = await deps.askRendererConfirm(
          'MCP 외부 파일 배치 수정 요청',
          `AI 어시스턴트가 UI에 열리지 않은 파일을 수정하려 합니다.\n파일: ${probe.filePath}\n항목 수: ${validatedEntries.length}\n${summary}`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'external batch write field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
            target: 'external:field:batch-write',
          });
        }

        const release = await acquireFieldMutex(`external:${probe.filePath}`);
        try {
          for (const entry of entries) {
            const applied = applyExternalFieldMutation(probe.data, entry.field, entry.content, deps);
            if (!applied.success) {
              return mcpError(res, 400, {
                action: 'external batch write field',
                message: applied.message,
                suggestion: applied.suggestion,
                target: `external:field:${entry.field}`,
                details: applied.details,
              });
            }
          }
          deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data);
          logMcpMutation('external batch write field', 'external:field:batch-write', {
            filePath: probe.filePath,
            count: validatedEntries.length,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              file_path: probe.filePath,
              file_type: probe.fileType,
              updated: validatedEntries,
            },
            {
              toolName: 'external_write_field_batch',
              summary: `Updated ${validatedEntries.length} field(s) in ${path.basename(probe.filePath)}`,
              artifacts: { count: validatedEntries.length, fileType: probe.fileType },
            },
          );
        } catch (error) {
          return mcpError(
            res,
            500,
            {
              action: 'external batch write field',
              message: error instanceof Error ? error.message : String(error),
              suggestion: '대상 파일이 저장 가능한 상태인지 확인한 뒤 다시 시도하세요.',
              target: 'external:field:batch-write',
            },
            error,
          );
        } finally {
          release();
        }
      }

      // ----------------------------------------------------------------
      // POST /external/field/:name — write a field in an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] &&
        !parts[3] &&
        parts[2] !== 'batch-write' &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `external/field/${fieldName}`,
          'external write field',
          `external:field:${fieldName}`,
        );
        if (!probe) return;

        const currentFilePath = await getCurrentSessionFilePath(deps);
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external write field',
            message: 'The requested file is already open in the UI session.',
            suggestion: '현재 열린 문서는 external_* 대신 기존 write_field 도구를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }

        if (!Object.prototype.hasOwnProperty.call(probe.body, 'content')) {
          return mcpError(res, 400, {
            action: 'external write field',
            message: 'content is required',
            suggestion: '{ "file_path": "...", "content": ... } 형식으로 값을 전달하세요.',
            target: `external:field:${fieldName}`,
          });
        }

        const oldSize = getExternalFieldMeasure(probe.data, fieldName, deps);
        const applied = applyExternalFieldMutation(
          probe.data,
          fieldName,
          (probe.body as Record<string, unknown>).content,
          deps,
        );
        if (!applied.success) {
          return mcpError(res, 400, {
            action: 'external write field',
            message: applied.message,
            suggestion: applied.suggestion,
            target: `external:field:${fieldName}`,
            details: applied.details,
          });
        }

        const allowed = await deps.askRendererConfirm(
          'MCP 외부 파일 수정 요청',
          `AI 어시스턴트가 UI에 열리지 않은 파일을 수정하려 합니다.\n파일: ${probe.filePath}\n필드: ${fieldName}\n크기: ${oldSize} -> ${applied.size}`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'external write field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
            target: `external:field:${fieldName}`,
          });
        }

        const release = await acquireFieldMutex(`external:${probe.filePath}:${fieldName}`);
        try {
          deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data);
          logMcpMutation('external write field', `external:field:${fieldName}`, {
            filePath: probe.filePath,
            oldSize,
            newSize: applied.size,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              file_path: probe.filePath,
              file_type: probe.fileType,
              field: fieldName,
              oldSize,
              newSize: applied.size,
            },
            {
              toolName: 'external_write_field',
              summary: `Updated "${fieldName}" in ${path.basename(probe.filePath)} (${oldSize}->${applied.size})`,
              artifacts: { fieldName, oldSize, newSize: applied.size, fileType: probe.fileType },
            },
          );
        } catch (error) {
          return mcpError(
            res,
            500,
            {
              action: 'external write field',
              message: error instanceof Error ? error.message : String(error),
              suggestion: '대상 파일이 저장 가능한 상태인지 확인한 뒤 다시 시도하세요.',
              target: `external:field:${fieldName}`,
            },
            error,
          );
        } finally {
          release();
        }
      }

      // ----------------------------------------------------------------
      // POST /external/field/:name/search — search a text field in an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] &&
        parts[3] === 'search' &&
        !parts[4] &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `external/field/${fieldName}/search`,
          'external search in field',
          `external:field:${fieldName}`,
        );
        if (!probe) return;
        const hiddenBlock = getHiddenFieldReadBlock(probe.data, fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'external search in field',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `external:field:${fieldName}`,
          });
        }
        if (!isExternalReadableStringField(probe.data, fieldName)) {
          return mcpError(res, 400, {
            action: 'external search in field',
            message: `"${fieldName}" 필드는 외부 문자열 검색을 지원하지 않습니다.`,
            suggestion:
              '문자열 타입 필드에만 사용 가능합니다. 구조화된 표면은 probe_* 또는 external_write_field를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        const parsed = parseBody(res, probe.body as Record<string, unknown>, searchBodySchema, {
          action: 'external search in field',
          target: `external:field:${fieldName}`,
          suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;

        const content = normalizeLF(
          typeof probe.data[fieldName] === 'string'
            ? (probe.data[fieldName] as string)
            : String(probe.data[fieldName] ?? ''),
        );
        const queryStr = normalizeLF(String(parsed.query));
        const contextChars = Math.max(0, Math.min(Number(parsed.context_chars) || 100, 500));
        const maxMatches = Math.max(1, Math.min(Number(parsed.max_matches) || 20, 100));
        const useRegex = !!parsed.regex;
        const flags = parsed.flags ?? (useRegex ? 'gi' : undefined);

        try {
          const result = searchTextBlock(content, {
            query: queryStr,
            regex: useRegex,
            flags,
            contextChars,
            maxMatches,
          });
          return jsonResSuccess(
            res,
            {
              file_path: probe.filePath,
              field: fieldName,
              query: result.query,
              totalMatches: result.totalMatches,
              returnedMatches: result.returnedMatches,
              fieldLength: result.contentLength,
              matches: result.matches,
            },
            {
              toolName: 'external_search_in_field',
              summary: `Found ${result.totalMatches} match(es) in "${fieldName}" from ${path.basename(probe.filePath)}`,
              artifacts: { fieldName, totalMatches: result.totalMatches },
            },
          );
        } catch (error) {
          return mcpError(res, 400, {
            action: 'external search in field',
            message: `Invalid regex: ${error instanceof Error ? error.message : String(error)}`,
            target: `external:field:${fieldName}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /external/field/:name/range — read part of a text field in an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] &&
        parts[3] === 'range' &&
        !parts[4] &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `external/field/${fieldName}/range`,
          'external read field range',
          `external:field:${fieldName}`,
        );
        if (!probe) return;
        const hiddenBlock = getHiddenFieldReadBlock(probe.data, fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'external read field range',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `external:field:${fieldName}`,
          });
        }
        if (!isExternalReadableStringField(probe.data, fieldName)) {
          return mcpError(res, 400, {
            action: 'external read field range',
            message: `"${fieldName}" 필드는 외부 범위 읽기를 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `external:field:${fieldName}`,
          });
        }
        const content =
          typeof probe.data[fieldName] === 'string'
            ? (probe.data[fieldName] as string)
            : String(probe.data[fieldName] ?? '');
        const MAX_RANGE_LENGTH = 10000;
        const offset = Math.max(0, Number((probe.body as Record<string, unknown>).offset) || 0);
        const length = Math.max(
          1,
          Math.min(Number((probe.body as Record<string, unknown>).length) || 2000, MAX_RANGE_LENGTH),
        );
        const slice = content.slice(offset, offset + length);
        return jsonResSuccess(
          res,
          {
            file_path: probe.filePath,
            field: fieldName,
            offset,
            length: slice.length,
            requestedLength: length,
            totalLength: content.length,
            content: slice,
          },
          {
            toolName: 'external_read_field_range',
            summary: `Read ${slice.length} chars from "${fieldName}" in ${path.basename(probe.filePath)}`,
            artifacts: { fieldName, offset, length: slice.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /external/field/:name/replace — replace text in an unopened file field
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] &&
        parts[3] === 'replace' &&
        !parts[4] &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `external/field/${fieldName}/replace`,
          'external replace in field',
          `external:field:${fieldName}`,
        );
        if (!probe) return;

        const currentFilePath = await getCurrentSessionFilePath(deps);
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external replace in field',
            message: 'The requested file is already open in the UI session.',
            suggestion: '현재 열린 문서는 external_* 대신 기존 replace_in_field 도구를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        const writeAccess = getExternalFieldAccess(probe.data, fieldName);
        if (!writeAccess.allowed || writeAccess.kind !== 'string') {
          return mcpError(res, 400, {
            action: 'external replace in field',
            message: writeAccess.message || `"${fieldName}" 필드는 외부 문자열 치환을 지원하지 않습니다.`,
            suggestion:
              writeAccess.suggestion ||
              '문자열 타입의 수정 가능한 필드에만 사용 가능합니다. 구조화된 표면은 external_write_field를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        if (!isExternalReadableStringField(probe.data, fieldName)) {
          return mcpError(res, 400, {
            action: 'external replace in field',
            message: `"${fieldName}" 필드는 외부 문자열 치환을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다. 구조화된 표면은 external_write_field를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        const parsed = parseBody(res, probe.body as Record<string, unknown>, replaceBodySchema, {
          action: 'external replace in field',
          target: `external:field:${fieldName}`,
          suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;

        const release = await acquireFieldMutex(`external:${probe.filePath}:${fieldName}`);
        try {
          const content = normalizeLF(String(probe.data[fieldName] ?? ''));
          const findStr = normalizeLF(parsed.find);
          const replaceStr = parsed.replace !== undefined ? normalizeLF(parsed.replace) : '';
          const useRegex = !!parsed.regex;
          const flags = parsed.flags || 'g';
          const dryRun = !!(parsed.dry_run ?? parsed.dryRun);
          let newContent: string;
          let matchCount: number;
          const matchPositions: Array<{ position: number; match: string }> = [];

          if (useRegex) {
            const re = new RegExp(findStr, flags);
            if (dryRun) {
              let match: RegExpExecArray | null;
              const reExec = new RegExp(findStr, flags.includes('g') ? flags : flags + 'g');
              while ((match = reExec.exec(content)) !== null) {
                matchPositions.push({ position: match.index, match: match[0] });
                if (!reExec.global) break;
              }
              matchCount = matchPositions.length;
            } else {
              const matches = content.match(re);
              matchCount = matches ? matches.length : 0;
            }
            newContent = content.replace(re, replaceStr);
          } else {
            matchCount = 0;
            let searchFrom = 0;
            while (true) {
              const pos = content.indexOf(findStr, searchFrom);
              if (pos === -1) break;
              matchCount++;
              if (dryRun) matchPositions.push({ position: pos, match: findStr });
              searchFrom = pos + findStr.length;
            }
            newContent = content.split(findStr).join(replaceStr);
          }

          if (matchCount === 0) {
            return mcpNoOp(
              res,
              {
                action: 'external replace in field',
                message: '일치하는 항목 없음',
                suggestion: 'external_search_in_field로 현재 내용을 다시 확인하고 find/regex/flags를 조정하세요.',
                target: `external:field:${fieldName}`,
              },
              {
                matchCount: 0,
                ...(dryRun ? { dryRun: true } : {}),
              },
            );
          }

          if (dryRun) {
            const contextChars = 60;
            const maxPreviewMatches = 30;
            const previews = matchPositions.slice(0, maxPreviewMatches).map((mp) => {
              const before = content.substring(Math.max(0, mp.position - contextChars), mp.position);
              const after = content.substring(
                mp.position + mp.match.length,
                mp.position + mp.match.length + contextChars,
              );
              return { position: mp.position, match: mp.match.substring(0, 200), before, after };
            });
            return jsonResSuccess(
              res,
              {
                dryRun: true,
                file_path: probe.filePath,
                field: fieldName,
                matchCount,
                fieldLength: content.length,
                previews,
                newSize: newContent.length,
              },
              {
                toolName: 'external_replace_in_field',
                summary: `Dry-run: ${matchCount} match(es) in "${fieldName}" from ${path.basename(probe.filePath)}`,
                artifacts: { matchCount, fieldLength: content.length },
              },
            );
          }

          const allowed = await deps.askRendererConfirm(
            'MCP 외부 파일 치환 요청',
            `AI 어시스턴트가 UI에 열리지 않은 파일의 "${fieldName}" 필드에서 ${matchCount}건 치환하려 합니다.\n파일: ${probe.filePath}\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
          );
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'external replace in field',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
              target: `external:field:${fieldName}`,
            });
          }

          probe.data[fieldName] = newContent;
          if (fieldName === 'lua') {
            probe.data.triggerScripts = deps.mergePrimaryLua(probe.data.triggerScripts, String(probe.data.lua || ''));
          }
          deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data);
          logMcpMutation('external replace in field', `external:field:${fieldName}`, {
            filePath: probe.filePath,
            matchCount,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              file_path: probe.filePath,
              field: fieldName,
              matchCount,
              oldSize: content.length,
              newSize: newContent.length,
            },
            {
              toolName: 'external_replace_in_field',
              summary: `Replaced ${matchCount} match(es) in "${fieldName}" from ${path.basename(probe.filePath)}`,
              artifacts: { fieldName, matchCount, oldSize: content.length, newSize: newContent.length },
            },
          );
        } catch (error) {
          return mcpError(
            res,
            500,
            {
              action: 'external replace in field',
              message: error instanceof Error ? error.message : String(error),
              suggestion: '대상 파일이 저장 가능한 상태인지 확인한 뒤 다시 시도하세요.',
              target: `external:field:${fieldName}`,
            },
            error,
          );
        } finally {
          release();
        }
      }

      // ----------------------------------------------------------------
      // POST /external/field/:name/insert — insert text into an unopened file field
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'field' &&
        parts[2] &&
        parts[3] === 'insert' &&
        !parts[4] &&
        req.method === 'POST'
      ) {
        const fieldName = decodeURIComponent(parts[2]);
        const probe = await readProbeDocumentRequest(
          req,
          res,
          `external/field/${fieldName}/insert`,
          'external insert in field',
          `external:field:${fieldName}`,
        );
        if (!probe) return;

        const currentFilePath = await getCurrentSessionFilePath(deps);
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external insert in field',
            message: 'The requested file is already open in the UI session.',
            suggestion: '현재 열린 문서는 external_* 대신 기존 insert_in_field 도구를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        const writeAccess = getExternalFieldAccess(probe.data, fieldName);
        if (!writeAccess.allowed || writeAccess.kind !== 'string') {
          return mcpError(res, 400, {
            action: 'external insert in field',
            message: writeAccess.message || `"${fieldName}" 필드는 외부 텍스트 삽입을 지원하지 않습니다.`,
            suggestion:
              writeAccess.suggestion ||
              '문자열 타입의 수정 가능한 필드에만 사용 가능합니다. 구조화된 표면은 external_write_field를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        if (!isExternalReadableStringField(probe.data, fieldName)) {
          return mcpError(res, 400, {
            action: 'external insert in field',
            message: `"${fieldName}" 필드는 외부 텍스트 삽입을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다. 구조화된 표면은 external_write_field를 사용하세요.',
            target: `external:field:${fieldName}`,
          });
        }
        const parsed = parseBody(res, probe.body as Record<string, unknown>, insertBodySchema, {
          action: 'external insert in field',
          target: `external:field:${fieldName}`,
          suggestion: '삽입할 content를 요청 본문에 포함하세요.',
        });
        if (!parsed) return;

        const release = await acquireFieldMutex(`external:${probe.filePath}:${fieldName}`);
        try {
          const oldContent = normalizeLF(String(probe.data[fieldName] ?? ''));
          const position = parsed.position || 'end';
          const insertContent = normalizeLF(parsed.content);
          let newContent: string;

          if (position === 'end') {
            newContent = oldContent + '\n' + insertContent;
          } else if (position === 'start') {
            newContent = insertContent + '\n' + oldContent;
          } else if ((position === 'after' || position === 'before') && parsed.anchor) {
            const anchorPos = oldContent.indexOf(normalizeLF(parsed.anchor));
            if (anchorPos === -1) {
              return mcpNoOp(res, {
                action: 'external insert in field',
                message: `앵커 문자열을 찾을 수 없음: ${parsed.anchor.substring(0, 80)}`,
                suggestion:
                  'external_read_field_range 또는 external_search_in_field로 현재 내용을 확인한 뒤 anchor를 다시 지정하세요.',
                target: `external:field:${fieldName}`,
              });
            }
            if (position === 'after') {
              const insertAt = anchorPos + normalizeLF(parsed.anchor).length;
              newContent = oldContent.slice(0, insertAt) + '\n' + insertContent + oldContent.slice(insertAt);
            } else {
              newContent = oldContent.slice(0, anchorPos) + insertContent + '\n' + oldContent.slice(anchorPos);
            }
          } else {
            return mcpError(res, 400, {
              action: 'external insert in field',
              message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
              suggestion: '{ "position": "after", "anchor": "기준 텍스트" } 형식으로 anchor를 전달하세요.',
              target: `external:field:${fieldName}`,
            });
          }

          const preview = parsed.content.substring(0, 100) + (parsed.content.length > 100 ? '...' : '');
          const allowed = await deps.askRendererConfirm(
            'MCP 외부 파일 삽입 요청',
            `AI 어시스턴트가 UI에 열리지 않은 파일의 "${fieldName}" 필드에 내용을 삽입하려 합니다.\n파일: ${probe.filePath}\n위치: ${position}${parsed.anchor ? ' "' + parsed.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
          );
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'external insert in field',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
              target: `external:field:${fieldName}`,
            });
          }

          probe.data[fieldName] = newContent;
          if (fieldName === 'lua') {
            probe.data.triggerScripts = deps.mergePrimaryLua(probe.data.triggerScripts, String(probe.data.lua || ''));
          }
          deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data);
          logMcpMutation('external insert in field', `external:field:${fieldName}`, {
            filePath: probe.filePath,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              file_path: probe.filePath,
              field: fieldName,
              position,
              oldSize: oldContent.length,
              newSize: newContent.length,
            },
            {
              toolName: 'external_insert_in_field',
              summary: `Inserted into "${fieldName}" in ${path.basename(probe.filePath)} (${oldContent.length}->${newContent.length})`,
              artifacts: { oldSize: oldContent.length, newSize: newContent.length, position },
            },
          );
        } catch (error) {
          return mcpError(
            res,
            500,
            {
              action: 'external insert in field',
              message: error instanceof Error ? error.message : String(error),
              suggestion: '대상 파일이 저장 가능한 상태인지 확인한 뒤 다시 시도하세요.',
              target: `external:field:${fieldName}`,
            },
            error,
          );
        } finally {
          release();
        }
      }

      if (req.method === 'POST' && url.pathname === '/open-file') {
        const request = await resolveExternalDocumentRequest(req, res, 'open-file', 'open file', 'open:file');
        if (!request) return;

        if (request.body.save_current !== undefined && typeof request.body.save_current !== 'boolean') {
          return mcpError(res, 400, {
            action: 'open file',
            message: 'save_current must be a boolean when provided',
            suggestion: 'save_current는 true 또는 false 로만 전달하세요.',
            target: 'open:file',
          });
        }

        if (openFileRequestInFlight) {
          return mcpError(res, 409, {
            action: 'open file',
            message: 'Another open_file request is already in progress',
            suggestion: '현재 문서 전환이 끝난 뒤 다시 시도하세요.',
            target: 'open:file',
          });
        }

        openFileRequestInFlight = true;
        try {
          const response = await deps.requestRendererOpenFile({
            filePath: request.filePath,
            fileType: request.fileType,
            saveCurrent: request.body.save_current === true,
            targetLabel: path.basename(request.filePath),
          });
          if (!response.success) {
            return mcpError(res, response.canceled ? 409 : 500, {
              action: 'open file',
              message: response.error || 'Renderer could not open the requested file.',
              suggestion:
                response.suggestion ||
                (response.canceled
                  ? '현재 문서의 저장/교체를 마친 뒤 다시 시도하세요.'
                  : 'RisuToki 메인 창과 renderer가 정상 동작 중인지 확인하세요.'),
              target: 'open:file',
            });
          }
          return jsonResSuccess(
            res,
            {
              file_path: response.filePath || request.filePath,
              file_type: response.fileType || request.fileType,
              name: response.name || path.basename(request.filePath),
              already_open: response.alreadyOpen === true,
              switched: response.alreadyOpen !== true,
              save_current: request.body.save_current === true,
            },
            {
              toolName: 'open_file',
              summary: `Opened ${response.name || path.basename(request.filePath)}${response.alreadyOpen ? ' (already open)' : ''}`,
              artifacts: {
                filePath: response.filePath || request.filePath,
                alreadyOpen: response.alreadyOpen === true,
              },
            },
          );
        } catch (error) {
          return mcpError(
            res,
            500,
            {
              action: 'open file',
              message: error instanceof Error ? error.message : String(error),
              suggestion: 'RisuToki 메인 창과 renderer 상태를 확인한 뒤 다시 시도하세요.',
              target: 'open:file',
            },
            error,
          );
        } finally {
          openFileRequestInFlight = false;
        }
      }

      // ----------------------------------------------------------------
      // POST /external/surface/read — JSON Pointer read from an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'surface' &&
        parts[2] === 'read' &&
        !parts[3] &&
        req.method === 'POST'
      ) {
        const probe = await readProbeDocumentRequest(
          req,
          res,
          'external/surface/read',
          'external read surface',
          'external:surface:read',
        );
        if (!probe) return;
        const currentFilePath = deps.getCurrentFilePath ? deps.getCurrentFilePath() : null;
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external read surface',
            message: 'The requested file is already open in the UI session.',
            suggestion: '현재 열린 문서는 read_surface를 사용하세요.',
            target: 'external:surface:read',
          });
        }
        const pointer = typeof probe.body.path === 'string' ? probe.body.path : '';
        const hiddenBlock = getSurfaceReadBlock(probe.data, pointer);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'external read surface',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `external:surface:${hiddenBlock.fieldName}`,
          });
        }
        try {
          const value =
            pointer && pointer !== '/' ? getPointerValue(probe.data, pointer) : redactHiddenFields(probe.data);
          return jsonResSuccess(
            res,
            {
              file_path: probe.filePath,
              file_type: probe.fileType,
              path: pointer || '/',
              value,
              hash: hashSurface(value),
              hiddenFieldWarnings: collectHiddenFieldWarnings(probe.data),
              ...measureSurface(value),
            },
            {
              toolName: 'external_read_surface',
              summary: `Read surface ${pointer || '/'} from ${path.basename(probe.filePath)}`,
            },
          );
        } catch (error) {
          return mcpError(res, 400, {
            action: 'external read surface',
            message: error instanceof Error ? error.message : String(error),
            suggestion: 'list_surfaces 또는 inspect_external_file로 대상 path를 확인하세요.',
            target: `external:surface:${pointer || '/'}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /external/surface/patch — JSON Patch an unopened file
      // ----------------------------------------------------------------
      if (
        parts[0] === 'external' &&
        parts[1] === 'surface' &&
        parts[2] === 'patch' &&
        !parts[3] &&
        req.method === 'POST'
      ) {
        const probe = await readProbeDocumentRequest(
          req,
          res,
          'external/surface/patch',
          'external patch surface',
          'external:surface:patch',
        );
        if (!probe) return;
        const currentFilePath = deps.getCurrentFilePath ? deps.getCurrentFilePath() : null;
        if (currentFilePath && sameDocumentPath(currentFilePath, probe.filePath)) {
          return mcpError(res, 409, {
            action: 'external patch surface',
            message: 'The requested file is already open in the UI session.',
            suggestion: '현재 열린 문서는 patch_surface를 사용하세요.',
            target: 'external:surface:patch',
          });
        }
        const operations = Array.isArray(probe.body.operations) ? probe.body.operations : null;
        if (!operations || operations.length === 0) {
          return mcpError(res, 400, {
            action: 'external patch surface',
            message: 'operations must be a non-empty JSON Patch array',
            suggestion:
              '{ "file_path": "...", "operations": [{ "op": "replace", "path": "/name", "value": "..." }] } 형태로 전달하세요.',
            target: 'external:surface:patch',
          });
        }
        const expectedHash = typeof probe.body.expected_hash === 'string' ? probe.body.expected_hash : undefined;
        const beforeHash = hashSurface(probe.data);
        if (expectedHash && expectedHash !== beforeHash) {
          return mcpError(res, 409, {
            action: 'external patch surface',
            message: 'Stale external document hash',
            suggestion: 'external_read_surface로 최신 hash를 확인한 뒤 다시 시도하세요.',
            target: 'external:surface:patch',
            details: { expected_hash: expectedHash, actual_hash: beforeHash },
          });
        }
        const mutationBlock = getSurfacePatchMutationBlock(probe.data, operations);
        if (mutationBlock) {
          return mcpError(res, 400, {
            action: 'external patch surface',
            message: mutationBlock.message,
            suggestion: mutationBlock.suggestion,
            target: `external:surface:${mutationBlock.fieldName}`,
          });
        }
        const draft = cloneJson(probe.data) as Record<string, unknown>;
        try {
          const result = applySurfacePatch(draft, operations);
          validateTouchedRisupJsonFields(draft, result.touchedTopLevel);
          const afterHash = hashSurface(draft);
          if (probe.body.dry_run === true) {
            return jsonResSuccess(
              res,
              {
                dry_run: true,
                file_path: probe.filePath,
                changed: result.changed,
                touched: result.touchedTopLevel,
                before_hash: beforeHash,
                after_hash: afterHash,
              },
              {
                toolName: 'external_patch_surface',
                summary: `Dry-run: patch ${result.changed} operation(s) in ${path.basename(probe.filePath)}`,
              },
            );
          }
          const allowed = await deps.askRendererConfirm(
            'MCP 외부 surface 수정 요청',
            `AI 어시스턴트가 UI에 열리지 않은 파일의 surface를 수정하려 합니다.\n파일: ${probe.filePath}\n작업 수: ${result.changed}\n대상: ${result.touchedTopLevel.join(', ') || '/'}`,
          );
          if (!allowed) {
            return mcpError(res, 403, {
              action: 'external patch surface',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
              target: 'external:surface:patch',
            });
          }
          deps.saveExternalDocument(probe.filePath, probe.fileType, draft);
          logMcpMutation('external patch surface', 'external:surface:patch', {
            filePath: probe.filePath,
            changed: result.changed,
            touched: result.touchedTopLevel,
          });
          return jsonResSuccess(
            res,
            {
              success: true,
              file_path: probe.filePath,
              file_type: probe.fileType,
              changed: result.changed,
              touched: result.touchedTopLevel,
              before_hash: beforeHash,
              after_hash: afterHash,
            },
            {
              toolName: 'external_patch_surface',
              summary: `Patched ${result.changed} operation(s) in ${path.basename(probe.filePath)}`,
              artifacts: { count: result.changed, fileType: probe.fileType },
            },
          );
        } catch (error) {
          return mcpError(res, 400, {
            action: 'external patch surface',
            message: error instanceof Error ? error.message : String(error),
            suggestion: 'JSON Pointer path와 patch operation을 확인하세요.',
            target: 'external:surface:patch',
          });
        }
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

      if (
        await handleSurfaceRoute(req, res, parts, currentData, {
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

      // ----------------------------------------------------------------
      // GET /fields
      // ----------------------------------------------------------------
      if (req.method === 'GET' && parts[0] === 'fields' && !parts[1]) {
        const inventory = buildFieldInventory(currentData, deps);
        return jsonResSuccess(
          res,
          {
            fileType: inventory.fileType,
            fields: inventory.fields,
            hiddenFieldWarnings: inventory.hiddenFieldWarnings,
          },
          {
            toolName: 'list_fields',
            summary: `Listed ${inventory.fields.length} fields (${inventory.fileType})`,
            artifacts: { count: inventory.fields.length, fileType: inventory.fileType },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET/POST /field/:name
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && !parts[2] && !FIELD_RESERVED_PATHS.includes(parts[1])) {
        const fieldName = decodeURIComponent(parts[1]);
        const rules = getFieldAccessRules(currentData);
        const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);

        if (!hiddenBlock && !rules.allowedFields.includes(fieldName)) {
          const action = req.method === 'GET' ? 'read field' : 'update field';
          return mcpError(res, 400, {
            action,
            message: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}`,
            suggestion: 'list_fields 또는 GET /field/batch 로 허용된 필드를 다시 확인하세요.',
            target: `field:${fieldName}`,
          });
        }

        if (req.method === 'GET') {
          if (hiddenBlock) {
            return mcpError(res, 400, {
              action: 'read field',
              message: hiddenBlock.message,
              suggestion: hiddenBlock.suggestion,
              target: `field:${fieldName}`,
            });
          }
          const readPayload = buildFieldReadResponsePayload(currentData, fieldName, deps);
          return jsonResSuccess(res, readPayload, {
            toolName: 'read_field',
            summary: `Read field "${fieldName}"`,
            artifacts: { fieldName },
          });
        }

        if (req.method === 'POST') {
          if (hiddenBlock) {
            const mutationBlock = getFieldMutationBlock(currentData, fieldName) ?? hiddenBlock;
            return mcpError(res, 400, {
              action: 'update field',
              message: mutationBlock.message,
              suggestion: mutationBlock.suggestion,
              target: `field:${fieldName}`,
            });
          }
          const mutationBlock = getFieldMutationBlock(currentData, fieldName);
          if (mutationBlock) {
            return mcpError(res, 400, {
              action: 'update field',
              message: mutationBlock.message,
              suggestion: mutationBlock.suggestion,
              target: `field:${fieldName}`,
            });
          }
          // Read-only fields check
          if (rules.readOnlyFields.includes(fieldName)) {
            return mcpError(res, 400, {
              action: 'update field',
              message: `"${fieldName}" 필드는 읽기 전용입니다.`,
              suggestion: '이 필드는 수정할 수 없습니다.',
              target: `field:${fieldName}`,
            });
          }
          const body = await readJsonBody(req, res, `field/${fieldName}`, broadcastStatus);
          if (!body) return;
          if (body.content === undefined) {
            return mcpError(res, 400, {
              action: 'update field',
              message: 'Missing "content"',
              suggestion: 'content 필드를 포함한 요청 본문을 보내세요.',
              target: `field:${fieldName}`,
            });
          }
          // Validate content type: must be string or array (for alternateGreetings)
          const arrayFields = ['alternateGreetings'];
          if (arrayFields.includes(fieldName)) {
            if (!Array.isArray(body.content)) {
              return mcpError(res, 400, {
                action: 'update field',
                message: `"${fieldName}" must be an array`,
                suggestion: '문자열 배열 형태로 값을 다시 보내세요.',
                target: `field:${fieldName}`,
              });
            }
          } else if (fieldName !== 'triggerScripts' && typeof body.content !== 'string') {
            return mcpError(res, 400, {
              action: 'update field',
              message: `"${fieldName}" must be a string`,
              suggestion: '문자열 형태로 값을 다시 보내세요.',
              target: `field:${fieldName}`,
            });
          }
          const risupStructuredFieldError = getRisupStructuredFieldError(fieldName, body.content);
          if (risupStructuredFieldError) {
            return mcpError(res, 400, {
              action: 'update field',
              message: `Invalid ${fieldName}: ${risupStructuredFieldError}`,
              suggestion: getRisupStructuredFieldSuggestion(fieldName),
              target: `field:${fieldName}`,
              details: { parseError: risupStructuredFieldError },
            });
          }
          const oldSize =
            fieldName === 'triggerScripts'
              ? deps.stringifyTriggerScripts(currentData.triggerScripts).length
              : Array.isArray(currentData[fieldName])
                ? currentData[fieldName].length
                : (currentData[fieldName] || '').length;
          const newSize =
            fieldName === 'triggerScripts'
              ? String(body.content || '').length
              : Array.isArray(body.content)
                ? body.content.length
                : body.content.length;

          const allowed = await deps.askRendererConfirm(
            'MCP 수정 요청',
            `AI 어시스턴트가 "${fieldName}" 필드를 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`,
          );

          if (allowed) {
            let content = body.content;
            if (fieldName === 'alternateGreetings') {
              content = (content as unknown[]).map((item: unknown) => String(item));
            }
            // Strip <style> wrapper from CSS to prevent nesting
            if (fieldName === 'css') {
              content = content.replace(/^\s*<style[^>]*>\s*/i, '').replace(/\s*<\/style>\s*$/i, '');
            }
            if (fieldName === 'triggerScripts') {
              try {
                currentData.triggerScripts = deps.normalizeTriggerScripts(content);
                currentData.lua = deps.extractPrimaryLua(currentData.triggerScripts);
              } catch (error) {
                return mcpError(
                  res,
                  400,
                  {
                    action: 'update field',
                    message: (error as Error).message,
                    suggestion: 'triggerScripts JSON 구조와 스크립트 배열 형식을 확인하세요.',
                    target: 'field:triggerScripts',
                  },
                  error,
                );
              }
              logMcpMutation('update field', 'field:triggerScripts', { oldSize, newSize });
              deps.broadcastToAll(
                'data-updated',
                'triggerScripts',
                deps.stringifyTriggerScripts(currentData.triggerScripts),
              );
              deps.broadcastToAll('data-updated', 'lua', currentData.lua);
              const tsSize = deps.stringifyTriggerScripts(currentData.triggerScripts).length;
              return jsonResSuccess(
                res,
                {
                  success: true,
                  field: fieldName,
                  size: tsSize,
                },
                {
                  toolName: 'write_field',
                  summary: `Updated triggerScripts (${tsSize} chars)`,
                  artifacts: { fieldName, size: tsSize },
                },
              );
            }
            currentData[fieldName] = content;
            if (fieldName === 'lua') {
              currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
              deps.broadcastToAll(
                'data-updated',
                'triggerScripts',
                deps.stringifyTriggerScripts(currentData.triggerScripts),
              );
            }
            logMcpMutation('update field', `field:${fieldName}`, { oldSize, newSize });
            deps.broadcastToAll('data-updated', fieldName, content);
            return jsonResSuccess(
              res,
              { success: true, field: fieldName, size: content.length },
              {
                toolName: 'write_field',
                summary: `Updated "${fieldName}" (${oldSize}→${content.length} chars)`,
                artifacts: { fieldName, oldSize, newSize: content.length },
              },
            );
          } else {
            return mcpError(res, 403, {
              action: 'update field',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 변경 요청을 허용한 뒤 다시 시도하세요.',
              target: `field:${fieldName}`,
            });
          }
        }
      }

      // ----------------------------------------------------------------
      // POST /field/batch — read multiple fields at once
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] === 'batch' && !parts[2] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'field/batch', broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, fieldBatchReadSchema, {
          action: 'read field batch',
          target: 'field:batch',
          suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "fields": ["name", "description"] }',
        });
        if (!parsed) return;
        const fields = parsed.fields;
        if (fields.length === 0) {
          return mcpError(res, 400, {
            action: 'read field batch',
            message: 'fields must be a non-empty string array',
            suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "fields": ["name", "description"] }',
            target: 'field:batch',
          });
        }
        if (fields.length > MAX_FIELD_BATCH) {
          return mcpError(res, 400, {
            action: 'read field batch',
            message: `Maximum ${MAX_FIELD_BATCH} fields per batch`,
            suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 필드로 나누어 여러 번 호출하세요.`,
            target: 'field:batch',
          });
        }
        const results = buildFieldBatchReadResults(currentData, fields, deps);
        return jsonResSuccess(
          res,
          { count: results.length, fields: results },
          {
            toolName: 'read_field_batch',
            summary: `Read ${results.length} fields`,
            artifacts: { count: results.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /field/batch-write — write multiple fields at once (single confirmation)
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] === 'batch-write' && !parts[2] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'field/batch-write', broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, fieldBatchWriteSchema, {
          action: 'batch write field',
          target: 'field:batch-write',
          suggestion:
            'entries 를 { field, content } 객체 배열로 전달하세요. 예: { "entries": [{ "field": "name", "content": "새 이름" }] }',
        });
        if (!parsed) return;
        const entries = parsed.entries;
        if (entries.length === 0) {
          return mcpError(res, 400, {
            action: 'batch write field',
            message: 'entries must be a non-empty array of {field, content}',
            suggestion:
              'entries 를 { field, content } 객체 배열로 전달하세요. 예: { "entries": [{ "field": "name", "content": "새 이름" }] }',
            target: 'field:batch-write',
          });
        }
        if (entries.length > MAX_FIELD_BATCH) {
          return mcpError(res, 400, {
            action: 'batch write field',
            message: `Maximum ${MAX_FIELD_BATCH} entries per batch`,
            suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 항목으로 나누어 여러 번 호출하세요.`,
            target: 'field:batch-write',
          });
        }
        // Surface-aware validation (mirrors single-field POST /field/:name)
        const rules = getFieldAccessRules(currentData);
        const readOnlyFields = rules.readOnlyFields;
        const deprecatedFields = rules.deprecatedFields;
        // Exclude complex fields that need special handling
        const excludedFields = ['triggerScripts', 'alternateGreetings', 'lorebook'];
        // Validate all entries before asking for confirmation
        const validatedEntries: Array<{
          field: string;
          content: unknown;
          oldSize: number;
          newSize: number;
          type: string;
        }> = [];
        const boolFields = BOOLEAN_FIELD_NAMES;
        const numFields = NUMBER_FIELD_NAMES;
        const surfaceWritable = new Set(
          rules.allowedFields.filter(
            (field) =>
              !readOnlyFields.includes(field) && !deprecatedFields.includes(field) && !excludedFields.includes(field),
          ),
        );

        for (const entry of entries) {
          if (!entry.field || entry.content === undefined) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `각 항목에 "field"와 "content"가 필요합니다.`,
              suggestion: '각 항목을 { "field": "<필드명>", "content": <값> } 형태로 전달하세요.',
              target: 'field:batch-write',
            });
          }
          const mutationBlock = getFieldMutationBlock(currentData, entry.field);
          if (mutationBlock) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: mutationBlock.message,
              suggestion: mutationBlock.suggestion,
              target: `field:${entry.field}`,
            });
          }
          if (readOnlyFields.includes(entry.field)) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `"${entry.field}" 필드는 읽기 전용입니다.`,
              suggestion: `"${entry.field}" 항목을 entries 배열에서 제거하세요. 이 필드는 시스템이 자동 관리합니다.`,
              target: `field:${entry.field}`,
            });
          }
          if (deprecatedFields.includes(entry.field)) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `"${entry.field}" 필드는 charx에서 읽기 전용(deprecated)입니다.`,
              suggestion: `이 필드는 수정할 수 없습니다. entries 배열에서 "${entry.field}" 항목을 제거하세요.`,
              target: `field:${entry.field}`,
            });
          }
          if (excludedFields.includes(entry.field)) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `"${entry.field}" 필드는 batch-write에서 지원하지 않습니다. write_field를 개별 사용하세요.`,
              suggestion: `"${entry.field}" 항목을 entries에서 제거하고 POST /field/${entry.field} 로 개별 호출하세요.`,
              target: `field:${entry.field}`,
            });
          }
          if (!surfaceWritable.has(entry.field)) {
            return mcpError(res, 400, {
              action: 'batch write field',
              message: `Unknown field: ${entry.field} ${getUnknownFieldHint(rules)}`,
              suggestion: 'list_fields 또는 GET /field/batch 로 허용된 필드를 다시 확인하세요.',
              target: `field:${entry.field}`,
            });
          }
          // Type validation
          let type = 'string';
          if (boolFields.includes(entry.field)) {
            type = 'boolean';
            if (typeof entry.content !== 'boolean') {
              return mcpError(res, 400, {
                action: 'batch write field',
                message: `"${entry.field}"는 boolean 타입이어야 합니다.`,
                suggestion: `"${entry.field}" 값을 true 또는 false 로 전달하세요. (현재: ${typeof entry.content})`,
                target: `field:${entry.field}`,
              });
            }
          } else if (numFields.includes(entry.field)) {
            type = 'number';
            if (typeof entry.content !== 'number') {
              return mcpError(res, 400, {
                action: 'batch write field',
                message: `"${entry.field}"는 number 타입이어야 합니다.`,
                suggestion: `"${entry.field}" 값을 숫자로 전달하세요. (현재: ${typeof entry.content})`,
                target: `field:${entry.field}`,
              });
            }
          } else if (isRisupJsonTextFieldName(entry.field)) {
            type = 'json';
            if (typeof entry.content !== 'string') {
              return mcpError(res, 400, {
                action: 'batch write field',
                message: `"${entry.field}"는 문자열 타입이어야 합니다.`,
                suggestion: `"${entry.field}" 값을 JSON 문자열로 전달하세요. (현재: ${typeof entry.content})`,
                target: `field:${entry.field}`,
              });
            }
            const structuredError = getRisupStructuredFieldError(entry.field, entry.content);
            if (structuredError) {
              return mcpError(res, 400, {
                action: 'batch write field',
                message: `Invalid ${entry.field}: ${structuredError}`,
                suggestion: getRisupStructuredFieldSuggestion(entry.field),
                target: `field:${entry.field}`,
                details: { parseError: structuredError },
              });
            }
          } else {
            if (typeof entry.content !== 'string') {
              return mcpError(res, 400, {
                action: 'batch write field',
                message: `"${entry.field}"는 문자열 타입이어야 합니다.`,
                suggestion: `"${entry.field}" 값을 문자열로 전달하세요. (현재: ${typeof entry.content})`,
                target: `field:${entry.field}`,
              });
            }
          }
          const oldVal = currentData[entry.field];
          const oldSize = type === 'boolean' || type === 'number' ? String(oldVal ?? '').length : (oldVal || '').length;
          const newSize =
            type === 'boolean' || type === 'number' ? String(entry.content).length : (entry.content as string).length;
          validatedEntries.push({ field: entry.field, content: entry.content, oldSize, newSize, type });
        }

        // Build summary for confirmation
        const summary = validatedEntries.map((e) => `• ${e.field}: ${e.oldSize}→${e.newSize}`).join('\n');
        const allowed = await deps.askRendererConfirm(
          'MCP 필드 일괄 수정 요청',
          `AI 어시스턴트가 ${validatedEntries.length}개 필드를 수정하려 합니다:\n${summary}`,
        );
        if (allowed) {
          const results: Array<{ field: string; success: boolean; oldSize: number; newSize: number }> = [];
          for (const entry of validatedEntries) {
            let content = entry.content;
            // Strip <style> wrapper from CSS
            if (entry.field === 'css' && typeof content === 'string') {
              content = content.replace(/^\s*<style[^>]*>\s*/i, '').replace(/\s*<\/style>\s*$/i, '');
            }
            currentData[entry.field] = content;
            if (entry.field === 'lua') {
              currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
              deps.broadcastToAll(
                'data-updated',
                'triggerScripts',
                deps.stringifyTriggerScripts(currentData.triggerScripts),
              );
            }
            deps.broadcastToAll('data-updated', entry.field, content);
            results.push({ field: entry.field, success: true, oldSize: entry.oldSize, newSize: entry.newSize });
          }
          logMcpMutation('batch write fields', 'field:batch-write', {
            count: results.length,
            fields: results.map((r) => r.field),
          });
          return jsonResSuccess(
            res,
            { success: true, count: results.length, results },
            {
              toolName: 'write_field_batch',
              summary: `Batch-wrote ${results.length} fields`,
              artifacts: { count: results.length, fields: results.map((r) => r.field) },
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'batch write field',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 일괄 수정 요청을 허용한 뒤 다시 시도하세요.',
            target: 'field:batch-write',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /field/:name/replace — replace text in a string field
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'replace' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const mutationFieldStatus = getStringMutationFieldStatus(fieldName, currentData);
        if (mutationFieldStatus === 'read-only') {
          return mcpError(res, 400, {
            action: 'replace in field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        if (mutationFieldStatus !== 'ok') {
          return mcpError(res, 400, {
            action: 'replace in field',
            message: `"${fieldName}" 필드는 문자열 치환을 지원하지 않습니다.`,
            suggestion:
              '문자열 타입 필드에만 사용 가능합니다. 배열/boolean/number/triggerScripts 필드는 write_field를 사용하세요.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}/replace`, broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, replaceBodySchema, {
          action: 'replace in field',
          target: `field:${fieldName}`,
          suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;
        // Acquire mutex to prevent parallel writes on same field
        const release = await acquireFieldMutex(fieldName);
        try {
          const content: string = normalizeLF(currentData[fieldName] || '');
          const findStr: string = normalizeLF(parsed.find);
          const replaceStr: string = parsed.replace !== undefined ? normalizeLF(parsed.replace) : '';
          const useRegex = !!parsed.regex;
          const flags: string = parsed.flags || 'g';
          const dryRun = !!(parsed.dry_run ?? parsed.dryRun);
          let newContent: string;
          let matchCount: number;

          // Collect match positions for dry-run preview
          const matchPositions: Array<{ position: number; match: string }> = [];
          if (useRegex) {
            const re = new RegExp(findStr, flags);
            if (dryRun) {
              let m: RegExpExecArray | null;
              const reExec = new RegExp(findStr, flags.includes('g') ? flags : flags + 'g');
              while ((m = reExec.exec(content)) !== null) {
                matchPositions.push({ position: m.index, match: m[0] });
                if (!reExec.global) break;
              }
              matchCount = matchPositions.length;
            } else {
              const matches = content.match(re);
              matchCount = matches ? matches.length : 0;
            }
            newContent = content.replace(re, replaceStr);
          } else {
            matchCount = 0;
            let searchFrom = 0;
            while (true) {
              const pos = content.indexOf(findStr, searchFrom);
              if (pos === -1) break;
              matchCount++;
              if (dryRun) matchPositions.push({ position: pos, match: findStr });
              searchFrom = pos + findStr.length;
            }
            newContent = content.split(findStr).join(replaceStr);
          }
          if (matchCount === 0) {
            return mcpNoOp(
              res,
              {
                action: 'replace in field',
                message: '일치하는 항목 없음',
                suggestion:
                  'read_field 또는 search_in_field로 현재 내용을 다시 확인하고 find/regex/flags를 조정하세요.',
                target: `field:${fieldName}`,
              },
              {
                matchCount: 0,
                ...(dryRun ? { dryRun: true } : {}),
              },
            );
          }

          // Dry-run: return match preview without modifying data
          if (dryRun) {
            const contextChars = 60;
            const maxPreviewMatches = 30;
            const previews = matchPositions.slice(0, maxPreviewMatches).map((mp) => {
              const before = content.substring(Math.max(0, mp.position - contextChars), mp.position);
              const after = content.substring(
                mp.position + mp.match.length,
                mp.position + mp.match.length + contextChars,
              );
              return { position: mp.position, match: mp.match.substring(0, 200), before, after };
            });
            return jsonResSuccess(
              res,
              {
                dryRun: true,
                field: fieldName,
                matchCount,
                fieldLength: content.length,
                previews,
                newSize: newContent.length,
              },
              {
                toolName: 'replace_in_field',
                summary: `Dry-run: ${matchCount} match(es) in "${fieldName}"`,
                artifacts: { matchCount, fieldLength: content.length },
              },
            );
          }

          const allowed = await deps.askRendererConfirm(
            'MCP 필드 치환 요청',
            `AI 어시스턴트가 "${fieldName}" 필드에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
          );
          if (allowed) {
            currentData[fieldName] = newContent;
            if (fieldName === 'lua') {
              currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
              deps.broadcastToAll(
                'data-updated',
                'triggerScripts',
                deps.stringifyTriggerScripts(currentData.triggerScripts),
              );
            }
            logMcpMutation('replace in field', `field:${fieldName}`, { matchCount });
            deps.broadcastToAll('data-updated', fieldName, newContent);
            return jsonResSuccess(
              res,
              {
                success: true,
                field: fieldName,
                matchCount,
                oldSize: content.length,
                newSize: newContent.length,
              },
              {
                toolName: 'replace_in_field',
                summary: `Replaced ${matchCount} match(es) in "${fieldName}" (${content.length}→${newContent.length})`,
                artifacts: { fieldName, matchCount, oldSize: content.length, newSize: newContent.length },
              },
            );
          } else {
            return mcpError(res, 403, {
              action: 'replace in field',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
              target: `field:${fieldName}`,
            });
          }
        } finally {
          release();
        }
      }

      // ----------------------------------------------------------------
      // POST /field/:name/block-replace — replace a multiline block between two anchors
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'block-replace' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const mutationFieldStatus = getStringMutationFieldStatus(fieldName, currentData);
        if (mutationFieldStatus === 'read-only') {
          return mcpError(res, 400, {
            action: 'block replace in field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        if (mutationFieldStatus !== 'ok') {
          return mcpError(res, 400, {
            action: 'block replace in field',
            message: `"${fieldName}" 필드는 블록 치환을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}/block-replace`, broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, blockReplaceBodySchema, {
          action: 'block replace in field',
          target: `field:${fieldName}`,
          suggestion: '블록의 시작과 끝을 나타내는 앵커 문자열이 필요합니다.',
        });
        if (!parsed) return;
        const release = await acquireFieldMutex(fieldName);
        try {
          const content = normalizeLF(currentData[fieldName] || '');
          const startAnchor = normalizeLF(parsed.start_anchor);
          const endAnchor = normalizeLF(parsed.end_anchor);
          const newBlock: string = parsed.content !== undefined ? normalizeLF(parsed.content) : '';
          const includeAnchors = parsed.include_anchors !== false; // default true: anchors are replaced too
          const dryRun = !!(parsed.dry_run ?? parsed.dryRun);

          const startPos = content.indexOf(startAnchor);
          if (startPos === -1) {
            return mcpNoOp(res, {
              action: 'block replace in field',
              message: `시작 앵커를 찾을 수 없음: ${startAnchor.substring(0, 80)}`,
              suggestion:
                'read_field 또는 read_field_range로 현재 내용을 확인해 start_anchor/end_anchor를 다시 지정하세요.',
              target: `field:${fieldName}`,
            });
          }
          const searchAfter = startPos + startAnchor.length;
          const endPos = content.indexOf(endAnchor, searchAfter);
          if (endPos === -1) {
            return mcpNoOp(
              res,
              {
                action: 'block replace in field',
                message: `끝 앵커를 찾을 수 없음 (시작 앵커 이후): ${endAnchor.substring(0, 80)}`,
                suggestion:
                  'read_field 또는 read_field_range로 현재 내용을 확인해 start_anchor/end_anchor를 다시 지정하세요.',
                target: `field:${fieldName}`,
              },
              { startAnchorFoundAt: startPos },
            );
          }

          // Determine what range to replace
          let replaceStart: number, replaceEnd: number;
          if (includeAnchors) {
            replaceStart = startPos;
            replaceEnd = endPos + endAnchor.length;
          } else {
            replaceStart = startPos + startAnchor.length;
            replaceEnd = endPos;
          }
          const oldBlock = content.slice(replaceStart, replaceEnd);
          const newContent = content.slice(0, replaceStart) + newBlock + content.slice(replaceEnd);

          if (dryRun) {
            return jsonResSuccess(
              res,
              {
                dryRun: true,
                field: fieldName,
                startAnchorAt: startPos,
                endAnchorAt: endPos,
                includeAnchors,
                oldBlockSize: oldBlock.length,
                oldBlockPreview: oldBlock.substring(0, 300) + (oldBlock.length > 300 ? '...' : ''),
                newBlockSize: newBlock.length,
                newBlockPreview: newBlock.substring(0, 300) + (newBlock.length > 300 ? '...' : ''),
                fieldLength: content.length,
                newFieldLength: newContent.length,
              },
              {
                toolName: 'replace_block_in_field',
                summary: `Dry-run: block in "${fieldName}" (${oldBlock.length}→${newBlock.length} chars)`,
                artifacts: { oldBlockSize: oldBlock.length, newBlockSize: newBlock.length },
              },
            );
          }

          const allowed = await deps.askRendererConfirm(
            'MCP 블록 치환 요청',
            `AI 어시스턴트가 "${fieldName}" 필드에서 블록 치환하려 합니다.\n시작: ${startAnchor.substring(0, 60)}\n끝: ${endAnchor.substring(0, 60)}\n블록 크기: ${oldBlock.length}→${newBlock.length}자`,
          );
          if (allowed) {
            currentData[fieldName] = newContent;
            if (fieldName === 'lua') {
              currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
              deps.broadcastToAll(
                'data-updated',
                'triggerScripts',
                deps.stringifyTriggerScripts(currentData.triggerScripts),
              );
            }
            logMcpMutation('block replace in field', `field:${fieldName}`, {
              startAnchorAt: startPos,
              endAnchorAt: endPos,
              oldBlockSize: oldBlock.length,
              newBlockSize: newBlock.length,
            });
            deps.broadcastToAll('data-updated', fieldName, newContent);
            return jsonResSuccess(
              res,
              {
                success: true,
                field: fieldName,
                startAnchorAt: startPos,
                endAnchorAt: endPos,
                includeAnchors,
                oldBlockSize: oldBlock.length,
                newBlockSize: newBlock.length,
                oldSize: content.length,
                newSize: newContent.length,
              },
              {
                toolName: 'replace_block_in_field',
                summary: `Replaced block in "${fieldName}" (${oldBlock.length}→${newBlock.length} chars)`,
                artifacts: { oldBlockSize: oldBlock.length, newBlockSize: newBlock.length },
              },
            );
          } else {
            return mcpError(res, 403, {
              action: 'block replace in field',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 블록 치환 요청을 허용한 뒤 다시 시도하세요.',
              target: `field:${fieldName}`,
            });
          }
        } finally {
          release();
        }
      }

      // ----------------------------------------------------------------
      // POST /field/:name/insert — insert text into a string field
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'insert' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const mutationFieldStatus = getStringMutationFieldStatus(fieldName, currentData);
        if (mutationFieldStatus === 'read-only') {
          return mcpError(res, 400, {
            action: 'insert in field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        if (mutationFieldStatus !== 'ok') {
          return mcpError(res, 400, {
            action: 'insert in field',
            message: `"${fieldName}" 필드는 텍스트 삽입을 지원하지 않습니다.`,
            suggestion:
              '문자열 타입 필드에만 사용 가능합니다. 배열/boolean/number/triggerScripts 필드는 write_field를 사용하세요.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}/insert`, broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, insertBodySchema, {
          action: 'insert in field',
          target: `field:${fieldName}`,
          suggestion: '삽입할 content를 요청 본문에 포함하세요.',
        });
        if (!parsed) return;
        // Acquire mutex to prevent parallel writes on same field
        const release = await acquireFieldMutex(fieldName);
        try {
          const oldContent: string = normalizeLF(currentData[fieldName] || '');
          let newContent: string;
          const position: string = parsed.position || 'end';
          const insertContent = normalizeLF(parsed.content);
          if (position === 'end') {
            newContent = oldContent + '\n' + insertContent;
          } else if (position === 'start') {
            newContent = insertContent + '\n' + oldContent;
          } else if ((position === 'after' || position === 'before') && parsed.anchor) {
            const anchorPos = oldContent.indexOf(normalizeLF(parsed.anchor));
            if (anchorPos === -1) {
              return mcpNoOp(res, {
                action: 'insert in field',
                message: `앵커 문자열을 찾을 수 없음: ${parsed.anchor.substring(0, 80)}`,
                suggestion:
                  'read_field 또는 read_field_range로 현재 내용을 확인해 anchor 문자열을 다시 지정하거나 position을 start/end로 변경하세요.',
                target: `field:${fieldName}`,
              });
            }
            if (position === 'after') {
              const insertAt = anchorPos + normalizeLF(parsed.anchor).length;
              newContent = oldContent.slice(0, insertAt) + '\n' + insertContent + oldContent.slice(insertAt);
            } else {
              newContent = oldContent.slice(0, anchorPos) + insertContent + '\n' + oldContent.slice(anchorPos);
            }
          } else {
            return mcpError(res, 400, {
              action: 'insert in field',
              message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
              suggestion:
                'anchor 에 삽입 위치를 지정하는 텍스트를 전달하세요. 예: { "position": "after", "anchor": "기준 텍스트" }',
              target: `field:${fieldName}`,
            });
          }
          const preview = parsed.content.substring(0, 100) + (parsed.content.length > 100 ? '...' : '');
          const allowed = await deps.askRendererConfirm(
            'MCP 필드 삽입 요청',
            `AI 어시스턴트가 "${fieldName}" 필드에 내용을 삽입하려 합니다.\n위치: ${position}${parsed.anchor ? ' "' + parsed.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
          );
          if (allowed) {
            currentData[fieldName] = newContent;
            if (fieldName === 'lua') {
              currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
              deps.broadcastToAll(
                'data-updated',
                'triggerScripts',
                deps.stringifyTriggerScripts(currentData.triggerScripts),
              );
            }
            logMcpMutation('insert in field', `field:${fieldName}`, {
              position,
              oldSize: oldContent.length,
              newSize: newContent.length,
            });
            deps.broadcastToAll('data-updated', fieldName, newContent);
            return jsonResSuccess(
              res,
              {
                success: true,
                field: fieldName,
                position,
                oldSize: oldContent.length,
                newSize: newContent.length,
              },
              {
                toolName: 'insert_in_field',
                summary: `Inserted into "${fieldName}" at ${position} (${oldContent.length}→${newContent.length} chars)`,
                artifacts: { oldSize: oldContent.length, newSize: newContent.length },
              },
            );
          } else {
            return mcpError(res, 403, {
              action: 'insert in field',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 삽입 요청을 허용한 뒤 다시 시도하세요.',
              target: `field:${fieldName}`,
            });
          }
        } finally {
          release();
        }
      }

      // ----------------------------------------------------------------
      // POST /field/:name/batch-replace — sequential multi-replace on same field
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'batch-replace' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const mutationFieldStatus = getStringMutationFieldStatus(fieldName, currentData);
        if (mutationFieldStatus === 'read-only') {
          return mcpError(res, 400, {
            action: 'batch replace in field',
            message: `"${fieldName}" 필드는 읽기 전용입니다.`,
            suggestion: '이 필드는 수정할 수 없습니다.',
            target: `field:${fieldName}`,
          });
        }
        if (mutationFieldStatus !== 'ok') {
          return mcpError(res, 400, {
            action: 'batch replace in field',
            message: `"${fieldName}" 필드는 문자열 치환을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}/batch-replace`, broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, batchReplaceBodySchema, {
          action: 'batch replace in field',
          target: `field:${fieldName}`,
          suggestion:
            'replacements 를 { find, replace } 객체 배열로 전달하세요. 예: { "replacements": [{ "find": "old", "replace": "new" }] }',
        });
        if (!parsed) return;
        const replacements = parsed.replacements;
        if (replacements.length === 0) {
          return mcpError(res, 400, {
            action: 'batch replace in field',
            message: 'replacements must be a non-empty array',
            suggestion:
              'replacements 를 { find, replace } 객체 배열로 전달하세요. 예: { "replacements": [{ "find": "old", "replace": "new" }] }',
            target: `field:${fieldName}`,
          });
        }
        const MAX_BATCH = 50;
        if (replacements.length > MAX_BATCH) {
          return mcpError(res, 400, {
            action: 'batch replace in field',
            message: `Maximum ${MAX_BATCH} replacements per batch`,
            suggestion: `요청을 ${MAX_BATCH}개 이하의 치환으로 나누어 여러 번 호출하세요.`,
            target: `field:${fieldName}`,
          });
        }
        const dryRun = !!(parsed.dry_run ?? parsed.dryRun);
        // Acquire mutex to prevent parallel writes
        const release = await acquireFieldMutex(fieldName);
        try {
          let content: string = normalizeLF(currentData[fieldName] || '');
          const originalSize = content.length;
          // Apply replacements sequentially, collecting match info
          const results = replacements.map((r) => {
            const findStr: string = normalizeLF(r.find);
            const replaceStr: string = r.replace !== undefined ? normalizeLF(r.replace) : '';
            const useRegex = !!r.regex;
            const flags: string = r.flags || 'g';
            let matchCount: number;
            if (useRegex) {
              const re = new RegExp(findStr, flags);
              const matches = content.match(re);
              matchCount = matches ? matches.length : 0;
              content = content.replace(re, replaceStr);
            } else {
              matchCount = 0;
              let searchFrom = 0;
              while (true) {
                const pos = content.indexOf(findStr, searchFrom);
                if (pos === -1) break;
                matchCount++;
                searchFrom = pos + findStr.length;
              }
              content = content.split(findStr).join(replaceStr);
            }
            return { find: findStr.substring(0, 80), matchCount };
          });
          const totalMatches = results.reduce((s, r) => s + r.matchCount, 0);
          if (totalMatches === 0) {
            return mcpNoOp(
              res,
              {
                action: 'batch replace in field',
                message: '모든 치환에서 일치하는 항목 없음',
                suggestion: 'results를 확인하고 각 find/replace/regex/flags를 조정한 뒤 다시 시도하세요.',
                target: `field:${fieldName}`,
              },
              {
                results,
                ...(dryRun ? { dryRun: true } : {}),
              },
            );
          }
          if (dryRun) {
            return jsonResSuccess(
              res,
              {
                dryRun: true,
                field: fieldName,
                totalMatches,
                originalSize,
                newSize: content.length,
                results,
              },
              {
                toolName: 'replace_in_field_batch',
                summary: `Dry-run: ${totalMatches} total match(es) in "${fieldName}"`,
                artifacts: { totalMatches, fieldLength: originalSize },
              },
            );
          }
          const summary = results
            .filter((r) => r.matchCount > 0)
            .map((r) => `  "${r.find}": ${r.matchCount}건`)
            .join('\n');
          const allowed = await deps.askRendererConfirm(
            'MCP 필드 일괄 치환 요청',
            `AI 어시스턴트가 "${fieldName}" 필드에서 ${replacements.length}개 치환 (총 ${totalMatches}건)을 적용하려 합니다.\n\n${summary.substring(0, 500)}${summary.length > 500 ? '\n...' : ''}`,
          );
          if (allowed) {
            currentData[fieldName] = content;
            if (fieldName === 'lua') {
              currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
              deps.broadcastToAll(
                'data-updated',
                'triggerScripts',
                deps.stringifyTriggerScripts(currentData.triggerScripts),
              );
            }
            logMcpMutation('batch replace in field', `field:${fieldName}`, {
              totalMatches,
              count: replacements.length,
            });
            deps.broadcastToAll('data-updated', fieldName, content);
            return jsonResSuccess(
              res,
              {
                success: true,
                field: fieldName,
                totalMatches,
                originalSize,
                newSize: content.length,
                results,
              },
              {
                toolName: 'replace_in_field_batch',
                summary: `Batch replaced ${totalMatches} match(es) in "${fieldName}"`,
                artifacts: { totalMatches, originalSize, newSize: content.length },
              },
            );
          } else {
            return mcpError(res, 403, {
              action: 'batch replace in field',
              message: '사용자가 거부했습니다',
              rejected: true,
              suggestion: '앱에서 일괄 치환 요청을 허용한 뒤 다시 시도하세요.',
              target: `field:${fieldName}`,
            });
          }
        } finally {
          release();
        }
      }

      // ----------------------------------------------------------------
      // POST /search-all — search across string fields, greetings, lorebook
      // ----------------------------------------------------------------
      if (parts[0] === 'search-all' && !parts[1] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'search-all', broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, searchAllBodySchema, {
          action: 'search all fields',
          target: '/search-all',
          suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;

        try {
          const searchResult = searchAllTextSurfaces(currentData, {
            query: normalizeLF(String(parsed.query)),
            regex: !!parsed.regex,
            flags: parsed.flags,
            includeLorebook: parsed.include_lorebook !== false,
            includeGreetings: parsed.include_greetings !== false,
            contextChars: Math.max(0, Math.min(Number(parsed.context_chars) || 60, 300)),
            maxMatchesPerSurface: Math.max(1, Math.min(Number(parsed.max_matches_per_field) || 5, 20)),
            maxMatchesTotal:
              parsed.max_matches_total === undefined
                ? undefined
                : Math.max(1, Math.min(Number(parsed.max_matches_total) || 1, 100)),
          });
          const totalHits = Array.isArray(searchResult.surfaces)
            ? (searchResult.surfaces as Array<{ totalMatches?: number }>).reduce(
                (sum, s) => sum + (s.totalMatches || 0),
                0,
              )
            : 0;
          return jsonResSuccess(res, searchResult as unknown as Record<string, unknown>, {
            toolName: 'search_all_fields',
            summary: `Searched all fields: ${totalHits} total match(es)`,
            artifacts: { totalMatches: totalHits },
          });
        } catch (err) {
          return mcpError(res, 400, {
            action: 'search all fields',
            message: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
            target: '/search-all',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /field/:name/search — search text in a string field (read-only)
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'search' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'search in field',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `field:${fieldName}`,
          });
        }
        if (!SEARCHABLE_TEXT_FIELDS.includes(fieldName as (typeof SEARCHABLE_TEXT_FIELDS)[number])) {
          return mcpError(res, 400, {
            action: 'search in field',
            message: `"${fieldName}" 필드는 검색을 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `field:${fieldName}`,
          });
        }
        const body = await readJsonBody(req, res, `field/${fieldName}/search`, broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, searchBodySchema, {
          action: 'search in field',
          target: `field:${fieldName}`,
          suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;
        const content: string = normalizeLF(
          typeof currentData[fieldName] === 'string' ? currentData[fieldName] : String(currentData[fieldName] ?? ''),
        );
        const queryStr: string = normalizeLF(String(parsed.query));
        const contextChars: number = Math.max(0, Math.min(Number(parsed.context_chars) || 100, 500));
        const maxMatches: number = Math.max(1, Math.min(Number(parsed.max_matches) || 20, 100));
        const useRegex = !!parsed.regex;
        const flags = parsed.flags ?? (useRegex ? 'gi' : undefined);

        try {
          const result = searchTextBlock(content, {
            query: queryStr,
            regex: useRegex,
            flags,
            contextChars,
            maxMatches,
          });

          return jsonResSuccess(
            res,
            {
              field: fieldName,
              query: result.query,
              totalMatches: result.totalMatches,
              returnedMatches: result.returnedMatches,
              fieldLength: result.contentLength,
              matches: result.matches,
            },
            {
              toolName: 'search_in_field',
              summary: `Found ${result.totalMatches} match(es) in "${fieldName}"`,
              artifacts: { fieldName, totalMatches: result.totalMatches },
            },
          );
        } catch (err) {
          return mcpError(res, 400, {
            action: 'search in field',
            message: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
            target: `field:${fieldName}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // GET /field/:name/range — read a substring of a field (read-only)
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'range' && !parts[3] && req.method === 'GET') {
        const fieldName = decodeURIComponent(parts[1]);
        const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'read field range',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `field:${fieldName}`,
          });
        }
        const rangeReadableFields = [
          'name',
          'description',
          'firstMessage',
          'globalNote',
          'css',
          'defaultVariables',
          'lua',
          'personality',
          'scenario',
          'creatorcomment',
          'exampleMessage',
          'systemPrompt',
          'creator',
          'characterVersion',
          'nickname',
          'additionalText',
          'license',
          'cjs',
          'backgroundEmbedding',
          'moduleNamespace',
          'customModuleToggle',
          'mcpUrl',
          'moduleName',
          'moduleDescription',
          'mainPrompt',
          'jailbreak',
          'aiModel',
          'subModel',
          'apiType',
          'instructChatTemplate',
          'JinjaTemplate',
          'templateDefaultVariables',
          'moduleIntergration',
          'jsonSchema',
          'extractJson',
          'groupTemplate',
          'groupOtherBotRole',
          'autoSuggestPrompt',
          'autoSuggestPrefix',
          'systemContentReplacement',
          'systemRoleReplacement',
          'creationDate',
          'modificationDate',
          'moduleId',
        ];
        if (!rangeReadableFields.includes(fieldName)) {
          return mcpError(res, 400, {
            action: 'read field range',
            message: `"${fieldName}" 필드는 범위 읽기를 지원하지 않습니다.`,
            suggestion: '문자열 타입 필드에만 사용 가능합니다.',
            target: `field:${fieldName}`,
          });
        }
        const content: string =
          typeof currentData[fieldName] === 'string' ? currentData[fieldName] : String(currentData[fieldName] ?? '');
        const MAX_RANGE_LENGTH = 10000;
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        const length = Math.max(1, Math.min(Number(url.searchParams.get('length')) || 2000, MAX_RANGE_LENGTH));
        const slice = content.slice(offset, offset + length);
        return jsonResSuccess(
          res,
          {
            field: fieldName,
            totalLength: content.length,
            offset,
            length: slice.length,
            hasMore: offset + length < content.length,
            content: slice,
          },
          {
            toolName: 'read_field_range',
            summary: `Read ${slice.length} chars from "${fieldName}" at offset ${offset}`,
            artifacts: { fieldName, offset, length: slice.length, totalLength: content.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /field/:name/snapshot — save current field value as a snapshot
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'snapshot' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'snapshot field',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `field:${fieldName}`,
          });
        }
        const content = currentData[fieldName];
        if (content === undefined) {
          return mcpError(res, 400, {
            action: 'snapshot field',
            message: `"${fieldName}" 필드를 찾을 수 없습니다.`,
            target: `field:${fieldName}`,
          });
        }
        const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const snapshot = {
          id: snapshotId,
          field: fieldName,
          timestamp: new Date().toISOString(),
          size: typeof content === 'string' ? content.length : JSON.stringify(content).length,
          content: typeof content === 'string' ? content : cloneJson(content),
        };
        if (!fieldSnapshots.has(fieldName)) fieldSnapshots.set(fieldName, []);
        const snaps = fieldSnapshots.get(fieldName)!;
        snaps.push(snapshot);
        // Keep max 10 snapshots per field
        if (snaps.length > 10) snaps.shift();
        return jsonResSuccess(
          res,
          {
            success: true,
            snapshotId,
            field: fieldName,
            size: snapshot.size,
            timestamp: snapshot.timestamp,
            totalSnapshots: snaps.length,
          },
          {
            toolName: 'snapshot_field',
            summary: `Snapshot created for "${fieldName}" (${snapshot.size} chars)`,
            artifacts: { fieldName, snapshotId, size: snapshot.size },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /field/:name/snapshots — list snapshots for a field
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'snapshots' && !parts[3] && req.method === 'GET') {
        const fieldName = decodeURIComponent(parts[1]);
        const hiddenBlock = getHiddenFieldReadBlock(currentData, fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'list snapshots',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `field:${fieldName}`,
          });
        }
        const snaps = fieldSnapshots.get(fieldName) || [];
        return jsonResSuccess(
          res,
          {
            field: fieldName,
            count: snaps.length,
            snapshots: snaps.map((s) => ({ id: s.id, timestamp: s.timestamp, size: s.size })),
          },
          {
            toolName: 'list_snapshots',
            summary: `${snaps.length} snapshot(s) for "${fieldName}"`,
            artifacts: { fieldName, count: snaps.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /session/status — inspect the current MCP-visible session state
      // ----------------------------------------------------------------
      if (
        await handleSessionStatusRoute(req, res, parts, currentData as Record<string, unknown> | null, fieldSnapshots, {
          getCurrentFilePath: deps.getCurrentFilePath,
          getReferenceFiles: deps.getReferenceFiles,
          getSessionStatus: deps.getSessionStatus,
          getRuntimeInfo: deps.getRuntimeInfo,
          normalizeTriggerScripts: deps.normalizeTriggerScripts,
          getCssSectionCount: (css) => cssCache.get(css).sections.length,
          getLuaSectionCount: (lua) => luaCache.get(lua).length,
          jsonResSuccess,
        })
      ) {
        return;
      }

      // ----------------------------------------------------------------
      // POST /field/:name/restore — restore a field from a snapshot
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'restore' && !parts[3] && req.method === 'POST') {
        const fieldName = decodeURIComponent(parts[1]);
        const body = await readJsonBody(req, res, `field/${fieldName}/restore`, broadcastStatus);
        if (!body) return;
        const snapshotId: string = body.snapshot_id;
        if (!snapshotId) {
          return mcpError(res, 400, {
            action: 'restore field',
            message: 'Missing "snapshot_id"',
            suggestion: 'list_snapshots로 스냅샷 ID를 확인한 뒤 전달하세요.',
            target: `field:${fieldName}`,
          });
        }
        const snaps = fieldSnapshots.get(fieldName) || [];
        const snapshot = snaps.find((s) => s.id === snapshotId);
        if (!snapshot) {
          return mcpError(res, 400, {
            action: 'restore field',
            message: `스냅샷을 찾을 수 없음: ${snapshotId}`,
            suggestion: 'list_snapshots로 유효한 스냅샷 ID를 확인하세요.',
            target: `field:${fieldName}`,
          });
        }
        const currentSize =
          typeof currentData[fieldName] === 'string'
            ? currentData[fieldName].length
            : JSON.stringify(currentData[fieldName] ?? '').length;
        const allowed = await deps.askRendererConfirm(
          'MCP 스냅샷 복원 요청',
          `AI 어시스턴트가 "${fieldName}" 필드를 스냅샷으로 복원하려 합니다.\n스냅샷: ${snapshotId}\n시점: ${snapshot.timestamp}\n현재 크기: ${currentSize}자 → 스냅샷 크기: ${snapshot.size}자`,
        );
        if (allowed) {
          currentData[fieldName] =
            typeof snapshot.content === 'string' ? snapshot.content : cloneJson(snapshot.content);
          if (fieldName === 'lua') {
            currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
            deps.broadcastToAll(
              'data-updated',
              'triggerScripts',
              deps.stringifyTriggerScripts(currentData.triggerScripts),
            );
          }
          logMcpMutation('restore field snapshot', `field:${fieldName}`, {
            snapshotId,
            restoredSize: snapshot.size,
          });
          deps.broadcastToAll('data-updated', fieldName, currentData[fieldName]);
          return jsonResSuccess(
            res,
            {
              success: true,
              field: fieldName,
              snapshotId,
              restoredSize: snapshot.size,
              timestamp: snapshot.timestamp,
            },
            {
              toolName: 'restore_snapshot',
              summary: `Restored "${fieldName}" from snapshot ${snapshotId} (${snapshot.size} chars)`,
              artifacts: { fieldName, snapshotId, restoredSize: snapshot.size },
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'restore field',
            message: '사용자가 거부했습니다',
            rejected: true,
            target: `field:${fieldName}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // GET /field/:name/stats — get field statistics (read-only)
      // ----------------------------------------------------------------
      if (parts[0] === 'field' && parts[1] && parts[2] === 'stats' && !parts[3] && req.method === 'GET') {
        const fieldName = decodeURIComponent(parts[1]);
        const raw = currentData[fieldName];
        if (raw === undefined) {
          return mcpError(res, 400, {
            action: 'get field stats',
            message: `"${fieldName}" 필드를 찾을 수 없습니다.`,
            target: `field:${fieldName}`,
          });
        }
        if (typeof raw !== 'string') {
          return jsonResSuccess(
            res,
            {
              field: fieldName,
              type: Array.isArray(raw) ? 'array' : typeof raw,
              size: JSON.stringify(raw).length,
            },
            {
              toolName: 'get_field_stats',
              summary: `Stats for "${fieldName}" (${Array.isArray(raw) ? 'array' : typeof raw})`,
              artifacts: { fieldName },
            },
          );
        }
        const content = raw as string;
        const lines = content.split('\n');
        const words = content.split(/\s+/).filter((w) => w.length > 0);
        // Count CBS tags
        const cbsTags = (content.match(/\{\{[^}]+\}\}/g) || []).length;
        // Count HTML tags
        const htmlTags = (content.match(/<[^>]+>/g) || []).length;
        return jsonResSuccess(
          res,
          {
            field: fieldName,
            type: 'string',
            characters: content.length,
            lines: lines.length,
            words: words.length,
            cbsTags,
            htmlTags,
            emptyLines: lines.filter((l) => l.trim() === '').length,
            longestLine: Math.max(...lines.map((l) => l.length)),
          },
          {
            toolName: 'get_field_stats',
            summary: `Stats for "${fieldName}" (${content.length} chars, ${lines.length} lines)`,
            artifacts: { fieldName, characters: content.length, lines: lines.length },
          },
        );
      }

      if (
        await handleLorebookRoute(req, res, parts, url, currentData, {
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
        await handleStructuredItemRoute(req, res, parts, url, currentData, {
          api: deps,
          broadcastStatus,
          jsonResSuccess,
          mcpError,
          mcpNoOp,
        })
      ) {
        return;
      }

      // ----------------------------------------------------------------
      // GET /lua — list Lua sections
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && !parts[1] && req.method === 'GET') {
        const luaListPayload = buildLuaListResponse(String(currentData.lua || ''), deps.parseLuaSections);
        return jsonResSuccess(res, luaListPayload, {
          toolName: 'list_lua',
          summary: `Listed ${luaListPayload.count} Lua sections`,
          artifacts: { count: luaListPayload.count },
        });
      }

      // ----------------------------------------------------------------
      // GET /lua/:idx — read Lua section
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && parts[1] && req.method === 'GET') {
        const sections = luaCache.get(currentData.lua);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return mcpError(res, 400, {
            action: 'read lua section',
            message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
            suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 확인하세요.',
            target: `lua:${idx}`,
          });
        }
        return jsonResSuccess(res, buildSectionReadPayload(idx, sections[idx]), {
          toolName: 'read_lua',
          summary: `Read Lua section [${idx}] "${sections[idx].name}" (${sections[idx].content.length} chars)`,
        });
      }

      // ----------------------------------------------------------------
      // POST /lua/batch — batch read Lua sections
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && parts[1] === 'batch' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'lua/batch', broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return mcpError(res, 400, {
            action: 'batch read lua sections',
            message: 'indices must be an array of numbers',
            suggestion: '{ "indices": [0, 1, 2] } 형식으로 전송하세요.',
            target: 'lua:batch',
          });
        }
        const MAX_BATCH = 20;
        if (indices.length > MAX_BATCH) {
          return mcpError(res, 400, {
            action: 'batch read lua sections',
            message: `Maximum ${MAX_BATCH} indices per batch`,
            suggestion: `인덱스를 ${MAX_BATCH}개 이하로 나누어 전송하세요.`,
            target: 'lua:batch',
          });
        }
        const sections = luaCache.get(currentData.lua);
        const result = indices.map((idx: number) => {
          if (typeof idx !== 'number' || idx < 0 || idx >= sections.length) return null;
          return buildSectionReadPayload(idx, sections[idx]);
        });
        return jsonResSuccess(
          res,
          { count: result.filter(Boolean).length, total: indices.length, sections: result },
          {
            toolName: 'read_lua',
            summary: `Batch read ${result.filter(Boolean).length}/${indices.length} Lua sections`,
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /lua/add — add new Lua section
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && parts[1] === 'add' && !parts[2] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'lua/add', broadcastStatus);
        if (!body) return;
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
          return mcpError(res, 400, {
            action: 'add lua section',
            message: 'Missing or empty "name" for new Lua section',
            suggestion: '새 섹션의 name을 요청 본문에 포함하세요.',
            target: 'lua:add',
          });
        }
        const content = typeof body.content === 'string' ? body.content : '';
        const sections = luaCache.get(currentData.lua);
        const duplicate = sections.find((s) => s.name === name);
        if (duplicate) {
          return mcpError(res, 400, {
            action: 'add lua section',
            details: { existingIndex: sections.indexOf(duplicate) },
            message: `Section "${name}" already exists`,
            suggestion: '기존 섹션을 수정하거나 다른 이름을 사용하세요.',
            target: 'lua:add',
          });
        }

        const allowed = await deps.askRendererConfirm(
          'MCP 추가 요청',
          `AI 어시스턴트가 새 Lua 섹션 "${name}"을(를) 추가하려 합니다.`,
        );

        if (allowed) {
          sections.push({ name, content });
          currentData.lua = deps.combineLuaSections(sections);
          currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
          logMcpMutation('add lua section', `lua:add`, { sectionName: name, newIndex: sections.length - 1 });
          deps.broadcastToAll('data-updated', 'lua', currentData.lua);
          deps.broadcastToAll('data-updated', 'triggerScripts', currentData.triggerScripts);
          return jsonResSuccess(
            res,
            { success: true, index: sections.length - 1, name, contentSize: content.length },
            {
              toolName: 'add_lua_section',
              summary: `Added Lua section [${sections.length - 1}] "${name}"`,
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'add lua section',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
            target: 'lua:add',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /lua/:idx — write Lua section
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && parts[1] && !parts[2] && req.method === 'POST') {
        const sections = luaCache.get(currentData.lua);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return mcpError(res, 400, {
            action: 'write lua section',
            message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
            suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
            target: `lua:${idx}`,
          });
        }
        const body = await readJsonBody(req, res, `lua/${idx}`, broadcastStatus);
        if (!body) return;
        if (body.content === undefined) {
          return mcpError(res, 400, {
            action: 'write lua section',
            message: 'Missing "content"',
            suggestion: 'content 필드를 포함한 요청 본문을 보내세요.',
            target: `lua:${idx}`,
          });
        }
        if (
          !ensureSectionExpectedIdentity(
            res,
            'lua',
            idx,
            sections[idx],
            body.expected_hash,
            body.expected_preview,
            'write lua section',
            `lua:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
        const sectionName = sections[idx].name;
        const oldSize = sections[idx].content.length;
        const newSize = body.content.length;

        const allowed = await deps.askRendererConfirm(
          'MCP 수정 요청',
          `AI 어시스턴트가 Lua 섹션 "${sectionName}" (index ${idx})을 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`,
        );

        if (allowed) {
          const sepLines = body.content.split('\n').filter((l: string) => deps.detectLuaSection(l) !== null);
          let warning: string | undefined;
          if (sepLines.length > 0) {
            warning = `주의: 내용에 섹션 구분자 패턴이 ${sepLines.length}건 포함되어 있습니다. 의도치 않은 섹션 분할이 발생할 수 있습니다.`;
          }
          sections[idx].content = body.content;
          currentData.lua = deps.combineLuaSections(sections);
          currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
          logMcpMutation('write lua section', `lua:${idx}`, { sectionName, oldSize, newSize });
          deps.broadcastToAll('data-updated', 'lua', currentData.lua);
          deps.broadcastToAll('data-updated', 'triggerScripts', currentData.triggerScripts);
          return jsonResSuccess(
            res,
            { success: true, index: idx, name: sectionName, size: newSize, warning },
            {
              toolName: 'write_lua',
              summary: `Updated Lua section [${idx}] "${sectionName}" (${oldSize} → ${newSize} chars)`,
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'write lua section',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 변경 요청을 허용한 뒤 다시 시도하세요.',
            target: `lua:${idx}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /lua/:idx/delete — delete Lua section
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && parts[1] && parts[2] === 'delete' && !parts[3] && req.method === 'POST') {
        const sections = luaCache.get(currentData.lua);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return mcpError(res, 400, {
            action: 'delete lua section',
            message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
            suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
            target: `lua:${idx}`,
          });
        }
        const body = await readJsonBody(req, res, `lua/${idx}/delete`, broadcastStatus);
        if (!body) return;
        if (
          !ensureSectionExpectedIdentity(
            res,
            'lua',
            idx,
            sections[idx],
            body.expected_hash,
            body.expected_preview,
            'delete lua section',
            `lua:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
        const section = sections[idx];
        const allowed = await deps.askRendererConfirm(
          'MCP 삭제 요청',
          `AI 어시스턴트가 Lua 섹션 "${section.name}" (index ${idx})을 삭제하려 합니다.`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'delete lua section',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
            target: `lua:${idx}`,
          });
        }
        sections.splice(idx, 1);
        currentData.lua = deps.combineLuaSections(sections);
        currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
        logMcpMutation('delete lua section', `lua:${idx}`, { sectionName: section.name });
        deps.broadcastToAll('data-updated', 'lua', currentData.lua);
        deps.broadcastToAll('data-updated', 'triggerScripts', currentData.triggerScripts);
        return jsonResSuccess(
          res,
          { success: true, deleted: idx, name: section.name },
          { toolName: 'delete_lua_section', summary: `Deleted Lua section [${idx}] "${section.name}"` },
        );
      }

      // ----------------------------------------------------------------
      // POST /lua/:idx/replace
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && parts[1] && parts[2] === 'replace' && req.method === 'POST') {
        const sections = luaCache.get(currentData.lua);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return mcpError(res, 400, {
            action: 'replace lua section content',
            message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
            suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
            target: `lua:${idx}`,
          });
        }
        const body = await readJsonBody(req, res, `lua/${idx}/replace`, broadcastStatus);
        if (!body) return;
        if (!body.find) {
          return mcpError(res, 400, {
            action: 'replace lua section content',
            message: 'Missing "find"',
            suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
            target: `lua:${idx}`,
          });
        }
        if (
          !ensureSectionExpectedIdentity(
            res,
            'lua',
            idx,
            sections[idx],
            body.expected_hash,
            body.expected_preview,
            'replace lua section content',
            `lua:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
        if (
          !ensureSectionExpectedIdentity(
            res,
            'css',
            idx,
            sections[idx],
            body.expected_hash,
            body.expected_preview,
            'replace css section content',
            `css-section:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
        if (
          !ensureSectionExpectedIdentity(
            res,
            'css',
            idx,
            sections[idx],
            body.expected_hash,
            body.expected_preview,
            'replace css section content',
            `css-section:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
        const sectionName = sections[idx].name;
        const content = normalizeLF(sections[idx].content);
        const findStr: string = normalizeLF(body.find);
        const replaceStr: string = normalizeLF(body.replace !== undefined ? body.replace : '');
        const useRegex = !!body.regex;
        const flags: string = body.flags || 'g';

        let newContent: string;
        let matchCount: number;
        if (useRegex) {
          const re = new RegExp(findStr, flags);
          const matches = content.match(re);
          matchCount = matches ? matches.length : 0;
          newContent = content.replace(re, replaceStr);
        } else {
          matchCount = 0;
          let searchFrom = 0;
          while (true) {
            const pos = content.indexOf(findStr, searchFrom);
            if (pos === -1) break;
            matchCount++;
            searchFrom = pos + findStr.length;
          }
          newContent = content.split(findStr).join(replaceStr);
        }

        if (matchCount === 0) {
          return mcpNoOp(
            res,
            {
              action: 'replace lua section content',
              message: '일치하는 항목 없음',
              suggestion: 'read_lua로 현재 섹션 내용을 확인하고 find/regex/flags를 조정하세요.',
              target: `lua:${idx}`,
            },
            { matchCount: 0 },
          );
        }

        const allowed = await deps.askRendererConfirm(
          'MCP 치환 요청',
          `AI 어시스턴트가 Lua 섹션 "${sectionName}" (index ${idx})에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
        );

        if (allowed) {
          sections[idx].content = newContent;
          currentData.lua = deps.combineLuaSections(sections);
          currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
          logMcpMutation('replace lua section content', `lua:${idx}`, { sectionName, matchCount });
          deps.broadcastToAll('data-updated', 'lua', currentData.lua);
          deps.broadcastToAll('data-updated', 'triggerScripts', currentData.triggerScripts);
          return jsonResSuccess(
            res,
            {
              success: true,
              index: idx,
              name: sectionName,
              matchCount,
              oldSize: content.length,
              newSize: newContent.length,
            },
            {
              toolName: 'replace_in_lua',
              summary: `Replaced ${matchCount} match(es) in Lua section [${idx}] "${sectionName}"`,
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'replace lua section content',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
            target: `lua:${idx}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /lua/:idx/insert
      // ----------------------------------------------------------------
      if (parts[0] === 'lua' && parts[1] && parts[2] === 'insert' && req.method === 'POST') {
        const sections = luaCache.get(currentData.lua);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return mcpError(res, 400, {
            action: 'insert lua section content',
            message: `Lua section index ${idx} out of range (0-${sections.length - 1})`,
            suggestion: 'list_lua 또는 GET /lua 로 유효한 section index를 다시 확인하세요.',
            target: `lua:${idx}`,
          });
        }
        const body = await readJsonBody(req, res, `lua/${idx}/insert`, broadcastStatus);
        if (!body) return;
        if (body.content === undefined) {
          return mcpError(res, 400, {
            action: 'insert lua section content',
            message: 'Missing "content"',
            suggestion: '삽입할 content를 요청 본문에 포함하세요.',
            target: `lua:${idx}`,
          });
        }
        if (
          !ensureSectionExpectedIdentity(
            res,
            'lua',
            idx,
            sections[idx],
            body.expected_hash,
            body.expected_preview,
            'insert lua section content',
            `lua:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
        if (
          !ensureSectionExpectedIdentity(
            res,
            'css',
            idx,
            sections[idx],
            body.expected_hash,
            body.expected_preview,
            'insert css section content',
            `css-section:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
        if (
          !ensureSectionExpectedIdentity(
            res,
            'css',
            idx,
            sections[idx],
            body.expected_hash,
            body.expected_preview,
            'insert css section content',
            `css-section:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
        const sectionName = sections[idx].name;
        const oldContent = normalizeLF(sections[idx].content);
        let newContent: string;
        const position: string = body.position || 'end';
        const insContent = normalizeLF(body.content);

        if (position === 'end') {
          newContent = oldContent + '\n' + insContent;
        } else if (position === 'start') {
          newContent = insContent + '\n' + oldContent;
        } else if ((position === 'after' || position === 'before') && body.anchor) {
          const anchorNorm = normalizeLF(body.anchor);
          const anchorPos = oldContent.indexOf(anchorNorm);
          if (anchorPos === -1) {
            return mcpNoOp(res, {
              action: 'insert lua section content',
              message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
              suggestion:
                'read_lua로 현재 섹션 내용을 확인해 anchor 문자열을 다시 지정하거나 position을 start/end로 변경하세요.',
              target: `lua:${idx}`,
            });
          }
          if (position === 'after') {
            const insertAt = anchorPos + anchorNorm.length;
            newContent = oldContent.slice(0, insertAt) + '\n' + insContent + oldContent.slice(insertAt);
          } else {
            newContent = oldContent.slice(0, anchorPos) + insContent + '\n' + oldContent.slice(anchorPos);
          }
        } else {
          return mcpError(res, 400, {
            action: 'insert lua section content',
            message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
            suggestion: '{ "position": "after", "anchor": "기준 문자열" } 형식으로 anchor를 포함하세요.',
            target: `lua:${idx}`,
          });
        }

        const preview = insContent.substring(0, 100) + (insContent.length > 100 ? '...' : '');
        const allowed = await deps.askRendererConfirm(
          'MCP 삽입 요청',
          `AI 어시스턴트가 Lua 섹션 "${sectionName}" (index ${idx})에 코드를 삽입하려 합니다.\n위치: ${position}${body.anchor ? ' "' + body.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
        );

        if (allowed) {
          const separatorLines = newContent
            .split('\n')
            .filter((l) => deps.detectLuaSection(l) !== null && !oldContent.includes(l));
          let warning = '';
          if (separatorLines.length > 0) {
            for (const sepLine of separatorLines) {
              const escaped = sepLine.replace(/={3,}/g, (m) => m.slice(0, 2) + '·' + m.slice(3));
              newContent = newContent.replace(sepLine, escaped);
            }
            warning = ` (경고: 섹션 구분자 ${separatorLines.length}건을 이스케이프 처리했습니다)`;
          }
          sections[idx].content = newContent;
          currentData.lua = deps.combineLuaSections(sections);
          currentData.triggerScripts = deps.mergePrimaryLua(currentData.triggerScripts, currentData.lua);
          logMcpMutation('insert lua section content', `lua:${idx}`, {
            sectionName,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
          });
          deps.broadcastToAll('data-updated', 'lua', currentData.lua);
          deps.broadcastToAll('data-updated', 'triggerScripts', currentData.triggerScripts);
          return jsonResSuccess(
            res,
            {
              success: true,
              index: idx,
              name: sectionName,
              position,
              oldSize: oldContent.length,
              newSize: newContent.length,
              warning: warning || undefined,
            },
            {
              toolName: 'insert_in_lua',
              summary: `Inserted content at ${position} in Lua section [${idx}] "${sectionName}"`,
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'insert lua section content',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 삽입 요청을 허용한 뒤 다시 시도하세요.',
            target: `lua:${idx}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // GET /css-section — list CSS sections
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && !parts[1] && req.method === 'GET') {
        const { sections } = cssCache.get(currentData.css);
        const result = sections.map((section, index) => ({
          index,
          name: section.name,
          contentSize: section.content.length,
          preview: getSectionPreview(section.content),
          hash: getSectionHash(section.content),
        }));
        return jsonResSuccess(
          res,
          { count: result.length, sections: result },
          {
            toolName: 'list_css',
            summary: `Listed ${result.length} CSS sections`,
            artifacts: { count: result.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /css-section/:idx — read CSS section
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && parts[1] && !parts[2] && req.method === 'GET') {
        const { sections } = cssCache.get(currentData.css);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return mcpError(res, 400, {
            action: 'read css section',
            message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
            suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 확인하세요.',
            target: `css-section:${idx}`,
          });
        }
        return jsonResSuccess(res, buildSectionReadPayload(idx, sections[idx]), {
          toolName: 'read_css',
          summary: `Read CSS section [${idx}] "${sections[idx].name}" (${sections[idx].content.length} chars)`,
        });
      }

      // ----------------------------------------------------------------
      // POST /css-section/batch — batch read CSS sections
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && parts[1] === 'batch' && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'css-section/batch', broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return mcpError(res, 400, {
            action: 'batch read css sections',
            message: 'indices must be an array of numbers',
            suggestion: '{ "indices": [0, 1, 2] } 형식으로 전송하세요.',
            target: 'css-section:batch',
          });
        }
        const MAX_BATCH = 20;
        if (indices.length > MAX_BATCH) {
          return mcpError(res, 400, {
            action: 'batch read css sections',
            message: `Maximum ${MAX_BATCH} indices per batch`,
            suggestion: `인덱스를 ${MAX_BATCH}개 이하로 나누어 전송하세요.`,
            target: 'css-section:batch',
          });
        }
        const { sections } = cssCache.get(currentData.css);
        const result = indices.map((idx: number) => {
          if (typeof idx !== 'number' || idx < 0 || idx >= sections.length) return null;
          return buildSectionReadPayload(idx, sections[idx]);
        });
        return jsonResSuccess(
          res,
          { count: result.filter(Boolean).length, total: indices.length, sections: result },
          {
            toolName: 'read_css',
            summary: `Batch read ${result.filter(Boolean).length}/${indices.length} CSS sections`,
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /css-section/add — add new CSS section
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && parts[1] === 'add' && !parts[2] && req.method === 'POST') {
        const body = await readJsonBody(req, res, 'css-section/add', broadcastStatus);
        if (!body) return;
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
          return mcpError(res, 400, {
            action: 'add css section',
            message: 'Missing or empty "name" for new CSS section',
            suggestion: '새 섹션의 name을 요청 본문에 포함하세요.',
            target: 'css-section:add',
          });
        }
        const content = typeof body.content === 'string' ? body.content : '';
        const { sections, prefix, suffix } = cssCache.get(currentData.css);
        const duplicate = sections.find((s) => s.name === name);
        if (duplicate) {
          return mcpError(res, 400, {
            action: 'add css section',
            details: { existingIndex: sections.indexOf(duplicate) },
            message: `Section "${name}" already exists`,
            suggestion: '기존 섹션을 수정하거나 다른 이름을 사용하세요.',
            target: 'css-section:add',
          });
        }

        const allowed = await deps.askRendererConfirm(
          'MCP 추가 요청',
          `AI 어시스턴트가 새 CSS 섹션 "${name}"을(를) 추가하려 합니다.`,
        );

        if (allowed) {
          sections.push({ name, content });
          currentData.css = deps.combineCssSections(sections, prefix, suffix);
          logMcpMutation('add css section', `css-section:add`, { sectionName: name, newIndex: sections.length - 1 });
          deps.broadcastToAll('data-updated', 'css', currentData.css);
          return jsonResSuccess(
            res,
            { success: true, index: sections.length - 1, name, contentSize: content.length },
            {
              toolName: 'add_css_section',
              summary: `Added CSS section [${sections.length - 1}] "${name}"`,
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'add css section',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
            target: 'css-section:add',
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /css-section/:idx — write CSS section
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && parts[1] && !parts[2] && req.method === 'POST') {
        const { sections, prefix, suffix } = cssCache.get(currentData.css);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return mcpError(res, 400, {
            action: 'write css section',
            message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
            suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
            target: `css-section:${idx}`,
          });
        }
        const body = await readJsonBody(req, res, `css-section/${idx}`, broadcastStatus);
        if (!body) return;
        if (body.content === undefined) {
          return mcpError(res, 400, {
            action: 'write css section',
            message: 'Missing "content"',
            suggestion: 'content 필드를 포함한 요청 본문을 보내세요.',
            target: `css-section:${idx}`,
          });
        }
        if (
          !ensureSectionExpectedIdentity(
            res,
            'css',
            idx,
            sections[idx],
            body.expected_hash,
            body.expected_preview,
            'write css section',
            `css-section:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
        const sectionName = sections[idx].name;
        const oldSize = sections[idx].content.length;
        const newSize = body.content.length;

        const allowed = await deps.askRendererConfirm(
          'MCP 수정 요청',
          `AI 어시스턴트가 CSS 섹션 "${sectionName}" (index ${idx})을 수정하려 합니다.\n현재 크기: ${oldSize}자 → 새 크기: ${newSize}자`,
        );

        if (allowed) {
          sections[idx].content = body.content;
          currentData.css = deps.combineCssSections(sections, prefix, suffix);
          logMcpMutation('write css section', `css-section:${idx}`, { sectionName, oldSize, newSize });
          deps.broadcastToAll('data-updated', 'css', currentData.css);
          return jsonResSuccess(
            res,
            { success: true, index: idx, name: sectionName, size: newSize },
            {
              toolName: 'write_css',
              summary: `Updated CSS section [${idx}] "${sectionName}" (${oldSize} → ${newSize} chars)`,
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'write css section',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 변경 요청을 허용한 뒤 다시 시도하세요.',
            target: `css-section:${idx}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /css-section/:idx/delete — delete CSS section
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && parts[1] && parts[2] === 'delete' && !parts[3] && req.method === 'POST') {
        const { sections, prefix, suffix } = cssCache.get(currentData.css);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return mcpError(res, 400, {
            action: 'delete css section',
            message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
            suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
            target: `css-section:${idx}`,
          });
        }
        const body = await readJsonBody(req, res, `css-section/${idx}/delete`, broadcastStatus);
        if (!body) return;
        if (
          !ensureSectionExpectedIdentity(
            res,
            'css',
            idx,
            sections[idx],
            body.expected_hash,
            body.expected_preview,
            'delete css section',
            `css-section:${idx}`,
            mcpError,
          )
        ) {
          return;
        }
        const section = sections[idx];
        const allowed = await deps.askRendererConfirm(
          'MCP 삭제 요청',
          `AI 어시스턴트가 CSS 섹션 "${section.name}" (index ${idx})을 삭제하려 합니다.`,
        );
        if (!allowed) {
          return mcpError(res, 403, {
            action: 'delete css section',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
            target: `css-section:${idx}`,
          });
        }
        sections.splice(idx, 1);
        currentData.css = deps.combineCssSections(sections, prefix, suffix);
        logMcpMutation('delete css section', `css-section:${idx}`, { sectionName: section.name });
        deps.broadcastToAll('data-updated', 'css', currentData.css);
        return jsonResSuccess(
          res,
          { success: true, deleted: idx, name: section.name },
          { toolName: 'delete_css_section', summary: `Deleted CSS section [${idx}] "${section.name}"` },
        );
      }

      // ----------------------------------------------------------------
      // POST /css-section/:idx/replace
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && parts[1] && parts[2] === 'replace' && req.method === 'POST') {
        const { sections, prefix, suffix } = cssCache.get(currentData.css);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return mcpError(res, 400, {
            action: 'replace css section content',
            message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
            suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
            target: `css-section:${idx}`,
          });
        }
        const body = await readJsonBody(req, res, `css-section/${idx}/replace`, broadcastStatus);
        if (!body) return;
        if (!body.find) {
          return mcpError(res, 400, {
            action: 'replace css section content',
            message: 'Missing "find"',
            suggestion: 'find 문자열 또는 정규식을 포함한 요청 본문을 보내세요.',
            target: `css-section:${idx}`,
          });
        }
        const sectionName = sections[idx].name;
        const content = normalizeLF(sections[idx].content);
        const findStr: string = normalizeLF(body.find);
        const replaceStr: string = normalizeLF(body.replace !== undefined ? body.replace : '');
        const useRegex = !!body.regex;
        const flags: string = body.flags || 'g';

        let newContent: string;
        let matchCount: number;
        if (useRegex) {
          const re = new RegExp(findStr, flags);
          const matches = content.match(re);
          matchCount = matches ? matches.length : 0;
          newContent = content.replace(re, replaceStr);
        } else {
          matchCount = 0;
          let searchFrom = 0;
          while (true) {
            const pos = content.indexOf(findStr, searchFrom);
            if (pos === -1) break;
            matchCount++;
            searchFrom = pos + findStr.length;
          }
          newContent = content.split(findStr).join(replaceStr);
        }

        if (matchCount === 0) {
          return mcpNoOp(
            res,
            {
              action: 'replace css section content',
              message: '일치하는 항목 없음',
              suggestion: 'read_css로 현재 섹션 내용을 확인하고 find/regex/flags를 조정하세요.',
              target: `css-section:${idx}`,
            },
            { matchCount: 0 },
          );
        }

        const allowed = await deps.askRendererConfirm(
          'MCP 치환 요청',
          `AI 어시스턴트가 CSS 섹션 "${sectionName}" (index ${idx})에서 ${matchCount}건 치환하려 합니다.\n찾기: ${findStr.substring(0, 80)}${findStr.length > 80 ? '...' : ''}\n바꾸기: ${replaceStr.substring(0, 80)}${replaceStr.length > 80 ? '...' : ''}`,
        );

        if (allowed) {
          sections[idx].content = newContent;
          currentData.css = deps.combineCssSections(sections, prefix, suffix);
          logMcpMutation('replace css section content', `css-section:${idx}`, { sectionName, matchCount });
          deps.broadcastToAll('data-updated', 'css', currentData.css);
          return jsonResSuccess(
            res,
            {
              success: true,
              index: idx,
              name: sectionName,
              matchCount,
              oldSize: content.length,
              newSize: newContent.length,
            },
            {
              toolName: 'replace_in_css',
              summary: `Replaced ${matchCount} match(es) in CSS section [${idx}] "${sectionName}"`,
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'replace css section content',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
            target: `css-section:${idx}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // POST /css-section/:idx/insert
      // ----------------------------------------------------------------
      if (parts[0] === 'css-section' && parts[1] && parts[2] === 'insert' && req.method === 'POST') {
        const { sections, prefix, suffix } = cssCache.get(currentData.css);
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= sections.length) {
          return mcpError(res, 400, {
            action: 'insert css section content',
            message: `CSS section index ${idx} out of range (0-${sections.length - 1})`,
            suggestion: 'list_css 또는 GET /css-section 으로 유효한 section index를 다시 확인하세요.',
            target: `css-section:${idx}`,
          });
        }
        const body = await readJsonBody(req, res, `css-section/${idx}/insert`, broadcastStatus);
        if (!body) return;
        if (body.content === undefined) {
          return mcpError(res, 400, {
            action: 'insert css section content',
            message: 'Missing "content"',
            suggestion: '삽입할 content를 요청 본문에 포함하세요.',
            target: `css-section:${idx}`,
          });
        }
        const sectionName = sections[idx].name;
        const oldContent = normalizeLF(sections[idx].content);
        let newContent: string;
        const position: string = body.position || 'end';
        const insContent = normalizeLF(body.content);

        if (position === 'end') {
          newContent = oldContent + '\n' + insContent;
        } else if (position === 'start') {
          newContent = insContent + '\n' + oldContent;
        } else if ((position === 'after' || position === 'before') && body.anchor) {
          const anchorNorm = normalizeLF(body.anchor);
          const anchorPos = oldContent.indexOf(anchorNorm);
          if (anchorPos === -1) {
            return mcpNoOp(res, {
              action: 'insert css section content',
              message: `앵커 문자열을 찾을 수 없음: ${body.anchor.substring(0, 80)}`,
              suggestion:
                'read_css로 현재 섹션 내용을 확인해 anchor 문자열을 다시 지정하거나 position을 start/end로 변경하세요.',
              target: `css-section:${idx}`,
            });
          }
          if (position === 'after') {
            const insertAt = anchorPos + anchorNorm.length;
            newContent = oldContent.slice(0, insertAt) + '\n' + insContent + oldContent.slice(insertAt);
          } else {
            newContent = oldContent.slice(0, anchorPos) + insContent + '\n' + oldContent.slice(anchorPos);
          }
        } else {
          return mcpError(res, 400, {
            action: 'insert css section content',
            message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
            suggestion: '{ "position": "before", "anchor": "기준 문자열" } 형식으로 anchor를 포함하세요.',
            target: `css-section:${idx}`,
          });
        }

        const preview = insContent.substring(0, 100) + (insContent.length > 100 ? '...' : '');
        const allowed = await deps.askRendererConfirm(
          'MCP 삽입 요청',
          `AI 어시스턴트가 CSS 섹션 "${sectionName}" (index ${idx})에 코드를 삽입하려 합니다.\n위치: ${position}${body.anchor ? ' "' + body.anchor.substring(0, 40) + '"' : ''}\n내용: ${preview}`,
        );

        if (allowed) {
          const newLines = newContent.split('\n');
          let warning = '';
          let escapedCount = 0;
          for (let li = 0; li < newLines.length; li++) {
            const line = newLines[li];
            if (oldContent.includes(line)) continue;
            if (
              deps.detectCssSectionInline(line) !== null ||
              deps.detectCssBlockOpen(line) ||
              deps.detectCssBlockClose(line)
            ) {
              newLines[li] = line.replace(/={3,}/g, (m) => m.slice(0, 2) + '·' + m.slice(3));
              escapedCount++;
            }
          }
          if (escapedCount > 0) {
            newContent = newLines.join('\n');
            warning = ` (경고: CSS 섹션 구분자 ${escapedCount}건을 이스케이프 처리했습니다)`;
          }
          sections[idx].content = newContent;
          currentData.css = deps.combineCssSections(sections, prefix, suffix);
          logMcpMutation('insert css section content', `css-section:${idx}`, {
            sectionName,
            position,
            oldSize: oldContent.length,
            newSize: newContent.length,
          });
          deps.broadcastToAll('data-updated', 'css', currentData.css);
          return jsonResSuccess(
            res,
            {
              success: true,
              index: idx,
              name: sectionName,
              position,
              oldSize: oldContent.length,
              newSize: newContent.length,
              warning: warning || undefined,
            },
            {
              toolName: 'insert_in_css',
              summary: `Inserted content at ${position} in CSS section [${idx}] "${sectionName}"`,
            },
          );
        } else {
          return mcpError(res, 403, {
            action: 'insert css section content',
            message: '사용자가 거부했습니다',
            rejected: true,
            suggestion: '앱에서 삽입 요청을 허용한 뒤 다시 시도하세요.',
            target: `css-section:${idx}`,
          });
        }
      }

      // ----------------------------------------------------------------
      // GET /references — list loaded reference files
      // ----------------------------------------------------------------
      if (parts[0] === 'references' && !parts[1] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const refs = refFiles.map((r: any, i: number) => {
          const fileType = getRefFileType(r);
          const refData = referenceDataWithFileType(r);
          const refId = r.id || r.filePath || r.fileName;
          const fields: Record<string, unknown>[] = [];
          const pushStringField = (name: string) => {
            if (isHiddenField(refData, name)) return;
            const value = refData[name];
            if (typeof value === 'string' && value) {
              fields.push({ name, size: value.length });
            }
          };
          // lua / css — standalone complex surfaces
          pushStringField('lua');
          pushStringField('css');
          // Shared scalar fields
          for (const sf of REF_SCALAR_FIELDS) {
            if (isHiddenField(refData, sf.id)) continue;
            const val = refData[sf.id];
            if (sf.isArray) {
              if (Array.isArray(val) && val.length > 0) fields.push({ name: sf.id, count: val.length, type: 'array' });
            } else if (sf.id === 'triggerScripts') {
              if (typeof val === 'string' && val !== '[]') fields.push({ name: sf.id, size: val.length });
            } else if (val) {
              fields.push({ name: sf.id, size: typeof val === 'string' ? val.length : 0 });
            }
          }
          if (fileType === 'risum') {
            pushStringField('moduleDescription');
            pushStringField('cjs');
            pushStringField('backgroundEmbedding');
          }
          if (fileType === 'risup') {
            for (const fieldName of [
              'mainPrompt',
              'jailbreak',
              'promptTemplate',
              'formatingOrder',
              'templateDefaultVariables',
            ]) {
              pushStringField(fieldName);
            }
          }
          // Complex array surfaces
          if (r.data.lorebook?.length) fields.push({ name: 'lorebook', count: r.data.lorebook.length, type: 'array' });
          if (r.data.regex?.length) fields.push({ name: 'regex', count: r.data.regex.length, type: 'array' });
          return {
            index: i,
            id: refId,
            fileName: r.fileName,
            fileType,
            fields,
            hiddenFieldWarnings: collectHiddenFieldWarnings(refData),
          };
        });
        return jsonResSuccess(
          res,
          { count: refs.length, references: refs },
          {
            toolName: 'list_references',
            summary: `Listed ${refs.length} reference file(s)`,
            artifacts: { count: refs.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/greetings/:type — list reference greetings
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'greetings' &&
        parts[3] &&
        !parts[4] &&
        req.method === 'GET'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'list reference greetings',
            target: `reference:${idx}:greetings:${parts[3]}`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const greetingType = parts[3];
        const fieldName = getGreetingFieldName(greetingType);
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'list reference greetings',
            target: `reference:${idx}:greetings:${greetingType}`,
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          });
        }
        const ref = refFiles[idx];
        const hiddenBlock = getHiddenFieldReadBlock(referenceDataWithFileType(ref), fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'list reference greetings',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `reference:${idx}:greetings:${greetingType}`,
          });
        }
        const arr: string[] = Array.isArray(ref.data[fieldName]) ? ref.data[fieldName] : [];
        let items = arr.map((g: string, i: number) => ({
          index: i,
          contentSize: g.length,
          preview: g.slice(0, 100) + (g.length > 100 ? '…' : ''),
        }));
        const filterParam = url.searchParams.get('filter');
        if (filterParam) {
          const q = filterParam.toLowerCase();
          items = items.filter((entry) => (arr[entry.index] || '').toLowerCase().includes(q));
        }
        const contentFilterParam = url.searchParams.get('content_filter');
        if (contentFilterParam) {
          const cq = contentFilterParam.toLowerCase();
          items = items.filter((entry) => (arr[entry.index] || '').toLowerCase().includes(cq));
          items = items.map((entry) => {
            const rawContent = arr[entry.index] || '';
            const lowered = rawContent.toLowerCase();
            const matchPos = lowered.indexOf(cq);
            if (matchPos >= 0) {
              const start = Math.max(0, matchPos - 50);
              const end = Math.min(rawContent.length, matchPos + cq.length + 50);
              return {
                ...entry,
                contentMatch:
                  (start > 0 ? '…' : '') + rawContent.slice(start, end) + (end < rawContent.length ? '…' : ''),
              };
            }
            return entry;
          });
        }
        return jsonResSuccess(
          res,
          {
            refIndex: idx,
            fileName: ref.fileName,
            type: greetingType,
            field: fieldName,
            count: items.length,
            total: arr.length,
            items,
          },
          {
            toolName: 'list_reference_greetings',
            summary: `Listed ${items.length} ${greetingType} reference greetings`,
            artifacts: { refIndex: idx, count: items.length, total: arr.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/greeting/:type/batch — batch read reference greetings
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'greeting' &&
        parts[3] &&
        parts[4] === 'batch' &&
        !parts[5] &&
        req.method === 'POST'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'batch read reference greetings',
            target: `reference:${idx}:greeting:${parts[3]}:batch`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const greetingType = parts[3];
        const fieldName = getGreetingFieldName(greetingType);
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'batch read reference greetings',
            target: `reference:${idx}:greeting:${greetingType}:batch`,
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          });
        }
        const body = await readJsonBody(req, res, `reference/${idx}/greeting/${greetingType}/batch`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return mcpError(res, 400, {
            action: 'batch read reference greetings',
            target: `reference:${idx}:greeting:${greetingType}:batch`,
            message: 'indices must be an array of numbers',
          });
        }
        const MAX_BATCH = 50;
        if (indices.length > MAX_BATCH) {
          return mcpError(res, 400, {
            action: 'batch read reference greetings',
            target: `reference:${idx}:greeting:${greetingType}:batch`,
            message: `Maximum ${MAX_BATCH} indices per batch`,
          });
        }
        const ref = refFiles[idx];
        const hiddenBlock = getHiddenFieldReadBlock(referenceDataWithFileType(ref), fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'batch read reference greetings',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `reference:${idx}:greeting:${greetingType}:batch`,
          });
        }
        const arr: string[] = Array.isArray(ref.data[fieldName]) ? ref.data[fieldName] : [];
        const items = indices.map((entryIdx: number) => {
          if (typeof entryIdx !== 'number' || entryIdx < 0 || entryIdx >= arr.length) return null;
          return { index: entryIdx, content: arr[entryIdx] };
        });
        const validCount = items.filter(Boolean).length;
        return jsonResSuccess(
          res,
          {
            refIndex: idx,
            fileName: ref.fileName,
            type: greetingType,
            field: fieldName,
            count: validCount,
            total: indices.length,
            items,
          },
          {
            toolName: 'read_reference_greeting_batch',
            summary: `Batch read ${validCount}/${indices.length} ${greetingType} reference greetings`,
            artifacts: { refIndex: idx, count: validCount, total: indices.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/greeting/:type/:entryIdx — read single reference greeting
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'greeting' &&
        parts[3] &&
        parts[4] &&
        !parts[5] &&
        req.method === 'GET'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference greeting',
            target: `reference:${idx}:greeting:${parts[3]}:${parts[4]}`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const greetingType = parts[3];
        const fieldName = getGreetingFieldName(greetingType);
        if (!fieldName) {
          return mcpError(res, 400, {
            action: 'read reference greeting',
            target: `reference:${idx}:greeting:${greetingType}`,
            message: `Unknown greeting type: "${greetingType}"`,
            suggestion: 'type은 "alternate" 또는 "group"만 사용 가능합니다.',
          });
        }
        const ref = refFiles[idx];
        const hiddenBlock = getHiddenFieldReadBlock(referenceDataWithFileType(ref), fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'read reference greeting',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `reference:${idx}:greeting:${greetingType}`,
          });
        }
        const arr: string[] = Array.isArray(ref.data[fieldName]) ? ref.data[fieldName] : [];
        const entryIdx = parseInt(parts[4], 10);
        if (isNaN(entryIdx) || entryIdx < 0 || entryIdx >= arr.length) {
          return mcpError(res, 400, {
            action: 'read reference greeting',
            target: `reference:${idx}:greeting:${greetingType}:${entryIdx}`,
            message: `Greeting index ${entryIdx} out of range (0..${arr.length - 1})`,
            suggestion: `list_reference_greetings로 유효한 index를 확인하세요.`,
          });
        }
        return jsonResSuccess(
          res,
          { refIndex: idx, fileName: ref.fileName, type: greetingType, entryIndex: entryIdx, content: arr[entryIdx] },
          {
            toolName: 'read_reference_greeting',
            summary: `Read ${greetingType} reference greeting [${entryIdx}]`,
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/triggers — list reference trigger scripts
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'triggers' && !parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'list reference triggers',
            target: `reference:${idx}:triggers`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const normalized = deps.normalizeTriggerScripts(ref.data.triggerScripts || []);
        const scripts = Array.isArray(normalized) ? normalized : [];
        const items = scripts.map((t: any, i: number) => ({
          index: i,
          comment: t.comment || '',
          type: t.type || '',
          conditionCount: Array.isArray(t.conditions) ? t.conditions.length : 0,
          effectCount: Array.isArray(t.effect) ? t.effect.length : 0,
          lowLevelAccess: !!t.lowLevelAccess,
        }));
        return jsonResSuccess(
          res,
          { refIndex: idx, fileName: ref.fileName, count: scripts.length, items },
          {
            toolName: 'list_reference_triggers',
            summary: `Listed ${scripts.length} reference trigger scripts`,
            artifacts: { refIndex: idx, count: scripts.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/trigger/batch — batch read reference trigger scripts
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'trigger' &&
        parts[3] === 'batch' &&
        !parts[4] &&
        req.method === 'POST'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'batch read reference triggers',
            target: `reference:${idx}:trigger:batch`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const body = await readJsonBody(req, res, `reference/${idx}/trigger/batch`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return mcpError(res, 400, {
            action: 'batch read reference triggers',
            target: `reference:${idx}:trigger:batch`,
            message: 'indices must be an array of numbers',
          });
        }
        const MAX_BATCH = 50;
        if (indices.length > MAX_BATCH) {
          return mcpError(res, 400, {
            action: 'batch read reference triggers',
            target: `reference:${idx}:trigger:batch`,
            message: `Maximum ${MAX_BATCH} indices per batch`,
          });
        }
        const ref = refFiles[idx];
        const normalized = deps.normalizeTriggerScripts(ref.data.triggerScripts || []);
        const scripts = Array.isArray(normalized) ? normalized : [];
        const triggers = indices.map((triggerIdx: number) => {
          if (typeof triggerIdx !== 'number' || triggerIdx < 0 || triggerIdx >= scripts.length) return null;
          return { index: triggerIdx, trigger: scripts[triggerIdx] };
        });
        const validCount = triggers.filter(Boolean).length;
        return jsonResSuccess(
          res,
          {
            refIndex: idx,
            fileName: ref.fileName,
            count: validCount,
            total: indices.length,
            triggers,
          },
          {
            toolName: 'read_reference_trigger_batch',
            summary: `Batch read ${validCount}/${indices.length} reference trigger scripts`,
            artifacts: { refIndex: idx, count: validCount, total: indices.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/trigger/:triggerIdx — read single reference trigger script
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'trigger' &&
        parts[3] &&
        !parts[4] &&
        req.method === 'GET'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference trigger',
            target: `reference:${idx}:trigger:${parts[3]}`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const normalized = deps.normalizeTriggerScripts(ref.data.triggerScripts || []);
        const scripts = Array.isArray(normalized) ? normalized : [];
        const triggerIdx = parseInt(parts[3], 10);
        if (isNaN(triggerIdx) || triggerIdx < 0 || triggerIdx >= scripts.length) {
          return mcpError(res, 400, {
            action: 'read reference trigger',
            target: `reference:${idx}:trigger:${triggerIdx}`,
            message: `Trigger index ${triggerIdx} out of range (0..${scripts.length - 1})`,
            suggestion: 'list_reference_triggers로 유효한 index를 확인하세요.',
          });
        }
        return jsonResSuccess(
          res,
          { refIndex: idx, fileName: ref.fileName, triggerIndex: triggerIdx, trigger: scripts[triggerIdx] },
          {
            toolName: 'read_reference_trigger',
            summary: `Read reference trigger [${triggerIdx}] "${scripts[triggerIdx].comment || ''}"`,
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/lorebook — list reference lorebook entries (compact)
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'lorebook' && !parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference lorebook',
            target: `reference:${idx}:lorebook`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const lorebook = ref.data.lorebook || [];

        // Parse preview_length
        const previewLengthParam = url.searchParams.get('preview_length');
        const previewLength =
          previewLengthParam !== null ? Math.min(Math.max(parseInt(previewLengthParam, 10) || 0, 0), 500) : 150;

        let entries = lorebook.map((e: any, i: number) => {
          const content = e.content || '';
          const normalized = normalizeLorebookEntryForResponse(e, lorebook);
          const entry: Record<string, unknown> = {
            index: i,
            comment: normalized.comment || '',
            key: normalized.key || '',
            mode: normalized.mode || 'normal',
            alwaysActive: !!normalized.alwaysActive,
            contentSize: content.length,
            folder: normalized.folder || '',
          };
          if (previewLength > 0) {
            entry.contentPreview = content.slice(0, previewLength) + (content.length > previewLength ? '…' : '');
          }
          return entry;
        });
        // Filter by folder UUID
        const folderParam = url.searchParams.get('folder');
        if (folderParam) {
          const folderId = resolveLorebookFolderRef(folderParam, lorebook);
          entries = entries.filter((e: any) => e.folder === folderId);
        }
        const filterParam = url.searchParams.get('filter');
        if (filterParam) {
          const q = filterParam.toLowerCase();
          entries = entries.filter((e: any) => e.comment.toLowerCase().includes(q) || e.key.toLowerCase().includes(q));
        }
        // Filter by content keyword
        const contentFilterParam = url.searchParams.get('content_filter');
        if (contentFilterParam) {
          const cq = contentFilterParam.toLowerCase();
          entries = entries.filter((_e: any) => {
            const content = (lorebook[(_e as any).index]?.content || '').toLowerCase();
            return content.includes(cq);
          });
          // Add match context preview for content_filter results
          entries = entries.map((e: any) => {
            const content = (lorebook[e.index]?.content || '').toLowerCase();
            const matchPos = content.indexOf(contentFilterParam.toLowerCase());
            if (matchPos >= 0) {
              const rawContent = lorebook[e.index]?.content || '';
              const start = Math.max(0, matchPos - 50);
              const end = Math.min(rawContent.length, matchPos + contentFilterParam.length + 50);
              e.contentMatch =
                (start > 0 ? '…' : '') + rawContent.slice(start, end) + (end < rawContent.length ? '…' : '');
            }
            return e;
          });
        }
        // Filter by content NOT containing keyword
        const contentFilterNotParam = url.searchParams.get('content_filter_not');
        if (contentFilterNotParam) {
          const nq = contentFilterNotParam.toLowerCase();
          entries = entries.filter((_e: any) => {
            const content = (lorebook[(_e as any).index]?.content || '').toLowerCase();
            return !content.includes(nq);
          });
        }
        return jsonResSuccess(
          res,
          { index: idx, fileName: ref.fileName, count: entries.length, entries },
          {
            toolName: 'list_reference_lorebook',
            summary: `Listed ${entries.length} lorebook entries in reference ${idx}`,
            artifacts: { refIndex: idx, count: entries.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/lorebook/batch — batch read reference lorebook
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'lorebook' &&
        parts[3] === 'batch' &&
        req.method === 'POST'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'batch read reference lorebook',
            target: `reference:${idx}:lorebook:batch`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const body = await readJsonBody(req, res, `reference/${idx}/lorebook/batch`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return mcpError(res, 400, {
            action: 'batch read reference lorebook',
            target: `reference:${idx}:lorebook:batch`,
            message: 'indices must be an array of numbers',
          });
        }
        const MAX_BATCH = 50;
        if (indices.length > MAX_BATCH) {
          return mcpError(res, 400, {
            action: 'batch read reference lorebook',
            target: `reference:${idx}:lorebook:batch`,
            message: `Maximum ${MAX_BATCH} indices per batch`,
          });
        }
        const lorebook = refFiles[idx].data.lorebook || [];
        const requestedFields: string[] | undefined = body.fields;
        const entries = indices.map((entryIdx: number) => {
          if (typeof entryIdx !== 'number' || entryIdx < 0 || entryIdx >= lorebook.length) return null;
          return {
            index: entryIdx,
            entry: projectLorebookEntryForResponse(lorebook[entryIdx], lorebook, requestedFields),
          };
        });
        const batchCount = entries.filter(Boolean).length;
        return jsonResSuccess(
          res,
          {
            refIndex: idx,
            fileName: refFiles[idx].fileName,
            count: batchCount,
            total: indices.length,
            entries,
          },
          {
            toolName: 'read_reference_lorebook_batch',
            summary: `Batch read ${batchCount}/${indices.length} reference lorebook entries`,
            artifacts: { refIndex: idx, count: batchCount, total: indices.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/lorebook/:entryIdx — read single reference lorebook entry
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'lorebook' && parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference lorebook',
            target: `reference:${idx}:lorebook:${parts[3]}`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const lorebook = ref.data.lorebook || [];
        const entryIdx = parseInt(parts[3], 10);
        if (isNaN(entryIdx) || entryIdx < 0 || entryIdx >= lorebook.length) {
          return mcpError(res, 400, {
            action: 'read reference lorebook',
            target: `reference:${idx}:lorebook:${entryIdx}`,
            message: `Lorebook entry index ${entryIdx} out of range (0-${lorebook.length - 1})`,
          });
        }
        return jsonResSuccess(
          res,
          {
            refIndex: idx,
            fileName: ref.fileName,
            entryIndex: entryIdx,
            entry: normalizeLorebookEntryForResponse(lorebook[entryIdx], lorebook),
          },
          {
            toolName: 'read_reference_lorebook',
            summary: `Read reference ${idx} lorebook entry ${entryIdx}`,
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/regex — list reference regex entries (compact)
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'regex' && !parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference regex',
            target: `reference:${idx}:regex`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const regexArr = ref.data.regex || [];
        const entries = regexArr.map((e: Record<string, unknown>, i: number) => ({
          index: i,
          comment: e.comment || '',
          type: e.type || '',
          findSize: typeof e.find === 'string' ? e.find.length : typeof e.in === 'string' ? (e.in as string).length : 0,
          replaceSize:
            typeof e.replace === 'string' ? e.replace.length : typeof e.out === 'string' ? (e.out as string).length : 0,
        }));
        return jsonResSuccess(
          res,
          { refIndex: idx, fileName: ref.fileName, count: entries.length, entries },
          {
            toolName: 'list_reference_regex',
            summary: `Listed ${entries.length} regex entries in reference ${idx}`,
            artifacts: { refIndex: idx, count: entries.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/regex/batch — batch read reference regex entries
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'regex' &&
        parts[3] === 'batch' &&
        req.method === 'POST'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'batch read reference regex',
            target: `reference:${idx}:regex:batch`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const body = await readJsonBody(req, res, `reference/${idx}/regex/batch`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return mcpError(res, 400, {
            action: 'batch read reference regex',
            target: `reference:${idx}:regex:batch`,
            message: 'indices must be an array of numbers',
          });
        }
        const MAX_BATCH = 50;
        if (indices.length > MAX_BATCH) {
          return mcpError(res, 400, {
            action: 'batch read reference regex',
            target: `reference:${idx}:regex:batch`,
            message: `Maximum ${MAX_BATCH} indices per batch`,
          });
        }
        const ref = refFiles[idx];
        const regexArr = (ref.data.regex as Record<string, unknown>[]) || [];
        const entries = indices.map((entryIdx: number) => {
          if (typeof entryIdx !== 'number' || entryIdx < 0 || entryIdx >= regexArr.length) return null;
          return { index: entryIdx, entry: normalizeRegexEntryForResponse(regexArr[entryIdx]) };
        });
        const validCount = entries.filter(Boolean).length;
        return jsonResSuccess(
          res,
          {
            refIndex: idx,
            fileName: ref.fileName,
            count: validCount,
            total: indices.length,
            entries,
          },
          {
            toolName: 'read_reference_regex_batch',
            summary: `Batch read ${validCount}/${indices.length} reference regex entries`,
            artifacts: { refIndex: idx, count: validCount, total: indices.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/regex/:entryIdx — read single reference regex entry
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'regex' && parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference regex',
            target: `reference:${idx}:regex:${parts[3]}`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const regexArr = ref.data.regex || [];
        const entryIdx = parseInt(parts[3], 10);
        if (isNaN(entryIdx) || entryIdx < 0 || entryIdx >= regexArr.length) {
          return mcpError(res, 400, {
            action: 'read reference regex',
            target: `reference:${idx}:regex:${entryIdx}`,
            message: `Regex entry index ${entryIdx} out of range (0-${regexArr.length - 1})`,
          });
        }
        const entry = normalizeRegexEntryForResponse(regexArr[entryIdx]);
        return jsonResSuccess(
          res,
          { refIndex: idx, fileName: ref.fileName, entryIndex: entryIdx, entry },
          {
            toolName: 'read_reference_regex',
            summary: `Read reference ${idx} regex entry ${entryIdx}`,
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/lua — list reference Lua sections
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'lua' && !parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference lua',
            target: `reference:${idx}:lua`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const luaCode = ref.data.lua || '';
        if (!luaCode) {
          return jsonResSuccess(
            res,
            { index: idx, fileName: ref.fileName, count: 0, sections: [] },
            {
              toolName: 'list_reference_lua',
              summary: `Listed 0 Lua sections in reference ${idx} (empty)`,
              artifacts: { refIndex: idx, count: 0 },
            },
          );
        }
        const sections = deps.parseLuaSections(luaCode);
        const result = sections.map((s, i) => ({
          index: i,
          name: s.name,
          contentSize: s.content.length,
        }));
        return jsonResSuccess(
          res,
          { index: idx, fileName: ref.fileName, count: result.length, sections: result },
          {
            toolName: 'list_reference_lua',
            summary: `Listed ${result.length} Lua section(s) in reference ${idx}`,
            artifacts: { refIndex: idx, count: result.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/lua/batch — batch read reference Lua sections
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'lua' && parts[3] === 'batch' && req.method === 'POST') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'batch read reference lua',
            target: `reference:${idx}:lua:batch`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const body = await readJsonBody(req, res, `reference/${idx}/lua/batch`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return mcpError(res, 400, {
            action: 'batch read reference lua',
            target: `reference:${idx}:lua:batch`,
            message: 'indices must be an array of numbers',
          });
        }
        const MAX_BATCH = 20;
        if (indices.length > MAX_BATCH) {
          return mcpError(res, 400, {
            action: 'batch read reference lua',
            target: `reference:${idx}:lua:batch`,
            message: `Maximum ${MAX_BATCH} indices per batch`,
          });
        }
        const luaCode = refFiles[idx].data.lua || '';
        const sections = luaCode ? deps.parseLuaSections(luaCode) : [];
        const result = indices.map((sIdx: number) => {
          if (typeof sIdx !== 'number' || sIdx < 0 || sIdx >= sections.length) return null;
          return { index: sIdx, name: sections[sIdx].name, content: sections[sIdx].content };
        });
        const luaBatchCount = result.filter(Boolean).length;
        return jsonResSuccess(
          res,
          {
            refIndex: idx,
            fileName: refFiles[idx].fileName,
            count: luaBatchCount,
            total: indices.length,
            sections: result,
          },
          {
            toolName: 'read_reference_lua_batch',
            summary: `Batch read ${luaBatchCount}/${indices.length} reference Lua sections`,
            artifacts: { refIndex: idx, count: luaBatchCount, total: indices.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/lua/:sectionIdx — read single reference Lua section
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'lua' && parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference lua',
            target: `reference:${idx}:lua:${parts[3]}`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const luaCode = ref.data.lua || '';
        const sections = luaCode ? deps.parseLuaSections(luaCode) : [];
        const sectionIdx = parseInt(parts[3], 10);
        if (isNaN(sectionIdx) || sectionIdx < 0 || sectionIdx >= sections.length) {
          return mcpError(res, 400, {
            action: 'read reference lua',
            target: `reference:${idx}:lua:${sectionIdx}`,
            message: `Lua section index ${sectionIdx} out of range (0-${sections.length - 1})`,
          });
        }
        return jsonResSuccess(
          res,
          {
            refIndex: idx,
            fileName: ref.fileName,
            sectionIndex: sectionIdx,
            name: sections[sectionIdx].name,
            content: sections[sectionIdx].content,
          },
          {
            toolName: 'read_reference_lua',
            summary: `Read reference ${idx} Lua section ${sectionIdx} ("${sections[sectionIdx].name}")`,
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/css — list reference CSS sections
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'css' && !parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference css',
            target: `reference:${idx}:css`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const cssCode = ref.data.css || '';
        if (!cssCode) {
          return jsonResSuccess(
            res,
            { index: idx, fileName: ref.fileName, count: 0, sections: [] },
            {
              toolName: 'list_reference_css',
              summary: `Listed 0 CSS sections in reference ${idx} (empty)`,
              artifacts: { refIndex: idx, count: 0 },
            },
          );
        }
        const cssResult = deps.parseCssSections(cssCode);
        const result = cssResult.sections.map((s, i) => ({
          index: i,
          name: s.name,
          contentSize: s.content.length,
        }));
        return jsonResSuccess(
          res,
          { index: idx, fileName: ref.fileName, count: result.length, sections: result },
          {
            toolName: 'list_reference_css',
            summary: `Listed ${result.length} CSS section(s) in reference ${idx}`,
            artifacts: { refIndex: idx, count: result.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/css/batch — batch read reference CSS sections
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'css' && parts[3] === 'batch' && req.method === 'POST') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'batch read reference css',
            target: `reference:${idx}:css:batch`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const body = await readJsonBody(req, res, `reference/${idx}/css/batch`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return mcpError(res, 400, {
            action: 'batch read reference css',
            target: `reference:${idx}:css:batch`,
            message: 'indices must be an array of numbers',
          });
        }
        const MAX_BATCH = 20;
        if (indices.length > MAX_BATCH) {
          return mcpError(res, 400, {
            action: 'batch read reference css',
            target: `reference:${idx}:css:batch`,
            message: `Maximum ${MAX_BATCH} indices per batch`,
          });
        }
        const cssCode = refFiles[idx].data.css || '';
        const cssResult = cssCode
          ? deps.parseCssSections(cssCode)
          : { sections: [] as Section[], prefix: '', suffix: '' };
        const result = indices.map((sIdx: number) => {
          if (typeof sIdx !== 'number' || sIdx < 0 || sIdx >= cssResult.sections.length) return null;
          return { index: sIdx, name: cssResult.sections[sIdx].name, content: cssResult.sections[sIdx].content };
        });
        const cssBatchCount = result.filter(Boolean).length;
        return jsonResSuccess(
          res,
          {
            refIndex: idx,
            fileName: refFiles[idx].fileName,
            count: cssBatchCount,
            total: indices.length,
            sections: result,
          },
          {
            toolName: 'read_reference_css_batch',
            summary: `Batch read ${cssBatchCount}/${indices.length} reference CSS sections`,
            artifacts: { refIndex: idx, count: cssBatchCount, total: indices.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/css/:sectionIdx — read single reference CSS section
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] === 'css' && parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference css',
            target: `reference:${idx}:css:${parts[3]}`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const cssCode = ref.data.css || '';
        const cssResult = cssCode
          ? deps.parseCssSections(cssCode)
          : { sections: [] as Section[], prefix: '', suffix: '' };
        const sectionIdx = parseInt(parts[3], 10);
        if (isNaN(sectionIdx) || sectionIdx < 0 || sectionIdx >= cssResult.sections.length) {
          return mcpError(res, 400, {
            action: 'read reference css',
            target: `reference:${idx}:css:${sectionIdx}`,
            message: `CSS section index ${sectionIdx} out of range (0-${cssResult.sections.length - 1})`,
          });
        }
        return jsonResSuccess(
          res,
          {
            refIndex: idx,
            fileName: ref.fileName,
            sectionIndex: sectionIdx,
            name: cssResult.sections[sectionIdx].name,
            content: cssResult.sections[sectionIdx].content,
          },
          {
            toolName: 'read_reference_css',
            summary: `Read reference ${idx} CSS section ${sectionIdx} ("${cssResult.sections[sectionIdx].name}")`,
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/field/batch — read multiple reference fields
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'field' &&
        parts[3] === 'batch' &&
        !parts[4] &&
        req.method === 'POST'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference field batch',
            target: `reference:${idx}:field:batch`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const body = await readJsonBody(req, res, `reference/${idx}/field/batch`, broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, fieldBatchReadSchema, {
          action: 'read reference field batch',
          target: `reference:${idx}:field:batch`,
          suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "fields": ["name", "description"] }',
        });
        if (!parsed) return;
        const fields = parsed.fields;
        if (fields.length === 0) {
          return mcpError(res, 400, {
            action: 'read reference field batch',
            message: 'fields must be a non-empty string array',
            suggestion: 'fields 를 문자열 배열로 전달하세요. 예: { "fields": ["name", "description"] }',
            target: `reference:${idx}:field:batch`,
          });
        }
        if (fields.length > MAX_FIELD_BATCH) {
          return mcpError(res, 400, {
            action: 'read reference field batch',
            message: `Maximum ${MAX_FIELD_BATCH} fields per batch`,
            suggestion: `요청을 ${MAX_FIELD_BATCH}개 이하의 필드로 나누어 여러 번 호출하세요.`,
            target: `reference:${idx}:field:batch`,
          });
        }

        const ref = refFiles[idx];
        const refData = referenceDataWithFileType(ref);
        const rules = getFieldAccessRules(refData);
        const results = fields.map((fieldName) => {
          const hidden = getHiddenFieldInfo(refData, fieldName);
          if (hidden) {
            return {
              field: fieldName,
              hidden: true,
              category: hidden.category,
              error: `Hidden deprecated/reserved/legacy field: ${fieldName}`,
              suggestion: hidden.suggestion,
            };
          }
          const payload = buildReferenceFieldReadPayload(refData, fieldName, deps);
          if (payload) {
            return payload;
          }
          return { field: fieldName, error: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}` };
        });

        return jsonResSuccess(
          res,
          { index: idx, fileName: ref.fileName, count: results.length, fields: results },
          {
            toolName: 'read_reference_field_batch',
            summary: `Read ${results.length} fields from reference ${idx}`,
            artifacts: { count: results.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/field/:name/search — search within a reference field
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'field' &&
        parts[3] &&
        parts[4] === 'search' &&
        !parts[5] &&
        req.method === 'POST'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        const fieldName = decodeURIComponent(parts[3]);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'search in reference field',
            target: `reference:${idx}:field:${fieldName}:search`,
            message: `Reference index ${idx} out of range`,
          });
        }
        if (!isReferenceTextField(fieldName)) {
          return mcpError(res, 400, {
            action: 'search in reference field',
            message: `"${fieldName}" 필드는 검색을 지원하지 않습니다.`,
            suggestion: '문자열 타입 reference 필드에만 사용 가능합니다.',
            target: `reference:${idx}:field:${fieldName}:search`,
          });
        }
        const body = await readJsonBody(req, res, `reference/${idx}/field/${fieldName}/search`, broadcastStatus);
        if (!body) return;
        const parsed = parseBody(res, body, searchBodySchema, {
          action: 'search in reference field',
          target: `reference:${idx}:field:${fieldName}:search`,
          suggestion: 'query 문자열을 포함한 요청 본문을 보내세요.',
        });
        if (!parsed) return;

        const ref = refFiles[idx];
        const refData = referenceDataWithFileType(ref);
        const hiddenBlock = getHiddenFieldReadBlock(refData, fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'search in reference field',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `reference:${idx}:field:${fieldName}:search`,
          });
        }
        const content = normalizeLF(
          typeof refData[fieldName] === 'string' ? refData[fieldName] : String(refData[fieldName] ?? ''),
        );
        const queryStr = normalizeLF(String(parsed.query));
        const contextChars = Math.max(0, Math.min(Number(parsed.context_chars) || 100, 500));
        const maxMatches = Math.max(1, Math.min(Number(parsed.max_matches) || 20, 100));
        const useRegex = !!parsed.regex;
        const flags = parsed.flags ?? (useRegex ? 'gi' : undefined);

        try {
          const result = searchTextBlock(content, {
            query: queryStr,
            regex: useRegex,
            flags,
            contextChars,
            maxMatches,
          });
          return jsonResSuccess(
            res,
            {
              index: idx,
              fileName: ref.fileName,
              field: fieldName,
              query: result.query,
              totalMatches: result.totalMatches,
              returnedMatches: result.returnedMatches,
              fieldLength: result.contentLength,
              matches: result.matches,
            },
            {
              toolName: 'search_in_reference_field',
              summary: `Found ${result.totalMatches} match(es) in reference ${idx} field "${fieldName}"`,
              artifacts: { fieldName, totalMatches: result.totalMatches },
            },
          );
        } catch (err) {
          return mcpError(res, 400, {
            action: 'search in reference field',
            message: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
            target: `reference:${idx}:field:${fieldName}:search`,
          });
        }
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/field/:name/range — read a substring of a reference field
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'field' &&
        parts[3] &&
        parts[4] === 'range' &&
        !parts[5] &&
        req.method === 'GET'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        const fieldName = decodeURIComponent(parts[3]);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference field range',
            target: `reference:${idx}:field:${fieldName}:range`,
            message: `Reference index ${idx} out of range`,
          });
        }
        if (!isReferenceTextField(fieldName)) {
          return mcpError(res, 400, {
            action: 'read reference field range',
            message: `"${fieldName}" 필드는 범위 읽기를 지원하지 않습니다.`,
            suggestion: '문자열 타입 reference 필드에만 사용 가능합니다.',
            target: `reference:${idx}:field:${fieldName}:range`,
          });
        }

        const ref = refFiles[idx];
        const refData = referenceDataWithFileType(ref);
        const hiddenBlock = getHiddenFieldReadBlock(refData, fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'read reference field range',
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
            target: `reference:${idx}:field:${fieldName}:range`,
          });
        }
        const content = typeof refData[fieldName] === 'string' ? refData[fieldName] : String(refData[fieldName] ?? '');
        const MAX_RANGE_LENGTH = 10000;
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        const length = Math.max(1, Math.min(Number(url.searchParams.get('length')) || 2000, MAX_RANGE_LENGTH));
        const slice = content.slice(offset, offset + length);

        return jsonResSuccess(
          res,
          {
            index: idx,
            fileName: ref.fileName,
            field: fieldName,
            totalLength: content.length,
            offset,
            length: slice.length,
            hasMore: offset + length < content.length,
            content: slice,
          },
          {
            toolName: 'read_reference_field_range',
            summary: `Read ${slice.length} chars from reference ${idx} field "${fieldName}" at offset ${offset}`,
            artifacts: { fieldName, offset, length: slice.length, totalLength: content.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/risup/prompt-items — list reference risup prompt items
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'risup' &&
        parts[3] === 'prompt-items' &&
        !parts[4] &&
        req.method === 'GET'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'list reference risup prompt items',
            target: `reference:${idx}:risup:promptTemplate`,
            message: `Reference index ${idx} out of range`,
          });
        }

        const ref = refFiles[idx];
        if (getRefFileType(ref) !== 'risup') {
          return mcpError(res, 400, {
            action: 'list reference risup prompt items',
            message: 'Selected reference file is not a risup preset.',
            suggestion: 'list_references로 fileType이 "risup"인 reference를 선택하세요.',
            target: `reference:${idx}:risup:promptTemplate`,
          });
        }

        const refData = referenceDataWithFileType(ref);
        const rawText = typeof refData.promptTemplate === 'string' ? refData.promptTemplate : '';
        const model = parsePromptTemplate(rawText);
        if (model.state === 'invalid') {
          return mcpError(res, 400, {
            action: 'list reference risup prompt items',
            message: `Invalid promptTemplate: ${model.parseError}`,
            suggestion:
              'read_reference_field(index, "promptTemplate") 또는 read_reference_field_range로 원문을 확인하세요.',
            target: `reference:${idx}:risup:promptTemplate`,
            details: { parseError: model.parseError },
          });
        }

        const items = model.items.map((item, i) => {
          const entry: Record<string, unknown> = {
            index: i,
            id: item.id ?? null,
            type: item.type ?? null,
            supported: item.supported,
            preview: promptItemPreview(item),
          };
          if (item.supported && item.name !== undefined) {
            entry.name = item.name;
          }
          return entry;
        });

        return jsonResSuccess(
          res,
          {
            index: idx,
            fileName: ref.fileName,
            count: model.items.length,
            state: model.state,
            hasUnsupportedContent: model.hasUnsupportedContent,
            items,
          },
          {
            toolName: 'list_reference_risup_prompt_items',
            summary: `Listed ${model.items.length} prompt items in reference ${idx} (state: ${model.state})`,
            artifacts: { count: model.items.length, state: model.state },
          },
        );
      }

      // ----------------------------------------------------------------
      // POST /reference/:idx/risup/prompt-items/batch — batch read reference risup prompt items
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'risup' &&
        parts[3] === 'prompt-items' &&
        parts[4] === 'batch' &&
        !parts[5] &&
        req.method === 'POST'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'batch read reference risup prompt items',
            target: `reference:${idx}:risup:promptTemplate:batch`,
            message: `Reference index ${idx} out of range`,
          });
        }

        const ref = refFiles[idx];
        if (getRefFileType(ref) !== 'risup') {
          return mcpError(res, 400, {
            action: 'batch read reference risup prompt items',
            message: 'Selected reference file is not a risup preset.',
            suggestion: 'list_references로 fileType이 "risup"인 reference를 선택하세요.',
            target: `reference:${idx}:risup:promptTemplate:batch`,
          });
        }

        const body = await readJsonBody(req, res, `reference/${idx}/risup/prompt-items/batch`, broadcastStatus);
        if (!body) return;
        const indices: number[] = body.indices;
        if (!Array.isArray(indices)) {
          return mcpError(res, 400, {
            action: 'batch read reference risup prompt items',
            message: 'indices must be an array of numbers',
            suggestion: 'indices를 숫자 index 배열로 전달하세요. 예: { "indices": [0, 1] }',
            target: `reference:${idx}:risup:promptTemplate:batch`,
          });
        }
        if (indices.length > MAX_RISUP_PROMPT_BATCH) {
          return mcpError(res, 400, {
            action: 'batch read reference risup prompt items',
            message: `Maximum ${MAX_RISUP_PROMPT_BATCH} indices per batch`,
            suggestion: `요청을 ${MAX_RISUP_PROMPT_BATCH}개 이하의 index로 나누어 여러 번 호출하세요.`,
            target: `reference:${idx}:risup:promptTemplate:batch`,
          });
        }

        const refData = referenceDataWithFileType(ref);
        const rawText = typeof refData.promptTemplate === 'string' ? refData.promptTemplate : '';
        const model = parsePromptTemplate(rawText);
        if (model.state === 'invalid') {
          return mcpError(res, 400, {
            action: 'batch read reference risup prompt items',
            message: `Invalid promptTemplate: ${model.parseError}`,
            suggestion:
              'read_reference_field(index, "promptTemplate") 또는 read_reference_field_range로 원문을 확인하세요.',
            target: `reference:${idx}:risup:promptTemplate:batch`,
            details: { parseError: model.parseError },
          });
        }

        const entries = indices.map((itemIdx: number) => {
          if (typeof itemIdx !== 'number' || itemIdx < 0 || itemIdx >= model.items.length) {
            return null;
          }
          const item = model.items[itemIdx];
          return {
            index: itemIdx,
            id: item.id ?? null,
            item: item.rawValue,
            supported: item.supported,
            type: item.type ?? null,
          };
        });
        const validCount = entries.filter(Boolean).length;
        return jsonResSuccess(
          res,
          {
            index: idx,
            fileName: ref.fileName,
            count: validCount,
            total: indices.length,
            entries,
          },
          {
            toolName: 'read_reference_risup_prompt_item_batch',
            summary: `Batch read ${validCount}/${indices.length} prompt items in reference ${idx}`,
            artifacts: { count: validCount, total: indices.length },
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/risup/prompt-item/:itemIdx — read a reference risup prompt item
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'risup' &&
        parts[3] === 'prompt-item' &&
        parts[4] &&
        !parts[5] &&
        req.method === 'GET'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        const itemIdx = parseInt(parts[4], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference risup prompt item',
            target: `reference:${idx}:risup:promptTemplate:${parts[4]}`,
            message: `Reference index ${idx} out of range`,
          });
        }

        const ref = refFiles[idx];
        if (getRefFileType(ref) !== 'risup') {
          return mcpError(res, 400, {
            action: 'read reference risup prompt item',
            message: 'Selected reference file is not a risup preset.',
            suggestion: 'list_references로 fileType이 "risup"인 reference를 선택하세요.',
            target: `reference:${idx}:risup:promptTemplate:${parts[4]}`,
          });
        }

        const refData = referenceDataWithFileType(ref);
        const rawText = typeof refData.promptTemplate === 'string' ? refData.promptTemplate : '';
        const model = parsePromptTemplate(rawText);
        if (model.state === 'invalid') {
          return mcpError(res, 400, {
            action: 'read reference risup prompt item',
            message: `Invalid promptTemplate: ${model.parseError}`,
            suggestion:
              'read_reference_field(index, "promptTemplate") 또는 read_reference_field_range로 원문을 확인하세요.',
            target: `reference:${idx}:risup:promptTemplate:${parts[4]}`,
          });
        }
        if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= model.items.length) {
          return mcpError(res, 400, {
            action: 'read reference risup prompt item',
            message: `Index ${parts[4]} out of range (0–${model.items.length - 1})`,
            suggestion: 'list_reference_risup_prompt_items로 유효한 index를 확인하세요.',
            target: `reference:${idx}:risup:promptTemplate:${parts[4]}`,
          });
        }

        const item = model.items[itemIdx];
        return jsonResSuccess(
          res,
          {
            index: idx,
            fileName: ref.fileName,
            itemIndex: itemIdx,
            id: item.id ?? null,
            item: item.rawValue,
            supported: item.supported,
            type: item.type,
          },
          {
            toolName: 'read_reference_risup_prompt_item',
            summary: `Read reference ${idx} prompt item [${itemIdx}] (type: ${item.type ?? 'unknown'})`,
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/risup/formating-order — read reference risup formating order
      // ----------------------------------------------------------------
      if (
        parts[0] === 'reference' &&
        parts[1] &&
        parts[2] === 'risup' &&
        parts[3] === 'formating-order' &&
        !parts[4] &&
        req.method === 'GET'
      ) {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference risup formating order',
            target: `reference:${idx}:risup:formatingOrder`,
            message: `Reference index ${idx} out of range`,
          });
        }

        const ref = refFiles[idx];
        if (getRefFileType(ref) !== 'risup') {
          return mcpError(res, 400, {
            action: 'read reference risup formating order',
            message: 'Selected reference file is not a risup preset.',
            suggestion: 'list_references로 fileType이 "risup"인 reference를 선택하세요.',
            target: `reference:${idx}:risup:formatingOrder`,
          });
        }

        const refData = (ref.data || {}) as Record<string, unknown>;
        const rawText = typeof refData.formatingOrder === 'string' ? refData.formatingOrder : '';
        const model = parseFormatingOrder(rawText);
        if (model.state === 'invalid') {
          return mcpError(res, 400, {
            action: 'read reference risup formating order',
            message: `Invalid formatingOrder: ${model.parseError}`,
            suggestion:
              'read_reference_field(index, "formatingOrder") 또는 read_reference_field_range로 원문을 확인하세요.',
            target: `reference:${idx}:risup:formatingOrder`,
            details: { parseError: model.parseError },
          });
        }

        const items = model.items.map((item, i) => ({ index: i, token: item.token, known: item.known }));
        const promptRaw = typeof refData.promptTemplate === 'string' ? refData.promptTemplate : '';
        const promptModel = parsePromptTemplate(promptRaw);
        const warnings = promptModel.state !== 'invalid' ? collectFormatingOrderWarnings(promptModel, model) : [];

        return jsonResSuccess(
          res,
          { index: idx, fileName: ref.fileName, state: model.state, items, warnings },
          {
            toolName: 'read_reference_risup_formating_order',
            summary: `Read reference ${idx} formating order (${items.length} tokens, state: ${model.state})`,
          },
        );
      }

      // ----------------------------------------------------------------
      // GET /reference/:idx/:field — read a reference file's field
      // ----------------------------------------------------------------
      if (parts[0] === 'reference' && parts[1] && parts[2] && !parts[3] && req.method === 'GET') {
        const refFiles = deps.getReferenceFiles();
        const idx = parseInt(parts[1], 10);
        const fieldName = decodeURIComponent(parts[2]);
        if (isNaN(idx) || idx < 0 || idx >= refFiles.length) {
          return mcpError(res, 400, {
            action: 'read reference field',
            target: `reference:${idx}:${fieldName}`,
            message: `Reference index ${idx} out of range`,
          });
        }
        const ref = refFiles[idx];
        const refData = (ref.data || {}) as Record<string, unknown>;
        const rules = getFieldAccessRules(refData);
        const hiddenBlock = getHiddenFieldReadBlock(refData, fieldName);
        if (hiddenBlock) {
          return mcpError(res, 400, {
            action: 'read reference field',
            target: `reference:${idx}:${fieldName}`,
            message: hiddenBlock.message,
            suggestion: hiddenBlock.suggestion,
          });
        }
        const payload = buildReferenceFieldReadPayload(refData, fieldName, deps);
        if (!payload) {
          return mcpError(res, 400, {
            action: 'read reference field',
            target: `reference:${idx}:${fieldName}`,
            message: `Unknown field: ${fieldName} ${getUnknownFieldHint(rules)}`,
          });
        }
        return jsonResSuccess(
          res,
          {
            index: idx,
            fileName: ref.fileName,
            ...payload,
          },
          {
            toolName: 'read_reference_field',
            summary: `Read reference ${idx} field "${fieldName}"`,
          },
        );
      }

      if (
        await handleAssetRoute(req, res, parts, currentData, {
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

        const entries = [...((currentData.lorebook as Record<string, unknown>[]) || [])];

        try {
          const options = {
            format: format as 'md' | 'json',
            groupByFolder,
            includeMetadata: true,
            sourceName: String((currentData as Record<string, unknown>).name || 'unknown'),
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
          const existingEntries = (currentData.lorebook as Record<string, unknown>[]) || [];
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
            (currentData.lorebook as unknown[]).push(folderEntry);
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
            (currentData.lorebook as unknown[]).push(entry);
          }

          // 3. Overwrite existing entries
          for (const { index, data } of resolution.toOverwrite) {
            const existing = (currentData.lorebook as Record<string, unknown>[])[index];
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

          canonicalizeLorebookFolderRefs((currentData.lorebook as Record<string, unknown>[]) || []);

          // Broadcast update
          deps.broadcastToAll('data-updated', 'lorebook', currentData.lorebook);

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
          return mcpError(res, 500, {
            action: 'import-lorebook',
            message: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
            target: 'lorebook',
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

        const value = (currentData as Record<string, unknown>)[field];
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
        await handleRisupPromptRoute(req, res, parts, currentData, {
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
          const skillRoots = deps.getSkillRoots().map((rootPath) => ({
            absolutePath: rootPath,
            relativePath: rootPath,
            scope: 'product' as const,
          }));
          const entries = listSkillCatalogEntries(skillRoots);
          const skills: Array<{
            name: string;
            description: string;
            tags: string[];
            relatedTools: string[];
            files: string[];
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
            });
          }
          skills.sort((a, b) => a.name.localeCompare(b.name));
          return jsonResSuccess(
            res,
            { count: skills.length, skills },
            {
              toolName: 'list_skills',
              summary: `Listed ${skills.length} skill(s)`,
              artifacts: { count: skills.length },
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
        const skillRoots = deps.getSkillRoots().map((rootPath) => ({
          absolutePath: rootPath,
          relativePath: rootPath,
          scope: 'product' as const,
        }));
        const filePath = resolveSkillCatalogFile(skillRoots, skillName, fileName);
        try {
          if (!filePath) {
            throw new Error('missing skill file');
          }
          const content = fs.readFileSync(filePath, 'utf-8');
          return jsonResSuccess(
            res,
            { skill: skillName, file: fileName, content },
            {
              toolName: 'read_skill',
              summary: `Read skill ${skillName}/${fileName} (${content.length} chars)`,
              artifacts: { skill: skillName, file: fileName, size: content.length },
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
