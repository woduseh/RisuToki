import { describe, expect, it } from 'vitest';

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

async function runSearch(data: SearchFixture, options: Record<string, unknown>) {
  const modulePath = './mcp-search';
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

describe('searchAllTextSurfaces', () => {
  it('searches matching string fields, greetings, and lorebook content surfaces including read-only group greetings', async () => {
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
      totalMatches: 5,
    });

    expect(result.surfaces).toHaveLength(5);
    expect(result.surfaces.map((surface: { target: string }) => surface.target)).toEqual([
      'field:description',
      'field:firstMessage',
      'greeting:alternate:0',
      'greeting:groupOnly:0',
      'lorebook:0',
    ]);

    expect(result.surfaces).toMatchObject([
      {
        surfaceType: 'field',
        target: 'field:description',
        field: 'description',
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'Alpha' }],
      },
      {
        surfaceType: 'field',
        target: 'field:firstMessage',
        field: 'firstMessage',
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'alpha' }],
      },
      {
        surfaceType: 'greeting',
        target: 'greeting:alternate:0',
        field: 'alternateGreetings',
        greetingType: 'alternate',
        index: 0,
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'Alpha' }],
      },
      {
        surfaceType: 'greeting',
        target: 'greeting:groupOnly:0',
        field: 'groupOnlyGreetings',
        greetingType: 'groupOnly',
        index: 0,
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'alpha' }],
      },
      {
        surfaceType: 'lorebook',
        target: 'lorebook:0',
        index: 0,
        comment: 'Bridge lore',
        key: 'bridge',
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'alpha' }],
      },
    ]);
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
    expect(result.surfaces.map((surface: { target: string }) => surface.target)).toEqual([
      'field:description',
      'greeting:alternate:0',
      'lorebook:0',
    ]);

    expect(result.surfaces).toMatchObject([
      {
        surfaceType: 'field',
        target: 'field:description',
        totalMatches: 3,
        returnedMatches: 2,
        matches: [
          { match: 'alpha1', before: '--', after: '--', position: 2, line: 1 },
          { match: 'alpha2', before: '--', after: '--', position: 10, line: 1 },
        ],
      },
      {
        surfaceType: 'greeting',
        target: 'greeting:alternate:0',
        totalMatches: 2,
        returnedMatches: 2,
        matches: [
          { match: 'alpha4', before: '__', after: '__', position: 2, line: 1 },
          { match: 'alpha5', before: '__', after: '__', position: 10, line: 1 },
        ],
      },
      {
        surfaceType: 'lorebook',
        target: 'lorebook:0',
        totalMatches: 1,
        returnedMatches: 1,
        matches: [{ match: 'alpha6', before: '??', after: '??', position: 2, line: 1 }],
      },
    ]);
  });
});
