export const CLOSE_CHOICE_SAVE_AND_CLOSE = 0;
export const CLOSE_CHOICE_CLOSE_WITHOUT_SAVE = 1;
export const CLOSE_CHOICE_CANCEL = 2;

export interface CloseWindowSaveResult {
  success: boolean;
  error?: string;
}

export interface CloseWindowPolicyInput {
  choice: number;
  saveResult?: CloseWindowSaveResult;
}

export interface CloseWindowPolicyResult {
  action: 'save' | 'close' | 'stay';
  errorMessage: string | null;
}

export function resolveCloseWindowAction({
  choice,
  saveResult,
}: CloseWindowPolicyInput): CloseWindowPolicyResult {
  if (choice !== CLOSE_CHOICE_SAVE_AND_CLOSE && choice !== CLOSE_CHOICE_CLOSE_WITHOUT_SAVE && choice !== CLOSE_CHOICE_CANCEL) {
    return { action: 'stay', errorMessage: null };
  }

  if (choice === CLOSE_CHOICE_CLOSE_WITHOUT_SAVE) {
    return { action: 'close', errorMessage: null };
  }

  if (choice === CLOSE_CHOICE_CANCEL) {
    return { action: 'stay', errorMessage: null };
  }

  if (!saveResult) {
    return { action: 'save', errorMessage: null };
  }

  if (saveResult.success) {
    return { action: 'close', errorMessage: null };
  }

  if (saveResult.error === 'Cancelled') {
    return { action: 'stay', errorMessage: null };
  }

  return {
    action: 'stay',
    errorMessage: `저장에 실패해 창을 닫지 않았습니다: ${saveResult.error || '알 수 없는 오류'}`,
  };
}
