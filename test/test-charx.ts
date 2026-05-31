import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pack } from 'msgpackr';
import { openCharx, openRisum, openRisup, saveCharx, saveRisum, saveRisup } from '../src/charx-io';
import { validateCharxExportCompatibilityFile } from '../src/lib/charx-export-compatibility';
import { risuArrayToCCV3 } from '../src/lorebook-convert';
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

function readCharxCard(filePath: string): Record<string, any> {
  const zip = new AdmZip(filePath);
  const cardEntry = zip.getEntry('card.json');
  assert.ok(cardEntry, 'card.json should exist');
  return JSON.parse(cardEntry.getData().toString('utf8')) as Record<string, any>;
}

function writeCharxCompatibilityFixture(
  filePath: string,
  options: {
    cardLorebook?: unknown[];
    moduleLorebook?: unknown[];
    cardRegex?: unknown[];
    moduleRegex?: unknown[];
    cardDataPatch?: Record<string, unknown>;
    assets?: Array<{ path: string; data: Buffer }>;
    cardAssets?: unknown[];
  },
): void {
  const moduleLorebook = options.moduleLorebook ?? [
    { comment: 'Lore A', key: 'lore', content: 'Module lore', insertorder: 100, mode: 'normal' },
  ];
  const moduleRegex = options.moduleRegex ?? [
    { comment: 'Regex A', type: 'editoutput', in: 'foo', out: 'bar', find: 'foo', replace: 'bar', flag: 'g' },
  ];
  const card = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: 'Compat Fixture',
      description: '',
      first_mes: '',
      alternate_greetings: [],
      post_history_instructions: '',
      character_book: {
        entries: options.cardLorebook ?? risuArrayToCCV3(moduleLorebook as Parameters<typeof risuArrayToCCV3>[0]),
      },
      extensions: {
        risuai: {
          customScripts: options.cardRegex ?? moduleRegex,
        },
      },
      assets: options.cardAssets ?? [],
      ...options.cardDataPatch,
    },
  };
  const moduleData = {
    type: 'risuModule',
    module: {
      name: 'Compat Module',
      description: '',
      id: 'module-compat',
      trigger: [],
      lorebook: moduleLorebook,
      regex: moduleRegex,
      assets: [],
    },
  };
  const zip = new AdmZip();
  zip.addFile('card.json', Buffer.from(JSON.stringify(card), 'utf8'));
  zip.addFile('module.risum', buildRisum(moduleData));
  for (const asset of options.assets ?? []) zip.addFile(asset.path, asset.data);
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
    systemPrompt: 'Character-specific system prompt',
    css: '/* test css */',
    defaultVariables: 'mood=happy',
    nickname: 'Tester',
    source: ['https://example.invalid/source'],
    additionalText: 'Additional description used by RisuAI',
    license: 'CC BY-SA 4.0',
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
  assert.deepStrictEqual(reopened.groupOnlyGreetings, []);
  assert.equal(reopened.personality, '');
  assert.equal(reopened.scenario, '');
  assert.equal(reopened.globalNote, data.globalNote);
  assert.equal(reopened.systemPrompt, '');
  assert.equal(reopened.css, data.css);
  assert.equal(reopened.defaultVariables, data.defaultVariables);
  assert.equal(reopened.nickname, '');
  assert.deepStrictEqual(reopened.source, []);
  assert.equal(reopened.additionalText, '');
  assert.equal(reopened.license, '');
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
  const compatibility = validateCharxExportCompatibilityFile(filePath);
  assert.equal(compatibility.ok, true);
  assert.equal(compatibility.issueCount, 0);
})();

