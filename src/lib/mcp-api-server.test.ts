import * as http from 'http';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

import { startApiServer } from './mcp-api-server';
import {
  combineCssSections,
  combineLuaSections,
  detectCssBlockClose,
  detectCssBlockOpen,
  detectCssSectionInline,
  detectLuaSection,
  parseCssSections,
  parseLuaSections,
} from './section-parser';

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
    getSkillsDir: () => path.join(__dirname, '..', '..', 'skills'),
  });

  const port = await portPromise;
  return { ...api, port };
}

async function postJson<T>(
  port: number,
  token: string,
  urlPath: string,
  body: unknown,
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf-8');
            resolve({
              status: res.statusCode ?? 0,
              data: JSON.parse(raw) as T,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Request timeout')));
    req.write(payload);
    req.end();
  });
}

describe('MCP API search routes', () => {
  it('keeps the existing authenticated POST /field/:name/search route working', async () => {
    const api = await startTestApiServer(createSearchFixture());

    try {
      const response = await postJson<{
        field: string;
        query: string;
        totalMatches: number;
        returnedMatches: number;
        matches: Array<{ match: string }>;
      }>(api.port, api.token, '/field/description/search', {
        query: 'alpha',
        context_chars: 12,
        max_matches: 5,
      });

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        field: 'description',
        query: 'alpha',
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'Alpha' }],
      });
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns structured JSON search results instead of the 404 MCP fallback', async () => {
    const api = await startTestApiServer(createSearchFixture());

    try {
      const response = await postJson<Record<string, unknown>>(api.port, api.token, '/search-all', {
        query: 'alpha',
        include_lorebook: true,
        include_greetings: true,
        context_chars: 12,
        max_matches_per_field: 5,
      });

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        query: 'alpha',
        regex: false,
        contextChars: 12,
        maxMatchesPerSurface: 5,
        totalMatches: 5,
        surfaces: [
          {
            surfaceType: 'field',
            target: 'field:description',
            field: 'description',
            totalMatches: 1,
            returnedMatches: 1,
            matches: [{ match: 'Alpha' }],
          },
          {
            surfaceType: 'field',
            target: 'field:firstMessage',
            field: 'firstMessage',
            totalMatches: 1,
            returnedMatches: 1,
            matches: [{ match: 'alpha' }],
          },
          {
            surfaceType: 'greeting',
            target: 'greeting:alternate:0',
            field: 'alternateGreetings',
            greetingType: 'alternate',
            index: 0,
            totalMatches: 1,
            returnedMatches: 1,
            matches: [{ match: 'Alpha' }],
          },
          {
            surfaceType: 'greeting',
            target: 'greeting:groupOnly:0',
            field: 'groupOnlyGreetings',
            greetingType: 'groupOnly',
            index: 0,
            totalMatches: 1,
            returnedMatches: 1,
            matches: [{ match: 'alpha' }],
          },
          {
            surfaceType: 'lorebook',
            target: 'lorebook:0',
            index: 0,
            comment: 'Bridge lore',
            key: 'bridge',
            totalMatches: 1,
            returnedMatches: 1,
            matches: [{ match: 'alpha' }],
          },
        ],
      });
    } finally {
      await closeServer(api.server);
    }
  });
});
