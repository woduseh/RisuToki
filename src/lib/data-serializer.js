"use strict";
// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDataSerializer = initDataSerializer;
exports.serializeForRenderer = serializeForRenderer;
exports.applyUpdates = applyUpdates;
// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let deps;
// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
function initDataSerializer(d) {
    deps = d;
}
// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------
/** Filter data for safe transfer to renderer (strips binary assets / internal fields). */
function serializeForRenderer(data) {
    return {
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
}
/** Apply field updates with validation; keeps triggerScripts ↔ lua in sync. */
function applyUpdates(data, fields) {
    if (!fields)
        return;
    const allowed = [
        'name', 'description', 'firstMessage', 'alternateGreetings', 'groupOnlyGreetings',
        'globalNote', 'css', 'defaultVariables', 'triggerScripts', 'lua', 'lorebook', 'regex',
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
    // CSS 필드에 <style> 태그가 없으면 강제로 감싸기
    if (fields.css !== undefined && data.css && data.css.trim()) {
        if (!/<style[\s>]/i.test(data.css)) {
            data.css = '<style>\n' + data.css + '\n</style>';
        }
    }
}
