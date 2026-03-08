# RisuToki Main.js State Extraction & JS→TS Migration - COMPLETE ANALYSIS

## 📋 ANALYSIS CONTENTS

This analysis covers:
1. **8 Global Mutable State Groups** identified in main.js
2. **Minimal Store Module API** design for Group A (CurrentFileStore)
3. **Impact Assessment** of which files need changes
4. **10-Step JS→TS Migration Roadmap** (6-8 weeks, phased approach)
5. **Build Integration Strategy** with existing package.json/vite setup

---

## 🎯 QUICK FACTS

| Metric | Value |
|--------|-------|
| main.js lines | 2,966 |
| IPC handlers | 65+ |
| Global state variables | 22 |
| Direct references to currentData/Path | ~70 |
| Files to migrate to TS | 8 (preload, main, charx-io, controller, etc.) |
| Estimated effort | 6-8 weeks (1-2 devs) |
| Risk level | Low (incremental, no behavior change) |

---

## �� STATE GROUPS (Summary)

### GROUP A: CURRENT FILE STATE
- **Impact**: Highest (35+ reader/writers)
- **Priority**: 1st extraction
- **Lines of code affected**: ~70 in main.js
- **Issue**: No transaction safety; cache invalidation scattered

### GROUP B: WINDOW MANAGEMENT
- **Impact**: High (20+ references)
- **Priority**: Include in store API (WindowStore)
- **Issue**: Cannot mock for testing

### GROUP C: MCP CALLBACKS
- **Impact**: Medium (promise-based RPC)
- **Priority**: Keep lightweight in MainStateStore
- **Pattern**: Timeout-based cleanup

### GROUP D: API & SYNC SERVERS
- **Impact**: Medium (tightly coupled to MCP config)
- **Priority**: Extract to ApiServerStore (phase 2)
- **Issue**: syncHash++ on every mutation

### GROUPS E-H: References, Terminal, Guides, Caches
- **Impact**: Low-Medium
- **Priority**: Phase 2+

---

## 🏗️ RECOMMENDED STORE API (Group A + B)

**File**: src/electron/main-state-store.ts

`	ypescript
// Core encapsulation of main.js global state
export class CurrentFileStore {
  getPath(): string | null
  getData(): CharxData | null
  setPath(filePath: string | null): void
  setData(data: CharxData | null): void
  set(filePath: string | null, data: CharxData | null): void
  clear(): void
  subscribe(observer: () => void): () => void
}

export class WindowStore {
  getMainWindow(): BrowserWindow | undefined
  setMainWindow(win: BrowserWindow | undefined): void
  getPopout(type: string): BrowserWindow | undefined
  setPopout(type: string, win: BrowserWindow | null): void
  getAllPopouts(): BrowserWindow[]
  getAll(): BrowserWindow[]
}

export class MainStateStore {
  readonly currentFile: CurrentFileStore
  readonly windows: WindowStore
  // ... apiServer, terminal in phase 2
}

export const mainStateStore = new MainStateStore();
`

**Usage**: 
`javascript
// Before
currentData = newData;
broadcastToAll('data-updated');

// After
mainStateStore.currentFile.setData(newData);
// OR with observer:
mainStateStore.currentFile.subscribe(() => {
  broadcastToAll('data-updated');
});
`

---

## 🎯 IMPACTED FILES

### Primary (main.js)
- ~70 references to currentFilePath/currentData
- Handlers: new-file, open-file, save-file, save-file-as, etc.
- Asset, terminal, MCP API operations
- Refactor strategy: Gradual migration to mainStateStore

### Secondary (preload.js, popout-preload.js)
- IPC bridge files
- Update imports only
- Convert to TS in Phase 1

