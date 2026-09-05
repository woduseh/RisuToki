<script setup lang="ts">
import { computed } from 'vue';
import { IconBook2, IconBraces, IconInfoCircle, IconSparkles } from '@tabler/icons-vue';
import { useAppStore, type LorebookEntry, type RegexEntry } from '../stores/app-store';
import { executeAction } from '../lib/action-registry';
import { buildFolderInfoMap, resolveLorebookFolderRef } from '../lib/lorebook-folders';
import {
  SUPPORTED_PROMPT_ITEM_TYPES,
  defaultPromptItem,
  parsePromptTemplate,
  serializePromptTemplate,
  type PromptItemModel,
  type SupportedPromptItemType,
} from '../lib/risup-prompt-model';
import { promptTypeLabel } from '../lib/risup-prompt-editor';

const store = useAppStore();
const assetPath = computed(() => (store.inspectorContext.kind === 'asset' ? store.inspectorContext.itemId : null));

const loreIndex = computed(() => {
  const match = store.activeTabId?.match(/^lore_(\d+)$/);
  return match ? Number(match[1]) : -1;
});
const lore = computed(() => store.fileData?.lorebook?.[loreIndex.value] ?? null);
const loreFolderOptions = computed(() =>
  Array.from(buildFolderInfoMap(store.fileData?.lorebook ?? []).values()).map(({ name, ref: value }) => ({
    name,
    value,
  })),
);
const loreFolderValue = computed(() =>
  lore.value ? resolveLorebookFolderRef(lore.value.folder, store.fileData?.lorebook ?? []) : '',
);
const hasMissingLoreFolder = computed(
  () =>
    loreFolderValue.value !== '' && !loreFolderOptions.value.some((folder) => folder.value === loreFolderValue.value),
);

const regexIndex = computed(() => {
  const match = store.activeTabId?.match(/^regex_(\d+)$/);
  return match ? Number(match[1]) : -1;
});
const regex = computed(() => store.fileData?.regex?.[regexIndex.value] ?? null);

const promptItem = computed<PromptItemModel | null>(() => {
  const id = store.activeTabId?.replace(/^risup_prompt_item_/, '');
  if (!id || id === store.activeTabId || typeof store.fileData?.promptTemplate !== 'string') return null;
  return parsePromptTemplate(store.fileData.promptTemplate).items.find((item) => item.id === id) ?? null;
});

const triggerCount = computed(() => {
  const raw = store.fileData?.triggerScripts;
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw !== 'string') return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
});

function updateLore<K extends keyof LorebookEntry>(key: K, value: LorebookEntry[K]) {
  if (!lore.value) return;
  lore.value[key] = value;
  executeAction('workspace-model-change', { tabId: store.activeTabId, field: 'lorebook' });
}

function updateLoreFolder(value: string) {
  updateLore('folder', resolveLorebookFolderRef(value, store.fileData?.lorebook ?? []));
}

function updateRegex<K extends keyof RegexEntry>(key: K, value: RegexEntry[K]) {
  if (!regex.value) return;
  regex.value[key] = value;
  executeAction('workspace-model-change', { tabId: store.activeTabId, field: 'regex' });
}

function updatePrompt(key: string, value: string) {
  const data = store.fileData;
  const current = promptItem.value;
  if (!data || !current || current.supported === false) return;
  const model = parsePromptTemplate(typeof data.promptTemplate === 'string' ? data.promptTemplate : '');
  const item = model.items.find((entry) => entry.id === current.id);
  if (!item || item.supported === false) return;
  if (key === 'type') {
    const index = model.items.indexOf(item);
    model.items[index] = { ...defaultPromptItem(value as SupportedPromptItemType), id: item.id };
  }
  if (key === 'name' && 'name' in item) item.name = value || undefined;
  if (key === 'role' && 'role' in item) item.role = value as never;
  if (key === 'type2' && 'type2' in item) item.type2 = value as never;
  data.promptTemplate = serializePromptTemplate(model);
  executeAction('workspace-model-change', { tabId: store.activeTabId, field: 'promptTemplate' });
}
</script>

