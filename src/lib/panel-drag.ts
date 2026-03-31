import type { ContextMenuItem } from './context-menu';

/**
 * Dependencies injected by the controller so this module stays
 * free of direct references to controller-level state.
 */
export interface PanelDragDeps {
  moveItems(position: string): void;
  moveTerminal(position: string): void;
  toggleSidebar(): void;
  toggleTerminal(): void;
  isPanelPoppedOut(name: string): boolean;
  popOutPanel(name: string): void;
  dockPanel(name: string): void;
  showContextMenu(x: number, y: number, items: ContextMenuItem[]): void;
}

interface DraggablePanel {
  el: Element;
  panel: string;
  label: string;
}

interface DropZone {
  el: HTMLDivElement;
  position: string;
  _rect: DOMRect;
}

/**
 * Attach drag handles to sidebar / terminal headers with
 * pop-out, collapse, and close buttons.
 */
export function initPanelDragDrop(deps: PanelDragDeps): void {
  const draggables: DraggablePanel[] = [
    { el: document.querySelector('.sidebar-header')!, panel: 'sidebar', label: '항목' },
    { el: document.getElementById('terminal-header')!, panel: 'terminal', label: 'TokiTalk' },
  ].filter((d): d is DraggablePanel => d.el != null);

  for (const item of draggables) {
    (item.el as HTMLElement).style.cursor = 'grab';

    // Pop-out button
    const popoutBtn = document.createElement('button');
    popoutBtn.className = 'panel-collapse-btn';
    popoutBtn.title = '팝아웃 (분리)';
    popoutBtn.setAttribute('aria-label', '팝아웃 (분리)');
    popoutBtn.textContent = '↗';
    popoutBtn.dataset.popoutPanel = item.panel;
    popoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (deps.isPanelPoppedOut(item.panel)) {
        deps.dockPanel(item.panel);
      } else {
        deps.popOutPanel(item.panel);
      }
    });

    // Close button (✕)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'panel-collapse-btn';
    closeBtn.title = '닫기';
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.panel === 'sidebar') deps.toggleSidebar();
      else if (item.panel === 'terminal') deps.toggleTerminal();
    });

    if (item.panel === 'sidebar') {
      const btnsGroup = item.el.querySelector('.sidebar-header-btns');
      const collapseBtn = document.getElementById('btn-sidebar-collapse');
      if (btnsGroup && collapseBtn) {
        btnsGroup.insertBefore(popoutBtn, collapseBtn);
        btnsGroup.appendChild(closeBtn);
      }
    } else if (item.panel === 'terminal') {
      const headerRight = item.el.querySelector('.momo-header-right');
      const toggleBtn = document.getElementById('btn-terminal-toggle');
      if (headerRight && toggleBtn) {
        headerRight.insertBefore(popoutBtn, toggleBtn);
        toggleBtn.after(closeBtn);
      }
    }

    item.el.addEventListener('mousedown', (e) => {
      const me = e as MouseEvent;
      const target = me.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.closest('button')) return;
      if (me.button !== 0) return;

      me.preventDefault();
      startPanelDrag(me, item.panel, deps);
    });

    // Right-click for position + pop-out options
    item.el.addEventListener('contextmenu', (e) => {
      const me = e as MouseEvent;
      me.preventDefault();
      me.stopPropagation();

      const isPoppedOut = deps.isPanelPoppedOut(item.panel);
      const moveFn = item.panel === 'sidebar' ? deps.moveItems : deps.moveTerminal;
      const posItems: ContextMenuItem[] = [
        { label: '→ 좌측', action: () => moveFn('left') },
        { label: '→ 우측', action: () => moveFn('right') },
        { label: '→ 좌끝', action: () => moveFn('far-left') },
        { label: '→ 우끝', action: () => moveFn('far-right') },
        { label: '→ 상단', action: () => moveFn('top') },
        { label: '→ 하단', action: () => moveFn('bottom') },
        '---',
        isPoppedOut
          ? { label: '도킹 (복원)', action: () => deps.dockPanel(item.panel) }
          : { label: '팝아웃 (분리)', action: () => deps.popOutPanel(item.panel) },
      ];
      deps.showContextMenu(me.clientX, me.clientY, posItems);
    });
  }
}

function startPanelDrag(e: MouseEvent, panelId: string, deps: PanelDragDeps): void {
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;
  let dropZones: DropZone[] = [];

  const onMove = (ev: MouseEvent): void => {
    const dx = Math.abs(ev.clientX - startX);
    const dy = Math.abs(ev.clientY - startY);

    // Start drag after 8px movement threshold
    if (!dragging && (dx > 8 || dy > 8)) {
      dragging = true;
      dropZones = createDropZones();
      document.body.style.cursor = 'grabbing';
    }

    if (dragging) {
      for (const zone of dropZones) {
        const r = zone._rect;
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          zone.el.classList.add('hover');
        } else {
          zone.el.classList.remove('hover');
        }
      }
    }
  };

  const onUp = (ev: MouseEvent): void => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';

    if (!dragging) return;

    let dropped: DropZone | null = null;
    for (const zone of dropZones) {
      const r = zone._rect;
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
        dropped = zone;
      }
      zone.el.remove();
    }

    if (dropped) {
      applyPanelDrop(panelId, dropped.position, deps);
    }
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function createDropZones(): DropZone[] {
  const zones: DropZone[] = [];
  const appBody = document.getElementById('app-body');
  if (!appBody) return zones;

  const rect = appBody.getBoundingClientRect();
  const e = 0.08; // edge ratio for far zones
  const s = 0.15; // side ratio

  const positions = [
    { position: 'far-left', label: '좌끝', x: rect.left, y: rect.top, w: rect.width * e, h: rect.height },
    {
      position: 'left',
      label: '좌측',
      x: rect.left + rect.width * e,
      y: rect.top + rect.height * 0.15,
      w: rect.width * (s - e),
      h: rect.height * 0.7,
    },
    {
      position: 'top',
      label: '상단',
      x: rect.left + rect.width * e,
      y: rect.top,
      w: rect.width * (1 - 2 * e),
      h: rect.height * 0.15,
    },
    {
      position: 'bottom',
      label: '하단',
      x: rect.left + rect.width * e,
      y: rect.bottom - rect.height * 0.15,
      w: rect.width * (1 - 2 * e),
      h: rect.height * 0.15,
    },
    {
      position: 'right',
      label: '우측',
      x: rect.right - rect.width * s,
      y: rect.top + rect.height * 0.15,
      w: rect.width * (s - e),
      h: rect.height * 0.7,
    },
    {
      position: 'far-right',
      label: '우끝',
      x: rect.right - rect.width * e,
      y: rect.top,
      w: rect.width * e,
      h: rect.height,
    },
  ];

  for (const pos of positions) {
    const zone = document.createElement('div');
    zone.className = 'panel-drop-zone visible';
    zone.style.left = pos.x + 'px';
    zone.style.top = pos.y + 'px';
    zone.style.width = pos.w + 'px';
    zone.style.height = pos.h + 'px';

    const labelEl = document.createElement('div');
    labelEl.className = 'panel-drop-zone-label';
    labelEl.textContent = pos.label;
    zone.appendChild(labelEl);

    document.body.appendChild(zone);
    zones.push({ el: zone, position: pos.position, _rect: zone.getBoundingClientRect() });
  }

  return zones;
}

function applyPanelDrop(panelId: string, position: string, deps: PanelDragDeps): void {
  if (panelId === 'sidebar') {
    deps.moveItems(position);
  } else if (panelId === 'terminal') {
    deps.moveTerminal(position);
  }
}
