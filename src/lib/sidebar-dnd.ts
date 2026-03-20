/**
 * sidebar-dnd.ts — Drag-and-drop reordering for sidebar items using SortableJS.
 *
 * Manages SortableJS instances for lorebook, regex, Lua sections, CSS sections,
 * and asset lists. Uses a dependency-injection pattern to stay decoupled from
 * the controller.
 */

import Sortable from 'sortablejs';
import type { Section } from './section-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DndDeps {
  // Data accessors
  getFileData: () => Record<string, unknown> | null;
  getLuaSections: () => Section[];
  getCssSections: () => Section[];
  getCssStylePrefix: () => string;
  getCssStyleSuffix: () => string;

  // Reorder callbacks
  reorderLorebook: (fromIdx: number, toIdx: number, targetFolder: string) => void;
  reorderRegex: (fromIdx: number, toIdx: number) => void;
  reorderLuaSections: (fromIdx: number, toIdx: number) => void;
  reorderCssSections: (fromIdx: number, toIdx: number) => void;
  reorderAsset: (fromPath: string, toIdx: number) => void;
  reorderAlternateGreetings: (fromIdx: number, toIdx: number) => void;
  reorderGroupOnlyGreetings: (fromIdx: number, toIdx: number) => void;
}

// ---------------------------------------------------------------------------
// Shared options (matches RisuAI pattern)
// ---------------------------------------------------------------------------

const SHARED_OPTIONS: Sortable.Options = {
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

/** Read data-dnd-idx from SortableJS event items to build old→new index map */
function readIndicesFromContainer(container: HTMLElement): number[] {
  const indices: number[] = [];
  container.querySelectorAll(':scope > [data-dnd-idx]').forEach((el) => {
    indices.push(parseInt((el as HTMLElement).dataset.dndIdx!, 10));
  });
  return indices;
}

/** Generic flat-list reorder: reads new order from DOM, calls reorder callback, reverts DOM */
function makeFlatOnEnd(reorder: (fromIdx: number, toIdx: number) => void): Sortable.Options['onEnd'] {
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

  // --- Lorebook ---
  initLorebookDnD(deps);

  // --- Regex ---
  initRegexDnD(deps);

  // --- Lua sections ---
  initSectionDnD('lua', deps);

  // --- CSS sections ---
  initSectionDnD('css', deps);

  // --- Assets ---
  initAssetDnD(deps);

  // --- Alternate Greetings ---
  initGreetingDnD('altgreet', deps.reorderAlternateGreetings);

  // --- Group Only Greetings ---
  initGreetingDnD('grpgreet', deps.reorderGroupOnlyGreetings);
}

// ---------------------------------------------------------------------------
// Lorebook DnD (supports cross-folder drag)
// ---------------------------------------------------------------------------

function initLorebookDnD(deps: DndDeps): void {
  const containers = document.querySelectorAll<HTMLElement>('[data-dnd-lore-container]');
  if (containers.length === 0) return;

  containers.forEach((container) => {
    track(
      Sortable.create(container, {
        ...SHARED_OPTIONS,
        group: 'lorebook',
        swapThreshold: 0.9,
        onEnd: (evt) => {
          if (evt.oldIndex == null || evt.newIndex == null) return;
          // Same container, same position
          if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;

          const movedDataIdx = parseInt(evt.item.dataset.dndIdx!, 10);
          const targetFolder = (evt.to as HTMLElement).dataset.dndLoreFolder || '';

          // Compute target position within the folder
          // Read all data-dnd-idx in the target container AFTER the move
          const targetIndices = readIndicesFromContainer(evt.to as HTMLElement);
          const posInFolder = targetIndices.indexOf(movedDataIdx);

          // Revert DOM — let buildSidebar handle re-rendering
          revertDom(evt);

          deps.reorderLorebook(movedDataIdx, posInFolder, targetFolder);
        },
      }),
    );
  });
}

function revertDom(evt: Sortable.SortableEvent): void {
  // If cross-container move, return item to original container
  if (evt.from !== evt.to && evt.item.parentNode === evt.to) {
    evt.to.removeChild(evt.item);
    const ref = evt.from.children[evt.oldIndex!];
    if (ref) {
      evt.from.insertBefore(evt.item, ref);
    } else {
      evt.from.appendChild(evt.item);
    }
  } else if (evt.from === evt.to && evt.oldIndex !== evt.newIndex) {
    // Same container, revert position
    const container = evt.from;
    if (evt.oldIndex! < evt.newIndex!) {
      container.insertBefore(evt.item, container.children[evt.oldIndex!]);
    } else {
      const ref = container.children[evt.oldIndex! + 1];
      if (ref) {
        container.insertBefore(evt.item, ref);
      } else {
        container.appendChild(evt.item);
      }
    }
  }
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
// Asset DnD (within each subfolder)
// ---------------------------------------------------------------------------

function initAssetDnD(deps: DndDeps): void {
  const containers = document.querySelectorAll<HTMLElement>('[data-dnd-asset-container]');
  containers.forEach((container) => {
    track(
      Sortable.create(container, {
        ...SHARED_OPTIONS,
        onEnd: (evt) => {
          if (evt.oldIndex == null || evt.newIndex == null || evt.oldIndex === evt.newIndex) return;
          const assetPath = evt.item.dataset.dndAssetPath || '';
          deps.reorderAsset(assetPath, evt.newIndex);
        },
      }),
    );
  });
}

// ---------------------------------------------------------------------------
// Greeting DnD (flat list — alternateGreetings / groupOnlyGreetings)
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
