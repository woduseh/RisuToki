// Shared typed model for risup promptTemplate and formatingOrder fields.
// Mirrors only the prompt item shapes needed from RisuAI prompt.ts.
// Unknown shapes are preserved via rawValue so no data is silently lost.

import { isRecord, cloneRecord, cloneJson } from './shared-utils';

type JsonRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAIN_KINDS = ['plain', 'jailbreak', 'cot'] as const;
const TYPED_KINDS = ['persona', 'description', 'lorebook', 'postEverything', 'memory'] as const;
const PLAIN_ROLES = ['user', 'bot', 'system'] as const;
const CACHE_ROLES = ['user', 'assistant', 'system', 'all'] as const;
const TYPE2_VALUES = ['normal', 'globalNote', 'main'] as const;
const TEXT_PROMPT_BLOCK_HEADER_RE = /^### \[([^\]]+)] ###$/;
const FORMATTING_ORDER_TOKENS = [
  'main',
  'jailbreak',
  'chats',
  'lorebook',
  'globalNote',
  'authorNote',
  'lastChat',
  'description',
  'postEverything',
  'personaPrompt',
] as const;
export const SUPPORTED_PROMPT_ITEM_TYPES = [
  'plain',
  'jailbreak',
  'cot',
  'chatML',
  'persona',
  'description',
  'lorebook',
  'postEverything',
  'memory',
  'authornote',
  'chat',
  'cache',
] as const;

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type PromptItemPlainKind = (typeof PLAIN_KINDS)[number];
export type PromptItemTypedKind = (typeof TYPED_KINDS)[number];
export type PromptItemRole = (typeof PLAIN_ROLES)[number];
export type PromptItemCacheRole = (typeof CACHE_ROLES)[number];
export type PromptItemType2 = (typeof TYPE2_VALUES)[number];
export type FormatingOrderToken = (typeof FORMATTING_ORDER_TOKENS)[number];
export type SupportedPromptItemType = (typeof SUPPORTED_PROMPT_ITEM_TYPES)[number];

export interface PromptItemBaseModel {
  id: string;
}

export interface PromptItemPlainModel extends PromptItemBaseModel {
  type: PromptItemPlainKind;
  type2: PromptItemType2;
  text: string;
  role: PromptItemRole;
  name: string | undefined;
  supported: true;
  rawValue: JsonRecord;
}

export interface PromptItemChatMLModel extends PromptItemBaseModel {
  type: 'chatML';
  text: string;
  name: string | undefined;
  supported: true;
  rawValue: JsonRecord;
}

export interface PromptItemTypedModel extends PromptItemBaseModel {
  type: PromptItemTypedKind;
  innerFormat: string | undefined;
  name: string | undefined;
  supported: true;
  rawValue: JsonRecord;
}

export interface PromptItemAuthorNoteModel extends PromptItemBaseModel {
  type: 'authornote';
  innerFormat: string | undefined;
  defaultText: string | undefined;
  name: string | undefined;
  supported: true;
  rawValue: JsonRecord;
}

export interface PromptItemChatModel extends PromptItemBaseModel {
  type: 'chat';
  rangeStart: number;
  rangeEnd: number | 'end';
  chatAsOriginalOnSystem: boolean | undefined;
  name: string | undefined;
  supported: true;
  rawValue: JsonRecord;
}

export interface PromptItemCacheModel extends PromptItemBaseModel {
  type: 'cache';
  name: string;
  depth: number;
  role: PromptItemCacheRole;
  supported: true;
  rawValue: JsonRecord;
}

export interface PromptItemUnknownModel {
  id: string | undefined;
  type: string | null;
  supported: false;
  rawValue: unknown;
}

export type PromptItemModel =
  | PromptItemPlainModel
  | PromptItemChatMLModel
  | PromptItemTypedModel
  | PromptItemAuthorNoteModel
  | PromptItemChatModel
  | PromptItemCacheModel
  | PromptItemUnknownModel;

export type PromptTemplateState = 'empty' | 'valid' | 'invalid';

export interface PromptTemplateModel {
  state: PromptTemplateState;
  items: PromptItemModel[];
  hasUnsupportedContent: boolean;
  rawText: string;
  parseError?: string;
}

export interface FormatingOrderItemModel {
  token: string;
  known: boolean;
}

export type FormatingOrderState = 'empty' | 'valid' | 'invalid';

