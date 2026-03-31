import type { TabManager } from './tab-manager';
import { NON_MONACO_EDITOR_TAB_TYPES } from './editor-activation';
import { resolveCloseWindowAction } from './close-window-policy';
import { getRisupValidationMessage } from './risup-form-editor';
import { getTriggerFormValidationMessage } from './trigger-form-editor';
import type { TriggerScriptModel } from './trigger-script-model';
import { useAppStore } from '../stores/app-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoEditor = any;

export interface FileActionDeps {
  getFileData: () => Record<string, unknown> | null;
  setFileData: (data: Record<string, unknown>) => void;
  getEditorInstance: () => MonacoEditor | null;
  setEditorInstance: (instance: null) => void;
  getAutosaveDir: () => string;
  hasUnsavedChanges: () => boolean;
  requestDocumentReplacement: (targetLabel: string) => Promise<number>;
  saveCurrentDocument: () => Promise<void>;

  tabMgr: TabManager;
  buildSidebar: () => void;
  setStatus: (msg: string) => void;
}

function syncEditorToActiveTab(deps: FileActionDeps): void {
  const editor = deps.getEditorInstance();
  const { tabMgr } = deps;
  if (editor && tabMgr.activeTabId) {
    const curTab = tabMgr.openTabs.find((t) => t.id === tabMgr.activeTabId);
    if (curTab && !NON_MONACO_EDITOR_TAB_TYPES.has(curTab.language) && curTab.setValue) {
      curTab.setValue(editor.getValue());
    }
  }
}

function resetEditorUI(deps: FileActionDeps): void {
  const editor = deps.getEditorInstance();
  deps.tabMgr.reset();
  if (editor) {
    editor.dispose();
    deps.setEditorInstance(null);
  }

  document.getElementById('editor-container')!.innerHTML = '<div class="empty-state">항목을 선택하세요</div>';
  document.getElementById('editor-tabs')!.innerHTML = '';
}

function getTriggerDraftValidationMessage(tabMgr: TabManager): string | null {
  const triggerTab = tabMgr.openTabs.find(
    (tab) =>
      tab.id === 'triggerScripts' &&
      tab.language === '_triggerform' &&
      !!tab.getValue &&
      !!tab.setValue &&
      tabMgr.dirtyFields.has(tab.id),
  );
  if (!triggerTab) return null;
  return getTriggerFormValidationMessage(triggerTab.getValue() as TriggerScriptModel | null | undefined);
}

function getSaveValidationMessage(fileData: Record<string, unknown>, tabMgr: TabManager): string | null {
  if (fileData._fileType === 'risup') {
    const risupValidationMessage = getRisupValidationMessage(fileData);
    if (risupValidationMessage) {
      return risupValidationMessage;
    }
  }

  return getTriggerDraftValidationMessage(tabMgr);
}

async function confirmDocumentReplacement(deps: FileActionDeps, targetLabel: string): Promise<boolean> {
  if (!deps.hasUnsavedChanges()) {
    return true;
  }

  const decision = resolveCloseWindowAction({
    choice: await deps.requestDocumentReplacement(targetLabel),
  });
  if (decision.action === 'stay') {
    return false;
  }
  if (decision.action === 'save') {
    try {
      await deps.saveCurrentDocument();
    } catch {
      return false;
    }
    return deps.tabMgr.dirtyFields.size === 0;
  }

  return true;
}

export async function handleNew(deps: FileActionDeps): Promise<void> {
  if (!(await confirmDocumentReplacement(deps, '새 파일'))) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await (window as any).tokiAPI.newFile();
  if (!data) return;
  deps.setFileData(data);
  resetEditorUI(deps);

  useAppStore().setFileLabel('New Character');

  deps.buildSidebar();
  deps.setStatus('새 파일 생성됨');
}

export async function handleOpen(deps: FileActionDeps): Promise<void> {
  try {
    if (!(await confirmDocumentReplacement(deps, '파일 열기'))) return;
    deps.setStatus('파일 열기 중...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (window as any).tokiAPI.openFile();
    if (!data) {
      deps.setStatus('준비');
      return;
    }
    deps.setFileData(data);
    resetEditorUI(deps);

    useAppStore().setFileLabel(`${(data as Record<string, unknown>).name || 'Untitled'}`);

    deps.buildSidebar();
    deps.setStatus(`파일 열림: ${(data as Record<string, unknown>).name}`);
  } catch (err) {
    console.error('[renderer] handleOpen error:', err);
    deps.setStatus(`열기 실패: ${(err as Error).message}`);
  }
}

export async function handleSave(deps: FileActionDeps): Promise<void> {
  const fileData = deps.getFileData();
  if (!fileData) return;
  syncEditorToActiveTab(deps);
  const validationMessage = getSaveValidationMessage(fileData, deps.tabMgr);
  if (validationMessage) {
    deps.setStatus(validationMessage);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (window as any).tokiAPI.saveFile(fileData);
  if (result.success) {
    deps.tabMgr.dirtyFields.clear();
    deps.tabMgr.renderTabs();
    deps.buildSidebar();
    deps.setStatus('저장 완료');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).tokiAPI.cleanupAutosave(deps.getAutosaveDir() || undefined);
  } else {
    deps.setStatus(`저장 실패: ${result.error}`);
  }
}

export async function handleSaveAs(deps: FileActionDeps): Promise<void> {
  const fileData = deps.getFileData();
  if (!fileData) return;
  syncEditorToActiveTab(deps);
  const validationMessage = getSaveValidationMessage(fileData, deps.tabMgr);
  if (validationMessage) {
    deps.setStatus(validationMessage);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (window as any).tokiAPI.saveFileAs(fileData);
  if (result.success) {
    deps.tabMgr.dirtyFields.clear();
    deps.tabMgr.renderTabs();
    deps.buildSidebar();
    deps.setStatus(`저장 완료: ${result.path}`);
  } else {
    deps.setStatus(`저장 취소`);
  }
}
