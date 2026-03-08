import { describe, expect, it } from 'vitest';
import { buildAssetPromptTemplate } from './asset-prompt-template';

describe('buildAssetPromptTemplate', () => {
  it('includes character name and description in the template', () => {
    const template = buildAssetPromptTemplate({
      name: '은주',
      description: '차분하고 예민한 분위기의 여고생. 검은 장발과 푸른 눈을 가졌다.'
    });

    expect(template).toContain('- 이름: 은주');
    expect(template).toContain('차분하고 예민한 분위기의 여고생');
    expect(template).toContain('### Positive Prompt');
    expect(template).toContain('문법가이드_에셋_프롬프트.md');
  });

  it('falls back when character data is missing', () => {
    const template = buildAssetPromptTemplate();

    expect(template).toContain('이름 미지정 캐릭터');
    expect(template).toContain('설명이 아직 비어 있습니다.');
  });
});
