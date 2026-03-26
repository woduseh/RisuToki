import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseYamlFrontmatter,
  stringifyYamlFrontmatter,
  sanitizeFilename,
  buildFolderMap,
  isPathSafe,
  exportToMarkdown,
  exportToJson,
  exportFieldToFile,
  importFromMarkdown,
  importFromJson,
  resolveImportedFolderRef,
  resolveImportConflicts,
  type LorebookEntry,
} from './lorebook-io';

const TEST_DIR = path.join(__dirname, '..', '..', 'test', '_lorebook-io-tmp');

/** Create test entries for export/import tests */
function makeTestEntries(): LorebookEntry[] {
  return [
    // Folder
    {
      comment: 'Characters',
      key: 'folder-uuid-1',
      content: '',
      mode: 'folder',
      insertorder: 100,
    },
    // Entry in folder
    {
      comment: 'Alice',
      key: 'alice, protagonist',
      content: 'Alice is the main character.\nShe has blue eyes.',
      mode: 'normal',
      insertorder: 100,
      alwaysActive: false,
      selective: false,
      useRegex: false,
      folder: 'folder:folder-uuid-1',
    },
    // Entry in folder
    {
      comment: 'Bob',
      key: 'bob, sidekick',
      content: 'Bob is the sidekick.',
      mode: 'normal',
      insertorder: 200,
      alwaysActive: true,
      folder: 'folder:folder-uuid-1',
    },
    // Unfiled entry
    {
      comment: 'World Setting',
      key: 'world',
      content: 'A fantasy world with magic.',
      mode: 'normal',
      insertorder: 50,
    },
  ];
}

function makeLegacyFolderEntries(): LorebookEntry[] {
  return [
    {
      comment: 'Legacy Characters',
      key: '',
      content: '',
      mode: 'folder',
      id: 'legacy-folder-uuid-1',
      insertorder: 100,
    },
    {
      comment: 'Eve',
      key: 'eve',
      content: 'Legacy fallback entry.',
      mode: 'normal',
      folder: 'folder:legacy-folder-uuid-1',
    },
  ];
}

