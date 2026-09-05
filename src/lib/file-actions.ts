import type { TabManager } from './tab-manager';
import type { RendererDocumentData } from './document-types';
import { NON_MONACO_EDITOR_TAB_TYPES } from './editor-activation';
import { resolveCloseWindowAction } from './close-window-policy';
import { getRisupValidationMessage } from './risup-form-editor';
import { getTriggerFormValidationMessage } from './trigger-form-editor';
import type { TriggerScriptModel } from './trigger-script-model';
import { useAppStore } from '../stores/app-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoEditor = any;

export interface FileActionDeps {
  getFileData: () => RendererDocumentData | null;
  setFileData: (data: RendererDocumentData) => void;
  getEditorInstance: () => MonacoEditor | null;
  setEditorInstance: (instance: null) => void;
  disposeEditorSurfaces: () => void;
  getAutosaveDir: () => string;
  hasUnsavedChanges: () => boolean;
  requestDocumentReplacement: (targetLabel: string) => Promise<number>;
  saveCurrentDocument: () => Promise<void>;

  tabMgr: TabManager;
  buildSidebar: () => void;
  setStatus: (msg: string) => void;
}

export interface OpenPathOptions {
  onLoadStateChange?: (loading: boolean) => void;
  saveCurrent?: boolean;
  targetLabel?: string;
}

type OpenFileResult =
  | { success: true; data: RendererDocumentData; path?: string; sourceFormat?: string; imported?: boolean }
  | { success: false; canceled: true }
  | { success: false; canceled?: false; error: string };

type OpenDocumentLoaderResult = RendererDocumentData | OpenFileResult | null;

export interface OpenedDocumentResult {
  data: RendererDocumentData;
  path?: string;
  sourceFormat?: string;
  imported?: boolean;
}

