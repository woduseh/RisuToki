import assert from 'node:assert/strict';
import { buildRisum, parseRisum, rpackEncode, rpackDecode } from '../src/rpack';

(function testByteRoundTrip() {
  const original = Buffer.from(Array.from({ length: 256 }, (_, index) => index));
  const encoded = rpackEncode(original);
  const decoded = rpackDecode(encoded);

  assert.deepStrictEqual(decoded, original);
})();

(function testRisumRoundTrip() {
  const moduleJson = {
    type: 'risuModule',
    module: {
      name: 'Test Module',
      description: 'Round-trip test module',
      id: 'module-123',
      trigger: [
        {
          comment: '',
          type: 'start',
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'print("hello")' }],
          lowLevelAccess: false,
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
      lorebook: [
        {
          key: 'hero, protagonist',
          secondkey: '',
          comment: 'Hero entry',
          content: 'A brave and cheerful hero.',
          insertorder: 100,
          alwaysActive: false,
          selective: false,
          mode: 'normal',
        },
      ],
      assets: [],
    },
  };
  const embeddedAssets = [Buffer.from('alpha'), Buffer.from([0, 1, 2, 3, 4])];

  const built = buildRisum(moduleJson, embeddedAssets);
  const parsed = parseRisum(built);

  assert.deepStrictEqual(parsed.module, moduleJson);
  assert.deepStrictEqual(parsed.assets, embeddedAssets);
})();

(function testRisumRejectsTruncatedHeader() {
  assert.throws(() => parseRisum(Buffer.from([0x6f, 0x00])), /too small to contain a valid risum header/i);
})();

(function testRisumWireBytesAndInputOwnership() {
  const moduleJson = { type: 'risuModule', module: { name: '한글 🌿', assets: [] } };
  const allBytes = Buffer.from(Array.from({ length: 256 }, (_, index) => index));
  const largeAsset = Buffer.alloc(1024 * 1024 + 17);
  for (let i = 0; i < largeAsset.length; i++) largeAsset[i] = i & 255;

  for (const assets of [[], [Buffer.alloc(0)], [allBytes, Buffer.alloc(0), allBytes.subarray(7, 219), largeAsset]]) {
    const snapshots = assets.map((asset) => Buffer.from(asset));
    const main = rpackEncode(Buffer.from(JSON.stringify(moduleJson), 'utf-8'));
    const header = Buffer.alloc(6);
    header[0] = 0x6f;
    header.writeUInt32LE(main.length, 2);
    const parts = [header, main];
    for (const asset of assets) {
      const assetHeader = Buffer.alloc(5);
      assetHeader[0] = 1;
      assetHeader.writeUInt32LE(asset.length, 1);
      parts.push(assetHeader, rpackEncode(asset));
    }
    parts.push(Buffer.from([0]));

    const built = buildRisum(moduleJson, assets);
    assert.deepStrictEqual(built, Buffer.concat(parts), 'wire bytes must stay compatible');
    assert.deepStrictEqual(parseRisum(built), { module: moduleJson, assets });
    assert.deepStrictEqual(assets, snapshots, 'encoding must not mutate input assets');
    built.fill(0);
    assert.deepStrictEqual(assets, snapshots, 'output must not alias input assets');
  }
})();

(function testRisumRejectsMainPayloadLengthThatExceedsBuffer() {
  const truncated = Buffer.from([0x6f, 0x00, 0x10, 0x00, 0x00, 0x00, 0x41]);

  assert.throws(() => parseRisum(truncated), /main payload length exceeds the available buffer/i);
})();

console.log('test-rpack passed');
