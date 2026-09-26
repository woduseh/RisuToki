import type { RendererDocumentData } from './document-types';

const staleKeys = {
  preview: 'previewStale',
  review: 'reviewStale',
  diagnostics: 'diagnosticsStale',
} as const;

type WorkbenchView = keyof typeof staleKeys;
export type WorkbenchSnapshots = Partial<Record<WorkbenchView, string>>;
export type WorkbenchFreshness = Record<(typeof staleKeys)[WorkbenchView], boolean>;

/** Baselines are serialized once at capture, outside reactive state. Staleness is sticky until refresh. */
export function markStaleWorkbenchSnapshots(
  data: RendererDocumentData | null,
  snapshots: WorkbenchSnapshots,
  state: WorkbenchFreshness,
): void {
  const watched = (Object.keys(staleKeys) as WorkbenchView[]).filter(
    (view) => snapshots[view] !== undefined && !state[staleKeys[view]],
  );
  if (!watched.length) return;
  const current = data ? JSON.stringify(data) : '';
  for (const view of watched) {
    if (current !== snapshots[view]) state[staleKeys[view]] = true;
  }
}
