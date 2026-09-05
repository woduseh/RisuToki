# 편집·저장·프로젝트·MCP 데이터 무결성 감사

2026-09-05 · 3.4.2

## 범위와 판정 기준

모든 재현은 메모리 fixture 또는 `os.tmpdir()` 아래 생성한 합성 CHARX/RISUM/RISUP과 프로젝트 폴더를 사용한다. 사용자 카드와 로컬 `risu/` corpus를 검증 입력으로 사용하지 않는다. 이전 3.4.1 리팩토링은 작업 트리에 보존했다.

압축 파일 전체 바이트는 왕복 동등성 기준이 아니다. 포맷을 다시 해석한 필드·배열 순서·활성 상태·확장 객체와 개별 ZIP/모듈 에셋의 이름·내용 바이트를 비교한다. 암호화 nonce, 압축 결과, ZIP 헤더 차이는 의미 손실이 아니다. 아래 허용 목록 외의 원본 필드 삭제를 정상화로 취급하지 않는다. 외부 덮어쓰기 감지용 SHA256은 이 의미 비교와 별개인 동시성 보호다.

## 기존 소유권과 보호 장치

- main 프로세스의 `currentData`가 파일 I/O와 MCP의 활성 문서다. UI에는 아직 main에 반영되지 않은 초안이 있을 수 있다. UI 전체 스냅샷과 MCP 부분 갱신을 동일한 소유권으로 간주하면 안 된다.
- `charx-io.ts`가 포맷 저장 정책을 소유한다. 프로젝트는 JSON·manifest의 Markdown override·에셋 파일에서 재조립한다. 별도의 원본 JSON을 그대로 복사하는 방식으로 정상화 정책을 우회하지 않는다.
- 기존 `atomic-write.ts`의 같은 디렉터리 임시 파일+rename을 재사용한다. 프로젝트 내보내기도 이 경계를 사용한다.
- MCP에는 이미 preview token, operation digest, 1회 소비, family별 stale guard, 승인 경계가 있다. 기존 `/surfaces`의 document hash와 `/session/status`의 활성 경로를 private token에 결합했다. 새 공개 revision API는 추가하지 않았다.
- 기존 복구는 비정상 종료 기록과 autosave/sidecar/source의 일치 검사를 사용한다. 정상 종료·무시·명시적 저장의 기존 정책은 유지한다.

## 재현된 실패와 수정

| 경로                         | 재현된 문제                                                                | 수정 및 회귀 근거                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| CHARX 열기→저장→재열기       | 알 수 없는 ZIP 항목·중첩/불투명 x_meta·카드 전용 trigger 소실              | `_zipEntries` 및 기존 카드/모듈 변환 경로에서 보존. `src/charx-io-preservation.test.ts`            |
| CHARX 로어북                 | `enabled=false`가 true로 바뀌고 위치·확률·깊이·ID·확장 필드 소실           | 로어북 변환에서 실제 매핑 외 필드와 활성/삽입 설정 보존. 같은 테스트에서 두 번 저장 검증           |
| RISUM/RISUP                  | RISUM `mcp` 확장, RISUP envelope 확장·MessagePack binary 소실              | unknown subtree와 바이너리를 보존하고 허용 목록만 제거. gzip/zlib/raw 모드 검증                    |
| 프로젝트 왕복                | 오래된 `module.json`이 새 편집을 되돌림; 삭제한 greeting Markdown이 부활   | 새 모듈을 항상 반영하고 줄어든 관리 greeting 제거. `src/lib/folder-workspace.test.ts`              |
| 프로젝트 에셋                | 누락된 0번 에셋을 빼고 1번을 0번으로 당김                                  | 누락은 오류로 중단. 바이너리 인덱스를 재배치하지 않음                                              |
| 프로젝트 unknown ZIP         | Markdown·숨김 파일 누락 또는 제어파일 이름 충돌                            | 별도 `.risutoki/charx-extra-entries.zip`에 원래 이름·바이트 보존. marker와 내용 fingerprint에 포함 |
| 외부 폴더 변경               | 과거 UI/MCP 스냅샷이 새 JSON·텍스트·바이너리를 덮음                        | load 시 관리 파일 내용 fingerprint를 보관하고 save 직전 비교                                       |
| UI 비동기 작업               | 저장 응답·raw sync·reload 중 생긴 편집의 dirty 상태가 지워지거나 초안 교체 | 응답 후 현재 문서·내용 재검사. 문서 교체 ID가 다른 renderer 저장은 main에서 거절                   |
| MCP 확인 대기                | 가드 확인 후 배열 정렬/삭제 또는 문서 교체 시 다른 항목 수정               | 요청 시작 문서 identity·경로·내용을 승인 전후 검사. `mcp-confirmation-race.test.ts`                |
| MCP preview→apply            | 같은 comment/type/짧은 preview를 가진 다른 항목을 구별하지 못함            | 기존 전체 문서 hash와 활성 경로를 token에 결합. edit/items/assets/file 회귀                        |
| standalone MCP               | 읽기 전용 세션 저장 가능; 실패한 open이 경로만 바꿈; save_current 무시     | 기존 write gate 적용, open 성공 후 상태 교체, 공통 save 경로 재사용                                |
| 일반/외부 파일 저장          | 열린 뒤 다른 writer가 바꾼 파일을 덮음                                     | 기존 file baseline을 저장 경계에서 검사하고 충돌 거절. 같은 size/mtime 내용 변경 포함              |
| 자동저장                     | 같은 초에 같은 이름을 사용; 복구 기록 실패가 완성된 autosave도 삭제        | timestamp+UUID 사용. 완성된 payload/sidecar는 기록 실패에도 보존하고 실패를 보고                   |
| 복구 적용                    | 기록 쓰기 실패를 알리기 전에 활성 문서를 이미 교체                         | 기록 저장 성공 후 문서 교체. `session-recovery-manager.test.ts`                                    |
| 파일 저장 실패→다음 실행     | 저장 실패 시 원본과 마지막 유효 autosave가 필요                            | 실제 합성 RISUP rename 실패 후 새 복구 관리자에서 후보 탐지·복원. `save-recovery-audit.test.ts`    |
| 프로젝트 다중 파일 저장 실패 | 앞 파일만 바뀌거나 에셋 디렉터리 삭제 후 실패                              | 저장 전 사본+원자적 checkpoint marker. 중단된 폴더의 load/save/export를 차단하고 사본 경로 제공    |

