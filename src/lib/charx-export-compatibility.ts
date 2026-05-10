import * as crypto from 'crypto';

import AdmZip from 'adm-zip';

import { parseRisum } from '../rpack';
import { risuArrayToCCV3 } from '../lorebook-convert';

export type CharxExportCompatibilityCategory = 'upload-risk' | 'auto-fixable' | 'manual-review';

export type CharxExportCompatibilitySeverity = 'error' | 'warning' | 'info';

export interface CharxExportCompatibilityIssue {
  code: string;
  category: CharxExportCompatibilityCategory;
  severity: CharxExportCompatibilitySeverity;
  path: string;
  message: string;
  suggestion: string;
  details?: Record<string, unknown>;
}

export interface CharxExportCompatibilityResult {
  ok: boolean;
  issueCount: number;
  counts: Record<CharxExportCompatibilityCategory, number>;
  issues: CharxExportCompatibilityIssue[];
  summary: string;
  metadata: {
    lorebook: { cardCount: number; moduleCount: number };
    regex: { cardCount: number; moduleCount: number; ableFlagFalseCount: number };
    assets: { zipCount: number; cardReferenceCount: number };
    ableFlagSemantics: string;
  };
}

const EMBEDDED_ASSET_URI_PREFIX = 'embeded://';

const EMPTY_COMPAT_CARD_FIELDS = [
  'personality',
  'scenario',
  'system_prompt',
  'nickname',
  'source',
  'group_only_greetings',
] as const;

const EMPTY_COMPAT_RISUAI_FIELDS = ['additionalText', 'license'] as const;

const REGEX_TYPE_MAP: Record<string, string> = {
  editrequest: 'editprocess',
  edittranslation: 'edittrans',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function contentHash(value: unknown): string {
  return crypto.createHash('sha256').update(stringValue(value)).digest('hex');
}

function normalizeRegexType(value: unknown): string {
  if (typeof value !== 'string') return '';
  const lower = value.toLowerCase();
  return REGEX_TYPE_MAP[lower] ?? lower;
}

function regexIn(entry: Record<string, unknown>): unknown {
  return entry.in !== undefined ? entry.in : entry.find;
}

function regexOut(entry: Record<string, unknown>): unknown {
  return entry.out !== undefined ? entry.out : entry.replace;
}

function isEmptyCompatibilityValue(value: unknown): boolean {
  return value === '' || (Array.isArray(value) && value.length === 0);
}

function issue(
  code: string,
  category: CharxExportCompatibilityCategory,
  severity: CharxExportCompatibilitySeverity,
  path: string,
  message: string,
  suggestion: string,
  details?: Record<string, unknown>,
): CharxExportCompatibilityIssue {
  return { code, category, severity, path, message, suggestion, ...(details ? { details } : {}) };
}

function resolveCardAssetPath(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri) return null;
  if (uri.startsWith(EMBEDDED_ASSET_URI_PREFIX)) return uri.slice(EMBEDDED_ASSET_URI_PREFIX.length);
  if (uri.startsWith('ccdefault:')) return uri.slice('ccdefault:'.length);
  if (uri.startsWith('assets/')) return uri;
  return null;
}

