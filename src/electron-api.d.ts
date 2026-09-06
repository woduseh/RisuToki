import type { RendererDocumentData, RendererDocumentPatch } from './lib/document-types';
import type { McpActivityEvent, McpActivitySnapshot } from './lib/mcp-activity-types';
import type { PreviewAssetInventory } from './lib/preview-assets';
import type {
  DocumentReviewResult,
  RestoreReviewAssetRequest,
  RestoreReviewAssetResult,
} from './lib/document-review-types';

type DataUpdatedCallback = (field: string, value: unknown) => void;
type TerminalDataCallback = (data: string) => void;
type TerminalSessionDataCallback = (sessionId: string, data: string) => void;
type VoidCallback = () => void;

interface SaveResult {
  success: boolean;
  path?: string;
  error?: string;
}

interface ClaudePromptInfo {
  artifactType: 'charx' | 'risum' | 'risup' | 'unknown';
  fileName: string;
  name: string;
  stats: string;
  cwd: string;
}

interface McpInfo {
  port: number;
  token: string;
  mcpServerPath: string;
}

interface AssetListEntry {
  path: string;
  size: number;
}

interface AssetBatchRenameOperation {
  oldPath: string;
  newName: string;
}

interface AssetBatchRenameResult {
  ok: boolean;
  renamed?: Array<{ oldPath: string; newPath: string }>;
  error?: string;
  conflicts?: string[];
}

interface AssetsMapResult {
  assets: Record<string, string>;
  manifest?: Array<{
    name: string;
    uri: string;
    ext: string;
    mime: string;
    type: string;
    source: 'risu-extension' | 'card' | 'module' | 'zip';
    path?: string;
  }>;
  icon?: string | null;
  debug: Record<string, unknown> | string;
}

interface GuidesListResult {
  builtIn: string[];
  session: string[];
}

interface AutosaveInfo {
  dir: string;
  prefix: string;
  hasFile: boolean;
}

interface PendingRecoveryCandidateIpc {
  sourceFilePath: string;
  autosavePath: string;
  provenance: {
    sourceFilePath: string | null;
    sourceFileType: 'charx' | 'risum' | 'risup';
    autosavePath: string;
    savedAt: string;
    dirtyFields: string[];
    appVersion: string;
  };
  staleWarning: string | null;
  originalMtimeMs: number | null;
  autosaveMtimeMs: number | null;
}

type SessionRecoveryAction = 'restore' | 'open-original' | 'ignore';

interface SessionRecoveryResolveResult {
  action: 'restore' | 'open-original';
  data: RendererDocumentData;
  recovery?: {
    autosavePath: string;
    provenance: PendingRecoveryCandidateIpc['provenance'];
  };
}

interface McpConfirmCallback {
  (id: number, title: string, message: string): void;
}

interface McpOpenFileRequest {
  filePath: string;
  fileType: 'charx' | 'risum' | 'risup';
  saveCurrent: boolean;
  targetLabel: string;
}

interface McpOpenFileResponse {
  success: boolean;
  alreadyOpen?: boolean;
  canceled?: boolean;
  error?: string;
  filePath?: string;
  fileType?: 'charx' | 'risum' | 'risup';
  name?: string;
  suggestion?: string;
}

type OpenFileResult =
  | { success: true; data: RendererDocumentData; path?: string; sourceFormat?: string; imported?: boolean }
  | { success: false; canceled: true }
  | { success: false; canceled?: false; error: string };

type ProjectActionResult =
  | { success: true; data: RendererDocumentData; path?: string; projectPath: string }
  | { success: false; canceled?: boolean; error?: string };

interface ProjectTreeNode {
  name: string;
  type: 'directory' | 'file';
  relativePath: string;
  children?: ProjectTreeNode[];
}

interface McpRendererSessionStatusIpc {
  autosaveDir: string;
  autosaveEnabled: boolean;
  autosaveInterval: number;
  dirtyFieldCount: number;
  dirtyFields: string[];
  documentSwitchInProgress: boolean;
  hasUnsavedChanges: boolean;
}

interface McpSessionStatusResponseIpc {
  success: boolean;
  document?: import('./lib/document-types').RendererDocumentData | null;
  error?: string;
  renderer?: McpRendererSessionStatusIpc | null;
  suggestion?: string;
}

interface McpStatusEvent {
  action?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  rejected?: boolean;
  status?: number;
  suggestion?: string;
  target?: string;
}

