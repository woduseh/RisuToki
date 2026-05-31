'use strict';

// RisuToki MCP Server
// MCP SDK (StdioServerTransport) + Zod validation
// Communicates with RisuToki via local HTTP API

// eslint-disable-next-line @typescript-eslint/no-require-imports
import http = require('http');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import https = require('https');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import crypto = require('crypto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import os = require('os');

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { startHeadlessMcpApiServer } from './src/lib/mcp-headless-server';
import {
  ALL_TOOL_NAMES,
  buildToolSurfaceProfileCatalog,
  getToolFamily,
  getToolMeta,
  getToolWorkflowStages,
  listToolsForSurfaceProfile,
  resolveToolSurfaceProfileName,
  TOOL_RECOMMENDATIONS,
  TOOL_SURFACE_KINDS,
  TOOL_TAXONOMY,
  type ToolSurfaceProfileName,
} from './src/lib/mcp-tool-taxonomy';
import {
  buildRuntimeMetadata,
  mergeRuntimeMetadata,
  summarizeToolCatalogHealth,
  type RuntimeMetadata,
  type RuntimeMode,
  type ToolCatalogHealthSummary,
} from './src/lib/mcp-runtime-contract';
import { mcpSuccess } from './src/lib/mcp-response-envelope';
import {
  FACADE_V1_CONTRACT_ID,
  FACADE_V1_LIMITS,
  facadeV1ContentSelectorSchema,
  facadeV1GuardSchema,
  facadeV1TargetSchema,
  type FacadeV1ContentSelector,
  type FacadeV1EditOperation,
  type FacadeV1Guard,
  type FacadeV1Target,
  type FacadeV1ToolMutability,
} from './src/lib/mcp-request-schemas';
import { parsePromptTemplate, serializePromptTemplate, type PromptItemModel } from './src/lib/risup-prompt-model';
import {
  extractDocumentToProject,
  getProjectFileType,
  listProjectTree,
  reassembleProjectDocument,
  type ProjectTreeNode,
} from './src/lib/folder-workspace';

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
const DEFAULT_FACADE_READ_MAX_BYTES = 24 * 1024;

interface DanbooruTag {
  id: number;
  name: string;
  category: number;
  count: number;
}

interface TagValidationResult {
  tag: string;
  valid: boolean;
  postCount?: number;
  category?: string;
  source?: 'local' | 'online';
  suggestions?: string[];
}

// ==================== Danbooru Tag Database ====================

const CATEGORY_NAMES: Record<number, string> = {
  0: 'general',
  1: 'artist',
  3: 'copyright',
  4: 'character',
  5: 'meta',
  9: 'rating',
};

const CATEGORY_IDS: Record<string, number> = {
  general: 0,
  artist: 1,
  copyright: 3,
  character: 4,
  meta: 5,
  rating: 9,
};

const SEMANTIC_GROUPS: Record<string, RegExp[]> = {
  composition: [/^(1girl|1boy|solo|multiple_girls|multiple_boys|2girls|2boys|couple)$/],
  hair_color: [/_hair$/, /^(blonde|brown|black|red|blue|green|white|silver|pink|purple|grey|orange)_hair$/],
  hair_style: [
    /^(long|short|medium)_hair$/,
    /ponytail/,
    /twintails/,
    /braid/,
    /bob_cut/,
    /^bangs$/,
    /side_ponytail/,
    /hair_bun/,
  ],
  eye_color: [/_eyes$/],
  expression: [
    /^(smile|blush|open_mouth|closed_eyes|crying|angry|frown|grin|pout|surprised|nervous)$/,
    /^looking_at_viewer$/,
    /^closed_mouth$/,
  ],
  clothing: [
    /dress/,
    /skirt/,
    /^shirt$/,
    /uniform/,
    /armor/,
    /jacket/,
    /boots/,
    /thighhighs/,
    /pantyhose/,
    /swimsuit/,
    /bikini/,
    /kimono/,
    /leotard/,
  ],
  accessories: [
    /hair_ornament/,
    /ribbon/,
    /^bow$/,
    /jewelry/,
    /necklace/,
    /earrings/,
    /hat$/,
    /gloves/,
    /glasses/,
    /headband/,
  ],
  pose: [/^(standing|sitting|lying|kneeling|walking|running|from_behind|from_above|from_below)$/],
  body: [/^(breasts|large_breasts|small_breasts|thighs|navel|midriff|bare_shoulders|collarbone)$/],
  background: [
    /background$/,
    /^(outdoors|indoors)$/,
    /^(sky|night|sunset|sunrise|rain|snow|water)$/,
    /^(city|forest|beach|school|bedroom|classroom)$/,
  ],
};

const tagMap = new Map<string, DanbooruTag>();
let tagsByCount: DanbooruTag[] = [];
let tagsLoaded = false;
const apiCache = new Map<string, DanbooruTag | null>();
const API_CACHE_MAX = 5000;

/** Whether the MCP transport is connected (logging available). */
let mcpConnected = false;

function apiCacheSet(key: string, value: DanbooruTag | null): void {
  if (apiCache.size >= API_CACHE_MAX) {
    const firstKey = apiCache.keys().next().value;
    if (firstKey !== undefined) apiCache.delete(firstKey);
  }
  apiCache.set(key, value);
}

function loadTags(): void {
  const tagFilePath = path.join(__dirname, 'resources', 'Danbooru Tag.txt');
  try {
    const content = fs.readFileSync(tagFilePath, 'utf-8');
    const lines = content.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length < 4) continue;
      const tag: DanbooruTag = {
        id: parseInt(parts[0], 10),
        name: parts[1],
        category: parseInt(parts[2], 10),
        count: parseInt(parts[3], 10),
      };
      tagMap.set(tag.name, tag);
    }
    tagsByCount = Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
    tagsLoaded = true;
    mcpLog('info', `Loaded ${tagMap.size} Danbooru tags`);
  } catch (err) {
    mcpLog('warning', `Failed to load tags: ${err}`);
  }
}

/** Ensure tag DB is loaded, retrying once if the initial startup load failed. */
function ensureTagsLoaded(): void {
  if (!tagsLoaded) {
    loadTags();
    if (!tagsLoaded) throw new Error('Tag database not loaded');
  }
}

// Two-row DP Levenshtein: O(n) memory instead of O(m×n)
function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

const suggestCache = new Map<string, string[]>();
const SUGGEST_CACHE_MAX = 500;

