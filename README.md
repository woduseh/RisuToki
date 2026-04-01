# RisuToki

> RisuAI .charx / .risum / .risup 파일 전용 에디터 + AI CLI 통합 터미널

[![Version](https://img.shields.io/badge/version-0.36.0-blue.svg)](https://github.com/woduseh/RisuToki/releases)
[![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-40-47848F.svg)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933.svg)](https://nodejs.org/)

## RisuToki란?

RisuToki는 [RisuAI](https://risuai.net/) 캐릭터 카드(`.charx`), 모듈(`.risum`), 프리셋(`.risup`) 파일을 편집하기 위한 **데스크톱 전용 에디터**입니다. VS Code 수준의 Monaco 에디터와 내장 터미널을 통해 AI CLI(Claude Code, GitHub Copilot CLI, Codex, Gemini CLI)를 직접 연동할 수 있으며, MCP(Model Context Protocol)로 파일 구조를 AI에 자동 전달합니다.

### 주요 기능

| 기능                  | 설명                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📝 **Monaco 에디터**  | VS Code 동일 편집 엔진 — 구문 강조, 자동완성, 찾기/바꾸기                                                                                                   |
| 🤖 **AI CLI 연동**    | Claude Code · GitHub Copilot CLI · Codex · Gemini CLI 터미널 내 실행 + MCP 자동 연결 + Copilot custom-agent 부트스트랩                                      |
| 📦 **3종 파일 지원**  | `.charx` (캐릭터 카드) · `.risum` (모듈) · `.risup` (프리셋) 열기/편집/저장                                                                                 |
| 🔧 **MCP 도구 114종** | 필드·로어북·정규식·Lua/CSS 섹션·인사말·트리거·risup promptTemplate/formatingOrder·에셋·CBS 검증·참고자료·Danbooru 태그·스킬 문서 읽기/쓰기 + 일괄 검색/치환 + structured 4xx 에러 엔벨로프 |
| 🎭 **프리뷰 모드**    | CBS/Lua 렌더링 + 로어북 데코레이터 매칭/디버그 + 인라인 로딩/에러 진단 포함 `.charx` 전용 채팅 시뮬레이션 (F5)                                              |
| 📚 **참고 자료**      | 다른 .charx/.risum 파일을 읽기 전용으로 로드 + 세부 항목 개별 조회                                                                                          |
| 🐰 **RP 모드**        | 토키/아리스/커스텀 페르소나 + Copilot용 `플루니 연구소` 자문 패널                                                                                           |
| 🔀 **사이드바 DnD**   | 로어북·정규식·Lua/CSS 섹션·인사말·에셋 드래그 앤 드롭으로 순서 변경                                                                                         |
| 🖼 **슬롯 레이아웃**  | 패널 드래그 앤 드롭으로 자유 배치 + 팝아웃(외부 창 분리)                                                                                                    |
| 💾 **자동 저장/백업** | 설정 가능한 간격의 자동 저장 + 파일 타입별 `.charx` / `.risum` / `.risup` autosave + `.toki-recovery.json` provenance sidecar + 항목별 최대 20개 버전 백업  |
| 🔄 **세션 복구**      | 비정상 종료 뒤 자동 저장 복원 제안 (`자동 저장 복원` / `원본 열기` / `무시`) + `[자동복원]` 배지와 provenance 상태 표시                                     |
| 🎵 **MomoTalk UI**    | 모모톡 테마 팝업, NSIS 인스톨러, 아바타 GIF 시스템                                                                                                          |

---

## 설치

### 다운로드 (일반 사용자)

[Releases](https://github.com/woduseh/RisuToki/releases) 페이지에서 최신 버전을 다운로드하세요.

- **RisuToki Setup x.x.x.exe** — 설치형
- **RisuToki-x.x.x-portable.exe** — 포터블 (설치 불필요)

### 소스에서 실행 (개발자)

```bash
git clone https://github.com/woduseh/RisuToki.git
cd RisuToki
npm install
npm run dev
```

### 개발 스크립트

```bash
npm run dev          # Vite + Electron 개발 모드
npm run lint         # ESLint
npm run typecheck    # Vue + TypeScript 타입 검사
npm test             # Node 회귀 테스트 + Vitest
npm run build        # lint + typecheck + test + Electron + Vite build
npm run dist:all     # Windows NSIS + 포터블 빌드
```

### 개발 문서

- `docs/analysis/ARCHITECTURE.md` — 런타임 구조와 데이터 흐름
- `CONTRIBUTING.md` — 변경 원칙과 검증 절차
- `CHANGELOG.md` — 버전별 변경 이력
- GitHub Actions `CI` — push/PR 시 Ubuntu lint · typecheck · test + Windows Electron/Renderer build 자동 검증
- GitHub Actions `Release` — `v*` 태그 push 시 Windows 빌드 자동 릴리즈

---

# 사용 가이드

## 목차

1. [시작하기](#1-시작하기)
2. [화면 구성](#2-화면-구성)
3. [파일 열기 / 저장](#3-파일-열기--저장)
4. [사이드바 (항목 트리)](#4-사이드바-항목-트리)
5. [에디터 (Monaco)](#5-에디터-monaco)
6. [TokiTalk 터미널](#6-tokitalk-터미널)
7. [AI CLI 연동 + MCP](#7-ai-cli-연동--mcp)
8. [프리뷰 모드 / RP 모드](#8-프리뷰-모드--rp-모드)
9. [설정](#9-설정)
10. [단축키 목록](#10-단축키-목록)

---

## 1. 시작하기

RisuToki 실행 파일(.exe)을 더블클릭하면 됩니다.

### 사전 요구사항

- AI CLI 연동을 사용하려면 원하는 CLI가 시스템 PATH에 등록되어 있어야 합니다.
  - **Claude Code**: `claude` · **GitHub Copilot CLI**: `copilot` · **Codex**: `codex` · **Gemini CLI**: `gemini`
- CLI가 설치되어 있지 않아도 에디터 자체 기능은 정상 작동합니다.

---

## 2. 화면 구성

<img width="1913" height="1004" alt="화면 구성" src="https://github.com/user-attachments/assets/6398e854-f7a8-49bb-a8e2-c73861446b97" />

| 영역                | 설명                                                    |
| ------------------- | ------------------------------------------------------- |
| **사이드바**        | 파일 항목 트리 + 참고자료 탭                            |
| **에디터**          | Monaco 기반 코드/텍스트 에디터                          |
| **TokiTalk 터미널** | 내장 터미널 (셸 + AI CLI 실행)                          |
| **아바타 패널**     | 토키/아리스 캐릭터 (대기: 아이콘 / 작업 중: 춤추는 GIF) |

- **보기** 메뉴에서 사이드바/터미널 위치 변경 가능
- 각 패널 경계선 드래그로 크기 조절
- 사이드바 접기: `Ctrl+B` / 터미널 접기: `` Ctrl+` ``

---

## 3. 파일 열기 / 저장

<img width="240" height="258" alt="파일 메뉴" src="https://github.com/user-attachments/assets/d7dca751-3044-44dc-b93b-d99dc02226c2" />

| 동작               | 방법                                                           |
| ------------------ | -------------------------------------------------------------- |
| **새로 만들기**    | `Ctrl+N` 또는 파일 → 새로 만들기                               |
| **열기**           | `Ctrl+O` 또는 파일 → 열기 (.charx / .risum / .risup 파일 선택) |
| **저장**           | `Ctrl+S` 또는 파일 → 저장                                      |
| **다른 이름 저장** | `Ctrl+Shift+S` 또는 파일 → 다른 이름 저장                      |

- 수정된 탭은 이름 옆에 **●** 표시 · 창 닫기 시 모모톡 스타일 저장 확인 팝업
- `새로 만들기` / `열기`도 현재 문서에 저장되지 않은 변경이 있으면 먼저 저장 여부를 확인합니다.
- **자동 저장**: 설정에서 간격(1~30분) 지정 가능. 현재 문서 타입에 맞는 autosave와 `.toki-recovery.json` provenance sidecar를 함께 기록합니다.
- 비정상 종료 뒤 다시 시작하면 복원 가능한 autosave가 있는 문서에 대해 **자동 저장 복원 / 원본 열기 / 무시** 중 하나를 고를 수 있습니다.
- 자동 저장에서 복원한 문서는 파일 라벨에 `[자동복원]`이 붙고 상태바에 provenance가 표시되며, 저장 / 열기 / 새 파일 성공 시 자동으로 해제됩니다.

### 드래그 앤 드롭

| 파일 유형                 | 동작                                      |
| ------------------------- | ----------------------------------------- |
| **.charx / .risum**       | 참고 자료로 추가 (읽기 전용)              |
| **.json**                 | 로어북 또는 정규식으로 자동 판별하여 추가 |
| **.png / .jpg / .gif 등** | 에셋(이미지)으로 추가                     |

---

## 4. 사이드바 (항목 트리)

사이드바는 **항목** / **참고자료** 두 탭으로 나뉩니다.

### 항목 탭

파일 타입에 따라 아래 항목들이 표시됩니다:

<img width="269" height="365" alt="사이드바" src="https://github.com/user-attachments/assets/80fc85c8-1b06-4094-a752-9ef99e765a10" />
<img width="262" height="357" alt="로어북" src="https://github.com/user-attachments/assets/baa21125-ee5e-477b-855e-c79bbd2e122b" />

#### 기본 항목

| 항목                 | 설명                                                                                  | 파일 타입           |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| **Lua**              | Lua 트리거 스크립트 (섹션 분할 편집)                                                  | charx, risum        |
| **트리거 스크립트**  | 트리거 스크립트 (개별 트리거 편집)                                                    | charx, risum        |
| **글로벌노트**       | 시스템 프롬프트 뒤에 삽입되는 인스트럭션                                              | charx               |
| **첫 메시지**        | 대화 시작 시 표시되는 첫 번째 메시지                                                  | charx               |
| **추가 첫 메시지**   | 대체 첫 메시지 (개별 탭으로 편집)                                                     | charx               |
| **그룹 첫 메시지**   | 그룹 전용 인사말 (개별 탭으로 편집)                                                   | charx               |
| **CSS**              | RisuAI 채팅 UI 커스텀 스타일 (섹션 분할)                                              | charx               |
| **설명**             | 캐릭터/모듈/프리셋 설명                                                               | charx, risum, risup |
| **프리셋: 기본**     | 프리셋 이름 등 기본 메타 편집                                                         | risup               |
| **프리셋: 프롬프트** | 구조화 `promptTemplate` / `formatingOrder`, `customPromptTemplateToggle`, 템플릿 변수 | risup               |
| **프리셋: 모델/API** | 모델명, 서브모델, API 타입, 전처리 옵션                                               | risup               |
| **프리셋: 파라미터** | 기본 파라미터 / 샘플링 / 추론 옵션                                                    | risup               |

- `.risup` 파일은 Lua / CSS / 로어북 / 에셋 대신 **프리셋 전용 그룹 폼 + 설명 + 정규식 폴더**를 표시합니다.
- visible `프롬프트` 그룹은 더 이상 legacy `mainPrompt` / `jailbreak` / `globalNote` 중심이 아니라, **구조화 `promptTemplate` / `formatingOrder` + 템플릿 변수** 중심으로 동작합니다.
- `promptTemplate`는 raw JSON textarea 대신 **카드형 항목 목록 + 상세 편집기**로 열리며, `type`, `type2`, `role`, `text`, `range`, `innerFormat`, `defaultText`, cache 옵션을 구조적으로 수정할 수 있습니다. 지원되는 항목에는 안정적 `id`가 자동으로 부여되며, 타입 변경·순서 변경 뒤에도 같은 항목이면 `id`가 유지됩니다.
- `formatingOrder`는 raw JSON textarea 대신 **재정렬 가능한 토큰 목록**으로 열리며, known/unknown token을 그대로 유지합니다. 중복 토큰이나 대응 없는 토큰이 있으면 경고로 표시되지만 저장은 막지 않습니다.
- `customPromptTemplateToggle`는 실제 RisuAI 사용 흐름에 맞춰 **멀티라인 textarea**로 편집됩니다.
- legacy `mainPrompt`, `jailbreak`, `globalNote`, `useInstructPrompt`, `instructChatTemplate`, `JinjaTemplate`는 파일에 그대로 보존되지만 **주요 프롬프트 UI에서는 내려가며**, 호환성 데이터로 유지됩니다.
- 실제 RisuAI가 내보낸 `.risup`는 gzip / zlib / raw-deflate 변형까지 열 수 있고, 저장 시 감지한 압축 모드를 최대한 보존합니다.
- JSON 기반 프리셋 필드(`presetBias`, `localStopStrings`)와 구조화 프롬프트 필드(`promptTemplate`, `formatingOrder`)가 잘못된 형식이면 저장이 차단되고 상태바에 문제 필드가 표시됩니다.
- MCP generic `write_field` / `write_field_batch`와 autosave도 동일한 risup 검증 경계를 사용하므로, malformed JSON/shape는 메모리나 autosave 파일에 조용히 남지 않고 즉시 거부됩니다.
- `.charx`의 **캐릭터 정보**에는 `description`, `globalNote`, `defaultVariables`와 함께 `creatorcomment`, `characterVersion`도 포함됩니다.
- `triggerScripts`는 raw JSON 대신 **구조화된 트리거 폼 에디터**로 열리며, 지원하지 않는 trigger/effect/condition이 남아 있으면 저장이 차단됩니다.
- `.charx` / `.risum`은 빈 `triggerScripts` 또는 단독 `triggerlua` wrapper를 **Lua 모드**로 취급합니다. 이때 트리거 항목은 비활성처럼 보이고, 독립 트리거가 있을 때는 반대로 Lua 폴더가 비활성처럼 보입니다.

#### Lua / CSS 섹션 시스템

<img width="1629" height="709" alt="Lua 섹션" src="https://github.com/user-attachments/assets/da9deeb0-fcc3-44f8-a64f-63ed40571444" />

- Lua: `-- ===== 섹션명 =====` 구분자로 분할 · CSS: `/* ===== 섹션명 ===== */` 구분자로 분할
- **통합 보기**: 전체 코드를 하나의 탭에서 편집 · **개별 섹션**: 각 섹션을 별도 탭에서 편집
- 우클릭 → 새 섹션 추가 / 이름 변경 / 삭제 / 백업 불러오기

#### 로어북

<img width="1627" height="709" alt="로어북" src="https://github.com/user-attachments/assets/556eadc9-e377-4955-b7bf-7963562dc00a" />

- 폴더 구조 지원 · 항목 클릭 → 전용 폼 에디터 (comment, key, content, mode 등)
- 우클릭 → 새 항목/폴더 추가 · JSON 가져오기 · 이름 변경 · 삭제 · 백업 불러오기
- 드래그 앤 드롭으로 항목 재정렬 + 폴더 간 이동

#### 정규식 / 에셋

- **정규식**: 전용 폼 에디터 (find, replace, type, flag) · 우클릭 CRUD · 드래그 앤 드롭 재정렬
- **에셋**: 이미지 파일 목록 · 클릭 → 이미지 뷰어 (확대/축소/드래그) · 우클릭 추가/삭제

### 참고자료 탭

<img width="518" height="186" alt="참고자료" src="https://github.com/user-attachments/assets/0535187b-5ae8-4873-b641-2478f94914b3" />

- **가이드**: 내장 문법 가이드 (Lua, CBS, 로어북, 정규식, HTML/CSS 등)
- **참고 파일**: 다른 .charx/.risum 파일을 읽기 전용으로 로드 (로어북/Lua/CSS 개별 항목까지 조회 가능)
- 앱 재시작 시 자동 복원 · AI CLI에서 MCP 도구로도 접근 가능

### 백업 시스템

- 편집 시작/탭 전환/MCP 덮어쓰기 시 자동 백업 (탭당 최대 20 버전)
- 항목 우클릭 → **백업 불러오기** → 날짜/시간별 버전 선택 + 미리보기

---

## 5. 에디터 (Monaco)

VS Code와 동일한 Monaco 편집 엔진을 사용합니다.

- 구문 강조 (Lua, HTML, CSS, JSON 등) · 자동 완성 · 찾기/바꾸기 (`Ctrl+F` / `Ctrl+H`)
- 마우스 휠 줌 (`Ctrl + 마우스 휠`) · 미니맵
- 여러 항목을 동시에 탭으로 열기 · 탭 드래그로 순서 변경
- 탭 `↗` 버튼 → 별도 창에서 편집 (팝아웃) · `⧉` 버튼 → 메인 창 내 슬롯 분리
- 탭 팝아웃 버튼은 키보드 포커스로도 접근 가능하며, 팝아웃 중인 에디터 영역에는 `📌 도킹하면 여기로 복원됩니다` 안내가 표시됩니다.
- 읽기 전용 탭을 팝아웃하면 제목 배지와 비활성 저장 버튼으로 편집 불가 상태를 바로 확인할 수 있고, 메인 창 placeholder도 `열람중`으로 구분되어 편집 가능한 팝아웃과 혼동되지 않습니다.

---

## 6. TokiTalk 터미널

<img width="259" height="38" alt="터미널 헤더" src="https://github.com/user-attachments/assets/a336229d-dc6d-4dc2-bf5d-64ee75e98f45" />

- 일반 셸 명령어 실행 (bash/powershell) · **복사**: `Ctrl+C` · **붙여넣기**: `Ctrl+V` 또는 우클릭

### 터미널 메뉴

<img width="227" height="148" alt="터미널 메뉴" src="https://github.com/user-attachments/assets/e4f5397a-6925-4d70-83d6-5b7e8b4ca7cb" />

- **Claude Code / Copilot CLI / Codex / Gemini 시작** — 현재 파일 컨텍스트와 함께 AI CLI 실행 (플루니 모드에서는 터미널에 직접 `copilot`을 입력해도 동일)
- **터미널 지우기** / **터미널 재시작**

### 헤더 버튼

| 버튼 | 기능                                      |
| ---- | ----------------------------------------- |
| 🐰   | RP 모드 토글 (토키/아리스 말투로 AI 응답) |
| 🔇   | BGM ON/OFF (우클릭으로 파일 변경)         |
| 🖼   | 터미널 배경 이미지 설정                   |
| ⚙    | 설정 패널 열기                            |
| ━    | 터미널 패널 접기/펼치기                   |

- 터미널 팝아웃은 메인 창과 같은 레이아웃/아바타/터미널 표면 스타일을 재사용해 라이트·다크 모드 모두 톤이 더 자연스럽게 맞춰집니다.
- 터미널 팝아웃에서 xterm 초기화에 실패하면 빈 화면 대신 안내 메시지를 표시하고, 창을 닫을 때 terminal UI와 설정 구독을 함께 정리해 재오픈 시 상태가 누적되지 않도록 보강되었습니다.

---

## 7. AI CLI 연동 + MCP

RisuToki의 핵심 기능입니다. 터미널에서 AI CLI를 실행하면 열려 있는 파일의 구조와 내용이 자동으로 전달됩니다.

### 지원 CLI

| CLI                | MCP 설정 위치                | 컨텍스트 전달 방식                                                                                  |
| ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Claude Code        | `~/.mcp.json`                | `--append-system-prompt`로 파일 정보 전달                                                           |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` | `AGENTS.md` 자동 생성 + 프로젝트 가이드 병합 + 플루니 모드 시 `.github/agents/*.agent.md` 임시 생성 |
| Codex              | `~/.codex/config.toml`       | `AGENTS.md` 자동 생성 + 프로젝트 가이드 병합                                                        |
| Gemini CLI         | `~/.gemini/settings.json`    | `AGENTS.md` 자동 생성 + 프로젝트 가이드 병합                                                        |

> 앱 시작 시 4개 CLI 설정 파일이 자동 생성되며, 앱 종료 시 정리됩니다.

- `플루니 연구소` RP 모드에서 GitHub Copilot CLI를 시작하면 선택한 카테고리에 맞춰 `Pluni` / `Kotone` / `Sophia` custom agent 프로필이 `.github/agents/` 아래에 `.agent.md` 확장자(YAML frontmatter 포함)로 임시 생성됩니다.
- 부트스트랩 경로는 내장 터미널의 현재 작업 디렉터리(cwd) 기준으로 결정됩니다.
- 플루니 모드가 활성화된 상태에서는 메뉴 액션 외에 터미널에 직접 `copilot`을 입력해도 동일한 부트스트랩이 적용됩니다.
- GitHub Copilot CLI가 아닌 환경에서는 같은 3인 자문 구조를 단일 세션 프롬프트로 합성해 전달합니다.

### 프로젝트 스킬 폴더

루트 `skills/` 폴더는 프로젝트 스킬 문서를 두는 위치이며, 현재 저장소에는 번들 스킬 문서가 함께 포함됩니다. 필요하면 이 위치에 로컬 프로젝트 스킬 문서를 추가로 둘 수 있습니다.

`.claude/skills`, `.gemini/skills`, `.github/skills`는 각 CLI가 찾는 경로이며, 로컬에서는 이 경로들이 루트 `skills/`를 가리키는 디렉터리 링크로 복구됩니다. Windows에서는 git 상태를 깨끗하게 유지하기 위해 실제 symlink를 먼저 시도하고, 권한 때문에 불가능할 때만 junction으로 폴백합니다.

Windows에서 git 체크아웃이 링크를 일반 텍스트 파일(`../skills`)로 풀어버리거나 루트 `skills/` 폴더가 비어 보이면 `npm run sync:skills`를 실행하세요. 이 명령은 `npm install`의 `prepare` 단계에서도 자동 실행되며, 루트 `skills/` 폴더가 없으면 조용히 건너뜁니다.

`list_skills`는 이제 각 스킬의 `name`, `description`, `tags`, `relatedTools`, `files`를 함께 반환합니다. 따라서 AI는 긴 `AGENTS.md`를 항상 들고 있지 않아도, 필요한 문법/구조/워크플로 스킬만 골라서 on-demand로 읽을 수 있습니다.

### 내장 스킬 맵

| 분류            | 대표 스킬                                                                                                                                | 용도                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **워크플로**    | `using-mcp-tools`                                                                                                                        | 어떤 MCP 도구를 선택해야 할지 판단                        |
| **구조 참조**   | `file-structure-reference`                                                                                                               | `.charx` / `.risum` / `.risup`, lorebook, regex 구조 확인 |
| **태그 가이드** | `writing-danbooru-tags`                                                                                                                  | Danbooru 태그 검색·검증·정리                              |
| **문법 가이드** | `writing-cbs-syntax`, `writing-lua-scripts`, `writing-lorebooks`, `writing-regex-scripts`, `writing-html-css`, `writing-trigger-scripts` | surface별 구체 문법/패턴                                  |

### MCP 도구 목록

CLI 시작 시 MCP 서버가 자동 연결되어 AI가 에디터 데이터를 직접 읽고 쓸 수 있습니다.

| 카테고리           | 도구                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **필드**           | `list_fields` · `read_field` · `write_field` · `search_in_field` · `read_field_range` · `replace_in_field` · `replace_in_field_batch` · `insert_in_field` · `search_all_fields`                                                       |
| **Lua 섹션**       | `list_lua` · `read_lua` · `write_lua` · `replace_in_lua` · `insert_in_lua` · `add_lua_section`                                                                                                                                        |
| **CSS 섹션**       | `list_css` · `read_css` · `write_css` · `replace_in_css` · `insert_in_css` · `add_css_section`                                                                                                                                        |
| **로어북**         | `list_lorebook` · `read_lorebook` · `write_lorebook` · `add_lorebook` · `delete_lorebook` · `replace_in_lorebook` · `replace_across_all_lorebook` + 배치 도구                                                                         |
| **정규식**         | `list_regex` · `read_regex` · `write_regex` · `add_regex` · `delete_regex` · `replace_in_regex` · `insert_in_regex` · `add_regex_batch` · `write_regex_batch`                                                                         |
| **인사말**         | `list_greetings` · `read_greeting` · `write_greeting` · `add_greeting` · `delete_greeting`                                                                                                                                            |
| **트리거**         | `list_triggers` · `read_trigger` · `write_trigger` · `add_trigger` · `delete_trigger`                                                                                                                                                 |
| **risup 프롬프트** | `list_risup_prompt_items` · `read_risup_prompt_item` · `write_risup_prompt_item` · `add_risup_prompt_item` · `delete_risup_prompt_item` · `reorder_risup_prompt_items` · `read_risup_formating_order` · `write_risup_formating_order` |
| **참고자료**       | `list_references` · `read_reference_field` + 로어북/Lua/CSS/정규식 세부 조회 도구                                                                                                                                                     |
| **에셋**           | charx: `list_charx_assets` · `read_charx_asset` · `add_charx_asset` · `delete_charx_asset` · `rename_charx_asset` / risum: `list_risum_assets` · `read_risum_asset` · `add_risum_asset` · `delete_risum_asset`                        |
| **Danbooru**       | `validate_danbooru_tags` · `search_danbooru_tags` · `get_popular_danbooru_tags`                                                                                                                                                       |
| **CBS 검증**       | `validate_cbs` · `list_cbs_toggles` · `simulate_cbs` · `diff_cbs` — CBS 구조 검증 + 토글 시뮬레이션                                                                                                                                   |
| **스킬**           | `list_skills` · `read_skill` — CBS/Lua/로어북/정규식 등 문법 가이드                                                                                                                                                                   |

- `write` / `add` / `delete` 사용 시 **모모톡 스타일 확인 팝업** 표시 ("이번 작업 동안 전부 허용" 토글로 생략 가능)
- AI CLI가 수정한 내용은 에디터에 실시간 반영
- 정규식·인사말·Lua/CSS 섹션에 더해 field/lorebook validation 도구의 4xx 에러도 `action`, `target`, `status`, `suggestion` 등의 구조화 필드를 포함하여 AI CLI가 에러를 자동 진단·복구할 수 있습니다
- 로어북 폴더는 폴더 항목의 canonical `key` 값인 `folder:UUID`를 기준으로 추적되며, 자식 항목의 `folder` 값도 같은 `folder:UUID` 형태로 정규화됩니다. 예전 bare UUID / `id` 기반 폴더 데이터도 읽기 시 자동 호환됩니다.

<img width="1593" height="380" alt="MCP 연동" src="https://github.com/user-attachments/assets/bb2cf1b0-d8f9-4eb7-afe4-37491ca9cfc6" />

### 사용 예시

```
"글로벌노트에 시스템 프롬프트 추가해줘"
"로어북에서 키워드가 '세이버'인 항목 찾아서 내용 수정해줘"
"Lua 코드에서 버그 찾아줘"
"참고 파일의 로어북과 현재 로어북을 비교해줘"
"캐릭터 외형에 맞는 Danbooru 태그로 이미지 프롬프트 만들어줘"
```

---

## 8. 프리뷰 모드 / RP 모드

### 프리뷰 모드 (F5)

<img width="1380" height="783" alt="프리뷰" src="https://github.com/user-attachments/assets/c16a9e11-b7ac-460a-80a3-b779c70bed1b" />

RisuAI와 동일한 렌더링 파이프라인으로 채팅 화면을 시뮬레이션합니다.

- **firstMessage** 자동 표시 → 유저 입력 → AI 응답(직접 입력) 순서로 대화 테스트
- 프리뷰는 현재 `.charx` 파일에서만 열립니다. `.risum` / `.risup`가 활성 탭일 때는 보기 메뉴와 `F5`가 모두 차단됩니다.
- CBS(Conditional Block System) 실행 — 변수 조건분기, 버튼 클릭 처리, 함수(`#func`/`call`), 반복(`#each`), 주사위/난수, 유니코드/암호화 태그 등 RisuAI 상위 호환
- 정규식 · Lua 트리거 적용 (editOutput → editDisplay → editInput)
- 에셋 참조 자동 변환 (`{{raw::name}}`, `{{asset::name}}`, `ccdefault:`, `embeded://`)
- 로어북 프리뷰는 `@@depth` / `@@position` / `@@role` / `@@scan_depth` / `@@probability` / `@@activate` / `@@dont_activate` / `@@match_full_word` / `@@additional_keys` / `@@exclude_keys`를 반영하며, `@@probability`는 재현 가능한 결정적 roll로 시뮬레이션됩니다.
- **디버그 패널**: 변수 덤프 · 로어북 활성화 요약(활성/전체 수 + 확률 표시) · 매칭 키/제외 키 · 데코레이터 태그 · scan depth · 확률 판정 · 경고 · 삽입순서·selective 배지 · 정규식 플래그·비활성 섹션 · Lua 로그 실시간 확인
- 프리뷰 초기화(리셋) · 팝아웃(`↗`)으로 별도 창 분리 가능
- `risu-btn` / `risu-trigger` 기반 버튼과 `triggerScripts` 기반 Lua 핸들러를 프리뷰에서도 확인 가능
- Lua `setDescription`, `setPersonality`, `setScenario`, `setFirstMessage` 호출 결과가 프리뷰 세션에 즉시 반영되어, 카드 필드 변경 스크립트를 더 가깝게 검증할 수 있습니다.
- `{{charpersona}}`는 personality를, `{{chardesc}}`는 description을 각각 읽도록 정리되어, 캐릭터 성격과 설명 텍스트를 프리뷰 템플릿에서 구분해 검증할 수 있습니다.
- 첫 메시지 렌더 시 강제 맨 아래 스크롤을 피하도록 조정되어 긴 카드도 위쪽부터 바로 확인 가능
- 프리뷰 팝아웃은 `초기화` / `디버그 패널` / `메인 창으로 도킹` / `닫기`를 각각 명시적으로 구분하며, 메인/팝아웃 프리뷰 모두 디버그가 열려 있을 때 버튼 활성 상태가 표시됩니다.
- 메인/팝아웃 프리뷰 입력창은 IME 조합 중 Enter를 전송으로 처리하지 않아, 한글 입력 중 메시지가 잘못 전송되지 않습니다.
- 팝아웃 헤더 버튼과 채팅/디버그 표면은 라이트·다크 모드에 맞춰 공용 테마로 정리되어, 다크 모드에서도 버튼 색이 과하게 뜨지 않고 editor/preview/terminal 팝아웃 전반의 톤이 더 일관되게 보입니다.
- `npm run dev` 개발 모드에서도 샌드박스 iframe 보안 정책과 충돌하지 않도록 프리뷰 bridge를 정리해, 브라우저 콘솔 `SecurityError` 없이 동일한 프리뷰 흐름을 확인 가능
- `{{cbr}}` / `{{cnl}}` / `{{cnewline}}`는 실제 줄바꿈으로 렌더링되고, 프리뷰의 `chatindex` / `isfirstmsg` / Lua `onOutput` 흐름도 실제 메시지 순서에 맞게 보정되었습니다.
- 프리뷰 초기화 시 인라인 상태 배너를 표시해, iframe이 5 초 안에 준비되지 않으면 타임아웃 에러를, Lua 트리거 실패 등 런타임 에러가 발생하면 해당 메시지를 패널 안에서 바로 확인 가능 — 초기화 중에는 입력·전송·리셋 버튼이 비활성화됩니다.
- 프리뷰는 샌드박스 iframe에서 렌더링되며 `<script>`, 인라인 이벤트 속성(`on*`), 프레임 탈출을 전제로 한 HTML은 실행되지 않음
- 앱은 더 이상 숨은 로컬 sync HTTP 서버를 열지 않으며, 파일 교환은 직접 열기/저장과 MCP 경로만 지원

### RP 모드

- 터미널 헤더 🐰 버튼으로 토글
- 토키(라이트) / 아리스(다크) / 커스텀 / 플루니 연구소(Copilot) 중 선택
- 기존 토키/아리스/커스텀은 AI CLI 응답 말투를 조정하고, 플루니 연구소는 챗봇 설계 자문 워크플로를 부트스트랩합니다.
- 플루니 연구소는 `1:1 챗봇` / `월드 시뮬레이터` / `멀티 캐릭터 월드 시뮬레이터` 3개 카테고리를 설정에서 선택할 수 있습니다.
- GitHub Copilot CLI에서는 `Pluni` / `Kotone` / `Sophia` 임시 자문 에이전트(`.agent.md`)를 생성하고, 다른 CLI에서는 같은 자문 구조를 단일 세션 프롬프트로 합성합니다.
- 터미널 팝아웃의 채팅 입력도 IME 조합 중 Enter를 바로 전송하지 않도록 맞춰, 팝아웃 상태에서도 한글 입력 중 오작동이 줄어듭니다.

### 아바타 패널

<img width="184" height="250" alt="아바타" src="https://github.com/user-attachments/assets/8c3f79b3-e7e4-4b13-92a2-dade8ddeb5a9" />
<img width="522" height="509" alt="아바타 설정" src="https://github.com/user-attachments/assets/83c4ee4a-f726-45df-8713-4b25883a5c76" />

- 대기: 기본 아이콘 (💤) / 작업 중: 춤추는 GIF (✨)
- 우클릭 → 커스텀 이미지 등록 · GIF 초록 배경 자동 크로마키
- 다크 모드: 토키 ↔ 아리스 자동 전환

---

## 9. 설정

<img width="398" height="555" alt="설정" src="https://github.com/user-attachments/assets/6682dfa3-103e-495c-8192-97cdb3c74e9b" />

메뉴바 **설정** 또는 `Ctrl+,` 단축키로 열 수 있습니다.

| 설정                | 설명                                                |
| ------------------- | --------------------------------------------------- |
| **자동저장 ON/OFF** | 일정 간격으로 자동 저장                             |
| **저장 간격**       | 1분 / 5분 / 10분 / 20분 / 30분                      |
| **자동저장 경로**   | 기본(파일 옆) 또는 커스텀 폴더 지정                 |
| **다크 모드**       | 라이트(토키) ↔ 다크(아리스) 전환                    |
| **BGM**             | 배경 음악 ON/OFF                                    |
| **RP 모드**         | 토키/아리스/커스텀/플루니 연구소 선택               |
| **플루니 카테고리** | 1:1 / 월드 시뮬레이터 / 멀티 캐릭터 월드 시뮬레이터 |
| **페르소나 편집**   | 정적 RP 페르소나 텍스트 수정 (토키/아리스/커스텀)   |

> RP 모드 사용 시 AI CLI 시작 전에 페르소나와 카테고리(플루니 연구소)를 설정해두세요.

---

## 10. 단축키 목록

| 단축키         | 기능                 |
| -------------- | -------------------- |
| `Ctrl+N`       | 새로 만들기          |
| `Ctrl+O`       | 파일 열기            |
| `Ctrl+S`       | 저장                 |
| `Ctrl+Shift+S` | 다른 이름으로 저장   |
| `Ctrl+W`       | 현재 탭 닫기         |
| `Ctrl+B`       | 사이드바 토글        |
| `` Ctrl+` ``   | 터미널 토글          |
| `Ctrl+,`       | 설정 열기            |
| `Ctrl+F`       | 찾기                 |
| `Ctrl+H`       | 찾기/바꾸기          |
| `F5`           | 프리뷰 (.charx 전용) |

---

## 문제 해결

| 증상                            | 해결                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| AI CLI가 MCP 도구를 못 찾음     | 앱과 해당 CLI 세션을 완전히 다시 시작한 뒤 다시 시도                                                                       |
| Copilot CLI 인증 실패           | 터미널에서 `/login` 입력 후 GitHub 로그인                                                                                  |
| 저장 시 데이터 누락             | 열려 있는 모든 탭의 변경사항이 저장됩니다 — 탭 닫기 전 `Ctrl+S`                                                            |
| 프리뷰에서 CBS/Lua가 작동 안 함 | 프리뷰는 일부 고급 API만 지원합니다 — RisuAI에서 최종 테스트하세요                                                         |
| 시작 시 자동 저장 복원 대화상자 | 이전 종료가 비정상이었고 복원 가능한 autosave가 남아 있으면 정상 동작입니다 — 복원 / 원본 열기 / 무시 중 하나를 선택하세요 |

---

## 라이선스

[CC BY-NC 4.0](LICENSE) — 비상업적 사용에 한해 자유롭게 이용 가능

---

## 14. RP 모드 (토키 / 플루니 연구소)

AI CLI의 응답 스타일 또는 작업 프레임을 바꾸는 기능입니다.

- 터미널 헤더의 🐰 버튼으로 토글
- 설정 패널에서 상세 모드 선택 가능 (토키/아리스/커스텀/플루니 연구소)
- 플루니 연구소는 GitHub Copilot CLI 전용 고급 모드이며, 카테고리(`1:1 챗봇` / `월드 시뮬레이터` / `멀티 캐릭터 월드 시뮬레이터`)를 함께 저장합니다.
- GitHub Copilot CLI 시작 시 세션 `AGENTS.md`와 임시 `.github/agents/pluni.agent.md`, `kotone.agent.md`, `sophia.agent.md`를 생성합니다.
- 내장 터미널에서 메뉴 액션 또는 직접 `copilot` 입력 모두 지원되며, 부트스트랩은 터미널의 현재 cwd 기준으로 동작합니다.
- Claude Code / Codex / Gemini CLI에서는 같은 3인 자문 패널을 한 세션 프롬프트로 합성해 폴백합니다.
- 활성화 시 버튼 배경이 밝아집니다
- 다음 번 AI CLI 시작 시부터 적용
- 앱 재시작 후에도 상태 유지

---

## 15. 단축키 목록

### 파일

| 단축키         | 동작           |
| -------------- | -------------- |
| `Ctrl+N`       | 새로 만들기    |
| `Ctrl+O`       | 열기           |
| `Ctrl+S`       | 저장           |
| `Ctrl+Shift+S` | 다른 이름 저장 |
| `Ctrl+W`       | 탭 닫기        |

### 편집

| 단축키   | 동작      |
| -------- | --------- |
| `Ctrl+Z` | 실행 취소 |
| `Ctrl+Y` | 다시 실행 |
| `Ctrl+F` | 찾기      |
| `Ctrl+H` | 바꾸기    |
| `Ctrl+A` | 모두 선택 |

### 보기

| 단축키       | 동작                 |
| ------------ | -------------------- |
| `Ctrl+B`     | 사이드바 토글        |
| `` Ctrl+` `` | 터미널 토글          |
| `Ctrl+,`     | 설정 열기            |
| `Ctrl++`     | 에디터 확대          |
| `Ctrl+-`     | 에디터 축소          |
| `Ctrl+0`     | 에디터 기본 크기     |
| `F5`         | 프리뷰 (.charx 전용) |
| `F12`        | 개발자 도구          |

### 터미널

| 단축키             | 동작     |
| ------------------ | -------- |
| `Ctrl+C` (선택 시) | 복사     |
| `Ctrl+V`           | 붙여넣기 |
| 우클릭             | 붙여넣기 |

---

## 16. 지원 파일 형식

### .charx — 캐릭터 카드 v3

```
example.charx (ZIP 아카이브)
├── card.json          ← V3 캐릭터 카드 스펙 (name, description, firstMessage 등)
├── module.risum       ← RPack 인코딩 바이너리 (Lua 트리거, 정규식, 로어북)
└── assets/            ← 이미지 리소스
    ├── icon/          ← 캐릭터 아이콘
    └── other/image/   ← 기타 이미지
```

### .risum — 모듈

RPack 인코딩 바이너리 파일. Lua 트리거, 정규식, 로어북, CJS, 에셋 등을 포함합니다.

### .risup — 프리셋

암호화된 AI 프리셋 파일. 모델 설정, 생성 파라미터, 프롬프트 템플릿 등을 포함합니다.

- 실제 RisuAI export 기준 gzip / zlib / raw-deflate 변형을 모두 열 수 있습니다.
- visible `프롬프트` 그룹은 `promptTemplate`, `formatingOrder`, `customPromptTemplateToggle`, 템플릿 변수 중심의 **template-first 프롬프트 surface**로 동작합니다.
- `promptTemplate`는 항목 단위 구조화 에디터로 열리며, `plain` / `jailbreak` / `cot` / `chatML` / `persona` / `description` / `lorebook` / `postEverything` / `memory` / `authornote` / `chat` / `cache` 타입을 직접 수정할 수 있습니다.
- `formatingOrder`는 순서 전용 리스트 에디터로 열리며, legacy/custom token도 문자열이면 보존됩니다.
- `customPromptTemplateToggle`는 멀티라인 textarea로 열리며, 구조화 프롬프트 에디터와 함께 앱 기본 스타일에 맞춘 카드/셀렉트/버튼 UI를 사용합니다.
- legacy `mainPrompt`, `jailbreak`, `globalNote`, `useInstructPrompt`, `instructChatTemplate`, `JinjaTemplate`는 호환성 데이터로 남아 있지만 주요 프롬프트 흐름에서는 내려갑니다.
- MCP에서는 raw `read_field` / `write_field` 외에도 prompt item CRUD / reorder와 formatting order 전용 도구를 제공합니다. prompt item 조회 응답에는 additive `id`가, `read_risup_formating_order` 응답에는 advisory `warnings` 배열이 포함되며, raw `write_field("promptTemplate")`는 명시적 `id`를 그대로 보존합니다.

### 편집 가능 필드 (charx)

| 필드                   | 설명                                          |
| ---------------------- | --------------------------------------------- |
| `lua`                  | Lua 5.4 트리거 스크립트 (RisuAI CBS API 사용) |
| `triggerScripts`       | 구조화 트리거 목록/조건/효과 편집 데이터      |
| `globalNote`           | 포스트 히스토리 인스트럭션                    |
| `firstMessage`         | 첫 메시지 (HTML/마크다운)                     |
| `alternateGreetings[]` | 추가 첫 메시지 배열                           |
| `groupOnlyGreetings[]` | 그룹 전용 첫 메시지 배열                      |
| `description`          | 캐릭터 설명                                   |
| `creatorcomment`       | 제작자 노트                                   |
| `characterVersion`     | 캐릭터 버전                                   |
| `css`                  | 커스텀 CSS                                    |
| `defaultVariables`     | 기본 변수                                     |
| `lorebook[]`           | 로어북 항목 배열                              |
| `regex[]`              | 정규식 스크립트 배열                          |

### 편집 가능 필드 (risum)

| 필드                  | 설명                         |
| --------------------- | ---------------------------- |
| `name`                | 모듈 이름                    |
| `description`         | 모듈 설명                    |
| `lua`                 | Lua 트리거 스크립트          |
| `triggerScripts`      | 구조화 트리거 목록/조건/효과 |
| `cjs`                 | CommonJS 코드                |
| `lowLevelAccess`      | 저수준 접근 활성화 (boolean) |
| `backgroundEmbedding` | 배경 임베딩 HTML             |
| `lorebook[]`          | 로어북 항목 배열             |
| `regex[]`             | 정규식 스크립트 배열         |

### 편집 가능 필드 (risup)

| 필드 그룹                      | 예시 필드                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 기본                           | `name`                                                                                                                                         |
| 설명                           | `description`                                                                                                                                  |
| 프롬프트                       | 구조화 `promptTemplate`, 구조화 `formatingOrder`, `customPromptTemplateToggle`, `templateDefaultVariables`, `moduleIntergration`, `presetBias` |
| 레거시 프롬프트(호환성 데이터) | `mainPrompt`, `jailbreak`, `globalNote`, `useInstructPrompt`, `instructChatTemplate`, `JinjaTemplate`                                          |
| 모델/API                       | `aiModel`, `subModel`, `apiType`, `promptPreprocess`                                                                                           |
| 기본 파라미터                  | `temperature`, `maxContext`, `maxResponse`, `frequencyPenalty`, `presencePenalty`                                                              |
| 샘플링/추론                    | `top_p`, `top_k`, `repetition_penalty`, `min_p`, `top_a`, `reasonEffort`, `thinkingTokens`, `thinkingType`                                     |
| JSON 스키마                    | `jsonSchemaEnabled`, `jsonSchema`, `strictJsonSchema`, `extractJson`                                                                           |
| 기타                           | `groupTemplate`, `autoSuggestPrompt`, `localStopStrings`, `verbosity`, `systemContentReplacement`, `systemRoleReplacement`                     |
| 정규식                         | `regex[]`                                                                                                                                      |

> 참고: `ooba`, `NAISettings`, `customFlags` 같은 복잡한 중첩 preset 객체는 파일에 **보존**되지만, 현재 UI에서는 개별 폼으로 노출하지 않습니다. 지원하지 않는 `promptTemplate` item shape는 구조화 에디터에서 읽기 전용 경고로 표시되며, raw 수정이 필요하면 `write_field("promptTemplate")` 또는 risup prompt MCP fallback을 사용하세요.

---

## 17. 문제 해결

### AI CLI가 시작되지 않음

- 사용하려는 CLI(`claude`, `copilot`, `codex`, `gemini`)가 PATH에 등록되어 있는지 확인하세요.
- 터미널에서 직접 해당 명령어를 입력해 보세요.
- GitHub Copilot CLI는 첫 실행 시 `/login` 인증이 필요할 수 있습니다.

### MCP 연결 실패

- Claude Code 시작 시 `~/.mcp.json`이 자동 생성됩니다.
- GitHub Copilot CLI 시작 시 `~/.copilot/mcp-config.json`이 자동 생성됩니다.
- Codex 시작 시 `~/.codex/config.toml`에 RisuToki MCP 블록이 자동 추가됩니다.
- Gemini 시작 시 `~/.gemini/settings.json`이 자동 생성됩니다.
- 에디터를 재시작하면 포트가 변경될 수 있으며, 자동으로 새 포트가 반영됩니다.
- 각 CLI를 에디터에서 시작해야 RisuToki MCP 도구가 연동됩니다.
- 업데이트 직후에도 `search_all_fields`에서 `MCP server 'risutoki': Not found`가 보이면, 이미 실행 중이던 구버전 CLI 세션일 수 있으니 터미널 메뉴에서 해당 CLI를 완전히 다시 시작하세요.

### 파일이 열리지 않음

- `.charx`, `.risum`, `.risup` 확장자 파일인지 확인하세요.
- `.charx` 파일은 유효한 ZIP 형식이어야 합니다.
- `.risup` 파일은 RisuAI에서 내보낸 프리셋 파일이어야 하며, 현재 버전은 gzip / zlib / raw-deflate export 모두 지원합니다.

### GIF 아바타가 움직이지 않음

- 아바타 패널이 숨겨져 있지 않은지 확인하세요 (보기 → 아바타 토글).

### 저장 후에도 수정 표시가 남음

- 모든 탭의 변경사항이 한 번에 저장됩니다. `Ctrl+S`로 저장 후 표시가 사라집니다.

### 자동 저장이 안 됨

- 설정에서 자동 저장이 ON인지 확인하세요.
- 새 파일(한 번도 저장 안 한 파일)은 자동저장 경로를 지정해야 합니다.

### 시작 시 자동 저장 복원 대화상자가 뜸

- 이전 세션이 비정상 종료되었고 복원 가능한 autosave와 `.toki-recovery.json` sidecar가 남아 있으면 표시됩니다.
- 자동 저장을 이어서 열려면 **자동 저장 복원**, 원본 파일만 열려면 **원본 열기**, 이번 한 번 무시하려면 **무시**를 선택하세요.
- 복원한 뒤 저장 / 열기 / 새 파일을 성공하면 `[자동복원]` 표시와 recovery status는 자동으로 사라집니다.
