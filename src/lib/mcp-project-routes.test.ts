// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openCharx } from '../charx-io';
import { extractDocumentToProject } from './folder-workspace';
import { hashSurface } from './mcp-api-helpers';
import { closeServer, createExternalFixtureHelpers, createLegacyTestApiServer, postJson } from './mcp-api-test-harness';
import { useMcpApiTestDir } from './mcp-api-vitest-helpers';
import { createFacadeFilesEngine } from './mcp-facade-files';
import { isApiError } from './mcp-facade-runtime';
import { filePathStateDigest } from './mcp-file-state';
import { startHeadlessMcpApiServer } from './mcp-headless-server';
import { createMcpProxyClient } from './mcp-proxy-client';
import { registerReferenceTools } from './mcp-tool-register-reference';
import type { McpToolResult, McpToolServer } from './mcp-tool-registration';

const dir = useMcpApiTestDir('project-write-approval');
const fixtures = createExternalFixtureHelpers(dir);
const startServer = createLegacyTestApiServer(dir);

describe('project writes use runtime approval', () => {
  it.each(['facade', 'granular'] as const)(
    'blocks %s extract and reassemble in a read-only standalone session',
    async (entrypoint) => {
      const { filePath, dir: fixtureDir } = fixtures.createExternalCharxFixture();
      const projectPath = path.join(fixtureDir, 'existing-project');
      extractDocumentToProject(filePath, projectPath);
      const extractOutput = path.join(fixtureDir, 'blocked-project');
      const reassembleOutput = path.join(fixtureDir, 'existing-output.charx');
      fs.writeFileSync(reassembleOutput, 'keep existing output');
      const runtime = await startHeadlessMcpApiServer({
        allowWrites: false,
        userDataPath: path.join(fixtureDir, 'user-data'),
        log: () => {},
      });
      const apiRequest = createMcpProxyClient({
        getPort: () => String(runtime.port),
        getToken: () => runtime.token,
        logProcessDiagnostic: () => {},
        noteRuntimeError: () => {},
        mcpLog: () => {},
      });
      const summarizeProjectTree = () => ({ files: 1, directories: 0, topLevel: ['card.json'] });
      try {
        const results: unknown[] = [];
        if (entrypoint === 'facade') {
          const engine = createFacadeFilesEngine({
            apiRequest,
            defaultProjectFolderForDocument: () => extractOutput,
            hashStableValue: hashSurface,
            readActiveLorebookCollection: async () => ({ entries: [], routes: [] }),
            summarizeProjectTree,
          });
          for (const [source, operation] of [
            [filePath, { action: 'extract_project', project_path: extractOutput }],
            [projectPath, { action: 'reassemble_project', output_path: reassembleOutput }],
          ] as const) {
            const target = { kind: 'external' as const, file_path: source };
            const preview = await engine.previewManageFileOperation(target, operation);
            if (isApiError(preview)) throw new Error(String(preview.error));
            results.push(await engine.applyManageFileOperation(target, operation, preview.requiredGuards));
          }
        } else {
          const handlers = new Map<string, (args: Record<string, unknown>) => McpToolResult | Promise<McpToolResult>>();
          const server: McpToolServer = {
            tool(name, _description, _shape, handler) {
              handlers.set(name, (args) => handler(args as never));
            },
          };
          registerReferenceTools(server, {
            apiRequest,
            defaultProjectFolderForDocument: () => extractOutput,
            safeToolHandler: (_name, handler) => handler,
            summarizeProjectTree,
            textResult: (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] }),
          });
          for (const [name, args] of [
            ['extract_charx_to_project_folder', { file_path: filePath, project_path: extractOutput }],
            ['reassemble_project_folder_to_charx', { project_path: projectPath, output_path: reassembleOutput }],
          ] as const) {
            const result = await handlers.get(name)!(args);
            results.push(JSON.parse(result.content[0].text));
          }
        }
        expect(results).toEqual([
          expect.objectContaining({ __apiError: true, status: 403 }),
          expect.objectContaining({ __apiError: true, status: 403 }),
        ]);
        expect(fs.existsSync(extractOutput)).toBe(false);
        expect(fs.readFileSync(reassembleOutput, 'utf8')).toBe('keep existing output');
      } finally {
        await runtime.close();
      }
    },
  );

  it('round-trips a document through approved project writes without an active document', async () => {
    const { filePath, dir: fixtureDir } = fixtures.createExternalCharxFixture();
    const projectPath = path.join(fixtureDir, 'project');
    const outputPath = path.join(fixtureDir, 'roundtrip.charx');
    const runtime = await startHeadlessMcpApiServer({
      allowWrites: true,
      userDataPath: path.join(fixtureDir, 'user-data'),
      log: () => {},
    });
    try {
      expect(
        (
          await postJson(runtime.port, runtime.token, '/project/extract', {
            source_path: filePath,
            output_path: projectPath,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await postJson(runtime.port, runtime.token, '/project/reassemble', {
            source_path: projectPath,
            output_path: outputPath,
          })
        ).status,
      ).toBe(200);
      expect(openCharx(outputPath).description).toBe(openCharx(filePath).description);
    } finally {
      await runtime.close();
    }
  });

  it.each(['source', 'output'] as const)('rejects %s changes while approval is pending', async (changed) => {
    const { filePath, dir: fixtureDir } = fixtures.createExternalCharxFixture();
    const projectPath = path.join(fixtureDir, 'project');
    const changedPath = changed === 'source' ? filePath : path.join(projectPath, 'description.md');
    const api = await startServer(null, [], undefined, {
      askRendererConfirm: async () => {
        if (changed === 'output') fs.mkdirSync(projectPath);
        fs.writeFileSync(changedPath, 'another writer');
        return true;
      },
    });
    try {
      const response = await postJson(api.port, api.token, '/project/extract', {
        source_path: filePath,
        output_path: projectPath,
      });
      expect(response.status).toBe(409);
      expect(fs.readFileSync(changedPath, 'utf8')).toBe('another writer');
      expect(fs.existsSync(path.join(projectPath, 'card.json'))).toBe(false);
    } finally {
      await closeServer(api.server);
    }
  });

  it('checks the preview source digest at the write owner', async () => {
    const { filePath, dir: fixtureDir } = fixtures.createExternalCharxFixture();
    const digest = filePathStateDigest(filePath);
    fs.writeFileSync(filePath, 'changed since preview');
    const projectPath = path.join(fixtureDir, 'project');
    let confirmations = 0;
    const api = await startServer(null, [], undefined, {
      askRendererConfirm: async () => {
        confirmations++;
        return true;
      },
    });
    try {
      const result = await postJson(api.port, api.token, '/project/extract', {
        source_path: filePath,
        output_path: projectPath,
        expected_source_digest: digest,
      });
      expect(result.status).toBe(409);
      expect(confirmations).toBe(0);
      expect(fs.existsSync(projectPath)).toBe(false);
    } finally {
      await closeServer(api.server);
    }
  });
});
