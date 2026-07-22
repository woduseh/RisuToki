import { describe, expect, it } from 'vitest';
import {
  migrateLegacyWorkspaceLayout,
  readWorkspaceLayoutState,
  writeWorkspaceLayoutState,
} from './workspace-layout-state';

describe('workspace layout state v2', () => {
  it('clamps persisted pane dimensions and drops obsolete popout positions', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          version: 2,
          navigatorWidth: 999,
          inspectorWidth: 10,
          utilityHeight: 300,
          navigatorVisible: false,
          inspectorVisible: true,
          activeUtility: 'references',
          loreManagerPos: 'far-right',
        }),
      setItem: () => undefined,
    };
    expect(readWorkspaceLayoutState(storage)).toEqual({
      version: 2,
      navigatorWidth: 440,
      inspectorWidth: 260,
      utilityHeight: 300,
      navigatorVisible: false,
      inspectorVisible: true,
      avatarVisible: true,
      referencesVisible: true,
      activeUtility: null,
    });
  });

  it('writes only the v2 workspace state', () => {
    let value = '';
    writeWorkspaceLayoutState(
      {
        version: 2,
        navigatorWidth: 280,
        inspectorWidth: 320,
        utilityHeight: 250,
        navigatorVisible: true,
        inspectorVisible: true,
        avatarVisible: false,
        referencesVisible: true,
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
      version: 2,
      navigatorWidth: 280,
      inspectorWidth: 320,
      utilityHeight: 250,
      navigatorVisible: true,
      inspectorVisible: true,
      avatarVisible: false,
      referencesVisible: true,
      activeUtility: null,
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
      version: 2,
      navigatorWidth: 310,
      inspectorWidth: 360,
      utilityHeight: 290,
      navigatorVisible: false,
      inspectorVisible: true,
      avatarVisible: true,
      referencesVisible: false,
      activeUtility: 'terminal',
    });
  });

  it('maps the removed avatar-only utility state to the terminal with its avatar visible', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          version: 2,
          navigatorWidth: 280,
          inspectorWidth: 320,
          utilityHeight: 250,
          navigatorVisible: true,
          inspectorVisible: true,
          activeUtility: 'avatar',
        }),
      setItem: () => undefined,
    };

    expect(readWorkspaceLayoutState(storage)).toMatchObject({
      activeUtility: 'terminal',
      avatarVisible: true,
      referencesVisible: false,
    });
  });
});
