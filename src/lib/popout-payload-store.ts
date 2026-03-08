interface PopoutPayloadStoreOptions {
  timeoutMs?: number;
}

interface PayloadEntry {
  requestId: string;
  data: unknown;
}

interface Waiter {
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface PopoutPayloadStore {
  clear: (type: string, requestId?: string) => void;
  peek: (type: string) => PayloadEntry | null;
  prepare: (type: string, data: unknown) => string;
  waitFor: (type: string, requestId: string, timeoutMs?: number) => Promise<unknown>;
}

export function createPopoutPayloadStore(options: PopoutPayloadStoreOptions = {}): PopoutPayloadStore {
  const defaultTimeoutMs = options.timeoutMs ?? 5000;
  const entries = new Map<string, PayloadEntry>();
  const waiters = new Map<string, Waiter[]>();
  let nextId = 0;

  function buildKey(type: string, requestId: string): string {
    return `${type}:${requestId}`;
  }

  function resolveWaiters(type: string, requestId: string, data: unknown): void {
    const key = buildKey(type, requestId);
    const pending = waiters.get(key);
    if (!pending) return;
    waiters.delete(key);
    for (const waiter of pending) {
      clearTimeout(waiter.timer);
      waiter.resolve(data);
    }
  }

  function prepare(type: string, data: unknown): string {
    const requestId = `${type}-${++nextId}`;
    entries.set(type, { requestId, data });
    resolveWaiters(type, requestId, data);
    return requestId;
  }

  function peek(type: string): PayloadEntry | null {
    return entries.get(type) || null;
  }

  function clear(type: string, requestId?: string): void {
    const entry = entries.get(type);
    if (!entry) return;
    if (requestId && entry.requestId !== requestId) return;
    entries.delete(type);
  }

  function waitFor(type: string, requestId: string, timeoutMs: number = defaultTimeoutMs): Promise<unknown> {
    const entry = entries.get(type);
    if (entry && entry.requestId === requestId) {
      return Promise.resolve(entry.data);
    }
    if (!requestId) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const key = buildKey(type, requestId);
      const timer = setTimeout(() => {
        const pending = waiters.get(key) || [];
        waiters.set(key, pending.filter((waiter) => waiter.resolve !== resolve));
        resolve(null);
      }, timeoutMs);

      const pending = waiters.get(key) || [];
      pending.push({ resolve, timer });
      waiters.set(key, pending);
    });
  }

  return {
    clear,
    peek,
    prepare,
    waitFor
  };
}
