import { describe, expect, it } from 'vitest';
import { matchLorebookEntries, runRegexPipeline, simulateLorebookActivation } from './content-simulation';

describe('content simulation', () => {
  it('runs regex scripts in order and reports invalid expressions', () => {
    const result = runRegexPipeline(
      'alpha beta',
      [
        { type: 'editinput', comment: 'second', find: 'BETA', replace: 'gamma', ableFlag: true, flag: 'gi<order 2>' },
        { type: 'editinput', comment: 'first', find: 'alpha', replace: 'BETA', ableFlag: true, flag: 'g<order 1>' },
        { type: 'editinput', comment: 'invalid', find: '[', replace: 'x', ableFlag: true, flag: 'g<order 3>' },
      ],
      'editinput',
    );

    expect(result.result).toBe('gamma gamma');
    expect(result.ok).toBe(false);
    expect(result.trace.map((entry) => entry.comment)).toEqual(['first', 'second', 'invalid']);
    expect(result.trace[0]).toEqual(expect.objectContaining({ matchCount: 1, changed: true }));
    expect(result.trace[2].error).toBeTruthy();
  });

  it('matches keys, selective keys, decorators, and exclusions', () => {
    const matches = matchLorebookEntries(
      [{ role: 'user', content: 'The blue bridge contains a silver rune.' }],
      [
        { key: 'bridge', content: 'Bridge lore', insertorder: 20 },
        { key: 'blue', secondkey: 'rune', selective: true, content: 'Selective lore', insertorder: 10 },
        { key: 'missing', content: '@@activate\nForced lore', insertorder: 30 },
        { key: 'bridge', content: '@@exclude_keys rune\nExcluded lore' },
        { key: 'bridge', content: '@@probability 0\nDisabled lore' },
      ],
    );

    expect(matches.map((match) => match.index)).toEqual([1, 0, 2]);
    expect(matches[0].reason).toBe('key+secondkey');
    expect(matches[2].reason).toBe('@@activate');
  });

  it('keeps forced activation independent of additional keys', () => {
    const matches = matchLorebookEntries(
      [{ role: 'user', content: 'no matching keys here' }],
      [{ key: 'missing', content: '@@activate\n@@additional_keys also-missing\nForced lore' }],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ index: 0, reason: '@@activate' });
  });

  it('reports invalid lorebook key regexes without activating them', () => {
    const errors: Array<{ entryIndex: number; key: string; message: string }> = [];
    const matches = matchLorebookEntries(
      [{ role: 'user', content: 'anything' }],
      [{ key: '[', useRegex: true, content: 'Invalid regex lore' }],
      10,
      { onRegexError: (error) => errors.push(error) },
    );

    expect(matches).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual(expect.objectContaining({ entryIndex: 0, key: '[' }));
    expect(errors[0].message).toBeTruthy();
  });

  it('stops a lorebook iteration after the request signal is aborted', () => {
    const controller = new AbortController();
    expect(() =>
      matchLorebookEntries(
        [{ role: 'user', content: 'anything' }],
        [
          { key: '[', useRegex: true, content: 'Invalid regex lore' },
          { key: 'anything', content: 'Must not be inspected' },
        ],
        10,
        {
          signal: controller.signal,
          onRegexError: () => controller.abort(),
        },
      ),
    ).toThrow();
  });

  it('stops a regex iteration when the request was already cancelled', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      runRegexPipeline(
        'alpha',
        [{ type: 'editinput', comment: 'first', find: 'alpha', replace: 'beta', ableFlag: true, flag: 'g' }],
        'editinput',
        undefined,
        controller.signal,
      ),
    ).toThrow();
  });

  it('recursively activates chained entries and terminates cycles', () => {
    const result = simulateLorebookActivation({
      messages: [{ role: 'user', content: 'seed' }],
      lorebook: [
        { key: 'seed', content: 'next-key' },
        { key: 'next-key', content: 'cycle-key' },
        { key: 'cycle-key', content: 'seed' },
      ],
      recursive: true,
      maxPasses: 10,
      includeContent: true,
    });

    expect(result.matches.map((match) => match.index)).toEqual([0, 1, 2]);
    expect(result.matches.map((match) => match.activationPass)).toEqual([1, 2, 3]);
    expect(result.truncatedRecursiveScan).toBe(false);
    expect(result.passes).toBe(4);
  });

  it('reports recursive truncation when the pass cap is reached', () => {
    const result = simulateLorebookActivation({
      messages: [{ role: 'user', content: 'a' }],
      lorebook: [
        { key: 'a', content: 'b' },
        { key: 'b', content: 'c' },
        { key: 'c', content: 'd' },
      ],
      recursive: true,
      maxPasses: 2,
    });

    expect(result.matches.map((match) => match.index)).toEqual([0, 1]);
    expect(result.truncatedRecursiveScan).toBe(true);
  });
});
