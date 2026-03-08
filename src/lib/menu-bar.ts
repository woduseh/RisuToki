export type MenuActionMap = Record<string, () => void>;

let openMenuId: string | null = null;

function openMenu(menuId: string): void {
  closeAllMenus();
  const item = document.querySelector(`.menu-item[data-menu="${menuId}"]`);
  if (item) {
    item.classList.add('open');
    openMenuId = menuId;
  }
}

export function closeAllMenus(): void {
  if (openMenuId) {
    const el = document.querySelector(`.menu-item[data-menu="${openMenuId}"]`);
    if (el) el.classList.remove('open');
  }
  openMenuId = null;
}

export function initMenuBar(actions: MenuActionMap): void {
  const menuItems = document.querySelectorAll('.menu-item');

  for (const item of menuItems) {
    const label = item.querySelector('.menu-label');
    if (!label) continue;

    const menuId = (item as HTMLElement).dataset.menu!;

    // Click to open/close menu
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openMenuId === menuId) {
        closeAllMenus();
      } else {
        openMenu(menuId);
      }
    });

    // Hover to switch when another is open
    label.addEventListener('mouseenter', () => {
      if (openMenuId && openMenuId !== menuId) {
        openMenu(menuId);
      }
    });
  }

  // Click menu actions
  document.querySelectorAll('.menu-action').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      const action = (el as HTMLElement).dataset.action;
      if (action && actions[action]) {
        actions[action]();
      }
    });
  });

  // Prevent submenu parent from closing menu
  document.querySelectorAll('.menu-sub').forEach(el => {
    el.addEventListener('click', (e) => e.stopPropagation());
  });

  // Click outside closes menus
  document.addEventListener('click', () => closeAllMenus());
}
