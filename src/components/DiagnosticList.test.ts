import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DiagnosticList from './DiagnosticList.vue';
import type { DocumentDiagnostic } from '../lib/document-diagnostics';

const issue: DocumentDiagnostic = {
  id: 'test',
  severity: 'error',
  code: 'example',
  message: '<img src=x onerror=bad()>',
  detail: 'line one\n<script>bad()</script>',
  source: { field: 'lorebook', index: 2, path: '$.lorebook[2].content', line: 4 },
};
describe('DiagnosticList', () => {
  it('escapes diagnostic content and emits the complete source including index, path and line', async () => {
    const wrapper = mount(DiagnosticList, { props: { diagnostics: [issue] } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.find('pre').text()).toContain('<script>bad()</script>');
    expect(wrapper.get('.diagnostic-location').text()).toBe('$.lorebook[2].content · 4행');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('open')).toEqual([[issue.source]]);
  });
  it('blocks stale source navigation and shows an index when no explicit path is available', async () => {
    const wrapper = mount(DiagnosticList, {
      props: { diagnostics: [{ ...issue, source: { field: 'regex', index: 0 } }], stale: true },
    });
    expect(wrapper.get('.diagnostic-location').text()).toBe('regex[0]');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('open')).toBeUndefined();
  });
});
