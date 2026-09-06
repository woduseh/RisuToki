export interface LiteralAssetReference {
  name: string;
  offset: number;
  kind: 'cbs' | 'html';
}

/** Conservative literal inspection; nested CBS names are never evaluated. */
export function collectLiteralAssetReferences(
  text: string,
  options: { includeHtml?: boolean; maxReferences?: number } = {},
): LiteralAssetReference[] {
  const references: LiteralAssetReference[] = [];
  const limit = Math.max(1, Math.min(5000, options.maxReferences ?? 5000));
  let cursor = 0;
  while (cursor < text.length && references.length < limit) {
    const start = text.indexOf('{{', cursor);
    if (start < 0) break;
    let depth = 1;
    let nested = false;
    cursor = start + 2;
    while (cursor < text.length && depth > 0) {
      if (text.startsWith('{{', cursor)) {
        depth++;
        nested = true;
        cursor += 2;
      } else if (text.startsWith('}}', cursor)) {
        depth--;
        cursor += 2;
      } else cursor++;
    }
    if (depth) break;
    if (nested) continue;
    const match = /^\{\{(?:asset|raw|path|emotion|bg|bgm|videoimg|inlay|inlayed|inlayeddata)::([^{}\r\n]+)\}\}$/i.exec(
      text.slice(start, cursor),
    );
    const name = match?.[1].trim();
    if (name && !name.includes('::')) references.push({ name, offset: start, kind: 'cbs' });
  }
  if (options.includeHtml && references.length < limit) {
    for (const tag of text.matchAll(/<(?:img|audio|video|source)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
      for (const attribute of tag[0].matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        if (attribute[1].toLowerCase() !== 'src') continue;
        const name = (attribute[2] ?? attribute[3]).trim();
        if (!name || /[{}\r\n]/.test(name) || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(name)) continue;
        references.push({ name, offset: tag.index! + attribute.index!, kind: 'html' });
        break;
      }
      if (references.length >= limit) break;
    }
  }
  return references.sort((a, b) => a.offset - b.offset);
}
