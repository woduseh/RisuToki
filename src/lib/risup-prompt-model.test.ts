import { describe, expect, it } from 'vitest';
import {
  parsePromptTemplate,
  serializePromptTemplate,
  parseFormatingOrder,
  serializeFormatingOrder,
  validatePromptTemplateText,
  validateFormatingOrderText,
  validatePresetBiasText,
  validateLocalStopStringsText,
  defaultPromptItemPlain,
  defaultPromptItemChat,
  defaultPromptItemTyped,
  defaultPromptItemAuthorNote,
  defaultFormatingOrder,
  normalizePromptTemplateForStorage,
  collectFormatingOrderWarnings,
} from './risup-prompt-model';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLAIN = { type: 'plain', type2: 'normal', text: 'hello', role: 'system' };
const JAILBREAK = { type: 'jailbreak', type2: 'normal', text: 'bypass', role: 'user' };
const COT = { type: 'cot', type2: 'main', text: 'think', role: 'system' };
const CHAT_END = { type: 'chat', rangeStart: 0, rangeEnd: 'end' };
const CHAT_NUMERIC = { type: 'chat', rangeStart: 5, rangeEnd: 10 };
const PERSONA = { type: 'persona' };
const DESCRIPTION_FMT = { type: 'description', innerFormat: 'Format: {{description}}' };
const AUTHORNOTE = { type: 'authornote' };
const AUTHORNOTE_DEFAULT = { type: 'authornote', defaultText: 'default note', innerFormat: '[AN: {{an}}]' };
const CACHE = { type: 'cache', name: 'ctx', depth: 2, role: 'assistant' };
const CACHE_ALL = { type: 'cache', name: 'all', depth: 0, role: 'all' };
const UNKNOWN = { type: 'futuristic', data: { x: 1 } };
const CHATML = { type: 'chatML', text: 'some content' };

const CANONICAL_ORDER = [
  'main',
  'description',
  'personaPrompt',
  'chats',
  'lastChat',
  'jailbreak',
  'lorebook',
  'globalNote',
  'authorNote',
];

function stringify(items: unknown[]): string {
  return JSON.stringify(items, null, 2);
}

// ---------------------------------------------------------------------------
// parsePromptTemplate
// ---------------------------------------------------------------------------

