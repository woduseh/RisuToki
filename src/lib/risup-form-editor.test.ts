import { describe, expect, it } from 'vitest';
import { coerceRisupInputValue, validateRisupDraftFields } from './risup-form-editor';
import { RISUP_JSON_FIELD_IDS } from './risup-fields';

describe('risup form editor helpers', () => {
  it('coerces typed inputs for risup fields', () => {
    expect(coerceRisupInputValue('number', '85')).toBe(85);
    expect(coerceRisupInputValue('number', '0.75')).toBe(0.75);
    expect(coerceRisupInputValue('checkbox', true)).toBe(true);
    expect(coerceRisupInputValue('checkbox', false)).toBe(false);
    expect(coerceRisupInputValue('text', 'openai')).toBe('openai');
    expect(coerceRisupInputValue('textarea', 'hello')).toBe('hello');
  });

  it('reports invalid risup json-backed drafts with field context', () => {
    const errors = validateRisupDraftFields({
      promptTemplate: '{',
      presetBias: '[["hello", 5]]',
      formatingOrder: '{',
      localStopStrings: 'oops',
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'promptTemplate', label: '프롬프트 템플릿' }),
        expect.objectContaining({ field: 'formatingOrder', label: '포매팅 순서' }),
        expect.objectContaining({ field: 'localStopStrings', label: '로컬 중단 문자열' }),
      ]),
    );
  });

  it('treats mixed-type formatingOrder arrays as invalid instead of silently filtering them', () => {
    const errors = validateRisupDraftFields({
      formatingOrder: '["main", 42, "chats"]',
    });

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'formatingOrder', label: '포매팅 순서' })]),
    );
  });

  it('excludes promptTemplate and formatingOrder from the JSON-validated field IDs', () => {
    expect(RISUP_JSON_FIELD_IDS).not.toContain('promptTemplate');
    expect(RISUP_JSON_FIELD_IDS).not.toContain('formatingOrder');
  });
});
