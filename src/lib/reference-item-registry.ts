import { getCharxInfoItems } from './charx-sidebar-fields';
import { getVisibleRisupFieldGroups, type RisupFieldGroupId } from './risup-fields';
import type { GreetingType, ReferenceFileType } from './reference-store';

export type ReferenceUiItemKind =
  | 'field'
  | 'greetings'
  | 'lua'
  | 'css'
  | 'triggerScripts'
  | 'lorebook'
  | 'regex'
  | 'risup-group';

interface ReferenceUiItemBase {
  icon: string;
  key: string;
  kind: ReferenceUiItemKind;
  label: string;
}

export interface ReferenceFieldItemDescriptor extends ReferenceUiItemBase {
  field: string;
  kind: 'field';
  language: string;
}

export interface ReferenceGreetingsItemDescriptor extends ReferenceUiItemBase {
  field: 'alternateGreetings' | 'groupOnlyGreetings';
  greetingType: GreetingType;
  kind: 'greetings';
  language: 'html';
}

export interface ReferenceStaticItemDescriptor extends ReferenceUiItemBase {
  kind: 'lua' | 'css' | 'triggerScripts' | 'lorebook' | 'regex';
}

export interface ReferenceRisupGroupItemDescriptor extends ReferenceUiItemBase {
  groupId: RisupFieldGroupId;
  kind: 'risup-group';
}

export type ReferenceUiItemDescriptor =
  | ReferenceFieldItemDescriptor
  | ReferenceGreetingsItemDescriptor
  | ReferenceStaticItemDescriptor
  | ReferenceRisupGroupItemDescriptor;

const CHARX_ITEMS: readonly ReferenceUiItemDescriptor[] = [
  ...getCharxInfoItems().map(
    (item): ReferenceFieldItemDescriptor => ({
      field: item.field,
      icon: item.icon,
      key: item.id,
      kind: 'field',
      label: item.label,
      language: item.lang,
    }),
  ),
  {
    field: 'firstMessage',
    icon: '💬',
    key: 'firstMessage',
    kind: 'field',
    label: '첫 메시지',
    language: 'html',
  },
  {
    field: 'alternateGreetings',
    greetingType: 'alternate',
    icon: '💭',
    key: 'alternateGreetings',
    kind: 'greetings',
    label: '추가 첫 메시지',
    language: 'html',
  },
  {
    field: 'groupOnlyGreetings',
    greetingType: 'group',
    icon: '👥',
    key: 'groupOnlyGreetings',
    kind: 'greetings',
    label: '그룹 전용 인사말',
    language: 'html',
  },
  { icon: '{}', key: 'lua', kind: 'lua', label: 'Lua' },
  { icon: '🎨', key: 'css', kind: 'css', label: 'CSS' },
  { icon: '🧩', key: 'triggerScripts', kind: 'triggerScripts', label: '트리거 스크립트' },
  { icon: '📚', key: 'lorebook', kind: 'lorebook', label: '로어북' },
  { icon: '⚡', key: 'regex', kind: 'regex', label: '정규식' },
] as const;

