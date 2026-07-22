import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'workspace.css'), 'utf-8');

describe('workspace.css – reference drawer', () => {
  it('renders references as a separate tall side drawer instead of consuming the terminal shelf', () => {
    expect(css).toMatch(
      /#reference-drawer\s*\{[^}]*position:\s*absolute;[^}]*top:\s*8px;[^}]*right:\s*10px;[^}]*bottom:\s*10px;[^}]*width:\s*clamp\(320px,\s*28vw,\s*420px\);[^}]*grid-template-rows:\s*42px minmax\(0,\s*1fr\);/s,
    );
    expect(css).toMatch(/#app-body\.utility-open\s+#reference-drawer\s*\{[^}]*bottom:\s*calc\(/s);
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
  });

  it('allows Vue to hide the editor surface while the welcome screen is active', () => {
    expect(css).toMatch(/#editor-surface\s*\{[^}]*display:\s*flex;/s);
    expect(css).not.toMatch(/#editor-surface\s*\{[^}]*display:\s*flex\s*!important;/s);
  });

  it('uses the available width as a single overlay on smaller windows', () => {
    expect(css).toMatch(
      /@media\s*\(max-width:\s*1019px\)[\s\S]*#reference-drawer\s*\{[^}]*left:\s*10px;[^}]*width:\s*auto;/,
    );
  });
});
