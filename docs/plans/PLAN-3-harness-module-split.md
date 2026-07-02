# 작업 계획 3 — 하네스 모놀리스 분할 (mcp-api-server.ts / toki-mcp-server.ts)

> 실행 에이전트에게: 시작 전에 `AGENTS.md`를 읽고 `read_skill("project-workflow")`를 로드하세요.
> 이 작업은 **동작 무변경 순수 리팩터링**입니다. 기능 개선·정리·리네이밍 유혹이 생기면 별도 이슈로 기록만 하고 진행하세요.

## 배경

- `src/lib/mcp-api-server.ts` ≈ 15,200줄: Electron main에서 도는 HTTP API 서버. 라우트 대부분이 단일 파일의 거대 if-체인에 인라인.
- `toki-mcp-server.ts` ≈ 16,900줄: stdio MCP 프록시. 도구 설명 상수, zod 스키마, facade preview 스토어/라우팅, HTTP 클라이언트, standalone 부트스트랩이 모두 인라인.
- 이미 성공한 추출 패턴이 존재: `mcp-asset-routes.ts`, `mcp-cbs-routes.ts`, `mcp-probe-routes.ts`, `mcp-session-routes.ts`, `mcp-surface-routes.ts` — 각각 `handleXxxRoute(req, res, parts, url, deps): Promise<boolean>` 형태로 분리되어 메인 파일이 순서대로 위임.
- `toki-mcp-server.js`는 `build/build-mcp.js`의 **esbuild bundle**(entryPoint: `toki-mcp-server.ts`, bundle: true)로 생성되므로, TS 모듈을 아무리 쪼개도 배포 산출물은 단일 파일 그대로다. 런타임 영향 없음 (검증 완료).

## 목표 / 비목표

- 목표: 두 파일과 새로 추출되는 모든 프로덕션 모듈을 각각 5,000줄 미만으로. 슬라이스 단위로 항상 green 유지. 리뷰 가능한 커밋 크기.
- 비목표: 응답 shape·도구 계약·이름 변경, 성능 개선, 신규 기능, 죽은 코드 제거(별도 기록만).

## 절대 불변 조건

1. **HTTP 응답 동일성**: 응답 JSON의 키 순서까지 유지한다. `JSON.stringify` 직렬화 순서가 클라이언트에 그대로 노출되므로, 객체 리터럴을 옮길 때 프로퍼티 순서를 바꾸지 않는다.
2. **`tools/list` 불변**: 도구 이름, 설명 문자열, `_meta`(family/profiles/staleGuardDetails/…), annotations가 바이트 단위로 동일해야 한다. `src/lib/mcp-tool-taxonomy.test.ts`의 양방향 완전성 검사(taxonomy ↔ 등록 도구)가 이를 일부 강제한다.
3. **export 시그니처 유지**: `startApiServer`, `McpApiDeps`, `McpApiServer`, `McpSessionStatus` 등 기존 import 지점(`mcp-headless-server.ts`, `mcp-api-test-harness.ts`, `main.ts` 계열)이 깨지지 않아야 한다.
4. **문서 동기화**: 새 모듈은 현재 doc-drift가 재귀 탐색하지 않으므로 `src/lib` 직하의 평면 파일로 만들고 `docs/MODULE_MAP.md`에 반드시 추가한다.
5. **빌드 검증**: 두 진입점이 import하는 새 모듈은 TypeScript가 전이 컴파일한다. `tsconfig.node-libs.json`에 파일별 중복 열거하지 않고 `npm run build:node-libs`로 `.js` 사이드카 생성을 검증한다.

## 슬라이스 프로토콜 (모든 슬라이스 공통, 엄격 준수)

1. 대상 블록의 실제 라인 범위를 grep으로 실측한다 (이 문서의 추정치를 믿지 말 것).
2. 새 모듈로 **이동만** 한다 (수정 금지). 원본은 import로 대체.
3. 검증: `npm run lint` → `npx tsc -p tsconfig.node-libs.json --noEmit` → 관련 vitest 파일 → `src/lib/doc-drift.test.ts`.
4. `docs/MODULE_MAP.md` 갱신.
5. 커밋. **1 슬라이스 = 1 커밋.** 커밋 메시지에 이동한 심볼 목록을 적는다.
6. 큰 슬라이스(≥1,500줄) 후에는 `npm run test:mcp`(빌드 포함 스모크)까지 실행.

