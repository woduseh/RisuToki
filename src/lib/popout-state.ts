export interface LayoutStateLike {
  [key: string]: unknown;
  _refsPosBefore?: string;
  itemsVisible?: boolean;
  refsPos?: string;
  terminalVisible?: boolean;
}

export function applyPopoutLayoutState(panelId: string, layoutState: LayoutStateLike): void {
  if (panelId === 'sidebar') {
    layoutState.itemsVisible = false;
    return;
  }

  if (panelId === 'terminal') {
    layoutState.terminalVisible = false;
    return;
  }

  if (panelId === 'refs') {
    layoutState._refsPosBefore = layoutState.refsPos;
    layoutState.refsPos = '_popout';
  }
}

export function applyDockedLayoutState(panelId: string, layoutState: LayoutStateLike): void {
  if (panelId === 'sidebar') {
    layoutState.itemsVisible = true;
    return;
  }

  if (panelId === 'terminal') {
    layoutState.terminalVisible = true;
    return;
  }

  if (panelId === 'refs') {
    layoutState.refsPos = layoutState._refsPosBefore || 'sidebar';
    delete layoutState._refsPosBefore;
  }
}
