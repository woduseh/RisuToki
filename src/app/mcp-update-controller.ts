import type { LorebookEntry, RegexEntry, RendererDocumentData } from '../lib/document-types';
import { planMcpDataUpdate, type McpDataUpdatePlan } from '../lib/mcp-data-update';
import type { Tab, TabManager } from '../lib/tab-manager';

interface EditorSurface {
  getPosition(): unknown;
  setPosition(position: never): void;
  setValue(value: string): void;
}

type IndexedTabBuilder = (index: number, tab: Tab) => Partial<Tab> | null;

export interface McpUpdateControllerDeps {
  tabManager: Pick<TabManager, 'activeTabId' | 'markFieldDirty' | 'openTabs' | 'refreshIndexedTabs'>;
  getFileData: () => RendererDocumentData | null;
  getEditor: () => EditorSurface | null;
  formTabTypes: ReadonlySet<string>;
  createBackup: (tabId: string, value: unknown) => void;
  buildSidebar: () => void;
  buildLorebookTabState: IndexedTabBuilder;
  buildRegexTabState: IndexedTabBuilder;
  buildLuaSectionTabState: IndexedTabBuilder;
  buildCssSectionTabState: IndexedTabBuilder;
  buildRisupTabState: (field: string, tab: Tab) => Partial<Tab> | null;
  applyTriggerScriptsUpdate: (value: unknown) => McpDataUpdatePlan;
  mergeLuaIntoTriggerScripts: (triggerScripts: string, lua: string) => string;
  updateLuaSections: (lua: string) => void;
  updateCssSections: (css: string) => void;
  setFileLabel: (label: string) => void;
  setStatus: (message: string) => void;
}

function refreshEditor(editor: EditorSurface, value: unknown): void {
  const position = editor.getPosition();
  editor.setValue(typeof value === 'string' ? value : '');
  if (position) editor.setPosition(position as never);
}

function refreshActiveIndexedEditor(deps: McpUpdateControllerDeps, prefix: string): void {
  const activeTabId = deps.tabManager.activeTabId;
  const editor = deps.getEditor();
  if (!activeTabId?.startsWith(prefix) || !editor) return;
  const activeTab = deps.tabManager.openTabs.find((tab) => tab.id === activeTabId);
  if (activeTab && !deps.formTabTypes.has(activeTab.language)) {
    refreshEditor(editor, activeTab.getValue?.());
  }
}

export function handleMcpDataUpdate(deps: McpUpdateControllerDeps, field: string, value: unknown): void {
  const fileData = deps.getFileData();
  if (!fileData) return;

  const updatePlan =
    field === 'triggerScripts'
      ? deps.applyTriggerScriptsUpdate(value)
      : planMcpDataUpdate(field, deps.tabManager.openTabs);

  if (field !== 'triggerScripts') {
    for (const tabId of updatePlan.backupTabIds) {
      const tab = deps.tabManager.openTabs.find((entry) => entry.id === tabId);
      if (tab?.getValue) deps.createBackup(tab.id, tab.getValue());
    }
  }

  if (field === 'lorebook') {
    fileData.lorebook = value as LorebookEntry[];
    if (updatePlan.refreshSidebar) deps.buildSidebar();
    if (updatePlan.refreshIndexedPrefixes.includes('lore_')) {
      deps.tabManager.refreshIndexedTabs('lore_', deps.buildLorebookTabState);
    }
    refreshActiveIndexedEditor(deps, 'lore_');
  } else if (field === 'regex') {
    fileData.regex = value as RegexEntry[];
    if (updatePlan.refreshSidebar) deps.buildSidebar();
    if (updatePlan.refreshIndexedPrefixes.includes('regex_')) {
      deps.tabManager.refreshIndexedTabs('regex_', deps.buildRegexTabState);
    }
    refreshActiveIndexedEditor(deps, 'regex_');
  } else {
    if (field !== 'triggerScripts') fileData[field] = value;
    if (field === 'lua') {
      fileData.triggerScripts = deps.mergeLuaIntoTriggerScripts(fileData.triggerScripts, value as string);
      deps.updateLuaSections(value as string);
    }
    if (field === 'css') deps.updateCssSections(value as string);
    if (updatePlan.refreshSidebar) deps.buildSidebar();

    for (const prefix of updatePlan.refreshIndexedPrefixes) {
      if (prefix === 'lua_s') {
        deps.tabManager.refreshIndexedTabs(prefix, deps.buildLuaSectionTabState);
      } else if (prefix === 'css_s') {
        deps.tabManager.refreshIndexedTabs(prefix, deps.buildCssSectionTabState);
      } else if (prefix === 'risup_') {
        deps.tabManager.refreshIndexedTabs(prefix, (_index, tab) =>
          deps.buildRisupTabState(tab.id.replace('risup_', ''), tab),
        );
      }
    }

    const editor = deps.getEditor();
    if (field === deps.tabManager.activeTabId && editor) {
      const activeTab = deps.tabManager.openTabs.find((tab) => tab.id === field);
      refreshEditor(editor, activeTab?.getValue ? activeTab.getValue() : value);
    }
    if (field === 'lua') refreshActiveIndexedEditor(deps, 'lua_s');
    if (field === 'css') refreshActiveIndexedEditor(deps, 'css_s');
    if (updatePlan.updateFileLabel) deps.setFileLabel((value as string) || 'Untitled');
  }

  deps.setStatus(updatePlan.statusMessage);
  deps.tabManager.markFieldDirty(field);
}
