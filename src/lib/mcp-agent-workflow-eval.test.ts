// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { openCharx, openRisum, openRisup } from '../charx-io';

const ROOT = path.resolve(__dirname, '../..');

const REQUIRED_SURFACES_BY_FAMILY = {
  charx: [
    'character metadata',
    'description',
    'first messages',
    'alternate greetings',
    'group greetings',
    'lorebooks',
    'regex scripts',
    'triggers',
    'Lua',
    'CSS',
    'assets',
  ],
  risup: ['promptTemplate items', 'formatingOrder', 'toggles', 'prompt snippets', 'import/export', 'prompt diffs'],
  risum: [
    'module metadata',
    'lowLevelAccess behavior',
    'backgroundEmbedding',
    'customModuleToggle',
    'assets',
    'module-specific surfaces',
  ],
  'plugin-v3': [
    'metadata header',
    'permissions',
    'iframe/API usage',
    'async API usage',
    'storage tiers',
    'UI registration',
    'providers',
    'MCP integration',
    'security boundaries',
  ],
} as const;

type ArtifactFamily = keyof typeof REQUIRED_SURFACES_BY_FAMILY;
type EvalSurface = {
  [Family in ArtifactFamily]: (typeof REQUIRED_SURFACES_BY_FAMILY)[Family][number];
}[ArtifactFamily];

type EditRisk = 'read-only' | 'guarded-edit' | 'destructive-edit';
type PreviewPolicy = 'required' | 'not-needed' | 'not-supported';
type ToolProfile = 'facade-first' | 'authoring' | 'advanced-full' | 'filesystem-plugin';

interface WorkflowRoute {
  profile: ToolProfile;
  discover: readonly string[];
  readOrSearch: readonly string[];
  preview: readonly string[];
  apply: readonly string[];
  validate: readonly string[];
  granularFallbackReason?: string;
}

interface WorkflowSafety {
  boundedOrItemizedRead: boolean;
  batchWhenSiblingItems: boolean;
  staleGuards: readonly string[];
  previewPolicy: PreviewPolicy;
  wrongTargetAvoidance: readonly string[];
  postEditValidation: readonly string[];
}

interface WorkflowMetrics {
  routeCorrect: boolean;
  expectedFirstPassSuccess: boolean;
  wrongTargetIncidents: 0;
  validationCovered: boolean;
  boundedReadCovered: boolean;
  docsSynced: boolean;
}

interface WorkflowEvalTask {
  id: string;
  prompt: string;
  family: ArtifactFamily;
  corpusRoots: readonly string[];
  sourceOfTruth: readonly string[];
  surfaces: readonly EvalSurface[];
  editRisk: EditRisk;
  route: WorkflowRoute;
  safety: WorkflowSafety;
  metrics: WorkflowMetrics;
}

const LOCAL_CORPUS_ROOTS = {
  charx: ['risu/bot'],
  risup: ['risu/prompts', 'risu/plugins'],
  risum: ['risu/modules', 'risu/bot'],
  'plugin-v3': ['risu/plugins'],
} as const satisfies Record<ArtifactFamily, readonly string[]>;

const UPSTREAM_RISUAI_SOURCE = 'https://github.com/kwaroran/Risuai';
const UPSTREAM_PLUGIN_DOCS = [
  'https://github.com/kwaroran/Risuai/blob/main/plugins.md',
  'https://github.com/kwaroran/Risuai/blob/main/src/ts/plugins/apiV3/risuai.d.ts',
] as const;

