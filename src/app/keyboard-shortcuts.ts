import { closeAllMenus } from '../lib/menu-bar';

export interface KeyboardDeps {
  handleNew(): void;
  handleOpen(): void;
  handleSave(): void;
  handleSaveAs(): void;
  closeActiveTab(): void;
  toggleSidebar(): void;
  toggleTerminal(): void;
  showPreviewPanel(): void;
  showSettingsPopup(): void;
}

export function initKeyboard(deps: KeyboardDeps): void {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      deps.handleNew();
    } else if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      deps.handleOpen();
    } else if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      deps.handleSaveAs();
    } else if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      deps.handleSave();
    } else if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      deps.closeActiveTab();
    } else if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      deps.toggleSidebar();
    } else if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      deps.toggleTerminal();
    } else if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      deps.showSettingsPopup();
    } else if (e.key === 'F5') {
      e.preventDefault();
      deps.showPreviewPanel();
    } else if (e.key === 'Escape') {
      closeAllMenus();
    }
  });
}
