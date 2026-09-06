import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMcpActivityStore } from './mcp-activity-store';
import type { McpActivityEvent, McpActivitySnapshot } from '../lib/mcp-activity-types';

function event(sequence: number, status: McpActivityEvent['status'] = 'running'): McpActivityEvent {
  return {
    sequence,
    requestId: 'one',
    startedAt: 1,
    method: 'GET',
    route: '/fields',
    category: 'read',
    status,
    target: { kind: 'active', documentId: 'doc' },
  };
}

beforeEach(() => setActivePinia(createPinia()));

describe('MCP activity subscriptions', () => {
  it('does not let a late snapshot roll a completed stream event back to running', async () => {
    let resolveSnapshot!: (snapshot: McpActivitySnapshot) => void;
    let listener!: (value: McpActivityEvent) => void;
    const unsubscribe = vi.fn();
    Object.defineProperty(window, 'tokiAPI', {
      configurable: true,
      value: {
        getMcpActivity: vi.fn(
          () =>
            new Promise<McpActivitySnapshot>((resolve) => {
              resolveSnapshot = resolve;
            }),
        ),
        onMcpActivity: vi.fn((callback: typeof listener) => {
          listener = callback;
          return unsubscribe;
        }),
      },
    });
    const store = useMcpActivityStore();
    const started = store.start();
    listener(event(2, 'succeeded'));
    resolveSnapshot({ sequence: 1, entries: [event(1)] });
    await started;
    expect(store.entries[0].status).toBe('succeeded');
    expect(store.entries[0].sequence).toBe(2);
    store.stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('shares one subscription across consumers and ignores snapshots after the last consumer stops', async () => {
    let resolveSnapshot!: (snapshot: McpActivitySnapshot) => void;
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    Object.defineProperty(window, 'tokiAPI', {
      configurable: true,
      value: {
        getMcpActivity: () =>
          new Promise<McpActivitySnapshot>((resolve) => {
            resolveSnapshot = resolve;
          }),
        onMcpActivity: subscribe,
      },
    });
    const store = useMcpActivityStore();
    const started = store.start();
    await store.start();
    store.stop();
    expect(unsubscribe).not.toHaveBeenCalled();
    store.stop();
    expect(subscribe).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    resolveSnapshot({ sequence: 1, entries: [event(1)] });
    await started;
    expect(store.entries).toEqual([]);
  });

  it('keeps only the most recent 80 requests', async () => {
    Object.defineProperty(window, 'tokiAPI', {
      configurable: true,
      value: {
        getMcpActivity: async () => ({
          sequence: 90,
          entries: Array.from({ length: 90 }, (_, index) => ({ ...event(index + 1), requestId: `request-${index}` })),
        }),
        onMcpActivity: () => () => {},
      },
    });
    const store = useMcpActivityStore();
    await store.start();
    expect(store.entries).toHaveLength(80);
    expect(store.entries[0].sequence).toBe(90);
    store.stop();
  });
});
