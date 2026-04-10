# TypeScript Runtime Architecture

> RisuToki의 TypeScript 런타임 구조, 프로세스 경계, 소유권 규칙, 대형 모듈 핫스팟을 설명하는 정식(canonical) 아키텍처 가이드입니다.
> 소스 탐색용 모듈 맵은 [`docs/MODULE_MAP.md`](../MODULE_MAP.md)를 참조하세요.

---

## 1. 프로세스 레이어 개요

RisuToki는 Electron 데스크톱 앱으로, 하나의 **메인 프로세스**와 두 개의 **렌더러 진입점**(메인 윈도우 + 팝아웃 윈도우)을 가집니다. 별도의 **MCP stdio 서버**가 AI CLI 연동을 위해 자식 프로세스로 실행됩니다.

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron Main Process                                          │
│  main.ts (~1,340 lines)                                         │
│  · 윈도우 관리, IPC 라우팅, 파일 I/O                             │
│  · 터미널(PTY) 수명 주기, 세션 복구, 자동 저장                    │
│  · 참고 자료 매니페스트, 가이드/페르소나 관리                      │
│  · 에셋 CRUD, MCP 설정 생성                                      │
├─────────────────────────────────────────────────────────────────┤
│  Preload Bridges                                                │
│  preload.ts → window.tokiAPI    (메인 윈도우)                    │
│  popout-preload.ts → window.popoutAPI  (팝아웃 윈도우)           │
├──────────────────────┬──────────────────────────────────────────┤
│  Main Renderer       │  Popout Renderer                         │
│  src/main.ts         │  src/popout.ts                           │
│  Vue 3 + Pinia       │  Imperative TS/DOM                       │
│  app/controller.ts   │  popout/controller.ts                    │
│  (~2,930 lines)      │  5가지 패널 타입                          │
├──────────────────────┴──────────────────────────────────────────┤
│  MCP HTTP API (메인 프로세스 내장)                                │
│  src/lib/mcp-api-server.ts — main.ts가 startApiServer() 호출    │
│  deps.getCurrentData()로 메인 프로세스 인메모리 문서 상태 접근     │
├─────────────────────────────────────────────────────────────────┤
│  MCP Stdio Server (별도 자식 프로세스)                            │
│  toki-mcp-server.ts (~2,020 lines)                              │
│  127.0.0.1:${TOKI_PORT} HTTP로 위 API에 연결                     │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 메인 프로세스 (`main.ts`)

Electron `app`, `BrowserWindow`, `ipcMain`을 통한 데스크톱 OS 통합 계층입니다.

**소유하는 것:**
- `.charx` / `.risum` / `.risup` 파일 I/O (`src/charx-io.ts`)
- 참고 자료 매니페스트 (`src/lib/reference-store.ts`)
- 팝아웃 윈도우 수명 주기 (`src/lib/popout-manager.ts`)
- 터미널/PTY 수명 주기 (`src/lib/terminal-manager.ts`)
- MCP HTTP 서버 시작 (`src/lib/mcp-api-server.ts`)
- 자동 저장 스케줄링 (`src/lib/autosave-manager.ts`)
- 세션 복구 기록 추적 (`src/lib/session-recovery-main.ts`)
- 가이드/페르소나/에셋 관리
- MCP/에이전트 설정 생성 (`src/lib/mcp-config.ts`, `src/lib/agents-md-manager.ts`)

**IPC 채널 (주요 그룹):**

| 그룹 | 채널 예시 |
|------|-----------|
| 파일 I/O | `new-file`, `open-file`, `save-file`, `get-file-path` |
| 참고 자료 | `open-reference`, `list-references`, `remove-reference` |
| 터미널 | `terminal-start`, `terminal-input`, `terminal-resize`, `terminal-stop` |
| 에셋 | `get-asset-list`, `add-asset`, `delete-asset`, `compress-assets-webp` |
| MCP/에이전트 | `get-mcp-info`, `write-mcp-config`, `write-agents-md`, `sync-copilot-agent-profiles` |
| 자동 저장/복구 | `autosave-file`, `get-pending-session-recovery`, `resolve-pending-session-recovery` |
| UI 지원 | `pick-bg-image`, `pick-bgm`, `open-folder` |

