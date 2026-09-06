import { extToMime } from './shared-utils';

export type PreviewAssetSource = 'risu-extension' | 'card' | 'module' | 'zip';

export interface PreviewAssetManifestEntry {
  name: string;
  uri: string;
  ext: string;
  mime: string;
  type: string;
  source: PreviewAssetSource;
  path?: string;
}

export interface PreviewAssetsResult {
  assets: Record<string, string>;
  manifest: PreviewAssetManifestEntry[];
  icon: string | null;
  debug: Record<string, unknown>;
}

/** Resolved aliases and reference metadata, without media bytes or remote URLs. */
export interface PreviewAssetInventory {
  documentId?: string | null;
  names: string[];
  entries: Array<Omit<PreviewAssetManifestEntry, 'uri'>>;
  unresolved: string[];
}

interface BinaryAsset {
  path: string;
  data: Buffer | Uint8Array;
}

interface CardAsset {
  name?: unknown;
  uri?: unknown;
  ext?: unknown;
  type?: unknown;
}

interface PreviewAssetDocument {
  assets?: BinaryAsset[];
  cardAssets?: CardAsset[];
  risumAssets?: Array<Buffer | Uint8Array>;
  _risuExt?: {
    additionalAssets?: unknown;
  };
  _moduleData?: {
    module?: {
      assets?: unknown;
    };
  } | null;
}

