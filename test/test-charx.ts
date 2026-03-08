import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openCharx, openRisum, openRisup, saveCharx, saveRisum, saveRisup } from '../src/charx-io';

// Test data objects are intentionally partial — cast to any at call sites
/* eslint-disable @typescript-eslint/no-explicit-any */

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-charx-'));

(function testCharxRoundTrip() {
  const filePath = path.join(tempDir, 'roundtrip.charx');
  const data = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'Test Character',
    description: 'Character description',
    personality: 'Calm',
    scenario: 'Classroom',
    creatorcomment: 'Created for tests',
    tags: ['test', 'charx'],
    firstMessage: '안녕하세요.',
    alternateGreetings: ['안녕하세요. 두 번째 인사입니다.', '세 번째 인사입니다.'],
    groupOnlyGreetings: ['그룹 채팅 첫 인사입니다.'],
    globalNote: '[시스템] 테스트 노트',
    css: '/* test css */',
    defaultVariables: 'mood=happy',
    lua: '-- ===== main =====\nprint("hello")\n',
    triggerScripts: [
      {
        comment: 'main',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: '-- ===== main =====\nprint("hello")\n' }],
        lowLevelAccess: false,
      },
      {
        comment: 'manual',
        type: 'manual',
        conditions: [{ type: 'custom', key: 'mode', value: 'debug' }],
        effect: [{ type: 'triggerlua', code: 'print("secondary")' }],
        lowLevelAccess: true,
      },
    ],
    lorebook: [
      {
        key: 'hero',
        secondkey: '',
        comment: 'Hero entry',
        content: 'Primary lorebook content',
        insertorder: 100,
        alwaysActive: false,
        selective: false,
        mode: 'normal',
      },
    ],
    regex: [
      {
        comment: 'Bold markdown',
        type: 'editoutput',
        find: '\\*\\*(.+?)\\*\\*',
        replace: '<b>$1</b>',
        flag: 'g',
      },
    ],
    moduleId: 'module-456',
    moduleName: 'Character Module',
    moduleDescription: 'Test module description',
    assets: [{ path: 'assets/test.bin', data: Buffer.from([1, 2, 3, 4]) }],
    xMeta: { portrait: { width: 128, height: 128 } },
    risumAssets: [Buffer.from('embedded-asset')],
    cardAssets: [{ type: 'icon', uri: 'assets/test.bin', name: 'test.bin' }],
    _risuExt: {},
    _card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        extensions: { risuai: {} },
        character_book: { entries: [] },
        assets: [],
      },
    },
    _moduleData: null,
  };

  saveCharx(filePath, data as any);
  const reopened = openCharx(filePath);

  assert.equal(reopened.name, data.name);
  assert.equal(reopened.description, data.description);
  assert.equal(reopened.firstMessage, data.firstMessage);
  assert.deepStrictEqual(reopened.alternateGreetings, data.alternateGreetings);
  assert.deepStrictEqual(reopened.groupOnlyGreetings, data.groupOnlyGreetings);
  assert.equal(reopened.globalNote, data.globalNote);
  assert.equal(reopened.css, data.css);
  assert.equal(reopened.defaultVariables, data.defaultVariables);
  assert.equal(reopened.lua, data.lua);
  assert.deepStrictEqual(reopened.triggerScripts, data.triggerScripts);
  assert.deepStrictEqual(reopened.tags, data.tags);
  assert.deepStrictEqual(reopened.lorebook, data.lorebook);
  assert.deepStrictEqual(reopened.regex, data.regex);
  assert.deepStrictEqual(reopened.xMeta, data.xMeta);
  assert.deepStrictEqual(reopened.cardAssets, data.cardAssets);
  assert.deepStrictEqual(
    reopened.assets.map((asset: { path: string }) => asset.path),
    ['assets/test.bin'],
  );
  assert.deepStrictEqual(reopened.assets[0].data, Buffer.from([1, 2, 3, 4]));
  assert.deepStrictEqual(reopened.risumAssets, data.risumAssets);
})();

