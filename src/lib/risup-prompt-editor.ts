// Structured DOM editors for risup promptTemplate and formatingOrder fields.
// Replaces raw JSON textareas with list+detail editors, serializing back to JSON strings
// so the rest of the app continues to work with data.promptTemplate / data.formatingOrder.

import type {
  FormatingOrderItemModel,
  PromptItemAuthorNoteModel,
  PromptItemCacheModel,
  PromptItemCacheRole,
  PromptItemChatMLModel,
  PromptItemChatModel,
  PromptItemModel,
  PromptItemPlainModel,
  PromptItemRole,
  PromptItemType2,
  PromptItemTypedModel,
  SupportedPromptItemType,
} from './risup-prompt-model';
import {
  SUPPORTED_PROMPT_ITEM_TYPES,
  defaultFormatingOrder,
  defaultPromptItem,
  parseFormatingOrder,
  parsePromptTemplate,
  serializeFormatingOrder,
  serializePromptTemplate,
} from './risup-prompt-model';

export interface PromptEditorHandle {
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Shared DOM helpers
// ---------------------------------------------------------------------------

function makeLabel(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'prompt-field-label form-section-label';
  el.textContent = text;
  return el;
}

function makeTextarea(
  value: string,
  readonly: boolean,
  onChange: (val: string) => void,
  fieldAttr?: string,
  rows?: number,
): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.className = 'settings-textarea prompt-editor-textarea';
  if (fieldAttr) ta.setAttribute('data-field', fieldAttr);
  ta.value = value;
  ta.readOnly = readonly;
  ta.rows = rows ?? 4;
  ta.style.width = '100%';
  if (!readonly)
    ta.addEventListener('input', () => {
      onChange(ta.value);
    });
  return ta;
}

function makeInput(
  value: string,
  readonly: boolean,
  onChange: (val: string) => void,
  fieldAttr?: string,
): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'form-input prompt-editor-input';
  input.type = 'text';
  if (fieldAttr) input.setAttribute('data-field', fieldAttr);
  input.value = value;
  input.readOnly = readonly;
  if (!readonly)
    input.addEventListener('input', () => {
      onChange(input.value);
    });
  return input;
}

function makeNumberInput(
  value: number,
  readonly: boolean,
  onChange: (val: number) => void,
  fieldAttr?: string,
): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'form-input form-number prompt-editor-input prompt-editor-number';
  input.type = 'number';
  if (fieldAttr) input.setAttribute('data-field', fieldAttr);
  input.value = String(value);
  input.readOnly = readonly;
  if (!readonly) {
    input.addEventListener('input', () => {
      const n = parseFloat(input.value);
      if (isFinite(n)) onChange(n);
    });
  }
  return input;
}

function makeSelect(
  options: { value: string; label: string }[],
  current: string,
  readonly: boolean,
  onChange: (val: string) => void,
  fieldAttr?: string,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'form-select prompt-editor-select';
  if (fieldAttr) select.setAttribute('data-field', fieldAttr);
  select.disabled = readonly;
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === current) o.selected = true;
    select.appendChild(o);
  }
  if (!readonly)
    select.addEventListener('change', () => {
      onChange(select.value);
    });
  return select;
}

function appendInvalidRawEditor(
  container: HTMLElement,
  rawText: string,
  readonly: boolean,
  onChange: ((nextValue: string) => void) | null,
): void {
  if (readonly || !onChange) return;
  container.appendChild(makeLabel('손상된 JSON 복구'));
  container.appendChild(makeTextarea(rawText, false, onChange, 'raw-json', 8));
}

// ---------------------------------------------------------------------------
// Prompt item field renderers
// ---------------------------------------------------------------------------

type UpdateItemFn = (index: number, updater: (item: PromptItemModel) => PromptItemModel) => void;