<template>
  <aside id="context-inspector" aria-label="선택 항목 속성">
    <div v-if="lore" class="inspector-content">
      <div class="inspector-kind"><IconBook2 :size="17" /> 선택한 로어북</div>
      <label
        >이름<input :value="lore.comment" @input="updateLore('comment', ($event.target as HTMLInputElement).value)"
      /></label>
      <label
        >폴더<select
          data-testid="lore-folder-select"
          :value="loreFolderValue"
          @change="updateLoreFolder(($event.target as HTMLSelectElement).value)"
        >
          <option value="">폴더 없음</option>
          <option v-for="folder in loreFolderOptions" :key="folder.value" :value="folder.value">
            {{ folder.name }}
          </option>
          <option v-if="hasMissingLoreFolder" :value="loreFolderValue">찾을 수 없는 폴더</option>
        </select></label
      >
      <label
        >활성화 키<textarea
          :value="lore.key"
          rows="2"
          @input="updateLore('key', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
      <label
        >보조 키<textarea
          :value="lore.secondkey"
          rows="2"
          @input="updateLore('secondkey', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
      <label
        >삽입 순서<input
          type="number"
          :value="lore.insertorder"
          @input="updateLore('insertorder', Number(($event.target as HTMLInputElement).value))"
      /></label>
      <div class="inspector-checks">
        <label
          ><input
            type="checkbox"
            :checked="lore.alwaysActive"
            @change="updateLore('alwaysActive', ($event.target as HTMLInputElement).checked)"
          />
          항상 활성</label
        >
        <label
          ><input
            type="checkbox"
            :checked="lore.selective"
            @change="updateLore('selective', ($event.target as HTMLInputElement).checked)"
          />
          키+보조키</label
        >
        <label
          ><input
            type="checkbox"
            :checked="lore.useRegex"
            @change="updateLore('useRegex', ($event.target as HTMLInputElement).checked)"
          />
          정규식 사용</label
        >
      </div>
    </div>

    <div v-else-if="assetPath" class="inspector-content asset-actions">
      <button type="button" class="inspector-action" @click="executeAction('asset-rename-selected', assetPath)">
        이름 변경
      </button>
      <button type="button" class="inspector-action danger" @click="executeAction('asset-delete-selected', assetPath)">
        삭제
      </button>
    </div>

    <div v-else-if="promptItem" class="inspector-content">
      <div class="inspector-kind"><IconSparkles :size="17" /> 선택한 프롬프트</div>
      <label v-if="promptItem.supported && 'name' in promptItem"
        >이름<input
          :value="promptItem.name || ''"
          @input="updatePrompt('name', ($event.target as HTMLInputElement).value)"
      /></label>
      <label v-if="promptItem.supported"
        >타입<select
          :value="promptItem.type"
          @change="updatePrompt('type', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="type in SUPPORTED_PROMPT_ITEM_TYPES" :key="type" :value="type">
            {{ promptTypeLabel(type) }}
          </option>
        </select></label
      >
      <label v-else>타입<input :value="promptItem.type || ''" disabled /></label>
      <label v-if="promptItem.supported && 'type2' in promptItem"
        >형식<select
          :value="promptItem.type2"
          @change="updatePrompt('type2', ($event.target as HTMLSelectElement).value)"
        >
          <option value="normal">normal</option>
          <option value="globalNote">globalNote</option>
          <option value="main">main</option>
        </select></label
      >
      <label v-if="promptItem.supported && 'role' in promptItem"
        >역할<select
          :value="promptItem.role"
          @change="updatePrompt('role', ($event.target as HTMLSelectElement).value)"
        >
          <option value="system">system</option>
          <option value="user">user</option>
          <option value="bot">bot</option>
          <option value="assistant">assistant</option>
          <option value="all">all</option>
        </select></label
      >
    </div>

    <div v-else-if="regex" class="inspector-content">
      <div class="inspector-kind"><IconBraces :size="17" /> 선택한 정규식</div>
      <label
        >이름<input :value="regex.comment" @input="updateRegex('comment', ($event.target as HTMLInputElement).value)"
      /></label>
      <label
        >타입<input :value="regex.type" @input="updateRegex('type', ($event.target as HTMLInputElement).value)"
      /></label>
      <label
        >플래그<input :value="regex.flag" @input="updateRegex('flag', ($event.target as HTMLInputElement).value)"
      /></label>
      <label class="check-row"
        ><input
          type="checkbox"
          :checked="regex.ableFlag !== false"
          @change="updateRegex('ableFlag', ($event.target as HTMLInputElement).checked)"
        />
        활성화</label
      >
    </div>

    <div v-else-if="store.activeTabId === 'triggerScripts'" class="inspector-content">
      <div class="inspector-kind"><IconBraces :size="17" /> 트리거 스크립트</div>
      <dl class="inspector-facts">
        <div>
          <dt>트리거</dt>
          <dd>{{ triggerCount }}개</dd>
        </div>
      </dl>
      <p class="inspector-note">이벤트, 조건, 효과는 중앙의 선택된 트리거 편집기와 같은 문서 모델에 즉시 반영됩니다.</p>
    </div>

    <div v-else class="inspector-empty">
      <IconInfoCircle :size="28" stroke-width="1.5" />
      <strong>속성을 확인할 항목을 선택하세요</strong>
      <span>로어북, 에셋, 프롬프트, 정규식과 트리거의 문맥 속성이 여기에 표시됩니다.</span>
    </div>
  </aside>
