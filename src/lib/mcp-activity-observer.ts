import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type {
  McpActivityCategory,
  McpActivityRecord,
  McpActivityStatus,
  McpActivityTarget,
} from './mcp-activity-types';

const fields = new Set([
  'name',
  'description',
  'firstMessage',
  'alternateGreetings',
  'globalNote',
  'css',
  'defaultVariables',
  'lua',
  'lorebook',
  'regex',
  'triggerScripts',
  'promptTemplate',
  'customPromptTemplateToggle',
  'templateDefaultVariables',
  'formatingOrder',
  'moduleDescription',
]);
const activeRoots = new Set([
  'cbs',
  'field',
  'fields',
  'lorebook',
  'regex',
  'lua',
  'css',
  'greetings',
  'triggers',
  'risup',
  'assets',
  'asset',
  'document',
  'charx',
  'risum',
  'search',
]);
const routeWords = new Set([
  'open-file',
  'range',
  'surface',
  'patch',
  ...activeRoots,
  ...fields,
  'external',
  'probe',
  'references',
  'reference',
  'skills',
  'guides',
  'session',
  'status',
  'read',
  'list',
  'inspect',
  'search',
  'search-all',
  'batch',
  'batch-read',
  'write',
  'batch-write',
  'replace',
  'batch-replace',
  'block-replace',
  'insert',
  'batch-insert',
  'delete',
  'batch-delete',
  'add',
  'batch-add',
  'reorder',
  'move',
  'clone',
  'by-id',
  'diff',
  'validate',
  'snapshot',
  'snapshots',
  'restore',
  'save',
  'open',
  'create',
  'export',
  'import',
  'export-compatibility',
  'compress-webp',
  'rename',
  'batch-rename',
  'prompt-items',
  'prompt-snippets',
  'formatting-order',
  'formating-order',
  'schema',
  'inventory',
  'path',
  'text',
  'json',
  'get',
  'resolve',
  'bootstrap',
  'document',
]);
interface Observation {
  record: McpActivityRecord;
  outcome?: McpActivityStatus;
  emit: (record: McpActivityRecord) => void;
}
const requestObservations = new WeakMap<IncomingMessage, Observation>();
const responseObservations = new WeakMap<ServerResponse, Observation>();

function safelyEmit(observation: Observation): void {
  try {
    observation.emit({
      ...observation.record,
      target: { ...observation.record.target },
      ...(observation.record.source ? { source: { ...observation.record.source } } : {}),
    });
  } catch {
    /* Observation must never change an MCP response or operation. */
  }
}

function categoryFor(method: string, parts: string[], readOnly: boolean): McpActivityCategory {
  if (
    ['reference', 'references', 'skills', 'guides'].includes(parts[0]) ||
    (parts[0] === 'risup' && parts[1] === 'prompt-snippets')
  )
    return 'reference';
  if (
    ['session', 'cbs'].includes(parts[0]) ||
    parts.some((part) => ['validate', 'diff', 'export-compatibility'].includes(part))
  )
    return 'diagnostic';
  if (
    method === 'GET' ||
    readOnly ||
    parts[0] === 'probe' ||
    parts.some((part) => ['inspect', 'search', 'search-all', 'batch-read', 'read', 'range'].includes(part)) ||
    (parts[1] === 'batch' && ['lorebook', 'regex'].includes(parts[0]))
  )
    return 'read';
  return activeRoots.has(parts[0]) || ['external', 'open-file'].includes(parts[0]) ? 'change' : 'other';
}

