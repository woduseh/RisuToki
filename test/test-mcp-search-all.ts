import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { openRisum, openRisup } from '../src/charx-io';
import { buildRuntimeMetadata, type RuntimeMetadata } from '../src/lib/mcp-runtime-contract';
import { buildChildEnv, callClientJson, extractTextContent } from './mcp-test-client';
import { runStandaloneFacadeDogfood } from './mcp-search-facade';
import { runStandaloneManageFileDogfood } from './mcp-search-manage-file';
import { runStandaloneManageItemsDogfood } from './mcp-search-manage-items';
import { runStandaloneToolProfileContract } from './mcp-search-profile-contract';
import { runStandaloneRealCorpusFacadeReadEval } from './mcp-search-real-corpus';
import {
  assertSurfaceSummary,
  assertToolListMetadata,
  assertToolProfileRuntimeHealth,
  closeServer,
  createFolderWorkspaceMcpFixtures,
  createProbeFixture,
  createSearchFixture,
  mapSurfacesByTarget,
  nestedArray,
  nestedRecord,
  startTestApiServer,
} from './mcp-search-shared';

(async function run() {
  const appRuntime = buildRuntimeMetadata({
    serverVersion: 'api-placeholder',
    appVersion: '99.69.2',
    packageVersion: '99.69.2',
    buildTime: null,
    commit: null,
    runtimeMode: 'app-backed',
  });
  const api = await startTestApiServer(createSearchFixture(), { runtime: appRuntime });
  let probeFixture: { dir: string; filePath: string } | null = null;
  const client = new Client({ name: 'mcp-search-smoke-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(process.cwd(), 'toki-mcp-server.js')],
    cwd: process.cwd(),
    env: buildChildEnv(api.port, api.token),
    stderr: 'pipe',
  });

  const stderrChunks: string[] = [];
  const stderrStream = transport.stderr;
  if (stderrStream) {
    stderrStream.on('data', (chunk) => {
      stderrChunks.push(String(chunk));
    });
  }

  let connected = false;

  try {
    probeFixture = createProbeFixture();
    await client.connect(transport);
    connected = true;

    const tools = await client.listTools();
    assert.ok(
      tools.tools.some((tool) => tool.name === 'search_all_fields'),
      'search_all_fields should be registered before the route contract is implemented',
    );
    for (const toolName of [
      'probe_field',
      'probe_field_batch',
      'probe_lorebook',
      'probe_regex',
      'probe_lua',
      'probe_css',
      'probe_greetings',
      'probe_triggers',
      'probe_risup_prompt_items',
      'probe_risup_formating_order',
      'inspect_external_file',
      'external_write_field',
      'external_write_field_batch',
      'external_search_in_field',
      'external_read_field_range',
      'external_replace_in_field',
      'external_insert_in_field',
    ]) {
      assert.ok(
        tools.tools.some((tool) => tool.name === toolName),
        `${toolName} should be registered`,
      );
    }
    assert.ok(
      tools.tools.some((tool) => tool.name === 'open_file'),
      'open_file should be registered',
    );
    assertToolListMetadata(tools.tools, 'list_fields', {
      family: 'field',
      staleGuards: [],
    });
    assertToolListMetadata(tools.tools, 'write_lorebook', {
      family: 'lorebook',
      staleGuards: ['expected_comment'],
      staleGuardDetails: [
        {
          name: 'expected_comment',
          payloadPath: '/expected_comment',
          sourceOperations: ['list_lorebook', 'read_lorebook'],
          sourceResultPath: '/entries/*/comment or /comment',
          retry: 'On 409, refresh with the source operation(s), then retry with current guard value(s).',
        },
      ],
      requiresConfirmation: true,
      supportsDryRun: false,
      workflowStages: ['apply'],
    });
    assertToolListMetadata(tools.tools, 'replace_in_field', {
      family: 'field',
      staleGuards: [],
      requiresConfirmation: true,
      supportsDryRun: true,
      workflowStages: ['preview', 'apply'],
    });
    assertToolListMetadata(tools.tools, 'open_file', {
      family: 'probe',
      staleGuards: [],
      requiresConfirmation: false,
      supportsDryRun: false,
    });
    assertToolListMetadata(tools.tools, 'external_replace_in_field', {
      family: 'external',
      staleGuards: [],
      requiresConfirmation: true,
      supportsDryRun: true,
      workflowStages: ['preview', 'apply'],
    });
    for (const toolName of [
      'inspect_document',
      'list_tool_profiles',
      'read_content',
      'search_document',
      'analyze_content',
      'preview_edit',
      'apply_edit',
      'validate_content',
      'load_guidance',
      'manage_items',
      'manage_assets',
      'manage_file',
    ]) {
      assert.ok(
        tools.tools.some((tool) => tool.name === toolName),
        `${toolName} should be registered as a first-wave facade tool`,
      );
    }
    assertToolListMetadata(tools.tools, 'inspect_document', {
      family: 'session',
      staleGuards: [],
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['discover'],
      profiles: ['facade-first', 'authoring', 'advanced-full', 'readonly'],
      defaultProfile: 'facade-first',
    });
    assertToolListMetadata(tools.tools, 'list_tool_profiles', {
      family: 'session',
      staleGuards: [],
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['discover'],
      profiles: ['facade-first', 'authoring', 'advanced-full', 'readonly'],
      defaultProfile: 'facade-first',
    });
    const appBackedProfileCatalog = await callClientJson(client, 'list_tool_profiles', { profile: 'facade-first' });
    const appBackedRuntime = assertToolProfileRuntimeHealth(appBackedProfileCatalog);
    assert.equal(appBackedRuntime.appVersion, appRuntime.appVersion);
    assert.equal(appBackedRuntime.packageVersion, appRuntime.packageVersion);
    assert.notEqual(
      appBackedRuntime.serverVersion,
      appRuntime.serverVersion,
      'list_tool_profiles should preserve the MCP process serverVersion instead of trusting the API placeholder',
    );
    assert.equal(nestedRecord(appBackedRuntime.skew, 'app-backed runtime skew').detected, true);
    assert.ok(
      nestedArray(
        nestedRecord(appBackedRuntime.skew, 'app-backed runtime skew').warnings,
        'app-backed skew warnings',
      ).some((warning) => String(warning).includes('serverVersion') && String(warning).includes('appVersion')),
    );
    const appBackedSessionStatus = await callClientJson(client, 'session_status', {});
    const appBackedSessionRuntime = nestedRecord(appBackedSessionStatus.runtime, 'app-backed session_status runtime');
    assert.equal(appBackedSessionRuntime.appVersion, appRuntime.appVersion);
    assert.notEqual(
      appBackedSessionRuntime.serverVersion,
      appRuntime.serverVersion,
      'session_status should preserve the MCP process serverVersion instead of trusting the API placeholder',
    );
    assert.equal(nestedRecord(appBackedSessionRuntime.skew, 'app-backed session runtime skew').detected, true);
    const appBackedSessionHealth = nestedRecord(
      appBackedSessionStatus.runtimeHealth,
      'app-backed session_status runtimeHealth',
    );
    assert.equal(appBackedSessionHealth.runtimeMode, 'app-backed');
    assertToolListMetadata(tools.tools, 'preview_edit', {
      family: 'surface',
      staleGuards: [],
      requiresConfirmation: false,
      supportsDryRun: true,
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['preview'],
      profiles: ['facade-first', 'authoring', 'advanced-full'],
      defaultProfile: 'facade-first',
    });
    assertToolListMetadata(tools.tools, 'apply_edit', {
      family: 'surface',
      staleGuards: [],
      requiresConfirmation: true,
      supportsDryRun: false,
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['apply'],
      profiles: ['facade-first', 'authoring', 'advanced-full'],
      defaultProfile: 'facade-first',
    });
    assertToolListMetadata(tools.tools, 'manage_items', {
      family: 'item-management',
      staleGuards: [],
      requiresConfirmation: true,
      supportsDryRun: true,
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['read', 'preview', 'apply'],
      profiles: ['facade-first', 'authoring', 'advanced-full'],
      defaultProfile: 'facade-first',
    });
    assertToolListMetadata(tools.tools, 'manage_assets', {
      family: 'asset-management',
      staleGuards: [],
      requiresConfirmation: true,
      supportsDryRun: true,
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['read', 'preview', 'apply'],
      profiles: ['facade-first', 'authoring', 'advanced-full'],
      defaultProfile: 'facade-first',
    });
    assertToolListMetadata(tools.tools, 'manage_file', {
      family: 'file-management',
      staleGuards: [],
      requiresConfirmation: true,
      supportsDryRun: true,
      surfaceKind: 'facade',
      recommendation: 'preferred',
      workflowStages: ['read', 'preview', 'apply'],
      profiles: ['facade-first', 'authoring', 'advanced-full'],
      defaultProfile: 'facade-first',
    });

    const fieldSearch = await client.callTool({
      name: 'search_in_field',
      arguments: {
        field: 'description',
        query: 'alpha',
        context_chars: 12,
        max_matches: 5,
      },
    });
    const fieldSearchText = extractTextContent(fieldSearch.content);
    assert.ok(!fieldSearch.isError, `search_in_field should succeed in the MCP smoke test: ${fieldSearchText}`);
    const fieldSearchJson = JSON.parse(fieldSearchText) as {
      field?: string;
      totalMatches?: number;
      returnedMatches?: number;
    };
    assert.equal(fieldSearchJson.field, 'description');
    assert.equal(fieldSearchJson.totalMatches, 1);
    assert.equal(fieldSearchJson.returnedMatches, 1);

    const result = await client.callTool({
      name: 'search_all_fields',
      arguments: {
        query: 'alpha',
        include_lorebook: true,
        include_greetings: true,
        context_chars: 12,
        max_matches_per_field: 5,
      },
    });

    const textContent = extractTextContent(result.content);
    if (result.isError) {
      const searchAllFailure = api.mcpStatuses.find(
        (payload) => payload.action === 'POST /search-all' || payload.target === '/search-all',
      );
      assert.ok(
        searchAllFailure,
        `Expected broadcastMcpStatus to capture the /search-all route failure: ${textContent}`,
      );
      assert.equal(searchAllFailure.action, 'POST /search-all');
      assert.equal(searchAllFailure.status, 404);
      assert.equal(searchAllFailure.target, '/search-all');
      throw new Error(
        `Expected structured search_all_fields JSON, got MCP error: ${textContent}\nRoute failure: ${JSON.stringify(searchAllFailure)}`,
      );
    }

    const parsed = JSON.parse(textContent) as {
      totalMatches?: number;
      surfaces?: Array<{ target?: string; [key: string]: unknown }>;
    };

    assert.equal(parsed.totalMatches, 4);
    assert.equal(parsed.surfaces?.length, 4);
    assert.deepEqual(
      parsed.surfaces?.map((surface) => surface.target).sort(),
      ['field:description', 'field:firstMessage', 'greeting:alternate:0', 'lorebook:0'].sort(),
    );

    const surfacesByTarget = mapSurfacesByTarget(parsed.surfaces ?? []);
    assertSurfaceSummary(surfacesByTarget.get('field:description'), {
      surfaceType: 'field',
      target: 'field:description',
      field: 'description',
      totalMatches: 1,
      returnedMatches: 1,
      firstMatch: 'Alpha',
    });
    assertSurfaceSummary(surfacesByTarget.get('field:firstMessage'), {
      surfaceType: 'field',
      target: 'field:firstMessage',
      field: 'firstMessage',
      totalMatches: 1,
      returnedMatches: 1,
      firstMatch: 'alpha',
    });
    assertSurfaceSummary(surfacesByTarget.get('greeting:alternate:0'), {
      surfaceType: 'greeting',
      target: 'greeting:alternate:0',
      field: 'alternateGreetings',
      greetingType: 'alternate',
      index: 0,
      totalMatches: 1,
      returnedMatches: 1,
      firstMatch: 'Alpha',
    });
    assertSurfaceSummary(surfacesByTarget.get('lorebook:0'), {
      surfaceType: 'lorebook',
      target: 'lorebook:0',
      index: 0,
      comment: 'Bridge lore',
      key: 'bridge',
      totalMatches: 1,
      returnedMatches: 1,
      firstMatch: 'alpha',
    });

    const inspectFacade = await client.callTool({
      name: 'inspect_document',
      arguments: {
        target: { kind: 'active' },
      },
    });
    const inspectFacadeText = extractTextContent(inspectFacade.content);
    assert.ok(!inspectFacade.isError, `inspect_document should succeed: ${inspectFacadeText}`);
    const inspectFacadeJson = JSON.parse(inspectFacadeText) as {
      facade?: { tool?: string };
      result?: { routed_legacy?: Array<{ tool?: string }>; session?: { runtime?: RuntimeMetadata } };
    };
    assert.equal(inspectFacadeJson.facade?.tool, 'inspect_document');
    assert.ok(
      inspectFacadeJson.result?.routed_legacy?.some((entry) => entry.tool === 'session_status'),
      'inspect_document should report routed session_status legacy route',
    );
    const inspectRuntime = nestedRecord(inspectFacadeJson.result?.session?.runtime, 'inspect_document session runtime');
    assert.equal(inspectRuntime.appVersion, appRuntime.appVersion);
    assert.equal(nestedRecord(inspectRuntime.skew, 'inspect runtime skew').detected, true);

    const previewFacade = await client.callTool({
      name: 'preview_edit',
      arguments: {
        target: { kind: 'active' },
        operations: [
          {
            op: 'replace_text',
            selector: { family: 'field', field: 'description' },
            find: 'Field Alpha',
            replace: 'Field Beta',
          },
        ],
        dry_run: true,
      },
    });
    const previewFacadeText = extractTextContent(previewFacade.content);
    assert.ok(!previewFacade.isError, `preview_edit should succeed: ${previewFacadeText}`);
    const previewFacadeJson = JSON.parse(previewFacadeText) as {
      preview?: { preview_token?: string; operation_digest?: string };
      result?: { routed_legacy?: Array<{ tool?: string }>; touched_targets?: string[] };
    };
    assert.ok(previewFacadeJson.preview?.preview_token, 'preview_edit should return a preview token');
    assert.ok(previewFacadeJson.preview?.operation_digest, 'preview_edit should return an operation digest');
    assert.ok(previewFacadeJson.result?.touched_targets?.includes('field:description'));
    assert.ok(previewFacadeJson.result?.routed_legacy?.some((entry) => entry.tool === 'replace_in_field'));

    const applyFacade = await client.callTool({
      name: 'apply_edit',
      arguments: {
        target: { kind: 'active' },
        preview_token: previewFacadeJson.preview.preview_token,
        operation_digest: previewFacadeJson.preview.operation_digest,
      },
    });
    const applyFacadeText = extractTextContent(applyFacade.content);
    assert.ok(!applyFacade.isError, `apply_edit should succeed: ${applyFacadeText}`);
    const applyFacadeJson = JSON.parse(applyFacadeText) as {
      facade?: { tool?: string };
      result?: { routed_legacy?: Array<{ tool?: string }>; touched_targets?: string[] };
    };
    assert.equal(applyFacadeJson.facade?.tool, 'apply_edit');
    assert.ok(applyFacadeJson.result?.routed_legacy?.some((entry) => entry.tool === 'replace_in_field'));
    assert.ok(applyFacadeJson.result?.touched_targets?.includes('field:description'));

    const readFacade = await client.callTool({
      name: 'read_content',
      arguments: {
        target: { kind: 'active' },
        selectors: [{ family: 'field', field: 'description' }],
      },
    });
    const readFacadeText = extractTextContent(readFacade.content);
    assert.ok(!readFacade.isError, `read_content should succeed: ${readFacadeText}`);
    const readFacadeJson = JSON.parse(readFacadeText) as {
      result?: { items?: Array<{ data?: { content?: string } }> };
    };
    assert.equal(readFacadeJson.result?.items?.[0]?.data?.content, 'Field Beta is searchable.');

    const probeField = await client.callTool({
      name: 'probe_field',
      arguments: {
        file_path: probeFixture.filePath,
        field: 'description',
      },
    });
    const probeFieldText = extractTextContent(probeField.content);
    assert.ok(!probeField.isError, `probe_field should succeed: ${probeFieldText}`);
    const probeFieldJson = JSON.parse(probeFieldText) as { field?: string; content?: string };
    assert.equal(probeFieldJson.field, 'description');
    assert.equal(probeFieldJson.content, 'Probe description field.');

    const probeFieldBatch = await client.callTool({
      name: 'probe_field_batch',
      arguments: {
        file_path: probeFixture.filePath,
        fields: ['description', 'firstMessage'],
      },
    });
    const probeFieldBatchText = extractTextContent(probeFieldBatch.content);
    assert.ok(!probeFieldBatch.isError, `probe_field_batch should succeed: ${probeFieldBatchText}`);
    const probeFieldBatchJson = JSON.parse(probeFieldBatchText) as {
      count?: number;
      fields?: Array<{ field?: string; content?: string }>;
    };
    assert.equal(probeFieldBatchJson.count, 2);
    assert.deepEqual(
      probeFieldBatchJson.fields?.map((entry) => ({ field: entry.field, content: entry.content })),
      [
        { field: 'description', content: 'Probe description field.' },
        { field: 'firstMessage', content: 'Hello from probe.' },
      ],
    );

    const probeLorebook = await client.callTool({
      name: 'probe_lorebook',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const probeLorebookText = extractTextContent(probeLorebook.content);
    assert.ok(!probeLorebook.isError, `probe_lorebook should succeed: ${probeLorebookText}`);
    const probeLorebookJson = JSON.parse(probeLorebookText) as {
      entries?: Array<{ comment?: string }>;
    };
    assert.deepEqual(
      probeLorebookJson.entries?.map((entry) => entry.comment),
      ['Lore A', 'Lore B'],
    );

    const probeRegex = await client.callTool({
      name: 'probe_regex',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const probeRegexText = extractTextContent(probeRegex.content);
    assert.ok(!probeRegex.isError, `probe_regex should succeed: ${probeRegexText}`);
    const probeRegexJson = JSON.parse(probeRegexText) as {
      entries?: Array<{ comment?: string }>;
    };
    assert.deepEqual(
      probeRegexJson.entries?.map((entry) => entry.comment),
      ['Regex A'],
    );

    const probeLua = await client.callTool({
      name: 'probe_lua',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const probeLuaText = extractTextContent(probeLua.content);
    assert.ok(!probeLua.isError, `probe_lua should succeed: ${probeLuaText}`);
    const probeLuaJson = JSON.parse(probeLuaText) as {
      sections?: unknown[];
    };
    assert.ok(Array.isArray(probeLuaJson.sections), 'probe_lua should return a sections array');

    const probeCss = await client.callTool({
      name: 'probe_css',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const probeCssText = extractTextContent(probeCss.content);
    assert.ok(!probeCss.isError, `probe_css should succeed: ${probeCssText}`);
    const probeCssJson = JSON.parse(probeCssText) as {
      count?: number;
    };
    assert.equal(probeCssJson.count, 1);

    const probeGreetings = await client.callTool({
      name: 'probe_greetings',
      arguments: {
        file_path: probeFixture.filePath,
        type: 'alternate',
      },
    });
    const probeGreetingsText = extractTextContent(probeGreetings.content);
    assert.ok(!probeGreetings.isError, `probe_greetings should succeed: ${probeGreetingsText}`);
    const probeGreetingsJson = JSON.parse(probeGreetingsText) as {
      count?: number;
      type?: string;
    };
    assert.equal(probeGreetingsJson.type, 'alternate');
    assert.equal(probeGreetingsJson.count, 1);

    const probeTriggers = await client.callTool({
      name: 'probe_triggers',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const probeTriggersText = extractTextContent(probeTriggers.content);
    assert.ok(!probeTriggers.isError, `probe_triggers should succeed: ${probeTriggersText}`);
    const probeTriggersJson = JSON.parse(probeTriggersText) as {
      count?: number;
    };
    assert.equal(probeTriggersJson.count, 1);

    const inspectExternal = await client.callTool({
      name: 'inspect_external_file',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const inspectExternalText = extractTextContent(inspectExternal.content);
    assert.ok(!inspectExternal.isError, `inspect_external_file should succeed: ${inspectExternalText}`);
    const inspectExternalJson = JSON.parse(inspectExternalText) as {
      file_path?: string;
      file_type?: string;
      surfaceCounts?: { lorebook?: number; regex?: number };
    };
    assert.equal(inspectExternalJson.file_path, probeFixture.filePath);
    assert.equal(inspectExternalJson.file_type, 'charx');
    assert.equal(inspectExternalJson.surfaceCounts?.lorebook, 2);
    assert.equal(inspectExternalJson.surfaceCounts?.regex, 1);

    const externalSearch = await client.callTool({
      name: 'external_search_in_field',
      arguments: {
        file_path: probeFixture.filePath,
        field: 'description',
        query: 'description',
      },
    });
    const externalSearchText = extractTextContent(externalSearch.content);
    assert.ok(!externalSearch.isError, `external_search_in_field should succeed: ${externalSearchText}`);
    const externalSearchJson = JSON.parse(externalSearchText) as {
      totalMatches?: number;
      field?: string;
    };
    assert.equal(externalSearchJson.field, 'description');
    assert.equal(externalSearchJson.totalMatches, 1);

    const externalRange = await client.callTool({
      name: 'external_read_field_range',
      arguments: {
        file_path: probeFixture.filePath,
        field: 'description',
        offset: 0,
        length: 5,
      },
    });
    const externalRangeText = extractTextContent(externalRange.content);
    assert.ok(!externalRange.isError, `external_read_field_range should succeed: ${externalRangeText}`);
    const externalRangeJson = JSON.parse(externalRangeText) as {
      content?: string;
    };
    assert.equal(externalRangeJson.content, 'Probe');

    const openFile = await client.callTool({
      name: 'open_file',
      arguments: {
        file_path: probeFixture.filePath,
      },
    });
    const openFileText = extractTextContent(openFile.content);
    assert.ok(!openFile.isError, `open_file should succeed: ${openFileText}`);
    const openFileJson = JSON.parse(openFileText) as {
      file_path?: string;
      file_type?: string;
      name?: string;
      switched?: boolean;
    };
    assert.equal(openFileJson.file_path, probeFixture.filePath);
    assert.equal(openFileJson.file_type, 'charx');
    assert.equal(openFileJson.name, 'ProbeChar');
    assert.equal(openFileJson.switched, true);

    const currentFieldAfterOpen = await client.callTool({
      name: 'read_field',
      arguments: {
        field: 'description',
      },
    });
    const currentFieldAfterOpenText = extractTextContent(currentFieldAfterOpen.content);
    assert.ok(
      !currentFieldAfterOpen.isError,
      `read_field after open_file should succeed: ${currentFieldAfterOpenText}`,
    );
    const currentFieldAfterOpenJson = JSON.parse(currentFieldAfterOpenText) as {
      content?: string;
      field?: string;
    };
    assert.equal(currentFieldAfterOpenJson.field, 'description');
    assert.equal(currentFieldAfterOpenJson.content, 'Probe description field.');

    const workspaceFixtures = createFolderWorkspaceMcpFixtures(probeFixture.dir);
    const risumProjectPath = path.join(probeFixture.dir, 'workspace-module-project');
    const risumExtract = await callClientJson(client, 'extract_charx_to_project_folder', {
      file_path: workspaceFixtures.risumFile,
      project_path: risumProjectPath,
    });
    assert.equal(risumExtract.fileType, 'risum');
    assert.equal(risumExtract.projectPath, risumProjectPath);
    assert.ok(fs.existsSync(path.join(risumProjectPath, 'module.json')));
    assert.ok(!fs.existsSync(path.join(risumProjectPath, 'card.json')));
    const risumOutput = path.join(probeFixture.dir, 'workspace-module-output.risum');
    const risumReassemble = await callClientJson(client, 'reassemble_project_folder_to_charx', {
      project_path: risumProjectPath,
      output_path: risumOutput,
    });
    assert.equal(risumReassemble.fileType, 'risum');
    assert.equal(openRisum(risumOutput).moduleName, 'Workspace Module');

    const risupProjectPath = path.join(probeFixture.dir, 'workspace-preset-project');
    const risupExtract = await callClientJson(client, 'extract_charx_to_project_folder', {
      file_path: workspaceFixtures.risupFile,
      project_path: risupProjectPath,
    });
    assert.equal(risupExtract.fileType, 'risup');
    assert.equal(risupExtract.projectPath, risupProjectPath);
    assert.ok(fs.existsSync(path.join(risupProjectPath, 'preset.json')));
    const extractedPreset = JSON.parse(fs.readFileSync(path.join(risupProjectPath, 'preset.json'), 'utf-8')) as Record<
      string,
      unknown
    >;
    assert.equal(extractedPreset.openAIKey, undefined);
    assert.equal(extractedPreset.proxyKey, undefined);
    const risupOutput = path.join(probeFixture.dir, 'workspace-preset-output.risup');
    const risupReassemble = await callClientJson(client, 'reassemble_project_folder_to_charx', {
      project_path: risupProjectPath,
      output_path: risupOutput,
    });
    assert.equal(risupReassemble.fileType, 'risup');
    const reopenedPreset = openRisup(risupOutput);
    assert.equal(reopenedPreset.mainPrompt, '');
    assert.match(reopenedPreset.promptTemplate ?? '', /Workspace modern prompt/);
    assert.equal((reopenedPreset._presetData as Record<string, unknown>).openAIKey, undefined);

    console.log('search_all_fields MCP smoke test passed');
    await runStandaloneToolProfileContract();
    console.log('standalone MCP tool profile contract passed');
    await runStandaloneFacadeDogfood();
    console.log('facade-first standalone MCP dogfood eval passed');
    await runStandaloneManageItemsDogfood();
    console.log('manage_items standalone MCP dogfood eval passed');
    await runStandaloneManageFileDogfood();
    console.log('manage_file standalone MCP dogfood eval passed');
    await runStandaloneRealCorpusFacadeReadEval();
  } catch (error) {
    const stderrText = stderrChunks.join('').trim();
    const detail =
      error instanceof Error
        ? (error.stack ?? error.message)
        : typeof error === 'string'
          ? error
          : JSON.stringify(error, null, 2);
    throw new Error(stderrText ? `${detail}\n\nMCP stderr:\n${stderrText}` : detail);
  } finally {
    if (connected) {
      await client.close().catch(() => undefined);
    } else {
      await transport.close().catch(() => undefined);
    }
    await closeServer(api.server);
    if (probeFixture) {
      fs.rmSync(probeFixture.dir, { recursive: true, force: true });
    }
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
