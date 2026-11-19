import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';

const binaryDigests = new WeakMap<ArrayBufferView, { crc: number; digest: Buffer }>();

function binaryDigest(view: ArrayBufferView): Buffer {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const crc = crc32(bytes);
  const cached = binaryDigests.get(view);
  if (cached?.crc === crc) return cached.digest;
  const digest = createHash('sha256').update(bytes).digest();
  binaryDigests.set(view, { crc, digest });
  return digest;
}

function replaceBinaryViews(value: unknown, replace: (view: ArrayBufferView) => unknown): unknown {
  if (ArrayBuffer.isView(value)) return replace(value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    let copy: unknown[] | undefined;
    for (let i = 0; i < value.length; i++) {
      const next = replaceBinaryViews(value[i], replace);
      if (next !== value[i]) (copy ??= value.slice())[i] = next;
    }
    return copy ?? value;
  }
  let copy: Record<string, unknown> | undefined;
  for (const [key, child] of Object.entries(value)) {
    const next = replaceBinaryViews(child, replace);
    if (next !== child) (copy ??= { ...value })[key] = next;
  }
  return copy ?? value;
}

/** Order-sensitive snapshot digest of document JSON; binary views contribute their length and content digest. */
export function hashDocumentSnapshot(value: unknown): string {
  const json = replaceBinaryViews(value, (view) => `binary:${view.byteLength}:${binaryDigest(view).toString('hex')}`);
  return createHash('sha256')
    .update(JSON.stringify(json) ?? 'undefined')
    .digest('hex');
}

/** JSON-safe view of a surface value: binary views become their size and SHA-256 instead of byte arrays. */
export function describeBinaryViews(value: unknown): unknown {
  return replaceBinaryViews(value, (view) => ({
    binary: true,
    byteLength: view.byteLength,
    sha256: binaryDigest(view).toString('hex'),
  }));
}

function isBinaryDescriptor(value: unknown): value is { binary: true; byteLength: number; sha256: string } {
  const record = value as Record<string, unknown> | null;
  return (
    !!record &&
    typeof record === 'object' &&
    record.binary === true &&
    typeof record.byteLength === 'number' &&
    typeof record.sha256 === 'string'
  );
}

/**
 * Replace binary descriptors returned by surface reads with the matching binary views of `source`, so a read value
 * can be patched back. Throws when a descriptor matches no binary in `source`.
 */
export function restoreBinaryViews(value: unknown, source: unknown): unknown {
  let known: Map<string, ArrayBufferView> | undefined;
  const restore = (item: unknown): unknown => {
    if (isBinaryDescriptor(item)) {
      if (!known) {
        const views = new Map<string, ArrayBufferView>();
        replaceBinaryViews(source, (view) => views.set(binaryDigest(view).toString('hex'), view) && view);
        known = views;
      }
      const view = known.get(item.sha256);
      if (!view || view.byteLength !== item.byteLength) {
        throw new Error(
          `Binary value ${item.sha256} is not in the current document. Read the surface again or add the bytes through manage_assets.`,
        );
      }
      return view;
    }
    if (Array.isArray(item)) return item.map(restore);
    if (!item || typeof item !== 'object' || ArrayBuffer.isView(item)) return item;
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, restore(child)]));
  };
  return restore(value);
}

/**
 * Key-order independent surface fingerprint, streamed without building a document-sized string. JSON values
 * keep the canonical sorted-key text; binary views are framed by length and content digest, and count their
 * byte length toward `byteSize`.
 */
export function fingerprintSurface(value: unknown): { hash: string; byteSize: number } {
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
    if (ArrayBuffer.isView(item)) {
      // The unquoted type/length frame cannot collide with a JSON object or string.
      write(`binary:${item.byteLength}:`);
      flush();
      hash.update(binaryDigest(item));
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
