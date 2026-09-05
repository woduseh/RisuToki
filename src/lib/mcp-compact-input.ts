import { z } from 'zod';

import type { McpToolHandler } from './mcp-tool-registration';
import { normalizeMcpErrorEnvelope } from './mcp-response-envelope';

// Full action-specific inputs are intentionally larger than discriminator-only
// schemas. Keep an explicit cap without sacrificing required argument discovery.
export const MCP_DEFAULT_TOOLS_LIST_MAX_BYTES = 96 * 1024;
export const MCP_SINGLE_TOOL_MAX_BYTES = 24 * 1024;

export const STRUCTURED_DEFAULT_TOOL_NAMES = [
  'apply_edit',
  'analyze_content',
  'evaluate_bot',
  'inspect_document',
  'list_skills',
  'list_tool_profiles',
  'manage_assets',
  'manage_file',
  'manage_items',
  'preview_edit',
  'read_content',
  'read_skill',
  'search_document',
  'validate_content',
] as const;

export type StructuredDefaultToolName = (typeof STRUCTURED_DEFAULT_TOOL_NAMES)[number];

const structuredDefaultToolNameSet = new Set<string>(STRUCTURED_DEFAULT_TOOL_NAMES);

export function isStructuredDefaultToolName(name: string): name is StructuredDefaultToolName {
  return structuredDefaultToolNameSet.has(name);
}

/**
 * Keep the registered handler shape as the public contract. Publishing only
 * discriminators hides required arguments (for example external.file_path or
 * replace_text.find) and forces agents to guess. Reusing the registration also
 * keeps new selectors and operation fields discoverable without a second map.
 * The historical function name is retained for registration compatibility.
 */
export function getCompactInputSchema(name: string, inputShape: z.ZodRawShape): z.ZodTypeAny | undefined {
  if (!isStructuredDefaultToolName(name)) return undefined;
  const descriptions: Record<string, string> = {
    target:
      'Document identity: active is the current editor document; external requires an absolute file_path; reference uses reference_id or file_path from inspection and is read-only. guidance and session are discovery targets.',
    selectors:
      'Select bounded content by family and field, stable id/identity, index/indices, or surface path. Example: [{family:"field",field:"description"}]. Omit for the tool default.',
    selector:
      'Select the field or structured family. For search use {family:"field",field:"description"} or {family:"risup-prompt"}.',
    operations:
      'Ordered edits. Each op branch declares its required arguments. Example: [{op:"replace_text",selector:{family:"field",field:"description"},find:"old",replace:"new"}].',
    operation: 'Choose one action branch and provide its required arguments. Preview mutations before applying them.',
    mode: 'read retrieves data; preview prepares a mutation; apply consumes the returned preview_token, operation_digest and guard_values. read/preview require operation; apply requires all three preview credentials.',
    preview_token:
      'Opaque token returned by the matching preview. Copy exactly; single-use, target-bound and expiring.',
    operation_digest: 'Copy the operation_digest returned by the matching preview; do not compute or alter it.',
    guard_values: 'Copy the complete guard_values array returned by the matching preview, preserving names and values.',
    max_bytes: 'Maximum UTF-8 result bytes, up to 65536. Follow truncation metadata with a narrower or resumed read.',
    cursor: 'Opaque next_cursor returned by the preceding page; copy exactly.',
  };
  return z.object(
    Object.fromEntries(
      Object.entries(inputShape).map(([key, schema]) => [
        key,
        descriptions[key] ? (schema as z.ZodTypeAny).describe(descriptions[key]) : schema,
      ]),
    ),
  );
}
/** Keep the pre-1.14 detailed Zod shape as the final handler-side validator. */
export function withDetailedInputValidationHandler<TArgs extends Record<string, unknown>>(
  name: string,
  inputShape: z.ZodRawShape,
  handler: McpToolHandler<TArgs>,
): McpToolHandler<Record<string, unknown>> {
  const detailedSchema = z.object(inputShape);
  return async (args, extra) => {
    const parsed = await detailedSchema.safeParseAsync(args);
    if (!parsed.success) {
      const payload = normalizeMcpErrorEnvelope({
        status: 400,
        action: `validate ${name} input`,
        target: `tool:${name}`,
        error: `Invalid arguments for tool ${name}: ${parsed.error.message}`,
        suggestion: 'Inspect the tool input schema and correct the invalid arguments before retrying.',
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        isError: true,
      };
    }
    return handler(parsed.data as TArgs, extra);
  };
}
