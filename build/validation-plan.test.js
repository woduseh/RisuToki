'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createPlan } = require('./validation-plan');

test('each profile emits each dependency once and before its consumers', () => {
  for (const profile of ['quick', 'test', 'mcp', 'ci', 'full', 'windows']) {
    const plan = createPlan({ profile });
    const seen = new Set();
    for (const step of plan.steps) {
      assert.ok(!seen.has(step.id), `${profile}: duplicate ${step.id}`);
      for (const dependency of step.dependencies)
        assert.ok(seen.has(dependency), `${profile}: missing earlier ${dependency}`);
      seen.add(step.id);
    }
    assert.deepEqual(plan, createPlan({ profile }), 'plans are deterministic');
    for (const id of ['node-build', 'mcp-build']) {
      assert.equal(plan.steps.filter((step) => step.id === id).length, profile === 'quick' ? 0 : 1);
    }
  }
});

test('quick is build-free; CI and full retain every validation surface', () => {
  assert.deepEqual(
    createPlan().steps.map((step) => step.id),
    ['lint', 'typecheck-vue', 'typecheck-electron', 'typecheck-node', 'unit', 'tooling-tests'],
  );
  const ci = createPlan({ profile: 'ci' }).steps.map((step) => step.id);
  assert.deepEqual(
    new Set(ci),
    new Set([
      'lint',
      'typecheck-vue',
      'typecheck-electron',
      'typecheck-node',
      'unit',
      'tooling-tests',
      'node-build',
      'mcp-build',
      'rpack',
      'charx',
      'references',
      'mcp-tests',
      'replay',
      'contracts',
      'renderer',
    ]),
  );
  assert.deepEqual(
    createPlan({ profile: 'full' }).steps.map((step) => step.id),
    [...ci, 'electron'],
  );
});

test('MCP consumers and Electron depend on both generated outputs', () => {
  for (const step of createPlan({ profile: 'full' }).steps) {
    if (['mcp-tests', 'replay', 'contracts', 'electron'].includes(step.id))
      assert.deepEqual(step.dependencies, ['node-build', 'mcp-build']);
  }
});

test('Windows CI exercises platform-specific process termination', () => {
  assert.ok(createPlan({ profile: 'windows' }).steps.some((step) => step.id === 'tooling-tests'));
});

test('focused tests are normalized, deduplicated and forwarded to Vitest only', () => {
  const file = 'src/styles/workspace-css.test.ts';
  const plan = createPlan({ tests: [file, file.replaceAll('/', '\\')] });
  assert.deepEqual(plan.focusedTests, [file]);
  assert.deepEqual(plan.steps.find((step) => step.id === 'unit').commands, [
    ['node_modules/vitest/vitest.mjs', 'run', file],
  ]);
  assert.deepEqual(
    plan.steps.filter((step) => step.id !== 'unit'),
    createPlan().steps.filter((step) => step.id !== 'unit'),
  );
  assert.throws(() => createPlan({ profile: 'ci', tests: [file] }), /only supported by the quick/);
});

test('unknown profiles and unsafe or nonexistent test filters fail before execution', () => {
  for (const profile of ['unknown', '__proto__', 'constructor'])
    assert.throws(() => createPlan({ profile }), /Unknown validation profile/);
  for (const file of [
    '../outside.test.ts',
    'src/../outside.test.ts',
    'src\\..\\outside.test.ts',
    '/tmp/a.test.ts',
    'C:\\a.test.ts',
    'C:a.test.ts',
    '--config=evil.test.ts',
    'src/*.test.ts',
    'src/[a].test.ts',
    './src/a.test.ts',
    'src//a.test.ts',
    'src/a.ts',
    1,
  ]) {
    assert.throws(() => createPlan({ tests: [file] }), /Invalid focused test path/);
  }
  assert.throws(() => createPlan({ tests: ['src/does-not-exist.test.ts'] }), /does not exist/);
  assert.throws(() => createPlan({ tests: 'src/a.test.ts' }), /must be an array/);
});

test('mutating a returned plan never contaminates subsequent plans', () => {
  const baseline = createPlan({ profile: 'full' });
  const changed = createPlan({ profile: 'full' });
  changed.steps[0].commands[0].push('--fix');
  changed.steps.find((step) => step.id === 'electron').dependencies.push('renderer');
  changed.focusedTests.push('other.test.ts');
  assert.deepEqual(createPlan({ profile: 'full' }), baseline);
});
