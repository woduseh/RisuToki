export interface MainStateStore {
  currentFilePath: string | null;
  currentData: Record<string, unknown> | null;
  referenceFiles: Record<string, unknown>[];
  referenceManifestStatus: Record<string, unknown> | null;
  /**
   * Best-effort terminal cwd tracked from renderer-side input parsing.
   *
   * Synced from the renderer via `set-terminal-cwd` IPC and read back by
   * `get-cwd` / `resolveProjectRoot()`.
   */
  terminalCwd: string | null;
  resetCurrentDocument(data: Record<string, unknown>): void;
  setCurrentDocument(filePath: string, data: Record<string, unknown>): void;
  setReferenceFiles(files: Record<string, unknown>[]): void;
  setReferenceManifestStatus(status: Record<string, unknown> | null): void;
  /** Update the tracked terminal cwd. @see {@link terminalCwd} */
  setTerminalCwd(cwd: string | null): void;
}

export function createMainStateStore(): MainStateStore {
  return {
    currentFilePath: null,
    currentData: null,
    referenceFiles: [],
    referenceManifestStatus: null,
    terminalCwd: null,

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
    },

    setTerminalCwd(cwd) {
      this.terminalCwd = cwd;
    },
  };
}
