import { describe, expect, it } from 'vitest';
import {
  applySelectedChoice,
  cleanTuiOutput,
  extractChatChoices,
  filterDisplayChatMessages,
  isAssistantWelcomeBanner,
  isSpinnerNoise,
  removeCommandEcho,
  stripAnsi
} from './terminal-chat';

describe('terminal chat helpers', () => {
  it('strips ansi escape sequences and normalizes line breaks', () => {
    const raw = `alpha\x1B[31mbeta\x1B[0m\x1B[2Cto\r\ngamma`;

    expect(stripAnsi(raw)).toBe('alphabeta to\ngamma');
  });

  it('detects spinner noise and compact welcome banners', () => {
    expect(isSpinnerNoise('✻ Thinking…')).toBe(true);
    expect(isAssistantWelcomeBanner('--- Claude Code ---')).toBe(true);

    const welcome = `Welcome Claude ${'x'.repeat(90)} Sonnet 4.5 user@example.com C:\\repo\\workspace`;
    const cleaned = cleanTuiOutput(welcome);

    expect(cleaned).toContain('--- Claude Code ---');
    expect(cleaned).toContain('Sonnet 4.5');
    expect(cleaned).toContain('user@example.com');
    expect(cleaned).toContain('C:\\repo\\workspace');
    expect(cleaned).toContain('준비 완료!');
  });

  it('extracts numbered chat choices and applies the selected answer', () => {
    const text = '선택하세요\n1. 첫 번째\n2. 두 번째';

    expect(extractChatChoices(text)).toEqual([
      { value: '1', label: '1. 첫 번째' },
      { value: '2', label: '2. 두 번째' }
    ]);

    expect(applySelectedChoice(text, '2')).toEqual({
      applied: true,
      selectedLabel: '2. 두 번째',
      text: '선택하세요\n\n> 2. 두 번째'
    });

    expect(extractChatChoices('1. 하나\n3. 셋')).toEqual([]);
  });

  it('filters display-only chat messages and removes echoed commands', () => {
    const filtered = filterDisplayChatMessages([
      { type: 'system', text: '  ' },
      { type: 'system', text: 'abc' },
      { type: 'system', text: '충분한 길이의 응답' },
      { type: 'user', text: 'ok' }
    ]);

    expect(filtered).toEqual([
      { type: 'system', text: '충분한 길이의 응답' },
      { type: 'user', text: 'ok' }
    ]);

    expect(removeCommandEcho('> /status\n응답 본문', '/status')).toBe('응답 본문');
  });
});
