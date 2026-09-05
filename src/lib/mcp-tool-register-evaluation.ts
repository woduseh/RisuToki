import { createHash } from 'crypto';
import { z } from 'zod';
import type { McpToolServer } from './mcp-tool-registration';
import type { FacadeContentEngine } from './mcp-facade-content';
import { asRecord, facadeApiError, isApiError } from './mcp-facade-runtime';
import { mcpSuccess } from './mcp-response-envelope';
import { MCP_TOOL_DESCRIPTIONS } from './mcp-tool-descriptions';

const strings = z.array(z.string().min(1).max(10000)).max(30);
const expectations = {
  equals: z.string().max(100000).optional(),
  contains: strings.optional(),
  excludes: strings.optional(),
};
const evaluationCase = z
  .discriminatedUnion('kind', [
    z.object({
      name: z.string().min(1).max(200),
      kind: z.literal('field'),
      field: z.string().min(1).max(200),
      ...expectations,
    }),
    z.object({
      name: z.string().min(1).max(200),
      kind: z.literal('regex'),
      text: z.string().max(100000),
      mode: z.enum(['editinput', 'editoutput', 'editdisplay', 'editrequest']),
      ...expectations,
    }),
    z.object({
      name: z.string().min(1).max(200),
      kind: z.literal('lorebook'),
      messages: z
        .array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().max(10000) }))
        .min(1)
        .max(50),
      expected_active: z.array(z.number().int().nonnegative()).max(100).optional(),
      expected_inactive: z.array(z.number().int().nonnegative()).max(100).optional(),
      scan_depth: z.number().int().min(0).max(100).optional(),
      recursive: z.boolean().optional(),
    }),
  ])
  .superRefine((value, ctx) => {
    const hasExpectation =
      value.kind === 'lorebook'
        ? (value.expected_active?.length ?? 0) + (value.expected_inactive?.length ?? 0) > 0
        : value.equals !== undefined || (value.contains?.length ?? 0) + (value.excludes?.length ?? 0) > 0;
    if (!hasExpectation) ctx.addIssue({ code: 'custom', message: 'Each case needs at least one expected result.' });
  });

export const evaluateBotSchema = z.object({
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('active') }),
    z.object({ kind: z.literal('external'), file_path: z.string().min(1) }),
  ]),
  cases: z
    .array(evaluationCase)
    .min(1)
    .max(30)
    .describe('Explicit field, regex, or lorebook expectations. No model calls or artifact writes.'),
  max_bytes: z.number().int().min(4096).max(65536).default(24576),
});
type EvaluationInput = z.infer<typeof evaluateBotSchema>;

function incomplete(data: Record<string, unknown> | undefined): boolean {
  return (
    data?.truncated === true ||
    typeof data?.next_cursor === 'string' ||
    asRecord(data?.artifacts)?.truncated === true ||
    asRecord(data?.facade)?.truncated === true
  );
}

function sourceFingerprint(data: unknown): string | undefined {
  const hash = asRecord(data)?.hash;
  // Overview text alone can omit changed content. Require the full source hash
  // carried by surface reads instead of hashing the visible preview.
  return typeof hash === 'string' && hash.length > 0 ? createHash('sha256').update(hash).digest('hex') : undefined;
}

