# 📋 RisuToki Vue 3 + Vite + TypeScript Migration: Complete Documentation Index

**Status**: Complete Migration Plan Package Ready  
**Date**: 2026-03-07  
**Project**: RisuToki (Electron Charx Editor)  
**Target Stack**: Vue 3 + Vite + TypeScript + Pinia + Vitest  

---

## 🎯 START HERE

### For Quick Understanding (10 min read)
1. **MIGRATION_OVERVIEW.md** (14 KB)
   - Key facts & metrics about current codebase
   - Component breakdown with effort estimates
   - Toolchain checklist
   - High-risk areas with specific mitigations
   - Testing strategy
   - Migration readiness checklist

### For Detailed Architecture (30 min read)
2. **MIGRATION_PLAN_SUMMARY.md** (11 KB)
   - Current runtime architecture (Electron main/preload/renderer)
   - Full component responsibility map (13 components, 8 stores)
   - Pinia store structure (editor, layout, ui, terminal, file, notification)
   - Complete toolchain setup (package.json, Vite, TypeScript, ESLint, Vitest configs)
   - High-risk areas with detailed mitigation strategies
   - Smallest viable vertical slice (MVP) broken into 6 phases
   - Directory structure (target post-migration)
   - Timeline & milestones (4 weeks)

### For Concrete Implementation (20 min read)
3. **MIGRATION_CODE_EXAMPLES.md** (6.7 KB)
   - Editor Store (Pinia) TypeScript example
   - Monaco Editor composable with proper lifecycle
   - EditorTabs Vue component example
   - Terminal composable with ResizeObserver cleanup
   - Component hierarchy tree
   - Critical composables checklist
   - Complete config files (Vite, TypeScript, ESLint, Vitest)
   - First unit test example (editor store)

### This Document
4. **MIGRATION_INDEX.md** (this file)
   - Navigation guide
   - Document cross-references
   - Summary of deliverables
   - Next steps

---

## 📊 AT A GLANCE

### Current State
`
Technology Stack:
├─ Renderer: 7,393 lines vanilla JS (src/renderer/app.js)
├─ UI Framework: None (DOM manipulation)
├─ State Management: localStorage + globals
├─ Editor: Monaco (async loaded from CDN)
├─ Terminal: xterm.js v5.5
├─ Build Tool: None (files served raw)
├─ Tests: ❌ ZERO
└─ Package Manager: npm

Electron:
├─ main.js: 300+ lines (100+ IPC handlers)
├─ preload.js: 104 exposed functions
├─ popout-preload.js: Separate for 5 popout types
└─ MCP Server: Integrated

Data Format:
└─ .charx: ZIP format with lua/css/json sections

Current Pain Points:
❌ Monolithic 7K line app.js (hard to maintain)
❌ Zero tests (refactoring risk)
❌ No build tool (poor dev experience)
❌ Global state (hard to track)
❌ No component reusability
`

### Target State
`
Technology Stack:
├─ Renderer: Vue 3 (modular components)
├─ UI Framework: Vue 3 + Pinia
├─ State Management: Pinia (6 stores)
├─ Editor: Monaco via @monaco-editor/loader
├─ Terminal: xterm.js (same version)
├─ Build Tool: Vite (blazing fast)
├─ Tests: Vitest + Vue Test Utils (50%+ coverage)
└─ Package Manager: npm (same)

Electron:
├─ main.ts: TypeScript + types
├─ preload.ts: TypeScript + typed IPC
├─ popout: Vanilla JS (phase 1) OR separate Vue app (phase 2)
└─ MCP Server: Same (no changes)

Directory Structure:
src/
├─ components/ (13 major components)
├─ stores/ (6 Pinia stores)
├─ composables/ (8 critical composables)
├─ lib/ (sections, backup, preview-engine)
├─ types/ (TypeScript interfaces)
├─ styles/ (organized CSS)
└─ __tests__/ (unit/component tests)

Benefits:
✅ Modular, testable architecture
✅ Type safety (TypeScript)
✅ Fast dev experience (Vite)
✅ Better maintainability (Vue components)
✅ Reactive state management (Pinia)
✅ Comprehensive tests (Vitest)
✅ Linting & formatting (ESLint, Prettier)
`

---

## 🗺️ DOCUMENT NAVIGATION

### MIGRATION_OVERVIEW.md
**What**: Quick reference guide with checklists and effort matrix  
**Best for**: Understanding scope and getting started  
**Key sections**:
- Key facts & metrics
- Component breakdown table
- Toolchain setup checklist
- High-risk areas (7 critical risks)
- Smallest viable vertical slice (6 phases, 2 weeks)
- Complexity & effort matrix
- Migration readiness checklist
- Next steps

**Read this if**: You want the executive summary and actionable checklist

---

