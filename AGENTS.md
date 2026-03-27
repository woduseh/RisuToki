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

| 도구                                                                          | 설명                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_fields`                                                                 | 편집 가능한 필드 목록 및 크기 확인 (fileType 포함)                                                                                                                |
| `read_field(field)`                                                           | 필드 전체 내용 읽기                                                                                                                                               |
| `read_field_batch(fields[])`                                                  | 여러 필드를 한번에 읽기 (최대 20개)                                                                                                                               |
| `write_field(field, content)`                                                 | 필드에 새 내용 쓰기 (사용자 확인 필요)                                                                                                                            |
| `replace_in_field(field, find, replace)`                                      | 필드 내 문자열 치환 — 대형 필드를 읽지 않고 서버에서 직접 처리. `regex: true` + `flags` 옵션으로 정규식 지원. `dry_run: true`로 미리보기 가능. 문자열 필드만 지원 |
| `replace_in_field_batch(field, replacements[], dry_run?)`                     | 하나의 필드에 여러 치환을 순차 적용하고 한 번의 확인으로 처리. `replacements: [{find, replace, regex?, flags?}]` (최대 50개). `dry_run` 지원                      |
| `replace_block_in_field(field, start_anchor, end_anchor, content?, ...)`      | 두 앵커 사이의 멀티라인 블록 교체. `include_anchors: false`로 앵커 유지 가능. `dry_run` 지원. 여러 줄에 걸친 텍스트도 안전하게 교체                               |
| `insert_in_field(field, content, position?, anchor?)`                         | 필드에 텍스트 삽입. position: `end`(기본), `start`, `after`, `before`. 문자열 필드만 지원                                                                         |
| `write_field_batch(entries[])`                                                | 여러 필드를 한 번에 수정 (확인 1회). `entries: [{field, content}]` (최대 20개). triggerScripts/alternateGreetings 제외                                            |
| `search_in_field(field, query, context_chars?, regex?, flags?, max_matches?)` | 필드 내용에서 문자열/정규식을 검색하고 주변 컨텍스트와 함께 반환 — 수정 없이 읽기 전용. grep처럼 작동                                                             |
| `search_all_fields(query, regex?, flags?, ...)`                               | 모든 텍스트 필드(firstMessage, description, globalNote, 인사말, 로어북 등)에서 한 번에 검색. 잔류 태그 확인 등 전체 스캔에 유용                                   |
| `read_field_range(field, offset?, length?)`                                   | 대형 필드의 특정 구간만 읽기. 문자 오프셋과 길이로 원하는 부분만 반환 (최대 10000자). search_in_field의 position과 연계 가능                                      |
| `snapshot_field(field)`                                                       | 필드의 현재 값을 스냅샷으로 저장. 필드당 최대 10개 보관. 파일 전환 시 초기화                                                                                      |
| `list_snapshots(field)`                                                       | 필드의 저장된 스냅샷 목록 확인 (ID, 시점, 크기)                                                                                                                   |
| `restore_snapshot(field, snapshot_id)`                                        | 스냅샷으로 필드 복원. 사용자 확인 필요                                                                                                                            |
| `get_field_stats(field)`                                                      | 필드 통계 (문자 수, 행 수, 단어 수, CBS/HTML 태그 수, 빈 행 수, 최장 행 길이). 읽기 전용                                                                          |

**공통 필드 (모든 파일 타입):** `name`, `description`, `lua`, `triggerScripts`

**charx 전용 필드:**

편집 가능:

- 기본: `globalNote` (포스트 히스토리 인스트럭션), `firstMessage` (첫 메시지), `alternateGreetings` (추가 첫 메시지 배열), `css` (커스텀 CSS/HTML), `defaultVariables` (CBS 변수 초기값)
- 캐릭터 정보: `exampleMessage` (예시 대화), `systemPrompt` (시스템 프롬프트), `creatorcomment` (제작자 노트, 첫 메시지 위에 표시)
- 메타데이터: `creator` (제작자 이름), `characterVersion` (캐릭터 버전)

읽기전용 (I/O 보존, 편집 불가):

- 비권장: `personality` (description에 통합 권장), `scenario` (description에 통합 권장)
- 미사용: `groupOnlyGreetings` (RisuAI에서 참조 없음), `nickname`, `additionalText`, `source`, `tags`, `license`
- 시스템: `creationDate`, `modificationDate`

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

| 도구                                                | 설명                                                                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_lua`                                          | Lua 섹션 목록 (index, 이름, 크기)                                                                                                                                                              |
| `read_lua(index)`                                   | 특정 인덱스의 Lua 섹션 코드 읽기                                                                                                                                                               |
| `read_lua_batch(indices)`                           | 여러 Lua 섹션을 한 번에 읽기 (최대 20개)                                                                                                                                                       |
| `write_lua(index, content)`                         | 특정 인덱스의 Lua 섹션 전체 교체 (사용자 확인 필요)                                                                                                                                            |
| `replace_in_lua(index, find, replace)`              | 섹션 내 문자열 치환 — 대용량 섹션도 전체를 읽지 않고 서버에서 직접 처리. `regex: true` + `flags` 옵션으로 정규식 지원                                                                          |
| `insert_in_lua(index, content, position?, anchor?)` | 섹션에 코드 삽입. position: `end`(기본), `start`, `after`, `before`. after/before는 `anchor` 문자열 기준                                                                                       |
| `add_lua_section(name, content?)`                   | 새 Lua 섹션을 이름과 함께 추가. 올바른 구분자(`-- ===== name =====`)와 함께 마지막 섹션 뒤에 생성. `insert_in_lua`는 구분자를 이스케이프하므로 새 섹션 추가에는 이 도구 사용. 사용자 확인 필요 |

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

