import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TabManager } from './tab-manager';
import type { TabManagerCallbacks, Tab } from './tab-manager';

function makeCallbacks(overrides: Partial<TabManagerCallbacks> = {}): TabManagerCallbacks {
  return {
    onActivateTab: vi.fn(),
    onDisposeFormEditors: vi.fn(),
    onClearEditor: vi.fn(),
    isFormTabType: vi.fn(() => false),
    ...overrides,
  };
}

function makeTab(id: string, label?: string): Tab {
  return {
    id,
    label: label ?? id,
    language: 'plaintext',
    getValue: () => '',
    setValue: vi.fn(),
    _lastValue: null,
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

  describe('requestCloseTab', () => {
    it('closes a clean tab without confirmation', async () => {
      mgr.openTabs = [makeTab('a')];
      mgr.activeTabId = 'a';

      await mgr.requestCloseTab('a');

      expect(mgr.openTabs).toHaveLength(0);
    });

    it('asks for confirmation before closing a dirty tab', async () => {
      const onConfirmCloseTab = vi.fn(async () => true);
      mgr = new TabManager('editor-tabs', makeCallbacks(), onConfirmCloseTab);
      mgr.openTabs = [makeTab('a')];
      mgr.activeTabId = 'a';
      mgr.dirtyFields.add('a');

      await mgr.requestCloseTab('a');

      expect(onConfirmCloseTab).toHaveBeenCalledWith('a');
      expect(mgr.openTabs).toHaveLength(0);
    });

    it('keeps a dirty tab open when confirmation rejects the close', async () => {
      const onConfirmCloseTab = vi.fn(async () => false);
      mgr = new TabManager('editor-tabs', makeCallbacks(), onConfirmCloseTab);
      mgr.openTabs = [makeTab('a')];
      mgr.activeTabId = 'a';
      mgr.dirtyFields.add('a');

      await mgr.requestCloseTab('a');

      expect(onConfirmCloseTab).toHaveBeenCalledWith('a');
      expect(mgr.openTabs).toHaveLength(1);
      expect(mgr.openTabs[0].id).toBe('a');
    });

    it('keeps document dirty tracking when a dirty tab is closed without saving', async () => {
      const onConfirmCloseTab = vi.fn(async () => true);
      mgr = new TabManager('editor-tabs', makeCallbacks(), onConfirmCloseTab);
      mgr.openTabs = [makeTab('description')];
      mgr.activeTabId = 'description';
      mgr.dirtyFields.add('description');

      await mgr.requestCloseTab('description');

      expect(onConfirmCloseTab).toHaveBeenCalledWith('description');
      expect(mgr.openTabs).toHaveLength(0);
      expect(mgr.dirtyFields.has('description')).toBe(true);
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

    it('does not render the removed editor popout action', () => {
      mgr.openTabs = [makeTab('a')];
      mgr.activeTabId = 'a';
      mgr.renderTabs();

      expect(tabBar.querySelector('.tab-popout-btn')).toBeNull();
    });
  });

  it('labels types and read-only tabs without hiding dirty state', () => {
    mgr.openTabs = [
      { ...makeTab('lua'), language: 'lua' },
      { ...makeTab('image'), language: '_image', setValue: null },
      { ...makeTab('lore_0'), language: '_loreform' },
      { ...makeTab('ref_0_lb_0'), language: '_loreform', setValue: null },
      { ...makeTab('risup_prompt_item_0'), language: '_risupPromptItemForm' },
    ];
    mgr.dirtyFields.add('lua');
    mgr.renderTabs();
    const tabs = tabBar.querySelectorAll('.editor-tab');
    expect(tabs[0].textContent).toContain('Lua');
    expect(tabs[0].querySelector('.modified')).not.toBeNull();
    expect(tabs[0].querySelector('.tab-activate')?.getAttribute('aria-label')).toContain('저장되지 않음');
    expect(tabs[1].textContent).toContain('이미지 · 읽기 전용');
    expect(tabs[2].textContent).toContain('로어북');
    expect(tabs[3].textContent).toContain('로어북 · 읽기 전용');
    expect(tabs[4].textContent).toContain('프롬프트');
    expect(tabs[4].textContent).not.toContain('읽기 전용');
  });

  it('lists every open item and can return to the active item repeatedly', () => {
    const select = document.createElement('select');
    select.id = 'editor-open-items';
    document.body.appendChild(select);
    mgr.openTabs = Array.from({ length: 20 }, (_, i) => makeTab(`tab-${i}`, `항목 ${i}`));
    mgr.activeTabId = 'tab-19';
    mgr.dirtyFields.add('tab-19');
    mgr.renderTabs();
    expect(select.options).toHaveLength(21);
    expect(select.options[20].text).toContain('✓ 항목 19');
    expect(select.options[20].text).toContain('저장되지 않음');
    for (let i = 0; i < 2; i++) {
      select.value = 'tab-19';
      select.dispatchEvent(new Event('change'));
      expect(select.value).toBe('');
    }
    expect(cbs.onActivateTab).toHaveBeenCalledTimes(2);
    expect(cbs.onActivateTab).toHaveBeenCalledWith(mgr.openTabs[19]);
    mgr.reset();
    expect(select.disabled).toBe(true);
    expect(select.options).toHaveLength(1);
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
        makeTab('name', 'name'),
      ];
      mgr.activeTabId = 'lore_2';
      mgr.dirtyFields.add('lore_0');

      mgr.shiftIndexedTabsAfterRemoval('lore_', [1], (index) => ({
        id: `lore_${index}`,
        label: `entry-${index}`,
      }));

      expect(mgr.openTabs.map((t) => t.id)).toEqual(['lore_0', 'lore_1', 'name']);
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
        language: tab.language,
      }));

      expect(cbs.onActivateTab).toHaveBeenCalled();
    });
  });

  describe('refreshTabs', () => {
    it.each(['alpha-uuid', '7-part-uuid'])(
      'refreshes string ID %s and the active form without touching other tab families',
      (itemId) => {
        const group = mgr.openTab('risup_basic', 'Basic', '_risupform', () => 'group', null);
        const prompt = mgr.openTab(
          `risup_prompt_item_${itemId}`,
          'Old label',
          '_risupPromptItemForm',
          () => 'old',
          null,
        );
        mgr.activeTabId = prompt.id;
        mgr.dirtyFields.add(prompt.id);
        mgr.dirtyFields.add('promptTemplate');
        cbs.isFormTabType = (language) => language === '_risupPromptItemForm';
        vi.mocked(cbs.onActivateTab).mockClear();

        mgr.refreshTabs(
          (tab) => tab.id.startsWith('risup_prompt_item_'),
          () => ({
            label: 'Renamed prompt',
            getValue: () => 'updated prompt',
          }),
        );

        expect(mgr.findTab(prompt.id)).toBe(prompt);
        expect(prompt.label).toBe('Renamed prompt');
        expect(prompt.getValue()).toBe('updated prompt');
        expect(mgr.findTab(group.id)).toBe(group);
        expect(group.label).toBe('Basic');
        expect([...mgr.dirtyFields]).toEqual([prompt.id, 'promptTemplate']);
        expect(mgr.activeTabId).toBe(prompt.id);
        expect(cbs.onActivateTab).toHaveBeenCalledExactlyOnceWith(prompt);
      },
    );

    it('removes deleted prompt tabs and selects a surviving tab after clearing their editor state', () => {
      const group = mgr.openTab('risup_basic', 'Basic', '_risupform', () => 'group', null);
      const removed = mgr.openTab(
        'risup_prompt_item_deleted-uuid',
        'Deleted',
        '_risupPromptItemForm',
        () => 'deleted',
        vi.fn(),
      );
      mgr.activeTabId = removed.id;
      mgr.pendingEditorTabId = removed.id;
      mgr.dirtyFields.add(removed.id);
      mgr.dirtyFields.add('promptTemplate');
      cbs.onActivateTab = vi.fn(() => {
        // Activation must not save the removed editor's content into the fallback tab.
        expect(mgr.activeTabId).toBeNull();
      });

      mgr.refreshTabs(
        (tab) => tab.id.startsWith('risup_prompt_item_'),
        () => null,
      );

      expect(mgr.openTabs).toEqual([group]);
      expect(mgr.findTab(removed.id)).toBeUndefined();
      expect(mgr.dirtyFields.has(removed.id)).toBe(false);
      expect(mgr.dirtyFields.has('promptTemplate')).toBe(true);
      expect(mgr.pendingEditorTabId).toBeNull();
      expect(mgr.activeTabId).toBe(group.id);
      expect(removed.getValue()).toBeNull();
      expect(removed.setValue).toBeNull();
      expect(cbs.onDisposeFormEditors).toHaveBeenCalledOnce();
      expect(cbs.onActivateTab).toHaveBeenCalledExactlyOnceWith(group);
    });

    it('clears the editor when its last string ID tab no longer exists', () => {
      const prompt = mgr.openTab('risup_prompt_item_alpha', 'Prompt', '_risupPromptItemForm', () => '', null);
      mgr.activeTabId = prompt.id;

      mgr.refreshTabs(
        (tab) => tab.id === prompt.id,
        () => null,
      );

      expect(mgr.openTabs).toEqual([]);
      expect(mgr.activeTabId).toBeNull();
      expect(cbs.onDisposeFormEditors).toHaveBeenCalledOnce();
      expect(cbs.onClearEditor).toHaveBeenCalledOnce();
    });
  });

  describe('findTab', () => {
    it('returns tab by id', () => {
      mgr.openTab('x', 'x', 'plaintext', () => '', vi.fn());
      const tab = mgr.findTab('x');
      expect(tab).toBeDefined();
      expect(tab!.id).toBe('x');
    });

    it('returns undefined for missing id', () => {
      expect(mgr.findTab('nope')).toBeUndefined();
    });
  });
});
