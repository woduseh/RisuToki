import { describe, expect, it, vi } from 'vitest';
import { createCustomPromptTemplateToggleEditor } from './risup-toggle-editor';
import Sortable from 'sortablejs';

describe('createCustomPromptTemplateToggleEditor', () => {
  it('renders one-level collapsible folders and captions without exposing groupEnd cards', () => {
    const container = document.createElement('div');
    const change = vi.fn();
    const handle = createCustomPromptTemplateToggleEditor(
      container,
      '=A=group\na=A\n=Help=caption\n=B=group\nb=B\n==groupEnd',
      change,
    );
    expect(container.querySelectorAll('.toggle-visual-group')).toHaveLength(2);
    expect(container.querySelectorAll('.toggle-visual-group .toggle-visual-group')).toHaveLength(0);
    expect(container.querySelectorAll('[data-toggle-item]')).toHaveLength(4);
    expect(container.querySelector<HTMLInputElement>('[data-field="toggle-caption"]')?.value).toBe('Help');
    const button = container.querySelector<HTMLButtonElement>('[data-action="toggle-group"]')!;
    button.click();
    expect(container.querySelector<HTMLElement>('.toggle-visual-group-body')!.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(change).not.toHaveBeenCalled();
    button.click();
    expect(container.querySelector<HTMLElement>('.toggle-visual-group-body')!.hidden).toBe(false);
    handle.dispose();
  });

  it('creates complete groups and adds controls inside their boundaries', () => {
    const container = document.createElement('div');
    const change = vi.fn();
    const handle = createCustomPromptTemplateToggleEditor(container, '', change);
    container.querySelector<HTMLButtonElement>('[data-action="add-toggle-group"]')!.click();
    expect(change).toHaveBeenLastCalledWith('=New Group=group\n==groupEnd');
    expect(container.querySelector('.toggle-visual-group [data-action="add-toggle-group"]')).toBeNull();
    container.querySelector<HTMLButtonElement>('.toggle-visual-group [data-action="add-toggle-item"]')!.click();
    expect(change).toHaveBeenLastCalledWith('=New Group=group\nkey=Label\n==groupEnd');
    expect(
      container
        .querySelector<HTMLButtonElement>(
          '.toggle-visual-group > .toggle-template-item-header [data-action="remove-item"]',
        )
        ?.getAttribute('aria-label'),
    ).toBe('그룹과 내부 항목 삭제');
    handle.dispose();
  });

  it('keeps group title typing focused and does not overwrite its child summary', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const change = vi.fn();
    const handle = createCustomPromptTemplateToggleEditor(container, '=A=group\na=Child\n==groupEnd', change);
    const summary = container.querySelector('.prompt-editor-summary')!.textContent;
    const input = container.querySelector<HTMLInputElement>('[data-field="toggle-group-name"]')!;
    input.focus();
    input.value = 'Renamed';
    input.dispatchEvent(new Event('input'));
    expect(container.querySelector('.prompt-editor-summary')!.textContent).toBe(summary);
    expect(document.activeElement).toBe(input);
    expect(change).toHaveBeenLastCalledWith('=Renamed=group\na=Child\n==groupEnd');
    handle.dispose();
    container.remove();
  });

  it('adds captions below controls and moves them with the control across groups', () => {
    const container = document.createElement('div');
    const change = vi.fn();
    const handle = createCustomPromptTemplateToggleEditor(container, 'a=A\n=Group=group\n==groupEnd', change);
    container.querySelector<HTMLButtonElement>('[data-action="add-caption"]')!.click();
    const caption = container.querySelector<HTMLInputElement>('[data-field="toggle-caption"]')!;
    caption.value = 'Description';
    caption.dispatchEvent(new Event('input'));
    expect(change).toHaveBeenLastCalledWith('a=A\n=Description=caption\n=Group=group\n==groupEnd');
    const move = container.querySelector<HTMLSelectElement>('[data-field="toggle-parent-group"]')!;
    move.value = '2';
    move.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenLastCalledWith('=Group=group\na=A\n=Description=caption\n==groupEnd');
    handle.dispose();
  });

  it('preserves independent captions, renders dividers as lines, and keeps read-only folders usable', () => {
    const container = document.createElement('div');
    const handle = createCustomPromptTemplateToggleEditor(
      container,
      '=Intro=caption\n=Section=divider\n=A=group\na=A',
      null,
    );
    expect(container.querySelector('.toggle-visual-caption')).toBeTruthy();
    expect(container.querySelector('.toggle-visual-divider > hr')).toBeTruthy();
    expect(container.querySelector('[data-action="remove-item"]')).toBeNull();
    expect(container.querySelector('[data-action="add-toggle-item"]')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('[data-field="toggle-group-name"]')!.readOnly).toBe(true);
    container.querySelector<HTMLButtonElement>('[data-action="toggle-group"]')!.click();
    expect(container.querySelector<HTMLElement>('.toggle-visual-group-body')!.hidden).toBe(true);
    handle.dispose();
  });

  it('reorders complete group ranges through drag and drop', () => {
    const container = document.createElement('div');
    const change = vi.fn();
    const handle = createCustomPromptTemplateToggleEditor(
      container,
      '=A=group\na=A\n=Help=caption\n==groupEnd\nb=B',
      change,
    );
    const list = container.querySelector<HTMLElement>('.toggle-visual-list')!;
    const sortable = Sortable.get(list)!;
    const onEnd = sortable.option('onEnd') as (event: Partial<Sortable.SortableEvent>) => void;
    onEnd({ oldIndex: 0, newIndex: 1, item: list.firstElementChild as HTMLElement, from: list, to: list });
    expect(change).toHaveBeenLastCalledWith('b=B\n=A=group\na=A\n=Help=caption\n==groupEnd');
    handle.dispose();
  });
  it('renders visual rows for valid toggle syntax', () => {
    const container = document.createElement('div');
    const handle = createCustomPromptTemplateToggleEditor(container, 'flag=Enable', vi.fn());

    expect(container.querySelector('[data-toggle-editor]')).toBeTruthy();
    expect(container.querySelectorAll('[data-toggle-item]').length).toBe(1);
    expect(container.querySelector('[data-field="toggle-type"]')).toBeTruthy();

    handle.dispose();
    expect(container.innerHTML).toBe('');
  });

  it('updates the raw string when a visual field changes', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onChange = vi.fn();
    const handle = createCustomPromptTemplateToggleEditor(container, 'flag=Enable', onChange);

    const valueInput = container.querySelector<HTMLInputElement>('[data-field="toggle-value"]');
    expect(valueInput).toBeTruthy();
    valueInput!.focus();
    valueInput!.value = 'Enabled';
    valueInput!.dispatchEvent(new Event('input'));

    expect(onChange).toHaveBeenCalledWith('flag=Enabled');
    expect(container.querySelector('[data-field="toggle-value"]')).toBe(valueInput);
    expect(document.activeElement).toBe(valueInput);

    valueInput!.value = 'Enabled again';
    valueInput!.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenLastCalledWith('flag=Enabled again');

    const keyInput = container.querySelector<HTMLInputElement>('[data-field="toggle-key"]')!;
    keyInput.focus();
    keyInput.value = '';
    keyInput.dispatchEvent(new Event('input'));
    expect(container.querySelector('[data-field="toggle-key"]')).toBe(keyInput);
    expect(document.activeElement).toBe(keyInput);

    keyInput.value = 'renamed';
    keyInput.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenLastCalledWith('renamed=Enabled again');
    handle.dispose();
    container.remove();
  });

  it('preserves the form scroll position for structural changes', () => {
    const body = document.createElement('div');
    body.className = 'form-editor-body';
    const container = document.createElement('div');
    body.appendChild(container);
    document.body.appendChild(body);
    const handle = createCustomPromptTemplateToggleEditor(container, 'flag=Enable', vi.fn());
    body.scrollTop = 180;

    container.querySelector<HTMLButtonElement>('[data-action="add-toggle-item"]')!.click();

    expect(body.scrollTop).toBe(180);
    handle.dispose();
    body.remove();
  });

  it('adds a new visual item from the add bar', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const handle = createCustomPromptTemplateToggleEditor(container, '', onChange);

    const addButton = container.querySelector<HTMLButtonElement>('[data-action="add-toggle-item"]');
    expect(addButton).toBeTruthy();
    addButton!.click();

    expect(onChange).toHaveBeenCalledWith('key=Label');
    expect(container.querySelectorAll('[data-toggle-item]').length).toBe(1);
    handle.dispose();
  });

  it('falls back to raw mode for invalid syntax and returns to valid text after repair', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const handle = createCustomPromptTemplateToggleEditor(container, '=broken', onChange);

    expect(container.textContent).toContain('문법 파싱 오류');
    const rawEditor = container.querySelector<HTMLTextAreaElement>('[data-field="toggle-raw"]');
    expect(rawEditor).toBeTruthy();
    rawEditor!.value = 'flag=Enable';
    rawEditor!.dispatchEvent(new Event('input'));

    expect(onChange).toHaveBeenCalledWith('flag=Enable');
    expect(container.querySelector('[data-action="show-visual-mode"]')).toBeTruthy();
    handle.dispose();
  });

  it('switches between visual and raw modes without losing content', () => {
    const container = document.createElement('div');
    const handle = createCustomPromptTemplateToggleEditor(container, 'flag=Enable', vi.fn());

    container.querySelector<HTMLButtonElement>('[data-action="show-raw-mode"]')!.click();
    const rawEditor = container.querySelector<HTMLTextAreaElement>('[data-field="toggle-raw"]');
    expect(rawEditor?.value).toBe('flag=Enable');

    container.querySelector<HTMLButtonElement>('[data-action="show-visual-mode"]')!.click();
    expect(container.querySelectorAll('[data-toggle-item]').length).toBe(1);
    handle.dispose();
  });

  it('adds drag handles and dnd indices for editable toggle lists', () => {
    const container = document.createElement('div');
    const handle = createCustomPromptTemplateToggleEditor(container, 'flag=Enable\nname=Name=text', vi.fn());

    expect(container.querySelectorAll('.toggle-template-drag-handle').length).toBe(2);
    expect(container.querySelector('[data-toggle-item]')?.getAttribute('data-dnd-idx')).toBe('0');
    handle.dispose();
  });
});
