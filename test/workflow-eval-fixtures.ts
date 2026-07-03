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
  activeRisup: string;
  externalRisup: string;
  referenceRisum: string;
  referenceRisup: string;
  activeRisum: string;
  externalRisum: string;
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
  regexBefore: 'workflow-replay-regex-before',
  regexAfter: 'workflow-replay-regex-after',
  greetingBefore: 'workflow-replay-greeting-before',
  greetingAfter: 'workflow-replay-greeting-after',
  luaBefore: 'workflow-replay-lua-before',
  luaAfter: 'workflow-replay-lua-after',
  cssBefore: 'workflow-replay-css-before',
  cssAfter: 'workflow-replay-css-after',
  risupBefore: 'workflow-replay-risup-before',
  risupAfter: 'workflow-replay-risup-after',
  risumBefore: 'workflow-replay-risum-before',
  risumAfter: 'workflow-replay-risum-after',
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
    alternateGreetings: includeMutableSurfaces
      ? [`${WORKFLOW_MARKERS.greetingBefore} alternate one`, `${WORKFLOW_MARKERS.greetingBefore} alternate two`]
      : ['Workflow replay alternate hello.'],
    groupOnlyGreetings: includeMutableSurfaces ? [`${WORKFLOW_MARKERS.greetingBefore} group`] : [],
    globalNote: '',
    css: includeMutableSurfaces
      ? `<style>
/* ============================================================
   workflow_main
   ============================================================ */
.workflow-replay { color: ${WORKFLOW_MARKERS.cssBefore}; }
/* ============================================================
   workflow_secondary
   ============================================================ */
.workflow-replay-secondary { display: block; }
</style>`
      : '',
    defaultVariables: '',
    lua: includeMutableSurfaces
      ? `-- ===== workflow_main =====
local marker = "${WORKFLOW_MARKERS.luaBefore}"
print(marker)
-- ===== workflow_secondary =====
print("workflow secondary")
`
      : '',
    triggerScripts: includeMutableSurfaces
      ? [
          {
            comment: 'Workflow Replay Trigger One',
            type: 'start',
            conditions: [],
            effect: [
              {
                type: 'triggerlua',
                code: '-- ===== workflow_trigger =====\nlocal marker = "workflow-triggerlua-validation"\nprint(marker)',
              },
            ],
            lowLevelAccess: false,
          },
          {
            comment: 'Workflow Replay Trigger Two',
            type: 'manual',
            conditions: [],
            effect: [],
            lowLevelAccess: false,
          },
        ]
      : [],
    lorebook: includeMutableSurfaces ? [lorebookEntry(1), lorebookEntry(2), lorebookEntry(3)] : [],
    regex: includeMutableSurfaces
      ? [
          {
            comment: 'Workflow Replay Regex',
            type: 'editoutput',
            find: WORKFLOW_MARKERS.regexBefore,
            replace: WORKFLOW_MARKERS.regexAfter,
            flag: 'g',
          },
          {
            comment: 'Workflow Replay Duplicate',
            type: 'editoutput',
            find: 'workflow-replay-duplicate-one',
            replace: 'duplicate-one',
            flag: 'g',
          },
          {
            comment: 'Workflow Replay Duplicate',
            type: 'editoutput',
            find: 'workflow-replay-duplicate-two',
            replace: 'duplicate-two',
            flag: 'g',
          },
        ]
      : [],
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
  const activeRisup = path.join(dir, 'active.risup');
  const externalRisup = path.join(dir, 'external.risup');
  const referenceRisum = path.join(dir, 'reference.risum');
  const referenceRisup = path.join(dir, 'reference.risup');
  const activeRisum = path.join(dir, 'active.risum');
  const externalRisum = path.join(dir, 'external.risum');

  saveCharx(activeCharx, replayCard('Workflow Replay Active', WORKFLOW_MARKERS.active, true));
  saveCharx(externalCharx, replayCard('Workflow Replay External', WORKFLOW_MARKERS.external, true));
  saveCharx(referenceCharx, replayCard('Workflow Replay Reference', WORKFLOW_MARKERS.reference));
  const preset = (name: string, description: string) =>
    ({
      _fileType: 'risup',
      name,
      description,
      promptTemplate: JSON.stringify([
        {
          type: 'plain',
          type2: 'normal',
          text: `${WORKFLOW_MARKERS.risupBefore} main`,
          role: 'system',
        },
        {
          type: 'jailbreak',
          type2: 'normal',
          text: `${WORKFLOW_MARKERS.risupBefore} jailbreak`,
          role: 'system',
        },
        {
          type: 'plain',
          type2: 'normal',
          text: `${WORKFLOW_MARKERS.risupBefore} removable`,
          role: 'assistant',
        },
      ]),
      formatingOrder: JSON.stringify(['main', 'description', 'jailbreak']),
      customPromptTemplateToggle: `workflow_toggle=${WORKFLOW_MARKERS.risupBefore}`,
      presetBias: '[]',
      localStopStrings: '[]',
    }) as unknown as CharxData;
  saveRisup(activeRisup, preset('Workflow Replay Active Preset', 'workflow-replay-active-risup-marker'));
  saveRisup(externalRisup, preset('Workflow Replay External Preset', 'workflow-replay-external-risup-marker'));
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
  const moduleData = (name: string, namespace: string) =>
    ({
      _fileType: 'risum',
      name,
      description: `${WORKFLOW_MARKERS.risumBefore} description`,
      moduleName: name,
      moduleDescription: `${WORKFLOW_MARKERS.risumBefore} module description`,
      moduleNamespace: namespace,
      mcpUrl: 'https://example.invalid/workflow-replay',
      lowLevelAccess: false,
      hideIcon: false,
      backgroundEmbedding: `<style>.workflow-module { color: ${WORKFLOW_MARKERS.risumBefore}; }</style>`,
      customModuleToggle: `workflow_module_toggle=${WORKFLOW_MARKERS.risumBefore}`,
      lua: '',
      triggerScripts: [],
      lorebook: [],
      regex: [],
      risumAssets: [],
      _moduleData: { module: { assets: [] } },
    }) as unknown as CharxData;
  saveRisum(activeRisum, moduleData('Workflow Replay Active Module', 'workflow.replay.active'));
  saveRisum(externalRisum, moduleData('Workflow Replay External Module', 'workflow.replay.external'));

  return {
    dir,
    userDataDir,
    activeCharx,
    externalCharx,
    referenceCharx,
    activeRisup,
    externalRisup,
    referenceRisum,
    referenceRisup,
    activeRisum,
    externalRisum,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
