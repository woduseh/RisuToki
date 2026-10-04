import * as http from 'node:http';
import * as path from 'node:path';
import { z } from 'zod';
import { FileConflictError } from './file-baseline';
import { extractDocumentToProject, getProjectFileType, reassembleProjectDocument } from './folder-workspace';
import { readJsonBody, logMcpMutation } from './mcp-api-helpers';
import type { McpApiDeps } from './mcp-api-server';
import { filePathState, filePathStateDigest, projectTreeDigest } from './mcp-file-state';
import type { McpErrorInfo, McpSuccessOptions } from './mcp-response-envelope';

const projectWriteSchema = z.object({
  source_path: z.string().trim().min(1),
  output_path: z.string().trim().min(1),
  expected_source_digest: z.string().min(1).optional(),
  expected_output_digest: z.string().min(1).optional(),
});

interface ProjectRouteDeps {
  askRendererConfirm: McpApiDeps['askRendererConfirm'];
  broadcastMcpStatus: McpApiDeps['broadcastMcpStatus'];
  parseBody<T>(
    res: http.ServerResponse,
    body: Record<string, unknown>,
    schema: z.ZodType<T>,
    meta: { action: string; target: string; suggestion?: string },
  ): T | null;
  mcpError(res: http.ServerResponse, status: number, info: McpErrorInfo, error?: unknown): void;
  jsonResSuccess(res: http.ServerResponse, payload: Record<string, unknown>, options: McpSuccessOptions): void;
}

/** Both facade and granular project writes cross the runtime's approval seam here. */
export async function handleProjectRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  deps: ProjectRouteDeps,
): Promise<boolean> {
  if (req.method !== 'POST' || parts[0] !== 'project' || parts[2]) return false;
  const action = parts[1];
  if (action !== 'extract' && action !== 'reassemble') return false;
  const target = `project:${action}`;
  const rawBody = await readJsonBody(req, res, target, deps.broadcastMcpStatus);
  if (!rawBody) return true;
  const body = deps.parseBody(res, rawBody, projectWriteSchema, { action, target });
  if (!body) return true;

  const sourcePath = path.resolve(body.source_path);
  const outputPath = path.resolve(body.output_path);
  const documentPath = action === 'extract' ? sourcePath : outputPath;
  if (!['.charx', '.risum', '.risup'].includes(path.extname(documentPath).toLowerCase())) {
    deps.mcpError(res, 400, { action, target, message: 'Project operations require a .charx/.risum/.risup document.' });
    return true;
  }
  const sourceState = filePathState(sourcePath);
  if (sourceState.kind !== (action === 'extract' ? 'file' : 'directory')) {
    deps.mcpError(res, 400, { action, target, message: `Invalid project source: ${sourcePath}` });
    return true;
  }

  try {
    const sourceDigest = () => (action === 'extract' ? filePathStateDigest(sourcePath) : projectTreeDigest(sourcePath));
    const initialSource = sourceDigest();
    const initialOutput = filePathStateDigest(outputPath);
    const assertUnchanged = () => {
      if (
        sourceDigest() !== (body.expected_source_digest ?? initialSource) ||
        filePathStateDigest(outputPath) !== (body.expected_output_digest ?? initialOutput)
      ) {
        throw new FileConflictError('Project source or output changed. Read the current state and preview again.');
      }
    };
    assertUnchanged();
    const allowed = await deps.askRendererConfirm(
      action === 'extract' ? 'MCP 프로젝트 추출 요청' : 'MCP 프로젝트 재조립 요청',
      `AI 어시스턴트가 프로젝트 파일을 기록하려 합니다.\n원본: ${sourcePath}\n출력: ${outputPath}`,
    );
    if (!allowed) {
      deps.mcpError(res, 403, {
        action,
        target,
        message: 'Project write was not approved.',
        rejected: true,
        suggestion: 'Allow the write in the app, or enable --allow-writes for the standalone runtime.',
      });
      return true;
    }
    assertUnchanged();
    const fileType =
      action === 'extract' ? path.extname(sourcePath).slice(1).toLowerCase() : getProjectFileType(sourcePath);
    if (action === 'extract') extractDocumentToProject(sourcePath, outputPath);
    else reassembleProjectDocument(sourcePath, outputPath);
    logMcpMutation(`project ${action}`, target, { sourcePath, outputPath });
    deps.jsonResSuccess(
      res,
      { success: true, fileType, sourcePath, outputPath },
      {
        toolName: action === 'extract' ? 'extract_charx_to_project_folder' : 'reassemble_project_folder_to_charx',
        summary: `Completed project ${action}`,
      },
    );
  } catch (error) {
    deps.mcpError(
      res,
      error instanceof FileConflictError ? 409 : 500,
      {
        action,
        target,
        message: error instanceof Error ? error.message : String(error),
        suggestion: 'Inspect the source and output before creating a new preview.',
      },
      error,
    );
  }
  return true;
}
