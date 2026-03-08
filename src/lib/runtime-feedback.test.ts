import { describe, it, expect, vi } from 'vitest';
import { errorToMessage, reportRuntimeError } from './runtime-feedback';

// ── errorToMessage ──────────────────────────────────────────────────────────

describe('errorToMessage', () => {
  it('extracts message from an Error instance', () => {
    expect(errorToMessage(new Error('boom'))).toBe('boom');
  });

  it('returns the string directly when error is a non-empty string', () => {
    expect(errorToMessage('something broke')).toBe('something broke');
  });

  it('returns the fallback for null', () => {
    expect(errorToMessage(null, 'fallback')).toBe('fallback');
  });

  it('returns the fallback for undefined', () => {
    expect(errorToMessage(undefined, 'fb')).toBe('fb');
  });

  it('returns the fallback for a whitespace-only string', () => {
    expect(errorToMessage('   ', 'default')).toBe('default');
  });

  it('returns the default fallback when none is provided', () => {
    expect(errorToMessage(42)).toBe('알 수 없는 오류');
  });

  it('uses fallback when Error.message is empty', () => {
    expect(errorToMessage(new Error(''), 'empty-err')).toBe('empty-err');
  });
});

// ── reportRuntimeError ──────────────────────────────────────────────────────

describe('reportRuntimeError', () => {
  it('returns the error message string', () => {
    const msg = reportRuntimeError({ context: 'test', error: new Error('fail') });
    expect(msg).toBe('fail');
  });

  it('logs a warning via console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reportRuntimeError({ context: 'ctx', error: 'oops' });
    expect(spy).toHaveBeenCalledWith('[Runtime] ctx:', 'oops');
    spy.mockRestore();
  });

  it('uses a custom logPrefix', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reportRuntimeError({ context: 'c', error: 'e', logPrefix: '[Custom]' });
    expect(spy).toHaveBeenCalledWith('[Custom] c:', 'e');
    spy.mockRestore();
  });

  it('calls setStatus with a composed message by default', () => {
    const setStatus = vi.fn();
    reportRuntimeError({ context: 'load', error: new Error('404'), setStatus });
    expect(setStatus).toHaveBeenCalledWith('load: 404');
  });

  it('calls setStatus with the custom statusMessage when provided', () => {
    const setStatus = vi.fn();
    reportRuntimeError({
      context: 'load',
      error: new Error('404'),
      setStatus,
      statusMessage: 'custom msg',
    });
    expect(setStatus).toHaveBeenCalledWith('custom msg');
  });

  it('does not throw when setStatus is null', () => {
    expect(() => reportRuntimeError({ context: 'x', error: 'y', setStatus: null })).not.toThrow();
  });

  it('uses fallbackMessage when the error is not an Error or string', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const msg = reportRuntimeError({
      context: 'op',
      error: 123,
      fallbackMessage: 'unknown',
    });
    expect(msg).toBe('unknown');
    spy.mockRestore();
  });
});