(function testCharxStripsProtectedCompatibilityFieldsOnSave() {
  const filePath = path.join(tempDir, 'deprecated-compat-fields.charx');
  const data = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'No Empty Compat',
    description: 'Character description',
    personality: 'Legacy personality',
    scenario: 'Legacy scenario',
    creatorcomment: '',
    tags: [],
    firstMessage: 'Hello',
    alternateGreetings: [],
    groupOnlyGreetings: ['Legacy group greeting'],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    moduleId: 'module-empty-compat',
    moduleName: 'Empty Compat Module',
    moduleDescription: '',
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    systemPrompt: 'Legacy system prompt',
    nickname: 'Legacy nickname',
    source: ['https://example.invalid/source'],
    additionalText: 'Legacy additional text',
    license: 'Legacy license',
    _risuExt: { additionalText: 'Legacy additional text', license: 'Legacy license', virtualscript: 'alert(1)' },
    _card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        personality: 'Legacy personality',
        scenario: 'Legacy scenario',
        system_prompt: 'Legacy system prompt',
        nickname: 'Legacy nickname',
        source: ['https://example.invalid/source'],
        group_only_greetings: ['Legacy group greeting'],
        extensions: {
          risuai: {
            additionalText: 'Legacy additional text',
            license: 'Legacy license',
            virtualscript: 'alert(1)',
          },
        },
        character_book: { entries: [] },
        assets: [],
      },
    },
    _moduleData: null,
  };

  saveCharx(filePath, data as any);
  const cardData = readCharxCard(filePath).data;
  const risuExt = cardData.extensions.risuai;

  for (const key of ['personality', 'scenario', 'system_prompt', 'nickname', 'source', 'group_only_greetings']) {
    assert.equal(Object.hasOwn(cardData, key), false, `${key} should be stripped on save`);
  }
  assert.equal(Object.hasOwn(risuExt, 'additionalText'), false);
  assert.equal(Object.hasOwn(risuExt, 'license'), false);
  assert.equal(Object.hasOwn(risuExt, 'virtualscript'), false);
})();

(function testCharxDropsVirtualscriptOnOpen() {
  const filePath = path.join(tempDir, 'virtualscript-import.charx');
  writeCharxCompatibilityFixture(filePath, {
    cardDataPatch: {
      extensions: {
        risuai: {
          additionalText: 'Supported additional text',
          license: 'Supported license',
          virtualscript: 'alert(1)',
          customScripts: [],
        },
      },
    },
  });

  const opened = openCharx(filePath);
  assert.equal(opened.additionalText, 'Supported additional text');
  assert.equal(opened.license, 'Supported license');
  assert.equal(Object.hasOwn(opened._risuExt, 'virtualscript'), false);
  const openedCardData = opened._card.data as Record<string, any>;
  assert.equal(Object.hasOwn(openedCardData.extensions.risuai, 'virtualscript'), false);
})();

(function testCharxExportCompatibilityDetectsLorebookMismatch() {
  const filePath = path.join(tempDir, 'compat-lorebook-mismatch.charx');
  const moduleLorebook = [{ comment: 'Lore A', key: 'lore', content: 'Old module lore', insertorder: 100 }];
  const cardLorebook = risuArrayToCCV3(moduleLorebook);
  cardLorebook[0].content = 'New card lore';
  writeCharxCompatibilityFixture(filePath, { moduleLorebook, cardLorebook });

  const result = validateCharxExportCompatibilityFile(filePath);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === 'lorebook-content-mismatch'));
})();

(function testCharxExportCompatibilityDetectsRegexAliasOnlyFields() {
  const filePath = path.join(tempDir, 'compat-regex-alias-only.charx');
  const regex = [{ comment: 'Alias only', type: 'editoutput', find: 'foo', replace: 'bar', flag: 'g' }];
  writeCharxCompatibilityFixture(filePath, { cardRegex: regex, moduleRegex: regex });

  const result = validateCharxExportCompatibilityFile(filePath);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === 'regex-missing-canonical-in'));
  assert.ok(result.issues.some((item) => item.code === 'regex-missing-canonical-out'));
})();

(function testCharxExportCompatibilityDetectsRegexCardModuleMismatch() {
  const filePath = path.join(tempDir, 'compat-regex-mismatch.charx');
  writeCharxCompatibilityFixture(filePath, {
    cardRegex: [{ comment: 'Regex A', type: 'editoutput', in: 'foo', out: 'card', find: 'foo', replace: 'card' }],
    moduleRegex: [{ comment: 'Regex A', type: 'editoutput', in: 'foo', out: 'module', find: 'foo', replace: 'module' }],
  });

  const result = validateCharxExportCompatibilityFile(filePath);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === 'regex-out-mismatch'));
})();

(function testCharxExportCompatibilityDetectsEmptyDeprecatedFields() {
  const filePath = path.join(tempDir, 'compat-empty-deprecated.charx');
  writeCharxCompatibilityFixture(filePath, {
    cardDataPatch: {
      personality: '',
      scenario: '',
      system_prompt: '',
      nickname: '',
      source: [],
      group_only_greetings: [],
      extensions: {
        risuai: {
          customScripts: [
            { comment: 'Regex A', type: 'editoutput', in: 'foo', out: 'bar', find: 'foo', replace: 'bar' },
          ],
          additionalText: '',
          license: '',
        },
      },
    },
  });

  const result = validateCharxExportCompatibilityFile(filePath);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === 'empty-compatibility-field'));
})();

