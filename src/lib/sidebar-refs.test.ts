import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildRefsSidebar, _resetBuildVersion } from './sidebar-refs';
import type { RefsSidebarDeps } from './sidebar-refs';

/**
 * Creates a minimal mock of RefsSidebarDeps.
 * `syncDelay` controls how long syncReferenceFiles takes (ms).
 */
function createMockDeps(syncDelay = 10): RefsSidebarDeps {
  return {
    getReferenceFiles: () => [],
    syncReferenceFiles: () => new Promise((resolve) => setTimeout(() => resolve([]), syncDelay)),
    showContextMenu: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn().mockResolvedValue(null),
    setStatus: vi.fn(),
    openTab: vi.fn().mockReturnValue(null),
    findOpenTab: vi.fn().mockReturnValue(undefined),
    activateTab: vi.fn(),
    closeTab: vi.fn(),
    openExternalTextTab: vi.fn(),
    openReference: vi.fn().mockResolvedValue(null),
    removeReference: vi.fn().mockResolvedValue(undefined),
    removeAllReferences: vi.fn().mockResolvedValue(undefined),
    listGuides: vi.fn().mockResolvedValue({ builtIn: ['guide1.md'], session: [] }),
    readGuide: vi.fn().mockResolvedValue(''),
    writeGuide: vi.fn().mockResolvedValue(undefined),
    deleteGuide: vi.fn().mockResolvedValue(undefined),
    importGuide: vi.fn().mockResolvedValue([]),
    getGuidesPath: vi.fn().mockResolvedValue(null),
  };
}

describe('buildRefsSidebar race-condition guard', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="sidebar-refs"></div>';
    _resetBuildVersion();
  });

  it('single build should populate guides', async () => {
    const container = document.getElementById('sidebar-refs')!;
    const deps = createMockDeps(0);
    await buildRefsSidebar(container, deps);
    // Should have guide folder with at least one child item
    const items = container.querySelectorAll('[data-label]');
    expect(items.length).toBeGreaterThan(0);
  });

  it('concurrent builds should NOT duplicate items', async () => {
    const container = document.getElementById('sidebar-refs')!;
    const deps = createMockDeps(50); // 50ms delay on syncReferenceFiles

    // Fire two concurrent builds without awaiting first
    const buildA = buildRefsSidebar(container, deps);
    const buildB = buildRefsSidebar(container, deps);
    await Promise.all([buildA, buildB]);

    // Count guide items — should NOT be doubled
    const guideItems = container.querySelectorAll('[data-label="guide1.md"]');
    expect(guideItems.length).toBeLessThanOrEqual(1);
  });

  it('stale build should bail out after version mismatch', async () => {
    const container = document.getElementById('sidebar-refs')!;
    // First build takes long, second is fast
    const slowDeps = createMockDeps(100);
    const fastDeps = createMockDeps(0);

    const stale = buildRefsSidebar(container, slowDeps);

    // Start a new build immediately — this supersedes the first
    await buildRefsSidebar(container, fastDeps);

    // Slow build should bail out and NOT add duplicates
    await stale;
    const guideItems = container.querySelectorAll('[data-label="guide1.md"]');
    expect(guideItems.length).toBeLessThanOrEqual(1);
  });
});
