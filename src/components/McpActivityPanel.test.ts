import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import McpActivityPanel from './McpActivityPanel.vue';
import type { McpActivityEvent } from '../lib/mcp-activity-types';

let wrapper: VueWrapper;
afterEach(() => wrapper?.unmount());

async function render() {
  const base: McpActivityEvent = {
    requestId: 'active',
    sequence: 1,
    startedAt: 1,
    method: 'POST',
    route: '/field/description',
    category: 'change',
    status: 'succeeded',
    target: { kind: 'active', documentId: 'current', name: 'Observed Current' },
    source: { documentId: 'current', field: 'description' },
  };
  const external: McpActivityEvent = {
    ...base,
    requestId: 'external',
    sequence: 2,
    target: { kind: 'external', filePath: 'C:/external.charx' },
    source: undefined,
  };
  Object.defineProperty(window, 'tokiAPI', {
    configurable: true,
    value: {
      getMcpActivity: async () => ({ sequence: 2, entries: [base, external] }),
      onMcpActivity: () => () => {},
    },
  });
  wrapper = mount(McpActivityPanel, {
    props: {
      currentDocumentId: 'current',
      currentDocumentName: 'Selected Document',
      currentSelection: { label: '선택한 인사말' },
    },
    global: { plugins: [createPinia()] },
  });
  await flushPromises();
}

describe('McpActivityPanel', () => {
  it('separates app selection from observed targets and never offers current-document actions for an external request', async () => {
    await render();
    expect(wrapper.get('.app-selection').text()).toContain('Selected Document');
    expect(wrapper.get('.app-selection').text()).toContain('선택한 인사말');
    const external = wrapper.get('[data-request-id="external"]');
    expect(external.text()).toContain('C:/external.charx');
    expect(external.find('button').exists()).toBe(false);
    const current = wrapper.get('[data-request-id="active"]');
    expect(current.text()).toContain('Observed Current');
    await current.findAll('button')[0].trigger('click');
    expect(wrapper.emitted('open-source')).toEqual([[{ documentId: 'current', field: 'description' }]]);
    await current.findAll('button')[1].trigger('click');
    expect(wrapper.emitted('open-review')).toHaveLength(1);
    expect(wrapper.text()).toContain('직접 파일 수정은 관측하지 못해요');
  });

  it('filters to the selected document and removes source actions after document replacement', async () => {
    await render();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(wrapper.find('[data-request-id="external"]').exists()).toBe(false);
    expect(wrapper.find('[data-request-id="active"]').exists()).toBe(true);
    await wrapper.setProps({ currentDocumentId: 'replacement' });
    expect(wrapper.find('[data-request-id="active"]').exists()).toBe(false);
  });
});
