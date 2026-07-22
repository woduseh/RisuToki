import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContextInspector from './ContextInspector.vue';
import { registerActions } from '../lib/action-registry';
import { parsePromptTemplate } from '../lib/risup-prompt-model';
import { useAppStore } from '../stores/app-store';

describe('ContextInspector lorebook folders', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows human-readable folder names and stores the selected canonical folder reference', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    const onModelChange = vi.fn();
    registerActions({ 'workspace-model-change': onModelChange });

    store.setFileData({
      _fileType: 'charx',
      lorebook: [
        { comment: '세계관', mode: 'folder', key: 'folder:world', folder: '' },
        { comment: '등장인물', mode: 'folder', key: 'folder:characters', folder: '' },
        {
          comment: '엣지워커',
          mode: 'normal',
          key: '',
          secondkey: '',
          content: '내용',
          insertorder: 100,
          order: 0,
          priority: 0,
          alwaysActive: true,
          forceActivation: false,
          selective: false,
          constant: false,
          useRegex: false,
          folder: 'folder:world',
          extentions: {},
        },
      ],
    } as never);
    store.setActiveTabId('lore_2');

    const wrapper = mount(ContextInspector, { global: { plugins: [pinia] } });
    const folderSelect = wrapper.get<HTMLSelectElement>('[data-testid="lore-folder-select"]');

    expect(folderSelect.element.selectedOptions[0]?.textContent?.trim()).toBe('세계관');
    expect(folderSelect.text()).toContain('등장인물');
    expect(wrapper.text()).not.toContain('folder:world');

    await folderSelect.setValue('folder:characters');

    expect(store.fileData?.lorebook?.[2]?.folder).toBe('folder:characters');
    expect(onModelChange).toHaveBeenCalledWith({ tabId: 'lore_2', field: 'lorebook' });
  });

  it('labels an orphaned folder reference without exposing its UUID', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.setFileData({
      _fileType: 'charx',
      lorebook: [
        {
          comment: '고아 항목',
          mode: 'normal',
          key: '',
          secondkey: '',
          content: '',
          insertorder: 100,
          order: 0,
          priority: 0,
          alwaysActive: false,
          forceActivation: false,
          selective: false,
          constant: false,
          useRegex: false,
          folder: 'folder:missing-uuid',
          extentions: {},
        },
      ],
    } as never);
    store.setActiveTabId('lore_0');

    const wrapper = mount(ContextInspector, { global: { plugins: [pinia] } });

    expect(wrapper.get('[data-testid="lore-folder-select"]').text()).toContain('찾을 수 없는 폴더');
    expect(wrapper.text()).not.toContain('missing-uuid');
  });
});

describe('ContextInspector prompt properties', () => {
  it('lets a supported RISUP prompt change its type from the inspector', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    const onModelChange = vi.fn();
    registerActions({ 'workspace-model-change': onModelChange });
    store.setFileData({
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { id: 'prompt-1', type: 'plain', type2: 'normal', text: '기존 본문', role: 'system' },
      ]),
    } as never);
    store.setActiveTabId('risup_prompt_item_prompt-1');

    const wrapper = mount(ContextInspector, { global: { plugins: [pinia] } });
    const typeSelect = wrapper
      .findAll<HTMLSelectElement>('.inspector-content select')
      .find((select) => select.element.value === 'plain')!;
    await typeSelect.setValue('jailbreak');

    const model = parsePromptTemplate(String(store.fileData?.promptTemplate ?? ''));
    expect(model.items[0]).toMatchObject({ id: 'prompt-1', type: 'jailbreak' });
    expect(onModelChange).toHaveBeenCalledWith({
      tabId: 'risup_prompt_item_prompt-1',
      field: 'promptTemplate',
    });
  });
});
