export interface ChatMessage {
  type: 'user' | 'system';
  text: string;
  _choiceMade?: boolean;
  _recovery?: boolean;
}

interface ChoiceResult {
  applied: boolean;
  text: string;
}

interface BufferedChatOptions {
  applySelectedChoice(text: string, value: string): ChoiceResult;
  filterDisplayChatMessages(messages: ChatMessage[]): ChatMessage[];
  onUpdate?: () => void;
  cleanTuiOutput(text: string): string;
  isAssistantWelcomeBanner(text: string): boolean;
  isSpinnerNoise(text: string): boolean;
  maxResponseMs?: number;
  promptFinalizeMs?: number;
  stripAnsi(text: string): string;
  backgroundBufferMax?: number;
  backgroundResetMs?: number;
}

interface ChatSessionState {
  active: boolean;
  isStreaming: boolean;
  messages: ChatMessage[];
  waitForInput: boolean;
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({ ...message }));
}

export function createBufferedTerminalChatSession({
  applySelectedChoice,
  backgroundBufferMax = 8000,
  backgroundResetMs = 30_000,
  cleanTuiOutput,
  filterDisplayChatMessages,
  isAssistantWelcomeBanner,
  isSpinnerNoise,
  maxResponseMs = 4000,
  onUpdate,
  promptFinalizeMs = 500,
  stripAnsi,
}: BufferedChatOptions) {
  const state: ChatSessionState = {
    active: false,
    isStreaming: false,
    messages: [],
    waitForInput: true,
  };

  let backgroundBuffer = '';
  let backgroundResetTimer: ReturnType<typeof setTimeout> | null = null;
  let finalizeTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let lastResponseSnapshot = '';

  function clearFinalizeTimers(): void {
    if (finalizeTimer) clearTimeout(finalizeTimer);
    if (maxTimer) clearTimeout(maxTimer);
    finalizeTimer = null;
    maxTimer = null;
  }

  function clearBackgroundTimer(): void {
    if (backgroundResetTimer) clearTimeout(backgroundResetTimer);
    backgroundResetTimer = null;
  }

  function clearBuffers(): void {
    backgroundBuffer = '';
    lastResponseSnapshot = '';
    clearBackgroundTimer();
  }

  function beginStreaming(): void {
    if (state.isStreaming) return;
    state.isStreaming = true;
    state.messages.push({ type: 'system', text: '' });
    maxTimer = setTimeout(() => {
      finalizeResponse();
    }, maxResponseMs);
    onUpdate?.();
  }

  function finalizeResponse(): string {
    if (!state.isStreaming) return '';
    state.isStreaming = false;
    clearFinalizeTimers();

    let display = cleanTuiOutput(backgroundBuffer || lastResponseSnapshot);
    if (isAssistantWelcomeBanner(display.trim())) {
      display = '';
    }

    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && lastMessage.type === 'system') {
      lastMessage.text = display.trim();
    }

    state.waitForInput = true;
    clearBuffers();
    state.messages = filterDisplayChatMessages(state.messages);
    onUpdate?.();
    return display;
  }

  function setActive(active: boolean): boolean {
    if (active) {
      state.active = true;
      state.isStreaming = false;
      state.waitForInput = true;
      clearFinalizeTimers();
      state.messages = state.messages.filter((message) => !message._recovery);

      const recoverySource = backgroundBuffer.trim() || lastResponseSnapshot.trim();
      if (recoverySource) {
        const cleaned = cleanTuiOutput(backgroundBuffer.trim() ? backgroundBuffer : lastResponseSnapshot);
        if (!isAssistantWelcomeBanner(cleaned.trim()) && cleaned.trim().length > 5) {
          state.messages.push({ type: 'system', text: cleaned.trim(), _recovery: true });
        }
        clearBuffers();
      }

      onUpdate?.();
      return true;
    }

    if (state.isStreaming) {
      finalizeResponse();
    }
    state.active = false;
    onUpdate?.();
    return false;
  }

  function send(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;

    if (state.isStreaming) {
      state.isStreaming = false;
      clearFinalizeTimers();
    }

    state.messages.push({ type: 'user', text: trimmed });
    state.waitForInput = false;
    clearBuffers();
    onUpdate?.();
    return true;
  }

  function feedBackgroundData(rawData: string): void {
    const text = stripAnsi(rawData);
    if (!text) return;

    const hasMarker = text.includes('●');
    if (!hasMarker && text.trim().length < 2) return;
    if (!hasMarker && isSpinnerNoise(text)) return;

    backgroundBuffer += text;
    if (backgroundBuffer.length > backgroundBufferMax) {
      backgroundBuffer = backgroundBuffer.slice(-backgroundBufferMax);
    }

    if (backgroundBuffer.includes('●')) {
      lastResponseSnapshot = backgroundBuffer;
    }

    clearBackgroundTimer();
    backgroundResetTimer = setTimeout(() => {
      clearBuffers();
    }, backgroundResetMs);
  }

  function handleTerminalData(rawData: string): void {
    if (!state.active || state.waitForInput) return;
    const text = stripAnsi(rawData);
    if (!text) return;

    beginStreaming();

    if (/❯/.test(text) || /\?\s*for\s+shortcuts/i.test(text)) {
      if (finalizeTimer) clearTimeout(finalizeTimer);
      finalizeTimer = setTimeout(() => {
        finalizeResponse();
      }, promptFinalizeMs);
    }
  }

  function selectChoice(value: string): boolean {
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      const message = state.messages[index];
      if (message.type === 'system' && message.text) {
        const selected = applySelectedChoice(message.text, value);
        if (selected.applied) {
          message.text = selected.text;
          message._choiceMade = true;
          break;
        }
      }
    }

    state.messages.push({ type: 'user', text: value });
    state.waitForInput = false;
    clearBuffers();
    onUpdate?.();
    return true;
  }

  return {
    feedBackgroundData,
    finalizeResponse,
    getMessages: (): ChatMessage[] => cloneMessages(state.messages),
    getState: () => ({ ...state }),
    handleTerminalData,
    selectChoice,
    send,
    setActive,
  };
}
