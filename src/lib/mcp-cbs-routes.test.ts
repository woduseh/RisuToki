import { describe, expect, it } from 'vitest';

import { collectCbsEntries, normalizeCbsToggles } from './mcp-cbs-routes';

describe('collectCbsEntries', () => {
  it('scans supported fields, greetings, and lorebook content for CBS markers', () => {
    expect(
      collectCbsEntries({
        description: 'Plain text',
        globalNote: '{{#when toggle_mode::1}}Enabled{{/when}}',
        alternateGreetings: ['Hi {{getglobalvar::toggle_greet}}'],
        lorebook: [{ content: 'Lore {{#when toggle_lore::1}}Entry{{/when}}' }],
      }),
    ).toEqual([
      { path: 'globalNote', text: '{{#when toggle_mode::1}}Enabled{{/when}}' },
      { path: 'alternateGreetings[0]', text: 'Hi {{getglobalvar::toggle_greet}}' },
      { path: 'lorebook[0].content', text: 'Lore {{#when toggle_lore::1}}Entry{{/when}}' },
    ]);
  });

  it('supports direct field and lorebook filters', () => {
    const currentData = {
      description: '{{#when toggle_desc::1}}Description CBS{{/when}}',
      lorebook: [{ content: 'Lore {{getglobalvar::toggle_lore}}' }],
    };

    expect(collectCbsEntries(currentData, 'description')).toEqual([
      { path: 'description', text: '{{#when toggle_desc::1}}Description CBS{{/when}}' },
    ]);
    expect(collectCbsEntries(currentData, 'lorebook[0].content')).toEqual([
      { path: 'lorebook[0].content', text: 'Lore {{getglobalvar::toggle_lore}}' },
    ]);
    expect(collectCbsEntries(currentData, undefined, 0)).toEqual([
      { path: 'lorebook[0].content', text: 'Lore {{getglobalvar::toggle_lore}}' },
    ]);
  });

  it('returns an empty list for out-of-range lorebook indices or non-CBS text', () => {
    expect(
      collectCbsEntries({
        description: 'No CBS here',
        lorebook: [{ content: 'Still no CBS' }],
      }),
    ).toEqual([]);
    expect(
      collectCbsEntries(
        {
          lorebook: [{ content: '{{#when toggle_lore::1}}Lore{{/when}}' }],
        },
        undefined,
        99,
      ),
    ).toEqual([]);
  });
});

describe('normalizeCbsToggles', () => {
  it('adds toggle_ prefixes while preserving existing normalized keys', () => {
    expect(
      normalizeCbsToggles({
        mood: 'happy',
        toggle_theme: 'dark',
        count: 1,
      }),
    ).toEqual({
      toggle_mood: 'happy',
      toggle_theme: 'dark',
      toggle_count: '1',
    });
  });
});
