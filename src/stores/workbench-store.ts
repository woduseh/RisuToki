import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { RendererDocumentData } from '../lib/document-types';
import type { DocumentReviewResult } from '../lib/document-review-types';

/** Ephemeral document work, intentionally separate from persisted panel preferences. */
export const useWorkbenchStore = defineStore('workbench', () => {
  const previewOpen = ref(false);
  const previewLoading = ref(false);
  const previewStale = ref(false);
  const previewError = ref('');
  const previewSplit = ref(50);
  const reviewOpen = ref(false);
  const reviewLoading = ref(false);
  const reviewStale = ref(false);
  const reviewError = ref('');
  const reviewResult = shallowRef<Extract<DocumentReviewResult, { success: true }> | null>(null);
  const reviewDraft = shallowRef<RendererDocumentData | null>(null);
  const rawDraftWarning = ref('');

  function resetDocument() {
    previewOpen.value = false;
    previewLoading.value = false;
    previewStale.value = false;
    previewError.value = '';
    reviewOpen.value = false;
    reviewLoading.value = false;
    reviewStale.value = false;
    reviewError.value = '';
    reviewResult.value = null;
    reviewDraft.value = null;
    rawDraftWarning.value = '';
  }

  return {
    previewOpen,
    previewLoading,
    previewStale,
    previewError,
    previewSplit,
    reviewOpen,
    reviewLoading,
    reviewStale,
    reviewError,
    reviewResult,
    reviewDraft,
    rawDraftWarning,
    resetDocument,
  };
});