function compareLorebook(
  issues: CharxExportCompatibilityIssue[],
  cardEntries: unknown[],
  moduleEntries: unknown[],
): void {
  if (cardEntries.length !== moduleEntries.length) {
    issues.push(
      issue(
        'lorebook-count-mismatch',
        'manual-review',
        'warning',
        'card.json.data.character_book.entries',
        `card.json has ${cardEntries.length} lorebook entries but module.risum has ${moduleEntries.length}.`,
        'Regenerate the .charx from the active RisuToki data so both card.json and module.risum carry the same lorebook.',
        { cardCount: cardEntries.length, moduleCount: moduleEntries.length },
      ),
    );
  }

  const expectedCardEntries = risuArrayToCCV3(moduleEntries as Parameters<typeof risuArrayToCCV3>[0]);
  const max = Math.max(cardEntries.length, expectedCardEntries.length);
  for (let index = 0; index < max; index++) {
    const card = asRecord(cardEntries[index]);
    const expected = asRecord(expectedCardEntries[index]);
    if (!card || !expected) continue;
    const cardComment = stringValue(card.comment) || stringValue(card.name);
    const expectedComment = stringValue(expected.comment) || stringValue(expected.name);
    if (cardComment !== expectedComment) {
      issues.push(
        issue(
          'lorebook-comment-mismatch',
          'manual-review',
          'warning',
          `card.json.data.character_book.entries[${index}].comment`,
          `Lorebook comment differs at index ${index}.`,
          'Review whether card.json was edited without updating module.risum; RisuToki/RisuAI may use the embedded module copy.',
          { cardComment, moduleComment: expectedComment },
        ),
      );
    }
    const cardContentHash = contentHash(card.content);
    const expectedContentHash = contentHash(expected.content);
    if (cardContentHash !== expectedContentHash) {
      issues.push(
        issue(
          'lorebook-content-mismatch',
          'manual-review',
          'warning',
          `card.json.data.character_book.entries[${index}].content`,
          `Lorebook content hash differs at index ${index}.`,
          'Regenerate the .charx from the active RisuToki data or manually reconcile the card/module lorebook entries.',
          { cardHash: cardContentHash, moduleHash: expectedContentHash },
        ),
      );
    }
  }
}

function compareRegex(issues: CharxExportCompatibilityIssue[], cardScripts: unknown[], moduleRegex: unknown[]): number {
  if (cardScripts.length !== moduleRegex.length) {
    issues.push(
      issue(
        'regex-count-mismatch',
        'manual-review',
        'warning',
        'card.json.data.extensions.risuai.customScripts',
        `card.json has ${cardScripts.length} regex scripts but module.risum has ${moduleRegex.length}.`,
        'Regenerate the .charx from the active RisuToki data so customScripts and module regex stay synchronized.',
        { cardCount: cardScripts.length, moduleCount: moduleRegex.length },
      ),
    );
  }

  let ableFlagFalseCount = 0;
  const max = Math.max(cardScripts.length, moduleRegex.length);
  for (let index = 0; index < max; index++) {
    const card = asRecord(cardScripts[index]);
    const module = asRecord(moduleRegex[index]);
    for (const [surfaceName, entry] of [
      ['card.json.data.extensions.risuai.customScripts', card],
      ['module.risum.module.regex', module],
    ] as const) {
      if (!entry) continue;
      if (entry.ableFlag === false && normalizeRegexType(entry.type) !== 'disabled') ableFlagFalseCount++;
      if (entry.in === undefined && entry.find !== undefined) {
        issues.push(
          issue(
            'regex-missing-canonical-in',
            'upload-risk',
            'error',
            `${surfaceName}[${index}].in`,
            `Regex entry "${stringValue(entry.comment) || index}" has find but no canonical in field.`,
            'Write both RisuAI canonical in/out fields and RisuToki convenience find/replace aliases before upload.',
          ),
        );
      }
      if (entry.out === undefined && entry.replace !== undefined) {
        issues.push(
          issue(
            'regex-missing-canonical-out',
            'upload-risk',
            'error',
            `${surfaceName}[${index}].out`,
            `Regex entry "${stringValue(entry.comment) || index}" has replace but no canonical out field.`,
            'Write both RisuAI canonical in/out fields and RisuToki convenience find/replace aliases before upload.',
          ),
        );
      }
    }
    if (!card || !module) continue;
    const comparisons: Array<[string, unknown, unknown]> = [
      ['comment', card.comment, module.comment],
      ['type', normalizeRegexType(card.type), normalizeRegexType(module.type)],
      ['in', regexIn(card), regexIn(module)],
      ['out', regexOut(card), regexOut(module)],
    ];
    for (const [field, cardValue, moduleValue] of comparisons) {
      if (hashValue(cardValue) === hashValue(moduleValue)) continue;
      issues.push(
        issue(
          `regex-${field}-mismatch`,
          'manual-review',
          'warning',
          `card.json.data.extensions.risuai.customScripts[${index}].${field}`,
          `Regex ${field} differs between card.json and module.risum at index ${index}.`,
          'Review whether one copy is stale; RisuAI upload/runtime compatibility expects canonical regex data to match.',
          { cardHash: hashValue(cardValue), moduleHash: hashValue(moduleValue) },
        ),
      );
    }
  }
  return ableFlagFalseCount;
}

