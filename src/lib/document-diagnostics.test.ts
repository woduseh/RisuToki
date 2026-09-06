import { describe, expect, it } from 'vitest';
import { buildModuleOverview, diagnoseDocument } from './document-diagnostics';
import type { RendererDocumentData } from './document-types';

function document(fields: Record<string, unknown> = {}): RendererDocumentData {
  return {
    _fileType: 'risum',
    name: 'Synthetic module',
    description: '',
    firstMessage: '',
    alternateGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: '',
    lorebook: [],
    regex: [],
    ...fields,
  } as RendererDocumentData;
}

describe('static document diagnostics', () => {
  it('reports malformed collection entries without crashing the diagnostic or overview screen', () => {
    const input = document({ lorebook: [null], regex: [5] });
    expect(diagnoseDocument(input).map((item) => item.code)).toEqual(['lorebook-invalid-entry', 'regex-invalid-entry']);
    expect(buildModuleOverview(input).lorebook[0].index).toBe(0);
  });
  it('reports supported CBS nesting errors with exact field, entry and line while leaving unknown commands alone', () => {
    const result = diagnoseDocument(
      document({
        lorebook: [{ content: 'first line\n{{/}}' }],
        description: '{{unknown::x}}',
        firstMessage: '{{#when::x}}open to end',
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      code: 'cbs-block-nesting',
      severity: 'error',
      source: { field: 'lorebook', index: 0, path: '$.lorebook[0].content', line: 2 },
    });
    expect(diagnoseDocument(document({ lua: 'local text = "{{/}}"' }))).toEqual([]);
  });

  it('compiles only patterns with runtime-compatible custom flag semantics and does not execute them', () => {
    const result = diagnoseDocument(
      document({
        regex: [
          { type: 'editoutput', find: '[', ableFlag: false, flag: 'uv' },
          { type: 'editoutput', find: 'safe', ableFlag: false, flag: 'uv' },
          { type: 'editoutput', find: 'safe', ableFlag: true, flag: 'gg<order 10><move_top>' },
          { type: 'editoutput', find: 'safe', ableFlag: true, flag: 'uv' },
          { type: 'disabled', find: '[' },
          { type: 'editoutput', find: '{{getvar::pattern}}' },
          { type: 'editoutput', find: '(a+)+$' },
        ],
      }),
    );
    expect(result.map((entry) => [entry.code, entry.source.index])).toEqual([
      ['regex-invalid-pattern', 0],
      ['regex-invalid-pattern', 3],
      ['regex-dynamic-pattern', 5],
    ]);
    expect(result[0].detail).toContain('flags: g');
  });

  it('distinguishes malformed serialized structures from unsupported trigger and prompt shapes', () => {
    const broken = diagnoseDocument(document({ triggerScripts: '{', promptTemplate: '{}' }));
    expect(broken.map((entry) => entry.code)).toEqual(['trigger-invalid-json', 'prompt-invalid-json']);
    expect(broken.every((entry) => entry.severity === 'error')).toBe(true);
    const unsupported = diagnoseDocument(
      document({
        triggerScripts: JSON.stringify([{ type: 'start', effect: [{ type: 'future', value: '{{/}}' }] }, { type: 2 }]),
        promptTemplate: JSON.stringify([{ type: 'future' }]),
      }),
    );
    expect(unsupported.find((entry) => entry.code === 'trigger-unsupported-effect')).toMatchObject({
      severity: 'warning',
      source: { field: 'triggerScripts', index: 0, path: '$.triggerScripts[0].effect[0]' },
    });
    expect(unsupported.find((entry) => entry.code === 'trigger-invalid-trigger-field')).toMatchObject({
      severity: 'error',
      source: { index: 1, path: '$.triggerScripts[1].type' },
    });
    expect(unsupported.find((entry) => entry.code === 'prompt-unsupported-shape')?.severity).toBe('warning');
    expect(unsupported.some((entry) => entry.code === 'cbs-block-nesting')).toBe(false);
  });

  it('checks only complete literal asset references against a known inventory, ignoring dynamic nested CBS', () => {
    const input = document({
      firstMessage:
        '{{asset::KNOWN}}\n{{asset::missing}}\n{{asset::{{getvar::scene}}}}\n{{asset::prefix{{raw::dynamic}}}}',
    });
    expect(diagnoseDocument(input)).toEqual([]);
    const result = diagnoseDocument(input, { assetInventoryAvailable: true, assetNames: ['known'] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      code: 'asset-reference-missing',
      severity: 'warning',
      source: { field: 'firstMessage', line: 2 },
    });
    expect(result[0].message).toContain('missing');
  });

  it('retains prompt and greeting source indices without mutation and generates stable diagnostic IDs', () => {
    const input = document({
      alternateGreetings: ['ok', '{{asset::missing}}'],
      promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', role: 'system', text: 'line\n{{/}}' }]),
    });
    const snapshot = JSON.stringify(input);
    const options = { assetInventoryAvailable: true, assetNames: [] };
    const result = diagnoseDocument(input, options);
    expect(result.map((entry) => entry.source)).toEqual([
      { field: 'alternateGreetings', index: 1, path: '$.alternateGreetings[1]', line: 1 },
      { field: 'promptTemplate', index: 0, path: '$.promptTemplate[0].text', line: 2 },
    ]);
    expect(diagnoseDocument(input, options)).toEqual(result);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('module composition overview', () => {
  it('describes stored activation conditions, toggle declarations, variables and trigger events without executing them', () => {
    const input = document({
      customModuleToggle: '=Display=group\nscene=Scene=select=day,night\n= =groupEnd',
      defaultVariables: 'ns.value=left=right\n# comment\nother:key:value\nunrecognized',
      lorebook: [
        { mode: 'folder', comment: 'Folder' },
        {
          comment: 'World',
          folder: 'f',
          key: 'a,b',
          secondkey: 'c',
          selective: true,
          useRegex: false,
          alwaysActive: true,
          insertorder: 50,
          content: '@@probability 40\nBody',
        },
      ],
      triggerScripts: JSON.stringify([
        {
          comment: 'Start',
          type: 'start',
          conditions: [{ type: 'custom', value: '1' }],
          effect: [{ type: 'triggerlua', code: 'error("must not run")' }],
        },
      ]),
    });
    const overview = buildModuleOverview(input, {
      assetInventoryAvailable: true,
      assetNames: ['a', 'alias'],
      assetCount: 1,
    });
    expect(overview.counts).toEqual({ lorebook: 2, lorebookFolders: 1, regex: 0, triggers: 1, assets: 1 });
    expect(overview.triggers[0]).toMatchObject({ index: 0, event: 'start', conditionCount: 1, effectCount: 1 });
    expect(overview.lorebook[1]).toMatchObject({
      index: 1,
      alwaysActive: true,
      selective: true,
      keys: 'a,b',
      secondaryKeys: 'c',
      decorators: { probability: 40 },
    });
    expect(overview.defaultVariables.entries).toEqual([
      { key: 'ns.value', value: 'left=right', line: 1 },
      { key: 'other', value: 'key:value', line: 3 },
    ]);
    expect(overview.defaultVariables.unparsedLines).toEqual([4]);
  });

  it('preserves unsupported toggle text and distinguishes unread inventories and invalid trigger JSON from empty sources', () => {
    const overview = buildModuleOverview(document({ customModuleToggle: '=unsupported', triggerScripts: '{' }));
    expect(overview.toggles.state).toBe('invalid');
    expect(overview.toggles.rawText).toBe('=unsupported');
    expect(overview.counts.assets).toBeNull();
    expect(overview.triggerState).toBe('invalid');
    expect(buildModuleOverview(document()).triggerState).toBe('empty');
    expect(buildModuleOverview(document({ customModuleToggle: 'key=Label' })).toggles.items).toEqual([
      { type: 'toggle', key: 'key', value: 'Label' },
    ]);
  });
});
