function formatRecoveryTimestamp(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) {
    return savedAt;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

export async function runStartupSessionRecovery(deps: {
  api: {
    getPendingSessionRecovery: () => Promise<{
      sourceFilePath: string;
      autosavePath: string;
      staleWarning: string | null;
      provenance: { savedAt: string };
    } | null>;
    resolvePendingSessionRecovery: (
      action: 'restore' | 'open-original' | 'ignore',
    ) => Promise<{ action: 'restore' | 'open-original'; data: Record<string, unknown> } | null>;
  };
  showRecoveryDialog: (summary: {
    sourceFileName: string;
    savedAt: string;
    staleWarning?: string | null;
  }) => Promise<'restore' | 'open-original' | 'ignore'>;
  applyRecoveredDocument: (data: Record<string, unknown>) => void;
  setRestoredSessionLabel: (label: string) => void;
  showRestoredSessionStatus: (text: string) => void;
}): Promise<void> {
  const candidate = await deps.api.getPendingSessionRecovery();
  if (!candidate) {
    return;
  }

  const sourceFileName = getFileName(candidate.sourceFilePath);
  const savedAt = formatRecoveryTimestamp(candidate.provenance.savedAt);
  const action = await deps.showRecoveryDialog({
    sourceFileName,
    savedAt,
    staleWarning: candidate.staleWarning,
  });

  const result = await deps.api.resolvePendingSessionRecovery(action);
  if (!result) {
    return;
  }

  deps.applyRecoveredDocument(result.data);
  if (result.action === 'restore') {
    deps.setRestoredSessionLabel('자동복원');
    deps.showRestoredSessionStatus(`자동 저장에서 복원됨: ${sourceFileName} (${savedAt})`);
  }
}
