// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumePreview,
  rememberPreview,
  FACADE_PREVIEW_TTL_MS,
  type ManageItemsPreviewEntry,
} from './mcp-facade-runtime';

function fixture() {
  const store = new Map<string, ManageItemsPreviewEntry>();
  const target = { kind: 'active' as const };
  const lease = rememberPreview(store, {
    target,
    operationDigest: 'reviewed-digest',
    family: 'lorebook' as const,
    operation: { action: 'reorder_items' as const, order: [1, 0] },
    routes: [],
    touchedTargets: ['lorebook'],
    requiredGuards: [],
  });
  return { store, target, ...lease };
}
afterEach(() => vi.restoreAllMocks());

describe('preview token lifecycle', () => {
  it.each(['digest', 'target', 'family'] as const)(
    'does not consume a reviewed operation after a %s mismatch',
    (mismatch) => {
      const f = fixture();
      const result = consumePreview(
        f.store,
        f.token,
        mismatch === 'digest' ? 'different' : 'reviewed-digest',
        mismatch === 'target' ? { kind: 'external', file_path: '/other.charx' } : f.target,
        (entry) => entry.family === (mismatch === 'family' ? 'regex' : 'lorebook'),
      );
      expect(result).toEqual({ kind: 'mismatch' });
      expect(f.store.has(f.token)).toBe(true);
      const valid = consumePreview(f.store, f.token, 'reviewed-digest', f.target);
      expect(valid.kind).toBe('ready');
      expect(f.store.has(f.token)).toBe(false);
      expect(consumePreview(f.store, f.token, 'reviewed-digest', f.target)).toEqual({ kind: 'missing' });
    },
  );

  it('expires at the advertised boundary even without a prior cleanup', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const f = fixture();
    expect(f.expiresAtMs).toBe(1000 + FACADE_PREVIEW_TTL_MS);
    expect(f.token).toMatch(/^facade-preview-v1\.[A-Za-z0-9_-]{24}$/);
    now.mockReturnValue(f.expiresAtMs);
    expect(consumePreview(f.store, f.token, 'reviewed-digest', f.target)).toEqual({ kind: 'missing' });
    expect(f.store.size).toBe(0);
  });

  it('consumes before asynchronous mutation or binding checks can yield', async () => {
    const f = fixture();
    const apply = vi.fn();
    const run = async () => {
      const consumed = consumePreview(f.store, f.token, 'reviewed-digest', f.target);
      if (consumed.kind !== 'ready') return consumed.kind;
      await Promise.resolve();
      apply(consumed.entry.operation);
      return 'applied';
    };
    expect(await Promise.all([run(), run()])).toEqual(['applied', 'missing']);
    expect(apply).toHaveBeenCalledOnce();
  });
});