### 1.2 프리로드 브릿지

Electron `contextIsolation` 하에서 렌더러가 메인 프로세스와 소통하는 유일한 경로입니다.

| 파일 | 노출 객체 | 역할 |
|------|-----------|------|
| `preload.ts` | `window.tokiAPI` | 메인 윈도우 전용. `src/lib/preload-api.ts`의 `createTokiApi(ipcRenderer)`로 빌드 |
| `popout-preload.ts` | `window.popoutAPI` | 팝아웃 전용. 터미널/사이드바/에디터/프리뷰/참고자료 패널별 IPC 메서드 + `getType()`/`getRequestId()` |

타입 정의: `src/electron-api.d.ts` (~256줄)에서 `TokiAPI`와 `PopoutAPI` 인터페이스를 선언합니다.

### 1.3 렌더러

**메인 윈도우** (`src/main.ts` → `src/app/controller.ts`):
- Vue 3 + Pinia 아키텍처
- 파일 상태, UI 레이아웃, 탭, 에디터, 사이드바, 프리뷰, 터미널/채팅, 어시스턴트를 통합 관리
- Pinia 스토어: `src/stores/app-store.ts` — 앱 전체 공유 상태의 단일 소스

**팝아웃 윈도우** (`src/popout.ts` → `src/popout/controller.ts`):
- **Imperative TS/DOM** — Vue/Pinia를 사용하지 않고 `document.createElement` 기반 직접 DOM 조작
- 5가지 패널 타입: `terminal`, `sidebar`, `editor`, `preview`, `refs`
- 메인 렌더러와 동일한 공유 모듈 재사용 (chat-session, preview 등)

### 1.4 MCP 서버

```
main.ts (Electron 메인 프로세스)
  └─ startApiServer(deps) → src/lib/mcp-api-server.ts (HTTP API, ~9,200줄)
       ├─ deps.getCurrentData()로 메인 프로세스 인메모리 문서 상태 읽기/쓰기
       ├─ src/lib/mcp-tool-taxonomy.ts (19 패밀리, ~234줄)
       ├─ src/lib/mcp-response-envelope.ts (응답 포맷, ~176줄)
       └─ src/lib/mcp-search.ts (전문 검색, ~355줄)

toki-mcp-server.ts (별도 자식 프로세스, stdio transport, ~2,020줄)
  └─ HTTP 127.0.0.1:${TOKI_PORT}로 위 API에 연결
```

**`mcp-api-server.ts`** 는 `main.ts`가 `startApiServer(deps)`를 호출하여 Electron 메인 프로세스 안에서 실행하는 HTTP API 서버입니다. `deps.getCurrentData()`를 통해 메인 프로세스의 인메모리 문서 상태를 직접 읽고 수정합니다.

**`toki-mcp-server.ts`** 는 별도의 자식 프로세스로 생성되는 stdio MCP 서버입니다. AI CLI(Claude, Copilot 등)와 stdio로 통신하고, `127.0.0.1:${TOKI_PORT}` HTTP를 통해 위 API 서버에 도구 호출을 중계합니다.

도구 수와 패밀리 분류는 `mcp-tool-taxonomy.ts`가 단일 소스 오브 트루스(SSOT)로 관리하며, `ToolAnnotations`(readOnlyHint, destructiveHint 등)도 여기서 자동 패치됩니다.

---

## 2. 프로세스 경계와 import 방향 규칙

### 2.1 계층 간 금지된 import

```
main.ts (Node/Electron)  ←✗→  src/app/controller.ts (Renderer/Vue)
```

