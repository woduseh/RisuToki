import type { CharxData } from '../stores/app-store';
import {
  RISUP_JSON_FIELD_IDS,
  getRisupFieldDefinition,
  type RisupFieldEditorKind,
  type RisupFieldGroupId,
  type RisupFieldId,
} from './risup-fields';
import { collectFormatingOrderWarnings, parseFormatingOrder, parsePromptTemplate } from './risup-prompt-model';

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
  severity: 'error' | 'warning';
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

/**
 * Classify a raw warning message from collectFormatingOrderWarnings as
 * a duplicate-token warning.  Uses startsWith to avoid false positives
 * when "Duplicate" appears inside a token name.
 */
export function isDuplicateWarning(msg: string): boolean {
  return msg.startsWith('Duplicate ');
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
        severity: 'error',
        message: `${label} 값은 JSON 문자열이어야 합니다.`,
      });
      continue;
    }
    if (!value.trim()) {
      errors.push({
        field: fieldId,
        label,
        severity: 'error',
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
        severity: 'error',
        message: `${label} JSON 파싱 실패: ${(error as Error).message}`,
      });
    }
  }

  let promptModel: ReturnType<typeof parsePromptTemplate> | undefined;
  const promptTemplateValue = data.promptTemplate;
  if (promptTemplateValue !== undefined && promptTemplateValue !== null) {
    const label = getRisupFieldDefinition('promptTemplate')?.label || 'promptTemplate';
    if (typeof promptTemplateValue !== 'string') {
      errors.push({
        field: 'promptTemplate',
        label,
        severity: 'error',
        message: `${label} 값은 JSON 문자열이어야 합니다.`,
      });
    } else {
      promptModel = parsePromptTemplate(promptTemplateValue);
      if (promptModel.state === 'invalid') {
        errors.push({
          field: 'promptTemplate',
          label,
          severity: 'error',
          message: `${label} JSON 파싱 실패: ${promptModel.parseError ?? '알 수 없는 오류'}`,
        });
        promptModel = undefined;
      }
    }
  }

  let orderModel: ReturnType<typeof parseFormatingOrder> | undefined;
  const formatingOrderValue = data.formatingOrder;
  if (formatingOrderValue !== undefined && formatingOrderValue !== null) {
    const label = getRisupFieldDefinition('formatingOrder')?.label || 'formatingOrder';
    if (typeof formatingOrderValue !== 'string') {
      errors.push({
        field: 'formatingOrder',
        label,
        severity: 'error',
        message: `${label} 값은 JSON 문자열이어야 합니다.`,
      });
    } else {
      orderModel = parseFormatingOrder(formatingOrderValue);
      if (orderModel.state === 'invalid') {
        errors.push({
          field: 'formatingOrder',
          label,
          severity: 'error',
          message: `${label} JSON 파싱 실패: ${orderModel.parseError ?? '알 수 없는 오류'}`,
        });
        orderModel = undefined;
      }
    }
  }

  // Surface formatting-order warnings (duplicate/dangling) as advisory diagnostics
  if (promptModel && orderModel) {
    const label = getRisupFieldDefinition('formatingOrder')?.label || 'formatingOrder';
    const warnings = collectFormatingOrderWarnings(promptModel, orderModel);
    for (const msg of warnings) {
      errors.push({
        field: 'formatingOrder',
        label,
        severity: 'warning',
        message: isDuplicateWarning(msg) ? `${label} 중복 토큰: ${msg}` : `${label} 참조 경고: ${msg}`,
      });
    }
  }

  return errors;
}

export function getRisupValidationMessage(data: Partial<CharxData>): string | null {
  const all = validateRisupDraftFields(data);
  const errors = all.filter((e) => e.severity === 'error');
  if (errors.length === 0) return null;

  const labels = [...new Set(errors.map((error) => error.label))];
  return `저장할 수 없습니다. 올바르지 않은 risup JSON 필드: ${labels.join(', ')}`;
}
