import { createRemovalIndexResolver, remapIndexedTabs } from './indexed-tabs';
import type { IndexedTab } from './indexed-tabs';

export interface Tab {
  id: string;
  label: string;
  language: string;
  getValue: () => unknown;
  setValue: ((value: unknown) => void) | null;
  _lastValue: unknown;
  [key: string]: unknown;
}

export interface TabManagerCallbacks {
  /** Activate the given tab (switch editor, render form, etc.) */
  onActivateTab(tab: Tab): void;
  /** Dispose form editors before closing active tab */
  onDisposeFormEditors(): void;
  /** Show empty-state placeholder when last tab is closed */
  onClearEditor(): void;
  /** Check whether a panel is popped out */
  isPanelPoppedOut(panelId: string): boolean;
  /** Pop a tab out into a separate window */
  onPopOutTab(tabId: string): void;
  /** Return true if the language represents a form tab (non-Monaco) */
  isFormTabType(language: string): boolean;
}

export class TabManager {
  openTabs: Tab[] = [];
  activeTabId: string | null = null;
  dirtyFields = new Set<string>();
  pendingEditorTabId: string | null = null;

  private tabBarId: string;
  private callbacks: TabManagerCallbacks;
  private tabIndex = new Map<string, Tab>();

  constructor(tabBarId: string, callbacks: TabManagerCallbacks) {
    this.tabBarId = tabBarId;
    this.callbacks = callbacks;
  }

  findTab(id: string): Tab | undefined {
    return this.tabIndex.get(id);
  }

  openTab(
    id: string,
    label: string,
    language: string,
    getValue: () => unknown,
    setValue: ((value: unknown) => void) | null
  ): Tab {
    let tab = this.tabIndex.get(id);
    if (!tab) {
      tab = { id, label, language, getValue, setValue, _lastValue: null };
      this.openTabs.push(tab);
      this.tabIndex.set(id, tab);
    } else {
      tab.label = label;
      tab.language = language;
      tab.getValue = getValue;
      tab.setValue = setValue;
    }
    this.callbacks.onActivateTab(tab);
    return tab;
  }

  closeTab(id: string): void {
    const idx = this.openTabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    this.openTabs.splice(idx, 1);
    this.tabIndex.delete(id);
    this.dirtyFields.delete(id);
    if (this.pendingEditorTabId === id) this.pendingEditorTabId = null;

    if (this.activeTabId === id) {
      this.callbacks.onDisposeFormEditors();
      if (this.openTabs.length > 0) {
        const newTab = this.openTabs[Math.max(0, idx - 1)];
        this.callbacks.onActivateTab(newTab);
      } else {
        this.activeTabId = null;
        this.callbacks.onClearEditor();
        this.renderTabs();
      }
    } else {
      this.renderTabs();
    }
  }

  markFieldDirty(field: string): void {
    this.dirtyFields.add(field);
    this.renderTabs();
  }

  markDirtyForTabId(tabId: string): void {
    this.dirtyFields.add(tabId);
    if (tabId === 'lua' || tabId.startsWith('lua_s')) {
      this.dirtyFields.add('lua');
    } else if (tabId === 'css' || tabId.startsWith('css_s')) {
      this.dirtyFields.add('css');
    } else if (tabId.startsWith('lore_')) {
      this.dirtyFields.add('lorebook');
    } else if (tabId.startsWith('regex_')) {
      this.dirtyFields.add('regex');
    }
    this.renderTabs();
  }

