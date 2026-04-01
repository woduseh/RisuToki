/**
 * Preview Pipeline Contract Tests
 *
 * Defines and locks the preview pipeline contract — the exact order and
 * semantics of regex / Lua / CBS / lorebook / debug operations.
 *
 * Downstream work (close-cbs-preview-gaps, align-lorebook-preview-flow)
 * depends on these expectations being stable.
 */
import { describe, expect, it } from 'vitest';
import { buildPreviewDebugClipboardText, renderPreviewDebugHtml } from './preview-debug';
import { createPreviewSession } from './preview-session';
import type { PreviewLoreDecorators } from './lorebook-decorators';
import type {
  CreatePreviewSessionOptions,
  PreviewCharData,
  PreviewEngine,
  PreviewLorebookEntry,
  PreviewLoreMatch,
  PreviewMessage,
  PreviewRegexScript,
  PreviewSnapshot,
} from './preview-session';

// ── Call-recording engine ────────────────────────────────────────────

interface PipelineCall {
  op: string;
  type?: string;
  runVar?: boolean;
  triggerName?: string;
}

function createRecordingEngine() {
  const calls: PipelineCall[] = [];
  const variables: Record<string, unknown> = {};
  let charName = '';
  let luaHtml = '';
  const luaOutput: string[] = [];

  const engine: PreviewEngine & { calls: PipelineCall[] } = {
    calls,

    async initLua() {
      calls.push({ op: 'initLua' });
      return true;
    },

    matchLorebook(messages: PreviewMessage[], lore: PreviewLorebookEntry[]): PreviewLoreMatch[] {
      calls.push({ op: 'matchLorebook' });
      return lore.flatMap((entry, index) => {
        if (entry.mode === 'folder') return [];
        const pct = entry.activationPercent as number | undefined | null;
        if (pct === 0) return [];

        let matched = false;
        let reason = '';

        if (entry.alwaysActive) {
          matched = true;
          reason = '항상 활성';
        } else {
          const key = entry.key;
          if (typeof key === 'string' && key !== '' && messages.some((m) => String(m.content).includes(key))) {
            matched = true;
            reason = '키 매칭';
          }
        }

        if (!matched) return [];
        const result: PreviewLoreMatch = { index, reason };
        if (pct != null && pct > 0 && pct < 100) {
          result.activationPercent = pct;
        }
        return [result];
      });
    },

    onReloadDisplay() {},

    processRegex(content: string, scripts: PreviewRegexScript[], type?: string) {
      calls.push({ op: 'processRegex', type });
      for (const s of scripts) {
        if (s.type !== type || s.ableFlag === false) continue;
        const find = s.find || s.in || '';
        const replace = s.replace || s.out || '';
        try {
          content = content.replace(new RegExp(find, 'g'), replace);
        } catch {
          /* skip invalid regex */
        }
      }
      return content;
    },

    resetVars() {
      for (const k of Object.keys(variables)) delete variables[k];
      luaOutput.length = 0;
      luaHtml = '';
    },

    resolveAssetImages(content: string) {
      calls.push({ op: 'resolveAssetImages' });
      return content;
    },

    risuChatParser(content: string, options?: { runVar?: boolean }) {
      calls.push({ op: 'risuChatParser', runVar: options?.runVar ?? false });
      return content.replace('{{char}}', charName);
    },

    async runLuaButtonClick() {},

    async runLuaTrigger(name: string, payload: string | null) {
      calls.push({ op: 'runLuaTrigger', triggerName: name });
      if (name === 'input') variables.lastInput = payload;
      if (name === 'output') variables.lastOutput = payload;
      return payload;
    },

    async runLuaTriggerByName(name: string) {
      calls.push({ op: 'runLuaTriggerByName', triggerName: name });
    },

    setAssets() {},
    setCharDescription() {},
    setCharFirstMessage() {},
    setCharName(name: string) {
      charName = name;
    },
    setChatVar(name: string, value: unknown) {
      variables[name] = value;
    },
    setDefaultVars() {},
    setLorebook() {},
    setUserName() {},

    getLuaOutput() {
      return [...luaOutput];
    },
    getLuaOutputHTML() {
      return luaHtml;
    },
    getVariables() {
      return { ...variables };
    },
  };

  return engine;
}