- **메인 프로세스**는 렌더러 코드를 직접 import하지 않습니다. 모든 통신은 IPC를 통합니다.
- **렌더러**는 Node.js API에 직접 접근하지 않습니다. `window.tokiAPI` / `window.popoutAPI`를 통해서만 메인 프로세스 기능에 접근합니다.
- **MCP HTTP API**(`mcp-api-server.ts`)는 메인 프로세스 안에서 실행되며, `deps.getCurrentData()`로 메인 프로세스의 인메모리 문서 상태를 직접 읽고 수정합니다(렌더러 상태가 아님). **MCP stdio 서버**(`toki-mcp-server.ts`)는 별도 자식 프로세스로, HTTP를 통해 위 API에 연결됩니다.

### 2.2 공유 모듈 경계

`src/lib/`의 모듈은 양쪽에서 사용될 수 있지만, 실제로는 명확한 소유 구분이 있습니다:

| 소유 계층 | 모듈 예시 |
|-----------|-----------|
| 메인 프로세스 전용 | `terminal-manager.ts`, `session-recovery-main.ts`, `main-state-store.ts`, `mcp-config.ts` |
| 렌더러 전용 | `layout-manager.ts`, `tab-manager.ts`, `sidebar-builder.ts`, `form-editor.ts`, `monaco-loader.ts` |
| 양쪽 공유 | `charx-io.ts`, `data-serializer.ts`, `section-parser.ts`, `document-validation.ts` |
| MCP 서버 전용 | `mcp-api-server.ts`, `mcp-tool-taxonomy.ts`, `mcp-response-envelope.ts`, `mcp-search.ts` |

### 2.3 컴파일 타겟

| tsconfig | 타겟 | 모듈 | 대상 파일 |
|----------|------|------|-----------|
| `tsconfig.electron.json` | ES2022 | CommonJS | `main.ts`, `preload.ts`, `popout-preload.ts`, 타입 선언 |
| `tsconfig.json` | ES2022 | ESNext (Bundler) | `src/**/*.ts`, `vite.config.ts`, `vitest.setup.ts` |
| `tsconfig.node-libs.json` | ES2022 | Node16 | `src/lib/` 선택 파일, `src/charx-io.ts` 등 (side-by-side JS 출력) |

Vite가 렌더러 번들을 빌드하고, `tsc`가 메인 프로세스 진입점과 공유 라이브러리를, esbuild가 프리로드와 MCP stdio 서버를 번들합니다. `src/lib/` 아래에 `.ts`와 `.js`가 나란히 존재하는 이유는 `build:node-libs`(`tsc`) 출력 때문입니다.

---

## 3. 주요 도메인

### 3.1 파일 포맷과 직렬화

| 모듈 | 줄 수 | 역할 |
|------|-------|------|
| `src/charx-io.ts` | ~1,030 | `.charx`, `.risum`, `.risup` 읽기/쓰기. ZIP/gzip/deflate 처리 |
| `src/lib/data-serializer.ts` | ~300 | 정규화된 JSON/바이너리 직렬화 |
| `src/lib/document-validation.ts` | ~90 | 문서 형태(shape) 검증 |
| `src/lib/risup-prompt-model.ts` | ~700 | `.risup` promptTemplate 파싱/모델 |
| `src/lib/section-parser.ts` | ~210 | Lua/CSS 섹션 파싱 (`===section===` 구문) |

### 3.2 프리뷰 시스템 (`.charx` 전용)

프리뷰는 RisuAI 렌더링 파이프라인을 포팅하여, CBS/정규식/로어북/Lua를 iframe 안에서 시뮬레이션합니다.

