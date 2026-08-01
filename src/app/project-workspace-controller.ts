import { createFolderItem, createSectionHeader, createTreeItem } from '../lib/sidebar-builder';
import type { RendererDocumentData } from '../lib/document-types';
import type { TabManager } from '../lib/tab-manager';

export interface ProjectWorkspaceTreeNode {
  name: string;
  type: 'directory' | 'file';
  relativePath: string;
  children?: ProjectWorkspaceTreeNode[];
}

type ProjectReloadResult =
  | { success: true; data: RendererDocumentData; projectPath: string }
  | { success: false; error?: string };

interface ProjectWorkspaceApi {
  getProjectTree(): Promise<ProjectWorkspaceTreeNode | null>;
  readProjectFile(relativePath: string): Promise<string>;
  reloadProjectFolder(): Promise<ProjectReloadResult>;
  writeProjectFile(relativePath: string, content: string): Promise<boolean>;
}

type ProjectWorkspaceTabManager = Pick<
  TabManager,
  'activeTabId' | 'dirtyFields' | 'findTab' | 'openTab' | 'openTabs' | 'renderTabs'
>;

export interface ProjectWorkspaceControllerDeps {
  api: ProjectWorkspaceApi;
  tabManager: ProjectWorkspaceTabManager;
  applyReloadedProject(data: RendererDocumentData, projectPath?: string): void;
  getEditorValue(): string | null;
  openImageTab(assetPath: string, fileName: string): void;
  setStatus(message: string): void;
  syncDelayMs?: number;
}

export interface ProjectWorkspaceController {
  appendFilesSidebar(tree: HTMLElement): Promise<void>;
  clearRawSyncState(): void;
  handleFolderChanged(payload: { fileName?: string; path?: string }): Promise<void>;
  syncActiveFileTab(): Promise<boolean>;
}

export function projectFileLanguage(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.lua')) return 'lua';
  return 'plaintext';
}

export function projectFileIcon(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.match(/\.(png|jpg|jpeg|webp|gif)$/)) return '🖼';
  if (lower.endsWith('.json')) return '{}';
  if (lower.endsWith('.md')) return '📝';
  return '·';
}

