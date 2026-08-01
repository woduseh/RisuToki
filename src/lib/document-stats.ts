import type { RendererDocumentData } from '../stores/app-store';
import type { Tab } from './tab-manager';

export interface DocumentStats {
  fileType: string;
  dirty: boolean;
  lorebookCount: number;
  regexCount: number;
  assetCount: number;
  activeTabChars: number | null;
}

export interface DocumentStatsInput {
  data: RendererDocumentData | null;
  dirty: boolean;
  activeTab?: Pick<Tab, 'getValue'> | null;
}

function documentFileType(data: RendererDocumentData | null): string {
  const raw = data?._fileType || 'charx';
  if (raw === 'risum') return 'RISUM';
  if (raw === 'risup') return 'RISUP';
  return 'CHARX';
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function countActiveTabChars(tab: Pick<Tab, 'getValue'> | null | undefined): number | null {
  if (!tab) return null;
  const value = tab.getValue();
  if (typeof value === 'string') return value.length;
  if (value == null) return null;
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

export function summarizeDocumentStats(input: DocumentStatsInput): DocumentStats {
  const { data } = input;
  return {
    fileType: documentFileType(data),
    dirty: input.dirty,
    lorebookCount: countArray(data?.lorebook),
    regexCount: countArray(data?.regex),
    assetCount: countArray(data?.assets),
    activeTabChars: countActiveTabChars(input.activeTab),
  };
}

export function formatDocumentStats(stats: DocumentStats | null): string {
  if (!stats) return '';
  const parts = [
    stats.fileType,
    stats.dirty ? '수정됨' : '저장됨',
    `로어북 ${stats.lorebookCount}`,
    `정규식 ${stats.regexCount}`,
    `에셋 ${stats.assetCount}`,
  ];
  if (stats.activeTabChars !== null) {
    parts.push(`탭 ${stats.activeTabChars.toLocaleString()}자`);
  }
  return parts.join(' · ');
}
