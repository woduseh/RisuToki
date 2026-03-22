/**
 * CBS Extractor
 *
 * Recursively traverses JSON to find all string fields containing
 * CBS (Conditional Block Syntax) patterns like {{#when::...}} or {{getglobalvar::...}}.
 *
 * Ported from risucbs/lib/extractor.mjs — pure functions, no external deps.
 */

/* ── Types ──────────────────────────────────────────────── */

export interface CBSEntry {
  path: string;
  text: string;
  meta: Record<string, string | number | boolean>;
}

/* ── Extraction ─────────────────────────────────────────── */

export function extractCBSEntries(json: unknown): CBSEntry[] {
  const results: CBSEntry[] = [];

  function traverse(node: unknown, currentPath: string): void {
    if (node === null || node === undefined) {
      return;
    }

    if (typeof node === 'string') {
      if (node.includes('{{#when') || node.includes('{{getglobalvar')) {
        results.push({
          path: currentPath || 'root',
          text: node,
          meta: {},
        });
      }
      return;
    }

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const newPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
        traverse(node[i], newPath);
      }
      return;
    }

    if (typeof node === 'object') {
      const meta: Record<string, string | number | boolean> = {};
      for (const key in node as Record<string, unknown>) {
        if (Object.prototype.hasOwnProperty.call(node, key)) {
          const val = (node as Record<string, unknown>)[key];
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            // Exclude strings that contain CBS patterns from metadata
            if (typeof val === 'string' && (val.includes('{{#when') || val.includes('{{getglobalvar'))) {
              continue;
            }
            meta[key] = val;
          }
        }
      }

      for (const key in node as Record<string, unknown>) {
        if (Object.prototype.hasOwnProperty.call(node, key)) {
          const val = (node as Record<string, unknown>)[key];
          const newPath = currentPath ? `${currentPath}.${key}` : key;
          if (typeof val === 'string') {
            if (val.includes('{{#when') || val.includes('{{getglobalvar')) {
              results.push({
                path: newPath,
                text: val,
                meta: { ...meta },
              });
            }
          } else if (typeof val === 'object' && val !== null) {
            traverse(val, newPath);
          }
        }
      }
    }
  }

  traverse(json, '');
  return results;
}

/* ── JPath Filter ───────────────────────────────────────── */

export function filterByJPath(entries: CBSEntry[], pattern: string | undefined): CBSEntry[] {
  if (!pattern) return entries;

  let escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  escaped = escaped.replace(/\*\*/g, '___DOUBLE_STAR___');
  escaped = escaped.replace(/\*/g, '___SINGLE_STAR___');

  escaped = escaped.replace(/___DOUBLE_STAR___/g, '.*');
  escaped = escaped.replace(/___SINGLE_STAR___/g, '[^.\\[\\]]+');

  const regex = new RegExp(`^${escaped}$`);
  return entries.filter((entry) => regex.test(entry.path));
}