export function observeMcpRequest(options: {
  req: IncomingMessage;
  res: ServerResponse;
  parts: string[];
  readOnly: boolean;
  activeTarget?: McpActivityTarget;
  referenceTarget?: McpActivityTarget;
  externalFilePath?: string | null;
  emit: (record: McpActivityRecord) => void;
}): void {
  const { req, res, parts, emit } = options;
  const root = parts[0];
  const target: McpActivityTarget =
    root === 'external' || root === 'probe' || root === 'open-file' || !!options.externalFilePath
      ? { kind: 'external' }
      : ['reference', 'references', 'skills', 'guides'].includes(root) ||
          (root === 'risup' && parts[1] === 'prompt-snippets')
        ? { ...options.referenceTarget, kind: 'reference' }
        : root === 'session'
          ? { kind: 'session' }
          : activeRoots.has(root)
            ? { ...options.activeTarget, kind: 'active' }
            : { kind: 'unknown' };
  const method = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(req.method || '')
    ? req.method!
    : 'OTHER';
  const sourceField =
    root === 'field' && fields.has(parts[1])
      ? parts[1]
      : ['lorebook', 'regex', 'lua', 'css'].includes(root)
        ? root
        : root === 'greetings'
          ? 'alternateGreetings'
          : root === 'triggers'
            ? 'triggerScripts'
            : undefined;
  const observation: Observation = {
    emit,
    record: {
      requestId: randomUUID(),
      startedAt: Date.now(),
      method,
      route: `/${parts
        .slice(0, 6)
        .map((part) => (routeWords.has(part) ? part : /^\d{1,8}$/.test(part) ? ':index' : ':item'))
        .join('/')}`,
      category: categoryFor(method, parts, options.readOnly),
      status: 'running',
      target,
      ...(sourceField && target.documentId ? { source: { documentId: target.documentId, field: sourceField } } : {}),
    },
  };
  requestObservations.set(req, observation);
  responseObservations.set(res, observation);
  let finished = false;
  const finish = (aborted: boolean) => {
    if (finished) return;
    finished = true;
    observation.record.endedAt = Date.now();
    observation.record.durationMs = Math.max(0, observation.record.endedAt - observation.record.startedAt);
    observation.record.httpStatus = res.statusCode;
    observation.record.status = aborted || res.statusCode >= 400 ? 'failed' : observation.outcome || 'completed';
    safelyEmit(observation);
    requestObservations.delete(req);
    responseObservations.delete(res);
  };
  res.once('finish', () => finish(false));
  res.once('close', () => finish(!res.writableFinished));
  safelyEmit(observation);
  if (options.externalFilePath) observeMcpBody(req, { file_path: options.externalFilePath });
}

/** Select only safe target metadata from an already-parsed body; never retain the body. */
export function observeMcpBody(req: IncomingMessage, body: unknown): void {
  const observation = requestObservations.get(req);
  if (!observation || !body || typeof body !== 'object') return;
  const value = body as Record<string, unknown>;
  if (observation.record.target.kind === 'external' && typeof value.file_path === 'string') {
    const filePath = value.file_path.trim();
    if (
      filePath.length <= 4096 &&
      !/[\x00-\x1f]/.test(filePath) &&
      path.isAbsolute(filePath) &&
      ['.charx', '.risum', '.risup'].includes(path.extname(filePath).toLowerCase())
    ) {
      const normalizedPath = path.normalize(filePath);
      if (observation.record.target.filePath !== normalizedPath) {
        observation.record.target.filePath = normalizedPath;
        safelyEmit(observation);
      }
    }
  }
}

/** Bind to the document actually selected by the dispatcher after its initial awaits. */
export function observeMcpActiveTarget(req: IncomingMessage, target: McpActivityTarget | undefined): void {
  const observation = requestObservations.get(req);
  if (!observation || observation.record.target.kind !== 'active') return;
  const nextTarget: McpActivityTarget = { ...target, kind: 'active' };
  if (isDeepStrictEqual(observation.record.target, nextTarget)) return;
  observation.record.target = nextTarget;
  if (observation.record.source) {
    if (target?.documentId) observation.record.source.documentId = target.documentId;
    else delete observation.record.source;
  }
  safelyEmit(observation);
}

export function observeMcpReferenceTarget(req: IncomingMessage, target: McpActivityTarget | undefined): void {
  const observation = requestObservations.get(req);
  if (observation?.record.target.kind === 'reference' && target) {
    const nextTarget: McpActivityTarget = { ...target, kind: 'reference' };
    if (isDeepStrictEqual(observation.record.target, nextTarget)) return;
    observation.record.target = nextTarget;
    safelyEmit(observation);
  }
}

/** Read only envelope flags. Neither success summaries nor error messages are retained. */
export function observeMcpResponse(res: ServerResponse, payload: unknown): void {
  const observation = responseObservations.get(res);
  if (!observation || !payload || typeof payload !== 'object') return;
  const value = payload as Record<string, unknown>;
  if (value.success === false || value.rejected === true || Object.hasOwn(value, 'error'))
    observation.outcome = 'failed';
  else if (value.success === true || (value.status === 200 && typeof value.summary === 'string'))
    observation.outcome = 'succeeded';
}
