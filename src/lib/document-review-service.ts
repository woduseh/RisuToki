import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { deserialize, serialize } from 'node:v8';
import type { LoadedDocumentData } from '../charx-io';
import { applyUpdates, serializeForRenderer } from './data-serializer';
import { serializeActiveDocument } from './renderer-document-state';
import type { RendererDocumentData } from './document-types';
import type {
  DocumentReviewAssetChange,
  DocumentReviewAssetState,
  DocumentReviewResult,
  RestoreReviewAssetRequest,
  RestoreReviewAssetResult,
} from './document-review-types';

export interface StoredReviewDocument {
  data: LoadedDocumentData;
  label: string;
  /** Includes source identity and on-disk contents, not the in-memory draft. */
  signature: string;
  externalChanged: boolean;
}

interface ReviewDeps {
  getCurrentData(): LoadedDocumentData | null;
  readStoredDocument(): StoredReviewDocument | null;
  onAssetRestored(): void;
}

function cloneDocument(data: LoadedDocumentData): LoadedDocumentData {
  return deserialize(serialize(data)) as LoadedDocumentData;
}

function fingerprint(value: Uint8Array): DocumentReviewAssetState {
  return { size: value.byteLength, hash: createHash('sha256').update(value).digest('hex') };
}

function metadataFingerprint(value: unknown): DocumentReviewAssetState {
  // Sort object keys so JSON property order alone is not reported as a change.
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, val]) => [key, stable(val)]),
      );
    }
    return item;
  };
  return fingerprint(Buffer.from(JSON.stringify(stable(value)) ?? 'null'));
}

function assetInventory(data: LoadedDocumentData): Map<string, DocumentReviewAssetState> {
  const rows = new Map<string, DocumentReviewAssetState>();
  for (const asset of data.assets || []) rows.set(asset.path, fingerprint(asset.data));
  for (const [index, bytes] of (data.risumAssets || []).entries())
    rows.set(`module-assets/${index}`, fingerprint(bytes));
  rows.set('[에셋 순서]', metadataFingerprint((data.assets || []).map((asset) => asset.path)));
  rows.set('[카드 에셋 참조]', metadataFingerprint(data.cardAssets || []));
  rows.set('[에셋 메타데이터]', metadataFingerprint(data.xMeta || {}));
  rows.set('[모듈 에셋 참조]', metadataFingerprint(data._moduleData?.assets || []));
  return rows;
}

function matchingAssetReferences(before: LoadedDocumentData, after: LoadedDocumentData): boolean {
  return (
    isDeepStrictEqual(before.cardAssets || [], after.cardAssets || []) &&
    isDeepStrictEqual(before.xMeta || {}, after.xMeta || {})
  );
}

export function compareReviewAssets(
  before: LoadedDocumentData,
  after: LoadedDocumentData,
): DocumentReviewAssetChange[] {
  const oldAssets = assetInventory(before);
  const newAssets = assetInventory(after);
  const canRestoreBinary =
    (before._fileType || 'charx') === 'charx' &&
    (after._fileType || 'charx') === 'charx' &&
    matchingAssetReferences(before, after);
  return [...new Set([...oldAssets.keys(), ...newAssets.keys()])].sort().flatMap((path) => {
    const oldAsset = oldAssets.get(path);
    const newAsset = newAssets.get(path);
    if (oldAsset?.hash === newAsset?.hash) return [];
    const samePathBinary =
      before.assets?.filter((asset) => asset.path === path).length === 1 &&
      after.assets?.filter((asset) => asset.path === path).length === 1;
    return [
      {
        path,
        kind: !oldAsset ? ('added' as const) : !newAsset ? ('removed' as const) : ('modified' as const),
        ...(oldAsset ? { before: oldAsset } : {}),
        ...(newAsset ? { after: newAsset } : {}),
        canRestore: canRestoreBinary && samePathBinary && !!oldAsset && !!newAsset,
      },
    ];
  });
}

