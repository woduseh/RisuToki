import { describe, expect, it } from 'vitest';
import {
  coerceTerminalGeometry,
  formatTerminalStatusLine,
  shouldTreatTerminalDataAsActivity
} from './terminal-ui';

describe('terminal-ui helpers', () => {
  it('filters terminal echo activity using the configured window', () => {
    expect(shouldTreatTerminalDataAsActivity(1000, 1200, 300)).toBe(false);
    expect(shouldTreatTerminalDataAsActivity(1000, 1401, 300)).toBe(true);
  });

  it('formats terminal status lines consistently', () => {
    expect(formatTerminalStatusLine({ message: '복구 완료' })).toBe('\r\n[복구 완료]');
    expect(formatTerminalStatusLine({ message: '복구 완료', detail: 'pwsh.exe' })).toBe('\r\n[복구 완료 (pwsh.exe)]');
  });

  it('falls back to safe terminal dimensions when layout is not ready yet', () => {
    expect(coerceTerminalGeometry(0, 0)).toEqual({ cols: 80, rows: 24 });
    expect(coerceTerminalGeometry(10, 1)).toEqual({ cols: 80, rows: 24 });
    expect(coerceTerminalGeometry(120, 30)).toEqual({ cols: 120, rows: 30 });
  });
});
