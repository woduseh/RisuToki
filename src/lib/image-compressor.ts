import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CharxAssetLike {
  path: string;
  data: Buffer;
}

export interface CompressOptions {
  /** WebP quality 0-100 (default: 80) */
  quality?: number;
  /** Re-compress files already in WebP format (default: false) */
  recompressWebp?: boolean;
}

export interface CompressResult {
  /** Compressed assets (with updated paths) */
  assets: CharxAssetLike[];
  /** Per-asset details */
  details: AssetDetail[];
  /** Aggregate statistics */
  stats: CompressStats;
}

export interface AssetDetail {
  originalPath: string;
  newPath: string;
  originalSize: number;
  newSize: number;
  status: 'converted' | 'skipped' | 'failed' | 'larger';
  reason?: string;
}

export interface CompressStats {
  total: number;
  converted: number;
  skipped: number;
  failed: number;
  larger: number;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  savedPercent: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_QUALITY = 80;

const CONVERTIBLE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'tif', 'avif']);

const SKIP_EXTENSIONS = new Set(['svg', 'svg+xml']);

// ---------------------------------------------------------------------------
// Core compression
// ---------------------------------------------------------------------------

/**
 * Compress image assets to WebP format using sharp.
 * - SVG files are always skipped (vector → raster quality loss)
 * - Already-WebP files are skipped unless recompressWebp is true
 * - If the WebP output is larger than the original, the original is kept
 * - On conversion failure, the original is kept with a warning
 */
export async function compressAssetsToWebP(
  assets: CharxAssetLike[],
  options: CompressOptions = {},
): Promise<CompressResult> {
  // Lazy-load sharp to avoid issues when module isn't available
  let sharp: typeof import('sharp');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sharp = require('sharp');
  } catch {
    throw new Error('sharp is not available. Install it with: npm install sharp');
  }

  const quality = Math.max(0, Math.min(100, options.quality ?? DEFAULT_QUALITY));
  const recompressWebp = options.recompressWebp ?? false;

  const resultAssets: CharxAssetLike[] = [];
  const details: AssetDetail[] = [];

  for (const asset of assets) {
    const ext = getExtension(asset.path);

    // Skip SVG
    if (SKIP_EXTENSIONS.has(ext)) {
      resultAssets.push(asset);
      details.push({
        originalPath: asset.path,
        newPath: asset.path,
        originalSize: asset.data.length,
        newSize: asset.data.length,
        status: 'skipped',
        reason: 'SVG (vector format)',
      });
      continue;
    }

    // Skip already-WebP unless recompress requested
    if (ext === 'webp' && !recompressWebp) {
      resultAssets.push(asset);
      details.push({
        originalPath: asset.path,
        newPath: asset.path,
        originalSize: asset.data.length,
        newSize: asset.data.length,
        status: 'skipped',
        reason: 'Already WebP',
      });
      continue;
    }

    // Skip non-image files
    if (!CONVERTIBLE_EXTENSIONS.has(ext) && ext !== 'webp') {
      resultAssets.push(asset);
      details.push({
        originalPath: asset.path,
        newPath: asset.path,
        originalSize: asset.data.length,
        newSize: asset.data.length,
        status: 'skipped',
        reason: `Unsupported format: .${ext}`,
      });
      continue;
    }

    // Attempt conversion
    try {
      const sharpInstance = sharp(asset.data, { animated: true });
      const metadata = await sharpInstance.metadata();

      const webpOptions: import('sharp').WebpOptions = {
        quality,
      };

      // Animated images (GIF, animated WebP)
      if (metadata.pages && metadata.pages > 1) {
        webpOptions.loop = metadata.loop ?? 0;
      }

      const webpBuffer = await sharp(asset.data, { animated: true }).webp(webpOptions).toBuffer();

      // If WebP is larger, keep the original
      if (webpBuffer.length >= asset.data.length) {
        resultAssets.push(asset);
        details.push({
          originalPath: asset.path,
          newPath: asset.path,
          originalSize: asset.data.length,
          newSize: asset.data.length,
          status: 'larger',
          reason: `WebP (${formatBytes(webpBuffer.length)}) >= original (${formatBytes(asset.data.length)})`,
        });
        continue;
      }

      const newPath = replaceExtension(asset.path, 'webp');
      resultAssets.push({ path: newPath, data: webpBuffer });
      details.push({
        originalPath: asset.path,
        newPath,
        originalSize: asset.data.length,
        newSize: webpBuffer.length,
        status: 'converted',
      });
    } catch (err: unknown) {
      // On failure, keep the original
      resultAssets.push(asset);
      const message = err instanceof Error ? err.message : String(err);
      details.push({
        originalPath: asset.path,
        newPath: asset.path,
        originalSize: asset.data.length,
        newSize: asset.data.length,
        status: 'failed',
        reason: message,
      });
    }
  }

  const stats = computeStats(details);
  return { assets: resultAssets, details, stats };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(filePath: string): string {
  return path.extname(filePath).replace('.', '').toLowerCase();
}

