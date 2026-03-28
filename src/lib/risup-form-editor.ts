import type { CharxData } from '../stores/app-store';
import {
  RISUP_JSON_FIELD_IDS,
  getRisupFieldDefinition,
  type RisupFieldEditorKind,
  type RisupFieldGroupId,
  type RisupFieldId,
} from './risup-fields';
import { parseFormatingOrder, parsePromptTemplate } from './risup-prompt-model';

export interface RisupFormTabInfo {
  id: string;
  label: string;
  language: string;
  getValue: () => unknown;
  setValue?: ((data: unknown) => void) | null;
  _risupGroupId?: RisupFieldGroupId;
}

export interface RisupDraftValidationError {
  field: RisupFieldId;
  label: string;
  message: string;
}

export function coerceRisupInputValue(
  kind: RisupFieldEditorKind,
  value: string | boolean,
): string | number | boolean | undefined {
  if (kind === 'checkbox') {
    return Boolean(value);
  }
  if (kind === 'number') {
    const num = Number.parseFloat(String(value));
    return Number.isFinite(num) ? num : undefined;
  }
  return String(value);
}

export function validateRisupDraftFields(data: Partial<CharxData>): RisupDraftValidationError[] {
  const errors: RisupDraftValidationError[] = [];

  for (const fieldId of RISUP_JSON_FIELD_IDS) {
    const label = getRisupFieldDefinition(fieldId)?.label || fieldId;
    const value = data[fieldId];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      errors.push({
        field: fieldId,
        label,
        message: `${label} 값은 JSON 문자열이어야 합니다.`,
      });
      continue;
    }
    if (!value.trim()) {
      errors.push({
        field: fieldId,
        label,
        message: `${label} 값이 비어 있습니다.`,
      });
      continue;
    }
    try {
      JSON.parse(value);
    } catch (error) {
      errors.push({
        field: fieldId,
        label,
        message: `${label} JSON 파싱 실패: ${(error as Error).message}`,
      });
    }
  }

  const promptTemplateValue = data.promptTemplate;
  if (promptTemplateValue !== undefined && promptTemplateValue !== null) {
    const label = getRisupFieldDefinition('promptTemplate')?.label || 'promptTemplate';
    if (typeof promptTemplateValue !== 'string') {
      errors.push({
        field: 'promptTemplate',
        label,
        message: `${label} 값은 JSON 문자열이어야 합니다.`,
      });
    } else {
      const model = parsePromptTemplate(promptTemplateValue);
      if (model.state === 'invalid') {
        errors.push({
          field: 'promptTemplate',
          label,
          message: `${label} JSON 파싱 실패: ${model.parseError ?? '알 수 없는 오류'}`,
        });
      }
    }
  }

  const formatingOrderValue = data.formatingOrder;
  if (formatingOrderValue !== undefined && formatingOrderValue !== null) {
    const label = getRisupFieldDefinition('formatingOrder')?.label || 'formatingOrder';
    if (typeof formatingOrderValue !== 'string') {
      errors.push({
        field: 'formatingOrder',
        label,
        message: `${label} 값은 JSON 문자열이어야 합니다.`,
      });
    } else {
      const model = parseFormatingOrder(formatingOrderValue);
      if (model.state === 'invalid') {
        errors.push({
          field: 'formatingOrder',
          label,
          message: `${label} JSON 파싱 실패: ${model.parseError ?? '알 수 없는 오류'}`,
        });
      }
    }
  }

  return errors;
}

export function getRisupValidationMessage(data: Partial<CharxData>): string | null {
  const errors = validateRisupDraftFields(data);
  if (errors.length === 0) return null;

  const labels = [...new Set(errors.map((error) => error.label))];
  return `저장할 수 없습니다. 올바르지 않은 risup JSON 필드: ${labels.join(', ')}`;
}
