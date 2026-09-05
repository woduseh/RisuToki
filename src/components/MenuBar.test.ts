import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import MenuBar from './MenuBar.vue';

const mounted: VueWrapper[] = [];

function render(props = {}) {
  const wrapper = mount(MenuBar, { props, attachTo: document.body });
  mounted.push(wrapper);
  return wrapper;
}

function action(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll<HTMLButtonElement>('.menu-action').find((entry) => entry.text().startsWith(label));
  if (!button) throw new Error(`Menu action not found: ${label}`);
  return button;
}

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe('MenuBar action availability', () => {
  it('keeps entry points usable but prevents document and project actions without a target', async () => {
    const wrapper = render();
    await wrapper.get('[data-menu-button="file"]').trigger('click');

    for (const label of ['저장', '다른 이름 저장', '탭 닫기', '프로젝트 폴더 복제', '파일로 내보내기']) {
      expect(action(wrapper, label).element.disabled).toBe(true);
      await action(wrapper, label).trigger('click');
    }
    expect(wrapper.emitted('action')).toBeUndefined();
    for (const label of ['새로 만들기', '열기', '프로젝트 폴더 열기', '파일을 프로젝트 폴더로 추출']) {
      expect(action(wrapper, label).element.disabled).toBe(false);
    }

    await wrapper.setProps({ canSave: true, hasActiveTab: true });
    expect(action(wrapper, '저장').element.disabled).toBe(false);
    expect(action(wrapper, '탭 닫기').element.disabled).toBe(false);
    expect(action(wrapper, '파일로 내보내기').element.disabled).toBe(true);
    await wrapper.setProps({ hasProject: true });
    await action(wrapper, '파일로 내보내기').trigger('click');
    expect(wrapper.emitted('action')).toEqual([['reassemble-project-document', undefined]]);
    expect(wrapper.find('[data-menu="file"]').exists()).toBe(false);
  });

  it('enables text-editor commands only when an editable text target exists', async () => {
    const wrapper = render();
    await wrapper.get('[data-menu-button="edit"]').trigger('click');
    for (const label of ['실행 취소', '다시 실행', '모두 선택', '찾기', '바꾸기']) {
      expect(action(wrapper, label).element.disabled).toBe(true);
    }
    // Clipboard operations also apply to forms, references and the terminal.
    expect(action(wrapper, '복사').element.disabled).toBe(false);
    await wrapper.setProps({ canEditText: true });
    await action(wrapper, '찾기').trigger('click');
    expect(wrapper.emitted('action')).toEqual([['find', undefined]]);
  });

  it('gates terminal commands on runtime availability', async () => {
    const wrapper = render();
    await wrapper.get('[data-menu-button="terminal"]').trigger('click');
    expect(wrapper.findAll<HTMLButtonElement>('.menu-action').every((entry) => entry.element.disabled)).toBe(true);
    await wrapper.setProps({ terminalAvailable: true });
    await action(wrapper, 'Codex 시작').trigger('click');
    expect(wrapper.emitted('action')).toEqual([['codex-start', undefined]]);
  });

  it('skips unavailable commands in keyboard navigation and restores focus on Escape', async () => {
    const wrapper = render();
    await wrapper.get('[data-menu-button="edit"]').trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(action(wrapper, '잘라내기').element);
    await action(wrapper, '잘라내기').trigger('keydown', { key: 'ArrowUp' });
    expect(document.activeElement).toBe(action(wrapper, '붙여넣기').element);
    await action(wrapper, '붙여넣기').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-menu="edit"]').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('[data-menu-button="edit"]').element);
  });

  it('preserves a reference toggle name and current-state tooltip when its text is hidden', async () => {
    const wrapper = render({ referencesOpen: false });
    const toggle = wrapper.get('#btn-references-toggle');
    expect(toggle.attributes('aria-label')).toBe('참고자료 서랍 전환');
    expect(toggle.attributes('title')).toBe('참고자료 열기');
    expect(toggle.attributes('aria-pressed')).toBe('false');
    await wrapper.setProps({ referencesOpen: true });
    expect(toggle.attributes('title')).toBe('참고자료 닫기');
    expect(toggle.attributes('aria-pressed')).toBe('true');
  });
});
