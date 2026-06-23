import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeMarkdownPreview, showMarkdownPreview } from './markdown-preview';

describe('markdown preview', () => {
  beforeEach(() => {
    window.tokiAPI = {
      openExternalUrl: vi.fn(),
    } as unknown as Window['tokiAPI'];
  });

  afterEach(() => {
    closeMarkdownPreview();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders common markdown while removing executable HTML', () => {
    showMarkdownPreview(
      '# Guide\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<img src="x" onerror="alert(1)"><script>alert(1)</script>',
      'guide.md',
    );

    const content = document.querySelector('.markdown-body')!;
    expect(content.querySelector('h1')?.textContent).toBe('Guide');
    expect(content.querySelector('table')).not.toBeNull();
    expect(content.innerHTML).not.toContain('onerror');
    expect(content.innerHTML).not.toContain('<script');
  });

  it('opens only allowed absolute links through the preload bridge', () => {
    const openExternalUrl = vi.fn().mockResolvedValue(true);
    window.tokiAPI.openExternalUrl = openExternalUrl;
    showMarkdownPreview('[safe](https://example.com) [local](./other.md) [bad](javascript:alert(1))', 'guide.md');

    const links = [...document.querySelectorAll<HTMLAnchorElement>('.markdown-body a')];
    links[0].click();
    links[1].click();

    expect(openExternalUrl).toHaveBeenCalledOnce();
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com');
    expect(document.querySelector('.markdown-body')?.innerHTML).not.toContain('javascript:');
  });
});
