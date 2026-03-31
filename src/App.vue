<script setup lang="ts">
import { useAppStore } from './stores/app-store';
import { executeAction } from './lib/action-registry';
import MenuBar from './components/MenuBar.vue';
import StatusBar from './components/StatusBar.vue';

const store = useAppStore();

function handleAction(action: string) {
  executeAction(action);
}
</script>

<template>
  <MenuBar @action="handleAction">
    <template #file-label>
      <span id="file-label">{{ store.fileLabel }}</span>
    </template>
  </MenuBar>

  <div id="app-body">
    <div id="slot-far-left" class="layout-slot slot-v"></div>
    <div id="resizer-far-left" class="slot-resizer slot-resizer-v"></div>

    <div id="layout-center">
      <div id="slot-top" class="layout-slot slot-h"></div>
      <div id="resizer-top" class="slot-resizer slot-resizer-h"></div>

      <div id="main-container">
        <div id="slot-left" class="layout-slot slot-v active"></div>
        <div id="resizer-left" class="slot-resizer slot-resizer-v active"></div>

        <div id="editor-area">
          <div id="editor-tabs"></div>
          <div id="editor-container"></div>
        </div>

        <div id="resizer-right" class="slot-resizer slot-resizer-v"></div>
        <div id="slot-right" class="layout-slot slot-v"></div>
      </div>

      <div id="resizer-bottom" class="slot-resizer slot-resizer-h active"></div>
      <div id="slot-bottom" class="layout-slot slot-h active"></div>
    </div>

    <div id="resizer-far-right" class="slot-resizer slot-resizer-v"></div>
    <div id="slot-far-right" class="layout-slot slot-v"></div>

    <div id="sidebar">
      <div id="sidebar-items-section" class="sidebar-section">
        <div class="sidebar-header">
          <span>항목</span>
          <div class="sidebar-header-btns">
            <button
              id="btn-sidebar-collapse"
              class="panel-collapse-btn"
              title="사이드바 접기"
              aria-label="사이드바 접기"
              @click="handleAction('toggle-sidebar')"
            >
              ◀
            </button>
          </div>
        </div>
        <div id="sidebar-tree"></div>
      </div>
      <div id="sidebar-split-resizer" class="resizer resizer-h"></div>
      <div id="sidebar-refs-section" class="sidebar-section">
        <div class="sidebar-header sidebar-header-refs">
          <span>참고자료</span>
          <div class="sidebar-header-btns">
            <button
              id="btn-refs-extpopout"
              class="panel-collapse-btn"
              title="팝아웃 (외부 창)"
              data-popout-panel="refs"
            >
              ↗
            </button>
            <button id="btn-refs-separate" class="panel-collapse-btn" title="분리">⧉</button>
            <button id="btn-refs-collapse" class="panel-collapse-btn" title="접기">▼</button>
            <button id="btn-refs-close" class="panel-collapse-btn" title="닫기">✕</button>
          </div>
        </div>
        <div id="sidebar-refs"></div>
      </div>
    </div>

    <div id="refs-panel">
      <div class="refs-panel-header">
        <span>참고자료</span>
        <div class="sidebar-header-btns">
          <button
            id="btn-refs-panel-popout"
            class="panel-collapse-btn"
            title="팝아웃 (외부 창)"
            data-popout-panel="refs"
          >
            ↗
          </button>
          <button id="btn-refs-panel-dock" class="panel-collapse-btn" title="사이드바로 복귀">⇲</button>
        </div>
      </div>
      <div id="refs-panel-content" class="refs-panel-content"></div>
    </div>

    <div id="bottom-area">
      <div id="toki-avatar">
        <button
          id="btn-avatar-collapse"
          type="button"
          class="panel-collapse-btn avatar-collapse"
          title="아바타 접기"
          aria-label="아바타 접기"
          @click="handleAction('toggle-avatar')"
        >
          ✕
        </button>
        <div id="toki-avatar-display"></div>
        <div id="toki-status">
          <span id="toki-status-icon">💤</span>
          <span id="toki-status-text"></span>
        </div>
        <button id="toki-help-btn" type="button" aria-label="도움말 열기" @click="handleAction('help')">
          ❓ 도움말
        </button>
      </div>
      <div id="avatar-resizer" class="resizer resizer-h" style="display: none"></div>
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
              :aria-label="store.rpMode !== 'off' ? `RP 모드: ${store.rpLabel}` : 'RP 모드 OFF'"
              :aria-pressed="store.rpMode !== 'off'"
              :style="{ background: store.rpMode !== 'off' ? 'rgba(255,255,255,0.5)' : '' }"
              @click="handleAction('rp-toggle')"
            >
              🐰
            </button>
            <button
              id="btn-bgm"
              :title="store.bgmEnabled ? 'BGM ON (우클릭: 파일 변경)' : 'BGM OFF (우클릭: 파일 변경)'"
              :aria-label="store.bgmEnabled ? 'BGM 켜짐' : 'BGM 꺼짐'"
              :aria-pressed="store.bgmEnabled"
              :style="{ background: store.bgmEnabled ? 'rgba(255,255,255,0.5)' : '' }"
              @click="handleAction('bgm-toggle')"
              @contextmenu.prevent="handleAction('bgm-pick')"
            >
              {{ store.bgmEnabled ? '🔊' : '🔇' }}
            </button>
            <button id="btn-chat-mode" title="채팅 모드" style="display: none" @click="handleAction('chat-mode')">
              💭
            </button>
            <button
              id="btn-terminal-bg"
              title="배경 이미지 설정"
              aria-label="배경 이미지 설정"
              @click="handleAction('terminal-bg')"
            >
              🖼
            </button>
            <button
              id="btn-terminal-toggle"
              title="터미널 토글"
              aria-label="터미널 토글"
              @click="handleAction('toggle-terminal')"
            >
              ━
            </button>
          </div>
        </div>
        <div id="terminal-container"></div>
      </div>
    </div>

    <div
      id="sidebar-expand"
      title="사이드바 열기"
      aria-label="사이드바 열기"
      style="display: none"
      @click="handleAction('sidebar-expand')"
    >
      ▶
    </div>
  </div>

  <StatusBar />
</template>

<style>
#app {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
