// @vitest-environment node
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { transports } = vi.hoisted(() => ({ transports: vi.fn() }));
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    async connect() {}
    async close() {}
  },
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    constructor(options: unknown) {
      transports(options);
    }
  },
}));

import { startStandaloneClient } from '../../test/mcp-test-client';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('synthetic standalone MCP client isolation', () => {
  it('does not inherit user documents, references or write permission from the parent environment', async () => {
    vi.stubEnv('RISUTOKI_MCP_FILE', '/synthetic/ambient.charx');
    vi.stubEnv('RISUTOKI_MCP_REFS', '/synthetic/ambient-reference.charx');
    vi.stubEnv('RISUTOKI_MCP_ALLOW_WRITES', '1');
    vi.stubEnv('RISUTOKI_MCP_TOOL_PROFILE', 'advanced-full');
    const runtime = await startStandaloneClient({ userDataDir: '/synthetic/test-user-data' });
    try {
      const options = transports.mock.calls[0][0];
      for (const key of [
        'RISUTOKI_MCP_FILE',
        'RISUTOKI_MCP_REFS',
        'RISUTOKI_MCP_ALLOW_WRITES',
        'RISUTOKI_MCP_TOOL_PROFILE',
      ])
        expect(options.env).not.toHaveProperty(key);
      expect(options.env.PATH).toBe(process.env.PATH);
      expect(options.args).toEqual([
        path.join(process.cwd(), 'toki-mcp-server.js'),
        '--standalone',
        '--user-data-dir',
        '/synthetic/test-user-data',
      ]);
    } finally {
      await runtime.close();
    }
  });

  it('forwards only explicitly selected synthetic fixtures and startup options', async () => {
    const runtime = await startStandaloneClient({
      userDataDir: '/synthetic/test-user-data',
      file: '/synthetic/fixture.charx',
      refs: ['/synthetic/first.risum', '/synthetic/second.risup'],
      allowWrites: true,
      toolProfile: 'facade-first',
      envToolProfile: 'advanced-full',
    });
    try {
      const options = transports.mock.calls[0][0];
      expect(options.env.RISUTOKI_MCP_TOOL_PROFILE).toBe('advanced-full');
      expect(options.args).toEqual([
        path.join(process.cwd(), 'toki-mcp-server.js'),
        '--standalone',
        '--user-data-dir',
        '/synthetic/test-user-data',
        '--allow-writes',
        '--tool-profile',
        'facade-first',
        '--file',
        '/synthetic/fixture.charx',
        '--ref',
        '/synthetic/first.risum',
        '--ref',
        '/synthetic/second.risup',
      ]);
    } finally {
      await runtime.close();
    }
  });
});
