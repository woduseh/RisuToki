export type RisupFieldEditorKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'checkbox'
  | 'json'
  | 'prompt-template'
  | 'formating-order'
  | 'toggle-template';

export type RisupFieldId =
  | 'name'
  | 'mainPrompt'
  | 'jailbreak'
  | 'globalNote'
  | 'aiModel'
  | 'subModel'
  | 'apiType'
  | 'promptPreprocess'
  | 'temperature'
  | 'maxContext'
  | 'maxResponse'
  | 'frequencyPenalty'
  | 'presencePenalty'
  | 'top_p'
  | 'top_k'
  | 'repetition_penalty'
  | 'min_p'
  | 'top_a'
  | 'reasonEffort'
  | 'thinkingTokens'
  | 'thinkingType'
  | 'adaptiveThinkingEffort'
  | 'promptTemplate'
  | 'presetBias'
  | 'formatingOrder'
  | 'useInstructPrompt'
  | 'instructChatTemplate'
  | 'JinjaTemplate'
  | 'customPromptTemplateToggle'
  | 'templateDefaultVariables'
  | 'moduleIntergration'
  | 'jsonSchemaEnabled'
  | 'jsonSchema'
  | 'strictJsonSchema'
  | 'extractJson'
  | 'groupTemplate'
  | 'groupOtherBotRole'
  | 'autoSuggestPrompt'
  | 'autoSuggestPrefix'
  | 'autoSuggestClean'
  | 'localStopStrings'
  | 'outputImageModal'
  | 'verbosity'
  | 'fallbackWhenBlankResponse'
  | 'systemContentReplacement'
  | 'systemRoleReplacement'
  | 'promptSettings'
  | 'customAPIFormat'
  | 'openrouterProvider'
  | 'seperateParametersEnabled'
  | 'seperateParameters'
  | 'fallbackModels'
  | 'seperateModels'
  | 'modelTools'
  | 'customFlags'
  | 'enableCustomFlags'
  | 'dynamicOutput'
  | 'deepseekThinkingType'
  | 'deepseekReasoningEffort'
  | 'proxyRequestModel'
  | 'openrouterRequestModel'
  | 'customProxyRequestModel'
  | 'reverseProxyOobaArgs'
  | 'koboldURL'
  | 'forceReplaceUrl'
  | 'textgenWebUIStreamURL'
  | 'textgenWebUIBlockingURL'
  | 'localNetworkMode'
  | 'localNetworkTimeoutSec';

export type RisupFieldGroupId =
  | 'basic'
  | 'prompts'
  | 'model-api'
  | 'parameters'
  | 'sampling'
  | 'thinking'
  | 'provider-endpoint'
  | 'advanced'
  | 'templates'
  | 'toggles'
  | 'variables'
  | 'ordering'
  | 'json-schema'
  | 'misc';

export interface RisupFieldDefinition {
  id: RisupFieldId;
  label: string;
  editor: RisupFieldEditorKind;
  placeholder?: string;
  rows?: number;
  step?: string;
}

export interface RisupFieldGroup {
  id: RisupFieldGroupId;
  label: string;
  icon: string;
  fields: readonly RisupFieldDefinition[];
  /** When true, the group is excluded from the sidebar but remains resolvable for restore/compatibility. */
  hidden?: boolean;
}

export const RISUP_LEGACY_FIELD_IDS: readonly RisupFieldId[] = [
  'mainPrompt',
  'jailbreak',
  'globalNote',
  'useInstructPrompt',
  'instructChatTemplate',
  'JinjaTemplate',
];

