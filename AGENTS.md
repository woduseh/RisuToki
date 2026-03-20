# Risutoki + AI Coding Assistant — Charx/Risum/Risup Project Guide

> 이 파일은 GitHub Copilot CLI, Codex 등의 AI 코딩 어시스턴트가 세션 시작 시 자동으로 읽습니다.
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
- 생성 파라미터: `temperature`, `maxContext`, `maxResponse`, `frequencyPenalty`, `presencePenalty`, `top_p`, `top_k`, `repetition_penalty`, `min_p`, `top_a` (모두 number)
- 사고/추론: `reasonEffort`, `thinkingTokens`, `thinkingType`, `adaptiveThinkingEffort`
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

### 스킬 문서 (Skills, 읽기 전용)

CBS 문법, Lua API, 로어북, 정규식, HTML/CSS, 트리거, 캐릭터 작성 등의 상세 가이드.

| 도구                      | 설명                                                         |
| ------------------------- | ------------------------------------------------------------ |
| `list_skills`             | 사용 가능한 스킬 목록 (name, description, files)             |
| `read_skill(name, file?)` | 스킬 문서 읽기 (기본: SKILL.md, 참조 파일도 file 파라미터로) |

상세 문법이 필요할 때 `list_skills` → `read_skill`로 on-demand 로딩하세요.

### Danbooru 태그 도구 (이미지 프롬프트용)

캐릭터 이미지 생성 프롬프트를 작성할 때 유효한 Danbooru 태그를 검증·검색·참조하는 도구.
로컬 태그 DB(6,549개) 우선 검증 + Danbooru REST API 온라인 폴백.

| 도구                                            | 설명                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `validate_danbooru_tags(tags)`                  | 태그 목록 유효성 검증 + 무효 태그에 유사 태그 추천                     |
| `search_danbooru_tags(query, category?)`        | 키워드/와일드카드로 태그 검색 (인기순 정렬)                            |
| `get_popular_danbooru_tags(group_by_semantic?)` | 인기 태그 조회. `group_by_semantic=true`로 의미별 그룹 (hair, eyes 등) |

**프롬프트 템플릿:**

| 프롬프트             | 설명                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `danbooru_tag_guide` | Danbooru 태그 작성 규칙 + 카테고리별 인기 태그 예시. 캐릭터 설명 전달 가능 |

**사용 흐름:**

1. `danbooru_tag_guide` 프롬프트로 태그 규칙 확인
2. 캐릭터 로어북(`read_lorebook`)에서 외형 정보 수집
3. `search_danbooru_tags`로 적절한 태그 검색
4. `validate_danbooru_tags`로 사용할 태그 전부 검증
5. 검증된 태그만으로 이미지 프롬프트 작성

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

### risum — 모듈

| 필드                  | 용도                | 비고    |
| --------------------- | ------------------- | ------- |
| `name`                | 모듈 이름           |         |
| `description`         | 모듈 설명           |         |
| `cjs`                 | CommonJS 코드       |         |
| `lua`                 | Lua 트리거 스크립트 |         |
| `lowLevelAccess`      | 저수준 접근 활성화  | boolean |
| `backgroundEmbedding` | 배경 임베딩 HTML    |         |
| `moduleNamespace`     | 모듈 네임스페이스   |         |
| `moduleId`            | 고유 ID (읽기전용)  | UUID    |

### risup — 프리셋

프리셋 파일은 AI 모델과 생성 파라미터를 저장합니다. 핵심 필드만 나열합니다.

