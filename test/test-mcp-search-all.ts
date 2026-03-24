import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { startApiServer } from '../src/lib/mcp-api-server';
import {
  combineCssSections,
  combineLuaSections,
  detectCssBlockClose,
  detectCssBlockOpen,
  detectCssSectionInline,
  detectLuaSection,
  parseCssSections,
  parseLuaSections,
} from '../src/lib/section-parser';

interface SearchFixture {
  description?: string;
  firstMessage?: string;
  alternateGreetings?: string[];
  groupOnlyGreetings?: string[];
  lorebook?: Array<{
    comment?: string;
    key?: string;
    content?: string;
  }>;
  [key: string]: unknown;
}

function createSearchFixture(): SearchFixture {
  return {
    description: 'Field Alpha is searchable.',
    firstMessage: 'First alpha hello.',
    globalNote: 'No match here.',
    alternateGreetings: ['Alternate Alpha greeting.', 'Secondary hello.'],
    groupOnlyGreetings: ['Read-only alpha group greeting.'],
    lorebook: [
      {
        comment: 'Bridge lore',
        key: 'bridge',
        content: 'Lore alpha entry.',
      },
      {
        comment: 'Quiet lore',
        key: 'quiet',
        content: 'Nothing interesting.',
      },
    ],
  };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function startTestApiServer(currentData: SearchFixture) {
  let resolvePort!: (port: number) => void;
  const portPromise = new Promise<number>((resolve) => {
    resolvePort = resolve;
  });

  const api = startApiServer({
    getCurrentData: () => currentData,
    getReferenceFiles: () => [],
    askRendererConfirm: async () => true,
    broadcastToAll: (channel: string, ...args: unknown[]) => {
      void channel;
      void args;
    },
    broadcastMcpStatus: (payload: Record<string, unknown>) => {
      void payload;
    },
    onListening: (port) => resolvePort(port),
    parseLuaSections,
    combineLuaSections,
    detectLuaSection,
    parseCssSections,
    combineCssSections,
    detectCssSectionInline,
    detectCssBlockOpen,
    detectCssBlockClose,
    normalizeTriggerScripts: (data: unknown) => data,
    extractPrimaryLua: () => '',
    mergePrimaryLua: (scripts: unknown, lua: string) => {
      void lua;
      return scripts;
    },
    stringifyTriggerScripts: (scripts: unknown) => JSON.stringify(scripts),
    getSkillsDir: () => path.join(__dirname, '..', 'skills'),
  });

  const port = await portPromise;
  return { ...api, port };
}

function buildChildEnv(port: number, token: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  env.TOKI_PORT = String(port);
  env.TOKI_TOKEN = token;
  return env;
}

function extractTextContent(content: unknown): string {
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

function mapSurfacesByTarget(surfaces: Array<{ target?: string }>) {
  return new Map(
    surfaces
      .filter((surface): surface is { target: string; [key: string]: unknown } => typeof surface.target === 'string')
      .map((surface) => [surface.target, surface]),
  );
}

(async function run() {
  const api = await startTestApiServer(createSearchFixture());
  const client = new Client({ name: 'mcp-search-smoke-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'toki-mcp-server.js')],
    cwd: path.join(__dirname, '..'),
    env: buildChildEnv(api.port, api.token),
    stderr: 'pipe',
  });

  const stderrChunks: string[] = [];
  const stderrStream = transport.stderr;
  if (stderrStream) {
    stderrStream.on('data', (chunk) => {
      stderrChunks.push(String(chunk));
    });
  }

  let connected = false;

  try {
    await client.connect(transport);
    connected = true;

    const tools = await client.listTools();
    assert.ok(
      tools.tools.some((tool) => tool.name === 'search_all_fields'),
      'search_all_fields should be registered before the route contract is implemented',
    );

    const fieldSearch = await client.callTool({
      name: 'search_in_field',
      arguments: {
        field: 'description',
        query: 'alpha',
        context_chars: 12,
        max_matches: 5,
      },
    });
    const fieldSearchText = extractTextContent(fieldSearch.content);
    assert.ok(!fieldSearch.isError, `search_in_field should succeed in the MCP smoke test: ${fieldSearchText}`);
    const fieldSearchJson = JSON.parse(fieldSearchText) as {
      field?: string;
      totalMatches?: number;
      returnedMatches?: number;
    };
    assert.equal(fieldSearchJson.field, 'description');
    assert.equal(fieldSearchJson.totalMatches, 1);
    assert.equal(fieldSearchJson.returnedMatches, 1);

    const result = await client.callTool({
      name: 'search_all_fields',
      arguments: {
        query: 'alpha',
        include_lorebook: true,
        include_greetings: true,
        context_chars: 12,
        max_matches_per_field: 5,
      },
    });

    const textContent = extractTextContent(result.content);
    if (result.isError) {
      assert.match(
        textContent,
        /Not found|404/i,
        'Expected the current MCP failure to come from the missing /search-all API route',
      );
      throw new Error(`Expected structured search_all_fields JSON, got MCP error: ${textContent}`);
    }

    const parsed = JSON.parse(textContent) as {
      totalMatches?: number;
      surfaces?: Array<{ target?: string; [key: string]: unknown }>;
    };

    assert.equal(parsed.totalMatches, 5);
    assert.equal(parsed.surfaces?.length, 5);
    assert.deepEqual(
      parsed.surfaces?.map((surface) => surface.target).sort(),
      ['field:description', 'field:firstMessage', 'greeting:alternate:0', 'greeting:groupOnly:0', 'lorebook:0'].sort(),
    );

    const surfacesByTarget = mapSurfacesByTarget(parsed.surfaces ?? []);
    assert.deepEqual(surfacesByTarget.get('field:description'), {
      surfaceType: 'field',
      target: 'field:description',
      field: 'description',
      totalMatches: 1,
      returnedMatches: 1,
      matches: [{ match: 'Alpha' }],
    });
    assert.deepEqual(surfacesByTarget.get('field:firstMessage'), {
      surfaceType: 'field',
      target: 'field:firstMessage',
      field: 'firstMessage',
      totalMatches: 1,
      returnedMatches: 1,
      matches: [{ match: 'alpha' }],
    });
    assert.deepEqual(surfacesByTarget.get('greeting:alternate:0'), {
      surfaceType: 'greeting',
      target: 'greeting:alternate:0',
      field: 'alternateGreetings',
      greetingType: 'alternate',
      index: 0,
      totalMatches: 1,
      returnedMatches: 1,
      matches: [{ match: 'Alpha' }],
    });
    assert.deepEqual(surfacesByTarget.get('greeting:groupOnly:0'), {
      surfaceType: 'greeting',
      target: 'greeting:groupOnly:0',
      field: 'groupOnlyGreetings',
      greetingType: 'groupOnly',
      index: 0,
      totalMatches: 1,
      returnedMatches: 1,
      matches: [{ match: 'alpha' }],
    });
    assert.deepEqual(surfacesByTarget.get('lorebook:0'), {
      surfaceType: 'lorebook',
      target: 'lorebook:0',
      index: 0,
      comment: 'Bridge lore',
      key: 'bridge',
      totalMatches: 1,
      returnedMatches: 1,
      matches: [{ match: 'alpha' }],
    });

    console.log('search_all_fields MCP smoke test passed');
  } catch (error) {
    const stderrText = stderrChunks.join('').trim();
    const detail =
      error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error, null, 2);
    throw new Error(stderrText ? `${detail}\n\nMCP stderr:\n${stderrText}` : detail);
  } finally {
    if (connected) {
      await client.close().catch(() => undefined);
    } else {
      await transport.close().catch(() => undefined);
    }
    await closeServer(api.server);
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