function suggestSimilar(tag: string, limit = 5): string[] {
  const cacheKey = `${tag}:${limit}`;
  const cached = suggestCache.get(cacheKey);
  if (cached) return cached;

  const scored: Array<{ name: string; score: number }> = [];
  // Tighter length filter (3 instead of 5) to skip more candidates
  const maxLenDiff = Math.max(3, Math.floor(tag.length * 0.4));
  for (const [name, tagData] of tagMap) {
    if (Math.abs(name.length - tag.length) > maxLenDiff) continue;
    const distance = levenshtein(tag, name);
    const maxLen = Math.max(tag.length, name.length);
    const similarity = 1 - distance / maxLen;
    if (similarity >= 0.4) {
      const popularityBoost = Math.log10(tagData.count + 1) / 10;
      scored.push({ name, score: similarity + popularityBoost });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const result = scored.slice(0, limit).map((s) => s.name);

  // LRU-style eviction for suggestion cache
  if (suggestCache.size >= SUGGEST_CACHE_MAX) {
    const firstKey = suggestCache.keys().next().value;
    if (firstKey !== undefined) suggestCache.delete(firstKey);
  }
  suggestCache.set(cacheKey, result);
  return result;
}

function searchTags(query: string, category?: string, limit = 20): DanbooruTag[] {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, '_');
  const catId = category ? CATEGORY_IDS[category] : undefined;
  const results: DanbooruTag[] = [];
  const hasWildcard = normalized.includes('*');

  if (hasWildcard) {
    const regexStr = normalized.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexStr}$`);
    for (const tag of tagsByCount) {
      if (catId !== undefined && tag.category !== catId) continue;
      if (regex.test(tag.name)) {
        results.push(tag);
        if (results.length >= limit) break;
      }
    }
  } else {
    const exact = tagMap.get(normalized);
    if (exact && (catId === undefined || exact.category === catId)) results.push(exact);
    for (const tag of tagsByCount) {
      if (results.length >= limit) break;
      if (catId !== undefined && tag.category !== catId) continue;
      if (tag.name === normalized) continue;
      if (tag.name.startsWith(normalized)) results.push(tag);
    }
    if (results.length < limit) {
      for (const tag of tagsByCount) {
        if (results.length >= limit) break;
        if (catId !== undefined && tag.category !== catId) continue;
        if (tag.name.startsWith(normalized)) continue;
        if (tag.name.includes(normalized)) results.push(tag);
      }
    }
  }
  return results;
}

function getPopular(category?: string, limit = 100): DanbooruTag[] {
  const catId = category ? CATEGORY_IDS[category] : undefined;
  if (catId === undefined) return tagsByCount.slice(0, limit);
  const results: DanbooruTag[] = [];
  for (const tag of tagsByCount) {
    if (tag.category === catId) {
      results.push(tag);
      if (results.length >= limit) break;
    }
  }
  return results;
}

// Cache for getPopularGrouped (computed once after tag loading)
let popularGroupedCache: Record<string, string[]> | null = null;

function getPopularGrouped(): Record<string, string[]> {
  if (popularGroupedCache) return popularGroupedCache;
  const groups: Record<string, string[]> = {};
  for (const [groupName, patterns] of Object.entries(SEMANTIC_GROUPS)) {
    const matched: DanbooruTag[] = [];
    for (const tag of tagsByCount) {
      for (const pattern of patterns) {
        if (pattern.test(tag.name)) {
          matched.push(tag);
          break;
        }
      }
    }
    groups[groupName] = matched.slice(0, 30).map((t) => t.name);
  }
  popularGroupedCache = groups;
  return groups;
}

function formatTags(tags: DanbooruTag[]): Array<{ name: string; category: string; post_count: number }> {
  return tags.map((t) => ({ name: t.name, category: CATEGORY_NAMES[t.category] || 'unknown', post_count: t.count }));
}

function danbooruApiValidate(tagName: string): Promise<DanbooruTag | null> {
  const key = `validate:${tagName}`;
  if (apiCache.has(key)) return Promise.resolve(apiCache.get(key)!);

  return new Promise((resolve) => {
    const url = `https://danbooru.donmai.us/tags.json?search%5Bname%5D=${encodeURIComponent(tagName)}&limit=1`;
    const req = https.get(url, { timeout: 5000 }, (res) => {
      const chunks: string[] = [];
      res.on('data', (chunk: string) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const results = JSON.parse(chunks.join(''));
          const tag =
            Array.isArray(results) && results.length > 0
              ? {
                  id: results[0].id,
                  name: results[0].name,
                  category: results[0].category,
                  count: results[0].post_count,
                }
              : null;
          if (tag && results[0].is_deprecated) {
            apiCacheSet(key, null);
            resolve(null);
          } else {
            apiCacheSet(key, tag);
            resolve(tag);
          }
        } catch {
          apiCacheSet(key, null);
          resolve(null);
        }
      });
    });
    req.on('error', () => {
      resolve(null);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function danbooruApiSearch(query: string, limit = 20): Promise<DanbooruTag[]> {
  return new Promise((resolve) => {
    const nameMatch = query.includes('*') ? query : `*${query}*`;
    const url = `https://danbooru.donmai.us/tags.json?search%5Bname_matches%5D=${encodeURIComponent(nameMatch)}&search%5Border%5D=count&limit=${limit}`;
    const req = https.get(url, { timeout: 5000 }, (res) => {
      const chunks: string[] = [];
      res.on('data', (chunk: string) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const results = JSON.parse(chunks.join(''));
          if (!Array.isArray(results)) {
            resolve([]);
            return;
          }
          const tags = results.map((r: Record<string, unknown>) => ({
            id: r.id as number,
            name: r.name as string,
            category: r.category as number,
            count: r.post_count as number,
          }));
          for (const tag of tags) apiCacheSet(`validate:${tag.name}`, tag);
          resolve(tags);
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', () => {
      resolve([]);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

async function validateTags(tags: string[], onlineFallback = true): Promise<TagValidationResult[]> {
  const results: TagValidationResult[] = [];
  for (const tagName of tags) {
    const normalized = tagName.trim().toLowerCase().replace(/\s+/g, '_');
    const localTag = tagMap.get(normalized);
    if (localTag) {
      results.push({
        tag: normalized,
        valid: true,
        postCount: localTag.count,
        category: CATEGORY_NAMES[localTag.category] || 'unknown',
        source: 'local',
      });
      continue;
    }
    if (onlineFallback) {
      const onlineTag = await danbooruApiValidate(normalized);
      if (onlineTag) {
        results.push({
          tag: normalized,
          valid: true,
          postCount: onlineTag.count,
          category: CATEGORY_NAMES[onlineTag.category] || 'unknown',
          source: 'online',
        });
        continue;
      }
    }
    const suggestions = suggestSimilar(normalized, 5);
    results.push({ tag: normalized, valid: false, suggestions: suggestions.length > 0 ? suggestions : undefined });
  }
  return results;
}

async function searchWithOnline(query: string, category?: string, limit = 20): Promise<DanbooruTag[]> {
  const localResults = searchTags(query, category, limit);
  if (localResults.length >= limit) return localResults;
  try {
    const remaining = limit - localResults.length;
    const onlineResults = await danbooruApiSearch(query, remaining);
    const localNames = new Set(localResults.map((t) => t.name));
    for (const online of onlineResults) {
      if (localNames.has(online.name)) continue;
      if (category && CATEGORY_IDS[category] !== undefined && online.category !== CATEGORY_IDS[category]) continue;
      localResults.push(online);
      if (localResults.length >= limit) break;
    }
  } catch {
    /* online search failed, return local only */
  }
  return localResults;
}

function buildDanbooruGuide(characterDescription?: string): string {
  const groups = tagsLoaded ? getPopularGrouped() : {};
  let guide = `# Danbooru Tag Prompt Guide

## Tag Format Rules
- Use **underscores** instead of spaces: \`long_hair\` not \`long hair\`
- All lowercase: \`blue_eyes\` not \`Blue_Eyes\`
- Use established compound tags: \`hair_ornament\`, \`looking_at_viewer\`
- Separate tags with commas: \`1girl, solo, long_hair, blue_eyes\`
- Do NOT invent new tags — always verify with \`validate_danbooru_tags\` tool

## Tag Categories (Danbooru)
- **General (0)**: Descriptive tags for appearance, actions, objects (most commonly used)
- **Artist (1)**: Artist name tags
- **Copyright (3)**: Series/franchise tags
- **Character (4)**: Specific character name tags
- **Meta (5)**: Technical tags (e.g., highres, absurdres)

## Prompt Writing Tips
1. Start with composition: \`1girl, solo\` or \`2girls, multiple_girls\`
2. Add hair: color + style (e.g., \`blonde_hair, long_hair, ponytail\`)
3. Add eyes: \`blue_eyes\`, \`red_eyes\`, etc.
4. Add expression: \`smile\`, \`blush\`, \`open_mouth\`
5. Add clothing: \`school_uniform\`, \`dress\`, \`armor\`
6. Add accessories: \`hair_ribbon\`, \`glasses\`, \`hat\`
7. Add pose/action: \`standing\`, \`sitting\`, \`looking_at_viewer\`
8. Add background: \`simple_background\`, \`outdoors\`, \`classroom\`

## ⚠️ IMPORTANT
- ALWAYS use \`validate_danbooru_tags\` to verify tags before using them in prompts
- Use \`search_danbooru_tags\` to find the correct tag when unsure
- Use \`get_popular_danbooru_tags\` with \`group_by_semantic=true\` for reference
`;

  if (Object.keys(groups).length > 0) {
    guide += '\n## Popular Tags by Category\n';
    for (const [group, tags] of Object.entries(groups)) {
      if (tags.length > 0) {
        const displayName = group.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        guide += `\n### ${displayName}\n\`${tags.slice(0, 20).join(', ')}\`\n`;
      }
    }
  }

  if (characterDescription) {
    guide += `\n## Your Character Description\n"${characterDescription}"\n\nPlease use the tags above and the \`search_danbooru_tags\` tool to find appropriate tags for this character. Validate all tags with \`validate_danbooru_tags\` before creating the prompt.\n`;
  }

  return guide;
}

// Load tags at startup
loadTags();

// ==================== Helper ====================

/** Sentinel key marking an API or infrastructure error resolved (not thrown) by apiRequest(). */
const API_ERROR_KEY = '__apiError' as const;

interface ApiErrorResult {
  [API_ERROR_KEY]: true;
  status: number;
  [key: string]: unknown;
}

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

function isApiError(data: unknown): data is ApiErrorResult {
  return !!data && typeof data === 'object' && (data as Record<string, unknown>)[API_ERROR_KEY] === true;
}

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

function byteLengthForDiagnostic(value: string | null): number {
  return value ? Buffer.byteLength(value) : 0;
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
    return { content: [{ type: 'text' as const, text: JSON.stringify(rest) }], isError: true as const };
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

async function apiRequest(method: string, urlPath: string, body?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const payloadBytes = byteLengthForDiagnostic(payload);
    const startedAt = Date.now();
    logProcessDiagnostic('apiRequestStart', { method, path: urlPath, payloadBytes });
    const headers: Record<string, string | number> = {
      Authorization: `Bearer ${TOKI_TOKEN}`,
      'Content-Type': 'application/json',
    };
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: TOKI_PORT,
      path: urlPath,
      method: method,
      headers: headers,
    };

    const req = http.request(options, (res) => {
      const chunks: string[] = [];
      res.on('data', (chunk) => chunks.push(chunk as string));
      res.on('end', () => {
        const data = chunks.join('');
        const elapsedMs = Date.now() - startedAt;
        try {
          const parsed = JSON.parse(data);
          logProcessDiagnostic('apiResponse', {
            method,
            path: urlPath,
            status: res.statusCode ?? null,
            elapsedMs,
            responseBytes: Buffer.byteLength(data),
          });
          if (res.statusCode && res.statusCode >= 400) {
            // Preserve the full structured error envelope from mcp-api-server
            // (action, target, suggestion, retryable, next_actions, details, etc.)
            resolve({ [API_ERROR_KEY]: true, status: res.statusCode, ...parsed });
          } else {
            resolve(parsed);
          }
        } catch (error) {
          noteRuntimeError('apiNetworkError', `Invalid JSON response from ${method} ${urlPath}`);
          logProcessDiagnostic('apiInvalidJson', {
            method,
            path: urlPath,
            status: res.statusCode ?? null,
            elapsedMs,
            responseBytes: Buffer.byteLength(data),
            error,
          });
          resolve({
            [API_ERROR_KEY]: true,
            status: res.statusCode ?? 502,
            error: `Invalid JSON response from API server`,
            suggestion: 'This may indicate a server-side crash. Check RisuToki editor logs.',
          });
        }
      });
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      noteRuntimeError('apiNetworkError', `${err.code ?? 'network'} ${method} ${urlPath}: ${err.message}`);
      logProcessDiagnostic('apiNetworkError', {
        method,
        path: urlPath,
        elapsedMs: Date.now() - startedAt,
        code: err.code,
        error: err,
      });
      if (err.code === 'ECONNREFUSED') {
        mcpLog('error', 'API connection refused — RisuToki editor not running');
        resolve({
          [API_ERROR_KEY]: true,
          status: 503,
          error: 'RisuToki editor is not running',
          suggestion: 'Start the RisuToki editor application, then retry.',
          retryable: true,
        });
      } else {
        mcpLog('error', `API network error: ${err.message}`);
        resolve({
          [API_ERROR_KEY]: true,
          status: 502,
          error: `Network error: ${err.message}`,
          suggestion: 'Check that RisuToki editor is running and accessible.',
          retryable: true,
        });
      }
    });
    req.setTimeout(120000, () => {
      req.destroy();
      noteRuntimeError('apiTimeout', `${method} ${urlPath} timed out after 120 seconds`);
      logProcessDiagnostic('apiTimeout', {
        method,
        path: urlPath,
        elapsedMs: Date.now() - startedAt,
        payloadBytes,
      });
      mcpLog('error', `API request timed out: ${method} ${urlPath}`);
      resolve({
        [API_ERROR_KEY]: true,
        status: 504,
        error: 'Request timed out after 120 seconds',
        suggestion: 'For large data, try narrowing the scope (e.g. use field ranges or smaller batch sizes).',
        retryable: true,
      });
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ==================== Facade v1 Helpers ====================

const FACADE_PREVIEW_TTL_MS = 10 * 60 * 1000;

interface FacadeRoute {
  tool: string;
  method: string;
  route: string;
}

interface FacadePreviewEntry {
  token: string;
  operationDigest: string;
  target: FacadeV1Target;
  operations: FacadeV1EditOperation[];
  routes: FacadeRoute[];
  touchedTargets: string[];
  requiredGuards: FacadeV1Guard[];
  expiresAtMs: number;
}

const facadePreviewStore = new Map<string, FacadePreviewEntry>();

const facadeEditOperationSchema = z.object({
  op: z.enum(['write_content', 'replace_text', 'insert_text', 'delete_item', 'patch_surface']),
  selector: facadeV1ContentSelectorSchema,
  content: z.unknown().optional(),
  find: z.string().min(1).optional(),
  replace: z.string().optional(),
  regex: z.boolean().optional(),
  flags: z.string().optional(),
  field: z.string().optional(),
  guards: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
});

function facadeApiError(
  status: number,
  error: string,
  suggestion: string,
  details?: Record<string, unknown>,
  nextActions?: string[],
): ApiErrorResult {
  return {
    [API_ERROR_KEY]: true as const,
    status,
    error,
    suggestion,
    ...(details ? { details } : {}),
    ...(nextActions ? { next_actions: nextActions } : {}),
  };
}

function isReadOnlyFacadeFieldPayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  return record.readOnly === true || record.deprecated === true;
}

function cleanupFacadePreviews(): void {
  const now = Date.now();
  for (const [token, entry] of facadePreviewStore.entries()) {
    if (entry.expiresAtMs <= now) facadePreviewStore.delete(token);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function operationDigest(target: FacadeV1Target, operations: FacadeV1EditOperation[]): string {
  return crypto.createHash('sha256').update(stableJson({ target, operations })).digest('hex');
}

function makePreviewToken(): string {
  return `facade-preview-v1.${crypto.randomBytes(18).toString('base64url')}`;
}

function sameTarget(a: FacadeV1Target, b: FacadeV1Target): boolean {
  return stableJson(a) === stableJson(b);
}

function route(tool: string, method: string, routePath: string): FacadeRoute {
  return { tool, method, route: routePath };
}

function selectorTarget(selector: FacadeV1ContentSelector): string {
  if (selector.family === 'lorebook') {
    if (selector.id) return `lorebook:${selector.id}${selector.field ? `:${selector.field}` : ''}`;
    if (selector.ids) return `lorebook:[${selector.ids.join(',')}]${selector.field ? `:${selector.field}` : ''}`;
    if (selector.index !== undefined) return `lorebook:${selector.index}${selector.field ? `:${selector.field}` : ''}`;
    if (selector.indices)
      return `lorebook:[${selector.indices.join(',')}]${selector.field ? `:${selector.field}` : ''}`;
    return 'lorebook';
  }
  if (selector.family === 'greeting') {
    const type = selector.greeting_type ?? 'unknown';
    if (selector.identity) return `greeting:${type}:identity`;
    if (selector.index !== undefined) return `greeting:${type}:${selector.index}`;
    if (selector.indices) return `greeting:${type}:[${selector.indices.join(',')}]`;
    return `greeting:${type}`;
  }
  if (selector.family === 'regex' || selector.family === 'risup-prompt') {
    if (selector.id) return `${selector.family}:${selector.id}`;
    if (selector.ids) return `${selector.family}:[${selector.ids.join(',')}]`;
    if (selector.identity) return `${selector.family}:identity`;
    if (selector.index !== undefined) return `${selector.family}:${selector.index}`;
    if (selector.indices) return `${selector.family}:[${selector.indices.join(',')}]`;
    return selector.family;
  }
  if (selector.family === 'surface' || selector.path) return `surface:${selector.path ?? '/'}`;
  if (selector.field) return `field:${selector.field}`;
  if (selector.family && selector.index !== undefined) return `${selector.family}:${selector.index}`;
  return selector.family ?? 'document';
}

function selectorFamily(selector: FacadeV1ContentSelector): string {
  if (selector.family) return selector.family;
  if (selector.path) return 'surface';
  if (selector.field) return 'field';
  return 'document';
}

function surfaceValueOverview(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return {
      kind: 'array',
      length: value.length,
      sampleTypes: value
        .slice(0, 10)
        .map((item) => (Array.isArray(item) ? 'array' : item === null ? 'null' : typeof item)),
    };
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    return {
      kind: 'object',
      keyCount: keys.length,
      keys: keys.slice(0, 80),
      omittedKeys: Math.max(0, keys.length - 80),
      childSummary: Object.fromEntries(
        keys.slice(0, 30).map((key) => {
          const child = record[key];
          if (Array.isArray(child)) return [key, { kind: 'array', length: child.length }];
          if (child && typeof child === 'object') return [key, { kind: 'object', keyCount: Object.keys(child).length }];
          if (typeof child === 'string') return [key, { kind: 'string', length: child.length }];
          return [key, { kind: child === null ? 'null' : typeof child }];
        }),
      ),
    };
  }
  if (typeof value === 'string') return { kind: 'string', length: value.length, preview: value.slice(0, 300) };
  return { kind: value === null ? 'null' : typeof value };
}

function maybeOverviewSurfaceRead(data: unknown, selector: FacadeV1ContentSelector): unknown {
  const pathValue = selector.path ?? '/';
  if (selector.include_raw === true || (pathValue !== '/' && pathValue !== '')) return data;
  const record = asRecord(data);
  if (!record || !('value' in record)) return data;
  return {
    ...record,
    value: undefined,
    overview: surfaceValueOverview(record.value),
    raw_omitted: true,
    continuation_hint:
      'Root surface raw JSON is omitted by default. Re-run read_content with selector.include_raw=true and explicit max_bytes, or choose a narrower selector.path.',
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function hasRisupPromptImportContext(operation: FacadeV1EditOperation): boolean {
  const content = operation.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
  const keys = Object.keys(content);
  return keys.some((key) => ['import', 'imported', 'source', 'source_text', 'sourcePath', 'source_path'].includes(key));
}

function applyEditPostEditMetadata(entry: FacadePreviewEntry): {
  nextActions: string[];
  artifacts: Record<string, unknown>;
} {
  const editedFamilies = uniqueStrings(entry.operations.map((operation) => selectorFamily(operation.selector))).sort();
  const touchedSelectors = entry.operations.map((operation) => operation.selector);
  const hasImportContext = entry.operations.some(
    (operation) => selectorFamily(operation.selector) === 'risup-prompt' && hasRisupPromptImportContext(operation),
  );
  const nextActions: string[] = [];
  const postEditValidation: Array<Record<string, unknown>> = [];
  const recommendedReads: Array<Record<string, unknown>> = [];
  const recommendedDiffs: Array<Record<string, unknown>> = [];

  if (editedFamilies.includes('lorebook')) {
    nextActions.push('validate_content', 'read_content', 'diff_lorebook');
    postEditValidation.push({
      family: 'lorebook',
      tools: ['validate_content'],
      reason: 'Check active lorebook key hygiene after lorebook mutations.',
    });
    recommendedReads.push({
      family: 'lorebook',
      tool: 'read_content',
      target: entry.target,
      selectors: touchedSelectors.filter((selector) => selectorFamily(selector) === 'lorebook'),
    });
    recommendedDiffs.push({
      family: 'lorebook',
      tool: 'diff_lorebook',
      selectors: touchedSelectors.filter((selector) => selectorFamily(selector) === 'lorebook'),
      note: 'Run when a reference lorebook entry is available for comparison.',
    });
  }

  if (editedFamilies.includes('risup-prompt')) {
    nextActions.push('validate_content', 'read_content', 'diff_risup_prompt');
    if (hasImportContext) nextActions.push('validate_risup_prompt_import');
    postEditValidation.push({
      family: 'risup-prompt',
      tools: hasImportContext ? ['validate_content', 'validate_risup_prompt_import'] : ['validate_content'],
      reason: hasImportContext
        ? 'Import/source context was present; verify the imported prompt structure.'
        : 'Check promptTemplate/formatingOrder structure, then read back the edited item.',
    });
    recommendedReads.push({
      family: 'risup-prompt',
      tool: 'read_content',
      target: entry.target,
      selectors: touchedSelectors.filter((selector) => selectorFamily(selector) === 'risup-prompt'),
    });
    recommendedDiffs.push({
      family: 'risup-prompt',
      tool: 'diff_risup_prompt',
    });
  }

  if (editedFamilies.some((family) => family === 'field' || family === 'surface')) {
    nextActions.push('read_content', 'search_document');
    recommendedReads.push({
      family: 'field-surface',
      tool: 'read_content',
      target: entry.target,
      selectors: touchedSelectors.filter((selector) => {
        const family = selectorFamily(selector);
        return family === 'field' || family === 'surface';
      }),
    });
  }

  for (const family of editedFamilies) {
    if (!['field', 'surface', 'lorebook', 'risup-prompt'].includes(family)) {
      nextActions.push('read_content', 'search_document');
      recommendedReads.push({
        family,
        tool: 'read_content',
        target: entry.target,
        selectors: touchedSelectors.filter((selector) => selectorFamily(selector) === family),
        note: 'Unsupported facade edit family; use readback/search before choosing granular validators.',
      });
    }
  }

  if (nextActions.length === 0) nextActions.push('read_content', 'search_document');

  return {
    nextActions: uniqueStrings(nextActions),
    artifacts: {
      edited_families: editedFamilies,
      post_edit_validation: postEditValidation,
      recommended_reads: recommendedReads,
      recommended_diffs: recommendedDiffs,
    },
  };
}

function facadeEnvelope(
  tool: string,
  mutability: FacadeV1ToolMutability,
  target: FacadeV1Target | undefined,
  result: Record<string, unknown>,
  summary: string,
  nextActions: string[],
  artifacts: Record<string, unknown> = {},
  maxBytes?: number,
) {
  let truncated = false;
  let finalResult: Record<string, unknown> = result;
  const resultBytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (maxBytes && resultBytes > maxBytes) {
    truncated = true;
    finalResult = {
      truncated: true,
      preview: JSON.stringify(result).slice(0, Math.max(0, maxBytes - 256)),
      original_byte_size: resultBytes,
      continuation_hint:
        'Narrow the selector, use search_document, or pass an explicit max_bytes when you need a larger bounded read.',
    };
  }

  return mcpSuccess(
    {
      facade: {
        contract: FACADE_V1_CONTRACT_ID,
        version: 'v1',
        tool,
        mutability,
        ...(target ? { target } : {}),
        ...(maxBytes ? { max_bytes: maxBytes } : {}),
        ...(truncated ? { truncated: true } : {}),
        response_bytes: resultBytes,
      },
      result: finalResult,
    },
    {
      toolName: tool,
      summary,
      nextActions,
      artifacts: {
        ...artifacts,
        result_byte_size: resultBytes,
        ...(truncated
          ? {
              truncated: true,
              original_byte_size: resultBytes,
              continuation_hint:
                'Narrow the selector, use search_document, or pass an explicit max_bytes when you need a larger bounded read.',
            }
          : {}),
      },
    },
  );
}

async function resolveReferenceIndex(target: FacadeV1Target): Promise<number | ApiErrorResult> {
  if (target.kind !== 'reference')
    return facadeApiError(400, 'Target is not a reference', 'Use target.kind="reference".');
  if (target.reference_id && /^\d+$/.test(target.reference_id)) return Number(target.reference_id);
  const refs = await apiRequest('GET', '/references');
  if (isApiError(refs)) return refs;
  const files = Array.isArray((refs as Record<string, unknown>).files)
    ? ((refs as Record<string, unknown>).files as Array<Record<string, unknown>>)
    : [];
  const index = files.findIndex((ref, i) => {
    const candidates = [String(i), ref.id, ref.filePath, ref.file_path, ref.fileName, ref.name].filter(
      (value): value is string => typeof value === 'string',
    );
    return candidates.includes(target.reference_id ?? '') || candidates.includes(target.file_path ?? '');
  });
  if (index < 0) {
    return facadeApiError(
      404,
      'Reference target not found',
      'Call list_references, then retry with reference_id as its index.',
    );
  }
  return index;
}

async function readFacadeSelector(
  target: FacadeV1Target,
  selector: FacadeV1ContentSelector,
): Promise<{ data: unknown; routes: FacadeRoute[] } | ApiErrorResult> {
  if (target.kind === 'active') {
    if (selector.family === 'lorebook') {
      if (selector.id) {
        const lorebookRoute = `/lorebook/by-id/${encodeURIComponent(selector.id)}`;
        const data = await apiRequest('GET', lorebookRoute);
        return isApiError(data) ? data : { data, routes: [route('read_lorebook_by_id', 'GET', lorebookRoute)] };
      }
      if (selector.index !== undefined) {
        const lorebookRoute = `/lorebook/${selector.index}`;
        const data = await apiRequest('GET', lorebookRoute);
        return isApiError(data) ? data : { data, routes: [route('read_lorebook', 'GET', lorebookRoute)] };
      }
      if (selector.indices) {
        const data = await apiRequest('POST', '/lorebook/batch', {
          indices: selector.indices,
          ...(selector.field ? { fields: [selector.field] } : {}),
        });
        return isApiError(data) ? data : { data, routes: [route('read_lorebook_batch', 'POST', '/lorebook/batch')] };
      }
      const data = await apiRequest('GET', '/lorebook');
      return isApiError(data) ? data : { data, routes: [route('list_lorebook', 'GET', '/lorebook')] };
    }
    if (selector.family === 'regex') {
      if (selector.identity) {
        const data = await apiRequest('POST', '/regex/by-identity/read', { identity: selector.identity });
        return isApiError(data)
          ? data
          : { data, routes: [route('read_regex_by_identity', 'POST', '/regex/by-identity/read')] };
      }
      if (selector.index !== undefined) {
        const regexRoute = `/regex/${selector.index}`;
        const data = await apiRequest('GET', regexRoute);
        return isApiError(data) ? data : { data, routes: [route('read_regex', 'GET', regexRoute)] };
      }
      if (selector.indices) {
        const data = await apiRequest('POST', '/regex/batch', { indices: selector.indices });
        return isApiError(data) ? data : { data, routes: [route('read_regex_batch', 'POST', '/regex/batch')] };
      }
      const data = await apiRequest('GET', '/regex');
      return isApiError(data) ? data : { data, routes: [route('list_regex', 'GET', '/regex')] };
    }
    if (selector.family === 'greeting') {
      if (!selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting selector',
          'read_content greeting selectors require greeting_type="alternate" or "group"; the facade will not guess between alternateGreetings and groupOnlyGreetings.',
          { selector },
        );
      }
      const type = encodeURIComponent(selector.greeting_type);
      if (selector.identity) {
        const greetingRoute = `/greeting/${type}/by-hash/read`;
        const data = await apiRequest('POST', greetingRoute, { identity: selector.identity });
        return isApiError(data) ? data : { data, routes: [route('read_greeting_by_hash', 'POST', greetingRoute)] };
      }
      if (selector.index !== undefined) {
        const greetingRoute = `/greeting/${type}/${selector.index}`;
        const data = await apiRequest('GET', greetingRoute);
        return isApiError(data) ? data : { data, routes: [route('read_greeting', 'GET', greetingRoute)] };
      }
      if (selector.indices) {
        const greetingRoute = `/greeting/${type}/batch`;
        const data = await apiRequest('POST', greetingRoute, { indices: selector.indices });
        return isApiError(data) ? data : { data, routes: [route('read_greeting_batch', 'POST', greetingRoute)] };
      }
      const greetingRoute = `/greetings/${type}`;
      const data = await apiRequest('GET', greetingRoute);
      return isApiError(data) ? data : { data, routes: [route('list_greetings', 'GET', greetingRoute)] };
    }
    if (selector.family === 'risup-prompt') {
      if (selector.id) {
        const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(selector.id)}`;
        const data = await apiRequest('GET', promptRoute);
        return isApiError(data) ? data : { data, routes: [route('read_risup_prompt_item_by_id', 'GET', promptRoute)] };
      }
      if (selector.index !== undefined) {
        const promptRoute = `/risup/prompt-item/${selector.index}`;
        const data = await apiRequest('GET', promptRoute);
        return isApiError(data) ? data : { data, routes: [route('read_risup_prompt_item', 'GET', promptRoute)] };
      }
      if (selector.indices) {
        const data = await apiRequest('POST', '/risup/prompt-item/batch', { indices: selector.indices });
        return isApiError(data)
          ? data
          : { data, routes: [route('read_risup_prompt_item_batch', 'POST', '/risup/prompt-item/batch')] };
      }
      const data = await apiRequest('GET', '/risup/prompt-items');
      return isApiError(data)
        ? data
        : { data, routes: [route('list_risup_prompt_items', 'GET', '/risup/prompt-items')] };
    }
    if (selector.family === 'surface' || selector.path) {
      const pathValue = selector.path ?? '/';
      const data = await apiRequest('POST', '/surface/read', { path: pathValue });
      return isApiError(data)
        ? data
        : { data: maybeOverviewSurfaceRead(data, selector), routes: [route('read_surface', 'POST', '/surface/read')] };
    }
    if (selector.field) {
      const fieldRoute = `/field/${encodeURIComponent(selector.field)}`;
      const data = await apiRequest('GET', fieldRoute);
      return isApiError(data) ? data : { data, routes: [route('read_field', 'GET', fieldRoute)] };
    }
  }

  if (target.kind === 'external') {
    if (selector.family === 'lorebook') {
      return facadeApiError(
        400,
        'External lorebook selectors are not supported by read_content yet',
        'Use inspect_external_file/probe_lorebook or open the file, then retry with target.kind="active".',
        { selector },
      );
    }
    if (selector.family === 'risup-prompt') {
      const externalPrompt = await readExternalRisupPromptModel(target.file_path);
      if (isApiError(externalPrompt)) return externalPrompt;
      const indices = resolveRisupPromptSelectorIndices(externalPrompt.model, selector, 'read external risup prompt');
      if (!Array.isArray(indices)) return indices;
      if (selector.id || selector.index !== undefined || selector.ids || selector.indices) {
        const entries = indices.map((index) => {
          const item = externalPrompt.model.items[index];
          return {
            index,
            id: item.id ?? null,
            item: item.rawValue,
            supported: item.supported,
            type: item.type ?? null,
            preview: risupPromptItemPreview(item),
          };
        });
        return {
          data: {
            file_path: target.file_path,
            count: entries.length,
            total: indices.length,
            entries,
          },
          routes: externalPrompt.routes,
        };
      }
      return {
        data: {
          file_path: target.file_path,
          count: externalPrompt.model.items.length,
          state: externalPrompt.model.state,
          hasUnsupportedContent: externalPrompt.model.hasUnsupportedContent,
          items: externalPrompt.model.items.map(risupPromptItemSummary),
        },
        routes: externalPrompt.routes,
      };
    }
    if (selector.family === 'surface' || selector.path) {
      const data = await apiRequest('POST', '/external/surface/read', {
        file_path: target.file_path,
        path: selector.path ?? '/',
      });
      return isApiError(data)
        ? data
        : {
            data: maybeOverviewSurfaceRead(data, selector),
            routes: [route('external_read_surface', 'POST', '/external/surface/read')],
          };
    }
    if (selector.field) {
      const fieldRoute = `/probe/field/${encodeURIComponent(selector.field)}`;
      const data = await apiRequest('POST', fieldRoute, { file_path: target.file_path });
      return isApiError(data) ? data : { data, routes: [route('probe_field', 'POST', fieldRoute)] };
    }
  }

  if (target.kind === 'reference') {
    const index = await resolveReferenceIndex(target);
    if (typeof index !== 'number') return index;
    if (selector.family === 'lorebook') {
      if (selector.index !== undefined) {
        const lorebookRoute = `/reference/${index}/lorebook/${selector.index}`;
        const data = await apiRequest('GET', lorebookRoute);
        return isApiError(data) ? data : { data, routes: [route('read_reference_lorebook', 'GET', lorebookRoute)] };
      }
      if (selector.indices) {
        const data = await apiRequest('POST', `/reference/${index}/lorebook/batch`, {
          indices: selector.indices,
          ...(selector.field ? { fields: [selector.field] } : {}),
        });
        return isApiError(data)
          ? data
          : {
              data,
              routes: [route('read_reference_lorebook_batch', 'POST', `/reference/${index}/lorebook/batch`)],
            };
      }
      const lorebookRoute = `/reference/${index}/lorebook`;
      const data = await apiRequest('GET', lorebookRoute);
      return isApiError(data) ? data : { data, routes: [route('list_reference_lorebook', 'GET', lorebookRoute)] };
    }
    if (selector.family === 'regex') {
      if (selector.index !== undefined) {
        const regexRoute = `/reference/${index}/regex/${selector.index}`;
        const data = await apiRequest('GET', regexRoute);
        return isApiError(data) ? data : { data, routes: [route('read_reference_regex', 'GET', regexRoute)] };
      }
      if (selector.indices) {
        const regexRoute = `/reference/${index}/regex/batch`;
        const data = await apiRequest('POST', regexRoute, { indices: selector.indices });
        return isApiError(data) ? data : { data, routes: [route('read_reference_regex_batch', 'POST', regexRoute)] };
      }
      const regexRoute = `/reference/${index}/regex`;
      const data = await apiRequest('GET', regexRoute);
      return isApiError(data) ? data : { data, routes: [route('list_reference_regex', 'GET', regexRoute)] };
    }
    if (selector.family === 'greeting') {
      if (!selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting selector',
          'read_content greeting selectors require greeting_type="alternate" or "group"; the facade will not guess between alternateGreetings and groupOnlyGreetings.',
          { selector },
        );
      }
      const type = encodeURIComponent(selector.greeting_type);
      if (selector.index !== undefined) {
        const greetingRoute = `/reference/${index}/greeting/${type}/${selector.index}`;
        const data = await apiRequest('GET', greetingRoute);
        return isApiError(data) ? data : { data, routes: [route('read_reference_greeting', 'GET', greetingRoute)] };
      }
      if (selector.indices) {
        const greetingRoute = `/reference/${index}/greeting/${type}/batch`;
        const data = await apiRequest('POST', greetingRoute, { indices: selector.indices });
        return isApiError(data)
          ? data
          : { data, routes: [route('read_reference_greeting_batch', 'POST', greetingRoute)] };
      }
      const greetingRoute = `/reference/${index}/greetings/${type}`;
      const data = await apiRequest('GET', greetingRoute);
      return isApiError(data) ? data : { data, routes: [route('list_reference_greetings', 'GET', greetingRoute)] };
    }
    if (selector.family === 'risup-prompt') {
      if (selector.index !== undefined) {
        const promptRoute = `/reference/${index}/risup/prompt-item/${selector.index}`;
        const data = await apiRequest('GET', promptRoute);
        return isApiError(data)
          ? data
          : { data, routes: [route('read_reference_risup_prompt_item', 'GET', promptRoute)] };
      }
      if (selector.indices) {
        const promptRoute = `/reference/${index}/risup/prompt-items/batch`;
        const data = await apiRequest('POST', promptRoute, { indices: selector.indices });
        return isApiError(data)
          ? data
          : { data, routes: [route('read_reference_risup_prompt_item_batch', 'POST', promptRoute)] };
      }
      const promptRoute = `/reference/${index}/risup/prompt-items`;
      const data = await apiRequest('GET', promptRoute);
      return isApiError(data)
        ? data
        : { data, routes: [route('list_reference_risup_prompt_items', 'GET', promptRoute)] };
    }
    if (selector.field) {
      const fieldRoute = `/reference/${index}/${encodeURIComponent(selector.field)}`;
      const data = await apiRequest('GET', fieldRoute);
      return isApiError(data) ? data : { data, routes: [route('read_reference_field', 'GET', fieldRoute)] };
    }
  }

  return facadeApiError(
    400,
    `Unsupported read_content selector for target kind "${target.kind}"`,
    'read_content supports active/reference lorebook, regex, greeting, and risup-prompt selectors; field and surface selectors remain available for active/external targets.',
    { selector },
  );
}

async function validateFacadeSelectors(
  target: FacadeV1Target,
  selectors: FacadeV1ContentSelector[] | undefined,
): Promise<{ result: Record<string, unknown>; routes: FacadeRoute[]; touchedTargets: string[] } | ApiErrorResult> {
  if (target.kind !== 'active') {
    if (selectors?.some((selector) => selector.family === 'plugin-v3') && target.kind === 'external') {
      const scan = scanPluginV3Source(target.file_path);
      if (isApiError(scan)) return scan;
      return {
        result: {
          validations: [{ selector: selectors[0], data: scan }],
          routed_legacy: [],
          touched_targets: [`plugin-v3:${target.file_path}`],
          source_workflow: true,
        },
        routes: [],
        touchedTargets: [`plugin-v3:${target.file_path}`],
      };
    }
    if (
      target.kind === 'external' &&
      selectors?.some((selector) => selector.family === 'risup-prompt' || selector.field === 'promptTemplate')
    ) {
      const externalPrompt = await readExternalRisupPromptModel(target.file_path);
      if (isApiError(externalPrompt)) return externalPrompt;
      return {
        result: {
          validations: [
            {
              selector: selectors[0],
              data: {
                file_path: target.file_path,
                state: externalPrompt.model.state,
                count: externalPrompt.model.items.length,
                hasUnsupportedContent: externalPrompt.model.hasUnsupportedContent,
                ok: externalPrompt.model.state !== 'invalid',
              },
            },
          ],
          routed_legacy: externalPrompt.routes,
          touched_targets: [`external:${target.file_path}:risup-prompt`],
          source_workflow: true,
        },
        routes: externalPrompt.routes,
        touchedTargets: [`external:${target.file_path}:risup-prompt`],
      };
    }
    return facadeApiError(
      400,
      `Unsupported validate_content target kind "${target.kind}"`,
      'validate_content supports active-document validators plus external Plugin v3 and external .risup prompt scans. Use inspect_document/read_content for other external or reference preflight.',
      undefined,
      ['inspect_document', 'read_content'],
    );
  }

  const actualSelectors: FacadeV1ContentSelector[] =
    selectors && selectors.length > 0 ? selectors : [{ family: 'lorebook' }];
  const validations: Array<{ selector: FacadeV1ContentSelector; data: unknown }> = [];
  const routes: FacadeRoute[] = [];
  const touchedTargets: string[] = [];

  for (const selector of actualSelectors) {
    if (selector.family === 'lorebook') {
      const data = await apiRequest('GET', '/lorebook/validate');
      if (isApiError(data)) return data;
      validations.push({ selector, data });
      routes.push(route('validate_lorebook_keys', 'GET', '/lorebook/validate'));
      touchedTargets.push('lorebook');
      continue;
    }

    if (selector.family === 'risup-prompt' || selector.field === 'promptTemplate') {
      const data = await apiRequest('GET', '/risup/prompt-items');
      if (isApiError(data)) return data;
      validations.push({ selector, data });
      routes.push(route('list_risup_prompt_items', 'GET', '/risup/prompt-items'));
      touchedTargets.push('risup:promptTemplate');
      continue;
    }

    if (selector.family === 'regex') {
      const list = await apiRequest('GET', '/regex');
      if (isApiError(list)) return list;
      const listEntries = Array.isArray(asRecord(list)?.entries)
        ? (asRecord(list)?.entries as Record<string, unknown>[])
        : [];
      const indices =
        selector.index !== undefined
          ? [selector.index]
          : (selector.indices ?? listEntries.map((entry) => Number(entry.index)));
      const data = await apiRequest('POST', '/regex/batch', { indices });
      if (isApiError(data)) return data;
      validations.push({ selector, data: validateRegexEntries(data) });
      routes.push(route('list_regex', 'GET', '/regex'), route('read_regex_batch', 'POST', '/regex/batch'));
      touchedTargets.push(selector.index !== undefined || selector.indices ? selectorTarget(selector) : 'regex');
      continue;
    }

    if (selector.family === 'cbs' || (selector.field && selector.field.toLowerCase().includes('cbs'))) {
      const params = new URLSearchParams();
      if (selector.field) params.set('field', selector.field);
      if (selector.index !== undefined) params.set('lorebook_index', String(selector.index));
      const qs = params.toString();
      const data = await apiRequest('GET', `/cbs/validate${qs ? '?' + qs : ''}`);
      if (isApiError(data)) return data;
      validations.push({ selector, data });
      routes.push(route('validate_cbs', 'GET', `/cbs/validate${qs ? '?' + qs : ''}`));
      touchedTargets.push(selectorTarget(selector));
      continue;
    }

    if (selector.family === 'danbooru') {
      const tags = selectorTags(selector);
      if (tags.length === 0) {
        return facadeApiError(
          400,
          'Danbooru validation requires tags',
          'Provide selector.tags (preferred) or selector.fields as the Danbooru tags to validate.',
          { selector },
          ['validate_danbooru_tags'],
        );
      }
      ensureTagsLoaded();
      const data = await validateTags(tags, true);
      validations.push({
        selector,
        data: {
          summary: `${data.filter((result) => result.valid).length}/${tags.length} tags valid`,
          results: data,
        },
      });
      routes.push(route('validate_danbooru_tags', 'MCP', 'mcp://validate_danbooru_tags'));
      touchedTargets.push('danbooru');
      continue;
    }

    if (selector.family === 'asset' || selector.field === 'exportCompatibility') {
      const data = await apiRequest('GET', '/charx/export-compatibility');
      if (isApiError(data)) return data;
      validations.push({ selector, data });
      routes.push(route('validate_charx_export_compatibility', 'GET', '/charx/export-compatibility'));
      touchedTargets.push('charx:exportCompatibility');
      continue;
    }

    if (selector.family === 'plugin-v3') {
      return facadeApiError(
        400,
        'Plugin v3 validation is a source workflow',
        'Use target.kind="external" with the .js/.ts plugin source file, then call load_guidance for writing-plugins-v3.',
        { selector },
        ['load_guidance', 'validate_content'],
      );
    }

    if (selector.family === 'risum') {
      const fields = selector.fields ?? [
        'moduleNamespace',
        'namespace',
        'lowLevelAccess',
        'backgroundEmbedding',
        'customModuleToggle',
        'mcpUrl',
        'cjs',
      ];
      const data = await apiRequest('POST', '/field/batch', { fields });
      if (isApiError(data)) return data;
      const record = asRecord(data);
      const results = Array.isArray(record?.results) ? record.results : [];
      validations.push({
        selector,
        data: {
          fields,
          fields_result: data,
          consistency: {
            ok: true,
            warnings: results
              .map((result) => asRecord(result))
              .filter((result) => result?.ok === false || result?.error)
              .map((result) => ({ field: result?.field, error: result?.error ?? 'missing or unreadable' })),
          },
        },
      });
      routes.push(route('read_field_batch', 'POST', '/field/batch'));
      touchedTargets.push('risum');
      continue;
    }

    if (selector.field === 'formatingOrder') {
      const data = await apiRequest('GET', '/risup/formating-order');
      if (isApiError(data)) return data;
      validations.push({ selector, data });
      routes.push(route('read_risup_formating_order', 'GET', '/risup/formating-order'));
      touchedTargets.push('risup:formatingOrder');
      continue;
    }

    return facadeApiError(
      400,
      'Unsupported validate_content selector',
      'validate_content supports active lorebook, regex, CBS, Danbooru, charx export compatibility, risup-prompt, risum semantic fields, promptTemplate, and formatingOrder selectors; keep granular validators for imports, diffs, simulations, and unsupported source shapes.',
      { selector },
      ['validate_cbs', 'validate_danbooru_tags', 'read_content'],
    );
  }

  const uniqueTouchedTargets = uniqueStrings(touchedTargets);
  return {
    result: {
      validations,
      routed_legacy: routes,
      touched_targets: uniqueTouchedTargets,
      remaining_gaps: [
        'CBS simulation/diff, imports, prompt diffs, add/reorder item facade, asset management, and unsupported source shapes remain granular/advanced routes.',
      ],
    },
    routes,
    touchedTargets: uniqueTouchedTargets,
  };
}

function guardValue(guards: FacadeV1Guard[] | undefined, name: string): unknown {
  return guards?.find((guard) => guard.name === name)?.value;
}

function stringGuardValue(guards: FacadeV1Guard[] | undefined, name: string): string | undefined {
  const value = guardValue(guards, name);
  return typeof value === 'string' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function recordString(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const item = value?.[key];
  return typeof item === 'string' ? item : undefined;
}

function recordNumber(value: Record<string, unknown> | undefined, key: string): number | undefined {
  const item = value?.[key];
  return typeof item === 'number' && Number.isInteger(item) ? item : undefined;
}

function buildGuard(
  name: string,
  value: string,
  payloadPath: string,
  sourceOperations: string[],
  sourceResultPath: string,
): FacadeV1Guard {
  return { name, value, payloadPath, sourceOperations, sourceResultPath };
}

function itemByIndex(
  data: unknown,
  collectionKey: 'entries' | 'items',
  index: number,
): Record<string, unknown> | undefined {
  const collection = asRecord(data)?.[collectionKey];
  if (!Array.isArray(collection)) return undefined;
  for (const item of collection) {
    const record = asRecord(item);
    if (recordNumber(record, 'index') === index) return record;
  }
  return undefined;
}

function rewriteOperationBatchContent(
  operation: FacadeV1EditOperation,
  collectionKey: 'entries' | 'writes',
  entries: Array<Record<string, unknown>>,
): void {
  operation.content = { ...(asRecord(operation.content) ?? {}), [collectionKey]: entries };
}

function selectorTags(selector: FacadeV1ContentSelector): string[] {
  const selectorRecord = selector as FacadeV1ContentSelector & { tags?: string[] };
  if (Array.isArray(selectorRecord.tags)) return selectorRecord.tags.filter((tag) => typeof tag === 'string');
  if (Array.isArray(selector.fields)) return selector.fields.filter((tag) => typeof tag === 'string');
  return [];
}

function risupPromptItemPreview(item: PromptItemModel): string {
  if (!item.supported) return `[unsupported: ${item.type ?? 'unknown'}]`;
  if ('text' in item && typeof item.text === 'string') {
    return item.text.slice(0, 80) + (item.text.length > 80 ? '...' : '');
  }
  if ('defaultText' in item && typeof item.defaultText === 'string' && item.defaultText.length > 0) {
    return item.defaultText.slice(0, 80) + (item.defaultText.length > 80 ? '...' : '');
  }
  if ('innerFormat' in item && typeof item.innerFormat === 'string' && item.innerFormat.length > 0) {
    return `[innerFormat: ${item.innerFormat.slice(0, 60)}]`;
  }
  if (item.type === 'chat' && 'rangeStart' in item && 'rangeEnd' in item) {
    return `[range: ${item.rangeStart}-${item.rangeEnd}]`;
  }
  if (item.type === 'cache' && 'name' in item) {
    return `[cache: ${item.name}]`;
  }
  return `[${item.type ?? 'unknown'}]`;
}

function risupPromptItemSummary(item: PromptItemModel, index: number): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    index,
    id: item.id ?? null,
    type: item.type ?? null,
    supported: item.supported,
    preview: risupPromptItemPreview(item),
  };
  if (item.supported && 'name' in item && item.name !== undefined) summary.name = item.name;
  return summary;
}

function risupPromptSearchFields(item: PromptItemModel): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value: string }> = [];
  const push = (field: string, value: unknown) => {
    if (typeof value === 'string' && value.length > 0) fields.push({ field, value });
  };
  if (!item.supported) {
    push('raw', JSON.stringify(item.rawValue));
    return fields;
  }
  push('id', item.id);
  push('type', item.type);
  if ('name' in item) push('name', item.name);
  if ('text' in item) push('text', item.text);
  if ('innerFormat' in item) push('innerFormat', item.innerFormat);
  if ('defaultText' in item) push('defaultText', item.defaultText);
  return fields;
}

function findRisupPromptItemMatchedFields(item: PromptItemModel, query: string): string[] {
  const needle = query.toLowerCase();
  return risupPromptSearchFields(item)
    .filter(({ value }) => value.toLowerCase().includes(needle))
    .map(({ field }) => field);
}

async function readExternalRisupPromptModel(filePath: string): Promise<
  | {
      rawText: string;
      model: ReturnType<typeof parsePromptTemplate>;
      routes: FacadeRoute[];
    }
  | ApiErrorResult
> {
  const routePath = '/external/surface/read';
  const read = await apiRequest('POST', routePath, { file_path: filePath, path: '/promptTemplate' });
  if (isApiError(read)) return read;
  const value = asRecord(read)?.value;
  if (typeof value !== 'string') {
    return facadeApiError(
      400,
      'External risup promptTemplate is not a string',
      'Use inspect_document on the external .risup file, then repair promptTemplate before using risup-prompt selectors.',
      { file_path: filePath },
      ['inspect_document', 'read_content'],
    );
  }
  const model = parsePromptTemplate(value);
  if (model.state === 'invalid') {
    return facadeApiError(
      400,
      `Invalid external promptTemplate: ${model.parseError}`,
      'Use read_content with selector { field: "promptTemplate" } or a granular external field route to inspect and repair the raw promptTemplate.',
      { file_path: filePath, parseError: model.parseError },
      ['read_content', 'search_document'],
    );
  }
  return {
    rawText: value,
    model,
    routes: [route('external_read_surface', 'POST', routePath)],
  };
}

function resolveRisupPromptIdIndex(
  model: ReturnType<typeof parsePromptTemplate>,
  id: string,
  action: string,
): number | ApiErrorResult {
  const matches = model.items.map((item, index) => ({ item, index })).filter(({ item }) => item.id === id);
  if (matches.length === 0) {
    return facadeApiError(404, `Prompt item id not found: ${id}`, 'Refresh prompt item summaries and retry.', {
      action,
      id,
    });
  }
  if (matches.length > 1) {
    return facadeApiError(
      409,
      `Prompt item id is not unique: ${id}`,
      'Use an index selector or normalize duplicate prompt item ids before retrying.',
      { action, id, matches: matches.map((match) => match.index) },
    );
  }
  return matches[0].index;
}

function resolveRisupPromptSelectorIndices(
  model: ReturnType<typeof parsePromptTemplate>,
  selector: FacadeV1ContentSelector,
  action: string,
): number[] | ApiErrorResult {
  if (selector.id) {
    const index = resolveRisupPromptIdIndex(model, selector.id, action);
    return typeof index === 'number' ? [index] : index;
  }
  if (selector.ids) {
    const indices: number[] = [];
    for (const id of selector.ids) {
      const index = resolveRisupPromptIdIndex(model, id, action);
      if (typeof index !== 'number') return index;
      indices.push(index);
    }
    return indices;
  }
  const indices = selector.index !== undefined ? [selector.index] : selector.indices;
  if (!indices) return model.items.map((_, index) => index);
  const invalid = indices.find((index) => index < 0 || index >= model.items.length);
  if (invalid !== undefined) {
    return facadeApiError(
      400,
      `Prompt item index out of range: ${invalid}`,
      'Refresh prompt item summaries and retry.',
      {
        action,
        index: invalid,
        count: model.items.length,
      },
    );
  }
  return indices;
}

function hasExplicitPromptItemIdLocal(item: unknown): boolean {
  return !!item && typeof item === 'object' && !Array.isArray(item) && typeof asRecord(item)?.id === 'string';
}

function validateReplacementPromptItem(content: unknown, preserveId?: string): PromptItemModel | ApiErrorResult {
  const testModel = parsePromptTemplate(JSON.stringify([content]));
  if (testModel.state === 'invalid' || testModel.items.length === 0) {
    return facadeApiError(
      400,
      `Invalid risup prompt item: ${testModel.parseError ?? 'Invalid item structure.'}`,
      'Set operations[].content to one supported prompt item object.',
      { parseError: testModel.parseError },
    );
  }
  const item = testModel.items[0];
  if (!item.supported) {
    return facadeApiError(
      400,
      `Unsupported risup prompt item type: ${item.type ?? 'unknown'}`,
      'Facade risup-prompt item writes require supported item types. Use advanced raw promptTemplate routes for unsupported shapes.',
    );
  }
  if (preserveId && !hasExplicitPromptItemIdLocal(content)) item.id = preserveId;
  return item;
}

function stringArrayFromRecord(record: Record<string, unknown> | undefined, key: string): string[] | undefined {
  const value = record?.[key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : undefined;
}

function checkRisupPromptIdentity(
  operation: FacadeV1EditOperation,
  item: PromptItemModel,
  label: string,
): ApiErrorResult | undefined {
  const currentType = item.type ?? undefined;
  const currentPreview = risupPromptItemPreview(item);
  const typeConflict = guardConflict(operation.guards, 'expected_type', currentType, label);
  if (typeConflict) return typeConflict;
  const previewConflict = guardConflict(operation.guards, 'expected_preview', currentPreview, label);
  if (previewConflict) return previewConflict;
  return undefined;
}

function risupPromptSingleGuards(item: PromptItemModel): FacadeV1Guard[] {
  const guards: FacadeV1Guard[] = [];
  if (item.type !== null && item.type !== undefined) {
    guards.push(buildGuard('expected_type', item.type, '/expected_type', ['read_content'], '/item/type'));
  }
  guards.push(
    buildGuard('expected_preview', risupPromptItemPreview(item), '/expected_preview', ['read_content'], '/preview'),
  );
  return guards;
}

function risupPromptBatchGuards(items: PromptItemModel[]): FacadeV1Guard[] {
  return [
    {
      name: 'expected_types',
      value: items.map((item) => item.type ?? ''),
      payloadPath: '/expected_types/*',
      sourceOperations: ['read_content'],
      sourceResultPath: '/entries/*/type',
    },
    {
      name: 'expected_previews',
      value: items.map((item) => risupPromptItemPreview(item)),
      payloadPath: '/expected_previews/*',
      sourceOperations: ['read_content'],
      sourceResultPath: '/entries/*/preview',
    },
  ];
}

function checkRisupPromptBatchIdentity(
  item: PromptItemModel,
  position: number,
  expectedTypes: string[] | undefined,
  expectedPreviews: string[] | undefined,
  label: string,
): ApiErrorResult | undefined {
  const currentType = item.type ?? '';
  const currentPreview = risupPromptItemPreview(item);
  const expectedType = expectedTypes?.[position];
  const expectedPreview = expectedPreviews?.[position];
  if (expectedType !== undefined && expectedType !== currentType) {
    return facadeApiError(
      409,
      'Stale guard mismatch for expected_types',
      'Refresh prompt item summaries, then run preview_edit again with current expected_types values.',
      { target: label, guard: 'expected_types', expected: expectedType, actual: currentType, position },
      ['read_content', 'preview_edit'],
    );
  }
  if (expectedPreview !== undefined && expectedPreview !== currentPreview) {
    return facadeApiError(
      409,
      'Stale guard mismatch for expected_previews',
      'Refresh prompt item summaries, then run preview_edit again with current expected_previews values.',
      { target: label, guard: 'expected_previews', expected: expectedPreview, actual: currentPreview, position },
      ['read_content', 'preview_edit'],
    );
  }
  return undefined;
}

async function prepareExternalRisupPromptMutation(
  target: FacadeV1Target,
  operation: FacadeV1EditOperation,
): Promise<
  | {
      data: unknown;
      newPromptTemplate: string;
      routes: FacadeRoute[];
      touched: string[];
      requiredGuards: FacadeV1Guard[];
    }
  | ApiErrorResult
> {
  if (target.kind !== 'external') {
    return facadeApiError(
      400,
      'External risup prompt mutation requires target.kind="external"',
      'Use target.kind="external" with a .risup file path or open the file and use active risup-prompt selectors.',
      { target },
    );
  }
  const externalPrompt = await readExternalRisupPromptModel(target.file_path);
  if (isApiError(externalPrompt)) return externalPrompt;
  const indices = resolveRisupPromptSelectorIndices(
    externalPrompt.model,
    operation.selector,
    `external risup ${operation.op}`,
  );
  if (!Array.isArray(indices)) return indices;
  const currentItems = indices.map((index) => externalPrompt.model.items[index]);
  const contentRecord = asRecord(operation.content);
  const requiredGuards =
    indices.length === 1 ? risupPromptSingleGuards(currentItems[0]) : risupPromptBatchGuards(currentItems);
  const writeRoute = route('external_write_field', 'POST', '/external/field/promptTemplate');
  const touched = indices.map((index) => `external:${target.file_path}:risup-prompt:${index}`);

  if (operation.op === 'write_content') {
    const newItems = [...externalPrompt.model.items];
    if (indices.length === 1 && !operation.selector.ids && !operation.selector.indices) {
      const currentItem = currentItems[0];
      const label = selectorTarget(operation.selector);
      const conflict = checkRisupPromptIdentity(operation, currentItem, label);
      if (conflict) return conflict;
      const replacement = validateReplacementPromptItem(operation.content, currentItem.id ?? operation.selector.id);
      if (isApiError(replacement)) return replacement;
      newItems[indices[0]] = replacement;
      return {
        data: {
          dryRun: true,
          operation: 'write_content',
          file_path: target.file_path,
          index: indices[0],
          id: currentItem.id ?? null,
          currentType: currentItem.type ?? null,
          currentPreview: risupPromptItemPreview(currentItem),
          replacementType: replacement.type ?? null,
        },
        newPromptTemplate: serializePromptTemplate({ items: newItems }),
        routes: [...externalPrompt.routes, writeRoute],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    const writes = normalizeBatchEntries(operation, 'item');
    if (isApiError(writes)) return writes;
    const expectedTypes = stringArrayFromRecord(contentRecord, 'expected_types');
    const expectedPreviews = stringArrayFromRecord(contentRecord, 'expected_previews');
    const enrichedWrites: Array<Record<string, unknown>> = [];
    const previews: Array<Record<string, unknown>> = [];
    for (const [position, write] of writes.entries()) {
      const index =
        recordNumber(write, 'index') ??
        (recordString(write, 'item_id')
          ? resolveRisupPromptIdIndex(
              externalPrompt.model,
              recordString(write, 'item_id') ?? '',
              'external risup write',
            )
          : indices[position]);
      if (typeof index !== 'number') return index;
      const currentItem = externalPrompt.model.items[index];
      const conflict = checkRisupPromptBatchIdentity(
        currentItem,
        position,
        expectedTypes,
        expectedPreviews,
        `risup-prompt:${index}`,
      );
      if (conflict) return conflict;
      const replacement = validateReplacementPromptItem(write.item, recordString(write, 'item_id') ?? currentItem.id);
      if (isApiError(replacement)) return replacement;
      newItems[index] = replacement;
      enrichedWrites.push({
        ...write,
        ...(recordString(write, 'item_id') ? { item_id: recordString(write, 'item_id') } : { index }),
        item: asRecord(write.item) ?? write.item,
        expected_type: currentItem.type ?? '',
        expected_preview: risupPromptItemPreview(currentItem),
      });
      previews.push({
        index,
        id: currentItem.id ?? null,
        currentType: currentItem.type ?? null,
        currentPreview: risupPromptItemPreview(currentItem),
        replacementType: replacement.type ?? null,
      });
    }
    operation.content = {
      ...(contentRecord ?? {}),
      writes: enrichedWrites,
      expected_types: currentItems.map((item) => item.type ?? ''),
      expected_previews: currentItems.map((item) => risupPromptItemPreview(item)),
    };
    return {
      data: {
        dryRun: true,
        operation: 'write_content',
        file_path: target.file_path,
        count: previews.length,
        writes: previews,
      },
      newPromptTemplate: serializePromptTemplate({ items: newItems }),
      routes: [...externalPrompt.routes, writeRoute],
      touched,
      requiredGuards: mergeGuards(operation.guards, requiredGuards),
    };
  }

  if (operation.op === 'delete_item') {
    if (indices.length === 1 && !operation.selector.ids && !operation.selector.indices) {
      const currentItem = currentItems[0];
      const conflict = checkRisupPromptIdentity(operation, currentItem, selectorTarget(operation.selector));
      if (conflict) return conflict;
      return {
        data: {
          dryRun: true,
          operation: 'delete_item',
          file_path: target.file_path,
          index: indices[0],
          id: currentItem.id ?? null,
          currentType: currentItem.type ?? null,
          currentPreview: risupPromptItemPreview(currentItem),
        },
        newPromptTemplate: serializePromptTemplate({
          items: externalPrompt.model.items.filter((_, index) => index !== indices[0]),
        }),
        routes: [...externalPrompt.routes, writeRoute],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    const expectedTypes = stringArrayFromRecord(contentRecord, 'expected_types');
    const expectedPreviews = stringArrayFromRecord(contentRecord, 'expected_previews');
    const deletes: Array<Record<string, unknown>> = [];
    for (const [position, index] of indices.entries()) {
      const item = externalPrompt.model.items[index];
      const conflict = checkRisupPromptBatchIdentity(
        item,
        position,
        expectedTypes,
        expectedPreviews,
        `risup-prompt:${index}`,
      );
      if (conflict) return conflict;
      deletes.push({
        index,
        id: item.id ?? null,
        currentType: item.type ?? null,
        currentPreview: risupPromptItemPreview(item),
      });
    }
    const deleteSet = new Set(indices);
    operation.content = {
      ...(contentRecord ?? {}),
      expected_types: currentItems.map((item) => item.type ?? ''),
      expected_previews: currentItems.map((item) => risupPromptItemPreview(item)),
    };
    return {
      data: {
        dryRun: true,
        operation: 'delete_item',
        file_path: target.file_path,
        count: deletes.length,
        deletes,
      },
      newPromptTemplate: serializePromptTemplate({
        items: externalPrompt.model.items.filter((_, index) => !deleteSet.has(index)),
      }),
      routes: [...externalPrompt.routes, writeRoute],
      touched,
      requiredGuards: mergeGuards(operation.guards, requiredGuards),
    };
  }

  return facadeApiError(
    400,
    `Unsupported external risup prompt operation: ${operation.op}`,
    'External risup-prompt facade parity supports write_content and delete_item for id/index and id/index batches.',
    { operation },
  );
}

function normalizeBatchEntries(
  operation: FacadeV1EditOperation,
  payloadKey: 'data' | 'content' | 'item',
): Array<Record<string, unknown>> | ApiErrorResult {
  const indices = operation.selector.indices;
  const ids = operation.selector.ids;
  const targetKeys = indices ?? ids;
  if (!targetKeys || targetKeys.length === 0) {
    return facadeApiError(
      400,
      'Batch structured edits require selector.indices or selector.ids',
      'Provide selector.indices or selector.ids and align content entries to those targets.',
      { operation },
      ['read_content', 'preview_edit'],
    );
  }

  const content = operation.content;
  const contentRecord = asRecord(content);
  const rawEntries =
    (contentRecord && Array.isArray(contentRecord.entries) && contentRecord.entries) ||
    (contentRecord && Array.isArray(contentRecord.writes) && contentRecord.writes) ||
    (Array.isArray(content) && content);

  if (!rawEntries || rawEntries.length !== targetKeys.length) {
    return facadeApiError(
      400,
      'Batch structured edit content must align with selector.indices or selector.ids',
      'Use content.entries/content.writes or a content array with the same length and order as the selector targets.',
      { selector: operation.selector },
      ['read_content', 'preview_edit'],
    );
  }

  return rawEntries.map((entry, position) => {
    const record = asRecord(entry);
    const base =
      indices !== undefined
        ? { index: record ? (recordNumber(record, 'index') ?? indices[position]) : indices[position] }
        : { item_id: record ? (recordString(record, 'item_id') ?? ids?.[position]) : ids?.[position] };
    if (!record) return { ...base, [payloadKey]: entry };
    if (
      payloadKey in record ||
      'expected_comment' in record ||
      'expected_preview' in record ||
      'expected_type' in record
    ) {
      return { ...record, ...base };
    }
    return { ...base, [payloadKey]: record };
  });
}

function validateRegexEntries(data: unknown): Record<string, unknown> {
  const entries = Array.isArray(asRecord(data)?.entries) ? (asRecord(data)?.entries as unknown[]) : [];
  const results = entries.map((entry) => {
    const record = asRecord(entry);
    const index = recordNumber(record, 'index');
    const regexEntry = asRecord(record?.entry) ?? record;
    const find = recordString(regexEntry, 'find') ?? '';
    const flag = recordString(regexEntry, 'flag') ?? '';
    const regexMode = flag.length > 0 || regexEntry?.type === 'editoutput' || regexEntry?.type === 'editinput';
    if (!find) return { index, ok: false, warning: 'empty find pattern' };
    if (!regexMode) return { index, ok: true, mode: 'literal' };
    try {
      new RegExp(find, flag.replace(/[^dgimsuvy]/g, ''));
      return { index, ok: true, mode: 'regex' };
    } catch (error) {
      return { index, ok: false, error: (error as Error).message, pattern: find, flag };
    }
  });
  return {
    count: results.length,
    ok: results.every((result) => result.ok === true),
    results,
  };
}

function scanPluginV3Source(filePath: string): Record<string, unknown> | ApiErrorResult {
  if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) {
    return facadeApiError(
      400,
      'Plugin v3 validation expects a source file',
      'Pass target.kind="external" with a .js or .ts Plugin API v3 source file path.',
      { file_path: filePath },
      ['load_guidance', 'read_content'],
    );
  }
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return facadeApiError(
      404,
      'Plugin source file could not be read',
      'Check the filesystem path and permissions, then retry validate_content.',
      { file_path: filePath, error: (error as Error).message },
      ['load_guidance'],
    );
  }
  const headerMatch = source.match(/^\s*(?:\/\*\*?([\s\S]*?)\*\/|\/\/\s*(.+)(?:\r?\n\/\/\s*(.+))*)/);
  const header = headerMatch ? headerMatch[0].slice(0, 2000) : '';
  const permissionMatches = [...source.matchAll(/permissions?\s*[:=]\s*(\[[\s\S]*?\])/g)].map((match) => match[1]);
  const apiCalls = [...source.matchAll(/\brisuai\.[A-Za-z0-9_.]+/g)].map((match) => match[0]);
  const registrations = [...source.matchAll(/\b(register(?:UI|Provider|Mcp|MCP)|add(?:Button|Panel|Provider))/g)].map(
    (match) => match[0],
  );
  const unsafePatterns = [
    ['eval', /\beval\s*\(/],
    ['Function constructor', /\bnew\s+Function\s*\(/],
    ['document global', /\bdocument\./],
    ['window global', /\bwindow\./],
  ]
    .filter(([, pattern]) => (pattern as RegExp).test(source))
    .map(([name]) => name);
  return {
    source_file: filePath,
    metadata_header: {
      present: header.length > 0,
      preview: header,
      has_plugin_v3_marker: /plugin\s*(api)?\s*v?3|apiVersion\s*[:=]\s*['"]?3/i.test(header + source.slice(0, 4000)),
    },
    permissions: {
      declarations: permissionMatches,
      count: permissionMatches.length,
    },
    api_scan: {
      risuai_calls: uniqueStrings(apiCalls).slice(0, 100),
      registrations: uniqueStrings(registrations),
      unsafe_patterns: unsafePatterns,
    },
    guidance: {
      route: 'load_guidance',
      skill: 'writing-plugins-v3',
      note: '.js/.ts Plugin v3 files are source files, not .charx/.risum/.risup MCP artifacts.',
    },
  };
}

function findIndexedRecord(value: unknown, index: number, depth = 0): Record<string, unknown> | undefined {
  if (depth > 5) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findIndexedRecord(item, index, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  const recordValue = asRecord(value);
  if (!recordValue) return undefined;
  if (Number(recordValue.index) === index) return recordValue;

  for (const key of ['entry', 'item', 'entries', 'items', 'results', 'greetings', 'data']) {
    const found = findIndexedRecord(recordValue[key], index, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function mergeGuards(
  existingGuards: FacadeV1Guard[] | undefined,
  derivedGuards: Array<FacadeV1Guard | undefined>,
): FacadeV1Guard[] {
  const merged = [...(existingGuards ?? [])];
  for (const guard of derivedGuards) {
    if (!guard) continue;
    if (!merged.some((candidate) => candidate.name === guard.name && candidate.payloadPath === guard.payloadPath)) {
      merged.push(guard);
    }
  }
  return merged;
}

function guardConflict(
  guards: FacadeV1Guard[] | undefined,
  guardName: string,
  currentValue: string | undefined,
  target: string,
): ApiErrorResult | undefined {
  const expectedValue = stringGuardValue(guards, guardName);
  if (expectedValue === undefined || currentValue === undefined || expectedValue === currentValue) return undefined;
  return facadeApiError(
    409,
    `Stale guard mismatch for ${guardName}`,
    'Refresh the item list/read result, then run preview_edit again with the current guard value.',
    { target, guard: guardName, expected: expectedValue, actual: currentValue },
  );
}

function lorebookReplaceField(operation: FacadeV1EditOperation): string | undefined {
  return operation.field ?? operation.selector.field;
}

function lorebookExpectedComment(guards: FacadeV1Guard[] | undefined): string | undefined {
  return stringGuardValue(guards, 'expected_comment');
}

function replacementString(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function greetingPreview(content: string): string {
  return content.slice(0, 100) + (content.length > 100 ? '…' : '');
}

async function previewFacadeOperation(
  target: FacadeV1Target,
  operation: FacadeV1EditOperation,
): Promise<
  { data: unknown; routes: FacadeRoute[]; touched: string[]; requiredGuards: FacadeV1Guard[] } | ApiErrorResult
> {
  if (target.kind !== 'active' && target.kind !== 'external') {
    return facadeApiError(
      400,
      'preview_edit supports active-document edits and second-wave external field edits',
      'Use active or external targets, or granular tools for unsupported target kinds.',
    );
  }

  const touched = [selectorTarget(operation.selector)];
  if (
    operation.selector.family === 'greeting' &&
    operation.selector.greeting_type === 'group' &&
    (operation.op === 'write_content' || operation.op === 'delete_item')
  ) {
    return facadeApiError(
      400,
      'groupOnlyGreetings is read-only',
      'groupOnlyGreetings is deprecated and kept only for compatibility reads. Use alternate greetings or supported current fields instead.',
      { selector: operation.selector },
    );
  }
  if (
    target.kind === 'external' &&
    operation.selector.family === 'risup-prompt' &&
    (operation.op === 'write_content' || operation.op === 'delete_item')
  ) {
    const prepared = await prepareExternalRisupPromptMutation(target, operation);
    if (isApiError(prepared)) return prepared;
    return {
      data: {
        ...(asRecord(prepared.data) ?? {}),
        newSize: prepared.newPromptTemplate.length,
      },
      routes: prepared.routes,
      touched: prepared.touched,
      requiredGuards: prepared.requiredGuards,
    };
  }
  if (
    target.kind === 'active' &&
    operation.op === 'replace_text' &&
    operation.selector.family === 'lorebook' &&
    operation.selector.index !== undefined
  ) {
    if (!operation.find) {
      return facadeApiError(400, 'replace_text requires find', 'Provide operations[].find.');
    }
    const lorebookRoute = `/lorebook/${operation.selector.index}/replace`;
    const data = await apiRequest('POST', lorebookRoute, {
      find: operation.find,
      replace: typeof operation.replace === 'string' ? operation.replace : '',
      regex: operation.regex,
      flags: operation.flags,
      field: lorebookReplaceField(operation),
      expected_comment: lorebookExpectedComment(operation.guards),
      dry_run: true,
    });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [route('replace_in_lorebook', 'POST', lorebookRoute)],
          touched,
          requiredGuards: operation.guards ?? [],
        };
  }

  if (
    operation.op === 'replace_text' &&
    operation.selector.family === 'lorebook' &&
    operation.selector.index !== undefined
  ) {
    return facadeApiError(
      400,
      'preview_edit lorebook replacement supports active targets only',
      'Use target.kind="active" for lorebook replace_text, or open the external/reference document first.',
      { operation },
    );
  }

  if (
    target.kind === 'active' &&
    operation.op === 'replace_text' &&
    operation.selector.family === 'lorebook' &&
    operation.selector.id
  ) {
    const readRoute = `/lorebook/by-id/${encodeURIComponent(operation.selector.id)}`;
    const read = await apiRequest('GET', readRoute);
    if (isApiError(read)) return read;
    const index = recordNumber(asRecord(read), 'index');
    if (index === undefined)
      return facadeApiError(
        404,
        'Lorebook id did not resolve to an index',
        'Run read_content/list_lorebook again and retry preview_edit.',
      );
    operation.selector.index = index;
    const lorebookRoute = `/lorebook/${index}/replace`;
    const data = await apiRequest('POST', lorebookRoute, {
      find: operation.find,
      replace: typeof operation.replace === 'string' ? operation.replace : '',
      regex: operation.regex,
      flags: operation.flags,
      field: lorebookReplaceField(operation),
      expected_comment: lorebookExpectedComment(operation.guards),
      dry_run: true,
    });
    return isApiError(data)
      ? data
      : {
          data: { ...(asRecord(data) ?? {}), resolved_id: operation.selector.id, resolved_index: index },
          routes: [route('read_lorebook_by_id', 'GET', readRoute), route('replace_in_lorebook', 'POST', lorebookRoute)],
          touched,
          requiredGuards: operation.guards ?? [],
        };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'lorebook' &&
    operation.selector.id
  ) {
    const readRoute = `/lorebook/by-id/${encodeURIComponent(operation.selector.id)}`;
    const read = await apiRequest('GET', readRoute);
    if (isApiError(read)) return read;
    const index = recordNumber(asRecord(read), 'index');
    const entry = asRecord(asRecord(read)?.entry);
    if (index === undefined)
      return facadeApiError(
        404,
        'Lorebook id did not resolve to an index',
        'Run read_content/list_lorebook again and retry preview_edit.',
      );
    const currentComment = recordString(entry, 'comment');
    const conflict = guardConflict(
      operation.guards,
      'expected_comment',
      currentComment,
      `lorebook:${operation.selector.id}`,
    );
    if (conflict) return conflict;
    operation.selector.index = index;
    const content = asRecord(operation.content);
    if (!content) {
      return facadeApiError(
        400,
        'lorebook write_content requires an object',
        'Set operations[].content to the partial lorebook entry data.',
        { operation },
      );
    }
    return {
      data: {
        dryRun: true,
        resolved_id: operation.selector.id,
        resolved_index: index,
        currentComment,
        updatedKeys: Object.keys(content),
      },
      routes: [route('read_lorebook_by_id', 'GET', readRoute), route('write_lorebook_by_id', 'POST', readRoute)],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentComment === undefined
          ? undefined
          : buildGuard(
              'expected_comment',
              currentComment,
              '/expected_comment',
              ['read_lorebook_by_id'],
              '/entry/comment',
            ),
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'lorebook' &&
    operation.selector.id
  ) {
    const readRoute = `/lorebook/by-id/${encodeURIComponent(operation.selector.id)}`;
    const read = await apiRequest('GET', readRoute);
    if (isApiError(read)) return read;
    const index = recordNumber(asRecord(read), 'index');
    const entry = asRecord(asRecord(read)?.entry);
    if (index === undefined)
      return facadeApiError(
        404,
        'Lorebook id did not resolve to an index',
        'Run read_content/list_lorebook again and retry preview_edit.',
      );
    const currentComment = recordString(entry, 'comment');
    const conflict = guardConflict(
      operation.guards,
      'expected_comment',
      currentComment,
      `lorebook:${operation.selector.id}`,
    );
    if (conflict) return conflict;
    operation.selector.index = index;
    return {
      data: {
        dryRun: true,
        operation: 'delete_item',
        resolved_id: operation.selector.id,
        resolved_index: index,
        currentComment,
      },
      routes: [
        route('read_lorebook_by_id', 'GET', readRoute),
        route('delete_lorebook_by_id', 'POST', `${readRoute}/delete`),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentComment === undefined
          ? undefined
          : buildGuard(
              'expected_comment',
              currentComment,
              '/expected_comment',
              ['read_lorebook_by_id'],
              '/entry/comment',
            ),
      ]),
    };
  }

  if (operation.selector.family === 'lorebook') {
    return facadeApiError(
      400,
      'Unsupported preview lorebook operation',
      'preview_edit supports active lorebook replace_text only when selector.index is provided; write_content and broad lorebook edits remain unsupported.',
      { operation },
    );
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'regex' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    const entries = normalizeBatchEntries(operation, 'data');
    if (isApiError(entries)) return entries;
    const read = await apiRequest('POST', '/regex/batch', { indices: operation.selector.indices });
    if (isApiError(read)) return read;
    const requiredGuards: FacadeV1Guard[] = [];
    const enrichedEntries: Array<Record<string, unknown>> = [];
    const previews: Array<Record<string, unknown>> = [];
    for (const [position, entry] of entries.entries()) {
      const idx = recordNumber(entry, 'index');
      const data = asRecord(entry.data);
      if (idx === undefined || !data) {
        return facadeApiError(
          400,
          'Invalid regex batch write entry',
          'Each regex batch entry must provide an index and data object.',
          { entry, position },
          ['read_regex_batch', 'preview_edit'],
        );
      }
      const currentRecord = itemByIndex(read, 'entries', idx);
      const currentComment = recordString(asRecord(currentRecord?.entry) ?? currentRecord, 'comment');
      const expectedComment = recordString(entry, 'expected_comment');
      if (expectedComment !== undefined && currentComment !== undefined && expectedComment !== currentComment) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_comment',
          'Re-list/read regex entries, then run preview_edit again with current expected_comment values.',
          { target: `regex:${idx}`, guard: 'expected_comment', expected: expectedComment, actual: currentComment },
          ['list_regex', 'read_regex_batch', 'preview_edit'],
        );
      }
      enrichedEntries.push({ ...entry, data, expected_comment: currentComment });
      previews.push({ index: idx, currentComment, updatedKeys: Object.keys(data) });
      if (currentComment !== undefined) {
        requiredGuards.push(
          buildGuard(
            'expected_comment',
            currentComment,
            `/entries/${position}/expected_comment`,
            ['read_regex_batch'],
            `/entries/${position}/entry/comment`,
          ),
        );
      }
    }
    rewriteOperationBatchContent(operation, 'entries', enrichedEntries);
    return {
      data: { dryRun: true, operation: 'write_content', count: enrichedEntries.length, entries: previews },
      routes: [
        route('read_regex_batch', 'POST', '/regex/batch'),
        route('write_regex_batch', 'POST', '/regex/batch-write'),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, requiredGuards),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'regex' &&
    operation.selector.identity
  ) {
    const data = asRecord(operation.content);
    if (!data)
      return facadeApiError(
        400,
        'regex write_content requires an object',
        'Set operations[].content to partial regex entry data.',
        { operation },
      );
    const read = await apiRequest('POST', '/regex/by-identity/read', { identity: operation.selector.identity });
    if (isApiError(read)) return read;
    const readRecord = asRecord(read);
    const index = recordNumber(readRecord, 'index');
    const entry = asRecord(readRecord?.entry);
    const currentComment = recordString(entry, 'comment');
    const conflict = guardConflict(operation.guards, 'expected_comment', currentComment, 'regex:identity');
    if (conflict) return conflict;
    return {
      data: {
        dryRun: true,
        resolved_identity: operation.selector.identity,
        resolved_index: index,
        currentComment,
        updatedKeys: Object.keys(data),
      },
      routes: [
        route('read_regex_by_identity', 'POST', '/regex/by-identity/read'),
        route('write_regex_by_identity', 'POST', '/regex/by-identity/write'),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentComment === undefined
          ? undefined
          : buildGuard(
              'expected_comment',
              currentComment,
              '/expected_comment',
              ['read_regex_by_identity'],
              '/entry/comment',
            ),
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'regex' &&
    operation.selector.index !== undefined
  ) {
    const regexRoute = `/regex/${operation.selector.index}`;
    const read = await apiRequest('GET', regexRoute);
    if (isApiError(read)) return read;
    const indexedRecord = findIndexedRecord(read, operation.selector.index);
    const currentComment = recordString(asRecord(indexedRecord?.entry) ?? indexedRecord, 'comment');
    const conflict = guardConflict(
      operation.guards,
      'expected_comment',
      currentComment,
      `regex:${operation.selector.index}`,
    );
    if (conflict) return conflict;
    return {
      data: {
        dryRun: true,
        index: operation.selector.index,
        currentComment,
        updatedKeys: Object.keys(asRecord(operation.content) ?? {}),
      },
      routes: [route('read_regex', 'GET', regexRoute), route('write_regex', 'POST', regexRoute)],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentComment === undefined
          ? undefined
          : {
              name: 'expected_comment',
              value: currentComment,
              payloadPath: '/expected_comment',
              sourceOperations: ['read_regex'],
              sourceResultPath: '/entry/comment',
            },
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'greeting' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting batch write selector',
        'preview_edit greeting batch writes require greeting_type="alternate" or "group".',
        { operation },
        ['list_greetings', 'read_greeting_batch', 'preview_edit'],
      );
    }
    const writes = normalizeBatchEntries(operation, 'content');
    if (isApiError(writes)) return writes;
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const readRoute = `/greeting/${greetingType}/batch`;
    const read = await apiRequest('POST', readRoute, { indices: operation.selector.indices });
    if (isApiError(read)) return read;
    const requiredGuards: FacadeV1Guard[] = [];
    const enrichedWrites: Array<Record<string, unknown>> = [];
    const previews: Array<Record<string, unknown>> = [];
    for (const [position, write] of writes.entries()) {
      const idx = recordNumber(write, 'index');
      const currentContent = idx === undefined ? undefined : recordString(itemByIndex(read, 'items', idx), 'content');
      const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
      const expectedPreview = recordString(write, 'expected_preview');
      if (idx === undefined) {
        return facadeApiError(
          400,
          'Invalid greeting batch write entry',
          'Each greeting batch write entry must align to an index.',
          { write, position },
          ['read_greeting_batch', 'preview_edit'],
        );
      }
      if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_preview',
          'Re-list/read greetings, then run preview_edit again with current expected_preview values.',
          {
            target: `greeting:${operation.selector.greeting_type}:${idx}`,
            guard: 'expected_preview',
            expected: expectedPreview,
            actual: currentPreview,
          },
          ['list_greetings', 'read_greeting_batch', 'preview_edit'],
        );
      }
      const newContent = replacementString(write.content);
      enrichedWrites.push({ ...write, content: newContent, expected_preview: currentPreview });
      previews.push({ index: idx, oldSize: currentContent?.length ?? 0, newSize: newContent.length });
      if (currentPreview !== undefined) {
        requiredGuards.push(
          buildGuard(
            'expected_preview',
            currentPreview,
            `/writes/${position}/expected_preview`,
            ['read_greeting_batch'],
            `/items/${position}/content`,
          ),
        );
      }
    }
    rewriteOperationBatchContent(operation, 'writes', enrichedWrites);
    return {
      data: {
        dryRun: true,
        operation: 'write_content',
        type: operation.selector.greeting_type,
        count: enrichedWrites.length,
        writes: previews,
      },
      routes: [
        route('read_greeting_batch', 'POST', readRoute),
        route('batch_write_greeting', 'POST', `/greeting/${greetingType}/batch-write`),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, requiredGuards),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'greeting' &&
    operation.selector.identity
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting identity write selector',
        'preview_edit greeting identity writes require greeting_type="alternate" or "group".',
        { operation },
      );
    }
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const readRoute = `/greeting/${greetingType}/by-hash/read`;
    const read = await apiRequest('POST', readRoute, { identity: operation.selector.identity });
    if (isApiError(read)) return read;
    const currentContent = recordString(asRecord(read), 'content');
    const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
    const conflict = guardConflict(
      operation.guards,
      'expected_preview',
      currentPreview,
      `greeting:${operation.selector.greeting_type}:identity`,
    );
    if (conflict) return conflict;
    const newContent = replacementString(operation.content);
    return {
      data: {
        dryRun: true,
        resolved_identity: operation.selector.identity,
        resolved_index: recordNumber(asRecord(read), 'index'),
        oldSize: currentContent?.length ?? 0,
        newSize: newContent.length,
      },
      routes: [
        route('read_greeting_by_hash', 'POST', readRoute),
        route('write_greeting_by_hash', 'POST', `/greeting/${greetingType}/by-hash/write`),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentPreview === undefined
          ? undefined
          : buildGuard('expected_preview', currentPreview, '/expected_preview', ['read_greeting_by_hash'], '/preview'),
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'greeting' &&
    operation.selector.index !== undefined
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting write selector',
        'preview_edit greeting writes require greeting_type="alternate" or "group".',
        { operation },
      );
    }
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const greetingRoute = `/greeting/${greetingType}/${operation.selector.index}`;
    const read = await apiRequest('GET', greetingRoute);
    if (isApiError(read)) return read;
    const currentContent =
      typeof (read as Record<string, unknown>).content === 'string'
        ? ((read as Record<string, unknown>).content as string)
        : undefined;
    const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
    const conflict = guardConflict(
      operation.guards,
      'expected_preview',
      currentPreview,
      `greeting:${operation.selector.greeting_type}:${operation.selector.index}`,
    );
    if (conflict) return conflict;
    const newContent = replacementString(operation.content);
    return {
      data: {
        dryRun: true,
        type: operation.selector.greeting_type,
        index: operation.selector.index,
        oldSize: currentContent?.length ?? 0,
        newSize: newContent.length,
      },
      routes: [route('read_greeting', 'GET', greetingRoute), route('write_greeting', 'POST', greetingRoute)],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentPreview === undefined
          ? undefined
          : {
              name: 'expected_preview',
              value: currentPreview,
              payloadPath: '/expected_preview',
              sourceOperations: ['read_greeting'],
              sourceResultPath: '/content',
            },
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.ids &&
    operation.selector.ids.length > 0
  ) {
    const writes = normalizeBatchEntries(operation, 'item');
    if (isApiError(writes)) return writes;
    const requiredGuards: FacadeV1Guard[] = [];
    const enrichedWrites: Array<Record<string, unknown>> = [];
    const previews: Array<Record<string, unknown>> = [];
    for (const [position, write] of writes.entries()) {
      const id = recordString(write, 'item_id') ?? operation.selector.ids[position];
      const item = asRecord(write.item);
      if (!id || !item) {
        return facadeApiError(
          400,
          'Invalid risup prompt id batch write entry',
          'Each write must provide item_id and item object.',
          { write, position },
          ['list_risup_prompt_items', 'preview_edit'],
        );
      }
      const readRoute = `/risup/prompt-item-by-id/${encodeURIComponent(id)}`;
      const read = await apiRequest('GET', readRoute);
      if (isApiError(read)) return read;
      const readRecord = asRecord(read);
      const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
      const currentPreview = recordString(readRecord, 'preview');
      const expectedType = recordString(write, 'expected_type');
      const expectedPreview = recordString(write, 'expected_preview');
      if (expectedType !== undefined && currentType !== undefined && expectedType !== currentType) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_type',
          'Re-list/read risup prompt items, then run preview_edit again with current expected_type values.',
          { target: `risup-prompt:${id}`, guard: 'expected_type', expected: expectedType, actual: currentType },
          ['list_risup_prompt_items', 'preview_edit'],
        );
      }
      if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_preview',
          'Re-list/read risup prompt items, then run preview_edit again with current expected_preview values.',
          {
            target: `risup-prompt:${id}`,
            guard: 'expected_preview',
            expected: expectedPreview,
            actual: currentPreview,
          },
          ['list_risup_prompt_items', 'preview_edit'],
        );
      }
      enrichedWrites.push({
        ...write,
        item_id: id,
        item,
        expected_type: currentType,
        expected_preview: currentPreview,
      });
      previews.push({
        id,
        resolved_index: recordNumber(readRecord, 'index'),
        currentType,
        currentPreview,
        replacementType: recordString(item, 'type'),
      });
      if (currentType !== undefined)
        requiredGuards.push(
          buildGuard(
            'expected_type',
            currentType,
            `/writes/${position}/expected_type`,
            ['read_risup_prompt_item_by_id'],
            '/type',
          ),
        );
      if (currentPreview !== undefined)
        requiredGuards.push(
          buildGuard(
            'expected_preview',
            currentPreview,
            `/writes/${position}/expected_preview`,
            ['read_risup_prompt_item_by_id'],
            '/preview',
          ),
        );
    }
    rewriteOperationBatchContent(operation, 'writes', enrichedWrites);
    return {
      data: { dryRun: true, operation: 'write_content', count: enrichedWrites.length, writes: previews },
      routes: [route('write_risup_prompt_item_by_id_batch', 'POST', '/risup/prompt-item/batch-write-by-id')],
      touched,
      requiredGuards: mergeGuards(operation.guards, requiredGuards),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.id
  ) {
    const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(operation.selector.id)}`;
    const read = await apiRequest('GET', promptRoute);
    if (isApiError(read)) return read;
    const readRecord = asRecord(read);
    const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
    const currentPreview = recordString(readRecord, 'preview');
    const typeConflict = guardConflict(
      operation.guards,
      'expected_type',
      currentType,
      `risup-prompt:${operation.selector.id}`,
    );
    if (typeConflict) return typeConflict;
    const previewConflict = guardConflict(
      operation.guards,
      'expected_preview',
      currentPreview,
      `risup-prompt:${operation.selector.id}`,
    );
    if (previewConflict) return previewConflict;
    const item = asRecord(operation.content);
    if (!item) {
      return facadeApiError(
        400,
        'risup-prompt write_content requires an item object',
        'Set operations[].content to the replacement prompt item object.',
        { operation },
      );
    }
    return {
      data: {
        dryRun: true,
        resolved_id: operation.selector.id,
        resolved_index: recordNumber(readRecord, 'index'),
        currentType,
        currentPreview,
        replacementType: recordString(item, 'type'),
      },
      routes: [
        route('read_risup_prompt_item_by_id', 'GET', promptRoute),
        route('write_risup_prompt_item_by_id', 'POST', promptRoute),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentType === undefined
          ? undefined
          : buildGuard('expected_type', currentType, '/expected_type', ['read_risup_prompt_item_by_id'], '/type'),
        currentPreview === undefined
          ? undefined
          : buildGuard(
              'expected_preview',
              currentPreview,
              '/expected_preview',
              ['read_risup_prompt_item_by_id'],
              '/preview',
            ),
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    const writes = normalizeBatchEntries(operation, 'item');
    if (isApiError(writes)) return writes;
    const list = await apiRequest('GET', '/risup/prompt-items');
    if (isApiError(list)) return list;
    const requiredGuards: FacadeV1Guard[] = [];
    const enrichedWrites: Array<Record<string, unknown>> = [];
    const previews: Array<Record<string, unknown>> = [];
    for (const [position, write] of writes.entries()) {
      const idx = recordNumber(write, 'index');
      const item = asRecord(write.item);
      if (idx === undefined || !item) {
        return facadeApiError(
          400,
          'Invalid risup prompt batch write entry',
          'Each risup prompt batch write entry must provide an index and item object.',
          { write, position },
          ['list_risup_prompt_items', 'read_risup_prompt_item_batch', 'preview_edit'],
        );
      }
      const currentRecord = itemByIndex(list, 'items', idx);
      const currentType = recordString(currentRecord, 'type');
      const currentPreview = recordString(currentRecord, 'preview');
      const expectedType = recordString(write, 'expected_type');
      const expectedPreview = recordString(write, 'expected_preview');
      if (expectedType !== undefined && currentType !== undefined && expectedType !== currentType) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_type',
          'Re-list/read risup prompt items, then run preview_edit again with current expected_type values.',
          { target: `risup-prompt:${idx}`, guard: 'expected_type', expected: expectedType, actual: currentType },
          ['list_risup_prompt_items', 'read_risup_prompt_item_batch', 'preview_edit'],
        );
      }
      if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_preview',
          'Re-list/read risup prompt items, then run preview_edit again with current expected_preview values.',
          {
            target: `risup-prompt:${idx}`,
            guard: 'expected_preview',
            expected: expectedPreview,
            actual: currentPreview,
          },
          ['list_risup_prompt_items', 'read_risup_prompt_item_batch', 'preview_edit'],
        );
      }
      enrichedWrites.push({ ...write, item, expected_type: currentType, expected_preview: currentPreview });
      previews.push({ index: idx, currentType, currentPreview, replacementType: recordString(item, 'type') });
      if (currentType !== undefined)
        requiredGuards.push(
          buildGuard(
            'expected_type',
            currentType,
            `/writes/${position}/expected_type`,
            ['list_risup_prompt_items'],
            `/items/${position}/type`,
          ),
        );
      if (currentPreview !== undefined)
        requiredGuards.push(
          buildGuard(
            'expected_preview',
            currentPreview,
            `/writes/${position}/expected_preview`,
            ['list_risup_prompt_items'],
            `/items/${position}/preview`,
          ),
        );
    }
    rewriteOperationBatchContent(operation, 'writes', enrichedWrites);
    return {
      data: { dryRun: true, operation: 'write_content', count: enrichedWrites.length, writes: previews },
      routes: [
        route('list_risup_prompt_items', 'GET', '/risup/prompt-items'),
        route('write_risup_prompt_item_batch', 'POST', '/risup/prompt-item/batch-write'),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, requiredGuards),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.index !== undefined
  ) {
    const promptRoute = `/risup/prompt-item/${operation.selector.index}`;
    const read = await apiRequest('GET', promptRoute);
    if (isApiError(read)) return read;
    const readRecord = asRecord(read);
    const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
    const currentPreview = recordString(readRecord, 'preview');
    const typeConflict = guardConflict(
      operation.guards,
      'expected_type',
      currentType,
      `risup-prompt:${operation.selector.index}`,
    );
    if (typeConflict) return typeConflict;
    const previewConflict = guardConflict(
      operation.guards,
      'expected_preview',
      currentPreview,
      `risup-prompt:${operation.selector.index}`,
    );
    if (previewConflict) return previewConflict;
    const item = asRecord(operation.content);
    if (!item) {
      return facadeApiError(
        400,
        'risup-prompt write_content requires an item object',
        'Set operations[].content to the replacement prompt item object.',
        { operation },
      );
    }
    return {
      data: {
        dryRun: true,
        index: operation.selector.index,
        currentType,
        currentPreview,
        replacementType: recordString(item, 'type'),
      },
      routes: [
        route('read_risup_prompt_item', 'GET', promptRoute),
        route('write_risup_prompt_item', 'POST', promptRoute),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentType === undefined
          ? undefined
          : {
              name: 'expected_type',
              value: currentType,
              payloadPath: '/expected_type',
              sourceOperations: ['read_risup_prompt_item'],
              sourceResultPath: '/type',
            },
        currentPreview === undefined
          ? undefined
          : {
              name: 'expected_preview',
              value: currentPreview,
              payloadPath: '/expected_preview',
              sourceOperations: ['read_risup_prompt_item'],
              sourceResultPath: '/preview',
            },
      ]),
    };
  }

  if (
    operation.op === 'write_content' &&
    ['regex', 'greeting', 'risup-prompt'].includes(operation.selector.family ?? '')
  ) {
    return facadeApiError(
      400,
      'Indexed structured writes require an active target and selector.index',
      'Open the document, select target.kind="active", and provide selector.index plus any stale guard values.',
      { operation },
    );
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'regex' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    return facadeApiError(
      400,
      'Unsupported batch regex delete',
      'Regex batch delete has no promoted facade route yet; use delete_regex per item with current expected_comment guards.',
      { operation },
      ['list_regex', 'read_regex_batch', 'delete_regex'],
    );
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'regex' &&
    operation.selector.identity
  ) {
    const read = await apiRequest('POST', '/regex/by-identity/read', { identity: operation.selector.identity });
    if (isApiError(read)) return read;
    const readRecord = asRecord(read);
    const currentComment = recordString(asRecord(readRecord?.entry), 'comment');
    const conflict = guardConflict(operation.guards, 'expected_comment', currentComment, 'regex:identity');
    if (conflict) return conflict;
    return {
      data: {
        dryRun: true,
        operation: 'delete_item',
        resolved_identity: operation.selector.identity,
        resolved_index: recordNumber(readRecord, 'index'),
        currentComment,
      },
      routes: [
        route('read_regex_by_identity', 'POST', '/regex/by-identity/read'),
        route('delete_regex_by_identity', 'POST', '/regex/by-identity/delete'),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentComment === undefined
          ? undefined
          : buildGuard(
              'expected_comment',
              currentComment,
              '/expected_comment',
              ['read_regex_by_identity'],
              '/entry/comment',
            ),
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'regex' &&
    operation.selector.index !== undefined
  ) {
    const regexRoute = `/regex/${operation.selector.index}`;
    const read = await apiRequest('GET', regexRoute);
    if (isApiError(read)) return read;
    const indexedRecord = findIndexedRecord(read, operation.selector.index);
    const currentComment = recordString(asRecord(indexedRecord?.entry) ?? indexedRecord, 'comment');
    const conflict = guardConflict(
      operation.guards,
      'expected_comment',
      currentComment,
      `regex:${operation.selector.index}`,
    );
    if (conflict) return conflict;
    return {
      data: {
        dryRun: true,
        operation: 'delete_item',
        index: operation.selector.index,
        currentComment,
      },
      routes: [
        route('read_regex', 'GET', regexRoute),
        route('delete_regex', 'POST', `/regex/${operation.selector.index}/delete`),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentComment === undefined
          ? undefined
          : {
              name: 'expected_comment',
              value: currentComment,
              payloadPath: '/expected_comment',
              sourceOperations: ['read_regex'],
              sourceResultPath: '/entry/comment',
            },
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'greeting' &&
    operation.selector.identity
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting identity delete selector',
        'preview_edit greeting identity deletes require greeting_type="alternate" or "group".',
        { operation },
      );
    }
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const readRoute = `/greeting/${greetingType}/by-hash/read`;
    const read = await apiRequest('POST', readRoute, { identity: operation.selector.identity });
    if (isApiError(read)) return read;
    const currentContent = recordString(asRecord(read), 'content');
    const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
    const conflict = guardConflict(
      operation.guards,
      'expected_preview',
      currentPreview,
      `greeting:${operation.selector.greeting_type}:identity`,
    );
    if (conflict) return conflict;
    return {
      data: {
        dryRun: true,
        operation: 'delete_item',
        resolved_identity: operation.selector.identity,
        resolved_index: recordNumber(asRecord(read), 'index'),
        currentPreview,
      },
      routes: [
        route('read_greeting_by_hash', 'POST', readRoute),
        route('delete_greeting_by_hash', 'POST', `/greeting/${greetingType}/by-hash/delete`),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentPreview === undefined
          ? undefined
          : buildGuard('expected_preview', currentPreview, '/expected_preview', ['read_greeting_by_hash'], '/preview'),
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'greeting' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting batch delete selector',
        'preview_edit greeting batch deletes require greeting_type="alternate" or "group".',
        { operation },
        ['list_greetings', 'read_greeting_batch', 'preview_edit'],
      );
    }
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const readRoute = `/greeting/${greetingType}/batch`;
    const read = await apiRequest('POST', readRoute, { indices: operation.selector.indices });
    if (isApiError(read)) return read;
    const contentRecord = asRecord(operation.content);
    const expectedPreviews = Array.isArray(contentRecord?.expected_previews)
      ? contentRecord.expected_previews
      : undefined;
    const requiredGuards: FacadeV1Guard[] = [];
    const enrichedExpectedPreviews: string[] = [];
    const previews: Array<Record<string, unknown>> = [];
    for (const [position, idx] of operation.selector.indices.entries()) {
      const currentContent = recordString(itemByIndex(read, 'items', idx), 'content');
      const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
      const expectedPreview =
        expectedPreviews && typeof expectedPreviews[position] === 'string' ? expectedPreviews[position] : undefined;
      if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_preview',
          'Re-list/read greetings, then run preview_edit again with current expected_preview values.',
          {
            target: `greeting:${operation.selector.greeting_type}:${idx}`,
            guard: 'expected_preview',
            expected: expectedPreview,
            actual: currentPreview,
          },
          ['list_greetings', 'read_greeting_batch', 'preview_edit'],
        );
      }
      enrichedExpectedPreviews.push(currentPreview ?? '');
      previews.push({ index: idx, preview: currentPreview, oldSize: currentContent?.length ?? 0 });
      if (currentPreview !== undefined)
        requiredGuards.push(
          buildGuard(
            'expected_previews',
            currentPreview,
            `/expected_previews/${position}`,
            ['read_greeting_batch'],
            `/items/${position}/content`,
          ),
        );
    }
    operation.content = { ...(contentRecord ?? {}), expected_previews: enrichedExpectedPreviews };
    return {
      data: {
        dryRun: true,
        operation: 'delete_item',
        type: operation.selector.greeting_type,
        count: operation.selector.indices.length,
        deletes: previews,
      },
      routes: [
        route('read_greeting_batch', 'POST', readRoute),
        route('batch_delete_greeting', 'POST', `/greeting/${greetingType}/batch-delete`),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, requiredGuards),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'greeting' &&
    operation.selector.index !== undefined
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting delete selector',
        'preview_edit greeting deletes require greeting_type="alternate" or "group".',
        { operation },
      );
    }
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const greetingRoute = `/greeting/${greetingType}/${operation.selector.index}`;
    const read = await apiRequest('GET', greetingRoute);
    if (isApiError(read)) return read;
    const currentContent =
      typeof (read as Record<string, unknown>).content === 'string'
        ? ((read as Record<string, unknown>).content as string)
        : undefined;
    const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
    const conflict = guardConflict(
      operation.guards,
      'expected_preview',
      currentPreview,
      `greeting:${operation.selector.greeting_type}:${operation.selector.index}`,
    );
    if (conflict) return conflict;
    return {
      data: {
        dryRun: true,
        operation: 'delete_item',
        type: operation.selector.greeting_type,
        index: operation.selector.index,
        oldSize: currentContent?.length ?? 0,
      },
      routes: [
        route('read_greeting', 'GET', greetingRoute),
        route('delete_greeting', 'POST', `/greeting/${greetingType}/${operation.selector.index}/delete`),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentPreview === undefined
          ? undefined
          : {
              name: 'expected_preview',
              value: currentPreview,
              payloadPath: '/expected_preview',
              sourceOperations: ['read_greeting'],
              sourceResultPath: '/content',
            },
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.ids &&
    operation.selector.ids.length > 0
  ) {
    const contentRecord = asRecord(operation.content);
    const expectedTypes = Array.isArray(contentRecord?.expected_types) ? contentRecord.expected_types : undefined;
    const expectedPreviews = Array.isArray(contentRecord?.expected_previews)
      ? contentRecord.expected_previews
      : undefined;
    const enrichedExpectedTypes: string[] = [];
    const enrichedExpectedPreviews: string[] = [];
    const requiredGuards: FacadeV1Guard[] = [];
    const previews: Array<Record<string, unknown>> = [];
    for (const [position, id] of operation.selector.ids.entries()) {
      const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(id)}`;
      const read = await apiRequest('GET', promptRoute);
      if (isApiError(read)) return read;
      const readRecord = asRecord(read);
      const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
      const currentPreview = recordString(readRecord, 'preview');
      const expectedType = typeof expectedTypes?.[position] === 'string' ? expectedTypes[position] : undefined;
      const expectedPreview = typeof expectedPreviews?.[position] === 'string' ? expectedPreviews[position] : undefined;
      if (expectedType !== undefined && currentType !== undefined && expectedType !== currentType) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_type',
          'Re-list/read risup prompt items, then run preview_edit again with current expected_type values.',
          { target: `risup-prompt:${id}`, guard: 'expected_type', expected: expectedType, actual: currentType },
          ['list_risup_prompt_items', 'preview_edit'],
        );
      }
      if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_preview',
          'Re-list/read risup prompt items, then run preview_edit again with current expected_preview values.',
          {
            target: `risup-prompt:${id}`,
            guard: 'expected_preview',
            expected: expectedPreview,
            actual: currentPreview,
          },
          ['list_risup_prompt_items', 'preview_edit'],
        );
      }
      enrichedExpectedTypes.push(currentType ?? '');
      enrichedExpectedPreviews.push(currentPreview ?? '');
      previews.push({ id, resolved_index: recordNumber(readRecord, 'index'), currentType, currentPreview });
      if (currentType !== undefined)
        requiredGuards.push(
          buildGuard(
            'expected_types',
            currentType,
            `/expected_types/${position}`,
            ['read_risup_prompt_item_by_id'],
            '/type',
          ),
        );
      if (currentPreview !== undefined)
        requiredGuards.push(
          buildGuard(
            'expected_previews',
            currentPreview,
            `/expected_previews/${position}`,
            ['read_risup_prompt_item_by_id'],
            '/preview',
          ),
        );
    }
    operation.content = {
      ...(contentRecord ?? {}),
      expected_types: enrichedExpectedTypes,
      expected_previews: enrichedExpectedPreviews,
    };
    return {
      data: { dryRun: true, operation: 'delete_item', count: operation.selector.ids.length, deletes: previews },
      routes: [route('batch_delete_risup_prompt_items_by_id', 'POST', '/risup/prompt-item/batch-delete-by-id')],
      touched,
      requiredGuards: mergeGuards(operation.guards, requiredGuards),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.id
  ) {
    const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(operation.selector.id)}`;
    const read = await apiRequest('GET', promptRoute);
    if (isApiError(read)) return read;
    const readRecord = asRecord(read);
    const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
    const currentPreview = recordString(readRecord, 'preview');
    const typeConflict = guardConflict(
      operation.guards,
      'expected_type',
      currentType,
      `risup-prompt:${operation.selector.id}`,
    );
    if (typeConflict) return typeConflict;
    const previewConflict = guardConflict(
      operation.guards,
      'expected_preview',
      currentPreview,
      `risup-prompt:${operation.selector.id}`,
    );
    if (previewConflict) return previewConflict;
    return {
      data: {
        dryRun: true,
        operation: 'delete_item',
        resolved_id: operation.selector.id,
        resolved_index: recordNumber(readRecord, 'index'),
        currentType,
        currentPreview,
      },
      routes: [
        route('read_risup_prompt_item_by_id', 'GET', promptRoute),
        route('delete_risup_prompt_item_by_id', 'POST', `${promptRoute}/delete`),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentType === undefined
          ? undefined
          : buildGuard('expected_type', currentType, '/expected_type', ['read_risup_prompt_item_by_id'], '/type'),
        currentPreview === undefined
          ? undefined
          : buildGuard(
              'expected_preview',
              currentPreview,
              '/expected_preview',
              ['read_risup_prompt_item_by_id'],
              '/preview',
            ),
      ]),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    const list = await apiRequest('GET', '/risup/prompt-items');
    if (isApiError(list)) return list;
    const contentRecord = asRecord(operation.content);
    const expectedTypes = Array.isArray(contentRecord?.expected_types) ? contentRecord.expected_types : undefined;
    const expectedPreviews = Array.isArray(contentRecord?.expected_previews)
      ? contentRecord.expected_previews
      : undefined;
    const requiredGuards: FacadeV1Guard[] = [];
    const enrichedExpectedTypes: string[] = [];
    const enrichedExpectedPreviews: string[] = [];
    const previews: Array<Record<string, unknown>> = [];
    for (const [position, idx] of operation.selector.indices.entries()) {
      const currentRecord = itemByIndex(list, 'items', idx);
      const currentType = recordString(currentRecord, 'type');
      const currentPreview = recordString(currentRecord, 'preview');
      const expectedType =
        expectedTypes && typeof expectedTypes[position] === 'string' ? expectedTypes[position] : undefined;
      const expectedPreview =
        expectedPreviews && typeof expectedPreviews[position] === 'string' ? expectedPreviews[position] : undefined;
      if (expectedType !== undefined && currentType !== undefined && expectedType !== currentType) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_type',
          'Re-list/read risup prompt items, then run preview_edit again with current expected_type values.',
          { target: `risup-prompt:${idx}`, guard: 'expected_type', expected: expectedType, actual: currentType },
          ['list_risup_prompt_items', 'read_risup_prompt_item_batch', 'preview_edit'],
        );
      }
      if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
        return facadeApiError(
          409,
          'Stale guard mismatch for expected_preview',
          'Re-list/read risup prompt items, then run preview_edit again with current expected_preview values.',
          {
            target: `risup-prompt:${idx}`,
            guard: 'expected_preview',
            expected: expectedPreview,
            actual: currentPreview,
          },
          ['list_risup_prompt_items', 'read_risup_prompt_item_batch', 'preview_edit'],
        );
      }
      enrichedExpectedTypes.push(currentType ?? '');
      enrichedExpectedPreviews.push(currentPreview ?? '');
      previews.push({ index: idx, currentType, currentPreview });
      if (currentType !== undefined)
        requiredGuards.push(
          buildGuard(
            'expected_types',
            currentType,
            `/expected_types/${position}`,
            ['list_risup_prompt_items'],
            `/items/${position}/type`,
          ),
        );
      if (currentPreview !== undefined)
        requiredGuards.push(
          buildGuard(
            'expected_previews',
            currentPreview,
            `/expected_previews/${position}`,
            ['list_risup_prompt_items'],
            `/items/${position}/preview`,
          ),
        );
    }
    operation.content = {
      ...(contentRecord ?? {}),
      expected_types: enrichedExpectedTypes,
      expected_previews: enrichedExpectedPreviews,
    };
    return {
      data: { dryRun: true, operation: 'delete_item', count: operation.selector.indices.length, deletes: previews },
      routes: [
        route('list_risup_prompt_items', 'GET', '/risup/prompt-items'),
        route('batch_delete_risup_prompt_items', 'POST', '/risup/prompt-item/batch-delete'),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, requiredGuards),
    };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.index !== undefined
  ) {
    const promptRoute = `/risup/prompt-item/${operation.selector.index}`;
    const read = await apiRequest('GET', promptRoute);
    if (isApiError(read)) return read;
    const readRecord = asRecord(read);
    const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
    const currentPreview = recordString(readRecord, 'preview');
    const typeConflict = guardConflict(
      operation.guards,
      'expected_type',
      currentType,
      `risup-prompt:${operation.selector.index}`,
    );
    if (typeConflict) return typeConflict;
    const previewConflict = guardConflict(
      operation.guards,
      'expected_preview',
      currentPreview,
      `risup-prompt:${operation.selector.index}`,
    );
    if (previewConflict) return previewConflict;
    return {
      data: {
        dryRun: true,
        operation: 'delete_item',
        index: operation.selector.index,
        currentType,
        currentPreview,
      },
      routes: [
        route('read_risup_prompt_item', 'GET', promptRoute),
        route('delete_risup_prompt_item', 'POST', `/risup/prompt-item/${operation.selector.index}/delete`),
      ],
      touched,
      requiredGuards: mergeGuards(operation.guards, [
        currentType === undefined
          ? undefined
          : {
              name: 'expected_type',
              value: currentType,
              payloadPath: '/expected_type',
              sourceOperations: ['read_risup_prompt_item'],
              sourceResultPath: '/type',
            },
        currentPreview === undefined
          ? undefined
          : {
              name: 'expected_preview',
              value: currentPreview,
              payloadPath: '/expected_preview',
              sourceOperations: ['read_risup_prompt_item'],
              sourceResultPath: '/preview',
            },
      ]),
    };
  }

  if (
    operation.op === 'delete_item' &&
    ['regex', 'greeting', 'risup-prompt'].includes(operation.selector.family ?? '')
  ) {
    return facadeApiError(
      400,
      'Indexed structured deletes require an active target and selector.index',
      'Open the document, select target.kind="active", and provide selector.index plus any stale guard values.',
      { operation },
    );
  }

  if (operation.op === 'replace_text' && operation.selector.field) {
    if (!operation.find) {
      return facadeApiError(400, 'replace_text requires find', 'Provide operations[].find.');
    }
    const fieldRoute =
      target.kind === 'external'
        ? `/external/field/${encodeURIComponent(operation.selector.field)}/replace`
        : `/field/${encodeURIComponent(operation.selector.field)}/replace`;
    const data = await apiRequest('POST', fieldRoute, {
      ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
      find: operation.find,
      replace: typeof operation.replace === 'string' ? operation.replace : '',
      dry_run: true,
    });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [
            route(target.kind === 'external' ? 'external_replace_in_field' : 'replace_in_field', 'POST', fieldRoute),
          ],
          touched,
          requiredGuards: operation.guards ?? [],
        };
  }

  if (operation.op === 'write_content' && operation.selector.field) {
    const read = await readFacadeSelector(target, operation.selector);
    if (isApiError(read)) return read;
    if (isReadOnlyFacadeFieldPayload(read.data)) {
      return facadeApiError(
        400,
        `"${operation.selector.field}" is read-only`,
        'This field is deprecated, reserved, or compatibility-only. Use supported current fields or structured tools instead.',
        { selector: operation.selector },
      );
    }
    const oldContent = (read.data as Record<string, unknown>).content;
    return {
      data: {
        dryRun: true,
        field: operation.selector.field,
        oldSize: typeof oldContent === 'string' ? oldContent.length : JSON.stringify(oldContent).length,
        newSize:
          typeof operation.content === 'string' ? operation.content.length : JSON.stringify(operation.content).length,
      },
      routes: [
        ...read.routes,
        route(
          target.kind === 'external' ? 'external_write_field' : 'write_field',
          'POST',
          target.kind === 'external'
            ? `/external/field/${encodeURIComponent(operation.selector.field)}`
            : `/field/${encodeURIComponent(operation.selector.field)}`,
        ),
      ],
      touched,
      requiredGuards: operation.guards ?? [],
    };
  }

  if (operation.op === 'patch_surface') {
    if (target.kind !== 'active') {
      return facadeApiError(
        400,
        'External patch_surface is not in the second-wave facade scope',
        'Use external_patch_surface as an advanced granular route with expected_hash until manage_file/structured item facade work lands.',
      );
    }
    const operations = Array.isArray(operation.content) ? operation.content : undefined;
    if (!operations) {
      return facadeApiError(
        400,
        'patch_surface requires content as a JSON Patch array',
        'Set operations[].content to [{ "op": "replace", "path": "/name", "value": "..." }].',
      );
    }
    const data = await apiRequest('POST', '/surface/patch', {
      operations,
      dry_run: true,
      expected_hash: guardValue(operation.guards, 'expected_hash'),
    });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [route('patch_surface', 'POST', '/surface/patch')],
          touched,
          requiredGuards: operation.guards ?? [],
        };
  }

  return facadeApiError(
    400,
    `Unsupported preview operation: ${operation.op}`,
    'preview_edit supports active/external field replace_text, active/external field write_content, active indexed regex/greeting/risup-prompt write_content/delete_item, and active patch_surface.',
    { operation },
  );
}

async function applyFacadeOperation(
  target: FacadeV1Target,
  operation: FacadeV1EditOperation,
  guardValues?: FacadeV1Guard[],
): Promise<{ data: unknown; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
  const touched = [selectorTarget(operation.selector)];
  const guards = guardValues && guardValues.length > 0 ? guardValues : operation.guards;
  if (
    target.kind === 'external' &&
    operation.selector.family === 'risup-prompt' &&
    (operation.op === 'write_content' || operation.op === 'delete_item')
  ) {
    const originalGuards = operation.guards;
    operation.guards = guards;
    const prepared = await prepareExternalRisupPromptMutation(target, operation);
    operation.guards = originalGuards;
    if (isApiError(prepared)) return prepared;
    const routePath = '/external/field/promptTemplate';
    const data = await apiRequest('POST', routePath, {
      file_path: target.file_path,
      content: prepared.newPromptTemplate,
    });
    return isApiError(data)
      ? data
      : {
          data: { ...(asRecord(data) ?? {}), operation: operation.op, promptSize: prepared.newPromptTemplate.length },
          routes: prepared.routes,
          touched: prepared.touched,
        };
  }
  if (
    target.kind === 'active' &&
    operation.op === 'replace_text' &&
    operation.selector.family === 'lorebook' &&
    operation.selector.index !== undefined
  ) {
    const lorebookRoute = `/lorebook/${operation.selector.index}/replace`;
    const data = await apiRequest('POST', lorebookRoute, {
      find: operation.find,
      replace: typeof operation.replace === 'string' ? operation.replace : '',
      regex: operation.regex,
      flags: operation.flags,
      field: lorebookReplaceField(operation),
      expected_comment: lorebookExpectedComment(guards),
    });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [route('replace_in_lorebook', 'POST', lorebookRoute)],
          touched,
        };
  }

  if (
    operation.op === 'replace_text' &&
    operation.selector.family === 'lorebook' &&
    operation.selector.index !== undefined
  ) {
    return facadeApiError(
      400,
      'apply_edit lorebook replacement supports active targets only',
      'Use target.kind="active" for lorebook replace_text, or open the external/reference document first.',
      { operation },
    );
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'lorebook' &&
    operation.selector.id
  ) {
    const data = asRecord(operation.content);
    if (!data)
      return facadeApiError(
        400,
        'lorebook write_content requires an object',
        'Set operations[].content to the partial lorebook entry data.',
        { operation },
      );
    const routePath = `/lorebook/by-id/${encodeURIComponent(operation.selector.id)}`;
    const applied = await apiRequest('POST', routePath, {
      data,
      expected_comment: stringGuardValue(guards, 'expected_comment'),
    });
    return isApiError(applied)
      ? applied
      : { data: applied, routes: [route('write_lorebook_by_id', 'POST', routePath)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'lorebook' &&
    operation.selector.id
  ) {
    const routePath = `/lorebook/by-id/${encodeURIComponent(operation.selector.id)}/delete`;
    const data = await apiRequest('POST', routePath, {
      expected_comment: stringGuardValue(guards, 'expected_comment'),
    });
    return isApiError(data) ? data : { data, routes: [route('delete_lorebook_by_id', 'POST', routePath)], touched };
  }

  if (operation.selector.family === 'lorebook') {
    return facadeApiError(
      400,
      'Unsupported apply lorebook operation',
      'apply_edit supports active lorebook replace_text only when selector.index is provided; write_content and broad lorebook edits remain unsupported.',
      { operation },
    );
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'regex' &&
    operation.selector.identity
  ) {
    const data = asRecord(operation.content);
    if (!data)
      return facadeApiError(
        400,
        'regex write_content requires an object',
        'Set operations[].content to the partial regex entry data.',
        { operation },
      );
    const applied = await apiRequest('POST', '/regex/by-identity/write', {
      identity: operation.selector.identity,
      data,
      expected_comment: stringGuardValue(guards, 'expected_comment'),
    });
    return isApiError(applied)
      ? applied
      : { data: applied, routes: [route('write_regex_by_identity', 'POST', '/regex/by-identity/write')], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'regex' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    const entries = normalizeBatchEntries(operation, 'data');
    if (isApiError(entries)) return entries;
    const payloadEntries = entries.map((entry) => ({
      index: recordNumber(entry, 'index'),
      data: asRecord(entry.data) ?? {},
      expected_comment: recordString(entry, 'expected_comment'),
    }));
    const data = await apiRequest('POST', '/regex/batch-write', { entries: payloadEntries });
    return isApiError(data)
      ? data
      : { data, routes: [route('write_regex_batch', 'POST', '/regex/batch-write')], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'regex' &&
    operation.selector.index !== undefined
  ) {
    const data = asRecord(operation.content);
    if (!data) {
      return facadeApiError(
        400,
        'regex write_content requires an object',
        'Set operations[].content to the partial regex entry data to write.',
        { operation },
      );
    }
    const regexRoute = `/regex/${operation.selector.index}`;
    const applied = await apiRequest('POST', regexRoute, {
      ...data,
      expected_comment: stringGuardValue(guards, 'expected_comment'),
    });
    return isApiError(applied)
      ? applied
      : { data: applied, routes: [route('write_regex', 'POST', regexRoute)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'greeting' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting batch write selector',
        'preview_edit greeting batch writes require greeting_type="alternate" or "group".',
        { operation },
        ['list_greetings', 'read_greeting_batch', 'preview_edit'],
      );
    }
    const writes = normalizeBatchEntries(operation, 'content');
    if (isApiError(writes)) return writes;
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const payloadWrites = writes.map((write) => ({
      index: recordNumber(write, 'index'),
      content: replacementString(write.content),
      expected_preview: recordString(write, 'expected_preview'),
    }));
    const routePath = `/greeting/${greetingType}/batch-write`;
    const data = await apiRequest('POST', routePath, { writes: payloadWrites });
    return isApiError(data) ? data : { data, routes: [route('batch_write_greeting', 'POST', routePath)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'greeting' &&
    operation.selector.index !== undefined
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting write selector',
        'apply_edit greeting writes require greeting_type="alternate" or "group".',
        { operation },
      );
    }
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const greetingRoute = `/greeting/${greetingType}/${operation.selector.index}`;
    const data = await apiRequest('POST', greetingRoute, {
      content: replacementString(operation.content),
      expected_preview: stringGuardValue(guards, 'expected_preview'),
    });
    return isApiError(data) ? data : { data, routes: [route('write_greeting', 'POST', greetingRoute)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'greeting' &&
    operation.selector.identity
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting write selector',
        'apply_edit greeting identity writes require greeting_type="alternate" or "group".',
        { operation },
      );
    }
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const routePath = `/greeting/${greetingType}/by-hash/write`;
    const data = await apiRequest('POST', routePath, {
      identity: operation.selector.identity,
      content: replacementString(operation.content),
      expected_preview: stringGuardValue(guards, 'expected_preview'),
    });
    return isApiError(data) ? data : { data, routes: [route('write_greeting_by_hash', 'POST', routePath)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.ids &&
    operation.selector.ids.length > 0
  ) {
    const writes = normalizeBatchEntries(operation, 'item');
    if (isApiError(writes)) return writes;
    const payloadWrites = writes.map((write, position) => ({
      item_id: recordString(write, 'item_id') ?? operation.selector.ids?.[position],
      item: asRecord(write.item) ?? {},
      expected_type: recordString(write, 'expected_type'),
      expected_preview: recordString(write, 'expected_preview'),
    }));
    const data = await apiRequest('POST', '/risup/prompt-item/batch-write-by-id', { writes: payloadWrites });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [route('write_risup_prompt_item_by_id_batch', 'POST', '/risup/prompt-item/batch-write-by-id')],
          touched,
        };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.id
  ) {
    const item = asRecord(operation.content);
    if (!item) {
      return facadeApiError(
        400,
        'risup-prompt write_content requires an item object',
        'Set operations[].content to the replacement prompt item object.',
        { operation },
      );
    }
    const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(operation.selector.id)}`;
    const data = await apiRequest('POST', promptRoute, {
      item,
      expected_type: stringGuardValue(guards, 'expected_type'),
      expected_preview: stringGuardValue(guards, 'expected_preview'),
    });
    return isApiError(data)
      ? data
      : { data, routes: [route('write_risup_prompt_item_by_id', 'POST', promptRoute)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    const writes = normalizeBatchEntries(operation, 'item');
    if (isApiError(writes)) return writes;
    const payloadWrites = writes.map((write) => ({
      index: recordNumber(write, 'index'),
      item: asRecord(write.item) ?? {},
      expected_type: recordString(write, 'expected_type'),
      expected_preview: recordString(write, 'expected_preview'),
    }));
    const data = await apiRequest('POST', '/risup/prompt-item/batch-write', { writes: payloadWrites });
    return isApiError(data)
      ? data
      : { data, routes: [route('write_risup_prompt_item_batch', 'POST', '/risup/prompt-item/batch-write')], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'write_content' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.index !== undefined
  ) {
    const item = asRecord(operation.content);
    if (!item) {
      return facadeApiError(
        400,
        'risup-prompt write_content requires an item object',
        'Set operations[].content to the replacement prompt item object.',
        { operation },
      );
    }
    const promptRoute = `/risup/prompt-item/${operation.selector.index}`;
    const data = await apiRequest('POST', promptRoute, {
      item,
      expected_type: stringGuardValue(guards, 'expected_type'),
      expected_preview: stringGuardValue(guards, 'expected_preview'),
    });
    return isApiError(data) ? data : { data, routes: [route('write_risup_prompt_item', 'POST', promptRoute)], touched };
  }

  if (
    operation.op === 'write_content' &&
    ['regex', 'greeting', 'risup-prompt'].includes(operation.selector.family ?? '')
  ) {
    return facadeApiError(
      400,
      'Indexed structured writes require an active target and selector.index',
      'Open the document, select target.kind="active", and provide selector.index plus any stale guard values.',
      { operation },
    );
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'regex' &&
    operation.selector.index !== undefined
  ) {
    const regexRoute = `/regex/${operation.selector.index}/delete`;
    const data = await apiRequest('POST', regexRoute, {
      expected_comment: stringGuardValue(guards, 'expected_comment'),
    });
    return isApiError(data) ? data : { data, routes: [route('delete_regex', 'POST', regexRoute)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'regex' &&
    operation.selector.identity
  ) {
    const data = await apiRequest('POST', '/regex/by-identity/delete', {
      identity: operation.selector.identity,
      expected_comment: stringGuardValue(guards, 'expected_comment'),
    });
    return isApiError(data)
      ? data
      : { data, routes: [route('delete_regex_by_identity', 'POST', '/regex/by-identity/delete')], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'greeting' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting batch delete selector',
        'preview_edit greeting batch deletes require greeting_type="alternate" or "group".',
        { operation },
        ['list_greetings', 'read_greeting_batch', 'preview_edit'],
      );
    }
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const contentRecord = asRecord(operation.content);
    const routePath = `/greeting/${greetingType}/batch-delete`;
    const data = await apiRequest('POST', routePath, {
      indices: operation.selector.indices,
      expected_previews: contentRecord?.expected_previews,
    });
    return isApiError(data) ? data : { data, routes: [route('batch_delete_greeting', 'POST', routePath)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'greeting' &&
    operation.selector.index !== undefined
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting delete selector',
        'apply_edit greeting deletes require greeting_type="alternate" or "group".',
        { operation },
      );
    }
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const greetingRoute = `/greeting/${greetingType}/${operation.selector.index}/delete`;
    const data = await apiRequest('POST', greetingRoute, {
      expected_preview: stringGuardValue(guards, 'expected_preview'),
    });
    return isApiError(data) ? data : { data, routes: [route('delete_greeting', 'POST', greetingRoute)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'greeting' &&
    operation.selector.identity
  ) {
    if (!operation.selector.greeting_type) {
      return facadeApiError(
        400,
        'Unsupported greeting delete selector',
        'apply_edit greeting identity deletes require greeting_type="alternate" or "group".',
        { operation },
      );
    }
    const greetingType = encodeURIComponent(operation.selector.greeting_type);
    const routePath = `/greeting/${greetingType}/by-hash/delete`;
    const data = await apiRequest('POST', routePath, {
      identity: operation.selector.identity,
      expected_preview: stringGuardValue(guards, 'expected_preview'),
    });
    return isApiError(data) ? data : { data, routes: [route('delete_greeting_by_hash', 'POST', routePath)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.ids &&
    operation.selector.ids.length > 0
  ) {
    const contentRecord = asRecord(operation.content);
    const data = await apiRequest('POST', '/risup/prompt-item/batch-delete-by-id', {
      item_ids: operation.selector.ids,
      expected_types: contentRecord?.expected_types,
      expected_previews: contentRecord?.expected_previews,
    });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [route('batch_delete_risup_prompt_items_by_id', 'POST', '/risup/prompt-item/batch-delete-by-id')],
          touched,
        };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.id
  ) {
    const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(operation.selector.id)}/delete`;
    const data = await apiRequest('POST', promptRoute, {
      expected_type: stringGuardValue(guards, 'expected_type'),
      expected_preview: stringGuardValue(guards, 'expected_preview'),
    });
    return isApiError(data)
      ? data
      : { data, routes: [route('delete_risup_prompt_item_by_id', 'POST', promptRoute)], touched };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.indices &&
    operation.selector.indices.length > 0
  ) {
    const contentRecord = asRecord(operation.content);
    const data = await apiRequest('POST', '/risup/prompt-item/batch-delete', {
      indices: operation.selector.indices,
      expected_types: contentRecord?.expected_types,
      expected_previews: contentRecord?.expected_previews,
    });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [route('batch_delete_risup_prompt_items', 'POST', '/risup/prompt-item/batch-delete')],
          touched,
        };
  }

  if (
    target.kind === 'active' &&
    operation.op === 'delete_item' &&
    operation.selector.family === 'risup-prompt' &&
    operation.selector.index !== undefined
  ) {
    const promptRoute = `/risup/prompt-item/${operation.selector.index}/delete`;
    const data = await apiRequest('POST', promptRoute, {
      expected_type: stringGuardValue(guards, 'expected_type'),
      expected_preview: stringGuardValue(guards, 'expected_preview'),
    });
    return isApiError(data)
      ? data
      : { data, routes: [route('delete_risup_prompt_item', 'POST', promptRoute)], touched };
  }

  if (
    operation.op === 'delete_item' &&
    ['regex', 'greeting', 'risup-prompt'].includes(operation.selector.family ?? '')
  ) {
    return facadeApiError(
      400,
      'Indexed structured deletes require an active target and selector.index',
      'Open the document, select target.kind="active", and provide selector.index plus any stale guard values.',
      { operation },
    );
  }

  if (operation.op === 'replace_text' && operation.selector.field) {
    const fieldRoute =
      target.kind === 'external'
        ? `/external/field/${encodeURIComponent(operation.selector.field)}/replace`
        : `/field/${encodeURIComponent(operation.selector.field)}/replace`;
    const data = await apiRequest('POST', fieldRoute, {
      ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
      find: operation.find,
      replace: typeof operation.replace === 'string' ? operation.replace : '',
    });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [
            route(target.kind === 'external' ? 'external_replace_in_field' : 'replace_in_field', 'POST', fieldRoute),
          ],
          touched,
        };
  }
  if (operation.op === 'write_content' && operation.selector.field) {
    const fieldRoute =
      target.kind === 'external'
        ? `/external/field/${encodeURIComponent(operation.selector.field)}`
        : `/field/${encodeURIComponent(operation.selector.field)}`;
    const data = await apiRequest('POST', fieldRoute, {
      ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
      content: operation.content,
    });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [route(target.kind === 'external' ? 'external_write_field' : 'write_field', 'POST', fieldRoute)],
          touched,
        };
  }
  if (operation.op === 'patch_surface') {
    if (target.kind !== 'active') {
      return facadeApiError(
        400,
        'External patch_surface is not in the second-wave facade scope',
        'Use external_patch_surface as an advanced granular route with expected_hash.',
      );
    }
    const operations = Array.isArray(operation.content) ? operation.content : undefined;
    const data = await apiRequest('POST', '/surface/patch', {
      operations,
      expected_hash: guardValue(guards, 'expected_hash'),
    });
    return isApiError(data) ? data : { data, routes: [route('patch_surface', 'POST', '/surface/patch')], touched };
  }
  return facadeApiError(
    400,
    `Unsupported apply operation: ${operation.op}`,
    'Re-run preview_edit with supported facade operations.',
  );
}

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

interface ConfiguredToolProfile {
  raw: string | undefined;
  source: 'argv' | 'env' | null;
  resolved: ToolSurfaceProfileName | undefined;
  strictFiltering: boolean;
}

function getConfiguredToolProfile(args = process.argv.slice(2)): ConfiguredToolProfile {
  const argValue = readArgValue(args, '--tool-profile');
  const envValue = process.env.RISUTOKI_MCP_TOOL_PROFILE;
  const raw = argValue ?? envValue;
  const resolved = resolveToolSurfaceProfileName(raw);
  return {
    raw,
    source: argValue !== undefined ? 'argv' : envValue !== undefined ? 'env' : null,
    resolved,
    strictFiltering: raw !== undefined && resolved !== undefined,
  };
}

const configuredToolProfile = getConfiguredToolProfile();
const configuredToolProfileNames =
  configuredToolProfile.strictFiltering && configuredToolProfile.resolved
    ? new Set(listToolsForSurfaceProfile(configuredToolProfile.resolved))
    : null;

function shouldRegisterMcpTool(name: string): boolean {
  if (!configuredToolProfileNames) return true;
  return configuredToolProfileNames.has(name);
}

function activeToolProfileName(): ToolSurfaceProfileName | null {
  return configuredToolProfile.strictFiltering && configuredToolProfile.resolved
    ? configuredToolProfile.resolved
    : null;
}

function registeredToolNames(): string[] {
  return Array.from(_registeredToolHandles.keys()).sort();
}

function toolProfileCatalogOptions() {
  return {
    currentProfile: activeToolProfileName(),
    registeredTools: registeredToolNames(),
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
    profile: activeToolProfileName() ?? 'unfiltered-compatible',
    strictFiltering: configuredToolProfile.strictFiltering,
  };
}

function resultByteSize(result: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(result), 'utf8');
  } catch {
    return null;
  }
}

function instrumentToolHandler(name: string, handler: (...args: unknown[]) => unknown) {
  return async (...handlerArgs: unknown[]) => {
    const startedAt = Date.now();
    const callArgs = asRecord(handlerArgs[0]) ?? {};
    logProcessDiagnostic('toolStart', {
      ...toolDiagnosticBase(name),
      args: summarizeArgsForDiagnostic(callArgs),
    });
    try {
      const result = await handler(...handlerArgs);
      const isError = asRecord(result)?.isError === true;
      logProcessDiagnostic('toolSuccess', {
        ...toolDiagnosticBase(name),
        status: isError ? 'error' : 'ok',
        elapsedMs: Date.now() - startedAt,
        responseBytes: resultByteSize(result),
      });
      return result;
    } catch (error) {
      logProcessDiagnostic('toolError', {
        ...toolDiagnosticBase(name),
        status: 'thrown',
        elapsedMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  };
}

const server = new McpServer({
  name: 'risutoki',
  version: APP_VERSION,
});

// Collect RegisteredTool handles for annotation patching via public API.
// Each server.tool() return is stored so we avoid accessing _registeredTools.
const _registeredToolHandles = new Map<string, ReturnType<typeof server.tool>>();
const _origServerTool = server.tool.bind(server) as typeof server.tool;
server.tool = ((...args: unknown[]) => {
  const toolName = typeof args[0] === 'string' ? args[0] : undefined;
  if (toolName && !shouldRegisterMcpTool(toolName)) {
    logProcessDiagnostic('toolSkippedByProfile', {
      ...toolDiagnosticBase(toolName),
      requestedProfile: configuredToolProfile.raw,
      resolvedProfile: configuredToolProfile.resolved,
    });
    return {
      update: () => undefined,
      remove: () => undefined,
    } as unknown as ReturnType<typeof server.tool>;
  }
  const wrappedArgs = [...args];
  if (toolName) {
    for (let i = wrappedArgs.length - 1; i >= 0; i--) {
      if (typeof wrappedArgs[i] === 'function') {
        wrappedArgs[i] = instrumentToolHandler(toolName, wrappedArgs[i] as (...handlerArgs: unknown[]) => unknown);
        break;
      }
    }
  }
  const result = (_origServerTool as (...a: unknown[]) => ReturnType<typeof server.tool>)(...wrappedArgs);
  if (toolName) {
    _registeredToolHandles.set(toolName, result);
  }
  return result;
}) as typeof server.tool;

// ===== Facade v1 Tools =====

server.tool(
  'inspect_document',
  'Preferred facade v1 read-only entrypoint. Summarizes the active document/session, an external file, a loaded reference, or available guidance, and returns the routed legacy routes used.',
  {
    target: facadeV1TargetSchema.describe('Explicit facade target discriminator.'),
    max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
  },
  async ({ target, max_bytes }) => {
    if (target.kind === 'active' || target.kind === 'session') {
      const session = await apiRequest('GET', '/session/status');
      if (isApiError(session)) return textResult(session);
      const sessionWithRuntime = withMergedRuntimeMetadata(session);
      const routes = [route('session_status', 'GET', '/session/status')];
      const result: Record<string, unknown> = {
        session: sessionWithRuntime,
        routed_legacy: routes,
        touched_targets: ['session'],
      };
      if (target.kind === 'active') {
        const fields = await apiRequest('GET', '/fields');
        if (isApiError(fields)) return textResult(fields);
        const surfaces = await apiRequest('GET', '/surfaces');
        if (isApiError(surfaces)) return textResult(surfaces);
        routes.push(route('list_fields', 'GET', '/fields'), route('list_surfaces', 'GET', '/surfaces'));
        result.fields = fields;
        result.surfaces = surfaces;
        result.touched_targets = ['active'];
      }
      return textResult(
        facadeEnvelope(
          'inspect_document',
          'read-only',
          target,
          result,
          target.kind === 'active' ? 'Inspected active document facade target' : 'Inspected session facade target',
          ['read_content', 'search_document', 'preview_edit'],
          { routed_tools: routes.map((entry) => entry.tool), touched_targets: result.touched_targets },
          max_bytes,
        ),
      );
    }

    if (target.kind === 'external') {
      const data = await apiRequest('POST', '/external/inspect', { file_path: target.file_path });
      if (isApiError(data)) return textResult(data);
      const routes = [route('inspect_external_file', 'POST', '/external/inspect')];
      return textResult(
        facadeEnvelope(
          'inspect_document',
          'read-only',
          target,
          { external: data, routed_legacy: routes, touched_targets: [`external:${target.file_path}`] },
          'Inspected external document facade target',
          ['read_content', 'search_document'],
          { routed_tools: routes.map((entry) => entry.tool), touched_targets: [`external:${target.file_path}`] },
          max_bytes,
        ),
      );
    }

    if (target.kind === 'reference') {
      const index = await resolveReferenceIndex(target);
      if (typeof index !== 'number') return textResult(index);
      const refs = await apiRequest('GET', '/references');
      if (isApiError(refs)) return textResult(refs);
      const routes = [route('list_references', 'GET', '/references')];
      return textResult(
        facadeEnvelope(
          'inspect_document',
          'read-only',
          target,
          { reference_index: index, references: refs, routed_legacy: routes, touched_targets: [`reference:${index}`] },
          `Inspected reference ${index} facade target`,
          ['read_content', 'search_document'],
          { routed_tools: routes.map((entry) => entry.tool), touched_targets: [`reference:${index}`] },
          max_bytes,
        ),
      );
    }

    if (target.kind === 'guidance') {
      const routePath = target.skill
        ? `/skills/${encodeURIComponent(target.skill)}${target.document ? `/${encodeURIComponent(target.document)}` : ''}`
        : '/skills';
      const data = await apiRequest('GET', routePath);
      if (isApiError(data)) return textResult(data);
      const routes = [route(target.skill ? 'read_skill' : 'list_skills', 'GET', routePath)];
      return textResult(
        facadeEnvelope(
          'inspect_document',
          'read-only',
          target,
          { guidance: data, routed_legacy: routes, touched_targets: ['guidance'] },
          'Inspected guidance facade target',
          ['read_content'],
          { routed_tools: routes.map((entry) => entry.tool), touched_targets: ['guidance'] },
          max_bytes,
        ),
      );
    }

    return textResult(
      facadeApiError(
        400,
        'Unsupported inspect_document target',
        'Use active, external, reference, guidance, or session.',
      ),
    );
  },
);

server.tool(
  'list_tool_profiles',
  'Preferred read-only catalog facade for MCP tool surface profiles. Returns compact profile-specific tools plus current strict filtering status, registered/hidden counts, batch alternatives, and runtimeHealth. tools/list remains unfiltered unless --tool-profile or RISUTOKI_MCP_TOOL_PROFILE is set. Use profile="advanced-full" (aliases "advanced" or "full") as the granular escape hatch.',
  {
    profile: z
      .string()
      .optional()
      .describe(
        'Profile catalog to return. Defaults to facade-first. Valid profiles: facade-first, authoring, readonly, advanced-full; aliases: advanced, full.',
      ),
  },
  async ({ profile }) => {
    const catalog = buildToolSurfaceProfileCatalog(profile, toolProfileCatalogOptions());
    if (!catalog) {
      return textResult(
        facadeApiError(
          400,
          `Unknown tool profile: ${profile}`,
          'Use facade-first, authoring, readonly, advanced-full, or aliases advanced/full.',
        ),
      );
    }
    const runtime = await getRuntimeMetadataForCatalog();
    const runtimeHealth = getRuntimeHealth();
    const health = getToolCatalogHealthSummary();
    const skewSummary = runtime.skew.detected ? ` Runtime skew detected: ${runtime.skew.warnings.join('; ')}` : '';
    return textResult(
      mcpSuccess(
        {
          profile: catalog,
          runtime,
          runtimeHealth,
          health,
        },
        {
          toolName: 'list_tool_profiles',
          summary: `Returned ${catalog.counts.profileTools} tools for ${catalog.resolvedProfile} profile${skewSummary}`,
          nextActions: catalog.legacyEscapeHatch ? ['list_tool_profiles', 'tools/list'] : ['tools/list'],
          artifacts: {
            profile: catalog.resolvedProfile,
            filtering_status: catalog.filteringStatus,
            tools_list_behavior: catalog.toolsListBehavior,
            tool_count: catalog.counts.profileTools,
            all_tool_count: catalog.counts.allTools,
            registered_tool_count: catalog.counts.registeredTools,
            hidden_from_tools_list: catalog.counts.hiddenFromToolsList,
            runtime_mode: runtime.runtimeMode,
            runtime_health: runtimeHealth,
            runtime_skew_detected: runtime.skew.detected,
            runtime_skew_warnings: runtime.skew.warnings,
            catalog_health: health,
          },
        },
      ),
    );
  },
);

server.tool(
  'read_content',
  'Preferred facade v1 bounded reader. Reads selected field/surface/content items by routing to existing granular tools and returns routed legacy names. Defaults to a 24KB response cap; root surface selectors return an overview unless selector.include_raw=true and max_bytes is explicit. Supports external .risup prompt item selectors.',
  {
    target: facadeV1TargetSchema.describe('Explicit facade target discriminator.'),
    selectors: z.array(facadeV1ContentSelectorSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
    max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
  },
  async ({ target, selectors, max_bytes }) => {
    const actualSelectors: FacadeV1ContentSelector[] =
      selectors && selectors.length > 0 ? selectors : [{ family: 'surface', path: '/' }];
    const effectiveMaxBytes = max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES;
    const results: unknown[] = [];
    const routes: FacadeRoute[] = [];
    const touchedTargets: string[] = [];
    for (const selector of actualSelectors) {
      if (
        (selector.family === 'surface' || selector.path) &&
        (selector.path === undefined || selector.path === '/' || selector.path === '') &&
        selector.include_raw === true &&
        max_bytes === undefined
      ) {
        return textResult(
          facadeApiError(
            400,
            'Raw root surface reads require an explicit max_bytes',
            'Use the default overview, choose a narrower selector.path, or pass max_bytes with selector.include_raw=true.',
            { selector, default_max_bytes: DEFAULT_FACADE_READ_MAX_BYTES },
            ['read_content', 'search_document'],
          ),
        );
      }
      const read = await readFacadeSelector(target, selector);
      if (isApiError(read)) return textResult(read);
      results.push({ selector, data: read.data });
      routes.push(...read.routes);
      touchedTargets.push(selectorTarget(selector));
    }
    const hasOverviewRead = results.some((item) => asRecord(asRecord(item)?.data)?.raw_omitted === true);
    return textResult(
      facadeEnvelope(
        'read_content',
        'read-only',
        target,
        { items: results, routed_legacy: routes, touched_targets: touchedTargets },
        `Read ${results.length} facade selector(s)`,
        ['search_document', 'preview_edit'],
        {
          count: results.length,
          routed_tools: routes.map((entry) => entry.tool),
          touched_targets: touchedTargets,
          ...(hasOverviewRead
            ? {
                continuation_hint:
                  'Root surface raw JSON is omitted by default. Choose a narrower selector or use include_raw with explicit max_bytes only when raw root JSON is required.',
                recommended_follow_up_selectors: [
                  { family: 'field', field: '<fieldName>' },
                  { family: 'surface', path: '/<json-pointer>' },
                ],
              }
            : {}),
        },
        effectiveMaxBytes,
      ),
    );
  },
);

server.tool(
  'search_document',
  'Preferred facade v1 search entrypoint. Searches active documents, active/external risup-prompt items with literal queries, external fields, or reference fields through routed legacy tools.',
  {
    target: facadeV1TargetSchema.describe('Explicit facade target discriminator.'),
    query: z.string().min(1),
    field: z.string().optional().describe('Required for external/reference targets.'),
    regex: z.boolean().optional(),
    flags: z.string().optional(),
    context_chars: z.number().optional(),
    max_matches: z.number().int().positive().max(FACADE_V1_LIMITS.maxMatches).optional(),
    max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
  },
  async ({ target, query, field, regex, flags, context_chars, max_matches, max_bytes }) => {
    let data: unknown;
    let routes: FacadeRoute[];
    const body = { query, regex, flags, context_chars, max_matches };
    if (target.kind === 'active' && field === 'risup-prompt') {
      if (regex) {
        return textResult(
          facadeApiError(
            400,
            'Unsupported risup-prompt search selector',
            'Active risup-prompt facade search routes only literal substring queries to search_in_risup_prompt_items; omit regex or use the granular tool directly.',
          ),
        );
      }
      data = await apiRequest('POST', '/risup/prompt-items/search', { query });
      routes = [route('search_in_risup_prompt_items', 'POST', '/risup/prompt-items/search')];
    } else if (target.kind === 'active') {
      data = await apiRequest('POST', '/search-all', {
        query,
        regex,
        flags,
        context_chars,
        max_matches_per_field: max_matches,
      });
      routes = [route('search_all_fields', 'POST', '/search-all')];
    } else if (target.kind === 'external' && field === 'risup-prompt') {
      if (regex) {
        return textResult(
          facadeApiError(
            400,
            'Unsupported external risup-prompt regex search',
            'External risup-prompt facade search supports literal substring queries; omit regex or use a granular raw field search.',
          ),
        );
      }
      const externalPrompt = await readExternalRisupPromptModel(target.file_path);
      if (isApiError(externalPrompt)) return textResult(externalPrompt);
      const matches = externalPrompt.model.items
        .map((item, index) => {
          const matchedFields = findRisupPromptItemMatchedFields(item, query);
          if (matchedFields.length === 0) return null;
          return {
            index,
            id: item.id ?? null,
            type: item.type ?? null,
            supported: item.supported,
            preview: risupPromptItemPreview(item),
            matched_fields: matchedFields,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .slice(0, max_matches ?? FACADE_V1_LIMITS.maxMatches);
      data = { query, count: matches.length, matches };
      routes = externalPrompt.routes;
    } else if (target.kind === 'external' && field) {
      const routePath = `/external/field/${encodeURIComponent(field)}/search`;
      data = await apiRequest('POST', routePath, { ...body, file_path: target.file_path });
      routes = [route('external_search_in_field', 'POST', routePath)];
    } else if (target.kind === 'reference' && field) {
      const index = await resolveReferenceIndex(target);
      if (typeof index !== 'number') return textResult(index);
      const routePath = `/reference/${index}/field/${encodeURIComponent(field)}/search`;
      data = await apiRequest('POST', routePath, body);
      routes = [route('search_in_reference_field', 'POST', routePath)];
    } else {
      return textResult(
        facadeApiError(
          400,
          `Unsupported search_document target kind "${target.kind}"`,
          'search_document supports active targets directly; external/reference targets require a field argument.',
        ),
      );
    }
    if (isApiError(data)) return textResult(data);
    return textResult(
      facadeEnvelope(
        'search_document',
        'read-only',
        target,
        { search: data, routed_legacy: routes, touched_targets: field ? [`field:${field}`] : ['active'] },
        `Searched facade target for "${query}"`,
        ['read_content', 'preview_edit'],
        { routed_tools: routes.map((entry) => entry.tool), touched_targets: field ? [`field:${field}`] : ['active'] },
        max_bytes,
      ),
    );
  },
);

server.tool(
  'validate_content',
  'Preferred facade v1 validation entrypoint. Validates active lorebook, regex, CBS, Danbooru tags, active/external risup prompt/order selectors, risum semantic fields, and external Plugin v3 source scans where facade selectors provide enough context.',
  {
    target: facadeV1TargetSchema.describe(
      'Explicit facade target discriminator. Supports active artifact validation, external .risup prompt checks, and external Plugin v3 source scans.',
    ),
    selectors: z.array(facadeV1ContentSelectorSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
    max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
  },
  async ({ target, selectors, max_bytes }) => {
    const validation = await validateFacadeSelectors(target, selectors);
    if (isApiError(validation)) return textResult(validation);
    return textResult(
      facadeEnvelope(
        'validate_content',
        'read-only',
        target,
        validation.result,
        `Validated ${validation.touchedTargets.join(', ')} facade content`,
        ['read_content', 'preview_edit'],
        {
          routed_tools: validation.routes.map((entry) => entry.tool),
          touched_targets: validation.touchedTargets,
        },
        max_bytes,
      ),
    );
  },
);

server.tool(
  'load_guidance',
  'Preferred facade v1 guidance loader. Reads the skill catalog or a skill document through existing list_skills/read_skill routes with bounded facade metadata.',
  {
    target: z
      .object({
        kind: z.literal('guidance'),
        skill: z.string().min(1).optional(),
        document: z.string().min(1).optional(),
      })
      .refine((d) => d.skill !== undefined || d.document !== undefined, {
        message: 'guidance target requires skill or document',
        path: ['skill'],
      }),
    max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
  },
  async ({ target, max_bytes }) => {
    const requestedSkill =
      target.skill === 'plugin-v3' || target.skill === 'plugins-v3' || target.document === 'plugin-v3'
        ? 'writing-plugins-v3'
        : target.skill;
    const routePath = requestedSkill
      ? `/skills/${encodeURIComponent(requestedSkill)}${target.document && target.document !== 'plugin-v3' ? `/${encodeURIComponent(target.document)}` : ''}`
      : '/skills';
    const data = await apiRequest('GET', routePath);
    if (isApiError(data)) return textResult(data);
    const routes = [route(requestedSkill ? 'read_skill' : 'list_skills', 'GET', routePath)];
    return textResult(
      facadeEnvelope(
        'load_guidance',
        'read-only',
        target,
        { guidance: data, routed_legacy: routes, touched_targets: ['guidance'] },
        requestedSkill ? `Loaded guidance for ${requestedSkill}` : 'Loaded guidance catalog',
        ['read_content', 'search_document'],
        {
          routed_tools: routes.map((entry) => entry.tool),
          touched_targets: ['guidance'],
          ...(requestedSkill === 'writing-plugins-v3'
            ? { source_workflow: true, note: '.js/.ts plugin files are source files, not MCP artifacts.' }
            : {}),
        },
        max_bytes,
      ),
    );
  },
);

server.tool(
  'preview_edit',
  'Preferred facade v1 preview tool. Produces a dry-run/read-only preview token for active/external field edits, external .risup prompt item edits, active surface patches, active indexed and safe batch regex/greeting/risup prompt item writes/deletes. Does not mutate content; call apply_edit with the returned preview_token and operation_digest to apply.',
  {
    target: facadeV1TargetSchema.describe(
      'Explicit facade target discriminator. Supports active edits and second-wave external field replace/write previews.',
    ),
    operations: z.array(facadeEditOperationSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems),
    dry_run: z.boolean().optional(),
    max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
  },
  safeToolHandler('preview_edit', async ({ target, operations, max_bytes }) => {
    cleanupFacadePreviews();
    const previews: unknown[] = [];
    const routes: FacadeRoute[] = [];
    const touchedTargets: string[] = [];
    const requiredGuards: FacadeV1Guard[] = [];
    for (const operation of operations) {
      const preview = await previewFacadeOperation(target, operation);
      if (isApiError(preview)) return textResult(preview);
      if (preview.requiredGuards.length > 0) operation.guards = preview.requiredGuards;
      previews.push({ operation: operation.op, selector: operation.selector, data: preview.data });
      routes.push(...preview.routes);
      touchedTargets.push(...preview.touched);
      requiredGuards.push(...preview.requiredGuards);
    }
    const digest = operationDigest(target, operations);
    const token = makePreviewToken();
    const expiresAtMs = Date.now() + FACADE_PREVIEW_TTL_MS;
    facadePreviewStore.set(token, {
      token,
      operationDigest: digest,
      target,
      operations,
      routes,
      touchedTargets,
      requiredGuards,
      expiresAtMs,
    });
    return textResult(
      mcpSuccess(
        {
          facade: {
            contract: FACADE_V1_CONTRACT_ID,
            version: 'v1',
            tool: 'preview_edit',
            mutability: 'preview',
            target,
            ...(max_bytes ? { max_bytes } : {}),
          },
          result: { previews, routed_legacy: routes, touched_targets: touchedTargets, guard_values: requiredGuards },
          preview: {
            preview_token: token,
            operation_digest: digest,
            expires_at: new Date(expiresAtMs).toISOString(),
            required_guards: requiredGuards,
          },
        },
        {
          toolName: 'preview_edit',
          summary: `Previewed ${operations.length} facade edit operation(s)`,
          nextActions: ['apply_edit', 'read_content'],
          artifacts: {
            count: operations.length,
            routed_tools: routes.map((entry) => entry.tool),
            touched_targets: touchedTargets,
          },
        },
      ),
    );
  }),
);

server.tool(
  'apply_edit',
  'Preferred facade v1 mutating apply tool. Applies a prior preview_edit using preview_token and operation_digest, preserving existing granular confirmation/guard behavior for active/external fields, external .risup prompt item edits, active surface patches, and active indexed/batch regex/greeting/risup prompt item writes/deletes. Requires user confirmation through the routed legacy mutation.',
  {
    preview_token: z.string().regex(/^facade-preview-v1\.[A-Za-z0-9._-]{16,}$/),
    operation_digest: z.string().min(16),
    target: facadeV1TargetSchema.describe('Must match the target used for preview_edit.'),
    guard_values: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
    max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
  },
  safeToolHandler('apply_edit', async ({ preview_token, operation_digest, target, guard_values, max_bytes }) => {
    cleanupFacadePreviews();
    const entry = facadePreviewStore.get(preview_token);
    if (!entry) {
      return textResult(
        facadeApiError(
          404,
          'Unknown or expired preview token',
          'Run preview_edit again, then retry apply_edit with the new token.',
        ),
      );
    }
    if (entry.operationDigest !== operation_digest || !sameTarget(entry.target, target)) {
      return textResult(
        facadeApiError(
          409,
          'Preview token does not match operation digest or target',
          'Use the exact operation_digest and target returned by preview_edit.',
        ),
      );
    }
    const results: unknown[] = [];
    const routes: FacadeRoute[] = [];
    const touchedTargets: string[] = [];
    for (const operation of entry.operations) {
      const applied = await applyFacadeOperation(entry.target, operation, guard_values);
      if (isApiError(applied)) return textResult(applied);
      results.push({ operation: operation.op, selector: operation.selector, data: applied.data });
      routes.push(...applied.routes);
      touchedTargets.push(...applied.touched);
    }
    facadePreviewStore.delete(preview_token);
    const postEdit = applyEditPostEditMetadata(entry);
    return textResult(
      facadeEnvelope(
        'apply_edit',
        'mutating',
        target,
        {
          applied: results,
          routed_legacy: routes,
          touched_targets: touchedTargets,
          guard_values: guard_values ?? entry.requiredGuards,
          preview_token,
          operation_digest,
        },
        `Applied ${results.length} facade edit operation(s)`,
        postEdit.nextActions,
        {
          count: results.length,
          routed_tools: routes.map((routeEntry) => routeEntry.tool),
          touched_targets: touchedTargets,
          ...postEdit.artifacts,
        },
        max_bytes,
      ),
    );
  }),
);

// ===== Field Tools =====

server.tool(
  'list_fields',
  '현재 열린 파일(.charx, .risum, .risup)의 편집 가능한 필드 목록과 크기를 확인합니다. 응답에 fileType 포함.',
  {},
  async () => textResult(await apiRequest('GET', '/fields')),
);

server.tool(
  'read_field',
  '작은 활성 문서 필드의 전체 내용을 읽습니다. ⚠️ lua/css/alternateGreetings/groupOnlyGreetings/triggerScripts는 전용 list_*/read_* 도구를 사용하세요. `.risup`의 promptTemplate/formatingOrder도 risup 전용 도구를 우선 사용해야 합니다. 큰 필드는 search_in_field 또는 read_field_range부터 시작하세요. 가능한 필드는 list_fields로 확인하세요.',
  { field: z.string().describe('필드 이름') },
  async ({ field }) => textResult(await apiRequest('GET', `/field/${encodeURIComponent(field)}`)),
);

server.tool(
  'write_field',
  '작은 활성 문서 필드에 새 내용을 씁니다. ⚠️ lua/css는 write_lua/write_css, alternateGreetings는 write_greeting/batch_write_greeting, triggerScripts는 write_trigger를 우선 사용하세요. groupOnlyGreetings 및 비권장/예약/레거시 필드는 읽기 전용입니다. `.risup`의 promptTemplate/formatingOrder는 전용 risup prompt 도구를 우선 사용하고, write_field는 unsupported raw shape fallback일 때만 쓰는 편이 안전합니다. 가능한 필드는 list_fields로 확인하세요. 사용자 확인 필요.',
  {
    field: z.string().describe('필드 이름'),
    content: z
      .union([z.string(), z.array(z.string()), z.boolean(), z.number()])
      .describe(
        '새로운 내용. alternateGreetings는 문자열 배열, triggerScripts는 JSON 문자열, boolean 필드는 boolean, number 필드는 number, 나머지는 문자열. 비권장/예약/레거시 필드는 수정할 수 없습니다.',
      ),
  },
  safeToolHandler('write_field', async ({ field, content }) =>
    textResult(await apiRequest('POST', `/field/${encodeURIComponent(String(field))}`, { content })),
  ),
);

server.tool(
  'read_field_batch',
  '여러 작은 활성 문서 필드를 한 번에 읽습니다. read_field 반복 대신 이 도구를 사용하세요. ⚠️ lua/css/alternateGreetings/groupOnlyGreetings/triggerScripts와 `.risup` promptTemplate/formatingOrder 같은 구조화 표면은 전용 도구를 사용하세요. 최대 20개 필드. 유효하지 않은 필드는 개별 에러로 반환됩니다 (전체 실패 X).',
  {
    fields: z
      .array(z.string())
      .max(20)
      .describe('읽을 필드 이름 배열 (예: ["personality", "scenario", "globalNote", "systemPrompt"])'),
  },
  async ({ fields }) => textResult(await apiRequest('POST', '/field/batch', { fields })),
);

// ===== External File Probe Tools =====

server.tool(
  'probe_field',
  '에디터에 열지 않은 .charx/.risum/.risup 파일에서 작은 필드 하나를 읽습니다. 절대 file_path가 필요하며 읽기 전용입니다. ⚠️ lorebook/regex/lua/css/greetings/triggers/risup prompt 표면은 대응하는 probe_* 전용 도구를 우선 사용하세요.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    field: z.string().describe('읽을 필드 이름'),
  },
  async ({ file_path, field }) =>
    textResult(await apiRequest('POST', `/probe/field/${encodeURIComponent(field)}`, { file_path })),
);

server.tool(
  'probe_field_batch',
  '에디터에 열지 않은 .charx/.risum/.risup 파일에서 여러 필드를 한 번에 읽습니다. 최대 20개 필드. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    fields: z.array(z.string()).max(20).describe('읽을 필드 이름 배열 (최대 20개)'),
  },
  async ({ file_path, fields }) => textResult(await apiRequest('POST', '/probe/field/batch', { file_path, fields })),
);

server.tool(
  'probe_lorebook',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 로어북 목록을 읽습니다. filter/folder/content_filter 옵션 지원. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    filter: z.string().optional().describe('검색 키워드 (comment, key에서 검색). 생략 시 전체 목록 반환'),
    folder: z.string().optional().describe('폴더 UUID로 필터 (예: "folder:xxxx" 또는 UUID만). 생략 시 전체 반환'),
    content_filter: z.string().optional().describe('본문(content) 검색 키워드. 대소문자 무시. filter와 AND 결합'),
    content_filter_not: z.string().optional().describe('본문(content)에 이 키워드가 없는 항목만 필터. 대소문자 무시'),
    preview_length: z.number().optional().describe('content 미리보기 길이 (기본 150, 0=비활성, 최대 500)'),
  },
  async ({ file_path, filter, folder, content_filter, content_filter_not, preview_length }) => {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (folder) params.set('folder', folder);
    if (content_filter) params.set('content_filter', content_filter);
    if (content_filter_not) params.set('content_filter_not', content_filter_not);
    if (preview_length !== undefined) params.set('preview_length', String(preview_length));
    const qs = params.toString();
    return textResult(await apiRequest('POST', qs ? `/probe/lorebook?${qs}` : '/probe/lorebook', { file_path }));
  },
);

server.tool(
  'probe_regex',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 정규식 목록을 읽습니다. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
  },
  async ({ file_path }) => textResult(await apiRequest('POST', '/probe/regex', { file_path })),
);

server.tool(
  'probe_lua',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 Lua 섹션 목록을 읽습니다. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
  },
  async ({ file_path }) => textResult(await apiRequest('POST', '/probe/lua', { file_path })),
);

server.tool(
  'probe_css',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 CSS 섹션 목록을 읽습니다. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
  },
  async ({ file_path }) => textResult(await apiRequest('POST', '/probe/css', { file_path })),
);

server.tool(
  'probe_greetings',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 greetings 목록을 읽습니다. type은 alternate 또는 groupOnly. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    type: z.enum(['alternate', 'groupOnly']).describe('greeting 종류'),
    filter: z.string().optional().describe('미리보기 텍스트 필터'),
    content_filter: z.string().optional().describe('본문(content) 검색 필터'),
  },
  async ({ file_path, type, filter, content_filter }) => {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (content_filter) params.set('content_filter', content_filter);
    const qs = params.toString();
    return textResult(
      await apiRequest(
        'POST',
        qs ? `/probe/greetings/${encodeURIComponent(type)}?${qs}` : `/probe/greetings/${encodeURIComponent(type)}`,
        {
          file_path,
        },
      ),
    );
  },
);

server.tool(
  'probe_triggers',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 trigger 목록을 읽습니다. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
  },
  async ({ file_path }) => textResult(await apiRequest('POST', '/probe/triggers', { file_path })),
);

server.tool(
  'probe_risup_prompt_items',
  '에디터에 열지 않은 .risup 파일의 prompt item 목록을 읽습니다. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .risup 파일의 절대 경로'),
  },
  async ({ file_path }) => textResult(await apiRequest('POST', '/probe/risup/prompt-items', { file_path })),
);

server.tool(
  'probe_risup_formating_order',
  '에디터에 열지 않은 .risup 파일의 formatingOrder 토큰과 경고를 읽습니다. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .risup 파일의 절대 경로'),
  },
  async ({ file_path }) => textResult(await apiRequest('POST', '/probe/risup/formating-order', { file_path })),
);

server.tool(
  'inspect_external_file',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 필드 인벤토리와 구조화 표면 개수를 빠르게 요약합니다. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
  },
  async ({ file_path }) => textResult(await apiRequest('POST', '/external/inspect', { file_path })),
);

