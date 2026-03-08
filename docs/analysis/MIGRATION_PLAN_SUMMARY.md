# RisuToki: Vue 3 + Vite + TypeScript Migration Plan

## EXECUTIVE SUMMARY
**Current State**: Vanilla JavaScript (94KB app.js) + Electron + Monaco editor  
**Target State**: Vue 3 + Vite + TypeScript with modular component architecture  
**Migration Complexity**: High (monolithic renderer to component-based)  
**Estimated Effort**: 3-4 weeks for functional app + tests  
**Test Status**: Zero existing tests (manual test files exist)

---

## 1. CURRENT RUNTIME ARCHITECTURE

### Electron Structure
- **main.js**: Electron main process (300+ lines, 100+ IPC handlers)
- **preload.js**: Context bridge API (104 IPC endpoints exposed)
- **popout-preload.js**: Separate preload for 5 popout window types
- **toki-mcp-server.js**: MCP server integrated into main

### Renderer (Current: 7,393 line monolith)

**Key Components in app.js**:
- State Management: fileData, openTabs[], layoutState (localStorage)
- Tab System: Tab creation, switching, dirty tracking, backup store
- Editor: Monaco integration, form editors (Lore, Regex), image viewer
- Sidebar: Tree building (2000+ line buildSidebar function)
- Terminal: xterm.js + node-pty integration, chat mode UI
- Layout: 6-slot panel system with draggable resizers
- Popout System: Window creation/docking logic
- UI Controllers: Menu, dark mode, BGM, avatar, settings modal, preview panel

**Styling**: 
- Single index.html with inline CSS
- CSS variables for theming (--text-primary, --accent, --border-color, etc.)
- Global styles (no component scoping)

---

## 2. COMPONENT ARCHITECTURE MAP

### Vue 3 Component Structure

| Responsibility | Current Function | → Vue Component(s) | Data Store | Complexity |
|---|---|---|---|---|
| **Tab Management** | openTabs[], updateTabUI() | EditorTabs, TabBar | editor | ⭐⭐ |
| **Sidebar Tree** | buildSidebar() 2000+ lines | SidebarTree, TreeItem, TreeFolder | editor | ⭐⭐⭐ |
| **Monaco Editor** | createOrSwitchEditor() | MonacoEditor (wrapper) | editor | ⭐⭐⭐ |
| **Form Editors** | showLoreEditor(), showRegexEditor() | LoreEditor, RegexEditor | editor | ⭐⭐⭐⭐ |
| **Image Viewer** | showImageViewer() | ImageViewer | editor | ⭐⭐ |
| **Terminal (xterm)** | initTerminal() | TerminalPanel | terminal | ⭐⭐⭐⭐ |
| **Chat UI** | chatMode, chatMessages[] | ChatView, ChatBubble | terminal | ⭐⭐⭐ |
| **Layout System** | layoutState, rebuildLayout() | SlotLayout, Resizer | layout | ⭐⭐⭐⭐ |
| **Avatar/BGM** | tokiImg, bgmAudio | TokiAvatar, BGMControl | ui | ⭐⭐ |
| **Settings/Modals** | showSettingsPopup() | SettingsModal, HelpModal | ui | ⭐⭐ |
| **Preview Panel** | showPreviewPanel() 1000+ lines | PreviewPanel | (engine util) | ⭐⭐⭐⭐ |
| **Context Menu** | showContextMenu() | ContextMenu (teleport) | ui | ⭐⭐ |
| **Status Bar** | setStatus() | StatusBar | notification | ⭐ |
| **Menu Bar** | initMenuBar() | MenuBar (or keep HTML) | ui | ⭐ |

### Pinia Stores

**editor.ts** (Tab, file, backup management)
**layout.ts** (Panel positions, resizers)
**ui.ts** (Dark mode, theme, RP mode)
**terminal.ts** (Terminal state, chat)
**file.ts** (File I/O operations)
**notification.ts** (Status bar)

---

## 3. ELECTRON MAIN/PRELOAD CHANGES

### Keep in Electron (Process-Level)
- main.ts: All file/system operations, IPC handlers, window management
- preload.ts: Context bridge (expose tokiAPI, popoutAPI)

