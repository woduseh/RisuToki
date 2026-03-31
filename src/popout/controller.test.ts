import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewSnapshot } from '../lib/preview-session';

function createSettingsSnapshot(overrides: Partial<ReturnType<typeof baseSettingsSnapshot>> = {}) {
  return {
    ...baseSettingsSnapshot(),
    ...overrides,
  };
}

function baseSettingsSnapshot() {
  return {
    darkMode: false,
    rpMode: 'off',
    rpCustomText: '',
    pluniCategory: 'solo',
    bgmEnabled: false,
    bgmPath: '',
    autosaveEnabled: false,
    autosaveInterval: 60000,
    autosaveDir: '',
    avatarIdle: null,
    avatarWorking: null,
    layoutState: null,
  };
}

const mockReadAppSettingsSnapshot = vi.fn(() => createSettingsSnapshot());
const mockSyncBodyDarkMode = vi.fn();
const mockSubscribeToAppSettings = vi.fn(() => () => {});
const mockWriteRpMode = vi.fn();
const mockGetDefaultRpModeForDarkMode = vi.fn(() => 'toki');
const mockCreateDirectTerminalChatSession = vi.fn(() => ({
  handleTerminalData: vi.fn(),
  setActive: vi.fn(),
  send: vi.fn(),
  finalizeResponse: vi.fn(),
  getState: vi.fn(() => ({ isStreaming: false })),
  getMessages: vi.fn(() => []),
  selectChoice: vi.fn(),
}));
const mockGetTalkTitle = vi.fn(() => 'TokiTalk');
const mockToMediaAsset = vi.fn((path: string) => `asset://${path}`);
const mockLoadMonacoRuntime = vi.fn(async () => {});
const mockBuildPreviewDebugClipboardText = vi.fn(() => 'debug');
const mockRenderPreviewDebugHtml = vi.fn(() => '<div>debug</div>');
const mockCreateIframePreviewRuntime = vi.fn(() => ({}));
const mockEnsureWasmoon = vi.fn(async () => {});
const mockReportRuntimeError = vi.fn();
const mockTermThemeLight = { background: '#ffffff' };
const mockTermThemeDark = { background: '#141a31' };
const mockInitializeTerminalUi = vi.fn(async () => ({
  term: {
    focus: vi.fn(),
    clear: vi.fn(),
  },
  fitAddon: {
    fit: vi.fn(),
  },
  dispose: vi.fn(),
}));
const mockCreatePreviewSession = vi.fn();

vi.mock('../lib/app-settings', () => ({
  getDefaultRpModeForDarkMode: mockGetDefaultRpModeForDarkMode,
  readAppSettingsSnapshot: mockReadAppSettingsSnapshot,
  subscribeToAppSettings: mockSubscribeToAppSettings,
  syncBodyDarkMode: mockSyncBodyDarkMode,
  writeRpMode: mockWriteRpMode,
}));

vi.mock('../lib/chat-session', () => ({
  createDirectTerminalChatSession: mockCreateDirectTerminalChatSession,
}));

vi.mock('../lib/asset-runtime', () => ({
  getTalkTitle: mockGetTalkTitle,
  toMediaAsset: mockToMediaAsset,
}));

vi.mock('../lib/monaco-loader', () => ({
  loadMonacoRuntime: mockLoadMonacoRuntime,
}));

vi.mock('../lib/preview-debug', () => ({
  buildPreviewDebugClipboardText: mockBuildPreviewDebugClipboardText,
  renderPreviewDebugHtml: mockRenderPreviewDebugHtml,
}));

vi.mock('../lib/preview-runtime', () => ({
  createIframePreviewRuntime: mockCreateIframePreviewRuntime,
}));

vi.mock('../lib/preview-session', () => ({
  createPreviewSession: mockCreatePreviewSession,
}));

vi.mock('../lib/runtime-feedback', () => ({
  reportRuntimeError: mockReportRuntimeError,
}));

vi.mock('../lib/script-loader', () => ({
  ensureWasmoon: mockEnsureWasmoon,
}));

