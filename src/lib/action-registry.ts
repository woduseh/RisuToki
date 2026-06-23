/**
 * Centralized action registry — bridges imperative controller actions
 * with the reactive Vue menu/UI system.
 *
 * Controller.ts registers handlers; App.vue dispatches by action name.
 */

export type ActionPayload = unknown;
export type ActionHandler = (payload?: ActionPayload) => void;

const actionMap: Record<string, ActionHandler> = {};

export function registerActions(handlers: Record<string, ActionHandler>): void {
  Object.assign(actionMap, handlers);
}

export function executeAction(name: string, payload?: ActionPayload): boolean {
  const handler = actionMap[name];
  if (handler) {
    handler(payload);
    return true;
  }
  return false;
}
