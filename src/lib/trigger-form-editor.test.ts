import { describe, expect, it, vi } from 'vitest';
import * as formEditor from './form-editor';
import { parseTriggerScriptsText, serializeTriggerScriptModel } from './trigger-script-model';
import {
  coerceTriggerFormInputValue,
  getTriggerFormValidationMessage,
  getTriggerListItems,
  resolveTriggerDetailState,
  updateTriggerFormLuaEffectCode,
  updateTriggerFormScalarField,
  validateTriggerFormDraft,
} from './trigger-form-editor';
import { TabManager } from './tab-manager';

const { createTriggerScriptsFormTab } = formEditor;

function createTestTabManager(onActivateTab = vi.fn()) {
  return new TabManager('editor-tabs', {
    onActivateTab,
    onDisposeFormEditors: vi.fn(),
    onClearEditor: vi.fn(),
    isPanelPoppedOut: () => false,
    onPopOutTab: vi.fn(),
    isFormTabType: () => false,
  });
}

describe('trigger form editor helpers', () => {
  it('coerces typed inputs for booleans, numbers, and selects', () => {
    expect(coerceTriggerFormInputValue('checkbox', true)).toBe(true);
    expect(coerceTriggerFormInputValue('checkbox', false)).toBe(false);
    expect(coerceTriggerFormInputValue('number', '12')).toBe(12);
    expect(coerceTriggerFormInputValue('number', '0.5')).toBe(0.5);
    expect(coerceTriggerFormInputValue('number', 'oops')).toBeUndefined();
    expect(coerceTriggerFormInputValue('select', 'manual')).toBe('manual');
    expect(coerceTriggerFormInputValue('select', 'true', 'boolean')).toBe(true);
    expect(coerceTriggerFormInputValue('select', '7', 'number')).toBe(7);
  });

  it('reports unsupported condition and effect markers in trigger drafts', () => {
    const draft = parseTriggerScriptsText(
      JSON.stringify(
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
      ),
    );

    const errors = validateTriggerFormDraft(draft);

    expect(errors).toEqual([
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
    ]);
    expect(getTriggerFormValidationMessage(draft)).toContain('지원되지 않는 트리거 조건/효과');
  });

  it('builds triggerScripts tabs in shared _triggerform mode and serializes form edits back to text', () => {
    let rawText = JSON.stringify(
      [
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
    const tab = createTriggerScriptsFormTab({
      getText: () => rawText,
      setText: (value) => {
        rawText = value;
      },
      selectedIndex: 3,
    });

    expect(tab.language).toBe('_triggerform');
    expect(tab._triggerSelectedIndex).toBe(3);

    const draft = tab.getValue() as ReturnType<typeof parseTriggerScriptsText>;
    updateTriggerFormScalarField(draft.triggers[0], 'comment', 'edited');
    tab.setValue?.(draft);

    expect(JSON.parse(rawText)).toEqual([
      {
        comment: 'edited',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("main")' }],
        lowLevelAccess: false,
      },
    ]);
  });

  it('routes triggerScripts tab opening through the shared _triggerform tab path', () => {
    const openTriggerScriptsFormTab = (
      formEditor as {
        openTriggerScriptsFormTab?: (
          tabMgr: Pick<TabManager, 'openTabs' | 'openTab'>,
          options: formEditor.TriggerScriptsFormTabOptions,
        ) => ReturnType<typeof formEditor.createTriggerScriptsFormTab> | null;
      }
    ).openTriggerScriptsFormTab;

    expect(openTriggerScriptsFormTab).toBeTypeOf('function');
    if (!openTriggerScriptsFormTab) return;

    let rawText = JSON.stringify(
      [
        {
          comment: 'legacy',
          type: 'start',
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'print("legacy")' }],
          lowLevelAccess: false,
        },
      ],
      null,
      2,
    );
    const onActivateTab = vi.fn();
    const tabMgr = createTestTabManager(onActivateTab);
    const legacyTab = tabMgr.openTab(
      'triggerScripts',
      '트리거 스크립트',
      'json',
      () => rawText,
      (value) => {
        rawText = value as string;
      },
    );
    legacyTab._triggerSelectedIndex = 2;
    onActivateTab.mockClear();

    const tab = openTriggerScriptsFormTab(tabMgr, {
      getText: () => rawText,
      setText: (value) => {
        rawText = value;
      },
    });

    expect(tab).toBeTruthy();
    expect(tab?.language).toBe('_triggerform');
    expect(tabMgr.findTab('triggerScripts')?.language).toBe('_triggerform');
    expect(tab?._triggerSelectedIndex).toBe(2);
    expect(onActivateTab).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'triggerScripts', language: '_triggerform' }),
    );

    const draft = tab?.getValue() as ReturnType<typeof parseTriggerScriptsText>;
    updateTriggerFormScalarField(draft.triggers[0], 'comment', 'rerouted');
    tab?.setValue?.(draft);

    expect(JSON.parse(rawText)).toEqual([
      {
        comment: 'rerouted',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("legacy")' }],
        lowLevelAccess: false,
      },
    ]);
  });

  it('builds list items and resolves a detail selection for trigger drafts', () => {
    const draft = parseTriggerScriptsText(
      JSON.stringify(
        [
          {
            comment: 'main',
            type: 'start',
            conditions: [],
            effect: [{ type: 'triggerlua', code: 'print("main")' }],
            lowLevelAccess: false,
          },
          {
            comment: '',
            type: 'manual',
            conditions: [{ type: 'custom', key: 'mode', value: 'debug' }],
            effect: [{ type: 'triggerlua', code: 'print("manual")' }],
            lowLevelAccess: true,
          },
        ],
        null,
        2,
      ),
    );

    expect(getTriggerListItems(draft)).toEqual([
      expect.objectContaining({
        index: 0,
        label: 'main',
        type: 'start',
        conditionCount: 0,
        effectCount: 1,
        supported: true,
      }),
      expect.objectContaining({
        index: 1,
        label: '트리거 2',
        type: 'manual',
        conditionCount: 1,
        effectCount: 1,
        supported: true,
      }),
    ]);

    expect(resolveTriggerDetailState(draft, 9)).toMatchObject({
      selectedIndex: 0,
      selectedItem: expect.objectContaining({ index: 0, label: 'main' }),
      selectedTrigger: draft.triggers[0],
    });
    expect(resolveTriggerDetailState(draft, 1)).toMatchObject({
      selectedIndex: 1,
      selectedItem: expect.objectContaining({ index: 1, label: '트리거 2' }),
      selectedTrigger: draft.triggers[1],
    });
    expect(resolveTriggerDetailState(parseTriggerScriptsText('[]'), null)).toMatchObject({
      selectedIndex: -1,
      selectedItem: null,
      selectedTrigger: null,
    });
  });

  it('syncs unsupported trigger form edits into serialization backings', () => {
    const draft = parseTriggerScriptsText(
      JSON.stringify(
        [
          {
            comment: 'legacy',
            type: 'start',
            conditions: [{ type: 'timer', seconds: 5 }],
            effect: [{ type: 'triggerlua', code: 'print("legacy")' }],
            lowLevelAccess: false,
          },
        ],
        null,
        2,
      ),
    );

    const trigger = draft.triggers[0];
    const luaEffect = trigger.effects.find((effect) => effect.supported && effect.type === 'triggerlua');

    expect(trigger.supported).toBe(false);
    expect(luaEffect).toBeTruthy();

    updateTriggerFormScalarField(trigger, 'comment', 'edited');
    updateTriggerFormScalarField(trigger, 'type', 'manual');
    updateTriggerFormScalarField(trigger, 'lowLevelAccess', true);
    updateTriggerFormLuaEffectCode(trigger, luaEffect!, 'print("edited")');

    expect(trigger.comment).toBe('edited');
    expect(trigger.type).toBe('manual');
    expect(trigger.lowLevelAccess).toBe(true);
    expect(trigger.value.comment).toBe('edited');
    expect(trigger.value.type).toBe('manual');
    expect(trigger.value.lowLevelAccess).toBe(true);
    expect((trigger.rawValue as Record<string, unknown>).comment).toBe('edited');
    expect((trigger.rawValue as Record<string, unknown>).type).toBe('manual');
    expect((trigger.rawValue as Record<string, unknown>).lowLevelAccess).toBe(true);
    expect(luaEffect?.value.code).toBe('print("edited")');
    expect((luaEffect?.rawValue as Record<string, unknown>).code).toBe('print("edited")');
    expect(JSON.parse(serializeTriggerScriptModel(draft))).toEqual([
      {
        comment: 'edited',
        type: 'manual',
        conditions: [{ type: 'timer', seconds: 5 }],
        effect: [{ type: 'triggerlua', code: 'print("edited")' }],
        lowLevelAccess: true,
      },
    ]);
  });

  it('normalizes malformed non-object triggers once form edits need object-backed serialization', () => {
    const draft = parseTriggerScriptsText(JSON.stringify([123], null, 2));
    const trigger = draft.triggers[0];

    expect(trigger.supported).toBe(false);
    expect(trigger.rawValue).toBe(123);

    updateTriggerFormScalarField(trigger, 'comment', 'recovered');
    updateTriggerFormScalarField(trigger, 'type', 'manual');
    updateTriggerFormScalarField(trigger, 'lowLevelAccess', true);

    expect(trigger.value).toEqual({
      comment: 'recovered',
      type: 'manual',
      lowLevelAccess: true,
    });
    expect(trigger.rawValue).toEqual({
      comment: 'recovered',
      type: 'manual',
      lowLevelAccess: true,
    });
    expect(JSON.parse(serializeTriggerScriptModel(draft))).toEqual([
      {
        comment: 'recovered',
        type: 'manual',
        lowLevelAccess: true,
      },
    ]);
  });
});
