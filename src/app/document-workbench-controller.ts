import type { RendererDocumentData } from '../lib/document-types';
import type { DocumentReviewResult } from '../lib/document-review-types';
import type { PreviewAssetInventory } from '../lib/preview-assets';
import type { TabManager } from '../lib/tab-manager';
import type { useWorkbenchStore } from '../stores/workbench-store';
import { diagnoseDocument } from '../lib/document-diagnostics';
import { markStaleWorkbenchSnapshots, type WorkbenchSnapshots } from '../lib/workbench-freshness';

interface DocumentWorkbenchDeps {
  getFileData(): RendererDocumentData | null;
  getTabs(): Pick<TabManager, 'openTabs' | 'activeTabId' | 'dirtyFields'>;
  getStore(): ReturnType<typeof useWorkbenchStore>;
  api: {
    getPreviewAssetInventory(): Promise<PreviewAssetInventory>;
    getDocumentReview(draft: RendererDocumentData): Promise<DocumentReviewResult>;
  };
  unappliedDrafts: Set<string>;
}

interface PreviewSnapshot {
  document: RendererDocumentData;
  draft: RendererDocumentData;
  text: string;
  assetRevision: number;
}

/** Owns ephemeral document snapshots and async review/diagnostic freshness, not editor widgets. */
export function createDocumentWorkbenchController(deps: DocumentWorkbenchDeps) {
  let reviewVersion = 0;
  let diagnosticsVersion = 0;
  let assetRevision = 0;
  const workbenchSnapshots: WorkbenchSnapshots = {};
  const unappliedReviewDrafts = deps.unappliedDrafts;

  function updateWorkbenchFreshness(): void {
    const fileData = deps.getFileData();
    const tabMgr = deps.getTabs();
    const workbench = deps.getStore();
    markStaleWorkbenchSnapshots(fileData, workbenchSnapshots, workbench);
    const active = tabMgr.openTabs.find((tab) => tab.id === tabMgr.activeTabId);
    if (!active) workbench.selection = null;
    else {
      const indexed = /^(lore_|regex_|altGreet_)(\d+)$/.exec(active.id);
      const field = indexed
        ? ({ lore_: 'lorebook', regex_: 'regex', altGreet_: 'alternateGreetings' } as Record<string, string>)[
            indexed[1]
          ]
        : active.id.startsWith('lua_s')
          ? 'lua'
          : active.id.startsWith('css_s')
            ? 'css'
            : active.id.startsWith('risup_prompt_item_')
              ? 'promptTemplate'
              : fileData && Object.hasOwn(fileData, active.id)
                ? active.id
                : undefined;
      workbench.selection = {
        label: active.label,
        ...(field ? { field } : {}),
        ...(indexed ? { index: Number(indexed[2]) } : {}),
      };
    }
    workbench.rawDraftWarning = tabMgr.openTabs.some(
      (tab) => tab.id.startsWith('project:') && tabMgr.dirtyFields.has(tab.id),
    )
      ? '프로젝트 원본 파일의 작성 중인 내용은 이 비교에 포함되지 않아요. 원본 파일 저장이 끝난 뒤 다시 검토하세요.'
      : '';
    for (const id of unappliedReviewDrafts) {
      if (!tabMgr.openTabs.some((tab) => tab.id === id)) unappliedReviewDrafts.delete(id);
    }
    if (unappliedReviewDrafts.size)
      workbench.rawDraftWarning =
        'JSON 문법 오류로 문서에 반영되지 않은 편집 내용이 있어요. 문법을 수정한 뒤 다시 검토하세요.';
  }

  async function inspectDocumentDraft(draft: RendererDocumentData) {
    let assets: PreviewAssetInventory | null = null;
    let assetError = '';
    try {
      assets = await deps.api.getPreviewAssetInventory();
      if (assets.documentId !== draft._documentId) throw new Error('검사 중 에셋 대상 문서가 변경됐어요.');
    } catch {
      assets = null;
      assetError = '에셋 목록을 확인하지 못해 에셋 참조 검사는 생략했어요. 다시 검사해 주세요.';
    }
    const diagnostics = diagnoseDocument(draft, { assetNames: assets?.names, assetInventoryAvailable: !!assets });
    return { diagnostics, assets, assetError };
  }

  async function refreshDocumentDiagnostics(): Promise<void> {
    const current = deps.getFileData();
    if (!current) return;
    const workbench = deps.getStore();
    const version = ++diagnosticsVersion;
    const initialAssetRevision = assetRevision;
    const snapshotText = JSON.stringify(current);
    const draft = JSON.parse(snapshotText) as RendererDocumentData;
    if (!workbench.diagnosticsDraft) {
      workbench.diagnosticsDraft = draft;
      workbenchSnapshots.diagnostics = snapshotText;
    }
    workbench.diagnosticsLoading = true;
    workbench.diagnosticsError = '';
    try {
      const inspection = await inspectDocumentDraft(draft);
      if (version !== diagnosticsVersion || current !== deps.getFileData()) return;
      workbench.diagnosticsDraft = draft;
      workbench.diagnostics = inspection.diagnostics;
      workbench.diagnosticsAssets = inspection.assets;
      workbench.diagnosticsError = inspection.assetError;
      workbench.diagnosticsCheckedAt = Date.now();
      workbenchSnapshots.diagnostics = snapshotText;
      workbench.diagnosticsStale = initialAssetRevision !== assetRevision;
      updateWorkbenchFreshness();
    } catch (error) {
      if (version === diagnosticsVersion) {
        workbench.diagnosticsError = String(error);
        workbench.diagnosticsStale = true;
      }
    } finally {
      if (version === diagnosticsVersion) workbench.diagnosticsLoading = false;
    }
  }

  async function refreshDocumentReview(): Promise<void> {
    const current = deps.getFileData();
    if (!current) return;
    const workbench = deps.getStore();
    const version = ++reviewVersion;
    const initialAssetRevision = assetRevision;
    const snapshotText = JSON.stringify(current);
    const draft = JSON.parse(snapshotText) as RendererDocumentData;
    if (!workbench.reviewDraft) {
      workbench.reviewDraft = draft;
      workbenchSnapshots.review = snapshotText;
    }
    workbench.reviewLoading = true;
    workbench.reviewError = '';
    workbench.reviewDiagnosticsError = '';
    try {
      const [result, inspection] = await Promise.all([deps.api.getDocumentReview(draft), inspectDocumentDraft(draft)]);
      if (version !== reviewVersion || current !== deps.getFileData()) return;
      if (!result.success) {
        workbench.reviewError = result.error;
        workbench.reviewStale = true;
        return;
      }
      workbench.reviewResult = result;
      workbench.reviewDraft = draft;
      workbench.reviewDiagnostics = inspection.diagnostics;
      workbench.reviewDiagnosticsError = inspection.assetError;
      workbenchSnapshots.review = snapshotText;
      workbench.reviewStale = initialAssetRevision !== assetRevision;
      updateWorkbenchFreshness();
    } catch (error) {
      if (version === reviewVersion) {
        workbench.reviewError = String(error);
        workbench.reviewStale = true;
      }
    } finally {
      if (version === reviewVersion) workbench.reviewLoading = false;
    }
  }

  function resetDocument(): void {
    reviewVersion += 1;
    diagnosticsVersion += 1;
    assetRevision += 1;
    delete workbenchSnapshots.preview;
    delete workbenchSnapshots.review;
    delete workbenchSnapshots.diagnostics;
    unappliedReviewDrafts.clear();
    deps.getStore().resetDocument();
  }

  function markAssetsChanged(): void {
    assetRevision += 1;
    const state = deps.getStore();
    state.previewStale = true;
    state.reviewStale = true;
    state.diagnosticsStale = true;
  }

  function capturePreview(document: RendererDocumentData): PreviewSnapshot {
    const text = JSON.stringify(document);
    return { document, text, draft: JSON.parse(text) as RendererDocumentData, assetRevision };
  }

  function acceptPreview(snapshot: PreviewSnapshot): void {
    if (snapshot.document !== deps.getFileData()) return;
    workbenchSnapshots.preview = snapshot.text;
    deps.getStore().previewStale = snapshot.assetRevision !== assetRevision;
    updateWorkbenchFreshness();
  }

  return {
    updateFreshness: updateWorkbenchFreshness,
    refreshDiagnostics: refreshDocumentDiagnostics,
    refreshReview: refreshDocumentReview,
    resetDocument,
    markAssetsChanged,
    capturePreview,
    acceptPreview,
  };
}
