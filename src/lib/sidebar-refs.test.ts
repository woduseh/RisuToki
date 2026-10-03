import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildRefsSidebar, openRefTabById, _resetBuildVersion } from './sidebar-refs';
import type { RefsSidebarDeps } from './sidebar-refs';

function createMockDeps(): RefsSidebarDeps {
  return {
    getReferenceFiles: () => [],
    syncReferenceFiles: vi.fn().mockResolvedValue([]),
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
    resolveGuidePath: vi.fn().mockResolvedValue(null),
  };
}

describe('buildRefsSidebar race-condition guard', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="sidebar-refs"></div>';
    _resetBuildVersion();
  });

  it('single build should populate guides', async () => {
    const container = document.getElementById('sidebar-refs')!;
    const deps = createMockDeps();
    await buildRefsSidebar(container, deps, 'guides');
    // Should have guide folder with at least one child item
    expect(container.querySelectorAll('[data-label="guide1.md"]')).toHaveLength(1);
  });

  it.each(['older-first', 'newer-first'] as const)(
    'keeps exactly the latest build when sync completes %s',
    async (order) => {
      const container = document.getElementById('sidebar-refs')!;
      let finishOlder!: () => void;
      let finishNewer!: () => void;
      const olderDeps = createMockDeps();
      const newerDeps = createMockDeps();
      olderDeps.syncReferenceFiles = () =>
        new Promise((resolve) => {
          finishOlder = () => resolve([]);
        });
      newerDeps.syncReferenceFiles = () =>
        new Promise((resolve) => {
          finishNewer = () => resolve([]);
        });
      olderDeps.listGuides = vi.fn().mockResolvedValue({ builtIn: ['stale.md'], session: [] });
      newerDeps.listGuides = vi.fn().mockResolvedValue({ builtIn: ['current.md'], session: [] });
      const older = buildRefsSidebar(container, olderDeps, 'guides');
      const newer = buildRefsSidebar(container, newerDeps, 'guides');

      if (order === 'older-first') {
        finishOlder();
        await older;
        finishNewer();
        await newer;
      } else {
        finishNewer();
        await newer;
        finishOlder();
        await older;
      }

      expect(container.querySelectorAll('[data-label="current.md"]')).toHaveLength(1);
      expect(container.querySelector('[data-label="stale.md"]')).toBeNull();
    },
  );

  it('renders guide and file views without a nested tab row and supports drill-in workspaces', async () => {
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
          promptTemplate: '[{"type":"plain","text":"Reference prompt"}]',
        },
      },
    ];
    const deps = createMockDeps();
    deps.getReferenceFiles = () => refs as never[];
    deps.syncReferenceFiles = vi.fn().mockResolvedValue(refs as never[]);

    await buildRefsSidebar(container, deps, 'guides');
    expect(container.querySelector('[data-label="guide1.md"]')).not.toBeNull();
    expect(container.querySelector('.reference-subtabs')).toBeNull();

    await buildRefsSidebar(container, deps, 'files');
    expect(container.querySelectorAll('.reference-file-row')).toHaveLength(2);

    (container.querySelectorAll('.reference-file-row')[0] as HTMLButtonElement).click();
    expect(
      [...container.querySelectorAll('.reference-workspace-tabs button')].map((button) => button.textContent),
    ).toEqual(['캐릭터', '메시지', '스크립트']);
    expect(container.querySelector('[data-label="제작자 코멘트"]')).not.toBeNull();
    expect(container.querySelector('[data-label="캐릭터 버전"]')).not.toBeNull();

    (
      [...container.querySelectorAll('.reference-workspace-tabs button')].find(
        (button) => button.textContent === '메시지',
      ) as HTMLButtonElement
    ).click();
    expect(container.querySelector('[data-label="인사말 1"]')).not.toBeNull();

    (
      [...container.querySelectorAll('.reference-workspace-tabs button')].find(
        (button) => button.textContent === '스크립트',
      ) as HTMLButtonElement
    ).click();
    expect(container.querySelector('[data-label="트리거 스크립트"]')).not.toBeNull();

    (container.querySelector('[aria-label="참고 파일 목록으로 돌아가기"]') as HTMLButtonElement).click();
    (container.querySelectorAll('.reference-file-row')[1] as HTMLButtonElement).click();
    expect(
      [...container.querySelectorAll('.reference-workspace-tabs button')].map((button) => button.textContent),
    ).toEqual(['기본', '프롬프트', '모델·API', '파라미터', '고급']);
    (
      [...container.querySelectorAll('.reference-workspace-tabs button')].find(
        (button) => button.textContent === '모델·API',
      ) as HTMLButtonElement
    ).click();
    expect(container.querySelector('[data-label="프로바이더/엔드포인트"]')).not.toBeNull();
    (
      [...container.querySelectorAll('.reference-workspace-tabs button')].find(
        (button) => button.textContent === '고급',
      ) as HTMLButtonElement
    ).click();
    expect(container.querySelector('[data-label="JSON 스키마"]')).not.toBeNull();
    expect(container.querySelector('[data-label="설명"]')).toBeNull();
  });

  it('keeps nested guide paths and presents reference paths as compact file rows', async () => {
    const container = document.getElementById('sidebar-refs')!;
    const deps = createMockDeps();
    deps.listGuides = vi.fn().mockResolvedValue({ builtIn: ['bot/guides/intro.md'], session: [] });
    const refs = [{ fileName: 'common/examples/card.charx', data: {} }];
    deps.getReferenceFiles = () => refs as never[];
    deps.syncReferenceFiles = vi.fn().mockResolvedValue(refs as never[]);

    await buildRefsSidebar(container, deps, 'guides');

    expect(container.querySelector('[data-label="bot"]')).not.toBeNull();
    expect(container.querySelector('[data-label="guides"]')).not.toBeNull();
    expect(container.querySelector('[data-label="intro.md"]')?.getAttribute('title')).toBe('bot/guides/intro.md');

    await buildRefsSidebar(container, deps, 'files');
    const row = container.querySelector('.reference-file-row') as HTMLButtonElement;
    expect(row.title).toBe('common/examples/card.charx');
    expect(row.querySelector('strong')?.textContent).toBe('card.charx');
    expect(container.querySelector('[data-label="common"]')).toBeNull();
  });

  it('uses the manager tree language for reference lorebooks without edit controls', async () => {
    const container = document.getElementById('sidebar-refs')!;
    const deps = createMockDeps();
    const refs = [
      {
        fileName: 'card.charx',
        data: {
          lorebook: [
            { mode: 'folder', key: 'folder:world', comment: '세계관' },
            { key: 'capital', comment: '수도', content: '도시 설명', folder: 'folder:world', alwaysActive: true },
            { key: 'root', comment: '루트 항목', content: '루트 설명', folder: '' },
          ],
        },
      },
    ];
    deps.getReferenceFiles = () => refs as never[];
    deps.syncReferenceFiles = vi.fn().mockResolvedValue(refs as never[]);

    await buildRefsSidebar(container, deps, 'files');
    (container.querySelector('.reference-file-row') as HTMLButtonElement).click();
    (
      [...container.querySelectorAll('.reference-workspace-tabs button')].find(
        (button) => button.textContent === '로어북',
      ) as HTMLButtonElement
    ).click();

    expect(container.querySelector('.reference-lorebook-list')).not.toBeNull();
    expect(container.querySelector('.reference-lorebook-folder .manager-folder-label')?.textContent).toBe('세계관');
    expect(container.querySelectorAll('.reference-lorebook-row')).toHaveLength(2);
    expect(container.querySelector('.reference-lorebook-row .manager-badge-accent')?.textContent).toBe('항상');
    expect(container.querySelector('.manager-check')).toBeNull();
    expect(container.querySelector('.manager-row-actions')).toBeNull();
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
          promptTemplate: '[{"type":"plain","text":"Reference prompt"}]',
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

    openRefTabById('ref_1_promptTemplate', deps);
    const promptCall = openTab.mock.calls[3];
    expect(promptCall[2]).toBe('json');
    expect(promptCall[4]).toBeNull();
    expect(promptCall[3]()).toBe('[{"type":"plain","text":"Reference prompt"}]');
  });
});
