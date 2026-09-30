import { resolve, join, dirname, relative } from 'node:path';
import { existsSync, readFileSync, writeFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vitest/config';
import { normalizePath } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { wrapBrowserVendorScript } from './src/lib/vendor-script-wrapper';

const rootDir = realpathSync(process.cwd());
const require = createRequire(import.meta.url);

function resolveInstalledAssetPath(packageName: string, assetPath: string): string {
  let current = dirname(require.resolve(packageName));
  while (true) {
    const packageJsonPath = join(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string };
        if (manifest.name === packageName) return resolve(current, assetPath);
      } catch {
        // Keep walking; nested package metadata can belong to another package.
      }
    }
    const parent = dirname(current);
    if (parent === current) throw new Error(`Unable to resolve package root for ${packageName}`);
    current = parent;
  }
}

function staticCopyStripBase(sourceBase: string): number {
  const relativeBase = normalizePath(relative(rootDir, sourceBase));
  if (!relativeBase || relativeBase === '.' || relativeBase === '..' || relativeBase.startsWith('../')) {
    throw new Error(`Static copy source must be inside the project root: ${sourceBase}`);
  }
  return relativeBase.split('/').filter(Boolean).length;
}

function installedAssetCopyTarget(packageName: string, assetPath: string, dest: string) {
  const src = resolveInstalledAssetPath(packageName, assetPath);
  return {
    src: normalizePath(src),
    dest,
    // vite-plugin-static-copy v4 preserves the matched source directory under dest.
    // Strip the package path while retaining the requested asset's own basename/tree.
    rename: { stripBase: staticCopyStripBase(dirname(src)) },
  };
}

/**
 * Wraps Monaco AMD JS files in IIFEs to prevent global variable pollution.
 *
 * Monaco's minified contribution files (css, json, yaml, etc.) declare `var`
 * helpers at the top level (e.g., `var h,m,r`).  When loaded via `<script>`
 * tags, these leak into the global scope.  If scripts load in a different
 * order, one contribution's `var m = Object.defineProperty` can overwrite
 * another's `var m = helperFn`, causing "Property description must be an
 * object: undefined" when the AMD factory finally executes.
 *
 * Wrapping each file in `(function(){ ... })()` isolates these declarations.
 * Other classic vendor scripts also need lexical isolation from Monaco's
 * global AMD bindings so UMD bundles publish their browser globals directly.
 */
function vendorScriptIsolationPlugin(): Plugin {
  const MONACO_PREFIX = '/vendor/monaco-editor/min/vs/';
  const monacoRoot = resolveInstalledAssetPath('monaco-editor', 'min/vs');
  const browserGlobalScripts = new Map(
    [
      ['@xterm/xterm', 'lib/xterm.js'],
      ['@xterm/addon-fit', 'lib/addon-fit.js'],
      ['wasmoon', 'dist/index.js'],
    ].map(([packageName, assetPath]) => [
      `/vendor/${packageName}/${assetPath}`,
      resolveInstalledAssetPath(packageName, assetPath),
    ]),
  );

  function wrapDir(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        wrapDir(full);
      } else if (entry.endsWith('.js') && entry !== 'loader.js') {
        const code = readFileSync(full, 'utf-8');
        if (!code.startsWith('(function(){')) {
          writeFileSync(full, `(function(){${code}})();\n`);
        }
      }
    }
  }

  return {
    name: 'vendor-script-isolation',
    enforce: 'post',

    // Dev and copied production scripts must use the same isolated UMD scope.
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const browserGlobal = browserGlobalScripts.get(req.url?.split('?')[0] ?? '');
        if (browserGlobal) {
          _res.setHeader('Content-Type', 'application/javascript');
          _res.end(wrapBrowserVendorScript(readFileSync(browserGlobal, 'utf8')));
          return;
        }
        if (req.url?.startsWith(MONACO_PREFIX) && req.url.endsWith('.js') && !req.url.endsWith('/loader.js')) {
          const relativePath = req.url.slice(MONACO_PREFIX.length);
          const filePath = resolve(monacoRoot, relativePath);
          try {
            const content = readFileSync(filePath, 'utf-8');
            _res.setHeader('Content-Type', 'application/javascript');
            _res.end(`(function(){${content}})();\n`);
          } catch {
            next();
          }
          return;
        }
        next();
      });
    },

    // Build: wrap copied Monaco JS files after vite-plugin-static-copy runs
    closeBundle() {
      const outDir = resolve(rootDir, 'dist');
      const monacoDir = join(outDir, 'vendor', 'monaco-editor', 'min', 'vs');
      if (!existsSync(join(monacoDir, 'loader.js'))) {
        throw new Error(`Monaco build assets are missing from ${monacoDir}`);
      }
      wrapDir(monacoDir);
      for (const [url, sourcePath] of browserGlobalScripts) {
        writeFileSync(join(outDir, url.slice(1)), wrapBrowserVendorScript(readFileSync(sourcePath, 'utf8')));
      }
      for (const requiredAsset of [
        join(outDir, 'vendor', '@xterm', 'xterm', 'css', 'xterm.css'),
        join(outDir, 'app-assets', 'icon.png'),
      ]) {
        if (!existsSync(requiredAsset)) throw new Error(`Required build asset is missing: ${requiredAsset}`);
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  root: command === 'build' ? rootDir : process.cwd(),
  base: './',
  plugins: [
    vue(),
    vendorScriptIsolationPlugin(),
    viteStaticCopy({
      targets: [
        installedAssetCopyTarget('monaco-editor', 'min/vs', 'vendor/monaco-editor/min'),
        installedAssetCopyTarget('@xterm/xterm', 'css/xterm.css', 'vendor/@xterm/xterm/css'),
        installedAssetCopyTarget('@xterm/xterm', 'lib/xterm.js', 'vendor/@xterm/xterm/lib'),
        installedAssetCopyTarget('@xterm/addon-fit', 'lib/addon-fit.js', 'vendor/@xterm/addon-fit/lib'),
        installedAssetCopyTarget('wasmoon', 'dist/index.js', 'vendor/wasmoon/dist'),
        {
          src: 'assets/{icon.png,toki-cute.gif,Usagi_Flap.mp3}',
          dest: 'app-assets',
          rename: { stripBase: 1 },
        },
        {
          src: 'assets/avatar-*.webp',
          dest: 'app-assets',
          rename: { stripBase: 1 },
        },
      ],
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: {
      allow: [process.cwd(), rootDir],
    },
  },
  resolve: {
    extensions: ['.mts', '.ts', '.mjs', '.js', '.tsx', '.jsx', '.json'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/highlight.js/')) return 'vendor-preview-highlight';
          if (id.includes('/node_modules/katex/')) return 'vendor-preview-katex';
          if (
            id.includes('/node_modules/markdown-it/') ||
            id.includes('/node_modules/linkify-it/') ||
            id.includes('/node_modules/mdurl/') ||
            id.includes('/node_modules/uc.micro/') ||
            id.includes('/node_modules/punycode.js/')
          ) {
            return 'vendor-preview-markdown';
          }
          if (id.includes('/node_modules/postcss/') || id.includes('/node_modules/postcss-selector-parser/')) {
            return 'vendor-preview-css';
          }
          if (id.includes('/node_modules/dompurify/')) return 'vendor-preview-sanitize';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [pathToFileURL(resolve(process.cwd(), 'vitest.setup.ts')).href],
    include: ['src/**/*.{test,spec}.{ts,js}'],
  },
}));
