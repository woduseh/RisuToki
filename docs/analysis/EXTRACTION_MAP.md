════════════════════════════════════════════════════════════════════════════════
                   RISUTOKI PRODUCTION AUDIT - EXTRACTION MAP
════════════════════════════════════════════════════════════════════════════════

CURRENT STATE ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

File Sizes:
  • src/app/controller.js ............. 6,807 lines ← CRITICAL MONOLITH
  • src/popout/controller.js ......... 1,228 lines
  • src/lib/preview-engine.js ........ 1,117 lines
  
State Variables: App=79 declarations, Popout=18 declarations


════════════════════════════════════════════════════════════════════════════════
A) RECOMMENDED MODULES TO EXTRACT (with high-confidence boundaries)
════════════════════════════════════════════════════════════════════════════════

PRIORITY 1 - Chat Engine (src/lib/chat-engine.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Functions to Extract:
  1. stripAnsi(str)
     • App:    5068-5091 (23 lines)
     • Popout: 1225-1282 (58 lines - DUPLICATE, slightly different)
     • ⚠ DIVERGENCE: Main has .replace(/\x1B\[[012]?C/g, ' ') for word spacing
     
  2. cleanTuiOutput(text)
     • App:    5155-5291 (137 lines) ← USE THIS VERSION (superset)
     • Popout: 1294-1362 (69 lines - subset)
     • Contains 70+ regex patterns filtering AI assistant prompts/UI
     
  3. extractChoices(text)
     • App: 4989-5067 (79 lines)
     • Returns: [{label, value}, ...]
     
  4. isSpinnerNoise(text)
     • Popout: ~1330s
     • Filter for "Thinking...", "Processing..." etc
     
  5. detectAssistantWelcomeInfo(text)
     • App: ~5240s

Export: { stripAnsi, cleanTuiOutput, extractChoices, isSpinnerNoise, detectAssistantWelcomeInfo }

Risk Level: LOW-MEDIUM
  ✓ Pure functions (no DOM)
  ✗ cleanTuiOutput has 137 lines with delicate regex patterns
    → MUST have 100% test coverage before merging


PRIORITY 2 - Terminal Stream Buffer (src/lib/terminal-stream.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

What to Extract:
  • onChatData(rawData) [app:4879-4901 vs popout:357-376]
    ← IDENTICAL logic, just different variable names!
    
  • finalizeChatResponse() [app:4902-4942 vs popout:377-406]
    ← IDENTICAL logic
    
  • Timer state: chatBuffer, chatMaxTimer, chatBufferTimer, chatIsStreaming
  
Class Definition:
  class ChatStreamBuffer {
    constructor(options) { this.onFinalize = options.onFinalize; }
    onData(rawData) { /* accumulates, manages timers */ }
    finalize() { /* produces accumulated content */ }
  }

State Management:
  • bufferContent: string
  • bufferTimer: NodeJS.Timeout (soft cap: 1500ms)
  • maxTimer: NodeJS.Timeout (hard cap: 4000ms)
  • isStreaming: boolean
  • waitForInput: boolean

Risk Level: MEDIUM
  ✓ Identical logic between main and popout
  ✗ Timer interaction is delicate (soft + hard cap)
    → Test with actual timing verification
  ✗ Depends on stripAnsi, isSpinnerNoise from Chat Engine


PRIORITY 3 - UI State Manager (src/lib/ui-state.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

State to Extract:
  From app/controller.js:
    • chatMode [64]
    • rpMode, rpCustomText [32-38]
    • bgmEnabled, bgmFilePath [44-48]
    • autosaveEnabled, autosaveInterval [57-58]
    • layoutState (object) [112-120]
    • dirtyFields (Set) [13]
    • activeTabId [10]
    • formEditors array [41]
    • darkMode [28]
    
  From popout/controller.js:
    • popoutChatMode [90]

Singleton Pattern:
  export const UIState = {
    get chatMode() { /* from localStorage */ },
    set chatMode(v) { /* persist + notify */ },
    
    toggleChat() { this.chatMode = !this.chatMode; },
    toggleDarkMode() { /* ... */ },
    
    layout: { /* itemsPos, refsPos, slotSizes, ... */ },
    markDirty(tabId) { dirtyFields.add(tabId); },
    clearDirty() { dirtyFields.clear(); }
  }

Risk Level: MEDIUM-HIGH
  ✓ Enables testing of state transitions
  ✗ Current code has implicit dependencies (e.g., calling updateTabUI on dirty)
    → Separate pure state from side effects
  ✗ localStorage migration logic [app:123-142] must be preserved


PRIORITY 4 - Preview Panel Orchestrator (src/lib/preview-controller.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Functions to Extract (Massive block from app:6400-7400):
  • buildPreviewPopout() orchestration
  • updateDebugPanel()
  • detachDebugPanel(), dockDebugPanel()
  • Debug drag-drop handlers
  • renderChat() into iframe
  • Message composition logic

Lines: ~1000 lines of complex preview logic

State:
  • previewMessages: [{role, content}, ...]
  • previewVars: {}
  • luaInitialized: boolean
  • activeDebugTab: string
  • debugDetached: boolean
  • debugOpen: boolean

Risk Level: HIGH
  ✓ Well-contained large section
  ✗ Deep PreviewEngine integration (Lua callbacks)
  ✗ Iframe PostMessage coordination with popout
    → Must test: Lua variable substitution works
    → Must test: Debug output updates correctly
    → Must test: Iframe message passing doesn't break


════════════════════════════════════════════════════════════════════════════════
B) DUPLICATED LOGIC BETWEEN MAIN & POPOUT (Can be centralized)
════════════════════════════════════════════════════════════════════════════════

EXACT DUPLICATES (Different Variable Names Only):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Chat Data Handler
   Main:   onChatData(rawData) [app:4879-4901]
   Popout: onPopoutChatData(rawData) [popout:357-376]
   
   Side-by-side comparison:
   ┌─────────────────────────────────┬──────────────────────────────────┐
   │ Main (variable names)           │ Popout (variable names)          │
   ├─────────────────────────────────┼──────────────────────────────────┤
   │ if (chatWaitForInput) return;   │ if (popoutChatWaitForInput) ...  │
   │ if (chatIsStreaming)            │ if (popoutChatIsStreaming)       │
   │ chatMessages.push(...)          │ popoutChatMessages.push(...)     │
   │ chatBuffer += text;             │ popoutChatBuffer += text;        │
   │ chatMaxTimer = setTimeout(...)  │ popoutChatMaxTimer = setTimeout()│
   │ chatBufferTimer = setTimeout(..)│ popoutChatBufferTimer = ...      │
   └─────────────────────────────────┴──────────────────────────────────┘
   
   Deduplication: Extract ChatStreamBuffer class, both use same instance

2. Chat Finalize Handler
   Main:   finalizeChatResponse() [app:4902-4942]
   Popout: finalizePopoutChat() [popout:377-406]
   
   Lines of duplication: ~35 lines
   Strategy: Extract to ChatStreamBuffer.finalize()


DIFFERENT IMPLEMENTATIONS (Merge Superset):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. stripAnsi()
   Main version: Uses 8 different replacements
   Popout:       Uses 6 replacements
   
   Key difference:
     Main:   .replace(/\x1B\[[012]?C/g, ' ')     ← SPACE for small cursor moves
     Popout: .replace(/\x1B\[\d*C/g, '\n')       ← NEWLINE for all
   
   Impact: Main version preserves word spacing better
   Action: Use main version, update popout to call it

2. cleanTuiOutput()
   Main:   137 lines (70+ patterns)
   Popout:  69 lines (subset of patterns)
   
   Patterns ONLY in Main:
     • /(Claude Code|GitHub Copilot CLI|Codex) has switched/
     • /getting-started/
     • /Windows PowerShell/
     • /Copyright.*Microsoft/
     • And 40+ AI-specific patterns
   
   Action: Merge into single function, use main as baseline


RENDER FUNCTIONS (Can't fully dedupe, but similar logic):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Main:   renderChatMessages() [app:4943-4988]
   Popout: renderPopoutChat() [popout:~420-500]
   
   These CANNOT be fully merged because:
     • Different DOM targets
     • Main uses iframe + PostMessage for CBS buttons
     • Popout renders directly
   
   But: Message array construction logic is identical
   Action: Extract buildMessageArray() as pure function, both call it


IMPACT OF DEDUPLICATION:
━━━━━━━━━━━━━━━━━━━━━━

Before: 
  • stripAnsi: 23 + 58 = 81 lines
  • cleanTuiOutput: 137 + 69 = 206 lines
  • onChatData: 23 + 20 = 43 lines
  • finalizeChatResponse: 41 + 30 = 71 lines
  Total Duplication: ~400 lines

After:
  • Shared: ~150 lines
  • Removed from popout: ~150 lines
  Net Savings: ~250 lines


════════════════════════════════════════════════════════════════════════════════
C) STATE MANAGEMENT - WHAT STAYS WHERE?
════════════════════════════════════════════════════════════════════════════════

TIER 1: Must Stay in Controllers (Too Orchestrated)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ fileData: Current charx being edited (tied to file operations)
  ✓ openTabs[]: Monaco editor instances (DOM lifecycle)
  ✓ activeTabId: Which editor tab is open (tied to UI state)
  ✓ poppedOutPanels: Set of popout windows (tied to window.tokiAPI)

  Why: These require orchestration with multiple systems
       (file I/O, Monaco API, window management)


TIER 2: Extract to Modules (Testable Core)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ Chat Stream:    chatBuffer, chatMessages, timers → ChatStreamBuffer
  ✓ UI Toggles:     chatMode, rpMode, darkMode → UIState singleton
  ✓ Persistence:    autosaveEnabled, backupStore → PersistenceManager
  ✓ Layout:         layoutState, slotSizes → LayoutEngine
  ✓ Dirtyness:      dirtyFields Set → TabDirtyTracker
  ✓ Avatar:         tokiActive, rpMode, tokens → AvatarManager


TIER 3: Read-Only Constants (No extraction needed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ SLOT_IDS, V_SLOTS, H_SLOTS [app:86-88]
  ✓ DEFAULT_SLOT_SIZES [app:89]
  ✓ TERM_THEME_DARK, TERM_THEME_LIGHT [app:92-107]
  ✓ MAX_BACKUPS, BGM_* constants [app:22, 50-54]
  ✓ FORM_TAB_TYPES [app:110]


════════════════════════════════════════════════════════════════════════════════
D) BEST FIRST TEST SEAMS & BEHAVIOR ASSERTIONS
════════════════════════════════════════════════════════════════════════════════

TEST STRATEGY:
  1. Start with Chat Engine (pure functions)
  2. Then Timer logic (timing dependencies)
  3. Then State management (user interactions)


Chat Engine Tests (src/lib/chat-engine.test.js):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

stripAnsi():
  Input:   "text\x1B[31mred\x1B[0m"
  Output:  "textred"
  
  Input:   "esc\x1B[1Cto interrupt"
  Output:  "esc to interrupt"  (NOT "esc\nto")  ← Main's optimization!
  
  Input:   "line1\x1B[5Cline2"
  Output:  "line1\nline2"

cleanTuiOutput():
  Input:   "Processing...\nResult"
  Output:  "Result"  (filter spinner)
  
  Input:   "Type here to tell Claude\nOutput"
  Output:  "Output"  (filter UI hint)
  
  Input:   "╭─Result─╮\nContent\n╰────╯"
  Output:  "Result\nContent"  (remove box-drawing)

extractChoices():
  Input:   "Pick one:\n1. Yes\n2. No"
  Output:  [{label:"Yes",value:"1"}, {label:"No",value:"2"}]
  
  Input:   "No choices here"
  Output:  []


Terminal Stream Tests (src/lib/terminal-stream.test.js):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Buffer accumulation:
  Create buffer
  onData("chunk1")
  onData("chunk2")
  Verify: buffer.getContent() === "chunk1chunk2"

Soft cap (1500ms debounce):
  onData("text")
  Assert: finalize NOT called at 500ms
  Assert: finalize IS called at 1600ms

Hard cap (4000ms):
  Send data every 500ms for 5000ms
  Assert: finalize called at ~4000ms, not at 5000ms

Input echo filtering:
  lastSentCmd = "hello"
  onData("hello\nresponse")
  onFinalize()
  Assert: content === "response" (not "hello\nresponse")


════════════════════════════════════════════════════════════════════════════════
E) RISKS WHERE EXTRACTION COULD BREAK RUNTIME BEHAVIOR
════════════════════════════════════════════════════════════════════════════════

CRITICAL RISKS:
━━━━━━━━━━━━

1. stripAnsi() Divergence
   Problem: Main has .replace(/\x1B\[[012]?C/g, ' ')
            Popout missing this → breaks word spacing
   Mitigation: 
     ✓ Extract main version
     ✓ Test on real AI output: "esc[1-2]Cto interrupt"
     ✓ Verify spacing preserved

2. cleanTuiOutput() Pattern Loss
   Problem: 70+ regex patterns, if 1 removed → noise in chat
   Mitigation:
     ✓ Create test case for EACH pattern before extraction
     ✓ Run all tests before merging

3. Timer Double-Fire
   Problem: Both soft (1500ms) and hard (4000ms) timers active
            If not managed carefully: finalize() called twice
   Mitigation:
     ✓ Verify finalize() is idempotent
     ✓ Test both timers firing scenario
     ✓ Clear soft timer when hard fires

4. PreviewEngine Lua Sequencing
   Problem: initLua() must complete before triggers run
   Mitigation:
     ✓ Make Lua init a blocking await
     ✓ Test Lua script execution end-to-end

5. Monaco Instance Lifecycle
   Problem: If editor extraction loses monaco references → memory leak
   Mitigation:
     ✓ KEEP monaco mgmt in controller
     ✓ Extract ONLY tab state (IDs, dirty flags)

6. localStorage Migration
   Problem: Old format {sidebarPos} must migrate to {itemsPos}
   Mitigation:
     ✓ Keep migration logic in place
     ✓ LayoutEngine receives migrated state only


════════════════════════════════════════════════════════════════════════════════
EXTRACTION ROADMAP (Recommended Order)
════════════════════════════════════════════════════════════════════════════════

PHASE 1 (Foundation - 8 hours):
  □ Create src/lib/chat-engine.js (stripAnsi, cleanTuiOutput, etc.)
    → Write 40+ tests FIRST (TDD)
    → Verify main & popout output identical
  
  □ Create src/lib/terminal-stream.js (ChatStreamBuffer class)
    → Write timing tests (soft/hard cap interaction)
    → Verify idempotent finalize()

PHASE 2 (Integration - 6 hours):
  □ Update app/controller.js to use ChatStreamBuffer
    → Replace onChatData, finalizeChatResponse calls
    → Update popout/controller.js to reuse
    → Remove duplicate stripAnsi from popout
  
  □ Create src/lib/ui-state.js (singleton)
    → Extract state getters/setters
    → Preserve localStorage persistence

PHASE 3 (Polish - 5 hours):
  □ Create src/lib/persistence.js (backup, autosave)
  □ Create src/lib/editor-tabs.js (tab state)
  □ Create src/lib/layout-engine.js (panel positioning)
  □ Create src/lib/preview-controller.js (big preview section)


FINAL RESULT:
  Before: 
    app/controller.js: 6,807 lines
    popout/controller.js: 1,228 lines
    Total: 8,035 lines

  After:
    app/controller.js: ~3,500 lines (-49%)
    popout/controller.js: ~700 lines (-43%)
    Shared modules: ~1,200 lines
    Total: ~5,400 lines (-33% overall reduction)
    
  New Files:
    ✓ 7 new tested modules (90+ test cases)
    ✓ Duplication eliminated
    ✓ Core logic testable without DOM


════════════════════════════════════════════════════════════════════════════════
