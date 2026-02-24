'use strict';

// RisuToki MCP Server
// Standalone JSON-RPC 2.0 over stdio (no SDK dependency)
// Communicates with RisuToki via local HTTP API

const http = require('http');

const TOKI_PORT = process.env.TOKI_PORT;
const TOKI_TOKEN = process.env.TOKI_TOKEN;

if (!TOKI_PORT || !TOKI_TOKEN) {
  process.stderr.write('[toki-mcp] ERROR: TOKI_PORT and TOKI_TOKEN env vars required\n');
  process.exit(1);
}

// ==================== MCP Tool Definitions ====================

const TOOLS = [
  {
    name: 'list_fields',
    description: '현재 열린 .charx 파일의 편집 가능한 필드 목록과 크기를 확인합니다.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'read_field',
    description: '필드의 전체 내용을 읽습니다. 사용 가능한 필드: lua, globalNote, firstMessage, css, defaultVariables, description, name',
    inputSchema: {
      type: 'object',
      properties: { field: { type: 'string', description: '필드 이름 (lua, globalNote, firstMessage, css, defaultVariables, description, name)' } },
      required: ['field']
    }
  },
  {
    name: 'write_field',
    description: '필드에 새 내용을 씁니다. 에디터에서 사용자 확인 팝업이 뜹니다. 사용 가능한 필드: lua, globalNote, firstMessage, css, defaultVariables, description, name',
    inputSchema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: '필드 이름' },
        content: { type: 'string', description: '새로운 내용' }
      },
      required: ['field', 'content']
    }
  },
  {
    name: 'list_lorebook',
    description: '로어북 항목 목록을 확인합니다 (인덱스, 코멘트, 키, 활성화 상태).',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'read_lorebook',
    description: '특정 인덱스의 로어북 항목 전체 데이터를 읽습니다.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: '로어북 항목 인덱스' } },
      required: ['index']
    }
  },
  {
    name: 'write_lorebook',
    description: '특정 인덱스의 로어북 항목을 수정합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: '로어북 항목 인덱스' },
        data: { type: 'object', description: '수정할 로어북 데이터 (부분 또는 전체)' }
      },
      required: ['index', 'data']
    }
  },
  {
    name: 'list_regex',
    description: '정규식 스크립트 항목 목록을 확인합니다.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'read_regex',
    description: '특정 인덱스의 정규식 항목을 읽습니다.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: '정규식 항목 인덱스' } },
      required: ['index']
    }
  },
  {
    name: 'write_regex',
    description: '특정 인덱스의 정규식 항목을 수정합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: '정규식 항목 인덱스' },
        data: { type: 'object', description: '수정할 정규식 데이터' }
      },
      required: ['index', 'data']
    }
  },
  {
    name: 'add_lorebook',
    description: '새 로어북 항목을 추가합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'object', description: '로어북 항목 데이터 (key, comment, content 등)' }
      },
      required: ['data']
    }
  },
  {
    name: 'delete_lorebook',
    description: '특정 인덱스의 로어북 항목을 삭제합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: '삭제할 로어북 항목 인덱스' } },
      required: ['index']
    }
  },
  {
    name: 'add_regex',
    description: '새 정규식 항목을 추가합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'object', description: '정규식 항목 데이터 (comment, type, find, replace, flag)' }
      },
      required: ['data']
    }
  },
  {
    name: 'delete_regex',
    description: '특정 인덱스의 정규식 항목을 삭제합니다. 사용자 확인 필요.',
    inputSchema: {
      type: 'object',
      properties: { index: { type: 'number', description: '삭제할 정규식 항목 인덱스' } },
      required: ['index']
    }
  },
  {
    name: 'list_references',
    description: '로드된 참고 자료 파일 목록을 확인합니다 (읽기 전용). 각 파일의 필드와 크기를 포함합니다.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'read_reference_field',
    description: '참고 자료 파일의 특정 필드를 읽습니다 (읽기 전용). 사용 가능한 필드: lua, globalNote, firstMessage, css, description, defaultVariables, name, lorebook, regex',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: '참고 파일 인덱스 (list_references 결과 참조)' },
        field: { type: 'string', description: '필드 이름' }
      },
      required: ['index', 'field']
    }
  }
];

// ==================== HTTP Client ====================

function apiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: TOKI_PORT,
      path: urlPath,
      method: method,
      headers: {
        'Authorization': `Bearer ${TOKI_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    if (payload) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Invalid response: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Request timeout')); });

    if (payload) req.write(payload);
    req.end();
  });
}

// ==================== Tool Call Handler ====================

async function handleToolCall(name, args) {
  switch (name) {
    case 'list_fields':
      return await apiRequest('GET', '/fields');

    case 'read_field':
      return await apiRequest('GET', `/field/${encodeURIComponent(args.field)}`);

    case 'write_field':
      return await apiRequest('POST', `/field/${encodeURIComponent(args.field)}`, { content: args.content });

    case 'list_lorebook':
      return await apiRequest('GET', '/lorebook');

    case 'read_lorebook':
      return await apiRequest('GET', `/lorebook/${args.index}`);

    case 'write_lorebook':
      return await apiRequest('POST', `/lorebook/${args.index}`, args.data);

    case 'list_regex':
      return await apiRequest('GET', '/regex');

    case 'read_regex':
      return await apiRequest('GET', `/regex/${args.index}`);

    case 'write_regex':
      return await apiRequest('POST', `/regex/${args.index}`, args.data);

    case 'add_lorebook':
      return await apiRequest('POST', '/lorebook/add', args.data);

    case 'delete_lorebook':
      return await apiRequest('POST', `/lorebook/${args.index}/delete`);

    case 'add_regex':
      return await apiRequest('POST', '/regex/add', args.data);

    case 'delete_regex':
      return await apiRequest('POST', `/regex/${args.index}/delete`);

    case 'list_references':
      return await apiRequest('GET', '/references');

    case 'read_reference_field':
      return await apiRequest('GET', `/reference/${args.index}/${encodeURIComponent(args.field)}`);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ==================== JSON-RPC Protocol ====================

function send(obj) {
  const json = JSON.stringify(obj);
  process.stdout.write(json + '\n');
}

async function handleMessage(msg) {
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
            serverInfo: { name: 'risutoki', version: '1.0.0' }
          }
        });
        break;

      case 'tools/list':
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { tools: TOOLS }
        });
        break;

      case 'tools/call': {
        const { name, arguments: args } = msg.params;
        process.stderr.write(`[toki-mcp] tool call: ${name}\n`);
        try {
          const result = await handleToolCall(name, args || {});
          send({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            }
          });
        } catch (err) {
          process.stderr.write(`[toki-mcp] tool error: ${err.message}\n`);
          send({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              content: [{ type: 'text', text: `Error: ${err.message}` }],
              isError: true
            }
          });
        }
        break;
      }

      default:
        // Unknown method
        send({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: `Method not found: ${msg.method}` }
        });
    }
  } catch (err) {
    process.stderr.write(`[toki-mcp] error: ${err.message}\n`);
    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32603, message: err.message }
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
        const msg = JSON.parse(line);
        handleMessage(msg);
      } catch (e) {
        process.stderr.write(`[toki-mcp] parse error: ${e.message}\n`);
      }
    }
  }
});

process.stdin.on('end', () => {
  process.stderr.write('[toki-mcp] stdin closed, exiting\n');
  process.exit(0);
});

process.stderr.write(`[toki-mcp] started, API at 127.0.0.1:${TOKI_PORT}\n`);
