import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { FacadeAssetsEngine } from './mcp-facade-assets';
import type { FacadeContentEngine } from './mcp-facade-content';
import type { FacadeEditEngine } from './mcp-facade-edit';
import type { FacadeFilesEngine } from './mcp-facade-files';
import type { FacadeItemsEngine } from './mcp-facade-items';
import {
  asRecord,
  cleanupFacadePreviews,
  facadeApiError,
  facadePreviewStore,
  FACADE_PREVIEW_TTL_MS,
  isApiError,
  makePreviewToken,
  manageAssetsOperationDigest,
  manageAssetsPreviewStore,
  manageFileOperationDigest,
  manageFilePreviewStore,
  manageItemsOperationDigest,
  manageItemsPreviewStore,
  operationDigest,
  recordString,
  route,
  sameTarget,
  selectorTarget,
  type FacadeRoute,
} from './mcp-facade-runtime';
import type { FacadeApiRequest, FacadeScriptStyleEngine } from './mcp-facade-script-style';
import {
  FACADE_V1_CONTRACT_ID,
  FACADE_V1_LIMITS,
  facadeV1AnalyzeContentBodySchema,
  facadeV1AnalyzeOperationSchema,
  facadeV1ContentSelectorSchema,
  facadeV1EditOperationSchema,
  facadeV1GuardSchema,
  facadeV1GuidanceTargetSchema,
  facadeV1SearchDocumentBodySchema,
  facadeV1TargetSchema,
  manageAssetsBodySchema,
  manageAssetsFamilySchema,
  manageAssetsOperationSchema,
  manageFileBodySchema,
  manageFileOperationSchema,
  manageItemsFamilySchema,
  manageItemsOperationSchema,
  type FacadeV1ContentSelector,
  type FacadeV1Guard,
} from './mcp-request-schemas';
import { mcpSuccess } from './mcp-response-envelope';
import type { RuntimeMetadata } from './mcp-runtime-contract';
import { buildToolSurfaceProfileCatalog } from './mcp-tool-taxonomy';
import { MCP_TOOL_DESCRIPTIONS } from './mcp-tool-descriptions';
import { parsePromptTemplate } from './risup-prompt-model';

const DEFAULT_FACADE_READ_MAX_BYTES = 24 * 1024;

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
};
type ToolHandler<TArgs extends Record<string, unknown>> = (args: TArgs) => ToolResult | Promise<ToolResult>;
type SafeToolHandler = <TArgs extends Record<string, unknown>>(
  name: string,
  handler: ToolHandler<TArgs>,
) => ToolHandler<TArgs>;
type ToolProfileCatalogOptions = NonNullable<Parameters<typeof buildToolSurfaceProfileCatalog>[1]>;

export interface FacadeToolRegistrationDeps {
  apiRequest: FacadeApiRequest;
  assets: FacadeAssetsEngine;
  content: FacadeContentEngine;
  edit: FacadeEditEngine;
  files: FacadeFilesEngine;
  items: FacadeItemsEngine;
  scriptStyle: FacadeScriptStyleEngine;
  getRuntimeHealth: () => unknown;
  getRuntimeMetadataForCatalog: () => Promise<RuntimeMetadata>;
  getToolCatalogHealthSummary: () => unknown;
  safeToolHandler: SafeToolHandler;
  textResult: (data: unknown) => ToolResult;
  toolProfileCatalogOptions: () => ToolProfileCatalogOptions;
  withMergedRuntimeMetadata: (session: unknown) => unknown;
}

