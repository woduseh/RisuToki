import type { CharxData, LorebookEntry } from '../stores/app-store';

export const ASSET_OUTPUT_BLOCK_START = '<!-- risutoki:asset-output:start -->';
export const ASSET_OUTPUT_BLOCK_END = '<!-- risutoki:asset-output:end -->';

export type AssetPartRole = 'name' | 'outfit' | 'emotion' | 'custom' | 'ignore';

export interface AssetFilenamePart {
  index: number;
  values: string[];
}

export interface AssetFilenameFile {
  path: string;
  key: string;
  extension: string;
  parts: string[];
}

export interface AssetFilenameAnalysis {
  delimiter: string;
  segmentCount: number;
  files: AssetFilenameFile[];
  excluded: AssetFilenameFile[];
  collisions: AssetFilenameFile[];
  parts: AssetFilenamePart[];
}

export interface AssetPartMapping {
  index: number;
  role: AssetPartRole;
  label: string;
}

export interface AssetOutputPlan {
  analysis: AssetFilenameAnalysis;
  mappings: AssetPartMapping[];
  includedPaths: string[];
  template: string;
  generatedBlock: string;
}

const DELIMITERS = ['_', '-', '.', ' '] as const;
const IMAGE_EXTENSION_RE = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;

function withoutExtension(fileName: string): { key: string; extension: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { key: fileName, extension: '' };
  return { key: fileName.slice(0, dot), extension: fileName.slice(dot + 1).toLocaleLowerCase() };
}

function getKey(path: string): { key: string; extension: string } {
  return withoutExtension(path.split('/').pop() || path);
}

