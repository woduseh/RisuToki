import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { LoadedDocumentData } from '../charx-io';

export const createDocumentFields = {
  name: z.string().trim().min(1).max(200).describe('Name of the new character, module, or preset.'),
  description: z.string().max(100000).optional(),
};

export function newArtifactData(name: string, description = ''): LoadedDocumentData {
  return {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name,
    description,
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: [],
    lorebook: [],
    regex: [],
    moduleName: name,
    moduleDescription: description,
    promptTemplate: '[]',
    formatingOrder: '[]',
    assets: [],
    xMeta: {},
    risumAssets: [],
    cardAssets: [],
    _risuExt: {},
    _card: { spec: 'chara_card_v3', spec_version: '3.0', data: { extensions: { risuai: {} } } },
    _moduleData: null,
    _presetData: { name },
  };
}

export function checkNewArtifactPath(filePath: string): string {
  if (!path.isAbsolute(filePath)) throw new Error('file_path must be absolute');
  const resolved = path.normalize(filePath);
  if (!['.charx', '.risum', '.risup'].includes(path.extname(resolved).toLowerCase())) {
    throw new Error('Choose a .charx, .risum, or .risup destination');
  }
  try {
    fs.lstatSync(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (!fs.statSync(path.dirname(resolved)).isDirectory()) throw new Error('Destination parent must be a directory');
    return resolved;
  }
  throw new Error('Destination already exists; creation never overwrites a file');
}

/** Serialize to a sibling first; exclusive link publishes only if the destination is still absent. */
export function createArtifactExclusive(
  filePath: string,
  data: LoadedDocumentData,
  save: (filePath: string, data: LoadedDocumentData) => void,
): void {
  const destination = checkNewArtifactPath(filePath);
  const temporary = path.join(
    path.dirname(destination),
    `.risutoki-create-${randomUUID()}${path.extname(destination)}`,
  );
  try {
    save(temporary, data);
    fs.linkSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
