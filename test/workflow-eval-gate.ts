import assert from 'node:assert/strict';

export function assertReplayScenariosPassed(results: readonly { id: string; passed: boolean; error?: string }[]): void {
  assert.ok(results.length > 0, 'Workflow replay must execute at least one scenario');
  const failures = results.filter((result) => !result.passed);
  assert.equal(
    failures.length,
    0,
    `Workflow replay failed:\n${failures.map((result) => `${result.id}: ${result.error ?? 'scenario failed'}`).join('\n')}`,
  );
}
