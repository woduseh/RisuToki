import { describe, expect, it } from 'vitest';
import { searchTextBlock } from './mcp-search';

describe('searchTextBlock', () => {
  it.each([false, true])('counts all matches while bounding returned context (regex=%s)', (regex) => {
    const content = 'skip\r\n'.repeat(1000) + 'Alpha\r\nalpha alpha\r\n'.repeat(1000);
    const result = searchTextBlock(content, { query: 'alpha', regex, maxMatches: 2, contextChars: 2 });
    expect(result.totalMatches).toBe(3000);
    expect(result.matches).toEqual([
      { match: 'Alpha', before: 'p\n', after: '\na', position: 5000, line: 1001 },
      { match: 'alpha', before: 'a\n', after: ' a', position: 5006, line: 1002 },
    ]);
  });

  it('counts non-overlapping literal matches and returns no matches for an empty literal', () => {
    expect(searchTextBlock('aaaaa', { query: 'aa', maxMatches: 1 }).totalMatches).toBe(2);
    expect(searchTextBlock('abc', { query: '' }).totalMatches).toBe(0);
  });

  it.each(['g', 'gu', 'gv'])('advances empty regex matches with %s flags', (flags) => {
    const result = searchTextBlock('😀\nx', { query: '(?:)', regex: true, flags, maxMatches: 2 });
    expect(result.totalMatches).toBe(flags === 'g' ? 5 : 4);
    expect(result.matches.map((match) => match.position)).toEqual(flags === 'g' ? [0, 1] : [0, 2]);
  });

  it('preserves sticky matching and line numbers at newline boundaries', () => {
    expect(searchTextBlock('aa ba', { query: 'a', regex: true, flags: 'y', maxMatches: 1 }).totalMatches).toBe(2);
    const result = searchTextBlock('a\nb\n', { query: '^|$', regex: true, flags: 'gm' });
    expect(result.matches.map(({ position, line }) => [position, line])).toEqual([
      [0, 1],
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 3],
    ]);
  });
});

interface SearchFixture {
  description?: string;
  firstMessage?: string;
  alternateGreetings?: string[];
  groupOnlyGreetings?: string[];
  lorebook?: Array<{
    comment?: string;
    key?: string;
    content?: string;
  }>;
  [key: string]: unknown;
}

interface SurfaceSummary {
  target: string;
  [key: string]: unknown;
}

async function runSearch(data: SearchFixture, options: Record<string, unknown>) {
  const modulePath = './mcp-search.ts';
  const { searchAllTextSurfaces } = await import(modulePath);
  return Promise.resolve(searchAllTextSurfaces(data, options));
}

function createCrossSurfaceFixture(): SearchFixture {
  return {
    description: 'Field Alpha is searchable.',
    firstMessage: 'First alpha hello.',
    globalNote: 'No match here.',
    alternateGreetings: ['Alternate Alpha greeting.', 'Secondary hello.'],
    groupOnlyGreetings: ['Read-only alpha group greeting.'],
    lorebook: [
      {
        comment: 'Bridge lore',
        key: 'bridge',
        content: 'Lore alpha entry.',
      },
      {
        comment: 'Quiet lore',
        key: 'quiet',
        content: 'Nothing interesting.',
      },
    ],
  };
}

function mapSurfacesByTarget(surfaces: SurfaceSummary[]) {
  return new Map(surfaces.map((surface) => [surface.target, surface]));
}

