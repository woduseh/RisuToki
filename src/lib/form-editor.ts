import { ensureBlueArchiveMonacoTheme } from './monaco-loader';
import { defineDarkMonacoTheme } from './dark-mode';
import { NON_MONACO_EDITOR_TAB_TYPES } from './editor-activation';
import { getFolderRef, normalizeFolderRef, resolveLorebookFolderRef } from './lorebook-folders';
import { getRisupFieldGroup } from './risup-fields';
import { coerceRisupInputValue, validateRisupDraftFields, type RisupFormTabInfo } from './risup-form-editor';
import { createFormatingOrderEditor, createPromptTemplateEditor } from './risup-prompt-editor';
import {
  coerceTriggerFormInputValue,
  getTriggerFormValidationMessage,
  resolveTriggerDetailState,
  updateTriggerFormLuaEffectCode,
  updateTriggerFormScalarField,
  type TriggerFormTabInfo,
} from './trigger-form-editor';
import { parseTriggerScriptsText, serializeTriggerScriptModel, type TriggerScriptModel } from './trigger-script-model';

type MonacoWindow = Window & {
  _baDarkThemeDefined?: boolean;
  monaco?: {
    editor: {
      create: (container: HTMLElement, options: Record<string, unknown>) => MonacoEditor;
    };
  };
};

interface MonacoEditor {
  dispose: () => void;
  getValue: () => string;
  getDomNode: () => HTMLElement | null;
  layout: () => void;
  updateOptions: (options: Record<string, unknown>) => void;
  onDidChangeModelContent: (cb: () => void) => void;
}

interface FallbackEditor {
  dispose: () => void;
  getValue: () => string;
  updateOptions: (options: Record<string, unknown>) => void;
}

type FormEditor = MonacoEditor | FallbackEditor;

// ── Tab-like interface used by showLoreEditor / showRegexEditor ──

export interface FormTabInfo {
  id: string;
  label: string;
  language: string;
  getValue: () => unknown;
  setValue?: ((data: unknown) => void) | null;
  _lastValue?: string | null;
  _refLorebook?: Record<string, unknown>[];
}

export interface TriggerScriptsFormTabOptions {
  getText: () => string;
  id?: string;
  label?: string;
  selectedIndex?: number;
  setText?: ((text: string) => void) | null;
}

export interface TriggerScriptsFormTabManagerLike {
  openTabs: Array<Pick<TriggerFormTabInfo, 'id'> & Partial<TriggerFormTabInfo>>;
  openTab: (
    id: string,
    label: string,
    language: string,
    getValue: () => unknown,
    setValue: ((value: unknown) => void) | null,
  ) => TriggerFormTabInfo;
}

export function createTriggerScriptsFormTab(options: TriggerScriptsFormTabOptions): TriggerFormTabInfo {
  return {
    id: options.id || 'triggerScripts',
    label: options.label || '트리거 스크립트',
    language: '_triggerform',
    getValue: () => parseTriggerScriptsText(options.getText() || '[]'),
    setValue: options.setText
      ? (data: unknown) => {
          options.setText!(serializeTriggerScriptModel(data as Pick<TriggerScriptModel, 'triggers'>));
        }
      : null,
    _triggerSelectedIndex: options.selectedIndex,
  };
}

export function openTriggerScriptsFormTab(
  tabMgr: TriggerScriptsFormTabManagerLike,
  options: Omit<TriggerScriptsFormTabOptions, 'selectedIndex'>,
): TriggerFormTabInfo {
  const tabId = options.id || 'triggerScripts';
  const existingTab = tabMgr.openTabs.find((tab) => tab.id === tabId);
  const tabState = createTriggerScriptsFormTab({
    ...options,
    selectedIndex:
      typeof existingTab?._triggerSelectedIndex === 'number' ? existingTab._triggerSelectedIndex : undefined,
  });
  const tab = tabMgr.openTab(
    tabState.id,
    tabState.label,
    tabState.language,
    tabState.getValue,
    tabState.setValue ?? null,
  );
  tab._triggerSelectedIndex = tabState._triggerSelectedIndex;
  return tab;
}

// ── Dependency-injection interface ──

export interface FormEditorDeps {
  isMonacoReady: () => boolean;
  isDarkMode: () => boolean;
  getEditorInstance: () => MonacoEditor | null;
  setEditorInstance: (ed: MonacoEditor | null) => void;
  getFileData: () => Record<string, unknown> | null;
  tabMgr: {
    activeTabId: string | null;
    openTabs: FormTabInfo[];
    dirtyFields: Set<string>;
    renderTabs: () => void;
    markDirtyForTabId: (tabId: string) => void;
  };
  createBackup: (id: string, data: unknown) => void;
  showPrompt: (msg: string, defaultVal?: string) => Promise<string | null>;
  buildSidebar: () => void;
}

// ── Module state ──

let formEditors: FormEditor[] = [];
let deps: FormEditorDeps | null = null;

// IME composition guard — skip renderTabs() during CJK composition
let formComposing = false;
let formPendingRenderTabs = false;

// ── Public API ──

export function initFormEditor(d: FormEditorDeps): void {
  deps = d;
}

export function disposeFormEditors(): void {
  for (const ed of formEditors) {
    try {
      ed.dispose();
    } catch (error) {
      console.warn('[Editor] Failed to dispose form editor:', error);
    }
  }
  formEditors = [];
}

export function getFormEditors(): FormEditor[] {
  return formEditors;
}

// ── Mini Monaco factory ──

