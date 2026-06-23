import { describe, expect, it } from 'vitest';
import { convertSillyTavernWorldInfoToLorebook, isSillyTavernWorldInfo } from './sillytavern-world-info';

describe('SillyTavern world_info conversion', () => {
  it('detects and converts object-shaped entries', () => {
    const input = {
      entries: {
        2: {
          comment: 'Later',
          key: ['later'],
          content: 'Later content',
          displayIndex: 2,
        },
        1: {
          comment: 'Castle',
          key: ['castle', 'keep'],
          keysecondary: ['north'],
          content: 'A northern keep.',
          constant: true,
          selective: true,
          insertion_order: 40,
          displayIndex: 1,
          probability: 55,
          position: 'before_char',
          depth: 3,
          uid: 'castle-id',
        },
      },
    };

    expect(isSillyTavernWorldInfo(input)).toBe(true);
    const entries = convertSillyTavernWorldInfoToLorebook(input);

    expect(entries[0]).toMatchObject({
      id: 'castle-id',
      comment: 'Castle',
      key: 'castle, keep',
      secondkey: 'north',
      content: 'A northern keep.',
      alwaysActive: true,
      constant: true,
      selective: true,
      insertorder: 40,
      order: 1,
      activationPercent: 55,
      position: 'before_char',
      depth: 3,
    });
    expect(entries[1].comment).toBe('Later');
  });

  it('converts array-shaped entries and maps disabled entries to zero activation', () => {
    const entries = convertSillyTavernWorldInfoToLorebook({
      entries: [
        {
          name: 'Rumor',
          key: 'rumor, gossip',
          secondary_keys: 'tavern',
          content: 'A rumor spreads.',
          order: 5,
          probability: 25,
        },
        {
          name: 'Disabled Secret',
          key: ['secret'],
          content: 'Hidden.',
          disabled: true,
          probability: 90,
        },
      ],
    });

    expect(entries[0]).toMatchObject({
      comment: 'Disabled Secret',
      key: 'secret',
      disable: true,
      activationPercent: 0,
    });
    expect(entries[1]).toMatchObject({
      comment: 'Rumor',
      key: 'rumor, gossip',
      secondkey: 'tavern',
      insertorder: 5,
      activationPercent: 25,
    });
  });
});
