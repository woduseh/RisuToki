# Project Rules

프로젝트 전반에 걸쳐 지켜야 하는 규칙과 워크플로를 정리합니다.

> Canonical source: `docs/PROJECT_RULES.md`

---

## 1. 문서 및 버전 관리 (필수)

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
   - MCP 도구·필드·워크플로우가 변하면 `AGENTS.md`, `docs/`, `skills/README.md`, 관련 `skills/*`를 함께 갱신

이 규칙은 별도 지시가 없어도 **매 작업마다** 자동 적용합니다.

---

## 2. 검증 및 릴리스 워크플로

- PR / push 검증은 **Ubuntu validate + Windows build** 2단계로 유지합니다.
  - Ubuntu: `npm run lint`, `npm run typecheck`, `npm test`
  - Windows: `npm run build:electron`, `npm run build:renderer`
- MCP contract / taxonomy / section workflow를 수정할 때는 전체 검증 전에 `npm run test:evals`로 deterministic harness 시나리오를 먼저 돌리세요.
- PR 단계에서는 패키징(`electron-builder`)까지 돌리지 않고, 태그 릴리스 workflow에서만 실행합니다.
- 의존성 업데이트는 `Dependabot`으로 npm / GitHub Actions를 주간 점검합니다.

---

## 3. 가이드 파일 위치

| 경로                                                 | 설명                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `docs/README.md`                                     | 코드 작업용 지식 베이스 인덱스                                         |
| `docs/MODULE_MAP.md`                                 | TypeScript 소스 탐색용 모듈 맵                                         |
| `docs/MCP_WORKFLOW.md`                               | MCP 도구 선택, 읽기 규칙, 워크플로 패턴                                |
| `docs/MCP_TOOL_SURFACE.md`                           | MCP 도구 패밀리, 경계, behavior hints, deterministic `next_actions` 맵 |
| `docs/MCP_ERROR_CONTRACT.md`                         | MCP 성공/에러/no-op 응답 계약과 recovery playbook                      |
| `skills/`                                            | 번들 프로젝트 스킬 문서. 로컬 스킬 문서도 이 위치에 추가 가능          |
| `guides/`                                            | 한국어 원본 가이드 (앱 내 가이드 뷰어로 접근)                          |
| `.claude/skills`, `.gemini/skills`, `.github/skills` | 루트 `skills/`를 가리키는 로컬 CLI 검색 경로                           |

> `npm run sync:skills`는 Windows에서 실제 symlink를 우선 만들고, 불가능할 때만 junction으로 폴백하며, 루트 `skills/`가 없으면 조용히 건너뜁니다.

---

## 4. Copilot 플루니 페르소나 워크플로

- `rpMode === "pluni"`는 **GitHub Copilot CLI 전용** 고급 페르소나 모드입니다.
- Copilot을 플루니 모드로 시작하면 선택한 카테고리(`solo`, `world-sim`, `multi-char`)에 맞춰 세션 `AGENTS.md`와 임시 `.github/agents/pluni.agent.md`, `kotone.agent.md`, `sophia.agent.md`를 생성합니다.
- 에이전트 파일은 `.agent.md` 확장자와 YAML frontmatter(`---\nname: ...\n---`)를 사용합니다.
- 부트스트랩 경로는 **내장 터미널의 현재 작업 디렉터리(cwd)** 기준으로 결정됩니다. 터미널에서 `cd`로 이동한 뒤 시작하면 그 경로가 프로젝트 루트로 사용됩니다.
- 플루니 모드가 활성화된 상태에서는 메뉴 액션뿐 아니라 **터미널에 직접 `copilot`을 입력해도** 동일한 부트스트랩이 적용됩니다.
- Copilot이 아닌 CLI에서는 같은 3인 자문 구조를 단일 세션 프롬프트로 합성해 전달합니다.
- 이 `.github/agents/*.agent.md` 파일과 세션 `AGENTS.md`는 **런타임 산출물**이므로 소스 파일처럼 취급하거나 커밋하지 않습니다.
