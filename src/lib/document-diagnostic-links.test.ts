import { describe, expect, it } from 'vitest';
import { diagnosticsForChanges } from './document-diagnostic-links';
import type { DocumentDiagnostic } from './document-diagnostics';

describe('diagnostics attached to reviewed changes', () => {
  const issues: DocumentDiagnostic[] = [
    { id: 'one', code: 'pattern', severity: 'error', message: 'first', source: { field: 'regex', index: 0 } },
    { id: 'two', code: 'pattern', severity: 'error', message: 'second', source: { field: 'regex', index: 1 } },
    { id: 'three', code: 'asset', severity: 'warning', message: 'description', source: { field: 'description' } },
  ];
  it('keeps unrelated unchanged item errors out of an item review', () => {
    expect(diagnosticsForChanges(issues, [{ field: 'regex', index: 1 }]).map((issue) => issue.id)).toEqual(['two']);
  });
  it('includes a whole collection once when its structure changed', () => {
    expect(
      diagnosticsForChanges(issues, [{ field: 'regex' }, { field: 'regex', index: 0 }]).map((issue) => issue.id),
    ).toEqual(['one', 'two']);
  });
});
