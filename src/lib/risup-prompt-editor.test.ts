import { describe, expect, it, vi } from 'vitest';
import { createFormatingOrderEditor, createPromptTemplateEditor } from './risup-prompt-editor';

describe('createPromptTemplateEditor', () => {
  it('renders a list container for an empty template', () => {
    const container = document.createElement('div');
    const handle = createPromptTemplateEditor(container, '', null);
    expect(container.querySelector('[data-prompt-list]')).toBeTruthy();
    handle.dispose();
    expect(container.innerHTML).toBe('');
  });

  it('renders one item element for a single-item template', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]);
    const handle = createPromptTemplateEditor(container, template, null);
    const items = container.querySelectorAll('[data-prompt-item]');
    expect(items.length).toBe(1);
    handle.dispose();
  });

  it('calls onChange with serialized JSON when a text field changes', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]);
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, template, onChange);

    const textInput = container.querySelector<HTMLTextAreaElement>('[data-field="text"]');
    expect(textInput).toBeTruthy();
    textInput!.value = 'World';
    textInput!.dispatchEvent(new Event('input'));

    expect(onChange).toHaveBeenCalled();
    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as { text: string }[];
    expect(newValue[0].text).toBe('World');
    handle.dispose();
  });

  it('changes item type and rerenders the matching detail fields', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]);
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, template, onChange);

    const typeSelect = container.querySelector<HTMLSelectElement>('[data-field="type"]');
    expect(typeSelect).toBeTruthy();
    typeSelect!.value = 'chat';
    typeSelect!.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalled();
    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as { type: string }[];
    expect(newValue[0].type).toBe('chat');
    expect(container.querySelector('[data-field="rangeStart"]')).toBeTruthy();
    handle.dispose();
  });

  it('adds app-styled card, control, and action hooks to the prompt editor DOM', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]);
    const handle = createPromptTemplateEditor(container, template, vi.fn());

    expect(container.querySelector('[data-prompt-editor]')?.classList.contains('prompt-editor-shell')).toBe(true);
    expect(container.querySelector('[data-prompt-list]')?.classList.contains('prompt-editor-list')).toBe(true);
    expect(container.querySelector('[data-prompt-item]')?.classList.contains('prompt-editor-card')).toBe(true);
    expect(container.querySelector('.prompt-editor-actions')).toBeTruthy();
    expect(container.querySelector('[data-field="type"]')?.classList.contains('form-select')).toBe(true);
    expect(container.querySelector('[data-field="text"]')?.classList.contains('settings-textarea')).toBe(true);
    expect(container.querySelector('[data-action="move-down"]')?.classList.contains('settings-btn')).toBe(true);

    handle.dispose();
  });

  it('surfaces a warning for unsupported item types', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([{ type: 'unknown-xyz', data: 'foo' }]);
    const handle = createPromptTemplateEditor(container, template, null);
    expect(container.textContent).toContain('지원하지 않는');
    handle.dispose();
  });

  it('shows a raw repair editor for invalid prompt JSON and returns to the structured list once fixed', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, '{', onChange);

    expect(container.textContent).toContain('JSON 파싱 오류');
    const repairInput = container.querySelector<HTMLTextAreaElement>('[data-field="raw-json"]');
    expect(repairInput).toBeTruthy();

    repairInput!.value = '[]';
    repairInput!.dispatchEvent(new Event('input'));

    expect(onChange).toHaveBeenCalledWith('[]');
    expect(container.querySelector('[data-prompt-list]')).toBeTruthy();
    handle.dispose();
  });

  it('adds a new item when the add button is clicked', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, '[]', onChange);

    const addButton = container.querySelector<HTMLButtonElement>('[data-action="add-item"]');
    expect(addButton).toBeTruthy();
    addButton!.click();

    expect(onChange).toHaveBeenCalled();
    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as unknown[];
    expect(newValue.length).toBe(1);
    handle.dispose();
  });

  it('removes an item when the remove button is clicked', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([{ type: 'plain', type2: 'normal', text: '', role: 'system' }]);
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, template, onChange);

    const removeButton = container.querySelector<HTMLButtonElement>('[data-action="remove-item"]');
    expect(removeButton).toBeTruthy();
    removeButton!.click();

    expect(onChange).toHaveBeenCalled();
    expect(JSON.parse(onChange.mock.calls[0][0] as string)).toEqual([]);
    handle.dispose();
  });

  it('moves an item up when the move-up button at index 1 is clicked', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([
      { type: 'plain', type2: 'normal', text: 'A', role: 'system' },
      { type: 'plain', type2: 'normal', text: 'B', role: 'system' },
    ]);
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, template, onChange);

    const moveUpButtons = container.querySelectorAll<HTMLButtonElement>('[data-action="move-up"]');
    expect(moveUpButtons.length).toBe(2);
    moveUpButtons[1].click();

    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as { text: string }[];
    expect(newValue[0].text).toBe('B');
    expect(newValue[1].text).toBe('A');
    handle.dispose();
  });

  it('does not render an add button when onChange is null (readonly)', () => {
    const container = document.createElement('div');
    const handle = createPromptTemplateEditor(container, '[]', null);
    expect(container.querySelector('[data-action="add-item"]')).toBeNull();
    handle.dispose();
  });

  it('renders detail fields for all supported item types', () => {
    const template = JSON.stringify([
      { type: 'plain', type2: 'normal', text: 'p', role: 'system' },
      { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
      { type: 'authornote' },
      { type: 'cache', name: 'c', depth: 1, role: 'user' },
      { type: 'lorebook' },
    ]);
    const container = document.createElement('div');
    const handle = createPromptTemplateEditor(container, template, null);
    expect(container.querySelectorAll('[data-prompt-item]').length).toBe(5);
    handle.dispose();
  });
});

