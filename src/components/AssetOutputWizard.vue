<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IconAlertTriangle, IconCheck, IconPhoto, IconWand, IconX } from '@tabler/icons-vue';
import { useAppStore } from '../stores/app-store';
import { executeAction } from '../lib/action-registry';
import {
  analyzeAssetFilenames,
  applyAssetOutputPlan,
  buildAssetOutputPlan,
  createDefaultPartMappings,
  ensureGeneratedAssetBlock,
  type AssetFilenameAnalysis,
  type AssetOutputPlan,
  type AssetPartMapping,
  type AssetPartRole,
} from '../lib/asset-output-wizard';

const store = useAppStore();
const loading = ref(false);
const analysis = ref<AssetFilenameAnalysis | null>(null);
const mappings = ref<AssetPartMapping[]>([]);
const included = ref(new Set<string>());
const template = ref('<img src="{{asset}}">');
const preview = ref('');
const target = ref<'lorebook' | 'globalNote'>('lorebook');
const error = ref('');
const editedPreview = ref(false);

const isCharx = computed(
  () => !!store.fileData && store.fileData._fileType !== 'risum' && store.fileData._fileType !== 'risup',
);
const plan = computed<AssetOutputPlan | null>(() => {
  if (!analysis.value) return null;
  return buildAssetOutputPlan(analysis.value, mappings.value, [...included.value], template.value);
});

watch(
  () => store.assetWizardOpen,
  async (open) => {
    if (!open) return;
    loading.value = true;
    error.value = '';
    editedPreview.value = false;
    target.value = 'lorebook';
    try {
      const assets = await window.tokiAPI.getAssetList();
      analysis.value = analyzeAssetFilenames(assets.map((asset) => asset.path));
      mappings.value = createDefaultPartMappings(analysis.value);
      included.value = new Set(analysis.value.files.map((file) => file.path));
      preview.value = buildAssetOutputPlan(
        analysis.value,
        mappings.value,
        [...included.value],
        template.value,
      ).generatedBlock;
    } catch (cause) {
      error.value = (cause as Error).message;
    } finally {
      loading.value = false;
    }
  },
);

watch(
  plan,
  (nextPlan) => {
    if (nextPlan && !editedPreview.value) preview.value = nextPlan.generatedBlock;
  },
  { deep: true },
);

function updateMapping(index: number, role: AssetPartRole) {
  const mapping = mappings.value[index];
  if (!mapping) return;
  mapping.role = role;
  if (role !== 'custom') {
    mapping.label =
      role === 'name' ? '이름' : role === 'outfit' ? '복장' : role === 'emotion' ? '감정' : `파트 ${index + 1}`;
  }
  editedPreview.value = false;
}