export function analyzeAssetFilenames(paths: string[]): AssetFilenameAnalysis {
  const candidates = paths
    .filter((path) => path.startsWith('assets/other/') && IMAGE_EXTENSION_RE.test(path))
    .map((path) => ({ path, ...getKey(path) }));

  if (candidates.length === 0)
    return { delimiter: '', segmentCount: 0, files: [], excluded: [], collisions: [], parts: [] };

  let selectedDelimiter = '';
  let selectedCount = 1;
  let selectedSize = 0;
  for (const delimiter of DELIMITERS) {
    const groups = new Map<number, number>();
    for (const candidate of candidates) {
      const count = candidate.key.split(delimiter).length;
      if (count < 2) continue;
      groups.set(count, (groups.get(count) || 0) + 1);
    }
    for (const [count, size] of groups) {
      if (size > selectedSize || (size === selectedSize && count > selectedCount)) {
        selectedDelimiter = delimiter;
        selectedCount = count;
        selectedSize = size;
      }
    }
  }

  if (!selectedDelimiter) selectedSize = candidates.length;
  const allFiles: AssetFilenameFile[] = candidates.map((candidate) => ({
    ...candidate,
    parts: selectedDelimiter ? candidate.key.split(selectedDelimiter) : [candidate.key],
  }));
  const consistentFiles = allFiles
    .filter((file) => file.parts.length === selectedCount)
    .slice(0, selectedSize || undefined);
  const consistentPaths = new Set(consistentFiles.map((file) => file.path));
  const excluded = allFiles.filter((file) => !consistentPaths.has(file.path));
  const keyCounts = new Map<string, number>();
  for (const file of consistentFiles) keyCounts.set(file.key, (keyCounts.get(file.key) || 0) + 1);
  const collisions = consistentFiles.filter((file) => (keyCounts.get(file.key) || 0) > 1);
  const collisionPaths = new Set(collisions.map((file) => file.path));
  const files = consistentFiles.filter((file) => !collisionPaths.has(file.path));
  const parts = Array.from({ length: selectedCount }, (_, index) => ({
    index,
    values: [...new Set(files.map((file) => file.parts[index]).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  }));

  return { delimiter: selectedDelimiter, segmentCount: selectedCount, files, excluded, collisions, parts };
}

export function createDefaultPartMappings(analysis: AssetFilenameAnalysis): AssetPartMapping[] {
  const defaults: Array<[AssetPartRole, string]> = [
    ['name', '이름'],
    ['outfit', '복장'],
    ['emotion', '감정'],
  ];
  return analysis.parts.map((part) => ({
    index: part.index,
    role: defaults[part.index]?.[0] ?? 'custom',
    label: defaults[part.index]?.[1] ?? `차원 ${part.index + 1}`,
  }));
}

export function buildAssetOutputPlan(
  analysis: AssetFilenameAnalysis,
  mappings: AssetPartMapping[],
  includedPaths = analysis.files.map((file) => file.path),
  template = '<img src="{{asset}}">',
): AssetOutputPlan {
  const included = new Set(includedPaths);
  const files = analysis.files.filter((file) => included.has(file.path));
  const visibleMappings = mappings.filter((mapping) => mapping.role !== 'ignore');
  const lines = [
    ASSET_OUTPUT_BLOCK_START,
    '#### Asset Output Rules',
    '',
    'Use an image command only when it matches the visible character state.',
    `Output format: \`${template.replace('{{asset}}', 'Asset_Name')}\``,
    'Use only one of the exact asset keys listed below. Do not invent combinations.',
    '',
  ];

  if (visibleMappings.length > 0) {
    lines.push('Dimensions:');
    for (const mapping of visibleMappings) {
      const values = [
        ...new Set(files.map((file) => file.parts[mapping.index]).filter((value): value is string => !!value)),
      ].sort((a, b) => a.localeCompare(b));
      lines.push(`- ${mapping.label}: ${values.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('Available assets:');
  for (const file of files) {
    const attributes = visibleMappings
      .map((mapping) => `${mapping.label}=${file.parts[mapping.index] || ''}`)
      .filter((value) => !value.endsWith('='))
      .join(', ');
    lines.push(`- \`${template.replace('{{asset}}', file.key)}\`${attributes ? ` — ${attributes}` : ''}`);
  }
  lines.push(ASSET_OUTPUT_BLOCK_END);

  return {
    analysis,
    mappings,
    includedPaths: files.map((file) => file.path),
    template,
    generatedBlock: lines.join('\n'),
  };
}

export function upsertGeneratedAssetBlock(content: string, block: string): string {
  const start = content.indexOf(ASSET_OUTPUT_BLOCK_START);
  const end = content.indexOf(ASSET_OUTPUT_BLOCK_END);
  if (start >= 0 && end >= start) {
    const after = end + ASSET_OUTPUT_BLOCK_END.length;
    return `${content.slice(0, start)}${block}${content.slice(after)}`;
  }
  const trimmed = content.trimEnd();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

export function ensureGeneratedAssetBlock(block: string): string {
  const trimmed = block.trim();
  if (trimmed.startsWith(ASSET_OUTPUT_BLOCK_START) && trimmed.endsWith(ASSET_OUTPUT_BLOCK_END)) return trimmed;
  const withoutStart = trimmed.replace(ASSET_OUTPUT_BLOCK_START, '').trim();
  const withoutMarkers = withoutStart.replace(ASSET_OUTPUT_BLOCK_END, '').trim();
  return `${ASSET_OUTPUT_BLOCK_START}\n${withoutMarkers}\n${ASSET_OUTPUT_BLOCK_END}`;
}

function createAssetLorebookEntry(content: string, order: number): LorebookEntry {
  return {
    key: '',
    secondkey: '',
    comment: '에셋 출력 규칙',
    content,
    mode: 'normal',
    insertorder: 100,
    order,
    priority: 0,
    alwaysActive: true,
    forceActivation: false,
    selective: false,
    constant: true,
    useRegex: false,
    folder: '',
    extentions: {},
  };
}

export function applyAssetOutputPlan(
  data: CharxData,
  plan: AssetOutputPlan,
  target: 'lorebook' | 'globalNote',
): { target: 'lorebook' | 'globalNote'; lorebookIndex?: number; created: boolean } {
  if (target === 'globalNote') {
    if (data._fileType === 'risum' || data._fileType === 'risup')
      throw new Error('globalNote 대상은 CHARX에서만 사용할 수 있습니다.');
    const previous = typeof data.globalNote === 'string' ? data.globalNote : '';
    data.globalNote = upsertGeneratedAssetBlock(previous, plan.generatedBlock);
    return { target, created: !previous.includes(ASSET_OUTPUT_BLOCK_START) };
  }

  const existingIndex = data.lorebook.findIndex((entry) => entry.content?.includes(ASSET_OUTPUT_BLOCK_START));
  if (existingIndex >= 0) {
    data.lorebook[existingIndex].content = upsertGeneratedAssetBlock(
      data.lorebook[existingIndex].content,
      plan.generatedBlock,
    );
    return { target, lorebookIndex: existingIndex, created: false };
  }
  const entry = createAssetLorebookEntry(plan.generatedBlock, data.lorebook.length);
  data.lorebook.push(entry);
  return { target, lorebookIndex: data.lorebook.length - 1, created: true };
}