function isOpenFileResult(value: OpenDocumentLoaderResult): value is OpenFileResult {
  return !!value && typeof value === 'object' && 'success' in value && typeof value.success === 'boolean';
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
  deps.disposeEditorSurfaces();
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

function getSaveValidationMessage(fileData: RendererDocumentData, tabMgr: TabManager): string | null {
  if (fileData._fileType === 'risup') {
    const risupValidationMessage = getRisupValidationMessage(fileData);
    if (risupValidationMessage) {
      return risupValidationMessage;
    }
  }

  return getTriggerDraftValidationMessage(tabMgr);
}

function applyLoadedDocument(deps: FileActionDeps, data: RendererDocumentData): void {
  const store = useAppStore();
  deps.setFileData(data);
  resetEditorUI(deps);
  store.clearRestoredSessionState();
  store.setFileLabel(`${data.name || 'Untitled'}`);
  deps.buildSidebar();
}

async function confirmDocumentReplacement(
  deps: FileActionDeps,
  targetLabel: string,
  options?: OpenPathOptions,
): Promise<boolean> {
  if (!deps.hasUnsavedChanges()) {
    return true;
  }

  if (options?.saveCurrent) {
    try {
      await deps.saveCurrentDocument();
    } catch {
      return false;
    }
    return deps.tabMgr.dirtyFields.size === 0;
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

async function openDocumentWithLoader(
  deps: FileActionDeps,
  targetLabel: string,
  loader: () => Promise<OpenDocumentLoaderResult>,
  options?: OpenPathOptions,
): Promise<OpenedDocumentResult | null> {
  if (!(await confirmDocumentReplacement(deps, targetLabel, options))) return null;
  deps.setStatus('파일 열기 중...');
  options?.onLoadStateChange?.(true);
  try {
    const result = await loader();
    const data = isOpenFileResult(result) ? (result.success ? result.data : null) : result;
    if (isOpenFileResult(result) && !result.success && !result.canceled) {
      throw new Error(result.error);
    }
    if (!data) {
      deps.setStatus('준비');
      return null;
    }
    applyLoadedDocument(deps, data);
    deps.setStatus(`파일 열림: ${data.name}`);
    if (isOpenFileResult(result) && result.success) {
      return {
        data,
        path: result.path,
        sourceFormat: result.sourceFormat,
        imported: result.imported,
      };
    }
    return { data };
  } finally {
    options?.onLoadStateChange?.(false);
  }
}

export async function handleNew(deps: FileActionDeps): Promise<boolean> {
  const store = useAppStore();
  if (!(await confirmDocumentReplacement(deps, '새 파일'))) return false;
  const data = await window.tokiAPI.newFile();
  if (!data) return false;
  deps.setFileData(data);
  resetEditorUI(deps);

  store.clearRestoredSessionState();
  store.setFileLabel('New Character');

  deps.buildSidebar();
  deps.setStatus('새 파일 생성됨');
  return true;
}

export async function handleOpen(deps: FileActionDeps): Promise<OpenedDocumentResult | null> {
  try {
    return await openDocumentWithLoader(deps, '파일 열기', () => window.tokiAPI.openFile());
  } catch (err) {
    console.error('[renderer] handleOpen error:', err);
    deps.setStatus(`열기 실패: ${(err as Error).message}`);
    return null;
  }
}

export async function handleOpenPath(
  deps: FileActionDeps,
  filePath: string,
  options?: OpenPathOptions,
): Promise<RendererDocumentData | null> {
  try {
    const result = await openDocumentWithLoader(
      deps,
      options?.targetLabel || filePath,
      () => window.tokiAPI.openFilePath(filePath),
      options,
    );
    return result?.data || null;
  } catch (err) {
    console.error('[renderer] handleOpenPath error:', err);
    deps.setStatus(`열기 실패: ${(err as Error).message}`);
    throw err;
  }
}

export async function handleSave(deps: FileActionDeps): Promise<void> {
  const store = useAppStore();
  const fileData = deps.getFileData();
  if (!fileData) return;
  syncEditorToActiveTab(deps);
  const validationMessage = getSaveValidationMessage(fileData, deps.tabMgr);
  if (validationMessage) {
    deps.setStatus(validationMessage);
    return;
  }
  try {
    const submitted = JSON.stringify(fileData);
    const result = await window.tokiAPI.saveFile(fileData);
    if (result.success) {
      if (deps.getFileData() !== fileData) return;
      if (JSON.stringify(fileData) !== submitted) {
        deps.setStatus('저장 완료. 저장 중 추가된 변경사항은 아직 저장되지 않았어요.');
        return;
      }
      deps.tabMgr.dirtyFields.clear();
      deps.tabMgr.renderTabs();
      deps.buildSidebar();
      store.clearRestoredSessionState();
      deps.setStatus('저장 완료');
      window.tokiAPI.cleanupAutosave(deps.getAutosaveDir() || undefined);
    } else {
      deps.setStatus(`저장 실패: ${result.error}`);
    }
  } catch (err) {
    deps.setStatus(`저장 실패: ${(err as Error).message}`);
  }
}

export async function handleSaveAs(deps: FileActionDeps): Promise<void> {
  const store = useAppStore();
  const fileData = deps.getFileData();
  if (!fileData) return;
  syncEditorToActiveTab(deps);
  const validationMessage = getSaveValidationMessage(fileData, deps.tabMgr);
  if (validationMessage) {
    deps.setStatus(validationMessage);
    return;
  }
  try {
    const submitted = JSON.stringify(fileData);
    const result = await window.tokiAPI.saveFileAs(fileData);
    if (result.success) {
      if (deps.getFileData() !== fileData) return;
      if (JSON.stringify(fileData) !== submitted) {
        deps.setStatus('저장 완료. 저장 중 추가된 변경사항은 아직 저장되지 않았어요.');
        return;
      }
      deps.tabMgr.dirtyFields.clear();
      deps.tabMgr.renderTabs();
      deps.buildSidebar();
      store.clearRestoredSessionState();
      deps.setStatus(`저장 완료: ${result.path}`);
    } else if (result.error) {
      deps.setStatus(`저장 실패: ${result.error}`);
    } else {
      deps.setStatus(`저장 취소`);
    }
  } catch (err) {
    deps.setStatus(`저장 실패: ${(err as Error).message}`);
  }
}
