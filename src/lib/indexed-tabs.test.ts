import { describe, expect, it } from 'vitest';
import { createRemovalIndexResolver, remapIndexedTabs } from './indexed-tabs';

describe('indexed tab helpers', () => {
  it('shifts tab ids, dirty markers, and active tab after removals', () => {
    const resolveIndex = createRemovalIndexResolver([1, 3]);
    const { tabs, dirtyIds, activeTabId } = remapIndexedTabs({
      tabs: [
        { id: 'lore_0', label: 'zero' },
        { id: 'lore_2', label: 'two' },
        { id: 'name', label: 'name' },
        { id: 'lore_4', label: 'four' }
      ],
      dirtyIds: new Set(['lore_2', 'name']),
      activeTabId: 'lore_4',
      prefix: 'lore_',
      resolveIndex,
      buildTabState: (index) => ({
        id: `lore_${index}`,
        label: `entry-${index}`
      })
    });

    expect(tabs.map((tab) => tab.id)).toEqual(['lore_0', 'lore_1', 'name', 'lore_2']);
    expect([...dirtyIds]).toEqual(['lore_1', 'name']);
    expect(activeTabId).toBe('lore_2');
  });

  it('refreshes existing indexed tabs without changing unrelated tabs', () => {
    const { tabs, dirtyIds, activeTabId } = remapIndexedTabs({
      tabs: [
        { id: 'regex_0', label: 'old', language: '_regexform' },
        { id: 'description', label: 'description' }
      ],
      dirtyIds: new Set(['regex_0']),
      activeTabId: 'regex_0',
      prefix: 'regex_',
      resolveIndex: (index) => index,
      buildTabState: (index, tab) => ({
        id: `regex_${index}`,
        label: `regex-${index}`,
        language: tab.language
      })
    });

    expect(tabs).toEqual([
      { id: 'regex_0', label: 'regex-0', language: '_regexform' },
      { id: 'description', label: 'description' }
    ]);
    expect([...dirtyIds]).toEqual(['regex_0']);
    expect(activeTabId).toBe('regex_0');
  });
});
