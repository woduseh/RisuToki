// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createPersonaStore } from './persona-store';

function makeStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-persona-store-'));
  const bundledDir = path.join(root, 'bundled');
  const userDir = path.join(root, 'user');
  fs.mkdirSync(bundledDir, { recursive: true });
  return { bundledDir, userDir, store: createPersonaStore(bundledDir, userDir) };
}

describe('persona store', () => {
  it('lists the union of bundled and user personas with user overrides', async () => {
    const { bundledDir, userDir, store } = makeStore();
    fs.writeFileSync(path.join(bundledDir, 'Toki.txt'), 'bundled');
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'Toki.txt'), 'custom');
    fs.writeFileSync(path.join(userDir, 'Aris.txt'), 'user');

    expect(await store.list()).toEqual(['Aris', 'Toki']);
    expect(await store.read('Toki')).toBe('custom');
  });

  it('falls back to bundled content and writes only to the user directory', async () => {
    const { bundledDir, userDir, store } = makeStore();
    fs.writeFileSync(path.join(bundledDir, 'Toki.txt'), 'bundled');

    expect(await store.read('Toki')).toBe('bundled');
    expect(await store.write('Toki', 'customized')).toBe(true);
    expect(fs.readFileSync(path.join(bundledDir, 'Toki.txt'), 'utf-8')).toBe('bundled');
    expect(fs.readFileSync(path.join(userDir, 'Toki.txt'), 'utf-8')).toBe('customized');
  });

  it('rejects invalid persona names', async () => {
    const { store } = makeStore();
    expect(await store.read('../Toki')).toBeNull();
    expect(await store.write('../Toki', 'bad')).toBe(false);
    expect(await store.write('   ', 'bad')).toBe(false);
    expect(await store.write(' Toki ', 'bad')).toBe(false);
  });
});
