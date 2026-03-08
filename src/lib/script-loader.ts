import { getWasmoonRuntimeUrl, getXtermStylesheetUrl } from './asset-runtime';

const loadedScripts = new Map<string, Promise<void>>();
const loadedStylesheets = new Set<string>();

export function loadScript(src: string, parent: HTMLElement = document.head): Promise<void> {
  const existing = loadedScripts.get(src);
  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => {
      loadedScripts.delete(src);
      reject(new Error(`Failed to load script: ${src}`));
    };
    parent.appendChild(script);
  });

  loadedScripts.set(src, promise);
  return promise;
}

export function ensureStylesheet(href: string, key = href): void {
  if (loadedStylesheets.has(key)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  loadedStylesheets.add(key);
}

let wasmoonLoadPromise: Promise<void> | null = null;

export async function ensureWasmoon(): Promise<void> {
  const runtimeWindow = window as Window & { wasmoon?: unknown };
  if (runtimeWindow.wasmoon) return;

  if (!wasmoonLoadPromise) {
    wasmoonLoadPromise = loadScript(getWasmoonRuntimeUrl());
  }

  await wasmoonLoadPromise;
}

export function ensureXtermAssets(): void {
  ensureStylesheet(getXtermStylesheetUrl(), '@xterm/xterm/css');
}
