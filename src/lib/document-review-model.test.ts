import { describe, expect, it } from 'vitest';
import { buildDocumentReviewChanges, formatReviewValue, restoreDocumentReviewChange } from './document-review-model';
import type { RendererDocumentData } from './document-types';

function data(values: Record<string, unknown> = {}): RendererDocumentData {
  return {
    _fileType: 'charx',
    name: '이름',
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
    ...values,
  } as RendererDocumentData;
}

describe('document review changes', () => {
  it('ignores automatic save timestamps while retaining content and creation-date changes', () => {
    const baseline = data({ creationDate: 100, modificationDate: 200 });
    const current = data({ creationDate: 100, modificationDate: 300 });
    expect(buildDocumentReviewChanges(baseline, current)).toEqual([]);
    expect(
      buildDocumentReviewChanges(baseline, { ...current, description: '수정', creationDate: 101 }).map(
        (change) => change.field,
      ),
    ).toEqual(['description', 'creationDate']);
  });

  it('compares JSON by content, ignores internal fields, and distinguishes empty, missing and added fields', () => {
    const baseline = data({ description: '기존', settings: { a: 1, b: 2 }, _internal: 'old', nickname: '' });
    const current = data({ description: '', settings: { b: 2, a: 1 }, _internal: 'new', source: ['new'] });
    const changes = buildDocumentReviewChanges(baseline, current);
    expect(changes.map(({ field, kind }) => [field, kind])).toEqual([
      ['description', 'modified'],
      ['nickname', 'removed'],
      ['source', 'added'],
    ]);
    expect(formatReviewValue(changes[0].after)).toBe('(빈 문자열)');
    expect(changes[2].canRestore).toBe(false);
    expect(restoreDocumentReviewChange(current, changes[2])).toBeNull();
  });

  it('restores one field without overwriting unrelated work and refuses stale reviewed values', () => {
    const baseline = data({ description: '저장본' });
    const current = data({ description: '작업본' });
    const [change] = buildDocumentReviewChanges(baseline, current);
    expect(restoreDocumentReviewChange({ ...current, name: '다른 작업' }, change)).toEqual({ description: '저장본' });
    current.description = '검토 이후 수정';
    expect(restoreDocumentReviewChange(current, change)).toBeNull();
  });

  it('uses stable explicit identities for item review and returns an immutable collection patch', () => {
    const before = [
      { id: 'world', comment: '세계관', content: 'old' },
      { id: 'cast', content: 'same' },
    ];
    const after = [
      { id: 'world', comment: '세계관', content: 'new' },
      { id: 'cast', content: 'same' },
    ];
    const current = data({ lorebook: after });
    const [change] = buildDocumentReviewChanges(data({ lorebook: before }), current);
    expect(change.index).toBe(0);
    expect(change.label).toBe('로어북 · 세계관');
    const patch = restoreDocumentReviewChange(current, change);
    expect(patch?.lorebook).toEqual(before);
    expect(current.lorebook[0].content).toBe('new');
    after[1].content = 'changed while reviewing';
    expect(restoreDocumentReviewChange(current, change)).toBeNull();
  });

  it.each([
    [
      [
        { id: 'a', content: '1' },
        { id: 'b', content: '2' },
      ],
      [
        { id: 'b', content: '2' },
        { id: 'a', content: '1' },
      ],
    ],
    [[{ comment: 'same', content: '1' }], [{ comment: 'same', content: '2' }]],
    [
      [{ id: 'a', content: '1' }],
      [
        { id: 'a', content: '1' },
        { id: 'b', content: '2' },
      ],
    ],
    [
      [
        { id: 'a', content: '1' },
        { id: 'a', content: '2' },
      ],
      [
        { id: 'a', content: '3' },
        { id: 'a', content: '2' },
      ],
    ],
  ])('restores the entire collection when identity or order is not stable', (before, after) => {
    const current = data({ lorebook: after });
    const changes = buildDocumentReviewChanges(data({ lorebook: before }), current);
    expect(changes).toHaveLength(1);
    expect(changes[0].index).toBeUndefined();
    expect(changes[0].collectionNote).toBeTruthy();
    expect(restoreDocumentReviewChange(current, changes[0])).toEqual({ lorebook: before });
  });

  it('supports serialized prompt items and preserves unknown item fields on restoration', () => {
    const oldItems = [{ id: 'p', type: 'plain', text: 'old', unknown: { preserve: true } }];
    const newItems = [{ ...oldItems[0], text: 'new' }];
    const current = data({ promptTemplate: JSON.stringify(newItems) });
    const [change] = buildDocumentReviewChanges(data({ promptTemplate: JSON.stringify(oldItems) }), current);
    expect(change.index).toBe(0);
    expect(JSON.parse(restoreDocumentReviewChange(current, change)?.promptTemplate ?? 'null')).toEqual(oldItems);
  });

  it('does not manufacture changes when the saved version is unavailable', () => {
    expect(buildDocumentReviewChanges(null, data())).toEqual([]);
    expect(buildDocumentReviewChanges(data(), null)).toEqual([]);
  });
});
