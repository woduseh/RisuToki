import * as path from 'path';

import { addAssetReferences, deleteAssetReferences, renameAssetReferences, validateAssetFileName } from './asset-utils';
import { compressAssetsToWebP, updateAssetReferences, type CharxAssetLike } from './image-compressor';
import {
  asRecord,
  buildGuard,
  facadeApiError,
  guardValue,
  isApiError,
  mergeGuards,
  recordNumber,
  recordString,
  route,
  type ApiErrorResult,
  type FacadeRoute,
} from './mcp-facade-runtime';
import type { FacadeV1Guard, FacadeV1Target, ManageAssetsFamily, ManageAssetsOperation } from './mcp-request-schemas';
import { cloneJson } from './shared-utils';

type FacadeApiRequest = (method: string, urlPath: string, body?: Record<string, unknown>) => Promise<unknown>;
type ExternalSurfaceValueReader = (
  filePath: string,
  surfacePath: string,
) => Promise<{ value: unknown; routes: FacadeRoute[]; raw: Record<string, unknown> } | ApiErrorResult>;

export interface FacadeAssetsEngineDeps {
  apiRequest: FacadeApiRequest;
  hashStableValue: (value: unknown) => string;
  readExternalSurfaceValue: ExternalSurfaceValueReader;
}

