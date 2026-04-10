import { describe, expect, it } from 'vitest';
import {
  createToggleTemplateItem,
  parseCustomPromptTemplateToggle,
  serializeCustomPromptTemplateToggle,
} from './risup-toggle-model';

describe('risup toggle model', () => {
  it('parses all supported toggle item types', () => {
    const model = parseCustomPromptTemplateToggle(
      [
        'flag=Enable',
        'name=Name=text',
        'bio=Bio=textarea',
        'theme=Theme=select=Light,Dark',
        '=Section=divider',
        '=Hint=caption',
        '=Advanced=group',
        '==groupEnd',
      ].join('\n'),
    );

    expect(model.state).toBe('valid');
    expect(model.items.map((item) => item.type)).toEqual([
      'toggle',
      'text',
      'textarea',
      'select',
      'divider',
      'caption',
      'group',
      'groupEnd',
    ]);
  });

  it('round-trips valid toggle syntax without changing the serialized format', () => {
    const text = [
      'flag=Enable',
      'title=Name=with=equals=text',
      'theme=Theme=select=Light,Dark',
      '=Advanced=group',
      '==groupEnd',
    ].join('\n');

    const parsed = parseCustomPromptTemplateToggle(text);
    expect(parsed.state).toBe('valid');
    expect(serializeCustomPromptTemplateToggle(parsed)).toBe(text);
  });

  it('treats malformed structural lines as invalid', () => {
    const parsed = parseCustomPromptTemplateToggle('=broken');
    expect(parsed.state).toBe('invalid');
    expect(parsed.parseError).toContain('Line 1');
  });

  it('returns an empty model for blank input', () => {
    const parsed = parseCustomPromptTemplateToggle('\n  \n');
    expect(parsed.state).toBe('empty');
    expect(parsed.items).toEqual([]);
  });

  it('creates default items for every addable type', () => {
    expect(createToggleTemplateItem('toggle')).toMatchObject({ type: 'toggle', key: 'key', value: 'Label' });
    expect(createToggleTemplateItem('select')).toMatchObject({ type: 'select', options: ['opt1', 'opt2'] });
    expect(createToggleTemplateItem('group')).toMatchObject({ type: 'group', value: 'New Group' });
    expect(createToggleTemplateItem('groupEnd')).toEqual({ type: 'groupEnd' });
  });
});
