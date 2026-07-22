import type { CharxData } from '../stores/app-store';

export type WorkspaceId =
  | 'character'
  | 'messages'
  | 'scripts'
  | 'lorebook'
  | 'assets'
  | 'module'
  | 'basic'
  | 'prompts'
  | 'model'
  | 'parameters'
  | 'advanced';

export type UtilityToolId = 'terminal';

export interface WorkspaceDefinition {
  id: WorkspaceId;
  label: string;
  icon:
    | 'user'
    | 'message'
    | 'code'
    | 'book'
    | 'photo'
    | 'package'
    | 'settings'
    | 'sparkles'
    | 'cpu'
    | 'sliders'
    | 'dots';
}

export interface NavigatorSelection {
  workspaceId: WorkspaceId;
  itemId: string | null;
}

export type InspectorContextKind = 'empty' | 'lorebook' | 'asset' | 'prompt' | 'regex' | 'trigger';

export interface InspectorContext {
  kind: InspectorContextKind;
  itemId: string | null;
}

export interface WorkspaceLayoutStateV2 {
  version: 2;
  navigatorWidth: number;
  inspectorWidth: number;
  utilityHeight: number;
  navigatorVisible: boolean;
  inspectorVisible: boolean;
  avatarVisible: boolean;
  referencesVisible: boolean;
  activeUtility: UtilityToolId | null;
}

const CHARX_WORKSPACES: WorkspaceDefinition[] = [
  { id: 'character', label: '캐릭터', icon: 'user' },
  { id: 'messages', label: '메시지', icon: 'message' },
  { id: 'scripts', label: '스크립트', icon: 'code' },
  { id: 'lorebook', label: '로어북', icon: 'book' },
  { id: 'assets', label: '에셋', icon: 'photo' },
];

const RISUM_WORKSPACES: WorkspaceDefinition[] = [
  { id: 'module', label: '모듈', icon: 'package' },
  { id: 'scripts', label: '스크립트', icon: 'code' },
  { id: 'lorebook', label: '로어북', icon: 'book' },
  { id: 'assets', label: '에셋', icon: 'photo' },
];

const RISUP_WORKSPACES: WorkspaceDefinition[] = [
  { id: 'basic', label: '기본', icon: 'settings' },
  { id: 'prompts', label: '프롬프트', icon: 'sparkles' },
  { id: 'model', label: '모델/API', icon: 'cpu' },
  { id: 'parameters', label: '파라미터', icon: 'sliders' },
  { id: 'advanced', label: '고급', icon: 'dots' },
];

export function getFileType(data: CharxData | null): 'charx' | 'risum' | 'risup' | null {
  if (!data) return null;
  if (data._fileType === 'risum' || data._fileType === 'risup') return data._fileType;
  return 'charx';
}

export function getWorkspaceDefinitions(data: CharxData | null): WorkspaceDefinition[] {
  const fileType = getFileType(data);
  if (fileType === 'risum') return RISUM_WORKSPACES;
  if (fileType === 'risup') return RISUP_WORKSPACES;
  return CHARX_WORKSPACES;
}

export function getDefaultWorkspace(data: CharxData | null): WorkspaceId {
  const fileType = getFileType(data);
  if (fileType === 'risum') return 'module';
  if (fileType === 'risup') return 'basic';
  return 'character';
}

export function isWorkspaceAvailable(data: CharxData | null, workspaceId: WorkspaceId): boolean {
  return getWorkspaceDefinitions(data).some((workspace) => workspace.id === workspaceId);
}

export function inferWorkspaceFromTab(tabId: string | null, data: CharxData | null): WorkspaceId | null {
  if (!tabId) return null;
  if (tabId.startsWith('lore_')) return 'lorebook';
  if (tabId.startsWith('img_')) return 'assets';
  if (
    tabId.startsWith('regex_') ||
    tabId.startsWith('trigger_') ||
    tabId === 'triggerScripts' ||
    tabId === 'lua' ||
    tabId === 'css'
  )
    return 'scripts';
  if (tabId.startsWith('risup_prompt_item_') || tabId === 'risup_prompt') return 'prompts';
  if (tabId === 'firstMessage' || tabId.startsWith('alternateGreeting') || tabId.startsWith('groupGreeting'))
    return 'messages';

  const fileType = getFileType(data);
  if (fileType === 'risup') {
    if (tabId === 'risup_basic') return 'basic';
    if (tabId === 'risup_model-api') return 'model';
    if (['risup_parameters', 'risup_sampling', 'risup_thinking'].includes(tabId)) return 'parameters';
    return 'advanced';
  }
  if (fileType === 'risum' && ['moduleInfo', 'moduleDescription', 'moduleSettings'].includes(tabId)) return 'module';
  return null;
}

export function getInspectorContext(tabId: string | null): InspectorContext {
  if (!tabId) return { kind: 'empty', itemId: null };
  if (/^lore_\d+$/.test(tabId)) return { kind: 'lorebook', itemId: tabId };
  if (tabId.startsWith('img_')) return { kind: 'asset', itemId: tabId.slice(4) };
  if (tabId.startsWith('risup_prompt_item_')) return { kind: 'prompt', itemId: tabId };
  if (/^regex_\d+$/.test(tabId)) return { kind: 'regex', itemId: tabId };
  if (/^trigger_\d+$/.test(tabId) || tabId === 'triggerScripts') return { kind: 'trigger', itemId: tabId };
  return { kind: 'empty', itemId: null };
}

export function defaultWorkspaceLayout(): WorkspaceLayoutStateV2 {
  return {
    version: 2,
    navigatorWidth: 280,
    inspectorWidth: 320,
    utilityHeight: 250,
    navigatorVisible: true,
    inspectorVisible: true,
    avatarVisible: true,
    referencesVisible: false,
    activeUtility: 'terminal',
  };
}
