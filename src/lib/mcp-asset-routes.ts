import type * as http from 'http';
import type { ZodType } from 'zod';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';
import type { McpApiDeps } from './mcp-api-server';
import {
  assetAddBodySchema,
  assetCompressWebpBodySchema,
  assetDeleteBodySchema,
  assetRenameBodySchema,
  risumAssetAddBodySchema,
  risumAssetDeleteBodySchema,
} from './mcp-request-schemas';
import { addAssetReferences, deleteAssetReferences, renameAssetReferences, validateAssetFileName } from './asset-utils';

type JsonBody = Record<string, unknown>;

interface AssetLike {
  path: string;
  data?: Buffer;
}

interface AssetRouteDeps {
  askRendererConfirm: McpApiDeps['askRendererConfirm'];
  broadcastToAll: McpApiDeps['broadcastToAll'];
  invalidateAssetsMapCache?: McpApiDeps['invalidateAssetsMapCache'];
  readJsonBody: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    action: string,
    broadcastStatus: (payload: Record<string, unknown>) => void,
  ) => Promise<JsonBody | null>;
  parseBody: <T>(
    res: http.ServerResponse,
    body: JsonBody,
    schema: ZodType<T>,
    meta: { action: string; target: string; suggestion?: string },
  ) => T | null;
  broadcastStatus: (payload: Record<string, unknown>) => void;
  jsonResSuccess: (res: http.ServerResponse, payload: Record<string, unknown>, opts: McpSuccessOptions) => void;
  mcpError: (res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown) => void;
  ensureAssetExpectedPath: (
    res: http.ServerResponse,
    index: number,
    actualPath: string,
    expectedPath: unknown,
    action: string,
    target: string,
    suggestion: string,
    onError: (res: http.ServerResponse, status: number, info: McpErrorInfo) => void,
  ) => boolean;
  extToMime: (ext: string) => string;
  logMcpMutation: (action: string, target: string, details: Record<string, unknown>) => void;
}

function getRisumModuleAssets(currentData: Record<string, unknown>): unknown[] {
  return (
    (((currentData._moduleData as Record<string, unknown>)?.module as Record<string, unknown>)?.assets as unknown[]) ||
    ((currentData._moduleData as Record<string, unknown>)?.assets as unknown[]) ||
    []
  );
}

