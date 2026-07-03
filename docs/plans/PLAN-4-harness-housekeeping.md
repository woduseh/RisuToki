# 작업 계획 4 — 하네스 하우스키핑 (closeout 커밋 · 테스트 격리 · baseline 갱신 경로 · toki 잔여 분리)

> 실행 에이전트에게: 시작 전에 `AGENTS.md`를 읽고 `read_skill("project-workflow")`를 로드하세요.
> 이 문서는 독립적인 소규모 작업 4건의 묶음입니다. **각 작업은 별도 커밋**이며, 순서대로 진행합니다. 작업 4-A는 코드 변경 없이 커밋만 합니다.

## 배경

PLAN-2(실측 replay)와 PLAN-3(모놀리스 분할)이 완료·검증된 상태입니다. 남은 것은 마무리 커밋과, 검증 과정에서 드러난 소규모 마찰 지점들입니다.

## 작업 4-A — 1.12.1 closeout 커밋

워킹트리에 PLAN-3 마무리 변경이 미커밋 상태로 남아 있습니다 (Codex 세션이 승인 쿼터 소진으로 중단됨).

**커밋에 포함할 것** (전부 검증 완료):

- `CHANGELOG.md` — 1.12.1 항목
- `package.json` — version 1.12.1
- `src/lib/mcp-facade-*.ts`, `src/lib/mcp-proxy-client.ts` — `import x = require(...)` → `import * as x from ...` 스타일 정리
- `src/lib/mcp-tool-taxonomy.test.ts` — 분할된 등록 모듈 스캔 반영
- `docs/plans/PLAN-2-3-execution-progress.md` — 진행 기록 마무리

**절대 스테이징하지 말 것** (사용자 소유 병행 작업):

- `risu/` 아래 모든 변경 (스킬 SKILL.md 수정들)
- `RisuToki_UIUX_개선정리.md` 삭제
- `Ludia_persona_draft.md` (untracked)
- `SKILLS_IMPROVEMENT_PLAN.md` (untracked, 진행 문서에 명시됨)

**절차**: `npm run lint && npm run typecheck && npm test && npm run test:evals:replay` 통과 확인 → 위 목록만 선택 스테이징(`git add` 파일 명시) → 커밋. 커밋 메시지 예: `chore: 1.12.1 closeout — module split release metadata and import cleanup`.

알려진 테스트 예외 2건은 실패해도 진행 가능: `MCP API skills routes > discovers the extracted built-in reference skills`(작업 4-B가 고치는 대상), `session_status integrity ...`(샌드박스 파일시스템 한정 mtime 정밀도 문제, Windows에서는 통과).

## 작업 4-B — skill-catalog 테스트를 사용자 스킬 작업에서 격리

**문제**: `src/lib/mcp-api-server.test.ts:2899` `discovers the extracted built-in reference skills`가 `startTestApiServer(createSearchFixture())`를 skillRoots 없이 호출합니다. 기본값이 `resolveSkillRootDirs(repo root)`라서 repo `skills/`뿐 아니라 **사용자 소유 `risu/**/skills`까지 스캔**하고, 기대값에 있는 `file-structure-reference`·`writing-danbooru-tags`는 실제로 `risu/common/skills`의 사용자 파일입니다. 사용자가 스킬 frontmatter를 수정할 때마다 이 테스트가 깨집니다.

**수정 방향 (고정)**: 테스트 전용 고정 픽스처를 만듭니다.

1. `test/fixtures/skill-roots/` 아래에 SKILL.md 3개를 가진 스킬 디렉터리를 생성 (`file-structure-reference`, `using-mcp-tools`, `writing-danbooru-tags` — 현재 기대값과 일치하는 최소 frontmatter: `name`, `tags`, `related_tools`).
2. 해당 테스트에서 `startTestApiServer(fixture, [], <픽스처 경로>)`로 skillRoots를 명시 주입 (세 번째 파라미터, `mcp-api-test-harness.ts`의 `skillRoots` 시그니처 참고. 단 이 테스트 파일은 자체 인라인 하네스를 쓰므로 그쪽 시그니처 확인).
3. 같은 파일의 `MCP API structured error envelopes — skills routes` describe(line ~5177)와 `agent eval: allows skill catalog...`(line ~4829)도 repo 스킬 실물에 의존하는지 확인하고, 의존하면 같은 픽스처로 전환.

