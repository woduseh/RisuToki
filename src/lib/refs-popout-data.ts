import {
  getReferenceGreetingItemLabel,
  getReferenceUiItems,
  shouldRenderReferenceUiItem,
} from './reference-item-registry';
import { getRefFileType } from './reference-store';

interface GuidesListResult {
  builtIn?: string[];
  session?: string[];
}

interface LorebookEntry {
  mode?: string;
  comment?: string;
  [key: string]: unknown;
}

interface RegexEntry {
  comment?: string;
  [key: string]: unknown;
}

// Re-use ReferenceFileData from sidebar-refs for type parity.
// Kept as a local alias to avoid pulling in DOM-dependent sidebar code.
interface ReferenceFileData {
  lua?: string;
  css?: string;
  globalNote?: string;
  firstMessage?: string;
  triggerScripts?: string;
  description?: string;
  alternateGreetings?: string[];
  groupOnlyGreetings?: string[];
  defaultVariables?: string;
  lorebook?: LorebookEntry[];
  regex?: RegexEntry[];
  [key: string]: unknown;
}

interface ReferenceFile {
  id?: string;
  fileName: string;
  filePath?: string;
  fileType?: 'charx' | 'risum' | 'risup';
  data: ReferenceFileData;
  [key: string]: unknown;
}

interface RefEntry {
  label: string;
  icon: string;
  id: string | null;
  indent: number;
  isFolder?: boolean;
  isHeader?: boolean;
  refIdx?: number;
}

interface RefsPopoutData {
  guides: string[];
  sessionGuides: string[];
  refs: RefEntry[];
}

export function buildRefsPopoutData(
  guidesListResult: GuidesListResult | null,
  referenceFiles: ReferenceFile[],
): RefsPopoutData {
  const refs: RefEntry[] = [];

  for (let ri = 0; ri < referenceFiles.length; ri++) {
    const ref = referenceFiles[ri];
    const fileType = ref.fileType || getRefFileType(ref);
    refs.push({ label: ref.fileName, icon: '📎', id: null, indent: 0, isFolder: true, refIdx: ri });

    for (const item of getReferenceUiItems(fileType)) {
      if (!shouldRenderReferenceUiItem(item, ref.data)) {
        continue;
      }
      if (item.kind === 'field') {
        refs.push({ label: item.label, icon: item.icon, id: `ref_${ri}_${item.field}`, indent: 1 });
        continue;
      }
      if (item.kind === 'greetings') {
        const greetings: string[] = Array.isArray(ref.data[item.field]) ? (ref.data[item.field] as string[]) : [];
        refs.push({ label: item.label, icon: item.icon, id: null, indent: 1, isFolder: true });
        for (let gi = 0; gi < greetings.length; gi++) {
          refs.push({
            label: getReferenceGreetingItemLabel(gi),
            icon: '·',
            id: `ref_${ri}_greeting_${item.greetingType}_${gi}`,
            indent: 2,
          });
        }
        continue;
      }
      if (item.kind === 'lorebook') {
        const lorebook = Array.isArray(ref.data.lorebook) ? ref.data.lorebook : [];
        refs.push({ label: `로어북 (${lorebook.length})`, icon: item.icon, id: null, indent: 1, isHeader: true });
        for (let li = 0; li < lorebook.length; li++) {
          const entry = lorebook[li];
          if (entry.mode === 'folder') continue;
          refs.push({ label: entry.comment || `#${li}`, icon: '·', id: `ref_${ri}_lb_${li}`, indent: 2 });
        }
        continue;
      }
      if (item.kind === 'regex') {
        const regex = Array.isArray(ref.data.regex) ? ref.data.regex : [];
        refs.push({ label: `정규식 (${regex.length})`, icon: item.icon, id: null, indent: 1, isHeader: true });
        for (let xi = 0; xi < regex.length; xi++) {
          refs.push({ label: regex[xi].comment || `#${xi}`, icon: '·', id: `ref_${ri}_rx_${xi}`, indent: 2 });
        }
        continue;
      }
      if (item.kind === 'risup-group') {
        refs.push({ label: item.label, icon: item.icon, id: `ref_${ri}_risup_${item.groupId}`, indent: 1 });
        continue;
      }
      refs.push({ label: item.label, icon: item.icon, id: `ref_${ri}_${item.key}`, indent: 1 });
    }
  }

  return {
    guides: Array.isArray(guidesListResult?.builtIn) ? guidesListResult!.builtIn! : [],
    sessionGuides: Array.isArray(guidesListResult?.session) ? guidesListResult!.session! : [],
    refs,
  };
}
