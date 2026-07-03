// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { describe, expect, it } from 'vitest';
import {
  closeServer,
  createLegacyTestApiServer,
  createSearchFixture,
  getJson,
  postJson,
  type McpErrorEnvelope,
  type SearchFixture,
  type TestDepsOverrides,
} from './mcp-api-test-harness';
import { expectMcpSuccessArtifacts, useMcpApiTestDir } from './mcp-api-vitest-helpers';
import { parsePromptTemplate, parsePromptTemplateFromText, serializePromptTemplateToText } from './risup-prompt-model';

const TEST_DIR = useMcpApiTestDir('risup-prompt-routes');
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

describe('MCP API risup prompt-item routes', () => {
  function createRisupFixture(): SearchFixture {
    return {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'chats']),
      presetBias: '[["hello",5]]',
      localStopStrings: '["END"]',
    };
  }

  function createPlainSnippetText(text: string): string {
    return serializePromptTemplateToText(
      parsePromptTemplate(JSON.stringify([{ type: 'plain', type2: 'normal', text, role: 'system' }])),
    );
  }

  it('lists prompt items with type/supported/preview metadata', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{
        count: number;
        state: string;
        hasUnsupportedContent: boolean;
        items: Array<{ index: number; type: string; supported: boolean; preview: string }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(3);
      expect(res.data.state).toBe('valid');
      expect(res.data.hasUnsupportedContent).toBe(false);
      expect(res.data.items).toHaveLength(3);
      expect(res.data.items[0]).toMatchObject({ index: 0, type: 'plain', supported: true });
      expect(res.data.items[1]).toMatchObject({ index: 1, type: 'chat', supported: true });
      expect(res.data.items[2]).toMatchObject({ index: 2, type: 'lorebook', supported: true });
      expect(typeof res.data.items[0].preview).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('exposes unsupported items with metadata in list', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'unknowntype', foo: 'bar' },
        { type: 'plain', type2: 'normal', text: 'Hello', role: 'system' },
      ]),
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        hasUnsupportedContent: boolean;
        items: Array<{ supported: boolean; type: string | null }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(200);
      expect(res.data.hasUnsupportedContent).toBe(true);
      expect(res.data.items[0].supported).toBe(false);
      expect(res.data.items[0].type).toBe('unknowntype');
      expect(res.data.items[1].supported).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('reads one prompt item by index', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{
        index: number;
        item: Record<string, unknown>;
        supported: boolean;
        type: string;
      }>(api.port, api.token, '/risup/prompt-item/0');
      expect(res.status).toBe(200);
      expect(res.data.index).toBe(0);
      expect(res.data.supported).toBe(true);
      expect(res.data.type).toBe('plain');
      expect(res.data.item).toMatchObject({ type: 'plain', text: 'Hello world' });
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-reads prompt items and preserves nulls for invalid indices', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{
        count: number;
        total: number;
        entries: Array<{ index: number; type: string | null; supported: boolean } | null>;
      }>(api.port, api.token, '/risup/prompt-item/batch', {
        indices: [0, 99, 2],
      });
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(2);
      expect(res.data.total).toBe(3);
      expect(res.data.entries[0]).toMatchObject({ index: 0, type: 'plain', supported: true });
      expect(res.data.entries[1]).toBeNull();
      expect(res.data.entries[2]).toMatchObject({ index: 2, type: 'lorebook', supported: true });
    } finally {
      await closeServer(api.server);
    }
  });

  it('searches prompt items by substring across text-bearing fields', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{
        count: number;
        matches: Array<{ index: number; matched_fields: string[] }>;
      }>(api.port, api.token, '/risup/prompt-items/search', {
        query: 'hello',
      });
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(1);
      expect(res.data.matches[0].index).toBe(0);
      expect(res.data.matches[0].matched_fields).toContain('text');
    } finally {
      await closeServer(api.server);
    }
  });

  it('writes one prompt item and mutates currentData.promptTemplate', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const newItem = { type: 'plain', type2: 'normal', text: 'Updated text', role: 'user' };
      const res = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/risup/prompt-item/0', {
        item: newItem,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(0);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed[0].text).toBe('Updated text');
      expect(parsed[0].role).toBe('user');
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-writes multiple prompt items in one request', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; count: number }>(
        api.port,
        api.token,
        '/risup/prompt-item/batch-write',
        {
          writes: [
            { index: 0, item: { type: 'plain', type2: 'normal', text: 'Batch updated', role: 'user' } },
            { index: 2, item: { type: 'lorebook', name: 'Lore entry' } },
          ],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.count).toBe(2);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed[0].text).toBe('Batch updated');
      expect(parsed[0].role).toBe('user');
      expect(parsed[2].type).toBe('lorebook');
      expect(parsed[2].name).toBe('Lore entry');
    } finally {
      await closeServer(api.server);
    }
  });

  it('adds a new prompt item', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const newItem = { type: 'jailbreak', type2: 'normal', text: 'New jailbreak', role: 'system' };
      const res = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/risup/prompt-item/add', {
        item: newItem,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(3);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(4);
      expect(parsed[3].type).toBe('jailbreak');
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch-adds new prompt items', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; count: number; indices: number[] }>(
        api.port,
        api.token,
        '/risup/prompt-item/batch-add',
        {
          items: [
            { type: 'jailbreak', type2: 'normal', text: 'First batch item', role: 'system' },
            { type: 'persona', name: 'Batch persona' },
          ],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.count).toBe(2);
      expect(res.data.indices).toEqual([3, 4]);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(5);
      expect(parsed[3].type).toBe('jailbreak');
      expect(parsed[4].type).toBe('persona');
    } finally {
      await closeServer(api.server);
    }
  });

  it('deletes a prompt item', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; deleted: number }>(
        api.port,
        api.token,
        '/risup/prompt-item/1/delete',
        {},
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.deleted).toBe(1);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(2);
      expect(parsed[0].type).toBe('plain');
      expect(parsed[1].type).toBe('lorebook');
    } finally {
      await closeServer(api.server);
    }
  });

  it('reorders prompt items', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; order: number[] }>(
        api.port,
        api.token,
        '/risup/prompt-item/reorder',
        { order: [2, 0, 1] },
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.order).toEqual([2, 0, 1]);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed[0].type).toBe('lorebook'); // was index 2
      expect(parsed[1].type).toBe('plain'); // was index 0
      expect(parsed[2].type).toBe('chat'); // was index 1
    } finally {
      await closeServer(api.server);
    }
  });

  it('reads the formating order', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{
        state: string;
        items: Array<{ index: number; token: string; known: boolean }>;
      }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      expect(res.data.state).toBe('valid');
      expect(res.data.items).toHaveLength(3);
      expect(res.data.items[0]).toMatchObject({ index: 0, token: 'main', known: true });
      expect(res.data.items[1]).toMatchObject({ index: 1, token: 'description', known: true });
      expect(res.data.items[2]).toMatchObject({ index: 2, token: 'chats', known: true });
    } finally {
      await closeServer(api.server);
    }
  });

  it('writes the formating order', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; count: number }>(api.port, api.token, '/risup/formating-order', {
        items: [{ token: 'chats' }, { token: 'main' }, { token: 'lorebook' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.count).toBe(3);
      const parsed = JSON.parse(currentData.formatingOrder as string) as string[];
      expect(parsed).toEqual(['chats', 'main', 'lorebook']);
    } finally {
      await closeServer(api.server);
    }
  });

  it('accepts unknown string tokens in formating-order write', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; count: number }>(api.port, api.token, '/risup/formating-order', {
        items: [{ token: 'main' }, { token: 'customUnknownToken' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const parsed = JSON.parse(currentData.formatingOrder as string) as string[];
      expect(parsed).toContain('customUnknownToken');
    } finally {
      await closeServer(api.server);
    }
  });

  it('diffs the current risup prompt against a reference risup preset', async () => {
    const currentData = createRisupFixture();
    const referenceData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Reference world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
      formatingOrder: JSON.stringify(['main', 'chats', 'description']),
    };
    const api = await startTestApiServer(currentData, [{ fileName: 'ref-preset.risup', data: referenceData }]);
    try {
      const res = await postJson<{
        identical: boolean;
        changedSections: string[];
        promptTemplate: { currentCount: number; linesAdded: number; linesRemoved: number };
        formatingOrder: { reordered: boolean; currentTokens: string[]; referenceTokens: string[] };
      }>(api.port, api.token, '/risup/prompt-diff', {
        refIndex: 0,
      });
      expect(res.status).toBe(200);
      expect(res.data.identical).toBe(false);
      expect(res.data.changedSections).toEqual(['promptTemplate', 'formatingOrder']);
      expect(res.data.promptTemplate.currentCount).toBe(3);
      expect(res.data.promptTemplate.linesAdded).toBeGreaterThan(0);
      expect(res.data.promptTemplate.linesRemoved).toBeGreaterThan(0);
      expect(res.data.formatingOrder.reordered).toBe(true);
      expect(res.data.formatingOrder.currentTokens).toEqual(['main', 'description', 'chats']);
      expect(res.data.formatingOrder.referenceTokens).toEqual(['main', 'chats', 'description']);
    } finally {
      await closeServer(api.server);
    }
  });

  it('exports promptTemplate to structured text', async () => {
    const currentData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello\n===\nWorld', role: 'system', customExtraField: 'keep me' },
        { id: 'legacy-unknown-1', type: 'futureType', data: { x: 1 } },
      ]),
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(currentData);
    try {
      const res = await getJson<{ count: number; hasUnsupportedContent: boolean; text: string }>(
        api.port,
        api.token,
        '/risup/prompt-text',
      );
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(2);
      expect(res.data.hasUnsupportedContent).toBe(true);
      expect(res.data.text).toContain('### [plain] ###');
      expect(res.data.text).toContain('extra-json: {"customExtraField":"keep me"}');
      expect(res.data.text).toContain('### [raw] ###');
    } finally {
      await closeServer(api.server);
    }
  });

  it('copies selected prompt items to text in the requested order', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ count: number; indices: number[]; text: string }>(
        api.port,
        api.token,
        '/risup/prompt-text/copy',
        {
          indices: [2, 0],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(2);
      expect(res.data.indices).toEqual([2, 0]);

      const parsed = parsePromptTemplateFromText(res.data.text);
      expect(parsed.state).toBe('valid');
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].type).toBe('lorebook');
      expect(parsed.items[1].type).toBe('plain');
    } finally {
      await closeServer(api.server);
    }
  });

  it('supports dry-run import for prompt text without mutating promptTemplate', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    const sourceText = serializePromptTemplateToText(
      parsePromptTemplate(
        JSON.stringify([
          { type: 'chatML', text: 'Imported', name: 'Prompt block' },
          { type: 'chat', rangeStart: 1, rangeEnd: 3 },
        ]),
      ),
    );
    try {
      const res = await postJson<{
        dry_run: boolean;
        success: boolean;
        count: number;
        orderWarnings: string[];
        items: Array<{ type: string | null }>;
      }>(api.port, api.token, '/risup/prompt-text/import', { text: sourceText, dry_run: true });
      expect(res.status).toBe(200);
      expect(res.data.dry_run).toBe(true);
      expect(res.data.success).toBe(true);
      expect(res.data.count).toBe(2);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      expect(res.data.items[0].type).toBe('chatML');
      expect(currentData.promptTemplate).toBe(createRisupFixture().promptTemplate);
    } finally {
      await closeServer(api.server);
    }
  });

  it('imports structured prompt text and replaces promptTemplate', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    const sourceItems = [
      { type: 'plain', type2: 'normal', text: 'Imported text', role: 'bot', customExtraField: 'keep me' },
      { id: 'legacy-unknown-1', type: 'futureType', data: { x: 1 } },
    ];
    const sourceText = serializePromptTemplateToText(parsePromptTemplate(JSON.stringify(sourceItems)));
    try {
      const res = await postJson<{
        success: boolean;
        count: number;
        hasUnsupportedContent: boolean;
        orderWarnings: string[];
      }>(api.port, api.token, '/risup/prompt-text/import', { text: sourceText });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.count).toBe(2);
      expect(res.data.hasUnsupportedContent).toBe(true);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toMatchObject({
        type: 'plain',
        text: 'Imported text',
        role: 'bot',
        customExtraField: 'keep me',
      });
      expect(parsed[1]).toMatchObject({ id: 'legacy-unknown-1', type: 'futureType', data: { x: 1 } });
    } finally {
      await closeServer(api.server);
    }
  });

  it('imports structured prompt text in append mode with fresh ids', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    const sourceItems = [
      { id: 'shared-id', type: 'plain', type2: 'normal', text: 'Appended text', role: 'system' },
      { id: 'legacy-unknown-1', type: 'futureType', data: { x: 1 } },
    ];
    const sourceText = serializePromptTemplateToText(parsePromptTemplate(JSON.stringify(sourceItems)));
    try {
      const res = await postJson<{
        success: boolean;
        mode: string;
        count: number;
        insertAt: number;
        orderWarnings: string[];
      }>(api.port, api.token, '/risup/prompt-text/import', { text: sourceText, mode: 'append', insertAt: 1 });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.mode).toBe('append');
      expect(res.data.count).toBe(2);
      expect(res.data.insertAt).toBe(1);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);

      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(5);
      expect(parsed[1]).toMatchObject({ type: 'plain', text: 'Appended text' });
      expect(parsed[1].id).not.toBe('shared-id');
      expect(parsed[2]).toMatchObject({ type: 'futureType', data: { x: 1 } });
      expect(parsed[2].id).not.toBe('legacy-unknown-1');
      expect(parsed[3].type).toBe('chat');
    } finally {
      await closeServer(api.server);
    }
  });

  it('saves, lists, and reads persistent risup prompt snippets', async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'risup-prompt-snippet-api-'));
    const api = await startTestApiServer(createRisupFixture(), [], undefined, { userDataPath });
    try {
      const saveRes = await postJson<{
        created: boolean;
        source: string;
        snippet: { id: string; name: string; itemCount: number };
        items: Array<{ index: number }>;
      }>(api.port, api.token, '/risup/prompt-snippets/save', {
        name: 'Intro blocks',
        indices: [0, 2],
      });
      expect(saveRes.status).toBe(200);
      expect(saveRes.data.created).toBe(true);
      expect(saveRes.data.source).toBe('indices');
      expect(saveRes.data.snippet).toMatchObject({ name: 'Intro blocks', itemCount: 2 });
      expect(saveRes.data.items).toHaveLength(2);

      const listRes = await getJson<{
        count: number;
        snippets: Array<{ id: string; name: string; itemCount: number }>;
      }>(api.port, api.token, '/risup/prompt-snippets');
      expect(listRes.status).toBe(200);
      expect(listRes.data.count).toBe(1);
      expect(listRes.data.snippets[0]).toMatchObject({ name: 'Intro blocks', itemCount: 2 });

      const readRes = await postJson<{
        count: number;
        snippet: { id: string; name: string };
        text: string;
      }>(api.port, api.token, '/risup/prompt-snippets/read', {
        identifier: saveRes.data.snippet.id,
      });
      expect(readRes.status).toBe(200);
      expect(readRes.data.snippet.name).toBe('Intro blocks');
      expect(readRes.data.count).toBe(2);

      const parsed = parsePromptTemplateFromText(readRes.data.text);
      expect(parsed.state).toBe('valid');
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].type).toBe('plain');
      expect(parsed.items[1].type).toBe('lorebook');
    } finally {
      await closeServer(api.server);
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it('supports dry-run and insertion for persistent risup prompt snippets', async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'risup-prompt-snippet-api-'));
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData, [], undefined, { userDataPath });
    try {
      const saveRes = await postJson<{ snippet: { name: string } }>(
        api.port,
        api.token,
        '/risup/prompt-snippets/save',
        {
          name: 'Single insert',
          text: createPlainSnippetText('Inserted text'),
        },
      );
      expect(saveRes.status).toBe(200);

      const dryRunRes = await postJson<{
        dry_run: boolean;
        success: boolean;
        count: number;
        insertAt: number;
        snippet: { name: string };
      }>(api.port, api.token, '/risup/prompt-snippets/insert', {
        identifier: 'Single insert',
        insertAt: 1,
        dry_run: true,
      });
      expect(dryRunRes.status).toBe(200);
      expect(dryRunRes.data.dry_run).toBe(true);
      expect(dryRunRes.data.success).toBe(true);
      expect(dryRunRes.data.count).toBe(1);
      expect(dryRunRes.data.insertAt).toBe(1);
      expect(dryRunRes.data.snippet.name).toBe('Single insert');
      expect(currentData.promptTemplate).toBe(createRisupFixture().promptTemplate);

      const insertRes = await postJson<{
        success: boolean;
        count: number;
        insertAt: number;
        snippet: { name: string };
      }>(api.port, api.token, '/risup/prompt-snippets/insert', {
        identifier: 'Single insert',
        insertAt: 1,
      });
      expect(insertRes.status).toBe(200);
      expect(insertRes.data.success).toBe(true);
      expect(insertRes.data.count).toBe(1);
      expect(insertRes.data.insertAt).toBe(1);

      const parsed = JSON.parse(currentData.promptTemplate as string) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(4);
      expect(parsed[1]).toMatchObject({ type: 'plain', text: 'Inserted text' });
      expect(parsed[2].type).toBe('chat');
    } finally {
      await closeServer(api.server);
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it('deletes persistent risup prompt snippets by exact name', async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'risup-prompt-snippet-api-'));
    const api = await startTestApiServer(createRisupFixture(), [], undefined, { userDataPath });
    try {
      const saveRes = await postJson<{ snippet: { name: string } }>(
        api.port,
        api.token,
        '/risup/prompt-snippets/save',
        {
          name: 'Delete me',
          text: createPlainSnippetText('Delete me'),
        },
      );
      expect(saveRes.status).toBe(200);

      const deleteRes = await postJson<{ success: boolean; snippet: { name: string } }>(
        api.port,
        api.token,
        '/risup/prompt-snippets/delete',
        { identifier: 'Delete me' },
      );
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.data.success).toBe(true);
      expect(deleteRes.data.snippet.name).toBe('Delete me');

      const listRes = await getJson<{ count: number }>(api.port, api.token, '/risup/prompt-snippets');
      expect(listRes.status).toBe(200);
      expect(listRes.data.count).toBe(0);
    } finally {
      await closeServer(api.server);
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it('returns 400 for malformed prompt text imports', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/prompt-text/import', {
        text: '### [plain] ###\nrole: system\nbody-lines: nope\n---\nhello\n===',
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 for invalid prompt item index (GET)', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{ error: string }>(api.port, api.token, '/risup/prompt-item/99');
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 for invalid prompt item index (POST write)', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/prompt-item/99', {
        item: { type: 'plain', type2: 'normal', text: 'x', role: 'system' },
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when writing unsupported item type', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/prompt-item/0', {
        item: { type: 'unknowntype', foo: 'bar' },
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when adding unsupported item type', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/prompt-item/add', {
        item: { type: 'unknowntype', foo: 'bar' },
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when current promptTemplate is invalid JSON', async () => {
    const data: SearchFixture = { _fileType: 'risup', promptTemplate: 'NOT_VALID_JSON', formatingOrder: '[]' };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{ error: string; details?: { parseError: string } }>(
        api.port,
        api.token,
        '/risup/prompt-items',
      );
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when current formatingOrder is invalid JSON', async () => {
    const data: SearchFixture = { _fileType: 'risup', promptTemplate: '[]', formatingOrder: 'NOT_VALID_JSON' };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{ error: string }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when current formatingOrder contains mixed-type entries', async () => {
    const data: SearchFixture = { _fileType: 'risup', promptTemplate: '[]', formatingOrder: '["main", 42, "chats"]' };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{ error: string }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 for non-risup file type', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await getJson<{ error: string }>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 when formating-order items contain non-string tokens', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/formating-order', {
        items: [{ token: 'main' }, { token: 123 }],
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns 400 for invalid reorder (wrong length)', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/risup/prompt-item/reorder', {
        order: [0, 1], // only 2, but there are 3 items
      });
      expect(res.status).toBe(400);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects generic field writes with invalid promptTemplate JSON shape', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/promptTemplate', {
        content: '{"broken":true}',
      });

      expect(res.status).toBe(400);
      expect(currentData.promptTemplate).toBe(createRisupFixture().promptTemplate);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects generic field writes with mixed-type formatingOrder arrays', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/formatingOrder', {
        content: '["main", 42]',
      });

      expect(res.status).toBe(400);
      expect(currentData.formatingOrder).toBe(createRisupFixture().formatingOrder);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects batch field writes when promptTemplate is not a valid JSON array', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/batch-write', {
        entries: [
          {
            field: 'promptTemplate',
            content: '{"broken":true}',
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(currentData.promptTemplate).toBe(createRisupFixture().promptTemplate);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects batch field writes when formatingOrder is not a string JSON array', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/batch-write', {
        entries: [
          {
            field: 'formatingOrder',
            content: ['main', 'description'],
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(currentData.formatingOrder).toBe(createRisupFixture().formatingOrder);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects malformed generic risup JSON fields atomically in batch writes', async () => {
    const currentData = {
      ...createRisupFixture(),
      name: 'Original',
      promptSettings: '{}',
    };
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/batch-write', {
        entries: [
          { field: 'name', content: 'Mutated' },
          { field: 'promptSettings', content: '{broken' },
        ],
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Invalid promptSettings');
      expect(currentData.name).toBe('Original');
      expect(currentData.promptSettings).toBe('{}');
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects generic field writes with invalid presetBias pair shapes', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/presetBias', {
        content: '[["hello"]]',
      });

      expect(res.status).toBe(400);
      expect(currentData.presetBias).toBe(createRisupFixture().presetBias);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects generic field writes with non-string localStopStrings entries', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/localStopStrings', {
        content: '["END", 42]',
      });

      expect(res.status).toBe(400);
      expect(currentData.localStopStrings).toBe(createRisupFixture().localStopStrings);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects batch field writes when presetBias entries are not [string, number] pairs', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/batch-write', {
        entries: [
          {
            field: 'presetBias',
            content: '[["hello"]]',
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(currentData.presetBias).toBe(createRisupFixture().presetBias);
    } finally {
      await closeServer(api.server);
    }
  });

  it('rejects batch field writes when localStopStrings contains non-string entries', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);

    try {
      const res = await postJson<{ error: string }>(api.port, api.token, '/field/batch-write', {
        entries: [
          {
            field: 'localStopStrings',
            content: '["END", 42]',
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(currentData.localStopStrings).toBe(createRisupFixture().localStopStrings);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API risup prompt stable IDs and warnings', () => {
  function createRisupFixture(): SearchFixture {
    return {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'chats']),
    };
  }

  it('GET /risup/prompt-items includes id on each item', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{
        items: Array<{ index: number; id: string | null; type: string; supported: boolean }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(200);
      for (const item of res.data.items) {
        expect(item).toHaveProperty('id');
        if (item.supported) {
          expect(typeof item.id).toBe('string');
          expect(item.id!.length).toBeGreaterThan(0);
        }
      }
    } finally {
      await closeServer(api.server);
    }
  });

  it('unsupported items expose id as null without breaking shape', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'unknowntype', foo: 'bar' },
        { type: 'plain', type2: 'normal', text: 'Hello', role: 'system' },
      ]),
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        items: Array<{ index: number; id: string | null; type: string | null; supported: boolean }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(200);
      expect(res.data.items[0].supported).toBe(false);
      expect(res.data.items[0].id).toBeNull();
      expect(res.data.items[0]).toHaveProperty('type');
      expect(res.data.items[0]).toHaveProperty('preview');
      expect(res.data.items[1].supported).toBe(true);
      expect(typeof res.data.items[1].id).toBe('string');
    } finally {
      await closeServer(api.server);
    }
  });

  it('GET /risup/prompt-item/:idx includes id', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await getJson<{
        index: number;
        id: string | null;
        item: Record<string, unknown>;
        supported: boolean;
        type: string;
      }>(api.port, api.token, '/risup/prompt-item/0');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('id');
      expect(typeof res.data.id).toBe('string');
      expect(res.data.id!.length).toBeGreaterThan(0);
    } finally {
      await closeServer(api.server);
    }
  });

  it('add route generates id through parse/serialize flow', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const newItem = { type: 'jailbreak', type2: 'normal', text: 'JB text', role: 'system' };
      const res = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/risup/prompt-item/add', {
        item: newItem,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      // Re-read — the serialized promptTemplate should contain id via parse→serialize flow
      const listRes = await getJson<{
        items: Array<{ index: number; id: string | null }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(listRes.status).toBe(200);
      const addedItem = listRes.data.items[res.data.index];
      expect(typeof addedItem.id).toBe('string');
      expect(addedItem.id!.length).toBeGreaterThan(0);
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch add route assigns distinct generated ids to identical new items', async () => {
    const currentData = createRisupFixture();
    const api = await startTestApiServer(currentData);
    try {
      const newItem = { type: 'plain', type2: 'normal', text: 'Repeat me', role: 'system' };
      const res = await postJson<{ success: boolean; indices: number[] }>(
        api.port,
        api.token,
        '/risup/prompt-item/batch-add',
        {
          items: [newItem, newItem],
        },
      );
      expect(res.status).toBe(200);

      const listRes = await getJson<{
        items: Array<{ index: number; id: string | null }>;
      }>(api.port, api.token, '/risup/prompt-items');
      expect(listRes.status).toBe(200);
      const firstAdded = listRes.data.items[res.data.indices[0]];
      const secondAdded = listRes.data.items[res.data.indices[1]];
      expect(typeof firstAdded.id).toBe('string');
      expect(typeof secondAdded.id).toBe('string');
      expect(firstAdded.id).not.toBe(secondAdded.id);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write route preserves provided id through parse/serialize flow', async () => {
    const currentData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { id: 'my-custom-id', type: 'plain', type2: 'normal', text: 'Original', role: 'system' },
      ]),
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; index: number }>(api.port, api.token, '/risup/prompt-item/0', {
        item: { id: 'my-custom-id', type: 'plain', type2: 'normal', text: 'Updated', role: 'system' },
      });
      expect(res.status).toBe(200);

      const readRes = await getJson<{
        id: string | null;
        item: Record<string, unknown>;
      }>(api.port, api.token, '/risup/prompt-item/0');
      expect(readRes.status).toBe(200);
      expect(readRes.data.id).toBe('my-custom-id');
    } finally {
      await closeServer(api.server);
    }
  });

  it('batch write preserves existing ids when replacement items omit them', async () => {
    const currentData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { id: 'keep-me', type: 'plain', type2: 'normal', text: 'Original', role: 'system' },
        { id: 'keep-chat', type: 'chat', rangeStart: 0, rangeEnd: 'end' },
      ]),
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(currentData);
    try {
      const res = await postJson<{ success: boolean; count: number }>(
        api.port,
        api.token,
        '/risup/prompt-item/batch-write',
        {
          writes: [{ index: 0, item: { type: 'plain', type2: 'normal', text: 'Updated', role: 'user' } }],
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const readRes = await getJson<{
        id: string | null;
        item: Record<string, unknown>;
      }>(api.port, api.token, '/risup/prompt-item/0');
      expect(readRes.status).toBe(200);
      expect(readRes.data.id).toBe('keep-me');
      expect(readRes.data.item.text).toBe('Updated');
    } finally {
      await closeServer(api.server);
    }
  });

  it('GET /risup/formating-order includes empty warnings for clean fixtures', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
        { type: 'description' },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'chats', 'lorebook']),
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        state: string;
        items: Array<{ token: string }>;
        warnings: string[];
      }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('warnings');
      expect(Array.isArray(res.data.warnings)).toBe(true);
      expect(res.data.warnings).toHaveLength(0);
    } finally {
      await closeServer(api.server);
    }
  });

  it('GET /risup/formating-order includes warnings for duplicate tokens', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]),
      formatingOrder: JSON.stringify(['main', 'main', 'chats']),
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        state: string;
        warnings: string[];
      }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      expect(res.data.warnings.length).toBeGreaterThan(0);
      expect(res.data.warnings.some((w: string) => w.includes('Duplicate'))).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('GET /risup/formating-order includes warnings for dangling references', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]),
      formatingOrder: JSON.stringify(['main', 'lorebook']),
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        state: string;
        warnings: string[];
      }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      expect(res.data.warnings.some((w: string) => w.includes('Dangling'))).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('GET /risup/formating-order returns empty warnings when promptTemplate is invalid JSON', async () => {
    const data: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: 'NOT_VALID_JSON',
      formatingOrder: JSON.stringify(['main', 'chats']),
    };
    const api = await startTestApiServer(data);
    try {
      const res = await getJson<{
        state: string;
        items: Array<{ token: string }>;
        warnings: string[];
      }>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('warnings');
      expect(res.data.warnings).toEqual([]);
    } finally {
      await closeServer(api.server);
    }
  });

  it('raw write_field("promptTemplate") round-trips explicit ids', async () => {
    const explicitId = 'user-provided-id-42';
    const templateWithId = JSON.stringify([
      { id: explicitId, type: 'plain', type2: 'normal', text: 'With ID', role: 'system' },
    ]);
    const currentData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: templateWithId,
      formatingOrder: '[]',
    };
    const api = await startTestApiServer(currentData);
    try {
      // Write via raw field write
      const writeRes = await postJson<{ success: boolean }>(api.port, api.token, '/field/promptTemplate', {
        content: templateWithId,
      });
      expect(writeRes.status).toBe(200);

      // Re-read via MCP prompt-item route
      const readRes = await getJson<{
        id: string | null;
        item: Record<string, unknown>;
      }>(api.port, api.token, '/risup/prompt-item/0');
      expect(readRes.status).toBe(200);
      expect(readRes.data.id).toBe(explicitId);
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — risup reorder routes', () => {
  function createRisupFixture(): SearchFixture {
    return {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'chats']),
      presetBias: '[["hello",5]]',
      localStopStrings: '["END"]',
    };
  }

  it('returns a structured error envelope for wrong-length order in POST /risup/prompt-item/reorder', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      // Fixture has 3 prompt items; send only 2 indices.
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risup/prompt-item/reorder', {
        order: [0, 1],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'reorder risup prompt items');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'risup:promptTemplate');
      expect(res.data.error).toContain('order must be an array of length');
    } finally {
      await closeServer(api.server);
    }
  });

  it('returns a structured error envelope for non-permutation order in POST /risup/prompt-item/reorder', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      // Fixture has 3 prompt items; send correct length but invalid permutation.
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risup/prompt-item/reorder', {
        order: [0, 0, 0],
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'reorder risup prompt items');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'risup:promptTemplate');
      expect(res.data.error).toContain('permutation');
    } finally {
      await closeServer(api.server);
    }
  });
});

