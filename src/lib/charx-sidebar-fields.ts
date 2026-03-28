export type CharxInfoField = 'description' | 'globalNote' | 'defaultVariables' | 'creatorcomment' | 'characterVersion';

export interface CharxInfoItem {
  id: CharxInfoField;
  label: string;
  icon: string;
  lang: 'plaintext';
  field: CharxInfoField;
}

const CHARX_INFO_ITEMS: readonly CharxInfoItem[] = [
  { id: 'description', label: '설명', icon: '📄', lang: 'plaintext', field: 'description' },
  { id: 'globalNote', label: '글로벌노트', icon: '📝', lang: 'plaintext', field: 'globalNote' },
  { id: 'defaultVariables', label: '기본변수', icon: '⚙', lang: 'plaintext', field: 'defaultVariables' },
  { id: 'creatorcomment', label: '제작자 노트', icon: '🗒', lang: 'plaintext', field: 'creatorcomment' },
  { id: 'characterVersion', label: '캐릭터 버전', icon: '🏷', lang: 'plaintext', field: 'characterVersion' },
];

export function getCharxInfoItems(): readonly CharxInfoItem[] {
  return CHARX_INFO_ITEMS;
}
