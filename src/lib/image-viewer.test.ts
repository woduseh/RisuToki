import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showImageViewer } from './image-viewer';

function setElementSize(el: Element, width: number, height: number): void {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
}

function setImageNaturalSize(img: HTMLImageElement, width: number, height: number): void {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: width });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: height });
}

async function renderViewer(base64: string | null = 'AAAA'): Promise<HTMLElement> {
  window.tokiAPI.getAssetData = vi.fn(async () => base64);
  const container = document.createElement('div');
  document.body.appendChild(container);
  await showImageViewer(container, 'assets/other/image/large.png');
  return container;
}

beforeEach(() => {
  window.tokiAPI = {
    getAssetData: vi.fn(),
  } as unknown as Window['tokiAPI'];
});

describe('image viewer', () => {
  it('shows an empty state when image data is missing', async () => {
    const container = await renderViewer(null);

    expect(container.querySelector('.empty-state')?.textContent).toBe('이미지를 불러올 수 없습니다');
  });

  it('defaults to fitting the image inside the viewer', async () => {
    const container = await renderViewer();
    const wrapper = container.firstElementChild as HTMLElement;
    const img = wrapper.querySelector('img')!;

    setElementSize(wrapper, 400, 300);
    setImageNaturalSize(img, 800, 600);
    img.dispatchEvent(new Event('load'));

    expect(img.style.transform).toContain('scale(0.3933333333333333)');
    expect(wrapper.textContent).toContain('39%');
  });

  it('switches between actual size and fit size buttons', async () => {
    const container = await renderViewer();
    const wrapper = container.firstElementChild as HTMLElement;
    const img = wrapper.querySelector('img')!;
    const buttons = wrapper.querySelectorAll('button');

    setElementSize(wrapper, 400, 300);
    setImageNaturalSize(img, 800, 600);
    img.dispatchEvent(new Event('load'));

    buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(img.style.transform).toContain('scale(1)');
    expect(wrapper.textContent).toContain('100%');

    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(img.style.transform).toContain('scale(0.3933333333333333)');
    expect(wrapper.textContent).toContain('39%');
  });

  it('zooms with a plain wheel event and prevents default scrolling', async () => {
    const container = await renderViewer();
    const wrapper = container.firstElementChild as HTMLElement;
    const img = wrapper.querySelector('img')!;

    setElementSize(wrapper, 400, 300);
    setImageNaturalSize(img, 800, 600);
    img.dispatchEvent(new Event('load'));

    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1 });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    wrapper.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(img.style.transform).toContain('scale(0.4326666666666667)');
    expect(wrapper.textContent).toContain('43%');
  });
});
