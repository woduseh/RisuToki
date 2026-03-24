export const SEARCHABLE_TEXT_FIELDS = [
  'name',
  'description',
  'firstMessage',
  'globalNote',
  'css',
  'defaultVariables',
  'lua',
  'personality',
  'scenario',
  'creatorcomment',
  'exampleMessage',
  'systemPrompt',
  'creator',
  'characterVersion',
  'nickname',
  'additionalText',
  'license',
  'cjs',
  'backgroundEmbedding',
  'moduleNamespace',
  'customModuleToggle',
  'mcpUrl',
  'moduleName',
  'moduleDescription',
  'mainPrompt',
  'jailbreak',
  'aiModel',
  'subModel',
  'apiType',
  'instructChatTemplate',
  'JinjaTemplate',
  'templateDefaultVariables',
  'moduleIntergration',
  'jsonSchema',
  'extractJson',
  'groupTemplate',
  'groupOtherBotRole',
  'autoSuggestPrompt',
  'autoSuggestPrefix',
  'systemContentReplacement',
  'systemRoleReplacement',
  'creationDate',
  'modificationDate',
  'moduleId',
] as const;

export type SearchableTextField = (typeof SEARCHABLE_TEXT_FIELDS)[number];
export type GreetingField = 'alternateGreetings' | 'groupOnlyGreetings';

export interface SearchMatch {
  match: string;
  before: string;
  after: string;
  position: number;
  line: number;
}

export interface SearchTextBlockOptions {
  query: string;
  regex?: boolean;
  flags?: string;
  contextChars?: number;
  maxMatches?: number;
}

export interface SearchTextBlockResult {
  query: string;
  regex: boolean;
  flags?: string;
  contextChars: number;
  maxMatches: number;
  totalMatches: number;
  returnedMatches: number;
  contentLength: number;
  matches: SearchMatch[];
}

export interface FieldSearchSurface {
  surfaceType: 'field';
  target: string;
  field: SearchableTextField;
  totalMatches: number;
  returnedMatches: number;
  matches: SearchMatch[];
}

export interface GreetingSearchSurface {
  surfaceType: 'greeting';
  target: string;
  field: GreetingField;
  greetingType: 'alternate' | 'groupOnly';
  index: number;
  totalMatches: number;
  returnedMatches: number;
  matches: SearchMatch[];
}

export interface LorebookSearchSurface {
  surfaceType: 'lorebook';
  target: string;
  index: number;
  comment: string;
  key: string;
  totalMatches: number;
  returnedMatches: number;
  matches: SearchMatch[];
}

export type SearchSurface = FieldSearchSurface | GreetingSearchSurface | LorebookSearchSurface;

export interface SearchAllTextSurfacesOptions {
  query: string;
  regex?: boolean;
  flags?: string;
  includeLorebook?: boolean;
  includeGreetings?: boolean;
  contextChars?: number;
  maxMatchesPerSurface?: number;
}

export interface SearchAllTextSurfacesResult {
  query: string;
  regex: boolean;
  flags?: string;
  includeLorebook: boolean;
  includeGreetings: boolean;
  contextChars: number;
  maxMatchesPerSurface: number;
  totalMatches: number;
  returnedSurfaces: number;
  surfaces: SearchSurface[];
}

interface LorebookLikeEntry {
  comment?: unknown;
  key?: unknown;
  content?: unknown;
}