| 도구                                                | 설명                                                                                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_css`                                          | CSS 섹션 목록 (index, 이름, 크기)                                                                                                                                       |
| `read_css(index)`                                   | 특정 인덱스의 CSS 섹션 코드 읽기                                                                                                                                        |
| `read_css_batch(indices)`                           | 여러 CSS 섹션을 한 번에 읽기 (최대 20개)                                                                                                                                |
| `write_css(index, content)`                         | 특정 인덱스의 CSS 섹션 전체 교체 (사용자 확인 필요)                                                                                                                     |
| `replace_in_css(index, find, replace)`              | 섹션 내 문자열 치환 — 대용량 섹션도 전체를 읽지 않고 서버에서 직접 처리. `regex: true` + `flags` 옵션으로 정규식 지원                                                   |
| `insert_in_css(index, content, position?, anchor?)` | 섹션에 코드 삽입. position: `end`(기본), `start`, `after`, `before`. after/before는 `anchor` 문자열 기준                                                                |
| `add_css_section(name, content?)`                   | 새 CSS 섹션을 이름과 함께 추가. 올바른 구분자와 함께 마지막 섹션 뒤에 생성. `insert_in_css`는 구분자를 이스케이프하므로 새 섹션 추가에는 이 도구 사용. 사용자 확인 필요 |

### 로어북 (Lorebook)

| 도구                                                                                     | 설명                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_lorebook(filter?, folder?, content_filter?, content_filter_not?, preview_length?)` | 로어북 항목 목록. `filter`로 comment/key 검색, `content_filter`로 본문 검색, `content_filter_not`으로 본문에 키워드가 **없는** 항목만 필터. `preview_length`로 미리보기 길이 조절 (기본 150, 0=비활성) |
| `read_lorebook(index)`                                                                   | 특정 인덱스의 로어북 항목 전체 데이터 읽기                                                                                                                                                             |
| `read_lorebook_batch(indices, fields?)`                                                  | 여러 로어북 항목을 한 번에 읽기 (최대 50개). `fields: ["content"]`로 필요한 필드만 반환하여 출력 크기 절감. 유효하지 않은 인덱스는 null 반환                                                           |
| `write_lorebook(index, data)`                                                            | 특정 인덱스의 로어북 항목 수정 (부분 수정 가능)                                                                                                                                                        |
| `write_lorebook_batch(entries)`                                                          | 여러 로어북 항목을 한 번에 수정. `entries: [{index, data}]` (최대 50개). 변경 요약 후 단일 확인                                                                                                        |
| `add_lorebook(data)`                                                                     | 새 로어북 항목 추가                                                                                                                                                                                    |
| `add_lorebook_batch(entries)`                                                            | 여러 로어북 항목을 한 번에 추가 (최대 50개). `entries: [{comment, key, content, ...}]`. 단일 확인으로 전부 추가                                                                                        |
| `clone_lorebook(index, overrides?)`                                                      | 기존 로어북 항목 복제. `overrides`로 복제본의 필드 변경 가능                                                                                                                                           |
| `delete_lorebook(index)`                                                                 | 특정 인덱스의 로어북 항목 삭제                                                                                                                                                                         |
| `batch_delete_lorebook(indices)`                                                         | 여러 로어북 항목을 한 번에 삭제 (최대 50개). 인덱스 내림차순 처리로 시프트 문제 방지                                                                                                                   |
| `replace_in_lorebook(index, find, replace, field?)`                                      | 로어북 항목의 문자열 치환 — `field` 옵션으로 content(기본)/comment/key/secondkey 대상 선택. `regex: true` + `flags` 옵션으로 정규식 지원                                                               |
| `replace_block_in_lorebook(index, start_anchor, end_anchor, content?, ...)`              | 로어북 항목에서 두 앵커 사이의 멀티라인 블록 교체. `field` 옵션으로 대상 선택. `include_anchors: false`로 앵커 유지 가능. `dry_run` 지원                                                               |
| `insert_in_lorebook(index, content, position?, anchor?)`                                 | content에 텍스트 삽입. position: `end`(기본), `start`, `after`, `before`. after/before는 `anchor` 문자열 기준                                                                                          |
| `replace_in_lorebook_batch(replacements)`                                                | 여러 항목의 content를 한 번에 치환 (최대 50개). `replacements: [{index, find, replace, regex?, flags?}]`. 매치 요약 → 단일 확인                                                                        |
| `insert_in_lorebook_batch(insertions)`                                                   | 여러 항목의 content에 한 번에 삽입 (최대 50개). `insertions: [{index, content, position?, anchor?}]`. 단일 확인                                                                                        |
| `replace_across_all_lorebook(find, replace, field?, dry_run?)`                           | 모든 로어북 항목에서 특정 문자열을 한 번에 치환. `field`: content(기본)/comment/key/secondkey. `dry_run`으로 미리보기 가능. 단일 확인                                                                  |
| `diff_lorebook(index, refIndex, refEntryIndex)`                                          | 현재 파일↔참고 자료 로어북 항목 비교. 필드별 차이점 + content 라인 단위 변경 사항 반환                                                                                                                 |
| `validate_lorebook_keys()`                                                               | 로어북 키의 일반적 문제 검증: 후행/선행 쉼표, 불필요한 공백, 빈 세그먼트, 중복 키 탐지                                                                                                                 |

