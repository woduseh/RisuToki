'use strict';
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip') as typeof import('adm-zip');
const { parseRisum, buildRisum } = require('./rpack') as {
  parseRisum: (buf: Buffer) => { module: Record<string, unknown>; assets: Buffer[] };
  buildRisum: (moduleJson: Record<string, unknown>, assets?: Buffer[]) => Buffer;
};
const { risuArrayToCCV3 } = require('./lorebook-convert') as {
  risuArrayToCCV3: (entries: unknown[]) => unknown[];
};

const ZIP_LOCAL_FILE_HEADER: Buffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface TriggerEffect {
  type?: string;
  code?: string;
  [key: string]: unknown;
}

export interface TriggerScript {
  comment?: string;
  type?: string;
  conditions?: unknown[];
  effect?: TriggerEffect[];
  lowLevelAccess?: boolean;
  [key: string]: unknown;
}

export interface CharxAsset {
  path: string;
  data: Buffer;
}

export interface CharxData {
  // File type marker (only present for risum files)
  _fileType?: string;

  // Spec metadata
  spec?: string;
  specVersion?: string;

  // Character info
  name: string;
  description: string;
  personality?: string;
  scenario?: string;
  creatorcomment?: string;
  tags?: string[];

  // Editable content
  firstMessage: string;
  alternateGreetings: string[];
  groupOnlyGreetings: string[];
  globalNote: string;
  css: string;
  defaultVariables: string;
  lua: string;
  triggerScripts: TriggerScript[];

  // Lorebook & regex
  lorebook: unknown[];
  regex: unknown[];

  // Module metadata
  moduleId?: string;
  moduleName?: string;
  moduleDescription?: string;

  // Assets
  assets: CharxAsset[];
  xMeta: Record<string, unknown>;
  risumAssets: Buffer[];
  cardAssets: unknown[];

  // Preserved original data for round-trip saves
  _risuExt: Record<string, unknown>;
  _card: Record<string, unknown>;
  _moduleData: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cloneTriggerScripts(triggerScripts: unknown): TriggerScript[] {
  return Array.isArray(triggerScripts)
    ? JSON.parse(JSON.stringify(triggerScripts)) as TriggerScript[]
    : [];
}

function extractPrimaryLuaFromTriggerScripts(triggerScripts: unknown): string {
  if (!Array.isArray(triggerScripts)) return '';

  for (const trigger of triggerScripts as TriggerScript[]) {
    const effects: TriggerEffect[] = Array.isArray(trigger?.effect) ? trigger.effect : [];
    for (const effect of effects) {
      if (effect && typeof effect.code === 'string' && (effect.type === 'triggerlua' || typeof effect.type !== 'string')) {
        return effect.code;
      }
    }
  }

  return '';
}

function normalizeTriggerScripts(triggerScripts: unknown): TriggerScript[] {
  if (Array.isArray(triggerScripts)) {
    return cloneTriggerScripts(triggerScripts);
  }

  if (typeof triggerScripts === 'string') {
    const trimmed = triggerScripts.trim();
    if (!trimmed) return [];
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error('Trigger scripts must be a JSON array.');
    }
    return cloneTriggerScripts(parsed);
  }

  return [];
}

function mergePrimaryLuaIntoTriggerScripts(triggerScripts: unknown, lua: unknown): TriggerScript[] {
  const scripts = normalizeTriggerScripts(triggerScripts);
  if (typeof lua !== 'string' || !lua) {
    return scripts;
  }

  for (const trigger of scripts) {
    const effects: TriggerEffect[] = Array.isArray(trigger?.effect) ? trigger.effect : [];
    for (const effect of effects) {
      if (effect && (effect.type === 'triggerlua' || typeof effect.code === 'string')) {
        effect.type = effect.type || 'triggerlua';
        effect.code = lua;
        return scripts;
      }
    }
  }

  scripts.unshift({
    comment: '',
    type: 'start',
    conditions: [],
    effect: [{ type: 'triggerlua', code: lua }],
    lowLevelAccess: false
  });
  return scripts;
}

function stringifyTriggerScripts(triggerScripts: unknown): string {
  return JSON.stringify(normalizeTriggerScripts(triggerScripts), null, 2);
}

// ---------------------------------------------------------------------------
// ZIP helpers
// ---------------------------------------------------------------------------

type AdmZipEntry = ReturnType<InstanceType<typeof AdmZip>['getEntries']>[number];

interface ZipResult {
  zip: InstanceType<typeof AdmZip>;
  entries: AdmZipEntry[];
}

