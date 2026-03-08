# RisuToki Vue 3 + Vite + TypeScript Migration: Overview & Quick Reference

**Generated**: 2026-03-07 18:20  
**Repository**: C:\Users\wodus\Copilot\RisuToki

---

## 📋 DELIVERABLES IN THIS MIGRATION PACKAGE

### 1. **MIGRATION_PLAN_SUMMARY.md** (~11KB)
   - Current architecture breakdown
   - Component mapping table (13 major responsibilities)
   - Pinia store structure (6 stores)
   - Toolchain setup (scripts, dependencies, configs)
   - High-risk areas with mitigation strategies
   - Smallest viable vertical slice (6 phases over 2 weeks)
   - Directory structure (target layout)
   - Test strategy (currently 0 tests → target 50-60%)
   - Timeline & effort estimates

### 2. **MIGRATION_CODE_EXAMPLES.md** (~6.7KB)
   - Concrete TypeScript/Vue 3 code examples
   - Editor Store (Pinia) implementation
   - Monaco Editor composable with lifecycle
   - Component hierarchy tree
   - Critical composables checklist
   - Vite config, TypeScript config
   - ESLint configuration
   - First unit test example

### 3. **THIS FILE: QUICK REFERENCE**
   - Key metrics & facts
   - File conversion checklist
   - Risk/effort matrix
   - Migration readiness checklist

---

## 🎯 KEY FACTS ABOUT CURRENT CODEBASE

| Metric | Value | Notes |
|--------|-------|-------|
| **Main Renderer** | 7,393 lines | src/renderer/app.js (monolith) |
| **Popout System** | 1,000+ lines | 5 popout types (sidebar, terminal, editor, preview, refs) |
| **Main Process** | 300+ lines | main.js (100+ IPC handlers) |
| **Preload API** | 104 channels | Context bridge definitions |
| **Data Format** | .charx ZIP | charx-io.js (300+ lines) |
| **Tests** | ❌ ZERO | No unit/integration tests; manual test files only |
| **Build Tool** | ❌ None | Currently no bundler (files served raw) |
| **CSS** | 1 file | Inline styles in index.html (global, no scoping) |
| **Editor** | Monaco | Async loaded from CDN via require.config |
| **Terminal** | xterm.js | 5.5.0 with node-pty |
| **UI Framework** | None | Pure vanilla JS DOM manipulation |

---

## 📊 COMPONENT BREAKDOWN (app.js → Vue Components)

**Tab System**: openTabs[], activeTabId, updateTabUI()  
→ **EditorTabs.vue** + **useEditorStore()** (Pinia)  
Complexity: ⭐⭐ | Risk: LOW | Effort: 1 day

**Sidebar Tree**: buildSidebar() 2000+ lines  
→ **SidebarTree.vue**, **TreeItem.vue**, **TreeFolder.vue** (recursive)  
Complexity: ⭐⭐⭐ | Risk: MEDIUM | Effort: 3 days

**Monaco Editor**: createOrSwitchEditor() global instance  
→ **MonacoEditor.vue** + **useMonacoEditor()** composable  
Complexity: ⭐⭐⭐ | Risk: HIGH | Effort: 2 days

**Form Editors**: showLoreEditor(), showRegexEditor()  
→ **LoreEditor.vue**, **RegexEditor.vue** with nested Monaco  
Complexity: ⭐⭐⭐⭐ | Risk: HIGH | Effort: 2 days

**Terminal**: initTerminal() + xterm + event listeners  
→ **TerminalPanel.vue**, **ChatView.vue** + **useTerminal()** composable  
Complexity: ⭐⭐⭐⭐ | Risk: HIGH | Effort: 3 days

**Layout System**: layoutState, rebuildLayout(), resizers  
→ **SlotLayout.vue**, **Resizer.vue** + **useLayout()** composable  
Complexity: ⭐⭐⭐⭐ | Risk: HIGH | Effort: 2 days

**Preview Panel**: 1000+ lines with complex engine  
→ **PreviewPanel.vue** + extract **preview-engine.ts** utility  
Complexity: ⭐⭐⭐⭐ | Risk: MEDIUM | Effort: 2 days

**Avatar/BGM**: tokiImg global, bgmAudio, applyDarkMode()  
→ **TokiAvatar.vue**, **BGMControl.vue**, **useDarkMode()** composable  
Complexity: ⭐⭐ | Risk: LOW | Effort: 1 day

