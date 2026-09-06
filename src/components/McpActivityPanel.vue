<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { IconTerminal2, IconArrowUpRight, IconGitCompare } from '@tabler/icons-vue';
import { useMcpActivityStore } from '../stores/mcp-activity-store';
import type { McpActivityCategory, McpActivityEvent, McpActivitySource } from '../lib/mcp-activity-types';

const props = defineProps<{
  currentDocumentId: string | null;
  currentDocumentName: string;
  currentSelection?: { label: string; field?: string; index?: number };
}>();
const emit = defineEmits<{
  'open-source': [source: McpActivitySource];
  'open-review': [];
  'open-terminal': [];
}>();
const activity = useMcpActivityStore();
const onlyCurrentDocument = ref(false);
const category = ref<McpActivityCategory | 'all'>('all');
const categories: Record<McpActivityCategory, string> = {
  read: '읽기',
  change: '변경 요청',
  diagnostic: '진단',
  reference: '참고자료',
  other: '기타',
};
const statuses = { running: '실행 중', succeeded: '성공', failed: '실패', completed: '응답 완료 · 결과 미확인' };
const visibleEntries = computed(() =>
  activity.entries.filter(
    (entry) =>
      (!onlyCurrentDocument.value ||
        (!!props.currentDocumentId && entry.target.documentId === props.currentDocumentId)) &&
      (category.value === 'all' || entry.category === category.value),
  ),
);

function targetLabel(entry: McpActivityEvent): string {
  const target = entry.target;
  if (target.kind === 'external') return target.filePath || '외부 문서 · 경로 미확인';
  if (target.kind === 'reference') return target.name || target.filePath || '참고자료 / 가이드';
  if (target.kind === 'session') return '앱 세션';
  if (target.kind === 'active') return target.name || target.filePath || '활성 문서 · 대상 없음';
  return '대상 미확인';
}
function isCurrent(entry: McpActivityEvent): boolean {
  return !!props.currentDocumentId && entry.target.documentId === props.currentDocumentId;
}
function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
onMounted(() => {
  void activity.start();
});
onBeforeUnmount(() => activity.stop());
</script>

<template>
  <section class="mcp-activity-panel" aria-label="AI 작업 관측">
    <div class="activity-heading">
      <div>
        <h3>AI 작업</h3>
        <span>앱 MCP API에서 관측한 요청</span>
      </div>
      <button type="button" title="터미널 열기" aria-label="터미널 열기" @click="emit('open-terminal')">
        <IconTerminal2 :size="18" />
      </button>
    </div>
    <div class="app-selection">
      <span>앱에서 선택</span>
      <strong>{{ currentDocumentName || '열린 문서 없음' }}</strong>
      <span v-if="currentSelection?.label">{{ currentSelection.label }}</span>
    </div>
    <p class="activity-scope">아래 대상은 실제 요청 기준이에요. CLI 내부 사고와 직접 파일 수정은 관측하지 못해요.</p>
    <div class="activity-filters">
      <label
        >요청 유형
        <select v-model="category" aria-label="요청 유형">
          <option value="all">전체</option>
          <option v-for="(label, value) in categories" :key="value" :value="value">{{ label }}</option>
        </select></label
      >
      <label><input v-model="onlyCurrentDocument" type="checkbox" /> 현재 문서만</label>
    </div>
    <p v-if="activity.error" class="activity-notice" role="status">{{ activity.error }}</p>
    <p v-else-if="activity.loading && !activity.entries.length" class="activity-notice" role="status">
      활동 불러오는 중…
    </p>
    <p v-else-if="!visibleEntries.length" class="activity-notice">
      {{ activity.entries.length ? '선택한 조건에 맞는 요청이 없어요.' : '아직 관측된 MCP 요청이 없어요.' }}
    </p>
    <ol class="activity-list" aria-label="관측된 MCP 요청">
      <li v-for="entry in visibleEntries" :key="entry.requestId" :data-request-id="entry.requestId">
        <div class="activity-row-title">
          <span>{{ categories[entry.category] }}</span
          ><span class="activity-state" :class="entry.status">{{ statuses[entry.status] }}</span>
        </div>
        <div class="activity-target">
          <span>관측된 대상</span><strong :title="entry.target.filePath">{{ targetLabel(entry) }}</strong
          ><span v-if="isCurrent(entry)" class="current-document">현재 문서</span
          ><span v-else-if="entry.target.documentId">다른 문서</span>
        </div>
        <code class="activity-route">{{ entry.method }} {{ entry.route }}</code>
        <div class="activity-timing">
          <time :datetime="new Date(entry.startedAt).toISOString()">{{ timeLabel(entry.startedAt) }}</time
          ><span v-if="entry.durationMs !== undefined">{{
            entry.durationMs < 1000 ? `${entry.durationMs} ms` : `${(entry.durationMs / 1000).toFixed(1)} s`
          }}</span
          ><span v-if="entry.httpStatus">HTTP {{ entry.httpStatus }}</span>
        </div>
        <div v-if="isCurrent(entry)" class="activity-row-actions">
          <button v-if="entry.source" type="button" @click="emit('open-source', entry.source)">
            <IconArrowUpRight :size="14" /> 관련 영역
          </button>
          <button v-if="entry.category === 'change'" type="button" @click="emit('open-review')">
            <IconGitCompare :size="14" /> 변경 검토
          </button>
        </div>
      </li>
    </ol>
    <p class="activity-footnote">최근 80건 · 이 앱 실행 중에만 보관</p>
  </section>
