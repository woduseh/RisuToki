import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import WorkspaceBar from './WorkspaceBar.vue';
import { useAppStore, type RendererDocumentData } from '../stores/app-store';
import { getVisibleRisupFieldGroups } from '../lib/risup-fields';

let wrapper: VueWrapper;

function fixture(format: 'charx' | 'risum' | 'risup', name = 'Sample'): RendererDocumentData {
  return {
    _fileType: format,
    name,
    description: '',
    firstMessage: '',
    alternateGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: '',
    lorebook: [],
    regex: [],
  };
}

function render(format: 'charx' | 'risum' | 'risup' = 'risup') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAppStore();
  store.setFileData(fixture(format));
  wrapper = mount(WorkspaceBar, { global: { plugins: [pinia] }, attachTo: document.body });
  return store;
}

afterEach(() => wrapper?.unmount());

describe('WorkspaceBar preset actions', () => {
  it.each(['charx', 'risum'] as const)('does not expose preset actions for %s', (format) => {
    render(format);
    expect(wrapper.find('[aria-label="프리셋 이름 변경"]').exists()).toBe(false);
    expect(wrapper.find('#btn-preset-menu').exists()).toBe(false);
    expect(wrapper.find('#btn-workspace-save').exists()).toBe(true);
  });

  it('emits rename and description commands without changing the document', async () => {
    const store = render();
    await wrapper.get('[aria-label="프리셋 이름 변경"]').trigger('click');
    await wrapper.get('#btn-preset-menu').trigger('click');
    await wrapper.get('#preset-more-menu [role="menuitem"]').trigger('click');
    expect(wrapper.emitted('action')).toEqual([['rename-preset'], ['risup-description']]);
    expect(store.fileData?.name).toBe('Sample');
    expect(wrapper.find('#preset-more-menu').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('#btn-preset-menu').element);
  });

  it('reveals only additional settings and routes each visible group to its action', async () => {
    render();
    const allowed = new Set([
      'ordering',
      'templates',
      'model-api',
      'parameters',
      'sampling',
      'thinking',
      'provider-endpoint',
      'advanced',
      'json-schema',
      'misc',
    ]);
    const expected = getVisibleRisupFieldGroups()
      .filter((group) => allowed.has(group.id))
      .map((group) => group.id);
    await wrapper.get('#btn-preset-menu').trigger('click');
    expect(wrapper.find('#preset-additional-settings').exists()).toBe(false);
    await wrapper.get('[aria-controls="preset-additional-settings"]').trigger('click');
    expect(wrapper.findAll('[data-preset-setting]').map((entry) => entry.attributes('data-preset-setting'))).toEqual(
      expected,
    );
    for (const group of expected) {
      await wrapper.get(`[data-preset-setting="${group}"]`).trigger('click');
      expect(wrapper.emitted('action')?.at(-1)).toEqual([`risup-settings:${group}`]);
      expect(wrapper.find('#preset-more-menu').exists()).toBe(false);
      await wrapper.get('#btn-preset-menu').trigger('click');
      await wrapper.get('[aria-controls="preset-additional-settings"]').trigger('click');
    }
  });

  it('supports keyboard navigation, Escape focus return, and outside dismissal', async () => {
    render();
    const trigger = wrapper.get('#btn-preset-menu');
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    const entries = wrapper.findAll('#preset-more-menu [role="menuitem"]');
    expect(document.activeElement).toBe(entries[0].element);
    await entries[0].trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(entries[1].element);
    await entries[1].trigger('keydown', { key: 'Escape' });
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger.element);
    await trigger.trigger('click');
    document.body.click();
    await nextTick();
    expect(wrapper.find('#preset-more-menu').exists()).toBe(false);
    await trigger.trigger('click');
    (wrapper.get('#btn-workspace-save').element as HTMLButtonElement).focus();
    await nextTick();
    expect(wrapper.find('#preset-more-menu').exists()).toBe(false);
  });

  it('clears the popup when switching documents', async () => {
    const store = render();
    await wrapper.get('#btn-preset-menu').trigger('click');
    store.setFileData(fixture('charx', 'Other'));
    await nextTick();
    expect(wrapper.find('#preset-more-menu').exists()).toBe(false);
  });
});
