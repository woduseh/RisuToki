/**
 * Shared by dispatch and the mutation snapshot policy. Only verified read-only
 * POST endpoints belong here; writes and body-dependent dry runs stay guarded.
 * The prefix matches for legacy batch routes preserve their existing dispatch.
 */
export function getStructuredReadRoute(method: string | undefined, parts: readonly string[]) {
  if (method !== 'POST') return null;
  const [family, action, detail] = parts;
  if (family === 'external' && action === 'assets' && detail === 'read' && !parts[3]) return 'external-assets-read';
  if (family === 'surface' && action === 'read' && !detail) return 'surface-read';
  if (family === 'lorebook') {
    if (action === 'batch') return 'lorebook-batch';
    if (action === 'diff') return 'lorebook-diff';
  }
  if (family === 'regex' && action === 'batch') return 'regex-batch';
  if (family === 'lua' && action === 'batch') return 'lua-batch';
  if (family === 'css-section' && action === 'batch') return 'css-batch';
  if (family === 'trigger' && action === 'batch' && !detail) return 'trigger-batch';
  if (family === 'greeting' && action && detail === 'batch' && !parts[3]) return 'greeting-batch';
  if (family === 'risup') {
    if (action === 'prompt-item' && detail === 'batch' && !parts[3]) return 'risup-prompt-batch';
    if (action === 'prompt-items' && detail === 'search' && !parts[3]) return 'risup-prompt-search';
    if (action === 'prompt-diff' && !detail) return 'risup-prompt-diff';
  }
  if (family === 'cbs' && !detail) {
    if (action === 'simulate') return 'cbs-simulate';
    if (action === 'diff') return 'cbs-diff';
  }
  return null;
}
