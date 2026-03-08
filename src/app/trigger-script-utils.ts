/**
 * Pure utility functions for manipulating trigger script JSON text.
 * These operate on serialized JSON strings (as stored in fileData.triggerScripts).
 */

/**
 * Extract the primary Lua code from a trigger scripts JSON string.
 * Returns the code of the first `triggerlua` effect, or `null` if parsing fails.
 */
export function tryExtractPrimaryLuaFromTriggerScriptsText(value: string): string | null {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    for (const trigger of parsed) {
      const effects = Array.isArray(trigger?.effect) ? trigger.effect : [];
      for (const effect of effects) {
        if (
          effect &&
          typeof effect.code === 'string' &&
          (effect.type === 'triggerlua' || typeof effect.type !== 'string')
        ) {
          return effect.code;
        }
      }
    }
    return '';
  } catch {
    return null;
  }
}

/**
 * Merge updated Lua code into a trigger scripts JSON string.
 * Replaces the first `triggerlua` effect's code, or prepends a new trigger entry.
 */
export function mergeLuaIntoTriggerScriptsText(triggerScriptsText: string, lua: string): string {
  if (typeof lua !== 'string' || !lua) {
    return triggerScriptsText;
  }

  try {
    const parsed = JSON.parse(triggerScriptsText || '[]');
    if (!Array.isArray(parsed)) return triggerScriptsText;

    for (const trigger of parsed) {
      const effects = Array.isArray(trigger?.effect) ? trigger.effect : [];
      for (const effect of effects) {
        if (effect && (effect.type === 'triggerlua' || typeof effect.code === 'string')) {
          effect.type = effect.type || 'triggerlua';
          effect.code = lua;
          return JSON.stringify(parsed, null, 2);
        }
      }
    }

    parsed.unshift({
      comment: '',
      type: 'start',
      conditions: [],
      effect: [{ type: 'triggerlua', code: lua }],
      lowLevelAccess: false,
    });
    return JSON.stringify(parsed, null, 2);
  } catch {
    return triggerScriptsText;
  }
}