(function testCharxWithPrependedImageData() {
  const sourcePath = path.join(tempDir, 'prefixed-source.charx');
  const prefixedPath = path.join(tempDir, 'prefixed.charx');
  const data = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'Prefixed Character',
    description: 'Character description',
    personality: '',
    scenario: '',
    creatorcomment: '',
    tags: [],
    firstMessage: '프리픽스 테스트',
    alternateGreetings: ['프리픽스 추가 첫 메시지'],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: [
      {
        comment: 'prefixed',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("prefixed")' }],
        lowLevelAccess: false,
      },
    ],
    lorebook: [],
    regex: [],
    moduleId: 'module-prefixed',
    moduleName: 'Prefixed Module',
    moduleDescription: 'Prefixed module description',
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    _risuExt: {},
    _card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        extensions: { risuai: {} },
        character_book: { entries: [] },
        assets: [],
      },
    },
    _moduleData: null,
  };

  saveCharx(sourcePath, data as any);
  const original = fs.readFileSync(sourcePath);
  const fakeJpegPrelude = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
    0x01,
  ]);
  fs.writeFileSync(prefixedPath, Buffer.concat([fakeJpegPrelude, original]));

  const reopened = openCharx(prefixedPath);
  assert.equal(reopened.name, data.name);
  assert.equal(reopened.firstMessage, data.firstMessage);
  assert.deepStrictEqual(reopened.alternateGreetings, data.alternateGreetings);
  assert.deepStrictEqual(reopened.triggerScripts, data.triggerScripts);
  assert.equal(reopened.lua, 'print("prefixed")');
})();

(function testLuaUpdatesPreserveTriggerScriptArray() {
  const filePath = path.join(tempDir, 'lua-merge.charx');
  const data = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'Lua Merge Character',
    description: '',
    personality: '',
    scenario: '',
    creatorcomment: '',
    tags: [],
    firstMessage: '',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: 'print("updated-main")',
    triggerScripts: [
      {
        comment: 'main',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("original-main")' }],
        lowLevelAccess: false,
      },
      {
        comment: 'manual',
        type: 'manual',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("manual")' }],
        lowLevelAccess: false,
      },
    ],
    lorebook: [],
    regex: [],
    moduleId: 'module-lua-merge',
    moduleName: 'Lua Merge Module',
    moduleDescription: '',
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    _risuExt: {},
    _card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        extensions: { risuai: {} },
        character_book: { entries: [] },
        assets: [],
      },
    },
    _moduleData: null,
  };

  saveCharx(filePath, data as any);
  const reopened = openCharx(filePath);

  assert.equal(reopened.lua, 'print("updated-main")');
  assert.equal(reopened.triggerScripts[0].effect![0].code, 'print("updated-main")');
  assert.equal(reopened.triggerScripts[1].effect![0].code, 'print("manual")');
})();

(function testRisumRoundTrip() {
  const filePath = path.join(tempDir, 'roundtrip.risum');
  const data = {
    name: 'Standalone Module',
    description: 'Risum description',
    moduleId: 'module-789',
    moduleName: 'Standalone Module',
    moduleDescription: 'Standalone description',
    lua: '-- ===== main =====\nprint("risum")\n',
    lorebook: [
      {
        key: 'npc',
        secondkey: '',
        comment: 'NPC entry',
        content: 'Standalone lore',
        insertorder: 80,
        alwaysActive: true,
        selective: false,
        mode: 'normal',
      },
    ],
    regex: [
      {
        comment: 'Trim spaces',
        type: 'editinput',
        find: '^\\s+|\\s+$',
        replace: '',
        flag: 'gm',
      },
    ],
    risumAssets: [Buffer.from('standalone')],
    _moduleData: null,
  };

  saveRisum(filePath, data as any);
  const reopened = openRisum(filePath);

  assert.equal(reopened.name, data.moduleName);
  assert.equal(reopened.moduleDescription, data.moduleDescription);
  assert.equal(reopened.lua, data.lua);
  assert.deepStrictEqual(reopened.lorebook, data.lorebook);
  assert.deepStrictEqual(reopened.regex, data.regex);
  assert.deepStrictEqual(reopened.risumAssets, data.risumAssets);
})();

