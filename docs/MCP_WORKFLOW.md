# MCP Workflow Guide

MCP 도구를 사용해 `.charx` / `.risum` / `.risup` 파일을 편집할 때의 도구 선택, 읽기 규칙, 워크플로 패턴, 주의사항을 다룹니다.

도구 패밀리와 경계 정의는 [`docs/MCP_TOOL_SURFACE.md`](MCP_TOOL_SURFACE.md),
에러/no-op/성공 응답 계약은 [`docs/MCP_ERROR_CONTRACT.md`](MCP_ERROR_CONTRACT.md)를 참고하세요.

---

## 1. 빠른 도구 라우팅 맵

| 카테고리                 | 우선 도구                                                                                                                                                                                                       | 언제 쓰나                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **필드**                 | `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`                                                                                                                             | 작은 텍스트 필드 전체 읽기/쓰기                                                         |
| **대형 필드 편집**       | `search_in_field`, `read_field_range`, `replace_in_field`, `replace_in_field_batch`, `replace_block_in_field`, `insert_in_field`                                                                                | 수십 KB 이상 필드에서 부분 수정                                                         |
| **외부 파일 probe/open** | `probe_field`, `probe_field_batch`, `probe_lorebook`, `probe_regex`, `probe_lua`, `open_file`                                                                                                                   | 에디터에 열지 않은 절대 경로 `.charx` / `.risum` / `.risup` 파일 읽기 및 활성 문서 전환 |
| **Lua 섹션**             | `list_lua`, `read_lua`, `write_lua`, `replace_in_lua`, `insert_in_lua`, `add_lua_section`                                                                                                                       | `lua`를 섹션 단위로 읽고 수정                                                           |
| **CSS 섹션**             | `list_css`, `read_css`, `write_css`, `replace_in_css`, `insert_in_css`, `add_css_section`                                                                                                                       | `css`를 섹션 단위로 읽고 수정                                                           |
| **로어북**               | `list_lorebook`, `read_lorebook`, `read_lorebook_batch`, `write_lorebook`, `write_lorebook_batch`                                                                                                               | 로어북 탐색, 비교, 대량 수정                                                            |
| **정규식**               | `list_regex`, `read_regex`, `write_regex`, `replace_in_regex`, `add_regex_batch`, `write_regex_batch`                                                                                                           | regex 항목 단위 작업                                                                    |
| **인사말 / 트리거**      | `list_greetings`, `read_greeting`, `batch_write_greeting`, `list_triggers`, `read_trigger`, `write_trigger`                                                                                                     | `alternateGreetings` / `triggerScripts` 개별 편집                                       |
| **risup 프롬프트**       | `list_risup_prompt_items`, `read_risup_prompt_item`, `write_risup_prompt_item`, `read_risup_formating_order`, `write_risup_formating_order`                                                                     | `.risup`의 구조화 프롬프트 편집 + prompt-item `id` / `warnings` 메타데이터 확인         |
| **참고 자료**            | `list_references`, `list_reference_lorebook`, `read_reference_lorebook`, `list_reference_lua`, `read_reference_lua`, `list_reference_css`, `read_reference_css`, `list_reference_regex`, `read_reference_regex` | 읽기 전용 참조 자료 비교                                                                |
| **에셋**                 | `list_charx_assets`, `read_charx_asset`, `add_charx_asset`, `list_risum_assets`, `read_risum_asset`, `compress_assets_webp`                                                                                     | 이미지/오디오 에셋 확인, 추가, 압축                                                     |
| **Danbooru / CBS 검증**  | `validate_danbooru_tags`, `search_danbooru_tags`, `get_popular_danbooru_tags`, `validate_cbs`, `list_cbs_toggles`, `simulate_cbs`, `diff_cbs`                                                                   | 이미지 프롬프트 태그 정리, CBS 검증                                                     |
| **스킬 문서**            | `list_skills`, `read_skill`                                                                                                                                                                                     | 워크플로, 파일 구조, CBS/Lua/로어북/정규식/Danbooru 가이드 on-demand 로딩               |

---

## 2. 읽기 규칙

- **다음 필드는 `read_field`로 읽지 마세요.** 전체 덤프가 나와 컨텍스트를 낭비합니다.
  - `lua` → `list_lua` → `read_lua(index)`
  - `css` → `list_css` → `read_css(index)`
  - `alternateGreetings` → `list_greetings("alternate")` → `read_greeting("alternate", index)`
  - `triggerScripts` → `list_triggers` → `read_trigger(index)`
  - `promptTemplate` / `formatingOrder` → `list_risup_prompt_items` / `read_risup_prompt_item` / `read_risup_formating_order`