beforeAll(async () => {
  await fs.promises.mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// YAML Frontmatter
// ---------------------------------------------------------------------------

describe('parseYamlFrontmatter', () => {
  it('should parse basic frontmatter', () => {
    const text = '---\nkey: alice\ninsertorder: 100\n---\nHello world';
    const { meta, content } = parseYamlFrontmatter(text);
    expect(meta.key).toBe('alice');
    expect(meta.insertorder).toBe(100);
    expect(content).toBe('Hello world');
  });

  it('should handle quoted strings', () => {
    const text = '---\nkey: "alice, bob"\n---\nContent';
    const { meta } = parseYamlFrontmatter(text);
    expect(meta.key).toBe('alice, bob');
  });

  it('should handle boolean values', () => {
    const text = '---\nalwaysActive: true\nselective: false\n---\n';
    const { meta } = parseYamlFrontmatter(text);
    expect(meta.alwaysActive).toBe(true);
    expect(meta.selective).toBe(false);
  });

  it('should return empty meta for text without frontmatter', () => {
    const { meta, content } = parseYamlFrontmatter('Just plain text');
    expect(meta).toEqual({});
    expect(content).toBe('Just plain text');
  });

  it('should handle BOM', () => {
    const text = '\uFEFF---\nkey: test\n---\nContent';
    const { meta, content } = parseYamlFrontmatter(text);
    expect(meta.key).toBe('test');
    expect(content).toBe('Content');
  });

  it('should handle empty values', () => {
    const text = '---\nsecondkey: \n---\nContent';
    const { meta } = parseYamlFrontmatter(text);
    expect(meta.secondkey).toBe('');
  });
});

describe('stringifyYamlFrontmatter', () => {
  it('should generate valid frontmatter', () => {
    const meta = { key: 'alice', insertorder: 100, alwaysActive: true };
    const result = stringifyYamlFrontmatter(meta, 'Hello');
    expect(result).toContain('---');
    expect(result).toContain('key: alice');
    expect(result).toContain('insertorder: 100');
    expect(result).toContain('alwaysActive: true');
    expect(result).toContain('Hello');
  });

  it('should quote strings with special characters', () => {
    const meta = { key: 'alice: the hero' };
    const result = stringifyYamlFrontmatter(meta, '');
    expect(result).toContain('key: "alice: the hero"');
  });

  it('should roundtrip with parseYamlFrontmatter', () => {
    const meta = {
      key: 'alice, bob',
      mode: 'normal',
      insertorder: 100,
      alwaysActive: false,
    };
    const content = 'Multi-line\ncontent\nhere.';
    const serialized = stringifyYamlFrontmatter(meta, content);
    const { meta: parsed, content: parsedContent } = parseYamlFrontmatter(serialized);
    expect(parsed.key).toBe('alice, bob');
    expect(parsed.mode).toBe('normal');
    expect(parsed.insertorder).toBe(100);
    expect(parsed.alwaysActive).toBe(false);
    expect(parsedContent).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// Filename sanitization
// ---------------------------------------------------------------------------

describe('sanitizeFilename', () => {
  it('should remove forbidden characters', () => {
    expect(sanitizeFilename('file<>:"/\\|?*name')).toBe('file_________name');
  });

  it('should handle empty strings', () => {
    expect(sanitizeFilename('')).toBe('_unnamed');
    expect(sanitizeFilename('   ')).toBe('_unnamed');
  });

  it('should truncate long names', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200);
  });

  it('should handle leading dots', () => {
    expect(sanitizeFilename('.hidden')).toBe('_hidden');
  });

  it('should keep valid characters', () => {
    expect(sanitizeFilename('Hello World 2024')).toBe('Hello World 2024');
  });

  it('should handle Korean characters', () => {
    expect(sanitizeFilename('캐릭터 설명')).toBe('캐릭터 설명');
  });
});

// ---------------------------------------------------------------------------
// Folder map
// ---------------------------------------------------------------------------

describe('buildFolderMap', () => {
  it('should map folder entries using canonical key uuids', () => {
    const entries = makeTestEntries();
    const map = buildFolderMap(entries);
    expect(map.size).toBe(1);
    expect(map.get('folder:folder-uuid-1')).toBe('Characters');
  });

  it('should fall back to legacy folder ids', () => {
    const map = buildFolderMap(makeLegacyFolderEntries());
    expect(map.size).toBe(1);
    expect(map.get('folder:legacy-folder-uuid-1')).toBe('Legacy Characters');
  });

  it('should handle empty entries', () => {
    const map = buildFolderMap([]);
    expect(map.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

describe('isPathSafe', () => {
  it('should allow paths within base', () => {
    expect(isPathSafe('/base/dir', '/base/dir/sub/file.txt')).toBe(true);
  });

  it('should reject path traversal', () => {
    expect(isPathSafe('/base/dir', '/base/dir/../etc/passwd')).toBe(false);
  });

  it('should allow the base directory itself', () => {
    expect(isPathSafe('/base/dir', '/base/dir')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Export — Markdown
// ---------------------------------------------------------------------------

describe('exportToMarkdown', () => {
  it('should export entries as markdown files', async () => {
    const dir = path.join(TEST_DIR, 'export-md');
    const entries = makeTestEntries();
    const result = await exportToMarkdown(entries, dir, {
      sourceName: 'test.charx',
    });

    expect(result.success).toBe(true);
    expect(result.exportedCount).toBe(3); // 3 non-folder entries
    expect(result.skippedCount).toBe(1); // 1 folder entry
    expect(result.files).toContain('_export_meta.json');

    // Check folder structure
    const charDir = path.join(dir, 'Characters');
    expect(fs.existsSync(charDir)).toBe(true);
    expect(fs.existsSync(path.join(charDir, 'Alice.md'))).toBe(true);
    expect(fs.existsSync(path.join(charDir, 'Bob.md'))).toBe(true);

    // Check unfiled
    const unfiledDir = path.join(dir, '_unfiled');
    expect(fs.existsSync(path.join(unfiledDir, 'World Setting.md'))).toBe(true);

    // Verify content
    const aliceContent = await fs.promises.readFile(path.join(charDir, 'Alice.md'), 'utf-8');
    expect(aliceContent).toContain('key: "alice, protagonist"');
    expect(aliceContent).toContain('Alice is the main character.');

    // Verify metadata
    const metaContent = await fs.promises.readFile(path.join(dir, '_export_meta.json'), 'utf-8');
    const meta = JSON.parse(metaContent);
    expect(meta.source).toBe('test.charx');
    expect(meta.totalEntries).toBe(3);
  });

  it('should resolve mixed legacy child refs to canonical key folders during export', async () => {
    const dir = path.join(TEST_DIR, 'export-md-mixed-folder-refs');
    const entries: LorebookEntry[] = [
      { comment: 'Characters', key: 'canonical-folder-uuid', id: 'legacy-folder-id', content: '', mode: 'folder' },
      { comment: 'Alice', key: 'alice', content: 'Hero', mode: 'normal', folder: 'folder:legacy-folder-id' },
    ];

    const result = await exportToMarkdown(entries, dir);

    expect(result.exportedCount).toBe(1);
    expect(fs.existsSync(path.join(dir, 'Characters', 'Alice.md'))).toBe(true);
  });

  it('should handle filename conflicts', async () => {
    const dir = path.join(TEST_DIR, 'export-md-conflict');
    const entries: LorebookEntry[] = [
      { comment: 'Same Name', content: 'First', mode: 'normal' },
      { comment: 'Same Name', content: 'Second', mode: 'normal' },
    ];
    const result = await exportToMarkdown(entries, dir);
    expect(result.exportedCount).toBe(2);
    expect(fs.existsSync(path.join(dir, 'Same Name.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'Same Name_2.md'))).toBe(true);
  });

  it('should work without folder grouping', async () => {
    const dir = path.join(TEST_DIR, 'export-md-nogroup');
    const entries = makeTestEntries();
    const result = await exportToMarkdown(entries, dir, {
      groupByFolder: false,
    });
    expect(result.exportedCount).toBe(3);
    // All files should be in root dir (no subdirectories)
    expect(fs.existsSync(path.join(dir, 'Alice.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'Bob.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Export — JSON
// ---------------------------------------------------------------------------

describe('exportToJson', () => {
  it('should export entries as JSON', async () => {
    const dir = path.join(TEST_DIR, 'export-json');
    const entries = makeTestEntries();
    const result = await exportToJson(entries, dir, {
      sourceName: 'test.charx',
    });

    expect(result.success).toBe(true);
    expect(result.exportedCount).toBe(3);
    expect(result.files).toEqual(['lorebook.json']);

    const jsonContent = await fs.promises.readFile(path.join(dir, 'lorebook.json'), 'utf-8');
    const data = JSON.parse(jsonContent);
    expect(data.exportMeta.count).toBe(3);
    expect(data.folders).toHaveLength(1);
    expect(data.folders[0].name).toBe('Characters');
    expect(data.entries).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Export — Field
// ---------------------------------------------------------------------------

describe('exportFieldToFile', () => {
  it('should export field as txt', async () => {
    const filePath = path.join(TEST_DIR, 'field-txt', 'desc.txt');
    const result = await exportFieldToFile('description', 'A brave hero.', filePath, 'txt');
    expect(result.success).toBe(true);
    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe('A brave hero.');
  });

  it('should export field as md with header', async () => {
    const filePath = path.join(TEST_DIR, 'field-md', 'desc.md');
    const result = await exportFieldToFile('description', 'A brave hero.', filePath, 'md');
    expect(result.success).toBe(true);
    const content = await fs.promises.readFile(filePath, 'utf-8');
    expect(content).toBe('# description\n\nA brave hero.');
  });
});

// ---------------------------------------------------------------------------
// Import — Markdown
// ---------------------------------------------------------------------------

describe('importFromMarkdown', () => {
  it('should import from previously exported markdown', async () => {
    const dir = path.join(TEST_DIR, 'import-md');
    const entries = makeTestEntries();
    await exportToMarkdown(entries, dir);

    const imported = await importFromMarkdown(dir);
    expect(imported.length).toBe(3); // 3 non-folder entries

    const alice = imported.find((e) => e.comment === 'Alice');
    expect(alice).toBeDefined();
    expect(alice!.data.key).toBe('alice, protagonist');
    expect(alice!.data.content).toContain('Alice is the main character.');
    expect(alice!.folderName).toBe('Characters');
  });

  it('should throw for non-existent directory', async () => {
    await expect(importFromMarkdown('/nonexistent/path')).rejects.toThrow('Source directory does not exist');
  });
});

// ---------------------------------------------------------------------------
// Import — JSON
// ---------------------------------------------------------------------------

describe('importFromJson', () => {
  it('should import from previously exported JSON', async () => {
    const dir = path.join(TEST_DIR, 'import-json');
    const entries = makeTestEntries();
    await exportToJson(entries, dir);

    const imported = await importFromJson(path.join(dir, 'lorebook.json'));
    expect(imported.length).toBe(3);

    const bob = imported.find((e) => e.comment === 'Bob');
    expect(bob).toBeDefined();
    expect(bob!.data.key).toBe('bob, sidekick');
    expect(bob!.data.alwaysActive).toBe(true);
    expect(bob!.folderName).toBe('Characters');
  });

  it('should throw for non-existent file', async () => {
    await expect(importFromJson('/nonexistent/file.json')).rejects.toThrow('Source file does not exist');
  });

  it('should throw for invalid JSON', async () => {
    const filePath = path.join(TEST_DIR, 'invalid.json');
    await fs.promises.writeFile(filePath, 'not json', 'utf-8');
    await expect(importFromJson(filePath)).rejects.toThrow('Invalid JSON');
  });
});

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

describe('resolveImportConflicts', () => {
  const existing: LorebookEntry[] = [
    { comment: 'Alice', content: 'Old Alice', mode: 'normal' },
    { comment: 'Bob', content: 'Old Bob', mode: 'normal' },
  ];
  const existingFolderMap = new Map<string, string>();

  const importEntries = [
    {
      comment: 'Alice',
      data: { comment: 'Alice', content: 'New Alice' },
      sourcePath: 'alice.md',
    },
    {
      comment: 'Charlie',
      data: { comment: 'Charlie', content: 'New Charlie' },
      sourcePath: 'charlie.md',
    },
  ];

  it('should skip conflicts', () => {
    const result = resolveImportConflicts(importEntries, existing, existingFolderMap, { conflict: 'skip' });
    expect(result.skipped).toContain('Alice');
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0].comment).toBe('Charlie');
  });

  it('should overwrite conflicts', () => {
    const result = resolveImportConflicts(importEntries, existing, existingFolderMap, { conflict: 'overwrite' });
    expect(result.toOverwrite).toHaveLength(1);
    expect(result.toOverwrite[0].index).toBe(0);
    expect(result.toAdd).toHaveLength(1);
  });

  it('should rename conflicts', () => {
    const result = resolveImportConflicts(importEntries, existing, existingFolderMap, { conflict: 'rename' });
    expect(result.renamed).toHaveLength(1);
    expect(result.renamed[0]).toContain('Alice');
    expect(result.toAdd).toHaveLength(2); // renamed Alice + Charlie
  });

  it('should detect new folders needed', () => {
    const entriesWithFolder = [
      {
        comment: 'X',
        data: { comment: 'X' },
        folderName: 'New Folder',
        sourcePath: 'x.md',
      },
    ];
    const result = resolveImportConflicts(entriesWithFolder, existing, existingFolderMap, { createFolders: true });
    expect(result.newFolders).toContain('New Folder');
  });

  it('should keep folder metadata for renamed imports', () => {
    const entriesWithFolder = [
      {
        comment: 'Alice',
        data: { comment: 'Alice', content: 'Renamed Alice' },
        folderName: 'Characters',
        sourcePath: 'alice.md',
      },
    ];
    const folderByName = new Map([['Characters', 'folder:folder-uuid-1']]);

    const result = resolveImportConflicts(entriesWithFolder, existing, existingFolderMap, { conflict: 'rename' });

    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0].comment).toBe('Alice (2)');
    expect(resolveImportedFolderRef(result.toAdd[0], folderByName)).toBe('folder:folder-uuid-1');
  });

  it('should clear folder refs for overwrite imports when the imported entry is unfiled', () => {
    const overwriteExisting: LorebookEntry[] = [
      { comment: 'Alice', content: 'Old Alice', mode: 'normal', folder: 'folder:folder-uuid-1' },
    ];
    const folderByName = new Map([['Characters', 'folder:folder-uuid-1']]);

    const result = resolveImportConflicts(
      [
        {
          comment: 'Alice',
          data: { comment: 'Alice', content: 'Imported Alice' },
          sourcePath: 'alice.md',
        },
      ],
      overwriteExisting,
      existingFolderMap,
      { conflict: 'overwrite' },
    );

    expect(result.toOverwrite).toHaveLength(1);
    expect(resolveImportedFolderRef(result.toOverwrite[0].data, folderByName)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Roundtrip: MD export → import
// ---------------------------------------------------------------------------

describe('MD roundtrip', () => {
  it('should preserve data through export→import cycle', async () => {
    const dir = path.join(TEST_DIR, 'roundtrip-md');
    const entries = makeTestEntries();
    await exportToMarkdown(entries, dir);

    const imported = await importFromMarkdown(dir);
    expect(imported.length).toBe(3);

    // Verify Alice roundtrip
    const alice = imported.find((e) => e.comment === 'Alice')!;
    const origAlice = entries.find((e) => e.comment === 'Alice')!;
    expect(alice.data.key).toBe(origAlice.key);
    expect(alice.data.insertorder).toBe(origAlice.insertorder);
    expect(alice.data.alwaysActive).toBe(origAlice.alwaysActive);
    expect(alice.data.content).toBe(origAlice.content);
    expect(alice.folderName).toBe('Characters');
  });
});

// ---------------------------------------------------------------------------
// Roundtrip: JSON export → import
// ---------------------------------------------------------------------------

describe('JSON roundtrip', () => {
  it('should preserve data through export→import cycle', async () => {
    const dir = path.join(TEST_DIR, 'roundtrip-json');
    const entries = makeTestEntries();
    await exportToJson(entries, dir);

    const imported = await importFromJson(path.join(dir, 'lorebook.json'));
    expect(imported.length).toBe(3);

    // Verify Bob roundtrip
    const bob = imported.find((e) => e.comment === 'Bob')!;
    const origBob = entries.find((e) => e.comment === 'Bob')!;
    expect(bob.data.key).toBe(origBob.key);
    expect(bob.data.alwaysActive).toBe(origBob.alwaysActive);
    expect(bob.data.insertorder).toBe(origBob.insertorder);
    expect(bob.folderName).toBe('Characters');
  });
});
