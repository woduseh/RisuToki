import { describe, expect, it, vi } from 'vitest';

import { createPreviewWorkbench, PREVIEW_VIEWPORT_PRESETS } from './preview-workbench';

describe('preview workbench', () => {
  it('selects alternate greetings and viewport presets', () => {
    const onGreetingChange = vi.fn();
    const onViewportChange = vi.fn();
    const workbench = createPreviewWorkbench(document, ['첫 번째', '두 번째'], null, {
      onGreetingChange,
      onViewportChange,
      onAssetInsert: vi.fn(),
    });

    expect(workbench.greetingSelect.options).toHaveLength(3);
    workbench.greetingSelect.value = '1';
    workbench.greetingSelect.dispatchEvent(new Event('change'));
    expect(onGreetingChange).toHaveBeenCalledWith(1);

    workbench.viewportButtons[2].click();
    expect(onViewportChange).toHaveBeenCalledWith(PREVIEW_VIEWPORT_PRESETS[2]);
    expect(workbench.viewportButtons[2].getAttribute('aria-pressed')).toBe('true');
    expect(workbench.viewportButtons[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('renders typed asset cards, deduplicates aliases, and inserts the selected asset', () => {
    const onAssetInsert = vi.fn();
    const workbench = createPreviewWorkbench(
      document,
      [],
      {
        manifest: [
          {
            name: 'portrait',
            uri: 'data:image/png;base64,AAAA',
            ext: 'png',
            mime: 'image/png',
            type: 'asset',
            source: 'card',
          },
          {
            name: 'portrait',
            uri: 'data:image/png;base64,AAAA',
            ext: 'png',
            mime: 'image/png',
            type: 'zip-asset',
            source: 'zip',
          },
          {
            name: 'theme',
            uri: 'data:audio/mpeg;base64,BBBB',
            ext: 'mp3',
            mime: 'audio/mpeg',
            type: 'asset',
            source: 'card',
          },
        ],
      },
      {
        onGreetingChange: vi.fn(),
        onViewportChange: vi.fn(),
        onAssetInsert,
      },
    );

    const cards = workbench.assetDrawer.querySelectorAll<HTMLButtonElement>('.preview-asset-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('img')?.src).toContain('data:image/png');
    expect(cards[1].querySelector('.preview-asset-kind')?.textContent).toBe('♫');

    cards[1].click();
    expect(onAssetInsert).toHaveBeenCalledWith('theme');
  });

  it('disables every interactive workbench control while loading', () => {
    const workbench = createPreviewWorkbench(document, [], null, {
      onGreetingChange: vi.fn(),
      onViewportChange: vi.fn(),
      onAssetInsert: vi.fn(),
    });

    workbench.setLoading(true);

    expect(workbench.greetingSelect.disabled).toBe(true);
    expect(workbench.viewportButtons.every((button) => button.disabled)).toBe(true);
    expect(workbench.toolbar.querySelector<HTMLButtonElement>('.preview-asset-toggle')?.disabled).toBe(true);
  });
});