export async function evaluateBot(
  input: EvaluationInput,
  content: Pick<FacadeContentEngine, 'readFacadeSelector' | 'analyzeFacadeOperation'>,
) {
  const before = await content.readFacadeSelector(input.target, { family: 'surface', path: '/' });
  if (isApiError(before)) return before;
  const beforeHash = sourceFingerprint(before.data);
  if (!beforeHash)
    return facadeApiError(
      409,
      'Source fingerprint is unavailable',
      'Inspect the document and retry against a source that provides a complete surface hash.',
    );
  let lorebookCount: number | undefined;
  if (input.cases.some((test) => test.kind === 'lorebook')) {
    const inventory = await content.readFacadeSelector(input.target, { family: 'lorebook' });
    if (isApiError(inventory)) return inventory;
    const count = asRecord(inventory.data)?.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || incomplete(asRecord(inventory.data)))
      return facadeApiError(
        422,
        'Lorebook inventory is incomplete',
        'Read a complete lorebook inventory before evaluating activation expectations.',
      );
    lorebookCount = count;
  }
  const results: Record<string, unknown>[] = [];
  for (const test of input.cases) {
    const checks: Array<{ assertion: string; passed: boolean }> = [];
    let error: unknown;
    if (test.kind === 'lorebook') {
      const response = await content.analyzeFacadeOperation(input.target, {
        action: 'simulate_lorebook',
        messages: test.messages,
        scan_depth: test.scan_depth,
        recursive: test.recursive,
        include_content: false,
      });
      if (isApiError(response)) error = response.error;
      else {
        const data = asRecord(response.data);
        const matches = Array.isArray(data?.matches) ? data.matches : [];
        if (
          !Array.isArray(data?.matches) ||
          incomplete(data) ||
          matches.some((match) => {
            const index = asRecord(match)?.index;
            return typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= (lorebookCount ?? 0);
          })
        )
          error = 'Lorebook simulation returned incomplete or malformed results.';
        if (
          [...(test.expected_active ?? []), ...(test.expected_inactive ?? [])].some(
            (index) => index >= (lorebookCount ?? 0),
          )
        )
          error = 'Expected lorebook index does not exist in the evaluated source.';
        const active = new Set(matches.map((match) => asRecord(match)?.index));
        for (const index of test.expected_active ?? [])
          checks.push({ assertion: `lorebook:${index}:active`, passed: active.has(index) });
        for (const index of test.expected_inactive ?? [])
          checks.push({ assertion: `lorebook:${index}:inactive`, passed: !active.has(index) });
        if (data?.truncatedRecursiveScan) error = 'Recursive simulation limit reached; result is incomplete.';
      }
    } else {
      const response =
        test.kind === 'field'
          ? await content.readFacadeSelector(input.target, { family: 'field', field: test.field })
          : await content.analyzeFacadeOperation(input.target, {
              action: 'test_regex',
              text: test.text,
              mode: test.mode,
            });
      if (isApiError(response)) error = response.error;
      else {
        const data = asRecord(response.data);
        const actual = test.kind === 'regex' ? data?.result : data?.content;
        if (incomplete(data)) error = 'Text result is incomplete; assertions cannot establish a pass.';
        if (typeof actual !== 'string') error = 'Expected a text result; choose a readable text field.';
        else {
          if (test.kind === 'regex' && data?.ok !== true)
            error = 'Regex pipeline did not report a successful execution.';
          if (test.equals !== undefined) checks.push({ assertion: 'equals', passed: actual === test.equals });
          (test.contains ?? []).forEach((text, index) =>
            checks.push({ assertion: `contains:${index}`, passed: actual.includes(text) }),
          );
          (test.excludes ?? []).forEach((text, index) =>
            checks.push({ assertion: `excludes:${index}`, passed: !actual.includes(text) }),
          );
        }
      }
    }
    results.push({
      case_index: results.length,
      name: test.name,
      kind: test.kind,
      passed: !error && checks.length > 0 && checks.every((check) => check.passed),
      checks,
      ...(error ? { error: String(error).slice(0, 1000) } : {}),
    });
  }
  const after = await content.readFacadeSelector(input.target, { family: 'surface', path: '/' });
  if (isApiError(after)) return after;
  if (beforeHash !== sourceFingerprint(after.data))
    return facadeApiError(
      409,
      'Document changed during evaluation',
      'Run the same cases again against a stable document.',
    );
  const passedCount = results.filter((result) => result.passed).length;
  const data = {
    passed: passedCount === results.length,
    source_fingerprint: beforeHash,
    total: results.length,
    passed_count: passedCount,
    failed_count: results.length - passedCount,
    limitations: [
      'Deterministic expectations only; no LLM roleplay-quality judgment.',
      'Lorebook simulation uses deterministic probability and does not apply a model token budget.',
      'Does not execute Lua, render HTML/CSS, or assemble the final provider request.',
    ],
  };
  const envelope = (cases: Record<string, unknown>[]) =>
    mcpSuccess(
      {
        ...data,
        cases,
        returned_case_count: cases.length,
        omitted_case_count: results.length - cases.length,
        truncated: cases.length < results.length,
        ...(cases.length < results.length
          ? {
              continuation_hint:
                'Re-run fewer cases for complete details. Aggregate counts include every case; retained cases prioritize failures and carry original case_index values.',
            }
          : {}),
      },
      {
        toolName: 'evaluate_bot',
        summary: `Evaluated ${results.length} bot regression cases`,
        nextActions: ['read_content', 'preview_edit', 'validate_content', 'evaluate_bot'],
      },
    );
  let retained = results;
  let result = envelope(retained);
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > input.max_bytes) {
    retained = [...results].sort((a, b) => Number(a.passed) - Number(b.passed));
    do {
      retained = retained.slice(0, -1);
      result = envelope(retained);
    } while (retained.length > 0 && Buffer.byteLength(JSON.stringify(result), 'utf8') > input.max_bytes);
  }
  return result;
}

export function registerEvaluationTools(server: McpToolServer, content: FacadeContentEngine) {
  server.tool('evaluate_bot', MCP_TOOL_DESCRIPTIONS.evaluate_bot, evaluateBotSchema.shape, async (args) => {
    const parsed = evaluateBotSchema.safeParse(args);
    const result = parsed.success
      ? await evaluateBot(parsed.data, content)
      : facadeApiError(400, 'Invalid evaluation cases', parsed.error.message);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      ...(isApiError(result) ? { isError: true as const } : {}),
    };
  });
}