### Modernize (Convert to TypeScript)
- Rename main.js → main.ts
- Rename preload.js → preload.ts  
- Create electron-ipc.ts with typed interfaces
- Update tsconfig.json for Node 18+ output

### No Breaking Changes
- IPC channel names stay the same
- Handler signatures compatible with existing UI
- Backward compatible with current packaging

---

## 4. TOOLCHAIN SETUP

### package.json Scripts
`json
{
  "scripts": {
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
}
`

### Key Dependencies
**Add**: vue, vite, typescript, pinia, vitest, jsdom, @vitejs/plugin-vue, @monaco-editor/loader, eslint, prettier, vue-tsc

**Keep**: electron, electron-builder, adm-zip, node-pty, wasmoon, xterm, @xterm/addon-fit

**Remove**: N/A (no bundler currently)

### Config Files
- vite.config.ts (source map, outDir, build optimization)
- vitest.config.ts (environment: jsdom, globals: true)
- tsconfig.json (target: ES2020, strict: true)
- .eslintrc.cjs (vue3 + typescript recommended)

---

## 5. HIGH-RISK AREAS & MITIGATION

### ⚠️ CRITICAL

**1. Monaco Editor Lifecycle**
Risk: Global editorInstance + manual dispose = memory leaks
Mitigation: useMonacoEditor() composable with onMounted/onBeforeUnmount cleanup

**2. Form Editor Mini-Monaco Instances**
Risk: formEditors[] array management + dispose timing
Mitigation: Wrap in <FormEditorContainer> with lifecycle hooks

**3. Xterm.js + ResizeObserver**
Risk: Terminal ref leak on unmount
Mitigation: useTerminal() composable with full cleanup

**4. PopoutPanel System (Multi-window)**
Risk: Vue state isolated per window; hard to sync
Mitigation: Keep popout.js vanilla (no Vue); use IPC for state sync

**5. Section Parsing (Lua/CSS)**
Risk: Complex regex patterns; easy to break
Mitigation: Add unit tests BEFORE refactoring

**6. localStorage Coupling**
Risk: Race conditions, timezone issues
Mitigation: useLocalStorage() composable with debounce

**7. Chat Mode Async Timers**
Risk: Race conditions in buffer finalization
Mitigation: Pinia mutations with atomic guards

---

## 6. SMALLEST VIABLE VERTICAL SLICE

### Phase 1: Infrastructure (Days 1-3)
1. Vite skeleton + Vue 3 app
2. Pinia stores (editor, layout, ui)
3. App.vue layout wrapper
4. Vitest + ESLint green

**Exit**: 
pm run dev starts; app renders

### Phase 2: Editor (Days 3-5)
1. EditorTabs component
2. useMonacoEditor() composable
3. Store mutations for openTab/closeTab/markDirty
4. Unit tests for editor store

**Exit**: Open/switch tabs; edit Monaco content

### Phase 3: File I/O (Days 5-7)
1. Typed IPC interfaces
2. File menu actions (New, Open, Save, SaveAs)
3. Keyboard shortcuts composable
4. Dialog integration

**Exit**: Open .charx file → view tabs

### Phase 4: Sidebar (Days 7-10)
1. Sidebar tree component (recursive)
2. Tree item building from fileData
3. Click handlers → open tabs
4. Layout store + panel visibility

**Exit**: Click sidebar items → open in editor

### Phase 5: Terminal (Days 10-12)
1. TerminalPanel component
2. useTerminal() composable
3. Chat mode UI (bubbles, input)
4. Avatar + BGM wiring

**Exit**: Terminal output visible; chat mode toggles

### Phase 6: Forms + Tests (Days 12-14)
1. LoreEditor, RegexEditor components
2. Form validation tests
3. Preview panel
4. Coverage audit

**Exit**: All major features working; 50%+ test coverage

---

## 7. DIRECTORY STRUCTURE (TARGET)

