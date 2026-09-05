import fs from 'node:fs';
import path from 'node:path';

export interface AtomicWriteOptions {
  encoding?: BufferEncoding;
  flush?: boolean;
}

function buildTempPath(filePath: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const nonce = Math.random().toString(16).slice(2);
  return path.join(dir, `.${base}.${process.pid}.${Date.now()}.${nonce}.tmp`);
}

export function writeFileAtomicSync(
  filePath: string,
  data: string | NodeJS.ArrayBufferView,
  options: AtomicWriteOptions = {},
): void {
  writePathAtomicSync(filePath, (tempPath) => {
    const fd = fs.openSync(tempPath, 'w');
    try {
      fs.writeFileSync(fd, data, { encoding: options.encoding ?? 'utf8' });
      if (options.flush) fs.fsyncSync(fd);
      fs.closeSync(fd);
    } catch (error) {
      try {
        fs.closeSync(fd);
      } catch {
        // Preserve the original write/flush/close error.
      }
      throw error;
    }
  });
}

export function writePathAtomicSync(filePath: string, writeTempPath: (tempPath: string) => void): void {
  const tempPath = buildTempPath(filePath);

  try {
    writeTempPath(tempPath);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup only; callers need the original write/rename error.
    }
    throw error;
  }
}
