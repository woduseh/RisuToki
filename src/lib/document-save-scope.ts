interface DocumentSaveState {
  currentData: object | null;
  currentFilePath: string | null;
  currentProjectPath: string | null;
}

/** A file dialog can yield while another request replaces the active document. */
export function captureDocumentSaveScope(state: DocumentSaveState): () => void {
  const { currentData, currentFilePath, currentProjectPath } = state;
  return () => {
    if (
      state.currentData !== currentData ||
      state.currentFilePath !== currentFilePath ||
      state.currentProjectPath !== currentProjectPath
    ) {
      throw new Error('Active document changed while saving. Save was cancelled; retry from the current document.');
    }
  };
}
