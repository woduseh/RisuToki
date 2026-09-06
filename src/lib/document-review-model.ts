import type { RendererDocumentData, RendererDocumentPatch } from './document-types';

export interface ReviewChange {
  id: string;
  field: string;
  index?: number;
  label: string;
  kind: 'added' | 'removed' | 'modified';
  before: unknown;
  after: unknown;
  beforePresent: boolean;
  afterPresent: boolean;
  expectedField: unknown;
  baselineField: unknown;
  collectionNote?: string;
  canRestore: boolean;
  restoreUnavailable?: string;
}

const labels: Record<string, string> = {
  name: '이름',
  description: '설명',
  firstMessage: '첫 메시지',
  alternateGreetings: '대체 첫 메시지',
  groupOnlyGreetings: '그룹 첫 메시지',
  globalNote: '글로벌 노트',
  css: 'CSS',
  lua: 'Lua',
  defaultVariables: '기본 변수',
  triggerScripts: '트리거',
  lorebook: '로어북',
  regex: '정규식',
  personality: '성격',
  scenario: '시나리오',
  systemPrompt: '시스템 프롬프트',
  nickname: '별칭',
  creatorcomment: '제작자 설명',
  tags: '태그',
  exampleMessage: '예시 대화',
  creator: '제작자',
  characterVersion: '캐릭터 버전',
  moduleName: '모듈 이름',
  moduleDescription: '모듈 설명',
  moduleId: '모듈 ID',
  moduleNamespace: '모듈 네임스페이스',
  backgroundEmbedding: '배경 HTML',
  customModuleToggle: '모듈 토글',
  promptTemplate: '프롬프트 목록',
  mainPrompt: '메인 프롬프트',
  jailbreak: '탈옥 프롬프트',
  formatingOrder: '삽입 순서',
  customPromptTemplateToggle: '프리셋 토글',
  templateDefaultVariables: '프리셋 기본 변수',
  temperature: 'Temperature',
  maxContext: '최대 컨텍스트',
  maxResponse: '최대 응답',
  aiModel: '모델',
  subModel: '보조 모델',
  apiType: 'API 종류',
  presetBias: '토큰 바이어스',
  promptSettings: '프롬프트 설정',
  creationDate: '생성 날짜',
  modificationDate: '수정 날짜',
};

function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  }
  return value;
}

function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function collection(field: string, value: unknown): unknown[] | null {
  if (!['lorebook', 'regex', 'promptTemplate'].includes(field)) return null;
  if (Array.isArray(value)) return value;
  if (field === 'promptTemplate' && typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function stableIds(items: unknown[]): string[] | null {
  const ids: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('id' in item)) return null;
    const id = item.id;
    if ((typeof id !== 'string' && typeof id !== 'number') || id === '') return null;
    ids.push(`${typeof id}:${id}`);
  }
  return new Set(ids).size === ids.length ? ids : null;
}

export function formatReviewValue(value: unknown, present = true): string {
  if (!present || value === undefined) return '(없음)';
  if (typeof value === 'string') return value || '(빈 문자열)';
  return JSON.stringify(value, null, 2);
}

export function buildDocumentReviewChanges(
  baseline: RendererDocumentData | null,
  current: RendererDocumentData | null,
): ReviewChange[] {
  if (!baseline || !current) return [];
  const result: ReviewChange[] = [];
  for (const field of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    // CHARX serialization stamps this on every save, independently of content edits.
    if (field.startsWith('_') || field === 'modificationDate') continue;
    const before = baseline[field];
    const after = current[field];
    if (canonical(before) === canonical(after)) continue;
    const beforePresent = before !== undefined;
    const afterPresent = after !== undefined;
    const base: ReviewChange = {
      id: field,
      field,
      label: labels[field] ?? field,
      kind: !beforePresent ? 'added' : !afterPresent ? 'removed' : 'modified',
      before: copy(before),
      after: copy(after),
      beforePresent,
      afterPresent,
      expectedField: copy(after),
      baselineField: copy(before),
      canRestore: beforePresent,
      restoreUnavailable: beforePresent
        ? undefined
        : '저장본에 없는 필드의 제거는 자동 복원을 지원하지 않아요. 원문에서 수정해 주세요.',
    };
    const oldItems = collection(field, before);
    const newItems = collection(field, after);
    if (oldItems && newItems) {
      const oldIds = stableIds(oldItems);
      const newIds = stableIds(newItems);
      if (oldIds && newIds && canonical(oldIds) === canonical(newIds)) {
        let itemChanges = 0;
        oldItems.forEach((oldItem, index) => {
          if (canonical(oldItem) === canonical(newItems[index])) return;
          const item = newItems[index] as Record<string, unknown>;
          const name = item.name || item.comment || `항목 ${index + 1}`;
          result.push({
            ...base,
            id: `${field}:${oldIds[index]}`,
            index,
            label: `${base.label} · ${String(name)}`,
            before: copy(oldItem),
            after: copy(newItems[index]),
          });
          itemChanges++;
        });
        // Formatting-only changes to a serialized list still need a restorable row.
        if (itemChanges > 0) continue;
      }
      base.collectionNote = '목록 구성·순서 또는 항목 식별을 보존하기 위해 목록 전체를 비교하고 복원해요.';
    }
    result.push(base);
  }
  return result;
}

/** Returns a patch only while the reviewed field still matches the visible draft. */
export function restoreDocumentReviewChange(
  current: RendererDocumentData,
  change: ReviewChange,
): RendererDocumentPatch | null {
  if (
    !change.canRestore ||
    change.field.startsWith('_') ||
    canonical(current[change.field]) !== canonical(change.expectedField)
  )
    return null;
  if (change.index !== undefined) {
    const items = collection(change.field, current[change.field]);
    if (!items || change.index < 0 || change.index >= items.length) return null;
    const next = items.map(copy);
    next[change.index] = copy(change.before);
    return { [change.field]: typeof current[change.field] === 'string' ? JSON.stringify(next) : next };
  }
  return { [change.field]: copy(change.baselineField) };
}
