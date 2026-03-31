import { useAppStore } from '../stores/app-store';
import type { StatusOptions } from '../stores/app-store';

let statusTimer: ReturnType<typeof setTimeout> | null = null;
let _statusBar: HTMLElement | null = null;
let _statusSpan: HTMLElement | null = null;

function clearStatusTimer(): void {
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
}

function resetStatusClasses(): void {
  _statusBar?.classList.remove('status-info', 'status-error', 'sticky');
}

export function setStatus(text: string, options: StatusOptions = {}): void {
  // Update Pinia store for reactive StatusBar component
  try {
    useAppStore().setStatus(text, options);
  } catch {
    /* store not yet ready */
  }

  if (!_statusBar) {
    _statusBar = document.getElementById('statusbar');
    _statusSpan = document.getElementById('status-text');
  }
  if (_statusSpan) _statusSpan.textContent = text;
  if (_statusBar) {
    resetStatusClasses();
    _statusBar.classList.add('visible');
    _statusBar.classList.add(options.kind === 'error' ? 'status-error' : 'status-info');
    if (options.sticky) {
      _statusBar.classList.add('sticky');
    }
  }

  clearStatusTimer();
  if (!options.sticky) {
    statusTimer = setTimeout(() => {
      if (_statusBar) _statusBar.classList.remove('visible');
    }, 3000);
  }
}

export function clearStatus(): void {
  try {
    useAppStore().clearStatus();
  } catch {
    /* store not yet ready */
  }

  clearStatusTimer();
  if (_statusSpan) {
    _statusSpan.textContent = '';
  }
  if (_statusBar) {
    _statusBar.classList.remove('visible');
    resetStatusClasses();
  }
}
