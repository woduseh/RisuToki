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
  type UtilityToolId,
  type WorkspaceId,
} from '../lib/workspace-model';
import { readWorkspaceLayoutState } from '../lib/workspace-layout-state';

// CharxData represents the loaded .charx file data
export interface CharxData {
  name: string;
  description: string;
  firstMessage: string;
  alternateGreetings: string[];
  groupOnlyGreetings: string[];
  globalNote: string;
  css: string;
  defaultVariables: string;
  lua: string;
  triggerScripts: string;
  lorebook: LorebookEntry[];
  regex: RegexEntry[];
  _fileType?: string;

  // Charx card.data fields
  personality?: string;
  scenario?: string;
  creatorcomment?: string;
  tags?: string[];
  exampleMessage?: string;
  systemPrompt?: string;
  creator?: string;
  characterVersion?: string;
  nickname?: string;
  source?: string[];
  creationDate?: number;
  modificationDate?: number;

  // RisuAI extension fields
  additionalText?: string;
  license?: string;

  // Risum module-specific fields
  moduleName?: string;
  moduleDescription?: string;
  moduleId?: string;
  cjs?: string;
  lowLevelAccess?: boolean;
  hideIcon?: boolean;
  backgroundEmbedding?: string;
  moduleNamespace?: string;
  customModuleToggle?: string;
  mcpUrl?: string;

  // Risup preset fields (basic)
  mainPrompt?: string;
  jailbreak?: string;
  temperature?: number;
  maxContext?: number;
  maxResponse?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  aiModel?: string;
  subModel?: string;
  apiType?: string;
  promptPreprocess?: boolean;
  promptTemplate?: string;
  presetBias?: string;
  formatingOrder?: string;
  presetImage?: string;

  // Risup preset fields (sampling)
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  min_p?: number;
  top_a?: number;

  // Risup preset fields (thinking/reasoning)
  reasonEffort?: number;
  thinkingTokens?: number;
  thinkingType?: string;
  adaptiveThinkingEffort?: string;

  // Risup preset fields (templates & formatting)
  useInstructPrompt?: boolean;
  instructChatTemplate?: string;
  JinjaTemplate?: string;
  customPromptTemplateToggle?: string;
  templateDefaultVariables?: string;
  moduleIntergration?: string;

  // Risup preset fields (JSON schema)
  jsonSchemaEnabled?: boolean;
  jsonSchema?: string;
  strictJsonSchema?: boolean;
  extractJson?: string;

  // Risup preset fields (group & misc)
  groupTemplate?: string;
  groupOtherBotRole?: string;
  autoSuggestPrompt?: string;
  autoSuggestPrefix?: string;
  autoSuggestClean?: boolean;
  localStopStrings?: string;
  outputImageModal?: boolean;
  verbosity?: number;
  fallbackWhenBlankResponse?: boolean;
  systemContentReplacement?: string;
  systemRoleReplacement?: string;
  promptSettings?: string;
  customAPIFormat?: string;
  openrouterProvider?: string;
  seperateParametersEnabled?: boolean;
  seperateParameters?: string;
  fallbackModels?: string;
  seperateModels?: string;
  modelTools?: string;
  customFlags?: string;
  enableCustomFlags?: boolean;
  dynamicOutput?: string;
  deepseekThinkingType?: string;
  deepseekReasoningEffort?: string;
  proxyRequestModel?: string;
  openrouterRequestModel?: string;
  customProxyRequestModel?: string;
  reverseProxyOobaArgs?: string;
  koboldURL?: string;
  forceReplaceUrl?: string;
  textgenWebUIStreamURL?: string;
  textgenWebUIBlockingURL?: string;
  localNetworkMode?: boolean;
  localNetworkTimeoutSec?: number;

  [key: string]: unknown;
}

export interface LorebookEntry {
  key: string;
  secondkey: string;
  comment: string;
  content: string;
  mode: string;
  insertorder: number;
  order: number;
  priority: number;
  alwaysActive: boolean;
  forceActivation: boolean;
  selective: boolean;
  constant: boolean;
  useRegex: boolean;
  folder: string;
  extentions: Record<string, unknown>;
  id?: string;
  [key: string]: unknown;
}