export function createFacadeAssetsEngine({
  apiRequest,
  hashStableValue,
  readExternalSurfaceValue,
}: FacadeAssetsEngineDeps) {
  type ManageAssetsResolvedFamily = Exclude<ManageAssetsFamily, 'auto'>;

  interface ManageAssetsSummary {
    index: number;
    path: string;
    name?: string;
    size: number;
    mimeType?: string;
  }

  interface ManageAssetsContext {
    family: ManageAssetsResolvedFamily;
    summaries: ManageAssetsSummary[];
    assets: unknown[];
    routes: FacadeRoute[];
    touchedTarget: string;
    cardAssets?: Record<string, unknown>[];
    xMeta?: Record<string, unknown>;
    moduleData?: Record<string, unknown>;
  }

  interface ManageAssetsPlan {
    result: Record<string, unknown>;
    routes: FacadeRoute[];
    touched: string[];
    requiredGuards: FacadeV1Guard[];
    operations?: Array<Record<string, unknown>>;
    activeApply?: {
      tool: string;
      method: 'POST';
      path: string;
      body: Record<string, unknown>;
    };
  }

  function assetBytesFromUnknown(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'number')) {
      return Buffer.from(value as number[]);
    }
    const record = asRecord(value);
    if (record?.type === 'Buffer' && Array.isArray(record.data)) return Buffer.from(record.data as number[]);
    return Buffer.alloc(0);
  }

  function assetBufferJsonFromBase64(base64: string): Record<string, unknown> {
    return { type: 'Buffer', data: [...Buffer.from(base64, 'base64')] };
  }

  function assetBufferJsonFromBuffer(buffer: Buffer): Record<string, unknown> {
    return { type: 'Buffer', data: [...buffer] };
  }

  function assetPathBasename(assetPath: string): string {
    return assetPath.split(/[\\/]/).filter(Boolean).pop() ?? assetPath;
  }

  function assetPathDirname(assetPath: string): string {
    const normalized = assetPath.replace(/\\/g, '/');
    const slashIndex = normalized.lastIndexOf('/');
    return slashIndex >= 0 ? normalized.slice(0, slashIndex + 1) : '';
  }

  function normalizeAssetPath(assetPath: string): string {
    return assetPath.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  function assetExtension(nameOrPath: string): string {
    const base = assetPathBasename(nameOrPath);
    const dotIndex = base.lastIndexOf('.');
    return dotIndex >= 0 ? base.slice(dotIndex + 1).toLowerCase() : '';
  }

  function assetMimeType(assetPath: string): string {
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

  function validateManageAssetFileName(name: string, action: string): ApiErrorResult | undefined {
    const error = validateAssetFileName(name);
    if (error) {
      return facadeApiError(
        400,
        error,
        'Use letters, numbers, Korean characters, spaces, dot, underscore, or hyphen.',
        {
          action,
          name,
        },
      );
    }
    return undefined;
  }

  function normalizeCharxAssetAdd(operation: Extract<ManageAssetsOperation, { action: 'add_asset' }>):
    | {
        fileName: string;
        folder: 'icon' | 'other';
        assetPath: string;
      }
    | ApiErrorResult {
    const rawPath = operation.path ?? '';
    if (
      rawPath &&
      (rawPath.includes('\\') ||
        rawPath.startsWith('/') ||
        /^[a-zA-Z]:/.test(rawPath) ||
        rawPath.split('/').some((part) => !part || part === '.' || part === '..' || validateAssetFileName(part)))
    ) {
      return facadeApiError(
        400,
        `Invalid charx asset path: ${rawPath}`,
        'Use a relative path under assets/ with valid folder and file names.',
        { path: rawPath },
        ['manage_assets'],
      );
    }
    const explicitPath = rawPath ? normalizeAssetPath(rawPath) : '';
    if (explicitPath && !explicitPath.startsWith('assets/')) {
      return facadeApiError(
        400,
        `Charx asset paths must stay under assets/: ${explicitPath}`,
        'Use a relative path beginning with assets/.',
        { path: explicitPath },
        ['manage_assets'],
      );
    }
    const fileName =
      operation.fileName ?? operation.name ?? (explicitPath ? assetPathBasename(explicitPath) : undefined);
    if (!fileName) {
      return facadeApiError(
        400,
        'add_asset requires fileName, name, or path for charx assets',
        'Provide operation.fileName or operation.path.',
        { operation },
      );
    }
    const invalidName = validateManageAssetFileName(fileName, operation.action);
    if (invalidName) return invalidName;
    if (explicitPath && assetPathBasename(explicitPath) !== fileName) {
      return facadeApiError(
        400,
        'charx asset path basename must match fileName',
        'Use the same final file name in operation.path and operation.fileName.',
        { path: explicitPath, fileName },
        ['manage_assets'],
      );
    }
    const inferredFolder: 'icon' | 'other' = explicitPath.startsWith('assets/icon/') ? 'icon' : 'other';
    const folder = operation.folder ?? inferredFolder;
    const defaultBase = folder === 'icon' ? 'assets/icon' : 'assets/other/image';
    const assetPath = explicitPath || `${defaultBase}/${fileName}`;
    if (assetPath.startsWith('assets/icon/') && folder !== 'icon') {
      return facadeApiError(
        400,
        'charx icon asset path requires folder="icon"',
        'Use folder="icon" for assets/icon/* paths.',
        { path: assetPath, folder },
      );
    }
    if (explicitPath && folder === 'icon' && !assetPath.startsWith('assets/icon/')) {
      return facadeApiError(
        400,
        'folder="icon" requires an assets/icon/* path',
        'Use an assets/icon/* path or set folder="other".',
        { path: assetPath, folder },
        ['manage_assets'],
      );
    }
    return { fileName, folder, assetPath };
  }

  function normalizeRisumAssetAdd(operation: Extract<ManageAssetsOperation, { action: 'add_asset' }>):
    | {
        name: string;
        path: string;
        ext: string;
      }
    | ApiErrorResult {
    const assetPath = operation.path ? normalizeAssetPath(operation.path) : '';
    const name = operation.name ?? operation.fileName ?? (assetPath ? assetPathBasename(assetPath) : undefined);
    if (!name) {
      return facadeApiError(
        400,
        'add_asset requires name, fileName, or path for risum assets',
        'Provide operation.name or operation.path.',
        { operation },
      );
    }
    const ext = assetExtension(assetPath || name) || 'png';
    return { name, path: assetPath, ext };
  }

  function manageAssetsCompressionOptions(operation: Extract<ManageAssetsOperation, { action: 'compress_assets' }>): {
    quality: number;
    recompressWebp: boolean;
  } {
    return {
      quality: operation.quality ?? 80,
      recompressWebp: operation.recompress_webp ?? operation.recompressWebp ?? false,
    };
  }

  function charxCompressionAssets(context: ManageAssetsContext): CharxAssetLike[] | ApiErrorResult {
    const assets: CharxAssetLike[] = [];
    for (const [index, entry] of context.assets.entries()) {
      const record = asRecord(entry);
      if (!record || typeof record.path !== 'string') {
        return facadeApiError(
          400,
          'charx asset entry is not an object with path',
          'Repair the asset list or use granular surface tools for precision debugging.',
          { index },
          ['manage_assets'],
        );
      }
      assets.push({ path: record.path, data: assetBytesFromUnknown(record.data) });
    }
    return assets;
  }

  function risumCompressionAssets(context: ManageAssetsContext): CharxAssetLike[] | ApiErrorResult {
    const moduleAssets = risumModuleAssets(context.moduleData);
    return context.assets.map((entry, index) => {
      const tuple = Array.isArray(moduleAssets[index]) ? (moduleAssets[index] as unknown[]) : [];
      const name = typeof tuple[0] === 'string' ? tuple[0] : `asset_${index}`;
      const ext = typeof tuple[2] === 'string' && tuple[2] ? tuple[2].replace(/^\./, '') : 'bin';
      return { path: `${name}.${ext}`, data: assetBytesFromUnknown(entry) };
    });
  }

  function summarizeCompressedCharxAssets(assets: CharxAssetLike[]): ManageAssetsSummary[] {
    return assets.map((asset, index) => ({
      index,
      path: asset.path,
      name: assetPathBasename(asset.path),
      size: asset.data.length,
      mimeType: assetMimeType(asset.path),
    }));
  }

  function manageAssetsCollectionDigest(summaries: ManageAssetsSummary[]): string {
    return hashStableValue(
      summaries.map((summary) => ({
        index: summary.index,
        path: summary.path,
        name: summary.name ?? '',
        size: summary.size,
      })),
    );
  }

  function assetCollectionDigestGuard(summaries: ManageAssetsSummary[]): FacadeV1Guard {
    return buildGuard(
      'expected_asset_collection_digest',
      manageAssetsCollectionDigest(summaries),
      '/guard_values/*',
      ['manage_assets'],
      '/result/asset_collection_digest',
    );
  }

  function assetExpectedPathGuard(summary: ManageAssetsSummary): FacadeV1Guard {
    return buildGuard(
      'expected_path',
      summary.path || summary.name || String(summary.index),
      '/guard_values/*',
      ['manage_assets'],
      '/result/assets/*/path',
    );
  }

  function manageAssetsExpectedHashGuard(beforeHash: string): FacadeV1Guard {
    return buildGuard('expected_hash', beforeHash, '/guard_values/*', ['manage_assets'], '/result/before_hash');
  }

  function checkManageAssetsGuardValue(
    guards: FacadeV1Guard[] | undefined,
    name: string,
    actual: unknown,
    suggestion: string,
  ): ApiErrorResult | undefined {
    const expected = guardValue(guards, name);
    if (expected === undefined) {
      return facadeApiError(400, `Missing guard value for ${name}`, suggestion, { guard: name }, ['manage_assets']);
    }
    if (expected !== actual) {
      return facadeApiError(409, `Stale guard mismatch for ${name}`, suggestion, { guard: name, expected, actual }, [
        'manage_assets',
        'read_content',
      ]);
    }
    return undefined;
  }

  async function resolveManageAssetsFamily(
    target: FacadeV1Target,
    requestedFamily: ManageAssetsFamily,
  ): Promise<ManageAssetsResolvedFamily | ApiErrorResult> {
    if (target.kind === 'external') {
      const ext = path.extname(target.file_path).toLowerCase();
      if (requestedFamily === 'auto') {
        if (ext === '.charx') return 'charx';
        if (ext === '.risum') return 'risum';
        return facadeApiError(
          400,
          'manage_assets supports external .charx or .risum files',
          'Use an unopened .charx file for charx assets or an unopened .risum file for risum module assets.',
          { file_path: target.file_path },
        );
      }
      if (requestedFamily === 'charx' && ext !== '.charx') {
        return facadeApiError(
          400,
          'asset_family="charx" requires an external .charx file',
          'Use asset_family="risum" for .risum files.',
          {
            file_path: target.file_path,
          },
        );
      }
      if (requestedFamily === 'risum' && ext !== '.risum') {
        return facadeApiError(
          400,
          'asset_family="risum" requires an external .risum file',
          'Use asset_family="charx" for .charx files.',
          {
            file_path: target.file_path,
          },
        );
      }
      return requestedFamily;
    }

    if (requestedFamily !== 'auto') return requestedFamily;
    const fields = await apiRequest('GET', '/fields');
    if (isApiError(fields)) return fields;
    const fileType = recordString(asRecord(fields), 'fileType');
    return fileType === 'risum' ? 'risum' : 'charx';
  }

  function charxAssetSummary(entry: unknown, index: number): ManageAssetsSummary | ApiErrorResult {
    const record = asRecord(entry);
    if (!record || typeof record.path !== 'string') {
      return facadeApiError(
        400,
        'charx asset entry is not an object with path',
        'Repair the asset list or use the granular surface tools for precision debugging.',
        { index },
      );
    }
    const bytes = assetBytesFromUnknown(record.data);
    return {
      index,
      path: record.path,
      name: assetPathBasename(record.path),
      size: bytes.length,
      mimeType: assetMimeType(record.path),
    };
  }

  function risumModuleAssets(moduleData: Record<string, unknown> | undefined): unknown[] {
    const moduleRecord = asRecord(moduleData?.module) ?? moduleData;
    return Array.isArray(moduleRecord?.assets) ? (moduleRecord.assets as unknown[]) : [];
  }

  function risumAssetSummary(asset: unknown, index: number, moduleData?: Record<string, unknown>): ManageAssetsSummary {
    const meta = risumModuleAssets(moduleData)[index];
    const tuple = Array.isArray(meta) ? meta : [];
    const name = typeof tuple[0] === 'string' ? tuple[0] : `asset_${index}`;
    const assetPath = typeof tuple[2] === 'string' ? tuple[2] : '';
    const bytes = assetBytesFromUnknown(asset);
    return {
      index,
      name,
      path: assetPath,
      size: bytes.length,
      mimeType: assetMimeType(assetPath || name),
    };
  }

  async function readOptionalExternalRecordArraySurface(
    filePath: string,
    surfacePath: string,
  ): Promise<{ entries: Record<string, unknown>[] | undefined; routes: FacadeRoute[] } | ApiErrorResult> {
    const read = await readExternalSurfaceValue(filePath, surfacePath);
    if (isApiError(read)) {
      const status = recordNumber(asRecord(read), 'status');
      if (status === 400 || status === 404) {
        return { entries: undefined, routes: [route('external_read_surface', 'POST', '/external/surface/read')] };
      }
      return read;
    }
    if (!Array.isArray(read.value)) {
      return facadeApiError(
        400,
        `External ${surfacePath} surface is not an array`,
        'Inspect the external file surface before using manage_assets.',
        { file_path: filePath, path: surfacePath },
        ['inspect_document'],
      );
    }
    const invalidIndex = read.value.findIndex((entry) => !asRecord(entry));
    if (invalidIndex >= 0) {
      return facadeApiError(
        400,
        `External ${surfacePath} entry is not an object`,
        'Repair the array or use an advanced raw surface patch.',
        { file_path: filePath, path: surfacePath, index: invalidIndex },
        ['read_content'],
      );
    }
    return { entries: read.value.map((entry) => asRecord(entry) ?? {}), routes: read.routes };
  }

  async function readOptionalExternalRecordSurface(
    filePath: string,
    surfacePath: string,
  ): Promise<{ value: Record<string, unknown> | undefined; routes: FacadeRoute[] } | ApiErrorResult> {
    const read = await readExternalSurfaceValue(filePath, surfacePath);
    if (isApiError(read)) {
      const status = recordNumber(asRecord(read), 'status');
      if (status === 400 || status === 404) {
        return { value: undefined, routes: [route('external_read_surface', 'POST', '/external/surface/read')] };
      }
      return read;
    }
    const record = asRecord(read.value);
    if (!record) {
      return facadeApiError(
        400,
        `External ${surfacePath} surface is not an object`,
        'Inspect the external file surface before using manage_assets.',
        { file_path: filePath, path: surfacePath },
        ['inspect_document'],
      );
    }
    return { value: record, routes: read.routes };
  }

  async function readManageAssetsContext(
    target: FacadeV1Target,
    requestedFamily: ManageAssetsFamily,
  ): Promise<ManageAssetsContext | ApiErrorResult> {
    const family = await resolveManageAssetsFamily(target, requestedFamily);
    if (isApiError(family)) return family;

    if (target.kind === 'active') {
      const routePath = family === 'charx' ? '/assets' : '/risum-assets';
      const data = await apiRequest('GET', routePath);
      if (isApiError(data)) return data;
      const assets = Array.isArray(asRecord(data)?.assets) ? (asRecord(data)?.assets as unknown[]) : [];
      const summaries = assets.map((entry, index) => {
        const record = asRecord(entry) ?? {};
        return {
          index: recordNumber(record, 'index') ?? index,
          path: recordString(record, 'path') ?? '',
          name:
            recordString(record, 'name') ??
            (recordString(record, 'path') ? assetPathBasename(recordString(record, 'path') ?? '') : undefined),
          size: recordNumber(record, 'size') ?? 0,
          mimeType: recordString(record, 'path') ? assetMimeType(recordString(record, 'path') ?? '') : undefined,
        };
      });
      let moduleData: Record<string, unknown> | undefined;
      let cardAssets: Record<string, unknown>[] | undefined;
      const routes = [route(family === 'charx' ? 'list_charx_assets' : 'list_risum_assets', 'GET', routePath)];
      if (family === 'risum') {
        const moduleRead = await apiRequest('POST', '/surface/read', { path: '/_moduleData' });
        if (!isApiError(moduleRead)) {
          moduleData = asRecord(asRecord(moduleRead)?.value);
          routes.push(route('read_surface', 'POST', '/surface/read'));
        }
        const cardAssetsRead = await apiRequest('POST', '/surface/read', { path: '/cardAssets' });
        if (!isApiError(cardAssetsRead) && Array.isArray(asRecord(cardAssetsRead)?.value)) {
          cardAssets = (asRecord(cardAssetsRead)?.value as unknown[])
            .map((entry) => asRecord(entry))
            .filter((entry): entry is Record<string, unknown> => !!entry);
          routes.push(route('read_surface', 'POST', '/surface/read'));
        }
      }
      return {
        family,
        summaries,
        assets,
        routes,
        touchedTarget: `active:${family}:assets`,
        ...(cardAssets ? { cardAssets } : {}),
        ...(moduleData ? { moduleData } : {}),
      };
    }

    if (target.kind === 'external') {
      if (family === 'charx') {
        const read = await readExternalSurfaceValue(target.file_path, '/assets');
        if (isApiError(read)) return read;
        if (!Array.isArray(read.value)) {
          return facadeApiError(
            400,
            'External charx assets surface is not an array',
            'Inspect the external .charx surface before using manage_assets.',
            { file_path: target.file_path, path: '/assets' },
            ['inspect_document', 'read_content'],
          );
        }
        const summaries: ManageAssetsSummary[] = [];
        for (const [index, entry] of read.value.entries()) {
          const summary = charxAssetSummary(entry, index);
          if (isApiError(summary)) return summary;
          summaries.push(summary);
        }
        const cardAssets = await readOptionalExternalRecordArraySurface(target.file_path, '/cardAssets');
        if (isApiError(cardAssets)) return cardAssets;
        const xMeta = await readOptionalExternalRecordSurface(target.file_path, '/xMeta');
        if (isApiError(xMeta)) return xMeta;
        return {
          family,
          summaries,
          assets: read.value,
          routes: [...read.routes, ...cardAssets.routes, ...xMeta.routes],
          touchedTarget: `external:${target.file_path}:charx-assets`,
          cardAssets: cardAssets.entries,
          xMeta: xMeta.value,
        };
      }

      const assetsRead = await readExternalSurfaceValue(target.file_path, '/risumAssets');
      if (isApiError(assetsRead)) return assetsRead;
      if (!Array.isArray(assetsRead.value)) {
        return facadeApiError(
          400,
          'External risumAssets surface is not an array',
          'Inspect the external .risum surface before using manage_assets.',
          { file_path: target.file_path, path: '/risumAssets' },
          ['inspect_document', 'read_content'],
        );
      }
      const moduleRead = await readExternalSurfaceValue(target.file_path, '/_moduleData');
      if (isApiError(moduleRead)) return moduleRead;
      const moduleData = asRecord(moduleRead.value) ?? {};
      const cardAssets = await readOptionalExternalRecordArraySurface(target.file_path, '/cardAssets');
      if (isApiError(cardAssets)) return cardAssets;
      return {
        family,
        summaries: assetsRead.value.map((asset, index) => risumAssetSummary(asset, index, moduleData)),
        assets: assetsRead.value,
        routes: [...assetsRead.routes, ...moduleRead.routes, ...cardAssets.routes],
        touchedTarget: `external:${target.file_path}:risum-assets`,
        moduleData,
        cardAssets: cardAssets.entries,
      };
    }

    return facadeApiError(
      400,
      'manage_assets supports only active or external targets',
      'Use target.kind="active" for the current file or target.kind="external" for an unopened file.',
      { target },
      ['inspect_document'],
    );
  }

  function resolveManageAssetsSelector(
    context: ManageAssetsContext,
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

  function cloneJsonValue<T>(value: T): T {
    return cloneJson(value);
  }

  function withRisumModuleAssets(
    moduleData: Record<string, unknown> | undefined,
    assets: unknown[],
  ): Record<string, unknown> {
    const next = cloneJsonValue(moduleData ?? {});
    const moduleRecord = asRecord(next.module) ?? next;
    moduleRecord.assets = assets;
    return next;
  }

  function risumAssetRenameParts(
    current: ManageAssetsSummary,
    newName: string,
  ): { name: string; ext: string; displayName: string } {
    const extFromName = assetExtension(newName);
    const ext = extFromName || current.path || assetExtension(current.name ?? '') || 'png';
    const name =
      extFromName && newName.toLowerCase().endsWith(`.${extFromName.toLowerCase()}`)
        ? newName.slice(0, -(extFromName.length + 1))
        : newName;
    return {
      name,
      ext,
      displayName: ext ? `${name}.${ext}` : name,
    };
  }

  function renamedRisumModuleData(
    moduleData: Record<string, unknown> | undefined,
    summary: ManageAssetsSummary,
    newName: string,
  ): { moduleData: Record<string, unknown>; summary: ManageAssetsSummary } | ApiErrorResult {
    const moduleAssets = risumModuleAssets(moduleData);
    if (summary.index >= moduleAssets.length) {
      return facadeApiError(
        400,
        'Risum asset metadata is missing for rename',
        'Use manage_assets list_assets to refresh metadata, or delete/add the asset if the module asset table is incomplete.',
        { index: summary.index },
        ['manage_assets'],
      );
    }
    const parts = risumAssetRenameParts(summary, newName);
    const nextAssets = cloneJsonValue(moduleAssets);
    const currentTuple = Array.isArray(nextAssets[summary.index])
      ? ([...(nextAssets[summary.index] as unknown[])] as unknown[])
      : [summary.name ?? `asset_${summary.index}`, '', summary.path || parts.ext];
    currentTuple[0] = parts.name;
    currentTuple[2] = parts.ext;
    nextAssets[summary.index] = currentTuple;
    return {
      moduleData: withRisumModuleAssets(moduleData, nextAssets),
      summary: {
        ...summary,
        name: parts.name,
        path: parts.ext,
        mimeType: assetMimeType(parts.displayName),
      },
    };
  }

  async function buildManageAssetsPlan(
    target: FacadeV1Target,
    requestedFamily: ManageAssetsFamily,
    operation: ManageAssetsOperation,
    providedContext?: ManageAssetsContext,
  ): Promise<ManageAssetsPlan | ApiErrorResult> {
    const context = providedContext ?? (await readManageAssetsContext(target, requestedFamily));
    if (isApiError(context)) return context;
    const collectionGuard = assetCollectionDigestGuard(context.summaries);
    const beforeCount = context.summaries.length;
    const requiredGuards: FacadeV1Guard[] = [collectionGuard];
    const routes = [...context.routes];
    const touched = [context.touchedTarget];

    if (operation.action === 'compress_assets') {
      if (beforeCount === 0) {
        return facadeApiError(
          400,
          'No assets found in file.',
          `Add at least one ${context.family} asset before compressing assets.`,
          { family: context.family },
          ['manage_assets'],
        );
      }
      const options = manageAssetsCompressionOptions(operation);
      if (target.kind === 'active') {
        const dryRun = await apiRequest('POST', '/assets/compress-webp', {
          asset_family: context.family,
          quality: options.quality,
          recompressWebp: options.recompressWebp,
          dry_run: true,
        });
        if (isApiError(dryRun)) return dryRun;
        return {
          result: {
            dry_run: true,
            action: operation.action,
            family: context.family,
            before_count: beforeCount,
            after_count: beforeCount,
            quality: options.quality,
            recompressWebp: options.recompressWebp,
            compression_preview: asRecord(dryRun) ?? dryRun,
            asset_collection_digest: collectionGuard.value,
          },
          routes: [...routes, route('compress_assets_webp', 'POST', '/assets/compress-webp')],
          touched,
          requiredGuards,
          activeApply: {
            tool: 'compress_assets_webp',
            method: 'POST',
            path: '/assets/compress-webp',
            body: {
              asset_family: context.family,
              quality: options.quality,
              recompressWebp: options.recompressWebp,
            },
          },
        };
      }

      const assets = context.family === 'charx' ? charxCompressionAssets(context) : risumCompressionAssets(context);
      if (isApiError(assets)) return assets;
      let compressed: Awaited<ReturnType<typeof compressAssetsToWebP>>;
      try {
        compressed = await compressAssetsToWebP(assets, options);
      } catch (error) {
        return facadeApiError(
          500,
          `Compression failed: ${error instanceof Error ? error.message : String(error)}`,
          'Ensure the image compression dependency is installed, then retry manage_assets preview.',
          { family: context.family },
          ['manage_assets'],
        );
      }
      const pathMap = new Map<string, string>();
      for (const detail of compressed.details) {
        if (detail.status === 'converted' && detail.originalPath !== detail.newPath) {
          pathMap.set(detail.originalPath, detail.newPath);
        }
      }
      const operations: Array<Record<string, unknown>> = [];
      if (context.family === 'charx') {
        operations.push({
          op: 'replace',
          path: '/assets',
          value: compressed.assets.map((asset) => ({
            path: asset.path,
            data: assetBufferJsonFromBuffer(asset.data),
          })),
        });
      } else {
        operations.push({
          op: 'replace',
          path: '/risumAssets',
          value: compressed.assets.map((asset) => assetBufferJsonFromBuffer(asset.data)),
        });
        const nextModuleAssets = cloneJsonValue(risumModuleAssets(context.moduleData));
        for (const [index, detail] of compressed.details.entries()) {
          if (detail.status !== 'converted') continue;
          const tuple = Array.isArray(nextModuleAssets[index]) ? [...(nextModuleAssets[index] as unknown[])] : [];
          tuple[2] = 'webp';
          nextModuleAssets[index] = tuple;
        }
        operations.push({
          op: 'replace',
          path: '/_moduleData',
          value: withRisumModuleAssets(context.moduleData, nextModuleAssets),
        });
        if (context.cardAssets) {
          const nextCardAssets = cloneJsonValue(context.cardAssets);
          const originalModuleAssets = risumModuleAssets(context.moduleData);
          for (const [index, detail] of compressed.details.entries()) {
            if (detail.status !== 'converted') continue;
            const tuple = Array.isArray(originalModuleAssets[index]) ? (originalModuleAssets[index] as unknown[]) : [];
            const name = typeof tuple[0] === 'string' ? tuple[0] : `asset_${index}`;
            for (const cardAsset of nextCardAssets) {
              if (cardAsset.name !== name) continue;
              cardAsset.ext = 'webp';
              if (typeof cardAsset.uri === 'string') cardAsset.uri = cardAsset.uri.replace(/\.[^.]+$/, '.webp');
            }
          }
          operations.push({ op: 'replace', path: '/cardAssets', value: nextCardAssets });
        }
      }
      let referencesUpdated = { cardAssetsUpdated: 0, xMetaUpdated: 0 };
      if (context.family === 'charx' && (context.cardAssets || context.xMeta)) {
        const nextCardAssets = cloneJsonValue(context.cardAssets ?? []);
        const nextXMeta = cloneJsonValue(context.xMeta ?? {});
        if (pathMap.size > 0) {
          referencesUpdated = updateAssetReferences(pathMap, nextCardAssets, nextXMeta);
        }
        if (context.cardAssets) {
          operations.push({ op: 'replace', path: '/cardAssets', value: nextCardAssets });
        }
        if (context.xMeta) {
          operations.push({ op: 'replace', path: '/xMeta', value: nextXMeta });
        }
      }
      return {
        result: {
          dry_run: true,
          action: operation.action,
          family: context.family,
          before_count: beforeCount,
          after_count: compressed.assets.length,
          quality: options.quality,
          recompressWebp: options.recompressWebp,
          stats: compressed.stats,
          referencesUpdated,
          details: compressed.details,
          assets:
            context.family === 'charx'
              ? summarizeCompressedCharxAssets(compressed.assets)
              : compressed.assets.map((asset, index) =>
                  risumAssetSummary(
                    asset.data,
                    index,
                    withRisumModuleAssets(
                      context.moduleData,
                      compressed.details.map((detail, detailIndex) => {
                        const tuple = cloneJsonValue(risumModuleAssets(context.moduleData)[detailIndex] ?? []);
                        if (detail.status === 'converted' && Array.isArray(tuple)) tuple[2] = 'webp';
                        return tuple;
                      }),
                    ),
                  ),
                ),
          asset_collection_digest: collectionGuard.value,
        },
        routes: [...routes, route('external_patch_surface', 'POST', '/external/surface/patch')],
        touched,
        requiredGuards,
        operations,
      };
    }

    if (operation.action === 'add_asset') {
      if (context.family === 'charx') {
        const normalized = normalizeCharxAssetAdd(operation);
        if (isApiError(normalized)) return normalized;
        if (context.summaries.some((summary) => summary.path === normalized.assetPath)) {
          return facadeApiError(
            409,
            `Asset path already exists: ${normalized.assetPath}`,
            'Use a different fileName/path or delete/rename the existing asset first.',
            { path: normalized.assetPath },
            ['manage_assets'],
          );
        }
        const size = Buffer.from(operation.base64, 'base64').length;
        const summary: ManageAssetsSummary = {
          index: beforeCount,
          path: normalized.assetPath,
          name: normalized.fileName,
          size,
          mimeType: assetMimeType(normalized.assetPath),
        };
        if (target.kind === 'active') {
          return {
            result: {
              dry_run: true,
              action: operation.action,
              family: context.family,
              before_count: beforeCount,
              after_count: beforeCount + 1,
              assets: [summary],
              asset_collection_digest: collectionGuard.value,
            },
            routes: [...routes, route('add_charx_asset', 'POST', '/asset/add')],
            touched,
            requiredGuards,
            activeApply: {
              tool: 'add_charx_asset',
              method: 'POST',
              path: '/asset/add',
              body: { fileName: normalized.fileName, base64: operation.base64, folder: normalized.folder },
            },
          };
        }
        const newAssets = [
          ...(context.assets as Record<string, unknown>[]),
          { path: normalized.assetPath, data: assetBufferJsonFromBase64(operation.base64) },
        ];
        const references = {
          assets: newAssets,
          cardAssets: cloneJsonValue(context.cardAssets ?? []),
          xMeta: cloneJsonValue(context.xMeta ?? {}),
        };
        addAssetReferences(references, normalized.assetPath, normalized.folder);
        const operations: Array<Record<string, unknown>> = [
          { op: 'replace', path: '/assets', value: newAssets },
          {
            op: context.cardAssets ? 'replace' : 'add',
            path: '/cardAssets',
            value: references.cardAssets,
          },
          {
            op: context.xMeta ? 'replace' : 'add',
            path: '/xMeta',
            value: references.xMeta,
          },
        ];
        return {
          result: {
            dry_run: true,
            action: operation.action,
            family: context.family,
            before_count: beforeCount,
            after_count: beforeCount + 1,
            assets: [summary],
            asset_collection_digest: collectionGuard.value,
          },
          routes: [...routes, route('external_patch_surface', 'POST', '/external/surface/patch')],
          touched,
          requiredGuards,
          operations,
        };
      }

      const normalized = normalizeRisumAssetAdd(operation);
      if (isApiError(normalized)) return normalized;
      const size = Buffer.from(operation.base64, 'base64').length;
      const summary: ManageAssetsSummary = {
        index: beforeCount,
        name: normalized.name,
        path: normalized.ext,
        size,
        mimeType: assetMimeType(normalized.path || normalized.name),
      };
      if (target.kind === 'active') {
        return {
          result: {
            dry_run: true,
            action: operation.action,
            family: context.family,
            before_count: beforeCount,
            after_count: beforeCount + 1,
            assets: [summary],
            asset_collection_digest: collectionGuard.value,
          },
          routes: [...routes, route('add_risum_asset', 'POST', '/risum-asset/add')],
          touched,
          requiredGuards,
          activeApply: {
            tool: 'add_risum_asset',
            method: 'POST',
            path: '/risum-asset/add',
            body: { name: normalized.name, path: normalized.path, base64: operation.base64 },
          },
        };
      }
      const moduleAssets = risumModuleAssets(context.moduleData);
      const newModuleData = withRisumModuleAssets(context.moduleData, [
        ...moduleAssets,
        [normalized.name, '', normalized.ext],
      ]);
      return {
        result: {
          dry_run: true,
          action: operation.action,
          family: context.family,
          before_count: beforeCount,
          after_count: beforeCount + 1,
          assets: [summary],
          asset_collection_digest: collectionGuard.value,
        },
        routes: [...routes, route('external_patch_surface', 'POST', '/external/surface/patch')],
        touched,
        requiredGuards,
        operations: [
          {
            op: 'replace',
            path: '/risumAssets',
            value: [...context.assets, assetBufferJsonFromBase64(operation.base64)],
          },
          { op: 'replace', path: '/_moduleData', value: newModuleData },
        ],
      };
    }

    if (operation.action === 'delete_asset') {
      const summary = resolveManageAssetsSelector(context, operation.selector, operation.action);
      if (isApiError(summary)) return summary;
      const pathGuard = assetExpectedPathGuard(summary);
      requiredGuards.push(pathGuard);
      if (target.kind === 'active') {
        const routePath =
          context.family === 'charx' ? `/asset/${summary.index}/delete` : `/risum-asset/${summary.index}/delete`;
        return {
          result: {
            dry_run: true,
            action: operation.action,
            family: context.family,
            before_count: beforeCount,
            after_count: beforeCount - 1,
            assets: [summary],
            asset_collection_digest: collectionGuard.value,
          },
          routes: [
            ...routes,
            route(context.family === 'charx' ? 'delete_charx_asset' : 'delete_risum_asset', 'POST', routePath),
          ],
          touched,
          requiredGuards,
          activeApply: {
            tool: context.family === 'charx' ? 'delete_charx_asset' : 'delete_risum_asset',
            method: 'POST',
            path: routePath,
            body: { expected_path: summary.path || summary.name || String(summary.index) },
          },
        };
      }
      if (context.family === 'charx') {
        const newAssets = (context.assets as Record<string, unknown>[]).filter((_, index) => index !== summary.index);
        const references = {
          assets: newAssets,
          cardAssets: cloneJsonValue(context.cardAssets ?? []),
          xMeta: cloneJsonValue(context.xMeta ?? {}),
        };
        deleteAssetReferences(references, summary.path);
        const operations: Array<Record<string, unknown>> = [
          { op: 'replace', path: '/assets', value: newAssets },
          {
            op: context.cardAssets ? 'replace' : 'add',
            path: '/cardAssets',
            value: references.cardAssets,
          },
          {
            op: context.xMeta ? 'replace' : 'add',
            path: '/xMeta',
            value: references.xMeta,
          },
        ];
        return {
          result: {
            dry_run: true,
            action: operation.action,
            family: context.family,
            before_count: beforeCount,
            after_count: beforeCount - 1,
            assets: [summary],
            asset_collection_digest: collectionGuard.value,
          },
          routes: [...routes, route('external_patch_surface', 'POST', '/external/surface/patch')],
          touched,
          requiredGuards,
          operations,
        };
      }
      const moduleAssets = risumModuleAssets(context.moduleData);
      const newModuleAssets = moduleAssets.filter((_, index) => index !== summary.index);
      return {
        result: {
          dry_run: true,
          action: operation.action,
          family: context.family,
          before_count: beforeCount,
          after_count: beforeCount - 1,
          assets: [summary],
          asset_collection_digest: collectionGuard.value,
        },
        routes: [...routes, route('external_patch_surface', 'POST', '/external/surface/patch')],
        touched,
        requiredGuards,
        operations: [
          { op: 'replace', path: '/risumAssets', value: context.assets.filter((_, index) => index !== summary.index) },
          { op: 'replace', path: '/_moduleData', value: withRisumModuleAssets(context.moduleData, newModuleAssets) },
        ],
      };
    }

    if (operation.action === 'rename_asset') {
      const invalidName = validateManageAssetFileName(operation.newName, operation.action);
      if (invalidName) return invalidName;
      const summary = resolveManageAssetsSelector(context, operation.selector, operation.action);
      if (isApiError(summary)) return summary;
      const pathGuard = assetExpectedPathGuard(summary);
      requiredGuards.push(pathGuard);

      if (context.family === 'risum') {
        const renamed = renamedRisumModuleData(context.moduleData, summary, operation.newName);
        if (isApiError(renamed)) return renamed;
        if (
          context.summaries.some(
            (entry) =>
              entry.index !== summary.index &&
              entry.name === renamed.summary.name &&
              entry.path === renamed.summary.path,
          )
        ) {
          return facadeApiError(
            409,
            `Risum asset metadata already exists: ${renamed.summary.name}.${renamed.summary.path}`,
            'Use a unique newName or refresh asset summaries first.',
            { name: renamed.summary.name, path: renamed.summary.path },
            ['manage_assets'],
          );
        }
        const operations: Array<Record<string, unknown>> = [
          { op: 'replace', path: '/_moduleData', value: renamed.moduleData },
        ];
        if (context.cardAssets) {
          const parts = risumAssetRenameParts(summary, operation.newName);
          operations.push({
            op: 'replace',
            path: '/cardAssets',
            value: context.cardAssets.map((entry) => {
              if (recordString(entry, 'name') !== summary.name) return entry;
              return {
                ...entry,
                uri: `embeded://${parts.displayName}`,
                name: parts.name,
                ext: parts.ext,
              };
            }),
          });
        }
        return {
          result: {
            dry_run: true,
            action: operation.action,
            family: context.family,
            before_count: beforeCount,
            after_count: beforeCount,
            assets: [summary],
            renamed_assets: [renamed.summary],
            asset_collection_digest: collectionGuard.value,
          },
          routes: [
            ...routes,
            route(
              target.kind === 'external' ? 'external_patch_surface' : 'patch_surface',
              'POST',
              target.kind === 'external' ? '/external/surface/patch' : '/surface/patch',
            ),
          ],
          touched,
          requiredGuards,
          operations,
        };
      }

      const newPath = `${assetPathDirname(summary.path)}${operation.newName}`;
      if (context.summaries.some((entry) => entry.index !== summary.index && entry.path === newPath)) {
        return facadeApiError(
          409,
          `Asset path already exists: ${newPath}`,
          'Use a unique newName or refresh asset summaries first.',
          { path: newPath },
          ['manage_assets'],
        );
      }
      const renamedSummary: ManageAssetsSummary = {
        ...summary,
        path: newPath,
        name: operation.newName,
        mimeType: assetMimeType(newPath),
      };
      if (target.kind === 'active') {
        const routePath = `/asset/${summary.index}/rename`;
        return {
          result: {
            dry_run: true,
            action: operation.action,
            family: context.family,
            before_count: beforeCount,
            after_count: beforeCount,
            assets: [summary],
            renamed_assets: [renamedSummary],
            asset_collection_digest: collectionGuard.value,
          },
          routes: [...routes, route('rename_charx_asset', 'POST', routePath)],
          touched,
          requiredGuards,
          activeApply: {
            tool: 'rename_charx_asset',
            method: 'POST',
            path: routePath,
            body: { newName: operation.newName, expected_path: summary.path },
          },
        };
      }
      const newAssets = (context.assets as Record<string, unknown>[]).map((entry, index) =>
        index === summary.index ? { ...entry, path: newPath } : entry,
      );
      const references = {
        assets: newAssets,
        cardAssets: cloneJsonValue(context.cardAssets ?? []),
        xMeta: cloneJsonValue(context.xMeta ?? {}),
      };
      renameAssetReferences(references, summary.path, newPath);
      const operations: Array<Record<string, unknown>> = [
        { op: 'replace', path: '/assets', value: newAssets },
        {
          op: context.cardAssets ? 'replace' : 'add',
          path: '/cardAssets',
          value: references.cardAssets,
        },
        {
          op: context.xMeta ? 'replace' : 'add',
          path: '/xMeta',
          value: references.xMeta,
        },
      ];
      return {
        result: {
          dry_run: true,
          action: operation.action,
          family: context.family,
          before_count: beforeCount,
          after_count: beforeCount,
          assets: [summary],
          renamed_assets: [renamedSummary],
          asset_collection_digest: collectionGuard.value,
        },
        routes: [...routes, route('external_patch_surface', 'POST', '/external/surface/patch')],
        touched,
        requiredGuards,
        operations,
      };
    }

    return facadeApiError(
      400,
      `Unsupported manage_assets action: ${operation.action}`,
      'Use list_assets/read_asset in read mode or add_asset/delete_asset/rename_asset/compress_assets in preview mode.',
      { operation },
    );
  }

  async function previewManageAssetsOperation(
    target: FacadeV1Target,
    requestedFamily: ManageAssetsFamily,
    operation: ManageAssetsOperation,
  ): Promise<
    | {
        result: Record<string, unknown>;
        routes: FacadeRoute[];
        touched: string[];
        requiredGuards: FacadeV1Guard[];
      }
    | ApiErrorResult
  > {
    const plan = await buildManageAssetsPlan(target, requestedFamily, operation);
    if (isApiError(plan)) return plan;
    if (target.kind === 'active' && plan.operations) {
      const routePath = '/surface/patch';
      const dryRun = await apiRequest('POST', routePath, {
        operations: plan.operations,
        dry_run: true,
      });
      if (isApiError(dryRun)) return dryRun;
      const beforeHash = recordString(asRecord(dryRun), 'before_hash');
      return {
        result: { ...plan.result, ...(asRecord(dryRun) ?? {}) },
        routes: plan.routes,
        touched: plan.touched,
        requiredGuards: mergeGuards(plan.requiredGuards, [
          beforeHash ? manageAssetsExpectedHashGuard(beforeHash) : undefined,
        ]),
      };
    }
    if (target.kind === 'external' && plan.operations) {
      const routePath = '/external/surface/patch';
      const dryRun = await apiRequest('POST', routePath, {
        file_path: target.file_path,
        operations: plan.operations,
        dry_run: true,
      });
      if (isApiError(dryRun)) return dryRun;
      const beforeHash = recordString(asRecord(dryRun), 'before_hash');
      return {
        result: { ...plan.result, ...(asRecord(dryRun) ?? {}) },
        routes: plan.routes,
        touched: plan.touched,
        requiredGuards: mergeGuards(plan.requiredGuards, [
          beforeHash ? manageAssetsExpectedHashGuard(beforeHash) : undefined,
        ]),
      };
    }
    return {
      result: plan.result,
      routes: plan.routes,
      touched: plan.touched,
      requiredGuards: plan.requiredGuards,
    };
  }

  async function readManageAssetsOperation(
    target: FacadeV1Target,
    requestedFamily: ManageAssetsFamily,
    operation: ManageAssetsOperation,
  ): Promise<{ result: Record<string, unknown>; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    const context = await readManageAssetsContext(target, requestedFamily);
    if (isApiError(context)) return context;
    const collectionGuard = assetCollectionDigestGuard(context.summaries);

    if (operation.action === 'list_assets') {
      return {
        result: {
          action: operation.action,
          family: context.family,
          count: context.summaries.length,
          assets: context.summaries,
          asset_collection_digest: collectionGuard.value,
        },
        routes: context.routes,
        touched: [context.touchedTarget],
      };
    }

    if (operation.action === 'read_asset') {
      const summary = resolveManageAssetsSelector(context, operation.selector, operation.action);
      if (isApiError(summary)) return summary;
      if (target.kind === 'active') {
        const routePath = context.family === 'charx' ? `/asset/${summary.index}` : `/risum-asset/${summary.index}`;
        const data = await apiRequest('GET', routePath);
        if (isApiError(data)) return data;
        return {
          result: {
            action: operation.action,
            family: context.family,
            asset: data,
            asset_collection_digest: collectionGuard.value,
          },
          routes: [
            ...context.routes,
            route(context.family === 'charx' ? 'read_charx_asset' : 'read_risum_asset', 'GET', routePath),
          ],
          touched: [context.touchedTarget, `${context.touchedTarget}:${summary.index}`],
        };
      }
      const rawAsset = context.assets[summary.index];
      const dataSource = context.family === 'charx' ? asRecord(rawAsset)?.data : rawAsset;
      const bytes = assetBytesFromUnknown(dataSource);
      return {
        result: {
          action: operation.action,
          family: context.family,
          asset: {
            ...summary,
            base64: bytes.toString('base64'),
          },
          asset_collection_digest: collectionGuard.value,
        },
        routes: context.routes,
        touched: [context.touchedTarget, `${context.touchedTarget}:${summary.index}`],
      };
    }

    return facadeApiError(
      400,
      `Unsupported manage_assets read action: ${operation.action}`,
      'Read mode supports list_assets and read_asset.',
      { operation },
    );
  }

  async function applyManageAssetsOperation(
    target: FacadeV1Target,
    requestedFamily: ManageAssetsFamily,
    operation: ManageAssetsOperation,
    guardValues: FacadeV1Guard[] | undefined,
  ): Promise<{ result: Record<string, unknown>; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    const context = await readManageAssetsContext(target, requestedFamily);
    if (isApiError(context)) return context;
    const digestConflict = checkManageAssetsGuardValue(
      guardValues,
      'expected_asset_collection_digest',
      manageAssetsCollectionDigest(context.summaries),
      'Refresh asset summaries, then run manage_assets preview again.',
    );
    if (digestConflict) return digestConflict;
    const plan = await buildManageAssetsPlan(target, requestedFamily, operation, context);
    if (isApiError(plan)) return plan;

    if (operation.action === 'delete_asset' || operation.action === 'rename_asset') {
      const summary = resolveManageAssetsSelector(context, operation.selector, operation.action);
      if (isApiError(summary)) return summary;
      const pathConflict = checkManageAssetsGuardValue(
        guardValues,
        'expected_path',
        summary.path || summary.name || String(summary.index),
        'Refresh asset summaries, then run manage_assets preview again.',
      );
      if (pathConflict) return pathConflict;
    }

    if (target.kind === 'active') {
      if (plan.activeApply) {
        const data = await apiRequest(plan.activeApply.method, plan.activeApply.path, plan.activeApply.body);
        return isApiError(data)
          ? data
          : {
              result: { ...plan.result, ...(asRecord(data) ?? {}), dry_run: undefined },
              routes: plan.routes,
              touched: plan.touched,
            };
      }
      if (plan.operations) {
        const routePath = '/surface/patch';
        const data = await apiRequest('POST', routePath, {
          operations: plan.operations,
          expected_hash: guardValue(guardValues, 'expected_hash'),
        });
        return isApiError(data)
          ? data
          : {
              result: { ...plan.result, ...(asRecord(data) ?? {}), dry_run: undefined },
              routes: plan.routes,
              touched: plan.touched,
            };
      }
      return facadeApiError(
        400,
        `Unsupported active manage_assets apply action: ${operation.action}`,
        'Run manage_assets preview again and apply the returned token.',
        { operation },
      );
    }

    if (!plan.operations) {
      return facadeApiError(
        400,
        `Unsupported external manage_assets apply action: ${operation.action}`,
        'Run manage_assets preview again and apply the returned token.',
        { operation },
      );
    }
    if (target.kind !== 'external') {
      return facadeApiError(
        400,
        'manage_assets apply target must be active or external',
        'Use the exact target returned by manage_assets preview.',
        { target },
      );
    }
    const routePath = '/external/surface/patch';
    const data = await apiRequest('POST', routePath, {
      file_path: target.file_path,
      operations: plan.operations,
      expected_hash: guardValue(guardValues, 'expected_hash'),
    });
    return isApiError(data)
      ? data
      : {
          result: { ...plan.result, ...(asRecord(data) ?? {}), dry_run: undefined },
          routes: plan.routes,
          touched: plan.touched,
        };
  }

  return {
    previewManageAssetsOperation,
    readManageAssetsOperation,
    applyManageAssetsOperation,
  };
}

export type FacadeAssetsEngine = ReturnType<typeof createFacadeAssetsEngine>;
