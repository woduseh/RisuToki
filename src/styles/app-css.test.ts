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

describe('app.css – preview diagnostics', () => {
  it('defines a visible status banner rule for preview initialization', () => {
    expect(css).toMatch(/\.preview-status-banner\b/);
  });

  it('defines a visible error banner rule for preview failures', () => {
    expect(css).toMatch(/\.preview-error-banner\b/);
  });
});

describe('app.css – accessibility preferences', () => {
  it('honors reduced-motion preferences for transitions and animations', () => {
    expect(css).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    expect(css).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
    expect(css).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
  });
});

describe('app.css – status bar affordances', () => {
  it('keeps long status text clipped beside the dismiss affordance', () => {
    expect(css).toMatch(/#status-text\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;[^}]*\}/s);
  });

  it('styles the status dismiss button and visible focus state', () => {
    expect(css).toMatch(/#status-dismiss\s*\{[^}]*border-radius:\s*999px;[^}]*cursor:\s*pointer;[^}]*\}/s);
    expect(css).toMatch(/#status-dismiss:hover,\s*#status-dismiss:focus-visible\s*\{[^}]*outline:\s*2px/s);
  });
});

describe('app.css – form editor controls', () => {
  it('uses semantic theme colors for lorebook form headers', () => {
    expect(css).toMatch(
      /\.form-editor-header\s*\{[^}]*background:\s*linear-gradient\([^;]*var\(--ui-accent[^;]*var\(--ui-accent-strong/s,
    );
    expect(css).not.toMatch(/body\.dark-mode\s+\.form-editor-header\s*\{[^}]*#4a90d9/s);
  });

  it('styles the risup numeric disable action as a themed form control', () => {
    expect(css).toMatch(/\.form-disable-number-btn\s*\{[^}]*background:\s*var\(--accent-light\);[^}]*\}/s);
    expect(css).toMatch(/\.form-disable-number-btn:hover,\s*\.form-disable-number-btn:focus-visible\s*\{/);
    expect(css).toMatch(/\.form-disable-number-btn:disabled\s*\{/);
  });

  it('keeps RISUM module rows in natural flow and aligns switches with the input column', () => {
    expect(css).toMatch(/\.module-settings-form\s+\.form-editor-body\s*\{[^}]*gap:\s*8px;[^}]*\}/s);
    expect(css).toMatch(
      /\.module-settings-form\s+\.form-row,\s*\.module-settings-form\s+\.module-settings-switches\s*\{[^}]*flex-shrink:\s*0;[^}]*\}/s,
    );
    expect(css).toMatch(
      /\.module-settings-form\s+\.module-description-row\s*\{[^}]*align-items:\s*flex-start;[^}]*\}/s,
    );
    expect(css).toMatch(/\.module-settings-switches\s*\{[^}]*margin-left:\s*calc\(80px \+ 8px\);[^}]*\}/s);
  });
});

describe('app.css – character theme surfaces', () => {
  it('uses semantic character accents for avatar and terminal chat surfaces', () => {
    expect(css).toMatch(/#toki-status\s*\{[^}]*var\(--ui-accent[^}]*var\(--ui-on-accent/s);
    expect(css).toMatch(/\.chat-bubble\.user\s*\{[^}]*background:\s*var\(--ui-accent/s);
    expect(css).toMatch(/#chat-send-btn\s*\{[^}]*background:\s*var\(--ui-accent/s);
    expect(css).toMatch(/\.popout-header-main--editor\s*\{[^}]*var\(--ui-accent-strong/s);
  });
});

describe('app.css – project raw files', () => {
  it('styles the advanced project raw-file hint separately from normal sidebar items', () => {
    expect(css).toMatch(/\.project-raw-hint\s*\{/);
    expect(css).toMatch(/\.project-raw-hint\s*\{[^}]*border:\s*1px dashed var\(--border-color\);[^}]*\}/s);
  });
});

describe('app.css – manager panels', () => {
  it('styles lorebook and asset managers without legacy free-placement controls', () => {
    expect(css).toMatch(/\.manager-panel\s*\{/);
    expect(css).not.toMatch(/\.manager-expand\s*\{/);
    expect(css).not.toMatch(/\.panel-drop-zone\s*\{/);
    expect(css).not.toMatch(/\.slot-resizer\s*\{/);
  });

  it('keeps prompt manager controls in dedicated columns beside the full-width content', () => {
    expect(css).toMatch(/\.prompt-manager-row\s*\{[^}]*grid-template-columns:\s*20px 18px minmax\(0,\s*1fr\);[^}]*\}/s);
    expect(css).toMatch(/\.prompt-manager-badges\s*\{[^}]*grid-column:\s*3;[^}]*\}/s);
    expect(css).toMatch(/\.prompt-manager-row\s+\.manager-row-actions\s*\{[^}]*grid-column:\s*3;[^}]*\}/s);
  });

  it('keeps expanded lorebook folders in normal flow instead of shrinking beneath later folders', () => {
    expect(css).toMatch(/\.manager-folder-children\s*\{[^}]*flex:\s*0 0 auto;[^}]*\}/s);
    expect(css).toMatch(/\.manager-folder-row,\s*\.manager-root-entries\s*\{[^}]*flex-shrink:\s*0;[^}]*\}/s);
  });
});

describe('app.css – risup prompt editor layout', () => {
  it('keeps compact prompt metadata controls on one row', () => {
    expect(css).toMatch(
      /\.prompt-editor-inline-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*\}/s,
    );
    expect(css).toMatch(/\.prompt-editor-inline-field\s*\{[^}]*flex-direction:\s*column;[^}]*\}/s);
    expect(css).toMatch(/\.prompt-editor-input,\s*\.prompt-editor-select\s*\{[^}]*flex:\s*0 0 auto;[^}]*\}/s);
  });

  it('stretches the focused prompt block editor and its main text field', () => {
    expect(css).toMatch(
      /\.prompt-item-detail-container\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*\}/s,
    );
    expect(css).toMatch(
      /\.prompt-item-detail-card\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*\}/s,
    );
    expect(css).toMatch(
      /\.prompt-item-detail-card\s+\.prompt-editor-textarea\[data-field='text'\]\s*\{[^}]*flex:\s*1 1 160px;[^}]*min-height:\s*160px;[^}]*max-height:\s*100%;[^}]*\}/s,
    );
  });

  it('keeps prompt textareas inside their cards without a misleading native resize handle', () => {
    expect(css).toMatch(
      /\.prompt-editor-textarea\s*\{[^}]*min-height:\s*126px;[^}]*max-width:\s*100%;[^}]*resize:\s*none;[^}]*\}/s,
    );
    expect(css).toMatch(/\.prompt-item-detail-card\s*\{[^}]*overflow:\s*hidden;[^}]*\}/s);
    expect(css).toMatch(
      /\.prompt-item-detail-card\s+\.prompt-editor-card-body\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*\}/s,
    );
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