function toggleIncluded(path: string) {
  const next = new Set(included.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  included.value = next;
  editedPreview.value = false;
}

function apply() {
  if (!store.fileData || !plan.value || included.value.size === 0) return;
  const finalPlan = { ...plan.value, generatedBlock: ensureGeneratedAssetBlock(preview.value) };
  try {
    const result = applyAssetOutputPlan(store.fileData, finalPlan, target.value);
    executeAction('workspace-model-change', {
      tabId: result.lorebookIndex === undefined ? 'globalNote' : `lore_${result.lorebookIndex}`,
      field: result.target === 'lorebook' ? 'lorebook' : 'globalNote',
    });
    store.setAssetWizardOpen(false);
    store.setWorkspaceId(result.target === 'lorebook' ? 'lorebook' : 'character');
  } catch (cause) {
    error.value = (cause as Error).message;
  }
}
</script>

<template>
  <div
    v-if="store.assetWizardOpen"
    class="asset-wizard-backdrop"
    role="presentation"
    @mousedown.self="store.setAssetWizardOpen(false)"
  >
    <section class="asset-wizard" role="dialog" aria-modal="true" aria-labelledby="asset-wizard-title">
      <header>
        <div>
          <span><IconWand :size="18" /></span>
          <div>
            <strong id="asset-wizard-title">에셋 출력식 마법사</strong
            ><small>실제 추가 에셋 파일명으로 출력 규칙을 만듭니다.</small>
          </div>
        </div>
        <button type="button" title="닫기" aria-label="닫기" @click="store.setAssetWizardOpen(false)">
          <IconX :size="19" />
        </button>
      </header>

      <div v-if="loading" class="asset-wizard-loading">에셋을 분석하고 있습니다…</div>
      <div v-else-if="error" class="asset-wizard-empty">
        <IconAlertTriangle :size="28" /><strong>분석할 수 없습니다</strong><span>{{ error }}</span>
      </div>
      <div v-else-if="!analysis || analysis.files.length === 0" class="asset-wizard-empty">
        <IconPhoto :size="28" /><strong>사용할 수 있는 추가 에셋이 없습니다</strong
        ><span v-if="analysis?.collisions.length"
          >확장자를 제외한 이름이 충돌합니다: {{ analysis.collisions.map((file) => file.key).join(', ') }}</span
        ><span v-else><code>assets/other</code>의 이미지 파일을 추가한 뒤 다시 실행하세요.</span>
      </div>
      <div v-else class="asset-wizard-body">
        <section class="wizard-analysis">
          <div class="wizard-section-title">
            <span>1</span>
            <div>
              <strong>파일명 분석</strong
              ><small
                >{{ analysis.files.length }}개 선택 · {{ analysis.excluded.length }}개 제외 ·
                {{ analysis.collisions.length }}개 충돌 · 구분자
                {{ analysis.delimiter ? `“${analysis.delimiter}”` : '없음' }}</small
              >
            </div>
          </div>
          <div class="part-mappings">
            <div v-for="(mapping, index) in mappings" :key="mapping.index" class="part-mapping">
              <small>{{ index + 1 }}번째 파트</small>
              <select
                :value="mapping.role"
                @change="updateMapping(index, ($event.target as HTMLSelectElement).value as AssetPartRole)"
              >
                <option value="name">이름</option>
                <option value="outfit">복장</option>
                <option value="emotion">감정</option>
                <option value="custom">사용자 정의</option>
                <option value="ignore">무시</option>
              </select>
              <input
                v-if="mapping.role === 'custom'"
                v-model="mapping.label"
                aria-label="사용자 정의 차원 이름"
                @input="editedPreview = false"
              />
              <div class="part-values">
                {{ analysis.parts[index]?.values.slice(0, 7).join(', ')
                }}<span v-if="(analysis.parts[index]?.values.length || 0) > 7">
                  외 {{ analysis.parts[index].values.length - 7 }}개</span
                >
              </div>
            </div>
          </div>
          <details v-if="analysis.excluded.length">
            <summary>형식이 달라 제외된 파일 {{ analysis.excluded.length }}개</summary>
            <div class="excluded-list">
              <code v-for="file in analysis.excluded" :key="file.path">{{ file.key }}</code>
            </div>
          </details>
          <details v-if="analysis.collisions.length">
            <summary>확장자 제거 후 이름이 충돌한 파일 {{ analysis.collisions.length }}개</summary>
            <div class="excluded-list">
              <code v-for="file in analysis.collisions" :key="file.path">{{ file.path }}</code>
            </div>
          </details>
        </section>

        <section class="wizard-assets">
          <div class="wizard-section-title">
            <span>2</span>
            <div>
              <strong>포함할 실제 키</strong><small>선택한 키만 규칙에 기록됩니다. 조합은 새로 만들지 않습니다.</small>
            </div>
          </div>
          <div class="asset-key-list">
            <label v-for="file in analysis.files" :key="file.path" :class="{ selected: included.has(file.path) }"
              ><input type="checkbox" :checked="included.has(file.path)" @change="toggleIncluded(file.path)" /><code>{{
                file.key
              }}</code></label
            >
          </div>
        </section>

        <section class="wizard-preview">
          <div class="wizard-section-title">
            <span>3</span>
            <div><strong>적용 전 편집·미리보기</strong><small>표식 사이의 블록만 재실행 시 교체됩니다.</small></div>
          </div>
          <label class="template-row">출력 템플릿<input v-model="template" @input="editedPreview = false" /></label>
          <textarea v-model="preview" spellcheck="false" @input="editedPreview = true"></textarea>
        </section>
      </div>

      <footer v-if="analysis?.files.length">
        <div class="wizard-targets">
          <span>적용 위치</span>
          <label><input v-model="target" type="radio" value="lorebook" /> 로어북 항목</label>
          <label v-if="isCharx"><input v-model="target" type="radio" value="globalNote" /> globalNote 생성 블록</label>
        </div>
        <div class="wizard-footer-actions">
          <button type="button" @click="store.setAssetWizardOpen(false)">취소</button
          ><button type="button" class="primary" :disabled="included.size === 0 || !preview.trim()" @click="apply">
            <IconCheck :size="17" /> 적용
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.asset-wizard-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgba(3, 8, 20, 0.62);
  backdrop-filter: blur(6px);
}
.asset-wizard {
  width: min(1120px, 96vw);
  height: min(780px, 92vh);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 28px 80px rgba(2, 6, 23, 0.36);
}
.asset-wizard > header {
  min-height: 66px;
  padding: 11px 14px 11px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
}
.asset-wizard > header > div {
  display: flex;
  align-items: center;
  gap: 11px;
}
.asset-wizard > header > div > span {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: #071820;
  background: var(--ui-accent);
}
.asset-wizard > header div div {
  display: grid;
  gap: 3px;
}
.asset-wizard > header strong {
  font-size: 14px;
}
.asset-wizard > header small,
.wizard-section-title small {
  color: var(--text-secondary);
  font-size: 10px;
}
.asset-wizard > header button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.asset-wizard > header button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.asset-wizard-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(270px, 0.82fr) minmax(250px, 0.75fr) minmax(360px, 1.25fr);
  overflow: hidden;
}
.asset-wizard-body > section {
  min-width: 0;
  min-height: 0;
  padding: 18px;
  overflow: auto;
  border-right: 1px solid var(--border-color);
}
.asset-wizard-body > section:last-child {
  border-right: 0;
}
.wizard-section-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
}
.wizard-section-title > span {
  width: 25px;
  height: 25px;
  flex: 0 0 25px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--accent);
  background: var(--accent-light);
  font-size: 11px;
  font-weight: 800;
}
.wizard-section-title > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.wizard-section-title strong {
  font-size: 12px;
}
.part-mappings {
  display: grid;
  gap: 8px;
}
.part-mapping {
  padding: 10px;
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
}
.part-mapping > small {
  color: var(--text-secondary);
  font-size: 9px;
}
.part-mapping select,
.part-mapping input,
.template-row input {
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  color: var(--text-primary);
  background: var(--bg-secondary);
}
.part-values {
  grid-column: 1 / -1;
  color: var(--text-secondary);
  font-size: 9px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
details {
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 10px;
}
details summary {
  cursor: pointer;
}
.excluded-list {
  margin-top: 7px;
  display: grid;
  gap: 3px;
}
.asset-key-list {
  display: grid;
  gap: 5px;
}
.asset-key-list label {
  min-height: 34px;
  padding: 6px 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  cursor: pointer;
}
.asset-key-list label.selected {
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--accent) 52%, var(--border-color));
  background: var(--accent-light);
}
.asset-key-list code {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 10px;
}
.wizard-preview {
  display: flex;
  flex-direction: column;
}
.template-row {
  display: grid;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 9px;
}
.wizard-preview textarea {
  flex: 1;
  min-height: 260px;
  margin-top: 10px;
  resize: none;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  outline: none;
  color: var(--text-primary);
  background: var(--bg-primary);
  font:
    11px/1.5 'Cascadia Code',
    'Consolas',
    monospace;
}
.wizard-preview textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent);
}
.asset-wizard > footer {
  min-height: 62px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid var(--border-color);
}
.wizard-targets,
.wizard-footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.wizard-targets {
  color: var(--text-secondary);
  font-size: 10px;
}
.wizard-targets label {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-primary);
}
.wizard-footer-actions button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  cursor: pointer;
}
.wizard-footer-actions button.primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #06191c;
  border-color: transparent;
  background: var(--ui-accent);
  font-weight: 750;
}
.wizard-footer-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.asset-wizard-loading,
.asset-wizard-empty {
  margin: auto;
  padding: 32px;
  display: grid;
  justify-items: center;
  gap: 9px;
  color: var(--text-secondary);
  text-align: center;
}
.asset-wizard-empty strong {
  color: var(--text-primary);
}
@media (max-width: 980px) {
  .asset-wizard-body {
    grid-template-columns: 1fr 1fr;
    overflow: auto;
  }
  .wizard-preview {
    grid-column: 1 / -1;
    min-height: 420px !important;
  }
}
</style>