### MIGRATION_PLAN_SUMMARY.md
**What**: Comprehensive detailed migration guide  
**Best for**: Understanding architecture and planning implementation  
**Key sections**:
1. **Current Runtime Architecture**
   - Electron structure
   - Renderer monolith breakdown
   - File I/O & data flow

2. **Renderer Responsibility Breakdown & Component Mapping**
   - 13 major responsibilities → Vue components
   - Current code locations
   - New component structure
   - Pinia stores (6 total)

3. **Electron Main/Preload Changes**
   - What to keep vs. modernize
   - TypeScript conversion strategy
   - No breaking changes (backward compatible)

4. **Recommended Toolchain Changes**
   - package.json scripts
   - Dependency additions/removals
   - Vite config
   - TypeScript config
   - ESLint config
   - Vitest config

5. **High-Risk Areas & Migration Pitfalls**
   - Monaco editor lifecycle ⚠️ CRITICAL
   - Form editor mini-Monaco instances ⚠️ CRITICAL
   - xterm.js + ResizeObserver ⚠️ CRITICAL
   - PopoutPanel system
   - localStorage coupling
   - Async chat mode timers
   - Section parsing (Lua/CSS)
   - Asset image loading

6. **Smallest Viable Vertical Slice (MVP)**
   - Phase 1: Infrastructure
   - Phase 2: Tab + Editor management
   - Phase 3: File I/O
   - Phase 4: Sidebar + Layout
   - Phase 5: Terminal + Chat
   - Phase 6: Tests + Cleanup

7. **Directory Structure (Target)**
   - Full src/ layout
   - Component organization
   - Store structure
   - Test directory

8. **Existing Test Status**
   - Currently: Zero tests
   - Action items
   - Coverage targets

9. **Timeline & Checkpoints**
   - Week 1: Foundation
   - Week 2: Core functionality
   - Week 3: Sidebar + Layout
   - Week 3-4: Terminal + Chat
   - Week 4+: Polish

10. **Known Compatibility Considerations**
    - Monaco editor async loading
    - Dark mode implementation
    - IPC type safety
    - Popout windows

11. **Post-Migration Refactoring Opportunities**

12. **Summary Table**: Key files to migrate

**Read this if**: You need to understand the full architecture and plan detailed implementation

---

### MIGRATION_CODE_EXAMPLES.md
**What**: Concrete TypeScript/Vue 3 code patterns  
**Best for**: Implementation reference during migration  
**Key sections**:
1. Editor Store (Pinia) - Full working example
2. Monaco Editor composable - Lifecycle management
3. EditorTabs component - Vue 3 composition API
4. Terminal composable - ResizeObserver cleanup
5. Sidebar Tree component - Recursive structure
6. Vue app entry (main.ts)
7. Root App.vue component
8. package.json essentials
9. ESLint config
10. First unit test example

**Read this if**: You're actively coding the migration and need patterns to follow

---

## 🔗 CROSS-REFERENCES

### Finding Information

**"How do I migrate component X?"**
→ MIGRATION_PLAN_SUMMARY.md → Section 2: Component breakdown table

**"What's the exact code pattern for Y?"**
→ MIGRATION_CODE_EXAMPLES.md → Relevant section + example

**"What are the high-risk areas?"**
→ MIGRATION_OVERVIEW.md → High-risk areas section  
OR MIGRATION_PLAN_SUMMARY.md → Section 5

**"What's the timeline?"**
→ MIGRATION_OVERVIEW.md → Timeline table  
OR MIGRATION_PLAN_SUMMARY.md → Section 9

**"What do I need to install?"**
→ MIGRATION_OVERVIEW.md → Toolchain setup checklist  
OR MIGRATION_PLAN_SUMMARY.md → Section 4

**"What tests should I write?"**
→ MIGRATION_OVERVIEW.md → Testing strategy  
OR MIGRATION_PLAN_SUMMARY.md → Section 8

**"What order should I migrate things?"**
→ MIGRATION_OVERVIEW.md → Smallest viable vertical slice  
OR MIGRATION_PLAN_SUMMARY.md → Section 6

---

## ✅ MIGRATION CHECKLIST (Quick Reference)

### Pre-Migration (before starting)
- [ ] Read all 3 documents (2 hours total)
- [ ] Create feature branch: git checkout -b feat/vue3-migration
- [ ] Review current app.js structure
- [ ] List all IPC handlers
- [ ] Document CSS custom properties

### Phase 1: Setup (Day 1-3)
- [ ] Install Vite, Vue 3, TypeScript, Pinia
- [ ] Create vite.config.ts (from MIGRATION_CODE_EXAMPLES.md)
- [ ] Create tsconfig.json
- [ ] Create src/ directory structure
- [ ] Create App.vue stub
- [ ] Add npm scripts
- [ ] Verify 
pm run dev works

### Phase 2: Editor (Day 3-5)
- [ ] Create useEditorStore (Pinia)
- [ ] Create EditorTabs component
- [ ] Create MonacoEditor component
- [ ] Create useMonacoEditor composable
- [ ] Add tests for editor store
- [ ] Verify tab switching works