**Settings/Modals**: showSettingsPopup(), showHelpPopup()  
→ **SettingsModal.vue**, **HelpModal.vue** (with Teleport)  
Complexity: ⭐⭐ | Risk: LOW | Effort: 1 day

**Context Menu**: showContextMenu(), hideContextMenu()  
→ **ContextMenu.vue** + **useContextMenu()** composable  
Complexity: ⭐⭐ | Risk: LOW | Effort: 1 day

**Status Bar**: setStatus() global  
→ **StatusBar.vue** + **notification store (Pinia)**  
Complexity: ⭐ | Risk: LOW | Effort: 0.5 day

**Menu Bar**: initMenuBar() DOM building  
→ **MenuBar.vue** OR keep as HTML  
Complexity: ⭐ | Risk: LOW | Effort: 0.5 day

**Popout System**: popoutPanel(), dockPanel(), popout.js  
→ **Keep vanilla JS (popout.js)** OR create separate Vue app per popout  
Complexity: ⭐⭐⭐ | Risk: MEDIUM | Effort: 1-2 days

---

## 🔧 TOOLCHAIN SETUP CHECKLIST

### Install New Dependencies
- [ ] vue@^3.3.0
- [ ] vite@^4.5.0 (dev)
- [ ] typescript@^5.3.0 (dev)
- [ ] pinia@^2.1.0
- [ ] @vitejs/plugin-vue@^4.5.0 (dev)
- [ ] vitest@^0.34.0 (dev)
- [ ] jsdom@^22.0.0 (dev)
- [ ] eslint@^8.0.0 (dev)
- [ ] eslint-plugin-vue@^9.0.0 (dev)
- [ ] @typescript-eslint/parser (dev)
- [ ] @typescript-eslint/eslint-plugin (dev)
- [ ] prettier@^3.0.0 (dev)
- [ ] vue-tsc@^1.8.0 (dev)
- [ ] @monaco-editor/loader@^1.3.0

### Create Config Files
- [ ] vite.config.ts
- [ ] vitest.config.ts
- [ ] tsconfig.json (target: ES2020, strict: true)
- [ ] .eslintrc.cjs
- [ ] prettier.config.cjs (optional)
- [ ] tsconfig.node.json (optional)

### Update package.json Scripts
`json
{
  "dev": "vite",
  "build:renderer": "vite build",
  "build:electron": "tsc --outDir dist/electron --module commonjs",
  "build": "npm run build:renderer && npm run build:electron",
  "test": "vitest run",
  "test:watch": "vitest",
  "lint": "eslint src --ext .ts,.vue",
  "type-check": "vue-tsc --noEmit",
  "start": "electron dist/electron/main.js",
  "dist": "npm run build && electron-builder"
}
`

### Update Electron Files
- [ ] Rename main.js → main.ts
- [ ] Rename preload.js → preload.ts
- [ ] Create electron-ipc.ts (IPC type definitions)
- [ ] Create tsconfig.json for Electron output (CJS, commonjs module)

### Create Directory Structure
`
src/
├── main.ts (entry)
├── App.vue (root)
├── index.html (Vite HTML entry)
├── components/
├── stores/
├── composables/
├── lib/
├── types/
├── styles/
└── __tests__/
`

---

## ⚠️ HIGH-RISK AREAS (Mitigation Required)

### 1. ❌ Monaco Editor Lifecycle (CRITICAL)
**Problem**: Global editorInstance + manual dispose = memory leak  
**Mitigation**: 
- Create useMonacoEditor() composable
- Implement proper onBeforeUnmount cleanup
- Test: 2-3 open/close cycles without memory growth

### 2. ❌ Form Editor Mini-Monaco Instances (CRITICAL)
**Problem**: formEditors[] array, manual dispose timing  
**Mitigation**: 
- Wrap in <FormEditorContainer> component
- Use v-if to fully unmount/remount
- Test: Rapid form switching

### 3. ❌ Xterm.js + ResizeObserver (CRITICAL)
**Problem**: Terminal ref leak on unmount  
**Mitigation**: 
- Create useTerminal() composable
- Disconnect ResizeObserver in cleanup
- Test: Mount/unmount TerminalPanel 5 times

### 4. ❌ PopoutPanel System (HIGH)
**Problem**: Vue state isolated per window; IPC sync complex  
**Mitigation**: 
- Phase 1: Keep popout.js vanilla (simplest)
- Phase 2: Consider Pinia IPC sync if needed
- Keep popout.html separate until refactored

