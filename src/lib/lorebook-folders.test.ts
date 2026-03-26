import { describe, expect, it } from 'vitest';

import type { LorebookEntry } from './lorebook-io';
import {
  buildFolderInfoMap,
  canonicalizeLorebookFolderRefs,
  getFolderRef,
  getFolderUuid,
  normalizeFolderRef,
  resolveLorebookFolderRef,
} from './lorebook-folders';

describe('getFolderUuid', () => {
  it('prefers folder UUIDs stored in key and falls back to id for legacy folders', () => {
    expect(getFolderUuid({ mode: 'folder', key: 'uuid-key', id: 'legacy-id' })).toBe('uuid-key');
    expect(getFolderUuid({ mode: 'folder', key: '', id: 'legacy-id' })).toBe('legacy-id');
    expect(getFolderUuid({ mode: 'normal', key: 'not-a-folder' })).toBeNull();
  });
});

describe('normalizeFolderRef', () => {
  it('normalizes child folder refs to folder:uuid form', () => {
    expect(normalizeFolderRef('uuid-key')).toBe('folder:uuid-key');
    expect(normalizeFolderRef('folder:uuid-key')).toBe('folder:uuid-key');
    expect(normalizeFolderRef('')).toBe('');
    expect(normalizeFolderRef(undefined)).toBe('');
  });
});

describe('getFolderRef', () => {
  it('returns the normalized folder ref from a folder entry', () => {
    expect(getFolderRef({ mode: 'folder', key: 'uuid-key' })).toBe('folder:uuid-key');
    expect(getFolderRef({ mode: 'folder', key: '', id: 'legacy-id' })).toBe('folder:legacy-id');
    expect(getFolderRef({ mode: 'normal', key: 'alice' })).toBeNull();
  });
});

describe('buildFolderInfoMap', () => {
  it('builds a normalized folder info map for lorebook arrays', () => {
    const entries: LorebookEntry[] = [
      { comment: 'Characters', key: 'uuid-key', mode: 'folder', content: '' },
      { comment: 'Alice', key: 'alice', mode: 'normal', folder: 'uuid-key', content: 'hero' },
      { comment: 'Legacy Folder', key: '', id: 'legacy-id', mode: 'folder', content: '' },
    ];

    const folderInfo = buildFolderInfoMap(entries);

    expect(Array.from(folderInfo.keys())).toEqual(['folder:uuid-key', 'folder:legacy-id']);
    expect(folderInfo.get('folder:uuid-key')).toMatchObject({
      name: 'Characters',
      uuid: 'uuid-key',
      index: 0,
    });
    expect(folderInfo.get('folder:legacy-id')).toMatchObject({
      name: 'Legacy Folder',
      uuid: 'legacy-id',
      index: 2,
    });
  });
});

describe('resolveLorebookFolderRef', () => {
  it('resolves legacy child refs to the canonical key-based folder ref when both key and id exist', () => {
    const entries: LorebookEntry[] = [
      { comment: 'Characters', key: 'canonical-uuid', id: 'legacy-id', mode: 'folder', content: '' },
      { comment: 'Alice', key: 'alice', mode: 'normal', folder: 'folder:legacy-id', content: 'hero' },
    ];

    expect(resolveLorebookFolderRef('folder:legacy-id', entries)).toBe('folder:canonical-uuid');
    expect(resolveLorebookFolderRef('legacy-id', entries)).toBe('folder:canonical-uuid');
  });
});

describe('canonicalizeLorebookFolderRefs', () => {
  it('rewrites legacy child refs to the canonical key-based folder ref', () => {
    const entries: LorebookEntry[] = [
      { comment: 'Characters', key: 'canonical-uuid', id: 'legacy-id', mode: 'folder', content: '' },
      { comment: 'Alice', key: 'alice', mode: 'normal', folder: 'folder:legacy-id', content: 'hero' },
    ];

    canonicalizeLorebookFolderRefs(entries);

    expect(entries[0].key).toBe('canonical-uuid');
    expect(entries[1].folder).toBe('folder:canonical-uuid');
  });
});
