import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { openCharx, openRisum } from '../src/charx-io';
import { callJson, startStandaloneClient, type StandaloneClientRuntime } from './mcp-test-client';
import {
  applyManageAssetsPreview,
  applyManagePreview,
  createCompressiblePngBase64,
  createManageItemsFixtures,
  currentPromptIds,
  nestedArray,
  nestedRecord,
  previewToken,
  risupPromptItems,
  routedTools,
} from './mcp-search-shared';

export async function runStandaloneManageItemsDogfood(): Promise<void> {
  const fixture = createManageItemsFixtures();
  let runtime: StandaloneClientRuntime | null = null;
  try {
    runtime = await startStandaloneClient({
      file: fixture.activeRisup,
      userDataDir: fixture.userDataDir,
      allowWrites: true,
    });
    const activeTarget = { kind: 'active' };
    const externalTarget = { kind: 'external', file_path: fixture.externalRisup };

    const addPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'risup-prompt',
      mode: 'preview',
      operation: {
        action: 'add_items',
        insertAt: 1,
        items: [
          { type: 'plain', type2: 'normal', text: 'Managed facade inserted prompt.', role: 'system' },
          { type: 'cache', name: 'managed-cache', depth: 2, role: 'system' },
        ],
      },
    });
    assert.ok(routedTools(addPreview).includes('add_risup_prompt_item_batch'));
    const addApply = await applyManagePreview(runtime, activeTarget, addPreview);
    assert.ok(routedTools(addApply).includes('add_risup_prompt_item_batch'));
    assert.equal((await currentPromptIds(runtime)).length, 4);

    const ids = await currentPromptIds(runtime);
    const reorderPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'risup-prompt',
      mode: 'preview',
      operation: { action: 'reorder_items', order_ids: [...ids].reverse() },
    });
    assert.ok(routedTools(reorderPreview).includes('reorder_risup_prompt_items_by_id'));
    await applyManagePreview(runtime, activeTarget, reorderPreview);

    const copyText = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'risup-prompt',
      mode: 'read',
      operation: { action: 'copy_as_text', selector: { indices: [0, 1] } },
      max_bytes: 4096,
    });
    const copiedText = String(nestedRecord(copyText.result, 'copy text result').text ?? '');
    assert.match(copiedText, /### \[/);

    const savePreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'risup-prompt',
      mode: 'preview',
      operation: { action: 'save_snippet', name: 'Managed snippet', selector: { indices: [0, 1] } },
    });
    assert.ok(routedTools(savePreview).includes('save_risup_prompt_snippet'));
    await applyManagePreview(runtime, activeTarget, savePreview);

    const snippets = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'risup-prompt',
      mode: 'read',
      operation: { action: 'list_snippets' },
    });
    assert.equal(nestedRecord(snippets.result, 'snippet list').count, 1);

    const insertPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'risup-prompt',
      mode: 'preview',
      operation: { action: 'insert_snippet', identifier: 'Managed snippet', insertAt: 0 },
    });
    assert.ok(routedTools(insertPreview).includes('insert_risup_prompt_snippet'));
    await applyManagePreview(runtime, activeTarget, insertPreview);
    assert.ok((await currentPromptIds(runtime)).length > 4);

    const staleDelete = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'risup-prompt',
      mode: 'preview',
      operation: { action: 'delete_snippet', identifier: 'Managed snippet' },
    });
    const stalePreview = previewToken(staleDelete, 'stale delete preview');
    await callJson(
      runtime,
      'manage_items',
      {
        target: activeTarget,
        family: 'risup-prompt',
        mode: 'apply',
        preview_token: stalePreview.preview_token,
        operation_digest: stalePreview.operation_digest,
        guard_values: [{ name: 'expected_snippet_updated_at', value: 'stale' }],
      },
      { expectError: true },
    );
    const consumedDelete = await callJson(
      runtime,
      'manage_items',
      {
        target: activeTarget,
        family: 'risup-prompt',
        mode: 'apply',
        preview_token: stalePreview.preview_token,
        operation_digest: stalePreview.operation_digest,
        guard_values: stalePreview.required_guards,
      },
      { expectError: true },
    );
    assert.equal(consumedDelete.status, 404);
    const freshDelete = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'risup-prompt',
      mode: 'preview',
      operation: { action: 'delete_snippet', identifier: 'Managed snippet' },
    });
    await applyManagePreview(runtime, activeTarget, freshDelete);

    const externalAddPreview = await callJson(runtime, 'manage_items', {
      target: externalTarget,
      family: 'risup-prompt',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ type: 'plain', type2: 'normal', text: 'External managed add.', role: 'system' }],
      },
    });
    assert.ok(routedTools(externalAddPreview).includes('external_write_field'));
    await applyManagePreview(runtime, externalTarget, externalAddPreview);
    assert.equal(risupPromptItems(fixture.externalRisup).length, 3);

    const externalImportPreview = await callJson(runtime, 'manage_items', {
      target: externalTarget,
      family: 'risup-prompt',
      mode: 'preview',
      operation: { action: 'import_text', text: copiedText, import_mode: 'append', insertAt: 1 },
    });
    assert.ok(routedTools(externalImportPreview).includes('external_write_field'));
    await applyManagePreview(runtime, externalTarget, externalImportPreview);
    assert.ok(risupPromptItems(fixture.externalRisup).length > 3);

    const largeCopy = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'risup-prompt',
      mode: 'read',
      operation: { action: 'copy_as_text', selector: { indices: [0, 1, 2, 3] } },
      max_bytes: 256,
    });
    assert.equal(nestedRecord(largeCopy.facade, 'large copy facade').truncated, true);

    await runtime.close();
    runtime = null;
    runtime = await startStandaloneClient({
      file: fixture.activeCharx,
      userDataDir: path.join(fixture.dir, 'charx-user-data'),
      allowWrites: true,
    });
    const externalCharxTarget = { kind: 'external', file_path: fixture.externalCharx };
    const externalRisumTarget = { kind: 'external', file_path: fixture.externalRisum };

    const activeAssetAddPreview = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'charx',
      mode: 'preview',
      operation: {
        action: 'add_asset',
        fileName: 'managed-asset.png',
        base64: Buffer.from('active-managed-asset').toString('base64'),
      },
    });
    assert.ok(routedTools(activeAssetAddPreview).includes('list_charx_assets'));
    assert.ok(routedTools(activeAssetAddPreview).includes('add_charx_asset'));
    assert.ok(
      nestedArray(
        nestedRecord(activeAssetAddPreview.preview, 'active asset add preview').required_guards,
        'active asset add guards',
      ).some((guard) => nestedRecord(guard, 'active asset guard').name === 'expected_asset_collection_digest'),
    );
    const activeAssetAddApply = await applyManageAssetsPreview(runtime, activeTarget, activeAssetAddPreview, 'charx');
    assert.ok(routedTools(activeAssetAddApply).includes('add_charx_asset'));
    const activeAssetList = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'charx',
      mode: 'read',
      operation: { action: 'list_assets' },
    });
    assert.equal(nestedRecord(activeAssetList.result, 'active asset list result').count, 1);

    const activeAssetRenamePreview = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'charx',
      mode: 'preview',
      operation: {
        action: 'rename_asset',
        selector: { path: 'assets/other/image/managed-asset.png' },
        newName: 'managed-asset-renamed.png',
      },
    });
    assert.ok(routedTools(activeAssetRenamePreview).includes('rename_charx_asset'));
    const activeRenameToken = previewToken(activeAssetRenamePreview, 'active asset rename preview');
    const staleAssetRename = await callJson(
      runtime,
      'manage_assets',
      {
        target: activeTarget,
        asset_family: 'charx',
        mode: 'apply',
        preview_token: activeRenameToken.preview_token,
        operation_digest: activeRenameToken.operation_digest,
        guard_values: [{ name: 'expected_asset_collection_digest', value: 'stale' }],
      },
      { expectError: true },
    );
    assert.equal(staleAssetRename.status, 409);
    const consumedAssetRename = await callJson(
      runtime,
      'manage_assets',
      {
        target: activeTarget,
        asset_family: 'charx',
        mode: 'apply',
        preview_token: activeRenameToken.preview_token,
        operation_digest: activeRenameToken.operation_digest,
        guard_values: activeRenameToken.required_guards,
      },
      { expectError: true },
    );
    assert.equal(consumedAssetRename.status, 404);
    const freshAssetRenamePreview = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'charx',
      mode: 'preview',
      operation: {
        action: 'rename_asset',
        selector: { path: 'assets/other/image/managed-asset.png' },
        newName: 'managed-asset-renamed.png',
      },
    });
    await applyManageAssetsPreview(runtime, activeTarget, freshAssetRenamePreview, 'charx');

    const activeAssetDeletePreview = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'charx',
      mode: 'preview',
      operation: { action: 'delete_asset', selector: { path: 'assets/other/image/managed-asset-renamed.png' } },
    });
    assert.ok(routedTools(activeAssetDeletePreview).includes('delete_charx_asset'));
    await applyManageAssetsPreview(runtime, activeTarget, activeAssetDeletePreview, 'charx');

    const compressiblePngBase64 = await createCompressiblePngBase64();
    const activeCompressionAddPreview = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'charx',
      mode: 'preview',
      operation: {
        action: 'add_asset',
        fileName: 'compress-source.png',
        base64: compressiblePngBase64,
      },
    });
    await applyManageAssetsPreview(runtime, activeTarget, activeCompressionAddPreview, 'charx');
    const activeCompressPreview = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'charx',
      mode: 'preview',
      operation: { action: 'compress_assets', quality: 30 },
    });
    assert.ok(routedTools(activeCompressPreview).includes('compress_assets_webp'));
    assert.ok(
      nestedArray(
        nestedRecord(activeCompressPreview.preview, 'active asset compression preview').required_guards,
        'active asset compression guards',
      ).some(
        (guard) => nestedRecord(guard, 'active asset compression guard').name === 'expected_asset_collection_digest',
      ),
    );
    const activeCompressApply = await applyManageAssetsPreview(runtime, activeTarget, activeCompressPreview, 'charx');
    assert.ok(routedTools(activeCompressApply).includes('compress_assets_webp'));
    const activeCompressedAssetList = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'charx',
      mode: 'read',
      operation: { action: 'list_assets' },
    });
    assert.ok(
      nestedArray(nestedRecord(activeCompressedAssetList.result, 'active compressed assets').assets, 'assets').some(
        (asset) => String(nestedRecord(asset, 'active compressed asset').path).endsWith('.webp'),
      ),
    );

    await callJson(
      runtime,
      'manage_assets',
      {
        target: externalCharxTarget,
        asset_family: 'charx',
        mode: 'preview',
        operation: {
          action: 'add_asset',
          path: '../outside.png',
          base64: Buffer.from('invalid-path').toString('base64'),
        },
      },
      { expectError: true },
    );

    const externalCharxAssetPreview = await callJson(runtime, 'manage_assets', {
      target: externalCharxTarget,
      asset_family: 'charx',
      mode: 'preview',
      operation: {
        action: 'add_asset',
        fileName: 'external-managed-asset.png',
        base64: Buffer.from('external-managed-asset').toString('base64'),
      },
    });
    assert.ok(routedTools(externalCharxAssetPreview).includes('external_patch_surface'));
    await applyManageAssetsPreview(runtime, externalCharxTarget, externalCharxAssetPreview, 'charx');
    const externalCharxWithAsset = openCharx(fixture.externalCharx);
    assert.equal(externalCharxWithAsset.assets?.length, 1);
    assert.equal(externalCharxWithAsset.cardAssets?.length, 1);
    assert.ok(externalCharxWithAsset.xMeta?.['external-managed-asset']);

    const externalCompressionAddPreview = await callJson(runtime, 'manage_assets', {
      target: externalCharxTarget,
      asset_family: 'charx',
      mode: 'preview',
      operation: {
        action: 'add_asset',
        fileName: 'external-compress-source.png',
        base64: compressiblePngBase64,
      },
    });
    await applyManageAssetsPreview(runtime, externalCharxTarget, externalCompressionAddPreview, 'charx');
    const externalCompressPreview = await callJson(runtime, 'manage_assets', {
      target: externalCharxTarget,
      asset_family: 'charx',
      mode: 'preview',
      operation: { action: 'compress_assets', quality: 30 },
    });
    assert.ok(routedTools(externalCompressPreview).includes('external_patch_surface'));
    await applyManageAssetsPreview(runtime, externalCharxTarget, externalCompressPreview, 'charx');
    const externalCompressedCharx = openCharx(fixture.externalCharx);
    assert.ok(externalCompressedCharx.assets?.some((asset) => String(asset.path).endsWith('.webp')));
    assert.ok(
      externalCompressedCharx.cardAssets?.some((asset) =>
        String((asset as Record<string, unknown>).uri ?? '').endsWith('.webp'),
      ),
    );
    const externalCharxValidation = await callJson(runtime, 'validate_content', {
      target: externalCharxTarget,
      selectors: [{ family: 'asset' }],
    });
    assert.deepEqual(routedTools(externalCharxValidation), ['validate_charx_export_compatibility']);
    const externalCharxValidationRows = nestedArray(
      nestedRecord(externalCharxValidation.result, 'external charx validation result').validations,
      'external charx validation rows',
    );
    assert.equal(
      nestedRecord(nestedRecord(externalCharxValidationRows[0], 'external charx validation row').data, 'data')
        .file_path,
      fixture.externalCharx,
    );

    const externalRisumAssetPreview = await callJson(runtime, 'manage_assets', {
      target: externalRisumTarget,
      asset_family: 'risum',
      mode: 'preview',
      operation: {
        action: 'add_asset',
        name: 'external_module_asset',
        path: 'external_module_asset.png',
        base64: compressiblePngBase64,
      },
    });
    assert.ok(routedTools(externalRisumAssetPreview).includes('external_patch_surface'));
    await applyManageAssetsPreview(runtime, externalRisumTarget, externalRisumAssetPreview, 'risum');
    assert.equal(openRisum(fixture.externalRisum).risumAssets?.length, 1);

    const externalRisumRenamePreview = await callJson(runtime, 'manage_assets', {
      target: externalRisumTarget,
      asset_family: 'risum',
      mode: 'preview',
      operation: {
        action: 'rename_asset',
        selector: { index: 0 },
        newName: 'external_module_asset_renamed.png',
      },
    });
    assert.ok(routedTools(externalRisumRenamePreview).includes('external_patch_surface'));
    await applyManageAssetsPreview(runtime, externalRisumTarget, externalRisumRenamePreview, 'risum');
    const externalRisumModuleAssets = (
      openRisum(fixture.externalRisum)._moduleData as { module?: { assets?: unknown[][] } }
    ).module?.assets;
    assert.equal(externalRisumModuleAssets?.[0]?.[0], 'external_module_asset_renamed');
    assert.equal(externalRisumModuleAssets?.[0]?.[2], 'png');
    const externalRisumCompressPreview = await callJson(runtime, 'manage_assets', {
      target: externalRisumTarget,
      asset_family: 'risum',
      mode: 'preview',
      operation: { action: 'compress_assets', quality: 30 },
    });
    assert.ok(routedTools(externalRisumCompressPreview).includes('external_patch_surface'));
    assert.ok(
      nestedArray(
        nestedRecord(externalRisumCompressPreview.preview, 'external risum compression preview').required_guards,
        'external risum compression guards',
      ).some(
        (guard) => nestedRecord(guard, 'external risum compression guard').name === 'expected_asset_collection_digest',
      ),
    );
    await applyManageAssetsPreview(runtime, externalRisumTarget, externalRisumCompressPreview, 'risum');
    const compressedExternalRisum = openRisum(fixture.externalRisum);
    const compressedExternalModuleAssets = (
      compressedExternalRisum._moduleData as { module?: { assets?: unknown[][] } }
    ).module?.assets;
    assert.equal(compressedExternalModuleAssets?.[0]?.[2], 'webp');
    const externalRisumValidation = await callJson(runtime, 'validate_content', {
      target: externalRisumTarget,
      selectors: [{ family: 'risum' }],
    });
    assert.ok(routedTools(externalRisumValidation).every((tool) => tool === 'external_read_surface'));
    const externalRisumValidationRows = nestedArray(
      nestedRecord(externalRisumValidation.result, 'external risum validation result').validations,
      'external risum validation rows',
    );
    assert.equal(
      nestedRecord(
        nestedRecord(externalRisumValidationRows[0], 'external risum validation row').data,
        'external risum validation data',
      ).file_path,
      fixture.externalRisum,
    );

    const externalRisumDeletePreview = await callJson(runtime, 'manage_assets', {
      target: externalRisumTarget,
      asset_family: 'risum',
      mode: 'preview',
      operation: { action: 'delete_asset', selector: { index: 0 } },
    });
    assert.ok(routedTools(externalRisumDeletePreview).includes('external_patch_surface'));
    await applyManageAssetsPreview(runtime, externalRisumTarget, externalRisumDeletePreview, 'risum');
    assert.equal(openRisum(fixture.externalRisum).risumAssets?.length, 0);

    const activeLorebookAddPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'lorebook',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ comment: 'Managed Lore', key: 'managed', content: 'Managed lorebook facade entry.' }],
      },
    });
    assert.deepEqual(routedTools(activeLorebookAddPreview), ['read_surface', 'patch_surface']);
    assert.ok(
      nestedArray(
        nestedRecord(activeLorebookAddPreview.preview, 'active lorebook manage preview').required_guards,
        'active lorebook guards',
      ).some((guard) => nestedRecord(guard, 'active lorebook guard').name === 'expected_item_collection_digest'),
    );
    await applyManagePreview(runtime, activeTarget, activeLorebookAddPreview, 'lorebook');

    const activeRegexAddPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'regex',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ comment: 'Managed Regex', find: 'Managed', replace: 'Handled', flag: 'g' }],
      },
    });
    assert.deepEqual(routedTools(activeRegexAddPreview), ['read_surface', 'patch_surface']);
    await applyManagePreview(runtime, activeTarget, activeRegexAddPreview, 'regex');
    const activeRegexReorderPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'regex',
      mode: 'preview',
      operation: { action: 'reorder_items', order: [1, 0] },
    });
    assert.deepEqual(routedTools(activeRegexReorderPreview), ['read_surface', 'patch_surface']);
    await applyManagePreview(runtime, activeTarget, activeRegexReorderPreview, 'regex');

    const activeGreetingAddPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'greeting',
      mode: 'preview',
      operation: {
        action: 'add_items',
        greeting_type: 'alternate',
        items: [{ content: 'Managed alternate greeting.' }],
      },
    });
    assert.deepEqual(routedTools(activeGreetingAddPreview), ['read_surface', 'patch_surface']);
    await applyManagePreview(runtime, activeTarget, activeGreetingAddPreview, 'greeting');
    const activeGreetingReorderPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'greeting',
      mode: 'preview',
      operation: { action: 'reorder_items', greeting_type: 'alternate', order: [1, 0] },
    });
    assert.deepEqual(routedTools(activeGreetingReorderPreview), ['read_surface', 'patch_surface']);
    await applyManagePreview(runtime, activeTarget, activeGreetingReorderPreview, 'greeting');

    const externalLorebookAddPreview = await callJson(runtime, 'manage_items', {
      target: externalCharxTarget,
      family: 'lorebook',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ comment: 'External Managed Lore', key: 'external-managed', content: 'External lorebook add.' }],
      },
    });
    assert.deepEqual(routedTools(externalLorebookAddPreview), ['external_read_surface', 'external_patch_surface']);
    await applyManagePreview(runtime, externalCharxTarget, externalLorebookAddPreview, 'lorebook');
    assert.equal(openCharx(fixture.externalCharx).lorebook?.length, 2);

    const externalRegexAddPreview = await callJson(runtime, 'manage_items', {
      target: externalCharxTarget,
      family: 'regex',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ comment: 'External Managed Regex', find: 'External', replace: 'Managed' }],
      },
    });
    assert.deepEqual(routedTools(externalRegexAddPreview), ['external_read_surface', 'external_patch_surface']);
    await applyManagePreview(runtime, externalCharxTarget, externalRegexAddPreview, 'regex');
    assert.equal(openCharx(fixture.externalCharx).regex?.length, 2);

    const externalGreetingAddPreview = await callJson(runtime, 'manage_items', {
      target: externalCharxTarget,
      family: 'greeting',
      mode: 'preview',
      operation: {
        action: 'add_items',
        greeting_type: 'alternate',
        items: [{ content: 'External managed alternate greeting.' }],
      },
    });
    assert.deepEqual(routedTools(externalGreetingAddPreview), ['external_read_surface', 'external_patch_surface']);
    await applyManagePreview(runtime, externalCharxTarget, externalGreetingAddPreview, 'greeting');
    const externalGreetingReorderPreview = await callJson(runtime, 'manage_items', {
      target: externalCharxTarget,
      family: 'greeting',
      mode: 'preview',
      operation: { action: 'reorder_items', greeting_type: 'alternate', order: [1, 0] },
    });
    assert.deepEqual(routedTools(externalGreetingReorderPreview), ['external_read_surface', 'external_patch_surface']);
    await applyManagePreview(runtime, externalCharxTarget, externalGreetingReorderPreview, 'greeting');
    assert.equal(openCharx(fixture.externalCharx).alternateGreetings?.[0], 'External managed alternate greeting.');

    const activeTriggerAddPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'trigger',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ comment: 'Managed Trigger', type: 'start', conditions: [], effect: [], lowLevelAccess: false }],
      },
    });
    assert.deepEqual(routedTools(activeTriggerAddPreview), ['read_surface', 'write_field']);
    const activeTriggerApply = await applyManagePreview(runtime, activeTarget, activeTriggerAddPreview, 'trigger');
    assert.equal(nestedRecord(activeTriggerApply.result, 'active trigger apply result').after_count, 2);
    const activeTriggerReorderPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'trigger',
      mode: 'preview',
      operation: { action: 'reorder_items', order: [1, 0] },
    });
    assert.deepEqual(routedTools(activeTriggerReorderPreview), ['read_surface', 'write_field']);
    await applyManagePreview(runtime, activeTarget, activeTriggerReorderPreview, 'trigger');

    const activeLuaAddPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'lua',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ name: 'managed_lua', content: 'print("managed lua")' }],
      },
    });
    assert.deepEqual(routedTools(activeLuaAddPreview), ['read_field', 'write_field']);
    const activeLuaApply = await applyManagePreview(runtime, activeTarget, activeLuaAddPreview, 'lua');
    assert.equal(nestedRecord(activeLuaApply.result, 'active lua apply result').after_count, 4);

    const activeCssAddPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'css',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ name: 'managed_css', content: '.managed-css { color: green; }' }],
      },
    });
    assert.deepEqual(routedTools(activeCssAddPreview), ['read_field', 'write_field']);
    await applyManagePreview(runtime, activeTarget, activeCssAddPreview, 'css');
    const activeCssReorderPreview = await callJson(runtime, 'manage_items', {
      target: activeTarget,
      family: 'css',
      mode: 'preview',
      operation: { action: 'reorder_items', order: [1, 0, 2] },
    });
    assert.deepEqual(routedTools(activeCssReorderPreview), ['read_field', 'write_field']);
    await applyManagePreview(runtime, activeTarget, activeCssReorderPreview, 'css');

    const externalTriggerAddPreview = await callJson(runtime, 'manage_items', {
      target: externalCharxTarget,
      family: 'trigger',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [
          { comment: 'External Managed Trigger', type: 'start', conditions: [], effect: [], lowLevelAccess: false },
        ],
      },
    });
    assert.deepEqual(routedTools(externalTriggerAddPreview), ['external_read_surface', 'external_patch_surface']);
    await applyManagePreview(runtime, externalCharxTarget, externalTriggerAddPreview, 'trigger');
    assert.equal(openCharx(fixture.externalCharx).triggerScripts?.length, 2);

    const externalLuaAddPreview = await callJson(runtime, 'manage_items', {
      target: externalCharxTarget,
      family: 'lua',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ name: 'external_managed_lua', content: 'print("external managed lua")' }],
      },
    });
    assert.deepEqual(routedTools(externalLuaAddPreview), ['external_read_surface', 'external_patch_surface']);
    await applyManagePreview(runtime, externalCharxTarget, externalLuaAddPreview, 'lua');
    assert.match(String(openCharx(fixture.externalCharx).lua ?? ''), /external_managed_lua/);

    const externalCssAddPreview = await callJson(runtime, 'manage_items', {
      target: externalCharxTarget,
      family: 'css',
      mode: 'preview',
      operation: {
        action: 'add_items',
        items: [{ name: 'external_managed_css', content: '.external-managed-css { color: green; }' }],
      },
    });
    assert.deepEqual(routedTools(externalCssAddPreview), ['external_read_surface', 'external_patch_surface']);
    await applyManagePreview(runtime, externalCharxTarget, externalCssAddPreview, 'css');
    assert.match(String(openCharx(fixture.externalCharx).css ?? ''), /external_managed_css/);

    await runtime.close();
    runtime = await startStandaloneClient({
      file: fixture.activeRisum,
      userDataDir: path.join(fixture.dir, 'active-risum-user-data'),
      allowWrites: true,
    });
    const activeRisumAssetPreview = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'risum',
      mode: 'preview',
      operation: {
        action: 'add_asset',
        name: 'active_module_asset',
        path: 'active_module_asset.png',
        base64: Buffer.from('active-risum-asset').toString('base64'),
      },
    });
    assert.ok(routedTools(activeRisumAssetPreview).includes('add_risum_asset'));
    await applyManageAssetsPreview(runtime, activeTarget, activeRisumAssetPreview, 'risum');
    const activeRisumRenamePreview = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'risum',
      mode: 'preview',
      operation: {
        action: 'rename_asset',
        selector: { index: 0 },
        newName: 'active_module_asset_renamed.png',
      },
    });
    assert.ok(routedTools(activeRisumRenamePreview).includes('patch_surface'));
    await applyManageAssetsPreview(runtime, activeTarget, activeRisumRenamePreview, 'risum');
    const activeRisumAssetList = await callJson(runtime, 'manage_assets', {
      target: activeTarget,
      asset_family: 'risum',
      mode: 'read',
      operation: { action: 'list_assets' },
    });
    const activeRisumAssets = nestedArray(
      nestedRecord(activeRisumAssetList.result, 'active risum asset list').assets,
      'active risum assets',
    );
    assert.equal(nestedRecord(activeRisumAssets[0], 'active risum renamed asset').name, 'active_module_asset_renamed');
  } finally {
    if (runtime) await runtime.close();
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  }
}