### 로어북 파일 시스템 내보내기/가져오기 (Lorebook Export/Import)

| 도구                                                                                | 설명                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `export_lorebook_to_files(target_dir, format?, group_by_folder?, filter?, folder?)` | 로어북 항목을 로컬 파일로 내보내기. `format: "md"`(항목당 1파일, YAML frontmatter) 또는 `"json"`(단일 파일). 폴더 구조를 디렉토리로 매핑. 사용자 확인 필요         |
| `import_lorebook_from_files(source, format?, conflict?, create_folders?, dry_run?)` | 로컬 파일에서 로어북 항목 가져오기. `conflict: "skip"\|"overwrite"\|"rename"`. `dry_run: true`로 미리보기. 디렉토리 구조 → 로어북 폴더 자동 생성. 사용자 확인 필요 |
| `export_field_to_file(field, file_path, format?)`                                   | 임의 필드(description, globalNote 등)를 로컬 파일로 직접 저장. `format: "md"\|"txt"`. 사용자 확인 필요                                                             |

### 정규식 (Regex)

| 도구                                                         | 설명                                                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `list_regex`                                                 | 정규식 스크립트 항목 목록                                                                                                    |
| `read_regex(index)`                                          | 특정 인덱스의 정규식 항목 읽기                                                                                               |
| `write_regex(index, data)`                                   | 특정 인덱스의 정규식 항목 수정                                                                                               |
| `add_regex(data)`                                            | 새 정규식 항목 추가                                                                                                          |
| `replace_in_regex(index, field, find, replace?)`             | 정규식 항목의 find/replace 필드에서 문자열 치환. 대형 필드를 전체 읽지 않고 서버에서 직접 처리. `regex: true` + `flags` 지원 |
| `insert_in_regex(index, field, content, position?, anchor?)` | 정규식 항목의 find/replace 필드에 텍스트 삽입. position: `end`(기본), `start`, `after`, `before`                             |
| `delete_regex(index)`                                        | 특정 인덱스의 정규식 항목 삭제                                                                                               |
| `add_regex_batch(entries)`                                   | 여러 정규식 항목을 한 번에 추가 (최대 50개). `entries: [{comment, type, find, replace, flag}, ...]`. 단일 확인으로 전부 추가 |
| `write_regex_batch(entries)`                                 | 여러 정규식 항목을 한 번에 수정 (최대 50개). `entries: [{index, data}, ...]`. 변경 요약 후 단일 확인                         |

