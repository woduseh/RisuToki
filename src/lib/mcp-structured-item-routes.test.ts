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

const TEST_DIR = useMcpApiTestDir('structured-item-routes');
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

describe('MCP API structured error envelopes — regex routes', () => {
  it('returns a structured error envelope for out-of-range index in POST /regex/batch-write', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      regex: [{ comment: 'test-regex', type: 'editoutput', find: 'foo', replace: 'bar' }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/regex/batch-write', {
        entries: [{ index: 999, data: { find: 'x', replace: 'y' } }],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured no-op envelope for anchor miss in POST /regex/:idx/insert', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      regex: [{ comment: 'test-regex', type: 'editoutput', find: 'foo', replace: 'bar' }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/regex/0/insert', {
        field: 'find',
        content: 'baz',
        position: 'after',
        anchor: 'missing-anchor',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'insert regex field',
        target: 'regex:0:insert',
      });
      expect(res.data.error).toContain('앵커 문자열');
      expect(res.data.message).toContain('missing-anchor');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — greeting routes', () => {
  it('returns a structured error envelope for invalid permutation in POST /greeting/alternate/reorder', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      alternateGreetings: ['Hello', 'Hi', 'Hey'],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/greeting/alternate/reorder', {
        order: [0, 0, 0],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('permutation');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API insert-regex-field action consistency', () => {
  it('uses canonical action "insert regex field" when field is invalid', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      regex: [{ comment: 'test-regex', type: 'editoutput', find: 'foo', replace: 'bar' }],
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/regex/0/insert', {
        field: 'invalid_field',
        content: 'hello',
      });
      expect(res.status).toBe(400);
      expect(res.data.action).toBe('insert regex field');
    } finally {
      await closeServer(api.server);
    }
  });
});

// ================================================================
// Envelope migration: lorebook write/batch, regex, greeting, trigger
// ================================================================
describe('MCP envelope — lorebook/regex/greeting/trigger CRUD families', () => {
  function createEnvelopeFixture(): SearchFixture {
    return {
      ...createSearchFixture(),
      regex: [
        { comment: 'test-regex', type: 'editoutput', in: 'foo', out: 'bar', find: 'foo', replace: 'bar', flag: 'g' },
      ],
      triggerScripts: [{ comment: 'test-trigger', type: 'start', conditions: [], effect: [], lowLevelAccess: false }],
    };
  }

  // --- Lorebook family ---

  it('read_lorebook_batch response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/batch', {
        indices: [0],
      });
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.total).toBe(1);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_lorebook response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/0', {
        content: 'updated lore',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(0);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_lorebook rejects stale expected_comment with 409 envelope', async () => {
    const api = await startTestApiServer(createEnvelopeFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/0', {
        content: 'updated lore',
        expected_comment: 'Wrong lore',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('lorebook:0');
      expect(res.data.error).toContain('Stale lorebook index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch_delete_lorebook response includes results alias', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/batch-delete', {
        indices: [0],
        expected_comments: ['Bridge lore'],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.deleted).toBe(1);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.comment).toBe('Bridge lore');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('validate_lorebook_keys response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook/validate');
      expect(res.status).toBe(200);
      expect(typeof res.data.totalEntries).toBe('number');
      expect(typeof res.data.issueCount).toBe('number');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('diff_lorebook response includes envelope fields', async () => {
    const refData: SearchFixture = {
      lorebook: [{ comment: 'Bridge lore', key: 'bridge', content: 'Different reference.' }],
    };
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture, [{ fileName: 'ref.charx', data: refData }]);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/diff', {
        index: 0,
        refIndex: 0,
        refEntryIndex: 0,
      });
      expect(res.status).toBe(200);
      expect(typeof res.data.identical).toBe('boolean');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Regex family ---

  it('list_regex response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/regex');
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_regex response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/regex/0');
      expect(res.status).toBe(200);
      expect(res.data.index).toBe(0);
      expect(res.data.entry).toBeDefined();
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_regex_batch response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/regex/batch', {
        indices: [0, 99],
      });
      expect(res.status).toBe(200);
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

  it('write_regex response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/regex/0', {
        comment: 'updated-regex',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_regex rejects stale expected_comment with 409 envelope', async () => {
    const api = await startTestApiServer(createEnvelopeFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/regex/0', {
        comment: 'updated-regex',
        expected_comment: 'wrong-regex',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('regex:0');
      expect(res.data.error).toContain('Stale regex index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_regex_batch response includes results alias', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/regex/batch-write', {
        entries: [{ index: 0, data: { comment: 'batch-regex' }, expected_comment: 'test-regex' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.comment).toBe('batch-regex');
      expect(res.data.status).toBe(200);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Greeting family ---

  it('list_greetings response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/greetings/alternate');
      expect(res.status).toBe(200);
      expect(typeof res.data.count).toBe('number');
      expect(res.data.type).toBe('alternate');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_greeting response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/greeting/alternate/0');
      expect(res.status).toBe(200);
      expect(res.data.index).toBe(0);
      expect(typeof res.data.content).toBe('string');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_greeting_batch response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/greeting/alternate/batch', {
        indices: [0, 99],
      });
      expect(res.status).toBe(200);
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

  it('write_greeting response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/greeting/alternate/0', {
        content: 'updated greeting',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_greeting rejects stale expected_preview with 409 envelope', async () => {
    const api = await startTestApiServer(createEnvelopeFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/greeting/alternate/0', {
        content: 'updated greeting',
        expected_preview: 'Wrong preview',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('greeting:alternate:0');
      expect(res.data.error).toContain('Stale greeting index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch_write_greeting response includes results alias', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/greeting/alternate/batch-write', {
        writes: [{ index: 0, content: 'updated greeting', expected_preview: 'Alternate Alpha greeting.' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.type).toBe('alternate');
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.preview).toBe('updated greeting');
      expect(res.data.status).toBe(200);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch_delete_greeting rejects stale expected_previews with 409 envelope', async () => {
    const api = await startTestApiServer(createEnvelopeFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/greeting/alternate/batch-delete', {
        indices: [0],
        expected_previews: ['Wrong preview'],
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('greeting:alternate:batch-delete');
      expect(res.data.error).toContain('Stale greeting index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch_delete_greeting response includes results alias', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/greeting/alternate/batch-delete', {
        indices: [0],
        expected_previews: ['Alternate Alpha greeting.'],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.deletedCount).toBe(1);
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.preview).toBe('Alternate Alpha greeting.');
      expect(res.data.status).toBe(200);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Trigger family ---

  it('list_triggers response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/triggers');
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_trigger response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/trigger/0');
      expect(res.status).toBe(200);
      expect(res.data.index).toBe(0);
      expect(res.data.trigger).toBeDefined();
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_trigger_batch response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/trigger/batch', {
        indices: [0, 99],
      });
      expect(res.status).toBe(200);
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

  it('write_trigger response includes envelope fields', async () => {
    const fixture = createEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/trigger/0', {
        comment: 'updated-trigger',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('delete_trigger rejects stale expected_comment with 409 envelope', async () => {
    const api = await startTestApiServer(createEnvelopeFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/trigger/0/delete', {
        expected_comment: 'wrong-trigger',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('trigger:0');
      expect(res.data.error).toContain('Stale trigger index 0');
    } finally {
      await closeServer(api.server);
    }
  });
});
