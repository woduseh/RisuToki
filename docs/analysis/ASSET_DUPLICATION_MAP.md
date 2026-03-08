# Detailed Asset URL Duplication Map

## 1. MONACO EDITOR INITIALIZATION - EXACT DUPLICATION

### Location 1: src/app/controller.js (Lines 409-424)
\\\javascript
// ==================== Monaco Loader ====================
const monacoPath = toVendorAsset('monaco-editor/min/vs');

function loadMonaco() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = \\/loader.js\;
    script.onload = () => {
      require.config({ paths: { vs: monacoPath } });
      require(['vs/editor/editor.main'], () => {
        monacoReady = true;
        resolve();
      });
    };
    document.head.appendChild(script);
  });
}
\\\

### Location 2: src/popout/controller.js (Lines 601-620)
\\\javascript
  // Load Monaco
  const monacoPath = toVendorAsset('monaco-editor/min/vs');
  const loaderScript = document.createElement('script');
  loaderScript.src = \\/loader.js\;
  loaderScript.onload = () => {
    require.config({ paths: { vs: monacoPath } });
    require(['vs/editor/editor.main'], () => {
      // Define theme
      monaco.editor.defineTheme('blue-archive', {
        // ... theme definition
      });
      // ... editor creation
    });
  };
  document.head.appendChild(loaderScript);
\\\

### Pattern Analysis
| Aspect | App | Popout | Status |
|--------|-----|--------|--------|
| monacoPath resolution | toVendorAsset('monaco-editor/min/vs') | toVendorAsset('monaco-editor/min/vs') | ✓ Same |
| Script element creation | document.createElement('script') | document.createElement('script') | ✓ Identical |
| Loader src pattern | \\/loader.js\ | \\/loader.js\ | ✓ Identical |
| require.config call | { paths: { vs: monacoPath } } | { paths: { vs: monacoPath } } | ✓ Identical |
| require module | ['vs/editor/editor.main'] | ['vs/editor/editor.main'] | ✓ Identical |
| Error handling | None | None | ✗ Missing in both |
| Context after load | monacoReady = true | monaco.editor.defineTheme() | ✓ Different (acceptable) |

## 2. MEDIA ASSET DEFINITIONS - SCATTERED USAGE

### In app/controller.js (Lines 103-107, etc.)
\\\javascript
const bgmPath = settingsSnapshot.bgmPathOverride
  ? toMediaAsset('Usagi_Flap.mp3')      // Line 105
  : storedBgmPath;

const RISU_IDLE = toMediaAsset('icon_risu.png');     // Line ~250
const RISU_DANCING = toMediaAsset('Dancing_risu.gif'); // Line ~251
const TOKI_IDLE = toMediaAsset('icon.png');          // Line ~252
const TOKI_CUTE = toMediaAsset('toki-cute.gif');     // Line ~253
const TOKI_DANCING = toMediaAsset('Dancing_toki.gif'); // Line ~254
\\\

### In popout/controller.js (Lines 82, 204-205)
\\\javascript
// Line 82 - inline in HTML
\<img id="popout-avatar-img" src="\">\\

// Lines 204-205 - constants
const IDLE_IMG = toMediaAsset('icon.png');            // Duplicates TOKI_IDLE
const DANCING_IMG = toMediaAsset('Dancing_toki.gif'); // Duplicates TOKI_DANCING
\\\

### Issues
- icon.png referenced in both files but no shared constant
- Dancing_toki.gif referenced in both files separately
- Inline usage (line 82 popout) vs constant usage (lines 204-205 popout)
- Total: 7 media assets, scattered across 2 files, 3 duplicated file references

## 3. VENDOR ASSET USAGE - WELL CENTRALIZED

### Good Pattern: script-loader.ts
\\\	ypescript
export async function ensureWasmoon(): Promise<void> {
  const runtimeWindow = window as Window & { wasmoon?: unknown };
  if (runtimeWindow.wasmoon) return;

  if (!wasmoonLoadPromise) {
    wasmoonLoadPromise = loadScript(toVendorAsset('wasmoon/dist/index.js'));
  }

  await wasmoonLoadPromise;
}

export function ensureXtermAssets(): void {
  ensureStylesheet(toVendorAsset('@xterm/xterm/css/xterm.css'), '@xterm/xterm/css');
}
\\\

### Good Pattern: terminal-ui.ts
\\\	ypescript
export async function initializeTerminalUi(options: TerminalUiOptions): Promise<TerminalUiHandle> {
  // Uses script-loader functions which internally use toVendorAsset()
  await loadScript(toVendorAsset('@xterm/xterm/lib/xterm.js'));
  await loadScript(toVendorAsset('@xterm/addon-fit/lib/addon-fit.js'));
}
\\\

Status: ✓ No duplication, centralized through script-loader abstractions

## 4. BUILD CONFIGURATION - ASSET PATHS

### vite.config.ts (Lines 14-41)
\\\	ypescript
viteStaticCopy({
  targets: [
    {
      src: 'node_modules/monaco-editor/min/vs/**/*',
      dest: 'vendor/monaco-editor/min/vs',
    },
    {
      src: 'node_modules/@xterm/xterm/css/xterm.css',
      dest: 'vendor/@xterm/xterm/css'
    },
    {
      src: 'node_modules/@xterm/xterm/lib/xterm.js',
      dest: 'vendor/@xterm/xterm/lib'
    },
    {
      src: 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
      dest: 'vendor/@xterm/addon-fit/lib'
    },
    {
      src: 'node_modules/wasmoon/dist/index.js',
      dest: 'vendor/wasmoon/dist'
    },
    {
      src: 'assets/{icon.png,icon_risu.png,Dancing_risu.gif,Dancing_toki.gif,toki-cute.gif,Usagi_Flap.mp3}',
      dest: 'app-assets'
    }
  ]
})
\\\

Status: ✓ Centralized build config, no duplication

## Summary Table

| Category | Issue | Severity | Files Affected | Line Count Duplicated |
|----------|-------|----------|-----------------|----------------------|
| Monaco Setup | 3-step init duplicated | HIGH | 2 | ~16 lines (nearly identical) |
| Media Assets | Scattered references | MEDIUM | 2 | icon.png (2x), Dancing_toki.gif (2x) |
| Vendor Setup | Well abstracted | LOW | 2 | 0 (uses shared functions) |
| Build Config | Centralized | N/A | 1 | 0 (no runtime duplication) |

