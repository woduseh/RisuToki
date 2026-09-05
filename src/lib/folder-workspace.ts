import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import {
  openCharx,
  openRisum,
  openRisup,
  buildCharxZip,
  saveRisum,
  saveRisup,
  saveRisupPresetPayload,
  type LoadedDocumentData,
  type RisupCompressionMode,
} from '../charx-io';
import { parseRisum, buildRisum } from '../rpack';
import {
  stripDeprecatedCharxSaveFields,
  stripDeprecatedRisumSaveFields,
  stripDeprecatedRisupSaveFields,
} from './deprecated-save-policy';
import { writeFileAtomicSync, writePathAtomicSync } from './atomic-write';
import { assertProjectRecoveryResolved, withProjectSaveRecovery } from './project-save-recovery';

export type ProjectFileType = 'charx' | 'risum' | 'risup';

export interface ProjectTreeNode {
  name: string;
  type: 'directory' | 'file';
  relativePath: string;
  children?: ProjectTreeNode[];
}

interface ExtractableField {
  file: string;
  path: string;
}

type BinaryPath = Array<string | number>;

interface WorkspaceMarker {
  version: number;
  sourceFileType?: ProjectFileType;
  sourcePath?: string | null;
  updatedAt?: string;
  compressionMode?: RisupCompressionMode;
  risumAssetFiles?: string[];
  charxManagedFiles?: string[];
  charxExtraEntries?: boolean;
  risupEnvelope?: Record<string, unknown>;
  risupBinaryPaths?: BinaryPath[];
}

const CHARX_EXTRACTABLE_FIELDS: ExtractableField[] = [
  { file: 'description.md', path: 'data.description' },
  { file: 'first_mes.md', path: 'data.first_mes' },
  { file: 'mes_example.md', path: 'data.mes_example' },
  { file: 'creator_notes.md', path: 'data.creator_notes' },
  { file: 'post_history_instructions.md', path: 'data.post_history_instructions' },
  { file: 'backgroundHTML.md', path: 'data.extensions.risuai.backgroundHTML' },
  { file: 'depth_prompt.md', path: 'data.extensions.depth_prompt.prompt' },
];

const CHARX_PROTECTED_PROJECT_FILES = ['personality.md', 'scenario.md', 'system_prompt.md', 'additionalText.md'];

const RISUP_EXTRACTABLE_FIELDS: ExtractableField[] = [
  { file: 'mainPrompt.md', path: 'mainPrompt' },
  { file: 'jailbreak.md', path: 'jailbreak' },
  { file: 'globalNote.md', path: 'globalNote' },
  { file: 'instructChatTemplate.md', path: 'instructChatTemplate' },
  { file: 'JinjaTemplate.md', path: 'JinjaTemplate' },
  { file: 'autoSuggestPrompt.md', path: 'autoSuggestPrompt' },
  { file: 'groupTemplate.md', path: 'groupTemplate' },
  { file: 'systemContentReplacement.md', path: 'systemContentReplacement' },
];

const GREETING_PREFIX = 'greeting_';
const GREETING_PATH = 'data.alternate_greetings';
const PROJECT_META_DIR = '.risutoki';
const WORKSPACE_MARKER_PATH = path.join(PROJECT_META_DIR, 'workspace.json');
const RISUM_ASSET_DIR = path.join(PROJECT_META_DIR, 'risum-assets');
const CHARX_EXTRA_ENTRIES_PATH = path.join(PROJECT_META_DIR, 'charx-extra-entries.zip');

const projectBaselines = new WeakMap<object, Map<string, string>>();
const projectDocumentFiles = new Set([
  'card.json',
  'module.json',
  'preset.json',
  'manifest.json',
  ...CHARX_EXTRACTABLE_FIELDS.map((field) => field.file),
  ...RISUP_EXTRACTABLE_FIELDS.map((field) => field.file),
]);

function projectFingerprint(projectPath: string): string {
  const hash = crypto.createHash('sha256');
  const visit = (directory: string, prefix = ''): void => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (
        !prefix &&
        !projectDocumentFiles.has(entry.name) &&
        !/^greeting_\d+\.md$/.test(entry.name) &&
        !['assets', 'x_meta', PROJECT_META_DIR].includes(entry.name)
      )
        continue;
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath, relativePath);
      else if (entry.isFile()) hash.update(relativePath).update('\0').update(fs.readFileSync(filePath)).update('\0');
    }
  };
  if (fs.existsSync(projectPath)) visit(projectPath);
  return hash.digest('hex');
}

