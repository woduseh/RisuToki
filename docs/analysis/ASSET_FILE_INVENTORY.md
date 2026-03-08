# Asset Resolution: File Inventory & Dependencies

## Current Files Involved in Asset URL/Path Resolution

### Core Asset Infrastructure

**src/lib/asset-runtime.ts** (23 lines) ⭐ FOUNDATION
├─ Purpose: Centralized URL construction for vendor and media assets
├─ Exports:
│  ├─ getVendorAssetUrl(relativePath): Maps to ./vendor/*
│  ├─ getMediaAssetUrl(relativePath): Maps to ./app-assets/*
│  ├─ toVendorAsset(): Alias for getVendorAssetUrl
│  ├─ toMediaAsset(): Alias for getMediaAssetUrl
│  └─ Helper functions: isDarkModeEnabled(), getTalkTitle()
├─ Dependencies: None (pure utility)
└─ Used by: 4+ files (script-loader, terminal-ui, controllers)

**src/lib/asset-runtime.test.ts** (22 lines) ✓ TESTS
├─ Purpose: Validates asset URL resolution
├─ Tests:
│  ├─ Vendor asset path resolution
│  ├─ Media asset path resolution
│  └─ Dark mode detection
└─ Coverage: asset-runtime.ts functions

---

### Script Loading Abstractions

**src/lib/script-loader.ts** (53 lines) ✓ WELL-DESIGNED
├─ Purpose: Load external scripts and stylesheets with caching
├─ Exports:
│  ├─ loadScript(src, parent): Loads JS with promise
│  ├─ ensureStylesheet(href, key): Loads CSS with cache
│  ├─ ensureWasmoon(): Loads wasmoon.js using toVendorAsset
│  └─ ensureXtermAssets(): Loads xterm CSS using toVendorAsset
├─ Key Pattern: Uses toVendorAsset() internally
├─ Caching: Map<src, Promise> for scripts, Set for stylesheets
└─ Status: ✓ No duplication, properly abstracted

**src/lib/terminal-ui.ts** (200+ lines) ✓ WELL-DESIGNED
├─ Purpose: Terminal emulator UI initialization
├─ Script Usage:
│  ├─ Calls loadScript(toVendorAsset('@xterm/xterm/lib/xterm.js'))
│  ├─ Calls loadScript(toVendorAsset('@xterm/addon-fit/lib/addon-fit.js'))
│  └─ Uses ensureXtermAssets() from script-loader
└─ Status: ✓ Properly delegates to abstractions

---

### Controllers (UI Logic)

**src/app/controller.js** (1500+ lines) ⚠️ DUPLICATION FOUND
├─ Purpose: Main app window controller
├─ Asset Usage:
│  ├─ Line 105: toMediaAsset('Usagi_Flap.mp3')
│  ├─ Lines 250-254: 5 avatar image constants
│  │  ├─ RISU_IDLE: toMediaAsset('icon_risu.png')
│  │  ├─ RISU_DANCING: toMediaAsset('Dancing_risu.gif')
│  │  ├─ TOKI_IDLE: toMediaAsset('icon.png')
│  │  ├─ TOKI_CUTE: toMediaAsset('toki-cute.gif')
│  │  └─ TOKI_DANCING: toMediaAsset('Dancing_toki.gif')
│  ├─ Lines 409-424: loadMonaco() FUNCTION ⚠️ DUPLICATED
│  │  └─ ~16 lines, identical to popout version
│  └─ Line 416: require.config({ paths: { vs: monacoPath } })
├─ Issues:
│  ├─ Monaco loader not abstracted
│  ├─ toMediaAsset() called inline 6 times
│  └─ No shared media asset constants
└─ Recommendation: Extract monaco-loader.ts

**src/popout/controller.js** (800+ lines) ⚠️ DUPLICATION FOUND
├─ Purpose: Popout windows controller
├─ Asset Usage:
│  ├─ Line 82: toMediaAsset('icon.png') in template
│  ├─ Lines 204-205: 2 avatar image constants
│  │  ├─ IDLE_IMG: toMediaAsset('icon.png')
│  │  └─ DANCING_IMG: toMediaAsset('Dancing_toki.gif')
│  ├─ Lines 601-620: Monaco initialization ⚠️ DUPLICATED
│  │  └─ ~20 lines, nearly identical to app version
│  └─ Line 605: require.config({ paths: { vs: monacoPath } })
├─ Issues:
│  ├─ Icon.png referenced twice (line 82, 204)
│  ├─ Dancing_toki.gif referenced twice (line 205, also in app)
│  ├─ Monaco loader duplicated from app/controller.js
│  └─ Different inline vs constant usage patterns
└─ Recommendation: Extract monaco-loader.ts

---

### Build Configuration

**vite.config.ts** (67 lines) ✓ CENTRALIZED
├─ Purpose: Vite build configuration
├─ Static Asset Copy (lines 13-43):
│  ├─ Target 1: node_modules/monaco-editor → dist/vendor/monaco-editor
│  ├─ Target 2: @xterm CSS → dist/vendor/@xterm/xterm/css
│  ├─ Target 3: @xterm JS → dist/vendor/@xterm/xterm/lib
│  ├─ Target 4: addon-fit → dist/vendor/@xterm/addon-fit/lib
│  ├─ Target 5: wasmoon → dist/vendor/wasmoon/dist
│  └─ Target 6: assets → dist/app-assets
├─ Key Points:
│  ├─ Paths hardcoded here; matched at runtime via asset-runtime.ts
│  ├─ No duplication (single source of truth for build)
│  └─ assets folder list: icon.png, icon_risu.png, Dancing_risu.gif, etc.
└─ Status: ✓ Good design

---

### Proposed New File

**src/lib/monaco-loader.ts** (PROPOSED - 35 lines)
├─ Purpose: Encapsulate 3-step Monaco initialization
├─ Function: async loadMonaco(): Promise<void>
├─ Internal Steps:
│  1. Get monacoPath via toVendorAsset()
│  2. Load <script> tag with loader.js
│  3. Configure require.config with monacoPath
│  4. require(['vs/editor/editor.main'], ...)
├─ Error Handling: Reject on script load failure, try/catch for require
├─ Usage: 
│  └─ Replace lines 409-424 in app/controller.js
│  └─ Replace lines 601-620 in popout/controller.js
└─ Benefit: Single source of truth for Monaco setup

---

## Asset File Locations (Runtime)

### Vendor Assets (in dist/vendor after build)
`
dist/vendor/
├─ monaco-editor/min/vs/
│  ├─ loader.js
│  ├─ editor.main.js
│  ├─ editor.main.css
│  └─ ... (many more files)
├─ @xterm/
│  ├─ xterm/
│  │  ├─ css/xterm.css
│  │  └─ lib/xterm.js
│  └─ addon-fit/
│     └─ lib/addon-fit.js
└─ wasmoon/
   └─ dist/index.js
`

### Media Assets (in dist/app-assets after build)
`
dist/app-assets/
├─ icon.png (used in app + popout)
├─ icon_risu.png (used in app)
├─ Dancing_risu.gif (used in app)
├─ Dancing_toki.gif (used in app + popout)
├─ toki-cute.gif (used in app)
└─ Usagi_Flap.mp3 (used in app)
`

---

## Dependency Graph

\\\
vite.config.ts
  └─> (build time) copies vendor/ and app-assets/

asset-runtime.ts ⭐ FOUNDATION
  ├─> script-loader.ts (uses toVendorAsset)
  ├─> terminal-ui.ts (uses toVendorAsset)
  ├─> app/controller.js (uses toMediaAsset, toVendorAsset)
  ├─> popout/controller.js (uses toMediaAsset, toVendorAsset)
  └─> [PROPOSED] monaco-loader.ts (uses toVendorAsset)

script-loader.ts
  └─> used by app/controller.js (calls ensureWasmoon, ensureStylesheet)

terminal-ui.ts
  └─> used by app/controller.js, popout/controller.js

[PROPOSED] monaco-loader.ts
  └─> will be used by both controllers
\\\

---

## Change Impact Map

### Files to Create:
- [ ] src/lib/monaco-loader.ts (+35 lines)

### Files to Modify:
- [ ] src/app/controller.js (replace lines 409-424: -16 lines, +3 lines)
- [ ] src/popout/controller.js (replace lines 601-620: -20 lines, +2 lines)

### Files to NOT Touch:
- [ ] src/lib/asset-runtime.ts (already good)
- [ ] src/lib/asset-runtime.test.ts (already good)
- [ ] src/lib/script-loader.ts (already good)
- [ ] src/lib/terminal-ui.ts (already good)
- [ ] vite.config.ts (no changes needed)

### Files Affected Indirectly:
- [ ] test files (may need to verify asset loading still works)
- [ ] dist/ (rebuilt with same output)

---

## Metrics Before/After

### Code Organization
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total lines in controllers | 2300+ | 2280+ | -20 |
| Monaco setup locations | 2 | 1 | -1 |
| Unique Monaco loader versions | 2 | 1 | -50% |
| Asset loading functions | 2 (asset-runtime) | 3 (+ monaco-loader) | +1 |

### Quality Indicators
| Metric | Before | After |
|--------|--------|-------|
| Code duplication | 16 lines | 0 lines |
| Error handling | None | Present |
| Testability | Controller-dependent | Independent |
| Maintainability | Medium | High |

---

## Summary

**Well-Designed:**
✓ asset-runtime.ts - Clean, single responsibility
✓ script-loader.ts - Abstractions with caching
✓ terminal-ui.ts - Proper delegation
✓ vite.config.ts - Centralized build config

**Needs Improvement:**
✗ app/controller.js - Monaco init logic embedded
✗ popout/controller.js - Monaco init logic duplicated

**Proposed Solution:**
→ Create src/lib/monaco-loader.ts to eliminate duplication

