// @vitest-environment node
import * as http from 'node:http';

import { describe, expect, it } from 'vitest';

import { API_ERROR_KEY } from './mcp-facade-runtime';
import { createMcpProxyClient } from './mcp-proxy-client';

function cancelledRequest(mutating: boolean) {
  const controller = new AbortController();
  controller.abort();
  const diagnostics: Array<{ event: string; data?: Record<string, unknown> }> = [];
  const request = createMcpProxyClient({
    getPort: () => '1',
    getToken: () => 'test-token',
    getRequestContext: () => ({ requestId: 'request-42', signal: controller.signal, mutating }),
    logProcessDiagnostic: (event, data) => diagnostics.push({ event, data }),
    noteRuntimeError: () => undefined,
    mcpLog: () => undefined,
  });
  return { request, diagnostics };
}

async function startHangingServer(onRequest?: () => void) {
  const server = http.createServer(() => onRequest?.());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP test server address');
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function liveRequest(port: number, mutating: boolean, controller: AbortController, requestTimeoutMs: number) {
  return createMcpProxyClient({
    getPort: () => String(port),
    getToken: () => 'test-token',
    getRequestContext: () => ({ requestId: 'live-request', signal: controller.signal, mutating }),
    requestTimeoutMs,
    logProcessDiagnostic: () => undefined,
    noteRuntimeError: () => undefined,
    mcpLog: () => undefined,
  });
}

describe('MCP proxy request context', () => {
  it('marks a pre-dispatch cancelled mutation not started', async () => {
    const { request, diagnostics } = cancelledRequest(true);
    const result = (await request('POST', '/field/name', { content: 'new' })) as Record<string, unknown>;
    expect(result[API_ERROR_KEY]).toBe(true);
    expect(result.retryable).toBe(false);
    expect(result.retry_mode).toBe('never');
    expect(result.outcome).toBe('not_started');
    expect(diagnostics[0].data?.requestId).toBe('request-42');
  });

  it('marks a cancelled read unchanged without retrying automatically', async () => {
    const { request } = cancelledRequest(false);
    const result = (await request('POST', '/search-all', { query: 'needle' })) as Record<string, unknown>;
    expect(result.retryable).toBe(false);
    expect(result.retry_mode).toBe('never');
    expect(result.outcome).toBe('unchanged');
  });

  it.each([
    {
      label: 'mutation',
      mutating: true,
      retryable: false,
      retry_mode: 'inspect_outcome',
      outcome: 'unknown',
    },
    {
      label: 'read',
      mutating: false,
      retryable: true,
      retry_mode: 'backoff',
      outcome: 'not_started',
    },
  ])('classifies an actual $label timeout without retrying the request', async (expected) => {
    let requests = 0;
    const server = await startHangingServer(() => {
      requests += 1;
    });
    try {
      const controller = new AbortController();
      const request = liveRequest(server.port, expected.mutating, controller, 25);
      const result = (await request(expected.mutating ? 'POST' : 'GET', '/slow')) as Record<string, unknown>;
      expect(result.status).toBe(504);
      expect(result.code).toBe('timeout');
      expect(result.retryable).toBe(expected.retryable);
      expect(result.retry_mode).toBe(expected.retry_mode);
      expect(result.outcome).toBe(expected.outcome);
      expect(requests).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('propagates an in-flight mutation cancellation with an unknown outcome', async () => {
    const controller = new AbortController();
    let requests = 0;
    const server = await startHangingServer(() => {
      requests += 1;
      controller.abort();
    });
    try {
      const request = liveRequest(server.port, true, controller, 1000);
      const result = (await request('POST', '/slow-mutation', { content: 'new' })) as Record<string, unknown>;
      expect(result.status).toBe(499);
      expect(result.code).toBe('request_cancelled');
      expect(result.retryable).toBe(false);
      expect(result.retry_mode).toBe('inspect_outcome');
      expect(result.outcome).toBe('unknown');
      expect(requests).toBe(1);
    } finally {
      await server.close();
    }
  });

  it.each([
    { mutating: false, retryable: true, retry_mode: 'backoff', outcome: 'not_started' },
    { mutating: true, retryable: false, retry_mode: 'inspect_outcome', outcome: 'unknown' },
  ])('maps malformed successful JSON to a 502 recovery envelope', async (expected) => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('not-json');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP test server address');
    try {
      const request = liveRequest(address.port, expected.mutating, new AbortController(), 1000);
      const result = (await request(expected.mutating ? 'POST' : 'GET', '/invalid-json')) as Record<string, unknown>;
      expect(result.status).toBe(502);
      expect(result.code).toBe('invalid_api_response');
      expect(result.retryable).toBe(expected.retryable);
      expect(result.retry_mode).toBe(expected.retry_mode);
      expect(result.outcome).toBe(expected.outcome);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('forces mutating 5xx responses to inspect outcome even when the server suggests backoff', async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          status: 500,
          error: 'server failed',
          retryable: true,
          retry_mode: 'backoff',
          outcome: 'not_started',
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP test server address');
    try {
      const request = liveRequest(address.port, true, new AbortController(), 1000);
      const result = (await request('POST', '/mutation')) as Record<string, unknown>;
      expect(result.retryable).toBe(false);
      expect(result.retry_mode).toBe('inspect_outcome');
      expect(result.outcome).toBe('unknown');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
