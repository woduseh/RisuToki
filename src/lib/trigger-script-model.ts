export type TriggerScriptTextState = 'invalid' | 'empty' | 'lua' | 'trigger-editor';

import { isRecord, cloneRecord, cloneJson } from './shared-utils';

type JsonRecord = Record<string, unknown>;

export interface TriggerScriptIssue {
  kind: 'trigger' | 'condition' | 'effect';
  code:
    | 'invalid-json'
    | 'invalid-root'
    | 'invalid-trigger'
    | 'invalid-trigger-field'
    | 'invalid-conditions'
    | 'invalid-effects'
    | 'unsupported-condition'
    | 'unsupported-effect';
  path: string;
  message: string;
}

export interface TriggerScriptConditionModel {
  type: string | null;
  supported: boolean;
  value: JsonRecord;
  rawValue: unknown;
}

export interface TriggerScriptEffectModel {
  type: string | null;
  code: string | null;
  supported: boolean;
  value: JsonRecord;
  rawValue: unknown;
}

export interface TriggerScriptEntryModel {
  comment: string;
  type: string;
  lowLevelAccess: boolean;
  conditions: TriggerScriptConditionModel[];
  effects: TriggerScriptEffectModel[];
  supported: boolean;
  value: JsonRecord;
  rawValue: unknown;
}

export interface TriggerScriptModel {
  state: TriggerScriptTextState;
  rawText: string;
  triggers: TriggerScriptEntryModel[];
  issues: TriggerScriptIssue[];
  hasUnsupportedContent: boolean;
  primaryLua: string;
  parseError?: string;
}

function hasValidTriggerScalarFields(value: JsonRecord): boolean {
  return (
    (value.comment === undefined || typeof value.comment === 'string') &&
    (value.type === undefined || typeof value.type === 'string') &&
    (value.lowLevelAccess === undefined || typeof value.lowLevelAccess === 'boolean')
  );
}

function hasValidTriggerArrayFields(value: JsonRecord): boolean {
  return (
    (value.conditions === undefined || Array.isArray(value.conditions)) &&
    (value.effect === undefined || Array.isArray(value.effect)) &&
    (value.effects === undefined || Array.isArray(value.effects))
  );
}

function createConditionModel(value: unknown, path: string, issues: TriggerScriptIssue[]): TriggerScriptConditionModel {
  const record = cloneRecord(value);
  const type = typeof record.type === 'string' ? record.type : null;
  const supported = type === 'custom';

  if (!supported) {
    issues.push({
      kind: 'condition',
      code: 'unsupported-condition',
      path,
      message: type ? `Unsupported trigger condition type "${type}".` : 'Unsupported trigger condition shape.',
    });
  }

  return {
    type,
    supported,
    value: record,
    rawValue: cloneJson(value),
  };
}

function createEffectModel(value: unknown, path: string, issues: TriggerScriptIssue[]): TriggerScriptEffectModel {
  const record = cloneRecord(value);
  const code = typeof record.code === 'string' ? record.code : null;
  const hasExplicitType = Object.prototype.hasOwnProperty.call(record, 'type');
  const normalizedType =
    typeof record.type === 'string'
      ? record.type
      : !hasExplicitType && typeof record.code === 'string'
        ? 'triggerlua'
        : null;
  const supported =
    code !== null && normalizedType === 'triggerlua' && (typeof record.type === 'string' || !hasExplicitType);

  if (!supported) {
    issues.push({
      kind: 'effect',
      code: 'unsupported-effect',
      path,
      message: normalizedType
        ? `Unsupported trigger effect type "${normalizedType}".`
        : 'Unsupported trigger effect shape.',
    });
  }

  return {
    type: normalizedType,
    code,
    supported,
    value: record,
    rawValue: cloneJson(value),
  };
}

