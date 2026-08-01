export type DocumentFileType = 'charx' | 'risum' | 'risup';

/**
 * Document representation exposed to the renderer.
 *
 * Unlike the loaded Node/I/O model, trigger scripts are serialized as JSON
 * text and binary/internal round-trip fields are intentionally absent.
 */
export interface RendererDocumentData {
  name: string;
  description: string;
  firstMessage: string;
  alternateGreetings: string[];
  globalNote: string;
  css: string;
  defaultVariables: string;
  lua: string;
  triggerScripts: string;
  lorebook: LorebookEntry[];
  regex: RegexEntry[];
  _fileType: DocumentFileType;

  // Deprecated compatibility fields are normally omitted by the serializer,
  // but remain optional for preview/reference data assembled by other paths.
  groupOnlyGreetings?: string[];
  personality?: string;
  scenario?: string;
  systemPrompt?: string;
  nickname?: string;
  source?: string[];
  additionalText?: string;
  license?: string;

  // Current charx card fields.
  creatorcomment?: string;
  tags?: string[];
  exampleMessage?: string;
  creator?: string;
  characterVersion?: string;
  creationDate?: number;
  modificationDate?: number;

  // Risum module-specific fields.
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

  // Risup preset fields.
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
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  min_p?: number;
  top_a?: number;
  reasonEffort?: number;
  thinkingTokens?: number;
  thinkingType?: string;
  adaptiveThinkingEffort?: string;
  useInstructPrompt?: boolean;
  instructChatTemplate?: string;
  JinjaTemplate?: string;
  customPromptTemplateToggle?: string;
  templateDefaultVariables?: string;
  moduleIntergration?: string;
  jsonSchemaEnabled?: boolean;
  jsonSchema?: string;
  strictJsonSchema?: boolean;
  extractJson?: string;
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

export type RendererDocumentPatch = Partial<RendererDocumentData>;

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
  fileType?: DocumentFileType;
  data: Record<string, unknown>;
}
