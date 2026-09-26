// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createDocumentWorkbenchController } from './document-workbench-controller';
import { useWorkbenchStore } from '../stores/workbench-store';
import type { RendererDocumentData } from '../lib/document-types';
import type { DocumentReviewResult } from '../lib/document-review-types';
import type { PreviewAssetInventory } from '../lib/preview-assets';
import type { TabManager } from '../lib/tab-manager';

function document(id = 'first'): RendererDocumentData & { _documentId: string } {
  return {
    _documentId: id,
    _fileType: 'charx',
    name: id,
    description: 'Original',
    firstMessage: '',
    alternateGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: '[]',
    lorebook: [],
    regex: [],
  };
}
function review(draft: RendererDocumentData): DocumentReviewResult {
  return {
    success: true,
    documentId: String(draft._documentId),
    baseline: { ...draft },
    baselineLabel: 'Saved',
    baselineUnavailable: null,
    externalChanged: false,
    baselineToken: 'saved-v1',
    assets: [],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function fixture() {
  setActivePinia(createPinia());
  let current = document();
  const state = useWorkbenchStore();
  const tabs: Pick<TabManager, 'openTabs' | 'dirtyFields' | 'activeTabId'> = {
    openTabs: [],
    dirtyFields: new Set(),
    activeTabId: null,
  };
  const unappliedDrafts = new Set<string>();
  const api = {
    getDocumentReview: vi.fn(async (draft: RendererDocumentData) => review(draft)),
    getPreviewAssetInventory: vi.fn(
      async (): Promise<PreviewAssetInventory> => ({
        documentId: current._documentId,
        names: [],
        entries: [],
        unresolved: [],
      }),
    ),
  };
  const controller = createDocumentWorkbenchController({
    getFileData: () => current,
    getTabs: () => tabs,
    getStore: () => state,
    api,
    unappliedDrafts,
  });
  return {
    state,
    controller,
    api,
    tabs,
    unappliedDrafts,
    get current() {
      return current;
    },
    replace() {
      controller.resetDocument();
      current = document('replacement');
    },
  };
}

describe('document workbench controller', () => {
  it('captures detached review/diagnostic drafts and marks both stale after document edits', async () => {
    const f = fixture();
    await Promise.all([f.controller.refreshReview(), f.controller.refreshDiagnostics()]);
    expect(f.state.reviewStale).toBe(false);
    expect(f.state.diagnosticsStale).toBe(false);
    expect(f.state.diagnosticsError).toBe('');
    expect(f.state.diagnosticsCheckedAt).not.toBeNull();
    f.current.description = 'Edited through a form, Monaco or MCP';
    f.controller.updateFreshness();
    expect(f.state.reviewDraft?.description).toBe('Original');
    expect(f.state.diagnosticsDraft?.description).toBe('Original');
    expect(f.state.reviewStale).toBe(true);
    expect(f.state.diagnosticsStale).toBe(true);
  });

  it.each(['review', 'diagnostics'] as const)(
    'does not let an older %s completion reset the new document result or loading state',
    async (kind) => {
      const f = fixture();
      const refresh = kind === 'review' ? f.controller.refreshReview : f.controller.refreshDiagnostics;
      const oldReview = deferred<DocumentReviewResult>();
      const oldInventory = deferred<PreviewAssetInventory>();
      if (kind === 'review') f.api.getDocumentReview.mockReturnValueOnce(oldReview.promise);
      else f.api.getPreviewAssetInventory.mockReturnValueOnce(oldInventory.promise);
      const old = refresh();
      f.replace();
      await refresh();
      if (kind === 'review') oldReview.reject(new Error('Old disk read failed'));
      else oldInventory.resolve({ documentId: 'first', names: [], entries: [], unresolved: [] });
      await old;
      expect(f.state[`${kind}Draft`]?._documentId).toBe('replacement');
      expect(f.state[`${kind}Loading`]).toBe(false);
      expect(f.state[`${kind}Error`]).toBe('');
      expect(f.state[`${kind}Stale`]).toBe(false);
    },
  );

  it.each(['text', 'assets'] as const)('rejects freshness of an in-flight review after %s changes', async (change) => {
    const f = fixture();
    const saved = deferred<DocumentReviewResult>();
    f.api.getDocumentReview.mockReturnValueOnce(saved.promise);
    const request = f.controller.refreshReview();
    if (change === 'assets') f.controller.markAssetsChanged();
    else f.current.description = 'Changed while awaiting IPC';
    saved.resolve(review(document()));
    await request;
    expect(f.state.reviewLoading).toBe(false);
    expect(f.state.reviewStale).toBe(true);
  });

  it('marks assets unavailable without reporting full diagnostics when inventory acquisition fails', async () => {
    const f = fixture();
    f.api.getPreviewAssetInventory.mockRejectedValueOnce(new Error('IPC unavailable'));
    await f.controller.refreshDiagnostics();
    expect(f.state.diagnosticsAssets).toBeNull();
    expect(f.state.diagnosticsError).toContain('에셋');
    expect(f.state.diagnosticsLoading).toBe(false);
  });

  it('coordinates preview baseline identity and asset staleness independently of widget construction', () => {
    const f = fixture();
    const first = f.controller.capturePreview(f.current);
    f.controller.acceptPreview(first);
    expect(f.state.previewStale).toBe(false);
    f.controller.markAssetsChanged();
    f.controller.acceptPreview(first);
    expect(f.state.previewStale).toBe(true);
    f.replace();
    f.controller.acceptPreview(first);
    f.current.description = 'New document';
    f.controller.updateFreshness();
    expect(f.state.previewStale).toBe(false);
  });

  it('keeps raw draft warnings and source selection separate from the captured text', () => {
    const f = fixture();
    f.tabs.openTabs.push({
      id: 'project:card.json',
      label: 'Raw card',
      language: 'json',
      getValue: () => '{}',
      setValue: null,
      _lastValue: null,
    });
    f.tabs.activeTabId = 'project:card.json';
    f.tabs.dirtyFields.add('project:card.json');
    f.controller.updateFreshness();
    expect(f.state.selection?.label).toBe('Raw card');
    expect(f.state.rawDraftWarning).toContain('프로젝트');
    f.unappliedDrafts.add('project:card.json');
    f.controller.updateFreshness();
    expect(f.state.rawDraftWarning).toContain('JSON');
    f.tabs.openTabs = [];
    f.controller.updateFreshness();
    expect(f.unappliedDrafts.size).toBe(0);
    expect(f.state.selection).toBeNull();
    expect(f.state.rawDraftWarning).toBe('');
  });
});
