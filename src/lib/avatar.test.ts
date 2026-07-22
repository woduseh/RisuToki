import { describe, expect, it } from 'vitest';
import { getAvatarAssetsForTheme, getBuiltInAvatarOptions, loadAvatarImage } from './avatar';

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
    expect(getAvatarAssetsForTheme('toki', false).idle).toContain('avatar-toki-idle.webp');
    expect(getAvatarAssetsForTheme('aris', true).working).toContain('avatar-aris-working.webp');
    expect(getAvatarAssetsForTheme('kei', false).idle).toContain('avatar-kei-idle.webp');
    expect(getAvatarAssetsForTheme('momoi', false).working).toContain('avatar-momoi-working.webp');
    expect(getAvatarAssetsForTheme('kisaki', true).idle).toContain('avatar-kisaki-idle.webp');
    expect(getAvatarAssetsForTheme('custom', false).idle).toContain('avatar-toki-idle.webp');
    expect(getAvatarAssetsForTheme('custom', true).idle).toContain('avatar-aris-idle.webp');
  });

  it('restarts animated WebP images without corrupting existing query parameters', () => {
    const image = document.createElement('img');

    loadAvatarImage('app-assets/avatar-toki-idle.webp?variant=default', image);

    expect(image.src).toContain('avatar-toki-idle.webp?variant=default&t=');
  });
});