describe('parsePromptTemplate', () => {
  it('returns empty state for blank string', () => {
    const m = parsePromptTemplate('');
    expect(m.state).toBe('empty');
    expect(m.items).toHaveLength(0);
    expect(m.hasUnsupportedContent).toBe(false);
  });

  it('returns empty state for "[]"', () => {
    const m = parsePromptTemplate('[]');
    expect(m.state).toBe('empty');
    expect(m.items).toHaveLength(0);
  });

  it('returns invalid state for invalid JSON', () => {
    const m = parsePromptTemplate('{bad json');
    expect(m.state).toBe('invalid');
    expect(m.parseError).toBeTruthy();
  });

  it('returns invalid state for non-array JSON', () => {
    const m = parsePromptTemplate('{"type":"plain"}');
    expect(m.state).toBe('invalid');
    expect(m.parseError).toBeTruthy();
  });

  it('parses plain items', () => {
    const m = parsePromptTemplate(stringify([PLAIN]));
    expect(m.state).toBe('valid');
    expect(m.items).toHaveLength(1);
    const item = m.items[0];
    expect(item.type).toBe('plain');
    expect(item.supported).toBe(true);
    if (item.supported && item.type === 'plain') {
      expect(item.type2).toBe('normal');
      expect(item.text).toBe('hello');
      expect(item.role).toBe('system');
    }
  });

  it('parses jailbreak items', () => {
    const m = parsePromptTemplate(stringify([JAILBREAK]));
    const item = m.items[0];
    expect(item.type).toBe('jailbreak');
    expect(item.supported).toBe(true);
    if (item.supported && item.type === 'jailbreak') {
      expect(item.role).toBe('user');
    }
  });

  it('parses cot items', () => {
    const m = parsePromptTemplate(stringify([COT]));
    const item = m.items[0];
    expect(item.type).toBe('cot');
    expect(item.supported).toBe(true);
    if (item.supported && item.type === 'cot') {
      expect(item.type2).toBe('main');
    }
  });

  it('defaults type2 to "normal" when absent on plain item', () => {
    const m = parsePromptTemplate(stringify([{ type: 'plain', text: '', role: 'system' }]));
    const item = m.items[0];
    if (item.supported && item.type === 'plain') {
      expect(item.type2).toBe('normal');
    }
  });

  it('coerces invalid type2 to "normal" on plain item', () => {
    const m = parsePromptTemplate(stringify([{ type: 'plain', type2: 'invalid', text: '', role: 'system' }]));
    const item = m.items[0];
    if (item.supported && item.type === 'plain') {
      expect(item.type2).toBe('normal');
    }
  });

  it('defaults role to "system" when absent on plain item', () => {
    const m = parsePromptTemplate(stringify([{ type: 'plain', type2: 'normal', text: '' }]));
    const item = m.items[0];
    if (item.supported && item.type === 'plain') {
      expect(item.role).toBe('system');
    }
  });

  it('coerces invalid role to "system" on plain item', () => {
    const m = parsePromptTemplate(stringify([{ type: 'plain', type2: 'normal', text: '', role: 'invalid' }]));
    const item = m.items[0];
    if (item.supported && item.type === 'plain') {
      expect(item.role).toBe('system');
    }
  });

  it('preserves role:"bot" through parse -> serialize for a plain item without coercion', () => {
    const input = { type: 'plain', type2: 'normal', text: 'hello', role: 'bot' };
    const m = parsePromptTemplate(stringify([input]));
    const item = m.items[0];
    expect(item.supported).toBe(true);
    if (item.supported && item.type === 'plain') {
      expect(item.role).toBe('bot');
    }
    const result = serializePromptTemplate(m);
    const roundTripped = (JSON.parse(result) as unknown[])[0] as Record<string, unknown>;
    expect(roundTripped['role']).toBe('bot');
  });

  it('parses chat items with rangeEnd: "end"', () => {
    const m = parsePromptTemplate(stringify([CHAT_END]));
    const item = m.items[0];
    expect(item.type).toBe('chat');
    expect(item.supported).toBe(true);
    if (item.supported && item.type === 'chat') {
      expect(item.rangeStart).toBe(0);
      expect(item.rangeEnd).toBe('end');
    }
  });

  it('parses chat items with numeric rangeEnd', () => {
    const m = parsePromptTemplate(stringify([CHAT_NUMERIC]));
    const item = m.items[0];
    if (item.supported && item.type === 'chat') {
      expect(item.rangeStart).toBe(5);
      expect(item.rangeEnd).toBe(10);
    }
  });

  it('defaults rangeStart to 0 when absent on chat item', () => {
    const m = parsePromptTemplate(stringify([{ type: 'chat', rangeEnd: 'end' }]));
    const item = m.items[0];
    if (item.supported && item.type === 'chat') {
      expect(item.rangeStart).toBe(0);
    }
  });

  it('defaults rangeEnd to "end" when absent on chat item', () => {
    const m = parsePromptTemplate(stringify([{ type: 'chat', rangeStart: 0 }]));
    const item = m.items[0];
    if (item.supported && item.type === 'chat') {
      expect(item.rangeEnd).toBe('end');
    }
  });

  it('parses typed items (persona)', () => {
    const m = parsePromptTemplate(stringify([PERSONA]));
    const item = m.items[0];
    expect(item.type).toBe('persona');
    expect(item.supported).toBe(true);
    if (item.supported && item.type === 'persona') {
      expect(item.innerFormat).toBeUndefined();
    }
  });

  it('parses typed items with innerFormat', () => {
    const m = parsePromptTemplate(stringify([DESCRIPTION_FMT]));
    const item = m.items[0];
    if (item.supported && item.type === 'description') {
      expect(item.innerFormat).toBe('Format: {{description}}');
    }
  });

  it('parses authornote items', () => {
    const m = parsePromptTemplate(stringify([AUTHORNOTE]));
    const item = m.items[0];
    expect(item.type).toBe('authornote');
    expect(item.supported).toBe(true);
    if (item.supported && item.type === 'authornote') {
      expect(item.defaultText).toBeUndefined();
    }
  });

  it('parses authornote with defaultText and innerFormat', () => {
    const m = parsePromptTemplate(stringify([AUTHORNOTE_DEFAULT]));
    const item = m.items[0];
    if (item.supported && item.type === 'authornote') {
      expect(item.defaultText).toBe('default note');
      expect(item.innerFormat).toBe('[AN: {{an}}]');
    }
  });

  it('parses cache items', () => {
    const m = parsePromptTemplate(stringify([CACHE]));
    const item = m.items[0];
    expect(item.type).toBe('cache');
    expect(item.supported).toBe(true);
    if (item.supported && item.type === 'cache') {
      expect(item.name).toBe('ctx');
      expect(item.depth).toBe(2);
      expect(item.role).toBe('assistant');
    }
  });

  it('accepts cache role "all"', () => {
    const m = parsePromptTemplate(stringify([CACHE_ALL]));
    const item = m.items[0];
    if (item.supported && item.type === 'cache') {
      expect(item.role).toBe('all');
    }
  });

  it('parses chatML items', () => {
    const m = parsePromptTemplate(stringify([CHATML]));
    const item = m.items[0];
    expect(item.type).toBe('chatML');
    expect(item.supported).toBe(true);
    if (item.supported && item.type === 'chatML') {
      expect(item.text).toBe('some content');
    }
  });

  it('wraps unknown item types as unsupported', () => {
    const m = parsePromptTemplate(stringify([UNKNOWN]));
    expect(m.items).toHaveLength(1);
    const item = m.items[0];
    expect(item.type).toBe('futuristic');
    expect(item.supported).toBe(false);
  });

  it('sets hasUnsupportedContent when unknown items present', () => {
    const m = parsePromptTemplate(stringify([PLAIN, UNKNOWN]));
    expect(m.hasUnsupportedContent).toBe(true);
  });

  it('does not set hasUnsupportedContent for all-known items', () => {
    const m = parsePromptTemplate(stringify([PLAIN, CHAT_END]));
    expect(m.hasUnsupportedContent).toBe(false);
  });

  it('preserves rawValue on unknown items', () => {
    const m = parsePromptTemplate(stringify([UNKNOWN]));
    const item = m.items[0];
    expect(item.rawValue).toMatchObject({ type: 'futuristic', data: { x: 1 } });
  });

  it('preserves extra fields on known items via rawValue', () => {
    const withExtra = { ...PLAIN, customExtraField: 'keep me' };
    const m = parsePromptTemplate(stringify([withExtra]));
    const item = m.items[0];
    if (item.supported) {
      expect((item.rawValue as Record<string, unknown>)['customExtraField']).toBe('keep me');
    }
  });

  it('assigns deterministic ids to supported prompt items that lack them', () => {
    const model = parsePromptTemplate(
      JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'hello', role: 'system' },
        { type: 'plain', type2: 'normal', text: 'hello', role: 'system' },
      ]),
    );

    expect(model.state).toBe('valid');
    expect(model.items[0].supported && model.items[0].id).toBeTruthy();
    expect(model.items[1].supported && model.items[1].id).toBeTruthy();
    expect(model.items[0].supported && model.items[1].supported && model.items[0].id).not.toBe(model.items[1].id);
  });

  it('preserves an existing id through parse and serialize', () => {
    const raw = [{ id: 'prompt-plain-1', type: 'plain', type2: 'normal', text: 'hello', role: 'system' }];
    const parsed = parsePromptTemplate(JSON.stringify(raw));
    const roundTrip = JSON.parse(serializePromptTemplate(parsed));
    expect(roundTrip[0].id).toBe('prompt-plain-1');
  });

  it('exposes top-level id on unsupported items when rawValue already contains one', () => {
    const parsed = parsePromptTemplate(JSON.stringify([{ id: 'legacy-unknown-1', type: 'futureType', foo: 'bar' }]));
    expect(parsed.items[0].supported).toBe(false);
    expect(parsed.items[0]).toMatchObject({ id: 'legacy-unknown-1', type: 'futureType' });
  });

  it('generates deterministic ids that are stable across re-parses', () => {
    const input = stringify([PLAIN, CHAT_END]);
    const m1 = parsePromptTemplate(input);
    const m2 = parsePromptTemplate(input);
    expect(m1.items[0].supported && m1.items[0].id).toBe(m2.items[0].supported && m2.items[0].id);
    expect(m1.items[1].supported && m1.items[1].id).toBe(m2.items[1].supported && m2.items[1].id);
  });

  it('does not expose id on unsupported items without id in raw', () => {
    const parsed = parsePromptTemplate(JSON.stringify([{ type: 'futureType', foo: 'bar' }]));
    expect(parsed.items[0].supported).toBe(false);
    expect(parsed.items[0].id).toBeUndefined();
  });
});

