/**
 * lorebook-io.ts — Export/Import lorebook entries to/from filesystem
 *
 * Supports two formats:
 * - Markdown: One file per entry with YAML frontmatter, folder structure as directories
 * - JSON: Single file with all entries and folder mapping
 */
import * as fs from 'fs';
import * as path from 'path';

import { buildFolderInfoMap, normalizeFolderRef } from './lorebook-folders';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata fields stored in YAML frontmatter (everything except content) */
const FRONTMATTER_FIELDS = [
  'key',
  'secondkey',
  'mode',
  'insertorder',
  'order',
  'priority',
  'alwaysActive',
  'forceActivation',
  'selective',
  'constant',
  'useRegex',
] as const;

/** Fields allowed for lorebook write operations */
const LOREBOOK_WRITE_FIELDS = new Set([
  'key',
  'secondkey',
  'comment',
  'content',
  'mode',
  'insertorder',
  'order',
  'priority',
  'alwaysActive',
  'forceActivation',
  'selective',
  'constant',
  'useRegex',
  'folder',
  'extentions',
  'id',
]);

export interface LorebookEntry {
  key?: string;
  secondkey?: string;
  comment?: string;
  content?: string;
  mode?: string;
  insertorder?: number;
  order?: number;
  priority?: number;
  alwaysActive?: boolean;
  forceActivation?: boolean;
  selective?: boolean;
  constant?: boolean;
  useRegex?: boolean;
  folder?: string;
  extentions?: Record<string, unknown>;
  id?: string;
  [k: string]: unknown;
}

export interface FolderInfo {
  id: string; // "folder:uuid"
  name: string; // folder comment
}

export interface ExportOptions {
  format: 'md' | 'json';
  groupByFolder?: boolean; // default true
  includeMetadata?: boolean; // default true — write _export_meta.json
  sourceName?: string; // source file name for metadata
}

export interface ImportOptions {
  format: 'md' | 'json';
  createFolders?: boolean; // default true — create folder entries from directory structure
  conflict?: 'skip' | 'overwrite' | 'rename'; // default 'skip'
  dryRun?: boolean; // default false
}

export interface ImportEntry {
  comment: string;
  data: LorebookEntry;
  folderName?: string; // directory name → maps to folder
  sourcePath: string; // original file path (for reporting)
}

export interface ExportResult {
  success: boolean;
  exportedCount: number;
  skippedCount: number;
  files: string[];
  targetDir: string;
}

export interface ImportResult {
  success: boolean;
  entries: ImportEntry[];
  totalFound: number;
  /** Only present when dryRun=false */
  imported?: number;
  skipped?: number;
  overwritten?: number;
  renamed?: number;
  foldersCreated?: number;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// YAML Frontmatter — simple key:value parser (no external dependency)
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a markdown string.
 * Expects `---\nkey: value\n---\n` at the start.
 */
export function parseYamlFrontmatter(text: string): {
  meta: Record<string, unknown>;
  content: string;
} {
  const trimmed = text.replace(/^\uFEFF/, ''); // strip BOM
  if (!trimmed.startsWith('---')) {
    return { meta: {}, content: trimmed };
  }

  const endIdx = trimmed.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { meta: {}, content: trimmed };
  }

  const yamlBlock = trimmed.slice(4, endIdx); // skip opening "---\n"
  const rest = trimmed.slice(endIdx + 4); // skip closing "\n---"
  // Strip up to one blank line after closing --- (matches stringifyYamlFrontmatter format)
  const content = rest.replace(/^\n{1,2}/, '');

  const meta: Record<string, unknown> = {};
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1).trim();
    if (!key) continue;
    meta[key] = parseYamlValue(rawVal);
  }

  return { meta, content };
}

/** Parse a simple YAML scalar value (string, number, boolean) */
function parseYamlValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === '') return '';

  // Quoted string
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }

  // Number
  const num = Number(raw);
  if (!isNaN(num) && raw !== '') return num;

  return raw;
}

/**
 * Generate YAML frontmatter + content string for a lorebook entry.
 */
