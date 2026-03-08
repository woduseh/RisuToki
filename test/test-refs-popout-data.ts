import assert from 'node:assert/strict';
import { buildRefsPopoutData } from '../src/lib/refs-popout-data';

(function testPopoutDataIncludesSessionGuides() {
  const result = buildRefsPopoutData(
    {
      builtIn: ['A.md'],
      session: ['B.md'],
    },
    [],
  );

  assert.deepEqual(result.guides, ['A.md']);
  assert.deepEqual(result.sessionGuides, ['B.md']);
})();

(function testPopoutDataBuildsTriggerAndLorebookEntries() {
  const result = buildRefsPopoutData(
    { builtIn: [], session: [] },
    [
      {
        fileName: 'bot.charx',
        data: {
          lua: '-- code',
          triggerScripts: '[{"name":"main"}]',
          lorebook: [
            { mode: 'folder', comment: 'folder' },
            { mode: 'normal', comment: 'entry' },
          ],
          regex: [{ comment: 'cleanup' }],
        },
      },
    ],
  );

  assert.equal(result.refs[0].label, 'bot.charx');
  assert.ok(result.refs.some((entry) => entry.id === 'ref_0_triggerScripts'));
  assert.ok(result.refs.some((entry) => entry.id === 'ref_0_lb_1'));
  assert.ok(result.refs.some((entry) => entry.id === 'ref_0_rx_0'));
})();

console.log('Refs popout data tests passed');
