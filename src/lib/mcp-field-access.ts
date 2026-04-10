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
  'nickname',
  'source',
  'additionalText',
  'tags',
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
  'systemPrompt',
  'creator',
  'characterVersion',
  'cjs',
  'backgroundEmbedding',
  'moduleNamespace',
  'customModuleToggle',
  'mcpUrl',
  'moduleName',
  'moduleDescription',
  'mainPrompt',
  'jailbreak',
  'aiModel',
  'subModel',
  'apiType',
  'instructChatTemplate',
  'JinjaTemplate',
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
];

export const STRING_MUTATION_READ_ONLY_FIELD_NAMES = [...CHARX_READ_ONLY_FIELD_NAMES, ...RISUM_READ_ONLY_FIELD_NAMES];

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
}

export interface FieldReadDeps {
  stringifyTriggerScripts: (scripts: unknown) => string;
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
  return {
    ...flags,
    allowedFields: [
      ...CORE_FIELD_NAMES,
      ...(flags.isCharx ? [...CHARX_FIELD_NAMES, ...CHARX_READ_ONLY_FIELD_NAMES] : []),
      ...(flags.isRisum ? [...RISUM_FIELD_NAMES, ...RISUM_READ_ONLY_FIELD_NAMES] : []),
      ...(flags.isRisup ? RISUP_FIELD_NAMES : []),
    ],
    readOnlyFields: [
      ...(flags.isRisum ? RISUM_READ_ONLY_FIELD_NAMES : []),
      ...(flags.isCharx ? [...CHARX_READ_ONLY_FIELD_NAMES, ...CHARX_DEPRECATED_ALLOWED_FIELD_NAMES] : []),
    ],
    deprecatedFields: flags.isCharx ? CHARX_DEPRECATED_FIELD_NAMES : [],
  };
}

export function getUnknownFieldHint(rules: Pick<FieldAccessRules, 'isRisum' | 'isRisup'>): string {
  if (rules.isRisum) return '(risum 필드 포함)';
  if (rules.isRisup) return '(risup 프리셋 필드 포함)';
  return '(charx 파일에서는 risum/risup 전용 필드를 사용할 수 없습니다)';
}

export function getStringMutationFieldStatus(fieldName: string): StringMutationFieldStatus {
  if (STRING_MUTATION_READ_ONLY_FIELD_NAME_SET.has(fieldName)) {
    return 'read-only';
  }
  if (STRING_MUTATION_FIELD_NAME_SET.has(fieldName)) {
    return 'ok';
  }
  return 'unsupported';
}

export function buildFieldReadResponsePayload(
  currentData: Record<string, unknown>,
  fieldName: string,
  deps: FieldReadDeps,
): Record<string, unknown> {
  if (fieldName === 'triggerScripts') {
    return {
      field: fieldName,
      content: deps.stringifyTriggerScripts(currentData.triggerScripts),
    };
  }
  if (ARRAY_FIELD_NAME_SET.has(fieldName)) {
    return { field: fieldName, content: currentData[fieldName] || [], type: 'array' };
  }
  if (BOOLEAN_FIELD_NAME_SET.has(fieldName)) {
    return { field: fieldName, content: !!currentData[fieldName], type: 'boolean' };
  }
  if (NUMBER_FIELD_NAME_SET.has(fieldName)) {
    return { field: fieldName, content: currentData[fieldName] ?? 0, type: 'number' };
  }
  return { field: fieldName, content: currentData[fieldName] || '' };
}

export function buildFieldBatchReadResults(
  currentData: Record<string, unknown>,
  fields: string[],
  deps: FieldReadDeps,
): Record<string, unknown>[] {
  const rules = getFieldAccessRules(currentData);
  return fields.map((fieldName) => {
    if (!rules.allowedFields.includes(fieldName)) {
      return { field: fieldName, error: `Unknown field: ${fieldName}` };
    }
    return buildFieldReadResponsePayload(currentData, fieldName, deps);
  });
}
