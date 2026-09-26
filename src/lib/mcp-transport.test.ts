// @vitest-environment node
import * as http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { createMcpProxyClient } from './mcp-proxy-client';
import { closeServer, createSearchFixture, startTestApiServer } from './mcp-api-test-harness';

async function listen(server: http.Server): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test TCP address');
  return address.port;
}

function proxy(port: number, mutating = false, timeout = 1000) {
  const log = vi.fn();
  const request = createMcpProxyClient({
    getPort: () => String(port),
    getToken: () => 'synthetic',
    requestTimeoutMs: timeout,
    getRequestContext: () => ({ requestId: 'transport', signal: new AbortController().signal, mutating }),
    logProcessDiagnostic: log,
    noteRuntimeError: vi.fn(),
    mcpLog: vi.fn(),
  });
  return { request, log };
}

const unicodeCases = [
  { text: '한글 원문', offset: 1 },
  { text: '日本語', offset: 2 },
  { text: '🌸 flower', offset: 2 },
];

describe('production MCP HTTP byte boundaries', () => {
  it.each(unicodeCases)('preserves a split UTF-8 response: $text', async ({ text, offset }) => {
    const bytes = Buffer.from(JSON.stringify({ content: text }));
    const split = Buffer.byteLength('{"content":"') + offset;
    const server = http.createServer(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': bytes.length });
      res.write(bytes.subarray(0, split));
      await delay(15);
      res.end(bytes.subarray(split));
    });
    const port = await listen(server);
    try {
      expect(await proxy(port).request('GET', '/split')).toEqual({ content: text });
    } finally {
      server.closeAllConnections();
      await closeServer(server);
    }
  });

  it.each(unicodeCases)('writes the exact split UTF-8 request: $text', async ({ text, offset }) => {
    const data = createSearchFixture();
    const api = await startTestApiServer(data);
    const bytes = Buffer.from(JSON.stringify({ content: text }));
    const split = Buffer.byteLength('{"content":"') + offset;
    try {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: api.port,
            path: '/field/description',
            method: 'POST',
            headers: {
              Authorization: `Bearer ${api.token}`,
              'Content-Type': 'application/json',
              'Content-Length': bytes.length,
            },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
            res.on('error', reject);
          },
        );
        req.on('error', reject);
        req.write(bytes.subarray(0, split));
        setTimeout(() => req.end(bytes.subarray(split)), 15);
      });
      expect(status).toBe(200);
      expect(data.description).toBe(text);
    } finally {
      api.server.closeAllConnections();
      await closeServer(api.server);
    }
  });

  it.each([false, true])(
    'settles a truncated response once and preserves mutation uncertainty (%s)',
    async (mutating) => {
      const server = http.createServer(async (_req, res) => {
        res.writeHead(200, { 'Content-Length': 100 });
        res.write('{"partial":');
        await delay(10);
        res.destroy();
      });
      const port = await listen(server);
      const { request, log } = proxy(port, mutating, 100);
      try {
        const result = await Promise.race([
          request(mutating ? 'POST' : 'GET', '/truncated'),
          delay(500, { hung: true }),
        ]);
        expect(result).toMatchObject({
          status: 502,
          code: 'network_error',
          retryable: !mutating,
          outcome: mutating ? 'unknown' : 'not_started',
          retry_mode: mutating ? 'inspect_outcome' : 'backoff',
        });
        expect(log.mock.calls.filter(([event]) => event === 'apiNetworkError')).toHaveLength(1);
      } finally {
        server.closeAllConnections();
        await closeServer(server);
      }
    },
  );

  it('uses a total request deadline even while an incomplete response keeps arriving', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{');
      const timer = setInterval(() => res.write(' '), 5);
      res.on('close', () => clearInterval(timer));
    });
    const port = await listen(server);
    try {
      const { request } = proxy(port, false, 40);
      const result = await Promise.race([request('GET', '/trickle'), delay(500, { hung: true })]);
      expect(result).toMatchObject({ status: 504, code: 'timeout' });
    } finally {
      server.closeAllConnections();
      await closeServer(server);
    }
  });
});
