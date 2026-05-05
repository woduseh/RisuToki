import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initFormEditor,
  showLoreEditor,
  showRegexEditor,
  showRisupEditor,
  disposeFormEditors,
  type FormTabInfo,
  type FormEditorDeps,
} from './form-editor';
import type { RisupFormTabInfo } from './risup-form-editor';

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
  isRisupDisableableNumberFieldId: vi.fn((id: string) =>
    [
      'temperature',
      'frequencyPenalty',
      'presencePenalty',
      'top_p',
      'top_k',
      'min_p',
      'top_a',
      'repetition_penalty',
      'reasonEffort',
      'thinkingTokens',
      'verbosity',
    ].includes(id),
  ),
}));
vi.mock('./risup-form-editor', () => ({
  coerceRisupInputValue: vi.fn((_, v: unknown) => v),
  validateRisupDraftFields: vi.fn(() => []),
}));
vi.mock('./risup-prompt-editor', () => ({
  createFormatingOrderEditor: vi.fn(),
  createPromptTemplateEditor: vi.fn(),
}));
vi.mock('./risup-toggle-editor', () => ({
  createCustomPromptTemplateToggleEditor: vi.fn(),
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

describe('showRisupEditor validation boxes', () => {
  function makeRisupTab(overrides?: Partial<RisupFormTabInfo>): RisupFormTabInfo {
    return {
      id: 'risup_gen',
      label: '생성',
      language: '_risupform',
      getValue: () => ({ name: 'test-preset' }),
      setValue: (v: unknown) => v,
      _risupGroupId: 'templates',
      ...overrides,
    };
  }

  it('renders a separate warning box when warnings are present', async () => {
    const { validateRisupDraftFields: mockValidate } = await import('./risup-form-editor');
    const { getRisupFieldGroup: mockGetGroup } = await import('./risup-fields');
    vi.mocked(mockGetGroup).mockReturnValue({
      id: 'templates',
      label: '생성',
      icon: '⚙️',
      fields: [{ id: 'formatingOrder', label: '포매팅 순서', editor: 'textarea' }],
    });
    vi.mocked(mockValidate).mockReturnValue([
      { field: 'formatingOrder', label: '포매팅 순서', severity: 'warning', message: '중복 토큰 경고' },
    ]);

    const deps = createDeps();
    initFormEditor(deps);
    showRisupEditor(makeRisupTab());

    const container = document.getElementById('editor-container')!;
    const warningBox = container.querySelector('.risup-validation-warnings') as HTMLElement;
    expect(warningBox).not.toBeNull();
    expect(warningBox.style.display).not.toBe('none');
    expect(warningBox.textContent).toContain('중복 토큰 경고');

    const errorBox = container.querySelector('.risup-validation-errors') as HTMLElement;
    expect(errorBox.style.display).toBe('none');
  });

  it('renders a separate error box when errors are present', async () => {
    const { validateRisupDraftFields: mockValidate } = await import('./risup-form-editor');
    const { getRisupFieldGroup: mockGetGroup } = await import('./risup-fields');
    vi.mocked(mockGetGroup).mockReturnValue({
      id: 'templates',
      label: '생성',
      icon: '⚙️',
      fields: [{ id: 'formatingOrder', label: '포매팅 순서', editor: 'textarea' }],
    });
    vi.mocked(mockValidate).mockReturnValue([
      { field: 'formatingOrder', label: '포매팅 순서', severity: 'error', message: 'JSON 파싱 실패' },
    ]);

    const deps = createDeps();
    initFormEditor(deps);
    showRisupEditor(makeRisupTab());

    const container = document.getElementById('editor-container')!;
    const errorBox = container.querySelector('.risup-validation-errors') as HTMLElement;
    expect(errorBox).not.toBeNull();
    expect(errorBox.style.display).not.toBe('none');
    expect(errorBox.textContent).toContain('JSON 파싱 실패');

    const warningBox = container.querySelector('.risup-validation-warnings') as HTMLElement;
    expect(warningBox.style.display).toBe('none');
  });

  it('renders both error and warning boxes when both severities are present', async () => {
    const { validateRisupDraftFields: mockValidate } = await import('./risup-form-editor');
    const { getRisupFieldGroup: mockGetGroup } = await import('./risup-fields');
    vi.mocked(mockGetGroup).mockReturnValue({
      id: 'templates',
      label: '생성',
      icon: '⚙️',
      fields: [{ id: 'formatingOrder', label: '포매팅 순서', editor: 'textarea' }],
    });
    vi.mocked(mockValidate).mockReturnValue([
      { field: 'formatingOrder', label: '포매팅 순서', severity: 'error', message: 'JSON 파싱 실패' },
      { field: 'formatingOrder', label: '포매팅 순서', severity: 'warning', message: '중복 토큰 경고' },
    ]);

    const deps = createDeps();
    initFormEditor(deps);
    showRisupEditor(makeRisupTab());

    const container = document.getElementById('editor-container')!;
    const errorBox = container.querySelector('.risup-validation-errors') as HTMLElement;
    const warningBox = container.querySelector('.risup-validation-warnings') as HTMLElement;
    expect(errorBox).not.toBeNull();
    expect(warningBox).not.toBeNull();
    expect(errorBox.style.display).not.toBe('none');
    expect(warningBox.style.display).not.toBe('none');
    expect(errorBox.textContent).toContain('JSON 파싱 실패');
    expect(warningBox.textContent).toContain('중복 토큰 경고');
  });

  it('hides both boxes when no diagnostics are present', async () => {
    const { validateRisupDraftFields: mockValidate } = await import('./risup-form-editor');
    const { getRisupFieldGroup: mockGetGroup } = await import('./risup-fields');
    vi.mocked(mockGetGroup).mockReturnValue({
      id: 'templates',
      label: '생성',
      icon: '⚙️',
      fields: [{ id: 'formatingOrder', label: '포매팅 순서', editor: 'textarea' }],
    });
    vi.mocked(mockValidate).mockReturnValue([]);

    const deps = createDeps();
    initFormEditor(deps);
    showRisupEditor(makeRisupTab());

    const container = document.getElementById('editor-container')!;
    const errorBox = container.querySelector('.risup-validation-errors') as HTMLElement;
    const warningBox = container.querySelector('.risup-validation-warnings') as HTMLElement;
    expect(errorBox.style.display).toBe('none');
    expect(warningBox.style.display).toBe('none');
  });

  it('renders the dedicated custom toggle editor for customPromptTemplateToggle fields', async () => {
    const { validateRisupDraftFields: mockValidate } = await import('./risup-form-editor');
    const { getRisupFieldGroup: mockGetGroup } = await import('./risup-fields');
    const { createCustomPromptTemplateToggleEditor: mockToggleEditor } = await import('./risup-toggle-editor');
    vi.mocked(mockGetGroup).mockReturnValue({
      id: 'templates',
      label: '생성',
      icon: '⚙️',
      fields: [{ id: 'customPromptTemplateToggle', label: '커스텀 템플릿 토글', editor: 'toggle-template' }],
    });
    vi.mocked(mockValidate).mockReturnValue([]);

    const deps = createDeps();
    initFormEditor(deps);
    showRisupEditor(
      makeRisupTab({
        getValue: () => ({ name: 'test-preset', customPromptTemplateToggle: 'flag=Enable' }),
      }),
    );

    expect(mockToggleEditor).toHaveBeenCalledTimes(1);
    const container = document.getElementById('editor-container')!;
    expect(container.querySelector('.toggle-template-editor-container')).not.toBeNull();
  });

  it('shows disabled-sentinel risup number values as 비활성화 for disableable fields', async () => {
    const { validateRisupDraftFields: mockValidate } = await import('./risup-form-editor');
    const { getRisupFieldGroup: mockGetGroup } = await import('./risup-fields');
    vi.mocked(mockGetGroup).mockReturnValue({
      id: 'parameters',
      label: '기본 파라미터',
      icon: '🎛',
      fields: [{ id: 'temperature', label: '온도', editor: 'number', step: '0.1' }],
    });
    vi.mocked(mockValidate).mockReturnValue([]);

    const deps = createDeps();
    initFormEditor(deps);
    showRisupEditor(
      makeRisupTab({
        _risupGroupId: 'parameters',
        getValue: () => ({ temperature: -1000 }),
      }),
    );

    const input = document.querySelector<HTMLInputElement>('.form-number')!;
    expect(input.value).toBe('비활성화');
    expect(input.type).toBe('text');
  });

  it('keeps normal risup number values numeric for disableable fields', async () => {
    const { validateRisupDraftFields: mockValidate } = await import('./risup-form-editor');
    const { getRisupFieldGroup: mockGetGroup } = await import('./risup-fields');
    vi.mocked(mockGetGroup).mockReturnValue({
      id: 'parameters',
      label: '기본 파라미터',
      icon: '🎛',
      fields: [{ id: 'temperature', label: '온도', editor: 'number', step: '0.1' }],
    });
    vi.mocked(mockValidate).mockReturnValue([]);

    const deps = createDeps();
    initFormEditor(deps);
    showRisupEditor(
      makeRisupTab({
        _risupGroupId: 'parameters',
        getValue: () => ({ temperature: 0.8 }),
      }),
    );

    const input = document.querySelector<HTMLInputElement>('.form-number')!;
    expect(input.value).toBe('0.8');
    expect(input.type).toBe('number');
    expect(document.querySelector<HTMLButtonElement>('.form-disable-number-btn')?.textContent).toBe('비활성화');
  });

  it('keeps -1000 literal for non-disableable risup number fields', async () => {
    const { validateRisupDraftFields: mockValidate } = await import('./risup-form-editor');
    const { getRisupFieldGroup: mockGetGroup } = await import('./risup-fields');
    vi.mocked(mockGetGroup).mockReturnValue({
      id: 'parameters',
      label: '기본 파라미터',
      icon: '🎛',
      fields: [{ id: 'maxContext', label: '최대 컨텍스트', editor: 'number', step: '1' }],
    });
    vi.mocked(mockValidate).mockReturnValue([]);

    const deps = createDeps();
    initFormEditor(deps);
    showRisupEditor(
      makeRisupTab({
        _risupGroupId: 'parameters',
        getValue: () => ({ maxContext: -1000 }),
      }),
    );

    const input = document.querySelector<HTMLInputElement>('.form-number')!;
    expect(input.value).toBe('-1000');
    expect(input.type).toBe('number');
    expect(document.querySelector('.form-disable-number-btn')).toBeNull();
  });

  it('sets a disableable risup number field to -1000 when the disable button is clicked', async () => {
    const { validateRisupDraftFields: mockValidate } = await import('./risup-form-editor');
    const { getRisupFieldGroup: mockGetGroup } = await import('./risup-fields');
    vi.mocked(mockGetGroup).mockReturnValue({
      id: 'parameters',
      label: '기본 파라미터',
      icon: '🎛',
      fields: [{ id: 'temperature', label: '온도', editor: 'number', step: '0.1' }],
    });
    vi.mocked(mockValidate).mockReturnValue([]);

    const data = { temperature: 0.8 };
    const setValue = vi.fn();
    const deps = createDeps();
    initFormEditor(deps);
    showRisupEditor(
      makeRisupTab({
        _risupGroupId: 'parameters',
        getValue: () => data,
        setValue,
      }),
    );

    const input = document.querySelector<HTMLInputElement>('.form-number')!;
    const disableButton = document.querySelector<HTMLButtonElement>('.form-disable-number-btn')!;
    disableButton.click();

    expect(data.temperature).toBe(-1000);
    expect(setValue).toHaveBeenCalledWith(data);
    expect(input.value).toBe('비활성화');
    expect(input.type).toBe('text');
  });

  it('changes a disabled-sentinel risup number field back to a real number', async () => {
    const { coerceRisupInputValue: mockCoerce, validateRisupDraftFields: mockValidate } =
      await import('./risup-form-editor');
    const { getRisupFieldGroup: mockGetGroup } = await import('./risup-fields');
    vi.mocked(mockCoerce).mockImplementation((kind, value) => {
      if (kind === 'number') {
        const next = Number.parseFloat(String(value));
        return Number.isFinite(next) ? next : undefined;
      }
      return String(value);
    });
    vi.mocked(mockGetGroup).mockReturnValue({
      id: 'parameters',
      label: '기본 파라미터',
      icon: '🎛',
      fields: [{ id: 'temperature', label: '온도', editor: 'number', step: '0.1' }],
    });
    vi.mocked(mockValidate).mockReturnValue([]);

    const data = { temperature: -1000 };
    const setValue = vi.fn();
    const deps = createDeps();
    initFormEditor(deps);
    showRisupEditor(
      makeRisupTab({
        _risupGroupId: 'parameters',
        getValue: () => data,
        setValue,
      }),
    );

    const input = document.querySelector<HTMLInputElement>('.form-number')!;
    input.dispatchEvent(new Event('focus'));
    expect(input.value).toBe('');

    input.value = '0.9';
    input.dispatchEvent(new Event('input'));

    expect(data.temperature).toBe(0.9);
    expect(setValue).toHaveBeenCalledWith(data);
  });
});
