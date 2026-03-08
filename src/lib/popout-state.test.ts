import { describe, expect, it } from 'vitest';
import { applyDockedLayoutState, applyPopoutLayoutState } from './popout-state';

describe('popout layout state helpers', () => {
  it('toggles sidebar and terminal visibility for popout docking', () => {
    const layoutState = { itemsVisible: true, terminalVisible: true, refsPos: 'sidebar' };

    applyPopoutLayoutState('sidebar', layoutState);
    applyPopoutLayoutState('terminal', layoutState);

    expect(layoutState).toEqual({
      itemsVisible: false,
      terminalVisible: false,
      refsPos: 'sidebar'
    });

    applyDockedLayoutState('sidebar', layoutState);
    applyDockedLayoutState('terminal', layoutState);

    expect(layoutState).toEqual({
      itemsVisible: true,
      terminalVisible: true,
      refsPos: 'sidebar'
    });
  });

  it('remembers and restores refs position around popout', () => {
    const layoutState = { itemsVisible: true, terminalVisible: true, refsPos: 'main' };

    applyPopoutLayoutState('refs', layoutState);
    expect(layoutState).toEqual({
      itemsVisible: true,
      terminalVisible: true,
      refsPos: '_popout',
      _refsPosBefore: 'main'
    });

    applyDockedLayoutState('refs', layoutState);
    expect(layoutState).toEqual({
      itemsVisible: true,
      terminalVisible: true,
      refsPos: 'main'
    });
  });
});
