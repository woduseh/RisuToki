import Sortable from 'sortablejs';
import type { PromptEditorHandle } from './risup-prompt-editor';
import type { ToggleTemplateItem, ToggleTemplateItemType } from './risup-toggle-model';
import { moveListItem } from './list-reorder';
import {
  TOGGLE_TEMPLATE_ITEM_TYPES,
  createToggleTemplateItem,
  parseCustomPromptTemplateToggle,
  serializeCustomPromptTemplateToggle,
} from './risup-toggle-model';
import { SHARED_OPTIONS, makeFlatOnEnd } from './sidebar-dnd';

function makeFieldLabel(text: string): HTMLDivElement {
  const label = document.createElement('div');
  label.className = 'prompt-field-label form-section-label';
  label.textContent = text;
  return label;
}

function makeInput(
  value: string,
  readonly: boolean,
  onChange: (value: string) => void,
  fieldAttr?: string,
): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'form-input prompt-editor-input';
  input.type = 'text';
  input.value = value;
  if (fieldAttr) input.setAttribute('data-field', fieldAttr);
  input.readOnly = readonly;
  if (!readonly) {
    input.addEventListener('input', () => {
      onChange(input.value);
    });
  }
  return input;
}

function makeTextarea(
  value: string,
  readonly: boolean,
  onChange: (value: string) => void,
  fieldAttr?: string,
  rows = 4,
): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'settings-textarea prompt-editor-textarea';
  textarea.value = value;
  textarea.rows = rows;
  textarea.readOnly = readonly;
  if (fieldAttr) textarea.setAttribute('data-field', fieldAttr);
  if (!readonly) {
    textarea.addEventListener('input', () => {
      onChange(textarea.value);
    });
  }
  return textarea;
}

function makeSelect(
  options: { value: string; label: string }[],
  current: string,
  readonly: boolean,
  onChange: (value: string) => void,
  fieldAttr?: string,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'form-select prompt-editor-select';
  select.disabled = readonly;
  if (fieldAttr) select.setAttribute('data-field', fieldAttr);
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === current;
    select.appendChild(node);
  }
  if (!readonly) {
    select.addEventListener('change', () => {
      onChange(select.value);
    });
  }
  return select;
}

function getToggleItemKey(item: ToggleTemplateItem): string {
  return 'key' in item ? item.key : '';
}

function getToggleItemLabel(item: ToggleTemplateItem): string {
  return 'value' in item ? (item.value ?? '') : '';
}

function convertToggleItemType(item: ToggleTemplateItem, nextType: ToggleTemplateItemType): ToggleTemplateItem {
  if (item.type === nextType) return item;

  if (nextType === 'groupEnd') {
    return { type: 'groupEnd' };
  }

  if (nextType === 'group' || nextType === 'divider' || nextType === 'caption') {
    const fallback = createToggleTemplateItem(nextType);
    return {
      type: nextType,
      value: getToggleItemLabel(item) || ('value' in fallback ? fallback.value : undefined),
    };
  }

  if (nextType === 'select') {
    return {
      type: 'select',
      key: getToggleItemKey(item) || 'key',
      value: getToggleItemLabel(item) || 'Label',
      options: item.type === 'select' ? [...item.options] : ['opt1', 'opt2'],
    };
  }

  return {
    type: nextType,
    key: getToggleItemKey(item) || 'key',
    value: getToggleItemLabel(item) || 'Label',
  };
}

