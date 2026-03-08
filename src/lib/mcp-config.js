"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertJsonMcpConfig = upsertJsonMcpConfig;
exports.cleanupJsonMcpConfig = cleanupJsonMcpConfig;
exports.writeCurrentMcpConfig = writeCurrentMcpConfig;
exports.cleanupCodexMcpConfig = cleanupCodexMcpConfig;
exports.initMcpConfig = initMcpConfig;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let deps;
// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------
function getMcpServerPath() {
    let serverPath = path.join(deps.getDirname(), 'toki-mcp-server.js');
    if (deps.isPackaged()) {
        serverPath = serverPath.replace('app.asar', 'app.asar.unpacked');
    }
    return serverPath;
}
function getRisutokiMcpServerConfig() {
    const port = deps.getApiPort();
    const token = deps.getApiToken();
    if (!port || !token)
        return null;
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
function upsertJsonMcpConfig(configPath) {
    const serverConfig = getRisutokiMcpServerConfig();
    if (!serverConfig)
        return null;
    let existing = {};
    try {
        if (fs.existsSync(configPath)) {
            existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
    }
    catch {
        existing = {};
    }
    if (!existing || typeof existing !== 'object' || Array.isArray(existing))
        existing = {};
    if (!existing.mcpServers || typeof existing.mcpServers !== 'object' || Array.isArray(existing.mcpServers)) {
        existing.mcpServers = {};
    }
    existing.mcpServers.risutoki = serverConfig;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8');
    return configPath;
}
function cleanupJsonMcpConfig(configPath) {
    try {
        if (!fs.existsSync(configPath))
            return;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (!config.mcpServers || !config.mcpServers.risutoki)
            return;
        delete config.mcpServers.risutoki;
        if (Object.keys(config.mcpServers).length === 0) {
            delete config.mcpServers;
        }
        if (Object.keys(config).length === 0) {
            fs.unlinkSync(configPath);
        }
        else {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        }
    }
    catch (e) {
        console.warn('[main] MCP config cleanup failed:', e.message);
    }
}
function writeCurrentMcpConfig() {
    const configPath = path.join(os.homedir(), '.mcp.json');
    const writtenPath = upsertJsonMcpConfig(configPath);
    if (writtenPath)
        console.log('[main] MCP config written:', writtenPath);
    return writtenPath;
}
function writeCopilotMcpConfig() {
    const configPath = path.join(os.homedir(), '.copilot', 'mcp-config.json');
    const writtenPath = upsertJsonMcpConfig(configPath);
    if (writtenPath)
        console.log('[main] Copilot MCP config written:', writtenPath);
    return writtenPath;
}
function writeCodexMcpConfig() {
    const port = deps.getApiPort();
    const token = deps.getApiToken();
    if (!port || !token)
        return null;
    const codexDir = path.join(os.homedir(), '.codex');
    if (!fs.existsSync(codexDir))
        fs.mkdirSync(codexDir, { recursive: true });
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
function cleanupCodexMcpConfig() {
    try {
        const configPath = path.join(os.homedir(), '.codex', 'config.toml');
        if (!fs.existsSync(configPath))
            return;
        const content = fs.readFileSync(configPath, 'utf-8');
        const cleaned = content.replace(/\n?# --- RisuToki MCP \(auto-generated.*?\n# --- \/RisuToki MCP ---\n?/s, '');
        fs.writeFileSync(configPath, cleaned, 'utf-8');
        console.log('[main] Codex MCP config cleaned up');
    }
    catch (e) {
        console.warn('[main] Codex MCP config cleanup failed:', e.message);
    }
}
// ---------------------------------------------------------------------------
// Init — register IPC handlers
// ---------------------------------------------------------------------------
function initMcpConfig(d) {
    deps = d;
    electron_1.ipcMain.handle('write-mcp-config', () => {
        return writeCurrentMcpConfig();
    });
    electron_1.ipcMain.handle('write-copilot-mcp-config', () => {
        return writeCopilotMcpConfig();
    });
    electron_1.ipcMain.handle('write-codex-mcp-config', () => {
        return writeCodexMcpConfig();
    });
}
