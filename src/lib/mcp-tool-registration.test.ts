// @vitest-environment node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createMcpToolRegistrar } from './mcp-tool-registration';
import { getToolAnnotations, getToolMeta } from './mcp-tool-taxonomy';

const closeRuntimes: Array<() => Promise<void>> = [];

function toolRuntime(allowedNames?: string[]) {
  const server = new McpServer({ name: 'registration-test', version: '1' });
  const client = new Client({ name: 'registration-test-client', version: '1' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const skipped = vi.fn();
  const observedCalls = vi.fn();
  const registrar = createMcpToolRegistrar(server, {
    shouldRegister: (name) => !allowedNames || allowedNames.includes(name),
    onSkipped: skipped,
    instrumentHandler: (name, handler) => async (args, extra) => {
      observedCalls(name, args, extra);
      return handler(args, extra);
    },
  });
  closeRuntimes.push(async () => {
    await client.close();
    await server.close();
  });
  return {
    client,
    registrar,
    skipped,
    observedCalls,
    connect: () => Promise.all([server.connect(serverTransport), client.connect(clientTransport)]),
  };
}

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

afterEach(async () => {
  for (const close of closeRuntimes.splice(0)) await close();
});

describe('MCP SDK tool registration boundary', () => {
  it('preserves registration order, taxonomy metadata, and the two output contracts', async () => {
    const runtime = toolRuntime();
    runtime.registrar.tool('read_field', 'Read a field', {}, async () =>
      textResult({ field: 'description', content: 'A guide.' }),
    );
    runtime.registrar.tool('inspect_document', 'Inspect a document', {}, async () =>
      textResult({ status: 200, result: 'A guide.' }),
    );
    await runtime.connect();

    const { tools } = await runtime.client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['read_field', 'inspect_document']);
    expect(runtime.registrar.registeredToolNames()).toEqual(['inspect_document', 'read_field']);
    for (const tool of tools) {
      expect(tool.annotations).toEqual(getToolAnnotations(tool.name));
      expect(tool._meta).toEqual(getToolMeta(tool.name));
    }
    expect(tools[0].outputSchema).toBeUndefined();
    expect(tools[1].outputSchema).toBeDefined();

    const granular = await runtime.client.callTool({ name: 'read_field', arguments: {} });
    expect(granular.structuredContent).toBeUndefined();
    expect(granular.content).toEqual(textResult({ field: 'description', content: 'A guide.' }).content);
    const facade = await runtime.client.callTool({ name: 'inspect_document', arguments: {} });
    expect(facade.structuredContent).toEqual({ status: 200, result: 'A guide.' });
    expect(facade.content).toEqual(textResult(facade.structuredContent).content);
  });

  it('applies defaults and removes unknown fields before delivering SDK request context', async () => {
    const runtime = toolRuntime();
    const handler = vi.fn(async (args, extra) => {
      expect(extra.signal).toBeInstanceOf(AbortSignal);
      expect(['string', 'number']).toContain(typeof extra.requestId);
      return textResult({ status: 200, result: args });
    });
    runtime.registrar.tool(
      'inspect_document',
      'Inspect a document',
      { value: z.string().default('fallback') },
      handler,
    );
    await runtime.connect();

    const result = await runtime.client.callTool({ name: 'inspect_document', arguments: { ignored: 'discard me' } });
    expect(handler).toHaveBeenCalledOnce();
    expect(runtime.observedCalls).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toEqual({ value: 'fallback' });
    expect(result.structuredContent).toEqual({ status: 200, result: { value: 'fallback' } });
  });

  it('returns the SDK input error without executing handlers or manufacturing structured content', async () => {
    const runtime = toolRuntime();
    const handler = vi.fn(async () => textResult({ status: 200 }));
    runtime.registrar.tool('inspect_document', 'Inspect a document', { mode: z.literal('valid') }, handler);
    await runtime.connect();

    const result = await runtime.client.callTool({ name: 'inspect_document', arguments: { mode: 'invalid' } });
    expect(handler).not.toHaveBeenCalled();
    expect(runtime.observedCalls).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([
      {
        type: 'text',
        text: expect.stringContaining('Input validation error: Invalid arguments for tool inspect_document'),
      },
    ]);
  });

  it('preserves structured application errors after SDK input validation succeeds', async () => {
    const runtime = toolRuntime();
    const payload = { status: 409, error: 'Stale document', outcome: 'unchanged', retry_mode: 'refresh_then_retry' };
    runtime.registrar.tool('inspect_document', 'Inspect a document', {}, async () => ({
      ...textResult(payload),
      isError: true,
    }));
    await runtime.connect();

    const result = await runtime.client.callTool({ name: 'inspect_document', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(payload);
    expect(result.content).toEqual(textResult(payload).content);
  });

  it('excludes profile-filtered tools from discovery and execution', async () => {
    const runtime = toolRuntime(['inspect_document']);
    const skippedHandler = vi.fn(async () => textResult({ field: 'description' }));
    runtime.registrar.tool('read_field', 'Read a field', {}, skippedHandler);
    runtime.registrar.tool('inspect_document', 'Inspect a document', {}, async () => textResult({ status: 200 }));
    await runtime.connect();

    expect((await runtime.client.listTools()).tools.map((tool) => tool.name)).toEqual(['inspect_document']);
    expect(runtime.registrar.registeredToolNames()).toEqual(['inspect_document']);
    expect(runtime.skipped).toHaveBeenCalledExactlyOnceWith('read_field');
    expect((await runtime.client.callTool({ name: 'read_field', arguments: {} })).isError).toBe(true);
    expect(skippedHandler).not.toHaveBeenCalled();
    expect(runtime.observedCalls).not.toHaveBeenCalled();
  });

  it('validates facade arguments once at the SDK boundary', async () => {
    const runtime = toolRuntime();
    const refine = vi.fn();
    runtime.registrar.tool(
      'inspect_document',
      'Inspect a document',
      { value: z.string().superRefine(refine) },
      async (args) => textResult({ status: 200, result: args }),
    );
    await runtime.connect();

    const result = await runtime.client.callTool({ name: 'inspect_document', arguments: { value: 'source' } });
    expect(result.structuredContent).toEqual({ status: 200, result: { value: 'source' } });
    expect(refine).toHaveBeenCalledOnce();
    expect(runtime.observedCalls).toHaveBeenCalledOnce();
  });
});
