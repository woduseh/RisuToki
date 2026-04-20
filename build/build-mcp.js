#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');
const version = require('../package.json').version;

execFileSync(
  process.execPath,
  [
    require.resolve('esbuild/bin/esbuild'),
    'toki-mcp-server.ts',
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--outfile=toki-mcp-server.js',
    '--target=node20',
    `--define:__APP_VERSION__=${JSON.stringify(version)}`,
  ],
  { stdio: 'inherit' },
);
