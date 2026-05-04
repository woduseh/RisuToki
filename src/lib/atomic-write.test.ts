import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFileAtomicSync, writePathAtomicSync } from './atomic-write';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-atomic-write-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('writeFileAtomicSync', () => {
  it('writes data through a same-directory temp file and renames into place', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'state.json');

    writeFileAtomicSync(target, '{"ok":true}');

    expect(fs.readFileSync(target, 'utf8')).toBe('{"ok":true}');
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('replaces an existing file', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'state.json');
    fs.writeFileSync(target, 'old');

    writeFileAtomicSync(target, 'new');

    expect(fs.readFileSync(target, 'utf8')).toBe('new');
  });

  it('cleans up temp files when the write cannot be completed', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'missing', 'state.json');

    expect(() => writeFileAtomicSync(target, 'data')).toThrow();
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

describe('writePathAtomicSync', () => {
  it('lets path-based writers write through a same-directory temp file', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'archive.charx');

    writePathAtomicSync(target, (tempPath) => {
      expect(path.dirname(tempPath)).toBe(dir);
      expect(path.basename(tempPath)).toContain('.archive.charx.');
      fs.writeFileSync(tempPath, 'zip-bytes');
    });

    expect(fs.readFileSync(target, 'utf8')).toBe('zip-bytes');
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('preserves the existing target and cleans up temp files if the writer fails', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'archive.charx');
    fs.writeFileSync(target, 'old');

    expect(() =>
      writePathAtomicSync(target, (tempPath) => {
        fs.writeFileSync(tempPath, 'partial');
        throw new Error('write failed');
      }),
    ).toThrow('write failed');

    expect(fs.readFileSync(target, 'utf8')).toBe('old');
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
