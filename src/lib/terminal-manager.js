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
exports.isTerminalRunning = isTerminalRunning;
exports.killTerminal = killTerminal;
exports.initTerminalManager = initTerminalManager;
const electron_1 = require("electron");
const path = __importStar(require("path"));
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function getTerminalStatusMessage(level, message, detail = null) {
    const payload = { level, message };
    if (detail)
        payload.detail = detail;
    return payload;
}
function formatTerminalError(error) {
    if (error instanceof Error) {
        return error.message || '알 수 없는 오류';
    }
    if (typeof error === 'string' && error.trim()) {
        return error;
    }
    return '알 수 없는 오류';
}
// ---------------------------------------------------------------------------
// Module state & init
// ---------------------------------------------------------------------------
let ptyProcess = null;
function isTerminalRunning() {
    return !!ptyProcess;
}
function killTerminal() {
    if (ptyProcess) {
        ptyProcess.__tokiStopRequested = true;
        ptyProcess.kill();
        ptyProcess = null;
    }
}
function initTerminalManager(deps) {
    const { broadcastToAll, getCurrentFilePath, getApiPort, getApiToken } = deps;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildTerminalLaunchAttempts } = require('./terminal-shell');
    function broadcastTerminalStatus(level, message, detail = null) {
        broadcastToAll('terminal-status', getTerminalStatusMessage(level, message, detail));
    }
    // --- terminal-start ---
    electron_1.ipcMain.handle('terminal-start', async (_, cols, rows) => {
        if (ptyProcess) {
            ptyProcess.__tokiStopRequested = true;
            ptyProcess.kill();
            ptyProcess = null;
        }
        let pty;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            pty = require('node-pty');
        }
        catch (error) {
            const detail = formatTerminalError(error);
            broadcastTerminalStatus('error', '터미널 구성요소를 불러오지 못했습니다.', detail);
            console.warn('[Terminal] failed to load node-pty:', error);
            return false;
        }
        const currentFile = getCurrentFilePath();
        const preferredCwd = currentFile ? path.dirname(currentFile) : process.cwd();
        const attempts = buildTerminalLaunchAttempts({
            platform: process.platform,
            env: process.env,
            cwd: preferredCwd,
            fallbackCwd: process.cwd(),
        });
        // Clean env: remove CLAUDECODE so nested claude sessions work
        const cleanEnv = Object.assign({}, process.env);
        delete cleanEnv.CLAUDECODE;
        // Inject MCP API info for toki-mcp-server
        const apiPort = getApiPort();
        const apiToken = getApiToken();
        if (apiPort && apiToken) {
            cleanEnv.TOKI_PORT = String(apiPort);
            cleanEnv.TOKI_TOKEN = apiToken;
        }
        const failures = [];
        for (const attempt of attempts) {
            try {
                const processHandle = pty.spawn(attempt.shell, attempt.args, {
                    name: 'xterm-256color',
                    cols: cols || 120,
                    rows: rows || 24,
                    cwd: attempt.cwd,
                    env: cleanEnv,
                });
                processHandle.__tokiStopRequested = false;
                ptyProcess = processHandle;
                ptyProcess.onData((data) => broadcastToAll('terminal-data', data));
                ptyProcess.onExit((event = {}) => {
                    const exitCode = typeof event.exitCode === 'number' ? event.exitCode : null;
                    const signal = typeof event.signal === 'number' ? event.signal : null;
                    const wasRequested = !!processHandle.__tokiStopRequested;
                    const isCurrentProcess = ptyProcess === processHandle;
                    if (isCurrentProcess) {
                        broadcastToAll('terminal-exit');
                        ptyProcess = null;
                    }
                    if (isCurrentProcess && !wasRequested && (exitCode !== null || signal !== null)) {
                        const parts = [];
                        if (exitCode !== null)
                            parts.push(`exit code ${exitCode}`);
                        if (signal !== null)
                            parts.push(`signal ${signal}`);
                        broadcastTerminalStatus('warn', '터미널 프로세스가 종료되었습니다.', parts.join(', '));
                    }
                });
                if (failures.length > 0) {
                    const recoveryDetail = attempt.isFallbackCwd
                        ? `${attempt.label} / ${attempt.cwd}`
                        : attempt.label;
                    broadcastTerminalStatus('warn', '터미널을 복구해 다시 연결했습니다.', recoveryDetail);
                }
                return true;
            }
            catch (error) {
                failures.push({
                    label: attempt.label,
                    cwd: attempt.cwd,
                    detail: formatTerminalError(error),
                });
                console.warn('[Terminal] failed to start attempt:', attempt, error);
            }
        }
        const detail = failures
            .map((failure) => `${failure.label} @ ${failure.cwd}: ${failure.detail}`)
            .join(' | ');
        broadcastTerminalStatus('error', '터미널 시작에 실패했습니다.', detail);
        return false;
    });
    // --- terminal-input ---
    electron_1.ipcMain.on('terminal-input', (_, data) => {
        if (ptyProcess)
            ptyProcess.write(data);
    });
    // --- terminal-resize ---
    electron_1.ipcMain.on('terminal-resize', (_, cols, rows) => {
        if (ptyProcess)
            ptyProcess.resize(cols, rows);
    });
    // --- terminal-stop ---
    electron_1.ipcMain.handle('terminal-stop', () => {
        killTerminal();
        return true;
    });
    // --- terminal-is-running ---
    electron_1.ipcMain.handle('terminal-is-running', () => isTerminalRunning());
}
