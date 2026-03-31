/**
 * Pure lorebook decorator parser.
 *
 * Extracts leading `@@decorator` lines from lorebook entry content
 * and returns structured metadata, the stripped body, and any warnings.
 */

export interface PreviewLoreDecorators {
  depth?: number;
  position?: string;
  role?: 'user' | 'assistant' | 'system';
  scanDepth?: number;
  probability?: number;
  activate?: boolean;
  dontActivate?: boolean;
  matchFullWord?: boolean;
  additionalKeys?: string[];
  excludeKeys?: string[];
}

export interface ParseResult {
  decorators: PreviewLoreDecorators;
  body: string;
  warnings: string[];
}

const VALID_ROLES = new Set<string>(['user', 'assistant', 'system']);

const SHORTHAND_DEFAULTS: Record<string, Partial<PreviewLoreDecorators>> = {
  system: { role: 'system', depth: 4 },
  user: { role: 'user', depth: 4 },
  assistant: { role: 'assistant', depth: 4 },
  end: { position: 'end' },
};

// Decorators that take a numeric argument
const NUMERIC_DECORATORS = new Set(['depth', 'scan_depth', 'probability']);

// Decorators that take a comma-separated list argument
const LIST_DECORATORS = new Set(['additional_keys', 'exclude_keys']);

// Decorators that are boolean flags (no argument)
const FLAG_DECORATORS = new Set(['activate', 'dont_activate', 'match_full_word']);

// Decorators that take a string argument
const STRING_DECORATORS = new Set(['position', 'role']);

const SUPPORTED_DECORATORS = new Set([
  ...NUMERIC_DECORATORS,
  ...LIST_DECORATORS,
  ...FLAG_DECORATORS,
  ...STRING_DECORATORS,
]);

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parse leading lorebook decorators from entry content.
 *
 * - Reads only the leading decorator block (stops at first non-decorator line or blank line).
 * - Recognises `@@decorator` and `@@@shorthand` forms.
 * - Returns structured metadata, the stripped body, and warnings.
 * - Never mutates the input string.
 */
export function parseLorebookDecorators(content: string): ParseResult {
  const decorators: PreviewLoreDecorators = {};
  const warnings: string[] = [];

  // Normalise line endings to \n for parsing
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let bodyStartIndex = 0;

  // Track whether shorthand set a default depth (can be overridden by explicit @@depth)
  let shorthandDepth: number | undefined;
  let hasExplicitDepth = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Blank line ends the decorator block
    if (line.trim() === '') break;

    // Try @@@shorthand first (3 @'s)
    const shorthandMatch = /^@@@(\w+)\s*$/.exec(line);
    if (shorthandMatch) {
      const name = shorthandMatch[1].toLowerCase();
      const defaults = SHORTHAND_DEFAULTS[name];
      if (defaults) {
        if (defaults.role !== undefined) {
          decorators.role = defaults.role;
        }
        if (defaults.position !== undefined) {
          decorators.position = defaults.position;
        }
        if (defaults.depth !== undefined) {
          shorthandDepth = defaults.depth;
        }
      }
      bodyStartIndex = i + 1;
      continue;
    }

    // Try @@decorator (2 @'s)
    const decoratorMatch = /^@@(\w+)(.*)$/.exec(line);
    if (!decoratorMatch) break; // not a decorator line → end of block

    const rawName = decoratorMatch[1].toLowerCase();
    const rawValue = decoratorMatch[2].trim();
    const normalizedValue = rawValue.toLowerCase();

    bodyStartIndex = i + 1;

    // Skip unsupported decorators silently
    if (!SUPPORTED_DECORATORS.has(rawName)) continue;

    // Process supported decorators
    if (NUMERIC_DECORATORS.has(rawName)) {
      if (rawValue === '') {
        warnings.push(`@@${rawName}: missing numeric value`);
        continue;
      }
      const parsed = parseInt(rawValue, 10);
      if (isNaN(parsed)) {
        warnings.push(`@@${rawName}: invalid numeric value "${rawValue}"`);
        continue;
      }
      applyNumericDecorator(rawName, parsed, decorators, warnings);
      if (rawName === 'depth') hasExplicitDepth = true;
    } else if (LIST_DECORATORS.has(rawName)) {
      const keys = parseCommaSeparated(rawValue);
      const camelName = snakeToCamel(rawName) as keyof PreviewLoreDecorators;
      (decorators as Record<string, unknown>)[camelName] = keys;
    } else if (FLAG_DECORATORS.has(rawName)) {
      const camelName = snakeToCamel(rawName) as keyof PreviewLoreDecorators;
      (decorators as Record<string, unknown>)[camelName] = true;
    } else if (rawName === 'position') {
      decorators.position = rawValue;
    } else if (rawName === 'role') {
      if (VALID_ROLES.has(normalizedValue)) {
        decorators.role = normalizedValue as 'user' | 'assistant' | 'system';
      } else {
        warnings.push(`@@role: invalid value "${rawValue}" (expected user, assistant, or system)`);
      }
    }
  }

  // Apply shorthand depth if no explicit @@depth was given
  if (shorthandDepth !== undefined && !hasExplicitDepth) {
    decorators.depth = shorthandDepth;
  }

  // Build body from remaining lines
  const body = lines.slice(bodyStartIndex).join('\n');

  return { decorators, body, warnings };
}

function applyNumericDecorator(
  name: string,
  value: number,
  decorators: PreviewLoreDecorators,
  warnings: string[],
): void {
  if (name === 'probability') {
    let clamped = value;
    if (value < 0) {
      clamped = 0;
      warnings.push(`@@probability: value ${value} clamped to 0`);
    } else if (value > 100) {
      clamped = 100;
      warnings.push(`@@probability: value ${value} clamped to 100`);
    }
    decorators.probability = clamped;
  } else if (name === 'scan_depth') {
    let clamped = value;
    if (value < 0) {
      clamped = 0;
      warnings.push(`@@scan_depth: value ${value} clamped to 0`);
    }
    decorators.scanDepth = clamped;
  } else {
    const camelName = snakeToCamel(name) as keyof PreviewLoreDecorators;
    (decorators as Record<string, unknown>)[camelName] = value;
  }
}
