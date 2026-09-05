// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { evaluateBot, evaluateBotSchema } from './mcp-tool-register-evaluation';
import {
  createFacadeContentEngine,
  type FacadeContentEngine,
  type FacadeContentEngineDeps,
} from './mcp-facade-content';
import { facadeApiError, isApiError } from './mcp-facade-runtime';
import { closeServer, createLegacyTestApiServer, getJson, postJson, type SearchFixture } from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';

const TEST_DIR = useMcpApiTestDir('bot-evaluation');
const startApi = createLegacyTestApiServer(TEST_DIR);
const input = (cases: unknown[], max_bytes = 24576) =>
  evaluateBotSchema.parse({ target: { kind: 'active' }, cases, max_bytes });
const fieldCase = { name: 'character contract', kind: 'field', field: 'description', equals: 'A patient guide.' };
const loreCase = {
  name: 'forest activation',
  kind: 'lorebook',
  messages: [{ role: 'user', content: 'forest' }],
  expected_active: [0],
  expected_inactive: [1],
};

function fakeEngine(
  overrides: Partial<Pick<FacadeContentEngine, 'readFacadeSelector' | 'analyzeFacadeOperation'>> = {},
) {
  return {
    readFacadeSelector: vi.fn(async (_target, selector) => ({
      data:
        selector.family === 'surface'
          ? { hash: 'stable-complete-source-hash', raw_omitted: true }
          : selector.family === 'lorebook'
            ? { count: 2 }
            : { content: 'A patient guide.' },
      routes: [],
    })),
    analyzeFacadeOperation: vi.fn(async () => ({ data: { matches: [{ index: 0 }] }, routes: [], touchedTargets: [] })),
    ...overrides,
  } satisfies Pick<FacadeContentEngine, 'readFacadeSelector' | 'analyzeFacadeOperation'>;
}

