import { describe, expect, it } from 'vitest';

import {
  validateCharxCardDocument,
  validateRisumModulePayload,
  validateRisupEnvelope,
  validateRisupPresetPayload,
} from './document-validation';
import { parseStoredJson, storedAvatarStateSchema, storedLayoutStateSchema } from './stored-state-validation';

describe('document validation', () => {
  it('parses valid stored settings payloads and rejects malformed ones', () => {
    expect(parseStoredJson('{"src":"avatar.png"}', storedAvatarStateSchema)).toEqual({ src: 'avatar.png' });
    expect(parseStoredJson('{"foo":"bar"}', storedAvatarStateSchema)).toBeNull();
    expect(parseStoredJson('{"slotSizes":{"left":120}}', storedLayoutStateSchema)).toEqual({
      slotSizes: { left: 120 },
    });
    expect(parseStoredJson('{"slotSizes":{"left":-1}}', storedLayoutStateSchema)).toBeNull();
  });

  it('rejects charx cards without the v3 spec and required card.data object', () => {
    expect(() =>
      validateCharxCardDocument({
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {},
      }),
    ).toThrow(/unsupported charx spec/i);

    expect(() =>
      validateCharxCardDocument({
        spec: 'chara_card_v3',
        spec_version: '3.0',
      }),
    ).toThrow(/missing required card\.data object/i);
  });

  it('rejects charx cards whose character_book entries are not an array', () => {
    expect(() =>
      validateCharxCardDocument({
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
          character_book: {
            entries: 'bad',
          },
        },
      }),
    ).toThrow(/character_book\.entries must be an array/i);
  });

  it('rejects risup envelopes without the preset marker or encrypted payload', () => {
    expect(() => validateRisupEnvelope({ type: 'other', preset: new Uint8Array([1]) })).toThrow(
      /missing type=preset marker/i,
    );
    expect(() => validateRisupEnvelope({ type: 'preset' })).toThrow(/no encrypted preset data/i);
  });

  it('rejects risum payloads that do not decode to an object', () => {
    expect(() => validateRisumModulePayload(['bad'])).toThrow(/main payload must decode to an object/i);
    expect(validateRisumModulePayload({ module: { name: 'valid' } })).toEqual({ module: { name: 'valid' } });
  });

  it('rejects non-object risup preset payloads', () => {
    expect(() => validateRisupPresetPayload(['not', 'an', 'object'])).toThrow(/preset payload must be an object/i);
    expect(validateRisupPresetPayload({ name: 'Preset', mainPrompt: 'Hello' })).toEqual({
      name: 'Preset',
      mainPrompt: 'Hello',
    });
  });
});
