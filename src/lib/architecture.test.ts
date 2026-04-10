// @vitest-environment node
/**
 * Architecture enforcement guards — mechanical tests that pin key layering and
 * ownership rules so future changes cannot drift silently.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');
const LIB_DIR = path.join(ROOT, 'src', 'lib');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

const KNOWN_STORE_RUNTIME_IMPORTS = new Set(['src/lib/file-actions.ts', 'src/lib/status-bar.ts']);

const KNOWN_UNLINTED_LIB_FILES = new Set([
  'src/lib/agents-md-manager.test.ts',
  'src/lib/asset-manager.test.ts',
  'src/lib/cbs-evaluator.ts',
  'src/lib/cbs-extractor.test.ts',
  'src/lib/cbs-extractor.ts',
  'src/lib/cbs-parser.test.ts',
  'src/lib/cbs-parser.ts',
  'src/lib/help-popup.test.ts',
  'src/lib/image-compressor.test.ts',
  'src/lib/image-compressor.ts',
  'src/lib/lorebook-folders.test.ts',
  'src/lib/lorebook-folders.ts',
  'src/lib/lorebook-io.test.ts',
  'src/lib/lorebook-io.ts',
  'src/lib/preview-contract.test.ts',
  'src/lib/risup-prompt-model.test.ts',
  'src/lib/risup-prompt-model.ts',
  'src/lib/section-parser.ts',
  'src/lib/settings-popup.test.ts',
  'src/lib/sidebar-dnd.test.ts',
  'src/lib/sidebar-dnd.ts',
  'src/lib/sidebar-refs.test.ts',
  'src/lib/terminal-session-context.test.ts',
  'src/lib/terminal-session-context.ts',
]);

function listLibFiles(includeTests = true): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) {
        continue;
      }
      const relativePath = path.relative(ROOT, absolutePath).split(path.sep).join('/');
      if (!includeTests && relativePath.endsWith('.test.ts')) {
        continue;
      }
      files.push(relativePath);
    }
  }

  walk(LIB_DIR);
  return files.sort();
}

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8').replace(/\r\n/g, '\n');
}

function extractLintedLibFiles(): Set<string> {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8')) as { scripts?: { lint?: string } };
  const lintScript = packageJson.scripts?.lint ?? '';
  const matches = lintScript.matchAll(/src\/lib\/[\w./-]+\.ts/g);
  return new Set([...matches].map((match) => match[0]));
}

type RuntimeDependencyGroup = 'app-popout' | 'stores';

function classifyRuntimeDependency(specifier: string): RuntimeDependencyGroup | null {
  if (specifier.startsWith('../app/') || specifier.startsWith('../popout/')) {
    return 'app-popout';
  }
  if (specifier.startsWith('../stores/')) {
    return 'stores';
  }
  return null;
}

function hasRuntimeNamedImports(clause: ts.ImportClause | undefined): boolean {
  return !clause?.isTypeOnly;
}

function hasRuntimeNamedExports(node: ts.ExportDeclaration): boolean {
  return !node.isTypeOnly;
}

function extractStaticModuleSpecifierPrefix(expression: ts.Expression): string | null {
  if (ts.isStringLiteralLike(expression)) {
    return expression.text;
  }
  if (ts.isTemplateExpression(expression)) {
    return expression.head.text;
  }
  return null;
}

function scanRuntimeDependencyViolations(
  sourceText: string,
  displayPath: string,
  group: RuntimeDependencyGroup,
): string[] {
  const sourceFile = ts.createSourceFile(
    displayPath,
    sourceText.replace(/\r\n/g, '\n'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations: string[] = [];

  function maybeRecord(specifier: string, detail: string): void {
    if (classifyRuntimeDependency(specifier) === group) {
      violations.push(detail);
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const specifier = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
      if (specifier && hasRuntimeNamedImports(node.importClause)) {
        maybeRecord(specifier, `import ${specifier}`);
      }
    } else if (ts.isExportDeclaration(node)) {
      const specifier =
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
      if (specifier && hasRuntimeNamedExports(node)) {
        maybeRecord(specifier, `export ${specifier}`);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (node.isTypeOnly) {
        ts.forEachChild(node, visit);
        return;
      }
      const ref = node.moduleReference;
      if (ts.isExternalModuleReference(ref) && ref.expression && ts.isStringLiteral(ref.expression)) {
        maybeRecord(ref.expression.text, `import= ${ref.expression.text}`);
      }
    } else if (ts.isCallExpression(node)) {
      const [firstArg] = node.arguments;
      const specifier = firstArg ? extractStaticModuleSpecifierPrefix(firstArg) : null;
      if (!specifier) {
        ts.forEachChild(node, visit);
        return;
      }

      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        maybeRecord(specifier, `dynamic import ${specifier}`);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        maybeRecord(specifier, `require ${specifier}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function collectRuntimeDependencyViolations(filePath: string, group: RuntimeDependencyGroup): string[] {
  return scanRuntimeDependencyViolations(readRepoFile(filePath), filePath, group);
}

function collectRuntimeAppPopoutViolations(filePath: string): string[] {
  return collectRuntimeDependencyViolations(filePath, 'app-popout');
}

function collectRuntimeStoreViolations(filePath: string): string[] {
  return collectRuntimeDependencyViolations(filePath, 'stores');
}

describe('runtime dependency scanner behavior', () => {
  it('ignores type-only app/popout imports when checking runtime boundaries', () => {
    expect(
      scanRuntimeDependencyViolations(
        "import type { Controller } from '../app/controller';\n",
        '__fixture__.ts',
        'app-popout',
      ),
    ).toEqual([]);
  });

  it('catches multiline, side-effect, dynamic, and require runtime dependency forms', () => {
    const source = [
      'import {',
      '  useAppStore,',
      "} from '../stores/app-store';",
      "import '../app/controller';",
      'async function loadPopout() {',
      "  return import('../popout/controller');",
      '}',
      "const store = require('../stores/app-store');",
      '',
    ].join('\n');
    const violations = [
      ...scanRuntimeDependencyViolations(source, '__fixture__.ts', 'app-popout'),
      ...scanRuntimeDependencyViolations(source, '__fixture__.ts', 'stores'),
    ];
    expect(violations).toHaveLength(4);
  });

  it('ignores type-only re-exports when checking runtime boundaries', () => {
    expect(
      scanRuntimeDependencyViolations(
        "export type { Controller } from '../app/controller';\n",
        '__fixture__.ts',
        'app-popout',
      ),
    ).toEqual([]);
  });

  it('catches runtime re-exports across forbidden boundaries', () => {
    const source = ["export * from '../stores/app-store';", "export { controller } from '../app/controller';", ''].join(
      '\n',
    );
    const violations = [
      ...scanRuntimeDependencyViolations(source, '__fixture__.ts', 'app-popout'),
      ...scanRuntimeDependencyViolations(source, '__fixture__.ts', 'stores'),
    ];
    expect(violations).toHaveLength(2);
  });

  it('treats inline type-only imports and exports as runtime boundaries under verbatimModuleSyntax', () => {
    const source = [
      "import { type CharxData } from '../stores/app-store';",
      "export { type Controller } from '../app/controller';",
      '',
    ].join('\n');
    const violations = [
      ...scanRuntimeDependencyViolations(source, '__fixture__.ts', 'stores'),
      ...scanRuntimeDependencyViolations(source, '__fixture__.ts', 'app-popout'),
    ];
    expect(violations).toHaveLength(2);
  });

  it('catches template-literal dynamic imports and require calls', () => {
    const source = [
      'async function loadPopout() {',
      '  return import(`../popout/controller`);',
      '}',
      'const store = require(`../stores/app-store`);',
      '',
    ].join('\n');
    const violations = [
      ...scanRuntimeDependencyViolations(source, '__fixture__.ts', 'app-popout'),
      ...scanRuntimeDependencyViolations(source, '__fixture__.ts', 'stores'),
    ];
    expect(violations).toHaveLength(2);
  });

  it('catches interpolated template-literal imports when their static prefix crosses a forbidden boundary', () => {
    const source = [
      "const name = 'controller';",
      'async function loadPopout() {',
      '  return import(`../popout/${name}`);',
      '}',
      'const store = require(`../stores/${name}`);',
      '',
    ].join('\n');
    const violations = [
      ...scanRuntimeDependencyViolations(source, '__fixture__.ts', 'app-popout'),
      ...scanRuntimeDependencyViolations(source, '__fixture__.ts', 'stores'),
    ];
    expect(violations).toHaveLength(2);
  });

  it('ignores type-only import-equals dependencies when checking runtime boundaries', () => {
    expect(
      scanRuntimeDependencyViolations(
        "import type Store = require('../stores/app-store');\n",
        '__fixture__.ts',
        'stores',
      ),
    ).toEqual([]);
  });

  it('does not mutate src/lib while evaluating fixture sources', () => {
    const before = listLibFiles(true);
    expect(
      scanRuntimeDependencyViolations(
        "import type { Controller } from '../app/controller';\n",
        '__fixture__.ts',
        'app-popout',
      ),
    ).toEqual([]);
    expect(listLibFiles(true)).toEqual(before);
  });
});

describe('src/lib architecture boundaries', () => {
  const libProductionFiles = listLibFiles(false);

  it('does not runtime-import src/app or src/popout from production src/lib modules', () => {
    const violations = libProductionFiles.flatMap((filePath) =>
      collectRuntimeAppPopoutViolations(filePath).map((line) => `${filePath}: ${line}`),
    );

    expect(violations).toEqual([]);
  });

  it('limits runtime store imports in production src/lib modules to the known bridge files', () => {
    const violations = libProductionFiles.flatMap((filePath) => {
      if (KNOWN_STORE_RUNTIME_IMPORTS.has(filePath)) return [];
      return collectRuntimeStoreViolations(filePath).map((line) => `${filePath}: ${line}`);
    });

    expect(violations).toEqual([]);
  });
});

describe('src/lib ownership guards', () => {
  const libProductionFiles = listLibFiles(false);

  it('keeps JSON.parse(JSON.stringify(...)) centralized in shared-utils.ts', () => {
    const offenders = libProductionFiles.filter((filePath) => {
      if (filePath === 'src/lib/shared-utils.ts') return false;
      return readRepoFile(filePath).includes('JSON.parse(JSON.stringify(');
    });

    expect(offenders).toEqual([]);
  });
});

describe('src/lib lint coverage guard', () => {
  const lintedFiles = extractLintedLibFiles();
  const actualLibFiles = listLibFiles(true);

  it('requires every src/lib TypeScript file to be linted or explicitly allowlisted', () => {
    const uncovered = actualLibFiles.filter(
      (filePath) => !lintedFiles.has(filePath) && !KNOWN_UNLINTED_LIB_FILES.has(filePath),
    );
    expect(uncovered, 'New src/lib files must be added to lint or KNOWN_UNLINTED_LIB_FILES').toEqual([]);
  });

  it('does not keep stale entries in the known unlinted allowlist', () => {
    const stale = [...KNOWN_UNLINTED_LIB_FILES].filter(
      (filePath) => !actualLibFiles.includes(filePath) || lintedFiles.has(filePath),
    );
    expect(stale, 'KNOWN_UNLINTED_LIB_FILES should shrink when lint coverage expands').toEqual([]);
  });
});