## 허용 목록: 정책상 제거와 정규화

제거 정책의 원본은 `src/lib/deprecated-save-policy.ts`와 `src/charx-io.ts`다.

| 대상                                | 허용하는 제거                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| CHARX `card.data`                   | `personality`, `scenario`, `system_prompt`, `nickname`, `source`, `group_only_greetings`              |
| CHARX `card.data.extensions.risuai` | `additionalText`, `license`, `virtualscript`                                                          |
| RISUM module, CHARX embedded module | `cjs`                                                                                                 |
| RISUP preset                        | `mainPrompt`, `jailbreak`, `globalNote`, `useInstructPrompt`, `instructChatTemplate`, `JinjaTemplate` |
| RISUP preset 민감정보               | 최상위 `openAIKey`, `proxyKey`                                                                        |

허용하는 구조 정규화:

- regex type 소문자화, `editrequest→editprocess`, `edittranslation→edittrans`, `in/out`와 `find/replace` 누락 alias 보충.
- CHARX 모듈 로어북/regex가 있는 경우 카드 미러 동기화. 카드 전용 trigger를 모듈 trigger로 옮기되 내용 보존.
- CHARX `modification_date` 갱신, 누락된 메타데이터·기본 배열/boolean 채움, 저장용 모듈 생성.
- 에셋 참조와 실제 local entry의 정합 조정. 참조되지 않은 실제 바이너리를 이 이유로 버리지 않는다.
- RISUP 누락 prompt ID/기본값 생성, envelope `pres→preset` 표준화. 원래 압축 모드는 유지.

알 수 없는 확장 필드·envelope 필드·ZIP 부가 항목 삭제는 허용 목록에 없다. CHARX 0바이트 ZIP 에셋은 기존 호환성 정책상 저장을 거절하며 원본을 유지한다. 이는 허용된 데이터 삭제가 아니다. RISUM 0바이트 에셋은 그대로 보존한다.

## 충돌 처리 정책

