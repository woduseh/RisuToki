import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { handleNew, handleOpen, handleSave, handleSaveAs } from './file-actions';
import type { FileActionDeps } from './file-actions';
import { TabManager } from './tab-manager';
import { parseTriggerScriptsText } from './trigger-script-model';
import { useAppStore } from '../stores/app-store';

function makeDeps(overrides: Partial<FileActionDeps> = {}): FileActionDeps {
  const tabMgr = new TabManager('editor-tabs', {
    onActivateTab: vi.fn(),
    onDisposeFormEditors: vi.fn(),
    onClearEditor: vi.fn(),
    isPanelPoppedOut: () => false,
    onPopOutTab: vi.fn(),
    isFormTabType: () => false,
  });
  return {
    getFileData: vi.fn(() => ({ name: 'Test' })),
    setFileData: vi.fn(),
    getEditorInstance: vi.fn(() => null),
    setEditorInstance: vi.fn(),
    getAutosaveDir: vi.fn(() => ''),
    tabMgr,
    buildSidebar: vi.fn(),
    setStatus: vi.fn(),
    ...overrides,
  };
}

function installTokiAPI(api: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).tokiAPI = api;
}

describe('file-actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = `
      <div id="file-label"></div>
      <div id="editor-container"></div>
      <div id="editor-tabs"></div>
    `;
  });

  describe('handleNew', () => {
    it('resets editor and builds sidebar on success', async () => {
      const newData = { name: 'NewChar' };
      installTokiAPI({ newFile: vi.fn().mockResolvedValue(newData) });
      const deps = makeDeps();

      await handleNew(deps);

      expect(deps.setFileData).toHaveBeenCalledWith(newData);
      expect(deps.buildSidebar).toHaveBeenCalled();
      expect(deps.setStatus).toHaveBeenCalledWith('새 파일 생성됨');
      expect(useAppStore().fileLabel).toBe('New Character');
    });

    it('does nothing when newFile returns null', async () => {
      installTokiAPI({ newFile: vi.fn().mockResolvedValue(null) });
      const deps = makeDeps();

      await handleNew(deps);

      expect(deps.setFileData).not.toHaveBeenCalled();
      expect(deps.buildSidebar).not.toHaveBeenCalled();
    });
  });

  describe('handleOpen', () => {
    it('loads file and updates UI', async () => {
      const fileData = { name: 'Opened' };
      installTokiAPI({ openFile: vi.fn().mockResolvedValue(fileData) });
      const deps = makeDeps();

      await handleOpen(deps);

      expect(deps.setFileData).toHaveBeenCalledWith(fileData);
      expect(deps.buildSidebar).toHaveBeenCalled();
      expect(deps.setStatus).toHaveBeenCalledWith('파일 열림: Opened');
    });

    it('resets status when user cancels', async () => {
      installTokiAPI({ openFile: vi.fn().mockResolvedValue(null) });
      const deps = makeDeps();

      await handleOpen(deps);

      expect(deps.setStatus).toHaveBeenCalledWith('준비');
      expect(deps.setFileData).not.toHaveBeenCalled();
    });

    it('reports error on failure', async () => {
      installTokiAPI({ openFile: vi.fn().mockRejectedValue(new Error('disk fail')) });
      const deps = makeDeps();

      await handleOpen(deps);

      expect(deps.setStatus).toHaveBeenCalledWith('열기 실패: disk fail');
    });
  });

  describe('handleSave', () => {
    it('saves and clears dirty state on success', async () => {
      installTokiAPI({
        saveFile: vi.fn().mockResolvedValue({ success: true }),
        cleanupAutosave: vi.fn(),
      });
      const deps = makeDeps();
      deps.tabMgr.dirtyFields.add('test');

      await handleSave(deps);

      expect(deps.tabMgr.dirtyFields.size).toBe(0);
      expect(deps.setStatus).toHaveBeenCalledWith('저장 완료');
    });

    it('does nothing when no fileData', async () => {
      const saveFn = vi.fn();
      installTokiAPI({ saveFile: saveFn });
      const deps = makeDeps({ getFileData: vi.fn(() => null) });

      await handleSave(deps);

      expect(saveFn).not.toHaveBeenCalled();
    });

    it('reports error on failure', async () => {
      installTokiAPI({
        saveFile: vi.fn().mockResolvedValue({ success: false, error: 'perm denied' }),
      });
      const deps = makeDeps();

      await handleSave(deps);

      expect(deps.setStatus).toHaveBeenCalledWith('저장 실패: perm denied');
    });

    it('blocks saving risup files with invalid json-backed preset fields', async () => {
      const saveFile = vi.fn();
      installTokiAPI({
        saveFile,
        cleanupAutosave: vi.fn(),
      });
      const deps = makeDeps({
        getFileData: vi.fn(() => ({
          _fileType: 'risup',
          name: 'Preset',
          // promptTemplate and formatingOrder now use structured editors — no longer JSON-validated here
          promptTemplate: '{',
          presetBias: '{', // presetBias is still a 'json' field — invalid JSON should block save
          formatingOrder: '["main"]',
          localStopStrings: '[]',
        })),
      });

      await handleSave(deps);

      expect(saveFile).not.toHaveBeenCalled();
      expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('프리셋 바이어스'));
    });

    it('blocks saving risup files with invalid structured prompt fields', async () => {
      const saveFile = vi.fn();
      installTokiAPI({
        saveFile,
        cleanupAutosave: vi.fn(),
      });
      const deps = makeDeps({
        getFileData: vi.fn(() => ({
          _fileType: 'risup',
          name: 'Preset',
          promptTemplate: '{',
          presetBias: '{}',
          formatingOrder: '["main"]',
          localStopStrings: '[]',
        })),
      });

      await handleSave(deps);

      expect(saveFile).not.toHaveBeenCalled();
      expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('프롬프트 템플릿'));
    });

    it('blocks saving when an edited trigger form draft still contains unsupported content', async () => {
      const saveFile = vi.fn();
      installTokiAPI({
        saveFile,
        cleanupAutosave: vi.fn(),
      });
      const deps = makeDeps({
        getFileData: vi.fn(() => ({
          _fileType: 'charx',
          name: 'Trigger Card',
          triggerScripts: '[]',
        })),
      });
      const draft = parseTriggerScriptsText(
        JSON.stringify(
          [
            {
              comment: 'unsupported',
              type: 'manual',
              conditions: [{ type: 'timer', seconds: 5 }],
              effect: [{ type: 'triggerlua', code: 'print("blocked")' }],
              lowLevelAccess: false,
            },
          ],
          null,
          2,
        ),
      );
      deps.tabMgr.openTab('triggerScripts', '트리거 스크립트', '_triggerform', () => draft, vi.fn());
      deps.tabMgr.dirtyFields.add('triggerScripts');

      await handleSave(deps);

      expect(saveFile).not.toHaveBeenCalled();
      expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('지원되지 않는 트리거 조건/효과'));
    });
  });

  describe('handleSaveAs', () => {
    it('saves with path and clears dirty state', async () => {
      installTokiAPI({
        saveFileAs: vi.fn().mockResolvedValue({ success: true, path: '/new/path.charx' }),
      });
      const deps = makeDeps();
      deps.tabMgr.dirtyFields.add('test');

      await handleSaveAs(deps);

      expect(deps.tabMgr.dirtyFields.size).toBe(0);
      expect(deps.setStatus).toHaveBeenCalledWith('저장 완료: /new/path.charx');
    });

    it('reports cancel when user dismisses dialog', async () => {
      installTokiAPI({
        saveFileAs: vi.fn().mockResolvedValue({ success: false }),
      });
      const deps = makeDeps();

      await handleSaveAs(deps);

      expect(deps.setStatus).toHaveBeenCalledWith('저장 취소');
    });

    it('blocks save-as for risup files with invalid json-backed preset fields', async () => {
      const saveFileAs = vi.fn();
      installTokiAPI({
        saveFileAs,
      });
      const deps = makeDeps({
        getFileData: vi.fn(() => ({
          _fileType: 'risup',
          name: 'Preset',
          promptTemplate: '[]',
          presetBias: '[[',
          formatingOrder: '["main"]',
          localStopStrings: '[]',
        })),
      });

      await handleSaveAs(deps);

      expect(saveFileAs).not.toHaveBeenCalled();
      expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('프리셋 바이어스'));
    });

    it('blocks save-as when an edited trigger form draft still contains unsupported content', async () => {
      const saveFileAs = vi.fn();
      installTokiAPI({
        saveFileAs,
      });
      const deps = makeDeps({
        getFileData: vi.fn(() => ({
          _fileType: 'charx',
          name: 'Trigger Card',
          triggerScripts: '[]',
        })),
      });
      const draft = parseTriggerScriptsText(
        JSON.stringify(
          [
            {
              comment: 'unsupported',
              type: 'manual',
              conditions: [{ type: 'timer', seconds: 5 }],
              effect: [{ type: 'triggerlua', code: 'print("blocked")' }],
              lowLevelAccess: false,
            },
          ],
          null,
          2,
        ),
      );
      deps.tabMgr.openTab('triggerScripts', '트리거 스크립트', '_triggerform', () => draft, vi.fn());
      deps.tabMgr.dirtyFields.add('triggerScripts');

      await handleSaveAs(deps);

      expect(saveFileAs).not.toHaveBeenCalled();
      expect(deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('지원되지 않는 트리거 조건/효과'));
    });
  });
});
