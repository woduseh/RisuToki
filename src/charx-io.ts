'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const AdmZip = require('adm-zip') as typeof import('adm-zip');
const { rpackDecode, rpackEncode, parseRisum, buildRisum } = require('./rpack') as {
  rpackDecode: (input: Buffer | Uint8Array) => Buffer;
  rpackEncode: (input: Buffer | Uint8Array) => Buffer;
  parseRisum: (buf: Buffer) => { module: Record<string, unknown>; assets: Buffer[] };
  buildRisum: (moduleJson: Record<string, unknown>, assets?: Buffer[]) => Buffer;
};
const { pack, unpack } = require('msgpackr') as {
  pack: (value: unknown) => Buffer;
  unpack: (buf: Buffer | Uint8Array) => unknown;
};
const { risuArrayToCCV3 } = require('./lorebook-convert') as {
  risuArrayToCCV3: (entries: unknown[]) => unknown[];
};
const { validateCharxCardDocument, validateRisupEnvelope, validateRisupPresetPayload } =
  require('./lib/document-validation') as {
    validateCharxCardDocument: (card: unknown) => {
      spec: 'chara_card_v3';
      spec_version?: string;
      data: Record<string, unknown>;
      [key: string]: unknown;
    };
    validateRisupEnvelope: (envelope: unknown) => {
      type: 'preset';
      presetVersion?: number;
      preset?: Uint8Array;
      pres?: Uint8Array;
      [key: string]: unknown;
    };
    validateRisupPresetPayload: (preset: unknown) => Record<string, unknown>;
  };

const ZIP_LOCAL_FILE_HEADER: Buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MAX_FILE_SIZE: number = 200 * 1024 * 1024; // 200 MB

/**
 * Mapping from Risutoki legacy/camelCase regex type names to RisuAI-compatible lowercase names.
 * RisuAI does case-sensitive comparison (`script.type === mode`), so types MUST be lowercase.
 */
const REGEX_TYPE_MAP: Record<string, string> = {
  editinput: 'editinput',
  editoutput: 'editoutput',
  editdisplay: 'editdisplay',
  editprocess: 'editprocess',
  edittrans: 'edittrans',
  disabled: 'disabled',
  // Legacy Risutoki names
  editrequest: 'editprocess',
  edittranslation: 'edittrans',
};

/**
 * Normalize a single regex entry's `type` field to RisuAI-compatible lowercase value.
 * Handles camelCase → lowercase and legacy name mapping (editRequest→editprocess, etc.)
 */
function normalizeRegexType(entry: Record<string, unknown>): void {
  if (typeof entry.type === 'string') {
    const lower = entry.type.toLowerCase();
    entry.type = REGEX_TYPE_MAP[lower] || lower;
  }
}

/**
 * Normalize all regex entries' type fields in-place.
 */
function normalizeRegexArray(regex: unknown[]): void {
  for (const entry of regex) {
    if (entry && typeof entry === 'object') {
      normalizeRegexType(entry as Record<string, unknown>);
    }
  }
}