server.tool(
  'external_write_field',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 필드 값을 file_path 기준으로 직접 수정합니다. 현재 UI에 열려 있는 동일 파일은 거부되며, lorebook/regex/triggerScripts/groupOnlyGreetings 같은 구조화 표면도 raw field 단위로 갱신할 수 있습니다. 사용자 확인 필요.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    field: z.string().describe('수정할 필드 이름'),
    content: z
      .union([z.string(), z.array(z.unknown()), z.boolean(), z.number()])
      .describe('새 값. 문자열/배열/boolean/number를 허용하며 구조화 표면은 JSON 배열 형태를 사용합니다.'),
  },
  async ({ file_path, field, content }) =>
    textResult(await apiRequest('POST', `/external/field/${encodeURIComponent(field)}`, { file_path, content })),
);

server.tool(
  'external_write_field_batch',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 여러 필드를 한 번에 수정합니다. 현재 UI에 열려 있는 동일 파일은 거부됩니다. 최대 20개 항목. 사용자 확인 필요.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    entries: z
      .array(z.object({ field: z.string(), content: z.unknown() }))
      .max(20)
      .describe('수정할 항목 배열 [{ field, content }]'),
  },
  async ({ file_path, entries }) =>
    textResult(await apiRequest('POST', '/external/field/batch-write', { file_path, entries })),
);

