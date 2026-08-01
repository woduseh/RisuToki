import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import { saveCharx, type LoadedDocumentData } from '../src/charx-io';
import {
  closeServer,
  createSearchFixture,
  startTestApiServer,
  type SearchFixture,
} from '../src/lib/mcp-api-test-harness';
import { MCP_DEFAULT_TOOLS_LIST_MAX_BYTES, MCP_SINGLE_TOOL_MAX_BYTES } from '../src/lib/mcp-compact-input';
import { startStandaloneClient } from './mcp-test-client';

const BASELINE_PATH = path.join(process.cwd(), 'test', 'fixtures', 'mcp-module-split-contract.json');
const TOOL_PROFILES = ['facade-first', 'authoring', 'advanced-full', 'readonly'] as const;
const PRINT_CASE = process.argv.find((arg) => arg.startsWith('--print-case='))?.slice('--print-case='.length);
const UPDATE_GUIDANCE =
  'If this contract change is intentional, regenerate the baseline with ' +
  '`node test/mcp-contract-baseline.js --update` and record the change summary in CHANGELOG.md.';

interface ContractFingerprint {
  rawBytes: number;
  sha256: string;
}

interface ToolProfileFingerprint extends ContractFingerprint {
  toolCount: number;
}

interface HttpFingerprint extends ContractFingerprint {
  status: number;
  topLevelKeys: string[];
}

interface ContractBaseline {
  schemaVersion: 1;
  toolsList: Record<(typeof TOOL_PROFILES)[number], ToolProfileFingerprint>;
  http: Record<string, HttpFingerprint>;
}

interface HttpCase {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  expectedStatus: number;
  body?: unknown;
  normalize?: (raw: string) => string;
}

function fingerprint(raw: string): ContractFingerprint {
  return {
    rawBytes: Buffer.byteLength(raw, 'utf8'),
    sha256: createHash('sha256').update(raw, 'utf8').digest('hex'),
  };
}

function normalizeDynamicExternalValues(raw: string): string {
  const parsed = JSON.parse(raw) as unknown;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;

    const record = value as Record<string, unknown>;
    if (record['name'] === 'modificationDate' && 'value' in record) {
      record['value'] = '<MODIFICATION_DATE>';
    }
    if ('mtimeMs' in record && 'size' in record) {
      record['size'] = '<FILE_SIZE>';
    }
    for (const [key, child] of Object.entries(record)) {
      if (['filePath', 'file_path', 'path'].includes(key) && typeof child === 'string') {
        record[key] = '<EXTERNAL_FILE_PATH>';
      } else if (['mtime', 'mtimeMs', 'modifiedAt'].includes(key)) {
        record[key] = '<MTIME>';
      } else if (key === 'sha256') {
        record[key] = '<SHA256>';
      } else if (key === 'byte_size') {
        record[key] = '<BYTE_SIZE>';
      } else {
        visit(child);
      }
    }
  };
  visit(parsed);
  return JSON.stringify(parsed);
}

async function requestRaw(
  port: number,
  token: string,
  requestCase: HttpCase,
): Promise<{ status: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const payload = requestCase.body === undefined ? undefined : JSON.stringify(requestCase.body);
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: requestCase.path,
        method: requestCase.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(payload === undefined
            ? {}
            : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            raw: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    request.on('error', reject);
    request.setTimeout(10_000, () => request.destroy(new Error(`HTTP contract timeout: ${requestCase.id}`)));
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}

async function captureHttpCase(port: number, token: string, requestCase: HttpCase): Promise<HttpFingerprint> {
  const response = await requestRaw(port, token, requestCase);
  assert.equal(response.status, requestCase.expectedStatus, `${requestCase.id} returned an unexpected HTTP status`);
  const normalized = requestCase.normalize ? requestCase.normalize(response.raw) : response.raw;
  if (PRINT_CASE === requestCase.id) process.stderr.write(`${requestCase.id}: ${normalized}\n`);
  const parsed = JSON.parse(normalized) as Record<string, unknown>;
  return {
    status: response.status,
    ...fingerprint(normalized),
    topLevelKeys: Object.keys(parsed),
  };
}

async function captureToolsList(): Promise<ContractBaseline['toolsList']> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-contract-tools-'));
  const resolvedTempRoot = path.resolve(tempRoot);
  const resolvedOsTemp = `${path.resolve(os.tmpdir())}${path.sep}`;
  assert.ok(
    resolvedTempRoot.startsWith(resolvedOsTemp),
    'Refusing to clean a tools/list temp directory outside os.tmpdir()',
  );

  const result = {} as ContractBaseline['toolsList'];
  try {
    for (const profile of TOOL_PROFILES) {
      const runtime = await startStandaloneClient({
        userDataDir: path.join(tempRoot, profile),
        toolProfile: profile,
        clientName: `mcp-contract-${profile}`,
      });
      try {
        const response = await runtime.client.listTools();
        const raw = JSON.stringify(response);
        if (profile === 'facade-first') {
          const rawBytes = Buffer.byteLength(raw, 'utf8');
          assert.ok(
            rawBytes <= MCP_DEFAULT_TOOLS_LIST_MAX_BYTES,
            `facade-first tools/list is ${rawBytes} bytes; budget is ${MCP_DEFAULT_TOOLS_LIST_MAX_BYTES}`,
          );
          for (const tool of response.tools) {
            const toolBytes = Buffer.byteLength(JSON.stringify(tool), 'utf8');
            assert.ok(
              toolBytes <= MCP_SINGLE_TOOL_MAX_BYTES,
              `${tool.name} schema is ${toolBytes} bytes; budget is ${MCP_SINGLE_TOOL_MAX_BYTES}`,
            );
          }
        }
        result[profile] = {
          toolCount: response.tools.length,
          ...fingerprint(raw),
        };
      } finally {
        await runtime.close();
      }
    }
    return result;
  } finally {
    fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
  }
}

