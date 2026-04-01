import type { RecoveryFileType } from './session-recovery';

interface RecoveryActivationManager {
  markDocumentActive(filePath: string, fileType: RecoveryFileType): Promise<void>;
}

interface SaveResultLike {
  success: boolean;
  path?: string;
}

export function getRecoveryFileTypeForPath(filePath: string): RecoveryFileType {
  if (filePath.endsWith('.risum')) return 'risum';
  if (filePath.endsWith('.risup')) return 'risup';
  return 'charx';
}

export async function markRecoveryDocumentActiveForPath(
  recoveryManager: RecoveryActivationManager | null,
  filePath: string | null,
): Promise<void> {
  if (!recoveryManager || !filePath) {
    return;
  }

  await recoveryManager.markDocumentActive(filePath, getRecoveryFileTypeForPath(filePath));
}

export async function syncRecoveryAfterExplicitSave(
  recoveryManager: RecoveryActivationManager | null,
  saveResult: SaveResultLike,
): Promise<void> {
  if (!saveResult.success || !saveResult.path) {
    return;
  }

  await markRecoveryDocumentActiveForPath(recoveryManager, saveResult.path);
}
