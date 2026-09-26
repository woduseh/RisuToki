// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { hashDocumentState, fingerprintSurface } from './mcp-surface-fingerprint';
import { hashSurface, stableJson } from './mcp-api-helpers';
import { closeServer, createSearchFixture, getJson, postJson, startTestApiServer } from './mcp-api-test-harness';

function legacy(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(legacy).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${legacy(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

describe('surface hash compatibility and private document bindings', () => {
  it('retains the public canonical bytes and hashes, including binary, Unicode, undefined and sparse arrays', () => {
    const bytes = Object.assign(Buffer.from([0, 1, 255]), { note: 'extra' });
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
      bytes,
      new Uint8Array([4, 5]),
      { assets: [{ path: 'image.png', data: Buffer.alloc(64 * 1024, 42) }] },
    ];
    for (const value of values) {
      const text = legacy(value);
      expect(stableJson(value)).toBe(text);
      expect(fingerprintSurface(value)).toEqual({
        hash: createHash('sha256').update(text).digest('hex'),
        byteSize: Buffer.byteLength(text),
      });
      expect(hashSurface(value)).toBe(fingerprintSurface(value).hash);
    }
  });

  it('hashes the exact binary view without enumeration and detects in-place bytes, paths and ordering', () => {
    const source = Buffer.from([9, 1, 2, 9]);
    const view = source.subarray(1, 3);
    const data = {
      assets: [
        { path: 'a', data: view },
        { path: 'b', data: Buffer.from([3]) },
      ],
    };
    const keys = vi.spyOn(Object, 'keys');
    const first = hashDocumentState(data);
    expect(keys.mock.calls.some(([value]) => ArrayBuffer.isView(value))).toBe(false);
    keys.mockRestore();
    source[0] = 0; // outside the visible bytes
    expect(hashDocumentState(data)).toBe(first);
    source[1] = 5;
    expect(hashDocumentState(data)).not.toBe(first);
    source[1] = 1;
    data.assets[0].path = 'c';
    expect(hashDocumentState(data)).not.toBe(first);
    data.assets[0].path = 'a';
    data.assets.reverse();
    expect(hashDocumentState(data)).not.toBe(first);
    expect(hashDocumentState({ b: 2, a: 1 })).toBe(hashDocumentState({ a: 1, b: 2 }));
    expect(hashDocumentState(Buffer.from([1]))).not.toBe(hashDocumentState('binary:1:\u0001'));
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
    } finally {
      await closeServer(api.server);
    }
  });
});
