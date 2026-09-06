<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RendererDocumentData } from '../lib/document-types';
import type { DocumentReviewAssetChange } from '../lib/document-review-types';
import { buildDocumentReviewChanges, formatReviewValue, type ReviewChange } from '../lib/document-review-model';
import type { DiagnosticSource, DocumentDiagnostic } from '../lib/document-diagnostics';
import { diagnosticMatchesSource, diagnosticsForChanges } from '../lib/document-diagnostic-links';
import DiagnosticList from './DiagnosticList.vue';

const props = defineProps<{
  current: RendererDocumentData | null;
  baseline: RendererDocumentData | null;
  assets: DocumentReviewAssetChange[];
  loading: boolean;
  error: string;
  baselineLabel: string;
  baselineUnavailable: string | null;
  externalChanged: boolean;
  restoreBlocked?: boolean;
  diagnostics?: DocumentDiagnostic[] | null;
  diagnosticsError?: string;
}>();
const emit = defineEmits<{
  refresh: [];
  open: [target: DiagnosticSource];
  restore: [change: ReviewChange];
  restoreAsset: [asset: DocumentReviewAssetChange];
}>();
const changes = computed(() => buildDocumentReviewChanges(props.baseline, props.current));
const selectedId = ref('');
const keys = computed(() => [
  ...changes.value.map((change) => `field:${change.id}`),
  ...props.assets.map((asset) => `asset:${asset.path}`),
]);
watch(
  keys,
  (next) => {
    if (!next.includes(selectedId.value)) selectedId.value = next[0] ?? '';
  },
  { immediate: true },
);
const selectedChange = computed(() => changes.value.find((change) => `field:${change.id}` === selectedId.value));
const selectedAsset = computed(() => props.assets.find((asset) => `asset:${asset.path}` === selectedId.value));
const changedIssues = computed(() => diagnosticsForChanges(props.diagnostics ?? [], changes.value));
const changedErrors = computed(() => changedIssues.value.filter((issue) => issue.severity === 'error').length);
const selectedIssues = computed(() =>
  selectedChange.value
    ? (props.diagnostics ?? []).filter((issue) => diagnosticMatchesSource(issue, selectedChange.value!))
    : [],
);
const restorationBlocked = computed(
  () => props.loading || !!props.error || !!props.baselineUnavailable || props.restoreBlocked,
);
const kindLabels = { added: '추가', removed: '삭제', modified: '변경' } as const;
function assetValue(asset: DocumentReviewAssetChange, side: 'before' | 'after') {
  const value = asset[side];
  if (!value) return '(없음)';
  return `${value.size.toLocaleString()} bytes\nSHA-256 ${value.hash}`;
}
</script>