function extensionFromPath(assetPath: string): string {
  const fileName = assetPath.split('/').pop() || '';
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

function normalizePath(assetPath: string): string {
  return assetPath.replaceAll('\\', '/').replace(/^\.?\//, '');
}

function toDataUri(data: Buffer | Uint8Array, ext: string): string {
  return `data:${extToMime(ext || 'png')};base64,${Buffer.from(data).toString('base64')}`;
}

function looksLikeBase64(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  return compact.length >= 4 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
}

function resolvePreviewAssets(data: PreviewAssetDocument, includeBinaryData: boolean): PreviewAssetsResult {
  const binaryUri = (bytes: Buffer | Uint8Array, ext: string) =>
    includeBinaryData ? toDataUri(bytes, ext) : 'available:';
  const zipAssets = Array.isArray(data.assets) ? data.assets : [];
  const cardAssets = Array.isArray(data.cardAssets) ? data.cardAssets : [];
  const risumAssets = Array.isArray(data.risumAssets) ? data.risumAssets : [];
  const result: Record<string, string> = {};
  const manifest: PreviewAssetManifestEntry[] = [];
  const unresolved: string[] = [];
  const zipByPath = new Map<string, BinaryAsset>();

  for (const asset of zipAssets) {
    if (!asset || typeof asset.path !== 'string') continue;
    zipByPath.set(normalizePath(asset.path), asset);
  }

  function resolveZipAsset(key: string): { asset: BinaryAsset; path: string } | null {
    const normalizedKey = normalizePath(key);
    const exact = zipByPath.get(normalizedKey);
    if (exact) return { asset: exact, path: normalizedKey };

    if (/^\d+$/.test(normalizedKey)) {
      const indexed = zipAssets[Number(normalizedKey)];
      if (indexed) return { asset: indexed, path: normalizePath(indexed.path) };
    }

    const decoded = (() => {
      try {
        return decodeURIComponent(normalizedKey);
      } catch {
        return normalizedKey;
      }
    })();
    const decodedAsset = zipByPath.get(decoded);
    if (decodedAsset) return { asset: decodedAsset, path: decoded };
    return null;
  }

  function resolveUri(
    rawUri: string,
    extHint: string,
    defaultIcon: string | null,
  ): { uri: string; ext: string; path?: string } | null {
    const uri = rawUri.trim();
    if (!uri) return null;
    if (/^(?:data:|https?:\/\/|blob:)/i.test(uri)) {
      return { uri, ext: extHint };
    }

    if (uri === 'ccdefault:' || uri === 'ccdefault') {
      return defaultIcon ? { uri: defaultIcon, ext: extHint } : null;
    }

    let assetKey = uri;
    if (uri.startsWith('__asset:')) assetKey = uri.slice('__asset:'.length);
    else if (uri.startsWith('embeded://')) assetKey = uri.slice('embeded://'.length);
    else if (uri.startsWith('ccdefault:')) assetKey = uri.slice('ccdefault:'.length);

    const resolved = resolveZipAsset(assetKey);
    if (resolved) {
      const ext = extHint || extensionFromPath(resolved.path);
      return { uri: binaryUri(resolved.asset.data, ext), ext, path: resolved.path };
    }

    if (looksLikeBase64(uri)) {
      return {
        uri: `data:${extToMime(extHint || 'png')};base64,${uri.replace(/\s+/g, '')}`,
        ext: extHint || 'png',
      };
    }
    return null;
  }

  function addEntry(entry: PreviewAssetManifestEntry, overwrite = false): void {
    manifest.push(entry);
    if (overwrite || !result[entry.name]) result[entry.name] = entry.uri;
  }

  let icon: string | null = null;
  const mainIcon = cardAssets.find((entry) => entry?.type === 'icon' && entry?.name === 'main');
  if (mainIcon && typeof mainIcon.uri === 'string') {
    const resolved = resolveUri(mainIcon.uri, typeof mainIcon.ext === 'string' ? mainIcon.ext : '', null);
    if (resolved) icon = resolved.uri;
  }
  if (!icon) {
    const fallbackIcon = zipAssets.find((asset) => normalizePath(asset.path).startsWith('assets/icon/'));
    if (fallbackIcon) icon = binaryUri(fallbackIcon.data, extensionFromPath(fallbackIcon.path));
  }

  const rawAdditionalAssets = data._risuExt?.additionalAssets;
  const additionalAssets = Array.isArray(rawAdditionalAssets) ? rawAdditionalAssets : [];
  for (const rawEntry of additionalAssets) {
    if (!Array.isArray(rawEntry) || typeof rawEntry[0] !== 'string' || typeof rawEntry[1] !== 'string') continue;
    const name = rawEntry[0];
    const ext =
      typeof rawEntry[2] === 'string' ? rawEntry[2].replace(/^\./, '').toLowerCase() : extensionFromPath(rawEntry[1]);
    const resolved = resolveUri(rawEntry[1], ext, icon);
    if (!resolved) {
      unresolved.push(name);
      continue;
    }
    addEntry({
      name,
      uri: resolved.uri,
      ext: resolved.ext,
      mime: extToMime(resolved.ext || 'png'),
      type: 'x-risu-asset',
      source: 'risu-extension',
      path: resolved.path,
    });
  }

  for (const rawEntry of cardAssets) {
    const name = typeof rawEntry?.name === 'string' ? rawEntry.name : '';
    const rawUri = typeof rawEntry?.uri === 'string' ? rawEntry.uri : '';
    if (!name || !rawUri) continue;
    const ext =
      typeof rawEntry.ext === 'string' ? rawEntry.ext.replace(/^\./, '').toLowerCase() : extensionFromPath(rawUri);
    const resolved = resolveUri(rawUri, ext, icon);
    if (!resolved) {
      unresolved.push(name);
      continue;
    }
    const type = typeof rawEntry.type === 'string' ? rawEntry.type : 'asset';
    addEntry({
      name,
      uri: resolved.uri,
      ext: resolved.ext,
      mime: extToMime(resolved.ext || 'png'),
      type,
      source: 'card',
      path: resolved.path,
    });
    if (type === 'icon' && name === 'main') icon = resolved.uri;
  }

  const moduleAssets = data._moduleData?.module?.assets;
  const normalizedModuleAssets = Array.isArray(moduleAssets) ? moduleAssets : [];
  for (let index = 0; index < normalizedModuleAssets.length; index++) {
    const rawEntry = normalizedModuleAssets[index];
    const record = rawEntry && typeof rawEntry === 'object' ? (rawEntry as Record<string, unknown>) : {};
    const name =
      typeof record.name === 'string'
        ? record.name
        : Array.isArray(rawEntry) && typeof rawEntry[0] === 'string'
          ? rawEntry[0]
          : '';
    if (!name || result[name]) continue;
    const assetIndex = typeof record.index === 'number' ? record.index : index;
    const binary = risumAssets[assetIndex];
    if (!binary) {
      unresolved.push(name);
      continue;
    }
    const extValue =
      typeof record.ext === 'string'
        ? record.ext
        : Array.isArray(rawEntry) && typeof rawEntry[2] === 'string'
          ? rawEntry[2]
          : 'png';
    const ext = extValue.replace(/^\./, '').toLowerCase();
    addEntry({
      name,
      uri: binaryUri(binary, ext),
      ext,
      mime: extToMime(ext),
      type: 'module-asset',
      source: 'module',
    });
  }

  for (let index = 0; index < zipAssets.length; index++) {
    const asset = zipAssets[index];
    const assetPath = normalizePath(asset.path);
    const fileName = assetPath.split('/').pop() || assetPath;
    const name = fileName.replace(/\.[^.]+$/, '');
    const ext = extensionFromPath(assetPath);
    const uri = binaryUri(asset.data, ext);
    addEntry({ name, uri, ext, mime: extToMime(ext), type: 'zip-asset', source: 'zip', path: assetPath });
    if (!result[assetPath]) result[assetPath] = uri;
    if (!result[`embeded://${assetPath}`]) result[`embeded://${assetPath}`] = uri;
    if (!result[`__asset:${index}`]) result[`__asset:${index}`] = uri;
  }

  if (icon) {
    result['__source:char'] = icon;
    result['ccdefault:'] = icon;
  }

  return {
    assets: result,
    manifest,
    icon,
    debug: {
      additionalAssets: additionalAssets.length,
      cardAssets: cardAssets.length,
      moduleAssets: normalizedModuleAssets.length,
      zipAssets: zipAssets.length,
      totalResolved: Object.keys(result).length,
      unresolved: unresolved.slice(0, 20),
    },
  };
}

export function buildPreviewAssets(data: PreviewAssetDocument): PreviewAssetsResult {
  return resolvePreviewAssets(data, true);
}

export function buildPreviewAssetInventory(data: PreviewAssetDocument): PreviewAssetInventory {
  const result = resolvePreviewAssets(data, false);
  return {
    names: Object.keys(result.assets),
    entries: result.manifest.map(({ name, ext, mime, type, source, path }) => ({
      name,
      ext,
      mime,
      type,
      source,
      ...(path ? { path } : {}),
    })),
    unresolved: result.debug.unresolved as string[],
  };
}
