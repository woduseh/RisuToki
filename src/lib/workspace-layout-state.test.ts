import { describe, expect, it } from 'vitest';
import {
  migrateLegacyWorkspaceLayout,
  migrateWorkspaceLayoutV2,
  readWorkspaceLayoutState,
  writeWorkspaceLayoutState,
} from './workspace-layout-state';

describe('workspace layout state v3', () => {
  it('clamps persisted pane dimensions and drops obsolete free-placement positions', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          version: 3,
          navigatorWidth: 999,
          inspectorWidth: 10,
          utilityHeight: 300,
          navigatorVisible: false,
          rightSidebarView: 'references',
          activeUtility: 'references',
          loreManagerPos: 'far-right',
        }),
      setItem: () => undefined,
    };
    expect(readWorkspaceLayoutState(storage)).toEqual({
      version: 3,
      navigatorWidth: 440,
      inspectorWidth: 260,
      utilityHeight: 300,
      navigatorVisible: false,
      avatarVisible: true,
      rightSidebarView: 'references',
      activeUtility: null,
    });
  });

  it('writes only the v3 workspace state', () => {
    let value = '';
    writeWorkspaceLayoutState(
      {
        version: 3,
        navigatorWidth: 280,
        inspectorWidth: 320,
        utilityHeight: 250,
        navigatorVisible: true,
        avatarVisible: false,
        rightSidebarView: 'guides',
        activeUtility: null,
      },
      {
        getItem: () => null,
        setItem: (_key, next) => {
          value = next;
        },
      },
    );
    expect(JSON.parse(value)).toEqual({
      version: 3,
      navigatorWidth: 280,
      inspectorWidth: 320,
      utilityHeight: 250,
      navigatorVisible: true,
      avatarVisible: false,
      rightSidebarView: 'guides',
      activeUtility: null,
    });
  });

  it('migrates mutually exclusive right sidebar state from v2 booleans', () => {
    expect(
      migrateWorkspaceLayoutV2({
        version: 2,
        navigatorWidth: 300,
        inspectorWidth: 360,
        utilityHeight: 280,
        navigatorVisible: true,
        inspectorVisible: true,
        referencesVisible: true,
        avatarVisible: false,
        activeUtility: 'terminal',
      }),
    ).toEqual({
      version: 3,
      navigatorWidth: 300,
      inspectorWidth: 360,
      utilityHeight: 280,
      navigatorVisible: true,
      avatarVisible: false,
      rightSidebarView: 'references',
      activeUtility: 'terminal',
    });
  });

  it('migrates only pane dimensions and visibility from the legacy free layout', () => {
    expect(
      migrateLegacyWorkspaceLayout({
        itemsPos: 'left',
        terminalPos: 'bottom',
        loreManagerPos: 'right',
        itemsVisible: false,
        terminalVisible: false,
        avatarVisible: true,
        loreManagerVisible: true,
        slotSizes: { left: 310, right: 360, bottom: 290 },
      }),
    ).toEqual({
      version: 3,
      navigatorWidth: 310,
      inspectorWidth: 360,
      utilityHeight: 290,
      navigatorVisible: false,
      avatarVisible: true,
      rightSidebarView: 'inspector',
      activeUtility: 'terminal',
    });
  });

  it('maps the removed avatar-only utility state to the terminal with its avatar visible', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          version: 3,
          navigatorWidth: 280,
          inspectorWidth: 320,
          utilityHeight: 250,
          navigatorVisible: true,
          rightSidebarView: null,
          activeUtility: 'avatar',
        }),
      setItem: () => undefined,
    };

    expect(readWorkspaceLayoutState(storage)).toMatchObject({
      activeUtility: 'terminal',
      avatarVisible: true,
      rightSidebarView: null,
    });
  });
});
