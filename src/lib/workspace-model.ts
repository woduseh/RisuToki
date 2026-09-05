import type { RendererDocumentData } from '../stores/app-store';

export type WorkspaceId =
  | 'character'
  | 'messages'
  | 'scripts'
  | 'lorebook'
  | 'assets'
  | 'module'
  | 'basic'
  | 'prompts'
  | 'toggles'
  | 'model'
  | 'parameters'
  | 'advanced';

export type UtilityToolId = 'terminal';
export type RightSidebarView = 'inspector' | 'guides' | 'references';

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

export interface WorkspaceLayoutStateV3 {
  version: 3;
  navigatorWidth: number;
  inspectorWidth: number;
  utilityHeight: number;
  navigatorVisible: boolean;
  avatarVisible: boolean;
  rightSidebarView: RightSidebarView | null;
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
  { id: 'prompts', label: '프롬프트', icon: 'sparkles' },
  { id: 'toggles', label: '토글·변수', icon: 'sliders' },
  { id: 'scripts', label: '정규식', icon: 'code' },
];

export function getFileType(data: RendererDocumentData | null): 'charx' | 'risum' | 'risup' | null {
  if (!data) return null;
  if (data._fileType === 'risum' || data._fileType === 'risup') return data._fileType;
  return 'charx';
}

export function getWorkspaceDefinitions(data: RendererDocumentData | null): WorkspaceDefinition[] {
  const fileType = getFileType(data);
  if (fileType === 'risum') return RISUM_WORKSPACES;
  if (fileType === 'risup') return RISUP_WORKSPACES;
  return CHARX_WORKSPACES;
}

export function getDefaultWorkspace(data: RendererDocumentData | null): WorkspaceId {
  const fileType = getFileType(data);
  if (fileType === 'risum') return 'module';
  if (fileType === 'risup') return 'prompts';
  return 'character';
}

export function isWorkspaceAvailable(data: RendererDocumentData | null, workspaceId: WorkspaceId): boolean {
  return getWorkspaceDefinitions(data).some((workspace) => workspace.id === workspaceId);
}

export function inferWorkspaceFromTab(tabId: string | null, data: RendererDocumentData | null): WorkspaceId | null {
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
    if (tabId === 'risup_toggles' || tabId === 'risup_variables') return 'toggles';
    return null;
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

export function defaultWorkspaceLayout(): WorkspaceLayoutStateV3 {
  return {
    version: 3,
    navigatorWidth: 340,
    inspectorWidth: 320,
    utilityHeight: 250,
    navigatorVisible: true,
    avatarVisible: true,
    rightSidebarView: 'inspector',
    activeUtility: 'terminal',
  };
}
