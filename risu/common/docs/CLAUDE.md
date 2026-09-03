# RisuToki 프로젝트 가이드

> RisuToki AI 터미널이 Codex, Copilot, Antigravity 세션의 기본 프로젝트 가이드로 `AGENTS.md`에 붙이는 문서입니다. 프로젝트 폴더에 자체 `AGENTS.md`나 `CLAUDE.md`가 있으면 그것이 우선합니다. Claude Code를 쓰는 프로젝트라면 이 파일을 프로젝트 루트에 `CLAUDE.md`로 복사하세요. 프로젝트 고유 규칙은 맨 아래 "프로젝트별 참고사항"에 적습니다.

## 1. 작업 원칙

- 등록된 도구와 입력 형식은 `tools/list`가 진실입니다. 기본 프로필은 facade 도구 11개와 `list_skills`, `read_skill`입니다. `list_lua`, `read_field`처럼 세부 도구는 `advanced-full` 프로필에서만 보이는 폴백이고, 프로필을 바꾸려면 MCP 서버를 재시작해야 합니다.
- 읽기는 좁게 합니다. `inspect_document`로 구조를 보고, `read_content`를 family, field, id, range, query로 좁혀 읽습니다. Lua, CSS, 로어북, 정규식, 트리거, 프리셋 프롬프트는 전용 family로 읽고 필드를 통째로 읽지 않습니다. 응답의 `artifacts.byte_size`와 잘림 표시를 다음 읽기의 기준으로 삼습니다.
- 변경은 `preview_edit`, `apply_edit`, 그리고 재읽기 또는 `validate_content` 순서입니다. apply 단계의 승인 게이트는 에디터의 확인 창이나 standalone write gate이므로, 요청과 일치하는 preview는 채팅에서 다시 묻지 않고 적용합니다. 요청이 정하지 않은 선택이 preview에서 드러날 때만 묻습니다.
- preview 토큰은 1회용입니다. 중단, 타임아웃, 부분 실패 뒤에는 현재 상태를 다시 읽고 새 preview를 만듭니다. 결과를 모르는 변경을 자동으로 재시도하지 않습니다.
- 통째 다시 쓰기보다 replace, insert, range 연산을 우선합니다. 형제 항목은 배치로 처리하고, 인덱스만 있는 항목은 목록 응답의 type, preview, hash 가드를 함께 보냅니다.
- `manage_items`는 항목 추가, 재정렬, 가져오기와 스니펫, `manage_assets`는 에셋, `manage_file`은 열기, 저장, 추출, 재조립입니다. 응답의 `next_actions`를 따릅니다.

## 2. 스킬과 가이드 읽기

작업 유형에 맞는 스킬 하나를 먼저 읽습니다. `list_skills`로 찾고 `read_skill`로 열며, 카탈로그를 미리 전부 읽지 않습니다. 스킬의 `references/` 파일은 `read_skill(name, "references/파일.md")`로 읽습니다.

| 작업                                                 | 먼저 읽을 스킬                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 캐릭터, 세계, 시나리오, 로어북 봇 구성 (`.charx`)    | `authoring-characters`, `authoring-worlds`, `authoring-scenarios`, `authoring-lorebook-bots`                                             |
| 기존 봇의 비평·리뷰                                  | `critiquing-bots`                                                                                                                        |
| CBS, 로어북 항목, 정규식, Lua, 트리거, HTML/CSS 문법 | `writing-cbs-syntax`, `writing-lorebooks`, `writing-regex-scripts`, `writing-lua-scripts`, `writing-trigger-scripts`, `writing-html-css` |
| 프리셋 (`.risup`)                                    | `writing-risup-presets`; 프롬프트 패밀리 작업은 `prompt-family-development`, `prompt-family-maintenance`                                 |
| 모듈 (`.risum`)                                      | `writing-risum-modules`                                                                                                                  |
| 플러그인 v3                                          | `writing-plugins-v3`                                                                                                                     |
| 파일 구조와 필드 이름                                | `file-structure-reference`                                                                                                               |
| MCP 도구 선택과 순서                                 | `using-mcp-tools`                                                                                                                        |

스킬이 가리키는 문법 가이드, 필드 인벤토리, 프롬프트 패밀리 프로필은 `inspect_document`의 `{ "kind": "guidance", "guide": "<이름>" }`으로 읽습니다. 이름은 `common/문법가이드_로어북.md` 같은 카탈로그 이름, 저장소 경로, 또는 고유한 파일명입니다. `{ "kind": "guidance" }`는 스킬 목록과 가이드 이름 목록을 함께 돌려줍니다. 열려 있는 문서의 정확한 필드 목록은 문서보다 `inspect_document`가 정확합니다.

## 3. 자주 걸리는 점

- 로어북 `comment`는 Lua `getLoreBooks` 검색 키로 쓰일 수 있으니 이름을 바꾸기 전에 스크립트를 확인합니다. 폴더 식별자는 폴더 항목의 `key`(`folder:<uuid>`)이고, 자식 항목의 `folder` 값이 그 키를 가리킵니다.
- 정규식 항목의 저장 필드는 `in`과 `out`이며 `find`와 `replace`는 편의 별칭입니다. 요청 단계 타입의 정식 값은 `editprocess`이고 `editrequest`는 입력 별칭입니다.
- Lua와 CSS는 섹션 구분자(`-- ===== 이름 =====`, `/* ===== 이름 ===== */`)로 나뉘어 섹션 단위로 읽고 씁니다. 구분자를 쓰기 시작했다면 첫 줄부터 구분자로 시작해야 합니다. 첫 구분자 앞의 코드는 어느 섹션에도 속하지 않습니다.
- 참고 자료(reference)로 연 파일은 읽기 전용입니다.
- 보호 필드와 폐기 필드는 숨겨지고 저장 시 제거됩니다. 우회하지 않습니다.

## 4. 프로젝트별 참고사항

> 프로젝트 제작자가 작성하는 영역입니다. 절대 규칙, 네이밍, 빌드 절차, 캐릭터 고유 제약을 여기에 적으세요.

<!-- 프로젝트별 규칙 -->
