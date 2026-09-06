// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { openCharxCardDocument, type LoadedDocumentData } from '../charx-io';
import { createDocumentReviewService, compareReviewAssets, type StoredReviewDocument } from './document-review-service';
import { serializeActiveDocument } from './renderer-document-state';
import type { DocumentReviewResult, RestoreReviewAssetRequest } from './document-review-types';

function document(description = 'Saved', bytes = 'abc'): LoadedDocumentData {
  return openCharxCardDocument(
    {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: { name: 'Synthetic', description, first_mes: 'Hello', extensions: {} },
    },
    [{ path: 'assets/icon/test.png', data: Buffer.from(bytes) }],
  );
}

function fixture() {
  let active: LoadedDocumentData | null = document('Draft', 'xyz');
  let stored: StoredReviewDocument | null = {
    data: document(),
    label: 'synthetic.charx',
    signature: 'file:synthetic:1',
    externalChanged: false,
  };
  const onAssetRestored = vi.fn();
  const readStoredDocument = vi.fn(() => stored);
  const service = createDocumentReviewService({ getCurrentData: () => active, readStoredDocument, onAssetRestored });
  return {
    service,
    onAssetRestored,
    readStoredDocument,
    get active() {
      return active!;
    },
    set active(value: LoadedDocumentData) {
      active = value;
    },
    get stored() {
      return stored;
    },
    set stored(value: StoredReviewDocument | null) {
      stored = value;
    },
  };
}

function success(result: DocumentReviewResult) {
  if (!result.success) throw new Error(result.error);
  return result;
}

function restoreRequest(result: DocumentReviewResult): RestoreReviewAssetRequest {
  const review = success(result);
  const row = review.assets.find((entry) => entry.path === 'assets/icon/test.png')!;
  return {
    documentId: review.documentId,
    baselineToken: review.baselineToken!,
    path: row.path,
    currentHash: row.after!.hash,
  };
}