(function testRisumModuleFieldsRoundTrip() {
  const filePath = path.join(tempDir, 'risum-fields.risum');
  const data = {
    name: 'Module With Fields',
    description: 'Module with all risum-specific fields',
    moduleId: 'module-fields-001',
    moduleName: 'Module With Fields',
    moduleDescription: 'Testing risum-specific fields',
    lua: 'print("fields")',
    triggerScripts: [
      {
        comment: 'main',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("fields")' }],
        lowLevelAccess: false,
      },
    ],
    lorebook: [],
    regex: [],
    cjs: 'console.log("custom js")',
    lowLevelAccess: true,
    hideIcon: true,
    backgroundEmbedding: 'You are an assistant module.',
    moduleNamespace: 'my-namespace',
    customModuleToggle: 'toggle-config-string',
    mcpUrl: 'http://localhost:3000/mcp',
    risumAssets: [],
    _moduleData: null,
  };

  saveRisum(filePath, data as any);
  const reopened = openRisum(filePath);

  assert.equal(reopened._fileType, 'risum');
  assert.equal(reopened.name, data.moduleName);
  assert.equal(reopened.cjs, data.cjs);
  assert.equal(reopened.lowLevelAccess, data.lowLevelAccess);
  assert.equal(reopened.hideIcon, data.hideIcon);
  assert.equal(reopened.backgroundEmbedding, data.backgroundEmbedding);
  assert.equal(reopened.moduleNamespace, data.moduleNamespace);
  assert.equal(reopened.customModuleToggle, data.customModuleToggle);
  assert.equal(reopened.mcpUrl, data.mcpUrl);
})();

(function testCharxPreservesRisumModuleFields() {
  const filePath = path.join(tempDir, 'charx-risum-fields.charx');
  const data = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'Character With Module Fields',
    description: 'Test character',
    personality: '',
    scenario: '',
    creatorcomment: '',
    tags: [],
    firstMessage: 'Hello',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: 'print("charx-risum")',
    triggerScripts: [
      {
        comment: 'main',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: 'print("charx-risum")' }],
        lowLevelAccess: false,
      },
    ],
    lorebook: [],
    regex: [],
    moduleId: 'module-charx-risum',
    moduleName: 'Embedded Module',
    moduleDescription: 'Module with risum fields in charx',
    cjs: 'console.log("embedded")',
    lowLevelAccess: true,
    hideIcon: false,
    backgroundEmbedding: 'Background text',
    moduleNamespace: 'embedded-ns',
    customModuleToggle: '',
    mcpUrl: '',
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    _risuExt: {},
    _card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: { extensions: { risuai: {} }, character_book: { entries: [] }, assets: [] },
    },
    _moduleData: null,
  };

  saveCharx(filePath, data as any);
  const reopened = openCharx(filePath);

  assert.equal(reopened.cjs, data.cjs);
  assert.equal(reopened.lowLevelAccess, data.lowLevelAccess);
  assert.equal(reopened.hideIcon, data.hideIcon);
  assert.equal(reopened.backgroundEmbedding, data.backgroundEmbedding);
  assert.equal(reopened.moduleNamespace, data.moduleNamespace);
  // Empty strings become undefined (cleaned on save)
  assert.equal(reopened.customModuleToggle || '', '');
  assert.equal(reopened.mcpUrl || '', '');
})();

fs.rmSync(tempDir, { recursive: true, force: true });

// ---- .risup round-trip test ----
const risupTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-risup-'));

