// @vitest-environment node

import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCharxZip,
  openCharx,
  openRisum,
  openRisup,
  saveRisum,
  saveRisup,
  type LoadedDocumentData,
} from '../charx-io';
import {
  extractCharxToProject,
  extractDocumentToProject,
  getProjectFileType,
  listProjectTree,
  loadProjectData,
  readProjectFile,
  reassembleProjectDocument,
  reassembleProjectCharx,
  saveProjectData,
  writeProjectFile,
} from './folder-workspace';
import { PROJECT_SAVE_RECOVERY_MARKER } from './project-save-recovery';

const tempDirectories: string[] = [];

function makeTempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-folder-workspace-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps a loadable checkpoint after a real multi-file project save fails halfway', () => {
  const root = makeTempDir();
  const source = path.join(root, 'synthetic.charx');
  const project = path.join(root, 'project');
  writeFixtureCharx(source);
  extractCharxToProject(source, project);
  const data = loadProjectData(project);
  const before = data.description;
  data.description = 'new draft';
  const write = fs.writeFileSync;
  vi.spyOn(fs, 'writeFileSync').mockImplementation((file, content, options) => {
    if (String(file) === path.join(project, 'module.risum')) throw new Error('injected project disk failure');
    return write(file, content, options);
  });
  syncBuiltinESMExports();
  expect(() => saveProjectData(project, data)).toThrow(/injected project disk failure/);
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  const marker = JSON.parse(fs.readFileSync(path.join(project, PROJECT_SAVE_RECOVERY_MARKER), 'utf8'));
  expect(() => loadProjectData(project)).toThrow(/unresolved save checkpoint/);
  expect(() => reassembleProjectDocument(project, path.join(root, 'unsafe.charx'))).toThrow(/unresolved/);
  const restored = loadProjectData(marker.backupPath);
  expect(restored.description).toBe(before);
  expect(restored.lorebook).toEqual(openCharx(source).lorebook);
});

function writeFixtureCharx(filePath: string): void {
  const data: LoadedDocumentData = {
    name: 'Folder Bot',
    description: 'Description in markdown',
    personality: 'Calm',
    scenario: '',
    creatorcomment: 'Creator note',
    tags: [],
    exampleMessage: 'Example text',
    systemPrompt: '',
    additionalText: 'Additional text',
    firstMessage: 'Hello from first message',
    alternateGreetings: ['Alt one', 'Alt two'],
    groupOnlyGreetings: [],
    globalNote: 'Global note',
    css: '<style>.x{color:red}</style>',
    defaultVariables: '',
    lua: '',
    triggerScripts: [],
    lorebook: [{ comment: 'Lore', key: 'lore', content: 'Lore content', mode: 'normal' }],
    regex: [],
    assets: [{ path: 'assets/icon/main.png', data: Buffer.from('fake-png') }],
    cardAssets: [{ type: 'icon', uri: 'embeded://assets/icon/main.png', name: 'main', ext: 'png' }],
    xMeta: { main: { type: 'PNG' } },
    risumAssets: [],
    _risuExt: {},
    _card: {},
    _moduleData: {
      type: 'risuModule',
      module: {
        name: 'Folder Module',
        description: 'Module description',
        id: 'module-id',
        trigger: [],
        regex: [],
        lorebook: [{ comment: 'Lore', key: 'lore', content: 'Lore content', mode: 'normal' }],
        assets: [],
      },
    },
    _presetData: null,
  };
  buildCharxZip(data).writeZip(filePath);
}

function writeFixtureRisum(filePath: string): void {
  const data: LoadedDocumentData = {
    name: 'Module Fixture',
    description: 'Module description',
    moduleName: 'Module Fixture',
    moduleDescription: 'Module description',
    moduleNamespace: 'fixture',
    moduleId: 'module-fixture-id',
    lowLevelAccess: false,
    customModuleToggle: '',
    triggerScripts: [],
    lua: '',
    lorebook: [{ comment: 'Module Lore', key: 'module', content: 'Module lore content', mode: 'normal' }],
    regex: [],
    firstMessage: '',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    personality: '',
    scenario: '',
    creatorcomment: '',
    tags: [],
    exampleMessage: '',
    systemPrompt: '',
    creator: '',
    characterVersion: '',
    nickname: '',
    source: [],
    creationDate: 0,
    modificationDate: 0,
    additionalText: '',
    license: '',
    assets: [],
    xMeta: {},
    risumAssets: [Buffer.from('module-asset')],
    cardAssets: [],
    _fileType: 'risum',
    _risuExt: {},
    _card: {},
    _moduleData: {
      type: 'risuModule',
      module: {
        name: 'Module Fixture',
        description: 'Module description',
        id: 'module-fixture-id',
        namespace: 'fixture',
        trigger: [],
        regex: [],
        lorebook: [{ comment: 'Module Lore', key: 'module', content: 'Module lore content', mode: 'normal' }],
        assets: [],
      },
    },
    _presetData: null,
  };
  saveRisum(filePath, data);
}

