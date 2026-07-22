import { describe, expect, it } from 'vitest';
import { getInspectorContext, getWorkspaceDefinitions, inferWorkspaceFromTab } from './workspace-model';
import type { CharxData } from '../stores/app-store';

function data(fileType: 'charx' | 'risum' | 'risup'): CharxData {
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
    expect(getWorkspaceDefinitions(data('risup')).map((item) => item.id)).toEqual([
      'basic',
      'prompts',
      'model',
      'parameters',
      'advanced',
    ]);
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
