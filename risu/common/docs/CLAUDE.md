# Risutoki + Claude Code — Charx/Risum/Risup Project Guide

> 이 파일은 프로젝트 루트에 배치하면 Claude Code가 세션 시작 시 자동으로 읽습니다.
> Risutoki MCP 도구로 RisuAI .charx, .risum, .risup 파일을 편집하는 프로젝트용 공용 가이드입니다.

---

## 1. MCP 도구 레퍼런스 (Risutoki)

### 파일 타입

| 확장자   | 설명                             | 구조                                     |
| -------- | -------------------------------- | ---------------------------------------- |
| `.charx` | 캐릭터 카드 v3                   | ZIP (card.json + module.risum + assets/) |
| `.risum` | 모듈 (로어북/정규식/트리거/에셋) | RPACK 바이너리                           |
| `.risup` | 프리셋 (AI 모델/생성 파라미터)   | 암호화된 JSON                            |

### 필드 (Fields)

| 도구                          | 설명                                               |
| ----------------------------- | -------------------------------------------------- |
| `list_fields`                 | 편집 가능한 필드 목록 및 크기 확인 (fileType 포함) |
| `read_field(field)`           | 필드 전체 내용 읽기                                |
| `write_field(field, content)` | 필드에 새 내용 쓰기 (사용자 확인 필요)             |

**공통 필드 (모든 파일 타입):** `name`, `description`, `lua`, `triggerScripts`

**charx 전용 필드:**

- 기본: `globalNote`, `firstMessage`, `alternateGreetings`, `groupOnlyGreetings`, `css`, `defaultVariables`
- 캐릭터 정보: `personality`, `scenario`, `exampleMessage`, `systemPrompt`, `creatorcomment`, `tags`
- 메타데이터: `creator`, `characterVersion`, `nickname`, `source`, `additionalText`, `license`
- 읽기전용: `creationDate`, `modificationDate`

**risum 전용 필드:**

- `cjs`, `lowLevelAccess`(boolean), `hideIcon`(boolean), `backgroundEmbedding`
- `moduleNamespace`, `customModuleToggle`, `mcpUrl`, `moduleName`, `moduleDescription`
- 읽기전용: `moduleId`

**risup 전용 필드:**

- 기본: `mainPrompt`, `jailbreak`, `aiModel`, `subModel`, `apiType`, `presetImage`
- 생성 파라미터: `temperature`(number), `maxContext`(number), `maxResponse`(number), `frequencyPenalty`(number), `presencePenalty`(number), `top_p`(number), `top_k`(number), `repetition_penalty`(number), `min_p`(number), `top_a`(number)
- 사고/추론: `reasonEffort`(number), `thinkingTokens`(number), `thinkingType`, `adaptiveThinkingEffort`
- 템플릿: `instructChatTemplate`, `JinjaTemplate`, `customPromptTemplateToggle`, `templateDefaultVariables`, `moduleIntergration`, `useInstructPrompt`(boolean)
- JSON 스키마: `jsonSchemaEnabled`(boolean), `jsonSchema`, `strictJsonSchema`(boolean), `extractJson`
- 그룹: `groupTemplate`, `groupOtherBotRole`
- 기타: `promptPreprocess`(boolean), `promptTemplate`(JSON), `presetBias`(JSON), `formatingOrder`(JSON), `autoSuggestPrompt`, `autoSuggestPrefix`, `autoSuggestClean`(boolean), `localStopStrings`(JSON), `outputImageModal`(boolean), `verbosity`(number), `fallbackWhenBlankResponse`(boolean), `systemContentReplacement`, `systemRoleReplacement`

### Lua 섹션 (Lua Sections)

lua 필드는 `-- ===== 섹션명 =====` 구분자로 여러 섹션으로 분할됨. 로어북/정규식과 동일한 패턴으로 개별 섹션 편집 가능.

**중요:** Lua 코드는 **반드시 첫 줄부터 섹션 구분자로 시작**해야 섹션 분할이 작동합니다. 새 섹션을 추가할 때도 구분자 헤더를 먼저 작성하세요.

```lua
-- ===== main =====
-- 메인 트리거 스크립트

-- ===== utils =====
-- 유틸리티 함수
```

