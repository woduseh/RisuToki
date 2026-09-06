import { defineStore } from 'pinia';
import { ref } from 'vue';
import { MCP_ACTIVITY_LIMIT, type McpActivityEvent } from '../lib/mcp-activity-types';

export const useMcpActivityStore = defineStore('mcp-activity', () => {
  const entries = ref<McpActivityEvent[]>([]);
  const loading = ref(false);
  const error = ref('');
  let subscribers = 0;
  let generation = 0;
  let unsubscribe: (() => void) | null = null;

  function merge(incoming: McpActivityEvent[]) {
    const rows = new Map(entries.value.map((entry) => [entry.requestId, entry]));
    for (const entry of incoming) {
      const previous = rows.get(entry.requestId);
      if (!previous || entry.sequence > previous.sequence) rows.set(entry.requestId, entry);
    }
    entries.value = [...rows.values()].sort((a, b) => b.sequence - a.sequence).slice(0, MCP_ACTIVITY_LIMIT);
  }

  async function start() {
    subscribers++;
    if (subscribers !== 1) return;
    const currentGeneration = ++generation;
    if (!window.tokiAPI?.getMcpActivity || !window.tokiAPI?.onMcpActivity) {
      error.value = 'MCP 활동은 데스크톱 앱에서 확인할 수 있어요.';
      return;
    }
    loading.value = true;
    error.value = '';
    // Subscribe before loading the snapshot; per-request sequence prevents a
    // delayed snapshot from overwriting completion events received meanwhile.
    try {
      unsubscribe = window.tokiAPI.onMcpActivity((event) => {
        if (currentGeneration === generation) merge([event]);
      });
      const snapshot = await window.tokiAPI.getMcpActivity();
      if (currentGeneration === generation) merge(snapshot.entries);
    } catch {
      if (currentGeneration === generation) error.value = 'MCP 활동 목록을 불러오지 못했어요.';
    } finally {
      if (currentGeneration === generation) loading.value = false;
    }
  }

  function stop() {
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers) return;
    generation++;
    unsubscribe?.();
    unsubscribe = null;
    loading.value = false;
  }

  return { entries, loading, error, start, stop };
});