(function testCharxExportCompatibilityDetectsNonEmptyDeprecatedFields() {
  const filePath = path.join(tempDir, 'compat-nonempty-deprecated.charx');
  writeCharxCompatibilityFixture(filePath, {
    cardDataPatch: {
      personality: 'Legacy personality text',
      scenario: 'Legacy scenario text',
    },
  });

  const result = validateCharxExportCompatibilityFile(filePath);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === 'deprecated-card-field'));
})();

(function testCharxExportCompatibilityDetectsZeroByteAsset() {
  const filePath = path.join(tempDir, 'compat-zero-byte-asset.charx');
  writeCharxCompatibilityFixture(filePath, {
    assets: [{ path: 'assets/icon/main.png', data: Buffer.alloc(0) }],
    cardAssets: [{ type: 'icon', uri: 'embeded://assets/icon/main.png', name: 'main', ext: 'png' }],
  });

  const result = validateCharxExportCompatibilityFile(filePath);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === 'zero-byte-asset'));
})();

(function testSaveCharxRestoresJsonSerializedAssetBuffers() {
  const filePath = path.join(tempDir, 'json-serialized-asset-buffer.charx');
  const sourceData = {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'Serialized Asset Test',
    description: '',
    creatorcomment: '',
    tags: [],
    firstMessage: '',
    alternateGreetings: [],
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
    assets: [{ path: 'assets/icon/image/main.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }],
    xMeta: {},
    risumAssets: [],
    cardAssets: [{ type: 'icon', uri: 'embeded://assets/icon/image/main.png', name: 'main', ext: 'png' }],
    _risuExt: {},
    _card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: { extensions: { risuai: {} }, character_book: { entries: [] }, assets: [] },
    },
    _moduleData: null,
  };
  const serializedData = JSON.parse(JSON.stringify(sourceData));

  saveCharx(filePath, serializedData as any);

  const zip = new AdmZip(filePath);
  const assetEntry = zip.getEntry('assets/icon/image/main.png');
  assert.ok(assetEntry, 'serialized asset should be written to the ZIP');
  assert.equal(assetEntry.getData().length, 4);
  assert.equal(validateCharxExportCompatibilityFile(filePath).ok, true);
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
  assert.equal(reopened.cjs, '');
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

  assert.equal(reopened.cjs, '');
  assert.equal(reopened.lowLevelAccess, data.lowLevelAccess);
  assert.equal(reopened.hideIcon, data.hideIcon);
  assert.equal(reopened.backgroundEmbedding, data.backgroundEmbedding);
  assert.equal(reopened.moduleNamespace, data.moduleNamespace);
  // Empty strings become undefined (cleaned on save)
  assert.equal(reopened.customModuleToggle || '', '');
  assert.equal(reopened.mcpUrl || '', '');
})();

(function testHinanoRegressionUsesAsyncCheatHandlersAndArrayAwareScenarioInjection() {
  const filePath = path.join(tempDir, 'hinano-regression.charx');
  const mainCode = [
    'local stats = {{ label = "HP" }}',
    'for _, s in ipairs(stats) do',
    '  _G["onSet" .. s.label] = async(function(id)',
    '    return alertInput(id, "set value"):await()',
    '  end)',
    'end',
    '',
    'onTimeskip = async(function(id)',
    '  return alertInput(id, "timeskip"):await()',
    'end)',
    '',
    'local function injectScenarioDirective(data, directive)',
    '  if type(data) == "table" then',
    '    for i = 1, #data do',
    '      local item = data[i]',
    '      if type(item) == "string" then',
    '        data[i] = item .. "\\n\\n<scenario_directive>" .. directive .. "</scenario_directive>"',
    '      end',
    '    end',
    '    return data',
    '  end',
    '  return tostring(data or "")',
    '    .. "\\n\\n<scenario_directive>"',
    '    .. directive',
    '    .. "</scenario_directive>"',
    'end',
  ].join('\n');

  saveCharx(filePath, {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name: 'Hinano Regression',
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
    lua: mainCode,
    triggerScripts: [
      {
        comment: 'main',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: mainCode }],
        lowLevelAccess: false,
      },
    ],
    lorebook: [],
    regex: [],
    moduleId: 'module-hinano-regression',
    moduleName: 'Hinano Regression',
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
  } as any);

  const reopened = openCharx(filePath);
  const mainTrigger = reopened.triggerScripts?.[0];
  const mainEffect = Array.isArray(mainTrigger?.effect) ? mainTrigger.effect[0] : undefined;
  const reopenedMainCode =
    mainEffect && typeof mainEffect === 'object' && 'code' in mainEffect && typeof mainEffect.code === 'string'
      ? mainEffect.code
      : '';

  assert.ok(reopenedMainCode.length > 0, 'Hinano regression fixture should expose triggerlua code');
  assert.match(
    reopenedMainCode,
    /_G\["onSet" \.\. s\.label\] = async\(function\(id\)/,
    'Cheat stat setters should wrap alertInput with async() so :await() resumes correctly',
  );
  assert.match(
    reopenedMainCode,
    /onTimeskip\s*=\s*async\(function\(id\)/,
    'Time skip should wrap alertInput with async() so :await() resumes correctly',
  );
  assert.match(
    reopenedMainCode,
    /local function injectScenarioDirective\(data, directive\)/,
    'Scenario injection should use a helper that can handle editRequest prompt arrays',
  );
  assert.match(
    reopenedMainCode,
    /if type\(data\) == "table" then/,
    'Scenario injection should support editRequest chat arrays directly',
  );
  assert.doesNotMatch(
    reopenedMainCode,
    /return data \.\. "\\n\\n<scenario_directive>/,
    'Scenario injection should not concatenate raw strings onto editRequest arrays',
  );
})();

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
  assert.equal(reopened.mainPrompt, '');
  assert.equal(reopened.jailbreak, '');
  assert.equal(reopened.globalNote, '');
  assert.equal(reopened.temperature, data.temperature);
  assert.equal(reopened.maxContext, data.maxContext);
  assert.equal(reopened.maxResponse, data.maxResponse);
  assert.equal(reopened.frequencyPenalty, data.frequencyPenalty);
  assert.equal(reopened.presencePenalty, data.presencePenalty);
  assert.equal(reopened.aiModel, data.aiModel);
  assert.equal(reopened.subModel, data.subModel);
  assert.equal(reopened.apiType, data.apiType);
  assert.equal(reopened.promptPreprocess, data.promptPreprocess);
  // promptTemplate gains stable IDs on open; verify content round-trips correctly
  const reopenedPt = JSON.parse(reopened.promptTemplate!);
  const origPt = JSON.parse(data.promptTemplate);
  assert.equal(reopenedPt.length, origPt.length, 'promptTemplate should have the same number of items');
  assert.equal(reopenedPt[0].type, origPt[0].type);
  assert.equal(reopenedPt[0].text, origPt[0].text);
  assert.equal(typeof reopenedPt[0].id, 'string', 'promptTemplate items should gain stable ids on open');
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
  assert.equal(Object.hasOwn(reopened._presetData!, 'mainPrompt'), false);
  assert.equal(reopened.mainPrompt, '');
})();

