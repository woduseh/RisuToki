import { readAppSettingsSnapshot } from './app-settings';
import { getTalkTitleForTheme, isDarkTheme } from './theme-registry';

function getBundledAssetUrl(baseDirectory: 'app-assets' | 'vendor', relativePath: string): string {
  const normalizedPath = relativePath.replace(/^\.\//, '');
  return new URL(`./${baseDirectory}/${normalizedPath}`, window.location.href).toString();
}

export function getVendorAssetUrl(relativePath: string): string {
  return getBundledAssetUrl('vendor', relativePath);
}

export function getMediaAssetUrl(relativePath: string): string {
  return getBundledAssetUrl('app-assets', relativePath);
}

export function getMonacoBaseUrl(): string {
  return getVendorAssetUrl('monaco-editor/min/vs');
}

export function getMonacoLoaderUrl(): string {
  return getVendorAssetUrl('monaco-editor/min/vs/loader.js');
}

export function getXtermStylesheetUrl(): string {
  return getVendorAssetUrl('@xterm/xterm/css/xterm.css');
}

export function getXtermRuntimeUrl(): string {
  return getVendorAssetUrl('@xterm/xterm/lib/xterm.js');
}

export function getXtermFitAddonUrl(): string {
  return getVendorAssetUrl('@xterm/addon-fit/lib/addon-fit.js');
}

export function getWasmoonRuntimeUrl(): string {
  return getVendorAssetUrl('wasmoon/dist/index.js');
}

export function isDarkModeEnabled(): boolean {
  const snapshot = readAppSettingsSnapshot();
  return isDarkTheme(snapshot.themeId, snapshot.customTheme);
}

export function getTalkTitle(): string {
  const snapshot = readAppSettingsSnapshot();
  return getTalkTitleForTheme(snapshot.themeId, snapshot.customTheme);
}

export const toMediaAsset = getMediaAssetUrl;
