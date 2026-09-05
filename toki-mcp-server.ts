'use strict';

// RisuToki MCP Server
// MCP SDK (StdioServerTransport) + Zod validation
// Communicates with RisuToki via local HTTP API

// eslint-disable-next-line @typescript-eslint/no-require-imports
import fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import path = require('path');
import { AsyncLocalStorage } from 'node:async_hooks';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  ALL_TOOL_NAMES,
  buildToolSurfaceProfileCatalog,
  getToolFamily,
  getToolWorkflowStages,
  listToolsForSurfaceProfile,
  TOOL_RECOMMENDATIONS,
  TOOL_SURFACE_KINDS,
  TOOL_TAXONOMY,
  type ToolSurfaceProfileName,
} from './src/lib/mcp-tool-taxonomy';
import {
  getConfiguredToolProfile,
  getStandaloneAllowWrites,
  getStandaloneUserDataPath,
  startHeadlessFromArgs,
} from './src/lib/toki-standalone-bootstrap';
import {
  buildRuntimeMetadata,
  mergeRuntimeMetadata,
  summarizeToolCatalogHealth,
  type RuntimeMetadata,
  type RuntimeMode,
  type ToolCatalogHealthSummary,
} from './src/lib/mcp-runtime-contract';
import { API_ERROR_KEY, asRecord, isApiError, recordString } from './src/lib/mcp-facade-runtime';
import { createFacadeScriptStyleEngine } from './src/lib/mcp-facade-script-style';
import { createFacadeAssetsEngine } from './src/lib/mcp-facade-assets';
import { createFacadeItemsEngine } from './src/lib/mcp-facade-items';
import { createFacadeContentEngine } from './src/lib/mcp-facade-content';
import { createFacadeEditEngine } from './src/lib/mcp-facade-edit';
import { createFacadeFilesEngine } from './src/lib/mcp-facade-files';
import { createDanbooruEngine } from './src/lib/mcp-danbooru-engine';
import { registerAuthoringTools } from './src/lib/mcp-tool-register-authoring';
import { registerFacadeTools } from './src/lib/mcp-tool-register-facade';
import { registerEvaluationTools } from './src/lib/mcp-tool-register-evaluation';
import { registerFieldTools } from './src/lib/mcp-tool-register-fields';
import { registerReferenceTools } from './src/lib/mcp-tool-register-reference';
import { registerRisupTools } from './src/lib/mcp-tool-register-risup';
import { registerValidationTools } from './src/lib/mcp-tool-register-validation';
import { createMcpProxyClient } from './src/lib/mcp-proxy-client';
import { normalizeMcpErrorEnvelope } from './src/lib/mcp-response-envelope';
import { createMcpToolRegistrar, type McpToolHandler } from './src/lib/mcp-tool-registration';
import { listProjectTree, type ProjectTreeNode } from './src/lib/folder-workspace';

let TOKI_PORT = process.env.TOKI_PORT;
let TOKI_TOKEN = process.env.TOKI_TOKEN;

declare const __APP_VERSION__: string;
declare const __PACKAGE_VERSION__: string;
declare const __BUILD_TIME__: string | null;
declare const __COMMIT__: string | null;

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
const PACKAGE_VERSION = typeof __PACKAGE_VERSION__ !== 'undefined' ? __PACKAGE_VERSION__ : APP_VERSION;
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null;
const COMMIT = typeof __COMMIT__ !== 'undefined' ? __COMMIT__ : null;
const SERVER_STARTED_AT = new Date().toISOString();

/** Whether the MCP transport is connected (logging available). */
let mcpConnected = false;

// ==================== Helper ====================

interface RuntimeHealthSummary {
  startedAt: string;
  pid: number;
  runtimeMode: RuntimeMode;
  apiTimeoutCount: number;
  apiNetworkErrorCount: number;
  uncaughtExceptionCount: number;
  lastErrorSummary: string | null;
  standaloneLogPath: string;
  logTail?: {
    bytesRead: number;
    processStartCount: number;
    apiTimeoutCount: number;
    apiNetworkErrorCount: number;
    uncaughtExceptionCount: number;
    lastErrorSummary: string | null;
  };
}

