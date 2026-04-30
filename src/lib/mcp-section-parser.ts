import type { CssCacheEntry, Section } from './mcp-api-server';

export function detectLuaSection(line: string): string | null {
  const trimmed = line.trim();
  if (!/^-{2,3}/.test(trimmed)) return null;
  const eqGroups = trimmed.match(/={3,}/g);
  if (!eqGroups) return null;
  const totalEq = eqGroups.reduce((sum, m) => sum + m.length, 0);
  if (totalEq < 6) return null;
  const inlineMatch = trimmed.match(/^-{2,3}\s*={3,}\s+(.+?)\s+={3,}\s*$/);
  if (inlineMatch) return inlineMatch[1].trim();
  if (/^-{2,3}\s*={6,}\s*$/.test(trimmed)) return '';
  return null;
}

export function parseLuaSections(luaCode: string): Section[] {
  if (!luaCode || !luaCode.trim()) return [{ name: 'main', content: '' }];
  const lines = luaCode.split('\n');
  const sections: Section[] = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionName = detectLuaSection(line);
    if (sectionName !== null) {
      if (currentName !== null) {
        sections.push({ name: currentName, content: currentLines.join('\n').trim() });
      }
      if (sectionName === '') {
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        const commentMatch = nextLine.match(/^--\s*(.+)$/);
        if (commentMatch && detectLuaSection(nextLine) === null) {
          currentName = commentMatch[1].trim();
          i++;
          const closingLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
          if (detectLuaSection(closingLine) !== null) i++;
        } else {
          currentName = `section_${sections.length}`;
        }
      } else {
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        if (nextLine && detectLuaSection(nextLine) === '') i++;
        currentName = sectionName;
      }
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentName !== null) {
    sections.push({ name: currentName, content: currentLines.join('\n').trim() });
  }
  if (sections.length === 0) {
    sections.push({ name: 'main', content: luaCode.trim() });
  }
  const merged: Section[] = [];
  for (let i = 0; i < sections.length; i++) {
    if (!sections[i].content && i + 1 < sections.length) {
      merged.push({ name: sections[i].name, content: sections[i + 1].content });
      i++;
    } else {
      merged.push(sections[i]);
    }
  }
  return merged;
}

export function combineLuaSections(sections: Section[]): string {
  return sections.map((s) => `-- ===== ${s.name} =====\n${s.content}`).join('\n\n');
}

export function detectCssSectionInline(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('/*') || !trimmed.endsWith('*/')) return null;
  const inner = trimmed.slice(2, -2).trim();
  const eqGroups = inner.match(/={3,}/g);
  if (!eqGroups) return null;
  const totalEq = eqGroups.reduce((sum, m) => sum + m.length, 0);
  if (totalEq < 6) return null;
  const inlineMatch = inner.match(/^={3,}\s+(.+?)\s+={3,}$/);
  if (inlineMatch) return inlineMatch[1].trim();
  return null;
}

export function detectCssBlockOpen(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('/*')) return false;
  if (trimmed.endsWith('*/')) return false;
  const after = trimmed.slice(2).trim();
  return /^={6,}$/.test(after);
}

export function detectCssBlockClose(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.endsWith('*/')) return false;
  const before = trimmed.slice(0, -2).trim();
  return /^={6,}$/.test(before);
}

export function parseCssSections(cssCode: string): CssCacheEntry {
  let prefix = '';
  let suffix = '';
  if (!cssCode || !cssCode.trim()) return { sections: [{ name: 'main', content: '' }], prefix, suffix };

  let work = cssCode;
  const openMatch = work.match(/^(\s*<style[^>]*>\s*\n?)/i);
  const closeMatch = work.match(/(\n?\s*<\/style>\s*)$/i);
  if (openMatch && closeMatch) {
    prefix = openMatch[1];
    suffix = closeMatch[1];
    work = work.slice(openMatch[1].length, work.length - closeMatch[1].length);
  }

  const lines = work.split('\n');
  const sections: Section[] = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inlineName = detectCssSectionInline(line);
    if (inlineName !== null) {
      if (currentName !== null) {
        sections.push({ name: currentName, content: currentLines.join('\n').trim() });
      }
      currentName = inlineName;
      currentLines = [];
      continue;
    }
    if (detectCssBlockOpen(line)) {
      const nameLines: string[] = [];
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (detectCssBlockClose(lines[j])) {
          closed = true;
          break;
        }
        const text = lines[j].trim();
        if (text) nameLines.push(text);
        j++;
      }
      if (closed && nameLines.length > 0) {
        if (currentName !== null) {
          sections.push({ name: currentName, content: currentLines.join('\n').trim() });
        }
        currentName = nameLines[0];
        currentLines = [];
        i = j;
        continue;
      }
    }
    currentLines.push(line);
  }

  if (currentName !== null) {
    sections.push({ name: currentName, content: currentLines.join('\n').trim() });
  }
  if (sections.length === 0) {
    sections.push({ name: 'main', content: cssCode.trim() });
  }
  const merged: Section[] = [];
  for (let i = 0; i < sections.length; i++) {
    if (!sections[i].content && i + 1 < sections.length) {
      merged.push({ name: sections[i].name, content: sections[i + 1].content });
      i++;
    } else {
      merged.push(sections[i]);
    }
  }
  return { sections: merged, prefix, suffix };
}

export function combineCssSections(sections: Section[], prefix: string, suffix: string): string {
  const eq = '============================================================';
  const body = sections.map((s) => `/* ${eq}\n   ${s.name}\n   ${eq} */\n${s.content}`).join('\n\n');
  const effectivePrefix = prefix || '<style>\n';
  const effectiveSuffix = suffix || '\n</style>';
  return effectivePrefix + body + effectiveSuffix;
}
