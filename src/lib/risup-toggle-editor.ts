import Sortable from 'sortablejs';
import type { PromptEditorHandle } from './risup-prompt-editor';
import type { ToggleTemplateItem, ToggleTemplateItemType } from './risup-toggle-model';
import {
  appendToggleRootItems,
  buildToggleVisualNodes,
  moveToggleVisualNode,
  removeToggleVisualNode,
  moveToggleNodeToGroup,
  type ToggleVisualNode,
} from './risup-toggle-layout';
import {
  createToggleTemplateItem,
  parseCustomPromptTemplateToggle,
  serializeCustomPromptTemplateToggle,
} from './risup-toggle-model';
import { SHARED_OPTIONS } from './sidebar-dnd';

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

function getToggleItemSummary(item: ToggleTemplateItem): string {
  if (item.type === 'caption' || item.type === 'divider') return getToggleItemLabel(item);
  return item.type === 'groupEnd'
    ? 'group 종료'
    : `${getToggleItemKey(item) || item.type} ${getToggleItemLabel(item) ? `• ${getToggleItemLabel(item)}` : ''}`.trim();
}

function renderWithPreservedScroll(container: HTMLElement, renderContent: () => void): void {
  const scrollContainer = container.closest<HTMLElement>('.form-editor-body');
  const scrollTop = scrollContainer?.scrollTop ?? 0;
  const scrollLeft = scrollContainer?.scrollLeft ?? 0;
  renderContent();
  if (scrollContainer?.isConnected) {
    scrollContainer.scrollTop = scrollTop;
    scrollContainer.scrollLeft = scrollLeft;
  }
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
  const toggleSortables: Sortable[] = [];
  const collapsedGroups = new Set<ToggleTemplateItem>();

  function destroyToggleSortable(): void {
    for (const sortable of toggleSortables) sortable.destroy();
    toggleSortables.length = 0;
  }

  function updateRawValue(nextValue: string): void {
    model = parseCustomPromptTemplateToggle(nextValue);
    if (model.state === 'invalid') mode = 'raw';
    const visualButton = container.querySelector<HTMLButtonElement>('[data-action="show-visual-mode"]');
    if (visualButton) visualButton.disabled = model.state === 'invalid';
    if (onChange) onChange(nextValue);
  }

  function commitVisualItems(nextItems: ToggleTemplateItem[]): void {
    const nextValue = serializeCustomPromptTemplateToggle({ items: nextItems });
    model = {
      state: nextItems.length === 0 ? 'empty' : 'valid',
      items: nextItems,
      rawText: nextValue,
    };
    if (onChange) onChange(nextValue);
  }

  function structuralChange(newItems: ToggleTemplateItem[]): void {
    commitVisualItems(newItems);
    render();
  }

  function updateItem(
    index: number,
    updater: (item: ToggleTemplateItem) => ToggleTemplateItem,
    rerender = false,
  ): void {
    const next = [...model.items];
    const item = next[index];
    if (!item) return;
    next[index] = updater(item);
    if (collapsedGroups.delete(item)) collapsedGroups.add(next[index]);
    commitVisualItems(next);
    if (rerender) {
      render();
      return;
    }
    const summary = container.querySelector<HTMLElement>(
      `[data-toggle-index="${index}"] > .toggle-template-item-header > .prompt-editor-summary`,
    );
    if (summary && model.items[index]) summary.textContent = getToggleItemSummary(model.items[index]);
  }

  function renderItemFields(item: ToggleTemplateItem, index: number, wrapper: HTMLElement): void {
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

  const controlTypes: ToggleTemplateItemType[] = ['toggle', 'select', 'text', 'textarea'];
  const typeLabels: Partial<Record<ToggleTemplateItemType, string>> = {
    toggle: '토글',
    select: '선택 목록',
    text: '텍스트',
    textarea: '여러 줄 텍스트',
    divider: '구분선',
  };

  function makeAction(text: string, action: string, label: string, run: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-btn prompt-editor-action';
    button.dataset.action = action;
    button.textContent = text;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', run);
    return button;
  }

  function renderActions(node: ToggleVisualNode, siblings: ToggleVisualNode[], position: number): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'prompt-editor-actions';
    if (readonly) return actions;
    const visiblePositions = siblings.flatMap((entry, index) => (entry.kind === 'boundary' ? [] : [index]));
    const visibleIndex = visiblePositions.indexOf(position);
    const drag = makeAction(
      '↕',
      'drag-handle',
      node.kind === 'group' ? '그룹과 내부 항목 이동' : '항목과 캡션 이동',
      () => {},
    );
    drag.classList.add('toggle-template-drag-handle');
    actions.appendChild(drag);
    const up = makeAction('↑', 'move-up', '위로 이동', () => {
      structuralChange(moveToggleVisualNode(model.items, siblings, position, visiblePositions[visibleIndex - 1]));
    });
    up.disabled = visibleIndex === 0;
    const down = makeAction('↓', 'move-down', '아래로 이동', () => {
      structuralChange(moveToggleVisualNode(model.items, siblings, position, visiblePositions[visibleIndex + 1]));
    });
    down.disabled = visibleIndex === visiblePositions.length - 1;
    const remove = makeAction(
      '삭제',
      'remove-item',
      node.kind === 'group' ? '그룹과 내부 항목 삭제' : '항목과 연결된 캡션 삭제',
      () => {
        structuralChange(removeToggleVisualNode(model.items, siblings, position));
      },
    );
    actions.append(up, down, remove);
    return actions;
  }

  function renderCaptions(node: ToggleVisualNode, card: HTMLElement): void {
    const captions = document.createElement('div');
    captions.className = 'toggle-visual-captions';
    for (const index of node.captions) {
      const caption = model.items[index];
      const row = document.createElement('div');
      row.className = 'toggle-visual-caption';
      row.appendChild(makeFieldLabel('캡션'));
      const input = makeInput(
        getToggleItemLabel(caption),
        readonly,
        (value) => {
          updateItem(index, () => ({ type: 'caption', value: value || undefined }));
        },
        'toggle-caption',
      );
      input.setAttribute('aria-label', '항목 설명 캡션');
      input.dataset.captionIndex = String(index);
      row.appendChild(input);
      if (!readonly)
        row.appendChild(
          makeAction('✕', 'remove-caption', '캡션 삭제', () => {
            structuralChange(model.items.filter((_, itemIndex) => itemIndex !== index));
          }),
        );
      captions.appendChild(row);
    }
    if (!readonly) {
      const roots = buildToggleVisualNodes(model.items);
      const groups = roots.filter((entry) => entry.kind === 'group');
      if (groups.length) {
        const current = groups.find((entry) => entry.children.some((child) => child.start === node.start));
        const move = makeSelect(
          [
            { value: '', label: '그룹 없음' },
            ...groups.map((entry) => ({
              value: String(entry.start),
              label: getToggleItemLabel(model.items[entry.start]) || '이름 없는 그룹',
            })),
          ],
          current ? String(current.start) : '',
          false,
          (value) => {
            structuralChange(moveToggleNodeToGroup(model.items, node, value === '' ? null : Number(value)));
          },
          'toggle-parent-group',
        );
        move.setAttribute('aria-label', '항목을 다른 그룹으로 이동');
        captions.appendChild(makeFieldLabel('소속 그룹'));
        captions.appendChild(move);
      }
      captions.appendChild(
        makeAction('+ 캡션', 'add-caption', '이 항목 아래 캡션 추가', () => {
          const next = [...model.items];
          next.splice(node.end, 0, { type: 'caption', value: undefined });
          structuralChange(next);
          container
            .querySelector<HTMLInputElement>(`[data-caption-index="${node.end}"]`)
            ?.focus({ preventScroll: true });
        }),
      );
    }
    if (captions.childElementCount) card.appendChild(captions);
  }

  function renderVisualList(nodes: ToggleVisualNode[]): HTMLDivElement {
    const list = document.createElement('div');
    list.className = 'toggle-template-list toggle-visual-list';
    const visiblePositions = nodes.flatMap((node, index) => (node.kind === 'boundary' ? [] : [index]));
    nodes.forEach((node, position) => {
      if (node.kind === 'boundary') return;
      const item = model.items[node.start];
      const card = document.createElement('div');
      card.className = `prompt-editor-card toggle-template-item toggle-visual-${node.kind}`;
      card.dataset.toggleItem = '';
      card.dataset.toggleIndex = String(node.start);
      card.dataset.siblingIndex = String(position);
      if (!readonly) card.dataset.dndIdx = String(position);
      const header = document.createElement('div');
      header.className = 'prompt-editor-card-header toggle-template-item-header';
      const actions = renderActions(node, nodes, position);

      if (node.kind === 'group') {
        const body = document.createElement('div');
        body.className = 'toggle-visual-group-body';
        body.hidden = collapsedGroups.has(item);
        const collapse = makeAction(body.hidden ? '▶' : '▼', 'toggle-group', '그룹 펼치기/접기', () => {
          const current = model.items[node.start];
          body.hidden = !body.hidden;
          if (body.hidden) collapsedGroups.add(current);
          else collapsedGroups.delete(current);
          collapse.textContent = body.hidden ? '▶' : '▼';
          collapse.setAttribute('aria-expanded', String(!body.hidden));
        });
        collapse.setAttribute('aria-expanded', String(!body.hidden));
        const title = makeInput(
          getToggleItemLabel(item),
          readonly,
          (value) => {
            updateItem(node.start, () => ({ type: 'group', value: value || undefined }));
          },
          'toggle-group-name',
        );
        title.setAttribute('aria-label', '그룹 이름');
        title.classList.add('toggle-visual-group-name');
        const count = document.createElement('span');
        count.className = 'toggle-visual-group-count';
        count.textContent = `${node.children.length}개`;
        header.append(collapse, title, count, actions);
        body.appendChild(renderVisualList(node.children));
        if (!readonly) body.appendChild(renderAddBar(node));
        card.append(header, body);
      } else {
        if (node.kind === 'control') {
          const select = makeSelect(
            controlTypes.map((type) => ({ value: type, label: typeLabels[type]! })),
            item.type,
            readonly,
            (value) => {
              updateItem(
                node.start,
                (current) => convertToggleItemType(current, value as ToggleTemplateItemType),
                true,
              );
            },
            'toggle-type',
          );
          select.classList.add('toggle-template-item-type');
          header.appendChild(select);
        } else {
          const label = document.createElement('span');
          label.textContent = node.kind === 'divider' ? '구분선' : '독립 캡션';
          header.appendChild(label);
        }
        const summary = document.createElement('div');
        summary.className = 'prompt-editor-summary';
        summary.textContent = getToggleItemSummary(item);
        header.append(summary, actions);
        card.appendChild(header);
        if (node.kind === 'divider') card.appendChild(document.createElement('hr'));
        renderItemFields(item, node.start, card);
        if (node.kind === 'control') renderCaptions(node, card);
      }
      list.appendChild(card);
    });
    if (!readonly && visiblePositions.length > 1) {
      toggleSortables.push(
        Sortable.create(list, {
          ...SHARED_OPTIONS,
          draggable: '> [data-toggle-item]',
          handle: '.toggle-template-drag-handle',
          onEnd: (event) => {
            if (event.newIndex == null || event.oldIndex === event.newIndex) return;
            const from = Number(event.item.dataset.siblingIndex);
            structuralChange(moveToggleVisualNode(model.items, nodes, from, visiblePositions[event.newIndex]));
          },
        }),
      );
    }
    return list;
  }

  function renderAddBar(group?: ToggleVisualNode): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'toggle-template-addbar toggle-visual-addbar';
    let selectedType = newItemType;
    const select = makeSelect(
      [...controlTypes, 'divider' as const].map((type) => ({ value: type, label: typeLabels[type]! })),
      selectedType,
      false,
      (value) => {
        selectedType = value as ToggleTemplateItemType;
        newItemType = selectedType;
      },
      'new-toggle-item-type',
    );
    select.setAttribute('aria-label', '추가할 항목 종류');
    const add = makeAction(
      group ? '+ 그룹 안에 추가' : '+ 항목 추가',
      'add-toggle-item',
      group ? '그룹 안에 항목 추가' : '최상위 항목 추가',
      () => {
        const added = createToggleTemplateItem(selectedType);
        if (group) {
          const next = [...model.items];
          next.splice(group.end - (group.closed ? 1 : 0), 0, added);
          structuralChange(next);
        } else structuralChange(appendToggleRootItems(model.items, [added]));
      },
    );
    bar.append(select, add);
    if (!group)
      bar.appendChild(
        makeAction('+ 그룹', 'add-toggle-group', '새 그룹 추가', () => {
          structuralChange(
            appendToggleRootItems(model.items, [createToggleTemplateItem('group'), { type: 'groupEnd' }]),
          );
        }),
      );
    return bar;
  }

  function render(): void {
    renderWithPreservedScroll(container, renderContent);
  }

  function renderContent(): void {
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

    const nodes = buildToggleVisualNodes(model.items);
    if (nodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prompt-editor-message toggle-template-empty';
      empty.textContent = '항목이나 그룹을 추가해 커스텀 토글을 구성하세요.';
      root.appendChild(empty);
    }
    root.appendChild(renderVisualList(nodes));
    if (!readonly) root.appendChild(renderAddBar());
    container.appendChild(root);
  }
  render();

  return {
    dispose(): void {
      destroyToggleSortable();
      container.innerHTML = '';
    },
  };
}