const runtimeHealthCounters = {
  apiTimeoutCount: 0,
  apiNetworkErrorCount: 0,
  uncaughtExceptionCount: 0,
  lastErrorSummary: null as string | null,
};

interface McpRequestContext {
  requestId: string | number;
  signal: AbortSignal;
  mutating: boolean;
}

const mcpRequestContext = new AsyncLocalStorage<McpRequestContext>();

function summarizeValueForDiagnostic(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return { type: 'string', length: value.length };
  if (typeof value === 'number' || typeof value === 'boolean') return { type: typeof value };
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (typeof value === 'object') {
    return {
      type: 'object',
      keys: Object.keys(value as Record<string, unknown>).slice(0, 25),
    };
  }
  return { type: typeof value };
}

function summarizeArgsForDiagnostic(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, summarizeValueForDiagnostic(value)]));
}

function noteRuntimeError(kind: 'apiTimeout' | 'apiNetworkError' | 'uncaughtException', summary: string): void {
  if (kind === 'apiTimeout') runtimeHealthCounters.apiTimeoutCount++;
  if (kind === 'apiNetworkError') runtimeHealthCounters.apiNetworkErrorCount++;
  if (kind === 'uncaughtException') runtimeHealthCounters.uncaughtExceptionCount++;
  runtimeHealthCounters.lastErrorSummary = summary.slice(0, 300);
}

function getStandaloneLogPath(args = process.argv.slice(2)): string {
  return path.join(getStandaloneUserDataPath(args), 'mcp-server.log');
}

