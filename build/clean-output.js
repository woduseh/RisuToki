#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const outputName = process.argv[2];
if (outputName !== 'node' && outputName !== 'electron') {
  throw new Error('Usage: node build/clean-output.js <node|electron>');
}

const projectRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(projectRoot, '.build');
const outputPath = path.join(buildRoot, outputName);

if (path.dirname(outputPath) !== buildRoot) {
  throw new Error(`Refusing to clean unexpected output path: ${outputPath}`);
}

fs.rmSync(outputPath, { recursive: true, force: true });
