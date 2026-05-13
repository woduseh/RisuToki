import { describe, expect, test } from 'vitest';

import {
  CLOSE_CHOICE_CANCEL,
  CLOSE_CHOICE_CLOSE_WITHOUT_SAVE,
  CLOSE_CHOICE_SAVE_AND_CLOSE,
  resolveCloseWindowAction,
  shouldPromptForUnsavedClose,
} from './close-window-policy';

describe('resolveCloseWindowAction', () => {
  test('requests a save attempt before closing when the user chooses save and close', () => {
    expect(resolveCloseWindowAction({ choice: CLOSE_CHOICE_SAVE_AND_CLOSE })).toEqual({
      action: 'save',
      errorMessage: null,
    });
  });

  test('closes the window after a successful save', () => {
    expect(
      resolveCloseWindowAction({
        choice: CLOSE_CHOICE_SAVE_AND_CLOSE,
        saveResult: { success: true },
      }),
    ).toEqual({
      action: 'close',
      errorMessage: null,
    });
  });

  test('keeps the window open and surfaces a save error when persistence fails', () => {
    expect(
      resolveCloseWindowAction({
        choice: CLOSE_CHOICE_SAVE_AND_CLOSE,
        saveResult: { success: false, error: 'Disk full' },
      }),
    ).toEqual({
      action: 'stay',
      errorMessage: '저장에 실패해 창을 닫지 않았습니다: Disk full',
    });
  });

  test('keeps the window open without an error when the save dialog is cancelled', () => {
    expect(
      resolveCloseWindowAction({
        choice: CLOSE_CHOICE_SAVE_AND_CLOSE,
        saveResult: { success: false, error: 'Cancelled' },
      }),
    ).toEqual({
      action: 'stay',
      errorMessage: null,
    });
  });

  test('closes immediately when the user chooses to discard changes', () => {
    expect(resolveCloseWindowAction({ choice: CLOSE_CHOICE_CLOSE_WITHOUT_SAVE })).toEqual({
      action: 'close',
      errorMessage: null,
    });
  });

  test('keeps the window open when the user cancels the close request', () => {
    expect(resolveCloseWindowAction({ choice: CLOSE_CHOICE_CANCEL })).toEqual({
      action: 'stay',
      errorMessage: null,
    });
  });
});

describe('shouldPromptForUnsavedClose', () => {
  test('does not prompt when no document is open', () => {
    expect(
      shouldPromptForUnsavedClose({
        hasCurrentDocument: false,
        status: { success: true, renderer: { hasUnsavedChanges: true } },
      }),
    ).toBe(false);
  });

  test('does not prompt when renderer reports no unsaved changes', () => {
    expect(
      shouldPromptForUnsavedClose({
        hasCurrentDocument: true,
        status: { success: true, renderer: { hasUnsavedChanges: false } },
      }),
    ).toBe(false);
  });

  test('prompts when renderer reports unsaved changes', () => {
    expect(
      shouldPromptForUnsavedClose({
        hasCurrentDocument: true,
        status: { success: true, renderer: { hasUnsavedChanges: true } },
      }),
    ).toBe(true);
  });

  test('prompts when renderer status is unavailable', () => {
    expect(
      shouldPromptForUnsavedClose({
        hasCurrentDocument: true,
        status: { success: false },
      }),
    ).toBe(true);
    expect(
      shouldPromptForUnsavedClose({
        hasCurrentDocument: true,
        status: null,
      }),
    ).toBe(true);
  });
});
