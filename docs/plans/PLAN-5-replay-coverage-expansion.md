# 작업 계획 5 — replay 커버리지 확장 (canonical 5 → 패밀리 전면)

> 실행 에이전트에게: 시작 전에 `AGENTS.md`를 읽고 `read_skill("project-workflow")`를 로드하세요.
> PLAN-2가 구축한 replay 인프라 위에서의 확장 작업입니다. 러너 아키텍처를 바꾸지 말고 시나리오를 추가하세요.

## 배경 (현재 상태, 실측)

- `test/workflow-eval-catalog.ts`: 39개 태스크, `execution` 분류 `replayable: 35 / static: 4 / app-only: 0`.
- `test/run-workflow-eval-replay.ts`: canonical 시나리오 5개 등록, 전체 실행 ~12초, measured metrics 전부 1.0.
- `src/lib/mcp-agent-workflow-eval.test.ts:116`의 floor 테스트가 `replayScenarioIds` 고유 수 == 5를 고정 — **시나리오를 추가하면 이 테스트도 함께 올려야 한다.**
- 러너 요약 JSON의 `coverage.replayableRegistrationRatio`가 현재 5/35 ≈ 0.14.
- 아직 replay가 건드리지 않는 대표 영역: `.charx`의 greetings/regex/triggers/Lua/CSS 편집, `.risup`의 formating order·스니펫·import/export·diff, `.risum` 전체(메타데이터·에셋·모듈 토글), `manage_file`의 프로젝트 폴더 추출/재조립, `analyze_content`·`validate_content`의 read-only 오퍼레이션 대부분.

## 목표 / 비목표

- 목표: replayable 35개 태스크의 등록률을 단계적으로 100%까지. 각 시나리오는 실제 도구 왕복 + 최종 아티팩트 독립 검증.
- 비목표: 러너 구조 변경, 병렬화, LLM-in-the-loop, `static` 4개(plugin-v3)의 replay화, 새 MCP 도구.

## 고정된 설계 결정

1. **PLAN-2의 결정을 계승한다**: stdio 계층 통과, synthetic 픽스처 전용, mutation은 standalone `--allow-writes`, 순차 실행, 시나리오 단위 spawn/종료.
2. **태스크당 하나의 시나리오**를 원칙으로 하되, 같은 픽스처·같은 도구 체인을 공유하는 인접 태스크는 하나의 시나리오에 복수 `replayScenarioIds`로 묶을 수 있다 (이미 카탈로그가 배열을 지원).
3. **floor는 단계 완료마다 올린다.** floor 테스트와 러너 커버리지 게이트를 같은 커밋에서 함께 갱신해, floor가 실제 등록 수보다 낮게 방치되지 않게 한다.
4. **실행 시간 예산 90초.** 초과가 예상되면 시나리오를 줄이지 말고 픽스처를 작게 유지하고 프로필 spawn을 시나리오 그룹 단위로 공유하는 것을 검토하되, preview 토큰·활성 문서 오염이 없는 read-only 그룹에만 허용한다.

## 단계별 작업

각 단계 = 1 커밋 + floor 상향 + `npm run test:evals:replay` 통과.

### 단계 1 — read-only 전면 (floor 5 → ~14)

가장 안전한 것부터. 대상 태스크(카탈로그에서 `editRisk: 'read-only'`인 replayable 전부):

- `.charx` greetings/regex/triggers/Lua/CSS의 `read_content` selector 라우팅 (family별 목록→개별 읽기)
- `search_document` active/external/reference 경로
- `analyze_content`: `field_stats`, `token_count`, `simulate_lorebook`, `test_regex`, CBS/diff 계열
- `validate_content`: lorebook/regex/CBS/Lua 컴파일 진단
- `.risum` 메타데이터·`lowLevelAccess`·모듈 표면 읽기 (synthetic `.risum` 픽스처 필요 — `workflow-eval-fixtures.ts`에 `saveRisum` 기반 팩토리 추가)

판정: 응답 성공 + 반환 내용이 픽스처 값과 일치 + `byte_size` ≤ 상한.

### 단계 2 — guarded-edit (floor → ~26)

- `.charx` greetings/regex/triggers/Lua/CSS의 preview→apply 편집 (stale guard 값 왕복 포함)
- `manage_items`: lorebook/regex/greeting/trigger add·reorder, `.risup` prompt add·stable-id reorder·스니펫 save/insert
- `.risup` formating order 편집, import(dry_run→apply), diff 검증
- 각 시나리오는 의도된 guard 거부 1회를 포함할 수 있다 (`expectedRejection` 사용, PLAN-2 패턴).

판정: apply 후 파일을 독립적으로 다시 열어 최종 상태 비교. 편집 전 상태와의 diff가 선언된 변경과 정확히 일치.

### 단계 3 — destructive + 파일 워크플로 (floor → 35)

- delete 계열: lorebook/regex/greeting/trigger/prompt-item/에셋 삭제 (preview 필수 경로 확인 포함)
- `manage_assets`: `.charx`·`.risum` add/rename/delete/compress (compress는 결과가 환경 의존적일 수 있으므로 "원본 보존 or 축소" 계약만 판정)
- `manage_file`: snapshot/restore, field export, lorebook import/export, **프로젝트 폴더 추출→재조립 왕복** (추출 후 재조립 파일을 열어 원본과 구조 비교)

### 단계 4 — 마무리

- floor 테스트를 `replayable 태스크 전부 등록`으로 전환 (고정 숫자 대신 `replayableTasks.length`와 비교).
- `docs/MCP_TOOL_SURFACE.md`·`docs/MCP_WORKFLOW.md`·skills 사본의 replay 서술 갱신 + `npm run sync:skills`.
- CHANGELOG + **MINOR** bump.

## 수용 기준

1. `coverage.replayableRegistrationRatio` == 1.0, floor 테스트가 이를 강제.
2. 전체 replay < 90초 (요약 JSON `durationMs`로 확인, 최종 수치를 완료 보고에 기록).
3. 각 단계에서 회귀 민감성 스팟 확인 1회: 해당 단계가 커버하는 라우트 하나를 번들에서 임시 파괴 → replay 실패 확인 → 복원 (커밋에 미포함, 보고에 기록).
4. `npm run lint && npm run typecheck && npm test && npm run test:evals && npm run test:evals:replay` 전부 통과.

## 알려진 함정 (PLAN-2에서 계승 + 추가)

- preview 토큰 1회용·10분 TTL·프로세스 메모리. 시나리오 간 서버 재사용 금지가 기본.
- `.risum` 픽스처: `cjs`는 reserved/hidden, `mcpUrl`은 read-only — 이 필드를 편집 시나리오에 넣지 말 것.
- 숨김 필드 정책(`personality`, `scenario` 등) 우회 검증 금지.
- greetings 중 group-only는 hash mutation 보호 대상 — guarded-edit 시나리오에서 alternate만 다룰 것.
- `validate_cbs`는 envelope 예외(구조화 summary 유지) — 판정 로직에서 `mcpSuccess` 형태를 가정하지 말 것.
- 배치 실패는 non-atomic (`applied`/`failed_operation`/`remaining_count`) — 의도적 부분 실패 시나리오를 넣는다면 재검사·재preview 경로까지 판정.
