#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const version = require('../package.json').version;

const rootDir = path.resolve(__dirname, '..');
const mcpOutputPath = path.join(rootDir, 'toki-mcp-server.js');
const runtimeAssets = [
  {
    sourcePath: require.resolve('@dqbd/tiktoken/tiktoken_bg.wasm'),
    outputName: 'tiktoken_bg.wasm',
  },
  {
    sourcePath: require.resolve('wasmoon/dist/glue.wasm'),
    outputName: 'glue.wasm',
  },
];

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
  entryPoints: [path.join(rootDir, 'toki-mcp-server.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: mcpOutputPath,
  target: 'node20',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __PACKAGE_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __COMMIT__: JSON.stringify(commit),
  },
  logLevel: 'info',
});

for (const asset of runtimeAssets) {
  fs.copyFileSync(asset.sourcePath, path.join(rootDir, asset.outputName));
  console.log(`Copied ${asset.outputName}`);
}
