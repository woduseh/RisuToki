'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const tsc = 'node_modules/typescript/bin/tsc';
const buildDependencies = ['node-build', 'mcp-build'];
const definitions = {
  lint: {
    commands: [
      [
        'node_modules/eslint/bin/eslint.js',
        'src/**/*.{ts,vue}',
        'test/**/*.ts',
        'build/**/*.js',
        'main.ts',
        'preload.ts',
        'vite.config.ts',
        'vitest.setup.ts',
        'toki-mcp-server.ts',
        '--max-warnings=0',
      ],
    ],
  },
  'typecheck-vue': { commands: [['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit']] },
  'typecheck-electron': { commands: [[tsc, '-p', 'tsconfig.electron.json', '--noEmit']] },
  'typecheck-node': { commands: [[tsc, '-p', 'tsconfig.node-libs.json', '--noEmit']] },
  unit: { commands: [['node_modules/vitest/vitest.mjs', 'run']] },
  'tooling-tests': { commands: [['--test', 'build/validation-plan.test.js', 'build/validate.test.js']] },
  'node-build': {
    commands: [
      ['build/clean-output.js', 'node'],
      [tsc, '-p', 'tsconfig.node-libs.json'],
    ],
  },
  'mcp-build': { commands: [['build/build-mcp.js']] },
  rpack: { dependencies: ['node-build'], commands: [['.build/node/test/test-rpack.js']] },
  charx: { dependencies: ['node-build'], commands: [['.build/node/test/test-charx.js']] },
  references: {
    dependencies: ['node-build'],
    commands: [
      ['.build/node/test/test-reference-store.js'],
      ['.build/node/test/test-terminal-shell.js'],
      ['.build/node/test/test-main-state-store.js'],
    ],
  },
  'mcp-tests': { dependencies: buildDependencies, commands: [['.build/node/test/test-mcp-search-all.js']] },
  replay: { dependencies: buildDependencies, commands: [['.build/node/test/run-workflow-eval-replay.js']] },
  contracts: { dependencies: buildDependencies, commands: [['.build/node/test/mcp-contract-baseline.js']] },
  renderer: { commands: [['node_modules/vite/bin/vite.js', 'build']] },
  electron: {
    dependencies: buildDependencies,
    commands: [
      ['build/clean-output.js', 'electron'],
      [tsc, '-p', 'tsconfig.electron.json'],
      ['build/build-preload.js'],
    ],
  },
};

const quick = ['lint', 'typecheck-vue', 'typecheck-electron', 'typecheck-node', 'unit', 'tooling-tests'];
const test = ['node-build', 'mcp-build', 'rpack', 'charx', 'references', 'unit', 'tooling-tests', 'mcp-tests'];
const mcp = ['node-build', 'mcp-build', 'mcp-tests', 'replay', 'contracts'];
const ci = [...quick, ...test, ...mcp, 'renderer'];
const profiles = {
  quick,
  test,
  mcp,
  ci,
  full: [...ci, 'electron'],
  windows: ['tooling-tests', 'electron', 'renderer'],
};

function validateTests(tests) {
  if (!Array.isArray(tests)) throw new Error('Focused tests must be an array of repository-relative *.test.ts paths');
  return tests.map((file) => {
    if (
      typeof file !== 'string' ||
      !file.endsWith('.test.ts') ||
      file.startsWith('-') ||
      path.win32.isAbsolute(file) ||
      path.posix.isAbsolute(file) ||
      /[:*?[\]]/.test(file) ||
      file.includes('\0') ||
      file.split(/[\\/]/).some((part) => part === '..' || part === '.' || part === '')
    ) {
      throw new Error(`Invalid focused test path: ${String(file)}; use repository-relative *.test.ts paths`);
    }
    const normalized = file.replaceAll('\\', '/');
    const absolute = path.resolve(projectRoot, normalized);
    let real;
    try {
      real = fs.realpathSync(absolute);
      if (!fs.statSync(real).isFile()) throw new Error('Not a file');
    } catch {
      throw new Error(`Focused test file does not exist: ${file}`);
    }
    const relative = path.relative(fs.realpathSync(projectRoot), real);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Focused test path escapes repository: ${file}`);
    }
    return normalized;
  });
}

function createPlan({ profile = 'quick', tests = [] } = {}) {
  if (!Object.hasOwn(profiles, profile))
    throw new Error(`Unknown validation profile: ${profile}. Choose ${Object.keys(profiles).join(', ')}`);
  const focusedTests = [...new Set(validateTests(tests))];
  if (focusedTests.length && profile !== 'quick')
    throw new Error('Focused tests are only supported by the quick profile');
  const steps = [];
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    const definition = definitions[id];
    for (const dependency of definition.dependencies || []) visit(dependency);
    visited.add(id);
    const commands = definition.commands.map((command) => [...command]);
    if (id === 'unit') commands[0].push(...focusedTests);
    steps.push({ id, dependencies: [...(definition.dependencies || [])], commands });
  }
  profiles[profile].forEach(visit);
  return { profile, steps, focusedTests };
}

module.exports = { createPlan };
