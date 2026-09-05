// @vitest-environment node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createMcpToolRegistrar } from './mcp-tool-registration';
import { errorRecoveryMeta } from './mcp-response-envelope';
import { getToolAnnotations, getToolMeta, listToolsForSurfaceProfile } from './mcp-tool-taxonomy';

const closeRuntimes: Array<() => Promise<void>> = [];

function toolRuntime(allowedNames?: readonly string[]) {
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

describe('registered next_actions at the MCP response boundary', () => {
  it('makes no-document recovery callable in facade-first without rewriting nested payloads', async () => {
    const runtime = toolRuntime(listToolsForSurfaceProfile('facade-first'));
    const payload = {
      status: 400,
      error: 'No file open',
      ...errorRecoveryMeta('document:current', 400),
      action: 'open_file',
      details: { next_actions: ['open_file'], action: 'session_status' },
      result: { next_actions: ['list_references'] },
      facade: { routed_legacy: [{ tool: 'session_status' }] },
    };
    const original = {
      ...textResult(payload),
      isError: true as const,
    };
    const additionalText = { type: 'text' as const, text: JSON.stringify({ next_actions: ['open_file'] }) };
    original.content.push(additionalText);
    runtime.registrar.tool('inspect_document', 'Inspect a document', {}, async () => original);
    // Register alternatives after the handler: resolve against the live names set at call time.
    runtime.registrar.tool('manage_file', 'Manage a file', {}, async () => textResult({ status: 200 }));
    await runtime.connect();

    const result = await runtime.client.callTool({ name: 'inspect_document', arguments: {} });
    const expected = { ...payload, next_actions: ['manage_file', 'inspect_document'] };
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(expected);
    expect(result.content).toEqual([...textResult(expected).content, additionalText]);
    expect(payload.next_actions).toEqual(['open_file', 'list_references', 'session_status']);
    expect(original.content).toEqual([...textResult(payload).content, additionalText]);
    expect(expected.next_actions.every((name) => runtime.registrar.registeredToolNames().includes(name))).toBe(true);
  });

  it.each([
    {
      label: 'content reads, searches, and guarded edits',
      actions: [
        'list_fields',
        'read_field',
        'read_lorebook_by_id',
        'search_in_field',
        'write_field',
        'write_regex_by_identity',
      ],
      expected: ['inspect_document', 'read_content', 'search_document', 'preview_edit'],
    },
    {
      label: 'asset and file operations',
      actions: [
        'list_charx_assets',
        'add_risum_asset',
        'compress_assets_webp',
        'snapshot_field',
        'export_field_to_file',
      ],
      expected: ['manage_assets', 'manage_file'],
    },
    {
      label: 'prompt snippets, analysis, and validation',
      actions: [
        'list_risup_prompt_snippets',
        'insert_risup_prompt_snippet',
        'get_field_stats',
        'diff_cbs',
        'validate_cbs',
      ],
      expected: ['manage_items', 'analyze_content', 'validate_content'],
    },
  ])('translates and deduplicates $label in successful responses', async ({ actions, expected }) => {
    const names = listToolsForSurfaceProfile('facade-first');
    const runtime = toolRuntime(names);
    for (const name of names) {
      runtime.registrar.tool(name, name, {}, async () => textResult({ status: 200, next_actions: actions }));
    }
    await runtime.connect();

    const result = await runtime.client.callTool({ name: 'read_content', arguments: {} });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ status: 200, next_actions: expected });
    expect(result.content).toEqual(textResult(result.structuredContent).content);
    expect(expected.every((name) => runtime.registrar.registeredToolNames().includes(name))).toBe(true);
  });

  it('preserves registered granular names and filters using actual registration, not the allowed profile', async () => {
    const runtime = toolRuntime(listToolsForSurfaceProfile('advanced-full'));
    runtime.registrar.tool('read_field', 'Read a field', {}, async () =>
      textResult({
        status: 200,
        next_actions: [
          'read_field',
          'write_field',
          'read_lorebook',
          'read_field',
          'tools/list',
          'unknown_tool',
          'load_guidance',
        ],
      }),
    );
    for (const name of ['write_field', 'read_content', 'preview_edit']) {
      runtime.registrar.tool(name, name, {}, async () => textResult({ status: 200 }));
    }
    await runtime.connect();

    const result = await runtime.client.callTool({ name: 'read_field', arguments: {} });
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual(
      textResult({ status: 200, next_actions: ['read_field', 'write_field', 'read_content'] }).content,
    );
  });

  it('never introduces an unregistered mutation facade into readonly recovery', async () => {
    const runtime = toolRuntime(listToolsForSurfaceProfile('readonly'));
    runtime.registrar.tool('inspect_document', 'Inspect a document', {}, async () =>
      textResult({
        status: 200,
        success: false,
        next_actions: [
          'write_field',
          'open_file',
          'save_current_file',
          'add_charx_asset',
          'list_charx_assets',
          'preview_edit',
          'apply_edit',
          'read_lorebook',
          'read_field',
          'session_status',
        ],
      }),
    );
    for (const name of [
      'read_content',
      'read_lorebook',
      'manage_file',
      'manage_assets',
      'preview_edit',
      'apply_edit',
    ]) {
      runtime.registrar.tool(name, name, {}, async () => textResult({ status: 200 }));
    }
    await runtime.connect();

    const result = await runtime.client.callTool({ name: 'inspect_document', arguments: {} });
    expect(result.structuredContent).toEqual({
      status: 200,
      success: false,
      next_actions: ['read_lorebook', 'read_content', 'inspect_document'],
    });
    expect(result.content).toEqual(textResult(result.structuredContent).content);
    expect(runtime.registrar.registeredToolNames()).toEqual(['inspect_document', 'read_content', 'read_lorebook']);
  });

  it.each([{ status: 200, next_actions: [] }, { status: 200 }])(
    'preserves explicit empty or absent next_actions without adding defaults: %j',
    async (payload) => {
      const runtime = toolRuntime();
      const original = { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
      runtime.registrar.tool('read_content', 'Read content', {}, async () => original);
      runtime.registrar.tool('preview_edit', 'Preview an edit', {}, async () => textResult({ status: 200 }));
      await runtime.connect();

      const result = await runtime.client.callTool({ name: 'read_content', arguments: {} });
      expect(result.content).toEqual(original.content);
      expect(result.structuredContent).toEqual(payload);
    },
  );

  it('keeps an existing granular structured response equivalent to its rewritten text', async () => {
    const runtime = toolRuntime();
    const payload = { status: 200, next_actions: ['write_field', 'read_field'], details: { action: 'write_field' } };
    runtime.registrar.tool('read_field', 'Read a field', {}, async () => ({
      ...textResult(payload),
      structuredContent: payload,
    }));
    runtime.registrar.tool('preview_edit', 'Preview an edit', {}, async () => textResult({ status: 200 }));
    await runtime.connect();

    const result = await runtime.client.callTool({ name: 'read_field', arguments: {} });
    expect(result.structuredContent).toEqual({ ...payload, next_actions: ['preview_edit', 'read_field'] });
    expect(result.content).toEqual(textResult(result.structuredContent).content);
    expect(payload.next_actions).toEqual(['write_field', 'read_field']);
  });
});
