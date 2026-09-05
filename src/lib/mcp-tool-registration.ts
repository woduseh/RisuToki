import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { getCompactInputSchema } from './mcp-compact-input';
import type { FacadeApiRequest } from './mcp-facade-script-style';
import { getToolAnnotations, getToolMeta } from './mcp-tool-taxonomy';

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
      const resultHandler = publicInputSchema ? withStructuredContentHandler(handler) : handler;
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
