import { describe, expect, it } from 'vitest';

import type { LorebookEntry } from './lorebook-io';
import { buildFolderInfoMap, getFolderRef, getFolderUuid, normalizeFolderRef } from './lorebook-folders';

describe('getFolderUuid', () => {
  it('prefers folder UUIDs stored in key and falls back to id for legacy folders', () => {
    expect(getFolderUuid({ mode: 'folder', key: 'uuid-key', id: 'legacy-id' })).toBe('uuid-key');
    expect(getFolderUuid({ mode: 'folder', key: '', id: 'legacy-id' })).toBe('legacy-id');
  });
});

describe('normalizeFolderRef', () => {
  it('normalizes child folder refs to folder:uuid form', () => {
    expect(normalizeFolderRef('uuid-key')).toBe('folder:uuid-key');
    expect(normalizeFolderRef('folder:uuid-key')).toBe('folder:uuid-key');
  });
});

describe('getFolderRef', () => {
  it('returns normalized folder refs from folder entries', () => {
    expect(getFolderRef({ mode: 'folder', key: 'uuid-key' })).toBe('folder:uuid-key');
    expect(getFolderRef({ mode: 'folder', key: '', id: 'legacy-id' })).toBe('folder:legacy-id');
  });
});

describe('buildFolderInfoMap', () => {
  it('builds normalized folder info for canonical and legacy folder entries', () => {
    const entries: LorebookEntry[] = [
      { comment: 'Canonical', mode: 'folder', key: 'uuid-key' },
      { comment: 'Legacy', mode: 'folder', id: 'legacy-id' },
    ];

    const map = buildFolderInfoMap(entries);

    expect(map.get('folder:uuid-key')).toEqual({ name: 'Canonical' });
    expect(map.get('folder:legacy-id')).toEqual({ name: 'Legacy' });
  });
});
