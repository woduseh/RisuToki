# 작업 계획 7 — mcp-api-server.test.ts 분할과 공유 하네스 이전

> 실행 에이전트에게: 시작 전에 `AGENTS.md`를 읽고 `read_skill("project-workflow")`를 로드하세요.
> 프로덕션 분할(PLAN-3)의 후속입니다. **테스트 의미론 무변경** — 어서션을 고치거나 완화하지 말고 파일 위치와 하네스만 바꿉니다. 지금이 가장 안전한 시점입니다: contract baseline과 replay가 회귀 안전망으로 존재합니다.

## 배경 (실측)

- `src/lib/mcp-api-server.test.ts` **8,762줄** — 코드베이스 최대 파일. 프로덕션 라우트는 PLAN-3에서 패밀리별 모듈로 분할됐지만 테스트는 모놀리스 그대로.
- 이 파일은 **자체 인라인 하네스**(line ~15–470: no-op Lua/CSS 파서 스텁 + 자체 `startTestApiServer`)를 갖고 있다. 공유 하네스 `src/lib/mcp-api-test-harness.ts`는 **프로덕션 파서를 기본값**으로 쓴다 — 이 차이가 이전 시 유일한 함정.
- `npm run test:evals`가 이 파일을 `-t "agent eval"` 필터로 실행한다. "agent eval" 이름의 테스트들이 내부에 있다 (line ~4829, ~5411, describe ~6560, ~6772).
- 알려진 외부 실패 2건: skills-catalog 테스트(PLAN-4 4-B가 해결), `session_status integrity` mtime(샌드박스 한정).

## 목표 / 비목표

- 목표: 파일을 프로덕션 모듈 경계를 따라 분할하고 인라인 하네스를 제거해 공유 하네스로 통일. 모든 테스트는 이름·어서션·개수 불변.
- 비목표: 어서션 변경, 커버리지 축소, 새 테스트 작성(발견한 공백은 기록만), 공유 하네스의 동작 변경.

## 절대 불변 조건

1. **테스트 개수 보존**: 분할 전 `npx vitest run src/lib/mcp-api-server.test.ts --reporter=json`으로 테스트 id 목록을 덤프해 두고, 분할 후 전체 신규 파일들의 합집합과 비교한다. 이름 변경도 금지 (`-t` 필터 호환).
2. **`npm run test:evals` 호환**: "agent eval" 테스트가 어느 파일로 가든 `test:evals` 스크립트의 파일 목록에 그 파일이 포함되어야 한다. 스크립트 갱신 시 CHANGELOG에 기록.
3. **파서 의미론 보존**: 인라인 하네스의 기본 파서는 no-op 스텁이었다. 공유 하네스 기본값은 실제 파서다. **스텁 기본값에 의존하던 테스트는 이전 시 명시적 override로 스텁을 주입**해 의미를 보존한다 — 어느 쪽인지 애매하면 테스트를 바꾸지 말고 override를 넣는 쪽을 택한다.
4. doc-drift의 MODULE_MAP coverage는 `.test.ts`를 제외하는지 착수 시 확인하고, 포함한다면 새 테스트 파일도 MODULE_MAP에 추가.

## 분할 매핑 (describe → 새 파일)

기존 describe 블록(총 25개 내외, 실측 후 조정)을 프로덕션 모듈에 대응시킨다:

