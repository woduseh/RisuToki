# 열린 문서의 MCP 읽기 성능

2026-09-05, 3.6.3 변경 측정 기록이에요. 구현 전 작업 상태는 commit
`9a1755397fdb10f78236b0ba35dfca464464826e` 위의 기존 사용자 변경 31개 경로를 포함해요.
기준 코드는 수정 전에 별도 번들로 보관했으며, 기존 사용자 변경을 제거한 HEAD와 비교하지 않았어요.

## 병목과 변경

실제 `read_content`는 활성 문서의 여러 필드를 `/field/batch`로 읽고, 검색은
`/field/:name/search` 또는 `/search-all`을 사용해요. 모두 HTTP POST예요.
이전 서버는 모든 활성 문서 POST에서 승인 대기 중 변경을 탐지하기 위한
`serialize(currentData)`와 SHA-256을 실행했어요. 이 세 읽기는 승인을 요청하지 않으므로
그 결과가 사용되지 않았지만, 이미지 에셋까지 복사하고 해시했어요.

64MiB 에셋 조건의 별도 CPU 프로파일에서 총 5,013개의 self sample 중
4,628개(92.3%)가 crypto `update`, V8 `_writeHostObject`, `serialize`에 잡혔어요.
프로파일링 실행의 시간은 아래 성능 수치에 포함하지 않았어요.

`mcp-field-routes.ts`의 실제 읽기 dispatcher와 `mcp-api-server.ts`의 스냅샷 정책이
동일한 matcher를 사용하도록 변경했어요. 세 읽기에서는 사용하지 않는 변경용 스냅샷만
만들지 않아요. 다른 POST의 스냅샷 시점, 전체 문서 및 바이너리 해시, 승인 전후 비교는
유지해요. 읽기 경로가 승인을 요청하는 잘못된 라우팅은 거절해요.
인증, 요청 스키마, 숨김 필드 규칙, 검색 전체 일치 수, 응답 범위 제한은 그대로예요.
캐시, 동시성 변경, 새 의존성은 없어요.

## 측정 조건

- Windows x64, Node v24.14.0, AMD Ryzen 7 7800X3D.
- 합성 CCv3 문서를 실제 정규화 함수로 로드하고, 실제 MCP HTTP 서버에 localhost 요청을 보내요.
  문자 설명 256줄, 로어북 200개, 인사말 2개이며 텍스트는 모든 조건에서 같아요.
- 에셋은 1MiB Buffer 0·16·64개예요. 열린 문서의 메모리 상태를 재현하므로 ZIP 파일 읽기,
  압축해제, 이미지 디코딩 시간은 포함하지 않아요. 실제 사용자 파일은 읽지 않았어요.
- 하나의 keep-alive 연결, 순차 요청, 첫 요청 별도 기록 후 3회 워밍업을 수행해요.
  매 실행에서 9회 표본 × 표본당 5회 요청을 측정하고, GC는 표본 시작 전 타이밍 밖에서 실행해요.
- 변경 전 → 변경 후 → 변경 후 → 변경 전 순서의 독립 프로세스 4개로 재측정했어요.
  아래 수치는 구현별 18개 표본의 요청당 평균 시간에 대한 중앙값(최소–최대)이에요.
  각 구현·시나리오·에셋 조건당 측정 요청은 90회예요. p95 개별 요청 지연시간은 아니에요.
- 첫 요청은 서버 준비 후 요청 시간이며 프로세스 시작·파일 시스템 cold cache 측정이 아니에요.
  실제 timing 중에는 다른 테스트나 빌드를 실행하지 않았어요.

## 결과

단위는 ms예요.

| 에셋 MiB | 요청              | 변경 전 중앙값 (최소–최대) | 변경 후 중앙값 (최소–최대) |
| -------: | ----------------- | -------------------------: | -------------------------: |
|        0 | batch-read        |        0.832 (0.756–1.101) |        0.498 (0.452–0.656) |
|        0 | field-search      |        0.698 (0.641–0.811) |        0.381 (0.351–0.437) |
|        0 | search-all        |        0.840 (0.770–0.956) |        0.517 (0.431–0.569) |
|        0 | range-get-control |        0.311 (0.279–0.375) |        0.298 (0.285–0.344) |
|       16 | batch-read        |     12.203 (11.764–13.913) |        0.435 (0.407–0.530) |
|       16 | field-search      |     12.450 (11.776–14.094) |        0.350 (0.329–0.402) |
|       16 | search-all        |     11.943 (11.816–13.364) |        0.437 (0.423–0.494) |
|       16 | range-get-control |        0.284 (0.275–0.403) |        0.279 (0.270–0.327) |
|       64 | batch-read        |     47.559 (46.410–50.593) |        0.406 (0.393–0.458) |
|       64 | field-search      |     47.099 (46.266–52.673) |        0.332 (0.319–0.380) |
|       64 | search-all        |     48.245 (46.802–50.572) |        0.448 (0.407–0.541) |
|       64 | range-get-control |        0.311 (0.263–0.386) |        0.285 (0.253–0.388) |

64MiB 조건에서 대상 POST의 중앙값은 99.1–99.3% 감소했어요.
변경하지 않은 GET 대조군은 범위가 겹치므로 속도 개선으로 주장하지 않아요.
모든 12개 조건에서 4회 실행의 응답 SHA-256과 응답 길이가 같았고,
각 실행 내의 모든 응답도 원문 문자열로 비교해 같음을 확인했어요.

