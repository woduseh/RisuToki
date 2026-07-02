import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { saveCharx, saveRisum, saveRisup, type CharxData } from '../src/charx-io';

export interface WorkflowEvalFixtures {
  dir: string;
  userDataDir: string;
  activeCharx: string;
  externalCharx: string;
  referenceCharx: string;
  referenceRisum: string;
  referenceRisup: string;
  cleanup: () => void;
}

export const WORKFLOW_MARKERS = {
  active: 'workflow-replay-active-marker',
  external: 'workflow-replay-external-marker',
  reference: 'workflow-replay-reference-marker',
  staleOriginal: 'workflow-replay-stale-original',
  staleConcurrent: 'workflow-replay-stale-concurrent',
  staleFinal: 'workflow-replay-stale-final',
  lorebookBefore: 'workflow-replay-lore-before',
  lorebookAfter: 'workflow-replay-lore-after',
  assetPath: 'assets/other/image/workflow-replay-delete.png',
} as const;

function lorebookEntry(index: number): Record<string, unknown> {
  return {
    id: `workflow-replay-lore-${index}`,
    comment: `Workflow Replay Lore ${index}`,
    key: `workflow-replay-${index}`,
    secondkey: '',
    content: `${WORKFLOW_MARKERS.lorebookBefore} ${index}`,
    insertorder: index * 100,
    alwaysActive: false,
    selective: false,
    mode: 'normal',
  };
}

function replayCard(name: string, marker: string, includeMutableSurfaces = false): CharxData {
  const assetData = Buffer.from('workflow-replay-asset');
  return {
    spec: 'chara_card_v3',
    specVersion: '3.0',
    name,
    description: `${marker} ${includeMutableSurfaces ? WORKFLOW_MARKERS.staleOriginal : ''}`.trim(),
    personality: '',
    scenario: '',
    creatorcomment: 'Synthetic workflow replay fixture',
    tags: ['workflow-replay'],
    exampleMessage: '',
    systemPrompt: '',
    creator: 'RisuToki',
    characterVersion: '1.0.0',
    nickname: '',
    source: [],
    creationDate: 0,
    modificationDate: 0,
    additionalText: '',
    license: '',
    firstMessage: 'Workflow replay hello.',
    alternateGreetings: ['Workflow replay alternate hello.'],
    groupOnlyGreetings: [],
    globalNote: '',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: [],
    lorebook: includeMutableSurfaces ? [lorebookEntry(1), lorebookEntry(2), lorebookEntry(3)] : [],
    regex: [],
    assets: includeMutableSurfaces ? [{ path: WORKFLOW_MARKERS.assetPath, data: assetData }] : [],
    xMeta: {},
    risumAssets: [],
    cardAssets: includeMutableSurfaces
      ? [{ type: 'x-risu-asset', uri: WORKFLOW_MARKERS.assetPath, name: 'workflow-replay-delete.png' }]
      : [],
    _risuExt: {},
    _card: {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        extensions: { risuai: {} },
        character_book: { entries: [] },
        assets: [],
      },
    },
    _moduleData: null,
    _presetData: null,
  };
}

export function createWorkflowEvalFixtures(): WorkflowEvalFixtures {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-workflow-replay-'));
  const userDataDir = path.join(dir, 'user-data');
  const activeCharx = path.join(dir, 'active.charx');
  const externalCharx = path.join(dir, 'external.charx');
  const referenceCharx = path.join(dir, 'reference.charx');
  const referenceRisum = path.join(dir, 'reference.risum');
  const referenceRisup = path.join(dir, 'reference.risup');

  saveCharx(activeCharx, replayCard('Workflow Replay Active', WORKFLOW_MARKERS.active, true));
  saveCharx(externalCharx, replayCard('Workflow Replay External', WORKFLOW_MARKERS.external));
  saveCharx(referenceCharx, replayCard('Workflow Replay Reference', WORKFLOW_MARKERS.reference));
  saveRisum(referenceRisum, {
    _fileType: 'risum',
    name: 'Workflow Replay Reference Module',
    description: 'workflow-replay-reference-risum-marker',
    moduleName: 'Workflow Replay Reference Module',
    moduleNamespace: 'workflow.replay.reference',
    lowLevelAccess: false,
    hideIcon: false,
    lorebook: [],
    regex: [],
    alternateGreetings: [],
  } as unknown as CharxData);
  saveRisup(referenceRisup, {
    _fileType: 'risup',
    name: 'Workflow Replay Reference Preset',
    description: 'workflow-replay-reference-risup-marker',
    promptTemplate: JSON.stringify([
      { type: 'plain', type2: 'normal', text: 'Workflow replay reference prompt.', role: 'system' },
    ]),
    formatingOrder: JSON.stringify(['main', 'description']),
    presetBias: '[]',
    localStopStrings: '[]',
  } as unknown as CharxData);

  return {
    dir,
    userDataDir,
    activeCharx,
    externalCharx,
    referenceCharx,
    referenceRisum,
    referenceRisup,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