(function testRisupRoundTrip() {
  const filePath = path.join(risupTempDir, 'roundtrip.risup');
  const data = {
    _fileType: 'risup' as const,
    name: 'Test Preset',
    description: '',
    firstMessage: '',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: 'System note for preset',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [
      {
        comment: 'Bold',
        type: 'editdisplay',
        find: '\\*\\*(.+?)\\*\\*',
        replace: '<b>$1</b>',
        flag: 'g',
      },
    ],
    moduleId: '',
    moduleName: '',
    moduleDescription: '',
    mainPrompt: 'You are a helpful assistant.',
    jailbreak: 'Stay in character.',
    temperature: 85,
    maxContext: 8000,
    maxResponse: 600,
    frequencyPenalty: 50,
    presencePenalty: 60,
    aiModel: 'gpt4',
    subModel: 'gpt-4-turbo',
    apiType: 'openai',
    promptPreprocess: true,
    promptTemplate: JSON.stringify([{ type: 'plain', role: 'system', text: 'Hello' }]),
    presetBias: JSON.stringify([['hello', 5]]),
    formatingOrder: JSON.stringify(['main', 'jailbreak']),
    presetImage: '',
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    _risuExt: {},
    _card: {},
    _moduleData: null,
    _presetData: null,
  };

  saveRisup(filePath, data as any);
  assert.ok(fs.existsSync(filePath), '.risup file should exist');

  const reopened = openRisup(filePath);

  assert.equal(reopened._fileType, 'risup');
  assert.equal(reopened.name, data.name);
  assert.equal(reopened.mainPrompt, data.mainPrompt);
  assert.equal(reopened.jailbreak, data.jailbreak);
  assert.equal(reopened.globalNote, data.globalNote);
  assert.equal(reopened.temperature, data.temperature);
  assert.equal(reopened.maxContext, data.maxContext);
  assert.equal(reopened.maxResponse, data.maxResponse);
  assert.equal(reopened.frequencyPenalty, data.frequencyPenalty);
  assert.equal(reopened.presencePenalty, data.presencePenalty);
  assert.equal(reopened.aiModel, data.aiModel);
  assert.equal(reopened.subModel, data.subModel);
  assert.equal(reopened.apiType, data.apiType);
  assert.equal(reopened.promptPreprocess, data.promptPreprocess);
  assert.equal(reopened.promptTemplate, data.promptTemplate);
  assert.equal(reopened.presetBias, data.presetBias);
  assert.equal(reopened.formatingOrder, data.formatingOrder);
  assert.deepStrictEqual(reopened.regex, data.regex);
  assert.ok(reopened._presetData != null, '_presetData should be preserved');
})();

(function testRisupPreservesExtraPresetFields() {
  const filePath = path.join(risupTempDir, 'preserve-extra.risup');
  const data: any = {
    _fileType: 'risup',
    name: 'Extra Fields Preset',
    description: '',
    firstMessage: '',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    moduleId: '',
    moduleName: '',
    moduleDescription: '',
    mainPrompt: 'Test prompt',
    jailbreak: '',
    temperature: 70,
    maxContext: 4000,
    maxResponse: 300,
    frequencyPenalty: 70,
    presencePenalty: 70,
    aiModel: '',
    subModel: '',
    apiType: '',
    promptPreprocess: false,
    promptTemplate: '[]',
    presetBias: '[]',
    formatingOrder: '[]',
    presetImage: '',
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    _risuExt: {},
    _card: {},
    _moduleData: null,
    _presetData: {
      name: 'Extra Fields Preset',
      mainPrompt: 'Test prompt',
      temperature: 70,
      customFieldFromRisu: 'should be preserved',
      someNestedConfig: { nested: true, value: 42 },
    },
  };

  saveRisup(filePath, data as any);
  const reopened = openRisup(filePath);

  assert.equal(reopened._presetData!.customFieldFromRisu, 'should be preserved');
  assert.deepStrictEqual(reopened._presetData!.someNestedConfig, { nested: true, value: 42 });
  assert.equal(reopened.mainPrompt, 'Test prompt');
})();

fs.rmSync(risupTempDir, { recursive: true, force: true });

// ---- Error case tests ----
const errorTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-error-'));

(function testOpenCharxNonexistentFile() {
  assert.throws(
    () => openCharx(path.join(errorTempDir, 'nonexistent.charx')),
    (err: Error) => err.message.includes('ENOENT') || err.message.includes('no such file'),
    'Opening nonexistent charx should throw ENOENT',
  );
})();

