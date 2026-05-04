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
    expect(wrapper.text()).toContain('프리뷰');
    expect(wrapper.text()).not.toContain('프리뷰 테스트');
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
    expect(wrapper.get('#btn-rp-mode').attributes('aria-label')).toBeTruthy();
    expect(wrapper.get('#btn-bgm').attributes('aria-label')).toBeTruthy();
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

    vi.advanceTimersByTime(5000);
    await nextTick();
    expect(bar.classes()).toContain('visible');
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
