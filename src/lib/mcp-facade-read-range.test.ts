// @vitest-environment node
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import { saveCharx, type LoadedDocumentData } from '../charx-io';
import { createFacadeContentEngine, type FacadeContentEngineDeps } from './mcp-facade-content';
import { closeServer, createSearchFixture, startTestApiServer } from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';
import { facadeApiError, isApiError } from './mcp-facade-runtime';
import { registerFacadeTools, type FacadeToolRegistrationDeps } from './mcp-tool-register-facade';
import type { FacadeV1ContentSelector, FacadeV1Target } from './mcp-request-schemas';

const TEST_DIR = useMcpApiTestDir('facade-read-range');
const original = '한글😀"\\\n'.repeat(1200) + 'END';

type TestHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;

function pageData(page: unknown) {
  return (
    page as {
      result: {
        items: Array<{ data: { content: string; offset: number; length: number; next_cursor: string | null } }>;
      };
    }
  ).result.items[0].data;
}

describe('guarded facade field ranges through real HTTP routes', () => {
  it.each(['active', 'external', 'reference'] as const)(
    'reads complete UTF-8 bounded %s pages and rejects stale continuation',
    async (kind) => {
      const fixture = createSearchFixture();
      fixture.description = original.replace(/\n/g, '\r\n');
      const filePath = path.join(TEST_DIR, `${kind}.charx`);
      saveCharx(filePath, fixture as LoadedDocumentData);
      const references = [{ fileName: 'reference.charx', filePath, data: fixture }];
      const api = await startTestApiServer(fixture, references, undefined, { userDataPath: TEST_DIR });
      try {
        const engine = createFacadeContentEngine({
          apiRequest: async (method, routePath, body) => {
            const response = await fetch(`http://127.0.0.1:${api.port}${routePath}`, {
              method,
              headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
              ...(body ? { body: JSON.stringify(body) } : {}),
            });
            const data = await response.json();
            return response.ok ? data : facadeApiError(response.status, JSON.stringify(data), 'Retry');
          },
          danbooru: {},
          items: {},
          scriptStyle: {},
        } as FacadeContentEngineDeps);
        const handlers = new Map<string, TestHandler>();
        registerFacadeTools(
          {
            tool: (name: string, _description: string, _schema: unknown, handler: TestHandler) =>
              handlers.set(name, handler),
          } as unknown as McpServer,
          {
            content: engine,
            assets: {},
            files: {},
            items: {},
            edit: {},
            scriptStyle: {},
            safeToolHandler: (_name: string, handler: TestHandler) => handler,
            textResult: (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] }),
          } as unknown as FacadeToolRegistrationDeps,
        );
        const read = async (target: FacadeV1Target, selector: FacadeV1ContentSelector, max_bytes: number) =>
          JSON.parse(
            (await handlers.get('read_content')!({ target, selectors: [selector], max_bytes })).content[0].text,
          );
        const target: FacadeV1Target =
          kind === 'external'
            ? { kind, file_path: filePath }
            : kind === 'reference'
              ? { kind, reference_id: '0' }
              : { kind };
        let selector: FacadeV1ContentSelector = { family: 'field', field: 'description', offset: 0, length: 10000 };
        let combined = '';
        let firstCursor = '';
        for (let count = 0; count < 100; count++) {
          const page = await read(target, selector, 2048);
          expect(isApiError(page), JSON.stringify(page)).toBe(false);
          expect(Buffer.byteLength(JSON.stringify(page), 'utf8')).toBeLessThanOrEqual(2048);
          const data = pageData(page);
          expect(data.offset).toBe(combined.length);
          expect(data.length).toBeGreaterThan(0);
          expect(data.content).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
          combined += data.content;
          if (!data.next_cursor) break;
          firstCursor ||= data.next_cursor;
          selector = { family: 'field', field: 'description', cursor: data.next_cursor };
        }
        expect(combined).toBe(original);
        const atEnd = await engine.readFacadeFieldRange(
          target,
          { family: 'field', field: 'description', offset: original.indexOf('END'), length: 3 },
          2048,
        );
        expect(pageData(atEnd).content).toBe('END');
        expect(pageData(atEnd).next_cursor).toBeNull();
        const wrongField = await read(target, { field: 'firstMessage', cursor: firstCursor }, 2048);
        expect(wrongField).toMatchObject({ status: 409 });
        const mixedCursor = await read(target, { field: 'description', cursor: firstCursor, offset: 0 }, 2048);
        expect(mixedCursor).toMatchObject({ status: 400 });
        const multiple = JSON.parse(
          (
            await handlers.get('read_content')!({
              target,
              selectors: [{ field: 'description', offset: 0 }, { field: 'firstMessage' }],
              max_bytes: 2048,
            })
          ).content[0].text,
        );
        expect(multiple).toMatchObject({ status: 400 });
        const rangedEdit = JSON.parse(
          (
            await handlers.get('preview_edit')!({
              target,
              operations: [
                {
                  op: 'replace_text',
                  selector: { field: 'description', offset: 0, length: 1 },
                  find: '한',
                  replace: '글',
                },
              ],
            })
          ).content[0].text,
        );
        expect(rangedEdit).toMatchObject({ status: 400 });
        if (kind === 'reference') {
          references[0].filePath = path.join(TEST_DIR, 'other-reference.charx');
          const switched = await read(target, { field: 'description', cursor: firstCursor }, 2048);
          expect(switched).toMatchObject({ status: 409 });
          references[0].filePath = filePath;
          firstCursor = pageData(await read(target, { field: 'description', offset: 0 }, 2048)).next_cursor!;
        }
        fixture.description = original + 'changed';
        if (kind === 'external') saveCharx(filePath, fixture as LoadedDocumentData);
        const stale = await engine.readFacadeFieldRange(
          target,
          { family: 'field', field: 'description', cursor: firstCursor },
          2048,
        );
        expect(stale).toMatchObject({ status: 409, details: { code: 'stale_read_cursor' } });
        const small = await engine.readFacadeFieldRange(
          target,
          { family: 'field', field: 'description', offset: 0 },
          1,
        );
        expect(small).toMatchObject({ status: 400, details: { code: 'read_budget_too_small' } });
        const wrongTarget = await engine.readFacadeFieldRange(
          target,
          { family: 'field', field: 'firstMessage', cursor: firstCursor },
          2048,
        );
        expect(wrongTarget).toMatchObject({ status: 409 });
      } finally {
        await closeServer(api.server);
      }
    },
  );
});
