# QUICK REFERENCE: Asset URL Resolution Analysis

## The Problem (In One Sentence)
Monaco Editor initialization is duplicated identically in 2 files (16 lines each).

## The Solution (In One Sentence)
Extract Monaco loading logic to new src/lib/monaco-loader.ts (~35 lines).

## Impact
- Eliminates 16 lines of duplication
- Zero behavioral changes
- 30 minutes to implement
- Risk: VERY LOW

---

## Files & Line Numbers

### Duplication Location 1:
**File:** src/app/controller.js
**Lines:** 409-424 (16 lines)
**Code:** Monaco loader function
**Status:** Needs extraction

### Duplication Location 2:
**File:** src/popout/controller.js
**Lines:** 601-620 (20 lines)
**Code:** Inline Monaco initialization
**Status:** Needs extraction

### Foundation (GOOD):
**File:** src/lib/asset-runtime.ts
**Lines:** 23 total
**Code:** getVendorAssetUrl(), getMediaAssetUrl()
**Status:** ✓ No changes needed

---

## Quick Implementation Steps

1. **Create:** src/lib/monaco-loader.ts
   - Copy the monaco init logic
   - Make it return Promise<void>
   - Add error handling

2. **Update:** src/app/controller.js (line 409)
   - Remove loadMonaco() function
   - Add: import { loadMonaco } from '../lib/monaco-loader'
   - Add 3-line wrapper that sets monacoReady

3. **Update:** src/popout/controller.js (line 601)
   - Remove inline init code
   - Add: await (await import('../lib/monaco-loader')).loadMonaco()
   - Keep theme definition, add error handling

4. **Test:** npm test && npm run build

---

## Duplication Comparison

### IDENTICAL PARTS (both files have these):
✓ monacoPath = toVendorAsset('monaco-editor/min/vs')
✓ document.createElement('script')
✓ script.src = \\/loader.js\
✓ require.config({ paths: { vs: monacoPath } })
✓ require(['vs/editor/editor.main'], ...)
✓ document.head.appendChild(script)

### DIFFERENT PARTS (context-specific):
✗ app: monacoReady = true;
✗ popout: monaco.editor.defineTheme(...)

---

## Files Organized by Role

### Asset Resolution Tier
- asset-runtime.ts → Provides getVendorAssetUrl, getMediaAssetUrl

### Script Loading Tier
- script-loader.ts → Generic script/stylesheet loading with caching
- [NEW] monaco-loader.ts → Monaco-specific 3-step init

### UI Controller Tier
- app/controller.js → Uses asset-runtime + monaco-loader
- popout/controller.js → Uses asset-runtime + monaco-loader

---

## Before/After Code Examples

### BEFORE (app/controller.js lines 409-424):
\\\javascript
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

### AFTER (app/controller.js lines 409-411):
\\\javascript
import { loadMonaco as loadMonacoLib } from '../lib/monaco-loader';

async function loadMonaco() {
  await loadMonacoLib();
  monacoReady = true;
}
\\\

---

## Metrics

| Item | Count |
|------|-------|
| Files with duplication | 2 |
| Lines duplicated | 16 (nearly identical) |
| Media asset files scattered | 2 (icon.png, Dancing_toki.gif) |
| Files already well-designed | 4+ |
| New file to create | 1 |
| Total refactor time | 30 min |
| Risk level | VERY LOW |

---

## Checklist

Setup:
- [ ] Read ASSET_RESOLUTION_SUMMARY.md
- [ ] Read IMPLEMENTATION_GUIDE.md

Implementation:
- [ ] Create src/lib/monaco-loader.ts
- [ ] Update src/app/controller.js
- [ ] Update src/popout/controller.js

Validation:
- [ ] npm test passes
- [ ] npm run build succeeds
- [ ] Manual: app loads and editor works
- [ ] Manual: popout loads and editor works

---

## Q&A

**Q: Will this change behavior?**
A: No. Same require.config, same module loading, same final result.

**Q: What if something breaks?**
A: Revert in 30 seconds. Delete monaco-loader.ts, revert 2 files.

**Q: Why not fix media assets too?**
A: Only 7 assets total. Inline usage is clear. Not worth indirection yet.

**Q: Should we merge the controllers?**
A: No. They have different logic. Just extract shared init.

**Q: What about vendor asset paths?**
A: Already well-organized via asset-runtime.ts. No changes needed.

---

## File Paths (for copy-paste)

Asset runtime:
  src/lib/asset-runtime.ts

Controllers to update:
  src/app/controller.js (line 409)
  src/popout/controller.js (line 601)

New file to create:
  src/lib/monaco-loader.ts

Documentation:
  ASSET_RESOLUTION_SUMMARY.md
  IMPLEMENTATION_GUIDE.md
  ASSET_FILE_INVENTORY.md
  ASSET_DUPLICATION_MAP.md

