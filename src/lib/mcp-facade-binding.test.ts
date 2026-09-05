import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerFacadeTools, type FacadeToolRegistrationDeps } from './mcp-tool-register-facade';
import {
  facadePreviewStore,
  manageItemsPreviewStore,
  manageAssetsPreviewStore,
  manageFilePreviewStore,
} from './mcp-facade-runtime';
import { hashSurface } from './mcp-api-helpers';

type Result = { content: Array<{ text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;

describe.each(['edit', 'items', 'assets', 'file'] as const)('active %s preview document binding', (tool) => {
  afterEach(() => {
    facadePreviewStore.clear();
    manageItemsPreviewStore.clear();
    manageAssetsPreviewStore.clear();
    manageFilePreviewStore.clear();
  });
  it.each(['reorder', 'switch file'] as const)(
    'consumes and rejects a preview after %s despite matching short guards',
    async (change) => {
      let path = '/synthetic/first.charx';
      const entries = [
        { comment: 'same', content: 'first' },
        { comment: 'same', content: 'second' },
      ];
      const handlers = new Map<string, Handler>();
      const apply = vi.fn();
      registerFacadeTools(
        {
          tool: (name: string, _description: string, _schema: unknown, handler: Handler) => handlers.set(name, handler),
        } as unknown as McpServer,
        {
          apiRequest: async (_method: string, route: string) =>
            route === '/surfaces' ? { document_hash: hashSurface(entries) } : { document: { filePath: path } },
          assets: {
            previewManageAssetsOperation: async () => ({ result: {}, routes: [], touched: [], requiredGuards: [] }),
            applyManageAssetsOperation: apply,
          },
          files: {
            previewManageFileOperation: async () => ({ result: {}, routes: [], touched: [], requiredGuards: [] }),
            applyManageFileOperation: apply,
          },
          items: {
            previewManageItemsOperation: async () => ({ result: {}, routes: [], touched: [], requiredGuards: [] }),
            applyManageItemsOperation: apply,
          },
          scriptStyle: {},
          content: { boundFacadePayload: (value: unknown) => value },
          edit: {
            previewFacadeOperation: async () => ({ data: {}, routes: [], touched: ['lorebook:0'], requiredGuards: [] }),
            applyFacadeOperation: apply,
          },
          safeToolHandler: (_name: string, handler: Handler) => handler,
          textResult: (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] }),
        } as unknown as FacadeToolRegistrationDeps,
      );
      const target = { kind: 'active' };
      const preview = JSON.parse(
        (
          await handlers.get(tool === 'edit' ? 'preview_edit' : `manage_${tool}`)!({
            target,
            mode: 'preview',
            family: 'lorebook',
            operation:
              tool === 'file'
                ? { action: 'restore_snapshot', field: 'description', snapshot_id: 'synthetic' }
                : tool === 'items'
                  ? { action: 'reorder_items', order: [1, 0] }
                  : { action: 'delete_asset', selector: { index: 0 } },
            operations: [
              { op: 'replace_text', selector: { family: 'lorebook', index: 0 }, find: 'first', replace: 'changed' },
            ],
          })
        ).content[0]!.text,
      ).preview;
      if (change === 'reorder') entries.reverse();
      else path = '/synthetic/other.charx';
      const result = JSON.parse(
        (
          await handlers.get(tool === 'edit' ? 'apply_edit' : `manage_${tool}`)!({
            target,
            mode: 'apply',
            family: 'lorebook',
            guard_values: [{ name: 'expected_comment', value: 'same' }],
            preview_token: preview.preview_token,
            operation_digest: preview.operation_digest,
          })
        ).content[0]!.text,
      );
      expect(result.status).toBe(409);
      expect(apply).not.toHaveBeenCalled();
      expect(
        [facadePreviewStore, manageItemsPreviewStore, manageAssetsPreviewStore, manageFilePreviewStore].some((store) =>
          store.has(preview.preview_token),
        ),
      ).toBe(false);
    },
  );
});
