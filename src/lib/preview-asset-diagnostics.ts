import { collectLiteralAssetReferences, type LiteralAssetReference } from './preview-asset-references';
import type { PreviewCharData } from './preview-session';
export type PreviewSourceTarget =
  | { type: 'greeting'; index: number }
  | { type: 'lorebook' | 'regex'; index: number }
  | { type: 'lua' }
  | { type: 'asset'; name: string }
  | { type: 'field'; field: 'description' | 'personality' | 'scenario' | 'css' | 'backgroundEmbedding' };

export interface PreviewMissingAsset {
  name: string;
  kind: LiteralAssetReference['kind'];
  source: PreviewSourceTarget;
  sourceLabel: string;
  line: number;
}

export interface PreviewAssetDiagnosticReport {
  available: boolean;
  checkedReferences: number;
  missing: PreviewMissingAsset[];
  truncated: boolean;
}

const MAX_MISSING = 100;
const MAX_SCAN_CHARACTERS = 2_000_000;

function* sourceTexts(data: PreviewCharData): Generator<{ text: string; source: PreviewSourceTarget; label: string }> {
  yield { text: data.firstMessage || '', source: { type: 'greeting', index: -1 }, label: '기본 첫 메시지' };
  for (const [index, text] of (data.alternateGreetings || []).entries()) {
    yield { text, source: { type: 'greeting', index }, label: `대체 인사 ${index + 1}` };
  }
  for (const [field, label] of [
    ['description', '설명'],
    ['personality', '성격'],
    ['scenario', '시나리오'],
    ['css', 'CSS'],
    ['backgroundEmbedding', '배경 임베딩'],
  ] as const)
    yield { text: data[field] || '', source: { type: 'field', field }, label };
  yield { text: data.lua || '', source: { type: 'lua' }, label: 'Lua' };
  for (const [index, entry] of (data.lorebook || []).entries()) {
    if (typeof entry.content !== 'string' || entry.mode === 'folder') continue;
    yield { text: entry.content, source: { type: 'lorebook', index }, label: `로어북 · ${entry.comment || index + 1}` };
  }
  for (const [index, script] of (data.regex || []).entries()) {
    yield {
      text: String(script.replace || script.out || ''),
      source: { type: 'regex', index },
      label: `정규식 · ${script.comment || index + 1}`,
    };
  }
}

/** Static source references only: this does not claim that a conditional reference executed. */
export function inspectPreviewAssetReferences(
  data: PreviewCharData,
  assetMap: Record<string, string> | null,
): PreviewAssetDiagnosticReport {
  const report: PreviewAssetDiagnosticReport = {
    available: assetMap !== null,
    checkedReferences: 0,
    missing: [],
    truncated: false,
  };
  if (assetMap === null) return report;
  const known = new Set(
    Object.keys(assetMap)
      .filter((name) => !!assetMap[name])
      .map((name) => name.toLowerCase()),
  );
  let scanned = 0;
  for (const source of sourceTexts(data)) {
    const remaining = MAX_SCAN_CHARACTERS - scanned;
    if (remaining <= 0) {
      report.truncated = true;
      break;
    }
    const text = source.text.slice(0, remaining);
    scanned += text.length;
    if (text.length < source.text.length) report.truncated = true;
    const references = collectLiteralAssetReferences(text, { includeHtml: true, maxReferences: 1000 });
    if (references.length >= 1000) report.truncated = true;
    const seen = new Set<string>();
    for (const reference of references) {
      report.checkedReferences++;
      const name = reference.name.toLowerCase();
      if (known.has(name) || seen.has(name)) continue;
      if (reference.name.length > 1000) {
        report.truncated = true;
        continue;
      }
      seen.add(name);
      report.missing.push({
        name: reference.name,
        kind: reference.kind,
        source: source.source,
        sourceLabel: source.label.slice(0, 300),
        line: text.slice(0, reference.offset).split('\n').length,
      });
      if (report.missing.length >= MAX_MISSING) {
        report.truncated = true;
        return report;
      }
    }
  }
  return report;
}