export interface FormatingOrderModel {
  state: FormatingOrderState;
  items: FormatingOrderItemModel[];
  rawText: string;
  parseError?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPlainKind(v: unknown): v is PromptItemPlainKind {
  return PLAIN_KINDS.includes(v as PromptItemPlainKind);
}

function isTypedKind(v: unknown): v is PromptItemTypedKind {
  return TYPED_KINDS.includes(v as PromptItemTypedKind);
}

function isPlainRole(v: unknown): v is PromptItemRole {
  return PLAIN_ROLES.includes(v as PromptItemRole);
}

function isCacheRole(v: unknown): v is PromptItemCacheRole {
  return CACHE_ROLES.includes(v as PromptItemCacheRole);
}

function isType2(v: unknown): v is PromptItemType2 {
  return TYPE2_VALUES.includes(v as PromptItemType2);
}

function isFormatingOrderToken(v: unknown): v is FormatingOrderToken {
  return FORMATTING_ORDER_TOKENS.includes(v as FormatingOrderToken);
}

function optionalString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function generateItemId(type: string, signature: string, occurrenceIndex: number): string {
  const hash = djb2Hash(signature);
  return `prompt-${type}-${hash}-${occurrenceIndex}`;
}

// ---------------------------------------------------------------------------
// Item parsers
// ---------------------------------------------------------------------------

function parsePlainItem(raw: JsonRecord): PromptItemPlainModel {
  const type = raw['type'] as PromptItemPlainKind;
  return {
    id: '',
    type,
    type2: isType2(raw['type2']) ? raw['type2'] : 'normal',
    text: typeof raw['text'] === 'string' ? raw['text'] : '',
    role: isPlainRole(raw['role']) ? raw['role'] : 'system',
    name: optionalString(raw['name']),
    supported: true,
    rawValue: raw,
  };
}

function parseChatMLItem(raw: JsonRecord): PromptItemChatMLModel {
  return {
    id: '',
    type: 'chatML',
    text: typeof raw['text'] === 'string' ? raw['text'] : '',
    name: optionalString(raw['name']),
    supported: true,
    rawValue: raw,
  };
}

function parseTypedItem(raw: JsonRecord): PromptItemTypedModel {
  return {
    id: '',
    type: raw['type'] as PromptItemTypedKind,
    innerFormat: optionalString(raw['innerFormat']),
    name: optionalString(raw['name']),
    supported: true,
    rawValue: raw,
  };
}

function parseAuthorNoteItem(raw: JsonRecord): PromptItemAuthorNoteModel {
  return {
    id: '',
    type: 'authornote',
    innerFormat: optionalString(raw['innerFormat']),
    defaultText: optionalString(raw['defaultText']),
    name: optionalString(raw['name']),
    supported: true,
    rawValue: raw,
  };
}

function parseChatItem(raw: JsonRecord): PromptItemChatModel {
  const rangeEndRaw = raw['rangeEnd'];
  const rangeEnd: number | 'end' =
    rangeEndRaw === 'end' ? 'end' : typeof rangeEndRaw === 'number' ? rangeEndRaw : 'end';
  return {
    id: '',
    type: 'chat',
    rangeStart: typeof raw['rangeStart'] === 'number' ? raw['rangeStart'] : 0,
    rangeEnd,
    chatAsOriginalOnSystem:
      typeof raw['chatAsOriginalOnSystem'] === 'boolean' ? raw['chatAsOriginalOnSystem'] : undefined,
    name: optionalString(raw['name']),
    supported: true,
    rawValue: raw,
  };
}

function parseCacheItem(raw: JsonRecord): PromptItemCacheModel {
  return {
    id: '',
    type: 'cache',
    name: typeof raw['name'] === 'string' ? raw['name'] : '',
    depth: typeof raw['depth'] === 'number' ? raw['depth'] : 0,
    role: isCacheRole(raw['role']) ? raw['role'] : 'user',
    supported: true,
    rawValue: raw,
  };
}

function parsePromptItem(value: unknown): PromptItemModel {
  if (!isRecord(value)) {
    return {
      id: undefined,
      type: null,
      supported: false,
      rawValue: cloneJson(value),
    };
  }

  const raw = cloneRecord(value);
  const type = raw['type'];

  if (isPlainKind(type)) return parsePlainItem(raw);
  if (type === 'chatML') return parseChatMLItem(raw);
  if (isTypedKind(type)) return parseTypedItem(raw);
  if (type === 'authornote') return parseAuthorNoteItem(raw);
  if (type === 'chat') return parseChatItem(raw);
  if (type === 'cache') return parseCacheItem(raw);

  const rawId = raw['id'];
  return {
    id: typeof rawId === 'string' ? rawId : undefined,
    type: typeof type === 'string' ? type : null,
    supported: false,
    rawValue: cloneJson(value),
  };
}

// ---------------------------------------------------------------------------
// Item serializers
// ---------------------------------------------------------------------------

function serializePlainItem(item: PromptItemPlainModel): unknown {
  const out = cloneRecord(item.rawValue);
  out['id'] = item.id;
  out['type'] = item.type;
  out['type2'] = item.type2;
  out['text'] = item.text;
  out['role'] = item.role;
  if (item.name !== undefined) {
    out['name'] = item.name;
  } else {
    delete out['name'];
  }
  return out;
}

function serializeChatMLItem(item: PromptItemChatMLModel): unknown {
  const out = cloneRecord(item.rawValue);
  out['id'] = item.id;
  out['type'] = 'chatML';
  out['text'] = item.text;
  if (item.name !== undefined) {
    out['name'] = item.name;
  } else {
    delete out['name'];
  }
  return out;
}

function serializeTypedItem(item: PromptItemTypedModel): unknown {
  const out = cloneRecord(item.rawValue);
  out['id'] = item.id;
  out['type'] = item.type;
  if (item.innerFormat !== undefined) {
    out['innerFormat'] = item.innerFormat;
  } else {
    delete out['innerFormat'];
  }
  if (item.name !== undefined) {
    out['name'] = item.name;
  } else {
    delete out['name'];
  }
  return out;
}

function serializeAuthorNoteItem(item: PromptItemAuthorNoteModel): unknown {
  const out = cloneRecord(item.rawValue);
  out['id'] = item.id;
  out['type'] = 'authornote';
  if (item.innerFormat !== undefined) {
    out['innerFormat'] = item.innerFormat;
  } else {
    delete out['innerFormat'];
  }
  if (item.defaultText !== undefined) {
    out['defaultText'] = item.defaultText;
  } else {
    delete out['defaultText'];
  }
  if (item.name !== undefined) {
    out['name'] = item.name;
  } else {
    delete out['name'];
  }
  return out;
}

function serializeChatItem(item: PromptItemChatModel): unknown {
  const out = cloneRecord(item.rawValue);
  out['id'] = item.id;
  out['type'] = 'chat';
  out['rangeStart'] = item.rangeStart;
  out['rangeEnd'] = item.rangeEnd;
  if (item.chatAsOriginalOnSystem !== undefined) {
    out['chatAsOriginalOnSystem'] = item.chatAsOriginalOnSystem;
  } else {
    delete out['chatAsOriginalOnSystem'];
  }
  if (item.name !== undefined) {
    out['name'] = item.name;
  } else {
    delete out['name'];
  }
  return out;
}

function serializeCacheItem(item: PromptItemCacheModel): unknown {
  const out = cloneRecord(item.rawValue);
  out['id'] = item.id;
  out['type'] = 'cache';
  out['name'] = item.name;
  out['depth'] = item.depth;
  out['role'] = item.role;
  return out;
}

function serializePromptItem(item: PromptItemModel): unknown {
  if (!item.supported) {
    return cloneJson(item.rawValue);
  }
  switch (item.type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
      return serializePlainItem(item);
    case 'chatML':
      return serializeChatMLItem(item);
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
      return serializeTypedItem(item);
    case 'authornote':
      return serializeAuthorNoteItem(item);
    case 'chat':
      return serializeChatItem(item);
    case 'cache':
      return serializeCacheItem(item);
  }
}

// ---------------------------------------------------------------------------
// Public API: promptTemplate
// ---------------------------------------------------------------------------

export function parsePromptTemplate(text: string): PromptTemplateModel {
  const rawText = typeof text === 'string' ? text : '';
  const trimmed = rawText.trim();

  if (!trimmed) {
    return { state: 'empty', items: [], hasUnsupportedContent: false, rawText };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error);
    return { state: 'invalid', items: [], hasUnsupportedContent: false, rawText, parseError };
  }

