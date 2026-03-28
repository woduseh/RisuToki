import { describe, expect, it } from 'vitest';
import {
  classifyTriggerScriptsText,
  isTriggerScriptsLuaMode,
  parseTriggerScriptsText,
  serializeTriggerScriptModel,
} from './trigger-script-model';
import {
  mergeLuaIntoTriggerScriptsText,
  tryExtractPrimaryLuaFromTriggerScriptsText,
} from '../app/trigger-script-utils';

const LUA_WRAPPER = [
  {
    comment: '',
    type: 'start',
    conditions: [],
    effect: [{ type: 'triggerlua', code: 'print("hello")' }],
    lowLevelAccess: false,
  },
];

const STRUCTURED_TRIGGER_LIST = [
  {
    comment: 'main',
    type: 'start',
    conditions: [],
    effect: [{ type: 'triggerlua', code: 'print("main")' }],
    lowLevelAccess: false,
  },
  {
    comment: 'manual',
    type: 'manual',
    conditions: [{ type: 'custom', key: 'mode', value: 'debug' }],
    effect: [{ type: 'triggerlua', code: 'print("manual")' }],
    lowLevelAccess: true,
  },
];

describe('trigger script model', () => {
  it('classifies blank and empty trigger script text as empty', () => {
    expect(classifyTriggerScriptsText('')).toBe('empty');
    expect(classifyTriggerScriptsText('[]')).toBe('empty');
  });

  it('classifies a single triggerlua wrapper as lua mode', () => {
    const text = JSON.stringify(LUA_WRAPPER, null, 2);

    const parsed = parseTriggerScriptsText(text);

    expect(parsed.state).toBe('lua');
    expect(parsed.primaryLua).toBe('print("hello")');
    expect(parsed.hasUnsupportedContent).toBe(false);
    expect(parsed.triggers).toHaveLength(1);
    expect(parsed.triggers[0]).toMatchObject({
      comment: '',
      type: 'start',
      lowLevelAccess: false,
      supported: true,
      effects: [expect.objectContaining({ type: 'triggerlua', code: 'print("hello")', supported: true })],
    });
  });

  it('treats empty, invalid, and single-wrapper triggerScripts as lua-mode sidebar states', () => {
    expect(isTriggerScriptsLuaMode('')).toBe(true);
    expect(isTriggerScriptsLuaMode('{')).toBe(true);
    expect(
      isTriggerScriptsLuaMode(
        JSON.stringify(
          [
            {
              comment: '',
              type: 'start',
              conditions: [],
              effect: [{ type: 'triggerlua', code: '' }],
              lowLevelAccess: false,
            },
          ],
          null,
          2,
        ),
      ),
    ).toBe(true);
  });

  it('treats structured trigger lists as trigger-mode sidebar states', () => {
    expect(isTriggerScriptsLuaMode(JSON.stringify(STRUCTURED_TRIGGER_LIST, null, 2))).toBe(false);
  });

  it('treats a canonical wrapper with blank code as lua mode', () => {
    const text = JSON.stringify(
      [
        {
          comment: '',
          type: 'start',
          conditions: [],
          effect: [{ type: 'triggerlua', code: '' }],
          lowLevelAccess: false,
        },
      ],
      null,
      2,
    );

    const parsed = parseTriggerScriptsText(text);

    expect(parsed.state).toBe('lua');
    expect(parsed.primaryLua).toBe('');
    expect(parsed.hasUnsupportedContent).toBe(false);
  });

  it('does not treat a single non-wrapper trigger as lua mode', () => {
    const text = JSON.stringify(
      [
        {
          comment: 'manual only',
          type: 'manual',
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'print("manual")' }],
          lowLevelAccess: true,
        },
      ],
      null,
      2,
    );

    expect(parseTriggerScriptsText(text).state).toBe('trigger-editor');
  });

  it('does not treat a wrapper-like trigger with extra effect metadata as lua mode', () => {
    const text = JSON.stringify(
      [
        {
          comment: '',
          type: 'start',
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'print("manual")', folder: 'keep-me' }],
          lowLevelAccess: false,
        },
      ],
      null,
      2,
    );

    expect(parseTriggerScriptsText(text).state).toBe('trigger-editor');
  });

  it('parses structured trigger lists and serializes them without losing supported fields', () => {
    const text = JSON.stringify(STRUCTURED_TRIGGER_LIST, null, 2);

    const parsed = parseTriggerScriptsText(text);

    expect(parsed.state).toBe('trigger-editor');
    expect(parsed.primaryLua).toBe('print("main")');
    expect(parsed.hasUnsupportedContent).toBe(false);
    expect(parsed.triggers).toHaveLength(2);
    expect(parsed.triggers[1]).toMatchObject({
      comment: 'manual',
      type: 'manual',
      lowLevelAccess: true,
      supported: true,
      conditions: [expect.objectContaining({ type: 'custom', supported: true })],
      effects: [expect.objectContaining({ type: 'triggerlua', code: 'print("manual")', supported: true })],
    });
    expect(JSON.parse(serializeTriggerScriptModel(parsed))).toEqual(STRUCTURED_TRIGGER_LIST);
  });

  it('preserves sparse legacy trigger shapes on serialize', () => {
    const text = JSON.stringify([{ effect: [{ type: 'triggerlua', code: 'print("legacy")' }] }], null, 2);

    expect(JSON.parse(serializeTriggerScriptModel(parseTriggerScriptsText(text)))).toEqual([
      {
        effect: [{ type: 'triggerlua', code: 'print("legacy")' }],
      },
    ]);
  });

  it('preserves legacy lua effects that omit their type until edited', () => {
    const text = JSON.stringify([{ effect: [{ code: 'print("legacy")' }] }], null, 2);

    expect(JSON.parse(serializeTriggerScriptModel(parseTriggerScriptsText(text)))).toEqual([
      {
        effect: [{ code: 'print("legacy")' }],
      },
    ]);
  });

  it('materializes new top-level fields when a sparse legacy trigger is edited', () => {
    const parsed = parseTriggerScriptsText(
      JSON.stringify([{ effect: [{ type: 'triggerlua', code: 'print("legacy")' }] }]),
    );

    parsed.triggers[0].comment = 'filled';
    parsed.triggers[0].type = 'manual';
    parsed.triggers[0].lowLevelAccess = true;

    expect(JSON.parse(serializeTriggerScriptModel(parsed))).toEqual([
      {
        comment: 'filled',
        type: 'manual',
        effect: [{ type: 'triggerlua', code: 'print("legacy")' }],
        lowLevelAccess: true,
      },
    ]);
  });

  it('accepts plural effects input and serializes it back to the canonical effect field', () => {
    const text = JSON.stringify(
      [
        {
          comment: '',
          type: 'start',
          conditions: [],
          effects: [{ type: 'triggerlua', code: 'print("alias")' }],
          lowLevelAccess: false,
        },
      ],
      null,
      2,
    );

    const parsed = parseTriggerScriptsText(text);
    const serialized = JSON.parse(serializeTriggerScriptModel(parsed));

    expect(parsed.primaryLua).toBe('print("alias")');
    expect(parsed.hasUnsupportedContent).toBe(false);
    expect(parsed.state).toBe('trigger-editor');
    expect(serialized).toEqual([
      {
        comment: '',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("alias")' }],
        lowLevelAccess: false,
      },
    ]);
  });

  it('preserves malformed plural effects content instead of normalizing it away', () => {
    const text = JSON.stringify(
      [
        {
          comment: '',
          type: 'start',
          conditions: [],
          effects: { bad: true },
          lowLevelAccess: false,
        },
      ],
      null,
      2,
    );

    const parsed = parseTriggerScriptsText(text);

    expect(parsed.hasUnsupportedContent).toBe(true);
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'trigger', code: 'invalid-effects', path: 'triggers[0].effects' }),
      ]),
    );
    expect(JSON.parse(serializeTriggerScriptModel(parsed))).toEqual([
      {
        comment: '',
        type: 'start',
        conditions: [],
        effects: { bad: true },
        lowLevelAccess: false,
      },
    ]);
  });

  it('flags unsupported effect and condition shapes for later UI save blocking', () => {
    const text = JSON.stringify(
      [
        {
          comment: 'unsupported',
          type: 'manual',
          conditions: [{ type: 'timer', seconds: 5 }],
          effect: [{ type: 'toast', message: 'hello' }],
          lowLevelAccess: false,
        },
      ],
      null,
      2,
    );

    const parsed = parseTriggerScriptsText(text);

    expect(parsed.state).toBe('trigger-editor');
    expect(parsed.hasUnsupportedContent).toBe(true);
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'condition',
          code: 'unsupported-condition',
          path: 'triggers[0].conditions[0]',
        }),
        expect.objectContaining({
          kind: 'effect',
          code: 'unsupported-effect',
          path: 'triggers[0].effects[0]',
        }),
      ]),
    );
  });

  it('does not treat malformed effect type values as legacy triggerlua effects', () => {
    const text = JSON.stringify(
      [
        {
          comment: '',
          type: 'start',
          conditions: [],
          effect: [{ type: 123, code: 'print("bad")' }],
          lowLevelAccess: false,
        },
      ],
      null,
      2,
    );

    const parsed = parseTriggerScriptsText(text);

    expect(parsed.hasUnsupportedContent).toBe(true);
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'effect', code: 'unsupported-effect', path: 'triggers[0].effects[0]' }),
      ]),
    );
    expect(JSON.parse(serializeTriggerScriptModel(parsed))).toEqual([
      {
        comment: '',
        type: 'start',
        conditions: [],
        effect: [{ type: 123, code: 'print("bad")' }],
        lowLevelAccess: false,
      },
    ]);
  });

  it('flags malformed top-level trigger fields without coercing them on serialize', () => {
    const text = JSON.stringify(
      [
        {
          comment: 123,
          type: ['start'],
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'print("hello")' }],
          lowLevelAccess: 'false',
        },
      ],
      null,
      2,
    );

    const parsed = parseTriggerScriptsText(text);

    expect(parsed.hasUnsupportedContent).toBe(true);
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'trigger', code: 'invalid-trigger-field', path: 'triggers[0].comment' }),
        expect.objectContaining({ kind: 'trigger', code: 'invalid-trigger-field', path: 'triggers[0].type' }),
        expect.objectContaining({
          kind: 'trigger',
          code: 'invalid-trigger-field',
          path: 'triggers[0].lowLevelAccess',
        }),
      ]),
    );
    expect(JSON.parse(serializeTriggerScriptModel(parsed))).toEqual([
      {
        comment: 123,
        type: ['start'],
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("hello")' }],
        lowLevelAccess: 'false',
      },
    ]);
  });

  it('preserves malformed non-object trigger entries on serialize', () => {
    const text = JSON.stringify([123], null, 2);

    const parsed = parseTriggerScriptsText(text);

    expect(parsed.hasUnsupportedContent).toBe(true);
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'trigger', code: 'invalid-trigger', path: 'triggers[0]' }),
      ]),
    );
    expect(JSON.parse(serializeTriggerScriptModel(parsed))).toEqual([123]);
  });

  it('surfaces invalid JSON separately from empty content', () => {
    const parsed = parseTriggerScriptsText('{');

    expect(parsed.state).toBe('invalid');
    expect(parsed.parseError).toMatch(/JSON/i);
    expect(parsed.triggers).toEqual([]);
  });
});

