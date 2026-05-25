export const CHARX_DEPRECATED_FIELD_NAMES: string[] = [
  'personality',
  'scenario',
  'systemPrompt',
  'nickname',
  'source',
  'additionalText',
  'license',
  'groupOnlyGreetings',
];

export const RISUM_RESERVED_FIELD_NAMES: string[] = ['cjs'];

export const RISUP_LEGACY_FIELD_NAMES: string[] = [
  'mainPrompt',
  'jailbreak',
  'globalNote',
  'useInstructPrompt',
  'instructChatTemplate',
  'JinjaTemplate',
];

const CHARX_CARD_DEPRECATED_KEYS = [
  'personality',
  'scenario',
  'system_prompt',
  'nickname',
  'source',
  'group_only_greetings',
] as const;

const CHARX_RISUAI_DEPRECATED_KEYS = ['additionalText', 'license', 'virtualscript'] as const;

export function stripDeprecatedCharxSaveFields(card: Record<string, unknown>): void {
  const cardData = card.data;
  if (!cardData || typeof cardData !== 'object' || Array.isArray(cardData)) return;

  const data = cardData as Record<string, unknown>;
  for (const key of CHARX_CARD_DEPRECATED_KEYS) {
    delete data[key];
  }

  const extensions = data.extensions;
  if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) return;
  const risuai = (extensions as Record<string, unknown>).risuai;
  if (!risuai || typeof risuai !== 'object' || Array.isArray(risuai)) return;

  const risuaiExt = risuai as Record<string, unknown>;
  for (const key of CHARX_RISUAI_DEPRECATED_KEYS) {
    delete risuaiExt[key];
  }
}

export function stripDeprecatedRisupSaveFields(preset: Record<string, unknown>): void {
  for (const key of RISUP_LEGACY_FIELD_NAMES) {
    delete preset[key];
  }
}

export function stripDeprecatedRisumSaveFields(modulePayload: Record<string, unknown>): void {
  const mod = modulePayload.module;
  if (mod && typeof mod === 'object' && !Array.isArray(mod)) {
    delete (mod as Record<string, unknown>).cjs;
    return;
  }
  delete modulePayload.cjs;
}
