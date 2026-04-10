// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { parsePromptTemplate, serializePromptTemplateToText } from './risup-prompt-model';
import {
  canonicalizeRisupPromptSnippetText,
  deleteRisupPromptSnippet,
  getRisupPromptSnippetLibraryPath,
  listRisupPromptSnippets,
  readRisupPromptSnippet,
  readRisupPromptSnippetLibrary,
  saveRisupPromptSnippet,
} from './risup-prompt-snippet-store';

const tempDirs: string[] = [];

function createTempLibraryPath(): string {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'risup-prompt-snippets-'));
  tempDirs.push(dirPath);
  return getRisupPromptSnippetLibraryPath(dirPath);
}

function createSnippetText(text: string): string {
  return serializePromptTemplateToText(
    parsePromptTemplate(JSON.stringify([{ type: 'plain', type2: 'normal', text, role: 'system' }])),
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dirPath = tempDirs.pop();
    if (dirPath && fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }
});

describe('risup prompt snippet store', () => {
  it('creates, updates, lists, and reads snippets by id or name', () => {
    const filePath = createTempLibraryPath();
    const first = saveRisupPromptSnippet(filePath, {
      name: ' Greeting blocks ',
      text: createSnippetText('Hello'),
      now: () => '2026-04-10T00:00:00.000Z',
    });

    expect(first.created).toBe(true);
    expect(first.snippet.name).toBe('Greeting blocks');
    expect(first.snippet.itemCount).toBe(1);

    const second = saveRisupPromptSnippet(filePath, {
      name: 'Greeting blocks',
      text: createSnippetText('Updated'),
      now: () => '2026-04-10T01:00:00.000Z',
    });

    expect(second.created).toBe(false);
    expect(second.snippet.id).toBe(first.snippet.id);
    expect(second.snippet.createdAt).toBe('2026-04-10T00:00:00.000Z');
    expect(second.snippet.updatedAt).toBe('2026-04-10T01:00:00.000Z');

    expect(listRisupPromptSnippets(filePath)).toEqual([
      {
        id: first.snippet.id,
        name: 'Greeting blocks',
        itemCount: 1,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T01:00:00.000Z',
      },
    ]);

    expect(readRisupPromptSnippet(filePath, first.snippet.id)?.text).toContain('Updated');
    expect(readRisupPromptSnippet(filePath, 'Greeting blocks')?.id).toBe(first.snippet.id);
  });

  it('deletes snippets and persists an empty library', () => {
    const filePath = createTempLibraryPath();
    const saved = saveRisupPromptSnippet(filePath, {
      name: 'Delete me',
      text: createSnippetText('Delete me'),
      now: () => '2026-04-10T00:00:00.000Z',
    });

    const removed = deleteRisupPromptSnippet(filePath, saved.snippet.id);
    expect(removed?.name).toBe('Delete me');
    expect(readRisupPromptSnippet(filePath, saved.snippet.id)).toBeNull();
    expect(readRisupPromptSnippetLibrary(filePath)).toEqual({ version: 1, snippets: [] });
  });

  it('rejects invalid snippet text and invalid stored JSON', () => {
    const filePath = createTempLibraryPath();

    expect(() => canonicalizeRisupPromptSnippetText('not a prompt block')).toThrow();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{"version":1,"snippets":[{"name":"broken"}]}', 'utf8');
    expect(() => readRisupPromptSnippetLibrary(filePath)).toThrow(/Invalid risup prompt snippet library JSON/);
  });
});