  if (!Array.isArray(parsed)) {
    const parseError = 'promptTemplate must be a JSON array.';
    return { state: 'invalid', items: [], hasUnsupportedContent: false, rawText, parseError };
  }

  if (parsed.length === 0) {
    return { state: 'empty', items: [], hasUnsupportedContent: false, rawText };
  }

  const items = parsed.map(parsePromptItem);

  // Assign stable IDs to supported items
  const signatureCounts = new Map<string, number>();
  for (const item of items) {
    if (item.supported) {
      const rawId = item.rawValue['id'];
      if (typeof rawId === 'string' && rawId) {
        item.id = rawId;
      } else {
        const signature = JSON.stringify(item.rawValue);
        const count = signatureCounts.get(signature) ?? 0;
        signatureCounts.set(signature, count + 1);
        item.id = generateItemId(item.type, signature, count);
      }
    }
  }

  const hasUnsupportedContent = items.some((item) => !item.supported);

  return {
    state: 'valid',
    items,
    hasUnsupportedContent,
    rawText,
  };
}

export function validatePromptTemplateText(text: string): string | null {
  const model = parsePromptTemplate(text);
  return model.state === 'invalid' ? (model.parseError ?? 'Invalid promptTemplate') : null;
}

export function validatePresetBiasText(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      return 'presetBias must be a JSON array.';
    }
    const isValid = parsed.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === 'string' &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1]),
    );
    return isValid ? null : 'presetBias must contain only pairs of [string, number].';
  } catch (error) {
    return (error as Error).message;
  }
}

export function serializePromptTemplate(model: Pick<PromptTemplateModel, 'items'>): string {
  if (!model || !Array.isArray(model.items) || model.items.length === 0) {
    return '[]';
  }
  return JSON.stringify(model.items.map(serializePromptItem), null, 2);
}

