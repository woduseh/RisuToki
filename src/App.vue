<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import {
  IconArrowUpRight,
  IconBook2,
  IconClock,
  IconFilePlus,
  IconFolderOpen,
  IconHelpCircle,
  IconMasksTheater,
  IconMusic,
  IconMusicOff,
  IconPhoto,
  IconRobot,
  IconTerminal2,
  IconX,
} from '@tabler/icons-vue';
import { useAppStore } from './stores/app-store';
import { executeAction } from './lib/action-registry';
import MenuBar from './components/MenuBar.vue';
import StatusBar from './components/StatusBar.vue';
import WorkspaceBar from './components/WorkspaceBar.vue';
import ContextInspector from './components/ContextInspector.vue';
import AssetOutputWizard from './components/AssetOutputWizard.vue';
import { writeWorkspaceLayoutState } from './lib/workspace-layout-state';
import { TOKI_APP_ICON } from './lib/avatar';
import { showHelpPopup } from './lib/help-popup';

const store = useAppStore();
const shellStyle = computed(() => ({
  '--navigator-width': `${store.navigatorWidth}px`,
  '--inspector-width': `${store.inspectorWidth}px`,
  '--utility-height': `${store.utilityHeight}px`,
}));
const hasEditorContent = computed(() => store.hasFile || store.activeTabId !== null);

function currentWorkspaceLayout() {
  return {
    version: 2 as const,
    navigatorWidth: store.navigatorWidth,
    inspectorWidth: store.inspectorWidth,
    utilityHeight: store.utilityHeight,
    navigatorVisible: store.navigatorVisible,
    inspectorVisible: store.inspectorVisible,
    avatarVisible: store.avatarVisible,
    referencesVisible: store.referencesVisible,
    activeUtility: store.activeUtility,
  };
}

let layoutWriteTimer: number | null = null;
function scheduleWorkspaceLayoutWrite() {
  if (layoutWriteTimer !== null) window.clearTimeout(layoutWriteTimer);
  layoutWriteTimer = window.setTimeout(() => {
    layoutWriteTimer = null;
    writeWorkspaceLayoutState(currentWorkspaceLayout());
  }, 120);
}

watch(
  () =>
    [
      store.navigatorWidth,
      store.inspectorWidth,
      store.utilityHeight,
      store.navigatorVisible,
      store.inspectorVisible,
      store.avatarVisible,
      store.referencesVisible,
      store.activeUtility,
    ] as const,
  scheduleWorkspaceLayoutWrite,
);

onBeforeUnmount(() => {
  if (layoutWriteTimer === null) return;
  window.clearTimeout(layoutWriteTimer);
  layoutWriteTimer = null;
  writeWorkspaceLayoutState(currentWorkspaceLayout());
});

function startPaneResize(kind: 'navigator' | 'inspector' | 'utility', event: PointerEvent) {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const startValue =
    kind === 'navigator' ? store.navigatorWidth : kind === 'inspector' ? store.inspectorWidth : store.utilityHeight;
  let pendingPosition: { x: number; y: number } | null = null;
  let resizeFrame: number | null = null;
  const applyPosition = ({ x, y }: { x: number; y: number }) => {
    if (kind === 'navigator') store.setNavigatorWidth(startValue + x - startX);
    else if (kind === 'inspector') store.setInspectorWidth(startValue - x + startX);
    else store.setUtilityHeight(startValue + startY - y);
  };
  const flushPosition = () => {
    resizeFrame = null;
    if (!pendingPosition) return;
    const position = pendingPosition;
    pendingPosition = null;
    applyPosition(position);
  };
  const onMove = (moveEvent: PointerEvent) => {
    pendingPosition = { x: moveEvent.clientX, y: moveEvent.clientY };
    if (resizeFrame === null) resizeFrame = window.requestAnimationFrame(flushPosition);
  };
  const onUp = () => {
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
    }
    flushPosition();
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('workspace-resizing', `workspace-resizing-${kind}`);
    if (kind === 'utility') document.body.classList.remove('utility-resizing');
    window.dispatchEvent(new Event('resize'));
  };
  document.body.classList.add('workspace-resizing', `workspace-resizing-${kind}`);
  if (kind === 'utility') document.body.classList.add('utility-resizing');
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

function resizeWithKeyboard(kind: 'navigator' | 'inspector' | 'utility', event: KeyboardEvent) {
  const step = event.shiftKey ? 50 : 10;
  if (kind === 'utility' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    store.setUtilityHeight(store.utilityHeight + (event.key === 'ArrowUp' ? step : -step));
  } else if (kind !== 'utility' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? step : -step;
    if (kind === 'navigator') store.setNavigatorWidth(store.navigatorWidth + direction);
    else store.setInspectorWidth(store.inspectorWidth - direction);
  }
}

