/**
 * sidebar-dnd.ts — Drag-and-drop reordering for sidebar items using SortableJS.
 *
 * Manages SortableJS instances for regex, Lua/CSS sections, and greetings.
 * Lorebook and prompt managers reuse the shared drag options but own their
 * sortable instances.
 */

import Sortable from 'sortablejs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DndDeps {
  // Data accessors
  getFileData: () => Record<string, unknown> | null;

  // Reorder callbacks
  reorderRegex: (fromIdx: number, toIdx: number) => void;
  reorderLuaSections: (fromIdx: number, toIdx: number) => void;
  reorderCssSections: (fromIdx: number, toIdx: number) => void;
  reorderAlternateGreetings: (fromIdx: number, toIdx: number) => void;
}

// ---------------------------------------------------------------------------
// Shared options (matches RisuAI pattern)
// ---------------------------------------------------------------------------

export const SHARED_OPTIONS: Sortable.Options = {
  delay: 200,
  delayOnTouchOnly: true,
  animation: 150,
  ghostClass: 'dnd-ghost',
  chosenClass: 'dnd-chosen',
  dragClass: 'dnd-drag',
  filter: '.no-sort',
  onMove: (evt) => !evt.related.classList.contains('no-sort'),
};

// ---------------------------------------------------------------------------
// Instance tracking
// ---------------------------------------------------------------------------

let _instances: Sortable[] = [];

export function destroyAllSortables(): void {
  for (const s of _instances) {
    try {
      s.destroy();
    } catch {
      /* already destroyed */
    }
  }
  _instances = [];
}

function track(s: Sortable): Sortable {
  _instances.push(s);
  return s;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generic flat-list reorder: reads new order from DOM, calls reorder callback, reverts DOM */
export function makeFlatOnEnd(reorder: (fromIdx: number, toIdx: number) => void): Sortable.Options['onEnd'] {
  return (evt) => {
    if (evt.oldIndex == null || evt.newIndex == null || evt.oldIndex === evt.newIndex) return;
    const container = evt.from;
    // Revert DOM so rebuild handles it
    if (evt.oldIndex < evt.newIndex) {
      container.insertBefore(evt.item, container.children[evt.oldIndex]);
    } else {
      container.insertBefore(evt.item, container.children[evt.oldIndex + 1]);
    }
    const movedDataIdx = parseInt(evt.item.dataset.dndIdx!, 10);
    reorder(movedDataIdx, evt.newIndex);
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initSidebarDnD(deps: DndDeps): void {
  destroyAllSortables();

  const fileData = deps.getFileData();
  if (!fileData) return;

  // --- Regex ---
  initRegexDnD(deps);

  // --- Lua sections ---
  initSectionDnD('lua', deps);

  // --- CSS sections ---
  initSectionDnD('css', deps);

  // --- Alternate Greetings ---
  initGreetingDnD('altgreet', deps.reorderAlternateGreetings);
}

// ---------------------------------------------------------------------------
// Regex DnD (flat list)
// ---------------------------------------------------------------------------

function initRegexDnD(deps: DndDeps): void {
  const container = document.querySelector<HTMLElement>('[data-dnd-regex-container]');
  if (!container) return;

  track(
    Sortable.create(container, {
      ...SHARED_OPTIONS,
      onEnd: makeFlatOnEnd(deps.reorderRegex),
    }),
  );
}

// ---------------------------------------------------------------------------
// Section DnD (Lua / CSS — flat list)
// ---------------------------------------------------------------------------

function initSectionDnD(type: 'lua' | 'css', deps: DndDeps): void {
  const container = document.querySelector<HTMLElement>(`[data-dnd-${type}-container]`);
  if (!container) return;

  const reorder = type === 'lua' ? deps.reorderLuaSections : deps.reorderCssSections;
  track(
    Sortable.create(container, {
      ...SHARED_OPTIONS,
      onEnd: makeFlatOnEnd(reorder),
    }),
  );
}

// ---------------------------------------------------------------------------
// Greeting DnD (flat list — alternateGreetings)
// ---------------------------------------------------------------------------

function initGreetingDnD(type: string, reorder: (fromIdx: number, toIdx: number) => void): void {
  const container = document.querySelector<HTMLElement>(`[data-dnd-${type}-container]`);
  if (!container) return;

  track(
    Sortable.create(container, {
      ...SHARED_OPTIONS,
      onEnd: makeFlatOnEnd(reorder),
    }),
  );
}
