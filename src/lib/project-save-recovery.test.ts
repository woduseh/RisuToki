// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertProjectRecoveryResolved,
  PROJECT_SAVE_RECOVERY_MARKER,
  withProjectSaveRecovery,
} from './project-save-recovery';

const roots: string[] = [];
function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-save-recovery-'));
  roots.push(root);
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(project, 'manifest.json'), '{"name":"before"}');
  fs.writeFileSync(path.join(project, 'assets', 'image.bin'), Buffer.from([0, 255, 128]));
  fs.writeFileSync(path.join(project, '.unknown'), 'keep this too');
  return project;
}
function snapshot(directory: string): Record<string, Buffer> {
  const entries: Record<string, Buffer> = {};
  for (const name of fs.readdirSync(directory, { recursive: true }) as string[]) {
    const file = path.join(directory, name);
    if (fs.statSync(file).isFile()) entries[name] = fs.readFileSync(file);
  }
  return entries;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('project save recovery checkpoints', () => {
  it('retains every original file in a reopenable backup and blocks the partial project after failure', () => {
    const project = makeProject();
    const before = snapshot(project);
    const failure = new Error('disk failure after deleting assets');
    let caught: unknown;
    try {
      withProjectSaveRecovery(project, () => {
        fs.writeFileSync(path.join(project, 'manifest.json'), '{"name":"partial"}');
        fs.rmSync(path.join(project, 'assets'), { recursive: true });
        throw failure;
      });
    } catch (error) {
      caught = error;
    }
    const marker = JSON.parse(fs.readFileSync(path.join(project, PROJECT_SAVE_RECOVERY_MARKER), 'utf8'));
    expect(caught).toMatchObject({ cause: failure });
    expect((caught as Error).message).toContain(marker.backupPath);
    expect(snapshot(marker.backupPath)).toEqual(before);
    expect(() => assertProjectRecoveryResolved(project)).toThrow(marker.backupPath);
    expect(() => withProjectSaveRecovery(project, () => 'must not run')).toThrow(/unresolved/);
    expect(() => assertProjectRecoveryResolved(marker.backupPath)).not.toThrow();
  });

  it('verifies the original files before the marker is written and cleans up after a successful save', () => {
    const project = makeProject();
    const before = snapshot(project);
    let verified = false;
    const result = withProjectSaveRecovery(
      project,
      () => {
        expect(verified).toBe(true);
        expect(fs.existsSync(path.join(project, PROJECT_SAVE_RECOVERY_MARKER))).toBe(true);
        fs.writeFileSync(path.join(project, 'manifest.json'), '{"name":"after"}');
        return 42;
      },
      () => {
        expect(snapshot(project)).toEqual(before);
        verified = true;
      },
    );
    expect(result).toBe(42);
    expect(fs.readdirSync(path.dirname(project))).toEqual(['project']);
    expect(fs.existsSync(path.join(project, PROJECT_SAVE_RECOVERY_MARKER))).toBe(false);
    expect(() => assertProjectRecoveryResolved(project)).not.toThrow();
  });

  it('does not save or leave a marker when the fingerprint check detects an external edit', () => {
    const project = makeProject();
    const before = snapshot(project);
    expect(() =>
      withProjectSaveRecovery(
        project,
        () => {
          throw new Error('unexpected save');
        },
        () => {
          throw new Error('external edit');
        },
      ),
    ).toThrow('external edit');
    expect(snapshot(project)).toEqual(before);
    expect(fs.readdirSync(path.dirname(project))).toEqual(['project']);
  });

  it('fails closed on unreadable recovery markers', () => {
    const project = makeProject();
    fs.writeFileSync(path.join(project, PROJECT_SAVE_RECOVERY_MARKER), '{broken');
    expect(() => assertProjectRecoveryResolved(project)).toThrow(/unresolved/);
  });

  it('rejects symbolic links without reading or modifying their external target', () => {
    const project = makeProject();
    const external = path.join(path.dirname(project), 'external');
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, 'private.bin'), Buffer.from([9, 8, 7]));
    fs.symlinkSync(external, path.join(project, 'linked'), 'junction');
    expect(() =>
      withProjectSaveRecovery(project, () => {
        throw new Error('unexpected save');
      }),
    ).toThrow(/symbolic link/);
    expect(fs.readFileSync(path.join(external, 'private.bin'))).toEqual(Buffer.from([9, 8, 7]));
    expect(fs.existsSync(path.join(project, PROJECT_SAVE_RECOVERY_MARKER))).toBe(false);
  });
});
