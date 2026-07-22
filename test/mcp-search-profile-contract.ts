import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { openCharx, saveCharx } from '../src/charx-io';
import { MCP_DEFAULT_TOOLS_LIST_MAX_BYTES } from '../src/lib/mcp-compact-input';
import { callJson, startStandaloneClient, type StandaloneClientRuntime } from './mcp-test-client';
import {
  dogfoodCardData,
  nestedArray,
  nestedRecord,
  previewToken,
  readStandaloneLog,
  routedTools,
} from './mcp-search-shared';

export async function runStandaloneToolProfileContract(): Promise<void> {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risutoki-profile-contract-'));
  const expectedFacadeTools = [
    'apply_edit',
    'analyze_content',
    'inspect_document',
    'list_tool_profiles',
    'manage_assets',
    'manage_file',
    'manage_items',
    'preview_edit',
    'read_content',
    'search_document',
    'validate_content',
  ].sort();
  const expectedDefaultTools = [...expectedFacadeTools, 'list_skills', 'read_skill'].sort();

  const inspectProfile = async (profile: string | undefined, label: string, envToolProfile?: string) => {
    const userDataDir = path.join(rootDir, label);
    fs.mkdirSync(userDataDir, { recursive: true });
    const runtime = await startStandaloneClient({
      userDataDir,
      ...(profile ? { toolProfile: profile } : {}),
      ...(envToolProfile ? { envToolProfile } : {}),
    });
    try {
      const tools = await runtime.client.listTools();
      return {
        names: tools.tools.map((tool) => tool.name).sort(),
        bytes: Buffer.byteLength(JSON.stringify(tools), 'utf-8'),
        runtime,
        userDataDir,
      };
    } catch (error) {
      await runtime.close();
      throw error;
    }
  };

  let defaultProfile: Awaited<ReturnType<typeof inspectProfile>> | null = null;
  let advancedProfile: Awaited<ReturnType<typeof inspectProfile>> | null = null;
  let authoringProfile: Awaited<ReturnType<typeof inspectProfile>> | null = null;
  let readonlyProfile: Awaited<ReturnType<typeof inspectProfile>> | null = null;
  let noWritesRuntime: StandaloneClientRuntime | null = null;
  let invalidProfile: Awaited<ReturnType<typeof inspectProfile>> | null = null;
  let argvPrecedenceProfile: Awaited<ReturnType<typeof inspectProfile>> | null = null;
  try {
    defaultProfile = await inspectProfile(undefined, 'default');
    assert.deepEqual(defaultProfile.names, expectedDefaultTools);
    assert.equal(defaultProfile.names.length, 13);
    assert.ok(
      defaultProfile.bytes <= MCP_DEFAULT_TOOLS_LIST_MAX_BYTES,
      'default tools/list should stay within a 42 KiB budget',
    );
    const skills = await callJson(defaultProfile.runtime, 'list_skills', {});
    assert.ok(Number(skills.count) > 0);
    const skill = await callJson(defaultProfile.runtime, 'read_skill', { name: 'project-workflow' });
    assert.match(String(skill.content), /Project Workflow/);
    const scopedSkills = await callJson(defaultProfile.runtime, 'list_skills', {
      scopes: ['bot'],
      query: 'authoring',
      detail: 'summary',
      limit: 1,
    });
    const firstScopedSkill = nestedRecord(nestedArray(scopedSkills.skills, 'scoped skills')[0], 'scoped skill');
    assert.equal(firstScopedSkill.scope, 'bot');
    assert.equal(firstScopedSkill.files, undefined);
    assert.equal(typeof scopedSkills.next_cursor, 'string');
    const nextScopedSkills = await callJson(defaultProfile.runtime, 'list_skills', {
      scopes: ['bot'],
      query: 'authoring',
      detail: 'summary',
      limit: 1,
      cursor: scopedSkills.next_cursor,
    });
    const secondScopedSkill = nestedRecord(
      nestedArray(nextScopedSkills.skills, 'next scoped skills')[0],
      'next scoped skill',
    );
    assert.notEqual(secondScopedSkill.name, firstScopedSkill.name);
    const guidanceInspect = await callJson(defaultProfile.runtime, 'inspect_document', {
      target: { kind: 'guidance', skill: 'project-workflow' },
    });
    assert.deepEqual(routedTools(guidanceInspect), ['read_skill']);
    assert.match(JSON.stringify(guidanceInspect), /Project Workflow/);

    advancedProfile = await inspectProfile('advanced-full', 'advanced-full');
    assert.equal(advancedProfile.names.length, 203);
    assert.ok(advancedProfile.names.length > defaultProfile.names.length);
    assert.ok(advancedProfile.names.includes('read_field'));
    assert.ok(advancedProfile.names.includes('list_skills'));
    assert.ok(advancedProfile.names.includes('read_skill'));
    assert.ok(advancedProfile.names.includes('load_guidance'));
    const guidance = await callJson(advancedProfile.runtime, 'load_guidance', {
      target: { kind: 'guidance', skill: 'project-workflow' },
    });
    assert.deepEqual(routedTools(guidance), ['read_skill']);
    assert.match(JSON.stringify(guidance), /Project Workflow/);
    assert.ok(
      defaultProfile.bytes <= advancedProfile.bytes * 0.2,
      'default tools/list should be at least 80% smaller than advanced-full',
    );

    authoringProfile = await inspectProfile('authoring', 'authoring');
    assert.ok(authoringProfile.names.includes('read_field'));
    assert.ok(authoringProfile.names.includes('read_skill'));
    assert.ok(!authoringProfile.names.includes('open_file'));

    readonlyProfile = await inspectProfile('readonly', 'readonly');
    assert.ok(readonlyProfile.names.includes('load_guidance'));
    assert.ok(readonlyProfile.names.includes('read_skill'));
    assert.ok(!readonlyProfile.names.includes('preview_edit'));
    assert.ok(!readonlyProfile.names.includes('apply_edit'));
    assert.ok(!readonlyProfile.names.includes('open_file'));

    const noWritesFile = path.join(rootDir, 'no-writes.charx');
    saveCharx(noWritesFile, dogfoodCardData('No writes card', 'Original no-writes description.'));
    noWritesRuntime = await startStandaloneClient({
      file: noWritesFile,
      userDataDir: path.join(rootDir, 'no-writes'),
    });
    const noWritesPreview = await callJson(noWritesRuntime, 'preview_edit', {
      target: { kind: 'active', document: 'current' },
      operations: [
        {
          op: 'replace_text',
          selector: { family: 'field', field: 'description' },
          find: 'Original',
          replace: 'Changed',
        },
      ],
    });
    const noWritesPreviewInfo = previewToken(noWritesPreview, 'no-writes preview');
    const rejectedApply = await callJson(
      noWritesRuntime,
      'apply_edit',
      {
        preview_token: noWritesPreviewInfo.preview_token,
        operation_digest: noWritesPreviewInfo.operation_digest,
        target: { kind: 'active', document: 'current' },
      },
      { expectError: true },
    );
    assert.equal(rejectedApply.status, 403);
    assert.equal(rejectedApply.retryable, false);
    assert.equal(rejectedApply.retry_mode, 'never');
    assert.equal(rejectedApply.outcome, 'not_started');
    assert.equal(openCharx(noWritesFile).description, 'Original no-writes description.');

    invalidProfile = await inspectProfile('not-a-profile', 'invalid');
    assert.deepEqual(invalidProfile.names, expectedDefaultTools);
    assert.match(readStandaloneLog(invalidProfile.userDataDir), /toolProfileWarning/);
    assert.match(readStandaloneLog(invalidProfile.userDataDir), /falling back to the facade-first registered surface/);

    argvPrecedenceProfile = await inspectProfile('facade-first', 'argv-precedence', 'advanced-full');
    assert.deepEqual(argvPrecedenceProfile.names, expectedDefaultTools);
  } finally {
    for (const profile of [
      argvPrecedenceProfile,
      invalidProfile,
      readonlyProfile,
      authoringProfile,
      advancedProfile,
      defaultProfile,
    ]) {
      if (profile) await profile.runtime.close();
    }
    if (noWritesRuntime) await noWritesRuntime.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}
