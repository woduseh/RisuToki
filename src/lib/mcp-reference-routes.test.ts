// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  closeServer,
  createLegacyTestApiServer,
  createSearchFixture,
  getJson,
  postJson,
  type McpErrorEnvelope,
  type SearchFixture,
} from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';

const TEST_DIR = useMcpApiTestDir('reference-routes');
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

describe('MCP API structured error envelopes — reference routes', () => {
  const referenceFiles = [
    {
      fileName: 'ref.charx',
      data: {
        lorebook: [{ comment: 'Entry A', key: 'a', content: 'content-a' }],
        regex: [{ comment: 'test-regex', type: 'editoutput', find: 'foo', replace: 'bar' }],
        lua: '',
        css: '',
      },
    },
  ];

  it('returns a structured error envelope for GET /reference/99/lorebook (out-of-range ref index)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/99/lorebook');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:99:lorebook');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /reference/0/lorebook/batch with invalid indices', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/lorebook/batch', {
        indices: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch read reference lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:lorebook:batch');
      expect(res.data.error).toContain('indices must be an array');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for GET /reference/0/lorebook/999 (invalid entry index)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/lorebook/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:lorebook:999');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for GET /reference/0/regex/999 (invalid entry index)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/regex/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference regex');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:regex:999');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /reference/0/lua/batch with oversized indices', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const indices = Array.from({ length: 21 }, (_, i) => i);
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/lua/batch', { indices });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch read reference lua');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:lua:batch');
      expect(res.data.error).toContain('Maximum');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for GET /reference/0/lua/999 (invalid section index)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/lua/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference lua');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:lua:999');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for POST /reference/0/css/batch with invalid indices', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/css/batch', {
        indices: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch read reference css');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:css:batch');
      expect(res.data.error).toContain('indices must be an array');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for GET /reference/0/css/999 (invalid section index)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/css/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference css');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:css:999');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for GET /reference/0/badfield (unknown field)', async () => {
    const api = await startTestApiServer(createSearchFixture(), referenceFiles);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/0/badfield');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read reference field');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'reference:0:badfield');
      expect(res.data.error).toContain('Unknown field');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP envelope — reference batch readers', () => {
  function createReferenceBatchFixture(): SearchFixture {
    return {
      ...createSearchFixture(),
      regex: [
        { comment: 'ref-regex', type: 'editoutput', in: 'foo', out: 'bar', find: 'foo', replace: 'bar', flag: 'g' },
      ],
      triggerScripts: [{ comment: 'ref-trigger', type: 'start', conditions: [], effect: [], lowLevelAccess: false }],
    };
  }

  it('read_reference_greeting_batch response includes envelope fields', async () => {
    const api = await startTestApiServer(createSearchFixture(), [
      { fileName: 'ref.charx', data: createReferenceBatchFixture() },
    ]);
    try {
      const res = await postJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/reference/0/greeting/alternate/batch',
        {
          indices: [0, 99],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.refIndex).toBe(0);
      expect(res.data.type).toBe('alternate');
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_reference_trigger_batch response includes envelope fields', async () => {
    const api = await startTestApiServer(createSearchFixture(), [
      { fileName: 'ref.charx', data: createReferenceBatchFixture() },
    ]);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/reference/0/trigger/batch', {
        indices: [0, 99],
      });
      expect(res.status).toBe(200);
      expect(res.data.refIndex).toBe(0);
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.triggers)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_reference_regex_batch response includes envelope fields', async () => {
    const api = await startTestApiServer(createSearchFixture(), [
      { fileName: 'ref.charx', data: createReferenceBatchFixture() },
    ]);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/reference/0/regex/batch', {
        indices: [0, 99],
      });
      expect(res.status).toBe(200);
      expect(res.data.refIndex).toBe(0);
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_reference_risup_prompt_item_batch response includes envelope fields', async () => {
    const api = await startTestApiServer(createSearchFixture(), [
      {
        fileName: 'ref.risup',
        data: {
          _fileType: 'risup',
          promptTemplate: JSON.stringify([
            { id: 'prompt-1', type: 'plain', type2: 'normal', text: 'Hello', role: 'system' },
          ]),
        },
      },
    ]);
    try {
      const res = await postJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/reference/0/risup/prompt-items/batch',
        {
          indices: [0, 99],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.index).toBe(0);
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(2);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });
});
