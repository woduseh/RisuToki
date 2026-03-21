# Changelog

이 파일은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따르며,
[시멘틱 버저닝](https://semver.org/lang/ko/)을 사용합니다.

- **MAJOR (x.0.0)**: 호환성을 깨는 변경
- **MINOR (0.x.0)**: 새 기능 추가 (하위 호환)
- **PATCH (0.0.x)**: 버그 수정 (하위 호환)

---

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
