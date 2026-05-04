export type LayoutSlot = 'far-left' | 'left' | 'right' | 'far-right' | 'top' | 'bottom';
export type PanelPosition = LayoutSlot | 'sidebar' | '_popout';

export interface LayoutState {
  itemsPos: LayoutSlot;
  refsPos: PanelPosition;
  terminalPos: LayoutSlot;
  itemsVisible: boolean;
  terminalVisible: boolean;
  avatarVisible: boolean;
  slotSizes: Record<LayoutSlot, number>;
  _refsPosBefore?: PanelPosition;
}

interface LayoutDomCache {
  _ready?: boolean;
  avatar: HTMLElement | null;
  bottomArea: HTMLElement | null;
  refsPanel: HTMLElement | null;
  refsPanelContent: HTMLElement | null;
  refsSection: HTMLElement | null;
  sidebar: HTMLElement | null;
  sidebarExpand: HTMLElement | null;
  sidebarRefs: HTMLElement | null;
  splitResizer: HTMLElement | null;
  termBtn: HTMLElement | null;
  slots: Record<LayoutSlot, HTMLElement | null>;
  resizers: Record<LayoutSlot, HTMLElement | null>;
}

export const SLOT_IDS: LayoutSlot[] = ['far-left', 'left', 'right', 'far-right', 'top', 'bottom'];
export const V_SLOTS = new Set<LayoutSlot>(['far-left', 'left', 'right', 'far-right']);
export const DEFAULT_SLOT_SIZES: Record<LayoutSlot, number> = {
  'far-left': 260,
  left: 260,
  right: 260,
  'far-right': 350,
  top: 250,
  bottom: 250,
};

export const POS_LABELS: Record<PanelPosition | 'hide', string> = {
  'far-left': '좌끝',
  left: '좌측',
  right: '우측',
  'far-right': '우끝',
  top: '상단',
  bottom: '하단',
  sidebar: '사이드바',
  _popout: '팝아웃',
  hide: '숨김',
};

const RESIZER_STEP = 10;
const RESIZER_FAST_STEP = 50;
const RESIZER_MIN = 100;

const SLOT_RESIZER_LABELS: Record<LayoutSlot, string> = {
  'far-left': '좌끝 패널 크기 조절',
  left: '좌측 패널 크기 조절',
  right: '우측 패널 크기 조절',
  'far-right': '우끝 패널 크기 조절',
  top: '상단 패널 크기 조절',
  bottom: '하단 패널 크기 조절',
};

export function createDefaultLayoutState(): LayoutState {
  return {
    itemsPos: 'left',
    refsPos: 'sidebar',
    terminalPos: 'bottom',
    itemsVisible: true,
    terminalVisible: true,
    avatarVisible: true,
    slotSizes: { ...DEFAULT_SLOT_SIZES },
  };
}

export function applyStoredLayoutState(
  target: LayoutState,
  stored: Partial<LayoutState> | null | undefined,
): LayoutState {
  if (!stored) return target;

  const migrated = { ...stored } as Partial<LayoutState> & { sidebarPos?: LayoutSlot; sidebarVisible?: boolean };
  if (migrated.sidebarPos && !migrated.itemsPos) migrated.itemsPos = migrated.sidebarPos;
  if (migrated.sidebarVisible !== undefined && migrated.itemsVisible === undefined)
    migrated.itemsVisible = migrated.sidebarVisible;

  if (migrated.itemsPos) target.itemsPos = migrated.itemsPos;
  if (migrated.refsPos && migrated.refsPos !== '_popout') target.refsPos = migrated.refsPos;
  if (migrated.terminalPos) target.terminalPos = migrated.terminalPos;
  if (migrated.itemsVisible !== undefined) target.itemsVisible = migrated.itemsVisible;
  if (migrated.terminalVisible !== undefined) target.terminalVisible = migrated.terminalVisible;
  if (migrated.avatarVisible !== undefined) target.avatarVisible = migrated.avatarVisible;
  if (migrated.slotSizes) {
    target.slotSizes = { ...target.slotSizes, ...migrated.slotSizes };
  }

  return target;
}