describe('evaluate_bot deterministic evidence', () => {
  it('evaluates real field/regex/lorebook content and catches a regression after an artifact edit', async () => {
    const fixture: SearchFixture = {
      name: 'Guide Bot',
      description: 'A patient guide.',
      regex: [{ comment: 'polite greeting', type: 'editoutput', find: 'hello', replace: 'welcome' }],
      lorebook: [
        { comment: 'forest', key: 'forest', content: 'Trees surround the path.' },
        { comment: 'ocean', key: 'ocean', content: 'Waves break.' },
      ],
    };
    const api = await startApi(fixture);
    const engine = createFacadeContentEngine({
      apiRequest: async (method: string, route: string, body?: unknown) => {
        const response =
          method === 'GET'
            ? await getJson<Record<string, unknown>>(api.port, api.token, route)
            : await postJson<Record<string, unknown>>(api.port, api.token, route, body);
        return response.status >= 400
          ? facadeApiError(response.status, String(response.data.error), 'Fix the request.')
          : response.data;
      },
      danbooru: {},
      items: {},
      scriptStyle: { isScriptStyleFamily: () => false },
    } as unknown as FacadeContentEngineDeps);
    const request = input([
      fieldCase,
      {
        name: 'polite output',
        kind: 'regex',
        text: 'hello, traveler',
        mode: 'editoutput',
        equals: 'welcome, traveler',
      },
      loreCase,
    ]);
    try {
      const before = await evaluateBot(request, engine);
      expect(before).toMatchObject({ status: 200, passed: true, total: 3, passed_count: 3, failed_count: 0 });
      expect(before.limitations).toEqual(
        expect.arrayContaining([expect.stringContaining('no LLM'), expect.stringContaining('Lua')]),
      );
      const edited = await postJson(api.port, api.token, '/surface/patch', {
        operations: [{ op: 'replace', path: '/description', value: 'An impatient guide.' }],
      });
      expect(edited.status).toBe(200);
      const after = await evaluateBot(request, engine);
      expect(after).toMatchObject({ passed: false, passed_count: 2, failed_count: 1 });
      expect(after.source_fingerprint).not.toBe(before.source_fingerprint);
      expect(after.cases).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'character contract', passed: false })]),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects vacuous cases before any content read', () => {
    expect(
      evaluateBotSchema.safeParse({
        target: { kind: 'active' },
        cases: [{ name: 'empty', kind: 'field', field: 'description', contains: [] }],
      }).success,
    ).toBe(false);
  });

  it('does not claim a pass for missing or changing source hashes', async () => {
    const missing = fakeEngine({
      readFacadeSelector: vi.fn(async () => ({ data: { overview: 'unchanged preview' }, routes: [] })),
    });
    expect(await evaluateBot(input([fieldCase]), missing)).toMatchObject({ status: 409 });
    expect(missing.analyzeFacadeOperation).not.toHaveBeenCalled();
    let surfaceReads = 0;
    const changing = fakeEngine({
      readFacadeSelector: vi.fn(async (_target, selector) => ({
        data:
          selector.family === 'surface'
            ? { hash: ++surfaceReads === 1 ? 'before' : 'after', overview: 'identical visible preview' }
            : { content: 'A patient guide.' },
        routes: [],
      })),
    });
    const result = await evaluateBot(input([fieldCase]), changing);
    expect(isApiError(result)).toBe(true);
    expect(result).toMatchObject({ status: 409, error: 'Document changed during evaluation' });
    expect(result).not.toHaveProperty('passed', true);
  });

  it.each([
    { content: 'A patient guide.', truncated: true },
    { content: 'A patient guide.', next_cursor: 'more' },
    { content: 42 },
  ])('refuses text assertions over incomplete or non-text source data', async (data) => {
    const engine = fakeEngine({
      readFacadeSelector: vi.fn(async (_target, selector) => ({
        data: selector.family === 'surface' ? { hash: 'stable' } : data,
        routes: [],
      })),
    });
    expect(await evaluateBot(input([fieldCase]), engine)).toMatchObject({
      passed: false,
      failed_count: 1,
      cases: [expect.objectContaining({ error: expect.any(String) })],
    });
  });

  it.each([
    { matches: [{ index: 0 }], truncatedRecursiveScan: true },
    {},
    { matches: [], truncated: true },
    { matches: [{ index: '0' }] },
  ])('refuses incomplete or malformed lorebook simulation results', async (data) => {
    const engine = fakeEngine({
      analyzeFacadeOperation: vi.fn(async () => ({ data, routes: [], touchedTargets: [] })),
    });
    expect(await evaluateBot(input([loreCase]), engine)).toMatchObject({ passed: false, failed_count: 1 });
  });

  it('fails nonexistent inactive lorebook indices and regex execution errors', async () => {
    expect(
      await evaluateBot(input([{ ...loreCase, expected_active: [], expected_inactive: [99] }]), fakeEngine()),
    ).toMatchObject({ passed: false });
    const engine = fakeEngine({
      analyzeFacadeOperation: vi.fn(async () => ({
        data: { ok: false, result: 'unchanged' },
        routes: [],
        touchedTargets: [],
      })),
    });
    expect(
      await evaluateBot(
        input([{ name: 'broken regex', kind: 'regex', text: 'unchanged', mode: 'editoutput', equals: 'unchanged' }]),
        engine,
      ),
    ).toMatchObject({ passed: false });
  });

  it('records case API failures instead of manufacturing passing checks', async () => {
    const engine = fakeEngine({
      analyzeFacadeOperation: vi.fn(async () => facadeApiError(404, 'Missing source', 'Reload it.')),
    });
    expect(await evaluateBot(input([loreCase]), engine)).toMatchObject({
      passed: false,
      cases: [expect.objectContaining({ checks: [], error: 'Missing source' })],
    });
  });

  it('keeps unopened external evaluation bound to the explicit file target', async () => {
    const engine = fakeEngine();
    const target = { kind: 'external', file_path: '/fixtures/reference-bot.charx' } as const;
    const result = await evaluateBot(evaluateBotSchema.parse({ target, cases: [fieldCase, loreCase] }), engine);
    expect(result).toMatchObject({ passed: true });
    expect(
      vi
        .mocked(engine.readFacadeSelector)
        .mock.calls.every(([calledTarget]) => JSON.stringify(calledTarget) === JSON.stringify(target)),
    ).toBe(true);
    expect(engine.analyzeFacadeOperation).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ action: 'simulate_lorebook' }),
    );
  });

  it('bounds the complete UTF-8 response without hiding aggregate failures or leaking source text', async () => {
    const cases = Array.from({ length: 30 }, (_, index) => ({
      ...fieldCase,
      name: `사례🙂${index}`,
      contains: Array.from({ length: 30 }, () => 'guide'),
      ...(index === 29 ? { equals: 'wrong' } : {}),
    }));
    const result = await evaluateBot(input(cases, 4096), fakeEngine());
    const serialized = JSON.stringify(result);
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(4096);
    expect(result).toMatchObject({ passed: false, total: 30, passed_count: 29, failed_count: 1, truncated: true });
    expect(Number(result.omitted_case_count)).toBeGreaterThan(0);
    expect(Number(result.returned_case_count) + Number(result.omitted_case_count)).toBe(30);
    expect(result.cases).toEqual(expect.arrayContaining([expect.objectContaining({ case_index: 29, passed: false })]));
    expect(serialized).not.toContain('A patient guide.');
    expect(serialized).not.toContain('\uFFFD');
  });
});
