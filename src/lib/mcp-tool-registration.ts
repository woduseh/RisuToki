import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { FacadeApiRequest } from './mcp-facade-script-style';

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
};

export type McpToolHandler<TArgs extends Record<string, unknown>> = (
  args: TArgs,
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