function validateEmptyCompatibilityFields(
  issues: CharxExportCompatibilityIssue[],
  data: Record<string, unknown>,
): void {
  for (const key of EMPTY_COMPAT_CARD_FIELDS) {
    if (!Object.hasOwn(data, key) || !isEmptyCompatibilityValue(data[key])) continue;
    issues.push(
      issue(
        'empty-compatibility-field',
        'auto-fixable',
        'warning',
        `card.json.data.${key}`,
        `Empty compatibility-only field "${key}" is present in card.json.`,
        'Omit empty compatibility-only fields during .charx export/save.',
      ),
    );
  }
  const risuExt = asRecord(asRecord(data.extensions)?.risuai);
  if (!risuExt) return;
  for (const key of EMPTY_COMPAT_RISUAI_FIELDS) {
    if (!Object.hasOwn(risuExt, key) || !isEmptyCompatibilityValue(risuExt[key])) continue;
    issues.push(
      issue(
        'empty-compatibility-field',
        'auto-fixable',
        'warning',
        `card.json.data.extensions.risuai.${key}`,
        `Empty compatibility-only RisuAI extension field "${key}" is present in card.json.`,
        'Omit empty compatibility-only RisuAI extension fields during .charx export/save.',
      ),
    );
  }
}

function validateAssets(
  issues: CharxExportCompatibilityIssue[],
  zip: AdmZip,
  cardAssets: unknown[],
): { zipCount: number; cardReferenceCount: number } {
  const assetEntries = zip.getEntries().filter((entry) => entry.entryName.startsWith('assets/') && !entry.isDirectory);
  const assetPaths = new Set(assetEntries.map((entry) => entry.entryName));
  for (const entry of assetEntries) {
    const size = entry.getData().length;
    if (size !== 0) continue;
    issues.push(
      issue(
        'zero-byte-asset',
        'upload-risk',
        'error',
        entry.entryName,
        `ZIP asset "${entry.entryName}" is 0 bytes.`,
        'Re-add or remove the empty asset before uploading to RisuAI.',
      ),
    );
  }

  let cardReferenceCount = 0;
  cardAssets.forEach((asset, index) => {
    const record = asRecord(asset);
    if (!record) return;
    const localPath = resolveCardAssetPath(record.uri);
    if (!localPath) return;
    cardReferenceCount++;
    if (assetPaths.has(localPath)) return;
    issues.push(
      issue(
        'missing-card-asset-target',
        'upload-risk',
        'error',
        `card.json.data.assets[${index}].uri`,
        `card.json asset reference points to missing ZIP asset "${localPath}".`,
        'Reconcile card.json asset references with the actual assets/* entries before upload.',
        { uri: record.uri, localPath },
      ),
    );
  });

  return { zipCount: assetEntries.length, cardReferenceCount };
}