const ROLE_OPTIONS = [
  { value: 'system', label: 'system' },
  { value: 'user', label: 'user' },
  { value: 'bot', label: 'bot' },
];
const TYPE2_OPTIONS = [
  { value: 'normal', label: 'normal' },
  { value: 'globalNote', label: 'globalNote' },
  { value: 'main', label: 'main' },
];
const CACHE_ROLE_OPTIONS = [
  { value: 'user', label: 'user' },
  { value: 'assistant', label: 'assistant' },
  { value: 'system', label: 'system' },
  { value: 'all', label: 'all' },
];
const PROMPT_TYPE_OPTIONS = SUPPORTED_PROMPT_ITEM_TYPES.map((type) => ({ value: type, label: type }));

function renderItemFields(
  container: HTMLElement,
  item: PromptItemModel,
  index: number,
  updateItem: UpdateItemFn,
  readonly: boolean,
): void {
  if (!item.supported) {
    const warn = document.createElement('div');
    warn.className = 'prompt-item-unsupported prompt-editor-message';
    warn.textContent = `⚠ 지원하지 않는 항목 (type: ${item.type ?? 'unknown'})`;
    container.appendChild(warn);
    const ta = makeTextarea(JSON.stringify(item.rawValue, null, 2), true, () => undefined, undefined, 4);
    ta.classList.add('prompt-editor-raw');
    container.appendChild(ta);
    return;
  }

  switch (item.type) {
    case 'plain':
    case 'jailbreak':
    case 'cot': {
      const plain = item as PromptItemPlainModel;
      container.appendChild(makeLabel('텍스트'));
      container.appendChild(
        makeTextarea(
          plain.text,
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemPlainModel), text: v }));
          },
          'text',
          5,
        ),
      );
      container.appendChild(makeLabel('역할'));
      container.appendChild(
        makeSelect(
          ROLE_OPTIONS,
          plain.role,
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemPlainModel), role: v as PromptItemRole }));
          },
          'role',
        ),
      );
      container.appendChild(makeLabel('type2'));
      container.appendChild(
        makeSelect(
          TYPE2_OPTIONS,
          plain.type2,
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemPlainModel), type2: v as PromptItemType2 }));
          },
          'type2',
        ),
      );
      container.appendChild(makeLabel('이름 (선택)'));
      container.appendChild(
        makeInput(
          plain.name ?? '',
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemPlainModel), name: v || undefined }));
          },
          'name',
        ),
      );
      break;
    }

    case 'chatML': {
      const chatML = item as PromptItemChatMLModel;
      container.appendChild(makeLabel('텍스트'));
      container.appendChild(
        makeTextarea(
          chatML.text,
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemChatMLModel), text: v }));
          },
          'text',
          5,
        ),
      );
      container.appendChild(makeLabel('이름 (선택)'));
      container.appendChild(
        makeInput(
          chatML.name ?? '',
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemChatMLModel), name: v || undefined }));
          },
          'name',
        ),
      );
      break;
    }

    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory': {
      const typed = item as PromptItemTypedModel;
      container.appendChild(makeLabel('innerFormat (선택)'));
      container.appendChild(
        makeTextarea(
          typed.innerFormat ?? '',
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemTypedModel), innerFormat: v || undefined }));
          },
          'innerFormat',
          3,
        ),
      );
      container.appendChild(makeLabel('이름 (선택)'));
      container.appendChild(
        makeInput(
          typed.name ?? '',
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemTypedModel), name: v || undefined }));
          },
          'name',
        ),
      );
      break;
    }

    case 'authornote': {
      const an = item as PromptItemAuthorNoteModel;
      container.appendChild(makeLabel('innerFormat (선택)'));
      container.appendChild(
        makeTextarea(
          an.innerFormat ?? '',
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemAuthorNoteModel), innerFormat: v || undefined }));
          },
          'innerFormat',
          3,
        ),
      );
      container.appendChild(makeLabel('defaultText (선택)'));
      container.appendChild(
        makeTextarea(
          an.defaultText ?? '',
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemAuthorNoteModel), defaultText: v || undefined }));
          },
          'defaultText',
          3,
        ),
      );
      container.appendChild(makeLabel('이름 (선택)'));
      container.appendChild(
        makeInput(
          an.name ?? '',
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemAuthorNoteModel), name: v || undefined }));
          },
          'name',
        ),
      );
      break;
    }

    case 'chat': {
      const chat = item as PromptItemChatModel;
      container.appendChild(makeLabel('rangeStart'));
      container.appendChild(
        makeNumberInput(
          chat.rangeStart,
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemChatModel), rangeStart: v }));
          },
          'rangeStart',
        ),
      );
      container.appendChild(makeLabel('rangeEnd'));
      const rangeEndInput = makeInput(
        String(chat.rangeEnd),
        readonly,
        (v) => {
          const n = parseInt(v, 10);
          const re: number | 'end' = v === 'end' ? 'end' : isFinite(n) ? n : 'end';
          updateItem(index, (it) => ({ ...(it as PromptItemChatModel), rangeEnd: re }));
        },
        'rangeEnd',
      );
      container.appendChild(rangeEndInput);

      const caosRow = document.createElement('label');
      caosRow.className = 'prompt-editor-checkbox-row';
      const caosCheck = document.createElement('input');
      caosCheck.type = 'checkbox';
      caosCheck.setAttribute('data-field', 'chatAsOriginalOnSystem');
      caosCheck.checked = !!chat.chatAsOriginalOnSystem;
      caosCheck.disabled = readonly;
      if (!readonly) {
        caosCheck.addEventListener('change', () => {
          updateItem(index, (it) => ({
            ...(it as PromptItemChatModel),
            chatAsOriginalOnSystem: caosCheck.checked,
          }));
        });
      }
      caosRow.appendChild(caosCheck);
      caosRow.appendChild(document.createTextNode(' chatAsOriginalOnSystem'));
      container.appendChild(caosRow);

      container.appendChild(makeLabel('이름 (선택)'));
      container.appendChild(
        makeInput(
          chat.name ?? '',
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemChatModel), name: v || undefined }));
          },
          'name',
        ),
      );
      break;
    }

    case 'cache': {
      const cache = item as PromptItemCacheModel;
      container.appendChild(makeLabel('이름'));
      container.appendChild(
        makeInput(
          cache.name,
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemCacheModel), name: v }));
          },
          'name',
        ),
      );
      container.appendChild(makeLabel('depth'));
      container.appendChild(
        makeNumberInput(
          cache.depth,
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemCacheModel), depth: v }));
          },
          'depth',
        ),
      );
      container.appendChild(makeLabel('역할'));
      container.appendChild(
        makeSelect(
          CACHE_ROLE_OPTIONS,
          cache.role,
          readonly,
          (v) => {
            updateItem(index, (it) => ({ ...(it as PromptItemCacheModel), role: v as PromptItemCacheRole }));
          },
          'role',
        ),
      );
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// promptTemplate editor
// ---------------------------------------------------------------------------

