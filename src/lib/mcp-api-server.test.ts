// @vitest-environment node
import * as fs from 'fs';
import * as path from 'path';
import * as nodeCrypto from 'crypto';

import { describe, expect, it } from 'vitest';
import { saveCharx, type CharxData } from '../charx-io';
import {
  MCP_API_FIXED_SKILL_ROOT,
  closeServer,
  createExternalFixtureHelpers,
  createLegacyTestApiServer,
  createSearchFixture,
  getJson,
  openExternalDocumentForTest,
  postJson,
  type McpErrorEnvelope,
  type McpNoOpRecoveryEnvelope,
  type McpRecoveryEnvelope,
  type SearchFixture,
  type TestSessionStatus,
  type TestSessionStatusPayload,
} from './mcp-api-test-harness';
import { expectMcpSuccessArtifacts, useMcpApiTestDir } from './mcp-api-vitest-helpers';
import type { RuntimeMetadata } from './mcp-runtime-contract';

const FIXED_SKILL_ROOT = MCP_API_FIXED_SKILL_ROOT;
const TEST_DIR = useMcpApiTestDir('api-server');
const { createExternalCharxFixture, createExternalRisupFixture } = createExternalFixtureHelpers(TEST_DIR);
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

// ---------------------------------------------------------------------------
// Structured error-envelope tests — risup reorder / formating-order / skills
//
// Task 3: Verify that remaining bare jsonRes({ error }) guards return the
// structured mcpError() envelope (action, error, status, target).
// ---------------------------------------------------------------------------

