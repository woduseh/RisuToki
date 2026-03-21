'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// RisuToki MCP Server
// MCP SDK (StdioServerTransport) + Zod validation
// Communicates with RisuToki via local HTTP API
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require("http");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const https = require("https");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const TOKI_PORT = process.env.TOKI_PORT;
const TOKI_TOKEN = process.env.TOKI_TOKEN;
if (!TOKI_PORT || !TOKI_TOKEN) {
    process.stderr.write('[toki-mcp] ERROR: TOKI_PORT and TOKI_TOKEN env vars required\n');
    process.exit(1);
}
// ==================== Danbooru Tag Database ====================
const CATEGORY_NAMES = {
    0: 'general',
    1: 'artist',
    3: 'copyright',
    4: 'character',
    5: 'meta',
    9: 'rating',
};
const CATEGORY_IDS = {
    general: 0,
    artist: 1,
    copyright: 3,
    character: 4,
    meta: 5,
    rating: 9,
};
const SEMANTIC_GROUPS = {
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
const tagMap = new Map();
let tagsByCount = [];
let tagsLoaded = false;
const apiCache = new Map();
function loadTags() {
    const tagFilePath = path.join(__dirname, 'resources', 'Danbooru Tag.txt');
    try {
        const content = fs.readFileSync(tagFilePath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line)
                continue;
            const parts = line.split(',');
            if (parts.length < 4)
                continue;
            const tag = {
                id: parseInt(parts[0], 10),
                name: parts[1],
                category: parseInt(parts[2], 10),
                count: parseInt(parts[3], 10),
            };
            tagMap.set(tag.name, tag);
        }
        tagsByCount = Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
        tagsLoaded = true;
        process.stderr.write(`[toki-mcp] Loaded ${tagMap.size} Danbooru tags\n`);
    }
    catch (err) {
        process.stderr.write(`[toki-mcp] Failed to load tags: ${err}\n`);
    }
}
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++)
        dp[i][0] = i;
    for (let j = 0; j <= n; j++)
        dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}