(function testOpenRisumNonexistentFile() {
  assert.throws(
    () => openRisum(path.join(errorTempDir, 'nonexistent.risum')),
    (err: Error) => err.message.includes('ENOENT') || err.message.includes('no such file'),
    'Opening nonexistent risum should throw ENOENT',
  );
})();

(function testOpenRisupNonexistentFile() {
  assert.throws(
    () => openRisup(path.join(errorTempDir, 'nonexistent.risup')),
    (err: Error) => err.message.includes('ENOENT') || err.message.includes('no such file'),
    'Opening nonexistent risup should throw ENOENT',
  );
})();

(function testOpenCharxEmptyFile() {
  const filePath = path.join(errorTempDir, 'empty.charx');
  fs.writeFileSync(filePath, Buffer.alloc(0));
  assert.throws(
    () => openCharx(filePath),
    (err: Error) => err instanceof Error,
    'Opening empty charx file should throw',
  );
})();

(function testOpenCharxCorruptedZip() {
  const filePath = path.join(errorTempDir, 'corrupted.charx');
  fs.writeFileSync(filePath, Buffer.from('this is not a zip file'));
  assert.throws(
    () => openCharx(filePath),
    (err: Error) => err instanceof Error,
    'Opening corrupted charx file should throw',
  );
})();

(function testOpenRisumInvalidMsgpack() {
  const filePath = path.join(errorTempDir, 'invalid.risum');
  fs.writeFileSync(filePath, Buffer.from([0xff, 0xfe, 0xfd, 0x00, 0x01]));
  assert.throws(
    () => openRisum(filePath),
    (err: Error) => err instanceof Error,
    'Opening risum with invalid msgpack should throw',
  );
})();

(function testOpenRisupCorruptedData() {
  const filePath = path.join(errorTempDir, 'corrupted.risup');
  fs.writeFileSync(filePath, Buffer.from('not-encrypted-data'));
  assert.throws(
    () => openRisup(filePath),
    (err: Error) => err instanceof Error,
    'Opening corrupted risup file should throw',
  );
})();

(function testOpenRisupTooSmall() {
  const filePath = path.join(errorTempDir, 'tiny.risup');
  // AES-CBC requires at least 16 bytes (one block); write fewer
  fs.writeFileSync(filePath, Buffer.from([0x01, 0x02, 0x03]));
  assert.throws(
    () => openRisup(filePath),
    (err: Error) => err instanceof Error,
    'Opening risup file smaller than AES block size should throw',
  );
})();

(function testOpenCharxTruncatedZip() {
  const validPath = path.join(errorTempDir, 'valid-for-truncate.charx');
  const truncatedPath = path.join(errorTempDir, 'truncated.charx');
  const data = {
    spec: 'chara_card_v3', specVersion: '3.0', name: 'Truncate Test',
    description: '', personality: '', scenario: '', creatorcomment: '',
    tags: [], firstMessage: '', alternateGreetings: [], groupOnlyGreetings: [],
    globalNote: '', css: '', defaultVariables: '', lua: '',
    triggerScripts: [], lorebook: [], regex: [],
    moduleId: '', moduleName: '', moduleDescription: '',
    assets: [], xMeta: {}, risumAssets: [], cardAssets: [],
    _risuExt: {},
    _card: { spec: 'chara_card_v3', spec_version: '3.0', data: { extensions: { risuai: {} }, character_book: { entries: [] }, assets: [] } },
    _moduleData: null,
  };
  saveCharx(validPath, data as any);
  const fullBuffer = fs.readFileSync(validPath);
  // Truncate to half the file
  fs.writeFileSync(truncatedPath, fullBuffer.subarray(0, Math.floor(fullBuffer.length / 2)));
  assert.throws(
    () => openCharx(truncatedPath),
    (err: Error) => err instanceof Error,
    'Opening truncated charx file should throw',
  );
})();

fs.rmSync(errorTempDir, { recursive: true, force: true });

console.log('test-charx passed (including risup and error cases)');
