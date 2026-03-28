import type { TriggerScriptEffectModel, TriggerScriptEntryModel, TriggerScriptModel } from './trigger-script-model';

export interface TriggerFormTabInfo {
  id: string;
  label: string;
  language: string;
  getValue: () => unknown;
  setValue?: ((data: unknown) => void) | null;
  _triggerSelectedIndex?: number;
}

export type TriggerFormInputKind = 'text' | 'number' | 'checkbox' | 'select';
export type TriggerFormValueKind = 'string' | 'number' | 'boolean';

export interface TriggerFormValidationError {
  kind: 'condition' | 'effect';
  code: 'unsupported-condition' | 'unsupported-effect';
  path: string;
  message: string;
}

export interface TriggerFormListItem {
  index: number;
  label: string;
  type: string;
  supported: boolean;
  conditionCount: number;
  effectCount: number;
}

export interface TriggerFormDetailState {
  items: TriggerFormListItem[];
  selectedIndex: number;
  selectedItem: TriggerFormListItem | null;
  selectedTrigger: TriggerScriptEntryModel | null;
}

type EditableTriggerScalarField = 'comment' | 'type' | 'lowLevelAccess';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonValue<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function coerceTypedTriggerFormValue(
  value: string | boolean,
  valueKind: TriggerFormValueKind,
): string | number | boolean | undefined {
  if (valueKind === 'boolean') {
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return undefined;
  }

  if (valueKind === 'number') {
    const num = Number.parseFloat(String(value));
    return Number.isFinite(num) ? num : undefined;
  }

  return String(value);
}

function getDraftTriggers(
  draft: Pick<TriggerScriptModel, 'triggers'> | null | undefined,
): readonly TriggerScriptEntryModel[] {
  return draft && Array.isArray(draft.triggers) ? draft.triggers : [];
}

function getTriggerListLabel(trigger: TriggerScriptEntryModel, index: number): string {
  return trigger.comment.trim() || `트리거 ${index + 1}`;
}

function ensureTriggerRawRecordBacking(trigger: TriggerScriptEntryModel): Record<string, unknown> {
  if (isRecord(trigger.rawValue)) {
    return trigger.rawValue;
  }

  const normalized = cloneJsonValue(trigger.value);
  trigger.rawValue = normalized;
  return normalized;
}

function syncTriggerScalarBackingField(
  target: Record<string, unknown>,
  field: EditableTriggerScalarField,
  value: string | boolean,
): void {
  const shouldPersist =
    Object.prototype.hasOwnProperty.call(target, field) || (field === 'lowLevelAccess' ? value : value !== '');

  if (!shouldPersist) {
    delete target[field];
    return;
  }

  target[field] = value;
}

function snapshotTriggerEffectBacking(effect: TriggerScriptEffectModel): unknown {
  if (!effect.supported) {
    return cloneJsonValue(effect.rawValue);
  }

  const value = cloneJsonValue(effect.value);
  if (effect.type === null) {
    delete value.type;
  } else {
    value.type = effect.type;
  }
  if (effect.code === null) {
    delete value.code;
  } else {
    value.code = effect.code;
  }
  return value;
}

function syncTriggerEffectArrays(trigger: TriggerScriptEntryModel): void {
  const serializedEffects = trigger.effects.map((effect) => snapshotTriggerEffectBacking(effect));
  trigger.value.effect = serializedEffects;
  if (Array.isArray(trigger.value.effects)) {
    trigger.value.effects = cloneJsonValue(serializedEffects);
  }
  const rawValue = ensureTriggerRawRecordBacking(trigger);
  if (
    Object.prototype.hasOwnProperty.call(rawValue, 'effect') ||
    !Object.prototype.hasOwnProperty.call(rawValue, 'effects')
  ) {
    rawValue.effect = cloneJsonValue(serializedEffects);
  }
  if (Array.isArray(rawValue.effects)) {
    rawValue.effects = cloneJsonValue(serializedEffects);
  }
}

