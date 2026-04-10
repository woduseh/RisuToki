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
  const result = buildRefsPopoutData({ builtIn: [], session: [] }, [
    {
      fileName: 'bot.charx',
      data: {
        lua: '-- code',
        triggerScripts: '[{"name":"main"}]',
        alternateGreetings: ['hello'],
        groupOnlyGreetings: ['group hello'],
        defaultVariables: 'a=1',
        creatorcomment: 'creator note',
        lorebook: [
          { mode: 'folder', comment: 'folder' },
          { mode: 'normal', comment: 'entry' },
        ],
        regex: [{ comment: 'cleanup' }],
      },
    },
  ]);

  assert.equal(result.refs[0].label, 'bot.charx');
  assert.ok(result.refs.some((entry) => entry.id === 'ref_0_triggerScripts'));
  assert.ok(result.refs.some((entry) => entry.label === '추가 첫 메시지' && entry.isFolder));
  assert.ok(result.refs.some((entry) => entry.id === 'ref_0_greeting_alternate_0'));
  assert.ok(result.refs.some((entry) => entry.label === '그룹 전용 인사말' && entry.isFolder));
  assert.ok(result.refs.some((entry) => entry.id === 'ref_0_greeting_group_0'));
  assert.ok(result.refs.some((entry) => entry.id === 'ref_0_defaultVariables'));
  assert.ok(result.refs.some((entry) => entry.id === 'ref_0_creatorcomment'));
  assert.ok(result.refs.some((entry) => entry.id === 'ref_0_lb_1'));
  assert.ok(result.refs.some((entry) => entry.id === 'ref_0_rx_0'));
})();

(function testPopoutDataIncludesAlternateGreetings() {
  const result = buildRefsPopoutData({ builtIn: [], session: [] }, [
    {
      fileName: 'card.charx',
      data: {
        alternateGreetings: ['Hello', 'Hi there'],
      },
    },
  ]);
  assert.ok(
    result.refs.some((entry) => entry.id === 'ref_0_greeting_alternate_0'),
    'alternate greeting entry should appear in popout',
  );
})();

(function testPopoutDataIncludesGroupOnlyGreetings() {
  const result = buildRefsPopoutData({ builtIn: [], session: [] }, [
    {
      fileName: 'card.charx',
      data: {
        groupOnlyGreetings: ['Group hello'],
      },
    },
  ]);
  assert.ok(
    result.refs.some((entry) => entry.id === 'ref_0_greeting_group_0'),
    'groupOnlyGreetings entry should appear in popout',
  );
})();

(function testPopoutDataIncludesDefaultVariables() {
  const result = buildRefsPopoutData({ builtIn: [], session: [] }, [
    {
      fileName: 'mod.risum',
      data: {
        defaultVariables: '{"key": "value"}',
      },
    },
  ]);
  assert.ok(
    result.refs.some((entry) => entry.id === 'ref_0_defaultVariables'),
    'defaultVariables entry should appear in popout',
  );
})();

(function testPopoutDataSkipsEmptyArrayFields() {
  const result = buildRefsPopoutData({ builtIn: [], session: [] }, [
    {
      fileName: 'card.charx',
      data: {
        alternateGreetings: [],
        groupOnlyGreetings: [],
      },
    },
  ]);
  assert.ok(
    !result.refs.some((entry) => entry.id === 'ref_0_greeting_alternate_0'),
    'empty alternateGreetings should not appear',
  );
  assert.ok(
    !result.refs.some((entry) => entry.id === 'ref_0_greeting_group_0'),
    'empty groupOnlyGreetings should not appear',
  );
})();

(function testPopoutDataIncludesRisupGroups() {
  const result = buildRefsPopoutData({ builtIn: [], session: [] }, [
    {
      fileName: 'preset.risup',
      fileType: 'risup',
      data: {
        _fileType: 'risup',
        description: 'preset description',
      },
    },
  ]);
  assert.ok(
    result.refs.some((entry) => entry.id === 'ref_0_risup_basic'),
    'risup basic group should appear in popout',
  );
  assert.ok(
    result.refs.some((entry) => entry.id === 'ref_0_risup_templates'),
    'risup templates group should appear in popout',
  );
})();

console.log('Refs popout data tests passed');
