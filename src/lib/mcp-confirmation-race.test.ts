// @vitest-environment node
import type { LoadedDocumentData } from '../charx-io';
import { describe, expect, it } from 'vitest';
import { closeServer, createLegacyTestApiServer, postJson, type SearchFixture } from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';

const startServer = createLegacyTestApiServer(useMcpApiTestDir('confirmation-race'));

describe('MCP confirmation races', () => {
  it('does not write a different entry after the UI reorders during confirmation', async () => {
    const first = { comment: 'first', content: 'first original', key: 'a' };
    const second = { comment: 'second', content: 'second original', key: 'b' };
    const data: SearchFixture = { lorebook: [first, second] };
    const api = await startServer(data, [], undefined, {
      askRendererConfirm: async () => {
        data.lorebook!.reverse();
        return true;
      },
    });
    try {
      const response = await postJson(api.port, api.token, '/lorebook/0', {
        content: 'MCP replacement',
        expected_comment: 'first',
      });
      expect(response.status).toBe(409);
      expect(first.content).toBe('first original');
      expect(second.content).toBe('second original');
    } finally {
      await closeServer(api.server);
    }
  });

  it.each(['delete', 'content edit', 'document switch'] as const)(
    'rejects %s while confirmation is pending',
    async (change) => {
      const first = { comment: 'same', content: 'first original', key: 'a' };
      const second = { comment: 'same', content: 'second original', key: 'b' };
      const original: SearchFixture = { lorebook: [first, second] };
      let active = original;
      const api = await startServer(original, [], undefined, {
        getCurrentData: () => active as LoadedDocumentData,
        askRendererConfirm: async () => {
          if (change === 'delete') original.lorebook!.shift();
          if (change === 'content edit') first.content = 'UI edit';
          if (change === 'document switch') active = { lorebook: [{ ...first }] };
          return true;
        },
      });
      try {
        const response = await postJson(api.port, api.token, '/lorebook/0', {
          content: 'MCP replacement',
          expected_comment: 'same',
        });
        expect(response.status).toBe(409);
        expect(second.content).toBe('second original');
        expect(first.content).toBe(change === 'content edit' ? 'UI edit' : 'first original');
        expect(active.lorebook![0]!.content).not.toBe('MCP replacement');
      } finally {
        await closeServer(api.server);
      }
    },
  );

  it.each([true, false])(
    'distinguishes unsynchronized drafts (%s) from MCP-applied dirty state',
    async (hasDraftChanges) => {
      const data: SearchFixture = { lorebook: [{ comment: 'first', content: 'saved' }] };
      const api = await startServer(data, [], undefined, {
        hasRendererDraftChanges: async () => hasDraftChanges,
        getSessionStatus: () => ({
          currentFilePath: null,
          currentFileType: 'charx',
          lastRestored: null,
          pendingRecovery: null,
          renderer: {
            autosaveDir: '',
            autosaveEnabled: false,
            autosaveInterval: 60,
            dirtyFieldCount: 1,
            dirtyFields: ['lorebook'],
            documentSwitchInProgress: false,
            hasUnsavedChanges: true,
          },
        }),
      });
      try {
        const response = await postJson(api.port, api.token, '/lorebook/0', { content: 'MCP replacement' });
        expect(response.status).toBe(hasDraftChanges ? 409 : 200);
        expect(data.lorebook![0]!.content).toBe(hasDraftChanges ? 'saved' : 'MCP replacement');
      } finally {
        await closeServer(api.server);
      }
    },
  );
});
