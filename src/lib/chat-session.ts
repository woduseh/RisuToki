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

interface SharedChatOptions {
  applySelectedChoice(text: string, value: string): ChoiceResult;
  filterDisplayChatMessages(messages: ChatMessage[]): ChatMessage[];
  onUpdate?: () => void;
}

interface BufferedChatOptions extends SharedChatOptions {
  cleanTuiOutput(text: string): string;
  isAssistantWelcomeBanner(text: string): boolean;
  isSpinnerNoise(text: string): boolean;
  maxResponseMs?: number;
  promptFinalizeMs?: number;
  stripAnsi(text: string): string;
  backgroundBufferMax?: number;
  backgroundResetMs?: number;
}

interface DirectChatOptions extends SharedChatOptions {
  cleanTuiOutput(text: string): string;
  finalizeDelayMs?: number;
  isSpinnerNoise(text: string): boolean;
  maxResponseMs?: number;
  minChunkLength?: number;
  removeCommandEcho(text: string, lastCommand: string): string;
  stripAnsi(text: string): string;
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

function notify(onUpdate?: () => void): void {
  onUpdate?.();
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
  stripAnsi
}: BufferedChatOptions) {
  const state: ChatSessionState = {
    active: false,
    isStreaming: false,
    messages: [],
    waitForInput: true
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
    notify(onUpdate);
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
    notify(onUpdate);
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

      notify(onUpdate);
      return true;
    }

    if (state.isStreaming) {
      finalizeResponse();
    }
    state.active = false;
    notify(onUpdate);
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
    notify(onUpdate);
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
    notify(onUpdate);
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
    setActive
  };
}

export function createDirectTerminalChatSession({
  applySelectedChoice,
  cleanTuiOutput,
  filterDisplayChatMessages,
  finalizeDelayMs = 1500,
  isSpinnerNoise,
  maxResponseMs = 4000,
  minChunkLength = 2,
  onUpdate,
  removeCommandEcho,
  stripAnsi
}: DirectChatOptions) {
  const state: ChatSessionState = {
    active: false,
    isStreaming: false,
    messages: [],
    waitForInput: true
  };

  let buffer = '';
  let finalizeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSentCommand = '';
  let maxTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers(): void {
    if (finalizeTimer) clearTimeout(finalizeTimer);
    if (maxTimer) clearTimeout(maxTimer);
    finalizeTimer = null;
    maxTimer = null;
  }

  function finalizeResponse(): string {
    if (!state.isStreaming) return '';
    state.isStreaming = false;
    clearTimers();

    let display = buffer;
    if (lastSentCommand) {
      display = removeCommandEcho(display, lastSentCommand);
    }
    display = cleanTuiOutput(display);

    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && lastMessage.type === 'system') {
      lastMessage.text = display.trim();
    }

    buffer = '';
    lastSentCommand = '';
    state.messages = filterDisplayChatMessages(state.messages);
    notify(onUpdate);
    return display;
  }

  function setActive(active: boolean): boolean {
    state.active = active;
    if (active) {
      buffer = '';
      state.isStreaming = false;
      state.waitForInput = true;
      clearTimers();
    } else if (state.isStreaming) {
      finalizeResponse();
    }
    notify(onUpdate);
    return state.active;
  }

  function send(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;

    if (state.isStreaming) {
      state.isStreaming = false;
      buffer = '';
      clearTimers();
    }

    state.messages.push({ type: 'user', text: trimmed });
    lastSentCommand = trimmed;
    state.waitForInput = false;
    notify(onUpdate);
    return true;
  }

  function handleTerminalData(rawData: string): void {
    if (!state.active || state.waitForInput) return;

    const text = stripAnsi(rawData);
    if (!text || text.trim().length < minChunkLength) return;
    if (isSpinnerNoise(text)) return;

    buffer += text;

    if (!state.isStreaming) {
      state.isStreaming = true;
      state.messages.push({ type: 'system', text: '' });
      notify(onUpdate);
      maxTimer = setTimeout(() => {
        finalizeResponse();
      }, maxResponseMs);
    }

    if (finalizeTimer) clearTimeout(finalizeTimer);
    finalizeTimer = setTimeout(() => {
      finalizeResponse();
    }, finalizeDelayMs);
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
    lastSentCommand = value;
    state.waitForInput = false;
    notify(onUpdate);
    return true;
  }

  return {
    finalizeResponse,
    getMessages: (): ChatMessage[] => cloneMessages(state.messages),
    getState: () => ({ ...state }),
    handleTerminalData,
    selectChoice,
    send,
    setActive
  };
}
