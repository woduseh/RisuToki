# RisuToki: State Extraction & JS→TS Migration Roadmap

## QUICK SUMMARY

### (1) Global Mutable State Groups Found in main.js (2,966 lines)

#### Group A: Current File State [HIGHEST PRIORITY]
- **Variables**: currentFilePath, currentData (charx/risum object)
- **Read by**: 35+ IPC handlers, MCP API server, sync server, asset builder, popup creators
- **Written by**: new-file, open-file, save-file, applyUpdates(), MCP endpoints
- **Criticality**: ALL file operations depend on this; mutated by API server without locks

#### Group B: Window Management
- **Variables**: mainWindow, popoutWindows{}
- **Scope**: 20+ IPC handlers, broadcast functions, lifecycle events
- **Issue**: BrowserWindow refs cannot be tested; tightly coupled to Electron API

#### Group C: MCP Confirmation Callbacks
- **Variables**: mcpConfirmId, mcpConfirmCallbacks{}
- **Pattern**: Promise-based RPC; blocks API requests on user dialog responses

#### Group D: API & Sync Servers
- **Variables**: apiServer, apiPort, apiToken, syncServer, syncHash
- **Issue**: Auto-generated at startup; baked into env for child processes; tight coupling to MCP config

#### Group E: Reference Files (Read-Only Cache)
- **Variables**: referenceFiles[], referenceManifestStatus
- **Shared with**: MCP API, UI popouts
- **Persisted to**: userData/reference-files.json

#### Group F: Terminal Process
- **Variables**: ptyProcess (node-pty instance)
- **Lifecycle**: Tightly coupled to app termination

#### Group G: File Guides & AGENTS.md
- **Variables**: sessionGuides[], activeAgentsFilePath, activeAgentsOriginalContent, activeAgentsHadExistingFile
- **Pattern**: Must cleanup on exit

#### Group H: Caching
- **Variables**: _assetsMapCache, _cssStylePrefix/_cssStyleSuffix, _lua/_cssCache (source/result pairs)
- **Problem**: Cache invalidation scattered; no coherence mechanism

---

### (2) Recommended First Extraction: CurrentFileStore

**Create**: src/electron/main-state-store.ts (~250 lines)

**API**:
\\\	ypescript
export class CurrentFileStore {
  getPath(): string | null
  getData(): CharxData | null
  setPath(filePath: string | null): void
  setData(data: CharxData | null): void
  set(filePath: string | null, data: CharxData | null): void
  clear(): void
  subscribe(observer: () => void): () => void  // Observer pattern
}

export class WindowStore {
  getMainWindow(): BrowserWindow | undefined
  setMainWindow(win: BrowserWindow | undefined): void
  getPopout(type: string): BrowserWindow | undefined
  setPopout(type: string, win: BrowserWindow | null): void
  getAllPopouts(): BrowserWindow[]
  getAll(): BrowserWindow[]
}

export class ApiServerStore {
  getServer(): http.Server | null
  getPort(): number | null
  getToken(): string | null
  initialize(server: http.Server, port: number, token: string): void
  isActive(): boolean
}

export class TerminalProcessStore {
  getProcess(): any
  setProcess(proc: any): void
  isRunning(): boolean
  clear(): void
  subscribe(observer: (running: boolean) => void): () => void
}

export class MainStateStore {
  readonly currentFile: CurrentFileStore
  readonly windows: WindowStore
  readonly apiServer: ApiServerStore
  readonly terminal: TerminalProcessStore
  // ... lightweight state (mcpConfirmId, syncHash, etc.)
}

export const mainStateStore = new MainStateStore();
\\\

**Benefits**:
- ✅ Zero behavior change (encapsulation only)
- ✅ Incremental adoption (handlers can migrate gradually)
- ✅ Testable via mocking
- ✅ Observer pattern enables reactive UI updates
- ✅ Type safety (TS catches reference errors)

**Usage Pattern**:
\\\	ypescript
// Before
currentData.name = 'New Name';
broadcastToAll('data-updated', 'name', currentData.name);

// After
mainStateStore.currentFile.getData()!.name = 'New Name';
broadcastToAll('data-updated', 'name', mainStateStore.currentFile.getData()!.name);

// Better with observer
mainStateStore.currentFile.subscribe(() => {
  const data = mainStateStore.currentFile.getData();
  if (data) broadcastToAll('data-updated', 'name', data.name);
});
\\\

---

### (3) Likely Impacted Files

