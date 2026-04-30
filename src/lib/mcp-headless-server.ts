import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { CharxData } from '../charx-io';
import {
  extractPrimaryLuaFromTriggerScripts,
  mergePrimaryLuaIntoTriggerScripts,
  normalizeTriggerScripts,
  openCharx,
  openRisum,
  openRisup,
  saveCharx,
  saveRisum,
  saveRisup,
  stringifyTriggerScripts,
} from '../charx-io';
import type { SupportedFileType } from './mcp-field-access';
import {
  startApiServer,
  type McpApiServer,
  type McpSessionStatus,
  type RendererOpenFileRequest,
} from './mcp-api-server';
import {
  combineCssSections,
  combineLuaSections,
  detectCssBlockClose,
  detectCssBlockOpen,
  detectCssSectionInline,
  detectLuaSection,
  parseCssSections,
  parseLuaSections,
} from './mcp-section-parser';
import { resolveSkillRootDirs } from './content-roots';

export interface HeadlessMcpOptions {
  readonly filePath?: string;
  readonly referencePaths?: readonly string[];
  readonly allowWrites?: boolean;
  readonly userDataPath?: string;
  readonly baseRoot?: string;
  readonly log?: (message: string) => void;
}

export interface HeadlessMcpRuntime {
  readonly api: McpApiServer;
  readonly port: number;
  readonly token: string;
  close: () => Promise<void>;
}

interface HeadlessReferenceFile {
  filePath: string;
  fileType: SupportedFileType;
  data: CharxData;
  name: string;
}

function getFileType(filePath: string): SupportedFileType {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.risum') return 'risum';
  if (ext === '.risup') return 'risup';
  return 'charx';
}

function openDocument(filePath: string): CharxData {
  const normalized = path.normalize(filePath);
  const fileType = getFileType(normalized);
  if (fileType === 'risum') return openRisum(normalized);
  if (fileType === 'risup') return openRisup(normalized);
  return openCharx(normalized);
}

function saveDocument(filePath: string, fileType: SupportedFileType, data: CharxData): void {
  if (fileType === 'risum') {
    saveRisum(filePath, data);
    return;
  }
  if (fileType === 'risup') {
    saveRisup(filePath, data);
    return;
  }
  saveCharx(filePath, data);
}

function ensureAbsoluteExistingFile(filePath: string, label: string): string {
  const normalized = path.normalize(path.resolve(filePath));
  if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
    throw new Error(`${label} does not point to an existing file: ${normalized}`);
  }
  return normalized;
}

function loadReferences(referencePaths: readonly string[] | undefined): HeadlessReferenceFile[] {
  return (referencePaths ?? []).map((rawPath) => {
    const filePath = ensureAbsoluteExistingFile(rawPath, 'reference path');
    const fileType = getFileType(filePath);
    return {
      filePath,
      fileType,
      data: openDocument(filePath),
      name: path.basename(filePath),
    };
  });
}

export function startHeadlessMcpApiServer(options: HeadlessMcpOptions = {}): Promise<HeadlessMcpRuntime> {
  const log = options.log ?? ((message) => process.stderr.write(`[toki-mcp:standalone] ${message}\n`));
  const baseRoot = options.baseRoot ?? path.resolve(__dirname);
  const userDataPath = options.userDataPath ?? path.join(os.homedir(), '.risutoki', 'mcp-standalone');
  fs.mkdirSync(userDataPath, { recursive: true });

  let currentFilePath: string | null = options.filePath
    ? ensureAbsoluteExistingFile(options.filePath, 'file path')
    : null;
  let currentData: CharxData | null = currentFilePath ? openDocument(currentFilePath) : null;
  const referenceFiles = loadReferences(options.referencePaths);

  let api: McpApiServer;
  const portPromise = new Promise<number>((resolve) => {
    api = startApiServer({
      getCurrentData: () => currentData,
      getReferenceFiles: () => referenceFiles,
      askRendererConfirm: async (title, message) => {
        if (options.allowWrites) return true;
        log(`write blocked: ${title} - ${message.replace(/\s+/g, ' ').slice(0, 220)}`);
        return false;
      },
      requestRendererOpenFile: async (request: RendererOpenFileRequest) => {
        try {
          const alreadyOpen =
            currentFilePath !== null && path.normalize(request.filePath) === path.normalize(currentFilePath);
          currentFilePath = path.normalize(request.filePath);
          currentData = openDocument(currentFilePath);
          api.invalidateSectionCaches();
          return {
            success: true,
            alreadyOpen,
            filePath: currentFilePath,
            fileType: request.fileType,
            name: path.basename(currentFilePath),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            suggestion: 'Check that the target .charx/.risum/.risup file is readable.',
          };
        }
      },
      saveCurrentDocument: async () => {
        if (!currentFilePath || !currentData) return { success: false, error: 'No file open' };
        try {
          saveDocument(currentFilePath, getFileType(currentFilePath), currentData);
          return { success: true, path: currentFilePath };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      broadcastToAll: () => {},
      broadcastMcpStatus: (payload) => {
        const level = typeof payload.level === 'string' ? payload.level : 'info';
        const event = typeof payload.event === 'string' ? payload.event : 'status';
        log(`${level}: ${event}`);
      },
      onListening: resolve,
      invalidateAssetsMapCache: () => {},
      parseLuaSections,
      combineLuaSections,
      detectLuaSection,
      parseCssSections,
      combineCssSections,
      detectCssSectionInline,
      detectCssBlockOpen,
      detectCssBlockClose,
      openExternalDocument: openDocument,
      saveExternalDocument: (filePath, fileType, data) => saveDocument(filePath, fileType, data as CharxData),
      normalizeTriggerScripts,
      extractPrimaryLua: extractPrimaryLuaFromTriggerScripts,
      mergePrimaryLua: mergePrimaryLuaIntoTriggerScripts,
      stringifyTriggerScripts,
      getSkillRoots: () => resolveSkillRootDirs(baseRoot).map((root) => root.absolutePath),
      getUserDataPath: () => userDataPath,
      getCurrentFilePath: () => currentFilePath,
      getSessionStatus: (): McpSessionStatus => ({
        currentFilePath,
        currentFileType: currentFilePath ? getFileType(currentFilePath) : null,
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      }),
    });
  });

  return portPromise.then((port) => ({
    api: api!,
    port,
    token: api!.token,
    close: () =>
      new Promise<void>((resolve, reject) => {
        api!.server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  }));
}
