import type { FacadeContentEngine } from './mcp-facade-content';
import { createFacadeBlockEditOperations } from './mcp-facade-edit-block';
import { createFacadeLorebookEditOperations } from './mcp-facade-edit-lorebook';
import type { FacadeItemsEngine } from './mcp-facade-items';
import {
  asRecord,
  buildGuard,
  facadeApiError,
  greetingPreview,
  guardConflict,
  guardValue,
  isApiError,
  isReadOnlyFacadeFieldPayload,
  lorebookReplaceField,
  mergeGuards,
  normalizeBatchEntries,
  recordNumber,
  recordString,
  replacementString,
  route,
  selectorTarget,
  stringGuardValue,
  type ApiErrorResult,
  type FacadeRoute,
} from './mcp-facade-runtime';
import type { FacadeApiRequest, FacadeScriptStyleEngine } from './mcp-facade-script-style';
import type {
  FacadeV1ContentSelector,
  FacadeV1EditOperation,
  FacadeV1Guard,
  FacadeV1Target,
} from './mcp-request-schemas';

type FacadeEditContentDeps = Pick<FacadeContentEngine, 'readFacadeSelector'>;
type FacadeEditItemsDeps = Pick<FacadeItemsEngine, 'prepareExternalRisupPromptMutation'>;
type FacadeEditScriptStyleDeps = Pick<
  FacadeScriptStyleEngine,
  | 'EXTERNAL_LOREBOOK_REPLACEABLE_FIELDS'
  | 'applyActiveScriptStyleMutation'
  | 'applyExternalStructuredMutation'
  | 'buildExternalScriptStylePatchPlan'
  | 'computeSurfaceReplacement'
  | 'contentStringFromOperation'
  | 'externalExpectedHashGuard'
  | 'hashStableValue'
  | 'insertSpecFromOperation'
  | 'isScriptStyleFamily'
  | 'itemByIndex'
  | 'previewActiveScriptStyleMutation'
  | 'previewExternalStructuredMutation'
  | 'readExternalSurfaceValue'
  | 'rewriteOperationBatchContent'
>;

export interface FacadeEditEngineDeps {
  apiRequest: FacadeApiRequest;
  content: FacadeEditContentDeps;
  items: FacadeEditItemsDeps;
  scriptStyle: FacadeEditScriptStyleDeps;
}

