# RisuToki

> RisuAI .charx / .risum / .risup 파일 전용 에디터 + AI CLI 통합 터미널

[![Version](https://img.shields.io/badge/version-0.22.3-blue.svg)](https://github.com/woduseh/RisuToki/releases)
[![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-40-47848F.svg)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933.svg)](https://nodejs.org/)

## RisuToki란?

RisuToki는 [RisuAI](https://risuai.net/) 캐릭터 카드(`.charx`), 모듈(`.risum`), 프리셋(`.risup`) 파일을 편집하기 위한 **데스크톱 전용 에디터**입니다. VS Code 수준의 Monaco 에디터와 내장 터미널을 통해 AI CLI(Claude Code, GitHub Copilot CLI, Codex, Gemini CLI)를 직접 연동할 수 있으며, MCP(Model Context Protocol)로 파일 구조를 AI에 자동 전달합니다.

### 주요 기능

| 기능                  | 설명                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 📝 **Monaco 에디터**  | VS Code 동일 편집 엔진 — 구문 강조, 자동완성, 찾기/바꾸기                                                               |
| 🤖 **AI CLI 연동**    | Claude Code · GitHub Copilot CLI · Codex · Gemini CLI 터미널 내 실행 + MCP 자동 연결                                    |
| 📦 **3종 파일 지원**  | `.charx` (캐릭터 카드) · `.risum` (모듈) · `.risup` (프리셋) 열기/편집/저장                                             |
| 🔧 **MCP 도구 99종**  | 필드·로어북·정규식·Lua/CSS 섹션·인사말·트리거·에셋·CBS 검증·참고자료·Danbooru 태그·스킬 문서 읽기/쓰기 + 일괄 검색/치환 |
| 🎭 **프리뷰 모드**    | CBS/Lua 렌더링 + 채팅 시뮬레이션 (F5)                                                                                   |
| 📚 **참고 자료**      | 다른 .charx/.risum 파일을 읽기 전용으로 로드 + 세부 항목 개별 조회                                                      |
| 🐰 **RP 모드**        | 토키/아리스/커스텀 페르소나로 AI CLI 응답 변환                                                                          |
| 🔀 **사이드바 DnD**   | 로어북·정규식·Lua/CSS 섹션·인사말·에셋 드래그 앤 드롭으로 순서 변경                                                     |
| 🖼 **슬롯 레이아웃**  | 패널 드래그 앤 드롭으로 자유 배치 + 팝아웃(외부 창 분리)                                                                |
| 💾 **자동 저장/백업** | 설정 가능한 간격의 자동저장 + 항목별 최대 20개 버전 백업                                                                |
| 🎵 **MomoTalk UI**    | 모모톡 테마 팝업, NSIS 인스톨러, 아바타 GIF 시스템                                                                      |

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
- **자동 저장**: 설정에서 간격(1~30분) 지정 가능

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

.charx 파일을 열면 아래 항목들이 표시됩니다 (.risum, .risup은 해당 파일 타입에 맞는 항목만 표시):

<img width="269" height="365" alt="사이드바" src="https://github.com/user-attachments/assets/80fc85c8-1b06-4094-a752-9ef99e765a10" />
<img width="262" height="357" alt="로어북" src="https://github.com/user-attachments/assets/baa21125-ee5e-477b-855e-c79bbd2e122b" />

#### 기본 항목

| 항목                | 설명                                     | 파일 타입           |
| ------------------- | ---------------------------------------- | ------------------- |
| **Lua**             | Lua 트리거 스크립트 (섹션 분할 편집)     | charx, risum        |
| **트리거 스크립트** | 트리거 스크립트 (개별 트리거 편집)       | charx, risum        |
| **글로벌노트**      | 시스템 프롬프트 뒤에 삽입되는 인스트럭션 | charx               |
| **첫 메시지**       | 대화 시작 시 표시되는 첫 번째 메시지     | charx               |
| **추가 첫 메시지**  | 대체 첫 메시지 (개별 탭으로 편집)        | charx               |
| **그룹 첫 메시지**  | 그룹 전용 인사말 (개별 탭으로 편집)      | charx               |
| **CSS**             | RisuAI 채팅 UI 커스텀 스타일 (섹션 분할) | charx               |
| **설명**            | 캐릭터/모듈/프리셋 설명                  | charx, risum, risup |
| **메인 프롬프트**   | AI 프리셋 기본 프롬프트                  | risup               |

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

---

## 6. TokiTalk 터미널

<img width="259" height="38" alt="터미널 헤더" src="https://github.com/user-attachments/assets/a336229d-dc6d-4dc2-bf5d-64ee75e98f45" />

- 일반 셸 명령어 실행 (bash/powershell) · **복사**: `Ctrl+C` · **붙여넣기**: `Ctrl+V` 또는 우클릭

### 터미널 메뉴

<img width="227" height="148" alt="터미널 메뉴" src="https://github.com/user-attachments/assets/e4f5397a-6925-4d70-83d6-5b7e8b4ca7cb" />

- **Claude Code / Copilot CLI / Codex / Gemini 시작** — 현재 파일 컨텍스트와 함께 AI CLI 실행
- **터미널 지우기** / **터미널 재시작**

### 헤더 버튼

| 버튼 | 기능                                      |
| ---- | ----------------------------------------- |
| 🐰   | RP 모드 토글 (토키/아리스 말투로 AI 응답) |
| 🔇   | BGM ON/OFF (우클릭으로 파일 변경)         |
| 🖼   | 터미널 배경 이미지 설정                   |
| ⚙    | 설정 패널 열기                            |
| ━    | 터미널 패널 접기/펼치기                   |

---

## 7. AI CLI 연동 + MCP

RisuToki의 핵심 기능입니다. 터미널에서 AI CLI를 실행하면 열려 있는 파일의 구조와 내용이 자동으로 전달됩니다.

### 지원 CLI

| CLI                | MCP 설정 위치                | 컨텍스트 전달 방식                           |
| ------------------ | ---------------------------- | -------------------------------------------- |
| Claude Code        | `~/.mcp.json`                | `--append-system-prompt`로 파일 정보 전달    |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` | `AGENTS.md` 자동 생성 + 프로젝트 가이드 병합 |
| Codex              | `~/.codex/config.toml`       | `AGENTS.md` 자동 생성 + 프로젝트 가이드 병합 |
| Gemini CLI         | `~/.gemini/settings.json`    | `AGENTS.md` 자동 생성 + 프로젝트 가이드 병합 |

> 앱 시작 시 4개 CLI 설정 파일이 자동 생성되며, 앱 종료 시 정리됩니다.

### MCP 도구 목록

CLI 시작 시 MCP 서버가 자동 연결되어 AI가 에디터 데이터를 직접 읽고 쓸 수 있습니다.

| 카테고리     | 도구                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **필드**     | `list_fields` · `read_field` · `write_field` · `search_in_field` · `read_field_range` · `replace_in_field` · `replace_in_field_batch` · `insert_in_field` · `search_all_fields`                                |
| **Lua 섹션** | `list_lua` · `read_lua` · `write_lua` · `replace_in_lua` · `insert_in_lua` · `add_lua_section`                                                                                                                 |
| **CSS 섹션** | `list_css` · `read_css` · `write_css` · `replace_in_css` · `insert_in_css` · `add_css_section`                                                                                                                 |
| **로어북**   | `list_lorebook` · `read_lorebook` · `write_lorebook` · `add_lorebook` · `delete_lorebook` · `replace_in_lorebook` · `replace_across_all_lorebook` + 배치 도구                                                  |
| **정규식**   | `list_regex` · `read_regex` · `write_regex` · `add_regex` · `delete_regex` · `replace_in_regex` · `insert_in_regex` · `add_regex_batch` · `write_regex_batch`                                                  |
| **인사말**   | `list_greetings` · `read_greeting` · `write_greeting` · `add_greeting` · `delete_greeting`                                                                                                                     |
| **트리거**   | `list_triggers` · `read_trigger` · `write_trigger` · `add_trigger` · `delete_trigger`                                                                                                                          |
| **참고자료** | `list_references` · `read_reference_field` + 로어북/Lua/CSS/정규식 세부 조회 도구                                                                                                                              |
| **에셋**     | charx: `list_charx_assets` · `read_charx_asset` · `add_charx_asset` · `delete_charx_asset` · `rename_charx_asset` / risum: `list_risum_assets` · `read_risum_asset` · `add_risum_asset` · `delete_risum_asset` |
| **Danbooru** | `validate_danbooru_tags` · `search_danbooru_tags` · `get_popular_danbooru_tags`                                                                                                                                |
| **CBS 검증** | `validate_cbs` · `list_cbs_toggles` · `simulate_cbs` · `diff_cbs` — CBS 구조 검증 + 토글 시뮬레이션                                                                                                            |
| **스킬**     | `list_skills` · `read_skill` — CBS/Lua/로어북/정규식 등 문법 가이드                                                                                                                                            |

- `write` / `add` / `delete` 사용 시 **모모톡 스타일 확인 팝업** 표시 ("이번 작업 동안 전부 허용" 토글로 생략 가능)
- AI CLI가 수정한 내용은 에디터에 실시간 반영

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
- CBS(Conditional Block System) 실행 — 변수 조건분기, 버튼 클릭 처리
- 정규식 · Lua 트리거 적용 (editOutput → editDisplay → editInput)
- 에셋 참조 자동 변환 (`{{raw::name}}`, `{{asset::name}}`, `ccdefault:`, `embeded://`)
- **디버그 패널**: 변수(chatVars/globalVars/tempVars) · 매칭된 로어북 · Lua 로그 · 정규식 결과 실시간 확인
- 프리뷰 초기화(리셋) · 팝아웃(`↗`)으로 별도 창 분리 가능
- 프리뷰는 샌드박스 iframe에서 렌더링되며 `<script>`, 인라인 이벤트 속성(`on*`), 프레임 탈출을 전제로 한 HTML은 실행되지 않음
- 앱은 더 이상 숨은 로컬 sync HTTP 서버를 열지 않으며, 파일 교환은 직접 열기/저장과 MCP 경로만 지원

### RP 모드

- 터미널 헤더 🐰 버튼으로 토글
- 토키(라이트) / 아리스(다크) / 커스텀 페르소나 중 선택
- AI CLI 응답을 선택한 캐릭터 말투로 변환

### 아바타 패널

<img width="184" height="250" alt="아바타" src="https://github.com/user-attachments/assets/8c3f79b3-e7e4-4b13-92a2-dade8ddeb5a9" />
<img width="522" height="509" alt="아바타 설정" src="https://github.com/user-attachments/assets/83c4ee4a-f726-45df-8713-4b25883a5c76" />

- 대기: 기본 아이콘 (💤) / 작업 중: 춤추는 GIF (✨)
- 우클릭 → 커스텀 이미지 등록 · GIF 초록 배경 자동 크로마키
- 다크 모드: 토키 ↔ 아리스 자동 전환

---

## 9. 설정

<img width="398" height="555" alt="설정" src="https://github.com/user-attachments/assets/6682dfa3-103e-495c-8192-97cdb3c74e9b" />

메뉴바 **설정** 또는 터미널 헤더 **⚙** 버튼으로 열 수 있습니다.

| 설정                | 설명                                |
| ------------------- | ----------------------------------- |
| **자동저장 ON/OFF** | 일정 간격으로 자동 저장             |
| **저장 간격**       | 1분 / 5분 / 10분 / 20분 / 30분      |
| **자동저장 경로**   | 기본(파일 옆) 또는 커스텀 폴더 지정 |
| **다크 모드**       | 라이트(토키) ↔ 다크(아리스) 전환    |
| **BGM**             | 배경 음악 ON/OFF                    |
| **RP 모드**         | 토키/아리스/커스텀 말투 선택        |
| **페르소나 편집**   | RP 모드 페르소나 텍스트 수정        |

> RP 모드 사용 시 AI CLI 시작 전에 페르소나를 설정해두세요.

---

## 10. 단축키 목록

| 단축키         | 기능               |
| -------------- | ------------------ |
| `Ctrl+N`       | 새로 만들기        |
| `Ctrl+O`       | 파일 열기          |
| `Ctrl+S`       | 저장               |
| `Ctrl+Shift+S` | 다른 이름으로 저장 |
| `Ctrl+W`       | 현재 탭 닫기       |
| `Ctrl+B`       | 사이드바 토글      |
| `` Ctrl+` ``   | 터미널 토글        |
| `Ctrl+F`       | 찾기               |
| `Ctrl+H`       | 찾기/바꾸기        |
| `F5`           | 프리뷰 모드        |

---

## 문제 해결

| 증상                            | 해결                                                               |
| ------------------------------- | ------------------------------------------------------------------ |
| AI CLI가 MCP 도구를 못 찾음     | 앱 재시작 후 터미널 메뉴에서 CLI 다시 시작                         |
| Copilot CLI 인증 실패           | 터미널에서 `/login` 입력 후 GitHub 로그인                          |
| 저장 시 데이터 누락             | 열려 있는 모든 탭의 변경사항이 저장됩니다 — 탭 닫기 전 `Ctrl+S`    |
| 프리뷰에서 CBS/Lua가 작동 안 함 | 프리뷰는 일부 고급 API만 지원합니다 — RisuAI에서 최종 테스트하세요 |

---

## 라이선스

[CC BY-NC 4.0](LICENSE) — 비상업적 사용에 한해 자유롭게 이용 가능

---

## 14. RP 모드 (토키 말투)

AI CLI의 응답을 토키(아스마 토키) 또는 아리스(텐도 아리스) 말투로 변경하는 기능입니다.

- 터미널 헤더의 🐰 버튼으로 토글
- 설정 패널에서 상세 모드 선택 가능 (토키/아리스/커스텀)
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

| 단축키       | 동작             |
| ------------ | ---------------- |
| `Ctrl+B`     | 사이드바 토글    |
| `` Ctrl+` `` | 터미널 토글      |
| `Ctrl++`     | 에디터 확대      |
| `Ctrl+-`     | 에디터 축소      |
| `Ctrl+0`     | 에디터 기본 크기 |
| `F5`         | 프리뷰 모드      |
| `F12`        | 개발자 도구      |

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

### 편집 가능 필드 (charx)

| 필드                   | 설명                                          |
| ---------------------- | --------------------------------------------- |
| `lua`                  | Lua 5.4 트리거 스크립트 (RisuAI CBS API 사용) |
| `triggerScripts`       | module.risum의 전체 트리거 스크립트 JSON      |
| `globalNote`           | 포스트 히스토리 인스트럭션                    |
| `firstMessage`         | 첫 메시지 (HTML/마크다운)                     |
| `alternateGreetings[]` | 추가 첫 메시지 배열                           |
| `groupOnlyGreetings[]` | 그룹 전용 첫 메시지 배열                      |
| `description`          | 캐릭터 설명                                   |
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
| `triggerScripts`      | 전체 트리거 스크립트 JSON    |
| `cjs`                 | CommonJS 코드                |
| `lowLevelAccess`      | 저수준 접근 활성화 (boolean) |
| `backgroundEmbedding` | 배경 임베딩 HTML             |
| `lorebook[]`          | 로어북 항목 배열             |
| `regex[]`             | 정규식 스크립트 배열         |

### 편집 가능 필드 (risup)

| 필드          | 설명                  |
| ------------- | --------------------- |
| `name`        | 프리셋 이름           |
| `mainPrompt`  | 메인 프롬프트         |
| `jailbreak`   | 제일브레이크 프롬프트 |
| `aiModel`     | AI 모델               |
| `temperature` | 온도 (생성 파라미터)  |
| `maxContext`  | 최대 컨텍스트 길이    |
| `maxResponse` | 최대 응답 길이        |
| `regex[]`     | 정규식 스크립트 배열  |

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

### 파일이 열리지 않음

- `.charx`, `.risum`, `.risup` 확장자 파일인지 확인하세요.
- `.charx` 파일은 유효한 ZIP 형식이어야 합니다.
- `.risup` 파일은 RisuAI에서 내보낸 프리셋 파일이어야 합니다.

### GIF 아바타가 움직이지 않음

- 아바타 패널이 숨겨져 있지 않은지 확인하세요 (보기 → 아바타 토글).

### 저장 후에도 수정 표시가 남음

- 모든 탭의 변경사항이 한 번에 저장됩니다. `Ctrl+S`로 저장 후 표시가 사라집니다.

### 자동 저장이 안 됨

- 설정에서 자동 저장이 ON인지 확인하세요.
- 새 파일(한 번도 저장 안 한 파일)은 자동저장 경로를 지정해야 합니다.
