import { describe, expect, it, vi } from 'vitest';
import { createExternalTextTabState } from './external-text-tab';

describe('external text tab state', () => {
  it('returns the initial value and keeps the latest edit in memory', () => {
    const persist = vi.fn();
    const state = createExternalTextTabState('hello', persist);

    expect(state.getValue()).toBe('hello');

    state.setValue('updated');

    expect(state.getValue()).toBe('updated');
    expect(persist).toHaveBeenCalledWith('updated');
  });

  it('normalizes nullish initial values to an empty string', () => {
    const state = createExternalTextTabState(null, vi.fn());

    expect(state.getValue()).toBe('');
  });
});
