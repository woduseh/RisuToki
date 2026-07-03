import { z } from 'zod';

import { isApiError } from './mcp-facade-runtime';
import { MCP_TOOL_DESCRIPTIONS } from './mcp-tool-descriptions';
import type { McpToolRegistrationDeps, McpToolServer, SafeToolHandler } from './mcp-tool-registration';

interface FieldToolRegistrationDeps extends McpToolRegistrationDeps {
  safeToolHandler: SafeToolHandler;
  withMergedRuntimeMetadata: (session: unknown) => unknown;
}

export function registerFieldTools(server: McpToolServer, deps: FieldToolRegistrationDeps): void {
  const { apiRequest, safeToolHandler, textResult, withMergedRuntimeMetadata } = deps;

  // ===== Field Tools =====

  server.tool('list_fields', MCP_TOOL_DESCRIPTIONS['list_fields'], {}, async () =>
    textResult(await apiRequest('GET', '/fields')),
  );

  server.tool(
    'read_field',
    MCP_TOOL_DESCRIPTIONS['read_field'],
    { field: z.string().describe('필드 이름') },
    async ({ field }) => textResult(await apiRequest('GET', `/field/${encodeURIComponent(field)}`)),
  );

  server.tool(
    'write_field',
    MCP_TOOL_DESCRIPTIONS['write_field'],
    {
      field: z.string().describe('필드 이름'),
      content: z
        .union([z.string(), z.array(z.string()), z.boolean(), z.number()])
        .describe(
          '새로운 내용. alternateGreetings는 문자열 배열, triggerScripts는 JSON 문자열, boolean 필드는 boolean, number 필드는 number, 나머지는 문자열. 비권장/예약/레거시 필드는 수정할 수 없습니다.',
        ),
    },
    safeToolHandler('write_field', async ({ field, content }) =>
      textResult(await apiRequest('POST', `/field/${encodeURIComponent(String(field))}`, { content })),
    ),
  );

  server.tool(
    'read_field_batch',
    MCP_TOOL_DESCRIPTIONS['read_field_batch'],
    {
      fields: z
        .array(z.string())
        .max(20)
        .describe('읽을 필드 이름 배열 (예: ["personality", "scenario", "globalNote", "systemPrompt"])'),
    },
    async ({ fields }) => textResult(await apiRequest('POST', '/field/batch', { fields })),
  );

  // ===== External File Probe Tools =====

  server.tool(
    'probe_field',
    MCP_TOOL_DESCRIPTIONS['probe_field'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      field: z.string().describe('읽을 필드 이름'),
    },
    async ({ file_path, field }) =>
      textResult(await apiRequest('POST', `/probe/field/${encodeURIComponent(field)}`, { file_path })),
  );

  server.tool(
    'probe_field_batch',
    MCP_TOOL_DESCRIPTIONS['probe_field_batch'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      fields: z.array(z.string()).max(20).describe('읽을 필드 이름 배열 (최대 20개)'),
    },
    async ({ file_path, fields }) => textResult(await apiRequest('POST', '/probe/field/batch', { file_path, fields })),
  );

  server.tool(
    'probe_lorebook',
    MCP_TOOL_DESCRIPTIONS['probe_lorebook'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      filter: z.string().optional().describe('검색 키워드 (comment, key에서 검색). 생략 시 전체 목록 반환'),
      folder: z.string().optional().describe('폴더 UUID로 필터 (예: "folder:xxxx" 또는 UUID만). 생략 시 전체 반환'),
      content_filter: z.string().optional().describe('본문(content) 검색 키워드. 대소문자 무시. filter와 AND 결합'),
      content_filter_not: z.string().optional().describe('본문(content)에 이 키워드가 없는 항목만 필터. 대소문자 무시'),
      preview_length: z.number().optional().describe('content 미리보기 길이 (기본 150, 0=비활성, 최대 500)'),
    },
    async ({ file_path, filter, folder, content_filter, content_filter_not, preview_length }) => {
      const params = new URLSearchParams();
      if (filter) params.set('filter', filter);
      if (folder) params.set('folder', folder);
      if (content_filter) params.set('content_filter', content_filter);
      if (content_filter_not) params.set('content_filter_not', content_filter_not);
      if (preview_length !== undefined) params.set('preview_length', String(preview_length));
      const qs = params.toString();
      return textResult(await apiRequest('POST', qs ? `/probe/lorebook?${qs}` : '/probe/lorebook', { file_path }));
    },
  );

  server.tool(
    'probe_regex',
    MCP_TOOL_DESCRIPTIONS['probe_regex'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    },
    async ({ file_path }) => textResult(await apiRequest('POST', '/probe/regex', { file_path })),
  );

  server.tool(
    'probe_lua',
    MCP_TOOL_DESCRIPTIONS['probe_lua'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    },
    async ({ file_path }) => textResult(await apiRequest('POST', '/probe/lua', { file_path })),
  );

  server.tool(
    'probe_css',
    MCP_TOOL_DESCRIPTIONS['probe_css'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    },
    async ({ file_path }) => textResult(await apiRequest('POST', '/probe/css', { file_path })),
  );

  server.tool(
    'probe_greetings',
    MCP_TOOL_DESCRIPTIONS['probe_greetings'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      type: z.enum(['alternate', 'groupOnly']).describe('greeting 종류'),
      filter: z.string().optional().describe('미리보기 텍스트 필터'),
      content_filter: z.string().optional().describe('본문(content) 검색 필터'),
    },
    async ({ file_path, type, filter, content_filter }) => {
      const params = new URLSearchParams();
      if (filter) params.set('filter', filter);
      if (content_filter) params.set('content_filter', content_filter);
      const qs = params.toString();
      return textResult(
        await apiRequest(
          'POST',
          qs ? `/probe/greetings/${encodeURIComponent(type)}?${qs}` : `/probe/greetings/${encodeURIComponent(type)}`,
          {
            file_path,
          },
        ),
      );
    },
  );

  server.tool(
    'probe_triggers',
    MCP_TOOL_DESCRIPTIONS['probe_triggers'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    },
    async ({ file_path }) => textResult(await apiRequest('POST', '/probe/triggers', { file_path })),
  );

  server.tool(
    'probe_risup_prompt_items',
    MCP_TOOL_DESCRIPTIONS['probe_risup_prompt_items'],
    {
      file_path: z.string().describe('대상 .risup 파일의 절대 경로'),
    },
    async ({ file_path }) => textResult(await apiRequest('POST', '/probe/risup/prompt-items', { file_path })),
  );

  server.tool(
    'probe_risup_formating_order',
    MCP_TOOL_DESCRIPTIONS['probe_risup_formating_order'],
    {
      file_path: z.string().describe('대상 .risup 파일의 절대 경로'),
    },
    async ({ file_path }) => textResult(await apiRequest('POST', '/probe/risup/formating-order', { file_path })),
  );

  server.tool(
    'inspect_external_file',
    MCP_TOOL_DESCRIPTIONS['inspect_external_file'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
    },
    async ({ file_path }) => textResult(await apiRequest('POST', '/external/inspect', { file_path })),
  );

  server.tool(
    'external_write_field',
    MCP_TOOL_DESCRIPTIONS['external_write_field'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      field: z.string().describe('수정할 필드 이름'),
      content: z
        .union([z.string(), z.array(z.unknown()), z.boolean(), z.number()])
        .describe('새 값. 문자열/배열/boolean/number를 허용하며 구조화 표면은 JSON 배열 형태를 사용합니다.'),
    },
    async ({ file_path, field, content }) =>
      textResult(await apiRequest('POST', `/external/field/${encodeURIComponent(field)}`, { file_path, content })),
  );

  server.tool(
    'external_write_field_batch',
    MCP_TOOL_DESCRIPTIONS['external_write_field_batch'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      entries: z
        .array(z.object({ field: z.string(), content: z.unknown() }))
        .max(20)
        .describe('수정할 항목 배열 [{ field, content }]'),
    },
    async ({ file_path, entries }) =>
      textResult(await apiRequest('POST', '/external/field/batch-write', { file_path, entries })),
  );

  server.tool(
    'external_search_in_field',
    MCP_TOOL_DESCRIPTIONS['external_search_in_field'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      field: z.string().describe('검색할 문자열 필드 이름'),
      query: z.string().describe('검색할 문자열 또는 정규식 패턴'),
      context_chars: z.number().optional().describe('매치 전후에 표시할 문자 수 (기본: 100, 최대: 500)'),
      regex: z.boolean().optional().describe('정규식 모드 여부'),
      flags: z.string().optional().describe('정규식 플래그'),
      max_matches: z.number().optional().describe('최대 반환 매치 수 (기본: 20, 최대: 100)'),
    },
    async ({ file_path, field, query, context_chars, regex, flags, max_matches }) =>
      textResult(
        await apiRequest('POST', `/external/field/${encodeURIComponent(field)}/search`, {
          file_path,
          query,
          context_chars,
          regex,
          flags,
          max_matches,
        }),
      ),
  );

  server.tool(
    'external_read_field_range',
    MCP_TOOL_DESCRIPTIONS['external_read_field_range'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      field: z.string().describe('읽을 문자열 필드 이름'),
      offset: z.number().optional().describe('시작 오프셋 (기본: 0)'),
      length: z.number().optional().describe('읽을 길이 (기본: 2000, 최대: 10000)'),
    },
    async ({ file_path, field, offset, length }) =>
      textResult(
        await apiRequest('POST', `/external/field/${encodeURIComponent(field)}/range`, { file_path, offset, length }),
      ),
  );

  server.tool(
    'external_replace_in_field',
    MCP_TOOL_DESCRIPTIONS['external_replace_in_field'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      field: z.string().describe('치환할 문자열 필드 이름'),
      find: z.string().describe('찾을 문자열 또는 정규식 패턴'),
      replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
      regex: z.boolean().optional().describe('정규식 모드 여부'),
      flags: z.string().optional().describe('정규식 플래그'),
      dry_run: z.boolean().optional().describe('true이면 실제 저장 없이 매치 결과만 반환'),
    },
    async ({ file_path, field, find, replace, regex, flags, dry_run }) =>
      textResult(
        await apiRequest('POST', `/external/field/${encodeURIComponent(field)}/replace`, {
          file_path,
          find,
          replace,
          regex,
          flags,
          dry_run,
        }),
      ),
  );

  server.tool(
    'external_insert_in_field',
    MCP_TOOL_DESCRIPTIONS['external_insert_in_field'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      field: z.string().describe('삽입할 문자열 필드 이름'),
      content: z.string().describe('삽입할 텍스트'),
      position: z.enum(['end', 'start', 'after', 'before']).optional().describe('삽입 위치'),
      anchor: z.string().optional().describe('position이 after/before일 때 기준 문자열'),
    },
    async ({ file_path, field, content, position, anchor }) =>
      textResult(
        await apiRequest('POST', `/external/field/${encodeURIComponent(field)}/insert`, {
          file_path,
          content,
          position,
          anchor,
        }),
      ),
  );

  server.tool(
    'open_file',
    MCP_TOOL_DESCRIPTIONS['open_file'],
    {
      file_path: z.string().describe('열 대상 .charx/.risum/.risup 파일의 절대 경로'),
      save_current: z
        .boolean()
        .optional()
        .describe(
          'true면 현재 문서에 변경사항이 있을 때 먼저 저장을 시도합니다. 생략 시 기존 저장/폐기/취소 확인 흐름을 따릅니다.',
        ),
    },
    async ({ file_path, save_current }) =>
      textResult(await apiRequest('POST', '/open-file', { file_path, save_current })),
  );

  server.tool(
    'save_current_file',
    MCP_TOOL_DESCRIPTIONS['save_current_file'],
    {},
    safeToolHandler('save_current_file', async () => textResult(await apiRequest('POST', '/document/save', {}))),
  );

  server.tool('list_surfaces', MCP_TOOL_DESCRIPTIONS['list_surfaces'], {}, async () =>
    textResult(await apiRequest('GET', '/surfaces')),
  );

  server.tool(
    'read_surface',
    MCP_TOOL_DESCRIPTIONS['read_surface'],
    {
      path: z.string().optional().describe('JSON Pointer path. 생략 또는 빈 문자열이면 전체 문서 root를 읽습니다.'),
    },
    async ({ path }) => textResult(await apiRequest('POST', '/surface/read', { path })),
  );

  server.tool(
    'patch_surface',
    MCP_TOOL_DESCRIPTIONS['patch_surface'],
    {
      operations: z
        .array(
          z.object({
            op: z.enum(['add', 'replace', 'remove']).describe('JSON Patch operation'),
            path: z.string().describe('JSON Pointer path'),
            value: z.unknown().optional().describe('add/replace에서 쓸 값'),
          }),
        )
        .min(1)
        .max(100)
        .describe('JSON Patch operation 배열'),
      expected_hash: z.string().optional().describe('선택: 전체 현재 문서 hash. 다르면 409로 중단됩니다.'),
      dry_run: z.boolean().optional().describe('true이면 실제 적용 없이 변경 요약과 hash만 반환합니다.'),
    },
    async ({ operations, expected_hash, dry_run }) =>
      textResult(await apiRequest('POST', '/surface/patch', { operations, expected_hash, dry_run })),
  );

  server.tool(
    'replace_in_surface',
    MCP_TOOL_DESCRIPTIONS['replace_in_surface'],
    {
      path: z.string().describe('JSON Pointer path. 예: "/regex/0", "/lorebook/3/content"'),
      find: z.string().describe('찾을 문자열 또는 regex 패턴'),
      replace: z.string().optional().describe('바꿀 문자열. 생략 시 빈 문자열'),
      regex: z.boolean().optional().describe('정규식 모드 여부'),
      flags: z.string().optional().describe('정규식 flags'),
      expected_hash: z.string().optional().describe('선택: 전체 현재 문서 hash. 다르면 409로 중단됩니다.'),
      dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 매치 수만 반환합니다.'),
    },
    async ({ path, find, replace, regex, flags, expected_hash, dry_run }) =>
      textResult(
        await apiRequest('POST', '/surface/replace', { path, find, replace, regex, flags, expected_hash, dry_run }),
      ),
  );

  server.tool(
    'external_read_surface',
    MCP_TOOL_DESCRIPTIONS['external_read_surface'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      path: z.string().optional().describe('JSON Pointer path. 생략 또는 빈 문자열이면 전체 문서 root를 읽습니다.'),
    },
    async ({ file_path, path }) => textResult(await apiRequest('POST', '/external/surface/read', { file_path, path })),
  );

  server.tool(
    'external_patch_surface',
    MCP_TOOL_DESCRIPTIONS['external_patch_surface'],
    {
      file_path: z.string().describe('대상 .charx/.risum/.risup 파일의 절대 경로'),
      operations: z
        .array(
          z.object({
            op: z.enum(['add', 'replace', 'remove']).describe('JSON Patch operation'),
            path: z.string().describe('JSON Pointer path'),
            value: z.unknown().optional().describe('add/replace에서 쓸 값'),
          }),
        )
        .min(1)
        .max(100)
        .describe('JSON Patch operation 배열'),
      expected_hash: z.string().optional().describe('선택: 전체 외부 문서 hash. 다르면 409로 중단됩니다.'),
      dry_run: z.boolean().optional().describe('true이면 실제 저장 없이 변경 요약과 hash만 반환합니다.'),
    },
    async ({ file_path, operations, expected_hash, dry_run }) =>
      textResult(
        await apiRequest('POST', '/external/surface/patch', { file_path, operations, expected_hash, dry_run }),
      ),
  );

  server.tool(
    'replace_in_field',
    MCP_TOOL_DESCRIPTIONS['replace_in_field'],
    {
      field: z.string().describe('필드 이름 (예: globalNote, description, defaultVariables, lua 등)'),
      find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
      replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
      regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
      flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
      dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 매치 수와 전후 컨텍스트만 반환 (기본: false)'),
    },
    async ({ field, find, replace, regex, flags, dry_run }) =>
      textResult(
        await apiRequest('POST', `/field/${encodeURIComponent(field)}/replace`, {
          find,
          replace,
          regex,
          flags,
          dry_run,
        }),
      ),
  );

  server.tool(
    'insert_in_field',
    MCP_TOOL_DESCRIPTIONS['insert_in_field'],
    {
      field: z.string().describe('필드 이름 (예: defaultVariables, globalNote, description, lua 등)'),
      content: z.string().describe('삽입할 텍스트'),
      position: z
        .enum(['end', 'start', 'after', 'before'])
        .optional()
        .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
      anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
    },
    async ({ field, content, position, anchor }) =>
      textResult(await apiRequest('POST', `/field/${encodeURIComponent(field)}/insert`, { content, position, anchor })),
  );

  server.tool(
    'replace_in_field_batch',
    MCP_TOOL_DESCRIPTIONS['replace_in_field_batch'],
    {
      field: z.string().describe('필드 이름 (예: firstMessage, globalNote, description 등)'),
      replacements: z
        .array(
          z.object({
            find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
            replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
            regex: z.boolean().optional().describe('정규식 모드 여부'),
            flags: z.string().optional().describe('정규식 플래그 (기본: "g")'),
          }),
        )
        .max(50)
        .describe('순차 적용할 치환 배열 [{find, replace, regex?, flags?}] (최대 50개)'),
      dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 매치 수만 반환 (기본: false)'),
    },
    async ({ field, replacements, dry_run }) =>
      textResult(
        await apiRequest('POST', `/field/${encodeURIComponent(field)}/batch-replace`, { replacements, dry_run }),
      ),
  );

  server.tool(
    'search_in_field',
    MCP_TOOL_DESCRIPTIONS['search_in_field'],
    {
      field: z.string().describe('필드 이름 (예: globalNote, firstMessage, description, lua 등)'),
      query: z.string().describe('검색할 문자열 (또는 regex: true일 때 정규식 패턴)'),
      context_chars: z.number().optional().describe('매치 전후에 표시할 문자 수 (기본: 100, 최대: 500)'),
      regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
      flags: z.string().optional().describe('정규식 플래그 (기본: "gi"). regex: true일 때만 사용'),
      max_matches: z.number().optional().describe('최대 반환 매치 수 (기본: 20, 최대: 100)'),
    },
    async ({ field, query, context_chars, regex, flags, max_matches }) =>
      textResult(
        await apiRequest('POST', `/field/${encodeURIComponent(field)}/search`, {
          query,
          context_chars,
          regex,
          flags,
          max_matches,
        }),
      ),
  );

  server.tool(
    'read_field_range',
    MCP_TOOL_DESCRIPTIONS['read_field_range'],
    {
      field: z.string().describe('필드 이름 (예: firstMessage, globalNote, description 등)'),
      offset: z.number().optional().describe('시작 문자 오프셋 (기본: 0)'),
      length: z.number().optional().describe('읽을 문자 수 (기본: 2000, 최대: 10000)'),
    },
    async ({ field, offset, length }) => {
      const params = new URLSearchParams();
      if (offset !== undefined) params.set('offset', String(offset));
      if (length !== undefined) params.set('length', String(length));
      const qs = params.toString();
      return textResult(await apiRequest('GET', `/field/${encodeURIComponent(field)}/range${qs ? `?${qs}` : ''}`));
    },
  );

  server.tool(
    'replace_block_in_field',
    MCP_TOOL_DESCRIPTIONS['replace_block_in_field'],
    {
      field: z.string().describe('필드 이름 (예: firstMessage, globalNote, description 등)'),
      start_anchor: z.string().describe('블록 시작 앵커 문자열 (멀티라인 가능)'),
      end_anchor: z.string().describe('블록 끝 앵커 문자열 (멀티라인 가능)'),
      content: z.string().optional().describe('새 블록 내용 (기본: 빈 문자열 = 블록 삭제)'),
      include_anchors: z.boolean().optional().describe('true(기본): 앵커 포함 전체 교체, false: 앵커 사이 내용만 교체'),
      dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 미리보기만 반환 (기본: false)'),
    },
    async ({ field, start_anchor, end_anchor, content, include_anchors, dry_run }) =>
      textResult(
        await apiRequest('POST', `/field/${encodeURIComponent(field)}/block-replace`, {
          start_anchor,
          end_anchor,
          content,
          include_anchors,
          dry_run,
        }),
      ),
  );

  server.tool(
    'write_field_batch',
    MCP_TOOL_DESCRIPTIONS['write_field_batch'],
    {
      entries: z
        .array(
          z.object({
            field: z.string().describe('필드 이름'),
            content: z.any().describe('새로운 내용 (문자열/boolean/number/배열 — 필드 타입에 맞게)'),
          }),
        )
        .max(20)
        .describe('수정할 필드 배열 [{field, content}, ...] (최대 20개)'),
    },
    safeToolHandler('write_field_batch', async ({ entries }) =>
      textResult(await apiRequest('POST', '/field/batch-write', { entries })),
    ),
  );

  server.tool(
    'snapshot_field',
    MCP_TOOL_DESCRIPTIONS['snapshot_field'],
    {
      field: z.string().describe('스냅샷을 저장할 필드 이름 (예: firstMessage, globalNote 등)'),
    },
    async ({ field }) => textResult(await apiRequest('POST', `/field/${encodeURIComponent(field)}/snapshot`)),
  );

  server.tool(
    'list_snapshots',
    MCP_TOOL_DESCRIPTIONS['list_snapshots'],
    {
      field: z.string().describe('스냅샷 목록을 확인할 필드 이름'),
    },
    async ({ field }) => textResult(await apiRequest('GET', `/field/${encodeURIComponent(field)}/snapshots`)),
  );

  server.tool('session_status', MCP_TOOL_DESCRIPTIONS['session_status'], {}, async () => {
    const session = await apiRequest('GET', '/session/status');
    return textResult(isApiError(session) ? session : withMergedRuntimeMetadata(session));
  });

  server.tool(
    'restore_snapshot',
    MCP_TOOL_DESCRIPTIONS['restore_snapshot'],
    {
      field: z.string().describe('복원할 필드 이름'),
      snapshot_id: z.string().describe('복원할 스냅샷 ID (list_snapshots 결과 참조)'),
    },
    async ({ field, snapshot_id }) =>
      textResult(await apiRequest('POST', `/field/${encodeURIComponent(field)}/restore`, { snapshot_id })),
  );

  server.tool(
    'get_field_stats',
    MCP_TOOL_DESCRIPTIONS['get_field_stats'],
    {
      field: z.string().describe('통계를 확인할 필드 이름'),
    },
    async ({ field }) => textResult(await apiRequest('GET', `/field/${encodeURIComponent(field)}/stats`)),
  );

  server.tool(
    'search_all_fields',
    MCP_TOOL_DESCRIPTIONS['search_all_fields'],
    {
      query: z.string().describe('검색할 문자열 (또는 regex: true일 때 정규식 패턴)'),
      regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
      flags: z.string().optional().describe('정규식 플래그 (기본: "gi"). regex: true일 때만 사용'),
      include_lorebook: z.boolean().optional().describe('로어북 content도 검색할지 (기본: true)'),
      include_greetings: z
        .boolean()
        .optional()
        .describe('alternateGreetings/groupOnlyGreetings도 검색할지 (기본: true)'),
      context_chars: z.number().optional().describe('매치 전후에 표시할 문자 수 (기본: 60, 최대: 300)'),
      max_matches_per_field: z.number().optional().describe('필드당 최대 반환 매치 수 (기본: 5, 최대: 20)'),
    },
    async ({ query, regex, flags, include_lorebook, include_greetings, context_chars, max_matches_per_field }) =>
      textResult(
        await apiRequest('POST', '/search-all', {
          query,
          regex,
          flags,
          include_lorebook,
          include_greetings,
          context_chars,
          max_matches_per_field,
        }),
      ),
  );
}
