import { asRecord, facadeApiError, type ApiErrorResult } from './mcp-facade-runtime';
import type { ManageAssetsOperation } from './mcp-request-schemas';

function assetByteLength(value: unknown): number {
  if (value instanceof Uint8Array) return value.byteLength;
  if (Array.isArray(value)) return value.every((entry) => typeof entry === 'number') ? value.length : 0;
  const record = asRecord(value);
  return record?.type === 'Buffer' && Array.isArray(record.data) ? record.data.length : 0;
}

export interface ManageAssetsSummary {
  index: number;
  path: string;
  name?: string;
  size: number;
  mimeType?: string;
}

export function assetBytesFromUnknown(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'number')) {
    return Buffer.from(value as number[]);
  }
  const record = asRecord(value);
  if (record?.type === 'Buffer' && Array.isArray(record.data)) return Buffer.from(record.data as number[]);
  return Buffer.alloc(0);
}

export function assetPathBasename(assetPath: string): string {
  return assetPath.split(/[\\/]/).filter(Boolean).pop() ?? assetPath;
}

export function assetExtension(nameOrPath: string): string {
  const base = assetPathBasename(nameOrPath);
  const dotIndex = base.lastIndexOf('.');
  return dotIndex >= 0 ? base.slice(dotIndex + 1).toLowerCase() : '';
}

export function assetMimeType(assetPath: string): string {
  const ext = assetExtension(assetPath);
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'json') return 'application/json';
  if (ext === 'txt' || ext === 'md') return 'text/plain';
  return 'application/octet-stream';
}

export function charxAssetSummary(entry: unknown, index: number): ManageAssetsSummary | ApiErrorResult {
  const record = asRecord(entry);
  if (!record || typeof record.path !== 'string') {
    return facadeApiError(
      400,
      'charx asset entry is not an object with path',
      'Repair the asset list or use the granular surface tools for precision debugging.',
      { index },
    );
  }
  const size = assetByteLength(record.data);
  return {
    index,
    path: record.path,
    name: assetPathBasename(record.path),
    size,
    mimeType: assetMimeType(record.path),
  };
}

export function risumModuleAssets(moduleData: Record<string, unknown> | undefined): unknown[] {
  const moduleRecord = asRecord(moduleData?.module) ?? moduleData;
  return Array.isArray(moduleRecord?.assets) ? (moduleRecord.assets as unknown[]) : [];
}

export function risumAssetSummary(
  asset: unknown,
  index: number,
  moduleData?: Record<string, unknown>,
): ManageAssetsSummary {
  const meta = risumModuleAssets(moduleData)[index];
  const tuple = Array.isArray(meta) ? meta : [];
  const name = typeof tuple[0] === 'string' ? tuple[0] : `asset_${index}`;
  const assetPath = typeof tuple[2] === 'string' ? tuple[2] : '';
  const size = assetByteLength(asset);
  return {
    index,
    name,
    path: assetPath,
    size,
    mimeType: assetMimeType(assetPath || name),
  };
}

export function resolveManageAssetsSelector(
  context: { summaries: ManageAssetsSummary[] },
  selector: Extract<ManageAssetsOperation, { action: 'read_asset' | 'delete_asset' | 'rename_asset' }>['selector'],
  action: string,
): ManageAssetsSummary | ApiErrorResult {
  if (selector.index !== undefined) {
    const summary = context.summaries.find((entry) => entry.index === selector.index);
    if (!summary) {
      return facadeApiError(
        404,
        `Asset index not found: ${selector.index}`,
        'Refresh asset summaries and retry with a current index or path.',
        { index: selector.index, action },
        ['manage_assets'],
      );
    }
    return summary;
  }
  const byPath = context.summaries.filter((entry) => entry.path === selector.path || entry.name === selector.path);
  if (byPath.length === 0) {
    return facadeApiError(
      404,
      `Asset path not found: ${selector.path}`,
      'Refresh asset summaries and retry with a current path or index.',
      { path: selector.path, action },
      ['manage_assets'],
    );
  }
  if (byPath.length > 1) {
    return facadeApiError(
      409,
      `Asset selector is ambiguous: ${selector.path}`,
      'Use selector.index for this asset operation.',
      { path: selector.path, matches: byPath.map((entry) => entry.index), action },
      ['manage_assets'],
    );
  }
  return byPath[0];
}
