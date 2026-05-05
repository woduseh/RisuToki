export type SupportedFileType = 'charx' | 'risum' | 'risup';

export const CORE_FIELD_NAMES = [
  'name',
  'description',
  'firstMessage',
  'alternateGreetings',
  'globalNote',
  'css',
  'defaultVariables',
  'triggerScripts',
  'lua',
];

export const CHARX_FIELD_NAMES = [
  'personality',
  'scenario',
  'creatorcomment',
  'tags',
  'exampleMessage',
  'systemPrompt',
  'creator',
  'characterVersion',
  'nickname',
  'source',
  'additionalText',
  'license',
];

export const CHARX_READ_ONLY_FIELD_NAMES = ['creationDate', 'modificationDate'];

export const CHARX_DEPRECATED_FIELD_NAMES = [
  'personality',
  'scenario',
  'systemPrompt',
  'nickname',
  'source',
  'additionalText',
  'license',
  'groupOnlyGreetings',
];

export const RISUM_FIELD_NAMES = [
  'cjs',
  'lowLevelAccess',
  'hideIcon',
  'backgroundEmbedding',
  'moduleNamespace',
  'customModuleToggle',
  'mcpUrl',
  'moduleName',
  'moduleDescription',
];

export const RISUM_READ_ONLY_FIELD_NAMES = ['moduleId'];
export const RISUM_RESERVED_FIELD_NAMES = ['cjs'];

export const RISUP_FIELD_NAMES = [
  'mainPrompt',
  'jailbreak',
  'temperature',
  'maxContext',
  'maxResponse',
  'frequencyPenalty',
  'presencePenalty',
  'aiModel',
  'subModel',
  'apiType',
  'promptPreprocess',
  'promptTemplate',
  'presetBias',
  'formatingOrder',
  'presetImage',
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
];

export const RISUP_LEGACY_FIELD_NAMES = [
  'mainPrompt',
  'jailbreak',
  'globalNote',
  'useInstructPrompt',
  'instructChatTemplate',
  'JinjaTemplate',
];

export const ARRAY_FIELD_NAMES = ['alternateGreetings', 'tags', 'source'];
export const BOOLEAN_FIELD_NAMES = [
  'lowLevelAccess',
  'hideIcon',
  'promptPreprocess',
  'useInstructPrompt',
  'jsonSchemaEnabled',
  'strictJsonSchema',
  'autoSuggestClean',
  'outputImageModal',
  'fallbackWhenBlankResponse',
  'seperateParametersEnabled',
  'enableCustomFlags',
  'localNetworkMode',
];

export const NUMBER_FIELD_NAMES = [
  'temperature',
  'maxContext',
  'maxResponse',
  'frequencyPenalty',
  'presencePenalty',
  'top_p',
  'top_k',
  'repetition_penalty',
  'min_p',
  'top_a',
  'reasonEffort',
  'thinkingTokens',
  'verbosity',
  'localNetworkTimeoutSec',
  'creationDate',
  'modificationDate',
];

export const STRING_MUTATION_FIELD_NAMES = [
  'name',
  'description',
  'firstMessage',
  'globalNote',
  'css',
  'defaultVariables',
  'lua',
  'creatorcomment',
  'exampleMessage',
  'creator',
  'characterVersion',
  'backgroundEmbedding',
  'moduleNamespace',
  'customModuleToggle',
  'mcpUrl',
  'moduleName',
  'moduleDescription',
  'aiModel',
  'subModel',
  'apiType',
  'templateDefaultVariables',
  'moduleIntergration',
  'jsonSchema',
  'extractJson',
  'groupTemplate',
  'groupOtherBotRole',
  'autoSuggestPrompt',
  'autoSuggestPrefix',
  'systemContentReplacement',
  'systemRoleReplacement',
  'customPromptTemplateToggle',
  'promptSettings',
  'customAPIFormat',
  'openrouterProvider',
  'seperateParameters',
  'fallbackModels',
  'seperateModels',
  'modelTools',
  'customFlags',
  'dynamicOutput',
  'reverseProxyOobaArgs',
  'proxyRequestModel',
  'openrouterRequestModel',
  'customProxyRequestModel',
  'koboldURL',
  'forceReplaceUrl',
  'textgenWebUIStreamURL',
  'textgenWebUIBlockingURL',
  'deepseekThinkingType',
  'deepseekReasoningEffort',
];

