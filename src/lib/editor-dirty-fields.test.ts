import { describe, expect, it } from 'vitest';
import { collectDirtyEditorFields, hasDirtyTabWithPrefix } from './editor-dirty-fields';

describe('editor dirty field helpers', () => {
  it('collects combined section-backed fields and dirty arrays', () => {
    const fields = collectDirtyEditorFields({
      dirtyFields: new Set(['lua_s0', 'regex_2']),
      fileData: {
        lua: '-- combined lua',
        css: '<style>.a { color: red; }</style>',
        lorebook: [{ comment: 'Lore' }],
        regex: [{ comment: 'cleanup' }],
      },
      openTabs: [
        { id: 'lua_s0', getValue: () => '-- section override' },
        { id: 'regex_2', getValue: () => 'pattern' },
        { id: 'name', getValue: () => 'Toki' },
      ],
    });

    expect(fields).toEqual({
      lua: '-- combined lua',
      name: 'Toki',
      regex: [{ comment: 'cleanup' }],
    });
  });

  it('wraps raw css saves in a style tag and detects dirty prefixes', () => {
    const dirtyFields = new Set(['css', 'lore_1']);
    const fields = collectDirtyEditorFields({
      dirtyFields,
      fileData: {
        css: '<style>.persisted { color: blue; }</style>',
        lorebook: [{ comment: 'entry' }],
      },
      openTabs: [
        { id: 'css', getValue: () => '.next { color: pink; }' },
        { id: 'description', getValue: () => 'Desc' },
      ],
    });

    expect(hasDirtyTabWithPrefix(dirtyFields, 'lore_')).toBe(true);
    expect(fields).toEqual({
      css: '<style>.persisted { color: blue; }</style>',
      description: 'Desc',
      lorebook: [{ comment: 'entry' }],
    });
  });

  it('collects the full risup payload when a risup form tab is dirty even if no risup tab is open', () => {
    const fields = collectDirtyEditorFields({
      dirtyFields: new Set(['risup_prompts']),
      fileData: {
        name: 'Preset',
        description: 'Preset description',
        mainPrompt: 'legacy prompt',
        jailbreak: 'legacy jailbreak',
        promptTemplate: '[{"role":"system","text":"hello"}]',
        formatingOrder: '["main"]',
        customPromptTemplateToggle: 'line 1\nline 2',
        templateDefaultVariables: '{"mood":"calm"}',
        aiModel: 'gemini',
        temperature: 0.7,
      },
      openTabs: [],
    });

    expect(fields).toMatchObject({
      name: 'Preset',
      description: 'Preset description',
      mainPrompt: 'legacy prompt',
      jailbreak: 'legacy jailbreak',
      promptTemplate: '[{"role":"system","text":"hello"}]',
      formatingOrder: '["main"]',
      customPromptTemplateToggle: 'line 1\nline 2',
      templateDefaultVariables: '{"mood":"calm"}',
      aiModel: 'gemini',
      temperature: 0.7,
    });
  });

  it('keeps direct field values autosave-visible even after their tabs are closed', () => {
    const fields = collectDirtyEditorFields({
      dirtyFields: new Set(['firstMessage', 'creatorcomment', 'triggerScripts']),
      fileData: {
        firstMessage: '<p>Hello</p>',
        creatorcomment: 'note',
        triggerScripts: '[{"comment":"start"}]',
      },
      openTabs: [],
    });

    expect(fields).toEqual({
      firstMessage: '<p>Hello</p>',
      creatorcomment: 'note',
      triggerScripts: '[{"comment":"start"}]',
    });
  });

  it('keeps alternate greetings autosave-visible when an edited greeting tab closes', () => {
    const fields = collectDirtyEditorFields({
      dirtyFields: new Set(['altGreet_0']),
      fileData: {
        alternateGreetings: ['hello there'],
      },
      openTabs: [],
    });

    expect(fields).toEqual({
      alternateGreetings: ['hello there'],
    });
  });
});
