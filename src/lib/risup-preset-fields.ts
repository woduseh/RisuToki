/** Format-level preset fields only. UI visibility and MCP read/write policy remain separate. */
const BASIC_DEFAULTS = {
  mainPrompt: '',
  jailbreak: '',
  temperature: 80,
  maxContext: 4000,
  maxResponse: 300,
  frequencyPenalty: 70,
  presencePenalty: 70,
  aiModel: '',
  subModel: '',
  apiType: '',
  promptPreprocess: false,
  promptTemplate: '[]',
  presetBias: '[]',
  formatingOrder: '[]',
  presetImage: '',
} as const;

const OPTIONAL_FIELDS = [
  'top_p',
  'top_k',
  'repetition_penalty',
  'min_p',
  'top_a',
  'reasonEffort',
  'thinkingTokens',
  'thinkingType',
  'adaptiveThinkingEffort',
  'useInstructPrompt',
  'instructChatTemplate',
  'JinjaTemplate',
  'customPromptTemplateToggle',
  'templateDefaultVariables',
  'moduleIntergration',
  'jsonSchemaEnabled',
  'jsonSchema',
  'strictJsonSchema',
  'extractJson',
  'groupTemplate',
  'groupOtherBotRole',
  'autoSuggestPrompt',
  'autoSuggestPrefix',
  'autoSuggestClean',
  'localStopStrings',
  'outputImageModal',
  'verbosity',
  'fallbackWhenBlankResponse',
  'systemContentReplacement',
  'systemRoleReplacement',
  'promptSettings',
  'customAPIFormat',
  'openrouterProvider',
  'seperateParametersEnabled',
  'seperateParameters',
  'fallbackModels',
  'seperateModels',
  'modelTools',
  'customFlags',
  'enableCustomFlags',
  'dynamicOutput',
  'deepseekThinkingType',
  'deepseekReasoningEffort',
  'proxyRequestModel',
  'openrouterRequestModel',
  'customProxyRequestModel',
  'reverseProxyOobaArgs',
  'koboldURL',
  'forceReplaceUrl',
  'textgenWebUIStreamURL',
  'textgenWebUIBlockingURL',
  'localNetworkMode',
  'localNetworkTimeoutSec',
] as const;

export type RisupPresetFieldName = keyof typeof BASIC_DEFAULTS | (typeof OPTIONAL_FIELDS)[number];

export const RISUP_PRESET_FIELD_NAMES: readonly RisupPresetFieldName[] = [
  ...(Object.keys(BASIC_DEFAULTS) as Array<keyof typeof BASIC_DEFAULTS>),
  ...OPTIONAL_FIELDS,
];

/** Preserve existing basic defaults and omission of undefined optional fields. */
export function projectRisupPresetFields(data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, fallback] of Object.entries(BASIC_DEFAULTS)) {
    const value = data[field];
    result[field] =
      typeof fallback === 'number'
        ? typeof value === 'number'
          ? value
          : fallback
        : typeof fallback === 'boolean'
          ? !!value
          : value || fallback;
  }
  for (const field of OPTIONAL_FIELDS) {
    if (data[field] !== undefined) result[field] = data[field];
  }
  return result;
}
