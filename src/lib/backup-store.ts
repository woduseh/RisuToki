export const MAX_BACKUPS = 20;

interface BackupEntry {
  time: Date;
  content: unknown;
}

const backupStore: Record<string, BackupEntry[]> = {};
// Cache the stringified form of the last entry per tab to avoid re-serializing
const lastStringCache: Record<string, string> = {};

export function createBackup(tabId: string, content: unknown): void {
  if (!content && content !== '') return;
  if (!backupStore[tabId]) backupStore[tabId] = [];
  const store = backupStore[tabId];

  // Deep copy objects to prevent reference mutation
  const stored = typeof content === 'object' && content !== null ? structuredClone(content) : content;

  // Skip duplicate of same content (use cached last-entry string)
  const curStr = typeof stored === 'object' ? JSON.stringify(stored) : String(stored);
  if (lastStringCache[tabId] !== undefined && lastStringCache[tabId] === curStr) return;

  store.push({ time: new Date(), content: stored });
  lastStringCache[tabId] = curStr;
  if (store.length > MAX_BACKUPS) {
    backupStore[tabId] = store.slice(-MAX_BACKUPS);
  }
}

export function getBackups(tabId: string): BackupEntry[] {
  return backupStore[tabId] || [];
}

export function formatBackupTime(date: Date): string {
  const mon = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${mon}/${day} ${h}:${m}:${s}`;
}

export interface ShowBackupMenuOptions {
  setStatus: (message: string) => void;
  onRestore: (tabId: string, backupIdx: number) => void;
}

export function showBackupMenu(tabId: string, _x: number, _y: number, options: ShowBackupMenuOptions): void {
  const { setStatus, onRestore } = options;
  const store = getBackups(tabId);
  if (store.length === 0) {
    setStatus('백업이 없습니다');
    return;
  }

  // Show as MomoTalk popup with preview
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
  const popup = document.createElement('div');
  popup.className = 'settings-popup';
  popup.style.cssText += 'width:520px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;';

  const header = document.createElement('div');
  header.className = 'help-popup-header';
  header.innerHTML = `<span>백업 불러오기 — ${tabId}</span>`;
  const closeBtn = document.createElement('span');
  closeBtn.className = 'help-popup-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.style.cssText = 'padding:8px;overflow-y:auto;flex:1;min-height:0;';

  // Preview area
  const previewBox = document.createElement('pre');
  previewBox.style.cssText =
    'background:var(--bg-primary);border:1px solid var(--border-color);border-radius:4px;padding:8px;font-size:11px;color:var(--text-primary);max-height:180px;overflow:auto;margin:0 0 8px;white-space:pre-wrap;word-break:break-all;';
  previewBox.textContent = '항목을 선택하면 미리보기가 표시됩니다.';

  // List of backup versions
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-bottom:8px;';

  function getPreviewText(content: unknown): string {
    if (typeof content === 'string') return content;
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }

  let selectedIdx: number | null = null;
  const rows: HTMLDivElement[] = [];

  for (let i = store.length - 1; i >= 0; i--) {
    const backup = store[i];
    const ver = i + 1;
    const preview = getPreviewText(backup.content);
    const snippet = preview.length > 60 ? preview.slice(0, 60) + '…' : preview;
    const lenStr = typeof backup.content === 'string' ? `${backup.content.length}자` : '';

    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12px;color:var(--text-primary);border:1px solid var(--border-color);transition:background 0.15s;';
    row.innerHTML =
      `<span style="font-weight:700;min-width:28px;color:var(--accent);">v${ver}</span>` +
      `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);font-size:11px;">${snippet}</span>` +
      `<span style="font-size:10px;color:var(--text-secondary);white-space:nowrap;">${lenStr} · ${formatBackupTime(backup.time)}</span>`;

    const idx = i;
    row.addEventListener('click', () => {
      selectedIdx = idx;
      previewBox.textContent = getPreviewText(store[idx].content).slice(0, 2000);
      rows.forEach((r) => (r.style.background = ''));
      row.style.background = 'var(--accent-light)';
    });
    row.addEventListener('mouseenter', () => {
      if (selectedIdx !== idx) row.style.background = 'var(--bg-secondary)';
    });
    row.addEventListener('mouseleave', () => {
      if (selectedIdx !== idx) row.style.background = '';
    });
    list.appendChild(row);
    rows.push(row);
  }

  // Restore button
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:4px 0;';
  const btnRestore = document.createElement('button');
  btnRestore.textContent = '복원';
  btnRestore.style.cssText =
    'padding:6px 20px;border:none;border-radius:4px;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;';
  btnRestore.addEventListener('click', () => {
    if (selectedIdx === null) {
      setStatus('버전을 선택하세요');
      return;
    }
    overlay.remove();
    onRestore(tabId, selectedIdx);
  });
  const btnCancel = document.createElement('button');
  btnCancel.textContent = '취소';
  btnCancel.style.cssText =
    'padding:6px 20px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:13px;';
  btnCancel.addEventListener('click', () => overlay.remove());
  btnRow.appendChild(btnCancel);
  btnRow.appendChild(btnRestore);

  body.appendChild(list);
  body.appendChild(previewBox);
  body.appendChild(btnRow);
  popup.appendChild(header);
  popup.appendChild(body);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
