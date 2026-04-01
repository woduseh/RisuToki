# Risutoki + AI Coding Assistant — Charx/Risum/Risup Project Guide

> 이 파일은 GitHub Copilot CLI, Codex 등의 AI 코딩 어시스턴트가 세션 시작 시 자동으로 읽습니다.
> RisuToki MCP 도구로 RisuAI `.charx`, `.risum`, `.risup` 파일을 편집하는 프로젝트용 공용 가이드입니다.

---

## 1. 빠른 MCP 지도

| 카테고리                | 우선 도구                                                                                                                                                                                                       | 언제 쓰나                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **필드**                | `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`                                                                                                                             | 작은 텍스트 필드 전체 읽기/쓰기                                                 |
| **대형 필드 편집**      | `search_in_field`, `read_field_range`, `replace_in_field`, `replace_in_field_batch`, `replace_block_in_field`, `insert_in_field`                                                                                | 수십 KB 이상 필드에서 부분 수정                                                 |
| **Lua 섹션**            | `list_lua`, `read_lua`, `write_lua`, `replace_in_lua`, `insert_in_lua`, `add_lua_section`                                                                                                                       | `lua`를 섹션 단위로 읽고 수정                                                   |
| **CSS 섹션**            | `list_css`, `read_css`, `write_css`, `replace_in_css`, `insert_in_css`, `add_css_section`                                                                                                                       | `css`를 섹션 단위로 읽고 수정                                                   |
| **로어북**              | `list_lorebook`, `read_lorebook`, `read_lorebook_batch`, `write_lorebook`, `write_lorebook_batch`                                                                                                               | 로어북 탐색, 비교, 대량 수정                                                    |
| **정규식**              | `list_regex`, `read_regex`, `write_regex`, `replace_in_regex`, `add_regex_batch`, `write_regex_batch`                                                                                                           | regex 항목 단위 작업                                                            |
| **인사말 / 트리거**     | `list_greetings`, `read_greeting`, `batch_write_greeting`, `list_triggers`, `read_trigger`, `write_trigger`                                                                                                     | `alternateGreetings` / `triggerScripts` 개별 편집                               |
| **risup 프롬프트**      | `list_risup_prompt_items`, `read_risup_prompt_item`, `write_risup_prompt_item`, `read_risup_formating_order`, `write_risup_formating_order`                                                                     | `.risup`의 구조화 프롬프트 편집 + prompt-item `id` / `warnings` 메타데이터 확인 |
| **참고 자료**           | `list_references`, `list_reference_lorebook`, `read_reference_lorebook`, `list_reference_lua`, `read_reference_lua`, `list_reference_css`, `read_reference_css`, `list_reference_regex`, `read_reference_regex` | 읽기 전용 참조 자료 비교                                                        |
| **에셋**                | `list_charx_assets`, `read_charx_asset`, `add_charx_asset`, `list_risum_assets`, `read_risum_asset`, `compress_assets_webp`                                                                                     | 이미지/오디오 에셋 확인, 추가, 압축                                             |
| **Danbooru / CBS 검증** | `validate_danbooru_tags`, `search_danbooru_tags`, `get_popular_danbooru_tags`, `validate_cbs`, `list_cbs_toggles`, `simulate_cbs`, `diff_cbs`                                                                   | 이미지 프롬프트 태그 정리, CBS 검증                                             |
| **스킬 문서**           | `list_skills`, `read_skill`                                                                                                                                                                                     | 워크플로, 파일 구조, CBS/Lua/로어북/정규식/Danbooru 가이드 on-demand 로딩       |

### `list_skills` 메타데이터

`list_skills`는 각 스킬에 대해 아래 메타데이터를 반환합니다.

- `name`
- `description`
- `tags`
- `relatedTools`
- `files`

어떤 가이드를 읽어야 할지 애매하면 먼저 `list_skills`로 고르고, 그다음 `read_skill(name, file?)`로 필요한 파일만 여세요.

---

## 2. 반드시 지킬 읽기 규칙

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
- 구문이나 구조가 애매하면 바로 수정하지 말고 먼저 스킬 문서를 읽으세요.

---

## 3. 스킬 문서 사용법

### 가장 먼저 읽을 스킬

- `read_skill("using-mcp-tools")`
  - 도구 선택, 대형 필드 편집, batch-first 원칙
- `read_skill("file-structure-reference")`
  - `.charx`, `.risum`, `.risup`, lorebook, regex 구조
- `read_skill("writing-danbooru-tags")`
  - Danbooru 태그 검색/검증 워크플로

### 세부 문법 스킬

