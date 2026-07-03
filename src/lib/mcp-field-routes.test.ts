// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  closeServer,
  createLegacyTestApiServer,
  createSearchFixture,
  getJson,
  postJson,
  type McpErrorEnvelope,
  type McpNoOpEnvelope,
  type SearchFixture,
} from './mcp-api-test-harness';
import { expectMcpNoOpEnvelope, useMcpApiTestDir } from './mcp-api-vitest-helpers';

const TEST_DIR = useMcpApiTestDir('field-routes');
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

describe('MCP API structured error envelopes — field routes', () => {
  it('returns a structured error envelope for GET /field/not-a-real-field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/field/not-a-real-field');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:not-a-real-field');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/not-a-real-field (method-aware)', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/not-a-real-field', {
        content: 'x',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'update field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:not-a-real-field');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch with fields: not-an-array', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch', {
        fields: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read field batch');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch');
      // Schema validation rejects non-array fields with a type error
      expect(res.data.error).toMatch(/array|non-empty/i);
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch with 21 fields', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const fields = Array.from({ length: 21 }, (_, i) => `field${i}`);
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch', { fields });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read field batch');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch');
      expect(res.data.error).toContain('Maximum');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch with non-string array member', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch', {
        fields: ['name', 42],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read field batch');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch');
      expect(res.data.error).toContain('string');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with entries: []', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch-write');
      expect(res.data.error).toContain('non-empty');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with 21 entries', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const entries = Array.from({ length: 21 }, (_, i) => ({ field: `f${i}`, content: 'x' }));
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', { entries });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch-write');
      expect(res.data.error).toContain('Maximum');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with missing field/content', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ content: 'hello' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:batch-write');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with read-only field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'creationDate', content: '2024-01-01' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:creationDate');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with unsupported field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'lorebook', content: '{}' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:lorebook');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with unknown field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'not-a-real-field', content: 'x' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:not-a-real-field');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with boolean type mismatch', async () => {
    const fixture: SearchFixture = { _fileType: 'risum' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'hideIcon', content: 'yes' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:hideIcon');
      expect(res.data.error).toContain('boolean');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with excluded array field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'alternateGreetings', content: 'not-an-array' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:alternateGreetings');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with string type mismatch', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'name', content: 12345 }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:name');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/description/insert with position after and no anchor', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/description/insert', {
        content: 'hello',
        position: 'after',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'insert in field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:description');
      expect(res.data.error).toContain('anchor');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/description/batch-replace with replacements: []', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/description/batch-replace', {
        replacements: [],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch replace in field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:description');
      expect(res.data.error).toContain('non-empty');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/description/batch-replace with 51 replacements', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const replacements = Array.from({ length: 51 }, (_, i) => ({ find: `f${i}`, replace: `r${i}` }));
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/description/batch-replace', {
        replacements,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch replace in field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:description');
      expect(res.data.error).toContain('Maximum');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/description/batch-replace with one replacement missing find', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/description/batch-replace', {
        replacements: [{ replace: 'bar' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch replace in field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:description');
      expect(res.data.error).toContain('find');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured no-op envelope for POST /field/description/replace with no matches', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/field/description/replace', {
        find: 'missing-value',
        replace: 'updated',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'replace in field',
        target: 'field:description',
      });
      expect(res.data.message).toBe('일치하는 항목 없음');
      expect(res.data.matchCount).toBe(0);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured no-op envelope for POST /field/description/block-replace when end anchor is missing', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      description: 'START\nField Alpha is searchable.',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/field/description/block-replace', {
        start_anchor: 'START',
        end_anchor: 'END',
        content: 'replacement',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'block replace in field',
        target: 'field:description',
      });
      expect(res.data.error).toContain('끝 앵커');
      expect(res.data.startAnchorFoundAt).toBe(0);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with number type mismatch', async () => {
    const fixture: SearchFixture = { _fileType: 'risup' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'temperature', content: 'not-a-number' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:temperature');
      expect(res.data.error).toContain('number');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with JSON-field non-string rejection', async () => {
    const fixture: SearchFixture = { _fileType: 'risup', promptTemplate: '[]' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'promptTemplate', content: 12345 }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:promptTemplate');
      expect(res.data.error).toContain('문자열');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with JSON parse/shape validation failure', async () => {
    const fixture: SearchFixture = { _fileType: 'risup', formatingOrder: '[]', promptTemplate: '[]' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'formatingOrder', content: '{not valid json' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:formatingOrder');
      expect(res.data.suggestion).toBeDefined();
      expect(res.data.details).toBeDefined();
      expect(res.data.details).toHaveProperty('parseError');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with charx deprecated field', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'personality', content: 'new value' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:personality');
      expect(res.data.error).toContain('deprecated');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects direct field writes to risup legacy prompt fields', async () => {
    const fixture: SearchFixture = { _fileType: 'risup', mainPrompt: 'legacy', promptTemplate: '[]' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/mainPrompt', {
        content: 'new legacy prompt',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'update field');
      expect(res.data).toHaveProperty('target', 'field:mainPrompt');
      expect(res.data.error).toContain('읽기 전용');
      expect(fixture.mainPrompt).toBe('legacy');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects risum reserved and MCP URL field writes while allowing lowLevelAccess to remain editable', async () => {
    const fixture: SearchFixture = {
      _fileType: 'risum',
      cjs: 'old',
      lowLevelAccess: false,
      mcpUrl: 'http://localhost:3000/mcp',
    };
    const api = await startTestApiServer(fixture);
    try {
      const cjsRes = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/cjs', {
        content: 'module.exports = {}',
      });
      expect(cjsRes.status).toBe(400);
      expect(cjsRes.data).toHaveProperty('target', 'field:cjs');
      expect(cjsRes.data.error).toContain('읽기 전용');
      expect(fixture.cjs).toBe('old');

      const mcpUrlRes = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/mcpUrl', {
        content: 'http://localhost:3001/mcp',
      });
      expect(mcpUrlRes.status).toBe(400);
      expect(mcpUrlRes.data).toHaveProperty('target', 'field:mcpUrl');
      expect(mcpUrlRes.data.error).toContain('읽기 전용');
      expect(fixture.mcpUrl).toBe('http://localhost:3000/mcp');

      const lowLevelRes = await postJson<{ success: boolean; results: Array<{ field: string }> }>(
        api.port,
        api.token,
        '/field/batch-write',
        {
          entries: [{ field: 'lowLevelAccess', content: true }],
        },
      );
      expect(lowLevelRes.status).toBe(200);
      expect(lowLevelRes.data.success).toBe(true);
      expect(fixture.lowLevelAccess).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('hides deprecated fields from direct reads, batch reads, field inventory, and root surfaces', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      personality: 'legacy personality',
      groupOnlyGreetings: ['hidden group greeting'],
    };
    const api = await startTestApiServer(fixture);
    try {
      const fieldRead = await getJson<McpErrorEnvelope>(api.port, api.token, '/field/personality');
      expect(fieldRead.status).toBe(400);
      expect(fieldRead.data.error).toContain('숨겨집니다');

      const fields = await getJson<{
        fields: Array<{ name: string }>;
        hiddenFieldWarnings: Array<Record<string, unknown>>;
      }>(api.port, api.token, '/fields');
      expect(fields.status).toBe(200);
      expect(fields.data.fields.map((field) => field.name)).not.toContain('personality');
      expect(fields.data.hiddenFieldWarnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'personality', size: 'legacy personality'.length }),
          expect.objectContaining({ field: 'groupOnlyGreetings', count: 1 }),
        ]),
      );

      const batch = await postJson<{ fields: Array<Record<string, unknown>> }>(api.port, api.token, '/field/batch', {
        fields: ['name', 'groupOnlyGreetings', 'personality'],
      });
      expect(batch.status).toBe(200);
      expect(batch.data.fields).toEqual([
        expect.objectContaining({ field: 'name', content: '' }),
        expect.objectContaining({ field: 'groupOnlyGreetings', hidden: true }),
        expect.objectContaining({ field: 'personality', hidden: true }),
      ]);

      const root = await postJson<{ value: Record<string, unknown> }>(api.port, api.token, '/surface/read', {
        path: '/',
      });
      expect(root.status).toBe(200);
      expect(root.data.value).not.toHaveProperty('personality');
      expect(root.data.value).not.toHaveProperty('groupOnlyGreetings');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects surface mutations that target deprecated or reserved fields', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      groupOnlyGreetings: ['group-only'],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/surface/patch', {
        operations: [{ op: 'replace', path: '/groupOnlyGreetings/0', value: 'changed' }],
        dry_run: true,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('target', 'surface:groupOnlyGreetings');
      expect(res.data.error).toContain('deprecated');
      expect(fixture.groupOnlyGreetings).toEqual(['group-only']);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects group-only greeting mutation routes', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      groupOnlyGreetings: ['group-only'],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/greeting/group/0', {
        content: 'changed',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('target', 'greeting:group');
      expect(res.data.error).toContain('deprecated');
      expect(fixture.groupOnlyGreetings).toEqual(['group-only']);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns unknown-field envelope for POST /field/batch-write with moduleId on charx', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'moduleId', content: 'mod-123' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:moduleId');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns unknown-field envelope for POST /field/batch-write with creationDate on risup', async () => {
    const fixture: SearchFixture = { _fileType: 'risup' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'creationDate', content: '2026-04-01T00:00:00.000Z' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:creationDate');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /field/batch-write with surface-invalid field on charx', async () => {
    const fixture: SearchFixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/field/batch-write', {
        entries: [{ field: 'mainPrompt', content: 'new prompt' }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:mainPrompt');
      expect(res.data.error).toContain('Unknown field');
      expect(res.data.suggestion).toBeDefined();
    } finally {
      await closeServer(api.server);
    }
  });
});