describe('MCP API structured error envelopes — risup formating-order routes', () => {
  function createRisupFixture(): SearchFixture {
    return {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'chats']),
      presetBias: '[["hello",5]]',
      localStopStrings: '["END"]',
    };
  }

  it('returns a structured error envelope for non-array items in POST /risup/formating-order', async () => {
    const api = await startTestApiServer(createRisupFixture());
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risup/formating-order', {
        items: 'not-an-array',
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'write risup formating order');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'risup:formatingOrder');
      expect(res.data.error).toContain('items must be an array');
    } finally {
      await closeServer(api.server);
    }
  });
});

// ================================================================
// Envelope migration: lua section, css section, risup prompt families
// ================================================================
describe('MCP envelope — lua/css section and risup prompt families', () => {
  function createLuaCssFixture(): SearchFixture {
    return {
      ...createSearchFixture(),
      lua: '---@name main\nprint("hello")\n---@name utils\nlocal x = 1',
      css: '/* ===== main ===== */\nbody { color: red; }\n/* ===== theme ===== */\n.dark { color: white; }',
    };
  }

  const luaCssOverrides: TestDepsOverrides = {
    parseLuaSections: () => [
      { name: 'main', content: 'print("hello")' },
      { name: 'utils', content: 'local x = 1' },
    ],
    parseCssSections: () => ({
      sections: [
        { name: 'main', content: 'body { color: red; }' },
        { name: 'theme', content: '.dark { color: white; }' },
      ],
      prefix: '',
      suffix: '',
    }),
  };

  function createRisupEnvelopeFixture(): SearchFixture {
    return {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([
        { type: 'plain', type2: 'normal', text: 'Hello world', role: 'system' },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        { type: 'lorebook' },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'chats']),
    };
  }

  // --- Lua section family ---

  it('list_lua response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/lua');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.sections)).toBe(true);
      const firstSection = (res.data.sections as Array<Record<string, unknown>>)[0];
      expect(firstSection.preview).toBe('print("hello")');
      expect(typeof firstSection.hash).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_lua response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/lua/0');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.index).toBe(0);
      expect(typeof res.data.name).toBe('string');
      expect(typeof res.data.content).toBe('string');
      expect(res.data.preview).toBe('print("hello")');
      expect(typeof res.data.hash).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('lua batch read response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/batch', {
        indices: [0, 1],
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(typeof res.data.total).toBe('number');
      expect(Array.isArray(res.data.sections)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('agent eval: write_lua rejects stale expected_hash with refresh-retry metadata', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lua/0', {
        content: 'print("updated")',
        expected_hash: 'not-current',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.retryable).toBe(true);
      expect(res.data.next_actions).toEqual(expect.arrayContaining(['list_lua', 'read_lua']));
      expect(res.data.error).toContain('Stale Lua section index 0');
      expect(res.data.details).toEqual(
        expect.objectContaining({ expected_hash: 'not-current', actual_hash: expect.any(String) }),
      );
    } finally {
      await closeServer(api.server);
    }
  });

  it('add_lua_section response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/add', {
        name: 'newSection',
        content: 'local y = 2',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.index).toBe('number');
      expect(res.data.name).toBe('newSection');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_lua response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/0', {
        content: 'print("updated")',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(0);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace_in_lua response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/0/replace', {
        find: 'hello',
        replace: 'world',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.matchCount).toBe('number');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('insert_in_lua response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/0/insert', {
        content: '-- new line',
        position: 'end',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.position).toBe('end');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('delete_lua_section removes the selected section with stale guards', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const current = await getJson<Record<string, unknown>>(api.port, api.token, '/lua/1');
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lua/1/delete', {
        expected_hash: current.data.hash,
        expected_preview: current.data.preview,
      });
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ success: true, deleted: 1, name: 'utils' });
      expect(String(fixture.lua)).not.toContain('local x = 1');
    } finally {
      await closeServer(api.server);
    }
  });

  // --- CSS section family ---

  it('list_css response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/css-section');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.sections)).toBe(true);
      const firstSection = (res.data.sections as Array<Record<string, unknown>>)[0];
      expect(firstSection.preview).toBe('body { color: red; }');
      expect(typeof firstSection.hash).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_css response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/css-section/0');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.index).toBe(0);
      expect(typeof res.data.name).toBe('string');
      expect(typeof res.data.content).toBe('string');
      expect(res.data.preview).toBe('body { color: red; }');
      expect(typeof res.data.hash).toBe('string');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('css batch read response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/batch', {
        indices: [0, 1],
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(typeof res.data.total).toBe('number');
      expect(Array.isArray(res.data.sections)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_css rejects stale expected_preview with 409 envelope', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/css-section/0', {
        content: 'body { color: blue; }',
        expected_preview: 'body { color: green; }',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('css-section:0');
      expect(res.data.error).toContain('Stale CSS section index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('add_css_section response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/add', {
        name: 'newCss',
        content: '.new { display: block; }',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.index).toBe('number');
      expect(res.data.name).toBe('newCss');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_css response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/0', {
        content: 'body { color: blue; }',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(0);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace_in_css response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/0/replace', {
        find: 'red',
        replace: 'blue',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.matchCount).toBe('number');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('insert_in_css response includes envelope fields', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/0/insert', {
        content: '.extra { margin: 0; }',
        position: 'end',
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.position).toBe('end');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('delete_css_section removes the selected section with stale guards', async () => {
    const fixture = createLuaCssFixture();
    const api = await startTestApiServer(fixture, [], undefined, luaCssOverrides);
    try {
      const current = await getJson<Record<string, unknown>>(api.port, api.token, '/css-section/1');
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/css-section/1/delete', {
        expected_hash: current.data.hash,
        expected_preview: current.data.preview,
      });
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ success: true, deleted: 1, name: 'theme' });
      expect(String(fixture.css)).not.toContain('.dark');
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Risup prompt family ---

  it('list_risup_prompt_items response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-items');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.count).toBe('number');
      expect(res.data.state).toBe('valid');
      expect(Array.isArray(res.data.items)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expectMcpSuccessArtifacts(res.data);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_risup_prompt_item response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/0');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.index).toBe(0);
      expect(res.data.type).toBe('plain');
      expect(typeof res.data.supported).toBe('boolean');
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_risup_prompt_item_batch response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/batch', {
        indices: [0, 1],
      });
      expect(res.status).toBe(200);
      expect(typeof res.data.count).toBe('number');
      expect(typeof res.data.total).toBe('number');
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('search_in_risup_prompt_items response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-items/search', {
        query: 'hello',
      });
      expect(res.status).toBe(200);
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.matches)).toBe(true);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_risup_prompt_item response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/0', {
        item: { type: 'plain', type2: 'normal', text: 'Updated text', role: 'system' },
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.index).toBe(0);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_risup_prompt_item_batch response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/batch-write', {
        writes: [{ index: 0, item: { type: 'plain', type2: 'normal', text: 'Batch edit', role: 'system' } }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.results)).toBe(true);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_risup_prompt_item rejects stale expected_type with 409 envelope', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/risup/prompt-item/0', {
        item: { type: 'plain', type2: 'normal', text: 'Updated text', role: 'system' },
        expected_type: 'chat',
      });
      expect(res.status).toBe(409);
      expect(res.data.status).toBe(409);
      expect(res.data.target).toBe('risup:promptTemplate:0');
      expect(res.data.error).toContain('Stale risup prompt item index 0');
    } finally {
      await closeServer(api.server);
    }
  });

  it('add_risup_prompt_item response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/add', {
        item: { type: 'plain', type2: 'normal', text: 'New item', role: 'system' },
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.index).toBe('number');
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('add_risup_prompt_item_batch response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/batch-add', {
        items: [{ type: 'plain', type2: 'normal', text: 'Batch new item', role: 'system' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(typeof res.data.count).toBe('number');
      expect(Array.isArray(res.data.indices)).toBe(true);
      expect(Array.isArray(res.data.results)).toBe(true);
      expect((res.data.results as Array<Record<string, unknown>>)[0]?.type).toBe('plain');
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('reorder_risup_prompt_items response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/reorder', {
        order: [2, 0, 1],
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.order)).toBe(true);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('delete_risup_prompt_item response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-item/0/delete', {});
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(res.data.deleted).toBe(0);
      expect(res.data.orderWarnings).toEqual([
        'Dangling formatingOrder token: "description" has no matching prompt item',
      ]);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('read_risup_formating_order response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/risup/formating-order');
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(typeof res.data.state).toBe('string');
      expect(Array.isArray(res.data.items)).toBe(true);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('write_risup_formating_order response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/formating-order', {
        items: [{ token: 'main' }, { token: 'description' }, { token: 'chats' }],
      });
      expect(res.status).toBe(200);
      // Original fields preserved
      expect(res.data.success).toBe(true);
      expect(typeof res.data.count).toBe('number');
      expect(res.data.warnings).toEqual(['Dangling formatingOrder token: "description" has no matching prompt item']);
      // Envelope fields present
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('diff_risup_prompt response includes envelope fields', async () => {
    const fixture = createRisupEnvelopeFixture();
    const referenceData: SearchFixture = {
      _fileType: 'risup',
      promptTemplate: JSON.stringify([{ type: 'plain', type2: 'normal', text: 'Different reference', role: 'system' }]),
      formatingOrder: JSON.stringify(['main']),
    };
    const api = await startTestApiServer(fixture, [{ fileName: 'compare.risup', data: referenceData }]);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/risup/prompt-diff', { refIndex: 0 });
      expect(res.status).toBe(200);
      expect(typeof res.data.identical).toBe('boolean');
      expect(Array.isArray(res.data.changedSections)).toBe(true);
      expect(typeof res.data.promptTemplate).toBe('object');
      expect(typeof res.data.formatingOrder).toBe('object');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });
});
