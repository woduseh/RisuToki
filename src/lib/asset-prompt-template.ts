export interface AssetPromptTemplateInput {
  name?: string;
  description?: string;
}

export function buildAssetPromptTemplate({
  name = '',
  description = ''
}: AssetPromptTemplateInput = {}): string {
  const safeName = name.trim() || '이름 미지정 캐릭터';
  const safeDescription = description.trim() || '설명이 아직 비어 있습니다.';

  return [
    '# 에셋 프롬프트 자동 생성 템플릿',
    '',
    '아래 캐릭터 정보를 읽고 ComfyUI + Anima용 스탠딩 프로필 이미지 프롬프트를 생성해줘.',
    '',
    '## 목표',
    '- 캐릭터의 description을 바탕으로 전신 스탠딩 프로필 이미지를 만든다.',
    '- Danbooru 계열 태그형 프롬프트를 우선한다.',
    '- 손, 발, 비율, 실루엣 안정성을 우선한다.',
    '- description에 없는 설정은 임의로 추가하지 않는다.',
    '',
    '## 출력 형식',
    '### 요약 해석',
    '- 성별/연령 인상:',
    '- 체형:',
    '- 헤어/눈:',
    '- 의상:',
    '- 소품:',
    '- 분위기:',
    '',
    '### Positive Prompt',
    '```text',
    'masterpiece, best quality, anime style, 1girl/1boy, solo, full body, standing, feet visible, ...',
    '```',
    '',
    '### Negative Prompt',
    '```text',
    'low quality, worst quality, lowres, bad anatomy, bad hands, malformed feet, cropped, out of frame, ...',
    '```',
    '',
    '### ComfyUI 시작값',
    '- Resolution:',
    '- Steps:',
    '- CFG:',
    '- Sampler:',
    '- VAE:',
    '- ControlNet/OpenPose 필요 여부:',
    '',
    '### 보정 메모',
    '- 손/발 안정화 포인트:',
    '- 배경 단순화 포인트:',
    '- 포즈 고정 포인트:',
    '',
    '## 생성 규칙',
    '- 구도 태그(`solo`, `full body`, `standing`, `feet visible`, `front view` 또는 `three-quarter view`)를 앞쪽에 배치할 것.',
    '- 캐릭터 식별에 중요한 외형, 의상, 소품을 우선 정리할 것.',
    '- 첫 시도는 단순 배경과 정적인 포즈로 구성할 것.',
    '- 전신 구도에서는 손과 발이 잘리지 않도록 명시할 것.',
    '- 복잡한 배경, 다인 구도, 과도한 액션 포즈는 기본안에서 제외할 것.',
    '',
    '## 캐릭터 정보',
    `- 이름: ${safeName}`,
    '- description:',
    '```text',
    safeDescription,
    '```',
    '',
    '## 참고',
    '- 내장 가이드: `문법가이드_에셋_프롬프트.md`',
    '- 목표 결과물: 배경보다 캐릭터가 우선인 스탠딩 프로필 일러스트'
  ].join('\n');
}
