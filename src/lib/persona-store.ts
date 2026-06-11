import * as fs from 'fs';
import * as path from 'path';

export interface PersonaStore {
  read(name: string): Promise<string | null>;
  write(name: string, content: string): Promise<boolean>;
  list(): Promise<string[]>;
}

export function isValidPersonaName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length <= 128 &&
    name.trim() === name &&
    name.length > 0 &&
    /^[a-zA-Z0-9가-힣_\- ]+$/.test(name)
  );
}

async function readPersonaFile(dir: string, name: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(path.join(dir, `${name}.txt`), 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function listPersonaNames(dir: string): Promise<string[]> {
  try {
    const files = await fs.promises.readdir(dir);
    return files
      .filter((file) => file.endsWith('.txt'))
      .map((file) => file.slice(0, -4))
      .filter(isValidPersonaName);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function createPersonaStore(bundledDir: string, userDir: string): PersonaStore {
  return {
    async read(name: string): Promise<string | null> {
      if (!isValidPersonaName(name)) return null;
      return (await readPersonaFile(userDir, name)) ?? readPersonaFile(bundledDir, name);
    },

    async write(name: string, content: string): Promise<boolean> {
      if (!isValidPersonaName(name) || typeof content !== 'string') return false;
      await fs.promises.mkdir(userDir, { recursive: true });
      await fs.promises.writeFile(path.join(userDir, `${name}.txt`), content, 'utf-8');
      return true;
    },

    async list(): Promise<string[]> {
      const [bundled, user] = await Promise.all([listPersonaNames(bundledDir), listPersonaNames(userDir)]);
      return [...new Set([...bundled, ...user])].sort((a, b) => a.localeCompare(b));
    },
  };
}
