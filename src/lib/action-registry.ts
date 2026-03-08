/**
 * Centralized action registry — bridges imperative controller actions
 * with the reactive Vue menu/UI system.
 *
 * Controller.ts registers handlers; App.vue dispatches by action name.
 */

const actionMap: Record<string, () => void> = {};

export function registerActions(handlers: Record<string, () => void>): void {
  Object.assign(actionMap, handlers);
}

export function executeAction(name: string): boolean {
  const handler = actionMap[name];
  if (handler) {
    handler();
    return true;
  }
  return false;
}