function normalizeLF(value: string): string {
  return value.indexOf('\r') >= 0 ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function normalizeFlags(useRegex: boolean, flags?: string): string | undefined {
  if (!useRegex) return undefined;
  const rawFlags = typeof flags === 'string' && flags.length > 0 ? flags : 'gi';
  return rawFlags.includes('g') ? rawFlags : `${rawFlags}g`;
}

function countLiteralMatches(content: string, query: string): number {
  let totalMatches = 0;
  let searchFrom = 0;
  const queryLower = query.toLowerCase();
  const contentLower = content.toLowerCase();

  while (true) {
    const pos = contentLower.indexOf(queryLower, searchFrom);
    if (pos === -1) break;
    totalMatches++;
    searchFrom = pos + query.length;
  }

  return totalMatches;
}

export function searchTextBlock(contentInput: string, options: SearchTextBlockOptions): SearchTextBlockResult {
  const content = normalizeLF(contentInput);
  const query = normalizeLF(options.query);
  const regex = !!options.regex;
  const flags = normalizeFlags(regex, options.flags);
  const contextChars = clamp(Number(options.contextChars) || 100, 0, 500);
  const maxMatches = clamp(Number(options.maxMatches) || 20, 1, 100);
  const matches: SearchMatch[] = [];

  if (regex) {
    const re = new RegExp(query, flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const position = match.index;
      const matchText = match[0];
      const before = content.slice(Math.max(0, position - contextChars), position);
      const after = content.slice(position + matchText.length, position + matchText.length + contextChars);
      const line = content.slice(0, position).split('\n').length;
      matches.push({ match: matchText, before, after, position, line });
      if (matches.length >= maxMatches) break;
      if (matchText.length === 0) re.lastIndex++;
    }
  } else {
    let searchFrom = 0;
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    while (matches.length < maxMatches) {
      const position = contentLower.indexOf(queryLower, searchFrom);
      if (position === -1) break;
      const matchText = content.slice(position, position + query.length);
      const before = content.slice(Math.max(0, position - contextChars), position);
      const after = content.slice(position + query.length, position + query.length + contextChars);
      const line = content.slice(0, position).split('\n').length;
      matches.push({ match: matchText, before, after, position, line });
      searchFrom = position + query.length;
    }
  }

  let totalMatches = matches.length;
  if (matches.length >= maxMatches) {
    if (regex) {
      const allMatches = content.match(new RegExp(query, flags));
      totalMatches = allMatches ? allMatches.length : matches.length;
    } else {
      totalMatches = countLiteralMatches(content, query);
    }
  }

  return {
    query,
    regex,
    flags,
    contextChars,
    maxMatches,
    totalMatches,
    returnedMatches: matches.length,
    contentLength: content.length,
    matches,
  };
}

function readTextField(data: Record<string, unknown>, field: string): string {
  return normalizeLF(typeof data[field] === 'string' ? data[field] : String(data[field] ?? ''));
}

function searchFieldSurface(
  data: Record<string, unknown>,
  field: SearchableTextField,
  options: SearchAllTextSurfacesOptions,
): FieldSearchSurface | null {
  const result = searchTextBlock(readTextField(data, field), {
    query: options.query,
    regex: options.regex,
    flags: options.flags,
    contextChars: options.contextChars,
    maxMatches: options.maxMatchesPerSurface,
  });

  if (result.totalMatches === 0) return null;

  return {
    surfaceType: 'field',
    target: `field:${field}`,
    field,
    totalMatches: result.totalMatches,
    returnedMatches: result.returnedMatches,
    matches: result.matches,
  };
}

function searchGreetingSurface(
  greeting: unknown,
  field: GreetingField,
  index: number,
  options: SearchAllTextSurfacesOptions,
): GreetingSearchSurface | null {
  const greetingType = field === 'alternateGreetings' ? 'alternate' : 'groupOnly';
  const result = searchTextBlock(normalizeLF(typeof greeting === 'string' ? greeting : String(greeting ?? '')), {
    query: options.query,
    regex: options.regex,
    flags: options.flags,
    contextChars: options.contextChars,
    maxMatches: options.maxMatchesPerSurface,
  });

  if (result.totalMatches === 0) return null;

  return {
    surfaceType: 'greeting',
    target: `greeting:${greetingType}:${index}`,
    field,
    greetingType,
    index,
    totalMatches: result.totalMatches,
    returnedMatches: result.returnedMatches,
    matches: result.matches,
  };
}

function searchLorebookSurface(
  entry: LorebookLikeEntry,
  index: number,
  options: SearchAllTextSurfacesOptions,
): LorebookSearchSurface | null {
  const result = searchTextBlock(
    normalizeLF(typeof entry.content === 'string' ? entry.content : String(entry.content ?? '')),
    {
      query: options.query,
      regex: options.regex,
      flags: options.flags,
      contextChars: options.contextChars,
      maxMatches: options.maxMatchesPerSurface,
    },
  );

  if (result.totalMatches === 0) return null;

  return {
    surfaceType: 'lorebook',
    target: `lorebook:${index}`,
    index,
    comment: typeof entry.comment === 'string' ? entry.comment : '',
    key: typeof entry.key === 'string' ? entry.key : '',
    totalMatches: result.totalMatches,
    returnedMatches: result.returnedMatches,
    matches: result.matches,
  };
}

export function searchAllTextSurfaces(
  data: Record<string, unknown>,
  options: SearchAllTextSurfacesOptions,
): SearchAllTextSurfacesResult {
  const query = normalizeLF(options.query);
  const regex = !!options.regex;
  const flags = normalizeFlags(regex, options.flags);
  const includeLorebook = options.includeLorebook !== false;
  const includeGreetings = options.includeGreetings !== false;
  const contextChars = clamp(Number(options.contextChars) || 60, 0, 300);
  const maxMatchesPerSurface = clamp(Number(options.maxMatchesPerSurface) || 5, 1, 20);
  const normalizedOptions: SearchAllTextSurfacesOptions = {
    query,
    regex,
    flags,
    includeLorebook,
    includeGreetings,
    contextChars,
    maxMatchesPerSurface,
  };

  const surfaces: SearchSurface[] = [];

  for (const field of SEARCHABLE_TEXT_FIELDS) {
    const fieldSurface = searchFieldSurface(data, field, normalizedOptions);
    if (fieldSurface) surfaces.push(fieldSurface);
  }

  if (includeGreetings) {
    const alternateGreetings = Array.isArray(data.alternateGreetings) ? data.alternateGreetings : [];
    for (let index = 0; index < alternateGreetings.length; index++) {
      const greetingSurface = searchGreetingSurface(
        alternateGreetings[index],
        'alternateGreetings',
        index,
        normalizedOptions,
      );
      if (greetingSurface) surfaces.push(greetingSurface);
    }

    const groupOnlyGreetings = Array.isArray(data.groupOnlyGreetings) ? data.groupOnlyGreetings : [];
    for (let index = 0; index < groupOnlyGreetings.length; index++) {
      const greetingSurface = searchGreetingSurface(
        groupOnlyGreetings[index],
        'groupOnlyGreetings',
        index,
        normalizedOptions,
      );
      if (greetingSurface) surfaces.push(greetingSurface);
    }
  }

  if (includeLorebook) {
    const lorebook = Array.isArray(data.lorebook) ? (data.lorebook as LorebookLikeEntry[]) : [];
    for (let index = 0; index < lorebook.length; index++) {
      const lorebookSurface = searchLorebookSurface(lorebook[index], index, normalizedOptions);
      if (lorebookSurface) surfaces.push(lorebookSurface);
    }
  }

  const totalMatches = surfaces.reduce((sum, surface) => sum + surface.totalMatches, 0);

  return {
    query,
    regex,
    flags,
    includeLorebook,
    includeGreetings,
    contextChars,
    maxMatchesPerSurface,
    totalMatches,
    returnedSurfaces: surfaces.length,
    surfaces,
  };
}
