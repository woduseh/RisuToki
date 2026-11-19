// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fingerprintSurface, hashDocumentSnapshot } from './mcp-surface-fingerprint';
import { hashSurface } from './mcp-api-helpers';
import { closeServer, createSearchFixture, getJson, postJson, startTestApiServer } from './mcp-api-test-harness';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

describe('surface fingerprints and document bindings', () => {
  it('keeps the canonical JSON text and hash for non-binary values, including Unicode, undefined and sparse arrays', () => {
    const values = [
      undefined,
      null,
      false,
      NaN,
      -0,
      '한국🌸日本',
      { z: undefined, a: [1, null] },
      new Array(3),
      [undefined],
      new Date(0),
    ];
    for (const value of values) {
      const text = canonical(value);
      expect(fingerprintSurface(value)).toEqual({
        hash: createHash('sha256').update(text).digest('hex'),
        byteSize: Buffer.byteLength(text),
      });
      expect(hashSurface(value)).toBe(fingerprintSurface(value).hash);
    }
  });

  it('frames binary views by length and content digest without enumerating bytes', () => {
    const image = Buffer.alloc(64 * 1024, 42);
    const keys = vi.spyOn(Object, 'keys');
    const surface = fingerprintSurface({ assets: [{ path: 'image.png', data: image }] });
    expect(keys.mock.calls.some(([value]) => ArrayBuffer.isView(value))).toBe(false);
    keys.mockRestore();
    const prefix = `{"assets":[{"data":binary:${image.length}:`;
    const suffix = ',"path":"image.png"}]}';
    const expected = createHash('sha256')
      .update(prefix)
      .update(createHash('sha256').update(image).digest())
      .update(suffix)
      .digest('hex');
    expect(surface).toEqual({ hash: expected, byteSize: prefix.length + image.length + suffix.length });
    expect(fingerprintSurface(new Uint8Array([4, 5])).byteSize).toBe('binary:2:'.length + 2);
  });

  it('detects in-place bytes, paths and ordering while ignoring key order', () => {
    const source = Buffer.from([9, 1, 2, 9]);
    const view = source.subarray(1, 3);
    const data = {
      assets: [
        { path: 'a', data: view },
        { path: 'b', data: Buffer.from([3]) },
      ],
    };
    const first = hashSurface(data);
    source[0] = 0; // outside the visible bytes
    expect(hashSurface(data)).toBe(first);
    source[1] = 5;
    expect(hashSurface(data)).not.toBe(first);
    source[1] = 1;
    expect(hashSurface(data)).toBe(first);
    data.assets[0].path = 'c';
    expect(hashSurface(data)).not.toBe(first);
    data.assets[0].path = 'a';
    data.assets.reverse();
    expect(hashSurface(data)).not.toBe(first);
    expect(hashSurface({ b: 2, a: 1 })).toBe(hashSurface({ a: 1, b: 2 }));
    expect(hashSurface(Buffer.from([1]))).not.toBe(hashSurface('binary:1:\u0001'));
  });

  it('snapshots order-sensitively and detects in-place binary edits', () => {
    const bytes = Buffer.from([1, 2, 3]);
    const first = hashDocumentSnapshot({ a: 1, b: bytes });
    expect(hashDocumentSnapshot({ a: 1, b: bytes })).toBe(first);
    expect(hashDocumentSnapshot({ b: bytes, a: 1 })).not.toBe(first);
    bytes[2] = 4;
    expect(hashDocumentSnapshot({ a: 1, b: bytes })).not.toBe(first);
  });

  it('snapshots content, not the engine representation of arrays', () => {
    const greetings = ['first', 'third'];
    const data = { greetings };
    const first = hashDocumentSnapshot(data);
    greetings[1_000_000] = 'temporary';
    greetings.length = 2;
    expect(hashDocumentSnapshot(data)).toBe(first);
  });

  it('serves a compact binding without session/inventory work and detects a later binary edit', async () => {
    const data = createSearchFixture();
    const bytes = Buffer.alloc(1024 * 1024, 42);
    data.assets = [{ path: 'assets/image.png', data: bytes }];
    const getSessionStatus = vi.fn(() => null as never);
    const api = await startTestApiServer(data, [], undefined, { getSessionStatus });
    getSessionStatus.mockClear();
    try {
      const first = await getJson<{ document_hash: string }>(api.port, api.token, '/document/binding');
      expect(first.status).toBe(200);
      expect(Buffer.byteLength(JSON.stringify(first.data))).toBeLessThan(160);
      expect(getSessionStatus).not.toHaveBeenCalled();
      bytes[0] = 43;
      const changed = await getJson<{ document_hash: string }>(api.port, api.token, '/document/binding');
      expect(changed.data.document_hash).not.toBe(first.data.document_hash);
      const read = await postJson<{ value: string }>(api.port, api.token, '/surface/read', { path: '/description' });
      expect(read.status).toBe(200);
      expect(read.data.value).toBe(data.description);
      const assets = await postJson<{ value: unknown; byteSize: number }>(api.port, api.token, '/surface/read', {
        path: '/assets',
      });
      expect(assets.data.value).toEqual([
        {
          path: 'assets/image.png',
          data: { binary: true, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
        },
      ]);
      expect(assets.data.byteSize).toBeGreaterThan(bytes.length);

      const restored = await postJson(api.port, api.token, '/surface/patch', {
        operations: [{ op: 'replace', path: '/assets', value: assets.data.value }],
      });
      expect(restored.status).toBe(200);
      expect(bytes.equals((data.assets as Array<{ data: Buffer }>)[0].data)).toBe(true);
      const unknown = await postJson<{ error: string }>(api.port, api.token, '/surface/patch', {
        operations: [
          {
            op: 'replace',
            path: '/assets/0/data',
            value: { binary: true, byteLength: 1, sha256: '0'.repeat(64) },
          },
        ],
      });
      expect(unknown.status).toBe(400);
      expect(unknown.data.error).toContain('not in the current document');
      expect(bytes.equals((data.assets as Array<{ data: Buffer }>)[0].data)).toBe(true);
    } finally {
      await closeServer(api.server);
    }
  });
});