메모리 로그의 `externalDeltaBytes`는 표본 종료 시 external-memory 차이예요.
64MiB 검색에서는 변경 전 약 67.36MB, 변경 후 중앙값 0이 관찰됐지만,
이 값은 GC와 버퍼 생명주기의 영향을 받으며 최대 RSS나 메모리 절감량이 아니에요.
Windows의 짧은 구간 CPU 시간은 여러 표본에서 0으로 양자화돼 CPU 개선율을 제시하지 않아요.
관측된 지연시간, CPU 프로파일, 읽기에서 V8 직렬화를 호출하지 않는 회귀 테스트를 근거로 삼아요.

## 재현

저장소 루트에서 기존 의존성을 사용해요. 비교할 때는 최적화 전 소스로 첫 번들을 만들고
보존한 뒤 최적화 후 소스로 두 번째 번들을 만들어야 해요. 현재 작업 공간에는 두 번들과
원시 JSON, 로그, CPU 프로파일이 `.build/performance/` 아래에 남아 있어요.
현재 작업 공간에서 재측정할 때는 보관한 `reads-before.cjs`를 그대로 사용해요.
현재 소스로 다시 만들면 변경 전 기준이 덮어써지므로 아래 첫 빌드 명령은 생략해야 해요.

```powershell
# 소스 변경 전 한 번 실행
npx --no-install esbuild test/benchmark-mcp-reads.ts --bundle --platform=node --packages=external --outfile=.build/performance/reads-before.cjs

# 소스 변경 후 실행
npx --no-install esbuild test/benchmark-mcp-reads.ts --bundle --platform=node --packages=external --outfile=.build/performance/reads-after.cjs

node --expose-gc .build/performance/reads-before.cjs --output=.build/performance/reads-before.json
node --expose-gc .build/performance/reads-after.cjs --output=.build/performance/reads-after.json
node --expose-gc .build/performance/reads-after.cjs --output=.build/performance/reads-after-repeat.json
node --expose-gc .build/performance/reads-before.cjs --output=.build/performance/reads-before-repeat.json

# 별도 원인 확인; 프로파일러를 켠 결과는 timing 비교에서 제외
node --cpu-prof --cpu-prof-dir=.build/performance --cpu-prof-name=reads-before.cpuprofile --expose-gc .build/performance/reads-before.cjs --asset-mib=64
```

Windows에서 esbuild의 자식 프로세스가 제한된다면 설치된 실행 파일을 직접 호출할 수 있어요:
`& node_modules/@esbuild/win32-x64/esbuild.exe` 뒤에 위와 같은 빌드 인수를 사용해요.
`--samples`, `--iterations`, `--warmup`, `--asset-mib`로 조건을 지정할 수 있고,
비교 실행에는 동일 값을 사용해야 해요. 런타임과 의존성도 같아야 해요.

## 검증과 보류 후보

수정 전 quick 검증의 lint·Vue/Electron/Node 타입 검사는 통과했어요.
샌드박스에서 테스트 시작이 `spawn EPERM`으로 막혀 로컬 실행 권한을 확장한 뒤,
기존 unit 2,248개 통과·3개 건너뜀, tooling 16개 통과를 확인했어요.

수정 후 `npm run validate:full`의 16단계가 모두 통과했어요.
unit 153파일에서 2,256개 통과·3개 건너뜀, tooling 16개 통과,
MCP 통합 테스트·워크플로 replay·계약 검사(4 profiles, 18 HTTP cases),
renderer/Electron 빌드를 완료했어요. 별도 benchmark TypeScript 타입 검사도 통과했어요.
전체 검증 기록은 `.build/validation/2026-09-05T05-31-10-128Z-4782677a/report.json`에 있어요.

새 회귀 테스트는 세 문서 형식의 읽기·검색, 인증 실패, 잘못된 입력, 숨김 필드 접근,
승인 거절, 정상 쓰기, 승인 대기 중 같은 크기의 에셋 바이트 변경을 확인해요.
관련 명령은 다음과 같아요.

```powershell
npm run test:unit -- src/lib/mcp-field-read-cost.test.ts src/lib/mcp-search-routes.test.ts src/lib/mcp-field-routes.test.ts src/lib/mcp-confirmation-race.test.ts
npm run validate:full
```

효과가 없어 되돌린 성능 실험은 없어요. 다음 후보는 코드 조사 단계에서 보류했어요.

- 외부 에셋 목록 조회: 전체 바이너리 JSON 전달과 파일 3회 로드가 보여요.
  전용 metadata 경로는 유력하지만 asset digest와 오류 계약을 포함한 별도 검증이 필요해요.
- 프로젝트 폴더 열기: 임시 ZIP 재압축·재로딩 경로가 있어요. 직접 로더는 알 수 없는 ZIP 항목,
  경로 안전성, 외부 변경 baseline까지 보존해야 하므로 변경 범위가 더 커요.
- 편집 시 탭 재렌더와 에셋 목록 IPC 중복: 실제 Chromium·Electron 입력 지연시간은 측정하지 않았고,
  controller 등 기존 사용자 변경과 겹쳐 이번 구현에서 보류했어요.

이 결과는 이미 열린 문서의 세 MCP HTTP 읽기 경로에 한정돼요.
MCP stdio 왕복·모델 응답·GUI 입력·파일 열기·저장·다중 클라이언트 처리량의 개선 수치는 없어요.
캐시나 디스크 I/O 개선을 주장하지 않으며 배포·push·릴리스는 실행하지 않았어요.