| 도구                                                | 설명                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `list_lua`                                          | Lua 섹션 목록 (index, 이름, 크기)                                                                                     |
| `read_lua(index)`                                   | 특정 인덱스의 Lua 섹션 코드 읽기                                                                                      |
| `write_lua(index, content)`                         | 특정 인덱스의 Lua 섹션 전체 교체 (사용자 확인 필요)                                                                   |
| `replace_in_lua(index, find, replace)`              | 섹션 내 문자열 치환 — 대용량 섹션도 전체를 읽지 않고 서버에서 직접 처리. `regex: true` + `flags` 옵션으로 정규식 지원 |
| `insert_in_lua(index, content, position?, anchor?)` | 섹션에 코드 삽입. position: `end`(기본), `start`, `after`, `before`. after/before는 `anchor` 문자열 기준              |

### CSS 섹션 (CSS Sections)

css 필드는 다중행 구분자로 여러 섹션으로 분할됨:

```
/* ============================================================
   섹션명
   ============================================================ */
```

단일행 `/* ===== 섹션명 ===== */`도 지원. Lua 섹션과 동일한 패턴으로 개별 섹션 편집 가능.

**중요:** CSS 코드는 **반드시 첫 줄부터 섹션 구분자로 시작**해야 섹션 분할이 작동합니다. 새 섹션을 추가할 때도 구분자 헤더를 먼저 작성하세요.

```css
/* ============================================================
   main
   ============================================================ */
/* 메인 스타일 */

/* ============================================================
   layout
   ============================================================ */
/* 레이아웃 스타일 */
```

| 도구                                                | 설명                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `list_css`                                          | CSS 섹션 목록 (index, 이름, 크기)                                                                                     |
| `read_css(index)`                                   | 특정 인덱스의 CSS 섹션 코드 읽기                                                                                      |
| `write_css(index, content)`                         | 특정 인덱스의 CSS 섹션 전체 교체 (사용자 확인 필요)                                                                   |
| `replace_in_css(index, find, replace)`              | 섹션 내 문자열 치환 — 대용량 섹션도 전체를 읽지 않고 서버에서 직접 처리. `regex: true` + `flags` 옵션으로 정규식 지원 |
| `insert_in_css(index, content, position?, anchor?)` | 섹션에 코드 삽입. position: `end`(기본), `start`, `after`, `before`. after/before는 `anchor` 문자열 기준              |

### 로어북 (Lorebook)

| 도구                          | 설명                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `list_lorebook`               | 전체 로어북 항목 목록 (index, comment, key, 활성화 상태) |
| `read_lorebook(index)`        | 특정 인덱스의 로어북 항목 전체 데이터 읽기               |
| `write_lorebook(index, data)` | 특정 인덱스의 로어북 항목 수정 (부분 수정 가능)          |
| `add_lorebook(data)`          | 새 로어북 항목 추가                                      |
| `delete_lorebook(index)`      | 특정 인덱스의 로어북 항목 삭제                           |

### 정규식 (Regex)

| 도구                       | 설명                           |
| -------------------------- | ------------------------------ |
| `list_regex`               | 정규식 스크립트 항목 목록      |
| `read_regex(index)`        | 특정 인덱스의 정규식 항목 읽기 |
| `write_regex(index, data)` | 특정 인덱스의 정규식 항목 수정 |
| `add_regex(data)`          | 새 정규식 항목 추가            |
| `delete_regex(index)`      | 특정 인덱스의 정규식 항목 삭제 |

### 참고 자료 (References, 읽기 전용)

| 도구                                 | 설명                       |
| ------------------------------------ | -------------------------- |
| `list_references`                    | 로드된 참고 자료 파일 목록 |
| `read_reference_field(index, field)` | 참고 자료의 특정 필드 읽기 |

---

## 2. 파일 구조

### charx — 캐릭터 카드 v3

