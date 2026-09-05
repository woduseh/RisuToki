import { describe, expect, it } from 'vitest';
import { parseCustomPromptTemplateToggle, serializeCustomPromptTemplateToggle } from './risup-toggle-model';
import {
  appendToggleRootItems,
  buildToggleVisualNodes,
  moveToggleNodeToGroup,
  moveToggleVisualNode,
  removeToggleVisualNode,
} from './risup-toggle-layout';

const parse = (text: string) => parseCustomPromptTemplateToggle(text).items;
const serialize = (items: ReturnType<typeof parse>) => serializeCustomPromptTemplateToggle({ items });

describe('flat RisuAI toggle group layout', () => {
  it('uses each new group as an implicit end, without inventing nested groups or editing EOF', () => {
    const items = parse('=A=group\na=A\n=Note=caption\n=B=group\nb=B');
    const nodes = buildToggleVisualNodes(items);
    expect(nodes.map((node) => [node.start, node.end, node.closed])).toEqual([
      [0, 3, false],
      [3, 5, false],
    ]);
    expect(nodes[0].children[0].captions).toEqual([2]);
    expect(serialize(items)).toBe('=A=group\na=A\n=Note=caption\n=B=group\nb=B');
  });

  it('keeps orphan captions and unmatched end markers in source ranges', () => {
    const items = parse('=Intro=caption\n==groupEnd\n=Section=divider\n=Note=caption');
    expect(buildToggleVisualNodes(items).map((node) => node.kind)).toEqual([
      'caption',
      'boundary',
      'divider',
      'caption',
    ]);
    expect(serialize(moveToggleVisualNode(items, buildToggleVisualNodes(items), 3, 2))).toContain('==groupEnd');
  });

  it('moves and deletes a control together with all adjacent captions', () => {
    const items = parse('a=A\n=One=caption\n=Two=caption\nb=B');
    const nodes = buildToggleVisualNodes(items);
    expect(serialize(moveToggleVisualNode(items, nodes, 0, 1))).toBe('b=B\na=A\n=One=caption\n=Two=caption');
    expect(serialize(removeToggleVisualNode(items, nodes, 0))).toBe('b=B');
  });

  it('moves an explicit group as one block and deletes its entire contents', () => {
    const items = parse('=A=group\na=A\n=Note=caption\n==groupEnd\nb=B');
    const nodes = buildToggleVisualNodes(items);
    expect(serialize(moveToggleVisualNode(items, nodes, 0, 1))).toBe('b=B\n=A=group\na=A\n=Note=caption\n==groupEnd');
    expect(serialize(removeToggleVisualNode(items, nodes, 0))).toBe('b=B');
  });

  it('closes a formerly nonterminal implicit group when moving it to EOF before runtime appends module toggles', () => {
    const items = parse('=A=group\na=A\n=B=group\nb=B\n==groupEnd');
    expect(serialize(moveToggleVisualNode(items, buildToggleVisualNodes(items), 0, 1))).toBe(
      '=B=group\nb=B\n==groupEnd\n=A=group\na=A\n==groupEnd',
    );
  });

  it('prevents a surviving implicit group from swallowing root items after group deletion', () => {
    const items = parse('=A=group\na=A\n=B=group\nb=B\n==groupEnd\nc=C');
    expect(serialize(removeToggleVisualNode(items, buildToggleVisualNodes(items), 1))).toBe(
      '=A=group\na=A\n==groupEnd\nc=C',
    );
  });

  it('adds a root control outside an EOF group but leaves implicit boundaries intact when adding a group', () => {
    const items = parse('=A=group\na=A');
    expect(serialize(appendToggleRootItems(items, parse('b=B')))).toBe('=A=group\na=A\n==groupEnd\nb=B');
    expect(serialize(appendToggleRootItems(items, parse('=B=group\n==groupEnd')))).toBe(
      '=A=group\na=A\n=B=group\n==groupEnd',
    );
  });

  it('moves a control with its caption between groups and back to the root', () => {
    const items = parse('=A=group\na=A\n=Note=caption\n=B=group\nb=B\n==groupEnd');
    const roots = buildToggleVisualNodes(items);
    const moved = moveToggleNodeToGroup(items, roots[0].children[0], roots[1].start);
    expect(serialize(moved)).toBe('=A=group\n=B=group\nb=B\na=A\n=Note=caption\n==groupEnd');
    const movedRoots = buildToggleVisualNodes(moved);
    expect(serialize(moveToggleNodeToGroup(moved, movedRoots[1].children[1], null))).toBe(
      '=A=group\n=B=group\nb=B\n==groupEnd\na=A\n=Note=caption',
    );
  });
});