const groups: readonly RisupFieldGroup[] = [
  {
    id: 'basic',
    label: '기본',
    icon: '🧾',
    fields: [{ id: 'name', label: '프리셋 이름', editor: 'text', placeholder: 'Preset name' }],
  },
  {
    id: 'toggles',
    label: '커스텀 템플릿 토글',
    icon: '🎚',
    fields: [{ id: 'customPromptTemplateToggle', label: '커스텀 템플릿 토글', editor: 'toggle-template', rows: 4 }],
  },
  {
    id: 'variables',
    label: '기본 템플릿 변수',
    icon: '🔤',
    fields: [{ id: 'templateDefaultVariables', label: '기본 템플릿 변수', editor: 'textarea', rows: 5 }],
  },
  {
    id: 'ordering',
    label: '삽입 순서',
    icon: '↕',
    fields: [{ id: 'formatingOrder', label: '삽입 순서', editor: 'formating-order' }],
  },
  {
    id: 'templates',
    label: '프리셋 연동',
    icon: '🧩',
    fields: [
      { id: 'presetBias', label: '프리셋 바이어스', editor: 'json', rows: 6 },
      { id: 'moduleIntergration', label: '모듈 연동', editor: 'text' },
    ],
  },
  {
    id: 'model-api',
    label: '모델/API',
    icon: '🤖',
    fields: [
      { id: 'aiModel', label: 'AI 모델', editor: 'text' },
      { id: 'subModel', label: '보조 모델', editor: 'text' },
      { id: 'apiType', label: 'API 타입', editor: 'text' },
      { id: 'promptPreprocess', label: '프롬프트 전처리', editor: 'checkbox' },
    ],
  },
  {
    id: 'parameters',
    label: '기본 파라미터',
    icon: '🎛',
    fields: [
      { id: 'temperature', label: '온도', editor: 'number', step: '0.1' },
      { id: 'maxContext', label: '최대 컨텍스트', editor: 'number', step: '1' },
      { id: 'maxResponse', label: '최대 응답 길이', editor: 'number', step: '1' },
      { id: 'frequencyPenalty', label: '빈도 패널티', editor: 'number', step: '0.1' },
      { id: 'presencePenalty', label: '존재 패널티', editor: 'number', step: '0.1' },
    ],
  },
  {
    id: 'sampling',
    label: '샘플링',
    icon: '📊',
    fields: [
      { id: 'top_p', label: 'top_p', editor: 'number', step: '0.01' },
      { id: 'top_k', label: 'top_k', editor: 'number', step: '1' },
      { id: 'repetition_penalty', label: '반복 패널티', editor: 'number', step: '0.01' },
      { id: 'min_p', label: 'min_p', editor: 'number', step: '0.01' },
      { id: 'top_a', label: 'top_a', editor: 'number', step: '0.01' },
    ],
  },
  {
    id: 'thinking',
    label: '추론',
    icon: '🧠',
    fields: [
      { id: 'reasonEffort', label: 'Reason effort', editor: 'number', step: '1' },
      { id: 'thinkingTokens', label: 'Thinking tokens', editor: 'number', step: '1' },
      { id: 'thinkingType', label: 'Thinking type', editor: 'text' },
      { id: 'adaptiveThinkingEffort', label: 'Adaptive thinking effort', editor: 'text' },
      { id: 'deepseekThinkingType', label: 'Thinking Mode', editor: 'text' },
      { id: 'deepseekReasoningEffort', label: 'Reasoning Effort', editor: 'text' },
    ],
  },
  {
    id: 'provider-endpoint',
    label: '프로바이더/엔드포인트',
    icon: '🔌',
    fields: [
      { id: 'proxyRequestModel', label: '프록시 요청 모델', editor: 'text' },
      { id: 'openrouterRequestModel', label: 'OpenRouter 요청 모델', editor: 'text' },
      { id: 'customProxyRequestModel', label: '커스텀 프록시 요청 모델', editor: 'text' },
      { id: 'reverseProxyOobaArgs', label: '리버스 프록시 Ooba 요청 옵션', editor: 'json', rows: 8 },
      { id: 'koboldURL', label: 'Kobold 엔드포인트 URL', editor: 'text' },
      { id: 'forceReplaceUrl', label: '리버스 프록시 URL', editor: 'text' },
      { id: 'textgenWebUIStreamURL', label: 'Textgen WebUI 스트리밍 URL', editor: 'text' },
      { id: 'textgenWebUIBlockingURL', label: 'Textgen WebUI 일반 요청 URL', editor: 'text' },
      { id: 'localNetworkMode', label: '로컬 네트워크 경유', editor: 'checkbox' },
      { id: 'localNetworkTimeoutSec', label: '로컬 네트워크 타임아웃(초)', editor: 'number', step: '1' },
    ],
  },
  {
    id: 'advanced',
    label: '고급 설정',
    icon: '🛠',
    fields: [
      { id: 'promptSettings', label: 'Prompt settings', editor: 'json', rows: 8 },
      { id: 'customAPIFormat', label: 'Custom API format', editor: 'json', rows: 6 },
      { id: 'openrouterProvider', label: 'OpenRouter Provider', editor: 'json', rows: 6 },
      { id: 'seperateParametersEnabled', label: '파라미터 분리 활성화', editor: 'checkbox' },
      { id: 'seperateParameters', label: '파라미터 분리', editor: 'json', rows: 8 },
      { id: 'fallbackModels', label: '대체 모델', editor: 'json', rows: 8 },
      { id: 'seperateModels', label: '보조 모델 분리', editor: 'json', rows: 6 },
      { id: 'modelTools', label: '도구', editor: 'json', rows: 5 },
      { id: 'customFlags', label: '커스텀 플래그', editor: 'json', rows: 6 },
      { id: 'enableCustomFlags', label: '커스텀 플래그 활성화', editor: 'checkbox' },
      { id: 'dynamicOutput', label: '동적 출력', editor: 'json', rows: 8 },
    ],
  },
  {
    id: 'prompts',
    label: '레거시 프롬프트',
    icon: '💬',
    hidden: true,
    fields: [
      { id: 'mainPrompt', label: '메인 프롬프트', editor: 'textarea', rows: 8 },
      { id: 'jailbreak', label: '제일브레이크', editor: 'textarea', rows: 6 },
      { id: 'globalNote', label: '글로벌 노트', editor: 'textarea', rows: 6 },
      { id: 'useInstructPrompt', label: 'Instruct prompt 사용', editor: 'checkbox' },
      { id: 'instructChatTemplate', label: 'Instruct chat template', editor: 'textarea', rows: 6 },
      { id: 'JinjaTemplate', label: 'Jinja template', editor: 'textarea', rows: 6 },
    ],
  },
  {
    id: 'json-schema',
    label: 'JSON 스키마',
    icon: '🧱',
    fields: [
      { id: 'jsonSchemaEnabled', label: 'JSON 스키마 사용', editor: 'checkbox' },
      { id: 'jsonSchema', label: 'JSON 스키마', editor: 'textarea', rows: 8 },
      { id: 'strictJsonSchema', label: '엄격 모드', editor: 'checkbox' },
      { id: 'extractJson', label: '응답 JSON 추출 경로', editor: 'text' },
    ],
  },
  {
    id: 'misc',
    label: '기타',
    icon: '⚙',
    fields: [
      { id: 'groupTemplate', label: '그룹 템플릿', editor: 'textarea', rows: 4 },
      { id: 'groupOtherBotRole', label: '그룹 기타 봇 역할', editor: 'text' },
      { id: 'autoSuggestPrompt', label: '자동 제안 프롬프트', editor: 'textarea', rows: 4 },
      { id: 'autoSuggestPrefix', label: '자동 제안 접두사', editor: 'text' },
      { id: 'autoSuggestClean', label: '자동 제안 정리', editor: 'checkbox' },
      { id: 'localStopStrings', label: '로컬 중단 문자열', editor: 'json', rows: 5 },
      { id: 'outputImageModal', label: '이미지 출력 모달', editor: 'checkbox' },
      { id: 'verbosity', label: '응답 verbosity', editor: 'number', step: '1' },
      { id: 'fallbackWhenBlankResponse', label: '빈 응답 시 fallback', editor: 'checkbox' },
      { id: 'systemContentReplacement', label: 'System content replacement', editor: 'text' },
      { id: 'systemRoleReplacement', label: 'System role replacement', editor: 'text' },
    ],
  },
] as const;