// ── Test helpers ─────────────────────────────────────────────────────

function createTestFrame() {
  const contentDocument = document.implementation.createHTMLDocument('preview');
  const contentWindow = {
    document: contentDocument,
    postMessage() {},
  } as unknown as MessageEventSource & { document: Document; postMessage: (m: unknown, o: string) => void };
  return { contentDocument, contentWindow };
}

function createTestWindowTarget() {
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    addEventListener(_t: string, fn: (event: MessageEvent) => void) {
      listeners.add(fn);
    },
    removeEventListener(_t: string, fn: (event: MessageEvent) => void) {
      listeners.delete(fn);
    },
    dispatchMessage(event: MessageEvent) {
      for (const fn of listeners) fn(event);
    },
  };
}

function makeSession(
  engine: PreviewEngine,
  charData: Partial<PreviewCharData> = {},
  extras: Partial<CreatePreviewSessionOptions> = {},
) {
  return createPreviewSession({
    engine,
    charData: {
      name: 'TestChar',
      description: 'desc',
      firstMessage: 'Hello!',
      defaultVariables: '',
      css: '',
      lorebook: [],
      regex: [],
      lua: '-- test',
      ...charData,
    },
    chatFrame: createTestFrame(),
    windowTarget: createTestWindowTarget(),
    ...extras,
  });
}

/**
 * Extract only transform-pipeline calls (processRegex, risuChatParser,
 * runLuaTrigger with edit* names, resolveAssetImages) from the call log.
 */
function extractTransformCalls(calls: PipelineCall[]): PipelineCall[] {
  const editTriggers = new Set(['editOutput', 'editDisplay', 'editInput', 'editRequest']);
  return calls.filter((c) => {
    if (c.op === 'processRegex') return true;
    if (c.op === 'risuChatParser') return true;
    if (c.op === 'resolveAssetImages') return true;
    if (c.op === 'runLuaTrigger' && editTriggers.has(c.triggerName!)) return true;
    return false;
  });
}

// ── Contract tests ───────────────────────────────────────────────────

