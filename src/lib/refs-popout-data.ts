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

interface ReferenceFileData {
  lua?: string;
  css?: string;
  globalNote?: string;
  firstMessage?: string;
  triggerScripts?: string;
  description?: string;
  lorebook?: LorebookEntry[];
  regex?: RegexEntry[];
  [key: string]: unknown;
}

interface ReferenceFile {
  fileName: string;
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

export function buildRefsPopoutData(guidesListResult: GuidesListResult | null, referenceFiles: ReferenceFile[]): RefsPopoutData {
  const refs: RefEntry[] = [];

  for (let ri = 0; ri < referenceFiles.length; ri++) {
    const ref = referenceFiles[ri];
    refs.push({ label: ref.fileName, icon: '📎', id: null, indent: 0, isFolder: true, refIdx: ri });

    if (ref.data.lua) {
      refs.push({ label: 'Lua', icon: '{}', id: `ref_${ri}_lua`, indent: 1 });
    }

    const fields: { id: keyof ReferenceFileData; label: string }[] = [
      { id: 'globalNote', label: '글로벌노트' },
      { id: 'firstMessage', label: '첫 메시지' },
      { id: 'triggerScripts', label: '트리거 스크립트' },
      { id: 'description', label: '설명' }
    ];

    for (const field of fields) {
      if (field.id === 'triggerScripts') {
        if (ref.data.triggerScripts && ref.data.triggerScripts !== '[]') {
          refs.push({ label: field.label, icon: '·', id: `ref_${ri}_${field.id}`, indent: 1 });
        }
      } else if (ref.data[field.id]) {
        refs.push({ label: field.label, icon: '·', id: `ref_${ri}_${field.id}`, indent: 1 });
      }
    }

    if (ref.data.css) {
      refs.push({ label: 'CSS', icon: '🎨', id: `ref_${ri}_css`, indent: 1 });
    }

    if (ref.data.lorebook && ref.data.lorebook.length > 0) {
      refs.push({ label: `로어북 (${ref.data.lorebook.length})`, icon: '📚', id: null, indent: 1, isHeader: true });
      for (let li = 0; li < ref.data.lorebook.length; li++) {
        const entry = ref.data.lorebook[li];
        if (entry.mode === 'folder') continue;
        refs.push({ label: entry.comment || `#${li}`, icon: '·', id: `ref_${ri}_lb_${li}`, indent: 2 });
      }
    }

    if (ref.data.regex && ref.data.regex.length > 0) {
      refs.push({ label: `정규식 (${ref.data.regex.length})`, icon: '⚡', id: null, indent: 1, isHeader: true });
      for (let xi = 0; xi < ref.data.regex.length; xi++) {
        refs.push({ label: ref.data.regex[xi].comment || `#${xi}`, icon: '·', id: `ref_${ri}_rx_${xi}`, indent: 2 });
      }
    }
  }

  return {
    guides: Array.isArray(guidesListResult?.builtIn) ? guidesListResult!.builtIn! : [],
    sessionGuides: Array.isArray(guidesListResult?.session) ? guidesListResult!.session! : [],
    refs
  };
}
