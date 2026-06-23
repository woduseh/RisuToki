import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const target = { kind: 'active' };
const fixes = [
  { index: 0, find: 'Yeon-ha (서연하)', replace: 'Yeon-ha', expected_comment: '📏 크기와 물리 법칙' },
  { index: 0, find: 'Se-rin (강세린)', replace: 'Se-rin', expected_comment: '📏 크기와 물리 법칙' },
  { index: 0, find: 'Eun-seo (한은서)', replace: 'Eun-seo', expected_comment: '📏 크기와 물리 법칙' },
  {
    index: 2,
    find: '**서연하 (Seo Yeon-ha),',
    replace: '**Seo Yeon-ha,',
    expected_comment: '👥 주요 인물 요약',
  },
  {
    index: 2,
    find: '**한은서 (Han Eun-seo),',
    replace: '**Han Eun-seo,',
    expected_comment: '👥 주요 인물 요약',
  },
  {
    index: 2,
    find: '**강세린 (Kang Se-rin / Céline),',
    replace: '**Kang Se-rin / Céline,',
    expected_comment: '👥 주요 인물 요약',
  },
  {
    index: 3,
    find: '### Giant Constitution (거대 체질)',
    replace: '### Giant Constitution',
    expected_comment: '🌍 하늘마루와 거대 체질',
  },
  {
    index: 3,
    find: '### Hanulmaru Boarding House (하늘마루 하숙집)',
    replace: '### Hanulmaru Boarding House',
    expected_comment: '🌍 하늘마루와 거대 체질',
  },
  {
    index: 27,
    find: '# 한은서 — the novel, and the goddess',
    replace: '# Han Eun-seo — the novel, and the goddess',
    expected_comment: '🔒 한은서: 소설과 욕망',
  },
];

function textContent(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((entry) => entry?.type === 'text' && typeof entry.text === 'string')
    .map((entry) => entry.text)
    .join('\n');
}

async function callJson(client, name, args) {
  const response = await client.callTool({ name, arguments: args });
  const text = textContent(response.content);
  const body = JSON.parse(text);
  if (response.isError) throw new Error(`${name} failed: ${text}`);
  return body;
}

const client = new Client({ name: 'codex-charx-fix', version: '1.0.0' }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    path.resolve('toki-mcp-server.js'),
    '--standalone',
    '--allow-writes',
    '--file',
    path.resolve('risu/bot/거대녀 하숙집/거대녀 하숙집.charx'),
    '--user-data-dir',
    path.resolve('.tmp/mcp-fix-charx'),
    '--tool-profile',
    'advanced-full',
  ],
  cwd: process.cwd(),
  stderr: 'pipe',
});

const results = [];
try {
  await client.connect(transport);
  for (const fix of fixes) {
    const dryRun = await callJson(client, 'replace_in_lorebook_batch', {
      replacements: [fix],
      dry_run: true,
    });
    if (!String(dryRun.summary ?? '').includes('matched 1')) {
      throw new Error(`Expected one match for ${fix.find}: ${dryRun.summary}`);
    }
    results.push(
      await callJson(client, 'replace_in_lorebook_batch', {
        replacements: [fix],
        dry_run: false,
      }),
    );
  }

  const savePreview = await callJson(client, 'manage_file', {
    target,
    mode: 'preview',
    operation: { action: 'save_current_file' },
  });
  results.push(
    await callJson(client, 'manage_file', {
      target,
      mode: 'apply',
      preview_token: savePreview.preview.preview_token,
      operation_digest: savePreview.preview.operation_digest,
      guard_values: savePreview.preview.required_guards,
    }),
  );

  results.push(
    await callJson(client, 'validate_content', {
      target,
      selectors: [{ family: 'asset', field: 'exportCompatibility' }],
      max_bytes: 65536,
    }),
  );
} finally {
  await client.close().catch(() => undefined);
}

fs.writeFileSync(path.resolve('.tmp/fix-remaining-lorebook-output.json'), JSON.stringify(results, null, 2), 'utf8');