### 5. ❌ localStorage Coupling (MEDIUM)
**Problem**: Race conditions on first load; timezone issues  
**Mitigation**: 
- Create useLocalStorage() composable
- Debounce writes (500ms)
- Load once on app init

### 6. ❌ Chat Mode Async Timers (MEDIUM)
**Problem**: Race conditions in buffer finalization  
**Mitigation**: 
- Use Pinia mutation guards
- Debounce buffer finalizations
- Test: Rapid chat messages while terminal scrolling

### 7. ❌ Section Parsing (Lua/CSS) (MEDIUM)
**Problem**: Complex regex; easy to break  
**Mitigation**: 
- Move to src/lib/sections.ts
- Add unit tests BEFORE Vue migration
- Test: All existing .charx file examples

---

## 📅 SMALLEST VIABLE VERTICAL SLICE (MVP)

### Phase 1: Infrastructure (Days 1-3)
✅ **Goal**: Vite + Vue 3 app boots, renders stub layout  
- Setup toolchain (configs, scripts)
- Create App.vue shell
- Pinia store skeleton
- Vitest green (1 dummy test)

### Phase 2: Editor (Days 3-5)
✅ **Goal**: Tab system + Monaco integration  
- EditorTabs component
- useMonacoEditor() composable
- useEditorStore() (Pinia)
- Unit tests for store actions

### Phase 3: File I/O (Days 5-7)
✅ **Goal**: Open/save .charx files  
- Typed IPC interfaces
- File menu actions
- Keyboard shortcuts
- Dialog wiring to Electron

### Phase 4: Sidebar (Days 7-10)
✅ **Goal**: Tree rendering from fileData  
- SidebarTree component (recursive)
- TreeItem, TreeFolder components
- Click handlers → open tabs
- Layout store + panel visibility

### Phase 5: Terminal (Days 10-12)
✅ **Goal**: xterm.js + chat UI working  
- TerminalPanel component
- useTerminal() composable
- ChatView + ChatBubble
- Avatar + BGM wiring

### Phase 6: Tests + Cleanup (Days 12-14)
✅ **Goal**: Unit tests + ESLint pass  
- Store tests (editor, layout, ui)
- Lib tests (sections, backup, ansi-stripper)
- Component snapshots (tabs, tree, editor)
- ESLint strict pass
- 50%+ coverage

---

## 🧪 TESTING STRATEGY (Currently 0 Tests)

### Phase 1: Pinia Store Tests
- editor.ts: openTab, closeTab, markDirty, backup
- layout.ts: moveItems, updateSlotSize, restoreLayout
- ui.ts: toggleDarkMode, setRPMode, setTheme
- terminal.ts: appendData, finalizeChatMessage

**Target**: 20-30 tests, 60%+ coverage

### Phase 2: Lib/Utility Tests
- sections.ts: parseLuaSections, parseCssSections (critical!)
- backup.ts: createBackup, restoreBackup, maxBackups
- ansi-stripper.ts: stripAnsi, cleanTuiOutput
- charx-io.ts: readCharx, writeCharx (if needed)

**Target**: 30-50 tests, 70%+ coverage

### Phase 3: Component Tests
- EditorTabs: tab rendering, click, close, reorder
- SidebarTree: tree building, folder expansion, item click
- MonacoEditor: create/dispose, content sync, language switch
- TerminalPanel: mount/unmount, xterm disposal
- ChatView: message rendering, choice buttons

**Target**: 20-30 tests, 50%+ component coverage

### Phase 4: E2E Smoke Tests (Optional)
- Open file → render sidebar items
- Click item → open tab → edit → Monaco content changes
- Save → verify file written via IPC
- Terminal → send input → output appears

**Target**: 3-5 smoke tests, happy path coverage

---

## 📈 COMPLEXITY & EFFORT MATRIX

| Component | Complexity | Effort (days) | Risk | Priority |
|-----------|-----------|---------------|------|----------|
| Menu/Status bar | ⭐ | 0.5 | LOW | 6 |
| Avatar/BGM | ⭐⭐ | 1 | LOW | 7 |
| Settings/Help | ⭐⭐ | 1 | LOW | 8 |
| Tabs | ⭐⭐ | 1 | LOW | 2 |
| Editor (Monaco) | ⭐⭐⭐ | 2 | HIGH | 3 |
| Sidebar (Tree) | ⭐⭐⭐ | 3 | MEDIUM | 4 |
| Layout (Slots) | ⭐⭐⭐⭐ | 2 | HIGH | 5 |
| Forms (Lore/Regex) | ⭐⭐⭐⭐ | 2 | HIGH | 9 |
| Terminal (xterm) | ⭐⭐⭐⭐ | 3 | HIGH | 10 |
| Preview Engine | ⭐⭐⭐⭐ | 2 | MEDIUM | 11 |
| Tests (overall) | ⭐⭐⭐ | 3 | MEDIUM | 12 |

