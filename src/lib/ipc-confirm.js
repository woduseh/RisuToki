"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askRendererConfirm = askRendererConfirm;
exports.askRendererCloseConfirm = askRendererCloseConfirm;
exports.initIpcConfirm = initIpcConfirm;
const electron_1 = require("electron");
// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let deps;
let mcpConfirmId = 0;
const mcpConfirmCallbacks = {};
// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------
/** Show MCP confirmation popup via renderer. Resolves `true` if allowed. */
function askRendererConfirm(title, message) {
    return new Promise((resolve) => {
        const mainWindow = deps.getMainWindow();
        if (!mainWindow || mainWindow.isDestroyed()) {
            resolve(false);
            return;
        }
        const id = ++mcpConfirmId;
        mcpConfirmCallbacks[id] = resolve;
        mainWindow.webContents.send('mcp-confirm-request', id, title, message);
        // Timeout fallback (30s)
        setTimeout(() => {
            if (mcpConfirmCallbacks[id]) {
                delete mcpConfirmCallbacks[id];
                resolve(false);
            }
        }, 30000);
    });
}
/** Show close-confirm popup via renderer. Resolves 0=save+close, 1=close, 2=cancel. */
function askRendererCloseConfirm() {
    return new Promise((resolve) => {
        const mainWindow = deps.getMainWindow();
        if (!mainWindow || mainWindow.isDestroyed()) {
            resolve(1);
            return;
        }
        const id = ++mcpConfirmId;
        mcpConfirmCallbacks[id] = resolve;
        mainWindow.webContents.send('close-confirm-request', id);
    });
}
// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
function initIpcConfirm(d) {
    deps = d;
    electron_1.ipcMain.on('mcp-confirm-response', (_, id, allowed) => {
        if (mcpConfirmCallbacks[id]) {
            mcpConfirmCallbacks[id](allowed);
            delete mcpConfirmCallbacks[id];
        }
    });
    electron_1.ipcMain.on('close-confirm-response', (_, id, choice) => {
        if (mcpConfirmCallbacks[id]) {
            mcpConfirmCallbacks[id](choice);
            delete mcpConfirmCallbacks[id];
        }
    });
}