### 인사말 (Greetings)

alternateGreetings(추가 첫 메시지)를 개별 인덱스로 접근.
`read_field("alternateGreetings")` 대신 이 도구를 사용하세요 — 전체 배열 덤프를 방지합니다.

> **참고:** `groupOnlyGreetings`는 RisuAI에서 미사용으로 확인되어 v0.20.0부터 편집 기능이 제거되었습니다. `type: "group"`은 거부됩니다.

| 도구                                             | 설명                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `list_greetings(type, filter?, content_filter?)` | 인사말 목록 (index, 크기, 미리보기 100자). filter/content_filter로 키워드 검색 가능 |
| `read_greeting(type, index)`                     | 특정 인덱스의 인사말 하나 읽기                                                      |
| `write_greeting(type, index, content)`           | 특정 인덱스의 인사말 수정 (사용자 확인 필요)                                        |
| `add_greeting(type, content)`                    | 새 인사말 추가 (사용자 확인 필요)                                                   |
| `delete_greeting(type, index)`                   | 특정 인덱스의 인사말 삭제 (사용자 확인 필요)                                        |
| `batch_delete_greeting(type, indices)`           | 여러 인사말을 한 번에 삭제 (최대 50개). 인덱스 내림차순 처리로 시프트 문제 방지     |
| `batch_write_greeting(type, writes)`             | 여러 인사말을 한 번에 수정. `writes: [{index, content}]` (최대 50개). 단일 확인     |
| `reorder_greetings(type, order)`                 | 인사말 순서 변경. `order: [2,0,1,3]` (현재 배열과 동일 길이의 순열)                 |

`type`: `"alternate"` (추가 첫 메시지 = alternateGreetings)

### 트리거 스크립트 (Trigger Scripts)

triggerScripts 배열의 개별 트리거에 접근.
`read_field("triggerScripts")` 대신 이 도구를 사용하세요 — 전체 JSON 덤프를 방지합니다.

| 도구                        | 설명                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `list_triggers`             | 트리거 목록 (index, comment, type, effect 수, lowLevelAccess)    |
| `read_trigger(index)`       | 특정 인덱스의 트리거 스크립트 읽기                               |
| `write_trigger(index, ...)` | 특정 인덱스의 트리거 수정 (변경할 필드만 전달, 사용자 확인 필요) |
| `add_trigger(...)`          | 새 트리거 추가 (사용자 확인 필요)                                |
| `delete_trigger(index)`     | 특정 인덱스의 트리거 삭제 (사용자 확인 필요)                     |

### 참고 자료 (References, 읽기 전용)

| 도구                                                                                             | 설명                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `list_references`                                                                                | 로드된 참고 자료 파일 목록                                                                                                  |
| `read_reference_field(index, field)`                                                             | 참고 자료의 특정 필드 읽기. ⚠️ lorebook/lua/css는 전체를 반환하므로 아래 세부 도구 사용 권장                                |
| `list_reference_lorebook(index, filter?, content_filter?, content_filter_not?, preview_length?)` | 참고 자료의 로어북 항목 목록. `content_filter`로 본문 검색, `content_filter_not`으로 부정 검색, `preview_length`로 미리보기 |
| `read_reference_lorebook(index, entryIndex)`                                                     | 참고 자료의 로어북 항목 하나 읽기                                                                                           |
| `read_reference_lorebook_batch(index, indices, fields?)`                                         | 참고 자료의 여러 로어북 항목을 한 번에 읽기 (최대 50개). `fields`로 필드 프로젝션                                           |
| `list_reference_lua(index)`                                                                      | 참고 자료의 Lua 섹션 목록 (인덱스, 이름, 크기)                                                                              |
| `read_reference_lua(index, sectionIndex)`                                                        | 참고 자료의 Lua 섹션 하나 읽기                                                                                              |
| `read_reference_lua_batch(index, indices)`                                                       | 참고 자료의 여러 Lua 섹션을 한 번에 읽기 (최대 20개)                                                                        |
| `list_reference_css(index)`                                                                      | 참고 자료의 CSS 섹션 목록 (인덱스, 이름, 크기)                                                                              |
| `read_reference_css(index, sectionIndex)`                                                        | 참고 자료의 CSS 섹션 하나 읽기                                                                                              |
| `read_reference_css_batch(index, indices)`                                                       | 참고 자료의 여러 CSS 섹션을 한 번에 읽기 (최대 20개)                                                                        |
| `list_reference_regex(index)`                                                                    | 참고 자료의 정규식 항목 목록 (인덱스, comment, type, findSize, replaceSize). `read_reference_field("regex")` 대신 사용 권장 |
| `read_reference_regex(index, entryIndex)`                                                        | 참고 자료의 특정 정규식 항목 하나 읽기                                                                                      |