const RISUM_ITEMS: readonly ReferenceUiItemDescriptor[] = [
  {
    field: 'globalNote',
    icon: '📝',
    key: 'globalNote',
    kind: 'field',
    label: '글로벌노트',
    language: 'plaintext',
  },
  {
    field: 'description',
    icon: '📄',
    key: 'description',
    kind: 'field',
    label: '설명',
    language: 'plaintext',
  },
  {
    field: 'defaultVariables',
    icon: '⚙',
    key: 'defaultVariables',
    kind: 'field',
    label: '기본변수',
    language: 'plaintext',
  },
  {
    field: 'moduleName',
    icon: '📦',
    key: 'moduleName',
    kind: 'field',
    label: '모듈 이름',
    language: 'plaintext',
  },
  {
    field: 'moduleDescription',
    icon: '🧩',
    key: 'moduleDescription',
    kind: 'field',
    label: '모듈 설명',
    language: 'plaintext',
  },
  {
    field: 'moduleNamespace',
    icon: '🏷',
    key: 'moduleNamespace',
    kind: 'field',
    label: '모듈 네임스페이스',
    language: 'plaintext',
  },
  {
    field: 'cjs',
    icon: '📜',
    key: 'cjs',
    kind: 'field',
    label: 'CJS',
    language: 'javascript',
  },
  {
    field: 'backgroundEmbedding',
    icon: '🎨',
    key: 'backgroundEmbedding',
    kind: 'field',
    label: '배경 임베딩',
    language: 'html',
  },
  {
    field: 'customModuleToggle',
    icon: '🔀',
    key: 'customModuleToggle',
    kind: 'field',
    label: '커스텀 모듈 토글',
    language: 'plaintext',
  },
  {
    field: 'mcpUrl',
    icon: '🔗',
    key: 'mcpUrl',
    kind: 'field',
    label: 'MCP URL',
    language: 'plaintext',
  },
  { icon: '{}', key: 'lua', kind: 'lua', label: 'Lua' },
  { icon: '🧩', key: 'triggerScripts', kind: 'triggerScripts', label: '트리거 스크립트' },
  { icon: '📚', key: 'lorebook', kind: 'lorebook', label: '로어북' },
  { icon: '⚡', key: 'regex', kind: 'regex', label: '정규식' },
] as const;

const RISUP_ITEMS: readonly ReferenceUiItemDescriptor[] = [
  ...getVisibleRisupFieldGroups().map(
    (group): ReferenceRisupGroupItemDescriptor => ({
      groupId: group.id,
      icon: group.icon,
      key: `risup:${group.id}`,
      kind: 'risup-group',
      label: group.label,
    }),
  ),
  {
    field: 'description',
    icon: '📄',
    key: 'description',
    kind: 'field',
    label: '설명',
    language: 'plaintext',
  },
  { icon: '⚡', key: 'regex', kind: 'regex', label: '정규식' },
] as const;

const REFERENCE_ITEMS_BY_FILE_TYPE: Readonly<Record<ReferenceFileType, readonly ReferenceUiItemDescriptor[]>> = {
  charx: CHARX_ITEMS,
  risum: RISUM_ITEMS,
  risup: RISUP_ITEMS,
};

export function getReferenceUiItems(fileType: ReferenceFileType): readonly ReferenceUiItemDescriptor[] {
  return REFERENCE_ITEMS_BY_FILE_TYPE[fileType];
}

export function findReferenceUiFieldItem(
  fileType: ReferenceFileType,
  field: string,
): ReferenceFieldItemDescriptor | undefined {
  return getReferenceUiItems(fileType).find(
    (item): item is ReferenceFieldItemDescriptor => item.kind === 'field' && item.field === field,
  );
}

export function getReferenceGreetingItemLabel(index: number): string {
  return `인사말 ${index + 1}`;
}

export function shouldRenderReferenceUiItem(item: ReferenceUiItemDescriptor, data: Record<string, unknown>): boolean {
  if (item.kind === 'risup-group') {
    return true;
  }
  if (item.kind === 'field') {
    const value = data[item.field];
    if (typeof value === 'string') return value.length > 0;
    if (typeof value === 'number' || typeof value === 'boolean') return true;
    return value != null;
  }
  if (item.kind === 'greetings') {
    const value = data[item.field];
    return Array.isArray(value) && value.length > 0;
  }
  if (item.kind === 'lua' || item.kind === 'css') {
    const value = data[item.kind];
    return typeof value === 'string' && value.length > 0;
  }
  if (item.kind === 'triggerScripts') {
    const value = data.triggerScripts;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 && trimmed !== '[]';
    }
    if (Array.isArray(value)) return value.length > 0;
    return !!(value && typeof value === 'object');
  }
  if (item.kind === 'lorebook') {
    return Array.isArray(data.lorebook) && data.lorebook.length > 0;
  }
  if (item.kind === 'regex') {
    return Array.isArray(data.regex) && data.regex.length > 0;
  }
  return false;
}