1. **UI와 main이 다른 문서:** renderer 전용 `_documentId`를 WeakMap으로 발급한다. reload/open으로 main 객체가 교체된 뒤 이전 스냅샷을 제출하면 저장하지 않는다. ID는 artifact에 저장되지 않는다. 초안을 보관한 뒤 현재 파일을 별도로 확인한다.
2. **UI와 MCP의 같은 문서 편집:** 단순 dirty 여부로 막지 않는다. renderer 내용과 main 내용을 비교해 미반영 UI 초안이 있을 때만 MCP 쓰기를 거절한다. 이미 반영된 MCP 변경으로 dirty인 상태는 후속 MCP 수정을 막지 않는다.
3. **stale MCP:** 충돌은 409, 읽기 전용 standalone 쓰기는 403이다. 토큰은 기존처럼 한 번 소비한다. 최신 상태를 읽고 새 preview를 만든다. 이전 index/comment가 계속 맞는다고 가정하지 않는다.
4. **디스크 변경:** 일반 저장·MCP 저장·현재 파일로 Save As·프로젝트 원본으로 내보내기에서 기준값이 다르면 덮어쓰지 않는다. 새 경로 저장 또는 다시 열어 병합한다. 충돌 상태에서 자동 재시도하지 않는다.
5. **저장 응답 중 새 UI 편집:** 제출한 내용과 현재 내용이 다르면 새 dirty 상태와 autosave를 남긴다. 저장 대화상자 중 활성 문서/프로젝트가 바뀌면 해당 저장을 취소한다. 닫기 저장도 최신 renderer 초안을 확인해서 사용한다.
6. **자동저장 정리:** sidecar의 source 경로가 일치하는 소유 파일만 지운다. 소유권을 확인할 수 없는 legacy autosave는 남긴다. 완성된 autosave의 기록 실패는 성공으로 숨기지 않는다.
7. **프로젝트 저장 중단:** sibling 사본의 모든 파일을 보존하고 `.risutoki-save-recovery.json`을 남긴다. 다음 실행에서 원래 폴더의 정상 open/save/export를 거절한다. 오류에 나온 사본을 별도 프로젝트로 열어 확인하고 새 폴더/파일로 복구한다. 부분 저장된 원본 위에 자동 복원하지 않는다. checkpoint에는 symlink를 포함할 수 없으며, 외부 링크 대상을 읽거나 수정하기 전에 저장을 거절한다.

## 재현 명령과 한계

검증 결과 (3.4.2):

- 사용자 corpus 평가 파일을 제외한 전체 단위 테스트: 142개 파일, 2,207개 통과, 기존 조건부 테스트 2개 건너뜀.
- skill 동기화 이후 문서 drift·skill routing·MCP skill 및 corpus 외 workflow 평가: 41개 통과. 사용자 corpus 사례 1개는 명시적으로 제외.
- MCP contracts: 4개 profile, 18개 HTTP 사례 통과. 기존 baseline 수정 없음.
- 합성 MCP replay: 12개 시나리오, 35개 task 통과. 잘못된 대상 수정 0건.
- 타입 검사, lint, Electron/renderer 빌드, CHARX 통합 검증 통과.

실제 사용자 데이터와 GUI 수동 조작으로 검증하지 않았다. UI 경합은 자동화 테스트에서 비동기 응답 순서를 제어해 재현했다.

```powershell
npx vitest run src/charx-io-preservation.test.ts src/lib/folder-workspace.test.ts src/app/project-workspace-controller.test.ts src/lib/renderer-document-state.test.ts src/lib/file-actions.test.ts src/lib/autosave-manager.test.ts src/lib/save-recovery-audit.test.ts src/lib/project-save-recovery.test.ts src/lib/session-recovery-manager.test.ts src/lib/mcp-confirmation-race.test.ts src/lib/mcp-external-race.test.ts src/lib/mcp-facade-binding.test.ts src/lib/mcp-headless-server.test.ts
```

최초 감사 검증에서는 로컬 사용자 corpus를 읽는 `src/lib/mcp-agent-workflow-eval.test.ts`를 제외했다. 후속 harness 점검에서 corpus 사례를 명시적 opt-in으로 바꿨으므로 이제 기본 `npm test`는 해당 파일의 정적 검증을 실행하면서 사용자 corpus 사례만 건너뛴다. `npm run test:corpus`만 로컬 사용자 artifact 읽기를 활성화한다. MCP contract/replay는 합성 artifact를 사용한다.

합성 fixture는 확인한 필드와 경합 순서를 재현하며 모든 과거/미래 서드파티 포맷을 증명하지 않는다. legacy granular index 호출에 caller guard가 없으면 과거 의도를 추론할 수 없다. 보호가 필요한 호출은 새 facade preview 또는 안정 ID/최신 guard를 사용해야 한다. hash 검사와 OS rename 사이를 다른 프로세스가 정확히 가로지르는 경우까지 배타적으로 잠그지는 않는다. 파일 rename의 원자성은 디스크 하드웨어 고장·전원 차단의 완전한 내구성 보장이 아니다. 프로젝트 checkpoint는 다중 파일 원자 커밋이 아니라, 실패한 원본의 사용을 중단하고 완전한 이전 사본으로 복구하는 정책이다.
