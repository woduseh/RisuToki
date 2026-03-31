import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'app.css'), 'utf-8');

describe('app.css – preview-header', () => {
  it('defines a visual rule for shared popout action buttons in the active state', () => {
    // JS toggles the "active" class on shared popout action buttons
    // (see preview-panel.ts and popout/controller.ts), so CSS must style it.
    expect(css).toMatch(/\.popout-action-btn\.active\b/);
  });
});

describe('app.css – popout theme coherence', () => {
  it('defines a shared popout action button rule', () => {
    expect(css).toMatch(/\.popout-action-btn\b/);
  });

  it('defines extracted tree section header and popout empty-state rules', () => {
    expect(css).toMatch(/\.tree-section-header\b/);
    expect(css).toMatch(/\.popout-empty-state\b/);
  });

  it('defines dark-mode overrides for terminal chat surfaces', () => {
    expect(css).toMatch(/body\.dark-mode\s+#chat-view\b/);
    expect(css).toMatch(/body\.dark-mode\s+#chat-input-area\b/);
    expect(css).toMatch(/body\.dark-mode\s+\.chat-choice-btn\b/);
  });

  it('keeps terminal area theme-driven in dark mode', () => {
    expect(css).toMatch(/body\.dark-mode\s+#terminal-area\b/);
  });
});

describe('app.css – preview layout', () => {
  it('defines the fixed overlay shell needed to surface the preview above the app', () => {
    expect(css).toMatch(
      /\.preview-overlay\s*\{[^}]*position:\s*fixed;[^}]*display:\s*flex;[^}]*z-index:\s*3000;[^}]*\}/s,
    );
  });

  it('defines the preview panel as a sized flex column container', () => {
    expect(css).toMatch(
      /\.preview-panel\s*\{[^}]*width:\s*720px;[^}]*height:\s*85vh;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*\}/s,
    );
  });
});
