// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { openCharx, openRisum, openRisup } from '../charx-io';
import {
  LOCAL_CORPUS_ROOTS,
  REQUIRED_SURFACES_BY_FAMILY,
  UPSTREAM_RISUAI_SOURCE,
  WORKFLOW_EVAL_TASKS,
  type ArtifactFamily,
  type EvalSurface,
  type WorkflowEvalTask,
} from '../../test/workflow-eval-catalog';

const ROOT = path.resolve(__dirname, '../..');

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

  it('classifies all tasks and registers the canonical replay coverage floor', () => {
    const tasks = WORKFLOW_EVAL_TASKS as readonly WorkflowEvalTask[];
    const executionCounts = tasks.reduce(
      (counts, task) => {
        counts[task.execution] += 1;
        return counts;
      },
      { replayable: 0, static: 0, 'app-only': 0 },
    );
    const replayableTasks = tasks.filter((task) => task.execution === 'replayable');
    const replayScenarioIds = tasks.flatMap((task) => task.replayScenarioIds ?? []);

    expect(executionCounts).toEqual({ replayable: 35, static: 4, 'app-only': 0 });
    expect(replayableTasks.every((task) => (task.replayScenarioIds?.length ?? 0) > 0)).toBe(true);
    expect(replayScenarioIds).toHaveLength(replayableTasks.length);
    expect(new Set(replayScenarioIds).size).toBeGreaterThan(5);
    expect(tasks.filter((task) => task.execution === 'static').every((task) => task.family === 'plugin-v3')).toBe(true);
  });

  it('keeps workflow eval references synchronized across canonical docs', () => {
    const requiredRefs = [
      ['docs/README.md', 'mcp-agent-workflow-eval.test.ts'],
      ['docs/MCP_TOOL_SURFACE.md', 'mcp-agent-workflow-eval.test.ts'],
      ['docs/MCP_WORKFLOW.md', 'Deterministic synthetic MCP contract replay'],
      ['skills/project-workflow/MCP_WORKFLOW.md', 'Deterministic synthetic MCP contract replay'],
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
