════════════════════════════════════════════════════════════════════════════════
            RISUTOKI EXTRACTION GUIDE - CONCRETE CODE REFERENCES
════════════════════════════════════════════════════════════════════════════════

QUICK REFERENCE: WHAT TO EXTRACT FROM WHERE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Module 1: Chat Engine (src/lib/chat-engine.js)
──────────────────────────────────────────────

SOURCE LOCATIONS:
┌────────────────────────────────────────────────────────────────────────────┐
│ FUNCTION              │ MAIN LOCATION           │ POPOUT LOCATION         │
├────────────────────────────────────────────────────────────────────────────┤
│ stripAnsi()           │ app:5068-5091 (23L)     │ popout:1225-1282 (58L)  │
│ cleanTuiOutput()      │ app:5155-5291 (137L)    │ popout:1294-1362 (69L)  │
│ extractChoices()      │ app:4989-5067 (79L)     │ popout:N/A              │
│ isSpinnerNoise()      │ app:~5240s              │ popout:~1330s           │
│ detectWelcomeInfo()   │ app:~5240s              │ popout:N/A              │
└────────────────────────────────────────────────────────────────────────────┘

ACTION ITEMS:
  1. Copy stripAnsi() from app/controller.js (MAIN version - better)
     Line 5068: function stripAnsi(str) {
     Line 5091: .replace(/\r\n/g, '\n'); }

  2. Copy cleanTuiOutput() from app/controller.js (LARGER version)
     Line 5155: function cleanTuiOutput(text) {
     Line 5291: Line that closes the function

  3. Copy extractChoices() from app/controller.js
     Line 4989: function extractChoices(text) {
     Line 5067: Closing brace

  4. Copy isSpinnerNoise() from popout/controller.js
  5. Copy detectAssistantWelcomeInfo() from app/controller.js

TESTS TO WRITE FIRST:
  • stripAnsi("hello\x1B[31mred\x1B[0mworld") → "helloredworld"
  • stripAnsi("esc\x1B[1Cto") → "esc to"  (NOT "esc\nto"!)
  • cleanTuiOutput("Processing...\nResult") → "Result"
  • extractChoices("1. Yes\n2. No") → [{label:"Yes",value:"1"}, ...]


Module 2: Terminal Stream (src/lib/terminal-stream.js)
───────────────────────────────────────────────────────

SOURCE LOCATIONS:
┌────────────────────────────────────────────────────────────────────────────┐
│ FUNCTION/STATE        │ APP LOCATION            │ POPOUT LOCATION         │
├────────────────────────────────────────────────────────────────────────────┤
│ chatBuffer            │ app:72                  │ popout:92 (popoutChatB.)│
│ chatBufferTimer       │ app:73                  │ popout:93               │
│ chatMaxTimer          │ app:67                  │ popout:98               │
│ chatIsStreaming       │ app:68                  │ popout:94               │
│ chatWaitForInput      │ app:69                  │ popout:97               │
│ onChatData()          │ app:4879-4901           │ popout:357-376          │
│ finalizeChatResponse()│ app:4902-4942           │ popout:377-406          │
│ BGM_SILENCE_MS        │ app:50 (3000)           │ N/A                     │
│ BGM_BURST_THRESHOLD   │ app:53 (3)              │ N/A                     │
└────────────────────────────────────────────────────────────────────────────┘

CLASS STRUCTURE:
  export class ChatStreamBuffer {
    constructor(options = {}) {
      this.onFinalize = options.onFinalize || noop;
      this.onRenderUpdate = options.onRenderUpdate || noop;
      
      this.buffer = '';
      this.messages = [];
      this.bufferTimer = null;
      this.maxTimer = null;
      this.isStreaming = false;
      this.waitForInput = true;
      
      this.debounceMs = 1500;  // soft cap
      this.maxWaitMs = 4000;   // hard cap
    }
    
    onData(rawData) {
      // From app:4879-4901
      // Implement exact same logic but using this.buffer, this.messages, etc.
    }
    
    finalize() {
      // From app:4902-4942
      // Pure logic that returns { accumulated, cleaned }
    }
  }

TESTS TO WRITE:
  • onData called → messages array grows
  • Soft cap (1500ms): onFinalize called after last data
  • Hard cap (4000ms): finalize forced even if data arriving
  • Input echo filtering works (lastSentCmd logic)


Module 3: UI State (src/lib/ui-state.js)
────────────────────────────────────────

STATE TO EXTRACT FROM APP CONTROLLER:
┌──────────────────────────────────┬─────────┬──────────────────────┐
│ VARIABLE                         │ LINE    │ NOTES                │
├──────────────────────────────────┼─────────┼──────────────────────┤
│ chatMode                         │ 64      │ boolean toggle       │
│ rpMode                           │ 32-38   │ 'off'|'toki'|'aris'  │
│ rpCustomText                     │ 38      │ string               │
│ darkMode                         │ 28      │ boolean              │
│ bgmEnabled                       │ 44      │ boolean              │
│ bgmFilePath                      │ 46-48   │ string path          │
│ autosaveEnabled                  │ 57      │ boolean              │
│ autosaveInterval                 │ 58      │ number (ms)          │
│ layoutState                      │ 112-120 │ complex object       │
│ dirtyFields                      │ 13      │ Set<string>          │
│ activeTabId                      │ 10      │ string|null          │
│ formEditors                      │ 41      │ array of Monaco inst.│
└──────────────────────────────────┴─────────┴──────────────────────┘

SINGLETON PATTERN:
  export const UIState = {
    // Chat state
    get chatMode() { return localStorage.getItem('toki-chat-mode') === 'true'; },
    set chatMode(v) { localStorage.setItem('toki-chat-mode', v); },
    
    // RP Mode
    get rpMode() { /* migrate old boolean */ },
    set rpMode(v) { localStorage.setItem('toki-rp-mode', v); },
    
    // Getters for UI toggles
    isDarkMode() { /* check isDarkModeEnabled() */ },
    toggleDarkMode() { /* call applyDarkMode() */ },
    
    // Layout persistence
    saveLayout() { localStorage.setItem('toki-layout-state', JSON.stringify(layoutState)); },
    loadLayout() { /* restore from localStorage */ },
    
    // Dirty tracking (for editor tabs)
    dirtyFields: new Set(),
    markDirty(tabId) { this.dirtyFields.add(tabId); },
    clearDirty() { this.dirtyFields.clear(); }
  }


════════════════════════════════════════════════════════════════════════════════
BEFORE & AFTER CODE EXAMPLES
════════════════════════════════════════════════════════════════════════════════

Example 1: Duplicated stripAnsi() elimination
──────────────────────────────────────────────

BEFORE (Current code with duplication):

  // app/controller.js, line 5068
  function stripAnsi(str) {
    return str
      .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
      .replace(/\x1B\[[012]?C/g, ' ')   ← OPTIMIZATION: main has this
      .replace(/\x1B\[\d*[ABDEFGHJKSTfn]/g, '\n')
      // ... 8 more patterns ...
  }
  
  // popout/controller.js, line 1225
  function stripAnsi(str) {
    return str
      .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
      // MISSING: the [012]?C optimization!
      .replace(/\x1B\[\d*C/g, '\n')    ← BROKEN: all cursor moves → newline
      // ... only 6 patterns ...
  }

AFTER (Extracted to shared module):

  // src/lib/chat-engine.js
  export function stripAnsi(str) {
    return str
      .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
      .replace(/\x1B\[[012]?C/g, ' ')      ← Main's better version
      .replace(/\x1B\[\d*[ABDEFGHJKSTfn]/g, '\n')
      // ... complete implementation ...
  }
  
  // app/controller.js (updated, line 5068 removed)
  import { stripAnsi } from './lib/chat-engine.js';
  
  // popout/controller.js (updated, line 1225 removed)
  import { stripAnsi } from './lib/chat-engine.js';

RESULT: 
  • Main keeps original behavior (better)
  • Popout gets upgraded (word spacing fixed!)
  • Single source of truth
  • Savings: 81 lines total


Example 2: Duplicated onChatData() consolidation
────────────────────────────────────────────────

BEFORE (Identical logic in 2 places):

  // app/controller.js, line 4879
  function onChatData(rawData) {
    if (chatWaitForInput) return;
    const text = stripAnsi(rawData);
    if (!text || text.trim().length < 2) return;
    if (isSpinnerNoise(text)) return;
    chatBuffer += text;
    if (!chatIsStreaming) {
      chatIsStreaming = true;
      chatMessages.push({ type: 'system', text: '' });
      renderChatMessages();
      chatMaxTimer = setTimeout(finalizeChatResponse, 4000);
    }
    if (chatBufferTimer) clearTimeout(chatBufferTimer);
    chatBufferTimer = setTimeout(finalizeChatResponse, 1500);
  }
  
  // popout/controller.js, line 357 (IDENTICAL!)
  function onPopoutChatData(rawData) {
    if (popoutChatWaitForInput) return;
    const text = stripAnsi(rawData);
    if (!text || text.trim().length < 2) return;
    if (isSpinnerNoise(text)) return;
    popoutChatBuffer += text;
    if (!popoutChatIsStreaming) {
      popoutChatIsStreaming = true;
      popoutChatMessages.push({ type: 'system', text: '' });
      renderPopoutChat();
      popoutChatMaxTimer = setTimeout(finalizePopoutChat, 4000);
    }
    if (popoutChatBufferTimer) clearTimeout(popoutChatBufferTimer);
    popoutChatBufferTimer = setTimeout(finalizePopoutChat, 1500);
  }

AFTER (Shared ChatStreamBuffer class):

  // src/lib/terminal-stream.js
  export class ChatStreamBuffer {
    constructor(options = {}) {
      this.onRenderUpdate = options.onRenderUpdate || (() => {});
      this.buffer = '';
      this.messages = [];
      this.isStreaming = false;
      this.waitForInput = true;
      this.bufferTimer = null;
      this.maxTimer = null;
    }
    
    onData(rawData) {
      if (this.waitForInput) return;
      const text = stripAnsi(rawData);
      if (!text || text.trim().length < 2) return;
      if (isSpinnerNoise(text)) return;
      
      this.buffer += text;
      
      if (!this.isStreaming) {
        this.isStreaming = true;
        this.messages.push({ type: 'system', text: '' });
        this.onRenderUpdate();
        this.maxTimer = setTimeout(() => this.finalize(), 4000);
      }
      
      if (this.bufferTimer) clearTimeout(this.bufferTimer);
      this.bufferTimer = setTimeout(() => this.finalize(), 1500);
    }
  }
  
  // app/controller.js (updated)
  import { ChatStreamBuffer } from './lib/terminal-stream.js';
  
  const chatStream = new ChatStreamBuffer({
    onRenderUpdate: () => renderChatMessages()
  });
  
  // Terminal data event handler (from xterm):
  term.onData((data) => chatStream.onData(data));
  
  // popout/controller.js (updated)
  import { ChatStreamBuffer } from './lib/terminal-stream.js';
  
  const popoutChatStream = new ChatStreamBuffer({
    onRenderUpdate: () => renderPopoutChat()
  });
  
  // Terminal data handler (from popout xterm):
  popoutTerm.onData((data) => popoutChatStream.onData(data));

RESULT:
  • 50 lines of duplication eliminated
  • Logic in ONE place (easier to fix bugs)
  • Both main and popout benefit from fixes
  • Savings: ~50 lines


════════════════════════════════════════════════════════════════════════════════
TESTING STRATEGY - DETAILED EXAMPLES
════════════════════════════════════════════════════════════════════════════════

Test File 1: src/lib/chat-engine.test.js (40+ tests)
──────────────────────────────────────────────────

describe('stripAnsi', () => {
  it('removes CSI color codes', () => {
    const input = 'hello\x1B[31mred\x1B[0mworld';
    const output = stripAnsi(input);
    expect(output).toBe('helloredworld');
  });
  
  it('converts small cursor forward (1-2) to space for word spacing', () => {
    const input = 'esc\x1B[1Cto\x1B[2Cinterrupt';
    const output = stripAnsi(input);
    expect(output).toBe('esc to interrupt');  // NOT 'esc\nto\ninterrupt'!
  });
  
  it('converts large cursor forward (3+) to newline', () => {
    const input = 'line1\x1B[5Cline2';
    const output = stripAnsi(input);
    expect(output).toBe('line1\nline2');
  });
  
  it('removes OSC sequences before processing other escapes', () => {
    const input = '\x1B]0;Title\x07text';
    const output = stripAnsi(input);
    expect(output).toBe('text');  // OSC must be removed FIRST
  });
});

describe('cleanTuiOutput', () => {
  it('filters spinner messages', () => {
    const inputs = [
      'Thinking...\nResult',
      'Processing...\nResult',
      'Warming...\nResult',
      'Spinning...\nResult'
    ];
    for (const input of inputs) {
      expect(cleanTuiOutput(input)).toBe('Result');
    }
  });
  
  it('removes terminal UI hints', () => {
    const tests = [
      { input: 'Output\nType here to tell Claude\nMore', expected: 'Output\nMore' },
      { input: 'Output\nEsc to cancel\nMore', expected: 'Output\nMore' },
      { input: 'Output\nEnter to select\nMore', expected: 'Output\nMore' }
    ];
    for (const test of tests) {
      expect(cleanTuiOutput(test.input)).toBe(test.expected);
    }
  });
  
  it('preserves intentional blank lines', () => {
    const input = 'Line 1\n\nLine 2\n\nLine 3';
    const output = cleanTuiOutput(input);
    expect(output).toBe('Line 1\n\nLine 2\n\nLine 3');
  });
  
  it('collapses multiple blank lines into one', () => {
    const input = 'Line 1\n\n\n\nLine 2';
    const output = cleanTuiOutput(input);
    expect(output).toBe('Line 1\n\nLine 2');
  });
  
  it('detects and formats assistant welcome info', () => {
    const input = '--- Claude Code ---\nModel: claude-3\n(user@example.com)\n/path/to/project';
    const output = cleanTuiOutput(input);
    expect(output).toContain('Claude Code');
    expect(output).toContain('claude-3');
    expect(output).toContain('user@example.com');
    expect(output).toContain('준비 완료!');
  });
});


Test File 2: src/lib/terminal-stream.test.js (20+ tests)
─────────────────────────────────────────────────────

describe('ChatStreamBuffer', () => {
  it('accumulates data into buffer', () => {
    let finalContent = '';
    const buffer = new ChatStreamBuffer({
      onFinalize: (content) => { finalContent = content; }
    });
    
    buffer.waitForInput = false;
    buffer.onData('Hello ');
    buffer.onData('world');
    
    expect(buffer.buffer).toBe('Hello world');
  });
  
  it('respects soft cap (1500ms debounce)', async () => {
    let finalizedAt = 0;
    const buffer = new ChatStreamBuffer({
      onFinalize: () => { finalizedAt = Date.now(); }
    });
    
    buffer.waitForInput = false;
    const startTime = Date.now();
    buffer.onData('text');
    
    // Should NOT finalize yet
    await sleep(500);
    expect(finalizedAt).toBe(0);
    
    // Should finalize after debounce
    await sleep(1100);  // Total 1600ms
    expect(finalizedAt).toBeGreaterThan(0);
    expect(finalizedAt - startTime).toBeGreaterThanOrEqual(1500);
  });
  
  it('enforces hard cap (4000ms max)', async () => {
    let finalizedCount = 0;
    let finalizeTime = 0;
    const buffer = new ChatStreamBuffer({
      onFinalize: () => { 
        finalizedCount++; 
        finalizeTime = Date.now();
      }
    });
    
    buffer.waitForInput = false;
    const startTime = Date.now();
    
    // Simulate continuous data arriving
    for (let i = 0; i < 10; i++) {
      buffer.onData('chunk');
      await sleep(500);  // Data every 500ms
    }
    
    // Finalize should have been called once at ~4000ms
    expect(finalizeTime - startTime).toBeGreaterThanOrEqual(4000);
    expect(finalizeTime - startTime).toBeLessThan(4200);
  });
  
  it('filters input echo (lastSentCmd)', () => {
    let finalContent = '';
    const buffer = new ChatStreamBuffer({
      onFinalize: (content) => { finalContent = content; }
    });
    
    buffer.waitForInput = false;
    buffer.lastSentCmd = 'hello';
    buffer.onData('hello\nresponse');
    
    // After finalize, should not contain echoed command
    buffer.finalize();
    expect(finalContent).not.toContain('hello\nresponse');
    expect(finalContent).toContain('response');
  });
});


════════════════════════════════════════════════════════════════════════════════
INTEGRATION CHECKLIST
════════════════════════════════════════════════════════════════════════════════

After extracting each module:

□ Tests all pass (100% for extracted code)
□ No console errors in Chrome DevTools
□ Main window chat mode works
□ Popout chat mode works
□ stripAnsi word spacing (esc to interrupt) displays correctly
□ Terminal spinners filtered in both windows
□ Timer finalization fires at correct time
□ No memory leaks (check Task Manager)
□ Performance unchanged (<5ms latency for terminal data)


════════════════════════════════════════════════════════════════════════════════