describe('validatePromptTemplateText', () => {
  it('returns null for valid promptTemplate arrays', () => {
    expect(validatePromptTemplateText(stringify([PLAIN]))).toBeNull();
  });

  it('returns a parse error for non-array promptTemplate JSON', () => {
    expect(validatePromptTemplateText('{"type":"plain"}')).toMatch(/promptTemplate must be a JSON array/i);
  });
});

// ---------------------------------------------------------------------------
// serializePromptTemplate
// ---------------------------------------------------------------------------

describe('serializePromptTemplate', () => {
  it('serializes empty items to "[]"', () => {
    const result = serializePromptTemplate({ items: [] });
    expect(JSON.parse(result)).toEqual([]);
  });

  it('round-trips a plain item', () => {
    const original = stringify([PLAIN]);
    const m = parsePromptTemplate(original);
    const result = serializePromptTemplate(m);
    const parsed = JSON.parse(result) as Record<string, unknown>[];
    expect(parsed[0]).toMatchObject(PLAIN);
    expect(parsed[0]['id']).toBeTruthy();
  });

  it('round-trips a jailbreak item', () => {
    const original = stringify([JAILBREAK]);
    const m = parsePromptTemplate(original);
    const result = serializePromptTemplate(m);
    const parsed = JSON.parse(result) as Record<string, unknown>[];
    expect(parsed[0]).toMatchObject(JAILBREAK);
    expect(parsed[0]['id']).toBeTruthy();
  });

  it('round-trips a chat item with rangeEnd: "end"', () => {
    const original = stringify([CHAT_END]);
    const m = parsePromptTemplate(original);
    const result = serializePromptTemplate(m);
    const parsed = JSON.parse(result) as Record<string, unknown>[];
    expect(parsed[0]).toMatchObject(CHAT_END);
    expect(parsed[0]['id']).toBeTruthy();
  });

  it('round-trips typed items', () => {
    const original = stringify([PERSONA, DESCRIPTION_FMT]);
    const m = parsePromptTemplate(original);
    const result = serializePromptTemplate(m);
    const parsed = JSON.parse(result) as Record<string, unknown>[];
    expect(parsed[0]).toMatchObject(PERSONA);
    expect(parsed[1]).toMatchObject(DESCRIPTION_FMT);
    expect(parsed[0]['id']).toBeTruthy();
    expect(parsed[1]['id']).toBeTruthy();
  });

  it('round-trips authornote with defaultText', () => {
    const original = stringify([AUTHORNOTE_DEFAULT]);
    const m = parsePromptTemplate(original);
    const result = serializePromptTemplate(m);
    const parsed = JSON.parse(result) as Record<string, unknown>[];
    expect(parsed[0]).toMatchObject(AUTHORNOTE_DEFAULT);
    expect(parsed[0]['id']).toBeTruthy();
  });

  it('round-trips cache items', () => {
    const original = stringify([CACHE, CACHE_ALL]);
    const m = parsePromptTemplate(original);
    const result = serializePromptTemplate(m);
    const parsed = JSON.parse(result) as Record<string, unknown>[];
    expect(parsed[0]).toMatchObject(CACHE);
    expect(parsed[1]).toMatchObject(CACHE_ALL);
    expect(parsed[0]['id']).toBeTruthy();
    expect(parsed[1]['id']).toBeTruthy();
  });

  it('serializes unknown items from rawValue (no data loss)', () => {
    const original = stringify([UNKNOWN]);
    const m = parsePromptTemplate(original);
    const result = serializePromptTemplate(m);
    expect(JSON.parse(result)).toEqual([UNKNOWN]);
  });

  it('preserves extra fields on known items through rawValue', () => {
    const withExtra = { ...PLAIN, customExtraField: 'keep me' };
    const m = parsePromptTemplate(stringify([withExtra]));
    const result = serializePromptTemplate(m);
    const parsed = JSON.parse(result) as unknown[];
    expect((parsed[0] as Record<string, unknown>)['customExtraField']).toBe('keep me');
  });

  it('round-trips a mixed template (known + unknown)', () => {
    const items = [PLAIN, UNKNOWN, CHAT_END];
    const m = parsePromptTemplate(stringify(items));
    const result = serializePromptTemplate(m);
    const parsed = JSON.parse(result) as Record<string, unknown>[];
    expect(parsed[0]).toMatchObject(PLAIN);
    expect(parsed[1]).toMatchObject(UNKNOWN);
    expect(parsed[2]).toMatchObject(CHAT_END);
  });
});

