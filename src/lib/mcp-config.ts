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

export interface CodexMcpConfigOptions {
  serverPath: string;
  port: number | string;
  token: string;
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

function toTomlString(value: string): string {
  return JSON.stringify(value);
}

const CODEX_MANAGED_BLOCK_PATTERN =
  /\n?# --- RisuToki MCP \(auto-generated, do not edit\) ---[\s\S]*?# --- \/RisuToki MCP ---[^\S\r\n]*(?:\r?\n)?/g;

export function removeManagedCodexMcpBlock(content: string): string {
  return content.replace(CODEX_MANAGED_BLOCK_PATTERN, '\n').replace(/\n{3,}/g, '\n\n');
}

function isTomlTableHeader(line: string): boolean {
  return /^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(line);
}

function isFeatureBooleanAssignment(line: string): boolean {
  const assignment = line.match(/^\s*[^#=\s][^=]*=\s*(.+?)\s*$/);
  if (!assignment) return true;
  return /^(?:true|false)\s*(?:#.*)?$/i.test(assignment[1]);
}

export function sanitizeCodexFeatures(content: string): string {
  const lines = content.split(/\r?\n/);
  const sanitized: string[] = [];
  let inFeatures = false;

  for (const line of lines) {
    if (isTomlTableHeader(line)) {
      inFeatures = /^\s*\[features\]\s*(?:#.*)?$/.test(line);
      sanitized.push(line);
      continue;
    }

    if (inFeatures && !isFeatureBooleanAssignment(line)) {
      continue;
    }

    sanitized.push(line);
  }

  return sanitized.join('\n');
}

function buildCodexMcpBlock(options: CodexMcpConfigOptions): string {
  const serverPath = options.serverPath.replace(/\\/g, '/');
  return [
    '# --- RisuToki MCP (auto-generated, do not edit) ---',
    '[mcp_servers.risutoki]',
    `command = ${toTomlString('node')}`,
    `args = [${toTomlString(serverPath)}]`,
    '',
    '[mcp_servers.risutoki.env]',
    `TOKI_PORT = ${toTomlString(String(options.port))}`,
    `TOKI_TOKEN = ${toTomlString(options.token)}`,
    '# --- /RisuToki MCP ---',
  ].join('\n');
}

export function buildCodexMcpConfigToml(existing: string, options: CodexMcpConfigOptions): string {
  const preserved = sanitizeCodexFeatures(removeManagedCodexMcpBlock(existing)).trimEnd();
  const block = buildCodexMcpBlock(options);
  return `${preserved ? `${preserved}\n\n` : ''}${block}\n`;
}

export function cleanupCodexMcpConfigToml(content: string): string {
  return removeManagedCodexMcpBlock(content).trimEnd() + '\n';
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
  } catch (e: any) {
    console.warn('[main] MCP config cleanup failed:', e.message);
  }
}

export function writeCurrentMcpConfig(): string | null {
  const configPath = path.join(os.homedir(), '.mcp.json');
  const writtenPath = upsertJsonMcpConfig(configPath);
  if (writtenPath) console.log('[main] MCP config written:', writtenPath);

  // Also write configs for all supported CLI tools
  try {
    writeCopilotMcpConfig();
  } catch (e: any) {
    console.warn('[main] Copilot MCP config failed:', e.message);
  }
  try {
    writeCodexMcpConfig();
  } catch (e: any) {
    console.warn('[main] Codex MCP config failed:', e.message);
  }
  try {
    writeGeminiMcpConfig();
  } catch (e: any) {
    console.warn('[main] Gemini MCP config failed:', e.message);
  }

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

  let existing = '';
  if (fs.existsSync(configPath)) {
    existing = fs.readFileSync(configPath, 'utf-8');
  }

  fs.writeFileSync(
    configPath,
    buildCodexMcpConfigToml(existing, {
      serverPath: getMcpServerPath(),
      port,
      token,
    }),
    'utf-8',
  );
  console.log('[main] Codex MCP config written:', configPath);
  return configPath;
}

export function cleanupCodexMcpConfig(): void {
  try {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    if (!fs.existsSync(configPath)) return;
    const content = fs.readFileSync(configPath, 'utf-8');
    fs.writeFileSync(configPath, cleanupCodexMcpConfigToml(content), 'utf-8');
    console.log('[main] Codex MCP config cleaned up');
  } catch (e: any) {
    console.warn('[main] Codex MCP config cleanup failed:', e.message);
  }
}

function writeGeminiMcpConfig(): string | null {
  const configPath = path.join(os.homedir(), '.gemini', 'settings.json');
  const writtenPath = upsertJsonMcpConfig(configPath);
  if (writtenPath) console.log('[main] Gemini MCP config written:', writtenPath);
  return writtenPath;
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

  ipcMain.handle('write-gemini-mcp-config', () => {
    return writeGeminiMcpConfig();
  });
}