function normalizePromptTextFormat(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function countTextLines(text: string): number {
  return text === '' ? 0 : text.split('\n').length;
}

function pushPromptTextStringMeta(lines: string[], key: string, value: string | undefined): void {
  if (value === undefined) return;
  if (value.includes('\n') || value.startsWith(' ')) {
    lines.push(`${key}-json: ${JSON.stringify(value)}`);
    return;
  }
  lines.push(`${key}: ${value}`);
}

function readPromptTextStringMeta(
  meta: Map<string, string>,
  key: string,
): { found: boolean; value?: string; error?: string } {
  const plainKey = key;
  const jsonKey = `${key}-json`;
  const hasPlain = meta.has(plainKey);
  const hasJson = meta.has(jsonKey);
  if (hasPlain && hasJson) {
    return { found: true, error: `Use either "${plainKey}" or "${jsonKey}", not both.` };
  }
  if (hasJson) {
    try {
      const parsed = JSON.parse(meta.get(jsonKey) ?? '');
      if (typeof parsed !== 'string') {
        return { found: true, error: `"${jsonKey}" must decode to a JSON string.` };
      }
      return { found: true, value: parsed };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { found: true, error: `Invalid "${jsonKey}": ${message}` };
    }
  }
  if (hasPlain) {
    return { found: true, value: meta.get(plainKey) ?? '' };
  }
  return { found: false };
}

function parsePromptTextNonNegativeInteger(value: string, key: string): { value?: number; error?: string } {
  if (!/^\d+$/.test(value)) {
    return { error: `"${key}" must be a non-negative integer.` };
  }
  return { value: Number.parseInt(value, 10) };
}

function parsePromptTextInteger(value: string, key: string): { value?: number; error?: string } {
  if (!/^-?\d+$/.test(value)) {
    return { error: `"${key}" must be an integer.` };
  }
  return { value: Number.parseInt(value, 10) };
}

function readPromptTextExtraJson(meta: Map<string, string>): { value?: JsonRecord; error?: string } {
  if (!meta.has('extra-json')) {
    return {};
  }
  try {
    const parsed = JSON.parse(meta.get('extra-json') ?? '');
    if (!isRecord(parsed)) {
      return { error: '"extra-json" must decode to a JSON object.' };
    }
    return { value: cloneRecord(parsed) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Invalid "extra-json": ${message}` };
  }
}

function buildPromptTextExtraJson(item: PromptItemModel): JsonRecord | undefined {
  if (!item.supported) return undefined;
  const extras = cloneRecord(item.rawValue);
  delete extras['id'];
  delete extras['type'];
  delete extras['name'];
  switch (item.type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
      delete extras['type2'];
      delete extras['text'];
      delete extras['role'];
      break;
    case 'chatML':
      delete extras['text'];
      break;
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
      delete extras['innerFormat'];
      break;
    case 'authornote':
      delete extras['innerFormat'];
      delete extras['defaultText'];
      break;
    case 'chat':
      delete extras['rangeStart'];
      delete extras['rangeEnd'];
      delete extras['chatAsOriginalOnSystem'];
      break;
    case 'cache':
      delete extras['depth'];
      delete extras['role'];
      break;
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
}

function readPromptTextBody(
  lines: string[],
  startIndex: number,
  bodyLineCount: number,
): { body?: string; nextIndex?: number; error?: string } {
  if (startIndex + bodyLineCount >= lines.length) {
    return { error: `Expected ${bodyLineCount} body line(s) before "===".` };
  }
  const bodyLines = lines.slice(startIndex, startIndex + bodyLineCount);
  const nextIndex = startIndex + bodyLineCount;
  if (lines[nextIndex] !== '===') {
    return { error: `Expected "===" after ${bodyLineCount} body line(s).` };
  }
  return { body: bodyLines.join('\n'), nextIndex };
}

export function serializePromptItemToTextBlock(item: PromptItemModel): string {
  const lines: string[] = [];
  if (!item.supported) {
    lines.push('### [raw] ###');
    if (item.id !== undefined) {
      lines.push(`id: ${item.id}`);
    }
    if (item.type !== null) {
      lines.push(`raw-type: ${item.type}`);
    }
    const body = JSON.stringify(item.rawValue, null, 2) ?? 'null';
    lines.push(`body-lines: ${countTextLines(body)}`);
    lines.push('---');
    if (body !== '') {
      lines.push(...body.split('\n'));
    }
    lines.push('===');
    return lines.join('\n');
  }

  lines.push(`### [${item.type}] ###`);
  lines.push(`id: ${item.id}`);
  pushPromptTextStringMeta(lines, 'name', item.name);

  let body: string | undefined;
  switch (item.type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
      lines.push(`type2: ${item.type2}`);
      lines.push(`role: ${item.role}`);
      body = item.text;
      break;
    case 'chatML':
      body = item.text;
      break;
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
      body = item.innerFormat;
      break;
    case 'authornote':
      pushPromptTextStringMeta(lines, 'defaultText', item.defaultText);
      body = item.innerFormat;
      break;
    case 'chat':
      lines.push(`rangeStart: ${item.rangeStart}`);
      lines.push(`rangeEnd: ${item.rangeEnd}`);
      if (item.chatAsOriginalOnSystem !== undefined) {
        lines.push(`chatAsOriginalOnSystem: ${String(item.chatAsOriginalOnSystem)}`);
      }
      break;
    case 'cache':
      lines.push(`depth: ${item.depth}`);
      lines.push(`role: ${item.role}`);
      break;
  }

  const extraJson = buildPromptTextExtraJson(item);
  if (extraJson) {
    lines.push(`extra-json: ${JSON.stringify(extraJson)}`);
  }

  if (body !== undefined) {
    lines.push(`body-lines: ${countTextLines(body)}`);
    lines.push('---');
    if (body !== '') {
      lines.push(...body.split('\n'));
    }
  }
  lines.push('===');
  return lines.join('\n');
}

function validatePromptTextMetaKeys(
  meta: Map<string, string>,
  allowedKeys: readonly string[],
  blockType: string,
  blockIndex: number,
): string | null {
  const allowed = new Set(allowedKeys);
  for (const key of meta.keys()) {
    if (!allowed.has(key)) {
      return `Block ${blockIndex}: unexpected metadata key "${key}" for type "${blockType}".`;
    }
  }
  return null;
}

function buildPromptItemFromTextBlock(
  blockType: string,
  meta: Map<string, string>,
  body: string | undefined,
  blockIndex: number,
): { value?: unknown; error?: string } {
  if (blockType === 'raw') {
    const metaError = validatePromptTextMetaKeys(meta, ['id', 'raw-type', 'body-lines'], blockType, blockIndex);
    if (metaError) return { error: metaError };
    if (body === undefined) {
      return { error: `Block ${blockIndex}: raw blocks require a JSON body.` };
    }
    try {
      return { value: JSON.parse(body) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: `Block ${blockIndex}: invalid raw JSON body: ${message}` };
    }
  }

  if (!SUPPORTED_PROMPT_ITEM_TYPES.includes(blockType as SupportedPromptItemType)) {
    return {
      error: `Block ${blockIndex}: unsupported block type "${blockType}". Supported types: ${SUPPORTED_PROMPT_ITEM_TYPES.join(', ')}, raw.`,
    };
  }

  const extraJson = readPromptTextExtraJson(meta);
  if (extraJson.error) {
    return { error: `Block ${blockIndex}: ${extraJson.error}` };
  }
  const raw: JsonRecord = extraJson.value ? cloneRecord(extraJson.value) : {};
  const id = meta.get('id');
  if (id !== undefined) {
    raw['id'] = id;
  }
  const nameMeta = readPromptTextStringMeta(meta, 'name');
  if (nameMeta.error) {
    return { error: `Block ${blockIndex}: ${nameMeta.error}` };
  }
  raw['type'] = blockType;
  if (nameMeta.found) {
    raw['name'] = nameMeta.value ?? '';
  } else {
    delete raw['name'];
  }

  switch (blockType) {
    case 'plain':
    case 'jailbreak':
    case 'cot': {
      const metaError = validatePromptTextMetaKeys(
        meta,
        ['id', 'name', 'name-json', 'type2', 'role', 'extra-json', 'body-lines'],
        blockType,
        blockIndex,
      );
      if (metaError) return { error: metaError };
      raw['type2'] = meta.get('type2') ?? 'normal';
      raw['role'] = meta.get('role') ?? 'system';
      raw['text'] = body ?? '';
      return { value: raw };
    }
    case 'chatML': {
      const metaError = validatePromptTextMetaKeys(
        meta,
        ['id', 'name', 'name-json', 'extra-json', 'body-lines'],
        blockType,
        blockIndex,
      );
      if (metaError) return { error: metaError };
      raw['text'] = body ?? '';
      return { value: raw };
    }
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory': {
      const metaError = validatePromptTextMetaKeys(
        meta,
        ['id', 'name', 'name-json', 'extra-json', 'body-lines'],
        blockType,
        blockIndex,
      );
      if (metaError) return { error: metaError };
      if (body !== undefined) {
        raw['innerFormat'] = body;
      } else {
        delete raw['innerFormat'];
      }
      return { value: raw };
    }
    case 'authornote': {
      const metaError = validatePromptTextMetaKeys(
        meta,
        ['id', 'name', 'name-json', 'defaultText', 'defaultText-json', 'extra-json', 'body-lines'],
        blockType,
        blockIndex,
      );
      if (metaError) return { error: metaError };
      const defaultTextMeta = readPromptTextStringMeta(meta, 'defaultText');
      if (defaultTextMeta.error) {
        return { error: `Block ${blockIndex}: ${defaultTextMeta.error}` };
      }
      if (defaultTextMeta.found) {
        raw['defaultText'] = defaultTextMeta.value ?? '';
      } else {
        delete raw['defaultText'];
      }
      if (body !== undefined) {
        raw['innerFormat'] = body;
      } else {
        delete raw['innerFormat'];
      }
      return { value: raw };
    }
    case 'chat': {
      const metaError = validatePromptTextMetaKeys(
        meta,
        ['id', 'name', 'name-json', 'rangeStart', 'rangeEnd', 'chatAsOriginalOnSystem', 'extra-json'],
        blockType,
        blockIndex,
      );
      if (metaError) return { error: metaError };
      if (body !== undefined) {
        return { error: `Block ${blockIndex}: chat items do not support a body.` };
      }
      const rangeStartRaw = meta.get('rangeStart') ?? '0';
      const rangeStart = parsePromptTextNonNegativeInteger(rangeStartRaw, 'rangeStart');
      if (rangeStart.error) {
        return { error: `Block ${blockIndex}: ${rangeStart.error}` };
      }
      raw['rangeStart'] = rangeStart.value ?? 0;
      const rangeEndRaw = meta.get('rangeEnd') ?? 'end';
      if (rangeEndRaw === 'end') {
        raw['rangeEnd'] = 'end';
      } else {
        const rangeEnd = parsePromptTextInteger(rangeEndRaw, 'rangeEnd');
        if (rangeEnd.error) {
          return { error: `Block ${blockIndex}: ${rangeEnd.error}` };
        }
        raw['rangeEnd'] = rangeEnd.value ?? 'end';
      }
      if (meta.has('chatAsOriginalOnSystem')) {
        const chatAsOriginalOnSystem = meta.get('chatAsOriginalOnSystem');
        if (chatAsOriginalOnSystem !== 'true' && chatAsOriginalOnSystem !== 'false') {
          return { error: `Block ${blockIndex}: "chatAsOriginalOnSystem" must be true or false.` };
        }
        raw['chatAsOriginalOnSystem'] = chatAsOriginalOnSystem === 'true';
      } else {
        delete raw['chatAsOriginalOnSystem'];
      }
      return { value: raw };
    }
    case 'cache': {
      const metaError = validatePromptTextMetaKeys(
        meta,
        ['id', 'name', 'name-json', 'depth', 'role', 'extra-json'],
        blockType,
        blockIndex,
      );
      if (metaError) return { error: metaError };
      if (body !== undefined) {
        return { error: `Block ${blockIndex}: cache items do not support a body.` };
      }
      raw['name'] = nameMeta.found ? (nameMeta.value ?? '') : '';
      const depth = parsePromptTextNonNegativeInteger(meta.get('depth') ?? '0', 'depth');
      if (depth.error) {
        return { error: `Block ${blockIndex}: ${depth.error}` };
      }
      raw['depth'] = depth.value ?? 0;
      raw['role'] = meta.get('role') ?? 'user';
      return { value: raw };
    }
  }

  return { error: `Block ${blockIndex}: unsupported block type "${blockType}".` };
}

export function serializePromptTemplateToText(model: Pick<PromptTemplateModel, 'items'>): string {
  if (!model || !Array.isArray(model.items) || model.items.length === 0) {
    return '';
  }
  return model.items.map((item) => serializePromptItemToTextBlock(item)).join('\n\n');
}

export function serializePromptTemplateSubsetToText(
  model: Pick<PromptTemplateModel, 'items'>,
  indices: readonly number[],
): string {
  if (!model || !Array.isArray(model.items) || !Array.isArray(indices) || indices.length === 0) {
    return '';
  }
  return serializePromptTemplateToText({
    items: indices.map((index) => model.items[index]).filter((item): item is PromptItemModel => item !== undefined),
  });
}

export function parsePromptTemplateFromText(text: string): PromptTemplateModel {
  const rawText = typeof text === 'string' ? text : '';
  const normalized = normalizePromptTextFormat(rawText);
  if (!normalized.trim()) {
    return { state: 'empty', items: [], hasUnsupportedContent: false, rawText };
  }

  const lines = normalized.split('\n');
  const rawItems: unknown[] = [];
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    while (index < lines.length && lines[index].trim() === '') {
      index += 1;
    }
    if (index >= lines.length) break;

    blockIndex += 1;
    const header = lines[index];
    const match = TEXT_PROMPT_BLOCK_HEADER_RE.exec(header);
    if (!match) {
      return {
        state: 'invalid',
        items: [],
        hasUnsupportedContent: false,
        rawText,
        parseError: `Block ${blockIndex}: expected header like "### [plain] ###".`,
      };
    }
    const blockType = match[1];
    index += 1;

    const meta = new Map<string, string>();
    while (index < lines.length && lines[index] !== '---' && lines[index] !== '===') {
      const line = lines[index];
      index += 1;
      if (line.trim() === '') continue;
      const colonIndex = line.indexOf(':');
      if (colonIndex < 0) {
        return {
          state: 'invalid',
          items: [],
          hasUnsupportedContent: false,
          rawText,
          parseError: `Block ${blockIndex}: invalid metadata line "${line}".`,
        };
      }
      const key = line.slice(0, colonIndex).trim();
      if (!key) {
        return {
          state: 'invalid',
          items: [],
          hasUnsupportedContent: false,
          rawText,
          parseError: `Block ${blockIndex}: metadata key cannot be empty.`,
        };
      }
      if (meta.has(key)) {
        return {
          state: 'invalid',
          items: [],
          hasUnsupportedContent: false,
          rawText,
          parseError: `Block ${blockIndex}: duplicate metadata key "${key}".`,
        };
      }
      const rawValue = line.slice(colonIndex + 1);
      meta.set(key, rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue);
    }

    if (index >= lines.length) {
      return {
        state: 'invalid',
        items: [],
        hasUnsupportedContent: false,
        rawText,
        parseError: `Block ${blockIndex}: missing closing "===".`,
      };
    }

    let body: string | undefined;
    if (lines[index] === '---') {
      const bodyLineCountRaw = meta.get('body-lines');
      if (bodyLineCountRaw === undefined) {
        return {
          state: 'invalid',
          items: [],
          hasUnsupportedContent: false,
          rawText,
          parseError: `Block ${blockIndex}: "body-lines" is required before "---".`,
        };
      }
      const bodyLineCount = parsePromptTextNonNegativeInteger(bodyLineCountRaw, 'body-lines');
      if (bodyLineCount.error) {
        return {
          state: 'invalid',
          items: [],
          hasUnsupportedContent: false,
          rawText,
          parseError: `Block ${blockIndex}: ${bodyLineCount.error}`,
        };
      }
      index += 1;
      const bodyResult = readPromptTextBody(lines, index, bodyLineCount.value ?? 0);
      if (bodyResult.error) {
        return {
          state: 'invalid',
          items: [],
          hasUnsupportedContent: false,
          rawText,
          parseError: `Block ${blockIndex}: ${bodyResult.error}`,
        };
      }
      body = bodyResult.body;
      index = (bodyResult.nextIndex ?? index) + 1;
    } else {
      if (meta.has('body-lines')) {
        return {
          state: 'invalid',
          items: [],
          hasUnsupportedContent: false,
          rawText,
          parseError: `Block ${blockIndex}: "body-lines" requires a following "---" section.`,
        };
      }
      index += 1;
    }

    const built = buildPromptItemFromTextBlock(blockType, meta, body, blockIndex);
    if (built.error) {
      return { state: 'invalid', items: [], hasUnsupportedContent: false, rawText, parseError: built.error };
    }
    rawItems.push(built.value);
  }

  if (rawItems.length === 0) {
    return { state: 'empty', items: [], hasUnsupportedContent: false, rawText };
  }

  const parsed = parsePromptTemplate(JSON.stringify(rawItems));
  return { ...parsed, rawText };
}

export function normalizePromptTemplateForStorage(value: unknown): PromptTemplateModel {
  if (typeof value === 'string') {
    return parsePromptTemplate(value);
  }
  if (Array.isArray(value)) {
    return parsePromptTemplate(JSON.stringify(value));
  }
  if (value === null || value === undefined) {
    return parsePromptTemplate('');
  }
  return parsePromptTemplate(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Public API: formatingOrder
// ---------------------------------------------------------------------------

export function parseFormatingOrder(text: string): FormatingOrderModel {
  const rawText = typeof text === 'string' ? text : '';
  const trimmed = rawText.trim();

  if (!trimmed) {
    return { state: 'empty', items: [], rawText };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error);
    return { state: 'invalid', items: [], rawText, parseError };
  }

  if (!Array.isArray(parsed)) {
    const parseError = 'formatingOrder must be a JSON array.';
    return { state: 'invalid', items: [], rawText, parseError };
  }

  if ((parsed as unknown[]).some((value) => typeof value !== 'string')) {
    return { state: 'invalid', items: [], rawText, parseError: 'formatingOrder must contain only string entries.' };
  }

  const items: FormatingOrderItemModel[] = (parsed as string[]).map((token) => ({
    token,
    known: isFormatingOrderToken(token),
  }));

  if (items.length === 0) {
    return { state: 'empty', items: [], rawText };
  }

  return { state: 'valid', items, rawText };
}

export function validateFormatingOrderText(text: string): string | null {
  const model = parseFormatingOrder(text);
  return model.state === 'invalid' ? (model.parseError ?? 'Invalid formatingOrder') : null;
}

export function validateLocalStopStringsText(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      return 'localStopStrings must be a JSON array.';
    }
    return parsed.every((entry) => typeof entry === 'string')
      ? null
      : 'localStopStrings must contain only string entries.';
  } catch (error) {
    return (error as Error).message;
  }
}

