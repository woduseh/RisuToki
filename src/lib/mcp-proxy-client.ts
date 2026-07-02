// eslint-disable-next-line @typescript-eslint/no-require-imports
import http = require('http');

import { API_ERROR_KEY } from './mcp-facade-runtime';

export type ProxyRuntimeErrorKind = 'apiTimeout' | 'apiNetworkError';

export interface McpProxyClientDeps {
  getPort: () => string | undefined;
  getToken: () => string | undefined;
  logProcessDiagnostic: (event: string, data?: Record<string, unknown>) => void;
  noteRuntimeError: (kind: ProxyRuntimeErrorKind, summary: string) => void;
  mcpLog: (level: 'debug' | 'info' | 'warning' | 'error', message: string, data?: Record<string, unknown>) => void;
}

function byteLengthForDiagnostic(value: string | null): number {
  return value ? Buffer.byteLength(value) : 0;
}

export function createMcpProxyClient(deps: McpProxyClientDeps) {
  return async function apiRequest(method: string, urlPath: string, body?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve) => {
      const payload = body ? JSON.stringify(body) : null;
      const payloadBytes = byteLengthForDiagnostic(payload);
      const startedAt = Date.now();
      deps.logProcessDiagnostic('apiRequestStart', { method, path: urlPath, payloadBytes });
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
            });
            if (res.statusCode && res.statusCode >= 400) {
              // Preserve the full structured error envelope from mcp-api-server
              // (action, target, suggestion, retryable, next_actions, details, etc.)
              resolve({ [API_ERROR_KEY]: true, status: res.statusCode, ...parsed });
            } else {
              resolve(parsed);
            }
          } catch (error) {
            deps.noteRuntimeError('apiNetworkError', `Invalid JSON response from ${method} ${urlPath}`);
            deps.logProcessDiagnostic('apiInvalidJson', {
              method,
              path: urlPath,
              status: res.statusCode ?? null,
              elapsedMs,
              responseBytes: Buffer.byteLength(data),
              error,
            });
            resolve({
              [API_ERROR_KEY]: true,
              status: res.statusCode ?? 502,
              error: `Invalid JSON response from API server`,
              suggestion: 'This may indicate a server-side crash. Check RisuToki editor logs.',
            });
          }
        });
      });

      req.on('error', (err: NodeJS.ErrnoException) => {
        deps.noteRuntimeError('apiNetworkError', `${err.code ?? 'network'} ${method} ${urlPath}: ${err.message}`);
        deps.logProcessDiagnostic('apiNetworkError', {
          method,
          path: urlPath,
          elapsedMs: Date.now() - startedAt,
          code: err.code,
          error: err,
        });
        if (err.code === 'ECONNREFUSED') {
          deps.mcpLog('error', 'API connection refused — RisuToki editor not running');
          resolve({
            [API_ERROR_KEY]: true,
            status: 503,
            error: 'RisuToki editor is not running',
            suggestion: 'Start the RisuToki editor application, then retry.',
            retryable: true,
          });
        } else {
          deps.mcpLog('error', `API network error: ${err.message}`);
          resolve({
            [API_ERROR_KEY]: true,
            status: 502,
            error: `Network error: ${err.message}`,
            suggestion: 'Check that RisuToki editor is running and accessible.',
            retryable: true,
          });
        }
      });
      req.setTimeout(120000, () => {
        req.destroy();
        deps.noteRuntimeError('apiTimeout', `${method} ${urlPath} timed out after 120 seconds`);
        deps.logProcessDiagnostic('apiTimeout', {
          method,
          path: urlPath,
          elapsedMs: Date.now() - startedAt,
          payloadBytes,
        });
        deps.mcpLog('error', `API request timed out: ${method} ${urlPath}`);
        resolve({
          [API_ERROR_KEY]: true,
          status: 504,
          error: 'Request timed out after 120 seconds',
          suggestion: 'For large data, try narrowing the scope (e.g. use field ranges or smaller batch sizes).',
          retryable: true,
        });
      });

      if (payload) req.write(payload);
      req.end();
    });
  };
}