| File | Type | Impact | Notes |
|------|------|--------|-------|
| **main.js** | Electron | ~70 direct replacements | Primary mutation site |
| preload.js | Electron IPC Bridge | No change needed | Uses existing IPC interface |
| popout-preload.js | Electron IPC Bridge | No change needed | Uses existing IPC interface |
| src/app/controller.js | Renderer | No change (stays on IPC) | Calls handlers, not state directly |
| src/charx-io.js | I/O Library | No change needed | Called FROM main.js, not state-aware |
| src/lib/*.ts | Various | No change | Use IPC to access state |

**Why controller.js stays untouched**:
- Already uses \window.tokiAPI.*\ for all state access
- renderer → ipcRenderer → ipcMain handlers → mainStateStore
- No direct state coupling in renderer code

---

### (4) JS→TS Migration Order (Remaining Files)

**Current State**:
- TS: src/main.ts, src/popout.ts, src/App.vue, 20+ lib/*.ts
- JS (Electron): main.js (2,966 lines), preload.js, popout-preload.js, toki-mcp-server.js
- JS (Renderer/Lib): src/charx-io.js, src/app/controller.js, src/lib/terminal-chat.js, etc.

**Conversion Roadmap** (in order of dependency):

**Phase 1: Foundation (Weeks 1-2)**
1. ✅ Create \src/electron/main-state-store.ts\ (NEW, 250 lines) [2h]
2. Convert \preload.js → preload.ts\ (thin bridge, 150 lines) [2h]
   - Reason: No dependencies; used by main.js; safe first target
   - After: Update main.js imports
3. Convert \popout-preload.js → popout-preload.ts\ (120 lines) [2h]
   - Similar to preload.js

**Phase 2: Core Runtime (Weeks 2-4)**
4. Refactor \main.js → main.ts\ (LARGE, 2,966 lines) [3-4 days]
   - Step 1: Extract window management functions into WindowManager class
   - Step 2: Extract file operations into FileManager class
   - Step 3: Integrate main-state-store.ts
   - Step 4: Migrate IPC handlers to use store
   - Target: <2,500 lines, strict types, no global variables outside store
   - Use: Main-state-store to eliminate 20+ let declarations

5. Update \package.json\ scripts
   - Add linting for main.ts
   - Update build to output main.ts → main.js

**Phase 3: I/O & Data (Weeks 4-5)**
6. Convert \src/charx-io.js → charx-io.ts\ (600 lines) [1 day]
   - Pure I/O logic; no state coupling; test-friendly
   - High value: used in main.js + tests

7. Convert \src/rpack.js → rpack.ts\ (400 lines) [4h]
   - Resource pack parsing; isolated logic

**Phase 4: Renderer Core (Weeks 5-6)**
8. Convert \src/app/controller.js → controller.ts\ (1,400 lines) [2 days]
   - Largest renderer file; heavy IPC user
   - Wait for preload.ts first to avoid circular deps
   - Refactor while converting: separate concerns (file ops, terminal, UI state)

**Phase 5: Libraries (Weeks 6-8)**
9. Convert \src/lib/terminal-chat.js → terminal-chat.ts\ (500 lines) [1 day]
   - TUI chat formatting; no state coupling

10. Convert \src/lib/preview-engine.js → preview-engine.ts\ (700 lines) [1 day]
    - Lua rendering; can mock wasmoon for tests

**Phase 6: Final (Weeks 8-9)**
11. Convert \	oki-mcp-server.js → toki-mcp-server.ts\ (1,200 lines) [1 day]
    - Last because: lowest coupling; already stable

---

## Expected Build Behavior

**Current Setup** (vite.config.ts):
- ✅ Already handles .ts/.vue files in src/
- ✅ eslint.config.mjs lints both .js and .ts
- ✅ tsconfig.json strict mode enabled
- ✅ npm run build: vite build (outputs dist/)
- ✅ npm run lint: eslint (runs on main.js + src/main.ts)

**After Migration**:
- ✅ Add main.ts to tsconfig.json includes
- ⚠️ ESLint will check main.ts instead of main.js (update scripts)
- ✅ Vite doesn't bundle main.ts (stays as separate main.js entry point)
- ✅ Build output: dist/ (renderer), main.js (electron, copied as-is)

---

## Phased Execution Plan

| Phase | Duration | Files | Dependencies | Success Criteria |
|-------|----------|-------|--------------|-----------------|
| **Foundation** | 1 week | main-state-store.ts, preload.ts | None | npm run test passes; preload.ts builds |
| **Core Runtime** | 2 weeks | main.ts (refactored), package.json | main-state-store.ts | main.ts strict types; all handlers use store; no 'let' globals |
| **I/O & Data** | 1 week | charx-io.ts, rpack.ts | main.ts | Types exported; tests run |
| **Renderer Core** | 1 week | controller.ts | preload.ts | Large file TS-compatible; IPC types align |
| **Libraries** | 1 week | terminal-chat.ts, preview-engine.ts | Depends on modules imported | All lib files TS; tests green |
| **Final** | 2 days | toki-mcp-server.ts | None | Full build succeeds; no .js files left |

**Total Estimate**: 6-8 weeks (with team of 1-2 developers)

---

## Minimal Extraction Example

Converting a handler from global state to store:

### Before (main.js)
\\\javascript
ipcMain.handle('new-file', async () => {
  currentFilePath = null;
  currentData = { spec: 'chara_card_v3', ... };
  mainWindow.setTitle('RisuToki - New');
  broadcastSidebarDataChanged();
  return serializeForRenderer(currentData);
});
\\\

### After (main.ts with store)
\\\	ypescript
import { mainStateStore } from './electron/main-state-store';

ipcMain.handle('new-file', async () => {
  const newData = { spec: 'chara_card_v3' as const, ... };
  mainStateStore.currentFile.set(null, newData);
  
  const mainWindow = mainStateStore.windows.getMainWindow();
  mainWindow?.setTitle('RisuToki - New');
  broadcastSidebarDataChanged();
  
  return serializeForRenderer(newData);
});
\\\

**Changes**:
- \currentFilePath = null\ → handled by store.set()
- \currentData = ...\ → handled by store.set()
- \mainWindow\ → retrieved from store
- All behavior identical

---

## Conclusion

**Primary Goal**: Reduce main.js from 2,966 lines of spaghetti global state to a modular, testable architecture.

**First Step**: Extract CurrentFileStore (~250 lines) to decouple state management from IPC handlers.

**Next**: Migrate main.js handlers to use store (4-5 days), then begin JS→TS conversion.

**End Result**: 
- ✅ Type-safe Electron main process
- ✅ Observable state (enables reactive patterns)
- ✅ Testable without Electron mocking
- ✅ Clear separation of concerns
- ✅ No behavior changes (drop-in replacement)