### No Changes Required
- src/app/controller.js (renderer, uses IPC)
- src/charx-io.js (I/O library, called by main.js)
- src/lib/* (utilities, no state access)

---

## 📈 MIGRATION TIMELINE

### Phase 1: Foundation (Weeks 1-2) - 8 hours
1. Create main-state-store.ts (4h)
2. Convert preload.js → preload.ts (2h)
3. Convert popout-preload.js → popout-preload.ts (2h)

### Phase 2: Core Runtime (Weeks 2-4) - 3-4 days
4. Refactor main.js → main.ts
   - Extract WindowManager, FileManager classes
   - Integrate main-state-store.ts
   - Migrate handlers to use store
   - Target: <2,500 lines, strict types

### Phase 3: I/O Layer (Weeks 4-5) - 1.5 days
5. Convert src/charx-io.js → charx-io.ts (1d)
6. Convert src/rpack.js → rpack.ts (4h)

### Phase 4: Renderer Core (Weeks 5-6) - 2 days
7. Convert src/app/controller.js → controller.ts

### Phase 5: Libraries (Weeks 6-8) - 3 days
8. Convert src/lib/terminal-chat.js → terminal-chat.ts
9. Convert src/lib/preview-engine.js → preview-engine.ts

### Phase 6: Final (Weeks 8-9) - 1 day
10. Convert toki-mcp-server.js → toki-mcp-server.ts

**Total**: 6-8 weeks (1-2 developer team)

---

## 📦 BUILD INTEGRATION

### Current Setup (already supports migration)
✅ vite.config.ts: Handles .ts files in src/
✅ tsconfig.json: Strict mode enabled
✅ eslint.config.mjs: Lints both .js and .ts
✅ npm run build: Works with mixed JS/TS

### After Migration
✅ Add main.ts to tsconfig.json includes
✅ ESLint will check main.ts instead of main.js
✅ No build slowdown (Vite already handles TS)
✅ Output structure unchanged

---

## ✅ DELIVERABLES PROVIDED

1. **MIGRATION_ANALYSIS.md** (Detailed)
   - Complete analysis of 8 state groups
   - Full store API design
   - Line-by-line breakdown
   - Risk assessment

2. **STATE_EXTRACTION_QUICK_REFERENCE.txt** (Brief)
   - One-page executive summary
   - Quick facts and decisions
   - Timeline overview

3. **This Document** (Index & Overview)
   - Big picture
   - Timeline
   - Quick reference

---

## 🚀 RECOMMENDED NEXT STEPS

### Immediate (Today)
1. Review MIGRATION_ANALYSIS.md
2. Review store API design in STATE_EXTRACTION_QUICK_REFERENCE.txt
3. Get team alignment on extraction strategy

### Week 1
1. Implement main-state-store.ts (4h)
2. Migrate first batch of handlers (2h)
3. Add unit tests for store (2h)

### Week 2-4
1. Complete preload.ts migration (4h)
2. Begin main.js refactoring (class extraction)
3. Incremental main.js → main.ts conversion

### Ongoing
1. Run full test suite at each phase
2. Keep separate .js/.ts versions until TS passes all tests
3. Update ESLint rules incrementally

---

## 📌 KEY INSIGHTS

1. **main.js is structurally complex**
   - 2,966 lines
   - 65+ IPC handlers
   - 22 global mutable variables
   - No clear separation of concerns

2. **State extraction is low-risk**
   - No behavior changes (encapsulation only)
   - Incremental adoption possible
   - Existing IPC interface unchanged
   - Tests remain compatible

3. **Renderer code is already decoupled**
   - Uses window.tokiAPI.invoke() for state access
   - No direct state mutations from renderer
   - Can migrate Electron layer independently

4. **Build already supports mixed JS/TS**
   - vite/eslint/tsconfig all compatible
   - No infrastructure changes needed
   - Can migrate gradually

---

## 📚 REFERENCE FILES

See commit/PR descriptions for:
- CharxData type definitions
- IPC handler signatures
- Node.js module dependencies
- Test patterns for state store

---

**Analysis Date**: 2025
**Analysis Tool**: RisuToki Copilot Agent
**Confidence Level**: High (code inspection + pattern analysis)
