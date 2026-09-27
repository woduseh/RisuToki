import { formatDocumentStats, summarizeDocumentStats, type DocumentStatsInput } from '../lib/document-stats';
import type { RendererDocumentData } from '../lib/document-types';

interface DocumentStatsDeps {
  getInput(): DocumentStatsInput;
  readAssetCount(): Promise<number>;
  publish(text: string): void;
}

/** Counts are refreshed on document/asset changes, not on every editor redraw. */
export function createDocumentStatsController(deps: DocumentStatsDeps) {
  let document: RendererDocumentData | null = null;
  let revision = 0;
  let assetCount: number | undefined;
  let requested = false;

  function invalidateAssets(): void {
    revision += 1;
    assetCount = undefined;
    requested = false;
  }

  function update(): void {
    const input = deps.getInput();
    if (input.data !== document) {
      document = input.data;
      invalidateAssets();
    }
    if (!document) {
      deps.publish('');
      return;
    }
    const stats = summarizeDocumentStats(input);
    if (assetCount !== undefined) stats.assetCount = assetCount;
    deps.publish(formatDocumentStats(stats));
    if (document._fileType === 'risup' || requested) return;
    requested = true;
    const version = revision;
    const current = document;
    void deps
      .readAssetCount()
      .then((count) => {
        if (version !== revision || deps.getInput().data !== current) return;
        assetCount = count;
        update(); // Publish current text/dirty state, not the state captured before the request.
      })
      .catch(() => {
        // Keep the local count on failure. Retry on the next document/asset change,
        // rather than issuing a failed IPC for every keystroke.
      });
  }

  return { update, invalidateAssets };
}
