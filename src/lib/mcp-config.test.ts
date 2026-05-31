import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

import {
  buildCodexMcpConfigToml,
  cleanupCodexMcpConfigToml,
  removeTopLevelCodexRisutokiServerTables,
  sanitizeCodexFeatures,
} from './mcp-config';

const codexOptions = {
  serverPath: 'C:\\Users\\tester\\RisuToki\\toki-mcp-server.js',
  port: 39464,
  token: 'tok"en',
};

describe('Codex MCP config helpers', () => {
  it('appends a newline-safe RisuToki MCP server block', () => {
    const result = buildCodexMcpConfigToml('model = "gpt-5.5"\n', codexOptions);

    expect(result).toContain('model = "gpt-5.5"\n\n# --- RisuToki MCP (auto-generated, do not edit) ---');
    expect(result).toContain('[mcp_servers.risutoki]');
    expect(result).toContain('command = "node"');
    expect(result).toContain('args = ["C:/Users/tester/RisuToki/toki-mcp-server.js"]');
    expect(result).toContain('[mcp_servers.risutoki.env]');
    expect(result).toContain('TOKI_PORT = "39464"');
    expect(result).toContain('TOKI_TOKEN = "tok\\"en"');
    expect(result.endsWith('\n')).toBe(true);
  });

  it('replaces an existing auto-generated RisuToki block', () => {
    const existing = [
      'model = "gpt-5.5"',
      '',
      '# --- RisuToki MCP (auto-generated, do not edit) ---',
      '[mcp_servers.risutoki]',
      'command = "old-node"',
      '# --- /RisuToki MCP ---',
      '',
      '[features]',
      'goals = true',
    ].join('\n');

    const result = buildCodexMcpConfigToml(existing, codexOptions);

    expect(result.match(/# --- RisuToki MCP \(auto-generated, do not edit\) ---/g)).toHaveLength(1);
    expect(result).not.toContain('old-node');
    expect(result).toContain('[features]\ngoals = true\n\n# --- RisuToki MCP');
  });

  it('replaces existing top-level RisuToki server tables while preserving profiles', () => {
    const existing = [
      'model = "gpt-5.5"',
      '',
      '[profiles.risutoki.mcp_servers.risutoki]',
      'command = "node"',
      'args = ["standalone.js", "--standalone"]',
      '',
      '[mcp_servers.risutoki]',
      'command = "old-node"',
      'args = ["old.js", "--standalone"]',
      'cwd = "C:/old"',
      '',
      '[mcp_servers.risutoki.env]',
      'TOKI_PORT = "1"',
      'TOKI_TOKEN = "old"',
      '',
      '[features]',
      'goals = true',
    ].join('\n');

    const result = buildCodexMcpConfigToml(existing, codexOptions);

    expect(result).toContain('[profiles.risutoki.mcp_servers.risutoki]');
    expect(result).toContain('args = ["standalone.js", "--standalone"]');
    expect(result).not.toContain('old.js');
    expect(result).not.toContain('TOKI_TOKEN = "old"');
    expect(result.match(/^\[mcp_servers\.risutoki\]$/gm)).toHaveLength(1);
    expect(result.match(/^\[mcp_servers\.risutoki\.env\]$/gm)).toHaveLength(1);
  });

  it('removes only top-level RisuToki server tables', () => {
    const result = removeTopLevelCodexRisutokiServerTables(
      [
        '[profiles.risutoki.mcp_servers.risutoki]',
        'command = "keep"',
        '[mcp_servers.risutoki]',
        'command = "remove"',
        '[mcp_servers.risutoki.env]',
        'TOKI_TOKEN = "remove"',
        '[mcp_servers.other]',
        'command = "keep"',
      ].join('\n'),
    );

    expect(result).toContain('[profiles.risutoki.mcp_servers.risutoki]');
    expect(result).toContain('command = "keep"');
    expect(result).not.toContain('command = "remove"');
    expect(result).not.toContain('TOKI_TOKEN = "remove"');
    expect(result).toContain('[mcp_servers.other]');
  });

  it('removes non-boolean feature values that make Codex reject config.toml', () => {
    const result = sanitizeCodexFeatures(
      [
        '[features]',
        'goals = true',
        'url = "http://localhost:39464/mcp"',
        'number = 1',
        'flag = false # keep this',
        '',
        '[mcp_servers.other]',
        'url = "http://example.test/mcp"',
      ].join('\n'),
    );

    expect(result).toContain('[features]\ngoals = true');
    expect(result).toContain('flag = false # keep this');
    expect(result).not.toContain('localhost:39464/mcp');
    expect(result).not.toContain('number = 1');
    expect(result).toContain('[mcp_servers.other]\nurl = "http://example.test/mcp"');
  });

  it('cleans up managed blocks without gluing adjacent TOML tables', () => {
    const result = cleanupCodexMcpConfigToml(
      [
        '[profiles.risutoki]',
        'model = "gpt-5.5"',
        '# --- RisuToki MCP (auto-generated, do not edit) ---',
        '[mcp_servers.risutoki]',
        'command = "node"',
        '# --- /RisuToki MCP ---[features]',
        'goals = true',
      ].join('\n'),
    );

    expect(result).not.toContain('auto-generated');
    expect(result).toContain('model = "gpt-5.5"\n[features]\ngoals = true\n');
  });
});