vi.mock('../lib/terminal-ui', () => ({
  TERM_THEME_DARK: mockTermThemeDark,
  TERM_THEME_LIGHT: mockTermThemeLight,
  initializeTerminalUi: mockInitializeTerminalUi,
}));

vi.mock('../lib/terminal-chat', () => ({
  applySelectedChoice: vi.fn(),
  cleanTuiOutput: vi.fn(),
  extractChatChoices: vi.fn(() => []),
  filterDisplayChatMessages: vi.fn((messages: unknown[]) => messages),
  isSpinnerNoise: vi.fn(() => false),
  removeCommandEcho: vi.fn((text: string) => text),
  stripAnsi: vi.fn((text: string) => text),
}));

function createSnapshot(overrides: Partial<PreviewSnapshot> = {}): PreviewSnapshot {
  return {
    messages: [],
    luaInitialized: true,
    variables: {},
    lorebook: [],
    loreMatches: [],
    scripts: [],
    defaultVariables: '',
    luaOutput: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  mockReadAppSettingsSnapshot.mockImplementation(() => createSettingsSnapshot());
  mockInitializeTerminalUi.mockClear();
  document.body.innerHTML = '<div id="popout-root"></div>';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    } as Partial<Clipboard> as Clipboard,
  });
  mockCreatePreviewSession.mockReset();
  mockCreatePreviewSession.mockImplementation(() => ({
    dispose: vi.fn(),
    getSnapshot: vi.fn(() => createSnapshot()),
    handleSend: vi.fn(async () => {}),
    initialize: vi.fn(async () => {}),
    initializeLua: vi.fn(async () => true),
    refreshBackground: vi.fn(async () => {}),
    reset: vi.fn(async () => {}),
  }));
  (window as unknown as { popoutAPI: unknown }).popoutAPI = {
    getType: vi.fn(() => 'editor'),
    getRequestId: vi.fn(() => 'req-1'),
    dock: vi.fn(),
    terminalIsRunning: vi.fn(async () => false),
    terminalStart: vi.fn(async () => false),
    terminalInput: vi.fn(),
    terminalResize: vi.fn(),
    onTerminalData: vi.fn(),
    onTerminalExit: vi.fn(),
    onTerminalStatus: vi.fn(),
    getSidebarData: vi.fn(async () => ({ items: [] })),
    sidebarClick: vi.fn(),
    onSidebarDataChanged: vi.fn(),
    getEditorData: vi.fn(async () => ({
      tabId: 'tab-1',
      label: 'description',
      language: 'plaintext',
      content: 'hello',
      readOnly: false,
    })),
    editorChange: vi.fn(),
    editorSave: vi.fn(),
    getPreviewData: vi.fn(async () => ({
      name: 'Toki',
      description: 'desc',
      firstMessage: '안녕',
      defaultVariables: '',
      css: '',
      lorebook: [],
      regex: [],
      lua: '',
      triggerScripts: [],
    })),
    getAllAssetsMap: vi.fn(async () => ({ assets: {} })),
    getRefsData: vi.fn(async () => ({ guides: [], sessionGuides: [], refs: [] })),
    refsItemClick: vi.fn(),
    onRefsDataChanged: vi.fn(),
  };
  (globalThis as unknown as { monaco: unknown }).monaco = {
    editor: {
      create: vi.fn(() => ({
        getValue: vi.fn(() => 'hello'),
        onDidChangeModelContent: vi.fn(),
        addCommand: vi.fn(),
      })),
      setTheme: vi.fn(),
    },
    KeyMod: { CtrlCmd: 1 },
    KeyCode: { KeyS: 49 },
  };
});

