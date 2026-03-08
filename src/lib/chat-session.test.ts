import { describe, expect, it, vi } from 'vitest';
import {
  createBufferedTerminalChatSession,
  createDirectTerminalChatSession
} from './chat-session';
import {
  applySelectedChoice,
  cleanTuiOutput,
  filterDisplayChatMessages,
  isAssistantWelcomeBanner,
  isSpinnerNoise,
  removeCommandEcho,
  stripAnsi
} from './terminal-chat';

describe('chat session helpers', () => {
  it('recovers buffered assistant output when chat mode is enabled mid-response', () => {
    const session = createBufferedTerminalChatSession({
      applySelectedChoice,
      cleanTuiOutput,
      filterDisplayChatMessages,
      isAssistantWelcomeBanner,
      isSpinnerNoise,
      stripAnsi
    });

    session.feedBackgroundData('● 긴 답변입니다');
    session.setActive(true);

    expect(session.getMessages()).toEqual([
      { type: 'system', text: '긴 답변입니다', _recovery: true }
    ]);
  });

  it('finalizes direct chat output and strips command echo', () => {
    vi.useFakeTimers();
    const session = createDirectTerminalChatSession({
      applySelectedChoice,
      cleanTuiOutput,
      filterDisplayChatMessages,
      isSpinnerNoise,
      removeCommandEcho,
      stripAnsi
    });

    session.setActive(true);
    expect(session.send('hello')).toBe(true);
    session.handleTerminalData('hello\r\n실행 결과');
    vi.runAllTimers();

    expect(session.getMessages()).toEqual([
      { type: 'user', text: 'hello' },
      { type: 'system', text: '실행 결과' }
    ]);
    vi.useRealTimers();
  });

  it('applies numbered choices through the shared selection helper', () => {
    const session = createDirectTerminalChatSession({
      applySelectedChoice,
      cleanTuiOutput,
      filterDisplayChatMessages,
      isSpinnerNoise,
      removeCommandEcho,
      stripAnsi
    });

    session.setActive(true);
    session.send('start');
    session.handleTerminalData('1. Alpha\n2. Beta');
    session.finalizeResponse();
    session.selectChoice('2');

    expect(session.getMessages()[1]).toMatchObject({
      type: 'system',
      _choiceMade: true
    });
    expect(session.getMessages()[2]).toEqual({ type: 'user', text: '2' });
  });
});