describe('preview pipeline contract: transform order', () => {
  it('char role pipeline: regex(editoutput) → lua(editOutput) → cbs(runVar:true) → regex(editdisplay) → cbs(runVar:true) → lua(editDisplay) → cbs(runVar:false) → resolveAssets', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine);
    await session.initialize();

    // Clear all calls accumulated during initialization
    engine.calls.length = 0;

    const input = document.createElement('textarea');
    input.value = 'Hi';
    await session.handleSend(input);

    // handleSend produces both a user transform and a char transform.
    // Extract only transform-pipeline calls.
    const transformCalls = extractTransformCalls(engine.calls);

    // User transform (first 4 calls)
    const userCalls = transformCalls.slice(0, 4);
    expect(userCalls).toEqual([
      { op: 'processRegex', type: 'editinput' },
      { op: 'runLuaTrigger', triggerName: 'editInput' },
      { op: 'risuChatParser', runVar: true },
      { op: 'resolveAssetImages' },
    ]);

    // Char transform (next 8 calls)
    const charCalls = transformCalls.slice(4, 12);
    expect(charCalls).toEqual([
      { op: 'processRegex', type: 'editoutput' },
      { op: 'runLuaTrigger', triggerName: 'editOutput' },
      { op: 'risuChatParser', runVar: true },
      { op: 'processRegex', type: 'editdisplay' },
      { op: 'risuChatParser', runVar: true },
      { op: 'runLuaTrigger', triggerName: 'editDisplay' },
      { op: 'risuChatParser', runVar: false },
      { op: 'resolveAssetImages' },
    ]);
  });

  it('user role pipeline: regex(editinput) → lua(editInput) → cbs(runVar:true) → resolveAssets', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine);
    await session.initialize();
    engine.calls.length = 0;

    const input = document.createElement('textarea');
    input.value = 'test';
    await session.handleSend(input);

    const userCalls = extractTransformCalls(engine.calls).slice(0, 4);
    expect(userCalls).toEqual([
      { op: 'processRegex', type: 'editinput' },
      { op: 'runLuaTrigger', triggerName: 'editInput' },
      { op: 'risuChatParser', runVar: true },
      { op: 'resolveAssetImages' },
    ]);
  });

  it('handleSend orchestration: user-transform → lua(input) → lua(output) → char-transform → background refresh', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine);
    await session.initialize();
    engine.calls.length = 0;

    const input = document.createElement('textarea');
    input.value = 'test';
    await session.handleSend(input);

    // Extract session-level Lua triggers (input/output/start) — not edit* triggers
    const sessionTriggers = engine.calls
      .filter((c) => c.op === 'runLuaTrigger' && !c.triggerName!.startsWith('edit'))
      .map((c) => c.triggerName);

    expect(sessionTriggers).toEqual(['input', 'output']);

    // Verify resolveAssetImages appears exactly twice (user msg + char msg)
    // plus potentially once more for background if luaHtml exists
    const assetCalls = engine.calls.filter((c) => c.op === 'resolveAssetImages');
    expect(assetCalls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('preview pipeline contract: snapshot semantics', () => {
  it('snapshot before initialize has empty messages and lua=false', () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine);
    const snap = session.getSnapshot();

    expect(snap.messages).toEqual([]);
    expect(snap.luaInitialized).toBe(false);
    expect(snap.loreMatches).toEqual([]);
    expect(snap.luaOutput).toEqual([]);
  });

  it('snapshot after initialize has first message and lua=true', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, { lua: '-- code' });
    await session.initialize();
    const snap = session.getSnapshot();

    expect(snap.messages).toHaveLength(1);
    expect(snap.messages[0].role).toBe('char');
    expect(snap.luaInitialized).toBe(true);
  });

  it('messages store raw content, not transformed/rendered content', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, { firstMessage: '{{char}}가 인사합니다' });
    await session.initialize();

    const snap = session.getSnapshot();
    // Raw content preserved — CBS macro NOT expanded in snapshot
    expect(snap.messages[0].content).toBe('{{char}}가 인사합니다');
  });

  it('loreMatches are computed live on each getSnapshot() call', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, {
      firstMessage: 'Hello!',
      lorebook: [{ comment: 'greet-lore', key: 'Hi', mode: 'normal' }],
    });
    await session.initialize();

    // After init with firstMessage "Hello!" — key "Hi" does NOT match
    expect(session.getSnapshot().loreMatches).toEqual([]);

    // After sending "Hi" — key now matches user message
    const input = document.createElement('textarea');
    input.value = 'Hi there';
    await session.handleSend(input);

    const snap = session.getSnapshot();
    expect(snap.loreMatches).toEqual([{ index: 0, reason: '키 매칭' }]);
  });

  it('snapshot variables reflect engine state at query time', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine);
    await session.initialize();

    expect(session.getSnapshot().variables).toEqual({});

    // Simulate variable set via engine (as if CBS {{setvar}} ran)
    engine.setChatVar('mood', 'happy');

    expect(session.getSnapshot().variables).toEqual({ mood: 'happy' });
  });

  it('snapshot is a defensive copy — mutations do not affect session state', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, { firstMessage: 'Hi' });
    await session.initialize();

    const snap1 = session.getSnapshot();
    snap1.messages.push({ role: 'user', content: 'injected' });
    snap1.messages[0].content = 'tampered';

    const snap2 = session.getSnapshot();
    expect(snap2.messages).toHaveLength(1);
    expect(snap2.messages[0].content).toBe('Hi');
  });
});

