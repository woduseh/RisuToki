import { describe, expect, it } from 'vitest';
import { getReferenceExplorerWorkspaces } from './reference-explorer-model';

describe('reference explorer workspaces', () => {
  it('groups CHARX surfaces like the main workspace navigator', () => {
    const groups = getReferenceExplorerWorkspaces('charx', {
      description: 'Character',
      firstMessage: 'Hello',
      lua: 'print("hi")',
      lorebook: [{ comment: 'World' }],
    });

    expect(groups.map((group) => group.id)).toEqual(['character', 'messages', 'scripts', 'lorebook']);
    expect(groups.find((group) => group.id === 'messages')?.items.map((item) => item.key)).toContain('firstMessage');
  });

  it('groups RISUM module and structured collections without empty workspaces', () => {
    const groups = getReferenceExplorerWorkspaces('risum', {
      moduleName: 'Module',
      triggerScripts: '[{"type":"start"}]',
      lorebook: [],
    });

    expect(groups.map((group) => group.id)).toEqual(['module', 'scripts']);
  });

  it('folds detailed RISUP groups into the five user-facing workspaces', () => {
    const groups = getReferenceExplorerWorkspaces('risup', {});

    expect(groups.map((group) => group.id)).toEqual(['basic', 'prompts', 'model', 'parameters', 'advanced']);
    expect(groups.find((group) => group.id === 'model')?.items.map((item) => item.key)).toEqual(
      expect.arrayContaining(['risup:model-api', 'risup:provider-endpoint']),
    );
  });
});