<template>
  <section class="document-review" aria-label="문서 변경 검토" :aria-busy="loading">
    <header class="review-header">
      <div>
        <h2>변경 검토</h2>
        <p>{{ baselineLabel || '저장본' }}과 현재 작업본을 비교해요.</p>
      </div>
      <button type="button" :disabled="loading || !current" @click="emit('refresh')">
        {{ loading ? '확인 중…' : '새로 확인' }}
      </button>
    </header>
    <p v-if="error" class="review-notice review-error" role="alert">{{ error }}</p>
    <p v-else-if="baselineUnavailable" class="review-notice" role="status">{{ baselineUnavailable }}</p>
    <p v-else-if="externalChanged" class="review-notice" role="status">
      파일이 외부에서 변경됐어요. 아래 비교는 현재 디스크의 저장본 기준이에요.
    </p>
    <p v-if="diagnosticsError" class="review-notice" role="status">{{ diagnosticsError }}</p>
    <p v-if="changedIssues.length" class="review-diagnostic-summary">
      변경 항목의 검사 결과: 오류 {{ changedErrors }} · 경고 {{ changedIssues.length - changedErrors }}
    </p>
    <p v-if="!current" class="review-empty">문서를 열면 저장본과 변경 내용을 비교할 수 있어요.</p>
    <p v-else-if="!baseline && !baselineUnavailable && !error" class="review-empty" role="status">
      {{ loading ? '저장본을 읽고 있어요.' : '비교할 저장본을 아직 불러오지 못했어요. 새로 확인을 눌러 주세요.' }}
    </p>
    <p
      v-else-if="baseline && !keys.length && !loading && !error && !baselineUnavailable"
      class="review-empty"
      role="status"
    >
      저장본과 동일해요. 변경된 내용이 없어요.
    </p>
    <div v-if="keys.length" class="review-workspace">
      <nav class="review-list" aria-label="변경된 항목">
        <p class="review-count">문서 {{ changes.length }}건 · 에셋 {{ assets.length }}건</p>
        <button
          v-for="change in changes"
          :key="change.id"
          type="button"
          :aria-current="selectedId === `field:${change.id}` ? 'true' : undefined"
          @click="selectedId = `field:${change.id}`"
        >
          <span :class="['review-kind', change.kind]">{{ kindLabels[change.kind] }}</span
          ><span>{{ change.label }}</span>
        </button>
        <button
          v-for="asset in assets"
          :key="asset.path"
          type="button"
          :aria-current="selectedId === `asset:${asset.path}` ? 'true' : undefined"
          @click="selectedId = `asset:${asset.path}`"
        >
          <span :class="['review-kind', asset.kind]">{{ kindLabels[asset.kind] }}</span
          ><span>{{ asset.path }}</span>
        </button>
      </nav>
      <article v-if="selectedChange" class="review-detail">
        <div class="review-detail-header">
          <h3>{{ selectedChange.label }}</h3>
          <div class="review-actions">
            <button type="button" @click="emit('open', { field: selectedChange.field, index: selectedChange.index })">
              원문 열기
            </button>
            <button
              type="button"
              :disabled="restorationBlocked || !selectedChange.canRestore"
              @click="emit('restore', selectedChange)"
            >
              저장본으로 되돌리기
            </button>
          </div>
        </div>
        <p v-if="selectedChange.collectionNote" class="review-note">{{ selectedChange.collectionNote }}</p>
        <p v-if="selectedChange.restoreUnavailable" class="review-note">{{ selectedChange.restoreUnavailable }}</p>
        <section v-if="diagnostics != null" class="review-diagnostics" aria-label="선택 항목 진단">
          <h4>현재 작업본의 검사 결과</h4>
          <p v-if="!selectedIssues.length" class="review-note">검사 범위에서 발견된 문제가 없어요.</p>
          <DiagnosticList
            v-else
            :diagnostics="selectedIssues"
            :stale="loading || restoreBlocked"
            @open="emit('open', $event)"
          />
        </section>
        <div class="review-comparison">
          <section aria-label="저장본 내용">
            <h4>저장본</h4>
            <pre>{{ formatReviewValue(selectedChange.before, selectedChange.beforePresent) }}</pre>
          </section>
          <section aria-label="작업본 내용">
            <h4>작업본</h4>
            <pre>{{ formatReviewValue(selectedChange.after, selectedChange.afterPresent) }}</pre>
          </section>
        </div>
      </article>
      <article v-else-if="selectedAsset" class="review-detail">
        <div class="review-detail-header">
          <h3>{{ selectedAsset.path }}</h3>
          <button
            type="button"
            :disabled="restorationBlocked || !selectedAsset.canRestore"
            @click="emit('restoreAsset', selectedAsset)"
          >
            저장본으로 되돌리기
          </button>
        </div>
        <p class="review-note">에셋 파일의 크기와 내용 해시를 비교해요.</p>
        <p v-if="!selectedAsset.canRestore" class="review-note">이 에셋은 저장본으로 자동 복원할 수 없어요.</p>
        <div class="review-comparison">
          <section aria-label="저장본 에셋">
            <h4>저장본</h4>
            <pre>{{ assetValue(selectedAsset, 'before') }}</pre>
          </section>
          <section aria-label="작업본 에셋">
            <h4>작업본</h4>
            <pre>{{ assetValue(selectedAsset, 'after') }}</pre>
          </section>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.document-review {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--ui-text);
  background: var(--ui-canvas);
  overflow: auto;
}
.review-header,
.review-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-border);
  flex-wrap: wrap;
}
.review-header h2,
.review-detail h3 {
  margin: 0;
  font-size: 15px;
  overflow-wrap: anywhere;
}
.review-header p {
  margin: 5px 0 0;
  color: var(--ui-text-muted);
  font-size: 12px;
}
button {
  min-height: 32px;
  padding: 5px 10px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-panel);
  color: var(--ui-text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
button:hover:not(:disabled) {
  background: var(--ui-selected);
  border-color: var(--ui-selected-border);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}
.review-notice {
  margin: 10px 16px 0;
  padding: 10px 12px;
  border: 1px solid var(--ui-selected-border);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.6;
  background: var(--ui-selected);
}
.review-error {
  color: var(--ui-danger);
}
.review-diagnostic-summary {
  margin: 0;
  padding: 8px 16px;
  border-bottom: 1px solid var(--ui-border);
  font-size: 12px;
  color: var(--ui-text-muted);
}
.review-diagnostics {
  border-bottom: 1px solid var(--ui-border);
}
.review-diagnostics h4 {
  padding: 10px 16px 0;
  margin: 0;
  font-size: 12px;
  font-weight: 550;
}
.review-empty {
  margin: auto;
  padding: 28px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 14px;
  line-height: 1.7;
}
.review-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(160px, 230px) minmax(0, 1fr);
  overflow: hidden;
}
.review-list {
  min-height: 0;
  overflow: auto;
  padding: 8px;
  border-right: 1px solid var(--ui-border);
}
.review-count {
  padding: 0 6px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.review-list button {
  display: flex;
  gap: 8px;
  width: 100%;
  align-items: baseline;
  border-color: transparent;
  text-align: left;
  margin-bottom: 3px;
}
.review-list button > span:last-child {
  overflow-wrap: anywhere;
  min-width: 0;
}
.review-list button[aria-current='true'] {
  background: var(--ui-selected);
  border-color: var(--ui-selected-border);
  font-weight: 650;
}
.review-kind {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--ui-text-muted);
}
.review-detail {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.review-detail-header h3 {
  font-size: 14px;
}
.review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.review-note {
  margin: 12px 16px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-text-muted);
}
.review-comparison {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  padding: 12px 16px 18px;
}
.review-comparison section {
  min-width: 0;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  overflow: hidden;
}
.review-comparison h4 {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--ui-panel);
  border-bottom: 1px solid var(--ui-border);
}
.review-comparison pre {
  padding: 12px;
  margin: 0;
  font: 12px/1.7 var(--font-mono, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 2;
  user-select: text;
}
@media (max-width: 1100px) {
  .review-comparison {
    grid-template-columns: minmax(0, 1fr);
  }
  .review-workspace {
    grid-template-columns: minmax(150px, 190px) minmax(0, 1fr);
  }
}
</style>
