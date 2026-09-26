// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RendererDocumentData } from './document-types';
import { markStaleWorkbenchSnapshots, type WorkbenchSnapshots } from './workbench-freshness';

const document = (): RendererDocumentData => ({
  _documentId: 'first',
  _fileType: 'charx',
  name: 'Synthetic',
  description: 'Original',
  firstMessage: '',
  alternateGreetings: [],
  globalNote: '',
  css: '',
  defaultVariables: '',
  lua: '',
  triggerScripts: '[]',
  regex: [],
  lorebook: [
    {
      key: 'a',
      content: 'Nested text',
      secondkey: '',
      comment: '',
      mode: 'normal',
      insertorder: 0,
      order: 0,
      priority: 0,
      alwaysActive: false,
      forceActivation: false,
      selective: false,
      constant: false,
      useRegex: false,
      folder: '',
      extentions: {},
    },
  ],
});
const state = () => ({ previewStale: false, reviewStale: false, diagnosticsStale: false });
afterEach(() => vi.restoreAllMocks());

describe('workbench snapshot freshness', () => {
  it('does not serialize documents before a view is captured or after every captured view is stale', () => {
    const data = document();
    const snapshot = JSON.stringify(data);
    const stringify = vi.spyOn(JSON, 'stringify');
    markStaleWorkbenchSnapshots(data, {}, state());
    markStaleWorkbenchSnapshots(data, { review: snapshot }, { ...state(), reviewStale: true });
    expect(stringify).not.toHaveBeenCalled();
  });

  it('compares one serialization against all live snapshots without touching the snapshots', () => {
    const data = document();
    const text = JSON.stringify(data);
    const snapshots: WorkbenchSnapshots = { preview: text, review: text, diagnostics: text };
    const current = state();
    const stringify = vi.spyOn(JSON, 'stringify');
    markStaleWorkbenchSnapshots(data, snapshots, current);
    expect(stringify).toHaveBeenCalledTimes(1);
    expect(current).toEqual(state());
    data.lorebook![0].content = 'Changed by editor or MCP';
    markStaleWorkbenchSnapshots(data, snapshots, current);
    expect(current).toEqual({ previewStale: true, reviewStale: true, diagnosticsStale: true });
    expect(snapshots.review).toBe(text);
  });

  it('keeps stale views blocked after undo, and permits an explicitly refreshed view', () => {
    const data = document();
    const snapshots = { preview: JSON.stringify(data), review: JSON.stringify(data) };
    const current = state();
    data.description = 'Edited';
    markStaleWorkbenchSnapshots(data, snapshots, current);
    data.description = 'Original';
    markStaleWorkbenchSnapshots(data, snapshots, current);
    expect(current.previewStale).toBe(true);
    expect(current.reviewStale).toBe(true);
    snapshots.review = JSON.stringify(data);
    current.reviewStale = false;
    markStaleWorkbenchSnapshots(data, snapshots, current);
    expect(current.reviewStale).toBe(false);
    expect(current.previewStale).toBe(true);
  });

  it.each(['replacement', null])('invalidates a captured result when the active document is %s', (id) => {
    const data = document();
    const current = state();
    const snapshots = { diagnostics: JSON.stringify(data) };
    markStaleWorkbenchSnapshots(id ? { ...data, _documentId: id } : null, snapshots, current);
    expect(current.diagnosticsStale).toBe(true);
  });
});
