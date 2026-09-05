import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { getCompactInputSchema } from './mcp-compact-input';
import type { FacadeApiRequest } from './mcp-facade-script-style';
import { getToolAnnotations, getToolMeta, TOOL_TAXONOMY, type ToolFamily } from './mcp-tool-taxonomy';

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
};

export interface McpToolRequestExtra {
  signal: AbortSignal;
  requestId: string | number;
}

export type McpToolHandler<TArgs extends Record<string, unknown>> = (
  args: TArgs,
  extra?: McpToolRequestExtra,
) => McpToolResult | Promise<McpToolResult>;

export type SafeToolHandler = <TArgs extends Record<string, unknown>>(
  name: string,
  handler: McpToolHandler<TArgs>,
) => McpToolHandler<TArgs>;

export interface McpToolRegistrationDeps {
  apiRequest: FacadeApiRequest;
  textResult: (data: unknown) => McpToolResult;
}

export interface McpToolServer {
  tool<TShape extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: TShape,
    handler: McpToolHandler<z.output<z.ZodObject<TShape>>>,
  ): void;
}

interface McpToolRegistrarOptions {
  shouldRegister: (name: string) => boolean;
  onSkipped: (name: string) => void;
  instrumentHandler: SafeToolHandler;
}

/** Register the repository's single tool signature through the SDK public API. */
export function createMcpToolRegistrar(server: Pick<McpServer, 'registerTool'>, options: McpToolRegistrarOptions) {
  const names = new Set<string>();
  const registrar: McpToolServer = {
    tool(name, description, shape, handler) {
      if (!options.shouldRegister(name)) {
        options.onSkipped(name);
        return;
      }
      const publicInputSchema = getCompactInputSchema(name, shape);
      const registeredActionsHandler = withRegisteredNextActionsHandler(handler, names);
      const resultHandler = publicInputSchema
        ? withStructuredContentHandler(registeredActionsHandler)
        : registeredActionsHandler;
      server.registerTool<typeof MCP_COMPACT_OUTPUT_SCHEMA, z.ZodObject<typeof shape>>(
        name,
        {
          description,
          inputSchema: publicInputSchema ?? z.object(shape),
          ...(publicInputSchema ? { outputSchema: MCP_COMPACT_OUTPUT_SCHEMA } : {}),
          annotations: getToolAnnotations(name),
          _meta: getToolMeta(name),
        },
        options.instrumentHandler(name, resultHandler),
      );
      names.add(name);
    },
  };
  return { ...registrar, registeredToolNames: () => [...names].sort() };
}

/**
 * Deliberately compact output contract shared by the facade-first surface.
 * Existing payload-specific fields remain valid through the catch-all while
 * agents can rely on the stable observation and recovery fields below.
 */
export const MCP_COMPACT_OUTPUT_SCHEMA = z
  .object({
    status: z.number(),
    summary: z.string().optional(),
    result: z.unknown().optional(),
    artifacts: z.record(z.string(), z.unknown()).optional(),
    next_actions: z.array(z.string()).optional(),
    preview: z.record(z.string(), z.unknown()).optional(),
    error: z.unknown().optional(),
    code: z.string().optional(),
    retryable: z.boolean().optional(),
    retry_mode: z.enum(['never', 'backoff', 'refresh_then_retry', 'inspect_outcome']).optional(),
    outcome: z.enum(['complete', 'not_started', 'unchanged', 'partial', 'unknown']).optional(),
  })
  .catchall(z.unknown());

function parsedTextObject(result: McpToolResult): Record<string, unknown> {
  const text = result.content.find((item) => item.type === 'text')?.text;
  if (text === undefined) {
    return {
      status: result.isError ? 500 : 200,
      ...(result.isError ? { error: 'Tool returned no JSON text content' } : { result: null }),
    };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { status: result.isError ? 500 : 200, result: parsed };
  } catch {
    return {
      status: result.isError ? 500 : 200,
      ...(result.isError ? { error: text } : { result: text }),
    };
  }
}

