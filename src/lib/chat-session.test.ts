import { describe, expect, it } from 'vitest';
import { createBufferedTerminalChatSession } from './chat-session';
import {
  applySelectedChoice,
  cleanTuiOutput,
  filterDisplayChatMessages,
  isAssistantWelcomeBanner,
  isSpinnerNoise,
  stripAnsi,
} from './terminal-chat';

describe('chat session helpers', () => {
  it('recovers buffered assistant output when chat mode is enabled mid-response', () => {
    const session = createBufferedTerminalChatSession({
      applySelectedChoice,
      cleanTuiOutput,
      filterDisplayChatMessages,
      isAssistantWelcomeBanner,
      isSpinnerNoise,
      stripAnsi,
    });

    session.feedBackgroundData('● 긴 답변입니다');
    session.setActive(true);

    expect(session.getMessages()).toEqual([{ type: 'system', text: '긴 답변입니다', _recovery: true }]);
  });
});
