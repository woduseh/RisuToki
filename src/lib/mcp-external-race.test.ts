// @vitest-environment node
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { closeServer, createLegacyTestApiServer, createExternalFixtureHelpers, postJson } from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';

const dir = useMcpApiTestDir('external-race');
const startServer = createLegacyTestApiServer(dir);
const fixtures = createExternalFixtureHelpers(dir);

describe('external file confirmation races', () => {
  it('preserves bytes changed by another writer during confirmation', async () => {
    const { filePath } = fixtures.createExternalCharxFixture();
    const externalBytes = Buffer.from('changed by another writer');
    const api = await startServer(null, [], undefined, {
      askRendererConfirm: async () => {
        fs.writeFileSync(filePath, externalBytes);
        return true;
      },
    });
    try {
      const response = await postJson(api.port, api.token, '/external/field/description', {
        file_path: filePath,
        content: 'MCP replacement',
      });
      expect(response.status).toBe(409);
      expect(fs.readFileSync(filePath)).toEqual(externalBytes);
    } finally {
      await closeServer(api.server);
    }
  });
});
