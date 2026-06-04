import type * as http from 'http';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';
import type { SupportedFileType } from './mcp-field-access';
import type { McpApiDeps } from './mcp-api-server';

type JsonBody = Record<string, unknown>;

interface SurfaceRouteDeps {
  askRendererConfirm: McpApiDeps['askRendererConfirm'];
  broadcastToAll: McpApiDeps['broadcastToAll'];
  getSessionStatus?: McpApiDeps['getSessionStatus'];
  invalidateAssetsMapCache?: McpApiDeps['invalidateAssetsMapCache'];
  readJsonBody: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    action: string,
    broadcastStatus: (payload: Record<string, unknown>) => void,
  ) => Promise<JsonBody | null>;
  broadcastStatus: (payload: Record<string, unknown>) => void;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, opts: McpSuccessOptions) => void;
  mcpError: (res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown) => void;
  mcpNoOp: (res: http.ServerResponse, info: McpNoOpInfo, extra?: Record<string, unknown>) => void;
  inferDocumentFileType: (data: Record<string, unknown>, fallback?: SupportedFileType | null) => SupportedFileType;
  buildSurfaceList: (data: Record<string, unknown>, fileType: SupportedFileType) => Record<string, unknown>[];
  hashSurface: (value: unknown) => string;
  collectHiddenFieldWarnings: (data: Record<string, unknown>) => unknown[];
  getSurfaceReadBlock: (data: Record<string, unknown>, pointer: string) => SurfaceBlock | null;
  getPointerValue: (root: unknown, pointer: string | undefined) => unknown;
  redactHiddenFields: (data: Record<string, unknown>) => unknown;
  measureSurface: (value: unknown) => Record<string, unknown>;
  getSurfacePatchMutationBlock: (data: Record<string, unknown>, operations: unknown[]) => SurfaceBlock | null;
  cloneJson: <T>(value: T) => T;
  applySurfacePatch: (
    root: Record<string, unknown>,
    operations: unknown[],
  ) => { changed: number; touchedTopLevel: string[] };
  touchesAssetMapSource: (fields: readonly string[]) => boolean;
  logMcpMutation: (action: string, target: string, details: Record<string, unknown>) => void;
  getSurfaceMutationBlock: (data: Record<string, unknown>, pointer: string) => SurfaceBlock | null;
  replaceStringInSurface: (
    value: unknown,
    find: string,
    replacement: string,
    useRegex: boolean,
    flags?: string,
  ) => { next: unknown; matches: number };
  setPointerValue: (root: unknown, pointer: string, value: unknown, allowAdd: boolean) => void;
}

interface SurfaceBlock {
  fieldName: string;
  message: string;
  suggestion: string;
}

type McpNoOpInfo = Omit<McpErrorInfo, 'rejected'>;

function topLevelFieldFromPointer(pointer: string): string | undefined {
  const first = pointer.split('/')[1];
  return first ? first.replace(/~1/g, '/').replace(/~0/g, '~') : undefined;
}

