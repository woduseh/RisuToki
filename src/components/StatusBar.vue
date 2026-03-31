<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAppStore } from '../stores/app-store';

const store = useAppStore();
const visible = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const statusClasses = computed(() => ({
  visible: visible.value,
  'status-info': store.statusKind === 'info',
  'status-error': store.statusKind === 'error',
  sticky: store.statusSticky,
}));

watch(
  () => [store.statusText, store.statusSticky] as const,
  ([text, sticky]) => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (text) {
      visible.value = true;
      if (!sticky) {
        hideTimer = setTimeout(() => {
          visible.value = false;
        }, 3000);
      }
    } else {
      visible.value = false;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (hideTimer) {
    clearTimeout(hideTimer);
  }
});
</script>

<template>
  <div id="statusbar" :class="statusClasses" role="status" aria-live="polite" aria-atomic="true">
    <span id="status-text">{{ store.statusText }}</span>
  </div>
</template>