| 필드                 | 용도                       | 비고                                                      |
| -------------------- | -------------------------- | --------------------------------------------------------- |
| `name`               | 캐릭터 이름                |                                                           |
| `description`        | 캐릭터 설명 (AI에 전달)    |                                                           |
| `personality`        | 캐릭터 성격                |                                                           |
| `scenario`           | 시나리오/배경              |                                                           |
| `firstMessage`       | 첫 메시지 (CBS 사용 가능)  |                                                           |
| `exampleMessage`     | 예시 대화                  | card.json의 `mes_example`                                 |
| `systemPrompt`       | 시스템 프롬프트            | `post_history_instructions`와 별개                        |
| `globalNote`         | 글로벌 노트                | 항상 AI에 전달됨. card.json의 `post_history_instructions` |
| `css`                | CSS + HTML (UI/사이드패널) | `backgroundHTML` 영역                                     |
| `defaultVariables`   | 기본 변수 초기값           | CBS `{{getvar}}`로 접근                                   |
| `lua`                | Lua 트리거 스크립트        | RisuAI Lua 5.4 API                                        |
| `alternateGreetings` | 추가 첫 메시지             | 문자열 배열                                               |
| `groupOnlyGreetings` | 그룹 전용 인사말           | 문자열 배열                                               |
| `tags`               | 태그                       | 문자열 배열                                               |
| `creator`            | 제작자 이름                |                                                           |
| `characterVersion`   | 캐릭터 버전                |                                                           |
| `nickname`           | 닉네임 (표시명)            |                                                           |
| `source`             | 소스 URL                   | 문자열 배열                                               |
| `creatorcomment`     | 제작자 코멘트              | card.json의 `creator_notes`                               |
| `additionalText`     | 추가 텍스트                |                                                           |
| `license`            | 라이선스                   |                                                           |

### risum — 모듈

| 필드                                | 용도                                | 비고    |
| ----------------------------------- | ----------------------------------- | ------- |
| `name` / `moduleName`               | 모듈 이름                           |         |
| `description` / `moduleDescription` | 모듈 설명                           |         |
| `cjs`                               | CommonJS 코드                       |         |
| `lua`                               | Lua 트리거 (triggerscript에서 추출) |         |
| `lowLevelAccess`                    | 저수준 접근 활성화                  | boolean |
| `hideIcon`                          | 아이콘 숨김                         | boolean |
| `backgroundEmbedding`               | 배경 임베딩 HTML                    |         |
| `moduleNamespace`                   | 모듈 네임스페이스                   |         |
| `customModuleToggle`                | 커스텀 토글 스크립트                |         |
| `mcpUrl`                            | MCP 서버 URL                        |         |
| `moduleId`                          | 고유 ID (읽기전용)                  | UUID    |

### risup — 프리셋

프리셋 파일은 AI 모델과 생성 파라미터를 저장합니다. 복잡한 중첩 객체(ooba, NAISettings, customFlags 등)는 `_presetData`에 보존되지만 개별 편집은 불가합니다.

핵심 필드만 나열합니다. 전체 목록은 `list_fields`로 확인하세요.

| 카테고리 | 주요 필드                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 모델     | `aiModel`, `subModel`, `apiType`                                                                                                            |
| 프롬프트 | `mainPrompt`, `jailbreak`                                                                                                                   |
| 생성     | `temperature`, `maxContext`, `maxResponse`, `top_p`, `top_k`, `min_p`, `top_a`, `repetition_penalty`, `frequencyPenalty`, `presencePenalty` |
| 사고     | `reasonEffort`, `thinkingTokens`, `thinkingType`, `adaptiveThinkingEffort`                                                                  |
| 템플릿   | `instructChatTemplate`, `JinjaTemplate`, `promptTemplate`(JSON)                                                                             |
| 스키마   | `jsonSchemaEnabled`, `jsonSchema`, `strictJsonSchema`                                                                                       |

### 로어북 항목 구조

```json
{
  "key": "키워드1, 키워드2",
  "comment": "관리용 이름 (Lua에서 검색 시 comment 필터로 사용)",
  "content": "AI에 전달될 실제 텍스트 (CBS 사용 가능)",
  "mode": "normal",
  "insertorder": 100,
  "alwaysActive": false,
  "secondkey": "",
  "selective": false,
  "useRegex": false,
  "folder": "folder:<부모 폴더의 key 값>",
  "activationPercent": 100,
  "id": "uuid"
}
```

