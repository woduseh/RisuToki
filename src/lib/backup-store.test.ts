import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllBackups, clearBackups, createBackup, getBackups, MAX_BACKUPS, showBackupMenu } from './backup-store';

describe('backup-store', () => {
  beforeEach(() => {
    clearAllBackups();
    document.body.innerHTML = '';
  });

  it.each(['__proto__', 'constructor', 'toString'])('handles %s as an ordinary tab ID', (tabId) => {
    expect(getBackups(tabId)).toEqual([]);
    createBackup(tabId, 'draft');
    expect(getBackups(tabId).map((entry) => entry.content)).toEqual(['draft']);
    clearBackups(tabId);
    expect(getBackups(tabId)).toEqual([]);
    createBackup(tabId, 'draft');
    expect(getBackups(tabId)).toHaveLength(1);
  });

  it('keeps snapshots isolated from later edits and skips consecutive duplicates', () => {
    const draft = { nested: { text: 'first' } };
    createBackup('tab', draft);
    createBackup('tab', { nested: { text: 'first' } });
    draft.nested.text = 'second';
    createBackup('tab', draft);

    expect(getBackups('tab').map((entry) => entry.content)).toEqual([
      { nested: { text: 'first' } },
      { nested: { text: 'second' } },
    ]);
  });

  it('does not confuse JSON text with an object snapshot', () => {
    createBackup('tab', '{"text":"draft"}');
    createBackup('tab', { text: 'draft' });
    expect(getBackups('tab')).toHaveLength(2);
  });

  it('retains the latest backups independently for each tab', () => {
    for (let index = 0; index <= MAX_BACKUPS; index++) createBackup('tab', `draft ${index}`);
    createBackup('other', 'separate');

    expect(getBackups('tab')).toHaveLength(MAX_BACKUPS);
    expect(getBackups('tab')[0].content).toBe('draft 1');
    expect(getBackups('tab').at(-1)?.content).toBe(`draft ${MAX_BACKUPS}`);
    clearBackups('tab');
    expect(getBackups('other')[0].content).toBe('separate');
    clearAllBackups();
    expect(getBackups('other')).toEqual([]);
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
