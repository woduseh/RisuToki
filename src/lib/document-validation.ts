import { z } from 'zod';

const recordSchema = z.object({}).catchall(z.unknown());

const charxCardDataSchema = recordSchema.extend({
  extensions: recordSchema
    .extend({
      risuai: recordSchema.optional(),
    })
    .optional(),
  character_book: recordSchema
    .extend({
      entries: z.array(z.unknown()).optional(),
    })
    .optional(),
  assets: z.array(z.unknown()).optional(),
});

export interface CharxCardDocument extends Record<string, unknown> {
  spec: 'chara_card_v3';
  spec_version?: string;
  data: Record<string, unknown>;
}

export interface RisupEnvelope extends Record<string, unknown> {
  type: 'preset';
  presetVersion?: number;
  preset?: Uint8Array;
  pres?: Uint8Array;
}

export function validateCharxCardDocument(card: unknown): CharxCardDocument {
  const cardResult = recordSchema.safeParse(card);
  if (!cardResult.success) {
    throw new Error('Invalid .charx file: card.json must be an object');
  }

  const cardRecord = cardResult.data;
  if (cardRecord.spec !== 'chara_card_v3') {
    throw new Error(`Unsupported charx spec: ${String(cardRecord.spec ?? 'unknown')}`);
  }

  const dataResult = charxCardDataSchema.safeParse(cardRecord.data);
  if (!dataResult.success) {
    const firstIssue = dataResult.error.issues[0];
    const issuePath = firstIssue?.path.join('.') ?? '';
    if (!issuePath) {
      throw new Error('Invalid .charx file: missing required card.data object');
    }
    if (issuePath === 'character_book.entries') {
      throw new Error('Invalid .charx file: character_book.entries must be an array');
    }
    if (issuePath === 'extensions' || issuePath === 'extensions.risuai') {
      throw new Error('Invalid .charx file: extensions.risuai must be an object');
    }
    if (issuePath === 'assets') {
      throw new Error('Invalid .charx file: data.assets must be an array');
    }
    throw new Error(`Invalid .charx file: invalid card.data field "${issuePath}"`);
  }

  return {
    ...cardRecord,
    spec: 'chara_card_v3',
    data: dataResult.data,
  };
}

export function validateRisupEnvelope(envelope: unknown): RisupEnvelope {
  const envelopeResult = recordSchema.safeParse(envelope);
  if (!envelopeResult.success || envelopeResult.data.type !== 'preset') {
    throw new Error('Invalid .risup file: missing type=preset marker');
  }

  const envelopeRecord = envelopeResult.data;
  const encryptedPreset = envelopeRecord.preset ?? envelopeRecord.pres;
  if (!(encryptedPreset instanceof Uint8Array)) {
    throw new Error('Invalid .risup file: no encrypted preset data');
  }

  if (envelopeRecord.presetVersion != null && typeof envelopeRecord.presetVersion !== 'number') {
    throw new Error('Invalid .risup file: presetVersion must be a number');
  }

  return envelopeRecord as RisupEnvelope;
}

export function validateRisumModulePayload(payload: unknown): Record<string, unknown> {
  const payloadResult = recordSchema.safeParse(payload);
  if (!payloadResult.success) {
    throw new Error('Invalid .risum file: main payload must decode to an object');
  }

  return payloadResult.data;
}

export function validateRisupPresetPayload(preset: unknown): Record<string, unknown> {
  const presetResult = recordSchema.safeParse(preset);
  if (!presetResult.success) {
    throw new Error('Invalid .risup file: preset payload must be an object');
  }

  return presetResult.data;
}
