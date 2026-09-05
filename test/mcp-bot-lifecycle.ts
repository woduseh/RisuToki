import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openCharx } from '../src/charx-io';
import { buildChildEnv, callClientJson, startStandaloneClient } from './mcp-test-client';
import { nestedRecord } from './mcp-search-shared';

export async function runBotLifecycle(api: { port: number; token: string }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-bot-lifecycle-'));
  const app = new Client({ name: 'app-facade-bot-test', version: '1' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(process.cwd(), 'toki-mcp-server.js')],
    env: buildChildEnv(api.port, api.token, 'facade-first'),
    stderr: 'pipe',
  });
  const standalone = await startStandaloneClient({ userDataDir: path.join(directory, 'user'), allowWrites: true });
  try {
    await app.connect(transport);
    for (const [label, client] of [
      ['app', app],
      ['headless', standalone.client],
    ] as const) {
      const tools = await client.listTools();
      assert.equal(tools.tools.length, 14);
      assert.ok(!tools.tools.some((tool) => tool.name === 'write_field'));
      const file = path.join(directory, `${label}.charx`);
      const target = { kind: 'external', file_path: file };
      const preview = await callClientJson(client, 'manage_file', {
        target: { kind: 'session' },
        mode: 'preview',
        operation: { action: 'create_document', file_path: file, name: 'Librarian', description: 'A quiet librarian.' },
      });
      const credentials = nestedRecord(preview.preview, 'create preview');
      await callClientJson(client, 'manage_file', {
        target: { kind: 'session' },
        mode: 'apply',
        preview_token: credentials.preview_token,
        operation_digest: credentials.operation_digest,
        guard_values: credentials.required_guards,
      });
      assert.equal(openCharx(file).name, 'Librarian');
      const cases = [{ name: 'character voice', kind: 'field', field: 'description', contains: ['patient'] }];
      const before = await callClientJson(client, 'evaluate_bot', { target, cases });
      assert.equal(before.passed, false);
      const edit = await callClientJson(client, 'preview_edit', {
        target,
        operations: [
          {
            op: 'replace_text',
            selector: { family: 'field', field: 'description' },
            find: 'quiet',
            replace: 'patient',
          },
        ],
      });
      const editCredentials = nestedRecord(edit.preview, 'edit preview');
      await callClientJson(client, 'apply_edit', {
        target,
        preview_token: editCredentials.preview_token,
        operation_digest: editCredentials.operation_digest,
        guard_values: editCredentials.required_guards,
      });
      const after = await callClientJson(client, 'evaluate_bot', { target, cases });
      assert.equal(after.passed, true);
      assert.notEqual(before.source_fingerprint, after.source_fingerprint);
      assert.equal(openCharx(file).description, 'A patient librarian.');
      const read = await callClientJson(client, 'read_content', {
        target,
        selectors: [{ family: 'field', field: 'description', offset: 2, length: 7 }],
        max_bytes: 4096,
      });
      assert.match(JSON.stringify(read), /patient/);
    }
  } finally {
    await app.close();
    await standalone.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
