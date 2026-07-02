export const MCP_TOOL_DESCRIPTIONS = {
  inspect_document:
    'Preferred facade v1 read-only entrypoint. Summarizes the active document/session, an external file, a loaded reference, or available guidance, and returns the routed legacy routes used.',
  list_tool_profiles:
    'Read-only catalog for MCP tool profiles, filtering status, registered/hidden counts, batch alternatives, and runtime health. tools/list defaults to facade-first; restart with --tool-profile=advanced-full for every granular route.',
  read_content:
    'Preferred facade v1 bounded reader. Reads selected field/surface/content items by routing to existing granular tools and returns routed legacy names. Defaults to a 24KB response cap; root surface selectors return an overview unless selector.include_raw=true and max_bytes is explicit. Supports external lorebook, regex, greeting, and .risup prompt item selectors.',
  search_document:
    'Preferred facade v1 bounded search entrypoint. Use selector.family="field" for active/external/reference field searches or selector.family="risup-prompt" for prompt items. The legacy field argument and field="risup-prompt" magic value remain deprecated aliases. max_matches limits the total active-document result count, and responses default to a 24KB cap.',
  analyze_content:
    'Preferred facade v1 transformation/statistics/simulation entrypoint. Supports field_stats, exact token_count for explicit cl100k_base/o200k_base encodings, simulate_lorebook, test_regex, CBS analysis, Danbooru discovery, lorebook/risup comparison, and verify_risup_prompt_import. validate_risup_prompt_import remains a deprecated compatibility alias.',
  validate_content:
    'Preferred facade v1 pass/fail diagnostics entrypoint. Validates lorebook keys, regex syntax, CBS, Lua sections and triggerlua effects with compile-only Wasmoon load(), Danbooru tags, .charx export compatibility, risup prompt/order selectors, risum semantic fields, and external Plugin v3 source scans where facade selectors provide enough context.',
  load_guidance:
    'Preferred facade v1 guidance loader. Reads the skill catalog or a skill document through existing list_skills/read_skill routes with bounded facade metadata.',
  preview_edit:
    'Preferred facade v1 preview tool. Produces a dry-run/read-only preview token for active/external field edits, active/external surface patches/replacements, active field or single-lorebook block replacement, active whole-lorebook text replacement, external lorebook/regex/greeting structured edits, external .risup prompt item edits, and active indexed or safe batch regex/greeting/risup prompt item writes/deletes. Does not mutate content; call apply_edit with the returned preview_token and operation_digest to apply.',
  apply_edit:
    'Preferred facade v1 mutating apply tool. Applies a prior preview_edit using preview_token and operation_digest, preserving existing granular confirmation and stale-guard behavior for active/external fields, active/external surface patches/replacements, active field or single-lorebook block replacement, active whole-lorebook text replacement, external lorebook/regex/greeting structured edits, external .risup prompt item edits, and active indexed or batch regex/greeting/risup prompt item writes/deletes. Requires user confirmation through the routed legacy mutation.',
  manage_items:
    'Preferred facade v1 item-management tool for .risup prompt items/snippets plus lorebook, regex, and alternate greeting add/reorder workflows. Use mode="read" for .risup snippets/copy-as-text, mode="preview" as the dry_run path for mutations, then mode="apply" with the returned preview_token and operation_digest. Requires user confirmation on mutating apply. Supports active and unopened external targets; granular item tools remain advanced fallbacks.',
  manage_assets:
    'Preferred facade v1 asset-management tool for active or unopened external .charx/.risum assets. Use mode="read" for list/read, mode="preview" as the dry_run path for add/delete/rename/compress_assets mutations, then mode="apply" with the returned preview_token, operation_digest, and guard_values. Requires user confirmation on mutating apply. WebP compression supports both families, updates .risum binary and extension metadata together, and preserves originals when conversion fails or grows.',
  manage_file:
    'Preferred facade v1 file-management tool for session-coupled file actions. Use mode="read" for snapshot/project-tree reads, mode="preview" as the dry_run path for open/save/snapshot/restore/field export/active lorebook import-export/project extract-reassemble mutations, then mode="apply" with preview_token, operation_digest, and guard_values. Requires user confirmation on mutating apply. Supports active/session and explicit external paths while keeping granular file tools as advanced fallbacks.',
  list_fields:
    '현재 열린 파일(.charx, .risum, .risup)의 편집 가능한 필드 목록과 크기를 확인합니다. 응답에 fileType 포함.',
  read_field:
    '작은 활성 문서 필드의 전체 내용을 읽습니다. ⚠️ lua/css/alternateGreetings/groupOnlyGreetings/triggerScripts는 전용 list_*/read_* 도구를 사용하세요. `.risup`의 promptTemplate/formatingOrder도 risup 전용 도구를 우선 사용해야 합니다. 큰 필드는 search_in_field 또는 read_field_range부터 시작하세요. 가능한 필드는 list_fields로 확인하세요.',
  write_field:
    '작은 활성 문서 필드에 새 내용을 씁니다. ⚠️ lua/css는 write_lua/write_css, alternateGreetings는 write_greeting/batch_write_greeting, triggerScripts는 write_trigger를 우선 사용하세요. groupOnlyGreetings 및 비권장/예약/레거시 필드는 읽기 전용입니다. `.risup`의 promptTemplate/formatingOrder는 전용 risup prompt 도구를 우선 사용하고, write_field는 unsupported raw shape fallback일 때만 쓰는 편이 안전합니다. 가능한 필드는 list_fields로 확인하세요. 사용자 확인 필요.',
  read_field_batch:
    '여러 작은 활성 문서 필드를 한 번에 읽습니다. read_field 반복 대신 이 도구를 사용하세요. ⚠️ lua/css/alternateGreetings/groupOnlyGreetings/triggerScripts와 `.risup` promptTemplate/formatingOrder 같은 구조화 표면은 전용 도구를 사용하세요. 최대 20개 필드. 유효하지 않은 필드는 개별 에러로 반환됩니다 (전체 실패 X).',
  probe_field:
    '에디터에 열지 않은 .charx/.risum/.risup 파일에서 작은 필드 하나를 읽습니다. 절대 file_path가 필요하며 읽기 전용입니다. ⚠️ lorebook/regex/lua/css/greetings/triggers/risup prompt 표면은 대응하는 probe_* 전용 도구를 우선 사용하세요.',
  probe_field_batch:
    '에디터에 열지 않은 .charx/.risum/.risup 파일에서 여러 필드를 한 번에 읽습니다. 최대 20개 필드. 읽기 전용.',
  probe_lorebook:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 로어북 목록을 읽습니다. filter/folder/content_filter 옵션 지원. 읽기 전용.',
  probe_regex: '에디터에 열지 않은 .charx/.risum/.risup 파일의 정규식 목록을 읽습니다. 읽기 전용.',
  probe_lua: '에디터에 열지 않은 .charx/.risum/.risup 파일의 Lua 섹션 목록을 읽습니다. 읽기 전용.',
  probe_css: '에디터에 열지 않은 .charx/.risum/.risup 파일의 CSS 섹션 목록을 읽습니다. 읽기 전용.',
  probe_greetings:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 greetings 목록을 읽습니다. type은 alternate 또는 groupOnly. 읽기 전용.',
  probe_triggers: '에디터에 열지 않은 .charx/.risum/.risup 파일의 trigger 목록을 읽습니다. 읽기 전용.',
  probe_risup_prompt_items: '에디터에 열지 않은 .risup 파일의 prompt item 목록을 읽습니다. 읽기 전용.',
  probe_risup_formating_order: '에디터에 열지 않은 .risup 파일의 formatingOrder 토큰과 경고를 읽습니다. 읽기 전용.',
  inspect_external_file:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 필드 인벤토리와 구조화 표면 개수를 빠르게 요약합니다. 읽기 전용.',
  external_write_field:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 필드 값을 file_path 기준으로 직접 수정합니다. 현재 UI에 열려 있는 동일 파일은 거부되며, lorebook/regex/triggerScripts/groupOnlyGreetings 같은 구조화 표면도 raw field 단위로 갱신할 수 있습니다. 사용자 확인 필요.',
  external_write_field_batch:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 여러 필드를 한 번에 수정합니다. 현재 UI에 열려 있는 동일 파일은 거부됩니다. 최대 20개 항목. 사용자 확인 필요.',
  external_search_in_field:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 문자열 필드를 검색합니다. 수정 없는 읽기 전용입니다.',
  external_read_field_range:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 문자열 필드 일부만 읽습니다. 큰 필드를 직접 열지 않고 필요한 범위만 확인할 때 사용합니다. 읽기 전용.',
  external_replace_in_field:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 문자열 필드에서 서버 측 치환을 수행합니다. current UI 문서와 같은 파일은 거부됩니다. dry_run: true로 미리보기 가능. 사용자 확인 필요.',
  external_insert_in_field:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 문자열 필드에 텍스트를 삽입합니다. current UI 문서와 같은 파일은 거부됩니다. 사용자 확인 필요.',
  open_file:
    '절대 경로의 .charx/.risum/.risup 파일을 현재 에디터 문서로 엽니다. 이후 read/write 계열 도구는 이 파일을 대상으로 동작합니다.',
  save_current_file:
    '현재 에디터 문서를 현재 파일 경로에 저장합니다. 경로가 없는 새 문서라면 앱의 Save As 흐름을 사용합니다.',
  list_surfaces: '현재 문서에서 MCP가 JSON Pointer로 읽고 편집할 수 있는 top-level surface 목록과 hash를 반환합니다.',
  read_surface:
    '현재 문서의 임의 JSON surface를 JSON Pointer path로 읽습니다. 예: "/", "/regex/0/comment", "/alternateGreetings/0". 새 LLM 흐름에서는 root 덤프 대신 facade read_content의 bounded overview 또는 좁은 path selector를 우선 사용하세요.',
  patch_surface:
    '현재 문서의 임의 JSON surface에 RFC 6902 JSON Patch(add/replace/remove)를 적용합니다. 배열 add는 인덱스 삽입, -는 append이며 dry_run과 expected_hash를 지원합니다. 사용자 확인 필요.',
  replace_in_surface:
    '현재 문서의 JSON surface 아래 모든 문자열 값에서 텍스트를 치환합니다. 대형 구조를 직접 덤프하지 않고 path 단위로 처리합니다. optional expected_hash로 stale document를 감지할 수 있습니다. 새 LLM 흐름에서는 preview_edit/apply_edit의 surface replace_text facade를 우선 사용하세요. 사용자 확인 필요.',
  external_read_surface:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 임의 JSON surface를 JSON Pointer path로 읽습니다. current UI 문서와 같은 파일은 거부됩니다. 새 LLM 흐름에서는 root 덤프 대신 facade read_content의 bounded overview 또는 좁은 path selector를 우선 사용하세요.',
  external_patch_surface:
    '에디터에 열지 않은 .charx/.risum/.risup 파일의 임의 JSON surface에 RFC 6902 JSON Patch(add/replace/remove)를 적용합니다. 배열 add는 인덱스 삽입, -는 append입니다. current UI 문서와 같은 파일은 거부됩니다. 사용자 확인 필요.',
  replace_in_field:
    '필드의 내용에서 문자열 치환을 수행합니다. 대형 필드를 전체 읽지 않고 서버에서 직접 처리합니다. 문자열 타입 필드만 지원 (배열/boolean/number/triggerScripts 제외). regex: true + flags 옵션으로 정규식 지원. ⚠️ 검색만 하려면 search_in_field를 사용하세요 — replace를 생략하면 빈 문자열(=삭제)이 적용됩니다. dry_run: true로 실제 변경 없이 매치 결과만 미리 확인 가능. 사용자 확인 필요.',
  insert_in_field:
    '필드의 내용에 텍스트를 삽입합니다. 대형 필드를 전체 읽지 않고 서버에서 직접 처리합니다. 문자열 타입 필드만 지원 (배열/boolean/number/triggerScripts 제외). 사용자 확인 필요.',
  replace_in_field_batch:
    '하나의 필드에 여러 치환을 순차적으로 적용합니다. 이전 치환 결과 위에 다음 치환이 적용되며, 한 번의 확인으로 모두 처리합니다. 동일 필드에서 10명 캐릭터 태그를 각각 바꾸는 등의 대량 작업에 유용. dry_run으로 미리보기 가능. 사용자 확인 필요.',
  search_in_field:
    '필드 내용에서 문자열을 검색하고 주변 컨텍스트와 함께 반환합니다 — 수정 없는 읽기 전용입니다. 대상 필드를 이미 알고 있을 때 사용하세요. 필드가 아직 불명확하면 search_all_fields를 먼저 사용하세요. 정규식도 지원합니다.',
  read_field_range:
    '대형 필드의 특정 구간만 읽습니다. 전체를 읽지 않고 문자 오프셋과 길이로 원하는 부분만 반환. search_in_field의 position과 연계하여 사용 가능.',
  replace_block_in_field:
    '필드에서 두 앵커 사이의 멀티라인 블록을 교체합니다. start_anchor와 end_anchor 사이의 텍스트를 새 내용으로 치환. 여러 줄에 걸친 블록도 안전하게 교체 가능. include_anchors: false로 앵커 자체는 유지하고 사이 내용만 교체 가능. dry_run 지원. 사용자 확인 필요.',
  write_field_batch:
    '여러 작은 필드의 내용을 한 번에 수정합니다. 한 번의 확인으로 모든 필드를 동시에 업데이트합니다. ⚠️ lua/css/alternateGreetings/triggerScripts와 `.risup` promptTemplate/formatingOrder 같은 구조화 표면은 전용 도구를 우선 사용하세요. groupOnlyGreetings 및 비권장/예약/레거시 필드는 읽기 전용입니다. characterVersion + defaultVariables 같이 여러 소형 필드를 함께 바꿀 때 유용합니다. 사용자 확인 필요.',
  snapshot_field:
    '필드의 현재 값을 스냅샷으로 저장합니다. 대형 필드 편집 전 안전망으로 사용. 필드당 최대 10개 스냅샷 보관 (초과 시 오래된 것부터 삭제). 파일 새로 로드 시 초기화됩니다.',
  list_snapshots: '필드의 저장된 스냅샷 목록을 확인합니다. 각 스냅샷의 ID, 시점, 크기를 반환.',
  session_status:
    '현재 MCP 세션 상태를 읽습니다. 열린 문서 경로/타입/이름, renderer dirty 상태, autosave 설정, recovery 메타데이터, 필드 스냅샷 요약, 로드된 참고 자료(references) 목록을 한 번에 확인할 수 있습니다. 메인 파일이 열려 있지 않아도 동작하며, 참고 자료가 있으면 list_references로 드릴다운하세요. 변경 전 상황 파악용 읽기 전용 도구입니다.',
  restore_snapshot: '스냅샷으로 필드를 복원합니다. list_snapshots로 스냅샷 ID를 확인한 뒤 사용. 사용자 확인 필요.',
  get_field_stats: '필드의 통계 정보를 반환합니다 (문자 수, 행 수, 단어 수, CBS 태그 수, HTML 태그 수 등). 읽기 전용.',
  search_all_fields:
    '모든 텍스트 필드에서 한 번에 검색합니다. 어떤 필드에 텍스트가 있는지 아직 모를 때 사용하는 cross-field scan 도구입니다. 결과를 확인한 뒤에는 search_in_field, read_field, 또는 구조화 표면 전용 도구로 좁혀 가세요. 읽기 전용입니다.',
  list_lorebook:
    '로어북 항목 목록을 확인합니다 (인덱스, 코멘트, 키, 활성화 상태, content 크기, 폴더, 미리보기). 응답에 폴더 요약(folders)도 포함됩니다. 항목이 수백 개일 수 있으므로 folder 또는 filter 파라미터로 범위를 좁히세요.',
  read_lorebook: '특정 인덱스의 로어북 항목 전체 데이터를 읽습니다.',
  read_lorebook_batch: '여러 로어북 항목을 한 번에 읽습니다. read_lorebook을 반복 호출하는 대신 이 도구를 사용하세요.',
  read_lorebook_by_id:
    '계산된 안정 id로 로어북 항목을 읽습니다. 새 LLM 흐름에서는 facade read_content selector { family: "lorebook", id }를 우선 사용하세요.',
  write_lorebook_batch:
    '여러 로어북 항목을 한 번에 수정합니다. 변경 사항 요약을 보여주고 한 번의 확인으로 전부 적용합니다. 각 항목에 optional expected_comment를 넣으면 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  write_lorebook_by_id_batch:
    '계산된 안정 id로 여러 로어북 항목을 한 번에 수정합니다. 충돌 시 index + expected_comment 도구로 fallback하세요. 사용자 확인 필요.',
  diff_lorebook:
    '현재 파일의 로어북 항목과 참고 자료의 로어북 항목을 비교합니다. 필드별 차이점과 content의 라인 단위 변경 사항을 반환합니다.',
  validate_lorebook_keys:
    '로어북 키의 일반적인 문제를 검증합니다. 후행 쉼표, 불필요한 공백, 빈 세그먼트, 중복 키 등을 탐지합니다.',
  clone_lorebook:
    '기존 로어북 항목을 복제합니다. overrides로 복제본의 필드를 변경할 수 있습니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  write_lorebook:
    '특정 인덱스의 로어북 항목을 수정합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  write_lorebook_by_id:
    '계산된 안정 id로 로어북 항목을 수정합니다. 새 LLM 흐름에서는 facade preview_edit/apply_edit selector { family: "lorebook", id }를 우선 사용하세요. 사용자 확인 필요.',
  add_lorebook: '새 로어북 항목을 추가합니다. 사용자 확인 필요.',
  add_lorebook_batch:
    '여러 로어북 항목을 한 번에 추가합니다. 최대 50개. 단일 확인으로 전부 추가합니다. 사용자 확인 필요.',
  delete_lorebook:
    '특정 인덱스의 로어북 항목을 삭제합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  delete_lorebook_by_id:
    '계산된 안정 id로 로어북 항목을 삭제합니다. 새 LLM 흐름에서는 facade preview_edit/apply_edit selector { family: "lorebook", id }를 우선 사용하세요. 사용자 확인 필요.',
  batch_delete_lorebook:
    '여러 로어북 항목을 한 번에 삭제합니다. 인덱스를 내림차순 처리하여 시프트 문제를 방지합니다. optional expected_comments를 함께 보내면 stale index를 감지할 수 있습니다. 최대 50개. 사용자 확인 필요.',
  batch_delete_lorebook_by_id:
    '계산된 안정 id 배열로 여러 로어북 항목을 삭제합니다. id 충돌 시 index + expected_comment 도구로 fallback하세요. 사용자 확인 필요.',
  replace_in_lorebook:
    '로어북 항목의 필드에서 문자열 치환을 수행합니다. 대용량 항목도 전체를 읽지 않고 서버에서 직접 처리합니다. field 파라미터로 content 외에 comment, key, secondkey도 치환 가능. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  insert_in_lorebook:
    '로어북 항목의 content에 텍스트를 삽입합니다. 전체를 읽지 않고 특정 위치에 추가합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  replace_block_in_lorebook:
    '로어북 항목에서 두 앵커 사이의 멀티라인 블록을 교체합니다. 여러 줄에 걸친 텍스트 블록도 안전하게 교체 가능. field 옵션으로 content(기본)/comment/key/secondkey 대상 선택. dry_run 지원. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  replace_in_lorebook_batch:
    '여러 로어북 항목의 content에서 문자열 치환을 일괄 수행합니다. 각 항목별 매치 수를 계산하고 한 번의 확인으로 전부 적용합니다. dry_run으로 실제 변경 없이 매치 결과를 미리 확인할 수 있고, 각 항목에 optional expected_comment를 넣으면 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  replace_across_all_lorebook:
    '모든 로어북 항목에서 특정 문자열을 한 번에 치환합니다. list_lorebook → replace_in_lorebook 반복 호출 대신 1회로 처리. field 옵션으로 content/comment/key/secondkey 중 대상 선택 가능. dry_run으로 미리보기 가능. 사용자 확인 필요.',
  insert_in_lorebook_batch:
    '여러 로어북 항목의 content에 텍스트를 일괄 삽입합니다. 한 번의 확인으로 전부 적용합니다. 각 항목에 optional expected_comment를 넣으면 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  list_regex: '정규식 스크립트 항목 목록을 확인합니다 (인덱스, comment, type, findSize, replaceSize).',
  read_regex: '특정 인덱스의 정규식 항목을 읽습니다.',
  read_regex_batch: '여러 정규식 항목을 한 번에 읽습니다. read_regex를 반복 호출하는 대신 이 도구를 사용하세요.',
  read_regex_by_identity:
    'comment + preview/hash identity로 정규식 항목을 읽습니다. 새 LLM 흐름에서는 facade read_content selector { family: "regex", identity }를 우선 사용하세요.',
  write_regex:
    '특정 인덱스의 정규식 항목을 수정합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  write_regex_by_identity:
    'comment + preview/hash identity로 정규식 항목을 수정합니다. 중복 comment면 실패합니다. facade preview_edit/apply_edit identity selector를 우선 사용하세요. 사용자 확인 필요.',
  add_regex: '새 정규식 항목을 추가합니다. 사용자 확인 필요.',
  replace_in_regex:
    '정규식 항목의 find 또는 replace 필드에서 문자열 치환을 수행합니다. 대형 regex 필드를 전체 읽지 않고 서버에서 직접 처리합니다. regex: true + flags 옵션으로 정규식 지원. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  insert_in_regex:
    '정규식 항목의 find 또는 replace 필드에 텍스트를 삽입합니다. 대형 regex 필드를 전체 읽지 않고 서버에서 직접 처리합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  delete_regex:
    '특정 인덱스의 정규식 항목을 삭제합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  delete_regex_by_identity:
    'comment + preview/hash identity로 정규식 항목을 삭제합니다. 중복 comment면 실패합니다. facade preview_edit/apply_edit identity selector를 우선 사용하세요. 사용자 확인 필요.',
  add_regex_batch: '여러 정규식 항목을 한 번에 추가합니다. 최대 50개. 단일 확인으로 전부 추가됩니다. 사용자 확인 필요.',
  write_regex_batch:
    '여러 정규식 항목을 한 번에 수정합니다. 변경 사항 요약을 보여주고 한 번의 확인으로 전부 적용합니다. 각 항목에 optional expected_comment를 넣으면 stale index를 감지할 수 있습니다. 최대 50개. 사용자 확인 필요.',
  list_greetings:
    '인사말 목록을 확인합니다 (인덱스, 크기, 미리보기 100자). type="alternate"는 추가 첫 메시지(alternateGreetings), type="group"은 그룹 전용 인사말(groupOnlyGreetings). read_field("alternateGreetings") 대신 이 도구를 사용하세요 — 전체 덤프를 방지합니다. filter/content_filter로 특정 키워드가 포함된 인사말만 검색 가능.',
  read_greeting: '특정 인덱스의 인사말 하나를 읽습니다. list_greetings로 목록을 먼저 확인하세요.',
  read_greeting_batch: '여러 인사말을 한 번에 읽습니다. read_greeting을 반복 호출하는 대신 이 도구를 사용하세요.',
  read_greeting_by_hash:
    'preview/hash identity로 인사말을 읽습니다. 새 LLM 흐름에서는 facade read_content selector { family: "greeting", greeting_type, identity }를 우선 사용하세요.',
  write_greeting:
    '특정 인덱스의 alternate 인사말을 수정합니다. groupOnlyGreetings(type="group")는 deprecated 호환 필드라 읽기 전용입니다. optional expected_preview로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  write_greeting_by_hash:
    'preview/hash identity로 alternate 인사말을 수정합니다. 같은 identity가 여러 개면 실패합니다. facade preview_edit/apply_edit identity selector를 우선 사용하세요. 사용자 확인 필요.',
  add_greeting:
    '새 alternate 인사말을 추가합니다. groupOnlyGreetings(type="group")는 deprecated 호환 필드라 읽기 전용입니다. 사용자 확인 필요.',
  delete_greeting:
    '특정 인덱스의 alternate 인사말을 삭제합니다. groupOnlyGreetings(type="group")는 deprecated 호환 필드라 읽기 전용입니다. optional expected_preview로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  delete_greeting_by_hash:
    'preview/hash identity로 alternate 인사말을 삭제합니다. 같은 identity가 여러 개면 실패합니다. facade preview_edit/apply_edit identity selector를 우선 사용하세요. 사용자 확인 필요.',
  batch_delete_greeting:
    '여러 alternate 인사말을 한 번에 삭제합니다. groupOnlyGreetings(type="group")는 deprecated 호환 필드라 읽기 전용입니다. 인덱스를 내림차순 처리하여 시프트 문제를 방지합니다. optional expected_previews를 함께 보내면 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  batch_write_greeting:
    '여러 alternate 인사말을 한 번에 수정합니다. groupOnlyGreetings(type="group")는 deprecated 호환 필드라 읽기 전용입니다. 변경 사항 요약을 보여주고 한 번의 확인으로 전부 적용합니다. 각 항목에 optional expected_preview를 넣으면 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  reorder_greetings:
    '인사말의 순서를 변경합니다. 현재 배열 크기와 동일한 길이의 인덱스 배열을 전달하세요. 사용자 확인 필요.',
  list_triggers:
    '트리거 스크립트 목록을 확인합니다 (인덱스, comment, type, conditionCount, effectCount, lowLevelAccess). read_field("triggerScripts") 대신 이 도구를 사용하세요 — 전체 JSON 덤프를 방지합니다.',
  read_trigger: '특정 인덱스의 트리거 스크립트를 읽습니다. list_triggers로 목록을 먼저 확인하세요.',
  read_trigger_batch:
    '여러 트리거 스크립트를 한 번에 읽습니다. read_trigger를 반복 호출하는 대신 이 도구를 사용하세요.',
  write_trigger:
    '특정 인덱스의 트리거 스크립트를 수정합니다. 변경할 필드만 전달하면 나머지는 유지됩니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  add_trigger: '새 트리거 스크립트를 추가합니다. 사용자 확인 필요.',
  delete_trigger:
    '특정 인덱스의 트리거 스크립트를 삭제합니다. optional expected_comment로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  list_lua:
    'Lua 코드의 섹션 목록을 확인합니다 (-- ===== 섹션명 ===== 구분자 기준). 각 섹션의 인덱스, 이름, 크기를 반환합니다.',
  read_lua: '특정 인덱스의 Lua 섹션 코드를 읽습니다. list_lua로 섹션 목록을 먼저 확인하세요.',
  read_lua_batch: '여러 Lua 섹션을 한 번에 읽습니다. read_lua를 반복 호출하는 대신 이 도구를 사용하세요.',
  write_lua:
    '특정 인덱스의 Lua 섹션 코드를 교체합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 사용자 확인 필요. 섹션 전체 코드를 content로 전달하세요.',
  replace_in_lua:
    'Lua 섹션 내에서 문자열 치환을 수행합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 대용량 섹션을 통째로 읽고 쓸 필요 없이 서버에서 직접 치환합니다. 사용자 확인 필요.',
  insert_in_lua:
    'Lua 섹션에 코드를 삽입합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 전체를 읽지 않고 특정 위치에 추가. position: "end"(기본, 끝에 추가), "start"(앞에 추가), "after"(anchor 뒤에 삽입), "before"(anchor 앞에 삽입). 사용자 확인 필요.',
  add_lua_section:
    '새 Lua 섹션을 이름과 함께 추가합니다. 기존 마지막 섹션 뒤에 올바른 구분자(-- ===== name =====)와 함께 생성됩니다. insert_in_lua는 구분자를 이스케이프하므로 새 섹션 추가에는 이 도구를 사용하세요. 사용자 확인 필요.',
  list_css:
    'CSS 코드의 섹션 목록을 확인합니다 (/* ===== 섹션명 ===== */ 구분자 기준). 각 섹션의 인덱스, 이름, 크기를 반환합니다.',
  read_css: '특정 인덱스의 CSS 섹션 코드를 읽습니다. list_css로 섹션 목록을 먼저 확인하세요.',
  read_css_batch: '여러 CSS 섹션을 한 번에 읽습니다. read_css를 반복 호출하는 대신 이 도구를 사용하세요.',
  write_css:
    '특정 인덱스의 CSS 섹션 코드를 교체합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 사용자 확인 필요. 섹션 전체 코드를 content로 전달하세요.',
  replace_in_css:
    'CSS 섹션 내에서 문자열 치환을 수행합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 대용량 섹션을 통째로 읽고 쓸 필요 없이 서버에서 직접 치환합니다. 사용자 확인 필요.',
  insert_in_css:
    'CSS 섹션에 코드를 삽입합니다. optional expected_hash / expected_preview로 stale index를 감지할 수 있습니다. 전체를 읽지 않고 특정 위치에 추가. position: "end"(기본, 끝에 추가), "start"(앞에 추가), "after"(anchor 뒤에 삽입), "before"(anchor 앞에 삽입). 사용자 확인 필요.',
  add_css_section:
    '새 CSS 섹션을 이름과 함께 추가합니다. 기존 마지막 섹션 뒤에 올바른 구분자와 함께 생성됩니다. insert_in_css는 구분자를 이스케이프하므로 새 섹션 추가에는 이 도구를 사용하세요. 사용자 확인 필요.',
  list_references:
    '로드된 참고 자료 파일 목록을 확인합니다 (읽기 전용). 각 파일의 필드와 크기를 포함합니다. 메인 파일이 열려 있지 않아도 동작합니다. 큰 참고 필드는 search_in_reference_field / read_reference_field_range로 좁혀 읽고, lorebook/lua/css/regex는 list_reference_* → read_reference_*를 사용하세요.',
  read_reference_field:
    '참고 자료 파일의 짧은 scalar/top-level 필드를 읽습니다 (읽기 전용). ⚠️ lorebook/lua/css/alternateGreetings/groupOnlyGreetings/triggerScripts/regex는 전용 list_reference_* → read_reference_* 도구를 우선 사용하세요. 큰 reference 텍스트는 search_in_reference_field 또는 read_reference_field_range부터 시작하는 편이 안전합니다.',
  read_reference_field_batch:
    '참고 자료 파일의 여러 필드를 한번에 읽습니다. 짧은 top-level 필드를 함께 비교할 때 사용하세요. lorebook/lua/css 전체 덤프 대신 전용 list/read 도구를 우선 사용하세요.',
  search_in_reference_field:
    '참고 자료 파일의 텍스트 필드에서 문자열을 검색하고 주변 컨텍스트와 함께 반환합니다. 큰 reference 필드를 통째로 읽지 않고 필요한 위치만 찾을 때 유용합니다.',
  read_reference_field_range:
    '참고 자료 파일의 큰 텍스트 필드에서 특정 구간만 읽습니다. 전체를 읽지 않고 문자 오프셋과 길이로 필요한 부분만 가져옵니다.',
  list_reference_greetings:
    '참고 자료 파일의 인사말 목록을 확인합니다 (alternate/group, 읽기 전용). read_reference_field("alternateGreetings"/"groupOnlyGreetings") 대신 이 도구로 인덱스를 먼저 좁히세요.',
  read_reference_greeting:
    '참고 자료 파일의 인사말 하나를 읽습니다 (읽기 전용). list_reference_greetings로 인덱스를 확인한 뒤 사용하세요.',
  read_reference_greeting_batch: '참고 자료 파일의 여러 인사말을 한 번에 읽습니다 (읽기 전용).',
  list_reference_triggers:
    '참고 자료 파일의 트리거 스크립트 목록을 확인합니다 (읽기 전용). read_reference_field("triggerScripts")의 전체 JSON 덤프 대신 comment/type/count 요약을 반환합니다.',
  read_reference_trigger:
    '참고 자료 파일의 트리거 스크립트 하나를 읽습니다 (읽기 전용). list_reference_triggers로 인덱스를 확인한 뒤 사용하세요.',
  read_reference_trigger_batch: '참고 자료 파일의 여러 트리거 스크립트를 한 번에 읽습니다 (읽기 전용).',
  list_reference_lorebook:
    '참고 자료 파일의 로어북 항목 목록을 확인합니다 (인덱스, 코멘트, 키, 활성화 상태, content 크기, 폴더, 미리보기). filter, folder, content_filter로 범위를 좁히세요. read_reference_field("lorebook") 대신 이 도구를 사용하세요.',
  read_reference_lorebook:
    '참고 자료 파일의 특정 로어북 항목 하나를 읽습니다 (읽기 전용). list_reference_lorebook으로 인덱스 확인 후 사용.',
  read_reference_lorebook_batch: '참고 자료 파일의 여러 로어북 항목을 한 번에 읽습니다 (읽기 전용).',
  list_reference_lua:
    '참고 자료 파일의 Lua 섹션 목록을 확인합니다 (인덱스, 이름, 크기). read_reference_field("lua") 대신 이 도구를 사용하세요.',
  read_reference_lua:
    '참고 자료 파일의 특정 Lua 섹션 하나를 읽습니다 (읽기 전용). list_reference_lua로 인덱스 확인 후 사용.',
  read_reference_lua_batch: '참고 자료 파일의 여러 Lua 섹션을 한 번에 읽습니다 (읽기 전용).',
  list_reference_css:
    '참고 자료 파일의 CSS 섹션 목록을 확인합니다 (인덱스, 이름, 크기). read_reference_field("css") 대신 이 도구를 사용하세요.',
  read_reference_css:
    '참고 자료 파일의 특정 CSS 섹션 하나를 읽습니다 (읽기 전용). list_reference_css로 인덱스 확인 후 사용.',
  read_reference_css_batch: '참고 자료 파일의 여러 CSS 섹션을 한 번에 읽습니다 (읽기 전용).',
  list_reference_regex:
    '참고 자료 파일의 정규식 스크립트 항목 목록을 확인합니다 (읽기 전용). 각 항목의 인덱스, comment, type, findSize, replaceSize를 반환합니다. read_reference_field("regex") 대신 이 도구를 사용하세요 — 전체 JSON 덤프를 방지합니다.',
  read_reference_regex:
    '참고 자료 파일의 특정 정규식 항목 하나를 읽습니다 (읽기 전용). list_reference_regex로 인덱스 확인 후 사용.',
  read_reference_regex_batch: '참고 자료 파일의 여러 정규식 항목을 한 번에 읽습니다 (읽기 전용).',
  list_reference_risup_prompt_items:
    '참고 자료 파일이 .risup일 때 promptTemplate 항목 목록을 읽습니다 (읽기 전용). 각 항목의 index, type, supported, id, preview를 반환합니다.',
  read_reference_risup_prompt_item:
    '참고 자료 파일이 .risup일 때 promptTemplate 항목 하나를 읽습니다 (읽기 전용). list_reference_risup_prompt_items로 인덱스 확인 후 사용하세요.',
  read_reference_risup_prompt_item_batch:
    '참고 자료 파일이 .risup일 때 여러 promptTemplate 항목을 한 번에 읽습니다 (읽기 전용).',
  read_reference_risup_formating_order:
    '참고 자료 파일이 .risup일 때 formatingOrder를 토큰 목록으로 읽습니다 (읽기 전용). warnings 배열에 dangling/duplicate 진단이 포함됩니다.',
  list_risum_assets: '.risum 파일의 내장 에셋 목록을 확인합니다 (인덱스, 이름, 경로, 크기).',
  read_risum_asset: '.risum 파일의 내장 에셋을 base64로 읽습니다.',
  add_risum_asset: '.risum 파일에 에셋을 추가합니다. base64로 인코딩된 데이터를 전달. 사용자 확인 필요.',
  delete_risum_asset:
    '.risum 파일의 내장 에셋을 삭제합니다. optional expected_path로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  list_charx_assets: '.charx 파일의 내장 에셋 목록을 확인합니다 (인덱스, 경로, 크기).',
  read_charx_asset: '.charx 파일의 내장 에셋을 base64로 읽습니다.',
  add_charx_asset: '.charx 파일에 에셋을 추가합니다. base64로 인코딩된 데이터를 전달. 사용자 확인 필요.',
  delete_charx_asset:
    '.charx 파일의 내장 에셋을 삭제합니다. optional expected_path로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  rename_charx_asset:
    '.charx 파일의 내장 에셋 이름을 변경합니다. optional expected_path로 stale index를 감지할 수 있습니다. 사용자 확인 필요.',
  compress_assets_webp:
    'charx 또는 risum 이미지 에셋을 WebP 손실 압축으로 변환합니다. dry_run으로 변환 후보를 미리 볼 수 있습니다. SVG는 건너뛰며, WebP가 원본보다 크면 원본과 메타데이터를 유지합니다. 사용자 확인 필요.',
  export_lorebook_to_files:
    '로어북 항목을 파일 시스템으로 내보냅니다. MD 형식: 항목당 1개 파일 + 폴더 구조를 디렉토리로 매핑. JSON 형식: 단일 lorebook.json 파일. 사용자 확인 필요.',
  import_lorebook_from_files:
    '파일 시스템에서 로어북 항목을 가져옵니다. MD 형식: 디렉토리의 .md 파일에서 YAML frontmatter + content 파싱. JSON 형식: lorebook.json 파일에서 가져오기. dry_run으로 미리보기 가능. 사용자 확인 필요.',
  export_field_to_file:
    '필드 내용을 파일로 내보냅니다. description, globalNote, firstMessage 등 텍스트 필드를 로컬 파일로 저장합니다. 사용자 확인 필요.',
  extract_charx_to_project_folder:
    '큰 필드를 MCP 응답으로 읽기 어렵거나 외부 에디터/AI CLI로 직접 수정해야 할 때, .charx/.risum/.risup 파일을 프로젝트 폴더(card.json/module.json/preset.json, markdown 파일, assets/)로 추출합니다. 사용자 확인 필요.',
  reassemble_project_folder_to_charx:
    'RisuToki 프로젝트 폴더를 다시 .charx/.risum/.risup 파일로 내보냅니다. 프로젝트 폴더에서 긴 markdown/json/assets 파일을 직접 편집한 뒤 사용하세요. 사용자 확인 필요.',
  list_skills: '사용 가능한 RisuAI 스킬과 설명, 문서 파일 목록을 반환합니다.',
  read_skill: '스킬 문서를 읽습니다. file을 생략하면 SKILL.md를 반환합니다.',
  tag_db_status:
    'Danbooru 태그 DB의 로딩 상태를 확인합니다. 태그 도구 사용 전 DB가 정상 로드되었는지 진단할 때 사용하세요.',
  validate_danbooru_tags:
    'Validate whether given tags are valid Danbooru tags. Returns validation result for each tag with suggestions for invalid ones. IMPORTANT: Always use this tool to verify your tags before using them in image generation prompts.',
  search_danbooru_tags:
    'Search for Danbooru tags matching a query. Use this to find the correct tag name for a concept. Supports wildcard (*) patterns. Results are sorted by popularity (post count).',
  get_popular_danbooru_tags:
    'Get popular Danbooru tags sorted by usage count. Use group_by_semantic=true to get tags organized by category (hair, eyes, clothing, pose, etc.) — very useful when writing character image prompts.',
  validate_cbs:
    'Validate CBS {{#when}} block nesting and structure. Checks open/close balance for all CBS blocks. Use all_combos to test every toggle combination for resolve errors.',
  list_cbs_toggles:
    'List all CBS toggles used in the file. Shows toggle names, their conditions (is:0, is:1, etc.), and which fields reference them.',
  simulate_cbs:
    'Resolve CBS blocks with specific toggle values to preview the resulting text. The toggle_ prefix is auto-added to toggle names. Use all_combos to generate all possible outputs.',
  diff_cbs:
    'Compare CBS output between baseline (all toggles=0) and specified toggle values. Shows added and removed lines.',
  list_risup_prompt_items:
    'Lists all items in the risup preset promptTemplate with type, supported flag, stable id, and a concise preview. Each item includes an additive "id" field for stable identification (null for unsupported items). The current file must be a .risup preset. Returns 400 if the file is not risup or if promptTemplate JSON is invalid.',
  search_in_risup_prompt_items:
    'Searches text-bearing risup prompt items by substring and returns matching indices, matched field names, stable ids, and previews. Searches supported text/name fields plus raw JSON for unsupported items. The current file must be a .risup preset.',
  read_risup_prompt_item:
    'Reads a single prompt item from the risup promptTemplate by index. Returns the raw item object plus supported/type metadata and an additive "id" field for stable identification. The current file must be a .risup preset.',
  read_risup_prompt_item_batch:
    'Reads multiple risup prompt items in one call. Invalid indices return null entries so the caller can preserve ordering while skipping missing items. Prefer this over repeated read_risup_prompt_item calls when inspecting several items.',
  write_risup_prompt_item:
    'Replaces a single prompt item in the risup promptTemplate by index. Only supported item types are accepted (plain, jailbreak, cot, chatML, persona, description, lorebook, postEverything, memory, authornote, chat, cache). For unsupported/raw structures use write_field("promptTemplate"). Optional expected_type / expected_preview guards can detect stale indices. Requires user confirmation. Successful responses may include additive "orderWarnings" when the resulting prompt no longer matches formatingOrder references.',
  write_risup_prompt_item_batch:
    'Replaces multiple risup prompt items by index in a single confirmed operation. Only supported item types are accepted. Prefer this over repeated write_risup_prompt_item calls when editing several sibling items. Each write can carry optional expected_type / expected_preview guards to detect stale indices. Requires user confirmation. Successful responses may include additive "orderWarnings" for the resulting prompt/formatingOrder consistency state.',
  add_risup_prompt_item:
    'Appends a new prompt item to the risup promptTemplate. Only supported item types are accepted (plain, jailbreak, cot, chatML, persona, description, lorebook, postEverything, memory, authornote, chat, cache). For unsupported/raw structures use write_field("promptTemplate"). Requires user confirmation. Successful responses may include additive "orderWarnings".',
  add_risup_prompt_item_batch:
    'Appends multiple new prompt items to the risup promptTemplate in one confirmed operation. Only supported item types are accepted. Prefer this over repeated add_risup_prompt_item calls when building or extending a preset. Requires user confirmation. Successful responses may include additive "orderWarnings".',
  delete_risup_prompt_item:
    'Deletes a single prompt item from the risup promptTemplate by index. Optional expected_type / expected_preview guards can detect stale indices. Requires user confirmation. Successful responses may include additive "orderWarnings".',
  batch_delete_risup_prompt_items:
    'Deletes multiple prompt items from the risup promptTemplate by indices in a single confirmed operation. Optional expected_types / expected_previews arrays (same order as indices) guard against stale indices. Requires user confirmation. Successful responses may include additive "orderWarnings".',
  reorder_risup_prompt_items:
    'Reorders all prompt items in the risup promptTemplate. The order array must be a full permutation of [0, 1, ..., n-1] where n is the current item count. Requires user confirmation. Successful responses may include additive "orderWarnings".',
  read_risup_prompt_item_by_id:
    'Reads a single supported risup prompt item by stable id from list_risup_prompt_items. Prefer facade read_content with selector { family: "risup-prompt", id } for new LLM workflows.',
  write_risup_prompt_item_by_id:
    'Replaces a supported risup prompt item by stable id. Prefer facade preview_edit/apply_edit with selector { family: "risup-prompt", id } when possible. Requires user confirmation.',
  delete_risup_prompt_item_by_id:
    'Deletes a supported risup prompt item by stable id. Prefer facade preview_edit/apply_edit with selector { family: "risup-prompt", id } when possible. Requires user confirmation.',
  write_risup_prompt_item_by_id_batch:
    'Replaces multiple supported risup prompt items by stable ids in one confirmed operation. Use for granular batch workflows; facade id selectors remain preferred for simple writes. Requires user confirmation.',
  batch_delete_risup_prompt_items_by_id:
    'Deletes multiple supported risup prompt items by stable ids in one confirmed operation. Requires user confirmation.',
  reorder_risup_prompt_items_by_id:
    'Reorders all supported risup prompt items by a full stable-id permutation. Use when order may have shifted since index discovery. Requires user confirmation.',
  read_risup_formating_order:
    'Reads the risup formatingOrder as a list of tokens with known/unknown flags. Includes an additive "warnings" array with informational diagnostics for duplicate or dangling token references. The current file must be a .risup preset. Returns 400 if formatingOrder JSON is invalid.',
  write_risup_formating_order:
    'Writes the risup formatingOrder. All tokens must be strings; unknown tokens are preserved as-is. Non-string tokens are rejected with 400. Requires user confirmation. Successful responses include an additive "warnings" array with duplicate/dangling token diagnostics relative to the current promptTemplate.',
  diff_risup_prompt:
    'Compares the current .risup prompt surface against a loaded reference .risup file. Returns serializer-based promptTemplate line differences plus formatingOrder token differences and warnings. This is a compare precursor for prompt editing workflows and does not mutate the file.',
  export_risup_prompt_to_text:
    'Exports the current risup promptTemplate to a structured text format intended for human review or text-based editing. The output preserves supported item IDs, supported-item extra JSON fields, and unsupported/raw items through explicit raw blocks. The current file must be a .risup preset.',
  copy_risup_prompt_items_as_text:
    'Copies selected risup promptTemplate items to the structured text format without exporting the whole template. The order of the indices array controls the output order, so this is the preferred block-level reuse tool before reaching for a persistent library. The current file must be a .risup preset.',
  import_risup_prompt_from_text:
    'Imports the structured risup prompt text format. By default it replaces the entire promptTemplate; set mode="append" to insert the parsed items into the existing template, optionally at insertAt. Set dry_run=true to validate and preview the parsed items without mutating the file. The current file must be a .risup preset. Requires user confirmation unless dry_run is used. Dry-run and successful mutation responses may include additive "orderWarnings".',
  list_risup_prompt_snippets:
    'Lists persistent risup prompt snippets stored in the app sidecar library. This library survives app restarts and is intended for reusable prompt blocks built on the structured text serializer.',
  read_risup_prompt_snippet:
    'Reads one persistent risup prompt snippet by snippet id or exact name. Returns the stored structured text plus snippet metadata, so it can be reviewed or reused before insertion.',
  save_risup_prompt_snippet:
    'Saves or updates a persistent risup prompt snippet in the app sidecar library. Provide exactly one source: either serializer text via text, or current promptTemplate blocks via indices. Requires user confirmation.',
  insert_risup_prompt_snippet:
    'Inserts a stored risup prompt snippet into the current .risup promptTemplate using fresh item ids. Set dry_run=true to preview the insertion without mutating the file. Requires user confirmation unless dry_run is used. Successful responses may include additive "orderWarnings".',
  delete_risup_prompt_snippet:
    'Deletes a persistent risup prompt snippet from the app sidecar library by snippet id or exact name. Requires user confirmation.',
  validate_risup_prompt_import:
    'Validates that the current promptTemplate matches the expected text after import_risup_prompt_from_text. Compares each item by serialized text (ignoring generated IDs) and reports match/mismatch per item. Read-only — no mutation.',
} as const;
