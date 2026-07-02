import * as os from 'os';
import * as path from 'path';

import { startHeadlessMcpApiServer } from './mcp-headless-server';
import {
  DEFAULT_TOOL_SURFACE_PROFILE,
  resolveToolSurfaceProfileName,
  type ToolSurfaceProfileName,
} from './mcp-tool-taxonomy';

export interface ConfiguredToolProfile {
  raw: string | undefined;
  source: 'argv' | 'env' | null;
  resolved: ToolSurfaceProfileName;
  invalid: boolean;
  strictFiltering: boolean;
}

export function readArgValue(args: string[], name: string): string | undefined {
  const inlinePrefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return undefined;
}

export function readRepeatedArgValues(args: string[], name: string): string[] {
  const values: string[] = [];
  const inlinePrefix = `${name}=`;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith(inlinePrefix)) {
      values.push(arg.slice(inlinePrefix.length));
      continue;
    }
    if (arg === name && i + 1 < args.length) {
      values.push(args[i + 1]);
      i++;
    }
  }
  return values;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function getConfiguredToolProfile(args = process.argv.slice(2)): ConfiguredToolProfile {
  const argValue = readArgValue(args, '--tool-profile');
  const envValue = process.env.RISUTOKI_MCP_TOOL_PROFILE;
  const raw = argValue ?? envValue;
  const requestedProfile = resolveToolSurfaceProfileName(raw);
  return {
    raw,
    source: argValue !== undefined ? 'argv' : envValue !== undefined ? 'env' : null,
    resolved: requestedProfile ?? DEFAULT_TOOL_SURFACE_PROFILE,
    invalid: raw !== undefined && requestedProfile === undefined,
    strictFiltering: true,
  };
}

function getDefaultStandaloneUserDataPath(): string {
  return path.join(os.homedir(), '.risutoki', 'mcp-standalone');
}

export function getStandaloneUserDataPath(args = process.argv.slice(2)): string {
  return (
    readArgValue(args, '--user-data-dir') ??
    process.env.RISUTOKI_MCP_USER_DATA_DIR ??
    getDefaultStandaloneUserDataPath()
  );
}

export function getStandaloneAllowWrites(args = process.argv.slice(2)): boolean {
  return (
    hasFlag(args, '--allow-writes') ||
    process.env.RISUTOKI_MCP_ALLOW_WRITES === '1' ||
    process.env.RISUTOKI_MCP_ALLOW_WRITES === 'true'
  );
}

export async function startHeadlessFromArgs(args: string[], baseRoot: string) {
  const filePath = readArgValue(args, '--file') ?? process.env.RISUTOKI_MCP_FILE;
  const referencePaths = [
    ...readRepeatedArgValues(args, '--ref'),
    ...(process.env.RISUTOKI_MCP_REFS ? process.env.RISUTOKI_MCP_REFS.split(path.delimiter).filter(Boolean) : []),
  ];
  const allowWrites = getStandaloneAllowWrites(args);
  const userDataPath = getStandaloneUserDataPath(args);
  return startHeadlessMcpApiServer({
    filePath,
    referencePaths,
    allowWrites,
    userDataPath,
    baseRoot,
  });
}
