/**
 * Render a pan-and-zoom image viewer into a container element.
 * The container is expected to be empty before calling.
 */
export async function showImageViewer(container: HTMLElement, assetPath: string): Promise<void> {
  const base64: string | null = await window.tokiAPI.getAssetData(assetPath);
  if (!base64) {
    container.innerHTML = '<div class="empty-state">이미지를 불러올 수 없습니다</div>';
    return;
  }

  const ext = assetPath.split('.').pop()!.toLowerCase();
  const mime = ext === 'png' ? 'image/png' :
               ext === 'webp' ? 'image/webp' :
               ext === 'gif' ? 'image/gif' : 'image/jpeg';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;background:#e8edf5;overflow:hidden;cursor:grab;';

  const img = document.createElement('img');
  img.src = `data:${mime};base64,${base64}`;
  img.style.cssText = 'position:absolute;top:50%;left:50%;transform-origin:0 0;border:1px solid #c8d6e5;border-radius:6px;pointer-events:none;box-shadow:0 4px 16px rgba(74,144,217,0.12);';
  img.draggable = false;
  img.title = assetPath;

  const info = document.createElement('div');
  info.style.cssText = 'position:absolute;bottom:8px;right:8px;color:#4a6a8a;font-size:11px;background:rgba(255,255,255,0.9);padding:5px 10px;border-radius:6px;z-index:10;border:1px solid #c8d6e5;';

  // Pan & Zoom state
  let scale = 1, panX = 0, panY = 0;
  let dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

  function updateTransform(): void {
    img.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
    info.textContent = `${assetPath} (${(base64!.length * 0.75 / 1024).toFixed(1)} KB) — ${Math.round(scale * 100)}%`;
  }
  updateTransform();

  // Ctrl+Wheel zoom
  wrapper.addEventListener('wheel', (e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.max(0.05, Math.min(20, scale * factor));
      updateTransform();
    }
  }, { passive: false });

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

  // Double-click to reset
  wrapper.addEventListener('dblclick', () => {
    scale = 1; panX = 0; panY = 0;
    updateTransform();
  });

  wrapper.appendChild(img);
  wrapper.appendChild(info);
  container.appendChild(wrapper);
}
