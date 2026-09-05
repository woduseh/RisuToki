import { describe, expect, it } from 'vitest';
import {
  getDefaultWorkspace,
  getInspectorContext,
  getWorkspaceDefinitions,
  inferWorkspaceFromTab,
} from './workspace-model';
import type { RendererDocumentData } from '../stores/app-store';

function data(fileType: 'charx' | 'risum' | 'risup'): RendererDocumentData {
  return {
    name: '',
    description: '',
    firstMessage: '',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: '',
    lorebook: [],
    regex: [],
    _fileType: fileType,
  };
}

describe('workspace model', () => {
  it('exposes only the supported workspaces for each document type', () => {
    expect(getWorkspaceDefinitions(data('charx')).map((item) => item.id)).toEqual([
      'character',
      'messages',
      'scripts',
      'lorebook',
      'assets',
    ]);
    expect(getWorkspaceDefinitions(data('risum')).map((item) => item.id)).toEqual([
      'module',
      'scripts',
      'lorebook',
      'assets',
    ]);
    expect(getWorkspaceDefinitions(data('risup')).map((item) => item.id)).toEqual(['prompts', 'toggles', 'scripts']);
    expect(getWorkspaceDefinitions(data('risup')).map((item) => item.label)).toEqual([
      '프롬프트',
      '토글·변수',
      '정규식',
    ]);
    expect(getDefaultWorkspace(data('risup'))).toBe('prompts');
  });

  it('routes preset content and preserves navigation while document settings are open', () => {
    const preset = data('risup');
    expect(inferWorkspaceFromTab('risup_toggles', preset)).toBe('toggles');
    expect(inferWorkspaceFromTab('risup_variables', preset)).toBe('toggles');
    expect(inferWorkspaceFromTab('risup_ordering', preset)).toBeNull();
    expect(inferWorkspaceFromTab('regex_0', preset)).toBe('scripts');
    for (const tab of [
      'risup_basic',
      'risup_model-api',
      'risup_parameters',
      'risup_sampling',
      'risup_thinking',
      'risup_description',
    ]) {
      expect(inferWorkspaceFromTab(tab, preset)).toBeNull();
    }
  });

  it('keeps active tabs and contextual inspectors in the same selection flow', () => {
    expect(inferWorkspaceFromTab('lore_4', data('charx'))).toBe('lorebook');
    expect(inferWorkspaceFromTab('img_assets/other/a.webp', data('charx'))).toBe('assets');
    expect(inferWorkspaceFromTab('risup_prompt_item_welcome', data('risup'))).toBe('prompts');
    expect(getInspectorContext('lore_4')).toEqual({ kind: 'lorebook', itemId: 'lore_4' });
    expect(getInspectorContext('risup_prompt_item_welcome')).toEqual({
      kind: 'prompt',
      itemId: 'risup_prompt_item_welcome',
    });
  });
});
