<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  IconDeviceFloppy,
  IconPlayerPlay,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRightCollapse,
  IconTerminal2,
  IconWand,
  IconPencil,
  IconDots,
  IconChevronDown,
  IconGitCompare,
} from '@tabler/icons-vue';
import { useAppStore } from '../stores/app-store';
import { useWorkbenchStore } from '../stores/workbench-store';
import { getVisibleRisupFieldGroups } from '../lib/risup-fields';

const store = useAppStore();
const workbench = useWorkbenchStore();
const emit = defineEmits<{ action: [action: string] }>();
const isPreset = computed(() => store.fileData?._fileType === 'risup');
const presetMenuOpen = ref(false);
const settingsOpen = ref(false);
const presetMenu = ref<HTMLElement | null>(null);
const presetMenuButton = ref<HTMLButtonElement | null>(null);
const additionalGroupIds = new Set([
  'ordering',
  'templates',
  'model-api',
  'parameters',
  'sampling',
  'thinking',
  'provider-endpoint',
  'advanced',
  'json-schema',
  'misc',
]);
const additionalGroups = getVisibleRisupFieldGroups().filter((group) => additionalGroupIds.has(group.id));

function closePresetMenu(restoreFocus = false) {
  presetMenuOpen.value = false;
  settingsOpen.value = false;
  if (restoreFocus) presetMenuButton.value?.focus();
}

async function togglePresetMenu() {
  if (presetMenuOpen.value) return closePresetMenu();
  presetMenuOpen.value = true;
  await nextTick();
  presetMenu.value?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
}

function selectPresetAction(action: string) {
  closePresetMenu(true);
  emit('action', action);
}

function onOutsideClick(event: MouseEvent | FocusEvent) {
  if (!(event.target instanceof Node)) return;
  if (!presetMenu.value?.contains(event.target) && !presetMenuButton.value?.contains(event.target)) closePresetMenu();
}

function onPresetMenuKeydown(event: KeyboardEvent) {
  const entries = Array.from(presetMenu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
  const index = entries.indexOf(document.activeElement as HTMLButtonElement);
  let next = index;
  if (event.key === 'ArrowDown') next = (index + 1) % entries.length;
  else if (event.key === 'ArrowUp') next = (index - 1 + entries.length) % entries.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = entries.length - 1;
  else return;
  event.preventDefault();
  entries[next]?.focus();
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !presetMenuOpen.value) return;
  event.preventDefault();
  closePresetMenu(true);
}

watch(
  () => store.fileData,
  () => closePresetMenu(),
);
onMounted(() => {
  document.addEventListener('click', onOutsideClick);
  document.addEventListener('focusin', onOutsideClick);
  document.addEventListener('keydown', onEscape);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onOutsideClick);
  document.removeEventListener('focusin', onOutsideClick);
  document.removeEventListener('keydown', onEscape);
});

const showWizard = computed(
  () => store.hasFile && store.workspaceId === 'assets' && store.fileData?._fileType !== 'risup',
);
</script>

