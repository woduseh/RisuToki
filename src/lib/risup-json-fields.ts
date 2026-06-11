import {
  validateFormatingOrderText,
  validateLocalStopStringsText,
  validatePresetBiasText,
  validatePromptTemplateText,
} from './risup-prompt-model';

export const RISUP_JSON_TEXT_FIELD_NAMES = [
  'promptTemplate',
  'formatingOrder',
  'presetBias',
  'localStopStrings',
  'promptSettings',
  'customAPIFormat',
  'openrouterProvider',
  'seperateParameters',
  'fallbackModels',
  'seperateModels',
  'modelTools',
  'customFlags',
  'dynamicOutput',
  'reverseProxyOobaArgs',
] as const;

export type RisupJsonTextFieldName = (typeof RISUP_JSON_TEXT_FIELD_NAMES)[number];

const RISUP_JSON_TEXT_FIELD_SET = new Set<string>(RISUP_JSON_TEXT_FIELD_NAMES);

export function isRisupJsonTextFieldName(field: string): field is RisupJsonTextFieldName {
  return RISUP_JSON_TEXT_FIELD_SET.has(field);
}

export function validateRisupJsonTextField(field: RisupJsonTextFieldName, value: unknown): string | null {
  if (typeof value !== 'string') {
    return `${field} must be a JSON string.`;
  }

  if (field === 'promptTemplate') return validatePromptTemplateText(value);
  if (field === 'formatingOrder') return validateFormatingOrderText(value);
  if (field === 'presetBias') return validatePresetBiasText(value);
  if (field === 'localStopStrings') return validateLocalStopStringsText(value);

  try {
    JSON.parse(value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function parseRisupJsonTextField(field: RisupJsonTextFieldName, value: unknown): unknown {
  const error = validateRisupJsonTextField(field, value);
  if (error) {
    throw new Error(`Invalid ${field}: ${error}`);
  }
  return JSON.parse(value as string);
}

export function parseSubmittedRisupJsonFields(
  data: Record<string, unknown>,
): Partial<Record<RisupJsonTextFieldName, unknown>> {
  const parsed: Partial<Record<RisupJsonTextFieldName, unknown>> = {};
  for (const field of RISUP_JSON_TEXT_FIELD_NAMES) {
    if (data[field] !== undefined) {
      parsed[field] = parseRisupJsonTextField(field, data[field]);
    }
  }
  return parsed;
}
