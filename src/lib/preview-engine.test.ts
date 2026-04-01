import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewEngine } from './preview-engine';
import type { PreviewLorebookEntry, PreviewMessage } from './preview-session';

describe('PreviewEngine CBS parity', () => {
  it('records declare side effects in preview variables', () => {
    PreviewEngine.resetVars();

    const output = PreviewEngine.risuChatParser('alpha {{declare::preview_flag}} omega', { runVar: true });

    expect(output).toBe('alpha  omega');
    expect(PreviewEngine.getChatVar('__declared_preview_flag__')).toBe('1');
    expect(PreviewEngine.getVariables()).toMatchObject({
      $__declared_preview_flag__: '1',
    });
  });

  it('normalizes #code blocks like upstream parser semantics', () => {
    PreviewEngine.resetVars();

    const output = PreviewEngine.risuChatParser('{{#code}}\n  line\\nnext\t\\u0041\n{{/code}}');

    expect(output).toBe('line\nnextA');
  });

  it('escapes bracket characters inside #escape blocks', () => {
    PreviewEngine.resetVars();

    const output = PreviewEngine.risuChatParser('{{#escape}}{a}(b){{/escape}}');

    expect(output).toBe('\uE9B8a\uE9B9\uE9BAb\uE9BB');
  });

  it('preserves whitespace for #escape::keep blocks', () => {
    PreviewEngine.resetVars();

    const output = PreviewEngine.risuChatParser('{{#escape::keep}}  {x}  {{/escape}}');

    expect(output).toBe(`  \uE9B8x\uE9B9  `);
  });
});