- 로어북은 `list_lorebook(folder?)` → `read_lorebook(index)` 순서로 읽으세요.
- 정규식은 `list_regex` → `read_regex(index)` 순서로 읽으세요.
- 참고 자료도 동일합니다. `read_reference_field("lorebook")` 같은 전체 덤프 대신 `list_reference_*` / `read_reference_*` 조합을 우선 사용하세요.
- 여러 소형 필드를 같이 파악해야 할 때만 `read_field_batch([...])`를 사용하세요.
- **열리지 않은 파일은 `probe_*`로 먼저 읽으세요.** 실제 수정이 필요할 때만 `open_file`로 현재 활성 문서로 전환한 뒤 기존 write/edit 도구를 사용하세요.
- 구문이나 구조가 애매하면 바로 수정하지 말고 먼저 스킬 문서를 읽으세요.

---

## 3. 효과적인 작업 흐름

### 기본 순서

1. **surface 파악** — `list_fields`, `list_lorebook`, `list_regex`, `list_lua`, `list_css`, `list_triggers` 등으로 범위를 먼저 확인
2. **좁게 읽기** — 필요한 항목/섹션/범위만 읽기
3. **targeted edit** — 작은 필드는 전체 교체, 큰 필드는 검색 후 부분 교체
4. **batch 우선** — 이웃한 여러 항목을 수정할 땐 batch 도구를 우선 사용
5. **검증** — CBS/태그/참고 자료 비교/프리뷰로 결과 확인

### 상황별 빠른 선택

**필드 내용을 확인하고 싶을 때**

- 소형 필드 → `read_field`
- 열리지 않은 절대 경로 파일 → `probe_field` / `probe_field_batch` / `probe_lorebook` / `probe_regex` / `probe_lua`
- 대형 필드에서 특정 문자열 찾기 → `search_in_field`
- 대형 필드의 특정 위치 확인 → `read_field_range`
- 전체를 로컬 파일로 열어야 함 → `export_field_to_file`

**필드 내용을 수정하고 싶을 때**

- 열리지 않은 파일을 수정해야 함 → `open_file(file_path=...)`로 활성 문서 전환 후 기존 `write_*` / `replace_*` 도구 사용
- 소형 필드 → `read_field` → `write_field`
- 대형 필드 단일 치환 → `search_in_field` → `replace_in_field`
- 대형 필드 다중 치환 → `replace_in_field_batch`
- 앵커 기반 블록 교체 → `replace_block_in_field`

**로어북 여러 항목을 다룰 때**

- 읽기 → `read_lorebook_batch`
- 수정 → `write_lorebook_batch`
- 이름/문구 일괄 치환 → `replace_across_all_lorebook`
- 키 품질 점검 → `validate_lorebook_keys`

**참고 자료와 비교할 때**

- 가장 효율적인 비교 → `diff_lorebook`
- 수동 비교 → `list_reference_*` → `read_reference_*`

**안전망이 필요할 때**

- 편집 전 백업 → `snapshot_field`
- 롤백 → `list_snapshots` → `restore_snapshot`
- 요약 통계 → `get_field_stats`

### 절대 하지 말 것

- `replace_in_field`를 검색 용도로 사용하지 마세요.
- 전용 도구가 있는 surface를 `read_field`로 통째로 읽지 마세요.
- 여러 항목을 수정하는데 단일 write 도구를 반복 호출하지 마세요. 가능한 한 batch 도구를 우선 사용하세요.

---

## 4. 주의사항

### 쓰기 동작

- `write_field`, `write_lorebook`, `add_*`, `delete_*` 계열은 **사용자 확인 팝업**이 뜹니다.
- 로어북 `comment`는 Lua `getLoreBooks()` 검색에 쓰일 수 있으므로, comment 변경 시 Lua 검색 패턴과 반드시 맞는지 확인하세요.
- 참고 자료(`references`)는 **읽기 전용**입니다.
- `list_lorebook` 결과에서 `mode: "folder"`인 항목은 폴더 자체입니다.

### risup 관련

- risup의 복잡한 중첩 객체(`ooba`, `NAISettings`, `customFlags` 등)는 보존되지만 개별 폼으로는 다루지 않습니다.
- `.risup`는 gzip / zlib / raw-deflate 변형까지 호환되며 저장 시 감지한 압축 모드를 최대한 유지합니다.
- `promptTemplate` / `formatingOrder`는 구조화 UI와 전용 MCP 도구가 우선 surface입니다. unsupported raw shape를 직접 만져야 할 때만 `write_field` fallback을 사용하세요.
- `list_risup_prompt_items` / `read_risup_prompt_item` 응답에는 additive `id` 필드가, `read_risup_formating_order` 응답에는 advisory `warnings` 배열이 포함됩니다. 라우팅은 아직 index 기반이 기본이며, raw `write_field("promptTemplate")`로 명시적 `id`를 쓰면 그대로 round-trip됩니다.
- risup fallback write surface도 무제한 passthrough가 아닙니다. `write_field`, `write_field_batch`, autosave는 `promptTemplate`, `formatingOrder`, `presetBias`, `localStopStrings`에 대해 UI 저장과 같은 validation boundary를 적용하며, malformed JSON/shape는 400 또는 autosave failure로 즉시 거부됩니다.

