import type { DiagnosticSource, DocumentDiagnostic } from './document-diagnostics';

/** A collection-level review includes all its items; an item review includes only that item's issues. */
export function diagnosticMatchesSource(
  issue: DocumentDiagnostic,
  source: Pick<DiagnosticSource, 'field' | 'index'>,
): boolean {
  return (
    issue.source.field === source.field &&
    (source.index === undefined || issue.source.index === undefined || issue.source.index === source.index)
  );
}

export function diagnosticsForChanges(
  issues: DocumentDiagnostic[],
  changes: Array<Pick<DiagnosticSource, 'field' | 'index'>>,
): DocumentDiagnostic[] {
  return issues.filter((issue) => changes.some((source) => diagnosticMatchesSource(issue, source)));
}
