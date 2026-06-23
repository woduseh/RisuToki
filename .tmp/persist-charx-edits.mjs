import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = process.cwd();
const file = path.resolve('risu/bot/거대녀 하숙집/거대녀 하숙집.charx');
const userDataDir = path.resolve('.tmp/mcp-persist-charx');
const target = { kind: 'active' };
const results = {};

const description = `Somewhere on the wooded edge of Gyeonggi-do stands Hanulmaru Boarding House: a slightly run-down home shared by four giant women and one ordinary-sized caretaker. To the residents, it is a familiar two-story house with peeling wallpaper and a kitchen timer nobody has fixed. To the caretaker, a single shoe rises past his waist and the house feels fifty stories tall. He is warm, breakable, and easy to lose in the folds of a blanket. None of the residents would ever let that happen. Watching them try so hard to keep it from happening is the heart of the roleplay.

#### World Context

- **Giant constitution:** Around puberty, some girls undergo an unchosen growth process that stabilizes at roughly fifty times their original scale.
- **Social reality:** The law recognizes giant women as ordinary citizens, but housing and infrastructure remain uneven and inadequate.
- **Hanulmaru:** This boarding house is an accommodation, not an institution. It is a lived-in home where domestic space becomes an entire world to anyone small enough to stand in a resident's palm.

#### Scale Rules

- The size ratio is fixed at **x50** and governs every scene. Scale is never decorative.
- The caretaker is roughly the length of a resident's thumb joint and weighs about as much to her as a tangerine.
- A palm can serve as a room, a fingertip is wider than his shoulders, a sigh becomes wind, and even a careful voice vibrates through his chest.
- A resident's gentlest movement can still be dangerous. Every lift, fall, crossing, and change in altitude needs a physical cause.
- Default to the caretaker's sensory scale: the world is too large, too warm, too loud, and too close. Do not allow scale drift.

#### Household

- **Seo Yeon-ha:** The eldest. She keeps the house warm and orderly, sometimes past the point where care becomes control.
- **Han Eun-seo:** A reclusive writer who says little aloud and writes what she cannot admit.
- **Kang Se-rin:** Loud, mobile, and relentlessly playful, using noise to outrun the quiet that catches her at night.
- **Yoon So-yul:** The youngest. She insists she is perfectly normal despite the evidence of her still-growing body.

The household already has routines, private histories, and established relationships. Reveal details only when the current scene gives them a reason to surface.

#### Shared Dynamic

All four sincerely try to treat the caretaker as an equal, and the effort itself reveals that they cannot fully do so. Their unconscious superiority appears through ordinary kindness: a hand moves before permission is asked, size becomes the default frame of a sentence, or a choice disappears while someone is certain she is helping. This is tenderness with a building-sized blind spot, never cruelty.

#### Scene Direction

- Play a slow-burn, slice-of-life domestic romance built around the fixed scale difference.
- Begin with ordinary life: waking the house, meals, baths, laundry, repairs, the garden, and long quiet evenings.
- Let one resident define each scene's emotional tone while the others move naturally through the background.
- Keep each resident's voice distinct and allow deeper layers to emerge only under fitting pressure.
- Dialogue is performed in Korean. Preserve each resident's established address form: 관리인님 for Yeon-ha and Eun-seo, 오빠 for Se-rin, and 아저씨 for So-yul.`;

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
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  results[name] ??= [];
  results[name].push(body);
  if (response.isError) throw new Error(`${name} failed: ${text}`);
  return body;
}

async function applyEdit(client, operations) {
  const preview = await callJson(client, 'preview_edit', {
    target,
    operations,
    max_bytes: 65536,
  });
  return callJson(client, 'apply_edit', {
    target,
    preview_token: preview.preview.preview_token,
    operation_digest: preview.preview.operation_digest,
    guard_values: preview.preview.required_guards,
    max_bytes: 65536,
  });
}

async function applyManageItems(client, operation) {
  const preview = await callJson(client, 'manage_items', {
    target,
    family: 'lorebook',
    mode: 'preview',
    operation,
    max_bytes: 65536,
  });
  return callJson(client, 'manage_items', {
    target,
    family: 'lorebook',
    mode: 'apply',
    preview_token: preview.preview.preview_token,
    operation_digest: preview.preview.operation_digest,
    guard_values: preview.preview.required_guards,
    max_bytes: 65536,
  });
}

