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
  toolProfile?: string;
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

const TOOL_PROFILE_ALIASES: Record<string, string> = {
  advanced: 'advanced-full',
  full: 'advanced-full',
};
const TOOL_PROFILE_NAMES = new Set(['facade-first', 'authoring', 'advanced-full', 'readonly']);

export function normalizeMcpToolProfile(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  const resolved = TOOL_PROFILE_ALIASES[normalized] ?? normalized;
  return TOOL_PROFILE_NAMES.has(resolved) ? resolved : undefined;
}

// App-managed connections migrate legacy broad surfaces on every rewrite.
// A read-only connection must never silently gain mutation tools.
function managedToolProfile(existing: unknown): string {
  return normalizeMcpToolProfile(existing) === 'readonly' ? 'readonly' : 'facade-first';
}

function hasReadonlyToolProfileArg(args: unknown): boolean {
  if (!Array.isArray(args)) return false;
  return args.some(
    (arg, index) =>
      (typeof arg === 'string' &&
        arg.startsWith('--tool-profile=') &&
        normalizeMcpToolProfile(arg.slice('--tool-profile='.length)) === 'readonly') ||
      (arg === '--tool-profile' && normalizeMcpToolProfile(args[index + 1]) === 'readonly'),
  );
}

function getRisutokiMcpServerConfig(toolProfile?: string): Record<string, any> | null {
  const port = deps.getApiPort();
  const token = deps.getApiToken();
  if (!port || !token) return null;
  const normalizedToolProfile = managedToolProfile(toolProfile);
  return {
    type: 'stdio',
    command: 'node',
    args: [getMcpServerPath()],
    env: {
      TOKI_PORT: String(port),
      TOKI_TOKEN: token,
      RISUTOKI_MCP_TOOL_PROFILE: normalizedToolProfile,
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

function getTomlTableName(line: string): string | null {
  const match = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
  return match ? match[1].trim() : null;
}

export function removeTopLevelCodexRisutokiServerTables(content: string): string {
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const tableName = getTomlTableName(line);
    if (tableName) {
      skipping = tableName === 'mcp_servers.risutoki' || tableName === 'mcp_servers.risutoki.env';
    }

    if (!skipping) {
      kept.push(line);
    }
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}

function isTomlTableHeader(line: string): boolean {
  return getTomlTableName(line) !== null;
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

function extractCodexToolProfile(content: string): string | undefined {
  let tableName: string | null = null;
  let profile: string | undefined;
  let readonlyArg = false;
  for (const line of content.split(/\r?\n/)) {
    const nextTableName = getTomlTableName(line);
    if (nextTableName) {
      tableName = nextTableName;
      continue;
    }
    if (tableName === 'mcp_servers.risutoki' && /^\s*args\s*=/.test(line)) {
      // Generated configs use a single-line array of TOML basic strings.
      const args = (line.match(/"(?:\\.|[^"\\])*"|'[^']*'/g) ?? []).map((value) => {
        if (value.startsWith("'")) return value.slice(1, -1);
        try {
          return JSON.parse(value);
        } catch {
          return value.slice(1, -1);
        }
      });
      readonlyArg ||= hasReadonlyToolProfileArg(args);
    }
    if (tableName !== 'mcp_servers.risutoki.env') continue;
    const match = line.match(/^\s*RISUTOKI_MCP_TOOL_PROFILE\s*=\s*(["'])(.*?)\1\s*(?:#.*)?$/);
    if (match) profile = normalizeMcpToolProfile(match[2]);
  }
  return readonlyArg ? 'readonly' : profile;
}

function buildCodexMcpBlock(options: CodexMcpConfigOptions): string {
  const serverPath = options.serverPath.replace(/\\/g, '/');
  const toolProfile = normalizeMcpToolProfile(options.toolProfile);
  return [
    '# --- RisuToki MCP (auto-generated, do not edit) ---',
    '[mcp_servers.risutoki]',
    `command = ${toTomlString('node')}`,
    `args = [${toTomlString(serverPath)}]`,
    '',
    '[mcp_servers.risutoki.env]',
    `TOKI_PORT = ${toTomlString(String(options.port))}`,
    `TOKI_TOKEN = ${toTomlString(options.token)}`,
    ...(toolProfile ? [`RISUTOKI_MCP_TOOL_PROFILE = ${toTomlString(toolProfile)}`] : []),
    '# --- /RisuToki MCP ---',
  ].join('\n');
}

export function buildCodexMcpConfigToml(existing: string, options: CodexMcpConfigOptions): string {
  const toolProfile =
    normalizeMcpToolProfile(options.toolProfile) ?? managedToolProfile(extractCodexToolProfile(existing));
  const preserved = sanitizeCodexFeatures(
    removeTopLevelCodexRisutokiServerTables(removeManagedCodexMcpBlock(existing)),
  ).trimEnd();
  const block = buildCodexMcpBlock({ ...options, toolProfile });
  return `${preserved ? `${preserved}\n\n` : ''}${block}\n`;
}

export function cleanupCodexMcpConfigToml(content: string): string {
  return removeTopLevelCodexRisutokiServerTables(removeManagedCodexMcpBlock(content)).trimEnd() + '\n';
}

export function mergeRisutokiJsonMcpConfig(input: unknown, serverConfig: Record<string, any>): Record<string, any> {
  const existing =
    input && typeof input === 'object' && !Array.isArray(input) ? { ...(input as Record<string, any>) } : {};
  const existingServers =
    existing.mcpServers && typeof existing.mcpServers === 'object' && !Array.isArray(existing.mcpServers)
      ? { ...existing.mcpServers }
      : {};
  const existingRisutoki =
    existingServers.risutoki && typeof existingServers.risutoki === 'object' && !Array.isArray(existingServers.risutoki)
      ? existingServers.risutoki
      : {};
  const toolProfile = hasReadonlyToolProfileArg(existingRisutoki.args)
    ? 'readonly'
    : managedToolProfile(existingRisutoki.env?.RISUTOKI_MCP_TOOL_PROFILE);
  const nextEnv = {
    ...(serverConfig.env ?? {}),
    RISUTOKI_MCP_TOOL_PROFILE: toolProfile,
  };
  existing.mcpServers = {
    ...existingServers,
    risutoki: {
      ...serverConfig,
      env: nextEnv,
    },
  };
  return existing;
}

export function upsertJsonMcpConfig(configPath: string): string | null {
  let existing: any = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    existing = {};
  }

  const existingToolProfile = normalizeMcpToolProfile(existing?.mcpServers?.risutoki?.env?.RISUTOKI_MCP_TOOL_PROFILE);
  const serverConfig = getRisutokiMcpServerConfig(existingToolProfile);
  if (!serverConfig) return null;
  existing = mergeRisutokiJsonMcpConfig(existing, serverConfig);
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
    writeAntigravityMcpConfig();
  } catch (e: any) {
    console.warn('[main] Antigravity MCP config failed:', e.message);
  }

  return writtenPath;
}

function writeCopilotMcpConfig(): string | null {
  const configPath = path.join(os.homedir(), '.copilot', 'mcp-config.json');
  const writtenPath = upsertJsonMcpConfig(configPath);
  if (writtenPath) console.log('[main] Copilot MCP config written:', writtenPath);
  return writtenPath;
}

function writeCodexMcpConfigFile(configPath: string, options: CodexMcpConfigOptions): void {
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  let existing = '';
  if (fs.existsSync(configPath)) {
    existing = fs.readFileSync(configPath, 'utf-8');
  }

  fs.writeFileSync(configPath, buildCodexMcpConfigToml(existing, options), 'utf-8');
}

function writeCodexMcpConfig(projectRoot?: string | null): string | null {
  const port = deps.getApiPort();
  const token = deps.getApiToken();
  if (!port || !token) return null;

  const options = {
    serverPath: getMcpServerPath(),
    port,
    token,
  };

  const configPath = path.join(os.homedir(), '.codex', 'config.toml');
  writeCodexMcpConfigFile(configPath, options);
  console.log('[main] Codex MCP config written:', configPath);

  if (projectRoot && path.isAbsolute(projectRoot)) {
    const projectConfigPath = path.join(projectRoot, '.codex', 'config.toml');
    writeCodexMcpConfigFile(projectConfigPath, options);
    console.log('[main] Codex project MCP config written:', projectConfigPath);
  }

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

function writeAntigravityMcpConfig(): string | null {
  const configPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
  const writtenPath = upsertJsonMcpConfig(configPath);
  if (writtenPath) console.log('[main] Antigravity MCP config written:', writtenPath);
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

  ipcMain.handle('write-codex-mcp-config', (_, projectRoot?: string | null) => {
    return writeCodexMcpConfig(projectRoot);
  });

  ipcMain.handle('write-antigravity-mcp-config', () => {
    return writeAntigravityMcpConfig();
  });
}
