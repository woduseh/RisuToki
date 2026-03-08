<script setup lang="ts">
import { useAppStore } from '../stores/app-store';

const store = useAppStore();

const emit = defineEmits<{
  action: [action: string];
  'context-action': [action: string, event: MouseEvent];
}>();

function onRpClick() {
  emit('action', 'rp-toggle');
}

function onBgmClick() {
  emit('action', 'bgm-toggle');
}

function onBgmContextMenu(e: MouseEvent) {
  e.preventDefault();
  emit('action', 'bgm-pick');
}

function onChatModeClick() {
  emit('action', 'chat-mode');
}

function onTerminalBgClick() {
  emit('action', 'terminal-bg');
}

function onTerminalToggle() {
  emit('action', 'toggle-terminal');
}
</script>

<template>
  <div id="terminal-area">
    <div id="terminal-header">
      <div class="momo-header-left">
        <span class="momo-icon">💬</span>
        <span class="momo-title">{{ store.talkTitle }}</span>
      </div>
      <div class="momo-header-right">
        <button
          id="btn-rp-mode"
          :title="store.rpMode !== 'off' ? `RP: ${store.rpLabel} (클릭: OFF)` : 'RP 모드 OFF (클릭: ON)'"
          :style="{ background: store.rpMode !== 'off' ? 'rgba(255,255,255,0.5)' : '' }"
          @click="onRpClick"
        >
          🐰
        </button>
        <button
          id="btn-bgm"
          :title="store.bgmEnabled ? 'BGM ON (우클릭: 파일 변경)' : 'BGM OFF (우클릭: 파일 변경)'"
          :style="{ background: store.bgmEnabled ? 'rgba(255,255,255,0.5)' : '' }"
          @click="onBgmClick"
          @contextmenu="onBgmContextMenu"
        >
          {{ store.bgmEnabled ? '🔊' : '🔇' }}
        </button>
        <button id="btn-chat-mode" title="채팅 모드" style="display: none" @click="onChatModeClick">💭</button>
        <button id="btn-terminal-bg" title="배경 이미지 설정" @click="onTerminalBgClick">🖼</button>
        <button id="btn-terminal-toggle" title="터미널 토글" @click="onTerminalToggle">━</button>
      </div>
    </div>
    <div id="terminal-container" ref="terminalContainer"></div>
  </div>
</template>
