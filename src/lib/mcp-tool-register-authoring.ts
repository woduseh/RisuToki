import { z } from 'zod';

import { MCP_TOOL_DESCRIPTIONS } from './mcp-tool-descriptions';
import type { McpToolRegistrationDeps, McpToolServer, SafeToolHandler } from './mcp-tool-registration';

interface AuthoringToolRegistrationDeps extends McpToolRegistrationDeps {
  safeToolHandler: SafeToolHandler;
}

export function registerAuthoringTools(server: McpToolServer, deps: AuthoringToolRegistrationDeps): void {
  const { apiRequest, safeToolHandler, textResult } = deps;

  // ===== Lorebook Tools =====

  server.tool(
    'list_lorebook',
    MCP_TOOL_DESCRIPTIONS['list_lorebook'],
    {
      filter: z.string().optional().describe('검색 키워드 (comment, key에서 검색). 생략 시 전체 목록 반환'),
      folder: z.string().optional().describe('폴더 UUID로 필터 (예: "folder:xxxx" 또는 UUID만). 생략 시 전체 반환'),
      content_filter: z.string().optional().describe('본문(content) 검색 키워드. 대소문자 무시. filter와 AND 결합'),
      content_filter_not: z.string().optional().describe('본문(content)에 이 키워드가 없는 항목만 필터. 대소문자 무시'),
      preview_length: z.number().optional().describe('content 미리보기 길이 (기본 150, 0=비활성, 최대 500)'),
    },
    async ({ filter, folder, content_filter, content_filter_not, preview_length }) => {
      const params = new URLSearchParams();
      if (filter) params.set('filter', filter);
      if (folder) params.set('folder', folder);
      if (content_filter) params.set('content_filter', content_filter);
      if (content_filter_not) params.set('content_filter_not', content_filter_not);
      if (preview_length !== undefined) params.set('preview_length', String(preview_length));
      const qs = params.toString();
      return textResult(await apiRequest('GET', qs ? `/lorebook?${qs}` : '/lorebook'));
    },
  );

  server.tool(
    'read_lorebook',
    MCP_TOOL_DESCRIPTIONS['read_lorebook'],
    { index: z.number().describe('로어북 항목 인덱스') },
    async ({ index }) => textResult(await apiRequest('GET', `/lorebook/${index}`)),
  );

  server.tool(
    'read_lorebook_batch',
    MCP_TOOL_DESCRIPTIONS['read_lorebook_batch'],
    {
      indices: z.array(z.number()).max(50).describe('읽을 로어북 항목 인덱스 배열 (최대 50개)'),
      fields: z
        .array(z.string())
        .optional()
        .describe('반환할 필드 목록 (예: ["content", "comment"]). 미지정 시 전체 필드 반환'),
    },
    async ({ indices, fields }) => textResult(await apiRequest('POST', '/lorebook/batch', { indices, fields })),
  );

  server.tool(
    'read_lorebook_by_id',
    MCP_TOOL_DESCRIPTIONS['read_lorebook_by_id'],
    { id: z.string().min(1).describe('list_lorebook 응답의 id') },
    async ({ id }) => textResult(await apiRequest('GET', `/lorebook/by-id/${encodeURIComponent(id)}`)),
  );

  server.tool(
    'write_lorebook_batch',
    MCP_TOOL_DESCRIPTIONS['write_lorebook_batch'],
    {
      entries: z
        .array(
          z.object({
            index: z.number().describe('로어북 항목 인덱스'),
            data: z.record(z.string(), z.unknown()).describe('수정할 데이터'),
            expected_comment: z
              .string()
              .optional()
              .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
          }),
        )
        .max(50)
        .describe('수정할 항목 배열 [{index, data}, ...] (최대 50개)'),
    },
    safeToolHandler('write_lorebook_batch', async ({ entries }) =>
      textResult(await apiRequest('POST', '/lorebook/batch-write', { entries })),
    ),
  );

  server.tool(
    'write_lorebook_by_id_batch',
    MCP_TOOL_DESCRIPTIONS['write_lorebook_by_id_batch'],
    {
      entries: z
        .array(
          z.object({
            id: z.string().min(1),
            data: z.record(z.string(), z.unknown()),
            expected_comment: z.string().optional(),
          }),
        )
        .max(50),
    },
    async ({ entries }) => textResult(await apiRequest('POST', '/lorebook/batch-write-by-id', { entries })),
  );

  server.tool(
    'diff_lorebook',
    MCP_TOOL_DESCRIPTIONS['diff_lorebook'],
    {
      index: z.number().describe('현재 파일의 로어북 항목 인덱스'),
      refIndex: z.number().describe('참고 파일 인덱스 (list_references 결과 참조)'),
      refEntryIndex: z.number().describe('참고 파일의 로어북 항목 인덱스'),
    },
    async ({ index, refIndex, refEntryIndex }) =>
      textResult(await apiRequest('POST', '/lorebook/diff', { index, refIndex, refEntryIndex })),
  );

  server.tool('validate_lorebook_keys', MCP_TOOL_DESCRIPTIONS['validate_lorebook_keys'], {}, async () =>
    textResult(await apiRequest('GET', '/lorebook/validate')),
  );

  server.tool(
    'clone_lorebook',
    MCP_TOOL_DESCRIPTIONS['clone_lorebook'],
    {
      index: z.number().describe('복제할 원본 로어북 항목 인덱스'),
      expected_comment: z
        .string()
        .optional()
        .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
      overrides: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('복제본에 적용할 필드 오버라이드 (예: {comment: "새이름", key: "새키"})'),
    },
    async ({ index, expected_comment, overrides }) =>
      textResult(await apiRequest('POST', '/lorebook/clone', { index, expected_comment, overrides })),
  );

  server.tool(
    'write_lorebook',
    MCP_TOOL_DESCRIPTIONS['write_lorebook'],
    {
      index: z.number().describe('로어북 항목 인덱스'),
      data: z.record(z.string(), z.unknown()).describe('수정할 로어북 데이터 (부분 또는 전체)'),
      expected_comment: z
        .string()
        .optional()
        .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
    },
    async ({ index, data, expected_comment }) =>
      textResult(
        await apiRequest('POST', `/lorebook/${index}`, { ...(data as Record<string, unknown>), expected_comment }),
      ),
  );

  server.tool(
    'write_lorebook_by_id',
    MCP_TOOL_DESCRIPTIONS['write_lorebook_by_id'],
    {
      id: z.string().min(1),
      data: z.record(z.string(), z.unknown()),
      expected_comment: z.string().optional(),
    },
    async ({ id, data, expected_comment }) =>
      textResult(await apiRequest('POST', `/lorebook/by-id/${encodeURIComponent(id)}`, { data, expected_comment })),
  );

  server.tool(
    'add_lorebook',
    MCP_TOOL_DESCRIPTIONS['add_lorebook'],
    { data: z.record(z.string(), z.unknown()).describe('로어북 항목 데이터 (key, comment, content 등)') },
    safeToolHandler('add_lorebook', async ({ data }) =>
      textResult(await apiRequest('POST', '/lorebook/add', data as Record<string, unknown>)),
    ),
  );

  server.tool(
    'add_lorebook_batch',
    MCP_TOOL_DESCRIPTIONS['add_lorebook_batch'],
    {
      entries: z
        .array(z.record(z.string(), z.unknown()))
        .describe('로어북 항목 데이터 배열 [{comment, key, content, ...}, ...] (최대 50개)'),
    },
    async ({ entries }) =>
      textResult(
        await apiRequest('POST', '/lorebook/batch-add', {
          entries: entries as Array<Record<string, unknown>>,
        }),
      ),
  );

  server.tool(
    'delete_lorebook',
    MCP_TOOL_DESCRIPTIONS['delete_lorebook'],
    {
      index: z.number().describe('삭제할 로어북 항목 인덱스'),
      expected_comment: z
        .string()
        .optional()
        .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
    },
    async ({ index, expected_comment }) =>
      textResult(await apiRequest('POST', `/lorebook/${index}/delete`, { expected_comment })),
  );

  server.tool(
    'delete_lorebook_by_id',
    MCP_TOOL_DESCRIPTIONS['delete_lorebook_by_id'],
    {
      id: z.string().min(1),
      expected_comment: z.string().optional(),
    },
    async ({ id, expected_comment }) =>
      textResult(await apiRequest('POST', `/lorebook/by-id/${encodeURIComponent(id)}/delete`, { expected_comment })),
  );

  server.tool(
    'batch_delete_lorebook',
    MCP_TOOL_DESCRIPTIONS['batch_delete_lorebook'],
    {
      indices: z.array(z.number()).describe('삭제할 로어북 항목 인덱스 배열 (예: [0, 2, 5])'),
      expected_comments: z
        .array(z.string())
        .max(50)
        .optional()
        .describe('선택: indices와 같은 순서의 현재 comment 배열. 다르면 409 Conflict로 중단됩니다.'),
    },
    async ({ indices, expected_comments }) =>
      textResult(await apiRequest('POST', '/lorebook/batch-delete', { indices, expected_comments })),
  );

  server.tool(
    'batch_delete_lorebook_by_id',
    MCP_TOOL_DESCRIPTIONS['batch_delete_lorebook_by_id'],
    {
      ids: z.array(z.string().min(1)).max(50),
      expected_comments: z.array(z.string()).max(50).optional(),
    },
    async ({ ids, expected_comments }) =>
      textResult(await apiRequest('POST', '/lorebook/batch-delete-by-id', { ids, expected_comments })),
  );

  server.tool(
    'replace_in_lorebook',
    MCP_TOOL_DESCRIPTIONS['replace_in_lorebook'],
    {
      index: z.number().describe('로어북 항목 인덱스'),
      find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
      replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
      regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false = 일반 문자열 매칭)'),
      flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
      field: z
        .enum(['content', 'comment', 'key', 'secondkey'])
        .optional()
        .describe('치환 대상 필드 (기본: "content"). comment/key/secondkey도 지원'),
      expected_comment: z
        .string()
        .optional()
        .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
    },
    async ({ index, find, replace, regex, flags, field, expected_comment }) =>
      textResult(
        await apiRequest('POST', `/lorebook/${index}/replace`, {
          find,
          replace,
          regex,
          flags,
          field,
          expected_comment,
        }),
      ),
  );

  server.tool(
    'insert_in_lorebook',
    MCP_TOOL_DESCRIPTIONS['insert_in_lorebook'],
    {
      index: z.number().describe('로어북 항목 인덱스'),
      content: z.string().describe('삽입할 텍스트'),
      position: z
        .enum(['end', 'start', 'after', 'before'])
        .optional()
        .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
      anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
      expected_comment: z
        .string()
        .optional()
        .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
    },
    async ({ index, content, position, anchor, expected_comment }) =>
      textResult(
        await apiRequest('POST', `/lorebook/${index}/insert`, { content, position, anchor, expected_comment }),
      ),
  );

  server.tool(
    'replace_block_in_lorebook',
    MCP_TOOL_DESCRIPTIONS['replace_block_in_lorebook'],
    {
      index: z.number().describe('로어북 항목 인덱스'),
      start_anchor: z.string().describe('블록 시작 앵커 문자열 (멀티라인 가능)'),
      end_anchor: z.string().describe('블록 끝 앵커 문자열 (멀티라인 가능)'),
      content: z.string().optional().describe('새 블록 내용 (기본: 빈 문자열 = 블록 삭제)'),
      include_anchors: z.boolean().optional().describe('true(기본): 앵커 포함 전체 교체, false: 앵커 사이 내용만 교체'),
      field: z.enum(['content', 'comment', 'key', 'secondkey']).optional().describe('치환 대상 필드 (기본: "content")'),
      dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 미리보기만 반환 (기본: false)'),
      expected_comment: z
        .string()
        .optional()
        .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
    },
    async ({ index, start_anchor, end_anchor, content, include_anchors, field, dry_run, expected_comment }) =>
      textResult(
        await apiRequest('POST', `/lorebook/${index}/block-replace`, {
          start_anchor,
          end_anchor,
          content,
          include_anchors,
          field,
          dry_run,
          expected_comment,
        }),
      ),
  );

  server.tool(
    'replace_in_lorebook_batch',
    MCP_TOOL_DESCRIPTIONS['replace_in_lorebook_batch'],
    {
      replacements: z
        .array(
          z.object({
            index: z.number().describe('로어북 항목 인덱스'),
            find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
            replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
            regex: z.boolean().optional().describe('정규식 모드 여부'),
            flags: z.string().optional().describe('정규식 플래그 (기본: "g")'),
            expected_comment: z
              .string()
              .optional()
              .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
          }),
        )
        .max(50)
        .describe('치환 작업 배열 [{index, find, replace, regex?, flags?}] (최대 50개)'),
      dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 매치 결과만 반환합니다 (기본: false)'),
    },
    async ({ replacements, dry_run }) =>
      textResult(await apiRequest('POST', '/lorebook/batch-replace', { replacements, dry_run })),
  );

  server.tool(
    'replace_across_all_lorebook',
    MCP_TOOL_DESCRIPTIONS['replace_across_all_lorebook'],
    {
      find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
      replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
      regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
      flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
      field: z.enum(['content', 'comment', 'key', 'secondkey']).optional().describe('치환 대상 필드 (기본: "content")'),
      dry_run: z.boolean().optional().describe('true이면 실제 변경 없이 매치 항목만 반환 (기본: false)'),
    },
    async ({ find, replace, regex, flags, field, dry_run }) =>
      textResult(await apiRequest('POST', '/lorebook/replace-all', { find, replace, regex, flags, field, dry_run })),
  );

  server.tool(
    'insert_in_lorebook_batch',
    MCP_TOOL_DESCRIPTIONS['insert_in_lorebook_batch'],
    {
      insertions: z
        .array(
          z.object({
            index: z.number().describe('로어북 항목 인덱스'),
            content: z.string().describe('삽입할 텍스트'),
            position: z
              .enum(['end', 'start', 'after', 'before'])
              .optional()
              .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
            anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
            expected_comment: z
              .string()
              .optional()
              .describe('선택: 이 index에 있어야 한다고 기대하는 현재 comment. 다르면 409 Conflict로 중단됩니다.'),
          }),
        )
        .max(50)
        .describe('삽입 작업 배열 [{index, content, position?, anchor?}] (최대 50개)'),
    },
    async ({ insertions }) => textResult(await apiRequest('POST', '/lorebook/batch-insert', { insertions })),
  );

  // ===== Regex Tools =====

  server.tool('list_regex', MCP_TOOL_DESCRIPTIONS['list_regex'], {}, async () =>
    textResult(await apiRequest('GET', '/regex')),
  );

  server.tool(
    'read_regex',
    MCP_TOOL_DESCRIPTIONS['read_regex'],
    { index: z.number().describe('정규식 항목 인덱스') },
    async ({ index }) => textResult(await apiRequest('GET', `/regex/${index}`)),
  );

  server.tool(
    'read_regex_batch',
    MCP_TOOL_DESCRIPTIONS['read_regex_batch'],
    {
      indices: z.array(z.number()).max(50).describe('읽을 정규식 항목 인덱스 배열 (최대 50개)'),
    },
    async ({ indices }) => textResult(await apiRequest('POST', '/regex/batch', { indices })),
  );

  const regexIdentitySchema = z.object({
    comment: z.string().optional(),
    preview: z.string().optional(),
    hash: z.string().optional(),
  });

  server.tool(
    'read_regex_by_identity',
    MCP_TOOL_DESCRIPTIONS['read_regex_by_identity'],
    { identity: regexIdentitySchema },
    async ({ identity }) => textResult(await apiRequest('POST', '/regex/by-identity/read', { identity })),
  );

  server.tool(
    'write_regex',
    MCP_TOOL_DESCRIPTIONS['write_regex'],
    {
      index: z.number().describe('정규식 항목 인덱스'),
      data: z.record(z.string(), z.unknown()).describe('수정할 정규식 데이터'),
      expected_comment: z.string().optional().describe('선택사항: list_regex에서 본 현재 comment와 다르면 409 반환'),
    },
    async ({ index, data, expected_comment }) =>
      textResult(
        await apiRequest('POST', `/regex/${index}`, { ...(data as Record<string, unknown>), expected_comment }),
      ),
  );

  server.tool(
    'write_regex_by_identity',
    MCP_TOOL_DESCRIPTIONS['write_regex_by_identity'],
    {
      identity: regexIdentitySchema,
      data: z.record(z.string(), z.unknown()),
      expected_comment: z.string().optional(),
    },
    async ({ identity, data, expected_comment }) =>
      textResult(await apiRequest('POST', '/regex/by-identity/write', { identity, data, expected_comment })),
  );

  server.tool(
    'add_regex',
    MCP_TOOL_DESCRIPTIONS['add_regex'],
    { data: z.record(z.string(), z.unknown()).describe('정규식 항목 데이터 (comment, type, find, replace, flag)') },
    async ({ data }) => textResult(await apiRequest('POST', '/regex/add', data as Record<string, unknown>)),
  );

  server.tool(
    'replace_in_regex',
    MCP_TOOL_DESCRIPTIONS['replace_in_regex'],
    {
      index: z.number().describe('정규식 항목 인덱스'),
      field: z.enum(['find', 'replace']).describe('편집할 필드: "find" (IN 패턴) 또는 "replace" (OUT 치환 텍스트)'),
      find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
      replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
      regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false)'),
      flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
      expected_comment: z.string().optional().describe('선택사항: list_regex에서 본 현재 comment와 다르면 409 반환'),
    },
    async ({ index, field, find, replace, regex, flags, expected_comment }) =>
      textResult(
        await apiRequest('POST', `/regex/${index}/replace`, { field, find, replace, regex, flags, expected_comment }),
      ),
  );

  server.tool(
    'insert_in_regex',
    MCP_TOOL_DESCRIPTIONS['insert_in_regex'],
    {
      index: z.number().describe('정규식 항목 인덱스'),
      field: z.enum(['find', 'replace']).describe('편집할 필드: "find" (IN 패턴) 또는 "replace" (OUT 치환 텍스트)'),
      content: z.string().describe('삽입할 텍스트'),
      position: z
        .enum(['end', 'start', 'after', 'before'])
        .optional()
        .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
      anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
      expected_comment: z.string().optional().describe('선택사항: list_regex에서 본 현재 comment와 다르면 409 반환'),
    },
    async ({ index, field, content, position, anchor, expected_comment }) =>
      textResult(
        await apiRequest('POST', `/regex/${index}/insert`, { field, content, position, anchor, expected_comment }),
      ),
  );

  server.tool(
    'delete_regex',
    MCP_TOOL_DESCRIPTIONS['delete_regex'],
    {
      index: z.number().describe('삭제할 정규식 항목 인덱스'),
      expected_comment: z.string().optional().describe('선택사항: list_regex에서 본 현재 comment와 다르면 409 반환'),
    },
    async ({ index, expected_comment }) =>
      textResult(await apiRequest('POST', `/regex/${index}/delete`, { expected_comment })),
  );

  server.tool(
    'delete_regex_by_identity',
    MCP_TOOL_DESCRIPTIONS['delete_regex_by_identity'],
    {
      identity: regexIdentitySchema,
      expected_comment: z.string().optional(),
    },
    async ({ identity, expected_comment }) =>
      textResult(await apiRequest('POST', '/regex/by-identity/delete', { identity, expected_comment })),
  );

  server.tool(
    'add_regex_batch',
    MCP_TOOL_DESCRIPTIONS['add_regex_batch'],
    {
      entries: z
        .array(z.record(z.string(), z.unknown()))
        .max(50)
        .describe('정규식 항목 데이터 배열 [{comment, type, find, replace, flag}, ...] (최대 50개)'),
    },
    async ({ entries }) => textResult(await apiRequest('POST', '/regex/batch-add', { entries })),
  );

  server.tool(
    'write_regex_batch',
    MCP_TOOL_DESCRIPTIONS['write_regex_batch'],
    {
      entries: z
        .array(
          z.object({
            index: z.number().describe('정규식 항목 인덱스'),
            data: z.record(z.string(), z.unknown()).describe('수정할 정규식 데이터'),
            expected_comment: z
              .string()
              .optional()
              .describe('선택사항: list_regex에서 본 현재 comment와 다르면 409 반환'),
          }),
        )
        .max(50)
        .describe('수정할 항목 배열 [{index, data}, ...] (최대 50개)'),
    },
    async ({ entries }) => textResult(await apiRequest('POST', '/regex/batch-write', { entries })),
  );

  // ===== Greeting Tools =====

  server.tool(
    'list_greetings',
    MCP_TOOL_DESCRIPTIONS['list_greetings'],
    {
      type: z.enum(['alternate', 'group']).describe('"alternate" (추가 첫 메시지) 또는 "group" (그룹 전용 인사말)'),
      filter: z.string().optional().describe('텍스트 검색 키워드. 대소문자 무시. 인사말 내용에서 검색'),
      content_filter: z.string().optional().describe('본문 검색 키워드 + 매치 컨텍스트(±50자) 반환. 대소문자 무시'),
    },
    async ({ type, filter, content_filter }) => {
      const params = new URLSearchParams();
      if (filter) params.set('filter', filter);
      if (content_filter) params.set('content_filter', content_filter);
      const qs = params.toString();
      return textResult(await apiRequest('GET', qs ? `/greetings/${type}?${qs}` : `/greetings/${type}`));
    },
  );

  server.tool(
    'read_greeting',
    MCP_TOOL_DESCRIPTIONS['read_greeting'],
    {
      type: z.enum(['alternate', 'group']).describe('"alternate" 또는 "group"'),
      index: z.number().describe('인사말 인덱스 (list_greetings 결과 참조)'),
    },
    async ({ type, index }) => textResult(await apiRequest('GET', `/greeting/${type}/${index}`)),
  );

  server.tool(
    'read_greeting_batch',
    MCP_TOOL_DESCRIPTIONS['read_greeting_batch'],
    {
      type: z.enum(['alternate', 'group']).describe('"alternate" 또는 "group"'),
      indices: z.array(z.number()).max(50).describe('읽을 인사말 인덱스 배열 (최대 50개)'),
    },
    async ({ type, indices }) => textResult(await apiRequest('POST', `/greeting/${type}/batch`, { indices })),
  );

  const greetingIdentitySchema = z.object({
    preview: z.string().optional(),
    hash: z.string().optional(),
  });

  server.tool(
    'read_greeting_by_hash',
    MCP_TOOL_DESCRIPTIONS['read_greeting_by_hash'],
    {
      type: z.enum(['alternate', 'group']),
      identity: greetingIdentitySchema,
    },
    async ({ type, identity }) => textResult(await apiRequest('POST', `/greeting/${type}/by-hash/read`, { identity })),
  );

  server.tool(
    'write_greeting',
    MCP_TOOL_DESCRIPTIONS['write_greeting'],
    {
      type: z.enum(['alternate']).describe('"alternate"만 지원. "group"은 읽기 전용'),
      index: z.number().describe('인사말 인덱스'),
      content: z.string().describe('새로운 인사말 텍스트'),
      expected_preview: z
        .string()
        .optional()
        .describe('선택사항: list_greetings에서 본 현재 preview와 다르면 409 반환'),
    },
    async ({ type, index, content, expected_preview }) =>
      textResult(await apiRequest('POST', `/greeting/${type}/${index}`, { content, expected_preview })),
  );

  server.tool(
    'write_greeting_by_hash',
    MCP_TOOL_DESCRIPTIONS['write_greeting_by_hash'],
    {
      type: z.enum(['alternate']),
      identity: greetingIdentitySchema,
      content: z.string(),
      expected_preview: z.string().optional(),
    },
    async ({ type, identity, content, expected_preview }) =>
      textResult(await apiRequest('POST', `/greeting/${type}/by-hash/write`, { identity, content, expected_preview })),
  );

  server.tool(
    'add_greeting',
    MCP_TOOL_DESCRIPTIONS['add_greeting'],
    {
      type: z.enum(['alternate']).describe('"alternate"만 지원. "group"은 읽기 전용'),
      content: z.string().describe('인사말 텍스트'),
    },
    async ({ type, content }) => textResult(await apiRequest('POST', `/greeting/${type}/add`, { content })),
  );

  server.tool(
    'delete_greeting',
    MCP_TOOL_DESCRIPTIONS['delete_greeting'],
    {
      type: z.enum(['alternate']).describe('"alternate"만 지원. "group"은 읽기 전용'),
      index: z.number().describe('삭제할 인사말 인덱스'),
      expected_preview: z
        .string()
        .optional()
        .describe('선택사항: list_greetings에서 본 현재 preview와 다르면 409 반환'),
    },
    async ({ type, index, expected_preview }) =>
      textResult(await apiRequest('POST', `/greeting/${type}/${index}/delete`, { expected_preview })),
  );

  server.tool(
    'delete_greeting_by_hash',
    MCP_TOOL_DESCRIPTIONS['delete_greeting_by_hash'],
    {
      type: z.enum(['alternate']),
      identity: greetingIdentitySchema,
      expected_preview: z.string().optional(),
    },
    async ({ type, identity, expected_preview }) =>
      textResult(await apiRequest('POST', `/greeting/${type}/by-hash/delete`, { identity, expected_preview })),
  );

  server.tool(
    'batch_delete_greeting',
    MCP_TOOL_DESCRIPTIONS['batch_delete_greeting'],
    {
      type: z.enum(['alternate']).describe('"alternate"만 지원. "group"은 읽기 전용'),
      indices: z.array(z.number()).describe('삭제할 인사말 인덱스 배열 (예: [0, 2, 5])'),
      expected_previews: z
        .array(z.string())
        .optional()
        .describe(
          '선택사항: indices와 같은 순서/길이의 preview 배열. list_greetings의 preview를 그대로 넣으면 stale index 감지',
        ),
    },
    async ({ type, indices, expected_previews }) =>
      textResult(await apiRequest('POST', `/greeting/${type}/batch-delete`, { indices, expected_previews })),
  );

  server.tool(
    'batch_write_greeting',
    MCP_TOOL_DESCRIPTIONS['batch_write_greeting'],
    {
      type: z.enum(['alternate']).describe('"alternate"만 지원. "group"은 읽기 전용'),
      writes: z
        .array(
          z.object({
            index: z.number().describe('인사말 인덱스'),
            content: z.string().describe('새로운 인사말 텍스트'),
            expected_preview: z
              .string()
              .optional()
              .describe('선택사항: list_greetings에서 본 현재 preview와 다르면 409 반환'),
          }),
        )
        .max(50)
        .describe('수정할 인사말 배열 [{index, content}, ...] (최대 50개)'),
    },
    async ({ type, writes }) => textResult(await apiRequest('POST', `/greeting/${type}/batch-write`, { writes })),
  );

  server.tool(
    'reorder_greetings',
    MCP_TOOL_DESCRIPTIONS['reorder_greetings'],
    {
      type: z.enum(['alternate', 'group']).describe('"alternate" 또는 "group"'),
      order: z.array(z.number()).describe('새 순서 (예: [2,0,1,3] = 기존 2번을 첫째로, 0번을 둘째로...)'),
    },
    async ({ type, order }) => textResult(await apiRequest('POST', `/greeting/${type}/reorder`, { order })),
  );

  // ===== Trigger Tools =====

  server.tool('list_triggers', MCP_TOOL_DESCRIPTIONS['list_triggers'], {}, async () =>
    textResult(await apiRequest('GET', '/triggers')),
  );

  server.tool(
    'read_trigger',
    MCP_TOOL_DESCRIPTIONS['read_trigger'],
    { index: z.number().describe('트리거 인덱스 (list_triggers 결과 참조)') },
    async ({ index }) => textResult(await apiRequest('GET', `/trigger/${index}`)),
  );

  server.tool(
    'read_trigger_batch',
    MCP_TOOL_DESCRIPTIONS['read_trigger_batch'],
    {
      indices: z.array(z.number()).max(50).describe('읽을 트리거 인덱스 배열 (최대 50개)'),
    },
    async ({ indices }) => textResult(await apiRequest('POST', '/trigger/batch', { indices })),
  );

  server.tool(
    'write_trigger',
    MCP_TOOL_DESCRIPTIONS['write_trigger'],
    {
      index: z.number().describe('트리거 인덱스'),
      comment: z.string().optional().describe('트리거 이름/설명'),
      type: z.string().optional().describe('트리거 타입 (start, input, output 등)'),
      conditions: z.array(z.unknown()).optional().describe('조건 배열'),
      effect: z.array(z.unknown()).optional().describe('효과 배열'),
      lowLevelAccess: z.boolean().optional().describe('저수준 접근 여부'),
      expected_comment: z.string().optional().describe('선택사항: list_triggers에서 본 현재 comment와 다르면 409 반환'),
    },
    async ({ index, comment, type, conditions, effect, lowLevelAccess, expected_comment }) => {
      const body: Record<string, unknown> = {};
      if (comment !== undefined) body.comment = comment;
      if (type !== undefined) body.type = type;
      if (conditions !== undefined) body.conditions = conditions;
      if (effect !== undefined) body.effect = effect;
      if (lowLevelAccess !== undefined) body.lowLevelAccess = lowLevelAccess;
      if (expected_comment !== undefined) body.expected_comment = expected_comment;
      return textResult(await apiRequest('POST', `/trigger/${index}`, body));
    },
  );

  server.tool(
    'add_trigger',
    MCP_TOOL_DESCRIPTIONS['add_trigger'],
    {
      comment: z.string().optional().describe('트리거 이름/설명'),
      type: z.string().optional().describe('트리거 타입 (기본: "start")'),
      conditions: z.array(z.unknown()).optional().describe('조건 배열'),
      effect: z.array(z.unknown()).optional().describe('효과 배열'),
      lowLevelAccess: z.boolean().optional().describe('저수준 접근 여부'),
    },
    async ({ comment, type, conditions, effect, lowLevelAccess }) => {
      const body: Record<string, unknown> = {};
      if (comment !== undefined) body.comment = comment;
      if (type !== undefined) body.type = type;
      if (conditions !== undefined) body.conditions = conditions;
      if (effect !== undefined) body.effect = effect;
      if (lowLevelAccess !== undefined) body.lowLevelAccess = lowLevelAccess;
      return textResult(await apiRequest('POST', '/trigger/add', body));
    },
  );

  server.tool(
    'delete_trigger',
    MCP_TOOL_DESCRIPTIONS['delete_trigger'],
    {
      index: z.number().describe('삭제할 트리거 인덱스'),
      expected_comment: z.string().optional().describe('선택사항: list_triggers에서 본 현재 comment와 다르면 409 반환'),
    },
    async ({ index, expected_comment }) =>
      textResult(await apiRequest('POST', `/trigger/${index}/delete`, { expected_comment })),
  );

  // ===== Lua Tools =====

  server.tool('list_lua', MCP_TOOL_DESCRIPTIONS['list_lua'], {}, async () =>
    textResult(await apiRequest('GET', '/lua')),
  );

  server.tool(
    'read_lua',
    MCP_TOOL_DESCRIPTIONS['read_lua'],
    { index: z.number().describe('Lua 섹션 인덱스 (list_lua 결과 참조)') },
    async ({ index }) => textResult(await apiRequest('GET', `/lua/${index}`)),
  );

  server.tool(
    'read_lua_batch',
    MCP_TOOL_DESCRIPTIONS['read_lua_batch'],
    {
      indices: z.array(z.number()).max(20).describe('읽을 Lua 섹션 인덱스 배열 (최대 20개)'),
    },
    async ({ indices }) => textResult(await apiRequest('POST', '/lua/batch', { indices })),
  );

  server.tool(
    'write_lua',
    MCP_TOOL_DESCRIPTIONS['write_lua'],
    {
      index: z.number().describe('Lua 섹션 인덱스'),
      content: z.string().describe('새로운 섹션 코드 (전체 교체)'),
      expected_hash: z.string().optional().describe('선택사항: list_lua/read_lua에서 본 현재 hash와 다르면 409 반환'),
      expected_preview: z
        .string()
        .optional()
        .describe('선택사항: list_lua/read_lua에서 본 현재 preview와 다르면 409 반환'),
    },
    async ({ index, content, expected_hash, expected_preview }) =>
      textResult(await apiRequest('POST', `/lua/${index}`, { content, expected_hash, expected_preview })),
  );

  server.tool(
    'replace_in_lua',
    MCP_TOOL_DESCRIPTIONS['replace_in_lua'],
    {
      index: z.number().describe('Lua 섹션 인덱스 (list_lua 결과 참조)'),
      find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
      replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
      regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false = 일반 문자열 매칭)'),
      flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
      expected_hash: z.string().optional().describe('선택사항: list_lua/read_lua에서 본 현재 hash와 다르면 409 반환'),
      expected_preview: z
        .string()
        .optional()
        .describe('선택사항: list_lua/read_lua에서 본 현재 preview와 다르면 409 반환'),
    },
    async ({ index, find, replace, regex, flags, expected_hash, expected_preview }) =>
      textResult(
        await apiRequest('POST', `/lua/${index}/replace`, {
          find,
          replace: replace || '',
          regex: regex || false,
          flags: flags || 'g',
          expected_hash,
          expected_preview,
        }),
      ),
  );

  server.tool(
    'insert_in_lua',
    MCP_TOOL_DESCRIPTIONS['insert_in_lua'],
    {
      index: z.number().describe('Lua 섹션 인덱스'),
      content: z.string().describe('삽입할 코드'),
      position: z
        .enum(['end', 'start', 'after', 'before'])
        .optional()
        .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
      anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
      expected_hash: z.string().optional().describe('선택사항: list_lua/read_lua에서 본 현재 hash와 다르면 409 반환'),
      expected_preview: z
        .string()
        .optional()
        .describe('선택사항: list_lua/read_lua에서 본 현재 preview와 다르면 409 반환'),
    },
    async ({ index, content, position, anchor, expected_hash, expected_preview }) =>
      textResult(
        await apiRequest('POST', `/lua/${index}/insert`, {
          content,
          position: position || 'end',
          anchor: anchor || '',
          expected_hash,
          expected_preview,
        }),
      ),
  );

  server.tool(
    'add_lua_section',
    MCP_TOOL_DESCRIPTIONS['add_lua_section'],
    {
      name: z.string().describe('새 섹션 이름'),
      content: z.string().optional().describe('섹션 초기 코드 (기본: 빈 문자열)'),
    },
    async ({ name, content }) => textResult(await apiRequest('POST', '/lua/add', { name, content: content || '' })),
  );

  // ===== CSS Tools =====

  server.tool('list_css', MCP_TOOL_DESCRIPTIONS['list_css'], {}, async () =>
    textResult(await apiRequest('GET', '/css-section')),
  );

  server.tool(
    'read_css',
    MCP_TOOL_DESCRIPTIONS['read_css'],
    { index: z.number().describe('CSS 섹션 인덱스 (list_css 결과 참조)') },
    async ({ index }) => textResult(await apiRequest('GET', `/css-section/${index}`)),
  );

  server.tool(
    'read_css_batch',
    MCP_TOOL_DESCRIPTIONS['read_css_batch'],
    {
      indices: z.array(z.number()).max(20).describe('읽을 CSS 섹션 인덱스 배열 (최대 20개)'),
    },
    async ({ indices }) => textResult(await apiRequest('POST', '/css-section/batch', { indices })),
  );

  server.tool(
    'write_css',
    MCP_TOOL_DESCRIPTIONS['write_css'],
    {
      index: z.number().describe('CSS 섹션 인덱스'),
      content: z.string().describe('새로운 섹션 코드 (전체 교체)'),
      expected_hash: z.string().optional().describe('선택사항: list_css/read_css에서 본 현재 hash와 다르면 409 반환'),
      expected_preview: z
        .string()
        .optional()
        .describe('선택사항: list_css/read_css에서 본 현재 preview와 다르면 409 반환'),
    },
    async ({ index, content, expected_hash, expected_preview }) =>
      textResult(await apiRequest('POST', `/css-section/${index}`, { content, expected_hash, expected_preview })),
  );

  server.tool(
    'replace_in_css',
    MCP_TOOL_DESCRIPTIONS['replace_in_css'],
    {
      index: z.number().describe('CSS 섹션 인덱스 (list_css 결과 참조)'),
      find: z.string().describe('찾을 문자열 (또는 regex: true일 때 정규식 패턴)'),
      replace: z.string().optional().describe('바꿀 문자열 (기본: 빈 문자열 = 삭제)'),
      regex: z.boolean().optional().describe('정규식 모드 여부 (기본: false = 일반 문자열 매칭)'),
      flags: z.string().optional().describe('정규식 플래그 (기본: "g"). regex: true일 때만 사용'),
      expected_hash: z.string().optional().describe('선택사항: list_css/read_css에서 본 현재 hash와 다르면 409 반환'),
      expected_preview: z
        .string()
        .optional()
        .describe('선택사항: list_css/read_css에서 본 현재 preview와 다르면 409 반환'),
    },
    async ({ index, find, replace, regex, flags, expected_hash, expected_preview }) =>
      textResult(
        await apiRequest('POST', `/css-section/${index}/replace`, {
          find,
          replace: replace || '',
          regex: regex || false,
          flags: flags || 'g',
          expected_hash,
          expected_preview,
        }),
      ),
  );

  server.tool(
    'insert_in_css',
    MCP_TOOL_DESCRIPTIONS['insert_in_css'],
    {
      index: z.number().describe('CSS 섹션 인덱스'),
      content: z.string().describe('삽입할 코드'),
      position: z
        .enum(['end', 'start', 'after', 'before'])
        .optional()
        .describe('삽입 위치: "end"(기본), "start", "after", "before"'),
      anchor: z.string().optional().describe('position이 "after"/"before"일 때 기준 문자열'),
      expected_hash: z.string().optional().describe('선택사항: list_css/read_css에서 본 현재 hash와 다르면 409 반환'),
      expected_preview: z
        .string()
        .optional()
        .describe('선택사항: list_css/read_css에서 본 현재 preview와 다르면 409 반환'),
    },
    async ({ index, content, position, anchor, expected_hash, expected_preview }) =>
      textResult(
        await apiRequest('POST', `/css-section/${index}/insert`, {
          content,
          position: position || 'end',
          anchor: anchor || '',
          expected_hash,
          expected_preview,
        }),
      ),
  );

  server.tool(
    'add_css_section',
    MCP_TOOL_DESCRIPTIONS['add_css_section'],
    {
      name: z.string().describe('새 섹션 이름'),
      content: z.string().optional().describe('섹션 초기 코드 (기본: 빈 문자열)'),
    },
    async ({ name, content }) =>
      textResult(await apiRequest('POST', '/css-section/add', { name, content: content || '' })),
  );
}
