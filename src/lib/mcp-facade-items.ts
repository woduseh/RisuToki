import * as crypto from 'crypto';

import { combineCssSections, combineLuaSections, parseCssSections, parseLuaSections } from './section-parser';
import {
  asRecord,
  buildGuard,
  facadeApiError,
  guardConflict,
  guardValue,
  isApiError,
  mergeGuards,
  normalizeBatchEntries,
  recordNumber,
  recordString,
  route,
  selectorTarget,
  type ApiErrorResult,
  type FacadeRoute,
} from './mcp-facade-runtime';
import type {
  FacadeApiRequest,
  FacadeScriptStyleEngine,
  ScriptStyleFamily,
  TextSection,
} from './mcp-facade-script-style';
import type {
  FacadeV1ContentSelector,
  FacadeV1EditOperation,
  FacadeV1Guard,
  FacadeV1Target,
  ManageItemsFamily,
  ManageItemsOperation,
} from './mcp-request-schemas';
import {
  collectFormatingOrderWarnings,
  duplicatePromptItem,
  parseFormatingOrder,
  parsePromptTemplate,
  parsePromptTemplateFromText,
  serializePromptTemplate,
  serializePromptTemplateSubsetToText,
  type PromptItemModel,
  type PromptTemplateModel,
} from './risup-prompt-model';

type FacadeItemsScriptStyleDeps = Pick<
  FacadeScriptStyleEngine,
  | 'EXTERNAL_LOREBOOK_ALLOWED_FIELDS'
  | 'EXTERNAL_REGEX_ALLOWED_FIELDS'
  | 'EXTERNAL_TRIGGER_ALLOWED_FIELDS'
  | 'externalGreetingSummary'
  | 'externalLorebookStableId'
  | 'externalLorebookSummary'
  | 'externalRegexSummary'
  | 'hashStableValue'
  | 'isScriptStyleFamily'
  | 'jsonPointerSegment'
  | 'normalizeLFString'
  | 'pickAllowedRecordFields'
  | 'readExternalRecordArraySurface'
  | 'readExternalRisupPromptModel'
  | 'readExternalStringArraySurface'
  | 'readExternalTextSurface'
  | 'risupPromptItemPreview'
  | 'risupPromptItemSummary'
  | 'sectionSummary'
  | 'triggerSummary'
>;