export function createLayoutManager({
  documentRef = document,
  onRefit,
  onStatus,
  saveState,
  state,
}: {
  documentRef?: Document;
  onRefit: () => void;
  onStatus: (message: string) => void;
  saveState: () => void;
  state: LayoutState;
}) {
  const elements: LayoutDomCache = {
    avatar: null,
    bottomArea: null,
    refsPanel: null,
    refsPanelContent: null,
    refsSection: null,
    sidebar: null,
    sidebarExpand: null,
    sidebarRefs: null,
    splitResizer: null,
    termBtn: null,
    slots: {
      'far-left': null,
      left: null,
      right: null,
      'far-right': null,
      top: null,
      bottom: null,
    },
    resizers: {
      'far-left': null,
      left: null,
      right: null,
      'far-right': null,
      top: null,
      bottom: null,
    },
  };

  let refitTimer: ReturnType<typeof setTimeout> | null = null;
  const resizerHandlers: Partial<Record<LayoutSlot, (event: MouseEvent) => void>> = {};
  const resizerKeyHandlers: Partial<Record<LayoutSlot, (event: KeyboardEvent) => void>> = {};

  function cacheElements(): void {
    if (elements._ready) return;
    elements.sidebar = documentRef.getElementById('sidebar');
    elements.refsPanel = documentRef.getElementById('refs-panel');
    elements.bottomArea = documentRef.getElementById('bottom-area');
    elements.refsSection = documentRef.getElementById('sidebar-refs-section');
    elements.splitResizer = documentRef.getElementById('sidebar-split-resizer');
    elements.refsPanelContent = documentRef.getElementById('refs-panel-content');
    elements.avatar = documentRef.getElementById('toki-avatar');
    elements.termBtn = documentRef.getElementById('btn-terminal-toggle');
    elements.sidebarExpand = documentRef.getElementById('sidebar-expand');
    elements.sidebarRefs = documentRef.getElementById('sidebar-refs');
    for (const slot of SLOT_IDS) {
      elements.slots[slot] = documentRef.getElementById(`slot-${slot}`);
      elements.resizers[slot] = documentRef.getElementById(`resizer-${slot}`);
    }
    elements._ready = true;
  }

  function getSlotElement(slot: LayoutSlot): HTMLElement | null {
    return elements._ready ? elements.slots[slot] : documentRef.getElementById(`slot-${slot}`);
  }

  function scheduleRefit(): void {
    if (refitTimer) clearTimeout(refitTimer);
    refitTimer = setTimeout(() => {
      refitTimer = null;
      onRefit();
    }, 20);
  }

  function initSlotResizers(): void {
    for (const slotName of SLOT_IDS) {
      const resizer = elements.resizers[slotName];
      if (!resizer) continue;

      const previousHandler = resizerHandlers[slotName];
      if (previousHandler) {
        resizer.removeEventListener('mousedown', previousHandler);
        delete resizerHandlers[slotName];
      }
      const previousKeyHandler = resizerKeyHandlers[slotName];
      if (previousKeyHandler) {
        resizer.removeEventListener('keydown', previousKeyHandler);
        delete resizerKeyHandlers[slotName];
      }

      const isVertical = V_SLOTS.has(slotName);
      const isActive = resizer.classList.contains('active');
      const currentSize = state.slotSizes[slotName] || DEFAULT_SLOT_SIZES[slotName];
      resizer.setAttribute('role', 'separator');
      resizer.setAttribute('aria-orientation', isVertical ? 'vertical' : 'horizontal');
      resizer.setAttribute('aria-label', SLOT_RESIZER_LABELS[slotName]);
      resizer.setAttribute('aria-valuemin', String(RESIZER_MIN));
      resizer.setAttribute('aria-valuenow', String(currentSize));
      resizer.setAttribute('aria-valuetext', `${currentSize}px`);
      resizer.tabIndex = isActive ? 0 : -1;
      if (!isActive) continue;

      const applySize = (newSize: number): void => {
        const slot = getSlotElement(slotName);
        if (!slot) return;
        const size = Math.max(RESIZER_MIN, newSize);
        if (isVertical) {
          slot.style.width = `${size}px`;
        } else {
          slot.style.height = `${size}px`;
        }
        state.slotSizes[slotName] = size;
        resizer.setAttribute('aria-valuenow', String(size));
        resizer.setAttribute('aria-valuetext', `${size}px`);
      };

      const getDirection = (): number => {
        if (isVertical && (slotName === 'right' || slotName === 'far-right')) return -1;
        if (!isVertical && slotName === 'bottom') return -1;
        return 1;
      };

      const handler = (event: MouseEvent): void => {
        event.preventDefault();
        const slot = getSlotElement(slotName);
        if (!slot) return;

        const startPos = isVertical ? event.clientX : event.clientY;
        const startSize = isVertical ? slot.getBoundingClientRect().width : slot.getBoundingClientRect().height;
        const direction = getDirection();

        resizer.classList.add('dragging');
        const onMove = (moveEvent: MouseEvent): void => {
          const delta = isVertical ? moveEvent.clientX - startPos : moveEvent.clientY - startPos;
          applySize(startSize + delta * direction);
        };

        const onUp = (): void => {
          resizer.classList.remove('dragging');
          documentRef.removeEventListener('mousemove', onMove);
          documentRef.removeEventListener('mouseup', onUp);
          saveState();
          onRefit();
        };

        documentRef.addEventListener('mousemove', onMove);
        documentRef.addEventListener('mouseup', onUp);
      };

      const keyHandler = (event: KeyboardEvent): void => {
        const relevantKeys = isVertical ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
        if (!relevantKeys.includes(event.key)) return;
        event.preventDefault();
        const baseDelta = event.shiftKey ? RESIZER_FAST_STEP : RESIZER_STEP;
        const signedDelta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? baseDelta : -baseDelta;
        applySize((state.slotSizes[slotName] || DEFAULT_SLOT_SIZES[slotName]) + signedDelta * getDirection());
        saveState();
        onRefit();
      };

      resizerHandlers[slotName] = handler;
      resizerKeyHandlers[slotName] = keyHandler;
      resizer.addEventListener('mousedown', handler);
      resizer.addEventListener('keydown', keyHandler);
    }
  }

  function rebuild(): void {
    cacheElements();
    const {
      avatar,
      bottomArea,
      refsPanel,
      refsPanelContent,
      refsSection,
      sidebar,
      sidebarExpand,
      sidebarRefs,
      splitResizer,
      termBtn,
    } = elements;

    if (!sidebar || !refsPanel || !bottomArea || !refsSection || !splitResizer || !refsPanelContent) {
      return;
    }

    for (const slotName of SLOT_IDS) {
      const slot = elements.slots[slotName];
      const resizer = elements.resizers[slotName];
      if (slot) {
        slot.innerHTML = '';
        slot.classList.remove('active');
      }
      if (resizer) {
        resizer.classList.remove('active');
      }
    }

    const slotContents: Record<LayoutSlot, HTMLElement[]> = {
      'far-left': [],
      left: [],
      right: [],
      'far-right': [],
      top: [],
      bottom: [],
    };

    if (state.itemsVisible) {
      slotContents[state.itemsPos].push(sidebar);
      if (state.refsPos === 'sidebar') {
        refsSection.style.display = '';
        splitResizer.style.display = '';
        refsPanel.style.display = 'none';
      } else {
        refsSection.style.display = 'none';
        splitResizer.style.display = 'none';
      }
    } else {
      sidebar.style.display = 'none';
    }

    if (state.refsPos === '_popout') {
      refsPanel.style.display = 'none';
      refsSection.style.display = 'none';
      splitResizer.style.display = 'none';
    } else if (state.refsPos !== 'sidebar') {
      if (sidebarRefs) {
        refsPanelContent.innerHTML = '';
        while (sidebarRefs.firstChild) {
          refsPanelContent.appendChild(sidebarRefs.firstChild);
        }
      }
      refsPanel.style.display = 'flex';
      slotContents[state.refsPos as LayoutSlot].push(refsPanel);
    } else {
      if (sidebarRefs && refsPanelContent.firstChild) {
        while (refsPanelContent.firstChild) {
          sidebarRefs.appendChild(refsPanelContent.firstChild);
        }
      }
      refsPanel.style.display = 'none';
    }

    if (state.terminalVisible) {
      slotContents[state.terminalPos].push(bottomArea);
      bottomArea.style.display = 'flex';
      const isVertical = V_SLOTS.has(state.terminalPos);
      bottomArea.classList.remove('panel-in-h', 'panel-in-v');
      bottomArea.classList.add(isVertical ? 'panel-in-v' : 'panel-in-h');
    } else {
      bottomArea.style.display = 'none';
    }

    if (avatar) avatar.style.display = state.avatarVisible ? '' : 'none';
    if (termBtn) termBtn.textContent = state.terminalVisible ? '━' : '▲';

    for (const slotName of SLOT_IDS) {
      const panels = slotContents[slotName];
      if (panels.length === 0) continue;

      const slot = elements.slots[slotName];
      const resizer = elements.resizers[slotName];
      if (!slot) continue;

      slot.classList.add('active');
      if (resizer) resizer.classList.add('active');

      if (V_SLOTS.has(slotName)) {
        slot.style.width = `${state.slotSizes[slotName] || DEFAULT_SLOT_SIZES[slotName]}px`;
        slot.style.height = '';
      } else {
        slot.style.height = `${state.slotSizes[slotName] || DEFAULT_SLOT_SIZES[slotName]}px`;
        slot.style.width = '';
      }

      for (const panel of panels) {
        panel.style.display = panel === bottomArea || panel === refsPanel ? 'flex' : '';
        slot.appendChild(panel);
      }
    }

    if (sidebarExpand) {
      sidebarExpand.style.display = state.itemsVisible ? 'none' : 'block';
    }

    initSlotResizers();
    scheduleRefit();
    saveState();
  }

  function toggleSidebar(): void {
    state.itemsVisible = !state.itemsVisible;
    rebuild();
  }

  function toggleTerminal(): void {
    state.terminalVisible = !state.terminalVisible;
    rebuild();
  }

  function toggleAvatar(): void {
    state.avatarVisible = !state.avatarVisible;
    rebuild();
  }

  function moveItems(position: LayoutSlot | 'hide'): void {
    if (position === 'hide') {
      state.itemsVisible = false;
      rebuild();
      onStatus('항목 숨김');
      return;
    }
    state.itemsPos = position;
    state.itemsVisible = true;
    rebuild();
    onStatus(`항목 → ${POS_LABELS[position] || position}`);
  }

  function moveTerminal(position: LayoutSlot): void {
    state.terminalPos = position;
    state.terminalVisible = true;
    rebuild();
    onStatus(`터미널 → ${POS_LABELS[position] || position}`);
  }

  function moveRefs(position: PanelPosition): void {
    state.refsPos = position;
    rebuild();
    onStatus(`참고자료 → ${POS_LABELS[position] || position}`);
  }

  function resetLayout(): void {
    const nextState = createDefaultLayoutState();
    state.itemsPos = nextState.itemsPos;
    state.terminalPos = nextState.terminalPos;
    state.refsPos = nextState.refsPos;
    state.itemsVisible = nextState.itemsVisible;
    state.terminalVisible = nextState.terminalVisible;
    state.avatarVisible = nextState.avatarVisible;
    state.slotSizes = { ...nextState.slotSizes };
    delete state._refsPosBefore;
    rebuild();
    onStatus('레이아웃 초기화 완료');
  }

  return {
    moveItems,
    moveRefs,
    moveTerminal,
    rebuild,
    resetLayout,
    state,
    toggleAvatar,
    toggleSidebar,
    toggleTerminal,
  };
}
