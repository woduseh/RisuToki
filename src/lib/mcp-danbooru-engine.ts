import * as fs from 'node:fs';
import * as https from 'node:https';

export interface DanbooruTag {
  id: number;
  name: string;
  category: number;
  count: number;
}

export interface TagValidationResult {
  tag: string;
  status: 'valid' | 'invalid' | 'unknown';
  valid: boolean | null;
  postCount?: number;
  category?: string;
  source?: 'local' | 'online';
  suggestions?: string[];
  networkDegraded?: boolean;
  reason?: string;
}

export interface DanbooruEngineOptions {
  tagFilePath: string;
  log: (level: 'debug' | 'info' | 'warning' | 'error', message: string) => void;
}

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

export function createDanbooruEngine(options: DanbooruEngineOptions) {
  const tagMap = new Map<string, DanbooruTag>();
  let tagsByCount: DanbooruTag[] = [];
  let tagsLoaded = false;
  const apiCache = new Map<string, DanbooruTag | null>();
  const suggestCache = new Map<string, string[]>();
  let popularGroupedCache: Record<string, string[]> | null = null;

  const apiCacheSet = (key: string, value: DanbooruTag | null): void => {
    if (apiCache.size >= 5000) {
      const firstKey = apiCache.keys().next().value;
      if (firstKey !== undefined) apiCache.delete(firstKey);
    }
    apiCache.set(key, value);
  };

  const loadTags = (): void => {
    try {
      const content = fs.readFileSync(options.tagFilePath, 'utf-8');
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
      options.log('info', `Loaded ${tagMap.size} Danbooru tags`);
    } catch (error) {
      options.log('warning', `Failed to load tags: ${error}`);
    }
  };

  const ensureTagsLoaded = (): void => {
    if (!tagsLoaded) {
      loadTags();
      if (!tagsLoaded) throw new Error('Tag database not loaded');
    }
  };

  const levenshtein = (a: string, b: string): number => {
    const m = a.length;
    const n = b.length;
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
  };

  const suggestSimilar = (tag: string, limit = 5): string[] => {
    const cacheKey = `${tag}:${limit}`;
    const cached = suggestCache.get(cacheKey);
    if (cached) return cached;

    const scored: Array<{ name: string; score: number }> = [];
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
    const result = scored.slice(0, limit).map((entry) => entry.name);

    if (suggestCache.size >= 500) {
      const firstKey = suggestCache.keys().next().value;
      if (firstKey !== undefined) suggestCache.delete(firstKey);
    }
    suggestCache.set(cacheKey, result);
    return result;
  };

  const searchTags = (query: string, category?: string, limit = 20): DanbooruTag[] => {
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
  };

  const getPopular = (category?: string, limit = 100): DanbooruTag[] => {
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
  };

  const getPopularGrouped = (): Record<string, string[]> => {
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
      groups[groupName] = matched.slice(0, 30).map((tag) => tag.name);
    }
    popularGroupedCache = groups;
    return groups;
  };

  const formatTags = (tags: DanbooruTag[]): Array<{ name: string; category: string; post_count: number }> =>
    tags.map((tag) => ({
      name: tag.name,
      category: CATEGORY_NAMES[tag.category] || 'unknown',
      post_count: tag.count,
    }));

  type DanbooruValidationLookup =
    | { status: 'found'; tag: DanbooruTag }
    | { status: 'not_found' }
    | { status: 'degraded'; reason: string };

  const danbooruApiValidate = (tagName: string, signal?: AbortSignal): Promise<DanbooruValidationLookup> => {
    const key = `validate:${tagName}`;
    if (apiCache.has(key)) {
      const cached = apiCache.get(key);
      return Promise.resolve(cached ? { status: 'found', tag: cached } : { status: 'not_found' });
    }

    return new Promise((resolve) => {
      const url = `https://danbooru.donmai.us/tags.json?search%5Bname%5D=${encodeURIComponent(tagName)}&limit=1`;
      const request = https.get(url, { timeout: 5000, signal }, (response) => {
        const chunks: string[] = [];
        response.on('data', (chunk: string) => chunks.push(chunk));
        response.on('end', () => {
          if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
            resolve({ status: 'degraded', reason: `HTTP ${response.statusCode}` });
            return;
          }
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
              resolve({ status: 'not_found' });
            } else {
              apiCacheSet(key, tag);
              resolve(tag ? { status: 'found', tag } : { status: 'not_found' });
            }
          } catch (error) {
            resolve({
              status: 'degraded',
              reason: `Invalid API response: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        });
      });
      request.on('error', (error) => {
        resolve({ status: 'degraded', reason: error.message });
      });
      request.on('timeout', () => {
        request.destroy();
        resolve({ status: 'degraded', reason: 'Request timed out' });
      });
    });
  };

  const danbooruApiSearch = (query: string, limit = 20, signal?: AbortSignal): Promise<DanbooruTag[]> =>
    new Promise((resolve) => {
      const nameMatch = query.includes('*') ? query : `*${query}*`;
      const url = `https://danbooru.donmai.us/tags.json?search%5Bname_matches%5D=${encodeURIComponent(nameMatch)}&search%5Border%5D=count&limit=${limit}`;
      const request = https.get(url, { timeout: 5000, signal }, (response) => {
        const chunks: string[] = [];
        response.on('data', (chunk: string) => chunks.push(chunk));
        response.on('end', () => {
          try {
            const results = JSON.parse(chunks.join(''));
            if (!Array.isArray(results)) {
              resolve([]);
              return;
            }
            const tags = results.map((result: Record<string, unknown>) => ({
              id: result.id as number,
              name: result.name as string,
              category: result.category as number,
              count: result.post_count as number,
            }));
            for (const tag of tags) apiCacheSet(`validate:${tag.name}`, tag);
            resolve(tags);
          } catch {
            resolve([]);
          }
        });
      });
      request.on('error', () => {
        resolve([]);
      });
      request.on('timeout', () => {
        request.destroy();
        resolve([]);
      });
    });

  const validateTags = async (
    tags: string[],
    onlineFallback = true,
    signal?: AbortSignal,
  ): Promise<TagValidationResult[]> => {
    const results: TagValidationResult[] = [];
    for (const tagName of tags) {
      const normalized = tagName.trim().toLowerCase().replace(/\s+/g, '_');
      const localTag = tagMap.get(normalized);
      if (localTag) {
        results.push({
          tag: normalized,
          status: 'valid',
          valid: true,
          postCount: localTag.count,
          category: CATEGORY_NAMES[localTag.category] || 'unknown',
          source: 'local',
        });
        continue;
      }
      if (onlineFallback) {
        const onlineLookup = await danbooruApiValidate(normalized, signal);
        if (onlineLookup.status === 'found') {
          const onlineTag = onlineLookup.tag;
          results.push({
            tag: normalized,
            status: 'valid',
            valid: true,
            postCount: onlineTag.count,
            category: CATEGORY_NAMES[onlineTag.category] || 'unknown',
            source: 'online',
          });
          continue;
        }
        if (onlineLookup.status === 'degraded') {
          results.push({
            tag: normalized,
            status: 'unknown',
            valid: null,
            networkDegraded: true,
            reason: onlineLookup.reason,
          });
          continue;
        }
      }
      const suggestions = suggestSimilar(normalized, 5);
      results.push({
        tag: normalized,
        status: 'invalid',
        valid: false,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      });
    }
    return results;
  };

  const searchWithOnline = async (
    query: string,
    category?: string,
    limit = 20,
    signal?: AbortSignal,
  ): Promise<DanbooruTag[]> => {
    const localResults = searchTags(query, category, limit);
    if (localResults.length >= limit) return localResults;
    try {
      const remaining = limit - localResults.length;
      const onlineResults = await danbooruApiSearch(query, remaining, signal);
      const localNames = new Set(localResults.map((tag) => tag.name));
      for (const online of onlineResults) {
        if (localNames.has(online.name)) continue;
        if (category && CATEGORY_IDS[category] !== undefined && online.category !== CATEGORY_IDS[category]) continue;
        localResults.push(online);
        if (localResults.length >= limit) break;
      }
    } catch {
      // Online search failed, so return the local results.
    }
    return localResults;
  };

  const buildGuide = (characterDescription?: string): string => {
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
          const displayName = group.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
          guide += `\n### ${displayName}\n\`${tags.slice(0, 20).join(', ')}\`\n`;
        }
      }
    }

    if (characterDescription) {
      guide += `\n## Your Character Description\n"${characterDescription}"\n\nPlease use the tags above and the \`search_danbooru_tags\` tool to find appropriate tags for this character. Validate all tags with \`validate_danbooru_tags\` before creating the prompt.\n`;
    }
    return guide;
  };

  const getStatus = () => ({
    loaded: tagsLoaded,
    tagCount: tagMap.size,
    filePath: options.tagFilePath,
    fileExists: fs.existsSync(options.tagFilePath),
  });

  loadTags();

  return {
    buildGuide,
    ensureTagsLoaded,
    formatTags,
    getPopular,
    getPopularGrouped,
    getStatus,
    searchWithOnline,
    validateTags,
  };
}
