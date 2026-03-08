export interface RisuLorebookEntry {
  alwaysActive?: boolean;
  comment?: string;
  content?: string;
  depth?: number;
  folder?: string;
  insertorder?: number;
  key?: string;
  mode?: string;
  position?: string;
  probability?: number;
  secondkey?: string;
  selective?: boolean;
  selectiveLogic?: number;
  useProbability?: boolean;
}

export interface Ccv3LorebookEntry {
  comment: string;
  constant: boolean;
  content: string;
  enabled: boolean;
  extensions: {
    addMemo: boolean;
    automationId: string;
    caseSensitive: null;
    depth: number;
    displayIndex: number;
    excludeRecursion: boolean;
    group: string;
    groupOverride: boolean;
    groupWeight: number;
    matchWholeWords: null;
    probability: number;
    role: null;
    scanDepth: null;
    selectiveLogic: number;
    useGroupScoring: null;
    useProbability: boolean;
    vectorized: boolean;
  };
  id: number;
  insertion_order: number;
  keys: string[];
  mode?: string;
  name: string;
  position: string;
  priority: number;
  secondary_keys: string[];
  selective: boolean;
  folder?: string;
}

export function risuToCCV3(risuEntry: RisuLorebookEntry, index = 0): Ccv3LorebookEntry {
  const keys = risuEntry.key
    ? risuEntry.key.split(',').map((key) => key.trim()).filter(Boolean)
    : [];
  const secondaryKeys = risuEntry.secondkey
    ? risuEntry.secondkey.split(',').map((key) => key.trim()).filter(Boolean)
    : [];

  return {
    keys,
    content: risuEntry.content || '',
    extensions: {
      depth: risuEntry.depth ?? 0,
      selectiveLogic: risuEntry.selectiveLogic ?? 0,
      addMemo: true,
      excludeRecursion: false,
      displayIndex: index,
      probability: risuEntry.probability ?? 100,
      useProbability: risuEntry.useProbability ?? true,
      group: '',
      groupOverride: false,
      groupWeight: 100,
      scanDepth: null,
      caseSensitive: null,
      matchWholeWords: null,
      useGroupScoring: null,
      automationId: '',
      role: null,
      vectorized: false
    },
    enabled: true,
    insertion_order: risuEntry.insertorder ?? 100,
    name: risuEntry.comment || '',
    priority: risuEntry.insertorder ?? 100,
    id: index,
    comment: risuEntry.comment || '',
    selective: risuEntry.selective ?? false,
    secondary_keys: secondaryKeys,
    constant: risuEntry.alwaysActive ?? false,
    position: risuEntry.position || 'before_char',
    ...(risuEntry.mode === 'folder' ? { mode: 'folder' } : {}),
    ...(risuEntry.folder ? { folder: risuEntry.folder } : {})
  };
}

export function ccv3ToRisu(ccv3Entry: Partial<Ccv3LorebookEntry>): RisuLorebookEntry {
  const key = Array.isArray(ccv3Entry.keys)
    ? ccv3Entry.keys.join(', ')
    : '';
  const secondkey = Array.isArray(ccv3Entry.secondary_keys)
    ? ccv3Entry.secondary_keys.join(', ')
    : '';

  return {
    key,
    comment: ccv3Entry.comment || ccv3Entry.name || '',
    content: ccv3Entry.content || '',
    mode: ccv3Entry.mode || 'normal',
    insertorder: ccv3Entry.insertion_order ?? 100,
    alwaysActive: ccv3Entry.constant ?? false,
    secondkey,
    selective: ccv3Entry.selective ?? false,
    ...(ccv3Entry.folder ? { folder: ccv3Entry.folder } : {})
  };
}

export function risuArrayToCCV3(risuEntries: RisuLorebookEntry[]): Ccv3LorebookEntry[] {
  return risuEntries.map((entry, index) => risuToCCV3(entry, index));
}

export function ccv3ArrayToRisu(ccv3Entries: Array<Partial<Ccv3LorebookEntry>>): RisuLorebookEntry[] {
  return ccv3Entries.map(ccv3ToRisu);
}
