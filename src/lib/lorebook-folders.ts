interface LorebookFolderLike {
  key?: unknown;
  id?: unknown;
  comment?: unknown;
  mode?: unknown;
}

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function getFolderUuid(entry: LorebookFolderLike | null | undefined): string | null {
  if (!entry || entry.mode !== 'folder') return null;
  return getNonEmptyString(entry.key) ?? getNonEmptyString(entry.id);
}

export function normalizeFolderRef(folder: unknown): string {
  const raw = getNonEmptyString(folder);
  if (!raw) return '';
  const folderUuid = raw.startsWith('folder:') ? raw.slice('folder:'.length) : raw;
  const normalizedUuid = getNonEmptyString(folderUuid);
  return normalizedUuid ? `folder:${normalizedUuid}` : '';
}

export const toFolderRef = normalizeFolderRef;

export function getFolderRef(entry: LorebookFolderLike | null | undefined): string | null {
  const folderUuid = getFolderUuid(entry);
  return folderUuid ? normalizeFolderRef(folderUuid) : null;
}

export function buildFolderInfoMap(entries: LorebookFolderLike[]): Map<string, { name: string }> {
  const folderMap = new Map<string, { name: string }>();
  for (const entry of entries) {
    const folderRef = getFolderRef(entry);
    if (!folderRef) continue;
    const folderUuid = getFolderUuid(entry) ?? folderRef.slice('folder:'.length);
    folderMap.set(folderRef, {
      name: getNonEmptyString(entry.comment) ?? folderUuid,
    });
  }
  return folderMap;
}
