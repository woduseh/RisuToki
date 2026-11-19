import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(__dirname, '..');
const scale = {
  'font-size': [10, 11, 12, 13, 14, 16, 18, 22, 24],
  'border(?:-[a-z]+)*-radius': [0, 2, 4, 6, 8, 10, 16, 999],
  '(?:row-|column-)?gap': [0, 2, 4, 6, 8, 10, 12, 16, 20, 24],
} as const;

function styleSources(): Array<{ file: string; text: string }> {
  const css = ['styles/app.css', 'styles/workspace.css'].map((file) => ({
    file,
    text: readFileSync(join(sourceRoot, file), 'utf-8'),
  }));
  const vueFiles = [
    'App.vue',
    ...readdirSync(join(sourceRoot, 'components')).map((name) => `components/${name}`),
  ].filter((file) => file.endsWith('.vue'));
  const vue = vueFiles.map((file) => {
    const text = readFileSync(join(sourceRoot, file), 'utf-8');
    // Blank out everything outside <style> so line numbers still match the file.
    const styleOnly = text.replace(
      /[\s\S]*?(<style[^>]*>[\s\S]*?<\/style>|$)/g,
      (chunk, style: string) => chunk.slice(0, chunk.length - style.length).replace(/[^\n]/g, '') + style,
    );
    return { file, text: styleOnly };
  });
  return [...css, ...vue];
}

describe('style scale', () => {
  it.each(Object.entries(scale))('keeps every %s pixel value on the shared scale', (property, allowed) => {
    const offScale: string[] = [];
    for (const { file, text } of styleSources()) {
      text.split(/\r?\n/).forEach((line, index) => {
        const declaration = line.match(new RegExp(`(?:^|[\\s;{])${property}\\s*:\\s*([^;]+)`));
        if (!declaration) return;
        for (const [, value] of declaration[1].matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) {
          if (!(allowed as readonly number[]).includes(Number(value))) {
            offScale.push(`${relative(sourceRoot, join(sourceRoot, file))}:${index + 1} ${property}: ${value}px`);
          }
        }
      });
    }
    expect(offScale, `Use one of ${allowed.join(', ')}px for ${property}, or a --ui-* token.`).toEqual([]);
  });
});
