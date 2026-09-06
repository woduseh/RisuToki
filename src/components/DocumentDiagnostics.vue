<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RendererDocumentData } from '../lib/document-types';
import { buildModuleOverview, type DiagnosticSource, type DocumentDiagnostic } from '../lib/document-diagnostics';
import type { PreviewAssetInventory } from '../lib/preview-assets';
import DiagnosticList from './DiagnosticList.vue';

const props = defineProps<{
  current: RendererDocumentData | null;
  diagnostics: DocumentDiagnostic[];
  assets: PreviewAssetInventory | null;
  loading: boolean;
  stale: boolean;
  error: string;
  rawDraftWarning: string;
  checkedAt: number | null;
}>();
const emit = defineEmits<{ refresh: []; open: [source: DiagnosticSource]; assets: [] }>();
const mode = ref<'issues' | 'module'>('issues');
const severity = ref<'all' | 'error' | 'warning'>('all');
const isModule = computed(() => props.current?._fileType === 'risum');
const blocked = computed(
  () => props.loading || props.stale || !!props.rawDraftWarning || !!props.error || !props.current,
);
const errorCount = computed(() => props.diagnostics.filter((issue) => issue.severity === 'error').length);
const warningCount = computed(() => props.diagnostics.filter((issue) => issue.severity === 'warning').length);
const filtered = computed(() =>
  props.diagnostics.filter((issue) => severity.value === 'all' || issue.severity === severity.value),
);
const assetCount = computed(() =>
  props.assets
    ? new Set(props.assets.entries.map((asset) => asset.path ?? `${asset.source}:${asset.name}`)).size
    : null,
);
const overview = computed(() =>
  isModule.value && props.current
    ? buildModuleOverview(props.current, { assetCount: assetCount.value ?? undefined })
    : null,
);
const controls = computed(() => overview.value?.toggles.items.filter((item) => 'key' in item) ?? []);
const loreEntries = computed(() => overview.value?.lorebook.filter((entry) => !entry.isFolder) ?? []);
const controlLabels = {
  toggle: '체크박스',
  select: '선택 목록',
  text: '한 줄 입력',
  textarea: '여러 줄 입력',
} as const;
const checkedTime = computed(() => (props.checkedAt ? new Date(props.checkedAt).toLocaleTimeString() : ''));
watch(
  [() => props.current?._documentId ?? props.assets?.documentId, () => props.current?._fileType],
  () => {
    mode.value = isModule.value ? 'module' : 'issues';
    severity.value = 'all';
  },
  { immediate: true },
);
</script>

