import {
  asRecord,
  buildGuard,
  facadeApiError,
  isApiError,
  lorebookReplaceField,
  recordString,
  route,
  selectorTarget,
  type ApiErrorResult,
  type FacadeRoute,
} from './mcp-facade-runtime';
import type { FacadeApiRequest } from './mcp-facade-script-style';
import type {
  FacadeV1ContentSelector,
  FacadeV1EditOperation,
  FacadeV1Guard,
  FacadeV1Target,
} from './mcp-request-schemas';

type SelectorReadResult = { data: unknown; routes: FacadeRoute[] } | ApiErrorResult;
type LorebookReadResult =
  | { index: number; entry: Record<string, unknown>; routes: FacadeRoute[]; resolvedId?: string }
  | ApiErrorResult;

export interface FacadeBlockEditDeps {
  apiRequest: FacadeApiRequest;
  readFacadeSelector: (target: FacadeV1Target, selector: FacadeV1ContentSelector) => Promise<SelectorReadResult>;
  readActiveLorebookEntryForEdit: (selector: FacadeV1ContentSelector) => Promise<LorebookReadResult>;
  replaceableLorebookFields: ReadonlySet<string>;
  hashStableValue: (value: unknown) => string;
  contentHashGuard: (content: string, sourceResultPath: string, sourceOperations?: string[]) => FacadeV1Guard;
  checkEditGuardValue: (
    guards: FacadeV1Guard[] | undefined,
    name: string,
    actual: string,
  ) => ApiErrorResult | undefined;
}

