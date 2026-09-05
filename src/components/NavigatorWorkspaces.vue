<script setup lang="ts">
import { useAppStore } from '../stores/app-store';
const store = useAppStore();

function navigate(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(
    event.currentTarget instanceof HTMLElement
      ? event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button')
      : [],
  );
  const current = buttons.indexOf(event.currentTarget as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (current + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
  event.preventDefault();
  buttons[next]?.focus();
  buttons[next]?.click();
}
</script>

<template>
  <nav v-if="store.hasFile" id="navigator-workspaces" aria-label="문서 구성">
    <button
      v-for="workspace in store.workspaceDefinitions"
      :key="workspace.id"
      type="button"
      :aria-current="store.workspaceId === workspace.id ? 'true' : undefined"
      :class="{ active: store.workspaceId === workspace.id }"
      @click="store.setWorkspaceId(workspace.id)"
      @keydown="navigate"
    >
      {{ workspace.label }}
    </button>
  </nav>
</template>