export function stringifyYamlFrontmatter(meta: Record<string, unknown>, content: string): string {
  const lines: string[] = ['---'];

  for (const field of FRONTMATTER_FIELDS) {
    if (field in meta) {
      const val = meta[field];
      if (typeof val === 'string') {
        // Quote strings that contain special YAML chars or commas
        if (
          val.includes(':') ||
          val.includes('#') ||
          val.includes('"') ||
          val.includes("'") ||
          val.includes('\n') ||
          val.includes(',') ||
          val.startsWith(' ') ||
          val.endsWith(' ')
        ) {
          lines.push(`${field}: "${val.replace(/"/g, '\\"')}"`);
        } else {
          lines.push(`${field}: ${val}`);
        }
      } else {
        lines.push(`${field}: ${JSON.stringify(val)}`);
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(content);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Filename sanitization
// ---------------------------------------------------------------------------

/** Characters forbidden in filenames across OS */
const FORBIDDEN_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const MAX_FILENAME_LENGTH = 200;

/**
 * Sanitize a string for use as a filename.
 * Returns a safe filename (without extension).
 */
export function sanitizeFilename(name: string): string {
  if (!name || !name.trim()) return '_unnamed';

  let safe = name
    .replace(FORBIDDEN_CHARS, '_')
    .replace(/\.{2,}/g, '_') // no consecutive dots
    .trim()
    .replace(/^\.+/, '_') // no leading dots
    .replace(/[\s.]+$/, ''); // no trailing spaces/dots

  if (safe.length > MAX_FILENAME_LENGTH) {
    safe = safe.slice(0, MAX_FILENAME_LENGTH);
  }

  return safe || '_unnamed';
}

/**
 * Resolve filename conflicts by appending _2, _3, etc.
 */
function resolveFilenameConflict(dir: string, baseName: string, ext: string): string {
  let candidate = `${baseName}${ext}`;
  let counter = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${baseName}_${counter}${ext}`;
    counter++;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Folder mapping
// ---------------------------------------------------------------------------

/**
 * Build a map from folder ID ("folder:uuid") to folder name (comment).
 */
export function buildFolderMap(entries: LorebookEntry[]): Map<string, string> {
  return new Map(
    Array.from(buildFolderInfoMap(entries).entries()).map(([folderId, info]) => [folderId, info.name] as const),
  );
}

// ---------------------------------------------------------------------------
// Path security
// ---------------------------------------------------------------------------

/**
 * Validate that a resolved path is within the allowed base directory.
 * Prevents path traversal attacks.
 */
export function isPathSafe(targetDir: string, filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const base = path.resolve(targetDir);
  return resolved.startsWith(base + path.sep) || resolved === base;
}

// ---------------------------------------------------------------------------
// Export — Markdown
// ---------------------------------------------------------------------------

/**
 * Export lorebook entries to markdown files in targetDir.
 * Folder entries are skipped (they become directories).
 */
export async function exportToMarkdown(
  entries: LorebookEntry[],
  targetDir: string,
  options: Partial<ExportOptions> = {},
): Promise<ExportResult> {
  const groupByFolder = options.groupByFolder !== false;
  const includeMetadata = options.includeMetadata !== false;

  const resolvedDir = path.resolve(targetDir);
  await fs.promises.mkdir(resolvedDir, { recursive: true });

  const folderMap = buildFolderMap(entries);
  const files: string[] = [];
  let exportedCount = 0;
  let skippedCount = 0;

  // Write export metadata
  if (includeMetadata) {
    const meta = {
      format: 'md',
      source: options.sourceName || 'unknown',
      exportDate: new Date().toISOString(),
      totalEntries: entries.filter((e) => e.mode !== 'folder').length,
      folders: Array.from(folderMap.entries()).map(([id, name]) => ({
        id,
        name,
      })),
    };
    const metaPath = path.join(resolvedDir, '_export_meta.json');
    await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    files.push('_export_meta.json');
  }

  for (const entry of entries) {
    // Skip folder entries (they become directories)
    if (entry.mode === 'folder') {
      skippedCount++;
      continue;
    }

    const comment = entry.comment || '_unnamed';

    // Determine target subdirectory
    let subDir = resolvedDir;
    if (groupByFolder && entry.folder) {
      const folderRef = normalizeFolderRef(entry.folder);
      const folderName = folderMap.get(folderRef);
      if (folderName) {
        subDir = path.join(resolvedDir, sanitizeFilename(folderName));
      } else {
        subDir = path.join(resolvedDir, '_unfiled');
      }
    } else if (groupByFolder && !entry.folder) {
      // Entries without folder go to _unfiled (only if there are folders)
      if (folderMap.size > 0) {
        subDir = path.join(resolvedDir, '_unfiled');
      }
    }

    // Validate path safety
    if (!isPathSafe(resolvedDir, subDir)) {
      skippedCount++;
      continue;
    }

    await fs.promises.mkdir(subDir, { recursive: true });

    // Build frontmatter metadata
    const meta: Record<string, unknown> = {};
    for (const field of FRONTMATTER_FIELDS) {
      if (field in entry && entry[field] !== undefined) {
        meta[field] = entry[field];
      }
    }

    // Generate file content
    const content = entry.content || '';
    const mdContent = stringifyYamlFrontmatter(meta, content);

    // Resolve filename
    const baseName = sanitizeFilename(comment);
    const fileName = resolveFilenameConflict(subDir, baseName, '.md');
    const filePath = path.join(subDir, fileName);

    await fs.promises.writeFile(filePath, mdContent, 'utf-8');
    files.push(path.relative(resolvedDir, filePath));
    exportedCount++;
  }

  return {
    success: true,
    exportedCount,
    skippedCount,
    files,
    targetDir: resolvedDir,
  };
}

// ---------------------------------------------------------------------------
// Export — JSON
// ---------------------------------------------------------------------------

/**
 * Export lorebook entries to a single JSON file.
 */
export async function exportToJson(
  entries: LorebookEntry[],
  targetDir: string,
  options: Partial<ExportOptions> = {},
): Promise<ExportResult> {
  const resolvedDir = path.resolve(targetDir);
  await fs.promises.mkdir(resolvedDir, { recursive: true });

  const folderMap = buildFolderMap(entries);

  // Separate folders and regular entries
  const regularEntries = entries
    .map((entry, index) => {
      if (entry.mode === 'folder') return null;
      // Include all writable fields
      const exported: Record<string, unknown> = { index };
      for (const key of Object.keys(entry)) {
        if (LOREBOOK_WRITE_FIELDS.has(key) && entry[key] !== undefined) {
          exported[key] = entry[key];
        }
      }
      return exported;
    })
    .filter(Boolean);

  const jsonData = {
    exportMeta: {
      format: 'json',
      source: options.sourceName || 'unknown',
      exportDate: new Date().toISOString(),
      count: regularEntries.length,
    },
    folders: Array.from(folderMap.entries()).map(([id, name]) => ({
      id,
      name,
    })),
    entries: regularEntries,
  };

  const filePath = path.join(resolvedDir, 'lorebook.json');
  await fs.promises.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');

  return {
    success: true,
    exportedCount: regularEntries.length,
    skippedCount: entries.length - regularEntries.length,
    files: ['lorebook.json'],
    targetDir: resolvedDir,
  };
}

// ---------------------------------------------------------------------------
// Export — Field to file
// ---------------------------------------------------------------------------

/**
 * Export a single field value to a file.
 */
export async function exportFieldToFile(
  fieldName: string,
  content: string,
  filePath: string,
  format: 'md' | 'txt' = 'txt',
): Promise<{ success: boolean; filePath: string; size: number }> {
  const resolvedPath = path.resolve(filePath);
  const dir = path.dirname(resolvedPath);
  await fs.promises.mkdir(dir, { recursive: true });

  let output: string;
  if (format === 'md') {
    output = `# ${fieldName}\n\n${content}`;
  } else {
    output = content;
  }

  await fs.promises.writeFile(resolvedPath, output, 'utf-8');

  return {
    success: true,
    filePath: resolvedPath,
    size: Buffer.byteLength(output, 'utf-8'),
  };
}

// ---------------------------------------------------------------------------
// Import — Markdown
// ---------------------------------------------------------------------------

/**
 * Import lorebook entries from markdown files in a directory.
 * Subdirectories are treated as folders.
 */
export async function importFromMarkdown(sourceDir: string): Promise<ImportEntry[]> {
  const resolvedDir = path.resolve(sourceDir);

  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Source directory does not exist: ${resolvedDir}`);
  }

  const entries: ImportEntry[] = [];

  // Read top-level .md files (unfiled entries)
  await collectMdFiles(resolvedDir, resolvedDir, undefined, entries);

  // Read subdirectories (folder entries)
  const dirents = await fs.promises.readdir(resolvedDir, {
    withFileTypes: true,
  });
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    if (dirent.name.startsWith('.') || dirent.name === 'node_modules') continue;

    const subDir = path.join(resolvedDir, dirent.name);
    const folderName = dirent.name === '_unfiled' ? undefined : dirent.name;
    await collectMdFiles(subDir, resolvedDir, folderName, entries);
  }

  return entries;
}

/** Collect .md files from a directory into ImportEntry[] */
async function collectMdFiles(
  dir: string,
  baseDir: string,
  folderName: string | undefined,
  entries: ImportEntry[],
): Promise<void> {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    if (!dirent.name.endsWith('.md')) continue;
    if (dirent.name.startsWith('_')) continue; // skip metadata files

    const filePath = path.join(dir, dirent.name);
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const { meta, content } = parseYamlFrontmatter(raw);

    // Derive comment from filename (without .md extension)
    const comment = dirent.name.slice(0, -3) || '_unnamed';

    const data: LorebookEntry = {
      comment,
      content,
    };

    // Apply metadata from frontmatter
    for (const [key, value] of Object.entries(meta)) {
      if (LOREBOOK_WRITE_FIELDS.has(key) && key !== 'folder' && key !== 'id') {
        data[key] = value;
      }
    }

    entries.push({
      comment,
      data,
      folderName,
      sourcePath: path.relative(baseDir, filePath),
    });
  }
}

// ---------------------------------------------------------------------------
// Import — JSON
// ---------------------------------------------------------------------------

/**
 * Import lorebook entries from a JSON file.
 */
export async function importFromJson(sourcePath: string): Promise<ImportEntry[]> {
  const resolvedPath = path.resolve(sourcePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Source file does not exist: ${resolvedPath}`);
  }

  const raw = await fs.promises.readFile(resolvedPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON file: ${resolvedPath}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON file must contain an object');
  }

  const obj = parsed as Record<string, unknown>;

  // Support both { entries: [...] } and plain array
  const rawEntries = Array.isArray(obj.entries) ? obj.entries : Array.isArray(parsed) ? parsed : null;

  if (!rawEntries) {
    throw new Error('JSON must contain an "entries" array or be an array');
  }

  // Build folder name map from JSON metadata
  const folderNameMap = new Map<string, string>();
  if (Array.isArray(obj.folders)) {
    for (const f of obj.folders) {
      if (f && typeof f === 'object' && 'id' in f && 'name' in f) {
        folderNameMap.set(normalizeFolderRef(String(f.id)), String(f.name));
      }
    }
  }

  const entries: ImportEntry[] = [];

  for (const raw of rawEntries) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;

    const comment = String(item.comment || '_unnamed');
    const data: LorebookEntry = {};

    // Copy allowed fields
    for (const [key, value] of Object.entries(item)) {
      if (LOREBOOK_WRITE_FIELDS.has(key) && key !== 'folder' && key !== 'id') {
        data[key] = value;
      }
    }
    data.comment = comment;

    // Resolve folder name
    let folderName: string | undefined;
    if (typeof item.folder === 'string' && item.folder) {
      const folderRef = normalizeFolderRef(item.folder);
      folderName = folderNameMap.get(folderRef) || folderRef || undefined;
    }

    entries.push({
      comment,
      data,
      folderName,
      sourcePath: resolvedPath,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Import — Conflict resolution
// ---------------------------------------------------------------------------

/**
 * Resolve import conflicts with existing lorebook entries.
 * Returns entries ready for insertion with folder assignments.
 */
export function resolveImportConflicts(
  importEntries: ImportEntry[],
  existingEntries: LorebookEntry[],
  existingFolderMap: Map<string, string>,
  options: Pick<ImportOptions, 'conflict' | 'createFolders'>,
): {
  toAdd: LorebookEntry[];
  toOverwrite: { index: number; data: LorebookEntry }[];
  skipped: string[];
  renamed: string[];
  newFolders: string[]; // folder names to create
} {
  const conflict = options.conflict || 'skip';
  const createFolders = options.createFolders !== false;

  // Index existing entries by comment for conflict detection
  const existingByComment = new Map<string, number>();
  for (let i = 0; i < existingEntries.length; i++) {
    const comment = existingEntries[i].comment || '';
    if (comment && existingEntries[i].mode !== 'folder') {
      existingByComment.set(comment, i);
    }
  }

  // Collect folder names needed
  const neededFolders = new Set<string>();
  for (const entry of importEntries) {
    if (entry.folderName) {
      neededFolders.add(entry.folderName);
    }
  }

  // Build reverse map: folder name → folder ID
  const existingFolderByName = new Map<string, string>();
  for (const [id, name] of existingFolderMap) {
    existingFolderByName.set(name, id);
  }

  // Determine new folders to create
  const newFolders: string[] = [];
  if (createFolders) {
    for (const name of neededFolders) {
      if (!existingFolderByName.has(name)) {
        newFolders.push(name);
      }
    }
  }

  const toAdd: LorebookEntry[] = [];
  const toOverwrite: { index: number; data: LorebookEntry }[] = [];
  const skipped: string[] = [];
  const renamed: string[] = [];

  for (const entry of importEntries) {
    const data = { ...entry.data };
    const existingIdx = existingByComment.get(entry.comment);

    if (existingIdx !== undefined) {
      switch (conflict) {
        case 'skip':
          skipped.push(entry.comment);
          continue;
        case 'overwrite':
          toOverwrite.push({ index: existingIdx, data });
          break;
        case 'rename': {
          // Find a unique name
          let counter = 2;
          let newComment = `${entry.comment} (${counter})`;
          while (existingByComment.has(newComment)) {
            counter++;
            newComment = `${entry.comment} (${counter})`;
          }
          data.comment = newComment;
          renamed.push(`${entry.comment} → ${newComment}`);
          toAdd.push(data);
          break;
        }
      }
    } else {
      toAdd.push(data);
    }
  }

  return { toAdd, toOverwrite, skipped, renamed, newFolders };
}