export function createCustomPromptTemplateToggleEditor(
  container: HTMLElement,
  initialValue: string,
  onChange: ((value: string) => void) | null,
): PromptEditorHandle {
  const readonly = onChange === null;
  let model = parseCustomPromptTemplateToggle(initialValue);
  let mode: 'visual' | 'raw' = model.state === 'invalid' ? 'raw' : 'visual';
  let newItemType: ToggleTemplateItemType = 'toggle';
  let toggleSortable: Sortable | null = null;

  function destroyToggleSortable(): void {
    if (!toggleSortable) return;
    toggleSortable.destroy();
    toggleSortable = null;
  }

  function updateRawValue(nextValue: string): void {
    model = parseCustomPromptTemplateToggle(nextValue);
    if (model.state === 'invalid') mode = 'raw';
    if (onChange) onChange(nextValue);
  }

  function structuralChange(newItems: ToggleTemplateItem[]): void {
    const nextValue = serializeCustomPromptTemplateToggle({ items: newItems });
    model = parseCustomPromptTemplateToggle(nextValue);
    if (onChange) onChange(nextValue);
    render();
  }

  function updateItem(index: number, updater: (item: ToggleTemplateItem) => ToggleTemplateItem): void {
    const next = [...model.items];
    const item = next[index];
    if (!item) return;
    next[index] = updater(item);
    structuralChange(next);
  }

  function renderItemFields(item: ToggleTemplateItem, index: number, wrapper: HTMLElement, actions: HTMLElement): void {
    if (!readonly) {
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'settings-btn prompt-editor-action';
      upBtn.textContent = '↑';
      upBtn.setAttribute('data-action', 'move-up');
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', () => {
        structuralChange(moveListItem(model.items, index, index - 1));
      });
      actions.appendChild(upBtn);

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'settings-btn prompt-editor-action';
      downBtn.textContent = '↓';
      downBtn.setAttribute('data-action', 'move-down');
      downBtn.disabled = index === model.items.length - 1;
      downBtn.addEventListener('click', () => {
        structuralChange(moveListItem(model.items, index, index + 1));
      });
      actions.appendChild(downBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'settings-btn prompt-editor-action';
      removeBtn.textContent = '✕';
      removeBtn.setAttribute('data-action', 'remove-item');
      removeBtn.addEventListener('click', () => {
        structuralChange(model.items.filter((_, itemIndex) => itemIndex !== index));
      });
      actions.appendChild(removeBtn);
    }

    const fields = document.createElement('div');
    fields.className = 'toggle-template-fields';

    switch (item.type) {
      case 'group':
      case 'divider':
      case 'caption': {
        const field = document.createElement('div');
        field.className = 'toggle-template-field toggle-template-field--full';
        field.appendChild(makeFieldLabel(item.type === 'caption' ? '텍스트' : '레이블'));
        field.appendChild(
          makeInput(
            item.value ?? '',
            readonly,
            (value) => {
              updateItem(index, (current) => ({ ...current, value: value || undefined }) as ToggleTemplateItem);
            },
            'toggle-value',
          ),
        );
        fields.appendChild(field);
        break;
      }

      case 'groupEnd': {
        const info = document.createElement('div');
        info.className = 'prompt-editor-message toggle-template-empty';
        info.textContent = '이 항목은 가장 가까운 group 구간을 닫습니다.';
        fields.appendChild(info);
        break;
      }

      case 'select': {
        const keyField = document.createElement('div');
        keyField.className = 'toggle-template-field';
        keyField.appendChild(makeFieldLabel('키'));
        keyField.appendChild(
          makeInput(
            item.key,
            readonly,
            (value) => {
              updateItem(index, (current) => ({ ...(current as typeof item), key: value }));
            },
            'toggle-key',
          ),
        );
        fields.appendChild(keyField);

        const valueField = document.createElement('div');
        valueField.className = 'toggle-template-field';
        valueField.appendChild(makeFieldLabel('레이블'));
        valueField.appendChild(
          makeInput(
            item.value,
            readonly,
            (value) => {
              updateItem(index, (current) => ({ ...(current as typeof item), value }));
            },
            'toggle-value',
          ),
        );
        fields.appendChild(valueField);

        const optionsField = document.createElement('div');
        optionsField.className = 'toggle-template-field toggle-template-field--full';
        optionsField.appendChild(makeFieldLabel('옵션 (쉼표 구분)'));
        optionsField.appendChild(
          makeInput(
            item.options.join(', '),
            readonly,
            (value) => {
              updateItem(index, (current) => ({
                ...(current as typeof item),
                options: value
                  .split(',')
                  .map((option) => option.trim())
                  .filter((option) => option.length > 0),
              }));
            },
            'toggle-options',
          ),
        );
        fields.appendChild(optionsField);
        break;
      }

      case 'text':
      case 'textarea':
      case 'toggle': {
        const keyField = document.createElement('div');
        keyField.className = 'toggle-template-field';
        keyField.appendChild(makeFieldLabel('키'));
        keyField.appendChild(
          makeInput(
            item.key,
            readonly,
            (value) => {
              updateItem(index, (current) => ({ ...(current as typeof item), key: value }));
            },
            'toggle-key',
          ),
        );
        fields.appendChild(keyField);

        const valueField = document.createElement('div');
        valueField.className = 'toggle-template-field';
        valueField.appendChild(makeFieldLabel(item.type === 'toggle' ? '레이블' : '표시 이름'));
        valueField.appendChild(
          makeInput(
            item.value,
            readonly,
            (value) => {
              updateItem(index, (current) => ({ ...(current as typeof item), value }));
            },
            'toggle-value',
          ),
        );
        fields.appendChild(valueField);
        break;
      }
    }

    wrapper.appendChild(fields);
  }

  function render(): void {
    destroyToggleSortable();
    container.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'toggle-template-editor-shell';
    root.setAttribute('data-toggle-editor', '');

    const modeBar = document.createElement('div');
    modeBar.className = 'toggle-template-modebar';
    const visualBtn = document.createElement('button');
    visualBtn.type = 'button';
    visualBtn.className = 'settings-btn toggle-template-mode-btn' + (mode === 'visual' ? ' is-active' : '');
    visualBtn.setAttribute('data-action', 'show-visual-mode');
    visualBtn.textContent = 'Visual';
    visualBtn.disabled = model.state === 'invalid';
    visualBtn.addEventListener('click', () => {
      if (model.state === 'invalid') return;
      mode = 'visual';
      render();
    });
    modeBar.appendChild(visualBtn);

    const rawBtn = document.createElement('button');
    rawBtn.type = 'button';
    rawBtn.className = 'settings-btn toggle-template-mode-btn' + (mode === 'raw' ? ' is-active' : '');
    rawBtn.setAttribute('data-action', 'show-raw-mode');
    rawBtn.textContent = 'Raw';
    rawBtn.addEventListener('click', () => {
      mode = 'raw';
      render();
    });
    modeBar.appendChild(rawBtn);
    root.appendChild(modeBar);

    if (model.state === 'invalid') {
      const errorBox = document.createElement('div');
      errorBox.className = 'prompt-editor-message prompt-editor-error';
      errorBox.textContent = `문법 파싱 오류: ${model.parseError ?? '알 수 없는 오류'}`;
      root.appendChild(errorBox);
    }

    if (mode === 'raw' || model.state === 'invalid') {
      const rawEditor = makeTextarea(model.rawText, readonly, updateRawValue, 'toggle-raw', 8);
      rawEditor.classList.add('toggle-template-raw');
      root.appendChild(rawEditor);
      container.appendChild(root);
      return;
    }

    let list: HTMLDivElement | null = null;
    if (model.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prompt-editor-message toggle-template-empty';
      empty.textContent = '커스텀 템플릿 토글이 비어 있습니다.';
      root.appendChild(empty);
    } else {
      const visualList = document.createElement('div');
      visualList.className = 'toggle-template-list';
      list = visualList;

      model.items.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'prompt-editor-card toggle-template-item';
        card.setAttribute('data-toggle-item', '');
        if (!readonly && model.items.length > 1) {
          card.dataset.dndIdx = String(index);
        }

        const header = document.createElement('div');
        header.className = 'prompt-editor-card-header toggle-template-item-header';
        const typeSelect = makeSelect(
          TOGGLE_TEMPLATE_ITEM_TYPES.map((type) => ({ value: type, label: type })),
          item.type,
          readonly,
          (value) => {
            updateItem(index, (current) => convertToggleItemType(current, value as ToggleTemplateItemType));
          },
          'toggle-type',
        );
        typeSelect.classList.add('toggle-template-item-type');
        header.appendChild(typeSelect);

        const summary = document.createElement('div');
        summary.className = 'prompt-editor-summary';
        summary.textContent =
          item.type === 'groupEnd'
            ? 'group 종료'
            : `${getToggleItemKey(item) || item.type} ${getToggleItemLabel(item) ? `• ${getToggleItemLabel(item)}` : ''}`.trim();
        header.appendChild(summary);

        const actions = document.createElement('div');
        actions.className = 'prompt-editor-actions';

        if (!readonly) {
          const dragHandle = document.createElement('button');
          dragHandle.setAttribute('data-action', 'drag-handle');
          dragHandle.type = 'button';
          dragHandle.className = 'settings-btn prompt-editor-action toggle-template-drag-handle';
          dragHandle.textContent = '↕';
          dragHandle.title = '드래그해서 재정렬';
          actions.appendChild(dragHandle);
        }
        header.appendChild(actions);

        card.appendChild(header);
        renderItemFields(item, index, card, actions);
        visualList.appendChild(card);
      });

      root.appendChild(visualList);
    }

    if (!readonly) {
      const addBar = document.createElement('div');
      addBar.className = 'toggle-template-addbar';

      const addType = makeSelect(
        TOGGLE_TEMPLATE_ITEM_TYPES.map((type) => ({ value: type, label: type })),
        newItemType,
        false,
        (value) => {
          newItemType = value as ToggleTemplateItemType;
        },
        'new-toggle-item-type',
      );
      addBar.appendChild(addType);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'settings-btn prompt-editor-add';
      addBtn.setAttribute('data-action', 'add-toggle-item');
      addBtn.textContent = '+ 추가';
      addBtn.addEventListener('click', () => {
        structuralChange([...model.items, createToggleTemplateItem(newItemType)]);
      });
      addBar.appendChild(addBtn);
      root.appendChild(addBar);
    }

    container.appendChild(root);

    if (!readonly && mode === 'visual' && list && model.items.length > 1) {
      toggleSortable = Sortable.create(list, {
        ...SHARED_OPTIONS,
        handle: '.toggle-template-drag-handle',
        onEnd: makeFlatOnEnd((fromIdx, toIdx) => {
          structuralChange(moveListItem(model.items, fromIdx, toIdx));
        }),
      });
    }
  }

  render();

  return {
    dispose(): void {
      destroyToggleSortable();
      container.innerHTML = '';
    },
  };
}
