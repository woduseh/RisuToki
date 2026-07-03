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

const TEST_DIR = useMcpApiTestDir('section-routes');
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

describe('MCP API structured error envelopes — lua-section routes', () => {
  it('returns a structured error envelope for invalid index in GET /lua/:idx', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/lua/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read lua section');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for non-array indices in POST /lua/batch', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/batch', {
        indices: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('indices must be an array');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for exceeding max batch size in POST /lua/batch', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const indices = Array.from({ length: 21 }, (_, i) => i);
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/batch', { indices });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('Maximum');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for missing name in POST /lua/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/add', {
        content: 'some code',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('Missing');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns details.existingIndex for duplicate section name in POST /lua/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseLuaSections: () => [{ name: 'TestSection', content: 'code here' }],
    });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/add', {
        name: 'TestSection',
        content: 'new code',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('already exists');
      expect(res.data.details).toEqual({ existingIndex: 0 });
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for anchor-required in POST /lua/:idx/insert', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseLuaSections: () => [{ name: 'TestSection', content: 'code here' }],
    });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/0/insert', {
        content: 'new code',
        position: 'after',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('anchor');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured no-op envelope for no matches in POST /lua/:idx/replace', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      lua: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseLuaSections: () => [{ name: 'TestSection', content: 'print("hello")' }],
    });
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/lua/0/replace', {
        find: 'missing-value',
        replace: 'updated',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'replace lua section content',
        target: 'lua:0',
      });
      expect(res.data.message).toBe('일치하는 항목 없음');
      expect(res.data.matchCount).toBe(0);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — css-section routes', () => {
  it('returns a structured error envelope for invalid index in GET /css-section/:idx', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/css-section/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read css section');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for non-array indices in POST /css-section/batch', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/batch', {
        indices: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(res.data.error).toContain('indices must be an array');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for exceeding max batch size in POST /css-section/batch', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const indices = Array.from({ length: 21 }, (_, i) => i);
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/batch', { indices });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('Maximum');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for missing name in POST /css-section/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: '',
    };
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/add', {
        content: 'some css',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('Missing');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns details.existingIndex for duplicate section name in POST /css-section/add', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseCssSections: () => ({ sections: [{ name: 'TestSection', content: 'css here' }], prefix: '', suffix: '' }),
    });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/add', {
        name: 'TestSection',
        content: 'new css',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('already exists');
      expect(res.data.details).toEqual({ existingIndex: 0 });
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for anchor-required in POST /css-section/:idx/insert', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseCssSections: () => ({ sections: [{ name: 'TestSection', content: 'css here' }], prefix: '', suffix: '' }),
    });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/0/insert', {
        content: 'new css',
        position: 'before',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target');
      expect(res.data.error).toContain('anchor');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured no-op envelope for anchor miss in POST /css-section/:idx/insert', async () => {
    const fixture: SearchFixture = {
      ...createSearchFixture(),
      css: 'has-section',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      parseCssSections: () => ({
        sections: [{ name: 'TestSection', content: 'body { color: red; }' }],
        prefix: '',
        suffix: '',
      }),
    });
    try {
      const res = await postJson<McpNoOpEnvelope>(api.port, api.token, '/css-section/0/insert', {
        content: 'p { color: blue; }',
        position: 'before',
        anchor: 'missing-anchor',
      });
      expect(res.status).toBe(200);
      expectMcpNoOpEnvelope(res.data, {
        action: 'insert css section content',
        target: 'css-section:0',
      });
      expect(res.data.error).toContain('앵커 문자열');
      expect(res.data.message).toContain('missing-anchor');
    } finally {
      await closeServer(api.server);
    }
  });
});
