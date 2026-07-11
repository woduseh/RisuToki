import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { FacadeApiRequest } from './mcp-facade-script-style';

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

export type McpToolServer = McpServer;

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

export function structuredToolConfig<TInput extends Record<string, z.ZodType>>(
  description: string,
  inputSchema: TInput,
) {
  return {
    description,
    inputSchema,
    outputSchema: MCP_COMPACT_OUTPUT_SCHEMA,
  };
}

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
