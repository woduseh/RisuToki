import { describe, expect, it } from 'vitest';
import { planMcpDataUpdate } from './mcp-data-update';

describe('MCP data update planner', () => {
  it('backs up lorebook tabs and requests sidebar refreshes', () => {
    const plan = planMcpDataUpdate('lorebook', [
      { id: 'lore_0', getValue: () => 'entry-0' },
      { id: 'lore_1', getValue: () => 'entry-1' },
      { id: 'description', getValue: () => 'desc' }
    ]);

    expect(plan).toEqual({
      backupTabIds: ['lore_0', 'lore_1'],
      refreshIndexedPrefixes: ['lore_'],
      refreshSidebar: true,
      statusMessage: 'AI 어시스턴트가 로어북을 수정했습니다',
      updateFileLabel: false
    });
  });

  it('backs up lua section tabs and marks name updates for label refresh', () => {
    expect(planMcpDataUpdate('lua', [
      { id: 'lua', getValue: () => '-- full' },
      { id: 'lua_s0', getValue: () => '-- section' },
      { id: 'css', getValue: () => '<style />' }
    ])).toEqual({
      backupTabIds: ['lua', 'lua_s0'],
      refreshIndexedPrefixes: ['lua_s'],
      refreshSidebar: true,
      statusMessage: 'AI 어시스턴트가 lua 필드를 수정했습니다',
      updateFileLabel: false
    });

    expect(planMcpDataUpdate('name', [
      { id: 'name', getValue: () => 'Toki' },
      { id: 'assetPromptTemplate', getValue: () => 'template' }
    ])).toEqual({
      backupTabIds: ['name'],
      refreshIndexedPrefixes: [],
      refreshSidebar: false,
      statusMessage: 'AI 어시스턴트가 name 필드를 수정했습니다',
      updateFileLabel: true
    });
  });
});
