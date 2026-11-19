// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateChangedUimoriExtensions, validateUimoriExtension } from './uimori-extensions';

const guide = {
  instructions: '미라는 평소 담담하게 말한다.',
  terms: [
    { source: 'Mira', target: '미라' },
    { source: 'Rose', target: '로즈', note: '인물 이름일 때만. 꽃은 장미.' },
  ],
};
const profiles = [{ id: 'mira', name: '미라', appearance: 'silver hair', referenceImageId: 'img_01.webp' }];

describe('validateUimoriExtension', () => {
  it('accepts absent values, both Uimori settings, and keys a newer Uimori may add', () => {
    expect(validateUimoriExtension(undefined)).toBeNull();
    expect(validateUimoriExtension({ translationGuide: { instructions: '', terms: [] } })).toBeNull();
    expect(validateUimoriExtension({ translationGuide: guide, illustrationProfiles: profiles, future: 1 })).toBeNull();
  });

  it.each([
    ['a non-object extension', [], 'extensions.uimori must be an object'],
    ['an extra guide key', { translationGuide: { ...guide, glossary: [] } }, 'only instructions and terms'],
    [
      'overlong instructions',
      { translationGuide: { instructions: 'x'.repeat(20_001), terms: [] } },
      'at most 20000 characters',
    ],
    [
      'more than 500 terms',
      { translationGuide: { instructions: '', terms: Array(501).fill({ source: 'a', target: 'b' }) } },
      'at most 500 entries',
    ],
    [
      'a blank target',
      { translationGuide: { instructions: '', terms: [{ source: 'Mira', target: ' ' }] } },
      'terms[0]',
    ],
    [
      'a non-string note',
      { translationGuide: { instructions: '', terms: [{ source: 'a', target: 'b', note: 1 }] } },
      'terms[0].note',
    ],
    ['more than 32 profiles', { illustrationProfiles: Array(33).fill(profiles[0]) }, 'at most 32 profiles'],
    ['a duplicate profile id', { illustrationProfiles: [profiles[0], { ...profiles[0], name: 'B' }] }, 'duplicates'],
    ['a blank appearance', { illustrationProfiles: [{ id: 'a', name: 'A', appearance: '' }] }, 'appearance'],
    [
      'a path as reference image id',
      { illustrationProfiles: [{ ...profiles[0], referenceImageId: 'assets/a.png' }] },
      'referenceImageId',
    ],
  ])('rejects %s', (_label, value, message) => {
    expect(validateUimoriExtension(value)).toContain(message);
  });
});

describe('validateChangedUimoriExtensions', () => {
  const card = (uimori: unknown) => ({ _card: { data: { extensions: { uimori } } }, _moduleData: null });

  it('checks only hosts whose extensions.uimori value changed', () => {
    const invalid = card({ translationGuide: { instructions: 1, terms: [] } });
    expect(() => validateChangedUimoriExtensions(invalid, structuredClone(invalid))).not.toThrow();
    expect(() => validateChangedUimoriExtensions(card(undefined), invalid)).toThrow(
      'Invalid /_card/data/extensions/uimori',
    );
  });

  it('locates module extensions with and without the risuModule envelope', () => {
    const wrapped = { _moduleData: { type: 'risuModule', module: { extensions: { uimori: [] } } } };
    const bare = { _moduleData: { extensions: { uimori: [] } } };
    expect(() => validateChangedUimoriExtensions({ _moduleData: { module: {} } }, wrapped)).toThrow(
      'Invalid /_moduleData/module/extensions/uimori',
    );
    expect(() => validateChangedUimoriExtensions({ _moduleData: {} }, bare)).toThrow(
      'Invalid /_moduleData/extensions/uimori',
    );
  });
});
