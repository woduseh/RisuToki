import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFolderItem } from '../lib/sidebar-builder';

const css = readFileSync(resolve(__dirname, 'workspace.css'), 'utf-8');

describe('workspace sidebar folder visibility', () => {
  afterEach(() => {
    document.querySelectorAll('[data-cascade-test]').forEach((element) => element.remove());
  });

  it.each(['character', 'module', 'messages', 'scripts', 'basic', 'model', 'parameters', 'advanced'])(
    'keeps collapsed children hidden in the %s workspace and follows folder clicks',
    (workspace) => {
      const style = document.createElement('style');
      style.dataset.cascadeTest = '';
      style.textContent = readFileSync(resolve(__dirname, 'app.css'), 'utf-8') + '\n' + css;
      document.head.appendChild(style);
      const app = document.createElement('div');
      app.id = 'app-body';
      app.dataset.cascadeTest = '';
      app.dataset.workspace = workspace;
      const tree = document.createElement('div');
      tree.id = 'sidebar-tree';
      const { header, children } = createFolderItem(`cascade-${workspace}`, '', 0);
      header.dataset.workspace = workspace;
      children.dataset.workspace = workspace;
      children.textContent = 'Child script';
      tree.append(header, children);
      app.appendChild(tree);
      document.body.appendChild(app);

      expect(getComputedStyle(header).display).not.toBe('none');
      expect(getComputedStyle(children).display).toBe('none');
      header.click();
      expect(getComputedStyle(children).display).toBe('block');
      app.dataset.workspace = 'unrelated';
      expect(getComputedStyle(children).display).toBe('none');
      app.dataset.workspace = workspace;
      header.click();
      expect(getComputedStyle(children).display).toBe('none');
    },
  );
});

describe('workspace.css – document workspace geometry', () => {
  it('exposes preset toggle and variable rows in their dedicated navigator workspace', () => {
    expect(css).toContain("#app-body[data-workspace='toggles'] #sidebar-tree > [data-workspace='toggles']");
    expect(css).toMatch(
      /#app-body\[data-workspace='toggles'\] #sidebar-tree > \[data-workspace='toggles'\],[^}]*display:\s*block\s*!important;/s,
    );
  });

  it('uses one resizable right sidebar column for references', () => {
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

  it('gives the open terminal its full shelf height without a redundant tab row', () => {
    expect(css).toMatch(/#app-body\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);[^}]*height:\s*100%;/s);
    expect(css).toMatch(
      /#app-body\.utility-open\s*\{[^}]*padding-bottom:\s*calc\(var\(--utility-effective-height\) \+ 10px\);/s,
    );
    expect(css).toMatch(
      /#utility-shelf\s*\{[^}]*position:\s*absolute;[^}]*left:\s*10px;[^}]*right:\s*10px;[^}]*bottom:\s*10px;[^}]*display:\s*none;[^}]*height:\s*var\(--utility-effective-height\);/s,
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
    // Absolute grid children otherwise resolve their width against a collapsed track.
    expect(css).toMatch(
      /#right-sidebar\s*\{[^}]*position:\s*absolute;[^}]*grid-column:\s*auto;[^}]*grid-row:\s*auto;/s,
    );
    expect(css).toMatch(
      /#workspace-navigator\s*\{[^}]*position:\s*absolute;[^}]*grid-column:\s*auto;[^}]*grid-row:\s*auto;/s,
    );
  });

  it('keeps welcome actions reachable and reserves the actual responsive utility height', () => {
    expect(css).toMatch(/#welcome-screen\s*\{[^}]*max-height:\s*100%;[^}]*overflow:\s*auto;/s);
    expect(css).toMatch(
      /@media\s*\(max-height:\s*680px\)\s*\{\s*#app-body\s*\{[^}]*--utility-effective-height:\s*min\(var\(--utility-height,\s*250px\),\s*28vh\);/s,
    );
    expect(css).toMatch(/#slot-left\s*\{[^}]*height:\s*auto\s*!important;[^}]*flex:\s*1;[^}]*min-height:\s*0;/s);
  });
});
