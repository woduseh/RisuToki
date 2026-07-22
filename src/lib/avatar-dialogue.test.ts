import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_DIALOGUE, getAvatarDialogueLine, getAvatarDialogueLines } from './avatar-dialogue';
import type { BuiltInThemeId } from './theme-registry';

const THEME_ORDER: BuiltInThemeId[] = [
  'toki',
  'aris',
  'kei',
  'yuzu',
  'midori',
  'momoi',
  'yuuka',
  'hina',
  'mika',
  'kisaki',
];

describe('character avatar dialogue', () => {
  it('provides distinct idle and working lines for every built-in theme', () => {
    expect(Object.keys(CHARACTER_DIALOGUE)).toEqual(THEME_ORDER);

    for (const themeId of THEME_ORDER) {
      expect(CHARACTER_DIALOGUE[themeId].idle).toHaveLength(4);
      expect(CHARACTER_DIALOGUE[themeId].working).toHaveLength(4);
    }

    expect(CHARACTER_DIALOGUE.toki.idle).not.toEqual(CHARACTER_DIALOGUE.kisaki.idle);
    expect(CHARACTER_DIALOGUE.aris.working).not.toEqual(CHARACTER_DIALOGUE.yuuka.working);
  });

  it('uses the Toki or Aris voice as the custom-theme mode fallback', () => {
    expect(getAvatarDialogueLines('custom', false, false)).toBe(CHARACTER_DIALOGUE.toki.idle);
    expect(getAvatarDialogueLines('custom', true, true)).toBe(CHARACTER_DIALOGUE.aris.working);
  });

  it('selects a line from the requested character and activity state', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(getAvatarDialogueLine('kisaki', true, false)).toBe('다음 안건이 무엇인지 조용히 들어보지요.');
    expect(getAvatarDialogueLine('momoi', false, true)).toBe('좋아, 거침없이 터미널을 돌리는 중이야!');

    vi.restoreAllMocks();
  });
});