## Part 1 — toki-mcp-server.ts (선행 권장: 결합도 낮고 리스크 작음)

| 순서  | 슬라이스               | 새 모듈                                                                  | 내용 · 근거                                                                                                                                                                                                                                                                                              |
| ----- | ---------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-1   | 도구 설명 상수         | `src/lib/mcp-tool-descriptions.ts`                                       | 파일 후반부(~13,200줄 이후)에 몰려 있는 긴 설명 문자열 상수들. 순수 데이터라 가장 안전. `tools/list` 바이트 동일성만 확인하면 됨                                                                                                                                                                         |
| 1-2   | facade 공용 런타임     | `src/lib/mcp-facade-runtime.ts`                                          | `facadePreviewStore`/`manageItemsPreviewStore`/`manageAssetsPreviewStore`/`manageFilePreviewStore` 4종 스토어, `cleanupFacadePreviews`, `stableJson`, `operationDigest` 계열, `makePreviewToken`, `sameTarget`, `route`, `selectorTarget`, `facadeApiError`, `FACADE_PREVIEW_TTL_MS` (~960–1,120줄 부근) |
| 1-3   | HTTP 프록시 클라이언트 | `src/lib/mcp-proxy-client.ts`                                            | `apiRequest`와 그 진단 훅(`logProcessDiagnostic`, `noteRuntimeError`, `mcpLog`, `byteLengthForDiagnostic`) (~835–950줄 부근). 진단 상태가 모듈 전역이면 초기화 함수로 주입 형태 유지                                                                                                                     |
| 1-4   | standalone 부트스트랩  | `src/lib/toki-standalone-bootstrap.ts`                                   | argv 파싱(`getConfiguredToolProfile`, `getStandaloneAllowWrites`, `getStandaloneUserDataPath`), `--standalone` 기동 경로 (~16,700줄 이후). `mcp-headless-server.ts` 호출부 포함                                                                                                                          |
| 1-5   | facade content         | `src/lib/mcp-facade-content.ts`                                          | bounded read/search/analyze, active/external/reference selector routing                                                                                                                                                                                                                                  |
| 1-6   | facade script/style    | `src/lib/mcp-facade-script-style.ts`                                     | trigger/Lua/CSS active·external read/preview/apply                                                                                                                                                                                                                                                       |
| 1-7   | facade items           | `src/lib/mcp-facade-items.ts`                                            | `.risup` prompt와 `manage_items` 계획·실행                                                                                                                                                                                                                                                               |
| 1-8   | facade assets/files    | `src/lib/mcp-facade-assets.ts`, `src/lib/mcp-facade-files.ts`            | `manage_assets`와 `manage_file` 계획·실행. 각각 별도 슬라이스                                                                                                                                                                                                                                            |
| 1-9   | facade validation/edit | `src/lib/mcp-facade-validation.ts`, `src/lib/mcp-facade-edit.ts`         | validate 및 preview/apply orchestration                                                                                                                                                                                                                                                                  |
| 1-10+ | 패밀리별 도구 등록     | `src/lib/mcp-tool-register-{facade,fields,authoring,reference,risup}.ts` | 등록 순서를 유지한 채 `registerXxxTools(server, deps)` 함수로 분리. 한 번에 한 패밀리씩 이동                                                                                                                                                                                                             |

facade 실행 엔진(~1,400–12,300줄)을 위 모듈로 먼저 분리하지 않으면 5,000줄 목표를 달성할 수 없다. 등록 블록만 옮기는 것으로 완료 처리하지 않는다.

## Part 2 — mcp-api-server.ts

기존 `handleXxxRoute` 패턴을 그대로 따른다. 시그니처 예시는 `mcp-probe-routes.ts` 참고.

