import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { openCharx, openRisum, openRisup } from '../src/charx-io';
import { MCP_DEFAULT_TOOLS_LIST_MAX_BYTES } from '../src/lib/mcp-compact-input';
import { callJson, startStandaloneClient, type StandaloneClientRuntime } from './mcp-test-client';
import {
  applyManageFilePreview,
  assertDefaultToolSchemas,
  assertToolProfileRuntimeHealth,
  createDogfoodFixtures,
  nestedArray,
  nestedRecord,
  previewToken,
  readStandaloneLog,
  routedTools,
} from './mcp-search-shared';

export async function runStandaloneFacadeDogfood(): Promise<void> {
  const fixture = createDogfoodFixtures();
  const activeTarget = { kind: 'active' };
  const referenceTarget = { kind: 'reference', reference_id: '0' };
  const presetReferenceTarget = { kind: 'reference', reference_id: '1' };
  const cardReferenceTarget = { kind: 'reference', reference_id: '2' };
  const externalTarget = { kind: 'external', file_path: fixture.externalFile };
  const facadeOnlyCalls: string[] = [];
  const metrics = {
    toolListByteCost: 0,
    facadeToolListByteCost: 0,
    activeWorkflowCallCount: 0,
    wrongToolAvoidance: true,
    granularFallbackFrequency: 0,
    staleGuardReuse: false,
    finalArtifactEquality: false,
  };

  let runtime: StandaloneClientRuntime | null = null;
  let recoveryRuntime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startStandaloneClient({
      file: fixture.mainFile,
      refs: [fixture.referenceRisum, fixture.referenceRisup, fixture.referenceCharx],
      userDataDir: fixture.userDataDir,
      allowWrites: true,
    });

    const tools = await runtime.client.listTools();
    metrics.toolListByteCost = Buffer.byteLength(JSON.stringify(tools), 'utf-8');
    metrics.facadeToolListByteCost = metrics.toolListByteCost;
    assert.ok(
      metrics.toolListByteCost <= MCP_DEFAULT_TOOLS_LIST_MAX_BYTES,
      'default tools/list should stay within the detailed schema budget',
    );
    assertDefaultToolSchemas(tools.tools);

    const unsupportedReferenceIdentity = await callJson(
      runtime,
      'read_content',
      { target: presetReferenceTarget, selectors: [{ family: 'risup-prompt', id: 'unsupported-reference-id' }] },
      { expectError: true },
    );
    assert.equal(unsupportedReferenceIdentity.status, 400);
    assert.deepEqual(unsupportedReferenceIdentity.next_actions, ['read_content']);

    const expectedFacadeTools = [
      'inspect_document',
      'list_tool_profiles',
      'search_document',
      'read_content',
      'analyze_content',
      'evaluate_bot',
      'preview_edit',
      'apply_edit',
      'validate_content',
      'manage_items',
      'manage_assets',
      'manage_file',
    ];
    const expectedBootstrapTools = [...expectedFacadeTools, 'list_skills', 'read_skill'];
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      expectedBootstrapTools.sort(),
      'default tools/list should expose the facade-first tools plus skill bootstrap tools',
    );
    for (const name of expectedFacadeTools) {
      const tool = tools.tools.find((candidate) => candidate.name === name);
      assert.equal(tool?._meta?.['risutoki/surfaceKind'], 'facade');
      assert.equal(tool?._meta?.['risutoki/recommendation'], 'preferred');
      assert.ok(Array.isArray(tool?._meta?.['risutoki/workflowStages']));
    }

    facadeOnlyCalls.push('inspect_document');
    const profileCatalog = await callJson(runtime, 'list_tool_profiles', { profile: 'facade-first' });
    assertToolProfileRuntimeHealth(profileCatalog);
    const profile = nestedRecord(profileCatalog.profile, 'profile catalog');
    assert.equal(profile.resolvedProfile, 'facade-first');
    assert.equal(profile.strictFiltering, true);
    assert.equal(profile.toolsListBehavior, 'profile-filtered');
    assert.equal(profile.currentProfile, 'facade-first');
    const profileCounts = nestedRecord(profile.counts, 'profile catalog.counts');
    assert.equal(profileCounts.registeredTools, tools.tools.length);
    assert.ok(Number(profileCounts.hiddenFromToolsList) > 0);
    const profileTools = nestedArray(profile.tools, 'profile catalog.tools');
    assert.equal(profileTools.length, tools.tools.length);
    assert.ok(
      profileTools.some((tool) => {
        const record = nestedRecord(tool, 'profile tool');
        return record.name === 'inspect_document' && record.registered === true;
      }),
    );
    const assertProfileToolWorkflowStages = (catalogTools: unknown[], toolName: string, workflowStages: string[]) => {
      const tool = catalogTools.find((candidate) => nestedRecord(candidate, 'profile tool').name === toolName);
      assert.deepEqual(
        nestedRecord(tool, `${toolName} profile catalog entry`).workflowStages,
        workflowStages,
        `${toolName} compact catalog entry should include workflowStages`,
      );
    };
    const facadeWorkflowStageExamples = [
      ['inspect_document', ['discover']],
      ['read_content', ['read']],
      ['search_document', ['search']],
      ['analyze_content', ['read', 'validate']],
      ['validate_content', ['validate']],
      ['preview_edit', ['preview']],
      ['apply_edit', ['apply']],
      ['manage_items', ['read', 'preview', 'apply']],
      ['manage_assets', ['read', 'preview', 'apply']],
      ['manage_file', ['read', 'preview', 'apply']],
    ] as const;
    for (const [toolName, workflowStages] of facadeWorkflowStageExamples) {
      assertProfileToolWorkflowStages(profileTools, toolName, [...workflowStages]);
    }
    const readonlyProfileCatalog = await callJson(runtime, 'list_tool_profiles', { profile: 'readonly' });
    const readonlyProfile = nestedRecord(readonlyProfileCatalog.profile, 'readonly profile catalog');
    const readonlyProfileTools = nestedArray(readonlyProfile.tools, 'readonly profile catalog.tools');
    const readonlyToolNames = readonlyProfileTools.map((tool) => nestedRecord(tool, 'readonly profile tool').name);
    assert.ok(!readonlyToolNames.includes('preview_edit'), 'readonly profile should not expose preview_edit');
    assert.ok(!readonlyToolNames.includes('apply_edit'), 'readonly profile should not expose apply_edit');
    assert.ok(!readonlyToolNames.includes('manage_items'), 'readonly profile should not expose manage_items');
    assert.ok(!readonlyToolNames.includes('manage_assets'), 'readonly profile should not expose manage_assets');
    assert.ok(!readonlyToolNames.includes('manage_file'), 'readonly profile should not expose manage_file');
    for (const [toolName, workflowStages] of [
      ['inspect_document', ['discover']],
      ['read_content', ['read']],
      ['search_document', ['search']],
      ['analyze_content', ['read', 'validate']],
      ['validate_content', ['validate']],
    ] as const) {
      assertProfileToolWorkflowStages(readonlyProfileTools, toolName, [...workflowStages]);
    }
    const authoringProfileCatalog = await callJson(runtime, 'list_tool_profiles', { profile: 'authoring' });
    const authoringProfile = nestedRecord(authoringProfileCatalog.profile, 'authoring profile catalog');
    const authoringProfileTools = nestedArray(authoringProfile.tools, 'authoring profile catalog.tools');
    for (const [toolName, workflowStages] of facadeWorkflowStageExamples) {
      assertProfileToolWorkflowStages(authoringProfileTools, toolName, [...workflowStages]);
    }
    const fullProfileCatalog = await callJson(runtime, 'list_tool_profiles', { profile: 'full' });
    const fullProfile = nestedRecord(fullProfileCatalog.profile, 'full profile catalog');
    assert.equal(fullProfile.resolvedProfile, 'advanced-full');
    const fullProfileTools = nestedArray(fullProfile.tools, 'full profile tools');
    assert.ok(fullProfileTools.length > tools.tools.length);
    assert.ok(
      fullProfileTools.some((tool) => nestedRecord(tool, 'full profile tool').registered === false),
      'advanced-full catalog should mark granular tools hidden by the active facade-first registration',
    );

    for (const [operation, expectedRoute, target] of [
      [{ action: 'tag_db_status' }, 'tag_db_status', { kind: 'session' }],
      [{ action: 'search_danbooru_tags', query: 'blue_hair', limit: 5 }, 'search_danbooru_tags', { kind: 'session' }],
      [
        { action: 'get_popular_danbooru_tags', category: 'general', limit: 5 },
        'get_popular_danbooru_tags',
        { kind: 'session' },
      ],
      [{ action: 'list_cbs_toggles', field: 'description' }, 'list_cbs_toggles', activeTarget],
      [
        { action: 'simulate_cbs', field: 'description', toggles: { facade: 'on' }, compact: true },
        'simulate_cbs',
        activeTarget,
      ],
      [{ action: 'diff_cbs', field: 'description', toggles: { facade: 'on' } }, 'diff_cbs', activeTarget],
      [
        {
          action: 'diff_lorebook',
          index: 0,
          reference: { kind: 'reference', reference_id: '2' },
          ref_entry_index: 0,
        },
        'diff_lorebook',
        activeTarget,
      ],
    ] as const) {
      facadeOnlyCalls.push('analyze_content');
      const analysis = await callJson(runtime, 'analyze_content', { target, operation });
      assert.ok(routedTools(analysis).includes(expectedRoute));
      assert.equal(nestedRecord(analysis.artifacts, 'analysis artifacts').operation, operation.action);
    }

    const fieldStats = await callJson(runtime, 'analyze_content', {
      target: activeTarget,
      operation: { action: 'field_stats', field: 'description' },
    });
    assert.deepEqual(routedTools(fieldStats), ['get_field_stats']);
    assert.equal(
      nestedRecord(nestedRecord(fieldStats.result, 'field stats result').analysis, 'field stats analysis').characters,
      'Alpha facade dogfood description.'.length,
    );

    const tokenCount = await callJson(runtime, 'analyze_content', {
      target: { kind: 'session' },
      operation: { action: 'token_count', encoding: 'cl100k_base', text: 'hello' },
    });
    const tokenAnalysis = nestedRecord(
      nestedRecord(tokenCount.result, 'token count result').analysis,
      'token count analysis',
    );
    assert.equal(tokenAnalysis.encoding, 'cl100k_base');
    assert.equal(tokenAnalysis.exact_for_encoding, true);
    assert.equal(tokenAnalysis.model_equivalence, 'not_asserted');
    assert.equal(tokenAnalysis.total_tokens, 1);

    const lorebookSimulation = await callJson(runtime, 'analyze_content', {
      target: activeTarget,
      operation: {
        action: 'simulate_lorebook',
        messages: [{ role: 'user', content: 'Please activate the facade lore.' }],
      },
    });
    const lorebookMatches = nestedArray(
      nestedRecord(
        nestedRecord(lorebookSimulation.result, 'lorebook simulation result').analysis,
        'lorebook simulation analysis',
      ).matches,
      'lorebook simulation matches',
    );
    assert.equal(nestedRecord(lorebookMatches[0], 'lorebook simulation match').index, 0);

    const regexSimulation = await callJson(runtime, 'analyze_content', {
      target: activeTarget,
      operation: { action: 'test_regex', text: 'Facade response', mode: 'editoutput' },
    });
    const regexAnalysis = nestedRecord(
      nestedRecord(regexSimulation.result, 'regex simulation result').analysis,
      'regex simulation analysis',
    );
    assert.equal(regexAnalysis.result, 'Surface response');
    assert.equal(regexAnalysis.ok, true);

    const luaValidation = await callJson(runtime, 'validate_content', {
      target: activeTarget,
      selectors: [{ family: 'lua' }, { family: 'trigger' }],
    });
    const luaValidationItems = nestedArray(
      nestedRecord(luaValidation.result, 'lua validation result').validations,
      'lua validation items',
    );
    const luaSectionValidation = nestedRecord(
      nestedRecord(luaValidationItems[0], 'lua section validation').data,
      'lua section validation data',
    );
    const luaResults = nestedArray(luaSectionValidation.results, 'lua validation results');
    assert.ok(
      luaResults.some(
        (item) =>
          nestedRecord(item, 'lua validation item').name === 'runtime_guard' &&
          nestedRecord(item, 'lua validation item').ok === true,
      ),
      'compile-only validation must not execute valid Lua chunks',
    );
    assert.ok(
      luaResults.some(
        (item) =>
          nestedRecord(item, 'lua validation item').name === 'broken' &&
          nestedRecord(item, 'lua validation item').ok === false,
      ),
      'Lua syntax errors should be reported per section',
    );

    const inspect = await callJson(runtime, 'inspect_document', { target: activeTarget, max_bytes: 32000 });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(inspect), ['session_status', 'list_fields', 'list_surfaces']);
    const inspectResult = nestedRecord(inspect.result, 'inspect result');
    const surfaces = nestedRecord(inspectResult.surfaces, 'inspect result.surfaces');
    const rootHash = String(surfaces.document_hash ?? '');
    assert.ok(rootHash.length > 0, 'active inspect should expose document_hash for stale guard reuse');

    facadeOnlyCalls.push('search_document');
    const search = await callJson(runtime, 'search_document', {
      target: activeTarget,
      query: 'Alpha',
      context_chars: 12,
      max_matches: 5,
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(search), ['search_all_fields']);

    const fieldSearch = await callJson(runtime, 'search_document', {
      target: activeTarget,
      selector: { family: 'field', field: 'description' },
      query: 'Alpha',
      max_matches: 5,
    });
    assert.deepEqual(routedTools(fieldSearch), ['search_in_field']);
    assert.deepEqual(nestedRecord(fieldSearch.result, 'field search result').touched_targets, ['field:description']);

    const boundedSearch = await callJson(runtime, 'search_document', {
      target: activeTarget,
      query: 'Facade',
      max_matches: 1,
    });
    const boundedSearchData = nestedRecord(
      nestedRecord(boundedSearch.result, 'bounded search result').search,
      'bounded search data',
    );
    assert.equal(boundedSearchData.returnedMatches, 1);
    assert.ok(Number(boundedSearchData.totalMatches) > 1);

    const utf8BoundedRead = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'field', field: 'defaultVariables' }],
    });
    const utf8Facade = nestedRecord(utf8BoundedRead.facade, 'utf8 bounded facade');
    const utf8Result = nestedRecord(utf8BoundedRead.result, 'utf8 bounded result');
    assert.equal(utf8Facade.max_bytes, 24 * 1024);
    assert.equal(utf8Facade.truncated, true);
    assert.equal(utf8Result.truncated, true);
    assert.ok(Buffer.byteLength(JSON.stringify(utf8Result), 'utf8') <= 24 * 1024);
    assert.ok(Number(utf8Result.original_byte_size) > Number(utf8Result.returned_byte_size));
    assert.equal(Number(utf8Result.returned_byte_size), Buffer.byteLength(JSON.stringify(utf8Result), 'utf8'));
    assert.ok(!String(utf8Result.preview).includes('\uFFFD'));

    facadeOnlyCalls.push('read_content');
    const readBefore = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(readBefore), ['read_field']);

    const partialMarker = '[partial-once]';
    const partialPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'insert_text',
          selector: { family: 'field', field: 'description' },
          content: partialMarker,
          position: 'start',
        },
        {
          op: 'patch_surface',
          selector: { family: 'surface', path: '/' },
          content: [{ op: 'replace', path: '/globalNote', value: 'MustNotApply' }],
        },
      ],
    });
    const partialPreviewInfo = previewToken(partialPreview, 'partial failure preview');
    const partialApply = await callJson(
      runtime,
      'apply_edit',
      {
        preview_token: partialPreviewInfo.preview_token,
        operation_digest: partialPreviewInfo.operation_digest,
        target: activeTarget,
      },
      { expectError: true },
    );
    const partialDetails = nestedRecord(partialApply.details, 'partial apply details');
    assert.equal(partialApply.code, 'partial_apply');
    assert.equal(partialApply.retryable, false);
    assert.equal(partialApply.retry_mode, 'inspect_outcome');
    assert.equal(partialApply.outcome, 'partial');
    assert.equal(partialDetails.preview_token_consumed, true);
    assert.equal(partialDetails.partial, true);
    assert.equal(partialDetails.applied_count, 1);
    assert.equal(partialDetails.remaining_count, 0);
    assert.equal(nestedRecord(partialDetails.failed_operation, 'failed operation').index, 1);

    const reusedPartialToken = await callJson(
      runtime,
      'apply_edit',
      {
        preview_token: partialPreviewInfo.preview_token,
        operation_digest: partialPreviewInfo.operation_digest,
        target: activeTarget,
      },
      { expectError: true },
    );
    assert.equal(reusedPartialToken.status, 404);

    const afterPartialRead = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    const afterPartialItems = nestedArray(
      nestedRecord(afterPartialRead.result, 'after partial result').items,
      'after partial items',
    );
    const afterPartialContent = String(
      nestedRecord(nestedRecord(afterPartialItems[0], 'after partial item').data, 'after partial data').content,
    );
    assert.equal(afterPartialContent.split(partialMarker).length - 1, 1);
    assert.match(afterPartialContent, /Alpha/);
    assert.equal(openCharx(fixture.mainFile).globalNote, 'Destructive preview keeps this note until apply.');

    const partialCleanupPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'description' },
          find: `${partialMarker}\n`,
          replace: '',
        },
      ],
    });
    await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(partialCleanupPreview, 'partial cleanup preview').preview_token,
      operation_digest: previewToken(partialCleanupPreview, 'partial cleanup preview').operation_digest,
      target: activeTarget,
    });

    const boundedRootRead = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'surface', path: '/' }],
    });
    assert.deepEqual(routedTools(boundedRootRead), ['read_surface']);
    const boundedRootItems = nestedArray(
      nestedRecord(boundedRootRead.result, 'bounded root read result').items,
      'bounded root read items',
    );
    const boundedRootData = nestedRecord(
      nestedRecord(boundedRootItems[0], 'bounded root read item').data,
      'bounded root read data',
    );
    assert.equal(boundedRootData.raw_omitted, true);
    assert.equal(boundedRootData.value, undefined);
    assert.equal(nestedRecord(boundedRootData.overview, 'bounded root overview').kind, 'object');
    assert.equal(nestedRecord(boundedRootRead.facade, 'bounded root facade').max_bytes, 24 * 1024);
    const boundedRootArtifacts = nestedRecord(boundedRootRead.artifacts, 'bounded root artifacts');
    assert.match(String(boundedRootArtifacts.continuation_hint ?? ''), /narrower selector/);
    assert.ok(
      nestedArray(boundedRootArtifacts.recommended_follow_up_selectors, 'bounded root selector hints').length > 0,
    );

    const rawRootWithoutMax = await callJson(
      runtime,
      'read_content',
      {
        target: activeTarget,
        selectors: [{ family: 'surface', path: '/', include_raw: true }],
      },
      { expectError: true },
    );
    assert.equal(rawRootWithoutMax.status, 400);
    assert.match(String(rawRootWithoutMax.error ?? ''), /explicit max_bytes/);

    const lorebookReadBefore = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'lorebook', index: 0 }],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(lorebookReadBefore), ['read_lorebook']);
    const lorebookReadItems = nestedArray(
      nestedRecord(lorebookReadBefore.result, 'lorebook read result').items,
      'lorebook read result.items',
    );
    const lorebookData = nestedRecord(
      nestedRecord(lorebookReadItems[0], 'lorebook read item').data,
      'lorebook read data',
    );
    assert.equal(nestedRecord(lorebookData.entry, 'lorebook entry').content, 'Facade lore body.');

    const activeRegexReads = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'regex' }, { family: 'regex', index: 0 }, { family: 'regex', indices: [0] }],
    });
    assert.deepEqual(routedTools(activeRegexReads), ['list_regex', 'read_regex', 'read_regex_batch']);
    const activeRegexItems = nestedArray(
      nestedRecord(activeRegexReads.result, 'active regex read result').items,
      'active regex read result.items',
    );
    const activeRegexData = nestedRecord(
      nestedRecord(activeRegexItems[1], 'active regex item').data,
      'active regex data',
    );
    assert.equal(nestedRecord(activeRegexData.entry, 'active regex entry').comment, 'Facade Regex');

    const activeGreetingReads = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [
        { family: 'greeting', greeting_type: 'alternate' },
        { family: 'greeting', greeting_type: 'alternate', index: 0 },
        { family: 'greeting', greeting_type: 'alternate', indices: [0] },
      ],
    });
    assert.deepEqual(routedTools(activeGreetingReads), ['list_greetings', 'read_greeting', 'read_greeting_batch']);
    const activeGreetingItems = nestedArray(
      nestedRecord(activeGreetingReads.result, 'active greeting read result').items,
      'active greeting read result.items',
    );
    const activeGreetingData = nestedRecord(
      nestedRecord(activeGreetingItems[1], 'active greeting item').data,
      'active greeting data',
    );
    assert.equal(activeGreetingData.content, 'Facade alternate hello.');

    const activeScriptStyleReads = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [
        { family: 'trigger' },
        { family: 'trigger', index: 0 },
        { family: 'trigger', indices: [0] },
        { family: 'lua' },
        { family: 'lua', index: 0 },
        { family: 'css' },
        { family: 'css', index: 0 },
      ],
    });
    assert.deepEqual(routedTools(activeScriptStyleReads), [
      'list_triggers',
      'read_trigger',
      'read_trigger_batch',
      'list_lua',
      'read_lua',
      'list_css',
      'read_css',
    ]);
    const activeScriptItems = nestedArray(
      nestedRecord(activeScriptStyleReads.result, 'active script/style read result').items,
      'active script/style read result.items',
    );
    const activeTriggerData = nestedRecord(
      nestedRecord(activeScriptItems[1], 'active trigger item').data,
      'active trigger data',
    );
    assert.equal(nestedRecord(activeTriggerData.trigger, 'active trigger data.trigger').comment, 'Facade Trigger');
    const activeLuaData = nestedRecord(nestedRecord(activeScriptItems[4], 'active lua item').data, 'active lua data');
    assert.match(String(activeLuaData.content ?? ''), /Alpha/);
    const activeCssData = nestedRecord(nestedRecord(activeScriptItems[6], 'active css item').data, 'active css data');
    assert.match(String(activeCssData.content ?? ''), /facade-alpha/);

    const missingGreetingType = await callJson(
      runtime,
      'read_content',
      { target: activeTarget, selectors: [{ family: 'greeting' }] },
      { expectError: true },
    );
    assert.equal(missingGreetingType.status, 400);
    assert.match(String(missingGreetingType.suggestion ?? ''), /greeting_type/);

    facadeOnlyCalls.push('validate_content');
    const validation = await callJson(runtime, 'validate_content', {
      target: activeTarget,
      selectors: [{ family: 'lorebook' }],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(validation), ['validate_lorebook_keys']);
    const validationResult = nestedRecord(validation.result, 'validation result');
    const validations = nestedArray(validationResult.validations, 'validation result.validations');
    const lorebookValidation = nestedRecord(nestedRecord(validations[0], 'validation item').data, 'validation data');
    assert.equal(lorebookValidation.issueCount, 0);

    const applyWithoutPreview = await callJson(
      runtime,
      'apply_edit',
      {
        preview_token: 'facade-preview-v1.missingPreviewToken',
        operation_digest: 'missing-preview-operation-digest',
        target: activeTarget,
      },
      { expectError: true },
    );
    assert.equal(applyWithoutPreview.status, 404);
    assert.match(String(applyWithoutPreview.error ?? ''), /Unknown or expired preview token/);
    assert.match(String(applyWithoutPreview.suggestion ?? ''), /preview_edit/);

    const staleFieldBlockPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_block',
          selector: { family: 'field', field: 'description' },
          start_anchor: 'Alpha',
          end_anchor: 'facade',
          content: 'Alpha facade',
        },
      ],
    });
    const concurrentFieldPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'description' },
          find: 'dogfood',
          replace: 'guarded dogfood',
        },
      ],
    });
    await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(concurrentFieldPreview, 'concurrent field preview').preview_token,
      operation_digest: previewToken(concurrentFieldPreview, 'concurrent field preview').operation_digest,
      target: activeTarget,
    });
    const staleFieldBlockApply = await callJson(
      runtime,
      'apply_edit',
      {
        preview_token: previewToken(staleFieldBlockPreview, 'stale field block preview').preview_token,
        operation_digest: previewToken(staleFieldBlockPreview, 'stale field block preview').operation_digest,
        target: activeTarget,
      },
      { expectError: true },
    );
    assert.equal(staleFieldBlockApply.status, 409);
    assert.equal(staleFieldBlockApply.retryable, true);
    assert.equal(staleFieldBlockApply.retry_mode, 'refresh_then_retry');
    assert.equal(staleFieldBlockApply.outcome, 'not_started');
    const restoreFieldPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'description' },
          find: 'guarded dogfood',
          replace: 'dogfood',
        },
      ],
    });
    await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(restoreFieldPreview, 'restore field preview').preview_token,
      operation_digest: previewToken(restoreFieldPreview, 'restore field preview').operation_digest,
      target: activeTarget,
    });

    const missingFieldBlockPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_block',
          selector: { family: 'field', field: 'description' },
          start_anchor: 'missing-start-anchor',
          end_anchor: 'missing-end-anchor',
          content: 'must not be written',
        },
      ],
    });
    const missingFieldPreviewData = nestedRecord(
      nestedRecord(
        nestedArray(
          nestedRecord(missingFieldBlockPreview.result, 'missing field block preview result').previews,
          'missing field block previews',
        )[0],
        'missing field block preview item',
      ).data,
      'missing field block preview data',
    );
    assert.equal(missingFieldPreviewData.success, false);
    assert.equal(missingFieldBlockPreview.success, false);
    assert.equal(missingFieldBlockPreview.outcome, 'unchanged');
    assert.equal(nestedRecord(missingFieldBlockPreview.result, 'no-op preview result').applicable_count, 0);
    assert.ok(!(missingFieldBlockPreview.next_actions as string[]).includes('apply_edit'));
    const missingFieldBlockApply = await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(missingFieldBlockPreview, 'missing field block preview').preview_token,
      operation_digest: previewToken(missingFieldBlockPreview, 'missing field block preview').operation_digest,
      target: activeTarget,
    });
    const missingFieldApplyData = nestedRecord(
      nestedRecord(
        nestedArray(
          nestedRecord(missingFieldBlockApply.result, 'missing field block apply result').applied,
          'missing field block applied',
        )[0],
        'missing field block applied item',
      ).data,
      'missing field block apply data',
    );
    assert.equal(missingFieldApplyData.success, false);
    assert.equal(missingFieldBlockApply.success, false);
    assert.equal(missingFieldBlockApply.outcome, 'unchanged');
    assert.equal(nestedRecord(missingFieldBlockApply.result, 'no-op apply result').applied_count, 0);
    assert.equal(nestedRecord(missingFieldBlockApply.result, 'no-op apply result').noop_count, 1);
    assert.equal(nestedRecord(missingFieldBlockApply.artifacts, 'no-op apply artifacts').count, 0);

    const fieldBlockPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_block',
          selector: { family: 'field', field: 'description' },
          start_anchor: 'Alpha',
          end_anchor: 'facade',
          content: 'Alpha facade',
        },
      ],
    });
    assert.ok(routedTools(fieldBlockPreview).includes('replace_block_in_field'));
    assert.ok(
      nestedArray(
        nestedRecord(fieldBlockPreview.result, 'field block preview result').guard_values,
        'field block guards',
      ).some((guard) => nestedRecord(guard, 'field block guard').name === 'expected_content_hash'),
    );
    const fieldBlockApply = await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(fieldBlockPreview, 'field block preview').preview_token,
      operation_digest: previewToken(fieldBlockPreview, 'field block preview').operation_digest,
      target: activeTarget,
    });
    assert.ok(routedTools(fieldBlockApply).includes('replace_block_in_field'));

    const staleLorebookBlockPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_block',
          selector: { family: 'lorebook', index: 0 },
          start_anchor: 'Facade',
          end_anchor: 'lore',
          content: 'Facade lore',
        },
      ],
    });
    const concurrentLorebookPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'lorebook', index: 0 },
          field: 'content',
          find: 'body',
          replace: 'guarded body',
        },
      ],
    });
    await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(concurrentLorebookPreview, 'concurrent lorebook preview').preview_token,
      operation_digest: previewToken(concurrentLorebookPreview, 'concurrent lorebook preview').operation_digest,
      target: activeTarget,
    });
    const staleLorebookBlockApply = await callJson(
      runtime,
      'apply_edit',
      {
        preview_token: previewToken(staleLorebookBlockPreview, 'stale lorebook block preview').preview_token,
        operation_digest: previewToken(staleLorebookBlockPreview, 'stale lorebook block preview').operation_digest,
        target: activeTarget,
      },
      { expectError: true },
    );
    assert.equal(staleLorebookBlockApply.status, 409);
    const restoreLorebookPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'lorebook', index: 0 },
          field: 'content',
          find: 'guarded body',
          replace: 'body',
        },
      ],
    });
    await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(restoreLorebookPreview, 'restore lorebook preview').preview_token,
      operation_digest: previewToken(restoreLorebookPreview, 'restore lorebook preview').operation_digest,
      target: activeTarget,
    });

    const lorebookBlockPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_block',
          selector: { family: 'lorebook', index: 0 },
          start_anchor: 'Facade',
          end_anchor: 'lore',
          content: 'Facade lore',
        },
      ],
    });
    assert.ok(routedTools(lorebookBlockPreview).includes('replace_block_in_lorebook'));
    const lorebookBlockGuards = nestedArray(
      nestedRecord(lorebookBlockPreview.result, 'lorebook block preview result').guard_values,
      'lorebook block guards',
    );
    assert.ok(
      lorebookBlockGuards.some((guard) => nestedRecord(guard, 'lorebook block guard').name === 'expected_comment'),
    );
    assert.ok(
      lorebookBlockGuards.some((guard) => nestedRecord(guard, 'lorebook block guard').name === 'expected_content_hash'),
    );
    const lorebookBlockApply = await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(lorebookBlockPreview, 'lorebook block preview').preview_token,
      operation_digest: previewToken(lorebookBlockPreview, 'lorebook block preview').operation_digest,
      target: activeTarget,
    });
    assert.ok(routedTools(lorebookBlockApply).includes('replace_block_in_lorebook'));

    const replaceAllPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_all_text',
          selector: { family: 'lorebook' },
          field: 'content',
          find: 'body',
          replace: 'body',
        },
      ],
    });
    assert.ok(routedTools(replaceAllPreview).includes('replace_across_all_lorebook'));
    assert.ok(
      nestedArray(
        nestedRecord(replaceAllPreview.result, 'replace all preview result').guard_values,
        'replace all guards',
      ).some((guard) => nestedRecord(guard, 'replace all guard').name === 'expected_item_collection_digest'),
    );
    const replaceAllApply = await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(replaceAllPreview, 'replace all preview').preview_token,
      operation_digest: previewToken(replaceAllPreview, 'replace all preview').operation_digest,
      target: activeTarget,
    });
    assert.ok(routedTools(replaceAllApply).includes('replace_across_all_lorebook'));

    const missingReplaceAllPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_all_text',
          selector: { family: 'lorebook' },
          field: 'content',
          find: 'missing-replacement-target',
          replace: 'must not be written',
        },
      ],
    });
    const missingReplaceAllPreviewData = nestedRecord(
      nestedRecord(
        nestedArray(
          nestedRecord(missingReplaceAllPreview.result, 'missing replace-all preview result').previews,
          'missing replace-all previews',
        )[0],
        'missing replace-all preview item',
      ).data,
      'missing replace-all preview data',
    );
    assert.equal(missingReplaceAllPreviewData.success, false);
    const missingReplaceAllApply = await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(missingReplaceAllPreview, 'missing replace-all preview').preview_token,
      operation_digest: previewToken(missingReplaceAllPreview, 'missing replace-all preview').operation_digest,
      target: activeTarget,
    });
    const missingReplaceAllApplyData = nestedRecord(
      nestedRecord(
        nestedArray(
          nestedRecord(missingReplaceAllApply.result, 'missing replace-all apply result').applied,
          'missing replace-all applied',
        )[0],
        'missing replace-all applied item',
      ).data,
      'missing replace-all apply data',
    );
    assert.equal(missingReplaceAllApplyData.success, false);
    assert.equal(missingReplaceAllApply.success, false);
    assert.equal(missingReplaceAllApply.outcome, 'unchanged');
    assert.equal(nestedRecord(missingReplaceAllApply.artifacts, 'no-op replace-all artifacts').count, 0);

    facadeOnlyCalls.push('preview_edit');
    const preview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'description' },
          find: 'Alpha',
          replace: 'Omega',
        },
      ],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(preview), ['replace_in_field']);
    const previewInfo = nestedRecord(preview.preview, 'preview');

    facadeOnlyCalls.push('apply_edit');
    const apply = await callJson(runtime, 'apply_edit', {
      preview_token: previewInfo.preview_token,
      operation_digest: previewInfo.operation_digest,
      target: activeTarget,
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(apply), ['replace_in_field']);

    const surfacePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'surface', path: '/description' },
          find: 'Omega',
          replace: 'Surface Omega',
        },
      ],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(surfacePreview), ['replace_in_surface']);
    const surfacePreviewGuards = nestedArray(
      nestedRecord(surfacePreview.result, 'surface preview result').guard_values,
      'surface preview guard values',
    );
    assert.ok(
      surfacePreviewGuards.some((guard) => nestedRecord(guard, 'surface guard').name === 'expected_hash'),
      'surface replace preview should derive expected_hash',
    );
    const surfacePreviewInfo = nestedRecord(surfacePreview.preview, 'surface preview');
    const surfaceApply = await callJson(runtime, 'apply_edit', {
      preview_token: surfacePreviewInfo.preview_token,
      operation_digest: surfacePreviewInfo.operation_digest,
      target: activeTarget,
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(surfaceApply), ['replace_in_surface']);
    const surfaceReadback = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    const surfaceReadbackItems = nestedArray(
      nestedRecord(surfaceReadback.result, 'surface readback result').items,
      'surface readback items',
    );
    const surfaceReadbackData = nestedRecord(
      nestedRecord(surfaceReadbackItems[0], 'surface readback item').data,
      'surface readback data',
    );
    assert.match(String(surfaceReadbackData.content ?? ''), /Surface Omega/);
    const diagnosticLog = readStandaloneLog(fixture.userDataDir);
    for (const event of [
      'processStart',
      'transportConnectStart',
      'transportConnected',
      'toolStart',
      'toolSuccess',
      'apiRequestStart',
      'apiResponse',
    ]) {
      assert.match(diagnosticLog, new RegExp(`\\b${event}\\b`), `standalone diagnostic log should include ${event}`);
    }
    assert.match(diagnosticLog, /"tool":"preview_edit"/);
    assert.match(diagnosticLog, /"tool":"apply_edit"/);
    assert.ok(!diagnosticLog.includes('Omega is searchable.'), 'diagnostic log must not include edited field bodies');

    const lorebookPreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'lorebook', index: 0, field: 'content' },
          find: 'Facade',
          replace: 'Updated facade',
          guards: [{ name: 'expected_comment', value: 'Facade Lore' }],
        },
      ],
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(lorebookPreview), ['replace_in_lorebook']);
    const lorebookPreviewResult = nestedRecord(lorebookPreview.result, 'lorebook preview result');
    assert.ok(
      nestedArray(lorebookPreviewResult.touched_targets, 'lorebook touched targets').includes('lorebook:0:content'),
    );
    assert.ok(
      nestedArray(lorebookPreviewResult.guard_values, 'lorebook guard values').some(
        (guard) => nestedRecord(guard, 'lorebook guard').name === 'expected_comment',
      ),
    );
    const lorebookPreviewInfo = nestedRecord(lorebookPreview.preview, 'lorebook preview');
    const lorebookApply = await callJson(runtime, 'apply_edit', {
      preview_token: lorebookPreviewInfo.preview_token,
      operation_digest: lorebookPreviewInfo.operation_digest,
      target: activeTarget,
    });
    metrics.activeWorkflowCallCount += 1;
    assert.deepEqual(routedTools(lorebookApply), ['replace_in_lorebook']);
    assert.deepEqual(lorebookApply.next_actions, ['validate_content', 'read_content', 'analyze_content']);
    const lorebookApplyArtifacts = nestedRecord(lorebookApply.artifacts, 'lorebook apply artifacts');
    assert.deepEqual(lorebookApplyArtifacts.edited_families, ['lorebook']);
    assert.ok(
      nestedArray(lorebookApplyArtifacts.post_edit_validation, 'lorebook post-edit validation').some((item) => {
        const validationItem = nestedRecord(item, 'lorebook post-edit validation item');
        return (
          validationItem.family === 'lorebook' &&
          nestedArray(validationItem.tools, 'validation tools').includes('validate_content')
        );
      }),
    );
    assert.ok(
      nestedArray(lorebookApplyArtifacts.recommended_reads, 'lorebook recommended reads').some(
        (item) => nestedRecord(item, 'lorebook recommended read').tool === 'read_content',
      ),
    );
    assert.ok(
      nestedArray(lorebookApplyArtifacts.recommended_diffs, 'lorebook recommended diffs').some(
        (item) => nestedRecord(item, 'lorebook recommended diff').tool === 'analyze_content',
      ),
    );

    const staleLorebookPreview = await callJson(
      runtime,
      'preview_edit',
      {
        target: activeTarget,
        operations: [
          {
            op: 'replace_text',
            selector: { family: 'lorebook', index: 0, field: 'content' },
            find: 'Updated facade',
            replace: 'Stale facade',
            guards: [{ name: 'expected_comment', value: 'Wrong Lore' }],
          },
        ],
      },
      { expectError: true },
    );
    assert.equal(staleLorebookPreview.status, 409);

    facadeOnlyCalls.push('preview_edit');
    const regexWritePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'write_content',
          selector: { family: 'regex', indices: [0] },
          content: {
            entries: [
              {
                data: {
                  comment: 'Facade Regex',
                  type: 'editoutput',
                  find: 'Updated Regex Find',
                  replace: 'Updated Regex Replace',
                  flag: 'g',
                },
              },
            ],
          },
        },
      ],
    });
    assert.deepEqual(routedTools(regexWritePreview), ['read_regex_batch', 'write_regex_batch']);
    const regexGuardValues = nestedArray(
      nestedRecord(regexWritePreview.result, 'regex write preview result').guard_values,
      'regex write guard values',
    );
    assert.ok(
      regexGuardValues.some((guard) => nestedRecord(guard, 'regex guard').name === 'expected_comment'),
      'regex write preview should derive expected_comment',
    );
    const regexWritePreviewInfo = nestedRecord(regexWritePreview.preview, 'regex write preview');
    facadeOnlyCalls.push('apply_edit');
    const regexWriteApply = await callJson(runtime, 'apply_edit', {
      preview_token: regexWritePreviewInfo.preview_token,
      operation_digest: regexWritePreviewInfo.operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(regexWriteApply), ['write_regex_batch']);
    const staleRegexPreview = await callJson(
      runtime,
      'preview_edit',
      {
        target: activeTarget,
        operations: [
          {
            op: 'write_content',
            selector: { family: 'regex', index: 0 },
            content: { comment: 'Facade Regex', type: 'editoutput', find: 'X', replace: 'Y', flag: 'g' },
            guards: [{ name: 'expected_comment', value: 'Wrong Regex' }],
          },
        ],
      },
      { expectError: true },
    );
    assert.equal(staleRegexPreview.status, 409);

    facadeOnlyCalls.push('preview_edit');
    const greetingWritePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'write_content',
          selector: { family: 'greeting', greeting_type: 'alternate', indices: [0] },
          content: { writes: [{ content: 'Updated facade alternate hello.' }] },
        },
      ],
    });
    assert.deepEqual(routedTools(greetingWritePreview), ['read_greeting_batch', 'batch_write_greeting']);
    const greetingGuardValues = nestedArray(
      nestedRecord(greetingWritePreview.result, 'greeting write preview result').guard_values,
      'greeting write guard values',
    );
    assert.ok(
      greetingGuardValues.some((guard) => nestedRecord(guard, 'greeting guard').name === 'expected_preview'),
      'greeting write preview should derive expected_preview',
    );
    const greetingWritePreviewInfo = nestedRecord(greetingWritePreview.preview, 'greeting write preview');
    facadeOnlyCalls.push('apply_edit');
    const greetingWriteApply = await callJson(runtime, 'apply_edit', {
      preview_token: greetingWritePreviewInfo.preview_token,
      operation_digest: greetingWritePreviewInfo.operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(greetingWriteApply), ['batch_write_greeting']);

    facadeOnlyCalls.push('preview_edit');
    const triggerWritePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'write_content',
          selector: { family: 'trigger', index: 0 },
          content: { comment: 'Updated Facade Trigger' },
        },
      ],
    });
    assert.deepEqual(routedTools(triggerWritePreview), ['read_trigger', 'write_trigger']);
    const triggerGuardValues = nestedArray(
      nestedRecord(triggerWritePreview.result, 'trigger write preview result').guard_values,
      'trigger write guard values',
    );
    assert.ok(
      triggerGuardValues.some((guard) => nestedRecord(guard, 'trigger guard').name === 'expected_comment'),
      'trigger write preview should derive expected_comment',
    );
    const triggerWritePreviewInfo = nestedRecord(triggerWritePreview.preview, 'trigger write preview');
    facadeOnlyCalls.push('apply_edit');
    const triggerWriteApply = await callJson(runtime, 'apply_edit', {
      preview_token: triggerWritePreviewInfo.preview_token,
      operation_digest: triggerWritePreviewInfo.operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(triggerWriteApply), ['read_trigger', 'write_trigger']);

    facadeOnlyCalls.push('preview_edit');
    const luaReplacePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'lua', index: 0 },
          find: 'Alpha',
          replace: 'Beta',
        },
      ],
    });
    assert.deepEqual(routedTools(luaReplacePreview), ['read_lua', 'replace_in_lua']);
    const luaGuardValues = nestedArray(
      nestedRecord(luaReplacePreview.result, 'lua replace preview result').guard_values,
      'lua replace guard values',
    );
    assert.ok(luaGuardValues.some((guard) => nestedRecord(guard, 'lua guard').name === 'expected_hash'));
    const luaReplacePreviewInfo = nestedRecord(luaReplacePreview.preview, 'lua replace preview');
    facadeOnlyCalls.push('apply_edit');
    const luaReplaceApply = await callJson(runtime, 'apply_edit', {
      preview_token: luaReplacePreviewInfo.preview_token,
      operation_digest: luaReplacePreviewInfo.operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(luaReplaceApply), ['read_lua', 'replace_in_lua']);

    facadeOnlyCalls.push('preview_edit');
    const cssReplacePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'css', index: 0 },
          find: 'red',
          replace: 'blue',
        },
      ],
    });
    assert.deepEqual(routedTools(cssReplacePreview), ['read_css', 'replace_in_css']);
    const cssGuardValues = nestedArray(
      nestedRecord(cssReplacePreview.result, 'css replace preview result').guard_values,
      'css replace guard values',
    );
    assert.ok(cssGuardValues.some((guard) => nestedRecord(guard, 'css guard').name === 'expected_hash'));
    const cssReplacePreviewInfo = nestedRecord(cssReplacePreview.preview, 'css replace preview');
    facadeOnlyCalls.push('apply_edit');
    const cssReplaceApply = await callJson(runtime, 'apply_edit', {
      preview_token: cssReplacePreviewInfo.preview_token,
      operation_digest: cssReplacePreviewInfo.operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(cssReplaceApply), ['read_css', 'replace_in_css']);

    const luaDeletePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [{ op: 'delete_item', selector: { family: 'lua', index: 2 } }],
    });
    assert.deepEqual(routedTools(luaDeletePreview), ['read_lua', 'delete_lua_section']);
    const luaDeleteApply = await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(luaDeletePreview, 'lua delete preview').preview_token,
      operation_digest: previewToken(luaDeletePreview, 'lua delete preview').operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(luaDeleteApply), ['read_lua', 'delete_lua_section']);

    const cssDeletePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [{ op: 'delete_item', selector: { family: 'css', index: 1 } }],
    });
    assert.deepEqual(routedTools(cssDeletePreview), ['read_css', 'delete_css_section']);
    const cssDeleteApply = await callJson(runtime, 'apply_edit', {
      preview_token: previewToken(cssDeletePreview, 'css delete preview').preview_token,
      operation_digest: previewToken(cssDeletePreview, 'css delete preview').operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(cssDeleteApply), ['read_css', 'delete_css_section']);

    const scriptStyleAfterDelete = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'lua' }, { family: 'css' }],
    });
    assert.equal(JSON.stringify(scriptStyleAfterDelete.result).includes('broken'), false);
    assert.equal(JSON.stringify(scriptStyleAfterDelete.result).includes('removable'), false);

    const staleGreetingBatchPreview = await callJson(
      runtime,
      'preview_edit',
      {
        target: activeTarget,
        operations: [
          {
            op: 'delete_item',
            selector: { family: 'greeting', greeting_type: 'alternate', indices: [0] },
            content: { expected_previews: ['Wrong Greeting Preview'] },
          },
        ],
      },
      { expectError: true },
    );
    assert.equal(staleGreetingBatchPreview.status, 409);

    facadeOnlyCalls.push('preview_edit');
    const regexDeletePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'delete_item',
          selector: { family: 'regex', index: 0 },
        },
      ],
    });
    assert.deepEqual(routedTools(regexDeletePreview), ['read_regex', 'delete_regex']);
    const regexDeleteGuards = nestedArray(
      nestedRecord(regexDeletePreview.result, 'regex delete preview result').guard_values,
      'regex delete guard values',
    );
    assert.ok(
      regexDeleteGuards.some((guard) => nestedRecord(guard, 'regex delete guard').name === 'expected_comment'),
      'regex delete preview should derive expected_comment',
    );
    const regexDeletePreviewInfo = nestedRecord(regexDeletePreview.preview, 'regex delete preview');
    facadeOnlyCalls.push('apply_edit');
    const regexDeleteApply = await callJson(runtime, 'apply_edit', {
      preview_token: regexDeletePreviewInfo.preview_token,
      operation_digest: regexDeletePreviewInfo.operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(regexDeleteApply), ['delete_regex']);

    facadeOnlyCalls.push('preview_edit');
    const greetingDeletePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'delete_item',
          selector: { family: 'greeting', greeting_type: 'alternate', indices: [0] },
        },
      ],
    });
    assert.deepEqual(routedTools(greetingDeletePreview), ['read_greeting_batch', 'batch_delete_greeting']);
    const greetingDeleteGuards = nestedArray(
      nestedRecord(greetingDeletePreview.result, 'greeting delete preview result').guard_values,
      'greeting delete guard values',
    );
    assert.ok(
      greetingDeleteGuards.some((guard) => nestedRecord(guard, 'greeting delete guard').name === 'expected_previews'),
      'greeting batch delete preview should derive expected_previews',
    );
    const greetingDeletePreviewInfo = nestedRecord(greetingDeletePreview.preview, 'greeting delete preview');
    facadeOnlyCalls.push('apply_edit');
    const greetingDeleteApply = await callJson(runtime, 'apply_edit', {
      preview_token: greetingDeletePreviewInfo.preview_token,
      operation_digest: greetingDeletePreviewInfo.operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(greetingDeleteApply), ['batch_delete_greeting']);

    facadeOnlyCalls.push('manage_file');
    const savePreview = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'preview',
      operation: { action: 'save_current_file' },
    });
    const save = await applyManageFilePreview(runtime, activeTarget, savePreview);
    metrics.activeWorkflowCallCount += 1;
    assert.equal(nestedRecord(save.result, 'facade save result').success, true);

    const persisted = openCharx(fixture.mainFile);
    const readAfter = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    const afterItems = nestedArray(
      nestedRecord(readAfter.result, 'read after result').items,
      'read after result.items',
    );
    const afterData = nestedRecord(nestedRecord(afterItems[0], 'read after item').data, 'read after item.data');
    assert.equal(afterData.content, persisted.description);
    assert.equal(persisted.description, 'Surface Omega facade dogfood description.');
    assert.equal((persisted.lorebook[0] as { content?: string } | undefined)?.content, 'Updated facade lore body.');
    assert.equal(persisted.triggerScripts[0]?.comment, 'Updated Facade Trigger');
    assert.match(persisted.lua, /Beta/);
    assert.match(persisted.css, /blue/);
    assert.equal(persisted.regex.length, 0);
    assert.equal(persisted.alternateGreetings.length, 0);
    metrics.finalArtifactEquality = true;

    const referenceInventory = await callJson(runtime, 'inspect_document', {
      target: { kind: 'reference' },
    });
    assert.deepEqual(routedTools(referenceInventory), ['list_references']);
    const referenceInventoryResult = nestedRecord(referenceInventory.result, 'reference inventory result');
    assert.ok(referenceInventoryResult.references);
    assert.equal(referenceInventoryResult.reference, undefined);

    const referenceInspect = await callJson(runtime, 'inspect_document', { target: referenceTarget });
    assert.deepEqual(routedTools(referenceInspect), ['list_references']);
    const referenceInspectResult = nestedRecord(referenceInspect.result, 'selected reference inspect result');
    assert.ok(referenceInspectResult.reference);
    assert.equal(referenceInspectResult.references, undefined);
    const referenceRead = await callJson(runtime, 'read_content', {
      target: referenceTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    assert.deepEqual(routedTools(referenceRead), ['read_reference_field']);
    const referenceItems = nestedArray(
      nestedRecord(referenceRead.result, 'reference read result').items,
      'reference read result.items',
    );
    const referenceData = nestedRecord(nestedRecord(referenceItems[0], 'reference read item').data, 'reference data');
    assert.equal(referenceData.content, openRisum(fixture.referenceRisum).description);
    const referenceLorebookList = await callJson(runtime, 'read_content', {
      target: referenceTarget,
      selectors: [{ family: 'lorebook' }],
    });
    assert.deepEqual(routedTools(referenceLorebookList), ['list_reference_lorebook']);
    const referenceLorebookRead = await callJson(runtime, 'read_content', {
      target: referenceTarget,
      selectors: [{ family: 'lorebook', index: 0 }],
    });
    assert.deepEqual(routedTools(referenceLorebookRead), ['read_reference_lorebook']);
    const referenceLorebookItems = nestedArray(
      nestedRecord(referenceLorebookRead.result, 'reference lorebook result').items,
      'reference lorebook items',
    );
    const referenceLorebookData = nestedRecord(
      nestedRecord(referenceLorebookItems[0], 'reference lorebook item').data,
      'reference lorebook data',
    );
    assert.equal(
      nestedRecord(referenceLorebookData.entry, 'reference lorebook entry').content,
      'Reference facade lore body.',
    );

    const referenceRegexReads = await callJson(runtime, 'read_content', {
      target: referenceTarget,
      selectors: [{ family: 'regex' }, { family: 'regex', index: 0 }, { family: 'regex', indices: [0] }],
    });
    assert.deepEqual(routedTools(referenceRegexReads), [
      'list_reference_regex',
      'read_reference_regex',
      'read_reference_regex_batch',
    ]);
    const referenceRegexItems = nestedArray(
      nestedRecord(referenceRegexReads.result, 'reference regex read result').items,
      'reference regex read result.items',
    );
    const referenceRegexData = nestedRecord(
      nestedRecord(referenceRegexItems[1], 'reference regex item').data,
      'reference regex data',
    );
    assert.equal(nestedRecord(referenceRegexData.entry, 'reference regex entry').comment, 'Reference Regex');

    const referenceGreetingReads = await callJson(runtime, 'read_content', {
      target: cardReferenceTarget,
      selectors: [
        { family: 'greeting', greeting_type: 'alternate' },
        { family: 'greeting', greeting_type: 'alternate', index: 0 },
        { family: 'greeting', greeting_type: 'alternate', indices: [0] },
      ],
    });
    assert.deepEqual(routedTools(referenceGreetingReads), [
      'list_reference_greetings',
      'read_reference_greeting',
      'read_reference_greeting_batch',
    ]);
    const referenceGreetingItems = nestedArray(
      nestedRecord(referenceGreetingReads.result, 'reference greeting read result').items,
      'reference greeting read result.items',
    );
    const referenceGreetingData = nestedRecord(
      nestedRecord(referenceGreetingItems[1], 'reference greeting item').data,
      'reference greeting data',
    );
    assert.equal(referenceGreetingData.content, 'Facade alternate hello.');

    const referenceSearch = await callJson(runtime, 'search_document', {
      target: referenceTarget,
      field: 'description',
      query: 'risum',
    });
    assert.deepEqual(routedTools(referenceSearch), ['search_in_reference_field']);
    const presetReferenceSearch = await callJson(runtime, 'search_document', {
      target: presetReferenceTarget,
      selector: { family: 'risup-prompt' },
      query: 'facade prompt',
    });
    assert.deepEqual(routedTools(presetReferenceSearch), ['read_reference_field']);
    const presetReferenceSearchData = nestedRecord(
      nestedRecord(presetReferenceSearch.result, 'preset reference search result').search,
      'preset reference search data',
    );
    assert.equal(presetReferenceSearchData.count, 1);
    const presetReferenceRead = await callJson(runtime, 'read_content', {
      target: presetReferenceTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    assert.deepEqual(routedTools(presetReferenceRead), ['read_reference_field']);
    const presetReferenceItems = nestedArray(
      nestedRecord(presetReferenceRead.result, 'preset reference read result').items,
      'preset reference read result.items',
    );
    const presetReferenceData = nestedRecord(
      nestedRecord(presetReferenceItems[0], 'preset reference read item').data,
      'preset reference data',
    );
    assert.equal(presetReferenceData.content, openRisup(fixture.referenceRisup).description);
    const presetPromptReads = await callJson(runtime, 'read_content', {
      target: presetReferenceTarget,
      selectors: [
        { family: 'risup-prompt' },
        { family: 'risup-prompt', index: 0 },
        { family: 'risup-prompt', indices: [0] },
      ],
    });
    assert.deepEqual(routedTools(presetPromptReads), [
      'list_reference_risup_prompt_items',
      'read_reference_risup_prompt_item',
      'read_reference_risup_prompt_item_batch',
    ]);
    const presetPromptItems = nestedArray(
      nestedRecord(presetPromptReads.result, 'preset prompt read result').items,
      'preset prompt read result.items',
    );
    const presetPromptData = nestedRecord(
      nestedRecord(presetPromptItems[1], 'preset prompt item').data,
      'preset prompt data',
    );
    assert.equal(nestedRecord(presetPromptData.item, 'preset prompt data.item').text, 'Preset facade prompt');

    const externalPresetFile = path.join(fixture.dir, 'external-preset.risup');
    fs.copyFileSync(fixture.referenceRisup, externalPresetFile);
    const externalPresetTarget = { kind: 'external', file_path: externalPresetFile };
    const externalPresetRead = await callJson(runtime, 'read_content', {
      target: externalPresetTarget,
      selectors: [
        { family: 'risup-prompt' },
        { family: 'risup-prompt', index: 0 },
        { family: 'risup-prompt', indices: [0, 1] },
      ],
    });
    assert.deepEqual(routedTools(externalPresetRead), [
      'external_read_surface',
      'external_read_surface',
      'external_read_surface',
    ]);
    const externalPresetItems = nestedArray(
      nestedRecord(externalPresetRead.result, 'external preset read result').items,
      'external preset read items',
    );
    const externalPresetIndexData = nestedRecord(
      nestedRecord(externalPresetItems[1], 'external preset index item').data,
      'external preset index data',
    );
    const externalPresetItem = nestedRecord(
      nestedRecord(nestedArray(externalPresetIndexData.entries, 'external preset index entries')[0], 'entry').item,
      'external preset prompt item',
    );
    assert.equal(externalPresetItem.text, 'Preset facade prompt');

    const externalPresetSearch = await callJson(runtime, 'search_document', {
      target: externalPresetTarget,
      field: 'risup-prompt',
      query: 'removable',
    });
    assert.deepEqual(routedTools(externalPresetSearch), ['external_read_surface']);
    assert.equal(
      Number(
        nestedRecord(nestedRecord(externalPresetSearch.result, 'external preset search result').search, 'search data')
          .count,
      ),
      1,
    );

    const externalPresetValidation = await callJson(runtime, 'validate_content', {
      target: externalPresetTarget,
      selectors: [{ family: 'risup-prompt' }],
    });
    assert.deepEqual(routedTools(externalPresetValidation), ['external_read_surface']);

    facadeOnlyCalls.push('preview_edit');
    const externalPresetPreview = await callJson(runtime, 'preview_edit', {
      target: externalPresetTarget,
      operations: [
        {
          op: 'write_content',
          selector: { family: 'risup-prompt', index: 0 },
          content: {
            type: 'plain',
            type2: 'normal',
            text: 'External preset facade prompt',
            role: 'system',
          },
        },
      ],
    });
    assert.deepEqual(routedTools(externalPresetPreview), ['external_read_surface', 'external_write_field']);
    const externalPresetPreviewGuards = nestedArray(
      nestedRecord(externalPresetPreview.result, 'external preset preview result').guard_values,
      'external preset preview guard values',
    );
    assert.ok(
      externalPresetPreviewGuards.some(
        (guard) => nestedRecord(guard, 'external preset guard').name === 'expected_type',
      ),
      'external risup prompt preview should derive expected_type',
    );
    const externalPresetPreviewInfo = nestedRecord(externalPresetPreview.preview, 'external preset preview');
    facadeOnlyCalls.push('apply_edit');
    const externalPresetApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalPresetPreviewInfo.preview_token,
      operation_digest: externalPresetPreviewInfo.operation_digest,
      target: externalPresetTarget,
    });
    assert.deepEqual(routedTools(externalPresetApply), ['external_read_surface', 'external_write_field']);
    const externalPresetAfter = await callJson(runtime, 'read_content', {
      target: externalPresetTarget,
      selectors: [{ family: 'risup-prompt', index: 0 }],
    });
    const externalPresetAfterItems = nestedArray(
      nestedRecord(externalPresetAfter.result, 'external preset after result').items,
      'external preset after items',
    );
    const externalPresetAfterData = nestedRecord(
      nestedRecord(externalPresetAfterItems[0], 'external preset after item').data,
      'external preset after data',
    );
    const externalPresetAfterEntries = nestedArray(externalPresetAfterData.entries, 'external preset after entries');
    const externalPresetAfterItem = nestedRecord(
      nestedRecord(externalPresetAfterEntries[0], 'external preset after entry').item,
      'external preset after prompt item',
    );
    assert.equal(externalPresetAfterItem.text, 'External preset facade prompt');

    facadeOnlyCalls.push('preview_edit');
    const externalPresetDeletePreview = await callJson(runtime, 'preview_edit', {
      target: externalPresetTarget,
      operations: [
        {
          op: 'delete_item',
          selector: { family: 'risup-prompt', indices: [1] },
        },
      ],
    });
    assert.deepEqual(routedTools(externalPresetDeletePreview), ['external_read_surface', 'external_write_field']);
    const externalPresetDeletePreviewInfo = nestedRecord(
      externalPresetDeletePreview.preview,
      'external preset delete preview',
    );
    facadeOnlyCalls.push('apply_edit');
    const externalPresetDeleteApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalPresetDeletePreviewInfo.preview_token,
      operation_digest: externalPresetDeletePreviewInfo.operation_digest,
      target: externalPresetTarget,
    });
    assert.deepEqual(routedTools(externalPresetDeleteApply), ['external_read_surface', 'external_write_field']);
    const externalPresetAfterDelete = await callJson(runtime, 'read_content', {
      target: externalPresetTarget,
      selectors: [{ family: 'risup-prompt' }],
    });
    assert.equal(JSON.stringify(externalPresetAfterDelete.result).includes('Preset removable prompt'), false);

    facadeOnlyCalls.push('inspect_document');
    const guidance = await callJson(runtime, 'inspect_document', {
      target: { kind: 'guidance', skill: 'using-mcp-tools' },
      max_bytes: 4096,
    });
    assert.deepEqual(routedTools(guidance), ['read_skill']);
    const guidanceCatalog = await callJson(runtime, 'inspect_document', {
      target: { kind: 'guidance' },
      max_bytes: 16384,
    });
    assert.deepEqual(routedTools(guidanceCatalog), ['list_skills']);
    assert.ok(JSON.stringify(guidanceCatalog).includes('prompts/families/PHEME.md'));
    const guideRead = await callJson(runtime, 'inspect_document', {
      target: { kind: 'guidance', guide: 'prompts/families/PHEME.md' },
      max_bytes: 4096,
    });
    assert.deepEqual(routedTools(guideRead), ['read_guide']);
    assert.match(JSON.stringify(guideRead), /Phēmē Prompt Family Profile/);

    const externalInspect = await callJson(runtime, 'inspect_document', { target: externalTarget });
    assert.deepEqual(routedTools(externalInspect), ['inspect_external_file']);
    const externalRead = await callJson(runtime, 'read_content', {
      target: externalTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    assert.deepEqual(routedTools(externalRead), ['probe_field']);
    facadeOnlyCalls.push('preview_edit');
    const externalPreview = await callJson(runtime, 'preview_edit', {
      target: externalTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'description' },
          find: 'External',
          replace: 'Edited external',
        },
      ],
    });
    assert.deepEqual(routedTools(externalPreview), ['external_replace_in_field']);
    const externalPreviewInfo = nestedRecord(externalPreview.preview, 'external preview');
    facadeOnlyCalls.push('apply_edit');
    const externalApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalPreviewInfo.preview_token,
      operation_digest: externalPreviewInfo.operation_digest,
      target: externalTarget,
    });
    assert.deepEqual(routedTools(externalApply), ['external_replace_in_field']);
    assert.equal(openCharx(fixture.externalFile).description, 'Edited external facade dogfood description.');

    facadeOnlyCalls.push('preview_edit');
    const externalSurfacePreview = await callJson(runtime, 'preview_edit', {
      target: externalTarget,
      operations: [
        {
          op: 'patch_surface',
          selector: { family: 'surface', path: '/' },
          content: [
            { op: 'replace', path: '/name', value: 'External Surface Patched' },
            { op: 'add', path: '/alternateGreetings/0', value: 'Facade inserted greeting' },
          ],
        },
      ],
    });
    assert.deepEqual(routedTools(externalSurfacePreview), ['external_patch_surface']);
    assert.equal(openCharx(fixture.externalFile).name, 'Facade External');
    const externalSurfacePreviewInfo = nestedRecord(externalSurfacePreview.preview, 'external surface preview');
    const externalSurfaceGuards = nestedArray(
      externalSurfacePreviewInfo.required_guards,
      'external surface preview required guards',
    );
    assert.ok(
      externalSurfaceGuards.some((guard) => nestedRecord(guard, 'external surface guard').name === 'expected_hash'),
      'external surface patch preview should derive expected_hash',
    );
    facadeOnlyCalls.push('apply_edit');
    const externalSurfaceApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalSurfacePreviewInfo.preview_token,
      operation_digest: externalSurfacePreviewInfo.operation_digest,
      target: externalTarget,
      guard_values: externalSurfaceGuards,
    });
    assert.deepEqual(routedTools(externalSurfaceApply), ['external_patch_surface']);
    const externalSurfacePatched = openCharx(fixture.externalFile);
    assert.equal(externalSurfacePatched.name, 'External Surface Patched');
    assert.equal(externalSurfacePatched.alternateGreetings[0], 'Facade inserted greeting');

    const externalLorebookList = await callJson(runtime, 'read_content', {
      target: externalTarget,
      selectors: [{ family: 'lorebook' }],
    });
    assert.deepEqual(routedTools(externalLorebookList), ['external_read_surface']);
    const externalLorebookItems = nestedArray(
      nestedRecord(externalLorebookList.result, 'external lorebook list result').items,
      'external lorebook list result.items',
    );
    const externalLorebookEntries = nestedArray(
      nestedRecord(nestedRecord(externalLorebookItems[0], 'external lorebook list item').data, 'external lorebook data')
        .entries,
      'external lorebook entries',
    );
    const externalLorebookId = String(nestedRecord(externalLorebookEntries[0], 'external lorebook entry').id);
    const externalLorebookPreview = await callJson(runtime, 'preview_edit', {
      target: externalTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'lorebook', id: externalLorebookId, field: 'content' },
          find: 'Facade lore',
          replace: 'External facade lore',
        },
      ],
    });
    assert.deepEqual(routedTools(externalLorebookPreview), ['external_read_surface', 'external_patch_surface']);
    const externalLorebookPreviewInfo = nestedRecord(externalLorebookPreview.preview, 'external lorebook preview');
    const externalLorebookGuards = nestedArray(
      externalLorebookPreviewInfo.required_guards,
      'external lorebook required guards',
    );
    assert.ok(
      externalLorebookGuards.some((guard) => nestedRecord(guard, 'external lorebook guard').name === 'expected_hash'),
      'external lorebook preview should derive expected_hash',
    );
    assert.ok(
      externalLorebookGuards.some(
        (guard) => nestedRecord(guard, 'external lorebook guard').name === 'expected_comment',
      ),
      'external lorebook preview should derive expected_comment',
    );
    const externalLorebookApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalLorebookPreviewInfo.preview_token,
      operation_digest: externalLorebookPreviewInfo.operation_digest,
      target: externalTarget,
      guard_values: externalLorebookGuards,
    });
    assert.deepEqual(routedTools(externalLorebookApply), ['external_read_surface', 'external_patch_surface']);
    assert.equal(
      (openCharx(fixture.externalFile).lorebook[0] as { content?: string }).content,
      'External facade lore body.',
    );

    const externalRegexList = await callJson(runtime, 'read_content', {
      target: externalTarget,
      selectors: [{ family: 'regex' }],
    });
    assert.deepEqual(routedTools(externalRegexList), ['external_read_surface']);
    const externalRegexItems = nestedArray(
      nestedRecord(externalRegexList.result, 'external regex list result').items,
      'external regex list result.items',
    );
    const externalRegexEntries = nestedArray(
      nestedRecord(nestedRecord(externalRegexItems[0], 'external regex list item').data, 'external regex data').entries,
      'external regex entries',
    );
    const externalRegexEntry = nestedRecord(externalRegexEntries[0], 'external regex entry');
    const externalRegexPreview = await callJson(runtime, 'preview_edit', {
      target: externalTarget,
      operations: [
        {
          op: 'write_content',
          selector: {
            family: 'regex',
            identity: { comment: String(externalRegexEntry.comment), hash: String(externalRegexEntry.hash) },
          },
          content: { replace: 'External Surface' },
        },
      ],
    });
    assert.deepEqual(routedTools(externalRegexPreview), ['external_read_surface', 'external_patch_surface']);
    const externalRegexPreviewInfo = nestedRecord(externalRegexPreview.preview, 'external regex preview');
    const externalRegexGuards = nestedArray(externalRegexPreviewInfo.required_guards, 'external regex required guards');
    assert.ok(
      externalRegexGuards.some((guard) => nestedRecord(guard, 'external regex guard').name === 'expected_hash'),
      'external regex preview should derive expected_hash',
    );
    const externalRegexApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalRegexPreviewInfo.preview_token,
      operation_digest: externalRegexPreviewInfo.operation_digest,
      target: externalTarget,
      guard_values: externalRegexGuards,
    });
    assert.deepEqual(routedTools(externalRegexApply), ['external_read_surface', 'external_patch_surface']);
    assert.equal((openCharx(fixture.externalFile).regex[0] as { replace?: string }).replace, 'External Surface');

    const externalGreetingList = await callJson(runtime, 'read_content', {
      target: externalTarget,
      selectors: [{ family: 'greeting', greeting_type: 'alternate' }],
    });
    assert.deepEqual(routedTools(externalGreetingList), ['external_read_surface']);
    const externalGreetingItems = nestedArray(
      nestedRecord(externalGreetingList.result, 'external greeting list result').items,
      'external greeting list result.items',
    );
    const externalGreetingSummaries = nestedArray(
      nestedRecord(nestedRecord(externalGreetingItems[0], 'external greeting list item').data, 'external greeting data')
        .items,
      'external greeting summaries',
    );
    const externalGreeting = nestedRecord(externalGreetingSummaries[0], 'external greeting summary');
    const externalGreetingPreview = await callJson(runtime, 'preview_edit', {
      target: externalTarget,
      operations: [
        {
          op: 'write_content',
          selector: {
            family: 'greeting',
            greeting_type: 'alternate',
            identity: { preview: String(externalGreeting.preview), hash: String(externalGreeting.hash) },
          },
          content: 'External alternate updated.',
        },
      ],
    });
    assert.deepEqual(routedTools(externalGreetingPreview), ['external_read_surface', 'external_patch_surface']);
    const externalGreetingPreviewInfo = nestedRecord(externalGreetingPreview.preview, 'external greeting preview');
    const externalGreetingGuards = nestedArray(
      externalGreetingPreviewInfo.required_guards,
      'external greeting required guards',
    );
    assert.ok(
      externalGreetingGuards.some((guard) => nestedRecord(guard, 'external greeting guard').name === 'expected_hash'),
      'external greeting preview should derive expected_hash',
    );
    const externalGreetingApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalGreetingPreviewInfo.preview_token,
      operation_digest: externalGreetingPreviewInfo.operation_digest,
      target: externalTarget,
      guard_values: externalGreetingGuards,
    });
    assert.deepEqual(routedTools(externalGreetingApply), ['external_read_surface', 'external_patch_surface']);
    assert.equal(openCharx(fixture.externalFile).alternateGreetings[0], 'External alternate updated.');

    const externalScriptReads = await callJson(runtime, 'read_content', {
      target: externalTarget,
      selectors: [{ family: 'trigger' }, { family: 'lua', index: 0 }, { family: 'css', index: 0 }],
    });
    assert.deepEqual(routedTools(externalScriptReads), [
      'external_read_surface',
      'external_read_surface',
      'external_read_surface',
    ]);
    const externalScriptItems = nestedArray(
      nestedRecord(externalScriptReads.result, 'external script/style read result').items,
      'external script/style read result.items',
    );
    const externalTriggerSummaries = nestedArray(
      nestedRecord(nestedRecord(externalScriptItems[0], 'external trigger list item').data, 'external trigger data')
        .items,
      'external trigger summaries',
    );
    assert.equal(nestedRecord(externalTriggerSummaries[0], 'external trigger summary').comment, 'Facade Trigger');
    const externalLuaReadData = nestedRecord(
      nestedRecord(externalScriptItems[1], 'external lua item').data,
      'external lua read data',
    );
    assert.match(JSON.stringify(externalLuaReadData), /Alpha/);

    const externalTriggerPreview = await callJson(runtime, 'preview_edit', {
      target: externalTarget,
      operations: [
        {
          op: 'write_content',
          selector: { family: 'trigger', identity: { comment: 'Facade Trigger' } },
          content: { comment: 'External Facade Trigger' },
        },
      ],
    });
    assert.deepEqual(routedTools(externalTriggerPreview), ['external_read_surface', 'external_patch_surface']);
    const externalTriggerPreviewInfo = nestedRecord(externalTriggerPreview.preview, 'external trigger preview');
    const externalTriggerGuards = nestedArray(
      externalTriggerPreviewInfo.required_guards,
      'external trigger required guards',
    );
    assert.ok(
      externalTriggerGuards.some((guard) => nestedRecord(guard, 'external trigger guard').name === 'expected_comment'),
      'external trigger preview should derive expected_comment',
    );
    const externalTriggerApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalTriggerPreviewInfo.preview_token,
      operation_digest: externalTriggerPreviewInfo.operation_digest,
      target: externalTarget,
      guard_values: externalTriggerGuards,
    });
    assert.deepEqual(routedTools(externalTriggerApply), ['external_read_surface', 'external_patch_surface']);

    const externalLuaPreview = await callJson(runtime, 'preview_edit', {
      target: externalTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'lua', index: 0 },
          find: 'Alpha',
          replace: 'ExternalBeta',
        },
      ],
    });
    assert.deepEqual(routedTools(externalLuaPreview), ['external_read_surface', 'external_patch_surface']);
    const externalLuaPreviewInfo = nestedRecord(externalLuaPreview.preview, 'external lua preview');
    const externalLuaGuards = nestedArray(externalLuaPreviewInfo.required_guards, 'external lua required guards');
    assert.ok(
      externalLuaGuards.some((guard) => nestedRecord(guard, 'external lua guard').name === 'expected_section_hash'),
      'external lua preview should derive expected_section_hash',
    );
    const externalLuaApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalLuaPreviewInfo.preview_token,
      operation_digest: externalLuaPreviewInfo.operation_digest,
      target: externalTarget,
      guard_values: externalLuaGuards,
    });
    assert.deepEqual(routedTools(externalLuaApply), ['external_read_surface', 'external_patch_surface']);

    const externalCssPreview = await callJson(runtime, 'preview_edit', {
      target: externalTarget,
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'css', index: 0 },
          find: 'red',
          replace: 'green',
        },
      ],
    });
    assert.deepEqual(routedTools(externalCssPreview), ['external_read_surface', 'external_patch_surface']);
    const externalCssPreviewInfo = nestedRecord(externalCssPreview.preview, 'external css preview');
    const externalCssGuards = nestedArray(externalCssPreviewInfo.required_guards, 'external css required guards');
    assert.ok(
      externalCssGuards.some((guard) => nestedRecord(guard, 'external css guard').name === 'expected_section_hash'),
      'external css preview should derive expected_section_hash',
    );
    const externalCssApply = await callJson(runtime, 'apply_edit', {
      preview_token: externalCssPreviewInfo.preview_token,
      operation_digest: externalCssPreviewInfo.operation_digest,
      target: externalTarget,
      guard_values: externalCssGuards,
    });
    assert.deepEqual(routedTools(externalCssApply), ['external_read_surface', 'external_patch_surface']);
    const externalAfterScriptStyle = openCharx(fixture.externalFile);
    assert.equal(externalAfterScriptStyle.triggerScripts[0]?.comment, 'External Facade Trigger');
    assert.match(externalAfterScriptStyle.lua, /ExternalBeta/);
    assert.match(externalAfterScriptStyle.css, /green/);

    const refreshedInspect = await callJson(runtime, 'inspect_document', { target: activeTarget, max_bytes: 32000 });
    const refreshedSurfaces = nestedRecord(
      nestedRecord(refreshedInspect.result, 'refreshed inspect result').surfaces,
      'refreshed inspect surfaces',
    );
    const refreshedRootHash = String(refreshedSurfaces.document_hash ?? '');
    assert.ok(refreshedRootHash.length > 0 && refreshedRootHash !== rootHash);

    const destructivePreview = await callJson(runtime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'patch_surface',
          selector: { family: 'surface', path: '/' },
          content: [{ op: 'remove', path: '/globalNote' }],
          guards: [
            {
              name: 'expected_hash',
              value: refreshedRootHash,
              payloadPath: '/expected_hash',
              sourceOperations: ['inspect_document'],
              sourceResultPath: '/result/surfaces/document_hash',
            },
          ],
        },
      ],
    });
    assert.deepEqual(routedTools(destructivePreview), ['patch_surface']);
    assert.equal(openCharx(fixture.mainFile).globalNote, 'Destructive preview keeps this note until apply.');
    const destructivePreviewInfo = nestedRecord(destructivePreview.preview, 'destructive preview');
    assert.deepEqual(destructivePreviewInfo.required_guards, [
      {
        name: 'expected_hash',
        value: refreshedRootHash,
        payloadPath: '/expected_hash',
        sourceOperations: ['inspect_document'],
        sourceResultPath: '/result/surfaces/document_hash',
      },
    ]);
    metrics.staleGuardReuse = true;

    recoveryRuntime = await startStandaloneClient({
      refs: [fixture.referenceRisum, fixture.referenceRisup],
      userDataDir: path.join(fixture.dir, 'recovery-user-data'),
      allowWrites: true,
      toolProfile: 'advanced-full',
    });
    const sessionInspect = await callJson(recoveryRuntime, 'inspect_document', { target: { kind: 'session' } });
    assert.deepEqual(routedTools(sessionInspect), ['session_status']);
    const sessionInspectRuntime = nestedRecord(
      nestedRecord(nestedRecord(sessionInspect.result, 'session inspect result').session, 'session inspect session')
        .runtime,
      'session inspect runtime',
    );
    assert.equal(sessionInspectRuntime.runtimeMode, 'standalone');
    const sessionInspectHealth = nestedRecord(
      nestedRecord(nestedRecord(sessionInspect.result, 'session inspect result').session, 'session inspect session')
        .runtimeHealth,
      'session inspect runtimeHealth',
    );
    assert.equal(sessionInspectHealth.runtimeMode, 'standalone');
    const directSessionStatus = await callJson(recoveryRuntime, 'session_status', {});
    const inspectedSession = nestedRecord(
      nestedRecord(sessionInspect.result, 'session parity result').session,
      'session parity payload',
    );
    for (const key of ['file', 'references', 'allowWrites', 'userDataPath', 'runtime'] as const) {
      assert.deepEqual(inspectedSession[key], directSessionStatus[key], `session parity mismatch for ${key}`);
    }

    const referenceInventoryFacade = await callJson(recoveryRuntime, 'inspect_document', {
      target: { kind: 'reference' },
    });
    const directReferenceInventory = await callJson(recoveryRuntime, 'list_references', {});
    assert.deepEqual(
      nestedRecord(referenceInventoryFacade.result, 'reference parity result').references,
      directReferenceInventory,
    );

    const noActiveRead = await callJson(
      recoveryRuntime,
      'read_content',
      { target: activeTarget, selectors: [{ family: 'field', field: 'description' }] },
      { expectError: true },
    );
    assert.equal(noActiveRead.status, 400);
    assert.equal(noActiveRead.target, 'document:current');
    const recoveryExternalInspect = await callJson(recoveryRuntime, 'inspect_document', {
      target: { kind: 'external', file_path: fixture.mainFile },
    });
    assert.deepEqual(routedTools(recoveryExternalInspect), ['inspect_external_file']);
    const facadeProbeRead = await callJson(recoveryRuntime, 'read_content', {
      target: { kind: 'external', file_path: fixture.mainFile },
      selectors: [{ family: 'field', field: 'description' }],
    });
    const directProbeRead = await callJson(recoveryRuntime, 'probe_field', {
      file_path: fixture.mainFile,
      field: 'description',
    });
    const facadeProbeItems = nestedArray(
      nestedRecord(facadeProbeRead.result, 'probe parity result').items,
      'probe parity items',
    );
    assert.deepEqual(
      nestedRecord(nestedRecord(facadeProbeItems[0], 'probe parity item').data, 'probe parity data').content,
      directProbeRead.content,
    );

    const facadeReferenceRead = await callJson(recoveryRuntime, 'read_content', {
      target: { kind: 'reference', reference_id: '0' },
      selectors: [{ family: 'field', field: 'description' }],
    });
    const directReferenceRead = await callJson(recoveryRuntime, 'read_reference_field', {
      index: 0,
      field: 'description',
    });
    const facadeReferenceItems = nestedArray(
      nestedRecord(facadeReferenceRead.result, 'reference field parity result').items,
      'reference field parity items',
    );
    assert.deepEqual(
      nestedRecord(
        nestedRecord(facadeReferenceItems[0], 'reference field parity item').data,
        'reference field parity data',
      ).content,
      directReferenceRead.content,
    );

    const opened = await callJson(recoveryRuntime, 'open_file', { file_path: fixture.mainFile });
    assert.equal(opened.file_path, fixture.mainFile);
    assert.equal(opened.file_type, 'charx');
    const recoveredRead = await callJson(recoveryRuntime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'field', field: 'description' }],
    });
    assert.deepEqual(routedTools(recoveredRead), ['read_field']);
    const openedPreset = await callJson(recoveryRuntime, 'open_file', { file_path: fixture.referenceRisup });
    assert.equal(openedPreset.file_type, 'risup');
    const activePresetPromptReads = await callJson(recoveryRuntime, 'read_content', {
      target: activeTarget,
      selectors: [
        { family: 'risup-prompt' },
        { family: 'risup-prompt', index: 0 },
        { family: 'risup-prompt', indices: [0] },
      ],
    });
    assert.deepEqual(routedTools(activePresetPromptReads), [
      'list_risup_prompt_items',
      'read_risup_prompt_item',
      'read_risup_prompt_item_batch',
    ]);
    const activePresetSearch = await callJson(recoveryRuntime, 'search_document', {
      target: activeTarget,
      field: 'risup-prompt',
      query: 'Preset',
      max_matches: 1,
    });
    assert.deepEqual(routedTools(activePresetSearch), ['search_in_risup_prompt_items']);
    const activePresetSearchData = nestedRecord(
      nestedRecord(activePresetSearch.result, 'active preset search result').search,
      'active preset search data',
    );
    assert.equal(activePresetSearchData.totalMatches, 2);
    assert.equal(activePresetSearchData.returnedMatches, 1);
    const activePresetValidation = await callJson(recoveryRuntime, 'validate_content', {
      target: activeTarget,
      selectors: [{ family: 'risup-prompt' }, { field: 'formatingOrder' }],
    });
    assert.deepEqual(routedTools(activePresetValidation), ['list_risup_prompt_items', 'read_risup_formating_order']);
    const activePresetDiff = await callJson(recoveryRuntime, 'analyze_content', {
      target: activeTarget,
      operation: {
        action: 'diff_risup_prompt',
        reference: { kind: 'reference', reference_id: '1' },
      },
    });
    assert.ok(routedTools(activePresetDiff).includes('diff_risup_prompt'));
    const activePresetImportValidation = await callJson(recoveryRuntime, 'analyze_content', {
      target: activeTarget,
      operation: {
        action: 'verify_risup_prompt_import',
        text:
          '### [plain] ###\nrole: system\ntype2: normal\nbody-lines: 1\n---\nPreset facade prompt\n===\n' +
          '### [plain] ###\nrole: system\ntype2: normal\nbody-lines: 1\n---\nPreset removable prompt\n===',
      },
    });
    assert.ok(routedTools(activePresetImportValidation).includes('validate_risup_prompt_import'));
    const activePresetValidationItems = nestedArray(
      nestedRecord(activePresetValidation.result, 'active preset validation result').validations,
      'active preset validations',
    );
    assert.equal(activePresetValidationItems.length, 2);
    facadeOnlyCalls.push('preview_edit');
    const promptItemPreview = await callJson(recoveryRuntime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'write_content',
          selector: { family: 'risup-prompt', indices: [0] },
          content: {
            writes: [
              {
                item: {
                  type: 'plain',
                  type2: 'normal',
                  text: 'Updated preset facade prompt',
                  role: 'system',
                },
              },
            ],
          },
        },
      ],
    });
    assert.deepEqual(routedTools(promptItemPreview), ['list_risup_prompt_items', 'write_risup_prompt_item_batch']);
    const promptItemGuards = nestedArray(
      nestedRecord(promptItemPreview.result, 'prompt item preview result').guard_values,
      'prompt item guard values',
    );
    assert.ok(
      promptItemGuards.some((guard) => nestedRecord(guard, 'prompt item guard').name === 'expected_type'),
      'prompt item preview should derive expected_type',
    );
    const promptItemPreviewInfo = nestedRecord(promptItemPreview.preview, 'prompt item preview');
    facadeOnlyCalls.push('apply_edit');
    const promptItemApply = await callJson(recoveryRuntime, 'apply_edit', {
      preview_token: promptItemPreviewInfo.preview_token,
      operation_digest: promptItemPreviewInfo.operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(promptItemApply), ['write_risup_prompt_item_batch']);
    assert.ok(nestedArray(promptItemApply.next_actions, 'prompt item next actions').includes('validate_content'));
    const promptItemReadAfter = await callJson(recoveryRuntime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'risup-prompt', index: 0 }],
    });
    assert.deepEqual(routedTools(promptItemReadAfter), ['read_risup_prompt_item']);
    const promptItemReadAfterItems = nestedArray(
      nestedRecord(promptItemReadAfter.result, 'prompt item read after result').items,
      'prompt item read after items',
    );
    const promptItemReadAfterData = nestedRecord(
      nestedRecord(promptItemReadAfterItems[0], 'prompt item read after item').data,
      'prompt item read after data',
    );
    assert.equal(
      nestedRecord(promptItemReadAfterData.item, 'prompt item read after data.item').text,
      'Updated preset facade prompt',
    );
    facadeOnlyCalls.push('preview_edit');
    const promptItemDeletePreview = await callJson(recoveryRuntime, 'preview_edit', {
      target: activeTarget,
      operations: [
        {
          op: 'delete_item',
          selector: { family: 'risup-prompt', indices: [1] },
        },
      ],
    });
    assert.deepEqual(routedTools(promptItemDeletePreview), [
      'list_risup_prompt_items',
      'batch_delete_risup_prompt_items',
    ]);
    const promptItemDeleteGuards = nestedArray(
      nestedRecord(promptItemDeletePreview.result, 'prompt item delete preview result').guard_values,
      'prompt item delete guard values',
    );
    assert.ok(
      promptItemDeleteGuards.some((guard) => nestedRecord(guard, 'prompt item delete guard').name === 'expected_types'),
      'prompt item batch delete preview should derive expected_types',
    );
    const promptItemDeletePreviewInfo = nestedRecord(promptItemDeletePreview.preview, 'prompt item delete preview');
    facadeOnlyCalls.push('apply_edit');
    const promptItemDeleteApply = await callJson(recoveryRuntime, 'apply_edit', {
      preview_token: promptItemDeletePreviewInfo.preview_token,
      operation_digest: promptItemDeletePreviewInfo.operation_digest,
      target: activeTarget,
    });
    assert.deepEqual(routedTools(promptItemDeleteApply), ['batch_delete_risup_prompt_items']);
    const promptItemsAfterDelete = await callJson(recoveryRuntime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'risup-prompt' }],
    });
    assert.deepEqual(routedTools(promptItemsAfterDelete), ['list_risup_prompt_items']);
    assert.equal(JSON.stringify(promptItemsAfterDelete.result).includes('Preset removable prompt'), false);

    const wrongTools = ['read_field', 'write_field', 'replace_in_field', 'patch_surface'];
    metrics.wrongToolAvoidance = facadeOnlyCalls.every((name) => !wrongTools.includes(name));
    assert.equal(metrics.wrongToolAvoidance, true);
    assert.equal(metrics.activeWorkflowCallCount, 12);
    assert.equal(metrics.granularFallbackFrequency, 0);
    assert.equal(metrics.staleGuardReuse, true);
    assert.equal(metrics.finalArtifactEquality, true);
  } catch (error) {
    const stderrText = [runtime, recoveryRuntime]
      .flatMap((candidate) => candidate?.stderrChunks ?? [])
      .join('')
      .trim();
    const detail =
      error instanceof Error
        ? (error.stack ?? error.message)
        : typeof error === 'string'
          ? error
          : JSON.stringify(error, null, 2);
    throw new Error(stderrText ? `${detail}\n\nStandalone MCP stderr:\n${stderrText}` : detail);
  } finally {
    if (recoveryRuntime) await recoveryRuntime.close();
    if (runtime) await runtime.close();
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  }
}