// ---------------------------------------------------------------------------
// parseFormatingOrder
// ---------------------------------------------------------------------------

describe('parseFormatingOrder', () => {
  it('returns empty state for blank string', () => {
    const m = parseFormatingOrder('');
    expect(m.state).toBe('empty');
    expect(m.items).toHaveLength(0);
  });

  it('returns empty state for "[]"', () => {
    const m = parseFormatingOrder('[]');
    expect(m.state).toBe('empty');
    expect(m.items).toHaveLength(0);
  });

  it('returns invalid state for invalid JSON', () => {
    const m = parseFormatingOrder('{bad');
    expect(m.state).toBe('invalid');
    expect(m.parseError).toBeTruthy();
  });

  it('returns invalid state for non-array JSON', () => {
    const m = parseFormatingOrder('"main"');
    expect(m.state).toBe('invalid');
  });

  it('parses known tokens and marks them as known', () => {
    const m = parseFormatingOrder(JSON.stringify(CANONICAL_ORDER));
    expect(m.state).toBe('valid');
    expect(m.items).toHaveLength(CANONICAL_ORDER.length);
    expect(m.items.every((i) => i.known)).toBe(true);
    expect(m.items.map((i) => i.token)).toEqual(CANONICAL_ORDER);
  });

  it('marks unknown tokens as not known but preserves them', () => {
    const order = ['main', 'customThing', 'description'];
    const m = parseFormatingOrder(JSON.stringify(order));
    expect(m.items[1].token).toBe('customThing');
    expect(m.items[1].known).toBe(false);
    expect(m.items[0].known).toBe(true);
    expect(m.items[2].known).toBe(true);
  });

  it('preserves ordering of tokens', () => {
    const order = ['jailbreak', 'main', 'chats'];
    const m = parseFormatingOrder(JSON.stringify(order));
    expect(m.items.map((i) => i.token)).toEqual(order);
  });

  it('returns invalid state when any entry is not a string', () => {
    const order = ['main', 42, 'chats', null];
    const m = parseFormatingOrder(JSON.stringify(order));
    expect(m.state).toBe('invalid');
    expect(m.parseError).toContain('only string entries');
  });

  it('returns invalid state (not empty) for an array with only non-string entries', () => {
    const m = parseFormatingOrder('[1,2,3]');
    expect(m.state).toBe('invalid');
    expect(m.parseError).toBeTruthy();
  });
});