function suggestSimilar(tag, limit = 5) {
    const scored = [];
    for (const [name, tagData] of tagMap) {
        if (Math.abs(name.length - tag.length) > 5)
            continue;
        const distance = levenshtein(tag, name);
        const maxLen = Math.max(tag.length, name.length);
        const similarity = 1 - distance / maxLen;
        if (similarity >= 0.4) {
            const popularityBoost = Math.log10(tagData.count + 1) / 10;
            scored.push({ name, score: similarity + popularityBoost });
        }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.name);
}
function searchTags(query, category, limit = 20) {
    const normalized = query.trim().toLowerCase().replace(/\s+/g, '_');
    const catId = category ? CATEGORY_IDS[category] : undefined;
    const results = [];
    const hasWildcard = normalized.includes('*');
    if (hasWildcard) {
        const regexStr = normalized.replace(/\*/g, '.*').replace(/\?/g, '.');
        const regex = new RegExp(`^${regexStr}$`);
        for (const tag of tagsByCount) {
            if (catId !== undefined && tag.category !== catId)
                continue;
            if (regex.test(tag.name)) {
                results.push(tag);
                if (results.length >= limit)
                    break;
            }
        }
    }
    else {
        const exact = tagMap.get(normalized);
        if (exact && (catId === undefined || exact.category === catId))
            results.push(exact);
        for (const tag of tagsByCount) {
            if (results.length >= limit)
                break;
            if (catId !== undefined && tag.category !== catId)
                continue;
            if (tag.name === normalized)
                continue;
            if (tag.name.startsWith(normalized))
                results.push(tag);
        }
        if (results.length < limit) {
            for (const tag of tagsByCount) {
                if (results.length >= limit)
                    break;
                if (catId !== undefined && tag.category !== catId)
                    continue;
                if (tag.name.startsWith(normalized))
                    continue;
                if (tag.name.includes(normalized))
                    results.push(tag);
            }
        }
    }
    return results;
}
function getPopular(category, limit = 100) {
    const catId = category ? CATEGORY_IDS[category] : undefined;
    if (catId === undefined)
        return tagsByCount.slice(0, limit);
    const results = [];
    for (const tag of tagsByCount) {
        if (tag.category === catId) {
            results.push(tag);
            if (results.length >= limit)
                break;
        }
    }
    return results;
}
function getPopularGrouped() {
    const groups = {};
    for (const [groupName, patterns] of Object.entries(SEMANTIC_GROUPS)) {
        const matched = [];
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
    return groups;
}
function formatTags(tags) {
    return tags.map((t) => ({ name: t.name, category: CATEGORY_NAMES[t.category] || 'unknown', post_count: t.count }));
}
function danbooruApiValidate(tagName) {
    const key = `validate:${tagName}`;
    if (apiCache.has(key))
        return Promise.resolve(apiCache.get(key));
    return new Promise((resolve) => {
        const url = `https://danbooru.donmai.us/tags.json?search%5Bname%5D=${encodeURIComponent(tagName)}&limit=1`;
        const req = https.get(url, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    const tag = Array.isArray(results) && results.length > 0
                        ? {
                            id: results[0].id,
                            name: results[0].name,
                            category: results[0].category,
                            count: results[0].post_count,
                        }
                        : null;
                    if (tag && results[0].is_deprecated) {
                        apiCache.set(key, null);
                        resolve(null);
                    }
                    else {
                        apiCache.set(key, tag);
                        resolve(tag);
                    }
                }
                catch {
                    apiCache.set(key, null);
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
function danbooruApiSearch(query, limit = 20) {
    return new Promise((resolve) => {
        const nameMatch = query.includes('*') ? query : `*${query}*`;
        const url = `https://danbooru.donmai.us/tags.json?search%5Bname_matches%5D=${encodeURIComponent(nameMatch)}&search%5Border%5D=count&limit=${limit}`;
        const req = https.get(url, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    if (!Array.isArray(results)) {
                        resolve([]);
                        return;
                    }
                    const tags = results.map((r) => ({
                        id: r.id,
                        name: r.name,
                        category: r.category,
                        count: r.post_count,
                    }));
                    for (const tag of tags)
                        apiCache.set(`validate:${tag.name}`, tag);
                    resolve(tags);
                }
                catch {
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
async function validateTags(tags, onlineFallback = true) {
    const results = [];
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
async function searchWithOnline(query, category, limit = 20) {
    const localResults = searchTags(query, category, limit);
    if (localResults.length >= limit)
        return localResults;
    try {
        const remaining = limit - localResults.length;
        const onlineResults = await danbooruApiSearch(query, remaining);
        const localNames = new Set(localResults.map((t) => t.name));
        for (const online of onlineResults) {
            if (localNames.has(online.name))
                continue;
            if (category && CATEGORY_IDS[category] !== undefined && online.category !== CATEGORY_IDS[category])
                continue;
            localResults.push(online);
            if (localResults.length >= limit)
                break;
        }
    }
    catch {
        /* online search failed, return local only */
    }
    return localResults;
}
function buildDanbooruGuide(characterDescription) {
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
function textResult(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
// ==================== HTTP Client ====================
async function apiRequest(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = {
            Authorization: `Bearer ${TOKI_TOKEN}`,
            'Content-Type': 'application/json',
        };
        if (payload) {
            headers['Content-Length'] = Buffer.byteLength(payload);
        }
        const options = {
            hostname: '127.0.0.1',
            port: TOKI_PORT,
            path: urlPath,
            method: method,
            headers: headers,
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
                    }
                    else {
                        resolve(parsed);
                    }
                }
                catch {
                    reject(new Error(`Invalid response: ${data}`));
                }
            });
        });
        req.on('error', (err) => reject(err));
        req.setTimeout(120000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        if (payload)
            req.write(payload);
        req.end();
    });
}
// ==================== MCP Server Setup ====================
const server = new mcp_js_1.McpServer({ name: 'risutoki', version: '1.1.0' });
// ===== Field Tools =====
server.tool('list_fields', '현재 열린 파일(.charx, .risum, .risup)의 편집 가능한 필드 목록과 크기를 확인합니다. 응답에 fileType 포함.', {}, async () => textResult(await apiRequest('GET', '/fields')));
server.tool('read_field', '필드의 전체 내용을 읽습니다. ⚠️ 주의: alternateGreetings/groupOnlyGreetings는 list_greetings → read_greeting, triggerScripts는 list_triggers → read_trigger, lua는 list_lua → read_lua, css는 list_css → read_css를 사용하세요. 이 도구로 이들을 읽으면 전체 내용이 한번에 반환되어 비효율적입니다. 공통 필드: globalNote, firstMessage, defaultVariables, description, name. charx 전용: personality, scenario, creatorcomment, tags, exampleMessage, systemPrompt, creator, characterVersion, nickname, source, creationDate(읽기전용), modificationDate(읽기전용), additionalText, license. risum 전용: cjs, lowLevelAccess, hideIcon, backgroundEmbedding, moduleNamespace, customModuleToggle, mcpUrl, moduleName, moduleDescription, moduleId(읽기전용). risup 전용: mainPrompt, jailbreak, temperature, maxContext, maxResponse, frequencyPenalty, presencePenalty, aiModel, subModel, apiType 등', { field: zod_1.z.string().describe('필드 이름') }, async ({ field }) => textResult(await apiRequest('GET', `/field/${encodeURIComponent(field)}`)));
server.tool('write_field', '필드에 새 내용을 씁니다. 에디터에서 사용자 확인 팝업이 뜹니다. 공통 필드: lua, triggerScripts, globalNote, firstMessage, alternateGreetings, groupOnlyGreetings, css, defaultVariables, description, name. charx 전용: personality, scenario, creatorcomment, tags, exampleMessage, systemPrompt, creator, characterVersion, nickname, source, additionalText, license. risum 전용: cjs, lowLevelAccess(boolean), hideIcon(boolean), backgroundEmbedding, moduleNamespace, customModuleToggle, mcpUrl, moduleName, moduleDescription. risup 전용: mainPrompt, jailbreak, temperature(number), maxContext(number), maxResponse(number), frequencyPenalty(number), presencePenalty(number), aiModel, subModel, apiType, promptPreprocess(boolean), promptTemplate(JSON), presetBias(JSON), formatingOrder(JSON), presetImage, top_p(number), top_k(number), repetition_penalty(number), min_p(number), top_a(number), reasonEffort(number), thinkingTokens(number), thinkingType, adaptiveThinkingEffort, useInstructPrompt(boolean), instructChatTemplate, JinjaTemplate, customPromptTemplateToggle, templateDefaultVariables, moduleIntergration, jsonSchemaEnabled(boolean), jsonSchema, strictJsonSchema(boolean), extractJson, groupTemplate, groupOtherBotRole, autoSuggestPrompt, autoSuggestPrefix, autoSuggestClean(boolean), localStopStrings(JSON), outputImageModal(boolean), verbosity(number), fallbackWhenBlankResponse(boolean), systemContentReplacement, systemRoleReplacement', {
    field: zod_1.z.string().describe('필드 이름'),
    content: zod_1.z
        .union([zod_1.z.string(), zod_1.z.array(zod_1.z.string()), zod_1.z.boolean(), zod_1.z.number()])
        .describe('새로운 내용. alternateGreetings/groupOnlyGreetings/tags/source는 문자열 배열, triggerScripts는 JSON 문자열, boolean 필드는 boolean, number 필드는 number, 나머지는 문자열'),
}, async ({ field, content }) => textResult(await apiRequest('POST', `/field/${encodeURIComponent(field)}`, { content })));
// ===== Lorebook Tools =====
server.tool('list_lorebook', '로어북 항목 목록을 확인합니다 (인덱스, 코멘트, 키, 활성화 상태, content 크기, 폴더). 응답에 폴더 요약(folders)도 포함됩니다. 항목이 수백 개일 수 있으므로 folder 또는 filter 파라미터로 범위를 좁히세요.', {
    filter: zod_1.z.string().optional().describe('검색 키워드 (comment, key에서 검색). 생략 시 전체 목록 반환'),
    folder: zod_1.z.string().optional().describe('폴더 UUID로 필터 (예: "folder:xxxx" 또는 UUID만). 생략 시 전체 반환'),
}, async ({ filter, folder }) => {
    const params = new URLSearchParams();
    if (filter)
        params.set('filter', filter);
    if (folder)
        params.set('folder', folder);
    const qs = params.toString();
    return textResult(await apiRequest('GET', qs ? `/lorebook?${qs}` : '/lorebook'));
});
server.tool('read_lorebook', '특정 인덱스의 로어북 항목 전체 데이터를 읽습니다.', { index: zod_1.z.number().describe('로어북 항목 인덱스') }, async ({ index }) => textResult(await apiRequest('GET', `/lorebook/${index}`)));
server.tool('write_lorebook', '특정 인덱스의 로어북 항목을 수정합니다. 사용자 확인 필요.', {
    index: zod_1.z.number().describe('로어북 항목 인덱스'),
    data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).describe('수정할 로어북 데이터 (부분 또는 전체)'),
}, async ({ index, data }) => textResult(await apiRequest('POST', `/lorebook/${index}`, data)));
server.tool('add_lorebook', '새 로어북 항목을 추가합니다. 사용자 확인 필요.', { data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).describe('로어북 항목 데이터 (key, comment, content 등)') }, async ({ data }) => textResult(await apiRequest('POST', '/lorebook/add', data)));
server.tool('delete_lorebook', '특정 인덱스의 로어북 항목을 삭제합니다. 사용자 확인 필요.', { index: zod_1.z.number().describe('삭제할 로어북 항목 인덱스') }, async ({ index }) => textResult(await apiRequest('POST', `/lorebook/${index}/delete`)));
// ===== Regex Tools =====
server.tool('list_regex', '정규식 스크립트 항목 목록을 확인합니다 (인덱스, comment, type, findSize, replaceSize).', {}, async () => textResult(await apiRequest('GET', '/regex')));
server.tool('read_regex', '특정 인덱스의 정규식 항목을 읽습니다.', { index: zod_1.z.number().describe('정규식 항목 인덱스') }, async ({ index }) => textResult(await apiRequest('GET', `/regex/${index}`)));
server.tool('write_regex', '특정 인덱스의 정규식 항목을 수정합니다. 사용자 확인 필요.', {
    index: zod_1.z.number().describe('정규식 항목 인덱스'),
    data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).describe('수정할 정규식 데이터'),
}, async ({ index, data }) => textResult(await apiRequest('POST', `/regex/${index}`, data)));
server.tool('add_regex', '새 정규식 항목을 추가합니다. 사용자 확인 필요.', { data: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).describe('정규식 항목 데이터 (comment, type, find, replace, flag)') }, async ({ data }) => textResult(await apiRequest('POST', '/regex/add', data)));
server.tool('delete_regex', '특정 인덱스의 정규식 항목을 삭제합니다. 사용자 확인 필요.', { index: zod_1.z.number().describe('삭제할 정규식 항목 인덱스') }, async ({ index }) => textResult(await apiRequest('POST', `/regex/${index}/delete`)));
// ===== Greeting Tools =====
server.tool('list_greetings', '인사말 목록을 확인합니다 (인덱스, 크기, 미리보기 100자). type="alternate"는 추가 첫 메시지(alternateGreetings), type="group"은 그룹 전용 인사말(groupOnlyGreetings). read_field("alternateGreetings") 대신 이 도구를 사용하세요 — 전체 덤프를 방지합니다.', {
    type: zod_1.z.enum(['alternate', 'group']).describe('"alternate" (추가 첫 메시지) 또는 "group" (그룹 전용 인사말)'),
}, async ({ type }) => textResult(await apiRequest('GET', `/greetings/${type}`)));
server.tool('read_greeting', '특정 인덱스의 인사말 하나를 읽습니다. list_greetings로 목록을 먼저 확인하세요.', {
    type: zod_1.z.enum(['alternate', 'group']).describe('"alternate" 또는 "group"'),
    index: zod_1.z.number().describe('인사말 인덱스 (list_greetings 결과 참조)'),
}, async ({ type, index }) => textResult(await apiRequest('GET', `/greeting/${type}/${index}`)));
server.tool('write_greeting', '특정 인덱스의 인사말을 수정합니다. 사용자 확인 필요.', {
    type: zod_1.z.enum(['alternate', 'group']).describe('"alternate" 또는 "group"'),
    index: zod_1.z.number().describe('인사말 인덱스'),
    content: zod_1.z.string().describe('새로운 인사말 텍스트'),
}, async ({ type, index, content }) => textResult(await apiRequest('POST', `/greeting/${type}/${index}`, { content })));
server.tool('add_greeting', '새 인사말을 추가합니다. 사용자 확인 필요.', {
    type: zod_1.z.enum(['alternate', 'group']).describe('"alternate" 또는 "group"'),
    content: zod_1.z.string().describe('인사말 텍스트'),
}, async ({ type, content }) => textResult(await apiRequest('POST', `/greeting/${type}/add`, { content })));
server.tool('delete_greeting', '특정 인덱스의 인사말을 삭제합니다. 사용자 확인 필요.', {
    type: zod_1.z.enum(['alternate', 'group']).describe('"alternate" 또는 "group"'),
    index: zod_1.z.number().describe('삭제할 인사말 인덱스'),
}, async ({ type, index }) => textResult(await apiRequest('POST', `/greeting/${type}/${index}/delete`)));
// ===== Trigger Tools =====
server.tool('list_triggers', '트리거 스크립트 목록을 확인합니다 (인덱스, comment, type, conditionCount, effectCount, lowLevelAccess). read_field("triggerScripts") 대신 이 도구를 사용하세요 — 전체 JSON 덤프를 방지합니다.', {}, async () => textResult(await apiRequest('GET', '/triggers')));
server.tool('read_trigger', '특정 인덱스의 트리거 스크립트를 읽습니다. list_triggers로 목록을 먼저 확인하세요.', { index: zod_1.z.number().describe('트리거 인덱스 (list_triggers 결과 참조)') }, async ({ index }) => textResult(await apiRequest('GET', `/trigger/${index}`)));
server.tool('write_trigger', '특정 인덱스의 트리거 스크립트를 수정합니다. 변경할 필드만 전달하면 나머지는 유지됩니다. 사용자 확인 필요.', {
    index: zod_1.z.number().describe('트리거 인덱스'),
    comment: zod_1.z.string().optional().describe('트리거 이름/설명'),
    type: zod_1.z.string().optional().describe('트리거 타입 (start, input, output 등)'),
    conditions: zod_1.z.array(zod_1.z.unknown()).optional().describe('조건 배열'),
    effect: zod_1.z.array(zod_1.z.unknown()).optional().describe('효과 배열'),
    lowLevelAccess: zod_1.z.boolean().optional().describe('저수준 접근 여부'),
}, async ({ index, comment, type, conditions, effect, lowLevelAccess }) => {
    const body = {};
    if (comment !== undefined)
        body.comment = comment;
    if (type !== undefined)
        body.type = type;
    if (conditions !== undefined)
        body.conditions = conditions;
    if (effect !== undefined)
        body.effect = effect;
    if (lowLevelAccess !== undefined)
        body.lowLevelAccess = lowLevelAccess;
    return textResult(await apiRequest('POST', `/trigger/${index}`, body));
});
server.tool('add_trigger', '새 트리거 스크립트를 추가합니다. 사용자 확인 필요.', {
    comment: zod_1.z.string().optional().describe('트리거 이름/설명'),
    type: zod_1.z.string().optional().describe('트리거 타입 (기본: "start")'),
    conditions: zod_1.z.array(zod_1.z.unknown()).optional().describe('조건 배열'),
    effect: zod_1.z.array(zod_1.z.unknown()).optional().describe('효과 배열'),
    lowLevelAccess: zod_1.z.boolean().optional().describe('저수준 접근 여부'),
}, async ({ comment, type, conditions, effect, lowLevelAccess }) => {
    const body = {};
    if (comment !== undefined)
        body.comment = comment;
    if (type !== undefined)
        body.type = type;
    if (conditions !== undefined)
        body.conditions = conditions;
    if (effect !== undefined)
        body.effect = effect;
    if (lowLevelAccess !== undefined)
        body.lowLevelAccess = lowLevelAccess;
    return textResult(await apiRequest('POST', '/trigger/add', body));
});
server.tool('delete_trigger', '특정 인덱스의 트리거 스크립트를 삭제합니다. 사용자 확인 필요.', { index: zod_1.z.number().describe('삭제할 트리거 인덱스') }, async ({ index }) => textResult(await apiRequest('POST', `/trigger/${index}/delete`)));
// ===== Lua Tools =====
server.tool('list_lua', 'Lua 코드의 섹션 목록을 확인합니다 (-- ===== 섹션명 ===== 구분자 기준). 각 섹션의 인덱스, 이름, 크기를 반환합니다.', {}, async () => textResult(await apiRequest('GET', '/lua')));
server.tool('read_lua', '특정 인덱스의 Lua 섹션 코드를 읽습니다. list_lua로 섹션 목록을 먼저 확인하세요.', { index: zod_1.z.number().describe('Lua 섹션 인덱스 (list_lua 결과 참조)') }, async ({ index }) => textResult(await apiRequest('GET', `/lua/${index}`)));
server.tool('write_lua', '특정 인덱스의 Lua 섹션 코드를 교체합니다. 사용자 확인 필요. 섹션 전체 코드를 content로 전달하세요.', {
    index: zod_1.z.number().describe('Lua 섹션 인덱스'),
    content: zod_1.z.string().describe('새로운 섹션 코드 (전체 교체)'),
}, async ({ index, content }) => textResult(await apiRequest('POST', `/lua/${index}`, { content })));
server.tool('replace_in_lua', 'Lua 섹션 내에서 문자열 치환을 수행합니다. 대용량 섹션을 통째로 읽고 쓸 필요 없이 서버에서 직접 치환합니다. 사용자 확인 필요.', {
    index: zod_1.z.number().describe('Lua 섹션 인덱스 (list_lua 결과 참조)'),
    find: zod_1.z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
    replace: zod_1.z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
    regex: zod_1.z.boolean().optional().describe('정규식 모드 여부 (기본: false = 일반 문자열 매칭)'),
    flags: zod_1.z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
}, async ({ index, find, replace, regex, flags }) => textResult(await apiRequest('POST', `/lua/${index}/replace`, {
    find,
    replace: replace || '',
    regex: regex || false,
    flags: flags || 'g',
})));
server.tool('insert_in_lua', 'Lua 섹션에 코드를 삽입합니다. 전체를 읽지 않고 특정 위치에 추가. position: "end"(기본, 끝에 추가), "start"(앞에 추가), "after"(anchor 뒤에 삽입), "before"(anchor 앞에 삽입). 사용자 확인 필요.', {
    index: zod_1.z.number().describe('Lua 섹션 인덱스'),
    content: zod_1.z.string().describe('삽입할 코드'),
    position: zod_1.z.string().optional().describe('삽입 위치: "end"(기본), "start", "after", "before"'),
    anchor: zod_1.z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
}, async ({ index, content, position, anchor }) => textResult(await apiRequest('POST', `/lua/${index}/insert`, {
    content,
    position: position || 'end',
    anchor: anchor || '',
})));
// ===== CSS Tools =====
server.tool('list_css', 'CSS 코드의 섹션 목록을 확인합니다 (/* ===== 섹션명 ===== */ 구분자 기준). 각 섹션의 인덱스, 이름, 크기를 반환합니다.', {}, async () => textResult(await apiRequest('GET', '/css-section')));
server.tool('read_css', '특정 인덱스의 CSS 섹션 코드를 읽습니다. list_css로 섹션 목록을 먼저 확인하세요.', { index: zod_1.z.number().describe('CSS 섹션 인덱스 (list_css 결과 참조)') }, async ({ index }) => textResult(await apiRequest('GET', `/css-section/${index}`)));
server.tool('write_css', '특정 인덱스의 CSS 섹션 코드를 교체합니다. 사용자 확인 필요. 섹션 전체 코드를 content로 전달하세요.', {
    index: zod_1.z.number().describe('CSS 섹션 인덱스'),
    content: zod_1.z.string().describe('새로운 섹션 코드 (전체 교체)'),
}, async ({ index, content }) => textResult(await apiRequest('POST', `/css-section/${index}`, { content })));
server.tool('replace_in_css', 'CSS 섹션 내에서 문자열 치환을 수행합니다. 대용량 섹션을 통째로 읽고 쓸 필요 없이 서버에서 직접 치환합니다. 사용자 확인 필요.', {
    index: zod_1.z.number().describe('CSS 섹션 인덱스 (list_css 결과 참조)'),
    find: zod_1.z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
    replace: zod_1.z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
    regex: zod_1.z.boolean().optional().describe('정규식 모드 여부 (기본: false = 일반 문자열 매칭)'),
    flags: zod_1.z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
}, async ({ index, find, replace, regex, flags }) => textResult(await apiRequest('POST', `/css-section/${index}/replace`, {
    find,
    replace: replace || '',
    regex: regex || false,
    flags: flags || 'g',
})));
server.tool('insert_in_css', 'CSS 섹션에 코드를 삽입합니다. 전체를 읽지 않고 특정 위치에 추가. position: "end"(기본, 끝에 추가), "start"(앞에 추가), "after"(anchor 뒤에 삽입), "before"(anchor 앞에 삽입). 사용자 확인 필요.', {
    index: zod_1.z.number().describe('CSS 섹션 인덱스'),
    content: zod_1.z.string().describe('삽입할 코드'),
    position: zod_1.z.string().optional().describe('삽입 위치: "end"(기본), "start", "after", "before"'),
    anchor: zod_1.z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
}, async ({ index, content, position, anchor }) => textResult(await apiRequest('POST', `/css-section/${index}/insert`, {
    content,
    position: position || 'end',
    anchor: anchor || '',
})));
// ===== Reference Tools =====
server.tool('list_references', '로드된 참고 자료 파일 목록을 확인합니다 (읽기 전용). 각 파일의 필드와 크기를 포함합니다.', {}, async () => textResult(await apiRequest('GET', '/references')));
server.tool('read_reference_field', '참고 자료 파일의 특정 필드를 읽습니다 (읽기 전용). ⚠️ lorebook/lua/css는 전체를 한번에 반환하여 컨텍스트를 낭비합니다. 대신 list_reference_lorebook → read_reference_lorebook, list_reference_lua → read_reference_lua, list_reference_css → read_reference_css를 사용하세요. 이 도구는 짧은 필드에만 사용: globalNote, firstMessage, alternateGreetings, groupOnlyGreetings, description, defaultVariables, name, triggerScripts, regex', {
    index: zod_1.z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    field: zod_1.z.string().describe('필드 이름'),
}, async ({ index, field }) => textResult(await apiRequest('GET', `/reference/${index}/${encodeURIComponent(field)}`)));
server.tool('list_reference_lorebook', '참고 자료 파일의 로어북 항목 목록을 확인합니다 (인덱스, 코멘트, 키, 활성화 상태, content 크기, 폴더). filter 또는 folder로 범위를 좁히세요. read_reference_field("lorebook") 대신 이 도구를 사용하세요.', {
    index: zod_1.z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    filter: zod_1.z.string().optional().describe('검색 키워드 (comment, key에서 검색). 생략 시 전체 목록 반환'),
    folder: zod_1.z.string().optional().describe('폴더 UUID로 필터. 생략 시 전체 반환'),
}, async ({ index, filter, folder }) => {
    const params = new URLSearchParams();
    if (filter)
        params.set('filter', filter);
    if (folder)
        params.set('folder', folder);
    const qs = params.toString();
    return textResult(await apiRequest('GET', `/reference/${index}/lorebook${qs ? '?' + qs : ''}`));
});
server.tool('read_reference_lorebook', '참고 자료 파일의 특정 로어북 항목 하나를 읽습니다 (읽기 전용). list_reference_lorebook으로 인덱스 확인 후 사용.', {
    index: zod_1.z.number().describe('참고 파일 인덱스'),
    entryIndex: zod_1.z.number().describe('로어북 항목 인덱스 (list_reference_lorebook 결과 참조)'),
}, async ({ index, entryIndex }) => textResult(await apiRequest('GET', `/reference/${index}/lorebook/${entryIndex}`)));
server.tool('list_reference_lua', '참고 자료 파일의 Lua 섹션 목록을 확인합니다 (인덱스, 이름, 크기). read_reference_field("lua") 대신 이 도구를 사용하세요.', { index: zod_1.z.number().describe('참고 파일 인덱스 (list_references 결과 참조)') }, async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/lua`)));
server.tool('read_reference_lua', '참고 자료 파일의 특정 Lua 섹션 하나를 읽습니다 (읽기 전용). list_reference_lua로 인덱스 확인 후 사용.', {
    index: zod_1.z.number().describe('참고 파일 인덱스'),
    sectionIndex: zod_1.z.number().describe('Lua 섹션 인덱스 (list_reference_lua 결과 참조)'),
}, async ({ index, sectionIndex }) => textResult(await apiRequest('GET', `/reference/${index}/lua/${sectionIndex}`)));
server.tool('list_reference_css', '참고 자료 파일의 CSS 섹션 목록을 확인합니다 (인덱스, 이름, 크기). read_reference_field("css") 대신 이 도구를 사용하세요.', { index: zod_1.z.number().describe('참고 파일 인덱스 (list_references 결과 참조)') }, async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/css`)));
server.tool('read_reference_css', '참고 자료 파일의 특정 CSS 섹션 하나를 읽습니다 (읽기 전용). list_reference_css로 인덱스 확인 후 사용.', {
    index: zod_1.z.number().describe('참고 파일 인덱스'),
    sectionIndex: zod_1.z.number().describe('CSS 섹션 인덱스 (list_reference_css 결과 참조)'),
}, async ({ index, sectionIndex }) => textResult(await apiRequest('GET', `/reference/${index}/css/${sectionIndex}`)));
// ===== Risum Asset Tools =====
server.tool('list_risum_assets', '.risum 파일의 내장 에셋 목록을 확인합니다 (인덱스, 이름, 경로, 크기).', {}, async () => textResult(await apiRequest('GET', '/risum-assets')));
server.tool('read_risum_asset', '.risum 파일의 내장 에셋을 base64로 읽습니다.', { index: zod_1.z.number().describe('에셋 인덱스 (list_risum_assets 결과 참조)') }, async ({ index }) => textResult(await apiRequest('GET', `/risum-asset/${index}`)));
server.tool('add_risum_asset', '.risum 파일에 에셋을 추가합니다. base64로 인코딩된 데이터를 전달. 사용자 확인 필요.', {
    name: zod_1.z.string().describe('에셋 이름'),
    path: zod_1.z.string().optional().describe('에셋 경로 (선택사항)'),
    base64: zod_1.z.string().describe('base64 인코딩된 에셋 데이터'),
}, async ({ name, path: assetPath, base64 }) => textResult(await apiRequest('POST', '/risum-asset/add', { name, path: assetPath || '', base64 })));
server.tool('delete_risum_asset', '.risum 파일의 내장 에셋을 삭제합니다. 사용자 확인 필요.', { index: zod_1.z.number().describe('삭제할 에셋 인덱스') }, async ({ index }) => textResult(await apiRequest('POST', `/risum-asset/${index}/delete`)));
// ===== Skill Tools =====
server.tool('list_skills', 'RisuAI 스킬 문서 목록을 반환합니다. 각 스킬의 name, description, 포함 파일 목록을 확인할 수 있습니다. CBS 문법, Lua 스크립트, 로어북, 정규식, HTML/CSS, 트리거 스크립트, 캐릭터 작성 등의 가이드가 포함되어 있습니다.', {}, async () => textResult(await apiRequest('GET', '/skills')));
server.tool('read_skill', '특정 스킬의 문서 파일을 읽습니다. 기본적으로 SKILL.md를 읽으며, file 파라미터로 참조 파일(예: REFERENCE.md, API_REFERENCE.md)도 읽을 수 있습니다.', {
    name: zod_1.z.string().describe('스킬 이름 (예: writing-lua-scripts, authoring-characters)'),
    file: zod_1.z.string().optional().describe('읽을 파일명 (기본: SKILL.md). list_skills에서 확인한 파일명 사용.'),
}, async ({ name, file }) => {
    const filePart = file ? encodeURIComponent(file) : '';
    const skillPath = filePart
        ? `/skills/${encodeURIComponent(name)}/${filePart}`
        : `/skills/${encodeURIComponent(name)}`;
    return textResult(await apiRequest('GET', skillPath));
});
// ===== Danbooru Tools (local — no apiRequest) =====
server.tool('validate_danbooru_tags', 'Validate whether given tags are valid Danbooru tags. Returns validation result for each tag with suggestions for invalid ones. IMPORTANT: Always use this tool to verify your tags before using them in image generation prompts.', {
    tags: zod_1.z.array(zod_1.z.string()).describe('List of tags to validate (e.g. ["blue_eyes", "long_hair", "school_uniform"])'),
    online_fallback: zod_1.z
        .boolean()
        .optional()
        .describe('If true, check Danbooru API for tags not found locally (default: true)'),
}, async ({ tags, online_fallback }) => {
    if (!tagsLoaded)
        throw new Error('Tag database not loaded');
    const onlineFallback = online_fallback !== false;
    const results = await validateTags(tags, onlineFallback);
    const validCount = results.filter((r) => r.valid).length;
    const invalidCount = results.filter((r) => !r.valid).length;
    return textResult({
        summary: `${validCount}/${tags.length} tags valid${invalidCount > 0 ? `, ${invalidCount} invalid` : ''}`,
        results,
    });
});
server.tool('search_danbooru_tags', 'Search for Danbooru tags matching a query. Use this to find the correct tag name for a concept. Supports wildcard (*) patterns. Results are sorted by popularity (post count).', {
    query: zod_1.z.string().describe('Search query (e.g. "blue_eye", "long_h*", "school"). Supports * wildcard.'),
    category: zod_1.z.string().optional().describe('Filter by tag category: general, artist, copyright, character, meta'),
    limit: zod_1.z.number().optional().describe('Max results (default: 20, max: 50)'),
}, async ({ query, category, limit }) => {
    if (!tagsLoaded)
        throw new Error('Tag database not loaded');
    const effectiveLimit = Math.min(limit || 20, 50);
    const results = await searchWithOnline(query, category, effectiveLimit);
    return textResult({ query, count: results.length, tags: formatTags(results) });
});
server.tool('get_popular_danbooru_tags', 'Get popular Danbooru tags sorted by usage count. Use group_by_semantic=true to get tags organized by category (hair, eyes, clothing, pose, etc.) — very useful when writing character image prompts.', {
    category: zod_1.z.string().optional().describe('Filter by tag category: general, artist, copyright, character, meta'),
    limit: zod_1.z.number().optional().describe('Max results per group or total (default: 100, max: 500)'),
    group_by_semantic: zod_1.z
        .boolean()
        .optional()
        .describe('If true, returns tags grouped by semantic category (hair_color, eye_color, clothing, pose, etc.)'),
}, async ({ category, limit, group_by_semantic }) => {
    if (!tagsLoaded)
        throw new Error('Tag database not loaded');
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
});
// ==================== Prompt ====================
server.prompt('danbooru_tag_guide', 'Guidelines and reference for writing image generation prompts using Danbooru tags. Call this before creating character image prompts to get the correct tag format and popular tags.', {
    character_description: zod_1.z.string().optional().describe('Optional character description for context-aware guidance'),
}, async ({ character_description }) => ({
    messages: [
        {
            role: 'user',
            content: { type: 'text', text: buildDanbooruGuide(character_description) },
        },
    ],
}));
// ==================== Start ====================
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`[toki-mcp] started (SDK), API at 127.0.0.1:${TOKI_PORT}\n`);
}
main().catch((err) => {
    process.stderr.write(`[toki-mcp] fatal: ${err}\n`);
    process.exit(1);
});