server.tool(
  'external_search_in_field',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 문자열 필드를 검색합니다. 수정 없는 읽기 전용입니다.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    field: z.string().describe('검색할 문자열 필드 이름'),
    query: z.string().describe('검색할 문자열 또는 정규식 패턴'),
    context_chars: z.number().optional().describe('매치 전후에 표시할 문자 수 (기본: 100, 최대: 500)'),
    regex: z.boolean().optional().describe('정규식 모드 여부'),
    flags: z.string().optional().describe('정규식 플래그'),
    max_matches: z.number().optional().describe('최대 반환 매치 수 (기본: 20, 최대: 100)'),
  },
  async ({ file_path, field, query, context_chars, regex, flags, max_matches }) =>
    textResult(
      await apiRequest('POST', `/external/field/${encodeURIComponent(field)}/search`, {
        file_path,
        query,
        context_chars,
        regex,
        flags,
        max_matches,
      }),
    ),
);

server.tool(
  'external_read_field_range',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 문자열 필드 일부만 읽습니다. 큰 필드를 직접 열지 않고 필요한 범위만 확인할 때 사용합니다. 읽기 전용.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    field: z.string().describe('읽을 문자열 필드 이름'),
    offset: z.number().optional().describe('시작 오프셋 (기본: 0)'),
    length: z.number().optional().describe('읽을 길이 (기본: 2000, 최대: 10000)'),
  },
  async ({ file_path, field, offset, length }) =>
    textResult(
      await apiRequest('POST', `/external/field/${encodeURIComponent(field)}/range`, { file_path, offset, length }),
    ),
);

