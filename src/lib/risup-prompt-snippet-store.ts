import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { parsePromptTemplateFromText, serializePromptTemplateToText } from './risup-prompt-model';
import { parseStoredJson } from './stored-state-validation';

export const RISUP_PROMPT_SNIPPET_LIBRARY_FILENAME = 'risup-prompt-snippets.json';
export const RISUP_PROMPT_SNIPPET_LIBRARY_VERSION = 1;

export const risupPromptSnippetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  text: z.string(),
  itemCount: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const risupPromptSnippetLibrarySchema = z.object({
  version: z.literal(RISUP_PROMPT_SNIPPET_LIBRARY_VERSION),
  snippets: z.array(risupPromptSnippetSchema),
});

export type RisupPromptSnippet = z.infer<typeof risupPromptSnippetSchema>;
export type RisupPromptSnippetLibrary = z.infer<typeof risupPromptSnippetLibrarySchema>;

export interface RisupPromptSnippetSummary {
  id: string;
  name: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveRisupPromptSnippetResult {
  created: boolean;
  hasUnsupportedContent: boolean;
  snippet: RisupPromptSnippet;
}

function createEmptyRisupPromptSnippetLibrary(): RisupPromptSnippetLibrary {
  return {
    version: RISUP_PROMPT_SNIPPET_LIBRARY_VERSION,
    snippets: [],
  };
}

function normalizeSnippetName(name: string): string {
  return name.trim();
}

function ensureSnippetLibraryDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeSnippetLibrary(filePath: string, library: RisupPromptSnippetLibrary): void {
  ensureSnippetLibraryDirectory(filePath);
  fs.writeFileSync(filePath, JSON.stringify(library, null, 2), 'utf8');
}

function findSnippetIndex(library: RisupPromptSnippetLibrary, identifier: string): number {
  const normalized = identifier.trim();
  if (!normalized) return -1;

  const byId = library.snippets.findIndex((snippet) => snippet.id === normalized);
  if (byId >= 0) return byId;
  return library.snippets.findIndex((snippet) => snippet.name === normalized);
}

export function getRisupPromptSnippetLibraryPath(userDataPath: string): string {
  return path.join(userDataPath, RISUP_PROMPT_SNIPPET_LIBRARY_FILENAME);
}

export function readRisupPromptSnippetLibrary(filePath: string): RisupPromptSnippetLibrary {
  if (!fs.existsSync(filePath)) {
    return createEmptyRisupPromptSnippetLibrary();
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = parseStoredJson(raw, risupPromptSnippetLibrarySchema);
  if (!parsed) {
    throw new Error(`Invalid risup prompt snippet library JSON at ${filePath}`);
  }
  return parsed;
}

export function listRisupPromptSnippets(filePath: string): RisupPromptSnippetSummary[] {
  const library = readRisupPromptSnippetLibrary(filePath);
  return [...library.snippets]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name))
    .map((snippet) => ({
      id: snippet.id,
      name: snippet.name,
      itemCount: snippet.itemCount,
      createdAt: snippet.createdAt,
      updatedAt: snippet.updatedAt,
    }));
}

export function readRisupPromptSnippet(filePath: string, identifier: string): RisupPromptSnippet | null {
  const library = readRisupPromptSnippetLibrary(filePath);
  const index = findSnippetIndex(library, identifier);
  return index >= 0 ? library.snippets[index] : null;
}

export function canonicalizeRisupPromptSnippetText(text: string): {
  text: string;
  itemCount: number;
  hasUnsupportedContent: boolean;
} {
  const parsed = parsePromptTemplateFromText(text);
  if (parsed.state === 'invalid') {
    throw new Error(parsed.parseError || 'Invalid risup prompt snippet text');
  }
  return {
    text: serializePromptTemplateToText(parsed),
    itemCount: parsed.items.length,
    hasUnsupportedContent: parsed.hasUnsupportedContent,
  };
}

export function saveRisupPromptSnippet(
  filePath: string,
  input: { name: string; text: string; now?: () => string },
): SaveRisupPromptSnippetResult {
  const name = normalizeSnippetName(input.name);
  if (!name) {
    throw new Error('Snippet name must not be empty');
  }

  const normalized = canonicalizeRisupPromptSnippetText(input.text);
  const library = readRisupPromptSnippetLibrary(filePath);
  const now = input.now?.() ?? new Date().toISOString();
  const existingIndex = library.snippets.findIndex((snippet) => snippet.name === name);

  let snippet: RisupPromptSnippet;
  let created = false;
  if (existingIndex >= 0) {
    const existing = library.snippets[existingIndex];
    snippet = {
      ...existing,
      name,
      text: normalized.text,
      itemCount: normalized.itemCount,
      updatedAt: now,
    };
    library.snippets[existingIndex] = snippet;
  } else {
    created = true;
    snippet = {
      id: crypto.randomUUID(),
      name,
      text: normalized.text,
      itemCount: normalized.itemCount,
      createdAt: now,
      updatedAt: now,
    };
    library.snippets.push(snippet);
  }

  writeSnippetLibrary(filePath, library);
  return {
    created,
    hasUnsupportedContent: normalized.hasUnsupportedContent,
    snippet,
  };
}

export function deleteRisupPromptSnippet(filePath: string, identifier: string): RisupPromptSnippet | null {
  const library = readRisupPromptSnippetLibrary(filePath);
  const index = findSnippetIndex(library, identifier);
  if (index < 0) {
    return null;
  }

  const [removed] = library.snippets.splice(index, 1);
  writeSnippetLibrary(filePath, library);
  return removed;
}