| 모듈 | 줄 수 | 역할 |
|------|-------|------|
| `src/lib/preview-engine.ts` | ~2,460 | CBS 토크나이저, 정규식, 로어북, Lua (Wasmoon) 실행 |
| `src/lib/preview-session.ts` | ~460 | 세션 수명 주기와 상태 관리 |
| `src/lib/preview-panel.ts` | ~380 | 프리뷰 패널 UI |
| `src/lib/preview-runtime.ts` | ~320 | 런타임 피드백 (에러/타임아웃 배너) |
| `src/lib/preview-format.ts` | ~290 | 출력 포맷 (MD/plaintext) |
| `src/lib/preview-debug.ts` | ~230 | 디버그 트레이스 뷰 |
| `src/lib/preview-sanitizer.ts` | ~140 | HTML/XSS 새니타이징 |

프리뷰는 `.charx`에서만 동작합니다. `.risum`/`.risup`가 열려 있으면 F5 및 메뉴 경로가 차단됩니다.

### 3.3 세션 복구와 자동 저장

| 모듈 | 위치 | 역할 |
|------|------|------|
| `autosave-manager.ts` | 메인 | IPC 자동 저장 핸들러, `.toki-recovery.json` sidecar 기록 |
| `settings-handlers.ts` | 렌더러 (`src/app/`) | 자동 저장 타이머 폴링 (렌더러 측 `setInterval`) |
| `session-recovery.ts` | 공유 | 복구 데이터 모델 및 직렬화 |
| `session-recovery-main.ts` | 메인 | 메인 프로세스 복구 후크 (대기 중인 복구 기록 추적) |
| `session-recovery-manager.ts` | 메인 | 복구 후보 평가 및 복원/무시 결정 흐름 (`main.ts`에서 초기화) |
| `session-recovery-controller.ts` | 렌더러 (`src/app/`) | 복구 UI 오케스트레이션 |
| `backup-store.ts` | 렌더러 | 인메모리 직렬화 상태 캐시 (탭별 되돌리기용) |

복구 흐름: 시작 시 `get-pending-session-recovery` IPC → 복구 후보 발견 시 사용자에게 `자동 저장 복원` / `원본 열기` / `무시` 제안 → 복원 시 `[자동복원]` 배지 표시.

### 3.4 어시스턴트 통합

| 모듈 | 줄 수 | 역할 |
|------|-------|------|
| `assistant-prompt.ts` | ~280 | Claude/Copilot/Codex/Gemini용 부트스트랩 프롬프트 조립 |
| `assistant-launch.ts` | ~70 | 어시스턴트 프로세스 실행 |
| `agents-md-manager.ts` | ~220 | 런타임 `AGENTS.md` 동적 생성 |
| `copilot-agent-profile-manager.ts` | ~220 | `.github/agents/*.agent.md` 프로필 동기화 |
| `pluni-persona.ts` | ~270 | 플루니 페르소나 모드 데이터 |

### 3.5 터미널과 채팅

| 모듈 | 줄 수 | 역할 |
|------|-------|------|
| `terminal-manager.ts` | ~170 | PTY/셸 서브프로세스 관리 (메인 프로세스) |
| `terminal-shell.ts` | ~80 | 셸 감지 (cmd/PowerShell/bash) |
| `terminal-ui.ts` | ~380 | xterm.js 렌더러 UI |
| `terminal-session-context.ts` | ~240 | 터미널 CWD와 세션 상태 |
| `terminal-chat.ts` | ~280 | TUI 출력 정리, 번호 선택지 파싱 |
| `chat-session.ts` | ~330 | 채팅 메시지 히스토리 상태 머신 |

### 3.6 에디터, 레이아웃, 사이드바

| 모듈 | 줄 수 | 역할 |
|------|-------|------|
| `form-editor.ts` | ~1,270 | CharX/Risum/RISUP 공용 폼 UI |
| `layout-manager.ts` | ~360 | 슬롯 기반 패널 레이아웃 |
| `tab-manager.ts` | ~240 | 탭 수명 주기 (생성/닫기/더티 상태) |
| `sidebar-builder.ts` | ~280 | 사이드바 트리 구성 |
| `sidebar-actions.ts` | ~570 | 사이드바 항목 조작 |
| `sidebar-refs.ts` | ~700 | 참고 자료 패널 |