function openZipEntriesWithPreludeSupport(filePath: string): ZipResult {
  try {
    const zip = new AdmZip(filePath);
    return { zip, entries: zip.getEntries() };
  } catch (error) {
    const buffer: Buffer = fs.readFileSync(filePath);
    const zipOffset: number = buffer.indexOf(ZIP_LOCAL_FILE_HEADER);

    if (zipOffset > 0) {
      try {
        const zip = new AdmZip(buffer.subarray(zipOffset));
        return { zip, entries: zip.getEntries() };
      } catch {
        // Fall through to the original error below.
      }
    }

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Open / Save .charx
// ---------------------------------------------------------------------------

/**
 * Open and parse a .charx file
 */
function openCharx(filePath: string): CharxData {
  const { zip, entries } = openZipEntriesWithPreludeSupport(filePath);

  // Parse card.json
  const cardEntry = zip.getEntry('card.json');
  if (!cardEntry) throw new Error('card.json not found in .charx');
  const card = JSON.parse(cardEntry.getData().toString('utf-8'));

  // Parse module.risum
  let moduleData: Record<string, unknown> | null = null;
  let risumAssets: Buffer[] = [];
  const risumEntry = zip.getEntry('module.risum');
  if (risumEntry) {
    const parsed = parseRisum(risumEntry.getData());
    moduleData = parsed.module;
    risumAssets = parsed.assets;
  }

  // Collect image assets
  const assets: CharxAsset[] = [];
  const xMeta: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry.entryName.startsWith('assets/') && !entry.isDirectory) {
      assets.push({
        path: entry.entryName,
        data: entry.getData()
      });
    }
    if (entry.entryName.startsWith('x_meta/') && entry.entryName.endsWith('.json')) {
      const metaName: string = path.basename(entry.entryName, '.json');
      xMeta[metaName] = JSON.parse(entry.getData().toString('utf-8'));
    }
  }

  // Extract editable components
  const data = card.data || {};
  const risuExt = data.extensions?.risuai || {};
  const mod = (moduleData as Record<string, unknown>)?.module as Record<string, unknown> || {};
  const triggerScripts: TriggerScript[] = cloneTriggerScripts(mod.trigger || []);

  return {
    // Metadata
    spec: card.spec || 'chara_card_v3',
    specVersion: card.spec_version || '3.0',

    // Character info
    name: data.name || '',
    description: data.description || '',
    personality: data.personality || '',
    scenario: data.scenario || '',
    creatorcomment: data.creatorcomment || '',
    tags: data.tags || [],

    // Editable content
    firstMessage: data.first_mes || '',
    alternateGreetings: data.alternate_greetings || [],
    groupOnlyGreetings: data.group_only_greetings || [],
    globalNote: data.post_history_instructions || '',
    css: risuExt.backgroundHTML || '',
    defaultVariables: risuExt.defaultVariables || '',
    lua: extractPrimaryLuaFromTriggerScripts(triggerScripts),
    triggerScripts,

    // Lorebook (use module.risum version as source of truth)
    lorebook: (mod.lorebook as unknown[]) || [],

    // Regex scripts
    regex: (mod.regex as unknown[]) || [],

    // Module metadata
    moduleId: (mod.id as string) || '',
    moduleName: (mod.name as string) || '',
    moduleDescription: (mod.description as string) || '',

    // Assets
    assets,
    xMeta,
    risumAssets,

    // card.json asset references
    cardAssets: data.assets || [],

    // Preserve full risuai extensions for save
    _risuExt: risuExt,
    // Preserve full card for fields we don't edit
    _card: card,
    // Preserve full module for fields we don't edit
    _moduleData: moduleData
  };
}

/**
 * Save data back to .charx file
 */
