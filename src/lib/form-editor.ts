import { NON_MONACO_EDITOR_TAB_TYPES } from './editor-activation';
import { getFolderRef, normalizeFolderRef, resolveLorebookFolderRef } from './lorebook-folders';
import { getRisupFieldGroup, isRisupDisableableNumberFieldId } from './risup-fields';
import { coerceRisupInputValue, validateRisupDraftFields, type RisupFormTabInfo } from './risup-form-editor';
import { createFormatingOrderEditor, createPromptItemEditor, createPromptTemplateEditor } from './risup-prompt-editor';
import { createCustomPromptTemplateToggleEditor } from './risup-toggle-editor';
import {
  coerceTriggerFormInputValue,
  getTriggerFormValidationMessage,
  resolveTriggerDetailState,
  updateTriggerFormLuaEffectCode,
  updateTriggerFormScalarField,
  type TriggerFormTabInfo,
} from './trigger-form-editor';
import { parseTriggerScriptsText, serializeTriggerScriptModel, type TriggerScriptModel } from './trigger-script-model';
import { createSwitchControl } from './switch-control';

type MonacoWindow = Window & {
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
type ManagedFormEditor = FormEditor | { dispose: () => void };
const RISUP_DISABLED_NUMBER_SENTINEL = -1000;
const RISUP_DISABLED_NUMBER_LABEL = '비활성화';

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

export interface BooleanFormTabInfo extends FormTabInfo {
  language: '_booleanform';
  falseLabel?: string;
  trueLabel?: string;
}

export interface ToggleFormTabInfo extends FormTabInfo {
  language: '_toggleform';
}

export interface ModuleSettingsFormTabInfo extends FormTabInfo {
  language: '_modulesettingsform';
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
  getMonacoThemeId: () => string;
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

let formEditors: ManagedFormEditor[] = [];
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
        if (
          options &&
          (Object.prototype.hasOwnProperty.call(options, 'readOnly') ||
            Object.prototype.hasOwnProperty.call(options, 'domReadOnly'))
        ) {
          textarea.readOnly = !!(options.readOnly || options.domReadOnly);
        }
      },
    };
    formEditors.push(fallbackEditor);
    return fallbackEditor;
  }

  try {
    const ed = win.monaco!.editor.create(container, {
      // Keep the same Windows IME input path as the main editor.
      editContext: false,
      value: value || '',
      language: language,
      theme: d.getMonacoThemeId(),
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
      readOnly: !onChange,
      domReadOnly: !onChange,
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

function appendFormSections(form: HTMLElement, header: HTMLElement, body: HTMLElement, readonly: boolean): void {
  form.appendChild(header);
  if (readonly) {
    form.classList.add('form-editor-readonly');
    form.setAttribute('aria-readonly', 'true');
    const notice = document.createElement('div');
    notice.className = 'reference-readonly-notice';
    notice.setAttribute('role', 'note');
    notice.textContent = '참고 파일에서 연 항목입니다. 내용은 수정할 수 없습니다.';
    form.appendChild(notice);
  }
  form.appendChild(body);
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
  headerTitle.textContent = `로어북 · ${(data.comment as string) || tabInfo.label}`;
  header.appendChild(headerTitle);
  if (readonly) {
    const badge = document.createElement('span');
    badge.className = 'readonly-badge';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  // Body
  const body = document.createElement('div');
  body.className = 'form-editor-body';

  // Editable lorebook tabs use the workspace inspector for metadata. Keeping
  // the center dedicated to content removes duplicate controls and preserves a
  // wide writing surface. Reference lorebooks remain self-contained/read-only.
  if (!readonly) {
    const contentLabel = document.createElement('div');
    contentLabel.className = 'form-section-label';
    contentLabel.textContent = '내용';
    const monacoContainer = document.createElement('div');
    monacoContainer.className = 'form-monaco form-monaco-lore workspace-lore-content';
    body.append(contentLabel, monacoContainer);
    form.append(header, body);
    container.appendChild(form);
    setTimeout(() => {
      createMiniMonaco(monacoContainer, (data.content as string) || '', 'plaintext', (value) => {
        data.content = value;
        markDirty();
      });
    }, 10);
    return;
  }

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

  // Independent activation switches. Preserve every existing boolean instead of
  // collapsing the three fields into a mutually-exclusive mode.
  const checks = document.createElement('div');
  checks.className = 'form-checks lore-activation-switches';

  function addCheck(labelText: string, description: string, field: string): void {
    const item = document.createElement('div');
    item.className = 'form-check-item lore-activation-switch';
    const copy = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'settings-label';
    label.textContent = labelText;
    const desc = document.createElement('div');
    desc.className = 'settings-desc';
    desc.textContent = description;
    copy.append(label, desc);
    const control = createSwitchControl({
      checked: !!data[field],
      label: labelText,
      disabled: readonly,
      onChange: (checked) => {
        data[field] = checked;
        markDirty();
      },
    });
    item.append(copy, control);
    checks.appendChild(item);
  }

  addCheck('언제나 활성화', '키워드가 없어도 항상 컨텍스트에 포함합니다.', 'alwaysActive');
  addCheck('강제 활성화', '일반 활성화 제한보다 우선하여 항목을 포함합니다.', 'forceActivation');
  addCheck('선택적', '기본 키와 보조 키 조건을 함께 사용합니다.', 'selective');
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

  appendFormSections(form, header, body, readonly);
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
    badge.className = 'readonly-badge';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  const body = document.createElement('div');
  body.className = 'form-editor-body';

  const errorBox = document.createElement('div');
  errorBox.className = 'risup-validation-errors';
  errorBox.style.cssText =
    'display:none;margin-bottom:10px;padding:8px 10px;border:1px solid #d97706;border-radius:6px;background:rgba(217,119,6,0.08);color:#b45309;font-size:12px;white-space:pre-wrap;';
  body.appendChild(errorBox);

  const warningBox = document.createElement('div');
  warningBox.className = 'risup-validation-warnings';
  warningBox.style.cssText =
    'display:none;margin-bottom:10px;padding:8px 10px;border:1px solid #ca8a04;border-radius:6px;background:rgba(202,138,4,0.06);color:#a16207;font-size:12px;white-space:pre-wrap;';
  body.appendChild(warningBox);

  function updateValidation(): void {
    const groupFieldIds = new Set(groupFields.map((field) => field.id));
    const all = validateRisupDraftFields(data).filter((error) => groupFieldIds.has(error.field));
    const errors = all.filter((e) => e.severity === 'error');
    const warnings = all.filter((e) => e.severity === 'warning');

    if (errors.length === 0) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    } else {
      errorBox.style.display = '';
      errorBox.textContent = errors.map((e) => e.message).join('\n');
    }

    if (warnings.length === 0) {
      warningBox.style.display = 'none';
      warningBox.textContent = '';
    } else {
      warningBox.style.display = '';
      warningBox.textContent = warnings.map((e) => e.message).join('\n');
    }
  }

  function applyFieldChange(fieldId: string, nextValue: unknown): void {
    data[fieldId] = nextValue;
    markDirty();
    updateValidation();
    if (fieldId === 'promptTemplate') {
      deps!.buildSidebar();
    }
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

    if (field.editor === 'toggle-template') {
      const label = document.createElement('div');
      label.className = 'form-section-label';
      label.textContent = field.label;
      body.appendChild(label);
      const editorContainer = document.createElement('div');
      editorContainer.className = 'form-embedded-editor toggle-template-editor-container';
      body.appendChild(editorContainer);
      createCustomPromptTemplateToggleEditor(
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
    const isDisableableNumberField = field.editor === 'number' && isRisupDisableableNumberFieldId(field.id);
    const isDisabledNumberSentinel = isDisableableNumberField && data[field.id] === RISUP_DISABLED_NUMBER_SENTINEL;
    input.type = field.editor === 'number' && !isDisabledNumberSentinel ? 'number' : 'text';
    input.value =
      field.editor === 'number'
        ? data[field.id] == null
          ? ''
          : isDisabledNumberSentinel
            ? RISUP_DISABLED_NUMBER_LABEL
            : String(data[field.id])
        : typeof data[field.id] === 'string'
          ? (data[field.id] as string)
          : '';
    if (field.step) input.step = field.step;
    if (field.placeholder) input.placeholder = field.placeholder;
    const showDisabledNumberState = (): void => {
      input.type = 'text';
      input.value = RISUP_DISABLED_NUMBER_LABEL;
    };
    const showNumericNumberState = (): void => {
      input.type = 'number';
      if (field.step) input.step = field.step;
    };
    if (readonly) {
      input.readOnly = true;
    } else {
      if (isDisableableNumberField) {
        input.addEventListener('focus', () => {
          if (input.value === RISUP_DISABLED_NUMBER_LABEL) {
            showNumericNumberState();
            input.value = '';
          }
        });
        input.addEventListener('blur', () => {
          const nextValue = coerceRisupInputValue(field.editor, input.value);
          if (data[field.id] === RISUP_DISABLED_NUMBER_SENTINEL && nextValue === undefined) {
            showDisabledNumberState();
          }
        });
      }
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
    if (isDisableableNumberField) {
      const disableButton = document.createElement('button');
      disableButton.type = 'button';
      disableButton.className = 'form-disable-number-btn';
      disableButton.textContent = RISUP_DISABLED_NUMBER_LABEL;
      disableButton.disabled = readonly;
      disableButton.setAttribute('aria-label', `${field.label} 비활성화`);
      if (!readonly) {
        disableButton.addEventListener('click', () => {
          applyFieldChange(field.id, RISUP_DISABLED_NUMBER_SENTINEL);
          showDisabledNumberState();
        });
      }
      row.appendChild(disableButton);
    }
    body.appendChild(row);
  }

  updateValidation();

  appendFormSections(form, header, body, readonly);
  container.appendChild(form);
}

export interface RisupPromptItemTabInfo extends RisupFormTabInfo {
  language: '_risupPromptItemForm';
  _promptItemId?: string;
}

export function showRisupPromptItemEditor(tabInfo: RisupPromptItemTabInfo): void {
  saveCurrentMonacoState(tabInfo);
  const container = clearEditorContainer();

  const readonly = !tabInfo.setValue;
  const value = typeof tabInfo.getValue() === 'string' ? (tabInfo.getValue() as string) : '';
  const itemId =
    tabInfo._promptItemId ||
    (tabInfo.id.startsWith('risup_prompt_item_') ? tabInfo.id.replace('risup_prompt_item_', '') : '');

  const form = document.createElement('div');
  form.className = 'form-editor';

  const header = document.createElement('div');
  header.className = 'form-editor-header';
  header.textContent = `🧩 ${tabInfo.label}`;

  const body = document.createElement('div');
  body.className = 'form-editor-body';
  const editorContainer = document.createElement('div');
  editorContainer.className = 'form-embedded-editor prompt-template-editor-container prompt-item-detail-container';
  body.appendChild(editorContainer);

  const handle = createPromptItemEditor(
    editorContainer,
    value,
    itemId,
    readonly
      ? null
      : (nextValue) => {
          tabInfo.setValue!(nextValue);
          const d = deps!;
          d.tabMgr.markDirtyForTabId(tabInfo.id);
          d.tabMgr.markDirtyForTabId('risup_prompt');
          d.tabMgr.renderTabs();
          d.buildSidebar();
        },
  );
  formEditors.push(handle);

  appendFormSections(form, header, body, readonly);
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
    badge.className = 'readonly-badge';
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

  appendFormSections(form, header, body, readonly);
  container.appendChild(form);
}

// ── Boolean form editor ──

export function showBooleanEditor(tabInfo: BooleanFormTabInfo): void {
  saveCurrentMonacoState(tabInfo);
  const container = clearEditorContainer();

  const readonly = !tabInfo.setValue;
  const currentValue = !!tabInfo.getValue();

  const form = document.createElement('div');
  form.className = 'form-editor';

  const header = document.createElement('div');
  header.className = 'form-editor-header';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = tabInfo.label;
  header.appendChild(headerTitle);
  if (readonly) {
    const badge = document.createElement('span');
    badge.className = 'readonly-badge';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  const body = document.createElement('div');
  body.className = 'form-editor-body';

  const row = document.createElement('div');
  row.className = 'settings-row boolean-form-switch-row';
  const stateLabel = document.createElement('span');
  stateLabel.className = 'settings-label';
  stateLabel.textContent = currentValue ? tabInfo.trueLabel || 'On' : tabInfo.falseLabel || 'Off';
  const control = createSwitchControl({
    checked: currentValue,
    label: tabInfo.label,
    disabled: readonly,
    onChange: (value) => {
      tabInfo.setValue!(value);
      stateLabel.textContent = value ? tabInfo.trueLabel || 'On' : tabInfo.falseLabel || 'Off';
      const d = deps!;
      d.tabMgr.markDirtyForTabId(tabInfo.id);
      d.tabMgr.renderTabs();
    },
  });
  row.append(stateLabel, control);
  body.appendChild(row);
  appendFormSections(form, header, body, readonly);
  container.appendChild(form);
}

// ── Unified .risum module settings editor ──

export function showModuleSettingsEditor(tabInfo: ModuleSettingsFormTabInfo): void {
  saveCurrentMonacoState(tabInfo);
  const container = clearEditorContainer();
  const rawData = tabInfo.getValue();
  if (!rawData || typeof rawData !== 'object') return;
  const data = rawData as Record<string, unknown>;
  const readonly = !tabInfo.setValue;
  const markDirty = buildMarkDirty(tabInfo, data);

  const form = document.createElement('div');
  form.className = 'form-editor module-settings-form';
  const header = document.createElement('div');
  header.className = 'form-editor-header';
  header.textContent = '📦 모듈 설정';
  const body = document.createElement('div');
  body.className = 'form-editor-body';

  const addTextField = (labelText: string, field: string, multiline = false): void => {
    const row = document.createElement('label');
    row.className = multiline ? 'form-row module-description-row' : 'form-row';
    const label = document.createElement('span');
    label.className = 'form-label';
    label.textContent = labelText;
    const input = multiline ? document.createElement('textarea') : document.createElement('input');
    input.className = 'form-input';
    input.value = String(data[field] ?? '');
    if (input instanceof HTMLTextAreaElement) input.rows = 8;
    if (readonly) input.disabled = true;
    else {
      input.addEventListener('input', () => {
        data[field] = input.value;
        markDirty();
      });
    }
    row.append(label, input);
    body.appendChild(row);
  };

  addTextField('모듈 이름', 'moduleName');
  addTextField('설명', 'moduleDescription', true);
  addTextField('네임스페이스', 'moduleNamespace');

  const switches = document.createElement('div');
  switches.className = 'module-settings-switches';
  const addSwitch = (labelText: string, description: string, field: string): void => {
    const row = document.createElement('div');
    row.className = 'settings-row module-settings-switch-row';
    const copy = document.createElement('div');
    copy.innerHTML = `<div class="settings-label"></div><div class="settings-desc"></div>`;
    copy.querySelector<HTMLElement>('.settings-label')!.textContent = labelText;
    copy.querySelector<HTMLElement>('.settings-desc')!.textContent = description;
    const control = createSwitchControl({
      checked: !!data[field],
      label: labelText,
      disabled: readonly,
      onChange: (checked) => {
        data[field] = checked;
        markDirty();
      },
    });
    row.append(copy, control);
    switches.appendChild(row);
  };
  addSwitch('저수준 접근', '모듈이 제한된 저수준 API를 사용할 수 있게 합니다.', 'lowLevelAccess');
  addSwitch('아이콘 숨김', 'RisuAI의 모듈 목록에서 아이콘을 숨깁니다.', 'hideIcon');
  body.appendChild(switches);

  appendFormSections(form, header, body, readonly);
  container.appendChild(form);
}

// ── Toggle template form editor ──

export function showToggleTemplateEditor(tabInfo: ToggleFormTabInfo): void {
  saveCurrentMonacoState(tabInfo);
  const container = clearEditorContainer();

  const readonly = !tabInfo.setValue;
  const value = typeof tabInfo.getValue() === 'string' ? (tabInfo.getValue() as string) : '';

  const form = document.createElement('div');
  form.className = 'form-editor';

  const header = document.createElement('div');
  header.className = 'form-editor-header';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = tabInfo.label;
  header.appendChild(headerTitle);
  if (readonly) {
    const badge = document.createElement('span');
    badge.className = 'readonly-badge';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  const body = document.createElement('div');
  body.className = 'form-editor-body';
  const editorContainer = document.createElement('div');
  editorContainer.className = 'form-embedded-editor toggle-template-editor-container';
  body.appendChild(editorContainer);

  const handle = createCustomPromptTemplateToggleEditor(
    editorContainer,
    value,
    readonly
      ? null
      : (nextValue) => {
          tabInfo.setValue!(nextValue);
          const d = deps!;
          d.tabMgr.markDirtyForTabId(tabInfo.id);
          d.tabMgr.renderTabs();
        },
  );
  formEditors.push(handle);

  appendFormSections(form, header, body, readonly);
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
    badge.className = 'readonly-badge';
    badge.textContent = '[읽기 전용]';
    headerTitle.appendChild(badge);
  }

  // Toggle (active/disabled type)
  const toggle = document.createElement('div');
  toggle.className = 'form-toggle' + ((data.type as string) !== 'disabled' ? ' active' : '');
  toggle.title = '활성화 토글';
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
  const syncRegexActiveToggle = (): void => {
    toggle.classList.toggle('active', typeSelect.value !== 'disabled');
  };
  let previousRegexType = data.type && data.type !== 'disabled' ? (data.type as string) : 'editdisplay';
  if (!readonly) {
    typeSelect.addEventListener('change', () => {
      data.type = typeSelect.value;
      if (typeSelect.value !== 'disabled') previousRegexType = typeSelect.value;
      syncRegexActiveToggle();
      markDirty();
    });
    toggle.addEventListener('click', () => {
      const nextType = toggle.classList.contains('active') ? 'disabled' : previousRegexType;
      if (nextType === 'disabled' && data.type && data.type !== 'disabled') previousRegexType = data.type as string;
      data.type = nextType;
      typeSelect.value = nextType;
      syncRegexActiveToggle();
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
  const flagsToggleIndicator = document.createElement('span');
  flagsToggleIndicator.className = 'toggle-indicator';
  flagsToggleIndicator.textContent = hasAnyFlag ? '▼' : '▶';
  flagsToggleBtn.replaceChildren(flagsToggleIndicator, document.createTextNode(' 커스텀 플래그'));
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

  appendFormSections(form, header, body, readonly);
  container.appendChild(form);

  // Drag-to-resize for replace out
  let startY = 0;
  let startH = 0;
  let pendingResizeY: number | null = null;
  let resizeFrame: number | null = null;
  const applyResize = () => {
    resizeFrame = null;
    if (pendingResizeY === null) return;
    const nextY = pendingResizeY;
    pendingResizeY = null;
    replaceContainer.style.height = Math.max(40, startH + startY - nextY) + 'px';
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
  const onResizeMove = (e: MouseEvent) => {
    pendingResizeY = e.clientY;
    if (resizeFrame === null) resizeFrame = window.requestAnimationFrame(applyResize);
  };
  const onResizeUp = () => {
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
    }
    applyResize();
    document.body.style.cursor = '';
    document.body.classList.remove('form-resizing');
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeUp);
  };
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startH = replaceContainer.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.classList.add('form-resizing');
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
