// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DataSerializerDeps {
  stringifyTriggerScripts: (ts: any) => string;
  normalizeTriggerScripts: (ts: any) => any[];
  extractPrimaryLuaFromTriggerScripts: (ts: any) => string;
  mergePrimaryLuaIntoTriggerScripts: (ts: any, lua: string) => any[];
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: DataSerializerDeps;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initDataSerializer(d: DataSerializerDeps): void {
  deps = d;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Filter data for safe transfer to renderer (strips binary assets / internal fields). */
export function serializeForRenderer(data: any): Record<string, any> {
  const result: Record<string, any> = {
    _fileType: data._fileType || 'charx',
    name: data.name,
    description: data.description,
    firstMessage: data.firstMessage,
    triggerScripts: deps.stringifyTriggerScripts(data.triggerScripts),
    alternateGreetings: data.alternateGreetings || [],
    groupOnlyGreetings: data.groupOnlyGreetings || [],
    globalNote: data.globalNote,
    css: data.css,
    defaultVariables: data.defaultVariables,
    lua: data.lua,
    lorebook: data.lorebook,
    regex: data.regex,
    moduleName: data.moduleName,
  };
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
  return result;
}

/** Apply field updates with validation; keeps triggerScripts ↔ lua in sync. */
export function applyUpdates(data: any, fields: any): void {
  if (!fields) return;
  const allowed = [
    'name', 'description', 'firstMessage', 'alternateGreetings', 'groupOnlyGreetings',
    'globalNote', 'css', 'defaultVariables', 'triggerScripts', 'lua', 'lorebook', 'regex',
  ];
  // Risum module-specific fields (always safe to allow — no-ops on charx)
  const risumAllowed = [
    'moduleName', 'moduleDescription', 'cjs', 'lowLevelAccess', 'hideIcon',
    'backgroundEmbedding', 'moduleNamespace', 'customModuleToggle', 'mcpUrl',
  ];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      if (key === 'triggerScripts') {
        data.triggerScripts = deps.normalizeTriggerScripts(fields.triggerScripts);
        data.lua = deps.extractPrimaryLuaFromTriggerScripts(data.triggerScripts);
        continue;
      }
      data[key] = fields[key];
      if (key === 'lua') {
        data.triggerScripts = deps.mergePrimaryLuaIntoTriggerScripts(data.triggerScripts, data.lua);
      }
    }
  }
  for (const key of risumAllowed) {
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