### 3.7 에셋과 미디어

| 모듈 | 줄 수 | 역할 |
|------|-------|------|
| `asset-manager.ts` | ~510 | 에셋 카탈로그 CRUD |
| `asset-runtime.ts` | ~40 | 에셋 URL 해석 |
| `image-compressor.ts` | ~270 | WebP 압축 |
| `avatar-ui.ts` | ~300 | 아바타 표시/애니메이션 |

---

## 4. 대형 모듈 핫스팟

아래는 프로젝트에서 가장 큰 파일들로, 향후 분해/리팩터링의 우선 후보입니다.

| 모듈 | 줄 수 | 핫스팟 이유 |
|------|-------|-------------|
| **`src/lib/mcp-api-server.ts`** | **~9,200** | 120개 HTTP 도구 엔드포인트를 단일 파일에 보유. 프로젝트 최대 파일 (정확한 수는 `mcp-tool-taxonomy.ts` SSOT 참조) |
| **`src/app/controller.ts`** | **~2,930** | 메인 윈도우의 모든 상태·UI·통합을 단일 오케스트레이터가 관리 |
| **`src/lib/preview-engine.ts`** | **~2,460** | CBS/정규식/로어북/Lua 렌더링 파이프라인 전체를 포함 |
| **`toki-mcp-server.ts`** | **~2,020** | stdio MCP 서버 + 도구 등록 + Danbooru 태그 검증 |
| **`main.ts`** | **~1,340** | IPC 채널 등록, 파일 I/O, 윈도우 관리가 집중 |
| **`src/lib/form-editor.ts`** | **~1,270** | 3종 파일 타입 공용 폼 편집기 |
| **`src/charx-io.ts`** | **~1,030** | 3종 파일 포맷 직렬화/역직렬화 |
| `src/lib/sidebar-refs.ts` | ~700 | 참고 자료 패널 빌더 |
| `src/lib/risup-prompt-model.ts` | ~700 | RISUP promptTemplate 파싱 |
| `src/lib/risup-prompt-editor.ts` | ~690 | RISUP 프롬프트 편집기 |
| `src/lib/lorebook-io.ts` | ~660 | 로어북 내보내기/가져오기 |
| `src/lib/sidebar-actions.ts` | ~570 | 사이드바 항목 조작 |
| `src/lib/help-popup.ts` | ~570 | 도움말/문법 참조 오버레이 |
| `src/lib/trigger-script-model.ts` | ~540 | 트리거 스크립트 파싱 |

### 핫스팟 처리 원칙

이 문서는 현재 상태를 있는 그대로 기록합니다. 분해나 리팩터링은 별도 작업으로 진행하되, 다음 원칙을 따릅니다:

1. **`src/lib/` 추출 우선**: 컨트롤러에 새 비즈니스 로직을 추가하기 전에, 재사용 가능한 동작을 `src/lib/`의 작은 모듈로 먼저 추출합니다.
2. **도구 패밀리 단위 분리**: `mcp-api-server.ts`를 분해할 때는 `mcp-tool-taxonomy.ts`의 19개 패밀리를 자연스러운 분할 경계로 사용합니다.
3. **테스트 먼저**: `.test.ts` 파일이 옆에 있는 모듈은 그 테스트가 실행 가능한 행위 사양입니다. 분해 시 기존 테스트가 깨지지 않도록 합니다.

---

## 5. 데이터 흐름

### 5.1 파일 편집

```
렌더러                          메인 프로세스
─────────                       ─────────────
window.tokiAPI.openFile()  ──►  ipcMain('open-file')
                                  ├─ dialog.showOpenDialog()
                                  ├─ charx-io.openCharx/openRisum/openRisup()
                                  └─ 정규화된 CharxData 반환 ──►  controller.ts
                                                                  ├─ 탭/사이드바/에디터 상태 구성
                                                                  └─ Pinia 스토어 갱신
```

### 5.2 MCP 도구 호출

