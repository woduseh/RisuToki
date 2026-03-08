'use strict';

// RisuToki MCP Server
// Standalone JSON-RPC 2.0 over stdio (no SDK dependency)
// Communicates with RisuToki via local HTTP API

// eslint-disable-next-line @typescript-eslint/no-require-imports
import http = require('http');

const TOKI_PORT = process.env.TOKI_PORT;
const TOKI_TOKEN = process.env.TOKI_TOKEN;

if (!TOKI_PORT || !TOKI_TOKEN) {
  process.stderr.write('[toki-mcp] ERROR: TOKI_PORT and TOKI_TOKEN env vars required\n');
  process.exit(1);
}

// ==================== TypeScript Interfaces ====================

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface JSONRPCRequest {
  jsonrpc: string;
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: string;
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

// ==================== MCP Tool Definitions ====================

const TOOLS: MCPTool[] = [
  {
    name: 'list_fields',
    description:
      '현재 열린 파일(.charx, .risum, .risup)의 편집 가능한 필드 목록과 크기를 확인합니다. 응답에 fileType 포함.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_field',
    description:
      '필드의 전체 내용을 읽습니다. 공통 필드: lua, triggerScripts, globalNote, firstMessage, alternateGreetings, groupOnlyGreetings, css, defaultVariables, description, name. charx 전용: personality, scenario, creatorcomment, tags, exampleMessage, systemPrompt, creator, characterVersion, nickname, source, creationDate(읽기전용), modificationDate(읽기전용), additionalText, license. risum 전용: cjs, lowLevelAccess, hideIcon, backgroundEmbedding, moduleNamespace, customModuleToggle, mcpUrl, moduleName, moduleDescription, moduleId(읽기전용). risup 전용: mainPrompt, jailbreak, temperature, maxContext, maxResponse, frequencyPenalty, presencePenalty, aiModel, subModel, apiType, promptPreprocess, promptTemplate(JSON), presetBias(JSON), formatingOrder(JSON), presetImage, top_p, top_k, repetition_penalty, min_p, top_a, reasonEffort, thinkingTokens, thinkingType, adaptiveThinkingEffort, useInstructPrompt, instructChatTemplate, JinjaTemplate, customPromptTemplateToggle, templateDefaultVariables, moduleIntergration, jsonSchemaEnabled, jsonSchema, strictJsonSchema, extractJson, groupTemplate, groupOtherBotRole, autoSuggestPrompt, autoSuggestPrefix, autoSuggestClean, localStopStrings(JSON), outputImageModal, verbosity, fallbackWhenBlankResponse, systemContentReplacement, systemRoleReplacement',
    inputSchema: {
      type: 'object',
      properties: { field: { type: 'string', description: '필드 이름' } },
      required: ['field'],
    },
  },
  {
    name: 'write_field',
    description:
      '필드에 새 내용을 씁니다. 에디터에서 사용자 확인 팝업이 뜹니다. 공통 필드: lua, triggerScripts, globalNote, firstMessage, alternateGreetings, groupOnlyGreetings, css, defaultVariables, description, name. charx 전용: personality, scenario, creatorcomment, tags, exampleMessage, systemPrompt, creator, characterVersion, nickname, source, additionalText, license. risum 전용: cjs, lowLevelAccess(boolean), hideIcon(boolean), backgroundEmbedding, moduleNamespace, customModuleToggle, mcpUrl, moduleName, moduleDescription. risup 전용: mainPrompt, jailbreak, temperature(number), maxContext(number), maxResponse(number), frequencyPenalty(number), presencePenalty(number), aiModel, subModel, apiType, promptPreprocess(boolean), promptTemplate(JSON), presetBias(JSON), formatingOrder(JSON), presetImage, top_p(number), top_k(number), repetition_penalty(number), min_p(number), top_a(number), reasonEffort(number), thinkingTokens(number), thinkingType, adaptiveThinkingEffort, useInstructPrompt(boolean), instructChatTemplate, JinjaTemplate, customPromptTemplateToggle, templateDefaultVariables, moduleIntergration, jsonSchemaEnabled(boolean), jsonSchema, strictJsonSchema(boolean), extractJson, groupTemplate, groupOtherBotRole, autoSuggestPrompt, autoSuggestPrefix, autoSuggestClean(boolean), localStopStrings(JSON), outputImageModal(boolean), verbosity(number), fallbackWhenBlankResponse(boolean), systemContentReplacement, systemRoleReplacement',
    inputSchema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: '필드 이름' },
        content: {
          description:
            '새로운 내용. alternateGreetings/groupOnlyGreetings/tags/source는 문자열 배열, triggerScripts는 JSON 문자열, boolean 필드는 boolean, number 필드는 number, 나머지는 문자열',
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
            { type: 'boolean' },
            { type: 'number' },
          ],
        },
      },
      required: ['field', 'content'],
    },
  },
  {
    name: 'list_lorebook',
    description: '로어북 항목 목록을 확인합니다 (인덱스, 코멘트, 키, 활성화 상태). filter로 comment/key 검색 가능.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '검색 키워드 (comment, key에서 검색). 생략 시 전체 목록 반환' },
      },
      required: [],
    },
  },
  {
    name: 'read_lorebook',
    description: '특정 인덱스의 로어북 항목 전체 데이터를 읽습니다.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: '로어북 항목 인덱스' } },
      required: ['index'],
    },
  },
  {
    name: 'write_lorebook',
    description: '특정 인덱스의 로어북 항목을 수정합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: '로어북 항목 인덱스' },
        data: { type: 'object', description: '수정할 로어북 데이터 (부분 또는 전체)' },
      },
      required: ['index', 'data'],
    },
  },
  {
    name: 'list_regex',
    description: '정규식 스크립트 항목 목록을 확인합니다.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_regex',
    description: '특정 인덱스의 정규식 항목을 읽습니다.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: '정규식 항목 인덱스' } },
      required: ['index'],
    },
  },
  {
    name: 'write_regex',
    description: '특정 인덱스의 정규식 항목을 수정합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: '정규식 항목 인덱스' },
        data: { type: 'object', description: '수정할 정규식 데이터' },
      },
      required: ['index', 'data'],
    },
  },
  {
    name: 'add_lorebook',
    description: '새 로어북 항목을 추가합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'object', description: '로어북 항목 데이터 (key, comment, content 등)' },
      },
      required: ['data'],
    },
  },
  {
    name: 'delete_lorebook',
    description: '특정 인덱스의 로어북 항목을 삭제합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: '삭제할 로어북 항목 인덱스' } },
      required: ['index'],
    },
  },
  {
    name: 'add_regex',
    description: '새 정규식 항목을 추가합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'object', description: '정규식 항목 데이터 (comment, type, find, replace, flag)' },
      },
      required: ['data'],
    },
  },
  {
    name: 'delete_regex',
    description: '특정 인덱스의 정규식 항목을 삭제합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: '삭제할 정규식 항목 인덱스' } },
      required: ['index'],
    },
  },
  {
    name: 'list_lua',
    description:
      'Lua 코드의 섹션 목록을 확인합니다 (-- ===== 섹션명 ===== 구분자 기준). 각 섹션의 인덱스, 이름, 크기를 반환합니다.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_lua',
    description: '특정 인덱스의 Lua 섹션 코드를 읽습니다. list_lua로 섹션 목록을 먼저 확인하세요.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: 'Lua 섹션 인덱스 (list_lua 결과 참조)' } },
      required: ['index'],
    },
  },
  {
    name: 'write_lua',
    description: '특정 인덱스의 Lua 섹션 코드를 교체합니다. 사용자 확인 필요. 섹션 전체 코드를 content로 전달하세요.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Lua 섹션 인덱스' },
        content: { type: 'string', description: '새로운 섹션 코드 (전체 교체)' },
      },
      required: ['index', 'content'],
    },
  },
  {
    name: 'replace_in_lua',
    description:
      'Lua 섹션 내에서 문자열 치환을 수행합니다. 대용량 섹션을 통째로 읽고 쓸 필요 없이 서버에서 직접 치환합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Lua 섹션 인덱스 (list_lua 결과 참조)' },
        find: { type: 'string', description: '찾을 문자열 (또는 regex: true일 때 정규식 패턴)' },
        replace: { type: 'string', description: '바꿀 문자열 (기본: 빈 문자열 = 삭제)' },
        regex: { type: 'boolean', description: '정규식 모드 여부 (기본: false = 일반 문자열 매칭)' },
        flags: { type: 'string', description: '정규식 플래그 (기본: "g"). regex: true일 때만 사용' },
      },
      required: ['index', 'find'],
    },
  },
  {
    name: 'insert_in_lua',
    description:
      'Lua 섹션에 코드를 삽입합니다. 전체를 읽지 않고 특정 위치에 추가. position: "end"(기본, 끝에 추가), "start"(앞에 추가), "after"(anchor 뒤에 삽입), "before"(anchor 앞에 삽입). 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Lua 섹션 인덱스' },
        content: { type: 'string', description: '삽입할 코드' },
        position: { type: 'string', description: '삽입 위치: "end"(기본), "start", "after", "before"' },
        anchor: { type: 'string', description: 'position이 "after"/"before"일 때 기준 문자열' },
      },
      required: ['index', 'content'],
    },
  },
  {
    name: 'list_css',
    description:
      'CSS 코드의 섹션 목록을 확인합니다 (/* ===== 섹션명 ===== */ 구분자 기준). 각 섹션의 인덱스, 이름, 크기를 반환합니다.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_css',
    description: '특정 인덱스의 CSS 섹션 코드를 읽습니다. list_css로 섹션 목록을 먼저 확인하세요.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: 'CSS 섹션 인덱스 (list_css 결과 참조)' } },
      required: ['index'],
    },
  },
  {
    name: 'write_css',
    description: '특정 인덱스의 CSS 섹션 코드를 교체합니다. 사용자 확인 필요. 섹션 전체 코드를 content로 전달하세요.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'CSS 섹션 인덱스' },
        content: { type: 'string', description: '새로운 섹션 코드 (전체 교체)' },
      },
      required: ['index', 'content'],
    },
  },
  {
    name: 'replace_in_css',
    description:
      'CSS 섹션 내에서 문자열 치환을 수행합니다. 대용량 섹션을 통째로 읽고 쓸 필요 없이 서버에서 직접 치환합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'CSS 섹션 인덱스 (list_css 결과 참조)' },
        find: { type: 'string', description: '찾을 문자열 (또는 regex: true일 때 정규식 패턴)' },
        replace: { type: 'string', description: '바꿀 문자열 (기본: 빈 문자열 = 삭제)' },
        regex: { type: 'boolean', description: '정규식 모드 여부 (기본: false = 일반 문자열 매칭)' },
        flags: { type: 'string', description: '정규식 플래그 (기본: "g"). regex: true일 때만 사용' },
      },
      required: ['index', 'find'],
    },
  },
  {
    name: 'insert_in_css',
    description:
      'CSS 섹션에 코드를 삽입합니다. 전체를 읽지 않고 특정 위치에 추가. position: "end"(기본, 끝에 추가), "start"(앞에 추가), "after"(anchor 뒤에 삽입), "before"(anchor 앞에 삽입). 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'CSS 섹션 인덱스' },
        content: { type: 'string', description: '삽입할 코드' },
        position: { type: 'string', description: '삽입 위치: "end"(기본), "start", "after", "before"' },
        anchor: { type: 'string', description: 'position이 "after"/"before"일 때 기준 문자열' },
      },
      required: ['index', 'content'],
    },
  },
  {
    name: 'list_references',
    description: '로드된 참고 자료 파일 목록을 확인합니다 (읽기 전용). 각 파일의 필드와 크기를 포함합니다.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_reference_field',
    description:
      '참고 자료 파일의 특정 필드를 읽습니다 (읽기 전용). 사용 가능한 필드: lua, triggerScripts, globalNote, firstMessage, alternateGreetings, groupOnlyGreetings, css, description, defaultVariables, name, lorebook, regex',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: '참고 파일 인덱스 (list_references 결과 참조)' },
        field: { type: 'string', description: '필드 이름' },
      },
      required: ['index', 'field'],
    },
  },
  // Risum asset tools
  {
    name: 'list_risum_assets',
    description: '.risum 파일의 내장 에셋 목록을 확인합니다 (인덱스, 이름, 경로, 크기).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_risum_asset',
    description: '.risum 파일의 내장 에셋을 base64로 읽습니다.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: '에셋 인덱스 (list_risum_assets 결과 참조)' } },
      required: ['index'],
    },
  },
  {
    name: 'add_risum_asset',
    description: '.risum 파일에 에셋을 추가합니다. base64로 인코딩된 데이터를 전달. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '에셋 이름' },
        path: { type: 'string', description: '에셋 경로 (선택사항)' },
        base64: { type: 'string', description: 'base64 인코딩된 에셋 데이터' },
      },
      required: ['name', 'base64'],
    },
  },
  {
    name: 'delete_risum_asset',
    description: '.risum 파일의 내장 에셋을 삭제합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: '삭제할 에셋 인덱스' } },
      required: ['index'],
    },
  },
];

