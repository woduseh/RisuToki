// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getCompactInputSchema,
  MCP_DEFAULT_TOOLS_LIST_MAX_BYTES,
  MCP_SINGLE_TOOL_MAX_BYTES,
  STRUCTURED_DEFAULT_TOOL_NAMES,
} from './mcp-compact-input';
import { registerFacadeTools, type FacadeToolRegistrationDeps } from './mcp-tool-register-facade';

type Registration = { name: string; description: string; shape: z.ZodRawShape };

function captureFacadeRegistrations(): Registration[] {
  const registrations: Registration[] = [];
  const server = {
    tool(name: string, description: string, shape: z.ZodRawShape) {
      registrations.push({ name, description, shape });
    },
  } as unknown as McpServer;
  // Registration only: callbacks never execute and no document or filesystem is accessed.
  registerFacadeTools(server, {
    assets: {},
    content: {},
    edit: {},
    files: {},
    items: {},
    scriptStyle: {},
    safeToolHandler: (_name: string, handler: unknown) => handler,
  } as unknown as FacadeToolRegistrationDeps);
  return registrations;
}

const registrations = captureFacadeRegistrations();

function publicSchema(name: string) {
  const registration = registrations.find((entry) => entry.name === name)!;
  return getCompactInputSchema(name, registration.shape)!;
}

function jsonSchema(name: string) {
  return z.toJSONSchema(publicSchema(name), { io: 'input', target: 'draft-7' });
}

describe('discoverable facade input schemas', () => {
  it('publishes the same nested fields and required arguments as every registered facade handler', () => {
    for (const registration of registrations) {
      if (!STRUCTURED_DEFAULT_TOOL_NAMES.includes(registration.name as (typeof STRUCTURED_DEFAULT_TOOL_NAMES)[number]))
        continue;
      const actual = jsonSchema(registration.name);
      const expected = z.toJSONSchema(z.object(registration.shape), { io: 'input', target: 'draft-7' });
      // Top-level descriptions are enriched; the nested contract must remain intact.
      for (const [key, property] of Object.entries(expected.properties ?? {})) {
        const expectedProperty = { ...(property as Record<string, unknown>) };
        const actualProperty = { ...(actual.properties![key] as Record<string, unknown>) };
        delete expectedProperty.description;
        delete actualProperty.description;
        expect(actualProperty, `${registration.name}.${key}`).toEqual(expectedProperty);
      }
      expect(actual.required, registration.name).toEqual(expected.required);
    }
  });

  it('reveals external identity and required replacement arguments before the first call', () => {
    const schema = jsonSchema('preview_edit');
    const target = schema.properties!.target as {
      oneOf: Array<{ properties: Record<string, unknown>; required: string[] }>;
    };
    const external = target.oneOf.find(
      (branch) => (branch.properties.kind as { const?: string }).const === 'external',
    )!;
    expect(external.required).toContain('file_path');
    const operations = schema.properties!.operations as {
      items: { oneOf: Array<{ properties: Record<string, unknown>; required: string[] }> };
    };
    const replacement = operations.items.oneOf.find(
      (branch) => (branch.properties.op as { const?: string }).const === 'replace_text',
    )!;
    expect(replacement.required).toContain('find');
    expect(replacement.properties).toHaveProperty('replace');
    expect(
      publicSchema('preview_edit').safeParse({
        target: { kind: 'external' },
        operations: [{ op: 'replace_text', selector: { family: 'field', field: 'description' } }],
      }).success,
    ).toBe(false);
  });

  it('preserves actionable selectors and operation payloads through public parsing', () => {
    const input = {
      target: { kind: 'external', file_path: '/fixtures/example.charx' },
      operations: [
        { op: 'replace_text', selector: { family: 'lorebook', id: 'stable-id' }, find: 'old', replace: 'new' },
      ],
    };
    expect(publicSchema('preview_edit').parse(input)).toEqual(input);
    const analysis = {
      target: { kind: 'active' },
      operation: { action: 'simulate_cbs', field: 'description', toggles: { mood: 'calm' } },
    };
    expect(publicSchema('analyze_content').parse(analysis)).toEqual(analysis);
  });

  it('keeps full public contracts within an explicit discovery budget', () => {
    const tools = registrations
      .filter((registration) => getCompactInputSchema(registration.name, registration.shape))
      .map(({ name, description }) => ({ name, description, inputSchema: jsonSchema(name) }));
    for (const tool of tools) {
      const bytes = Buffer.byteLength(JSON.stringify(tool));
      expect(bytes, `${tool.name}: ${bytes} bytes`).toBeLessThanOrEqual(MCP_SINGLE_TOOL_MAX_BYTES);
    }
    const bytes = Buffer.byteLength(JSON.stringify({ tools }));
    expect(bytes, `facade discovery inputs: ${bytes} bytes`).toBeLessThanOrEqual(MCP_DEFAULT_TOOLS_LIST_MAX_BYTES);
  });
});
