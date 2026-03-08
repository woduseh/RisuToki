import { describe, expect, it } from 'vitest';
import { ccv3ArrayToRisu, risuArrayToCCV3 } from './lorebook-convert';

describe('lorebook conversion helpers', () => {
  it('converts risu entries to CCV3 entries with split keys and folder metadata', () => {
    expect(risuArrayToCCV3([
      {
        key: 'hero, student',
        secondkey: 'academy',
        comment: 'Main Hero',
        content: 'Lore text',
        insertorder: 150,
        alwaysActive: true,
        selective: true,
        mode: 'folder',
        folder: 'folder:abc'
      }
    ])).toEqual([
      expect.objectContaining({
        keys: ['hero', 'student'],
        secondary_keys: ['academy'],
        name: 'Main Hero',
        comment: 'Main Hero',
        content: 'Lore text',
        insertion_order: 150,
        priority: 150,
        constant: true,
        selective: true,
        mode: 'folder',
        folder: 'folder:abc'
      })
    ]);
  });

  it('converts CCV3 entries back to risu format with joined keys', () => {
    expect(ccv3ArrayToRisu([
      {
        keys: ['alpha', 'beta'],
        secondary_keys: ['gamma'],
        comment: 'Entry',
        content: 'Converted',
        insertion_order: 77,
        constant: true,
        selective: true,
        folder: 'folder:def'
      }
    ])).toEqual([
      {
        key: 'alpha, beta',
        secondkey: 'gamma',
        comment: 'Entry',
        content: 'Converted',
        mode: 'normal',
        insertorder: 77,
        alwaysActive: true,
        selective: true,
        folder: 'folder:def'
      }
    ]);
  });
});
