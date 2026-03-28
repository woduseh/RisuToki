export interface LorebookFolderEntryLike {
  mode?: unknown;
  key?: unknown;
  id?: unknown;
  comment?: unknown;
  folder?: unknown;
  [key: string]: unknown;
}

export interface LorebookFolderInfo {
  entry: LorebookFolderEntryLike;
  legacyRef: string | null;
  index: number;
  name: string;
  ref: string;
  uuid: string;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stripFolderPrefix(value: unknown): string | null {
  let raw = toNonEmptyString(value);
  while (raw?.startsWith('folder:')) {
    raw = toNonEmptyString(raw.slice('folder:'.length));
  }
  return raw;
}

export function getFolderUuid(entry: LorebookFolderEntryLike | null | undefined): string | null {
  if (!entry || entry.mode !== 'folder') return null;
  return stripFolderPrefix(entry.key) ?? stripFolderPrefix(entry.id);
}

export function normalizeFolderRef(folder: unknown): string {
  const uuid = stripFolderPrefix(folder);
  return uuid ? `folder:${uuid}` : '';
}

export function getFolderRef(entry: LorebookFolderEntryLike | null | undefined): string | null {
  const uuid = getFolderUuid(entry);
  return uuid ? `folder:${uuid}` : null;
}

function getLegacyFolderRef(entry: LorebookFolderEntryLike | null | undefined): string | null {
  const legacyUuid = stripFolderPrefix(entry?.id);
  return legacyUuid ? `folder:${legacyUuid}` : null;
}

export function buildFolderInfoMap(entries: LorebookFolderEntryLike[]): Map<string, LorebookFolderInfo> {
  const map = new Map<string, LorebookFolderInfo>();
  entries.forEach((entry, index) => {
    const ref = getFolderRef(entry);
    if (!ref) return;
    const uuid = ref.slice('folder:'.length);
    map.set(ref, {
      entry,
      index,
      legacyRef: getLegacyFolderRef(entry),
      name: toNonEmptyString(entry.comment) ?? uuid,
      ref,
      uuid,
    });
  });
  return map;
}

function buildFolderRefAliasMap(entries: LorebookFolderEntryLike[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const info of buildFolderInfoMap(entries).values()) {
    aliases.set(info.ref, info.ref);
    if (info.legacyRef) {
      aliases.set(info.legacyRef, info.ref);
    }
  }
  return aliases;
}

export function resolveLorebookFolderRef(
  folder: unknown,
  entriesOrAliases: LorebookFolderEntryLike[] | Map<string, string>,
): string {
  const normalized = normalizeFolderRef(folder);
  if (!normalized) return '';
  const aliases = entriesOrAliases instanceof Map ? entriesOrAliases : buildFolderRefAliasMap(entriesOrAliases);
  return aliases.get(normalized) ?? normalized;
}

export function canonicalizeLorebookFolderRefs<T extends LorebookFolderEntryLike>(entries: T[]): T[] {
  const aliases = buildFolderRefAliasMap(entries);
  for (const entry of entries) {
    if (entry.mode === 'folder') {
      const uuid = getFolderUuid(entry);
      if (uuid) {
        entry.key = normalizeFolderRef(uuid);
      }
      entry.folder = '';
      continue;
    }

    entry.folder = resolveLorebookFolderRef(entry.folder, aliases);
  }
  return entries;
}