export const STRING_MUTATION_READ_ONLY_FIELD_NAMES = [
  ...CHARX_READ_ONLY_FIELD_NAMES,
  ...RISUM_READ_ONLY_FIELD_NAMES,
  ...RISUM_RESERVED_FIELD_NAMES,
];

export const FIELD_RESERVED_PATHS = ['batch', 'batch-write', 'export'];
export const MAX_FIELD_BATCH = 20;
export const SUPPORTED_EXTERNAL_FILE_TYPES = new Set<SupportedFileType>(['charx', 'risum', 'risup']);

export interface DocumentTypeFlags {
  fileType: SupportedFileType;
  isCharx: boolean;
  isRisum: boolean;
  isRisup: boolean;
}

export interface FieldAccessRules extends DocumentTypeFlags {
  allowedFields: string[];
  readOnlyFields: string[];
  deprecatedFields: string[];
  hiddenFields: string[];
}

export interface FieldReadDeps {
  stringifyTriggerScripts: (scripts: unknown) => string;
}

export type HiddenFieldCategory = 'deprecated' | 'legacy' | 'reserved';

export interface HiddenFieldInfo {
  field: string;
  category: HiddenFieldCategory;
  reason: string;
  suggestion: string;
}

export interface HiddenFieldWarning extends HiddenFieldInfo {
  type: string;
  count?: number;
  size?: number;
}

const ARRAY_FIELD_NAME_SET = new Set(ARRAY_FIELD_NAMES);
const BOOLEAN_FIELD_NAME_SET = new Set(BOOLEAN_FIELD_NAMES);
const NUMBER_FIELD_NAME_SET = new Set(NUMBER_FIELD_NAMES);
const STRING_MUTATION_FIELD_NAME_SET = new Set(STRING_MUTATION_FIELD_NAMES);
const STRING_MUTATION_READ_ONLY_FIELD_NAME_SET = new Set(STRING_MUTATION_READ_ONLY_FIELD_NAMES);
const CHARX_ALLOWED_FIELD_NAME_SET = new Set([...CHARX_FIELD_NAMES, ...CHARX_READ_ONLY_FIELD_NAMES]);
const CHARX_DEPRECATED_ALLOWED_FIELD_NAMES = CHARX_DEPRECATED_FIELD_NAMES.filter((field) =>
  CHARX_ALLOWED_FIELD_NAME_SET.has(field),
);
const CHARX_DEPRECATED_FIELD_NAME_SET = new Set(CHARX_DEPRECATED_FIELD_NAMES);
const RISUM_RESERVED_FIELD_NAME_SET = new Set(RISUM_RESERVED_FIELD_NAMES);
const RISUP_LEGACY_FIELD_NAME_SET = new Set(RISUP_LEGACY_FIELD_NAMES);

export type StringMutationFieldStatus = 'ok' | 'read-only' | 'unsupported';

export function getDocumentTypeFlags(currentData: Record<string, unknown>): DocumentTypeFlags {
  const rawFileType = currentData._fileType;
  const fileType: SupportedFileType = rawFileType === 'risum' || rawFileType === 'risup' ? rawFileType : 'charx';
  return {
    fileType,
    isCharx: fileType === 'charx',
    isRisum: fileType === 'risum',
    isRisup: fileType === 'risup',
  };
}

