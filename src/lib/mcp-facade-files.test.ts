// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFacadeFilesEngine } from './mcp-facade-files';
import { hashSurface } from './mcp-api-helpers';
import { isApiError } from './mcp-facade-runtime';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';

const dir = useMcpApiTestDir('facade-file-digest');

describe('manage_file content fingerprints', () => {
  it.each(['file', 'directory'] as const)('rejects same-size same-mtime changes to an output %s', async (kind) => {
    const source = path.join(dir, `${kind}.charx`);
    fs.writeFileSync(source, 'synthetic source');
    const output = path.join(dir, `${kind}-output`);
    if (kind === 'directory') fs.mkdirSync(output);
    const changedPath = kind === 'directory' ? path.join(output, 'description.md') : output;
    fs.writeFileSync(changedPath, 'before');
    const stamp = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(changedPath, stamp, stamp);
    const engine = createFacadeFilesEngine({
      apiRequest: async () => ({}),
      defaultProjectFolderForDocument: () => output,
      hashStableValue: hashSurface,
      readActiveLorebookCollection: async () => ({ entries: [], routes: [] }),
      summarizeProjectTree: () => ({ files: 1, directories: 0, topLevel: [] }),
    });
    const target = { kind: 'external' as const, file_path: source };
    const operation = { action: 'extract_project' as const, project_path: output };
    const preview = await engine.previewManageFileOperation(target, operation);
    if (isApiError(preview)) throw new Error(preview.error as string);
    fs.writeFileSync(changedPath, 'after!');
    fs.utimesSync(changedPath, stamp, stamp);
    const result = await engine.applyManageFileOperation(target, operation, preview.requiredGuards);
    expect(result).toMatchObject({ __apiError: true, status: 409 });
    expect(fs.readFileSync(changedPath, 'utf8')).toBe('after!');
  });
});
