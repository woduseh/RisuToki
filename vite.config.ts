import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/monaco-editor/min/vs/**/*',
          dest: 'vendor/monaco-editor/min/vs',
          // vite-plugin-static-copy supports this at runtime, but its published types do not expose it.
          // @ts-expect-error Missing in vite-plugin-static-copy typings.
          structured: true
        },
        {
          src: 'node_modules/@xterm/xterm/css/xterm.css',
          dest: 'vendor/@xterm/xterm/css'
        },
        {
          src: 'node_modules/@xterm/xterm/lib/xterm.js',
          dest: 'vendor/@xterm/xterm/lib'
        },
        {
          src: 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
          dest: 'vendor/@xterm/addon-fit/lib'
        },
        {
          src: 'node_modules/wasmoon/dist/index.js',
          dest: 'vendor/wasmoon/dist'
        },
        {
          src: 'assets/{icon.png,icon_risu.png,Dancing_risu.gif,Dancing_toki.gif,toki-cute.gif,Usagi_Flap.mp3}',
          dest: 'app-assets'
        }
      ]
    })
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        popout: resolve(rootDir, 'popout.html')
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,js}']
  }
});
