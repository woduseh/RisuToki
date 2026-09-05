import { createHash } from 'node:crypto';

/** Bind a continuation to the exact text and source, including equal-text document switches. */
export function fieldRangeFingerprint(content: string, source: string | null | undefined, field: string): string {
  return createHash('sha256')
    .update(JSON.stringify([source, field, content]))
    .digest('hex');
}

/** UTF-16 offsets match search results; never return half of a surrogate pair. */
export function safeFieldRange(content: string, offset: number, length: number) {
  let start = Math.min(offset, content.length);
  if (start > 0 && /[\uDC00-\uDFFF]/.test(content[start] ?? '') && /[\uD800-\uDBFF]/.test(content[start - 1]))
    start -= 1;
  let end = Math.min(content.length, start + length);
  if (end < content.length && /[\uD800-\uDBFF]/.test(content[end - 1] ?? '') && /[\uDC00-\uDFFF]/.test(content[end])) {
    end = end - 1 === start ? end + 1 : end - 1;
  }
  return { offset: start, content: content.slice(start, end) };
}