**Total Estimated Effort: 20 person-days (4 weeks @ 5 days/week)**

---

## ✅ MIGRATION READINESS CHECKLIST

### Pre-Migration
- [ ] Backup current codebase (git branch)
- [ ] Document all custom IPC handlers (100+)
- [ ] List all HTML/CSS files for migration
- [ ] Review test/ directory (understand manual tests)
- [ ] Identify popout window dependencies

### Phase 1: Setup
- [ ] Install Vite + Vue 3 + TypeScript
- [ ] Create vite.config.ts, tsconfig.json
- [ ] Create src/ directory structure
- [ ] Create App.vue (stub)
- [ ] Create Pinia store files (empty)
- [ ] Add build scripts to package.json
- [ ] Verify 
pm run dev works

### Phase 2-5: Feature Migration
- [ ] Migrate tabs system
- [ ] Migrate editor + Monaco
- [ ] Migrate file I/O
- [ ] Migrate sidebar tree
- [ ] Migrate terminal
- [ ] Migrate forms
- [ ] Test each phase

### Pre-Release
- [ ] All components rendering
- [ ] All IPC handlers working
- [ ] ESLint --fix passes
- [ ] npm run test passes (50%+ coverage)
- [ ] npm run build succeeds
- [ ] Electron packaging works
- [ ] Manual smoke test on Windows
- [ ] README updated

---

## 🚀 GETTING STARTED (Next Steps)

### 1. Read This First
- [ ] Read MIGRATION_PLAN_SUMMARY.md (architecture + timeline)
- [ ] Read MIGRATION_CODE_EXAMPLES.md (concrete code patterns)

### 2. Start Phase 1 (Infrastructure)
`ash
# Install dependencies
npm install vue vite typescript pinia @vitejs/plugin-vue

# Create vite.config.ts (see MIGRATION_CODE_EXAMPLES.md)
# Create tsconfig.json
# Create src/main.ts, src/App.vue, src/index.html

# Test
npm run dev
# Browser should load at http://localhost:5173
`

### 3. Start Phase 2 (Editor)
`ash
# Create src/stores/editor.ts
# Create src/components/EditorTabs.vue
# Create src/composables/useMonacoEditor.ts
# Create src/__tests__/unit/stores/editor.test.ts

# Test
npm run test
npm run dev
# Should see EditorTabs rendering
`

### 4. Continue Phases 3-6
- Follow MIGRATION_PLAN_SUMMARY.md phases
- Reference MIGRATION_CODE_EXAMPLES.md for patterns
- Run tests continuously: 
pm run test:watch

---

## 📚 ADDITIONAL RESOURCES

**Current Codebase**:
- app.js: 7,393 lines (main renderer logic)
- popout.js: 1,000+ lines (popout window builders)
- main.js: 300+ lines (Electron main process)
- charx-io.js: 300+ lines (file format)
- preview-engine.js: 500+ lines (preview rendering)

**Vue 3 Docs**: https://vuejs.org/  
**Vite Docs**: https://vitejs.dev/  
**Pinia Docs**: https://pinia.vuejs.org/  
**Vitest Docs**: https://vitest.dev/  
**Monaco Docs**: https://microsoft.github.io/monaco-editor/

---

## 📞 QUICK REFERENCE: Key Files After Migration

| Old File | New File(s) | Type |
|----------|-------------|------|
| src/renderer/app.js | src/components/, src/stores/, src/composables/ | SPLIT |
| src/renderer/popout.js | src/popout/ (keep vanilla) | KEEP |
| src/renderer/app.css | src/styles/ | SPLIT |
| src/lib/charx-io.js | src/lib/charx-io.ts | COPY |
| src/lib/preview-engine.js | src/lib/preview-engine.ts | COPY |
| main.js | main.ts | RENAME |
| preload.js | preload.ts | RENAME |
| index.html | src/index.html | MOVE |
| N/A | src/main.ts | CREATE |
| N/A | vite.config.ts | CREATE |
| N/A | vitest.config.ts | CREATE |
| N/A | tsconfig.json | CREATE |

---

**Generated with ❤️ for RisuToki migration to Vue 3 + Vite + TypeScript**