```
AI CLI (Claude/Copilot/...)
  └─ stdio ──► toki-mcp-server.ts (별도 자식 프로세스, MCP 프로토콜 파싱)
                └─ HTTP 127.0.0.1:${TOKI_PORT} ──► mcp-api-server.ts (메인 프로세스 내 도구 라우팅)
                              ├─ 읽기 도구: deps.getCurrentData()로 메인 프로세스 인메모리 상태 읽기
                              ├─ 쓰기 도구: IPC 확인 팝업 ──► 렌더러 적용
                              └─ 응답: mcpSuccess/mcpError/mcpNoOp 엔벨로프
```

### 5.3 터미널 채팅

```
렌더러 터미널 입력
  └─ window.tokiAPI.terminalInput() ──► ipcMain → PTY stdin
PTY stdout
  └─ onTerminalData 콜백 ──► 렌더러
                              ├─ chat-session.ts (메시지 히스토리)
                              ├─ terminal-chat.ts (TUI 정리)
                              └─ chat-ui.ts (버블 렌더링)
```

### 5.4 프리뷰

```
렌더러에서 F5 또는 메뉴 클릭 (.charx만 가능)
  └─ preview-session.ts: 세션 초기화
       └─ preview-engine.ts: iframe 문서 생성
            ├─ CBS 파싱/평가 (cbs-parser.ts, cbs-evaluator.ts)
            ├─ 정규식 적용
            ├─ 로어북 데코레이터 매칭
            └─ Lua 트리거 실행 (Wasmoon)
       └─ preview-runtime.ts: 에러/타임아웃 인라인 배너
       └─ preview-debug.ts: 디버그 트레이스 뷰
```

---

## 6. 빌드 구조

```
vite.config.ts
  ├─ 메인 엔트리: index.html → src/main.ts (Vue 앱)
  ├─ 팝아웃 엔트리: popout.html → src/popout.ts
  ├─ 정적 에셋 복사: Monaco, xterm, wasmoon, 앱 이미지
  └─ 개발 서버: 127.0.0.1:5173

tsconfig.electron.json (tsc)
  └─ main.ts → 루트 main.js (CommonJS)

esbuild (build:preload)
  ├─ preload.ts → 루트 preload.js
  └─ popout-preload.ts → 루트 popout-preload.js

esbuild (build:mcp)
  └─ toki-mcp-server.ts → 루트 toki-mcp-server.js (CJS 번들)

tsconfig.node-libs.json (tsc, module: Node16)
  └─ src/lib/ 선택 파일, src/charx-io.ts 등 → .js 사이드바이사이드
```

`npm run build`는 `lint + typecheck + test + Electron 컴파일 + Vite 번들`을 순서대로 실행합니다.

---

## 7. 향후 변경을 위한 가드레일

1. **`src/lib/` 추출 우선**: 컨트롤러(`controller.ts`, `main.ts`)를 키우기 전에 재사용 가능한 로직을 `src/lib/`의 작은 모듈로 추출합니다.
2. **설정 경로 통일**: 영구 설정은 `app-settings.ts`를 통해 관리합니다. 렌더러 글로벌 변수를 임의로 만들지 않습니다.
3. **런타임 피드백 사용**: 사용자에게 보이는 런타임 실패는 `runtime-feedback.ts`로 표면화합니다. 침묵 폴백을 지양합니다.
4. **통합 계층 인식**: `main.ts`, `src/app/controller.ts`, `src/popout/controller.ts`는 통합 계층입니다. 새 비즈니스 로직은 작은 모듈에 먼저 배치합니다.
5. **IPC 타입 안전성**: 새 IPC 채널 추가 시 `src/electron-api.d.ts`에 타입을 먼저 선언합니다.
6. **MCP 도구 분류 동기화**: 도구 추가/삭제 시 `mcp-tool-taxonomy.ts`를 함께 갱신하고 `mcp-tool-taxonomy.test.ts`로 양방향 완전성을 검증합니다.