describe('PreviewEngine CBS compatibility regressions', () => {
  beforeEach(() => {
    PreviewEngine.resetVars();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('split preserves legacy three-argument indexed behavior', () => {
    expect(PreviewEngine.risuChatParser('{{split::a,b,c::,::1}}')).toBe('b');
  });

  it('u alias continues to render underline markup', () => {
    expect(PreviewEngine.risuChatParser('{{u::underlined}}')).toBe('<u>underlined</u>');
  });

  it('isodate returns zero-padded UTC YYYY-MM-DD output', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-05T12:34:56.000Z'));

    expect(PreviewEngine.risuChatParser('{{isodate}}')).toBe('2024-01-05');
  });

  it('cbr emits real newline characters instead of a literal backslash-n sequence', () => {
    expect(PreviewEngine.risuChatParser('{{cbr}}')).toBe('\n');
    expect(PreviewEngine.risuChatParser('{{cbr::3}}')).toBe('\n\n\n');
  });

  it('chatindex and isfirstmsg use the provided chatID without an off-by-one shift', () => {
    expect(PreviewEngine.risuChatParser('{{chatindex}}|{{isfirstmsg}}', { chatID: 0 })).toBe('0|1');
    expect(PreviewEngine.risuChatParser('{{chatindex}}|{{isfirstmsg}}', { chatID: 1 })).toBe('1|0');
  });
});

describe('PreviewEngine Lua output hooks', () => {
  const windowWithWasmoon = window as Window & typeof globalThis & { wasmoon?: unknown };

  afterEach(() => {
    delete windowWithWasmoon.wasmoon;
    PreviewEngine.resetVars();
  });

  it('fires onOutput exactly once for the output trigger path', async () => {
    const doStringCalls: string[] = [];
    const globalStore = new Map<string, unknown>();
    globalStore.set('_callResult_modified', '0');

    const fakeEngine = {
      global: {
        set(key: string, value: unknown) {
          globalStore.set(key, value);
        },
        get(key: string) {
          return globalStore.get(key);
        },
        close() {},
      },
      async doString(code: string) {
        doStringCalls.push(code);
      },
    };

    windowWithWasmoon.wasmoon = {
      LuaFactory: class {
        async createEngine() {
          return fakeEngine;
        }
      },
    };

    await expect(
      PreviewEngine.initLua(`
        function onOutput(id)
          print("output:" .. tostring(id))
        end
      `),
    ).resolves.toBe(true);

    doStringCalls.length = 0;
    await PreviewEngine.runLuaTrigger('output', 'hello');

    const outputHookCalls = doStringCalls.filter((code) => code.includes('if onOutput then onOutput("preview") end'));
    expect(outputHookCalls).toHaveLength(1);
  });

  it('does not invoke onOutput again for editOutput listener passes', async () => {
    const doStringCalls: string[] = [];
    const globalStore = new Map<string, unknown>();
    globalStore.set('_callResult_modified', '0');

    const fakeEngine = {
      global: {
        set(key: string, value: unknown) {
          globalStore.set(key, value);
        },
        get(key: string) {
          return globalStore.get(key);
        },
        close() {},
      },
      async doString(code: string) {
        doStringCalls.push(code);
      },
    };

    windowWithWasmoon.wasmoon = {
      LuaFactory: class {
        async createEngine() {
          return fakeEngine;
        }
      },
    };

    await expect(
      PreviewEngine.initLua(`
        function onOutput(id)
          print("output:" .. tostring(id))
        end
      `),
    ).resolves.toBe(true);

    doStringCalls.length = 0;
    await PreviewEngine.runLuaTrigger('editOutput', 'hello');

    const outputHookCalls = doStringCalls.filter((code) => code.includes('if onOutput then onOutput("preview") end'));
    expect(outputHookCalls).toHaveLength(0);
  });
});

// ── Lua field setter activation ──────────────────────────────────────

describe('PreviewEngine Lua field setters', () => {
  const windowWithWasmoon = window as Window & typeof globalThis & { wasmoon?: unknown };

  afterEach(() => {
    delete windowWithWasmoon.wasmoon;
    PreviewEngine.resetVars();
  });

  function makeFakeWasmoon() {
    const globalStore = new Map<string, unknown>();
    globalStore.set('_callResult_modified', '0');

    const fakeEngine = {
      global: {
        set(key: string, value: unknown) {
          globalStore.set(key, value);
        },
        get(key: string) {
          return globalStore.get(key);
        },
        close() {},
      },
      async doString() {},
    };

    windowWithWasmoon.wasmoon = {
      LuaFactory: class {
        async createEngine() {
          return fakeEngine;
        }
      },
    };

    return globalStore;
  }

  it('setDescription updates {{description}} in preview-local state', async () => {
    const globalStore = makeFakeWasmoon();
    await PreviewEngine.initLua('');

    const setter = globalStore.get('setDescription') as (id: unknown, val: unknown) => void;
    setter('preview', 'new description');

    expect(PreviewEngine.risuChatParser('{{description}}')).toBe('new description');
  });

  it('setPersonality updates {{personality}} in preview-local state', async () => {
    const globalStore = makeFakeWasmoon();
    await PreviewEngine.initLua('');

    const setter = globalStore.get('setPersonality') as (id: unknown, val: unknown) => void;
    setter('preview', 'new personality');

    expect(PreviewEngine.risuChatParser('{{personality}}')).toBe('new personality');
    expect(PreviewEngine.risuChatParser('{{charpersona}}')).toBe('new personality');
  });

  it('setScenario updates {{scenario}} in preview-local state', async () => {
    const globalStore = makeFakeWasmoon();
    await PreviewEngine.initLua('');

    const setter = globalStore.get('setScenario') as (id: unknown, val: unknown) => void;
    setter('preview', 'new scenario');

    expect(PreviewEngine.risuChatParser('{{scenario}}')).toBe('new scenario');
  });

  it('setFirstMessage updates {{firstmessage}} in preview-local state', async () => {
    const globalStore = makeFakeWasmoon();
    await PreviewEngine.initLua('');

    const setter = globalStore.get('setFirstMessage') as (id: unknown, val: unknown) => void;
    setter('preview', 'new first message');

    expect(PreviewEngine.risuChatParser('{{firstmessage}}')).toBe('new first message');
  });

  it('{{charpersona}} resolves to personality, not description', () => {
    PreviewEngine.resetVars();
    PreviewEngine.setCharDescription('tall elf');
    PreviewEngine.setCharPersonality('brave');

    expect(PreviewEngine.risuChatParser('{{charpersona}}')).toBe('brave');
  });

  it('{{chardesc}} remains mapped to description', () => {
    PreviewEngine.resetVars();
    PreviewEngine.setCharDescription('tall elf');
    PreviewEngine.setCharPersonality('brave');

    expect(PreviewEngine.risuChatParser('{{chardesc}}')).toBe('tall elf');
  });
});

// ── Lorebook matching parity ─────────────────────────────────────────

describe('PreviewEngine lorebook: activationPercent', () => {
  const msgs: PreviewMessage[] = [{ role: 'char', content: 'Hello world' }];

  it('activationPercent: 0 prevents activation even when key matches', () => {
    const lore: PreviewLorebookEntry[] = [{ comment: 'zero-pct', key: 'Hello', mode: 'normal', activationPercent: 0 }];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  it('activationPercent: 0 prevents alwaysActive entries (upstream parity)', () => {
    // In upstream, @@probability 0 deactivates even alwaysActive entries
    const lore: PreviewLorebookEntry[] = [
      { comment: 'always-zero', key: '', mode: 'normal', alwaysActive: true, activationPercent: 0 },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  it('activationPercent: 100 activates normally', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'full-pct', key: 'Hello', mode: 'normal', activationPercent: 100 },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].reason).toContain('key');
    expect(matches[0]).not.toHaveProperty('activationPercent');
  });

  it('activationPercent: undefined activates normally (default behavior)', () => {
    const lore: PreviewLorebookEntry[] = [{ comment: 'no-pct', key: 'Hello', mode: 'normal' }];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0]).not.toHaveProperty('activationPercent');
  });

  it('activationPercent between 1-99 activates when deterministic roll passes', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'skip', key: 'Nope', mode: 'normal' },
      { comment: 'mid-pct-pass', key: 'Hello', mode: 'normal', activationPercent: 70 },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].index).toBe(1);
    expect(matches[0].activationPercent).toBe(70);
    expect(matches[0].probabilityRoll).toBe(19);
  });

  it('activationPercent between 1-99 suppresses activation when deterministic roll fails', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'skip-zero', key: 'Nope', mode: 'normal' },
      { comment: 'skip-one', key: 'StillNope', mode: 'normal' },
      { comment: 'mid-pct-fail', key: 'Hello', mode: 'normal', activationPercent: 70 },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  it('activationPercent: 0 with selective+secondkey still blocks activation', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'sel-zero', key: 'Hello', secondkey: 'world', selective: true, mode: 'normal', activationPercent: 0 },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });
});

// ── Decorator-aware lorebook matching ────────────────────────────────

