import { RISUP_PRESET_FIELD_NAMES, projectRisupPresetFields } from './risup-preset-fields';
import {
  extractPrimaryLuaFromTriggerScripts,
  mergePrimaryLuaIntoTriggerScripts,
  normalizeTriggerScripts,
  stringifyTriggerScripts,
  type LoadedDocumentData,
} from '../charx-io';
import { CHARX_DEPRECATED_FIELD_NAMES } from './deprecated-save-policy';
import type { RendererDocumentData, RendererDocumentPatch } from './document-types';
import { RISUP_JSON_TEXT_FIELD_NAMES, validateRisupJsonTextField } from './risup-json-fields';

const CHARX_DEPRECATED_FIELD_NAME_SET = new Set(CHARX_DEPRECATED_FIELD_NAMES);

/** Filter data for safe transfer to renderer (strips binary assets / internal fields). */
export function serializeForRenderer(data: LoadedDocumentData): RendererDocumentData {
  const result: RendererDocumentData = {
    _fileType: data._fileType || 'charx',
    name: data.name,
    description: data.description,
    firstMessage: data.firstMessage,
    triggerScripts: stringifyTriggerScripts(data.triggerScripts),
    alternateGreetings: data.alternateGreetings || [],
    globalNote: data.globalNote,
    css: data.css,
    defaultVariables: data.defaultVariables,
    lua: data.lua,
    lorebook: data.lorebook as RendererDocumentData['lorebook'],
    regex: data.regex as RendererDocumentData['regex'],
    moduleName: data.moduleName,
  };

  // Include charx card.data fields (always present for charx files)
  if (data._fileType !== 'risup') {
    result.creatorcomment = data.creatorcomment || '';
    result.tags = data.tags || [];
    result.exampleMessage = data.exampleMessage || '';
    result.creator = data.creator || '';
    result.characterVersion = data.characterVersion || '';
    result.creationDate = typeof data.creationDate === 'number' ? data.creationDate : 0;
    result.modificationDate = typeof data.modificationDate === 'number' ? data.modificationDate : 0;
  }

  // Include risum module-specific fields
  if (data._fileType === 'risum' || data.cjs !== undefined) {
    result.moduleId = data.moduleId || '';
    result.moduleDescription = data.moduleDescription || '';
    result.cjs = data.cjs || '';
    result.lowLevelAccess = !!data.lowLevelAccess;
    result.hideIcon = !!data.hideIcon;
    result.backgroundEmbedding = data.backgroundEmbedding || '';
    result.moduleNamespace = data.moduleNamespace || '';
    result.customModuleToggle = data.customModuleToggle || '';
    result.mcpUrl = data.mcpUrl || '';
  }

  // Include risup preset fields
  if (data._fileType === 'risup') {
    Object.assign(result, projectRisupPresetFields(data));
  }
  return result;
}

/** Apply field updates with validation; keeps triggerScripts ↔ lua in sync. */
export function applyUpdates(data: LoadedDocumentData, fields: RendererDocumentPatch | null | undefined): void {
  if (!fields) return;
  const allowed = [
    'name',
    'description',
    'firstMessage',
    'alternateGreetings',
    'globalNote',
    'css',
    'defaultVariables',
    'triggerScripts',
    'lua',
    'lorebook',
    'regex',
  ];
  // Charx card.data fields
  const charxAllowed = [
    'personality',
    'scenario',
    'creatorcomment',
    'tags',
    'exampleMessage',
    'systemPrompt',
    'creator',
    'characterVersion',
    'nickname',
    'source',
    'creationDate',
    'modificationDate',
    'additionalText',
    'license',
  ].filter((field) => !CHARX_DEPRECATED_FIELD_NAME_SET.has(field));
  // Risum module-specific fields (always safe to allow — no-ops on charx)
  const risumAllowed = [
    'moduleName',
    'moduleDescription',
    'cjs',
    'lowLevelAccess',
    'hideIcon',
    'backgroundEmbedding',
    'moduleNamespace',
    'customModuleToggle',
    'mcpUrl',
  ];
  // Format fields are shared; renderer update and MCP visibility policies are not.
  const risupAllowed: readonly string[] = RISUP_PRESET_FIELD_NAMES;
  for (const fieldName of RISUP_JSON_TEXT_FIELD_NAMES) {
    if (fields[fieldName] !== undefined) {
      const error = validateRisupJsonTextField(fieldName, fields[fieldName]);
      if (error) throw new Error(`Invalid ${fieldName}: ${error}`);
    }
  }
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      if (key === 'triggerScripts') {
        data.triggerScripts = normalizeTriggerScripts(fields.triggerScripts);
        data.lua = extractPrimaryLuaFromTriggerScripts(data.triggerScripts);
        continue;
      }
      data[key] = fields[key];
      if (key === 'lua') {
        data.triggerScripts = mergePrimaryLuaIntoTriggerScripts(data.triggerScripts, data.lua);
      }
    }
  }
  for (const key of charxAllowed) {
    if (fields[key] !== undefined) {
      data[key] = fields[key];
    }
  }
  for (const key of risumAllowed) {
    if (fields[key] !== undefined) {
      data[key] = fields[key];
    }
  }
  for (const key of risupAllowed) {
    if (fields[key] !== undefined) {
      data[key] = fields[key];
    }
  }
  // CSS 필드에 <style> 태그가 없으면 강제로 감싸기
  if (fields.css !== undefined && data.css && data.css.trim()) {
    if (!/<style[\s>]/i.test(data.css)) {
      data.css = '<style>\n' + data.css + '\n</style>';
    }
  }
}