function recordProjectBaseline(projectPath: string, data: object): void {
  const baselines = projectBaselines.get(data) ?? new Map<string, string>();
  baselines.set(path.resolve(projectPath), projectFingerprint(projectPath));
  projectBaselines.set(data, baselines);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isZipDirectory(entry: { isDirectory?: boolean | (() => boolean) }): boolean {
  return typeof entry.isDirectory === 'function' ? entry.isDirectory() : entry.isDirectory === true;
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function removeProjectFiles(projectPath: string, files: readonly string[]): void {
  for (const file of files) {
    fs.rmSync(path.join(projectPath, file), { force: true });
  }
}

function getNestedValue(obj: unknown, dotPath: string): unknown {
  let current = obj as Record<string, unknown> | undefined;
  for (const part of dotPath.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part] as Record<string, unknown> | undefined;
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function setArrayPath(obj: Record<string, unknown>, arrayPath: string, index: number, value: string): void {
  const arr = getNestedValue(obj, arrayPath);
  if (Array.isArray(arr)) {
    while (arr.length < index) arr.push('');
    arr[index] = value;
  }
}

function resolveInsideProject(projectPath: string, relativePath: string): string {
  const normalizedRelative = relativePath.replace(/\\/g, '/');
  if (path.isAbsolute(normalizedRelative) || normalizedRelative.split('/').includes('..')) {
    throw new Error('Invalid project-relative path');
  }
  const resolved = path.resolve(projectPath, normalizedRelative);
  const root = path.resolve(projectPath);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error('Path escapes project folder');
  }
  return resolved;
}

function extractTextFields(
  projectPath: string,
  document: Record<string, unknown>,
  fields: ExtractableField[],
  options: { includeGreetings?: boolean } = {},
): void {
  const manifestPath = path.join(projectPath, 'manifest.json');
  const previousManifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
  const manifest: Record<string, string> = {};
  for (const field of fields) {
    const value = getNestedValue(document, field.path);
    const mdPath = path.join(projectPath, field.file);
    if (typeof value === 'string' && value.trim().length > 0) {
      fs.writeFileSync(mdPath, value, 'utf-8');
      manifest[field.file] = field.path;
      setNestedValue(document, field.path, '');
    } else if (fs.existsSync(mdPath)) {
      fs.rmSync(mdPath, { force: true });
    }
  }

  if (options.includeGreetings) {
    const greetings = getNestedValue(document, GREETING_PATH);
    if (Array.isArray(greetings)) {
      for (let i = 0; i < greetings.length; i++) {
        const value = greetings[i];
        const fileName = `${GREETING_PREFIX}${i}.md`;
        const mdPath = path.join(projectPath, fileName);
        if (typeof value === 'string' && value.trim().length > 0) {
          fs.writeFileSync(mdPath, value, 'utf-8');
          manifest[fileName] = `${GREETING_PATH}[${i}]`;
          greetings[i] = '';
        } else if (fs.existsSync(mdPath)) {
          fs.rmSync(mdPath, { force: true });
        }
      }
    }
  }

  if (options.includeGreetings) {
    for (const fileName of Object.keys(previousManifest)) {
      if (/^greeting_\d+\.md$/.test(fileName) && !(fileName in manifest)) {
        fs.rmSync(path.join(projectPath, fileName), { force: true });
      }
    }
  }
  if (Object.keys(manifest).length > 0) {
    writeJson(manifestPath, manifest);
  } else if (fs.existsSync(manifestPath)) {
    fs.rmSync(manifestPath, { force: true });
  }
}

function applyTextFields(
  projectPath: string,
  document: Record<string, unknown>,
  fields: ExtractableField[],
  options: { includeGreetings?: boolean } = {},
): void {
  const manifestPath = path.join(projectPath, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? (readJson(manifestPath) as Record<string, string>) : {};
  const manifestFiles = new Set(Object.keys(manifest));

  for (const [fileName, targetPath] of Object.entries(manifest)) {
    const mdPath = resolveInsideProject(projectPath, fileName);
    if (!fs.existsSync(mdPath)) continue;
    const content = fs.readFileSync(mdPath, 'utf-8');
    const arrayMatch = targetPath.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      setArrayPath(document, arrayMatch[1], Number(arrayMatch[2]), content);
    } else {
      setNestedValue(document, targetPath, content);
    }
  }

  for (const field of fields) {
    if (manifestFiles.has(field.file)) continue;
    const mdPath = path.join(projectPath, field.file);
    if (fs.existsSync(mdPath)) {
      const content = fs.readFileSync(mdPath, 'utf-8');
      if (content.trim().length > 0) setNestedValue(document, field.path, content);
    }
  }

  if (options.includeGreetings) {
    const greetingPattern = /^greeting_(\d+)\.md$/;
    for (const entry of fs.readdirSync(projectPath, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(greetingPattern);
      if (!match || manifestFiles.has(entry.name)) continue;
      setArrayPath(
        document,
        GREETING_PATH,
        Number(match[1]),
        fs.readFileSync(path.join(projectPath, entry.name), 'utf-8'),
      );
    }
  }
}

function addDirectoryToZip(zip: InstanceType<typeof AdmZip>, dirPath: string, zipPrefix: string): void {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    const zipPath = `${zipPrefix}/${entry.name}`.replace(/\\/g, '/');
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, fullPath, zipPath);
    } else {
      zip.addFile(zipPath, fs.readFileSync(fullPath));
    }
  }
}

