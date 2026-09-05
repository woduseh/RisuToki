// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openCharx, openRisum, openRisup } from '../charx-io';
import { closeServer, createLegacyTestApiServer, postJson } from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';
import { startHeadlessMcpApiServer } from './mcp-headless-server';

const dir = useMcpApiTestDir('create-document');
const startServer = createLegacyTestApiServer(dir);

describe('artifact creation without an active document', () => {
  it.each(['charx', 'risum', 'risup'] as const)('creates a reloadable %s in headless mode', async (type) => {
    const destination = path.join(dir, `new.${type}`);
    const runtime = await startHeadlessMcpApiServer({
      allowWrites: true,
      userDataPath: path.join(dir, `user-${type}`),
      log: () => {},
    });
    try {
      const response = await postJson(runtime.port, runtime.token, '/external/create', {
        file_path: destination,
        name: '테스트 봇',
        description: '새 봇',
      });
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({ success: true });
      const document =
        type === 'charx' ? openCharx(destination) : type === 'risum' ? openRisum(destination) : openRisup(destination);
      expect(type === 'risum' ? document.moduleName : document.name).toBe('테스트 봇');
      const bytes = fs.readFileSync(destination);
      const duplicate = await postJson(runtime.port, runtime.token, '/external/create', {
        file_path: destination,
        name: 'overwritten',
      });
      expect(duplicate.status).toBe(409);
      expect(fs.readFileSync(destination)).toEqual(bytes);
    } finally {
      await runtime.close();
    }
  });

  it('respects the standalone write gate', async () => {
    const destination = path.join(dir, 'denied.charx');
    const runtime = await startHeadlessMcpApiServer({ userDataPath: path.join(dir, 'readonly'), log: () => {} });
    try {
      const response = await postJson(runtime.port, runtime.token, '/external/create', {
        file_path: destination,
        name: 'denied',
      });
      expect(response.data).not.toMatchObject({ success: true });
      expect(fs.existsSync(destination)).toBe(false);
    } finally {
      await runtime.close();
    }
  });

  it.each(['denied', 'race'] as const)('preserves files when app confirmation is %s', async (mode) => {
    const destination = path.join(dir, `${mode}-app.charx`);
    const api = await startServer(null, [], undefined, {
      askRendererConfirm: async () => {
        if (mode === 'race') fs.writeFileSync(destination, 'another writer');
        return mode === 'race';
      },
    });
    try {
      const response = await postJson(api.port, api.token, '/external/create', { file_path: destination, name: 'new' });
      expect(response.data).not.toMatchObject({ success: true });
      if (mode === 'race') expect(fs.readFileSync(destination, 'utf8')).toBe('another writer');
      else expect(fs.existsSync(destination)).toBe(false);
    } finally {
      await closeServer(api.server);
    }
  });
});