`
src/
├── main.ts
├── App.vue
├── index.html
├── components/
│   ├── panels/
│   │   ├── EditorPanel.vue
│   │   ├── SidebarPanel.vue
│   │   ├── TerminalPanel.vue
│   │   └── AvatarPanel.vue
│   ├── editors/
│   │   ├── MonacoEditor.vue
│   │   ├── LoreEditor.vue
│   │   ├── RegexEditor.vue
│   │   └── ImageViewer.vue
│   ├── sidebar/
│   │   ├── SidebarTree.vue
│   │   ├── TreeItem.vue
│   │   └── TreeFolder.vue
│   ├── terminal/
│   │   ├── TerminalView.vue
│   │   ├── ChatView.vue
│   │   └── ChatBubble.vue
│   ├── layout/
│   │   ├── SlotLayout.vue
│   │   └── Resizer.vue
│   └── common/
│       ├── ContextMenu.vue
│       ├── StatusBar.vue
│       ├── SettingsModal.vue
│       └── MenuBar.vue
├── stores/
│   ├── editor.ts
│   ├── layout.ts
│   ├── ui.ts
│   ├── terminal.ts
│   ├── file.ts
│   └── notification.ts
├── composables/
│   ├── useMonacoEditor.ts
│   ├── useTerminal.ts
│   ├── useLayout.ts
│   ├── useDarkMode.ts
│   ├── useKeyboardShortcuts.ts
│   └── ...
├── lib/
│   ├── sections.ts (parseLuaSections, parseCssSections)
│   ├── backup.ts
│   ├── preview-engine.ts
│   ├── charx-io.ts
│   └── ansi-stripper.ts
├── types/
│   ├── electron-ipc.ts
│   ├── charx.ts
│   └── index.ts
├── styles/
│   ├── index.css
│   ├── variables.css
│   ├── layout.css
│   └── components/
└── __tests__/
    ├── unit/
    │   ├── stores/
    │   ├── lib/
    │   └── composables/
    └── components/

dist/
├── renderer/                    (Vite output)
│   ├── index.html
│   ├── js/
│   └── assets/
└── electron/                    (TypeScript output)
    ├── main.js
    └── preload.js
`

---

## 8. TESTING STRATEGY (Currently Zero Tests)

### Phase 1: Store Tests
- editor.ts: openTab, closeTab, markDirty, backup
- layout.ts: moveItems, updateSlotSize
- ui.ts: toggleDarkMode, setRPMode

### Phase 2: Lib Tests  
- sections.ts: parseLuaSections, parseCssSections
- backup.ts: createBackup, restoreBackup
- ansi-stripper.ts: stripAnsi output

### Phase 3: Component Tests
- EditorTabs: tab rendering, click handlers
- SidebarTree: tree building, folder expansion
- MonacoEditor: content sync, language switching

### Phase 4: E2E (Smoke Tests)
- Open file → render sidebar
- Click item → open tab → edit
- Save → verify charx file

**Target Coverage**: 50-60% unit + 5-10% E2E

---

## 9. TIMELINE & MILESTONES

**Week 1**: Foundation + Editor
- Setup toolchain ✓
- Tab management ✓
- Monaco integration ✓

**Week 2**: File I/O + Sidebar
- File operations ✓
- Sidebar tree ✓
- Layout system ✓

**Week 3**: Terminal + Forms
- Terminal/chat ✓
- LoreEditor/RegexEditor ✓
- Tests 50%+ ✓

**Week 4+**: Polish + Production
- ESLint strict pass
- Full test suite
- Electron packaging
- Windows installer

---

## 10. SUMMARY: Risk vs. Effort

| Task | Risk | Effort | Priority |
|------|------|--------|----------|
| Vite + Vue setup | LOW | 1 day | 1 |
| Editor tabs + Monaco | MEDIUM | 2 days | 2 |
| File I/O wiring | LOW | 1 day | 3 |
| Sidebar tree component | HIGH | 3 days | 4 |
| Terminal + chat | HIGH | 3 days | 5 |
| Forms (Lore/Regex) | HIGH | 2 days | 6 |
| Tests + coverage | MEDIUM | 3 days | 7 |
| TypeScript Electron | LOW | 1 day | 8 |

**Total: 3-4 weeks for functional MVP, 6-8 weeks for production-ready**

