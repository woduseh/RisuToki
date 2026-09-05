// @vitest-environment node
import fs from 'node:fs';
import { openCharx } from '../charx-io';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExternalFixtureHelpers, getJson, postJson } from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';
import { startHeadlessMcpApiServer } from './mcp-headless-server';

const dir = useMcpApiTestDir('headless-save');
const fixtures = createExternalFixtureHelpers(dir);

describe('standalone save ownership', () => {
  it.each(['read-only', 'disk changed'] as const)('rejects save when %s', async (mode) => {
    const { filePath, dir: fixtureDir } = fixtures.createExternalCharxFixture();
    const runtime = await startHeadlessMcpApiServer({
      filePath,
      allowWrites: mode !== 'read-only',
      userDataPath: path.join(fixtureDir, 'user-data'),
      log: () => {},
    });
    try {
      if (mode === 'disk changed') fs.writeFileSync(filePath, 'another writer');
      const bytes = fs.readFileSync(filePath);
      const response = await postJson(runtime.port, runtime.token, '/document/save', {});
      expect(response.status).toBe(mode === 'read-only' ? 403 : 409);
      expect(fs.readFileSync(filePath)).toEqual(bytes);
    } finally {
      await runtime.close();
    }
  });

  it('retains the active file and data when opening another file fails', async () => {
    const { filePath, dir: fixtureDir } = fixtures.createExternalCharxFixture();
    const invalidPath = path.join(fixtureDir, 'invalid.charx');
    fs.writeFileSync(invalidPath, 'invalid archive');
    const runtime = await startHeadlessMcpApiServer({
      filePath,
      allowWrites: true,
      userDataPath: path.join(fixtureDir, 'user-data'),
      log: () => {},
    });
    try {
      const response = await postJson(runtime.port, runtime.token, '/open-file', { file_path: invalidPath });
      expect(response.status).toBe(500);
      const session = await getJson<{ document: { filePath: string } }>(runtime.port, runtime.token, '/session/status');
      expect(session.data.document.filePath).toBe(filePath);
      const saved = await postJson(runtime.port, runtime.token, '/document/save', {});
      expect(saved.status).toBe(200);
      expect(fs.readFileSync(invalidPath, 'utf8')).toBe('invalid archive');
    } finally {
      await runtime.close();
    }
  });

  it('saves current in-memory edits when open_file requests save_current', async () => {
    const { filePath, dir: fixtureDir } = fixtures.createExternalCharxFixture();
    const next = fixtures.createExternalCharxFixture();
    const runtime = await startHeadlessMcpApiServer({
      filePath,
      allowWrites: true,
      userDataPath: path.join(fixtureDir, 'user-data'),
      log: () => {},
    });
    try {
      const changed = await postJson(runtime.port, runtime.token, '/field/description', {
        content: 'edited before switch',
      });
      expect(changed.status).toBe(200);
      const opened = await postJson(runtime.port, runtime.token, '/open-file', {
        file_path: next.filePath,
        save_current: true,
      });
      expect(opened.status).toBe(200);
      expect(openCharx(filePath).description).toBe('edited before switch');
    } finally {
      await runtime.close();
    }
  });
});