// These operations cross family boundaries or have a more specific facade than
// a generic content read/edit. Uncovered operations deliberately have no fallback.
const NEXT_ACTION_FACADE_OVERRIDES = new Map<string, string>(
  Object.entries({
    inspect_document: ['session_status', 'list_fields', 'list_surfaces', 'list_references', 'inspect_external_file'],
    manage_file: ['open_file', 'save_current_file', 'export_field_to_file'],
    manage_items: [
      'export_risup_prompt_to_text',
      'copy_risup_prompt_items_as_text',
      'import_risup_prompt_from_text',
      'list_risup_prompt_snippets',
      'read_risup_prompt_snippet',
      'save_risup_prompt_snippet',
      'insert_risup_prompt_snippet',
      'delete_risup_prompt_snippet',
    ],
    analyze_content: [
      'get_field_stats',
      'list_cbs_toggles',
      'simulate_cbs',
      'diff_cbs',
      'tag_db_status',
      'search_danbooru_tags',
      'get_popular_danbooru_tags',
      'diff_lorebook',
      'diff_risup_prompt',
      'validate_risup_prompt_import',
    ],
    search_document: [
      'search_in_field',
      'search_all_fields',
      'external_search_in_field',
      'search_in_reference_field',
      'search_in_risup_prompt_items',
    ],
    validate_content: ['validate_cbs', 'validate_lorebook_keys', 'validate_danbooru_tags'],
  }).flatMap(([facade, sources]) => sources.map((source): [string, string] => [source, facade])),
);

const NEXT_ACTION_CONTENT_FAMILIES = new Set<ToolFamily>([
  'field',
  'surface',
  'lorebook',
  'regex',
  'greeting',
  'trigger',
  'lua',
  'css',
  'risup-prompt',
  'reference',
  'probe',
  'external',
]);

function nextActionFacade(name: string): string | undefined {
  if (!Object.hasOwn(TOOL_TAXONOMY, name)) return undefined;
  const entry = TOOL_TAXONOMY[name];
  if (entry.surfaceKind === 'facade') return undefined;
  const override = NEXT_ACTION_FACADE_OVERRIDES.get(name);
  if (override) return override;
  if (['charx-asset', 'risum-asset', 'asset-compression'].includes(entry.family)) return 'manage_assets';
  if (['snapshot', 'lorebook-io', 'folder-workspace'].includes(entry.family)) return 'manage_file';
  if (NEXT_ACTION_CONTENT_FAMILIES.has(entry.family)) {
    if (/^(?:external_)?(?:read|list|probe)_/.test(name)) return 'read_content';
    if (/^(?:add|reorder)_/.test(name)) return 'manage_items';
    if (/^(?:external_)?(?:write|replace|insert|delete|batch_delete)_/.test(name)) return 'preview_edit';
  }
  return undefined;
}

function withRegisteredNextActionsHandler<TArgs extends Record<string, unknown>>(
  handler: McpToolHandler<TArgs>,
  registeredNames: ReadonlySet<string>,
): McpToolHandler<TArgs> {
  return async (args, extra) => {
    const result = await handler(args, extra);
    const payload = parsedTextObject(result);
    const originalNextActions = payload.next_actions;
    if (!Array.isArray(originalNextActions)) return result;
    const nextActions = new Set<string>();
    for (const name of originalNextActions) {
      if (typeof name !== 'string') continue;
      if (registeredNames.has(name)) {
        nextActions.add(name);
        continue;
      }
      const facade = nextActionFacade(name);
      if (
        facade &&
        registeredNames.has(facade) &&
        TOOL_TAXONOMY[facade]?.surfaceKind === 'facade' &&
        TOOL_TAXONOMY[facade]?.recommendation === 'preferred'
      ) {
        nextActions.add(facade);
      }
    }
    const resolved = [...nextActions];
    if (resolved.length === originalNextActions.length && resolved.every((name, i) => name === originalNextActions[i]))
      return result;
    const updatedPayload = { ...payload, next_actions: resolved };
    const textIndex = result.content.findIndex((item) => item.type === 'text');
    return {
      ...result,
      content: result.content.map((item, i) =>
        i === textIndex ? { ...item, text: JSON.stringify(updatedPayload) } : item,
      ),
      ...(result.structuredContent ? { structuredContent: updatedPayload } : {}),
    };
  };
}

/** Preserve the existing text JSON while exposing the same object structurally. */
export function withStructuredContentHandler<TArgs extends Record<string, unknown>>(
  handler: McpToolHandler<TArgs>,
): McpToolHandler<TArgs> {
  return async (args, extra) => {
    const result = await handler(args, extra);
    return {
      ...result,
      structuredContent: parsedTextObject(result),
    };
  };
}
