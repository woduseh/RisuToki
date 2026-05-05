import { describe, expect, it } from 'vitest';
import {
  RISUP_FIELD_GROUPS,
  RISUP_DISABLEABLE_NUMBER_FIELD_IDS,
  RISUP_LEGACY_FIELD_IDS,
  RISUP_JSON_FIELD_IDS,
  getRisupFieldGroup,
  getVisibleRisupFieldGroups,
  isRisupDisableableNumberFieldId,
  isRisupEditableFieldId,
} from './risup-fields';

describe('risup field metadata', () => {
  it('promotes the template group as the primary prompt surface before the legacy prompts group', () => {
    const groupIds = RISUP_FIELD_GROUPS.map((g) => g.id);
    const templatesIdx = groupIds.indexOf('templates');
    const promptsIdx = groupIds.indexOf('prompts');

    expect(templatesIdx).toBeGreaterThanOrEqual(0);
    expect(promptsIdx).toBeGreaterThanOrEqual(0);
    // templates must come before legacy prompts
    expect(templatesIdx).toBeLessThan(promptsIdx);
    // templates is the second group (right after basic) so it's the first prompt surface a user sees
    expect(groupIds[1]).toBe('templates');
  });

  it('labels the templates group as the primary prompt surface and removes instruct/jinja from it', () => {
    // templates group must be labeled as the primary prompt editor surface
    expect(getRisupFieldGroup('templates')?.label).toBe('프롬프트');

    // The old prompts group must not carry the plain '프롬프트' label any more
    expect(getRisupFieldGroup('prompts')?.label).not.toBe('프롬프트');

    // templates group leads with the template-driven fields
    const templateFields = getRisupFieldGroup('templates')?.fields.map((f) => f.id) ?? [];
    expect(templateFields[0]).toBe('promptTemplate');
    expect(templateFields).toContain('formatingOrder');

    // useInstructPrompt, instructChatTemplate, JinjaTemplate are removed from the primary prompt flow
    expect(templateFields).not.toContain('useInstructPrompt');
    expect(templateFields).not.toContain('instructChatTemplate');
    expect(templateFields).not.toContain('JinjaTemplate');

    // customPromptTemplateToggle must use its dedicated structured editor
    const customToggle = getRisupFieldGroup('templates')?.fields.find((f) => f.id === 'customPromptTemplateToggle');
    expect(customToggle?.editor).toBe('toggle-template');
  });

  it('moves useInstructPrompt/instructChatTemplate/JinjaTemplate to the legacy prompts group', () => {
    const promptsFields = getRisupFieldGroup('prompts')?.fields.map((f) => f.id) ?? [];
    expect(promptsFields).toEqual([...RISUP_LEGACY_FIELD_IDS]);
    expect(promptsFields).toContain('mainPrompt');
    expect(promptsFields).toContain('jailbreak');
    expect(promptsFields).toContain('globalNote');
    expect(promptsFields).toContain('useInstructPrompt');
    expect(promptsFields).toContain('instructChatTemplate');
    expect(promptsFields).toContain('JinjaTemplate');
  });

  it('hides the legacy prompts group from the sidebar while keeping it resolvable', () => {
    const visibleIds = getVisibleRisupFieldGroups().map((g) => g.id);
    expect(visibleIds).not.toContain('prompts');
    expect(visibleIds).toContain('templates');
    // Can still resolve it for restore/compatibility via getRisupFieldGroup
    expect(getRisupFieldGroup('prompts')).toBeDefined();
    // All visible groups are present in RISUP_FIELD_GROUPS
    for (const g of getVisibleRisupFieldGroups()) {
      expect(RISUP_FIELD_GROUPS).toContain(g);
    }
  });

  it('preserves risup group IDs so backup/restore tab routing still works', () => {
    const groupIds = RISUP_FIELD_GROUPS.map((g) => g.id);
    // Both IDs must remain so risup_prompts and risup_templates tab IDs continue to resolve
    expect(groupIds).toContain('prompts');
    expect(groupIds).toContain('templates');
    expect(getRisupFieldGroup('prompts')).toBeDefined();
    expect(getRisupFieldGroup('templates')).toBeDefined();
  });

  it('defines unique risup fields without charx-only fields while excluding legacy fields from editing', () => {
    const ids = RISUP_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => field.id));

    expect(ids).toEqual(
      expect.arrayContaining([
        'name',
        'aiModel',
        'temperature',
        'promptTemplate',
        'jsonSchema',
        'systemRoleReplacement',
      ]),
    );
    expect(ids).not.toContain('description');
    expect(ids).not.toContain('firstMessage');
    expect(ids).not.toContain('lua');
    expect(ids).not.toContain('lorebook');
    expect(ids).not.toContain('triggerScripts');
    expect(new Set(ids).size).toBe(ids.length);
    for (const fieldId of RISUP_LEGACY_FIELD_IDS) {
      expect(ids).toContain(fieldId);
      expect(isRisupEditableFieldId(fieldId)).toBe(false);
    }
    expect(isRisupEditableFieldId('promptTemplate')).toBe(true);
  });

  it('exposes known groups and json-backed fields that need validation', () => {
    expect(getRisupFieldGroup('prompts')?.label).toBe('레거시 프롬프트');
    expect(getRisupFieldGroup('json-schema')?.label).toBe('JSON 스키마');

    // promptTemplate and formatingOrder now use structured editors — excluded from raw JSON validation
    expect(RISUP_JSON_FIELD_IDS).toEqual(expect.arrayContaining(['presetBias', 'localStopStrings']));
    expect(RISUP_JSON_FIELD_IDS).not.toContain('promptTemplate');
    expect(RISUP_JSON_FIELD_IDS).not.toContain('formatingOrder');
    for (const fieldId of RISUP_JSON_FIELD_IDS) {
      expect(isRisupEditableFieldId(fieldId)).toBe(true);
    }
  });

  it('tracks RisuAI disableable numeric fields separately from regular numeric fields', () => {
    const fieldById = new Map(RISUP_FIELD_GROUPS.flatMap((group) => group.fields).map((field) => [field.id, field]));

    expect(RISUP_DISABLEABLE_NUMBER_FIELD_IDS).toEqual([
      'temperature',
      'frequencyPenalty',
      'presencePenalty',
      'top_p',
      'top_k',
      'min_p',
      'top_a',
      'repetition_penalty',
      'reasonEffort',
      'thinkingTokens',
      'verbosity',
    ]);
    for (const fieldId of RISUP_DISABLEABLE_NUMBER_FIELD_IDS) {
      expect(fieldById.get(fieldId)?.editor).toBe('number');
      expect(isRisupDisableableNumberFieldId(fieldId)).toBe(true);
    }
    expect(isRisupDisableableNumberFieldId('maxContext')).toBe(false);
    expect(isRisupDisableableNumberFieldId('maxResponse')).toBe(false);
  });
});