> **폴더 항목은 별도 구조:** `{ "key": "folder:<UUID v4>", "comment": "폴더이름", "content": "", "mode": "folder" }` — 폴더 식별자는 `key` 필드에 저장됨

**핵심 필드 설명:**

- `key`: 대화에 이 키워드가 등장하면 content가 프롬프트에 삽입됨. 빈 문자열이면 키워드 비활성.
- `comment`: 관리용 이름. Lua `getLoreBooks(triggerId, commentFilter)`에서 검색 필터로도 쓰임.
- `alwaysActive`: true면 키워드 매칭 없이 항상 삽입.
- `insertorder`: 높을수록 프롬프트 뒤쪽에 배치.
- `selective` + `secondkey`: 둘 다 설정 시 key와 secondkey가 모두 매칭되어야 활성화.
- `mode`: `normal` | `constant` | `multiple` | `child` | `folder`
- `folder`: 소속 폴더 참조. `"folder:<UUID>"` 형식으로 폴더 항목의 `key` 값과 매칭. `mode: "folder"`인 항목이 폴더 자체.
- `activationPercent`: 활성화 확률 (0~100). 기본 100.
- `key=""` + `alwaysActive=false` → **0 토큰** (완전히 스킵됨). DB 저장용으로 활용.

**폴더 관리:**

- 폴더 생성: `add_lorebook({ comment: "폴더이름", mode: "folder", key: "folder:<UUID>", content: "" })` — `key` 필드에 `"folder:<UUID v4>"` 형식으로 고유 식별자를 지정해야 함
- 아이템을 폴더로 이동: `write_lorebook(index, { folder: "folder:<UUID>" })` — 폴더 항목의 `key` 값과 동일한 문자열
- 폴더에서 꺼내기: `write_lorebook(index, { folder: "" })`
- `list_lorebook` 결과에서 `mode: "folder"`인 항목이 폴더 자체 (내용 없음)
- **주의:** 폴더 식별자는 `id` 필드가 아닌 **`key` 필드**에 저장됨. `key: "folder:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"` 형식 필수

### 정규식 항목 구조

```json
{
  "comment": "스크립트 이름",
  "type": "editdisplay | editoutput | editinput | editrequest",
  "find": "정규식 패턴 (IN)",
  "replace": "치환 텍스트 (OUT, CBS/HTML 가능)",
  "flag": "g | gi | gm | gs",
  "ableFlag": true
}
```

**type별 적용 시점:**
| type | 시점 | 용도 |
|------|------|------|
| `editinput` | 유저 입력 → 서버 전송 전 | 명령어 변환, 입력 전처리 |
| `editoutput` | AI 응답 생성 후 저장 전 | 응답 후처리, 변수 파싱 |
| `editdisplay` | 화면 렌더링 시 | UI 표시용 변환, 태그 숨김 |
| `editrequest` | 프롬프트 조립 후 API 전송 전 | 프롬프트 수정, 토큰 최적화 |

**특수 OUT 토큰:** `$0` (전체 매치), `$1`~`$9` (캡처 그룹), `$n` (줄바꿈), `$&` (전체 매치), `$<그룹명>` (명명 캡처)

**특수 플래그:** `@@emo 감정명` (감정 표시), `@@inject` (채팅에 주입), `@@move_top`/`@@move_bottom` (매치 이동)

---

## 3. CBS 핵심 문법 (Custom Bracket Syntax)

→ **상세 가이드: [CBS_QUICK_REF.md](CBS_QUICK_REF.md)** (130+ 태그 완전 레퍼런스)

### 핵심 태그 요약

```
{{char}} / {{user}}                  — 캐릭터/유저 이름
{{getvar::변수명}}                   — 변수 읽기
{{setvar::변수명::값}}               — 변수 쓰기
{{addvar::변수명::숫자}}             — 변수에 숫자 더하기
{{setdefaultvar::변수명::기본값}}     — 없을 때만 설정
{{getglobalvar::변수명}}             — 전역 변수 읽기

{{#when::값::is::비교값}}...{{:else}}...{{/when}} — 조건문
{{#each [배열] as item}}{{slot::item}}{{/each}}   — 반복문

{{calc::2+3*4}}                      — 수학 계산
{{random::A::B::C}}                  — 랜덤 선택
{{roll::2d6}}                        — 주사위
{{asset::이름}}                      — 에셋 표시
{{button::라벨::트리거명}}            — 버튼 (클릭 시 Lua 함수 호출)

{{lastmessage}}                      — 마지막 메시지
{{description}} / {{personality}}    — 캐릭터 필드 접근
{{time}} / {{date::YYYY-MM-DD}}      — 현재 시간/날짜
```