export function createPromptTemplateEditor(
  container: HTMLElement,
  initialValue: string,
  onChange: ((value: string) => void) | null,
): PromptEditorHandle {
  const readonly = onChange === null;
  let model = parsePromptTemplate(initialValue);

  function notifyChange(): void {
    if (onChange) onChange(serializePromptTemplate(model));
  }

  function updateItem(index: number, updater: (item: PromptItemModel) => PromptItemModel, rerender = false): void {
    const newItems = [...model.items];
    const item = newItems[index];
    if (item === undefined) return;
    newItems[index] = updater(item);
    model = { ...model, items: newItems };
    notifyChange();
    if (rerender) render();
  }

  function structuralChange(newItems: PromptItemModel[]): void {
    model = {
      ...model,
      items: newItems,
      hasUnsupportedContent: newItems.some((it) => !it.supported),
      state: newItems.length === 0 ? 'empty' : 'valid',
    };
    notifyChange();
    render();
  }

  function render(): void {
    container.innerHTML = '';
    const root = document.createElement('div');
    root.setAttribute('data-prompt-editor', '');
    root.className = 'prompt-editor-shell';

    if (model.state === 'invalid') {
      const errBox = document.createElement('div');
      errBox.className = 'prompt-editor-message prompt-editor-error';
      errBox.textContent = `JSON 파싱 오류: ${model.parseError ?? '알 수 없는 오류'}`;
      root.appendChild(errBox);
      appendInvalidRawEditor(root, model.rawText, readonly, (value) => {
        model = parsePromptTemplate(value);
        if (onChange) onChange(value);
        render();
      });
      container.appendChild(root);
      return;
    }

    if (model.hasUnsupportedContent) {
      const warn = document.createElement('div');
      warn.className = 'prompt-editor-message prompt-editor-warning';
      warn.textContent = '⚠ 지원하지 않는 항목이 포함되어 있습니다.';
      root.appendChild(warn);
    }

    const list = document.createElement('div');
    list.setAttribute('data-prompt-list', '');
    list.className = 'prompt-editor-list';

    const items = model.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemEl = document.createElement('div');
      itemEl.setAttribute('data-prompt-item', '');
      itemEl.className = 'prompt-item prompt-editor-card';

      // Header row: type label + reorder + remove buttons
      const header = document.createElement('div');
      header.className = 'prompt-item-header prompt-editor-card-header';

      if (item.supported) {
        const typeSelect = makeSelect(
          PROMPT_TYPE_OPTIONS,
          item.type,
          readonly,
          (value) => {
            updateItem(
              i,
              (old) => {
                const fresh = defaultPromptItem(value as SupportedPromptItemType);
                return { ...fresh, id: old.id };
              },
              true,
            );
          },
          'type',
        );
        typeSelect.classList.add('prompt-item-type');
        header.appendChild(typeSelect);
      } else {
        const typeLabel = document.createElement('span');
        typeLabel.className = 'prompt-item-type prompt-editor-type-label';
        typeLabel.textContent = item.type ?? '(알 수 없음)';
        header.appendChild(typeLabel);
      }

      if (!readonly) {
        const actions = document.createElement('div');
        actions.className = 'prompt-editor-actions';

        const upBtn = document.createElement('button');
        upBtn.setAttribute('data-action', 'move-up');
        upBtn.type = 'button';
        upBtn.className = 'settings-btn prompt-editor-action';
        upBtn.textContent = '↑';
        upBtn.disabled = i === 0;
        upBtn.addEventListener('click', () => {
          const next = [...model.items];
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
          structuralChange(next);
        });
        actions.appendChild(upBtn);

        const downBtn = document.createElement('button');
        downBtn.setAttribute('data-action', 'move-down');
        downBtn.type = 'button';
        downBtn.className = 'settings-btn prompt-editor-action';
        downBtn.textContent = '↓';
        downBtn.disabled = i === items.length - 1;
        downBtn.addEventListener('click', () => {
          const next = [...model.items];
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
          structuralChange(next);
        });
        actions.appendChild(downBtn);

        const removeBtn = document.createElement('button');
        removeBtn.setAttribute('data-action', 'remove-item');
        removeBtn.type = 'button';
        removeBtn.className = 'settings-btn prompt-editor-action';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => {
          const next = [...model.items];
          next.splice(i, 1);
          structuralChange(next);
        });
        actions.appendChild(removeBtn);
        header.appendChild(actions);
      }

      itemEl.appendChild(header);

      const fields = document.createElement('div');
      fields.className = 'prompt-item-fields prompt-editor-card-body';
      renderItemFields(fields, item, i, updateItem, readonly);
      itemEl.appendChild(fields);

      list.appendChild(itemEl);
    }

    root.appendChild(list);

    if (!readonly) {
      const addArea = document.createElement('div');
      addArea.className = 'prompt-add-area prompt-editor-toolbar';
      const addBtn = document.createElement('button');
      addBtn.setAttribute('data-action', 'add-item');
      addBtn.type = 'button';
      addBtn.className = 'settings-btn prompt-editor-add';
      addBtn.textContent = '+ 추가';
      addBtn.addEventListener('click', () => {
        structuralChange([...model.items, defaultPromptItem()]);
      });
      addArea.appendChild(addBtn);
      root.appendChild(addArea);
    }

    container.appendChild(root);
  }

  render();

  return {
    dispose(): void {
      container.innerHTML = '';
    },
  };
}

