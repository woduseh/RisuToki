// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { LoadedDocumentData } from '../charx-io';
import { applyRendererUpdates, hasRendererDocumentChanges, serializeActiveDocument } from './renderer-document-state';

function document(): LoadedDocumentData {
  return {
    _fileType: 'charx',
    name: 'Synthetic',
    description: 'Original',
    firstMessage: '',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    _risuExt: {},
    _card: {},
    _moduleData: null,
    _presetData: null,
  } as LoadedDocumentData;
}

describe('renderer document identity', () => {
  it('rejects a stale renderer save after main reloads a new document object', () => {
    const original = document();
    const renderer = structuredClone(serializeActiveDocument(original));
    const reloaded = document();
    renderer.description = 'Old editor draft';
    expect(() => applyRendererUpdates(reloaded, renderer)).toThrow('이전 편집 내용');
    expect(reloaded.description).toBe('Original');
  });

  it('accepts edits to the same document and keeps identity outside the loaded payload', () => {
    const loaded = document();
    const renderer = structuredClone(serializeActiveDocument(loaded));
    renderer.description = 'Updated';
    applyRendererUpdates(loaded, renderer);
    expect(loaded.description).toBe('Updated');
    expect(serializeActiveDocument(loaded)._documentId).toBe(renderer._documentId);
    expect(loaded).not.toHaveProperty('_documentId');
    expect(loaded._card).not.toHaveProperty('_documentId');
  });

  it('accepts internal partial updates without a renderer identity', () => {
    const loaded = document();
    applyRendererUpdates(loaded, {});
    applyRendererUpdates(loaded, { description: 'Internal update' });
    expect(loaded.description).toBe('Internal update');
  });

  it('does not treat an MCP-reflected dirty snapshot as an additional local change', () => {
    const loaded = document();
    const renderer = structuredClone(serializeActiveDocument(loaded));
    loaded.description = 'MCP update';
    renderer.description = 'MCP update';
    expect(hasRendererDocumentChanges(loaded, renderer)).toBe(false);
    renderer.lorebook.push({ content: 'Local draft' } as (typeof renderer.lorebook)[number]);
    expect(hasRendererDocumentChanges(loaded, renderer)).toBe(true);
  });

  it('detects a stale document identity even when all visible content is identical', () => {
    const renderer = structuredClone(serializeActiveDocument(document()));
    expect(hasRendererDocumentChanges(document(), renderer)).toBe(true);
  });
});