export function createMiniMonaco(
  container: HTMLElement,
  value: string,
  language: string,
  onChange: ((val: string) => void) | null,
): FormEditor {
  const d = deps!;
  const win = window as unknown as MonacoWindow;

  if (!d.isMonacoReady()) {
    const textarea = document.createElement('textarea');
    textarea.className = 'settings-textarea form-monaco-fallback';
    textarea.value = value || '';
    textarea.readOnly = !onChange;
    textarea.style.width = '100%';
    textarea.style.height = '100%';
    textarea.style.minHeight = 'inherit';
    textarea.style.margin = '0';
    textarea.style.border = 'none';
    textarea.style.borderRadius = '0';
    textarea.style.resize = 'none';
    container.replaceChildren(textarea);

    const handleInput = () => {
      if (onChange) onChange(textarea.value);
    };
    if (onChange) {
      textarea.addEventListener('input', handleInput);
    }

    const fallbackEditor: FallbackEditor = {
      dispose() {
        if (onChange) {
          textarea.removeEventListener('input', handleInput);
        }
        textarea.remove();
      },
      getValue() {
        return textarea.value;
      },
      updateOptions(options: Record<string, unknown>) {
        if (options && Object.prototype.hasOwnProperty.call(options, 'readOnly')) {
          textarea.readOnly = !!options.readOnly;
        }
      },
    };
    formEditors.push(fallbackEditor);
    return fallbackEditor;
  }

  ensureBlueArchiveMonacoTheme();
  if (d.isDarkMode() && !win._baDarkThemeDefined) {
    defineDarkMonacoTheme();
  }

  try {
    const ed = win.monaco!.editor.create(container, {
      value: value || '',
      language: language,
      theme: d.isDarkMode() ? 'blue-archive-dark' : 'blue-archive',
      fontSize: 13,
      minimap: { enabled: false },
      wordWrap: 'on',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      lineNumbers: 'off',
      glyphMargin: false,
      folding: false,
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollbar: { vertical: 'auto', horizontal: 'auto' },
      tabSize: 2,
    });

    // Track IME composition to avoid DOM-heavy side effects during CJK input
    const domNode = ed.getDomNode?.();
    if (domNode) {
      domNode.addEventListener('compositionstart', () => {
        formComposing = true;
      });
      domNode.addEventListener('compositionend', () => {
        formComposing = false;
        if (formPendingRenderTabs) {
          formPendingRenderTabs = false;
          d.tabMgr.renderTabs();
        }
      });
    }

    ed.onDidChangeModelContent(() => {
      if (onChange) onChange(ed.getValue());
    });

    formEditors.push(ed);
    return ed;
  } catch (error) {
    console.error('[Editor] Failed to create mini Monaco, falling back to textarea:', error);
    return createMiniMonaco(container, value, language, onChange);
  }
}

// ── Helpers shared by both editors ──

function saveCurrentMonacoState(tabInfo: FormTabInfo): void {
  const d = deps!;
  const editorInstance = d.getEditorInstance();
  if (editorInstance && d.tabMgr.activeTabId !== tabInfo.id) {
    const curTab = d.tabMgr.openTabs.find((t) => t.id === d.tabMgr.activeTabId);
    if (curTab && !NON_MONACO_EDITOR_TAB_TYPES.has(curTab.language) && curTab.setValue) {
      curTab._lastValue = editorInstance.getValue();
      curTab.setValue(curTab._lastValue);
    }
  }
}

function clearEditorContainer(): HTMLElement {
  const d = deps!;
  disposeFormEditors();
  const container = document.getElementById('editor-container')!;
  container.innerHTML = '';
  const editorInstance = d.getEditorInstance();
  if (editorInstance) {
    editorInstance.dispose();
    d.setEditorInstance(null);
  }
  return container;
}

type DirtyCallback = () => void;

function buildMarkDirty(tabInfo: FormTabInfo, data: Record<string, unknown>): DirtyCallback {
  const d = deps!;
  const readonly = !tabInfo.setValue;
  return () => {
    if (readonly) return;
    if (!d.tabMgr.dirtyFields.has(tabInfo.id)) {
      d.createBackup(tabInfo.id, data);
    }
    tabInfo.setValue!(data);
    // Mark both tab ID and parent field dirty (e.g. regex_0 + regex)
    d.tabMgr.markDirtyForTabId(tabInfo.id);
    // Defer renderTabs during IME composition to prevent double-backspace
    if (formComposing) {
      formPendingRenderTabs = true;
    } else {
      d.tabMgr.renderTabs();
    }
  };
}

// ── Lorebook form editor ──

