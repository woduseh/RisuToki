import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StatusBar from '../components/StatusBar.vue';
import { useAppStore } from '../stores/app-store';
import { setStatus } from './status-bar';

enableAutoUnmount(afterEach);

function mountStatusBar() {
  const pinia = createPinia();
  const wrapper = mount(StatusBar, { attachTo: document.body, global: { plugins: [pinia] } });
  return { wrapper, store: useAppStore(pinia) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('renderer status messages', () => {
  it('shows messages from the controller helper and hides them after three seconds', async () => {
    const { wrapper } = mountStatusBar();
    setStatus('Hello');
    await nextTick();

    expect(wrapper.get('#status-text').text()).toBe('Hello');
    expect(wrapper.classes()).toContain('visible');

    vi.advanceTimersByTime(3000);
    await nextTick();
    expect(wrapper.get('#status-text').text()).toBe('');
    expect(wrapper.classes()).not.toContain('visible');
  });

  it.each(['first', 'second'])('restarts the timer when another event reports %s', async (nextMessage) => {
    const { wrapper } = mountStatusBar();
    setStatus('first');
    await nextTick();
    vi.advanceTimersByTime(2000);
    setStatus(nextMessage);
    await nextTick();
    vi.advanceTimersByTime(2000);
    await nextTick();

    expect(wrapper.get('#status-text').text()).toBe(nextMessage);
    expect(wrapper.classes()).toContain('visible');

    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(wrapper.get('#status-text').text()).toBe('');
    expect(wrapper.classes()).not.toContain('visible');
  });

  it('shows the same message again after its previous display expired', async () => {
    const { wrapper } = mountStatusBar();
    setStatus('저장 완료');
    await nextTick();
    vi.advanceTimersByTime(3000);
    await nextTick();
    expect(wrapper.get('#status-text').text()).toBe('');

    setStatus('저장 완료');
    await nextTick();
    expect(wrapper.get('#status-text').text()).toBe('저장 완료');
    expect(wrapper.classes()).toContain('visible');
  });

  it('keeps sticky errors visible until the user dismisses them', async () => {
    const { wrapper, store } = mountStatusBar();
    setStatus('저장 실패', { kind: 'error', sticky: true });
    await nextTick();
    vi.advanceTimersByTime(10000);
    await nextTick();

    expect(wrapper.get('#status-text').text()).toBe('저장 실패');
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['visible', 'status-error', 'sticky']));

    await wrapper.get('#status-dismiss').trigger('click');
    expect(store.statusText).toBe('');
    expect(store.statusSticky).toBe(false);
    expect(wrapper.classes()).not.toContain('visible');
  });

  it('keeps document statistics visible after a helper message expires', async () => {
    const { wrapper, store } = mountStatusBar();
    store.setDocumentStatsText('CHARX · 로어북 2 · 에셋 3');
    setStatus('저장 완료');
    await nextTick();
    vi.advanceTimersByTime(3000);
    await nextTick();

    expect(wrapper.get('#status-text').text()).toBe('');
    expect(wrapper.get('#status-stats').text()).toBe('CHARX · 로어북 2 · 에셋 3');
    expect(wrapper.classes()).toContain('visible');
  });
});
