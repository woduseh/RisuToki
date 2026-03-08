import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The module caches DOM element refs. We must reset the module between tests
// so each test gets a fresh lookup against the newly-created DOM elements.
let setStatus: typeof import('./status-bar').setStatus;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();

  // Create the DOM elements that setStatus expects
  const bar = document.createElement('div');
  bar.id = 'statusbar';
  const span = document.createElement('span');
  span.id = 'status-text';
  bar.appendChild(span);
  document.body.appendChild(bar);

  const mod = await import('./status-bar');
  setStatus = mod.setStatus;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setStatus', () => {
  it('sets the text content of the status span', () => {
    setStatus('Hello');
    expect(document.getElementById('status-text')!.textContent).toBe('Hello');
  });

  it('adds the "visible" class to the status bar', () => {
    setStatus('msg');
    expect(document.getElementById('statusbar')!.classList.contains('visible')).toBe(true);
  });

  it('removes "visible" class after 3 seconds', () => {
    setStatus('temp');
    const bar = document.getElementById('statusbar')!;
    expect(bar.classList.contains('visible')).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(bar.classList.contains('visible')).toBe(false);
  });

  it('resets the timer when called again before timeout', () => {
    setStatus('first');
    vi.advanceTimersByTime(2000);
    setStatus('second');
    vi.advanceTimersByTime(2000);
    // Only 2s since last call — still visible
    const bar = document.getElementById('statusbar')!;
    expect(bar.classList.contains('visible')).toBe(true);
    expect(document.getElementById('status-text')!.textContent).toBe('second');
    vi.advanceTimersByTime(1000);
    // Now 3s since last call — hidden
    expect(bar.classList.contains('visible')).toBe(false);
  });

  it('updates text on consecutive calls', () => {
    setStatus('a');
    setStatus('b');
    setStatus('c');
    expect(document.getElementById('status-text')!.textContent).toBe('c');
  });
});
