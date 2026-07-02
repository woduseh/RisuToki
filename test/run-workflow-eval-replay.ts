import assert from 'node:assert/strict';

import { openCharx } from '../src/charx-io';
import { WORKFLOW_EVAL_TASKS, type CanonicalReplayScenarioId, type WorkflowEvalTask } from './workflow-eval-catalog';
import { callJson, startStandaloneClient, type McpCallJson, type StandaloneClientRuntime } from './mcp-test-client';
import { createWorkflowEvalFixtures, WORKFLOW_MARKERS } from './workflow-eval-fixtures';

const DEFAULT_MAX_BYTES = 24 * 1024;
const REPLAYABLE_TASK_FLOOR = 5;

const TARGET_METRICS = {
  routeAccuracy: 0.95,
  firstPassSuccess: 0.85,
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
  if (options.validation) context.result.validationCovered = true;
  if (options.boundedRead) {
    context.result.boundedReads += 1;
    assert.ok(boundedByteSize(envelope) <= DEFAULT_MAX_BYTES, `${name} should respect the 24KB response cap`);
    context.result.boundedReadsPassed += 1;
  }
  return envelope;
}

async function startScenarioRuntime(
  file: string | undefined,
  refs: string[],
  userDataDir: string,
): Promise<StandaloneClientRuntime> {
  return startStandaloneClient({
    ...(file ? { file } : {}),
    refs,
    userDataDir,
    allowWrites: true,
    toolProfile: 'facade-first',
    clientName: 'mcp-workflow-eval-replay',
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
  const newComment = 'Workflow Replay Recovered Lore';
  const operation = {
    action: 'add_items',
    items: [{ comment: newComment, key: 'workflow-recovered', content: WORKFLOW_MARKERS.staleFinal }],
  };
  try {
    runtime = await startScenarioRuntime(fixtures.activeCharx, [], fixtures.userDataDir);
    context.runtime = runtime;
    context.tools = new Set((await runtime.client.listTools()).tools.map((tool) => tool.name));
    const target = { kind: 'active' };
    const stalePreviewEnvelope = await scenarioCall(context, 'manage_items', {
      target,
      family: 'lorebook',
      mode: 'preview',
      operation,
    });
    const stalePreview = preview(stalePreviewEnvelope, 'stale manage_items preview');
    const staleApply = await scenarioCall(
      context,
      'manage_items',
      {
        target,
        family: 'lorebook',
        mode: 'apply',
        preview_token: stalePreview.preview_token,
        operation_digest: stalePreview.operation_digest,
        guard_values: [{ name: 'expected_item_collection_digest', value: 'stale-collection-digest' }],
      },
      { expectError: true, expectedStatus: 409, expectedRejection: true },
    );
    const details = record(staleApply.details, 'stale error details');
    assert.equal(details.guard, 'expected_item_collection_digest');
    assert.equal(details.expected, 'stale-collection-digest');
    assert.equal(typeof details.actual, 'string');

    await scenarioCall(context, 'read_content', { target, selectors: [{ family: 'lorebook' }] }, { boundedRead: true });
    const freshPreviewEnvelope = await scenarioCall(context, 'manage_items', {
      target,
      family: 'lorebook',
      mode: 'preview',
      operation,
    });
    const freshPreview = preview(freshPreviewEnvelope, 'fresh manage_items preview');
    await scenarioCall(context, 'manage_items', {
      target,
      family: 'lorebook',
      mode: 'apply',
      preview_token: freshPreview.preview_token,
      operation_digest: freshPreview.operation_digest,
      guard_values: freshPreview.required_guards,
    });
    await scenarioCall(
      context,
      'validate_content',
      { target, selectors: [{ family: 'lorebook' }] },
      { boundedRead: true, validation: true },
    );
    const finalRead = await scenarioCall(
      context,
      'read_content',
      { target, selectors: [{ family: 'lorebook' }] },
      { boundedRead: true },
    );
    jsonContains(finalRead, newComment, 'stale recovery read');
    await saveActiveDocument(context);

    await runtime.close();
    runtime = null;
    const reopened = openCharx(fixtures.activeCharx);
    const reopenedLorebook = reopened.lorebook as Array<Record<string, unknown>> | undefined;
    assert.equal(reopenedLorebook?.filter((entry) => entry.comment === newComment).length, 1);
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
      { boundedRead: true },
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
    const openPreviewEnvelope = await scenarioCall(context, 'manage_file', {
      target,
      mode: 'preview',
      operation: { action: 'open_file' },
    });
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

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'active-external-reference-routing',
    callBudget: 6,
    requiredTools: ['inspect_document', 'read_content'],
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
    requiredTools: ['manage_items', 'validate_content', 'read_content'],
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
    assert.equal(result.taskIds.length, 1, `${definition.id} should cover exactly one primary catalog task`);
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
  assert.equal(replayableTasks.length, 35);
  assert.ok(registeredTaskIds.size >= REPLAYABLE_TASK_FLOOR);

  const measuredMetrics = {
    routeAccuracy: ratio(
      results.filter((result) => result.passed && result.requiredToolsPresent).length,
      results.length,
    ),
    firstPassSuccess: ratio(results.filter((result) => result.passed).length, results.length),
    wrongTargetIncidents: results.reduce((sum, result) => sum + result.wrongTargetIncidents, 0),
    validationCoverage: ratio(results.filter((result) => result.validationCovered).length, results.length),
    boundedReadCoverage: ratio(
      results.reduce((sum, result) => sum + result.boundedReadsPassed, 0),
      results.reduce((sum, result) => sum + result.boundedReads, 0),
    ),
  };
  const summary = {
    schemaVersion: 1,
    durationMs: Date.now() - started,
    coverage: {
      totalTasks: WORKFLOW_EVAL_TASKS.length,
      replayableTasks: replayableTasks.length,
      registeredReplayableTasks: registeredTaskIds.size,
      replayableRegistrationRatio: registeredTaskIds.size / replayableTasks.length,
    },
    measuredMetrics,
    expectedRejections: results.reduce((sum, result) => sum + result.expectedRejections, 0),
    scenarios: results,
  };
  console.log(JSON.stringify(summary, null, 2));

  assert.ok(measuredMetrics.routeAccuracy >= TARGET_METRICS.routeAccuracy, 'routeAccuracy target not met');
  assert.ok(measuredMetrics.firstPassSuccess >= TARGET_METRICS.firstPassSuccess, 'firstPassSuccess target not met');
  assert.equal(measuredMetrics.wrongTargetIncidents, TARGET_METRICS.wrongTargetIncidents);
  assert.ok(
    measuredMetrics.validationCoverage >= TARGET_METRICS.validationCoverage,
    'validationCoverage target not met',
  );
  assert.ok(
    measuredMetrics.boundedReadCoverage >= TARGET_METRICS.boundedReadCoverage,
    'boundedReadCoverage target not met',
  );
  assert.ok(summary.durationMs < 90_000, `workflow replay should finish under 90 seconds, got ${summary.durationMs}ms`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
