import { mount } from '@vue/test-utils';
import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import App from './App.vue';

describe('App shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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

  it('renders the dark-mode title variant from store', () => {
    const pinia = createPinia();
    const wrapper = mount(App, { global: { plugins: [pinia] } });

    // Default darkMode is false → TokiTalk
    expect(wrapper.find('.momo-title').text()).toBe('TokiTalk');
  });
});
