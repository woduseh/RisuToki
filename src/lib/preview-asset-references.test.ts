import { describe, expect, it } from 'vitest';
import { collectLiteralAssetReferences } from './preview-asset-references';
import { inspectPreviewAssetReferences } from './preview-asset-diagnostics';

describe('literal preview asset references', () => {
  it('collects the supported literal media names but skips complete nested dynamic expressions', () => {
    const text =
      '{{asset::{{getvar::image}}}}{{#if {{equal::x::y}}}}{{bgm::song}}{{/if}}\n{{videoimg::clip}}{{inlayeddata::pic}}{{path::file}}';
    expect(collectLiteralAssetReferences(text).map((entry) => entry.name)).toEqual(['song', 'clip', 'pic', 'file']);
    expect(collectLiteralAssetReferences(text)[0].offset).toBe(text.indexOf('{{bgm'));
    expect(collectLiteralAssetReferences('{{asset::unfinished')).toEqual([]);
  });

  it('keeps HTML opt-in and avoids dynamic src, URLs, data-src, and attribute text pretending to be src', () => {
    const text = `<img data-src="fake"><img title="src='fake'" src="image.webp"><audio src='song.ogg'></audio><video src="https://example.test/movie"><img src="{{raw::{{getvar::x}}}}"><img src="data:image/png;base64,a">`;
    expect(collectLiteralAssetReferences(text)).toEqual([]);
    expect(collectLiteralAssetReferences(text, { includeHtml: true }).map((entry) => [entry.kind, entry.name])).toEqual(
      [
        ['html', 'image.webp'],
        ['html', 'song.ogg'],
      ],
    );
  });

  it('bounds reference collection', () => {
    expect(collectLiteralAssetReferences('{{asset::x}}'.repeat(20), { maxReferences: 3 })).toHaveLength(3);
  });
});

describe('preview static asset diagnostics', () => {
  it('keeps original source indices and line numbers while resolving names case-insensitively', () => {
    const result = inspectPreviewAssetReferences(
      {
        firstMessage: '{{asset::KNOWN}}\n{{asset::missing}}',
        alternateGreetings: ['{{bg::alternate}}'],
        lorebook: [{ mode: 'folder' }, { comment: 'World', content: '{{raw::lore}}' }],
        regex: [{ type: 'disabled', out: '{{asset::replacement}}' }],
      },
      { known: 'data:valid' },
    );
    expect(result.missing.map((entry) => [entry.name, entry.source, entry.line])).toEqual([
      ['missing', { type: 'greeting', index: -1 }, 2],
      ['alternate', { type: 'greeting', index: 0 }, 1],
      ['lore', { type: 'lorebook', index: 1 }, 1],
      ['replacement', { type: 'regex', index: 0 }, 1],
    ]);
  });

  it('does not claim missing assets when the map was unavailable and caps stored diagnostics', () => {
    expect(inspectPreviewAssetReferences({ firstMessage: '{{asset::x}}' }, null)).toMatchObject({
      available: false,
      missing: [],
    });
    const result = inspectPreviewAssetReferences(
      { firstMessage: Array.from({ length: 120 }, (_, index) => `{{asset::asset${index}}}`).join('\n') },
      {},
    );
    expect(result.missing).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });
});
