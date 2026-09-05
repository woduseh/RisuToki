import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFileAtomicSync, writePathAtomicSync } from './atomic-write';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-atomic-write-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
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

  it('flushes and closes the temporary file before replacing the target', () => {
    const target = path.join(makeTempDir(), 'state.json');
    const flush = vi.spyOn(fs, 'fsyncSync');
    const close = vi.spyOn(fs, 'closeSync');
    const rename = vi.spyOn(fs, 'renameSync');

    writeFileAtomicSync(target, 'new', { flush: true, encoding: 'utf16le' });

    expect(flush).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledWith(flush.mock.calls[0][0]);
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(rename.mock.invocationCallOrder[0]);
    expect(fs.readFileSync(target, 'utf16le')).toBe('new');
  });

  it.each(['writeFileSync', 'fsyncSync', 'renameSync'] as const)(
    'preserves the original file and error when %s fails',
    (operation) => {
      const dir = makeTempDir();
      const target = path.join(dir, 'state.json');
      fs.writeFileSync(target, 'old');
      const failure = new Error(`${operation} failed`);
      vi.spyOn(fs, operation).mockImplementationOnce(() => {
        throw failure;
      });

      expect(() => writeFileAtomicSync(target, 'new', { flush: true })).toThrow(failure);
      expect(fs.readFileSync(target, 'utf8')).toBe('old');
      expect(fs.readdirSync(dir)).toEqual(['state.json']);
    },
  );

  it('preserves the write error even if closing and removing the temporary file also fail', () => {
    const target = path.join(makeTempDir(), 'state.json');
    fs.writeFileSync(target, 'old');
    const failure = new Error('write failed');
    const close = fs.closeSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw failure;
    });
    vi.spyOn(fs, 'closeSync').mockImplementationOnce((fd) => {
      close(fd);
      throw new Error('close failed');
    });
    vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
      throw new Error('cleanup failed');
    });

    expect(() => writeFileAtomicSync(target, 'new')).toThrow(failure);
    expect(fs.readFileSync(target, 'utf8')).toBe('old');
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