**하지 말 것**: `resolveSkillRootDirs`의 프로덕션 동작 변경. 문제는 테스트 결합이지 스킬 해석이 아닙니다.

**검증**: `npx vitest run src/lib/mcp-api-server.test.ts -t "skills"` 통과 + `risu/common/skills/file-structure-reference/SKILL.md`의 tags를 임시로 바꿔도 테스트가 계속 통과하는지 확인(확인 후 원복).

## 작업 4-C — contract baseline 재생성 경로 추가

**문제**: `test/mcp-contract-baseline.ts`는 `--print-case`(개별 케이스 덤프)만 있고, **의도적 계약 변경 시 baseline을 갱신하는 공식 경로가 없습니다**. 다음에 도구 설명이나 응답 필드를 정당하게 바꾸는 순간(예: PLAN-6 deprecation 메타데이터 변경) 수동 JSON 편집이라는 마찰이 생깁니다.

**수정 방향 (고정)**:

1. `--update` 플래그 추가: 현재 지문을 캡처해 `test/fixtures/mcp-module-split-contract.json`을 다시 쓰고, 변경된 항목(프로필/케이스 id와 바이트 수 변화)을 요약 출력한 뒤 **non-zero로 종료하지 않고** 성공 종료.
2. 갱신은 의도적 행위임을 강제: `--update` 없이 불일치가 나면 지금처럼 실패하되, 오류 메시지에 "계약 변경이 의도된 것이면 `node test/mcp-contract-baseline.js --update`로 재생성하고, 변경 요약을 CHANGELOG에 기록하라"를 안내.
3. `package.json`에 `"test:mcp:contracts:update"` 스크립트 추가 (빌드 선행 포함, 기존 `test:mcp:contracts` 패턴).
4. `docs/MODULE_MAP.md`는 test/ 파일이라 해당 없음. 대신 `docs/MCP_TOOL_SURFACE.md`의 test/eval 레퍼런스 문단에 contract baseline과 갱신 절차 한 줄 추가.

## 작업 4-D — toki-mcp-server.ts 잔여 분리 (선택적 마무리 슬라이스)

PLAN-3의 목표(<5,000줄)는 달성했지만(현재 4,023줄), 두 덩어리가 남아 있습니다. **PLAN-3의 슬라이스 프로토콜과 불변 조건을 그대로 적용**합니다 (이동만, 1슬라이스=1커밋, contract baseline·replay·doc-drift 검증, MODULE_MAP 갱신).

1. **Danbooru 태그 엔진** (~75–570줄: `DanbooruTag`/`TagValidationResult` 타입, 태그 DB 로드/캐시, levenshtein, 검색/인기/온라인 검증, `buildDanbooruGuide`) → `src/lib/mcp-danbooru-engine.ts`. 순수 로직이라 리스크 낮음.
2. **granular 도구 등록 블록** (현재 toki에 남은 `registerMcpTool` 호출 192개) → PLAN-3 표 1-10의 잔여분: `src/lib/mcp-tool-register-{fields,authoring,reference,risup}.ts` 등 패밀리 단위로. **등록 순서를 바꾸지 않는다** — `tools/list` 순서가 계약의 일부이며 contract baseline이 이를 감지한다.

완료 후 진입점 목표: toki-mcp-server.ts ≤ 1,500줄 (부트스트랩 + 등록 오케스트레이션 + 런타임 헬스만 잔류).

## 버전/체인지로그 규칙

- 4-A는 이미 1.12.1에 포함된 마무리이므로 추가 bump 없음.
- 4-B·4-C·4-D를 이어서 진행하면 완료 시점에 **PATCH 1회**(1.12.2) + CHANGELOG(Fixed: 테스트 격리 / Added: baseline 갱신 경로 / Changed: 내부 모듈 분리 계속) 항목으로 묶는다.

## 수용 기준

1. 워킹트리가 사용자 소유 변경만 남기고 깨끗해진다 (4-A).
2. `risu/` 스킬 frontmatter를 수정해도 mcp-api-server.test.ts가 깨지지 않는다 (4-B).
3. `--update`로 baseline 재생성이 한 명령으로 되고, 무단 불일치는 여전히 실패한다 (4-C).
4. toki-mcp-server.ts ≤ 1,500줄, contract baseline·canonical replay·전체 테스트 통과 (4-D).