function addRemainingFiles(zip: InstanceType<typeof AdmZip>, currentDir: string, projectPath: string): void {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(projectPath, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (relativePath === 'assets' || relativePath === 'x_meta' || relativePath === PROJECT_META_DIR) continue;
      addRemainingFiles(zip, fullPath, projectPath);
      continue;
    }
    if (
      relativePath === 'card.json' ||
      relativePath === 'module.json' ||
      relativePath === 'module.risum' ||
      relativePath === 'preset.json' ||
      relativePath === 'manifest.json' ||
      relativePath.endsWith('.md')
    ) {
      continue;
    }
    zip.addFile(relativePath, fs.readFileSync(fullPath));
  }
}

function decodeModuleRisum(projectPath: string): string[] {
  const risumPath = path.join(projectPath, 'module.risum');
  const moduleJsonPath = path.join(projectPath, 'module.json');
  if (!fs.existsSync(risumPath)) return [];
  const parsed = parseRisum(fs.readFileSync(risumPath));
  writeJson(moduleJsonPath, parsed.module);
  const assetFiles = writeRisumAssets(projectPath, parsed.assets || []);
  fs.rmSync(risumPath, { force: true });
  return assetFiles;
}

function isProjectFileType(value: unknown): value is ProjectFileType {
  return value === 'charx' || value === 'risum' || value === 'risup';
}

function detectSourceFileType(sourcePath: string): ProjectFileType {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.charx') return 'charx';
  if (ext === '.risum') return 'risum';
  if (ext === '.risup') return 'risup';
  throw new Error('Unsupported project source file type');
}

function readProjectMarker(projectPath: string): WorkspaceMarker | null {
  const markerPath = path.join(projectPath, WORKSPACE_MARKER_PATH);
  if (!fs.existsSync(markerPath)) return null;
  try {
    return readJson(markerPath) as unknown as WorkspaceMarker;
  } catch {
    return null;
  }
}

export function getProjectFileType(projectPath: string): ProjectFileType {
  const marker = readProjectMarker(projectPath);
  if (isProjectFileType(marker?.sourceFileType)) return marker.sourceFileType;
  if (fs.existsSync(path.join(projectPath, 'card.json'))) return 'charx';
  if (fs.existsSync(path.join(projectPath, 'preset.json'))) return 'risup';
  if (fs.existsSync(path.join(projectPath, 'module.json'))) return 'risum';
  throw new Error('Project folder does not contain card.json, module.json, or preset.json');
}

function writeProjectMarker(projectPath: string, marker: Partial<WorkspaceMarker>): void {
  const metaDir = path.join(projectPath, PROJECT_META_DIR);
  ensureDir(metaDir);
  const existing = readProjectMarker(projectPath) || {};
  writeJson(path.join(metaDir, 'workspace.json'), {
    ...existing,
    ...marker,
    version: 1,
    updatedAt: new Date().toISOString(),
  });
}

function normalizeManagedCharxPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isManagedCharxPath(relativePath: string): boolean {
  const normalized = normalizeManagedCharxPath(relativePath);
  return normalized.startsWith('assets/') || normalized.startsWith('x_meta/');
}

function listManagedCharxZipEntries(zip: InstanceType<typeof AdmZip>): string[] {
  return [
    ...new Set(
      zip
        .getEntries()
        .filter((entry) => !isZipDirectory(entry) && isManagedCharxPath(entry.entryName))
        .map((entry) => normalizeManagedCharxPath(entry.entryName)),
    ),
  ].sort();
}

function readLegacyManagedCharxFiles(marker: WorkspaceMarker | null): string[] | null {
  if (Array.isArray(marker?.charxManagedFiles)) {
    return marker.charxManagedFiles.filter(isManagedCharxPath).map(normalizeManagedCharxPath);
  }
  if (
    !marker?.sourcePath ||
    !fs.existsSync(marker.sourcePath) ||
    path.extname(marker.sourcePath).toLowerCase() !== '.charx'
  ) {
    return null;
  }
  try {
    return listManagedCharxZipEntries(new AdmZip(marker.sourcePath));
  } catch {
    return null;
  }
}

function pruneEmptyManagedDirectories(projectPath: string): void {
  for (const rootName of ['assets', 'x_meta']) {
    const root = resolveInsideProject(projectPath, rootName);
    if (!fs.existsSync(root)) continue;
    const directories: string[] = [];
    const visit = (dirPath: string): void => {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = path.join(dirPath, entry.name);
        visit(child);
        directories.push(child);
      }
    };
    visit(root);
    for (const dirPath of directories) {
      if (fs.readdirSync(dirPath).length === 0) fs.rmdirSync(dirPath);
    }
    if (fs.existsSync(root) && fs.readdirSync(root).length === 0) fs.rmdirSync(root);
  }
}

function removeStaleManagedCharxFiles(
  projectPath: string,
  previousManagedFiles: string[] | null,
  currentManagedFiles: string[],
): void {
  if (!previousManagedFiles) return;
  const current = new Set(currentManagedFiles);
  for (const relativePath of previousManagedFiles) {
    const normalized = normalizeManagedCharxPath(relativePath);
    if (!isManagedCharxPath(normalized) || current.has(normalized)) continue;
    fs.rmSync(resolveInsideProject(projectPath, normalized), { force: true });
  }
  pruneEmptyManagedDirectories(projectPath);
}

function writeRisumAssets(projectPath: string, assets: Buffer[]): string[] {
  const assetDir = path.join(projectPath, RISUM_ASSET_DIR);
  if (fs.existsSync(assetDir)) fs.rmSync(assetDir, { recursive: true, force: true });
  if (assets.length === 0) return [];
  ensureDir(assetDir);
  return assets.map((asset, index) => {
    const relativePath = `${RISUM_ASSET_DIR.replace(/\\/g, '/')}/asset_${String(index).padStart(4, '0')}.bin`;
    fs.writeFileSync(path.join(projectPath, relativePath), asset);
    return relativePath;
  });
}

function readRisumAssets(projectPath: string): Buffer[] {
  const marker = readProjectMarker(projectPath);
  const markerFiles = Array.isArray(marker?.risumAssetFiles) ? marker.risumAssetFiles : [];
  if (markerFiles.length > 0) {
    return markerFiles.map((relativePath) => fs.readFileSync(resolveInsideProject(projectPath, relativePath)));
  }
  const assetDir = path.join(projectPath, RISUM_ASSET_DIR);
  if (!fs.existsSync(assetDir)) return [];
  return fs
    .readdirSync(assetDir)
    .filter((name) => name.endsWith('.bin'))
    .sort()
    .map((name) => fs.readFileSync(path.join(assetDir, name)));
}

function encodeProjectBinary(value: unknown, binaryPaths: BinaryPath[], currentPath: BinaryPath = []): unknown {
  if (value instanceof Uint8Array) {
    binaryPaths.push(currentPath);
    return Array.from(value);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => encodeProjectBinary(item, binaryPaths, [...currentPath, index]));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeProjectBinary(item, binaryPaths, [...currentPath, key])]),
    );
  }
  return value;
}

