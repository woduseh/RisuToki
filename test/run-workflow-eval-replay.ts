import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { openCharx, openRisum, openRisup } from '../src/charx-io';
import { WORKFLOW_EVAL_TASKS, type CanonicalReplayScenarioId, type WorkflowEvalTask } from './workflow-eval-catalog';
import { callJson, startStandaloneClient, type McpCallJson, type StandaloneClientRuntime } from './mcp-test-client';
import { createWorkflowEvalFixtures, WORKFLOW_MARKERS } from './workflow-eval-fixtures';
import { assertReplayScenariosPassed } from './workflow-eval-gate';

const DEFAULT_MAX_BYTES = 24 * 1024;

const TARGET_METRICS = {
  scenarioCompletion: 0.85,
  requiredRouteConformance: 0.95,
  firstPassCompletion: 0.85,
  wrongTargetIncidents: 0,
  validationCoverage: 0.95,
  boundedReadCoverage: 0.9,
} as const;

interface ScenarioResult {
  id: CanonicalReplayScenarioId;
  taskIds: string[];
  passed: boolean;
  callCount: number;
  callBudget: number;
  expectedRejections: number;
  expectedRecoveryAttempts: number;
  wrongTargetIncidents: number;
  validationCovered: boolean;
  boundedReads: number;
  boundedReadsPassed: number;
  requiredToolsPresent: boolean;
  durationMs: number;
  error?: string;
}

interface ScenarioContext {
  runtime: StandaloneClientRuntime;
  result: ScenarioResult;
  tools: Set<string>;
}

interface ScenarioDefinition {
  id: CanonicalReplayScenarioId;
  callBudget: number;
  requiredTools: string[];
  run: (context: ScenarioContext) => Promise<void>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} should be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  assert.ok(Array.isArray(value), `${label} should be an array`);
  return value;
}

function preview(envelope: McpCallJson, label: string): Record<string, unknown> {
  const value = record(envelope.preview, label);
  assert.equal(typeof value.preview_token, 'string', `${label}.preview_token should be a string`);
  assert.equal(typeof value.operation_digest, 'string', `${label}.operation_digest should be a string`);
  return value;
}

function jsonContains(value: unknown, marker: string, label: string): void {
  assert.match(JSON.stringify(value), new RegExp(marker), `${label} should contain ${marker}`);
}

function boundedByteSize(envelope: McpCallJson): number {
  const artifacts = record(envelope.artifacts, 'response artifacts');
  assert.equal(typeof artifacts.byte_size, 'number', 'response artifacts.byte_size should be numeric');
  return Number(artifacts.byte_size);
}

async function scenarioCall(
  context: ScenarioContext,
  name: string,
  args: Record<string, unknown>,
  options: {
    expectError?: boolean;
    expectedStatus?: number;
    expectedRejection?: boolean;
    expectedRecovery?: boolean;
    boundedRead?: boolean;
    validation?: boolean;
  } = {},
): Promise<McpCallJson> {
  context.result.callCount += 1;
  assert.ok(context.tools.has(name), `${name} should be registered in tools/list`);
  const envelope = await callJson(context.runtime, name, args, { expectError: options.expectError });
  if (options.expectedStatus !== undefined) {
    assert.equal(envelope.status, options.expectedStatus, `${name} should return status ${options.expectedStatus}`);
  }
  if (options.expectedRejection) context.result.expectedRejections += 1;
  if (options.expectedRecovery) context.result.expectedRecoveryAttempts += 1;
  const expectedTarget = targetFingerprint(args.target);
  const actualTarget = targetFingerprint(
    envelope.facade && typeof envelope.facade === 'object'
      ? (envelope.facade as Record<string, unknown>).target
      : undefined,
  );
  if (expectedTarget && actualTarget && expectedTarget !== actualTarget) {
    context.result.wrongTargetIncidents += 1;
  }
  if (options.validation) context.result.validationCovered = true;
  if (options.boundedRead) {
    context.result.boundedReads += 1;
    assert.ok(boundedByteSize(envelope) <= DEFAULT_MAX_BYTES, `${name} should respect the 24KB response cap`);
    context.result.boundedReadsPassed += 1;
  }
  return envelope;
}

function targetFingerprint(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const target = value as Record<string, unknown>;
  const normalized = {
    kind: target.kind,
    file_path: target.file_path,
    reference_id: target.reference_id,
    name: target.name,
  };
  return JSON.stringify(normalized);
}

async function startScenarioRuntime(
  file: string | undefined,
  refs: string[],
  userDataDir: string,
  toolProfile = 'facade-first',
): Promise<StandaloneClientRuntime> {
  return startStandaloneClient({
    ...(file ? { file } : {}),
    refs,
    userDataDir,
    allowWrites: true,
    toolProfile,
    clientName: 'mcp-workflow-eval-replay',
  });
}

async function applyEditPreview(
  context: ScenarioContext,
  target: Record<string, unknown>,
  envelope: McpCallJson,
): Promise<McpCallJson> {
  const previewInfo = preview(envelope, 'edit preview');
  return scenarioCall(context, 'apply_edit', {
    preview_token: previewInfo.preview_token,
    operation_digest: previewInfo.operation_digest,
    target,
    guard_values: previewInfo.required_guards,
  });
}

async function applyItemsPreview(
  context: ScenarioContext,
  target: Record<string, unknown>,
  family: string,
  envelope: McpCallJson,
): Promise<McpCallJson> {
  const previewInfo = preview(envelope, `${family} items preview`);
  return scenarioCall(context, 'manage_items', {
    target,
    family,
    mode: 'apply',
    preview_token: previewInfo.preview_token,
    operation_digest: previewInfo.operation_digest,
    guard_values: previewInfo.required_guards,
  });
}

async function applyAssetPreview(
  context: ScenarioContext,
  target: Record<string, unknown>,
  assetFamily: 'charx' | 'risum',
  envelope: McpCallJson,
): Promise<McpCallJson> {
  const previewInfo = preview(envelope, `${assetFamily} asset preview`);
  return scenarioCall(context, 'manage_assets', {
    target,
    asset_family: assetFamily,
    mode: 'apply',
    preview_token: previewInfo.preview_token,
    operation_digest: previewInfo.operation_digest,
    guard_values: previewInfo.required_guards,
  });
}

async function applyFilePreview(
  context: ScenarioContext,
  target: Record<string, unknown>,
  envelope: McpCallJson,
): Promise<McpCallJson> {
  const previewInfo = preview(envelope, 'file preview');
  return scenarioCall(context, 'manage_file', {
    target,
    mode: 'apply',
    preview_token: previewInfo.preview_token,
    operation_digest: previewInfo.operation_digest,
    guard_values: previewInfo.required_guards,
  });
}

