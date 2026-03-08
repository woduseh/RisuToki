import { extractChatChoices } from './terminal-chat';
import type { ChatMessage } from './chat-session';

export interface ChatSession {
  feedBackgroundData(rawData: string): void;
  finalizeResponse(): string;
  getMessages(): ChatMessage[];
  getState(): { active: boolean; isStreaming: boolean; messages: ChatMessage[]; waitForInput: boolean };
  handleTerminalData(rawData: string): void;
  selectChoice(value: string): boolean;
  send(text: string): boolean;
  setActive(active: boolean): boolean;
}

export interface ChatUIDeps {
  chatSession: ChatSession;
  fitTerminal: () => void;
  isTerminalReady: () => boolean;
  terminalInput: (text: string) => void;
}

let chatMode = false;
let deps: ChatUIDeps | null = null;

export function isChatMode(): boolean {
  return chatMode;
}

export function initChatMode(terminalArea: HTMLElement, chatDeps: ChatUIDeps): void {
  deps = chatDeps;

  const chatView = document.createElement('div');
  chatView.id = 'chat-view';

  const chatMsgs = document.createElement('div');
  chatMsgs.id = 'chat-messages';

  const chatInputArea = document.createElement('div');
  chatInputArea.id = 'chat-input-area';

  const chatInput = document.createElement('input');
  chatInput.type = 'text';
  chatInput.id = 'chat-input';
  chatInput.placeholder = '메시지를 입력하세요...';

  const chatSendBtn = document.createElement('button');
  chatSendBtn.id = 'chat-send-btn';
  chatSendBtn.textContent = '전송';

  chatInputArea.appendChild(chatInput);
  chatInputArea.appendChild(chatSendBtn);
  chatView.appendChild(chatMsgs);
  chatView.appendChild(chatInputArea);
  terminalArea.appendChild(chatView);

  chatSendBtn.addEventListener('click', chatSendInput);
  chatInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      chatSendInput();
    }
  });

  document.getElementById('btn-chat-mode')!.addEventListener('click', toggleChatMode);
}

export function toggleChatMode(): void {
  if (!deps) return;
  chatMode = !chatMode;
  const termContainer = document.getElementById('terminal-container')!;
  const chatView = document.getElementById('chat-view')!;
  const btn = document.getElementById('btn-chat-mode')!;

  if (chatMode) {
    deps.chatSession.setActive(true);

    termContainer.style.display = 'none';
    chatView.classList.add('active');
    btn.style.background = 'rgba(255,255,255,0.5)';
    renderChatMessages();
    (document.getElementById('chat-input') as HTMLInputElement).focus();
  } else {
    deps.chatSession.setActive(false);
    termContainer.style.display = '';
    chatView.classList.remove('active');
    btn.style.background = '';
    deps.fitTerminal();
  }
}

function chatSendInput(): void {
  if (!deps) return;
  const input = document.getElementById('chat-input') as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  deps.chatSession.send(text);
  renderChatMessages();

  // Send to pty: text first, then Enter after short delay
  // Interactive CLI TUI needs separate text input and Enter key
  deps.terminalInput(text);
  setTimeout(() => {
    deps!.terminalInput('\r');
  }, 50);
}

export function onChatData(rawData: string): void {
  if (!deps) return;
  deps.chatSession.handleTerminalData(rawData);
}

export function finalizeChatResponse(): void {
  if (!deps) return;
  deps.chatSession.finalizeResponse();
  renderChatMessages();
}

export function feedBgBuffer(rawData: string): void {
  if (!deps) return;
  deps.chatSession.feedBackgroundData(rawData);
}

function renderChatMessages(): void {
  if (!deps) return;
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const chatState = deps.chatSession.getState();
  const chatMessages = deps.chatSession.getMessages();
  container.innerHTML = '';

  for (const msg of chatMessages) {
    if (!msg.text && !chatState.isStreaming) continue;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${msg.type}`;

    const name = document.createElement('div');
    name.className = 'chat-bubble-name';
    name.textContent = msg.type === 'user' ? 'You' : 'Toki';
    bubble.appendChild(name);

    const content = document.createElement('div');
    content.className = 'chat-bubble-text';
    content.textContent = msg.text || '...';
    bubble.appendChild(content);

    container.appendChild(bubble);

    // Detect numbered choices in system message and render buttons (skip if already chosen)
    if (msg.type === 'system' && msg.text && !chatState.isStreaming && !msg._choiceMade) {
      const choices = extractChatChoices(msg.text);
      if (choices.length >= 2) {
        const choiceContainer = document.createElement('div');
        choiceContainer.className = 'chat-choices';
        for (const choice of choices) {
          const btn = document.createElement('button');
          btn.className = 'chat-choice-btn';
          btn.textContent = choice.label;
          btn.addEventListener('click', () => sendChatChoice(choice.value));
          choiceContainer.appendChild(btn);
        }
        container.appendChild(choiceContainer);
      }
    }
  }

  container.scrollTop = container.scrollHeight;
}

function sendChatChoice(value: string): void {
  if (!deps || !deps.isTerminalReady()) return;
  deps.chatSession.selectChoice(value);
  renderChatMessages();
  deps.terminalInput(value);
  setTimeout(() => deps!.terminalInput('\r'), 50);
}
