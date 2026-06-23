import * as path from 'path';

interface AssetReferenceData {
  assets?: Array<{ path?: unknown }>;
  cardAssets?: unknown[];
  xMeta?: Record<string, unknown>;
}

const ASSET_FILE_NAME_PATTERN = /^[a-zA-Z0-9가-힣._\- ]+$/;

export function validateAssetFileName(name: unknown): string | null {
  if (typeof name !== 'string' || name.length === 0) return '에셋 파일명이 필요합니다.';
  if (name.length > 255) return '에셋 파일명은 255자 이하여야 합니다.';
  if (name.trim() !== name || /^\.+$/.test(name) || !ASSET_FILE_NAME_PATTERN.test(name)) {
    return '파일명에 허용되지 않는 문자가 포함되어 있습니다.';
  }
  return null;
}

function assetStem(assetPath: string): string {
  return path.parse(path.basename(assetPath)).name;
}

function assetExtension(assetPath: string): string {
  return path.extname(assetPath).slice(1).toLowerCase();
}

function replaceAssetUri(uri: string, oldPath: string, newPath: string): string | null {
  for (const prefix of ['embeded://', 'ccdefault:']) {
    if (uri === `${prefix}${oldPath}`) return `${prefix}${newPath}`;
  }
  return uri === oldPath ? newPath : null;
}

export function addAssetReferences(data: AssetReferenceData, assetPath: string, folder: 'icon' | 'other'): void {
  const fileName = path.basename(assetPath);
  const stem = assetStem(assetPath);
  const ext = assetExtension(assetPath);

  if (!Array.isArray(data.cardAssets)) data.cardAssets = [];
  const uri = `embeded://${assetPath}`;
  const exists = data.cardAssets.some(
    (entry) => !!entry && typeof entry === 'object' && (entry as Record<string, unknown>).uri === uri,
  );
  if (!exists) {
    data.cardAssets.push({
      type: folder === 'icon' ? 'icon' : 'x-risu-asset',
      uri,
      name: stem || fileName,
      ext,
    });
  }

  if (!data.xMeta || typeof data.xMeta !== 'object') data.xMeta = {};
  data.xMeta[stem] = { type: ext === 'jpg' ? 'JPEG' : ext.toUpperCase() };
}

export function deleteAssetReferences(data: AssetReferenceData, assetPath: string): void {
  if (Array.isArray(data.cardAssets)) {
    const nextCardAssets = data.cardAssets.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      const uri = (entry as Record<string, unknown>).uri;
      return typeof uri !== 'string' || replaceAssetUri(uri, assetPath, '') === null;
    });
    data.cardAssets.splice(0, data.cardAssets.length, ...nextCardAssets);
  }

  const stem = assetStem(assetPath);
  const stemStillUsed = (data.assets || []).some(
    (asset) => typeof asset.path === 'string' && asset.path !== assetPath && assetStem(asset.path) === stem,
  );
  if (!stemStillUsed && data.xMeta && typeof data.xMeta === 'object') {
    delete data.xMeta[stem];
  }
}

export function renameAssetReferences(data: AssetReferenceData, oldPath: string, newPath: string): void {
  const oldStem = assetStem(oldPath);
  const newStem = assetStem(newPath);
  const newExt = assetExtension(newPath);

  if (Array.isArray(data.cardAssets)) {
    for (const entry of data.cardAssets) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      if (typeof record.uri !== 'string') continue;
      const nextUri = replaceAssetUri(record.uri, oldPath, newPath);
      if (nextUri === null) continue;
      record.uri = nextUri;
      record.name = newStem;
      record.ext = newExt;
    }
  }

  if (data.xMeta && typeof data.xMeta === 'object' && oldStem in data.xMeta) {
    data.xMeta[newStem] = data.xMeta[oldStem];
    if (oldStem !== newStem) delete data.xMeta[oldStem];
  }
}
