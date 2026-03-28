import { describe, expect, it } from 'vitest';
import {
  coerceTerminalGeometry,
  createInputDispatcher,
  formatTerminalStatusLine,
  shouldTreatTerminalDataAsActivity,
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

describe('createInputDispatcher', () => {
  const flush = () => new Promise<void>((r) => setTimeout(r, 10));

  it('forwards data immediately when no gate is active', () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));
    dispatcher.dispatch('a');
    dispatcher.dispatch('b');
    expect(forwarded).toEqual(['a', 'b']);
  });

  it('holds gated input until gate resolves', async () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));

    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });

    dispatcher.dispatch('\r', gate);
    expect(forwarded).toEqual([]);

    resolve();
    await flush();
    expect(forwarded).toEqual(['\r']);
  });

  it('queues subsequent inputs behind an active gate', async () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));

    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });

    dispatcher.dispatch('\r', gate);
    dispatcher.dispatch('n');
    dispatcher.dispatch('e');
    expect(forwarded).toEqual([]);

    resolve();
    await flush();
    expect(forwarded).toEqual(['\r', 'n', 'e']);
  });

  it('resumes immediate forwarding after gate drains', async () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));

    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });

    dispatcher.dispatch('\r', gate);
    resolve();
    await flush();
    expect(forwarded).toEqual(['\r']);

    // Subsequent dispatch should be immediate (sync path)
    dispatcher.dispatch('x');
    expect(forwarded).toEqual(['\r', 'x']);
  });

  it('still forwards data when gate rejects', async () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));

    const gate = Promise.reject(new Error('prep failed'));
    dispatcher.dispatch('\r', gate);

    await flush();
    expect(forwarded).toEqual(['\r']);
  });

  it('handles consecutive gates correctly', async () => {
    const forwarded: string[] = [];
    const dispatcher = createInputDispatcher((d) => forwarded.push(d));

    let resolve1!: () => void;
    const gate1 = new Promise<void>((r) => {
      resolve1 = r;
    });
    let resolve2!: () => void;
    const gate2 = new Promise<void>((r) => {
      resolve2 = r;
    });

    dispatcher.dispatch('a', gate1);
    dispatcher.dispatch('b', gate2);

    resolve1();
    await flush();
    // 'a' forwarded, but 'b' is still gated
    expect(forwarded).toContain('a');

    resolve2();
    await flush();
    expect(forwarded).toEqual(['a', 'b']);
  });
});