function restoreProjectBinary(document: Record<string, unknown>, binaryPaths: BinaryPath[]): void {
  for (const binaryPath of binaryPaths) {
    if (binaryPath.length === 0) continue;
    let parent: unknown = document;
    for (const segment of binaryPath.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, segment)) {
        parent = undefined;
        break;
      }
      parent = (parent as Record<string, unknown>)[segment];
    }
    const key = binaryPath[binaryPath.length - 1];
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) continue;
    const value = (parent as Record<string, unknown>)[key];
    if (Array.isArray(value) && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
      Object.defineProperty(parent, key, {
        value: Buffer.from(value),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
}

function sanitizePresetPayload(preset: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(preset);
  delete next.openAIKey;
  delete next.proxyKey;
  return next;
}

function extractCharxToProjectInternal(charxPath: string, projectPath: string): void {
  const data = openCharx(charxPath) as unknown as Record<string, unknown>;
  data._sourceFilePath = charxPath;
  saveProjectData(projectPath, data);
  writeProjectMarker(projectPath, { sourcePath: charxPath, sourceFileType: 'charx' });
}

function extractRisumToProject(risumPath: string, projectPath: string): void {
  const data = openRisum(risumPath);
  saveProjectData(projectPath, { ...data, _sourceFilePath: risumPath } as unknown as Record<string, unknown>);
  writeProjectMarker(projectPath, { sourcePath: risumPath, sourceFileType: 'risum' });
}

function extractRisupToProject(risupPath: string, projectPath: string): void {
  const data = openRisup(risupPath);
  saveProjectData(projectPath, { ...data, _sourceFilePath: risupPath } as unknown as Record<string, unknown>);
  writeProjectMarker(projectPath, {
    sourcePath: risupPath,
    sourceFileType: 'risup',
    compressionMode: (data._compressionMode as RisupCompressionMode) || 'gzip',
  });
}

export function extractDocumentToProject(
  sourcePath: string,
  projectPath: string,
): { success: true; projectPath: string } {
  ensureDir(projectPath);
  const fileType = detectSourceFileType(sourcePath);
  if (fileType === 'risum') extractRisumToProject(sourcePath, projectPath);
  else if (fileType === 'risup') extractRisupToProject(sourcePath, projectPath);
  else extractCharxToProjectInternal(sourcePath, projectPath);
  return { success: true, projectPath };
}

export function extractCharxToProject(charxPath: string, projectPath: string): { success: true; projectPath: string } {
  if (detectSourceFileType(charxPath) !== 'charx') throw new Error('extractCharxToProject expects a .charx file');
  return extractDocumentToProject(charxPath, projectPath);
}

export function reassembleProjectCharx(projectPath: string, outputPath: string): { success: true; outputPath: string } {
  assertProjectRecoveryResolved(projectPath);
  const cardPath = path.join(projectPath, 'card.json');
  if (!fs.existsSync(cardPath)) throw new Error('card.json not found in project folder');
  const card = readJson(cardPath);
  applyTextFields(projectPath, card, CHARX_EXTRACTABLE_FIELDS, { includeGreetings: true });
  stripDeprecatedCharxSaveFields(card);

  const zip = readProjectMarker(projectPath)?.charxExtraEntries
    ? new AdmZip(path.join(projectPath, CHARX_EXTRA_ENTRIES_PATH))
    : new AdmZip();
  zip.addFile('card.json', Buffer.from(JSON.stringify(card, null, 2), 'utf-8'));

  const modulePath = path.join(projectPath, 'module.json');
  if (fs.existsSync(modulePath)) {
    const moduleJson = readJson(modulePath);
    stripDeprecatedRisumSaveFields(moduleJson);
    zip.addFile('module.risum', buildRisum(moduleJson, readRisumAssets(projectPath)));
  }

  addDirectoryToZip(zip, path.join(projectPath, 'assets'), 'assets');
  addDirectoryToZip(zip, path.join(projectPath, 'x_meta'), 'x_meta');
  addRemainingFiles(zip, projectPath, projectPath);
  writePathAtomicSync(outputPath, (tempPath) => zip.writeZip(tempPath));
  return { success: true, outputPath };
}

function reassembleProjectRisum(projectPath: string, outputPath: string): { success: true; outputPath: string } {
  assertProjectRecoveryResolved(projectPath);
  const modulePath = path.join(projectPath, 'module.json');
  if (!fs.existsSync(modulePath)) throw new Error('module.json not found in project folder');
  const moduleJson = readJson(modulePath);
  stripDeprecatedRisumSaveFields(moduleJson);
  writeFileAtomicSync(outputPath, buildRisum(moduleJson, readRisumAssets(projectPath)));
  return { success: true, outputPath };
}

function reassembleProjectRisup(projectPath: string, outputPath: string): { success: true; outputPath: string } {
  assertProjectRecoveryResolved(projectPath);
  const presetPath = path.join(projectPath, 'preset.json');
  if (!fs.existsSync(presetPath)) throw new Error('preset.json not found in project folder');
  const marker = readProjectMarker(projectPath);
  const document = {
    preset: sanitizePresetPayload(readJson(presetPath)),
    envelope: marker?.risupEnvelope || {},
  };
  restoreProjectBinary(document, marker?.risupBinaryPaths || []);
  applyTextFields(projectPath, document.preset, RISUP_EXTRACTABLE_FIELDS);
  stripDeprecatedRisupSaveFields(document.preset);
  saveRisupPresetPayload(outputPath, document.preset, marker?.compressionMode || 'gzip', document.envelope);
  return { success: true, outputPath };
}

export function reassembleProjectDocument(
  projectPath: string,
  outputPath: string,
): { success: true; outputPath: string } {
  const fileType = getProjectFileType(projectPath);
  if (fileType === 'risum') return reassembleProjectRisum(projectPath, outputPath);
  if (fileType === 'risup') return reassembleProjectRisup(projectPath, outputPath);
  return reassembleProjectCharx(projectPath, outputPath);
}

export function loadProjectData(projectPath: string): Record<string, unknown> {
  assertProjectRecoveryResolved(projectPath);
  const fileType = getProjectFileType(projectPath);
  const tempPath = path.join(os.tmpdir(), `risutoki-project-${crypto.randomUUID()}.${fileType}`);
  try {
    reassembleProjectDocument(projectPath, tempPath);
    const data =
      fileType === 'risum'
        ? (openRisum(tempPath) as unknown as Record<string, unknown>)
        : fileType === 'risup'
          ? (openRisup(tempPath) as unknown as Record<string, unknown>)
          : (openCharx(tempPath) as unknown as Record<string, unknown>);
    data._projectPath = projectPath;
    data._fileType = fileType;
    const marker = readProjectMarker(projectPath);
    if (marker?.sourcePath) data._sourceFilePath = marker.sourcePath;
    recordProjectBaseline(projectPath, data);
    return data;
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

export function saveProjectData(projectPath: string, data: Record<string, unknown>): void {
  const baseline = projectBaselines.get(data)?.get(path.resolve(projectPath));
  const verify = () => {
    if (baseline !== undefined && baseline !== projectFingerprint(projectPath)) {
      throw new Error(
        '프로젝트 원본 파일이 외부에서 변경되어 저장하지 않았습니다. 변경 내용을 확인하고 프로젝트를 다시 불러오세요.',
      );
    }
  };
  verify();
  withProjectSaveRecovery(projectPath, () => writeProjectData(projectPath, data), verify);
}

function writeProjectData(projectPath: string, data: Record<string, unknown>): void {
  ensureDir(projectPath);
  const fileType = isProjectFileType(data._fileType) ? data._fileType : 'charx';

  if (fileType === 'risum') {
    const tempPath = path.join(os.tmpdir(), `risutoki-project-save-${crypto.randomUUID()}.risum`);
    try {
      saveRisum(tempPath, data as unknown as LoadedDocumentData);
      const parsed = parseRisum(fs.readFileSync(tempPath));
      writeJson(path.join(projectPath, 'module.json'), parsed.module);
      const risumAssetFiles = writeRisumAssets(projectPath, parsed.assets || []);
      writeProjectMarker(projectPath, {
        sourceFileType: 'risum',
        sourcePath: typeof data._sourceFilePath === 'string' ? data._sourceFilePath : undefined,
        risumAssetFiles,
      });
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
    recordProjectBaseline(projectPath, data);
    return;
  }

  if (fileType === 'risup') {
    const tempPath = path.join(os.tmpdir(), `risutoki-project-save-${crypto.randomUUID()}.risup`);
    try {
      saveRisup(tempPath, data as unknown as LoadedDocumentData);
      const normalized = openRisup(tempPath);
      const risupBinaryPaths: BinaryPath[] = [];
      const document = encodeProjectBinary(
        {
          preset: sanitizePresetPayload(normalized._presetData || {}),
          envelope: normalized._risupEnvelope || {},
        },
        risupBinaryPaths,
      ) as { preset: Record<string, unknown>; envelope: Record<string, unknown> };
      extractTextFields(projectPath, document.preset, RISUP_EXTRACTABLE_FIELDS);
      writeJson(path.join(projectPath, 'preset.json'), document.preset);
      writeProjectMarker(projectPath, {
        sourceFileType: 'risup',
        sourcePath: typeof data._sourceFilePath === 'string' ? data._sourceFilePath : undefined,
        compressionMode: (normalized._compressionMode as RisupCompressionMode) || 'gzip',
        risupEnvelope: document.envelope,
        risupBinaryPaths,
      });
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
    recordProjectBaseline(projectPath, data);
    return;
  }

  const loaded = data as unknown as LoadedDocumentData;
  const zip = buildCharxZip({ ...loaded, _zipEntries: [] });
  const extraEntries = loaded._zipEntries || [];
  const extraPath = path.join(projectPath, CHARX_EXTRA_ENTRIES_PATH);
  if (extraEntries.length > 0) {
    const extras = new AdmZip();
    for (const entry of extraEntries) extras.addFile(entry.path, entry.data);
    ensureDir(path.dirname(extraPath));
    writePathAtomicSync(extraPath, (tempPath) => extras.writeZip(tempPath));
  } else {
    fs.rmSync(extraPath, { force: true });
  }
  const marker = readProjectMarker(projectPath);
  const previousManagedFiles = readLegacyManagedCharxFiles(marker);
  const currentManagedFiles = listManagedCharxZipEntries(zip);
  removeStaleManagedCharxFiles(projectPath, previousManagedFiles, currentManagedFiles);
  for (const entry of zip.getEntries()) {
    if (isZipDirectory(entry)) continue;
    const outPath = resolveInsideProject(projectPath, entry.entryName);
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, entry.getData());
  }
  const risumAssetFiles = decodeModuleRisum(projectPath);
  const cardPath = path.join(projectPath, 'card.json');
  const card = readJson(cardPath);
  extractTextFields(projectPath, card, CHARX_EXTRACTABLE_FIELDS, { includeGreetings: true });
  removeProjectFiles(projectPath, CHARX_PROTECTED_PROJECT_FILES);
  writeJson(cardPath, card);
  writeProjectMarker(projectPath, {
    sourceFileType: 'charx',
    sourcePath: typeof data._sourceFilePath === 'string' ? data._sourceFilePath : undefined,
    charxManagedFiles: currentManagedFiles,
    charxExtraEntries: extraEntries.length > 0,
    risumAssetFiles,
  });
  recordProjectBaseline(projectPath, data);
}

export function listProjectTree(projectPath: string): ProjectTreeNode {
  function walk(dirPath: string): ProjectTreeNode {
    const relativePath = path.relative(projectPath, dirPath).replace(/\\/g, '/');
    const node: ProjectTreeNode = {
      name: relativePath ? path.basename(dirPath) : path.basename(projectPath),
      type: 'directory',
      relativePath,
      children: [],
    };
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== PROJECT_META_DIR) continue;
      const fullPath = path.join(dirPath, entry.name);
      const childRelative = path.relative(projectPath, fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        node.children!.push(walk(fullPath));
      } else {
        node.children!.push({ name: entry.name, type: 'file', relativePath: childRelative });
      }
    }
    node.children!.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return node;
  }
  return walk(projectPath);
}

export function readProjectFile(projectPath: string, relativePath: string): string {
  const filePath = resolveInsideProject(projectPath, relativePath);
  return fs.readFileSync(filePath, 'utf-8');
}

export function writeProjectFile(projectPath: string, relativePath: string, content: string): void {
  assertProjectRecoveryResolved(projectPath);
  const filePath = resolveInsideProject(projectPath, relativePath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}
