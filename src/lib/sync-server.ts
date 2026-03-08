import { ipcMain } from 'electron';
import * as http from 'http';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SyncServerDeps {
  getCurrentData: () => any;
  broadcastToAll: (channel: string, ...args: any[]) => void;
  getSyncHash: () => number;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: SyncServerDeps;
let syncServer: http.Server | null = null;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

function mapCharacterForRisuAI(): Record<string, any> | null {
  const data = deps.getCurrentData();
  if (!data) return null;
  const lb = (data.lorebook || []).filter((e: any) => e.mode !== 'folder').map((e: any) => ({
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
  const rx = (data.regex || []).map((e: any) => ({
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

function syncJsonRes(res: http.ServerResponse, data: unknown, status?: number): void {
  res.writeHead(status || 200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function startSyncServer(port?: number): { ok: boolean; port: number } {
  const effectivePort = port || 4735;
  if (syncServer) return { ok: true, port: effectivePort };
  syncServer = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }
    const url = new URL(req.url!, 'http://127.0.0.1');
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
      if (!mapped) return syncJsonRes(res, { error: 'No file open' }, 400);
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

export function stopSyncServer(): void {
  if (!syncServer) return;
  syncServer.close();
  syncServer = null;
  console.log('[main] Sync server stopped');
  deps.broadcastToAll('sync-status', false, 0);
}

// ---------------------------------------------------------------------------
// Init — register IPC handlers
// ---------------------------------------------------------------------------

export function initSyncServer(d: SyncServerDeps): void {
  deps = d;

  ipcMain.handle('start-sync', (_, port: number) => startSyncServer(port));
  ipcMain.handle('stop-sync', () => { stopSyncServer(); return { ok: true }; });
}
