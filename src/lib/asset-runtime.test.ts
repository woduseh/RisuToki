import { describe, expect, it } from 'vitest';
import {
  getMediaAssetUrl,
  getMonacoBaseUrl,
  getMonacoLoaderUrl,
  getVendorAssetUrl,
  getWasmoonRuntimeUrl,
  getXtermFitAddonUrl,
  getXtermRuntimeUrl,
  getXtermStylesheetUrl,
} from './asset-runtime';

describe('asset runtime helpers', () => {
  it('resolves vendored and media assets relative to the current window location', () => {
    window.history.replaceState({}, '', '/index.html');

    expect(getVendorAssetUrl('monaco-editor/min/vs/loader.js')).toContain('/vendor/monaco-editor/min/vs/loader.js');
    expect(getMediaAssetUrl('icon.png')).toContain('/app-assets/icon.png');
    expect(getMonacoBaseUrl()).toContain('/vendor/monaco-editor/min/vs');
    expect(getMonacoLoaderUrl()).toContain('/vendor/monaco-editor/min/vs/loader.js');
    expect(getXtermStylesheetUrl()).toContain('/vendor/@xterm/xterm/css/xterm.css');
    expect(getXtermRuntimeUrl()).toContain('/vendor/@xterm/xterm/lib/xterm.js');
    expect(getXtermFitAddonUrl()).toContain('/vendor/@xterm/addon-fit/lib/addon-fit.js');
    expect(getWasmoonRuntimeUrl()).toContain('/vendor/wasmoon/dist/index.js');
  });
});
