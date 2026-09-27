// @vitest-environment node
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createFacadeAssetsEngine } from './mcp-facade-assets';
import { createFacadeScriptStyleEngine } from './mcp-facade-script-style';
import { createMcpProxyClient } from './mcp-proxy-client';
import { isApiError } from './mcp-facade-runtime';
import {
  closeServer,
  createExternalFixtureHelpers,
  openExternalDocumentForTest,
  postJson,
  startTestApiServer,
} from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';

const dir = useMcpApiTestDir('metadata-reads');
const fixtures = createExternalFixtureHelpers(dir);

describe('external asset read projections', () => {
  it.concurrent.each(['charx', 'risum'] as const)(
    'lists %s in one load without transferring binaries and reads only the selected bytes',
    async (family) => {
      const big = Buffer.alloc(64 * 1024, 42);
      const small = Buffer.from([0, 128, 255]);
      const { filePath } =
        family === 'charx'
          ? fixtures.createExternalCharxFixture({
              assets: [
                { path: 'assets/a.png', data: big },
                { path: 'assets/b.png', data: small },
              ],
            })
          : fixtures.createExternalRisumFixture({
              risumAssets: [big, small],
              _moduleData: {
                name: 'Synthetic',
                assets: [
                  ['first', 0, 'a.png'],
                  ['second', 1, 'b.png'],
                ],
              },
            });
      const before = fs.readFileSync(filePath);
      const open = vi.fn(openExternalDocumentForTest);
      const confirm = vi.fn(async () => true);
      const api = await startTestApiServer(null, [], undefined, {
        openExternalDocument: open,
        askRendererConfirm: confirm,
      });
      const responses: number[] = [];
      const request = vi.fn(
        createMcpProxyClient({
          getPort: () => String(api.port),
          getToken: () => api.token,
          noteRuntimeError: vi.fn(),
          mcpLog: vi.fn(),
          logProcessDiagnostic: (event, data) => {
            if (event === 'apiResponse') responses.push(Number(data?.responseBytes));
          },
          getRequestContext: () => ({ requestId: 'assets', mutating: false, signal: new AbortController().signal }),
        }),
      );
      const scriptStyle = createFacadeScriptStyleEngine(request);
      const engine = createFacadeAssetsEngine({
        apiRequest: request,
        hashStableValue: scriptStyle.hashStableValue,
        readExternalSurfaceValue: scriptStyle.readExternalSurfaceValue,
      });
      const target = { kind: 'external' as const, file_path: filePath };
      try {
        const list = await engine.readManageAssetsOperation(target, family, { action: 'list_assets' });
        if (isApiError(list)) throw new Error(String(list.error));
        expect(list.result.count).toBe(2);
        expect(list.result.assets).toEqual([
          {
            index: 0,
            path: family === 'charx' ? 'assets/a.png' : 'a.png',
            name: family === 'charx' ? 'a.png' : 'first',
            size: big.length,
            mimeType: 'image/png',
          },
          {
            index: 1,
            path: family === 'charx' ? 'assets/b.png' : 'b.png',
            name: family === 'charx' ? 'b.png' : 'second',
            size: small.length,
            mimeType: 'image/png',
          },
        ]);
        expect(list.result.asset_collection_digest).toBe(
          scriptStyle.hashStableValue(
            (list.result.assets as Array<Record<string, unknown>>).map(({ index, path, name, size }) => ({
              index,
              path,
              name,
              size,
            })),
          ),
        );
        expect(open).toHaveBeenCalledOnce();
        expect(request).toHaveBeenCalledOnce();
        expect(responses[0]).toBeLessThan(2048);
        const read = await engine.readManageAssetsOperation(target, family, {
          action: 'read_asset',
          selector: { index: 1 },
        });
        if (isApiError(read)) throw new Error(String(read.error));
        expect(read.result.asset).toMatchObject({ index: 1, base64: small.toString('base64') });
        expect(read.result.asset_collection_digest).toBe(list.result.asset_collection_digest);
        expect(open).toHaveBeenCalledTimes(2);
        expect(request).toHaveBeenCalledTimes(2);
        expect(responses[1]).toBeLessThan(2048);
        expect(confirm).not.toHaveBeenCalled();
        expect(fs.readFileSync(filePath)).toEqual(before);
        const invalid = await engine.readManageAssetsOperation(target, family, {
          action: 'read_asset',
          selector: { index: 99 },
        });
        expect(invalid).toMatchObject({ status: 404 });
      } finally {
        await closeServer(api.server);
      }
    },
  );

  it('keeps selector validation and ambiguity errors on the metadata route', async () => {
    const { filePath } = fixtures.createExternalCharxFixture({
      assets: [
        { path: 'assets/a/same.png', data: Buffer.from([1]) },
        { path: 'assets/b/same.png', data: Buffer.from([2]) },
      ],
    });
    const api = await startTestApiServer(null);
    try {
      for (const selector of [{}, { index: -1 }, { index: '0' }]) {
        expect(
          (await postJson(api.port, api.token, '/external/assets/read', { file_path: filePath, selector })).status,
        ).toBe(400);
      }
      expect(
        (
          await postJson(api.port, api.token, '/external/assets/read', {
            file_path: filePath,
            selector: { path: 'same.png' },
          })
        ).status,
      ).toBe(409);
      expect((await postJson(api.port, 'bad-token', '/external/assets/read', { file_path: filePath })).status).toBe(
        401,
      );
    } finally {
      await closeServer(api.server);
    }
  });
});