### Phase 3: File I/O (Day 5-7)
- [ ] Create electron-ipc.ts (IPC types)
- [ ] Create useFileStore
- [ ] Implement new/open/save handlers
- [ ] Create useKeyboardShortcuts composable
- [ ] Test file operations

### Phase 4: Sidebar (Day 7-10)
- [ ] Create SidebarTree component (recursive)
- [ ] Create TreeItem, TreeFolder components
- [ ] Create useLayoutStore
- [ ] Implement panel visibility toggle
- [ ] Test sidebar rendering

### Phase 5: Terminal (Day 10-12)
- [ ] Create TerminalPanel component
- [ ] Create useTerminal composable
- [ ] Create ChatView, ChatBubble components
- [ ] Create TokiAvatar, BGMControl components
- [ ] Test terminal output

### Phase 6: Testing (Day 12-14)
- [ ] Write store tests (50+ tests)
- [ ] Write lib tests (50+ tests)
- [ ] Write component tests (30+ tests)
- [ ] Run ESLint (--fix)
- [ ] Achieve 50%+ coverage

### Pre-Release
- [ ] All features working
- [ ] Manual smoke test
- [ ] npm run build succeeds
- [ ] Electron packaging works
- [ ] Update README

---

## 📈 PROGRESS TRACKING

### Current Status
`
Architecture: ✅ Documented
- Current structure analyzed
- Component mapping completed
- Store design finalized
- Risk assessment completed

Toolchain: ✅ Documented
- All configs provided
- Scripts defined
- Dependencies listed

Code Examples: ✅ Provided
- Store examples
- Component examples
- Composable examples
- Config files

Timeline: ✅ Estimated
- Phase breakdown: 6 phases
- Effort estimate: 20 days
- Risk analysis: Complete

Migration: ⏳ Ready to Start
- All documentation complete
- Code patterns provided
- Checklist created
`

### What's Next
1. Read these 3 documents (in order)
2. Install dependencies
3. Start Phase 1 (infrastructure)
4. Follow the phase checklist
5. Run tests continuously
6. Track progress against timeline

---

## 🚀 QUICK START COMMAND

`ash
# 1. Create feature branch
git checkout -b feat/vue3-migration

# 2. Install core dependencies
npm install --save-dev \
  vite@^4.5.0 \
  @vitejs/plugin-vue@^4.5.0 \
  typescript@^5.3.0 \
  vue@^3.3.0 \
  pinia@^2.1.0 \
  vitest@^0.34.0 \
  jsdom@^22.0.0 \
  eslint@^8.0.0 \
  eslint-plugin-vue@^9.0.0 \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin

npm install --save \
  @monaco-editor/loader@^1.3.0

# 3. Create src directory
mkdir -p src/{components,stores,composables,lib,types,styles,__tests__/unit}

# 4. Create vite.config.ts and tsconfig.json
# (Copy from MIGRATION_CODE_EXAMPLES.md)

# 5. Create src/main.ts and src/App.vue
# (Copy stub from MIGRATION_CODE_EXAMPLES.md)

# 6. Test it
npm run dev
# Should see app loading at http://localhost:5173
`

---

## 📞 DOCUMENT STATS

| Document | Size | Read Time | Content |
|----------|------|-----------|---------|
| MIGRATION_OVERVIEW.md | 14 KB | 10 min | Quick reference + checklists |
| MIGRATION_PLAN_SUMMARY.md | 11 KB | 30 min | Detailed architecture + timeline |
| MIGRATION_CODE_EXAMPLES.md | 6.7 KB | 20 min | Concrete code patterns |
| **TOTAL** | **~32 KB** | **60 min** | Complete migration guide |

---

## ✨ SUMMARY

You have a **complete, concrete migration plan** for RisuToki from vanilla JS to Vue 3 + Vite + TypeScript:

✅ **Architecture**: 13 components identified, split from 7K line monolith  
✅ **State**: 6 Pinia stores designed  
✅ **Toolchain**: Complete setup (Vite, TypeScript, ESLint, Vitest)  
✅ **Code**: Concrete examples for every major piece  
✅ **Risk**: 7 critical risks identified with specific mitigations  
✅ **Timeline**: 20 days (4 weeks) with 6 phases  
✅ **Tests**: Strategy for 0 → 50%+ coverage  
✅ **Checklists**: Action items at every step  

---

**Ready to start Phase 1?** → Follow the Quick Start Command above

**Need more detail?** → Read MIGRATION_PLAN_SUMMARY.md

**Need code patterns?** → Check MIGRATION_CODE_EXAMPLES.md

**Need a checklist?** → Use MIGRATION_OVERVIEW.md

---

*Generated: 2026-03-07 18:21:04*  
*For: RisuToki Vue 3 Migration Project*

