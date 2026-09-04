# RisuToki 프로젝트 가이드

RisuToki가 프로젝트 고유 안내가 없을 때 사용하는 기본 가이드예요. 프로젝트의 `AGENTS.md` 또는 `CLAUDE.md`가 우선해요.

## 작업별 지식

| 작업                                | 스킬                              |
| ----------------------------------- | --------------------------------- |
| 캐릭터·세계·시나리오·봇 구성과 검토 | `authoring-bots`                  |
| 봇별 번역·호칭·말투 대응            | `writing-translation-guides`      |
| Phēmē 설계와 변형본 동기화          | `prompt-family`                   |
| 프리셋 구조                         | `writing-risup-presets`           |
| CBS                                 | `writing-cbs-syntax`              |
| 로어북 항목                         | `writing-lorebooks`               |
| 정규식                              | `writing-regex-scripts`           |
| Lua                                 | `writing-lua-scripts`             |
| 구조화 트리거                       | `writing-trigger-scripts`         |
| RisuAI HTML/CSS                     | `writing-html-css`                |
| 외부 WYSIWYG HTML                   | `writing-restricted-wysiwyg-html` |
| 이미지 프롬프트와 태그              | `writing-standing-image-prompts`  |
| 파일 구조                           | `file-structure-reference`        |
| 모듈                                | `writing-risum-modules`           |
| 플러그인 v3                         | `writing-plugins-v3`              |
| MCP 도구·편집 계약                  | `using-mcp-tools`                 |

클라이언트 카탈로그에서 해당 스킬을 읽거나, MCP의 `list_skills`와 `read_skill`을 사용해요. 스킬 밖의 참조는 `inspect_document`에 `{ "kind": "guidance", "guide": "prompts/families/PHEME.md" }`를 지정해 읽어요. 모든 스킬을 미리 읽을 필요는 없어요.

## 편집 계약

현재 `tools/list`와 응답 메타데이터가 사용 가능한 도구·입력의 기준이에요. 기본 facade는 `inspect_document`, `read_content`, `preview_edit`, `apply_edit`, `validate_content` 등을 제공해요. 세부 도구 선택과 실패 복구는 `using-mcp-tools`에 모여 있어요.

변경은 preview 후 apply해요. 에디터 확인 창 또는 standalone write gate이 승인 경계이므로 요청과 일치하는 preview는 채팅에서 재승인받지 않아요. 토큰은 1회용이며, 결과가 불명확한 변경은 상태를 확인한 뒤 새 preview를 만들어요.

## 프로젝트별 참고사항

<!-- 프로젝트별 규칙 -->
