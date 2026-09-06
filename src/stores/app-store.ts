import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Section } from '../lib/section-parser';
import { getTalkTitleForTheme, type CustomThemePalette, type ThemeId } from '../lib/theme-registry';
import type { RecentItem } from '../lib/app-settings';
import {
  getDefaultWorkspace,
  getInspectorContext,
  getWorkspaceDefinitions,
  defaultWorkspaceLayout,
  inferWorkspaceFromTab,
  isWorkspaceAvailable,
  type RightSidebarView,
  type UtilityToolId,
  type WorkspaceId,
} from '../lib/workspace-model';
import { readWorkspaceLayoutState } from '../lib/workspace-layout-state';
import type { ReferenceFile, RendererDocumentData } from '../lib/document-types';
export type { LorebookEntry, ReferenceFile, RegexEntry, RendererDocumentData } from '../lib/document-types';

export type RpMode = 'off' | 'toki' | 'aris' | 'custom';
export type StatusKind = 'info' | 'error';

export interface StatusOptions {
  kind?: StatusKind;
  sticky?: boolean;
}

export const useAppStore = defineStore('app', () => {
  // === File data ===
  const fileData = ref<RendererDocumentData | null>(null);
  const luaSections = ref<Section[]>([]);
  const cssSections = ref<Section[]>([]);
  const cssStylePrefix = ref('');
  const cssStyleSuffix = ref('');
  const referenceFiles = ref<ReferenceFile[]>([]);

  // === Editor state ===
  const monacoReady = ref(false);
  const activeTabId = ref<string | null>(null);
  const activeTabLanguage = ref<string>('');

  // === UI state ===
  const darkMode = ref(false);
  const themeId = ref<ThemeId>('toki');
  const customTheme = ref<CustomThemePalette | null>(null);
  const rpMode = ref<RpMode>('off');
  const rpCustomText = ref('');
  const bgmEnabled = ref(false);
  const bgmPath = ref('');
  const statusText = ref('');
  const statusKind = ref<StatusKind>('info');
  const statusSticky = ref(false);
  const documentStatsText = ref('');
  const fileLabel = ref('');
  const projectPath = ref<string | null>(null);
  const recentItems = ref<RecentItem[]>([]);
  const restoredSessionLabel = ref('');
  const restoredSessionStatusText = ref('');

  // === Autosave ===
  const autosaveEnabled = ref(false);
  const autosaveInterval = ref(60000);
  const autosaveDir = ref('');

  // === Layout ===
  const initialWorkspaceLayout = readWorkspaceLayoutState();
  const avatarVisible = ref(initialWorkspaceLayout.avatarVisible);
  const workspaceId = ref<WorkspaceId>('character');
  const navigatorVisible = ref(initialWorkspaceLayout.navigatorVisible);
  const rightSidebarView = ref<RightSidebarView | null>(initialWorkspaceLayout.rightSidebarView);
  const activeUtility = ref<UtilityToolId | null>(initialWorkspaceLayout.activeUtility);
  const navigatorWidth = ref(initialWorkspaceLayout.navigatorWidth);
  const inspectorWidth = ref(initialWorkspaceLayout.inspectorWidth);
  const utilityHeight = ref(initialWorkspaceLayout.utilityHeight);
  const assetWizardOpen = ref(false);
  const previewFocusMode = ref(false);
  let previewFocusSnapshot: {
    navigatorVisible: boolean;
    rightSidebarView: RightSidebarView | null;
    activeUtility: UtilityToolId | null;
  } | null = null;

  // === Computed ===
  const hasFile = computed(() => fileData.value !== null);
  const isRisum = computed(() => fileData.value?._fileType === 'risum');
  const canPreviewCurrentFile = computed(() => {
    // Markdown documents (e.g. guide files) can be previewed even with no charx
    // file loaded.
    if (activeTabLanguage.value === 'markdown') return true;
    if (!fileData.value) return false;
    const fileType = fileData.value._fileType || 'charx';
    return fileType === 'charx';
  });
  const talkTitle = computed(() => getTalkTitleForTheme(themeId.value, customTheme.value));
  const rpLabel = computed(() => {
    if (rpMode.value === 'off') return 'OFF';
    if (rpMode.value === 'toki') return '토키';
    if (rpMode.value === 'aris') return '아리스';
    if (rpMode.value === 'custom') return '커스텀';
    return 'OFF';
  });
  const displayFileLabel = computed(() =>
    restoredSessionLabel.value ? `${fileLabel.value} [${restoredSessionLabel.value}]` : fileLabel.value,
  );
  const workspaceDefinitions = computed(() => getWorkspaceDefinitions(fileData.value));
  const inspectorContext = computed(() => getInspectorContext(activeTabId.value));
  const hasInspectorContext = computed(() => inspectorContext.value.kind !== 'empty');
  const inspectorVisible = computed(() => rightSidebarView.value === 'inspector');
  const guidesVisible = computed(() => rightSidebarView.value === 'guides');
  const referencesVisible = computed(() => rightSidebarView.value === 'references');
  const activityVisible = computed(() => rightSidebarView.value === 'activity');
  const rightSidebarVisible = computed(
    () =>
      rightSidebarView.value === 'references' ||
      rightSidebarView.value === 'guides' ||
      rightSidebarView.value === 'activity',
  );

  // === Actions ===
  function setFileData(data: RendererDocumentData | null) {
    setPreviewFocusMode(false);
    fileData.value = data;
    // A tab id only has meaning inside the document that created it. Clearing
    // it here prevents a newly opened CHARX/RISUM/RISUP file from inheriting
    // the previous document's contextual inspector while its editor is empty.
    activeTabId.value = null;
    activeTabLanguage.value = '';
    if (!isWorkspaceAvailable(data, workspaceId.value)) workspaceId.value = getDefaultWorkspace(data);
  }

  function setStatus(text: string, options: StatusOptions = {}) {
    statusText.value = text;
    statusKind.value = options.kind ?? 'info';
    statusSticky.value = options.sticky ?? false;
  }

  function clearStatus() {
    statusText.value = '';
    statusKind.value = 'info';
    statusSticky.value = false;
  }

  function setDocumentStatsText(text: string) {
    documentStatsText.value = text;
  }

  function setFileLabel(label: string) {
    fileLabel.value = label;
  }

  function setProjectPath(path: string | null) {
    projectPath.value = path;
  }

  function setRecentItems(items: RecentItem[]) {
    recentItems.value = items.slice();
  }

  function setRestoredSessionLabel(label: string) {
    restoredSessionLabel.value = label;
  }

  function showRestoredSessionStatus(text: string) {
    restoredSessionStatusText.value = text;
    setStatus(text, { kind: 'info', sticky: true });
  }

  function clearRestoredSessionState() {
    restoredSessionLabel.value = '';
    if (restoredSessionStatusText.value && statusText.value === restoredSessionStatusText.value && statusSticky.value) {
      clearStatus();
    }
    restoredSessionStatusText.value = '';
  }

  function setDarkMode(value: boolean) {
    darkMode.value = value;
  }

  function setThemeId(value: ThemeId) {
    themeId.value = value;
  }

  function setCustomTheme(value: CustomThemePalette | null) {
    customTheme.value = value;
  }

  function setRpMode(mode: RpMode) {
    rpMode.value = mode;
  }

  function setMonacoReady(ready: boolean) {
    monacoReady.value = ready;
  }

  function setActiveTabId(id: string | null) {
    activeTabId.value = id;
    const inferred = inferWorkspaceFromTab(id, fileData.value);
    if (inferred && isWorkspaceAvailable(fileData.value, inferred)) workspaceId.value = inferred;
    // Selecting content must not replace the reference material being consulted.
    if (id && typeof window !== 'undefined' && window.innerWidth < 1020) navigatorVisible.value = false;
  }

  function setWorkspaceId(id: WorkspaceId) {
    if (isWorkspaceAvailable(fileData.value, id)) workspaceId.value = id;
  }

  function abandonPreviewFocusMode() {
    if (!previewFocusMode.value) return;
    previewFocusSnapshot = null;
    previewFocusMode.value = false;
  }

  function toggleNavigator() {
    abandonPreviewFocusMode();
    navigatorVisible.value = !navigatorVisible.value;
    if (navigatorVisible.value && typeof window !== 'undefined' && window.innerWidth < 1020) {
      rightSidebarView.value = null;
    }
  }

  function toggleInspector() {
    setRightSidebarView(rightSidebarView.value === 'inspector' ? null : 'inspector');
  }

  function toggleUtility(tool: UtilityToolId) {
    abandonPreviewFocusMode();
    activeUtility.value = activeUtility.value === tool ? null : tool;
  }

  function setActiveUtility(tool: UtilityToolId | null) {
    abandonPreviewFocusMode();
    activeUtility.value = tool;
  }

  function toggleReferences() {
    setRightSidebarView(rightSidebarView.value === 'references' ? null : 'references');
  }

  function setReferencesVisible(visible: boolean) {
    abandonPreviewFocusMode();
    if (visible) rightSidebarView.value = 'references';
    else if (rightSidebarView.value === 'references' || rightSidebarView.value === 'guides') {
      rightSidebarView.value = null;
    }
  }

  function setRightSidebarView(view: RightSidebarView | null) {
    abandonPreviewFocusMode();
    rightSidebarView.value = view;
    if (view && typeof window !== 'undefined' && window.innerWidth < 1180) {
      navigatorVisible.value = false;
    }
  }

  function toggleAvatar() {
    abandonPreviewFocusMode();
    if (activeUtility.value !== 'terminal') {
      activeUtility.value = 'terminal';
      avatarVisible.value = true;
      return;
    }
    avatarVisible.value = !avatarVisible.value;
  }

  function setAssetWizardOpen(open: boolean) {
    assetWizardOpen.value = open;
  }

  function togglePreviewFocusMode(): boolean {
    setPreviewFocusMode(!previewFocusMode.value);
    return previewFocusMode.value;
  }

  function setPreviewFocusMode(focused: boolean) {
    if (focused === previewFocusMode.value) return;
    if (focused) {
      previewFocusSnapshot = {
        navigatorVisible: navigatorVisible.value,
        rightSidebarView: rightSidebarView.value,
        activeUtility: activeUtility.value,
      };
      previewFocusMode.value = true;
      navigatorVisible.value = false;
      rightSidebarView.value = null;
      activeUtility.value = null;
      return;
    }

    const snapshot = previewFocusSnapshot;
    previewFocusSnapshot = null;
    if (snapshot) {
      navigatorVisible.value = snapshot.navigatorVisible;
      rightSidebarView.value = snapshot.rightSidebarView;
      activeUtility.value = snapshot.activeUtility;
    }
    previewFocusMode.value = false;
  }

  function setNavigatorWidth(width: number) {
    navigatorWidth.value = Math.min(440, Math.max(220, width));
  }

  function setInspectorWidth(width: number) {
    inspectorWidth.value = Math.min(480, Math.max(260, width));
  }

  function setUtilityHeight(height: number) {
    utilityHeight.value = Math.min(520, Math.max(130, height));
  }

  function resetWorkspaceLayout() {
    abandonPreviewFocusMode();
    const layout = defaultWorkspaceLayout();
    navigatorWidth.value = layout.navigatorWidth;
    inspectorWidth.value = layout.inspectorWidth;
    utilityHeight.value = layout.utilityHeight;
    navigatorVisible.value = layout.navigatorVisible;
    avatarVisible.value = layout.avatarVisible;
    rightSidebarView.value = layout.rightSidebarView;
    activeUtility.value = layout.activeUtility;
    workspaceId.value = getDefaultWorkspace(fileData.value);
  }

  function setActiveTabLanguage(language: string) {
    activeTabLanguage.value = language;
  }

  function setLuaSections(sections: Section[]) {
    luaSections.value = sections;
  }

  function setCssSections(sections: Section[], prefix: string, suffix: string) {
    cssSections.value = sections;
    cssStylePrefix.value = prefix;
    cssStyleSuffix.value = suffix;
  }

  function setReferenceFiles(files: ReferenceFile[]) {
    referenceFiles.value = files;
  }

  return {
    // State
    fileData,
    luaSections,
    cssSections,
    cssStylePrefix,
    cssStyleSuffix,
    referenceFiles,
    monacoReady,
    activeTabId,
    activeTabLanguage,
    darkMode,
    themeId,
    customTheme,
    rpMode,
    rpCustomText,
    bgmEnabled,
    bgmPath,
    statusText,
    statusKind,
    statusSticky,
    documentStatsText,
    fileLabel,
    recentItems,
    restoredSessionLabel,
    autosaveEnabled,
    autosaveInterval,
    autosaveDir,
    avatarVisible,
    rightSidebarView,
    guidesVisible,
    referencesVisible,
    activityVisible,
    workspaceId,
    navigatorVisible,
    inspectorVisible,
    activeUtility,
    assetWizardOpen,
    previewFocusMode,
    navigatorWidth,
    inspectorWidth,
    utilityHeight,
    // Computed
    hasFile,
    isRisum,
    canPreviewCurrentFile,
    talkTitle,
    rpLabel,
    displayFileLabel,
    workspaceDefinitions,
    inspectorContext,
    hasInspectorContext,
    rightSidebarVisible,
    // Actions
    setFileData,
    setStatus,
    clearStatus,
    setDocumentStatsText,
    setFileLabel,
    projectPath,
    setProjectPath,
    setRecentItems,
    setRestoredSessionLabel,
    showRestoredSessionStatus,
    clearRestoredSessionState,
    setDarkMode,
    setThemeId,
    setCustomTheme,
    setRpMode,
    setMonacoReady,
    setActiveTabId,
    setWorkspaceId,
    toggleNavigator,
    toggleInspector,
    toggleUtility,
    setActiveUtility,
    toggleReferences,
    setReferencesVisible,
    setRightSidebarView,
    toggleAvatar,
    setAssetWizardOpen,
    togglePreviewFocusMode,
    setPreviewFocusMode,
    setNavigatorWidth,
    setInspectorWidth,
    setUtilityHeight,
    resetWorkspaceLayout,
    setActiveTabLanguage,
    setLuaSections,
    setCssSections,
    setReferenceFiles,
  };
});
