import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { LoadedDocumentData } from '../charx-io';
import { applyUpdates, serializeForRenderer } from './data-serializer';
import type { RendererDocumentData, RendererDocumentPatch } from './document-types';

const documentIds = new WeakMap<LoadedDocumentData, string>();

function getDocumentId(data: LoadedDocumentData): string {
  let id = documentIds.get(data);
  if (!id) {
    id = randomUUID();
    documentIds.set(data, id);
  }
  return id;
}

export function serializeActiveDocument(data: LoadedDocumentData): RendererDocumentData {
  return { ...serializeForRenderer(data), _documentId: getDocumentId(data) };
}

export function applyRendererUpdates(data: LoadedDocumentData, fields: RendererDocumentPatch | null | undefined): void {
  if (fields && '_documentId' in fields && fields._documentId !== getDocumentId(data)) {
    throw new Error(
      '문서가 다시 불러와졌거나 교체되어 이전 편집 내용을 저장하지 않았습니다. 현재 문서를 확인해 주세요.',
    );
  }
  applyUpdates(data, fields);
}

export function hasRendererDocumentChanges(
  data: LoadedDocumentData,
  rendererDocument: RendererDocumentData | null | undefined,
): boolean {
  return !isDeepStrictEqual(serializeActiveDocument(data), rendererDocument);
}