export function createDocumentReviewService(deps: ReviewDeps) {
  let latest: {
    token: string;
    active: LoadedDocumentData;
    stored: StoredReviewDocument;
    changes: DocumentReviewAssetChange[];
  } | null = null;

  function getReview(draft: RendererDocumentData): DocumentReviewResult {
    latest = null;
    try {
      const active = deps.getCurrentData();
      if (!active) throw new Error('검토할 문서가 없습니다.');
      const documentId = serializeActiveDocument(active)._documentId;
      if (typeof documentId !== 'string') throw new Error('문서 식별자를 확인할 수 없습니다.');
      if (!draft || draft._documentId !== documentId)
        throw new Error('문서가 변경되었습니다. 현재 문서에서 검토를 다시 열어 주세요.');
      // Validation and renderer normalization happen on a detached clone only.
      const current = cloneDocument(active);
      applyUpdates(current, draft);
      const loaded = deps.readStoredDocument();
      if (!loaded)
        return {
          success: true,
          documentId,
          baseline: null,
          baselineLabel: '저장본 없음',
          baselineUnavailable: '아직 저장된 원본이 없는 문서입니다.',
          externalChanged: false,
          baselineToken: null,
          assets: [],
        };
      const stored = { ...loaded, data: cloneDocument(loaded.data) };
      const changes = compareReviewAssets(stored.data, current);
      // Re-reading an unchanged source must retain the comparison identity so
      // the renderer can validate a text restoration against the same baseline.
      const token = createHash('sha256').update(documentId).update('\0').update(stored.signature).digest('hex');
      latest = { token, active, stored, changes };
      return {
        success: true,
        documentId,
        baseline: serializeForRenderer(cloneDocument(stored.data)),
        baselineLabel: stored.label,
        baselineUnavailable: null,
        externalChanged: stored.externalChanged,
        baselineToken: token,
        assets: changes,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '저장본 검토에 실패했습니다.' };
    }
  }

  function restoreAsset(request: RestoreReviewAssetRequest): RestoreReviewAssetResult {
    try {
      const active = deps.getCurrentData();
      const snapshot = latest;
      if (
        !active ||
        !snapshot ||
        active !== snapshot.active ||
        request?.documentId !== serializeActiveDocument(active)._documentId ||
        request.baselineToken !== snapshot.token
      ) {
        throw new Error('검토 대상이 변경되었습니다. 변경 검토를 새로 고침해 주세요.');
      }
      const row = snapshot.changes.find((entry) => entry.path === request.path);
      if (!row?.canRestore)
        throw new Error('이 에셋은 참조 정보와 함께 수정해야 하므로 개별 복원을 지원하지 않습니다.');
      const stored = deps.readStoredDocument();
      if (!stored || stored.signature !== snapshot.stored.signature)
        throw new Error('저장본이 변경되었습니다. 변경 검토를 새로 고침해 주세요.');
      const currentAsset = active.assets.find((asset) => asset.path === request.path);
      const savedAsset = stored.data.assets.find((asset) => asset.path === request.path);
      const freshRow = compareReviewAssets(stored.data, active).find((entry) => entry.path === request.path);
      if (
        !currentAsset ||
        !savedAsset ||
        !freshRow?.canRestore ||
        fingerprint(savedAsset.data).hash !== row.before?.hash ||
        request.currentHash !== row.after?.hash ||
        fingerprint(currentAsset.data).hash !== request.currentHash ||
        !matchingAssetReferences(stored.data, active)
      ) {
        throw new Error('검토 이후 에셋이나 참조 정보가 변경되었습니다. 변경 검토를 새로 고침해 주세요.');
      }
      // Only the bytes at an unchanged CHARX path are replaced; never write disk here.
      currentAsset.data = Buffer.from(savedAsset.data);
      latest = null;
      deps.onAssetRestored();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '에셋 복원에 실패했습니다.' };
    }
  }

  return { getReview, restoreAsset };
}
