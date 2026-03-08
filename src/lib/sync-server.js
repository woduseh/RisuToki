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
exports.stopSyncServer = stopSyncServer;
exports.initSyncServer = initSyncServer;
const electron_1 = require("electron");
const http = __importStar(require("http"));
// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let deps;
let syncServer = null;
// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------
function mapCharacterForRisuAI() {
    const data = deps.getCurrentData();
    if (!data)
        return null;
    const lb = (data.lorebook || []).filter((e) => e.mode !== 'folder').map((e) => ({
        key: e.key || '',
        secondkey: e.secondkey || '',
        insertorder: e.insertorder ?? e.order ?? 100,
        comment: e.comment || '',
        content: e.content || '',
        mode: e.mode || 'normal',
        alwaysActive: !!e.alwaysActive,
        selective: !!e.selective,
        useRegex: !!e.useRegex,
    }));
    const rx = (data.regex || []).map((e) => ({
        comment: e.comment || '',
        in: e.find || '',
        out: e.replace || '',
        type: e.type || 'editdisplay',
        flag: e.flag || 'g',
        ableFlag: e.ableFlag !== false,
    }));
    return {
        name: data.name || '',
        desc: data.description || '',
        firstMessage: data.firstMessage || '',
        triggerScripts: data.triggerScripts || [],
        alternateGreetings: data.alternateGreetings || [],
        groupOnlyGreetings: data.groupOnlyGreetings || [],
        notes: data.globalNote || '',
        backgroundHTML: data.css || '',
        virtualscript: data.lua || '',
        defaultVariables: data.defaultVariables || '',
        globalLore: lb,
        customscript: rx,
    };
}
function syncJsonRes(res, data, status) {
    res.writeHead(status || 200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}
function startSyncServer(port) {
    const effectivePort = port || 4735;
    if (syncServer)
        return { ok: true, port: effectivePort };
    syncServer = http.createServer((req, res) => {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            });
            return res.end();
        }
        const url = new URL(req.url, 'http://127.0.0.1');
        const p = url.pathname;
        if (p === '/status') {
            const data = deps.getCurrentData();
            return syncJsonRes(res, {
                name: data ? data.name : null,
                hash: deps.getSyncHash(),
                hasFile: !!data,
            });
        }
        if (p === '/character') {
            const mapped = mapCharacterForRisuAI();
            if (!mapped)
                return syncJsonRes(res, { error: 'No file open' }, 400);
            return syncJsonRes(res, mapped);
        }
        syncJsonRes(res, { error: 'Not found' }, 404);
    });
    syncServer.listen(effectivePort, '127.0.0.1', () => {
        console.log(`[main] Sync server on 127.0.0.1:${effectivePort}`);
        deps.broadcastToAll('sync-status', true, effectivePort);
    });
    syncServer.on('error', (err) => {
        console.error('[main] Sync server error:', err.message);
        syncServer = null;
        deps.broadcastToAll('sync-status', false, 0);
    });
    return { ok: true, port: effectivePort };
}
function stopSyncServer() {
    if (!syncServer)
        return;
    syncServer.close();
    syncServer = null;
    console.log('[main] Sync server stopped');
    deps.broadcastToAll('sync-status', false, 0);
}
// ---------------------------------------------------------------------------
// Init — register IPC handlers
// ---------------------------------------------------------------------------
function initSyncServer(d) {
    deps = d;
    electron_1.ipcMain.handle('start-sync', (_, port) => startSyncServer(port));
    electron_1.ipcMain.handle('stop-sync', () => { stopSyncServer(); return { ok: true }; });
}
