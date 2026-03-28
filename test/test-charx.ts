import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pack } from 'msgpackr';
import { openCharx, openRisum, openRisup, saveCharx, saveRisum, saveRisup } from '../src/charx-io';
import { buildRisum, rpackDecode, rpackEncode } from '../src/rpack';

// Test data objects are intentionally partial — cast to any at call sites
/* eslint-disable @typescript-eslint/no-explicit-any */

const RISUP_TEST_KEY = crypto.createHash('sha256').update('risupreset', 'utf8').digest();
const RISUP_TEST_IV = Buffer.alloc(12);

function writeCharxCard(filePath: string, card: Record<string, unknown>): void {
  const zip = new AdmZip();
  zip.addFile('card.json', Buffer.from(JSON.stringify(card), 'utf8'));
  zip.writeZip(filePath);
}

function encryptRisupPayload(value: unknown): Buffer {
  const plaintext = pack(value);
  const cipher = crypto.createCipheriv('aes-256-gcm', RISUP_TEST_KEY, RISUP_TEST_IV);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([encrypted, cipher.getAuthTag()]);
}

function writeRisupEnvelope(filePath: string, envelope: Record<string, unknown>): void {
  const packed = pack(envelope);
  const compressed = zlib.deflateRawSync(packed);
  fs.writeFileSync(filePath, rpackEncode(compressed));
}

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
    characterVersion: '1.2.3',
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
  assert.equal(reopened.creatorcomment, data.creatorcomment);
  assert.equal(reopened.characterVersion, data.characterVersion);
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
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
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

(function testOpenCharxRejectsUnsupportedSpec() {
  const filePath = path.join(errorTempDir, 'unsupported-spec.charx');
  writeCharxCard(filePath, {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {},
  });

  assert.throws(() => openCharx(filePath), /unsupported charx spec/i);
})();

