// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runStandaloneRealCorpusFacadeReadEval } from '../../test/mcp-search-real-corpus';
import { buildRealCorpusFacadeCases } from '../../test/mcp-search-shared';

vi.mock('../../test/mcp-search-shared', () => ({
  buildRealCorpusFacadeCases: vi.fn(() => []),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('local corpus evaluation opt-in', () => {
  it.each([undefined, '0', 'true'])('does not discover user files with opt-in %s', async (value) => {
    vi.stubEnv('RISUTOKI_TEST_LOCAL_CORPUS', value);
    await runStandaloneRealCorpusFacadeReadEval();
    expect(buildRealCorpusFacadeCases).not.toHaveBeenCalled();
  });

  it('discovers the corpus only with explicit opt-in', async () => {
    vi.stubEnv('RISUTOKI_TEST_LOCAL_CORPUS', '1');
    await runStandaloneRealCorpusFacadeReadEval();
    expect(buildRealCorpusFacadeCases).toHaveBeenCalledOnce();
  });
});