export function getFieldAccessRules(currentData: Record<string, unknown>): FieldAccessRules {
  const flags = getDocumentTypeFlags(currentData);
  const hiddenFields = [
    ...(flags.isCharx ? CHARX_DEPRECATED_FIELD_NAMES : []),
    ...(flags.isRisum ? RISUM_RESERVED_FIELD_NAMES : []),
    ...(flags.isRisup ? RISUP_LEGACY_FIELD_NAMES : []),
  ];
  return {
    ...flags,
    allowedFields: [
      ...CORE_FIELD_NAMES,
      ...(flags.isCharx ? [...CHARX_FIELD_NAMES, ...CHARX_READ_ONLY_FIELD_NAMES] : []),
      ...(flags.isRisum ? [...RISUM_FIELD_NAMES, ...RISUM_READ_ONLY_FIELD_NAMES] : []),
      ...(flags.isRisup ? RISUP_FIELD_NAMES : []),
    ],
    readOnlyFields: [
      ...(flags.isRisum ? [...RISUM_READ_ONLY_FIELD_NAMES, ...RISUM_RESERVED_FIELD_NAMES] : []),
      ...(flags.isCharx ? [...CHARX_READ_ONLY_FIELD_NAMES, ...CHARX_DEPRECATED_ALLOWED_FIELD_NAMES] : []),
      ...(flags.isRisup ? RISUP_LEGACY_FIELD_NAMES : []),
    ],
    deprecatedFields: flags.isCharx ? CHARX_DEPRECATED_FIELD_NAMES : [],
    hiddenFields,
  };
}

export function getUnknownFieldHint(rules: Pick<FieldAccessRules, 'isRisum' | 'isRisup'>): string {
  if (rules.isRisum) return '(risum 필드 포함)';
  if (rules.isRisup) return '(risup 프리셋 필드 포함)';
  return '(charx 파일에서는 risum/risup 전용 필드를 사용할 수 없습니다)';
}

export function getStringMutationFieldStatus(
  fieldName: string,
  currentData?: Record<string, unknown>,
): StringMutationFieldStatus {
  if (currentData) {
    const rules = getFieldAccessRules(currentData);
    if (rules.readOnlyFields.includes(fieldName) || rules.deprecatedFields.includes(fieldName)) {
      return 'read-only';
    }
    if (!rules.allowedFields.includes(fieldName)) {
      return 'unsupported';
    }
  }
  if (STRING_MUTATION_READ_ONLY_FIELD_NAME_SET.has(fieldName)) {
    return 'read-only';
  }
  if (STRING_MUTATION_FIELD_NAME_SET.has(fieldName)) {
    return 'ok';
  }
  return 'unsupported';
}

export function getHiddenFieldInfo(currentData: Record<string, unknown>, fieldName: string): HiddenFieldInfo | null {
  const flags = getDocumentTypeFlags(currentData);
  if (flags.isCharx && CHARX_DEPRECATED_FIELD_NAME_SET.has(fieldName)) {
    return {
      field: fieldName,
      category: 'deprecated',
      reason: '.charx deprecated field',
      suggestion: '최신 캐릭터/프롬프트 필드 또는 전용 구조화 도구를 사용하세요.',
    };
  }
  if (flags.isRisum && RISUM_RESERVED_FIELD_NAME_SET.has(fieldName)) {
    return {
      field: fieldName,
      category: 'reserved',
      reason: '.risum reserved field',
      suggestion: 'cjs는 현재 사용되지 않는 예약 슬롯입니다. 새 모듈 로직에는 Lua/지원 필드를 사용하세요.',
    };
  }
  if (flags.isRisup && RISUP_LEGACY_FIELD_NAME_SET.has(fieldName)) {
    return {
      field: fieldName,
      category: 'legacy',
      reason: '.risup legacy prompt compatibility field',
      suggestion: 'promptTemplate + formatingOrder 기반 프롬프트 구조를 사용하세요.',
    };
  }
  return null;
}