fs.rmSync(risupTempDir, { recursive: true, force: true });

// ---- .risup legacy promptTemplate migration tests ----
const risupMigrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-risup-migration-'));

const legacyPresetWithoutIds = {
  name: 'Legacy Preset',
  mainPrompt: 'Be helpful.',
  promptTemplate: [
    { type: 'plain', type2: 'normal', text: 'System prompt', role: 'system' },
    { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
  ],
  formatingOrder: ['main', 'jailbreak'],
  bias: [['hello', 5]],
};

const filePathWithoutIds = path.join(risupMigrationDir, 'legacy-no-ids.risup');
writeRisupEnvelope(filePathWithoutIds, {
  type: 'preset',
  presetVersion: 2,
  preset: encryptRisupPayload(legacyPresetWithoutIds),
});

const roundTripPath = path.join(risupMigrationDir, 'roundtrip-ids.risup');

(function testRisupPromptTemplateGetsIdsOnOpen() {
  const reopened = openRisup(filePathWithoutIds);
  const promptTemplate = JSON.parse(reopened.promptTemplate!);
  assert.equal(typeof promptTemplate[0].id, 'string');
  assert.equal(typeof promptTemplate[1].id, 'string');
})();

(function testRisupPromptTemplateIdsPersistOnSave() {
  const reopened = openRisup(filePathWithoutIds);
  saveRisup(roundTripPath, reopened);
  const reopenedAgain = openRisup(roundTripPath);
  const first = JSON.parse(reopened.promptTemplate!);
  const second = JSON.parse(reopenedAgain.promptTemplate!);
  assert.equal(second[0].id, first[0].id);
})();

fs.rmSync(risupMigrationDir, { recursive: true, force: true });

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

fs.rmSync(tempDir, { recursive: true, force: true });

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
  assert.equal(reopened.mainPrompt, '');
  assert.equal(reopened._compressionMode, 'gzip');
})();

fs.rmSync(risupCompatTempDir, { recursive: true, force: true });

console.log('test-charx passed (including risup, error cases, and cardAssets reconciliation)');