describe('trigger script text compatibility helpers', () => {
  it('treats blank trigger script text as empty lua instead of parse failure', () => {
    expect(tryExtractPrimaryLuaFromTriggerScriptsText('')).toBe('');
  });

  it('extracts primary lua from legacy effects that omit a type', () => {
    const text = JSON.stringify([{ effect: [{ code: 'print("legacy")' }] }], null, 2);

    expect(tryExtractPrimaryLuaFromTriggerScriptsText(text)).toBe('print("legacy")');
  });

  it('prefers the start trigger when extracting and merging primary lua', () => {
    const text = JSON.stringify(
      [
        {
          comment: 'manual',
          type: 'manual',
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'print("manual")' }],
          lowLevelAccess: false,
        },
        {
          comment: 'main',
          type: 'start',
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'print("main")' }],
          lowLevelAccess: false,
        },
      ],
      null,
      2,
    );
    const updated = mergeLuaIntoTriggerScriptsText(text, 'print("updated")');

    expect(tryExtractPrimaryLuaFromTriggerScriptsText(text)).toBe('print("main")');
    expect(JSON.parse(updated)).toEqual([
      {
        comment: 'manual',
        type: 'manual',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("manual")' }],
        lowLevelAccess: false,
      },
      {
        comment: 'main',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("updated")' }],
        lowLevelAccess: false,
      },
    ]);
  });

  it('updates the first lua-like effect and prepends a wrapper when needed', () => {
    const updated = mergeLuaIntoTriggerScriptsText(
      JSON.stringify(
        [
          {
            comment: 'legacy',
            type: 'start',
            conditions: [],
            effect: [{ code: 'print("old")' }],
            lowLevelAccess: false,
          },
        ],
        null,
        2,
      ),
      'print("new")',
    );
    const created = mergeLuaIntoTriggerScriptsText('[]', 'print("new")');

    expect(JSON.parse(updated)).toEqual([
      {
        comment: 'legacy',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("new")' }],
        lowLevelAccess: false,
      },
    ]);
    expect(JSON.parse(created)).toEqual([
      {
        comment: '',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("new")' }],
        lowLevelAccess: false,
      },
    ]);
  });

  it('does not overwrite unsupported effects that merely happen to carry code text', () => {
    const updated = mergeLuaIntoTriggerScriptsText(
      JSON.stringify(
        [
          {
            comment: 'unsupported',
            type: 'manual',
            conditions: [],
            effect: [{ type: 'toast', code: 'keep-me', message: 'hello' }],
            lowLevelAccess: false,
          },
        ],
        null,
        2,
      ),
      'print("new")',
    );

    expect(JSON.parse(updated)).toEqual([
      {
        comment: '',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("new")' }],
        lowLevelAccess: false,
      },
      {
        comment: 'unsupported',
        type: 'manual',
        conditions: [],
        effect: [{ type: 'toast', code: 'keep-me', message: 'hello' }],
        lowLevelAccess: false,
      },
    ]);
  });

  it('repairs malformed triggerlua effects when lua is updated', () => {
    const updated = mergeLuaIntoTriggerScriptsText(
      JSON.stringify(
        [
          {
            comment: '',
            type: 'start',
            conditions: [],
            effect: [{ type: 'triggerlua' }],
            lowLevelAccess: false,
          },
        ],
        null,
        2,
      ),
      'print("fixed")',
    );

    expect(JSON.parse(updated)).toEqual([
      {
        comment: '',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("fixed")' }],
        lowLevelAccess: false,
      },
    ]);
  });

  it('updates triggerlua effects inside otherwise unsupported triggers without dropping sibling effects', () => {
    const updated = mergeLuaIntoTriggerScriptsText(
      JSON.stringify(
        [
          {
            comment: 'mixed',
            type: 'manual',
            conditions: [],
            effect: [
              { type: 'toast', message: 'hello' },
              { type: 'triggerlua', code: 'print("old")' },
            ],
            lowLevelAccess: false,
          },
        ],
        null,
        2,
      ),
      'print("new")',
    );

    expect(JSON.parse(updated)).toEqual([
      {
        comment: 'mixed',
        type: 'manual',
        conditions: [],
        effect: [
          { type: 'toast', message: 'hello' },
          { type: 'triggerlua', code: 'print("new")' },
        ],
        lowLevelAccess: false,
      },
    ]);
  });

  it('preserves malformed plural effects alias data when lua is updated', () => {
    const updated = mergeLuaIntoTriggerScriptsText(
      JSON.stringify(
        [
          {
            comment: '',
            type: 'start',
            conditions: [],
            effect: [{ type: 'triggerlua', code: 'print("old")' }],
            effects: { bad: true },
            lowLevelAccess: false,
          },
        ],
        null,
        2,
      ),
      'print("new")',
    );

    expect(JSON.parse(updated)).toEqual([
      {
        comment: '',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("new")' }],
        effects: { bad: true },
        lowLevelAccess: false,
      },
    ]);
  });

  it('removes a canonical lua wrapper when lua is cleared', () => {
    const cleared = mergeLuaIntoTriggerScriptsText(JSON.stringify(LUA_WRAPPER, null, 2), '');

    expect(JSON.parse(cleared)).toEqual([]);
    expect(tryExtractPrimaryLuaFromTriggerScriptsText(cleared)).toBe('');
  });

  it('keeps wrapper-like triggers with extra metadata when lua is cleared', () => {
    const original = [
      {
        comment: '',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("hello")' }],
        lowLevelAccess: false,
        folder: 'preserve-me',
      },
    ];
    const cleared = mergeLuaIntoTriggerScriptsText(JSON.stringify(original, null, 2), '');

    expect(JSON.parse(cleared)).toEqual(original);
  });

  it('keeps wrapper-like triggers with extra effect metadata when lua is cleared', () => {
    const original = [
      {
        comment: '',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("hello")', folder: 'preserve-me' }],
        lowLevelAccess: false,
      },
    ];
    const cleared = mergeLuaIntoTriggerScriptsText(JSON.stringify(original, null, 2), '');

    expect(JSON.parse(cleared)).toEqual(original);
  });

  it('keeps plural-effects wrappers when lua is cleared', () => {
    const original = [
      {
        comment: '',
        type: 'start',
        conditions: [],
        effects: [{ type: 'triggerlua', code: 'print("hello")' }],
        lowLevelAccess: false,
      },
    ];
    const cleared = mergeLuaIntoTriggerScriptsText(JSON.stringify(original, null, 2), '');

    expect(JSON.parse(cleared)).toEqual(original);
  });

  it('removes a later canonical wrapper without mutating earlier non-canonical lua content', () => {
    const original = [
      {
        comment: 'keep-me',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("custom")' }],
        lowLevelAccess: false,
        folder: 'custom',
      },
      {
        comment: '',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("wrapper")' }],
        lowLevelAccess: false,
      },
    ];
    const cleared = mergeLuaIntoTriggerScriptsText(JSON.stringify(original, null, 2), '');

    expect(JSON.parse(cleared)).toEqual([original[0]]);
  });
});
