import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TabManager } from './tab-manager';
import type { TabManagerCallbacks, Tab } from './tab-manager';

function makeCallbacks(overrides: Partial<TabManagerCallbacks> = {}): TabManagerCallbacks {
  return {
    onActivateTab: vi.fn(),
    onDisposeFormEditors: vi.fn(),
    onClearEditor: vi.fn(),
    isPanelPoppedOut: vi.fn(() => false),
    onPopOutTab: vi.fn(),
    isFormTabType: vi.fn(() => false),
    ...overrides
  };
}

function makeTab(id: string, label?: string): Tab {
  return {
    id,
    label: label ?? id,
    language: 'plaintext',
    getValue: () => '',
    setValue: vi.fn(),
    _lastValue: null
  };
}

describe('TabManager', () => {
  let tabBar: HTMLDivElement;
  let cbs: ReturnType<typeof makeCallbacks>;
  let mgr: TabManager;

  beforeEach(() => {
    tabBar = document.createElement('div');
    tabBar.id = 'editor-tabs';
    document.body.appendChild(tabBar);
    cbs = makeCallbacks();
    mgr = new TabManager('editor-tabs', cbs);
  });

  describe('openTab', () => {
    it('creates a new tab and calls onActivateTab', () => {
      const getValue = () => 'hello';
      const setValue = vi.fn();
      const tab = mgr.openTab('t1', 'Tab 1', 'lua', getValue, setValue);

      expect(tab.id).toBe('t1');
      expect(tab.label).toBe('Tab 1');
      expect(mgr.openTabs).toHaveLength(1);
      expect(cbs.onActivateTab).toHaveBeenCalledWith(tab);
    });

    it('updates an existing tab instead of duplicating', () => {
      mgr.openTab('t1', 'Old', 'lua', () => '', null);
      const newGetValue = () => 'new';
      const tab = mgr.openTab('t1', 'New', 'css', newGetValue, null);

      expect(mgr.openTabs).toHaveLength(1);
      expect(tab.label).toBe('New');
      expect(tab.language).toBe('css');
      expect(tab.getValue).toBe(newGetValue);
    });
  });

  describe('closeTab', () => {
    it('removes a non-active tab and renders', () => {
      mgr.openTabs = [makeTab('a'), makeTab('b')];
      mgr.activeTabId = 'a';
      mgr.dirtyFields.add('b');
      mgr.closeTab('b');

      expect(mgr.openTabs).toHaveLength(1);
      expect(mgr.dirtyFields.has('b')).toBe(false);
    });

    it('activates previous tab when closing active tab', () => {
      const tabA = makeTab('a');
      const tabB = makeTab('b');
      mgr.openTabs = [tabA, tabB];
      mgr.activeTabId = 'b';

      mgr.closeTab('b');

      expect(cbs.onDisposeFormEditors).toHaveBeenCalled();
      expect(cbs.onActivateTab).toHaveBeenCalledWith(tabA);
    });

    it('calls onClearEditor when last tab is closed', () => {
      mgr.openTabs = [makeTab('a')];
      mgr.activeTabId = 'a';

      mgr.closeTab('a');

      expect(mgr.activeTabId).toBeNull();
      expect(cbs.onClearEditor).toHaveBeenCalled();
    });

    it('clears pendingEditorTabId if it matches', () => {
      mgr.openTabs = [makeTab('a'), makeTab('b')];
      mgr.activeTabId = 'a';
      mgr.pendingEditorTabId = 'b';

      mgr.closeTab('b');
      expect(mgr.pendingEditorTabId).toBeNull();
    });

    it('is a no-op for non-existent tabs', () => {
      mgr.openTabs = [makeTab('a')];
      mgr.closeTab('zzz');
      expect(mgr.openTabs).toHaveLength(1);
    });
  });

  describe('markDirtyForTabId', () => {
    it('propagates lua section dirty to lua collection', () => {
      mgr.markDirtyForTabId('lua_s2');
      expect(mgr.dirtyFields.has('lua_s2')).toBe(true);
      expect(mgr.dirtyFields.has('lua')).toBe(true);
    });

    it('propagates css section dirty to css collection', () => {
      mgr.markDirtyForTabId('css_s0');
      expect(mgr.dirtyFields.has('css')).toBe(true);
    });

    it('propagates lorebook dirty', () => {
      mgr.markDirtyForTabId('lore_5');
      expect(mgr.dirtyFields.has('lorebook')).toBe(true);
    });

    it('propagates regex dirty', () => {
      mgr.markDirtyForTabId('regex_3');
      expect(mgr.dirtyFields.has('regex')).toBe(true);
    });

    it('does not propagate for plain fields', () => {
      mgr.markDirtyForTabId('description');
      expect(mgr.dirtyFields.has('description')).toBe(true);
      expect(mgr.dirtyFields.size).toBe(1);
    });
  });

  describe('markFieldDirty', () => {
    it('adds field to dirtyFields', () => {
      mgr.markFieldDirty('name');
      expect(mgr.dirtyFields.has('name')).toBe(true);
    });
  });

  describe('renderTabs', () => {
    it('renders tab elements with correct classes', () => {
      mgr.openTabs = [makeTab('a', 'Alpha'), makeTab('b', 'Beta')];
      mgr.activeTabId = 'b';
      mgr.dirtyFields.add('a');

      mgr.renderTabs();

      const tabs = tabBar.querySelectorAll('.editor-tab');
      expect(tabs).toHaveLength(2);
      expect(tabs[0].classList.contains('active')).toBe(false);
      expect(tabs[1].classList.contains('active')).toBe(true);
      // Dirty indicator on first tab
      expect(tabs[0].querySelector('.modified')?.textContent).toBe('●');
      expect(tabs[1].querySelector('.modified')).toBeNull();
    });

    it('includes popout button for non-image tabs when not popped out', () => {
      mgr.openTabs = [makeTab('a')];
      mgr.activeTabId = 'a';
      mgr.renderTabs();

      expect(tabBar.querySelector('.tab-popout-btn')).not.toBeNull();
    });

    it('hides popout button when panel is already popped out', () => {
      cbs.isPanelPoppedOut = vi.fn(() => true);
      mgr.openTabs = [makeTab('a')];
      mgr.activeTabId = 'a';
      mgr.renderTabs();

      expect(tabBar.querySelector('.tab-popout-btn')).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      mgr.openTabs = [makeTab('a')];
      mgr.activeTabId = 'a';
      mgr.dirtyFields.add('a');
      mgr.pendingEditorTabId = 'a';

      mgr.reset();

      expect(mgr.openTabs).toHaveLength(0);
      expect(mgr.activeTabId).toBeNull();
      expect(mgr.dirtyFields.size).toBe(0);
      expect(mgr.pendingEditorTabId).toBeNull();
    });
  });

  describe('applyIndexedTabRemap', () => {
    it('shifts tabs after removal', () => {
      mgr.openTabs = [
        makeTab('lore_0', 'zero'),
        makeTab('lore_1', 'one'),
        makeTab('lore_2', 'two'),
        makeTab('name', 'name')
      ];
      mgr.activeTabId = 'lore_2';
      mgr.dirtyFields.add('lore_0');

      mgr.shiftIndexedTabsAfterRemoval('lore_', [1], (index) => ({
        id: `lore_${index}`,
        label: `entry-${index}`
      }));

      expect(mgr.openTabs.map(t => t.id)).toEqual([
        'lore_0',
        'lore_1',
        'name'
      ]);
      expect(mgr.activeTabId).toBe('lore_1');
      expect(mgr.dirtyFields.has('lore_0')).toBe(true);
    });

    it('re-activates form tab after remap', () => {
      const formTab = makeTab('lore_0', 'entry');
      formTab.language = '_loreform';
      mgr.openTabs = [formTab];
      mgr.activeTabId = 'lore_0';
      cbs.isFormTabType = vi.fn((lang: string) => lang === '_loreform');

      mgr.refreshIndexedTabs('lore_', (index, tab) => ({
        id: `lore_${index}`,
        label: `refreshed-${index}`,
        language: tab.language
      }));

      expect(cbs.onActivateTab).toHaveBeenCalled();
    });
  });

  describe('findTab', () => {
    it('returns tab by id', () => {
      const tab = makeTab('x');
      mgr.openTabs = [tab];
      expect(mgr.findTab('x')).toBe(tab);
    });

    it('returns undefined for missing id', () => {
      expect(mgr.findTab('nope')).toBeUndefined();
    });
  });
});
