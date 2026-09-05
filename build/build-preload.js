#!/usr/bin/env node
'use strict';

require('esbuild').buildSync({
  absWorkingDir: require('node:path').resolve(__dirname, '..'),
  entryPoints: ['preload.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: '.build/electron/preload.js',
  external: ['electron'],
  target: 'node20',
  logLevel: 'info',
});
