export type MenuActionMap = Record<string, () => void>;

/**
 * Close Vue-managed menus by dispatching a custom event.
 * MenuBar.vue listens for this event and resets its openMenu ref.
 */
export function closeAllMenus(): void {
  document.dispatchEvent(new CustomEvent('toki:close-menus'));
}