describe('searchAllTextSurfaces', () => {
  it('searches matching string fields, alternate greetings, and lorebook content while hiding group greetings', async () => {
    const result = await runSearch(createCrossSurfaceFixture(), {
      query: 'alpha',
      includeGreetings: true,
      includeLorebook: true,
      contextChars: 12,
      maxMatchesPerSurface: 5,
    });

    expect(result).toMatchObject({
      query: 'alpha',
      regex: false,
      contextChars: 12,
      maxMatchesPerSurface: 5,
      totalMatches: 4,
    });

    expect(result.surfaces).toHaveLength(4);
    expect(result.surfaces.map((surface: { target: string }) => surface.target).sort()).toEqual(
      ['field:description', 'field:firstMessage', 'greeting:alternate:0', 'lorebook:0'].sort(),
    );

    const surfacesByTarget = mapSurfacesByTarget(result.surfaces);

    expect(surfacesByTarget.get('field:description')).toMatchObject({
      surfaceType: 'field',
      target: 'field:description',
      field: 'description',
      totalMatches: 1,
      returnedMatches: 1,
      matches: [{ match: 'Alpha' }],
    });
    expect(surfacesByTarget.get('field:firstMessage')).toMatchObject({
      surfaceType: 'field',
      target: 'field:firstMessage',
      field: 'firstMessage',
      totalMatches: 1,
      returnedMatches: 1,
      matches: [{ match: 'alpha' }],
    });
    expect(surfacesByTarget.get('greeting:alternate:0')).toMatchObject({
      surfaceType: 'greeting',
      target: 'greeting:alternate:0',
      field: 'alternateGreetings',
      greetingType: 'alternate',
      index: 0,
      totalMatches: 1,
      returnedMatches: 1,
      matches: [{ match: 'Alpha' }],
    });
    expect(surfacesByTarget.get('lorebook:0')).toMatchObject({
      surfaceType: 'lorebook',
      target: 'lorebook:0',
      index: 0,
      comment: 'Bridge lore',
      key: 'bridge',
      totalMatches: 1,
      returnedMatches: 1,
      matches: [{ match: 'alpha' }],
    });
  });

  it('supports regex queries, trimmed context windows, and per-surface match caps', async () => {
    const result = await runSearch(
      {
        description: '--alpha1--alpha2--alpha3--',
        alternateGreetings: ['__alpha4__alpha5__'],
        groupOnlyGreetings: [],
        lorebook: [
          {
            comment: 'Numeric lore',
            key: 'digits',
            content: '??alpha6??',
          },
        ],
      },
      {
        query: 'alpha\\d',
        regex: true,
        flags: 'g',
        includeGreetings: true,
        includeLorebook: true,
        contextChars: 2,
        maxMatchesPerSurface: 2,
      },
    );

    expect(result).toMatchObject({
      query: 'alpha\\d',
      regex: true,
      flags: 'g',
      contextChars: 2,
      maxMatchesPerSurface: 2,
      totalMatches: 6,
    });

    expect(result.surfaces).toHaveLength(3);
    expect(result.surfaces.map((surface: { target: string }) => surface.target).sort()).toEqual(
      ['field:description', 'greeting:alternate:0', 'lorebook:0'].sort(),
    );

    const surfacesByTarget = mapSurfacesByTarget(result.surfaces);

    expect(surfacesByTarget.get('field:description')).toMatchObject({
      surfaceType: 'field',
      target: 'field:description',
      totalMatches: 3,
      returnedMatches: 2,
      matches: [
        { match: 'alpha1', before: '--', after: '--', position: 2, line: 1 },
        { match: 'alpha2', before: '--', after: '--', position: 10, line: 1 },
      ],
    });
    expect(surfacesByTarget.get('greeting:alternate:0')).toMatchObject({
      surfaceType: 'greeting',
      target: 'greeting:alternate:0',
      totalMatches: 2,
      returnedMatches: 2,
      matches: [
        { match: 'alpha4', before: '__', after: '__', position: 2, line: 1 },
        { match: 'alpha5', before: '__', after: '__', position: 10, line: 1 },
      ],
    });
    expect(surfacesByTarget.get('lorebook:0')).toMatchObject({
      surfaceType: 'lorebook',
      target: 'lorebook:0',
      totalMatches: 1,
      returnedMatches: 1,
      matches: [{ match: 'alpha6', before: '??', after: '??', position: 2, line: 1 }],
    });
  });
});