</template>

<style scoped>
.mcp-activity-panel {
  padding: 14px;
  color: var(--ui-text);
  font-size: 12px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}
.activity-heading,
.activity-row-title,
.activity-timing,
.activity-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.activity-heading {
  justify-content: space-between;
}
h3 {
  margin: 0 0 4px;
  font-size: 15px;
}
.activity-heading span,
.activity-scope,
.activity-footnote,
.activity-timing,
.app-selection > span,
.activity-target > span {
  color: var(--ui-text-muted);
}
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 30px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  color: var(--ui-text);
  background: var(--ui-control);
  cursor: pointer;
}
button:hover {
  background: var(--ui-control-hover);
}
button:focus-visible,
select:focus-visible,
input:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}
.app-selection {
  display: grid;
  gap: 4px;
  margin: 14px 0 10px;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
}
.app-selection strong,
.activity-target strong {
  overflow-wrap: anywhere;
  font-weight: 600;
}
.activity-scope {
  line-height: 1.6;
  margin: 10px 0;
}
.activity-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
}
.activity-filters label {
  display: flex;
  align-items: center;
  gap: 5px;
}
select {
  color: var(--ui-text);
  background: var(--ui-control);
  border: 1px solid var(--ui-border);
  border-radius: 5px;
  padding: 4px;
}
.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.activity-list li {
  padding: 12px 0;
  border-bottom: 1px solid var(--ui-border);
}
.activity-row-title {
  justify-content: space-between;
  font-weight: 650;
}
.activity-state {
  font-size: 11px;
}
.activity-state.running,
.current-document {
  color: var(--ui-accent-strong, var(--ui-accent));
}
.activity-state.failed {
  color: var(--ui-danger, #ef7373);
}
.activity-state.succeeded {
  color: var(--ui-success, #4aba96);
}
.activity-target {
  display: grid;
  gap: 4px;
  margin: 9px 0;
}
.activity-route {
  display: block;
  overflow-wrap: anywhere;
  font-size: 11px;
}
.activity-timing {
  font-size: 11px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.activity-row-actions {
  margin-top: 8px;
}
.activity-row-actions button {
  padding: 4px 7px;
  font-size: 11px;
}
.activity-notice {
  line-height: 1.6;
  padding: 12px 0;
}
.activity-footnote {
  font-size: 11px;
  margin-top: 14px;
}
</style>
