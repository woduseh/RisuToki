import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildRefsSidebar, openRefTabById, _resetBuildVersion } from './sidebar-refs';
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

  it('renders structured reference parity items for charx and risup files', async () => {
    const container = document.getElementById('sidebar-refs')!;
    const refs = [
      {
        fileName: 'card.charx',
        data: {
          creatorcomment: 'creator note',
          characterVersion: '1.2.3',
          alternateGreetings: ['hello there'],
          groupOnlyGreetings: ['group hello'],
          triggerScripts: '[{"comment":"main","type":"input","conditions":[],"effect":[]}]',
        },
      },
      {
        fileName: 'preset.risup',
        fileType: 'risup' as const,
        data: {
          _fileType: 'risup',
          description: 'preset description',
        },
      },
    ];
    const deps = createMockDeps(0);
    deps.getReferenceFiles = () => refs as never[];
    deps.syncReferenceFiles = vi.fn().mockResolvedValue(refs as never[]);

    await buildRefsSidebar(container, deps);

    expect(container.querySelector('[data-label="제작자 노트"]')).not.toBeNull();
    expect(container.querySelector('[data-label="캐릭터 버전"]')).not.toBeNull();
    expect(container.querySelector('[data-label="인사말 1"]')).not.toBeNull();
    expect(container.querySelector('[data-label="트리거 스크립트"]')).not.toBeNull();
    expect([...container.querySelectorAll('.tree-item')].some((el) => el.textContent?.includes('기본'))).toBe(true);
  });
});

describe('openRefTabById', () => {
  it('opens greeting, trigger, and risup reference tabs in read-only mode', () => {
    const referenceFiles = [
      {
        fileName: 'card.charx',
        data: {
          alternateGreetings: ['hello there'],
          triggerScripts: '[{"comment":"main","type":"input","conditions":[],"effect":[]}]',
        },
      },
      {
        fileName: 'preset.risup',
        fileType: 'risup' as const,
        data: {
          _fileType: 'risup',
          description: 'preset description',
        },
      },
    ];
    const openTab = vi.fn().mockImplementation((id: string) => ({ id }));
    const deps = {
      getReferenceFiles: () => referenceFiles as never[],
      openTab,
      findOpenTab: vi.fn().mockReturnValue(undefined),
      activateTab: vi.fn(),
    };

    openRefTabById('ref_0_greeting_alternate_0', deps);
    expect(openTab).toHaveBeenNthCalledWith(
      1,
      'ref_0_greeting_alternate_0',
      '[참고] card.charx - 인사말 1',
      'html',
      expect.any(Function),
      null,
    );

    openRefTabById('ref_0_triggerScripts', deps);
    const triggerCall = openTab.mock.calls[1];
    expect(triggerCall[0]).toBe('ref_0_triggerScripts');
    expect(triggerCall[2]).toBe('_triggerform');
    expect(triggerCall[4]).toBeNull();
    expect(triggerCall[3]()).toEqual(expect.objectContaining({ triggers: expect.any(Array) }));

    openRefTabById('ref_1_risup_templates', deps);
    const risupTab = openTab.mock.results[2]?.value as { _risupGroupId?: string };
    expect(openTab.mock.calls[2][2]).toBe('_risupform');
    expect(risupTab._risupGroupId).toBe('templates');
  });
});
