# Changelog

이 파일은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따르며,
[시멘틱 버저닝](https://semver.org/lang/ko/)을 사용합니다.

- **MAJOR (x.0.0)**: 호환성을 깨는 변경
- **MINOR (0.x.0)**: 새 기능 추가 (하위 호환)
- **PATCH (0.0.x)**: 버그 수정 (하위 호환)

---

## [0.26.1] - 2026-03-28

### 수정

- **로어북 폴더 key를 canonical `folder:UUID` 형식으로 일관화**
  - 사이드바/폼/가져오기/MCP 수정 경로가 새 폴더를 bare UUID 대신 `folder:UUID`로 저장하도록 정리
  - MCP 읽기 응답도 폴더 엔트리 key를 `folder:UUID`로 반환해 에디터 표면과 일치하도록 수정
  - 레거시 bare UUID / `id` 기반 폴더 데이터는 계속 읽되, 정규화 시 canonical key로 승격

## [0.26.0] - 2026-03-28

### 새 기능

- **GitHub Copilot CLI용 `플루니 연구소` RP 모드 추가**
  - `Pluni`, `Kotone`, `Sophia`의 3인 자문 패널을 기반으로 챗봇 설계를 논의
  - `1:1 챗봇`, `월드 시뮬레이터`, `멀티 캐릭터 월드 시뮬레이터` 3개 카테고리를 설정에서 선택 가능

### 변경

- **Copilot 시작 시 플루니 자문 에이전트 프로필 자동 준비**
  - `rpMode=pluni` + GitHub Copilot CLI 시작 시 세션 `AGENTS.md`와 함께 임시 `.github/agents/pluni.md`, `kotone.md`, `sophia.md`를 생성
  - Claude Code / Codex / Gemini CLI에서는 같은 자문 구조를 단일 세션 합성 프롬프트로 폴백

### 수정

- **Copilot 전용 임시 에이전트 파일 정리 경로 보강**
  - 플루니 Copilot 모드가 아닌 다음 실행 경로에서도 기존 `.github/agents/*.md` 파일을 안전하게 복원하거나 삭제

## [0.25.0] - 2026-03-28

### 새 기능

- **`.risup` 프롬프트 편집을 template-first surface로 승격**
  - visible `프롬프트` 그룹이 `mainPrompt` / `jailbreak` 중심이 아니라 구조화 `promptTemplate` / `formatingOrder` / `customPromptTemplateToggle` / 템플릿 변수 중심으로 동작
  - `.risup`의 top-level `description`도 다시 별도 항목으로 편집 가능

### 변경

- **실제 RisuAI 흐름에 맞게 legacy 프롬프트를 호환성 데이터로 격하**
  - `mainPrompt`, `jailbreak`, `globalNote`, `useInstructPrompt`, `instructChatTemplate`, `JinjaTemplate`는 파일에 보존되지만 주요 프롬프트 UI에서는 내려감
  - `customPromptTemplateToggle`를 멀티라인 textarea로 바꾸고, structured prompt editor를 앱 기본 폼 스타일과 어울리는 카드/셀렉트/버튼 UI로 재정렬

### 수정

- **`.risup` 백업 복원 / 자동 저장 경로 보강**
  - 다른 risup 폼 탭이 활성화된 상태에서 백업을 복원해도 현재 보이는 form UI가 함께 refresh되도록 수정
  - hidden legacy `risup_prompts` 백업을 visible `프롬프트` 메뉴에서 다시 불러올 수 있도록 복원 경로 추가
  - risup 복원 후 autosave payload가 구조화 프롬프트 필드와 top-level `description`까지 함께 반영되도록 보강

## [0.24.0] - 2026-03-28

### 새 기능

- **실제 RisuAI `.risup` 편집 호환성 추가**
  - gzip / zlib / raw-deflate 변형으로 내보낸 실제 `.risup` 프리셋을 열고 저장할 수 있도록 복구
  - 열 때 감지한 압축 모드를 저장 시 최대한 보존하고, 새 프리셋은 RisuAI 호환성이 높은 모드로 저장

- **구조화된 risup 프롬프트 템플릿 편집기 추가**
  - `promptTemplate`를 raw JSON textarea 대신 항목 목록 + 상세 편집기로 노출
  - `type`, `type2`, `role`, `text`, `rangeStart` / `rangeEnd`, `chatAsOriginalOnSystem`, `innerFormat`, `defaultText`, cache `depth` / `role`를 직접 편집 가능
  - `formatingOrder`를 재정렬 가능한 토큰 목록으로 노출해 known / unknown token을 함께 유지

- **risup promptTemplate / formatingOrder 전용 MCP 도구 추가**
  - `list_risup_prompt_items`, `read_risup_prompt_item`, `write_risup_prompt_item`, `add_risup_prompt_item`, `delete_risup_prompt_item`, `reorder_risup_prompt_items`
  - `read_risup_formating_order`, `write_risup_formating_order`

### 변경

- **`.risup` 저장 검증 강화**
  - `presetBias`, `localStopStrings`뿐 아니라 구조화 프롬프트 필드의 invalid 상태도 저장 전에 차단
  - 손상된 `promptTemplate` / `formatingOrder`는 UI에서 복구용 raw editor를 표시하고, MCP에서는 명시적 parse error를 반환

### 수정

- **지원하지 않는 risup 프롬프트 item 처리 보강**
  - 구조화 UI와 MCP list/read에서는 unsupported item metadata를 숨기지 않고 노출
  - item-level write/add 경로는 unsupported shape를 명시적으로 거부하고 raw `write_field("promptTemplate")` fallback을 안내

## [0.23.0] - 2026-03-27

### 새 기능

- **구조화된 트리거 스크립트 편집기 추가**
  - `.charx` / `.risum`의 `triggerScripts`가 더 이상 raw JSON 탭으로 열리지 않고, 트리거 목록·조건·효과를 직접 편집하는 전용 폼 에디터로 열림
  - 지원하지 않는 trigger/effect/condition은 조용히 유실하지 않고 저장을 차단해 데이터 손실을 방지

- **charx 메타데이터 필드 UI 노출**
  - 기존 `캐릭터 정보` 흐름 안에서 `creatorcomment`와 `characterVersion`을 직접 편집 가능

### 수정

- **charx / risum Lua-트리거 모드 판정 정리**
  - 빈 `triggerScripts`, invalid JSON, 단독 `triggerlua` wrapper를 모두 Lua 모드로 취급하고, 독립 트리거 목록이 있을 때만 트리거 모드로 전환
  - `.risum`도 `.charx`와 동일하게 Lua 모드일 때 트리거 항목이 비활성처럼 보이고, 트리거 모드일 때 Lua 폴더가 비활성처럼 보이도록 정렬

- **트리거 스크립트 백업 복원 경로 보강**
  - `_triggerform` 탭 백업이 draft object를 저장하더라도 restore 시 안전하게 trigger text로 되돌리고, 활성 탭 UI까지 함께 refresh되도록 보강

## [0.22.11] - 2026-03-27

### 수정

- **`.risup` 편집 사이드바 복구**
  - `.risup` 파일을 열면 더 이상 빈 공용 항목만 보이지 않고, 프리셋 전용 그룹 탭(기본, 프롬프트, 모델/API, 기본 파라미터, 샘플링, 추론, 템플릿, JSON 스키마, 기타)이 좌측 사이드바에 표시됨
  - `regex[]`는 기존 전용 폼 에디터를 그대로 유지하고, `.risup`에서 의미 없는 Lua / 로어북 / 에셋 / 설명 항목은 숨김
  - `name` 편집이 다시 가능하며 file label도 함께 갱신됨
- **`.risup` 저장 전 JSON 검증 추가**
  - `promptTemplate`, `presetBias`, `formatingOrder`, `localStopStrings`에 잘못된 JSON이 남아 있으면 저장/다른 이름으로 저장을 차단하고 문제 필드를 상태바에 표시
- **`.risup` 탭 갱신 경로 보강**
  - AI/MCP가 risup 필드를 수정했을 때 열려 있는 risup 그룹 탭이 함께 새 값으로 refresh되도록 보강

## [0.22.10] - 2026-03-26

### 수정

- **프로젝트 skills 링크 자동 복구**
  - Windows에서 git이 `.claude/skills`, `.gemini/skills`, `.github/skills` 심볼릭 링크를 `../skills` 일반 파일로 체크아웃해 각 LLM CLI가 스킬 디렉터리를 읽지 못하던 문제 수정
  - `src/lib/skill-link-sync.ts`와 `npm run sync:skills`를 추가해 세 경로를 루트 `skills/`로 다시 연결하도록 보강
  - Windows에서는 실제 symlink를 우선 생성해 `git status`가 불필요하게 더럽혀지지 않도록 하고, symlink 권한이 없을 때만 junction으로 폴백
  - `npm install`의 `prepare` 단계에서 자동 복구되며, 필요하면 수동으로 `npm run sync:skills`를 실행할 수 있음

## [0.22.9] - 2026-03-26

### 수정

- **charx 아이콘 에셋 이름 호환성 수정**
  - RisuAI는 `type='icon'` + `name='main'`인 에셋을 메인 아이콘으로 인식하지만, RisuToki가 새 아이콘 에셋 엔트리를 생성할 때 파일명 기반 이름을 사용하여 RisuAI에서 메인 아이콘을 찾지 못하는 문제 수정
  - 첫 번째 icon 타입 에셋에 `name='main'`을 자동 부여

### 조사 완료 (RisuToki 외부 이슈)

- **RisuRealm 공유 실패 원인 조사**
  - "corrupted" 에러는 RisuAI→RisuRealm 공유 단계에서 발생 (RisuAI가 캐릭터를 PNG로 재수출할 때)
  - RisuToki의 charx 포맷은 완전히 호환됨을 확인: ZIP 호환성(adm-zip↔fflate) ✅, RPack 바이트맵 동일 ✅, card.json 구조 ✅, module.risum 바이너리 ✅
  - 근본 원인은 RisuAI 내부의 `exportCharacterCard()` 또는 RisuRealm 서버측 검증에 있으며, RisuToki 수정 범위 밖

## [0.22.8] - 2026-03-26

### 수정

- **npm 프로그레스 스피너로 인한 PTY 무한 대기 해결**
  - npm의 브라유 문자 스피너(⠙⠹⠸…)가 ANSI 이스케이프 코드와 함께 PTY 버퍼를 간섭하여 LLM CLI 도구(Claude Code, Copilot CLI 등)에서 프로세스 완료를 감지하지 못하는 문제 수정
  - `.npmrc`에 `progress=false` 설정 추가로 스피너 비활성화
  - 전체 빌드(`npm run build`) 소요 시간: 무한 대기 → ~26초

## [0.22.7] - 2026-03-26

### 수정

- **skills 폴더 SSOT (Single Source of Truth) 통합**
  - `.claude/skills`, `.gemini/skills`, `.github/skills`를 프로젝트 루트 `skills/` 폴더를 가리키는 심볼릭 링크로 변환
  - 기존 중복 복사본을 제거하여 루트 `skills/` 하나만 수정하면 모든 LLM CLI에 반영
  - `.gitignore` 업데이트: 심볼릭 링크 경로는 추적 허용

- **Vite/Rollup 빌드 실패 수정**
  - git에 tracked된 stale CJS `.js` 파일들이 `.ts` 소스를 가려서 발생한 빌드 오류 해결
  - `vite.config.ts`에 `resolve.extensions` 추가하여 `.ts`를 `.js`보다 우선 resolve
  - `lorebook-folders.ts`를 `tsconfig.node-libs.json`에 추가하여 CJS 출력 자동 생성

## [0.22.6] - 2026-03-26

### 수정

- **로어북 폴더 식별자 정규화**
  - UI, MCP, 가져오기/내보내기 경로가 폴더 항목의 `key` UUID를 canonical identity로 공통 사용하도록 정리
  - 자식 로어북 항목의 `folder` 참조를 항상 `folder:UUID` 형태로 정규화하고, 기존 `id` 전용 폴더는 legacy fallback으로 계속 읽도록 보강

## [0.22.5] - 2026-03-24

### 수정

- **preload 스크립트 로드 실패 수정**
  - v0.22.3에서 `preload.ts`를 `./src/lib/preload-api` 모듈로 리팩토링한 후 Electron sandbox preload의 `require` 제한으로 모듈 resolve 실패
  - esbuild로 preload 스크립트를 단일 파일로 번들링하여 외부 `require` 의존성 제거
  - `popout-preload.ts`도 일관성을 위해 동일하게 번들링 적용

## [0.22.4] - 2026-03-24

### 수정

- **`search_all_fields` MCP 검색 계약 복구**
  - stdio MCP 서버가 호출하는 `/search-all` backend route를 구현해 `MCP server 'risutoki': Not found` 오탐을 제거
  - 문자열 필드, `alternateGreetings`, `groupOnlyGreetings`, 로어북 content를 한 번에 검색하는 공통 search helper 추가
  - API route / MCP smoke test 회귀 검증을 추가해 도구 선언과 backend surface가 다시 어긋나지 않도록 고정

## [0.22.3] - 2026-03-24

### 변경

- **문서화되지 않은 로컬 sync 노출면 제거**
  - preload/main process에 남아 있던 retired sync server 제어 surface 삭제
  - 앱이 숨은 localhost HTTP 서버를 열지 않도록 정리
- **CI 경로 강화**
  - PR/push CI를 Ubuntu 검증 + Windows Electron/Renderer 빌드로 분리
  - Dependabot으로 npm / GitHub Actions 의존성 점검 자동화 추가

### 수정

- **프리뷰 격리 강화**
  - 프리뷰를 sandbox iframe + 인증된 bridge 메시지 경계로 전환
  - parent-side `document.write` / `innerHTML` 주입 제거
  - 스크립트/인라인 이벤트 속성 제거 sanitizer 적용
- **저장 실패 데이터 유실 방지**
  - 저장 실패 시 창이 닫히지 않도록 close policy 수정
  - 사용자에게 명시적인 저장 실패 오류 표시 추가
- **설정/파일 입력 검증 강화**
  - 손상된 layout/avatar localStorage JSON을 안전하게 fallback 처리
  - `.charx`, `.risum`, `.risup` 구조 검증과 payload 경계 체크 추가

## [0.22.2] - 2026-03-23

### 변경

- **writing-arca-html 스킬 보강** — 사용자 가이드라인에서 누락된 콘텐츠 병합
  - 테마 테이블에 "Social Media / Platform" 행 추가 (Discord, Twitter, Instagram 스타일)
  - "Creative Thinking Examples" 섹션 추가 — 캐릭터 유형별 디자인 영감 (히키코모리, 판타지 기사, AI 캐릭터, 역사 인물, 소셜미디어 페르소나 등)
  - "Background Patterns with Repeating Divs" 기법 섹션 추가 (줄무늬/체커보드 패턴)
  - 창작 독려 마무리 문구 추가 ("Don't default to templates")

## [0.22.1] - 2026-03-23

### 수정

- **CBS 스킬 문서 정확도 개선** — RisuAI 소스 코드(cbs.ts, parser.svelte.ts)와 교차 검증하여 다수 오류 수정
  - `makedict`: 누락된 별칭 `makeobject` 추가
  - `rollp`: 누락된 별칭 `rollpick` 추가
  - `moduleassetlist`: 누락된 별칭 `module_assetlist` 추가
  - `crypt`: 누락된 별칭 `decrypt` 추가
  - `image`/`img`: `img`가 `image`의 별칭으로 잘못 문서화된 것을 별도 태그로 분리 (styled vs unstyled)
  - Escape Characters: `bo`/`bc` 전체 별칭, `()`/`<>`/`:`/`;` 전체 별칭 보완
  - Metadata Keys: `majorver`/`major`/`lang`/`browserlocale`/`browserlang` 등 대체 키 문서화
  - `u`/`ue` 태그: 미문서화된 hex 유니코드 디코딩 단축 태그 추가
  - `#when` Advanced Operators: `toggle`/`tis`/`tisnot`에 문법 예시 추가
  - `#each`: `::keep` 모드 문서화
  - 태그 총 수를 130+에서 170+로 갱신

## [0.22.0] - 2026-03-23

### 새 기능

- **멀티라인 블록 치환** — `replace_block_in_field` / `replace_block_in_lorebook` 신규 MCP 도구
  - 두 앵커 사이의 여러 줄에 걸친 텍스트 블록을 안전하게 교체
  - `include_anchors: false`로 앵커는 유지하고 사이 내용만 교체 가능
  - `dry_run` 지원으로 미리보기 가능
- **필드 일괄 쓰기** — `write_field_batch` 신규 MCP 도구
  - 여러 소형 필드를 한 번의 확인으로 동시 업데이트
  - characterVersion + defaultVariables 같은 조합에 유용
- **필드 스냅샷/복원** — `snapshot_field` / `list_snapshots` / `restore_snapshot` 신규 MCP 도구
  - 대형 필드 편집 전 안전망으로 활용
  - 필드당 최대 10개 스냅샷 보관 (파일 전환 시 초기화)
- **필드 통계** — `get_field_stats` 신규 MCP 도구
  - 문자 수, 행 수, 단어 수, CBS/HTML 태그 수, 빈 행 수 등 요약 정보

### 수정

- **CRLF 정규화** — 모든 replace/insert/search MCP 도구에서 CRLF(`\r\n`)→LF(`\n`) 자동 변환
  - 멀티라인 매칭 실패의 근본 원인 해결
  - 필드, 로어북, 정규식, Lua, CSS 모든 핸들러에 적용
- **확인 타임아웃 증가** — MCP 작업 확인 대기시간 30초 → 10분으로 변경
  - 대형 파일 작업 시 타임아웃으로 인한 작업 실패 방지

---

## [0.21.0] - 2026-03-23

### 새 기능

- **사이드바 카테고리 그룹핑** — 항목 패널을 5개 섹션으로 시각 구분 (캐릭터 정보 / 메시지 / 스크립트 / 데이터 / 에셋)
  - `createSectionHeader()` — 새 사이드바 섹션 헤더 컴포넌트 추가
  - 항목 순서 재배치: 설명 → 글로벌노트 → 기본변수 → 첫메시지
- **Lua/트리거 상호 배타 표시** — charx 파일에서 현재 비활성 모드의 항목을 회색 처리 + 툴팁으로 안내
- **인라인 이름 편집** — 상단 메뉴바의 파일명을 더블클릭하여 봇 이름 수정 (Enter 확정, ESC 취소)

### 변경

- 사이드바에서 "이름" 항목 제거 (인라인 편집으로 이전)

---

## [0.20.0] - 2026-03-23

### 변경

- **비권장/미사용 charx 필드 편집 기능 제거** — RisuAI 최신 코드 분석 결과 비권장되거나 실질적으로 사용되지 않는 8개 필드의 쓰기 기능을 제거
  - **완전 제거 (읽기+쓰기)**: `groupOnlyGreetings` — RisuAI에서 참조 코드 없음, 사이드바 UI 및 MCP 인사말 엔드포인트 전체 제거
  - **쓰기만 제거 (읽기 유지)**: `personality`, `scenario`, `nickname`, `additionalText`, `source`, `tags`, `license`
  - 기존 charx 파일에 저장된 데이터는 읽기/저장 시 그대로 보존 (I/O 패스스루)
  - MCP `list_fields`에서 비권장 필드는 `(read-only)` 표시로 구분
  - AI 어시스턴트 프롬프트에서 관련 설명 업데이트

### 유지되는 charx 전용 편집 필드

- `systemPrompt`, `exampleMessage`, `creatorcomment`, `creator`, `characterVersion`

---

## [0.19.3] - 2026-03-23

### 수정

- **정규식 Type 저장 오류 수정** — charx/risum/risup 파일에 정규식 항목을 저장할 때 `type` 값이 RisuAI와 호환되지 않는 형식(camelCase)으로 기록되던 버그 수정
  - **근본 원인**: Risutoki는 `editInput`, `editOutput`, `editRequest`, `editDisplay` 등 camelCase를 사용했으나, RisuAI는 `editinput`, `editoutput`, `editprocess`, `editdisplay` 등 lowercase로 대소문자 구분 비교
  - **추가 불일치**: `editRequest`→`editprocess`, `editTranslation`→`edittrans` 이름 자체가 다른 문제도 함께 수정
  - 파일 저장 시 (`saveCharx`, `saveRisum`, `saveRisup`) type 자동 정규화 추가
  - 파일 로드 시 (`openCharx`, `openRisum`, `openRisup`) 기존 camelCase 파일 자동 정규화
  - 폼 에디터, 사이드바, 드래그앤드롭, MCP API 등 모든 정규식 생성 경로에 RisuAI 호환 값 적용

## [0.19.2] - 2026-03-23

### 수정

- **greeting batch 라우트 충돌 수정** — `batch_delete_greeting`, `batch_write_greeting`, `reorder_greetings` 호출 시 "Index batch-delete out of range" 에러가 발생하던 버그 수정. 단일 인사말 수정 라우트(`POST /greeting/:type/:idx`)가 `batch-write`, `batch-delete`, `reorder` 경로를 인덱스로 잘못 파싱하던 문제

## [0.19.1] - 2026-03-23

### 수정

- **MCP 문서 정확성 개선** — AGENTS.md와 README.md의 MCP 도구 문서가 실제 코드와 정확히 일치하도록 수정
  - AGENTS.md에 누락된 risum 에셋 관리 도구 4종 (`list_risum_assets`, `read_risum_asset`, `add_risum_asset`, `delete_risum_asset`) 문서 추가
  - README.md MCP 도구 수를 55+종에서 실제 등록 수인 99종으로 수정
  - README.md 에셋 도구 목록에서 risum 에셋 도구 전체 나열 (기존 `등` 표기 제거)

## [0.19.0] - 2026-03-23

### 새 기능

- **CBS 검증 MCP 도구 4종 추가** — CBS(Conditional Block Syntax) `{{#when}}` 블록의 구조 검증, 토글 목록 조회, 시뮬레이션, 기준선 비교를 AI CLI에서 직접 수행 가능
  - `validate_cbs` — 열기/닫기 균형 검증 + 전체 토글 조합 오류 검사 (최대 1024 조합)
  - `list_cbs_toggles` — 파일에 사용된 모든 CBS 토글 이름, 조건, 참조 위치 나열
  - `simulate_cbs` — 지정 토글 값으로 CBS 블록을 resolve하여 결과 텍스트 미리보기 (전체 조합 모드 지원, 최대 256)
  - `diff_cbs` — 기준선(모든 토글=0) 대비 지정 토글 값의 변경 줄 비교
- **CBS 파서/평가기/추출기 TypeScript 라이브러리** — risucbs CLI의 핵심 로직을 TypeScript로 포팅하여 94개 테스트와 함께 내장

## [0.18.3] - 2026-03-22

### 수정

- **charx 에셋 RisuAI Import 시 미표시** — MCP `add_charx_asset`/`delete_charx_asset`/`rename_charx_asset`가 ZIP 파일만 조작하고 `card.json data.assets` (cardAssets) 배열을 갱신하지 않아 RisuAI에서 에셋을 인식하지 못하던 문제 수정. 에셋 추가/삭제/이름변경 시 cardAssets 자동 동기화 추가. `saveCharx()`에서도 ZIP assets와 cardAssets를 대조하여 누락 엔트리를 자동 보정
- **정규식 Type이 RisuAI에서 미인식** — MCP가 정규식 type을 camelCase(`editDisplay`, `editOutput`)로 저장했으나 RisuAI는 소문자(`editdisplay`, `editoutput`)만 인식. 정규식 쓰기 시 type을 자동으로 소문자 정규화하는 `normalizeRegexType()` 추가

## [0.18.2] - 2026-03-22

### 수정

- **Backspace 2칸 삭제 버그** — CJK IME 조합 중 `renderTabs()` DOM 리빌드가 composition 상태를 깨뜨려 backspace가 조합 해제 + 문자 삭제 두 번 처리되던 문제 수정. 메인 Monaco와 미니 Monaco 모두 composition 가드 + 지연 렌더링 적용
- **로어북/정규식 이름 저장 안 됨** — 데이터는 정상 저장되지만 탭 레이블과 사이드바가 갱신되지 않아 저장 실패로 보이던 문제 수정. 이름 변경 시 탭 레이블 즉시 갱신 + 저장 후 사이드바 리빌드 추가. `buildMarkDirty`가 부모 필드(`regex`/`lorebook`)도 dirty로 표시하도록 개선
- **정규식 Type 편집 미반영** — RisuAI 원본 데이터(`editinput`)와 드롭다운 값(`editInput`)의 대소문자 불일치로 기존 type이 올바르게 선택되지 않던 문제 수정. 대소문자 무시 비교 적용
- **정규식 find/replace 필드 동기화** — 폼 에디터가 `in`/`out`만 설정하고 `find`/`replace`를 동기화하지 않아, `find`가 우선인 preview-engine에서 편집 내용이 반영되지 않던 문제 수정. 양쪽 필드를 함께 갱신하고 초기값도 `find`/`replace` 우선으로 로드

## [0.18.1] - 2026-03-22

### 새 기능

- **`add_lua_section` / `add_css_section` MCP 도구** — 새 Lua/CSS 섹션을 이름과 함께 추가. `insert_in_lua`/`insert_in_css`는 구분자(`-- ===== name =====`, `/* ===== name ===== */`)를 이스케이프하여 새 섹션 생성이 불가능했던 문제 해결. 올바른 구분자와 함께 마지막 섹션 뒤에 생성
- **`list_reference_regex` / `read_reference_regex` MCP 도구** — 참고 자료의 정규식을 개별 접근. `read_reference_field("regex")`가 전체를 한꺼번에 반환하여 컨텍스트를 낭비하던 문제 해결. 로어북/Lua/CSS와 동일한 `list → read` 패턴
- **`add_regex_batch` / `write_regex_batch` MCP 도구** — 여러 정규식 항목을 한 번에 추가/수정 (최대 50개). 단일 확인으로 처리. 로어북의 `add_lorebook_batch`/`write_lorebook_batch`와 동일한 패턴

## [0.18.0] - 2026-03-22

### 새 기능

- **`search_all_fields` MCP 도구** — 모든 텍스트 필드(firstMessage, description, globalNote, alternateGreetings, groupOnlyGreetings, lorebook content 등)에서 한 번에 검색. 잔류 태그 확인 등 전체 스캔에 유용. 필드별 매치 수와 주변 컨텍스트 반환. `include_lorebook`, `include_greetings` 옵션으로 범위 조절 가능
- **`replace_across_all_lorebook` MCP 도구** — 모든 로어북 항목에서 특정 문자열을 한 번에 치환. `list_lorebook` → `replace_in_lorebook` 반복 호출 3단계를 1회로 축소. `field` 옵션으로 content/comment/key/secondkey 대상 선택 가능. `dry_run`으로 미리보기 지원
- **`replace_in_field_batch` MCP 도구** — 하나의 필드에 여러 치환을 순차적으로 적용하고 한 번의 확인으로 처리. 128KB firstMessage에서 10명 캐릭터 태그를 각각 바꿀 때 확인 10회→1회. `dry_run` 지원
- **Charx 에셋 MCP 도구 등록** — 백엔드에 이미 구현된 charx 에셋 관리 엔드포인트를 MCP 도구로 등록: `list_charx_assets`, `read_charx_asset`, `add_charx_asset`, `delete_charx_asset`, `rename_charx_asset`. Node.js 스크립트 우회 불필요
- **`replace_in_field` dry-run 미리보기** — `dry_run: true` 파라미터 추가. 실제 변경 없이 매치 수, 각 매치의 전후 컨텍스트(60자), 위치를 반환. 대형 필드 regex 작업에서 substring 충돌 등 실수 사전 방지

### 변경

- **`replace_in_lorebook` — comment/key 필드 지원 확장** — 기존 content만 지원하던 치환을 comment, key, secondkey 필드까지 확장. `field` 파라미터로 대상 선택 (기본: "content")
- **`replace_in_field` / `insert_in_field` — 필드별 뮤텍스 도입** — 동일 필드에 여러 replace/insert가 병렬 호출될 때 마지막 쓰기만 살아남던 데이터 유실 버그 수정. Promise 체인 기반 필드별 뮤텍스로 순차 실행 보장

### 수정

- **`read_regex` find/replace 필드 누락 수정** — 레거시 데이터에서 `in`/`out` 필드만 있고 `find`/`replace`가 없는 경우, GET /regex/:idx가 두 필드를 모두 삭제하여 빈 응답을 반환하던 버그 수정. 삭제 전 `find = find || in`, `replace = replace || out` 정규화 추가

## [0.17.1] - 2026-03-22

### 수정

- **로어북 라우트 섀도잉 버그 수정** — `POST /lorebook/:idx` catch-all 핸들러가 `batch-replace`, `batch-insert`, `export`, `import` 등의 명명된 라우트를 가로채서 `parseInt('batch-replace')` → NaN 에러 발생. `lorebookReservedPaths` 배열로 GET/POST catch-all에서 예약된 경로를 제외하도록 수정
- **`add_lorebook_batch` 라우트 핸들러 누락 수정** — `toki-mcp-server.ts`에서 `/lorebook/batch-add`로 요청하지만 API 서버에 핸들러가 없어 항상 실패하던 문제 해결. 일괄 추가 핸들러 신규 구현
- **`batch_delete_lorebook` 라우트 핸들러 누락 수정** — `/lorebook/batch-delete` 핸들러가 없어 항상 실패하던 문제 해결. 인덱스 내림차순 삭제로 시프트 문제 방지
- **URL 파라미터 parseInt NaN 취약점 일괄 수정** — regex/lua/css/reference/asset 등 29개 라우트 핸들러에서 `parseInt(parts[N])` 결과에 `isNaN()` 체크 누락. NaN이 range 체크를 우회하여 "Index NaN out of range" 에러 발생 가능. 모든 인스턴스에 `isNaN(idx) ||` 가드 추가

## [0.17.0] - 2026-03-22

### 새 기능

- **`search_in_field` MCP 도구** — 필드 내용에서 문자열/정규식을 검색하고 주변 컨텍스트(전후 N자)와 함께 반환하는 읽기 전용 도구. 대형 필드(127KB+ firstMessage 등)를 전체 읽지 않고 특정 텍스트 위치를 파악 가능. 파라미터: `query`, `context_chars`(기본 100), `regex`, `flags`, `max_matches`(기본 20)
- **`read_field_range` MCP 도구** — 대형 필드의 특정 구간만 반환하는 읽기 전용 도구. 문자 오프셋과 길이로 원하는 부분만 읽기 가능 (최대 10000자). `search_in_field`의 `position` 결과와 연계하여 사용

### 수정

- **`export_field_to_file` 라우트 충돌 버그 수정** — `/field/export` 요청이 제네릭 필드 핸들러(`/field/:name`)에 의해 가로채져 "export"라는 필드를 찾으려 하던 버그 수정. 예약어 배열 방식으로 라우트 조건 개선

---

## [0.16.0] - 2026-03-22

### 수정

- **🔴 Lua 데이터 소실 버그 수정** — `write_lua`, `replace_in_lua`, `insert_in_lua`로 Lua 섹션을 수정한 후 트리거 스크립트 작업(추가/삭제/수정)을 하면 Lua 변경사항이 소실되던 치명적 버그 수정. 근본 원인: Lua 섹션 핸들러가 `triggerScripts`에 변경을 동기화하지 않아서, 이후 `extractPrimaryLua()`가 옛날 데이터로 덮어씀. 3개 핸들러에 `mergePrimaryLua` + `triggerScripts` broadcast 추가

### 새 기능

- **charx 에셋 관리 도구** — `.charx` 파일의 내장 에셋(이미지 등)을 MCP 도구로 관리
  - `list_charx_assets` — 에셋 목록 (경로, 크기)
  - `read_charx_asset` — 에셋을 base64로 읽기
  - `add_charx_asset` — 에셋 추가 (icon/other 폴더)
  - `delete_charx_asset` — 에셋 삭제
- **로어북 일괄 추가** (`add_lorebook_batch` MCP 도구) — 최대 50개 로어북 항목을 한 번에 추가. 단일 확인으로 전부 추가
- **로어북 일괄 삭제** (`batch_delete_lorebook` MCP 도구) — 최대 50개 로어북 항목을 한 번에 삭제. 인덱스 내림차순 처리로 시프트 문제 방지
- **인사말 일괄 삭제** (`batch_delete_greeting` MCP 도구) — 최대 50개 인사말을 한 번에 삭제. 인덱스 내림차순 처리로 시프트 문제 방지

---

## [0.15.1] - 2026-03-21

### 새 기능

- **정규식 필드 치환** (`replace_in_regex` MCP 도구) — 정규식 항목의 find/replace 필드에서 부분 문자열 치환. 대형 HTML이 포함된 regex OUT을 전체 읽지 않고 편집 가능. 정규식 모드 지원
- **정규식 필드 삽입** (`insert_in_regex` MCP 도구) — 정규식 항목의 find/replace 필드에 텍스트 삽입 (end/start/after/before). 대형 regex 필드의 부분 편집 가능

### 수정

- **CSS 섹션 구분자 오인식 수정** — `/* ============================ Title ============================ */` 같은 장식 주석이 섹션 구분자로 잘못 인식되던 문제 수정. `=` 그룹 길이 상한(15자) 및 총 `=` 개수 상한(30) 추가로 일반 CSS 주석과 구분

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