describe('MCP API structured error envelopes — global guards', () => {
  it('returns a structured error envelope for unauthorized requests', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, 'wrong-token', '/fields');
      expect(res.status).toBe(401);
      expect(res.data).toHaveProperty('action', 'authenticate request');
      expect(res.data).toHaveProperty('status', 401);
      expect(res.data).toHaveProperty('target', 'request:auth');
      expect(res.data).toHaveProperty('error', 'Unauthorized');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope when no file is open', async () => {
    const api = await startTestApiServer(null);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/fields');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'require current document');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'document:current');
      expect(res.data).toHaveProperty('error', 'No file open');
      expect(typeof res.data.suggestion).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('agent eval: allows skill catalog and document reads when no file is open', async () => {
    const api = await startTestApiServer(null, [], FIXED_SKILL_ROOT);
    try {
      const list = await getJson<{ count: number; skills: Array<{ name: string; files: string[] }> }>(
        api.port,
        api.token,
        '/skills',
      );
      expect(list.status).toBe(200);
      expect(list.data.count).toBeGreaterThan(0);
      expect(list.data.skills.some((skill) => skill.name === 'project-workflow')).toBe(true);
      expect(
        list.data.skills.some(
          (skill) =>
            skill.name === 'authoring-media-mix' &&
            skill.files.includes('MEDIA_PROFILES.md') &&
            skill.files.includes('VISUAL_IDENTITY.md') &&
            skill.files.includes('VALIDATION.md'),
        ),
      ).toBe(true);
      expect(
        list.data.skills.some(
          (skill) =>
            skill.name === 'core-craft' &&
            skill.files.includes('USER_POSITION.md') &&
            skill.files.includes('COMEDY_CRAFT.md'),
        ),
      ).toBe(true);
      expect(
        list.data.skills.some(
          (skill) =>
            skill.name === 'authoring-characters' &&
            skill.files.includes('APPEAL_PATTERNS.md') &&
            skill.files.includes('WORKED_EXAMPLE.md'),
        ),
      ).toBe(true);
      expect(
        list.data.skills.some(
          (skill) =>
            skill.name === 'authoring-desire' &&
            skill.files.includes('DESIRE_CATALOG.md') &&
            skill.files.includes('WORKED_EXAMPLE.md'),
        ),
      ).toBe(true);
      expect(
        list.data.skills.some(
          (skill) => skill.name === 'trope-library' && skill.files.includes('SPECIES_ROLE_TROPES.md'),
        ),
      ).toBe(true);

      const detail = await getJson<{ content: string }>(api.port, api.token, '/skills/project-workflow');
      expect(detail.status).toBe(200);
      expect(detail.data.content).toContain('Project Workflow');

      const mediaMix = await getJson<{ content: string }>(api.port, api.token, '/skills/authoring-media-mix');
      expect(mediaMix.status).toBe(200);
      expect(mediaMix.data.content).toContain('Media-Mix IP Authoring');

      const visualIdentity = await getJson<{ content: string }>(
        api.port,
        api.token,
        '/skills/authoring-media-mix/VISUAL_IDENTITY.md',
      );
      expect(visualIdentity.status).toBe(200);
      expect(visualIdentity.data.content).toContain('32px icon');

      const userPosition = await getJson<{ content: string }>(
        api.port,
        api.token,
        '/skills/core-craft/USER_POSITION.md',
      );
      expect(userPosition.status).toBe(200);
      expect(userPosition.data.content).toContain('Compatibility-Bounded Persona');

      const speciesRoles = await getJson<{ content: string }>(
        api.port,
        api.token,
        '/skills/trope-library/SPECIES_ROLE_TROPES.md',
      );
      expect(speciesRoles.status).toBe(200);
      expect(speciesRoles.data.content).toContain('## Vampire');
    } finally {
      await closeServer(api.server);
    }
  });

  it('filters and paginates skills by true content-root scope and keeps read cursors UTF-8 safe', async () => {
    const root = path.join(TEST_DIR, `skill-pagination-${Date.now()}`);
    const productRoot = path.join(root, 'skills');
    const botRoot = path.join(root, 'risu', 'bot', 'skills');
    const writeSkill = (skillRoot: string, name: string, description: string, body: string) => {
      const dir = path.join(skillRoot, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: "${description}"\ntags: [test]\nrelated_tools: [read_skill]\n---\n\n${body}`,
        'utf8',
      );
    };
    writeSkill(productRoot, 'product-only', 'Product workflow', '# Product\n');
    writeSkill(botRoot, 'bot-alpha', 'Bot alpha authoring', '# Alpha\n가나다라마바사아자차카타파하\n');
    writeSkill(botRoot, 'bot-beta', 'Bot beta authoring', '# Beta\nsecond page\n');
    fs.writeFileSync(path.join(botRoot, 'bot-alpha', 'UTF8.md'), '🙂abc', 'utf8');
    const api = await startTestApiServer(null, [], [productRoot, botRoot]);
    try {
      const full = await getJson<{
        count: number;
        skills: Array<{ name: string; scope: string; files: string[] }>;
      }>(api.port, api.token, '/skills');
      expect(full.status).toBe(200);
      expect(full.data.count).toBe(3);
      expect(full.data.skills.find((skill) => skill.name === 'product-only')?.scope).toBe('product');
      expect(full.data.skills.find((skill) => skill.name === 'bot-alpha')?.scope).toBe('bot');
      expect(full.data.skills.every((skill) => Array.isArray(skill.files))).toBe(true);

      const first = await getJson<{
        count: number;
        total_count: number;
        next_cursor: string;
        skills: Array<{ name: string; scope: string; files?: string[] }>;
      }>(api.port, api.token, '/skills?scope=bot&query=authoring&detail=summary&limit=1');
      expect(first.status).toBe(200);
      expect(first.data.count).toBe(1);
      expect(first.data.total_count).toBe(2);
      expect(first.data.skills[0].scope).toBe('bot');
      expect(first.data.skills[0].files).toBeUndefined();
      expect(typeof first.data.next_cursor).toBe('string');

      const second = await getJson<{ next_cursor: null; skills: Array<{ name: string }> }>(
        api.port,
        api.token,
        `/skills?scope=bot&query=authoring&detail=summary&limit=1&cursor=${encodeURIComponent(first.data.next_cursor)}`,
      );
      expect(second.status).toBe(200);
      expect(second.data.skills[0].name).not.toBe(first.data.skills[0].name);
      expect(second.data.next_cursor).toBeNull();

      const changedFilterCursor = await getJson<Record<string, unknown>>(
        api.port,
        api.token,
        `/skills?scope=bot&query=beta&detail=summary&limit=1&cursor=${encodeURIComponent(first.data.next_cursor)}`,
      );
      expect(changedFilterCursor.status).toBe(400);
      expect(changedFilterCursor.data.code).toBe('invalid_request');

      const firstRead = await getJson<{
        content: string;
        returned_bytes: number;
        next_cursor: string;
        truncated: boolean;
      }>(api.port, api.token, '/skills/bot-alpha?max_bytes=30');
      expect(firstRead.status).toBe(200);
      expect(firstRead.data.returned_bytes).toBeLessThanOrEqual(30);
      expect(firstRead.data.content).not.toContain('\uFFFD');
      expect(firstRead.data.truncated).toBe(true);

      const continuedRead = await getJson<{ content: string }>(
        api.port,
        api.token,
        `/skills/bot-alpha?max_bytes=65536&cursor=${encodeURIComponent(firstRead.data.next_cursor)}`,
      );
      expect(continuedRead.status).toBe(200);
      const original = fs.readFileSync(path.join(botRoot, 'bot-alpha', 'SKILL.md'), 'utf8');
      expect(firstRead.data.content + continuedRead.data.content).toBe(original);

      const differentFileCursor = await getJson<Record<string, unknown>>(
        api.port,
        api.token,
        `/skills/bot-beta?max_bytes=30&cursor=${encodeURIComponent(firstRead.data.next_cursor)}`,
      );
      expect(differentFileCursor.status).toBe(400);
      expect(differentFileCursor.data.code).toBe('invalid_request');

      fs.appendFileSync(path.join(botRoot, 'bot-alpha', 'SKILL.md'), '\nchanged', 'utf8');
      const changedContentCursor = await getJson<Record<string, unknown>>(
        api.port,
        api.token,
        `/skills/bot-alpha?max_bytes=30&cursor=${encodeURIComponent(firstRead.data.next_cursor)}`,
      );
      expect(changedContentCursor.status).toBe(400);
      expect(changedContentCursor.data.code).toBe('invalid_request');

      const tinyUtf8Page = await getJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/skills/bot-alpha/UTF8.md?max_bytes=1',
      );
      expect(tinyUtf8Page.status).toBe(400);
      expect(tinyUtf8Page.data.error).toContain('next complete UTF-8 code point');

      const crossCursor = await getJson<Record<string, unknown>>(
        api.port,
        api.token,
        `/skills/bot-alpha?max_bytes=30&cursor=${encodeURIComponent(first.data.next_cursor)}`,
      );
      expect(crossCursor.status).toBe(400);
      expect(crossCursor.data.code).toBe('invalid_request');
    } finally {
      await closeServer(api.server);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows GET /references without a main document and includes fileType metadata', async () => {
    const api = await startTestApiServer(null, [
      {
        fileName: 'preset.risup',
        data: {
          _fileType: 'risup',
          mainPrompt: 'Preset main prompt',
          promptTemplate: '[{"type":"plain","text":"hi"}]',
          formatingOrder: '["main"]',
        },
      },
    ]);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/references');
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.references).toEqual([
        expect.objectContaining({
          index: 0,
          id: 'preset.risup',
          fileName: 'preset.risup',
          fileType: 'risup',
        }),
      ]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('supports batch/search/range reads against reference text surfaces without a main document', async () => {
    const api = await startTestApiServer(null, [
      {
        fileName: 'bot.charx',
        data: {
          description: 'needle in the reference haystack',
          firstMessage: 'Hello reference world',
          alternateGreetings: ['hello reference'],
          triggerScripts: [{ comment: 'ref trigger', type: 'input', conditions: [], effect: [] }],
        },
      },
    ]);
    try {
      const batch = await postJson<Record<string, unknown>>(api.port, api.token, '/reference/0/field/batch', {
        fields: ['description', 'alternateGreetings', 'triggerScripts'],
      });
      expect(batch.status).toBe(200);
      expect(batch.data.fields).toEqual([
        expect.objectContaining({ field: 'description', content: 'needle in the reference haystack' }),
        expect.objectContaining({ field: 'alternateGreetings', type: 'array', content: ['hello reference'] }),
        expect.objectContaining({ field: 'triggerScripts' }),
      ]);

      const search = await postJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/reference/0/field/description/search',
        {
          query: 'needle',
        },
      );
      expect(search.status).toBe(200);
      expect(search.data.field).toBe('description');
      expect(search.data.totalMatches).toBe(1);

      const range = await getJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/reference/0/field/firstMessage/range?offset=6&length=9',
      );
      expect(range.status).toBe(200);
      expect(range.data.field).toBe('firstMessage');
      expect(range.data.content).toBe('reference');
      expect(range.data.hasMore).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('supports structured greeting and trigger reads against references without a main document', async () => {
    const api = await startTestApiServer(null, [
      {
        fileName: 'bot.charx',
        data: {
          alternateGreetings: ['hello reference'],
          groupOnlyGreetings: ['group-only reference'],
          triggerScripts: [
            {
              comment: 'ref trigger',
              type: 'input',
              conditions: [{ type: 'match' }],
              effect: [{ type: 'reply' }],
              lowLevelAccess: true,
            },
          ],
        },
      },
    ]);
    try {
      const alternateList = await getJson<Record<string, unknown>>(
        api.port,
        api.token,
        '/reference/0/greetings/alternate',
      );
      expect(alternateList.status).toBe(200);
      expect(alternateList.data.field).toBe('alternateGreetings');
      expect(alternateList.data.count).toBe(1);

      const groupEntry = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/greeting/group/0');
      expect(groupEntry.status).toBe(400);
      expect(groupEntry.data.error).toContain('숨겨집니다');

      const triggerList = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/triggers');
      expect(triggerList.status).toBe(200);
      expect(triggerList.data.count).toBe(1);
      expect(triggerList.data.items).toEqual([
        expect.objectContaining({
          index: 0,
          comment: 'ref trigger',
          type: 'input',
          conditionCount: 1,
          effectCount: 1,
          lowLevelAccess: true,
        }),
      ]);

      const triggerEntry = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/trigger/0');
      expect(triggerEntry.status).toBe(200);
      expect(triggerEntry.data.triggerIndex).toBe(0);
      expect(triggerEntry.data.trigger).toEqual(
        expect.objectContaining({
          comment: 'ref trigger',
          type: 'input',
        }),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('reads structured risup prompt surfaces from references', async () => {
    const api = await startTestApiServer(null, [
      {
        fileName: 'preset.risup',
        data: {
          _fileType: 'risup',
          promptTemplate: JSON.stringify([
            { type: 'plain', text: 'Hello preset', role: 'system' },
            { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
          ]),
          formatingOrder: JSON.stringify(['main', 'description']),
        },
      },
    ]);
    try {
      const list = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/risup/prompt-items');
      expect(list.status).toBe(200);
      expect(list.data.count).toBe(2);
      expect(list.data.items).toEqual([
        expect.objectContaining({ index: 0, type: 'plain', supported: true }),
        expect.objectContaining({ index: 1, type: 'chat', supported: true }),
      ]);

      const item = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/risup/prompt-item/0');
      expect(item.status).toBe(200);
      expect(item.data.itemIndex).toBe(0);
      expect(item.data.type).toBe('plain');

      const order = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/risup/formating-order');
      expect(order.status).toBe(200);
      expect(order.data.items).toEqual([
        { index: 0, token: 'main', known: true },
        { index: 1, token: 'description', known: true },
      ]);
      expect(order.data.warnings).toEqual(['Dangling formatingOrder token: "description" has no matching prompt item']);
    } finally {
      await closeServer(api.server);
    }
  });
});

// ---------------------------------------------------------------------------
// External file probe routes (TDD – tests written before production code)
// ---------------------------------------------------------------------------

describe('MCP API open-file route', () => {
  const OPEN_FILE_DIR = path.join(TEST_DIR, 'open-file-fixtures');

  function openRouteCardData(): CharxData {
    return {
      name: 'Opened Via MCP',
      description: 'Opened through open-file route.',
      personality: 'Calm',
      scenario: 'Open route room',
      creatorcomment: 'Created for open-file tests',
      tags: ['open-file'],
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
      firstMessage: 'Hello from open_file.',
      alternateGreetings: [],
      groupOnlyGreetings: [],
      globalNote: '',
      css: '',
      defaultVariables: '',
      lua: '',
      triggerScripts: [],
      lorebook: [],
      regex: [],
      assets: [],
      xMeta: {},
      risumAssets: [],
      cardAssets: [],
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

  async function writeOpenFixture(filePath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    saveCharx(filePath, openRouteCardData());
  }

  it('opens an external file even when no editor document is currently open', async () => {
    const filePath = path.join(OPEN_FILE_DIR, 'open-target.charx');
    await writeOpenFixture(filePath);
    const api = await startTestApiServer(null);
    try {
      const res = await postJson<{
        file_path?: string;
        file_type?: string;
        name?: string;
        switched?: boolean;
      }>(api.port, api.token, '/open-file', {
        file_path: filePath,
      });
      expect(res.status).toBe(200);
      expect(res.data.file_path).toBe(filePath);
      expect(res.data.file_type).toBe('charx');
      expect(res.data.name).toBe('Opened Via MCP');
      expect(res.data.switched).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('passes save_current through to the renderer-open dependency', async () => {
    const filePath = path.join(OPEN_FILE_DIR, 'save-current.charx');
    await writeOpenFixture(filePath);
    let capturedSaveCurrent: boolean | null = null;
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      requestRendererOpenFile: async (request) => {
        capturedSaveCurrent = request.saveCurrent;
        return {
          success: true,
          filePath: request.filePath,
          fileType: request.fileType,
          name: 'Opened Via MCP',
        };
      },
    });
    try {
      const res = await postJson<{ save_current?: boolean }>(api.port, api.token, '/open-file', {
        file_path: filePath,
        save_current: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.save_current).toBe(true);
      expect(capturedSaveCurrent).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured 409 envelope when renderer-side document replacement is canceled', async () => {
    const filePath = path.join(OPEN_FILE_DIR, 'cancelled.charx');
    await writeOpenFixture(filePath);
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      requestRendererOpenFile: async () => ({
        success: false,
        canceled: true,
        error: 'Document replacement was canceled or the current file could not be saved.',
      }),
    });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/open-file', {
        file_path: filePath,
      });
      expect(res.status).toBe(409);
      expect(res.data).toHaveProperty('action', 'open file');
      expect(res.data).toHaveProperty('status', 409);
      expect(res.data).toHaveProperty('target', 'open:file');
      expect(res.data.error).toContain('canceled');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects concurrent open-file requests with a structured 409 envelope', async () => {
    const filePath = path.join(OPEN_FILE_DIR, 'concurrent.charx');
    await writeOpenFixture(filePath);
    let releaseFirst!: () => void;
    const firstRequestGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      requestRendererOpenFile: async (request) => {
        await firstRequestGate;
        return {
          success: true,
          filePath: request.filePath,
          fileType: request.fileType,
          name: 'Opened Via MCP',
        };
      },
    });
    try {
      const firstRequest = postJson(api.port, api.token, '/open-file', {
        file_path: filePath,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const secondRes = await postJson<McpErrorEnvelope>(api.port, api.token, '/open-file', {
        file_path: filePath,
      });
      expect(secondRes.status).toBe(409);
      expect(secondRes.data).toHaveProperty('action', 'open file');
      expect(secondRes.data).toHaveProperty('target', 'open:file');
      expect(secondRes.data.error).toContain('already in progress');
      releaseFirst();
      const firstRes = await firstRequest;
      expect(firstRes.status).toBe(200);
    } finally {
      await closeServer(api.server);
    }
  });

  it('agent eval: no-file-open guard recovers after open-file and returns a bounded success envelope', async () => {
    const filePath = path.join(OPEN_FILE_DIR, 'agent-eval-recovery.charx');
    await writeOpenFixture(filePath);
    const api = await startTestApiServer(null);
    try {
      const blocked = await getJson<McpErrorEnvelope>(api.port, api.token, '/fields');
      expect(blocked.status).toBe(400);
      expect(blocked.data.target).toBe('document:current');
      expect(blocked.data.retryable).toBe(false);
      expect(blocked.data.next_actions).toEqual(['open_file', 'list_references', 'session_status']);

      const opened = await postJson<Record<string, unknown>>(api.port, api.token, '/open-file', {
        file_path: filePath,
      });
      expect(opened.status).toBe(200);

      const recovered = await getJson<Record<string, unknown>>(api.port, api.token, '/fields');
      expect(recovered.status).toBe(200);
      expect(Array.isArray(recovered.data.fields)).toBe(true);
      expect((recovered.data.fields as unknown[]).length).toBeGreaterThan(0);
      expect((recovered.data.artifacts as Record<string, unknown>).byte_size).toEqual(expect.any(Number));
    } finally {
      await closeServer(api.server);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Success envelope integration tests
// ────────────────────────────────────────────────────────────────────────────

describe('MCP API success response envelope', () => {
  /**
   * Verify that envelope fields (status, summary, next_actions, artifacts)
   * are present on migrated success responses, without removing any
   * existing top-level fields.
   */

  it('list_fields response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/fields');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(Array.isArray(res.data.fields)).toBe(true);
      expect(typeof res.data.fileType).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_field response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.field).toBe('description');
      expect(typeof res.data.content).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_field response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description', {
        content: 'Updated description for envelope test.',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.field).toBe('description');
      expect(typeof res.data.size).toBe('number');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect((res.data.summary as string).includes('description')).toBe(true);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expect((res.data.next_actions as string[]).length).toBeGreaterThan(0);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_field_batch response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/batch', {
        fields: ['name', 'description'],
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.fields)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('search_in_field response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/search', {
        query: 'Alpha',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.field).toBe('description');
      expect(typeof res.data.totalMatches).toBe('number');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect((res.data.summary as string).includes('match')).toBe(true);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('list_lorebook response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.entries)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_lorebook response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook/0');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.index).toBe(0);
      expect(typeof res.data.entry).toBe('object');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('snapshot_field response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/snapshot', {});
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.snapshotId).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('list_snapshots response includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description/snapshots');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.field).toBe('description');
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.snapshots)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status response includes session metadata and snapshot totals', async () => {
    const fixture = { ...createSearchFixture(), name: 'Status Card' };
    const api = await startTestApiServer(fixture, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: 'C:\\cards\\status-card.charx',
        currentFileType: 'charx',
        lastRestored: {
          appVersion: '0.39.5',
          autosavePath: 'C:\\autosave\\status-card_autosave_2.charx',
          dirtyFields: ['name'],
          savedAt: '2026-04-10T00:00:00.000Z',
          sourceFilePath: 'C:\\cards\\status-card.charx',
          sourceFileType: 'charx',
        },
        pendingRecovery: {
          autosavePath: 'C:\\autosave\\status-card_autosave_3.charx',
          dirtyFields: ['description'],
          sourceFilePath: 'C:\\cards\\status-card.charx',
          staleWarning: null,
        },
        renderer: {
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: true,
          autosaveInterval: 120000,
          dirtyFieldCount: 2,
          dirtyFields: ['description', 'firstMessage'],
          documentSwitchInProgress: false,
          hasUnsavedChanges: true,
        },
      }),
    });
    try {
      await postJson(api.port, api.token, '/field/description/snapshot', {});

      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.loaded).toBe(true);
      expect(res.data.document).toEqual({
        filePath: 'C:\\cards\\status-card.charx',
        fileType: 'charx',
        name: 'Status Card',
      });
      expect(res.data.renderer).toEqual({
        autosaveDir: 'C:\\autosave',
        autosaveEnabled: true,
        autosaveInterval: 120000,
        dirtyFieldCount: 2,
        dirtyFields: ['description', 'firstMessage'],
        documentSwitchInProgress: false,
        hasUnsavedChanges: true,
      });
      expect(res.data.recovery).toEqual({
        lastRestored: {
          appVersion: '0.39.5',
          autosavePath: 'C:\\autosave\\status-card_autosave_2.charx',
          dirtyFields: ['name'],
          savedAt: '2026-04-10T00:00:00.000Z',
          sourceFilePath: 'C:\\cards\\status-card.charx',
          sourceFileType: 'charx',
        },
        pendingRecovery: {
          autosavePath: 'C:\\autosave\\status-card_autosave_3.charx',
          dirtyFields: ['description'],
          sourceFilePath: 'C:\\cards\\status-card.charx',
          staleWarning: null,
        },
      });
      expect(res.data.snapshots).toEqual({
        byField: [{ count: 1, field: 'description' }],
        totalFields: 1,
        totalSnapshots: 1,
      });
      expect(res.data.surfaceSummary).toEqual({
        lorebookCount: 2,
        regexCount: 0,
        alternateGreetingCount: 2,
        triggerCount: 0,
        luaSectionCount: 0,
        cssSectionCount: 0,
        risupPromptItemCount: null,
        risupPromptState: null,
      });
      expect(res.data.hiddenFieldWarnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'groupOnlyGreetings', count: 1 })]),
      );
      expect(res.data.references).toEqual({
        count: 0,
        files: [],
        manifestStatus: null,
      });
      expect(res.data.integrity).toEqual(
        expect.objectContaining({
          dirty: expect.objectContaining({
            known: true,
            hasUnsavedChanges: true,
            dirtyFieldCount: 2,
            dirtyFields: ['description', 'firstMessage'],
          }),
          autosave: expect.objectContaining({
            available: true,
            enabled: true,
            interval: 120000,
            dir: 'C:\\autosave',
          }),
          recovery: expect.objectContaining({
            lastRestoredAvailable: true,
            pendingRecoveryAvailable: true,
          }),
          referenceManifest: {
            available: false,
            status: null,
            unavailableReason: 'reference_manifest_status_unavailable',
          },
        }),
      );
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status exposes runtime metadata and flags version skew in summary artifacts', async () => {
    const runtime: RuntimeMetadata = {
      serverVersion: '0.69.1',
      appVersion: '0.69.2',
      packageVersion: '0.69.2',
      buildTime: null,
      commit: null,
      runtimeMode: 'app-backed',
      allowWrites: true,
      userDataPath: 'C:\\Users\\test\\.risutoki\\mcp-standalone',
      skew: {
        detected: true,
        warnings: ['serverVersion (0.69.1) differs from appVersion (0.69.2)'],
      },
    };
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      getRuntimeInfo: () => runtime,
    });
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.runtime).toEqual(runtime);
      expect(res.data.summary).toContain('Runtime skew detected');
      expect(res.data.artifacts).toEqual(
        expect.objectContaining({
          runtimeMode: 'app-backed',
          allowWrites: true,
          userDataPath: 'C:\\Users\\test\\.risutoki\\mcp-standalone',
          runtimeSkewDetected: true,
          runtimeSkewWarnings: runtime.skew.warnings,
        }),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status remains available when no document is open', async () => {
    const api = await startTestApiServer(null, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: null,
        currentFileType: null,
        lastRestored: null,
        pendingRecovery: null,
        renderer: {
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: false,
          autosaveInterval: 120000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        },
      }),
    });
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.loaded).toBe(false);
      expect(res.data.document).toEqual({
        filePath: null,
        fileType: null,
        name: null,
      });
      expect(res.data.references).toEqual({
        count: 0,
        files: [],
        manifestStatus: null,
      });
      expect(res.data.integrity).toEqual(
        expect.objectContaining({
          activeFile: expect.objectContaining({
            path: null,
            fileType: null,
            exists: null,
            mtimeMs: null,
            size: null,
            unavailableReason: 'no_file_path',
          }),
          dirty: expect.objectContaining({
            known: true,
            hasUnsavedChanges: false,
          }),
        }),
      );
      expect(res.data.renderer).toEqual({
        autosaveDir: 'C:\\autosave',
        autosaveEnabled: false,
        autosaveInterval: 120000,
        dirtyFieldCount: 0,
        dirtyFields: [],
        documentSwitchInProgress: false,
        hasUnsavedChanges: false,
      });
      expect(res.data.recovery).toEqual({
        lastRestored: null,
        pendingRecovery: null,
      });
      expect(res.data.snapshots).toEqual({
        byField: [],
        totalFields: 0,
        totalSnapshots: 0,
      });
      expect(res.data.surfaceSummary).toBeNull();
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status integrity reports stat metadata for an open file', async () => {
    const fixture = createExternalCharxFixture({ name: 'Integrity Card' });
    const data = openExternalDocumentForTest(fixture.filePath);
    const expectedStat = fs.statSync(fixture.filePath);
    const api = await startTestApiServer(data, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: fixture.filePath,
        currentFileType: 'charx',
        lastRestored: null,
        pendingRecovery: null,
        renderer: {
          autosaveDir: path.join(TEST_DIR, 'autosave'),
          autosaveEnabled: true,
          autosaveInterval: 60000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        },
      }),
    });
    try {
      const res = await getJson<TestSessionStatusPayload>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.document).toEqual({
        filePath: fixture.filePath,
        fileType: 'charx',
        name: 'Integrity Card',
      });
      expect(res.data.integrity.activeFile).toEqual(
        expect.objectContaining({
          path: fixture.filePath,
          fileType: 'charx',
          exists: true,
          mtimeMs: expectedStat.mtimeMs,
          size: expectedStat.size,
          unavailableReason: null,
          matchesLoadedBaseline: null,
          driftWarning: null,
        }),
      );
      expect(res.data.integrity.save).toEqual({
        lastSavedAt: new Date(expectedStat.mtimeMs).toISOString(),
        mtimeMs: expectedStat.mtimeMs,
        unavailableReason: null,
      });
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status integrity warns when the active file changed on disk after open', async () => {
    const fixture = createExternalCharxFixture({ name: 'Drift Card' });
    const data = openExternalDocumentForTest(fixture.filePath);
    const openedStat = fs.statSync(fixture.filePath);
    const openedHash = nodeCrypto.createHash('sha256').update(fs.readFileSync(fixture.filePath)).digest('hex');
    fs.appendFileSync(fixture.filePath, Buffer.from('external-change'));
    const currentStat = fs.statSync(fixture.filePath);
    const api = await startTestApiServer(data, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: fixture.filePath,
        currentFileType: 'charx',
        activeFileBaseline: {
          path: fixture.filePath,
          mtimeMs: openedStat.mtimeMs,
          size: openedStat.size,
          sha256: openedHash,
          capturedAt: new Date(openedStat.mtimeMs).toISOString(),
        },
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      }),
    });
    try {
      const res = await getJson<TestSessionStatusPayload>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.integrity.activeFile).toEqual(
        expect.objectContaining({
          path: fixture.filePath,
          exists: true,
          size: currentStat.size,
          matchesLoadedBaseline: false,
          driftWarning: 'Active document file has changed on disk since it was opened or last saved.',
        }),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status integrity reports missing active file with a clear reason', async () => {
    const missingPath = path.join(TEST_DIR, 'missing-integrity.charx');
    const api = await startTestApiServer({ ...createSearchFixture(), name: 'Missing Integrity Card' }, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: missingPath,
        currentFileType: 'charx',
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      }),
    });
    try {
      const res = await getJson<TestSessionStatusPayload>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.integrity.activeFile).toEqual(
        expect.objectContaining({
          path: missingPath,
          fileType: 'charx',
          exists: false,
          mtimeMs: null,
          size: null,
          unavailableReason: 'file_missing',
        }),
      );
      expect(res.data.integrity.dirty).toEqual({
        known: false,
        hasUnsavedChanges: null,
        dirtyFieldCount: null,
        dirtyFields: [],
        unavailableReason: 'renderer_status_unavailable',
      });
    } finally {
      await closeServer(api.server);
    }
  });

  it('charx export compatibility route validates active in-memory export data', async () => {
    const fixture = createExternalCharxFixture({ name: 'Export Compatible Card' });
    const data = openExternalDocumentForTest(fixture.filePath);
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/charx/export-compatibility');

      expect(res.status).toBe(200);
      expect(res.data.ok).toBe(true);
      expect(res.data.issueCount).toBe(0);
      expect(res.data.metadata).toEqual(
        expect.objectContaining({
          ableFlagSemantics: expect.stringContaining('ableFlag=false'),
        }),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('charx export compatibility route preserves asset bytes after cloning current data', async () => {
    const fixture = createExternalCharxFixture({
      name: 'Export Asset Buffer Card',
      assets: [{ path: 'assets/icon/image/main.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }],
      cardAssets: [{ type: 'icon', uri: 'embeded://assets/icon/image/main.png', name: 'main', ext: 'png' }],
    });
    const data = openExternalDocumentForTest(fixture.filePath);
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/charx/export-compatibility');

      expect(res.status).toBe(200);
      expect(res.data.ok).toBe(true);
      expect(res.data.issueCount).toBe(0);
      expect(res.data.metadata).toEqual(
        expect.objectContaining({
          assets: expect.objectContaining({ zipCount: 1, cardReferenceCount: 1 }),
        }),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('charx export compatibility route reports upload-risk asset issues', async () => {
    const fixture = createExternalCharxFixture({ name: 'Export Asset Issue Card' });
    const data = openExternalDocumentForTest(fixture.filePath);
    data.assets = [{ path: 'assets/icon/empty.png', data: Buffer.alloc(0) }];
    data.cardAssets = [{ type: 'icon', uri: 'embeded://assets/icon/empty.png', name: 'main', ext: 'png' }];
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/charx/export-compatibility');

      expect(res.status).toBe(200);
      expect(res.data.ok).toBe(false);
      expect(res.data.counts).toEqual(expect.objectContaining({ 'upload-risk': 1 }));
      expect(res.data.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'zero-byte-asset', category: 'upload-risk' })]),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status integrity reports reference file stats and manifest status', async () => {
    const refFixture = createExternalRisupFixture();
    const refStat = fs.statSync(refFixture.filePath);
    const api = await startTestApiServer(
      null,
      [
        {
          id: 'preset-ref',
          fileName: path.basename(refFixture.filePath),
          filePath: refFixture.filePath,
          data: openExternalDocumentForTest(refFixture.filePath),
        },
        {
          id: 'missing-ref',
          fileName: 'missing-ref.charx',
          filePath: path.join(TEST_DIR, 'missing-ref.charx'),
          data: createSearchFixture(),
        },
      ],
      undefined,
      {
        getSessionStatus: () => ({
          currentFilePath: null,
          currentFileType: null,
          lastRestored: null,
          pendingRecovery: null,
          renderer: null,
          referenceManifestStatus: {
            level: 'warn',
            message: 'Manifest includes unavailable references.',
            detail: 'One reference file could not be restored.',
          },
        }),
      },
    );
    try {
      const res = await getJson<TestSessionStatusPayload>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.references.manifestStatus).toEqual({
        level: 'warn',
        message: 'Manifest includes unavailable references.',
        detail: 'One reference file could not be restored.',
      });
      expect(res.data.references.files).toEqual([
        expect.objectContaining({
          index: 0,
          id: 'preset-ref',
          filePath: refFixture.filePath,
          fileType: 'risup',
          exists: true,
          mtimeMs: refStat.mtimeMs,
          size: refStat.size,
          unavailableReason: null,
        }),
        expect.objectContaining({
          index: 1,
          id: 'missing-ref',
          filePath: path.join(TEST_DIR, 'missing-ref.charx'),
          fileType: 'charx',
          exists: false,
          mtimeMs: null,
          size: null,
          unavailableReason: 'file_missing',
        }),
      ]);
      expect(res.data.integrity.referenceManifest).toEqual({
        available: true,
        status: {
          level: 'warn',
          message: 'Manifest includes unavailable references.',
          detail: 'One reference file could not be restored.',
        },
        unavailableReason: null,
      });
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status remains available when renderer session state times out', async () => {
    const api = await startTestApiServer({ ...createSearchFixture(), name: 'Timeout Card' }, [], undefined, {
      getSessionStatus: () => new Promise<TestSessionStatus>(() => {}),
    });
    try {
      const startedAt = Date.now();
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');

      expect(Date.now() - startedAt).toBeLessThan(2000);
      expect(res.status).toBe(200);
      expect(res.data.loaded).toBe(true);
      expect(res.data.document).toEqual({
        filePath: null,
        fileType: 'charx',
        name: 'Timeout Card',
      });
      expect(res.data.renderer).toBeNull();
      expect(res.data.recovery).toEqual({
        lastRestored: null,
        pendingRecovery: null,
      });
    } finally {
      await closeServer(api.server);
    }
  });

  it('session_status surfaceSummary reports risup prompt counts for risup documents', async () => {
    const fixture: SearchFixture = {
      _fileType: 'risup',
      name: 'Status Preset',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello', role: 'system' },
        { type: 'persona', text: 'Persona block' },
      ]),
      formatingOrder: '["main"]',
      alternateGreetings: ['Alt greeting'],
      groupOnlyGreetings: [],
      lorebook: [],
      regex: [{ comment: 'status-regex', type: 'editoutput', in: 'foo', out: 'bar' }],
      triggerScripts: [{ comment: 'status-trigger', type: 'start', conditions: [], effect: [], lowLevelAccess: false }],
      lua: '---@name main\nprint("hello")',
      css: '/* ===== main ===== */\nbody { color: red; }',
    };
    const api = await startTestApiServer(fixture, [], undefined, {
      getSessionStatus: () => ({
        currentFilePath: 'C:\\presets\\status-preset.risup',
        currentFileType: 'risup',
        lastRestored: null,
        pendingRecovery: null,
        renderer: null,
      }),
      parseLuaSections: (lua: string) => (lua.trim() ? [{ name: 'main', content: lua.trim() }] : []),
      parseCssSections: (css: string) =>
        css.trim()
          ? { sections: [{ name: 'main', content: css.trim() }], prefix: '', suffix: '' }
          : { sections: [], prefix: '', suffix: '' },
    });
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');

      expect(res.status).toBe(200);
      expect(res.data.loaded).toBe(true);
      expect(res.data.document).toEqual({
        filePath: 'C:\\presets\\status-preset.risup',
        fileType: 'risup',
        name: 'Status Preset',
      });
      expect(res.data.surfaceSummary).toEqual({
        lorebookCount: 0,
        regexCount: 1,
        alternateGreetingCount: 1,
        triggerCount: 1,
        luaSectionCount: 1,
        cssSectionCount: 1,
        risupPromptItemCount: 2,
        risupPromptState: 'valid',
      });
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  describe('agent eval: session-aware mutation workflows', () => {
    it('session_status -> snapshot_field -> session_status updates snapshot totals', async () => {
      const sessionStatus: TestSessionStatus = {
        currentFilePath: 'C:\\cards\\agent-eval.charx',
        currentFileType: 'charx',
        lastRestored: null,
        pendingRecovery: null,
        renderer: {
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: true,
          autosaveInterval: 120000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        },
      };
      const api = await startTestApiServer({ ...createSearchFixture(), name: 'Agent Eval Card' }, [], undefined, {
        getSessionStatus: () => sessionStatus,
      });
      try {
        const before = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(before.status).toBe(200);
        expect(before.data.loaded).toBe(true);
        expect(before.data.snapshots).toEqual({
          byField: [],
          totalFields: 0,
          totalSnapshots: 0,
        });
        expectMcpSuccessArtifacts(before.data);

        const snapshot = await postJson<Record<string, unknown>>(
          api.port,
          api.token,
          '/field/description/snapshot',
          {},
        );
        expect(snapshot.status).toBe(200);
        expectMcpSuccessArtifacts(snapshot.data);

        const after = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(after.status).toBe(200);
        expect(after.data.snapshots).toEqual({
          byField: [{ count: 1, field: 'description' }],
          totalFields: 1,
          totalSnapshots: 1,
        });
        expectMcpSuccessArtifacts(after.data);
      } finally {
        await closeServer(api.server);
      }
    });

    it('session_status -> write_field -> session_status reflects dirty renderer state', async () => {
      const sessionStatus: TestSessionStatus = {
        currentFilePath: 'C:\\cards\\agent-eval.charx',
        currentFileType: 'charx',
        lastRestored: null,
        pendingRecovery: null,
        renderer: {
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: true,
          autosaveInterval: 120000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        },
      };
      const api = await startTestApiServer({ ...createSearchFixture(), name: 'Agent Eval Card' }, [], undefined, {
        getSessionStatus: () => sessionStatus,
        broadcastToAll: (channel: string, ...args: unknown[]) => {
          if (channel !== 'data-updated' || !sessionStatus.renderer) return;
          const [fieldName] = args;
          if (typeof fieldName !== 'string') return;
          const dirtyFields = new Set(sessionStatus.renderer.dirtyFields);
          dirtyFields.add(fieldName);
          sessionStatus.renderer.dirtyFields = [...dirtyFields].sort();
          sessionStatus.renderer.dirtyFieldCount = sessionStatus.renderer.dirtyFields.length;
          sessionStatus.renderer.hasUnsavedChanges = sessionStatus.renderer.dirtyFieldCount > 0;
        },
      });
      try {
        const before = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(before.status).toBe(200);
        expect(before.data.renderer).toEqual({
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: true,
          autosaveInterval: 120000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        });

        const write = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description', {
          content: 'Agent-updated description.',
        });
        expect(write.status).toBe(200);
        expectMcpSuccessArtifacts(write.data);

        const after = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(after.status).toBe(200);
        expect(after.data.renderer).toEqual({
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: true,
          autosaveInterval: 120000,
          dirtyFieldCount: 1,
          dirtyFields: ['description'],
          documentSwitchInProgress: false,
          hasUnsavedChanges: true,
        });
        expectMcpSuccessArtifacts(after.data);
      } finally {
        await closeServer(api.server);
      }
    });

    it('session_status -> open-file -> session_status reports the loaded document', async () => {
      const filePath = path.join(TEST_DIR, 'agent-eval-status-open.charx');
      const sessionStatus: TestSessionStatus = {
        currentFilePath: null,
        currentFileType: null,
        lastRestored: null,
        pendingRecovery: null,
        renderer: {
          autosaveDir: 'C:\\autosave',
          autosaveEnabled: false,
          autosaveInterval: 120000,
          dirtyFieldCount: 0,
          dirtyFields: [],
          documentSwitchInProgress: false,
          hasUnsavedChanges: false,
        },
      };
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      saveCharx(filePath, {
        name: 'Opened Via Agent Eval',
        description: 'Loaded after session_status inspection.',
        personality: 'Calm',
        scenario: 'Agent eval route',
        creatorcomment: '',
        tags: [],
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
        firstMessage: 'Hello.',
        alternateGreetings: [],
        groupOnlyGreetings: [],
        globalNote: '',
        css: '',
        defaultVariables: '',
        lua: '',
        triggerScripts: [],
        lorebook: [],
        regex: [],
        assets: [],
        xMeta: {},
        risumAssets: [],
        cardAssets: [],
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
      });
      const api = await startTestApiServer(null, [], undefined, {
        getSessionStatus: () => sessionStatus,
      });
      try {
        const before = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(before.status).toBe(200);
        expect(before.data.loaded).toBe(false);

        const opened = await postJson<Record<string, unknown>>(api.port, api.token, '/open-file', {
          file_path: filePath,
        });
        expect(opened.status).toBe(200);
        expectMcpSuccessArtifacts(opened.data);

        sessionStatus.currentFilePath = filePath;
        sessionStatus.currentFileType = 'charx';

        const after = await getJson<Record<string, unknown>>(api.port, api.token, '/session/status');
        expect(after.status).toBe(200);
        expect(after.data.loaded).toBe(true);
        expect(after.data.document).toEqual({
          filePath,
          fileType: 'charx',
          name: 'Opened Via Agent Eval',
        });
        expectMcpSuccessArtifacts(after.data);
      } finally {
        await closeServer(api.server);
      }
    });
  });

  describe('agent eval: cross-family orchestration flows', () => {
    it('read_field -> write_field -> read_field roundtrips field content', async () => {
      const api = await startTestApiServer(createSearchFixture());
      try {
        const firstRead = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description');
        expect(firstRead.status).toBe(200);
        expect(firstRead.data.content).toBe('Field Alpha is searchable.');
        expectMcpSuccessArtifacts(firstRead.data);

        const write = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description', {
          content: 'Field Alpha was updated by an agent eval.',
        });
        expect(write.status).toBe(200);
        expect(write.data.success).toBe(true);
        expectMcpSuccessArtifacts(write.data);

        const secondRead = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description');
        expect(secondRead.status).toBe(200);
        expect(secondRead.data.content).toBe('Field Alpha was updated by an agent eval.');
        expectMcpSuccessArtifacts(secondRead.data);
      } finally {
        await closeServer(api.server);
      }
    });

    it('probe_field -> open-file -> read_field transitions from unopened to active document', async () => {
      const filePath = path.join(TEST_DIR, 'agent-eval-probe-open.charx');
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      saveCharx(filePath, {
        name: 'Probe/Open Eval',
        description: 'Probe first, then open, then read.',
        personality: 'Calm',
        scenario: 'Probe route',
        creatorcomment: '',
        tags: [],
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
        firstMessage: 'Hello.',
        alternateGreetings: [],
        groupOnlyGreetings: [],
        globalNote: '',
        css: '',
        defaultVariables: '',
        lua: '',
        triggerScripts: [],
        lorebook: [],
        regex: [],
        assets: [],
        xMeta: {},
        risumAssets: [],
        cardAssets: [],
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
      });
      const api = await startTestApiServer(null);
      try {
        const probe = await postJson<Record<string, unknown>>(api.port, api.token, '/probe/field/description', {
          file_path: filePath,
        });
        expect(probe.status).toBe(200);
        expect(probe.data.content).toBe('Probe first, then open, then read.');
        expectMcpSuccessArtifacts(probe.data);

        const open = await postJson<Record<string, unknown>>(api.port, api.token, '/open-file', {
          file_path: filePath,
        });
        expect(open.status).toBe(200);
        expect(open.data.file_path).toBe(filePath);
        expectMcpSuccessArtifacts(open.data);

        const read = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description');
        expect(read.status).toBe(200);
        expect(read.data.content).toBe('Probe first, then open, then read.');
        expectMcpSuccessArtifacts(read.data);
      } finally {
        await closeServer(api.server);
      }
    });

    it('list_lorebook -> write_lorebook -> read_lorebook roundtrips lorebook content', async () => {
      const api = await startTestApiServer(createSearchFixture());
      try {
        const listed = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook');
        expect(listed.status).toBe(200);
        expect(listed.data.count).toBe(2);
        expectMcpSuccessArtifacts(listed.data);

        const written = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/0', {
          content: 'Lore alpha entry updated by agent eval.',
        });
        expect(written.status).toBe(200);
        expect(written.data.success).toBe(true);
        expectMcpSuccessArtifacts(written.data);

        const read = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook/0');
        expect(read.status).toBe(200);
        expect((read.data.entry as Record<string, unknown>).content).toBe('Lore alpha entry updated by agent eval.');
        expectMcpSuccessArtifacts(read.data);
      } finally {
        await closeServer(api.server);
      }
    });

    it('facade baseline: active/external/reference routing stays explicit and byte-measurable', async () => {
      const externalFixture = createExternalCharxFixture();
      const api = await startTestApiServer(createSearchFixture(), [
        {
          fileName: 'reference.charx',
          data: {
            description: 'Reference description for facade baseline.',
            firstMessage: 'Reference hello.',
          },
        },
      ]);
      const workflow: string[] = [];
      try {
        workflow.push('read_field');
        const activeRead = await getJson<Record<string, unknown>>(api.port, api.token, '/field/description');
        expect(activeRead.status).toBe(200);
        expect(activeRead.data.content).toBe('Field Alpha is searchable.');

        workflow.push('inspect_external_file');
        const externalInspect = await postJson<Record<string, unknown>>(api.port, api.token, '/external/inspect', {
          file_path: externalFixture.filePath,
        });
        expect(externalInspect.status).toBe(200);
        expect(externalInspect.data.name).toBe('External Char');

        workflow.push('external_search_in_field');
        const externalSearch = await postJson<Record<string, unknown>>(
          api.port,
          api.token,
          '/external/field/description/search',
          {
            file_path: externalFixture.filePath,
            query: 'External',
          },
        );
        expect(externalSearch.status).toBe(200);
        expect(externalSearch.data.totalMatches).toBe(1);

        workflow.push('list_references');
        const references = await getJson<Record<string, unknown>>(api.port, api.token, '/references');
        expect(references.status).toBe(200);
        expect(references.data.count).toBe(1);

        workflow.push('read_reference_field');
        const referenceRead = await getJson<Record<string, unknown>>(api.port, api.token, '/reference/0/description');
        expect(referenceRead.status).toBe(200);
        expect(referenceRead.data.content).toBe('Reference description for facade baseline.');

        expect(workflow).toEqual([
          'read_field',
          'inspect_external_file',
          'external_search_in_field',
          'list_references',
          'read_reference_field',
        ]);
        for (const res of [activeRead, externalInspect, externalSearch, references, referenceRead]) {
          expectMcpSuccessArtifacts(res.data);
        }
      } finally {
        await closeServer(api.server);
        fs.rmSync(externalFixture.dir, { recursive: true, force: true });
      }
    });

    it('facade baseline: dry-run-first batch edit preserves then matches final artifact', async () => {
      const fixture = createSearchFixture();
      const api = await startTestApiServer(fixture);
      try {
        const workflow = ['list_lorebook', 'replace_in_lorebook_batch:dry_run', 'replace_in_lorebook_batch:apply'];
        const listed = await getJson<Record<string, unknown>>(api.port, api.token, '/lorebook');
        expect(listed.status).toBe(200);
        expect(listed.data.count).toBe(2);

        const dryRun = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/batch-replace', {
          replacements: [{ index: 0, find: 'alpha', replace: 'facade baseline', expected_comment: 'Bridge lore' }],
          dry_run: true,
        });
        expect(dryRun.status).toBe(200);
        expect(dryRun.data.dryRun).toBe(true);
        expect(fixture.lorebook?.[0]?.content).toBe('Lore alpha entry.');

        const applied = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/batch-replace', {
          replacements: [{ index: 0, find: 'alpha', replace: 'facade baseline', expected_comment: 'Bridge lore' }],
        });
        expect(applied.status).toBe(200);
        expect(applied.data.success).toBe(true);

        workflow.push('read_lorebook_batch:verify');
        const verified = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/batch', {
          indices: [0],
        });
        expect(verified.status).toBe(200);
        expect(((verified.data.entries as Record<string, unknown>[])[0].entry as Record<string, unknown>).content).toBe(
          'Lore facade baseline entry.',
        );
        expect(workflow).toHaveLength(4);
        expectMcpSuccessArtifacts(applied.data);
        expectMcpSuccessArtifacts(verified.data);
      } finally {
        await closeServer(api.server);
      }
    });
  });

  it('envelope does not break error responses (no envelope on errors)', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/field/nonexistent_field');
      expect(res.status).toBe(400);
      // Error responses should NOT have success envelope fields
      expect(res.data.error).toBeDefined();
      expect(res.data.action).toBeDefined();
      // next_actions IS present on errors (recovery metadata contract)
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      // summary should NOT be present on errors (success-only field)
      expect(res.data.summary).toBeUndefined();
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP error recovery metadata — global guards', () => {
  it('unauthorized guard returns retryable: false and empty next_actions', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await getJson<McpRecoveryEnvelope>(api.port, 'wrong-token', '/fields');
      expect(res.status).toBe(401);
      expect(res.data.retryable).toBe(false);
      expect(res.data.next_actions).toEqual([]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('no-file-open guard returns retryable: false and next_actions with open_file, list_references, session_status', async () => {
    const api = await startTestApiServer(null);
    try {
      const res = await getJson<McpRecoveryEnvelope>(api.port, api.token, '/fields');
      expect(res.status).toBe(400);
      expect(res.data.retryable).toBe(false);
      expect(res.data.next_actions).toEqual(['open_file', 'list_references', 'session_status']);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP error recovery metadata — 400 validation', () => {
  it('unknown field GET returns retryable: false and field-family next_actions', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await getJson<McpRecoveryEnvelope>(api.port, api.token, '/field/not-a-real-field');
      expect(res.status).toBe(400);
      expect(res.data.retryable).toBe(false);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expect(res.data.next_actions.length).toBeGreaterThan(0);
      expect(res.data.next_actions).toContain('list_fields');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP error recovery metadata — no-op responses', () => {
  it('field replace no-match returns retryable: false and field-family next_actions', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<McpNoOpRecoveryEnvelope>(api.port, api.token, '/field/description/replace', {
        find: 'nonexistent-string-xyz',
        replace: 'replacement',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(false);
      expect(res.data.retryable).toBe(false);
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expect(res.data.next_actions.length).toBeGreaterThan(0);
      expect(res.data.next_actions).toContain('search_in_field');
    } finally {
      await closeServer(api.server);
    }
  });
});
