import { describe, expect, it, vi } from 'vitest';

import {
  createProjectWorkspaceController,
  getProjectRelativePathFromTabId,
  projectFileIcon,
  projectFileLanguage,
  validateProjectRawFile,
  type ProjectWorkspaceControllerDeps,
} from './project-workspace-controller';

function createDeps(options?: {
  activeTabId?: string | null;
  content?: string | null;
  dirty?: boolean;
  reloadResult?: Awaited<ReturnType<ProjectWorkspaceControllerDeps['api']['reloadProjectFolder']>>;
}) {
  const activeTabId = options?.activeTabId ?? 'project:card.json';
  const tab = {
    id: activeTabId || 'project:card.json',
    label: 'card.json',
    language: 'json',
    getValue: () => options?.content ?? '{"name":"Updated"}',
    setValue: vi.fn(),
    _lastValue: null,
  };
  const dirtyFields = new Set<string>(options?.dirty === false ? [] : [tab.id]);
  const renderTabs = vi.fn();
  const writeProjectFile = vi.fn().mockResolvedValue(true);
  const reloadProjectFolder = vi.fn().mockResolvedValue(
    options?.reloadResult ?? {
      success: true,
      data: { name: 'Updated' },
      projectPath: 'C:\\cards\\project',
    },
  );
  const applyReloadedProject = vi.fn();
  const setStatus = vi.fn();

  const deps: ProjectWorkspaceControllerDeps = {
    api: {
      getProjectTree: vi.fn().mockResolvedValue(null),
      readProjectFile: vi.fn().mockResolvedValue(''),
      reloadProjectFolder,
      writeProjectFile,
    },
    tabManager: {
      activeTabId,
      dirtyFields,
      findTab: vi.fn().mockReturnValue(tab),
      openTab: vi.fn(),
      openTabs: [tab],
      renderTabs,
    } as unknown as ProjectWorkspaceControllerDeps['tabManager'],
    applyReloadedProject,
    getEditorValue: () => options?.content ?? '{"name":"Updated"}',
    openImageTab: vi.fn(),
    setStatus,
  };

  return {
    applyReloadedProject,
    deps,
    dirtyFields,
    reloadProjectFolder,
    renderTabs,
    setStatus,
    writeProjectFile,
  };
}

describe('project-workspace-controller', () => {
  it('classifies project files and project tab ids', () => {
    expect(projectFileLanguage('content/description.md')).toBe('markdown');
    expect(projectFileLanguage('scripts/main.lua')).toBe('lua');
    expect(projectFileLanguage('assets/photo.webp')).toBe('plaintext');
    expect(projectFileIcon('assets/photo.webp')).toBe('🖼');
    expect(projectFileIcon('card.json')).toBe('{}');
    expect(getProjectRelativePathFromTabId('project:content/description.md')).toBe('content/description.md');
    expect(getProjectRelativePathFromTabId('description')).toBeNull();
  });

  it('rejects invalid JSON before writing a raw project file', async () => {
    const fixture = createDeps({ content: '{invalid' });
    const controller = createProjectWorkspaceController(fixture.deps);

    await expect(controller.syncActiveFileTab()).resolves.toBe(false);

    expect(fixture.writeProjectFile).not.toHaveBeenCalled();
    expect(fixture.reloadProjectFolder).not.toHaveBeenCalled();
    expect(fixture.setStatus).toHaveBeenCalledWith(expect.stringContaining('JSON 형식 오류'));
    expect(validateProjectRawFile('notes.md', '{invalid')).toBeNull();
  });

  it('writes, reloads, and clears the dirty project tab on a successful flush', async () => {
    const fixture = createDeps();
    const controller = createProjectWorkspaceController(fixture.deps);

    await expect(controller.syncActiveFileTab()).resolves.toBe(true);

    expect(fixture.writeProjectFile).toHaveBeenCalledWith('card.json', '{"name":"Updated"}');
    expect(fixture.applyReloadedProject).toHaveBeenCalledWith({ name: 'Updated' }, 'C:\\cards\\project');
    expect(fixture.dirtyFields.has('project:card.json')).toBe(false);
    expect(fixture.renderTabs).toHaveBeenCalled();
  });

  it('does not reload an externally changed project while editor tabs are dirty', async () => {
    const fixture = createDeps();
    const controller = createProjectWorkspaceController(fixture.deps);

    await controller.handleFolderChanged({ fileName: 'card.json' });

    expect(fixture.reloadProjectFolder).not.toHaveBeenCalled();
    expect(fixture.setStatus).toHaveBeenCalledWith(expect.stringContaining('자동 반영하지 않았습니다'));
  });
});
