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
  assert.throws(
    () => parseRisum(Buffer.from([0x6F, 0x00])),
    /too small to contain a valid risum header/i,
  );
})();

(function testRisumRejectsMainPayloadLengthThatExceedsBuffer() {
  const truncated = Buffer.from([0x6F, 0x00, 0x10, 0x00, 0x00, 0x00, 0x41]);

  assert.throws(
    () => parseRisum(truncated),
    /main payload length exceeds the available buffer/i,
  );
})();

console.log('test-rpack passed');