describe('PreviewEngine lorebook: decorator-aware matching', () => {
  const msgs: PreviewMessage[] = [
    { role: 'user', content: 'The quick brown fox jumps' },
    { role: 'char', content: 'Over the lazy dog' },
  ];

  // ── @@dont_activate suppresses activation ──
  it('@@dont_activate suppresses activation even when key matches', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'suppressed', key: 'fox', mode: 'normal', content: '@@dont_activate\nFox lore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  it('@@dont_activate suppresses alwaysActive entries', () => {
    const lore: PreviewLorebookEntry[] = [
      {
        comment: 'always-suppressed',
        key: '',
        mode: 'normal',
        alwaysActive: true,
        content: '@@dont_activate\nAlways lore',
      },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  // ── @@activate force-activates ──
  it('@@activate force-activates entry without key match', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'forced', key: 'nonexistent', mode: 'normal', content: '@@activate\nForced lore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].reason).toContain('activate');
    expect(matches[0].decorators?.activate).toBe(true);
  });

  it('@@activate does not activate when effective probability is 0', () => {
    const lore: PreviewLorebookEntry[] = [
      {
        comment: 'forced-zero',
        key: 'nonexistent',
        mode: 'normal',
        content: '@@activate\n@@probability 0\nForced lore',
      },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  it('@@activate does not activate when entry activationPercent is 0', () => {
    const lore: PreviewLorebookEntry[] = [
      {
        comment: 'forced-entry-zero',
        key: 'nonexistent',
        mode: 'normal',
        activationPercent: 0,
        content: '@@activate\nForced lore',
      },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  it('@@dont_activate wins when combined with @@activate', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'force-conflict', key: 'fox', mode: 'normal', content: '@@activate\n@@dont_activate\nLore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  // ── @@probability overrides activationPercent ──
  it('@@probability overrides entry activationPercent', () => {
    const lore: PreviewLorebookEntry[] = [
      {
        comment: 'prob-override',
        key: 'fox',
        mode: 'normal',
        activationPercent: 100,
        content: '@@probability 50\nLore',
      },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].activationPercent).toBe(50);
    expect(matches[0].decorators?.probability).toBe(50);
  });

  it('@@probability 0 suppresses activation', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'prob-zero', key: 'fox', mode: 'normal', content: '@@probability 0\nLore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  // ── @@scan_depth per-entry ──
  it('@@scan_depth limits search to recent messages', () => {
    const longMsgs: PreviewMessage[] = [
      { role: 'user', content: 'ancient keyword' },
      { role: 'char', content: 'reply one' },
      { role: 'user', content: 'reply two' },
      { role: 'char', content: 'reply three' },
      { role: 'user', content: 'latest message' },
    ];
    const lore: PreviewLorebookEntry[] = [
      { comment: 'shallow', key: 'ancient', mode: 'normal', content: '@@scan_depth 2\nAncient lore' },
    ];
    const matches = PreviewEngine.matchLorebook(longMsgs, lore, 10);
    expect(matches).toEqual([]);
  });

  it('@@scan_depth entry activates when keyword is within scan range', () => {
    const longMsgs: PreviewMessage[] = [
      { role: 'user', content: 'old message' },
      { role: 'char', content: 'reply' },
      { role: 'user', content: 'recent keyword' },
    ];
    const lore: PreviewLorebookEntry[] = [
      { comment: 'recent', key: 'keyword', mode: 'normal', content: '@@scan_depth 2\nRecent lore' },
    ];
    const matches = PreviewEngine.matchLorebook(longMsgs, lore, 10);
    expect(matches).toHaveLength(1);
    expect(matches[0].effectiveScanDepth).toBe(2);
  });

  it('@@scan_depth 0 searches no messages (upstream parity)', () => {
    const recentMsgs: PreviewMessage[] = [{ role: 'user', content: 'keyword is still here' }];
    const lore: PreviewLorebookEntry[] = [
      { comment: 'zero-depth', key: 'keyword', mode: 'normal', content: '@@scan_depth 0\nNo lore' },
    ];
    const matches = PreviewEngine.matchLorebook(recentMsgs, lore, 10);
    expect(matches).toEqual([]);
  });

  // ── @@additional_keys ──
  it('@@additional_keys blocks activation when additional keys are missing', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'additional', key: 'fox', mode: 'normal', content: '@@additional_keys dragon\nLore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  it('@@additional_keys activates when all additional keys match', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'additional-match', key: 'fox', mode: 'normal', content: '@@additional_keys dog\nLore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedKeys).toContain('fox');
  });

  // ── @@exclude_keys ──
  it('@@exclude_keys vetoes activation when excluded key matches', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'excluded', key: 'fox', mode: 'normal', content: '@@exclude_keys dog\nLore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  it('@@exclude_keys allows activation when no excluded key matches', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'not-excluded', key: 'fox', mode: 'normal', content: '@@exclude_keys dragon\nLore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].excludedKeys).toEqual(['dragon']);
  });

  it('@@exclude_keys reports which keys caused exclusion', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'excl-report', key: 'fox', mode: 'normal', content: '@@exclude_keys dog, lazy\nLore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  // ── @@match_full_word ──
  it('@@match_full_word prevents substring matches', () => {
    const wordMsgs: PreviewMessage[] = [{ role: 'user', content: 'The foxes ran away' }];
    const lore: PreviewLorebookEntry[] = [
      { comment: 'fullword', key: 'fox', mode: 'normal', content: '@@match_full_word\nFox lore' },
    ];
    const matches = PreviewEngine.matchLorebook(wordMsgs, lore);
    expect(matches).toEqual([]);
  });

  it('@@match_full_word activates on exact word match', () => {
    const wordMsgs: PreviewMessage[] = [{ role: 'user', content: 'A fox ran away' }];
    const lore: PreviewLorebookEntry[] = [
      { comment: 'fullword-exact', key: 'fox', mode: 'normal', content: '@@match_full_word\nFox lore' },
    ];
    const matches = PreviewEngine.matchLorebook(wordMsgs, lore);
    expect(matches).toHaveLength(1);
  });

  // ── Metadata population ──
  it('populates decorators, matchedKeys, effectiveScanDepth on match', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'meta', key: 'fox', mode: 'normal', content: '@@scan_depth 5\nFox lore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].decorators).toEqual({ scanDepth: 5 });
    expect(matches[0].matchedKeys).toContain('fox');
    expect(matches[0].effectiveScanDepth).toBe(5);
  });

  it('populates warnings from decorator parser', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'warn', key: 'fox', mode: 'normal', content: '@@probability abc\nFox lore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].warnings).toBeDefined();
    expect(matches[0].warnings!.length).toBeGreaterThan(0);
  });

  it('populates probabilityRoll for entries with probability 1-99', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'prob-roll', key: 'fox', mode: 'normal', content: '@@probability 70\nFox lore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].probabilityRoll).toBeDefined();
    expect(typeof matches[0].probabilityRoll).toBe('number');
  });

  it('@@probability gates alwaysActive entries when deterministic roll fails', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'skip', key: 'Nope', mode: 'normal' },
      {
        comment: 'always-prob-fail',
        key: '',
        mode: 'normal',
        alwaysActive: true,
        content: '@@probability 10\nAlways lore',
      },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  it('alwaysActive records checked exclude keys when activation succeeds', () => {
    const lore: PreviewLorebookEntry[] = [
      {
        comment: 'always-excluded',
        key: '',
        mode: 'normal',
        alwaysActive: true,
        content: '@@exclude_keys dragon\nAlways lore',
      },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].excludedKeys).toEqual(['dragon']);
  });

  it('@@activate records checked exclude keys when activation succeeds', () => {
    const lore: PreviewLorebookEntry[] = [
      {
        comment: 'force-checked',
        key: 'nonexistent',
        mode: 'normal',
        content: '@@activate\n@@exclude_keys dragon\nLore',
      },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].excludedKeys).toEqual(['dragon']);
  });

  // ── Preserves existing behavior when no decorators ──
  it('preserves selective+secondkey behavior without decorators', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'sel', key: 'fox', secondkey: 'dog', selective: true, mode: 'normal' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0].reason).toContain('key+secondkey');
  });

  it('preserves insertorder ordering', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'second', key: 'fox', mode: 'normal', insertorder: 200 },
      { comment: 'first', key: 'dog', mode: 'normal', insertorder: 50 },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(2);
    expect(matches[0].index).toBe(1); // insertorder 50 comes first
    expect(matches[1].index).toBe(0); // insertorder 200 comes second
  });

  it('no decorators means decorators field omitted from result', () => {
    const lore: PreviewLorebookEntry[] = [{ comment: 'plain', key: 'fox', mode: 'normal' }];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
    expect(matches[0]).not.toHaveProperty('decorators');
  });

  // ── Combined decorator scenarios ──
  it('@@activate with @@exclude_keys: exclude vetoes forced activation', () => {
    const lore: PreviewLorebookEntry[] = [
      { comment: 'force-excl', key: 'nonexistent', mode: 'normal', content: '@@activate\n@@exclude_keys dog\nLore' },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });

  it('@@additional_keys with selective+secondkey: all gates must pass', () => {
    const lore: PreviewLorebookEntry[] = [
      {
        comment: 'multi-gate',
        key: 'fox',
        secondkey: 'dog',
        selective: true,
        mode: 'normal',
        content: '@@additional_keys lazy\nLore',
      },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toHaveLength(1);
  });

  it('@@additional_keys with selective+secondkey: fails when additional missing', () => {
    const lore: PreviewLorebookEntry[] = [
      {
        comment: 'multi-gate-fail',
        key: 'fox',
        secondkey: 'dog',
        selective: true,
        mode: 'normal',
        content: '@@additional_keys dragon\nLore',
      },
    ];
    const matches = PreviewEngine.matchLorebook(msgs, lore);
    expect(matches).toEqual([]);
  });
});

