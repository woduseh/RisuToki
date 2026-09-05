import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { createFacadeAssetsEngine, MAX_SOURCE_ASSET_BYTES } from './mcp-facade-assets';
import { isApiError } from './mcp-facade-runtime';
import { manageAssetsBodySchema } from './mcp-request-schemas';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function sourceFile(bytes: Buffer): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'risutoki-asset-source-'));
  directories.push(directory);
  const file = path.join(directory, 'portrait.png');
  await writeFile(file, bytes);
  return file;
}

function setup() {
  const apiRequest = vi.fn<
    (method: string, urlPath: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>
  >(async () => ({ assets: [], success: true }));
  const engine = createFacadeAssetsEngine({
    apiRequest,
    hashStableValue: (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex'),
    readExternalSurfaceValue: async (_file, surface) => ({
      value: surface === '/xMeta' ? {} : [],
      routes: [],
      raw: {},
    }),
  });
  return { engine, apiRequest };
}

describe('manage_assets local asset sources', () => {
  it.each(['charx', 'risum'] as const)('imports %s bytes without returning base64 in the preview', async (family) => {
    const { engine, apiRequest } = setup();
    const bytes = Buffer.from([0, 1, 2, 253, 254, 255]);
    const source_path = await sourceFile(bytes);
    const operation = { action: 'add_asset' as const, fileName: 'portrait.png', source_path };
    const preview = await engine.previewManageAssetsOperation({ kind: 'active' }, family, operation);
    if (isApiError(preview)) throw new Error(String(preview.error));
    expect(preview.requiredGuards.find((guard) => guard.name === 'expected_source_hash')).toBeDefined();
    expect(JSON.stringify(preview)).not.toContain(bytes.toString('base64'));
    apiRequest.mockClear();
    const applied = await engine.applyManageAssetsOperation(
      { kind: 'active' },
      family,
      operation,
      preview.requiredGuards,
    );
    expect(isApiError(applied)).toBe(false);
    expect(apiRequest).toHaveBeenCalledWith(
      'POST',
      family === 'charx' ? '/asset/add' : '/risum-asset/add',
      expect.objectContaining({ base64: bytes.toString('base64') }),
    );
  });

  it('rejects a changed source before any asset mutation', async () => {
    const { engine, apiRequest } = setup();
    const source_path = await sourceFile(Buffer.from('before'));
    const operation = { action: 'add_asset' as const, fileName: 'portrait.png', source_path };
    const preview = await engine.previewManageAssetsOperation({ kind: 'active' }, 'charx', operation);
    if (isApiError(preview)) throw new Error(String(preview.error));
    await writeFile(source_path, 'after!');
    apiRequest.mockClear();
    const result = await engine.applyManageAssetsOperation(
      { kind: 'active' },
      'charx',
      operation,
      preview.requiredGuards,
    );
    expect(result).toMatchObject({ status: 409 });
    expect(apiRequest.mock.calls.every((call) => call[0] === 'GET')).toBe(true);
  });

  it('uses the guarded external surface patch for an unopened charx', async () => {
    const { engine, apiRequest } = setup();
    const bytes = Buffer.from([128, 255, 0]);
    const source_path = await sourceFile(bytes);
    const target = { kind: 'external' as const, file_path: path.join(path.dirname(source_path), 'bot.charx') };
    const operation = { action: 'add_asset' as const, fileName: 'portrait.png', source_path };
    const preview = await engine.previewManageAssetsOperation(target, 'charx', operation);
    if (isApiError(preview)) throw new Error(String(preview.error));
    apiRequest.mockClear();
    const result = await engine.applyManageAssetsOperation(target, 'charx', operation, preview.requiredGuards);
    expect(isApiError(result)).toBe(false);
    expect(apiRequest).toHaveBeenCalledWith(
      'POST',
      '/external/surface/patch',
      expect.objectContaining({
        file_path: target.file_path,
        operations: expect.arrayContaining([
          expect.objectContaining({
            path: '/assets',
            value: [{ path: 'assets/other/image/portrait.png', data: { type: 'Buffer', data: [...bytes] } }],
          }),
        ]),
      }),
    );
  });

  it('rejects oversized and relative source paths', async () => {
    const { engine } = setup();
    const source_path = await sourceFile(Buffer.alloc(MAX_SOURCE_ASSET_BYTES + 1));
    expect(
      await engine.previewManageAssetsOperation({ kind: 'active' }, 'charx', {
        action: 'add_asset',
        fileName: 'portrait.png',
        source_path,
      }),
    ).toMatchObject({ status: 413 });
    expect(
      await engine.previewManageAssetsOperation({ kind: 'active' }, 'charx', {
        action: 'add_asset',
        fileName: 'portrait.png',
        source_path: 'relative.png',
      }),
    ).toMatchObject({ status: 400 });
  });

  it('requires exactly one source and retains base64 compatibility', () => {
    const parse = (input: Record<string, string>) =>
      manageAssetsBodySchema.safeParse({
        target: { kind: 'active' },
        mode: 'preview',
        operation: { action: 'add_asset', fileName: 'portrait.png', ...input },
      }).success;
    expect(parse({})).toBe(false);
    expect(parse({ base64: 'AA==', source_path: '/portrait.png' })).toBe(false);
    expect(parse({ base64: 'AA==' })).toBe(true);
    expect(parse({ source_path: '/portrait.png' })).toBe(true);
  });
});