function createCharxContractFixture(): SearchFixture {
  return {
    ...createSearchFixture(),
    _fileType: 'charx',
    regex: [
      {
        comment: 'Contract regex',
        type: 'editoutput',
        find: 'alpha',
        replace: 'beta',
        flag: 'g',
      },
    ],
    triggerScripts: [
      {
        comment: 'Contract trigger',
        type: 'start',
        conditions: [],
        effect: [],
        lowLevelAccess: false,
      },
    ],
    lua: '---@name main\nprint("contract")',
    css: '/* ===== main ===== */\n.contract { color: blue; }',
  };
}

function createRisupContractFixture(): SearchFixture {
  return {
    _fileType: 'risup',
    promptTemplate: JSON.stringify([
      {
        id: 'contract-plain',
        type: 'plain',
        type2: 'normal',
        text: 'Contract system prompt',
        role: 'system',
      },
      {
        id: 'contract-chat',
        type: 'chat',
        rangeStart: 0,
        rangeEnd: 'end',
      },
      {
        id: 'contract-lorebook',
        type: 'lorebook',
      },
    ]),
    formatingOrder: JSON.stringify(['main', 'description', 'chats']),
  };
}

function createExternalContractFixture(): { filePath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-contract-external-'));
  const filePath = path.join(dir, 'external.charx');
  saveCharx(filePath, {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'Workflow Replay External',
    description: 'workflow-replay-external-marker',
    personality: '',
    scenario: '',
    creatorcomment: 'Synthetic workflow replay fixture',
    tags: ['workflow-replay'],
    exampleMessage: '',
    systemPrompt: '',
    creator: 'RisuToki',
    characterVersion: '1.0.0',
    nickname: '',
    source: [],
    creationDate: 0,
    modificationDate: 0,
    additionalText: '',
    license: '',
    firstMessage: 'Workflow replay hello.',
    alternateGreetings: ['Workflow replay alternate hello.'],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    _risuExt: {},
    _card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        extensions: { risuai: {} },
        character_book: { entries: [] },
        assets: [],
      },
    },
    _moduleData: null,
    _presetData: null,
  } as LoadedDocumentData);

  return {
    filePath,
    cleanup: () => {
      const resolvedDir = path.resolve(dir);
      assert.ok(
        resolvedDir.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`),
        'Refusing to clean an external contract fixture outside os.tmpdir()',
      );
      fs.rmSync(resolvedDir, { recursive: true, force: true });
    },
  };
}

async function captureHttp(): Promise<ContractBaseline['http']> {
  const externalFixture = createExternalContractFixture();
  const charxCases: HttpCase[] = [
    { id: 'fields-list', method: 'GET', path: '/fields', expectedStatus: 200 },
    { id: 'field-read', method: 'GET', path: '/field/description', expectedStatus: 200 },
    {
      id: 'field-write',
      method: 'POST',
      path: '/field/description',
      expectedStatus: 200,
      body: { content: 'Contract description updated.' },
    },
    { id: 'field-error', method: 'GET', path: '/field/nonexistent_contract_field', expectedStatus: 400 },
    { id: 'lorebook-list', method: 'GET', path: '/lorebook', expectedStatus: 200 },
    {
      id: 'lorebook-batch-read',
      method: 'POST',
      path: '/lorebook/batch',
      expectedStatus: 200,
      body: { indices: [0, 1] },
    },
    { id: 'regex-list', method: 'GET', path: '/regex', expectedStatus: 200 },
    { id: 'greeting-list', method: 'GET', path: '/greetings/alternate', expectedStatus: 200 },
    { id: 'trigger-list', method: 'GET', path: '/triggers', expectedStatus: 200 },
    { id: 'lua-list', method: 'GET', path: '/lua', expectedStatus: 200 },
    { id: 'css-list', method: 'GET', path: '/css-section', expectedStatus: 200 },
    { id: 'surface-list', method: 'GET', path: '/surfaces', expectedStatus: 200 },
    { id: 'reference-list', method: 'GET', path: '/references', expectedStatus: 200 },
    {
      id: 'reference-field-read',
      method: 'GET',
      path: '/reference/0/description',
      expectedStatus: 200,
    },
    {
      id: 'external-inspect',
      method: 'POST',
      path: '/external/inspect',
      expectedStatus: 200,
      body: { file_path: externalFixture.filePath },
      normalize: normalizeDynamicExternalValues,
    },
  ];
  const risupCases: HttpCase[] = [
    { id: 'risup-prompt-list', method: 'GET', path: '/risup/prompt-items', expectedStatus: 200 },
    {
      id: 'risup-prompt-write',
      method: 'POST',
      path: '/risup/prompt-item/0',
      expectedStatus: 200,
      body: {
        item: {
          id: 'contract-plain',
          type: 'plain',
          type2: 'normal',
          text: 'Updated contract system prompt',
          role: 'system',
        },
      },
    },
    { id: 'risup-order-read', method: 'GET', path: '/risup/formating-order', expectedStatus: 200 },
  ];

  const result: ContractBaseline['http'] = {};
  try {
    const charxApi = await startTestApiServer(createCharxContractFixture(), [
      {
        fileName: 'reference.charx',
        data: {
          _fileType: 'charx',
          name: 'Contract Reference',
          description: 'Contract reference description.',
        },
      },
    ]);
    try {
      for (const requestCase of charxCases) {
        result[requestCase.id] = await captureHttpCase(charxApi.port, charxApi.token, requestCase);
      }
    } finally {
      await closeServer(charxApi.server);
    }

    const risupApi = await startTestApiServer(createRisupContractFixture());
    try {
      for (const requestCase of risupCases) {
        result[requestCase.id] = await captureHttpCase(risupApi.port, risupApi.token, requestCase);
      }
    } finally {
      await closeServer(risupApi.server);
    }
    return result;
  } finally {
    externalFixture.cleanup();
  }
}

async function captureBaseline(): Promise<ContractBaseline> {
  return {
    schemaVersion: 1,
    toolsList: await captureToolsList(),
    http: await captureHttp(),
  };
}

function verifyBaseline(actual: ContractBaseline, expected: ContractBaseline): void {
  assert.equal(actual.schemaVersion, expected.schemaVersion, 'Contract baseline schema version changed');
  for (const profile of TOOL_PROFILES) {
    assert.deepEqual(actual.toolsList[profile], expected.toolsList[profile], `tools/list changed for ${profile}`);
  }
  assert.deepEqual(Object.keys(actual.http), Object.keys(expected.http), 'HTTP contract case set changed');
  for (const id of Object.keys(expected.http)) {
    assert.deepEqual(actual.http[id], expected.http[id], `Raw HTTP response contract changed for ${id}`);
  }
}

function formatByteChange(previous: number | undefined, next: number | undefined): string {
  if (previous === undefined) return `added at ${next} bytes`;
  if (next === undefined) return `removed (was ${previous} bytes)`;
  const delta = next - previous;
  return `${previous} -> ${next} bytes (${delta >= 0 ? '+' : ''}${delta})`;
}

function summarizeBaselineChanges(actual: ContractBaseline, expected: ContractBaseline): string[] {
  const changes: string[] = [];
  for (const profile of TOOL_PROFILES) {
    const previous = expected.toolsList[profile];
    const next = actual.toolsList[profile];
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    const toolCountChange =
      previous?.toolCount === next?.toolCount
        ? ''
        : `; tools ${previous?.toolCount ?? 'n/a'} -> ${next?.toolCount ?? 'n/a'}`;
    changes.push(`tools/list ${profile}: ${formatByteChange(previous?.rawBytes, next?.rawBytes)}${toolCountChange}`);
  }

  const httpCaseIds = new Set([...Object.keys(expected.http), ...Object.keys(actual.http)]);
  for (const id of httpCaseIds) {
    const previous = expected.http[id];
    const next = actual.http[id];
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    const statusChange =
      previous?.status === next?.status ? '' : `; status ${previous?.status ?? 'n/a'} -> ${next?.status ?? 'n/a'}`;
    changes.push(`HTTP ${id}: ${formatByteChange(previous?.rawBytes, next?.rawBytes)}${statusChange}`);
  }
  return changes;
}

async function main(): Promise<void> {
  const actual = await captureBaseline();
  if (process.argv.includes('--print')) {
    process.stdout.write(`${JSON.stringify(actual, null, 2)}\n`);
    return;
  }

  const expected = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as ContractBaseline;
  if (process.argv.includes('--update')) {
    const changes = summarizeBaselineChanges(actual, expected);
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
    process.stdout.write(
      changes.length === 0
        ? `MCP contract baseline updated with no fingerprint changes (${BASELINE_PATH})\n`
        : `MCP contract baseline updated (${BASELINE_PATH}):\n${changes.map((change) => `- ${change}`).join('\n')}\n`,
    );
    return;
  }

  try {
    verifyBaseline(actual, expected);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n${UPDATE_GUIDANCE}`);
  }
  process.stdout.write(
    `MCP contract baseline passed (${TOOL_PROFILES.length} profiles, ${Object.keys(actual.http).length} HTTP cases)\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