export interface RegexEntry {
  comment: string;
  type: string;
  find: string;
  replace: string;
  in?: string;
  out?: string;
  flag: string;
  ableFlag?: boolean;
  [key: string]: unknown;
}

export interface ReferenceFile {
  id?: string;
  fileName: string;
  filePath: string;
  fileType?: 'charx' | 'risum' | 'risup';
  data: Record<string, unknown>;
}

export type RpMode = 'off' | 'toki' | 'aris' | 'custom';
export type StatusKind = 'info' | 'error';

export interface StatusOptions {
  kind?: StatusKind;
  sticky?: boolean;
}

export const useAppStore = defineStore('app', () => {
  // === File data ===
  const fileData = ref<CharxData | null>(null);
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
  const referencesVisible = ref(initialWorkspaceLayout.referencesVisible);
  const workspaceId = ref<WorkspaceId>('character');
  const navigatorVisible = ref(initialWorkspaceLayout.navigatorVisible);
  const inspectorVisible = ref(initialWorkspaceLayout.inspectorVisible);
  const activeUtility = ref<UtilityToolId | null>(initialWorkspaceLayout.activeUtility);
  const navigatorWidth = ref(initialWorkspaceLayout.navigatorWidth);
  const inspectorWidth = ref(initialWorkspaceLayout.inspectorWidth);
  const utilityHeight = ref(initialWorkspaceLayout.utilityHeight);
  const assetWizardOpen = ref(false);

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

  // === Actions ===
  function setFileData(data: CharxData | null) {
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
    if (getInspectorContext(id).kind !== 'empty') {
      inspectorVisible.value = true;
      referencesVisible.value = false;
      if (typeof window !== 'undefined' && window.innerWidth < 1020) navigatorVisible.value = false;
    }
  }

  function setWorkspaceId(id: WorkspaceId) {
    if (isWorkspaceAvailable(fileData.value, id)) workspaceId.value = id;
  }

  function toggleNavigator() {
    navigatorVisible.value = !navigatorVisible.value;
    if (navigatorVisible.value && typeof window !== 'undefined' && window.innerWidth < 1020) {
      inspectorVisible.value = false;
      referencesVisible.value = false;
    }
  }

  function toggleInspector() {
    inspectorVisible.value = !inspectorVisible.value;
    if (inspectorVisible.value) {
      referencesVisible.value = false;
      if (typeof window !== 'undefined' && window.innerWidth < 1180) navigatorVisible.value = false;
    }
  }

  function toggleUtility(tool: UtilityToolId) {
    activeUtility.value = activeUtility.value === tool ? null : tool;
  }

  function setActiveUtility(tool: UtilityToolId | null) {
    activeUtility.value = tool;
  }

  function toggleReferences() {
    referencesVisible.value = !referencesVisible.value;
    inspectorVisible.value = false;
    if (referencesVisible.value && typeof window !== 'undefined' && window.innerWidth < 1180) {
      navigatorVisible.value = false;
    }
  }

  function setReferencesVisible(visible: boolean) {
    referencesVisible.value = visible;
    if (visible) inspectorVisible.value = false;
  }

  function toggleAvatar() {
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
    const layout = defaultWorkspaceLayout();
    navigatorWidth.value = layout.navigatorWidth;
    inspectorWidth.value = layout.inspectorWidth;
    utilityHeight.value = layout.utilityHeight;
    navigatorVisible.value = layout.navigatorVisible;
    inspectorVisible.value = layout.inspectorVisible;
    avatarVisible.value = layout.avatarVisible;
    referencesVisible.value = layout.referencesVisible;
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
    referencesVisible,
    workspaceId,
    navigatorVisible,
    inspectorVisible,
    activeUtility,
    assetWizardOpen,
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
    // Actions
    setFileData,
    setStatus,
    clearStatus,
    setDocumentStatsText,
    setFileLabel,
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
    toggleAvatar,
    setAssetWizardOpen,
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