export async function handleSurfaceRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  currentData: Record<string, unknown>,
  deps: SurfaceRouteDeps,
): Promise<boolean> {
  if (req.method === 'GET' && parts[0] === 'surfaces' && !parts[1]) {
    const status = deps.getSessionStatus ? await deps.getSessionStatus() : null;
    const fileType = deps.inferDocumentFileType(currentData, status?.currentFileType);
    const surfaces = deps.buildSurfaceList(currentData, fileType);
    deps.jsonResSuccess(
      res,
      {
        fileType,
        count: surfaces.length,
        document_hash: deps.hashSurface(currentData),
        surfaces,
        hiddenFieldWarnings: deps.collectHiddenFieldWarnings(currentData),
      },
      {
        toolName: 'list_surfaces',
        summary: `Listed ${surfaces.length} editable surface(s) (${fileType})`,
        artifacts: { count: surfaces.length, fileType },
      },
    );
    return true;
  }

  if (parts[0] === 'surface' && parts[1] === 'read' && !parts[2] && req.method === 'POST') {
    const body = await deps.readJsonBody(req, res, 'surface/read', deps.broadcastStatus);
    if (!body) return true;
    const pointer = typeof body.path === 'string' ? body.path : '';
    const hiddenBlock = deps.getSurfaceReadBlock(currentData, pointer);
    if (hiddenBlock) {
      deps.mcpError(res, 400, {
        action: 'read surface',
        message: hiddenBlock.message,
        suggestion: hiddenBlock.suggestion,
        target: `surface:${hiddenBlock.fieldName}`,
      });
      return true;
    }
    try {
      const value =
        pointer && pointer !== '/' ? deps.getPointerValue(currentData, pointer) : deps.redactHiddenFields(currentData);
      deps.jsonResSuccess(
        res,
        {
          path: pointer || '/',
          value,
          hash: deps.hashSurface(value),
          hiddenFieldWarnings: deps.collectHiddenFieldWarnings(currentData),
          ...deps.measureSurface(value),
        },
        {
          toolName: 'read_surface',
          summary: `Read surface ${pointer || '/'}`,
        },
      );
      return true;
    } catch (error) {
      deps.mcpError(res, 400, {
        action: 'read surface',
        message: error instanceof Error ? error.message : String(error),
        suggestion: 'list_surfaces로 대상 path를 확인하세요.',
        target: `surface:${pointer || '/'}`,
      });
      return true;
    }
  }

  if (parts[0] === 'surface' && parts[1] === 'patch' && !parts[2] && req.method === 'POST') {
    const body = await deps.readJsonBody(req, res, 'surface/patch', deps.broadcastStatus);
    if (!body) return true;
    const operations = Array.isArray(body.operations) ? body.operations : null;
    if (!operations || operations.length === 0) {
      deps.mcpError(res, 400, {
        action: 'patch surface',
        message: 'operations must be a non-empty JSON Patch array',
        suggestion: '{ "operations": [{ "op": "replace", "path": "/name", "value": "..." }] } 형태로 전달하세요.',
        target: 'surface:patch',
      });
      return true;
    }
    const expectedHash = typeof body.expected_hash === 'string' ? body.expected_hash : undefined;
    const beforeHash = deps.hashSurface(currentData);
    if (expectedHash && expectedHash !== beforeHash) {
      deps.mcpError(res, 409, {
        action: 'patch surface',
        message: 'Stale current document hash',
        suggestion: 'read_surface 또는 list_surfaces로 최신 hash를 확인한 뒤 다시 시도하세요.',
        target: 'surface:patch',
        details: { expected_hash: expectedHash, actual_hash: beforeHash },
      });
      return true;
    }
    const mutationBlock = deps.getSurfacePatchMutationBlock(currentData, operations);
    if (mutationBlock) {
      deps.mcpError(res, 400, {
        action: 'patch surface',
        message: mutationBlock.message,
        suggestion: mutationBlock.suggestion,
        target: `surface:${mutationBlock.fieldName}`,
      });
      return true;
    }
    const draft = deps.cloneJson(currentData) as Record<string, unknown>;
    try {
      const result = deps.applySurfacePatch(draft, operations);
      const afterHash = deps.hashSurface(draft);
      if (body.dry_run === true) {
        deps.jsonResSuccess(
          res,
          {
            dry_run: true,
            changed: result.changed,
            touched: result.touchedTopLevel,
            before_hash: beforeHash,
            after_hash: afterHash,
          },
          {
            toolName: 'patch_surface',
            summary: `Dry-run: patch ${result.changed} operation(s)`,
          },
        );
        return true;
      }
      const allowed = await deps.askRendererConfirm(
        'MCP surface 수정 요청',
        `AI 어시스턴트가 현재 문서의 surface를 수정하려 합니다.\n작업 수: ${result.changed}\n대상: ${result.touchedTopLevel.join(', ') || '/'}`,
      );
      if (!allowed) {
        deps.mcpError(res, 403, {
          action: 'patch surface',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 수정 요청을 허용한 뒤 다시 시도하세요.',
          target: 'surface:patch',
        });
        return true;
      }
      Object.keys(currentData).forEach((key) => delete currentData[key]);
      Object.assign(currentData, draft);
      for (const field of result.touchedTopLevel) {
        deps.broadcastToAll('data-updated', field, currentData[field]);
      }
      if (deps.touchesAssetMapSource(result.touchedTopLevel) && deps.invalidateAssetsMapCache) {
        deps.invalidateAssetsMapCache();
      }
      deps.logMcpMutation('patch surface', 'surface:patch', {
        changed: result.changed,
        touched: result.touchedTopLevel,
      });
      deps.jsonResSuccess(
        res,
        {
          success: true,
          changed: result.changed,
          touched: result.touchedTopLevel,
          before_hash: beforeHash,
          after_hash: afterHash,
        },
        {
          toolName: 'patch_surface',
          summary: `Patched ${result.changed} operation(s)`,
          artifacts: { count: result.changed },
        },
      );
      return true;
    } catch (error) {
      deps.mcpError(res, 400, {
        action: 'patch surface',
        message: error instanceof Error ? error.message : String(error),
        suggestion: 'JSON Pointer path와 patch operation을 확인하세요.',
        target: 'surface:patch',
      });
      return true;
    }
  }

  if (parts[0] === 'surface' && parts[1] === 'replace' && !parts[2] && req.method === 'POST') {
    const body = await deps.readJsonBody(req, res, 'surface/replace', deps.broadcastStatus);
    if (!body) return true;
    if (typeof body.path !== 'string' || typeof body.find !== 'string') {
      deps.mcpError(res, 400, {
        action: 'replace in surface',
        message: 'path and find must be strings',
        suggestion: '{ "path": "/regex/0", "find": "...", "replace": "..." } 형태로 전달하세요.',
        target: 'surface:replace',
      });
      return true;
    }
    const mutationBlock = deps.getSurfaceMutationBlock(currentData, body.path);
    if (mutationBlock) {
      deps.mcpError(res, 400, {
        action: 'replace in surface',
        message: mutationBlock.message,
        suggestion: mutationBlock.suggestion,
        target: `surface:${mutationBlock.fieldName}`,
      });
      return true;
    }
    const replacement = typeof body.replace === 'string' ? body.replace : '';
    try {
      const beforeHash = deps.hashSurface(currentData);
      const expectedHash = typeof body.expected_hash === 'string' ? body.expected_hash : undefined;
      if (expectedHash && expectedHash !== beforeHash) {
        deps.mcpError(res, 409, {
          action: 'replace in surface',
          message: 'Stale current document hash',
          suggestion: 'read_surface 또는 list_surfaces로 최신 hash를 확인한 뒤 다시 시도하세요.',
          target: `surface:${body.path}`,
          details: { expected_hash: expectedHash, actual_hash: beforeHash },
        });
        return true;
      }
      const oldValue = deps.getPointerValue(currentData, body.path);
      const { next, matches } = deps.replaceStringInSurface(
        oldValue,
        body.find,
        replacement,
        body.regex === true,
        typeof body.flags === 'string' ? body.flags : undefined,
      );
      const afterHash = deps.hashSurface(next);
      if (body.dry_run === true) {
        deps.jsonResSuccess(
          res,
          { dry_run: true, path: body.path, matchCount: matches, before_hash: beforeHash, value_hash: afterHash },
          {
            toolName: 'replace_in_surface',
            summary: `Dry-run: ${matches} match(es) under ${body.path}`,
            artifacts: { matchCount: matches },
          },
        );
        return true;
      }
      if (matches === 0) {
        deps.mcpNoOp(res, {
          action: 'replace in surface',
          message: 'No matches found',
          suggestion: 'read_surface로 현재 값을 확인한 뒤 find 문자열을 다시 지정하세요.',
          target: `surface:${body.path}`,
        });
        return true;
      }
      const allowed = await deps.askRendererConfirm(
        'MCP surface 치환 요청',
        `AI 어시스턴트가 현재 문서의 ${body.path} surface에서 ${matches}건 치환하려 합니다.`,
      );
      if (!allowed) {
        deps.mcpError(res, 403, {
          action: 'replace in surface',
          message: '사용자가 거부했습니다',
          rejected: true,
          suggestion: '앱에서 치환 요청을 허용한 뒤 다시 시도하세요.',
          target: `surface:${body.path}`,
        });
        return true;
      }
      deps.setPointerValue(currentData, body.path, next, false);
      const topLevel = topLevelFieldFromPointer(body.path);
      if (topLevel) deps.broadcastToAll('data-updated', topLevel, currentData[topLevel]);
      deps.jsonResSuccess(
        res,
        {
          success: true,
          path: body.path,
          matchCount: matches,
          before_hash: beforeHash,
          after_hash: deps.hashSurface(currentData),
        },
        {
          toolName: 'replace_in_surface',
          summary: `Replaced ${matches} match(es) under ${body.path}`,
          artifacts: { matchCount: matches },
        },
      );
      return true;
    } catch (error) {
      deps.mcpError(res, 400, {
        action: 'replace in surface',
        message: error instanceof Error ? error.message : String(error),
        suggestion: 'path, find, regex flags를 확인하세요.',
        target: `surface:${String(body.path || '/')}`,
      });
      return true;
    }
  }

  return false;
}
