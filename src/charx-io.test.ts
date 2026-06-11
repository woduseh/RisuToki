// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  extractPrimaryLuaFromTriggerScripts,
  mergePrimaryLuaIntoTriggerScripts,
  saveRisup,
  type CharxData,
} from './charx-io';

describe('primary Lua trigger synchronization', () => {
  it('updates the Lua effect without overwriting an earlier JavaScript effect', () => {
    const scripts = [
      {
        type: 'start',
        effect: [
          { type: 'triggercode', code: 'console.log("js")' },
          { type: 'triggerlua', code: 'print("old")' },
        ],
      },
    ];

    const merged = mergePrimaryLuaIntoTriggerScripts(scripts, 'print("new")');
    const effects = merged[0].effect!;

    expect(effects[0].code).toBe('console.log("js")');
    expect(effects[1].code).toBe('print("new")');
    expect(extractPrimaryLuaFromTriggerScripts(merged)).toBe('print("new")');
  });

  it('updates legacy typeless Lua effects and preserves their compatibility shape', () => {
    const merged = mergePrimaryLuaIntoTriggerScripts([{ type: 'start', effect: [{ code: 'old' }] }], 'new');

    expect(merged[0].effect?.[0]).toEqual({ type: 'triggerlua', code: 'new' });
  });

  it('creates a canonical Lua trigger only when non-empty Lua has no matching effect', () => {
    const merged = mergePrimaryLuaIntoTriggerScripts(
      [{ type: 'start', effect: [{ type: 'triggercode', code: 'js' }] }],
      'print("lua")',
    );

    expect(merged).toHaveLength(2);
    expect(merged[0].effect?.[0]).toEqual({ type: 'triggerlua', code: 'print("lua")' });
    expect(merged[1].effect?.[0]).toEqual({ type: 'triggercode', code: 'js' });
  });

  it('clears an existing Lua effect without creating one when none exists', () => {
    const cleared = mergePrimaryLuaIntoTriggerScripts(
      [{ type: 'start', effect: [{ type: 'triggerlua', code: 'print("old")' }] }],
      '',
    );
    expect(cleared[0].effect?.[0].code).toBe('');

    const unchanged = mergePrimaryLuaIntoTriggerScripts(
      [{ type: 'start', effect: [{ type: 'triggercode', code: 'js' }] }],
      '',
    );
    expect(unchanged).toHaveLength(1);
    expect(unchanged[0].effect?.[0]).toEqual({ type: 'triggercode', code: 'js' });
  });
});

describe('risup JSON field persistence', () => {
  it('rejects malformed generic JSON fields with field context before writing', () => {
    const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-risup-json-')), 'bad.risup');
    const data = {
      _fileType: 'risup',
      name: 'Invalid preset',
      promptSettings: '{broken',
      _presetData: {},
    } as unknown as CharxData;

    expect(() => saveRisup(outputPath, data)).toThrow(/Invalid promptSettings/i);
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