- `read_skill("writing-cbs-syntax")`
- `read_skill("writing-lua-scripts")`
- `read_skill("writing-lorebooks")`
- `read_skill("writing-regex-scripts")`
- `read_skill("writing-html-css")`
- `read_skill("writing-trigger-scripts")`

### 더 깊은 참조

- `read_skill("using-mcp-tools", "TOOL_REFERENCE.md")`
  - 전체 MCP 도구 카탈로그 요약
- `read_skill("using-mcp-tools", "FILE_STRUCTURES.md")`
  - 빠른 구조 포인터

### 스킬 폴더가 비어 보일 때

`list_skills` 결과가 비어 있으면 로컬 `skills/` 폴더가 손실되었거나 링크 복구가 필요한 상태로 보고 아래를 먼저 확인하세요.

1. `npm run sync:skills`
2. 작업 트리의 `skills/` 디렉터리 상태
3. `.claude/skills`, `.gemini/skills`, `.github/skills` 링크 상태

그래도 비어 있으면 `guides/`와 코드베이스 자체를 우선 참조하세요.

---

## 4. 효과적인 작업 흐름

### 기본 순서

1. **surface 파악**
   - `list_fields`, `list_lorebook`, `list_regex`, `list_lua`, `list_css`, `list_triggers` 등으로 범위를 먼저 확인
2. **좁게 읽기**
   - 필요한 항목/섹션/범위만 읽기
3. **targeted edit**
   - 작은 필드는 전체 교체, 큰 필드는 검색 후 부분 교체
4. **batch 우선**
   - 이웃한 여러 항목을 수정할 땐 batch 도구를 우선 사용
5. **검증**
   - CBS/태그/참고 자료 비교/프리뷰로 결과 확인

### 상황별 빠른 선택

**필드 내용을 확인하고 싶을 때**

- 소형 필드 → `read_field`
- 대형 필드에서 특정 문자열 찾기 → `search_in_field`
- 대형 필드의 특정 위치 확인 → `read_field_range`
- 전체를 로컬 파일로 열어야 함 → `export_field_to_file`

**필드 내용을 수정하고 싶을 때**

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

## 5. 주의사항

- `write_field`, `write_lorebook`, `add_*`, `delete_*` 계열은 **사용자 확인 팝업**이 뜹니다.
- 로어북 `comment`는 Lua `getLoreBooks()` 검색에 쓰일 수 있으므로, comment 변경 시 Lua 검색 패턴과 반드시 맞는지 확인하세요.
- 참고 자료(`references`)는 **읽기 전용**입니다.
- `list_lorebook` 결과에서 `mode: "folder"`인 항목은 폴더 자체입니다.
- risup의 복잡한 중첩 객체(`ooba`, `NAISettings`, `customFlags` 등)는 보존되지만 개별 폼으로는 다루지 않습니다.
- `.risup`는 gzip / zlib / raw-deflate 변형까지 호환되며 저장 시 감지한 압축 모드를 최대한 유지합니다.
- `promptTemplate` / `formatingOrder`는 구조화 UI와 전용 MCP 도구가 우선 surface입니다. unsupported raw shape를 직접 만져야 할 때만 `write_field` fallback을 사용하세요.
- `list_risup_prompt_items` / `read_risup_prompt_item` 응답에는 additive `id` 필드가, `read_risup_formating_order` 응답에는 advisory `warnings` 배열이 포함됩니다. 라우팅은 아직 index 기반이 기본이며, raw `write_field("promptTemplate")`로 명시적 `id`를 쓰면 그대로 round-trip됩니다.
- risup fallback write surface도 무제한 passthrough가 아닙니다. `write_field`, `write_field_batch`, autosave는 `promptTemplate`, `formatingOrder`, `presetBias`, `localStopStrings`에 대해 UI 저장과 같은 validation boundary를 적용하며, malformed JSON/shape는 400 또는 autosave failure로 즉시 거부됩니다.
- 비정상 종료 뒤 재시작 시 자동 저장 복원 프롬프트가 뜰 수 있습니다. 복원하면 파일 라벨에 `[자동복원]`이 붙고 상태바에 provenance가 표시되며, autosave 옆에는 `.toki-recovery.json` sidecar가 함께 기록됩니다.
- 프리뷰 패널은 초기화·런타임 진단을 인라인 배너로 표시합니다. iframe이 5 초 안에 준비되지 않으면 타임아웃 에러를, Lua 트리거 실패 등 런타임 에러가 발생하면 해당 메시지를 패널 안에서 바로 볼 수 있습니다. 컨트롤러 레벨의 Wasmoon preflight(`ensureWasmoon()`)는 프리뷰 패널 밖에서 처리되며 이 배너에 포함되지 않습니다.
- **MCP 구조화 에러 응답 (v0.34.0 bounded contract)**: regex, greetings, lua 섹션, css 섹션 라우트의 4xx 에러는 구조화된 `mcpError()` 엔벨로프를 반환합니다. 응답에는 `action`, `target`, `status`, `suggestion` 등의 additive 필드가 포함되며, MCP 브릿지 호환을 위해 최상위 `error` 필드도 그대로 유지됩니다. 아직 **모든** MCP 라우트가 이 계약으로 전환된 것은 아닙니다.