### 스킬 문서 (Skills, 읽기 전용)

CBS 문법, Lua API, 로어북, 정규식, HTML/CSS, 트리거, 캐릭터 작성 등의 상세 가이드.

| 도구                      | 설명                                                         |
| ------------------------- | ------------------------------------------------------------ |
| `list_skills`             | 사용 가능한 스킬 목록 (name, description, files)             |
| `read_skill(name, file?)` | 스킬 문서 읽기 (기본: SKILL.md, 참조 파일도 file 파라미터로) |

상세 문법이 필요할 때 `list_skills` → `read_skill`로 on-demand 로딩하세요.

### charx 에셋 관리 (CharX Assets)

charx 파일의 내장 에셋(이미지 등)을 관리하는 도구. risum 에셋과는 별개.

| 도구                                         | 설명                                                           |
| -------------------------------------------- | -------------------------------------------------------------- |
| `list_charx_assets`                          | .charx 파일의 내장 에셋 목록 (인덱스, 경로, 크기)              |
| `read_charx_asset(index)`                    | 에셋을 base64로 읽기                                           |
| `add_charx_asset(fileName, base64, folder?)` | 에셋 추가. folder: "icon" 또는 "other"(기본). 사용자 확인 필요 |
| `delete_charx_asset(index)`                  | 에셋 삭제. 사용자 확인 필요                                    |
| `rename_charx_asset(index, newName)`         | 에셋 이름 변경. 사용자 확인 필요                               |

### risum 에셋 관리 (Risum Assets)

risum 파일의 내장 에셋(이미지, 오디오 등)을 관리하는 도구.

| 도구                                   | 설명                                                    |
| -------------------------------------- | ------------------------------------------------------- |
| `list_risum_assets`                    | .risum 파일의 내장 에셋 목록 (인덱스, 이름, 경로, 크기) |
| `read_risum_asset(index)`              | 에셋을 base64로 읽기                                    |
| `add_risum_asset(name, base64, path?)` | 에셋 추가. base64 인코딩 데이터 전달. 사용자 확인 필요  |
| `delete_risum_asset(index)`            | 에셋 삭제. 사용자 확인 필요                             |

### 에셋 압축 (Asset Compression)

| 도구                                               | 설명                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `compress_assets_webp(quality?, recompress_webp?)` | 모든 이미지 에셋을 WebP 손실 압축으로 변환. PNG/JPEG/GIF→WebP, SVG 건너뜀, WebP가 원본보다 크면 원본 유지. 사용자 확인 필요 |

**옵션:**

- `quality` (0-100, 기본 80): WebP 압축 품질. 높을수록 화질 좋지만 파일 큼
- `recompress_webp` (기본 false): 이미 WebP인 파일도 재압축할지 여부

**반환값:** 변환 통계 (원본/압축 크기, 변환/건너뜀/실패 수, 절감률) + 항목별 상세

### Danbooru 태그 도구 (이미지 프롬프트용)

캐릭터 이미지 생성 프롬프트를 작성할 때 유효한 Danbooru 태그를 검증·검색·참조하는 도구.
로컬 태그 DB(6,549개) 우선 검증 + Danbooru REST API 온라인 폴백.

| 도구                                            | 설명                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `tag_db_status`                                 | 태그 DB 로딩 상태 진단 (loaded, tagCount, filePath, fileExists)        |
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

### CBS 검증 도구 (CBS Validation)

CBS(Conditional Block Syntax) `{{#when}}` 블록의 구조 검증, 토글 목록 조회, 시뮬레이션, 기준선 비교 도구.

| 도구                                                                    | 설명                                                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `validate_cbs(field?, lorebook_index?, all_combos?)`                    | CBS 블록 열기/닫기 균형 검증. `all_combos=true`로 전체 토글 조합 오류 검사 (최대 1024)                            |
| `list_cbs_toggles(field?, lorebook_index?)`                             | 파일에 사용된 모든 CBS 토글 이름, 조건(`is:0`, `isnot:3` 등), 참조 필드 나열                                      |
| `simulate_cbs(field, lorebook_index?, toggles?, all_combos?, compact?)` | 지정 토글 값으로 CBS 블록 resolve 결과 반환. `toggle_` 접두사 자동 추가. `all_combos`로 전체 조합 출력 (최대 256) |
| `diff_cbs(field, lorebook_index?, toggles)`                             | 기준선(모든 토글=0) 대비 지정 토글 값의 추가/삭제된 줄 비교                                                       |