export function validateCharxExportCompatibilityZip(zip: AdmZip): CharxExportCompatibilityResult {
  const issues: CharxExportCompatibilityIssue[] = [];
  const cardEntry = zip.getEntry('card.json');
  if (!cardEntry) {
    issues.push(
      issue(
        'missing-card-json',
        'upload-risk',
        'error',
        'card.json',
        'card.json is missing.',
        'Export a valid .charx ZIP.',
      ),
    );
    return buildResult(
      issues,
      { cardCount: 0, moduleCount: 0 },
      { cardCount: 0, moduleCount: 0, ableFlagFalseCount: 0 },
      {
        zipCount: 0,
        cardReferenceCount: 0,
      },
    );
  }

  const card = JSON.parse(cardEntry.getData().toString('utf-8')) as Record<string, unknown>;
  const data = asRecord(card.data) ?? {};
  const risuExt = asRecord(asRecord(data.extensions)?.risuai) ?? {};
  const cardLorebookEntries = asArray(asRecord(data.character_book)?.entries);
  const cardScripts = asArray(risuExt.customScripts);
  const cardAssets = asArray(data.assets);

  const risumEntry = zip.getEntry('module.risum');
  let moduleLorebook: unknown[] = [];
  let moduleRegex: unknown[] = [];
  if (!risumEntry) {
    issues.push(
      issue(
        'missing-module-risum',
        'upload-risk',
        'error',
        'module.risum',
        'module.risum is missing from the .charx archive.',
        'Export a .charx that includes the embedded RisuAI module data.',
      ),
    );
  } else {
    const parsed = parseRisum(risumEntry.getData());
    const moduleRoot = asRecord(parsed.module);
    const moduleData = asRecord(moduleRoot?.module) ?? moduleRoot ?? {};
    moduleLorebook = asArray(moduleData.lorebook);
    moduleRegex = asArray(moduleData.regex);
  }

  compareLorebook(issues, cardLorebookEntries, moduleLorebook);
  const ableFlagFalseCount = compareRegex(issues, cardScripts, moduleRegex);
  validateEmptyCompatibilityFields(issues, data);
  const assetMetadata = validateAssets(issues, zip, cardAssets);

  return buildResult(
    issues,
    { cardCount: cardLorebookEntries.length, moduleCount: moduleLorebook.length },
    { cardCount: cardScripts.length, moduleCount: moduleRegex.length, ableFlagFalseCount },
    assetMetadata,
  );
}

export function validateCharxExportCompatibilityFile(filePath: string): CharxExportCompatibilityResult {
  return validateCharxExportCompatibilityZip(new AdmZip(filePath));
}

function buildResult(
  issues: CharxExportCompatibilityIssue[],
  lorebook: { cardCount: number; moduleCount: number },
  regex: { cardCount: number; moduleCount: number; ableFlagFalseCount: number },
  assets: { zipCount: number; cardReferenceCount: number },
): CharxExportCompatibilityResult {
  const counts: Record<CharxExportCompatibilityCategory, number> = {
    'upload-risk': 0,
    'auto-fixable': 0,
    'manual-review': 0,
  };
  for (const item of issues) counts[item.category]++;
  const blockingCount = issues.filter((item) => item.severity === 'error').length;
  return {
    ok: blockingCount === 0 && issues.length === 0,
    issueCount: issues.length,
    counts,
    issues,
    summary:
      issues.length === 0
        ? 'RisuAI export compatibility validation passed'
        : `RisuAI export compatibility found ${issues.length} issue(s): ${counts['upload-risk']} upload-risk, ${counts['auto-fixable']} auto-fixable, ${counts['manual-review']} manual-review`,
    metadata: {
      lorebook,
      regex,
      assets,
      ableFlagSemantics:
        'ableFlag=false means default flags/order are used; it does not disable the regex script. Use type="disabled" to disable a script.',
    },
  };
}

export function formatCharxExportCompatibilityFailure(result: CharxExportCompatibilityResult): string {
  const firstIssues = result.issues
    .slice(0, 6)
    .map((item) => `${item.code} at ${item.path}: ${item.message}`)
    .join('; ');
  return `${result.summary}${firstIssues ? ` (${firstIssues})` : ''}`;
}
