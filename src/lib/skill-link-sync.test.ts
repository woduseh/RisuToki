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
  fs.mkdirSync(path.join(root, 'risu', 'common', 'skills', 'writing-cbs-syntax'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'risu', 'common', 'skills', 'writing-cbs-syntax', 'SKILL.md'),
    '# skill placeholder\n',
    'utf8',
  );

  for (const projectSkillDir of ['.agents', '.claude', '.gemini', '.github']) {
    fs.mkdirSync(path.join(root, projectSkillDir), { recursive: true });
  }

  return root;
}

function makeProjectRootWithoutSkills() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-skill-links-missing-'));
  tempRoots.push(root);

  for (const projectSkillDir of ['.agents', '.claude', '.gemini', '.github']) {
    fs.mkdirSync(path.join(root, projectSkillDir), { recursive: true });
  }

  return root;
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

function getCodexSkillSpec(specs: ReturnType<typeof getProjectSkillLinkSpecs>) {
  const codexSpec = specs.find((spec) => spec.linkPath.endsWith(path.join('.agents', 'skills')));
  expect(codexSpec).toBeDefined();
  return codexSpec!;
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

    specs.forEach((spec, index) => {
      const placeholderContent =
        index === 1 ? spec.relativeTarget.replace(/\//g, '\\') + '\n' : spec.relativeTarget + '\n';
      fs.writeFileSync(spec.linkPath, placeholderContent, 'utf8');
    });

    const results = ensureProjectSkillLinks(root, { platform: 'win32' });

    expect(results.map((result) => result.status)).toEqual(specs.map(() => 'repaired'));

    for (const spec of specs) {
      expect(fs.lstatSync(spec.linkPath).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync.native(spec.linkPath)).toBe(fs.realpathSync.native(spec.sourcePath));
    }
  });

  it('keeps already-correct links unchanged', () => {
    const root = makeProjectRoot();
    ensureProjectSkillLinks(root, { platform: process.platform });
    const results = ensureProjectSkillLinks(root, { platform: process.platform });
    const specs = getProjectSkillLinkSpecs(root);

    expect(results.map((result) => result.status)).toEqual(specs.map(() => 'ok'));

    for (const spec of specs) {
      expect(fs.realpathSync.native(spec.linkPath)).toBe(fs.realpathSync.native(spec.sourcePath));
      expect(fs.existsSync(path.join(spec.linkPath, 'authoring-characters', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(spec.linkPath, 'writing-cbs-syntax', 'SKILL.md'))).toBe(true);
    }
  });

  it('keeps existing links stable even if existsSync would misreport them as missing', () => {
    const root = makeProjectRoot();
    ensureProjectSkillLinks(root, { platform: process.platform });
    const specs = getProjectSkillLinkSpecs(root);
    const originalExistsSync = fs.existsSync.bind(fs);
    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((entryPath) => {
      const entry = String(entryPath);
      if (specs.some((spec) => spec.linkPath === entry)) {
        return false;
      }

      return originalExistsSync(entryPath);
    });

    try {
      const results = ensureProjectSkillLinks(root, { platform: process.platform });
      expect(results.map((result) => result.status)).toEqual(specs.map(() => 'ok'));
    } finally {
      existsSpy.mockRestore();
    }
  });

  it('accepts already-synced managed directory copies', () => {
    const root = makeProjectRoot();
    ensureProjectSkillLinks(root, { platform: process.platform });
    const specs = getProjectSkillLinkSpecs(root);

    for (const spec of specs) {
      fs.rmSync(spec.linkPath, { recursive: true, force: true });
      fs.cpSync(spec.sourcePath, spec.linkPath, {
        dereference: true,
        recursive: true,
      });
    }

    const results = ensureProjectSkillLinks(root, { platform: process.platform });

    expect(results.map((result) => result.status)).toEqual(specs.map(() => 'ok'));
  });

  it('repairs stale managed directory copies', () => {
    const root = makeProjectRoot();
    ensureProjectSkillLinks(root, { platform: process.platform });
    const specs = getProjectSkillLinkSpecs(root);
    const codexSpec = getCodexSkillSpec(specs);

    fs.rmSync(codexSpec.linkPath, { recursive: true, force: true });
    fs.cpSync(codexSpec.sourcePath, codexSpec.linkPath, {
      dereference: true,
      recursive: true,
    });
    fs.writeFileSync(path.join(codexSpec.linkPath, 'authoring-characters', 'SKILL.md'), '# stale copy\n', 'utf8');

    const results = ensureProjectSkillLinks(root, { platform: process.platform });

    expect(results.map((result) => result.status)).toEqual(
      specs.map((spec) => (spec.linkPath === codexSpec.linkPath ? 'repaired' : 'ok')),
    );
    expect(fs.readFileSync(path.join(codexSpec.linkPath, 'authoring-characters', 'SKILL.md'), 'utf8')).not.toBe(
      '# stale copy\n',
    );
  });

  windowsSymlinkIt('accepts already-correct Windows symlinks when realpath is blocked', () => {
    const root = makeProjectRoot();
    ensureProjectSkillLinks(root, { platform: 'win32' });
    const specs = getProjectSkillLinkSpecs(root);
    const originalRealpathNative = fs.realpathSync.native.bind(fs.realpathSync);
    const realpathNativeSpy = vi.spyOn(fs.realpathSync, 'native').mockImplementation((entryPath) => {
      const entry = String(entryPath);
      if (specs.some((spec) => spec.linkPath === entry)) {
        const error = new Error('realpath denied') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }

      return originalRealpathNative(entryPath as Parameters<typeof fs.realpathSync.native>[0]);
    });

    try {
      const results = ensureProjectSkillLinks(root, { platform: 'win32' });
      expect(results.map((result) => result.status)).toEqual(specs.map(() => 'ok'));
    } finally {
      realpathNativeSpy.mockRestore();
    }
  });

  it('refuses to replace unexpected real directories', () => {
    const root = makeProjectRoot();
    const specs = getProjectSkillLinkSpecs(root);
    const codexSpec = getCodexSkillSpec(specs);

    fs.mkdirSync(codexSpec.linkPath, { recursive: true });
    fs.writeFileSync(path.join(codexSpec.linkPath, 'stale.txt'), 'stale copy', 'utf8');

    expect(() => ensureProjectSkillLinks(root, { platform: process.platform })).toThrow(
      'Refusing to replace existing directory',
    );
  });

  windowsSymlinkIt('prefers real symbolic links over junctions on Windows when available', () => {
    const root = makeProjectRoot();
    const specs = getProjectSkillLinkSpecs(root);

    for (const spec of specs) {
      fs.writeFileSync(spec.linkPath, spec.relativeTarget, 'utf8');
    }

    ensureProjectSkillLinks(root, { platform: 'win32' });

    for (const spec of specs) {
      expect(fs.lstatSync(spec.linkPath).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(spec.linkPath).replace(/\\/g, '/')).toBe(spec.relativeTarget.replace(/\\/g, '/'));
    }
  });

  it('treats junction fallback as stable when Windows blocks symlink creation', () => {
    const root = makeProjectRoot();
    const specs = getProjectSkillLinkSpecs(root);

    for (const spec of specs) {
      fs.writeFileSync(spec.linkPath, spec.relativeTarget, 'utf8');
    }

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

      expect(firstResults.map((result) => result.status)).toEqual(specs.map(() => 'repaired'));
      expect(secondResults.map((result) => result.status)).toEqual(specs.map(() => 'ok'));

      for (const spec of specs) {
        expect(fs.realpathSync.native(spec.linkPath)).toBe(fs.realpathSync.native(spec.sourcePath));
      }
    } finally {
      symlinkSpy.mockRestore();
    }
  });
});