export function updateTriggerFormScalarField<K extends EditableTriggerScalarField>(
  trigger: TriggerScriptEntryModel,
  field: K,
  value: TriggerScriptEntryModel[K],
): void {
  trigger[field] = value;
  syncTriggerScalarBackingField(trigger.value, field, value as string | boolean);
  if (isRecord(trigger.rawValue) || Object.prototype.hasOwnProperty.call(trigger.value, field)) {
    syncTriggerScalarBackingField(ensureTriggerRawRecordBacking(trigger), field, value as string | boolean);
  }
}

export function updateTriggerFormLuaEffectCode(
  trigger: TriggerScriptEntryModel,
  effect: TriggerScriptEffectModel,
  value: string,
): void {
  effect.type = 'triggerlua';
  effect.code = value;
  effect.supported = true;
  effect.value.type = 'triggerlua';
  effect.value.code = value;
  effect.rawValue = cloneJsonValue(effect.value);
  syncTriggerEffectArrays(trigger);
}

export function coerceTriggerFormInputValue(
  kind: TriggerFormInputKind,
  value: string | boolean,
  selectValueKind: TriggerFormValueKind = 'string',
): string | number | boolean | undefined {
  if (kind === 'checkbox') {
    return Boolean(value);
  }
  if (kind === 'number') {
    return coerceTypedTriggerFormValue(value, 'number');
  }
  if (kind === 'select') {
    return coerceTypedTriggerFormValue(value, selectValueKind);
  }
  return String(value);
}

export function validateTriggerFormDraft(
  draft: Pick<TriggerScriptModel, 'triggers'> | null | undefined,
): TriggerFormValidationError[] {
  const errors: TriggerFormValidationError[] = [];

  getDraftTriggers(draft).forEach((trigger, triggerIndex) => {
    trigger.conditions.forEach((condition, conditionIndex) => {
      if (condition.supported) return;
      errors.push({
        kind: 'condition',
        code: 'unsupported-condition',
        path: `triggers[${triggerIndex}].conditions[${conditionIndex}]`,
        message: condition.type
          ? `지원되지 않는 트리거 조건 "${condition.type}"이(가) 있습니다.`
          : '지원되지 않는 트리거 조건 형식이 있습니다.',
      });
    });

    trigger.effects.forEach((effect, effectIndex) => {
      if (effect.supported) return;
      errors.push({
        kind: 'effect',
        code: 'unsupported-effect',
        path: `triggers[${triggerIndex}].effects[${effectIndex}]`,
        message: effect.type
          ? `지원되지 않는 트리거 효과 "${effect.type}"이(가) 있습니다.`
          : '지원되지 않는 트리거 효과 형식이 있습니다.',
      });
    });
  });

  return errors;
}

export function getTriggerFormValidationMessage(
  draft: Pick<TriggerScriptModel, 'triggers'> | null | undefined,
): string | null {
  const errors = validateTriggerFormDraft(draft);
  if (errors.length === 0) return null;
  return `지원되지 않는 트리거 조건/효과가 있어 폼 편집을 완료할 수 없습니다.\n${errors
    .map((error) => `- ${error.message} (${error.path})`)
    .join('\n')}`;
}

export function getTriggerListItems(
  draft: Pick<TriggerScriptModel, 'triggers'> | null | undefined,
): TriggerFormListItem[] {
  return getDraftTriggers(draft).map((trigger, index) => ({
    index,
    label: getTriggerListLabel(trigger, index),
    type: trigger.type || '',
    supported: trigger.supported,
    conditionCount: trigger.conditions.length,
    effectCount: trigger.effects.length,
  }));
}

export function resolveTriggerDetailState(
  draft: Pick<TriggerScriptModel, 'triggers'> | null | undefined,
  selectedIndex: number | null | undefined,
): TriggerFormDetailState {
  const triggers = getDraftTriggers(draft);
  const items = getTriggerListItems(draft);

  if (items.length === 0) {
    return {
      items,
      selectedIndex: -1,
      selectedItem: null,
      selectedTrigger: null,
    };
  }

  const normalizedIndex =
    typeof selectedIndex === 'number' &&
    Number.isInteger(selectedIndex) &&
    selectedIndex >= 0 &&
    selectedIndex < items.length
      ? selectedIndex
      : 0;

  return {
    items,
    selectedIndex: normalizedIndex,
    selectedItem: items[normalizedIndex] || null,
    selectedTrigger: triggers[normalizedIndex] || null,
  };
}