export function serializeFormatingOrder(model: Pick<FormatingOrderModel, 'items'>): string {
  if (!model || !Array.isArray(model.items) || model.items.length === 0) {
    return '[]';
  }
  return JSON.stringify(
    model.items.map((i) => i.token),
    null,
    2,
  );
}

// Mapping from formatingOrder tokens to prompt item types they reference.
// Tokens not in this map are structural (always valid regardless of prompt items).
const TOKEN_TO_PROMPT_TYPES: Partial<Record<FormatingOrderToken, string[]>> = {
  jailbreak: ['jailbreak'],
  lorebook: ['lorebook'],
  description: ['description'],
  postEverything: ['postEverything'],
  personaPrompt: ['persona'],
  authorNote: ['authornote'],
};

export function collectFormatingOrderWarnings(prompt: PromptTemplateModel, order: FormatingOrderModel): string[] {
  const warnings: string[] = [];

  // Duplicate token check
  const seen = new Set<string>();
  for (const item of order.items) {
    if (seen.has(item.token)) {
      warnings.push(`Duplicate formatingOrder token: "${item.token}"`);
    }
    seen.add(item.token);
  }

  // Dangling reference check: token references a prompt type not present in the prompt
  const promptTypes: Set<string> = new Set(prompt.items.filter((i) => i.supported).map((i) => i.type));
  for (const item of order.items) {
    const requiredTypes = TOKEN_TO_PROMPT_TYPES[item.token as FormatingOrderToken];
    if (requiredTypes && !requiredTypes.some((t) => promptTypes.has(t))) {
      warnings.push(`Dangling formatingOrder token: "${item.token}" has no matching prompt item`);
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Default factories
// ---------------------------------------------------------------------------

// New in-editor items only need local uniqueness; legacy determinism is handled during parse normalization.
let defaultIdCounter = 0;

function nextDefaultId(type: string): string {
  return `prompt-${type}-new-${++defaultIdCounter}`;
}

function promptItemIdSeed(item: PromptItemModel): string {
  if (item.supported) return item.type;
  if (typeof item.type === 'string' && item.type.trim()) return item.type;
  return 'item';
}

function withPromptItemId(item: PromptItemModel, nextId: string): PromptItemModel {
  if (item.supported) {
    const rawValue = cloneRecord(item.rawValue);
    rawValue.id = nextId;
    return { ...item, id: nextId, rawValue };
  }

  if (isRecord(item.rawValue)) {
    const rawValue = cloneRecord(item.rawValue);
    rawValue.id = nextId;
    return { ...item, id: nextId, rawValue };
  }

  return { ...item, id: nextId, rawValue: cloneJson(item.rawValue) };
}

export function duplicatePromptItem(item: PromptItemModel): PromptItemModel {
  const cloned = parsePromptTemplate(serializePromptTemplate({ items: [item] })).items[0] ?? defaultPromptItem();
  return withPromptItemId(cloned, nextDefaultId(promptItemIdSeed(cloned)));
}

export function defaultPromptItemPlain(type: PromptItemPlainKind = 'plain'): PromptItemPlainModel {
  const raw: JsonRecord = { type, type2: 'normal', text: '', role: 'system' };
  return {
    id: nextDefaultId(type),
    type,
    type2: 'normal',
    text: '',
    role: 'system',
    name: undefined,
    supported: true,
    rawValue: raw,
  };
}

export function defaultPromptItemChat(): PromptItemChatModel {
  const raw: JsonRecord = { type: 'chat', rangeStart: 0, rangeEnd: 'end' };
  return {
    id: nextDefaultId('chat'),
    type: 'chat',
    rangeStart: 0,
    rangeEnd: 'end',
    chatAsOriginalOnSystem: undefined,
    name: undefined,
    supported: true,
    rawValue: raw,
  };
}

export function defaultPromptItemTyped(type: PromptItemTypedKind): PromptItemTypedModel {
  const raw: JsonRecord = { type };
  return {
    id: nextDefaultId(type),
    type,
    innerFormat: undefined,
    name: undefined,
    supported: true,
    rawValue: raw,
  };
}

export function defaultPromptItemAuthorNote(): PromptItemAuthorNoteModel {
  const raw: JsonRecord = { type: 'authornote' };
  return {
    id: nextDefaultId('authornote'),
    type: 'authornote',
    innerFormat: undefined,
    defaultText: undefined,
    name: undefined,
    supported: true,
    rawValue: raw,
  };
}

export function defaultPromptItemChatML(): PromptItemChatMLModel {
  const raw: JsonRecord = { type: 'chatML', text: '' };
  return {
    id: nextDefaultId('chatML'),
    type: 'chatML',
    text: '',
    name: undefined,
    supported: true,
    rawValue: raw,
  };
}

export function defaultPromptItemCache(): PromptItemCacheModel {
  const raw: JsonRecord = { type: 'cache', name: '', depth: 0, role: 'user' };
  return {
    id: nextDefaultId('cache'),
    type: 'cache',
    name: '',
    depth: 0,
    role: 'user',
    supported: true,
    rawValue: raw,
  };
}

export function defaultPromptItem(type: SupportedPromptItemType = 'plain'): PromptItemModel {
  switch (type) {
    case 'plain':
    case 'jailbreak':
    case 'cot':
      return defaultPromptItemPlain(type);
    case 'chatML':
      return defaultPromptItemChatML();
    case 'persona':
    case 'description':
    case 'lorebook':
    case 'postEverything':
    case 'memory':
      return defaultPromptItemTyped(type);
    case 'authornote':
      return defaultPromptItemAuthorNote();
    case 'chat':
      return defaultPromptItemChat();
    case 'cache':
      return defaultPromptItemCache();
  }
}

const DEFAULT_FORMATTING_ORDER: FormatingOrderToken[] = [
  'main',
  'description',
  'personaPrompt',
  'chats',
  'lastChat',
  'jailbreak',
  'lorebook',
  'globalNote',
  'authorNote',
];

export function defaultFormatingOrder(): FormatingOrderModel {
  const items: FormatingOrderItemModel[] = DEFAULT_FORMATTING_ORDER.map((token) => ({
    token,
    known: true,
  }));
  return {
    state: 'valid',
    items,
    rawText: JSON.stringify(DEFAULT_FORMATTING_ORDER, null, 2),
  };
}
