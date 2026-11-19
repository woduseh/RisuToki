import { isDeepStrictEqual } from 'node:util';

// Limits and shapes mirror Uimori v0.13.3 core/translation-guide.ts and core/illustration-profiles.ts;
// Uimori rejects a card or module whose extensions.uimori values break them.
export const UIMORI_TRANSLATION_GUIDE_LIMITS = { instructions: 20_000, terms: 500, term: 300, note: 2_000 } as const;
export const UIMORI_ILLUSTRATION_PROFILE_LIMITS = { profiles: 32, id: 100, name: 200, appearance: 2_000 } as const;

const REFERENCE_IMAGE_ID = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/u;

export interface UimoriExtensionHost {
  pointer: string;
  value: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function boundedText(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function validateUimoriTranslationGuide(value: unknown): string | null {
  const guide = record(value);
  if (!guide || !hasOnlyKeys(guide, ['instructions', 'terms'])) {
    return 'translationGuide must be an object with only instructions and terms';
  }
  const limits = UIMORI_TRANSLATION_GUIDE_LIMITS;
  if (typeof guide.instructions !== 'string' || guide.instructions.length > limits.instructions) {
    return `translationGuide.instructions must be a string of at most ${limits.instructions} characters`;
  }
  if (!Array.isArray(guide.terms) || guide.terms.length > limits.terms) {
    return `translationGuide.terms must be an array of at most ${limits.terms} entries`;
  }
  for (const [index, rawTerm] of guide.terms.entries()) {
    const term = record(rawTerm);
    if (
      !term ||
      !hasOnlyKeys(term, ['source', 'target', 'note']) ||
      !boundedText(term.source, limits.term) ||
      !boundedText(term.target, limits.term)
    ) {
      return `translationGuide.terms[${index}] needs non-blank source and target of at most ${limits.term} characters and no other keys than note`;
    }
    if (term.note !== undefined && (typeof term.note !== 'string' || term.note.length > limits.note)) {
      return `translationGuide.terms[${index}].note must be a string of at most ${limits.note} characters`;
    }
  }
  return null;
}

export function validateUimoriIllustrationProfiles(value: unknown): string | null {
  const limits = UIMORI_ILLUSTRATION_PROFILE_LIMITS;
  if (!Array.isArray(value) || value.length > limits.profiles) {
    return `illustrationProfiles must be an array of at most ${limits.profiles} profiles`;
  }
  const ids = new Set<string>();
  for (const [index, rawProfile] of value.entries()) {
    const profile = record(rawProfile);
    if (
      !profile ||
      !hasOnlyKeys(profile, ['id', 'name', 'appearance', 'referenceImageId']) ||
      !boundedText(profile.id, limits.id) ||
      !boundedText(profile.name, limits.name) ||
      !boundedText(profile.appearance, limits.appearance)
    ) {
      return `illustrationProfiles[${index}] needs non-blank id (≤${limits.id}), name (≤${limits.name}), and appearance (≤${limits.appearance}) and no other keys than referenceImageId`;
    }
    if (ids.has(profile.id as string)) return `illustrationProfiles[${index}].id duplicates "${String(profile.id)}"`;
    ids.add(profile.id as string);
    if (
      profile.referenceImageId !== undefined &&
      (typeof profile.referenceImageId !== 'string' || !REFERENCE_IMAGE_ID.test(profile.referenceImageId))
    ) {
      return `illustrationProfiles[${index}].referenceImageId must be a Uimori image id`;
    }
  }
  return null;
}

/** Validates the keys Uimori reads; other keys under extensions.uimori are left for newer Uimori versions. */
export function validateUimoriExtension(value: unknown): string | null {
  if (value === undefined) return null;
  const extension = record(value);
  if (!extension) return 'extensions.uimori must be an object';
  if (extension.translationGuide !== undefined) {
    const error = validateUimoriTranslationGuide(extension.translationGuide);
    if (error) return error;
  }
  if (extension.illustrationProfiles !== undefined) {
    const error = validateUimoriIllustrationProfiles(extension.illustrationProfiles);
    if (error) return error;
  }
  return null;
}

/** Card extensions live in `_card.data`; a module's live in the module object of `_moduleData`. */
export function listUimoriExtensionHosts(data: Record<string, unknown>): UimoriExtensionHost[] {
  const hosts: UimoriExtensionHost[] = [];
  const cardExtensions = record(record(record(data._card)?.data)?.extensions);
  hosts.push({ pointer: '/_card/data/extensions/uimori', value: cardExtensions?.uimori });
  const moduleData = record(data._moduleData);
  if (moduleData) {
    const nested = record(moduleData.module);
    const extensions = record((nested ?? moduleData).extensions);
    hosts.push({
      pointer: nested ? '/_moduleData/module/extensions/uimori' : '/_moduleData/extensions/uimori',
      value: extensions?.uimori,
    });
  }
  return hosts;
}

export const UIMORI_EXTENSION_TOP_LEVEL_FIELDS: readonly string[] = ['_card', '_moduleData'];

/** Rejects a mutation only where it changed an extensions.uimori value into one Uimori would refuse. */
export function validateChangedUimoriExtensions(before: Record<string, unknown>, after: Record<string, unknown>): void {
  const previous = new Map(listUimoriExtensionHosts(before).map((host) => [host.pointer, host.value]));
  for (const host of listUimoriExtensionHosts(after)) {
    if (isDeepStrictEqual(previous.get(host.pointer), host.value)) continue;
    const error = validateUimoriExtension(host.value);
    if (error) throw new Error(`Invalid ${host.pointer}: ${error}`);
  }
}