function handleAction(action: string, payload?: unknown) {
  if (action === 'toggle-references') {
    toggleReferences();
    return;
  }
  if (action === 'reset-workspace-layout') {
    store.resetWorkspaceLayout();
    store.setStatus('UI 배치를 초기 상태로 되돌렸습니다.');
    window.dispatchEvent(new Event('resize'));
    return;
  }
  executeAction(action, payload);
}

function toggleReferences() {
  const opening = !store.referencesVisible;
  store.toggleReferences();
  if (opening) handleAction('refresh-references');
}

function recentName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}
</script>

<template>
  <MenuBar
    :can-preview-current-file="store.canPreviewCurrentFile"
    :recent-items="store.recentItems"
    :references-open="store.referencesVisible"
    @action="handleAction"
  >
    <template #file-label>
      <span id="file-label">{{ store.displayFileLabel }}</span>
    </template>
  </MenuBar>

  <div
    id="app-body"
    :class="{
      'navigator-open': store.navigatorVisible,
      'inspector-open': store.inspectorVisible && store.hasInspectorContext,
      'utility-open': store.activeUtility,
      'avatar-visible': store.avatarVisible,
      'references-open': store.referencesVisible,
    }"
    :data-workspace="store.workspaceId"
    :data-utility="store.activeUtility || 'closed'"
    :style="shellStyle"
  >
    <WorkspaceBar @action="handleAction" />

    <div id="workspace-shell">
      <aside id="workspace-navigator" aria-label="작업공간 탐색기">
        <div id="slot-left" class="layout-slot slot-v active">
          <div id="sidebar">
            <div id="sidebar-items-section" class="sidebar-section">
              <div class="sidebar-header"><span>탐색기</span></div>
              <div id="sidebar-tree"></div>
            </div>
          </div>
          <div id="lore-manager-panel" class="manager-panel"></div>
          <div id="asset-manager-panel" class="manager-panel"></div>
          <div id="prompt-manager-panel" class="manager-panel"></div>
        </div>
      </aside>
      <div
        id="navigator-resizer"
        class="workspace-resizer"
        role="separator"
        aria-label="탐색기 너비 조절"
        aria-orientation="vertical"
        tabindex="0"
        @pointerdown="startPaneResize('navigator', $event)"
        @keydown="resizeWithKeyboard('navigator', $event)"
      ></div>

      <section id="workspace-editor" aria-label="편집기">
        <div v-if="!hasEditorContent" id="welcome-screen">
          <img class="welcome-mark" :src="TOKI_APP_ICON" alt="" />
          <h1>무엇을 만들까요?</h1>
          <p>캐릭터, 모듈, 프롬프트 파일을 열거나 새 작업을 시작하세요.</p>
          <div class="welcome-actions">
            <button type="button" class="primary" @click="handleAction('open')">
              <IconFolderOpen :size="19" /> 파일 열기
            </button>
            <button type="button" @click="handleAction('new')"><IconFilePlus :size="19" /> 새 문서</button>
          </div>
          <div v-if="store.recentItems.length" class="recent-work">
            <div class="recent-heading"><IconClock :size="16" /> 최근 작업</div>
            <button
              v-for="item in store.recentItems.slice(0, 6)"
              :key="`${item.kind}:${item.path}`"
              type="button"
              @click="handleAction('open-recent-item', item)"
            >
              <span>
                <strong>{{ recentName(item.path) }}</strong>
                <small>{{ item.path }}</small>
              </span>
              <IconArrowUpRight :size="16" />
            </button>
          </div>
        </div>
        <div v-show="hasEditorContent" id="editor-surface">
          <div id="editor-header">
            <div id="editor-tabs"></div>
            <button id="editor-mode-toggle" type="button" style="display: none">코드 보기</button>
          </div>
          <div id="editor-container"></div>
        </div>
      </section>

      <div
        id="inspector-resizer"
        class="workspace-resizer"
        role="separator"
        aria-label="속성 패널 너비 조절"
        aria-orientation="vertical"
        tabindex="0"
        @pointerdown="startPaneResize('inspector', $event)"
        @keydown="resizeWithKeyboard('inspector', $event)"
      ></div>
      <ContextInspector v-show="store.hasInspectorContext" />
    </div>

    <aside v-show="store.referencesVisible" id="reference-drawer" aria-label="참고자료 서랍">
      <header class="reference-drawer-header">
        <span><IconBook2 :size="17" /> 참고자료</span>
        <div>
          <button
            type="button"
            class="icon-only"
            title="참고자료 팝아웃"
            aria-label="참고자료 팝아웃"
            @click="handleAction('popout-references')"
          >
            <IconArrowUpRight :size="17" />
          </button>
          <button
            type="button"
            class="icon-only"
            title="참고자료 닫기"
            aria-label="참고자료 닫기"
            @click="store.toggleReferences()"
          >
            <IconX :size="17" />
          </button>
        </div>
      </header>
      <div id="reference-drawer-body">
        <div id="refs-panel">
          <div id="refs-panel-content" class="refs-panel-content"></div>
        </div>
      </div>
    </aside>

    <section id="utility-shelf" aria-label="터미널 선반">
      <div
        v-if="store.activeUtility"
        id="utility-resizer"
        role="separator"
        aria-label="터미널 선반 높이 조절"
        aria-orientation="horizontal"
        aria-valuemin="130"
        aria-valuemax="520"
        :aria-valuenow="store.utilityHeight"
        tabindex="0"
        @pointerdown="startPaneResize('utility', $event)"
        @keydown="resizeWithKeyboard('utility', $event)"
      ></div>
      <div id="slot-bottom" class="layout-slot slot-h active">
        <div id="bottom-area" class="panel-in-h">
          <div id="toki-avatar">
            <button
              id="btn-avatar-collapse"
              type="button"
              class="panel-collapse-btn avatar-collapse"
              aria-label="아바타 숨기기"
              @click="store.toggleAvatar()"
            >
              <IconX :size="16" />
            </button>
            <div id="toki-avatar-display"></div>
            <div id="toki-status"><span id="toki-status-icon"></span><span id="toki-status-text"></span></div>
            <button id="toki-help-btn" type="button" aria-label="사용 설명서 열기" @click="showHelpPopup()">
              <IconHelpCircle :size="16" /><span>도움말</span>
            </button>
          </div>
          <div id="terminal-area">
            <div id="terminal-header">
              <div class="momo-header-left">
                <IconTerminal2 :size="17" /><span class="momo-title">{{ store.talkTitle }}</span>
              </div>
              <div class="momo-header-right">
                <button
                  id="btn-avatar-toggle"
                  :title="store.avatarVisible ? '아바타 숨기기' : '아바타 표시'"
                  :aria-label="store.avatarVisible ? '아바타 숨기기' : '아바타 표시'"
                  :aria-pressed="store.avatarVisible"
                  @click="store.toggleAvatar()"
                >
                  <IconRobot :size="16" />
                </button>
                <button
                  id="btn-chat-mode"
                  style="display: none"
                  aria-label="채팅 모드"
                  @click="handleAction('chat-mode')"
                >
                  채팅
                </button>
                <button
                  id="btn-terminal-bg"
                  title="배경 이미지 설정"
                  aria-label="배경 이미지 설정"
                  @click="handleAction('terminal-bg')"
                >
                  <IconPhoto :size="16" />
                </button>
                <button
                  id="btn-bgm-toggle"
                  :class="{ active: store.bgmEnabled }"
                  :title="store.bgmEnabled ? 'BGM 끄기' : 'BGM 켜기'"
                  :aria-label="store.bgmEnabled ? 'BGM 끄기' : 'BGM 켜기'"
                  :aria-pressed="store.bgmEnabled"
                  @click="handleAction('toggle-bgm')"
                >
                  <IconMusic v-if="store.bgmEnabled" :size="16" />
                  <IconMusicOff v-else :size="16" />
                </button>
                <button
                  id="btn-rp-mode"
                  class="terminal-mode-control"
                  :class="{ active: store.rpMode !== 'off' }"
                  :title="`RP 모드 전환 (현재: ${store.rpLabel})`"
                  :aria-label="`RP 모드 전환, 현재 ${store.rpLabel}`"
                  @click="handleAction('cycle-rp-mode')"
                >
                  <IconMasksTheater :size="16" /><span>RP {{ store.rpLabel }}</span>
                </button>
                <button
                  id="btn-terminal-popout"
                  title="터미널 팝아웃"
                  aria-label="터미널 팝아웃"
                  @click="handleAction('popout-terminal')"
                >
                  <IconArrowUpRight :size="16" />
                </button>
                <button
                  id="btn-terminal-toggle"
                  title="터미널 닫기"
                  aria-label="터미널 닫기"
                  @click="store.toggleUtility('terminal')"
                >
                  <IconX :size="16" />
                </button>
              </div>
            </div>
            <div id="terminal-tabs" class="terminal-tabs" role="tablist" aria-label="터미널 세션"></div>
            <div id="terminal-container"></div>
          </div>
        </div>
      </div>
    </section>
    <button
      v-if="!store.activeUtility"
      id="terminal-shelf-launcher"
      type="button"
      aria-label="터미널 열기"
      title="터미널 열기 (Ctrl+`)"
      @click="store.toggleUtility('terminal')"
    >
      <IconTerminal2 :size="16" /><span>터미널 열기</span>
    </button>
  </div>

  <StatusBar />
  <AssetOutputWizard />
</template>

<style>
#app {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}
</style>