export function isHiddenField(currentData: Record<string, unknown>, fieldName: string): boolean {
  return getHiddenFieldInfo(currentData, fieldName) !== null;
}

function hiddenValueMeasure(value: unknown): Pick<HiddenFieldWarning, 'type' | 'count' | 'size'> | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return { type: 'array', count: value.length, size: JSON.stringify(value).length };
  }
  if (typeof value === 'string') {
    if (value.length === 0) return null;
    return { type: 'string', size: value.length };
  }
  if (typeof value === 'boolean') {
    if (!value) return null;
    return { type: 'boolean', count: 1, size: String(value).length };
  }
  if (typeof value === 'number') {
    if (value === 0) return null;
    return { type: 'number', size: String(value).length };
  }
  if (value && typeof value === 'object') {
    const size = JSON.stringify(value).length;
    if (size <= 2) return null;
    return { type: 'object', size };
  }
  return null;
}

export function collectHiddenFieldWarnings(currentData: Record<string, unknown>): HiddenFieldWarning[] {
  const rules = getFieldAccessRules(currentData);
  const warnings: HiddenFieldWarning[] = [];
  for (const fieldName of rules.hiddenFields) {
    if (!Object.prototype.hasOwnProperty.call(currentData, fieldName)) continue;
    const info = getHiddenFieldInfo(currentData, fieldName);
    if (!info) continue;
    const measure = hiddenValueMeasure(currentData[fieldName]);
    if (!measure) continue;
    warnings.push({ ...info, ...measure });
  }
  return warnings;
}

export function redactHiddenFields(currentData: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...currentData };
  for (const fieldName of getFieldAccessRules(currentData).hiddenFields) {
    delete redacted[fieldName];
  }
  return redacted;
}

export function buildFieldReadResponsePayload(
  currentData: Record<string, unknown>,
  fieldName: string,
  deps: FieldReadDeps,
): Record<string, unknown> {
  let payload: Record<string, unknown>;
  if (fieldName === 'triggerScripts') {
    payload = {
      field: fieldName,
      content: deps.stringifyTriggerScripts(currentData.triggerScripts),
    };
  } else if (ARRAY_FIELD_NAME_SET.has(fieldName)) {
    payload = { field: fieldName, content: currentData[fieldName] || [], type: 'array' };
  } else if (BOOLEAN_FIELD_NAME_SET.has(fieldName)) {
    payload = { field: fieldName, content: !!currentData[fieldName], type: 'boolean' };
  } else if (NUMBER_FIELD_NAME_SET.has(fieldName)) {
    payload = { field: fieldName, content: currentData[fieldName] ?? 0, type: 'number' };
  } else {
    payload = { field: fieldName, content: currentData[fieldName] || '' };
  }

  const rules = getFieldAccessRules(currentData);
  if (rules.readOnlyFields.includes(fieldName) || rules.deprecatedFields.includes(fieldName)) {
    payload.readOnly = true;
  }
  if (rules.deprecatedFields.includes(fieldName)) {
    payload.deprecated = true;
  }
  return payload;
}

export function buildFieldBatchReadResults(
  currentData: Record<string, unknown>,
  fields: string[],
  deps: FieldReadDeps,
): Record<string, unknown>[] {
  const rules = getFieldAccessRules(currentData);
  return fields.map((fieldName) => {
    const hiddenInfo = getHiddenFieldInfo(currentData, fieldName);
    if (hiddenInfo) {
      return {
        field: fieldName,
        hidden: true,
        category: hiddenInfo.category,
        error: `Hidden deprecated/reserved/legacy field: ${fieldName}`,
        suggestion: hiddenInfo.suggestion,
      };
    }
    if (!rules.allowedFields.includes(fieldName)) {
      return { field: fieldName, error: `Unknown field: ${fieldName}` };
    }
    return buildFieldReadResponsePayload(currentData, fieldName, deps);
  });
}