export async function handleAssetRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  currentData: Record<string, unknown>,
  deps: AssetRouteDeps,
): Promise<boolean> {
  if (parts[0] === 'assets' && !parts[1] && req.method === 'GET') {
    const assets = (currentData.assets || []) as AssetLike[];
    deps.jsonResSuccess(
      res,
      {
        count: assets.length,
        assets: assets.map((a, i) => ({
          index: i,
          path: a.path,
          size: a.data ? a.data.length : 0,
        })),
      },
      {
        toolName: 'list_charx_assets',
        summary: `Listed ${assets.length} charx asset(s)`,
        artifacts: { count: assets.length },
      },
    );
    return true;
  }

  if (parts[0] === 'asset' && parts[1] && !parts[2] && req.method === 'GET') {
    const assets = (currentData.assets || []) as AssetLike[];
    const idx = parseInt(parts[1], 10);
    if (isNaN(idx) || idx < 0 || idx >= assets.length) {
      deps.mcpError(res, 400, {
        action: 'read_asset',
        message: `에셋 index ${idx}이(가) 범위를 벗어났습니다 (0–${assets.length - 1}).`,
        suggestion: 'list_assets 또는 GET /assets 로 유효한 index를 다시 확인하세요.',
        target: `asset:${idx}`,
      });
      return true;
    }
    const asset = assets[idx];
    const ext = (asset.path.split('.').pop() || 'png').toLowerCase();
    const mime = deps.extToMime(ext);
    deps.jsonResSuccess(
      res,
      {
        index: idx,
        path: asset.path,
        size: asset.data ? asset.data.length : 0,
        mimeType: mime,
        base64: asset.data ? asset.data.toString('base64') : '',
      },
      {
        toolName: 'read_charx_asset',
        summary: `Read charx asset ${idx} (${asset.path}, ${asset.data ? asset.data.length : 0} bytes)`,
        artifacts: { index: idx, path: asset.path, size: asset.data ? asset.data.length : 0 },
      },
    );
    return true;
  }

  if (parts[0] === 'asset' && parts[1] === 'add' && req.method === 'POST') {
    const rawBody = await deps.readJsonBody(req, res, 'asset/add', deps.broadcastStatus);
    if (!rawBody) return true;
    const body = deps.parseBody(res, rawBody, assetAddBodySchema, {
      action: 'add_asset',
      target: 'asset:add',
    });
    if (!body) return true;
    const fileName = body.fileName;
    const base64Data = body.base64;
    const folder = body.folder || 'other';
    const fileNameError = validateAssetFileName(fileName);
    if (fileNameError) {
      deps.mcpError(res, 400, {
        action: 'add_asset',
        message: fileNameError,
        target: 'asset:add',
      });
      return true;
    }
    const allowed = await deps.askRendererConfirm(
      'MCP 에셋 추가 요청',
      `AI 어시스턴트가 에셋 "${fileName}" (폴더: ${folder})을(를) 추가하려 합니다. 허용하시겠습니까?`,
    );
    if (!allowed) {
      deps.mcpError(res, 403, {
        action: 'add_asset',
        message: '사용자가 에셋 추가를 거부했습니다.',
        rejected: true,
        suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
        target: fileName,
      });
      return true;
    }
    const basePath = folder === 'icon' ? 'assets/icon' : 'assets/other/image';
    const assetPath = `${basePath}/${fileName}`;
    const currentAssets = currentData.assets as AssetLike[];
    if (currentAssets.find((a) => a.path === assetPath)) {
      deps.mcpError(res, 409, {
        action: 'add_asset',
        message: `에셋 경로 "${assetPath}"가 이미 존재합니다.`,
        suggestion: '다른 파일명이나 폴더를 사용하세요.',
        target: `asset:${assetPath}`,
      });
      return true;
    }
    const buf = Buffer.from(base64Data, 'base64');
    currentAssets.push({ path: assetPath, data: buf });
    addAssetReferences(currentData, assetPath, folder === 'icon' ? 'icon' : 'other');
    deps.broadcastToAll('data-updated', { field: 'assets' });
    deps.jsonResSuccess(
      res,
      { ok: true, path: assetPath, size: buf.length },
      {
        toolName: 'add_charx_asset',
        summary: `Added charx asset "${assetPath}" (${buf.length} bytes)`,
        artifacts: { path: assetPath, size: buf.length },
      },
    );
    return true;
  }

  if (parts[0] === 'asset' && parts[1] && parts[2] === 'delete' && req.method === 'POST') {
    const assets = (currentData.assets || []) as AssetLike[];
    const idx = parseInt(parts[1], 10);
    if (isNaN(idx) || idx < 0 || idx >= assets.length) {
      deps.mcpError(res, 400, {
        action: 'delete_asset',
        message: `에셋 index ${idx}이(가) 범위를 벗어났습니다 (0–${assets.length - 1}).`,
        suggestion: 'list_assets 또는 GET /assets 로 유효한 index를 다시 확인하세요.',
        target: `asset:${idx}`,
      });
      return true;
    }
    const rawBody = await deps.readJsonBody(req, res, `asset/${idx}/delete`, deps.broadcastStatus);
    if (!rawBody) return true;
    const body = deps.parseBody(res, rawBody, assetDeleteBodySchema, {
      action: 'delete_asset',
      target: `asset:${idx}`,
    });
    if (!body) return true;
    const assetToDelete = assets[idx];
    if (
      !deps.ensureAssetExpectedPath(
        res,
        idx,
        assetToDelete.path,
        body.expected_path,
        'delete_asset',
        `asset:${idx}`,
        'list_assets 또는 GET /assets 로 최신 index/path를 다시 확인하세요.',
        deps.mcpError,
      )
    ) {
      return true;
    }
    const allowed = await deps.askRendererConfirm(
      'MCP 에셋 삭제 요청',
      `AI 어시스턴트가 에셋 "${assetToDelete.path}"을(를) 삭제하려 합니다. 허용하시겠습니까?`,
    );
    if (!allowed) {
      deps.mcpError(res, 403, {
        action: 'delete_asset',
        message: '사용자가 에셋 삭제를 거부했습니다.',
        rejected: true,
        suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
        target: `asset:${idx}`,
      });
      return true;
    }
    assets.splice(idx, 1);
    deleteAssetReferences(currentData, assetToDelete.path);
    deps.broadcastToAll('data-updated', { field: 'assets' });
    deps.jsonResSuccess(
      res,
      { ok: true, deleted: assetToDelete.path },
      {
        toolName: 'delete_charx_asset',
        summary: `Deleted charx asset "${assetToDelete.path}"`,
        artifacts: { deleted: assetToDelete.path },
      },
    );
    return true;
  }

  if (parts[0] === 'asset' && parts[1] && parts[2] === 'rename' && req.method === 'POST') {
    const assets = (currentData.assets || []) as AssetLike[];
    const idx = parseInt(parts[1], 10);
    if (isNaN(idx) || idx < 0 || idx >= assets.length) {
      deps.mcpError(res, 400, {
        action: 'rename_asset',
        message: `에셋 index ${idx}이(가) 범위를 벗어났습니다 (0–${assets.length - 1}).`,
        suggestion: 'list_assets 또는 GET /assets 로 유효한 index를 다시 확인하세요.',
        target: `asset:${idx}`,
      });
      return true;
    }
    const rawBody = await deps.readJsonBody(req, res, `asset/${idx}/rename`, deps.broadcastStatus);
    if (!rawBody) return true;
    const body = deps.parseBody(res, rawBody, assetRenameBodySchema, {
      action: 'rename_asset',
      target: `asset:${idx}`,
    });
    if (!body) return true;
    const newName = body.newName;
    const newNameError = validateAssetFileName(newName);
    if (newNameError) {
      deps.mcpError(res, 400, {
        action: 'rename_asset',
        message: newNameError,
        target: `asset:${idx}`,
      });
      return true;
    }
    const asset = assets[idx];
    const oldPath = asset.path;
    if (
      !deps.ensureAssetExpectedPath(
        res,
        idx,
        oldPath,
        body.expected_path,
        'rename_asset',
        `asset:${idx}`,
        'list_assets 또는 GET /assets 로 최신 index/path를 다시 확인하세요.',
        deps.mcpError,
      )
    ) {
      return true;
    }
    const allowed = await deps.askRendererConfirm(
      'MCP 에셋 이름 변경 요청',
      `AI 어시스턴트가 에셋 "${oldPath}"의 이름을 "${newName}"(으)로 변경하려 합니다. 허용하시겠습니까?`,
    );
    if (!allowed) {
      deps.mcpError(res, 403, {
        action: 'rename_asset',
        message: '사용자가 에셋 이름 변경을 거부했습니다.',
        rejected: true,
        suggestion: '앱에서 이름 변경 요청을 허용한 뒤 다시 시도하세요.',
        target: `asset:${idx}`,
      });
      return true;
    }
    const dir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1);
    const newPath = dir + newName;
    if (assets.some((entry, entryIndex) => entryIndex !== idx && entry.path === newPath)) {
      deps.mcpError(res, 409, {
        action: 'rename_asset',
        message: `에셋 경로 "${newPath}"가 이미 존재합니다.`,
        suggestion: '다른 파일명을 사용하세요.',
        target: `asset:${idx}`,
      });
      return true;
    }
    asset.path = newPath;
    renameAssetReferences(currentData, oldPath, newPath);
    deps.broadcastToAll('data-updated', { field: 'assets' });
    deps.jsonResSuccess(
      res,
      { ok: true, oldPath, newPath },
      {
        toolName: 'rename_charx_asset',
        summary: `Renamed charx asset "${oldPath}" → "${newPath}"`,
        artifacts: { oldPath, newPath },
      },
    );
    return true;
  }

  if (parts[0] === 'assets' && parts[1] === 'compress-webp' && req.method === 'POST') {
    const assets = (currentData.assets || []) as { path: string; data: Buffer }[];
    if (assets.length === 0) {
      deps.mcpError(res, 400, {
        action: 'compress-webp',
        message: 'No assets found in file.',
        target: 'assets',
      });
      return true;
    }

    const rawBody = await deps.readJsonBody(req, res, 'assets/compress-webp', deps.broadcastStatus);
    if (!rawBody) return true;
    const body = deps.parseBody(res, rawBody, assetCompressWebpBodySchema, {
      action: 'compress-webp',
      target: 'assets',
    });
    if (!body) return true;

    const quality = body.quality ?? 80;
    const recompressWebp = body.recompressWebp === true;

    let compressAssetsToWebP: typeof import('./image-compressor').compressAssetsToWebP;
    let updateAssetReferences: typeof import('./image-compressor').updateAssetReferences;
    let formatBytes: typeof import('./image-compressor').formatBytes;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./image-compressor') as typeof import('./image-compressor');
      compressAssetsToWebP = mod.compressAssetsToWebP;
      updateAssetReferences = mod.updateAssetReferences;
      formatBytes = mod.formatBytes;
    } catch (err: unknown) {
      deps.mcpError(res, 500, {
        action: 'compress-webp',
        message: `Image compressor module not available: ${err instanceof Error ? err.message : String(err)}`,
        target: 'assets',
      });
      return true;
    }

    const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'tif', 'avif', 'webp']);
    const convertible = assets.filter((a) => {
      const ext = a.path.split('.').pop()?.toLowerCase() || '';
      if (ext === 'svg') return false;
      if (ext === 'webp' && !recompressWebp) return false;
      return imageExts.has(ext);
    });

    if (convertible.length === 0) {
      deps.jsonResSuccess(
        res,
        {
          ok: true,
          ...(body.dry_run === true || body.dryRun === true ? { dry_run: true, preview: [] } : {}),
          message: 'No convertible assets found.',
          stats: {
            total: assets.length,
            converted: 0,
            skipped: assets.length,
            failed: 0,
            larger: 0,
            originalSize: assets.reduce((s, a) => s + a.data.length, 0),
            compressedSize: assets.reduce((s, a) => s + a.data.length, 0),
            savedBytes: 0,
            savedPercent: 0,
          },
        },
        {
          toolName: 'compress_assets_webp',
          summary: 'No convertible assets found',
          artifacts: { total: assets.length, converted: 0, skipped: assets.length },
        },
      );
      return true;
    }

    const totalSize = assets.reduce((s, a) => s + a.data.length, 0);
    const preview = convertible.map((a) => ({
      index: assets.indexOf(a),
      path: a.path,
      size: a.data.length,
      newPath: a.path.replace(/\.[^.]+$/, '.webp'),
    }));
    if (body.dry_run === true || body.dryRun === true) {
      deps.jsonResSuccess(
        res,
        {
          ok: true,
          dry_run: true,
          quality,
          recompressWebp,
          stats: {
            total: assets.length,
            convertible: convertible.length,
            skipped: assets.length - convertible.length,
            originalSize: totalSize,
          },
          preview,
        },
        {
          toolName: 'compress_assets_webp',
          summary: `Dry-run: ${convertible.length} asset(s) would be considered for WebP compression`,
          artifacts: { total: assets.length, convertible: convertible.length, dry_run: true },
        },
      );
      return true;
    }

    const allowed = await deps.askRendererConfirm(
      'WebP 에셋 압축',
      `${convertible.length}개 이미지를 WebP (품질 ${quality})로 변환합니다.\n` +
        `전체 에셋: ${assets.length}개 (${formatBytes(totalSize)})\n` +
        `변환 대상: ${convertible.length}개\n\n` +
        `원본 파일은 교체되며 되돌릴 수 없습니다.`,
    );

    if (!allowed) {
      deps.mcpError(res, 403, {
        action: 'compress-webp',
        message: 'User rejected the compression request.',
        target: 'assets',
        rejected: true,
      });
      return true;
    }

    try {
      const result = await compressAssetsToWebP(assets, {
        quality,
        recompressWebp,
      });

      const pathMap = new Map<string, string>();
      for (const d of result.details) {
        if (d.status === 'converted' && d.originalPath !== d.newPath) {
          pathMap.set(d.originalPath, d.newPath);
        }
      }

      currentData.assets = result.assets;

      let refsUpdated = { cardAssetsUpdated: 0, xMetaUpdated: 0 };
      if (pathMap.size > 0) {
        refsUpdated = updateAssetReferences(
          pathMap,
          (currentData.cardAssets || []) as unknown[],
          (currentData.xMeta || {}) as Record<string, unknown>,
        );
      }

      deps.broadcastToAll('data-updated', { field: 'assets' });
      deps.logMcpMutation('compress-webp', 'assets', {
        quality,
        converted: result.stats.converted,
        savedBytes: result.stats.savedBytes,
      });

      deps.jsonResSuccess(
        res,
        {
          ok: true,
          stats: result.stats,
          referencesUpdated: refsUpdated,
          details: result.details.map((d) => ({
            originalPath: d.originalPath,
            newPath: d.newPath,
            originalSize: d.originalSize,
            newSize: d.newSize,
            status: d.status,
            reason: d.reason,
          })),
        },
        {
          toolName: 'compress_assets_webp',
          summary: `Compressed ${result.stats.converted} asset(s), saved ${result.stats.savedBytes} bytes`,
          artifacts: { converted: result.stats.converted, savedBytes: result.stats.savedBytes },
        },
      );
      return true;
    } catch (err: unknown) {
      deps.mcpError(res, 500, {
        action: 'compress-webp',
        message: `Compression failed: ${err instanceof Error ? err.message : String(err)}`,
        target: 'assets',
      });
      return true;
    }
  }

  if (parts[0] === 'risum-assets' && !parts[1] && req.method === 'GET') {
    const risumAssets = (currentData.risumAssets || []) as Buffer[];
    const modAssets = getRisumModuleAssets(currentData);
    const items = risumAssets.map((buf, i) => {
      const meta = Array.isArray(modAssets[i]) ? (modAssets[i] as string[]) : null;
      return {
        index: i,
        name: meta?.[0] || `asset_${i}`,
        path: meta?.[2] || '',
        size: buf.length,
      };
    });
    deps.jsonResSuccess(
      res,
      { count: items.length, assets: items },
      {
        toolName: 'list_risum_assets',
        summary: `Listed ${items.length} risum asset(s)`,
        artifacts: { count: items.length },
      },
    );
    return true;
  }

  if (parts[0] === 'risum-asset' && parts[1] && !parts[2] && req.method === 'GET') {
    const risumAssets = (currentData.risumAssets || []) as Buffer[];
    const idx = parseInt(parts[1], 10);
    if (isNaN(idx) || idx < 0 || idx >= risumAssets.length) {
      deps.mcpError(res, 400, {
        action: 'read_risum_asset',
        message: `리슘 에셋 index ${idx}이(가) 범위를 벗어났습니다 (0–${risumAssets.length - 1}).`,
        suggestion: 'list_risum_assets 또는 GET /risum-assets 로 유효한 index를 다시 확인하세요.',
        target: `risum-asset:${idx}`,
      });
      return true;
    }
    const modAssets = getRisumModuleAssets(currentData);
    const meta = Array.isArray(modAssets[idx]) ? (modAssets[idx] as string[]) : null;
    const assetBuf = risumAssets[idx];
    const risumAssetName = meta?.[0] || `asset_${idx}`;
    deps.jsonResSuccess(
      res,
      {
        index: idx,
        name: risumAssetName,
        path: meta?.[2] || '',
        size: assetBuf.length,
        base64: assetBuf.toString('base64'),
      },
      {
        toolName: 'read_risum_asset',
        summary: `Read risum asset ${idx} ("${risumAssetName}", ${assetBuf.length} bytes)`,
        artifacts: { index: idx, name: risumAssetName, size: assetBuf.length },
      },
    );
    return true;
  }

  if (parts[0] === 'risum-asset' && parts[1] === 'add' && req.method === 'POST') {
    const rawBody = await deps.readJsonBody(req, res, 'risum-asset/add', deps.broadcastStatus);
    if (!rawBody) return true;
    const body = deps.parseBody(res, rawBody, risumAssetAddBodySchema, {
      action: 'add_risum_asset',
      target: 'risum-asset:add',
    });
    if (!body) return true;
    const assetName = body.name;
    const assetPath = body.path || '';
    const base64Data = body.base64;
    const assetExt = ((assetPath || assetName).split('.').pop() || 'png').toLowerCase();
    const allowed = await deps.askRendererConfirm(
      'MCP 리슘 에셋 추가 요청',
      `AI 어시스턴트가 리슘 에셋 "${assetName}"을(를) 추가하려 합니다. 허용하시겠습니까?`,
    );
    if (!allowed) {
      deps.mcpError(res, 403, {
        action: 'add_risum_asset',
        message: '사용자가 에셋 추가를 거부했습니다.',
        rejected: true,
        suggestion: '앱에서 추가 요청을 허용한 뒤 다시 시도하세요.',
        target: assetName,
      });
      return true;
    }
    const buf = Buffer.from(base64Data, 'base64');
    if (!currentData.risumAssets) currentData.risumAssets = [];
    (currentData.risumAssets as Buffer[]).push(buf);
    const modData = currentData._moduleData as Record<string, unknown>;
    if (modData) {
      const mod = (modData.module as Record<string, unknown>) || modData;
      if (!Array.isArray(mod.assets)) mod.assets = [];
      (mod.assets as unknown[]).push([assetName, '', assetExt]);
    }
    const addFileType = currentData._fileType || 'charx';
    if (addFileType === 'charx' && Array.isArray(currentData.cardAssets)) {
      currentData.cardAssets.push({
        type: 'x-risu-asset',
        uri: `embeded://${assetPath || assetName}`,
        name: assetName,
        ext: assetExt,
      });
    }
    if (deps.invalidateAssetsMapCache) deps.invalidateAssetsMapCache();
    deps.broadcastToAll('data-updated', { field: 'risumAssets' });
    deps.jsonResSuccess(
      res,
      { ok: true, index: (currentData.risumAssets as Buffer[]).length - 1, name: assetName, size: buf.length },
      {
        toolName: 'add_risum_asset',
        summary: `Added risum asset "${assetName}" (${buf.length} bytes)`,
        artifacts: { name: assetName, size: buf.length },
      },
    );
    return true;
  }

  if (parts[0] === 'risum-asset' && parts[1] && parts[2] === 'delete' && req.method === 'POST') {
    const risumAssets = (currentData.risumAssets || []) as Buffer[];
    const idx = parseInt(parts[1], 10);
    if (isNaN(idx) || idx < 0 || idx >= risumAssets.length) {
      deps.mcpError(res, 400, {
        action: 'delete_risum_asset',
        message: `리슘 에셋 index ${idx}이(가) 범위를 벗어났습니다 (0–${risumAssets.length - 1}).`,
        suggestion: 'list_risum_assets 또는 GET /risum-assets 로 유효한 index를 다시 확인하세요.',
        target: `risum-asset:${idx}`,
      });
      return true;
    }
    const modAssets = getRisumModuleAssets(currentData);
    const rawBody = await deps.readJsonBody(req, res, `risum-asset/${idx}/delete`, deps.broadcastStatus);
    if (!rawBody) return true;
    const body = deps.parseBody(res, rawBody, risumAssetDeleteBodySchema, {
      action: 'delete_risum_asset',
      target: `risum-asset:${idx}`,
    });
    if (!body) return true;
    const meta = Array.isArray(modAssets[idx]) ? (modAssets[idx] as string[]) : null;
    const deleteName = meta?.[0] || `asset_${idx}`;
    const deletePath = meta?.[2] || deleteName;
    if (
      !deps.ensureAssetExpectedPath(
        res,
        idx,
        deletePath,
        body.expected_path,
        'delete_risum_asset',
        `risum-asset:${idx}`,
        'list_risum_assets 또는 GET /risum-assets 로 최신 index/path를 다시 확인하세요.',
        deps.mcpError,
      )
    ) {
      return true;
    }
    const allowed = await deps.askRendererConfirm(
      'MCP 리슘 에셋 삭제 요청',
      `AI 어시스턴트가 리슘 에셋 "${deleteName}"을(를) 삭제하려 합니다. 허용하시겠습니까?`,
    );
    if (!allowed) {
      deps.mcpError(res, 403, {
        action: 'delete_risum_asset',
        message: '사용자가 에셋 삭제를 거부했습니다.',
        rejected: true,
        suggestion: '앱에서 삭제 요청을 허용한 뒤 다시 시도하세요.',
        target: `risum-asset:${idx}`,
      });
      return true;
    }
    risumAssets.splice(idx, 1);
    if (Array.isArray(modAssets) && idx < modAssets.length) {
      modAssets.splice(idx, 1);
    }
    const delFileType = currentData._fileType || 'charx';
    if (delFileType === 'charx' && Array.isArray(currentData.cardAssets)) {
      const cardIdx = (currentData.cardAssets as { name?: string }[]).findIndex((ca) => ca.name === deleteName);
      if (cardIdx >= 0) currentData.cardAssets.splice(cardIdx, 1);
    }
    if (deps.invalidateAssetsMapCache) deps.invalidateAssetsMapCache();
    deps.broadcastToAll('data-updated', { field: 'risumAssets' });
    deps.jsonResSuccess(
      res,
      { ok: true, deleted: deleteName },
      {
        toolName: 'delete_risum_asset',
        summary: `Deleted risum asset "${deleteName}"`,
        artifacts: { deleted: deleteName },
      },
    );
    return true;
  }

  return false;
}
