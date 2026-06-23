import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const requestPath = path.resolve(process.argv[2]);
const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
const results = {};

function textContent(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((entry) => entry?.type === 'text' && typeof entry.text === 'string')
    .map((entry) => entry.text)
    .join('\n');
}

function getRef(reference) {
  const [stepId, ...segments] = reference.split('.');
  let value = results[stepId];
  for (const segment of segments) value = value?.[segment];
  return value;
}

function resolveRefs(value) {
  if (Array.isArray(value)) return value.map(resolveRefs);
  if (!value || typeof value !== 'object') return value;
  if (Object.keys(value).length === 1 && typeof value.$ref === 'string') return getRef(value.$ref);
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, resolveRefs(nested)]));
}

const args = [
  path.resolve('toki-mcp-server.js'),
  '--standalone',
  '--file',
  path.resolve(request.file),
  '--user-data-dir',
  path.resolve(request.user_data_dir ?? '.tmp/mcp-runner-data'),
  '--tool-profile',
  request.tool_profile ?? 'advanced-full',
];
if (request.allow_writes) args.push('--allow-writes');

const client = new Client({ name: 'codex-charx-editor', version: '1.0.0' }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args,
  cwd: process.cwd(),
  stderr: 'pipe',
});
const stderr = [];
transport.stderr?.on('data', (chunk) => stderr.push(String(chunk)));

try {
  await client.connect(transport);
  for (const step of request.steps) {
    if (step.kind === 'list_tools') {
      const response = await client.listTools();
      const names = new Set(step.names ?? []);
      results[step.id] = {
        tools: response.tools
          .filter((tool) => names.size === 0 || names.has(tool.name))
          .map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
      };
      continue;
    }

    const response = await client.callTool({
      name: step.tool,
      arguments: resolveRefs(step.args ?? {}),
    });
    const text = textContent(response.content);
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Keep non-JSON diagnostics readable.
    }
    results[step.id] = { isError: Boolean(response.isError), body: parsed };
    if (response.isError && !step.allow_error) break;
  }
} finally {
  await client.close().catch(() => undefined);
}

const output = JSON.stringify({ results, stderr }, null, 2);
if (request.output_path) {
  fs.writeFileSync(path.resolve(request.output_path), output, 'utf8');
} else {
  process.stdout.write(output);
}
