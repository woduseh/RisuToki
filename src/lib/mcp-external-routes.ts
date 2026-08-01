import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { ZodType } from 'zod';
import type { LoadedDocumentData } from '../charx-io';

import {
  applyExternalFieldMutation,
  applySurfacePatch,
  buildCssListResponse,
  buildFieldInventory,
  buildLuaListResponse,
  getCurrentSessionFilePath,
  getExternalFieldAccess,
  getExternalFieldMeasure,
  getExternalFileType,
  getHiddenFieldReadBlock,
  getPointerValue,
  getSurfacePatchMutationBlock,
  getSurfaceReadBlock,
  hasTraversalSegments,
  hashSurface,
  isExternalReadableStringField,
  logMcpMutation,
  measureSurface,
  readJsonBody,
  sameDocumentPath,
  validateTouchedRisupJsonFields,
  type McpNoOpInfo,
} from './mcp-api-helpers';
import type { McpApiDeps } from './mcp-api-server';
import {
  MAX_FIELD_BATCH,
  collectHiddenFieldWarnings,
  redactHiddenFields,
  type SupportedFileType,
} from './mcp-field-access';
import type { ProbeDocumentRequest } from './mcp-probe-routes';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';
import {
  externalDocumentBodySchema,
  fieldBatchWriteSchema,
  insertBodySchema,
  replaceBodySchema,
  searchBodySchema,
  type ExternalDocumentBody,
} from './mcp-request-schemas';
import { searchTextBlock } from './mcp-search';
import { fileStatMetadata } from './mcp-session-routes';
import { parsePromptTemplate } from './risup-prompt-model';
import { cloneJson, normalizeLF } from './shared-utils';

type JsonBody = Record<string, unknown>;
type ParseBody = <T>(
  res: http.ServerResponse,
  body: JsonBody,
  schema: ZodType<T>,
  meta: { action: string; target: string; suggestion?: string },
) => T | null;
type McpError = (res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown) => void;

export interface ExternalDocumentReaderDeps {
  openExternalDocument: McpApiDeps['openExternalDocument'];
  readJsonBody: typeof readJsonBody;
  parseBody: ParseBody;
  broadcastStatus: (payload: Record<string, unknown>) => void;
  mcpError: McpError;
}

export function createExternalDocumentReaders(readerDeps: ExternalDocumentReaderDeps) {
  async function resolveExternalDocumentRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    routePath: string,
    action: string,
    target: string,
  ): Promise<{ body: ExternalDocumentBody; filePath: string; fileType: SupportedFileType } | null> {
    const rawBody = await readerDeps.readJsonBody(req, res, routePath, readerDeps.broadcastStatus);
    if (!rawBody) return null;
    const parsed = readerDeps.parseBody(res, rawBody, externalDocumentBodySchema, {
      action,
      target,
      suggestion: '절대 경로의 file_path를 요청 본문에 포함하세요.',
    });
    if (!parsed) return null;
    const rawPath = parsed.file_path.trim();
    if (!rawPath) {
      readerDeps.mcpError(res, 400, {
        action,
        target,
        message: 'Missing "file_path"',
        suggestion: '절대 경로의 file_path를 요청 본문에 포함하세요.',
      });
      return null;
    }
    if (hasTraversalSegments(rawPath)) {
      readerDeps.mcpError(res, 400, {
        action,
        target,
        message: 'file_path must not include ".." path traversal segments',
        suggestion: '정규화된 절대 경로를 사용하고 ".." 세그먼트는 제거하세요.',
      });
      return null;
    }
    if (!path.isAbsolute(rawPath)) {
      readerDeps.mcpError(res, 400, {
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
      readerDeps.mcpError(res, 400, {
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
      readerDeps.mcpError(
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
      readerDeps.mcpError(res, 400, {
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
        data: readerDeps.openExternalDocument(request.filePath),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      readerDeps.mcpError(
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

  return { readProbeDocumentRequest, resolveExternalDocumentRequest };
}

export type ExternalDocumentReaders = ReturnType<typeof createExternalDocumentReaders>;

type ExternalApiDeps = Pick<
  McpApiDeps,
  | 'askRendererConfirm'
  | 'extractPrimaryLua'
  | 'getCurrentFilePath'
  | 'mergePrimaryLua'
  | 'normalizeTriggerScripts'
  | 'openExternalDocument'
  | 'parseCssSections'
  | 'parseLuaSections'
  | 'requestRendererOpenFile'
  | 'saveExternalDocument'
  | 'stringifyTriggerScripts'
>;

export interface ExternalRouteDeps {
  api: ExternalApiDeps;
  documentReaders: ExternalDocumentReaders;
  openFileRequestState: { inFlight: boolean };
  acquireFieldMutex: (fieldName: string) => Promise<() => void>;
  parseBody: ParseBody;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, options: McpSuccessOptions) => void;
  mcpError: McpError;
  mcpNoOp: (res: http.ServerResponse, info: McpNoOpInfo, extra?: Record<string, unknown>) => void;
}

export async function handleExternalRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  url: URL,
  routeDeps: ExternalRouteDeps,
): Promise<boolean> {
  const deps = routeDeps.api;
  const {
    acquireFieldMutex,
    documentReaders: { readProbeDocumentRequest, resolveExternalDocumentRequest },
    jsonResSuccess,
    mcpError,
    mcpNoOp,
    openFileRequestState,
    parseBody,
  } = routeDeps;

  async function dispatch(): Promise<void | false> {
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
            alternateGreetings: Array.isArray(probe.data.alternateGreetings) ? probe.data.alternateGreetings.length : 0,
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
          suggestion: '현재 열린 문서는 external_* 대신 기존 write_field_batch 같은 active-document 도구를 사용하세요.',
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
        deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data as LoadedDocumentData);
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
        deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data as LoadedDocumentData);
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
        deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data as LoadedDocumentData);
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
        deps.saveExternalDocument(probe.filePath, probe.fileType, probe.data as LoadedDocumentData);
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

      if (openFileRequestState.inFlight) {
        return mcpError(res, 409, {
          action: 'open file',
          message: 'Another open_file request is already in progress',
          suggestion: '현재 문서 전환이 끝난 뒤 다시 시도하세요.',
          target: 'open:file',
        });
      }

      openFileRequestState.inFlight = true;
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
        openFileRequestState.inFlight = false;
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
        deps.saveExternalDocument(probe.filePath, probe.fileType, draft as LoadedDocumentData);
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

    return false;
  }

  const handled = await dispatch();
  return handled !== false;
}