function writeFixtureRisup(filePath: string): void {
  const data = {
    _fileType: 'risup',
    _presetData: {
      name: 'Preset Fixture',
      mainPrompt: 'Main prompt',
      jailbreak: 'Jailbreak prompt',
      globalNote: 'Global note',
      openAIKey: 'secret-key',
      proxyKey: 'proxy-secret',
    },
    _compressionMode: 'gzip',
    name: 'Preset Fixture',
    mainPrompt: 'Main prompt',
    jailbreak: 'Jailbreak prompt',
    globalNote: 'Global note',
  } as unknown as LoadedDocumentData;
  saveRisup(filePath, data);
}

describe('folder-workspace', () => {
  it('extracts charx into a RisuMari-compatible folder and reassembles it', () => {
    const temp = makeTempDir();
    const charxPath = path.join(temp, 'source.charx');
    const projectPath = path.join(temp, 'project');
    const outputPath = path.join(temp, 'output.charx');
    writeFixtureCharx(charxPath);

    extractCharxToProject(charxPath, projectPath);

    expect(fs.existsSync(path.join(projectPath, 'module.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, 'module.risum'))).toBe(false);
    expect(fs.readFileSync(path.join(projectPath, 'description.md'), 'utf-8')).toBe('Description in markdown');
    expect(fs.readFileSync(path.join(projectPath, 'greeting_1.md'), 'utf-8')).toBe('Alt two');
    expect(fs.existsSync(path.join(projectPath, 'assets', 'icon', 'main.png'))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, 'x_meta', 'main.json'))).toBe(true);

    writeProjectFile(projectPath, 'description.md', 'Edited description');
    expect(readProjectFile(projectPath, 'description.md')).toBe('Edited description');
    reassembleProjectCharx(projectPath, outputPath);

    const reopened = openCharx(outputPath);
    expect(reopened.description).toBe('Edited description');
    expect(reopened.alternateGreetings).toEqual(['Alt one', 'Alt two']);
    expect(reopened.assets.map((asset) => asset.path)).toContain('assets/icon/main.png');
  });

  it('loads and saves project folders through normalized LoadedDocumentData', () => {
    const temp = makeTempDir();
    const charxPath = path.join(temp, 'source.charx');
    const projectPath = path.join(temp, 'project');
    const outputPath = path.join(temp, 'saved.charx');
    writeFixtureCharx(charxPath);
    extractCharxToProject(charxPath, projectPath);

    const data = loadProjectData(projectPath);
    data.description = 'Saved through LoadedDocumentData';
    data.firstMessage = 'Saved first message';
    saveProjectData(projectPath, data);

    expect(fs.readFileSync(path.join(projectPath, 'description.md'), 'utf-8')).toBe('Saved through LoadedDocumentData');
    expect(fs.readFileSync(path.join(projectPath, 'first_mes.md'), 'utf-8')).toBe('Saved first message');

    const tree = listProjectTree(projectPath);
    expect(tree.children?.some((child) => child.name === 'card.json')).toBe(true);

    reassembleProjectCharx(projectPath, outputPath);
    const reopened = openCharx(outputPath);
    expect(reopened.description).toBe('Saved through LoadedDocumentData');
    expect(reopened.firstMessage).toBe('Saved first message');
  });

  it('preserves module edits, unknown fields and binary assets across repeated project saves', () => {
    const temp = makeTempDir();
    const charxPath = path.join(temp, 'source.charx');
    const projectPath = path.join(temp, 'project');
    const outputPath = path.join(temp, 'output.charx');
    writeFixtureCharx(charxPath);
    extractCharxToProject(charxPath, projectPath);
    const cardJson = JSON.parse(readProjectFile(projectPath, 'card.json'));
    cardJson.customRoot = { nested: [null, 0, false] };
    cardJson.data.extensions.vendor = { mode: 'unknown' };
    writeProjectFile(projectPath, 'card.json', JSON.stringify(cardJson));
    const moduleJson = JSON.parse(readProjectFile(projectPath, 'module.json'));
    moduleJson.module.customExtension = { nested: [false, 0, '유지'] };
    writeProjectFile(projectPath, 'module.json', JSON.stringify(moduleJson));
    const data = loadProjectData(projectPath);
    data.lorebook = [{ comment: 'Edited', key: 'edit', content: 'UI/MCP content', mode: 'normal', customField: 7 }];
    data.risumAssets = [Buffer.from([0, 255, 1, 128])];
    saveProjectData(projectPath, data);
    data.description = 'Second save';
    saveProjectData(projectPath, data);
    reassembleProjectCharx(projectPath, outputPath);
    const reopened = openCharx(outputPath);
    expect(reopened.lorebook).toEqual(data.lorebook);
    expect(reopened.description).toBe('Second save');
    expect(reopened._card.customRoot).toEqual({ nested: [null, 0, false] });
    expect(((reopened._card.data as Record<string, unknown>).extensions as Record<string, unknown>).vendor).toEqual({
      mode: 'unknown',
    });
    expect((reopened._moduleData?.module as Record<string, unknown>).customExtension).toEqual({
      nested: [false, 0, '유지'],
    });
    expect(reopened.risumAssets).toEqual(data.risumAssets);
    expect(reopened.assets[0].data).toEqual(Buffer.from('fake-png'));
  });

  it('does not resurrect removed greetings from a previous project save', () => {
    const temp = makeTempDir();
    const charxPath = path.join(temp, 'source.charx');
    const projectPath = path.join(temp, 'project');
    writeFixtureCharx(charxPath);
    extractCharxToProject(charxPath, projectPath);
    const data = loadProjectData(projectPath);
    data.alternateGreetings = ['Remaining'];
    saveProjectData(projectPath, data);
    expect(loadProjectData(projectPath).alternateGreetings).toEqual(['Remaining']);
    expect(fs.existsSync(path.join(projectPath, 'greeting_1.md'))).toBe(false);
  });

  it.each([
    ['description.md', Buffer.from('External text')],
    ['module.json', Buffer.from('{"module":{"external":true}}')],
    ['assets/icon/main.png', Buffer.from([0, 255, 42])],
  ])('rejects a stale project save after %s changes externally', (relativePath, externalContent) => {
    const temp = makeTempDir();
    const source = path.join(temp, 'source.charx');
    const project = path.join(temp, 'project');
    writeFixtureCharx(source);
    extractCharxToProject(source, project);
    const stale = loadProjectData(project);
    stale.description = 'Unsaved UI draft';
    const target = path.join(project, relativePath);
    fs.writeFileSync(target, externalContent);
    expect(() => saveProjectData(project, stale)).toThrow('외부에서 변경');
    expect(fs.readFileSync(target)).toEqual(externalContent);
    expect(stale.description).toBe('Unsaved UI draft');
  });

  it('keeps opaque ZIP entries separate from project control files and preserves their exact bytes', () => {
    const temp = makeTempDir();
    const source = path.join(temp, 'source.charx');
    const project = path.join(temp, 'project');
    const output = path.join(temp, 'output.charx');
    writeFixtureCharx(source);
    const opaqueEntries = [
      { path: 'README.md', data: Buffer.from('Opaque README\r\n') },
      { path: 'description.md', data: Buffer.from('Opaque description, not the card description') },
      { path: 'manifest.json', data: Buffer.from('{"opaque":true}') },
      { path: 'module.json', data: Buffer.from('{"opaqueModule":true}') },
      { path: '.hidden.bin', data: Buffer.from([0, 255, 128, 10]) },
      { path: '.risutoki/workspace.json', data: Buffer.from('{"sourceFileType":"risup"}') },
    ];
    const archive = new AdmZip(source);
    for (const entry of opaqueEntries) archive.addFile(entry.path, entry.data);
    archive.writeZip(source);
    extractCharxToProject(source, project);
    expect(getProjectFileType(project)).toBe('charx');
    expect(readProjectFile(project, 'description.md')).toBe('Description in markdown');
    const loaded = loadProjectData(project);
    loaded.description = 'Edited card description';
    saveProjectData(project, loaded);
    reassembleProjectCharx(project, output);
    const reopened = openCharx(output);
    expect(reopened.description).toBe('Edited card description');
    expect(reopened._zipEntries).toEqual(expect.arrayContaining(opaqueEntries));
    expect(reopened._zipEntries).toHaveLength(opaqueEntries.length);
    for (const entry of opaqueEntries) {
      expect(new AdmZip(output).getEntry(entry.path)?.getData()).toEqual(entry.data);
    }
    const stale = loadProjectData(project);
    fs.appendFileSync(path.join(project, '.risutoki', 'charx-extra-entries.zip'), Buffer.from('external change'));
    expect(() => saveProjectData(project, stale)).toThrow('외부에서 변경');
  });

  it('does not delete project files while loading or reassembling a document', () => {
    const temp = makeTempDir();
    const source = path.join(temp, 'source.charx');
    const project = path.join(temp, 'project');
    writeFixtureCharx(source);
    extractCharxToProject(source, project);
    writeProjectFile(project, 'personality.md', 'External notes');
    loadProjectData(project);
    expect(readProjectFile(project, 'personality.md')).toBe('External notes');
  });

  it.each(['charx', 'risum'])('keeps the existing %s output if final replacement fails', (format) => {
    const temp = makeTempDir();
    const source = path.join(temp, `source.${format}`);
    const project = path.join(temp, 'project');
    const output = path.join(temp, `output.${format}`);
    if (format === 'charx') writeFixtureCharx(source);
    else writeFixtureRisum(source);
    extractDocumentToProject(source, project);
    const originalBytes = Buffer.from('Existing output');
    fs.writeFileSync(output, originalBytes);
    const rename = fs.renameSync;
    const replacement = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (to === output) throw new Error('Synthetic replacement failure');
      rename(from, to);
    });
    try {
      expect(() => reassembleProjectDocument(project, output)).toThrow('Synthetic replacement failure');
      expect(fs.readFileSync(output)).toEqual(originalBytes);
    } finally {
      replacement.mockRestore();
    }
  });

  it('removes only stale RisuToki-managed charx assets and preserves external project files', () => {
    const temp = makeTempDir();
    const charxPath = path.join(temp, 'source.charx');
    const projectPath = path.join(temp, 'project');
    writeFixtureCharx(charxPath);
    extractCharxToProject(charxPath, projectPath);

    const markerPath = path.join(projectPath, '.risutoki', 'workspace.json');
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as Record<string, unknown>;
    delete marker.charxManagedFiles;
    fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf-8');

    const externalPath = path.join(projectPath, 'assets', 'manual', 'keep.txt');
    fs.mkdirSync(path.dirname(externalPath), { recursive: true });
    fs.writeFileSync(externalPath, 'external');

    const data = loadProjectData(projectPath);
    data.assets = [];
    data.cardAssets = [];
    data.xMeta = {};
    saveProjectData(projectPath, data);

    expect(fs.existsSync(path.join(projectPath, 'assets', 'icon', 'main.png'))).toBe(false);
    expect(fs.existsSync(path.join(projectPath, 'x_meta', 'main.json'))).toBe(false);
    expect(fs.readFileSync(externalPath, 'utf-8')).toBe('external');

    const updatedMarker = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as { charxManagedFiles?: string[] };
    expect(updatedMarker.charxManagedFiles).toEqual([]);
  });

  it('pads sparse greeting indexes with empty strings instead of null values', () => {
    const temp = makeTempDir();
    const charxPath = path.join(temp, 'source.charx');
    const projectPath = path.join(temp, 'project');
    const outputPath = path.join(temp, 'output.charx');
    writeFixtureCharx(charxPath);
    extractCharxToProject(charxPath, projectPath);
    fs.writeFileSync(path.join(projectPath, 'greeting_4.md'), 'Late greeting', 'utf-8');

    reassembleProjectCharx(projectPath, outputPath);
    expect(openCharx(outputPath).alternateGreetings).toEqual(['Alt one', 'Alt two', '', '', 'Late greeting']);
  });

  it('rejects a missing indexed module asset instead of shifting the remaining assets', () => {
    const temp = makeTempDir();
    const source = path.join(temp, 'source.risum');
    const project = path.join(temp, 'project');
    writeFixtureRisum(source);
    const data = openRisum(source);
    data.risumAssets = [Buffer.from('first'), Buffer.from('second')];
    saveRisum(source, data);
    extractDocumentToProject(source, project);
    fs.unlinkSync(path.join(project, '.risutoki', 'risum-assets', 'asset_0000.bin'));
    expect(() => loadProjectData(project)).toThrow('ENOENT');
    expect(fs.readFileSync(path.join(project, '.risutoki', 'risum-assets', 'asset_0001.bin'))).toEqual(
      Buffer.from('second'),
    );
  });

  it('extracts, loads, and reassembles risum project folders', () => {
    const temp = makeTempDir();
    const risumPath = path.join(temp, 'source.risum');
    const projectPath = path.join(temp, 'module-project');
    const outputPath = path.join(temp, 'output.risum');
    writeFixtureRisum(risumPath);

    extractDocumentToProject(risumPath, projectPath);

    expect(getProjectFileType(projectPath)).toBe('risum');
    expect(fs.existsSync(path.join(projectPath, 'module.json'))).toBe(true);

    const moduleJson = JSON.parse(fs.readFileSync(path.join(projectPath, 'module.json'), 'utf-8')) as {
      module: { name: string; description: string };
    };
    moduleJson.module.description = 'Edited module description';
    fs.writeFileSync(path.join(projectPath, 'module.json'), `${JSON.stringify(moduleJson, null, 2)}\n`, 'utf-8');

    const loaded = loadProjectData(projectPath);
    expect(loaded._fileType).toBe('risum');
    expect(loaded.moduleDescription).toBe('Edited module description');

    reassembleProjectDocument(projectPath, outputPath);
    const reopened = openRisum(outputPath);
    expect(reopened.moduleDescription).toBe('Edited module description');
    expect(reopened.risumAssets?.[0]?.toString()).toBe('module-asset');
  });

  it('preserves RISUP envelope extensions and only restores proven binary paths through JSON editing', () => {
    const temp = makeTempDir();
    const source = path.join(temp, 'source.risup');
    const project = path.join(temp, 'project');
    const output = path.join(temp, 'output.risup');
    writeFixtureRisup(source);
    const sourceData = openRisup(source);
    sourceData._presetData!.vendor = {
      parts: [{ payload: Buffer.from([0, 255, 17]) }, { payload: [0, 255, 17] }],
      pretendBuffer: { type: 'Buffer', data: [0, 255, 17] },
    };
    sourceData._risupEnvelope = {
      type: 'preset',
      presetVersion: 7,
      vendor: { payload: Buffer.from([128, 1, 254]), label: 'Unknown envelope' },
    };
    saveRisup(source, sourceData);
    extractDocumentToProject(source, project);
    const preset = JSON.parse(readProjectFile(project, 'preset.json'));
    preset.vendor.localNote = 'External JSON edit';
    writeProjectFile(project, 'preset.json', JSON.stringify(preset));
    const loaded = loadProjectData(project);
    loaded.temperature = 42;
    saveProjectData(project, loaded);
    reassembleProjectDocument(project, output);
    const reopened = openRisup(output);
    const vendor = reopened._presetData!.vendor as {
      parts: Array<{ payload: Uint8Array | number[] }>;
      pretendBuffer: unknown;
      localNote: string;
    };
    expect(vendor.parts[0].payload).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(vendor.parts[0].payload)).toEqual(Buffer.from([0, 255, 17]));
    expect(vendor.parts[1].payload).toEqual([0, 255, 17]);
    expect(vendor.pretendBuffer).toEqual({ type: 'Buffer', data: [0, 255, 17] });
    expect(vendor.localNote).toBe('External JSON edit');
    expect(reopened.temperature).toBe(42);
    expect(reopened._risupEnvelope?.presetVersion).toBe(7);
    const envelopeVendor = reopened._risupEnvelope?.vendor as { payload: Uint8Array; label: string };
    expect(envelopeVendor.payload).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(envelopeVendor.payload)).toEqual(Buffer.from([128, 1, 254]));
    expect(envelopeVendor.label).toBe('Unknown envelope');
  });

  it('extracts, saves, and reassembles risup project folders without sensitive keys', () => {
    const temp = makeTempDir();
    const risupPath = path.join(temp, 'source.risup');
    const projectPath = path.join(temp, 'preset-project');
    const outputPath = path.join(temp, 'output.risup');
    writeFixtureRisup(risupPath);

    extractDocumentToProject(risupPath, projectPath);

    expect(getProjectFileType(projectPath)).toBe('risup');
    expect(fs.existsSync(path.join(projectPath, 'preset.json'))).toBe(true);
    const presetJson = JSON.parse(fs.readFileSync(path.join(projectPath, 'preset.json'), 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(presetJson.openAIKey).toBeUndefined();
    expect(presetJson.proxyKey).toBeUndefined();
    expect(fs.existsSync(path.join(projectPath, 'mainPrompt.md'))).toBe(false);
    expect(presetJson.mainPrompt).toBeUndefined();

    writeProjectFile(projectPath, 'mainPrompt.md', 'Edited main prompt');
    reassembleProjectDocument(projectPath, outputPath);

    const reopened = openRisup(outputPath);
    expect(reopened.mainPrompt).toBe('');
    expect((reopened._presetData as Record<string, unknown>).openAIKey).toBeUndefined();
    expect((reopened._presetData as Record<string, unknown>).proxyKey).toBeUndefined();
    expect((reopened._presetData as Record<string, unknown>).mainPrompt).toBeUndefined();
  });
});
