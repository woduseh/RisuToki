import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

import { extractDocumentToProject, getProjectFileType, reassembleProjectDocument } from './folder-workspace';
import { API_ERROR_KEY } from './mcp-facade-runtime';
import { mcpSuccess } from './mcp-response-envelope';
import { MCP_TOOL_DESCRIPTIONS } from './mcp-tool-descriptions';
import type { McpToolRegistrationDeps, McpToolServer, SafeToolHandler } from './mcp-tool-registration';

interface ReferenceToolRegistrationDeps extends McpToolRegistrationDeps {
  defaultProjectFolderForDocument: (filePath: string) => string;
  safeToolHandler: SafeToolHandler;
  summarizeProjectTree: (projectPath: string) => {
    files: number;
    directories: number;
    topLevel: string[];
  };
}

export function registerReferenceTools(server: McpToolServer, deps: ReferenceToolRegistrationDeps): void {
  const { apiRequest, defaultProjectFolderForDocument, safeToolHandler, summarizeProjectTree, textResult } = deps;

  // ===== Reference Tools =====

  server.tool('list_references', MCP_TOOL_DESCRIPTIONS['list_references'], {}, async () =>
    textResult(await apiRequest('GET', '/references')),
  );

  server.tool(
    'read_reference_field',
    MCP_TOOL_DESCRIPTIONS['read_reference_field'],
    {
      index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
      field: z.string().describe('필드 이름'),
    },
    async ({ index, field }) => textResult(await apiRequest('GET', `/reference/${index}/${encodeURIComponent(field)}`)),
  );

  server.tool(
    'read_reference_field_batch',
    MCP_TOOL_DESCRIPTIONS['read_reference_field_batch'],
    {
      index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
      fields: z.array(z.string()).max(20).describe('읽을 필드 이름 배열 (최대 20개)'),
    },
    async ({ index, fields }) => textResult(await apiRequest('POST', `/reference/${index}/field/batch`, { fields })),
  );

  server.tool(
    'search_in_reference_field',
    MCP_TOOL_DESCRIPTIONS['search_in_reference_field'],
    {
      index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
      field: z.string().describe('필드 이름 (예: description, mainPrompt, globalNote)'),
      query: z.string().describe('검색할 문자열 (또는 regex: true일 때 정규식 패턴)'),
      context_chars: z.number().optional().describe('매치 전후에 표시할 문자 수 (기본: 100, 최대: 500)'),
      regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
      flags: z.string().optional().describe('정규식 플래그 (기본: "gi"). regex: true일 때만 사용'),
      max_matches: z.number().optional().describe('최대 반환 매치 수 (기본: 20, 최대: 100)'),
    },
    async ({ index, field, query, context_chars, regex, flags, max_matches }) =>
      textResult(
        await apiRequest('POST', `/reference/${index}/field/${encodeURIComponent(field)}/search`, {
          query,
          context_chars,
          regex,
          flags,
          max_matches,
        }),
      ),
  );

  server.tool(
    'read_reference_field_range',
    MCP_TOOL_DESCRIPTIONS['read_reference_field_range'],
    {
      index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
      field: z.string().describe('필드 이름 (예: description, mainPrompt, globalNote)'),
      offset: z.number().optional().describe('시작 문자 오프셋 (기본: 0)'),
      length: z.number().optional().describe('읽을 문자 수 (기본: 2000, 최대: 10000)'),
    },
    async ({ index, field, offset, length }) => {
      const params = new URLSearchParams();
      if (offset !== undefined) params.set('offset', String(offset));
      if (length !== undefined) params.set('length', String(length));
      const qs = params.toString();
      return textResult(
        await apiRequest('GET', `/reference/${index}/field/${encodeURIComponent(field)}/range${qs ? '?' + qs : ''}`),
      );
    },
  );

  server.tool(
    'list_reference_greetings',
    MCP_TOOL_DESCRIPTIONS['list_reference_greetings'],
    {
      index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
      type: z.enum(['alternate', 'group']).describe('인사말 종류'),
    },
    async ({ index, type }) =>
      textResult(await apiRequest('GET', `/reference/${index}/greetings/${encodeURIComponent(type)}`)),
  );

  server.tool(
    'read_reference_greeting',
    MCP_TOOL_DESCRIPTIONS['read_reference_greeting'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      type: z.enum(['alternate', 'group']).describe('인사말 종류'),
      entryIndex: z.number().describe('인사말 인덱스 (list_reference_greetings 결과 참조)'),
    },
    async ({ index, type, entryIndex }) =>
      textResult(await apiRequest('GET', `/reference/${index}/greeting/${encodeURIComponent(type)}/${entryIndex}`)),
  );

  server.tool(
    'read_reference_greeting_batch',
    MCP_TOOL_DESCRIPTIONS['read_reference_greeting_batch'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      type: z.enum(['alternate', 'group']).describe('인사말 종류'),
      indices: z.array(z.number()).max(50).describe('읽을 인사말 인덱스 배열 (최대 50개)'),
    },
    async ({ index, type, indices }) =>
      textResult(
        await apiRequest('POST', `/reference/${index}/greeting/${encodeURIComponent(type)}/batch`, { indices }),
      ),
  );

  server.tool(
    'list_reference_triggers',
    MCP_TOOL_DESCRIPTIONS['list_reference_triggers'],
    {
      index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    },
    async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/triggers`)),
  );

  server.tool(
    'read_reference_trigger',
    MCP_TOOL_DESCRIPTIONS['read_reference_trigger'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      triggerIndex: z.number().describe('트리거 인덱스 (list_reference_triggers 결과 참조)'),
    },
    async ({ index, triggerIndex }) =>
      textResult(await apiRequest('GET', `/reference/${index}/trigger/${triggerIndex}`)),
  );

  server.tool(
    'read_reference_trigger_batch',
    MCP_TOOL_DESCRIPTIONS['read_reference_trigger_batch'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      indices: z.array(z.number()).max(50).describe('읽을 트리거 인덱스 배열 (최대 50개)'),
    },
    async ({ index, indices }) =>
      textResult(await apiRequest('POST', `/reference/${index}/trigger/batch`, { indices })),
  );

  server.tool(
    'list_reference_lorebook',
    MCP_TOOL_DESCRIPTIONS['list_reference_lorebook'],
    {
      index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
      filter: z.string().optional().describe('검색 키워드 (comment, key에서 검색). 생략 시 전체 목록 반환'),
      folder: z.string().optional().describe('폴더 UUID로 필터. 생략 시 전체 반환'),
      content_filter: z.string().optional().describe('본문(content) 검색 키워드. 대소문자 무시. filter와 AND 결합'),
      content_filter_not: z.string().optional().describe('본문(content)에 이 키워드가 없는 항목만 필터. 대소문자 무시'),
      preview_length: z.number().optional().describe('content 미리보기 길이 (기본 150, 0=비활성, 최대 500)'),
    },
    async ({ index, filter, folder, content_filter, content_filter_not, preview_length }) => {
      const params = new URLSearchParams();
      if (filter) params.set('filter', filter);
      if (folder) params.set('folder', folder);
      if (content_filter) params.set('content_filter', content_filter);
      if (content_filter_not) params.set('content_filter_not', content_filter_not);
      if (preview_length !== undefined) params.set('preview_length', String(preview_length));
      const qs = params.toString();
      return textResult(await apiRequest('GET', `/reference/${index}/lorebook${qs ? '?' + qs : ''}`));
    },
  );

  server.tool(
    'read_reference_lorebook',
    MCP_TOOL_DESCRIPTIONS['read_reference_lorebook'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      entryIndex: z.number().describe('로어북 항목 인덱스 (list_reference_lorebook 결과 참조)'),
    },
    async ({ index, entryIndex }) => textResult(await apiRequest('GET', `/reference/${index}/lorebook/${entryIndex}`)),
  );

  server.tool(
    'read_reference_lorebook_batch',
    MCP_TOOL_DESCRIPTIONS['read_reference_lorebook_batch'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      indices: z.array(z.number()).max(50).describe('읽을 로어북 항목 인덱스 배열 (최대 50개)'),
      fields: z
        .array(z.string())
        .optional()
        .describe('반환할 필드 목록 (예: ["content", "comment"]). 미지정 시 전체 필드 반환'),
    },
    async ({ index, indices, fields }) =>
      textResult(await apiRequest('POST', `/reference/${index}/lorebook/batch`, { indices, fields })),
  );

  server.tool(
    'list_reference_lua',
    MCP_TOOL_DESCRIPTIONS['list_reference_lua'],
    { index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)') },
    async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/lua`)),
  );

  server.tool(
    'read_reference_lua',
    MCP_TOOL_DESCRIPTIONS['read_reference_lua'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      sectionIndex: z.number().describe('Lua 섹션 인덱스 (list_reference_lua 결과 참조)'),
    },
    async ({ index, sectionIndex }) => textResult(await apiRequest('GET', `/reference/${index}/lua/${sectionIndex}`)),
  );

  server.tool(
    'read_reference_lua_batch',
    MCP_TOOL_DESCRIPTIONS['read_reference_lua_batch'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      indices: z.array(z.number()).max(20).describe('읽을 Lua 섹션 인덱스 배열 (최대 20개)'),
    },
    async ({ index, indices }) => textResult(await apiRequest('POST', `/reference/${index}/lua/batch`, { indices })),
  );

  server.tool(
    'list_reference_css',
    MCP_TOOL_DESCRIPTIONS['list_reference_css'],
    { index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)') },
    async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/css`)),
  );

  server.tool(
    'read_reference_css',
    MCP_TOOL_DESCRIPTIONS['read_reference_css'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      sectionIndex: z.number().describe('CSS 섹션 인덱스 (list_reference_css 결과 참조)'),
    },
    async ({ index, sectionIndex }) => textResult(await apiRequest('GET', `/reference/${index}/css/${sectionIndex}`)),
  );

  server.tool(
    'read_reference_css_batch',
    MCP_TOOL_DESCRIPTIONS['read_reference_css_batch'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      indices: z.array(z.number()).max(20).describe('읽을 CSS 섹션 인덱스 배열 (최대 20개)'),
    },
    async ({ index, indices }) => textResult(await apiRequest('POST', `/reference/${index}/css/batch`, { indices })),
  );

  server.tool(
    'list_reference_regex',
    MCP_TOOL_DESCRIPTIONS['list_reference_regex'],
    {
      index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    },
    async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/regex`)),
  );

  server.tool(
    'read_reference_regex',
    MCP_TOOL_DESCRIPTIONS['read_reference_regex'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      entryIndex: z.number().describe('정규식 항목 인덱스 (list_reference_regex 결과 참조)'),
    },
    async ({ index, entryIndex }) => textResult(await apiRequest('GET', `/reference/${index}/regex/${entryIndex}`)),
  );

  server.tool(
    'read_reference_regex_batch',
    MCP_TOOL_DESCRIPTIONS['read_reference_regex_batch'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      indices: z.array(z.number()).max(50).describe('읽을 정규식 항목 인덱스 배열 (최대 50개)'),
    },
    async ({ index, indices }) => textResult(await apiRequest('POST', `/reference/${index}/regex/batch`, { indices })),
  );

  server.tool(
    'list_reference_risup_prompt_items',
    MCP_TOOL_DESCRIPTIONS['list_reference_risup_prompt_items'],
    {
      index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    },
    async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/risup/prompt-items`)),
  );

  server.tool(
    'read_reference_risup_prompt_item',
    MCP_TOOL_DESCRIPTIONS['read_reference_risup_prompt_item'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      itemIndex: z.number().describe('prompt item 인덱스 (list_reference_risup_prompt_items 결과 참조)'),
    },
    async ({ index, itemIndex }) =>
      textResult(await apiRequest('GET', `/reference/${index}/risup/prompt-item/${itemIndex}`)),
  );

  server.tool(
    'read_reference_risup_prompt_item_batch',
    MCP_TOOL_DESCRIPTIONS['read_reference_risup_prompt_item_batch'],
    {
      index: z.number().describe('참고 파일 인덱스'),
      indices: z.array(z.number()).max(50).describe('읽을 prompt item 인덱스 배열 (최대 50개)'),
    },
    async ({ index, indices }) =>
      textResult(await apiRequest('POST', `/reference/${index}/risup/prompt-items/batch`, { indices })),
  );

  server.tool(
    'read_reference_risup_formating_order',
    MCP_TOOL_DESCRIPTIONS['read_reference_risup_formating_order'],
    {
      index: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
    },
    async ({ index }) => textResult(await apiRequest('GET', `/reference/${index}/risup/formating-order`)),
  );

  // ===== Risum Asset Tools =====

  server.tool('list_risum_assets', MCP_TOOL_DESCRIPTIONS['list_risum_assets'], {}, async () =>
    textResult(await apiRequest('GET', '/risum-assets')),
  );

  server.tool(
    'read_risum_asset',
    MCP_TOOL_DESCRIPTIONS['read_risum_asset'],
    { index: z.number().describe('에셋 인덱스 (list_risum_assets 결과 참조)') },
    async ({ index }) => textResult(await apiRequest('GET', `/risum-asset/${index}`)),
  );

  server.tool(
    'add_risum_asset',
    MCP_TOOL_DESCRIPTIONS['add_risum_asset'],
    {
      name: z.string().describe('에셋 이름'),
      path: z.string().optional().describe('에셋 경로 (선택사항)'),
      base64: z.string().describe('base64 인코딩된 에셋 데이터'),
    },
    async ({ name, path: assetPath, base64 }) =>
      textResult(await apiRequest('POST', '/risum-asset/add', { name, path: assetPath || '', base64 })),
  );

  server.tool(
    'delete_risum_asset',
    MCP_TOOL_DESCRIPTIONS['delete_risum_asset'],
    {
      index: z.number().describe('삭제할 에셋 인덱스'),
      expected_path: z
        .string()
        .optional()
        .describe('선택사항: list_risum_assets/read_risum_asset에서 본 현재 path와 다르면 409 반환'),
    },
    async ({ index, expected_path }) =>
      textResult(await apiRequest('POST', `/risum-asset/${index}/delete`, { expected_path })),
  );

  // ===== Charx Asset Tools =====

  server.tool('list_charx_assets', MCP_TOOL_DESCRIPTIONS['list_charx_assets'], {}, async () =>
    textResult(await apiRequest('GET', '/assets')),
  );

  server.tool(
    'read_charx_asset',
    MCP_TOOL_DESCRIPTIONS['read_charx_asset'],
    { index: z.number().describe('에셋 인덱스 (list_charx_assets 결과 참조)') },
    async ({ index }) => textResult(await apiRequest('GET', `/asset/${index}`)),
  );

  server.tool(
    'add_charx_asset',
    MCP_TOOL_DESCRIPTIONS['add_charx_asset'],
    {
      fileName: z.string().describe('파일명 (예: character.png)'),
      base64: z.string().describe('base64 인코딩된 에셋 데이터'),
      folder: z.enum(['icon', 'other']).optional().describe('폴더: "icon" 또는 "other"(기본)'),
    },
    async ({ fileName, base64, folder }) =>
      textResult(await apiRequest('POST', '/asset/add', { fileName, base64, folder: folder || 'other' })),
  );

  server.tool(
    'delete_charx_asset',
    MCP_TOOL_DESCRIPTIONS['delete_charx_asset'],
    {
      index: z.number().describe('삭제할 에셋 인덱스'),
      expected_path: z
        .string()
        .optional()
        .describe('선택사항: list_charx_assets/read_charx_asset에서 본 현재 path와 다르면 409 반환'),
    },
    async ({ index, expected_path }) =>
      textResult(await apiRequest('POST', `/asset/${index}/delete`, { expected_path })),
  );

  server.tool(
    'rename_charx_asset',
    MCP_TOOL_DESCRIPTIONS['rename_charx_asset'],
    {
      index: z.number().describe('에셋 인덱스 (list_charx_assets 결과 참조)'),
      newName: z.string().describe('새 파일명 (확장자 포함, 예: new_name.png)'),
      expected_path: z
        .string()
        .optional()
        .describe('선택사항: list_charx_assets/read_charx_asset에서 본 현재 path와 다르면 409 반환'),
    },
    async ({ index, newName, expected_path }) =>
      textResult(await apiRequest('POST', `/asset/${index}/rename`, { newName, expected_path })),
  );

  // ===== Asset Compression =====

  server.tool(
    'compress_assets_webp',
    MCP_TOOL_DESCRIPTIONS['compress_assets_webp'],
    {
      asset_family: z.enum(['charx', 'risum']).optional().describe('압축할 에셋 종류 (기본: charx)'),
      quality: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe('WebP 품질 (0-100, 기본: 80). 높을수록 화질 좋지만 파일 큼'),
      recompress_webp: z.boolean().optional().describe('이미 WebP인 파일도 재압축할지 (기본: false)'),
      dry_run: z.boolean().optional().describe('true면 실제 압축 없이 변환 후보 preview만 반환'),
    },
    async ({ asset_family, quality, recompress_webp, dry_run }) => {
      const body: Record<string, unknown> = {};
      if (asset_family !== undefined) body.asset_family = asset_family;
      if (quality !== undefined) body.quality = quality;
      if (recompress_webp !== undefined) body.recompressWebp = recompress_webp;
      if (dry_run !== undefined) body.dry_run = dry_run;
      return textResult(await apiRequest('POST', '/assets/compress-webp', body));
    },
  );

  // ===== Lorebook Export/Import =====

  server.tool(
    'export_lorebook_to_files',
    MCP_TOOL_DESCRIPTIONS['export_lorebook_to_files'],
    {
      target_dir: z.string().describe('내보낼 디렉토리 경로 (절대 경로 권장)'),
      format: z
        .enum(['md', 'json'])
        .optional()
        .describe('내보내기 형식 (기본: md). md=항목당 개별 파일, json=단일 파일'),
      group_by_folder: z.boolean().optional().describe('폴더별로 하위 디렉토리 생성 (기본: true, md 형식만 해당)'),
      filter: z.string().optional().describe('comment/key 검색 필터 (선택)'),
      folder: z.string().optional().describe('특정 폴더만 내보내기 (folder UUID)'),
    },
    async ({ target_dir, format, group_by_folder, filter, folder }) => {
      const body: Record<string, unknown> = { target_dir };
      if (format) body.format = format;
      if (group_by_folder !== undefined) body.group_by_folder = group_by_folder;
      if (filter) body.filter = filter;
      if (folder) body.folder = folder;
      return textResult(await apiRequest('POST', '/lorebook/export', body));
    },
  );

  server.tool(
    'import_lorebook_from_files',
    MCP_TOOL_DESCRIPTIONS['import_lorebook_from_files'],
    {
      source_dir: z.string().optional().describe('MD 형식 소스 디렉토리 (md 형식일 때 필수)'),
      source_path: z.string().optional().describe('JSON 파일 경로 (json 형식일 때 필수)'),
      format: z.enum(['md', 'json']).optional().describe('가져오기 형식 (기본: md)'),
      create_folders: z.boolean().optional().describe('디렉토리 구조에서 로어북 폴더 자동 생성 (기본: true)'),
      conflict: z
        .enum(['skip', 'overwrite', 'rename'])
        .optional()
        .describe('동일 comment 충돌 시 처리 (기본: skip). skip=건너뛰기, overwrite=덮어쓰기, rename=이름 변경'),
      dry_run: z.boolean().optional().describe('미리보기만 (변경 없이 결과 확인, 기본: false)'),
    },
    async ({ source_dir, source_path, format, create_folders, conflict, dry_run }) => {
      const body: Record<string, unknown> = {};
      if (source_dir) body.source_dir = source_dir;
      if (source_path) body.source_path = source_path;
      if (format) body.format = format;
      if (create_folders !== undefined) body.create_folders = create_folders;
      if (conflict) body.conflict = conflict;
      if (dry_run !== undefined) body.dry_run = dry_run;
      return textResult(await apiRequest('POST', '/lorebook/import', body));
    },
  );

  server.tool(
    'export_field_to_file',
    MCP_TOOL_DESCRIPTIONS['export_field_to_file'],
    {
      field: z.string().describe('내보낼 필드 이름 (예: description, globalNote, firstMessage)'),
      file_path: z.string().describe('저장할 파일 경로 (절대 경로 권장)'),
      format: z.enum(['md', 'txt']).optional().describe('파일 형식 (기본: txt). md=마크다운 헤더 포함'),
    },
    async ({ field, file_path, format }) => {
      const body: Record<string, unknown> = { field, file_path };
      if (format) body.format = format;
      return textResult(await apiRequest('POST', '/field/export', body));
    },
  );

  // ===== Folder Workspace Tools =====

  server.tool(
    'extract_charx_to_project_folder',
    MCP_TOOL_DESCRIPTIONS['extract_charx_to_project_folder'],
    {
      file_path: z.string().describe('추출할 .charx/.risum/.risup 파일 경로. 절대 경로 권장.'),
      project_path: z
        .string()
        .optional()
        .describe('출력 프로젝트 폴더 경로. 생략하면 원본 파일 옆에 {파일명}_{확장자} 폴더를 만듭니다.'),
    },
    safeToolHandler('extract_charx_to_project_folder', async ({ file_path, project_path }) => {
      const sourcePath = path.resolve(file_path);
      if (!fs.existsSync(sourcePath)) {
        return textResult({
          [API_ERROR_KEY]: true,
          status: 400,
          error: `File not found: ${sourcePath}`,
          suggestion: 'session_status 또는 inspect_external_file로 현재 파일 경로를 확인한 뒤 다시 시도하세요.',
          retryable: false,
          next_actions: ['session_status', 'inspect_external_file'],
        });
      }
      const sourceExt = path.extname(sourcePath).toLowerCase();
      if (!['.charx', '.risum', '.risup'].includes(sourceExt)) {
        return textResult({
          [API_ERROR_KEY]: true,
          status: 400,
          error: 'extract_charx_to_project_folder only supports .charx, .risum, and .risup files.',
          suggestion: '프로젝트 폴더로 추출할 수 있는 RisuAI 문서 파일을 지정하세요.',
          retryable: false,
          next_actions: ['inspect_external_file'],
        });
      }
      const targetPath = path.resolve(project_path || defaultProjectFolderForDocument(sourcePath));
      extractDocumentToProject(sourcePath, targetPath);
      const treeSummary = summarizeProjectTree(targetPath);
      const sourceType = sourceExt.slice(1);
      return textResult(
        mcpSuccess(
          {
            success: true,
            filePath: sourcePath,
            fileType: sourceType,
            projectPath: targetPath,
            treeSummary,
            workflow:
              'Use structured editor/MCP surfaces when possible; raw project files are an advanced fallback. Reassemble this projectPath when an exported file is needed.',
          },
          {
            toolName: 'extract_charx_to_project_folder',
            summary: `Extracted .${sourceType} into project folder with ${treeSummary.files} files`,
            nextActions: ['reassemble_project_folder_to_charx', 'session_status'],
            artifacts: {
              byte_size: 0,
              project_path: targetPath,
              file_count: treeSummary.files,
              directory_count: treeSummary.directories,
            },
          },
        ),
      );
    }),
  );

  server.tool(
    'reassemble_project_folder_to_charx',
    MCP_TOOL_DESCRIPTIONS['reassemble_project_folder_to_charx'],
    {
      project_path: z.string().describe('card.json/module.json/preset.json 중 하나가 들어 있는 프로젝트 폴더 경로.'),
      output_path: z.string().describe('생성할 .charx/.risum/.risup 파일 경로. 기존 파일을 덮어쓸 수 있습니다.'),
    },
    safeToolHandler('reassemble_project_folder_to_charx', async ({ project_path, output_path }) => {
      const projectPath = path.resolve(project_path);
      const outputPath = path.resolve(output_path);
      if (!fs.existsSync(projectPath)) {
        return textResult({
          [API_ERROR_KEY]: true,
          status: 400,
          error: `Project folder not found: ${projectPath}`,
          suggestion: 'extract_charx_to_project_folder로 먼저 프로젝트 폴더를 만들거나 project_path를 확인하세요.',
          retryable: false,
          next_actions: ['extract_charx_to_project_folder'],
        });
      }
      const projectFileType = getProjectFileType(projectPath);
      reassembleProjectDocument(projectPath, outputPath);
      const stat = fs.statSync(outputPath);
      return textResult(
        mcpSuccess(
          {
            success: true,
            fileType: projectFileType,
            projectPath,
            outputPath,
            sizeBytes: stat.size,
          },
          {
            toolName: 'reassemble_project_folder_to_charx',
            summary: `Reassembled project folder into .${projectFileType} (${stat.size} bytes)`,
            nextActions: ['inspect_external_file', 'open_file', 'validate_content'],
            artifacts: {
              byte_size: stat.size,
              project_path: projectPath,
              output_path: outputPath,
            },
          },
        ),
      );
    }),
  );

  // ===== Skill Tools =====

  server.tool(
    'list_skills',
    MCP_TOOL_DESCRIPTIONS['list_skills'],
    {
      scopes: z
        .array(z.enum(['product', 'common', 'bot', 'prompts', 'modules', 'plugins']))
        .max(6)
        .optional(),
      query: z.string().max(200).optional(),
      detail: z.enum(['summary', 'full']).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      cursor: z.string().max(200).optional(),
    },
    async ({ scopes, query, detail, limit, cursor }) => {
      const params = new URLSearchParams();
      for (const scope of scopes ?? []) params.append('scope', scope);
      if (query) params.set('query', query);
      if (detail) params.set('detail', detail);
      if (limit !== undefined) params.set('limit', String(limit));
      if (cursor) params.set('cursor', cursor);
      const queryString = params.toString();
      return textResult(await apiRequest('GET', `/skills${queryString ? `?${queryString}` : ''}`));
    },
  );

  server.tool(
    'read_skill',
    MCP_TOOL_DESCRIPTIONS['read_skill'],
    {
      name: z.string().describe('스킬 이름 (예: writing-lua-scripts, authoring-characters)'),
      file: z.string().optional().describe('읽을 파일명 (기본: SKILL.md). list_skills에서 확인한 파일명 사용.'),
      cursor: z.string().max(200).optional().describe('이전 응답의 불투명 next_cursor.'),
      max_bytes: z
        .number()
        .int()
        .min(1)
        .max(64 * 1024)
        .optional()
        .describe('UTF-8 응답 바이트 상한 (최대 64KB).'),
    },
    async ({ name, file, cursor, max_bytes }) => {
      const filePart = file ? encodeURIComponent(file) : '';
      const basePath = filePart
        ? `/skills/${encodeURIComponent(name)}/${filePart}`
        : `/skills/${encodeURIComponent(name)}`;
      const params = new URLSearchParams();
      params.set('max_bytes', String(max_bytes ?? 64 * 1024));
      if (cursor) params.set('cursor', cursor);
      const skillPath = `${basePath}?${params.toString()}`;
      return textResult(await apiRequest('GET', skillPath));
    },
  );
}
