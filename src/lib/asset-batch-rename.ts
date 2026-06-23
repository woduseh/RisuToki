export interface BatchRenameAsset {
  path: string;
}

export type AssetBatchRenameMode =
  | { kind: 'pattern'; baseName: string; start?: number; padding?: number }
  | { kind: 'replace'; find: string; replace: string };

export interface AssetBatchRenameOperation {
  oldPath: string;
  newName: string;
}

export interface AssetBatchRenamePreview extends AssetBatchRenameOperation {
  newPath: string;
}

export interface AssetBatchRenamePlan {
  operations: AssetBatchRenameOperation[];
  preview: AssetBatchRenamePreview[];
  errors: string[];
}

const INVALID_FILE_NAME = /[<>:"/\\|?*\u0000-\u001f]/;

function splitAssetPath(assetPath: string): { dir: string; name: string; stem: string; ext: string } {
  const slash = assetPath.lastIndexOf('/');
  const dir = slash >= 0 ? assetPath.slice(0, slash + 1) : '';
  const name = slash >= 0 ? assetPath.slice(slash + 1) : assetPath;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { dir, name, stem: name, ext: '' };
  return { dir, name, stem: name.slice(0, dot), ext: name.slice(dot) };
}

function sanitizeBaseName(value: string): string {
  return value.trim();
}

function buildPatternName(
  mode: Extract<AssetBatchRenameMode, { kind: 'pattern' }>,
  index: number,
  ext: string,
): string {
  const start = Number.isFinite(mode.start) ? Math.max(0, Math.trunc(mode.start || 0)) : 1;
  const padding = Number.isFinite(mode.padding) ? Math.max(1, Math.trunc(mode.padding || 0)) : 3;
  const number = String(start + index).padStart(padding, '0');
  return `${sanitizeBaseName(mode.baseName)}_${number}${ext}`;
}

function buildReplaceName(mode: Extract<AssetBatchRenameMode, { kind: 'replace' }>, stem: string, ext: string): string {
  return `${stem.split(mode.find).join(mode.replace)}${ext}`;
}

export function planAssetBatchRename(
  assets: BatchRenameAsset[],
  selectedPaths: string[],
  mode: AssetBatchRenameMode,
): AssetBatchRenamePlan {
  const assetsByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const uniqueSelected = [...new Set(selectedPaths)].filter((path) => assetsByPath.has(path));
  const errors: string[] = [];
  const preview: AssetBatchRenamePreview[] = [];

  if (uniqueSelected.length < 2) {
    errors.push('에셋을 2개 이상 선택하세요.');
  }
  if (mode.kind === 'pattern' && !sanitizeBaseName(mode.baseName)) {
    errors.push('패턴 이름을 입력하세요.');
  }
  if (mode.kind === 'replace' && !mode.find) {
    errors.push('찾을 문자열을 입력하세요.');
  }

  const existingPaths = new Set(assets.map((asset) => asset.path.toLowerCase()));
  const selectedPathSet = new Set(uniqueSelected.map((path) => path.toLowerCase()));
  const plannedPaths = new Set<string>();

  uniqueSelected.forEach((oldPath, index) => {
    const { dir, name, stem, ext } = splitAssetPath(oldPath);
    const newName = mode.kind === 'pattern' ? buildPatternName(mode, index, ext) : buildReplaceName(mode, stem, ext);
    const newPath = `${dir}${newName}`;
    const normalizedNewPath = newPath.toLowerCase();

    if (!newName.trim()) {
      errors.push(`${name}: 새 이름이 비어 있습니다.`);
    }
    if (INVALID_FILE_NAME.test(newName)) {
      errors.push(`${newName}: 파일명에 사용할 수 없는 문자가 있습니다.`);
    }
    if (!newName.endsWith(ext)) {
      errors.push(`${newName}: 확장자는 ${ext || '(없음)'} 그대로 유지해야 합니다.`);
    }
    if (plannedPaths.has(normalizedNewPath)) {
      errors.push(`${newName}: 일괄 변경 결과끼리 중복됩니다.`);
    }
    if (selectedPathSet.has(normalizedNewPath) && normalizedNewPath !== oldPath.toLowerCase()) {
      errors.push(`${newName}: 선택된 다른 에셋의 기존 경로와 충돌합니다.`);
    }
    if (existingPaths.has(normalizedNewPath) && !selectedPathSet.has(normalizedNewPath)) {
      errors.push(`${newName}: 같은 경로에 이미 존재합니다.`);
    }
    plannedPaths.add(normalizedNewPath);
    preview.push({ oldPath, newName, newPath });
  });

  return {
    operations: errors.length ? [] : preview.map(({ oldPath, newName }) => ({ oldPath, newName })),
    preview,
    errors,
  };
}
