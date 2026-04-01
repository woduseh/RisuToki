import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Section } from '../lib/section-parser';
import type { ChatbotCategory } from '../lib/pluni-persona';
// Layout types available for future use via '../lib/layout-manager'

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
  fileName: string;
  filePath: string;
  data: Record<string, unknown>;
}

export type RpMode = 'off' | 'toki' | 'aris' | 'custom' | 'pluni';
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

  // === UI state ===
  const darkMode = ref(false);
  const rpMode = ref<RpMode>('off');
  const rpCustomText = ref('');
  const pluniCategory = ref<ChatbotCategory>('solo');
  const bgmEnabled = ref(false);
  const bgmPath = ref('');
  const statusText = ref('');
  const statusKind = ref<StatusKind>('info');
  const statusSticky = ref(false);
  const fileLabel = ref('');
  const restoredSessionLabel = ref('');
  const restoredSessionStatusText = ref('');

  // === Autosave ===
  const autosaveEnabled = ref(false);
  const autosaveInterval = ref(60000);
  const autosaveDir = ref('');

  // === Layout ===
  const sidebarVisible = ref(true);
  const terminalVisible = ref(true);
  const avatarVisible = ref(true);

  // === Computed ===
  const hasFile = computed(() => fileData.value !== null);
  const isRisum = computed(() => fileData.value?._fileType === 'risum');
  const canPreviewCurrentFile = computed(() => {
    if (!fileData.value) return false;
    const fileType = fileData.value._fileType || 'charx';
    return fileType === 'charx';
  });
  const talkTitle = computed(() => (darkMode.value ? 'ArisTalk' : 'TokiTalk'));
  const rpLabel = computed(() => {
    if (rpMode.value === 'off') return 'OFF';
    if (rpMode.value === 'toki') return '토키';
    if (rpMode.value === 'aris') return '아리스';
    if (rpMode.value === 'custom') return '커스텀';
    if (rpMode.value === 'pluni') return '플루니 연구소';
    return 'OFF';
  });
  const displayFileLabel = computed(() =>
    restoredSessionLabel.value ? `${fileLabel.value} [${restoredSessionLabel.value}]` : fileLabel.value,
  );

  // === Actions ===
  function setFileData(data: CharxData | null) {
    fileData.value = data;
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

  function setFileLabel(label: string) {
    fileLabel.value = label;
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

  function setRpMode(mode: RpMode) {
    rpMode.value = mode;
  }

  function setPluniCategory(category: ChatbotCategory) {
    pluniCategory.value = category;
  }

  function setMonacoReady(ready: boolean) {
    monacoReady.value = ready;
  }

  function setActiveTabId(id: string | null) {
    activeTabId.value = id;
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
    darkMode,
    rpMode,
    rpCustomText,
    pluniCategory,
    bgmEnabled,
    bgmPath,
    statusText,
    statusKind,
    statusSticky,
    fileLabel,
    restoredSessionLabel,
    autosaveEnabled,
    autosaveInterval,
    autosaveDir,
    sidebarVisible,
    terminalVisible,
    avatarVisible,
    // Computed
    hasFile,
    isRisum,
    canPreviewCurrentFile,
    talkTitle,
    rpLabel,
    displayFileLabel,
    // Actions
    setFileData,
    setStatus,
    clearStatus,
    setFileLabel,
    setRestoredSessionLabel,
    showRestoredSessionStatus,
    clearRestoredSessionState,
    setDarkMode,
    setRpMode,
    setPluniCategory,
    setMonacoReady,
    setActiveTabId,
    setLuaSections,
    setCssSections,
    setReferenceFiles,
  };
});
