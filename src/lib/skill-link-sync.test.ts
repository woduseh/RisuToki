import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureProjectSkillLinks, getProjectSkillLinkSpecs } from './skill-link-sync';

const tempRoots: string[] = [];

function makeProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-skill-links-'));
  tempRoots.push(root);

  fs.mkdirSync(path.join(root, 'skills', 'authoring-characters'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'authoring-characters', 'SKILL.md'), '# skill placeholder\n', 'utf8');

  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(root, '.gemini'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });

  return root;
}

function makeProjectRootWithoutSkills() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-skill-links-missing-'));
  tempRoots.push(root);

  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(root, '.gemini'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github'), { recursive: true });

  return root;
}

function createDirectoryLink(linkPath: string, sourcePath: string, platform: NodeJS.Platform | string) {
  const relativeTarget = path.relative(path.dirname(linkPath), sourcePath);

  if (platform === 'win32') {
    try {
      fs.symlinkSync(relativeTarget, linkPath, 'dir');
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EACCES' && code !== 'EPERM' && code !== 'UNKNOWN') {
        throw error;
      }
    }

    fs.symlinkSync(sourcePath, linkPath, 'junction');
    return;
  }

  fs.symlinkSync(relativeTarget, linkPath, 'dir');
}

function canCreateWindowsDirectorySymlink() {
  if (process.platform !== 'win32') {
    return false;
  }

  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-symlink-probe-'));
  tempRoots.push(probeRoot);

  const targetDir = path.join(probeRoot, 'skills');
  const linkPath = path.join(probeRoot, '.claude', 'skills');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  try {
    fs.symlinkSync('..\\skills', linkPath, 'dir');
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const windowsSymlinkIt = canCreateWindowsDirectorySymlink() ? it : it.skip;

describe('skill link sync', () => {
  it('skips link creation when the root skills directory is missing', () => {
    const root = makeProjectRootWithoutSkills();

    expect(ensureProjectSkillLinks(root, { platform: process.platform })).toEqual([]);
  });

  it('replaces git placeholder files with real directory links', () => {
    const root = makeProjectRoot();
    const specs = getProjectSkillLinkSpecs(root);

    fs.writeFileSync(specs[0].linkPath, '../skills', 'utf8');
    fs.writeFileSync(specs[1].linkPath, '..\\skills\n', 'utf8');
    fs.writeFileSync(specs[2].linkPath, '../skills\n', 'utf8');

    const results = ensureProjectSkillLinks(root, { platform: 'win32' });

    expect(results.map((result) => result.status)).toEqual(['repaired', 'repaired', 'repaired']);

    for (const spec of specs) {
      expect(fs.lstatSync(spec.linkPath).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync.native(spec.linkPath)).toBe(fs.realpathSync.native(spec.sourcePath));
    }
  });

  it('keeps already-correct links unchanged', () => {
    const root = makeProjectRoot();
    const specs = getProjectSkillLinkSpecs(root);

    for (const spec of specs) {
      createDirectoryLink(spec.linkPath, spec.sourcePath, process.platform);
    }

    const results = ensureProjectSkillLinks(root, { platform: process.platform });

    expect(results.map((result) => result.status)).toEqual(['ok', 'ok', 'ok']);

    for (const spec of specs) {
      expect(fs.realpathSync.native(spec.linkPath)).toBe(fs.realpathSync.native(spec.sourcePath));
    }
  });

  it('refuses to replace unexpected real directories', () => {
    const root = makeProjectRoot();
    const specs = getProjectSkillLinkSpecs(root);

    fs.mkdirSync(specs[0].linkPath, { recursive: true });
    fs.writeFileSync(path.join(specs[0].linkPath, 'stale.txt'), 'stale copy', 'utf8');

    expect(() => ensureProjectSkillLinks(root, { platform: process.platform })).toThrow(
      'Refusing to replace existing directory',
    );
  });

  windowsSymlinkIt('prefers real symbolic links over junctions on Windows when available', () => {
    const root = makeProjectRoot();
    const specs = getProjectSkillLinkSpecs(root);

    fs.writeFileSync(specs[0].linkPath, '../skills', 'utf8');
    fs.writeFileSync(specs[1].linkPath, '../skills', 'utf8');
    fs.writeFileSync(specs[2].linkPath, '../skills', 'utf8');

    ensureProjectSkillLinks(root, { platform: 'win32' });

    for (const spec of specs) {
      expect(fs.lstatSync(spec.linkPath).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(spec.linkPath).replace(/\\/g, '/')).toBe('../skills');
    }
  });

  it('treats junction fallback as stable when Windows blocks symlink creation', () => {
    const root = makeProjectRoot();
    const specs = getProjectSkillLinkSpecs(root);

    fs.writeFileSync(specs[0].linkPath, '../skills', 'utf8');
    fs.writeFileSync(specs[1].linkPath, '../skills', 'utf8');
    fs.writeFileSync(specs[2].linkPath, '../skills', 'utf8');

    const originalSymlinkSync = fs.symlinkSync.bind(fs);
    const symlinkSpy = vi.spyOn(fs, 'symlinkSync').mockImplementation((target, pathArg, type) => {
      if (type === 'dir') {
        const error = new Error('symlink denied') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }

      return originalSymlinkSync(
        target as Parameters<typeof fs.symlinkSync>[0],
        pathArg as Parameters<typeof fs.symlinkSync>[1],
        type as Parameters<typeof fs.symlinkSync>[2],
      );
    });

    try {
      const firstResults = ensureProjectSkillLinks(root, { platform: 'win32' });
      const secondResults = ensureProjectSkillLinks(root, { platform: 'win32' });

      expect(firstResults.map((result) => result.status)).toEqual(['repaired', 'repaired', 'repaired']);
      expect(secondResults.map((result) => result.status)).toEqual(['ok', 'ok', 'ok']);

      for (const spec of specs) {
        expect(fs.realpathSync.native(spec.linkPath)).toBe(fs.realpathSync.native(spec.sourcePath));
      }
    } finally {
      symlinkSpy.mockRestore();
    }
  });
});