| 새 테스트 파일                       | 가져올 describe (라인은 참고용, 실측할 것)                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp-search-routes.test.ts`          | `MCP API search routes` (~516)                                                                                                                           |
| `mcp-surface-routes.api.test.ts`     | `MCP API surface routes` (~639) — 기존 `mcp-surface-routes.test.ts`가 있으면 병합하지 말고 별도 파일 유지                                                |
| `mcp-external-routes.test.ts`        | `external unopened-file routes` (~846), `external file probe routes` (~5438)                                                                             |
| `mcp-lorebook-routes.test.ts`        | lorebook folder mutations/reads, compatibility fields, lorebook read/diff/mutation envelopes (~1091, ~1322, ~2614, ~4216, ~4390)                         |
| `mcp-risup-prompt-routes.test.ts`    | risup prompt-item routes, stable IDs, reorder/formating-order envelopes (~1352, ~2306, ~5095, ~5145)                                                     |
| `mcp-skills-routes.test.ts`          | skills routes + skills 오류 envelope (~2694, ~5177)                                                                                                      |
| `mcp-structured-item-routes.test.ts` | regex/greeting 오류 envelope, insert-regex-field (~3031, ~3080, ~3258)                                                                                   |
| `mcp-section-routes.test.ts`         | lua-section/css-section 오류 envelope (~3104, ~3278)                                                                                                     |
| `mcp-field-routes.test.ts`           | field 오류 envelope (~3437)                                                                                                                              |
| `mcp-reference-routes.test.ts`       | reference 오류 envelope (~4071)                                                                                                                          |
| `mcp-api-server.test.ts` (잔류)      | 전역 가드(~4798), open-file(~5243), success envelope(~5780), session/integrity, **agent eval describe 전부** — 서버 전체를 관통하는 통합 테스트만 남긴다 |

파일명이 기존 `*-routes.test.ts`와 충돌하는 경우(`mcp-asset-routes.test.ts`처럼 이미 존재) 접미사를 달리해 **기존 파일을 건드리지 않는다**.

## 슬라이스 프로토콜

1 파일 = 1 커밋. 각 커밋마다:

1. describe 블록을 새 파일로 이동. 새 파일은 **공유 하네스**(`mcp-api-test-harness.ts`)를 import.
2. 이동한 테스트가 인라인 하네스의 스텁 파서·특수 override에 의존했는지 해당 테스트 본문과 인라인 하네스 diff로 확인 → 필요한 override를 명시 주입 (불변 조건 3).
3. `npx vitest run <새 파일> src/lib/mcp-api-server.test.ts` — 이동분과 잔여분 동시 green.
4. 테스트 id 합집합 비교 스크립트 실행 (불변 조건 1).
5. 커밋 (메시지에 이동한 describe 목록).

마지막 슬라이스에서 인라인 하네스 잔여물을 제거하고 잔류 테스트도 공유 하네스로 전환 — 이때 4-B(skills 픽스처)와의 충돌이 없는지 확인.

## 마무리

- `package.json`의 `test:evals` 파일 목록 갱신 (agent eval 테스트가 잔류 파일에 있으므로 아마 불변 — 확인만).
- 테스트 실행 시간 비교: 분할 전/후 `npm run test:unit` 소요 시간을 보고에 기록 (vitest는 파일 단위 병렬이므로 단축 기대).
- CHANGELOG **PATCH** bump ("Changed: MCP API 서버 테스트를 라우트 모듈 경계로 분할, 공유 하네스로 통일").
- 발견한 커버리지 공백(있다면)은 이 문서에 부록으로 기록만 하고 구현하지 않는다.

## 수용 기준

1. 테스트 id 합집합이 분할 전과 동일 (스킵/실패 상태 포함).
2. 인라인 하네스 코드가 완전히 제거되고 모든 파일이 공유 하네스를 사용.
3. 잔류 `mcp-api-server.test.ts` ≤ 2,000줄, 새 테스트 파일 각 ≤ 2,500줄.
4. `npm run lint && npm run typecheck && npm test && npm run test:evals` 통과 (알려진 외부 실패 2건 제외 — PLAN-4 이후라면 mtime 1건만).

## 알려진 함정

- 인라인 하네스와 공유 하네스는 `TestDepsOverrides` 시그니처가 미묘하게 다를 수 있다 — 착수 시 두 시그니처를 diff해서 부족한 override 파라미터가 있으면 **공유 하네스에 additive로 추가**한다 (기존 사용처 불변).
- describe 간 상태 공유(모듈 스코프 픽스처·`beforeAll`)가 있는 블록은 통째로 같은 파일에 옮긴다. 쪼개면 순서 의존이 드러나며 깨진다.
- vitest 파일 병렬 실행으로 이전에 없던 포트/tmp 디렉터리 경합이 생길 수 있다 — 새 파일들이 `MCP_API_TEST_DIR` 하위에 파일별 고유 서브디렉터리를 쓰는지 확인.
- `test/_mcp-api-server-tmp` 정리 로직이 파일별로 중복 실행되어도 안전한지 확인 (동시 rm 경합).
