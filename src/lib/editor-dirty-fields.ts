import { RISUP_FIELD_GROUPS } from './risup-fields';

export interface DirtyTabLike {
  getValue?: () => unknown;
  id: string;
}

export interface DirtyFileDataLike {
  [key: string]: unknown;
  css?: unknown;
  lorebook?: unknown;
  lua?: unknown;
  regex?: unknown;
}

const DIRECT_VALUE_FIELDS = new Set(['globalNote', 'firstMessage', 'defaultVariables', 'description', 'name']);

const RISUP_EDITABLE_FIELD_IDS = [
  ...new Set(RISUP_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => field.id))),
];
const RISUP_EXTRA_AUTOSAVE_FIELDS = ['description'];

export function hasDirtyTabWithPrefix(dirtyFields: Iterable<string>, prefix: string): boolean {
  for (const field of dirtyFields) {
    if (field.startsWith(prefix)) return true;
  }
  return false;
}

export function collectDirtyEditorFields(options: {
  dirtyFields: Iterable<string>;
  fileData: DirtyFileDataLike;
  openTabs: DirtyTabLike[];
}): Record<string, unknown> {
  const { fileData, openTabs } = options;
  const dirtyFields = options.dirtyFields instanceof Set ? options.dirtyFields : new Set(options.dirtyFields);
  const fields: Record<string, unknown> = {};

  for (const tab of openTabs) {
    if (!tab.getValue) continue;
    const value = tab.getValue();
    if (value === undefined || value === null) continue;

    if (tab.id === 'lua' || tab.id.startsWith('lua_s')) {
      fields.lua = fileData.lua;
      continue;
    }

    if (tab.id.startsWith('css_s')) {
      fields.css = fileData.css;
      continue;
    }

    if (tab.id === 'css') {
      let cssValue = value;
      if (typeof cssValue === 'string' && cssValue.trim() && !/<style[\s>]/i.test(cssValue)) {
        cssValue = `<style>\n${cssValue}\n</style>`;
      }
      fields.css = cssValue;
      continue;
    }

    if (DIRECT_VALUE_FIELDS.has(tab.id)) {
      fields[tab.id] = value;
    }
  }

  if (dirtyFields.has('lua') || hasDirtyTabWithPrefix(dirtyFields, 'lua_s')) {
    fields.lua = fileData.lua;
  }
  if (dirtyFields.has('css') || hasDirtyTabWithPrefix(dirtyFields, 'css_s')) {
    fields.css = fileData.css;
  }
  if (dirtyFields.has('lorebook') || hasDirtyTabWithPrefix(dirtyFields, 'lore_')) {
    fields.lorebook = fileData.lorebook;
  }
  if (dirtyFields.has('regex') || hasDirtyTabWithPrefix(dirtyFields, 'regex_')) {
    fields.regex = fileData.regex;
  }
  if (hasDirtyTabWithPrefix(dirtyFields, 'risup_')) {
    for (const fieldId of RISUP_EDITABLE_FIELD_IDS) {
      if (fileData[fieldId] !== undefined) {
        fields[fieldId] = fileData[fieldId];
      }
    }
    for (const fieldId of RISUP_EXTRA_AUTOSAVE_FIELDS) {
      if (fileData[fieldId] !== undefined) {
        fields[fieldId] = fileData[fieldId];
      }
    }
  }

  return fields;
}