function saveCharx(filePath: string, data: CharxData): void {
  const zip = new AdmZip();

  // Build card.json
  const card: Record<string, unknown> = JSON.parse(JSON.stringify(data._card || {}));
  if (!card.spec) card.spec = 'chara_card_v3';
  if (!card.spec_version) card.spec_version = '3.0';
  if (!card.data) card.data = {};

  const cardData = card.data as Record<string, unknown>;
  cardData.name = data.name;
  cardData.description = data.description;
  cardData.personality = data.personality || '';
  cardData.scenario = data.scenario || '';
  cardData.creatorcomment = data.creatorcomment || '';
  cardData.tags = data.tags || [];
  cardData.first_mes = data.firstMessage;
  cardData.alternate_greetings = data.alternateGreetings || [];
  cardData.group_only_greetings = data.groupOnlyGreetings || [];
  cardData.post_history_instructions = data.globalNote;

  // risuai extensions
  if (!cardData.extensions) cardData.extensions = {};
  const extensions = cardData.extensions as Record<string, unknown>;
  if (!extensions.risuai) extensions.risuai = {};
  const risuExt = extensions.risuai as Record<string, unknown>;
  risuExt.backgroundHTML = data.css;
  risuExt.defaultVariables = data.defaultVariables;

  // Remove trigger/script from card (they go in module.risum)
  delete risuExt.customScripts;
  delete risuExt.triggerscript;

  // Lorebook → card.json (CCV3 format)
  if (!(cardData as Record<string, unknown>).character_book) {
    (cardData as Record<string, unknown>).character_book = {};
  }
  const characterBook = (cardData as Record<string, unknown>).character_book as Record<string, unknown>;
  characterBook.entries = risuArrayToCCV3(data.lorebook);

  // Preserve card assets
  cardData.assets = data.cardAssets || [];

  zip.addFile('card.json', Buffer.from(JSON.stringify(card, null, 2), 'utf-8'));

  // Build module.risum
  const moduleJson: Record<string, unknown> = data._moduleData ? JSON.parse(JSON.stringify(data._moduleData)) : {
    type: 'risuModule',
    module: {
      name: data.moduleName || `${data.name} Module`,
      description: data.moduleDescription || `Module for ${data.name}`,
      id: data.moduleId || generateUUID(),
      trigger: [],
      regex: [],
      lorebook: [],
      assets: []
    }
  };

  const mod = moduleJson.module as Record<string, unknown>;

  mod.trigger = mergePrimaryLuaIntoTriggerScripts(
    data.triggerScripts !== undefined ? data.triggerScripts : mod.trigger,
    data.lua
  );

  // Regex
  mod.regex = data.regex || [];

  // Lorebook (risu format)
  mod.lorebook = data.lorebook || [];

  const risumBuf: Buffer = buildRisum(moduleJson, data.risumAssets || []);
  zip.addFile('module.risum', risumBuf);

  // Add image assets
  for (const asset of (data.assets || [])) {
    zip.addFile(asset.path, asset.data);
  }

  // Add x_meta
  for (const [name, meta] of Object.entries(data.xMeta || {})) {
    zip.addFile(`x_meta/${name}.json`, Buffer.from(JSON.stringify(meta), 'utf-8'));
  }

  // Write ZIP
  zip.writeZip(filePath);
}

// ---------------------------------------------------------------------------
// Open / Save .risum
// ---------------------------------------------------------------------------

/**
 * Open and parse a standalone .risum file
 */
function openRisum(filePath: string): CharxData {
  const buf: Buffer = fs.readFileSync(filePath);
  const parsed = parseRisum(buf);
  const mod = ((parsed.module as Record<string, unknown>)?.module as Record<string, unknown>)
    || parsed.module
    || {};

  return {
    _fileType: 'risum',

    // Module metadata
    name: (mod.name as string) || path.basename(filePath, '.risum'),
    description: (mod.description as string) || '',
    moduleId: (mod.id as string) || '',
    moduleName: (mod.name as string) || '',
    moduleDescription: (mod.description as string) || '',

    // Editable content
    lua: extractPrimaryLuaFromTriggerScripts((mod.trigger as unknown[]) || []),
    triggerScripts: cloneTriggerScripts((mod.trigger as unknown[]) || []),
    lorebook: (mod.lorebook as unknown[]) || [],
    regex: (mod.regex as unknown[]) || [],

    // charx-only fields (empty for risum)
    firstMessage: '',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    personality: '',
    scenario: '',
    creatorcomment: '',
    tags: [],

    // Assets
    assets: [],
    xMeta: {},
    risumAssets: parsed.assets || [],
    cardAssets: [],

    // Preserve original data for save
    _moduleData: parsed.module,
    _risuExt: {},
    _card: { spec: 'chara_card_v3', spec_version: '3.0', data: { extensions: { risuai: {} } } }
  };
}

/**
 * Save data back to a standalone .risum file
 */
function saveRisum(filePath: string, data: CharxData): void {
  const moduleJson: Record<string, unknown> = data._moduleData ? JSON.parse(JSON.stringify(data._moduleData)) : {
    type: 'risuModule',
    module: {
      name: data.moduleName || data.name || 'Module',
      description: data.moduleDescription || '',
      id: data.moduleId || generateUUID(),
      trigger: [],
      regex: [],
      lorebook: [],
      assets: []
    }
  };

  const mod = (moduleJson.module as Record<string, unknown>) || moduleJson;

  // Update module name/description
  mod.name = data.moduleName || data.name || mod.name;
  mod.description = data.moduleDescription || data.description || mod.description;

  mod.trigger = mergePrimaryLuaIntoTriggerScripts(
    data.triggerScripts !== undefined ? data.triggerScripts : mod.trigger,
    data.lua
  );

  // Regex & Lorebook
  mod.regex = data.regex || [];
  mod.lorebook = data.lorebook || [];

  const risumBuf: Buffer = buildRisum(moduleJson, data.risumAssets || []);
  fs.writeFileSync(filePath, risumBuf);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

module.exports = {
  openCharx,
  saveCharx,
  openRisum,
  saveRisum,
  extractPrimaryLuaFromTriggerScripts,
  mergePrimaryLuaIntoTriggerScripts,
  normalizeTriggerScripts,
  stringifyTriggerScripts
};
