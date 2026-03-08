# Asset URL/Path Resolution Analysis - RisuToki

## Current State Summary

### Centralized Asset Resolution (✓ Good)
File: src/lib/asset-runtime.ts (23 lines)
- Provides two main functions:
  - **getVendorAssetUrl()** - Maps relative paths to ./vendor/* urls
  - **getMediaAssetUrl()** - Maps relative paths to ./app-assets/* urls
  - Exports aliases: toVendorAsset, toMediaAsset
- Uses window.location.href as base for URL construction
- Normalizes leading './' in paths

### Usage Distribution

#### Files importing from asset-runtime:
1. src/app/controller.js
2. src/popout/controller.js
3. src/lib/script-loader.ts
4. src/lib/terminal-ui.ts

#### Asset Resolution Pattern Duplications:

1. **Monaco Editor Setup** - DUPLICATED LOGIC (2 copies)
   Location: src/app/controller.js:409-424 AND src/popout/controller.js:601-620
   
   Pattern:
   - Resolve monacoPath = toVendorAsset('monaco-editor/min/vs')
   - Create script element, set src = \\/loader.js\
   - On load: require.config({ paths: { vs: monacoPath } })
   - Require vs/editor/editor.main module

2. **Media Asset Definitions** - LIGHT DUPLICATION
   - app/controller.js: 6 image/audio assets using toMediaAsset()
   - popout/controller.js: 2 image assets using toMediaAsset()
   - No shared constants between them

3. **Vendor Asset Usage Pattern** - WELL CENTRALIZED
   - script-loader.ts: wasmoon, xterm css/js
   - terminal-ui.ts: xterm js, addon-fit
   - Both properly use toVendorAsset()

### Build Configuration
File: ite.config.ts - Static asset copy targets hardcoded:
- monaco-editor → vendor/monaco-editor/min/vs
- @xterm items → vendor/@xterm/*
- wasmoon → vendor/wasmoon/dist
- app assets → app-assets

## Issues Identified

### 1. **Monaco Loading Logic Duplication (PRIMARY)**
   - Identical promise-wrapper + require.config pattern in 2 places
   - Both files independently manage monacoPath resolution
   - No shared initialization code
   - Risk: Changes to monaco loading must be made in multiple places

### 2. **Lack of Monaco Setup Abstraction**
   - Monaco requires: script loading + require.config + require(['vs/editor/editor.main'])
   - This 3-step sequence is repeated verbatim
   - Each context (app vs popout) handles theme definition separately

### 3. **No Media Asset Constants Registry**
   - Icons, gifs, audio distributed across 2 controller files
   - icon.png used in both places but defined separately
   - Icon_risu.png, Dancing_risu.gif only in app
   - Dancing_toki.gif used in both but referenced independently

### 4. **Script/Stylesheet Loading Management**
   - script-loader.ts handles caching well (loadedScripts Map, loadedStylesheets Set)
   - But Monaco loading in controllers doesn't use this abstraction
   - monaco is loaded differently in app vs popout with different error handling

## Recommendations for Safe Centralization

### RECOMMENDED: Minimal Change - Extract Monaco Loader Function

Create new file: src/lib/monaco-loader.ts

\\\	ypescript
import { toVendorAsset } from './asset-runtime';

export async function loadMonaco(): Promise<void> {
  const monacoPath = toVendorAsset('monaco-editor/min/vs');
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = \\/loader.js\;
    script.onerror = () => reject(new Error('Failed to load Monaco loader'));
    script.onload = () => {
      try {
        require.config({ paths: { vs: monacoPath } });
        require(['vs/editor/editor.main'], () => {
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    };
    document.head.appendChild(script);
  });
}
\\\

Usage in both files becomes:
\\\javascript
import { loadMonaco } from '../lib/monaco-loader';

// In src/app/controller.js line 411:
async function loadMonaco() {
  await (await import('../lib/monaco-loader')).loadMonaco();
  monacoReady = true;
}

// In src/popout/controller.js line 604:
await (await import('../lib/monaco-loader')).loadMonaco();
// (followed by theme definition)
\\\

### OPTIONAL: Extract Media Asset Constants

If managing many image/audio assets, create: src/lib/media-assets.ts

\\\	ypescript
import { getMediaAssetUrl } from './asset-runtime';

export const MEDIA_ASSETS = {
  // Toki
  TOKI_IDLE: getMediaAssetUrl('icon.png'),
  TOKI_DANCING: getMediaAssetUrl('Dancing_toki.gif'),
  TOKI_CUTE: getMediaAssetUrl('toki-cute.gif'),
  
  // Risu
  RISU_IDLE: getMediaAssetUrl('icon_risu.png'),
  RISU_DANCING: getMediaAssetUrl('Dancing_risu.gif'),
  
  // Audio
  USAGI_FLAP: getMediaAssetUrl('Usagi_Flap.mp3'),
} as const;
\\\

**Note:** This adds a file but eliminates scattered definitions.
**Trade-off:** Only worth it if assets grow or change frequently.
**Current state:** With only 6-7 assets, the inline toMediaAsset() calls are acceptable.

### NOT RECOMMENDED: Full Merger of Controllers
- app/controller.js and popout/controller.js have different logic flows
- Merging would increase complexity without clarity benefit
- Keep them separate; just extract shared initialization logic

## Change Impact Analysis

### Low Risk Changes:
✓ Extract loadMonaco() to new module
✓ Both files continue using same approach, just call helper
✓ No behavior change - same require.config, same module loading
✓ Easier to test and maintain in one place

### What Won't Change:
✗ vite.config.ts paths (internal build concern, doesn't affect runtime)
✗ asset-runtime.ts (already centralized)
✗ Individual controller logic flows
✗ Error handling patterns (each can evolve independently)

## Testing Recommendations

After extracting monaco-loader.ts:
1. Run existing tests - should all pass
2. Test app/controller.js monaco initialization
3. Test popout/controller.js monaco initialization
4. Verify editor loads and themes apply correctly

## Summary

**Current state:** Good centralization at asset-runtime level, but Monaco loading logic duplicated.

**Smallest safe change:** Extract 3-step monaco initialization sequence to src/lib/monaco-loader.ts

**Size:** ~20 lines added, ~5 lines removed from each controller (net -10 lines, cleaner)

**Benefit:** Single source of truth for Monaco setup, easier to modify/debug in future

**Risk:** Very low - Pure extraction, no behavior changes