// ── #each block parity ──────────────────────────────────────────────

describe('PreviewEngine #each parity', () => {
  beforeEach(() => {
    PreviewEngine.resetVars();
  });

  it('loops over a simple array literal', () => {
    const output = PreviewEngine.risuChatParser('{{#each [1, 2, 3] as n}}{{slot::n}} {{/}}');
    expect(output).toBe('123');
  });

  it('loops over an array stored in a variable', () => {
    PreviewEngine.setChatVar('arr', JSON.stringify([1, 2, 3]));
    const output = PreviewEngine.risuChatParser('{{#each {{getvar::arr}} as n}}{{slot::n}} {{/}}');
    expect(output).toBe('123');
  });

  it('empty array produces no output', () => {
    const output = PreviewEngine.risuChatParser('{{#each [] as n}}{{slot::n}} {{/}}');
    expect(output).toBe('');
  });

  it('non-JSON string falls back to § split (single element)', () => {
    const output = PreviewEngine.risuChatParser('{{#each a,b,c as n}}{{slot::n}} {{/}}');
    expect(output).toBe('a,b,c');
  });

  it('undefined variable falls back to § split ("null" passthrough)', () => {
    const output = PreviewEngine.risuChatParser('{{#each {{getvar::aa}} as n}}{{slot::n}} {{/}}');
    expect(output).toBe('null');
  });

  it('invalid JSON array falls back to § split', () => {
    const output = PreviewEngine.risuChatParser('{{#each [1][2] as n}}{{slot::n}} {{/}}');
    expect(output).toBe('[1][2]');
  });

  it('default #each trims body whitespace (trimLines)', () => {
    const output = PreviewEngine.risuChatParser('{{#each [1, 2, 3] as n}} \n - {{slot::n}}\n  {{/}}');
    expect(output).toBe('- 1- 2- 3');
  });

  it('#each::keep preserves all whitespace', () => {
    const output = PreviewEngine.risuChatParser('{{#each::keep [1, 2, 3] as n}}  - {{slot::n}}\n{{/}}');
    expect(output).toBe('  - 1\n  - 2\n  - 3\n');
  });

  it('omitting "as" uses compatibility mode (last space separator)', () => {
    const output = PreviewEngine.risuChatParser('{{#each [1, 2, 3] n}}{{slot::n}} {{/}}');
    expect(output).toBe('123');
  });

  it('nested #each::keep works', () => {
    const output = PreviewEngine.risuChatParser(
      '{{#each::keep [1, 2] as x}}{{#each::keep [3, 4] as y}}{{slot::x}}{{slot::y}}\n{{/}}{{/}}',
    );
    expect(output).toBe('13\n14\n23\n24\n');
  });

  it('2D array with ::keep stringifies sub-arrays for slot replacement', () => {
    const output = PreviewEngine.risuChatParser(
      '{{#each::keep [[1, 2], [3, 4]] as x}}{{#each::keep {{slot::x}} as y}}{{slot::y}}\n{{/}}{{/}}',
    );
    expect(output).toBe('1\n2\n3\n4\n');
  });

  it('2D array from variable with ::keep', () => {
    PreviewEngine.setChatVar(
      'arr',
      JSON.stringify([
        [1, 2],
        [3, 4],
      ]),
    );
    const output = PreviewEngine.risuChatParser(
      '{{#each::keep {{getvar::arr}} as x}}{{#each::keep {{slot::x}} as y}}{{slot::y}}\n{{/}}{{/}}',
    );
    expect(output).toBe('1\n2\n3\n4\n');
  });

  it('#each inside #when :else', () => {
    const tpl = (a: string) =>
      `{{#when ${a}}}\n{{#each [1, 2, 3] as n}}{{slot::n}}{{/}}\n{{:else}}\n{{#each [3, 2, 1] as n}}{{slot::n}}{{/}}\n{{/}}`;

    expect(PreviewEngine.risuChatParser(tpl('1'))).toBe('123');
    expect(PreviewEngine.risuChatParser(tpl('0'))).toBe('321');
  });
});