| 카테고리 | 주요 필드                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 모델     | `aiModel`, `subModel`, `apiType`                                                                                                            |
| 프롬프트 | `mainPrompt`, `jailbreak`                                                                                                                   |
| 생성     | `temperature`, `maxContext`, `maxResponse`, `top_p`, `top_k`, `min_p`, `top_a`, `repetition_penalty`, `frequencyPenalty`, `presencePenalty` |
| 사고     | `reasonEffort`, `thinkingTokens`, `thinkingType`, `adaptiveThinkingEffort`                                                                  |
| 템플릿   | `instructChatTemplate`, `JinjaTemplate`, `promptTemplate`(JSON)                                                                             |

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
  "folder": "folder:uuid",
  "activationPercent": 100,
  "id": "uuid"
}
```

**핵심 필드 설명:**

- `key`: 대화에 이 키워드가 등장하면 content가 프롬프트에 삽입됨. 빈 문자열이면 키워드 비활성.
- `comment`: 관리용 이름. Lua `getLoreBooks(triggerId, commentFilter)`에서 검색 필터로도 쓰임.
- `alwaysActive`: true면 키워드 매칭 없이 항상 삽입.
- `insertorder`: 높을수록 프롬프트 뒤쪽에 배치.
- `selective` + `secondkey`: 둘 다 설정 시 key와 secondkey가 모두 매칭되어야 활성화.
- `mode`: `normal` | `constant` | `multiple` | `child` | `folder`
- `folder`: 폴더 그룹 UUID. `mode: "folder"`인 항목이 폴더 자체.
- `activationPercent`: 활성화 확률 (0~100). 기본 100.
- `key=""` + `alwaysActive=false` → **0 토큰** (완전히 스킵됨). DB 저장용으로 활용.

**폴더 관리:**

- 폴더 생성: `add_lorebook({ comment: "폴더이름", mode: "folder", key: "", content: "" })`
- 아이템을 폴더로 이동: `write_lorebook(index, { folder: "folder:UUID" })` — UUID는 폴더 항목의 `id` 값
- 폴더에서 꺼내기: `write_lorebook(index, { folder: "" })`
- `list_lorebook` 결과에서 `mode: "folder"`인 항목이 폴더 자체 (내용 없음)

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

| type          | 시점                         | 용도                       |
| ------------- | ---------------------------- | -------------------------- |
| `editinput`   | 유저 입력 → 서버 전송 전     | 명령어 변환, 입력 전처리   |
| `editoutput`  | AI 응답 생성 후 저장 전      | 응답 후처리, 변수 파싱     |
| `editdisplay` | 화면 렌더링 시               | UI 표시용 변환, 태그 숨김  |
| `editrequest` | 프롬프트 조립 후 API 전송 전 | 프롬프트 수정, 토큰 최적화 |

**특수 OUT 토큰:** `$0` (전체 매치), `$1`~`$9` (캡처 그룹), `$n` (줄바꿈), `$&` (전체 매치), `$<그룹명>` (명명 캡처)

**특수 플래그:** `@@emo 감정명` (감정 표시), `@@inject` (채팅에 주입), `@@move_top`/`@@move_bottom` (매치 이동)

---

## 3. 상세 문법 가이드

CBS, Lua, 로어북, 정규식, HTML/CSS, 트리거 스크립트 등의 상세 문법은 `list_skills` → `read_skill` MCP 도구로 on-demand 접근하세요.

주요 스킬:

- **writing-cbs-syntax** — CBS 템플릿 태그 레퍼런스 (130+ 태그)
- **writing-lua-scripts** — Lua 5.4 이벤트 콜백, 채팅/변수/로어북/LLM/UI API
- **writing-lorebooks** — 로어북 구조, 키워드 활성화, 데코레이터, 폴더 관리
- **writing-regex-scripts** — 정규식 type별 용도, 캡처 그룹, 특수 플래그
- **writing-html-css** — backgroundEmbedding, x-risu- 접두사, CBS 동적 주입
- **writing-trigger-scripts** — 트리거 이벤트 자동화, V2/Lua/CBS/정규식 통합
- **writing-asset-prompts** — Anima 모델 이미지 프롬프트 작성
- **authoring-characters** — 캐릭터 description 작성 (행동 깊이, 말투 시스템)
- **authoring-lorebook-bots** — 로어북 기반 봇 description 작성

---

## 4. 효과적인 작업 흐름

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

### 로어북 검색/수정 시

1. `list_lorebook`은 항목이 수백 개면 결과가 매우 클 수 있음
2. 먼저 `read_lorebook(index)`로 현재 내용 확인
3. `write_lorebook(index, data)` — **변경할 필드만** 전달 (부분 수정 가능)
4. comment 네이밍이 Lua 검색에 영향을 주므로 **기존 패턴과 일치**시킬 것

---

## 5. 주의사항

- `write_field`와 `write_lorebook`은 **사용자 확인 팝업**이 뜸 (에디터 측)
- 로어북 `comment`는 Lua `getLoreBooks()` 검색에 사용되므로, **comment 변경 시 Lua 코드의 검색 패턴과 일치하는지 반드시 확인**
- 로어북 `key`가 비어있어도 `getLoreBooks()`의 comment 필터로 접근 가능 (DB 저장용)
- 참고 자료(references)는 **읽기 전용** — 수정 불가, 레퍼런스로만 활용
- `list_lorebook` 결과에서 `mode: "folder"`인 항목은 폴더 자체 (내용 없음)
- risup의 복잡한 중첩 객체 (ooba, NAISettings, customFlags 등)는 보존되지만 개별 편집 불가

---

## 6. 프로젝트별 참고사항

> 아래는 프로젝트 제작자가 작성하는 영역입니다.
> 프로젝트 고유의 규칙, 구조, 가이드 경로 등을 여기에 추가하세요.

### 가이드 파일 위치

- `skills/` — LLM 최적화 영문 스킬 문서 (`list_skills` / `read_skill` MCP 도구로 접근)
- `guides/` — 한국어 원본 가이드 (앱 내 가이드 뷰어로 접근)

### 프로젝트 규칙

#### 문서 및 버전 관리 (필수)

매 기능 개선·버그 수정 시 **반드시** 아래 3가지를 함께 업데이트:

1. **`package.json` 버전 범프** — [시멘틱 버저닝](https://semver.org/) 준수
   - `MAJOR` (x.0.0): 호환성을 깨는 변경
   - `MINOR` (0.x.0): 새 기능 추가 (하위 호환)
   - `PATCH` (0.0.x): 버그 수정 (하위 호환)
2. **`CHANGELOG.md` 업데이트** — [Keep a Changelog](https://keepachangelog.com/) 형식
   - 새 버전 항목을 파일 **최상단**에 추가
   - `### 새 기능` / `### 변경` / `### 수정` / `### 삭제` 카테고리 사용
3. **`README.md` 업데이트** — 새 기능이 사용자에게 보이는 변경이면 해당 섹션 갱신
4. **`AGENTS.md` 업데이트** — MCP 도구·필드·워크플로우 변경 시 해당 섹션 갱신

이 규칙은 별도 지시가 없어도 **매 작업마다** 자동 적용합니다.