<template>
  <nav id="workspace-bar" aria-label="파일 작업공간">
    <button
      type="button"
      class="workspace-pane-toggle"
      :class="{ active: store.navigatorVisible }"
      title="탐색기 전환"
      aria-label="탐색기 전환"
      :aria-pressed="store.navigatorVisible"
      @click="store.toggleNavigator()"
    >
      <IconLayoutSidebarLeftCollapse :size="18" stroke-width="1.8" />
    </button>

    <div class="workspace-document">
      <strong :title="store.displayFileLabel">{{
        store.fileData?.name || store.displayFileLabel || '작업 시작'
      }}</strong>
      <button
        v-if="isPreset"
        type="button"
        class="workspace-pane-toggle preset-rename"
        title="프리셋 이름 변경"
        aria-label="프리셋 이름 변경"
        @click="emit('action', 'rename-preset')"
      >
        <IconPencil :size="16" />
      </button>
      <span v-if="store.hasFile"
        >{{ (store.fileData?._fileType || 'charx').toUpperCase()
        }}<template v-if="store.projectPath"> · 프로젝트</template></span
      >
    </div>

    <div class="workspace-trailing-actions">
      <div v-if="isPreset" class="preset-menu-anchor">
        <button
          id="btn-preset-menu"
          ref="presetMenuButton"
          type="button"
          class="workspace-pane-toggle"
          title="프리셋 더 보기"
          aria-label="프리셋 더 보기"
          aria-haspopup="menu"
          aria-controls="preset-more-menu"
          :aria-expanded="presetMenuOpen"
          @click.stop="togglePresetMenu()"
          @keydown.down.prevent="!presetMenuOpen && togglePresetMenu()"
        >
          <IconDots :size="18" />
        </button>
        <div
          v-if="presetMenuOpen"
          id="preset-more-menu"
          ref="presetMenu"
          class="preset-more-menu"
          role="menu"
          aria-labelledby="btn-preset-menu"
          @keydown="onPresetMenuKeydown"
        >
          <button type="button" role="menuitem" @click="selectPresetAction('risup-description')">프리셋 설명</button>
          <button
            type="button"
            role="menuitem"
            :aria-expanded="settingsOpen"
            aria-controls="preset-additional-settings"
            @click="settingsOpen = !settingsOpen"
          >
            추가 설정 <IconChevronDown :size="16" :class="{ expanded: settingsOpen }" />
          </button>
          <div
            v-if="settingsOpen"
            id="preset-additional-settings"
            role="group"
            aria-label="추가 설정"
            class="preset-additional-settings"
          >
            <button
              v-for="group in additionalGroups"
              :key="group.id"
              type="button"
              role="menuitem"
              :data-preset-setting="group.id"
              @click="selectPresetAction(`risup-settings:${group.id}`)"
            >
              {{ group.label }}
            </button>
          </div>
        </div>
      </div>
      <div class="workspace-document-actions">
        <button
          id="btn-workspace-preview"
          type="button"
          class="workspace-tab"
          :class="{ active: workbench.previewOpen }"
          :aria-pressed="workbench.previewOpen"
          :disabled="!workbench.previewOpen && !store.canPreviewCurrentFile"
          :title="workbench.previewOpen ? '미리보기 닫기' : '미리보기 (F5)'"
          @click="$emit('action', workbench.previewOpen ? 'preview-close' : 'preview-test')"
        >
          <IconPlayerPlay :size="17" /> 미리보기
        </button>
        <button
          id="btn-workspace-review"
          type="button"
          class="workspace-tab"
          :class="{ active: workbench.reviewOpen }"
          :aria-pressed="workbench.reviewOpen"
          :disabled="!store.hasFile"
          title="저장본과 변경 검토"
          @click="$emit('action', 'review-toggle')"
        >
          <IconGitCompare :size="17" /> 변경 검토
        </button>
        <button
          id="btn-workspace-save"
          type="button"
          class="workspace-tab"
          :disabled="!store.hasFile"
          title="저장 (Ctrl+S)"
          @click="$emit('action', 'save')"
        >
          <IconDeviceFloppy :size="17" /> 저장
        </button>
      </div>
      <button
        v-if="showWizard"
        type="button"
        class="workspace-primary-action"
        title="출력식 마법사"
        aria-label="출력식 마법사"
        @click="$emit('action', 'asset-output-wizard')"
      >
        <IconWand :size="17" stroke-width="1.8" />
        <span>출력식 마법사</span>
      </button>

      <button
        id="btn-workspace-terminal-toggle"
        type="button"
        class="workspace-pane-toggle"
        :class="{ active: store.activeUtility === 'terminal' }"
        :title="store.activeUtility === 'terminal' ? '터미널 닫기' : '터미널 열기'"
        :aria-label="store.activeUtility === 'terminal' ? '터미널 닫기' : '터미널 열기'"
        :aria-pressed="store.activeUtility === 'terminal'"
        @click="store.toggleUtility('terminal')"
      >
        <IconTerminal2 :size="18" stroke-width="1.8" />
      </button>

      <button
        id="btn-right-sidebar-toggle"
        type="button"
        class="workspace-pane-toggle"
        :class="{ active: store.rightSidebarVisible }"
        title="참고자료 패널 전환"
        aria-label="참고자료 패널 전환"
        :aria-pressed="store.rightSidebarVisible"
        @click="$emit('action', 'toggle-right-sidebar')"
      >
        <IconLayoutSidebarRightCollapse :size="18" stroke-width="1.8" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