describe('preview pipeline contract: lorebook activation', () => {
  it('activates entries whose key matches raw message content', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, {
      firstMessage: '안녕하세요',
      lorebook: [
        { comment: 'greeting-lore', key: '안녕', mode: 'normal' },
        { comment: 'unmatched', key: '작별', mode: 'normal' },
      ],
    });
    await session.initialize();

    const snap = session.getSnapshot();
    expect(snap.loreMatches).toEqual([{ index: 0, reason: '키 매칭' }]);
  });

  it('activates alwaysActive entries regardless of message content', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, {
      firstMessage: 'Hello',
      lorebook: [
        { comment: 'world-rules', key: '', mode: 'normal', alwaysActive: true },
        { comment: 'unmatched', key: 'xyz', mode: 'normal' },
      ],
    });
    await session.initialize();

    const snap = session.getSnapshot();
    expect(snap.loreMatches).toEqual([{ index: 0, reason: '항상 활성' }]);
  });

  it('does not activate entries with empty key and alwaysActive=false', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, {
      firstMessage: 'Hello',
      lorebook: [{ comment: 'db-only', key: '', mode: 'normal', alwaysActive: false }],
    });
    await session.initialize();

    expect(session.getSnapshot().loreMatches).toEqual([]);
  });

  it('skips folder entries for matching but includes them in lorebook array', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, {
      firstMessage: 'Hello',
      lorebook: [
        { comment: 'folder', key: 'uuid-123', mode: 'folder' },
        { comment: 'entry', key: 'Hello', mode: 'normal' },
      ],
    });
    await session.initialize();

    const snap = session.getSnapshot();
    // The folder entry is in the lorebook array (available for debug display)
    expect(snap.lorebook).toHaveLength(2);
    expect(snap.lorebook[0].mode).toBe('folder');
    // Only the normal entry matches
    expect(snap.loreMatches).toEqual([{ index: 1, reason: '키 매칭' }]);
  });

  it('matches lorebook against ALL accumulated messages, not just the latest', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, {
      firstMessage: 'Welcome',
      lorebook: [
        { comment: 'first-msg-lore', key: 'Welcome', mode: 'normal' },
        { comment: 'user-lore', key: 'trigger-word', mode: 'normal' },
      ],
    });
    await session.initialize();

    const input = document.createElement('textarea');
    input.value = 'trigger-word here';
    await session.handleSend(input);

    const snap = session.getSnapshot();
    // Both entries match — one from firstMessage, one from user input
    const matchedIndices = snap.loreMatches.map((m) => m.index).sort();
    expect(matchedIndices).toEqual([0, 1]);
  });

  it('activationPercent: 0 prevents entry from appearing in loreMatches', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, {
      firstMessage: 'Hello world',
      lorebook: [
        { comment: 'blocked', key: 'Hello', mode: 'normal', activationPercent: 0 },
        { comment: 'normal', key: 'world', mode: 'normal' },
      ],
    });
    await session.initialize();

    const snap = session.getSnapshot();
    expect(snap.loreMatches).toEqual([{ index: 1, reason: '키 매칭' }]);
  });

  it('activationPercent between 1-99 activates with probability annotation for authoring', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, {
      firstMessage: 'Hello world',
      lorebook: [{ comment: 'probabilistic', key: 'Hello', mode: 'normal', activationPercent: 70 }],
    });
    await session.initialize();

    const snap = session.getSnapshot();
    expect(snap.loreMatches).toHaveLength(1);
    expect(snap.loreMatches[0]).toEqual({ index: 0, reason: '키 매칭', activationPercent: 70 });
  });
});