**사용 흐름:**

1. `validate_cbs` — 먼저 전체 파일의 CBS 구조 오류 확인
2. `list_cbs_toggles` — 사용된 토글 이름과 가능한 값 확인
3. `simulate_cbs` — 특정 토글 조합으로 결과 텍스트 미리보기
4. `diff_cbs` — 토글 변경이 어떤 줄을 추가/제거하는지 확인

**toggle\_ 접두사:** 사용자가 `{"Narration": "0"}` 형태로 전달하면 내부에서 `toggle_Narration`으로 자동 변환.

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

- `key`: 대화에 이 키워드가 등장하면 content가 프롬프트에 삽입됨. 빈 문자열이면 키워드 비활성. 단, `mode: "folder"` 항목에서는 `key`가 폴더 UUID의 canonical source입니다.
- `comment`: 관리용 이름. Lua `getLoreBooks(triggerId, commentFilter)`에서 검색 필터로도 쓰임.
- `alwaysActive`: true면 키워드 매칭 없이 항상 삽입.
- `insertorder`: 높을수록 프롬프트 뒤쪽에 배치.
- `selective` + `secondkey`: 둘 다 설정 시 key와 secondkey가 모두 매칭되어야 활성화.
- `mode`: `normal` | `constant` | `multiple` | `child` | `folder`
- `folder`: 폴더 그룹 참조. 자식 항목에는 항상 `folder:UUID` 형식으로 저장되며, `mode: "folder"`인 항목이 폴더 자체입니다.
- `activationPercent`: 활성화 확률 (0~100). 기본 100.
- `key=""` + `alwaysActive=false` → **0 토큰** (완전히 스킵됨). DB 저장용으로 활용.

**폴더 관리:**

- 폴더 생성: `add_lorebook({ comment: "폴더이름", mode: "folder", key: "UUID", content: "" })` — `key`가 canonical 폴더 UUID입니다.
- 아이템을 폴더로 이동: `write_lorebook(index, { folder: "folder:UUID" })` — UUID는 폴더 항목의 `key` 값이며, 예전 `id` 전용 폴더는 읽기 시 fallback으로만 사용됩니다.
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

- **다음 필드는 `read_field`로 읽지 마세요** — 전체를 한번에 반환하여 컨텍스트를 낭비합니다:
  - `lua` → `list_lua` → `read_lua(index)`
  - `css` → `list_css` → `read_css(index)`
  - `alternateGreetings` → `list_greetings("alternate")` → `read_greeting("alternate", index)`
  - `triggerScripts` → `list_triggers` → `read_trigger(index)`
- 로어북은 `list_lorebook(folder?)` → `read_lorebook(index)` 순서로 개별 읽기
  - 항목이 많으면 `folder` 파라미터로 폴더별 필터링 권장
  - `list_lorebook` 응답의 `folders` 요약으로 폴더 구조 먼저 파악
- 정규식은 `list_regex` → `read_regex(index)` 순서로 개별 읽기
- **참고 자료의 lorebook/lua/css/regex도 동일** — `read_reference_field("lorebook")`은 전체를 한번에 반환합니다. 대신:
  - 로어북: `list_reference_lorebook(index, filter?, folder?)` → `read_reference_lorebook(index, entryIndex)`
  - Lua: `list_reference_lua(index)` → `read_reference_lua(index, sectionIndex)`
  - CSS: `list_reference_css(index)` → `read_reference_css(index, sectionIndex)`
  - 정규식: `list_reference_regex(index)` → `read_reference_regex(index, entryIndex)`

- 여러 필드를 한번에 파악해야 할 때: `read_field_batch(["personality", "scenario", "globalNote"])` (최대 20개)

### 필드 수정 시