function validateFileSize(filePath: string): void {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_FILE_SIZE) {
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
    throw new Error(`파일이 너무 큽니다 (${sizeMB}MB). 최대 ${MAX_FILE_SIZE / (1024 * 1024)}MB까지 지원합니다.`);
  }
}

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
  exampleMessage?: string;
  systemPrompt?: string;
  creator?: string;
  characterVersion?: string;
  nickname?: string;
  source?: string[];
  creationDate?: number;
  modificationDate?: number;

  // RisuAI extension fields
  additionalText?: string;
  license?: string;

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

  // Risum module-specific fields
  cjs?: string;
  lowLevelAccess?: boolean;
  hideIcon?: boolean;
  backgroundEmbedding?: string;
  moduleNamespace?: string;
  customModuleToggle?: string;
  mcpUrl?: string;

  // Risup preset fields (basic)
  mainPrompt?: string;
  jailbreak?: string;
  temperature?: number;
  maxContext?: number;
  maxResponse?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  aiModel?: string;
  subModel?: string;
  apiType?: string;
  promptPreprocess?: boolean;
  promptTemplate?: string; // JSON string of PromptItem[]
  presetBias?: string; // JSON string of [string, number][]
  formatingOrder?: string; // JSON string of FormatingOrderItem[]
  presetImage?: string;

  // Risup preset fields (sampling parameters)
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  min_p?: number;
  top_a?: number;

  // Risup preset fields (thinking/reasoning)
  reasonEffort?: number;
  thinkingTokens?: number;
  thinkingType?: string;
  adaptiveThinkingEffort?: string;

  // Risup preset fields (templates & formatting)
  useInstructPrompt?: boolean;
  instructChatTemplate?: string;
  JinjaTemplate?: string;
  customPromptTemplateToggle?: string;
  templateDefaultVariables?: string;
  moduleIntergration?: string;

  // Risup preset fields (JSON schema & structured output)
  jsonSchemaEnabled?: boolean;
  jsonSchema?: string;
  strictJsonSchema?: boolean;
  extractJson?: string;

  // Risup preset fields (group & misc)
  groupTemplate?: string;
  groupOtherBotRole?: string;
  autoSuggestPrompt?: string;
  autoSuggestPrefix?: string;
  autoSuggestClean?: boolean;
  localStopStrings?: string; // JSON string of string[]
  outputImageModal?: boolean;
  verbosity?: number;
  fallbackWhenBlankResponse?: boolean;
  systemContentReplacement?: string;
  systemRoleReplacement?: string;

  // Assets
  assets: CharxAsset[];
  xMeta: Record<string, unknown>;
  risumAssets: Buffer[];
  cardAssets: unknown[];

  // Preserved original data for round-trip saves
  _risuExt: Record<string, unknown>;
  _card: Record<string, unknown>;
  _moduleData: Record<string, unknown> | null;
  _presetData: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract risum module-specific fields from a parsed module object. */
function extractRisumModuleFields(
  mod: Record<string, unknown>,
): Pick<
  CharxData,
  'cjs' | 'lowLevelAccess' | 'hideIcon' | 'backgroundEmbedding' | 'moduleNamespace' | 'customModuleToggle' | 'mcpUrl'
> {
  const mcp = mod.mcp as Record<string, unknown> | undefined;
  return {
    cjs: (mod.cjs as string) || '',
    lowLevelAccess: !!mod.lowLevelAccess,
    hideIcon: !!mod.hideIcon,
    backgroundEmbedding: (mod.backgroundEmbedding as string) || '',
    moduleNamespace: (mod.namespace as string) || '',
    customModuleToggle: (mod.customModuleToggle as string) || '',
    mcpUrl: (mcp?.url as string) || '',
  };
}

/** Write risum module-specific fields back into a module JSON object. */
function applyRisumModuleFields(mod: Record<string, unknown>, data: CharxData): void {
  if (data.cjs !== undefined) mod.cjs = data.cjs || undefined;
  mod.lowLevelAccess = data.lowLevelAccess || false;
  mod.hideIcon = data.hideIcon || false;
  if (data.backgroundEmbedding !== undefined) mod.backgroundEmbedding = data.backgroundEmbedding || undefined;
  if (data.moduleNamespace !== undefined) mod.namespace = data.moduleNamespace || undefined;
  if (data.customModuleToggle !== undefined) mod.customModuleToggle = data.customModuleToggle || undefined;

  if (data.mcpUrl) {
    mod.mcp = { url: data.mcpUrl };
  } else if (data.mcpUrl === '') {
    delete mod.mcp;
  }
}

function cloneTriggerScripts(triggerScripts: unknown): TriggerScript[] {
  return Array.isArray(triggerScripts) ? (JSON.parse(JSON.stringify(triggerScripts)) as TriggerScript[]) : [];
}

export function extractPrimaryLuaFromTriggerScripts(triggerScripts: unknown): string {
  if (!Array.isArray(triggerScripts)) return '';

  for (const trigger of triggerScripts as TriggerScript[]) {
    const effects: TriggerEffect[] = Array.isArray(trigger?.effect) ? trigger.effect : [];
    for (const effect of effects) {
      if (
        effect &&
        typeof effect.code === 'string' &&
        (effect.type === 'triggerlua' || typeof effect.type !== 'string')
      ) {
        return effect.code;
      }
    }
  }

  return '';
}