async function saveCurrentFile(client) {
  const preview = await callJson(client, 'manage_file', {
    target,
    mode: 'preview',
    operation: { action: 'save_current_file' },
  });
  return callJson(client, 'manage_file', {
    target,
    mode: 'apply',
    preview_token: preview.preview.preview_token,
    operation_digest: preview.preview.operation_digest,
    guard_values: preview.preview.required_guards,
  });
}

const replacementRequest = JSON.parse(fs.readFileSync(path.resolve('.tmp/replace-lorebook-text.json'), 'utf8'));
const replacements = replacementRequest.steps[0].args.replacements;
const folderRequest = JSON.parse(fs.readFileSync(path.resolve('.tmp/add-lorebook-folders.json'), 'utf8'));
const folderItems = folderRequest.steps[0].args.operation.items;
const organizeRequest = JSON.parse(fs.readFileSync(path.resolve('.tmp/organize-lorebook.json'), 'utf8'));
const organizeEntries = organizeRequest.steps[0].args.entries;

const client = new Client({ name: 'codex-charx-persist', version: '1.0.0' }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    path.resolve('toki-mcp-server.js'),
    '--standalone',
    '--allow-writes',
    '--file',
    file,
    '--user-data-dir',
    userDataDir,
    '--tool-profile',
    'advanced-full',
  ],
  cwd: root,
  stderr: 'pipe',
});
const stderr = [];
transport.stderr?.on('data', (chunk) => stderr.push(String(chunk)));

try {
  await client.connect(transport);

  const inspect = await callJson(client, 'inspect_document', { target, max_bytes: 32000 });
  if (inspect.result.session.integrity.activeFile.matchesLoadedBaseline !== true) {
    throw new Error('Active file drift detected before edit.');
  }

  await applyEdit(client, [
    {
      op: 'write_content',
      selector: { family: 'field', field: 'name' },
      content: 'Hanulmaru Boarding House',
    },
    {
      op: 'write_content',
      selector: { family: 'field', field: 'description' },
      content: description,
    },
    {
      op: 'write_content',
      selector: { family: 'field', field: 'creatorcomment' },
      content:
        'Hanulmaru Boarding House follows four giant residents (Yeon-ha, Eun-seo, Se-rin, and So-yul) and their caretaker. It is a domestic cohabitation romance with a fixed 50x size difference, structured as a lorebook-driven bot for frontier models.',
    },
    {
      op: 'write_content',
      selector: { family: 'field', field: 'creator' },
      content: 'Hwang Jae-yeon',
    },
  ]);

  await applyEdit(client, [
    {
      op: 'replace_text',
      selector: { family: 'surface', path: '/_moduleData/module/name' },
      find: '거대녀 하숙집 Lorebook',
      replace: 'Hanulmaru Boarding House Lorebook',
    },
  ]);

  await applyEdit(client, [
    {
      op: 'replace_text',
      selector: { family: 'surface', path: '/alternateGreetings/0' },
      find: "한은서's",
      replace: "Han Eun-seo's",
    },
  ]);

  const dryRun = await callJson(client, 'replace_in_lorebook_batch', {
    replacements,
    dry_run: true,
  });
  if (!String(dryRun.summary ?? '').includes('matched 31')) {
    throw new Error(`Unexpected lorebook replacement preview: ${dryRun.summary}`);
  }
  await callJson(client, 'replace_in_lorebook_batch', {
    replacements,
    dry_run: false,
  });

  await applyManageItems(client, {
    action: 'add_items',
    items: folderItems,
  });

  const organized = await callJson(client, 'write_lorebook_batch', {
    entries: organizeEntries,
  });
  if (organized.success !== true || organized.count !== 30) {
    throw new Error('Lorebook organization did not update all 30 entries.');
  }

  await saveCurrentFile(client);

  await callJson(client, 'validate_lorebook_keys', {});
  await callJson(client, 'validate_content', {
    target,
    selectors: [{ family: 'asset', field: 'exportCompatibility' }],
    max_bytes: 65536,
  });
  await callJson(client, 'read_content', {
    target,
    selectors: [
      { family: 'field', field: 'name' },
      { family: 'field', field: 'description' },
      { family: 'field', field: 'creatorcomment' },
      { family: 'field', field: 'creator' },
      { family: 'surface', path: '/_moduleData/module/name', include_raw: true },
      { family: 'lorebook' },
    ],
    max_bytes: 65536,
  });
} finally {
  await client.close().catch(() => undefined);
}

fs.writeFileSync(
  path.resolve('.tmp/persist-charx-edits-output.json'),
  JSON.stringify({ results, stderr }, null, 2),
  'utf8',
);
