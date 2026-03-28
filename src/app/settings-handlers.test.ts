import { describe, expect, it } from 'vitest';
import { getRpLabel } from './settings-handlers';

describe('settings-handlers', () => {
  it('getRpLabel returns correct label for pluni mode', () => {
    expect(getRpLabel('pluni')).toBe('플루니 연구소');
  });

  it('getRpLabel still returns correct labels for existing modes', () => {
    expect(getRpLabel('off')).toBe('OFF');
    expect(getRpLabel('toki')).toBe('토키');
    expect(getRpLabel('aris')).toBe('아리스');
    expect(getRpLabel('custom')).toBe('커스텀');
  });
});
