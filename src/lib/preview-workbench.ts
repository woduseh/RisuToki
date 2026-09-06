import type { PreviewAssetManifestEntry } from './preview-assets';

export interface PreviewAssetCatalog {
  manifest?: PreviewAssetManifestEntry[];
  icon?: string | null;
}

export type PreviewViewportPresetId = 'desktop' | 'tablet' | 'mobile';

export interface PreviewViewportPreset {
  id: PreviewViewportPresetId;
  label: string;
  width: number;
  height: number;
}

export const PREVIEW_VIEWPORT_PRESETS: PreviewViewportPreset[] = [
  { id: 'desktop', label: '데스크톱', width: 1024, height: 768 },
  { id: 'tablet', label: '태블릿', width: 768, height: 1024 },
  { id: 'mobile', label: '모바일', width: 390, height: 844 },
];

export interface PreviewWorkbenchCallbacks {
  onGreetingChange(index: number): void | Promise<void>;
  onViewportChange(preset: PreviewViewportPreset): void | Promise<void>;
  onAssetInsert(name: string): void;
}

export interface PreviewWorkbench {
  toolbar: HTMLDivElement;
  assetDrawer: HTMLDivElement;
  greetingSelect: HTMLSelectElement;
  viewportButtons: HTMLButtonElement[];
  setLoading(loading: boolean): void;
}

function uniqueManifestEntries(entries: PreviewAssetManifestEntry[]): PreviewAssetManifestEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.name}\u0000${entry.uri}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createAssetPreview(documentRef: Document, entry: PreviewAssetManifestEntry): HTMLElement {
  if (entry.mime.startsWith('image/')) {
    const image = documentRef.createElement('img');
    image.src = entry.uri;
    image.alt = '';
    image.loading = 'lazy';
    return image;
  }

  const fallback = documentRef.createElement('span');
  fallback.className = 'preview-asset-kind';
  fallback.textContent = entry.mime.startsWith('audio/')
    ? '♫'
    : entry.mime.startsWith('video/')
      ? '▶'
      : entry.mime.startsWith('font/')
        ? 'Aa'
        : '◆';
  return fallback;
}

export function createPreviewWorkbench(
  documentRef: Document,
  alternateGreetings: string[],
  previewAssets: PreviewAssetCatalog | null,
  callbacks: PreviewWorkbenchCallbacks,
  initialState?: { greetingIndex?: number; viewportPreset?: PreviewViewportPresetId },
): PreviewWorkbench {
  const toolbar = documentRef.createElement('div');
  toolbar.className = 'preview-workbench-toolbar';

  const greetingGroup = documentRef.createElement('label');
  greetingGroup.className = 'preview-tool-field';
  const greetingLabel = documentRef.createElement('span');
  greetingLabel.textContent = '첫 메시지';
  const greetingSelect = documentRef.createElement('select');
  greetingSelect.className = 'preview-tool-select';
  greetingSelect.setAttribute('aria-label', '프리뷰 첫 메시지 선택');

  const defaultGreeting = documentRef.createElement('option');
  defaultGreeting.value = '-1';
  defaultGreeting.textContent = '기본 첫 메시지';
  greetingSelect.appendChild(defaultGreeting);
  alternateGreetings.forEach((_greeting, index) => {
    const option = documentRef.createElement('option');
    option.value = String(index);
    option.textContent = `대체 인사 ${index + 1}`;
    greetingSelect.appendChild(option);
  });
  const initialGreeting = initialState?.greetingIndex ?? -1;
  greetingSelect.value = String(
    Number.isInteger(initialGreeting) && initialGreeting >= -1 && initialGreeting < alternateGreetings.length
      ? initialGreeting
      : -1,
  );
  greetingSelect.addEventListener('change', () => {
    void callbacks.onGreetingChange(Number(greetingSelect.value));
  });
  greetingGroup.append(greetingLabel, greetingSelect);

  const viewportGroup = documentRef.createElement('div');
  viewportGroup.className = 'preview-viewport-group';
  viewportGroup.setAttribute('role', 'group');
  viewportGroup.setAttribute('aria-label', '프리뷰 화면 크기');
  const initialViewport = PREVIEW_VIEWPORT_PRESETS.some((preset) => preset.id === initialState?.viewportPreset)
    ? initialState!.viewportPreset
    : 'desktop';
  const viewportButtons = PREVIEW_VIEWPORT_PRESETS.map((preset) => {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = `preview-tool-button${preset.id === initialViewport ? ' active' : ''}`;
    button.textContent = preset.label;
    button.title = `${preset.width} × ${preset.height}`;
    button.setAttribute('aria-pressed', preset.id === initialViewport ? 'true' : 'false');
    button.addEventListener('click', () => {
      for (const sibling of viewportGroup.querySelectorAll<HTMLButtonElement>('button')) {
        const active = sibling === button;
        sibling.classList.toggle('active', active);
        sibling.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      void callbacks.onViewportChange(preset);
    });
    viewportGroup.appendChild(button);
    return button;
  });

  const assetToggle = documentRef.createElement('button');
  assetToggle.type = 'button';
  assetToggle.className = 'preview-tool-button preview-asset-toggle';
  assetToggle.textContent = '에셋';
  assetToggle.setAttribute('aria-expanded', 'false');

  const assetDrawer = documentRef.createElement('div');
  assetDrawer.className = 'preview-asset-drawer';
  assetDrawer.hidden = true;

  const manifest = uniqueManifestEntries(previewAssets?.manifest || []);
  if (manifest.length === 0) {
    const empty = documentRef.createElement('div');
    empty.className = 'preview-asset-empty';
    empty.textContent = '표시할 에셋이 없습니다.';
    assetDrawer.appendChild(empty);
  } else {
    for (const entry of manifest) {
      const item = documentRef.createElement('button');
      item.type = 'button';
      item.className = 'preview-asset-card';
      item.title = `${entry.name}\n${entry.mime}\n${entry.source}`;
      item.appendChild(createAssetPreview(documentRef, entry));

      const name = documentRef.createElement('span');
      name.className = 'preview-asset-name';
      name.textContent = entry.name;
      item.appendChild(name);
      item.addEventListener('click', () => callbacks.onAssetInsert(entry.name));
      assetDrawer.appendChild(item);
    }
  }

  assetToggle.addEventListener('click', () => {
    assetDrawer.hidden = !assetDrawer.hidden;
    assetToggle.classList.toggle('active', !assetDrawer.hidden);
    assetToggle.setAttribute('aria-expanded', assetDrawer.hidden ? 'false' : 'true');
  });

  toolbar.append(greetingGroup, viewportGroup, assetToggle);

  return {
    toolbar,
    assetDrawer,
    greetingSelect,
    viewportButtons,
    setLoading(loading) {
      greetingSelect.disabled = loading;
      assetToggle.disabled = loading;
      viewportButtons.forEach((button) => {
        button.disabled = loading;
      });
    },
  };
}
