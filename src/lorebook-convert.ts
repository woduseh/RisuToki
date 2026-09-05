export interface RisuLorebookEntry {
  [key: string]: unknown;
  enabled?: boolean;
  id?: number;
  name?: string;
  priority?: number;
  extensions?: Partial<Ccv3LorebookEntry['extensions']>;
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
  [key: string]: unknown;
  comment: string;
  constant: boolean;
  content: string;
  enabled: boolean;
  extensions: {
    [key: string]: unknown;
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
  const preserved = { ...risuEntry };
  for (const key of [
    'key',
    'secondkey',
    'alwaysActive',
    'insertorder',
    'depth',
    'selectiveLogic',
    'probability',
    'useProbability',
    'mode',
  ])
    delete preserved[key];
  const keys = risuEntry.key
    ? risuEntry.key
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean)
    : [];
  const secondaryKeys = risuEntry.secondkey
    ? risuEntry.secondkey
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean)
    : [];

  return {
    ...preserved,
    keys,
    content: risuEntry.content || '',
    extensions: {
      addMemo: true,
      excludeRecursion: false,
      displayIndex: index,
      group: '',
      groupOverride: false,
      groupWeight: 100,
      scanDepth: null,
      caseSensitive: null,
      matchWholeWords: null,
      useGroupScoring: null,
      automationId: '',
      role: null,
      vectorized: false,
      ...risuEntry.extensions,
      depth: risuEntry.depth ?? risuEntry.extensions?.depth ?? 0,
      selectiveLogic: risuEntry.selectiveLogic ?? risuEntry.extensions?.selectiveLogic ?? 0,
      probability: risuEntry.probability ?? risuEntry.extensions?.probability ?? 100,
      useProbability: risuEntry.useProbability ?? risuEntry.extensions?.useProbability ?? true,
    },
    enabled: risuEntry.enabled ?? true,
    insertion_order: risuEntry.insertorder ?? 100,
    name: risuEntry.name ?? risuEntry.comment ?? '',
    priority: risuEntry.priority ?? risuEntry.insertorder ?? 100,
    id: risuEntry.id ?? index,
    comment: risuEntry.comment || '',
    selective: risuEntry.selective ?? false,
    secondary_keys: secondaryKeys,
    constant: risuEntry.alwaysActive ?? false,
    position: risuEntry.position || 'before_char',
    ...(risuEntry.mode === 'folder' ? { mode: 'folder' } : {}),
    ...(risuEntry.folder ? { folder: risuEntry.folder } : {}),
  };
}

export function ccv3ToRisu(ccv3Entry: Partial<Ccv3LorebookEntry>): RisuLorebookEntry {
  const preserved = { ...ccv3Entry };
  for (const key of ['keys', 'secondary_keys', 'constant', 'insertion_order']) delete preserved[key];
  const key = Array.isArray(ccv3Entry.keys) ? ccv3Entry.keys.join(', ') : '';
  const secondkey = Array.isArray(ccv3Entry.secondary_keys) ? ccv3Entry.secondary_keys.join(', ') : '';

  return {
    ...preserved,
    key,
    comment: ccv3Entry.comment || ccv3Entry.name || '',
    content: ccv3Entry.content || '',
    mode: ccv3Entry.mode || 'normal',
    insertorder: ccv3Entry.insertion_order ?? 100,
    alwaysActive: ccv3Entry.constant ?? false,
    secondkey,
    selective: ccv3Entry.selective ?? false,
    position: ccv3Entry.position,
    depth: ccv3Entry.extensions?.depth,
    selectiveLogic: ccv3Entry.extensions?.selectiveLogic,
    probability: ccv3Entry.extensions?.probability,
    useProbability: ccv3Entry.extensions?.useProbability,
    ...(ccv3Entry.folder ? { folder: ccv3Entry.folder } : {}),
  };
}

export function risuArrayToCCV3(risuEntries: RisuLorebookEntry[]): Ccv3LorebookEntry[] {
  return risuEntries.map((entry, index) => risuToCCV3(entry, index));
}

export function ccv3ArrayToRisu(ccv3Entries: Array<Partial<Ccv3LorebookEntry>>): RisuLorebookEntry[] {
  return ccv3Entries.map(ccv3ToRisu);
}