---

## 4. Lua API 핵심 (RisuAI)

→ **상세 가이드: [문법가이드\_Lua.md](문법가이드_Lua.md)**

### 이벤트 함수

| 함수                         | 실행 시점                                                       |
| ---------------------------- | --------------------------------------------------------------- |
| `onInput(id)`                | 유저 전송 시 (프롬프트 생성 후)                                 |
| `onStart(id)`                | 프롬프트 생성 시 (AI 호출 전)                                   |
| `onOutput(id)`               | AI 응답 후                                                      |
| `listenEdit(type, callback)` | 수정 이벤트 감지 (editRequest/editDisplay/editInput/editOutput) |

### 주요 API

```lua
-- 변수
getChatVar(id, "변수명") / setChatVar(id, "변수명", 값)
getGlobalVar(id, "변수명")
getState(id, "이름") / setState(id, "이름", 테이블)  -- JSON 자동 변환

-- 채팅
getChat(id, index) / setChat(id, index, value)
addChat(id, role, value) / removeChat(id, index)
getChatLength(id) / getCharacterLastMessage(id) / getUserLastMessage(id)

-- 캐릭터
getName(id) / setName(id, name)
getDescription(id) / setDescription(id, desc)

-- 로어북
getLoreBooks(id, "comment 필터")  -- DB 검색 (comment 부분 매칭)
upsertLocalLoreBook(id, "id", "content", { key="키워드", alwaysActive=false })

-- AI 모델
LLM(id, prompt, useMultimodal?)  -- 비동기, :await() 필요
simpleLLM(id, prompt)            -- 비동기, :await() 필요
axLLM(id, prompt)                -- 보조 모델, 비동기

-- UI
alertNormal(id, "메시지") / alertError(id, "메시지")
alertInput(id, "프롬프트")       -- 비동기, :await() 필요
alertSelect(id, {"옵션1","옵션2"}) / alertConfirm(id, "질문")

-- 유틸리티
sleep(id, 밀리초) / cbs(id, "CBS텍스트") / log(값)
getTokens(id, "텍스트")         -- 비동기
```

**주의사항:**

- `upsertLocalLoreBook`으로 생성한 로어북은 **다음 턴**에야 AI 프롬프트에 반영됨 (1턴 딜레이).
- `getChat(id, i)` / `setChat(id, i, ...)` 인덱스는 **0부터**, `getChatLength(id)`는 **1부터** 카운트.
- `request(id, url)`: HTTPS GET, 120자 URL 제한, 분당 5회 제한. `lowLevelAccess` 필요.

---

## 5. 효과적인 작업 흐름

### 로어북 검색 시

1. `list_lorebook`은 항목이 수백 개면 결과가 매우 클 수 있음
2. 결과가 파일로 저장되면 **Grep/Python으로 검색** (comment, key 기준)
3. 찾은 index로 `read_lorebook(index)` 호출

### 로어북 수정 시

1. 먼저 `read_lorebook(index)`로 현재 내용 확인
2. `write_lorebook(index, data)` — **변경할 필드만** 전달 (부분 수정 가능)
3. comment 네이밍이 Lua 검색에 영향을 주므로 **기존 패턴과 일치**시킬 것

### 중요: 읽기 규칙

- **`read_field("lua")`와 `read_field("css")`는 사용하지 마세요** — 전체를 한번에 반환하여 컨텍스트를 낭비합니다
- lua는 반드시 `list_lua` → `read_lua(index)` 순서로 섹션 단위 읽기
- css는 반드시 `list_css` → `read_css(index)` 순서로 섹션 단위 읽기
- 로어북은 `list_lorebook` → `read_lorebook(index)` 순서로 개별 읽기
- 정규식은 `list_regex` → `read_regex(index)` 순서로 개별 읽기