// ==================== #func / {{call}} tests ====================
describe('PreviewEngine CBS #func / {{call}} parity', () => {
  beforeEach(() => {
    PreviewEngine.resetVars();
  });

  it('basic func define + call with arg substitution', () => {
    // Upstream: {{arg::0}} = funcName, {{arg::1}} = first user arg
    const tpl = '{{#func greet name}}Hello {{arg::1}}!{{/func}}{{call::greet::World}}';
    expect(PreviewEngine.risuChatParser(tpl)).toBe('Hello World!');
  });

  it('func with multiple arguments', () => {
    const tpl = '{{#func add a b}}{{arg::1}} + {{arg::2}}{{/func}}{{call::add::3::5}}';
    expect(PreviewEngine.risuChatParser(tpl)).toBe('3 + 5');
  });

  it('func body is captured raw (pure mode) — no evaluation at define time', () => {
    // setvar inside func body should NOT run until call time
    // getChatVar returns 'null' for unset variables (upstream behavior)
    const tpl = '{{#func setter}}{{setvar::x::42}}{{/func}}before={{getvar::x}} {{call::setter}}after={{getvar::x}}';
    const output = PreviewEngine.risuChatParser(tpl, { runVar: true });
    expect(output).toBe('before=null after=42');
  });

  it('func definition produces no output', () => {
    const tpl = 'A{{#func noop}}body{{/func}}B';
    expect(PreviewEngine.risuChatParser(tpl)).toBe('AB');
  });

  it('calling undefined function produces empty string', () => {
    // Upstream: undefined func silently falls through
    const tpl = '{{call::nonexistent::val}}';
    expect(PreviewEngine.risuChatParser(tpl)).toBe('');
  });

  it('arg::0 resolves to function name (upstream behavior)', () => {
    const tpl = '{{#func self}}name={{arg::0}}{{/func}}{{call::self}}';
    expect(PreviewEngine.risuChatParser(tpl)).toBe('name=self');
  });

  it('unreplaced arg placeholders remain as literal text', () => {
    const tpl = '{{#func f a}}{{arg::1}} and {{arg::2}}{{/func}}{{call::f::only1}}';
    expect(PreviewEngine.risuChatParser(tpl)).toBe('only1 and {{arg::2}}');
  });

  it('call stack limit prevents infinite recursion', () => {
    // Recursive func: calls itself forever
    const tpl = '{{#func rec}}{{call::rec}}{{/func}}{{call::rec}}';
    const output = PreviewEngine.risuChatParser(tpl);
    expect(output).toContain('ERROR: Call stack limit reached');
  });

  it('func body with CBS expressions resolved at call time', () => {
    PreviewEngine.setChatVar('greeting', 'Hi');
    const tpl = '{{#func say}}{{getvar::greeting}} {{arg::1}}!{{/func}}{{call::say::Alice}}';
    expect(PreviewEngine.risuChatParser(tpl, { runVar: true })).toBe('Hi Alice!');
  });

  it('multiple funcs coexist independently', () => {
    const tpl = '{{#func a}}A={{arg::1}}{{/func}}{{#func b}}B={{arg::1}}{{/func}}{{call::a::1}},{{call::b::2}}';
    expect(PreviewEngine.risuChatParser(tpl)).toBe('A=1,B=2');
  });

  it('nested func calls (func calling another func)', () => {
    const tpl =
      '{{#func inner}}[{{arg::1}}]{{/func}}{{#func outer}}({{call::inner::{{arg::1}}}}){{/func}}{{call::outer::X}}';
    expect(PreviewEngine.risuChatParser(tpl)).toBe('([X])');
  });

  // ── bkspc ──────────────────────────────────────────────────
  it('bkspc removes the last word from accumulated output', () => {
    const result = PreviewEngine.risuChatParser('hello world {{bkspc}} user');
    expect(result).toBe('hello user');
  });

  it('bkspc at the very start produces empty prefix', () => {
    const result = PreviewEngine.risuChatParser('{{bkspc}}hello');
    expect(result).toBe('hello');
  });

  it('bkspc on single word removes everything', () => {
    const result = PreviewEngine.risuChatParser('word{{bkspc}} after');
    expect(result).toBe(' after');
  });

  it('bkspc trims trailing whitespace before scanning', () => {
    const result = PreviewEngine.risuChatParser('a   b   {{bkspc}} c');
    expect(result).toBe('a c');
  });

  it('bkspc respects newline as word boundary', () => {
    const result = PreviewEngine.risuChatParser('first\nsecond{{bkspc}} end');
    expect(result).toBe('first end');
  });

  it('multiple bkspc in sequence', () => {
    const result = PreviewEngine.risuChatParser('one two three{{bkspc}}{{bkspc}} end');
    expect(result).toBe('one end');
  });

  // ── erase ──────────────────────────────────────────────────
  it('erase removes the last sentence (keeps sentence-end punctuation)', () => {
    const result = PreviewEngine.risuChatParser("hello world. what's in {{erase}} what's up");
    expect(result).toBe("hello world. what's up");
  });

  it('erase on text with no sentence boundary removes everything', () => {
    const result = PreviewEngine.risuChatParser('no sentence end{{erase}} after');
    expect(result).toBe(' after');
  });

  it('erase keeps exclamation mark as sentence boundary', () => {
    const result = PreviewEngine.risuChatParser('wow! cool stuff{{erase}} done');
    expect(result).toBe('wow! done');
  });

  it('erase keeps question mark as sentence boundary', () => {
    const result = PreviewEngine.risuChatParser('really? something else{{erase}} ok');
    expect(result).toBe('really? ok');
  });

  it('erase uses newline as sentence boundary', () => {
    const result = PreviewEngine.risuChatParser('line one\nline two{{erase}} end');
    expect(result).toBe('line one end');
  });

  it('erase at the very start produces empty prefix', () => {
    const result = PreviewEngine.risuChatParser('{{erase}}hello');
    expect(result).toBe('hello');
  });

  it('bkspc inside a #when block mutates block content', () => {
    PreviewEngine.resetVars();
    PreviewEngine.setChatVar('flag', '1');
    // Use 'vis' operator (upstream way) to check variable value
    const result = PreviewEngine.risuChatParser(
      'before {{#when::flag::vis::1}}alpha beta{{bkspc}} gamma{{/when}} after',
      { runVar: true },
    );
    expect(result).toBe('before alpha gamma after');
  });
});

