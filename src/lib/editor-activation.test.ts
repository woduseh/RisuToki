import { describe, expect, it } from 'vitest';
import { NON_MONACO_EDITOR_TAB_TYPES, requiresMonacoEditor, resolvePendingEditorTab } from './editor-activation';

describe('editor activation helpers', () => {
  it('detects which tabs can render before Monaco is ready', () => {
    expect(requiresMonacoEditor('plaintext')).toBe(true);
    expect(requiresMonacoEditor('lua')).toBe(true);
    expect(requiresMonacoEditor('_image')).toBe(false);
    expect(requiresMonacoEditor('_loreform')).toBe(false);
    expect(requiresMonacoEditor('_regexform')).toBe(false);
    expect(requiresMonacoEditor('_risupform')).toBe(false);
    expect(requiresMonacoEditor('_triggerform')).toBe(false);
    expect(NON_MONACO_EDITOR_TAB_TYPES.has('_image')).toBe(true);
    expect(NON_MONACO_EDITOR_TAB_TYPES.has('_risupform')).toBe(true);
    expect(NON_MONACO_EDITOR_TAB_TYPES.has('_triggerform')).toBe(true);
  });

  it('prefers an explicitly queued tab and falls back to the active tab', () => {
    const openTabs = [
      { id: 'name', language: 'plaintext' },
      { id: 'guide_doc.md', language: 'plaintext' },
      { id: 'lore_0', language: '_loreform' },
    ];

    expect(resolvePendingEditorTab(openTabs, 'guide_doc.md', 'name')).toEqual(openTabs[1]);
    expect(resolvePendingEditorTab(openTabs, null, 'lore_0')).toEqual(openTabs[2]);
    expect(resolvePendingEditorTab(openTabs, 'missing', 'name')).toEqual(openTabs[0]);
    expect(resolvePendingEditorTab(openTabs, 'missing', null)).toBeNull();
  });
});