describe('preview pipeline contract: regex type routing', () => {
  it('editoutput and editdisplay scripts transform char messages', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, {
      firstMessage: 'raw-output',
      regex: [
        { type: 'editoutput', comment: 'out-rewrite', find: 'raw-output', replace: 'edited-output', ableFlag: true },
        {
          type: 'editdisplay',
          comment: 'display-rewrite',
          find: 'edited-output',
          replace: 'displayed',
          ableFlag: true,
        },
        {
          type: 'editinput',
          comment: 'input-rewrite',
          find: 'raw-output',
          replace: 'SHOULD-NOT-APPEAR',
          ableFlag: true,
        },
      ],
    });
    await session.initialize();

    // The char message goes through editoutput → editdisplay pipeline.
    // editinput is NOT applied to char messages.
    const chatText = session.getSnapshot().messages[0].content;
    // Raw content is preserved in snapshot
    expect(chatText).toBe('raw-output');

    // Verify the engine was called with correct types for the first message
    const regexCalls = engine.calls.filter((c) => c.op === 'processRegex');
    const charRegexTypes = regexCalls.map((c) => c.type);
    expect(charRegexTypes).toContain('editoutput');
    expect(charRegexTypes).toContain('editdisplay');
  });

  it('editinput scripts transform user messages', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, {
      regex: [
        { type: 'editinput', comment: 'input-rewrite', find: 'hello', replace: 'modified', ableFlag: true },
        { type: 'editoutput', comment: 'out-rewrite', find: 'hello', replace: 'WRONG', ableFlag: true },
      ],
    });
    await session.initialize();
    engine.calls.length = 0;

    const input = document.createElement('textarea');
    input.value = 'hello world';
    await session.handleSend(input);

    // First processRegex call should be editinput (for the user message)
    const firstRegex = engine.calls.find((c) => c.op === 'processRegex');
    expect(firstRegex?.type).toBe('editinput');
  });

  it('disabled scripts (ableFlag=false) are included in snapshot but do not transform content', async () => {
    const engine = createRecordingEngine();
    const disabledScript: PreviewRegexScript = {
      type: 'editoutput',
      comment: 'disabled',
      find: 'Hello',
      replace: 'REPLACED',
      ableFlag: false,
    };
    const session = makeSession(engine, {
      firstMessage: 'Hello!',
      regex: [disabledScript],
    });
    await session.initialize();

    // Script is in the snapshot for debug display
    expect(session.getSnapshot().scripts).toHaveLength(1);
    expect(session.getSnapshot().scripts[0].ableFlag).toBe(false);
  });
});

describe('preview pipeline contract: session lifecycle', () => {
  it('reset restores session to post-initialize state with fresh first message', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, { firstMessage: 'First!' });
    await session.initialize();

    const input = document.createElement('textarea');
    input.value = 'user msg';
    await session.handleSend(input);
    expect(session.getSnapshot().messages).toHaveLength(3);

    await session.reset();
    const snap = session.getSnapshot();

    expect(snap.messages).toHaveLength(1);
    expect(snap.messages[0]).toEqual({ role: 'char', content: 'First!' });
    expect(snap.luaInitialized).toBe(true);
  });

  it('initialize can be called multiple times to fully reset', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, { firstMessage: 'Init!' });

    await session.initialize();
    engine.setChatVar('x', 1);
    expect(session.getSnapshot().variables.x).toBe(1);

    await session.initialize();
    // Variables should be reset by resetVars() during initialize
    expect(session.getSnapshot().variables.x).toBeUndefined();
    expect(session.getSnapshot().messages).toHaveLength(1);
  });

  it('session without any effective lua source reports luaInitialized=false', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, { lua: '', triggerScripts: [] });
    await session.initialize();

    expect(session.getSnapshot().luaInitialized).toBe(false);
  });

  it('session without firstMessage initializes with empty message list', async () => {
    const engine = createRecordingEngine();
    const session = makeSession(engine, { firstMessage: '' });
    await session.initialize();

    expect(session.getSnapshot().messages).toEqual([]);
  });
});