export function showLoreEditor(tabInfo: FormTabInfo): void {
  const d = deps!;
  saveCurrentMonacoState(tabInfo);
  const container = clearEditorContainer();

  const rawData = tabInfo.getValue();
  if (!rawData) return;
  const data = rawData as Record<string, unknown>;

  const readonly = !tabInfo.setValue;
  const markDirty = buildMarkDirty(tabInfo, data);

  // Build form HTML
  const form = document.createElement('div');
  form.className = 'form-editor';

  // Header
  const header = document.createElement('div');
  header.className = 'form-editor-header';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = `📚 로어북: ${(data.comment as string) || tabInfo.label}`;
  header.appendChild(headerTitle);
  if (readonly) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:10px;color:var(--accent);margin-left:8px;';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  // Body
  const body = document.createElement('div');
  body.className = 'form-editor-body';

  // Helper: create text input row
  function addTextRow(labelText: string, field: string): HTMLInputElement {
    const row = document.createElement('div');
    row.className = 'form-row';
    const lbl = document.createElement('span');
    lbl.className = 'form-label';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.className = 'form-input';
    input.type = 'text';
    input.value = (data[field] as string) || '';
    if (readonly) {
      input.readOnly = true;
    } else {
      input.addEventListener('input', () => {
        data[field] = input.value;
        markDirty();
      });
    }
    row.appendChild(lbl);
    row.appendChild(input);
    body.appendChild(row);
    return input;
  }

  const nameInput = addTextRow('이름', 'comment');
  // Update tab label live when name changes
  if (!readonly) {
    nameInput.addEventListener('input', () => {
      tabInfo.label = nameInput.value || tabInfo.id;
    });
  }

  // Folder dropdown (show folder names, not UUIDs)
  const folderRow = document.createElement('div');
  folderRow.className = 'form-row';
  const folderLbl = document.createElement('span');
  folderLbl.className = 'form-label';
  folderLbl.textContent = '폴더';
  const folderSelect = document.createElement('select');
  folderSelect.className = 'form-select';
  folderSelect.style.flex = '1';
  if (readonly) folderSelect.disabled = true;

  // Build folder options from lorebook (use ref source if readonly)
  const refLore = tabInfo._refLorebook;
  const fileData = d.getFileData();
  const loreSource = (refLore ||
    (fileData ? ((fileData as Record<string, unknown>).lorebook as Record<string, unknown>[]) : []) ||
    []) as Record<string, unknown>[];
  const folderEntries = loreSource.map((e, i) => ({ entry: e, index: i })).filter((f) => f.entry.mode === 'folder');

  // "(없음)" = root
  const optNone = document.createElement('option');
  optNone.value = '';
  optNone.textContent = '(없음)';
  folderSelect.appendChild(optNone);

  // "+ 새 폴더 추가" (바로 아래)
  const optNew = document.createElement('option');
  optNew.value = '__new__';
  optNew.textContent = '+ 새 폴더 추가';
  folderSelect.appendChild(optNew);

  // Existing folders
  for (const f of folderEntries) {
    const folderId = getFolderRef(f.entry);
    if (!folderId) continue;
    const opt = document.createElement('option');
    opt.value = folderId;
    opt.textContent = (f.entry.comment as string) || folderId;
    folderSelect.appendChild(opt);
  }

  // Select current value
  const selectedFolder = resolveLorebookFolderRef(data.folder, loreSource);
  if (selectedFolder) {
    for (const opt of folderSelect.options) {
      if (opt.value === selectedFolder) {
        opt.selected = true;
        break;
      }
    }
  }

  folderSelect.addEventListener('change', async () => {
    if (folderSelect.value === '__new__') {
      const name = await d.showPrompt('새 폴더 이름을 입력하세요', '새 폴더');
      if (!name) {
        // Revert to previous selection
        folderSelect.value = resolveLorebookFolderRef(data.folder, loreSource);
        return;
      }
      const folderId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const newFolder = {
        key: normalizeFolderRef(folderId),
        content: '',
        comment: name,
        mode: 'folder',
        insertorder: 100,
        alwaysActive: false,
        forceActivation: false,
        selective: false,
        secondkey: '',
        constant: false,
        order: (fileData as Record<string, unknown> & { lorebook: unknown[] }).lorebook.length,
        folder: '',
      };
      ((fileData as Record<string, unknown>).lorebook as unknown[]).push(newFolder);
      // Add new option before the "+ 새 폴더" option
      const newOpt = document.createElement('option');
      newOpt.value = normalizeFolderRef(folderId);
      newOpt.textContent = name;
      folderSelect.insertBefore(newOpt, optNew);
      folderSelect.value = normalizeFolderRef(folderId);
      data.folder = normalizeFolderRef(folderId);
      markDirty();
      d.buildSidebar();
    } else {
      data.folder = normalizeFolderRef(folderSelect.value);
      markDirty();
    }
  });

  folderRow.appendChild(folderLbl);
  folderRow.appendChild(folderSelect);
  body.appendChild(folderRow);

  addTextRow('활성화 키', 'key');
  addTextRow('멀티플 키', 'secondkey');

  // Insert order row
  const orderRow = document.createElement('div');
  orderRow.className = 'form-row';
  const orderLbl = document.createElement('span');
  orderLbl.className = 'form-label';
  orderLbl.textContent = '배치 순서';
  const orderInput = document.createElement('input');
  orderInput.className = 'form-input form-number';
  orderInput.type = 'number';
  orderInput.value = String(data.insertorder ?? 100);
  if (readonly) {
    orderInput.readOnly = true;
  } else {
    orderInput.addEventListener('input', () => {
      data.insertorder = parseInt(orderInput.value, 10) || 0;
      markDirty();
    });
  }
  orderRow.appendChild(orderLbl);
  orderRow.appendChild(orderInput);
  body.appendChild(orderRow);

  // Checkboxes row
  const checks = document.createElement('div');
  checks.className = 'form-checks';

  function addCheck(labelText: string, field: string): void {
    const item = document.createElement('label');
    item.className = 'form-check-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!data[field];
    if (readonly) {
      cb.disabled = true;
    } else {
      cb.addEventListener('change', () => {
        data[field] = cb.checked;
        markDirty();
      });
    }
    item.appendChild(cb);
    item.appendChild(document.createTextNode(labelText));
    checks.appendChild(item);
  }

  addCheck('언제나 활성화', 'alwaysActive');
  addCheck('강제 활성화', 'forceActivation');
  addCheck('선택적', 'selective');
  body.appendChild(checks);

  // Content label
  const contentLabel = document.createElement('div');
  contentLabel.className = 'form-section-label';
  contentLabel.textContent = '프롬프트 (content)';
  body.appendChild(contentLabel);

  // Mini Monaco for content
  const monacoContainer = document.createElement('div');
  monacoContainer.className = 'form-monaco form-monaco-lore';
  body.appendChild(monacoContainer);

  form.appendChild(header);
  form.appendChild(body);
  container.appendChild(form);

  // Create mini Monaco after DOM insertion
  setTimeout(() => {
    const ed = createMiniMonaco(
      monacoContainer,
      (data.content as string) || '',
      'plaintext',
      readonly
        ? null
        : (val) => {
            data.content = val;
            markDirty();
          },
    );
    if (ed && readonly) ed.updateOptions({ readOnly: true });
  }, 10);
}

