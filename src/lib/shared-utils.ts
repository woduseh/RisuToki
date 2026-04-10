// Shared low-level helpers used across multiple modules.
// Centralises clone, MIME, and text-normalization atoms so call-sites
// can import from one place instead of redefining locally.

// ---------------------------------------------------------------------------
// JSON type helpers
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Clone helpers
// ---------------------------------------------------------------------------

/** Deep-clone any JSON-serialisable value via JSON round-trip. */
export function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Deep-clone a value that is expected to be a plain record.
 * Returns `{}` when the input is not a record.
 */
export function cloneRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) return {};
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

// ---------------------------------------------------------------------------
// MIME helpers
// ---------------------------------------------------------------------------

/** Superset extension→MIME map covering image, audio, video, font, and text types. */
export const MIME_MAP: Readonly<Record<string, string>> = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  css: 'text/css',
});

/** Map a file extension (without leading dot) to its MIME type. */
export function extToMime(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

/** Normalise CRLF and bare CR to LF. Fast-paths when no CR is present. */
export function normalizeLF(s: string): string {
  return s.indexOf('\r') >= 0 ? s.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : s;
}
