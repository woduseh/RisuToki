import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { openRisup } from '../src/charx-io';
import { callJson, startStandaloneClient, type StandaloneClientRuntime } from './mcp-test-client';
import {
  applyManageFilePreview,
  createDogfoodFixtures,
  createFolderWorkspaceMcpFixtures,
  nestedArray,
  nestedRecord,
  previewToken,
  routedTools,
} from './mcp-search-shared';

export async function runStandaloneManageFileDogfood(): Promise<void> {
  const fixture = createDogfoodFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startStandaloneClient({
      file: fixture.mainFile,
      userDataDir: fixture.userDataDir,
      allowWrites: true,
    });
    const activeTarget = { kind: 'active' };
    const externalTarget = { kind: 'external', file_path: fixture.externalFile };

    const initialSnapshots = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'read',
      operation: { action: 'list_snapshots', field: 'description' },
    });
    assert.deepEqual(routedTools(initialSnapshots), ['list_snapshots']);

    const staleSavePreview = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'preview',
      operation: { action: 'save_current_file' },
    });
    const staleSave = await callJson(
      runtime,
      'manage_file',
      {
        target: activeTarget,
        mode: 'apply',
        preview_token: previewToken(staleSavePreview, 'stale save preview').preview_token,
        operation_digest: previewToken(staleSavePreview, 'stale save preview').operation_digest,
        guard_values: [{ name: 'expected_active_file_path', value: 'stale-active-path' }],
      },
      { expectError: true },
    );
    assert.equal(staleSave.status, 409);
    const staleSaveToken = previewToken(staleSavePreview, 'stale save preview');
    const consumedSave = await callJson(
      runtime,
      'manage_file',
      {
        target: activeTarget,
        mode: 'apply',
        preview_token: staleSaveToken.preview_token,
        operation_digest: staleSaveToken.operation_digest,
        guard_values: staleSaveToken.required_guards,
      },
      { expectError: true },
    );
    assert.equal(consumedSave.status, 404);
    const freshSavePreview = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'preview',
      operation: { action: 'save_current_file' },
    });
    await applyManageFilePreview(runtime, activeTarget, freshSavePreview);

    const snapshotPreview = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'preview',
      operation: { action: 'snapshot_field', field: 'description' },
    });
    assert.ok(routedTools(snapshotPreview).includes('snapshot_field'));
    const snapshotApply = await applyManageFilePreview(runtime, activeTarget, snapshotPreview);
    const snapshotId = String(nestedRecord(snapshotApply.result, 'snapshot apply result').snapshotId);
    assert.ok(snapshotId.startsWith('snap_'));

    const snapshots = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'read',
      operation: { action: 'list_snapshots', field: 'description' },
    });
    assert.equal(nestedRecord(snapshots.result, 'snapshot list result').count, 1);

    const restorePreview = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'preview',
      operation: { action: 'restore_snapshot', field: 'description', snapshot_id: snapshotId },
    });
    assert.ok(routedTools(restorePreview).includes('restore_snapshot'));
    await applyManageFilePreview(runtime, activeTarget, restorePreview);

    const exportPath = path.join(fixture.dir, 'description-export.txt');
    const exportPreview = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'preview',
      operation: { action: 'export_field', field: 'description', file_path: exportPath, format: 'txt' },
    });
    assert.ok(routedTools(exportPreview).includes('export_field_to_file'));
    await applyManageFilePreview(runtime, activeTarget, exportPreview);
    assert.equal(fs.readFileSync(exportPath, 'utf-8'), 'Alpha facade dogfood description.');

    const lorebookExportDir = path.join(fixture.dir, 'lorebook-export');
    const lorebookExportPreview = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'preview',
      operation: { action: 'export_lorebook', target_dir: lorebookExportDir, format: 'md' },
    });
    assert.ok(routedTools(lorebookExportPreview).includes('export_lorebook_to_files'));
    assert.equal(fs.existsSync(lorebookExportDir), false, 'lorebook export preview must not write files');
    fs.mkdirSync(lorebookExportDir, { recursive: true });
    fs.writeFileSync(path.join(lorebookExportDir, 'concurrent.txt'), 'changed after preview', 'utf-8');
    const staleLorebookExport = await callJson(
      runtime,
      'manage_file',
      {
        target: activeTarget,
        mode: 'apply',
        preview_token: previewToken(lorebookExportPreview, 'lorebook export preview').preview_token,
        operation_digest: previewToken(lorebookExportPreview, 'lorebook export preview').operation_digest,
        guard_values: previewToken(lorebookExportPreview, 'lorebook export preview').required_guards,
      },
      { expectError: true },
    );
    assert.equal(staleLorebookExport.status, 409);
    fs.rmSync(lorebookExportDir, { recursive: true, force: true });
    const freshLorebookExportPreview = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'preview',
      operation: { action: 'export_lorebook', target_dir: lorebookExportDir, format: 'md' },
    });
    await applyManageFilePreview(runtime, activeTarget, freshLorebookExportPreview);
    assert.ok(fs.existsSync(path.join(lorebookExportDir, '_export_meta.json')));

    const lorebookImportDir = path.join(fixture.dir, 'lorebook-import');
    fs.mkdirSync(lorebookImportDir, { recursive: true });
    const lorebookImportPath = path.join(lorebookImportDir, 'imported.md');
    fs.writeFileSync(lorebookImportPath, '---\nkey: imported\n---\n\nImported lore body.', 'utf-8');
    const lorebookBeforeImport = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'lorebook' }],
    });
    const lorebookBeforeCount = Number(
      nestedRecord(
        nestedRecord(
          nestedArray(
            nestedRecord(lorebookBeforeImport.result, 'lorebook before import result').items,
            'lorebook before import items',
          )[0],
          'lorebook before import item',
        ).data,
        'lorebook before import data',
      ).count,
    );
    const lorebookImportPreview = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'preview',
      operation: { action: 'import_lorebook', source_dir: lorebookImportDir, format: 'md', conflict: 'rename' },
    });
    assert.ok(routedTools(lorebookImportPreview).includes('import_lorebook_from_files'));
    const lorebookAfterPreview = await callJson(runtime, 'read_content', {
      target: activeTarget,
      selectors: [{ family: 'lorebook' }],
    });
    const lorebookAfterPreviewCount = Number(
      nestedRecord(
        nestedRecord(
          nestedArray(
            nestedRecord(lorebookAfterPreview.result, 'lorebook after preview result').items,
            'lorebook after preview items',
          )[0],
          'lorebook after preview item',
        ).data,
        'lorebook after preview data',
      ).count,
    );
    assert.equal(lorebookAfterPreviewCount, lorebookBeforeCount, 'lorebook import preview must not mutate entries');
    fs.appendFileSync(lorebookImportPath, '\nChanged after preview.', 'utf-8');
    const staleLorebookImport = await callJson(
      runtime,
      'manage_file',
      {
        target: activeTarget,
        mode: 'apply',
        preview_token: previewToken(lorebookImportPreview, 'lorebook import preview').preview_token,
        operation_digest: previewToken(lorebookImportPreview, 'lorebook import preview').operation_digest,
        guard_values: previewToken(lorebookImportPreview, 'lorebook import preview').required_guards,
      },
      { expectError: true },
    );
    assert.equal(staleLorebookImport.status, 409);
    const freshLorebookImportPreview = await callJson(runtime, 'manage_file', {
      target: activeTarget,
      mode: 'preview',
      operation: { action: 'import_lorebook', source_dir: lorebookImportDir, format: 'md', conflict: 'rename' },
    });
    await applyManageFilePreview(runtime, activeTarget, freshLorebookImportPreview);

    const openPreview = await callJson(runtime, 'manage_file', {
      target: externalTarget,
      mode: 'preview',
      operation: { action: 'open_file' },
    });
    assert.ok(routedTools(openPreview).includes('open_file'));
    const openApply = await applyManageFilePreview(runtime, externalTarget, openPreview);
    assert.equal(nestedRecord(openApply.result, 'open apply result').file_path, fixture.externalFile);

    const workspaceFixtures = createFolderWorkspaceMcpFixtures(fixture.dir);
    const projectPath = path.join(fixture.dir, 'manage-file-preset-project');
    const extractPreview = await callJson(runtime, 'manage_file', {
      target: { kind: 'external', file_path: workspaceFixtures.risupFile },
      mode: 'preview',
      operation: { action: 'extract_project', project_path: projectPath },
    });
    assert.ok(routedTools(extractPreview).includes('extract_charx_to_project_folder'));
    const extractApply = await applyManageFilePreview(
      runtime,
      { kind: 'external', file_path: workspaceFixtures.risupFile },
      extractPreview,
    );
    assert.equal(nestedRecord(extractApply.result, 'extract apply result').fileType, 'risup');
    assert.ok(fs.existsSync(path.join(projectPath, 'preset.json')));

    const treeRead = await callJson(runtime, 'manage_file', {
      target: { kind: 'external', file_path: projectPath },
      mode: 'read',
      operation: { action: 'project_tree' },
    });
    assert.deepEqual(routedTools(treeRead), ['manage_file']);
    assert.equal(nestedRecord(treeRead.result, 'project tree result').file_type, 'risup');

    const outputPath = path.join(fixture.dir, 'manage-file-preset-output.risup');
    const reassemblePreview = await callJson(runtime, 'manage_file', {
      target: { kind: 'external', file_path: projectPath },
      mode: 'preview',
      operation: { action: 'reassemble_project', output_path: outputPath },
    });
    assert.ok(routedTools(reassemblePreview).includes('reassemble_project_folder_to_charx'));
    const reassembleApply = await applyManageFilePreview(
      runtime,
      { kind: 'external', file_path: projectPath },
      reassemblePreview,
    );
    assert.equal(nestedRecord(reassembleApply.result, 'reassemble apply result').fileType, 'risup');
    assert.match(openRisup(outputPath).promptTemplate ?? '', /Workspace modern prompt/);
  } finally {
    if (runtime) await runtime.close();
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  }
}