// ── Risup form editor ──

export function showRisupEditor(tabInfo: RisupFormTabInfo): void {
  saveCurrentMonacoState(tabInfo);
  const container = clearEditorContainer();

  const rawData = tabInfo.getValue();
  const groupId =
    tabInfo._risupGroupId || (tabInfo.id.startsWith('risup_') ? tabInfo.id.replace('risup_', '') : undefined);
  const group = groupId ? getRisupFieldGroup(groupId) : null;
  if (!rawData || !group) return;
  const data = rawData as Record<string, unknown>;
  const groupFields = group.fields;

  const readonly = !tabInfo.setValue;
  const markDirty = buildMarkDirty(tabInfo, data);

  const form = document.createElement('div');
  form.className = 'form-editor';

  const header = document.createElement('div');
  header.className = 'form-editor-header';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = `${group.icon} 프리셋: ${group.label}`;
  header.appendChild(headerTitle);
  if (readonly) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:10px;color:var(--accent);margin-left:8px;';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  const body = document.createElement('div');
  body.className = 'form-editor-body';

  const validationBox = document.createElement('div');
  validationBox.style.cssText =
    'display:none;margin-bottom:10px;padding:8px 10px;border:1px solid #d97706;border-radius:6px;background:rgba(217,119,6,0.08);color:#b45309;font-size:12px;white-space:pre-wrap;';
  body.appendChild(validationBox);

  function updateValidation(): void {
    const groupFieldIds = new Set(groupFields.map((field) => field.id));
    const errors = validateRisupDraftFields(data).filter((error) => groupFieldIds.has(error.field));
    if (errors.length === 0) {
      validationBox.style.display = 'none';
      validationBox.textContent = '';
      return;
    }
    validationBox.style.display = '';
    validationBox.textContent = errors.map((error) => error.message).join('\n');
  }

  function applyFieldChange(fieldId: string, nextValue: unknown): void {
    data[fieldId] = nextValue;
    markDirty();
    updateValidation();
  }

  for (const field of groupFields) {
    if (field.editor === 'prompt-template') {
      const label = document.createElement('div');
      label.className = 'form-section-label';
      label.textContent = field.label;
      body.appendChild(label);
      const editorContainer = document.createElement('div');
      editorContainer.className = 'form-embedded-editor prompt-template-editor-container';
      body.appendChild(editorContainer);
      createPromptTemplateEditor(
        editorContainer,
        typeof data[field.id] === 'string' ? (data[field.id] as string) : '',
        readonly
          ? null
          : (value) => {
              applyFieldChange(field.id, value);
            },
      );
      continue;
    }

    if (field.editor === 'formating-order') {
      const label = document.createElement('div');
      label.className = 'form-section-label';
      label.textContent = field.label;
      body.appendChild(label);
      const editorContainer = document.createElement('div');
      editorContainer.className = 'form-embedded-editor formating-order-editor-container';
      body.appendChild(editorContainer);
      createFormatingOrderEditor(
        editorContainer,
        typeof data[field.id] === 'string' ? (data[field.id] as string) : '',
        readonly
          ? null
          : (value) => {
              applyFieldChange(field.id, value);
            },
      );
      continue;
    }

    if (field.editor === 'textarea' || field.editor === 'json') {
      const label = document.createElement('div');
      label.className = 'form-section-label';
      label.textContent = field.label;
      body.appendChild(label);

      const textarea = document.createElement('textarea');
      textarea.className = 'settings-textarea form-monaco-fallback';
      textarea.value = typeof data[field.id] === 'string' ? (data[field.id] as string) : '';
      textarea.readOnly = readonly;
      textarea.rows = field.rows || 6;
      textarea.style.width = '100%';
      textarea.style.minHeight = `${Math.max(140, textarea.rows * 18)}px`;
      textarea.style.marginBottom = '10px';
      textarea.spellcheck = false;
      if (!readonly) {
        textarea.addEventListener('input', () => {
          applyFieldChange(field.id, textarea.value);
        });
      }
      body.appendChild(textarea);
      continue;
    }

    if (field.editor === 'checkbox') {
      const row = document.createElement('label');
      row.className = 'form-check-item';
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!data[field.id];
      input.disabled = readonly;
      if (!readonly) {
        input.addEventListener('change', () => {
          applyFieldChange(field.id, coerceRisupInputValue(field.editor, input.checked));
        });
      }
      row.appendChild(input);
      row.appendChild(document.createTextNode(field.label));
      body.appendChild(row);
      continue;
    }

    const row = document.createElement('div');
    row.className = 'form-row';
    const label = document.createElement('span');
    label.className = 'form-label';
    label.textContent = field.label;
    const input = document.createElement('input');
    input.className = 'form-input' + (field.editor === 'number' ? ' form-number' : '');
    input.type = field.editor === 'number' ? 'number' : 'text';
    input.value =
      field.editor === 'number'
        ? data[field.id] == null
          ? ''
          : String(data[field.id])
        : typeof data[field.id] === 'string'
          ? (data[field.id] as string)
          : '';
    if (field.step) input.step = field.step;
    if (field.placeholder) input.placeholder = field.placeholder;
    if (readonly) {
      input.readOnly = true;
    } else {
      input.addEventListener('input', () => {
        if (field.editor === 'number') {
          if (!input.value.trim()) {
            delete data[field.id];
            markDirty();
            updateValidation();
            return;
          }
          const nextValue = coerceRisupInputValue(field.editor, input.value);
          if (nextValue !== undefined) {
            applyFieldChange(field.id, nextValue);
          }
          return;
        }
        applyFieldChange(field.id, coerceRisupInputValue(field.editor, input.value));
      });
    }
    row.appendChild(label);
    row.appendChild(input);
    body.appendChild(row);
  }

  updateValidation();

  form.appendChild(header);
  form.appendChild(body);
  container.appendChild(form);
}