interface TerminalStatusEvent {
  detail?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

interface TerminalSessionInfo {
  id: string;
  name: string;
  running: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ReferenceManifestStatusEvent {
  detail?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

interface CloseConfirmCallback {
  (id: number): void;
}

interface ReferenceRecord {
  id?: string;
  fileName: string;
  filePath: string;
  fileType?: 'charx' | 'risum' | 'risup';
  data: Record<string, unknown>;
}

interface TokiAPI {
  newFile: () => Promise<RendererDocumentData>;
  openFile: () => Promise<OpenFileResult>;
  openFilePath: (filePath: string) => Promise<RendererDocumentData>;
  extractDocumentToProject: () => Promise<ProjectActionResult>;
  extractCharxToProject: () => Promise<ProjectActionResult>;
  openProjectFolder: () => Promise<ProjectActionResult>;
  openProjectFolderPath: (projectPath: string) => Promise<ProjectActionResult>;
  cloneProjectFolder: () => Promise<ProjectActionResult>;
  reloadProjectFolder: () => Promise<ProjectActionResult>;
  saveProjectFolder: (updatedFields: RendererDocumentPatch) => Promise<SaveResult>;
  reassembleProjectDocument: (updatedFields?: RendererDocumentPatch) => Promise<SaveResult>;
  reassembleProjectCharx: (updatedFields?: RendererDocumentPatch) => Promise<SaveResult>;
  getProjectPath: () => Promise<string | null>;
  getMcpActivity: () => Promise<McpActivitySnapshot>;
  onMcpActivity: (callback: (event: McpActivityEvent) => void) => () => void;
  getPreviewAssetInventory: () => Promise<PreviewAssetInventory>;
  getDocumentReview: (draft: RendererDocumentData) => Promise<DocumentReviewResult>;
  restoreReviewAsset: (request: RestoreReviewAssetRequest) => Promise<RestoreReviewAssetResult>;
  getProjectTree: () => Promise<ProjectTreeNode | null>;
  readProjectFile: (relativePath: string) => Promise<string>;
  writeProjectFile: (relativePath: string, content: string) => Promise<boolean>;
  watchProjectFolder: () => Promise<boolean>;
  unwatchProjectFolder: () => Promise<boolean>;
  openReference: () => Promise<ReferenceRecord | ReferenceRecord[] | null>;
  openReferencePath: (filePath: string) => Promise<ReferenceRecord | null>;
  listReferences: () => Promise<ReferenceRecord[]>;
  getReferenceManifestStatus: () => Promise<ReferenceManifestStatusEvent | null>;
  removeReference: (fileIdentifier: string) => Promise<boolean>;
  removeAllReferences: () => Promise<boolean>;
  saveFile: (updatedFields: RendererDocumentPatch) => Promise<SaveResult>;
  saveFileAs: (updatedFields: RendererDocumentPatch) => Promise<SaveResult>;
  getFilePath: () => Promise<string | null>;
  getCwd: () => Promise<string>;
  setTerminalCwd: (cwd: string | null) => Promise<boolean>;
  terminalStart: (cols?: number, rows?: number) => Promise<boolean>;
  terminalNewSession: (name?: string) => Promise<TerminalSessionInfo>;
  terminalStartSession: (sessionId: string, cols?: number, rows?: number, name?: string) => Promise<boolean>;
  terminalInputSession: (sessionId: string, data: string) => void;
  terminalResizeSession: (sessionId: string, cols: number, rows: number) => void;
  terminalStopSession: (sessionId: string) => Promise<boolean>;
  terminalListSessions: () => Promise<TerminalSessionInfo[]>;
  terminalRenameSession: (sessionId: string, name: string) => Promise<boolean>;
  terminalIsSessionRunning: (sessionId: string) => Promise<boolean>;
  terminalIsRunning: () => Promise<boolean>;
  terminalInput: (data: string) => void;
  terminalResize: (cols: number, rows: number) => void;
  terminalStop: () => Promise<boolean>;
  onTerminalData: (cb: TerminalDataCallback) => void;
  onTerminalDataSession: (cb: TerminalSessionDataCallback) => VoidCallback;
  onTerminalExit: (cb: VoidCallback) => void;
  onTerminalExitSession: (cb: (sessionId: string) => void) => VoidCallback;
  onTerminalStatus: (cb: (event: TerminalStatusEvent) => void) => void;
  onTerminalStatusSession: (cb: (sessionId: string, event: TerminalStatusEvent) => void) => VoidCallback;
  getClaudePrompt: () => Promise<ClaudePromptInfo | null>;
  getMcpInfo: () => Promise<McpInfo | null>;
  writeMcpConfig: () => Promise<string | null>;
  writeCopilotMcpConfig: () => Promise<string | null>;
  writeCodexMcpConfig: (projectRoot?: string | null) => Promise<string | null>;
  writeAntigravityMcpConfig: () => Promise<string | null>;
  writeAgentsMd: (content: string, projectRoot?: string | null) => Promise<string>;
  cleanupAgentsMd: () => Promise<boolean>;
  onDataUpdated: (cb: DataUpdatedCallback) => void;
  onProjectFolderChanged: (cb: (payload: { path: string; fileName?: string }) => void) => void;
  onMcpConfirmRequest: (cb: McpConfirmCallback) => void;
  sendMcpConfirmResponse: (id: number, allowed: boolean) => void;
  onMcpOpenFileRequest: (cb: (id: number, request: McpOpenFileRequest) => void) => void;
  sendMcpOpenFileResponse: (id: number, response: McpOpenFileResponse) => void;
  onMcpSessionStatusRequest: (cb: (id: number) => void) => void;
  sendMcpSessionStatusResponse: (id: number, response: McpSessionStatusResponseIpc) => void;
  onMcpStatus: (cb: (event: McpStatusEvent) => void) => void;
  onCloseConfirmRequest: (cb: CloseConfirmCallback) => void;
  sendCloseConfirmResponse: (id: number, choice: number) => void;
  getAssetList: () => Promise<AssetListEntry[]>;
  getAssetData: (assetPath: string) => Promise<string | null>;
  getAllAssetsMap: () => Promise<AssetsMapResult>;
  addAsset: (targetFolder: string) => Promise<AssetListEntry[] | null>;
  addAssetBuffer: (fileName: string, base64: string, targetFolder?: string) => Promise<AssetListEntry | null>;
  deleteAsset: (assetPath: string) => Promise<boolean>;
  deleteAssets: (assetPaths: string[]) => Promise<boolean>;
  renameAsset: (oldPath: string, newName: string) => Promise<string | null>;
  renameAssetsBatch: (operations: AssetBatchRenameOperation[]) => Promise<AssetBatchRenameResult>;
  reorderAsset: (fromPath: string, toIdx: number) => Promise<boolean>;
  compressAssetsWebp: (opts?: {
    quality?: number;
    recompressWebp?: boolean;
  }) => Promise<{ ok: boolean; stats?: unknown; error?: string }>;
  exportLorebook: (opts?: {
    format?: 'md' | 'json';
    groupByFolder?: boolean;
  }) => Promise<{ ok: boolean; exportedCount?: number; error?: string }>;
  importLorebook: (opts?: {
    format?: 'md' | 'json';
    conflict?: 'skip' | 'overwrite' | 'rename';
    createFolders?: boolean;
  }) => Promise<{ ok: boolean; imported?: number; overwritten?: number; error?: string }>;
  exportField: (field: string, format?: 'md' | 'txt') => Promise<{ ok: boolean; filePath?: string; error?: string }>;
  importJson: () => Promise<unknown[] | null>;
  autosaveFile: (updatedFields: RendererDocumentPatch) => Promise<SaveResult>;
  cleanupAutosave: (customDir?: string) => Promise<boolean>;
  writeSystemPrompt: (content: string) => Promise<{ filePath: string; platform: string }>;
  readPersona: (name: string) => Promise<string | null>;
  writePersona: (name: string, content: string) => Promise<boolean>;
  listPersonas: () => Promise<string[]>;
  listGuides: () => Promise<GuidesListResult>;
  readGuide: (filename: string) => Promise<string | null>;
  writeGuide: (filename: string, content: string) => Promise<boolean>;
  importGuide: () => Promise<string[]>;
  deleteGuide: (filename: string) => Promise<boolean>;
  pickBgImage: () => Promise<string | null>;
  pickBgm: () => Promise<string | null>;
  openFolder: (folderPath: string) => Promise<string>;
  openExternalUrl: (url: string) => Promise<boolean>;
  getAutosaveInfo: (customDir?: string) => Promise<AutosaveInfo | null>;
  pickAutosaveDir: () => Promise<string | null>;
  getPendingSessionRecovery: () => Promise<PendingRecoveryCandidateIpc | null>;
  resolvePendingSessionRecovery: (action: SessionRecoveryAction) => Promise<SessionRecoveryResolveResult | null>;
  toggleDevTools: () => Promise<void>;
  resolveGuidePath: (filename: string) => Promise<string | null>;
}

declare global {
  interface Window {
    tokiAPI: TokiAPI;
  }
}

export {};
