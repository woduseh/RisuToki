/**
 * Pure utility functions for manipulating trigger script JSON text.
 * These operate on serialized JSON strings (as stored in fileData.triggerScripts).
 */

export {
  mergeLuaIntoTriggerScriptsText,
  tryExtractPrimaryLuaFromTriggerScriptsText,
} from '../lib/trigger-script-model';