const TRIGGER_TYPE_OPTIONS = [
  { value: '', label: '(비어 있음)' },
  { value: 'start', label: '시작 (start)' },
  { value: 'input', label: '입력 (input)' },
  { value: 'output', label: '출력 (output)' },
  { value: 'display', label: '표시 (display)' },
  { value: 'request', label: '요청 (request)' },
  { value: 'manual', label: '수동 (manual)' },
];

export function showTriggerEditor(tabInfo: TriggerFormTabInfo): void {
  saveCurrentMonacoState(tabInfo);
  const container = clearEditorContainer();

  const rawData = tabInfo.getValue();
  if (!rawData) return;
  const data = rawData as TriggerScriptModel;

  const readonly = !tabInfo.setValue;
  const markDirty = buildMarkDirty(tabInfo, data as unknown as Record<string, unknown>);

  const form = document.createElement('div');
  form.className = 'form-editor';

  const header = document.createElement('div');
  header.className = 'form-editor-header';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = `🧩 트리거: ${data.triggers.length}개`;
  header.appendChild(headerTitle);
  if (readonly) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:10px;color:var(--accent);margin-left:8px;';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  const body = document.createElement('div');
  body.className = 'form-editor-body';

  const validationBox = document.createElement('div');
  validationBox.style.cssText =
    'display:none;margin-bottom:10px;padding:8px 10px;border:1px solid #d97706;border-radius:6px;background:rgba(217,119,6,0.08);color:#b45309;font-size:12px;white-space:pre-wrap;';
  body.appendChild(validationBox);

  const layout = document.createElement('div');
  layout.style.cssText =
    'display:grid;grid-template-columns:minmax(220px,260px) minmax(0,1fr);gap:12px;align-items:start;';

  const listPanel = document.createElement('div');
  listPanel.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  const detailPanel = document.createElement('div');
  detailPanel.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

  function updateValidation(): void {
    const message = getTriggerFormValidationMessage(data);
    if (!message) {
      validationBox.style.display = 'none';
      validationBox.textContent = '';
      return;
    }
    validationBox.style.display = '';
    validationBox.textContent = message;
  }

  function notifyChange(): void {
    markDirty();
    updateValidation();
  }

  function renderTriggerList(selectedIndex: number): void {
    const detailState = resolveTriggerDetailState(data, selectedIndex);
    listPanel.innerHTML = '';

    const listLabel = document.createElement('div');
    listLabel.className = 'form-section-label';
    listLabel.textContent = '트리거 목록';
    listPanel.appendChild(listLabel);

    if (detailState.items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'padding:12px;border:1px dashed rgba(255,255,255,0.15);border-radius:8px;color:var(--text-soft);font-size:12px;';
      empty.textContent = '편집할 트리거가 없습니다.';
      listPanel.appendChild(empty);
      return;
    }

    detailState.items.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'regex-flags-toggle-btn';
      button.style.cssText =
        'display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:10px 12px;text-align:left;border:1px solid rgba(255,255,255,0.08);border-radius:8px;background:rgba(255,255,255,0.02);';
      if (item.index === detailState.selectedIndex) {
        button.style.borderColor = 'var(--accent)';
        button.style.background = 'rgba(78,161,255,0.12)';
      }
      const title = document.createElement('strong');
      title.textContent = item.label;
      const meta = document.createElement('span');
      meta.style.cssText = 'font-size:11px;color:var(--text-soft);';
      meta.textContent = `${item.type || '(type 없음)'} · 조건 ${item.conditionCount}개 · 효과 ${item.effectCount}개`;
      button.appendChild(title);
      button.appendChild(meta);
      if (!item.supported) {
        const unsupported = document.createElement('span');
        unsupported.style.cssText = 'font-size:11px;color:#f59e0b;';
        unsupported.textContent = '지원되지 않는 항목 포함';
        button.appendChild(unsupported);
      }
      button.addEventListener('click', () => {
        tabInfo._triggerSelectedIndex = item.index;
        renderTriggerDetail();
      });
      listPanel.appendChild(button);
    });
  }

  function renderTextRow(
    parent: HTMLElement,
    labelText: string,
    value: string,
    readonlyField: boolean,
    onChange: ((nextValue: string) => void) | null,
  ): HTMLInputElement {
    const row = document.createElement('div');
    row.className = 'form-row';
    const label = document.createElement('span');
    label.className = 'form-label';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.className = 'form-input';
    input.type = 'text';
    input.value = value;
    input.readOnly = readonlyField;
    if (!readonlyField && onChange) {
      input.addEventListener('input', () => {
        onChange(String(coerceTriggerFormInputValue('text', input.value)));
      });
    }
    row.appendChild(label);
    row.appendChild(input);
    parent.appendChild(row);
    return input;
  }

  function renderTriggerDetail(): void {
    const detailState = resolveTriggerDetailState(data, tabInfo._triggerSelectedIndex);
    tabInfo._triggerSelectedIndex = detailState.selectedIndex;
    renderTriggerList(detailState.selectedIndex);

    detailPanel.innerHTML = '';

    const detailLabel = document.createElement('div');
    detailLabel.className = 'form-section-label';
    detailLabel.textContent = '트리거 상세';
    detailPanel.appendChild(detailLabel);

    if (!detailState.selectedTrigger) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'padding:12px;border:1px dashed rgba(255,255,255,0.15);border-radius:8px;color:var(--text-soft);font-size:12px;';
      empty.textContent = '선택된 트리거가 없습니다.';
      detailPanel.appendChild(empty);
      return;
    }

    const trigger = detailState.selectedTrigger;

    renderTextRow(detailPanel, '이름', trigger.comment, readonly, (nextValue) => {
      updateTriggerFormScalarField(trigger, 'comment', nextValue);
      renderTriggerList(tabInfo._triggerSelectedIndex ?? 0);
      notifyChange();
    });

    const typeRow = document.createElement('div');
    typeRow.className = 'form-row';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'form-label';
    typeLabel.textContent = '타입';
    const typeSelect = document.createElement('select');
    typeSelect.className = 'form-select';
    typeSelect.disabled = readonly;
    const knownTypeValues = new Set(TRIGGER_TYPE_OPTIONS.map((option) => option.value));
    const typeOptions =
      trigger.type && !knownTypeValues.has(trigger.type)
        ? [{ value: trigger.type, label: `${trigger.type} (custom)` }, ...TRIGGER_TYPE_OPTIONS]
        : TRIGGER_TYPE_OPTIONS;
    typeOptions.forEach((option) => {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      element.selected = option.value === trigger.type;
      typeSelect.appendChild(element);
    });
    if (!readonly) {
      typeSelect.addEventListener('change', () => {
        const nextValue = coerceTriggerFormInputValue('select', typeSelect.value);
        if (typeof nextValue === 'string') {
          updateTriggerFormScalarField(trigger, 'type', nextValue);
          renderTriggerList(tabInfo._triggerSelectedIndex ?? 0);
          notifyChange();
        }
      });
    }
    typeRow.appendChild(typeLabel);
    typeRow.appendChild(typeSelect);
    detailPanel.appendChild(typeRow);

    const accessRow = document.createElement('label');
    accessRow.className = 'form-check-item';
    accessRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const accessCheckbox = document.createElement('input');
    accessCheckbox.type = 'checkbox';
    accessCheckbox.checked = trigger.lowLevelAccess;
    accessCheckbox.disabled = readonly;
    if (!readonly) {
      accessCheckbox.addEventListener('change', () => {
        updateTriggerFormScalarField(
          trigger,
          'lowLevelAccess',
          Boolean(coerceTriggerFormInputValue('checkbox', accessCheckbox.checked)),
        );
        notifyChange();
      });
    }
    accessRow.appendChild(accessCheckbox);
    accessRow.appendChild(document.createTextNode('저수준 접근 활성화'));
    detailPanel.appendChild(accessRow);

    const stats = document.createElement('div');
    stats.style.cssText = 'font-size:12px;color:var(--text-soft);';
    stats.textContent = `조건 ${trigger.conditions.length}개 · 효과 ${trigger.effects.length}개`;
    detailPanel.appendChild(stats);

    const luaEffect = trigger.effects.find((effect) => effect.supported && effect.type === 'triggerlua');
    if (luaEffect) {
      const codeLabel = document.createElement('div');
      codeLabel.className = 'form-section-label';
      codeLabel.textContent = 'Lua 코드';
      detailPanel.appendChild(codeLabel);

      const codeInput = document.createElement('textarea');
      codeInput.className = 'settings-textarea form-monaco-fallback';
      codeInput.value = luaEffect.code || '';
      codeInput.readOnly = readonly;
      codeInput.rows = 10;
      codeInput.style.width = '100%';
      codeInput.style.minHeight = '200px';
      codeInput.spellcheck = false;
      if (!readonly) {
        codeInput.addEventListener('input', () => {
          updateTriggerFormLuaEffectCode(
            trigger,
            luaEffect,
            String(coerceTriggerFormInputValue('text', codeInput.value)),
          );
          notifyChange();
        });
      }
      detailPanel.appendChild(codeInput);
    } else {
      const info = document.createElement('div');
      info.style.cssText =
        'padding:10px;border:1px dashed rgba(255,255,255,0.15);border-radius:8px;color:var(--text-soft);font-size:12px;';
      info.textContent = '이 트리거에는 폼에서 직접 편집 가능한 triggerlua 효과가 없습니다.';
      detailPanel.appendChild(info);
    }
  }

  updateValidation();
  renderTriggerDetail();

  layout.appendChild(listPanel);
  layout.appendChild(detailPanel);
  body.appendChild(layout);

  form.appendChild(header);
  form.appendChild(body);
  container.appendChild(form);
}

