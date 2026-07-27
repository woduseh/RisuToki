import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import App from './App.vue';
import MenuBar from './components/MenuBar.vue';
import { registerActions } from './lib/action-registry';
import { useAppStore } from './stores/app-store';

describe('App shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the terminal launch menu entries', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } });

    // Menu items are rendered inside MenuBar — click to open the terminal menu
    const menuItems = wrapper.findAll('.menu-item');
    const terminalMenu = menuItems.find((m) => m.text().includes('터미널'));
    expect(terminalMenu).toBeTruthy();
    await terminalMenu!.trigger('click');

    expect(wrapper.text()).toContain('Claude Code 시작');
    expect(wrapper.text()).toContain('GitHub Copilot CLI 시작');
    expect(wrapper.text()).toContain('Codex 시작');
  });

  it('opens, navigates, and closes the menu bar from the keyboard with ARIA semantics', async () => {
    const wrapper = mount(MenuBar, { attachTo: document.body });

    try {
      const menubar = wrapper.get('#menubar');
      const fileButton = wrapper.get('[data-menu-button="file"]');

      expect(menubar.attributes('role')).toBe('menubar');
      expect(fileButton.element.tagName).toBe('BUTTON');
      expect(fileButton.attributes('role')).toBe('menuitem');
      expect(fileButton.attributes('aria-haspopup')).toBe('menu');

      await fileButton.trigger('keydown', { key: 'Enter' });
      await nextTick();

      expect(fileButton.attributes('aria-expanded')).toBe('true');
      expect(wrapper.get('#menu-dropdown-file').attributes('role')).toBe('menu');

      const entries = wrapper.get('#menu-dropdown-file').findAll('[data-menu-entry]');
      expect(entries.length).toBeGreaterThan(1);
      expect(document.activeElement).toBe(entries[0].element);

      await entries[0].trigger('keydown', { key: 'ArrowDown' });
      expect(document.activeElement).toBe(entries[1].element);

      await entries[1].trigger('keydown', { key: 'Escape' });
      await nextTick();

      expect(fileButton.attributes('aria-expanded')).toBe('false');
      expect(wrapper.find('#menu-dropdown-file').exists()).toBe(false);
      expect(document.activeElement).toBe(fileButton.element);
    } finally {
      wrapper.unmount();
    }
  });

  it('keeps a hover-switched menu open when the click completes the switch', async () => {
    const wrapper = mount(MenuBar, { attachTo: document.body });

    try {
      const fileButton = wrapper.get('[data-menu-button="file"]');
      const editButton = wrapper.get('[data-menu-button="edit"]');
      // Menu order is file, edit, view, terminal — the Edit container is index 1.
      const editItem = wrapper.findAll('.menu-item')[1];

      // Open the File menu with a deliberate click.
      await fileButton.trigger('click');
      await nextTick();
      expect(fileButton.attributes('aria-expanded')).toBe('true');

      // Moving the pointer onto Edit hover-switches openMenu; the click that
      // lands on Edit then completes the switch. Previously this immediately
      // toggled Edit shut, so switching menus required a second click.
      await editItem.trigger('mouseenter');
      await editButton.trigger('click');
      await nextTick();

      expect(editButton.attributes('aria-expanded')).toBe('true');
      expect(fileButton.attributes('aria-expanded')).toBe('false');

      // Clicking the already-open Edit menu still closes it (toggle preserved).
      await editButton.trigger('click');
      await nextTick();
      expect(editButton.attributes('aria-expanded')).toBe('false');
    } finally {
      wrapper.unmount();
    }
  });

  it('renders the dark-mode title variant from store', () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });

    // Default darkMode is false → TokiTalk
    expect(wrapper.find('.momo-title').text()).toBe('TokiTalk');
  });

  it('replaces the welcome screen with an opened reference editor even when no document is loaded', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();

    expect(store.hasFile).toBe(false);
    expect(wrapper.find('#welcome-screen').exists()).toBe(true);
    expect(wrapper.get('#editor-surface').attributes('style')).toContain('display: none');

    store.setActiveTabId('guide_modules/MODULE_FIELDS.md');
    store.setActiveTabLanguage('markdown');
    await nextTick();

    expect(wrapper.find('#welcome-screen').exists()).toBe(false);
    expect(wrapper.get('#editor-surface').attributes('style') || '').not.toContain('display: none');

    store.setActiveTabId(null);
    await nextTick();
    expect(wrapper.find('#welcome-screen').exists()).toBe(true);
  });

  it('disables the preview action when the active file is non-charx', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();

    store.setFileData({ _fileType: 'risup', name: 'Preset' } as never);
    await nextTick();

    const menuItems = wrapper.findAll('.menu-item');
    const viewMenu = menuItems.find((m) => m.text().includes('보기'));
    expect(viewMenu).toBeTruthy();
    await viewMenu!.trigger('click');

    const actions = wrapper.findAll('.menu-action');
    const previewAction = actions.find((a) => a.text().includes('프리뷰'));
    expect(previewAction).toBeTruthy();
    expect(previewAction!.classes()).toContain('disabled');
  });

  it('enables the preview action when the active file is charx', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();

    store.setFileData({ _fileType: 'charx', name: 'Character' } as never);
    await nextTick();

    const menuItems = wrapper.findAll('.menu-item');
    const viewMenu = menuItems.find((m) => m.text().includes('보기'));
    expect(viewMenu).toBeTruthy();
    await viewMenu!.trigger('click');

    const actions = wrapper.findAll('.menu-action');
    const previewAction = actions.find((a) => a.text().includes('프리뷰'));
    expect(previewAction).toBeTruthy();
    expect(previewAction!.classes()).not.toContain('disabled');
  });

  it('uses clearer wording for the sidebar and preview actions in the view menu', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } });
    const menuItems = wrapper.findAll('.menu-item');
    const viewMenu = menuItems.find((m) => m.text().includes('보기'));
    expect(viewMenu).toBeTruthy();

    await viewMenu!.trigger('click');

    expect(wrapper.text()).toContain('탐색기 전환');
    expect(wrapper.text()).toContain('터미널 표시 전환');
    expect(wrapper.text()).toContain('터미널 아바타 표시 전환');
    expect(wrapper.text()).toContain('프리뷰');
    expect(wrapper.text()).not.toContain('프리뷰 테스트');
  });

  it('uses type-neutral export wording for project-folder output', async () => {
    const wrapper = mount(MenuBar, { attachTo: document.body });

    try {
      await wrapper.get('[data-menu-button="file"]').trigger('click');
      await nextTick();

      expect(wrapper.text()).toContain('파일로 내보내기');
      expect(wrapper.text()).toContain('프로젝트 폴더 복제');
      expect(wrapper.text()).not.toContain('CharX로 내보내기');
      expect(wrapper.text()).not.toContain('CharX로 재조립');
    } finally {
      wrapper.unmount();
    }
  });

  it('renders recent items and emits the selected item payload', async () => {
    const recentItem = {
      kind: 'file' as const,
      path: 'C:\\cards\\avatar.png',
      sourceFormat: 'png' as const,
      openedAt: 10,
    };
    const wrapper = mount(MenuBar, {
      attachTo: document.body,
      props: { recentItems: [recentItem] },
    });

    try {
      await wrapper.get('[data-menu-button="file"]').trigger('click');
      await nextTick();

      expect(wrapper.text()).toContain('최근 항목');
      expect(wrapper.text()).toContain('[PNG] avatar.png');

      const recentButton = wrapper.findAll('.menu-action').find((button) => button.text().includes('avatar.png'));
      expect(recentButton).toBeTruthy();
      await recentButton!.trigger('click');

      expect(wrapper.emitted('action')?.at(-1)).toEqual(['open-recent-item', recentItem]);
    } finally {
      wrapper.unmount();
    }
  });

  it('renders an empty recent items state', async () => {
    const wrapper = mount(MenuBar, {
      attachTo: document.body,
      props: { recentItems: [] },
    });

    try {
      await wrapper.get('[data-menu-button="file"]').trigger('click');
      await nextTick();

      expect(wrapper.text()).toContain('최근 항목 없음');
      const emptyButton = wrapper.findAll('.menu-action').find((button) => button.text().includes('최근 항목 없음'));
      expect(emptyButton?.attributes('disabled')).toBeDefined();
    } finally {
      wrapper.unmount();
    }
  });

  it('adds aria labels to icon-only shell controls', () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } });

    expect(wrapper.get('#navigator-resizer').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#inspector-resizer').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#utility-resizer').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-workspace-terminal-toggle').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-right-sidebar-toggle').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-avatar-collapse').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-chat-mode').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-terminal-bg').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-bgm-toggle').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-rp-mode').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-avatar-toggle').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-terminal-popout').attributes('aria-label')).toBeTruthy();
  });

  it('mounts semantic panels directly in their fixed workspace homes', () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } });

    expect(wrapper.find('#legacy-layout-parking').exists()).toBe(false);
    expect(wrapper.find('#panel-parking').exists()).toBe(false);
    expect([...wrapper.get('#slot-left').element.children]).toEqual(
      expect.arrayContaining([
        wrapper.get('#sidebar').element,
        wrapper.get('#lore-manager-panel').element,
        wrapper.get('#asset-manager-panel').element,
        wrapper.get('#prompt-manager-panel').element,
      ]),
    );
    expect(wrapper.get('#bottom-area').element.parentElement).toBe(wrapper.get('#slot-bottom').element);
  });

  it('toggles the terminal shelf from the workspace bar', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();

    expect(wrapper.find('.utility-tabs').exists()).toBe(false);
    expect(wrapper.find('#terminal-header').exists()).toBe(true);

    if (store.activeUtility !== 'terminal') store.toggleUtility('terminal');
    await nextTick();
    const toggle = wrapper.get('#btn-workspace-terminal-toggle');
    expect(toggle.attributes('aria-label')).toBe('터미널 닫기');
    await toggle.trigger('click');
    await nextTick();

    expect(store.activeUtility).toBeNull();
    expect(toggle.attributes('aria-label')).toBe('터미널 열기');
    expect(wrapper.find('#terminal-shelf-launcher').exists()).toBe(false);
    expect(wrapper.find('#btn-terminal-toggle').exists()).toBe(false);

    await toggle.trigger('click');
    await nextTick();
    expect(store.activeUtility).toBe('terminal');
  });

  it('keeps the terminal anchored to the bottom for a reference-only editor while upward dragging increases its height', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();

    store.setActiveTabId('guide_modules/MODULE_FIELDS.md');
    store.setActiveTabLanguage('markdown');
    if (store.activeUtility !== 'terminal') store.toggleUtility('terminal');
    store.setUtilityHeight(250);
    await nextTick();

    expect(store.hasFile).toBe(false);
    expect(wrapper.find('#welcome-screen').exists()).toBe(false);
    expect(wrapper.get('#app-body').classes()).toContain('utility-open');
    const resizer = wrapper.get('#utility-resizer');
    expect(resizer.attributes('aria-valuenow')).toBe('250');

    resizer.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 600 }));
    expect(document.body.classList.contains('utility-resizing')).toBe(true);
    document.dispatchEvent(new MouseEvent('pointermove', { clientY: 540 }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await nextTick();

    expect(store.utilityHeight).toBe(310);
    expect(resizer.attributes('aria-valuenow')).toBe('310');

    document.dispatchEvent(new MouseEvent('pointerup'));
    expect(document.body.classList.contains('utility-resizing')).toBe(false);
  });

  it('coalesces rapid pane drag events into one animation-frame layout update', async () => {
    let frameCallback: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();
    store.setNavigatorWidth(280);

    const resizer = wrapper.get('#navigator-resizer');
    resizer.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 280 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 300 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 340 }));

    expect(store.navigatorWidth).toBe(280);
    expect(document.body.classList.contains('workspace-resizing')).toBe(true);
    (frameCallback as FrameRequestCallback | null)?.(0);
    await nextTick();
    expect(store.navigatorWidth).toBe(340);

    document.dispatchEvent(new MouseEvent('pointerup'));
    expect(document.body.classList.contains('workspace-resizing')).toBe(false);
  });

  it('resets saved panel visibility and dimensions from the View menu', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();
    store.setNavigatorWidth(440);
    store.setInspectorWidth(480);
    store.setUtilityHeight(500);
    store.navigatorVisible = false;
    store.inspectorVisible = false;
    store.avatarVisible = false;
    store.referencesVisible = true;
    store.activeUtility = null;

    const viewMenu = wrapper.findAll('.menu-item').find((item) => item.text().includes('보기'))!;
    await viewMenu.get('.menu-label').trigger('click');
    const reset = wrapper
      .findAll<HTMLButtonElement>('.menu-action')
      .find((button) => button.text().includes('UI 배치 초기화'))!;
    await reset.trigger('click');
    await nextTick();

    expect(store.navigatorWidth).toBe(280);
    expect(store.inspectorWidth).toBe(320);
    expect(store.utilityHeight).toBe(250);
    expect(store.navigatorVisible).toBe(true);
    expect(store.inspectorVisible).toBe(true);
    expect(store.avatarVisible).toBe(true);
    expect(store.referencesVisible).toBe(false);
    expect(store.activeUtility).toBe('terminal');
    expect(store.statusText).toContain('UI 배치');
  });

  it('uses icon-only background and reactive BGM/RP quick controls', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();
    const toggleBgm = vi.fn();
    const cycleRpMode = vi.fn();
    registerActions({ 'toggle-bgm': toggleBgm, 'cycle-rp-mode': cycleRpMode });

    expect(wrapper.get('#btn-terminal-bg').text()).toBe('');
    expect(wrapper.get('#btn-terminal-bg').find('svg').exists()).toBe(true);
    expect(wrapper.get('#btn-bgm-toggle').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('#btn-rp-mode').text()).toContain('RP OFF');

    await wrapper.get('#btn-bgm-toggle').trigger('click');
    await wrapper.get('#btn-rp-mode').trigger('click');
    expect(toggleBgm).toHaveBeenCalledOnce();
    expect(cycleRpMode).toHaveBeenCalledOnce();

    store.bgmEnabled = true;
    store.setRpMode('toki');
    await nextTick();
    expect(wrapper.get('#btn-bgm-toggle').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('#btn-bgm-toggle').classes()).toContain('active');
    expect(wrapper.get('#btn-rp-mode').text()).toContain('RP 토키');
  });

  it('renders the help affordance as a real button and opens the usage guide', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } });
    const helpBtn = wrapper.get('#toki-help-btn');

    expect(helpBtn.element.tagName).toBe('BUTTON');
    expect(helpBtn.attributes('aria-label')).toBe('사용 설명서 열기');
    expect(helpBtn.find('svg').exists()).toBe(true);

    await helpBtn.trigger('click');
    expect(document.querySelector('[data-overlay="help"]')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[data-overlay="help"] .help-popup-header button')?.click();
  });

  it('keeps the avatar inside the terminal utility instead of rendering an avatar tab', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();

    expect(wrapper.findAll('.utility-tabs > button').some((button) => button.text().trim() === '아바타')).toBe(false);

    if (store.activeUtility !== 'terminal') store.toggleAvatar();
    await nextTick();
    expect(wrapper.get('#app-body').classes()).toContain('avatar-visible');
    expect(wrapper.get('#btn-avatar-toggle').attributes('aria-pressed')).toBe('true');

    await wrapper.get('#btn-avatar-toggle').trigger('click');
    await nextTick();
    expect(store.activeUtility).toBe('terminal');
    expect(wrapper.get('#app-body').classes()).not.toContain('avatar-visible');
    expect(wrapper.get('#btn-avatar-toggle').attributes('aria-pressed')).toBe('false');
  });

  it('opens references in the unified right sidebar and switches back to contextual properties', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();
    const refreshReferences = vi.fn();
    registerActions({ 'refresh-references': refreshReferences });

    expect(store.hasFile).toBe(false);
    const referencesButton = wrapper.get('#btn-references-toggle');

    await referencesButton.trigger('click');
    await nextTick();

    expect(store.referencesVisible).toBe(true);
    expect(store.inspectorVisible).toBe(false);
    expect(store.activeUtility).toBe('terminal');
    expect(wrapper.get('#right-sidebar').isVisible()).toBe(true);
    expect(wrapper.get('#right-sidebar-references-tab').classes()).toContain('active');
    expect(refreshReferences).toHaveBeenCalledOnce();

    store.setFileData({ lorebook: [{ comment: 'Entry' }] } as never);
    store.setActiveTabId('lore_0');
    await nextTick();

    expect(store.referencesVisible).toBe(false);
    expect(store.inspectorVisible).toBe(true);
    expect(wrapper.get('#right-sidebar-inspector-tab').text()).toBe('로어북 속성');
    expect(wrapper.get('#right-sidebar-inspector-tab').classes()).toContain('active');
  });

  it('resizes the unified right sidebar from its left edge', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore();
    store.setFileData({ lorebook: [{ comment: 'Entry' }] } as never);
    store.setActiveTabId('lore_0');
    store.setInspectorWidth(320);
    await nextTick();

    const resizer = wrapper.get('#inspector-resizer');
    resizer.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 900 }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 850 }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await nextTick();

    expect(store.inspectorWidth).toBe(370);
    document.dispatchEvent(new MouseEvent('pointerup'));
  });

  it('keeps sticky error statuses visible with accessible live-region semantics', async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore() as ReturnType<typeof useAppStore> & {
      clearStatus(): void;
      setStatus(text: string, options?: { kind?: 'info' | 'error'; sticky?: boolean }): void;
    };

    store.setStatus('저장 실패', { kind: 'error', sticky: true });
    await nextTick();

    const bar = wrapper.get('#statusbar');
    expect(bar.attributes('role')).toBe('status');
    expect(bar.attributes('aria-live')).toBe('polite');
    expect(bar.classes()).toContain('visible');
    expect(bar.classes()).toContain('status-error');
    expect(bar.classes()).toContain('sticky');
    expect(wrapper.get('#status-dismiss').attributes('aria-label')).toBe('상태 메시지 닫기');

    vi.advanceTimersByTime(5000);
    await nextTick();
    expect(bar.classes()).toContain('visible');

    await wrapper.get('#status-dismiss').trigger('click');
    await nextTick();

    expect(store.statusText).toBe('');
    expect(bar.classes()).not.toContain('visible');
  });

  it('keeps persistent document stats visible beside transient status messages', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore() as ReturnType<typeof useAppStore> & {
      clearStatus(): void;
      setDocumentStatsText(text: string): void;
      setStatus(text: string, options?: { kind?: 'info' | 'error'; sticky?: boolean }): void;
    };

    store.setDocumentStatsText('CHARX · 저장됨 · 로어북 2 · 정규식 1 · 에셋 3 · 탭 10자');
    await nextTick();

    const bar = wrapper.get('#statusbar');
    expect(bar.classes()).toContain('visible');
    expect(wrapper.get('#status-stats').text()).toContain('로어북 2');

    store.setStatus('저장 완료');
    await nextTick();
    expect(wrapper.get('#status-text').text()).toBe('저장 완료');
    expect(wrapper.get('#status-stats').text()).toContain('에셋 3');

    await wrapper.get('#status-dismiss').trigger('click');
    await nextTick();
    expect(store.statusText).toBe('');
    expect(bar.classes()).toContain('visible');
    expect(wrapper.get('#status-stats').text()).toContain('CHARX');
  });

  it('renders an additive restored-session badge in the file label', async () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });
    const store = useAppStore() as ReturnType<typeof useAppStore> & {
      setRestoredSessionLabel?: (label: string) => void;
    };

    store.setFileLabel('Character');
    expect(typeof store.setRestoredSessionLabel).toBe('function');
    store.setRestoredSessionLabel!('자동복원');
    await nextTick();

    expect(wrapper.get('#file-label').text()).toBe('Character [자동복원]');
  });
});