function createTriggerModel(value: unknown, index: number, issues: TriggerScriptIssue[]): TriggerScriptEntryModel {
  if (!isRecord(value)) {
    issues.push({
      kind: 'trigger',
      code: 'invalid-trigger',
      path: `triggers[${index}]`,
      message: 'Trigger entries must be JSON objects.',
    });
    return {
      comment: '',
      type: '',
      lowLevelAccess: false,
      conditions: [],
      effects: [],
      supported: false,
      value: {},
      rawValue: cloneJson(value),
    };
  }

  const record = cloneRecord(value);
  const conditionsValue = record.conditions;
  const effectsValue = record.effect === undefined ? record.effects : record.effect;
  let scalarFieldsValid = true;

  if (record.comment !== undefined && typeof record.comment !== 'string') {
    scalarFieldsValid = false;
    issues.push({
      kind: 'trigger',
      code: 'invalid-trigger-field',
      path: `triggers[${index}].comment`,
      message: 'Trigger comment must be a string.',
    });
  }

  if (record.type !== undefined && typeof record.type !== 'string') {
    scalarFieldsValid = false;
    issues.push({
      kind: 'trigger',
      code: 'invalid-trigger-field',
      path: `triggers[${index}].type`,
      message: 'Trigger type must be a string.',
    });
  }

  if (record.lowLevelAccess !== undefined && typeof record.lowLevelAccess !== 'boolean') {
    scalarFieldsValid = false;
    issues.push({
      kind: 'trigger',
      code: 'invalid-trigger-field',
      path: `triggers[${index}].lowLevelAccess`,
      message: 'Trigger lowLevelAccess must be a boolean.',
    });
  }

  if (conditionsValue !== undefined && !Array.isArray(conditionsValue)) {
    issues.push({
      kind: 'trigger',
      code: 'invalid-conditions',
      path: `triggers[${index}].conditions`,
      message: 'Trigger conditions must be a JSON array.',
    });
  }

  if (record.effect !== undefined && !Array.isArray(record.effect)) {
    issues.push({
      kind: 'trigger',
      code: 'invalid-effects',
      path: `triggers[${index}].effect`,
      message: 'Trigger effects must be a JSON array.',
    });
  }

  if (record.effects !== undefined && !Array.isArray(record.effects)) {
    issues.push({
      kind: 'trigger',
      code: 'invalid-effects',
      path: `triggers[${index}].effects`,
      message: 'Trigger effects must be a JSON array.',
    });
  }

  const conditions = Array.isArray(conditionsValue)
    ? conditionsValue.map((condition, conditionIndex) =>
        createConditionModel(condition, `triggers[${index}].conditions[${conditionIndex}]`, issues),
      )
    : [];
  const effects = Array.isArray(effectsValue)
    ? effectsValue.map((effect, effectIndex) =>
        createEffectModel(effect, `triggers[${index}].effects[${effectIndex}]`, issues),
      )
    : [];

  return {
    comment: typeof record.comment === 'string' ? record.comment : '',
    type: typeof record.type === 'string' ? record.type : '',
    lowLevelAccess: !!record.lowLevelAccess,
    conditions,
    effects,
    supported:
      scalarFieldsValid &&
      hasValidTriggerArrayFields(record) &&
      (conditionsValue === undefined || Array.isArray(conditionsValue)) &&
      (record.effect === undefined || Array.isArray(record.effect)) &&
      (record.effects === undefined || Array.isArray(record.effects)) &&
      conditions.every((condition) => condition.supported) &&
      effects.every((effect) => effect.supported),
    value: record,
    rawValue: cloneJson(value),
  };
}

function extractPrimaryLuaFromTriggers(triggers: TriggerScriptEntryModel[]): string {
  const preferred = findLuaEffectLocation(triggers, true);
  if (!preferred) {
    return '';
  }

  return triggers[preferred.triggerIndex].effects[preferred.effectIndex].code || '';
}

function isSingleLuaWrapper(triggers: TriggerScriptEntryModel[], issues: TriggerScriptIssue[]): boolean {
  return issues.length === 0 && triggers.length === 1 && isCanonicalLuaWrapperRecord(triggers[0].value);
}

export function parseTriggerScriptsText(text: string): TriggerScriptModel {
  const rawText = typeof text === 'string' ? text : '';
  const trimmed = rawText.trim();

  if (!trimmed) {
    return {
      state: 'empty',
      rawText,
      triggers: [],
      issues: [],
      hasUnsupportedContent: false,
      primaryLua: '',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error);
    return {
      state: 'invalid',
      rawText,
      triggers: [],
      issues: [
        {
          kind: 'trigger',
          code: 'invalid-json',
          path: '$',
          message: parseError,
        },
      ],
      hasUnsupportedContent: false,
      primaryLua: '',
      parseError,
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      state: 'invalid',
      rawText,
      triggers: [],
      issues: [
        {
          kind: 'trigger',
          code: 'invalid-root',
          path: '$',
          message: 'Trigger scripts must be a JSON array.',
        },
      ],
      hasUnsupportedContent: false,
      primaryLua: '',
      parseError: 'Trigger scripts must be a JSON array.',
    };
  }

  const issues: TriggerScriptIssue[] = [];
  const triggers = parsed.map((trigger, index) => createTriggerModel(trigger, index, issues));
  const primaryLua = extractPrimaryLuaFromTriggers(triggers);

  let state: TriggerScriptTextState = 'trigger-editor';
  if (triggers.length === 0) {
    state = 'empty';
  } else if (isSingleLuaWrapper(triggers, issues)) {
    state = 'lua';
  }

  return {
    state,
    rawText,
    triggers,
    issues,
    hasUnsupportedContent: issues.length > 0,
    primaryLua,
  };
}

