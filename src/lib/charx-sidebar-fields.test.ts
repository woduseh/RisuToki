import { describe, expect, it } from 'vitest';
import { getCharxInfoItems } from './charx-sidebar-fields';

describe('getCharxInfoItems', () => {
  it('includes creatorcomment and characterVersion in the charx info editing surface', () => {
    const items = getCharxInfoItems();
    const fields = items.map((item) => item.field);

    expect(fields).toEqual(
      expect.arrayContaining(['description', 'globalNote', 'defaultVariables', 'creatorcomment', 'characterVersion']),
    );
  });
});