async function saveActiveDocument(context: ScenarioContext): Promise<void> {
  const target = { kind: 'active' };
  const savePreviewEnvelope = await scenarioCall(context, 'manage_file', {
    target,
    mode: 'preview',
    operation: { action: 'save_current_file' },
  });
  const savePreview = preview(savePreviewEnvelope, 'save current file preview');
  await scenarioCall(context, 'manage_file', {
    target,
    mode: 'apply',
    preview_token: savePreview.preview_token,
    operation_digest: savePreview.operation_digest,
    guard_values: savePreview.required_guards,
  });
}

async function runRoutingScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(fixtures.activeCharx, [fixtures.referenceCharx], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));

    const activeInspect = await scenarioCall(
      context,
      'inspect_document',
      { target: { kind: 'active' } },
      { boundedRead: true },
    );
    jsonContains(activeInspect, 'Workflow Replay Active', 'active inspect');
    const activeRead = await scenarioCall(
      context,
      'read_content',
      { target: { kind: 'active' }, selectors: [{ family: 'field', field: 'description' }] },
      { boundedRead: true },
    );
    jsonContains(activeRead, WORKFLOW_MARKERS.active, 'active read');

    const externalTarget = { kind: 'external', file_path: fixtures.externalCharx };
    const externalInspect = await scenarioCall(
      context,
      'inspect_document',
      { target: externalTarget },
      { boundedRead: true },
    );
    jsonContains(externalInspect, 'Workflow Replay External', 'external inspect');
    const externalRead = await scenarioCall(
      context,
      'read_content',
      { target: externalTarget, selectors: [{ family: 'field', field: 'description' }] },
      { boundedRead: true },
    );
    jsonContains(externalRead, WORKFLOW_MARKERS.external, 'external read');

    const referenceTarget = { kind: 'reference', reference_id: '0' };
    const referenceInspect = await scenarioCall(
      context,
      'inspect_document',
      { target: referenceTarget },
      { boundedRead: true },
    );
    jsonContains(referenceInspect, 'reference.charx', 'reference inspect');
    const referenceRead = await scenarioCall(
      context,
      'read_content',
      { target: referenceTarget, selectors: [{ family: 'field', field: 'description' }] },
      { boundedRead: true, validation: true },
    );
    jsonContains(referenceRead, WORKFLOW_MARKERS.reference, 'reference read');

    const activeSearch = await scenarioCall(
      context,
      'search_document',
      {
        target: { kind: 'active' },
        selector: { family: 'field', field: 'description' },
        query: WORKFLOW_MARKERS.active,
        max_matches: 3,
      },
      { boundedRead: true },
    );
    jsonContains(activeSearch, WORKFLOW_MARKERS.active, 'active search');
    const externalSearch = await scenarioCall(
      context,
      'search_document',
      {
        target: externalTarget,
        field: 'description',
        query: WORKFLOW_MARKERS.external,
        max_matches: 3,
      },
      { boundedRead: true },
    );
    jsonContains(externalSearch, WORKFLOW_MARKERS.external, 'external search');
    const referenceSearch = await scenarioCall(
      context,
      'search_document',
      {
        target: referenceTarget,
        field: 'description',
        query: WORKFLOW_MARKERS.reference,
        max_matches: 3,
      },
      { boundedRead: true },
    );
    jsonContains(referenceSearch, WORKFLOW_MARKERS.reference, 'reference search');

    await scenarioCall(
      context,
      'analyze_content',
      { target: { kind: 'active' }, operation: { action: 'field_stats', field: 'description' } },
      { boundedRead: true },
    );
    await scenarioCall(
      context,
      'analyze_content',
      {
        target: { kind: 'session' },
        operation: { action: 'token_count', encoding: 'cl100k_base', text: 'workflow replay' },
      },
      { boundedRead: true },
    );
    const lorebookSimulation = await scenarioCall(
      context,
      'analyze_content',
      {
        target: { kind: 'active' },
        operation: {
          action: 'simulate_lorebook',
          messages: [{ role: 'user', content: 'workflow-replay-1' }],
        },
      },
      { boundedRead: true },
    );
    jsonContains(lorebookSimulation, 'Workflow Replay Lore 1', 'lorebook simulation');
    const regexSimulation = await scenarioCall(
      context,
      'analyze_content',
      {
        target: { kind: 'active' },
        operation: {
          action: 'test_regex',
          text: WORKFLOW_MARKERS.regexBefore,
          mode: 'editoutput',
        },
      },
      { boundedRead: true },
    );
    jsonContains(regexSimulation, WORKFLOW_MARKERS.regexAfter, 'regex simulation');
    await scenarioCall(
      context,
      'analyze_content',
      {
        target: { kind: 'active' },
        operation: { action: 'list_cbs_toggles', field: 'description' },
      },
      { boundedRead: true },
    );
    await scenarioCall(
      context,
      'analyze_content',
      {
        target: { kind: 'active' },
        operation: {
          action: 'diff_cbs',
          field: 'description',
          toggles: { workflow_toggle: 'on' },
        },
      },
      { boundedRead: true },
    );
    await scenarioCall(
      context,
      'validate_content',
      {
        target: { kind: 'active' },
        selectors: [
          { family: 'lorebook' },
          { family: 'regex' },
          { family: 'cbs', field: 'description' },
          { family: 'lua' },
          { family: 'trigger' },
        ],
      },
      { boundedRead: true, validation: true },
    );
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runBatchScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(fixtures.activeCharx, [], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const target = { kind: 'active' };
    const editPreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'replace_all_text',
          selector: { family: 'lorebook' },
          field: 'content',
          find: WORKFLOW_MARKERS.lorebookBefore,
          replace: WORKFLOW_MARKERS.lorebookAfter,
        },
      ],
    });
    const previewInfo = preview(editPreview, 'batch preview');
    await scenarioCall(context, 'apply_edit', {
      preview_token: previewInfo.preview_token,
      operation_digest: previewInfo.operation_digest,
      target,
    });
    await scenarioCall(
      context,
      'validate_content',
      { target, selectors: [{ family: 'lorebook' }] },
      { boundedRead: true, validation: true },
    );
    const read = await scenarioCall(
      context,
      'read_content',
      { target, selectors: [{ family: 'lorebook' }] },
      { boundedRead: true },
    );
    jsonContains(read, WORKFLOW_MARKERS.lorebookAfter, 'batch lorebook read');
    await saveActiveDocument(context);

    await runtime.close();
    runtime = null;
    const reopened = openCharx(fixtures.activeCharx);
    const reopenedLorebook = reopened.lorebook as Array<Record<string, unknown>> | undefined;
    assert.equal(reopenedLorebook?.length, 3);
    assert.ok(reopenedLorebook?.every((entry) => String(entry.content).includes(WORKFLOW_MARKERS.lorebookAfter)));
    assert.ok(reopenedLorebook?.every((entry) => !String(entry.content).includes(WORKFLOW_MARKERS.lorebookBefore)));
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runStaleScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(fixtures.activeCharx, [], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const target = { kind: 'active' };
    const stalePreviewEnvelope = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'firstMessage' },
          find: 'Workflow replay hello.',
          replace: WORKFLOW_MARKERS.staleConcurrent,
        },
      ],
    });
    const stalePreview = preview(stalePreviewEnvelope, 'stale field preview');
    await applyEditPreview(context, target, stalePreviewEnvelope);
    await scenarioCall(
      context,
      'apply_edit',
      {
        target,
        preview_token: stalePreview.preview_token,
        operation_digest: stalePreview.operation_digest,
        guard_values: stalePreview.required_guards,
      },
      { expectError: true, expectedStatus: 404, expectedRejection: true },
    );

    await scenarioCall(
      context,
      'read_content',
      { target, selectors: [{ family: 'field', field: 'firstMessage' }] },
      { boundedRead: true, expectedRecovery: true },
    );
    const freshPreviewEnvelope = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'firstMessage' },
          find: WORKFLOW_MARKERS.staleConcurrent,
          replace: WORKFLOW_MARKERS.staleFinal,
        },
      ],
    });
    await applyEditPreview(context, target, freshPreviewEnvelope);
    const finalRead = await scenarioCall(
      context,
      'read_content',
      { target, selectors: [{ family: 'field', field: 'firstMessage' }] },
      { boundedRead: true, validation: true },
    );
    jsonContains(finalRead, WORKFLOW_MARKERS.staleFinal, 'stale recovery read');
    await saveActiveDocument(context);

    await runtime.close();
    runtime = null;
    const reopened = openCharx(fixtures.activeCharx);
    assert.equal(reopened.firstMessage, WORKFLOW_MARKERS.staleFinal);
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runDestructiveScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(fixtures.activeCharx, [], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const target = { kind: 'active' };
    await scenarioCall(
      context,
      'manage_assets',
      {
        target,
        asset_family: 'charx',
        mode: 'apply',
        preview_token: 'facade-preview-v1.missingManageAssetsPreviewToken',
        operation_digest: 'missing-manage-assets-operation-digest',
        guard_values: [{ name: 'expected_asset_collection_digest', value: 'missing' }],
      },
      { expectError: true, expectedStatus: 404, expectedRejection: true },
    );
    const before = await scenarioCall(
      context,
      'manage_assets',
      { target, asset_family: 'charx', mode: 'read', operation: { action: 'list_assets' } },
      { boundedRead: true, expectedRecovery: true },
    );
    jsonContains(before, WORKFLOW_MARKERS.assetPath, 'asset list before delete');

    const deletePreviewEnvelope = await scenarioCall(context, 'manage_assets', {
      target,
      asset_family: 'charx',
      mode: 'preview',
      operation: { action: 'delete_asset', selector: { path: WORKFLOW_MARKERS.assetPath } },
    });
    const deletePreview = preview(deletePreviewEnvelope, 'asset delete preview');
    await scenarioCall(context, 'manage_assets', {
      target,
      asset_family: 'charx',
      mode: 'apply',
      preview_token: deletePreview.preview_token,
      operation_digest: deletePreview.operation_digest,
      guard_values: deletePreview.required_guards,
    });
    await scenarioCall(
      context,
      'validate_content',
      { target, selectors: [{ family: 'asset' }] },
      { boundedRead: true, validation: true },
    );
    const after = await scenarioCall(
      context,
      'manage_assets',
      { target, asset_family: 'charx', mode: 'read', operation: { action: 'list_assets' } },
      { boundedRead: true },
    );
    assert.doesNotMatch(JSON.stringify(after), new RegExp(WORKFLOW_MARKERS.assetPath));
    await saveActiveDocument(context);

    await runtime.close();
    runtime = null;
    const reopened = openCharx(fixtures.activeCharx);
    assert.equal(
      reopened.assets?.some((asset) => asset.path === WORKFLOW_MARKERS.assetPath),
      false,
    );
    assert.equal(
      reopened.cardAssets?.some(
        (asset) => String((asset as Record<string, unknown>).uri) === WORKFLOW_MARKERS.assetPath,
      ),
      false,
    );
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runNoFileScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(undefined, [], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const noFile = await scenarioCall(
      context,
      'inspect_document',
      { target: { kind: 'active' } },
      { expectError: true, expectedStatus: 400, expectedRejection: true },
    );
    assert.equal(noFile.error, 'No file open');
    assert.ok(array(noFile.next_actions, 'no-file next_actions').includes('open_file'));

    const target = { kind: 'external', file_path: fixtures.externalCharx };
    const openPreviewEnvelope = await scenarioCall(
      context,
      'manage_file',
      {
        target,
        mode: 'preview',
        operation: { action: 'open_file' },
      },
      { expectedRecovery: true },
    );
    const openPreview = preview(openPreviewEnvelope, 'open file preview');
    await scenarioCall(context, 'manage_file', {
      target,
      mode: 'apply',
      preview_token: openPreview.preview_token,
      operation_digest: openPreview.operation_digest,
      guard_values: openPreview.required_guards,
    });
    const inspect = await scenarioCall(
      context,
      'inspect_document',
      { target: { kind: 'active' } },
      { boundedRead: true },
    );
    jsonContains(inspect, 'Workflow Replay External', 'opened document inspect');
    const read = await scenarioCall(
      context,
      'read_content',
      { target: { kind: 'active' }, selectors: [{ family: 'field', field: 'description' }] },
      { boundedRead: true, validation: true },
    );
    jsonContains(read, WORKFLOW_MARKERS.external, 'opened document read');
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runCharxIndexedMutationScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(fixtures.activeCharx, [], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const target = { kind: 'external', file_path: fixtures.externalCharx };

    const initial = await scenarioCall(
      context,
      'read_content',
      {
        target,
        selectors: [
          { family: 'lorebook', index: 0 },
          { family: 'regex' },
          { family: 'regex', index: 0 },
          { family: 'greeting', greeting_type: 'alternate' },
          { family: 'greeting', greeting_type: 'alternate', index: 0 },
          { family: 'trigger' },
          { family: 'trigger', index: 1 },
          { family: 'lua' },
          { family: 'lua', index: 0 },
          { family: 'css' },
          { family: 'css', index: 0 },
        ],
      },
      { boundedRead: true },
    );
    jsonContains(initial, WORKFLOW_MARKERS.regexBefore, 'initial external charx read');
    jsonContains(initial, WORKFLOW_MARKERS.greetingBefore, 'initial external greeting read');

    const surfacePreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'patch_surface',
          selector: { family: 'surface', path: '/' },
          content: [{ op: 'replace', path: '/name', value: 'Workflow Replay External Patched' }],
        },
      ],
    });
    await applyEditPreview(context, target, surfacePreview);

    const lorebookPreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'lorebook', index: 0, field: 'content' },
          find: WORKFLOW_MARKERS.lorebookBefore,
          replace: WORKFLOW_MARKERS.lorebookAfter,
        },
      ],
    });
    await applyEditPreview(context, target, lorebookPreview);

    await scenarioCall(
      context,
      'preview_edit',
      {
        target,
        operations: [
          {
            op: 'write_content',
            selector: { family: 'regex', identity: { comment: 'Workflow Replay Duplicate' } },
            content: { replace: 'ambiguous-write-must-not-apply' },
          },
        ],
      },
      { expectError: true, expectedStatus: 409, expectedRejection: true },
    );
    const regexWritePreview = await scenarioCall(
      context,
      'preview_edit',
      {
        target,
        operations: [
          {
            op: 'write_content',
            selector: { family: 'regex', indices: [0, 1] },
            content: {
              entries: [
                {
                  data: {
                    comment: 'Workflow Replay Regex Updated',
                    type: 'editoutput',
                    find: WORKFLOW_MARKERS.regexBefore,
                    replace: 'workflow-replay-regex-updated',
                    flag: 'g',
                  },
                },
                {
                  data: {
                    comment: 'Workflow Replay Duplicate',
                    type: 'editoutput',
                    find: 'workflow-replay-duplicate-one',
                    replace: 'duplicate-one-updated',
                    flag: 'g',
                  },
                },
              ],
            },
          },
        ],
      },
      { expectedRecovery: true },
    );
    await applyEditPreview(context, target, regexWritePreview);
    const regexDeletePreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [{ op: 'delete_item', selector: { family: 'regex', index: 2 } }],
    });
    await applyEditPreview(context, target, regexDeletePreview);

    const greetingWritePreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'write_content',
          selector: { family: 'greeting', greeting_type: 'alternate', indices: [0, 1] },
          content: {
            writes: [
              { content: `${WORKFLOW_MARKERS.greetingAfter} one` },
              { content: `${WORKFLOW_MARKERS.greetingAfter} two` },
            ],
          },
        },
      ],
    });
    await applyEditPreview(context, target, greetingWritePreview);
    const greetingDeletePreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'delete_item',
          selector: { family: 'greeting', greeting_type: 'alternate', indices: [1] },
        },
      ],
    });
    await applyEditPreview(context, target, greetingDeletePreview);

    const triggerPreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'write_content',
          selector: { family: 'trigger', index: 0 },
          content: { comment: 'Workflow Replay Trigger Updated' },
        },
      ],
    });
    await applyEditPreview(context, target, triggerPreview);
    const luaPreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'lua', index: 0 },
          find: WORKFLOW_MARKERS.luaBefore,
          replace: WORKFLOW_MARKERS.luaAfter,
        },
      ],
    });
    await applyEditPreview(context, target, luaPreview);
    const cssPreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'css', index: 0 },
          find: WORKFLOW_MARKERS.cssBefore,
          replace: WORKFLOW_MARKERS.cssAfter,
        },
      ],
    });
    await applyEditPreview(context, target, cssPreview);

    await scenarioCall(
      context,
      'validate_content',
      { target, selectors: [{ family: 'lua' }, { family: 'trigger' }] },
      { boundedRead: true, validation: true },
    );

    await runtime.close();
    runtime = null;
    const reopened = openCharx(fixtures.externalCharx);
    assert.equal(reopened.name, 'Workflow Replay External Patched');
    assert.match(String((reopened.lorebook[0] as Record<string, unknown>).content), /workflow-replay-lore-after/);
    assert.deepEqual(reopened.alternateGreetings, [`${WORKFLOW_MARKERS.greetingAfter} one`]);
    assert.equal(reopened.regex.length, 2);
    assert.equal((reopened.regex[0] as Record<string, unknown>).comment, 'Workflow Replay Regex Updated');
    assert.equal(reopened.triggerScripts[0]?.comment, 'Workflow Replay Trigger Updated');
    assert.match(reopened.lua, new RegExp(WORKFLOW_MARKERS.luaAfter));
    assert.match(reopened.css, new RegExp(WORKFLOW_MARKERS.cssAfter));
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runCharxManageItemsScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(fixtures.activeCharx, [], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const target = { kind: 'external', file_path: fixtures.externalCharx };

    await scenarioCall(
      context,
      'read_content',
      {
        target,
        selectors: [
          { family: 'lorebook' },
          { family: 'regex' },
          { family: 'greeting', greeting_type: 'alternate' },
          { family: 'trigger' },
          { family: 'lua' },
          { family: 'css' },
        ],
      },
      { boundedRead: true },
    );

    const lorebookAdd = await scenarioCall(context, 'manage_items', {
      target,
      family: 'lorebook',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ comment: 'Workflow Managed Lore', key: 'workflow-managed', content: 'managed lore content' }],
      },
    });
    await applyItemsPreview(context, target, 'lorebook', lorebookAdd);
    const lorebookReorder = await scenarioCall(context, 'manage_items', {
      target,
      family: 'lorebook',
      mode: 'preview',
      operation: { action: 'reorder_items', order: [3, 0, 1, 2] },
    });
    await applyItemsPreview(context, target, 'lorebook', lorebookReorder);

    const regexAdd = await scenarioCall(context, 'manage_items', {
      target,
      family: 'regex',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ comment: 'Workflow Managed Regex', find: 'workflow-managed', replace: 'managed', flag: 'g' }],
      },
    });
    await applyItemsPreview(context, target, 'regex', regexAdd);
    const regexReorder = await scenarioCall(context, 'manage_items', {
      target,
      family: 'regex',
      mode: 'preview',
      operation: { action: 'reorder_items', order: [3, 0, 1, 2] },
    });
    await applyItemsPreview(context, target, 'regex', regexReorder);

    const greetingAdd = await scenarioCall(context, 'manage_items', {
      target,
      family: 'greeting',
      mode: 'preview',
      operation: {
        action: 'add_items',
        greeting_type: 'alternate',
        items: [{ content: 'Workflow managed alternate greeting.' }],
      },
    });
    await applyItemsPreview(context, target, 'greeting', greetingAdd);
    const greetingReorder = await scenarioCall(context, 'manage_items', {
      target,
      family: 'greeting',
      mode: 'preview',
      operation: { action: 'reorder_items', greeting_type: 'alternate', order: [2, 0, 1] },
    });
    await applyItemsPreview(context, target, 'greeting', greetingReorder);

    const triggerAdd = await scenarioCall(context, 'manage_items', {
      target,
      family: 'trigger',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [
          {
            comment: 'Workflow Managed Trigger',
            type: 'start',
            conditions: [],
            effect: [],
            lowLevelAccess: false,
          },
        ],
      },
    });
    await applyItemsPreview(context, target, 'trigger', triggerAdd);
    const triggerReorder = await scenarioCall(context, 'manage_items', {
      target,
      family: 'trigger',
      mode: 'preview',
      operation: { action: 'reorder_items', order: [2, 0, 1] },
    });
    await applyItemsPreview(context, target, 'trigger', triggerReorder);

    const luaAdd = await scenarioCall(context, 'manage_items', {
      target,
      family: 'lua',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ name: 'workflow_managed_lua', content: 'print("workflow managed lua")' }],
      },
    });
    await applyItemsPreview(context, target, 'lua', luaAdd);

    const cssAdd = await scenarioCall(context, 'manage_items', {
      target,
      family: 'css',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ name: 'workflow_managed_css', content: '.workflow-managed { color: green; }' }],
      },
    });
    await applyItemsPreview(context, target, 'css', cssAdd);
    const cssReorder = await scenarioCall(context, 'manage_items', {
      target,
      family: 'css',
      mode: 'preview',
      operation: { action: 'reorder_items', order: [2, 0, 1] },
    });
    await applyItemsPreview(context, target, 'css', cssReorder);

    await scenarioCall(
      context,
      'validate_content',
      { target, selectors: [{ family: 'lua' }, { family: 'trigger' }] },
      { boundedRead: true, validation: true },
    );

    await runtime.close();
    runtime = null;
    const reopened = openCharx(fixtures.externalCharx);
    assert.equal((reopened.lorebook[0] as Record<string, unknown>).comment, 'Workflow Managed Lore');
    assert.equal((reopened.regex[0] as Record<string, unknown>).comment, 'Workflow Managed Regex');
    assert.equal(reopened.alternateGreetings[0], 'Workflow managed alternate greeting.');
    assert.equal(reopened.triggerScripts[0]?.comment, 'Workflow Managed Trigger');
    assert.match(reopened.lua, /workflow_managed_lua/);
    assert.match(reopened.css, /workflow_managed_css/);
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runRisupIndexedMutationScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(fixtures.activeRisup, [], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const target = { kind: 'external', file_path: fixtures.externalRisup };

    const initial = await scenarioCall(
      context,
      'read_content',
      {
        target,
        selectors: [
          { family: 'risup-prompt' },
          { family: 'risup-prompt', indices: [0, 1] },
          { family: 'field', field: 'customPromptTemplateToggle' },
        ],
      },
      { boundedRead: true },
    );
    jsonContains(initial, WORKFLOW_MARKERS.risupBefore, 'initial risup read');
    const search = await scenarioCall(
      context,
      'search_document',
      { target, field: 'risup-prompt', query: WORKFLOW_MARKERS.risupBefore, max_matches: 3 },
      { boundedRead: true },
    );
    jsonContains(search, WORKFLOW_MARKERS.risupBefore, 'risup prompt search');

    const singleWrite = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'write_content',
          selector: { family: 'risup-prompt', index: 0 },
          content: {
            type: 'plain',
            type2: 'normal',
            text: `${WORKFLOW_MARKERS.risupAfter} single`,
            role: 'system',
          },
        },
      ],
    });
    await applyEditPreview(context, target, singleWrite);

    const batchWrite = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'write_content',
          selector: { family: 'risup-prompt', indices: [0, 1] },
          content: {
            writes: [
              {
                item: {
                  type: 'plain',
                  type2: 'normal',
                  text: `${WORKFLOW_MARKERS.risupAfter} batch one`,
                  role: 'system',
                },
              },
              {
                item: {
                  type: 'jailbreak',
                  type2: 'normal',
                  text: `${WORKFLOW_MARKERS.risupAfter} batch two`,
                  role: 'system',
                },
              },
            ],
          },
        },
      ],
    });
    await applyEditPreview(context, target, batchWrite);

    const deletePreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [{ op: 'delete_item', selector: { family: 'risup-prompt', indices: [2] } }],
    });
    await applyEditPreview(context, target, deletePreview);

    const togglePreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'customPromptTemplateToggle' },
          find: WORKFLOW_MARKERS.risupBefore,
          replace: WORKFLOW_MARKERS.risupAfter,
        },
      ],
    });
    await applyEditPreview(context, target, togglePreview);

    await scenarioCall(
      context,
      'validate_content',
      { target, selectors: [{ family: 'risup-prompt' }, { field: 'formatingOrder' }] },
      { boundedRead: true, validation: true },
    );

    await runtime.close();
    runtime = null;
    const reopened = openRisup(fixtures.externalRisup);
    const prompts = JSON.parse(String(reopened.promptTemplate)) as Array<Record<string, unknown>>;
    assert.equal(prompts.length, 2);
    assert.equal(prompts[0]?.text, `${WORKFLOW_MARKERS.risupAfter} batch one`);
    assert.equal(prompts[1]?.text, `${WORKFLOW_MARKERS.risupAfter} batch two`);
    assert.match(String(reopened.customPromptTemplateToggle), new RegExp(WORKFLOW_MARKERS.risupAfter));
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runRisupManageItemsScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(fixtures.activeRisup, [fixtures.referenceRisup], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const target = { kind: 'external', file_path: fixtures.externalRisup };

    const copy = await scenarioCall(
      context,
      'manage_items',
      {
        target,
        family: 'risup-prompt',
        mode: 'read',
        operation: { action: 'copy_as_text', selector: { indices: [0, 1] } },
      },
      { boundedRead: true },
    );
    const copiedText = String(record(copy.result, 'copy result').text ?? '');
    assert.match(copiedText, /### \[/);

    const addPreview = await scenarioCall(context, 'manage_items', {
      target,
      family: 'risup-prompt',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [
          {
            type: 'plain',
            type2: 'normal',
            text: 'Workflow managed external prompt.',
            role: 'system',
          },
        ],
      },
    });
    await applyItemsPreview(context, target, 'risup-prompt', addPreview);

    const promptRead = await scenarioCall(
      context,
      'read_content',
      { target, selectors: [{ family: 'risup-prompt' }] },
      { boundedRead: true },
    );
    const readItems = array(record(promptRead.result, 'prompt read result').items, 'prompt read items');
    const promptData = record(record(readItems[0], 'prompt read item').data, 'prompt read data');
    const promptSummaries = array(promptData.items, 'prompt summaries').map((item) => record(item, 'prompt summary'));
    const promptIds = promptSummaries.map((item) => String(item.id));
    assert.equal(promptIds.length, 4);

    const reorderPreview = await scenarioCall(context, 'manage_items', {
      target,
      family: 'risup-prompt',
      mode: 'preview',
      operation: { action: 'reorder_items', order_ids: [...promptIds].reverse() },
    });
    await applyItemsPreview(context, target, 'risup-prompt', reorderPreview);

    const saveSnippetPreview = await scenarioCall(context, 'manage_items', {
      target,
      family: 'risup-prompt',
      mode: 'preview',
      operation: { action: 'save_snippet', name: 'Workflow Replay Snippet', selector: { indices: [0, 1] } },
    });
    await applyItemsPreview(context, target, 'risup-prompt', saveSnippetPreview);
    const snippets = await scenarioCall(
      context,
      'manage_items',
      {
        target,
        family: 'risup-prompt',
        mode: 'read',
        operation: { action: 'list_snippets' },
      },
      { boundedRead: true },
    );
    jsonContains(snippets, 'Workflow Replay Snippet', 'snippet list');

    const insertSnippetPreview = await scenarioCall(context, 'manage_items', {
      target,
      family: 'risup-prompt',
      mode: 'preview',
      operation: { action: 'insert_snippet', identifier: 'Workflow Replay Snippet', insertAt: 0 },
    });
    await applyItemsPreview(context, target, 'risup-prompt', insertSnippetPreview);

    const importPreview = await scenarioCall(context, 'manage_items', {
      target,
      family: 'risup-prompt',
      mode: 'preview',
      operation: { action: 'import_text', text: copiedText, import_mode: 'append' },
    });
    await applyItemsPreview(context, target, 'risup-prompt', importPreview);

    await scenarioCall(
      context,
      'analyze_content',
      {
        target: { kind: 'active' },
        operation: { action: 'verify_risup_prompt_import', text: copiedText },
      },
      { boundedRead: true, validation: true },
    );
    await scenarioCall(
      context,
      'analyze_content',
      {
        target: { kind: 'active' },
        operation: {
          action: 'diff_risup_prompt',
          reference: { kind: 'reference', reference_id: '0' },
        },
      },
      { boundedRead: true, validation: true },
    );
    await scenarioCall(
      context,
      'validate_content',
      { target, selectors: [{ family: 'risup-prompt' }] },
      { boundedRead: true, validation: true },
    );

    await runtime.close();
    runtime = null;
    const reopened = openRisup(fixtures.externalRisup);
    const prompts = JSON.parse(String(reopened.promptTemplate)) as Array<Record<string, unknown>>;
    assert.ok(prompts.length >= 8);
    assert.ok(prompts.some((item) => item.text === 'Workflow managed external prompt.'));
    assert.ok(prompts.filter((item) => String(item.text).includes(WORKFLOW_MARKERS.risupBefore)).length >= 4);
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runRisupFormattingOrderScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(fixtures.activeRisup, [], fixtures.userDataDir, 'authoring');
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const target = { kind: 'active' };

    const focusedRead = await scenarioCall(
      context,
      'read_content',
      { target, selectors: [{ family: 'field', field: 'formatingOrder' }] },
      { boundedRead: true },
    );
    jsonContains(focusedRead, 'description', 'formatting order focused read');
    await scenarioCall(context, 'read_risup_formating_order', {});
    await scenarioCall(context, 'write_risup_formating_order', {
      items: [{ token: 'main' }, { token: 'jailbreak' }, { token: 'description' }],
    });
    await scenarioCall(
      context,
      'validate_content',
      { target, selectors: [{ field: 'formatingOrder' }, { family: 'risup-prompt' }] },
      { boundedRead: true, validation: true },
    );
    await saveActiveDocument(context);

    await runtime.close();
    runtime = null;
    const reopened = openRisup(fixtures.activeRisup);
    assert.deepEqual(JSON.parse(String(reopened.formatingOrder)), ['main', 'jailbreak', 'description']);
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runRisupProjectFileScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  const projectPath = path.join(fixtures.dir, 'workflow-replay-preset-project');
  const outputPath = path.join(fixtures.dir, 'workflow-replay-preset-output.risup');
  try {
    runtime = await startScenarioRuntime(undefined, [], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const sourceTarget = { kind: 'external', file_path: fixtures.externalRisup };

    const extractPreview = await scenarioCall(context, 'manage_file', {
      target: sourceTarget,
      mode: 'preview',
      operation: { action: 'extract_project', project_path: projectPath },
    });
    await applyFilePreview(context, sourceTarget, extractPreview);
    assert.equal(fs.existsSync(path.join(projectPath, 'preset.json')), true);

    const projectTarget = { kind: 'external', file_path: projectPath };
    const tree = await scenarioCall(
      context,
      'manage_file',
      { target: projectTarget, mode: 'read', operation: { action: 'project_tree' } },
      { boundedRead: true },
    );
    jsonContains(tree, 'preset.json', 'project tree');

    const reassemblePreview = await scenarioCall(context, 'manage_file', {
      target: projectTarget,
      mode: 'preview',
      operation: { action: 'reassemble_project', output_path: outputPath },
    });
    await applyFilePreview(context, projectTarget, reassemblePreview);
    const inspect = await scenarioCall(
      context,
      'inspect_document',
      { target: { kind: 'external', file_path: outputPath } },
      { boundedRead: true },
    );
    jsonContains(inspect, 'Workflow Replay External Preset', 'reassembled preset inspect');
    await scenarioCall(
      context,
      'validate_content',
      {
        target: { kind: 'external', file_path: outputPath },
        selectors: [{ family: 'risup-prompt' }, { field: 'formatingOrder' }],
      },
      { boundedRead: true, validation: true },
    );

    await runtime.close();
    runtime = null;
    const source = openRisup(fixtures.externalRisup);
    const reopened = openRisup(outputPath);
    assert.deepEqual(JSON.parse(String(reopened.promptTemplate)), JSON.parse(String(source.promptTemplate)));
    assert.deepEqual(JSON.parse(String(reopened.formatingOrder)), JSON.parse(String(source.formatingOrder)));
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

async function runRisumFacadeSurfaceScenario(context: ScenarioContext): Promise<void> {
  const fixtures = createWorkflowEvalFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startScenarioRuntime(fixtures.activeRisum, [], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const target = { kind: 'external', file_path: fixtures.externalRisum };

    const inspect = await scenarioCall(context, 'inspect_document', { target }, { boundedRead: true });
    jsonContains(inspect, 'Workflow Replay External Module', 'risum inspect');
    const fields = await scenarioCall(
      context,
      'read_content',
      {
        target,
        selectors: [
          { family: 'field', field: 'moduleName' },
          { family: 'field', field: 'moduleNamespace' },
          { family: 'field', field: 'mcpUrl' },
          { family: 'field', field: 'lowLevelAccess' },
          { family: 'field', field: 'backgroundEmbedding' },
          { family: 'field', field: 'customModuleToggle' },
        ],
      },
      { boundedRead: true },
    );
    jsonContains(fields, 'workflow.replay.external', 'risum module-specific read');
    jsonContains(fields, WORKFLOW_MARKERS.risumBefore, 'risum editable fields read');
    const search = await scenarioCall(
      context,
      'search_document',
      { target, field: 'backgroundEmbedding', query: WORKFLOW_MARKERS.risumBefore, max_matches: 3 },
      { boundedRead: true },
    );
    jsonContains(search, WORKFLOW_MARKERS.risumBefore, 'risum background search');

    const editPreview = await scenarioCall(context, 'preview_edit', {
      target,
      operations: [
        {
          op: 'patch_surface',
          selector: { family: 'surface', path: '/' },
          content: [
            { op: 'replace', path: '/lowLevelAccess', value: true },
            {
              op: 'replace',
              path: '/backgroundEmbedding',
              value: `<style>.workflow-module { color: ${WORKFLOW_MARKERS.risumAfter}; }</style>`,
            },
            {
              op: 'replace',
              path: '/customModuleToggle',
              value: `workflow_module_toggle=${WORKFLOW_MARKERS.risumAfter}`,
            },
          ],
        },
      ],
    });
    await applyEditPreview(context, target, editPreview);

    const assetAdd = await scenarioCall(context, 'manage_assets', {
      target,
      asset_family: 'risum',
      mode: 'preview',
      operation: {
        action: 'add_asset',
        name: 'workflow_replay_module_asset',
        path: 'workflow_replay_module_asset.png',
        base64: Buffer.from('workflow replay module asset').toString('base64'),
      },
    });
    await applyAssetPreview(context, target, 'risum', assetAdd);
    const assetList = await scenarioCall(
      context,
      'manage_assets',
      { target, asset_family: 'risum', mode: 'read', operation: { action: 'list_assets' } },
      { boundedRead: true },
    );
    jsonContains(assetList, 'workflow_replay_module_asset', 'risum asset list');

    const assetRename = await scenarioCall(context, 'manage_assets', {
      target,
      asset_family: 'risum',
      mode: 'preview',
      operation: {
        action: 'rename_asset',
        selector: { index: 0 },
        newName: 'workflow_replay_module_asset_renamed.png',
      },
    });
    await applyAssetPreview(context, target, 'risum', assetRename);
    const assetDelete = await scenarioCall(context, 'manage_assets', {
      target,
      asset_family: 'risum',
      mode: 'preview',
      operation: { action: 'delete_asset', selector: { index: 0 } },
    });
    await applyAssetPreview(context, target, 'risum', assetDelete);

    await scenarioCall(
      context,
      'validate_content',
      { target, selectors: [{ family: 'risum' }] },
      { boundedRead: true, validation: true },
    );

    await runtime.close();
    runtime = null;
    const reopened = openRisum(fixtures.externalRisum);
    assert.equal(reopened.lowLevelAccess, true);
    assert.match(String(reopened.backgroundEmbedding), new RegExp(WORKFLOW_MARKERS.risumAfter));
    assert.match(String(reopened.customModuleToggle), new RegExp(WORKFLOW_MARKERS.risumAfter));
    assert.equal(reopened.risumAssets?.length ?? 0, 0);
    const moduleAssets = (reopened._moduleData as { module?: { assets?: unknown[][] } } | null)?.module?.assets ?? [];
    assert.equal(moduleAssets.length, 0);
  } finally {
    if (runtime) await runtime.close();
    fixtures.cleanup();
  }
}

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'active-external-reference-routing',
    callBudget: 16,
    requiredTools: ['inspect_document', 'read_content', 'search_document', 'analyze_content', 'validate_content'],
    run: runRoutingScenario,
  },
  {
    id: 'batch-vs-single-edit',
    callBudget: 6,
    requiredTools: ['preview_edit', 'apply_edit', 'validate_content', 'read_content', 'manage_file'],
    run: runBatchScenario,
  },
  {
    id: 'stale-guard-refresh-retry',
    callBudget: 10,
    requiredTools: ['preview_edit', 'apply_edit', 'read_content', 'manage_file'],
    run: runStaleScenario,
  },
  {
    id: 'dry-run-first-destructive-edit',
    callBudget: 8,
    requiredTools: ['manage_assets', 'validate_content', 'manage_file'],
    run: runDestructiveScenario,
  },
  {
    id: 'no-file-open-workflow',
    callBudget: 5,
    requiredTools: ['inspect_document', 'manage_file', 'read_content'],
    run: runNoFileScenario,
  },
  {
    id: 'charx-facade-indexed-mutations',
    callBudget: 24,
    requiredTools: ['read_content', 'preview_edit', 'apply_edit', 'validate_content'],
    run: runCharxIndexedMutationScenario,
  },
  {
    id: 'charx-manage-items-families',
    callBudget: 26,
    requiredTools: ['read_content', 'manage_items', 'validate_content'],
    run: runCharxManageItemsScenario,
  },
  {
    id: 'risup-facade-indexed-mutations',
    callBudget: 12,
    requiredTools: ['read_content', 'search_document', 'preview_edit', 'apply_edit', 'validate_content'],
    run: runRisupIndexedMutationScenario,
  },
  {
    id: 'risup-manage-items-workflows',
    callBudget: 20,
    requiredTools: ['read_content', 'manage_items', 'analyze_content', 'validate_content'],
    run: runRisupManageItemsScenario,
  },
  {
    id: 'risup-formatting-order-authoring',
    callBudget: 7,
    requiredTools: [
      'read_content',
      'read_risup_formating_order',
      'write_risup_formating_order',
      'validate_content',
      'manage_file',
    ],
    run: runRisupFormattingOrderScenario,
  },
  {
    id: 'risup-project-file-roundtrip',
    callBudget: 7,
    requiredTools: ['manage_file', 'inspect_document', 'validate_content'],
    run: runRisupProjectFileScenario,
  },
  {
    id: 'risum-facade-surface-roundtrip',
    callBudget: 14,
    requiredTools: [
      'inspect_document',
      'read_content',
      'search_document',
      'preview_edit',
      'apply_edit',
      'manage_assets',
      'validate_content',
    ],
    run: runRisumFacadeSurfaceScenario,
  },
];

function scenarioTaskIds(id: CanonicalReplayScenarioId): string[] {
  return (WORKFLOW_EVAL_TASKS as readonly WorkflowEvalTask[])
    .filter((task) => task.replayScenarioIds?.includes(id))
    .map((task) => task.id);
}

async function executeScenario(definition: ScenarioDefinition): Promise<ScenarioResult> {
  const started = Date.now();
  const result: ScenarioResult = {
    id: definition.id,
    taskIds: scenarioTaskIds(definition.id),
    passed: false,
    callCount: 0,
    callBudget: definition.callBudget,
    expectedRejections: 0,
    expectedRecoveryAttempts: 0,
    wrongTargetIncidents: 0,
    validationCovered: false,
    boundedReads: 0,
    boundedReadsPassed: 0,
    requiredToolsPresent: false,
    durationMs: 0,
  };
  const context: ScenarioContext = {
    runtime: null as unknown as StandaloneClientRuntime,
    result,
    tools: new Set<string>(),
  };
  try {
    assert.ok(result.taskIds.length > 0, `${definition.id} should cover at least one replayable catalog task`);
    await definition.run(context);
    result.requiredToolsPresent = definition.requiredTools.every((tool) => context.tools.has(tool));
    assert.equal(result.requiredToolsPresent, true, `${definition.id} required tools should all be registered`);
    assert.ok(result.callCount <= result.callBudget, `${definition.id} exceeded call budget`);
    assert.equal(result.validationCovered, true, `${definition.id} should execute its declared validation`);
    assert.ok(result.boundedReads > 0, `${definition.id} should execute at least one bounded read`);
    assert.equal(result.boundedReadsPassed, result.boundedReads);
    result.passed = true;
  } catch (error) {
    result.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  } finally {
    result.durationMs = Date.now() - started;
  }
  return result;
}

function ratio(count: number, total: number): number {
  return total === 0 ? 1 : count / total;
}

async function main(): Promise<void> {
  const started = Date.now();
  const results: ScenarioResult[] = [];
  for (const scenario of SCENARIOS) results.push(await executeScenario(scenario));

  const replayableTasks = (WORKFLOW_EVAL_TASKS as readonly WorkflowEvalTask[]).filter(
    (task) => task.execution === 'replayable',
  );
  const registeredTaskIds = new Set(results.flatMap((result) => result.taskIds));
  assert.equal(registeredTaskIds.size, replayableTasks.length);

  const firstPassEligibleScenarios = results.filter((result) => result.expectedRejections === 0);
  const measuredMetrics = {
    scenarioCompletion: ratio(results.filter((result) => result.passed).length, results.length),
    requiredRouteConformance: ratio(results.filter((result) => result.requiredToolsPresent).length, results.length),
    firstPassCompletion: ratio(
      firstPassEligibleScenarios.filter((result) => result.passed).length,
      firstPassEligibleScenarios.length,
    ),
    wrongTargetIncidents: results.reduce((sum, result) => sum + result.wrongTargetIncidents, 0),
    validationCoverage: ratio(results.filter((result) => result.validationCovered).length, results.length),
    boundedReadCoverage: ratio(
      results.reduce((sum, result) => sum + result.boundedReadsPassed, 0),
      results.reduce((sum, result) => sum + result.boundedReads, 0),
    ),
  };
  const summary = {
    schemaVersion: 2,
    durationMs: Date.now() - started,
    coverage: {
      totalTasks: WORKFLOW_EVAL_TASKS.length,
      replayableTasks: replayableTasks.length,
      registeredReplayableTasks: registeredTaskIds.size,
      catalogScenarioCoverage: registeredTaskIds.size / replayableTasks.length,
      firstPassEligibleScenarios: firstPassEligibleScenarios.length,
    },
    measuredMetrics,
    expectedRejections: results.reduce((sum, result) => sum + result.expectedRejections, 0),
    expectedRecoveryAttempts: results.reduce((sum, result) => sum + result.expectedRecoveryAttempts, 0),
    scenarios: results,
  };
  console.log(JSON.stringify(summary, null, 2));

  assertReplayScenariosPassed(results);

  assert.ok(
    measuredMetrics.scenarioCompletion >= TARGET_METRICS.scenarioCompletion,
    'scenarioCompletion target not met',
  );
  assert.ok(
    measuredMetrics.requiredRouteConformance >= TARGET_METRICS.requiredRouteConformance,
    'requiredRouteConformance target not met',
  );
  assert.ok(
    measuredMetrics.firstPassCompletion >= TARGET_METRICS.firstPassCompletion,
    'firstPassCompletion target not met',
  );
  assert.equal(measuredMetrics.wrongTargetIncidents, TARGET_METRICS.wrongTargetIncidents);
  assert.ok(
    measuredMetrics.validationCoverage >= TARGET_METRICS.validationCoverage,
    'validationCoverage target not met',
  );
  assert.ok(
    measuredMetrics.boundedReadCoverage >= TARGET_METRICS.boundedReadCoverage,
    'boundedReadCoverage target not met',
  );
  assert.equal(summary.coverage.catalogScenarioCoverage, 1);
  assert.ok(summary.durationMs < 90_000, `workflow replay should finish under 90 seconds, got ${summary.durationMs}ms`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
