import { describe, expect, it } from 'vitest';
import { coerceRisupInputValue, getRisupValidationMessage, validateRisupDraftFields } from './risup-form-editor';
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
        expect.objectContaining({ field: 'promptTemplate', label: '프롬프트 템플릿', severity: 'error' }),
        expect.objectContaining({ field: 'formatingOrder', label: '포매팅 순서', severity: 'error' }),
        expect.objectContaining({ field: 'localStopStrings', label: '로컬 중단 문자열', severity: 'error' }),
      ]),
    );
  });

  it('treats mixed-type formatingOrder arrays as invalid instead of silently filtering them', () => {
    const errors = validateRisupDraftFields({
      formatingOrder: '["main", 42, "chats"]',
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'formatingOrder', label: '포매팅 순서', severity: 'error' }),
      ]),
    );
  });

  it('excludes promptTemplate and formatingOrder from the JSON-validated field IDs', () => {
    expect(RISUP_JSON_FIELD_IDS).not.toContain('promptTemplate');
    expect(RISUP_JSON_FIELD_IDS).not.toContain('formatingOrder');
  });

  it('reports warning-level formatting-order diagnostics without blocking valid promptTemplate JSON', () => {
    const errors = validateRisupDraftFields({
      promptTemplate: JSON.stringify([
        { id: 'prompt-plain-1', type: 'plain', type2: 'normal', text: 'hello', role: 'system' },
      ]),
      formatingOrder: JSON.stringify(['main', 'main', 'lorebook']),
    });

    expect(errors).toContainEqual(
      expect.objectContaining({
        field: 'formatingOrder',
        message: expect.stringContaining('중복'),
      }),
    );
  });

  it('assigns severity "warning" to duplicate formatingOrder entries', () => {
    const errors = validateRisupDraftFields({
      promptTemplate: JSON.stringify([{ id: 'p1', type: 'plain', type2: 'normal', text: 'hi', role: 'system' }]),
      formatingOrder: JSON.stringify(['main', 'main']),
    });

    const warnings = errors.filter((e) => e.severity === 'warning');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].field).toBe('formatingOrder');
  });

  it('malformed formatingOrder JSON still produces blocking errors', () => {
    const errors = validateRisupDraftFields({
      formatingOrder: '{not json',
    });

    const blocking = errors.filter((e) => e.severity === 'error');
    expect(blocking.length).toBeGreaterThanOrEqual(1);
    expect(blocking[0].field).toBe('formatingOrder');
  });

  it('warning-only formatting-order mismatches do not block getRisupValidationMessage', () => {
    const msg = getRisupValidationMessage({
      promptTemplate: JSON.stringify([{ id: 'p1', type: 'plain', type2: 'normal', text: 'hi', role: 'system' }]),
      formatingOrder: JSON.stringify(['main', 'main', 'lorebook']),
    });

    // Only warnings exist — save should not be blocked
    expect(msg).toBeNull();
  });

  it('getRisupValidationMessage still blocks when there are real errors', () => {
    const msg = getRisupValidationMessage({
      promptTemplate: '{broken',
      formatingOrder: JSON.stringify(['main']),
    });

    expect(msg).not.toBeNull();
    expect(msg).toContain('저장할 수 없습니다');
  });

  it('existing error entries include severity "error"', () => {
    const errors = validateRisupDraftFields({
      promptTemplate: '{',
    });

    expect(errors.length).toBeGreaterThanOrEqual(1);
    for (const e of errors) {
      expect(e.severity).toBe('error');
    }
  });
});