describe('createFormatingOrderEditor', () => {
  it('renders one token element per entry', () => {
    const container = document.createElement('div');
    const order = JSON.stringify(['main', 'chats', 'lorebook']);
    const handle = createFormatingOrderEditor(container, order, null);
    expect(container.querySelectorAll('[data-order-token]').length).toBe(3);
    handle.dispose();
  });

  it('moves a token down when move-down[0] is clicked', () => {
    const container = document.createElement('div');
    const order = JSON.stringify(['main', 'chats', 'lorebook']);
    const onChange = vi.fn();
    const handle = createFormatingOrderEditor(container, order, onChange);

    const moveDownButtons = container.querySelectorAll<HTMLButtonElement>('[data-action="move-down"]');
    moveDownButtons[0].click();

    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as string[];
    expect(newValue[0]).toBe('chats');
    expect(newValue[1]).toBe('main');
    handle.dispose();
  });

  it('moves a token up when move-up[1] is clicked', () => {
    const container = document.createElement('div');
    const order = JSON.stringify(['main', 'chats', 'lorebook']);
    const onChange = vi.fn();
    const handle = createFormatingOrderEditor(container, order, onChange);

    const moveUpButtons = container.querySelectorAll<HTMLButtonElement>('[data-action="move-up"]');
    moveUpButtons[1].click();

    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as string[];
    expect(newValue[0]).toBe('chats');
    expect(newValue[1]).toBe('main');
    handle.dispose();
  });

  it('calls onChange with the serialized JSON string', () => {
    const container = document.createElement('div');
    const order = JSON.stringify(['main', 'chats']);
    const onChange = vi.fn();
    const handle = createFormatingOrderEditor(container, order, onChange);

    container.querySelectorAll<HTMLButtonElement>('[data-action="move-up"]')[1].click();
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('"chats"'));
    handle.dispose();
  });

  it('does not render move buttons when onChange is null (readonly)', () => {
    const container = document.createElement('div');
    const order = JSON.stringify(['main', 'chats']);
    const handle = createFormatingOrderEditor(container, order, null);
    expect(container.querySelector('[data-action="move-up"]')).toBeNull();
    handle.dispose();
  });

  it('shows a raw repair editor for invalid formatingOrder JSON', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const handle = createFormatingOrderEditor(container, '{', onChange);

    expect(container.textContent).toContain('JSON 파싱 오류');
    const repairInput = container.querySelector<HTMLTextAreaElement>('[data-field="raw-json"]');
    expect(repairInput).toBeTruthy();

    repairInput!.value = '["main"]';
    repairInput!.dispatchEvent(new Event('input'));

    expect(onChange).toHaveBeenCalledWith('["main"]');
    expect(container.querySelector('[data-order-token]')).toBeTruthy();
    handle.dispose();
  });

  it('lets users restore the default order when formatingOrder is empty', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const handle = createFormatingOrderEditor(container, '[]', onChange);

    expect(container.textContent).toContain('포매팅 순서가 비어 있습니다.');
    const restoreButton = container.querySelector<HTMLButtonElement>('[data-action="restore-default-order"]');
    expect(restoreButton).toBeTruthy();

    restoreButton!.click();

    const restored = JSON.parse(onChange.mock.calls[0][0] as string) as string[];
    expect(restored.length).toBeGreaterThan(0);
    expect(restored).toContain('main');
    expect(container.querySelectorAll('[data-order-token]').length).toBe(restored.length);
    handle.dispose();
  });

  it('adds app-styled token list and action hooks to the formatingOrder editor DOM', () => {
    const container = document.createElement('div');
    const order = JSON.stringify(['main', 'chats', 'lorebook']);
    const handle = createFormatingOrderEditor(container, order, vi.fn());

    expect(container.querySelector('[data-formating-order-editor]')?.classList.contains('prompt-order-shell')).toBe(
      true,
    );
    expect(container.querySelector('.prompt-order-list')).toBeTruthy();
    expect(container.querySelector('[data-order-token]')?.classList.contains('prompt-order-token')).toBe(true);
    expect(container.querySelector('.prompt-order-actions')).toBeTruthy();
    expect(container.querySelector('[data-action="move-down"]')?.classList.contains('settings-btn')).toBe(true);

    handle.dispose();
  });
});