#workspace-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 48px;
  padding: 6px 10px;
  background: var(--ui-shell-elevated, #182236);
  border-bottom: 1px solid var(--ui-border, rgba(148, 163, 184, 0.18));
  position: relative;
  z-index: 20;
}

.workspace-tabs {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.workspace-trailing-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.workspace-tabs::-webkit-scrollbar {
  display: none;
}

.workspace-tab,
.workspace-pane-toggle,
.workspace-primary-action {
  border: 0;
  min-height: 34px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  white-space: nowrap;
  color: var(--ui-text-muted, #94a3b8);
  background: transparent;
  cursor: pointer;
}

.workspace-tab {
  padding: 0 12px;
  font-weight: 650;
  font-size: 13px;
}

.workspace-tab:hover,
.workspace-pane-toggle:hover {
  color: var(--ui-text, #e5edf8);
  background: var(--ui-control-hover, rgba(148, 163, 184, 0.1));
}

.workspace-tab.active {
  color: var(--ui-accent-strong, #5eead4);
  background: var(--ui-selected, rgba(45, 212, 191, 0.13));
  box-shadow: inset 0 0 0 1px var(--ui-selected-border, rgba(45, 212, 191, 0.24));
}

.workspace-pane-toggle {
  width: 34px;
  flex: 0 0 34px;
}

.workspace-pane-toggle.active {
  color: var(--ui-text, #e5edf8);
  background: var(--ui-control, rgba(148, 163, 184, 0.1));
}

.workspace-pane-toggle:disabled {
  opacity: 0.38;
  cursor: default;
}

.workspace-tab:disabled {
  opacity: 0.45;
  cursor: default;
}
.workspace-document {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.preset-rename {
  align-self: center;
  width: 28px;
  flex-basis: 28px;
  min-height: 28px;
  margin-left: -5px;
}
.preset-menu-anchor {
  position: relative;
}
.preset-more-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 240px;
  max-height: min(520px, calc(100vh - 150px));
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-shell-elevated, #182236);
  box-shadow: 0 12px 28px #0003;
}
.preset-more-menu button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 34px;
  padding: 7px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text);
  text-align: left;
  cursor: pointer;
}
.preset-more-menu button:hover,
.preset-more-menu button:focus-visible {
  background: var(--ui-control-hover);
}
.preset-more-menu button:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}
.preset-additional-settings {
  margin-left: 10px;
  border-left: 1px solid var(--ui-border);
  padding-left: 4px;
}
.preset-more-menu .expanded {
  transform: rotate(180deg);
}
.workspace-document strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text);
  font-size: 14px;
}
.workspace-document > span {
  flex-shrink: 0;
  color: var(--ui-text-muted);
  font-size: 12px;
}
.workspace-document-actions {
  display: flex;
  gap: 2px;
  padding-right: 8px;
  border-right: 1px solid var(--ui-border);
}

.workspace-primary-action {
  padding: 0 12px;
  color: #062a27;
  background: var(--ui-accent, #2dd4bf);
  font-weight: 750;
}

.workspace-primary-action:hover {
  filter: brightness(1.08);
}

@media (max-width: 1100px) {
  .workspace-tab {
    padding: 0 9px;
  }

  .workspace-primary-action span {
    display: none;
  }
}
</style>
