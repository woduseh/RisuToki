import { describe, expect, it } from 'vitest';

import { assertReplayScenariosPassed } from '../../test/workflow-eval-gate';

describe('workflow replay regression gate', () => {
  const passingResults = Array.from({ length: 12 }, (_, index) => ({ id: `scenario-${index}`, passed: true }));

  it('rejects one failed scenario even when the 85% aggregate target is met', () => {
    const results = passingResults.map((result, index) =>
      index === 11 ? { ...result, passed: false, error: 'exceeded call budget' } : result,
    );
    expect(results.filter((result) => result.passed).length / results.length).toBeGreaterThan(0.85);
    expect(() => assertReplayScenariosPassed(results)).toThrow('scenario-11: exceeded call budget');
  });

  it('accepts all successful scenarios and rejects an empty run', () => {
    expect(() => assertReplayScenariosPassed(passingResults)).not.toThrow();
    expect(() => assertReplayScenariosPassed([])).toThrow('at least one scenario');
  });
});
