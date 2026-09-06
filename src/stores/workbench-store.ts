import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { RendererDocumentData } from '../lib/document-types';
import type { DocumentReviewResult } from '../lib/document-review-types';
import type { DocumentDiagnostic } from '../lib/document-diagnostics';
import type { PreviewAssetInventory } from '../lib/preview-assets';

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
  const diagnosticsOpen = ref(false);
  const diagnosticsLoading = ref(false);
  const diagnosticsStale = ref(false);
  const diagnosticsError = ref('');
  const diagnosticsDraft = shallowRef<RendererDocumentData | null>(null);
  const diagnostics = shallowRef<DocumentDiagnostic[]>([]);
  const diagnosticsAssets = shallowRef<PreviewAssetInventory | null>(null);
  const diagnosticsCheckedAt = ref<number | null>(null);
  const reviewDiagnostics = shallowRef<DocumentDiagnostic[] | null>(null);
  const reviewDiagnosticsError = ref('');
  const selection = shallowRef<{ label: string; field?: string; index?: number } | null>(null);

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
    diagnosticsOpen.value = false;
    diagnosticsLoading.value = false;
    diagnosticsStale.value = false;
    diagnosticsError.value = '';
    diagnosticsDraft.value = null;
    diagnostics.value = [];
    diagnosticsAssets.value = null;
    diagnosticsCheckedAt.value = null;
    reviewDiagnostics.value = null;
    reviewDiagnosticsError.value = '';
    selection.value = null;
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
    diagnosticsOpen,
    diagnosticsLoading,
    diagnosticsStale,
    diagnosticsError,
    diagnosticsDraft,
    diagnostics,
    diagnosticsAssets,
    diagnosticsCheckedAt,
    reviewDiagnostics,
    reviewDiagnosticsError,
    selection,
    resetDocument,
  };
});