describe('preview pipeline contract: debug snapshot rendering', () => {
  it('debug clipboard text reflects lorebook activation count excluding folders', () => {
    const snapshot: PreviewSnapshot = {
      messages: [{ role: 'char', content: 'Hello' }],
      luaInitialized: true,
      variables: {},
      lorebook: [
        { comment: 'folder', key: '', mode: 'folder' },
        { comment: 'entry1', key: 'k1', mode: 'normal' },
        { comment: 'entry2', key: 'k2', mode: 'normal' },
      ],
      loreMatches: [{ index: 1, reason: '키 매칭' }],
      scripts: [],
      defaultVariables: '',
      luaOutput: [],
      initState: 'ready',
      initError: null,
      runtimeError: null,
    };

    const text = buildPreviewDebugClipboardText(snapshot, '00:00:00');
    // Count excludes folder entries
    expect(text).toContain('[로어북] 2개');
  });

  it('debug lorebook tab shows activation status from loreMatches set', () => {
    const snapshot: PreviewSnapshot = {
      messages: [],
      luaInitialized: false,
      variables: {},
      lorebook: [
        { comment: 'active-entry', key: 'word', mode: 'normal', alwaysActive: false },
        { comment: 'inactive-entry', key: 'other', mode: 'normal', alwaysActive: false },
        { comment: 'always-entry', key: '', mode: 'normal', alwaysActive: true },
      ],
      loreMatches: [
        { index: 0, reason: '키 매칭' },
        { index: 2, reason: '항상 활성' },
      ],
      scripts: [],
      defaultVariables: '',
      luaOutput: [],
      initState: 'ready',
      initError: null,
      runtimeError: null,
    };

    const html = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot });

    expect(html).toContain('🟢 키 매칭');
    expect(html).toContain('⚫'); // inactive entry with key
    expect(html).toContain('🟢 항상'); // alwaysActive renders as "항상"
  });

  it('debug regex tab groups active scripts by type and shows disabled separately', () => {
    const snapshot: PreviewSnapshot = {
      messages: [],
      luaInitialized: false,
      variables: {},
      lorebook: [],
      loreMatches: [],
      scripts: [
        { type: 'editinput', comment: 'active-in', find: 'a', replace: 'b', ableFlag: true },
        { type: 'editinput', comment: 'disabled-in', find: 'c', replace: 'd', ableFlag: false },
        { type: 'editoutput', comment: 'active-out', find: 'e', replace: 'f', ableFlag: true },
      ],
      defaultVariables: '',
      luaOutput: [],
      initState: 'ready',
      initError: null,
      runtimeError: null,
    };

    const html = renderPreviewDebugHtml({ activeTab: 'regex', snapshot });

    // Groups with counts (disabled excluded from active count)
    expect(html).toContain('editinput (1)');
    expect(html).toContain('editoutput (1)');
    expect(html).toContain('active-in');
    expect(html).toContain('active-out');
    // Disabled scripts shown in separate section
    expect(html).toContain('disabled-in');
    expect(html).toContain('비활성 (1)');
  });

  it('debug variables tab shows defaultVariables raw text', () => {
    const snapshot: PreviewSnapshot = {
      messages: [],
      luaInitialized: false,
      variables: { hp: 100 },
      lorebook: [],
      loreMatches: [],
      scripts: [],
      defaultVariables: 'hp=100\nmp=50',
      luaOutput: [],
      initState: 'ready',
      initError: null,
      runtimeError: null,
    };

    const html = renderPreviewDebugHtml({ activeTab: 'variables', snapshot });
    expect(html).toContain('hp');
    expect(html).toContain('100');
    expect(html).toContain('hp=100');
    expect(html).toContain('mp=50');
  });

  it('debug lorebook tab shows 🟡 for probabilistic entries and ⛔ for zero-percent', () => {
    const snapshot: PreviewSnapshot = {
      messages: [],
      luaInitialized: false,
      variables: {},
      lorebook: [
        { comment: 'prob-entry', key: 'word', mode: 'normal', activationPercent: 70 },
        { comment: 'zero-entry', key: 'other', mode: 'normal', activationPercent: 0 },
        { comment: 'normal-entry', key: 'thing', mode: 'normal' },
      ],
      loreMatches: [{ index: 0, reason: '키 매칭', activationPercent: 70 }],
      scripts: [],
      defaultVariables: '',
      luaOutput: [],
      initState: 'ready',
      initError: null,
      runtimeError: null,
    };

    const html = renderPreviewDebugHtml({ activeTab: 'lorebook', snapshot });
    expect(html).toContain('🟡'); // probabilistic active
    expect(html).toContain('(70%)'); // probability annotation
    expect(html).toContain('⛔ 0%'); // zero percent blocked
    expect(html).toContain('⚫'); // normal inactive with key
  });
});

