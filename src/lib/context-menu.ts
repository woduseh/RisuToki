export type ContextMenuItem = { label: string; action: () => void } | '---';

let ctxMenu: HTMLDivElement | null = null;

export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  hideContextMenu();
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';

  for (const item of items) {
    if (item === '---') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      ctxMenu.appendChild(sep);
      continue;
    }
    const el = document.createElement('div');
    el.className = 'ctx-item';
    el.textContent = item.label;
    el.addEventListener('click', () => { hideContextMenu(); item.action(); });
    ctxMenu.appendChild(el);
  }

  document.body.appendChild(ctxMenu);

  // Keep menu in viewport
  const rect = ctxMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) ctxMenu.style.left = (x - rect.width) + 'px';
  if (rect.bottom > window.innerHeight) ctxMenu.style.top = (y - rect.height) + 'px';

  setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 0);
}

export function hideContextMenu(): void {
  if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
}
