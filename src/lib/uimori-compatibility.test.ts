// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkUimoriCompatibility } from './uimori-compatibility';

const lua = (code: string) => [{ type: 'start', effect: [{ type: 'triggerlua', code }] }];
const codes = (data: Record<string, unknown>) => checkUimoriCompatibility(data).findings.map((finding) => finding.code);

describe('checkUimoriCompatibility', () => {
  it('passes a card that uses only what Uimori runs', () => {
    const result = checkUimoriCompatibility({
      _fileType: 'charx',
      _card: { data: { extensions: { uimori: { translationGuide: { instructions: '', terms: [] } } } } },
      lorebook: [
        { comment: 'Harbor district', key: 'harbor', content: '@@depth 0\n@@role system\nThe harbor district...' },
        { comment: '', alwaysActive: true, content: 'Pinned rules' },
        { comment: '', mode: 'folder', content: '' },
      ],
      regex: [{ type: 'editdisplay', in: 'x', out: '@@move_top <b>x</b>' }],
      triggerScripts: lua(
        'local function log(x) return x end\nlog(math.log(2))\nlocal json = require("json")\n-- sleep(1)',
      ),
      css: '<style>.a { background: url(assets/bg.png) }</style>',
      cardAssets: [{ name: 'portrait', ext: 'webp' }],
    });
    expect(result).toMatchObject({ ok: true, baseline: 'Uimori v0.13.3', counts: { error: 0, warning: 0 } });
  });

  it('reports what Uimori skips, rejects, or cannot play', () => {
    const result = checkUimoriCompatibility({
      _fileType: 'charx',
      _card: { data: { extensions: { uimori: { illustrationProfiles: [{ id: 'a', name: 'A' }] } } } },
      lorebook: [
        { comment: 'Injected', content: '@@position after_desc\nbody' },
        { comment: 'Negative', content: '@@depth -1\nbody' },
        { comment: 'Late directive', content: 'body\n@@depth 2' },
        { comment: '', key: 'harbor', content: 'Untitled selectable entry' },
      ],
      regex: [{ type: 'editoutput', in: 'x', out: '@@emo happy' }],
      triggerScripts: lua('sleep(10)\nsetDescription("x")\nrequire("socket")\nmath.randomseed(1)'),
      firstMessage: '<iframe src="https://example.invalid"></iframe>',
      cardAssets: [{ name: 'theme', ext: 'mp3' }],
    });
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => [finding.code, finding.path])).toEqual([
      ['uimori-extension-invalid', '/_card/data/extensions/uimori'],
      ['uimori-lore-placement-unsupported', '$.lorebook[0].content'],
      ['uimori-lore-placement-unsupported', '$.lorebook[1].content'],
      ['uimori-lore-directive-in-body', '$.lorebook[2].content'],
      ['uimori-lore-untitled', '$.lorebook[3].comment'],
      ['uimori-regex-command-unsupported', '$.regex[0]'],
      ['uimori-lua-api-unsupported', '$.triggerScripts[0].effect[0].code'],
      ['uimori-display-script', '$.firstMessage'],
      ['uimori-display-external', '$.firstMessage'],
      ['uimori-asset-media-unsupported', '$.cardAssets'],
    ]);
    expect(result.findings.find((finding) => finding.code === 'uimori-lua-api-unsupported')?.detail).toBe(
      'sleep, setDescription, require("socket"), math.randomseed',
    );
  });

  it('checks the preset blocks, settings, and regex a .risup carries', () => {
    expect(
      codes({
        _fileType: 'risup',
        promptTemplate: JSON.stringify([{ type: 'plain' }, { type: 'jailbreak' }, { type: 'memory' }]),
        promptSettings: JSON.stringify({ utilOverride: true, customChainOfThought: false }),
        _presetData: { regex: [{ type: 'editoutput', in: 'a', out: '@@repeat_back' }] },
      }),
    ).toEqual([
      'uimori-regex-command-unsupported',
      'uimori-preset-block-unsupported',
      'uimori-preset-memory-slot',
      'uimori-preset-host-setting',
    ]);
  });

  it('reads a standalone module from its own extensions and assets', () => {
    expect(
      codes({
        _fileType: 'risum',
        _card: { data: { extensions: { uimori: 'ignored for modules' } } },
        _moduleData: {
          type: 'risuModule',
          module: { extensions: { uimori: [] }, assets: [['clip', '__asset:0', 'mp4']] },
        },
      }),
    ).toEqual(['uimori-extension-invalid', 'uimori-asset-media-unsupported']);
  });
});