describe('validateFormatingOrderText', () => {
  it('returns null for valid string-token arrays', () => {
    expect(validateFormatingOrderText(JSON.stringify(['main', 'description']))).toBeNull();
  });

  it('returns a parse error for mixed-type formatingOrder arrays', () => {
    expect(validateFormatingOrderText('["main", 42]')).toMatch(/only string entries/i);
  });
});

describe('validatePresetBiasText', () => {
  it('returns null for valid [string, number][] JSON', () => {
    expect(validatePresetBiasText('[["hello", 5], ["bye", -1]]')).toBeNull();
  });

  it('returns an error for non-pair presetBias entries', () => {
    expect(validatePresetBiasText('[["hello"], ["bye", 1]]')).toMatch(/pairs of \[string, number\]/i);
  });
});

describe('validateLocalStopStringsText', () => {
  it('returns null for valid string arrays', () => {
    expect(validateLocalStopStringsText('["END", "STOP"]')).toBeNull();
  });

  it('returns an error when any localStopStrings entry is not a string', () => {
    expect(validateLocalStopStringsText('["END", 42]')).toMatch(/only string entries/i);
  });
});

// ---------------------------------------------------------------------------
// serializeFormatingOrder
// ---------------------------------------------------------------------------

describe('serializeFormatingOrder', () => {
  it('round-trips known tokens', () => {
    const original = JSON.stringify(CANONICAL_ORDER);
    const m = parseFormatingOrder(original);
    const result = serializeFormatingOrder(m);
    expect(JSON.parse(result)).toEqual(CANONICAL_ORDER);
  });

  it('round-trips unknown tokens', () => {
    const order = ['main', 'customThing', 'chats'];
    const m = parseFormatingOrder(JSON.stringify(order));
    const result = serializeFormatingOrder(m);
    expect(JSON.parse(result)).toEqual(order);
  });

  it('serializes reordered items', () => {
    const m = parseFormatingOrder(JSON.stringify(['main', 'chats', 'jailbreak']));
    // Simulate reorder: swap first two
    const reordered = [m.items[1], m.items[0], m.items[2]];
    const result = serializeFormatingOrder({ items: reordered });
    expect(JSON.parse(result)).toEqual(['chats', 'main', 'jailbreak']);
  });

  it('serializes empty items to "[]"', () => {
    const result = serializeFormatingOrder({ items: [] });
    expect(JSON.parse(result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Default factories
// ---------------------------------------------------------------------------

describe('default factories', () => {
  it('defaultPromptItemPlain creates a plain item with valid defaults', () => {
    const item = defaultPromptItemPlain();
    expect(item.type).toBe('plain');
    expect(item.type2).toBe('normal');
    expect(item.text).toBe('');
    expect(item.role).toBe('system');
    expect(item.supported).toBe(true);
  });

  it('defaultPromptItemPlain accepts type override', () => {
    const item = defaultPromptItemPlain('jailbreak');
    expect(item.type).toBe('jailbreak');
  });

  it('defaultPromptItemChat creates a chat item with rangeEnd "end"', () => {
    const item = defaultPromptItemChat();
    expect(item.type).toBe('chat');
    expect(item.rangeStart).toBe(0);
    expect(item.rangeEnd).toBe('end');
    expect(item.supported).toBe(true);
  });

  it('defaultPromptItemTyped creates a typed item for given kind', () => {
    const item = defaultPromptItemTyped('persona');
    expect(item.type).toBe('persona');
    expect(item.innerFormat).toBeUndefined();
    expect(item.supported).toBe(true);
  });

  it('defaultPromptItemAuthorNote creates an authornote item', () => {
    const item = defaultPromptItemAuthorNote();
    expect(item.type).toBe('authornote');
    expect(item.supported).toBe(true);
  });

  it('defaultFormatingOrder returns a valid model with canonical tokens', () => {
    const m = defaultFormatingOrder();
    expect(m.state).toBe('valid');
    expect(m.items.length).toBeGreaterThan(0);
    expect(m.items.every((i) => i.known)).toBe(true);
  });

  it('defaultFormatingOrder can be round-tripped through serialize', () => {
    const m = defaultFormatingOrder();
    const text = serializeFormatingOrder(m);
    const m2 = parseFormatingOrder(text);
    expect(m2.state).toBe('valid');
    expect(m2.items.map((i) => i.token)).toEqual(m.items.map((i) => i.token));
  });

  it('default factory items have non-empty ids', () => {
    expect(defaultPromptItemPlain().id).toBeTruthy();
    expect(defaultPromptItemChat().id).toBeTruthy();
    expect(defaultPromptItemTyped('persona').id).toBeTruthy();
    expect(defaultPromptItemAuthorNote().id).toBeTruthy();
  });

  it('default factory items have unique ids', () => {
    const ids = [defaultPromptItemPlain().id, defaultPromptItemPlain().id, defaultPromptItemChat().id];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// normalizePromptTemplateForStorage
// ---------------------------------------------------------------------------

describe('normalizePromptTemplateForStorage', () => {
  it('normalizes a JSON string', () => {
    const m = normalizePromptTemplateForStorage(stringify([PLAIN]));
    expect(m.state).toBe('valid');
    expect(m.items).toHaveLength(1);
    expect(m.items[0].supported && m.items[0].id).toBeTruthy();
  });

  it('normalizes an array value', () => {
    const m = normalizePromptTemplateForStorage([PLAIN, CHAT_END]);
    expect(m.state).toBe('valid');
    expect(m.items).toHaveLength(2);
  });

  it('returns empty for null or undefined', () => {
    expect(normalizePromptTemplateForStorage(null).state).toBe('empty');
    expect(normalizePromptTemplateForStorage(undefined).state).toBe('empty');
  });

  it('returns invalid for non-array objects', () => {
    const m = normalizePromptTemplateForStorage({ type: 'plain' });
    expect(m.state).toBe('invalid');
  });
});

// ---------------------------------------------------------------------------
// collectFormatingOrderWarnings
// ---------------------------------------------------------------------------

describe('collectFormatingOrderWarnings', () => {
  it('produces warnings for duplicate formatingOrder tokens', () => {
    const prompt = parsePromptTemplate(
      stringify([PLAIN, { type: 'jailbreak', type2: 'normal', text: '', role: 'user' }]),
    );
    const order = parseFormatingOrder(JSON.stringify(['main', 'jailbreak', 'main']));
    const warnings = collectFormatingOrderWarnings(prompt, order);
    expect(warnings.some((w) => w.includes('Duplicate') && w.includes('main'))).toBe(true);
  });

  it('produces warnings for dangling formatingOrder tokens', () => {
    // Prompt has only a plain item, no lorebook or description
    const prompt = parsePromptTemplate(stringify([PLAIN]));
    const order = parseFormatingOrder(JSON.stringify(['main', 'lorebook', 'description']));
    const warnings = collectFormatingOrderWarnings(prompt, order);
    expect(warnings.some((w) => w.includes('Dangling') && w.includes('lorebook'))).toBe(true);
    expect(warnings.some((w) => w.includes('Dangling') && w.includes('description'))).toBe(true);
  });

  it('produces no warnings for a valid formatting order', () => {
    const prompt = parsePromptTemplate(
      stringify([
        { type: 'jailbreak', type2: 'normal', text: '', role: 'user' },
        { type: 'lorebook' },
        { type: 'description' },
        { type: 'persona' },
        { type: 'authornote' },
        { type: 'postEverything' },
      ]),
    );
    const order = parseFormatingOrder(
      JSON.stringify([
        'main',
        'jailbreak',
        'chats',
        'lorebook',
        'description',
        'personaPrompt',
        'authorNote',
        'postEverything',
        'lastChat',
        'globalNote',
      ]),
    );
    const warnings = collectFormatingOrderWarnings(prompt, order);
    expect(warnings).toHaveLength(0);
  });

  it('warnings do not flip parse state from valid to invalid', () => {
    const prompt = parsePromptTemplate(stringify([PLAIN]));
    const order = parseFormatingOrder(JSON.stringify(['main', 'lorebook', 'main']));
    expect(prompt.state).toBe('valid');
    expect(order.state).toBe('valid');
    const warnings = collectFormatingOrderWarnings(prompt, order);
    expect(warnings.length).toBeGreaterThan(0);
    // Parse state is unchanged
    expect(prompt.state).toBe('valid');
    expect(order.state).toBe('valid');
  });
});
