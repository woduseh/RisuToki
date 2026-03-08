════════════════════════════════════════════════════════════════════════════════
                      RISUTOKI AUDIT - EXECUTIVE SUMMARY
════════════════════════════════════════════════════════════════════════════════

FINDINGS
━━━━━━━━

✓ MAJOR CODE QUALITY ISSUES IDENTIFIED:

1. MONOLITHIC ARCHITECTURE
   • src/app/controller.js: 6,807 lines (CRITICAL)
     - Single file larger than most projects
     - 79 top-level state variables scattered throughout
     - Impossible to unit test without full DOM + xterm setup
     - Mixing UI orchestration, business logic, DOM manipulation
   
   • src/popout/controller.js: 1,228 lines
     - Mirrors 40-60% of main controller logic
     - ~250 lines of exact duplication

2. DUPLICATED LOGIC (Cross-window)
   
   Main & Popout Share IDENTICAL implementations:
   ✗ stripAnsi() ........................... 81 lines total (23 main + 58 popout)
   ✗ cleanTuiOutput() ..................... 206 lines total (137 main + 69 popout)
   ✗ onChatData() ......................... 43 lines total (identical logic!)
   ✗ finalizeChatResponse() ............... 71 lines total (identical logic!)
   
   BUT: stripAnsi() implementations DIVERGE
   - Main version has optimization: .replace(/\x1B\[[012]?C/g, ' ')
     (preserves word spacing better)
   - Popout missing this → broken word spacing in popout chat

3. TESTABILITY GAP
   • ZERO unit tests for chat processing logic
   • ZERO unit tests for terminal output cleaning
   • ZERO tests for timer-based finalization logic
   • Current test suite (App.test.ts) only tests Vue component rendering
   
   Why this matters:
   - 70+ regex patterns in cleanTuiOutput() have NO coverage
   - If a pattern removed by accident → noise appears in chat
   - Timer logic (soft 1500ms + hard 4000ms cap) untested
   - If timer logic broken → chat messages accumulate indefinitely

4. PREVIEW ENGINE INTEGRATION
   • Massive preview panel logic (~1000 lines) mixed with chat logic
   • Lua integration buried in view code
   • Preview debug panel (detach/dock) tightly coupled to preview rendering
   • Hard to modify without breaking something


RISK ASSESSMENT
━━━━━━━━━━━━

Current Risk Level: HIGH 🔴
  • One typo in stripAnsi() or cleanTuiOutput() affects both main AND popout
  • No regression tests if someone refactors terminal handling
  • Feature requests (e.g., "add spinner filter") require changes in 2+ places
  • Onboarding new developer to modify this code: 4+ weeks to understand flow


PROPOSED SOLUTION
━━━━━━━━━━━━━━━━

Extract into 7 tested modules:

1. src/lib/chat-engine.js ............. 200 lines (stripAnsi, cleanTuiOutput, ...)
2. src/lib/terminal-stream.js ........ 150 lines (ChatStreamBuffer class)
3. src/lib/ui-state.js ............... 200 lines (UI toggles, dark mode, ...)
4. src/lib/editor-tabs.js ............ 300 lines (Tab lifecycle management)
5. src/lib/layout-engine.js .......... 400 lines (Panel positioning)
6. src/lib/persistence.js ............ 150 lines (Backup, autosave)
7. src/lib/preview-controller.js .... 600 lines (Preview orchestration)

Result:
  Before:
    app/controller.js: 6,807 lines
    popout/controller.js: 1,228 lines
    Total: 8,035 lines
    
  After:
    app/controller.js: ~3,500 lines (-49%)
    popout/controller.js: ~700 lines (-43%)
    Shared modules: ~1,200 lines
    New test files: ~2,000 lines (90+ tests)
    Total: ~7,400 lines (-8% size, but +8x more testable)


IMMEDIATE ACTIONS (High Impact, Low Risk)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ PHASE 1 (Do First - unblocks everything):
  1. Create src/lib/chat-engine.js
     - Extract: stripAnsi(), cleanTuiOutput(), extractChoices()
     - Write 40+ tests FIRST (verify behavior before extraction)
     - Update both main & popout to use shared version
     - Eliminates ~80 lines duplication
     → Effort: 3-4 hours | Impact: MEDIUM | Risk: LOW
  
  2. Create src/lib/terminal-stream.js  
     - Extract: ChatStreamBuffer class
     - Consolidate onChatData() + finalizeChatResponse() logic
     - Write timing tests (soft/hard cap interaction)
     → Effort: 2-3 hours | Impact: MEDIUM | Risk: MEDIUM
  
  3. Write tests for extracted code
     - 40+ tests for Chat Engine
     - 20+ tests for Timer logic
     → Effort: 4-5 hours | Impact: HIGH | Risk: LOW


✓ PHASE 2 (Medium Priority):
  1. Create src/lib/ui-state.js (state management singleton)
     - Extract: chatMode, rpMode, darkMode, layoutState, etc.
     - Enables unit testing of toggle logic
     → Effort: 2-3 hours | Impact: MEDIUM | Risk: MEDIUM
  
  2. Create src/lib/persistence.js (backup & autosave)
     - Extract: backup store, autosave logic
     - Already fairly pure, easy to test
     → Effort: 1-2 hours | Impact: LOW | Risk: LOW


✓ PHASE 3 (Polish):
  1. Create src/lib/editor-tabs.js (editor tab lifecycle)
  2. Create src/lib/layout-engine.js (panel positioning)
  3. Create src/lib/preview-controller.js (preview orchestration)
     - This is the big one (~600 lines, HIGH complexity)
     - Do last because depends on phase 1-2 being stable


ESTIMATED EFFORT
━━━━━━━━━━━━━

Phase 1 (Core): 8-10 hours
Phase 2 (Foundation): 5-7 hours
Phase 3 (Polish): 8-10 hours
Integration & Testing: 5-7 hours

TOTAL: 26-34 hours (~3-4 developer days, or 1 week part-time)

By Developer Experience:
  • Intermediate (2-3 yrs): 30-40 hours
  • Senior (5+ yrs): 20-25 hours
  • Junior (0-2 yrs): 40-50 hours + review cycle


SUCCESS METRICS
━━━━━━━━━━━━

✓ All new tests pass (90+ test cases)
✓ Chat logic testable without DOM
✓ No duplication between main & popout
✓ Code reviewers can understand extracted modules in <30 min each
✓ New engineer can modify chat behavior with confidence
✓ Regression test suite catches stripAnsi/cleanTuiOutput changes


NEXT STEPS
━━━━━━━

1. Review this extraction map with team
2. Prioritize Phase 1 extraction (highest ROI)
3. Start with TDD: write tests for chat-engine.js BEFORE extraction
4. Extract functions into module
5. Update app/controller.js and popout/controller.js to use shared code
6. Iterate through phases 2-3 in 1-2 week sprints


FILES GENERATED
━━━━━━━━━━━━━━

✓ EXTRACTION_MAP.md (full detailed analysis)
  - 300+ lines of concrete module boundaries
  - Line number references for every function to extract
  - Risk assessments for each extraction
  - Test seam examples and assertions
  - Dependency graph showing extraction order


════════════════════════════════════════════════════════════════════════════════

KEY INSIGHT: The biggest wins come from extracting Chat Engine first.
Everything else becomes easier once stripAnsi/cleanTuiOutput are tested
and shared between main & popout.

