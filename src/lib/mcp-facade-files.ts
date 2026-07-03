// eslint-disable-next-line @typescript-eslint/no-require-imports
import fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import path = require('path');

import {
  extractDocumentToProject,
  getProjectFileType,
  listProjectTree,
  reassembleProjectDocument,
} from './folder-workspace';
import { planLorebookExport } from './lorebook-io';
import {
  asRecord,
  buildGuard,
  facadeApiError,
  guardValue,
  isApiError,
  recordString,
  route,
  type ApiErrorResult,
  type FacadeRoute,
} from './mcp-facade-runtime';
import type { FacadeV1Guard, FacadeV1Target, ManageFileOperation } from './mcp-request-schemas';

type FacadeApiRequest = (method: string, urlPath: string, body?: Record<string, unknown>) => Promise<unknown>;
type ActiveLorebookReader = () => Promise<
  { entries: Array<Record<string, unknown>>; routes: FacadeRoute[] } | ApiErrorResult
>;

export interface FacadeFilesEngineDeps {
  apiRequest: FacadeApiRequest;
  defaultProjectFolderForDocument: (filePath: string) => string;
  hashStableValue: (value: unknown) => string;
  readActiveLorebookCollection: ActiveLorebookReader;
  summarizeProjectTree: (projectPath: string) => {
    files: number;
    directories: number;
    topLevel: string[];
  };
}

