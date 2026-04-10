import { describe, expect, it, vi } from 'vitest';
import { createCustomPromptTemplateToggleEditor } from './risup-toggle-editor';

describe('createCustomPromptTemplateToggleEditor', () => {
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
    const onChange = vi.fn();
    const handle = createCustomPromptTemplateToggleEditor(container, 'flag=Enable', onChange);

    const valueInput = container.querySelector<HTMLInputElement>('[data-field="toggle-value"]');
    expect(valueInput).toBeTruthy();
    valueInput!.value = 'Enabled';
    valueInput!.dispatchEvent(new Event('input'));

    expect(onChange).toHaveBeenCalledWith('flag=Enabled');
    handle.dispose();
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
