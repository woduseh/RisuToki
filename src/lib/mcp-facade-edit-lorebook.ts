import {
  buildGuard,
  facadeApiError,
  isApiError,
  route,
  type ApiErrorResult,
  type FacadeRoute,
} from './mcp-facade-runtime';
import type { FacadeApiRequest } from './mcp-facade-script-style';
import type { FacadeV1EditOperation, FacadeV1Guard, FacadeV1Target } from './mcp-request-schemas';

type LorebookCollectionResult = { entries: Array<Record<string, unknown>>; routes: FacadeRoute[] } | ApiErrorResult;

export interface FacadeLorebookEditDeps {
  apiRequest: FacadeApiRequest;
  readActiveLorebookCollection: () => Promise<LorebookCollectionResult>;
  hashStableValue: (value: unknown) => string;
  checkEditGuardValue: (
    guards: FacadeV1Guard[] | undefined,
    name: string,
    actual: string,
  ) => ApiErrorResult | undefined;
}

export function createFacadeLorebookEditOperations(deps: FacadeLorebookEditDeps) {
  async function previewReplaceAllText(target: FacadeV1Target, operation: FacadeV1EditOperation) {
    if (target.kind !== 'active' || operation.selector.family !== 'lorebook') {
      return facadeApiError(
        400,
        'replace_all_text supports the active lorebook only',
        'Use target.kind="active" and selector.family="lorebook".',
        { target, operation },
      );
    }
    const collection = await deps.readActiveLorebookCollection();
    if (isApiError(collection)) return collection;
    const routePath = '/lorebook/replace-all';
    const data = await deps.apiRequest('POST', routePath, {
      find: operation.find,
      replace: operation.replace ?? '',
      regex: operation.regex,
      flags: operation.flags,
      field: operation.field ?? 'content',
      dry_run: true,
    });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [...collection.routes, route('replace_across_all_lorebook', 'POST', routePath)],
          touched: ['active:lorebook'],
          requiredGuards: [
            buildGuard(
              'expected_item_collection_digest',
              deps.hashStableValue(collection.entries),
              '/guard_values/*',
              ['read_content', 'manage_items'],
              '/result/item_collection_digest',
            ),
          ],
        };
  }

  async function applyReplaceAllText(
    target: FacadeV1Target,
    operation: FacadeV1EditOperation,
    guards: FacadeV1Guard[] | undefined,
  ) {
    if (target.kind !== 'active' || operation.selector.family !== 'lorebook') {
      return facadeApiError(
        400,
        'replace_all_text supports the active lorebook only',
        'Use target.kind="active" and selector.family="lorebook".',
        { target, operation },
      );
    }
    const collection = await deps.readActiveLorebookCollection();
    if (isApiError(collection)) return collection;
    const conflict = deps.checkEditGuardValue(
      guards,
      'expected_item_collection_digest',
      deps.hashStableValue(collection.entries),
    );
    if (conflict) return conflict;
    const routePath = '/lorebook/replace-all';
    const data = await deps.apiRequest('POST', routePath, {
      find: operation.find,
      replace: operation.replace ?? '',
      regex: operation.regex,
      flags: operation.flags,
      field: operation.field ?? 'content',
    });
    return isApiError(data)
      ? data
      : {
          data,
          routes: [...collection.routes, route('replace_across_all_lorebook', 'POST', routePath)],
          touched: ['active:lorebook'],
        };
  }

  return { previewReplaceAllText, applyReplaceAllText };
}