| 순서 | 슬라이스               | 새 모듈                                 | 비고                                                                                                                                                                                                                                 |
| ---- | ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2-1  | 공용 헬퍼              | `src/lib/mcp-api-helpers.ts`            | JSON pointer 유틸(`parseJsonPointer`, `assertSafePointerToken` 등 — 프로토타입 오염 가드 로직 변경 금지), `buildFieldInventory`, `fileStatMetadata`, `build*ListResponse` 계열 중 여러 라우트가 공유하는 것. 라우트 분리의 전제 조건 |
| 2-2  | lorebook 라우트        | `src/lib/mcp-lorebook-routes.ts`        | 가장 큰 패밀리로 추정 (by-id/batch/replace/diff/validate 포함)                                                                                                                                                                       |
| 2-3  | risup-prompt 라우트    | `src/lib/mcp-risup-prompt-routes.ts`    | 스니펫 사이드카 포함                                                                                                                                                                                                                 |
| 2-4  | regex·greeting·trigger | `src/lib/mcp-structured-item-routes.ts` | 파일이 여전히 크면 3개로 분할                                                                                                                                                                                                        |
| 2-5  | lua·css 섹션 라우트    | `src/lib/mcp-section-routes.ts`         | `luaCache`/`cssCache`는 `startApiServer` 클로저 소유 유지, deps로 전달                                                                                                                                                               |
| 2-6  | reference 라우트       | `src/lib/mcp-reference-routes.ts`       | 전부 read-only                                                                                                                                                                                                                       |
| 2-7  | external 라우트        | `src/lib/mcp-external-routes.ts`        | `resolveExternalDocumentRequest`는 2-1 또는 여기로                                                                                                                                                                                   |
| 2-8  | field·search·snapshot  | `src/lib/mcp-field-routes.ts`           | `fieldWriteMutex`, `fieldSnapshots`는 클로저 소유 유지                                                                                                                                                                               |

경계 주의: `startApiServer` 클로저가 소유한 상태(토큰, 캐시, mutex, 스냅샷 맵)는 모듈로 옮기지 말고 deps 객체로 전달한다. 기존 추출 모듈들이 쓰는 방식과 동일하게.

## 최종 검증

1. `npm run lint && npm run typecheck && npm test && npm run test:evals && npm run test:evals:replay`
2. 응답 동일성 스팟체크: 분할 시작 **전에** 대표 라우트 응답(각 패밀리 1개 이상: list/read/write/error 경로)을 `startTestApiServer` 기반 golden으로 저장한다. 토큰·시간·임시 경로 값만 기존 키 위치에서 sentinel로 치환하고 키 정렬 없이 raw JSON 순서를 비교한다. 네 프로필의 `tools/list`는 JSON 바이트 수와 SHA-256을 고정한다.
3. 스모크: `node toki-mcp-server.js --standalone --file <synthetic.charx>` → `tools/list` 카운트(facade-first 13개), `inspect_document`, `read_content` 왕복.
4. 최종 라인 수 보고: 두 파일 각각 5,000줄 미만이 목표. 미달 시 남은 슬라이스 목록을 기록.

## 프로젝트 규칙

- 버전: 시리즈 완료 시 **PATCH** 1회 bump + `CHANGELOG.md` Changed 항목 ("내부 모듈 분할, 동작 변화 없음" 명시). 슬라이스마다 bump하지 않는다.
- `docs/MODULE_MAP.md`와 실행 progress 문서는 슬라이스마다 갱신 (doc-drift 및 중단 복구).
- `AGENTS.md`·skills 문서는 도구 계약이 변하지 않으므로 수정 불필요 — 수정할 일이 생겼다면 불변 조건 위반 신호다.

## 알려진 함정

- `src/lib/*.js` 사이드카는 gitignored 빌드 산출물이다. 새 모듈의 `.js`가 없다는 이유로 커밋하지 말 것 (`npm run build:node-libs`가 생성).
- `mcp-api-server.test.ts`(~8,700줄)는 자체 인라인 하네스를 갖고 있어 harness 변경과 무관하게 동작한다. 분할 후에도 이 테스트가 최우선 안전망이므로 슬라이스마다 실행한다.
- vitest 실행이 느린 환경이면 `-t` 필터로 해당 패밀리 describe만 먼저 돌리고, 커밋 전에 파일 전체를 돌린다.
- 도구 설명 문자열(1-1)에는 백틱·`${}`가 포함된 것이 있다. 템플릿 리터럴이 아닌 일반 문자열로 유지되는지 이동 후 확인.