1. **소형 필드** (수 KB): `read_field(field)` → `write_field(field, content)` 로 전체 교체
2. **대형 필드** (수십 KB+): 전체를 읽지 않고 아래 도구 사용
   - `search_in_field(field, query)` — 먼저 검색하여 매치 위치와 주변 컨텍스트 확인 (읽기 전용)
   - `read_field_range(field, offset, length)` — 특정 구간만 읽어서 상세 확인 (search_in_field의 position과 연계)
   - `replace_in_field(field, find, replace, dry_run?)` — 문자열 치환 (정규식 지원). `dry_run: true`로 미리보기 가능
   - `replace_in_field_batch(field, replacements, dry_run?)` — 하나의 필드에 여러 치환을 순차 적용 (확인 1회)
   - `replace_block_in_field(field, start_anchor, end_anchor, content?)` — 두 앵커 사이의 멀티라인 블록 교체. 여러 줄에 걸친 텍스트도 안전
   - `insert_in_field(field, content, position, anchor?)` — 텍스트 삽입 (end/start/after/before)
   - `export_field_to_file(field, file_path)` — 로컬 파일로 내보낸 뒤 일반 파일 도구(view, edit, grep)로 작업
3. **대형 필드 안전망**: `snapshot_field(field)` → 편집 → 실수 시 `restore_snapshot(field, id)`로 롤백
4. **필드 통계**: `get_field_stats(field)` — 문자/행/단어/태그 수 등 요약 정보
5. **전체 스캔**: `search_all_fields(query)` — 모든 텍스트 필드 + 인사말 + 로어북에서 한 번에 검색 (잔류 태그 확인 등)
6. 문자열 타입 필드만 지원 (배열/boolean/number/triggerScripts는 `write_field` 사용)

### Lua 코드 수정 시

1. `list_lua`로 섹션 목록 확인 (index, 이름, 크기)
2. **소형 섹션** (수 KB): `read_lua(index)` → `write_lua(index, content)` 로 전체 교체
3. **대형 섹션** (수십 KB+): 전체를 읽지 않고 아래 도구 사용
   - `replace_in_lua(index, find, replace)` — 문자열 치환 (정규식 지원)
   - `insert_in_lua(index, content, position, anchor?)` — 코드 삽입 (end/start/after/before)
4. **새 섹션 추가**: `add_lua_section(name, content?)` — `insert_in_lua`는 구분자를 이스케이프하므로 새 섹션 추가에는 반드시 이 도구 사용

### CSS 코드 수정 시

1. `list_css`로 섹션 목록 확인 (index, 이름, 크기)
2. **소형 섹션** (수 KB): `read_css(index)` → `write_css(index, content)` 로 전체 교체
3. **대형 섹션** (수십 KB+): 전체를 읽지 않고 아래 도구 사용
   - `replace_in_css(index, find, replace)` — 문자열 치환 (정규식 지원)
   - `insert_in_css(index, content, position, anchor?)` — 코드 삽입 (end/start/after/before)
4. **새 섹션 추가**: `add_css_section(name, content?)` — `insert_in_css`는 구분자를 이스케이프하므로 새 섹션 추가에는 반드시 이 도구 사용

### 로어북 검색/수정 시

1. `list_lorebook`으로 폴더 구조 먼저 파악 (응답의 `folders` 배열 확인)
2. 항목이 많으면 `folder` 파라미터로 폴더별 필터링, `filter`로 키워드 검색, `content_filter`로 본문 검색
3. 여러 항목을 읽어야 하면 `read_lorebook_batch(indices)` 사용 (최대 50개)
4. **소형 항목**: `read_lorebook(index)` → `write_lorebook(index, data)` (변경할 필드만 전달)
5. **대형 항목** (수십 KB+): 전체를 읽지 않고 아래 도구 사용
   - `replace_in_lorebook(index, find, replace, field?)` — 문자열 치환. `field`로 content(기본)/comment/key/secondkey 대상 선택. 정규식 지원
   - `insert_in_lorebook(index, content, position, anchor?)` — 텍스트 삽입 (end/start/after/before)
6. **대량 수정**: `write_lorebook_batch(entries)` — 한 번의 확인으로 최대 50개 항목 수정
7. **전체 일괄 치환**: `replace_across_all_lorebook(find, replace, field?, dry_run?)` — 모든 로어북 항목에서 한 번에 치환 (리네이밍 작업에 유용)
8. **키 품질 점검**: `validate_lorebook_keys()` — 후행 쉼표, 공백, 중복 키 자동 탐지
9. **항목 복제**: `clone_lorebook(index, overrides?)` — 기존 항목 복제 후 필드 오버라이드
10. comment 네이밍이 Lua 검색에 영향을 주므로 **기존 패턴과 일치**시킬 것

### 정규식 수정 시

