import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { createContext, Script } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapBrowserVendorScript } from './vendor-script-wrapper';

const require = createRequire(import.meta.url);

describe('browser vendor scripts with Monaco AMD already active', () => {
  beforeEach(() => {
    // These checks exercise module selection; Chromium smoke covers drawing.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['@xterm/xterm', 'lib/xterm.js', 'Terminal', 'Terminal'],
    ['@xterm/addon-fit', 'lib/addon-fit.js', 'FitAddon', 'FitAddon'],
    ['wasmoon', 'dist/index.js', 'wasmoon', 'LuaFactory'],
  ])('loads the actual %s bundle as a browser global', (packageName, relativePath, globalName, constructorName) => {
    const define = Object.assign(vi.fn(), { amd: {} });
    const amdRequire = vi.fn();
    const commonJsExports = {};
    const commonJsModule = { exports: commonJsExports };
    const context = createContext({
      define,
      require: amdRequire,
      module: commonJsModule,
      exports: commonJsExports,
      document,
      navigator,
      URL,
      queueMicrotask,
      setTimeout,
      clearTimeout,
      performance,
    });
    context.window = context;
    context.self = context;
    const filename = resolve(dirname(require.resolve(`${packageName}/package.json`)), relativePath);
    new Script(wrapBrowserVendorScript(readFileSync(filename, 'utf8')), { filename }).runInContext(context, {
      timeout: 2000,
    });

    const exported = context[globalName];
    expect(typeof (typeof exported === 'function' ? exported : exported?.[constructorName])).toBe('function');
    expect(define).not.toHaveBeenCalled();
    expect(amdRequire).not.toHaveBeenCalled();
    expect(context.define).toBe(define);
    expect(context.require).toBe(amdRequire);
    expect(context.module).toBe(commonJsModule);
    expect(context.module.exports).toBe(commonJsExports);
    expect(context.exports).toBe(commonJsExports);
    expect(commonJsExports).toEqual({});
  });
});
