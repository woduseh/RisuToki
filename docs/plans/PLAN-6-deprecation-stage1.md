# 작업 계획 6 — Deprecation Stage 1: facade가 커버하는 granular 라우트를 soft legacy로

> 실행 에이전트에게: 시작 전에 `AGENTS.md`를 읽고 `read_skill("project-workflow")`와 `read_skill("using-mcp-tools")`를 로드하세요.
> **선행 조건: PLAN-4 작업 4-C(contract baseline `--update`)와 PLAN-5(replay 커버리지)가 완료되어 있어야 합니다.** 강등의 근거가 replay 커버리지이고, 이 작업은 tools/list 메타데이터를 바꾸므로 baseline 재생성 경로가 필요합니다.

## 배경

`docs/MCP_TOOL_SURFACE.md`의 deprecation 단계 계약:

> Stage 1 — soft legacy: "Covered granular routes may move from `recommendation=advanced` to `recommendation=legacy` **after parity evidence exists**. … Only routes with facade parity, **eval coverage**, and migration docs can be marked soft legacy."

지금까지는 이 조건을 충족할 수 없었지만, facade parity 매트릭스(first-wave replacement matrix) + 실측 replay 커버리지가 갖춰지면서 Stage 1 진입이 가능해졌습니다. 실측 근거: `advanced-full` tools/list는 **203개 도구, ~273KB** (contract baseline 기록) — facade-first 13개/51KB의 5.4배로, 에이전트 컨텍스트 비용의 주범입니다. Stage 1은 그 축소(Stage 2–3)의 전제 작업입니다.

## 목표 / 비목표

- 목표: facade가 완전 커버하고 replay가 검증하는 granular 도구들의 `risutoki/recommendation` 메타데이터를 `advanced` → `legacy`로 전환하고, 문서·스킬·마이그레이션 노트를 동기화.
- 비목표: **도구 제거 금지. 프로필 멤버십 변경 금지. 도구 동작·스키마·응답 변경 금지.** Stage 1은 순수 메타데이터 + 문서 단계다. Stage 2(경고 문구)·Stage 3(제거 후보)은 이 계획의 범위 밖.

## 고정된 설계 결정

1. **강등 후보는 명시적 3중 조건으로 선정한다**: (a) first-wave 매트릭스에서 parity status가 "Implemented"이고 "Keep granular route when" 조건이 좁은 행, (b) PLAN-5 replay가 해당 facade 경로를 실측 커버, (c) 첫 파도 대상은 이미 문서가 legacy 후보로 명명한 것부터 — `load_guidance`, `session_status`, `list_references`, `probe_*`, `read_reference_*`/`list_reference_*`, facade가 커버하는 indexed mutation 변형들 (MCP_TOOL_SURFACE.md의 "Current legacy recommendations" 문단이 출발점).
2. **후보 목록을 코드로 고정한다**: `mcp-tool-taxonomy.ts`에 강등 목록을 하드코딩으로 흩뿌리지 말고, 각 도구 엔트리의 `recommendation` 필드를 바꾸되, 강등 근거(매트릭스 행 + replay 시나리오 id)를 이 계획 문서의 부록 표에 기록한다.
3. **by-id/identity/hash 안정 셀렉터 도구는 강등하지 않는다.** `docs/MCP_TOOL_SURFACE.md`가 "stable advanced routes, not legacy-only routes"로 명시한 `read/write/delete_*_by_id`·`by_identity`·`by_hash` 계열과 그 배치 변형은 `advanced` 유지.
4. **batch 도구는 보수적으로.** facade가 동등한 배치 의미론을 제공하지 않는 경우(문서의 known gaps: unsupported batch structured item editors 등) 해당 배치 도구는 `advanced` 유지.
5. 판단이 갈리는 도구는 강등하지 않고 부록 표에 "보류 + 사유"로 남긴다. 공격적 강등보다 정확한 강등이 우선.

## 단계별 작업

### 단계 1 — 후보 확정 (커밋 없음, 산출물: 부록 표)

`docs/MCP_TOOL_SURFACE.md`의 first-wave 매트릭스 각 행에 대해 {대상 granular 도구, parity 상태, 커버하는 replay 시나리오 id, 강등 여부, 사유}를 표로 작성해 이 문서 하단에 부록으로 추가한다. PLAN-5 완료 시점의 `test/workflow-eval-catalog.ts`를 근거 소스로 사용.

### 단계 2 — taxonomy 메타데이터 전환

