import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initFormEditor,
  showLoreEditor,
  showRegexEditor,
  disposeFormEditors,
  type FormTabInfo,
  type FormEditorDeps,
} from './form-editor';

vi.mock('./monaco-loader', () => ({
  ensureBlueArchiveMonacoTheme: vi.fn(),
}));
vi.mock('./dark-mode', () => ({
  defineDarkMonacoTheme: vi.fn(),
}));
vi.mock('./editor-activation', () => ({
  NON_MONACO_EDITOR_TAB_TYPES: new Set(['_loreform', '_regexform', '_triggerform', '_risupform']),
}));
vi.mock('./lorebook-folders', () => ({
  getFolderRef: vi.fn(() => ''),
  normalizeFolderRef: vi.fn((r: string) => r),
  resolveLorebookFolderRef: vi.fn(() => undefined),
}));
vi.mock('./risup-fields', () => ({
  getRisupFieldGroup: vi.fn(() => ({
    id: 'gen',
    label: '생성',
    icon: '⚙️',
    fields: [],
  })),
}));
vi.mock('./risup-form-editor', () => ({
  coerceRisupInputValue: vi.fn((_, v: unknown) => v),
  validateRisupDraftFields: vi.fn(() => []),
}));
vi.mock('./risup-prompt-editor', () => ({
  createFormatingOrderEditor: vi.fn(),
  createPromptTemplateEditor: vi.fn(),
}));
vi.mock('./trigger-form-editor', () => ({
  coerceTriggerFormInputValue: vi.fn(),
  getTriggerFormValidationMessage: vi.fn(),
  resolveTriggerDetailState: vi.fn(),
  updateTriggerFormLuaEffectCode: vi.fn(),
  updateTriggerFormScalarField: vi.fn(),
}));
vi.mock('./trigger-script-model', () => ({
  parseTriggerScriptsText: vi.fn(() => ({ triggers: [] })),
  serializeTriggerScriptModel: vi.fn(() => '[]'),
}));

function createDeps(): FormEditorDeps {
  return {
    isMonacoReady: () => false,
    isDarkMode: () => false,
    getEditorInstance: () => null,
    setEditorInstance: vi.fn(),
    getFileData: () => ({}),
    tabMgr: {
      activeTabId: null,
      openTabs: [],
      dirtyFields: new Set(),
      renderTabs: vi.fn(),
      markDirtyForTabId: vi.fn(),
    },
    createBackup: vi.fn(),
    showPrompt: vi.fn(async () => null),
    buildSidebar: vi.fn(),
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="editor-container"></div>';
  disposeFormEditors();
});

describe('form-editor read-only badge', () => {
  it('showLoreEditor uses a shared .readonly-badge class for read-only badge', () => {
    const deps = createDeps();
    initFormEditor(deps);

    const tabInfo: FormTabInfo = {
      id: 'lore_0',
      label: '테스트 로어',
      language: '_loreform',
      getValue: () => ({
        comment: '테스트',
        key: 'test',
        content: 'test content',
        mode: 'normal',
        insertorder: 100,
        alwaysActive: false,
        secondkey: '',
        selective: false,
        useRegex: false,
        folder: '',
        activationPercent: 100,
        id: 'uuid-1',
      }),
      setValue: null, // read-only
    };

    showLoreEditor(tabInfo);

    const container = document.getElementById('editor-container')!;
    const badge = container.querySelector('.readonly-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('읽기');
  });

  it('showRegexEditor uses a shared .readonly-badge class for read-only badge', () => {
    const deps = createDeps();
    initFormEditor(deps);

    const tabInfo: FormTabInfo = {
      id: 'regex_0',
      label: '테스트 정규식',
      language: '_regexform',
      getValue: () => ({
        comment: '테스트 정규식',
        type: 'editdisplay',
        find: 'pattern',
        replace: 'replacement',
        flag: 'g',
        ableFlag: true,
      }),
      setValue: null, // read-only
    };

    showRegexEditor(tabInfo);

    const container = document.getElementById('editor-container')!;
    const badge = container.querySelector('.readonly-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('읽기');
  });

  it('read-only badges should not use inline styles for badge appearance', () => {
    const deps = createDeps();
    initFormEditor(deps);

    const tabInfo: FormTabInfo = {
      id: 'lore_1',
      label: '인라인 체크',
      language: '_loreform',
      getValue: () => ({
        comment: '인라인 테스트',
        key: 'test',
        content: 'content',
        mode: 'normal',
        insertorder: 100,
        alwaysActive: false,
        secondkey: '',
        selective: false,
        useRegex: false,
        folder: '',
        activationPercent: 100,
        id: 'uuid-2',
      }),
      setValue: null, // read-only
    };

    showLoreEditor(tabInfo);

    const container = document.getElementById('editor-container')!;
    const badge = container.querySelector('.readonly-badge');
    expect(badge).not.toBeNull();
    // The badge should use a CSS class, NOT inline styles for its appearance
    expect(badge?.getAttribute('style')).toBeFalsy();
  });
});
