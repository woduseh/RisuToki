import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFolderItem } from '../lib/sidebar-builder';

const css = readFileSync(resolve(__dirname, 'workspace.css'), 'utf-8');

describe('workspace sidebar folder visibility', () => {
  afterEach(() => {
    document.querySelectorAll('[data-cascade-test]').forEach((element) => element.remove());
  });

  it('keeps collapsed children hidden and clickable across every document workspace', () => {
    const workspaces = [
      'character',
      'module',
      'messages',
      'scripts',
      'basic',
      'model',
      'parameters',
      'advanced',
      'toggles',
    ];
    const style = document.createElement('style');
    style.dataset.cascadeTest = '';
    style.textContent = readFileSync(resolve(__dirname, 'app.css'), 'utf-8') + '\n' + css;
    document.head.appendChild(style);

    for (const workspace of workspaces) {
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

      expect(getComputedStyle(header).display, workspace).not.toBe('none');
      expect(getComputedStyle(children).display, workspace).toBe('none');
      header.click();
      expect(getComputedStyle(children).display, workspace).toBe('block');
      app.dataset.workspace = 'unrelated';
      expect(getComputedStyle(children).display, workspace).toBe('none');
      app.dataset.workspace = workspace;
      header.click();
      expect(getComputedStyle(children).display, workspace).toBe('none');
      app.remove();
    }
  });
});

function mountWorkspace(markup: string): HTMLElement {
  const style = document.createElement('style');
  style.textContent = readFileSync(resolve(__dirname, 'app.css'), 'utf-8') + '\n' + css;
  document.head.appendChild(style);
  const app = document.createElement('div');
  app.id = 'app-body';
  app.innerHTML = markup;
  document.body.appendChild(app);
  return app;
}

describe('workspace.css – document workspace geometry', () => {
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

  it('keeps surfaces in their semantic grid columns when neighboring panels are hidden', () => {
    const ids = ['workspace-navigator', 'navigator-resizer', 'workspace-editor', 'inspector-resizer', 'right-sidebar'];
    const app = mountWorkspace(`<div id="workspace-shell">${ids.map((id) => `<div id="${id}"></div>`).join('')}</div>`);
    for (const classes of ['', 'navigator-open', 'right-sidebar-open', 'navigator-open right-sidebar-open']) {
      app.className = classes;
      ids.forEach((id, index) =>
        expect(getComputedStyle(app.querySelector(`#${id}`)!).gridColumn).toBe(String(index + 1)),
      );
    }
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

  it('lets inline visibility hide and restore the editor surface', () => {
    const app = mountWorkspace('<div id="document-workbench"><div id="editor-surface"></div></div>');
    const editor = app.querySelector<HTMLElement>('#editor-surface')!;
    expect(getComputedStyle(editor).display).toBe('flex');
    editor.style.display = 'none';
    expect(getComputedStyle(editor).display).toBe('none');
    editor.style.removeProperty('display');
    expect(getComputedStyle(editor).display).toBe('flex');
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
