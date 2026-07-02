# 작업 계획 2 — 워크플로 eval을 실측 replay 평가로 전환

> 실행 에이전트에게: 시작 전에 `AGENTS.md`를 읽고 `read_skill("project-workflow")`를 로드하세요.
> 이 문서는 작업 지시서입니다. 설계 결정은 아래에 고정되어 있으며, 변경이 필요하면 이유를 최종 요약에 기록하세요.

## 배경과 문제

`src/lib/mcp-agent-workflow-eval.test.ts`는 에이전트 워크플로 라우팅의 "측정 가능한 태스크 매트릭스"를 자처하지만, 실제로는 자기참조적입니다:

- `WORKFLOW_EVAL_TASKS` 픽스처의 metrics 필드(`routeCorrect: true`, `expectedFirstPassSuccess: true`, `wrongTargetIncidents: 0` 등)가 **하드코딩된 리터럴**입니다.
- `meets or exceeds the target workflow metrics` 테스트는 이 리터럴의 집계가 `TARGET_METRICS`를 넘는지 확인합니다. 즉 서버 동작이 아무리 퇴행해도, 누군가 픽스처를 수정하지 않는 한 실패할 수 없습니다.
- 유일한 실측 부분은 로컬 `risu/` 코퍼스 표면 검사인데, 이는 작성자 머신에만 존재하는 gitignored 파일에 의존하며 없으면 skip됩니다.

픽스처 매트릭스 자체는 설계 문서로서 가치가 있으므로 **유지**합니다. 목표는 선언된 route를 실제 MCP 서버에 대해 결정적으로 재생(replay)하고, metrics를 실행 결과에서 도출하는 실행 계층을 추가하는 것입니다.

## 재사용할 기존 인프라 (검증 완료)

| 자산                    | 위치                                                                                                                                                                                                 | 용도                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| MCP SDK 클라이언트 패턴 | `test/test-mcp-search-all.ts` (line ~639, ~4223: `Client` + `StdioClientTransport`로 빌드된 `toki-mcp-server.js` spawn, `buildChildEnv`로 `TOKI_PORT`/`TOKI_TOKEN`/`RISUTOKI_MCP_TOOL_PROFILE` 주입) | replay 실행 계층의 골격                            |
| HTTP 테스트 하네스      | `src/lib/mcp-api-test-harness.ts` (`startTestApiServer`)                                                                                                                                             | MCP 서버가 접속할 API 서버 기동                    |
| 헤드리스 standalone     | `src/lib/mcp-headless-server.ts`, `toki-mcp-server.js --standalone --allow-writes`                                                                                                                   | mutation 시나리오 (앱 confirm 팝업 없이 실행 가능) |
| synthetic 픽스처 생성   | `src/charx-io.ts`의 `saveCharx`/`saveRisum`/`saveRisup` (기존 테스트들이 사용)                                                                                                                       | `risu/` 코퍼스 의존 제거                           |

주의: `toki-mcp-server.js`는 `npm run build:mcp`(esbuild bundle)로 생성됩니다. replay는 vitest가 아니라 **`test/test-mcp-search-all.ts`와 같은 빌드-후 node 스크립트**로 작성하세요 (`npm run test:mcp` 패턴).

## 고정된 설계 결정

1. **MCP stdio 계층을 통과시킨다.** HTTP 직접 호출이 아니라 `tools/list` → `callTool` 경로로 실행해, 프로필 등록·facade 라우팅·envelope까지 검증 범위에 포함한다.
2. **파일명을 바꾸지 않는다.** `mcp-agent-workflow-eval.test.ts`라는 이름은 `AGENTS.md`, `README.md`, `docs/README.md`, `docs/MCP_TOOL_SURFACE.md`, `docs/MCP_WORKFLOW.md`, `skills/project-workflow/MCP_WORKFLOW.md`, `skills/using-mcp-tools/SKILL.md` 7곳에서 needle로 검사된다 (`keeps workflow eval references synchronized` 테스트). 기존 파일은 선언 매트릭스 + 문서 동기화 가드로 유지하고, replay는 새 파일로 추가한다.
3. **synthetic 픽스처만 사용한다.** `risu/` 로컬 코퍼스 테스트는 현행 유지하되, replay는 CI 어디서나 돌아야 하므로 테스트가 직접 생성한 `.charx`/`.risum`/`.risup`만 사용한다.
4. **mutation은 standalone + `--allow-writes`로 실행한다.** app-backed confirm(`askRendererConfirm`)은 앱 UI 전용이다. replay가 검증할 것은 preview→apply 계약이지 confirm 팝업이 아니다.
5. **순차 실행.** 포트·활성 문서·preview 토큰 충돌 방지를 위해 시나리오를 병렬화하지 않는다.

## 단계별 작업

### Phase A — 인프라 추출 (동작 무변경)

1. `test/test-mcp-search-all.ts`에서 클라이언트 헬퍼를 `test/mcp-test-client.ts`로 추출:
   - 서버 spawn + `buildChildEnv` + `Client`/`StdioClientTransport` 연결/종료
   - `callTool` 결과의 text-content JSON 파싱 (`extractTextContent` 참고)
   - standalone 모드 기동 옵션 (`--standalone`, `--file`, `--ref`, `--allow-writes`, `--tool-profile`)
   - 기존 `test-mcp-search-all.ts`는 추출된 모듈을 import하도록 변경. **동작 변화 없음을 `npm run test:mcp`로 확인.**
2. `test/workflow-eval-fixtures.ts`: 시나리오별 synthetic 아티팩트 팩토리 (임시 디렉터리에 생성, 종료 시 정리).

### Phase B — canonical 5개 시나리오 replay

