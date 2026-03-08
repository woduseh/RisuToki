import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Section } from '../lib/section-parser';
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
  // Risup preset fields
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

export type RpMode = 'off' | 'toki' | 'aris' | 'custom';

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
  const bgmEnabled = ref(false);
  const bgmPath = ref('');
  const statusText = ref('');
  const fileLabel = ref('');

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
  const talkTitle = computed(() => (darkMode.value ? 'ArisTalk' : 'TokiTalk'));
  const rpLabel = computed(() => {
    if (rpMode.value === 'off') return 'OFF';
    if (rpMode.value === 'toki') return '토키';
    if (rpMode.value === 'aris') return '아리스';
    if (rpMode.value === 'custom') return '커스텀';
    return 'OFF';
  });

  // === Actions ===
  function setFileData(data: CharxData | null) {
    fileData.value = data;
  }

  function setStatus(text: string) {
    statusText.value = text;
  }

  function setFileLabel(label: string) {
    fileLabel.value = label;
  }

  function setDarkMode(value: boolean) {
    darkMode.value = value;
  }

  function setRpMode(mode: RpMode) {
    rpMode.value = mode;
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
    bgmEnabled,
    bgmPath,
    statusText,
    fileLabel,
    autosaveEnabled,
    autosaveInterval,
    autosaveDir,
    sidebarVisible,
    terminalVisible,
    avatarVisible,
    // Computed
    hasFile,
    isRisum,
    talkTitle,
    rpLabel,
    // Actions
    setFileData,
    setStatus,
    setFileLabel,
    setDarkMode,
    setRpMode,
    setMonacoReady,
    setActiveTabId,
    setLuaSections,
    setCssSections,
    setReferenceFiles,
  };
});
