import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface McpConfigDeps {
  getApiPort: () => number | null;
  getApiToken: () => string | null;
  getDirname: () => string;
  isPackaged: () => boolean;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: McpConfigDeps;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

function getMcpServerPath(): string {
  let serverPath = path.join(deps.getDirname(), 'toki-mcp-server.js');
  if (deps.isPackaged()) {
    serverPath = serverPath.replace('app.asar', 'app.asar.unpacked');
  }
  return serverPath;
}

function getRisutokiMcpServerConfig(): Record<string, any> | null {
  const port = deps.getApiPort();
  const token = deps.getApiToken();
  if (!port || !token) return null;
  return {
    type: 'stdio',
    command: 'node',
    args: [getMcpServerPath()],
    env: {
      TOKI_PORT: String(port),
      TOKI_TOKEN: token,
    },
  };
}

export function upsertJsonMcpConfig(configPath: string): string | null {
  const serverConfig = getRisutokiMcpServerConfig();
  if (!serverConfig) return null;

  let existing: any = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    existing = {};
  }
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) existing = {};
  if (!existing.mcpServers || typeof existing.mcpServers !== 'object' || Array.isArray(existing.mcpServers)) {
    existing.mcpServers = {};
  }

  existing.mcpServers.risutoki = serverConfig;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8');
  return configPath;
}

export function cleanupJsonMcpConfig(configPath: string): void {
  try {
    if (!fs.existsSync(configPath)) return;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.mcpServers || !config.mcpServers.risutoki) return;

    delete config.mcpServers.risutoki;
    if (Object.keys(config.mcpServers).length === 0) {
      delete config.mcpServers;
    }

    if (Object.keys(config).length === 0) {
      fs.unlinkSync(configPath);
    } else {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
  } catch (e: any) { console.warn('[main] MCP config cleanup failed:', e.message); }
}

export function writeCurrentMcpConfig(): string | null {
  const configPath = path.join(os.homedir(), '.mcp.json');
  const writtenPath = upsertJsonMcpConfig(configPath);
  if (writtenPath) console.log('[main] MCP config written:', writtenPath);
  return writtenPath;
}

function writeCopilotMcpConfig(): string | null {
  const configPath = path.join(os.homedir(), '.copilot', 'mcp-config.json');
  const writtenPath = upsertJsonMcpConfig(configPath);
  if (writtenPath) console.log('[main] Copilot MCP config written:', writtenPath);
  return writtenPath;
}

function writeCodexMcpConfig(): string | null {
  const port = deps.getApiPort();
  const token = deps.getApiToken();
  if (!port || !token) return null;

  const codexDir = path.join(os.homedir(), '.codex');
  if (!fs.existsSync(codexDir)) fs.mkdirSync(codexDir, { recursive: true });
  const configPath = path.join(codexDir, 'config.toml');

  let serverPath = getMcpServerPath();
  serverPath = serverPath.replace(/\\/g, '/');

  const risutokiBlock = [
    '',
    '# --- RisuToki MCP (auto-generated, do not edit) ---',
    '[mcp_servers.risutoki]',
    `command = "node"`,
    `args = ["${serverPath}"]`,
    '',
    '[mcp_servers.risutoki.env]',
    `TOKI_PORT = "${port}"`,
    `TOKI_TOKEN = "${token}"`,
    '# --- /RisuToki MCP ---',
    '',
  ].join('\n');

  let existing = '';
  if (fs.existsSync(configPath)) {
    existing = fs.readFileSync(configPath, 'utf-8');
    existing = existing.replace(/\n?# --- RisuToki MCP \(auto-generated.*?\n# --- \/RisuToki MCP ---\n?/s, '');
  }

  fs.writeFileSync(configPath, existing.trimEnd() + '\n' + risutokiBlock, 'utf-8');
  console.log('[main] Codex MCP config written:', configPath);
  return configPath;
}

export function cleanupCodexMcpConfig(): void {
  try {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    if (!fs.existsSync(configPath)) return;
    const content = fs.readFileSync(configPath, 'utf-8');
    const cleaned = content.replace(/\n?# --- RisuToki MCP \(auto-generated.*?\n# --- \/RisuToki MCP ---\n?/s, '');
    fs.writeFileSync(configPath, cleaned, 'utf-8');
    console.log('[main] Codex MCP config cleaned up');
  } catch (e: any) { console.warn('[main] Codex MCP config cleanup failed:', e.message); }
}

// ---------------------------------------------------------------------------
// Init — register IPC handlers
// ---------------------------------------------------------------------------

export function initMcpConfig(d: McpConfigDeps): void {
  deps = d;

  ipcMain.handle('write-mcp-config', () => {
    return writeCurrentMcpConfig();
  });

  ipcMain.handle('write-copilot-mcp-config', () => {
    return writeCopilotMcpConfig();
  });

  ipcMain.handle('write-codex-mcp-config', () => {
    return writeCodexMcpConfig();
  });
}