function replaceExtension(filePath: string, newExt: string): string {
  const parsed = path.parse(filePath);
  // Use forward slashes for ZIP paths
  return `${parsed.dir}/${parsed.name}.${newExt}`.replace(/\\/g, '/');
}

function computeStats(details: AssetDetail[]): CompressStats {
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  let larger = 0;
  let originalSize = 0;
  let compressedSize = 0;

  for (const d of details) {
    originalSize += d.originalSize;
    compressedSize += d.newSize;
    switch (d.status) {
      case 'converted':
        converted++;
        break;
      case 'skipped':
        skipped++;
        break;
      case 'failed':
        failed++;
        break;
      case 'larger':
        larger++;
        break;
    }
  }

  const savedBytes = originalSize - compressedSize;
  const savedPercent = originalSize > 0 ? Math.round((savedBytes / originalSize) * 10000) / 100 : 0;

  return {
    total: details.length,
    converted,
    skipped,
    failed,
    larger,
    originalSize,
    compressedSize,
    savedBytes,
    savedPercent,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Update asset references in cardAssets and x_meta after path changes.
 * Returns the number of references updated.
 */
export function updateAssetReferences(
  pathMap: Map<string, string>,
  cardAssets: unknown[],
  xMeta: Record<string, unknown>,
): { cardAssetsUpdated: number; xMetaUpdated: number } {
  let cardAssetsUpdated = 0;
  let xMetaUpdated = 0;

  // Update cardAssets URI references
  for (const ca of cardAssets) {
    if (ca && typeof ca === 'object') {
      const obj = ca as Record<string, unknown>;
      if (typeof obj.uri === 'string') {
        for (const [oldPath, newPath] of pathMap) {
          const oldName = path.basename(oldPath);
          const newName = path.basename(newPath);
          if (obj.uri.includes(oldName)) {
            obj.uri = (obj.uri as string).replace(oldName, newName);
            if (typeof obj.ext === 'string') {
              obj.ext = 'webp';
            }
            if (typeof obj.name === 'string' && (obj.name as string).includes(oldName)) {
              obj.name = (obj.name as string).replace(
                path.parse(oldName).name + path.extname(oldName),
                path.parse(newName).name + '.webp',
              );
            }
            cardAssetsUpdated++;
            break;
          }
        }
      }
    }
  }

  // Update x_meta keys (filename-based)
  const keysToRename: [string, string][] = [];
  for (const [oldPath, newPath] of pathMap) {
    const oldKey = path.parse(path.basename(oldPath)).name;
    const newKey = path.parse(path.basename(newPath)).name;
    if (oldKey !== newKey && oldKey in xMeta) {
      keysToRename.push([oldKey, newKey]);
    }
  }
  for (const [oldKey, newKey] of keysToRename) {
    xMeta[newKey] = xMeta[oldKey];
    delete xMeta[oldKey];
    xMetaUpdated++;
  }

  return { cardAssetsUpdated, xMetaUpdated };
}
