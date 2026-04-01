import { resolve, join, dirname } from 'node:path';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vitest/config';
import { normalizePath } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);

function resolveInstalledAssetPath(packageName: string, assetPath: string): string {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  return resolve(dirname(packageJsonPath), assetPath);
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
 */
function monacoIifePlugin(): Plugin {
  const MONACO_PREFIX = '/vendor/monaco-editor/min/vs/';
  const monacoRoot = resolveInstalledAssetPath('monaco-editor', 'min/vs');

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
    name: 'monaco-iife-wrapper',
    enforce: 'post',

    // Dev: intercept Monaco JS requests and wrap in IIFE
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
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
      try {
        wrapDir(monacoDir);
      } catch {
        // Monaco files may not exist if build target doesn't include them
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    monacoIifePlugin(),
    viteStaticCopy({
      targets: [
        {
          src: `${normalizePath(resolveInstalledAssetPath('monaco-editor', 'min/vs'))}/**/*`,
          dest: 'vendor/monaco-editor/min/vs',
          // @ts-expect-error Missing in vite-plugin-static-copy typings.
          structured: true,
        },
        {
          src: normalizePath(resolveInstalledAssetPath('@xterm/xterm', 'css/xterm.css')),
          dest: 'vendor/@xterm/xterm/css',
        },
        {
          src: normalizePath(resolveInstalledAssetPath('@xterm/xterm', 'lib/xterm.js')),
          dest: 'vendor/@xterm/xterm/lib',
        },
        {
          src: normalizePath(resolveInstalledAssetPath('@xterm/addon-fit', 'lib/addon-fit.js')),
          dest: 'vendor/@xterm/addon-fit/lib',
        },
        {
          src: normalizePath(resolveInstalledAssetPath('wasmoon', 'dist/index.js')),
          dest: 'vendor/wasmoon/dist',
        },
        {
          src: 'assets/{icon.png,icon_risu.png,Dancing_risu.gif,Dancing_toki.gif,toki-cute.gif,Usagi_Flap.mp3}',
          dest: 'app-assets',
        },
      ],
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  resolve: {
    extensions: ['.mts', '.ts', '.mjs', '.js', '.tsx', '.jsx', '.json'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        popout: resolve(rootDir, 'popout.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,js}'],
  },
});
