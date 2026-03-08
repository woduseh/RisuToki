<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAppStore } from '../stores/app-store';

const store = useAppStore();
const visible = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => store.statusText,
  (text) => {
    if (text) {
      visible.value = true;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        visible.value = false;
      }, 3000);
    }
  },
);
</script>

<template>
  <div id="statusbar" :class="{ visible }">
    <span id="status-text">{{ store.statusText }}</span>
  </div>
</template>