export function createFacadeFilesEngine({
  apiRequest,
  defaultProjectFolderForDocument,
  hashStableValue,
  readActiveLorebookCollection,
  summarizeProjectTree,
}: FacadeFilesEngineDeps) {
  interface ManageFilePathState {
    path: string;
    exists: boolean;
    kind: 'file' | 'directory' | 'other' | 'missing';
    size: number | null;
    mtimeMs: number | null;
  }

  interface ManageFilePlan {
    result: Record<string, unknown>;
    routes: FacadeRoute[];
    touched: string[];
    requiredGuards: FacadeV1Guard[];
  }

  function filePathState(filePath: string): ManageFilePathState {
    const resolved = path.resolve(filePath);
    try {
      const stat = fs.statSync(resolved);
      return {
        path: resolved,
        exists: true,
        kind: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other',
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    } catch {
      return { path: resolved, exists: false, kind: 'missing', size: null, mtimeMs: null };
    }
  }

  function filePathStateDigest(filePath: string): string {
    const state = filePathState(filePath);
    return hashStableValue({
      path: state.path,
      exists: state.exists,
      kind: state.kind,
      size: state.size,
      mtimeMs: state.mtimeMs,
    });
  }

  function projectTreeDigest(projectPath: string): string {
    const resolved = path.resolve(projectPath);
    const entries: Array<Record<string, unknown>> = [];
    const walk = (dirPath: string) => {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.name !== '.risutoki') continue;
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(resolved, fullPath).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        entries.push({
          relativePath,
          kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
          size: entry.isFile() ? stat.size : null,
          mtimeMs: stat.mtimeMs,
        });
        if (entry.isDirectory()) walk(fullPath);
      }
    };
    walk(resolved);
    entries.sort((a, b) => String(a.relativePath).localeCompare(String(b.relativePath)));
    return hashStableValue(entries);
  }

  function projectTreeDigestOrMissing(projectPath: string): string {
    const state = filePathState(projectPath);
    if (!state.exists || state.kind !== 'directory') return filePathStateDigest(projectPath);
    return projectTreeDigest(projectPath);
  }

  function manageFileGuard(
    name: string,
    value: string,
    sourceResultPath: string,
    sourceOperations: string[] = ['manage_file'],
  ): FacadeV1Guard {
    return buildGuard(name, value, '/guard_values/*', sourceOperations, sourceResultPath);
  }

  function checkManageFileGuardValue(
    guards: FacadeV1Guard[] | undefined,
    name: string,
    actual: string,
    suggestion: string,
  ): ApiErrorResult | undefined {
    const expected = guardValue(guards, name);
    if (expected === undefined) {
      return facadeApiError(400, `Missing guard value for ${name}`, suggestion, { guard: name }, ['manage_file']);
    }
    if (expected !== actual) {
      return facadeApiError(409, `Stale guard mismatch for ${name}`, suggestion, { guard: name, expected, actual }, [
        'manage_file',
        'inspect_document',
      ]);
    }
    return undefined;
  }

  function sessionDocumentRecord(session: unknown): Record<string, unknown> | undefined {
    return asRecord(asRecord(session)?.document);
  }

  function sessionActiveFilePath(session: unknown): string {
    const filePath = recordString(sessionDocumentRecord(session), 'filePath');
    return filePath ? path.resolve(filePath) : '';
  }

  async function readSessionForManageFile(): Promise<
    { session: unknown; activeFilePath: string; routes: FacadeRoute[] } | ApiErrorResult
  > {
    const session = await apiRequest('GET', '/session/status');
    if (isApiError(session)) return session;
    return {
      session,
      activeFilePath: sessionActiveFilePath(session),
      routes: [route('session_status', 'GET', '/session/status')],
    };
  }

  function activeFilePathGuard(activeFilePath: string): FacadeV1Guard {
    return manageFileGuard('expected_active_file_path', activeFilePath, '/result/current_active_file_path', [
      'inspect_document',
      'session_status',
      'manage_file',
    ]);
  }

  function externalPathStateGuard(name: string, filePath: string, sourceResultPath: string): FacadeV1Guard {
    return manageFileGuard(name, filePathStateDigest(filePath), sourceResultPath);
  }

  function projectDigestGuard(projectPath: string): FacadeV1Guard {
    return manageFileGuard(
      'expected_project_tree_digest',
      projectTreeDigestOrMissing(projectPath),
      '/result/project_digest',
    );
  }

  function lorebookCollectionManageFileGuard(entries: Array<Record<string, unknown>>): FacadeV1Guard {
    return manageFileGuard(
      'expected_lorebook_collection_digest',
      hashStableValue(entries),
      '/result/lorebook_collection_digest',
    );
  }

  function manageFileTargetPath(
    target: FacadeV1Target,
    operationPath: string | undefined,
    action: string,
  ): string | ApiErrorResult {
    const rawPath = operationPath ?? (target.kind === 'external' ? target.file_path : undefined);
    if (!rawPath) {
      return facadeApiError(
        400,
        `${action} requires an external target path`,
        'Use target.kind="external" or provide the operation path explicitly.',
        { target, action },
        ['manage_file'],
      );
    }
    return path.resolve(rawPath);
  }

  function ensureSupportedDocumentFile(filePath: string, action: string): ApiErrorResult | undefined {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.charx', '.risum', '.risup'].includes(ext)) {
      return facadeApiError(
        400,
        `${action} supports .charx, .risum, and .risup files`,
        'Choose a RisuAI document file or keep using the filesystem directly for non-artifact files.',
        { file_path: filePath },
        ['inspect_document'],
      );
    }
    return undefined;
  }

  function summarizeManageFileProject(projectPath: string): Record<string, unknown> | ApiErrorResult {
    const state = filePathState(projectPath);
    if (!state.exists || state.kind !== 'directory') {
      return facadeApiError(
        400,
        `Project folder not found: ${state.path}`,
        'Use extract_project first or provide a project_path containing card.json, module.json, or preset.json.',
        { project_path: state.path, state },
        ['manage_file'],
      );
    }
    let fileType: string | null = null;
    try {
      fileType = getProjectFileType(state.path);
    } catch {
      fileType = null;
    }
    return {
      project_path: state.path,
      file_type: fileType,
      tree: listProjectTree(state.path),
      treeSummary: summarizeProjectTree(state.path),
      project_digest: projectTreeDigest(state.path),
    };
  }

  async function readManageFileOperation(
    target: FacadeV1Target,
    operation: ManageFileOperation,
  ): Promise<{ result: Record<string, unknown>; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    if (operation.action === 'list_snapshots') {
      if (target.kind === 'external') {
        return facadeApiError(
          400,
          'list_snapshots supports only active/session targets',
          'Snapshots are tied to the active editor session. Use target.kind="active" or "session".',
          { target },
          ['inspect_document'],
        );
      }
      const data = await apiRequest('GET', `/field/${encodeURIComponent(operation.field)}/snapshots`);
      return isApiError(data)
        ? data
        : {
            result: asRecord(data) ?? { data },
            routes: [route('list_snapshots', 'GET', `/field/${operation.field}/snapshots`)],
            touched: [`active:snapshot:${operation.field}`],
          };
    }

    if (operation.action === 'project_tree') {
      const projectPath = manageFileTargetPath(target, operation.project_path, operation.action);
      if (isApiError(projectPath)) return projectPath;
      const summary = summarizeManageFileProject(projectPath);
      if (isApiError(summary)) return summary;
      return {
        result: summary,
        routes: [route('manage_file', 'READ', 'project_tree')],
        touched: [`project:${projectPath}`],
      };
    }

    return facadeApiError(
      400,
      `Unsupported manage_file read action: ${operation.action}`,
      'Read mode supports list_snapshots and project_tree.',
      { operation },
    );
  }

  async function previewManageFileOperation(
    target: FacadeV1Target,
    operation: ManageFileOperation,
  ): Promise<ManageFilePlan | ApiErrorResult> {
    if (operation.action === 'open_file') {
      const filePath = manageFileTargetPath(target, operation.file_path, operation.action);
      if (isApiError(filePath)) return filePath;
      const extensionError = ensureSupportedDocumentFile(filePath, operation.action);
      if (extensionError) return extensionError;
      const fileState = filePathState(filePath);
      if (!fileState.exists || fileState.kind !== 'file') {
        return facadeApiError(400, `File not found: ${filePath}`, 'Choose an existing .charx/.risum/.risup file.', {
          file_path: filePath,
          state: fileState,
        });
      }
      const session = await readSessionForManageFile();
      if (isApiError(session)) return session;
      const requiredGuards = [
        externalPathStateGuard('expected_file_state_digest', filePath, '/result/file_state_digest'),
        activeFilePathGuard(session.activeFilePath),
      ];
      return {
        result: {
          action: operation.action,
          file_path: filePath,
          file_state: fileState,
          file_state_digest: filePathStateDigest(filePath),
          current_active_file_path: session.activeFilePath,
          save_current: operation.save_current ?? null,
          will_open_active_document: true,
        },
        routes: [...session.routes, route('open_file', 'POST', '/open-file')],
        touched: [`external:${filePath}`, 'active:document'],
        requiredGuards,
      };
    }

    if (operation.action === 'save_current_file') {
      const session = await readSessionForManageFile();
      if (isApiError(session)) return session;
      return {
        result: {
          action: operation.action,
          current_active_file_path: session.activeFilePath,
          will_save_active_document: true,
        },
        routes: [...session.routes, route('save_current_file', 'POST', '/document/save')],
        touched: ['active:document'],
        requiredGuards: [activeFilePathGuard(session.activeFilePath)],
      };
    }

    if (operation.action === 'snapshot_field' || operation.action === 'restore_snapshot') {
      if (target.kind === 'external') {
        return facadeApiError(
          400,
          `${operation.action} supports only active/session targets`,
          'Snapshots are tied to the active editor session. Use target.kind="active" or "session".',
          { target },
        );
      }
      const session = await readSessionForManageFile();
      if (isApiError(session)) return session;
      const routes = [...session.routes];
      const result: Record<string, unknown> = {
        action: operation.action,
        field: operation.field,
        current_active_file_path: session.activeFilePath,
      };
      if (operation.action === 'restore_snapshot') {
        const snapshots = await apiRequest('GET', `/field/${encodeURIComponent(operation.field)}/snapshots`);
        if (isApiError(snapshots)) return snapshots;
        const snapshotList = asRecord(snapshots)?.snapshots;
        const snapshot = Array.isArray(snapshotList)
          ? snapshotList.find((entry) => asRecord(entry)?.id === operation.snapshot_id)
          : undefined;
        if (!snapshot) {
          return facadeApiError(
            404,
            `Snapshot not found: ${operation.snapshot_id}`,
            'Call manage_file read list_snapshots, then preview restore_snapshot again with a current snapshot_id.',
            { field: operation.field, snapshot_id: operation.snapshot_id },
            ['manage_file'],
          );
        }
        routes.push(route('list_snapshots', 'GET', `/field/${operation.field}/snapshots`));
        result.snapshot = snapshot;
        result.snapshot_id = operation.snapshot_id;
      }
      routes.push(
        operation.action === 'snapshot_field'
          ? route('snapshot_field', 'POST', `/field/${operation.field}/snapshot`)
          : route('restore_snapshot', 'POST', `/field/${operation.field}/restore`),
      );
      return {
        result,
        routes,
        touched: [`active:field:${operation.field}`],
        requiredGuards: [activeFilePathGuard(session.activeFilePath)],
      };
    }

    if (operation.action === 'export_field') {
      if (target.kind === 'external') {
        return facadeApiError(
          400,
          'export_field exports from the active editor document',
          'Open or target the document as active before exporting a field, or use project extraction for external files.',
          { target },
        );
      }
      const session = await readSessionForManageFile();
      if (isApiError(session)) return session;
      const outputPath = path.resolve(operation.file_path);
      return {
        result: {
          action: operation.action,
          field: operation.field,
          file_path: outputPath,
          format: operation.format ?? 'txt',
          output_state: filePathState(outputPath),
          output_state_digest: filePathStateDigest(outputPath),
          current_active_file_path: session.activeFilePath,
        },
        routes: [...session.routes, route('export_field_to_file', 'POST', '/field/export')],
        touched: [`active:field:${operation.field}`, `file:${outputPath}`],
        requiredGuards: [
          activeFilePathGuard(session.activeFilePath),
          externalPathStateGuard('expected_output_state_digest', outputPath, '/result/output_state_digest'),
        ],
      };
    }

    if (operation.action === 'export_lorebook') {
      if (target.kind !== 'active') {
        return facadeApiError(
          400,
          'export_lorebook exports from the active editor document',
          'Open the document and retry with target.kind="active".',
          { target },
        );
      }
      const session = await readSessionForManageFile();
      if (isApiError(session)) return session;
      const collection = await readActiveLorebookCollection();
      if (isApiError(collection)) return collection;
      const targetDir = path.resolve(operation.target_dir);
      const plan = planLorebookExport(collection.entries, targetDir, {
        format: operation.format ?? 'md',
        groupByFolder: operation.group_by_folder,
        includeMetadata: true,
        sourceName: session.activeFilePath ? path.basename(session.activeFilePath) : 'unknown',
        filter: operation.filter,
        folder: operation.folder,
      });
      if (plan.exportedCount === 0) {
        return facadeApiError(
          400,
          'No lorebook entries match the export selection',
          'Adjust filter/folder or inspect the active lorebook before retrying.',
          { filter: operation.filter, folder: operation.folder },
          ['read_content', 'manage_file'],
        );
      }
      return {
        result: {
          action: operation.action,
          target_dir: targetDir,
          format: operation.format ?? 'md',
          group_by_folder: operation.group_by_folder ?? true,
          filter: operation.filter ?? null,
          folder: operation.folder ?? null,
          exported_count: plan.exportedCount,
          skipped_count: plan.skippedCount,
          planned_files: plan.files,
          current_active_file_path: session.activeFilePath,
          lorebook_collection_digest: hashStableValue(collection.entries),
          output_state_digest: projectTreeDigestOrMissing(targetDir),
          writes_performed: false,
        },
        routes: [
          ...session.routes,
          ...collection.routes,
          route('export_lorebook_to_files', 'POST', '/lorebook/export'),
        ],
        touched: ['active:lorebook', `directory:${targetDir}`],
        requiredGuards: [
          activeFilePathGuard(session.activeFilePath),
          lorebookCollectionManageFileGuard(collection.entries),
          manageFileGuard(
            'expected_output_state_digest',
            projectTreeDigestOrMissing(targetDir),
            '/result/output_state_digest',
          ),
        ],
      };
    }

    if (operation.action === 'import_lorebook') {
      if (target.kind !== 'active') {
        return facadeApiError(
          400,
          'import_lorebook imports into the active editor document',
          'Open the destination document and retry with target.kind="active".',
          { target },
        );
      }
      const session = await readSessionForManageFile();
      if (isApiError(session)) return session;
      const collection = await readActiveLorebookCollection();
      if (isApiError(collection)) return collection;
      const format = operation.format ?? 'md';
      const source = path.resolve(format === 'json' ? operation.source_path! : operation.source_dir!);
      const sourceState = filePathState(source);
      if (!sourceState.exists || (format === 'json' ? sourceState.kind !== 'file' : sourceState.kind !== 'directory')) {
        return facadeApiError(
          400,
          `Lorebook import source not found: ${source}`,
          format === 'json' ? 'Choose an existing JSON file.' : 'Choose an existing Markdown directory.',
          { source, state: sourceState },
        );
      }
      const sourceDigest = format === 'json' ? filePathStateDigest(source) : projectTreeDigestOrMissing(source);
      const dryRun = await apiRequest('POST', '/lorebook/import', {
        source_path: operation.source_path ? path.resolve(operation.source_path) : undefined,
        source_dir: operation.source_dir ? path.resolve(operation.source_dir) : undefined,
        format,
        create_folders: operation.create_folders,
        conflict: operation.conflict,
        dry_run: true,
      });
      if (isApiError(dryRun)) return dryRun;
      return {
        result: {
          action: operation.action,
          source,
          format,
          create_folders: operation.create_folders ?? true,
          conflict: operation.conflict ?? 'skip',
          import_preview: dryRun,
          current_active_file_path: session.activeFilePath,
          lorebook_collection_digest: hashStableValue(collection.entries),
          source_state_digest: sourceDigest,
          writes_performed: false,
        },
        routes: [
          ...session.routes,
          ...collection.routes,
          route('import_lorebook_from_files', 'POST', '/lorebook/import'),
        ],
        touched: [`${sourceState.kind}:${source}`, 'active:lorebook'],
        requiredGuards: [
          activeFilePathGuard(session.activeFilePath),
          lorebookCollectionManageFileGuard(collection.entries),
          manageFileGuard('expected_source_state_digest', sourceDigest, '/result/source_state_digest'),
        ],
      };
    }

    if (operation.action === 'extract_project') {
      const filePath = manageFileTargetPath(target, operation.file_path, operation.action);
      if (isApiError(filePath)) return filePath;
      const extensionError = ensureSupportedDocumentFile(filePath, operation.action);
      if (extensionError) return extensionError;
      const fileState = filePathState(filePath);
      if (!fileState.exists || fileState.kind !== 'file') {
        return facadeApiError(400, `File not found: ${filePath}`, 'Choose an existing .charx/.risum/.risup file.', {
          file_path: filePath,
          state: fileState,
        });
      }
      const projectPath = path.resolve(operation.project_path || defaultProjectFolderForDocument(filePath));
      return {
        result: {
          action: operation.action,
          file_path: filePath,
          project_path: projectPath,
          file_state: fileState,
          file_state_digest: filePathStateDigest(filePath),
          output_state: filePathState(projectPath),
          output_state_digest: filePathStateDigest(projectPath),
        },
        routes: [route('extract_charx_to_project_folder', 'POST', 'extractDocumentToProject')],
        touched: [`external:${filePath}`, `project:${projectPath}`],
        requiredGuards: [
          externalPathStateGuard('expected_file_state_digest', filePath, '/result/file_state_digest'),
          externalPathStateGuard('expected_output_state_digest', projectPath, '/result/output_state_digest'),
        ],
      };
    }

    if (operation.action === 'reassemble_project') {
      const projectPath = manageFileTargetPath(target, operation.project_path, operation.action);
      if (isApiError(projectPath)) return projectPath;
      const projectSummary = summarizeManageFileProject(projectPath);
      if (isApiError(projectSummary)) return projectSummary;
      const outputPath = path.resolve(operation.output_path);
      const extensionError = ensureSupportedDocumentFile(outputPath, operation.action);
      if (extensionError) return extensionError;
      return {
        result: {
          action: operation.action,
          project_path: projectPath,
          output_path: outputPath,
          project_digest: projectTreeDigest(projectPath),
          project: projectSummary,
          output_state: filePathState(outputPath),
          output_state_digest: filePathStateDigest(outputPath),
        },
        routes: [route('reassemble_project_folder_to_charx', 'POST', 'reassembleProjectDocument')],
        touched: [`project:${projectPath}`, `external:${outputPath}`],
        requiredGuards: [
          projectDigestGuard(projectPath),
          externalPathStateGuard('expected_output_state_digest', outputPath, '/result/output_state_digest'),
        ],
      };
    }

    return facadeApiError(
      400,
      `Unsupported manage_file preview action: ${operation.action}`,
      'Preview mode supports open/save/snapshot/restore/export/extract/reassemble and lorebook import/export operations.',
      { operation },
    );
  }

  async function applyManageFileOperation(
    target: FacadeV1Target,
    operation: ManageFileOperation,
    guardValues: FacadeV1Guard[] | undefined,
  ): Promise<{ result: Record<string, unknown>; routes: FacadeRoute[]; touched: string[] } | ApiErrorResult> {
    const plan = await previewManageFileOperation(target, operation);
    if (isApiError(plan)) return plan;

    for (const guard of plan.requiredGuards) {
      const name = guard.name;
      let actual = '';
      if (name === 'expected_active_file_path') {
        const session = await readSessionForManageFile();
        if (isApiError(session)) return session;
        actual = session.activeFilePath;
      } else if (name === 'expected_file_state_digest') {
        const filePath =
          operation.action === 'open_file' || operation.action === 'extract_project'
            ? manageFileTargetPath(target, operation.file_path, operation.action)
            : undefined;
        if (filePath && isApiError(filePath)) return filePath;
        if (!filePath) return facadeApiError(400, 'Missing file path', 'Retry.');
        actual = filePathStateDigest(filePath);
      } else if (name === 'expected_output_state_digest') {
        let outputPath =
          operation.action === 'export_field'
            ? operation.file_path
            : operation.action === 'reassemble_project'
              ? operation.output_path
              : operation.action === 'export_lorebook'
                ? operation.target_dir
                : undefined;
        if (operation.action === 'extract_project') {
          if (operation.project_path) {
            outputPath = operation.project_path;
          } else {
            const filePath = manageFileTargetPath(target, operation.file_path, operation.action);
            if (isApiError(filePath)) return filePath;
            outputPath = defaultProjectFolderForDocument(filePath);
          }
        }
        if (!outputPath) return facadeApiError(400, 'Missing output path', 'Run manage_file preview again.');
        actual =
          operation.action === 'export_lorebook'
            ? projectTreeDigestOrMissing(path.resolve(outputPath))
            : filePathStateDigest(outputPath);
      } else if (name === 'expected_project_tree_digest') {
        const projectPath =
          operation.action === 'reassemble_project'
            ? manageFileTargetPath(target, operation.project_path, operation.action)
            : undefined;
        if (projectPath && isApiError(projectPath)) return projectPath;
        if (!projectPath) return facadeApiError(400, 'Missing project path', 'Retry.');
        actual = projectTreeDigestOrMissing(projectPath);
      } else if (name === 'expected_lorebook_collection_digest') {
        const collection = await readActiveLorebookCollection();
        if (isApiError(collection)) return collection;
        actual = hashStableValue(collection.entries);
      } else if (name === 'expected_source_state_digest') {
        if (operation.action !== 'import_lorebook') {
          return facadeApiError(400, 'Unexpected source state guard', 'Run manage_file preview again.');
        }
        const format = operation.format ?? 'md';
        const source = path.resolve(format === 'json' ? operation.source_path! : operation.source_dir!);
        actual = format === 'json' ? filePathStateDigest(source) : projectTreeDigestOrMissing(source);
      }
      const conflict = checkManageFileGuardValue(
        guardValues,
        name,
        actual,
        'Refresh manage_file preview, then apply with the new guard values.',
      );
      if (conflict) return conflict;
    }

    if (operation.action === 'open_file') {
      const filePath = manageFileTargetPath(target, operation.file_path, operation.action);
      if (isApiError(filePath)) return filePath;
      const data = await apiRequest('POST', '/open-file', {
        file_path: filePath,
        save_current: operation.save_current,
      });
      return isApiError(data)
        ? data
        : {
            result: { ...(asRecord(data) ?? {}), action: operation.action },
            routes: plan.routes,
            touched: plan.touched,
          };
    }

    if (operation.action === 'save_current_file') {
      const data = await apiRequest('POST', '/document/save', {});
      return isApiError(data)
        ? data
        : {
            result: { ...(asRecord(data) ?? {}), action: operation.action },
            routes: plan.routes,
            touched: plan.touched,
          };
    }

    if (operation.action === 'snapshot_field') {
      const data = await apiRequest('POST', `/field/${encodeURIComponent(operation.field)}/snapshot`);
      return isApiError(data)
        ? data
        : {
            result: { ...(asRecord(data) ?? {}), action: operation.action },
            routes: plan.routes,
            touched: plan.touched,
          };
    }

    if (operation.action === 'restore_snapshot') {
      const data = await apiRequest('POST', `/field/${encodeURIComponent(operation.field)}/restore`, {
        snapshot_id: operation.snapshot_id,
      });
      return isApiError(data)
        ? data
        : {
            result: { ...(asRecord(data) ?? {}), action: operation.action },
            routes: plan.routes,
            touched: plan.touched,
          };
    }

    if (operation.action === 'export_field') {
      const data = await apiRequest('POST', '/field/export', {
        field: operation.field,
        file_path: path.resolve(operation.file_path),
        format: operation.format,
      });
      return isApiError(data)
        ? data
        : {
            result: { ...(asRecord(data) ?? {}), action: operation.action },
            routes: plan.routes,
            touched: plan.touched,
          };
    }

    if (operation.action === 'export_lorebook') {
      const data = await apiRequest('POST', '/lorebook/export', {
        target_dir: path.resolve(operation.target_dir),
        format: operation.format,
        group_by_folder: operation.group_by_folder,
        filter: operation.filter,
        folder: operation.folder,
      });
      return isApiError(data)
        ? data
        : {
            result: { ...(asRecord(data) ?? {}), action: operation.action },
            routes: plan.routes,
            touched: plan.touched,
          };
    }

    if (operation.action === 'import_lorebook') {
      const data = await apiRequest('POST', '/lorebook/import', {
        source_path: operation.source_path ? path.resolve(operation.source_path) : undefined,
        source_dir: operation.source_dir ? path.resolve(operation.source_dir) : undefined,
        format: operation.format,
        create_folders: operation.create_folders,
        conflict: operation.conflict,
      });
      return isApiError(data)
        ? data
        : {
            result: { ...(asRecord(data) ?? {}), action: operation.action },
            routes: plan.routes,
            touched: plan.touched,
          };
    }

    if (operation.action === 'extract_project') {
      const filePath = manageFileTargetPath(target, operation.file_path, operation.action);
      if (isApiError(filePath)) return filePath;
      const projectPath = path.resolve(operation.project_path || defaultProjectFolderForDocument(filePath));
      extractDocumentToProject(filePath, projectPath);
      const treeSummary = summarizeProjectTree(projectPath);
      const fileType = path.extname(filePath).toLowerCase().replace('.', '');
      return {
        result: {
          success: true,
          action: operation.action,
          filePath,
          fileType,
          projectPath,
          treeSummary,
          project_digest: projectTreeDigest(projectPath),
        },
        routes: plan.routes,
        touched: plan.touched,
      };
    }

    if (operation.action === 'reassemble_project') {
      const projectPath = manageFileTargetPath(target, operation.project_path, operation.action);
      if (isApiError(projectPath)) return projectPath;
      const outputPath = path.resolve(operation.output_path);
      const projectFileType = getProjectFileType(projectPath);
      reassembleProjectDocument(projectPath, outputPath);
      const stat = fs.statSync(outputPath);
      return {
        result: {
          success: true,
          action: operation.action,
          fileType: projectFileType,
          projectPath,
          outputPath,
          sizeBytes: stat.size,
        },
        routes: plan.routes,
        touched: plan.touched,
      };
    }

    return facadeApiError(
      400,
      `Unsupported manage_file apply action: ${operation.action}`,
      'Apply mode requires a preview token for a supported mutating file action.',
      { operation },
    );
  }

  return {
    readManageFileOperation,
    previewManageFileOperation,
    applyManageFileOperation,
  };
}

export type FacadeFilesEngine = ReturnType<typeof createFacadeFilesEngine>;
