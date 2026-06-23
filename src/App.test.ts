import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import App from './App.vue';
import MenuBar from './components/MenuBar.vue';
import { useAppStore } from './stores/app-store';

describe('App shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
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

    expect(wrapper.text()).toContain('사이드바 토글');
    expect(wrapper.text()).toContain('로어북 관리자');
    expect(wrapper.text()).toContain('에셋 관리자');
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

    expect(wrapper.get('#btn-sidebar-collapse').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-refs-extpopout').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-refs-separate').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-refs-collapse').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-refs-close').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-refs-panel-popout').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-refs-panel-dock').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-avatar-collapse').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-chat-mode').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-terminal-bg').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-terminal-toggle').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#sidebar-expand').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#sidebar-expand').element.tagName).toBe('BUTTON');
  });

  it('renders the help affordance as a real button with an accessible label', () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } });
    const helpBtn = wrapper.get('#toki-help-btn');

    expect(helpBtn.element.tagName).toBe('BUTTON');
    expect(helpBtn.attributes('aria-label')).toBe('도움말 열기');
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