<template>
  <section class="document-diagnostics" aria-label="문서 진단" :aria-busy="loading">
    <header class="diagnostics-header">
      <div>
        <h2>{{ isModule ? '모듈 구성·진단' : '문서 진단' }}</h2>
        <p>
          현재 작업본 · <template v-if="checkedTime">{{ checkedTime }} 검사</template
          ><template v-else>검사를 시작해 주세요.</template>
        </p>
      </div>
      <button type="button" :disabled="loading || !current" @click="emit('refresh')">
        {{ loading ? '검사 중…' : '다시 검사' }}
      </button>
    </header>
    <p v-if="stale" class="diagnostics-notice" role="status">
      검사 이후 문서나 에셋이 바뀌었어요. 다시 검사하면 원문을 열 수 있어요.
    </p>
    <p v-if="rawDraftWarning" class="diagnostics-notice" role="status">{{ rawDraftWarning }}</p>
    <p v-if="error" class="diagnostics-notice" role="alert">{{ error }}</p>
    <div class="diagnostics-controls">
      <div v-if="isModule" class="diagnostics-modes" aria-label="진단 보기">
        <button type="button" :aria-pressed="mode === 'module'" @click="mode = 'module'">모듈 구성</button>
        <button type="button" :aria-pressed="mode === 'issues'" @click="mode = 'issues'">검사 결과</button>
      </div>
      <span>오류 {{ errorCount }} · 경고 {{ warningCount }}</span>
      <label v-if="mode === 'issues'"
        >표시
        <select v-model="severity">
          <option value="all">전체</option>
          <option value="error">오류</option>
          <option value="warning">경고</option>
        </select>
      </label>
    </div>
    <div class="diagnostics-content">
      <p v-if="!current" class="diagnostics-empty">문서를 열면 정적 진단과 구성 정보를 확인할 수 있어요.</p>
      <template v-else-if="mode === 'issues'">
        <p v-if="!checkedAt && !loading" class="diagnostics-empty">다시 검사를 누르면 현재 문서를 확인해요.</p>
        <p v-else-if="!filtered.length && !blocked" class="diagnostics-empty">
          {{ diagnostics.length ? '이 필터에 해당하는 문제가 없어요.' : '검사 범위에서 발견된 문제가 없어요.' }}
        </p>
        <DiagnosticList :diagnostics="filtered" :stale="blocked" @open="emit('open', $event)" />
      </template>
      <template v-else-if="overview">
        <div class="module-counts" aria-label="모듈 구성 개수">
          <span
            >로어북 <strong>{{ loreEntries.length }}</strong
            ><small v-if="overview.counts.lorebookFolders"
              >폴더 {{ overview.counts.lorebookFolders }}개 별도</small
            ></span
          >
          <span
            >정규식 <strong>{{ overview.counts.regex }}</strong></span
          >
          <span
            >트리거
            <strong>{{ overview.triggerState === 'invalid' ? '미확인' : overview.counts.triggers }}</strong></span
          >
          <button type="button" :disabled="blocked" @click="emit('assets')">
            에셋 항목 <strong>{{ assetCount ?? '미확인' }}</strong>
          </button>
        </div>
        <p v-if="assets" class="module-note module-asset-note">
          에셋 항목에는 별칭이 포함될 수 있어 실제 파일 개수와 다를 수 있어요.
        </p>
        <section class="module-section">
          <div class="module-section-heading">
            <h3>토글·입력 항목</h3>
            <button type="button" :disabled="blocked" @click="emit('open', { field: 'customModuleToggle' })">
              토글 편집
            </button>
          </div>
          <p v-if="overview.toggles.state !== 'valid'" class="module-note">
            {{
              overview.toggles.rawText.trim()
                ? '이 형식은 요약할 수 없어요. 원문에서 확인하세요.'
                : '정의된 토글이 없어요.'
            }}
          </p>
          <table v-else-if="controls.length">
            <thead>
              <tr>
                <th>표시 이름</th>
                <th>변수</th>
                <th>종류</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(control, index) in controls" :key="index">
                <td>{{ control.value }}</td>
                <td>{{ control.key }}</td>
                <td>
                  {{ controlLabels[control.type]
                  }}<span v-if="control.type === 'select'" class="control-options">{{
                    control.options.join(' · ')
                  }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="module-note">그룹이나 설명만 있고 입력 항목은 없어요.</p>
        </section>
        <section class="module-section">
          <div class="module-section-heading">
            <h3>기본 변수</h3>
            <button type="button" :disabled="blocked" @click="emit('open', { field: 'defaultVariables' })">
              변수 편집
            </button>
          </div>
          <p v-if="!overview.defaultVariables.rawText" class="module-note">정의된 기본 변수가 없어요.</p>
          <p v-if="overview.defaultVariables.unparsedLines.length" class="module-note">
            {{ overview.defaultVariables.unparsedLines.join(', ') }}행은 요약되지 않았어요. 원문에서 확인하세요.
          </p>
          <table v-if="overview.defaultVariables.entries.length">
            <thead>
              <tr>
                <th>변수</th>
                <th>기본값</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="variable in overview.defaultVariables.entries" :key="variable.line">
                <td>
                  <button
                    type="button"
                    :disabled="blocked"
                    @click="
                      emit('open', { field: 'defaultVariables', path: '$.defaultVariables', line: variable.line })
                    "
                  >
                    {{ variable.key }}
                  </button>
                </td>
                <td>{{ variable.value }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section class="module-section">
          <div class="module-section-heading">
            <h3>트리거 구성</h3>
            <button type="button" :disabled="blocked" @click="emit('open', { field: 'triggerScripts' })">
              트리거 편집
            </button>
          </div>
          <p v-if="overview.triggerState === 'invalid'" class="module-note">
            트리거 JSON을 읽지 못했어요. 검사 결과와 원문에서 구조를 확인해 주세요.
          </p>
          <p v-else-if="!overview.triggers.length" class="module-note">
            정의된 트리거가 없어요. Lua 코드는 별도로 확인할 수 있어요.
          </p>
          <button type="button" class="module-lua-link" :disabled="blocked" @click="emit('open', { field: 'lua' })">
            Lua 원문 열기
          </button>
          <table v-if="overview.triggers.length">
            <thead>
              <tr>
                <th>이름</th>
                <th>이벤트</th>
                <th>구성</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="trigger in overview.triggers" :key="trigger.index">
                <td>
                  <button
                    type="button"
                    :disabled="blocked"
                    @click="emit('open', { field: 'triggerScripts', index: trigger.index })"
                  >
                    {{ trigger.name }}
                  </button>
                </td>
                <td>{{ trigger.event || '지정 안 됨' }}</td>
                <td>
                  {{
                    trigger.supported
                      ? `조건 ${trigger.conditionCount} · 동작 ${trigger.effectCount}`
                      : '원문 확인 필요'
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section class="module-section">
          <div class="module-section-heading">
            <h3>로어북 활성 조건</h3>
            <span>실제 활성화 여부는 대화와 설정에 따라 달라져요.</span>
          </div>
          <p v-if="!loreEntries.length" class="module-note">내용이 있는 로어북 항목이 없어요.</p>
          <ul class="module-lorebooks">
            <li v-for="entry in loreEntries" :key="entry.index">
              <button
                type="button"
                :disabled="blocked"
                @click="emit('open', { field: 'lorebook', index: entry.index })"
              >
                {{ entry.name }}
              </button>
              <p>
                {{ entry.alwaysActive ? '항상 활성' : `키: ${entry.keys || '(없음)'}`
                }}<template v-if="entry.selective"> · 보조 키: {{ entry.secondaryKeys || '(없음)' }}</template
                ><template v-if="entry.useRegex"> · 정규식 키</template>
              </p>
              <p>
                삽입 순서 {{ entry.insertOrder }}<template v-if="entry.folder"> · 폴더 {{ entry.folder }}</template
                ><template v-if="entry.decorators.activate"> · @@activate</template
                ><template v-if="entry.decorators.dontActivate"> · @@dont_activate</template
                ><template v-if="entry.decorators.probability !== undefined">
                  · 활성 확률 {{ entry.decorators.probability }}%
                </template>
              </p>
            </li>
          </ul>
        </section>
      </template>
      <details class="diagnostics-scope">
        <summary>검사 범위</summary>
        <p>
          정적 검사로 CBS 닫는 블록의 대응 여부, 정규식 컴파일, 트리거·프롬프트 JSON 구조, 고정된 에셋 참조를 확인해요.
          전체 CBS 문법을 검사하거나 Lua·모델 응답을 실행한 결과는 아니에요.
        </p>
        <p v-if="!assets">에셋 목록을 확인하지 못해 에셋 참조 검사는 생략했어요.</p>
        <p>동적인 CBS 참조와 실제 대화에서의 활성화 여부는 실행 환경에서 확인해야 해요.</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
.document-diagnostics {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  color: var(--ui-text);
  background: var(--ui-panel);
}
.diagnostics-header {
  padding: 14px 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--ui-border);
}
h2,
h3 {
  margin: 0;
  font-size: 15px;
}
.diagnostics-header p {
  margin: 5px 0 0;
  color: var(--ui-text-muted);
  font-size: 12px;
}
button,
select {
  min-height: 30px;
  padding: 4px 8px;
  background: var(--ui-panel);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  font: inherit;
  font-size: 12px;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}
button[aria-pressed='true'] {
  background: var(--ui-selected);
  border-color: var(--ui-selected-border);
}
.diagnostics-notice {
  padding: 8px 14px;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  background: var(--ui-selected);
  border-bottom: 1px solid var(--ui-border);
}
.diagnostics-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--ui-border);
  font-size: 12px;
}
.diagnostics-controls label {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.diagnostics-modes {
  display: flex;
  gap: 4px;
}
.diagnostics-content {
  flex: 1;
  min-height: 160px;
  overflow: auto;
}
.diagnostics-empty {
  padding: 24px 16px;
  color: var(--ui-text-muted);
  font-size: 13px;
  text-align: center;
}
.module-counts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-border);
}
.module-counts > * {
  text-align: center;
  padding: 8px;
  font-size: 12px;
  background: var(--ui-shell);
}
.module-counts strong {
  display: block;
  margin-top: 3px;
  font-size: 18px;
}
.module-counts small,
.control-options {
  display: block;
  font-size: 11px;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.module-asset-note {
  padding: 0 16px;
}
.module-section {
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-border);
}
.module-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.module-section-heading h3 {
  font-size: 13px;
}
.module-section-heading span,
.module-note {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.6;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}
td,
th {
  padding: 7px 8px;
  text-align: left;
  border-bottom: 1px solid var(--ui-border);
  vertical-align: top;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
th {
  font-weight: 550;
  color: var(--ui-text-muted);
}
td button {
  text-align: left;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.module-lua-link {
  margin-bottom: 8px;
}
.module-lorebooks {
  list-style: none;
  padding: 0;
  margin: 0;
}
.module-lorebooks li {
  padding: 8px 0;
  border-bottom: 1px solid var(--ui-border);
}
.module-lorebooks p {
  margin: 5px 0;
  color: var(--ui-text-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.diagnostics-scope {
  margin: 16px;
  font-size: 12px;
  color: var(--ui-text-muted);
  line-height: 1.7;
}
.diagnostics-scope summary {
  cursor: pointer;
}
</style>
