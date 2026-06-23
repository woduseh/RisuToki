<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAppStore } from '../stores/app-store';

const store = useAppStore();
const messageVisible = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function dismissStatus(): void {
  store.clearStatus();
}

const statusClasses = computed(() => ({
  visible: messageVisible.value || !!store.documentStatsText,
  'status-info': store.statusKind === 'info',
  'status-error': store.statusKind === 'error',
  sticky: store.statusSticky,
  'has-message': messageVisible.value && !!store.statusText,
  'has-stats': !!store.documentStatsText,
}));

const displayStatusText = computed(() => (messageVisible.value ? store.statusText : ''));

watch(
  () => [store.statusText, store.statusSticky] as const,
  ([text, sticky]) => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (text) {
      messageVisible.value = true;
      if (!sticky) {
        hideTimer = setTimeout(() => {
          messageVisible.value = false;
        }, 3000);
      }
    } else {
      messageVisible.value = false;
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
    <span id="status-text">{{ displayStatusText }}</span>
    <span v-if="store.documentStatsText" id="status-stats">{{ store.documentStatsText }}</span>
    <button
      v-if="displayStatusText"
      id="status-dismiss"
      type="button"
      title="상태 메시지 닫기"
      aria-label="상태 메시지 닫기"
      @click="dismissStatus"
    >
      ×
    </button>
  </div>
</template>
