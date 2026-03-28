import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app-store';

describe('app-store pluniCategory', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('defaults pluniCategory to "solo"', () => {
    const store = useAppStore();
    expect(store.pluniCategory).toBe('solo');
  });

  it('setPluniCategory updates the reactive state', () => {
    const store = useAppStore();
    store.setPluniCategory('world-sim');
    expect(store.pluniCategory).toBe('world-sim');

    store.setPluniCategory('multi-char');
    expect(store.pluniCategory).toBe('multi-char');
  });

  it('setPluniCategory keeps other fields unchanged', () => {
    const store = useAppStore();
    store.setDarkMode(true);
    store.setRpMode('pluni');

    store.setPluniCategory('world-sim');

    expect(store.darkMode).toBe(true);
    expect(store.rpMode).toBe('pluni');
    expect(store.pluniCategory).toBe('world-sim');
  });
});