</template>

<style scoped>
#context-inspector {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--ui-panel, #151e31);
  border-left: 1px solid var(--ui-border, rgba(148, 163, 184, 0.18));
  color: var(--ui-text, #e6edf7);
}

.inspector-content {
  padding: 14px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.inspector-kind {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-accent-strong, #5eead4);
  font-size: 12px;
  font-weight: 700;
}
.inspector-content > label {
  display: grid;
  gap: 6px;
  color: var(--ui-text-muted, #94a3b8);
  font-size: 11px;
  font-weight: 650;
}
.inspector-content input:not([type='checkbox']),
.inspector-content textarea,
.inspector-content select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-input-border, rgba(148, 163, 184, 0.24));
  background: var(--ui-input, #0f1727);
  color: var(--ui-text, #eef4fb);
  border-radius: 8px;
  padding: 8px 9px;
  font: inherit;
  font-size: 12px;
  outline: none;
}
.inspector-content input:focus,
.inspector-content textarea:focus,
.inspector-content select:focus {
  border-color: var(--ui-focus, #2dd4bf);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-focus, #2dd4bf) 18%, transparent);
}
.inspector-checks {
  display: grid;
  gap: 9px;
  padding-top: 6px;
  border-top: 1px solid var(--ui-border, rgba(148, 163, 184, 0.14));
}
.inspector-checks label,
.check-row {
  display: flex !important;
  align-items: center;
  gap: 8px;
  color: var(--ui-text, #e6edf7) !important;
  font-size: 12px !important;
}
.inspector-facts {
  display: grid;
  gap: 0;
  margin: 0;
  border: 1px solid var(--ui-border, rgba(148, 163, 184, 0.15));
  border-radius: 10px;
  overflow: hidden;
}
.inspector-facts div {
  padding: 9px 10px;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 8px;
  border-bottom: 1px solid var(--ui-border, rgba(148, 163, 184, 0.12));
}
.inspector-facts div:last-child {
  border-bottom: 0;
}
.inspector-facts dt {
  color: var(--ui-text-faint, #64748b);
  font-size: 11px;
}
.inspector-facts dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 11px;
}
.inspector-action {
  min-height: 34px;
  border: 1px solid var(--ui-input-border, rgba(148, 163, 184, 0.24));
  background: var(--ui-control, rgba(148, 163, 184, 0.08));
  color: var(--ui-text, #e6edf7);
  border-radius: 8px;
  cursor: pointer;
}
.inspector-action:hover {
  border-color: var(--ui-accent, #2dd4bf);
}
.inspector-action.danger {
  color: var(--ui-danger, #fb7185);
}
.inspector-note {
  margin: 0;
  color: var(--ui-text-muted, #94a3b8);
  font-size: 11px;
  line-height: 1.55;
}
.inspector-empty {
  margin: auto;
  max-width: 220px;
  padding: 24px;
  text-align: center;
  display: grid;
  justify-items: center;
  gap: 9px;
  color: var(--ui-text-faint, #64748b);
}
.inspector-empty strong {
  color: var(--ui-text-muted, #94a3b8);
  font-size: 12px;
}
.inspector-empty span {
  font-size: 10px;
  line-height: 1.5;
}
</style>
