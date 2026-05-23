#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');
const version = require('../package.json').version;

function readCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const buildTime = new Date().toISOString();
const commit = readCommit();

esbuild.buildSync({
  entryPoints: ['toki-mcp-server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'toki-mcp-server.js',
  target: 'node20',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __PACKAGE_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __COMMIT__: JSON.stringify(commit),
  },
  logLevel: 'info',
});