1. `list_regex`로 항목 목록 확인 (index, comment, type, findSize, replaceSize)
2. **소형 항목**: `read_regex(index)` → `write_regex(index, data)` (변경할 필드만 전달)
3. **대형 항목** (find/replace에 긴 HTML이 포함된 경우): 전체를 읽지 않고 아래 도구 사용
   - `replace_in_regex(index, field, find, replace)` — find 또는 replace 필드 내 문자열 치환 (정규식 지원)
   - `insert_in_regex(index, field, content, position, anchor?)` — find 또는 replace 필드에 텍스트 삽입 (end/start/after/before)
4. `field` 파라미터: `"find"` = IN 패턴, `"replace"` = OUT 치환 텍스트

### 참고 자료 로어북 비교 시

1. `diff_lorebook(index, refIndex, refEntryIndex)` — 현재↔참고 항목의 구조화된 diff 생성 (가장 효율적)
2. 또는 수동 비교:
   - `list_reference_lorebook(refIndex, filter?, folder?)` → 참고 파일 로어북 목록 확인
   - `read_reference_lorebook(refIndex, entryIndex)` → 개별 항목 읽기
   - `read_lorebook(entryIndex)` → 현재 파일 개별 항목 읽기
   - 필요한 항목만 개별적으로 읽어서 비교 — 전체 덤프 금지

---

### 도구 선택 가이드 (의사결정 트리)

**필드 내용을 확인하고 싶을 때:**

```
소형 필드 (수 KB 이하)  → read_field
대형 필드 (수십 KB+)    → 특정 텍스트 찾기: search_in_field
                        → 특정 위치 확인:  read_field_range
                        → 전체를 파일로:   export_field_to_file → view/grep
```

**필드 내용을 수정하고 싶을 때:**

```
소형 필드              → read_field → write_field (전체 교체)
대형 필드 단일 치환    → search_in_field로 위치 파악 → replace_in_field (dry_run으로 미리보기 가능)
대형 필드 다중 치환    → replace_in_field_batch (순차 적용, 확인 1회)
대형 필드 블록 교체    → replace_block_in_field (두 앵커 사이 멀티라인 블록 교체)
```

**전체 검색/일괄 치환이 필요할 때:**

```
모든 필드에서 검색      → search_all_fields (한 번에 전체 텍스트 필드 + 인사말 + 로어북 스캔)
모든 로어북 일괄 치환   → replace_across_all_lorebook (dry_run으로 미리보기 가능)
```

**안전망/통계:**

```
편집 전 백업           → snapshot_field (필드당 최대 10개 보관)
실수 시 롤백           → list_snapshots → restore_snapshot
필드 요약 정보         → get_field_stats (문자/행/단어/태그 수)
```

**⚠️ 절대 하지 말 것:**

- `replace_in_field`로 검색하려 하지 마세요 — `replace` 생략 시 기본값이 빈 문자열(=삭제)입니다. 반드시 `search_in_field`를 사용하세요.
- `read_field("lua")`, `read_field("css")`, `read_field("alternateGreetings")` 등 전용 도구가 있는 필드를 `read_field`로 읽지 마세요.

**여러 항목을 수정할 때:**

```
로어북 여러 항목 수정   → write_lorebook_batch (단일 확인으로 최대 50개)
로어북 여러 항목 삭제   → batch_delete_lorebook
로어북 전체 일괄 치환   → replace_across_all_lorebook
필드 여러 개 쓰기       → write_field_batch (한 번의 확인으로 최대 20개 필드)
필드 다중 치환          → replace_in_field_batch (하나의 필드에 여러 치환 순차 적용)
인사말 여러 개 수정     → batch_write_greeting
필드 여러 개 읽기       → read_field_batch (최대 20개)
```

→ 단일 도구를 반복 호출하면 매번 사용자 확인이 필요합니다. **항상 batch 도구를 우선 사용하세요.**

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
- `.claude/skills`, `.gemini/skills`, `.github/skills` — 루트 `skills/`를 가리키는 로컬 CLI 검색 경로. 직접 편집하지 말고 루트 `skills/`만 수정. `npm run sync:skills`는 Windows에서 실제 symlink를 우선 만들고, 불가능할 때만 junction으로 폴백

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

#### 검증 및 릴리스 워크플로

- PR / push 검증은 **Ubuntu validate + Windows build** 2단계로 유지합니다.
  - Ubuntu: `npm run lint`, `npm run typecheck`, `npm test`
  - Windows: `npm run build:electron`, `npm run build:renderer`
- PR 단계에서는 패키징(`electron-builder`)까지 돌리지 않고, 태그 릴리스 workflow에서만 실행합니다.
- 의존성 업데이트는 `Dependabot`으로 npm / GitHub Actions를 주간 점검합니다.
