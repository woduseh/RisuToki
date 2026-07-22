<script setup lang="ts">
import { computed, type Component } from 'vue';
import {
  IconBook2,
  IconBraces,
  IconCpu,
  IconDots,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRightCollapse,
  IconMessageCircle,
  IconPackage,
  IconPhoto,
  IconSettings,
  IconAdjustmentsHorizontal,
  IconSparkles,
  IconUser,
  IconWand,
} from '@tabler/icons-vue';
import { useAppStore } from '../stores/app-store';
import type { WorkspaceDefinition } from '../lib/workspace-model';

const store = useAppStore();
defineEmits<{ action: [action: string] }>();

const icons: Record<WorkspaceDefinition['icon'], Component> = {
  user: IconUser,
  message: IconMessageCircle,
  code: IconBraces,
  book: IconBook2,
  photo: IconPhoto,
  package: IconPackage,
  settings: IconSettings,
  sparkles: IconSparkles,
  cpu: IconCpu,
  sliders: IconAdjustmentsHorizontal,
  dots: IconDots,
};

const showWizard = computed(
  () => store.hasFile && store.workspaceId === 'assets' && store.fileData?._fileType !== 'risup',
);
</script>

<template>
  <nav v-if="store.hasFile" id="workspace-bar" aria-label="파일 작업공간">
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

    <div class="workspace-tabs" role="tablist" aria-label="작업공간">
      <button
        v-for="workspace in store.workspaceDefinitions"
        :key="workspace.id"
        type="button"
        class="workspace-tab"
        :class="{ active: store.workspaceId === workspace.id }"
        role="tab"
        :aria-selected="store.workspaceId === workspace.id"
        @click="store.setWorkspaceId(workspace.id)"
      >
        <component :is="icons[workspace.icon]" :size="17" stroke-width="1.8" />
        <span>{{ workspace.label }}</span>
      </button>
    </div>

    <button
      v-if="showWizard"
      type="button"
      class="workspace-primary-action"
      @click="$emit('action', 'asset-output-wizard')"
    >
      <IconWand :size="17" stroke-width="1.8" />
      <span>출력식 마법사</span>
    </button>

    <button
      type="button"
      class="workspace-pane-toggle"
      :class="{ active: store.inspectorVisible }"
      title="속성 패널 전환"
      aria-label="속성 패널 전환"
      :aria-pressed="store.inspectorVisible && store.hasInspectorContext"
      :disabled="!store.hasInspectorContext"
      @click="store.toggleInspector()"
    >
      <IconLayoutSidebarRightCollapse :size="18" stroke-width="1.8" />
    </button>
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

.workspace-primary-action {
  margin-left: auto;
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
