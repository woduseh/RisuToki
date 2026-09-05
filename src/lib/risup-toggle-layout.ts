import type { ToggleTemplateItem } from './risup-toggle-model';

/** Source ranges are half-open and retain RisuAI's flat, single-open-group semantics. */
export interface ToggleVisualNode {
  kind: 'group' | 'control' | 'caption' | 'divider' | 'boundary';
  start: number;
  end: number;
  captions: number[];
  children: ToggleVisualNode[];
  closed?: boolean;
}

function buildRows(items: readonly ToggleTemplateItem[], start: number, end: number): ToggleVisualNode[] {
  const rows: ToggleVisualNode[] = [];
  for (let index = start; index < end; index++) {
    const item = items[index];
    const previous = rows.at(-1);
    if (item.type === 'caption' && previous?.kind === 'control') {
      previous.captions.push(index);
      previous.end = index + 1;
      continue;
    }
    rows.push({
      kind:
        item.type === 'groupEnd'
          ? 'boundary'
          : item.type === 'caption' || item.type === 'divider'
            ? item.type
            : 'control',
      start: index,
      end: index + 1,
      captions: [],
      children: [],
    });
  }
  return rows;
}

export function buildToggleVisualNodes(items: readonly ToggleTemplateItem[]): ToggleVisualNode[] {
  const nodes: ToggleVisualNode[] = [];
  let index = 0;
  while (index < items.length) {
    if (items[index].type === 'group') {
      let end = index + 1;
      while (end < items.length && items[end].type !== 'group' && items[end].type !== 'groupEnd') end++;
      const closed = items[end]?.type === 'groupEnd';
      nodes.push({
        kind: 'group',
        start: index,
        end: end + (closed ? 1 : 0),
        closed,
        captions: [],
        children: buildRows(items, index + 1, end),
      });
      index = end + (closed ? 1 : 0);
    } else {
      let end = index + 1;
      while (end < items.length && items[end].type !== 'group') end++;
      nodes.push(...buildRows(items, index, end));
      index = end;
    }
  }
  return nodes;
}

function replaceSiblings(
  items: ToggleTemplateItem[],
  original: ToggleVisualNode[],
  ordered: ToggleVisualNode[],
): ToggleTemplateItem[] {
  if (original.length === 0) return items;
  const replacement = ordered.flatMap((node, index) => {
    const chunk = items.slice(node.start, node.end);
    const next = ordered[index + 1];
    // A formerly implicit group must not swallow a root item after a reorder/deletion.
    if (
      node.kind === 'group' &&
      !node.closed &&
      ((next && next.kind !== 'group' && next.kind !== 'boundary') || (!next && node.end < items.length))
    ) {
      chunk.push({ type: 'groupEnd' });
    }
    return chunk;
  });
  return [...items.slice(0, original[0].start), ...replacement, ...items.slice(original.at(-1)!.end)];
}

export function moveToggleVisualNode(
  items: ToggleTemplateItem[],
  siblings: ToggleVisualNode[],
  from: number,
  to: number,
): ToggleTemplateItem[] {
  if (from === to || !siblings[from] || !siblings[to]) return items;
  const ordered = [...siblings];
  const [node] = ordered.splice(from, 1);
  ordered.splice(to, 0, node);
  return replaceSiblings(items, siblings, ordered);
}

export function removeToggleVisualNode(
  items: ToggleTemplateItem[],
  siblings: ToggleVisualNode[],
  index: number,
): ToggleTemplateItem[] {
  return replaceSiblings(
    items,
    siblings,
    siblings.filter((_, nodeIndex) => nodeIndex !== index),
  );
}

export function appendToggleRootItems(items: ToggleTemplateItem[], added: ToggleTemplateItem[]): ToggleTemplateItem[] {
  const last = buildToggleVisualNodes(items).at(-1);
  const close = last?.kind === 'group' && !last.closed && added[0]?.type !== 'group';
  return [...items, ...(close ? [{ type: 'groupEnd' } as const] : []), ...added];
}

export function moveToggleNodeToGroup(
  items: ToggleTemplateItem[],
  node: ToggleVisualNode,
  targetStart: number | null,
): ToggleTemplateItem[] {
  const roots = buildToggleVisualNodes(items);
  const sourceGroup = roots.find(
    (root) => root.kind === 'group' && root.children.some((child) => child.start === node.start),
  );
  const siblings = sourceGroup?.children ?? roots;
  const targetItem = targetStart === null ? null : items[targetStart];
  const removed = removeToggleVisualNode(
    items,
    siblings,
    siblings.findIndex((entry) => entry.start === node.start),
  );
  const chunk = items.slice(node.start, node.end);
  if (targetItem === null) return appendToggleRootItems(removed, chunk);
  const target = buildToggleVisualNodes(removed).find((entry) => removed[entry.start] === targetItem);
  if (!target || target.kind !== 'group') return items;
  const insertion = target.end - (target.closed ? 1 : 0);
  return [...removed.slice(0, insertion), ...chunk, ...removed.slice(insertion)];
}
