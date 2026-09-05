// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRisup, saveRisup, saveRisupPresetPayload } from '../charx-io';
import { writeFileAtomicSync } from './atomic-write';
import { assertFileUnchanged, captureFileBaseline } from './file-baseline';
import { captureDocumentSaveScope } from './document-save-scope';
import { createSessionRecoveryManager } from './session-recovery-manager';
import { getAutosaveSidecarPath } from './session-recovery';

const tempDirs: string[] = [];
function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-save-audit-'));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('save ownership and failed-save recovery audit', () => {
  it('rejects external content changes even when size and timestamp match', () => {
    const file = path.join(workspace(), 'external.json');
    fs.writeFileSync(file, '{"value":"old"}');
    const baseline = captureFileBaseline(file)!;
    fs.writeFileSync(file, '{"value":"new"}');
    fs.utimesSync(file, new Date(baseline.mtimeMs), new Date(baseline.mtimeMs));
    expect(() => assertFileUnchanged(file, baseline)).toThrow(/changed outside/);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ value: 'new' });
  });

  it('allows unchanged content and refuses missing or unrelated baselines', () => {
    const file = path.join(workspace(), 'owned.json');
    fs.writeFileSync(file, '{}');
    const baseline = captureFileBaseline(file)!;
    expect(() => assertFileUnchanged(file, baseline)).not.toThrow();
    expect(() => assertFileUnchanged(file, null)).toThrow();
    expect(() => assertFileUnchanged(file, { ...baseline, path: file + '.other' })).toThrow();
    fs.unlinkSync(file);
    expect(() => assertFileUnchanged(file, baseline)).toThrow();
  });

  it.each(['currentData', 'currentFilePath', 'currentProjectPath'] as const)(
    'rejects Save As after %s changes while a dialog is pending',
    async (field) => {
      const state = {
        currentData: {} as object | null,
        currentFilePath: 'a.risup' as string | null,
        currentProjectPath: null as string | null,
      };
      const assertScope = captureDocumentSaveScope(state);
      const write = vi.fn();
      await Promise.resolve();
      if (field === 'currentData') state.currentData = {};
      else state[field] = 'different';
      expect(() => {
        assertScope();
        write();
      }).toThrow(/Active document changed/);
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('retains the last valid autosave after a failed explicit save and restores it in a new manager', async () => {
    const dir = workspace();
    const source = path.join(dir, 'source.risup');
    const autosave = path.join(dir, 'source_autosave_fixture.risup');
    const sidecar = getAutosaveSidecarPath(autosave);
    saveRisupPresetPayload(source, {
      name: 'Synthetic',
      temperature: 0.5,
      vendor: { bytes: Buffer.from([0, 255, 9]) },
    });
    const draft = openRisup(source);
    draft.temperature = 0.8;
    saveRisup(autosave, draft);
    const provenance = {
      sourceFilePath: source,
      sourceFileType: 'risup',
      autosavePath: autosave,
      savedAt: new Date().toISOString(),
      dirtyFields: ['temperature'],
      appVersion: 'audit',
    };
    writeFileAtomicSync(sidecar, JSON.stringify(provenance));
    const setCurrentDocument = vi.fn();
    const deps = {
      readFileSync: (file: string, encoding: BufferEncoding) => fs.readFileSync(file, encoding),
      writeFileSync: (file: string, data: string) => fs.writeFileSync(file, data),
      writeFileAtomicSync,
      existsSync: fs.existsSync,
      statSync: fs.statSync,
      userDataPath: dir,
      openDocument: openRisup,
      setCurrentDocument,
    };
    const firstRun = createSessionRecoveryManager(deps);
    await firstRun.markDocumentActive(source, 'risup');
    await firstRun.updateAutosavePaths(autosave, sidecar);
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to) === source) throw new Error('injected disk failure');
      rename(from, to);
    });
    expect(() => saveRisup(source, draft)).toThrow('injected disk failure');
    expect(openRisup(source).temperature).toBe(0.5);
    expect(openRisup(autosave).temperature).toBe(0.8);
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);

    const nextRun = createSessionRecoveryManager(deps);
    const candidate = await nextRun.getPendingRecovery();
    expect(candidate?.provenance).toEqual(provenance);
    await nextRun.restoreFromRecovery(candidate!);
    expect(setCurrentDocument).toHaveBeenCalledWith(source, expect.objectContaining({ temperature: 0.8 }));
    expect(openRisup(source).temperature).toBe(0.5);
    expect(openRisup(autosave)._presetData?.vendor).toEqual({ bytes: Buffer.from([0, 255, 9]) });
  });
});