// ── Minor CBS tags: new tags + upstream parity fixes ─────────────────

describe('PreviewEngine CBS minor tags', () => {
  beforeEach(() => {
    PreviewEngine.resetVars();
  });

  // --- {{isodate}} ---
  it('isodate returns UTC date in YYYY-MM-DD format', () => {
    const output = PreviewEngine.risuChatParser('{{isodate}}');
    const now = new Date();
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    expect(output).toBe(expected);
  });

  // --- {{unicodeencode}} ---
  it('unicodeencode returns char code of first character', () => {
    expect(PreviewEngine.risuChatParser('{{unicodeencode::A}}')).toBe('65');
  });

  it('unicodeencode with index returns char code at position', () => {
    expect(PreviewEngine.risuChatParser('{{unicodeencode::AB::1}}')).toBe('66');
  });

  it('unicode_encode alias works', () => {
    expect(PreviewEngine.risuChatParser('{{unicode_encode::Z}}')).toBe('90');
  });

  // --- {{unicodedecode}} ---
  it('unicodedecode converts code point to character', () => {
    expect(PreviewEngine.risuChatParser('{{unicodedecode::65}}')).toBe('A');
  });

  it('unicode_decode alias works', () => {
    expect(PreviewEngine.risuChatParser('{{unicode_decode::90}}')).toBe('Z');
  });

  // --- {{unicodedecodefromhex}} / {{ue}} (hex decode) ---

  it('ue alias converts hex code to character', () => {
    expect(PreviewEngine.risuChatParser('{{ue::5A}}')).toBe('Z');
  });

  it('unicodedecodefromhex alias works', () => {
    expect(PreviewEngine.risuChatParser('{{unicodedecodefromhex::61}}')).toBe('a');
  });

  // --- {{fromhex}} / {{tohex}} ---
  it('fromhex converts hex to decimal', () => {
    expect(PreviewEngine.risuChatParser('{{fromhex::FF}}')).toBe('255');
  });

  it('tohex converts decimal to hex', () => {
    expect(PreviewEngine.risuChatParser('{{tohex::255}}')).toBe('ff');
  });

  // --- {{dice}} ---
  it('dice with XdY notation returns a number in range', () => {
    const output = PreviewEngine.risuChatParser('{{dice::2d6}}');
    const num = parseInt(output, 10);
    expect(num).toBeGreaterThanOrEqual(2);
    expect(num).toBeLessThanOrEqual(12);
  });

  it('dice with invalid notation returns NaN', () => {
    expect(PreviewEngine.risuChatParser('{{dice::abc}}')).toBe('NaN');
  });

  // --- {{crypt}} (Caesar cipher) ---
  it('crypt applies default shift and is self-inverse', () => {
    const encrypted = PreviewEngine.risuChatParser('{{crypt::hello}}');
    expect(encrypted).not.toBe('hello');
    // Self-inverse: applying crypt again should return original
    const decrypted = PreviewEngine.risuChatParser(`{{crypt::${encrypted}}}`);
    expect(decrypted).toBe('hello');
  });

  it('crypt with custom shift works', () => {
    const output = PreviewEngine.risuChatParser('{{crypt::A::1}}');
    expect(output).toBe('B');
  });

  it('encrypt/decrypt/caesar aliases work', () => {
    expect(PreviewEngine.risuChatParser('{{encrypt::A::1}}')).toBe('B');
    expect(PreviewEngine.risuChatParser('{{decrypt::A::1}}')).toBe('B');
    expect(PreviewEngine.risuChatParser('{{caesar::A::1}}')).toBe('B');
  });

  // --- {{roll}} XdY parity ---
  it('roll supports XdY notation', () => {
    const output = PreviewEngine.risuChatParser('{{roll::2d6}}');
    const num = parseInt(output, 10);
    expect(num).toBeGreaterThanOrEqual(2);
    expect(num).toBeLessThanOrEqual(12);
  });

  it('roll with single number treats as sides', () => {
    const output = PreviewEngine.risuChatParser('{{roll::20}}');
    const num = parseInt(output, 10);
    expect(num).toBeGreaterThanOrEqual(1);
    expect(num).toBeLessThanOrEqual(20);
  });

  it('roll with no args defaults to 1d6 (returns 1)', () => {
    // Upstream: no args → return '1'
    expect(PreviewEngine.risuChatParser('{{roll}}')).toBe('1');
  });

  it('roll with invalid notation returns NaN', () => {
    expect(PreviewEngine.risuChatParser('{{roll::0d6}}')).toBe('NaN');
  });

  // --- {{split}} upstream parity ---
  it('split returns JSON array in the two-argument form', () => {
    expect(PreviewEngine.risuChatParser('{{split::a,b,c::,}}')).toBe('["a","b","c"]');
  });

  // --- {{random}} upstream parity ---
  it('random with no args returns a float between 0 and 1', () => {
    const output = PreviewEngine.risuChatParser('{{random}}');
    const num = parseFloat(output);
    expect(num).toBeGreaterThanOrEqual(0);
    expect(num).toBeLessThan(1);
  });

  it('random with single array arg picks an element', () => {
    const output = PreviewEngine.risuChatParser('{{random::[1,2,3]}}');
    expect(['1', '2', '3']).toContain(output);
  });

  it('random with single comma-separated arg picks an element', () => {
    const output = PreviewEngine.risuChatParser('{{random::a,b,c}}');
    expect(['a', 'b', 'c']).toContain(output);
  });

  it('random with multiple args picks one', () => {
    const output = PreviewEngine.risuChatParser('{{random::x::y::z}}');
    expect(['x', 'y', 'z']).toContain(output);
  });

  // --- {{xor}} / {{xordecrypt}} ---
  it('xor encodes and xordecrypt decodes back', () => {
    const encrypted = PreviewEngine.risuChatParser('{{xor::hello}}');
    expect(encrypted).not.toBe('hello');
    const decrypted = PreviewEngine.risuChatParser(`{{xordecrypt::${encrypted}}}`);
    expect(decrypted).toBe('hello');
  });

  it('xore alias works', () => {
    const a = PreviewEngine.risuChatParser('{{xor::test}}');
    const b = PreviewEngine.risuChatParser('{{xore::test}}');
    expect(a).toBe(b);
  });

  it('xord alias decodes', () => {
    const encrypted = PreviewEngine.risuChatParser('{{xor::abc}}');
    const decrypted = PreviewEngine.risuChatParser(`{{xord::${encrypted}}}`);
    expect(decrypted).toBe('abc');
  });
});

