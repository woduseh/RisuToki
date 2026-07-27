import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'workspace.css'), 'utf-8');

describe('workspace.css – Codex-style docked panels', () => {
  it('uses one resizable right sidebar column for properties and references', () => {
    expect(css).toMatch(
      /#app-body\.right-sidebar-open\s+#workspace-shell\s*\{[^}]*grid-template-columns:\s*0 0 minmax\(0,\s*1fr\) var\(--ui-gap\) var\(--inspector-width\);/s,
    );
    expect(css).toMatch(
      /#app-body\.navigator-open\.right-sidebar-open\s+#workspace-shell\s*\{[^}]*var\(--navigator-width\)[^}]*var\(--inspector-width\);/s,
    );
    expect(css).toMatch(
      /#right-sidebar\s*\{[^}]*grid-template-rows:\s*var\(--workspace-pane-header-height\) minmax\(0,\s*1fr\);/s,
    );
    expect(css).not.toMatch(/#reference-drawer\s*\{/);
  });

  it('pins every workspace surface to its semantic grid column when neighboring panels are hidden', () => {
    expect(css).toMatch(/#workspace-navigator\s*\{[^}]*grid-column:\s*1;/s);
    expect(css).toMatch(/#navigator-resizer\s*\{[^}]*grid-column:\s*2;/s);
    expect(css).toMatch(/#workspace-editor\s*\{[^}]*grid-column:\s*3;/s);
    expect(css).toMatch(/#inspector-resizer\s*\{[^}]*grid-column:\s*4;/s);
    expect(css).toMatch(/#right-sidebar\s*\{[^}]*grid-column:\s*5;/s);
  });

  it('uses one shared height for left, editor, manager, and right panel headers', () => {
    expect(css).toMatch(/--workspace-pane-header-height:\s*40px;/);
    expect(css).toMatch(/#editor-header\s*\{[^}]*height:\s*var\(--workspace-pane-header-height\);/s);
    expect(css).toMatch(/\.sidebar-header\s*\{[^}]*height:\s*var\(--workspace-pane-header-height\);/s);
    expect(css).toMatch(/\.right-manager-header\s*\{[^}]*height:\s*var\(--workspace-pane-header-height\);/s);
  });

  it('styles the unified sidebar header as compact tabs with an active underline', () => {
    expect(css).toMatch(
      /\.right-sidebar-tabs\s+button\.active::after\s*\{[^}]*height:\s*2px;[^}]*background:\s*var\(--ui-accent\);/s,
    );
    expect(css).toMatch(/\.right-sidebar-content\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden;/s);
  });

  it('gives the open terminal its full shelf height without a redundant tab row', () => {
    expect(css).toMatch(/#app-body\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);[^}]*height:\s*100%;/s);
    expect(css).toMatch(/#app-body\.utility-open\s*\{[^}]*padding-bottom:\s*calc\(var\(--utility-height\) \+ 10px\);/s);
    expect(css).toMatch(
      /#utility-shelf\s*\{[^}]*position:\s*absolute;[^}]*left:\s*10px;[^}]*right:\s*10px;[^}]*bottom:\s*10px;[^}]*display:\s*none;[^}]*height:\s*var\(--utility-height\);/s,
    );
    expect(css).toMatch(/#app-body\.utility-open\s+#utility-shelf\s*\{[^}]*display:\s*block;/s);
    expect(css).toMatch(/#workspace-bar\s*\{[^}]*grid-row:\s*1;/s);
    expect(css).toMatch(/#workspace-shell\s*\{[^}]*grid-row:\s*2;/s);
    expect(css).not.toMatch(/\.utility-tabs\s*\{/);
    expect(css).not.toMatch(/#terminal-shelf-launcher\s*\{/);
  });

  it('allows Vue to hide the editor surface while the welcome screen is active', () => {
    expect(css).toMatch(/#editor-surface\s*\{[^}]*display:\s*flex;/s);
    expect(css).not.toMatch(/#editor-surface\s*\{[^}]*display:\s*flex\s*!important;/s);
  });

  it('uses the unified sidebar as a single overlay on smaller windows', () => {
    expect(css).toMatch(
      /@media\s*\(max-width:\s*1179px\)[\s\S]*#right-sidebar\s*\{[^}]*position:\s*absolute;[^}]*right:\s*10px;[^}]*width:\s*min\(var\(--inspector-width\),\s*calc\(100% - 40px\)\);/,
    );
  });
});