const WORKFLOW_EVAL_TASKS = [
  {
    id: 'charx-metadata-description-read',
    prompt: 'Inspect a character card and read only its metadata plus description.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['character metadata', 'description'],
    editRisk: 'read-only',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: [],
      apply: [],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'not-needed',
      wrongTargetAvoidance: ['target.kind must be active, external, or reference before reading'],
      postEditValidation: ['focused read_content re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-first-message-field-edit',
    prompt: 'Patch one first message phrase in a character card.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['first messages'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['search_document', 'read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['apply_edit target and operation_digest must match preview_edit'],
      postEditValidation: ['read_content on firstMessage selector'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'external-charx-surface-patch-facade-parity',
    prompt:
      'Patch an unopened character card root surface through preview_edit/apply_edit without calling external_patch_surface directly.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['character metadata'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit:patch_surface'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_hash'],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'target.kind must stay external; use preview_edit patch_surface instead of calling external_patch_surface directly',
      ],
      postEditValidation: ['focused read_content surface/field readback on the external file'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'external-charx-structured-item-facade-parity',
    prompt:
      'Edit unopened character-card lorebook, regex, and alternate greeting items through read_content plus preview_edit/apply_edit without opening the file or calling external surface tools directly.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['lorebooks', 'regex scripts', 'alternate greetings'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content', 'validate_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_comment', 'expected_preview', 'expected_hash'],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'target.kind must stay external; use facade selectors for lorebook/regex/greeting instead of opening the file or calling external_patch_surface directly',
      ],
      postEditValidation: [
        'focused read_content re-read of changed external lorebook/regex/greeting selectors',
        'validate_content when the external file type supports the requested validation',
      ],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-greeting-identity-facade-write',
    prompt: 'Rewrite one alternate greeting through a preview-token flow with hash/preview identity protection.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['alternate greetings', 'group greetings'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['identity.hash', 'expected_preview'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['greeting_type must be explicit and selector.identity must uniquely match'],
      postEditValidation: ['focused read_content re-read of changed greeting identity'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-greeting-identity-facade-delete',
    prompt: 'Delete one alternate greeting through a preview-token flow with hash/preview identity protection.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['alternate greetings', 'group greetings'],
    editRisk: 'destructive-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['identity.hash', 'expected_preview'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['greeting_type must be explicit and selector.identity must uniquely match'],
      postEditValidation: ['focused read_content list re-read after identity deletion'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-greeting-batch-edit',
    prompt: 'Update matching alternate and group greetings without dumping greeting arrays.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['alternate greetings', 'group greetings'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_preview'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['greeting_type must be explicit and selector.indices must align to writes[]'],
      postEditValidation: ['focused read_content batch re-read of changed greeting indices'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-lorebook-id-facade-replace',
    prompt: 'Replace a lorebook phrase through a facade id selector with stale-comment fallback.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['lorebooks'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['validate_content', 'read_content', 'diff_lorebook'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['id', 'expected_comment'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['selector.family must be lorebook and selector.id must resolve without idConflict'],
      postEditValidation: [
        'validate_content lorebook keys',
        'focused read_content by lorebook id',
        'diff_lorebook when reference exists',
      ],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-regex-identity-facade-write',
    prompt: 'Rewrite one regex script entry through a preview-token flow with comment/hash identity protection.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['regex scripts'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['identity.comment', 'identity.hash', 'expected_comment'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['selector.family must be regex and selector.identity must uniquely match'],
      postEditValidation: ['focused read_content re-read of changed regex identity'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-regex-identity-facade-delete',
    prompt: 'Delete one regex script entry through a preview-token flow with comment/hash identity protection.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['regex scripts'],
    editRisk: 'destructive-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['identity.comment', 'identity.hash', 'expected_comment'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['selector.family must be regex and selector.identity must uniquely match'],
      postEditValidation: ['focused read_content list re-read after identity deletion'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-regex-batch-edit',
    prompt: 'Edit two regex scripts by comment/index guards without broad regex dumps.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['regex scripts'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['validate_content', 'read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_comment'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['selector.indices must align to entries[] and expected_comment guards'],
      postEditValidation: ['validate_content regex sanity check', 'focused read_content batch re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-regex-duplicate-identity-fallback',
    prompt: 'Handle a regex edit request where several entries share the same comment and identity is ambiguous.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['regex scripts'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document', 'list_regex'],
      readOrSearch: ['read_regex_batch'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['validate_content', 'read_content'],
      granularFallbackReason:
        'Duplicate regex identity must reject mutation and fall back to index plus expected_comment after refresh.',
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['identity.comment', 'expected_comment'],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'identity collisions must not mutate; refresh list and select index with expected_comment',
      ],
      postEditValidation: ['validate_content regex sanity check', 'focused read_content re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-trigger-lua-edit',
    prompt: 'Patch a trigger script and the primary Lua section through facade preview/apply selectors.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['triggers', 'Lua'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_comment', 'expected_hash', 'expected_preview'],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'use trigger/lua facade selectors instead of raw triggerScripts/lua field writes or direct granular section mutation when covered',
      ],
      postEditValidation: ['focused read_content trigger/lua re-read plus stale 409 retry if hash/comment changed'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-css-section-edit',
    prompt: 'Patch a CSS section through facade preview/apply without dumping the full background field.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['CSS'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_hash', 'expected_preview'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['do not use read_field("css") or write_field("css") when facade css selectors cover it'],
      postEditValidation: ['focused read_content CSS section re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-asset-destructive-flow',
    prompt:
      'Add, rename, or delete an embedded card asset through the asset-management facade after identity inspection.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['assets'],
    editRisk: 'destructive-edit',
    route: {
      profile: 'facade-first',
      discover: ['list_tool_profiles', 'inspect_document'],
      readOrSearch: ['manage_assets:list_assets', 'manage_assets:read_asset'],
      preview: ['manage_assets:add_asset', 'manage_assets:rename_asset', 'manage_assets:delete_asset'],
      apply: ['manage_assets:apply'],
      validate: ['validate_content', 'manage_assets:list_assets'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_asset_collection_digest', 'expected_path', 'expected_hash'],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'asset_family should resolve to charx; use manage_assets instead of raw asset routes when covered',
      ],
      postEditValidation: ['validate_content export compatibility', 'asset list re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risup-prompt-template-id-facade-write',
    prompt: 'Rewrite one supported promptTemplate item through a facade id selector with type/preview guards.',
    family: 'risup',
    corpusRoots: LOCAL_CORPUS_ROOTS.risup,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['promptTemplate items'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['validate_content', 'read_content', 'read_risup_formating_order'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['id', 'expected_type', 'expected_preview'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['selector.family must be risup-prompt and selector.id must be present'],
      postEditValidation: ['validate_content risup prompt/order check', 'focused read_content by prompt id'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risup-prompt-template-id-facade-delete',
    prompt: 'Delete one promptTemplate item through a facade id selector with type/preview guards.',
    family: 'risup',
    corpusRoots: LOCAL_CORPUS_ROOTS.risup,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['promptTemplate items'],
    editRisk: 'destructive-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['validate_content', 'read_content', 'read_risup_formating_order'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['id', 'expected_type', 'expected_preview'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['selector.family must be risup-prompt and selector.id must be present'],
      postEditValidation: [
        'validate_content risup prompt/order check',
        'focused read_content list re-read after id deletion',
      ],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risup-prompt-template-batch-edit',
    prompt: 'Batch-edit several promptTemplate items while preserving item identity.',
    family: 'risup',
    corpusRoots: LOCAL_CORPUS_ROOTS.risup,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['promptTemplate items'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content', 'search_document'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['validate_content', 'read_risup_prompt_item_batch', 'read_risup_formating_order'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['ids', 'expected_type', 'expected_preview'],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['align selector.ids with writes[] and expected_type/expected_preview guards'],
      postEditValidation: ['validate_content risup prompt/order check', 'focused read_content batch id re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'external-risup-prompt-facade-parity',
    prompt:
      'Edit an unopened .risup promptTemplate item from an absolute file path without falling back to external_replace_in_field.',
    family: 'risup',
    corpusRoots: LOCAL_CORPUS_ROOTS.risup,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['promptTemplate items'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content', 'search_document'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['validate_content', 'read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['id', 'expected_type', 'expected_preview'],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'target.kind must be external and selector.family must be risup-prompt; do not use external_replace_in_field for covered prompt items',
      ],
      postEditValidation: [
        'validate_content external risup prompt check',
        'focused read_content by prompt id or index',
      ],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'external-risup-manage-items',
    prompt: 'Add and reorder promptTemplate items in an unopened .risup file through the item-management facade.',
    family: 'risup',
    corpusRoots: LOCAL_CORPUS_ROOTS.risup,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['promptTemplate items', 'prompt snippets', 'import/export'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['list_tool_profiles', 'inspect_document'],
      readOrSearch: ['manage_items:copy_as_text', 'manage_items:list_snippets'],
      preview: ['manage_items:add_items', 'manage_items:reorder_items', 'manage_items:import_text'],
      apply: ['manage_items:apply'],
      validate: ['validate_content', 'read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_prompt_items_digest', 'expected_snippet_updated_at'],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'target.kind must stay external; do not open_file or use external_replace_in_field for supported item management',
      ],
      postEditValidation: ['validate_content external risup prompt check', 'read_content focused id/index readback'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-structured-manage-items',
    prompt: 'Add and reorder lorebook, regex, and alternate greeting items through the item-management facade.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['lorebooks', 'regex scripts', 'alternate greetings'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['list_tool_profiles', 'inspect_document'],
      readOrSearch: ['read_content'],
      preview: [
        'manage_items:lorebook:add_items',
        'manage_items:lorebook:reorder_items',
        'manage_items:regex:add_items',
        'manage_items:greeting:add_items',
      ],
      apply: ['manage_items:apply'],
      validate: ['read_content', 'validate_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_item_collection_digest', 'expected_hash'],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'target.kind may be active or external; use manage_items instead of granular add/reorder routes when covered',
        'operation.greeting_type must be alternate; groupOnlyGreetings remains protected',
      ],
      postEditValidation: ['focused read_content of the touched family after apply'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'charx-script-style-manage-items',
    prompt: 'Add and reorder trigger, Lua, and CSS items through the item-management facade.',
    family: 'charx',
    corpusRoots: LOCAL_CORPUS_ROOTS.charx,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['triggers', 'Lua', 'CSS'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['list_tool_profiles', 'inspect_document'],
      readOrSearch: ['read_content'],
      preview: [
        'manage_items:trigger:add_items',
        'manage_items:trigger:reorder_items',
        'manage_items:lua:add_items',
        'manage_items:css:add_items',
        'manage_items:css:reorder_items',
      ],
      apply: ['manage_items:apply'],
      validate: ['read_content', 'validate_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_item_collection_digest', 'expected_hash'],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'target.kind may be active or external; use manage_items instead of granular add/reorder routes when covered',
        'active trigger/Lua/CSS apply must preserve the editor sync path rather than raw surface mutation',
      ],
      postEditValidation: ['focused read_content of trigger/Lua/CSS after apply'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risup-sibling-prompt-batch-read',
    prompt:
      'Inspect multiple sibling promptTemplate items; use one batch selector instead of repeated single-item reads.',
    family: 'risup',
    corpusRoots: LOCAL_CORPUS_ROOTS.risup,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['promptTemplate items'],
    editRisk: 'read-only',
    route: {
      profile: 'facade-first',
      discover: ['list_tool_profiles', 'inspect_document'],
      readOrSearch: ['read_content'],
      preview: [],
      apply: [],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'not-needed',
      wrongTargetAvoidance: ['selector.ids or selector.indices must preserve the requested sibling order'],
      postEditValidation: ['read_content batch selector returns every requested prompt item'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risup-formating-order-edit',
    prompt: 'Adjust formatingOrder and verify dangling or duplicate token warnings.',
    family: 'risup',
    corpusRoots: LOCAL_CORPUS_ROOTS.risup,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['formatingOrder'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'authoring',
      discover: ['inspect_document'],
      readOrSearch: ['read_risup_formating_order'],
      preview: [],
      apply: ['write_risup_formating_order'],
      validate: ['validate_content', 'read_risup_formating_order'],
      granularFallbackReason: 'formatingOrder has a purpose-built validator/warning route.',
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'not-supported',
      wrongTargetAvoidance: ['do not write raw promptTemplate/formatingOrder JSON through generic field routes'],
      postEditValidation: ['validate_content formatingOrder check', 'read_risup_formating_order warnings array'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risup-toggle-field-edit',
    prompt: 'Patch a customPromptTemplateToggle block as bounded field content.',
    family: 'risup',
    corpusRoots: LOCAL_CORPUS_ROOTS.risup,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['toggles'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content', 'search_document'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['target.kind must be active or external, never reference'],
      postEditValidation: ['bounded field re-read of customPromptTemplateToggle'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risup-snippet-insert',
    prompt: 'Save and insert a reusable risup prompt snippet with dry-run first.',
    family: 'risup',
    corpusRoots: LOCAL_CORPUS_ROOTS.risup,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['prompt snippets'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['list_tool_profiles', 'inspect_document'],
      readOrSearch: ['manage_items:list_snippets', 'manage_items:copy_as_text', 'manage_items:read_snippet'],
      preview: ['manage_items:save_snippet', 'manage_items:insert_snippet'],
      apply: ['manage_items:apply'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['insertAt must be explicit when inserting before the end'],
      postEditValidation: ['batch re-read inserted prompt indices'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risup-import-export-diff',
    prompt: 'Export a preset prompt, import a changed block, then verify against a reference diff.',
    family: 'risup',
    corpusRoots: LOCAL_CORPUS_ROOTS.risup,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['import/export', 'prompt diffs'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['list_tool_profiles', 'inspect_document', 'list_references'],
      readOrSearch: ['manage_items:copy_as_text', 'diff_risup_prompt'],
      preview: ['manage_items:import_text'],
      apply: ['manage_items:apply'],
      validate: ['validate_risup_prompt_import', 'diff_risup_prompt'],
      granularFallbackReason:
        'Use granular export/diff only when exact whole-template text or reference diff payloads are required.',
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['validate with the exact source text used for import'],
      postEditValidation: ['validate_risup_prompt_import', 'diff_risup_prompt'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risum-metadata-read',
    prompt: 'Inspect module metadata before touching module-specific fields.',
    family: 'risum',
    corpusRoots: LOCAL_CORPUS_ROOTS.risum,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['module metadata'],
    editRisk: 'read-only',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: [],
      apply: [],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'not-needed',
      wrongTargetAvoidance: ['inspect_document must classify _fileType as risum'],
      postEditValidation: ['focused metadata re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risum-low-level-access-review',
    prompt: 'Audit and change lowLevelAccess only after explicit module inspection.',
    family: 'risum',
    corpusRoots: LOCAL_CORPUS_ROOTS.risum,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['lowLevelAccess behavior'],
    editRisk: 'destructive-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['target file family must be risum; do not apply charx preview tokens'],
      postEditValidation: ['focused lowLevelAccess re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risum-background-embedding-edit',
    prompt: 'Patch backgroundEmbedding with a bounded read and preview-token apply.',
    family: 'risum',
    corpusRoots: LOCAL_CORPUS_ROOTS.risum,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['backgroundEmbedding'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['search_document', 'read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['read only a bounded backgroundEmbedding slice before replacing text'],
      postEditValidation: ['bounded backgroundEmbedding re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risum-custom-module-toggle-edit',
    prompt: 'Patch a customModuleToggle declaration without raw module rewrites.',
    family: 'risum',
    corpusRoots: LOCAL_CORPUS_ROOTS.risum,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['customModuleToggle'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content'],
      preview: ['preview_edit'],
      apply: ['apply_edit'],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['do not patch unrelated module fields under the same surface'],
      postEditValidation: ['focused customModuleToggle re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risum-asset-destructive-flow',
    prompt: 'Add or delete a module asset through the asset-management facade with collection guards.',
    family: 'risum',
    corpusRoots: LOCAL_CORPUS_ROOTS.risum,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['assets'],
    editRisk: 'destructive-edit',
    route: {
      profile: 'facade-first',
      discover: ['list_tool_profiles', 'inspect_document'],
      readOrSearch: ['manage_assets:list_assets', 'manage_assets:read_asset'],
      preview: ['manage_assets:add_asset', 'manage_assets:delete_asset'],
      apply: ['manage_assets:apply'],
      validate: ['manage_assets:list_assets'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: ['expected_asset_collection_digest', 'expected_path', 'expected_hash'],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'asset_family should resolve to risum; use manage_assets instead of raw module asset routes when covered',
      ],
      postEditValidation: ['module asset list re-read'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'risum-module-specific-surface-read',
    prompt: 'Read cjs, namespace, and MCP URL as module-specific surfaces before deciding an edit.',
    family: 'risum',
    corpusRoots: LOCAL_CORPUS_ROOTS.risum,
    sourceOfTruth: [UPSTREAM_RISUAI_SOURCE],
    surfaces: ['module-specific surfaces'],
    editRisk: 'read-only',
    route: {
      profile: 'facade-first',
      discover: ['inspect_document'],
      readOrSearch: ['read_content', 'search_document'],
      preview: [],
      apply: [],
      validate: ['read_content'],
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'not-needed',
      wrongTargetAvoidance: ['module-specific selectors must stay on the risum target'],
      postEditValidation: ['focused re-read before mutation planning'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'plugin-v3-metadata-header-audit',
    prompt: 'Audit a RisuAI plugin v3 file for stable metadata headers.',
    family: 'plugin-v3',
    corpusRoots: LOCAL_CORPUS_ROOTS['plugin-v3'],
    sourceOfTruth: UPSTREAM_PLUGIN_DOCS,
    surfaces: ['metadata header'],
    editRisk: 'read-only',
    route: {
      profile: 'filesystem-plugin',
      discover: ['load_guidance'],
      readOrSearch: ['rg', 'bounded_file_read'],
      preview: [],
      apply: [],
      validate: ['static metadata scan'],
      granularFallbackReason: 'Plugin .js/.ts files are not .charx/.risum/.risup MCP artifact targets.',
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'not-needed',
      wrongTargetAvoidance: ['do not route plugin source through artifact field tools'],
      postEditValidation: ['confirm //@name and //@api 3.0 remain at the top'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'plugin-v3-async-safeelement-permissions',
    prompt: 'Review host DOM access for awaited SafeElement calls and permission checks.',
    family: 'plugin-v3',
    corpusRoots: LOCAL_CORPUS_ROOTS['plugin-v3'],
    sourceOfTruth: UPSTREAM_PLUGIN_DOCS,
    surfaces: ['permissions', 'iframe/API usage', 'async API usage'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'filesystem-plugin',
      discover: ['load_guidance'],
      readOrSearch: ['rg', 'bounded_file_read'],
      preview: ['git diff --check'],
      apply: ['apply_patch'],
      validate: ['eslint/static await scan'],
      granularFallbackReason: 'Plugin code is edited as source text after plugin-v3 guidance is loaded.',
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'required',
      wrongTargetAvoidance: [
        'limit edits to the named plugin file and keep iframe document separate from root document',
      ],
      postEditValidation: ['awaited risuai/SafeElement scan', 'permission-gated getRootDocument scan'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'plugin-v3-storage-ui-lifecycle',
    prompt: 'Change plugin storage-backed settings UI while keeping cleanup hooks.',
    family: 'plugin-v3',
    corpusRoots: LOCAL_CORPUS_ROOTS['plugin-v3'],
    sourceOfTruth: UPSTREAM_PLUGIN_DOCS,
    surfaces: ['storage tiers', 'UI registration'],
    editRisk: 'guarded-edit',
    route: {
      profile: 'filesystem-plugin',
      discover: ['load_guidance'],
      readOrSearch: ['rg', 'bounded_file_read'],
      preview: ['git diff --check'],
      apply: ['apply_patch'],
      validate: ['storage tier scan', 'onUnload/registerSetting/registerButton scan'],
      granularFallbackReason: 'Plugin source uses normal code-edit validation, not artifact MCP mutation routes.',
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['do not conflate pluginStorage with raw localStorage or app database fields'],
      postEditValidation: ['pluginStorage/safeLocalStorage scan', 'UI registration cleanup scan'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
  {
    id: 'plugin-v3-provider-mcp-security',
    prompt: 'Review plugin provider and MCP registration paths against v3 security boundaries.',
    family: 'plugin-v3',
    corpusRoots: LOCAL_CORPUS_ROOTS['plugin-v3'],
    sourceOfTruth: UPSTREAM_PLUGIN_DOCS,
    surfaces: ['providers', 'MCP integration', 'security boundaries'],
    editRisk: 'destructive-edit',
    route: {
      profile: 'filesystem-plugin',
      discover: ['load_guidance'],
      readOrSearch: ['rg', 'bounded_file_read'],
      preview: ['git diff --check'],
      apply: ['apply_patch'],
      validate: ['registerMCP identifier scan', 'addProvider permission scan', 'eval/new Function scan'],
      granularFallbackReason: 'Provider/MCP plugin code is outside RisuToki artifact MCP selectors.',
    },
    safety: {
      boundedOrItemizedRead: true,
      batchWhenSiblingItems: true,
      staleGuards: [],
      previewPolicy: 'required',
      wrongTargetAvoidance: ['keep MCP identifiers plugin-prefixed and do not loosen sandbox boundaries'],
      postEditValidation: ['registerMCP/addProvider scan', 'forbidden eval/new Function scan'],
    },
    metrics: {
      routeCorrect: true,
      expectedFirstPassSuccess: true,
      wrongTargetIncidents: 0,
      validationCovered: true,
      boundedReadCovered: true,
      docsSynced: true,
    },
  },
] as const satisfies readonly WorkflowEvalTask[];

const TARGET_METRICS = {
  routeAccuracy: 0.95,
  firstPassSuccess: 0.85,
  wrongTargetIncidents: 0,
  validationCoverage: 0.95,
  boundedReadCoverage: 0.9,
  docsSync: 1,
} as const;

function ratio(count: number, total: number): number {
  return total === 0 ? 1 : count / total;
}

function summarizeMetrics(tasks: readonly WorkflowEvalTask[]) {
  return {
    routeAccuracy: ratio(tasks.filter((task) => task.metrics.routeCorrect).length, tasks.length),
    firstPassSuccess: ratio(tasks.filter((task) => task.metrics.expectedFirstPassSuccess).length, tasks.length),
    wrongTargetIncidents: tasks.reduce((sum, task) => sum + task.metrics.wrongTargetIncidents, 0),
    validationCoverage: ratio(
      tasks.filter((task) => task.metrics.validationCovered && task.safety.postEditValidation.length > 0).length,
      tasks.length,
    ),
    boundedReadCoverage: ratio(
      tasks.filter((task) => task.metrics.boundedReadCovered && task.safety.boundedOrItemizedRead).length,
      tasks.length,
    ),
    docsSync: ratio(tasks.filter((task) => task.metrics.docsSynced).length, tasks.length),
  };
}

function collectFiles(rootRelative: string, extensions: readonly string[], limit = 80): string[] {
  const root = path.join(ROOT, rootRelative);
  const files: string[] = [];
  if (!fs.existsSync(root)) return files;

  function walk(dir: string): void {
    if (files.length >= limit) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= limit) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  walk(root);
  return files.sort();
}

function tryOpen(filePath: string, opener: (path: string) => unknown): unknown | null {
  try {
    return opener(filePath);
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasOwn(value: unknown, key: string): boolean {
  return !!value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key);
}

describe('agent eval: real artifact workflow routing matrix', () => {
  it('covers every explicit artifact family and surface requirement', () => {
    const missing: string[] = [];
    const requiredEntries = Object.entries(REQUIRED_SURFACES_BY_FAMILY) as Array<
      [ArtifactFamily, readonly EvalSurface[]]
    >;
    const tasks = WORKFLOW_EVAL_TASKS as readonly WorkflowEvalTask[];

    for (const [family, surfaces] of requiredEntries) {
      const familyTasks = tasks.filter((task) => task.family === family);
      expect(familyTasks.length, `${family} should have representative tasks`).toBeGreaterThan(0);

      for (const surface of surfaces) {
        if (!familyTasks.some((task) => (task.surfaces as readonly EvalSurface[]).includes(surface))) {
          missing.push(`${family}: ${surface}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('keeps each task routed, bounded, guarded where needed, and validated', () => {
    const issues: string[] = [];

    for (const task of WORKFLOW_EVAL_TASKS as readonly WorkflowEvalTask[]) {
      if (task.corpusRoots.length === 0) issues.push(`${task.id}: missing corpus root`);
      if (!task.sourceOfTruth.some((source) => source.startsWith(UPSTREAM_RISUAI_SOURCE))) {
        issues.push(`${task.id}: missing upstream RisuAI source-of-truth link`);
      }
      if (task.route.discover.length === 0) issues.push(`${task.id}: missing discover step`);
      if (task.route.readOrSearch.length === 0) issues.push(`${task.id}: missing read/search step`);
      if (!task.safety.boundedOrItemizedRead) issues.push(`${task.id}: broad read allowed`);
      if (!task.safety.batchWhenSiblingItems) issues.push(`${task.id}: missing batch preference`);
      if (task.editRisk !== 'read-only' && task.route.apply.length === 0) issues.push(`${task.id}: missing apply step`);
      if (
        task.editRisk !== 'read-only' &&
        task.safety.previewPolicy === 'required' &&
        task.route.preview.length === 0
      ) {
        issues.push(`${task.id}: missing required preview/dry-run`);
      }
      if (task.editRisk !== 'read-only' && task.safety.postEditValidation.length === 0) {
        issues.push(`${task.id}: missing post-edit validation`);
      }
      if (task.safety.wrongTargetAvoidance.length === 0) issues.push(`${task.id}: missing wrong-target rule`);
      if (task.route.profile !== 'facade-first' && !task.route.granularFallbackReason) {
        issues.push(`${task.id}: non-facade route lacks fallback reason`);
      }
    }

    expect(issues).toEqual([]);
  });

  it('meets or exceeds the target workflow metrics', () => {
    const metrics = summarizeMetrics(WORKFLOW_EVAL_TASKS);

    expect(metrics.routeAccuracy).toBeGreaterThanOrEqual(TARGET_METRICS.routeAccuracy);
    expect(metrics.firstPassSuccess).toBeGreaterThanOrEqual(TARGET_METRICS.firstPassSuccess);
    expect(metrics.wrongTargetIncidents).toBe(TARGET_METRICS.wrongTargetIncidents);
    expect(metrics.validationCoverage).toBeGreaterThanOrEqual(TARGET_METRICS.validationCoverage);
    expect(metrics.boundedReadCoverage).toBeGreaterThanOrEqual(TARGET_METRICS.boundedReadCoverage);
    expect(metrics.docsSync).toBe(TARGET_METRICS.docsSync);
  });

  it('keeps workflow eval references synchronized across docs, skills, and AGENTS routing', () => {
    const requiredRefs = [
      ['AGENTS.md', 'mcp-agent-workflow-eval.test.ts'],
      ['docs/README.md', 'mcp-agent-workflow-eval.test.ts'],
      ['docs/MCP_TOOL_SURFACE.md', 'mcp-agent-workflow-eval.test.ts'],
      ['docs/MCP_WORKFLOW.md', 'real-artifact workflow eval matrix'],
      ['skills/project-workflow/MCP_WORKFLOW.md', 'real-artifact workflow eval matrix'],
      ['skills/using-mcp-tools/SKILL.md', 'mcp-agent-workflow-eval.test.ts'],
      ['README.md', 'mcp-agent-workflow-eval.test.ts'],
    ] as const;

    const missing = requiredRefs.filter(([relativePath, needle]) => {
      const filePath = path.join(ROOT, relativePath);
      return !fs.existsSync(filePath) || !fs.readFileSync(filePath, 'utf-8').includes(needle);
    });

    expect(missing).toEqual([]);
  });

  it('detects representative surfaces in the local ignored risu corpus when those files are present', () => {
    const charxFiles = LOCAL_CORPUS_ROOTS.charx.flatMap((root) => collectFiles(root, ['.charx'], 60));
    const risupFiles = LOCAL_CORPUS_ROOTS.risup.flatMap((root) => collectFiles(root, ['.risup'], 60));
    const risumFiles = LOCAL_CORPUS_ROOTS.risum.flatMap((root) => collectFiles(root, ['.risum'], 60));
    const pluginFiles = LOCAL_CORPUS_ROOTS['plugin-v3'].flatMap((root) => collectFiles(root, ['.js', '.ts'], 20));
    const totalFiles = charxFiles.length + risupFiles.length + risumFiles.length + pluginFiles.length;

    if (totalFiles === 0) {
      expect(totalFiles).toBe(0);
      return;
    }

    const physicalCoverage = new Set<string>();

    for (const filePath of charxFiles) {
      const data = tryOpen(filePath, openCharx);
      if (!data || typeof data !== 'object') continue;
      if (text((data as { name?: unknown }).name)) physicalCoverage.add('charx:character metadata');
      if (text((data as { description?: unknown }).description)) physicalCoverage.add('charx:description');
      if (text((data as { firstMessage?: unknown }).firstMessage)) physicalCoverage.add('charx:first messages');
      if (array((data as { alternateGreetings?: unknown }).alternateGreetings).length > 0) {
        physicalCoverage.add('charx:alternate greetings');
      }
      if (array((data as { groupOnlyGreetings?: unknown }).groupOnlyGreetings).length > 0) {
        physicalCoverage.add('charx:group greetings');
      }
      if (array((data as { lorebook?: unknown }).lorebook).length > 0) physicalCoverage.add('charx:lorebooks');
      if (array((data as { regex?: unknown }).regex).length > 0) physicalCoverage.add('charx:regex scripts');
      if (array((data as { triggerScripts?: unknown }).triggerScripts).length > 0)
        physicalCoverage.add('charx:triggers');
      if (text((data as { lua?: unknown }).lua)) physicalCoverage.add('charx:Lua');
      if (hasOwn(data, 'css')) physicalCoverage.add('charx:CSS');
      if (
        array((data as { assets?: unknown }).assets).length > 0 ||
        array((data as { cardAssets?: unknown }).cardAssets).length > 0 ||
        array((data as { risumAssets?: unknown }).risumAssets).length > 0
      ) {
        physicalCoverage.add('charx:assets');
      }
    }

    for (const filePath of risupFiles) {
      const data = tryOpen(filePath, openRisup);
      if (!data || typeof data !== 'object') continue;
      if (text((data as { promptTemplate?: unknown }).promptTemplate))
        physicalCoverage.add('risup:promptTemplate items');
      if (text((data as { formatingOrder?: unknown }).formatingOrder)) physicalCoverage.add('risup:formatingOrder');
      if (hasOwn(data, 'customPromptTemplateToggle')) physicalCoverage.add('risup:toggles');
    }

    for (const filePath of risumFiles) {
      const data = tryOpen(filePath, openRisum);
      if (!data || typeof data !== 'object') continue;
      if (text((data as { moduleName?: unknown }).moduleName) || text((data as { name?: unknown }).name)) {
        physicalCoverage.add('risum:module metadata');
      }
      if (typeof (data as { lowLevelAccess?: unknown }).lowLevelAccess === 'boolean') {
        physicalCoverage.add('risum:lowLevelAccess behavior');
      }
      if (hasOwn(data, 'backgroundEmbedding')) physicalCoverage.add('risum:backgroundEmbedding');
      if (hasOwn(data, 'customModuleToggle')) physicalCoverage.add('risum:customModuleToggle');
      if (array((data as { risumAssets?: unknown }).risumAssets).length > 0 || hasOwn(data, 'risumAssets')) {
        physicalCoverage.add('risum:assets');
      }
      if (
        hasOwn(data, 'cjs') ||
        hasOwn(data, 'moduleNamespace') ||
        hasOwn(data, 'mcpUrl') ||
        array((data as { lorebook?: unknown }).lorebook).length > 0
      ) {
        physicalCoverage.add('risum:module-specific surfaces');
      }
    }

    const pluginText = pluginFiles.map((filePath) => fs.readFileSync(filePath, 'utf-8')).join('\n');
    if (pluginText) {
      if (/^\/\/@name\s+/m.test(pluginText) && /^\/\/@api\s+3\.0/m.test(pluginText)) {
        physicalCoverage.add('plugin-v3:metadata header');
      }
      if (/requestPluginPermission|requestPermission|mainDom/.test(pluginText)) {
        physicalCoverage.add('plugin-v3:permissions');
      }
      if (/showContainer|hideContainer|document\.body|getRootDocument/.test(pluginText)) {
        physicalCoverage.add('plugin-v3:iframe/API usage');
      }
      if (/await\s+(?:Risuai|risuai|Risu\$1|R)\./.test(pluginText)) {
        physicalCoverage.add('plugin-v3:async API usage');
      }
      if (/pluginStorage|safeLocalStorage|getLocalPluginStorage/.test(pluginText)) {
        physicalCoverage.add('plugin-v3:storage tiers');
      }
      if (/registerSetting|registerButton|onUnload/.test(pluginText)) {
        physicalCoverage.add('plugin-v3:UI registration');
      }
      if (/addProvider/.test(pluginText)) physicalCoverage.add('plugin-v3:providers');
      if (/registerMCP/.test(pluginText)) physicalCoverage.add('plugin-v3:MCP integration');
      if (!/\beval\s*\(|new Function/.test(pluginText)) {
        physicalCoverage.add('plugin-v3:security boundaries');
      }
    }

    const physicalSurfaceRequirements = [
      ...REQUIRED_SURFACES_BY_FAMILY.charx.map((surface) => `charx:${surface}`),
      'risup:promptTemplate items',
      'risup:formatingOrder',
      'risup:toggles',
      ...REQUIRED_SURFACES_BY_FAMILY.risum.map((surface) => `risum:${surface}`),
      ...REQUIRED_SURFACES_BY_FAMILY['plugin-v3'].map((surface) => `plugin-v3:${surface}`),
    ];

    const missing = physicalSurfaceRequirements.filter((surface) => !physicalCoverage.has(surface));
    expect(missing).toEqual([]);
  }, 15000);
});