server.tool(
  'external_replace_in_field',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 문자열 필드에서 서버 측 치환을 수행합니다. current UI 문서와 같은 파일은 거부됩니다. dry_run: true로 미리보기 가능. 사용자 확인 필요.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    field: z.string().describe('치환할 문자열 필드 이름'),
    find: z.string().describe('찾을 문자열 또는 정규식 패턴'),
    replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
    regex: z.boolean().optional().describe('정규식 모드 여부'),
    flags: z.string().optional().describe('정규식 플래그'),
    dry_run: z.boolean().optional().describe('true이면 실제 저장 없이 매치 결과만 반환'),
  },
  async ({ file_path, field, find, replace, regex, flags, dry_run }) =>
    textResult(
      await apiRequest('POST', `/external/field/${encodeURIComponent(field)}/replace`, {
        file_path,
        find,
        replace,
        regex,
        flags,
        dry_run,
      }),
    ),
);

server.tool(
  'external_insert_in_field',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 문자열 필드에 텍스트를 삽입합니다. current UI 문서와 같은 파일은 거부됩니다. 사용자 확인 필요.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    field: z.string().describe('삽입할 문자열 필드 이름'),
    content: z.string().describe('삽입할 텍스트'),
    position: z.enum(['end', 'start', 'after', 'before']).optional().describe('삽입 위치'),
    anchor: z.string().optional().describe('position이 after/before일 때 기준 문자열'),
  },
  async ({ file_path, field, content, position, anchor }) =>
    textResult(
      await apiRequest('POST', `/external/field/${encodeURIComponent(field)}/insert`, {
        file_path,
        content,
        position,
        anchor,
      }),
    ),
);

server.tool(
  'open_file',
  '절대 경로의 .charx/.risum/.risup 파일을 현재 에디터 문서로 엽니다. 이후 read/write 계열 도구는 이 파일을 대상으로 동작합니다.',
  {
    file_path: z.string().describe('열 대상 .charx/.risum/.risup 파일의 절대 경로'),
    save_current: z
      .boolean()
      .optional()
      .describe(
        'true면 현재 문서에 변경사항이 있을 때 먼저 저장을 시도합니다. 생략 시 기존 저장/폐기/취소 확인 흐름을 따릅니다.',
      ),
  },
  async ({ file_path, save_current }) =>
    textResult(await apiRequest('POST', '/open-file', { file_path, save_current })),
);

server.tool(
  'save_current_file',
  '현재 에디터 문서를 현재 파일 경로에 저장합니다. 경로가 없는 새 문서라면 앱의 Save As 흐름을 사용합니다.',
  {},
  safeToolHandler('save_current_file', async () => textResult(await apiRequest('POST', '/document/save', {}))),
);

server.tool(
  'list_surfaces',
  '현재 문서에서 MCP가 JSON Pointer로 읽고 편집할 수 있는 top-level surface 목록과 hash를 반환합니다.',
  {},
  async () => textResult(await apiRequest('GET', '/surfaces')),
);

server.tool(
  'read_surface',
  '현재 문서의 임의 JSON surface를 JSON Pointer path로 읽습니다. 예: "/", "/regex/0/comment", "/alternateGreetings/0". 새 LLM 흐름에서는 root 덤프 대신 facade read_content의 bounded overview 또는 좁은 path selector를 우선 사용하세요.',
  {
    path: z.string().optional().describe('JSON Pointer path. 생략 또는 빈 문자열이면 전체 문서 root를 읽습니다.'),
  },
  async ({ path }) => textResult(await apiRequest('POST', '/surface/read', { path })),
);

server.tool(
  'patch_surface',
  '현재 문서의 임의 JSON surface에 JSON Patch(add/replace/remove)를 적용합니다. dry_run과 expected_hash를 지원합니다. 사용자 확인 필요.',
  {
    operations: z
      .array(
        z.object({
          op: z.enum(['add', 'replace', 'remove']).describe('JSON Patch operation'),
          path: z.string().describe('JSON Pointer path'),
          value: z.unknown().optional().describe('add/replace에서 쓸 값'),
        }),
      )
      .min(1)
      .max(100)
      .describe('JSON Patch operation 배열'),
    expected_hash: z.string().optional().describe('선택: 전체 현재 문서 hash. 다르면 409로 중단됩니다.'),
    dry_run: z.boolean().optional().describe('true이면 실제 적용 없이 변경 요약과 hash만 반환합니다.'),
  },
  async ({ operations, expected_hash, dry_run }) =>
    textResult(await apiRequest('POST', '/surface/patch', { operations, expected_hash, dry_run })),
);

server.tool(
  'replace_in_surface',
  '현재 문서의 JSON surface 아래 모든 문자열 값에서 텍스트를 치환합니다. 대형 구조를 직접 덤프하지 않고 path 단위로 처리합니다. 사용자 확인 필요.',
  {
    path: z.string().describe('JSON Pointer path. 예: "/regex/0", "/lorebook/3/content"'),
    find: z.string().describe('찾을 문자열 또는 regex 패턴'),
    replace: z.string().optional().describe('바꿀 문자열. 생략 시 빈 문자열'),
    regex: z.boolean().optional().describe('정규식 모드 여부'),
    flags: z.string().optional().describe('정규식 flags'),
    dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 매치 수만 반환합니다.'),
  },
  async ({ path, find, replace, regex, flags, dry_run }) =>
    textResult(await apiRequest('POST', '/surface/replace', { path, find, replace, regex, flags, dry_run })),
);

server.tool(
  'external_read_surface',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 임의 JSON surface를 JSON Pointer path로 읽습니다. current UI 문서와 같은 파일은 거부됩니다. 새 LLM 흐름에서는 root 덤프 대신 facade read_content의 bounded overview 또는 좁은 path selector를 우선 사용하세요.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    path: z.string().optional().describe('JSON Pointer path. 생략 또는 빈 문자열이면 전체 문서 root를 읽습니다.'),
  },
  async ({ file_path, path }) => textResult(await apiRequest('POST', '/external/surface/read', { file_path, path })),
);

server.tool(
  'external_patch_surface',
  '에디터에 열지 않은 .charx/.risum/.risup 파일의 임의 JSON surface에 JSON Patch(add/replace/remove)를 적용합니다. current UI 문서와 같은 파일은 거부됩니다. 사용자 확인 필요.',
  {
    file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    operations: z
      .array(
        z.object({
          op: z.enum(['add', 'replace', 'remove']).describe('JSON Patch operation'),
          path: z.string().describe('JSON Pointer path'),
          value: z.unknown().optional().describe('add/replace에서 쓸 값'),
        }),
      )
      .min(1)
      .max(100)
      .describe('JSON Patch operation 배열'),
    expected_hash: z.string().optional().describe('선택: 전체 외부 문서 hash. 다르면 409로 중단됩니다.'),
    dry_run: z.boolean().optional().describe('true이면 실제 저장 없이 변경 요약과 hash만 반환합니다.'),
  },
  async ({ file_path, operations, expected_hash, dry_run }) =>
    textResult(await apiRequest('POST', '/external/surface/patch', { file_path, operations, expected_hash, dry_run })),
);

server.tool(
  'replace_in_field',
  '필드의 내용에서 문자열 치환을 수행합니다. 대형 필드를 전체 읽지 않고 서버에서 직접 처리합니다. 문자열 타입 필드만 지원 (배열/boolean/number/triggerScripts 제외). regex: true + flags 옵션으로 정규식 지원. ⚠️ 검색만 하려면 search_in_field를 사용하세요 — replace를 생략하면 빈 문자열(=삭제)이 적용됩니다. dry_run: true로 실제 변경 없이 매치 결과만 미리 확인 가능. 사용자 확인 필요.',
  {
    field: z.string().describe('필드 이름 (예: globalNote, description, defaultVariables, lua 등)'),
    find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
    replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
    regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
    flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
    dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 매치 수와 전후 컨텍스트만 반환 (기본: false)'),
  },
  async ({ field, find, replace, regex, flags, dry_run }) =>
    textResult(
      await apiRequest('POST', `/field/${encodeURIComponent(field)}/replace`, {
        find,
        replace,
        regex,
        flags,
        dry_run,
      }),
    ),
);

server.tool(
  'insert_in_field',
  '필드의 내용에 텍스트를 삽입합니다. 대형 필드를 전체 읽지 않고 서버에서 직접 처리합니다. 문자열 타입 필드만 지원 (배열/boolean/number/triggerScripts 제외). 사용자 확인 필요.',
  {
    field: z.string().describe('필드 이름 (예: defaultVariables, globalNote, description, lua 등)'),
    content: z.string().describe('삽입할 텍스트'),
    position: z
      .enum(['end', 'start', 'after', 'before'])
      .optional()
      .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
    anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
  },
  async ({ field, content, position, anchor }) =>
    textResult(await apiRequest('POST', `/field/${encodeURIComponent(field)}/insert`, { content, position, anchor })),
);

