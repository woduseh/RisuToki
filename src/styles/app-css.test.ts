import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'app.css'), 'utf-8');

describe('app.css – preview-header', () => {
  it('defines a visual rule for .preview-header button.active', () => {
    // JS toggles the "active" class on preview-header buttons
    // (see preview-panel.ts and controller.ts), so CSS must style it.
    expect(css).toMatch(/\.preview-header\s+button\.active\b/);
  });
});