export function createFacadeItemsEngine(apiRequest: FacadeApiRequest, scriptStyle: FacadeItemsScriptStyleDeps) {
  const {
    EXTERNAL_LOREBOOK_ALLOWED_FIELDS,
    EXTERNAL_REGEX_ALLOWED_FIELDS,
    EXTERNAL_TRIGGER_ALLOWED_FIELDS,
    externalGreetingSummary,
    externalLorebookStableId,
    externalLorebookSummary,
    externalRegexSummary,
    hashStableValue,
    isScriptStyleFamily,
    jsonPointerSegment,
    normalizeLFString,
    pickAllowedRecordFields,
    readExternalRecordArraySurface,
    readExternalRisupPromptModel,
    readExternalStringArraySurface,
    readExternalTextSurface,
    risupPromptItemPreview,
    risupPromptItemSummary,
    sectionSummary,
    triggerSummary,
  } = scriptStyle;

  function resolveRisupPromptIdIndex(
    model: ReturnType<typeof parsePromptTemplate>,
    id: string,
    action: string,
  ): number | ApiErrorResult {
    const matches = model.items.map((item, index) => ({ item, index })).filter(({ item }) => item.id === id);
    if (matches.length === 0) {
      return facadeApiError(404, `Prompt item id not found: ${id}`, 'Refresh prompt item summaries and retry.', {
        action,
        id,
      });
    }
    if (matches.length > 1) {
      return facadeApiError(
        409,
        `Prompt item id is not unique: ${id}`,
        'Use an index selector or normalize duplicate prompt item ids before retrying.',
        { action, id, matches: matches.map((match) => match.index) },
      );
    }
    return matches[0].index;
  }

  function resolveRisupPromptSelectorIndices(
    model: ReturnType<typeof parsePromptTemplate>,
    selector: FacadeV1ContentSelector,
    action: string,
  ): number[] | ApiErrorResult {
    if (selector.id) {
      const index = resolveRisupPromptIdIndex(model, selector.id, action);
      return typeof index === 'number' ? [index] : index;
    }
    if (selector.ids) {
      const indices: number[] = [];
      for (const id of selector.ids) {
        const index = resolveRisupPromptIdIndex(model, id, action);
        if (typeof index !== 'number') return index;
        indices.push(index);
      }
      return indices;
    }
    const indices = selector.index !== undefined ? [selector.index] : selector.indices;
    if (!indices) return model.items.map((_, index) => index);
    const invalid = indices.find((index) => index < 0 || index >= model.items.length);
    if (invalid !== undefined) {
      return facadeApiError(
        400,
        `Prompt item index out of range: ${invalid}`,
        'Refresh prompt item summaries and retry.',
        {
          action,
          index: invalid,
          count: model.items.length,
        },
      );
    }
    return indices;
  }

  function hasExplicitPromptItemIdLocal(item: unknown): boolean {
    return !!item && typeof item === 'object' && !Array.isArray(item) && typeof asRecord(item)?.id === 'string';
  }

  function validateReplacementPromptItem(content: unknown, preserveId?: string): PromptItemModel | ApiErrorResult {
    const testModel = parsePromptTemplate(JSON.stringify([content]));
    if (testModel.state === 'invalid' || testModel.items.length === 0) {
      return facadeApiError(
        400,
        `Invalid risup prompt item: ${testModel.parseError ?? 'Invalid item structure.'}`,
        'Set operations[].content to one supported prompt item object.',
        { parseError: testModel.parseError },
      );
    }
    const item = testModel.items[0];
    if (!item.supported) {
      return facadeApiError(
        400,
        `Unsupported risup prompt item type: ${item.type ?? 'unknown'}`,
        'Facade risup-prompt item writes require supported item types. Use advanced raw promptTemplate routes for unsupported shapes.',
      );
    }
    if (preserveId && !hasExplicitPromptItemIdLocal(content)) item.id = preserveId;
    return item;
  }

  function stringArrayFromRecord(record: Record<string, unknown> | undefined, key: string): string[] | undefined {
    const value = record?.[key];
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : undefined;
  }

  function checkRisupPromptIdentity(
    operation: FacadeV1EditOperation,
    item: PromptItemModel,
    label: string,
  ): ApiErrorResult | undefined {
    const currentType = item.type ?? undefined;
    const currentPreview = risupPromptItemPreview(item);
    const typeConflict = guardConflict(operation.guards, 'expected_type', currentType, label);
    if (typeConflict) return typeConflict;
    const previewConflict = guardConflict(operation.guards, 'expected_preview', currentPreview, label);
    if (previewConflict) return previewConflict;
    return undefined;
  }

  function risupPromptSingleGuards(item: PromptItemModel): FacadeV1Guard[] {
    const guards: FacadeV1Guard[] = [];
    if (item.type !== null && item.type !== undefined) {
      guards.push(buildGuard('expected_type', item.type, '/expected_type', ['read_content'], '/item/type'));
    }
    guards.push(
      buildGuard('expected_preview', risupPromptItemPreview(item), '/expected_preview', ['read_content'], '/preview'),
    );
    return guards;
  }

  function risupPromptBatchGuards(items: PromptItemModel[]): FacadeV1Guard[] {
    return [
      {
        name: 'expected_types',
        value: items.map((item) => item.type ?? ''),
        payloadPath: '/expected_types/*',
        sourceOperations: ['read_content'],
        sourceResultPath: '/entries/*/type',
      },
      {
        name: 'expected_previews',
        value: items.map((item) => risupPromptItemPreview(item)),
        payloadPath: '/expected_previews/*',
        sourceOperations: ['read_content'],
        sourceResultPath: '/entries/*/preview',
      },
    ];
  }

  function checkRisupPromptBatchIdentity(
    item: PromptItemModel,
    position: number,
    expectedTypes: string[] | undefined,
    expectedPreviews: string[] | undefined,
    label: string,
  ): ApiErrorResult | undefined {
    const currentType = item.type ?? '';
    const currentPreview = risupPromptItemPreview(item);
    const expectedType = expectedTypes?.[position];
    const expectedPreview = expectedPreviews?.[position];
    if (expectedType !== undefined && expectedType !== currentType) {
      return facadeApiError(
        409,
        'Stale guard mismatch for expected_types',
        'Refresh prompt item summaries, then run preview_edit again with current expected_types values.',
        { target: label, guard: 'expected_types', expected: expectedType, actual: currentType, position },
        ['read_content', 'preview_edit'],
      );
    }
    if (expectedPreview !== undefined && expectedPreview !== currentPreview) {
      return facadeApiError(
        409,
        'Stale guard mismatch for expected_previews',
        'Refresh prompt item summaries, then run preview_edit again with current expected_previews values.',
        { target: label, guard: 'expected_previews', expected: expectedPreview, actual: currentPreview, position },
        ['read_content', 'preview_edit'],
      );
    }
    return undefined;
  }

  async function prepareExternalRisupPromptMutation(
    target: FacadeV1Target,
    operation: FacadeV1EditOperation,
  ): Promise<
    | {
        data: unknown;
        newPromptTemplate: string;
        routes: FacadeRoute[];
        touched: string[];
        requiredGuards: FacadeV1Guard[];
      }
    | ApiErrorResult
  > {
    if (target.kind !== 'external') {
      return facadeApiError(
        400,
        'External risup prompt mutation requires target.kind="external"',
        'Use target.kind="external" with a .risup file path or open the file and use active risup-prompt selectors.',
        { target },
      );
    }
    const externalPrompt = await readExternalRisupPromptModel(target.file_path);
    if (isApiError(externalPrompt)) return externalPrompt;
    const indices = resolveRisupPromptSelectorIndices(
      externalPrompt.model,
      operation.selector,
      `external risup ${operation.op}`,
    );
    if (!Array.isArray(indices)) return indices;
    const currentItems = indices.map((index) => externalPrompt.model.items[index]);
    const contentRecord = asRecord(operation.content);
    const requiredGuards =
      indices.length === 1 ? risupPromptSingleGuards(currentItems[0]) : risupPromptBatchGuards(currentItems);
    const writeRoute = route('external_write_field', 'POST', '/external/field/promptTemplate');
    const touched = indices.map((index) => `external:${target.file_path}:risup-prompt:${index}`);

    if (operation.op === 'write_content') {
      const newItems = [...externalPrompt.model.items];
      if (indices.length === 1 && !operation.selector.ids && !operation.selector.indices) {
        const currentItem = currentItems[0];
        const label = selectorTarget(operation.selector);
        const conflict = checkRisupPromptIdentity(operation, currentItem, label);
        if (conflict) return conflict;
        const replacement = validateReplacementPromptItem(operation.content, currentItem.id ?? operation.selector.id);
        if (isApiError(replacement)) return replacement;
        newItems[indices[0]] = replacement;
        return {
          data: {
            dryRun: true,
            operation: 'write_content',
            file_path: target.file_path,
            index: indices[0],
            id: currentItem.id ?? null,
            currentType: currentItem.type ?? null,
            currentPreview: risupPromptItemPreview(currentItem),
            replacementType: replacement.type ?? null,
          },
          newPromptTemplate: serializePromptTemplate({ items: newItems }),
          routes: [...externalPrompt.routes, writeRoute],
          touched,
          requiredGuards: mergeGuards(operation.guards, requiredGuards),
        };
      }

      const writes = normalizeBatchEntries(operation, 'item');
      if (isApiError(writes)) return writes;
      const expectedTypes = stringArrayFromRecord(contentRecord, 'expected_types');
      const expectedPreviews = stringArrayFromRecord(contentRecord, 'expected_previews');
      const enrichedWrites: Array<Record<string, unknown>> = [];
      const previews: Array<Record<string, unknown>> = [];
      for (const [position, write] of writes.entries()) {
        const index =
          recordNumber(write, 'index') ??
          (recordString(write, 'item_id')
            ? resolveRisupPromptIdIndex(
                externalPrompt.model,
                recordString(write, 'item_id') ?? '',
                'external risup write',
              )
            : indices[position]);
        if (typeof index !== 'number') return index;
        const currentItem = externalPrompt.model.items[index];
        const conflict = checkRisupPromptBatchIdentity(
          currentItem,
          position,
          expectedTypes,
          expectedPreviews,
          `risup-prompt:${index}`,
        );
        if (conflict) return conflict;
        const replacement = validateReplacementPromptItem(write.item, recordString(write, 'item_id') ?? currentItem.id);
        if (isApiError(replacement)) return replacement;
        newItems[index] = replacement;
        enrichedWrites.push({
          ...write,
          ...(recordString(write, 'item_id') ? { item_id: recordString(write, 'item_id') } : { index }),
          item: asRecord(write.item) ?? write.item,
          expected_type: currentItem.type ?? '',
          expected_preview: risupPromptItemPreview(currentItem),
        });
        previews.push({
          index,
          id: currentItem.id ?? null,
          currentType: currentItem.type ?? null,
          currentPreview: risupPromptItemPreview(currentItem),
          replacementType: replacement.type ?? null,
        });
      }
      operation.content = {
        ...(contentRecord ?? {}),
        writes: enrichedWrites,
        expected_types: currentItems.map((item) => item.type ?? ''),
        expected_previews: currentItems.map((item) => risupPromptItemPreview(item)),
      };
      return {
        data: {
          dryRun: true,
          operation: 'write_content',
          file_path: target.file_path,
          count: previews.length,
          writes: previews,
        },
        newPromptTemplate: serializePromptTemplate({ items: newItems }),
        routes: [...externalPrompt.routes, writeRoute],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    if (operation.op === 'delete_item') {
      if (indices.length === 1 && !operation.selector.ids && !operation.selector.indices) {
        const currentItem = currentItems[0];
        const conflict = checkRisupPromptIdentity(operation, currentItem, selectorTarget(operation.selector));
        if (conflict) return conflict;
        return {
          data: {
            dryRun: true,
            operation: 'delete_item',
            file_path: target.file_path,
            index: indices[0],
            id: currentItem.id ?? null,
            currentType: currentItem.type ?? null,
            currentPreview: risupPromptItemPreview(currentItem),
          },
          newPromptTemplate: serializePromptTemplate({
            items: externalPrompt.model.items.filter((_, index) => index !== indices[0]),
          }),
          routes: [...externalPrompt.routes, writeRoute],
          touched,
          requiredGuards: mergeGuards(operation.guards, requiredGuards),
        };
      }

      const expectedTypes = stringArrayFromRecord(contentRecord, 'expected_types');
      const expectedPreviews = stringArrayFromRecord(contentRecord, 'expected_previews');
      const deletes: Array<Record<string, unknown>> = [];
      for (const [position, index] of indices.entries()) {
        const item = externalPrompt.model.items[index];
        const conflict = checkRisupPromptBatchIdentity(
          item,
          position,
          expectedTypes,
          expectedPreviews,
          `risup-prompt:${index}`,
        );
        if (conflict) return conflict;
        deletes.push({
          index,
          id: item.id ?? null,
          currentType: item.type ?? null,
          currentPreview: risupPromptItemPreview(item),
        });
      }
      const deleteSet = new Set(indices);
      operation.content = {
        ...(contentRecord ?? {}),
        expected_types: currentItems.map((item) => item.type ?? ''),
        expected_previews: currentItems.map((item) => risupPromptItemPreview(item)),
      };
      return {
        data: {
          dryRun: true,
          operation: 'delete_item',
          file_path: target.file_path,
          count: deletes.length,
          deletes,
        },
        newPromptTemplate: serializePromptTemplate({
          items: externalPrompt.model.items.filter((_, index) => !deleteSet.has(index)),
        }),
        routes: [...externalPrompt.routes, writeRoute],
        touched,
        requiredGuards: mergeGuards(operation.guards, requiredGuards),
      };
    }

    return facadeApiError(
      400,
      `Unsupported external risup prompt operation: ${operation.op}`,
      'External risup-prompt facade parity supports write_content and delete_item for id/index and id/index batches.',
      { operation },
    );
  }

  interface RisupPromptContext {
    rawText: string;
    model: PromptTemplateModel;
    routes: FacadeRoute[];
    touchedTarget: string;
  }

  interface ManageItemsPromptPlan {
    result: Record<string, unknown>;
    newPromptTemplate: string;
    routes: FacadeRoute[];
    touched: string[];
    requiredGuards: FacadeV1Guard[];
  }

  function promptTemplateDigest(rawText: string): string {
    return crypto.createHash('sha256').update(rawText).digest('hex');
  }

  function promptDigestGuard(rawText: string): FacadeV1Guard {
    return {
      name: 'expected_prompt_items_digest',
      value: promptTemplateDigest(rawText),
      payloadPath: '/guard_values/*',
      sourceOperations: ['manage_items'],
      sourceResultPath: '/result/prompt_items_digest',
    };
  }

  function snippetUpdatedAtGuard(updatedAt: string | null): FacadeV1Guard {
    return {
      name: 'expected_snippet_updated_at',
      value: updatedAt,
      payloadPath: '/guard_values/*',
      sourceOperations: ['manage_items'],
      sourceResultPath: '/result/snippet/updatedAt',
    };
  }

  function checkGuardValue(
    guards: FacadeV1Guard[] | undefined,
    name: string,
    actual: unknown,
    suggestion: string,
  ): ApiErrorResult | undefined {
    const expected = guardValue(guards, name);
    if (expected === undefined) {
      return facadeApiError(400, `Missing guard value for ${name}`, suggestion, { guard: name }, ['manage_items']);
    }
    if (expected !== actual) {
      return facadeApiError(409, `Stale guard mismatch for ${name}`, suggestion, { guard: name, expected, actual }, [
        'manage_items',
        'read_content',
      ]);
    }
    return undefined;
  }

  type ManageItemsScriptStyleFamily = Extract<ManageItemsFamily, ScriptStyleFamily>;
  type ManageItemsStructuredFamily = Exclude<ManageItemsFamily, 'risup-prompt' | ManageItemsScriptStyleFamily>;
  type ManageItemsCollectionFamily = Exclude<ManageItemsFamily, 'risup-prompt'>;

  interface ManageItemsStructuredContext {
    entries: Array<Record<string, unknown> | string>;
    routes: FacadeRoute[];
    surfacePath: string;
    touchedTarget: string;
  }

  interface ManageItemsStructuredPlan {
    result: Record<string, unknown>;
    operations: Array<Record<string, unknown>>;
    routes: FacadeRoute[];
    touched: string[];
    requiredGuards: FacadeV1Guard[];
  }

  function isManageItemsStructuredFamily(family: ManageItemsFamily): family is ManageItemsStructuredFamily {
    return family === 'lorebook' || family === 'regex' || family === 'greeting';
  }

  function isManageItemsScriptStyleFamily(family: ManageItemsFamily): family is ManageItemsScriptStyleFamily {
    return isScriptStyleFamily(family);
  }

  function itemCollectionDigestGuard(family: ManageItemsCollectionFamily, entries: unknown[]): FacadeV1Guard {
    return {
      name: 'expected_item_collection_digest',
      value: hashStableValue(entries),
      payloadPath: '/guard_values/*',
      sourceOperations: ['manage_items'],
      sourceResultPath: '/result/item_collection_digest',
    };
  }

  function manageItemsExpectedHashGuard(beforeHash: string): FacadeV1Guard {
    return buildGuard('expected_hash', beforeHash, '/guard_values/*', ['manage_items'], '/result/before_hash');
  }

  function structuredManageItemsSurfacePath(
    family: ManageItemsStructuredFamily,
    operation: ManageItemsOperation,
  ): string | ApiErrorResult {
    if (family === 'lorebook') return '/lorebook';
    if (family === 'regex') return '/regex';
    if (family === 'greeting') {
      const greetingType =
        operation.action === 'add_items' || operation.action === 'reorder_items' ? operation.greeting_type : undefined;
      if (greetingType !== 'alternate') {
        return facadeApiError(
          400,
          'manage_items greeting operations support alternate greetings only',
          'Set operation.greeting_type="alternate"; groupOnlyGreetings is deprecated and protected from normal mutation.',
          { greeting_type: greetingType },
        );
      }
      return '/alternateGreetings';
    }
    return facadeApiError(
      400,
      `Unsupported manage_items family: ${family}`,
      'Use risup-prompt, lorebook, regex, or greeting.',
    );
  }

  function structuredManageItemsTouchedTarget(
    target: FacadeV1Target,
    family: ManageItemsStructuredFamily,
    surfacePath: string,
  ): string {
    const suffix = family === 'greeting' ? 'greeting:alternate' : family;
    return target.kind === 'external' ? `external:${target.file_path}:${suffix}` : `active:${suffix}:${surfacePath}`;
  }

  function structuredManageItemsSummary(
    family: ManageItemsStructuredFamily,
    entry: Record<string, unknown> | string,
    index: number,
    entries: Array<Record<string, unknown> | string>,
  ): Record<string, unknown> {
    if (family === 'lorebook') {
      const records = entries as Record<string, unknown>[];
      return externalLorebookSummary(entry as Record<string, unknown>, index, records);
    }
    if (family === 'regex') return externalRegexSummary(entry as Record<string, unknown>, index);
    return externalGreetingSummary(String(entry), index);
  }

  function validateManageItemsStructuredAction(
    family: ManageItemsStructuredFamily,
    operation: ManageItemsOperation,
  ): ApiErrorResult | undefined {
    if (operation.action !== 'add_items' && operation.action !== 'reorder_items') {
      return facadeApiError(
        400,
        `manage_items family "${family}" supports add_items and reorder_items only`,
        'Use read_content for item reads and preview_edit/apply_edit for write/delete/replace operations.',
        { action: operation.action, family },
        ['read_content', 'preview_edit'],
      );
    }
    return undefined;
  }

  async function readManageItemsStructuredContext(
    target: FacadeV1Target,
    family: ManageItemsStructuredFamily,
    operation: ManageItemsOperation,
  ): Promise<ManageItemsStructuredContext | ApiErrorResult> {
    const actionError = validateManageItemsStructuredAction(family, operation);
    if (actionError) return actionError;
    const surfacePath = structuredManageItemsSurfacePath(family, operation);
    if (isApiError(surfacePath)) return surfacePath;

    if (target.kind === 'active') {
      const routePath = '/surface/read';
      const read = await apiRequest('POST', routePath, { path: surfacePath });
      if (isApiError(read)) return read;
      const value = asRecord(read)?.value;
      if (family === 'greeting') {
        if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
          return facadeApiError(
            400,
            'Active alternate greeting surface is not a string array',
            'Inspect the active document surface before using manage_items greeting add/reorder.',
            { path: surfacePath },
            ['inspect_document', 'read_content'],
          );
        }
        return {
          entries: value as string[],
          routes: [route('read_surface', 'POST', routePath)],
          surfacePath,
          touchedTarget: structuredManageItemsTouchedTarget(target, family, surfacePath),
        };
      }
      if (!Array.isArray(value)) {
        return facadeApiError(
          400,
          `Active ${family} surface is not an array`,
          'Inspect the active document surface before using manage_items add/reorder.',
          { path: surfacePath, type: typeof value },
          ['inspect_document', 'read_content'],
        );
      }
      const invalidIndex = value.findIndex((entry) => !asRecord(entry));
      if (invalidIndex >= 0) {
        return facadeApiError(
          400,
          `Active ${family} entry is not an object`,
          'Repair the structured array or use an advanced raw surface patch.',
          { path: surfacePath, index: invalidIndex },
          ['read_content'],
        );
      }
      return {
        entries: value.map((entry) => asRecord(entry) ?? {}),
        routes: [route('read_surface', 'POST', routePath)],
        surfacePath,
        touchedTarget: structuredManageItemsTouchedTarget(target, family, surfacePath),
      };
    }

    if (target.kind === 'external') {
      if (family === 'greeting') {
        const read = await readExternalStringArraySurface(target.file_path, surfacePath, 'greeting');
        if (isApiError(read)) return read;
        return {
          entries: read.entries,
          routes: read.routes,
          surfacePath,
          touchedTarget: structuredManageItemsTouchedTarget(target, family, surfacePath),
        };
      }
      const read = await readExternalRecordArraySurface(target.file_path, surfacePath, family);
      if (isApiError(read)) return read;
      return {
        entries: read.entries,
        routes: read.routes,
        surfacePath,
        touchedTarget: structuredManageItemsTouchedTarget(target, family, surfacePath),
      };
    }

    return facadeApiError(
      400,
      'manage_items structured target must be active or external',
      'Use target.kind="active" for the current file or target.kind="external" for an unopened file.',
      { target, family },
      ['inspect_document'],
    );
  }

  function normalizeManageItemsLorebookEntry(item: unknown, index: number): Record<string, unknown> | ApiErrorResult {
    const data = asRecord(item);
    if (!data) {
      return facadeApiError(
        400,
        'lorebook add_items requires object entries',
        'Provide items as lorebook entry objects with content/comment/key fields.',
        { index },
      );
    }
    return {
      key: '',
      secondkey: '',
      comment: '',
      content: '',
      folder: '',
      order: 100,
      priority: 0,
      selective: false,
      alwaysActive: false,
      mode: 'normal',
      extentions: {},
      ...pickAllowedRecordFields(data, EXTERNAL_LOREBOOK_ALLOWED_FIELDS),
    };
  }

  function normalizeManageItemsRegexEntry(item: unknown, index: number): Record<string, unknown> | ApiErrorResult {
    const data = asRecord(item);
    if (!data) {
      return facadeApiError(
        400,
        'regex add_items requires object entries',
        'Provide items as regex entry objects with find/replace/comment fields.',
        { index },
      );
    }
    const entry: Record<string, unknown> = {
      comment: '',
      type: 'editoutput',
      find: '',
      replace: '',
      flag: 'g',
      ...pickAllowedRecordFields(data, EXTERNAL_REGEX_ALLOWED_FIELDS),
    };
    if (entry.find && !entry.in) entry.in = entry.find;
    if (entry.in && !entry.find) entry.find = entry.in;
    if (entry.replace && !entry.out) entry.out = entry.replace;
    if (entry.out && !entry.replace) entry.replace = entry.out;
    return entry;
  }

  function normalizeManageItemsGreetingEntry(item: unknown, index: number): string | ApiErrorResult {
    if (typeof item === 'string') return item;
    const data = asRecord(item);
    const content = recordString(data, 'content') ?? recordString(data, 'text');
    if (content === undefined) {
      return facadeApiError(
        400,
        'greeting add_items requires content text',
        'Provide each item as { "content": "..." } or { "text": "..." }.',
        { index },
      );
    }
    return content;
  }

  function normalizeManageItemsStructuredEntries(
    family: ManageItemsStructuredFamily,
    items: unknown[],
  ): Array<Record<string, unknown> | string> | ApiErrorResult {
    const entries: Array<Record<string, unknown> | string> = [];
    for (const [index, item] of items.entries()) {
      const normalized =
        family === 'lorebook'
          ? normalizeManageItemsLorebookEntry(item, index)
          : family === 'regex'
            ? normalizeManageItemsRegexEntry(item, index)
            : normalizeManageItemsGreetingEntry(item, index);
      if (isApiError(normalized)) return normalized;
      entries.push(normalized);
    }
    return entries;
  }

  function fullStructuredIdPermutation(
    orderIds: string[] | undefined,
    family: ManageItemsStructuredFamily,
    entries: Array<Record<string, unknown> | string>,
  ): ApiErrorResult | string[] {
    if (family !== 'lorebook') {
      return facadeApiError(
        400,
        'order_ids is currently supported only for lorebook item reorder',
        'Use a full index order permutation for regex and alternate greeting reorder operations.',
        { family },
      );
    }
    const records = entries as Record<string, unknown>[];
    const currentIds = records.map((entry, index) => externalLorebookStableId(entry, index, records));
    if (!orderIds || orderIds.length !== entries.length) {
      return facadeApiError(
        400,
        `order_ids must include every current lorebook id exactly once (${entries.length} items)`,
        'Refresh lorebook summaries, then retry with every id exactly once.',
        { count: entries.length },
        ['read_content', 'manage_items'],
      );
    }
    const duplicate = currentIds.find((id, index) => currentIds.indexOf(id) !== index);
    if (duplicate) {
      return facadeApiError(
        409,
        'Current lorebook stable ids are not unique',
        'Use a full index order permutation for this reorder.',
        { duplicate },
      );
    }
    const expected = [...currentIds].sort();
    const actual = [...orderIds].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      return facadeApiError(
        400,
        'order_ids must be a full permutation of current lorebook ids',
        'Refresh lorebook summaries and retry with every id exactly once.',
        { count: entries.length },
        ['read_content', 'manage_items'],
      );
    }
    return orderIds;
  }

  async function buildManageItemsStructuredPlan(
    target: FacadeV1Target,
    family: ManageItemsStructuredFamily,
    operation: ManageItemsOperation,
    providedContext?: ManageItemsStructuredContext,
  ): Promise<ManageItemsStructuredPlan | ApiErrorResult> {
    const context = providedContext ?? (await readManageItemsStructuredContext(target, family, operation));
    if (isApiError(context)) return context;
    const guard = itemCollectionDigestGuard(family, context.entries);
    const beforeCount = context.entries.length;
    const operations: Array<Record<string, unknown>> = [];
    let result: Record<string, unknown>;
    let newEntries: Array<Record<string, unknown> | string>;

    if (operation.action === 'add_items') {
      const entries = normalizeManageItemsStructuredEntries(family, operation.items);
      if (isApiError(entries)) return entries;
      const insertAt = operation.insertAt ?? beforeCount;
      if (insertAt < 0 || insertAt > beforeCount) {
        return facadeApiError(
          400,
          `insertAt must be an integer between 0 and ${beforeCount}`,
          'Use an insertAt value inside the current item bounds.',
          { insertAt, beforeCount },
        );
      }
      for (const [offset, entry] of entries.entries()) {
        operations.push({
          op: 'add',
          path: `${context.surfacePath}/${jsonPointerSegment(insertAt + offset)}`,
          value: entry,
        });
      }
      newEntries = [...context.entries.slice(0, insertAt), ...entries, ...context.entries.slice(insertAt)];
      result = {
        action: operation.action,
        family,
        before_count: beforeCount,
        after_count: newEntries.length,
        insertAt,
        count: entries.length,
        items: entries.map((entry, offset) =>
          structuredManageItemsSummary(family, entry, insertAt + offset, newEntries),
        ),
        item_collection_digest: guard.value,
      };
    } else if (operation.action === 'reorder_items') {
      if ((operation.order_ids ? 1 : 0) + (operation.order ? 1 : 0) !== 1) {
        return facadeApiError(
          400,
          'reorder_items requires exactly one of order_ids or order',
          'Use order_ids for lorebook stable-id reorder, or order for full index permutation fallback.',
          { operation, family },
        );
      }
      if (operation.order_ids) {
        const orderIds = fullStructuredIdPermutation(operation.order_ids, family, context.entries);
        if (isApiError(orderIds)) return orderIds;
        const records = context.entries as Record<string, unknown>[];
        const byId = new Map(records.map((entry, index) => [externalLorebookStableId(entry, index, records), entry]));
        newEntries = orderIds.map((id) => byId.get(id)!);
        operations.push({ op: 'replace', path: context.surfacePath, value: newEntries });
        result = {
          action: operation.action,
          family,
          before_count: beforeCount,
          after_count: beforeCount,
          order_ids: orderIds,
          item_collection_digest: guard.value,
        };
      } else {
        const order = fullIndexPermutation(operation.order, beforeCount);
        if (isApiError(order)) return order;
        newEntries = order.map((index) => context.entries[index]);
        operations.push({ op: 'replace', path: context.surfacePath, value: newEntries });
        result = {
          action: operation.action,
          family,
          before_count: beforeCount,
          after_count: beforeCount,
          order,
          item_collection_digest: guard.value,
        };
      }
    } else {
      return facadeApiError(
        400,
        `Unsupported structured manage_items action: ${operation.action}`,
        'Use add_items or reorder_items for lorebook, regex, and alternate greeting management.',
        { action: operation.action, family },
      );
    }

    return {
      result,
      operations,
      routes: context.routes,
      touched: [context.touchedTarget],
      requiredGuards: [guard],
    };
  }

  async function previewManageItemsStructuredOperation(
    target: FacadeV1Target,
    family: ManageItemsStructuredFamily,
    operation: ManageItemsOperation,
  ): Promise<
    | {
        result: Record<string, unknown>;
        routes: FacadeRoute[];
        touched: string[];
        requiredGuards: FacadeV1Guard[];
      }
    | ApiErrorResult
  > {
    const plan = await buildManageItemsStructuredPlan(target, family, operation);
    if (isApiError(plan)) return plan;
    const routePath = target.kind === 'external' ? '/external/surface/patch' : '/surface/patch';
    const dryRun = await apiRequest('POST', routePath, {
      ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
      operations: plan.operations,
      dry_run: true,
    });
    if (isApiError(dryRun)) return dryRun;
    const beforeHash = recordString(asRecord(dryRun), 'before_hash');
    return {
      result: { dry_run: true, ...plan.result, ...(asRecord(dryRun) ?? {}) },
      routes: [
        ...plan.routes,
        route(target.kind === 'external' ? 'external_patch_surface' : 'patch_surface', 'POST', routePath),
      ],
      touched: plan.touched,
      requiredGuards: mergeGuards(plan.requiredGuards, [
        beforeHash ? manageItemsExpectedHashGuard(beforeHash) : undefined,
      ]),
    };
  }

  async function applyManageItemsStructuredOperation(
    target: FacadeV1Target,
    family: ManageItemsStructuredFamily,
    operation: ManageItemsOperation,
    guardValues: FacadeV1Guard[] | undefined,
  ): Promise<{ result: Record<string, unknown>; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    const context = await readManageItemsStructuredContext(target, family, operation);
    if (isApiError(context)) return context;
    const digestConflict = checkGuardValue(
      guardValues,
      'expected_item_collection_digest',
      hashStableValue(context.entries),
      'Refresh item summaries, then run manage_items preview again.',
    );
    if (digestConflict) return digestConflict;
    const plan = await buildManageItemsStructuredPlan(target, family, operation, context);
    if (isApiError(plan)) return plan;
    const routePath = target.kind === 'external' ? '/external/surface/patch' : '/surface/patch';
    const data = await apiRequest('POST', routePath, {
      ...(target.kind === 'external' ? { file_path: target.file_path } : {}),
      operations: plan.operations,
      expected_hash: guardValue(guardValues, 'expected_hash'),
    });
    return isApiError(data)
      ? data
      : {
          result: { ...(asRecord(data) ?? {}), ...plan.result },
          routes: [
            ...plan.routes,
            route(target.kind === 'external' ? 'external_patch_surface' : 'patch_surface', 'POST', routePath),
          ],
          touched: plan.touched,
        };
  }

  type ManageItemsScriptStyleEntry = Record<string, unknown> | TextSection;

  interface ManageItemsScriptStyleContext {
    entries: ManageItemsScriptStyleEntry[];
    routes: FacadeRoute[];
    surfacePath: '/triggerScripts' | '/lua' | '/css';
    touchedTarget: string;
    rawText?: string;
    cssPrefix?: string;
    cssSuffix?: string;
  }

  interface ManageItemsScriptStylePlan {
    result: Record<string, unknown>;
    serializedValue: unknown;
    operations: Array<Record<string, unknown>>;
    routes: FacadeRoute[];
    touched: string[];
    requiredGuards: FacadeV1Guard[];
  }

  function scriptStyleManageSurfacePath(family: ManageItemsScriptStyleFamily): '/triggerScripts' | '/lua' | '/css' {
    if (family === 'trigger') return '/triggerScripts';
    if (family === 'lua') return '/lua';
    return '/css';
  }

  function scriptStyleManageFieldName(family: ManageItemsScriptStyleFamily): 'triggerScripts' | 'lua' | 'css' {
    if (family === 'trigger') return 'triggerScripts';
    return family;
  }

  function scriptStyleManageTouchedTarget(
    target: FacadeV1Target,
    family: ManageItemsScriptStyleFamily,
    surfacePath: string,
  ): string {
    return target.kind === 'external' ? `external:${target.file_path}:${family}` : `active:${family}:${surfacePath}`;
  }

  function scriptStyleManageDigestInput(context: ManageItemsScriptStyleContext): unknown {
    if (context.rawText !== undefined) {
      return {
        entries: context.entries,
        rawText: context.rawText,
        cssPrefix: context.cssPrefix ?? '',
        cssSuffix: context.cssSuffix ?? '',
      };
    }
    return context.entries;
  }

  function scriptStyleCollectionDigestGuard(
    family: ManageItemsScriptStyleFamily,
    context: ManageItemsScriptStyleContext,
  ): FacadeV1Guard {
    return {
      ...itemCollectionDigestGuard(family, []),
      value: hashStableValue(scriptStyleManageDigestInput(context)),
    };
  }

  function scriptStyleManageSummary(
    family: ManageItemsScriptStyleFamily,
    entry: ManageItemsScriptStyleEntry,
    index: number,
  ): Record<string, unknown> {
    if (family === 'trigger') return triggerSummary(entry as Record<string, unknown>, index);
    return sectionSummary(entry as TextSection, index);
  }

  function validateManageItemsScriptStyleAction(
    family: ManageItemsScriptStyleFamily,
    operation: ManageItemsOperation,
  ): ApiErrorResult | undefined {
    if (operation.action !== 'add_items' && operation.action !== 'reorder_items') {
      return facadeApiError(
        400,
        `manage_items family "${family}" supports add_items and reorder_items only`,
        'Use read_content for item reads and preview_edit/apply_edit for write/delete/replace operations.',
        { action: operation.action, family },
        ['read_content', 'preview_edit'],
      );
    }
    return undefined;
  }

  async function readManageItemsScriptStyleContext(
    target: FacadeV1Target,
    family: ManageItemsScriptStyleFamily,
    operation: ManageItemsOperation,
  ): Promise<ManageItemsScriptStyleContext | ApiErrorResult> {
    const actionError = validateManageItemsScriptStyleAction(family, operation);
    if (actionError) return actionError;
    const surfacePath = scriptStyleManageSurfacePath(family);

    if (target.kind === 'active') {
      if (family === 'trigger') {
        const routePath = '/surface/read';
        const read = await apiRequest('POST', routePath, { path: surfacePath });
        if (isApiError(read)) return read;
        const value = asRecord(read)?.value;
        if (!Array.isArray(value)) {
          return facadeApiError(
            400,
            'Active triggerScripts surface is not an array',
            'Inspect the active document surface before using manage_items trigger add/reorder.',
            { path: surfacePath, type: typeof value },
            ['inspect_document', 'read_content'],
          );
        }
        const invalidIndex = value.findIndex((entry) => !asRecord(entry));
        if (invalidIndex >= 0) {
          return facadeApiError(
            400,
            'Active triggerScripts entry is not an object',
            'Repair the triggerScripts array or use an advanced raw surface patch.',
            { path: surfacePath, index: invalidIndex },
            ['read_content'],
          );
        }
        return {
          entries: value.map((entry) => asRecord(entry) ?? {}),
          routes: [route('read_surface', 'POST', routePath)],
          surfacePath,
          touchedTarget: scriptStyleManageTouchedTarget(target, family, surfacePath),
        };
      }

      const fieldName = scriptStyleManageFieldName(family);
      const routePath = `/field/${fieldName}`;
      const read = await apiRequest('GET', routePath);
      if (isApiError(read)) return read;
      const content = asRecord(read)?.content;
      if (typeof content !== 'string') {
        return facadeApiError(
          400,
          `Active ${family} field is not a string`,
          'Inspect the active document field before using manage_items section add/reorder.',
          { field: fieldName, type: typeof content },
          ['inspect_document', 'read_content'],
        );
      }
      const parsed =
        family === 'lua'
          ? { sections: parseLuaSections(content) as TextSection[], prefix: '', suffix: '' }
          : (parseCssSections(content) as { sections: TextSection[]; prefix: string; suffix: string });
      return {
        entries: parsed.sections,
        routes: [route('read_field', 'GET', routePath)],
        surfacePath,
        touchedTarget: scriptStyleManageTouchedTarget(target, family, surfacePath),
        rawText: content,
        cssPrefix: parsed.prefix,
        cssSuffix: parsed.suffix,
      };
    }

    if (target.kind === 'external') {
      if (family === 'trigger') {
        const read = await readExternalRecordArraySurface(target.file_path, surfacePath, 'trigger');
        if (isApiError(read)) return read;
        return {
          entries: read.entries,
          routes: read.routes,
          surfacePath,
          touchedTarget: scriptStyleManageTouchedTarget(target, family, surfacePath),
        };
      }

      const textSurfacePath = family === 'lua' ? '/lua' : '/css';
      const read = await readExternalTextSurface(target.file_path, textSurfacePath, family);
      if (isApiError(read)) return read;
      const parsed =
        family === 'lua'
          ? { sections: parseLuaSections(read.text) as TextSection[], prefix: '', suffix: '' }
          : (parseCssSections(read.text) as { sections: TextSection[]; prefix: string; suffix: string });
      return {
        entries: parsed.sections,
        routes: read.routes,
        surfacePath,
        touchedTarget: scriptStyleManageTouchedTarget(target, family, surfacePath),
        rawText: read.text,
        cssPrefix: parsed.prefix,
        cssSuffix: parsed.suffix,
      };
    }

    return facadeApiError(
      400,
      'manage_items script/style target must be active or external',
      'Use target.kind="active" for the current file or target.kind="external" for an unopened file.',
      { target, family },
      ['inspect_document'],
    );
  }

  function normalizeManageItemsTriggerEntry(item: unknown, index: number): Record<string, unknown> | ApiErrorResult {
    const data = asRecord(item);
    if (!data) {
      return facadeApiError(
        400,
        'trigger add_items requires object entries',
        'Provide items as trigger objects with comment/type/conditions/effect fields.',
        { index },
      );
    }
    const entry: Record<string, unknown> = {
      comment: '',
      type: 'start',
      conditions: [],
      effect: [],
      lowLevelAccess: false,
      ...pickAllowedRecordFields(data, EXTERNAL_TRIGGER_ALLOWED_FIELDS),
    };
    if (typeof entry.comment !== 'string') {
      return facadeApiError(400, 'trigger comment must be a string', 'Set items[].comment to a string.', { index });
    }
    if (typeof entry.type !== 'string') {
      return facadeApiError(400, 'trigger type must be a string', 'Set items[].type to a trigger type string.', {
        index,
      });
    }
    if (!Array.isArray(entry.conditions)) {
      return facadeApiError(
        400,
        'trigger conditions must be an array',
        'Set items[].conditions to an array, or omit it for an empty array.',
        { index },
      );
    }
    if (!Array.isArray(entry.effect)) {
      return facadeApiError(
        400,
        'trigger effect must be an array',
        'Set items[].effect to an array, or omit it for an empty array.',
        { index },
      );
    }
    entry.lowLevelAccess = !!entry.lowLevelAccess;
    return entry;
  }

  function normalizeManageItemsSectionEntry(
    family: ManageItemsScriptStyleFamily,
    item: unknown,
    index: number,
    names: Set<string>,
  ): TextSection | ApiErrorResult {
    const data = asRecord(item);
    if (!data) {
      return facadeApiError(
        400,
        `${family} add_items requires object entries`,
        'Provide items as { name, content } objects.',
        { index },
      );
    }
    const name = recordString(data, 'name');
    if (!name || !name.trim()) {
      return facadeApiError(
        400,
        `${family} section add_items requires a non-empty name`,
        'Set items[].name to a unique section name.',
        { index },
      );
    }
    const trimmedName = name.trim();
    if (names.has(trimmedName)) {
      return facadeApiError(
        409,
        `${family} section name already exists: ${trimmedName}`,
        'Choose a unique section name or use preview_edit/apply_edit to modify the existing section.',
        { index, name: trimmedName },
        ['read_content', 'preview_edit'],
      );
    }
    names.add(trimmedName);
    return { name: trimmedName, content: normalizeLFString(recordString(data, 'content') ?? '') };
  }

  function normalizeManageItemsScriptStyleEntries(
    family: ManageItemsScriptStyleFamily,
    items: unknown[],
    currentEntries: ManageItemsScriptStyleEntry[],
  ): ManageItemsScriptStyleEntry[] | ApiErrorResult {
    const entries: ManageItemsScriptStyleEntry[] = [];
    const names =
      family === 'trigger' ? new Set<string>() : new Set((currentEntries as TextSection[]).map((entry) => entry.name));
    for (const [index, item] of items.entries()) {
      const normalized =
        family === 'trigger'
          ? normalizeManageItemsTriggerEntry(item, index)
          : normalizeManageItemsSectionEntry(family, item, index, names);
      if (isApiError(normalized)) return normalized;
      entries.push(normalized);
    }
    return entries;
  }

  function serializeManageItemsScriptStyleEntries(
    family: ManageItemsScriptStyleFamily,
    entries: ManageItemsScriptStyleEntry[],
    context: ManageItemsScriptStyleContext,
  ): unknown {
    if (family === 'trigger') return entries as Record<string, unknown>[];
    const sections = entries as TextSection[];
    if (family === 'lua') return combineLuaSections(sections);
    return combineCssSections(sections, context.cssPrefix ?? '', context.cssSuffix ?? '');
  }

  async function buildManageItemsScriptStylePlan(
    target: FacadeV1Target,
    family: ManageItemsScriptStyleFamily,
    operation: ManageItemsOperation,
    providedContext?: ManageItemsScriptStyleContext,
  ): Promise<ManageItemsScriptStylePlan | ApiErrorResult> {
    const context = providedContext ?? (await readManageItemsScriptStyleContext(target, family, operation));
    if (isApiError(context)) return context;
    const guard = scriptStyleCollectionDigestGuard(family, context);
    const beforeCount = context.entries.length;
    let newEntries: ManageItemsScriptStyleEntry[];
    let result: Record<string, unknown>;

    if (operation.action === 'add_items') {
      const entries = normalizeManageItemsScriptStyleEntries(family, operation.items, context.entries);
      if (isApiError(entries)) return entries;
      const insertAt = operation.insertAt ?? beforeCount;
      if (insertAt < 0 || insertAt > beforeCount) {
        return facadeApiError(
          400,
          `insertAt must be an integer between 0 and ${beforeCount}`,
          'Use an insertAt value inside the current item bounds.',
          { insertAt, beforeCount },
        );
      }
      newEntries = [...context.entries.slice(0, insertAt), ...entries, ...context.entries.slice(insertAt)];
      result = {
        action: operation.action,
        family,
        before_count: beforeCount,
        after_count: newEntries.length,
        insertAt,
        count: entries.length,
        items: entries.map((entry, offset) => scriptStyleManageSummary(family, entry, insertAt + offset)),
        item_collection_digest: guard.value,
      };
    } else if (operation.action === 'reorder_items') {
      if (operation.order_ids) {
        return facadeApiError(
          400,
          'order_ids is not supported for trigger/Lua/CSS reorder',
          'Use operation.order with a full index permutation.',
          { family },
        );
      }
      const order = fullIndexPermutation(operation.order, beforeCount);
      if (isApiError(order)) return order;
      newEntries = order.map((index) => context.entries[index]);
      result = {
        action: operation.action,
        family,
        before_count: beforeCount,
        after_count: beforeCount,
        order,
        item_collection_digest: guard.value,
      };
    } else {
      return facadeApiError(
        400,
        `Unsupported script/style manage_items action: ${operation.action}`,
        'Use add_items or reorder_items for trigger, Lua, and CSS management.',
        { action: operation.action, family },
      );
    }

    const serializedValue = serializeManageItemsScriptStyleEntries(family, newEntries, context);
    return {
      result,
      serializedValue,
      operations: [{ op: 'replace', path: context.surfacePath, value: serializedValue }],
      routes: context.routes,
      touched: [context.touchedTarget],
      requiredGuards: [guard],
    };
  }

  async function previewManageItemsScriptStyleOperation(
    target: FacadeV1Target,
    family: ManageItemsScriptStyleFamily,
    operation: ManageItemsOperation,
  ): Promise<
    | {
        result: Record<string, unknown>;
        routes: FacadeRoute[];
        touched: string[];
        requiredGuards: FacadeV1Guard[];
      }
    | ApiErrorResult
  > {
    const plan = await buildManageItemsScriptStylePlan(target, family, operation);
    if (isApiError(plan)) return plan;
    if (target.kind === 'external') {
      const routePath = '/external/surface/patch';
      const dryRun = await apiRequest('POST', routePath, {
        file_path: target.file_path,
        operations: plan.operations,
        dry_run: true,
      });
      if (isApiError(dryRun)) return dryRun;
      const beforeHash = recordString(asRecord(dryRun), 'before_hash');
      return {
        result: { dry_run: true, ...plan.result, ...(asRecord(dryRun) ?? {}) },
        routes: [...plan.routes, route('external_patch_surface', 'POST', routePath)],
        touched: plan.touched,
        requiredGuards: mergeGuards(plan.requiredGuards, [
          beforeHash ? manageItemsExpectedHashGuard(beforeHash) : undefined,
        ]),
      };
    }

    const fieldName = scriptStyleManageFieldName(family);
    return {
      result: { dry_run: true, ...plan.result },
      routes: [...plan.routes, route('write_field', 'POST', `/field/${fieldName}`)],
      touched: plan.touched,
      requiredGuards: plan.requiredGuards,
    };
  }

  async function applyManageItemsScriptStyleOperation(
    target: FacadeV1Target,
    family: ManageItemsScriptStyleFamily,
    operation: ManageItemsOperation,
    guardValues: FacadeV1Guard[] | undefined,
  ): Promise<{ result: Record<string, unknown>; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    const context = await readManageItemsScriptStyleContext(target, family, operation);
    if (isApiError(context)) return context;
    const digestConflict = checkGuardValue(
      guardValues,
      'expected_item_collection_digest',
      hashStableValue(scriptStyleManageDigestInput(context)),
      'Refresh item summaries, then run manage_items preview again.',
    );
    if (digestConflict) return digestConflict;
    const plan = await buildManageItemsScriptStylePlan(target, family, operation, context);
    if (isApiError(plan)) return plan;

    if (target.kind === 'external') {
      const routePath = '/external/surface/patch';
      const data = await apiRequest('POST', routePath, {
        file_path: target.file_path,
        operations: plan.operations,
        expected_hash: guardValue(guardValues, 'expected_hash'),
      });
      return isApiError(data)
        ? data
        : {
            result: { ...(asRecord(data) ?? {}), ...plan.result },
            routes: [...plan.routes, route('external_patch_surface', 'POST', routePath)],
            touched: plan.touched,
          };
    }

    const fieldName = scriptStyleManageFieldName(family);
    const routePath = `/field/${fieldName}`;
    const content = family === 'trigger' ? JSON.stringify(plan.serializedValue) : String(plan.serializedValue);
    const data = await apiRequest('POST', routePath, { content });
    return isApiError(data)
      ? data
      : {
          result: { ...(asRecord(data) ?? {}), ...plan.result },
          routes: [...plan.routes, route('write_field', 'POST', routePath)],
          touched: plan.touched,
        };
  }

  async function readActiveRisupPromptContext(action: string): Promise<RisupPromptContext | ApiErrorResult> {
    const routePath = '/field/promptTemplate';
    const read = await apiRequest('GET', routePath);
    if (isApiError(read)) return read;
    const content = asRecord(read)?.content;
    if (typeof content !== 'string') {
      return facadeApiError(
        400,
        'Active promptTemplate is not a string',
        'Open a .risup preset before using manage_items for risup-prompt workflows.',
        { action },
        ['inspect_document'],
      );
    }
    const model = parsePromptTemplate(content);
    if (model.state === 'invalid') {
      return facadeApiError(
        400,
        `Invalid active promptTemplate: ${model.parseError}`,
        'Repair promptTemplate with a granular field route before using manage_items.',
        { action, parseError: model.parseError },
        ['read_content'],
      );
    }
    return {
      rawText: content,
      model,
      routes: [route('read_field', 'GET', routePath)],
      touchedTarget: 'active:risup-prompt',
    };
  }

  async function readManageItemsPromptContext(
    target: FacadeV1Target,
    action: string,
  ): Promise<RisupPromptContext | ApiErrorResult> {
    if (target.kind === 'active') return readActiveRisupPromptContext(action);
    if (target.kind === 'external') {
      const external = await readExternalRisupPromptModel(target.file_path);
      if (isApiError(external)) return external;
      return {
        rawText: external.rawText,
        model: external.model,
        routes: external.routes,
        touchedTarget: `external:${target.file_path}:risup-prompt`,
      };
    }
    return facadeApiError(
      400,
      'manage_items risup-prompt target must be active or external',
      'Use target.kind="active" for the current .risup preset or target.kind="external" for an unopened .risup file.',
      { target, action },
      ['inspect_document'],
    );
  }

  async function collectManageItemsOrderWarnings(
    target: FacadeV1Target,
    promptModel: PromptTemplateModel,
  ): Promise<{ warnings: string[]; routes: FacadeRoute[] } | ApiErrorResult> {
    const routePath = target.kind === 'external' ? '/external/surface/read' : '/field/formatingOrder';
    const read =
      target.kind === 'external'
        ? await apiRequest('POST', routePath, { file_path: target.file_path, path: '/formatingOrder' })
        : await apiRequest('GET', routePath);
    if (isApiError(read)) return read;
    const value = target.kind === 'external' ? asRecord(read)?.value : asRecord(read)?.content;
    const order = parseFormatingOrder(typeof value === 'string' ? value : '');
    return {
      warnings:
        order.state === 'invalid'
          ? [`Invalid formatingOrder: ${order.parseError ?? 'unknown parse error'}`]
          : collectFormatingOrderWarnings(promptModel, order),
      routes: [
        target.kind === 'external'
          ? route('external_read_surface', 'POST', routePath)
          : route('read_field', 'GET', routePath),
      ],
    };
  }

  function manageItemsSelectorIndices(
    model: PromptTemplateModel,
    selector: { id?: string; ids?: string[]; index?: number; indices?: number[] },
    action: string,
  ): number[] | ApiErrorResult {
    return resolveRisupPromptSelectorIndices(model, { family: 'risup-prompt', ...selector }, action);
  }

  function validateManagePromptItemInput(item: unknown, action: string): PromptItemModel | ApiErrorResult {
    const parsed = parsePromptTemplate(JSON.stringify([item]));
    if (parsed.state === 'invalid' || parsed.items.length === 0) {
      return facadeApiError(
        400,
        `Invalid risup prompt item: ${parsed.parseError ?? 'Invalid item structure.'}`,
        'Provide one supported prompt item object.',
        { action, parseError: parsed.parseError },
      );
    }
    const model = parsed.items[0];
    if (!model.supported) {
      return facadeApiError(
        400,
        `Unsupported risup prompt item type: ${model.type ?? 'unknown'}`,
        'manage_items add_items supports plain, jailbreak, cot, chatML, persona, description, lorebook, postEverything, memory, authornote, chat, and cache items.',
        { action },
      );
    }
    if (!hasExplicitPromptItemIdLocal(item)) model.id = '';
    return model;
  }

  function validateManagePromptItems(items: unknown[], action: string): PromptItemModel[] | ApiErrorResult {
    const models: PromptItemModel[] = [];
    for (const [index, item] of items.entries()) {
      const model = validateManagePromptItemInput(item, action);
      if (isApiError(model)) {
        return facadeApiError(
          model.status,
          `Invalid item at batch index ${index}`,
          String(model.suggestion ?? 'Fix the invalid prompt item and retry.'),
          { action, invalidIndex: index, cause: model },
        );
      }
      models.push(model);
    }
    return models;
  }

  function promptItemSummaries(items: PromptItemModel[], startIndex = 0): Array<Record<string, unknown>> {
    return items.map((item, offset) => risupPromptItemSummary(item, startIndex + offset));
  }

  function fullIndexPermutation(order: number[] | undefined, count: number): ApiErrorResult | number[] {
    if (!order || order.length !== count) {
      return facadeApiError(
        400,
        `order must include every current prompt item index exactly once (${count} items)`,
        'Use manage_items read/copy or read_content to refresh the current item count before reordering.',
        { count },
      );
    }
    const sorted = [...order].sort((a, b) => a - b);
    const expected = Array.from({ length: count }, (_, index) => index);
    if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
      return facadeApiError(
        400,
        'order must be a full permutation of [0, 1, ..., n-1]',
        'Provide each current prompt item index exactly once.',
        { count, order },
      );
    }
    return order;
  }

  function fullIdPermutation(orderIds: string[] | undefined, model: PromptTemplateModel): ApiErrorResult | string[] {
    const currentIds = model.items.map((item) => (item.supported ? item.id : undefined));
    if (!orderIds || orderIds.length !== model.items.length || currentIds.some((id) => !id)) {
      return facadeApiError(
        400,
        `order_ids must include every current supported prompt item id exactly once (${model.items.length} items)`,
        'If unsupported/raw prompt items are present, use the full index order fallback instead.',
        { count: model.items.length },
      );
    }
    const expected = [...(currentIds as string[])].sort();
    const actual = [...orderIds].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      return facadeApiError(
        400,
        'order_ids must be a full permutation of current prompt item ids',
        'Refresh prompt item ids and retry with every id exactly once.',
        { count: model.items.length },
      );
    }
    return orderIds;
  }

  async function readSnippetOptional(
    identifier: string,
  ): Promise<{ data: Record<string, unknown> | null; routes: FacadeRoute[] } | ApiErrorResult> {
    const routePath = '/risup/prompt-snippets/read';
    const data = await apiRequest('POST', routePath, { identifier });
    if (isApiError(data)) {
      if (data.status === 404) return { data: null, routes: [route('read_risup_prompt_snippet', 'POST', routePath)] };
      return data;
    }
    return { data: asRecord(data) ?? {}, routes: [route('read_risup_prompt_snippet', 'POST', routePath)] };
  }

  function snippetSummary(data: Record<string, unknown> | null): Record<string, unknown> | null {
    return asRecord(data?.snippet) ?? null;
  }

  function snippetUpdatedAt(data: Record<string, unknown> | null): string | null {
    return recordString(snippetSummary(data) ?? undefined, 'updatedAt') ?? null;
  }

  function parseSnippetItems(data: Record<string, unknown>, action: string): PromptTemplateModel | ApiErrorResult {
    const text = recordString(data, 'text');
    if (text === undefined) {
      return facadeApiError(500, 'Snippet read response did not include text', 'Retry read_snippet, then retry.', {
        action,
      });
    }
    const parsed = parsePromptTemplateFromText(text);
    if (parsed.state === 'invalid') {
      return facadeApiError(
        409,
        `Stored snippet text is invalid: ${parsed.parseError}`,
        'Overwrite or delete the invalid snippet before using it through manage_items.',
        { action, parseError: parsed.parseError, snippet: snippetSummary(data) },
      );
    }
    return parsed;
  }

  async function buildManageItemsPromptPlan(
    target: FacadeV1Target,
    operation: ManageItemsOperation,
    providedContext?: RisupPromptContext,
  ): Promise<ManageItemsPromptPlan | ApiErrorResult> {
    const context = providedContext ?? (await readManageItemsPromptContext(target, operation.action));
    if (isApiError(context)) return context;
    const promptGuard = promptDigestGuard(context.rawText);
    const beforeCount = context.model.items.length;
    const baseRoutes = [...context.routes];
    let newItems: PromptItemModel[];
    let result: Record<string, unknown>;
    let intendedRoute: FacadeRoute;

    if (operation.action === 'add_items') {
      const models = validateManagePromptItems(operation.items, operation.action);
      if (isApiError(models)) return models;
      const insertAt = operation.insertAt ?? beforeCount;
      if (insertAt < 0 || insertAt > beforeCount) {
        return facadeApiError(
          400,
          `insertAt must be an integer between 0 and ${beforeCount}`,
          'Use an insertAt value inside the current prompt item bounds.',
          { insertAt, beforeCount },
        );
      }
      newItems = [...context.model.items];
      newItems.splice(insertAt, 0, ...models);
      intendedRoute =
        models.length === 1
          ? route('add_risup_prompt_item', 'POST', '/risup/prompt-item/add')
          : route('add_risup_prompt_item_batch', 'POST', '/risup/prompt-item/batch-add');
      result = {
        action: operation.action,
        before_count: beforeCount,
        after_count: newItems.length,
        insertAt,
        items: promptItemSummaries(models, insertAt),
      };
    } else if (operation.action === 'reorder_items') {
      if ((operation.order_ids ? 1 : 0) + (operation.order ? 1 : 0) !== 1) {
        return facadeApiError(
          400,
          'reorder_items requires exactly one of order_ids or order',
          'Use order_ids for stable-id reorder, or order only when unsupported/raw items require index fallback.',
          { operation },
        );
      }
      if (operation.order_ids) {
        const orderIds = fullIdPermutation(operation.order_ids, context.model);
        if (isApiError(orderIds)) return orderIds;
        const byId = new Map(context.model.items.map((item) => [item.id, item] as const));
        newItems = orderIds.map((id) => byId.get(id)!);
        intendedRoute = route('reorder_risup_prompt_items_by_id', 'POST', '/risup/prompt-item/reorder-by-id');
        result = { action: operation.action, before_count: beforeCount, after_count: beforeCount, order_ids: orderIds };
      } else {
        const order = fullIndexPermutation(operation.order, beforeCount);
        if (isApiError(order)) return order;
        newItems = order.map((index) => context.model.items[index]);
        intendedRoute = route('reorder_risup_prompt_items', 'POST', '/risup/prompt-item/reorder');
        result = { action: operation.action, before_count: beforeCount, after_count: beforeCount, order };
      }
    } else if (operation.action === 'import_text') {
      const imported = parsePromptTemplateFromText(operation.text);
      if (imported.state === 'invalid') {
        return facadeApiError(
          400,
          `Invalid prompt text: ${imported.parseError}`,
          'Use text from export/copy prompt serializer output, preserving block headers and metadata.',
          { parseError: imported.parseError },
        );
      }
      const mode = operation.import_mode ?? 'replace';
      if (mode === 'append') {
        const insertAt = operation.insertAt ?? beforeCount;
        if (insertAt < 0 || insertAt > beforeCount) {
          return facadeApiError(
            400,
            `insertAt must be an integer between 0 and ${beforeCount}`,
            'Use an insertAt value inside the current prompt item bounds.',
            { insertAt, beforeCount },
          );
        }
        const importedItems = imported.items.map((item) => duplicatePromptItem(item));
        newItems = [
          ...context.model.items.slice(0, insertAt),
          ...importedItems,
          ...context.model.items.slice(insertAt),
        ];
        result = {
          action: operation.action,
          mode,
          before_count: beforeCount,
          after_count: newItems.length,
          insertAt,
          count: importedItems.length,
          hasUnsupportedContent: imported.hasUnsupportedContent,
          items: promptItemSummaries(importedItems, insertAt),
        };
      } else {
        newItems = imported.items;
        result = {
          action: operation.action,
          mode,
          before_count: beforeCount,
          after_count: imported.items.length,
          count: imported.items.length,
          hasUnsupportedContent: imported.hasUnsupportedContent,
          items: promptItemSummaries(imported.items),
        };
      }
      intendedRoute = route('import_risup_prompt_from_text', 'POST', '/risup/prompt-text/import');
    } else if (operation.action === 'insert_snippet') {
      const snippet = await readSnippetOptional(operation.identifier);
      if (isApiError(snippet)) return snippet;
      if (!snippet.data) {
        return facadeApiError(
          404,
          `Prompt snippet not found: ${operation.identifier}`,
          'Use manage_items read/list_snippets before inserting.',
          { identifier: operation.identifier },
        );
      }
      const parsed = parseSnippetItems(snippet.data, operation.action);
      if (isApiError(parsed)) return parsed;
      const insertAt = operation.insertAt ?? beforeCount;
      if (insertAt < 0 || insertAt > beforeCount) {
        return facadeApiError(
          400,
          `insertAt must be an integer between 0 and ${beforeCount}`,
          'Use an insertAt value inside the current prompt item bounds.',
          { insertAt, beforeCount },
        );
      }
      const insertedItems = parsed.items.map((item) => duplicatePromptItem(item));
      newItems = [...context.model.items.slice(0, insertAt), ...insertedItems, ...context.model.items.slice(insertAt)];
      baseRoutes.push(...snippet.routes);
      intendedRoute = route('insert_risup_prompt_snippet', 'POST', '/risup/prompt-snippets/insert');
      result = {
        action: operation.action,
        before_count: beforeCount,
        after_count: newItems.length,
        insertAt,
        count: insertedItems.length,
        snippet: snippetSummary(snippet.data),
        items: promptItemSummaries(insertedItems, insertAt),
      };
    } else {
      return facadeApiError(
        400,
        `Unsupported prompt item mutation action: ${operation.action}`,
        'Use add_items, reorder_items, import_text, or insert_snippet for promptTemplate mutations.',
        { operation },
      );
    }

    const newPromptTemplate = serializePromptTemplate({ items: newItems });
    const parsedNew = parsePromptTemplate(newPromptTemplate);
    const warningResult = await collectManageItemsOrderWarnings(target, parsedNew);
    if (isApiError(warningResult)) return warningResult;
    result = {
      ...result,
      prompt_items_digest: promptGuard.value,
      orderWarnings: warningResult.warnings,
    };
    return {
      result,
      newPromptTemplate,
      routes: [
        ...baseRoutes,
        ...warningResult.routes,
        target.kind === 'external'
          ? route('external_write_field', 'POST', '/external/field/promptTemplate')
          : intendedRoute,
      ],
      touched: [context.touchedTarget],
      requiredGuards: [promptGuard],
    };
  }

  async function previewManageItemsOperation(
    target: FacadeV1Target,
    family: ManageItemsFamily,
    operation: ManageItemsOperation,
  ): Promise<
    | {
        result: Record<string, unknown>;
        routes: FacadeRoute[];
        touched: string[];
        requiredGuards: FacadeV1Guard[];
      }
    | ApiErrorResult
  > {
    if (isManageItemsScriptStyleFamily(family)) {
      return previewManageItemsScriptStyleOperation(target, family, operation);
    }

    if (isManageItemsStructuredFamily(family)) {
      return previewManageItemsStructuredOperation(target, family, operation);
    }

    if (['add_items', 'reorder_items', 'import_text', 'insert_snippet'].includes(operation.action)) {
      const plan = await buildManageItemsPromptPlan(target, operation);
      if (isApiError(plan)) return plan;
      return {
        result: { dry_run: true, ...plan.result },
        routes: plan.routes,
        touched: plan.touched,
        requiredGuards: plan.requiredGuards,
      };
    }

    if (operation.action === 'save_snippet') {
      let sourceText = operation.text;
      let promptGuard: FacadeV1Guard | undefined;
      let sourceItems: unknown[] = [];
      const routes: FacadeRoute[] = [];
      const touched: string[] = ['risup:prompt-snippets'];
      if (operation.selector) {
        const context = await readManageItemsPromptContext(target, operation.action);
        if (isApiError(context)) return context;
        const indices = manageItemsSelectorIndices(context.model, operation.selector, operation.action);
        if (!Array.isArray(indices)) return indices;
        sourceText = serializePromptTemplateSubsetToText(context.model, indices);
        promptGuard = promptDigestGuard(context.rawText);
        routes.push(...context.routes);
        touched.push(context.touchedTarget);
        sourceItems = indices.map((index) => risupPromptItemSummary(context.model.items[index], index));
      }
      if (sourceText === undefined) {
        return facadeApiError(
          400,
          'save_snippet requires text or selector',
          'Provide operation.text or operation.selector.',
          { operation },
        );
      }
      const parsed = parsePromptTemplateFromText(sourceText);
      if (parsed.state === 'invalid') {
        return facadeApiError(
          400,
          `Invalid snippet text: ${parsed.parseError}`,
          'Use serializer text from manage_items copy_as_text or export/copy granular routes.',
          { parseError: parsed.parseError },
        );
      }
      const currentSnippet = await readSnippetOptional(operation.name);
      if (isApiError(currentSnippet)) return currentSnippet;
      routes.push(...currentSnippet.routes, route('save_risup_prompt_snippet', 'POST', '/risup/prompt-snippets/save'));
      const snippetGuard = snippetUpdatedAtGuard(snippetUpdatedAt(currentSnippet.data));
      return {
        result: {
          dry_run: true,
          action: operation.action,
          source: operation.selector ? 'selector' : 'text',
          count: parsed.items.length,
          hasUnsupportedContent: parsed.hasUnsupportedContent,
          source_items: sourceItems,
          snippet: snippetSummary(currentSnippet.data),
          prompt_items_digest: promptGuard?.value,
        },
        routes,
        touched,
        requiredGuards: promptGuard ? [promptGuard, snippetGuard] : [snippetGuard],
      };
    }

    if (operation.action === 'delete_snippet') {
      const currentSnippet = await readSnippetOptional(operation.identifier);
      if (isApiError(currentSnippet)) return currentSnippet;
      if (!currentSnippet.data) {
        return facadeApiError(
          404,
          `Prompt snippet not found: ${operation.identifier}`,
          'Use manage_items read/list_snippets before deleting.',
          { identifier: operation.identifier },
        );
      }
      return {
        result: {
          dry_run: true,
          action: operation.action,
          snippet: snippetSummary(currentSnippet.data),
        },
        routes: [
          ...currentSnippet.routes,
          route('delete_risup_prompt_snippet', 'POST', '/risup/prompt-snippets/delete'),
        ],
        touched: ['risup:prompt-snippets'],
        requiredGuards: [snippetUpdatedAtGuard(snippetUpdatedAt(currentSnippet.data))],
      };
    }

    return facadeApiError(
      400,
      `Unsupported manage_items preview action: ${operation.action}`,
      'Preview mode supports add_items, reorder_items, import_text, save_snippet, insert_snippet, and delete_snippet.',
      { operation },
    );
  }

  async function readManageItemsOperation(
    target: FacadeV1Target,
    family: ManageItemsFamily,
    operation: ManageItemsOperation,
  ): Promise<{ result: Record<string, unknown>; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    if (family !== 'risup-prompt') {
      return facadeApiError(
        400,
        `manage_items read mode is not available for ${family}`,
        'Use read_content for structured item summaries.',
        { family, action: operation.action },
        ['read_content'],
      );
    }

    if (operation.action === 'list_snippets') {
      const routePath = '/risup/prompt-snippets';
      const data = await apiRequest('GET', routePath);
      return isApiError(data)
        ? data
        : {
            result: { action: operation.action, ...(asRecord(data) ?? {}) },
            routes: [route('list_risup_prompt_snippets', 'GET', routePath)],
            touched: ['risup:prompt-snippets'],
          };
    }

    if (operation.action === 'read_snippet') {
      const snippet = await readSnippetOptional(operation.identifier);
      if (isApiError(snippet)) return snippet;
      if (!snippet.data) {
        return facadeApiError(
          404,
          `Prompt snippet not found: ${operation.identifier}`,
          'Use manage_items with operation.action="list_snippets" to refresh snippet identifiers.',
          { identifier: operation.identifier },
        );
      }
      return {
        result: { action: operation.action, ...snippet.data },
        routes: snippet.routes,
        touched: ['risup:prompt-snippets'],
      };
    }

    if (operation.action === 'copy_as_text') {
      const context = await readManageItemsPromptContext(target, operation.action);
      if (isApiError(context)) return context;
      const indices = manageItemsSelectorIndices(context.model, operation.selector, operation.action);
      if (!Array.isArray(indices)) return indices;
      const text = serializePromptTemplateSubsetToText(context.model, indices);
      return {
        result: {
          action: operation.action,
          count: indices.length,
          indices,
          text,
          hasUnsupportedContent: indices.some((index) => context.model.items[index].supported === false),
          items: indices.map((index) => risupPromptItemSummary(context.model.items[index], index)),
          prompt_items_digest: promptTemplateDigest(context.rawText),
        },
        routes: context.routes,
        touched: [context.touchedTarget],
      };
    }

    return facadeApiError(
      400,
      `Unsupported manage_items read action: ${operation.action}`,
      'Read mode supports list_snippets, read_snippet, and copy_as_text.',
      { operation },
    );
  }

  async function applyManageItemsOperation(
    target: FacadeV1Target,
    family: ManageItemsFamily,
    operation: ManageItemsOperation,
    guardValues: FacadeV1Guard[] | undefined,
  ): Promise<{ result: Record<string, unknown>; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    if (isManageItemsScriptStyleFamily(family)) {
      return applyManageItemsScriptStyleOperation(target, family, operation, guardValues);
    }

    if (isManageItemsStructuredFamily(family)) {
      return applyManageItemsStructuredOperation(target, family, operation, guardValues);
    }

    if (['add_items', 'reorder_items', 'import_text', 'insert_snippet'].includes(operation.action)) {
      const context = await readManageItemsPromptContext(target, operation.action);
      if (isApiError(context)) return context;
      const promptConflict = checkGuardValue(
        guardValues,
        'expected_prompt_items_digest',
        promptTemplateDigest(context.rawText),
        'Refresh prompt item summaries, then run manage_items preview again.',
      );
      if (promptConflict) return promptConflict;
      const plan = await buildManageItemsPromptPlan(target, operation, context);
      if (isApiError(plan)) return plan;

      if (target.kind === 'external') {
        const routePath = '/external/field/promptTemplate';
        const data = await apiRequest('POST', routePath, {
          file_path: target.file_path,
          content: plan.newPromptTemplate,
        });
        return isApiError(data)
          ? data
          : {
              result: { ...(asRecord(data) ?? {}), ...plan.result },
              routes: plan.routes,
              touched: plan.touched,
            };
      }

      let data: unknown;
      if (operation.action === 'add_items') {
        data =
          operation.items.length === 1
            ? await apiRequest('POST', '/risup/prompt-item/add', {
                item: operation.items[0],
                insertAt: operation.insertAt,
              })
            : await apiRequest('POST', '/risup/prompt-item/batch-add', {
                items: operation.items,
                insertAt: operation.insertAt,
              });
      } else if (operation.action === 'reorder_items') {
        data = operation.order_ids
          ? await apiRequest('POST', '/risup/prompt-item/reorder-by-id', { order_ids: operation.order_ids })
          : await apiRequest('POST', '/risup/prompt-item/reorder', { order: operation.order });
      } else if (operation.action === 'import_text') {
        data = await apiRequest('POST', '/risup/prompt-text/import', {
          text: operation.text,
          mode: operation.import_mode,
          insertAt: operation.insertAt,
        });
      } else if (operation.action === 'insert_snippet') {
        data = await apiRequest('POST', '/risup/prompt-snippets/insert', {
          identifier: operation.identifier,
          insertAt: operation.insertAt,
        });
      } else {
        return facadeApiError(
          400,
          `Unsupported prompt item apply action: ${operation.action}`,
          'Use add_items, reorder_items, import_text, or insert_snippet.',
          { operation },
        );
      }
      return isApiError(data)
        ? data
        : {
            result: { ...(asRecord(data) ?? {}), ...plan.result },
            routes: plan.routes,
            touched: plan.touched,
          };
    }

    if (operation.action === 'save_snippet') {
      let sourceText = operation.text;
      let promptContext: RisupPromptContext | undefined;
      const routes: FacadeRoute[] = [];
      const touched = ['risup:prompt-snippets'];
      if (operation.selector) {
        const context = await readManageItemsPromptContext(target, operation.action);
        if (isApiError(context)) return context;
        promptContext = context;
        const promptConflict = checkGuardValue(
          guardValues,
          'expected_prompt_items_digest',
          promptTemplateDigest(context.rawText),
          'Refresh prompt item summaries, then run manage_items preview again.',
        );
        if (promptConflict) return promptConflict;
        const indices = manageItemsSelectorIndices(context.model, operation.selector, operation.action);
        if (!Array.isArray(indices)) return indices;
        sourceText = serializePromptTemplateSubsetToText(context.model, indices);
        routes.push(...context.routes);
        touched.push(context.touchedTarget);
      }
      if (sourceText === undefined) {
        return facadeApiError(400, 'save_snippet requires text or selector', 'Provide operation.text or selector.');
      }
      const currentSnippet = await readSnippetOptional(operation.name);
      if (isApiError(currentSnippet)) return currentSnippet;
      const snippetConflict = checkGuardValue(
        guardValues,
        'expected_snippet_updated_at',
        snippetUpdatedAt(currentSnippet.data),
        'Refresh snippet metadata, then run manage_items preview again.',
      );
      if (snippetConflict) return snippetConflict;
      const data = await apiRequest('POST', '/risup/prompt-snippets/save', { name: operation.name, text: sourceText });
      return isApiError(data)
        ? data
        : {
            result: {
              ...(asRecord(data) ?? {}),
              action: operation.action,
              prompt_items_digest: promptContext ? promptTemplateDigest(promptContext.rawText) : undefined,
            },
            routes: [
              ...routes,
              ...currentSnippet.routes,
              route('save_risup_prompt_snippet', 'POST', '/risup/prompt-snippets/save'),
            ],
            touched,
          };
    }

    if (operation.action === 'delete_snippet') {
      const currentSnippet = await readSnippetOptional(operation.identifier);
      if (isApiError(currentSnippet)) return currentSnippet;
      if (!currentSnippet.data) {
        return facadeApiError(404, `Prompt snippet not found: ${operation.identifier}`, 'Refresh snippet metadata.');
      }
      const snippetConflict = checkGuardValue(
        guardValues,
        'expected_snippet_updated_at',
        snippetUpdatedAt(currentSnippet.data),
        'Refresh snippet metadata, then run manage_items preview again.',
      );
      if (snippetConflict) return snippetConflict;
      const data = await apiRequest('POST', '/risup/prompt-snippets/delete', { identifier: operation.identifier });
      return isApiError(data)
        ? data
        : {
            result: { ...(asRecord(data) ?? {}), action: operation.action },
            routes: [
              ...currentSnippet.routes,
              route('delete_risup_prompt_snippet', 'POST', '/risup/prompt-snippets/delete'),
            ],
            touched: ['risup:prompt-snippets'],
          };
    }

    return facadeApiError(
      400,
      `Unsupported manage_items apply action: ${operation.action}`,
      'Apply mode requires a preview token for a supported mutating action.',
      { operation },
    );
  }

  return {
    resolveRisupPromptSelectorIndices,
    prepareExternalRisupPromptMutation,
    previewManageItemsOperation,
    readManageItemsOperation,
    applyManageItemsOperation,
  };
}

export type FacadeItemsEngine = ReturnType<typeof createFacadeItemsEngine>;
