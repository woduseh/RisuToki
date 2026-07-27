import {
  getReferenceUiItems,
  shouldRenderReferenceUiItem,
  type ReferenceUiItemDescriptor,
} from './reference-item-registry';
import type { ReferenceFileType } from './reference-shared';

export type ReferenceWorkspaceId =
  | 'character'
  | 'messages'
  | 'scripts'
  | 'lorebook'
  | 'module'
  | 'basic'
  | 'prompts'
  | 'model'
  | 'parameters'
  | 'advanced';

export interface ReferenceExplorerWorkspace {
  id: ReferenceWorkspaceId;
  label: string;
  items: ReferenceUiItemDescriptor[];
}

const WORKSPACE_LABELS: Record<ReferenceWorkspaceId, string> = {
  character: '캐릭터',
  messages: '메시지',
  scripts: '스크립트',
  lorebook: '로어북',
  module: '모듈',
  basic: '기본',
  prompts: '프롬프트',
  model: '모델·API',
  parameters: '파라미터',
  advanced: '고급',
};

const WORKSPACE_ORDER: Record<ReferenceFileType, ReferenceWorkspaceId[]> = {
  charx: ['character', 'messages', 'scripts', 'lorebook'],
  risum: ['module', 'scripts', 'lorebook'],
  risup: ['basic', 'prompts', 'model', 'parameters', 'advanced'],
};

function workspaceForRisupGroup(groupId: string): ReferenceWorkspaceId {
  if (groupId === 'basic') return 'basic';
  if (groupId === 'templates' || groupId === 'prompts') return 'prompts';
  if (groupId === 'model-api' || groupId === 'provider-endpoint') return 'model';
  if (groupId === 'parameters' || groupId === 'sampling' || groupId === 'thinking') return 'parameters';
  return 'advanced';
}

export function getReferenceWorkspaceId(
  fileType: ReferenceFileType,
  item: ReferenceUiItemDescriptor,
): ReferenceWorkspaceId {
  if (fileType === 'charx') {
    if (item.kind === 'lorebook') return 'lorebook';
    if (item.kind === 'greetings' || (item.kind === 'field' && item.field === 'firstMessage')) return 'messages';
    if (['lua', 'css', 'triggerScripts', 'regex'].includes(item.kind)) return 'scripts';
    return 'character';
  }
  if (fileType === 'risum') {
    if (item.kind === 'lorebook') return 'lorebook';
    if (['lua', 'css', 'triggerScripts', 'regex'].includes(item.kind)) return 'scripts';
    return 'module';
  }
  if (item.kind === 'risup-group') return workspaceForRisupGroup(item.groupId);
  return 'advanced';
}

export function getReferenceExplorerWorkspaces(
  fileType: ReferenceFileType,
  data: Record<string, unknown>,
): ReferenceExplorerWorkspace[] {
  const grouped = new Map<ReferenceWorkspaceId, ReferenceUiItemDescriptor[]>();
  for (const item of getReferenceUiItems(fileType)) {
    if (!shouldRenderReferenceUiItem(item, data)) continue;
    const workspaceId = getReferenceWorkspaceId(fileType, item);
    const items = grouped.get(workspaceId) ?? [];
    items.push(item);
    grouped.set(workspaceId, items);
  }
  return WORKSPACE_ORDER[fileType]
    .filter((id) => grouped.has(id))
    .map((id) => ({ id, label: WORKSPACE_LABELS[id], items: grouped.get(id)! }));
}
