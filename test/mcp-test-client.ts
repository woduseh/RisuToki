import assert from 'node:assert/strict';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export type McpCallJson = Record<string, unknown>;

export interface StandaloneClientRuntime {
  client: Client;
  stderrChunks: string[];
  close: () => Promise<void>;
}

export interface StandaloneClientOptions {
  file?: string;
  refs?: string[];
  userDataDir: string;
  allowWrites?: boolean;
  toolProfile?: string;
  envToolProfile?: string;
  clientName?: string;
}

function copyProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  return env;
}

export function buildChildEnv(port: number, token: string, toolProfile = 'advanced-full'): Record<string, string> {
  const env = copyProcessEnv();
  env.TOKI_PORT = String(port);
  env.TOKI_TOKEN = token;
  env.RISUTOKI_MCP_TOOL_PROFILE = toolProfile;
  return env;
}

export function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      const record = entry as Record<string, unknown>;
      return record.type === 'text' && typeof record.text === 'string' ? record.text : '';
    })
    .filter((value) => value.length > 0)
    .join('\n');
}

export async function startStandaloneClient(options: StandaloneClientOptions): Promise<StandaloneClientRuntime> {
  const args = [
    path.join(__dirname, '..', 'toki-mcp-server.js'),
    '--standalone',
    '--user-data-dir',
    options.userDataDir,
  ];
  if (options.allowWrites) args.push('--allow-writes');
  if (options.toolProfile) args.push('--tool-profile', options.toolProfile);
  if (options.file) args.push('--file', options.file);
  for (const ref of options.refs ?? []) args.push('--ref', ref);

  const env = copyProcessEnv();
  delete env.RISUTOKI_MCP_TOOL_PROFILE;
  if (options.envToolProfile) env.RISUTOKI_MCP_TOOL_PROFILE = options.envToolProfile;
  const client = new Client(
    { name: options.clientName ?? 'mcp-facade-dogfood-test', version: '1.0.0' },
    { capabilities: {} },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    cwd: path.join(__dirname, '..'),
    env,
    stderr: 'pipe',
  });
  const stderrChunks: string[] = [];
  const stderrStream = transport.stderr;
  if (stderrStream) stderrStream.on('data', (chunk) => stderrChunks.push(String(chunk)));
  await client.connect(transport);

  return {
    client,
    stderrChunks,
    close: async () => {
      await client.close().catch(() => undefined);
    },
  };
}

export async function callJson(
  runtime: StandaloneClientRuntime,
  name: string,
  args: Record<string, unknown>,
  options: { expectError?: boolean } = {},
): Promise<McpCallJson> {
  return callClientJson(runtime.client, name, args, options);
}

export async function callClientJson(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  options: { expectError?: boolean } = {},
): Promise<McpCallJson> {
  const result = await client.callTool({ name, arguments: args });
  const text = extractTextContent(result.content);
  if (options.expectError) {
    assert.equal(result.isError, true, `${name} should return a structured MCP error`);
  } else {
    assert.ok(!result.isError, `${name} should succeed: ${text}`);
  }
  return JSON.parse(text) as McpCallJson;
}