// ── Regex form editor ──

export function showRegexEditor(tabInfo: FormTabInfo): void {
  saveCurrentMonacoState(tabInfo);
  const container = clearEditorContainer();

  const rawData = tabInfo.getValue();
  if (!rawData) return;
  const data = rawData as Record<string, unknown>;

  const readonly = !tabInfo.setValue;
  const markDirty = buildMarkDirty(tabInfo, data);

  // Build form
  const form = document.createElement('div');
  form.className = 'form-editor';

  // Header
  const header = document.createElement('div');
  header.className = 'form-editor-header';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = `⚡ 정규식: ${(data.comment as string) || tabInfo.label}`;
  header.appendChild(headerTitle);
  if (readonly) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:10px;color:var(--accent);margin-left:8px;';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  // Toggle (ableFlag)
  const toggle = document.createElement('div');
  toggle.className = 'form-toggle' + (data.ableFlag !== false ? ' active' : '');
  toggle.title = '활성화 토글';
  if (!readonly) {
    toggle.addEventListener('click', () => {
      data.ableFlag = !toggle.classList.contains('active');
      toggle.classList.toggle('active');
      markDirty();
    });
  }
  header.appendChild(toggle);

  // Body
  const body = document.createElement('div');
  body.className = 'form-editor-body';

  // Name
  const nameRow = document.createElement('div');
  nameRow.className = 'form-row';
  const nameLbl = document.createElement('span');
  nameLbl.className = 'form-label';
  nameLbl.textContent = '이름';
  const nameInput = document.createElement('input');
  nameInput.className = 'form-input';
  nameInput.type = 'text';
  nameInput.value = (data.comment as string) || '';
  if (readonly) {
    nameInput.readOnly = true;
  } else {
    nameInput.addEventListener('input', () => {
      data.comment = nameInput.value;
      tabInfo.label = nameInput.value || tabInfo.id;
      markDirty();
    });
  }
  nameRow.appendChild(nameLbl);
  nameRow.appendChild(nameInput);
  body.appendChild(nameRow);

  // Modification Type
  const typeRow = document.createElement('div');
  typeRow.className = 'form-row';
  const typeLbl = document.createElement('span');
  typeLbl.className = 'form-label';
  typeLbl.textContent = 'Type';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'form-select';
  if (readonly) typeSelect.disabled = true;
  const types = [
    { value: 'editinput', label: '입력문 수정' },
    { value: 'editoutput', label: '출력문 수정' },
    { value: 'editprocess', label: '리퀘스트 데이터 수정' },
    { value: 'editdisplay', label: '디스플레이 수정' },
    { value: 'edittrans', label: '번역문 수정' },
    { value: 'disabled', label: '비활성화됨' },
  ];
  for (const t of types) {
    const opt = document.createElement('option');
    opt.value = t.value;
    opt.textContent = t.label;
    if (((data.type as string) || '').toLowerCase() === t.value.toLowerCase()) opt.selected = true;
    typeSelect.appendChild(opt);
  }
  if (!readonly) {
    typeSelect.addEventListener('change', () => {
      data.type = typeSelect.value;
      markDirty();
    });
  }
  typeRow.appendChild(typeLbl);
  typeRow.appendChild(typeSelect);
  body.appendChild(typeRow);

  // Find (in) label + mini Monaco
  const findLabel = document.createElement('div');
  findLabel.className = 'form-section-label';
  findLabel.textContent = 'Find (in)';
  body.appendChild(findLabel);

  const findContainer = document.createElement('div');
  findContainer.className = 'form-monaco form-monaco-regex';
  body.appendChild(findContainer);

  // Replace (out) label + mini Monaco (resizable)
  const replaceLabel = document.createElement('div');
  replaceLabel.className = 'form-section-label';
  replaceLabel.textContent = 'Replace (out)';
  body.appendChild(replaceLabel);

  const replaceContainer = document.createElement('div');
  replaceContainer.className = 'form-monaco form-monaco-regex form-monaco-resizable';
  body.appendChild(replaceContainer);

  // Resize handle for replace out
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'form-monaco-resize-handle';
  body.appendChild(resizeHandle);

  // === FLAGS PANEL ===
  const flagsPanel = document.createElement('div');
  flagsPanel.className = 'regex-flags-panel';

  // Parse current flag string
  const flagStr = (data.flag as string) || '';
  const normalFlags = [
    { key: 'g', label: 'Global (g)' },
    { key: 'i', label: 'Case Insensitive (i)' },
    { key: 'm', label: 'Multi Line (m)' },
    { key: 'u', label: 'Unicode (u)' },
    { key: 's', label: 'Dot All (s)' },
  ];
  const specialFlags = [
    { key: 'T', label: 'Move Top' },
    { key: 'B', label: 'Move Bottom' },
    { key: 'R', label: 'Repeat Back' },
    { key: 'C', label: 'IN CBS Parsing' },
    { key: 'N', label: 'No Newline Suffix' },
  ];

  // Track active flags
  const activeFlags = new Set(flagStr.split(''));
  const knownKeys = new Set([...normalFlags.map((f) => f.key), ...specialFlags.map((f) => f.key)]);
  const customChars = flagStr
    .split('')
    .filter((c) => !knownKeys.has(c))
    .join('');
  const nonDefaultFlags = [...activeFlags].filter((f) => f !== 'g');
  const hasAnyFlag = nonDefaultFlags.length > 0 || customChars.length > 0;

  // Custom flag text input (declared early for rebuildFlagString)
  const customFlagInput = document.createElement('input');
  customFlagInput.className = 'form-input';
  customFlagInput.type = 'text';
  customFlagInput.placeholder = '직접 입력...';
  customFlagInput.value = customChars;
  customFlagInput.style.cssText = 'flex:1;margin-left:8px;';

  function rebuildFlagString(): void {
    let result = '';
    for (const f of normalFlags) {
      if (activeFlags.has(f.key)) result += f.key;
    }
    for (const f of specialFlags) {
      if (activeFlags.has(f.key)) result += f.key;
    }
    if (customFlagInput.value) result += customFlagInput.value;
    data.flag = result;
    markDirty();
  }

  // Toggle button: "커스텀 플래그"
  const flagsToggleBtn = document.createElement('button');
  flagsToggleBtn.className = 'regex-flags-toggle-btn' + (hasAnyFlag ? ' active' : '');
  flagsToggleBtn.innerHTML = `<span class="toggle-indicator">${hasAnyFlag ? '▼' : '▶'}</span> 커스텀 플래그`;
  flagsPanel.appendChild(flagsToggleBtn);

  // Flag content wrapper
  const flagsContent = document.createElement('div');
  flagsContent.style.display = hasAnyFlag ? '' : 'none';

  // Normal Flag section
  const normalLabel = document.createElement('div');
  normalLabel.className = 'regex-flags-title';
  normalLabel.textContent = 'Normal Flag';
  flagsContent.appendChild(normalLabel);

  const normalGrid = document.createElement('div');
  normalGrid.className = 'regex-flags-grid';
  for (const f of normalFlags) {
    const btn = document.createElement('button');
    btn.className = 'regex-flag-btn' + (activeFlags.has(f.key) ? ' active' : '');
    btn.textContent = f.label;
    if (readonly) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => {
        if (activeFlags.has(f.key)) activeFlags.delete(f.key);
        else activeFlags.add(f.key);
        btn.classList.toggle('active');
        rebuildFlagString();
      });
    }
    normalGrid.appendChild(btn);
  }
  flagsContent.appendChild(normalGrid);

  // Special Flag (Other Flag) section
  const specialLabel = document.createElement('div');
  specialLabel.className = 'regex-flags-title';
  specialLabel.textContent = 'Other Flag';
  flagsContent.appendChild(specialLabel);

  const specialGrid = document.createElement('div');
  specialGrid.className = 'regex-flags-grid';
  for (const f of specialFlags) {
    const btn = document.createElement('button');
    btn.className = 'regex-flag-btn' + (activeFlags.has(f.key) ? ' active' : '');
    btn.textContent = f.label;
    if (readonly) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => {
        if (activeFlags.has(f.key)) activeFlags.delete(f.key);
        else activeFlags.add(f.key);
        btn.classList.toggle('active');
        rebuildFlagString();
      });
    }
    specialGrid.appendChild(btn);
  }
  flagsContent.appendChild(specialGrid);

  // Order Flag
  const orderLabel = document.createElement('div');
  orderLabel.className = 'regex-flags-title';
  orderLabel.textContent = 'Order Flag';
  flagsContent.appendChild(orderLabel);

  const orderInput = document.createElement('input');
  orderInput.className = 'form-input form-number';
  orderInput.type = 'number';
  orderInput.value = String(data.replaceOrder ?? 0);
  orderInput.style.width = '100%';
  if (readonly) {
    orderInput.readOnly = true;
  } else {
    orderInput.addEventListener('input', () => {
      data.replaceOrder = parseInt(orderInput.value, 10) || 0;
      markDirty();
    });
  }
  flagsContent.appendChild(orderInput);

  // Custom Flag text row
  const customRow = document.createElement('div');
  customRow.className = 'regex-custom-flag-row';
  const customFlagLabel = document.createElement('span');
  customFlagLabel.textContent = 'Custom';
  customFlagLabel.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-primary);';
  if (readonly) {
    customFlagInput.readOnly = true;
  } else {
    customFlagInput.addEventListener('input', () => rebuildFlagString());
  }
  customRow.appendChild(customFlagLabel);
  customRow.appendChild(customFlagInput);
  flagsContent.appendChild(customRow);

  flagsPanel.appendChild(flagsContent);

  // Toggle button click handler
  flagsToggleBtn.addEventListener('click', () => {
    const isActive = flagsToggleBtn.classList.toggle('active');
    flagsContent.style.display = isActive ? '' : 'none';
    flagsToggleBtn.querySelector('.toggle-indicator')!.textContent = isActive ? '▼' : '▶';
  });

  body.appendChild(flagsPanel);

  form.appendChild(header);
  form.appendChild(body);
  container.appendChild(form);

  // Drag-to-resize for replace out
  let startY = 0;
  let startH = 0;
  const onResizeMove = (e: MouseEvent) => {
    const dy = e.clientY - startY;
    replaceContainer.style.height = Math.max(40, startH + dy) + 'px';
    for (const fe of formEditors) {
      if (
        fe &&
        typeof (fe as MonacoEditor).getDomNode === 'function' &&
        replaceContainer.contains((fe as MonacoEditor).getDomNode())
      ) {
        (fe as MonacoEditor).layout();
      }
    }
  };
  const onResizeUp = () => {
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeUp);
  };
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startH = replaceContainer.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeUp);
  });

  // Create mini Monacos after DOM insertion
  setTimeout(() => {
    // Read from find/replace (V2) or in/out (V1) — find/replace takes priority at runtime
    const findVal = (data.find as string) || (data.in as string) || '';
    const replaceVal = (data.replace as string) || (data.out as string) || '';
    const edFind = createMiniMonaco(
      findContainer,
      findVal,
      'plaintext',
      readonly
        ? null
        : (val) => {
            data.in = val;
            data.find = val;
            markDirty();
          },
    );
    const edReplace = createMiniMonaco(
      replaceContainer,
      replaceVal,
      'plaintext',
      readonly
        ? null
        : (val) => {
            data.out = val;
            data.replace = val;
            markDirty();
          },
    );
    if (readonly) {
      if (edFind) edFind.updateOptions({ readOnly: true });
      if (edReplace) edReplace.updateOptions({ readOnly: true });
    }
  }, 10);
}