export function validateProjectRawFile(relativePath: string, content: string): string | null {
  if (!relativePath.toLowerCase().endsWith('.json')) return null;
  try {
    JSON.parse(content);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

export function getProjectRelativePathFromTabId(tabId: string): string | null {
  return tabId.startsWith('project:') ? tabId.slice('project:'.length) : null;
}

export function createProjectWorkspaceController(deps: ProjectWorkspaceControllerDeps): ProjectWorkspaceController {
  const rawSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const syncDelayMs = deps.syncDelayMs ?? 700;

  async function reloadAfterRawFileSync(tabId: string, relativePath: string): Promise<boolean> {
    const result = await deps.api.reloadProjectFolder();
    if (!result.success) {
      deps.setStatus(`프로젝트 원본 파일 오류: ${result.error || '프로젝트를 다시 읽을 수 없습니다.'}`);
      return false;
    }
    deps.applyReloadedProject(result.data, result.projectPath);
    deps.tabManager.dirtyFields.delete(tabId);
    deps.tabManager.renderTabs();
    deps.setStatus(`프로젝트 원본 파일 동기화됨: ${relativePath}`);
    return true;
  }

  async function syncRawFileTab(tabId: string, relativePath: string, content: string): Promise<boolean> {
    const validationError = validateProjectRawFile(relativePath, content);
    if (validationError) {
      deps.setStatus(`프로젝트 원본 파일 오류: ${relativePath} JSON 형식 오류 - ${validationError}`);
      return false;
    }

    try {
      await deps.api.writeProjectFile(relativePath, content);
      return await reloadAfterRawFileSync(tabId, relativePath);
    } catch (error) {
      deps.setStatus(`프로젝트 원본 파일 오류: ${(error as Error).message}`);
      return false;
    }
  }

  function scheduleRawFileSync(tabId: string, relativePath: string, getContent: () => string): void {
    const existing = rawSyncTimers.get(tabId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      rawSyncTimers.delete(tabId);
      if (!deps.tabManager.findTab(tabId)) return;
      void syncRawFileTab(tabId, relativePath, getContent());
    }, syncDelayMs);
    rawSyncTimers.set(tabId, timer);
  }

  async function flushRawFileTab(tabId: string, content: string): Promise<boolean> {
    const relativePath = getProjectRelativePathFromTabId(tabId);
    if (!relativePath) return true;
    const timer = rawSyncTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      rawSyncTimers.delete(tabId);
    }
    return syncRawFileTab(tabId, relativePath, content);
  }

  async function openProjectFileTab(relativePath: string): Promise<void> {
    const lower = relativePath.toLowerCase();
    if (lower.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
      deps.openImageTab(relativePath, relativePath.split('/').pop() || relativePath);
      return;
    }
    let content = await deps.api.readProjectFile(relativePath);
    const tabId = `project:${relativePath}`;
    deps.tabManager.openTab(
      tabId,
      `[원본] ${relativePath}`,
      projectFileLanguage(relativePath),
      () => content,
      (value) => {
        content = String(value ?? '');
        scheduleRawFileSync(tabId, relativePath, () => content);
      },
    );
  }

  function appendTreeNode(parent: HTMLElement, node: ProjectWorkspaceTreeNode, indent: number): void {
    if (node.type === 'directory') {
      const folder = createFolderItem(node.name, '📁', indent);
      parent.appendChild(folder.header);
      parent.appendChild(folder.children);
      for (const child of node.children || []) appendTreeNode(folder.children, child, indent + 1);
      return;
    }
    const item = createTreeItem(node.name, projectFileIcon(node.relativePath), indent);
    item.addEventListener('click', () => void openProjectFileTab(node.relativePath));
    parent.appendChild(item);
  }

  return {
    async appendFilesSidebar(tree) {
      const projectTree = await deps.api.getProjectTree();
      if (!projectTree) return;
      tree.appendChild(createSectionHeader('고급'));
      const folder = createFolderItem('프로젝트 원본 파일', '📁', 0);
      folder.header.title = '고급: 폴더의 원본 파일을 직접 열어 편집합니다.';
      tree.appendChild(folder.header);
      tree.appendChild(folder.children);
      const hint = document.createElement('div');
      hint.className = 'project-raw-hint';
      hint.textContent = '고급 원본 파일 · 일반 편집은 위 구조화 항목을 사용하세요';
      folder.children.appendChild(hint);
      for (const child of projectTree.children || []) appendTreeNode(folder.children, child, 1);
    },

    clearRawSyncState() {
      for (const timer of rawSyncTimers.values()) clearTimeout(timer);
      rawSyncTimers.clear();
    },

    async handleFolderChanged(payload) {
      if (deps.tabManager.dirtyFields.size > 0) {
        deps.setStatus(
          `프로젝트 파일 변경 감지됨: ${payload.fileName || payload.path}. 저장되지 않은 탭이 있어 자동 반영하지 않았습니다.`,
        );
        return;
      }
      const result = await deps.api.reloadProjectFolder();
      if (!result.success) {
        deps.setStatus(`프로젝트 다시 불러오기 실패: ${result.error || '알 수 없는 오류'}`);
        return;
      }
      deps.applyReloadedProject(result.data, result.projectPath);
      deps.setStatus(`프로젝트 변경 반영됨: ${payload.fileName || payload.path}`);
    },

    async syncActiveFileTab() {
      const tabId = deps.tabManager.activeTabId;
      const content = deps.getEditorValue();
      if (!tabId?.startsWith('project:') || content === null) return true;
      const tab = deps.tabManager.openTabs.find((entry) => entry.id === tabId);
      if (!tab?.setValue) return true;
      const ok = await flushRawFileTab(tab.id, content);
      if (ok) {
        deps.tabManager.dirtyFields.delete(tab.id);
        deps.tabManager.renderTabs();
      }
      return ok;
    },
  };
}