(function testOpenCharxRejectsMissingCardData() {
  const filePath = path.join(errorTempDir, 'missing-card-data.charx');
  writeCharxCard(filePath, {
    spec: 'chara_card_v3',
    spec_version: '3.0',
  });

  assert.throws(() => openCharx(filePath), /missing required card\.data object/i);
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

(function testOpenRisumRejectsNonObjectMainPayload() {
  const filePath = path.join(errorTempDir, 'array-module.risum');
  fs.writeFileSync(filePath, buildRisum(['not', 'an', 'object'] as any));
  assert.throws(() => openRisum(filePath), /main payload must decode to an object/i);
})();

(function testOpenRisupRejectsEnvelopeWithoutPresetMarker() {
  const filePath = path.join(errorTempDir, 'wrong-envelope-type.risup');
  writeRisupEnvelope(filePath, {
    type: 'other',
    preset: encryptRisupPayload({ name: 'Wrong type preset' }),
  });

  assert.throws(() => openRisup(filePath), /missing type=preset marker/i);
})();

(function testOpenRisupRejectsNonObjectPresetPayload() {
  const filePath = path.join(errorTempDir, 'array-preset.risup');
  writeRisupEnvelope(filePath, {
    type: 'preset',
    presetVersion: 2,
    preset: encryptRisupPayload(['not', 'an', 'object']),
  });

  assert.throws(() => openRisup(filePath), /preset payload must be an object/i);
})();

(function testOpenRisupCorruptedData() {
  const filePath = path.join(errorTempDir, 'corrupted.risup');
  fs.writeFileSync(filePath, Buffer.from('not-encrypted-data'));
  assert.throws(
    () => openRisup(filePath),
    /Failed to decompress \.risup file/i,
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
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'Truncate Test',
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
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    moduleId: '',
    moduleName: '',
    moduleDescription: '',
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

// ===== cardAssets reconciliation on save =====
(function testSaveCharxReconcileCardAssets() {
  const filePath = path.join(tempDir, 'reconcile-assets.charx');
  const data = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'Reconcile Test',
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
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    moduleId: '',
    moduleName: '',
    moduleDescription: '',
    assets: [
      { path: 'assets/icon/image/main.webp', data: Buffer.from([0x89]) },
      { path: 'assets/other/image/bg.png', data: Buffer.from([0x90]) },
      { path: 'assets/other/image/portrait.webp', data: Buffer.from([0x91]) },
    ],
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

  assert.equal(reopened.cardAssets.length, 3, 'cardAssets should have 3 entries after reconciliation');

  type CardAsset = { type: string; uri: string; name: string; ext: string };
  const ca = reopened.cardAssets as CardAsset[];
  const uris = ca.map((a) => a.uri);
  assert.ok(uris.includes('embeded://assets/icon/image/main.webp'), 'icon asset reconciled');
  assert.ok(uris.includes('embeded://assets/other/image/bg.png'), 'other asset reconciled');
  assert.ok(uris.includes('embeded://assets/other/image/portrait.webp'), 'other asset reconciled');

  const iconEntry = ca.find((a) => a.uri.includes('icon'))!;
  assert.equal(iconEntry.type, 'icon', 'icon folder → type: icon');
  const otherEntry = ca.find((a) => a.uri.includes('bg.png'))!;
  assert.equal(otherEntry.type, 'x-risu-asset', 'other folder → type: x-risu-asset');
  assert.equal(iconEntry.name, 'main', 'icon name extracted');
  assert.equal(iconEntry.ext, 'webp', 'icon ext extracted');
  assert.equal(otherEntry.name, 'bg', 'other name extracted');
  assert.equal(otherEntry.ext, 'png', 'other ext extracted');
})();

(function testSaveCharxNoDuplicateCardAssets() {
  const filePath = path.join(tempDir, 'no-dup-assets.charx');
  const data = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'NoDup Test',
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
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    moduleId: '',
    moduleName: '',
    moduleDescription: '',
    assets: [
      { path: 'assets/icon/image/main.webp', data: Buffer.from([0x89]) },
      { path: 'assets/other/image/bg.png', data: Buffer.from([0x90]) },
    ],
    xMeta: {},
    risumAssets: [],
    cardAssets: [{ type: 'icon', uri: 'embeded://assets/icon/image/main.webp', name: 'main', ext: 'webp' }],
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

  assert.equal(reopened.cardAssets.length, 2, 'no duplicate cardAssets');
  const iconEntries = (reopened.cardAssets as { uri: string }[]).filter((a) => a.uri.includes('icon'));
  assert.equal(iconEntries.length, 1, 'icon not duplicated');
})();

(function testSaveCharxRemovesStaleEmbeddedCardAssets() {
  const filePath = path.join(tempDir, 'stale-assets-removed.charx');
  const data = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'Stale Asset Test',
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
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    moduleId: '',
    moduleName: '',
    moduleDescription: '',
    assets: [{ path: 'assets/icon/image/main.webp', data: Buffer.from([0x89]) }],
    xMeta: {},
    risumAssets: [],
    cardAssets: [
      { type: 'icon', uri: 'embeded://assets/icon/image/main.webp', name: 'main', ext: 'webp' },
      { type: 'x-risu-asset', uri: 'embeded://assets/other/image/removed.png', name: 'removed', ext: 'png' },
    ],
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

  const uris = (reopened.cardAssets as { uri: string }[]).map((a) => a.uri);
  assert.deepStrictEqual(uris, ['embeded://assets/icon/image/main.webp']);
})();

// ---- .risup compression compatibility tests ----
const risupCompatTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-risup-compat-'));

function writeRisupEnvelopeCompressed(
  filePath: string,
  envelope: Record<string, unknown>,
  compress: (buf: Buffer) => Buffer,
): void {
  const packed = pack(envelope);
  const compressed = compress(packed);
  fs.writeFileSync(filePath, rpackEncode(compressed));
}

(function testRisupOpenGzipCompressed() {
  const filePath = path.join(risupCompatTempDir, 'gzip.risup');
  writeRisupEnvelopeCompressed(
    filePath,
    {
      type: 'preset',
      presetVersion: 2,
      preset: encryptRisupPayload({ name: 'Gzip Preset', mainPrompt: 'gzip test' }),
    },
    (buf) => zlib.gzipSync(buf),
  );

  const data = openRisup(filePath);
  assert.equal(data._fileType, 'risup');
  assert.equal(data.name, 'Gzip Preset');
  assert.equal(data.mainPrompt, 'gzip test');
  assert.equal(data._compressionMode, 'gzip', 'gzip-compressed file should be detected as gzip');
})();

(function testRisupOpenZlibCompressed() {
  const filePath = path.join(risupCompatTempDir, 'zlib.risup');
  writeRisupEnvelopeCompressed(
    filePath,
    {
      type: 'preset',
      presetVersion: 2,
      preset: encryptRisupPayload({ name: 'Zlib Preset', mainPrompt: 'zlib test' }),
    },
    (buf) => zlib.deflateSync(buf),
  );

  const data = openRisup(filePath);
  assert.equal(data._fileType, 'risup');
  assert.equal(data.name, 'Zlib Preset');
  assert.equal(data.mainPrompt, 'zlib test');
  assert.equal(data._compressionMode, 'zlib', 'zlib-compressed file should be detected as zlib');
})();

(function testRisupOpenRawDeflateCompressed() {
  const filePath = path.join(risupCompatTempDir, 'raw.risup');
  writeRisupEnvelopeCompressed(
    filePath,
    {
      type: 'preset',
      presetVersion: 2,
      preset: encryptRisupPayload({ name: 'Raw Preset', mainPrompt: 'raw test' }),
    },
    (buf) => zlib.deflateRawSync(buf),
  );

  const data = openRisup(filePath);
  assert.equal(data._fileType, 'risup');
  assert.equal(data.name, 'Raw Preset');
  assert.equal(data.mainPrompt, 'raw test');
  assert.equal(data._compressionMode, 'raw', 'raw-deflate file should be detected as raw');
})();

(function testRisupSavePreservesGzipMode() {
  const srcPath = path.join(risupCompatTempDir, 'gzip-preserve-src.risup');
  const dstPath = path.join(risupCompatTempDir, 'gzip-preserve-dst.risup');
  writeRisupEnvelopeCompressed(
    srcPath,
    {
      type: 'preset',
      presetVersion: 2,
      preset: encryptRisupPayload({ name: 'Preserve Gzip', mainPrompt: 'preserve gzip' }),
    },
    (buf) => zlib.gzipSync(buf),
  );

  const opened = openRisup(srcPath);
  assert.equal(opened._compressionMode, 'gzip');

  saveRisup(dstPath, opened);

  const savedDecoded = rpackDecode(fs.readFileSync(dstPath));
  assert.equal(savedDecoded[0], 0x1f, 'saved file should start with gzip magic byte 0x1f');
  assert.equal(savedDecoded[1], 0x8b, 'saved file should have gzip magic byte 0x8b');

  const reopened = openRisup(dstPath);
  assert.equal(reopened.name, 'Preserve Gzip');
  assert.equal(reopened._compressionMode, 'gzip');
})();

(function testRisupSavePreservesZlibMode() {
  const srcPath = path.join(risupCompatTempDir, 'zlib-preserve-src.risup');
  const dstPath = path.join(risupCompatTempDir, 'zlib-preserve-dst.risup');
  writeRisupEnvelopeCompressed(
    srcPath,
    {
      type: 'preset',
      presetVersion: 2,
      preset: encryptRisupPayload({ name: 'Preserve Zlib', mainPrompt: 'preserve zlib' }),
    },
    (buf) => zlib.deflateSync(buf),
  );

  const opened = openRisup(srcPath);
  assert.equal(opened._compressionMode, 'zlib');

  saveRisup(dstPath, opened);

  const savedDecoded = rpackDecode(fs.readFileSync(dstPath));
  assert.equal(savedDecoded[0], 0x78, 'saved file should start with zlib magic byte 0x78');

  const reopened = openRisup(dstPath);
  assert.equal(reopened.name, 'Preserve Zlib');
  assert.equal(reopened._compressionMode, 'zlib');
})();

(function testRisupSavePreservesRawMode() {
  const srcPath = path.join(risupCompatTempDir, 'raw-preserve-src.risup');
  const dstPath = path.join(risupCompatTempDir, 'raw-preserve-dst.risup');
  writeRisupEnvelopeCompressed(
    srcPath,
    {
      type: 'preset',
      presetVersion: 2,
      preset: encryptRisupPayload({ name: 'Preserve Raw', mainPrompt: 'preserve raw' }),
    },
    (buf) => zlib.deflateRawSync(buf),
  );

  const opened = openRisup(srcPath);
  assert.equal(opened._compressionMode, 'raw');

  saveRisup(dstPath, opened);

  const savedDecoded = rpackDecode(fs.readFileSync(dstPath));
  // Raw DEFLATE has no magic header; verify it is NOT gzip (0x1f 0x8b) and NOT zlib (0x78 with valid CMF/FLG)
  assert.notEqual(
    savedDecoded[0] === 0x1f && savedDecoded[1] === 0x8b,
    true,
    'saved raw file must not have gzip magic bytes',
  );
  assert.notEqual(
    savedDecoded[0] === 0x78 && (savedDecoded[0] * 256 + savedDecoded[1]) % 31 === 0,
    true,
    'saved raw file must not have zlib magic bytes',
  );

  const reopened = openRisup(dstPath);
  assert.equal(reopened.name, 'Preserve Raw');
  assert.equal(reopened._compressionMode, 'raw', 'round-tripped raw file should still be detected as raw');
})();

(function testRisupNewPresetDefaultsToGzip() {
  const filePath = path.join(risupCompatTempDir, 'new-default.risup');
  const data: any = {
    _fileType: 'risup',
    name: 'New Default Preset',
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
    mainPrompt: 'default mode test',
    jailbreak: '',
    temperature: 80,
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
    _presetData: null,
    // No _compressionMode set — should default to gzip
  };

  saveRisup(filePath, data);

  const decoded = rpackDecode(fs.readFileSync(filePath));
  assert.equal(decoded[0], 0x1f, 'new preset should default to gzip (0x1f magic byte)');
  assert.equal(decoded[1], 0x8b, 'new preset should default to gzip (0x8b magic byte)');

  const reopened = openRisup(filePath);
  assert.equal(reopened.name, 'New Default Preset');
  assert.equal(reopened.mainPrompt, 'default mode test');
  assert.equal(reopened._compressionMode, 'gzip');
})();

fs.rmSync(risupCompatTempDir, { recursive: true, force: true });

console.log('test-charx passed (including risup, error cases, and cardAssets reconciliation)');
