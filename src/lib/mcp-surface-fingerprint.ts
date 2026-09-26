import { createHash } from 'node:crypto';

/** Stream the existing canonical surface format without building a document-sized string. */
export function fingerprintSurface(value: unknown): { hash: string; byteSize: number } {
  return fingerprint(value, false);
}

/** Internal document binding: binary views are hashed as framed raw bytes, never JSON byte keys. */
export function hashDocumentState(value: unknown): string {
  return fingerprint(value, true).hash;
}

function fingerprint(value: unknown, binaryAware: boolean): { hash: string; byteSize: number } {
  const hash = createHash('sha256');
  const pending: string[] = [];
  let pendingChars = 0;
  let byteSize = 0;
  function flush(): void {
    if (!pending.length) return;
    const text = pending.join('');
    hash.update(text);
    byteSize += Buffer.byteLength(text);
    pending.length = 0;
    pendingChars = 0;
  }
  function write(text: string): void {
    pending.push(text);
    pendingChars += text.length;
    if (pendingChars >= 16 * 1024) flush();
  }
  function visit(item: unknown): void {
    if (binaryAware && ArrayBuffer.isView(item)) {
      // The unquoted type/length frame cannot collide with a JSON object or string.
      write(`binary:${item.byteLength}:`);
      flush();
      hash.update(new Uint8Array(item.buffer, item.byteOffset, item.byteLength));
      byteSize += item.byteLength;
      return;
    }
    if (Array.isArray(item)) {
      write('[');
      for (let i = 0; i < item.length; i++) {
        if (i) write(',');
        // Array#map + join in the legacy format leaves holes empty.
        if (i in item) visit(item[i]);
      }
      write(']');
    } else if (item && typeof item === 'object') {
      write('{');
      const record = item as Record<string, unknown>;
      Object.keys(record)
        .sort()
        .forEach((key, i) => {
          if (i) write(',');
          write(`${JSON.stringify(key)}:`);
          visit(record[key]);
        });
      write('}');
    } else write(JSON.stringify(item) ?? 'undefined');
  }
  visit(value);
  flush();
  return { hash: hash.digest('hex'), byteSize };
}