### Lua 코드 수정 시

1. `list_lua`로 섹션 목록 확인 (index, 이름, 크기)
2. **소형 섹션** (수 KB): `read_lua(index)` → `write_lua(index, content)` 로 전체 교체
3. **대형 섹션** (수십 KB+): 전체를 읽지 않고 아래 도구 사용
   - `replace_in_lua(index, find, replace)` — 문자열 치환 (정규식 지원)
   - `insert_in_lua(index, content, position, anchor?)` — 코드 삽입 (end/start/after/before)

### CSS 코드 수정 시

1. `list_css`로 섹션 목록 확인 (index, 이름, 크기)
2. **소형 섹션** (수 KB): `read_css(index)` → `write_css(index, content)` 로 전체 교체
3. **대형 섹션** (수십 KB+): 전체를 읽지 않고 아래 도구 사용
   - `replace_in_css(index, find, replace)` — 문자열 치환 (정규식 지원)
   - `insert_in_css(index, content, position, anchor?)` — 코드 삽입 (end/start/after/before)

---

## 6. 주의사항

- `write_field`와 `write_lorebook`은 **사용자 확인 팝업**이 뜸 (에디터 측)
- 로어북 `comment`는 Lua `getLoreBooks()` 검색에 사용되므로, **comment 변경 시 Lua 코드의 검색 패턴과 일치하는지 반드시 확인**
- 로어북 `key`가 비어있어도 `getLoreBooks()`의 comment 필터로 접근 가능 (DB 저장용)
- 참고 자료(references)는 **읽기 전용** — 수정 불가, 레퍼런스로만 활용
- `list_lorebook` 결과에서 `mode: "folder"`인 항목은 폴더 자체 (내용 없음)
- risup의 복잡한 중첩 객체 (ooba, NAISettings, customFlags, openrouterProvider 등)는 보존되지만 개별 편집 불가

---

## 7. 프로젝트별 참고사항

> 아래는 프로젝트 제작자가 작성하는 영역입니다.
> 프로젝트 고유의 규칙, 구조, 가이드 경로 등을 여기에 추가하세요.

### 가이드 파일 위치

공용 문법 가이드는 현재 `risu/common/docs/` 아래에 있으며, 산출물별 가이드는 `risu/bot/docs/`, `risu/prompts/docs/`, `risu/modules/docs/`, `risu/plugins/docs/` 같은 sibling 디렉토리로 분리되어 있습니다.

```
risu/
├── common/docs/
│   ├── CLAUDE.md                      — 이 파일 (공용 MCP/문법 레퍼런스)
│   ├── CBS_QUICK_REF.md               — CBS 전체 레퍼런스
│   ├── 문법가이드_Lua.md               — Lua 5.4 문법 + RisuAI API 상세
│   ├── 문법가이드_로어북.md             — 로어북 구조, CBS 문법, 데코레이터, 활용 패턴
│   ├── 문법가이드_정규식.md             — 정규식 스크립트 type별 용도, 패턴 예시
│   ├── 문법가이드_HTML_CSS.md          — CSS/HTML UI 제작, backgroundEmbedding, 에셋 활용
│   ├── 문법가이드_트리거_스크립트.md     — Lua 트리거 이벤트, callAxModel, 고급 패턴
│   └── 문법가이드_에셋_프롬프트.md      — description 기반 이미지 프롬프트 작성 가이드
├── bot/docs/                          — bot 전용 비평/구성 가이드
├── prompts/docs/                      — `.risup` 전용 가이드
├── modules/docs/                      — `.risum` 전용 가이드
└── plugins/docs/                      — plugin v3 전용 가이드
```

세션 시작 시 이 파일(`CLAUDE.md`)이 자동 로드됩니다. 상세 문법이 필요하면 위 가이드를 `read_reference_field` 도구로 읽거나, 파일 경로로 직접 참조하세요.

### 프로젝트 규칙

<!-- 프로젝트별 절대 규칙, 네이밍 컨벤션, 빌드 절차 등을 여기에 작성 -->