describe('popout controller renderer', () => {
  it('shows a read-only badge and disabled save button in editor popout', async () => {
    (
      window as unknown as { popoutAPI: { getType: () => string; getEditorData: () => Promise<unknown> } }
    ).popoutAPI.getType = vi.fn(() => 'editor');
    (window as unknown as { popoutAPI: { getEditorData: () => Promise<unknown> } }).popoutAPI.getEditorData = vi.fn(
      async () => ({
        tabId: 'tab-1',
        label: 'description',
        language: 'plaintext',
        content: 'hello',
        readOnly: true,
      }),
    );

    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    const badge = document.querySelector('.readonly-badge');
    const saveBtn = document.getElementById('btn-editor-save') as HTMLButtonElement | null;
    expect(badge?.textContent).toBe('읽기전용');
    expect(saveBtn?.disabled).toBe(true);
    expect(saveBtn?.getAttribute('aria-label')).toContain('읽기전용');
  });

  it('does not call editorSave even if a read-only save button is force-enabled before click', async () => {
    (
      window as unknown as {
        popoutAPI: {
          getType: () => string;
          getEditorData: () => Promise<unknown>;
          editorSave: ReturnType<typeof vi.fn>;
        };
      }
    ).popoutAPI.getType = vi.fn(() => 'editor');
    (window as unknown as { popoutAPI: { getEditorData: () => Promise<unknown> } }).popoutAPI.getEditorData = vi.fn(
      async () => ({
        tabId: 'tab-1',
        label: 'description',
        language: 'plaintext',
        content: 'hello',
        readOnly: true,
      }),
    );
    (window as unknown as { popoutAPI: { editorSave: ReturnType<typeof vi.fn> } }).popoutAPI.editorSave = vi.fn();

    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    const saveBtn = document.getElementById('btn-editor-save') as HTMLButtonElement | null;
    expect(saveBtn?.disabled).toBe(true);
    if (saveBtn) {
      saveBtn.disabled = false;
    }
    saveBtn?.click();

    expect(
      (window as unknown as { popoutAPI: { editorSave: ReturnType<typeof vi.fn> } }).popoutAPI.editorSave,
    ).not.toHaveBeenCalled();
  });

  it('adds shared accessibility labels to preview popout buttons and marks debug active state', async () => {
    (window as unknown as { popoutAPI: { getType: () => string } }).popoutAPI.getType = vi.fn(() => 'preview');
    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.preview-header button'));
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '초기화',
      '디버그 패널',
      '메인 창으로 도킹',
      '닫기',
    ]);

    const debugBtn = buttons[1];
    debugBtn.click();
    expect(debugBtn.classList.contains('active')).toBe(true);
  });

  it('guards Enter send while IME composition is active in preview popout', async () => {
    (window as unknown as { popoutAPI: { getType: () => string } }).popoutAPI.getType = vi.fn(() => 'preview');
    const handleSend = vi.fn(async () => {});
    mockCreatePreviewSession.mockImplementation(() => ({
      dispose: vi.fn(),
      getSnapshot: vi.fn(() => createSnapshot()),
      handleSend,
      initialize: vi.fn(async () => {}),
      initializeLua: vi.fn(async () => true),
      refreshBackground: vi.fn(async () => {}),
      reset: vi.fn(async () => {}),
    }));

    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    const input = document.querySelector('textarea') as HTMLTextAreaElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(handleSend).toHaveBeenCalledTimes(1);

    const composingEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(composingEvent, 'isComposing', { value: true });
    input.dispatchEvent(composingEvent);

    expect(handleSend).toHaveBeenCalledTimes(1);
  });

  it('does not send terminal popout chat on Enter while IME composition is active', async () => {
    (window as unknown as { popoutAPI: { getType: () => string } }).popoutAPI.getType = vi.fn(() => 'terminal');

    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    expect(chatInput).not.toBeNull();

    // A composing Enter should NOT call preventDefault (send not triggered)
    const composingEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(composingEvent, 'isComposing', { value: true });
    chatInput.dispatchEvent(composingEvent);

    expect(composingEvent.defaultPrevented).toBe(false);
  });

  it('sends terminal popout chat on plain Enter when not composing', async () => {
    (window as unknown as { popoutAPI: { getType: () => string } }).popoutAPI.getType = vi.fn(() => 'terminal');

    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    expect(chatInput).not.toBeNull();

    // A non-composing Enter should trigger send (preventDefault called)
    const normalEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(normalEvent, 'isComposing', { value: false });
    chatInput.dispatchEvent(normalEvent);

    expect(normalEvent.defaultPrevented).toBe(true);
  });

  it('reuses sidebar header styling hooks and preserves selection after refresh', async () => {
    let currentItems = [{ id: 'description', label: '설명', icon: '📄', indent: 0 }];
    (
      window as unknown as {
        popoutAPI: {
          getType: () => string;
          getSidebarData: () => Promise<{ items: { id: string; label: string; icon: string; indent: number }[] }>;
          onSidebarDataChanged: (cb: () => void) => void;
        };
      }
    ).popoutAPI.getType = vi.fn(() => 'sidebar');
    let refreshListener: (() => void) | null = null;
    (window as unknown as { popoutAPI: { getSidebarData: () => Promise<unknown> } }).popoutAPI.getSidebarData = vi.fn(
      async () => ({ items: currentItems }),
    );
    (
      window as unknown as { popoutAPI: { onSidebarDataChanged: (cb: () => void) => void } }
    ).popoutAPI.onSidebarDataChanged = vi.fn((cb: () => void) => {
      refreshListener = cb;
    });

    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    const header = document.getElementById('popout-sidebar-header');
    expect(header?.classList.contains('sidebar-header')).toBe(true);

    const item = document.querySelector('.tree-item') as HTMLElement;
    item.click();
    expect(item.classList.contains('active')).toBe(true);

    currentItems = [{ id: 'description', label: '설명', icon: '📄', indent: 0 }];
    expect(refreshListener).not.toBeNull();
    await refreshListener!();

    const active = document.querySelector('.tree-item.active') as HTMLElement | null;
    expect(active?.textContent).toContain('설명');
  });

  it('styles sidebar popout header actions with the shared popout button class', async () => {
    (window as unknown as { popoutAPI: { getType: () => string } }).popoutAPI.getType = vi.fn(() => 'sidebar');

    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#popout-sidebar-header button'));
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.classList.contains('popout-action-btn'))).toBe(true);
  });

  it('uses the dark Monaco theme for editor popouts when dark mode is enabled', async () => {
    mockReadAppSettingsSnapshot.mockImplementation(() => createSettingsSnapshot({ darkMode: true }));
    (
      window as unknown as { popoutAPI: { getType: () => string; getEditorData: () => Promise<unknown> } }
    ).popoutAPI.getType = vi.fn(() => 'editor');

    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    expect(
      (globalThis as unknown as { monaco: { editor: { create: ReturnType<typeof vi.fn> } } }).monaco.editor.create,
    ).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ theme: 'blue-archive-dark' }));
  });

  it('uses dark terminal theme and class-based active buttons in terminal popout dark mode', async () => {
    mockReadAppSettingsSnapshot.mockImplementation(() => createSettingsSnapshot({ darkMode: true, rpMode: 'aris' }));
    (window as unknown as { popoutAPI: { getType: () => string } }).popoutAPI.getType = vi.fn(() => 'terminal');

    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    expect(mockInitializeTerminalUi).toHaveBeenCalledWith(expect.objectContaining({ theme: mockTermThemeDark }));

    const rpButton = document.getElementById('btn-rp-mode') as HTMLButtonElement | null;
    const chatButton = document.getElementById('btn-chat-mode') as HTMLButtonElement | null;
    expect(rpButton?.classList.contains('active')).toBe(true);
    expect(rpButton?.style.background).toBe('');

    chatButton?.click();
    expect(chatButton?.classList.contains('active')).toBe(true);
    expect(chatButton?.style.background).toBe('');
  });

  it('uses shared popout button styling hooks in preview popout headers', async () => {
    (window as unknown as { popoutAPI: { getType: () => string } }).popoutAPI.getType = vi.fn(() => 'preview');

    const mod = await import('./controller');
    await mod.initPopoutRenderer();

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.preview-header button'));
    expect(buttons).toHaveLength(4);
    expect(buttons.every((button) => button.classList.contains('popout-action-btn'))).toBe(true);
  });
});
