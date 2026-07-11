import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('showSessionRecoveryDialog', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('renders the spec-approved Korean recovery copy and buttons', async () => {
    const mod = (await import('./dialog')) as typeof import('./dialog') & {
      showSessionRecoveryDialog?: (summary: {
        sourceFileName: string;
        savedAt: string;
        staleWarning?: string | null;
      }) => Promise<'restore' | 'open-original' | 'ignore'>;
    };

    expect(typeof mod.showSessionRecoveryDialog).toBe('function');

    const pending = mod.showSessionRecoveryDialog!({
      sourceFileName: 'Character.charx',
      savedAt: '04/01 09:41:20',
      staleWarning: '원본보다 오래된 자동 저장입니다.',
    });

    expect(document.body.textContent).toContain('자동 저장 복원');
    expect(document.body.textContent).toContain('비정상 종료 뒤 자동 저장 파일이 발견되었습니다.');
    expect(document.body.textContent).toContain('자동 저장: 04/01 09:41:20');
    expect(document.body.textContent).toContain('원본: Character.charx');
    expect(document.body.textContent).toContain('원본보다 오래된 자동 저장입니다.');
    expect(document.body.textContent).toContain('자동 저장 복원');
    expect(document.body.textContent).toContain('원본 열기');
    expect(document.body.textContent).toContain('무시');

    (
      Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent === '무시',
      ) as HTMLButtonElement
    ).click();
    await expect(pending).resolves.toBe('ignore');
  });

  it('still closes on Escape after focus navigation keys like Tab', async () => {
    const mod = (await import('./dialog')) as typeof import('./dialog') & {
      showSessionRecoveryDialog?: (summary: {
        sourceFileName: string;
        savedAt: string;
        staleWarning?: string | null;
      }) => Promise<'restore' | 'open-original' | 'ignore'>;
    };

    expect(typeof mod.showSessionRecoveryDialog).toBe('function');

    const pending = mod.showSessionRecoveryDialog!({
      sourceFileName: 'Character.charx',
      savedAt: '04/01 09:41:20',
      staleWarning: null,
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(pending).resolves.toBe('ignore');
  });
});

describe('MCP confirmation policy', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('automatically approves ordinary edits in auto mode', async () => {
    const { showMcpConfirm } = await import('./dialog');
    await expect(showMcpConfirm('필드 수정', 'description 필드를 수정합니다.', 'auto')).resolves.toBe(true);
    expect(document.querySelector('.settings-popup')).toBeNull();
  });

  it('still prompts for destructive edits in auto mode', async () => {
    const { showMcpConfirm } = await import('./dialog');
    const pending = showMcpConfirm('항목 삭제', '선택한 로어북을 삭제합니다.', 'auto');
    expect(document.body.textContent).toContain('MCP 작업 승인');
    document.querySelector<HTMLButtonElement>('button')!.click();
    await expect(pending).resolves.toBe(false);
  });

  it('allows all MCP operations without changing ordinary confirmation behavior', async () => {
    const { showConfirm, showMcpConfirm } = await import('./dialog');
    await expect(showMcpConfirm('항목 삭제', '외부 파일을 삭제합니다.', 'allow-all')).resolves.toBe(true);

    const ordinary = showConfirm('수동 삭제 확인');
    expect(document.body.textContent).toContain('수동 삭제 확인');
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
    buttons.find((button) => button.textContent === '아니오')!.click();
    await expect(ordinary).resolves.toBe(false);
  });
});