server.tool(
  'replace_in_field_batch',
  '하나의 필드에 여러 치환을 순차적으로 적용합니다. 이전 치환 결과 위에 다음 치환이 적용되며, 한 번의 확인으로 모두 처리합니다. 동일 필드에서 10명 캐릭터 태그를 각각 바꾸는 등의 대량 작업에 유용. dry_run으로 미리보기 가능. 사용자 확인 필요.',
  {
    field: z.string().describe('필드 이름 (예: firstMessage, globalNote, description 등)'),
    replacements: z
      .array(
        z.object({
          find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
          replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
          regex: z.boolean().optional().describe('정규식 모드 여부'),
          flags: z.string().optional().describe('정규식 플래그 (기본: "g")'),
        }),
      )
      .max(50)
      .describe('순차 적용할 치환 배열 [{find, replace, regex?, flags?}] (최대 50개)'),
    dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 매치 수만 반환 (기본: false)'),
  },
  async ({ field, replacements, dry_run }) =>
    textResult(
      await apiRequest('POST', `/field/${encodeURIComponent(field)}/batch-replace`, { replacements, dry_run }),
    ),
);

server.tool(
  'search_in_field',
  '필드 내용에서 문자열을 검색하고 주변 컨텍스트와 함께 반환합니다 — 수정 없는 읽기 전용입니다. 대상 필드를 이미 알고 있을 때 사용하세요. 필드가 아직 불명확하면 search_all_fields를 먼저 사용하세요. 정규식도 지원합니다.',
  {
    field: z.string().describe('필드 이름 (예: globalNote, firstMessage, description, lua 등)'),
    query: z.string().describe('검색할 문자열 (또는 regex: true일 때 정규식 패턴)'),
    context_chars: z.number().optional().describe('매치 전후에 표시할 문자 수 (기본: 100, 최대: 500)'),
    regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
    flags: z.string().optional().describe('정규식 플래그 (기본: "gi"). regex: true일 때만 사용'),
    max_matches: z.number().optional().describe('최대 반환 매치 수 (기본: 20, 최대: 100)'),
  },
  async ({ field, query, context_chars, regex, flags, max_matches }) =>
    textResult(
      await apiRequest('POST', `/field/${encodeURIComponent(field)}/search`, {
        query,
        context_chars,
        regex,
        flags,
        max_matches,
      }),
    ),
);

server.tool(
  'read_field_range',
  '대형 필드의 특정 구간만 읽습니다. 전체를 읽지 않고 문자 오프셋과 길이로 원하는 부분만 반환. search_in_field의 position과 연계하여 사용 가능.',
  {
    field: z.string().describe('필드 이름 (예: firstMessage, globalNote, description 등)'),
    offset: z.number().optional().describe('시작 문자 오프셋 (기본: 0)'),
    length: z.number().optional().describe('읽을 문자 수 (기본: 2000, 최대: 10000)'),
  },
  async ({ field, offset, length }) => {
    const params = new URLSearchParams();
    if (offset !== undefined) params.set('offset', String(offset));
    if (length !== undefined) params.set('length', String(length));
    const qs = params.toString();
    return textResult(await apiRequest('GET', `/field/${encodeURIComponent(field)}/range${qs ? `?${qs}` : ''}`));
  },
);

server.tool(
  'replace_block_in_field',
  '필드에서 두 앵커 사이의 멀티라인 블록을 교체합니다. start_anchor와 end_anchor 사이의 텍스트를 새 내용으로 치환. 여러 줄에 걸친 블록도 안전하게 교체 가능. include_anchors: false로 앵커 자체는 유지하고 사이 내용만 교체 가능. dry_run 지원. 사용자 확인 필요.',
  {
    field: z.string().describe('필드 이름 (예: firstMessage, globalNote, description 등)'),
    start_anchor: z.string().describe('블록 시작 앵커 문자열 (멀티라인 가능)'),
    end_anchor: z.string().describe('블록 끝 앵커 문자열 (멀티라인 가능)'),
    content: z.string().optional().describe('새 블록 내용 (기본: 빈 문자열 = 블록 삭제)'),
    include_anchors: z.boolean().optional().describe('true(기본): 앵커 포함 전체 교체, false: 앵커 사이 내용만 교체'),
    dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 미리보기만 반환 (기본: false)'),
  },
  async ({ field, start_anchor, end_anchor, content, include_anchors, dry_run }) =>
    textResult(
      await apiRequest('POST', `/field/${encodeURIComponent(field)}/block-replace`, {
        start_anchor,
        end_anchor,
        content,
        include_anchors,
        dry_run,
      }),
    ),
);

server.tool(
  'write_field_batch',
  '여러 작은 필드의 내용을 한 번에 수정합니다. 한 번의 확인으로 모든 필드를 동시에 업데이트합니다. ⚠️ lua/css/alternateGreetings/triggerScripts와 `.risup` promptTemplate/formatingOrder 같은 구조화 표면은 전용 도구를 우선 사용하세요. groupOnlyGreetings 및 비권장/예약/레거시 필드는 읽기 전용입니다. characterVersion + defaultVariables 같이 여러 소형 필드를 함께 바꿀 때 유용합니다. 사용자 확인 필요.',
  {
    entries: z
      .array(
        z.object({
          field: z.string().describe('필드 이름'),
          content: z.any().describe('새로운 내용 (문자열/boolean/number/배열 — 필드 타입에 맞게)'),
        }),
      )
      .max(20)
      .describe('수정할 필드 배열 [{field, content}, ...] (최대 20개)'),
  },
  safeToolHandler('write_field_batch', async ({ entries }) =>
    textResult(await apiRequest('POST', '/field/batch-write', { entries })),
  ),
);

server.tool(
  'snapshot_field',
  '필드의 현재 값을 스냅샷으로 저장합니다. 대형 필드 편집 전 안전망으로 사용. 필드당 최대 10개 스냅샷 보관 (초과 시 오래된 것부터 삭제). 파일 새로 로드 시 초기화됩니다.',
  {
    field: z.string().describe('스냅샷을 저장할 필드 이름 (예: firstMessage, globalNote 등)'),
  },
  async ({ field }) => textResult(await apiRequest('POST', `/field/${encodeURIComponent(field)}/snapshot`)),
);

server.tool(
  'list_snapshots',
  '필드의 저장된 스냅샷 목록을 확인합니다. 각 스냅샷의 ID, 시점, 크기를 반환.',
  {
    field: z.string().describe('스냅샷 목록을 확인할 필드 이름'),
  },
  async ({ field }) => textResult(await apiRequest('GET', `/field/${encodeURIComponent(field)}/snapshots`)),
);

server.tool(
  'session_status',
  '현재 MCP 세션 상태를 읽습니다. 열린 문서 경로/타입/이름, renderer dirty 상태, autosave 설정, recovery 메타데이터, 필드 스냅샷 요약, 로드된 참고 자료(references) 목록을 한 번에 확인할 수 있습니다. 메인 파일이 열려 있지 않아도 동작하며, 참고 자료가 있으면 list_references로 드릴다운하세요. 변경 전 상황 파악용 읽기 전용 도구입니다.',
  {},
  async () => {
    const session = await apiRequest('GET', '/session/status');
    return textResult(isApiError(session) ? session : withMergedRuntimeMetadata(session));
  },
);

server.tool(
  'restore_snapshot',
  '스냅샷으로 필드를 복원합니다. list_snapshots로 스냅샷 ID를 확인한 뒤 사용. 사용자 확인 필요.',
  {
    field: z.string().describe('복원할 필드 이름'),
    snapshot_id: z.string().describe('복원할 스냅샷 ID (list_snapshots 결과 참조)'),
  },
  async ({ field, snapshot_id }) =>
    textResult(await apiRequest('POST', `/field/${encodeURIComponent(field)}/restore`, { snapshot_id })),
);

server.tool(
  'get_field_stats',
  '필드의 통계 정보를 반환합니다 (문자 수, 행 수, 단어 수, CBS 태그 수, HTML 태그 수 등). 읽기 전용.',
  {
    field: z.string().describe('통계를 확인할 필드 이름'),
  },
  async ({ field }) => textResult(await apiRequest('GET', `/field/${encodeURIComponent(field)}/stats`)),
);

server.tool(
  'search_all_fields',
  '모든 텍스트 필드에서 한 번에 검색합니다. 어떤 필드에 텍스트가 있는지 아직 모를 때 사용하는 cross-field scan 도구입니다. 결과를 확인한 뒤에는 search_in_field, read_field, 또는 구조화 표면 전용 도구로 좁혀 가세요. 읽기 전용입니다.',
  {
    query: z.string().describe('검색할 문자열 (또는 regex: true일 때 정규식 패턴)'),
    regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
    flags: z.string().optional().describe('정규식 플래그 (기본: "gi"). regex: true일 때만 사용'),
    include_lorebook: z.boolean().optional().describe('로어북 content도 검색할지 (기본: true)'),
    include_greetings: z.boolean().optional().describe('alternateGreetings/groupOnlyGreetings도 검색할지 (기본: true)'),
    context_chars: z.number().optional().describe('매치 전후에 표시할 문자 수 (기본: 60, 최대: 300)'),
    max_matches_per_field: z.number().optional().describe('필드당 최대 반환 매치 수 (기본: 5, 최대: 20)'),
  },
  async ({ query, regex, flags, include_lorebook, include_greetings, context_chars, max_matches_per_field }) =>
    textResult(
      await apiRequest('POST', '/search-all', {
        query,
        regex,
        flags,
        include_lorebook,
        include_greetings,
        context_chars,
        max_matches_per_field,
      }),
    ),
);

// ===== Lorebook Tools =====

server.tool(
  'list_lorebook',
  '로어북 항목 목록을 확인합니다 (인덱스, 코멘트, 키, 활성화 상태, content 크기, 폴더, 미리보기). 응답에 폴더 요약(folders)도 포함됩니다. 항목이 수백 개일 수 있으므로 folder 또는 filter 파라미터로 범위를 좁히세요.',
  {
    filter: z.string().optional().describe('검색 키워드 (comment, key에서 검색). 생략 시 전체 목록 반환'),
    folder: z.string().optional().describe('폴더 UUID로 필터 (예: "folder:xxxx" 또는 UUID만). 생략 시 전체 반환'),
    content_filter: z.string().optional().describe('본문(content) 검색 키워드. 대소문자 무시. filter와 AND 결합'),
    content_filter_not: z.string().optional().describe('본문(content)에 이 키워드가 없는 항목만 필터. 대소문자 무시'),
    preview_length: z.number().optional().describe('content 미리보기 길이 (기본 150, 0=비활성, 최대 500)'),
  },
  async ({ filter, folder, content_filter, content_filter_not, preview_length }) => {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (folder) params.set('folder', folder);
    if (content_filter) params.set('content_filter', content_filter);
    if (content_filter_not) params.set('content_filter_not', content_filter_not);
    if (preview_length !== undefined) params.set('preview_length', String(preview_length));
    const qs = params.toString();
    return textResult(await apiRequest('GET', qs ? `/lorebook?${qs}` : '/lorebook'));
  },
);

server.tool(
  'read_lorebook',
  '특정 인덱스의 로어북 항목 전체 데이터를 읽습니다.',
  { index: z.number().describe('로어북 항목 인덱스') },
  async ({ index }) => textResult(await apiRequest('GET', `/lorebook/${index}`)),
);

server.tool(
  'read_lorebook_batch',
  '여러 로어북 항목을 한 번에 읽습니다. read_lorebook을 반복 호출하는 대신 이 도구를 사용하세요.',
  {
    indices: z.array(z.number()).max(50).describe('읽을 로어북 항목 인덱스 배열 (최대 50개)'),
    fields: z
      .array(z.string())
      .optional()
      .describe('반환할 필드 목록 (예: ["content", "comment"]). 미지정 시 전체 필드 반환'),
  },
  async ({ indices, fields }) => textResult(await apiRequest('POST', '/lorebook/batch', { indices, fields })),
);

server.tool(
  'read_lorebook_by_id',
  '계산된 안정 id로 로어북 항목을 읽습니다. 새 LLM 흐름에서는 facade read_content selector { family: "lorebook", id }를 우선 사용하세요.',
  { id: z.string().min(1).describe('list_lorebook 응답의 id') },
  async ({ id }) => textResult(await apiRequest('GET', `/lorebook/by-id/${encodeURIComponent(id)}`)),
);

server.tool(
  'write_lorebook_batch',
  '여러 로어북 항목을 한 번에 수정합니다. 변경 사항 요약을 보여주고 한 번의 확인으로 전부 적용합니다. 각 항목에 optional expected_comment를 넣으면 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    entries: z
      .array(
        z.object({
          index: z.number().describe('로어북 항목 인덱스'),
          data: z.record(z.string(), z.unknown()).describe('수정할 데이터'),
          expected_comment: z
            .string()
            .optional()
            .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
        }),
      )
      .max(50)
      .describe('수정할 항목 배열 [{index, data}, ...] (최대 50개)'),
  },
  safeToolHandler('write_lorebook_batch', async ({ entries }) =>
    textResult(await apiRequest('POST', '/lorebook/batch-write', { entries })),
  ),
);

server.tool(
  'write_lorebook_by_id_batch',
  '계산된 안정 id로 여러 로어북 항목을 한 번에 수정합니다. 충돌 시 index + expected_comment 도구로 fallback하세요. 사용자 확인 필요.',
  {
    entries: z
      .array(
        z.object({
          id: z.string().min(1),
          data: z.record(z.string(), z.unknown()),
          expected_comment: z.string().optional(),
        }),
      )
      .max(50),
  },
  async ({ entries }) => textResult(await apiRequest('POST', '/lorebook/batch-write-by-id', { entries })),
);

server.tool(
  'diff_lorebook',
  '현재 파일의 로어북 항목과 참고 자료의 로어북 항목을 비교합니다. 필드별 차이점과 content의 라인 단위 변경 사항을 반환합니다.',
  {
    index: z.number().describe('현재 파일의 로어북 항목 인덱스'),
    refIndex: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    refEntryIndex: z.number().describe('참고 파일의 로어북 항목 인덱스'),
  },
  async ({ index, refIndex, refEntryIndex }) =>
    textResult(await apiRequest('POST', '/lorebook/diff', { index, refIndex, refEntryIndex })),
);

server.tool(
  'validate_lorebook_keys',
  '로어북 키의 일반적인 문제를 검증합니다. 후행 쉼표, 불필요한 공백, 빈 세그먼트, 중복 키 등을 탐지합니다.',
  {},
  async () => textResult(await apiRequest('GET', '/lorebook/validate')),
);

server.tool(
  'clone_lorebook',
  '기존 로어북 항목을 복제합니다. overrides로 복제본의 필드를 변경할 수 있습니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('복제할 원본 로어북 항목 인덱스'),
    expected_comment: z
      .string()
      .optional()
      .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
    overrides: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('복제본에 적용할 필드 오버라이드 (예: {comment: "새이름", key: "새키"})'),
  },
  async ({ index, expected_comment, overrides }) =>
    textResult(await apiRequest('POST', '/lorebook/clone', { index, expected_comment, overrides })),
);

server.tool(
  'write_lorebook',
  '특정 인덱스의 로어북 항목을 수정합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('로어북 항목 인덱스'),
    data: z.record(z.string(), z.unknown()).describe('수정할 로어북 데이터 (부분 또는 전체)'),
    expected_comment: z
      .string()
      .optional()
      .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
  },
  async ({ index, data, expected_comment }) =>
    textResult(
      await apiRequest('POST', `/lorebook/${index}`, { ...(data as Record<string, unknown>), expected_comment }),
    ),
);

server.tool(
  'write_lorebook_by_id',
  '계산된 안정 id로 로어북 항목을 수정합니다. 새 LLM 흐름에서는 facade preview_edit/apply_edit selector { family: "lorebook", id }를 우선 사용하세요. 사용자 확인 필요.',
  {
    id: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
    expected_comment: z.string().optional(),
  },
  async ({ id, data, expected_comment }) =>
    textResult(await apiRequest('POST', `/lorebook/by-id/${encodeURIComponent(id)}`, { data, expected_comment })),
);

server.tool(
  'add_lorebook',
  '새 로어북 항목을 추가합니다. 사용자 확인 필요.',
  { data: z.record(z.string(), z.unknown()).describe('로어북 항목 데이터 (key, comment, content 등)') },
  safeToolHandler('add_lorebook', async ({ data }) =>
    textResult(await apiRequest('POST', '/lorebook/add', data as Record<string, unknown>)),
  ),
);

server.tool(
  'add_lorebook_batch',
  '여러 로어북 항목을 한 번에 추가합니다. 최대 50개. 단일 확인으로 전부 추가합니다. 사용자 확인 필요.',
  {
    entries: z
      .array(z.record(z.string(), z.unknown()))
      .describe('로어북 항목 데이터 배열 [{comment, key, content, ...}, ...] (최대 50개)'),
  },
  async ({ entries }) =>
    textResult(
      await apiRequest('POST', '/lorebook/batch-add', {
        entries: entries as Array<Record<string, unknown>>,
      }),
    ),
);

server.tool(
  'delete_lorebook',
  '특정 인덱스의 로어북 항목을 삭제합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('삭제할 로어북 항목 인덱스'),
    expected_comment: z
      .string()
      .optional()
      .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
  },
  async ({ index, expected_comment }) =>
    textResult(await apiRequest('POST', `/lorebook/${index}/delete`, { expected_comment })),
);

server.tool(
  'delete_lorebook_by_id',
  '계산된 안정 id로 로어북 항목을 삭제합니다. 새 LLM 흐름에서는 facade preview_edit/apply_edit selector { family: "lorebook", id }를 우선 사용하세요. 사용자 확인 필요.',
  {
    id: z.string().min(1),
    expected_comment: z.string().optional(),
  },
  async ({ id, expected_comment }) =>
    textResult(await apiRequest('POST', `/lorebook/by-id/${encodeURIComponent(id)}/delete`, { expected_comment })),
);

server.tool(
  'batch_delete_lorebook',
  '여러 로어북 항목을 한 번에 삭제합니다. 인덱스를 내림차순 처리하여 시프트 문제를 방지합니다. optional expected_comments를 함께 보내면 stale index를 감지할 수 있습니다. 최대 50개. 사용자 확인 필요.',
  {
    indices: z.array(z.number()).describe('삭제할 로어북 항목 인덱스 배열 (예: [0, 2, 5])'),
    expected_comments: z
      .array(z.string())
      .max(50)
      .optional()
      .describe('선택: indices와 같은 순서의 현재 comment 배열. 다르면 409 Conflict로 중단됩니다.'),
  },
  async ({ indices, expected_comments }) =>
    textResult(await apiRequest('POST', '/lorebook/batch-delete', { indices, expected_comments })),
);

server.tool(
  'batch_delete_lorebook_by_id',
  '계산된 안정 id 배열로 여러 로어북 항목을 삭제합니다. id 충돌 시 index + expected_comment 도구로 fallback하세요. 사용자 확인 필요.',
  {
    ids: z.array(z.string().min(1)).max(50),
    expected_comments: z.array(z.string()).max(50).optional(),
  },
  async ({ ids, expected_comments }) =>
    textResult(await apiRequest('POST', '/lorebook/batch-delete-by-id', { ids, expected_comments })),
);

server.tool(
  'replace_in_lorebook',
  '로어북 항목의 필드에서 문자열 치환을 수행합니다. 대용량 항목도 전체를 읽지 않고 서버에서 직접 처리합니다. field 파라미터로 content 외에 comment, key, secondkey도 치환 가능. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('로어북 항목 인덱스'),
    find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
    replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
    regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false = 일반 문자열 매칭)'),
    flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
    field: z
      .enum(['content', 'comment', 'key', 'secondkey'])
      .optional()
      .describe('치환 대상 필드 (기본: "content"). comment/key/secondkey도 지원'),
    expected_comment: z
      .string()
      .optional()
      .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
  },
  async ({ index, find, replace, regex, flags, field, expected_comment }) =>
    textResult(
      await apiRequest('POST', `/lorebook/${index}/replace`, { find, replace, regex, flags, field, expected_comment }),
    ),
);

server.tool(
  'insert_in_lorebook',
  '로어북 항목의 content에 텍스트를 삽입합니다. 전체를 읽지 않고 특정 위치에 추가합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('로어북 항목 인덱스'),
    content: z.string().describe('삽입할 텍스트'),
    position: z
      .enum(['end', 'start', 'after', 'before'])
      .optional()
      .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
    anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
    expected_comment: z
      .string()
      .optional()
      .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
  },
  async ({ index, content, position, anchor, expected_comment }) =>
    textResult(await apiRequest('POST', `/lorebook/${index}/insert`, { content, position, anchor, expected_comment })),
);

server.tool(
  'replace_block_in_lorebook',
  '로어북 항목에서 두 앵커 사이의 멀티라인 블록을 교체합니다. 여러 줄에 걸친 텍스트 블록도 안전하게 교체 가능. field 옵션으로 content(기본)/comment/key/secondkey 대상 선택. dry_run 지원. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('로어북 항목 인덱스'),
    start_anchor: z.string().describe('블록 시작 앵커 문자열 (멀티라인 가능)'),
    end_anchor: z.string().describe('블록 끝 앵커 문자열 (멀티라인 가능)'),
    content: z.string().optional().describe('새 블록 내용 (기본: 빈 문자열 = 블록 삭제)'),
    include_anchors: z.boolean().optional().describe('true(기본): 앵커 포함 전체 교체, false: 앵커 사이 내용만 교체'),
    field: z.enum(['content', 'comment', 'key', 'secondkey']).optional().describe('치환 대상 필드 (기본: "content")'),
    dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 미리보기만 반환 (기본: false)'),
    expected_comment: z
      .string()
      .optional()
      .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
  },
  async ({ index, start_anchor, end_anchor, content, include_anchors, field, dry_run, expected_comment }) =>
    textResult(
      await apiRequest('POST', `/lorebook/${index}/block-replace`, {
        start_anchor,
        end_anchor,
        content,
        include_anchors,
        field,
        dry_run,
        expected_comment,
      }),
    ),
);

server.tool(
  'replace_in_lorebook_batch',
  '여러 로어북 항목의 content에서 문자열 치환을 일괄 수행합니다. 각 항목별 매치 수를 계산하고 한 번의 확인으로 전부 적용합니다. dry_run으로 실제 변경 없이 매치 결과를 미리 확인할 수 있고, 각 항목에 optional expected_comment를 넣으면 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    replacements: z
      .array(
        z.object({
          index: z.number().describe('로어북 항목 인덱스'),
          find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
          replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
          regex: z.boolean().optional().describe('정규식 모드 여부'),
          flags: z.string().optional().describe('정규식 플래그 (기본: "g")'),
          expected_comment: z
            .string()
            .optional()
            .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
        }),
      )
      .max(50)
      .describe('치환 작업 배열 [{index, find, replace, regex?, flags?}] (최대 50개)'),
    dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 매치 결과만 반환합니다 (기본: false)'),
  },
  async ({ replacements, dry_run }) =>
    textResult(await apiRequest('POST', '/lorebook/batch-replace', { replacements, dry_run })),
);

server.tool(
  'replace_across_all_lorebook',
  '모든 로어북 항목에서 특정 문자열을 한 번에 치환합니다. list_lorebook → replace_in_lorebook 반복 호출 대신 1회로 처리. field 옵션으로 content/comment/key/secondkey 중 대상 선택 가능. dry_run으로 미리보기 가능. 사용자 확인 필요.',
  {
    find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
    replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
    regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
    flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
    field: z.enum(['content', 'comment', 'key', 'secondkey']).optional().describe('치환 대상 필드 (기본: "content")'),
    dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 매치 항목만 반환 (기본: false)'),
  },
  async ({ find, replace, regex, flags, field, dry_run }) =>
    textResult(await apiRequest('POST', '/lorebook/replace-all', { find, replace, regex, flags, field, dry_run })),
);

server.tool(
  'insert_in_lorebook_batch',
  '여러 로어북 항목의 content에 텍스트를 일괄 삽입합니다. 한 번의 확인으로 전부 적용합니다. 각 항목에 optional expected_comment를 넣으면 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    insertions: z
      .array(
        z.object({
          index: z.number().describe('로어북 항목 인덱스'),
          content: z.string().describe('삽입할 텍스트'),
          position: z
            .enum(['end', 'start', 'after', 'before'])
            .optional()
            .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
          anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
          expected_comment: z
            .string()
            .optional()
            .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
        }),
      )
      .max(50)
      .describe('삽입 작업 배열 [{index, content, position?, anchor?}] (최대 50개)'),
  },
  async ({ insertions }) => textResult(await apiRequest('POST', '/lorebook/batch-insert', { insertions })),
);

// ===== Regex Tools =====

server.tool(
  'list_regex',
  '정규식 스크립트 항목 목록을 확인합니다 (인덱스, comment, type, findSize, replaceSize).',
  {},
  async () => textResult(await apiRequest('GET', '/regex')),
);

server.tool(
  'read_regex',
  '특정 인덱스의 정규식 항목을 읽습니다.',
  { index: z.number().describe('정규식 항목 인덱스') },
  async ({ index }) => textResult(await apiRequest('GET', `/regex/${index}`)),
);

server.tool(
  'read_regex_batch',
  '여러 정규식 항목을 한 번에 읽습니다. read_regex를 반복 호출하는 대신 이 도구를 사용하세요.',
  {
    indices: z.array(z.number()).max(50).describe('읽을 정규식 항목 인덱스 배열 (최대 50개)'),
  },
  async ({ indices }) => textResult(await apiRequest('POST', '/regex/batch', { indices })),
);

const regexIdentitySchema = z.object({
  comment: z.string().optional(),
  preview: z.string().optional(),
  hash: z.string().optional(),
});

server.tool(
  'read_regex_by_identity',
  'comment + preview/hash identity로 정규식 항목을 읽습니다. 새 LLM 흐름에서는 facade read_content selector { family: "regex", identity }를 우선 사용하세요.',
  { identity: regexIdentitySchema },
  async ({ identity }) => textResult(await apiRequest('POST', '/regex/by-identity/read', { identity })),
);

server.tool(
  'write_regex',
  '특정 인덱스의 정규식 항목을 수정합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('정규식 항목 인덱스'),
    data: z.record(z.string(), z.unknown()).describe('수정할 정규식 데이터'),
    expected_comment: z.string().optional().describe('선택사항: list_regex에서 본 현재 comment와 다르면 409 반환'),
  },
  async ({ index, data, expected_comment }) =>
    textResult(await apiRequest('POST', `/regex/${index}`, { ...(data as Record<string, unknown>), expected_comment })),
);

server.tool(
  'write_regex_by_identity',
  'comment + preview/hash identity로 정규식 항목을 수정합니다. 중복 comment면 실패합니다. facade preview_edit/apply_edit identity selector를 우선 사용하세요. 사용자 확인 필요.',
  {
    identity: regexIdentitySchema,
    data: z.record(z.string(), z.unknown()),
    expected_comment: z.string().optional(),
  },
  async ({ identity, data, expected_comment }) =>
    textResult(await apiRequest('POST', '/regex/by-identity/write', { identity, data, expected_comment })),
);

server.tool(
  'add_regex',
  '새 정규식 항목을 추가합니다. 사용자 확인 필요.',
  { data: z.record(z.string(), z.unknown()).describe('정규식 항목 데이터 (comment, type, find, replace, flag)') },
  async ({ data }) => textResult(await apiRequest('POST', '/regex/add', data as Record<string, unknown>)),
);

server.tool(
  'replace_in_regex',
  '정규식 항목의 find 또는 replace 필드에서 문자열 치환을 수행합니다. 대형 regex 필드를 전체 읽지 않고 서버에서 직접 처리합니다. regex: true + flags 옵션으로 정규식 지원. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('정규식 항목 인덱스'),
    field: z.enum(['find', 'replace']).describe('편집할 필드: "find" (IN 패턴) 또는 "replace" (OUT 치환 텍스트)'),
    find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
    replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
    regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
    flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
    expected_comment: z.string().optional().describe('선택사항: list_regex에서 본 현재 comment와 다르면 409 반환'),
  },
  async ({ index, field, find, replace, regex, flags, expected_comment }) =>
    textResult(
      await apiRequest('POST', `/regex/${index}/replace`, { field, find, replace, regex, flags, expected_comment }),
    ),
);

server.tool(
  'insert_in_regex',
  '정규식 항목의 find 또는 replace 필드에 텍스트를 삽입합니다. 대형 regex 필드를 전체 읽지 않고 서버에서 직접 처리합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('정규식 항목 인덱스'),
    field: z.enum(['find', 'replace']).describe('편집할 필드: "find" (IN 패턴) 또는 "replace" (OUT 치환 텍스트)'),
    content: z.string().describe('삽입할 텍스트'),
    position: z
      .enum(['end', 'start', 'after', 'before'])
      .optional()
      .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
    anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
    expected_comment: z.string().optional().describe('선택사항: list_regex에서 본 현재 comment와 다르면 409 반환'),
  },
  async ({ index, field, content, position, anchor, expected_comment }) =>
    textResult(
      await apiRequest('POST', `/regex/${index}/insert`, { field, content, position, anchor, expected_comment }),
    ),
);

server.tool(
  'delete_regex',
  '특정 인덱스의 정규식 항목을 삭제합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('삭제할 정규식 항목 인덱스'),
    expected_comment: z.string().optional().describe('선택사항: list_regex에서 본 현재 comment와 다르면 409 반환'),
  },
  async ({ index, expected_comment }) =>
    textResult(await apiRequest('POST', `/regex/${index}/delete`, { expected_comment })),
);

server.tool(
  'delete_regex_by_identity',
  'comment + preview/hash identity로 정규식 항목을 삭제합니다. 중복 comment면 실패합니다. facade preview_edit/apply_edit identity selector를 우선 사용하세요. 사용자 확인 필요.',
  {
    identity: regexIdentitySchema,
    expected_comment: z.string().optional(),
  },
  async ({ identity, expected_comment }) =>
    textResult(await apiRequest('POST', '/regex/by-identity/delete', { identity, expected_comment })),
);

server.tool(
  'add_regex_batch',
  '여러 정규식 항목을 한 번에 추가합니다. 최대 50개. 단일 확인으로 전부 추가됩니다. 사용자 확인 필요.',
  {
    entries: z
      .array(z.record(z.string(), z.unknown()))
      .max(50)
      .describe('정규식 항목 데이터 배열 [{comment, type, find, replace, flag}, ...] (최대 50개)'),
  },
  async ({ entries }) => textResult(await apiRequest('POST', '/regex/batch-add', { entries })),
);

server.tool(
  'write_regex_batch',
  '여러 정규식 항목을 한 번에 수정합니다. 변경 사항 요약을 보여주고 한 번의 확인으로 전부 적용합니다. 각 항목에 optional expected_comment를 넣으면 stale index를 감지할 수 있습니다. 최대 50개. 사용자 확인 필요.',
  {
    entries: z
      .array(
        z.object({
          index: z.number().describe('정규식 항목 인덱스'),
          data: z.record(z.string(), z.unknown()).describe('수정할 정규식 데이터'),
          expected_comment: z
            .string()
            .optional()
            .describe('선택사항: list_regex에서 본 현재 comment와 다르면 409 반환'),
        }),
      )
      .max(50)
      .describe('수정할 항목 배열 [{index, data}, ...] (최대 50개)'),
  },
  async ({ entries }) => textResult(await apiRequest('POST', '/regex/batch-write', { entries })),
);

// ===== Greeting Tools =====

server.tool(
  'list_greetings',
  '인사말 목록을 확인합니다 (인덱스, 크기, 미리보기 100자). type="alternate"는 추가 첫 메시지(alternateGreetings), type="group"은 그룹 전용 인사말(groupOnlyGreetings). read_field("alternateGreetings") 대신 이 도구를 사용하세요 — 전체 덤프를 방지합니다. filter/content_filter로 특정 키워드가 포함된 인사말만 검색 가능.',
  {
    type: z.enum(['alternate', 'group']).describe('"alternate" (추가 첫 메시지) 또는 "group" (그룹 전용 인사말)'),
    filter: z.string().optional().describe('텍스트 검색 키워드. 대소문자 무시. 인사말 내용에서 검색'),
    content_filter: z.string().optional().describe('본문 검색 키워드 + 매치 컨텍스트(±50자) 반환. 대소문자 무시'),
  },
  async ({ type, filter, content_filter }) => {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (content_filter) params.set('content_filter', content_filter);
    const qs = params.toString();
    return textResult(await apiRequest('GET', qs ? `/greetings/${type}?${qs}` : `/greetings/${type}`));
  },
);

server.tool(
  'read_greeting',
  '특정 인덱스의 인사말 하나를 읽습니다. list_greetings로 목록을 먼저 확인하세요.',
  {
    type: z.enum(['alternate', 'group']).describe('"alternate" 또는 "group"'),
    index: z.number().describe('인사말 인덱스 (list_greetings 결과 참조)'),
  },
  async ({ type, index }) => textResult(await apiRequest('GET', `/greeting/${type}/${index}`)),
);

server.tool(
  'read_greeting_batch',
  '여러 인사말을 한 번에 읽습니다. read_greeting을 반복 호출하는 대신 이 도구를 사용하세요.',
  {
    type: z.enum(['alternate', 'group']).describe('"alternate" 또는 "group"'),
    indices: z.array(z.number()).max(50).describe('읽을 인사말 인덱스 배열 (최대 50개)'),
  },
  async ({ type, indices }) => textResult(await apiRequest('POST', `/greeting/${type}/batch`, { indices })),
);

const greetingIdentitySchema = z.object({
  preview: z.string().optional(),
  hash: z.string().optional(),
});

server.tool(
  'read_greeting_by_hash',
  'preview/hash identity로 인사말을 읽습니다. 새 LLM 흐름에서는 facade read_content selector { family: "greeting", greeting_type, identity }를 우선 사용하세요.',
  {
    type: z.enum(['alternate', 'group']),
    identity: greetingIdentitySchema,
  },
  async ({ type, identity }) => textResult(await apiRequest('POST', `/greeting/${type}/by-hash/read`, { identity })),
);

server.tool(
  'write_greeting',
  '특정 인덱스의 alternate 인사말을 수정합니다. groupOnlyGreetings(type="group")는 deprecated 호환 필드라 읽기 전용입니다. optional expected_preview로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    type: z.enum(['alternate']).describe('"alternate"만 지원. "group"은 읽기 전용'),
    index: z.number().describe('인사말 인덱스'),
    content: z.string().describe('새로운 인사말 텍스트'),
    expected_preview: z.string().optional().describe('선택사항: list_greetings에서 본 현재 preview와 다르면 409 반환'),
  },
  async ({ type, index, content, expected_preview }) =>
    textResult(await apiRequest('POST', `/greeting/${type}/${index}`, { content, expected_preview })),
);

server.tool(
  'write_greeting_by_hash',
  'preview/hash identity로 alternate 인사말을 수정합니다. 같은 identity가 여러 개면 실패합니다. facade preview_edit/apply_edit identity selector를 우선 사용하세요. 사용자 확인 필요.',
  {
    type: z.enum(['alternate']),
    identity: greetingIdentitySchema,
    content: z.string(),
    expected_preview: z.string().optional(),
  },
  async ({ type, identity, content, expected_preview }) =>
    textResult(await apiRequest('POST', `/greeting/${type}/by-hash/write`, { identity, content, expected_preview })),
);

server.tool(
  'add_greeting',
  '새 alternate 인사말을 추가합니다. groupOnlyGreetings(type="group")는 deprecated 호환 필드라 읽기 전용입니다. 사용자 확인 필요.',
  {
    type: z.enum(['alternate']).describe('"alternate"만 지원. "group"은 읽기 전용'),
    content: z.string().describe('인사말 텍스트'),
  },
  async ({ type, content }) => textResult(await apiRequest('POST', `/greeting/${type}/add`, { content })),
);

server.tool(
  'delete_greeting',
  '특정 인덱스의 alternate 인사말을 삭제합니다. groupOnlyGreetings(type="group")는 deprecated 호환 필드라 읽기 전용입니다. optional expected_preview로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    type: z.enum(['alternate']).describe('"alternate"만 지원. "group"은 읽기 전용'),
    index: z.number().describe('삭제할 인사말 인덱스'),
    expected_preview: z.string().optional().describe('선택사항: list_greetings에서 본 현재 preview와 다르면 409 반환'),
  },
  async ({ type, index, expected_preview }) =>
    textResult(await apiRequest('POST', `/greeting/${type}/${index}/delete`, { expected_preview })),
);

