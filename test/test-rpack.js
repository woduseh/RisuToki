'use strict';

const assert = require('node:assert/strict');
const { buildRisum, parseRisum, rpackEncode, rpackDecode } = require('../src/rpack');

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
          lowLevelAccess: false
        }
      ],
      regex: [
        {
          comment: 'Bold markdown',
          type: 'editoutput',
          find: '\\*\\*(.+?)\\*\\*',
          replace: '<b>$1</b>',
          flag: 'g'
        }
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
          mode: 'normal'
        }
      ],
      assets: []
    }
  };
  const embeddedAssets = [Buffer.from('alpha'), Buffer.from([0, 1, 2, 3, 4])];

  const built = buildRisum(moduleJson, embeddedAssets);
  const parsed = parseRisum(built);

  assert.deepStrictEqual(parsed.module, moduleJson);
  assert.deepStrictEqual(parsed.assets, embeddedAssets);
})();

console.log('test-rpack passed');