- `src/lib/mcp-tool-taxonomy.ts`에서 확정 목록의 `recommendation`을 `legacy`로 변경.
- `src/lib/mcp-tool-taxonomy.test.ts`의 기대값 갱신. 이 테스트에는 recommendation 분포·특정 도구의 추천 등급을 검사하는 항목이 있으니 실측으로 확인.
- `node test/mcp-contract-baseline.js`가 tools/list 지문 불일치로 실패할 것 — **의도된 계약 변경**이므로 4-C의 `--update`로 재생성하고, 변경 요약(도구 수·바이트 변화)을 커밋 메시지와 CHANGELOG에 기록.

### 단계 3 — 문서·스킬 동기화

- `docs/MCP_TOOL_SURFACE.md`: "Current legacy recommendations" 문단 갱신, deprecation 표의 Stage 1 행에 "진입함(날짜)" 표기, 부록 표 링크.
- 마이그레이션 노트: 강등된 각 도구 → 대체 facade 경로 매핑을 first-wave 매트릭스가 이미 제공하므로, "Stage 1 진입 도구 목록 + 매트릭스 행 참조" 형태의 절을 추가 (전체 매핑 중복 서술 금지).
- `skills/using-mcp-tools/SKILL.md`·`TOOL_REFERENCE.md`에서 강등 도구를 예시로 쓰는 부분을 facade 경로로 교체, `npm run sync:skills`.
- `AGENTS.md` MCP quick rules에 영향 있으면 갱신 (아마 불필요 — facade-first 서술은 이미 맞음).
- doc-drift 테스트가 강제하는 needle들 확인: `npx vitest run src/lib/doc-drift.test.ts`.

### 단계 4 — 게이트 추가

재발 방지 테스트를 `mcp-tool-taxonomy.test.ts`에 추가: "legacy로 표기된 도구는 반드시 first-wave 매트릭스(또는 부록 표의 도구 목록)에 등장해야 한다" — 문서 없는 강등을 차단. 역방향(매트릭스 커버인데 advanced로 남은 것)은 강제하지 않는다 (결정 5의 보류 허용).

## 수용 기준

1. 강등 목록 전체가 부록 표에 근거(매트릭스 행 + replay 시나리오 id)와 함께 기록되어 있다.
2. `tools/list`에서 해당 도구들의 `_meta['risutoki/recommendation']`이 `legacy`이고, 그 외(이름·설명·스키마·프로필 멤버십·annotations)는 불변 — contract baseline 재생성 diff가 recommendation 필드 외 변화가 없음을 보여준다.
3. `npm run lint && npm run typecheck && npm test && npm run test:evals && npm run test:evals:replay && npm run test:mcp:contracts` 전부 통과.
4. CHANGELOG **MINOR** bump + "Deprecated" 섹션에 Stage 1 진입 도구 목록 기재 (Keep a Changelog의 Deprecated 분류 사용).

## 알려진 함정

- `advanced` 별칭·프로필 해석(`resolveToolSurfaceProfileName`)은 recommendation과 무관 — 건드릴 이유가 없다.
- `mcp-response-envelope.ts`의 `next_actions`가 강등 도구를 추천하는 곳이 있다 (`TOOL_NEXT_ACTIONS`, `FAMILY_NEXT_ACTIONS`). Stage 1에서 next_actions를 바꾸면 **응답 계약이 변한다** — HTTP 응답 baseline까지 갱신 대상이 되므로, 이번 단계에서는 next_actions를 바꾸지 않고 부록에 "Stage 2 후보 작업"으로 기록만 한다.
- 강등이 assistant 부트스트랩 프롬프트(`assistant-prompt.ts`)와 충돌하지 않는지 확인 — 현재 프롬프트는 facade 13개만 가르치므로 영향 없어야 정상. drift 테스트가 이를 강제한다.
- static Vitest의 taxonomy 카운트 테스트들(50개 내외)이 분포 숫자를 검사할 수 있음 — 기대값 갱신은 "실측 후 정확히", 뭉뚱그린 `toBeGreaterThan` 완화 금지.

## 부록 — 강등 결정 표 (2026-07-03 완료)

실행 결과(2026-07-03): taxonomy의 51개 `legacy` metadata는 이 작업 전에 이미 HEAD에 존재했다. 이번 작업은 그 상태를 새 강등으로 포장하지 않고, first-wave 매트릭스·35개 replayable task·12개 canonical scenario의 근거와 일치시키는 문서/게이트 정합화다. measured replay는 12/12 scenarios, 35/35 tasks, 29,521ms로 통과했고 `routeAccuracy`, `firstPassSuccess`, `validationCoverage`, `boundedReadCoverage`는 모두 1.0, `wrongTargetIncidents`는 0이었다.

