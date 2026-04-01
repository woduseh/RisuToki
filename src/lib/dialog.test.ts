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