// ==================== #when evaluation parity (upstream stack-based) ====================
describe('PreviewEngine #when evaluation parity', () => {
  beforeEach(() => {
    PreviewEngine.resetVars();
  });

  // --- Stack-based evaluation order ---

  it('not as infix operator inverts the right operand', () => {
    // Upstream: pop '0', pop 'not' → !isTruthy('0') → push '1'
    //           pop '1', pop '1' (as operator, unknown) → isTruthy('1') → push '1'
    // Final: true → content shown
    const result = PreviewEngine.risuChatParser('{{#when::1::not::0}}YES{{/when}}');
    expect(result).toBe('YES');
  });

  it('not inverts a truthy value mid-stack', () => {
    // {{#when::not::1}} → pop '1', pop 'not' → !true → push '0'. Final: false
    expect(PreviewEngine.risuChatParser('{{#when::not::1}}YES{{:else}}NO{{/when}}')).toBe('NO');
  });

  it('not inverts a falsy value mid-stack', () => {
    // {{#when::not::0}} → pop '0', pop 'not' → !false → push '1'. Final: true
    expect(PreviewEngine.risuChatParser('{{#when::not::0}}YES{{:else}}NO{{/when}}')).toBe('YES');
  });

  // --- Unknown operator falls through to truthiness ---

  it('unknown operator defaults to truthiness check of condition', () => {
    // Upstream: pop '1' (condition), pop 'whatever' (operator) → default: isTruthy('1') → push '1'
    // Final: true
    expect(PreviewEngine.risuChatParser('{{#when::whatever::1}}YES{{:else}}NO{{/when}}')).toBe('YES');
  });

  it('unknown operator with falsy condition', () => {
    // pop '0' (condition), pop 'whatever' (operator) → default: isTruthy('0') → push '0'
    expect(PreviewEngine.risuChatParser('{{#when::whatever::0}}YES{{:else}}NO{{/when}}')).toBe('NO');
  });

  // --- isTruthy case sensitivity (upstream: strict) ---

  it('isTruthy is case-sensitive: True is falsy', () => {
    // Upstream: isTruthy('True') → false (only 'true' lowercase matches)
    expect(PreviewEngine.risuChatParser('{{#when::True}}YES{{:else}}NO{{/when}}')).toBe('NO');
  });

  it('isTruthy is case-sensitive: TRUE is falsy', () => {
    expect(PreviewEngine.risuChatParser('{{#when::TRUE}}YES{{:else}}NO{{/when}}')).toBe('NO');
  });

  // --- keep mode preserves whitespace ---

  it('keep mode preserves leading/trailing blank lines', () => {
    // Upstream: mode='keep' → type2='keep' → no trimming of blank lines
    const result = PreviewEngine.risuChatParser('{{#when::keep::1}}\n\ncontent\n\n{{/when}}');
    expect(result).toBe('\n\ncontent\n\n');
  });

  it('normal mode trims leading/trailing blank lines', () => {
    // Upstream: normal mode → trims blank lines
    const result = PreviewEngine.risuChatParser('{{#when::1}}\n\ncontent\n\n{{/when}}');
    expect(result).toBe('content');
  });

  // --- var/toggle as stack operators (not just 2-arg special case) ---

  it('var operator looks up chat variable', () => {
    PreviewEngine.setChatVar('myFlag', '1');
    expect(PreviewEngine.risuChatParser('{{#when::var::myFlag}}YES{{:else}}NO{{/when}}', { runVar: true })).toBe('YES');
  });

  it('toggle operator looks up global toggle variable', () => {
    PreviewEngine.setGlobalChatVar('toggle_Dark', '1');
    expect(PreviewEngine.risuChatParser('{{#when::toggle::Dark}}YES{{:else}}NO{{/when}}', { runVar: true })).toBe(
      'YES',
    );
  });

  it('bare #when with no condition is always falsy', () => {
    expect(PreviewEngine.risuChatParser('{{#when}}YES{{:else}}NO{{/when}}')).toBe('NO');
  });

  it('single-arg #when checks isTruthy literally (no var lookup)', () => {
    // {{#when::1}} → isTruthy('1') → true
    expect(PreviewEngine.risuChatParser('{{#when::1}}YES{{:else}}NO{{/when}}')).toBe('YES');
    // {{#when::0}} → isTruthy('0') → false
    expect(PreviewEngine.risuChatParser('{{#when::0}}YES{{:else}}NO{{/when}}')).toBe('NO');
  });

  // --- legacy mode: trimLines (per-line trimStart + overall trim) ---

  it('legacy mode trims start of each line and overall (trimLines)', () => {
    // Upstream: mode='legacy' → type='parse' → trimLines(p1Trimmed)
    // trimLines: split by \n, trimStart() each line, join, .trim()
    const indentedBody = '\n\n  C  \n  B  \n  S  \n\n';
    const result = PreviewEngine.risuChatParser(`{{#when::legacy::1}}${indentedBody}{{/when}}`);
    // Expected: per-line trimStart removes leading spaces, overall trim removes boundary whitespace
    expect(result).toBe('C  \nB  \nS');
  });

  it('legacy falsy returns empty string', () => {
    const result = PreviewEngine.risuChatParser('{{#when::legacy::0}}some content{{/when}}');
    expect(result).toBe('');
  });

  it('legacy truthy with simple content applies trimLines', () => {
    // trimLines on '  hello  ' → 'hello' (trimStart each line + overall trim)
    const result = PreviewEngine.risuChatParser('{{#when::legacy::1}}  hello  {{/when}}');
    expect(result).toBe('hello');
  });
});
