import type { CssCacheEntry, Section } from './mcp-api-server';

export interface SectionCacheState<T> {
  source: string | null;
  result: T | null;
}

export function createLuaCache(parse: (lua: string) => Section[]): { get(lua: string): Section[]; invalidate(): void } {
  const cache: SectionCacheState<Section[]> = { source: null, result: null };
  return {
    get(lua: string): Section[] {
      if (lua !== cache.source) {
        cache.source = lua;
        cache.result = parse(lua);
      }
      return cache.result!.map((section) => ({ name: section.name, content: section.content }));
    },
    invalidate() {
      cache.source = null;
      cache.result = null;
    },
  };
}

export function createCssCache(parse: (css: string) => CssCacheEntry): {
  get(css: string): CssCacheEntry;
  invalidate(): void;
} {
  const cache: SectionCacheState<CssCacheEntry> = { source: null, result: null };
  return {
    get(css: string): CssCacheEntry {
      if (css !== cache.source) {
        cache.source = css;
        cache.result = parse(css);
      }
      return {
        sections: cache.result!.sections.map((section) => ({ name: section.name, content: section.content })),
        prefix: cache.result!.prefix,
        suffix: cache.result!.suffix,
      };
    },
    invalidate() {
      cache.source = null;
      cache.result = null;
    },
  };
}
