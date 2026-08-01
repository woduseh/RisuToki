import { describe, expect, it } from 'vitest';
import {
  ASSET_OUTPUT_BLOCK_END,
  ASSET_OUTPUT_BLOCK_START,
  analyzeAssetFilenames,
  applyAssetOutputPlan,
  buildAssetOutputPlan,
  createDefaultPartMappings,
  ensureGeneratedAssetBlock,
  upsertGeneratedAssetBlock,
} from './asset-output-wizard';
import type { RendererDocumentData } from '../stores/app-store';

function makeData(fileType: 'charx' | 'risum' = 'charx'): RendererDocumentData {
  return {
    name: 'test',
    description: '',
    firstMessage: '',
    alternateGreetings: [],
    groupOnlyGreetings: [],
    globalNote: '사용자 메모',
    css: '',
    defaultVariables: '',
    lua: '',
    triggerScripts: '',
    lorebook: [],
    regex: [],
    _fileType: fileType,
  };
}

describe('asset output wizard', () => {
  it('analyzes only assets/other and selects the largest consistent group', () => {
    const analysis = analyzeAssetFilenames([
      'assets/other/Hinano_Home_happy.webp',
      'assets/other/Hinano_Home_angry.png',
      'assets/other/Hinano-School-sad.webp',
      'assets/other/Hinano_Home_notes.txt',
      'assets/icon/main.png',
    ]);
    expect(analysis.delimiter).toBe('_');
    expect(analysis.segmentCount).toBe(3);
    expect(analysis.files.map((file) => file.key)).toEqual(['Hinano_Home_happy', 'Hinano_Home_angry']);
    expect(analysis.excluded.map((file) => file.key)).toEqual(['Hinano-School-sad']);
  });

  it('returns an empty analysis when assets/other has no images', () => {
    expect(analyzeAssetFilenames(['assets/icon/main.png', 'assets/other/readme.txt']).files).toEqual([]);
  });

  it('excludes every extensionless output-key collision', () => {
    const analysis = analyzeAssetFilenames([
      'assets/other/A_Home_happy.webp',
      'assets/other/A_Home_happy.png',
      'assets/other/A_Home_sad.webp',
    ]);
    expect(analysis.files.map((file) => file.key)).toEqual(['A_Home_sad']);
    expect(analysis.collisions.map((file) => file.path)).toEqual([
      'assets/other/A_Home_happy.webp',
      'assets/other/A_Home_happy.png',
    ]);
  });

  it('emits only actual asset keys after ignored parts and inclusion filtering', () => {
    const analysis = analyzeAssetFilenames(['assets/other/A_Home_happy.webp', 'assets/other/A_Home_sad.png']);
    const mappings = createDefaultPartMappings(analysis);
    mappings[1].role = 'ignore';
    const plan = buildAssetOutputPlan(analysis, mappings, ['assets/other/A_Home_happy.webp']);
    expect(plan.generatedBlock).toContain('<img src="A_Home_happy">');
    expect(plan.generatedBlock).not.toContain('A_Home_sad');
    expect(plan.generatedBlock).not.toContain('sad');
    expect(plan.generatedBlock).not.toContain('복장=');
  });

  it('replaces only the marked block and preserves user content', () => {
    const first = `${ASSET_OUTPUT_BLOCK_START}\nold\n${ASSET_OUTPUT_BLOCK_END}`;
    const next = `${ASSET_OUTPUT_BLOCK_START}\nnew\n${ASSET_OUTPUT_BLOCK_END}`;
    expect(upsertGeneratedAssetBlock(`앞\n${first}\n뒤`, next)).toBe(`앞\n${next}\n뒤`);
  });

  it('restores stable markers around an edited preview', () => {
    expect(ensureGeneratedAssetBlock('사용자가 편집한 규칙')).toBe(
      `${ASSET_OUTPUT_BLOCK_START}\n사용자가 편집한 규칙\n${ASSET_OUTPUT_BLOCK_END}`,
    );
  });

  it('creates and updates the always-active lorebook entry', () => {
    const data = makeData();
    const analysis = analyzeAssetFilenames(['assets/other/A_Home_happy.webp']);
    const plan = buildAssetOutputPlan(analysis, createDefaultPartMappings(analysis));
    const first = applyAssetOutputPlan(data, plan, 'lorebook');
    expect(first.created).toBe(true);
    expect(data.lorebook[0].alwaysActive).toBe(true);
    expect(data.lorebook[0].insertorder).toBe(100);
    const second = applyAssetOutputPlan(
      data,
      { ...plan, generatedBlock: plan.generatedBlock.replace('happy', 'angry') },
      'lorebook',
    );
    expect(second.created).toBe(false);
    expect(data.lorebook).toHaveLength(1);
  });

  it('limits globalNote to CHARX', () => {
    const data = makeData('risum');
    const analysis = analyzeAssetFilenames(['assets/other/A_Home_happy.webp']);
    const plan = buildAssetOutputPlan(analysis, createDefaultPartMappings(analysis));
    expect(() => applyAssetOutputPlan(data, plan, 'globalNote')).toThrow(/CHARX/);
  });
});
