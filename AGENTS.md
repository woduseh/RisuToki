# Risutoki — Agent Startup Guide

> AI 코딩 어시스턴트가 세션 시작 시 읽는 라우팅 가이드입니다.
> RisuToki는 RisuAI `.charx` / `.risum` / `.risup` 파일 전용 MCP 에디터입니다.

---

## 세션 시작 시 읽을 것

| 순서 | 무엇을                                 | 어떻게                                                                                                                                                           |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **온보딩·프로젝트 규칙·MCP 워크플로**  | `read_skill("project-workflow")` → 상세가 필요하면 `read_skill("project-workflow", "MCP_WORKFLOW.md")` 또는 `read_skill("project-workflow", "PROJECT_RULES.md")` |
| 2    | **MCP 도구 선택·대형 필드·batch 상세** | `read_skill("using-mcp-tools")`                                                                                                                                  |
| 3    | CBS/Lua/로어북 등 세부 문법            | `list_skills` → `read_skill(name)`                                                                                                                               |

### 레포 내 추가 참조 (repo-local — 세션 외부에서는 없을 수 있음)

| 문서                                                             | 내용                                             |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| [`docs/analysis/ARCHITECTURE.md`](docs/analysis/ARCHITECTURE.md) | 런타임 아키텍처·프로세스 경계·핫스팟 (canonical) |
| [`docs/MCP_WORKFLOW.md`](docs/MCP_WORKFLOW.md)                   | MCP 도구 선택·읽기 규칙 원본                     |
| [`docs/MCP_TOOL_SURFACE.md`](docs/MCP_TOOL_SURFACE.md)           | 도구 패밀리·경계·behavior hints                  |
| [`docs/MCP_ERROR_CONTRACT.md`](docs/MCP_ERROR_CONTRACT.md)       | 에러/no-op/성공 응답 계약                        |
| [`docs/PROJECT_RULES.md`](docs/PROJECT_RULES.md)                 | 버전·CI·페르소나 규칙                            |
| [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md)                       | TypeScript 소스 탐색                             |
| [`docs/README.md`](docs/README.md)                               | 전체 지식 베이스 인덱스                          |

---

## 반드시 지킬 규칙

1. **세션 시작 시** `read_skill("project-workflow")`를 먼저 읽으세요. MCP 규칙과 프로젝트 규칙의 요약이 들어 있으며, 상세가 필요하면 그 안의 `MCP_WORKFLOW.md`와 `PROJECT_RULES.md`를 로드하세요.
2. **대형 surface를 `read_field`로 통째로 읽지 마세요.** `lua`, `css`, `alternateGreetings`, `triggerScripts`, `promptTemplate`/`formatingOrder`는 전용 list→read 도구를 사용합니다.
3. **batch 도구 우선.** 여러 항목을 수정할 때 단일 write를 반복하지 말고 batch 도구를 사용하세요.
4. **열리지 않은 파일은 `probe_*`로 먼저 읽으세요.** 수정이 필요할 때만 `open_file`로 전환합니다.
5. **위험한 MCP 쓰기 전 또는 중단 뒤 재개 시** `session_status`로 현재 문서, dirty/autosave, recovery, snapshot 상태를 먼저 확인하세요. 이 도구는 파일이 열려 있지 않아도 호출할 수 있습니다.
6. **MCP 도구·필드 변경 시** `AGENTS.md`, `docs/`, `skills/`를 함께 갱신하세요.
7. **매 작업마다** `package.json` 버전 범프 + `CHANGELOG.md` 업데이트를 합니다.
8. **구문이 애매하면 먼저 스킬 문서를 읽으세요.** MCP 도구 선택 상세는 `read_skill("using-mcp-tools")`를 참조합니다.

---

## 스킬 문서 빠른 참조

| 스킬                       | 용도                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `project-workflow`         | 프로젝트 규칙, MCP 워크플로, 온보딩 가이드 (`MCP_WORKFLOW.md` + `PROJECT_RULES.md` 포함) |
| `using-mcp-tools`          | 도구 선택, 대형 필드 편집, batch-first 원칙                                              |
| `file-structure-reference` | `.charx` / `.risum` / `.risup` / lorebook / regex 구조                                   |
| `writing-cbs-syntax`       | CBS 템플릿 태그 문법                                                                     |
| `writing-lua-scripts`      | Lua 5.4 트리거 스크립트                                                                  |
| `writing-lorebooks`        | 로어북 키워드, 데코레이터, 폴더                                                          |
| `writing-regex-scripts`    | 정규식 수정 스크립트                                                                     |
| `writing-html-css`         | backgroundEmbedding, x-risu- CSS                                                         |
| `writing-trigger-scripts`  | V2 트리거 스크립트                                                                       |
| `writing-danbooru-tags`    | Danbooru 태그 검색/검증                                                                  |

`list_skills`로 전체 목록과 메타데이터를 확인하고, `read_skill(name, file?)`로 필요한 파일만 로드하세요.