`load_guidance`는 granular 강등이 아니라 기존 compatibility facade 예외다. 나머지 50개가 Stage-1 granular inventory다.

| granular 도구                            | 매트릭스 행                                                   | replay 시나리오                                                      | 결정 (legacy / advanced 유지 / 보류) | 사유                                                                  |
| ---------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `batch_delete_lorebook`                  | Indexed lorebook mutation → `preview_edit` / `apply_edit`     | `batch-vs-single-edit`, `charx-facade-indexed-mutations`             | legacy 유지                          | Facade batch/delete workflow와 guard 경로가 실측됨                    |
| `batch_delete_risup_prompt_items`        | Indexed risup prompt mutation → `preview_edit` / `apply_edit` | `risup-facade-indexed-mutations`                                     | legacy 유지                          | Facade batch delete와 prompt guard 경로가 실측됨                      |
| `delete_greeting`                        | Indexed greeting mutation → `preview_edit` / `apply_edit`     | `charx-facade-indexed-mutations`                                     | legacy 유지                          | Greeting delete가 preview-token 흐름으로 실측됨                       |
| `delete_lorebook`                        | Indexed lorebook mutation → `preview_edit` / `apply_edit`     | `charx-facade-indexed-mutations`                                     | legacy 유지                          | Lorebook indexed mutation facade가 실측됨                             |
| `delete_regex`                           | Indexed regex mutation → `preview_edit` / `apply_edit`        | `charx-facade-indexed-mutations`                                     | legacy 유지                          | Regex delete가 preview-token 흐름으로 실측됨                          |
| `delete_risup_prompt_item`               | Indexed risup prompt mutation → `preview_edit` / `apply_edit` | `risup-facade-indexed-mutations`                                     | legacy 유지                          | Prompt delete가 preview-token 흐름으로 실측됨                         |
| `list_reference_css`                     | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `list_reference_greetings`               | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `list_reference_lorebook`                | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `list_reference_lua`                     | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `list_reference_regex`                   | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `list_reference_risup_prompt_items`      | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `list_reference_triggers`                | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `list_references`                        | Reference discovery → `inspect_document`                      | `active-external-reference-routing`, `no-file-open-workflow`         | legacy 유지                          | Bounded reference inventory와 no-file routing이 실측됨                |
| `load_guidance`                          | Profile/bootstrap compatibility facade                        | 해당 없음(정적 bootstrap 게이트)                                     | legacy 예외 유지                     | `list_skills` / `read_skill` 위임용 기존 facade; granular 강등 아님   |
| `probe_css`                              | External trigger/Lua/CSS reads → `read_content`               | `charx-facade-indexed-mutations`                                     | legacy 유지                          | External CSS list/item read가 실측됨                                  |
| `probe_field`                            | External field reads → `read_content`                         | `active-external-reference-routing`                                  | legacy 유지                          | Bounded external field routing이 실측됨                               |
| `probe_field_batch`                      | External field reads → `read_content`                         | `active-external-reference-routing`                                  | legacy 유지                          | Multi-selector external field routing이 실측됨                        |
| `probe_greetings`                        | External structured reads → `read_content`                    | `charx-facade-indexed-mutations`                                     | legacy 유지                          | External greeting list/item read가 실측됨                             |
| `probe_lorebook`                         | External structured reads → `read_content`                    | `charx-facade-indexed-mutations`                                     | legacy 유지                          | External lorebook item read가 실측됨                                  |
| `probe_lua`                              | External trigger/Lua/CSS reads → `read_content`               | `charx-facade-indexed-mutations`                                     | legacy 유지                          | External Lua list/item read가 실측됨                                  |
| `probe_regex`                            | External structured reads → `read_content`                    | `charx-facade-indexed-mutations`                                     | legacy 유지                          | External regex list/item read가 실측됨                                |
| `probe_risup_formating_order`            | External risup reads → `read_content` / validation            | `risup-facade-indexed-mutations`, `risup-formatting-order-authoring` | legacy 유지                          | Prompt/order facade read와 전용 검증 경로가 실측됨                    |
| `probe_risup_prompt_items`               | External risup prompt reads → `read_content`                  | `risup-facade-indexed-mutations`                                     | legacy 유지                          | External prompt list/item read가 실측됨                               |
| `probe_triggers`                         | External trigger/Lua/CSS reads → `read_content`               | `charx-facade-indexed-mutations`                                     | legacy 유지                          | External trigger list/item read가 실측됨                              |
| `read_reference_css`                     | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `read_reference_css_batch`               | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + batch selector contract 게이트        |
| `read_reference_field`                   | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference field facade read가 직접 실측됨                             |
| `read_reference_field_batch`             | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + batch selector contract 게이트        |
| `read_reference_field_range`             | Covered reference reads → bounded `read_content`              | `active-external-reference-routing`                                  | legacy 유지                          | Bounded reference routing 실측 + range contract 게이트                |
| `read_reference_greeting`                | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `read_reference_greeting_batch`          | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + batch selector contract 게이트        |
| `read_reference_lorebook`                | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `read_reference_lorebook_batch`          | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + batch selector contract 게이트        |
| `read_reference_lua`                     | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `read_reference_lua_batch`               | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + batch selector contract 게이트        |
| `read_reference_regex`                   | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `read_reference_regex_batch`             | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + batch selector contract 게이트        |
| `read_reference_risup_formating_order`   | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + risup selector contract 게이트        |
| `read_reference_risup_prompt_item`       | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + prompt selector contract 게이트       |
| `read_reference_risup_prompt_item_batch` | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + batch prompt selector contract 게이트 |
| `read_reference_trigger`                 | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + selector contract 게이트              |
| `read_reference_trigger_batch`           | Covered reference reads → `read_content`                      | `active-external-reference-routing`                                  | legacy 유지                          | Reference target routing 실측 + batch selector contract 게이트        |
| `reorder_risup_prompt_items`             | Risup add/reorder/import → `manage_items`                     | `risup-manage-items-workflows`                                       | legacy 유지                          | Stable-id/index reorder의 preview/apply가 실측됨                      |
| `session_status`                         | Session preflight → `inspect_document`                        | `active-external-reference-routing`, `no-file-open-workflow`         | legacy 유지                          | Session/no-file bounded facade 경로가 실측됨                          |
| `write_greeting`                         | Indexed greeting mutation → `preview_edit` / `apply_edit`     | `charx-facade-indexed-mutations`                                     | legacy 유지                          | Single/batch greeting write가 실측됨                                  |
| `write_lorebook`                         | Indexed lorebook mutation → `preview_edit` / `apply_edit`     | `batch-vs-single-edit`, `charx-facade-indexed-mutations`             | legacy 유지                          | Single lorebook write와 guarded replacement가 실측됨                  |
| `write_lorebook_batch`                   | Indexed lorebook mutation → `preview_edit` / `apply_edit`     | `batch-vs-single-edit`, `charx-facade-indexed-mutations`             | legacy 유지                          | Batch edit 계획/적용/검증이 실측됨                                    |
| `write_regex`                            | Indexed regex mutation → `preview_edit` / `apply_edit`        | `charx-facade-indexed-mutations`                                     | legacy 유지                          | Identity/index write와 충돌 guard가 실측됨                            |
| `write_risup_prompt_item`                | Indexed risup prompt mutation → `preview_edit` / `apply_edit` | `risup-facade-indexed-mutations`                                     | legacy 유지                          | Stable-id/index write가 실측됨                                        |
| `write_risup_prompt_item_batch`          | Indexed risup prompt mutation → `preview_edit` / `apply_edit` | `risup-facade-indexed-mutations`                                     | legacy 유지                          | Batch prompt write가 실측됨                                           |

### Advanced 유지 / 보류 결정

| 도구군                                                                                                                                                                                | 결정          | 사유                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `read/write/delete_lorebook_by_id`, `read/write/delete_regex_by_identity`, `read/write/delete_greeting_by_hash`, `read/write/delete_risup_prompt_item_by_id`와 by-id 배치/재정렬 변형 | advanced 유지 | Stable selector 자체가 안전한 정밀 escape hatch이므로 legacy-only 경로로 보지 않음 |
| Facade가 동등한 batch 의미론을 제공하지 않는 structured batch 도구                                                                                                                    | advanced 유지 | Batch 원자성·부분 실패·정확한 legacy payload가 first-wave 범위를 넘음              |
| External block replacement, cross-surface replacement, 비-artifact filesystem, raw hash/debug 경로                                                                                    | advanced 유지 | 문서의 known gaps에 해당                                                           |
| `mcp-response-envelope.ts`의 legacy `next_actions`                                                                                                                                    | Stage 2 보류  | Stage 1에서 바꾸면 HTTP 응답 계약까지 변하므로 metadata/documentation 범위를 넘음  |
