import { describe, expect, it, vi } from 'vitest';
import { moveListItem } from './list-reorder';
import { createFormatingOrderEditor, createPromptTemplateEditor } from './risup-prompt-editor';

describe('moveListItem', () => {
  it('moves an entry to an arbitrary target index', () => {
    expect(moveListItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveListItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('createPromptTemplateEditor', () => {
  function clickContextMenuItem(label: string): void {
    const item = [...document.querySelectorAll<HTMLDivElement>('.ctx-item')].find(
      (entry) => entry.textContent === label,
    );
    expect(item).toBeTruthy();
    item!.click();
  }

  function makePromptTemplate(texts: string[]): string {
    return JSON.stringify(texts.map((text) => ({ type: 'plain', type2: 'normal', text, role: 'system' })));
  }

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

  it('adds drag handles and dnd indices for editable prompt lists', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([
      { type: 'plain', type2: 'normal', text: 'A', role: 'system' },
      { type: 'plain', type2: 'normal', text: 'B', role: 'system' },
    ]);
    const handle = createPromptTemplateEditor(container, template, vi.fn());

    expect(container.querySelectorAll('.prompt-editor-drag-handle').length).toBe(2);
    expect(container.querySelector('[data-prompt-item]')?.getAttribute('data-dnd-idx')).toBe('0');
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

  it('shows a type-aware add menu when the add button is clicked', () => {
    const container = document.createElement('div');
    const handle = createPromptTemplateEditor(container, '[]', vi.fn());

    const addButton = container.querySelector<HTMLButtonElement>('[data-action="add-item"]');
    expect(addButton).toBeTruthy();
    addButton!.click();

    const menu = document.querySelector('.ctx-menu');
    expect(menu).toBeTruthy();
    expect(document.querySelectorAll('.ctx-item').length).toBe(12);
    handle.dispose();
  });

  it('adds a new item of the selected type from the add menu', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, '[]', onChange);

    const addButton = container.querySelector<HTMLButtonElement>('[data-action="add-item"]');
    expect(addButton).toBeTruthy();
    addButton!.click();
    clickContextMenuItem('cache');

    expect(onChange).toHaveBeenCalled();
    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as Array<{ type: string }>;
    expect(newValue.length).toBe(1);
    expect(newValue[0].type).toBe('cache');
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

  it('shows the prompt search input only for larger templates', () => {
    const smallContainer = document.createElement('div');
    const largeContainer = document.createElement('div');
    const smallHandle = createPromptTemplateEditor(
      smallContainer,
      makePromptTemplate(['a', 'b', 'c', 'd', 'e']),
      vi.fn(),
    );
    const largeHandle = createPromptTemplateEditor(
      largeContainer,
      makePromptTemplate(['a', 'b', 'c', 'd', 'e', 'f']),
      vi.fn(),
    );

    expect(smallContainer.querySelector('[data-action="filter-items"]')).toBeNull();
    expect(largeContainer.querySelector('[data-action="filter-items"]')).toBeTruthy();

    smallHandle.dispose();
    largeHandle.dispose();
  });

  it('filters prompt items and updates the toolbar summary', () => {
    const container = document.createElement('div');
    const handle = createPromptTemplateEditor(
      container,
      makePromptTemplate(['alpha', 'beta target', 'gamma', 'delta', 'beta second', 'omega']),
      vi.fn(),
    );

    const filterInput = container.querySelector<HTMLInputElement>('[data-action="filter-items"]');
    expect(filterInput).toBeTruthy();
    filterInput!.value = 'BeTa';
    filterInput!.dispatchEvent(new Event('input'));

    expect(container.querySelectorAll('[data-prompt-item]').length).toBe(2);
    expect(container.querySelector('.prompt-editor-list-summary')?.textContent).toContain('일치 2 / 6개');

    handle.dispose();
  });

  it('clears the prompt filter with the clear button and restores all items', () => {
    const container = document.createElement('div');
    const handle = createPromptTemplateEditor(
      container,
      makePromptTemplate(['alpha', 'beta target', 'gamma', 'delta', 'beta second', 'omega']),
      vi.fn(),
    );

    const filterInput = container.querySelector<HTMLInputElement>('[data-action="filter-items"]');
    filterInput!.value = 'beta';
    filterInput!.dispatchEvent(new Event('input'));

    const clearButton = container.querySelector<HTMLButtonElement>('[data-action="clear-filter"]');
    expect(clearButton).toBeTruthy();
    clearButton!.click();

    expect(container.querySelectorAll('[data-prompt-item]').length).toBe(6);
    expect(container.querySelector('.prompt-editor-list-summary')?.textContent).toContain('항목 6개');

    handle.dispose();
  });

  it('clears the prompt filter with Escape', () => {
    const container = document.createElement('div');
    const handle = createPromptTemplateEditor(
      container,
      makePromptTemplate(['alpha', 'beta target', 'gamma', 'delta', 'beta second', 'omega']),
      vi.fn(),
    );

    const filterInput = container.querySelector<HTMLInputElement>('[data-action="filter-items"]');
    filterInput!.value = 'beta';
    filterInput!.dispatchEvent(new Event('input'));

    const activeInput = container.querySelector<HTMLInputElement>('[data-action="filter-items"]');
    activeInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(container.querySelectorAll('[data-prompt-item]').length).toBe(6);
    expect(container.querySelector('[data-action="clear-filter"]')).toBeNull();

    handle.dispose();
  });

  it('shows an empty-search message and disables reorder controls while filtering', () => {
    const container = document.createElement('div');
    const handle = createPromptTemplateEditor(
      container,
      makePromptTemplate(['alpha', 'beta target', 'gamma', 'delta', 'beta second', 'omega']),
      vi.fn(),
    );

    const filterInput = container.querySelector<HTMLInputElement>('[data-action="filter-items"]');
    filterInput!.value = 'beta';
    filterInput!.dispatchEvent(new Event('input'));

    expect(container.querySelectorAll('[data-action="drag-handle"]').length).toBe(2);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('[data-action="drag-handle"]')].every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('[data-action="move-up"]')].every((button) => button.disabled),
    ).toBe(true);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('[data-action="move-down"]')].every(
        (button) => button.disabled,
      ),
    ).toBe(true);

    const activeInput = container.querySelector<HTMLInputElement>('[data-action="filter-items"]');
    activeInput!.value = 'zzz';
    activeInput!.dispatchEvent(new Event('input'));

    expect(container.querySelectorAll('[data-prompt-item]').length).toBe(0);
    expect(container.textContent).toContain('검색 결과가 없습니다.');

    handle.dispose();
  });

  it('preserves the same id when an item type changes', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([
      { id: 'prompt-1', type: 'plain', type2: 'normal', text: 'Hello', role: 'system' },
    ]);
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, template, onChange);

    const typeSelect = container.querySelector<HTMLSelectElement>('[data-field="type"]');
    expect(typeSelect).toBeTruthy();
    typeSelect!.value = 'chat';
    typeSelect!.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalled();
    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as { id: string; type: string }[];
    expect(newValue[0].type).toBe('chat');
    expect(newValue[0].id).toBe('prompt-1');
    handle.dispose();
  });

  it('preserves ids when items are reordered', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([
      { id: 'prompt-a', type: 'plain', type2: 'normal', text: 'A', role: 'system' },
      { id: 'prompt-b', type: 'plain', type2: 'normal', text: 'B', role: 'system' },
    ]);
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, template, onChange);

    const moveUpButtons = container.querySelectorAll<HTMLButtonElement>('[data-action="move-up"]');
    moveUpButtons[1].click();

    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as { id: string; text: string }[];
    expect(newValue[0].text).toBe('B');
    expect(newValue[0].id).toBe('prompt-b');
    expect(newValue[1].text).toBe('A');
    expect(newValue[1].id).toBe('prompt-a');
    handle.dispose();
  });

  it('duplicates an item with a fresh id when duplicate is clicked', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([{ id: 'prompt-a', type: 'plain', type2: 'normal', text: 'A', role: 'system' }]);
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, template, onChange);

    const duplicateButton = container.querySelector<HTMLButtonElement>('[data-action="duplicate-item"]');
    expect(duplicateButton).toBeTruthy();
    duplicateButton!.click();

    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as { id: string; text: string }[];
    expect(newValue.length).toBe(2);
    expect(newValue[1].text).toBe('A');
    expect(newValue[1].id).not.toBe('prompt-a');
    handle.dispose();
  });

  it('inserts a selected item type below the current item', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([
      { id: 'prompt-a', type: 'plain', type2: 'normal', text: 'A', role: 'system' },
      { id: 'prompt-b', type: 'plain', type2: 'normal', text: 'B', role: 'system' },
    ]);
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, template, onChange);

    const insertButtons = container.querySelectorAll<HTMLButtonElement>('[data-action="insert-item-below"]');
    expect(insertButtons.length).toBe(2);
    insertButtons[0].click();
    clickContextMenuItem('chat');

    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as Array<{
      id: string;
      type: string;
      text?: string;
    }>;
    expect(newValue.length).toBe(3);
    expect(newValue[0].id).toBe('prompt-a');
    expect(newValue[1].type).toBe('chat');
    expect(newValue[1].id).not.toBe('prompt-a');
    expect(newValue[2].id).toBe('prompt-b');
    handle.dispose();
  });

  it('collapses and expands item details without changing the prompt data', () => {
    const container = document.createElement('div');
    const template = JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]);
    const handle = createPromptTemplateEditor(container, template, vi.fn());

    expect(container.querySelector('.prompt-item-fields')).toBeTruthy();
    const collapseButton = container.querySelector<HTMLButtonElement>('[data-action="toggle-collapse"]');
    expect(collapseButton).toBeTruthy();
    collapseButton!.click();

    expect(container.querySelector('.prompt-item-fields')).toBeNull();
    collapseButton!.click();
    expect(container.querySelector('.prompt-item-fields')).toBeTruthy();
    handle.dispose();
  });

  it('creates a fresh id when a new item is added', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    const handle = createPromptTemplateEditor(container, '[]', onChange);

    const addButton = container.querySelector<HTMLButtonElement>('[data-action="add-item"]');
    addButton!.click();
    clickContextMenuItem('plain');

    const newValue = JSON.parse(onChange.mock.calls[0][0] as string) as { id: string }[];
    expect(newValue.length).toBe(1);
    expect(typeof newValue[0].id).toBe('string');
    expect(newValue[0].id.length).toBeGreaterThan(0);
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

  it('adds drag handles and dnd indices for editable formatingOrder lists', () => {
    const container = document.createElement('div');
    const order = JSON.stringify(['main', 'chats', 'lorebook']);
    const handle = createFormatingOrderEditor(container, order, vi.fn());

    expect(container.querySelectorAll('.prompt-order-drag-handle').length).toBe(3);
    expect(container.querySelector('[data-order-token]')?.getAttribute('data-dnd-idx')).toBe('0');
    handle.dispose();
  });
});
