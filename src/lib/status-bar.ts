let statusTimer: ReturnType<typeof setTimeout> | null = null;
let _statusBar: HTMLElement | null;
let _statusSpan: HTMLElement | null;

export function setStatus(text: string): void {
  if (!_statusBar) {
    _statusBar = document.getElementById('statusbar');
    _statusSpan = document.getElementById('status-text');
  }
  _statusSpan!.textContent = text;
  _statusBar!.classList.add('visible');

  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    _statusBar!.classList.remove('visible');
  }, 3000);
}
