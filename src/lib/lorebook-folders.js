"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFolderUuid = getFolderUuid;
exports.normalizeFolderRef = normalizeFolderRef;
exports.getFolderRef = getFolderRef;
exports.buildFolderInfoMap = buildFolderInfoMap;
exports.resolveLorebookFolderRef = resolveLorebookFolderRef;
exports.canonicalizeLorebookFolderRefs = canonicalizeLorebookFolderRefs;
function toNonEmptyString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function stripFolderPrefix(value) {
    let raw = toNonEmptyString(value);
    while (raw?.startsWith('folder:')) {
        raw = toNonEmptyString(raw.slice('folder:'.length));
    }
    return raw;
}
function getFolderUuid(entry) {
    if (!entry || entry.mode !== 'folder')
        return null;
    return stripFolderPrefix(entry.key) ?? stripFolderPrefix(entry.id);
}
function normalizeFolderRef(folder) {
    const uuid = stripFolderPrefix(folder);
    return uuid ? `folder:${uuid}` : '';
}
function getFolderRef(entry) {
    const uuid = getFolderUuid(entry);
    return uuid ? `folder:${uuid}` : null;
}
function getLegacyFolderRef(entry) {
    const legacyUuid = stripFolderPrefix(entry?.id);
    return legacyUuid ? `folder:${legacyUuid}` : null;
}
function buildFolderInfoMap(entries) {
    const map = new Map();
    entries.forEach((entry, index) => {
        const ref = getFolderRef(entry);
        if (!ref)
            return;
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
function buildFolderRefAliasMap(entries) {
    const aliases = new Map();
    for (const info of buildFolderInfoMap(entries).values()) {
        aliases.set(info.ref, info.ref);
        if (info.legacyRef) {
            aliases.set(info.legacyRef, info.ref);
        }
    }
    return aliases;
}
function resolveLorebookFolderRef(folder, entriesOrAliases) {
    const normalized = normalizeFolderRef(folder);
    if (!normalized)
        return '';
    const aliases = entriesOrAliases instanceof Map ? entriesOrAliases : buildFolderRefAliasMap(entriesOrAliases);
    return aliases.get(normalized) ?? normalized;
}
function canonicalizeLorebookFolderRefs(entries) {
    const aliases = buildFolderRefAliasMap(entries);
    for (const entry of entries) {
        if (entry.mode === 'folder') {
            const uuid = getFolderUuid(entry);
            if (uuid) {
                entry.key = uuid;
            }
            entry.folder = '';
            continue;
        }
        entry.folder = resolveLorebookFolderRef(entry.folder, aliases);
    }
    return entries;
}