// ── PreviewLoreMatch extended shape contract ────────────────────────
describe('preview pipeline contract: PreviewLoreMatch extended shape', () => {
  it('minimal match requires only index and reason', () => {
    const match: PreviewLoreMatch = { index: 0, reason: '키 매칭' };
    expect(match).toEqual({ index: 0, reason: '키 매칭' });
  });

  it('accepts all optional metadata fields', () => {
    const decorators: PreviewLoreDecorators = {
      depth: 4,
      role: 'system',
      scanDepth: 10,
      probability: 80,
      additionalKeys: ['extra'],
      excludeKeys: ['noMatch'],
    };
    const match: PreviewLoreMatch = {
      index: 3,
      reason: '키 매칭',
      activationPercent: 80,
      decorators,
      matchedKeys: ['hello', 'world'],
      excludedKeys: ['secret'],
      effectiveScanDepth: 10,
      probabilityRoll: 42,
      warnings: ['@@probability: value 120 clamped to 100'],
    };

    expect(match.index).toBe(3);
    expect(match.reason).toBe('키 매칭');
    expect(match.activationPercent).toBe(80);
    expect(match.decorators).toBe(decorators);
    expect(match.matchedKeys).toEqual(['hello', 'world']);
    expect(match.excludedKeys).toEqual(['secret']);
    expect(match.effectiveScanDepth).toBe(10);
    expect(match.probabilityRoll).toBe(42);
    expect(match.warnings).toEqual(['@@probability: value 120 clamped to 100']);
  });

  it('new optional fields default to undefined when omitted', () => {
    const match: PreviewLoreMatch = { index: 1, reason: '항상 활성' };
    expect(match.decorators).toBeUndefined();
    expect(match.matchedKeys).toBeUndefined();
    expect(match.excludedKeys).toBeUndefined();
    expect(match.effectiveScanDepth).toBeUndefined();
    expect(match.probabilityRoll).toBeUndefined();
    expect(match.warnings).toBeUndefined();
  });

  it('PreviewSnapshot.loreMatches accepts extended matches', () => {
    const snapshot: PreviewSnapshot = {
      messages: [{ role: 'user', content: 'hello' }],
      luaInitialized: false,
      variables: {},
      lorebook: [{ comment: 'entry', key: 'hello', mode: 'normal' }],
      loreMatches: [
        {
          index: 0,
          reason: '키 매칭',
          matchedKeys: ['hello'],
          decorators: { depth: 2 },
          effectiveScanDepth: 5,
        },
      ],
      scripts: [],
      defaultVariables: '',
      luaOutput: [],
      initState: 'ready',
      initError: null,
      runtimeError: null,
    };

    const match = snapshot.loreMatches[0];
    expect(match.index).toBe(0);
    expect(match.matchedKeys).toEqual(['hello']);
    expect(match.decorators?.depth).toBe(2);
    expect(match.effectiveScanDepth).toBe(5);
    // Existing fields still present
    expect(match.reason).toBe('키 매칭');
  });

  it('decorators field uses PreviewLoreDecorators type from lorebook-decorators', () => {
    const decs: PreviewLoreDecorators = {
      activate: true,
      matchFullWord: true,
      position: 'end',
    };
    const match: PreviewLoreMatch = {
      index: 5,
      reason: '항상 활성',
      decorators: decs,
    };
    expect(match.decorators?.activate).toBe(true);
    expect(match.decorators?.matchFullWord).toBe(true);
    expect(match.decorators?.position).toBe('end');
  });
});
