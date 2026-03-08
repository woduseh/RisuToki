import { useAppStore } from '../stores/app-store';

let statusTimer: ReturnType<typeof setTimeout> | null = null;
let _statusBar: HTMLElement | null;
let _statusSpan: HTMLElement | null;

export function setStatus(text: string): void {
  // Update Pinia store for reactive StatusBar component
  try {
    useAppStore().setStatus(text);
  } catch {
    /* store not yet ready */
  }

  if (!_statusBar) {
    _statusBar = document.getElementById('statusbar');
    _statusSpan = document.getElementById('status-text');
  }
  if (_statusSpan) _statusSpan.textContent = text;
  if (_statusBar) _statusBar.classList.add('visible');

  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (_statusBar) _statusBar.classList.remove('visible');
  }, 3000);
}