describe('document review service', () => {
  it('keeps the baseline token stable across refreshes and changes it for a new source or document', () => {
    const f = fixture();
    const first = success(f.service.getReview(serializeActiveDocument(f.active)));
    f.active.description = 'Another unsaved text edit';
    const refresh = success(f.service.getReview(serializeActiveDocument(f.active)));
    expect(refresh.baselineToken).toBe(first.baselineToken);
    f.stored!.signature = 'file:synthetic:2';
    const saved = success(f.service.getReview(serializeActiveDocument(f.active)));
    expect(saved.baselineToken).not.toBe(first.baselineToken);
    f.active = document('Reopened', 'xyz');
    const reopened = success(f.service.getReview(serializeActiveDocument(f.active)));
    expect(reopened.baselineToken).not.toBe(saved.baselineToken);
  });

  it('refreshes asset current-hash guards even when an unchanged saved source keeps its token', () => {
    const f = fixture();
    const first = f.service.getReview(serializeActiveDocument(f.active));
    const request = restoreRequest(first);
    f.active.assets[0].data = Buffer.from('new');
    const refresh = success(f.service.getReview(serializeActiveDocument(f.active)));
    expect(refresh.baselineToken).toBe(request.baselineToken);
    expect(f.service.restoreAsset(request).success).toBe(false);
    expect(f.active.assets[0].data.toString()).toBe('new');
    expect(f.onAssetRestored).not.toHaveBeenCalled();
  });

  it('reads the persisted original and validates the renderer draft on a detached clone', () => {
    const f = fixture();
    const draft = { ...serializeActiveDocument(f.active), description: 'Unsent renderer edit' };
    const result = success(f.service.getReview(draft));
    expect(result.baseline?.description).toBe('Saved');
    expect(f.active.description).toBe('Draft');
    expect(f.stored?.data.description).toBe('Saved');
    expect(result.assets[0]).toMatchObject({
      path: 'assets/icon/test.png',
      kind: 'modified',
      canRestore: true,
      before: { size: 3 },
      after: { size: 3 },
    });
    expect(result.assets[0].before?.hash).not.toBe(result.assets[0].after?.hash);
    expect(result.baseline).not.toHaveProperty('assets');
    expect(result.baseline).not.toHaveProperty('_card');
    expect(result.baseline).not.toHaveProperty('_documentId');
  });

  it('rejects missing or stale document identity before reading disk', () => {
    const f = fixture();
    const stale = serializeActiveDocument(document());
    expect(f.service.getReview(stale).success).toBe(false);
    expect(f.service.getReview({ ...stale, _documentId: undefined }).success).toBe(false);
    expect(f.readStoredDocument).not.toHaveBeenCalled();
  });

  it('distinguishes a never-saved document from an unreadable saved original', () => {
    const f = fixture();
    f.stored = null;
    const result = success(f.service.getReview(serializeActiveDocument(f.active)));
    expect(result.baselineUnavailable).toBeTruthy();
    expect(result.baseline).toBeNull();
    expect(result.baselineToken).toBeNull();
    f.readStoredDocument.mockImplementation(() => {
      throw new Error('original missing');
    });
    expect(f.service.getReview(serializeActiveDocument(f.active))).toEqual({
      success: false,
      error: 'original missing',
    });
  });

  it('uses current disk data after explicit or MCP saves and preserves differences after failed saves', () => {
    const f = fixture();
    expect(success(f.service.getReview(serializeActiveDocument(f.active))).baseline?.description).toBe('Saved');
    // A failed save leaves disk unchanged even when main memory contains draft updates.
    f.active.description = 'Failed save draft';
    expect(success(f.service.getReview(serializeActiveDocument(f.active))).baseline?.description).toBe('Saved');
    // Successful persistence is observed without renderer-side reset notifications.
    f.stored = {
      data: document('Failed save draft', 'xyz'),
      signature: 'file:synthetic:2',
      label: 'synthetic.charx',
      externalChanged: false,
    };
    const saved = success(f.service.getReview(serializeActiveDocument(f.active)));
    expect(saved.baseline?.description).toBe(f.active.description);
    expect(saved.assets).toEqual([]);
  });

  it('reports externally changed originals and compares recovered drafts against source content', () => {
    const f = fixture();
    f.active.description = 'Recovered autosave';
    f.stored!.externalChanged = true;
    const result = success(f.service.getReview(serializeActiveDocument(f.active)));
    expect(result.externalChanged).toBe(true);
    expect(result.baseline?.description).toBe('Saved');
    expect(f.active.description).toBe('Recovered autosave');
  });

  it('restores only the reviewed binary bytes in memory and invalidates the consumed token', () => {
    const f = fixture();
    const request = restoreRequest(f.service.getReview(serializeActiveDocument(f.active)));
    expect(f.service.restoreAsset(request)).toEqual({ success: true });
    expect(f.active.assets[0].data.toString()).toBe('abc');
    expect(f.active.description).toBe('Draft');
    expect(f.onAssetRestored).toHaveBeenCalledOnce();
    expect(f.service.restoreAsset(request).success).toBe(false);
  });

  it.each(['document', 'disk', 'bytes', 'references', 'duplicate', 'token', 'hash'] as const)(
    'rejects stale %s without mutation',
    (change) => {
      const f = fixture();
      const request = restoreRequest(f.service.getReview(serializeActiveDocument(f.active)));
      if (change === 'document') f.active = document('Replacement', 'xyz');
      if (change === 'disk') f.stored!.signature = 'changed-disk';
      if (change === 'bytes') f.active.assets[0].data = Buffer.from('new');
      if (change === 'references') f.active.cardAssets = [{ name: 'changed' }];
      if (change === 'duplicate') f.active.assets.push({ ...f.active.assets[0] });
      if (change === 'token') request.baselineToken = 'old-token';
      if (change === 'hash') request.currentHash = 'old-hash';
      const before = Buffer.from(f.active.assets[0].data);
      expect(f.service.restoreAsset(request).success).toBe(false);
      expect(f.active.assets[0].data).toEqual(before);
      expect(f.onAssetRestored).not.toHaveBeenCalled();
    },
  );

  it('summarizes additions, removals, module binary and reference changes without offering unsafe restore', () => {
    const before = document();
    const after = document();
    after.assets = [{ path: 'assets/icon/new.png', data: Buffer.from('new') }];
    after.risumAssets = [Buffer.from('module')];
    after.cardAssets = [{ name: 'New', uri: 'assets/icon/new.png' }];
    const rows = compareReviewAssets(before, after);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'assets/icon/test.png', kind: 'removed', canRestore: false }),
        expect.objectContaining({ path: 'assets/icon/new.png', kind: 'added', canRestore: false }),
        expect.objectContaining({ path: 'module-assets/0', kind: 'added', canRestore: false }),
        expect.objectContaining({ path: '[카드 에셋 참조]', kind: 'modified', canRestore: false }),
      ]),
    );
    expect(rows.every((row) => !row.canRestore)).toBe(true);
  });

  it('does not treat metadata object key order as a modification', () => {
    const before = document();
    const after = document();
    before.xMeta = { first: 1, second: 2 };
    after.xMeta = { second: 2, first: 1 };
    expect(compareReviewAssets(before, after)).toEqual([]);
  });
});
