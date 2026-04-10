export function moveListItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= next.length || toIndex >= next.length) {
    return next;
  }

  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return next;
  }

  next.splice(toIndex, 0, moved);
  return next;
}
