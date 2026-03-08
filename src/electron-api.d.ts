type DataUpdatedCallback = (field: string, value: unknown) => void;
type TerminalDataCallback = (data: string) => void;
type VoidCallback = () => void;

interface SaveResult {
  success: boolean;
  path?: string;
  error?: string;
}

interface ClaudePromptInfo {
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

interface AssetsMapResult {
  assets: Record<string, string>;
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

interface SyncStatusCallback {
  (active: boolean, port: number | null): void;
}

interface McpConfirmCallback {
  (id: number, title: string, message: string): void;
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

interface ReferenceManifestStatusEvent {
  detail?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

interface CloseConfirmCallback {
  (id: number): void;
}

interface PopoutPanelData {
  [key: string]: unknown;
}

interface EditorPopoutData {
  tabId: string;
  label: string;
  language: string;
  content: string;
  readOnly: boolean;
}

interface PopoutTreeItem {
  label: string;
  icon: string;
  id: string | null;
  indent: number;
  isHeader?: boolean;
  isFolder?: boolean;
  refIdx?: number;
}

interface PopoutSidebarData {
  items: PopoutTreeItem[];
}

interface PopoutRefsData {
  guides: string[];
  sessionGuides?: string[];
  refs: PopoutTreeItem[];
}

interface ReferenceRecord {
  fileName: string;
  filePath: string;
  data: Record<string, unknown>;
}

interface TokiAPI {
  newFile: () => Promise<Record<string, unknown>>;
  openFile: () => Promise<Record<string, unknown> | null>;
  openReference: () => Promise<ReferenceRecord | ReferenceRecord[] | null>;
  openReferencePath: (filePath: string) => Promise<ReferenceRecord | null>;
  listReferences: () => Promise<ReferenceRecord[]>;
  getReferenceManifestStatus: () => Promise<ReferenceManifestStatusEvent | null>;
  removeReference: (fileIdentifier: string) => Promise<boolean>;
  removeAllReferences: () => Promise<boolean>;
  saveFile: (updatedFields: Record<string, unknown>) => Promise<SaveResult>;
  saveFileAs: (updatedFields: Record<string, unknown>) => Promise<SaveResult>;
  getFilePath: () => Promise<string | null>;
  getCwd: () => Promise<string>;
  terminalStart: (cols?: number, rows?: number) => Promise<boolean>;
  terminalIsRunning: () => Promise<boolean>;
  terminalInput: (data: string) => void;
  terminalResize: (cols: number, rows: number) => void;
  terminalStop: () => Promise<boolean>;
  onTerminalData: (cb: TerminalDataCallback) => void;
  onTerminalExit: (cb: VoidCallback) => void;
  onTerminalStatus: (cb: (event: TerminalStatusEvent) => void) => void;
  getClaudePrompt: () => Promise<ClaudePromptInfo | null>;
  getMcpInfo: () => Promise<McpInfo | null>;
  writeMcpConfig: () => Promise<string | null>;
  writeCopilotMcpConfig: () => Promise<string | null>;
  writeCodexMcpConfig: () => Promise<string | null>;
  writeAgentsMd: (content: string) => Promise<string>;
  cleanupAgentsMd: () => Promise<boolean>;
  onDataUpdated: (cb: DataUpdatedCallback) => void;
  onMcpConfirmRequest: (cb: McpConfirmCallback) => void;
  sendMcpConfirmResponse: (id: number, allowed: boolean) => void;
  onMcpStatus: (cb: (event: McpStatusEvent) => void) => void;
  onCloseConfirmRequest: (cb: CloseConfirmCallback) => void;
  sendCloseConfirmResponse: (id: number, choice: number) => void;
  getAssetList: () => Promise<AssetListEntry[]>;
  getAssetData: (assetPath: string) => Promise<string | null>;
  getAllAssetsMap: () => Promise<AssetsMapResult>;
  addAsset: (targetFolder: string) => Promise<string | null>;
  addAssetBuffer: (fileName: string, base64: string, targetFolder?: string) => Promise<string | null>;
  deleteAsset: (assetPath: string) => Promise<boolean>;
  renameAsset: (oldPath: string, newName: string) => Promise<string | null>;
  importJson: () => Promise<unknown[] | null>;
  autosaveFile: (updatedFields: Record<string, unknown>) => Promise<SaveResult>;
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
  getAutosaveInfo: (customDir?: string) => Promise<AutosaveInfo | null>;
  pickAutosaveDir: () => Promise<string | null>;
  startSync: (port: number) => Promise<{ ok: boolean; port: number }>;
  stopSync: () => Promise<{ ok: boolean }>;
  onSyncStatus: (cb: SyncStatusCallback) => void;
  toggleDevTools: () => Promise<void>;
  popoutPanel: (type: string, requestId?: string | null) => Promise<boolean>;
  closePopout: (type: string) => Promise<boolean>;
  onPopoutClosed: (cb: (type: string) => void) => void;
  onPopoutSidebarClick: (cb: (itemId: string) => void) => void;
  onPopoutRefsClick: (cb: (tabId: string) => void) => void;
  setEditorPopoutData: (data: EditorPopoutData) => Promise<string>;
  onEditorPopoutChange: (cb: (tabId: string, content: string) => void) => void;
  onEditorPopoutSave: (cb: VoidCallback) => void;
  setPreviewPopoutData: (data: PopoutPanelData) => Promise<string>;
  getGuidesPath: () => Promise<string>;
}

interface PopoutAPI {
  getType: () => string;
  getRequestId: () => string | null;
  dock: () => Promise<string | null>;
  terminalIsRunning: () => Promise<boolean>;
  terminalStart: (cols?: number, rows?: number) => Promise<boolean>;
  terminalInput: (data: string) => void;
  terminalResize: (cols: number, rows: number) => void;
  onTerminalData: (cb: TerminalDataCallback) => void;
  onTerminalExit: (cb: VoidCallback) => void;
  onTerminalStatus: (cb: (event: TerminalStatusEvent) => void) => void;
  getSidebarData: () => Promise<PopoutSidebarData>;
  onSidebarDataChanged: (cb: VoidCallback) => void;
  sidebarClick: (itemId: string) => void;
  getEditorData: (requestId?: string | null) => Promise<EditorPopoutData | null>;
  editorChange: (tabId: string, content: string) => void;
  editorSave: () => void;
  getPreviewData: (requestId?: string | null) => Promise<PopoutPanelData | null>;
  getAllAssetsMap: () => Promise<AssetsMapResult>;
  getRefsData: () => Promise<PopoutRefsData>;
  refsItemClick: (tabId: string) => void;
  onRefsDataChanged: (cb: VoidCallback) => void;
}

declare global {
  interface Window {
    tokiAPI: TokiAPI;
    popoutAPI: PopoutAPI;
  }
}

export {};