const fieldMap = new Map<RisupFieldId, RisupFieldDefinition>();
const editableFieldMap = new Map<RisupFieldId, RisupFieldDefinition>();
const legacyFieldIdSet = new Set<string>(RISUP_LEGACY_FIELD_IDS);

// The prompt manager owns promptTemplate editing. Keep its metadata available to
// validation, dirty tracking and API consumers without rendering a duplicate form.
const standaloneFields: readonly RisupFieldDefinition[] = [
  { id: 'promptTemplate', label: '프롬프트 템플릿', editor: 'prompt-template' },
];

for (const field of [...groups.flatMap((group) => group.fields), ...standaloneFields]) {
  fieldMap.set(field.id, field);
  if (!legacyFieldIdSet.has(field.id)) {
    editableFieldMap.set(field.id, field);
  }
}

export const RISUP_FIELD_GROUPS = groups;
export const RISUP_EDITABLE_FIELD_IDS: readonly RisupFieldId[] = [...editableFieldMap.keys()];
export const RISUP_JSON_FIELD_IDS: RisupFieldId[] = groups
  .flatMap((group) => group.fields)
  .filter((field) => field.editor === 'json')
  .map((field) => field.id);
export const RISUP_DISABLEABLE_NUMBER_FIELD_IDS: readonly RisupFieldId[] = [
  'temperature',
  'frequencyPenalty',
  'presencePenalty',
  'top_p',
  'top_k',
  'min_p',
  'top_a',
  'repetition_penalty',
  'reasonEffort',
  'thinkingTokens',
  'verbosity',
];
const disableableNumberFieldIdSet = new Set<string>(RISUP_DISABLEABLE_NUMBER_FIELD_IDS);

export function getRisupFieldGroup(id: string): RisupFieldGroup | undefined {
  return groups.find((group) => group.id === id);
}

export function getVisibleRisupFieldGroups(): readonly RisupFieldGroup[] {
  return groups.filter((group) => !group.hidden);
}

export function getRisupFieldDefinition(id: string): RisupFieldDefinition | undefined {
  return fieldMap.get(id as RisupFieldId);
}

export function isRisupEditableFieldId(id: string): id is RisupFieldId {
  return editableFieldMap.has(id as RisupFieldId);
}

export function isRisupDisableableNumberFieldId(id: string): id is RisupFieldId {
  return disableableNumberFieldIdSet.has(id);
}
