import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./mcp-headless-server', () => ({ startHeadlessMcpApiServer: vi.fn() }));

import { getConfiguredToolProfile, getStandaloneAllowWrites } from './toki-standalone-bootstrap';

afterEach(() => vi.unstubAllEnvs());

describe('MCP startup profile selection', () => {
  it.each([[], ['--standalone']])('uses facade-first by default for startup %j', (...args) => {
    vi.stubEnv('RISUTOKI_MCP_TOOL_PROFILE', undefined);
    expect(getConfiguredToolProfile(args)).toEqual({
      raw: undefined,
      source: null,
      resolved: 'facade-first',
      invalid: false,
      strictFiltering: true,
    });
  });

  it('accepts an explicit compatibility profile from the environment', () => {
    vi.stubEnv('RISUTOKI_MCP_TOOL_PROFILE', 'advanced-full');
    expect(getConfiguredToolProfile(['--standalone'])).toMatchObject({
      source: 'env',
      resolved: 'advanced-full',
      strictFiltering: true,
    });
  });

  it.each([['--tool-profile=advanced-full'], ['--tool-profile', 'advanced-full']])(
    'lets an explicit CLI compatibility profile override the environment %j',
    (...args) => {
      vi.stubEnv('RISUTOKI_MCP_TOOL_PROFILE', 'facade-first');
      expect(getConfiguredToolProfile(['--standalone', ...args])).toMatchObject({
        source: 'argv',
        resolved: 'advanced-full',
        invalid: false,
      });
    },
  );

  it('reports invalid CLI profiles without falling through to a broad environment profile', () => {
    vi.stubEnv('RISUTOKI_MCP_TOOL_PROFILE', 'advanced-full');
    expect(getConfiguredToolProfile(['--tool-profile=unknown'])).toMatchObject({
      source: 'argv',
      resolved: 'facade-first',
      invalid: true,
    });
  });

  it('preserves the read-only profile and independent standalone write gate', () => {
    vi.stubEnv('RISUTOKI_MCP_TOOL_PROFILE', 'readonly');
    vi.stubEnv('RISUTOKI_MCP_ALLOW_WRITES', undefined);
    expect(getConfiguredToolProfile(['--standalone']).resolved).toBe('readonly');
    expect(getStandaloneAllowWrites(['--standalone'])).toBe(false);
    expect(getStandaloneAllowWrites(['--standalone', '--tool-profile=advanced-full'])).toBe(false);
    expect(getStandaloneAllowWrites(['--standalone', '--allow-writes'])).toBe(true);
  });
});
