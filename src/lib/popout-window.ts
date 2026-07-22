// ---- Minimal type slices so the module stays decoupled ----

export type DockablePanelId = 'terminal' | 'refs';

export interface EditorLike {
  getValue(): string;
  dispose(): void;
}

export interface TabLike {
  id: string;
  label: string;
  language: string;
  getValue(): string;
  setValue: ((value: string) => void) | null;
}

export interface TabMgrLike {
  activeTabId: string | null;
  openTabs: TabLike[];
  renderTabs(): void;
}

/**
 * Dependencies injected by the controller so the module stays
 * free of direct references to controller-level state.
 */
export interface PopoutDeps {
  setPanelPoppedOut(panelId: DockablePanelId, poppedOut: boolean): void;
  refitWorkspace(): void;
  setStatus(msg: string): void;
  getEditorInstance(): EditorLike | null;
  setEditorInstance(ed: EditorLike | null): void;
  createOrSwitchEditor(tab: TabLike): void;
  tabMgr: TabMgrLike;
}

// ---- Internal state ----

const poppedOutPanels = new Set<string>();

const PANEL_LABELS: Record<string, string> = {
  editor: '에디터',
  refs: '참고자료',
  preview: '프리뷰',
  terminal: 'TokiTalk',
};

function labelFor(panelId: string): string {
  return PANEL_LABELS[panelId] ?? panelId;
}

// ---- Public API ----

export function isPanelPoppedOut(panelId: string): boolean {
  return poppedOutPanels.has(panelId);
}

/**
 * Remove a panel from the popped-out set without triggering any
 * IPC or layout side-effects.  Useful when the popout window is
 * closed externally (e.g. by the user clicking the OS close button)
 * and the controller needs to reconcile state.
 */
export function removePoppedOut(panelId: string): void {
  poppedOutPanels.delete(panelId);
}

export async function popOutPanel(
  panelId: DockablePanelId,
  deps: PopoutDeps,
  requestId: string | null = null,
): Promise<void> {
  if (isPanelPoppedOut(panelId)) return;

  await window.tokiAPI.popoutPanel(panelId, requestId);
  poppedOutPanels.add(panelId);
  deps.setPanelPoppedOut(panelId, true);
  deps.refitWorkspace();
  deps.setStatus(`${labelFor(panelId)} 팝아웃됨 (외부 창)`);
}

export async function popOutEditorPanel(tabId: string | null, deps: PopoutDeps): Promise<void> {
  if (isPanelPoppedOut('editor')) return;

  const targetId = tabId || deps.tabMgr.activeTabId;
  if (!targetId) return;

  const curTab = deps.tabMgr.openTabs.find((t) => t.id === targetId);
  if (!curTab || curTab.language === '_image') return;

  // Switch to target tab first if not active
  if (targetId !== deps.tabMgr.activeTabId) {
    deps.createOrSwitchEditor(curTab);
  }

  // Get current content
  let content = '';
  const editor = deps.getEditorInstance();
  if (editor) {
    content = editor.getValue();
    if (curTab.setValue) curTab.setValue(content);
  } else {
    content = curTab.getValue();
  }

  // Send tab data to main process for popout to pick up
  const requestId = await window.tokiAPI.setEditorPopoutData({
    tabId: curTab.id,
    label: curTab.label,
    language: curTab.language,
    content,
    readOnly: !curTab.setValue,
  });

  // Create popout window
  await window.tokiAPI.popoutPanel('editor', requestId);
  poppedOutPanels.add('editor');

  // Show placeholder in editor area
  const container = document.getElementById('editor-container');
  const ed = deps.getEditorInstance();
  if (ed) {
    ed.dispose();
    deps.setEditorInstance(null);
  }
  const readOnly = !curTab.setValue;
  if (container) {
    container.innerHTML = [
      '<div class="empty-state">',
      '<span style="font-size:28px;">↗</span>',
      `<span>${readOnly ? '열람중' : '편집중'} — 팝아웃 창에서 작업 중</span>`,
      '<span class="empty-state-hint">📌 도킹하면 여기로 복원됩니다</span>',
      '</div>',
    ].join('');
  }

  deps.tabMgr.renderTabs();
  deps.setStatus(`에디터 팝아웃됨: ${curTab.label}`);
}
