import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomicSync } from './atomic-write';

export const PROJECT_SAVE_RECOVERY_MARKER = '.risutoki-save-recovery.json';

export function assertProjectRecoveryResolved(projectDir: string): void {
  const markerPath = path.join(projectDir, PROJECT_SAVE_RECOVERY_MARKER);
  if (!fs.existsSync(markerPath)) return;
  let backupPath = '';
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (typeof marker.backupPath === 'string') backupPath = marker.backupPath;
  } catch {
    // An unreadable checkpoint marker must still block access to a partial save.
  }
  throw new Error(
    `Project has an unresolved save checkpoint: ${markerPath}. Inspect the backup${backupPath ? ` at ${backupPath}` : ''} in a separate folder before resolving the marker.`,
  );
}

export function withProjectSaveRecovery<T>(projectDir: string, save: () => T, verify?: () => void): T {
  const resolvedDir = path.resolve(projectDir);
  assertProjectRecoveryResolved(resolvedDir);
  if (!fs.existsSync(resolvedDir)) {
    verify?.();
    return save();
  }

  const backupPath = fs.mkdtempSync(path.join(path.dirname(resolvedDir), `.${path.basename(resolvedDir)}-recovery-`));
  const markerPath = path.join(resolvedDir, PROJECT_SAVE_RECOVERY_MARKER);
  try {
    fs.cpSync(resolvedDir, backupPath, {
      recursive: true,
      filter(source) {
        if (fs.lstatSync(source).isSymbolicLink()) {
          throw new Error(`Project save cannot checkpoint a symbolic link: ${source}`);
        }
        return true;
      },
    });
    verify?.();
    writeFileAtomicSync(markerPath, JSON.stringify({ version: 1, backupPath }), { flush: true });
  } catch (error) {
    try {
      fs.rmSync(backupPath, { recursive: true, force: true });
    } catch {
      // Keep the original checkpoint/verification failure.
    }
    throw error;
  }

  let result: T;
  try {
    result = save();
    fs.unlinkSync(markerPath);
  } catch (error) {
    throw new Error(
      `Project save failed: ${error instanceof Error ? error.message : String(error)}. Recovery checkpoint retained at ${backupPath}.`,
      { cause: error },
    );
  }
  try {
    fs.rmSync(backupPath, { recursive: true, force: true });
  } catch {
    // The project is complete; an orphaned backup must not turn success into failure.
  }
  return result;
}
