// @vitest-environment node
import * as fs from 'fs';
import * as path from 'path';

import { describe, expect, it } from 'vitest';
import { closeServer, createLegacyTestApiServer, createSearchFixture, getJson, postJson } from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';

const TEST_DIR = useMcpApiTestDir('response-envelope');
const startTestApiServer = createLegacyTestApiServer(TEST_DIR);

// ================================================================
// Envelope migration: residual bare jsonRes → jsonResSuccess
// ================================================================
describe('MCP API response envelope — residual success migration', () => {
  // --- Group 1: Field dry-run previews ---

  it('replace_in_field dry-run includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/replace', {
        find: 'searchable',
        replace: 'findable',
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(typeof res.data.matchCount).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace_block_in_field dry-run includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/block-replace', {
        start_anchor: 'Field',
        end_anchor: 'searchable',
        content: 'NEW',
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(typeof res.data.oldBlockSize).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace_in_field_batch dry-run includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/batch-replace', {
        replacements: [{ find: 'searchable', replace: 'findable' }],
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(typeof res.data.totalMatches).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 2: Field mutation successes ---

  it('replace_block_in_field success includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/block-replace', {
        start_anchor: 'Field',
        end_anchor: 'searchable',
        content: 'NEW',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(typeof res.data.oldBlockSize).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('insert_in_field success includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/insert', {
        content: 'INSERTED',
        position: 0,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.field).toBe('description');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('replace_in_field_batch success includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/description/batch-replace', {
        replacements: [{ find: 'searchable', replace: 'findable' }],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(typeof res.data.totalMatches).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 3: Lorebook dry-run previews ---

  it('replace_across_all_lorebook dry-run includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/replace-all', {
        find: 'alpha',
        replace: 'beta',
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(typeof res.data.totalMatches).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('lorebook block-replace dry-run includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/0/block-replace', {
        start_anchor: 'Lore',
        end_anchor: 'entry.',
        content: 'NEW',
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(typeof res.data.oldBlockSize).toBe('number');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 4: validate_cbs ---

  it('validate_cbs preserves its structured summary payload', async () => {
    const fixture = { ...createSearchFixture(), description: '{{#when toggle_test::1}}yes{{/when}}' };
    const api = await startTestApiServer(fixture);
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/cbs/validate');
      expect(res.status).toBe(200);
      expect(res.data.valid).toBe(true);
      expect(Array.isArray(res.data.entries)).toBe(true);
      expect(res.data.summary).toEqual({ total: 1, passed: 1, failed: 0 });
      expect(res.data).not.toHaveProperty('status');
      expect(res.data).not.toHaveProperty('next_actions');
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 5: list_skills fallback ---

  it('list_skills fallback includes envelope fields', async () => {
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture, [], 'C:\\non\\existent\\path\\skills_missing_12345');
    try {
      const res = await getJson<Record<string, unknown>>(api.port, api.token, '/skills');
      expect(res.status).toBe(200);
      expect(res.data.count).toBe(0);
      expect(Array.isArray(res.data.skills)).toBe(true);
      expect(typeof res.data.error).toBe('string');
      // Envelope fields
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 6: import_lorebook_from_files ---

  it('import_lorebook_from_files empty result includes envelope fields', async () => {
    const importDir = path.join(TEST_DIR, 'envelope-import-empty');
    await fs.promises.rm(importDir, { recursive: true, force: true });
    await fs.promises.mkdir(importDir, { recursive: true });
    const sourcePath = path.join(importDir, 'empty.json');
    await fs.promises.writeFile(sourcePath, JSON.stringify({ entries: [] }, null, 2), 'utf-8');

    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/import', {
        format: 'json',
        source_path: sourcePath,
      });
      expect(res.status).toBe(200);
      expect(res.data.totalFound).toBe(0);
      expect(res.data.imported).toBe(0);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  it('import_lorebook_from_files dry-run includes envelope fields', async () => {
    const importDir = path.join(TEST_DIR, 'envelope-import-dry-run');
    await fs.promises.rm(importDir, { recursive: true, force: true });
    await fs.promises.mkdir(importDir, { recursive: true });
    const sourcePath = path.join(importDir, 'dry-run.json');
    await fs.promises.writeFile(
      sourcePath,
      JSON.stringify(
        {
          entries: [{ comment: 'Imported dry run', key: 'imported-dry-run', content: 'Imported dry-run content.' }],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/import', {
        format: 'json',
        source_path: sourcePath,
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data.dryRun).toBe(true);
      expect(res.data.totalFound).toBe(1);
      expect(res.data.toAdd).toBe(1);
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      expect(fixture.lorebook).toHaveLength(2);
    } finally {
      await closeServer(api.server);
    }
  });

  it('import_lorebook_from_files prefers dry_run when both casing variants are provided', async () => {
    const importDir = path.join(TEST_DIR, 'envelope-import-casing-precedence');
    await fs.promises.rm(importDir, { recursive: true, force: true });
    await fs.promises.mkdir(importDir, { recursive: true });
    const sourcePath = path.join(importDir, 'casing-precedence.json');
    await fs.promises.writeFile(
      sourcePath,
      JSON.stringify(
        {
          entries: [
            { comment: 'Imported precedence', key: 'imported-precedence', content: 'Imported precedence content.' },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/import', {
        format: 'json',
        source_path: sourcePath,
        dry_run: false,
        dryRun: true,
      });
      expect(res.status).toBe(200);
      expect(res.data).not.toHaveProperty('dryRun');
      expect(res.data.imported).toBe(1);
      expect(res.data.status).toBe(200);
    } finally {
      await closeServer(api.server);
    }
  });

  it('import_lorebook_from_files success broadcasts lorebook updates with the standard channel shape', async () => {
    const importDir = path.join(TEST_DIR, 'envelope-import-success');
    await fs.promises.rm(importDir, { recursive: true, force: true });
    await fs.promises.mkdir(importDir, { recursive: true });
    const sourcePath = path.join(importDir, 'success.json');
    await fs.promises.writeFile(
      sourcePath,
      JSON.stringify(
        {
          entries: [{ comment: 'Imported live', key: 'imported-live', content: 'Imported success content.' }],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const broadcasts: Array<[string, ...unknown[]]> = [];
    const api = await startTestApiServer(createSearchFixture(), [], undefined, {
      broadcastToAll: (channel, ...args) => {
        broadcasts.push([channel, ...args]);
      },
    });
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/lorebook/import', {
        format: 'json',
        source_path: sourcePath,
      });
      expect(res.status).toBe(200);
      expect(res.data.imported).toBe(1);
      expect(res.data.status).toBe(200);
      const lorebookBroadcast = broadcasts.find(
        (call) => call[0] === 'data-updated' && call[1] === 'lorebook' && Array.isArray(call[2]),
      );
      expect(lorebookBroadcast).toBeDefined();
      expect(
        (lorebookBroadcast?.[2] as Array<Record<string, unknown>>).some((entry) => entry.comment === 'Imported live'),
      ).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });

  // --- Group 7: export_field_to_file ---

  it('export_field_to_file includes envelope fields', async () => {
    const exportDir = path.join(TEST_DIR, 'envelope-export-field');
    await fs.promises.rm(exportDir, { recursive: true, force: true });
    await fs.promises.mkdir(exportDir, { recursive: true });
    const targetPath = path.join(exportDir, 'description.txt');
    const fixture = createSearchFixture();
    const api = await startTestApiServer(fixture);
    try {
      const res = await postJson<Record<string, unknown>>(api.port, api.token, '/field/export', {
        field: 'description',
        file_path: targetPath,
        format: 'txt',
      });
      expect(res.status).toBe(200);
      expect(res.data.filePath).toBe(path.resolve(targetPath));
      expect(typeof res.data.size).toBe('number');
      expect(res.data.status).toBe(200);
      expect(typeof res.data.summary).toBe('string');
      expect(Array.isArray(res.data.next_actions)).toBe(true);
      await expect(fs.promises.readFile(path.resolve(targetPath), 'utf-8')).resolves.toBe(fixture.description);
    } finally {
      await closeServer(api.server);
    }
  });
});
