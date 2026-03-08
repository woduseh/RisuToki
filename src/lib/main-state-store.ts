export interface MainStateStore {
  currentFilePath: string | null;
  currentData: Record<string, unknown> | null;
  referenceFiles: Record<string, unknown>[];
  referenceManifestStatus: Record<string, unknown> | null;
  resetCurrentDocument(data: Record<string, unknown>): void;
  setCurrentDocument(filePath: string, data: Record<string, unknown>): void;
  setReferenceFiles(files: Record<string, unknown>[]): void;
  setReferenceManifestStatus(status: Record<string, unknown> | null): void;
}

export function createMainStateStore(): MainStateStore {
  return {
    currentFilePath: null,
    currentData: null,
    referenceFiles: [],
    referenceManifestStatus: null,

    resetCurrentDocument(data) {
      this.currentFilePath = null;
      this.currentData = data;
    },

    setCurrentDocument(filePath, data) {
      this.currentFilePath = filePath;
      this.currentData = data;
    },

    setReferenceFiles(files) {
      this.referenceFiles = files.slice();
    },

    setReferenceManifestStatus(status) {
      this.referenceManifestStatus = status;
    }
  };
}
