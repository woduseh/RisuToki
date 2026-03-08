import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import App from './App.vue';

describe('App shell', () => {
  it('renders the terminal launch menu entries', () => {
    const wrapper = mount(App);

    expect(wrapper.find('[data-action="claude-start"]').text()).toContain('Claude Code 시작');
    expect(wrapper.find('[data-action="copilot-start"]').text()).toContain('GitHub Copilot CLI 시작');
    expect(wrapper.find('[data-action="codex-start"]').text()).toContain('Codex 시작');
  });

  it('renders the dark-mode title variant from localStorage', () => {
    localStorage.setItem('toki-dark-mode', 'true');
    const wrapper = mount(App);

    expect(wrapper.find('.momo-title').text()).toBe('ArisTalk');
  });
});