export function registerFacadeTools(server: McpServer, deps: FacadeToolRegistrationDeps): void {
  const {
    apiRequest,
    assets,
    content,
    edit,
    files,
    items,
    scriptStyle,
    getRuntimeHealth,
    getRuntimeMetadataForCatalog,
    getToolCatalogHealthSummary,
    safeToolHandler,
    textResult,
    toolProfileCatalogOptions,
    withMergedRuntimeMetadata,
  } = deps;
  const { previewManageAssetsOperation, readManageAssetsOperation, applyManageAssetsOperation } = assets;
  const {
    analyzeFacadeOperation,
    applyEditPostEditMetadata,
    boundFacadePayload,
    facadeEnvelope,
    readFacadeSelector,
    referenceEntriesFromResponse,
    resolveReferenceIndex,
    validateFacadeSelectors,
  } = content;
  const { applyFacadeOperation, previewFacadeOperation } = edit;
  const { applyManageFileOperation, previewManageFileOperation, readManageFileOperation } = files;
  const { applyManageItemsOperation, previewManageItemsOperation, readManageItemsOperation } = items;
  const { findRisupPromptItemMatchedFields, readExternalRisupPromptModel, risupPromptItemPreview } = scriptStyle;

  // ===== Facade v1 Tools =====

  server.tool(
    'inspect_document',
    MCP_TOOL_DESCRIPTIONS['inspect_document'],
    {
      target: facadeV1TargetSchema.describe('Explicit facade target discriminator.'),
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    async ({ target, max_bytes }) => {
      const effectiveMaxBytes = max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES;
      if (target.kind === 'active' || target.kind === 'session') {
        const session = await apiRequest('GET', '/session/status');
        if (isApiError(session)) return textResult(session);
        const sessionWithRuntime = withMergedRuntimeMetadata(session);
        const routes = [route('session_status', 'GET', '/session/status')];
        const result: Record<string, unknown> = {
          session: sessionWithRuntime,
          routed_legacy: routes,
          touched_targets: ['session'],
        };
        if (target.kind === 'active') {
          const fields = await apiRequest('GET', '/fields');
          if (isApiError(fields)) return textResult(fields);
          const surfaces = await apiRequest('GET', '/surfaces');
          if (isApiError(surfaces)) return textResult(surfaces);
          routes.push(route('list_fields', 'GET', '/fields'), route('list_surfaces', 'GET', '/surfaces'));
          result.fields = fields;
          result.surfaces = surfaces;
          result.touched_targets = ['active'];
        }
        return textResult(
          facadeEnvelope(
            'inspect_document',
            'read-only',
            target,
            result,
            target.kind === 'active' ? 'Inspected active document facade target' : 'Inspected session facade target',
            ['read_content', 'search_document', 'preview_edit'],
            { routed_tools: routes.map((entry) => entry.tool), touched_targets: result.touched_targets },
            effectiveMaxBytes,
          ),
        );
      }

      if (target.kind === 'external') {
        const data = await apiRequest('POST', '/external/inspect', { file_path: target.file_path });
        if (isApiError(data)) return textResult(data);
        const routes = [route('inspect_external_file', 'POST', '/external/inspect')];
        return textResult(
          facadeEnvelope(
            'inspect_document',
            'read-only',
            target,
            { external: data, routed_legacy: routes, touched_targets: [`external:${target.file_path}`] },
            'Inspected external document facade target',
            ['read_content', 'search_document'],
            { routed_tools: routes.map((entry) => entry.tool), touched_targets: [`external:${target.file_path}`] },
            effectiveMaxBytes,
          ),
        );
      }

      if (target.kind === 'reference') {
        const refs = await apiRequest('GET', '/references');
        if (isApiError(refs)) return textResult(refs);
        const routes = [route('list_references', 'GET', '/references')];
        const files = referenceEntriesFromResponse(refs);
        if (!target.reference_id && !target.file_path) {
          return textResult(
            facadeEnvelope(
              'inspect_document',
              'read-only',
              target,
              { references: refs, routed_legacy: routes, touched_targets: ['references'] },
              `Inspected ${files.length} reference facade target(s)`,
              ['read_content', 'search_document'],
              { routed_tools: routes.map((entry) => entry.tool), touched_targets: ['references'] },
              effectiveMaxBytes,
            ),
          );
        }
        const index = await resolveReferenceIndex(target);
        if (typeof index !== 'number') return textResult(index);
        const selected = files[index];
        if (!selected) {
          return textResult(
            facadeApiError(
              404,
              'Reference target not found',
              'Inspect the reference inventory and retry with a valid id.',
            ),
          );
        }
        return textResult(
          facadeEnvelope(
            'inspect_document',
            'read-only',
            target,
            {
              reference_index: index,
              reference: selected,
              routed_legacy: routes,
              touched_targets: [`reference:${index}`],
            },
            `Inspected reference ${index} facade target`,
            ['read_content', 'search_document'],
            { routed_tools: routes.map((entry) => entry.tool), touched_targets: [`reference:${index}`] },
            effectiveMaxBytes,
          ),
        );
      }

      if (target.kind === 'guidance') {
        const routePath = target.skill
          ? `/skills/${encodeURIComponent(target.skill)}${target.document ? `/${encodeURIComponent(target.document)}` : ''}`
          : '/skills';
        const data = await apiRequest('GET', routePath);
        if (isApiError(data)) return textResult(data);
        const routes = [route(target.skill ? 'read_skill' : 'list_skills', 'GET', routePath)];
        return textResult(
          facadeEnvelope(
            'inspect_document',
            'read-only',
            target,
            { guidance: data, routed_legacy: routes, touched_targets: ['guidance'] },
            'Inspected guidance facade target',
            ['read_content'],
            { routed_tools: routes.map((entry) => entry.tool), touched_targets: ['guidance'] },
            effectiveMaxBytes,
          ),
        );
      }

      return textResult(
        facadeApiError(
          400,
          'Unsupported inspect_document target',
          'Use active, external, reference, guidance, or session.',
        ),
      );
    },
  );

  server.tool(
    'list_tool_profiles',
    MCP_TOOL_DESCRIPTIONS['list_tool_profiles'],
    {
      profile: z
        .string()
        .optional()
        .describe(
          'Profile catalog to return. Defaults to facade-first. Valid profiles: facade-first, authoring, readonly, advanced-full; aliases: advanced, full.',
        ),
    },
    async ({ profile }) => {
      const catalog = buildToolSurfaceProfileCatalog(profile, toolProfileCatalogOptions());
      if (!catalog) {
        return textResult(
          facadeApiError(
            400,
            `Unknown tool profile: ${profile}`,
            'Use facade-first, authoring, readonly, advanced-full, or aliases advanced/full.',
          ),
        );
      }
      const runtime = await getRuntimeMetadataForCatalog();
      const runtimeHealth = getRuntimeHealth();
      const health = getToolCatalogHealthSummary();
      const skewSummary = runtime.skew.detected ? ` Runtime skew detected: ${runtime.skew.warnings.join('; ')}` : '';
      return textResult(
        mcpSuccess(
          {
            profile: catalog,
            runtime,
            runtimeHealth,
            health,
          },
          {
            toolName: 'list_tool_profiles',
            summary: `Returned ${catalog.counts.profileTools} tools for ${catalog.resolvedProfile} profile${skewSummary}`,
            nextActions: catalog.legacyEscapeHatch ? ['list_tool_profiles', 'tools/list'] : ['tools/list'],
            artifacts: {
              profile: catalog.resolvedProfile,
              filtering_status: catalog.filteringStatus,
              tools_list_behavior: catalog.toolsListBehavior,
              tool_count: catalog.counts.profileTools,
              all_tool_count: catalog.counts.allTools,
              registered_tool_count: catalog.counts.registeredTools,
              hidden_from_tools_list: catalog.counts.hiddenFromToolsList,
              runtime_mode: runtime.runtimeMode,
              runtime_health: runtimeHealth,
              runtime_skew_detected: runtime.skew.detected,
              runtime_skew_warnings: runtime.skew.warnings,
              catalog_health: health,
            },
          },
        ),
      );
    },
  );

  server.tool(
    'read_content',
    MCP_TOOL_DESCRIPTIONS['read_content'],
    {
      target: facadeV1TargetSchema.describe('Explicit facade target discriminator.'),
      selectors: z.array(facadeV1ContentSelectorSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    async ({ target, selectors, max_bytes }) => {
      const actualSelectors: FacadeV1ContentSelector[] =
        selectors && selectors.length > 0 ? selectors : [{ family: 'surface', path: '/' }];
      const effectiveMaxBytes = max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES;
      const results: unknown[] = [];
      const routes: FacadeRoute[] = [];
      const touchedTargets: string[] = [];
      for (const selector of actualSelectors) {
        if (
          (selector.family === 'surface' || selector.path) &&
          (selector.path === undefined || selector.path === '/' || selector.path === '') &&
          selector.include_raw === true &&
          max_bytes === undefined
        ) {
          return textResult(
            facadeApiError(
              400,
              'Raw root surface reads require an explicit max_bytes',
              'Use the default overview, choose a narrower selector.path, or pass max_bytes with selector.include_raw=true.',
              { selector, default_max_bytes: DEFAULT_FACADE_READ_MAX_BYTES },
              ['read_content', 'search_document'],
            ),
          );
        }
        const read = await readFacadeSelector(target, selector);
        if (isApiError(read)) return textResult(read);
        results.push({ selector, data: read.data });
        routes.push(...read.routes);
        touchedTargets.push(selectorTarget(selector));
      }
      const hasOverviewRead = results.some((item) => asRecord(asRecord(item)?.data)?.raw_omitted === true);
      return textResult(
        facadeEnvelope(
          'read_content',
          'read-only',
          target,
          { items: results, routed_legacy: routes, touched_targets: touchedTargets },
          `Read ${results.length} facade selector(s)`,
          ['search_document', 'preview_edit'],
          {
            count: results.length,
            routed_tools: routes.map((entry) => entry.tool),
            touched_targets: touchedTargets,
            ...(hasOverviewRead
              ? {
                  continuation_hint:
                    'Root surface raw JSON is omitted by default. Choose a narrower selector or use include_raw with explicit max_bytes only when raw root JSON is required.',
                  recommended_follow_up_selectors: [
                    { family: 'field', field: '<fieldName>' },
                    { family: 'surface', path: '/<json-pointer>' },
                  ],
                }
              : {}),
          },
          effectiveMaxBytes,
        ),
      );
    },
  );

  server.tool(
    'search_document',
    MCP_TOOL_DESCRIPTIONS['search_document'],
    {
      target: facadeV1TargetSchema.describe('Explicit facade target discriminator.'),
      query: z.string().min(1),
      selector: facadeV1ContentSelectorSchema.optional().describe('Preferred field or risup-prompt selector.'),
      field: z.string().optional().describe('Deprecated alias for selector.field.'),
      regex: z.boolean().optional(),
      flags: z.string().optional(),
      context_chars: z.number().optional(),
      max_matches: z.number().int().positive().max(FACADE_V1_LIMITS.maxMatches).optional(),
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    async ({ target, query, selector, field, regex, flags, context_chars, max_matches, max_bytes }) => {
      const parsed = facadeV1SearchDocumentBodySchema.safeParse({
        target,
        query,
        selector,
        field,
        regex,
        flags,
        context_chars,
        max_matches,
        max_bytes,
      });
      if (!parsed.success) {
        return textResult(
          facadeApiError(
            400,
            'Invalid search_document request',
            parsed.error.issues.map((issue) => issue.message).join('; '),
            { issues: parsed.error.issues },
          ),
        );
      }
      let data: unknown;
      let routes: FacadeRoute[];
      const effectiveSelector =
        selector ?? (field ? { family: field === 'risup-prompt' ? 'risup-prompt' : 'field', field } : undefined);
      const selectedFamily = effectiveSelector?.family;
      const selectedField = effectiveSelector?.field ?? field;
      const body = { query, regex, flags, context_chars, max_matches };
      if (target.kind === 'active' && selectedFamily === 'risup-prompt') {
        if (regex) {
          return textResult(
            facadeApiError(
              400,
              'Unsupported risup-prompt search selector',
              'Active risup-prompt facade search routes only literal substring queries to search_in_risup_prompt_items; omit regex or use the granular tool directly.',
            ),
          );
        }
        data = await apiRequest('POST', '/risup/prompt-items/search', { query });
        if (!isApiError(data)) {
          const promptSearch = asRecord(data);
          const promptMatches = Array.isArray(promptSearch?.matches) ? promptSearch.matches : [];
          const boundedMatches = promptMatches.slice(0, max_matches ?? FACADE_V1_LIMITS.maxMatches);
          data = {
            ...(promptSearch ?? {}),
            count: boundedMatches.length,
            totalMatches: promptMatches.length,
            returnedMatches: boundedMatches.length,
            matches: boundedMatches,
          };
        }
        routes = [route('search_in_risup_prompt_items', 'POST', '/risup/prompt-items/search')];
      } else if (target.kind === 'active' && selectedFamily === 'field' && selectedField) {
        const routePath = `/field/${encodeURIComponent(selectedField)}/search`;
        data = await apiRequest('POST', routePath, body);
        routes = [route('search_in_field', 'POST', routePath)];
      } else if (target.kind === 'active') {
        data = await apiRequest('POST', '/search-all', {
          query,
          regex,
          flags,
          context_chars,
          max_matches_total: max_matches,
        });
        routes = [route('search_all_fields', 'POST', '/search-all')];
      } else if (target.kind === 'external' && selectedFamily === 'risup-prompt') {
        if (regex) {
          return textResult(
            facadeApiError(
              400,
              'Unsupported external risup-prompt regex search',
              'External risup-prompt facade search supports literal substring queries; omit regex or use a granular raw field search.',
            ),
          );
        }
        const externalPrompt = await readExternalRisupPromptModel(target.file_path);
        if (isApiError(externalPrompt)) return textResult(externalPrompt);
        const matches = externalPrompt.model.items
          .map((item, index) => {
            const matchedFields = findRisupPromptItemMatchedFields(item, query);
            if (matchedFields.length === 0) return null;
            return {
              index,
              id: item.id ?? null,
              type: item.type ?? null,
              supported: item.supported,
              preview: risupPromptItemPreview(item),
              matched_fields: matchedFields,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .slice(0, max_matches ?? FACADE_V1_LIMITS.maxMatches);
        data = { query, count: matches.length, matches };
        routes = externalPrompt.routes;
      } else if (target.kind === 'external' && selectedField) {
        const routePath = `/external/field/${encodeURIComponent(selectedField)}/search`;
        data = await apiRequest('POST', routePath, { ...body, file_path: target.file_path });
        routes = [route('external_search_in_field', 'POST', routePath)];
      } else if (target.kind === 'reference' && selectedFamily === 'risup-prompt') {
        if (regex) {
          return textResult(
            facadeApiError(
              400,
              'Unsupported reference risup-prompt regex search',
              'Reference risup-prompt facade search supports literal substring queries; omit regex or search promptTemplate as a field.',
            ),
          );
        }
        const index = await resolveReferenceIndex(target);
        if (typeof index !== 'number') return textResult(index);
        const routePath = `/reference/${index}/promptTemplate`;
        const read = await apiRequest('GET', routePath);
        if (isApiError(read)) return textResult(read);
        const rawText = recordString(asRecord(read), 'content');
        if (rawText === undefined) {
          return textResult(
            facadeApiError(
              400,
              'Reference promptTemplate is not a string',
              'Inspect the selected reference and repair promptTemplate before using risup-prompt search.',
              { reference_index: index },
            ),
          );
        }
        const model = parsePromptTemplate(rawText);
        if (model.state === 'invalid') {
          return textResult(
            facadeApiError(
              400,
              `Invalid reference promptTemplate: ${model.parseError}`,
              'Read the reference promptTemplate field and repair it before retrying.',
              { reference_index: index, parseError: model.parseError },
            ),
          );
        }
        const matches = model.items
          .map((item, itemIndex) => {
            const matchedFields = findRisupPromptItemMatchedFields(item, query);
            if (matchedFields.length === 0) return null;
            return {
              index: itemIndex,
              id: item.id ?? null,
              type: item.type ?? null,
              supported: item.supported,
              preview: risupPromptItemPreview(item),
              matched_fields: matchedFields,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .slice(0, max_matches ?? FACADE_V1_LIMITS.maxMatches);
        data = { query, count: matches.length, matches };
        routes = [route('read_reference_field', 'GET', routePath)];
      } else if (target.kind === 'reference' && selectedField) {
        const index = await resolveReferenceIndex(target);
        if (typeof index !== 'number') return textResult(index);
        const routePath = `/reference/${index}/field/${encodeURIComponent(selectedField)}/search`;
        data = await apiRequest('POST', routePath, body);
        routes = [route('search_in_reference_field', 'POST', routePath)];
      } else {
        return textResult(
          facadeApiError(
            400,
            `Unsupported search_document target kind "${target.kind}"`,
            'search_document supports active targets directly; external/reference targets require a field argument.',
          ),
        );
      }
      if (isApiError(data)) return textResult(data);
      return textResult(
        facadeEnvelope(
          'search_document',
          'read-only',
          target,
          {
            search: data,
            routed_legacy: routes,
            touched_targets:
              selectedFamily === 'risup-prompt'
                ? ['risup-prompt']
                : selectedField
                  ? [`field:${selectedField}`]
                  : ['active'],
            ...(field ? { deprecated_field_alias_used: true } : {}),
          },
          `Searched facade target for "${query}"`,
          ['read_content', 'preview_edit'],
          {
            routed_tools: routes.map((entry) => entry.tool),
            touched_targets:
              selectedFamily === 'risup-prompt'
                ? ['risup-prompt']
                : selectedField
                  ? [`field:${selectedField}`]
                  : ['active'],
          },
          max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
        ),
      );
    },
  );

  server.tool(
    'analyze_content',
    MCP_TOOL_DESCRIPTIONS['analyze_content'],
    {
      target: facadeV1TargetSchema.describe(
        'Use active for document analysis. Danbooru database operations also accept session.',
      ),
      operation: facadeV1AnalyzeOperationSchema,
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    safeToolHandler('analyze_content', async ({ target, operation, max_bytes }) => {
      const parsed = facadeV1AnalyzeContentBodySchema.safeParse({ target, operation, max_bytes });
      if (!parsed.success) {
        return textResult(
          facadeApiError(
            400,
            'Invalid analyze_content request',
            parsed.error.issues.map((issue) => issue.message).join('; '),
            { issues: parsed.error.issues },
            ['analyze_content'],
          ),
        );
      }
      const analysis = await analyzeFacadeOperation(parsed.data.target, parsed.data.operation);
      if (isApiError(analysis)) return textResult(analysis);
      return textResult(
        facadeEnvelope(
          'analyze_content',
          'read-only',
          parsed.data.target,
          {
            operation: parsed.data.operation,
            analysis: analysis.data,
            routed_legacy: analysis.routes,
            touched_targets: analysis.touchedTargets,
          },
          `Analyzed ${parsed.data.operation.action}`,
          ['read_content', 'validate_content', 'analyze_content'],
          {
            operation: parsed.data.operation.action,
            routed_tools: analysis.routes.map((entry) => entry.tool),
            touched_targets: analysis.touchedTargets,
          },
          parsed.data.max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
        ),
      );
    }),
  );

  server.tool(
    'validate_content',
    MCP_TOOL_DESCRIPTIONS['validate_content'],
    {
      target: facadeV1TargetSchema.describe(
        'Explicit facade target discriminator. Supports active artifact validation, external .charx export compatibility checks, external .risup prompt checks, and external Plugin v3 source scans.',
      ),
      selectors: z.array(facadeV1ContentSelectorSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    async ({ target, selectors, max_bytes }) => {
      const validation = await validateFacadeSelectors(target, selectors);
      if (isApiError(validation)) return textResult(validation);
      return textResult(
        facadeEnvelope(
          'validate_content',
          'read-only',
          target,
          validation.result,
          `Validated ${validation.touchedTargets.join(', ')} facade content`,
          ['read_content', 'preview_edit'],
          {
            routed_tools: validation.routes.map((entry) => entry.tool),
            touched_targets: validation.touchedTargets,
          },
          max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
        ),
      );
    },
  );

  server.tool(
    'load_guidance',
    MCP_TOOL_DESCRIPTIONS['load_guidance'],
    {
      target: facadeV1GuidanceTargetSchema,
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    async ({ target, max_bytes }) => {
      const effectiveMaxBytes = max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES;
      const requestedSkill =
        target.skill === 'plugin-v3' || target.skill === 'plugins-v3' || target.document === 'plugin-v3'
          ? 'writing-plugins-v3'
          : target.skill;
      const routePath = requestedSkill
        ? `/skills/${encodeURIComponent(requestedSkill)}${target.document && target.document !== 'plugin-v3' ? `/${encodeURIComponent(target.document)}` : ''}`
        : '/skills';
      const data = await apiRequest('GET', routePath);
      if (isApiError(data)) return textResult(data);
      const routes = [route(requestedSkill ? 'read_skill' : 'list_skills', 'GET', routePath)];
      return textResult(
        facadeEnvelope(
          'load_guidance',
          'read-only',
          target,
          { guidance: data, routed_legacy: routes, touched_targets: ['guidance'] },
          requestedSkill ? `Loaded guidance for ${requestedSkill}` : 'Loaded guidance catalog',
          ['read_content', 'search_document'],
          {
            routed_tools: routes.map((entry) => entry.tool),
            touched_targets: ['guidance'],
            ...(requestedSkill === 'writing-plugins-v3'
              ? { source_workflow: true, note: '.js/.ts plugin files are source files, not MCP artifacts.' }
              : {}),
          },
          effectiveMaxBytes,
        ),
      );
    },
  );

  server.tool(
    'preview_edit',
    MCP_TOOL_DESCRIPTIONS['preview_edit'],
    {
      target: facadeV1TargetSchema.describe(
        'Explicit facade target discriminator. Supports active edits plus external field replace/write and surface patch/replace previews.',
      ),
      operations: z.array(facadeV1EditOperationSchema).min(1).max(FACADE_V1_LIMITS.maxBatchItems),
      dry_run: z.boolean().optional(),
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    safeToolHandler('preview_edit', async ({ target, operations, max_bytes }) => {
      cleanupFacadePreviews();
      const previews: unknown[] = [];
      const routes: FacadeRoute[] = [];
      const touchedTargets: string[] = [];
      const requiredGuards: FacadeV1Guard[] = [];
      for (const operation of operations) {
        const preview = await previewFacadeOperation(target, operation);
        if (isApiError(preview)) return textResult(preview);
        if (preview.requiredGuards.length > 0) operation.guards = preview.requiredGuards;
        previews.push({ operation: operation.op, selector: operation.selector, data: preview.data });
        routes.push(...preview.routes);
        touchedTargets.push(...preview.touched);
        requiredGuards.push(...preview.requiredGuards);
      }
      const digest = operationDigest(target, operations);
      const token = makePreviewToken();
      const expiresAtMs = Date.now() + FACADE_PREVIEW_TTL_MS;
      facadePreviewStore.set(token, {
        token,
        operationDigest: digest,
        target,
        operations,
        routes,
        touchedTargets,
        requiredGuards,
        expiresAtMs,
      });
      return textResult(
        boundFacadePayload(
          mcpSuccess(
            {
              facade: {
                contract: FACADE_V1_CONTRACT_ID,
                version: 'v1',
                tool: 'preview_edit',
                mutability: 'preview',
                target,
                ...(max_bytes ? { max_bytes } : {}),
              },
              result: {
                previews,
                routed_legacy: routes,
                touched_targets: touchedTargets,
                guard_values: requiredGuards,
              },
              preview: {
                preview_token: token,
                operation_digest: digest,
                expires_at: new Date(expiresAtMs).toISOString(),
                required_guards: requiredGuards,
              },
            },
            {
              toolName: 'preview_edit',
              summary: `Previewed ${operations.length} facade edit operation(s)`,
              nextActions: ['apply_edit', 'read_content'],
              artifacts: {
                count: operations.length,
                routed_tools: routes.map((entry) => entry.tool),
                touched_targets: touchedTargets,
              },
            },
          ),
          max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
        ),
      );
    }),
  );

  server.tool(
    'apply_edit',
    MCP_TOOL_DESCRIPTIONS['apply_edit'],
    {
      preview_token: z.string().regex(/^facade-preview-v1\.[A-Za-z0-9._-]{16,}$/),
      operation_digest: z.string().min(16),
      target: facadeV1TargetSchema.describe('Must match the target used for preview_edit.'),
      guard_values: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    safeToolHandler('apply_edit', async ({ preview_token, operation_digest, target, guard_values, max_bytes }) => {
      cleanupFacadePreviews();
      const entry = facadePreviewStore.get(preview_token);
      if (!entry) {
        return textResult(
          facadeApiError(
            404,
            'Unknown or expired preview token',
            'Preview tokens are one-shot, held only in this MCP server process memory, and expire after 10 minutes or when the server restarts. Run preview_edit again, then retry apply_edit with the new token.',
          ),
        );
      }
      if (entry.operationDigest !== operation_digest || !sameTarget(entry.target, target)) {
        return textResult(
          facadeApiError(
            409,
            'Preview token does not match operation digest or target',
            'Use the exact operation_digest and target returned by preview_edit.',
          ),
        );
      }
      facadePreviewStore.delete(preview_token);
      const results: unknown[] = [];
      const routes: FacadeRoute[] = [];
      const touchedTargets: string[] = [];
      for (let operationIndex = 0; operationIndex < entry.operations.length; operationIndex++) {
        const operation = entry.operations[operationIndex];
        const applied = await applyFacadeOperation(entry.target, operation, guard_values);
        if (isApiError(applied)) {
          const cause = asRecord(applied) ?? {};
          return textResult(
            facadeApiError(
              typeof cause.status === 'number' ? cause.status : 409,
              recordString(cause, 'error') ?? 'Facade edit operation failed',
              recordString(cause, 'suggestion') ??
                'Inspect the document state, then run preview_edit again before retrying.',
              {
                preview_token_consumed: true,
                partial: results.length > 0,
                applied_count: results.length,
                applied: results,
                failed_operation: {
                  index: operationIndex,
                  op: operation.op,
                  selector: operation.selector,
                },
                remaining_count: entry.operations.length - operationIndex - 1,
                cause: cause.details ?? cause,
              },
              ['inspect_document', 'read_content', 'preview_edit'],
            ),
          );
        }
        results.push({ operation: operation.op, selector: operation.selector, data: applied.data });
        routes.push(...applied.routes);
        touchedTargets.push(...applied.touched);
      }
      const postEdit = applyEditPostEditMetadata(entry);
      return textResult(
        facadeEnvelope(
          'apply_edit',
          'mutating',
          target,
          {
            applied: results,
            routed_legacy: routes,
            touched_targets: touchedTargets,
            guard_values: guard_values ?? entry.requiredGuards,
            preview_token,
            operation_digest,
          },
          `Applied ${results.length} facade edit operation(s)`,
          postEdit.nextActions,
          {
            count: results.length,
            routed_tools: routes.map((routeEntry) => routeEntry.tool),
            touched_targets: touchedTargets,
            ...postEdit.artifacts,
          },
          max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
        ),
      );
    }),
  );

  server.tool(
    'manage_items',
    MCP_TOOL_DESCRIPTIONS['manage_items'],
    {
      target: facadeV1TargetSchema.describe(
        'Use target.kind="active" for the current file or "external" for an unopened .charx/.risum/.risup file.',
      ),
      family: manageItemsFamilySchema,
      mode: z.enum(['read', 'preview', 'apply']),
      operation: manageItemsOperationSchema.optional(),
      preview_token: z
        .string()
        .regex(/^facade-preview-v1\.[A-Za-z0-9._-]{16,}$/)
        .optional(),
      operation_digest: z.string().min(16).optional(),
      guard_values: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    safeToolHandler(
      'manage_items',
      async ({ target, family, mode, operation, preview_token, operation_digest, guard_values, max_bytes }) => {
        cleanupFacadePreviews();
        if (target.kind !== 'active' && target.kind !== 'external') {
          return textResult(
            facadeApiError(
              400,
              'manage_items supports only active or external targets',
              'Use target.kind="active" for the current file or target.kind="external" for an unopened .charx/.risum/.risup file.',
              { target },
              ['inspect_document'],
            ),
          );
        }
        if (mode === 'read') {
          if (!operation) {
            return textResult(
              facadeApiError(400, 'manage_items read mode requires operation', 'Provide a read operation.'),
            );
          }
          const read = await readManageItemsOperation(target, family, operation);
          if (isApiError(read)) return textResult(read);
          return textResult(
            facadeEnvelope(
              'manage_items',
              'read-only',
              target,
              { ...read.result, routed_legacy: read.routes, touched_targets: read.touched },
              `Read manage_items ${family} ${operation.action}`,
              ['manage_items', 'read_content'],
              {
                family,
                routed_tools: read.routes.map((entry) => entry.tool),
                touched_targets: read.touched,
              },
              max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
            ),
          );
        }

        if (mode === 'preview') {
          if (!operation) {
            return textResult(
              facadeApiError(400, 'manage_items preview mode requires operation', 'Provide a mutating operation.'),
            );
          }
          const preview = await previewManageItemsOperation(target, family, operation);
          if (isApiError(preview)) return textResult(preview);
          const digest = manageItemsOperationDigest(target, family, operation);
          const token = makePreviewToken();
          const expiresAtMs = Date.now() + FACADE_PREVIEW_TTL_MS;
          manageItemsPreviewStore.set(token, {
            token,
            operationDigest: digest,
            target,
            family,
            operation,
            routes: preview.routes,
            touchedTargets: preview.touched,
            requiredGuards: preview.requiredGuards,
            expiresAtMs,
          });
          return textResult(
            boundFacadePayload(
              mcpSuccess(
                {
                  facade: {
                    contract: FACADE_V1_CONTRACT_ID,
                    version: 'v1',
                    tool: 'manage_items',
                    mutability: 'preview',
                    target,
                    family,
                    ...(max_bytes ? { max_bytes } : {}),
                  },
                  result: {
                    ...preview.result,
                    routed_legacy: preview.routes,
                    touched_targets: preview.touched,
                    guard_values: preview.requiredGuards,
                  },
                  preview: {
                    preview_token: token,
                    operation_digest: digest,
                    expires_at: new Date(expiresAtMs).toISOString(),
                    required_guards: preview.requiredGuards,
                  },
                },
                {
                  toolName: 'manage_items',
                  summary: `Previewed manage_items ${family} ${operation.action}`,
                  nextActions: ['manage_items', 'read_content', 'validate_content'],
                  artifacts: {
                    family,
                    action: operation.action,
                    routed_tools: preview.routes.map((entry) => entry.tool),
                    touched_targets: preview.touched,
                  },
                },
              ),
              max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
            ),
          );
        }

        if (!preview_token || !operation_digest) {
          return textResult(
            facadeApiError(
              400,
              'manage_items apply mode requires preview_token and operation_digest',
              'Run manage_items with mode="preview", then pass the returned preview token and digest.',
            ),
          );
        }
        if (!guard_values || guard_values.length === 0) {
          return textResult(
            facadeApiError(
              400,
              'manage_items apply mode requires guard_values',
              'Pass the required_guards array returned by manage_items preview.',
            ),
          );
        }
        const entry = manageItemsPreviewStore.get(preview_token);
        if (!entry) {
          return textResult(
            facadeApiError(
              404,
              'Unknown or expired manage_items preview token',
              'Preview tokens are one-shot, held only in this MCP server process memory, and expire after 10 minutes or when the server restarts. Run manage_items preview again, then retry apply with the new token.',
            ),
          );
        }
        if (
          entry.operationDigest !== operation_digest ||
          !sameTarget(entry.target, target) ||
          entry.family !== family
        ) {
          return textResult(
            facadeApiError(
              409,
              'manage_items preview token does not match operation digest, target, or family',
              'Use the exact operation_digest, target, and family returned by manage_items preview.',
            ),
          );
        }
        manageItemsPreviewStore.delete(preview_token);
        const applied = await applyManageItemsOperation(target, entry.family, entry.operation, guard_values);
        if (isApiError(applied)) return textResult(applied);
        return textResult(
          facadeEnvelope(
            'manage_items',
            'mutating',
            target,
            {
              ...applied.result,
              routed_legacy: applied.routes,
              touched_targets: applied.touched,
              family: entry.family,
              guard_values,
              preview_token,
              operation_digest,
            },
            `Applied manage_items ${entry.family} ${entry.operation.action}`,
            ['read_content', 'validate_content', 'manage_items'],
            {
              family: entry.family,
              action: entry.operation.action,
              routed_tools: applied.routes.map((routeEntry) => routeEntry.tool),
              touched_targets: applied.touched,
            },
            max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
          ),
        );
      },
    ),
  );

  server.tool(
    'manage_assets',
    MCP_TOOL_DESCRIPTIONS['manage_assets'],
    {
      target: facadeV1TargetSchema.describe(
        'Use target.kind="active" for the current file or "external" for an unopened .charx/.risum file.',
      ),
      asset_family: manageAssetsFamilySchema.optional(),
      mode: z.enum(['read', 'preview', 'apply']),
      operation: manageAssetsOperationSchema.optional(),
      preview_token: z
        .string()
        .regex(/^facade-preview-v1\.[A-Za-z0-9._-]{16,}$/)
        .optional(),
      operation_digest: z.string().min(16).optional(),
      guard_values: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    safeToolHandler(
      'manage_assets',
      async ({ target, asset_family, mode, operation, preview_token, operation_digest, guard_values, max_bytes }) => {
        cleanupFacadePreviews();
        const parsed = manageAssetsBodySchema.safeParse({
          target,
          asset_family,
          mode,
          operation,
          preview_token,
          operation_digest,
          guard_values,
          max_bytes,
        });
        if (!parsed.success) {
          return textResult(
            facadeApiError(
              400,
              'Invalid manage_assets request',
              parsed.error.issues.map((issue) => issue.message).join('; '),
              { issues: parsed.error.issues },
              ['manage_assets'],
            ),
          );
        }
        const body = parsed.data;
        const requestedFamily = body.asset_family ?? 'auto';

        if (body.mode === 'read') {
          const read = await readManageAssetsOperation(body.target, requestedFamily, body.operation!);
          if (isApiError(read)) return textResult(read);
          return textResult(
            facadeEnvelope(
              'manage_assets',
              'read-only',
              body.target,
              { ...read.result, routed_legacy: read.routes, touched_targets: read.touched },
              `Read manage_assets ${read.result.family ?? requestedFamily} ${body.operation!.action}`,
              ['manage_assets', 'read_content'],
              {
                family: read.result.family ?? requestedFamily,
                routed_tools: read.routes.map((entry) => entry.tool),
                touched_targets: read.touched,
              },
              body.max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
            ),
          );
        }

        if (body.mode === 'preview') {
          const preview = await previewManageAssetsOperation(body.target, requestedFamily, body.operation!);
          if (isApiError(preview)) return textResult(preview);
          const digest = manageAssetsOperationDigest(body.target, requestedFamily, body.operation!);
          const token = makePreviewToken();
          const expiresAtMs = Date.now() + FACADE_PREVIEW_TTL_MS;
          manageAssetsPreviewStore.set(token, {
            token,
            operationDigest: digest,
            target: body.target,
            assetFamily: requestedFamily,
            operation: body.operation!,
            routes: preview.routes,
            touchedTargets: preview.touched,
            requiredGuards: preview.requiredGuards,
            expiresAtMs,
          });
          return textResult(
            boundFacadePayload(
              mcpSuccess(
                {
                  facade: {
                    contract: FACADE_V1_CONTRACT_ID,
                    version: 'v1',
                    tool: 'manage_assets',
                    mutability: 'preview',
                    target: body.target,
                    asset_family: requestedFamily,
                    ...(body.max_bytes ? { max_bytes: body.max_bytes } : {}),
                  },
                  result: {
                    ...preview.result,
                    routed_legacy: preview.routes,
                    touched_targets: preview.touched,
                    guard_values: preview.requiredGuards,
                  },
                  preview: {
                    preview_token: token,
                    operation_digest: digest,
                    expires_at: new Date(expiresAtMs).toISOString(),
                    required_guards: preview.requiredGuards,
                  },
                },
                {
                  toolName: 'manage_assets',
                  summary: `Previewed manage_assets ${preview.result.family ?? requestedFamily} ${body.operation!.action}`,
                  nextActions: ['manage_assets', 'read_content', 'validate_content'],
                  artifacts: {
                    family: preview.result.family ?? requestedFamily,
                    action: body.operation!.action,
                    routed_tools: preview.routes.map((entry) => entry.tool),
                    touched_targets: preview.touched,
                  },
                },
              ),
              body.max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
            ),
          );
        }

        const entry = manageAssetsPreviewStore.get(body.preview_token!);
        if (!entry) {
          return textResult(
            facadeApiError(
              404,
              'Unknown or expired manage_assets preview token',
              'Preview tokens are one-shot, held only in this MCP server process memory, and expire after 10 minutes or when the server restarts. Run manage_assets preview again, then retry apply with the new token.',
            ),
          );
        }
        if (
          entry.operationDigest !== body.operation_digest ||
          !sameTarget(entry.target, body.target) ||
          entry.assetFamily !== requestedFamily
        ) {
          return textResult(
            facadeApiError(
              409,
              'manage_assets preview token does not match operation digest, target, or asset_family',
              'Use the exact operation_digest, target, and asset_family returned by manage_assets preview.',
            ),
          );
        }
        manageAssetsPreviewStore.delete(body.preview_token!);
        const applied = await applyManageAssetsOperation(
          body.target,
          entry.assetFamily ?? 'auto',
          entry.operation,
          body.guard_values,
        );
        if (isApiError(applied)) return textResult(applied);
        return textResult(
          facadeEnvelope(
            'manage_assets',
            'mutating',
            body.target,
            {
              ...applied.result,
              routed_legacy: applied.routes,
              touched_targets: applied.touched,
              asset_family: entry.assetFamily,
              guard_values: body.guard_values,
              preview_token: body.preview_token,
              operation_digest: body.operation_digest,
            },
            `Applied manage_assets ${applied.result.family ?? entry.assetFamily} ${entry.operation.action}`,
            ['read_content', 'validate_content', 'manage_assets'],
            {
              family: applied.result.family ?? entry.assetFamily,
              action: entry.operation.action,
              routed_tools: applied.routes.map((routeEntry) => routeEntry.tool),
              touched_targets: applied.touched,
            },
            body.max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
          ),
        );
      },
    ),
  );

  server.tool(
    'manage_file',
    MCP_TOOL_DESCRIPTIONS['manage_file'],
    {
      target: facadeV1TargetSchema.describe(
        'Use target.kind="active" or "session" for active editor file actions, or target.kind="external" for unopened files/project folders.',
      ),
      mode: z.enum(['read', 'preview', 'apply']),
      operation: manageFileOperationSchema.optional(),
      preview_token: z
        .string()
        .regex(/^facade-preview-v1\.[A-Za-z0-9._-]{16,}$/)
        .optional(),
      operation_digest: z.string().min(16).optional(),
      guard_values: z.array(facadeV1GuardSchema).max(FACADE_V1_LIMITS.maxBatchItems).optional(),
      max_bytes: z.number().int().positive().max(FACADE_V1_LIMITS.maxBytes).optional(),
    },
    safeToolHandler(
      'manage_file',
      async ({ target, mode, operation, preview_token, operation_digest, guard_values, max_bytes }) => {
        cleanupFacadePreviews();
        const parsed = manageFileBodySchema.safeParse({
          target,
          mode,
          operation,
          preview_token,
          operation_digest,
          guard_values,
          max_bytes,
        });
        if (!parsed.success) {
          return textResult(
            facadeApiError(
              400,
              'Invalid manage_file request',
              parsed.error.issues.map((issue) => issue.message).join('; '),
              { issues: parsed.error.issues },
              ['manage_file'],
            ),
          );
        }
        const body = parsed.data;

        if (body.mode === 'read') {
          const read = await readManageFileOperation(body.target, body.operation!);
          if (isApiError(read)) return textResult(read);
          return textResult(
            facadeEnvelope(
              'manage_file',
              'read-only',
              body.target,
              { ...read.result, routed_legacy: read.routes, touched_targets: read.touched },
              `Read manage_file ${body.operation!.action}`,
              ['manage_file', 'inspect_document'],
              {
                action: body.operation!.action,
                routed_tools: read.routes.map((entry) => entry.tool),
                touched_targets: read.touched,
              },
              body.max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
            ),
          );
        }

        if (body.mode === 'preview') {
          const preview = await previewManageFileOperation(body.target, body.operation!);
          if (isApiError(preview)) return textResult(preview);
          const digest = manageFileOperationDigest(body.target, body.operation!);
          const token = makePreviewToken();
          const expiresAtMs = Date.now() + FACADE_PREVIEW_TTL_MS;
          manageFilePreviewStore.set(token, {
            token,
            operationDigest: digest,
            target: body.target,
            operation: body.operation!,
            routes: preview.routes,
            touchedTargets: preview.touched,
            requiredGuards: preview.requiredGuards,
            expiresAtMs,
          });
          return textResult(
            boundFacadePayload(
              mcpSuccess(
                {
                  facade: {
                    contract: FACADE_V1_CONTRACT_ID,
                    version: 'v1',
                    tool: 'manage_file',
                    mutability: 'preview',
                    target: body.target,
                    ...(body.max_bytes ? { max_bytes: body.max_bytes } : {}),
                  },
                  result: {
                    ...preview.result,
                    routed_legacy: preview.routes,
                    touched_targets: preview.touched,
                    guard_values: preview.requiredGuards,
                  },
                  preview: {
                    preview_token: token,
                    operation_digest: digest,
                    expires_at: new Date(expiresAtMs).toISOString(),
                    required_guards: preview.requiredGuards,
                  },
                },
                {
                  toolName: 'manage_file',
                  summary: `Previewed manage_file ${body.operation!.action}`,
                  nextActions: ['manage_file', 'inspect_document'],
                  artifacts: {
                    action: body.operation!.action,
                    routed_tools: preview.routes.map((entry) => entry.tool),
                    touched_targets: preview.touched,
                  },
                },
              ),
              body.max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
            ),
          );
        }

        const entry = manageFilePreviewStore.get(body.preview_token!);
        if (!entry) {
          return textResult(
            facadeApiError(
              404,
              'Unknown or expired manage_file preview token',
              'Preview tokens are one-shot, held only in this MCP server process memory, and expire after 10 minutes or when the server restarts. Run manage_file preview again, then retry apply with the new token.',
            ),
          );
        }
        if (entry.operationDigest !== body.operation_digest || !sameTarget(entry.target, body.target)) {
          return textResult(
            facadeApiError(
              409,
              'manage_file preview token does not match operation digest or target',
              'Use the exact operation_digest and target returned by manage_file preview.',
            ),
          );
        }
        manageFilePreviewStore.delete(body.preview_token!);
        const applied = await applyManageFileOperation(body.target, entry.operation, body.guard_values);
        if (isApiError(applied)) return textResult(applied);
        return textResult(
          facadeEnvelope(
            'manage_file',
            'mutating',
            body.target,
            {
              ...applied.result,
              routed_legacy: applied.routes,
              touched_targets: applied.touched,
              guard_values: body.guard_values,
              preview_token: body.preview_token,
              operation_digest: body.operation_digest,
            },
            `Applied manage_file ${entry.operation.action}`,
            ['inspect_document', 'read_content', 'manage_file'],
            {
              action: entry.operation.action,
              routed_tools: applied.routes.map((routeEntry) => routeEntry.tool),
              touched_targets: applied.touched,
            },
            body.max_bytes ?? DEFAULT_FACADE_READ_MAX_BYTES,
          ),
        );
      },
    ),
  );
}