`docs/MCP_TOOL_SURFACE.md`의 기존 eval 비교표와 1:1 대응하는 5개를 먼저 구현한다 (`test/run-workflow-eval-replay.ts`):

| 시나리오                          | 실행 내용                                                                              | 실측 판정                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Active/external/reference routing | facade-first로 spawn → `inspect_document`(session/external/reference) → `read_content` | 각 호출 성공 + 반환 내용이 픽스처 값과 일치                  |
| Batch vs single edit              | 로어북 3항목 배치 수정 (preview→apply)                                                 | 호출 횟수 상한, 최종 파일 상태 diff 일치                     |
| Stale-guard refresh/retry         | 의도적으로 낡은 guard로 apply → `409` 확인 → 재읽기 → 재시도 성공                      | 409 envelope 구조(`details.expected_*`), 재시도 후 최종 상태 |
| Dry-run-first destructive edit    | `manage_assets` preview→apply (WebP 압축 또는 delete)                                  | preview 없이 apply 시 거부되는지 + apply 후 상태             |
| No-file-open workflow             | 파일 없이 spawn → 오류 응답의 `next_actions` 확인 → `manage_file` open → 재시도 성공   | `No file open` 구조화 오류 + 복구 경로                       |

각 시나리오는 종료 후 파일을 다시 열어(별도 `openCharx` 등) **최종 아티팩트 상태를 독립 검증**한다.

### Phase C — 매트릭스 확장

- `WORKFLOW_EVAL_TASKS`의 각 task에 `execution` 분류를 추가한다: `'replayable'` | `'static'`(플러그인 v3 소스 스캔처럼 MCP 왕복이 아닌 것) | `'app-only'`(렌더러 의존).
- `replayable` task부터 read-only → guarded-edit → destructive 순으로 args builder를 붙여 replay 러너에 등록한다. task당 형태:

```ts
interface ReplayStep {
  stage: 'discover' | 'read' | 'search' | 'validate' | 'preview' | 'apply';
  tool: string;
  args: (ctx: ReplayContext) => Record<string, unknown>; // 이전 스텝 결과 참조 가능
  expect: (result: ParsedEnvelope, ctx: ReplayContext) => void;
}
```

- 전부를 한 번에 하지 않아도 된다. **커버리지 게이트**: replayable로 분류된 task의 replay 등록률을 테스트로 강제하고, 초기 임계값을 낮게 시작해(예: 0.4) 확장마다 올린다.

### Phase D — metrics 실측 전환

- `summarizeMetrics`가 참조하는 하드코딩 필드를 제거하거나 `declaredMetrics`로 개명하고, replay 결과에서 도출한 `measuredMetrics`를 별도 산출한다:
  - `routeCorrect`: 선언된 모든 tool이 해당 프로필의 `tools/list`에 존재하고 호출이 4xx/5xx 없이 완료
  - `firstPassSuccess`: 재시도 없이 전체 스텝 완료 (stale-guard 시나리오는 의도된 409 1회를 허용 예산으로 명시)
  - `wrongTargetIncidents`: guard 불일치·잘못된 target.kind 거부 발생 횟수
  - `validationCovered`: 마지막 validate 스텝 실행 및 통과
  - `boundedReadCovered`: 모든 read 응답의 `artifacts.byte_size` ≤ 계약 상한
- `TARGET_METRICS` 게이트는 **measured** 값에 적용한다. `docsSync`는 기존 needle 검사 그대로 유지.

### Phase E — 배선과 문서 동기화

- `package.json`: `"test:evals:replay": "npm run build:node-libs && npm run build:mcp && node test/run-workflow-eval-replay.js"` 추가. `npm test` 체인에는 넣지 않고 `test:evals` 안내와 CI에 별도 스텝으로 추가 (`.github/workflows/ci.yml`).
- `docs/MCP_TOOL_SURFACE.md`·`docs/MCP_WORKFLOW.md`·`skills/` 사본에서 "measurable task matrix" 서술을 "선언 매트릭스 + 실측 replay" 구조로 갱신. `npm run sync:skills` 실행.
- `docs/MODULE_MAP.md`에 새 test 모듈은 해당 없음(`src/lib` 외부)이지만, 새 `src/lib` 파일을 만들었다면 반드시 추가 (doc-drift가 강제).
- `CHANGELOG.md` Added 항목 + `package.json` **MINOR** bump.

## 수용 기준

1. **회귀 민감성 증명**: 임시로 facade 라우트 하나를 깨뜨렸을 때(예: `read_content`의 lorebook selector 라우팅 주석 처리) replay가 실패하는 것을 확인하고, 그 확인 과정을 최종 요약에 기록한다. 커밋에는 포함하지 않는다.
2. 하드코딩 metrics가 measured 값으로 대체되고, 게이트는 measured에 걸린다.
3. 로컬 전체 replay 실행 시간 < 90초.
4. `npm run lint && npm run typecheck && npm test && npm run test:evals` 전부 통과. doc-drift 테스트 통과.
5. `test-mcp-search-all.ts`는 헬퍼 추출 후에도 결과 동일.

## 알려진 함정

- preview 토큰은 1회용, 프로세스 메모리 보관, 10분 TTL. 서버 재시작 시 소멸 → 시나리오 간 서버를 재사용하지 말고 시나리오 단위로 spawn/종료 권장.
- `file_path`는 절대 경로 필수, `..` 세그먼트 거부.
- 24KB 바운디드 리드: 큰 픽스처를 만들면 truncation 메타데이터가 붙는다. truncation 자체를 검증하는 시나리오가 아니면 픽스처를 작게 유지.
- `validate_cbs`는 의도적으로 `mcpSuccess()` envelope 예외 (구조화 `summary` 객체 유지).
- 숨김 필드 정책(`personality`, `scenario` 등)을 우회하는 픽스처/검증을 만들지 말 것.