server.tool(
  'delete_greeting_by_hash',
  'preview/hash identity로 alternate 인사말을 삭제합니다. 같은 identity가 여러 개면 실패합니다. facade preview_edit/apply_edit identity selector를 우선 사용하세요. 사용자 확인 필요.',
  {
    type: z.enum(['alternate']),
    identity: greetingIdentitySchema,
    expected_preview: z.string().optional(),
  },
  async ({ type, identity, expected_preview }) =>
    textResult(await apiRequest('POST', `/greeting/${type}/by-hash/delete`, { identity, expected_preview })),
);

server.tool(
  'batch_delete_greeting',
  '여러 alternate 인사말을 한 번에 삭제합니다. groupOnlyGreetings(type="group")는 deprecated 호환 필드라 읽기 전용입니다. 인덱스를 내림차순 처리하여 시프트 문제를 방지합니다. optional expected_previews를 함께 보내면 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    type: z.enum(['alternate']).describe('"alternate"만 지원. "group"은 읽기 전용'),
    indices: z.array(z.number()).describe('삭제할 인사말 인덱스 배열 (예: [0, 2, 5])'),
    expected_previews: z
      .array(z.string())
      .optional()
      .describe(
        '선택사항: indices와 같은 순서/길이의 preview 배열. list_greetings의 preview를 그대로 넣으면 stale index 감지',
      ),
  },
  async ({ type, indices, expected_previews }) =>
    textResult(await apiRequest('POST', `/greeting/${type}/batch-delete`, { indices, expected_previews })),
);

server.tool(
  'batch_write_greeting',
  '여러 alternate 인사말을 한 번에 수정합니다. groupOnlyGreetings(type="group")는 deprecated 호환 필드라 읽기 전용입니다. 변경 사항 요약을 보여주고 한 번의 확인으로 전부 적용합니다. 각 항목에 optional expected_preview를 넣으면 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    type: z.enum(['alternate']).describe('"alternate"만 지원. "group"은 읽기 전용'),
    writes: z
      .array(
        z.object({
          index: z.number().describe('인사말 인덱스'),
          content: z.string().describe('새로운 인사말 텍스트'),
          expected_preview: z
            .string()
            .optional()
            .describe('선택사항: list_greetings에서 본 현재 preview와 다르면 409 반환'),
        }),
      )
      .max(50)
      .describe('수정할 인사말 배열 [{index, content}, ...] (최대 50개)'),
  },
  async ({ type, writes }) => textResult(await apiRequest('POST', `/greeting/${type}/batch-write`, { writes })),
);

server.tool(
  'reorder_greetings',
  '인사말의 순서를 변경합니다. 현재 배열 크기와 동일한 길이의 인덱스 배열을 전달하세요. 사용자 확인 필요.',
  {
    type: z.enum(['alternate', 'group']).describe('"alternate" 또는 "group"'),
    order: z.array(z.number()).describe('새 순서 (예: [2,0,1,3] = 기존 2번을 첫째로, 0번을 둘째로...)'),
  },
  async ({ type, order }) => textResult(await apiRequest('POST', `/greeting/${type}/reorder`, { order })),
);

// ===== Trigger Tools =====

server.tool(
  'list_triggers',
  '트리거 스크립트 목록을 확인합니다 (인덱스, comment, type, conditionCount, effectCount, lowLevelAccess). read_field("triggerScripts") 대신 이 도구를 사용하세요 — 전체 JSON 덤프를 방지합니다.',
  {},
  async () => textResult(await apiRequest('GET', '/triggers')),
);

server.tool(
  'read_trigger',
  '특정 인덱스의 트리거 스크립트를 읽습니다. list_triggers로 목록을 먼저 확인하세요.',
  { index: z.number().describe('트리거 인덱스 (list_triggers 결과 참조)') },
  async ({ index }) => textResult(await apiRequest('GET', `/trigger/${index}`)),
);

server.tool(
  'read_trigger_batch',
  '여러 트리거 스크립트를 한 번에 읽습니다. read_trigger를 반복 호출하는 대신 이 도구를 사용하세요.',
  {
    indices: z.array(z.number()).max(50).describe('읽을 트리거 인덱스 배열 (최대 50개)'),
  },
  async ({ indices }) => textResult(await apiRequest('POST', '/trigger/batch', { indices })),
);

server.tool(
  'write_trigger',
  '특정 인덱스의 트리거 스크립트를 수정합니다. 변경할 필드만 전달하면 나머지는 유지됩니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('트리거 인덱스'),
    comment: z.string().optional().describe('트리거 이름/설명'),
    type: z.string().optional().describe('트리거 타입 (start, input, output 등)'),
    conditions: z.array(z.unknown()).optional().describe('조건 배열'),
    effect: z.array(z.unknown()).optional().describe('효과 배열'),
    lowLevelAccess: z.boolean().optional().describe('저수준 접근 여부'),
    expected_comment: z.string().optional().describe('선택사항: list_triggers에서 본 현재 comment와 다르면 409 반환'),
  },
  async ({ index, comment, type, conditions, effect, lowLevelAccess, expected_comment }) => {
    const body: Record<string, unknown> = {};
    if (comment !== undefined) body.comment = comment;
    if (type !== undefined) body.type = type;
    if (conditions !== undefined) body.conditions = conditions;
    if (effect !== undefined) body.effect = effect;
    if (lowLevelAccess !== undefined) body.lowLevelAccess = lowLevelAccess;
    if (expected_comment !== undefined) body.expected_comment = expected_comment;
    return textResult(await apiRequest('POST', `/trigger/${index}`, body));
  },
);

server.tool(
  'add_trigger',
  '새 트리거 스크립트를 추가합니다. 사용자 확인 필요.',
  {
    comment: z.string().optional().describe('트리거 이름/설명'),
    type: z.string().optional().describe('트리거 타입 (기본: "start")'),
    conditions: z.array(z.unknown()).optional().describe('조건 배열'),
    effect: z.array(z.unknown()).optional().describe('효과 배열'),
    lowLevelAccess: z.boolean().optional().describe('저수준 접근 여부'),
  },
  async ({ comment, type, conditions, effect, lowLevelAccess }) => {
    const body: Record<string, unknown> = {};
    if (comment !== undefined) body.comment = comment;
    if (type !== undefined) body.type = type;
    if (conditions !== undefined) body.conditions = conditions;
    if (effect !== undefined) body.effect = effect;
    if (lowLevelAccess !== undefined) body.lowLevelAccess = lowLevelAccess;
    return textResult(await apiRequest('POST', '/trigger/add', body));
  },
);

server.tool(
  'delete_trigger',
  '특정 인덱스의 트리거 스크립트를 삭제합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('삭제할 트리거 인덱스'),
    expected_comment: z.string().optional().describe('선택사항: list_triggers에서 본 현재 comment와 다르면 409 반환'),
  },
  async ({ index, expected_comment }) =>
    textResult(await apiRequest('POST', `/trigger/${index}/delete`, { expected_comment })),
);

// ===== Lua Tools =====

server.tool(
  'list_lua',
  'Lua 코드의 섹션 목록을 확인합니다 (-- ===== 섹션명 ===== 구분자 기준). 각 섹션의 인덱스, 이름, 크기를 반환합니다.',
  {},
  async () => textResult(await apiRequest('GET', '/lua')),
);

server.tool(
  'read_lua',
  '특정 인덱스의 Lua 섹션 코드를 읽습니다. list_lua로 섹션 목록을 먼저 확인하세요.',
  { index: z.number().describe('Lua 섹션 인덱스 (list_lua 결과 참조)') },
  async ({ index }) => textResult(await apiRequest('GET', `/lua/${index}`)),
);

server.tool(
  'read_lua_batch',
  '여러 Lua 섹션을 한 번에 읽습니다. read_lua를 반복 호출하는 대신 이 도구를 사용하세요.',
  {
    indices: z.array(z.number()).max(20).describe('읽을 Lua 섹션 인덱스 배열 (최대 20개)'),
  },
  async ({ indices }) => textResult(await apiRequest('POST', '/lua/batch', { indices })),
);

server.tool(
  'write_lua',
  '특정 인덱스의 Lua 섹션 코드를 교체합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 사용자 확인 필요. 섹션 전체 코드를 content로 전달하세요.',
  {
    index: z.number().describe('Lua 섹션 인덱스'),
    content: z.string().describe('새로운 섹션 코드 (전체 교체)'),
    expected_hash: z.string().optional().describe('선택사항: list_lua/read_lua에서 본 현재 hash와 다르면 409 반환'),
    expected_preview: z
      .string()
      .optional()
      .describe('선택사항: list_lua/read_lua에서 본 현재 preview와 다르면 409 반환'),
  },
  async ({ index, content, expected_hash, expected_preview }) =>
    textResult(await apiRequest('POST', `/lua/${index}`, { content, expected_hash, expected_preview })),
);

server.tool(
  'replace_in_lua',
  'Lua 섹션 내에서 문자열 치환을 수행합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 대용량 섹션을 통째로 읽고 쓸 필요 없이 서버에서 직접 치환합니다. 사용자 확인 필요.',
  {
    index: z.number().describe('Lua 섹션 인덱스 (list_lua 결과 참조)'),
    find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
    replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
    regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false = 일반 문자열 매칭)'),
    flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
    expected_hash: z.string().optional().describe('선택사항: list_lua/read_lua에서 본 현재 hash와 다르면 409 반환'),
    expected_preview: z
      .string()
      .optional()
      .describe('선택사항: list_lua/read_lua에서 본 현재 preview와 다르면 409 반환'),
  },
  async ({ index, find, replace, regex, flags, expected_hash, expected_preview }) =>
    textResult(
      await apiRequest('POST', `/lua/${index}/replace`, {
        find,
        replace: replace || '',
        regex: regex || false,
        flags: flags || 'g',
        expected_hash,
        expected_preview,
      }),
    ),
);

server.tool(
  'insert_in_lua',
  'Lua 섹션에 코드를 삽입합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 전체를 읽지 않고 특정 위치에 추가. position: "end"(기본, 끝에 추가), "start"(앞에 추가), "after"(anchor 뒤에 삽입), "before"(anchor 앞에 삽입). 사용자 확인 필요.',
  {
    index: z.number().describe('Lua 섹션 인덱스'),
    content: z.string().describe('삽입할 코드'),
    position: z
      .enum(['end', 'start', 'after', 'before'])
      .optional()
      .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
    anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
    expected_hash: z.string().optional().describe('선택사항: list_lua/read_lua에서 본 현재 hash와 다르면 409 반환'),
    expected_preview: z
      .string()
      .optional()
      .describe('선택사항: list_lua/read_lua에서 본 현재 preview와 다르면 409 반환'),
  },
  async ({ index, content, position, anchor, expected_hash, expected_preview }) =>
    textResult(
      await apiRequest('POST', `/lua/${index}/insert`, {
        content,
        position: position || 'end',
        anchor: anchor || '',
        expected_hash,
        expected_preview,
      }),
    ),
);

server.tool(
  'add_lua_section',
  '새 Lua 섹션을 이름과 함께 추가합니다. 기존 마지막 섹션 뒤에 올바른 구분자(-- ===== name =====)와 함께 생성됩니다. insert_in_lua는 구분자를 이스케이프하므로 새 섹션 추가에는 이 도구를 사용하세요. 사용자 확인 필요.',
  {
    name: z.string().describe('새 섹션 이름'),
    content: z.string().optional().describe('섹션 초기 코드 (기본: 빈 문자열)'),
  },
  async ({ name, content }) => textResult(await apiRequest('POST', '/lua/add', { name, content: content || '' })),
);

// ===== CSS Tools =====

server.tool(
  'list_css',
  'CSS 코드의 섹션 목록을 확인합니다 (/* ===== 섹션명 ===== */ 구분자 기준). 각 섹션의 인덱스, 이름, 크기를 반환합니다.',
  {},
  async () => textResult(await apiRequest('GET', '/css-section')),
);

server.tool(
  'read_css',
  '특정 인덱스의 CSS 섹션 코드를 읽습니다. list_css로 섹션 목록을 먼저 확인하세요.',
  { index: z.number().describe('CSS 섹션 인덱스 (list_css 결과 참조)') },
  async ({ index }) => textResult(await apiRequest('GET', `/css-section/${index}`)),
);

server.tool(
  'read_css_batch',
  '여러 CSS 섹션을 한 번에 읽습니다. read_css를 반복 호출하는 대신 이 도구를 사용하세요.',
  {
    indices: z.array(z.number()).max(20).describe('읽을 CSS 섹션 인덱스 배열 (최대 20개)'),
  },
  async ({ indices }) => textResult(await apiRequest('POST', '/css-section/batch', { indices })),
);

server.tool(
  'write_css',
  '특정 인덱스의 CSS 섹션 코드를 교체합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 사용자 확인 필요. 섹션 전체 코드를 content로 전달하세요.',
  {
    index: z.number().describe('CSS 섹션 인덱스'),
    content: z.string().describe('새로운 섹션 코드 (전체 교체)'),
    expected_hash: z.string().optional().describe('선택사항: list_css/read_css에서 본 현재 hash와 다르면 409 반환'),
    expected_preview: z
      .string()
      .optional()
      .describe('선택사항: list_css/read_css에서 본 현재 preview와 다르면 409 반환'),
  },
  async ({ index, content, expected_hash, expected_preview }) =>
    textResult(await apiRequest('POST', `/css-section/${index}`, { content, expected_hash, expected_preview })),
);

server.tool(
  'replace_in_css',
  'CSS 섹션 내에서 문자열 치환을 수행합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 대용량 섹션을 통째로 읽고 쓸 필요 없이 서버에서 직접 치환합니다. 사용자 확인 필요.',
  {
    index: z.number().describe('CSS 섹션 인덱스 (list_css 결과 참조)'),
    find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
    replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
    regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false = 일반 문자열 매칭)'),
    flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
    expected_hash: z.string().optional().describe('선택사항: list_css/read_css에서 본 현재 hash와 다르면 409 반환'),
    expected_preview: z
      .string()
      .optional()
      .describe('선택사항: list_css/read_css에서 본 현재 preview와 다르면 409 반환'),
  },
  async ({ index, find, replace, regex, flags, expected_hash, expected_preview }) =>
    textResult(
      await apiRequest('POST', `/css-section/${index}/replace`, {
        find,
        replace: replace || '',
        regex: regex || false,
        flags: flags || 'g',
        expected_hash,
        expected_preview,
      }),
    ),
);

server.tool(
  'insert_in_css',
  'CSS 섹션에 코드를 삽입합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 전체를 읽지 않고 특정 위치에 추가. position: "end"(기본, 끝에 추가), "start"(앞에 추가), "after"(anchor 뒤에 삽입), "before"(anchor 앞에 삽입). 사용자 확인 필요.',
  {
    index: z.number().describe('CSS 섹션 인덱스'),
    content: z.string().describe('삽입할 코드'),
    position: z
      .enum(['end', 'start', 'after', 'before'])
      .optional()
      .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
    anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
    expected_hash: z.string().optional().describe('선택사항: list_css/read_css에서 본 현재 hash와 다르면 409 반환'),
    expected_preview: z
      .string()
      .optional()
      .describe('선택사항: list_css/read_css에서 본 현재 preview와 다르면 409 반환'),
  },
  async ({ index, content, position, anchor, expected_hash, expected_preview }) =>
    textResult(
      await apiRequest('POST', `/css-section/${index}/insert`, {
        content,
        position: position || 'end',
        anchor: anchor || '',
        expected_hash,
        expected_preview,
      }),
    ),
);

server.tool(
  'add_css_section',
  '새 CSS 섹션을 이름과 함께 추가합니다. 기존 마지막 섹션 뒤에 올바른 구분자와 함께 생성됩니다. insert_in_css는 구분자를 이스케이프하므로 새 섹션 추가에는 이 도구를 사용하세요. 사용자 확인 필요.',
  {
    name: z.string().describe('새 섹션 이름'),
    content: z.string().optional().describe('섹션 초기 코드 (기본: 빈 문자열)'),
  },
  async ({ name, content }) =>
    textResult(await apiRequest('POST', '/css-section/add', { name, content: content || '' })),
);

// ===== Reference Tools =====

server.tool(
  'list_references',
  '로드된 참고 자료 파일 목록을 확인합니다 (읽기 전용). 각 파일의 필드와 크기를 포함합니다. 메인 파일이 열려 있지 않아도 동작합니다. 큰 참고 필드는 search_in_reference_field / read_reference_field_range로 좁혀 읽고, lorebook/lua/css/regex는 list_reference_* → read_reference_*를 사용하세요.',
  {},
  async () => textResult(await apiRequest('GET', '/references')),
);

server.tool(
  'read_reference_field',
  '참고 자료 파일의 짧은 scalar/top-level 필드를 읽습니다 (읽기 전용). ⚠️ lorebook/lua/css/alternateGreetings/groupOnlyGreetings/triggerScripts/regex는 전용 list_reference_* → read_reference_* 도구를 우선 사용하세요. 큰 reference 텍스트는 search_in_reference_field 또는 read_reference_field_range부터 시작하는 편이 안전합니다.',
  {
    index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    field: z.string().describe('필드 이름'),
  },
  async ({ index, field }) => textResult(await apiRequest('GET', `/reference/${index}/${encodeURIComponent(field)}`)),
);

server.tool(
  'read_reference_field_batch',
  '참고 자료 파일의 여러 필드를 한번에 읽습니다. 짧은 top-level 필드를 함께 비교할 때 사용하세요. lorebook/lua/css 전체 덤프 대신 전용 list/read 도구를 우선 사용하세요.',
  {
    index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    fields: z.array(z.string()).max(20).describe('읽을 필드 이름 배열 (최대 20개)'),
  },
  async ({ index, fields }) => textResult(await apiRequest('POST', `/reference/${index}/field/batch`, { fields })),
);

server.tool(
  'search_in_reference_field',
  '참고 자료 파일의 텍스트 필드에서 문자열을 검색하고 주변 컨텍스트와 함께 반환합니다. 큰 reference 필드를 통째로 읽지 않고 필요한 위치만 찾을 때 유용합니다.',
  {
    index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    field: z.string().describe('필드 이름 (예: description, mainPrompt, globalNote)'),
    query: z.string().describe('검색할 문자열 (또는 regex: true일 때 정규식 패턴)'),
    context_chars: z.number().optional().describe('매치 전후에 표시할 문자 수 (기본: 100, 최대: 500)'),
    regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
    flags: z.string().optional().describe('정규식 플래그 (기본: "gi"). regex: true일 때만 사용'),
    max_matches: z.number().optional().describe('최대 반환 매치 수 (기본: 20, 최대: 100)'),
  },
  async ({ index, field, query, context_chars, regex, flags, max_matches }) =>
    textResult(
      await apiRequest('POST', `/reference/${index}/field/${encodeURIComponent(field)}/search`, {
        query,
        context_chars,
        regex,
        flags,
        max_matches,
      }),
    ),
);

server.tool(
  'read_reference_field_range',
  '참고 자료 파일의 큰 텍스트 필드에서 특정 구간만 읽습니다. 전체를 읽지 않고 문자 오프셋과 길이로 필요한 부분만 가져옵니다.',
  {
    index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    field: z.string().describe('필드 이름 (예: description, mainPrompt, globalNote)'),
    offset: z.number().optional().describe('시작 문자 오프셋 (기본: 0)'),
    length: z.number().optional().describe('읽을 문자 수 (기본: 2000, 최대: 10000)'),
  },
  async ({ index, field, offset, length }) => {
    const params = new URLSearchParams();
    if (offset !== undefined) params.set('offset', String(offset));
    if (length !== undefined) params.set('length', String(length));
    const qs = params.toString();
    return textResult(
      await apiRequest('GET', `/reference/${index}/field/${encodeURIComponent(field)}/range${qs ? '?' + qs : ''}`),
    );
  },
);

server.tool(
  'list_reference_greetings',
  '참고 자료 파일의 인사말 목록을 확인합니다 (alternate/group, 읽기 전용). read_reference_field("alternateGreetings"/"groupOnlyGreetings") 대신 이 도구로 인덱스를 먼저 좁히세요.',
  {
    index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    type: z.enum(['alternate', 'group']).describe('인사말 종류'),
  },
  async ({ index, type }) =>
    textResult(await apiRequest('GET', `/reference/${index}/greetings/${encodeURIComponent(type)}`)),
);

server.tool(
  'read_reference_greeting',
  '참고 자료 파일의 인사말 하나를 읽습니다 (읽기 전용). list_reference_greetings로 인덱스를 확인한 뒤 사용하세요.',
  {
    index: z.number().describe('참고 파일 인덱스'),
    type: z.enum(['alternate', 'group']).describe('인사말 종류'),
    entryIndex: z.number().describe('인사말 인덱스 (list_reference_greetings 결과 참조)'),
  },
  async ({ index, type, entryIndex }) =>
    textResult(await apiRequest('GET', `/reference/${index}/greeting/${encodeURIComponent(type)}/${entryIndex}`)),
);

server.tool(
  'read_reference_greeting_batch',
  '참고 자료 파일의 여러 인사말을 한 번에 읽습니다 (읽기 전용).',
  {
    index: z.number().describe('참고 파일 인덱스'),
    type: z.enum(['alternate', 'group']).describe('인사말 종류'),
    indices: z.array(z.number()).max(50).describe('읽을 인사말 인덱스 배열 (최대 50개)'),
  },
  async ({ index, type, indices }) =>
    textResult(await apiRequest('POST', `/reference/${index}/greeting/${encodeURIComponent(type)}/batch`, { indices })),
);

server.tool(
  'list_reference_triggers',
  '참고 자료 파일의 트리거 스크립트 목록을 확인합니다 (읽기 전용). read_reference_field("triggerScripts")의 전체 JSON 덤프 대신 comment/type/count 요약을 반환합니다.',
  {
    index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
  },
  async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/triggers`)),
);

server.tool(
  'read_reference_trigger',
  '참고 자료 파일의 트리거 스크립트 하나를 읽습니다 (읽기 전용). list_reference_triggers로 인덱스를 확인한 뒤 사용하세요.',
  {
    index: z.number().describe('참고 파일 인덱스'),
    triggerIndex: z.number().describe('트리거 인덱스 (list_reference_triggers 결과 참조)'),
  },
  async ({ index, triggerIndex }) => textResult(await apiRequest('GET', `/reference/${index}/trigger/${triggerIndex}`)),
);

server.tool(
  'read_reference_trigger_batch',
  '참고 자료 파일의 여러 트리거 스크립트를 한 번에 읽습니다 (읽기 전용).',
  {
    index: z.number().describe('참고 파일 인덱스'),
    indices: z.array(z.number()).max(50).describe('읽을 트리거 인덱스 배열 (최대 50개)'),
  },
  async ({ index, indices }) => textResult(await apiRequest('POST', `/reference/${index}/trigger/batch`, { indices })),
);

server.tool(
  'list_reference_lorebook',
  '참고 자료 파일의 로어북 항목 목록을 확인합니다 (인덱스, 코멘트, 키, 활성화 상태, content 크기, 폴더, 미리보기). filter, folder, content_filter로 범위를 좁히세요. read_reference_field("lorebook") 대신 이 도구를 사용하세요.',
  {
    index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    filter: z.string().optional().describe('검색 키워드 (comment, key에서 검색). 생략 시 전체 목록 반환'),
    folder: z.string().optional().describe('폴더 UUID로 필터. 생략 시 전체 반환'),
    content_filter: z.string().optional().describe('본문(content) 검색 키워드. 대소문자 무시. filter와 AND 결합'),
    content_filter_not: z.string().optional().describe('본문(content)에 이 키워드가 없는 항목만 필터. 대소문자 무시'),
    preview_length: z.number().optional().describe('content 미리보기 길이 (기본 150, 0=비활성, 최대 500)'),
  },
  async ({ index, filter, folder, content_filter, content_filter_not, preview_length }) => {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (folder) params.set('folder', folder);
    if (content_filter) params.set('content_filter', content_filter);
    if (content_filter_not) params.set('content_filter_not', content_filter_not);
    if (preview_length !== undefined) params.set('preview_length', String(preview_length));
    const qs = params.toString();
    return textResult(await apiRequest('GET', `/reference/${index}/lorebook${qs ? '?' + qs : ''}`));
  },
);

server.tool(
  'read_reference_lorebook',
  '참고 자료 파일의 특정 로어북 항목 하나를 읽습니다 (읽기 전용). list_reference_lorebook으로 인덱스 확인 후 사용.',
  {
    index: z.number().describe('참고 파일 인덱스'),
    entryIndex: z.number().describe('로어북 항목 인덱스 (list_reference_lorebook 결과 참조)'),
  },
  async ({ index, entryIndex }) => textResult(await apiRequest('GET', `/reference/${index}/lorebook/${entryIndex}`)),
);

server.tool(
  'read_reference_lorebook_batch',
  '참고 자료 파일의 여러 로어북 항목을 한 번에 읽습니다 (읽기 전용).',
  {
    index: z.number().describe('참고 파일 인덱스'),
    indices: z.array(z.number()).max(50).describe('읽을 로어북 항목 인덱스 배열 (최대 50개)'),
    fields: z
      .array(z.string())
      .optional()
      .describe('반환할 필드 목록 (예: ["content", "comment"]). 미지정 시 전체 필드 반환'),
  },
  async ({ index, indices, fields }) =>
    textResult(await apiRequest('POST', `/reference/${index}/lorebook/batch`, { indices, fields })),
);

server.tool(
  'list_reference_lua',
  '참고 자료 파일의 Lua 섹션 목록을 확인합니다 (인덱스, 이름, 크기). read_reference_field("lua") 대신 이 도구를 사용하세요.',
  { index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)') },
  async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/lua`)),
);

server.tool(
  'read_reference_lua',
  '참고 자료 파일의 특정 Lua 섹션 하나를 읽습니다 (읽기 전용). list_reference_lua로 인덱스 확인 후 사용.',
  {
    index: z.number().describe('참고 파일 인덱스'),
    sectionIndex: z.number().describe('Lua 섹션 인덱스 (list_reference_lua 결과 참조)'),
  },
  async ({ index, sectionIndex }) => textResult(await apiRequest('GET', `/reference/${index}/lua/${sectionIndex}`)),
);

server.tool(
  'read_reference_lua_batch',
  '참고 자료 파일의 여러 Lua 섹션을 한 번에 읽습니다 (읽기 전용).',
  {
    index: z.number().describe('참고 파일 인덱스'),
    indices: z.array(z.number()).max(20).describe('읽을 Lua 섹션 인덱스 배열 (최대 20개)'),
  },
  async ({ index, indices }) => textResult(await apiRequest('POST', `/reference/${index}/lua/batch`, { indices })),
);

server.tool(
  'list_reference_css',
  '참고 자료 파일의 CSS 섹션 목록을 확인합니다 (인덱스, 이름, 크기). read_reference_field("css") 대신 이 도구를 사용하세요.',
  { index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)') },
  async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/css`)),
);

server.tool(
  'read_reference_css',
  '참고 자료 파일의 특정 CSS 섹션 하나를 읽습니다 (읽기 전용). list_reference_css로 인덱스 확인 후 사용.',
  {
    index: z.number().describe('참고 파일 인덱스'),
    sectionIndex: z.number().describe('CSS 섹션 인덱스 (list_reference_css 결과 참조)'),
  },
  async ({ index, sectionIndex }) => textResult(await apiRequest('GET', `/reference/${index}/css/${sectionIndex}`)),
);

server.tool(
  'read_reference_css_batch',
  '참고 자료 파일의 여러 CSS 섹션을 한 번에 읽습니다 (읽기 전용).',
  {
    index: z.number().describe('참고 파일 인덱스'),
    indices: z.array(z.number()).max(20).describe('읽을 CSS 섹션 인덱스 배열 (최대 20개)'),
  },
  async ({ index, indices }) => textResult(await apiRequest('POST', `/reference/${index}/css/batch`, { indices })),
);

server.tool(
  'list_reference_regex',
  '참고 자료 파일의 정규식 스크립트 항목 목록을 확인합니다 (읽기 전용). 각 항목의 인덱스, comment, type, findSize, replaceSize를 반환합니다. read_reference_field("regex") 대신 이 도구를 사용하세요 — 전체 JSON 덤프를 방지합니다.',
  {
    index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
  },
  async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/regex`)),
);

server.tool(
  'read_reference_regex',
  '참고 자료 파일의 특정 정규식 항목 하나를 읽습니다 (읽기 전용). list_reference_regex로 인덱스 확인 후 사용.',
  {
    index: z.number().describe('참고 파일 인덱스'),
    entryIndex: z.number().describe('정규식 항목 인덱스 (list_reference_regex 결과 참조)'),
  },
  async ({ index, entryIndex }) => textResult(await apiRequest('GET', `/reference/${index}/regex/${entryIndex}`)),
);

server.tool(
  'read_reference_regex_batch',
  '참고 자료 파일의 여러 정규식 항목을 한 번에 읽습니다 (읽기 전용).',
  {
    index: z.number().describe('참고 파일 인덱스'),
    indices: z.array(z.number()).max(50).describe('읽을 정규식 항목 인덱스 배열 (최대 50개)'),
  },
  async ({ index, indices }) => textResult(await apiRequest('POST', `/reference/${index}/regex/batch`, { indices })),
);

server.tool(
  'list_reference_risup_prompt_items',
  '참고 자료 파일이 .risup일 때 promptTemplate 항목 목록을 읽습니다 (읽기 전용). 각 항목의 index, type, supported, id, preview를 반환합니다.',
  {
    index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
  },
  async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/risup/prompt-items`)),
);

server.tool(
  'read_reference_risup_prompt_item',
  '참고 자료 파일이 .risup일 때 promptTemplate 항목 하나를 읽습니다 (읽기 전용). list_reference_risup_prompt_items로 인덱스 확인 후 사용하세요.',
  {
    index: z.number().describe('참고 파일 인덱스'),
    itemIndex: z.number().describe('prompt item 인덱스 (list_reference_risup_prompt_items 결과 참조)'),
  },
  async ({ index, itemIndex }) =>
    textResult(await apiRequest('GET', `/reference/${index}/risup/prompt-item/${itemIndex}`)),
);

server.tool(
  'read_reference_risup_prompt_item_batch',
  '참고 자료 파일이 .risup일 때 여러 promptTemplate 항목을 한 번에 읽습니다 (읽기 전용).',
  {
    index: z.number().describe('참고 파일 인덱스'),
    indices: z.array(z.number()).max(50).describe('읽을 prompt item 인덱스 배열 (최대 50개)'),
  },
  async ({ index, indices }) =>
    textResult(await apiRequest('POST', `/reference/${index}/risup/prompt-items/batch`, { indices })),
);

server.tool(
  'read_reference_risup_formating_order',
  '참고 자료 파일이 .risup일 때 formatingOrder를 토큰 목록으로 읽습니다 (읽기 전용). warnings 배열에 dangling/duplicate 진단이 포함됩니다.',
  {
    index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
  },
  async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/risup/formating-order`)),
);

// ===== Risum Asset Tools =====

server.tool(
  'list_risum_assets',
  '.risum 파일의 내장 에셋 목록을 확인합니다 (인덱스, 이름, 경로, 크기).',
  {},
  async () => textResult(await apiRequest('GET', '/risum-assets')),
);

server.tool(
  'read_risum_asset',
  '.risum 파일의 내장 에셋을 base64로 읽습니다.',
  { index: z.number().describe('에셋 인덱스 (list_risum_assets 결과 참조)') },
  async ({ index }) => textResult(await apiRequest('GET', `/risum-asset/${index}`)),
);

server.tool(
  'add_risum_asset',
  '.risum 파일에 에셋을 추가합니다. base64로 인코딩된 데이터를 전달. 사용자 확인 필요.',
  {
    name: z.string().describe('에셋 이름'),
    path: z.string().optional().describe('에셋 경로 (선택사항)'),
    base64: z.string().describe('base64 인코딩된 에셋 데이터'),
  },
  async ({ name, path: assetPath, base64 }) =>
    textResult(await apiRequest('POST', '/risum-asset/add', { name, path: assetPath || '', base64 })),
);

server.tool(
  'delete_risum_asset',
  '.risum 파일의 내장 에셋을 삭제합니다. optional expected_path로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('삭제할 에셋 인덱스'),
    expected_path: z
      .string()
      .optional()
      .describe('선택사항: list_risum_assets/read_risum_asset에서 본 현재 path와 다르면 409 반환'),
  },
  async ({ index, expected_path }) =>
    textResult(await apiRequest('POST', `/risum-asset/${index}/delete`, { expected_path })),
);

// ===== Charx Asset Tools =====

server.tool('list_charx_assets', '.charx 파일의 내장 에셋 목록을 확인합니다 (인덱스, 경로, 크기).', {}, async () =>
  textResult(await apiRequest('GET', '/assets')),
);

server.tool(
  'read_charx_asset',
  '.charx 파일의 내장 에셋을 base64로 읽습니다.',
  { index: z.number().describe('에셋 인덱스 (list_charx_assets 결과 참조)') },
  async ({ index }) => textResult(await apiRequest('GET', `/asset/${index}`)),
);

server.tool(
  'add_charx_asset',
  '.charx 파일에 에셋을 추가합니다. base64로 인코딩된 데이터를 전달. 사용자 확인 필요.',
  {
    fileName: z.string().describe('파일명 (예: character.png)'),
    base64: z.string().describe('base64 인코딩된 에셋 데이터'),
    folder: z.enum(['icon', 'other']).optional().describe('폴더: "icon" 또는 "other"(기본)'),
  },
  async ({ fileName, base64, folder }) =>
    textResult(await apiRequest('POST', '/asset/add', { fileName, base64, folder: folder || 'other' })),
);

server.tool(
  'delete_charx_asset',
  '.charx 파일의 내장 에셋을 삭제합니다. optional expected_path로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('삭제할 에셋 인덱스'),
    expected_path: z
      .string()
      .optional()
      .describe('선택사항: list_charx_assets/read_charx_asset에서 본 현재 path와 다르면 409 반환'),
  },
  async ({ index, expected_path }) => textResult(await apiRequest('POST', `/asset/${index}/delete`, { expected_path })),
);

server.tool(
  'rename_charx_asset',
  '.charx 파일의 내장 에셋 이름을 변경합니다. optional expected_path로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  {
    index: z.number().describe('에셋 인덱스 (list_charx_assets 결과 참조)'),
    newName: z.string().describe('새 파일명 (확장자 포함, 예: new_name.png)'),
    expected_path: z
      .string()
      .optional()
      .describe('선택사항: list_charx_assets/read_charx_asset에서 본 현재 path와 다르면 409 반환'),
  },
  async ({ index, newName, expected_path }) =>
    textResult(await apiRequest('POST', `/asset/${index}/rename`, { newName, expected_path })),
);

// ===== Asset Compression =====

server.tool(
  'compress_assets_webp',
  '모든 이미지 에셋을 WebP 손실 압축으로 변환합니다. dry_run으로 변환 후보를 미리 볼 수 있습니다. PNG, JPEG, GIF 등을 WebP로 변환하여 파일 크기를 줄입니다. SVG는 건너뛰며, WebP가 원본보다 크면 원본을 유지합니다. 사용자 확인 필요.',
  {
    quality: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('WebP 품질 (0-100, 기본: 80). 높을수록 화질 좋지만 파일 큼'),
    recompress_webp: z.boolean().optional().describe('이미 WebP인 파일도 재압축할지 (기본: false)'),
    dry_run: z.boolean().optional().describe('true면 실제 압축 없이 변환 후보 preview만 반환'),
  },
  async ({ quality, recompress_webp, dry_run }) => {
    const body: Record<string, unknown> = {};
    if (quality !== undefined) body.quality = quality;
    if (recompress_webp !== undefined) body.recompressWebp = recompress_webp;
    if (dry_run !== undefined) body.dry_run = dry_run;
    return textResult(await apiRequest('POST', '/assets/compress-webp', body));
  },
);

// ===== Lorebook Export/Import =====

server.tool(
  'export_lorebook_to_files',
  '로어북 항목을 파일 시스템으로 내보냅니다. MD 형식: 항목당 1개 파일 + 폴더 구조를 디렉토리로 매핑. JSON 형식: 단일 lorebook.json 파일. 사용자 확인 필요.',
  {
    target_dir: z.string().describe('내보낼 디렉토리 경로 (절대 경로 권장)'),
    format: z.enum(['md', 'json']).optional().describe('내보내기 형식 (기본: md). md=항목당 개별 파일, json=단일 파일'),
    group_by_folder: z.boolean().optional().describe('폴더별로 하위 디렉토리 생성 (기본: true, md 형식만 해당)'),
    filter: z.string().optional().describe('comment/key 검색 필터 (선택)'),
    folder: z.string().optional().describe('특정 폴더만 내보내기 (folder UUID)'),
  },
  async ({ target_dir, format, group_by_folder, filter, folder }) => {
    const body: Record<string, unknown> = { target_dir };
    if (format) body.format = format;
    if (group_by_folder !== undefined) body.group_by_folder = group_by_folder;
    if (filter) body.filter = filter;
    if (folder) body.folder = folder;
    return textResult(await apiRequest('POST', '/lorebook/export', body));
  },
);

