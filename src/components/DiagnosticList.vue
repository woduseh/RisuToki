<script setup lang="ts">
import type { DiagnosticSource, DocumentDiagnostic } from '../lib/document-diagnostics';

defineProps<{ diagnostics: DocumentDiagnostic[]; stale?: boolean }>();
const emit = defineEmits<{ open: [source: DiagnosticSource] }>();
</script>

<template>
  <ul class="diagnostic-list" aria-label="검사 결과">
    <li v-for="issue in diagnostics" :key="issue.id" :class="`diagnostic-${issue.severity}`">
      <div class="diagnostic-title">
        <span class="diagnostic-severity">{{ issue.severity === 'error' ? '오류' : '경고' }}</span>
        <strong>{{ issue.message }}</strong>
        <button type="button" :disabled="stale" @click="emit('open', issue.source)">원문 열기</button>
      </div>
      <p class="diagnostic-location">
        {{
          issue.source.path ||
          `${issue.source.field}${issue.source.index === undefined ? '' : `[${issue.source.index}]`}`
        }}<template v-if="issue.source.line"> · {{ issue.source.line }}행</template>
      </p>
      <details v-if="issue.detail">
        <summary>자세히</summary>
        <pre>{{ issue.detail }}</pre>
      </details>
    </li>
  </ul>
</template>

<style scoped>
.diagnostic-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.diagnostic-list > li {
  padding: 12px 14px;
  border-bottom: 1px solid var(--ui-border);
}
.diagnostic-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}
.diagnostic-title strong {
  flex: 1 1 160px;
  min-width: 0;
  font-size: 13px;
  font-weight: 550;
  overflow-wrap: anywhere;
}
.diagnostic-severity {
  font-size: 11px;
  font-weight: 650;
  color: var(--ui-text-muted);
}
.diagnostic-error .diagnostic-severity {
  color: var(--ui-danger);
}
.diagnostic-title button {
  padding: 4px 8px;
  min-height: 28px;
  color: var(--ui-text);
  background: var(--ui-panel);
  border: 1px solid var(--ui-border);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.diagnostic-title button:disabled {
  opacity: 0.5;
  cursor: default;
}
.diagnostic-title button:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}
.diagnostic-location {
  margin: 6px 0 0;
  color: var(--ui-text-muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}
details {
  margin-top: 6px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
summary {
  cursor: pointer;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 6px 0 0;
  font: 12px/1.6 var(--font-mono, monospace);
  user-select: text;
}
</style>