---

## 6. 프로젝트별 참고사항

> 아래는 프로젝트 제작자가 작성하는 영역입니다.
> 프로젝트 고유의 규칙, 구조, 가이드 경로 등을 여기에 추가하세요.

### 가이드 파일 위치

- `skills/` — 번들 프로젝트 스킬 문서 위치. 필요하면 이 위치에 로컬 프로젝트 스킬 문서를 추가로 둘 수 있음
- `guides/` — 한국어 원본 가이드 (앱 내 가이드 뷰어로 접근)
- `.claude/skills`, `.gemini/skills`, `.github/skills` — 루트 `skills/`를 가리키는 로컬 CLI 검색 경로. `npm run sync:skills`는 Windows에서 실제 symlink를 우선 만들고, 불가능할 때만 junction으로 폴백하며, 루트 `skills/`가 없으면 조용히 건너뜀

### 프로젝트 규칙

#### 문서 및 버전 관리 (필수)

매 기능 개선·버그 수정 시 **반드시** 아래를 함께 업데이트합니다.

1. **`package.json` 버전 범프** — [시멘틱 버저닝](https://semver.org/) 준수
   - `MAJOR` (x.0.0): 호환성을 깨는 변경
   - `MINOR` (0.x.0): 새 기능 추가 (하위 호환)
   - `PATCH` (0.0.x): 버그 수정 (하위 호환)
2. **`CHANGELOG.md` 업데이트** — [Keep a Changelog](https://keepachangelog.com/) 형식
   - 새 버전 항목을 파일 **최상단**에 추가
   - `### 새 기능` / `### 변경` / `### 수정` / `### 삭제` 카테고리 사용
3. **`README.md` 업데이트** — 새 기능이 사용자에게 보이는 변경이면 해당 섹션 갱신
4. **`AGENTS.md` 및 관련 skill 문서 업데이트**
   - MCP 도구·필드·워크플로우가 변하면 `AGENTS.md`, `skills/README.md`, 관련 `skills/*`를 함께 갱신

이 규칙은 별도 지시가 없어도 **매 작업마다** 자동 적용합니다.

#### Copilot 플루니 페르소나 워크플로

- `rpMode === "pluni"`는 **GitHub Copilot CLI 전용** 고급 페르소나 모드입니다.
- Copilot을 플루니 모드로 시작하면 선택한 카테고리(`solo`, `world-sim`, `multi-char`)에 맞춰 세션 `AGENTS.md`와 임시 `.github/agents/pluni.agent.md`, `kotone.agent.md`, `sophia.agent.md`를 생성합니다.
- 에이전트 파일은 `.agent.md` 확장자와 YAML frontmatter(`---\nname: ...\n---`)를 사용합니다.
- 부트스트랩 경로는 **내장 터미널의 현재 작업 디렉터리(cwd)** 기준으로 결정됩니다. 터미널에서 `cd`로 이동한 뒤 시작하면 그 경로가 프로젝트 루트로 사용됩니다.
- 플루니 모드가 활성화된 상태에서는 메뉴 액션뿐 아니라 **터미널에 직접 `copilot`을 입력해도** 동일한 부트스트랩이 적용됩니다.
- Copilot이 아닌 CLI에서는 같은 3인 자문 구조를 단일 세션 프롬프트로 합성해 전달합니다.
- 이 `.github/agents/*.agent.md` 파일과 세션 `AGENTS.md`는 **런타임 산출물**이므로 소스 파일처럼 취급하거나 커밋하지 않습니다.

#### 검증 및 릴리스 워크플로

- PR / push 검증은 **Ubuntu validate + Windows build** 2단계로 유지합니다.
  - Ubuntu: `npm run lint`, `npm run typecheck`, `npm test`
  - Windows: `npm run build:electron`, `npm run build:renderer`
- PR 단계에서는 패키징(`electron-builder`)까지 돌리지 않고, 태그 릴리스 workflow에서만 실행합니다.
- 의존성 업데이트는 `Dependabot`으로 npm / GitHub Actions를 주간 점검합니다.
