# Changelog

이 파일은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따르며,
[시멘틱 버저닝](https://semver.org/lang/ko/)을 사용합니다.

- **MAJOR (x.0.0)**: 호환성을 깨는 변경
- **MINOR (0.x.0)**: 새 기능 추가 (하위 호환)
- **PATCH (0.0.x)**: 버그 수정 (하위 호환)

---

## [0.15.0] - 2026-03-22

### 새 기능

- **필드 일괄 읽기** (`read_field_batch` MCP 도구) — 여러 필드를 한번에 읽기 (최대 20개). 개별 `read_field` 반복 호출 불필요
- **필드 내 문자열 치환** (`replace_in_field` MCP 도구) — 대형 필드를 전체 읽지 않고 서버에서 직접 치환. 정규식 지원
- **필드 내 텍스트 삽입** (`insert_in_field` MCP 도구) — 대형 필드를 전체 읽지 않고 특정 위치에 삽입 (end/start/after/before)
- **인사말 필터 검색** (`list_greetings` filter/content_filter 파라미터) — 특정 키워드가 포함된 인사말만 검색 가능

### 수정

- **`replace_in_lorebook_batch` 크래시 수정** — 로어북 배열에 null/undefined 엔트리가 있을 때 `Cannot read properties of undefined (reading 'comment')` 에러 발생하던 버그 수정
- 로어북 접근하는 모든 엔드포인트(batch-write, batch-replace, batch-insert, replace, insert, delete)에 엔트리 null 체크 추가

---

## [0.14.0] - 2026-03-22

### 새 기능

- **로어북 파일 시스템 내보내기/가져오기** — MCP 도구 + UI IPC로 로어북 데이터를 로컬 파일로 내보내고 다시 가져오기
  - `export_lorebook_to_files` — MD(항목당 1파일 + 폴더 구조) 또는 JSON(단일 파일) 포맷 지원
  - `import_lorebook_from_files` — MD/JSON 파일에서 로어북 항목 가져오기, dry_run 모드 + 충돌 해결(skip/overwrite/rename)
  - `export_field_to_file` — 임의 필드(description, globalNote 등)를 로컬 파일로 직접 저장
  - YAML frontmatter로 메타데이터(key, mode, insertorder 등) 보존
  - 폴더 구조를 디렉토리로 매핑/복원 (`_unfiled/` 디렉토리로 미분류 항목)
  - 경로 순회 차단 + 사용자 확인 팝업으로 보안 확보

### 추가

- `src/lib/lorebook-io.ts` — 로어북 내보내기/가져오기 코어 모듈
- `src/lib/lorebook-io.test.ts` — 37개 단위 테스트

---

## [0.13.0] - 2026-03-21

### 새 기능

- **WebP 에셋 압축** (`compress_assets_webp` MCP 도구 + UI IPC) — sharp 라이브러리를 사용하여 charx 파일의 모든 이미지 에셋을 WebP 손실 압축으로 변환
  - PNG, JPEG, GIF, BMP, TIFF, AVIF → WebP 변환 (SVG 건너뜀)
  - 애니메이션 GIF → animated WebP 자동 처리
  - WebP가 원본보다 크면 원본 유지 (데이터 안전)
  - 품질 조절 가능 (기본: 80, 0-100)
  - cardAssets, x_meta 경로 참조 자동 업데이트
  - 사용자 확인 팝업 + 상세 통계 반환

### 추가

- `sharp` 의존성 (v0.34.5) — Node.js 이미지 처리 라이브러리
- `src/lib/image-compressor.ts` — 이미지 압축 코어 모듈
- `src/lib/image-compressor.test.ts` — 12개 단위 테스트

---

## [0.12.0] - 2026-03-21

### 새 기능

- **로어북 일괄 치환** (`replace_in_lorebook_batch`) — 여러 항목의 content를 한 번에 치환. 각 항목별 매치 수 계산 → 전체 요약 → 단일 확인
- **로어북 일괄 삽입** (`insert_in_lorebook_batch`) — 여러 항목의 content에 한 번에 삽입. 단일 확인
- **부정 본문 검색** (`list_lorebook` `content_filter_not`) — content에 특정 키워드가 **없는** 항목만 필터. 참조 파일에도 동일 적용
- **배치 읽기 필드 프로젝션** (`read_lorebook_batch` `fields`) — `fields: ["content"]`로 필요한 필드만 반환하여 출력 크기 절감. 참조 파일에도 동일 적용

## [0.11.0] - 2026-03-21

### 새 기능

- **로어북 부분 치환** (`replace_in_lorebook`) — content에서 문자열/정규식 치환. 대용량 항목도 전체를 읽지 않고 서버에서 직접 처리
- **로어북 내용 삽입** (`insert_in_lorebook`) — content의 특정 위치(end/start/after/before)에 텍스트 삽입
- **로어북 일괄 쓰기** (`write_lorebook_batch`) — 여러 항목을 한 번에 수정, 변경 요약 후 단일 확인
- **인사말 일괄 쓰기** (`batch_write_greeting`) — 여러 인사말을 한 번에 수정, 단일 확인
- **로어북 비교** (`diff_lorebook`) — 현재 파일↔참고 자료 로어북 항목의 필드별 + 라인 단위 diff
- **로어북 키 검증** (`validate_lorebook_keys`) — 후행 쉼표, 불필요한 공백, 빈 세그먼트, 중복 키 자동 탐지
- **로어북 복제** (`clone_lorebook`) — 기존 항목 복제 + 필드 오버라이드
- **인사말 순서 변경** (`reorder_greetings`) — 인사말 배열 순서를 인덱스 배열로 재배치

## [0.10.0] - 2026-03-21

### 새 기능

- **로어북 배치 읽기** (`read_lorebook_batch`) — 인덱스 배열로 최대 50개 로어북 항목을 한 번에 읽기. 참조 파일용 `read_reference_lorebook_batch`도 추가
- **로어북 본문 검색** (`list_lorebook` `content_filter`) — 로어북 content 텍스트에서 키워드 검색 (대소문자 무시). 매칭 컨텍스트 ±50자 미리보기 포함. 참조 파일에도 동일 적용
- **로어북 목록 미리보기** (`list_lorebook` `preview_length`) — 응답에 content 미리보기 포함 (기본 150자, 0~500 조절 가능)
- **Lua/CSS 배치 읽기** (`read_lua_batch`, `read_css_batch`) — 최대 20개 섹션을 한 번에 읽기. 참조 파일용 `read_reference_lua_batch`, `read_reference_css_batch`도 추가
- **태그 DB 상태 확인** (`tag_db_status`) — Danbooru 태그 DB 로딩 상태, 태그 수, 파일 경로 진단

## [0.9.10] - 2026-03-21

### 수정

- **Danbooru 태그 DB 로딩 실패 수정** — `resources/Danbooru Tag.txt`가 electron-builder의 `files` 및 `asarUnpack` 설정에 누락되어 패키징된 앱에서 MCP 서버가 태그 DB를 찾지 못하던 문제 수정

## [0.9.9] - 2026-03-21

### 수정

- **터미널 붙여넣기 2중 입력 수정** — 커스텀 키 핸들러(Ctrl+C/V)와 xterm.js 네이티브 paste 이벤트가 동시에 발생하던 버그 수정. 커스텀 입력 핸들러를 제거하고 xterm.js 네이티브 클립보드/IME 처리로 전환
- **터미널 한글(IME) 입력 개선** — xterm.js v6 내장 IME 처리를 방해하던 커스텀 키 이벤트 핸들러 제거

## [0.9.8] - 2026-03-21

### 수정

- **탭 닫기 시 메모리 해제** — 닫힌 탭의 클로저(getValue/setValue)와 캐시(\_lastValue)를 즉시 null 처리하여 GC 허용 (탭당 5-10MB 절감)
- **백업 데이터 정리** — 닫힌 탭의 backup-store 데이터와 문자열 캐시 자동 삭제 (`clearBackups`), 파일 변경 시 전체 백업 초기화 (`clearAllBackups`)
- **프리뷰 엔진 assetMap 정리** — `resetVars()` 호출 시 base64 에셋 맵도 함께 초기화하여 이미지 데이터 누적 방지
- **터미널 리소스 정리** — `TerminalUiHandle.dispose()` 추가 (ResizeObserver disconnect, 이벤트 리스너 제거, 터미널 dispose)
- **터미널 scrollback 축소** — 5,000줄 → 3,000줄 (메모리 ~300KB 절감, 실사용 충분)

## [0.9.7] - 2026-03-21

### 수정

- **MCP Server 성능 최적화** — LLM CLI 사용 시 CPU 스파이크 대폭 감소
  - `suggestSimilar()` Levenshtein 알고리즘을 2D 매트릭스 → 2행 DP로 개선 (메모리 O(m×n) → O(n)), 결과 캐싱 추가 (최대 500건)
  - `getPopularGrouped()` 결과를 태그 로딩 시 1회 계산 후 캐싱 (호출당 ~590K 정규식 매칭 제거)
  - `apiCache`에 LRU 크기 제한 추가 (최대 5,000건, 무한 메모리 누적 방지)
  - HTTP 응답 처리 시 문자열 연결(`data += chunk`) → `chunks[]` 배열 + `join()` 패턴으로 변경 (GC 압박 감소)
- **Backup Store 직렬화 개선** — 편집 시 불필요한 CPU/메모리 사용 감소
  - `JSON.parse(JSON.stringify())` 딥클론 → 네이티브 `structuredClone()` 전환
  - 중복 검사용 `JSON.stringify()` 이중 호출 → 마지막 항목 문자열 캐시로 1회로 감소
  - `while + shift()` 배열 정리 → `slice()` 패턴으로 변경
- **Main Process 동기 I/O → 비동기 전환** — UI 프리징 감소
  - `persistReferenceFiles`, `import-json`, `read-persona`, `write-persona`, `list-personas`, `write-system-prompt` 핸들러의 `writeFileSync`/`readFileSync` → `fs.promises` 비동기 전환
  - `broadcastToAll()` 이중 루프 제거 (팝아웃 윈도우에 2회 메시지 → 1회로 통합)
- **Monaco 에디터 성능 제한 추가** — 대형 파일 편집 시 안정성 향상
  - `maxTokenizationLineLength: 20000` 설정으로 극단적 긴 줄 토큰화 방지
  - 100KB 초과 파일에서 미니맵 자동 비활성화

## [0.9.6] - 2026-03-21

### 변경

- **SKILL 가이드 "신호 밀도(Signal Density)" 철학 도입** — 토큰 수 제약 중심에서 신호 밀도 중심으로 패러다임 전환
  - `skills/README.md` — Philosophy에 "Signal Density over Token Count" 서브섹션 추가: 토큰 수치는 참고 하한선이며 핵심 기준은 "모든 문장이 LLM 출력을 바꾸는가"
  - `skills/authoring-lorebook-bots/LOREBOOK_ARCHITECTURE.md` — Signal Density 섹션 신설 (Rich Detail vs Signal Noise 구분 + good/bad 예시 + Usefulness Test), AlwaysActive Budget 섹션 신설 (주목 경쟁 관점의 alwaysActive 관리 가이드), Common Entry Mistakes에 low signal density/redundancy/alwaysActive 남발 추가
  - `skills/authoring-lorebook-bots/SKILL.md` — What Goes Where 테이블에 유연성 주석 추가 (대형 컨텍스트에서 description/lorebook 경계는 유동적), Extended speech registers를 description 유지 가능으로 변경
  - `skills/writing-lorebooks/SKILL.md` — Best Practice #5를 "100-300 tokens" → 신호 밀도 기준으로 재작성, #8 "alwaysActive budget" 추가
  - `skills/authoring-characters/SKILL.md` — Lorebook Suggestions 출력 형식의 "토큰 이유로 잘라낸" 표현 제거

## [0.9.5] - 2026-03-21

### 변경

- **Léman Chronicles 주연 캐릭터 로어북 디스크립션 압축** — 전체 10명의 주연 프로필(39-48)과 스토리 엔트리(69-78)에서 중복 제거
  - 프로필: Code-switching 단독 문단 제거 → Voice DNA에 핵심 1문장으로 통합, 중복 Trivia 항목 1-2개 제거, 레지스터 헤더 축약
  - 스토리: 프로필과 항상 동시 트리거되므로 프로필에 이미 있는 정보 제거 (Clotilde 74: 설정 문단 축약, Han Byeol 75: Inner Voice 제거, Lidia 76: 에스페란토 중복 문장 제거 + Inner Voice 축약, Eun-sil 77: "The Part She Doesn't Show" 섹션 전체 제거 + Inner Voice 제거)
  - 조연 캐릭터(16-37): 스팟체크 완료 — 이미 간결하여 압축 불필요

## [0.9.4] - 2026-03-21

### 변경

- **SKILL 문서에 유연성 면책 조항 추가** — 가이드를 교조적으로 따르지 않고, 봇/캐릭터 상황에 맞게 취사선택하도록 권장하는 문구 삽입
  - `skills/README.md` — "Philosophy" 섹션 신설: 가이드는 룰북이 아닌 툴킷, 결과물이 더 매력적이면 어떤 규칙이든 무시 가능
  - `authoring-characters/SKILL.md` — 도입부에 유연성 노트 추가
  - `authoring-lorebook-bots/SKILL.md` — 도입부에 유연성 노트 추가
  - `authoring-characters/VALIDATION.md` — 체크리스트는 진단 도구이지 합불 기준이 아님을 명시

## [0.9.3] - 2026-03-21

### 변경

- **캐릭터 작성 SKILL 문서 대규모 갱신** — Project Vela, 송하리, 하퍼 가이드의 우수 기법을 반영하여 5개 SKILL 문서 갱신
  - `authoring-characters/SKILL.md` — Token Budget → Investment Guide (1M+ 컨텍스트 시대 대응), Surface vs Subversion 패턴, Psychological Deep Dive, Gap Moe/Hidden Depth 구조, Layered Dreams, Named Internal Conflicts, 복장 카테고리 확장
  - `authoring-characters/SPEECH_SYSTEM.md` — 레지스터 4-6개로 확장, Romantic/Flustered 레지스터 추가, 예시 대사 3-5개 권장, 무대 지시(parenthetical) 추가, Consistency Anchors → Character DNA 명칭 변경, 심리적 레지스터 명명 가이드
  - `authoring-characters/VALIDATION.md` — DNA Anchors/Psychological Depth/Hidden Depths/Layered Desires 체크 추가, Wikipedia Syndrome/Appearance Bloat 제거(토큰 제약 완화), Surface-Only/Register Without Examples 안티패턴 추가
  - `authoring-lorebook-bots/SKILL.md` — 토큰 예산 제약 완화, DNA 마커 가이드 추가, 유연한 디스크립션 길이 가이드
  - `authoring-lorebook-bots/LOREBOOK_ARCHITECTURE.md` — 엔트리 사이즈 제약 완화(100-300 → 유연), 멀티캐릭터 봇 대규모 엔트리 가이드 추가

## [0.9.2] - 2026-03-21

### 새 기능

- **자동 릴리즈 빌드** — `v*` 태그 push 시 GitHub Actions에서 자동으로 Windows 빌드(NSIS 설치 프로그램 + 포터블 exe) 후 릴리즈에 업로드
  - `.github/workflows/release.yml` 워크플로우 추가
  - 빌드 전 lint/typecheck/test 검증 포함

## [0.9.1] - 2026-03-21

### 수정

- **MCP 설정 자동 등록** — 앱 시작 시 `~/.mcp.json`만 생성하던 것을 4개 CLI 설정 파일 모두 자동 생성하도록 수정
  - `~/.mcp.json` (Claude Code)
  - `~/.copilot/mcp-config.json` (GitHub Copilot CLI)
  - `~/.codex/config.toml` (Codex)
  - `~/.gemini/settings.json` (Gemini CLI)
  - 앱 종료 시 정리 후 재시작해도 모든 CLI에서 MCP 사용 가능

## [0.9.0] - 2026-03-22

### 새 기능

- **MCP 공식 SDK 전환** — `@modelcontextprotocol/sdk` (v1.27.1) + `StdioServerTransport`로 프로토콜 처리 자동화
  - 수동 JSON-RPC 파싱/직렬화/에러 처리 → SDK 자동 처리
  - `McpServer` + `server.tool()` 패턴으로 도구 정의·검증·디스패치 1곳 통합
  - `server.prompt()` 기반 프롬프트 등록 (danbooru_tag_guide)
- **Zod 입력 검증** — 모든 MCP 도구의 파라미터를 Zod 스키마로 타입 검증
  - 잘못된 파라미터 타입 전달 시 SDK가 자동으로 명확한 에러 반환
  - `z.union()` 등으로 `write_field`의 복합 타입(string|array|boolean|number) 검증

### 변경

- **toki-mcp-server.ts 리팩터링** — 1512줄 → 1129줄 (25% 감소)
  - TOOLS 배열 (~600줄) + switch-case 디스패치 (~250줄) + handleMessage (~130줄) 삭제
  - `server.tool()` 콜백으로 통합 (정의·검증·디스패치 1곳)
- **tsconfig.node-libs.json** — `moduleResolution: "Node16"`으로 변경 (SDK exports 맵 지원)
- 기존 모든 도구 동작은 변경 없음 (stdio transport, Bearer token 인증, HTTP 프록시 유지)

### 기술 정보

- 새 의존성: `@modelcontextprotocol/sdk` ^1.27.1, `zod` ^4.3.6
- stdio transport 유지 — CLI 설정 파일(~/.mcp.json 등) 변경 불필요
- mcp-api-server.ts (HTTP 백엔드) 변경 없음

## [0.8.1] - 2026-03-21

### 새 기능

- **로어북 폴더 필터** — `list_lorebook(folder?)` 및 `list_reference_lorebook(folder?)` 에 폴더 UUID 필터 추가
  - 응답에 폴더 요약(`folders` 배열: UUID, name, entryCount) 포함
  - 각 항목에 `folder` 필드 포함하여 폴더 소속 확인 가능
  - 120+ 항목이 있는 대형 파일에서 폴더별 탐색으로 컨텍스트 절약

### 변경

- **list_regex** — `findSize`, `replaceSize` 필드 추가 (대형 HTML 치환 식별 용이)
- **list_triggers** — `conditionCount` 필드 추가 (트리거 복잡도 사전 파악)
- **list_lorebook** — 각 항목에 `folder` 필드 추가, 응답에 폴더 요약 포함

### 수정

- **list_fields 성능 개선** — `stringifyTriggerScripts()` 이중 호출 제거 (캐시 변수 사용)

---

## [0.8.0] - 2026-03-21

### 새 기능

- **인사말 세분화 MCP 도구 5종** — alternateGreetings/groupOnlyGreetings를 개별 인덱스로 접근
  - `list_greetings(type)`: 인사말 목록 (index, 크기, 미리보기 100자)
  - `read_greeting(type, index)`: 인사말 하나 읽기
  - `write_greeting(type, index, content)`: 인사말 수정
  - `add_greeting(type, content)`: 인사말 추가
  - `delete_greeting(type, index)`: 인사말 삭제
- **트리거 스크립트 세분화 MCP 도구 5종** — triggerScripts 배열을 개별 트리거로 접근
  - `list_triggers`: 트리거 목록 (index, comment, type, effect 수)
  - `read_trigger(index)`: 트리거 하나 읽기
  - `write_trigger(index, ...)`: 트리거 수정 (부분 수정 가능)
  - `add_trigger(...)`: 트리거 추가
  - `delete_trigger(index)`: 트리거 삭제

### 변경

- `read_field` 도구 설명에 alternateGreetings/groupOnlyGreetings/triggerScripts/lua/css 사용 시 세부 도구 안내 경고 추가
- assistant-prompt에 인사말/트리거/참고 자료 세부 도구 + 스킬 도구 전체 반영, 읽기 규칙 강화
- AGENTS.md에 인사말·트리거 도구 레퍼런스 및 읽기 규칙 업데이트

---

## [0.7.1] - 2026-03-21

### 새 기능

- **참고 자료 세부 읽기 MCP 도구 6종** — 참고 파일의 로어북/Lua/CSS를 개별 항목·섹션 단위로 읽기
  - `list_reference_lorebook(index, filter?)`: 참고 파일 로어북 목록 (compact, filter 지원)
  - `read_reference_lorebook(index, entryIndex)`: 참고 파일 로어북 항목 하나 읽기
  - `list_reference_lua(index)`: 참고 파일 Lua 섹션 목록
  - `read_reference_lua(index, sectionIndex)`: 참고 파일 Lua 섹션 하나 읽기
  - `list_reference_css(index)`: 참고 파일 CSS 섹션 목록
  - `read_reference_css(index, sectionIndex)`: 참고 파일 CSS 섹션 하나 읽기

### 변경

- `read_reference_field` 도구 설명에 lorebook/lua/css 사용 시 세부 도구 안내 경고 추가
- `list_lorebook` 도구 설명에 filter 파라미터 사용 권장 안내 추가
- AGENTS.md에 참고 자료 읽기 규칙 및 로어북 비교 워크플로우 추가

---

## [0.7.0] - 2026-03-20

### 새 기능

- **Danbooru 태그 검증 MCP 도구** — 캐릭터 이미지 프롬프트 작성 시 유효한 Danbooru 태그 검증·검색·참조
  - `validate_danbooru_tags`: 태그 유효성 검증 + Levenshtein 기반 유사 태그 추천
  - `search_danbooru_tags`: 키워드/와일드카드 태그 검색 (인기순 정렬)
  - `get_popular_danbooru_tags`: 인기 태그 조회 (의미별 그룹: hair, eyes, clothing, pose 등)
  - `danbooru_tag_guide` 프롬프트 템플릿: 태그 규칙 + 카테고리별 인기 태그 예시 자동 제공
  - 로컬 태그 DB (6,549개) 우선 + Danbooru REST API 온라인 폴백
  - MCP 프롬프트 기능 추가 (`prompts/list`, `prompts/get`)

---

## [0.6.1] - 2026-03-20

### 새 기능

- **봇 이름 변경** — 사이드바 상단 `🏷 이름: ...` 항목 클릭으로 봇 이름 변경
  - 프롬프트 대화상자에서 이름 입력 → 즉시 반영 (타이틀바 + 사이드바)
  - 우클릭 시 MCP 경로 복사 메뉴

---

## [0.6.0] - 2026-03-20

### 새 기능

- **추가 첫 메시지 / 그룹 첫 메시지 개별 편집** — 기존 읽기 전용 JSON 배열 표시에서 사이드바 폴더 + 개별 탭 편집으로 전환
  - 각 인사말을 독립된 Monaco 탭(HTML/CBS 지원)으로 열어 편집
  - 사이드바 폴더 우클릭으로 새 인사말 추가, 항목 우클릭으로 삭제
  - 드래그 앤 드롭으로 인사말 순서 변경
  - 인덱스 탭 자동 시프트 (삭제 시 열린 탭 번호 자동 조정)
  - `sidebar-dnd.test.ts` — 인사말 CRUD 단위 테스트 4건 추가 (총 218 테스트)

---

## [0.5.0] - 2026-03-20

### 새 기능

- **사이드바 드래그 앤 드롭 재정렬** — SortableJS 기반으로 사이드바 항목 순서를 마우스 드래그로 자유롭게 변경
  - **로어북**: 같은 폴더 내 재정렬 + 폴더 간 이동 (루트↔폴더) 지원
  - **정규식**: 플랫 리스트 재정렬
  - **Lua/CSS 섹션**: 섹션 순서 변경 → 소스 코드 자동 재조합
  - **에셋**: 같은 그룹 내 재정렬
  - 드래그 시각 피드백 (고스트/선택/드래그 상태 CSS)
  - `sidebar-dnd.test.ts` — 재정렬 로직 단위 테스트 7건 추가

---

## [0.4.1] - 2026-03-20

### 버그 수정

- **참고자료 사이드바 항목 중복 버그 수정** — `buildRefsSidebar()`가 async 함수인데 fire-and-forget으로 호출되어, 빠르게 연속 호출 시 비동기 빌드가 인터리빙되면서 가이드/참고 파일이 여러 번 렌더링되던 문제 해결
  - 빌드 버전 카운터 도입: 새 빌드가 시작되면 이전 비동기 빌드는 자동 취소
  - `sidebar-refs.test.ts`에 동시 빌드 경합 조건 테스트 3건 추가

---

## [0.4.0] - 2026-03-20

### 새 기능

- **Gemini CLI 연동** — 터미널 메뉴에서 "Gemini 시작"으로 Gemini CLI + MCP 연동
  - `~/.gemini/settings.json`에 MCP 설정 자동 생성/정리
  - `AGENTS.md` 자동 생성으로 시스템 프롬프트 전달
  - 기존 MCP 도구(필드/로어북/정규식/Lua/CSS 섹션) 그대로 사용 가능

### 변경

- **README.md 개선** — 프로젝트 소개, 배지, 주요 기능 테이블 추가
- **CHANGELOG.md 형식 변경** — Keep a Changelog + 시멘틱 버저닝 형식 적용
- **AGENTS.md 문서 규칙 추가** — 매 작업마다 자동 문서/버전 관리 규칙 명시

---

## [0.3.0] - 2026-03-18

### 새 기능

- **Skills MCP 도구** — `list_skills` / `read_skill` MCP 도구 추가로 CBS, Lua, 로어북, 정규식 등 상세 가이드를 on-demand 로딩
- **스킬 문서 패키징** — `skills/` 폴더를 extraResources로 포함하여 빌드 배포판에서도 스킬 접근 가능

### 변경

- **AGENTS.md 경량화** — 인라인 CBS/Lua 섹션을 skills 참조로 대체하여 토큰 절감
- **CLAUDE.md 중복 제거** — AGENTS.md로 리다이렉트하여 시스템 프롬프트 토큰 2배 낭비 해소

---

## [0.2.2] - 2026-02-28

### 새 기능

- **OpenAI Codex CLI 연동** — 터미널 메뉴에서 "Codex 시작"으로 Codex CLI + MCP 연동
  - `~/.codex/config.toml`에 MCP 설정 자동 생성/정리
  - `AGENTS.md` 자동 생성으로 시스템 프롬프트 전달
  - 기존 MCP 도구(필드/로어북/정규식/Lua/CSS 섹션) 그대로 사용 가능
- **참고 파일 다중 선택** — 참고 파일 추가 시 여러 파일 한번에 선택 가능
- **가이드 세션 전용 불러오기** — 불러온 가이드는 세션 동안만 유지, 앱 종료 시 자동 제거 (내장 가이드 오염 방지)
- **가이드 삭제** — 가이드 항목 우클릭 메뉴에 삭제/제거 추가
- **로어북 폴더 관리** — 폴더 우클릭 메뉴 추가 (이름 변경, 항목 추가, 내용 일괄 삭제, 폴더 삭제, 폴더+내용 전체 삭제)
- **일괄 삭제** — 로어북/정규식 폴더 헤더 우클릭에 전체 삭제 옵션 추가

### 변경

- **MCP 설정 경로 변경** — `.mcp.json`을 `~/.mcp.json`(홈 디렉토리)에 기록하여 프로젝트 루트 없이도 Claude Code MCP 연결 가능
- **시스템 프롬프트 강화** — 섹션 단위 읽기 규칙 명시 (read_field 대신 read_lua/read_css 사용 유도)

### 수정

- 터미널 Ctrl+V 두 번 붙여넣기 버그 수정
- 터미널 재시작 시 입력 안 되는 버그 수정

---

## [0.2.0-beta] - 2026-02-26

### 새 기능

- **참고자료 팝아웃** — 참고자료 패널을 별도 외부 창으로 분리 (`↗` 버튼)
- **프리뷰 엔진** — CBS/Lua 렌더링, 채팅 시뮬레이션 (F5)
- **CSS 섹션 MCP API** — `list_css`, `read_css`, `write_css`, `replace_in_css`, `insert_in_css`
- **슬롯 기반 레이아웃** — 패널 드래그 앤 드롭으로 좌/우/상/하/좌끝/우끝 자유 배치
- **MCP 경로 복사** — 사이드바 모든 항목 우클릭 시 MCP 경로 복사 메뉴

### 변경

- 버튼 아이콘 구분: `↗` = 외부 창 팝아웃, `⧉` = 슬롯 분리
- 설정에서 RisuAI 동기화 UI 제거

### 수정

- 아바타 GIF 표시 오류 수정
- 페르소나 프롬프트 전달 수정
- 저장 시 데이터 누락 버그 수정

---

## [0.1.0-beta] - 2026-02-24

### 초기 릴리즈

- .charx 파일 열기/편집/저장
- Monaco 에디터 (구문 강조, 자동완성)
- TokiTalk 내장 터미널 (node-pty + xterm.js)
- Claude Code 연동 (MCP 자동 설정)
- MCP 도구: 필드/로어북/정규식/Lua 섹션/참고자료 읽기·쓰기
- 로어북/정규식 전용 폼 에디터
- Lua 섹션 시스템 (`-- ===== 섹션명 =====` 구분자)
- 사이드바 항목 트리 + 참고자료 탭
- 토키/아리스 GIF 아바타
- RP 모드 (토키/아리스/커스텀 페르소나)
- 자동저장, 백업 시스템
- 다크 모드 (토키 ↔ 아리스)
- BGM 재생
- 모모톡 스타일 확인 팝업
- MomoTalk 테마 NSIS 인스톨러
- 드래그 앤 드롭 (charx/json/이미지)