### 자동 저장 / 복구

- 비정상 종료 뒤 재시작 시 자동 저장 복원 프롬프트가 뜰 수 있습니다. 복원하면 파일 라벨에 `[자동복원]`이 붙고 상태바에 provenance가 표시되며, autosave 옆에는 `.toki-recovery.json` sidecar가 함께 기록됩니다.

### 프리뷰

- 프리뷰 패널은 초기화·런타임 진단을 인라인 배너로 표시합니다. iframe이 5 초 안에 준비되지 않으면 타임아웃 에러를, Lua 트리거 실패 등 런타임 에러가 발생하면 해당 메시지를 패널 안에서 바로 볼 수 있습니다. 컨트롤러 레벨의 Wasmoon preflight(`ensureWasmoon()`)는 프리뷰 패널 밖에서 처리되며 이 배너에 포함되지 않습니다.
- 프리뷰는 현재 `.charx` 파일에서만 열립니다. `.risum` / `.risup`가 열려 있으면 보기 메뉴의 프리뷰 항목과 `F5` 경로가 모두 차단됩니다. 내부적으로는 `_fileType` 누락과 명시적 `_fileType: 'charx'`를 모두 charx로 취급해야 합니다.
- 프리뷰 Lua의 `setDescription`, `setPersonality`, `setScenario`, `setFirstMessage`는 preview-local 상태를 즉시 갱신하므로, 카드 필드 변경 트리거를 프리뷰 안에서 검증할 수 있습니다.
- 프리뷰 매크로는 `{{charpersona}}`와 `{{chardesc}}`를 서로 다른 필드로 유지해야 합니다. `{{charpersona}}`는 personality, `{{chardesc}}`는 description을 읽습니다.

### MCP 분류 체계

- `src/lib/mcp-tool-taxonomy.ts`가 120개 도구를 19개 패밀리로 분류하는 단일 소스 오브 트루스입니다. 도구 추가/삭제 시 이 파일도 함께 갱신해야 하며, `mcp-tool-taxonomy.test.ts`가 양방향 완전성(orphan/phantom 없음)과 행동 힌트 일관성을 검증합니다.
- MCP SDK `ToolAnnotations`(readOnlyHint, destructiveHint, idempotentHint, openWorldHint)는 등록 후 `RegisteredTool.update()`로 자동 패치됩니다.

> MCP 에러/no-op/성공 응답 계약의 상세 내용은 [`docs/MCP_ERROR_CONTRACT.md`](MCP_ERROR_CONTRACT.md)를 참고하세요.

---

## 5. 스킬 문서

### 가장 먼저 읽을 스킬

- `read_skill("using-mcp-tools")` — 도구 선택, 대형 필드 편집, batch-first 원칙
- `read_skill("file-structure-reference")` — `.charx`, `.risum`, `.risup`, lorebook, regex 구조
- `read_skill("writing-danbooru-tags")` — Danbooru 태그 검색/검증 워크플로

### 세부 문법 스킬

- `read_skill("writing-cbs-syntax")`
- `read_skill("writing-lua-scripts")`
- `read_skill("writing-lorebooks")`
- `read_skill("writing-regex-scripts")`
- `read_skill("writing-html-css")`
- `read_skill("writing-trigger-scripts")`

### 더 깊은 참조

- `read_skill("using-mcp-tools", "TOOL_REFERENCE.md")` — 전체 MCP 도구 카탈로그 요약
- `read_skill("using-mcp-tools", "FILE_STRUCTURES.md")` — 빠른 구조 포인터

### 스킬 폴더가 비어 보일 때

`list_skills` 결과가 비어 있으면 로컬 `skills/` 폴더가 손실되었거나 링크 복구가 필요한 상태로 보고 아래를 먼저 확인하세요.

1. `npm run sync:skills`
2. 작업 트리의 `skills/` 디렉터리 상태
3. `.claude/skills`, `.gemini/skills`, `.github/skills` 링크 상태

그래도 비어 있으면 `guides/`와 코드베이스 자체를 우선 참조하세요.

`list_skills`는 각 스킬에 대해 `name`, `description`, `tags`, `relatedTools`, `files` 메타데이터를 반환합니다. 어떤 가이드를 읽어야 할지 애매하면 먼저 `list_skills`로 고르고, 그다음 `read_skill(name, file?)`로 필요한 파일만 여세요.
