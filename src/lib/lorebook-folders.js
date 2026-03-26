"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toFolderRef = void 0;
exports.getFolderUuid = getFolderUuid;
exports.normalizeFolderRef = normalizeFolderRef;
exports.getFolderRef = getFolderRef;
exports.buildFolderInfoMap = buildFolderInfoMap;
function getNonEmptyString(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
}
function getFolderUuid(entry) {
    if (!entry || entry.mode !== 'folder')
        return null;
    return getNonEmptyString(entry.key) ?? getNonEmptyString(entry.id);
}
function normalizeFolderRef(folder) {
    const raw = getNonEmptyString(folder);
    if (!raw)
        return '';
    const folderUuid = raw.startsWith('folder:') ? raw.slice('folder:'.length) : raw;
    const normalizedUuid = getNonEmptyString(folderUuid);
    return normalizedUuid ? `folder:${normalizedUuid}` : '';
}
exports.toFolderRef = normalizeFolderRef;
function getFolderRef(entry) {
    const folderUuid = getFolderUuid(entry);
    return folderUuid ? normalizeFolderRef(folderUuid) : null;
}
function buildFolderInfoMap(entries) {
    const folderMap = new Map();
    for (const entry of entries) {
        const folderRef = getFolderRef(entry);
        if (!folderRef)
            continue;
        const folderUuid = getFolderUuid(entry) ?? folderRef.slice('folder:'.length);
        folderMap.set(folderRef, {
            name: getNonEmptyString(entry.comment) ?? folderUuid,
        });
    }
    return folderMap;
}
