// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-folder-workspace-'));
}

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