export function createFacadeEditEngine({ apiRequest, content, items, scriptStyle }: FacadeEditEngineDeps) {
  const { readFacadeSelector } = content;
  const { prepareExternalRisupPromptMutation } = items;
  const {
    EXTERNAL_LOREBOOK_REPLACEABLE_FIELDS,
    applyActiveScriptStyleMutation,
    applyExternalStructuredMutation,
    buildExternalScriptStylePatchPlan,
    computeSurfaceReplacement,
    contentStringFromOperation,
    externalExpectedHashGuard,
    hashStableValue,
    insertSpecFromOperation,
    isScriptStyleFamily,
    itemByIndex,
    previewActiveScriptStyleMutation,
    previewExternalStructuredMutation,
    readExternalSurfaceValue,
    rewriteOperationBatchContent,
  } = scriptStyle;

  function findIndexedRecord(value: unknown, index: number, depth = 0): Record<string, unknown> | undefined {
    if (depth > 5) return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findIndexedRecord(item, index, depth + 1);
        if (found) return found;
      }
      return undefined;
    }

    const recordValue = asRecord(value);
    if (!recordValue) return undefined;
    if (Number(recordValue.index) === index) return recordValue;

    for (const key of ['entry', 'item', 'entries', 'items', 'results', 'greetings', 'data']) {
      const found = findIndexedRecord(recordValue[key], index, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  function lorebookExpectedComment(guards: FacadeV1Guard[] | undefined): string | undefined {
    return stringGuardValue(guards, 'expected_comment');
  }

  function contentHashGuard(
    content: string,
    sourceResultPath: string,
    sourceOperations: string[] = ['read_content'],
  ): FacadeV1Guard {
    return buildGuard(
      'expected_content_hash',
      hashStableValue(content),
      '/guard_values/*',
      sourceOperations,
      sourceResultPath,
    );
  }

  function checkEditGuardValue(
    guards: FacadeV1Guard[] | undefined,
    name: string,
    actual: string,
  ): ApiErrorResult | undefined {
    const expected = stringGuardValue(guards, name);
    if (expected === undefined) {
      return facadeApiError(
        400,
        `Missing guard value for ${name}`,
        'Run preview_edit again, then apply with every returned guard value.',
        { guard: name },
        ['preview_edit'],
      );
    }
    if (expected !== actual) {
      return facadeApiError(
        409,
        `Stale guard mismatch for ${name}`,
        'Refresh the content and run preview_edit again.',
        { guard: name, expected, actual },
        ['read_content', 'preview_edit'],
      );
    }
    return undefined;
  }

  async function readActiveLorebookEntryForEdit(
    selector: FacadeV1ContentSelector,
  ): Promise<
    { index: number; entry: Record<string, unknown>; routes: FacadeRoute[]; resolvedId?: string } | ApiErrorResult
  > {
    if (selector.index !== undefined) {
      const routePath = `/lorebook/${selector.index}`;
      const data = await apiRequest('GET', routePath);
      if (isApiError(data)) return data;
      const entry = asRecord(asRecord(data)?.entry);
      if (!entry) {
        return facadeApiError(
          400,
          'Lorebook entry response is missing entry data',
          'Refresh the lorebook list and retry.',
        );
      }
      return {
        index: selector.index,
        entry,
        routes: [route('read_lorebook', 'GET', routePath)],
      };
    }
    if (selector.id) {
      const routePath = `/lorebook/by-id/${encodeURIComponent(selector.id)}`;
      const data = await apiRequest('GET', routePath);
      if (isApiError(data)) return data;
      const record = asRecord(data);
      const index = recordNumber(record, 'index');
      const entry = asRecord(record?.entry);
      if (index === undefined || !entry) {
        return facadeApiError(
          404,
          'Lorebook id did not resolve to an entry',
          'Refresh the lorebook list and retry with a current id.',
        );
      }
      return {
        index,
        entry,
        routes: [route('read_lorebook_by_id', 'GET', routePath)],
        resolvedId: selector.id,
      };
    }
    return facadeApiError(
      400,
      'Lorebook block replacement requires selector.index or selector.id',
      'Choose one lorebook entry before replacing a block.',
    );
  }

  async function readActiveLorebookCollection(): Promise<
    { entries: Array<Record<string, unknown>>; routes: FacadeRoute[] } | ApiErrorResult
  > {
    const routePath = '/surface/read';
    const data = await apiRequest('POST', routePath, { path: '/lorebook' });
    if (isApiError(data)) return data;
    const value = asRecord(data)?.value;
    if (!Array.isArray(value) || !value.every((entry) => asRecord(entry) !== undefined)) {
      return facadeApiError(
        400,
        'Active lorebook surface is not an object array',
        'Inspect the active document before retrying the lorebook operation.',
      );
    }
    return {
      entries: value as Array<Record<string, unknown>>,
      routes: [route('read_surface', 'POST', routePath)],
    };
  }

  const { previewReplaceBlock, applyReplaceBlock } = createFacadeBlockEditOperations({
    apiRequest,
    readFacadeSelector,
    readActiveLorebookEntryForEdit,
    replaceableLorebookFields: EXTERNAL_LOREBOOK_REPLACEABLE_FIELDS,
    hashStableValue,
    contentHashGuard,
    checkEditGuardValue,
  });
  const { previewReplaceAllText, applyReplaceAllText } = createFacadeLorebookEditOperations({
    apiRequest,
    readActiveLorebookCollection,
    hashStableValue,
    checkEditGuardValue,
  });

  async function previewPromptItemById(operation: FacadeV1EditOperation, id: string) {
    const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(id)}`;
    const read = await apiRequest('GET', promptRoute);
    if (isApiError(read)) return read;
    const readRecord = asRecord(read);
    const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
    const currentPreview = recordString(readRecord, 'preview');
    const typeConflict = guardConflict(operation.guards, 'expected_type', currentType, `risup-prompt:${id}`);
    if (typeConflict) return typeConflict;
    const previewConflict = guardConflict(operation.guards, 'expected_preview', currentPreview, `risup-prompt:${id}`);
    if (previewConflict) return previewConflict;
    const item = asRecord(operation.content);
    if (operation.op === 'write_content' && !item) {
      return facadeApiError(
        400,
        'risup-prompt write_content requires an item object',
        'Set operations[].content to the replacement prompt item object.',
        { operation },
      );
    }
    return {
      data: {
        dryRun: true,
        resolved_id: id,
        resolved_index: recordNumber(readRecord, 'index'),
        currentType,
        currentPreview,
        ...(operation.op === 'write_content'
          ? { replacementType: recordString(item, 'type') }
          : { operation: 'delete_item' }),
      },
      routes: [
        route('read_risup_prompt_item_by_id', 'GET', promptRoute),
        operation.op === 'write_content'
          ? route('write_risup_prompt_item_by_id', 'POST', promptRoute)
          : route('delete_risup_prompt_item_by_id', 'POST', `${promptRoute}/delete`),
      ],
      touched: [selectorTarget(operation.selector)],
      requiredGuards: mergeGuards(operation.guards, [
        currentType === undefined
          ? undefined
          : buildGuard('expected_type', currentType, '/expected_type', ['read_risup_prompt_item_by_id'], '/type'),
        currentPreview === undefined
          ? undefined
          : buildGuard(
              'expected_preview',
              currentPreview,
              '/expected_preview',
              ['read_risup_prompt_item_by_id'],
              '/preview',
            ),
      ]),
    };
  }

  async function previewFacadeOperation(
    target: FacadeV1Target,
    operation: FacadeV1EditOperation,
  ): Promise<
    { data: unknown; routes: FacadeRoute[]; touched: string[]; requiredGuards: FacadeV1Guard[] } | ApiErrorResult
  > {
    if (target.kind !== 'active' && target.kind !== 'external') {
      return facadeApiError(
        400,
        'preview_edit supports active-document edits and second-wave external field edits',
        'Use active or external targets, or granular tools for unsupported target kinds.',
      );
    }

    const touched = [selectorTarget(operation.selector)];
    if (operation.op === 'replace_block') {
      return previewReplaceBlock(target, operation);
    }
    if (operation.op === 'replace_all_text') {
      return previewReplaceAllText(target, operation);
    }
    if (
      operation.selector.family === 'greeting' &&
      operation.selector.greeting_type === 'group' &&
      (operation.op === 'write_content' || operation.op === 'delete_item')
    ) {
      return facadeApiError(
        400,
        'groupOnlyGreetings is read-only',
        'groupOnlyGreetings is deprecated and kept only for compatibility reads. Use alternate greetings or supported current fields instead.',
        { selector: operation.selector },
      );
    }
    if (
      target.kind === 'active' &&
      isScriptStyleFamily(operation.selector.family) &&
      (operation.op === 'write_content' ||
        operation.op === 'replace_text' ||
        operation.op === 'insert_text' ||
        operation.op === 'delete_item')
    ) {
      return previewActiveScriptStyleMutation(operation);
    }
    if (
      target.kind === 'external' &&
      isScriptStyleFamily(operation.selector.family) &&
      (operation.op === 'write_content' ||
        operation.op === 'replace_text' ||
        operation.op === 'insert_text' ||
        operation.op === 'delete_item')
    ) {
      const plan = await buildExternalScriptStylePatchPlan(target, operation, operation.guards);
      if (isApiError(plan)) return plan;
      const routePath = '/external/surface/patch';
      const dryRun = await apiRequest('POST', routePath, {
        file_path: target.file_path,
        operations: plan.operations,
        dry_run: true,
        expected_hash: guardValue(operation.guards, 'expected_hash'),
      });
      if (isApiError(dryRun)) return dryRun;
      const beforeHash = recordString(asRecord(dryRun), 'before_hash');
      return {
        data: { ...plan.data, ...(asRecord(dryRun) ?? {}) },
        routes: [...plan.routes, route('external_patch_surface', 'POST', routePath)],
        touched: plan.touched,
        requiredGuards: mergeGuards(plan.requiredGuards, [
          beforeHash ? externalExpectedHashGuard(beforeHash) : undefined,
        ]),
      };
    }
    if (
      target.kind === 'external' &&
      operation.selector.family === 'risup-prompt' &&
      (operation.op === 'write_content' || operation.op === 'delete_item')
    ) {
      const prepared = await prepareExternalRisupPromptMutation(target, operation);
      if (isApiError(prepared)) return prepared;
      return {
        data: {
          ...(asRecord(prepared.data) ?? {}),
          newSize: prepared.newPromptTemplate.length,
        },
        routes: prepared.routes,
        touched: prepared.touched,
        requiredGuards: prepared.requiredGuards,
      };
    }
    if (
      target.kind === 'external' &&
      ['lorebook', 'regex', 'greeting'].includes(operation.selector.family ?? '') &&
      (operation.op === 'write_content' || operation.op === 'delete_item' || operation.op === 'replace_text')
    ) {
      return previewExternalStructuredMutation(target, operation);
    }
    if (
      target.kind === 'active' &&
      operation.op === 'replace_text' &&
      operation.selector.family === 'lorebook' &&
      operation.selector.index !== undefined
    ) {
      if (!operation.find) {
        return facadeApiError(400, 'replace_text requires find', 'Provide operations[].find.');
      }
      const lorebookRoute = `/lorebook/${operation.selector.index}/replace`;
      const data = await apiRequest('POST', lorebookRoute, {
        find: operation.find,
        replace: typeof operation.replace === 'string' ? operation.replace : '',
        regex: operation.regex,
        flags: operation.flags,
        field: lorebookReplaceField(operation),
        expected_comment: lorebookExpectedComment(operation.guards),
        dry_run: true,
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('replace_in_lorebook', 'POST', lorebookRoute)],
            touched,
            requiredGuards: operation.guards ?? [],
          };
    }

    if (
      operation.op === 'replace_text' &&
      operation.selector.family === 'lorebook' &&
      operation.selector.index !== undefined
    ) {
      return facadeApiError(
        400,
        'preview_edit lorebook replacement supports active targets only',
        'Use target.kind="active" for lorebook replace_text, or open the external/reference document first.',
        { operation },
      );
    }

    if (
      target.kind === 'active' &&
      operation.op === 'replace_text' &&
      operation.selector.family === 'lorebook' &&
      operation.selector.id
    ) {
      const readRoute = `/lorebook/by-id/${encodeURIComponent(operation.selector.id)}`;
      const read = await apiRequest('GET', readRoute);
      if (isApiError(read)) return read;
      const index = recordNumber(asRecord(read), 'index');
      if (index === undefined)
        return facadeApiError(
          404,
          'Lorebook id did not resolve to an index',
          'Run read_content/list_lorebook again and retry preview_edit.',
        );
      operation.selector.index = index;
      const lorebookRoute = `/lorebook/${index}/replace`;
      const data = await apiRequest('POST', lorebookRoute, {
        find: operation.find,
        replace: typeof operation.replace === 'string' ? operation.replace : '',
        regex: operation.regex,
        flags: operation.flags,
        field: lorebookReplaceField(operation),
        expected_comment: lorebookExpectedComment(operation.guards),
        dry_run: true,
      });
      return isApiError(data)
        ? data
        : {
            data: { ...(asRecord(data) ?? {}), resolved_id: operation.selector.id, resolved_index: index },
            routes: [
              route('read_lorebook_by_id', 'GET', readRoute),
              route('replace_in_lorebook', 'POST', lorebookRoute),
            ],
            touched,
            requiredGuards: operation.guards ?? [],
          };
    }

    if (
      target.kind === 'active' &&
      (operation.op === 'write_content' || operation.op === 'delete_item') &&
      operation.selector.family === 'lorebook' &&
      operation.selector.id
    ) {
      const readRoute = `/lorebook/by-id/${encodeURIComponent(operation.selector.id)}`;
      const read = await apiRequest('GET', readRoute);
      if (isApiError(read)) return read;
      const index = recordNumber(asRecord(read), 'index');
      const entry = asRecord(asRecord(read)?.entry);
      if (index === undefined)
        return facadeApiError(
          404,
          'Lorebook id did not resolve to an index',
          'Run read_content/list_lorebook again and retry preview_edit.',
        );
      const currentComment = recordString(entry, 'comment');
      const conflict = guardConflict(
        operation.guards,
        'expected_comment',
        currentComment,
        `lorebook:${operation.selector.id}`,
      );
      if (conflict) return conflict;
      operation.selector.index = index;
      const content = asRecord(operation.content);
      if (operation.op === 'write_content' && !content) {
        return facadeApiError(
          400,
          'lorebook write_content requires an object',
          'Set operations[].content to the partial lorebook entry data.',
          { operation },
        );
      }
      return {
        data: {
          dryRun: true,
          resolved_id: operation.selector.id,
          resolved_index: index,
          currentComment,
          ...(operation.op === 'write_content' ? { updatedKeys: Object.keys(content!) } : { operation: 'delete_item' }),
        },
        routes: [
          route('read_lorebook_by_id', 'GET', readRoute),
          operation.op === 'write_content'
            ? route('write_lorebook_by_id', 'POST', readRoute)
            : route('delete_lorebook_by_id', 'POST', `${readRoute}/delete`),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentComment === undefined
            ? undefined
            : buildGuard(
                'expected_comment',
                currentComment,
                '/expected_comment',
                ['read_lorebook_by_id'],
                '/entry/comment',
              ),
        ]),
      };
    }

    if (operation.selector.family === 'lorebook') {
      return facadeApiError(
        400,
        'Unsupported preview lorebook operation',
        'preview_edit supports active lorebook replace_text only when selector.index is provided; write_content and broad lorebook edits remain unsupported.',
        { operation },
      );
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'regex' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      const entries = normalizeBatchEntries(operation, 'data');
      if (isApiError(entries)) return entries;
      const read = await apiRequest('POST', '/regex/batch', { indices: operation.selector.indices });
      if (isApiError(read)) return read;
      const requiredGuards: FacadeV1Guard[] = [];
      const enrichedEntries: Array<Record<string, unknown>> = [];
      const previews: Array<Record<string, unknown>> = [];
      for (const [position, entry] of entries.entries()) {
        const idx = recordNumber(entry, 'index');
        const data = asRecord(entry.data);
        if (idx === undefined || !data) {
          return facadeApiError(
            400,
            'Invalid regex batch write entry',
            'Each regex batch entry must provide an index and data object.',
            { entry, position },
            ['read_regex_batch', 'preview_edit'],
          );
        }
        const currentRecord = itemByIndex(read, 'entries', idx);
        const currentComment = recordString(asRecord(currentRecord?.entry) ?? currentRecord, 'comment');
        const expectedComment = recordString(entry, 'expected_comment');
        if (expectedComment !== undefined && currentComment !== undefined && expectedComment !== currentComment) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_comment',
            'Re-list/read regex entries, then run preview_edit again with current expected_comment values.',
            { target: `regex:${idx}`, guard: 'expected_comment', expected: expectedComment, actual: currentComment },
            ['list_regex', 'read_regex_batch', 'preview_edit'],
          );
        }
        enrichedEntries.push({ ...entry, data, expected_comment: currentComment });
        previews.push({ index: idx, currentComment, updatedKeys: Object.keys(data) });
        if (currentComment !== undefined) {
          requiredGuards.push(
            buildGuard(
              'expected_comment',
              currentComment,
              `/entries/${position}/expected_comment`,
              ['read_regex_batch'],
              `/entries/${position}/entry/comment`,
            ),
          );
        }
      }
      rewriteOperationBatchContent(operation, 'entries', enrichedEntries);
      return {
        data: { dryRun: true, operation: 'write_content', count: enrichedEntries.length, entries: previews },
        routes: [
          route('read_regex_batch', 'POST', '/regex/batch'),
          route('write_regex_batch', 'POST', '/regex/batch-write'),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'regex' &&
      operation.selector.identity
    ) {
      const data = asRecord(operation.content);
      if (!data)
        return facadeApiError(
          400,
          'regex write_content requires an object',
          'Set operations[].content to partial regex entry data.',
          { operation },
        );
      const read = await apiRequest('POST', '/regex/by-identity/read', { identity: operation.selector.identity });
      if (isApiError(read)) return read;
      const readRecord = asRecord(read);
      const index = recordNumber(readRecord, 'index');
      const entry = asRecord(readRecord?.entry);
      const currentComment = recordString(entry, 'comment');
      const conflict = guardConflict(operation.guards, 'expected_comment', currentComment, 'regex:identity');
      if (conflict) return conflict;
      return {
        data: {
          dryRun: true,
          resolved_identity: operation.selector.identity,
          resolved_index: index,
          currentComment,
          updatedKeys: Object.keys(data),
        },
        routes: [
          route('read_regex_by_identity', 'POST', '/regex/by-identity/read'),
          route('write_regex_by_identity', 'POST', '/regex/by-identity/write'),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentComment === undefined
            ? undefined
            : buildGuard(
                'expected_comment',
                currentComment,
                '/expected_comment',
                ['read_regex_by_identity'],
                '/entry/comment',
              ),
        ]),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'regex' &&
      operation.selector.index !== undefined
    ) {
      const regexRoute = `/regex/${operation.selector.index}`;
      const read = await apiRequest('GET', regexRoute);
      if (isApiError(read)) return read;
      const indexedRecord = findIndexedRecord(read, operation.selector.index);
      const currentComment = recordString(asRecord(indexedRecord?.entry) ?? indexedRecord, 'comment');
      const conflict = guardConflict(
        operation.guards,
        'expected_comment',
        currentComment,
        `regex:${operation.selector.index}`,
      );
      if (conflict) return conflict;
      return {
        data: {
          dryRun: true,
          index: operation.selector.index,
          currentComment,
          updatedKeys: Object.keys(asRecord(operation.content) ?? {}),
        },
        routes: [route('read_regex', 'GET', regexRoute), route('write_regex', 'POST', regexRoute)],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentComment === undefined
            ? undefined
            : {
                name: 'expected_comment',
                value: currentComment,
                payloadPath: '/expected_comment',
                sourceOperations: ['read_regex'],
                sourceResultPath: '/entry/comment',
              },
        ]),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'greeting' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting batch write selector',
          'preview_edit greeting batch writes require greeting_type="alternate" or "group".',
          { operation },
          ['list_greetings', 'read_greeting_batch', 'preview_edit'],
        );
      }
      const writes = normalizeBatchEntries(operation, 'content');
      if (isApiError(writes)) return writes;
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const readRoute = `/greeting/${greetingType}/batch`;
      const read = await apiRequest('POST', readRoute, { indices: operation.selector.indices });
      if (isApiError(read)) return read;
      const requiredGuards: FacadeV1Guard[] = [];
      const enrichedWrites: Array<Record<string, unknown>> = [];
      const previews: Array<Record<string, unknown>> = [];
      for (const [position, write] of writes.entries()) {
        const idx = recordNumber(write, 'index');
        const currentContent = idx === undefined ? undefined : recordString(itemByIndex(read, 'items', idx), 'content');
        const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
        const expectedPreview = recordString(write, 'expected_preview');
        if (idx === undefined) {
          return facadeApiError(
            400,
            'Invalid greeting batch write entry',
            'Each greeting batch write entry must align to an index.',
            { write, position },
            ['read_greeting_batch', 'preview_edit'],
          );
        }
        if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_preview',
            'Re-list/read greetings, then run preview_edit again with current expected_preview values.',
            {
              target: `greeting:${operation.selector.greeting_type}:${idx}`,
              guard: 'expected_preview',
              expected: expectedPreview,
              actual: currentPreview,
            },
            ['list_greetings', 'read_greeting_batch', 'preview_edit'],
          );
        }
        const newContent = replacementString(write.content);
        enrichedWrites.push({ ...write, content: newContent, expected_preview: currentPreview });
        previews.push({ index: idx, oldSize: currentContent?.length ?? 0, newSize: newContent.length });
        if (currentPreview !== undefined) {
          requiredGuards.push(
            buildGuard(
              'expected_preview',
              currentPreview,
              `/writes/${position}/expected_preview`,
              ['read_greeting_batch'],
              `/items/${position}/content`,
            ),
          );
        }
      }
      rewriteOperationBatchContent(operation, 'writes', enrichedWrites);
      return {
        data: {
          dryRun: true,
          operation: 'write_content',
          type: operation.selector.greeting_type,
          count: enrichedWrites.length,
          writes: previews,
        },
        routes: [
          route('read_greeting_batch', 'POST', readRoute),
          route('batch_write_greeting', 'POST', `/greeting/${greetingType}/batch-write`),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'greeting' &&
      operation.selector.identity
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting identity write selector',
          'preview_edit greeting identity writes require greeting_type="alternate" or "group".',
          { operation },
        );
      }
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const readRoute = `/greeting/${greetingType}/by-hash/read`;
      const read = await apiRequest('POST', readRoute, { identity: operation.selector.identity });
      if (isApiError(read)) return read;
      const currentContent = recordString(asRecord(read), 'content');
      const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
      const conflict = guardConflict(
        operation.guards,
        'expected_preview',
        currentPreview,
        `greeting:${operation.selector.greeting_type}:identity`,
      );
      if (conflict) return conflict;
      const newContent = replacementString(operation.content);
      return {
        data: {
          dryRun: true,
          resolved_identity: operation.selector.identity,
          resolved_index: recordNumber(asRecord(read), 'index'),
          oldSize: currentContent?.length ?? 0,
          newSize: newContent.length,
        },
        routes: [
          route('read_greeting_by_hash', 'POST', readRoute),
          route('write_greeting_by_hash', 'POST', `/greeting/${greetingType}/by-hash/write`),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentPreview === undefined
            ? undefined
            : buildGuard(
                'expected_preview',
                currentPreview,
                '/expected_preview',
                ['read_greeting_by_hash'],
                '/preview',
              ),
        ]),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'greeting' &&
      operation.selector.index !== undefined
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting write selector',
          'preview_edit greeting writes require greeting_type="alternate" or "group".',
          { operation },
        );
      }
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const greetingRoute = `/greeting/${greetingType}/${operation.selector.index}`;
      const read = await apiRequest('GET', greetingRoute);
      if (isApiError(read)) return read;
      const currentContent =
        typeof (read as Record<string, unknown>).content === 'string'
          ? ((read as Record<string, unknown>).content as string)
          : undefined;
      const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
      const conflict = guardConflict(
        operation.guards,
        'expected_preview',
        currentPreview,
        `greeting:${operation.selector.greeting_type}:${operation.selector.index}`,
      );
      if (conflict) return conflict;
      const newContent = replacementString(operation.content);
      return {
        data: {
          dryRun: true,
          type: operation.selector.greeting_type,
          index: operation.selector.index,
          oldSize: currentContent?.length ?? 0,
          newSize: newContent.length,
        },
        routes: [route('read_greeting', 'GET', greetingRoute), route('write_greeting', 'POST', greetingRoute)],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentPreview === undefined
            ? undefined
            : {
                name: 'expected_preview',
                value: currentPreview,
                payloadPath: '/expected_preview',
                sourceOperations: ['read_greeting'],
                sourceResultPath: '/content',
              },
        ]),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.ids &&
      operation.selector.ids.length > 0
    ) {
      const writes = normalizeBatchEntries(operation, 'item');
      if (isApiError(writes)) return writes;
      const requiredGuards: FacadeV1Guard[] = [];
      const enrichedWrites: Array<Record<string, unknown>> = [];
      const previews: Array<Record<string, unknown>> = [];
      for (const [position, write] of writes.entries()) {
        const id = recordString(write, 'item_id') ?? operation.selector.ids[position];
        const item = asRecord(write.item);
        if (!id || !item) {
          return facadeApiError(
            400,
            'Invalid risup prompt id batch write entry',
            'Each write must provide item_id and item object.',
            { write, position },
            ['list_risup_prompt_items', 'preview_edit'],
          );
        }
        const readRoute = `/risup/prompt-item-by-id/${encodeURIComponent(id)}`;
        const read = await apiRequest('GET', readRoute);
        if (isApiError(read)) return read;
        const readRecord = asRecord(read);
        const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
        const currentPreview = recordString(readRecord, 'preview');
        const expectedType = recordString(write, 'expected_type');
        const expectedPreview = recordString(write, 'expected_preview');
        if (expectedType !== undefined && currentType !== undefined && expectedType !== currentType) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_type',
            'Re-list/read risup prompt items, then run preview_edit again with current expected_type values.',
            { target: `risup-prompt:${id}`, guard: 'expected_type', expected: expectedType, actual: currentType },
            ['list_risup_prompt_items', 'preview_edit'],
          );
        }
        if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_preview',
            'Re-list/read risup prompt items, then run preview_edit again with current expected_preview values.',
            {
              target: `risup-prompt:${id}`,
              guard: 'expected_preview',
              expected: expectedPreview,
              actual: currentPreview,
            },
            ['list_risup_prompt_items', 'preview_edit'],
          );
        }
        enrichedWrites.push({
          ...write,
          item_id: id,
          item,
          expected_type: currentType,
          expected_preview: currentPreview,
        });
        previews.push({
          id,
          resolved_index: recordNumber(readRecord, 'index'),
          currentType,
          currentPreview,
          replacementType: recordString(item, 'type'),
        });
        if (currentType !== undefined)
          requiredGuards.push(
            buildGuard(
              'expected_type',
              currentType,
              `/writes/${position}/expected_type`,
              ['read_risup_prompt_item_by_id'],
              '/type',
            ),
          );
        if (currentPreview !== undefined)
          requiredGuards.push(
            buildGuard(
              'expected_preview',
              currentPreview,
              `/writes/${position}/expected_preview`,
              ['read_risup_prompt_item_by_id'],
              '/preview',
            ),
          );
      }
      rewriteOperationBatchContent(operation, 'writes', enrichedWrites);
      return {
        data: { dryRun: true, operation: 'write_content', count: enrichedWrites.length, writes: previews },
        routes: [route('write_risup_prompt_item_by_id_batch', 'POST', '/risup/prompt-item/batch-write-by-id')],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.id
    ) {
      return previewPromptItemById(operation, operation.selector.id);
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      const writes = normalizeBatchEntries(operation, 'item');
      if (isApiError(writes)) return writes;
      const list = await apiRequest('GET', '/risup/prompt-items');
      if (isApiError(list)) return list;
      const requiredGuards: FacadeV1Guard[] = [];
      const enrichedWrites: Array<Record<string, unknown>> = [];
      const previews: Array<Record<string, unknown>> = [];
      for (const [position, write] of writes.entries()) {
        const idx = recordNumber(write, 'index');
        const item = asRecord(write.item);
        if (idx === undefined || !item) {
          return facadeApiError(
            400,
            'Invalid risup prompt batch write entry',
            'Each risup prompt batch write entry must provide an index and item object.',
            { write, position },
            ['list_risup_prompt_items', 'read_risup_prompt_item_batch', 'preview_edit'],
          );
        }
        const currentRecord = itemByIndex(list, 'items', idx);
        const currentType = recordString(currentRecord, 'type');
        const currentPreview = recordString(currentRecord, 'preview');
        const expectedType = recordString(write, 'expected_type');
        const expectedPreview = recordString(write, 'expected_preview');
        if (expectedType !== undefined && currentType !== undefined && expectedType !== currentType) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_type',
            'Re-list/read risup prompt items, then run preview_edit again with current expected_type values.',
            { target: `risup-prompt:${idx}`, guard: 'expected_type', expected: expectedType, actual: currentType },
            ['list_risup_prompt_items', 'read_risup_prompt_item_batch', 'preview_edit'],
          );
        }
        if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_preview',
            'Re-list/read risup prompt items, then run preview_edit again with current expected_preview values.',
            {
              target: `risup-prompt:${idx}`,
              guard: 'expected_preview',
              expected: expectedPreview,
              actual: currentPreview,
            },
            ['list_risup_prompt_items', 'read_risup_prompt_item_batch', 'preview_edit'],
          );
        }
        enrichedWrites.push({ ...write, item, expected_type: currentType, expected_preview: currentPreview });
        previews.push({ index: idx, currentType, currentPreview, replacementType: recordString(item, 'type') });
        if (currentType !== undefined)
          requiredGuards.push(
            buildGuard(
              'expected_type',
              currentType,
              `/writes/${position}/expected_type`,
              ['list_risup_prompt_items'],
              `/items/${position}/type`,
            ),
          );
        if (currentPreview !== undefined)
          requiredGuards.push(
            buildGuard(
              'expected_preview',
              currentPreview,
              `/writes/${position}/expected_preview`,
              ['list_risup_prompt_items'],
              `/items/${position}/preview`,
            ),
          );
      }
      rewriteOperationBatchContent(operation, 'writes', enrichedWrites);
      return {
        data: { dryRun: true, operation: 'write_content', count: enrichedWrites.length, writes: previews },
        routes: [
          route('list_risup_prompt_items', 'GET', '/risup/prompt-items'),
          route('write_risup_prompt_item_batch', 'POST', '/risup/prompt-item/batch-write'),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.index !== undefined
    ) {
      const promptRoute = `/risup/prompt-item/${operation.selector.index}`;
      const read = await apiRequest('GET', promptRoute);
      if (isApiError(read)) return read;
      const readRecord = asRecord(read);
      const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
      const currentPreview = recordString(readRecord, 'preview');
      const typeConflict = guardConflict(
        operation.guards,
        'expected_type',
        currentType,
        `risup-prompt:${operation.selector.index}`,
      );
      if (typeConflict) return typeConflict;
      const previewConflict = guardConflict(
        operation.guards,
        'expected_preview',
        currentPreview,
        `risup-prompt:${operation.selector.index}`,
      );
      if (previewConflict) return previewConflict;
      const item = asRecord(operation.content);
      if (!item) {
        return facadeApiError(
          400,
          'risup-prompt write_content requires an item object',
          'Set operations[].content to the replacement prompt item object.',
          { operation },
        );
      }
      return {
        data: {
          dryRun: true,
          index: operation.selector.index,
          currentType,
          currentPreview,
          replacementType: recordString(item, 'type'),
        },
        routes: [
          route('read_risup_prompt_item', 'GET', promptRoute),
          route('write_risup_prompt_item', 'POST', promptRoute),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentType === undefined
            ? undefined
            : {
                name: 'expected_type',
                value: currentType,
                payloadPath: '/expected_type',
                sourceOperations: ['read_risup_prompt_item'],
                sourceResultPath: '/type',
              },
          currentPreview === undefined
            ? undefined
            : {
                name: 'expected_preview',
                value: currentPreview,
                payloadPath: '/expected_preview',
                sourceOperations: ['read_risup_prompt_item'],
                sourceResultPath: '/preview',
              },
        ]),
      };
    }

    if (
      operation.op === 'write_content' &&
      ['regex', 'greeting', 'risup-prompt'].includes(operation.selector.family ?? '')
    ) {
      return facadeApiError(
        400,
        'Indexed structured writes require an active target and selector.index',
        'Open the document, select target.kind="active", and provide selector.index plus any stale guard values.',
        { operation },
      );
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'regex' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      return facadeApiError(
        400,
        'Unsupported batch regex delete',
        'Regex batch delete has no promoted facade route yet; use delete_regex per item with current expected_comment guards.',
        { operation },
        ['list_regex', 'read_regex_batch', 'delete_regex'],
      );
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'regex' &&
      operation.selector.identity
    ) {
      const read = await apiRequest('POST', '/regex/by-identity/read', { identity: operation.selector.identity });
      if (isApiError(read)) return read;
      const readRecord = asRecord(read);
      const currentComment = recordString(asRecord(readRecord?.entry), 'comment');
      const conflict = guardConflict(operation.guards, 'expected_comment', currentComment, 'regex:identity');
      if (conflict) return conflict;
      return {
        data: {
          dryRun: true,
          operation: 'delete_item',
          resolved_identity: operation.selector.identity,
          resolved_index: recordNumber(readRecord, 'index'),
          currentComment,
        },
        routes: [
          route('read_regex_by_identity', 'POST', '/regex/by-identity/read'),
          route('delete_regex_by_identity', 'POST', '/regex/by-identity/delete'),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentComment === undefined
            ? undefined
            : buildGuard(
                'expected_comment',
                currentComment,
                '/expected_comment',
                ['read_regex_by_identity'],
                '/entry/comment',
              ),
        ]),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'regex' &&
      operation.selector.index !== undefined
    ) {
      const regexRoute = `/regex/${operation.selector.index}`;
      const read = await apiRequest('GET', regexRoute);
      if (isApiError(read)) return read;
      const indexedRecord = findIndexedRecord(read, operation.selector.index);
      const currentComment = recordString(asRecord(indexedRecord?.entry) ?? indexedRecord, 'comment');
      const conflict = guardConflict(
        operation.guards,
        'expected_comment',
        currentComment,
        `regex:${operation.selector.index}`,
      );
      if (conflict) return conflict;
      return {
        data: {
          dryRun: true,
          operation: 'delete_item',
          index: operation.selector.index,
          currentComment,
        },
        routes: [
          route('read_regex', 'GET', regexRoute),
          route('delete_regex', 'POST', `/regex/${operation.selector.index}/delete`),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentComment === undefined
            ? undefined
            : {
                name: 'expected_comment',
                value: currentComment,
                payloadPath: '/expected_comment',
                sourceOperations: ['read_regex'],
                sourceResultPath: '/entry/comment',
              },
        ]),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'greeting' &&
      operation.selector.identity
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting identity delete selector',
          'preview_edit greeting identity deletes require greeting_type="alternate" or "group".',
          { operation },
        );
      }
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const readRoute = `/greeting/${greetingType}/by-hash/read`;
      const read = await apiRequest('POST', readRoute, { identity: operation.selector.identity });
      if (isApiError(read)) return read;
      const currentContent = recordString(asRecord(read), 'content');
      const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
      const conflict = guardConflict(
        operation.guards,
        'expected_preview',
        currentPreview,
        `greeting:${operation.selector.greeting_type}:identity`,
      );
      if (conflict) return conflict;
      return {
        data: {
          dryRun: true,
          operation: 'delete_item',
          resolved_identity: operation.selector.identity,
          resolved_index: recordNumber(asRecord(read), 'index'),
          currentPreview,
        },
        routes: [
          route('read_greeting_by_hash', 'POST', readRoute),
          route('delete_greeting_by_hash', 'POST', `/greeting/${greetingType}/by-hash/delete`),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentPreview === undefined
            ? undefined
            : buildGuard(
                'expected_preview',
                currentPreview,
                '/expected_preview',
                ['read_greeting_by_hash'],
                '/preview',
              ),
        ]),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'greeting' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting batch delete selector',
          'preview_edit greeting batch deletes require greeting_type="alternate" or "group".',
          { operation },
          ['list_greetings', 'read_greeting_batch', 'preview_edit'],
        );
      }
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const readRoute = `/greeting/${greetingType}/batch`;
      const read = await apiRequest('POST', readRoute, { indices: operation.selector.indices });
      if (isApiError(read)) return read;
      const contentRecord = asRecord(operation.content);
      const expectedPreviews = Array.isArray(contentRecord?.expected_previews)
        ? contentRecord.expected_previews
        : undefined;
      const requiredGuards: FacadeV1Guard[] = [];
      const enrichedExpectedPreviews: string[] = [];
      const previews: Array<Record<string, unknown>> = [];
      for (const [position, idx] of operation.selector.indices.entries()) {
        const currentContent = recordString(itemByIndex(read, 'items', idx), 'content');
        const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
        const expectedPreview =
          expectedPreviews && typeof expectedPreviews[position] === 'string' ? expectedPreviews[position] : undefined;
        if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_preview',
            'Re-list/read greetings, then run preview_edit again with current expected_preview values.',
            {
              target: `greeting:${operation.selector.greeting_type}:${idx}`,
              guard: 'expected_preview',
              expected: expectedPreview,
              actual: currentPreview,
            },
            ['list_greetings', 'read_greeting_batch', 'preview_edit'],
          );
        }
        enrichedExpectedPreviews.push(currentPreview ?? '');
        previews.push({ index: idx, preview: currentPreview, oldSize: currentContent?.length ?? 0 });
        if (currentPreview !== undefined)
          requiredGuards.push(
            buildGuard(
              'expected_previews',
              currentPreview,
              `/expected_previews/${position}`,
              ['read_greeting_batch'],
              `/items/${position}/content`,
            ),
          );
      }
      operation.content = { ...(contentRecord ?? {}), expected_previews: enrichedExpectedPreviews };
      return {
        data: {
          dryRun: true,
          operation: 'delete_item',
          type: operation.selector.greeting_type,
          count: operation.selector.indices.length,
          deletes: previews,
        },
        routes: [
          route('read_greeting_batch', 'POST', readRoute),
          route('batch_delete_greeting', 'POST', `/greeting/${greetingType}/batch-delete`),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'greeting' &&
      operation.selector.index !== undefined
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting delete selector',
          'preview_edit greeting deletes require greeting_type="alternate" or "group".',
          { operation },
        );
      }
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const greetingRoute = `/greeting/${greetingType}/${operation.selector.index}`;
      const read = await apiRequest('GET', greetingRoute);
      if (isApiError(read)) return read;
      const currentContent =
        typeof (read as Record<string, unknown>).content === 'string'
          ? ((read as Record<string, unknown>).content as string)
          : undefined;
      const currentPreview = currentContent === undefined ? undefined : greetingPreview(currentContent);
      const conflict = guardConflict(
        operation.guards,
        'expected_preview',
        currentPreview,
        `greeting:${operation.selector.greeting_type}:${operation.selector.index}`,
      );
      if (conflict) return conflict;
      return {
        data: {
          dryRun: true,
          operation: 'delete_item',
          type: operation.selector.greeting_type,
          index: operation.selector.index,
          oldSize: currentContent?.length ?? 0,
        },
        routes: [
          route('read_greeting', 'GET', greetingRoute),
          route('delete_greeting', 'POST', `/greeting/${greetingType}/${operation.selector.index}/delete`),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentPreview === undefined
            ? undefined
            : {
                name: 'expected_preview',
                value: currentPreview,
                payloadPath: '/expected_preview',
                sourceOperations: ['read_greeting'],
                sourceResultPath: '/content',
              },
        ]),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.ids &&
      operation.selector.ids.length > 0
    ) {
      const contentRecord = asRecord(operation.content);
      const expectedTypes = Array.isArray(contentRecord?.expected_types) ? contentRecord.expected_types : undefined;
      const expectedPreviews = Array.isArray(contentRecord?.expected_previews)
        ? contentRecord.expected_previews
        : undefined;
      const enrichedExpectedTypes: string[] = [];
      const enrichedExpectedPreviews: string[] = [];
      const requiredGuards: FacadeV1Guard[] = [];
      const previews: Array<Record<string, unknown>> = [];
      for (const [position, id] of operation.selector.ids.entries()) {
        const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(id)}`;
        const read = await apiRequest('GET', promptRoute);
        if (isApiError(read)) return read;
        const readRecord = asRecord(read);
        const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
        const currentPreview = recordString(readRecord, 'preview');
        const expectedType = typeof expectedTypes?.[position] === 'string' ? expectedTypes[position] : undefined;
        const expectedPreview =
          typeof expectedPreviews?.[position] === 'string' ? expectedPreviews[position] : undefined;
        if (expectedType !== undefined && currentType !== undefined && expectedType !== currentType) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_type',
            'Re-list/read risup prompt items, then run preview_edit again with current expected_type values.',
            { target: `risup-prompt:${id}`, guard: 'expected_type', expected: expectedType, actual: currentType },
            ['list_risup_prompt_items', 'preview_edit'],
          );
        }
        if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_preview',
            'Re-list/read risup prompt items, then run preview_edit again with current expected_preview values.',
            {
              target: `risup-prompt:${id}`,
              guard: 'expected_preview',
              expected: expectedPreview,
              actual: currentPreview,
            },
            ['list_risup_prompt_items', 'preview_edit'],
          );
        }
        enrichedExpectedTypes.push(currentType ?? '');
        enrichedExpectedPreviews.push(currentPreview ?? '');
        previews.push({ id, resolved_index: recordNumber(readRecord, 'index'), currentType, currentPreview });
        if (currentType !== undefined)
          requiredGuards.push(
            buildGuard(
              'expected_types',
              currentType,
              `/expected_types/${position}`,
              ['read_risup_prompt_item_by_id'],
              '/type',
            ),
          );
        if (currentPreview !== undefined)
          requiredGuards.push(
            buildGuard(
              'expected_previews',
              currentPreview,
              `/expected_previews/${position}`,
              ['read_risup_prompt_item_by_id'],
              '/preview',
            ),
          );
      }
      operation.content = {
        ...(contentRecord ?? {}),
        expected_types: enrichedExpectedTypes,
        expected_previews: enrichedExpectedPreviews,
      };
      return {
        data: { dryRun: true, operation: 'delete_item', count: operation.selector.ids.length, deletes: previews },
        routes: [route('batch_delete_risup_prompt_items_by_id', 'POST', '/risup/prompt-item/batch-delete-by-id')],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.id
    ) {
      return previewPromptItemById(operation, operation.selector.id);
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      const list = await apiRequest('GET', '/risup/prompt-items');
      if (isApiError(list)) return list;
      const contentRecord = asRecord(operation.content);
      const expectedTypes = Array.isArray(contentRecord?.expected_types) ? contentRecord.expected_types : undefined;
      const expectedPreviews = Array.isArray(contentRecord?.expected_previews)
        ? contentRecord.expected_previews
        : undefined;
      const requiredGuards: FacadeV1Guard[] = [];
      const enrichedExpectedTypes: string[] = [];
      const enrichedExpectedPreviews: string[] = [];
      const previews: Array<Record<string, unknown>> = [];
      for (const [position, idx] of operation.selector.indices.entries()) {
        const currentRecord = itemByIndex(list, 'items', idx);
        const currentType = recordString(currentRecord, 'type');
        const currentPreview = recordString(currentRecord, 'preview');
        const expectedType =
          expectedTypes && typeof expectedTypes[position] === 'string' ? expectedTypes[position] : undefined;
        const expectedPreview =
          expectedPreviews && typeof expectedPreviews[position] === 'string' ? expectedPreviews[position] : undefined;
        if (expectedType !== undefined && currentType !== undefined && expectedType !== currentType) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_type',
            'Re-list/read risup prompt items, then run preview_edit again with current expected_type values.',
            { target: `risup-prompt:${idx}`, guard: 'expected_type', expected: expectedType, actual: currentType },
            ['list_risup_prompt_items', 'read_risup_prompt_item_batch', 'preview_edit'],
          );
        }
        if (expectedPreview !== undefined && currentPreview !== undefined && expectedPreview !== currentPreview) {
          return facadeApiError(
            409,
            'Stale guard mismatch for expected_preview',
            'Re-list/read risup prompt items, then run preview_edit again with current expected_preview values.',
            {
              target: `risup-prompt:${idx}`,
              guard: 'expected_preview',
              expected: expectedPreview,
              actual: currentPreview,
            },
            ['list_risup_prompt_items', 'read_risup_prompt_item_batch', 'preview_edit'],
          );
        }
        enrichedExpectedTypes.push(currentType ?? '');
        enrichedExpectedPreviews.push(currentPreview ?? '');
        previews.push({ index: idx, currentType, currentPreview });
        if (currentType !== undefined)
          requiredGuards.push(
            buildGuard(
              'expected_types',
              currentType,
              `/expected_types/${position}`,
              ['list_risup_prompt_items'],
              `/items/${position}/type`,
            ),
          );
        if (currentPreview !== undefined)
          requiredGuards.push(
            buildGuard(
              'expected_previews',
              currentPreview,
              `/expected_previews/${position}`,
              ['list_risup_prompt_items'],
              `/items/${position}/preview`,
            ),
          );
      }
      operation.content = {
        ...(contentRecord ?? {}),
        expected_types: enrichedExpectedTypes,
        expected_previews: enrichedExpectedPreviews,
      };
      return {
        data: { dryRun: true, operation: 'delete_item', count: operation.selector.indices.length, deletes: previews },
        routes: [
          route('list_risup_prompt_items', 'GET', '/risup/prompt-items'),
          route('batch_delete_risup_prompt_items', 'POST', '/risup/prompt-item/batch-delete'),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.index !== undefined
    ) {
      const promptRoute = `/risup/prompt-item/${operation.selector.index}`;
      const read = await apiRequest('GET', promptRoute);
      if (isApiError(read)) return read;
      const readRecord = asRecord(read);
      const currentType = recordString(readRecord, 'type') ?? recordString(asRecord(readRecord?.item), 'type');
      const currentPreview = recordString(readRecord, 'preview');
      const typeConflict = guardConflict(
        operation.guards,
        'expected_type',
        currentType,
        `risup-prompt:${operation.selector.index}`,
      );
      if (typeConflict) return typeConflict;
      const previewConflict = guardConflict(
        operation.guards,
        'expected_preview',
        currentPreview,
        `risup-prompt:${operation.selector.index}`,
      );
      if (previewConflict) return previewConflict;
      return {
        data: {
          dryRun: true,
          operation: 'delete_item',
          index: operation.selector.index,
          currentType,
          currentPreview,
        },
        routes: [
          route('read_risup_prompt_item', 'GET', promptRoute),
          route('delete_risup_prompt_item', 'POST', `/risup/prompt-item/${operation.selector.index}/delete`),
        ],
        touched,
        requiredGuards: mergeGuards(operation.guards, [
          currentType === undefined
            ? undefined
            : {
                name: 'expected_type',
                value: currentType,
                payloadPath: '/expected_type',
                sourceOperations: ['read_risup_prompt_item'],
                sourceResultPath: '/type',
              },
          currentPreview === undefined
            ? undefined
            : {
                name: 'expected_preview',
                value: currentPreview,
                payloadPath: '/expected_preview',
                sourceOperations: ['read_risup_prompt_item'],
                sourceResultPath: '/preview',
              },
        ]),
      };
    }

    if (
      operation.op === 'delete_item' &&
      ['regex', 'greeting', 'risup-prompt'].includes(operation.selector.family ?? '')
    ) {
      return facadeApiError(
        400,
        'Indexed structured deletes require an active target and selector.index',
        'Open the document, select target.kind="active", and provide selector.index plus any stale guard values.',
        { operation },
      );
    }

    if (operation.op === 'replace_text' && operation.selector.field) {
      if (!operation.find) {
        return facadeApiError(400, 'replace_text requires find', 'Provide operations[].find.');
      }
      const fieldRoute =
        target.kind === 'external'
          ? `/external/field/${encodeURIComponent(operation.selector.field)}/replace`
          : `/field/${encodeURIComponent(operation.selector.field)}/replace`;
      const data = await apiRequest('POST', fieldRoute, {
        ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
        find: operation.find,
        replace: typeof operation.replace === 'string' ? operation.replace : '',
        dry_run: true,
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [
              route(target.kind === 'external' ? 'external_replace_in_field' : 'replace_in_field', 'POST', fieldRoute),
            ],
            touched,
            requiredGuards: operation.guards ?? [],
          };
    }

    if (operation.op === 'insert_text' && operation.selector.field) {
      const read = await readFacadeSelector(target, operation.selector);
      if (isApiError(read)) return read;
      if (isReadOnlyFacadeFieldPayload(read.data)) {
        return facadeApiError(
          400,
          `"${operation.selector.field}" is read-only`,
          'This field is deprecated, reserved, or compatibility-only. Use supported current fields instead.',
          { selector: operation.selector },
        );
      }
      const oldContent = recordString(asRecord(read.data), 'content');
      if (oldContent === undefined) {
        return facadeApiError(
          400,
          `"${operation.selector.field}" is not a string field`,
          'Use insert_text only on active or external string fields.',
        );
      }
      const inserted = insertSpecFromOperation(oldContent, operation);
      if (isApiError(inserted)) return inserted;
      const fieldRoute =
        target.kind === 'external'
          ? `/external/field/${encodeURIComponent(operation.selector.field)}/insert`
          : `/field/${encodeURIComponent(operation.selector.field)}/insert`;
      return {
        data: {
          dryRun: true,
          field: operation.selector.field,
          position: inserted.position,
          ...(inserted.anchor ? { anchor: inserted.anchor } : {}),
          oldSize: oldContent.length,
          newSize: inserted.newContent.length,
          insertedSize: inserted.insertedSize,
        },
        routes: [
          ...read.routes,
          route(target.kind === 'external' ? 'external_insert_in_field' : 'insert_in_field', 'POST', fieldRoute),
        ],
        touched,
        requiredGuards: operation.guards ?? [],
      };
    }

    if (operation.op === 'write_content' && operation.selector.field) {
      const read = await readFacadeSelector(target, operation.selector);
      if (isApiError(read)) return read;
      if (isReadOnlyFacadeFieldPayload(read.data)) {
        return facadeApiError(
          400,
          `"${operation.selector.field}" is read-only`,
          'This field is deprecated, reserved, or compatibility-only. Use supported current fields or structured tools instead.',
          { selector: operation.selector },
        );
      }
      const oldContent = (read.data as Record<string, unknown>).content;
      return {
        data: {
          dryRun: true,
          field: operation.selector.field,
          oldSize: typeof oldContent === 'string' ? oldContent.length : JSON.stringify(oldContent).length,
          newSize:
            typeof operation.content === 'string' ? operation.content.length : JSON.stringify(operation.content).length,
        },
        routes: [
          ...read.routes,
          route(
            target.kind === 'external' ? 'external_write_field' : 'write_field',
            'POST',
            target.kind === 'external'
              ? `/external/field/${encodeURIComponent(operation.selector.field)}`
              : `/field/${encodeURIComponent(operation.selector.field)}`,
          ),
        ],
        touched,
        requiredGuards: operation.guards ?? [],
      };
    }

    if (operation.op === 'replace_text' && operation.selector.family === 'surface' && operation.selector.path) {
      if (!operation.find) {
        return facadeApiError(400, 'replace_text requires find', 'Provide operations[].find.');
      }
      if (target.kind === 'active') {
        const routePath = '/surface/replace';
        const data = await apiRequest('POST', routePath, {
          path: operation.selector.path,
          find: operation.find,
          replace: typeof operation.replace === 'string' ? operation.replace : '',
          regex: operation.regex,
          flags: operation.flags,
          dry_run: true,
          expected_hash: guardValue(operation.guards, 'expected_hash'),
        });
        const beforeHash = recordString(asRecord(data), 'before_hash');
        const derivedHashGuard =
          beforeHash === undefined
            ? undefined
            : buildGuard('expected_hash', beforeHash, '/expected_hash', ['read_surface'], '/hash');
        return isApiError(data)
          ? data
          : {
              data: { ...(asRecord(data) ?? {}), operation: 'replace_text' },
              routes: [route('replace_in_surface', 'POST', routePath)],
              touched,
              requiredGuards: mergeGuards(operation.guards, [derivedHashGuard]),
            };
      }
      if (target.kind === 'external') {
        const read = await readExternalSurfaceValue(target.file_path, operation.selector.path);
        if (isApiError(read)) return read;
        const replacement = computeSurfaceReplacement(read.value, operation);
        if (isApiError(replacement)) return replacement;
        if (replacement.matchCount === 0) {
          return facadeApiError(
            404,
            'No matching text in external surface',
            'Refresh the surface content or adjust find/regex/flags before retrying.',
            { file_path: target.file_path, path: operation.selector.path },
            ['read_content', 'preview_edit'],
          );
        }
        const routePath = '/external/surface/patch';
        const patchOperations = [{ op: 'replace', path: operation.selector.path, value: replacement.nextValue }];
        const data = await apiRequest('POST', routePath, {
          file_path: target.file_path,
          operations: patchOperations,
          dry_run: true,
          expected_hash: guardValue(operation.guards, 'expected_hash'),
        });
        const beforeHash = recordString(asRecord(data), 'before_hash');
        const derivedHashGuard =
          beforeHash === undefined
            ? undefined
            : buildGuard('expected_hash', beforeHash, '/expected_hash', ['external_read_surface'], '/hash');
        return isApiError(data)
          ? data
          : {
              data: {
                ...(asRecord(data) ?? {}),
                operation: 'replace_text',
                matchCount: replacement.matchCount,
                path: operation.selector.path,
              },
              routes: [...read.routes, route('external_patch_surface', 'POST', routePath)],
              touched: [`external:${target.file_path}:surface:${operation.selector.path}`],
              requiredGuards: mergeGuards(operation.guards, [derivedHashGuard]),
            };
      }
      return facadeApiError(
        400,
        'Surface replace_text requires active or external target',
        'Use target.kind="active" or target.kind="external".',
        { target, operation },
      );
    }

    if (operation.op === 'patch_surface') {
      const operations = Array.isArray(operation.content) ? operation.content : undefined;
      if (!operations) {
        return facadeApiError(
          400,
          'patch_surface requires content as a JSON Patch array',
          'Set operations[].content to [{ "op": "replace", "path": "/name", "value": "..." }].',
        );
      }
      const routePath = target.kind === 'external' ? '/external/surface/patch' : '/surface/patch';
      const data = await apiRequest('POST', routePath, {
        ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
        operations,
        dry_run: true,
        expected_hash: guardValue(operation.guards, 'expected_hash'),
      });
      const beforeHash = recordString(asRecord(data), 'before_hash');
      const derivedHashGuard =
        beforeHash === undefined
          ? undefined
          : buildGuard(
              'expected_hash',
              beforeHash,
              '/expected_hash',
              [target.kind === 'external' ? 'external_read_surface' : 'read_surface'],
              '/hash',
            );
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route(target.kind === 'external' ? 'external_patch_surface' : 'patch_surface', 'POST', routePath)],
            touched:
              target.kind === 'external'
                ? [`external:${target.file_path}:surface:${operation.selector.path ?? '/'}`]
                : touched,
            requiredGuards: mergeGuards(operation.guards, [derivedHashGuard]),
          };
    }

    return facadeApiError(
      400,
      `Unsupported preview operation: ${operation.op}`,
      'preview_edit supports active field/lorebook replace_block, active lorebook replace_all_text, active/external field replace_text/insert_text/write_content, active/external surface replace_text/patch_surface, active indexed regex/greeting/risup-prompt write_content/delete_item, and external risup-prompt write/delete.',
      { operation },
    );
  }

  async function applyFacadeOperation(
    target: FacadeV1Target,
    operation: FacadeV1EditOperation,
    guardValues?: FacadeV1Guard[],
  ): Promise<{ data: unknown; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    const touched = [selectorTarget(operation.selector)];
    const guards = guardValues && guardValues.length > 0 ? guardValues : operation.guards;
    if (operation.op === 'replace_block') {
      return applyReplaceBlock(target, operation, guards);
    }
    if (operation.op === 'replace_all_text') {
      return applyReplaceAllText(target, operation, guards);
    }
    if (
      target.kind === 'active' &&
      isScriptStyleFamily(operation.selector.family) &&
      (operation.op === 'write_content' ||
        operation.op === 'replace_text' ||
        operation.op === 'insert_text' ||
        operation.op === 'delete_item')
    ) {
      return applyActiveScriptStyleMutation(operation, guards);
    }
    if (
      target.kind === 'external' &&
      isScriptStyleFamily(operation.selector.family) &&
      (operation.op === 'write_content' ||
        operation.op === 'replace_text' ||
        operation.op === 'insert_text' ||
        operation.op === 'delete_item')
    ) {
      const plan = await buildExternalScriptStylePatchPlan(target, operation, guards);
      if (isApiError(plan)) return plan;
      const routePath = '/external/surface/patch';
      const data = await apiRequest('POST', routePath, {
        file_path: target.file_path,
        operations: plan.operations,
        expected_hash: guardValue(guards, 'expected_hash'),
      });
      return isApiError(data)
        ? data
        : {
            data: { ...(asRecord(data) ?? {}), operation: operation.op, structured_family: operation.selector.family },
            routes: [...plan.routes, route('external_patch_surface', 'POST', routePath)],
            touched: plan.touched,
          };
    }
    if (
      target.kind === 'external' &&
      operation.selector.family === 'risup-prompt' &&
      (operation.op === 'write_content' || operation.op === 'delete_item')
    ) {
      const originalGuards = operation.guards;
      operation.guards = guards;
      const prepared = await prepareExternalRisupPromptMutation(target, operation);
      operation.guards = originalGuards;
      if (isApiError(prepared)) return prepared;
      const routePath = '/external/field/promptTemplate';
      const data = await apiRequest('POST', routePath, {
        file_path: target.file_path,
        content: prepared.newPromptTemplate,
      });
      return isApiError(data)
        ? data
        : {
            data: { ...(asRecord(data) ?? {}), operation: operation.op, promptSize: prepared.newPromptTemplate.length },
            routes: prepared.routes,
            touched: prepared.touched,
          };
    }
    if (
      target.kind === 'external' &&
      ['lorebook', 'regex', 'greeting'].includes(operation.selector.family ?? '') &&
      (operation.op === 'write_content' || operation.op === 'delete_item' || operation.op === 'replace_text')
    ) {
      return applyExternalStructuredMutation(target, operation, guards);
    }
    if (
      target.kind === 'active' &&
      operation.op === 'replace_text' &&
      operation.selector.family === 'lorebook' &&
      operation.selector.index !== undefined
    ) {
      const lorebookRoute = `/lorebook/${operation.selector.index}/replace`;
      const data = await apiRequest('POST', lorebookRoute, {
        find: operation.find,
        replace: typeof operation.replace === 'string' ? operation.replace : '',
        regex: operation.regex,
        flags: operation.flags,
        field: lorebookReplaceField(operation),
        expected_comment: lorebookExpectedComment(guards),
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('replace_in_lorebook', 'POST', lorebookRoute)],
            touched,
          };
    }

    if (
      operation.op === 'replace_text' &&
      operation.selector.family === 'lorebook' &&
      operation.selector.index !== undefined
    ) {
      return facadeApiError(
        400,
        'apply_edit lorebook replacement supports active targets only',
        'Use target.kind="active" for lorebook replace_text, or open the external/reference document first.',
        { operation },
      );
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'lorebook' &&
      operation.selector.id
    ) {
      const data = asRecord(operation.content);
      if (!data)
        return facadeApiError(
          400,
          'lorebook write_content requires an object',
          'Set operations[].content to the partial lorebook entry data.',
          { operation },
        );
      const routePath = `/lorebook/by-id/${encodeURIComponent(operation.selector.id)}`;
      const applied = await apiRequest('POST', routePath, {
        data,
        expected_comment: stringGuardValue(guards, 'expected_comment'),
      });
      return isApiError(applied)
        ? applied
        : { data: applied, routes: [route('write_lorebook_by_id', 'POST', routePath)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'lorebook' &&
      operation.selector.id
    ) {
      const routePath = `/lorebook/by-id/${encodeURIComponent(operation.selector.id)}/delete`;
      const data = await apiRequest('POST', routePath, {
        expected_comment: stringGuardValue(guards, 'expected_comment'),
      });
      return isApiError(data) ? data : { data, routes: [route('delete_lorebook_by_id', 'POST', routePath)], touched };
    }

    if (operation.selector.family === 'lorebook') {
      return facadeApiError(
        400,
        'Unsupported apply lorebook operation',
        'apply_edit supports active lorebook replace_text only when selector.index is provided; write_content and broad lorebook edits remain unsupported.',
        { operation },
      );
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'regex' &&
      operation.selector.identity
    ) {
      const data = asRecord(operation.content);
      if (!data)
        return facadeApiError(
          400,
          'regex write_content requires an object',
          'Set operations[].content to the partial regex entry data.',
          { operation },
        );
      const applied = await apiRequest('POST', '/regex/by-identity/write', {
        identity: operation.selector.identity,
        data,
        expected_comment: stringGuardValue(guards, 'expected_comment'),
      });
      return isApiError(applied)
        ? applied
        : { data: applied, routes: [route('write_regex_by_identity', 'POST', '/regex/by-identity/write')], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'regex' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      const entries = normalizeBatchEntries(operation, 'data');
      if (isApiError(entries)) return entries;
      const payloadEntries = entries.map((entry) => ({
        index: recordNumber(entry, 'index'),
        data: asRecord(entry.data) ?? {},
        expected_comment: recordString(entry, 'expected_comment'),
      }));
      const data = await apiRequest('POST', '/regex/batch-write', { entries: payloadEntries });
      return isApiError(data)
        ? data
        : { data, routes: [route('write_regex_batch', 'POST', '/regex/batch-write')], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'regex' &&
      operation.selector.index !== undefined
    ) {
      const data = asRecord(operation.content);
      if (!data) {
        return facadeApiError(
          400,
          'regex write_content requires an object',
          'Set operations[].content to the partial regex entry data to write.',
          { operation },
        );
      }
      const regexRoute = `/regex/${operation.selector.index}`;
      const applied = await apiRequest('POST', regexRoute, {
        ...data,
        expected_comment: stringGuardValue(guards, 'expected_comment'),
      });
      return isApiError(applied)
        ? applied
        : { data: applied, routes: [route('write_regex', 'POST', regexRoute)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'greeting' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting batch write selector',
          'preview_edit greeting batch writes require greeting_type="alternate" or "group".',
          { operation },
          ['list_greetings', 'read_greeting_batch', 'preview_edit'],
        );
      }
      const writes = normalizeBatchEntries(operation, 'content');
      if (isApiError(writes)) return writes;
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const payloadWrites = writes.map((write) => ({
        index: recordNumber(write, 'index'),
        content: replacementString(write.content),
        expected_preview: recordString(write, 'expected_preview'),
      }));
      const routePath = `/greeting/${greetingType}/batch-write`;
      const data = await apiRequest('POST', routePath, { writes: payloadWrites });
      return isApiError(data) ? data : { data, routes: [route('batch_write_greeting', 'POST', routePath)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'greeting' &&
      operation.selector.index !== undefined
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting write selector',
          'apply_edit greeting writes require greeting_type="alternate" or "group".',
          { operation },
        );
      }
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const greetingRoute = `/greeting/${greetingType}/${operation.selector.index}`;
      const data = await apiRequest('POST', greetingRoute, {
        content: replacementString(operation.content),
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(data) ? data : { data, routes: [route('write_greeting', 'POST', greetingRoute)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'greeting' &&
      operation.selector.identity
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting write selector',
          'apply_edit greeting identity writes require greeting_type="alternate" or "group".',
          { operation },
        );
      }
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const routePath = `/greeting/${greetingType}/by-hash/write`;
      const data = await apiRequest('POST', routePath, {
        identity: operation.selector.identity,
        content: replacementString(operation.content),
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(data) ? data : { data, routes: [route('write_greeting_by_hash', 'POST', routePath)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.ids &&
      operation.selector.ids.length > 0
    ) {
      const writes = normalizeBatchEntries(operation, 'item');
      if (isApiError(writes)) return writes;
      const payloadWrites = writes.map((write, position) => ({
        item_id: recordString(write, 'item_id') ?? operation.selector.ids?.[position],
        item: asRecord(write.item) ?? {},
        expected_type: recordString(write, 'expected_type'),
        expected_preview: recordString(write, 'expected_preview'),
      }));
      const data = await apiRequest('POST', '/risup/prompt-item/batch-write-by-id', { writes: payloadWrites });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('write_risup_prompt_item_by_id_batch', 'POST', '/risup/prompt-item/batch-write-by-id')],
            touched,
          };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.id
    ) {
      const item = asRecord(operation.content);
      if (!item) {
        return facadeApiError(
          400,
          'risup-prompt write_content requires an item object',
          'Set operations[].content to the replacement prompt item object.',
          { operation },
        );
      }
      const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(operation.selector.id)}`;
      const data = await apiRequest('POST', promptRoute, {
        item,
        expected_type: stringGuardValue(guards, 'expected_type'),
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(data)
        ? data
        : { data, routes: [route('write_risup_prompt_item_by_id', 'POST', promptRoute)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      const writes = normalizeBatchEntries(operation, 'item');
      if (isApiError(writes)) return writes;
      const payloadWrites = writes.map((write) => ({
        index: recordNumber(write, 'index'),
        item: asRecord(write.item) ?? {},
        expected_type: recordString(write, 'expected_type'),
        expected_preview: recordString(write, 'expected_preview'),
      }));
      const data = await apiRequest('POST', '/risup/prompt-item/batch-write', { writes: payloadWrites });
      return isApiError(data)
        ? data
        : { data, routes: [route('write_risup_prompt_item_batch', 'POST', '/risup/prompt-item/batch-write')], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'write_content' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.index !== undefined
    ) {
      const item = asRecord(operation.content);
      if (!item) {
        return facadeApiError(
          400,
          'risup-prompt write_content requires an item object',
          'Set operations[].content to the replacement prompt item object.',
          { operation },
        );
      }
      const promptRoute = `/risup/prompt-item/${operation.selector.index}`;
      const data = await apiRequest('POST', promptRoute, {
        item,
        expected_type: stringGuardValue(guards, 'expected_type'),
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(data)
        ? data
        : { data, routes: [route('write_risup_prompt_item', 'POST', promptRoute)], touched };
    }

    if (
      operation.op === 'write_content' &&
      ['regex', 'greeting', 'risup-prompt'].includes(operation.selector.family ?? '')
    ) {
      return facadeApiError(
        400,
        'Indexed structured writes require an active target and selector.index',
        'Open the document, select target.kind="active", and provide selector.index plus any stale guard values.',
        { operation },
      );
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'regex' &&
      operation.selector.index !== undefined
    ) {
      const regexRoute = `/regex/${operation.selector.index}/delete`;
      const data = await apiRequest('POST', regexRoute, {
        expected_comment: stringGuardValue(guards, 'expected_comment'),
      });
      return isApiError(data) ? data : { data, routes: [route('delete_regex', 'POST', regexRoute)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'regex' &&
      operation.selector.identity
    ) {
      const data = await apiRequest('POST', '/regex/by-identity/delete', {
        identity: operation.selector.identity,
        expected_comment: stringGuardValue(guards, 'expected_comment'),
      });
      return isApiError(data)
        ? data
        : { data, routes: [route('delete_regex_by_identity', 'POST', '/regex/by-identity/delete')], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'greeting' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting batch delete selector',
          'preview_edit greeting batch deletes require greeting_type="alternate" or "group".',
          { operation },
          ['list_greetings', 'read_greeting_batch', 'preview_edit'],
        );
      }
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const contentRecord = asRecord(operation.content);
      const routePath = `/greeting/${greetingType}/batch-delete`;
      const data = await apiRequest('POST', routePath, {
        indices: operation.selector.indices,
        expected_previews: contentRecord?.expected_previews,
      });
      return isApiError(data) ? data : { data, routes: [route('batch_delete_greeting', 'POST', routePath)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'greeting' &&
      operation.selector.index !== undefined
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting delete selector',
          'apply_edit greeting deletes require greeting_type="alternate" or "group".',
          { operation },
        );
      }
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const greetingRoute = `/greeting/${greetingType}/${operation.selector.index}/delete`;
      const data = await apiRequest('POST', greetingRoute, {
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(data) ? data : { data, routes: [route('delete_greeting', 'POST', greetingRoute)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'greeting' &&
      operation.selector.identity
    ) {
      if (!operation.selector.greeting_type) {
        return facadeApiError(
          400,
          'Unsupported greeting delete selector',
          'apply_edit greeting identity deletes require greeting_type="alternate" or "group".',
          { operation },
        );
      }
      const greetingType = encodeURIComponent(operation.selector.greeting_type);
      const routePath = `/greeting/${greetingType}/by-hash/delete`;
      const data = await apiRequest('POST', routePath, {
        identity: operation.selector.identity,
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(data) ? data : { data, routes: [route('delete_greeting_by_hash', 'POST', routePath)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.ids &&
      operation.selector.ids.length > 0
    ) {
      const contentRecord = asRecord(operation.content);
      const data = await apiRequest('POST', '/risup/prompt-item/batch-delete-by-id', {
        item_ids: operation.selector.ids,
        expected_types: contentRecord?.expected_types,
        expected_previews: contentRecord?.expected_previews,
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('batch_delete_risup_prompt_items_by_id', 'POST', '/risup/prompt-item/batch-delete-by-id')],
            touched,
          };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.id
    ) {
      const promptRoute = `/risup/prompt-item-by-id/${encodeURIComponent(operation.selector.id)}/delete`;
      const data = await apiRequest('POST', promptRoute, {
        expected_type: stringGuardValue(guards, 'expected_type'),
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(data)
        ? data
        : { data, routes: [route('delete_risup_prompt_item_by_id', 'POST', promptRoute)], touched };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.indices &&
      operation.selector.indices.length > 0
    ) {
      const contentRecord = asRecord(operation.content);
      const data = await apiRequest('POST', '/risup/prompt-item/batch-delete', {
        indices: operation.selector.indices,
        expected_types: contentRecord?.expected_types,
        expected_previews: contentRecord?.expected_previews,
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route('batch_delete_risup_prompt_items', 'POST', '/risup/prompt-item/batch-delete')],
            touched,
          };
    }

    if (
      target.kind === 'active' &&
      operation.op === 'delete_item' &&
      operation.selector.family === 'risup-prompt' &&
      operation.selector.index !== undefined
    ) {
      const promptRoute = `/risup/prompt-item/${operation.selector.index}/delete`;
      const data = await apiRequest('POST', promptRoute, {
        expected_type: stringGuardValue(guards, 'expected_type'),
        expected_preview: stringGuardValue(guards, 'expected_preview'),
      });
      return isApiError(data)
        ? data
        : { data, routes: [route('delete_risup_prompt_item', 'POST', promptRoute)], touched };
    }

    if (
      operation.op === 'delete_item' &&
      ['regex', 'greeting', 'risup-prompt'].includes(operation.selector.family ?? '')
    ) {
      return facadeApiError(
        400,
        'Indexed structured deletes require an active target and selector.index',
        'Open the document, select target.kind="active", and provide selector.index plus any stale guard values.',
        { operation },
      );
    }

    if (operation.op === 'replace_text' && operation.selector.field) {
      const fieldRoute =
        target.kind === 'external'
          ? `/external/field/${encodeURIComponent(operation.selector.field)}/replace`
          : `/field/${encodeURIComponent(operation.selector.field)}/replace`;
      const data = await apiRequest('POST', fieldRoute, {
        ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
        find: operation.find,
        replace: typeof operation.replace === 'string' ? operation.replace : '',
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [
              route(target.kind === 'external' ? 'external_replace_in_field' : 'replace_in_field', 'POST', fieldRoute),
            ],
            touched,
          };
    }
    if (operation.op === 'insert_text' && operation.selector.field) {
      const insertContent = contentStringFromOperation(operation, 'insert_text');
      if (isApiError(insertContent)) return insertContent;
      const fieldRoute =
        target.kind === 'external'
          ? `/external/field/${encodeURIComponent(operation.selector.field)}/insert`
          : `/field/${encodeURIComponent(operation.selector.field)}/insert`;
      const data = await apiRequest('POST', fieldRoute, {
        ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
        content: insertContent,
        position: operation.position ?? recordString(asRecord(operation.content), 'position'),
        anchor: operation.anchor ?? recordString(asRecord(operation.content), 'anchor'),
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [
              route(target.kind === 'external' ? 'external_insert_in_field' : 'insert_in_field', 'POST', fieldRoute),
            ],
            touched,
          };
    }
    if (operation.op === 'write_content' && operation.selector.field) {
      const fieldRoute =
        target.kind === 'external'
          ? `/external/field/${encodeURIComponent(operation.selector.field)}`
          : `/field/${encodeURIComponent(operation.selector.field)}`;
      const data = await apiRequest('POST', fieldRoute, {
        ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
        content: operation.content,
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route(target.kind === 'external' ? 'external_write_field' : 'write_field', 'POST', fieldRoute)],
            touched,
          };
    }
    if (operation.op === 'replace_text' && operation.selector.family === 'surface' && operation.selector.path) {
      if (target.kind === 'active') {
        const routePath = '/surface/replace';
        const data = await apiRequest('POST', routePath, {
          path: operation.selector.path,
          find: operation.find,
          replace: typeof operation.replace === 'string' ? operation.replace : '',
          regex: operation.regex,
          flags: operation.flags,
          expected_hash: guardValue(guards, 'expected_hash'),
        });
        return isApiError(data)
          ? data
          : {
              data: { ...(asRecord(data) ?? {}), operation: 'replace_text' },
              routes: [route('replace_in_surface', 'POST', routePath)],
              touched,
            };
      }
      if (target.kind === 'external') {
        const read = await readExternalSurfaceValue(target.file_path, operation.selector.path);
        if (isApiError(read)) return read;
        const replacement = computeSurfaceReplacement(read.value, operation);
        if (isApiError(replacement)) return replacement;
        if (replacement.matchCount === 0) {
          return facadeApiError(404, 'No matching text in external surface', 'Refresh the surface and retry.');
        }
        const routePath = '/external/surface/patch';
        const data = await apiRequest('POST', routePath, {
          file_path: target.file_path,
          operations: [{ op: 'replace', path: operation.selector.path, value: replacement.nextValue }],
          expected_hash: guardValue(guards, 'expected_hash'),
        });
        return isApiError(data)
          ? data
          : {
              data: {
                ...(asRecord(data) ?? {}),
                operation: 'replace_text',
                matchCount: replacement.matchCount,
                path: operation.selector.path,
              },
              routes: [...read.routes, route('external_patch_surface', 'POST', routePath)],
              touched: [`external:${target.file_path}:surface:${operation.selector.path}`],
            };
      }
      return facadeApiError(
        400,
        'Surface replace_text requires active or external target',
        'Use target.kind="active" or target.kind="external".',
        { target, operation },
      );
    }
    if (operation.op === 'patch_surface') {
      const operations = Array.isArray(operation.content) ? operation.content : undefined;
      const routePath = target.kind === 'external' ? '/external/surface/patch' : '/surface/patch';
      const data = await apiRequest('POST', routePath, {
        ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
        operations,
        expected_hash: guardValue(guards, 'expected_hash'),
      });
      return isApiError(data)
        ? data
        : {
            data,
            routes: [route(target.kind === 'external' ? 'external_patch_surface' : 'patch_surface', 'POST', routePath)],
            touched:
              target.kind === 'external'
                ? [`external:${target.file_path}:surface:${operation.selector.path ?? '/'}`]
                : touched,
          };
    }
    return facadeApiError(
      400,
      `Unsupported apply operation: ${operation.op}`,
      'Re-run preview_edit with supported facade operations.',
    );
  }

  return {
    readActiveLorebookCollection,
    previewFacadeOperation,
    applyFacadeOperation,
  };
}

export type FacadeEditEngine = ReturnType<typeof createFacadeEditEngine>;
