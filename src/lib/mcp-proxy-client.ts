import * as http from 'http';

import { API_ERROR_KEY } from './mcp-facade-runtime';

export type ProxyRuntimeErrorKind = 'apiTimeout' | 'apiNetworkError';

export interface McpProxyClientDeps {
  getPort: () => string | undefined;
  getToken: () => string | undefined;
  logProcessDiagnostic: (event: string, data?: Record<string, unknown>) => void;
  noteRuntimeError: (kind: ProxyRuntimeErrorKind, summary: string) => void;
  mcpLog: (level: 'debug' | 'info' | 'warning' | 'error', message: string, data?: Record<string, unknown>) => void;
  getRequestContext?: () => { requestId: string | number; signal: AbortSignal; mutating: boolean } | undefined;
  requestTimeoutMs?: number;
}

function byteLengthForDiagnostic(value: string | null): number {
  return value ? Buffer.byteLength(value) : 0;
}

export function createMcpProxyClient(deps: McpProxyClientDeps) {
  return async function apiRequest(method: string, urlPath: string, body?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve) => {
      const requestContext = deps.getRequestContext?.();
      const requestId = requestContext?.requestId;
      const signal = requestContext?.signal;
      const mutatingRequest = requestContext?.mutating ?? method.toUpperCase() !== 'GET';
      const payload = body ? JSON.stringify(body) : null;
      const payloadBytes = byteLengthForDiagnostic(payload);
      const startedAt = Date.now();
      const requestTimeoutMs = deps.requestTimeoutMs ?? 120000;
      const requestTimeoutSeconds = requestTimeoutMs / 1000;
      let settled = false;
      let requestDispatched = false;
      const requestState: { req?: http.ClientRequest } = {};
      const finish = (value: unknown) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', abortRequest);
        resolve(value);
      };
      const abortRequest = () => {
        const mutationOutcomeUnknown = mutatingRequest && requestDispatched;
        finish({
          [API_ERROR_KEY]: true,
          status: 499,
          error: 'Request cancelled by MCP client',
          code: 'request_cancelled',
          retryable: false,
          retry_mode: mutationOutcomeUnknown ? 'inspect_outcome' : 'never',
          outcome: mutationOutcomeUnknown ? 'unknown' : mutatingRequest ? 'not_started' : 'unchanged',
          suggestion: mutationOutcomeUnknown
            ? 'Inspect the target state before deciding whether to retry; the mutation outcome is unknown.'
            : mutatingRequest
              ? 'The request was cancelled before dispatch; create a new preview before retrying a mutation.'
              : 'Start a new request only if the read is still required.',
        });
        requestState.req?.destroy();
        deps.logProcessDiagnostic('apiRequestCancelled', {
          method,
          path: urlPath,
          ...(requestId !== undefined ? { requestId } : {}),
          elapsedMs: Date.now() - startedAt,
        });
      };
      deps.logProcessDiagnostic('apiRequestStart', {
        method,
        path: urlPath,
        payloadBytes,
        ...(requestId !== undefined ? { requestId } : {}),
      });
      if (signal?.aborted) {
        abortRequest();
        return;
      }
      const headers: Record<string, string | number> = {
        Authorization: `Bearer ${deps.getToken()}`,
        'Content-Type': 'application/json',
      };
      if (payload) {
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: deps.getPort(),
        path: urlPath,
        method,
        headers,
      };

      const req = http.request(options, (res) => {
        const chunks: string[] = [];
        res.on('data', (chunk) => chunks.push(chunk as string));
        res.on('end', () => {
          const data = chunks.join('');
          const elapsedMs = Date.now() - startedAt;
          try {
            const parsed = JSON.parse(data);
            deps.logProcessDiagnostic('apiResponse', {
              method,
              path: urlPath,
              status: res.statusCode ?? null,
              elapsedMs,
              responseBytes: Buffer.byteLength(data),
              ...(requestId !== undefined ? { requestId } : {}),
            });
            if (res.statusCode && res.statusCode >= 400) {
              // Preserve the full structured error envelope from mcp-api-server
              // (action, target, suggestion, retryable, next_actions, details, etc.)
              const parsedRecord: Record<string, unknown> =
                parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                  ? (parsed as Record<string, unknown>)
                  : { error: parsed };
              const mutationServerFailure = mutatingRequest && res.statusCode >= 500;
              finish({
                [API_ERROR_KEY]: true,
                status: res.statusCode,
                ...parsedRecord,
                ...(mutationServerFailure
                  ? {
                      retryable: false,
                      retry_mode: 'inspect_outcome',
                      outcome: parsedRecord.outcome === 'partial' ? 'partial' : 'unknown',
                    }
                  : {}),
              });
            } else {
              finish(parsed);
            }
          } catch (error) {
            deps.noteRuntimeError('apiNetworkError', `Invalid JSON response from ${method} ${urlPath}`);
            deps.logProcessDiagnostic('apiInvalidJson', {
              method,
              path: urlPath,
              status: res.statusCode ?? null,
              elapsedMs,
              responseBytes: Buffer.byteLength(data),
              ...(requestId !== undefined ? { requestId } : {}),
              error,
            });
            finish({
              [API_ERROR_KEY]: true,
              status: res.statusCode && res.statusCode >= 400 ? res.statusCode : 502,
              error: `Invalid JSON response from API server`,
              code: 'invalid_api_response',
              retryable: !mutatingRequest,
              retry_mode: mutatingRequest ? 'inspect_outcome' : 'backoff',
              outcome: mutatingRequest ? 'unknown' : 'not_started',
              suggestion: 'This may indicate a server-side crash. Check RisuToki editor logs.',
            });
          }
        });
      });

      req.on('error', (err: NodeJS.ErrnoException) => {
        if (settled) return;
        deps.noteRuntimeError('apiNetworkError', `${err.code ?? 'network'} ${method} ${urlPath}: ${err.message}`);
        deps.logProcessDiagnostic('apiNetworkError', {
          method,
          path: urlPath,
          elapsedMs: Date.now() - startedAt,
          ...(requestId !== undefined ? { requestId } : {}),
          code: err.code,
          error: err,
        });
        if (err.code === 'ECONNREFUSED') {
          deps.mcpLog('error', 'API connection refused — RisuToki editor not running');
          finish({
            [API_ERROR_KEY]: true,
            status: 503,
            error: 'RisuToki editor is not running',
            suggestion: 'Start the RisuToki editor application, then retry.',
            code: 'connection_refused',
            retryable: !mutatingRequest,
            retry_mode: mutatingRequest ? 'inspect_outcome' : 'backoff',
            outcome: mutatingRequest ? 'unknown' : 'not_started',
          });
        } else {
          deps.mcpLog('error', `API network error: ${err.message}`);
          finish({
            [API_ERROR_KEY]: true,
            status: 502,
            error: `Network error: ${err.message}`,
            suggestion: 'Check that RisuToki editor is running and accessible.',
            code: 'network_error',
            retryable: !mutatingRequest,
            retry_mode: mutatingRequest ? 'inspect_outcome' : 'backoff',
            outcome: mutatingRequest ? 'unknown' : 'not_started',
          });
        }
      });
      requestState.req = req;
      req.setTimeout(requestTimeoutMs, () => {
        deps.noteRuntimeError('apiTimeout', `${method} ${urlPath} timed out after ${requestTimeoutSeconds} seconds`);
        deps.logProcessDiagnostic('apiTimeout', {
          method,
          path: urlPath,
          elapsedMs: Date.now() - startedAt,
          payloadBytes,
          ...(requestId !== undefined ? { requestId } : {}),
        });
        deps.mcpLog('error', `API request timed out: ${method} ${urlPath}`);
        finish({
          [API_ERROR_KEY]: true,
          status: 504,
          error: `Request timed out after ${requestTimeoutSeconds} seconds`,
          suggestion: 'For large data, try narrowing the scope (e.g. use field ranges or smaller batch sizes).',
          code: 'timeout',
          retryable: !mutatingRequest,
          retry_mode: mutatingRequest ? 'inspect_outcome' : 'backoff',
          outcome: mutatingRequest ? 'unknown' : 'not_started',
        });
        req?.destroy();
      });

      signal?.addEventListener('abort', abortRequest, { once: true });
      requestDispatched = true;
      if (payload) req.write(payload);
      req.end();
    });
  };
}
