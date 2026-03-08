# RisuToki Bug Analysis: Guide/Reference Rendering Issues

## ROOT CAUSE: Reported Bug (Guides Don't Appear Until Position Change)

**Location**: src/app/controller.js lines 6557-6560
**Test Coverage**: NOT COVERED (untested)

### The Race Condition

Line 6557 calls ebuildLayout() synchronously, but uildRefsSidebar() doesn't run until line 6560:

- Line 6557: ebuildLayout() → layoutManager.rebuild()
- In layout-manager.ts (lines 274-282): If refsPos != 'sidebar', tries to move guides from sidebar-refs to refs-panel-content
- **PROBLEM**: sidebar-refs is EMPTY at this point! buildRefsSidebar() hasn't populated it yet
- Line 6560: wait buildRefsSidebar() finally populates sidebar-refs - but layout already rendered

### Why User Workaround Works

When user manually moves guide panel position via menu → moveRefs() → rebuildLayout():
- NOW sidebar-refs is populated from previous initialization
- Layout manager finds content and successfully moves it to the new slot
- Guides become visible!

### The Fix

Move line 6560 BEFORE line 6557:
`javascript
await syncReferenceFiles();   // Line 6559
await buildRefsSidebar();     // Line 6560 - MOVE HERE
rebuildLayout();              // Line 6557 - NOW sidebar-refs is populated!
`

---

## SIMILAR LATENT BUGS IDENTIFIED

### Bug #1: Popout Panel References Data Race (Untested)
**Files**: src/popout/controller.js:519, main.js:1468-1521
**Issue**: When refs popout launches, getRefsData() may get incomplete referenceFiles array
**Impact**: User sees empty guides/refs in popout window on first app launch
**Test Status**: No tests for popout initialization sequence

### Bug #2: Settings Not Synced to Popout Windows (Untested)
**Files**: src/popout/controller.js:31, src/lib/app-settings.ts
**Issue**: Popout reads settings snapshot once at init, never subscribes to changes
**Impact**: Dark mode, RP mode changes in main window don't reflect in popout windows
**Test Status**: No tests for cross-window settings sync

### Bug #3: Layout State Not Broadcast to Popout Windows (Untested)
**Files**: src/app/controller.js:162-183, main.js
**Issue**: Layout changes saved locally but popout windows have no way to know
**Impact**: If user changes layout, pops out panel, then docks it - position may be wrong
**Test Status**: No integration tests for layout state sync

### Bug #4: Reference File Index Invalidation Missing (Partially Tested)
**Files**: src/lib/reference-store.cjs, src/app/controller.js:6441-6458, main.js:520-526
**Issue**: When reference removed from main process, renderer's cached indices become stale
**Impact**: Opening reference tabs after removal opens wrong file or crashes
**Test Status**: Only unit tests in test-reference-store.js for upsert/remove; no integration test

### Bug #5: Guide DOM Movement Loses Event Context (Untested)
**Files**: src/lib/layout-manager.ts:274-290
**Issue**: When moving guides between sidebar and ref-panel, DOM nodes are appended (moved, not copied)
**Impact**: Guide folder expanders and context menus may stop working after position change
**Test Status**: No tests for guide interactions after layout rebuild

### Bug #6: Sidebar Init Barrier Missing (Untested)
**Files**: src/app/controller.js:6540-6560
**Issue**: Multiple init functions assume sidebar is populated before buildRefsSidebar() completes
**Impact**: If user navigates to reference file before buildRefsSidebar() completes, wrong data loaded
**Test Status**: No tests for rapid initialization sequence

### Bug #7: Preview Session Renders Before Lua Ready (Untested)
**Files**: src/app/controller.js:5902-6750
**Issue**: Preview session created before Monaco/Terminal fully load; Lua engine may not be initialized
**Impact**: Preview renders but Lua scripts don't execute on first preview open
**Test Status**: No tests for preview initialization order

### Bug #8: Autosave Starts Before References Loaded (Untested)
**Files**: src/app/controller.js:6558-6560
**Issue**: Autosave enabled before syncReferenceFiles/buildRefsSidebar completes
**Impact**: If user edits immediately on launch, file saves with incomplete reference state
**Test Status**: No tests for autosave timing during initialization

### Bug #9: Popout Refs Position Divergence (Untested)
**Files**: src/app/controller.js:6238-6313, main.js:1468-1521
**Issue**: When refs popped out, if user changes position in main, popout doesn't track it
**Impact**: After docking, refs restore to wrong position
**Test Status**: No tests for popout state synchronization

### Bug #10: Preview Data Loads After Preview Renders (Untested)
**Files**: src/app/controller.js:5902-5970
**Issue**: Preview UI shown before all character data (tabs, editors) fully populated
**Impact**: Preview may render with stale or partial character data on first open
**Test Status**: No tests for preview initialization order

---

## Test Coverage Analysis

### Currently Tested
- Reference store utility functions (test-reference-store.js): ✓ Covered
- Individual library functions (app-settings.test.ts, preview-session.test.ts, etc.): ✓ Covered
- Chat session, preview format, asset runtime: ✓ Covered

### NOT Tested (Initialization Race Conditions)
- Guides/refs rendering order ❌
- Settings sync across windows ❌  
- Layout state broadcast ❌
- Reference index sync ❌
- Guide DOM interactions after move ❌
- Sidebar population timing ❌
- Preview initialization sequence ❌
- Autosave timing ❌
- Popout state sync ❌
- Cross-window state consistency ❌

**Total Untested Issues**: 10 potential user-visible bugs

---

## Files with Issues

| File | Issue Count | Severity |
|------|------------|----------|
| src/app/controller.js | 7 | High |
| src/lib/layout-manager.ts | 2 | High |
| src/popout/controller.js | 3 | High |
| main.js | 3 | High |
| src/lib/app-settings.ts | 1 | Medium |
| src/lib/reference-store.cjs | 1 | Medium |

**All issues involve initialization order, settings/state sync, or popout/main divergence.**