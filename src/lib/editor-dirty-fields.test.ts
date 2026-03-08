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
        regex: [{ comment: 'cleanup' }]
      },
      openTabs: [
        { id: 'lua_s0', getValue: () => '-- section override' },
        { id: 'regex_2', getValue: () => 'pattern' },
        { id: 'name', getValue: () => 'Toki' }
      ]
    });

    expect(fields).toEqual({
      lua: '-- combined lua',
      name: 'Toki',
      regex: [{ comment: 'cleanup' }]
    });
  });

  it('wraps raw css saves in a style tag and detects dirty prefixes', () => {
    const dirtyFields = new Set(['css', 'lore_1']);
    const fields = collectDirtyEditorFields({
      dirtyFields,
      fileData: {
        css: '<style>.persisted { color: blue; }</style>',
        lorebook: [{ comment: 'entry' }]
      },
      openTabs: [
        { id: 'css', getValue: () => '.next { color: pink; }' },
        { id: 'description', getValue: () => 'Desc' }
      ]
    });

    expect(hasDirtyTabWithPrefix(dirtyFields, 'lore_')).toBe(true);
    expect(fields).toEqual({
      css: '<style>.persisted { color: blue; }</style>',
      description: 'Desc',
      lorebook: [{ comment: 'entry' }]
    });
  });
});
