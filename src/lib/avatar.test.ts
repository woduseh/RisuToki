import { describe, expect, it } from 'vitest';
import { getAvatarAssetsForTheme, getBuiltInAvatarOptions } from './avatar';

describe('theme avatar assets', () => {
  it('provides idle and working animations for every character theme', () => {
    const options = getBuiltInAvatarOptions();

    expect(options.map((option) => option.id)).toEqual([
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
    ]);
    for (const option of options) {
      expect(option.assets.idle).toBeTruthy();
      expect(option.assets.working).toBeTruthy();
    }
  });

  it('uses the matching character for built-in themes and mode fallback for custom themes', () => {
    expect(getAvatarAssetsForTheme('kisaki', true).idle).toContain('avatar-kisaki-idle.gif');
    expect(getAvatarAssetsForTheme('custom', false).idle).toContain('icon.png');
    expect(getAvatarAssetsForTheme('custom', true).idle).toContain('icon_risu.png');
  });
});
