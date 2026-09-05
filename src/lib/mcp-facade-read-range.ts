import { randomUUID } from 'node:crypto';
import {
  asRecord,
  facadeApiError,
  isApiError,
  route,
  type ApiErrorResult,
  type FacadeRoute,
} from './mcp-facade-runtime';
import type { FacadeApiRequest } from './mcp-facade-script-style';
import type { FacadeV1ContentSelector, FacadeV1Target } from './mcp-request-schemas';

interface RangeCursor {
  binding: string;
  fingerprint: string;
  offset: number;
  length: number;
  expiresAt: number;
}

export function hasFieldRange(selector: FacadeV1ContentSelector): boolean {
  return selector.offset !== undefined || selector.length !== undefined || selector.cursor !== undefined;
}

export function createFacadeFieldRangeReader(deps: {
  apiRequest: FacadeApiRequest;
  resolveReferenceIndex: (target: FacadeV1Target) => Promise<number | ApiErrorResult>;
  envelope: (target: FacadeV1Target, result: Record<string, unknown>, routes: FacadeRoute[]) => Record<string, unknown>;
}) {
  const cursors = new Map<string, RangeCursor>();
  return async (target: FacadeV1Target, selector: FacadeV1ContentSelector, maxBytes: number) => {
    if (
      !selector.field ||
      (selector.family !== undefined && selector.family !== 'field') ||
      selector.path ||
      !['active', 'external', 'reference'].includes(target.kind) ||
      (selector.cursor !== undefined && (selector.offset !== undefined || selector.length !== undefined))
    ) {
      return facadeApiError(
        400,
        'Invalid field range selector',
        'Use one field selector with offset/length, or cursor alone, on an active, external, or reference target.',
        undefined,
        ['read_content'],
      );
    }
    for (const [token, cursor] of cursors) if (cursor.expiresAt <= Date.now()) cursors.delete(token);
    const binding = JSON.stringify([
      target.kind,
      target.kind === 'external' || target.kind === 'reference' ? (target.file_path ?? null) : null,
      target.kind === 'reference' ? (target.reference_id ?? null) : null,
      selector.field,
    ]);
    const previous = selector.cursor ? cursors.get(selector.cursor) : undefined;
    if (selector.cursor && (!previous || previous.binding !== binding)) {
      return facadeApiError(
        409,
        'Field range cursor is expired or belongs to another target/field',
        'Restart read_content with an explicit offset and length.',
        { code: 'stale_read_cursor' },
        ['read_content'],
      );
    }
    const offset = previous?.offset ?? selector.offset ?? 0;
    const length = previous?.length ?? selector.length ?? 10000;
    const encodedField = encodeURIComponent(selector.field);
    const query = `offset=${offset}&length=${length}&facade_range=1`;
    let data: unknown;
    let selectedRoute: FacadeRoute;
    if (target.kind === 'external') {
      const path = `/external/field/${encodedField}/range`;
      data = await deps.apiRequest('POST', path, { file_path: target.file_path, offset, length, facade_range: true });
      selectedRoute = route('external_read_field_range', 'POST', path);
    } else if (target.kind === 'reference') {
      const index = await deps.resolveReferenceIndex(target);
      if (typeof index !== 'number') return index;
      const path = `/reference/${index}/field/${encodedField}/range?${query}`;
      data = await deps.apiRequest('GET', path);
      selectedRoute = route('read_reference_field_range', 'GET', path);
    } else {
      const path = `/field/${encodedField}/range?${query}`;
      data = await deps.apiRequest('GET', path);
      selectedRoute = route('read_field_range', 'GET', path);
    }
    if (isApiError(data)) return data;
    const record = asRecord(data);
    if (
      typeof record?.content !== 'string' ||
      typeof record.range_fingerprint !== 'string' ||
      typeof record.totalLength !== 'number' ||
      typeof record.offset !== 'number'
    ) {
      return facadeApiError(
        409,
        'Server does not provide guarded field ranges',
        'Restart or update the MCP server before requesting a field range.',
        undefined,
        ['inspect_document'],
      );
    }
    if (previous && previous.fingerprint !== record.range_fingerprint) {
      cursors.delete(selector.cursor!);
      return facadeApiError(
        409,
        'Field or source document changed between pages',
        'Restart read_content with an explicit offset and length; do not concatenate pages across revisions.',
        { code: 'stale_read_cursor' },
        ['read_content', 'search_document'],
      );
    }
    const text = record.content;
    const start = record.offset;
    const total = record.totalLength;
    const token = `field-range-v1.${randomUUID()}`;
    const makePage = (count: number) => {
      // Binary-search candidates may bisect a surrogate pair.
      if (count > 0 && /[\uD800-\uDBFF]/.test(text[count - 1]) && /[\uDC00-\uDFFF]/.test(text[count] ?? '')) count -= 1;
      const end = start + count;
      return deps.envelope(
        target,
        {
          items: [
            {
              selector: { family: 'field', field: selector.field },
              data: {
                field: selector.field,
                content: text.slice(0, count),
                offset: start,
                length: count,
                totalLength: total,
                offset_unit: 'utf16',
                line_endings: 'LF',
                hasMore: end < total,
                next_cursor: end < total ? token : null,
              },
            },
          ],
          routed_legacy: [selectedRoute],
          touched_targets: [`field:${selector.field}`],
        },
        [selectedRoute],
      );
    };
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (Buffer.byteLength(JSON.stringify(makePage(middle)), 'utf8') <= maxBytes) low = middle;
      else high = middle - 1;
    }
    const page = makePage(low);
    const item = (
      (page.result as Record<string, unknown>).items as Array<{ data: { length: number; next_cursor: string | null } }>
    )[0].data;
    if (Buffer.byteLength(JSON.stringify(page), 'utf8') > maxBytes || (item.length === 0 && start < total)) {
      return facadeApiError(
        400,
        'max_bytes is too small for a progressing field range',
        'Increase max_bytes (2048 or more is recommended).',
        { code: 'read_budget_too_small' },
        ['read_content'],
      );
    }
    if (item.next_cursor) {
      while (cursors.size >= 256) cursors.delete(cursors.keys().next().value!);
      cursors.set(token, {
        binding,
        fingerprint: record.range_fingerprint,
        offset: start + item.length,
        length,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
    }
    return page;
  };
}