export function normalizeTriggerScripts(triggerScripts: unknown): TriggerScript[] {
  if (Array.isArray(triggerScripts)) {
    return cloneTriggerScripts(triggerScripts);
  }

  if (typeof triggerScripts === 'string') {
    const trimmed = triggerScripts.trim();
    if (!trimmed) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`Invalid trigger script JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error('Trigger scripts must be a JSON array.');
    }
    return cloneTriggerScripts(parsed);
  }

  return [];
}

export function mergePrimaryLuaIntoTriggerScripts(triggerScripts: unknown, lua: unknown): TriggerScript[] {
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
    lowLevelAccess: false,
  });
  return scripts;
}

export function stringifyTriggerScripts(triggerScripts: unknown): string {
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
  validateFileSize(filePath);
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
export function openCharx(filePath: string): CharxData {
  const { zip, entries } = openZipEntriesWithPreludeSupport(filePath);

  // Parse card.json
  const cardEntry = zip.getEntry('card.json');
  if (!cardEntry) throw new Error('card.json not found in .charx');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let card: any;
  try {
    card = JSON.parse(cardEntry.getData().toString('utf-8'));
  } catch (e) {
    throw new Error(`Invalid card.json: ${e instanceof Error ? e.message : String(e)}`);
  }
  card = validateCharxCardDocument(card);

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
        data: entry.getData(),
      });
    }
    if (entry.entryName.startsWith('x_meta/') && entry.entryName.endsWith('.json')) {
      const metaName: string = path.basename(entry.entryName, '.json');
      try {
        xMeta[metaName] = JSON.parse(entry.getData().toString('utf-8'));
      } catch {
        console.warn(`[charx-io] Skipping corrupted x_meta/${metaName}.json`);
      }
    }
  }

  // Extract editable components
  const data = card.data || {};
  const risuExt = data.extensions?.risuai || {};
  const mod = ((moduleData as Record<string, unknown>)?.module as Record<string, unknown>) || {};
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
    creatorcomment: data.creator_notes || data.creatorcomment || '',
    tags: data.tags || [],
    exampleMessage: data.mes_example || '',
    systemPrompt: data.system_prompt || '',
    creator: data.creator || '',
    characterVersion: data.character_version || '',
    nickname: data.nickname || '',
    source: Array.isArray(data.source) ? data.source : [],
    creationDate: typeof data.creation_date === 'number' ? data.creation_date : 0,
    modificationDate: typeof data.modification_date === 'number' ? data.modification_date : 0,

    // RisuAI extension fields
    additionalText: (risuExt.additionalText as string) || '',
    license: (risuExt.license as string) || '',

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

    // Regex scripts (normalize types for RisuAI compatibility)
    regex: (() => {
      const r = (mod.regex as unknown[]) || [];
      normalizeRegexArray(r);
      return r;
    })(),

    // Module metadata
    moduleId: (mod.id as string) || '',
    moduleName: (mod.name as string) || '',
    moduleDescription: (mod.description as string) || '',

    // Risum module-specific fields (from embedded module.risum)
    ...extractRisumModuleFields(mod),

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
    _moduleData: moduleData,
    _presetData: null,
  };
}

/**
 * Save data back to .charx file
 */
export function saveCharx(filePath: string, data: CharxData): void {
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
  cardData.creator_notes = data.creatorcomment || '';
  cardData.tags = data.tags || [];
  cardData.mes_example = data.exampleMessage || '';
  cardData.system_prompt = data.systemPrompt || '';
  cardData.creator = data.creator || '';
  cardData.character_version = data.characterVersion || '';
  cardData.nickname = data.nickname || '';
  cardData.source = data.source || [];
  if (data.creationDate) cardData.creation_date = data.creationDate;
  cardData.modification_date = Math.floor(Date.now() / 1000);
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
  if (data.additionalText !== undefined) risuExt.additionalText = data.additionalText;
  if (data.license !== undefined) risuExt.license = data.license;

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
  const rawCardAssets = (data.cardAssets || []) as { type?: string; uri?: string; name?: string; ext?: string }[];
  const actualAssetPaths = new Set((data.assets || []).map((a) => a.path));
  const EMBEDDED_ASSET_URI_PREFIX = 'embeded://';

  function resolveLocalAssetPath(uri?: string): string | null {
    if (!uri) return null;
    if (uri.startsWith(EMBEDDED_ASSET_URI_PREFIX)) {
      return uri.slice(EMBEDDED_ASSET_URI_PREFIX.length);
    }
    if (uri.startsWith('assets/')) {
      return uri;
    }
    return null;
  }

  // Reconcile: ensure all ZIP assets have card.json entries (RisuAI reads this)
  // and remove embedded assets that no longer exist in the ZIP.
  const cardAssetArr = rawCardAssets.filter((a) => {
    const localPath = resolveLocalAssetPath(a.uri);
    if (localPath) {
      return actualAssetPaths.has(localPath);
    }
    return true;
  });
  cardData.assets = cardAssetArr;

  const existingAssetPaths = new Set(
    cardAssetArr.map((a) => resolveLocalAssetPath(a.uri)).filter((p): p is string => !!p),
  );
  for (const asset of data.assets || []) {
    const uri = `embeded://${asset.path}`;
    if (!existingAssetPaths.has(asset.path)) {
      const ext = path.extname(asset.path).slice(1) || '';
      const baseName = path.basename(asset.path, ext ? `.${ext}` : '');
      const isIcon = asset.path.startsWith('assets/icon');
      cardAssetArr.push({ type: isIcon ? 'icon' : 'x-risu-asset', uri, name: baseName, ext });
    }
  }
  zip.addFile('card.json', Buffer.from(JSON.stringify(card, null, 2), 'utf-8'));

  // Build module.risum
  const moduleJson: Record<string, unknown> = data._moduleData
    ? JSON.parse(JSON.stringify(data._moduleData))
    : {
        type: 'risuModule',
        module: {
          name: data.moduleName || `${data.name} Module`,
          description: data.moduleDescription || `Module for ${data.name}`,
          id: data.moduleId || generateUUID(),
          trigger: [],
          regex: [],
          lorebook: [],
          assets: [],
        },
      };

  const mod = moduleJson.module as Record<string, unknown>;

  mod.trigger = mergePrimaryLuaIntoTriggerScripts(
    data.triggerScripts !== undefined ? data.triggerScripts : mod.trigger,
    data.lua,
  );

  // Regex (normalize types for RisuAI compatibility)
  mod.regex = data.regex || [];
  normalizeRegexArray(mod.regex as unknown[]);

  // Lorebook (risu format)
  mod.lorebook = data.lorebook || [];

  // Apply risum module-specific fields
  applyRisumModuleFields(mod, data);

  const risumBuf: Buffer = buildRisum(moduleJson, data.risumAssets || []);
  zip.addFile('module.risum', risumBuf);

  // Add image assets
  for (const asset of data.assets || []) {
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
export function openRisum(filePath: string): CharxData {
  validateFileSize(filePath);
  const buf: Buffer = fs.readFileSync(filePath);
  const parsed = parseRisum(buf);
  const mod = ((parsed.module as Record<string, unknown>)?.module as Record<string, unknown>) || parsed.module || {};

  return {
    _fileType: 'risum',

    // Module metadata
    name: (mod.name as string) || path.basename(filePath, '.risum'),
    description: (mod.description as string) || '',
    moduleId: (mod.id as string) || '',
    moduleName: (mod.name as string) || '',
    moduleDescription: (mod.description as string) || '',

    // Risum module-specific fields
    ...extractRisumModuleFields(mod),

    // Editable content
    lua: extractPrimaryLuaFromTriggerScripts((mod.trigger as unknown[]) || []),
    triggerScripts: cloneTriggerScripts((mod.trigger as unknown[]) || []),
    lorebook: (mod.lorebook as unknown[]) || [],
    regex: (() => {
      const r = (mod.regex as unknown[]) || [];
      normalizeRegexArray(r);
      return r;
    })(),

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
    exampleMessage: '',
    systemPrompt: '',
    creator: '',
    characterVersion: '',
    nickname: '',
    source: [],
    creationDate: 0,
    modificationDate: 0,
    additionalText: '',
    license: '',

    // Assets
    assets: [],
    xMeta: {},
    risumAssets: parsed.assets || [],
    cardAssets: [],

    // Preserve original data for save
    _moduleData: parsed.module,
    _risuExt: {},
    _card: { spec: 'chara_card_v3', spec_version: '3.0', data: { extensions: { risuai: {} } } },
    _presetData: null,
  };
}

/**
 * Save data back to a standalone .risum file
 */
export function saveRisum(filePath: string, data: CharxData): void {
  const moduleJson: Record<string, unknown> = data._moduleData
    ? JSON.parse(JSON.stringify(data._moduleData))
    : {
        type: 'risuModule',
        module: {
          name: data.moduleName || data.name || 'Module',
          description: data.moduleDescription || '',
          id: data.moduleId || generateUUID(),
          trigger: [],
          regex: [],
          lorebook: [],
          assets: [],
        },
      };

  const mod = (moduleJson.module as Record<string, unknown>) || moduleJson;

  // Update module name/description
  mod.name = data.moduleName || data.name || mod.name;
  mod.description = data.moduleDescription || data.description || mod.description;

  // Apply risum module-specific fields
  applyRisumModuleFields(mod, data);

  mod.trigger = mergePrimaryLuaIntoTriggerScripts(
    data.triggerScripts !== undefined ? data.triggerScripts : mod.trigger,
    data.lua,
  );

  // Regex & Lorebook (normalize regex types for RisuAI compatibility)
  mod.regex = data.regex || [];
  normalizeRegexArray(mod.regex as unknown[]);
  mod.lorebook = data.lorebook || [];

  const risumBuf: Buffer = buildRisum(moduleJson, data.risumAssets || []);
  fs.writeFileSync(filePath, risumBuf);
}

// ---------------------------------------------------------------------------
// Open / Save .risup (Bot Preset)
// ---------------------------------------------------------------------------

const RISUP_ENCRYPTION_KEY = 'risupreset';
const RISUP_IV = Buffer.alloc(12); // 12 zero bytes

/**
 * Derive AES-256-GCM key from passphrase using SHA-256 (matches RisuAI Web Crypto)
 */
function deriveRisupKey(): Buffer {
  return crypto.createHash('sha256').update(RISUP_ENCRYPTION_KEY, 'utf8').digest();
}

/**
 * Decrypt AES-GCM encrypted buffer (compatible with Web Crypto API output)
 * Web Crypto appends 16-byte auth tag to ciphertext
 */
function decryptAesGcm(encrypted: Buffer): Buffer {
  const key = deriveRisupKey();
  const tagLength = 16;
  if (encrypted.length < tagLength) {
    throw new Error(`Encrypted data too small (${encrypted.length} bytes, need ≥${tagLength})`);
  }
  const ciphertext = encrypted.subarray(0, encrypted.length - tagLength);
  const authTag = encrypted.subarray(encrypted.length - tagLength);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, RISUP_IV);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypt buffer with AES-GCM (compatible with Web Crypto API input)
 * Returns ciphertext + 16-byte auth tag appended
 */
function encryptAesGcm(plaintext: Buffer): Buffer {
  const key = deriveRisupKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, RISUP_IV);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([encrypted, authTag]);
}

/** Helper: extract optional number field from preset */
function presetNum(preset: Record<string, unknown>, key: string, def?: number): number | undefined {
  return typeof preset[key] === 'number' ? (preset[key] as number) : def;
}

/** Extract preset fields from a botPreset object into CharxData. */
function extractPresetFields(preset: Record<string, unknown>): Partial<CharxData> {
  return {
    name: (preset.name as string) || 'Unnamed Preset',

    // Basic prompt fields
    mainPrompt: (preset.mainPrompt as string) || '',
    jailbreak: (preset.jailbreak as string) || '',
    globalNote: (preset.globalNote as string) || '',

    // Core parameters
    temperature: presetNum(preset, 'temperature', 80),
    maxContext: presetNum(preset, 'maxContext', 4000),
    maxResponse: presetNum(preset, 'maxResponse', 300),
    frequencyPenalty: presetNum(preset, 'frequencyPenalty', 70),
    presencePenalty: typeof preset.PresensePenalty === 'number' ? (preset.PresensePenalty as number) : 70,

    // Sampling parameters
    top_p: presetNum(preset, 'top_p'),
    top_k: presetNum(preset, 'top_k'),
    repetition_penalty: presetNum(preset, 'repetition_penalty'),
    min_p: presetNum(preset, 'min_p'),
    top_a: presetNum(preset, 'top_a'),

    // Thinking / reasoning
    reasonEffort: presetNum(preset, 'reasonEffort'),
    thinkingTokens: presetNum(preset, 'thinkingTokens'),
    thinkingType: (preset.thinkingType as string) || undefined,
    adaptiveThinkingEffort: (preset.adaptiveThinkingEffort as string) || undefined,

    // Model & API
    aiModel: (preset.aiModel as string) || '',
    subModel: (preset.subModel as string) || '',
    apiType: (preset.apiType as string) || '',
    promptPreprocess: !!preset.promptPreprocess,

    // Templates & formatting
    promptTemplate: preset.promptTemplate ? JSON.stringify(preset.promptTemplate) : '[]',
    presetBias: preset.bias ? JSON.stringify(preset.bias) : '[]',
    formatingOrder: preset.formatingOrder ? JSON.stringify(preset.formatingOrder) : '[]',
    useInstructPrompt: preset.useInstructPrompt != null ? !!preset.useInstructPrompt : undefined,
    instructChatTemplate: (preset.instructChatTemplate as string) || undefined,
    JinjaTemplate: (preset.JinjaTemplate as string) || undefined,
    customPromptTemplateToggle: (preset.customPromptTemplateToggle as string) || undefined,
    templateDefaultVariables: (preset.templateDefaultVariables as string) || undefined,
    moduleIntergration: (preset.moduleIntergration as string) || undefined,

    // JSON schema & structured output
    jsonSchemaEnabled: preset.jsonSchemaEnabled != null ? !!preset.jsonSchemaEnabled : undefined,
    jsonSchema: (preset.jsonSchema as string) || undefined,
    strictJsonSchema: preset.strictJsonSchema != null ? !!preset.strictJsonSchema : undefined,
    extractJson: (preset.extractJson as string) || undefined,

    // Group settings
    groupTemplate: (preset.groupTemplate as string) || undefined,
    groupOtherBotRole: (preset.groupOtherBotRole as string) || undefined,

    // Auto-suggest
    autoSuggestPrompt: (preset.autoSuggestPrompt as string) || undefined,
    autoSuggestPrefix: (preset.autoSuggestPrefix as string) || undefined,
    autoSuggestClean: preset.autoSuggestClean != null ? !!preset.autoSuggestClean : undefined,

    // Stop strings
    localStopStrings: Array.isArray(preset.localStopStrings) ? JSON.stringify(preset.localStopStrings) : undefined,

    // Misc
    outputImageModal: preset.outputImageModal != null ? !!preset.outputImageModal : undefined,
    verbosity: presetNum(preset, 'verbosity'),
    fallbackWhenBlankResponse:
      preset.fallbackWhenBlankResponse != null ? !!preset.fallbackWhenBlankResponse : undefined,
    systemContentReplacement: (preset.systemContentReplacement as string) || undefined,
    systemRoleReplacement: (preset.systemRoleReplacement as string) || undefined,

    // Regex & image (normalize types for RisuAI compatibility)
    regex: (() => {
      const r = Array.isArray(preset.regex) ? preset.regex : [];
      normalizeRegexArray(r);
      return r;
    })(),
    presetImage: (preset.image as string) || '',
  };
}

/** Write edited preset fields back into a botPreset object. */
function applyPresetFields(preset: Record<string, unknown>, data: CharxData): void {
  preset.name = data.name;

  // Basic prompt fields
  if (data.mainPrompt !== undefined) preset.mainPrompt = data.mainPrompt;
  if (data.jailbreak !== undefined) preset.jailbreak = data.jailbreak;
  if (data.globalNote !== undefined) preset.globalNote = data.globalNote;

  // Core parameters
  if (data.temperature !== undefined) preset.temperature = data.temperature;
  if (data.maxContext !== undefined) preset.maxContext = data.maxContext;
  if (data.maxResponse !== undefined) preset.maxResponse = data.maxResponse;
  if (data.frequencyPenalty !== undefined) preset.frequencyPenalty = data.frequencyPenalty;
  if (data.presencePenalty !== undefined) preset.PresensePenalty = data.presencePenalty;

  // Sampling parameters
  if (data.top_p !== undefined) preset.top_p = data.top_p;
  if (data.top_k !== undefined) preset.top_k = data.top_k;
  if (data.repetition_penalty !== undefined) preset.repetition_penalty = data.repetition_penalty;
  if (data.min_p !== undefined) preset.min_p = data.min_p;
  if (data.top_a !== undefined) preset.top_a = data.top_a;

  // Thinking / reasoning
  if (data.reasonEffort !== undefined) preset.reasonEffort = data.reasonEffort;
  if (data.thinkingTokens !== undefined) preset.thinkingTokens = data.thinkingTokens;
  if (data.thinkingType !== undefined) preset.thinkingType = data.thinkingType;
  if (data.adaptiveThinkingEffort !== undefined) preset.adaptiveThinkingEffort = data.adaptiveThinkingEffort;

  // Model & API
  if (data.aiModel !== undefined) preset.aiModel = data.aiModel;
  if (data.subModel !== undefined) preset.subModel = data.subModel;
  if (data.apiType !== undefined) preset.apiType = data.apiType;
  if (data.promptPreprocess !== undefined) preset.promptPreprocess = data.promptPreprocess;

  // Templates & formatting (JSON-encoded fields)
  if (data.promptTemplate !== undefined) {
    try {
      preset.promptTemplate = JSON.parse(data.promptTemplate);
    } catch {
      /* keep original */
    }
  }
  if (data.presetBias !== undefined) {
    try {
      preset.bias = JSON.parse(data.presetBias);
    } catch {
      /* keep original */
    }
  }
  if (data.formatingOrder !== undefined) {
    try {
      preset.formatingOrder = JSON.parse(data.formatingOrder);
    } catch {
      /* keep original */
    }
  }

  // Templates & formatting (scalar fields)
  if (data.useInstructPrompt !== undefined) preset.useInstructPrompt = data.useInstructPrompt;
  if (data.instructChatTemplate !== undefined) preset.instructChatTemplate = data.instructChatTemplate;
  if (data.JinjaTemplate !== undefined) preset.JinjaTemplate = data.JinjaTemplate;
  if (data.customPromptTemplateToggle !== undefined)
    preset.customPromptTemplateToggle = data.customPromptTemplateToggle;
  if (data.templateDefaultVariables !== undefined) preset.templateDefaultVariables = data.templateDefaultVariables;
  if (data.moduleIntergration !== undefined) preset.moduleIntergration = data.moduleIntergration;

  // JSON schema & structured output
  if (data.jsonSchemaEnabled !== undefined) preset.jsonSchemaEnabled = data.jsonSchemaEnabled;
  if (data.jsonSchema !== undefined) preset.jsonSchema = data.jsonSchema;
  if (data.strictJsonSchema !== undefined) preset.strictJsonSchema = data.strictJsonSchema;
  if (data.extractJson !== undefined) preset.extractJson = data.extractJson;

  // Group settings
  if (data.groupTemplate !== undefined) preset.groupTemplate = data.groupTemplate;
  if (data.groupOtherBotRole !== undefined) preset.groupOtherBotRole = data.groupOtherBotRole;

  // Auto-suggest
  if (data.autoSuggestPrompt !== undefined) preset.autoSuggestPrompt = data.autoSuggestPrompt;
  if (data.autoSuggestPrefix !== undefined) preset.autoSuggestPrefix = data.autoSuggestPrefix;
  if (data.autoSuggestClean !== undefined) preset.autoSuggestClean = data.autoSuggestClean;

  // Stop strings (JSON-encoded)
  if (data.localStopStrings !== undefined) {
    try {
      preset.localStopStrings = JSON.parse(data.localStopStrings);
    } catch {
      /* keep original */
    }
  }

  // Misc
  if (data.outputImageModal !== undefined) preset.outputImageModal = data.outputImageModal;
  if (data.verbosity !== undefined) preset.verbosity = data.verbosity;
  if (data.fallbackWhenBlankResponse !== undefined) preset.fallbackWhenBlankResponse = data.fallbackWhenBlankResponse;
  if (data.systemContentReplacement !== undefined) preset.systemContentReplacement = data.systemContentReplacement;
  if (data.systemRoleReplacement !== undefined) preset.systemRoleReplacement = data.systemRoleReplacement;

  // Regex & image (normalize types for RisuAI compatibility)
  if (data.regex !== undefined) {
    preset.regex = data.regex;
    normalizeRegexArray(preset.regex as unknown[]);
  }
  if (data.presetImage !== undefined) preset.image = data.presetImage;
}

/**
 * Open and parse a .risup preset file
 * Format: RPack → zlib inflate → msgpack → AES-GCM decrypt → msgpack → botPreset
 */
export function openRisup(filePath: string): CharxData {
  validateFileSize(filePath);
  const raw: Buffer = fs.readFileSync(filePath);

  // Step 1: RPack decode (byte substitution)
  const decoded = rpackDecode(raw);

  // Step 2: Raw DEFLATE decompress (fflate.compressSync produces raw DEFLATE, not zlib)
  const decompressed = zlib.inflateRawSync(decoded);

  // Step 3: MessagePack decode outer envelope
  let envelope: Record<string, unknown>;
  try {
    envelope = unpack(decompressed) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Failed to decode .risup envelope: ${e instanceof Error ? e.message : String(e)}`);
  }
  const validatedEnvelope = validateRisupEnvelope(envelope);

  // Step 4: AES-GCM decrypt the preset payload
  const encryptedPreset = validatedEnvelope.preset ?? validatedEnvelope.pres;
  const decryptedBuf = decryptAesGcm(Buffer.from(encryptedPreset as Uint8Array));

  // Step 5: MessagePack decode the actual preset
  let preset: Record<string, unknown>;
  try {
    preset = validateRisupPresetPayload(unpack(decryptedBuf));
  } catch (e) {
    if (e instanceof Error && e.message.includes('Invalid .risup file:')) {
      throw e;
    }
    throw new Error(`Failed to decode preset data: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Clear sensitive keys for safety
  const sanitized = { ...preset };
  delete sanitized.openAIKey;
  delete sanitized.proxyKey;

  return {
    _fileType: 'risup',

    // Extract editable fields
    ...(extractPresetFields(sanitized) as CharxData),

    // Fields not applicable to presets (empty defaults)
    description: '',
    firstMessage: '',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: [],
    lorebook: [],

    // Assets (presets don't have them)
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],

    // Preserved data
    _risuExt: {},
    _card: {},
    _moduleData: null,
    _presetData: sanitized,
  };
}

/**
 * Save data back to a .risup preset file
 * Format: botPreset → msgpack → AES-GCM encrypt → msgpack envelope → zlib deflate → RPack
 */
export function saveRisup(filePath: string, data: CharxData): void {
  // Start from preserved preset data, or create minimal preset
  const preset: Record<string, unknown> = data._presetData ? JSON.parse(JSON.stringify(data._presetData)) : {};

  // Apply edited fields
  applyPresetFields(preset, data);

  // Clear sensitive keys (never re-export API keys)
  delete preset.openAIKey;
  delete preset.proxyKey;

  // Step 1: MessagePack encode preset
  const presetBuf = pack(preset);

  // Step 2: AES-GCM encrypt
  const encrypted = encryptAesGcm(presetBuf);

  // Step 3: MessagePack encode envelope
  const envelope = pack({
    presetVersion: 2,
    type: 'preset',
    preset: encrypted,
  });

  // Step 4: Raw DEFLATE compress (matches fflate.compressSync format)
  const compressed = zlib.deflateRawSync(envelope);

  // Step 5: RPack encode
  const encoded = rpackEncode(compressed);

  fs.writeFileSync(filePath, encoded);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
