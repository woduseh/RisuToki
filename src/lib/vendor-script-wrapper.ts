/** Keep classic browser vendor scripts independent from Monaco's AMD loader. */
export function wrapBrowserVendorScript(source: string): string {
  return `(function(define, require, module, exports){\n${source}\n}).call(globalThis);\n`;
}