server.tool(
  'import_lorebook_from_files',
  '파일 시스템에서 로어북 항목을 가져옵니다. MD 형식: 디렉토리의 .md 파일에서 YAML frontmatter + content 파싱. JSON 형식: lorebook.json 파일에서 가져오기. dry_run으로 미리보기 가능. 사용자 확인 필요.',
  {
    source_dir: z.string().optional().describe('MD 형식 소스 디렉토리 (md 형식일 때 필수)'),
    source_path: z.string().optional().describe('JSON 파일 경로 (json 형식일 때 필수)'),
    format: z.enum(['md', 'json']).optional().describe('가져오기 형식 (기본: md)'),
    create_folders: z.boolean().optional().describe('디렉토리 구조에서 로어북 폴더 자동 생성 (기본: true)'),
    conflict: z
      .enum(['skip', 'overwrite', 'rename'])
      .optional()
      .describe('동일 comment 충돌 시 처리 (기본: skip). skip=건너뛰기, overwrite=덮어쓰기, rename=이름 변경'),
    dry_run: z.boolean().optional().describe('미리보기만 (변경 없이 결과 확인, 기본: false)'),
  },
  async ({ source_dir, source_path, format, create_folders, conflict, dry_run }) => {
    const body: Record<string, unknown> = {};
    if (source_dir) body.source_dir = source_dir;
    if (source_path) body.source_path = source_path;
    if (format) body.format = format;
    if (create_folders !== undefined) body.create_folders = create_folders;
    if (conflict) body.conflict = conflict;
    if (dry_run !== undefined) body.dry_run = dry_run;
    return textResult(await apiRequest('POST', '/lorebook/import', body));
  },
);

server.tool(
  'export_field_to_file',
  '필드 내용을 파일로 내보냅니다. description, globalNote, firstMessage 등 텍스트 필드를 로컬 파일로 저장합니다. 사용자 확인 필요.',
  {
    field: z.string().describe('내보낼 필드 이름 (예: description, globalNote, firstMessage)'),
    file_path: z.string().describe('저장할 파일 경로 (절대 경로 권장)'),
    format: z.enum(['md', 'txt']).optional().describe('파일 형식 (기본: txt). md=마크다운 헤더 포함'),
  },
  async ({ field, file_path, format }) => {
    const body: Record<string, unknown> = { field, file_path };
    if (format) body.format = format;
    return textResult(await apiRequest('POST', '/field/export', body));
  },
);

// ===== Folder Workspace Tools =====

server.tool(
  'extract_charx_to_project_folder',
  '큰 필드를 MCP 응답으로 읽기 어렵거나 외부 에디터/AI CLI로 직접 수정해야 할 때, .charx/.risum/.risup 파일을 프로젝트 폴더(card.json/module.json/preset.json, markdown 파일, assets/)로 추출합니다. 사용자 확인 필요.',
  {
    file_path: z.string().describe('추출할 .charx/.risum/.risup 파일 경로. 절대 경로 권장.'),
    project_path: z
      .string()
      .optional()
      .describe('출력 프로젝트 폴더 경로. 생략하면 원본 파일 옆에 {파일명}_{확장자} 폴더를 만듭니다.'),
  },
  safeToolHandler('extract_charx_to_project_folder', async ({ file_path, project_path }) => {
    const sourcePath = path.resolve(file_path);
    if (!fs.existsSync(sourcePath)) {
      return textResult({
        [API_ERROR_KEY]: true,
        status: 400,
        error: `File not found: ${sourcePath}`,
        suggestion: 'session_status 또는 inspect_external_file로 현재 파일 경로를 확인한 뒤 다시 시도하세요.',
        retryable: false,
        next_actions: ['session_status', 'inspect_external_file'],
      });
    }
    const sourceExt = path.extname(sourcePath).toLowerCase();
    if (!['.charx', '.risum', '.risup'].includes(sourceExt)) {
      return textResult({
        [API_ERROR_KEY]: true,
        status: 400,
        error: 'extract_charx_to_project_folder only supports .charx, .risum, and .risup files.',
        suggestion: '프로젝트 폴더로 추출할 수 있는 RisuAI 문서 파일을 지정하세요.',
        retryable: false,
        next_actions: ['inspect_external_file'],
      });
    }
    const targetPath = path.resolve(project_path || defaultProjectFolderForDocument(sourcePath));
    extractDocumentToProject(sourcePath, targetPath);
    const treeSummary = summarizeProjectTree(targetPath);
    const sourceType = sourceExt.slice(1);
    return textResult(
      mcpSuccess(
        {
          success: true,
          filePath: sourcePath,
          fileType: sourceType,
          projectPath: targetPath,
          treeSummary,
          workflow:
            'Use structured editor/MCP surfaces when possible; raw project files are an advanced fallback. Reassemble this projectPath when an exported file is needed.',
        },
        {
          toolName: 'extract_charx_to_project_folder',
          summary: `Extracted .${sourceType} into project folder with ${treeSummary.files} files`,
          nextActions: ['reassemble_project_folder_to_charx', 'session_status'],
          artifacts: {
            byte_size: 0,
            project_path: targetPath,
            file_count: treeSummary.files,
            directory_count: treeSummary.directories,
          },
        },
      ),
    );
  }),
);

server.tool(
  'reassemble_project_folder_to_charx',
  'RisuToki 프로젝트 폴더를 다시 .charx/.risum/.risup 파일로 내보냅니다. 프로젝트 폴더에서 긴 markdown/json/assets 파일을 직접 편집한 뒤 사용하세요. 사용자 확인 필요.',
  {
    project_path: z.string().describe('card.json/module.json/preset.json 중 하나가 들어 있는 프로젝트 폴더 경로.'),
    output_path: z.string().describe('생성할 .charx/.risum/.risup 파일 경로. 기존 파일을 덮어쓸 수 있습니다.'),
  },
  safeToolHandler('reassemble_project_folder_to_charx', async ({ project_path, output_path }) => {
    const projectPath = path.resolve(project_path);
    const outputPath = path.resolve(output_path);
    if (!fs.existsSync(projectPath)) {
      return textResult({
        [API_ERROR_KEY]: true,
        status: 400,
        error: `Project folder not found: ${projectPath}`,
        suggestion: 'extract_charx_to_project_folder로 먼저 프로젝트 폴더를 만들거나 project_path를 확인하세요.',
        retryable: false,
        next_actions: ['extract_charx_to_project_folder'],
      });
    }
    const projectFileType = getProjectFileType(projectPath);
    reassembleProjectDocument(projectPath, outputPath);
    const stat = fs.statSync(outputPath);
    return textResult(
      mcpSuccess(
        {
          success: true,
          fileType: projectFileType,
          projectPath,
          outputPath,
          sizeBytes: stat.size,
        },
        {
          toolName: 'reassemble_project_folder_to_charx',
          summary: `Reassembled project folder into .${projectFileType} (${stat.size} bytes)`,
          nextActions: ['inspect_external_file', 'open_file', 'validate_content'],
          artifacts: {
            byte_size: stat.size,
            project_path: projectPath,
            output_path: outputPath,
          },
        },
      ),
    );
  }),
);

// ===== Skill Tools =====

server.tool(
  'list_skills',
  'RisuAI 스킬 문서 목록을 반환합니다. 각 스킬의 name, description, 포함 파일 목록을 확인할 수 있습니다. CBS 문법, Lua 스크립트, 로어북, 정규식, HTML/CSS, 트리거 스크립트, 캐릭터 작성 등의 가이드가 포함되어 있습니다.',
  {},
  async () => textResult(await apiRequest('GET', '/skills')),
);

server.tool(
  'read_skill',
  '특정 스킬의 문서 파일을 읽습니다. 기본적으로 SKILL.md를 읽으며, file 파라미터로 참조 파일(예: REFERENCE.md, API_REFERENCE.md)도 읽을 수 있습니다.',
  {
    name: z.string().describe('스킬 이름 (예: writing-lua-scripts, authoring-characters)'),
    file: z.string().optional().describe('읽을 파일명 (기본: SKILL.md). list_skills에서 확인한 파일명 사용.'),
  },
  async ({ name, file }) => {
    const filePart = file ? encodeURIComponent(file) : '';
    const skillPath = filePart
      ? `/skills/${encodeURIComponent(name)}/${filePart}`
      : `/skills/${encodeURIComponent(name)}`;
    return textResult(await apiRequest('GET', skillPath));
  },
);

// ===== Danbooru Tools (local — no apiRequest) =====

server.tool(
  'tag_db_status',
  'Danbooru 태그 DB의 로딩 상태를 확인합니다. 태그 도구 사용 전 DB가 정상 로드되었는지 진단할 때 사용하세요.',
  {},
  async () => {
    const tagFilePath = path.join(__dirname, 'resources', 'Danbooru Tag.txt');
    const fileExists = fs.existsSync(tagFilePath);
    return textResult({
      loaded: tagsLoaded,
      tagCount: tagMap.size,
      filePath: tagFilePath,
      fileExists,
      ...(tagsLoaded
        ? {}
        : {
            suggestion: fileExists
              ? 'Tags file found but failed to parse. Check file format.'
              : 'Tags file not found. Ensure resources/Danbooru Tag.txt is packaged.',
          }),
    });
  },
);

server.tool(
  'validate_danbooru_tags',
  'Validate whether given tags are valid Danbooru tags. Returns validation result for each tag with suggestions for invalid ones. IMPORTANT: Always use this tool to verify your tags before using them in image generation prompts.',
  {
    tags: z.array(z.string()).describe('List of tags to validate (e.g. ["blue_eyes", "long_hair", "school_uniform"])'),
    online_fallback: z
      .boolean()
      .optional()
      .describe('If true, check Danbooru API for tags not found locally (default: true)'),
  },
  async ({ tags, online_fallback }) => {
    ensureTagsLoaded();
    const onlineFallback = online_fallback !== false;
    const results = await validateTags(tags, onlineFallback);
    const validCount = results.filter((r) => r.valid).length;
    const invalidCount = results.filter((r) => !r.valid).length;
    return textResult({
      summary: `${validCount}/${tags.length} tags valid${invalidCount > 0 ? `, ${invalidCount} invalid` : ''}`,
      results,
    });
  },
);

server.tool(
  'search_danbooru_tags',
  'Search for Danbooru tags matching a query. Use this to find the correct tag name for a concept. Supports wildcard (*) patterns. Results are sorted by popularity (post count).',
  {
    query: z.string().describe('Search query (e.g. "blue_eye", "long_h*", "school"). Supports * wildcard.'),
    category: z.string().optional().describe('Filter by tag category: general, artist, copyright, character, meta'),
    limit: z.number().optional().describe('Max results (default: 20, max: 50)'),
  },
  async ({ query, category, limit }) => {
    ensureTagsLoaded();
    const effectiveLimit = Math.min(limit || 20, 50);
    const results = await searchWithOnline(query, category, effectiveLimit);
    return textResult({ query, count: results.length, tags: formatTags(results) });
  },
);

server.tool(
  'get_popular_danbooru_tags',
  'Get popular Danbooru tags sorted by usage count. Use group_by_semantic=true to get tags organized by category (hair, eyes, clothing, pose, etc.) — very useful when writing character image prompts.',
  {
    category: z.string().optional().describe('Filter by tag category: general, artist, copyright, character, meta'),
    limit: z.number().optional().describe('Max results per group or total (default: 100, max: 500)'),
    group_by_semantic: z
      .boolean()
      .optional()
      .describe('If true, returns tags grouped by semantic category (hair_color, eye_color, clothing, pose, etc.)'),
  },
  async ({ category, limit, group_by_semantic }) => {
    ensureTagsLoaded();
    if (group_by_semantic) {
      const groups = getPopularGrouped();
      return textResult({
        description: 'Popular Danbooru tags grouped by semantic category. Use these as reference when writing prompts.',
        groups,
      });
    }
    const effectiveLimit = Math.min(limit || 100, 500);
    const results = getPopular(category, effectiveLimit);
    return textResult({ count: results.length, tags: formatTags(results) });
  },
);

// ==================== CBS Validation ====================

server.tool(
  'validate_cbs',
  'Validate CBS {{#when}} block nesting and structure. Checks open/close balance for all CBS blocks. Use all_combos to test every toggle combination for resolve errors.',
  {
    field: z
      .string()
      .optional()
      .describe('Specific field to validate (e.g., globalNote, description). Omit to scan all fields.'),
    lorebook_index: z.number().optional().describe('Specific lorebook entry index to validate.'),
    all_combos: z
      .boolean()
      .optional()
      .describe('Test all toggle combinations for resolve errors (max 1024 combos). Default: false.'),
    file_path: z
      .string()
      .optional()
      .describe(
        'Absolute path to an external .charx/.risum/.risup file. When provided, validates CBS in that file instead of the current document.',
      ),
  },
  async ({ field, lorebook_index, all_combos, file_path }) => {
    const params = new URLSearchParams();
    if (field) params.set('field', field);
    if (lorebook_index !== undefined) params.set('lorebook_index', String(lorebook_index));
    if (all_combos) params.set('all_combos', 'true');
    if (file_path) params.set('file_path', file_path);
    const qs = params.toString();
    const result = await apiRequest('GET', `/cbs/validate${qs ? '?' + qs : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'list_cbs_toggles',
  'List all CBS toggles used in the file. Shows toggle names, their conditions (is:0, is:1, etc.), and which fields reference them.',
  {
    field: z.string().optional().describe('Specific field to scan. Omit to scan all fields.'),
    lorebook_index: z.number().optional().describe('Specific lorebook entry index to scan.'),
  },
  async ({ field, lorebook_index }) => {
    const params = new URLSearchParams();
    if (field) params.set('field', field);
    if (lorebook_index !== undefined) params.set('lorebook_index', String(lorebook_index));
    const qs = params.toString();
    const result = await apiRequest('GET', `/cbs/toggles${qs ? '?' + qs : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'simulate_cbs',
  'Resolve CBS blocks with specific toggle values to preview the resulting text. The toggle_ prefix is auto-added to toggle names. Use all_combos to generate all possible outputs.',
  {
    field: z.string().describe('Field to simulate (e.g., globalNote, description). Required.'),
    lorebook_index: z.number().optional().describe('Lorebook entry index (if field is a lorebook entry).'),
    toggles: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Toggle values as {name: value} object. toggle_ prefix auto-added. Example: {"Narration": "0", "Claude": "1"}',
      ),
    all_combos: z.boolean().optional().describe('Generate all toggle combinations (max 256). Default: false.'),
    compact: z.boolean().optional().describe('Compress consecutive blank lines. Default: true.'),
  },
  async ({ field, lorebook_index, toggles, all_combos, compact }) => {
    const body: Record<string, unknown> = { field };
    if (lorebook_index !== undefined) body.lorebook_index = lorebook_index;
    if (toggles) body.toggles = toggles;
    if (all_combos !== undefined) body.all_combos = all_combos;
    if (compact !== undefined) body.compact = compact;
    const result = await apiRequest('POST', '/cbs/simulate', body);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'diff_cbs',
  'Compare CBS output between baseline (all toggles=0) and specified toggle values. Shows added and removed lines.',
  {
    field: z.string().describe('Field to compare (e.g., globalNote, description). Required.'),
    lorebook_index: z.number().optional().describe('Lorebook entry index (if field is a lorebook entry).'),
    toggles: z
      .record(z.string(), z.string())
      .describe('Toggle values to compare against baseline. toggle_ prefix auto-added. Example: {"Narration": "3"}'),
  },
  async ({ field, lorebook_index, toggles }) => {
    const body: Record<string, unknown> = { field, toggles };
    if (lorebook_index !== undefined) body.lorebook_index = lorebook_index;
    const result = await apiRequest('POST', '/cbs/diff', body);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// ===== Risup Prompt Item Tools =====

server.tool(
  'list_risup_prompt_items',
  'Lists all items in the risup preset promptTemplate with type, supported flag, stable id, and a concise preview. Each item includes an additive "id" field for stable identification (null for unsupported items). The current file must be a .risup preset. Returns 400 if the file is not risup or if promptTemplate JSON is invalid.',
  {},
  async () => textResult(await apiRequest('GET', '/risup/prompt-items')),
);

server.tool(
  'search_in_risup_prompt_items',
  'Searches text-bearing risup prompt items by substring and returns matching indices, matched field names, stable ids, and previews. Searches supported text/name fields plus raw JSON for unsupported items. The current file must be a .risup preset.',
  {
    query: z.string().min(1).describe('Substring to search for inside prompt items.'),
    caseSensitive: z.boolean().optional().describe('When true, use case-sensitive matching. Default: false.'),
  },
  async ({ query, caseSensitive }) =>
    textResult(await apiRequest('POST', '/risup/prompt-items/search', { query, caseSensitive })),
);

server.tool(
  'read_risup_prompt_item',
  'Reads a single prompt item from the risup promptTemplate by index. Returns the raw item object plus supported/type metadata and an additive "id" field for stable identification. The current file must be a .risup preset.',
  {
    index: z
      .number()
      .describe('Zero-based index of the prompt item. Use list_risup_prompt_items to find valid indices.'),
  },
  async ({ index }) => textResult(await apiRequest('GET', `/risup/prompt-item/${index}`)),
);

server.tool(
  'read_risup_prompt_item_batch',
  'Reads multiple risup prompt items in one call. Invalid indices return null entries so the caller can preserve ordering while skipping missing items. Prefer this over repeated read_risup_prompt_item calls when inspecting several items.',
  {
    indices: z.array(z.number()).max(50).describe('Zero-based prompt item indices to read (maximum 50).'),
  },
  async ({ indices }) => textResult(await apiRequest('POST', '/risup/prompt-item/batch', { indices })),
);

server.tool(
  'write_risup_prompt_item',
  'Replaces a single prompt item in the risup promptTemplate by index. Only supported item types are accepted (plain, jailbreak, cot, chatML, persona, description, lorebook, postEverything, memory, authornote, chat, cache). For unsupported/raw structures use write_field("promptTemplate"). Optional expected_type / expected_preview guards can detect stale indices. Requires user confirmation. Successful responses may include additive "orderWarnings" when the resulting prompt no longer matches formatingOrder references.',
  {
    index: z
      .number()
      .describe('Zero-based index of the prompt item to replace. Use list_risup_prompt_items to find valid indices.'),
    item: z
      .record(z.string(), z.unknown())
      .describe(
        'Replacement item object. Must be a supported type. Example: { "type": "plain", "type2": "normal", "text": "...", "role": "system" }',
      ),
    expected_type: z
      .string()
      .optional()
      .describe('Optional stale-index guard: the current prompt item type must still match.'),
    expected_preview: z
      .string()
      .optional()
      .describe(
        'Optional stale-index guard: the current prompt item preview from list_risup_prompt_items must still match.',
      ),
  },
  async ({ index, item, expected_type, expected_preview }) =>
    textResult(await apiRequest('POST', `/risup/prompt-item/${index}`, { item, expected_type, expected_preview })),
);

server.tool(
  'write_risup_prompt_item_batch',
  'Replaces multiple risup prompt items by index in a single confirmed operation. Only supported item types are accepted. Prefer this over repeated write_risup_prompt_item calls when editing several sibling items. Each write can carry optional expected_type / expected_preview guards to detect stale indices. Requires user confirmation. Successful responses may include additive "orderWarnings" for the resulting prompt/formatingOrder consistency state.',
  {
    writes: z
      .array(
        z.object({
          index: z.number().describe('Zero-based index of the prompt item to replace.'),
          item: z
            .record(z.string(), z.unknown())
            .describe('Replacement item object. Must be a supported prompt item type.'),
          expected_type: z
            .string()
            .optional()
            .describe('Optional stale-index guard: the current prompt item type must still match.'),
          expected_preview: z
            .string()
            .optional()
            .describe('Optional stale-index guard: the current prompt item preview must still match.'),
        }),
      )
      .max(50)
      .describe('Batch replacement payload [{ index, item }, ...] (maximum 50).'),
  },
  async ({ writes }) => textResult(await apiRequest('POST', '/risup/prompt-item/batch-write', { writes })),
);

server.tool(
  'add_risup_prompt_item',
  'Appends a new prompt item to the risup promptTemplate. Only supported item types are accepted (plain, jailbreak, cot, chatML, persona, description, lorebook, postEverything, memory, authornote, chat, cache). For unsupported/raw structures use write_field("promptTemplate"). Requires user confirmation. Successful responses may include additive "orderWarnings".',
  {
    item: z
      .record(z.string(), z.unknown())
      .describe(
        'Item object to add. Must be a supported type. Example: { "type": "jailbreak", "type2": "normal", "text": "...", "role": "system" }',
      ),
    insertAt: z.number().optional().describe('Zero-based insertion position. Default: append to the end.'),
  },
  async ({ item, insertAt }) => textResult(await apiRequest('POST', '/risup/prompt-item/add', { item, insertAt })),
);

server.tool(
  'add_risup_prompt_item_batch',
  'Appends multiple new prompt items to the risup promptTemplate in one confirmed operation. Only supported item types are accepted. Prefer this over repeated add_risup_prompt_item calls when building or extending a preset. Requires user confirmation. Successful responses may include additive "orderWarnings".',
  {
    items: z
      .array(z.record(z.string(), z.unknown()))
      .max(50)
      .describe('Prompt item objects to append [{...}, {...}] (maximum 50).'),
    insertAt: z.number().optional().describe('Zero-based insertion position. Default: append to the end.'),
  },
  async ({ items, insertAt }) =>
    textResult(await apiRequest('POST', '/risup/prompt-item/batch-add', { items, insertAt })),
);

server.tool(
  'delete_risup_prompt_item',
  'Deletes a single prompt item from the risup promptTemplate by index. Optional expected_type / expected_preview guards can detect stale indices. Requires user confirmation. Successful responses may include additive "orderWarnings".',
  {
    index: z
      .number()
      .describe('Zero-based index of the prompt item to delete. Use list_risup_prompt_items to find valid indices.'),
    expected_type: z
      .string()
      .optional()
      .describe('Optional stale-index guard: the current prompt item type must still match.'),
    expected_preview: z
      .string()
      .optional()
      .describe('Optional stale-index guard: the current prompt item preview must still match.'),
  },
  async ({ index, expected_type, expected_preview }) =>
    textResult(await apiRequest('POST', `/risup/prompt-item/${index}/delete`, { expected_type, expected_preview })),
);

server.tool(
  'batch_delete_risup_prompt_items',
  'Deletes multiple prompt items from the risup promptTemplate by indices in a single confirmed operation. Optional expected_types / expected_previews arrays (same order as indices) guard against stale indices. Requires user confirmation. Successful responses may include additive "orderWarnings".',
  {
    indices: z.array(z.number()).max(50).describe('Zero-based indices of prompt items to delete (maximum 50).'),
    expected_types: z
      .array(z.string())
      .max(50)
      .optional()
      .describe('Optional stale-index guard: expected types aligned with indices array order.'),
    expected_previews: z
      .array(z.string())
      .max(50)
      .optional()
      .describe('Optional stale-index guard: expected previews aligned with indices array order.'),
  },
  async ({ indices, expected_types, expected_previews }) =>
    textResult(
      await apiRequest('POST', '/risup/prompt-item/batch-delete', {
        indices,
        expected_types,
        expected_previews,
      }),
    ),
);

server.tool(
  'reorder_risup_prompt_items',
  'Reorders all prompt items in the risup promptTemplate. The order array must be a full permutation of [0, 1, ..., n-1] where n is the current item count. Requires user confirmation. Successful responses may include additive "orderWarnings".',
  {
    order: z
      .array(z.number())
      .describe('New order as a permutation of [0, 1, ..., n-1]. Example: [2, 0, 1] moves item 2 to position 0.'),
  },
  async ({ order }) => textResult(await apiRequest('POST', '/risup/prompt-item/reorder', { order })),
);

server.tool(
  'read_risup_prompt_item_by_id',
  'Reads a single supported risup prompt item by stable id from list_risup_prompt_items. Prefer facade read_content with selector { family: "risup-prompt", id } for new LLM workflows.',
  { item_id: z.string().min(1).describe('Stable prompt item id from list_risup_prompt_items.') },
  async ({ item_id }) => textResult(await apiRequest('GET', `/risup/prompt-item-by-id/${encodeURIComponent(item_id)}`)),
);

server.tool(
  'write_risup_prompt_item_by_id',
  'Replaces a supported risup prompt item by stable id. Prefer facade preview_edit/apply_edit with selector { family: "risup-prompt", id } when possible. Requires user confirmation.',
  {
    item_id: z.string().min(1),
    item: z.record(z.string(), z.unknown()).describe('Replacement supported prompt item object.'),
    expected_type: z.string().optional(),
    expected_preview: z.string().optional(),
  },
  async ({ item_id, item, expected_type, expected_preview }) =>
    textResult(
      await apiRequest('POST', `/risup/prompt-item-by-id/${encodeURIComponent(item_id)}`, {
        item,
        expected_type,
        expected_preview,
      }),
    ),
);

server.tool(
  'delete_risup_prompt_item_by_id',
  'Deletes a supported risup prompt item by stable id. Prefer facade preview_edit/apply_edit with selector { family: "risup-prompt", id } when possible. Requires user confirmation.',
  {
    item_id: z.string().min(1),
    expected_type: z.string().optional(),
    expected_preview: z.string().optional(),
  },
  async ({ item_id, expected_type, expected_preview }) =>
    textResult(
      await apiRequest('POST', `/risup/prompt-item-by-id/${encodeURIComponent(item_id)}/delete`, {
        expected_type,
        expected_preview,
      }),
    ),
);

server.tool(
  'write_risup_prompt_item_by_id_batch',
  'Replaces multiple supported risup prompt items by stable ids in one confirmed operation. Use for granular batch workflows; facade id selectors remain preferred for simple writes. Requires user confirmation.',
  {
    writes: z
      .array(
        z.object({
          item_id: z.string().min(1),
          item: z.record(z.string(), z.unknown()),
          expected_type: z.string().optional(),
          expected_preview: z.string().optional(),
        }),
      )
      .max(50),
  },
  async ({ writes }) => textResult(await apiRequest('POST', '/risup/prompt-item/batch-write-by-id', { writes })),
);

server.tool(
  'batch_delete_risup_prompt_items_by_id',
  'Deletes multiple supported risup prompt items by stable ids in one confirmed operation. Requires user confirmation.',
  {
    item_ids: z.array(z.string().min(1)).max(50),
    expected_types: z.array(z.string()).max(50).optional(),
    expected_previews: z.array(z.string()).max(50).optional(),
  },
  async ({ item_ids, expected_types, expected_previews }) =>
    textResult(
      await apiRequest('POST', '/risup/prompt-item/batch-delete-by-id', {
        item_ids,
        expected_types,
        expected_previews,
      }),
    ),
);

server.tool(
  'reorder_risup_prompt_items_by_id',
  'Reorders all supported risup prompt items by a full stable-id permutation. Use when order may have shifted since index discovery. Requires user confirmation.',
  { order_ids: z.array(z.string().min(1)).describe('Full prompt item id permutation in the desired order.') },
  async ({ order_ids }) => textResult(await apiRequest('POST', '/risup/prompt-item/reorder-by-id', { order_ids })),
);

server.tool(
  'read_risup_formating_order',
  'Reads the risup formatingOrder as a list of tokens with known/unknown flags. Includes an additive "warnings" array with informational diagnostics for duplicate or dangling token references. The current file must be a .risup preset. Returns 400 if formatingOrder JSON is invalid.',
  {},
  async () => textResult(await apiRequest('GET', '/risup/formating-order')),
);

server.tool(
  'write_risup_formating_order',
  'Writes the risup formatingOrder. All tokens must be strings; unknown tokens are preserved as-is. Non-string tokens are rejected with 400. Requires user confirmation. Successful responses include an additive "warnings" array with duplicate/dangling token diagnostics relative to the current promptTemplate.',
  {
    items: z
      .array(z.object({ token: z.string().describe('Formating order token (e.g. "main", "chats", "lorebook")') }))
      .describe(
        'Ordered list of token objects. Known tokens: main, jailbreak, chats, lorebook, globalNote, authorNote, lastChat, description, postEverything, personaPrompt. Unknown string tokens are accepted.',
      ),
  },
  async ({ items }) => textResult(await apiRequest('POST', '/risup/formating-order', { items })),
);

server.tool(
  'diff_risup_prompt',
  'Compares the current .risup prompt surface against a loaded reference .risup file. Returns serializer-based promptTemplate line differences plus formatingOrder token differences and warnings. This is a compare precursor for prompt editing workflows and does not mutate the file.',
  {
    refIndex: z
      .number()
      .describe('Reference file index from list_references. The selected reference must be a .risup preset.'),
  },
  async ({ refIndex }) => textResult(await apiRequest('POST', '/risup/prompt-diff', { refIndex })),
);

server.tool(
  'export_risup_prompt_to_text',
  'Exports the current risup promptTemplate to a structured text format intended for human review or text-based editing. The output preserves supported item IDs, supported-item extra JSON fields, and unsupported/raw items through explicit raw blocks. The current file must be a .risup preset.',
  {},
  async () => textResult(await apiRequest('GET', '/risup/prompt-text')),
);

server.tool(
  'copy_risup_prompt_items_as_text',
  'Copies selected risup promptTemplate items to the structured text format without exporting the whole template. The order of the indices array controls the output order, so this is the preferred block-level reuse tool before reaching for a persistent library. The current file must be a .risup preset.',
  {
    indices: z
      .array(z.number())
      .min(1)
      .max(50)
      .describe('Zero-based prompt item indices to export as text, in output order.'),
  },
  async ({ indices }) => textResult(await apiRequest('POST', '/risup/prompt-text/copy', { indices })),
);

server.tool(
  'import_risup_prompt_from_text',
  'Imports the structured risup prompt text format. By default it replaces the entire promptTemplate; set mode="append" to insert the parsed items into the existing template, optionally at insertAt. Set dry_run=true to validate and preview the parsed items without mutating the file. The current file must be a .risup preset. Requires user confirmation unless dry_run is used. Dry-run and successful mutation responses may include additive "orderWarnings".',
  {
    text: z.string().describe('Structured prompt text, usually from export_risup_prompt_to_text after manual edits.'),
    dry_run: z
      .boolean()
      .optional()
      .describe('When true, validate and preview the import without writing promptTemplate.'),
    mode: z
      .enum(['replace', 'append'])
      .optional()
      .describe(
        'replace = overwrite the whole template (default), append = insert parsed items into the current template.',
      ),
    insertAt: z
      .number()
      .optional()
      .describe('When mode="append", zero-based insertion position. Default: append to the end.'),
  },
  async ({ text, dry_run, mode, insertAt }) =>
    textResult(await apiRequest('POST', '/risup/prompt-text/import', { text, dry_run, mode, insertAt })),
);

server.tool(
  'list_risup_prompt_snippets',
  'Lists persistent risup prompt snippets stored in the app sidecar library. This library survives app restarts and is intended for reusable prompt blocks built on the structured text serializer.',
  {},
  async () => textResult(await apiRequest('GET', '/risup/prompt-snippets')),
);

server.tool(
  'read_risup_prompt_snippet',
  'Reads one persistent risup prompt snippet by snippet id or exact name. Returns the stored structured text plus snippet metadata, so it can be reviewed or reused before insertion.',
  {
    identifier: z.string().describe('Snippet id or exact snippet name from list_risup_prompt_snippets.'),
  },
  async ({ identifier }) => textResult(await apiRequest('POST', '/risup/prompt-snippets/read', { identifier })),
);

server.tool(
  'save_risup_prompt_snippet',
  'Saves or updates a persistent risup prompt snippet in the app sidecar library. Provide exactly one source: either serializer text via text, or current promptTemplate blocks via indices. Requires user confirmation.',
  {
    name: z.string().describe('Snippet name. Saving the same name again updates the existing snippet.'),
    text: z.string().optional().describe('Structured prompt text to persist as a snippet.'),
    indices: z
      .array(z.number())
      .min(1)
      .max(50)
      .optional()
      .describe('Current promptTemplate indices to serialize and save as a snippet. Requires an open .risup file.'),
  },
  async ({ name, text, indices }) =>
    textResult(await apiRequest('POST', '/risup/prompt-snippets/save', { name, text, indices })),
);

server.tool(
  'insert_risup_prompt_snippet',
  'Inserts a stored risup prompt snippet into the current .risup promptTemplate using fresh item ids. Set dry_run=true to preview the insertion without mutating the file. Requires user confirmation unless dry_run is used. Successful responses may include additive "orderWarnings".',
  {
    identifier: z.string().describe('Snippet id or exact snippet name from list_risup_prompt_snippets.'),
    dry_run: z
      .boolean()
      .optional()
      .describe('When true, validate and preview the insertion without writing promptTemplate.'),
    insertAt: z.number().optional().describe('Zero-based insertion position. Default: append to the end.'),
  },
  async ({ identifier, dry_run, insertAt }) =>
    textResult(await apiRequest('POST', '/risup/prompt-snippets/insert', { identifier, dry_run, insertAt })),
);

server.tool(
  'delete_risup_prompt_snippet',
  'Deletes a persistent risup prompt snippet from the app sidecar library by snippet id or exact name. Requires user confirmation.',
  {
    identifier: z.string().describe('Snippet id or exact snippet name from list_risup_prompt_snippets.'),
  },
  async ({ identifier }) => textResult(await apiRequest('POST', '/risup/prompt-snippets/delete', { identifier })),
);

server.tool(
  'validate_risup_prompt_import',
  'Validates that the current promptTemplate matches the expected text after import_risup_prompt_from_text. Compares each item by serialized text (ignoring generated IDs) and reports match/mismatch per item. Read-only — no mutation.',
  {
    text: z.string().describe('The same structured prompt text that was passed to import_risup_prompt_from_text.'),
  },
  async ({ text }) => textResult(await apiRequest('POST', '/risup/prompt-text/verify', { text })),
);

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
        content: { type: 'text' as const, text: buildDanbooruGuide(character_description) },
      },
    ],
  }),
);

// ==================== Apply Taxonomy Annotations ====================

// Patch MCP SDK ToolAnnotations onto every registered tool using the taxonomy.
// Uses the collected RegisteredTool handles and the public update() API.
{
  for (const [name, entry] of Object.entries(TOOL_TAXONOMY)) {
    const handle = _registeredToolHandles.get(name);
    if (handle) {
      handle.update({ annotations: entry.hints, _meta: getToolMeta(name) });
    }
  }
}

// ==================== Start ====================

function getDefaultStandaloneUserDataPath(): string {
  return path.join(os.homedir(), '.risutoki', 'mcp-standalone');
}

function getStandaloneUserDataPath(args = process.argv.slice(2)): string {
  return (
    readArgValue(args, '--user-data-dir') ??
    process.env.RISUTOKI_MCP_USER_DATA_DIR ??
    getDefaultStandaloneUserDataPath()
  );
}

function getStandaloneAllowWrites(args = process.argv.slice(2)): boolean {
  return (
    hasFlag(args, '--allow-writes') ||
    process.env.RISUTOKI_MCP_ALLOW_WRITES === '1' ||
    process.env.RISUTOKI_MCP_ALLOW_WRITES === 'true'
  );
}

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
    const runtime = await startHeadlessFromArgs(process.argv.slice(2));
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
  if (configuredToolProfile.raw !== undefined && configuredToolProfile.resolved === undefined) {
    logProcessDiagnostic('toolProfileWarning', {
      requestedProfile: configuredToolProfile.raw,
      source: configuredToolProfile.source,
      message: 'Unknown tool profile; registering the unfiltered compatible tool surface.',
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
    registeredTools: registeredToolNames().length,
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
    registeredTools: registeredToolNames().length,
    skew: runtime.skew,
    api: `127.0.0.1:${TOKI_PORT}`,
  });
}

function readArgValue(args: string[], name: string): string | undefined {
  const inlinePrefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return undefined;
}

function readRepeatedArgValues(args: string[], name: string): string[] {
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

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

async function startHeadlessFromArgs(args: string[]) {
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
    baseRoot: __dirname,
  });
}

main().catch((err) => {
  logProcessDiagnostic('fatal', { error: err });
  process.stderr.write(`[toki-mcp] fatal: ${err}\n`);
  process.exit(1);
});
