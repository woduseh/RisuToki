import type { RendererDocumentData } from './document-types';

export interface DocumentReviewAssetState {
  size: number;
  hash: string;
}

export interface DocumentReviewAssetChange {
  path: string;
  kind: 'added' | 'removed' | 'modified';
  before?: DocumentReviewAssetState;
  after?: DocumentReviewAssetState;
  canRestore: boolean;
}

export type DocumentReviewResult =
  | {
      success: true;
      documentId: string;
      baseline: RendererDocumentData | null;
      baselineLabel: string;
      baselineUnavailable: string | null;
      externalChanged: boolean;
      baselineToken: string | null;
      assets: DocumentReviewAssetChange[];
    }
  | { success: false; error: string };

export interface RestoreReviewAssetRequest {
  documentId: string;
  baselineToken: string;
  path: string;
  currentHash: string | null;
}

export type RestoreReviewAssetResult = { success: true } | { success: false; error: string };
