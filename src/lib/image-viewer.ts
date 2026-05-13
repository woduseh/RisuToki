/**
 * Render a pan-and-zoom image viewer into a container element.
 * The container is expected to be empty before calling.
 */
import { extToMime } from './shared-utils';

type ViewerMode = 'fit' | 'actual' | 'custom';

const MIN_SCALE = 0.05;
const MAX_SCALE = 20;
const FIT_PADDING = 32;

function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
}

export async function showImageViewer(container: HTMLElement, assetPath: string): Promise<void> {
  const base64: string | null = await window.tokiAPI.getAssetData(assetPath);
  if (!base64) {
    container.innerHTML = '<div class="empty-state">이미지를 불러올 수 없습니다</div>';
    return;
  }

  const ext = assetPath.split('.').pop()!.toLowerCase();
  const mime = extToMime(ext);

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;background:#e8edf5;overflow:hidden;cursor:grab;';

  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'position:absolute;top:8px;right:8px;display:flex;gap:6px;z-index:10;background:rgba(255,255,255,0.92);border:1px solid #c8d6e5;border-radius:6px;padding:5px;box-shadow:0 4px 16px rgba(74,144,217,0.12);';

  const fitButton = document.createElement('button');
  fitButton.type = 'button';
  fitButton.textContent = '화면 맞춤';
  fitButton.title = '이미지를 현재 화면 크기에 맞춥니다';
  fitButton.style.cssText =
    'border:1px solid #c8d6e5;background:#f7fbff;color:#365a7a;border-radius:4px;padding:4px 9px;font-size:12px;cursor:pointer;';

  const actualButton = document.createElement('button');
  actualButton.type = 'button';
  actualButton.textContent = '실제 크기';
  actualButton.title = '이미지를 100% 실제 크기로 봅니다';
  actualButton.style.cssText =
    'border:1px solid #c8d6e5;background:#f7fbff;color:#365a7a;border-radius:4px;padding:4px 9px;font-size:12px;cursor:pointer;';
  toolbar.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation());
  toolbar.addEventListener('dblclick', (e: MouseEvent) => e.stopPropagation());

  const img = document.createElement('img');
  img.src = `data:${mime};base64,${base64}`;
  img.style.cssText =
    'position:absolute;top:0;left:0;transform-origin:0 0;border:1px solid #c8d6e5;border-radius:6px;pointer-events:none;box-shadow:0 4px 16px rgba(74,144,217,0.12);';
  img.draggable = false;
  img.title = assetPath;

  const info = document.createElement('div');
  info.style.cssText =
    'position:absolute;bottom:8px;right:8px;color:#4a6a8a;font-size:11px;background:rgba(255,255,255,0.9);padding:5px 10px;border-radius:6px;z-index:10;border:1px solid #c8d6e5;';

  // Pan & Zoom state
  let mode: ViewerMode = 'fit';
  let scale = 1,
    panX = 0,
    panY = 0;
  let dragStartX = 0,
    dragStartY = 0,
    panStartX = 0,
    panStartY = 0;

  function calculateFitScale(): number {
    const naturalWidth = img.naturalWidth || img.width || 1;
    const naturalHeight = img.naturalHeight || img.height || 1;
    const availableWidth = Math.max(1, wrapper.clientWidth - FIT_PADDING * 2);
    const availableHeight = Math.max(1, wrapper.clientHeight - FIT_PADDING * 2);
    return clampScale(Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight));
  }

  function updateButtons(): void {
    fitButton.style.background = mode === 'fit' ? '#dcecff' : '#f7fbff';
    fitButton.style.borderColor = mode === 'fit' ? '#7fb2e5' : '#c8d6e5';
    actualButton.style.background = mode === 'actual' ? '#dcecff' : '#f7fbff';
    actualButton.style.borderColor = mode === 'actual' ? '#7fb2e5' : '#c8d6e5';
  }

  function updateTransform(): void {
    const naturalWidth = img.naturalWidth || img.width || 1;
    const naturalHeight = img.naturalHeight || img.height || 1;
    const centeredX = (wrapper.clientWidth - naturalWidth * scale) / 2 + panX;
    const centeredY = (wrapper.clientHeight - naturalHeight * scale) / 2 + panY;
    img.style.transform = `translate(${centeredX}px, ${centeredY}px) scale(${scale})`;
    info.textContent = `${assetPath} (${((base64!.length * 0.75) / 1024).toFixed(1)} KB) — ${Math.round(scale * 100)}%`;
    updateButtons();
  }

  function setFitView(): void {
    mode = 'fit';
    scale = calculateFitScale();
    panX = 0;
    panY = 0;
    updateTransform();
  }

  function setActualView(): void {
    mode = 'actual';
    scale = 1;
    panX = 0;
    panY = 0;
    updateTransform();
  }

  fitButton.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    setFitView();
  });
  actualButton.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    setActualView();
  });

  // Wheel zoom
  wrapper.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      mode = 'custom';
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      scale = clampScale(scale * factor);
      updateTransform();
    },
    { passive: false },
  );

  // Left-click drag to pan
  const onMove = (e: MouseEvent): void => {
    panX = panStartX + (e.clientX - dragStartX);
    panY = panStartY + (e.clientY - dragStartY);
    updateTransform();
  };
  const onUp = (): void => {
    wrapper.style.cursor = 'grab';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  wrapper.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
    wrapper.style.cursor = 'grabbing';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Double-click to reset to the default fit view
  wrapper.addEventListener('dblclick', () => {
    setFitView();
  });

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (mode === 'fit') setFitView();
        })
      : null;
  resizeObserver?.observe(wrapper);

  img.addEventListener('load', setFitView, { once: true });

  toolbar.appendChild(fitButton);
  toolbar.appendChild(actualButton);
  wrapper.appendChild(img);
  wrapper.appendChild(toolbar);
  wrapper.appendChild(info);
  container.appendChild(wrapper);

  if (img.complete) {
    setFitView();
  } else {
    updateTransform();
  }
}
