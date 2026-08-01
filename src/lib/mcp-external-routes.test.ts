// @vitest-environment node
import * as fs from 'fs';
import * as path from 'path';

import AdmZip from 'adm-zip';
import { beforeAll, describe, expect, it } from 'vitest';
import { openCharx, openRisum, openRisup, saveCharx, type LoadedDocumentData } from '../charx-io';
import {
  closeServer,
  createExternalFixtureHelpers,
  createLegacyTestApiServer,
  createSearchFixture,
  postJson,
  type McpErrorEnvelope,
} from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';

const TEST_DIR = useMcpApiTestDir('external-routes');
const { createExternalCharxFixture, createExternalRisumFixture, createExternalRisupFixture } =
  createExternalFixtureHelpers(TEST_DIR);
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

describe('MCP API external unopened-file routes', () => {
  it('inspects unopened charx files and exposes missing probe surfaces', async () => {
    const fixture = createExternalCharxFixture();
    const fixtureZip = new AdmZip(fixture.filePath);
    const cardEntry = fixtureZip.getEntry('card.json');
    expect(cardEntry).toBeTruthy();
    const card = JSON.parse(cardEntry!.getData().toString('utf-8')) as {
      data: Record<string, unknown>;
    };
    card.data.group_only_greetings = ['Legacy group external'];
    const rewrittenZip = new AdmZip();
    for (const entry of fixtureZip.getEntries()) {
      rewrittenZip.addFile(
        entry.entryName,
        entry.entryName === 'card.json' ? Buffer.from(JSON.stringify(card), 'utf-8') : entry.getData(),
      );
    }
    rewrittenZip.writeZip(fixture.filePath);
    const fixtureStat = fs.statSync(fixture.filePath);
    const api = await startTestApiServer(null, [], undefined, {
      parseLuaSections: (lua) => [{ name: 'main', content: lua }],
      parseCssSections: (css) => ({ sections: [{ name: 'main', content: css }], prefix: '', suffix: '' }),
    });

    try {
      const inspect = await postJson<Record<string, unknown>>(api.port, api.token, '/external/inspect', {
        file_path: fixture.filePath,
      });
      expect(inspect.status).toBe(200);
      expect(inspect.data).toMatchObject({
        file_path: fixture.filePath,
        file_type: 'charx',
        name: 'External Char',
      });
      expect(inspect.data.integrity).toEqual({
        path: fixture.filePath,
        exists: true,
        mtimeMs: fixtureStat.mtimeMs,
        size: fixtureStat.size,
        unavailableReason: null,
      });
      expect(inspect.data.surfaceCounts).toMatchObject({
        lorebook: 1,
        regex: 1,
        alternateGreetings: 1,
        triggerScripts: 1,
        cssSections: 1,
        luaSections: 1,
      });
      expect(inspect.data.hiddenFieldWarnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'groupOnlyGreetings', count: 1 })]),
      );

      const css = await postJson<{ count: number }>(api.port, api.token, '/probe/css', {
        file_path: fixture.filePath,
      });
      expect(css.status).toBe(200);
      expect(css.data.count).toBe(1);

      const greetings = await postJson<{ type: string; count: number }>(
        api.port,
        api.token,
        '/probe/greetings/alternate',
        {
          file_path: fixture.filePath,
        },
      );
      expect(greetings.status).toBe(200);
      expect(greetings.data).toMatchObject({ type: 'alternate', count: 1 });

      const groupGreetings = await postJson<McpErrorEnvelope>(api.port, api.token, '/probe/greetings/groupOnly', {
        file_path: fixture.filePath,
      });
      expect(groupGreetings.status).toBe(400);
      expect(groupGreetings.data.error).toContain('숨겨집니다');

      const triggers = await postJson<{ count: number }>(api.port, api.token, '/probe/triggers', {
        file_path: fixture.filePath,
      });
      expect(triggers.status).toBe(200);
      expect(triggers.data.count).toBe(1);
    } finally {
      await closeServer(api.server);
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('probes unopened risup prompt items and formating order', async () => {
    const fixture = createExternalRisupFixture();
    const api = await startTestApiServer(null);

    try {
      const promptItems = await postJson<{ count: number; state: string }>(
        api.port,
        api.token,
        '/probe/risup/prompt-items',
        {
          file_path: fixture.filePath,
        },
      );
      expect(promptItems.status).toBe(200);
      expect(promptItems.data).toMatchObject({ count: 1, state: 'valid' });

      const formatingOrder = await postJson<{ state: string; items: Array<{ token: string }> }>(
        api.port,
        api.token,
        '/probe/risup/formating-order',
        {
          file_path: fixture.filePath,
        },
      );
      expect(formatingOrder.status).toBe(200);
      expect(formatingOrder.data.state).toBe('valid');
      expect(formatingOrder.data.items.map((item) => item.token)).toEqual(['main', 'description']);
    } finally {
      await closeServer(api.server);
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('rejects unopened charx writes to deprecated group-only greetings', async () => {
    const fixture = createExternalCharxFixture();
    const api = await startTestApiServer(null);

    try {
      const response = await postJson<McpErrorEnvelope>(api.port, api.token, '/external/field/groupOnlyGreetings', {
        file_path: fixture.filePath,
        content: ['Group external', 'Second group line'],
      });
      expect(response.status).toBe(400);
      expect(response.data.target).toBe('external:field:groupOnlyGreetings');
      expect(response.data.error).toContain('deprecated');

      const reopened = openCharx(fixture.filePath);
      expect(reopened.groupOnlyGreetings).toEqual([]);
    } finally {
      await closeServer(api.server);
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('writes unopened risum and risup files without switching the active document', async () => {
    const risumFixture = createExternalRisumFixture();
    const risupFixture = createExternalRisupFixture();
    const api = await startTestApiServer(null);

    try {
      const risumRes = await postJson<{ success: boolean; updated: Array<{ field: string }> }>(
        api.port,
        api.token,
        '/external/field/batch-write',
        {
          file_path: risumFixture.filePath,
          entries: [
            { field: 'moduleName', content: 'Updated Module' },
            { field: 'lowLevelAccess', content: true },
          ],
        },
      );
      expect(risumRes.status).toBe(200);
      expect(risumRes.data.success).toBe(true);
      expect(risumRes.data.updated.map((entry) => entry.field)).toEqual(['moduleName', 'lowLevelAccess']);

      const reopenedRisum = openRisum(risumFixture.filePath);
      expect(reopenedRisum.moduleName).toBe('Updated Module');
      expect(reopenedRisum.lowLevelAccess).toBe(true);

      const risupRes = await postJson<{ success: boolean; field: string }>(
        api.port,
        api.token,
        '/external/field/formatingOrder',
        {
          file_path: risupFixture.filePath,
          content: '["main","chats"]',
        },
      );
      expect(risupRes.status).toBe(200);
      expect(risupRes.data).toMatchObject({ success: true, field: 'formatingOrder' });

      const reopenedRisup = openRisup(risupFixture.filePath);
      expect(reopenedRisup.formatingOrder).toBe('["main","chats"]');
    } finally {
      await closeServer(api.server);
      fs.rmSync(risumFixture.dir, { recursive: true, force: true });
      fs.rmSync(risupFixture.dir, { recursive: true, force: true });
    }
  });

  it('rejects external writes when the target file is already active in the UI session', async () => {
    const fixture = createExternalCharxFixture();
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: fixture.filePath,
        currentFileType: 'charx',
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      }),
    });

    try {
      const response = await postJson<Record<string, unknown>>(api.port, api.token, '/external/field/description', {
        file_path: fixture.filePath,
        content: 'Should be blocked',
      });
      expect(response.status).toBe(409);
      expect(response.data).toMatchObject({
        error: 'The requested file is already open in the UI session.',
        target: 'external:field:description',
      });
    } finally {
      await closeServer(api.server);
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('rejects external batch writes when the target file is already active in the UI session', async () => {
    const fixture = createExternalCharxFixture();
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: fixture.filePath,
        currentFileType: 'charx',
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      }),
    });

    try {
      const response = await postJson<Record<string, unknown>>(api.port, api.token, '/external/field/batch-write', {
        file_path: fixture.filePath,
        entries: [{ field: 'description', content: 'Should be blocked' }],
      });
      expect(response.status).toBe(409);
      expect(response.data).toMatchObject({
        error: 'The requested file is already open in the UI session.',
        target: 'external:field:batch-write',
      });
    } finally {
      await closeServer(api.server);
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});

describe('MCP API external file probe routes', () => {
  const PROBE_DIR = path.join(TEST_DIR, 'probe-fixtures');
  interface ProbeErrorEnvelope {
    action?: string;
    error?: string;
    status?: number;
    suggestion?: string;
    target?: string;
  }

  /** Create a valid .charx fixture through the real serializer path. */
  function writeCharxFixture(filePath: string, data: LoadedDocumentData): void {
    saveCharx(filePath, data);
    openCharx(filePath);
  }

  /** Canonical charx payload used by probe tests. */
  function probeCardData(): LoadedDocumentData {
    return {
      name: 'ProbeChar',
      description: 'Probe description field.',
      personality: 'Calm',
      scenario: 'Probe room',
      creatorcomment: 'Created for probe tests',
      tags: ['probe', 'charx'],
      exampleMessage: '',
      systemPrompt: '',
      creator: '',
      characterVersion: '1.0.0',
      nickname: '',
      source: [],
      creationDate: 0,
      modificationDate: 0,
      additionalText: '',
      license: '',
      firstMessage: 'Hello from probe.',
      alternateGreetings: ['Alt greeting 1'],
      groupOnlyGreetings: ['Group only probe greeting'],
      globalNote: 'Probe system note.',
      css: '/* probe css */',
      defaultVariables: 'mode=probe',
      lua: '-- ===== main =====\nprint("hello")\n',
      triggerScripts: [
        {
          comment: 'main',
          type: 'start',
          conditions: [],
          effect: [{ type: 'triggerlua', code: '-- ===== main =====\nprint("hello")\n' }],
          lowLevelAccess: false,
        },
      ],
      lorebook: [
        {
          comment: 'Lore A',
          key: 'alpha',
          secondkey: '',
          content: 'Alpha lore body.',
          insertorder: 100,
          alwaysActive: false,
          selective: false,
          mode: 'normal',
        },
        {
          comment: 'Lore B',
          key: 'beta',
          secondkey: '',
          content: 'Beta lore body.',
          insertorder: 200,
          alwaysActive: false,
          selective: false,
          mode: 'normal',
        },
      ],
      regex: [{ comment: 'Regex A', type: 'editoutput', find: 'foo', replace: 'bar', flag: 'g' }],
      moduleId: 'probe-module',
      moduleName: 'Probe Module',
      moduleDescription: 'Probe module description',
      assets: [{ path: 'assets/test.bin', data: Buffer.from([1, 2, 3, 4]) }],
      xMeta: { portrait: { width: 128, height: 128 } },
      risumAssets: [Buffer.from('embedded-asset')],
      cardAssets: [{ type: 'icon', uri: 'assets/test.bin', name: 'test.bin' }],
      _risuExt: {},
      _card: {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
          extensions: { risuai: {} },
          character_book: { entries: [] },
          assets: [],
        },
      },
      _moduleData: null,
      _presetData: null,
    };
  }

  let probeCharxPath: string;

  beforeAll(async () => {
    await fs.promises.mkdir(PROBE_DIR, { recursive: true });
    probeCharxPath = path.join(PROBE_DIR, 'probe-test.charx');
    writeCharxFixture(probeCharxPath, probeCardData());
  });

  // ── 1. Path validation ──────────────────────────────────────────────

  it('rejects empty file_path with a structured 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<ProbeErrorEnvelope>(api.port, api.token, '/probe/field/description', {
        file_path: '',
      });
      expect(res.status).toBe(400);
      expect(res.data.status).toBe(400);
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects file_path with path traversal (..) with a structured 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<ProbeErrorEnvelope>(api.port, api.token, '/probe/field/description', {
        file_path: `${PROBE_DIR}${path.sep}..${path.sep}..${path.sep}etc${path.sep}passwd.charx`,
      });
      expect(res.status).toBe(400);
      expect(res.data.status).toBe(400);
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects file_path with unsupported extension with a structured 400 envelope', async () => {
    const txtPath = path.join(PROBE_DIR, 'not-a-card.txt');
    await fs.promises.writeFile(txtPath, 'plain text', 'utf-8');

    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<ProbeErrorEnvelope>(api.port, api.token, '/probe/field/description', {
        file_path: txtPath,
      });
      expect(res.status).toBe(400);
      expect(res.data.status).toBe(400);
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects file_path pointing to a non-existent file with a structured 400 envelope', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<ProbeErrorEnvelope>(api.port, api.token, '/probe/field/description', {
        file_path: path.join(PROBE_DIR, 'does-not-exist.charx'),
      });
      expect(res.status).toBe(400);
      expect(res.data.status).toBe(400);
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects corrupted .charx probe files with a structured 400 envelope', async () => {
    const corruptPath = path.join(PROBE_DIR, 'corrupt.charx');
    await fs.promises.writeFile(corruptPath, 'not a zip archive', 'utf-8');

    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<ProbeErrorEnvelope>(api.port, api.token, '/probe/field/description', {
        file_path: corruptPath,
      });
      expect(res.status).toBe(400);
      expect(res.data.status).toBe(400);
      expect(typeof res.data.error).toBe('string');
      expect(typeof res.data.action).toBe('string');
      expect(typeof res.data.target).toBe('string');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  // ── 2. Probe single field read ──────────────────────────────────────

  it('reads a single field from an unopened charx file via probe', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<{ field: string; content: string }>(api.port, api.token, '/probe/field/description', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(res.data.field).toBe('description');
      expect(res.data.content).toBe('Probe description field.');
    } finally {
      await closeServer(api.server);
    }
  });

  // ── 3. Probe batch field read ───────────────────────────────────────

  it('batch-reads multiple fields from an unopened charx file via probe', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<{
        count: number;
        fields: Array<{ field: string; content: string }>;
      }>(api.port, api.token, '/probe/field/batch', {
        file_path: probeCharxPath,
        fields: ['description', 'firstMessage'],
      });
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(2);
      expect(res.data.fields).toHaveLength(2);
      expect(res.data.fields[0]).toMatchObject({ field: 'description', content: 'Probe description field.' });
      expect(res.data.fields[1]).toMatchObject({ field: 'firstMessage', content: 'Hello from probe.' });
    } finally {
      await closeServer(api.server);
    }
  });

  // ── 4. Probe lorebook / regex / lua listing ─────────────────────────

  it('lists lorebook entries from an unopened charx file via probe', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<{
        entries: Array<{ index: number; comment: string }>;
      }>(api.port, api.token, '/probe/lorebook', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(res.data.entries).toHaveLength(2);
      expect(res.data.entries[0].comment).toBe('Lore A');
      expect(res.data.entries[1].comment).toBe('Lore B');
    } finally {
      await closeServer(api.server);
    }
  });

  it('lists regex entries from an unopened charx file via probe', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<{
        entries: Array<{ index: number; comment: string }>;
      }>(api.port, api.token, '/probe/regex', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(res.data.entries).toHaveLength(1);
      expect(res.data.entries[0].comment).toBe('Regex A');
    } finally {
      await closeServer(api.server);
    }
  });

  it('lists lua sections from an unopened charx file via probe', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<{
        sections: Array<{ name: string }>;
      }>(api.port, api.token, '/probe/lua', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.sections)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // ── 5. Probe isolation: does NOT depend on getCurrentData() ─────────

  it('returns probe data independent of the active document state', async () => {
    const activeData = createSearchFixture();
    activeData.description = 'Active document description (should not appear in probe)';

    const api = await startTestApiServer(activeData);
    try {
      const res = await postJson<{ field: string; content: string }>(api.port, api.token, '/probe/field/description', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(res.data.content).toBe('Probe description field.');
      expect(res.data.content).not.toContain('Active document');
    } finally {
      await closeServer(api.server);
    }
  });

  it('does not mutate getCurrentData() when probing an external file', async () => {
    const activeData = createSearchFixture();
    const originalDescription = activeData.description;

    const api = await startTestApiServer(activeData);
    try {
      const res = await postJson<{ content: string }>(api.port, api.token, '/probe/field/description', {
        file_path: probeCharxPath,
      });

      // Probe must succeed (route exists and reads external file)
      expect(res.status).toBe(200);
      // Active document must be unchanged after probe
      expect(activeData.description).toBe(originalDescription);
    } finally {
      await closeServer(api.server);
    }
  });

  it('can probe an unopened file even when no editor document is open', async () => {
    const api = await startTestApiServer(null);
    try {
      const res = await postJson<{ field: string; content: string }>(api.port, api.token, '/probe/field/description', {
        file_path: probeCharxPath,
      });
      expect(res.status).toBe(200);
      expect(res.data.field).toBe('description');
      expect(res.data.content).toBe('Probe description field.');
    } finally {
      await closeServer(api.server);
    }
  });
});
