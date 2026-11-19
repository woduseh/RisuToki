export type EditorTextKind = 'prose' | 'code';

// Consolas has no Hangul; without an explicit Korean fallback Chromium picks a
// fixed-width legacy face and Korean prose renders with wide gaps.
const PROSE_FONT_FAMILY = "'Segoe UI', 'Malgun Gothic', 'Noto Sans KR', sans-serif";
const CODE_FONT_FAMILY = "'Cascadia Code', Consolas, 'D2Coding', 'Malgun Gothic', 'Noto Sans KR', monospace";

export interface EditorTypography {
  fontFamily: string;
  fontSize: number;
  /** Multiple of `fontSize`; Monaco treats line heights below 8 as multipliers, so zoom keeps the spacing. */
  lineHeight: number;
}

export function editorTypography(kind: EditorTextKind, compact = false): EditorTypography {
  if (kind === 'prose') {
    return { fontFamily: PROSE_FONT_FAMILY, fontSize: compact ? 14 : 15, lineHeight: 1.75 };
  }
  return { fontFamily: CODE_FONT_FAMILY, fontSize: compact ? 13 : 14, lineHeight: 1.5 };
}