export function createFacadeBlockEditOperations(deps: FacadeBlockEditDeps) {
  async function previewReplaceBlock(target: FacadeV1Target, operation: FacadeV1EditOperation) {
    const touched = [selectorTarget(operation.selector)];
    if (target.kind !== 'active') {
      return facadeApiError(
        400,
        'replace_block supports active targets only',
        'Open the document and retry with target.kind="active".',
        { target, operation },
      );
    }
    if (operation.selector.family === 'field' && operation.selector.field) {
      const read = await deps.readFacadeSelector(target, operation.selector);
      if (isApiError(read)) return read;
      const content = recordString(asRecord(read.data), 'content');
      if (content === undefined) {
        return facadeApiError(
          400,
          `"${operation.selector.field}" is not a string field`,
          'Use replace_block only on active string fields.',
        );
      }
      const routePath = `/field/${encodeURIComponent(operation.selector.field)}/block-replace`;
      const data = await deps.apiRequest('POST', routePath, {
        start_anchor: operation.start_anchor,
        end_anchor: operation.end_anchor,
        content: operation.content,
        include_anchors: operation.include_anchors,
        dry_run: true,
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [...read.routes, route('replace_block_in_field', 'POST', routePath)],
            touched,
            requiredGuards: [
              deps.contentHashGuard(content, '/result/items/*/data/content', ['read_field', 'read_content']),
            ],
          };
    }
    if (operation.selector.family === 'lorebook') {
      const read = await deps.readActiveLorebookEntryForEdit(operation.selector);
      if (isApiError(read)) return read;
      const field = lorebookReplaceField(operation) ?? 'content';
      if (!deps.replaceableLorebookFields.has(field)) {
        return facadeApiError(
          400,
          `Unsupported lorebook block field "${field}"`,
          'Use content, comment, key, or secondkey.',
        );
      }
      const content = typeof read.entry[field] === 'string' ? (read.entry[field] as string) : '';
      const comment = typeof read.entry.comment === 'string' ? read.entry.comment : '';
      const routePath = `/lorebook/${read.index}/block-replace`;
      const data = await deps.apiRequest('POST', routePath, {
        start_anchor: operation.start_anchor,
        end_anchor: operation.end_anchor,
        content: operation.content,
        include_anchors: operation.include_anchors,
        field,
        expected_comment: comment,
        dry_run: true,
      });
      return isApiError(data)
        ? data
        : {
            data: {
              ...(asRecord(data) ?? {}),
              ...(read.resolvedId ? { resolved_id: read.resolvedId } : {}),
              resolved_index: read.index,
            },
            routes: [...read.routes, route('replace_block_in_lorebook', 'POST', routePath)],
            touched,
            requiredGuards: [
              buildGuard(
                'expected_comment',
                comment,
                '/guard_values/*',
                ['read_lorebook', 'read_content'],
                '/result/items/*/data/entry/comment',
              ),
              deps.contentHashGuard(content, `/result/items/*/data/entry/${field}`, ['read_lorebook', 'read_content']),
            ],
          };
    }
    return facadeApiError(
      400,
      'replace_block requires a field or single lorebook selector',
      'Use selector.family="field" with selector.field, or selector.family="lorebook" with selector.index/id.',
    );
  }

  async function applyReplaceBlock(
    target: FacadeV1Target,
    operation: FacadeV1EditOperation,
    guards: FacadeV1Guard[] | undefined,
  ) {
    const touched = [selectorTarget(operation.selector)];
    if (target.kind !== 'active') {
      return facadeApiError(
        400,
        'replace_block supports active targets only',
        'Open the document and retry with target.kind="active".',
        { target, operation },
      );
    }
    if (operation.selector.family === 'field' && operation.selector.field) {
      const read = await deps.readFacadeSelector(target, operation.selector);
      if (isApiError(read)) return read;
      const content = recordString(asRecord(read.data), 'content');
      if (content === undefined) {
        return facadeApiError(
          400,
          `"${operation.selector.field}" is not a string field`,
          'Use replace_block only on active string fields.',
        );
      }
      const conflict = deps.checkEditGuardValue(guards, 'expected_content_hash', deps.hashStableValue(content));
      if (conflict) return conflict;
      const routePath = `/field/${encodeURIComponent(operation.selector.field)}/block-replace`;
      const data = await deps.apiRequest('POST', routePath, {
        start_anchor: operation.start_anchor,
        end_anchor: operation.end_anchor,
        content: operation.content,
        include_anchors: operation.include_anchors,
      });
      return isApiError(data)
        ? data
        : { data, routes: [...read.routes, route('replace_block_in_field', 'POST', routePath)], touched };
    }
    if (operation.selector.family === 'lorebook') {
      const read = await deps.readActiveLorebookEntryForEdit(operation.selector);
      if (isApiError(read)) return read;
      const field = lorebookReplaceField(operation) ?? 'content';
      if (!deps.replaceableLorebookFields.has(field)) {
        return facadeApiError(
          400,
          `Unsupported lorebook block field "${field}"`,
          'Use content, comment, key, or secondkey.',
        );
      }
      const content = typeof read.entry[field] === 'string' ? (read.entry[field] as string) : '';
      const comment = typeof read.entry.comment === 'string' ? read.entry.comment : '';
      const commentConflict = deps.checkEditGuardValue(guards, 'expected_comment', comment);
      if (commentConflict) return commentConflict;
      const contentConflict = deps.checkEditGuardValue(guards, 'expected_content_hash', deps.hashStableValue(content));
      if (contentConflict) return contentConflict;
      const routePath = `/lorebook/${read.index}/block-replace`;
      const data = await deps.apiRequest('POST', routePath, {
        start_anchor: operation.start_anchor,
        end_anchor: operation.end_anchor,
        content: operation.content,
        include_anchors: operation.include_anchors,
        field,
        expected_comment: comment,
      });
      return isApiError(data)
        ? data
        : { data, routes: [...read.routes, route('replace_block_in_lorebook', 'POST', routePath)], touched };
    }
    return facadeApiError(
      400,
      'replace_block requires a field or single lorebook selector',
      'Use selector.family="field" with selector.field, or selector.family="lorebook" with selector.index/id.',
    );
  }

  return { previewReplaceBlock, applyReplaceBlock };
}