// ---------------------------------------------------------------------------
// formatingOrder editor
// ---------------------------------------------------------------------------

export function createFormatingOrderEditor(
  container: HTMLElement,
  initialValue: string,
  onChange: ((value: string) => void) | null,
): PromptEditorHandle {
  const readonly = onChange === null;
  let model = parseFormatingOrder(initialValue);

  function notifyChange(): void {
    if (onChange) onChange(serializeFormatingOrder(model));
  }

  function structuralChange(newItems: FormatingOrderItemModel[]): void {
    model = {
      ...model,
      items: newItems,
      state: newItems.length === 0 ? 'empty' : 'valid',
    };
    notifyChange();
    render();
  }

  function render(): void {
    container.innerHTML = '';
    const root = document.createElement('div');
    root.setAttribute('data-formating-order-editor', '');
    root.className = 'prompt-order-shell';

    if (model.state === 'invalid') {
      const errBox = document.createElement('div');
      errBox.className = 'prompt-editor-message formating-order-error';
      errBox.textContent = `JSON 파싱 오류: ${model.parseError ?? '알 수 없는 오류'}`;
      root.appendChild(errBox);
      appendInvalidRawEditor(root, model.rawText, readonly, (value) => {
        model = parseFormatingOrder(value);
        if (onChange) onChange(value);
        render();
      });
      container.appendChild(root);
      return;
    }

    const items = model.items;
    if (items.length === 0) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'prompt-editor-message formating-order-empty';
      emptyBox.textContent = '포매팅 순서가 비어 있습니다.';
      root.appendChild(emptyBox);

      if (!readonly) {
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.setAttribute('data-action', 'restore-default-order');
        restoreBtn.className = 'settings-btn prompt-editor-action';
        restoreBtn.textContent = '기본 순서 복원';
        restoreBtn.addEventListener('click', () => {
          structuralChange(defaultFormatingOrder().items);
        });
        root.appendChild(restoreBtn);
      }

      container.appendChild(root);
      return;
    }

    const list = document.createElement('div');
    list.className = 'prompt-order-list';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const tokenEl = document.createElement('div');
      tokenEl.setAttribute('data-order-token', '');
      tokenEl.setAttribute('data-token', item.token);
      tokenEl.className = 'order-token prompt-order-token' + (item.known ? '' : ' order-token-unknown');

      const label = document.createElement('span');
      label.className = 'prompt-order-label';
      label.textContent = item.token + (item.known ? '' : ' ⚠');
      tokenEl.appendChild(label);

      if (!readonly) {
        const actions = document.createElement('div');
        actions.className = 'prompt-order-actions';

        const upBtn = document.createElement('button');
        upBtn.setAttribute('data-action', 'move-up');
        upBtn.type = 'button';
        upBtn.className = 'settings-btn prompt-order-action';
        upBtn.textContent = '↑';
        upBtn.disabled = i === 0;
        upBtn.addEventListener('click', () => {
          const next = [...model.items];
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
          structuralChange(next);
        });
        actions.appendChild(upBtn);

        const downBtn = document.createElement('button');
        downBtn.setAttribute('data-action', 'move-down');
        downBtn.type = 'button';
        downBtn.className = 'settings-btn prompt-order-action';
        downBtn.textContent = '↓';
        downBtn.disabled = i === items.length - 1;
        downBtn.addEventListener('click', () => {
          const next = [...model.items];
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
          structuralChange(next);
        });
        actions.appendChild(downBtn);
        tokenEl.appendChild(actions);
      }

      list.appendChild(tokenEl);
    }

    root.appendChild(list);
    container.appendChild(root);
  }

  render();

  return {
    dispose(): void {
      container.innerHTML = '';
    },
  };
}
