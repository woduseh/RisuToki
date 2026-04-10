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
