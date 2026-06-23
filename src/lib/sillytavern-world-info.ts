import type { LorebookEntry } from './lorebook-io';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string')
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  return [];
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 'true';
}

function worldInfoEntries(input: unknown): JsonRecord[] | null {
  if (!isRecord(input)) return null;
  const entries = input.entries;
  if (Array.isArray(entries)) return entries.filter(isRecord);
  if (isRecord(entries)) return Object.values(entries).filter(isRecord);
  return null;
}

export function isSillyTavernWorldInfo(input: unknown): boolean {
  const entries = worldInfoEntries(input);
  if (!entries || entries.length === 0) return false;
  return entries.some(
    (entry) =>
      'content' in entry || 'key' in entry || 'keysecondary' in entry || 'constant' in entry || 'selective' in entry,
  );
}

export function convertSillyTavernWorldInfoToLorebook(input: unknown): LorebookEntry[] {
  const entries = worldInfoEntries(input);
  if (!entries) return [];

  return entries
    .map((entry, index) => {
      const primaryKeys = stringArray(entry.key);
      const secondaryKeys = stringArray(entry.keysecondary ?? entry.secondary_keys);
      const displayIndex = numberValue(entry.displayIndex ?? entry.display_index);
      const order = numberValue(entry.order);
      const probability = numberValue(entry.probability);
      const disabled = booleanValue(entry.disable ?? entry.disabled);
      const comment =
        String(entry.comment || entry.name || primaryKeys[0] || `world_info_${index + 1}`).trim() ||
        `world_info_${index + 1}`;

      const converted: LorebookEntry = {
        key: primaryKeys.join(', '),
        secondkey: secondaryKeys.join(', '),
        comment,
        content: String(entry.content ?? ''),
        mode: 'normal',
        insertorder: numberValue(entry.insertion_order ?? entry.insertionOrder) ?? order ?? 100,
        order: displayIndex ?? order ?? index,
        priority: numberValue(entry.priority) ?? order ?? 0,
        alwaysActive: booleanValue(entry.constant),
        forceActivation: false,
        selective: booleanValue(entry.selective),
        constant: booleanValue(entry.constant),
        useRegex: booleanValue(entry.regex ?? entry.useRegex),
        folder: '',
        extentions: {},
      };

      const position = typeof entry.position === 'string' ? entry.position : undefined;
      if (position) converted.position = position;
      if (disabled) {
        converted.disable = true;
        converted.activationPercent = 0;
      } else if (probability !== undefined && entry.useProbability !== false) {
        converted.activationPercent = Math.max(0, Math.min(100, probability));
      }
      const depth = numberValue(entry.depth);
      if (depth !== undefined) converted.depth = depth;
      const uid = entry.uid ?? entry.id;
      if (typeof uid === 'string' && uid.trim()) converted.id = uid.trim();
      return converted;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