export function classifyTriggerScriptsText(text: string): TriggerScriptTextState {
  return parseTriggerScriptsText(text).state;
}

function coerceTriggerScriptsText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value ?? [], null, 2);
  } catch {
    return '[]';
  }
}

export function isTriggerScriptsLuaMode(value: unknown): boolean {
  return parseTriggerScriptsText(coerceTriggerScriptsText(value)).state !== 'trigger-editor';
}

function serializeCondition(condition: TriggerScriptConditionModel): unknown {
  if (!condition.supported) {
    return cloneJson(condition.rawValue);
  }

  const value = cloneRecord(condition.value);
  if (condition.type === null) {
    delete value.type;
  } else {
    value.type = condition.type;
  }
  return value;
}

function serializeEffect(effect: TriggerScriptEffectModel): unknown {
  if (!effect.supported) {
    return cloneJson(effect.rawValue);
  }

  const value = cloneRecord(effect.value);
  const hadExplicitType = Object.prototype.hasOwnProperty.call(effect.value, 'type');
  const originalCode = typeof effect.value.code === 'string' ? effect.value.code : null;
  const shouldMaterializeType = hadExplicitType || effect.type !== 'triggerlua' || effect.code !== originalCode;
  if (effect.type === null || !shouldMaterializeType) {
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

function serializeTrigger(trigger: TriggerScriptEntryModel): unknown {
  if (!trigger.supported) {
    return cloneJson(trigger.rawValue);
  }

  const value = cloneRecord(trigger.value);
  delete value.effects;
  if (Object.prototype.hasOwnProperty.call(trigger.value, 'comment') || trigger.comment !== '') {
    value.comment = trigger.comment;
  }
  if (Object.prototype.hasOwnProperty.call(trigger.value, 'type') || trigger.type !== '') {
    value.type = trigger.type;
  }
  if (Object.prototype.hasOwnProperty.call(trigger.value, 'conditions') || trigger.conditions.length > 0) {
    value.conditions = trigger.conditions.map(serializeCondition);
  }
  if (Object.prototype.hasOwnProperty.call(trigger.value, 'effect') || trigger.effects.length > 0) {
    value.effect = trigger.effects.map(serializeEffect);
  }
  if (Object.prototype.hasOwnProperty.call(trigger.value, 'lowLevelAccess') || trigger.lowLevelAccess) {
    value.lowLevelAccess = trigger.lowLevelAccess;
  }
  return value;
}

export function serializeTriggerScriptModel(model: Pick<TriggerScriptModel, 'triggers'>): string {
  if (!model || !Array.isArray(model.triggers) || model.triggers.length === 0) {
    return '[]';
  }

  return JSON.stringify(model.triggers.map(serializeTrigger), null, 2);
}

function createLuaWrapperTrigger(lua: string): TriggerScriptEntryModel {
  return {
    comment: '',
    type: 'start',
    lowLevelAccess: false,
    conditions: [],
    effects: [
      {
        type: 'triggerlua',
        code: lua,
        supported: true,
        value: { type: 'triggerlua', code: lua },
        rawValue: { type: 'triggerlua', code: lua },
      },
    ],
    supported: true,
    value: {
      comment: '',
      type: 'start',
      conditions: [],
      effect: [{ type: 'triggerlua', code: lua }],
      lowLevelAccess: false,
    },
    rawValue: {
      comment: '',
      type: 'start',
      conditions: [],
      effect: [{ type: 'triggerlua', code: lua }],
      lowLevelAccess: false,
    },
  };
}

function isCanonicalLuaWrapperEffectRecord(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value).sort();
  return keys.join('|') === 'code|type' && value.type === 'triggerlua' && typeof value.code === 'string';
}

function isCanonicalLuaWrapperRecord(value: JsonRecord): boolean {
  const keys = Object.keys(value).sort();
  if (keys.join('|') !== 'comment|conditions|effect|lowLevelAccess|type') {
    return false;
  }

  if (
    value.comment !== '' ||
    value.type !== 'start' ||
    value.lowLevelAccess !== false ||
    !Array.isArray(value.conditions) ||
    value.conditions.length !== 0 ||
    !Array.isArray(value.effect) ||
    value.effect.length !== 1
  ) {
    return false;
  }

  const [effect] = value.effect;
  return isCanonicalLuaWrapperEffectRecord(effect);
}

function isLuaManagedEffect(effect: TriggerScriptEffectModel): boolean {
  return effect.type === 'triggerlua' && (effect.value.type === 'triggerlua' || effect.value.type === undefined);
}

function findLuaEffectLocation(
  triggers: TriggerScriptEntryModel[],
  requireCode: boolean,
): { triggerIndex: number; effectIndex: number } | null {
  const findMatch = (preferStart: boolean) => {
    for (let triggerIndex = 0; triggerIndex < triggers.length; triggerIndex += 1) {
      const trigger = triggers[triggerIndex];
      if (preferStart && trigger.type !== 'start') {
        continue;
      }

      for (let effectIndex = 0; effectIndex < trigger.effects.length; effectIndex += 1) {
        const effect = trigger.effects[effectIndex];
        if (isLuaManagedEffect(effect) && (!requireCode || typeof effect.code === 'string')) {
          return { triggerIndex, effectIndex };
        }
      }
    }

    return null;
  };

  return findMatch(true) ?? findMatch(false);
}

function syncTriggerEffectArrays(trigger: TriggerScriptEntryModel): void {
  const serializedEffects = trigger.effects.map((entry) => serializeEffect(entry));
  trigger.value.effect = serializedEffects;
  if (Array.isArray(trigger.value.effects)) {
    trigger.value.effects = cloneJson(serializedEffects);
  }
  if (isRecord(trigger.rawValue)) {
    if (
      Object.prototype.hasOwnProperty.call(trigger.rawValue, 'effect') ||
      !Object.prototype.hasOwnProperty.call(trigger.rawValue, 'effects')
    ) {
      trigger.rawValue.effect = cloneJson(serializedEffects);
    }
    if (Array.isArray(trigger.rawValue.effects)) {
      trigger.rawValue.effects = cloneJson(serializedEffects);
    }
  }
}

export function tryExtractPrimaryLuaFromTriggerScriptsText(value: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  if (!value.trim()) {
    return '';
  }

  const parsed = parseTriggerScriptsText(value);
  if (parsed.state === 'invalid') {
    return null;
  }

  return parsed.primaryLua;
}

export function mergeLuaIntoTriggerScriptsText(triggerScriptsText: string, lua: string): string {
  if (typeof lua !== 'string') {
    return triggerScriptsText;
  }

  const parsed = parseTriggerScriptsText(triggerScriptsText || '[]');
  if (parsed.state === 'invalid') {
    return triggerScriptsText;
  }

  if (!lua) {
    const canonicalWrapperIndex = parsed.triggers.findIndex((trigger) => isCanonicalLuaWrapperRecord(trigger.value));
    if (canonicalWrapperIndex === -1) {
      return triggerScriptsText;
    }

    parsed.triggers.splice(canonicalWrapperIndex, 1);
    return serializeTriggerScriptModel(parsed);
  }

  const preferred = findLuaEffectLocation(parsed.triggers, false);
  if (preferred) {
    const trigger = parsed.triggers[preferred.triggerIndex];
    const effect = trigger.effects[preferred.effectIndex];
    effect.type = 'triggerlua';
    effect.code = lua;
    effect.supported = true;
    effect.value.type = 'triggerlua';
    effect.value.code = lua;
    effect.rawValue = cloneJson(effect.value);
    syncTriggerEffectArrays(trigger);
    trigger.supported =
      hasValidTriggerScalarFields(trigger.value) &&
      hasValidTriggerArrayFields(trigger.value) &&
      trigger.conditions.every((entry) => entry.supported) &&
      trigger.effects.every((entry) => entry.supported);
    return serializeTriggerScriptModel(parsed);
  }

  if (!lua) {
    return serializeTriggerScriptModel(parsed);
  }

  parsed.triggers.unshift(createLuaWrapperTrigger(lua));
  return serializeTriggerScriptModel(parsed);
}