function summarizeStandaloneLogTail(maxBytes = 256 * 1024): RuntimeHealthSummary['logTail'] | undefined {
  const logPath = getStandaloneLogPath();
  try {
    const stat = fs.statSync(logPath);
    const bytesToRead = Math.min(stat.size, maxBytes);
    const fd = fs.openSync(logPath, 'r');
    try {
      const buffer = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buffer, 0, bytesToRead, stat.size - bytesToRead);
      const text = buffer.toString('utf8');
      const lines = text.split(/\r?\n/).filter(Boolean);
      let processStartCount = 0;
      let apiTimeoutCount = 0;
      let apiNetworkErrorCount = 0;
      let uncaughtExceptionCount = 0;
      let lastErrorSummary: string | null = null;
      for (const line of lines) {
        const jsonStart = line.indexOf('{');
        if (jsonStart < 0) continue;
        try {
          const entry = JSON.parse(line.slice(jsonStart)) as Record<string, unknown>;
          const event = typeof entry.event === 'string' ? entry.event : '';
          if (event === 'processStart') processStartCount++;
          if (event === 'apiTimeout') apiTimeoutCount++;
          if (event === 'apiNetworkError') apiNetworkErrorCount++;
          if (event === 'uncaughtException') uncaughtExceptionCount++;
          if (['apiTimeout', 'apiNetworkError', 'uncaughtException', 'toolError', 'fatal'].includes(event)) {
            const error = asRecord(entry.error);
            const message =
              recordString(error, 'message') ?? recordString(entry, 'message') ?? recordString(entry, 'path') ?? event;
            lastErrorSummary = `${event}: ${message}`.slice(0, 300);
          }
        } catch {
          // Ignore partial/truncated diagnostic lines.
        }
      }
      return {
        bytesRead: bytesToRead,
        processStartCount,
        apiTimeoutCount,
        apiNetworkErrorCount,
        uncaughtExceptionCount,
        lastErrorSummary,
      };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

function getRuntimeHealth(): RuntimeHealthSummary {
  return {
    startedAt: SERVER_STARTED_AT,
    pid: process.pid,
    runtimeMode: getRuntimeMode(),
    apiTimeoutCount: runtimeHealthCounters.apiTimeoutCount,
    apiNetworkErrorCount: runtimeHealthCounters.apiNetworkErrorCount,
    uncaughtExceptionCount: runtimeHealthCounters.uncaughtExceptionCount,
    lastErrorSummary: runtimeHealthCounters.lastErrorSummary,
    standaloneLogPath: getStandaloneLogPath(),
    ...(getRuntimeMode() === 'standalone' ? { logTail: summarizeStandaloneLogTail() } : {}),
  };
}

function textResult(data: unknown) {
  if (isApiError(data)) {
    // Strip the sentinel key before serialising — agents see the clean error envelope.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [API_ERROR_KEY]: _sentinel, ...rest } = data;
    const normalized = normalizeMcpErrorEnvelope(rest);
    return { content: [{ type: 'text' as const, text: JSON.stringify(normalized) }], isError: true as const };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function defaultProjectFolderForDocument(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'project';
  return path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}_${ext}`);
}

function summarizeProjectTree(projectPath: string): { files: number; directories: number; topLevel: string[] } {
  const tree = listProjectTree(projectPath);
  let files = 0;
  let directories = 0;
  const walk = (node: ProjectTreeNode) => {
    if (node.type === 'file') files += 1;
    if (node.type === 'directory') directories += 1;
    for (const child of node.children || []) walk(child);
  };
  walk(tree);
  return {
    files,
    directories,
    topLevel: (tree.children || []).map((child) => child.name).slice(0, 30),
  };
}

function safeToolHandler<TArgs extends Record<string, unknown>>(
  name: string,
  handler: (args: TArgs) => Promise<ReturnType<typeof textResult>> | ReturnType<typeof textResult>,
) {
  return async (args: TArgs) => {
    const startedAt = Date.now();
    try {
      const result = await handler(args);
      try {
        JSON.stringify(result);
      } catch (serializationError) {
        logProcessDiagnostic('toolSerializationError', {
          tool: name,
          elapsedMs: Date.now() - startedAt,
          error: serializationError,
        });
        return textResult({
          [API_ERROR_KEY]: true,
          status: 500,
          error: `MCP tool result serialization failed: ${name}`,
          tool: name,
          message: serializationError instanceof Error ? serializationError.message : String(serializationError),
        });
      }
      return result;
    } catch (error) {
      return textResult({
        [API_ERROR_KEY]: true,
        status: 500,
        error: `MCP tool handler failed: ${name}`,
        tool: name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

// ==================== HTTP Client ====================

const apiRequest = createMcpProxyClient({
  getPort: () => TOKI_PORT,
  getToken: () => TOKI_TOKEN,
  logProcessDiagnostic,
  noteRuntimeError,
  mcpLog,
  getRequestContext: () => mcpRequestContext.getStore(),
});
const danbooruEngine = createDanbooruEngine({
  tagFilePath: path.join(__dirname, 'resources', 'Danbooru Tag.txt'),
  log: mcpLog,
});
const facadeScriptStyleEngine = createFacadeScriptStyleEngine(apiRequest);
const { hashStableValue, readExternalSurfaceValue } = facadeScriptStyleEngine;
const facadeAssetsEngine = createFacadeAssetsEngine({
  apiRequest,
  hashStableValue,
  readExternalSurfaceValue,
});
const facadeItemsEngine = createFacadeItemsEngine(apiRequest, facadeScriptStyleEngine);
const facadeContentEngine = createFacadeContentEngine({
  apiRequest,
  getAbortSignal: () => mcpRequestContext.getStore()?.signal,
  danbooru: {
    ensureTagsLoaded: danbooruEngine.ensureTagsLoaded,
    formatTags: danbooruEngine.formatTags,
    getDanbooruStatus: danbooruEngine.getStatus,
    getPopular: danbooruEngine.getPopular,
    getPopularGrouped: danbooruEngine.getPopularGrouped,
    searchWithOnline: danbooruEngine.searchWithOnline,
    validateTags: danbooruEngine.validateTags,
  },
  items: facadeItemsEngine,
  scriptStyle: facadeScriptStyleEngine,
});
const { readFacadeSelector } = facadeContentEngine;
const facadeEditEngine = createFacadeEditEngine({
  apiRequest,
  content: {
    readFacadeSelector,
  },
  items: facadeItemsEngine,
  scriptStyle: facadeScriptStyleEngine,
});
const { readActiveLorebookCollection } = facadeEditEngine;
const facadeFilesEngine = createFacadeFilesEngine({
  apiRequest,
  defaultProjectFolderForDocument,
  hashStableValue,
  readActiveLorebookCollection,
  summarizeProjectTree,
});

// ==================== MCP Server Setup ====================

function getRuntimeMode(): RuntimeMode {
  return process.argv.includes('--standalone') ? 'standalone' : 'app-backed';
}

function getRuntimeMetadata(): RuntimeMetadata {
  const runtimeMode = getRuntimeMode();
  const standaloneUserDataPath = getStandaloneUserDataPath();
  return buildRuntimeMetadata({
    serverVersion: APP_VERSION,
    appVersion: APP_VERSION,
    packageVersion: PACKAGE_VERSION,
    buildTime: BUILD_TIME,
    commit: COMMIT,
    runtimeMode,
    allowWrites: runtimeMode === 'standalone' ? getStandaloneAllowWrites() : undefined,
    userDataPath: runtimeMode === 'standalone' ? standaloneUserDataPath : undefined,
  });
}

function asRuntimeMetadata(value: unknown): RuntimeMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const skew = record.skew;
  if (!skew || typeof skew !== 'object' || Array.isArray(skew)) return null;
  const skewRecord = skew as Record<string, unknown>;
  const { serverVersion, appVersion, packageVersion, buildTime, commit, runtimeMode, allowWrites, userDataPath } =
    record;
  const { detected, warnings } = skewRecord;
  if (
    typeof serverVersion !== 'string' ||
    typeof appVersion !== 'string' ||
    typeof packageVersion !== 'string' ||
    (buildTime !== null && typeof buildTime !== 'string') ||
    (commit !== null && typeof commit !== 'string') ||
    (runtimeMode !== 'app-backed' && runtimeMode !== 'standalone') ||
    (allowWrites !== undefined && typeof allowWrites !== 'boolean') ||
    (userDataPath !== undefined && userDataPath !== null && typeof userDataPath !== 'string') ||
    typeof detected !== 'boolean' ||
    !Array.isArray(warnings) ||
    !warnings.every((warning) => typeof warning === 'string')
  ) {
    return null;
  }
  return {
    serverVersion,
    appVersion,
    packageVersion,
    buildTime,
    commit,
    runtimeMode,
    allowWrites,
    userDataPath: userDataPath ?? undefined,
    skew: {
      detected,
      warnings: warnings as string[],
    },
  };
}

async function getRuntimeMetadataForCatalog(): Promise<RuntimeMetadata> {
  const session = await apiRequest('GET', '/session/status');
  if (isApiError(session)) return getRuntimeMetadata();
  return getRuntimeMetadataForApiSession(session);
}

function getRuntimeMetadataForApiSession(session: unknown): RuntimeMetadata {
  const serverRuntime = getRuntimeMetadata();
  if (!session || typeof session !== 'object' || Array.isArray(session)) return serverRuntime;
  return mergeRuntimeMetadata(serverRuntime, asRuntimeMetadata((session as Record<string, unknown>).runtime));
}

function withMergedRuntimeMetadata(session: unknown): unknown {
  if (!session || typeof session !== 'object' || Array.isArray(session)) return session;
  return {
    ...(session as Record<string, unknown>),
    runtime: getRuntimeMetadataForApiSession(session),
    runtimeHealth: getRuntimeHealth(),
  };
}

function getToolCatalogHealthSummary(): ToolCatalogHealthSummary {
  const facadeCatalog = buildToolSurfaceProfileCatalog('facade-first');
  const readonlyCatalog = buildToolSurfaceProfileCatalog('readonly');
  const advancedCatalog = buildToolSurfaceProfileCatalog('advanced-full');
  return summarizeToolCatalogHealth({
    facadeTools: facadeCatalog?.counts.profileTools ?? 0,
    readonlyTools: readonlyCatalog?.counts.profileTools ?? 0,
    advancedTools: advancedCatalog?.counts.profileTools ?? 0,
    allTools: ALL_TOOL_NAMES.length,
    validRecommendations: TOOL_RECOMMENDATIONS,
    validSurfaceKinds: TOOL_SURFACE_KINDS,
    tools: ALL_TOOL_NAMES.map((name) => {
      const entry = TOOL_TAXONOMY[name];
      return {
        name,
        recommendation: entry.recommendation ?? 'advanced',
        surfaceKind: entry.surfaceKind ?? 'granular',
        workflowStages: getToolWorkflowStages(name),
      };
    }),
  });
}

const configuredToolProfile = getConfiguredToolProfile();
const configuredToolProfileNames = new Set(listToolsForSurfaceProfile(configuredToolProfile.resolved));

function activeToolProfileName(): ToolSurfaceProfileName {
  return configuredToolProfile.resolved;
}

function toolProfileCatalogOptions() {
  return {
    currentProfile: activeToolProfileName(),
    registeredTools: toolRegistrar.registeredToolNames(),
    strictFiltering: configuredToolProfile.strictFiltering,
  };
}

function toolDiagnosticBase(name: string): Record<string, unknown> {
  const entry = TOOL_TAXONOMY[name];
  return {
    toolName: name,
    tool: name,
    family: getToolFamily(name) ?? 'unknown',
    surfaceKind: entry?.surfaceKind ?? 'granular',
    recommendation: entry?.recommendation ?? 'advanced',
    profile: activeToolProfileName(),
    strictFiltering: configuredToolProfile.strictFiltering,
  };
}

function isMutatingToolCall(name: string, args: Record<string, unknown>): boolean {
  if (name === 'preview_edit') return false;
  if (name === 'apply_edit') return true;
  if (name === 'manage_items' || name === 'manage_assets' || name === 'manage_file') {
    return args.mode === 'apply';
  }
  return TOOL_TAXONOMY[name]?.hints.readOnlyHint !== true;
}

function resultByteSize(result: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(result), 'utf8');
  } catch {
    return null;
  }
}

function instrumentToolHandler<TArgs extends Record<string, unknown>>(
  name: string,
  handler: McpToolHandler<TArgs>,
): McpToolHandler<TArgs> {
  return async (callArgs, extra) => {
    const startedAt = Date.now();
    const requestId = extra?.requestId;
    const signal = extra?.signal;
    const run = async () => {
      logProcessDiagnostic('toolStart', {
        ...toolDiagnosticBase(name),
        ...(requestId !== undefined ? { requestId } : {}),
        args: summarizeArgsForDiagnostic(callArgs),
      });
      try {
        const result = await handler(callArgs, extra);
        const isError = asRecord(result)?.isError === true;
        logProcessDiagnostic('toolSuccess', {
          ...toolDiagnosticBase(name),
          ...(requestId !== undefined ? { requestId } : {}),
          status: isError ? 'error' : 'ok',
          elapsedMs: Date.now() - startedAt,
          responseBytes: resultByteSize(result),
        });
        return result;
      } catch (error) {
        logProcessDiagnostic('toolError', {
          ...toolDiagnosticBase(name),
          ...(requestId !== undefined ? { requestId } : {}),
          status: 'thrown',
          elapsedMs: Date.now() - startedAt,
          error,
        });
        throw error;
      }
    };
    return requestId !== undefined && signal
      ? mcpRequestContext.run({ requestId, signal, mutating: isMutatingToolCall(name, callArgs) }, run)
      : run();
  };
}

const server = new McpServer({
  name: 'risutoki',
  version: APP_VERSION,
});

const toolRegistrar = createMcpToolRegistrar(server, {
  shouldRegister: (name) => configuredToolProfileNames.has(name),
  instrumentHandler: instrumentToolHandler,
  onSkipped: (toolName) => {
    if (configuredToolProfile.source) {
      logProcessDiagnostic('toolSkippedByProfile', {
        ...toolDiagnosticBase(toolName),
        requestedProfile: configuredToolProfile.raw,
        resolvedProfile: configuredToolProfile.resolved,
      });
    }
  },
});

registerEvaluationTools(toolRegistrar, facadeContentEngine);
registerFacadeTools(toolRegistrar, {
  apiRequest,
  assets: facadeAssetsEngine,
  content: facadeContentEngine,
  edit: facadeEditEngine,
  files: facadeFilesEngine,
  items: facadeItemsEngine,
  scriptStyle: facadeScriptStyleEngine,
  getRuntimeHealth,
  getRuntimeMetadataForCatalog,
  getToolCatalogHealthSummary,
  safeToolHandler,
  textResult,
  toolProfileCatalogOptions,
  withMergedRuntimeMetadata,
});

registerFieldTools(toolRegistrar, { apiRequest, safeToolHandler, textResult, withMergedRuntimeMetadata });

registerAuthoringTools(toolRegistrar, { apiRequest, safeToolHandler, textResult });

registerReferenceTools(toolRegistrar, {
  apiRequest,
  defaultProjectFolderForDocument,
  safeToolHandler,
  summarizeProjectTree,
  textResult,
});

registerValidationTools(toolRegistrar, { apiRequest, danbooruEngine, textResult });

registerRisupTools(toolRegistrar, { apiRequest, textResult });

// ==================== Prompt ====================

server.prompt(
  'danbooru_tag_guide',
  'Guidelines and reference for writing image generation prompts using Danbooru tags. Call this before creating character image prompts to get the correct tag format and popular tags.',
  {
    character_description: z.string().optional().describe('Optional character description for context-aware guidance'),
  },
  async ({ character_description }) => ({
    messages: [
      {
        role: 'user' as const,
        content: { type: 'text' as const, text: danbooruEngine.buildGuide(character_description) },
      },
    ],
  }),
);

// ==================== Start ====================

function serializeDiagnosticValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

function logProcessDiagnostic(event: string, data: Record<string, unknown> = {}): void {
  const logPath = path.join(getStandaloneUserDataPath(), 'mcp-server.log');
  const payload = {
    timestamp: new Date().toISOString(),
    pid: process.pid,
    argv: process.argv,
    runtimeMode: getRuntimeMode(),
    event,
    ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, serializeDiagnosticValue(value)])),
  };
  const line = `[toki-mcp] ${event} ${JSON.stringify(payload)}\n`;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {
    // Diagnostic logging must never be able to take down the transport.
  }
  process.stderr.write(line);
}

process.on('uncaughtException', (error) => {
  noteRuntimeError('uncaughtException', error instanceof Error ? error.message : String(error));
  logProcessDiagnostic('uncaughtException', { error });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logProcessDiagnostic('unhandledRejection', { reason });
});
process.on('beforeExit', (code) => {
  logProcessDiagnostic('beforeExit', { code });
});
process.on('exit', (code) => {
  logProcessDiagnostic('exit', { code });
});

/**
 * Send a structured log via MCP logging protocol when connected,
 * otherwise fall back to stderr.
 */
function mcpLog(level: 'debug' | 'info' | 'warning' | 'error', message: string, data?: Record<string, unknown>): void {
  const text = data ? `${message} ${JSON.stringify(data)}` : message;
  if (mcpConnected) {
    server.sendLoggingMessage({ level, data: text }).catch((error) => {
      logProcessDiagnostic('mcpLoggingFailed', { level, message, error });
    });
  } else {
    process.stderr.write(`[toki-mcp] ${level}: ${text}\n`);
  }
}

function attachStdioDiagnostics(): void {
  const streams = [
    ['stdin', process.stdin],
    ['stdout', process.stdout],
  ] as const;
  for (const [stream, target] of streams) {
    target.on('error', (error) => logProcessDiagnostic('stdioEvent', { stream, event: 'error', error }));
    target.on('close', () => logProcessDiagnostic('stdioEvent', { stream, event: 'close' }));
    target.on('end', () => logProcessDiagnostic('stdioEvent', { stream, event: 'end' }));
    target.on('finish', () => logProcessDiagnostic('stdioEvent', { stream, event: 'finish' }));
  }
}

async function main() {
  if (process.argv.includes('--standalone')) {
    const runtime = await startHeadlessFromArgs(process.argv.slice(2), __dirname);
    TOKI_PORT = String(runtime.port);
    TOKI_TOKEN = runtime.token;
    process.env.TOKI_PORT = TOKI_PORT;
    process.env.TOKI_TOKEN = TOKI_TOKEN;
  }

  if (!TOKI_PORT || !TOKI_TOKEN) {
    process.stderr.write('[toki-mcp] ERROR: TOKI_PORT and TOKI_TOKEN env vars required\n');
    process.stderr.write('[toki-mcp] Hint: run with --standalone to use file-backed mode without the RisuToki app.\n');
    process.exit(1);
  }

  const runtime = getRuntimeMetadata();
  if (configuredToolProfile.invalid) {
    logProcessDiagnostic('toolProfileWarning', {
      requestedProfile: configuredToolProfile.raw,
      source: configuredToolProfile.source,
      resolvedProfile: configuredToolProfile.resolved,
      message: 'Unknown tool profile; falling back to the facade-first registered surface.',
    });
  }
  logProcessDiagnostic('processStart', {
    serverVersion: runtime.serverVersion,
    appVersion: runtime.appVersion,
    packageVersion: runtime.packageVersion,
    buildTime: runtime.buildTime,
    commit: runtime.commit,
    runtimeMode: runtime.runtimeMode,
    allowWrites: runtime.allowWrites,
    userDataPath: runtime.userDataPath,
    toolProfile: configuredToolProfile.raw ?? null,
    resolvedToolProfile: configuredToolProfile.resolved ?? null,
    strictToolFiltering: configuredToolProfile.strictFiltering,
    registeredTools: toolRegistrar.registeredToolNames().length,
    api: `127.0.0.1:${TOKI_PORT}`,
  });
  attachStdioDiagnostics();
  const transport = new StdioServerTransport();
  logProcessDiagnostic('transportConnectStart');
  await server.connect(transport);
  mcpConnected = true;
  logProcessDiagnostic('transportConnected');
  mcpLog('info', `risutoki MCP server started`, {
    version: runtime.serverVersion,
    appVersion: runtime.appVersion,
    packageVersion: runtime.packageVersion,
    buildTime: runtime.buildTime,
    commit: runtime.commit,
    runtimeMode: runtime.runtimeMode,
    allowWrites: runtime.allowWrites,
    userDataPath: runtime.userDataPath,
    toolProfile: configuredToolProfile.raw ?? null,
    resolvedToolProfile: configuredToolProfile.resolved ?? null,
    strictToolFiltering: configuredToolProfile.strictFiltering,
    registeredTools: toolRegistrar.registeredToolNames().length,
    skew: runtime.skew,
    api: `127.0.0.1:${TOKI_PORT}`,
  });
}

main().catch((err) => {
  logProcessDiagnostic('fatal', { error: err });
  process.stderr.write(`[toki-mcp] fatal: ${err}\n`);
  process.exit(1);
});
