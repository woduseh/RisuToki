import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllBackups, createBackup, showBackupMenu } from './backup-store';

describe('backup-store', () => {
  beforeEach(() => {
    clearAllBackups();
    document.body.innerHTML = '';
  });

  it('renders backup labels and snippets as text, not HTML', () => {
    createBackup('tab_<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>');

    showBackupMenu('tab_<img src=x onerror=alert(1)>', 0, 0, {
      setStatus: vi.fn(),
      onRestore: vi.fn(),
    });

    expect(document.querySelector('.help-popup-header')?.textContent).toContain('tab_<img src=x onerror=alert(1)>');
    expect(document.querySelector('.help-popup-header img')).toBeNull();
    expect(document.querySelector('.settings-popup')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(document.querySelector('.settings-popup img')).toBeNull();
  });
});