// ==================== HTTP Client ====================

async function apiRequest(method: string, urlPath: string, body?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
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
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Invalid response: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ==================== Tool Call Handler ====================

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_fields':
      return await apiRequest('GET', '/fields');

    case 'read_field':
      return await apiRequest('GET', `/field/${encodeURIComponent(args.field as string)}`);

    case 'write_field':
      return await apiRequest('POST', `/field/${encodeURIComponent(args.field as string)}`, { content: args.content });

    case 'list_lorebook':
      return await apiRequest(
        'GET',
        args.filter ? `/lorebook?filter=${encodeURIComponent(args.filter as string)}` : '/lorebook',
      );

    case 'read_lorebook':
      return await apiRequest('GET', `/lorebook/${args.index}`);

    case 'write_lorebook':
      return await apiRequest('POST', `/lorebook/${args.index}`, args.data as Record<string, unknown>);

    case 'list_regex':
      return await apiRequest('GET', '/regex');

    case 'read_regex':
      return await apiRequest('GET', `/regex/${args.index}`);

    case 'write_regex':
      return await apiRequest('POST', `/regex/${args.index}`, args.data as Record<string, unknown>);

    case 'add_lorebook':
      return await apiRequest('POST', '/lorebook/add', args.data as Record<string, unknown>);

    case 'delete_lorebook':
      return await apiRequest('POST', `/lorebook/${args.index}/delete`);

    case 'add_regex':
      return await apiRequest('POST', '/regex/add', args.data as Record<string, unknown>);

    case 'delete_regex':
      return await apiRequest('POST', `/regex/${args.index}/delete`);

    case 'list_lua':
      return await apiRequest('GET', '/lua');

    case 'read_lua':
      return await apiRequest('GET', `/lua/${args.index}`);

    case 'write_lua':
      return await apiRequest('POST', `/lua/${args.index}`, { content: args.content });

    case 'replace_in_lua':
      return await apiRequest('POST', `/lua/${args.index}/replace`, {
        find: args.find,
        replace: args.replace || '',
        regex: args.regex || false,
        flags: args.flags || 'g',
      });

    case 'insert_in_lua':
      return await apiRequest('POST', `/lua/${args.index}/insert`, {
        content: args.content,
        position: args.position || 'end',
        anchor: args.anchor || '',
      });

    case 'list_css':
      return await apiRequest('GET', '/css-section');

    case 'read_css':
      return await apiRequest('GET', `/css-section/${args.index}`);

    case 'write_css':
      return await apiRequest('POST', `/css-section/${args.index}`, { content: args.content });

    case 'replace_in_css':
      return await apiRequest('POST', `/css-section/${args.index}/replace`, {
        find: args.find,
        replace: args.replace || '',
        regex: args.regex || false,
        flags: args.flags || 'g',
      });

    case 'insert_in_css':
      return await apiRequest('POST', `/css-section/${args.index}/insert`, {
        content: args.content,
        position: args.position || 'end',
        anchor: args.anchor || '',
      });

    case 'list_references':
      return await apiRequest('GET', '/references');

    case 'read_reference_field':
      return await apiRequest('GET', `/reference/${args.index}/${encodeURIComponent(args.field as string)}`);

    // Risum asset tools
    case 'list_risum_assets':
      return await apiRequest('GET', '/risum-assets');

    case 'read_risum_asset':
      return await apiRequest('GET', `/risum-asset/${args.index}`);

    case 'add_risum_asset':
      return await apiRequest('POST', '/risum-asset/add', {
        name: args.name,
        path: args.path || '',
        base64: args.base64,
      });

    case 'delete_risum_asset':
      return await apiRequest('POST', `/risum-asset/${args.index}/delete`);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ==================== JSON-RPC Protocol ====================

function send(obj: JSONRPCResponse): void {
  const json = JSON.stringify(obj);
  process.stdout.write(json + '\n');
}

async function handleMessage(msg: JSONRPCRequest): Promise<void> {
  // Notifications (no id) — no response needed
  if (!msg.id && msg.id !== 0) {
    process.stderr.write(`[toki-mcp] notification: ${msg.method}\n`);
    return;
  }

  try {
    switch (msg.method) {
      case 'initialize':
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'risutoki', version: '1.0.0' },
          },
        });
        break;

      case 'tools/list':
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { tools: TOOLS },
        });
        break;

      case 'tools/call': {
        const { name, arguments: args } = msg.params || {};
        process.stderr.write(`[toki-mcp] tool call: ${name}\n`);
        try {
          const result = await handleToolCall(name as string, (args || {}) as Record<string, unknown>);
          send({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            },
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`[toki-mcp] tool error: ${errMsg}\n`);
          send({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              content: [{ type: 'text', text: `Error: ${errMsg}` }],
              isError: true,
            },
          });
        }
        break;
      }

      default:
        // Unknown method
        send({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: `Method not found: ${msg.method}` },
        });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[toki-mcp] error: ${errMsg}\n`);
    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32603, message: errMsg },
    });
  }
}

// ==================== stdin Reader ====================

let inputBuffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  inputBuffer += chunk;

  let newlineIdx;
  while ((newlineIdx = inputBuffer.indexOf('\n')) !== -1) {
    const line = inputBuffer.slice(0, newlineIdx).trim();
    inputBuffer = inputBuffer.slice(newlineIdx + 1);
    if (line) {
      try {
        const msg = JSON.parse(line) as JSONRPCRequest;
        handleMessage(msg);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`[toki-mcp] parse error: ${errMsg}\n`);
      }
    }
  }
});

process.stdin.on('end', () => {
  process.stderr.write('[toki-mcp] stdin closed, exiting\n');
  process.exit(0);
});

process.stderr.write(`[toki-mcp] started, API at 127.0.0.1:${TOKI_PORT}\n`);