  applyIndexedTabRemap(
    prefix: string,
    resolveIndex: (oldIndex: number) => number | null,
    buildTabState: (index: number, tab: Tab) => Partial<Tab> | null
  ): void {
    const result = remapIndexedTabs({
      tabs: this.openTabs as (Tab & IndexedTab)[],
      dirtyIds: this.dirtyFields,
      activeTabId: this.activeTabId,
      prefix,
      resolveIndex,
      buildTabState: buildTabState as (
        index: number,
        tab: Tab & IndexedTab
      ) => Partial<Tab & IndexedTab> | null
    });

    this.openTabs = result.tabs;
    this.dirtyFields = result.dirtyIds;
    this.activeTabId = result.activeTabId;
    this.rebuildIndex();

    const activeTab = this.activeTabId
      ? this.tabIndex.get(this.activeTabId)
      : null;
    if (
      activeTab &&
      activeTab.id.startsWith(prefix) &&
      this.callbacks.isFormTabType(activeTab.language)
    ) {
      this.callbacks.onActivateTab(activeTab);
      return;
    }

    this.renderTabs();
  }

  refreshIndexedTabs(
    prefix: string,
    buildTabState: (index: number, tab: Tab) => Partial<Tab> | null
  ): void {
    this.applyIndexedTabRemap(prefix, (index) => index, buildTabState);
  }

  shiftIndexedTabsAfterRemoval(
    prefix: string,
    removedIndices: number[],
    buildTabState: (index: number, tab: Tab) => Partial<Tab> | null
  ): void {
    this.applyIndexedTabRemap(
      prefix,
      createRemovalIndexResolver(removedIndices),
      buildTabState
    );
  }

  reset(): void {
    this.openTabs = [];
    this.tabIndex.clear();
    this.activeTabId = null;
    this.dirtyFields.clear();
    this.pendingEditorTabId = null;
  }

  private rebuildIndex(): void {
    this.tabIndex.clear();
    for (const tab of this.openTabs) this.tabIndex.set(tab.id, tab);
  }

  renderTabs(): void {
    const tabBar = document.getElementById(this.tabBarId);
    if (!tabBar) return;
    tabBar.innerHTML = '';

    for (let i = 0; i < this.openTabs.length; i++) {
      const tab = this.openTabs[i];
      const el = document.createElement('div');
      el.className =
        'editor-tab' + (tab.id === this.activeTabId ? ' active' : '');

      // Drag-and-drop reorder
      el.draggable = true;
      el.dataset.tabIdx = String(i);
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer!.setData('text/tab-index', String(i));
        el.classList.add('tab-dragging');
      });
      el.addEventListener('dragend', () =>
        el.classList.remove('tab-dragging')
      );
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('tab-drag-over');
      });
      el.addEventListener('dragleave', () =>
        el.classList.remove('tab-drag-over')
      );
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('tab-drag-over');
        const fromIdx = parseInt(
          e.dataTransfer!.getData('text/tab-index'),
          10
        );
        const toIdx = i;
        if (fromIdx !== toIdx && !isNaN(fromIdx)) {
          const [moved] = this.openTabs.splice(fromIdx, 1);
          this.openTabs.splice(toIdx, 0, moved);
          this.renderTabs();
        }
      });

      const labelSpan = document.createElement('span');
      labelSpan.textContent = tab.label;
      el.appendChild(labelSpan);

      if (this.dirtyFields.has(tab.id)) {
        const dot = document.createElement('span');
        dot.className = 'modified';
        dot.textContent = '●';
        el.appendChild(dot);
      }

      const closeBtn = document.createElement('span');
      closeBtn.className = 'close-btn';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });
      el.appendChild(closeBtn);

      // Per-tab popout button (text tabs including readonly, not images)
      if (
        tab.language !== '_image' &&
        !this.callbacks.isPanelPoppedOut('editor')
      ) {
        const popBtn = document.createElement('span');
        popBtn.className = 'tab-popout-btn';
        popBtn.title = '팝아웃 (분리)';
        popBtn.textContent = '↗';
        popBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.callbacks.onPopOutTab(tab.id);
        });
        el.appendChild(popBtn);
      }

      el.addEventListener('click', () =>
        this.callbacks.onActivateTab(tab)
      );
      tabBar.appendChild(el);
    }
  }
}
