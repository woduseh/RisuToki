# Risutoki + Claude Code — Charx Project Guide

> 이 파일은 프로젝트 루트에 배치하면 Claude Code가 세션 시작 시 자동으로 읽습니다.
> Risutoki MCP 도구로 RisuAI .charx 파일을 편집하는 프로젝트용 공용 가이드입니다.

---

## 1. MCP 도구 레퍼런스 (Risutoki)

### 필드 (Fields)
| 도구 | 설명 |
|------|------|
| `list_fields` | 편집 가능한 필드 목록 및 크기 확인 |
| `read_field(field)` | 필드 전체 내용 읽기 |
| `write_field(field, content)` | 필드에 새 내용 쓰기 (사용자 확인 필요) |

**사용 가능한 필드:** `name`, `description`, `firstMessage`, `globalNote`, `css`, `defaultVariables`, `lua`

### Lua 섹션 (Lua Sections)
lua 필드는 `-- ===== 섹션명 =====` 구분자로 여러 섹션으로 분할됨. 로어북/정규식과 동일한 패턴으로 개별 섹션 편집 가능.

| 도구 | 설명 |
|------|------|
| `list_lua` | Lua 섹션 목록 (index, 이름, 크기) |
| `read_lua(index)` | 특정 인덱스의 Lua 섹션 코드 읽기 |
| `write_lua(index, content)` | 특정 인덱스의 Lua 섹션 전체 교체 (사용자 확인 필요) |
| `replace_in_lua(index, find, replace)` | 섹션 내 문자열 치환 — 대용량 섹션도 전체를 읽지 않고 서버에서 직접 처리. `regex: true` + `flags` 옵션으로 정규식 지원 |
| `insert_in_lua(index, content, position?, anchor?)` | 섹션에 코드 삽입. position: `end`(기본), `start`, `after`, `before`. after/before는 `anchor` 문자열 기준 |

### 로어북 (Lorebook)
| 도구 | 설명 |
|------|------|
| `list_lorebook` | 전체 로어북 항목 목록 (index, comment, key, 활성화 상태) |
| `read_lorebook(index)` | 특정 인덱스의 로어북 항목 전체 데이터 읽기 |
| `write_lorebook(index, data)` | 특정 인덱스의 로어북 항목 수정 (부분 수정 가능) |
| `add_lorebook(data)` | 새 로어북 항목 추가 |
| `delete_lorebook(index)` | 특정 인덱스의 로어북 항목 삭제 |

### 정규식 (Regex)
| 도구 | 설명 |
|------|------|
| `list_regex` | 정규식 스크립트 항목 목록 |
| `read_regex(index)` | 특정 인덱스의 정규식 항목 읽기 |
| `write_regex(index, data)` | 특정 인덱스의 정규식 항목 수정 |
| `add_regex(data)` | 새 정규식 항목 추가 |
| `delete_regex(index)` | 특정 인덱스의 정규식 항목 삭제 |

### 참고 자료 (References, 읽기 전용)
| 도구 | 설명 |
|------|------|
| `list_references` | 로드된 참고 자료 파일 목록 |
| `read_reference_field(index, field)` | 참고 자료의 특정 필드 읽기 |

---

## 2. Charx 파일 구조

### 필드별 용도
| 필드 | 용도 | 비고 |
|------|------|------|
| `name` | 캐릭터/봇 이름 | |
| `description` | 캐릭터 설명 (AI에 전달) | |
| `firstMessage` | 첫 메시지 (CBS 사용 가능) | |
| `globalNote` | 글로벌 노트 — 시스템 프롬프트 역할 | 항상 AI에 전달됨 |
| `css` | CSS + HTML (UI/사이드패널) | `backgroundHTML` 영역 |
| `defaultVariables` | 기본 변수 초기값 | CBS `{{getvar}}`로 접근 |
| `lua` | Lua 트리거 스크립트 | RisuAI Lua 5.4 API |

### 로어북 항목 구조
```json
{
  "key": "키워드1, 키워드2",
  "comment": "관리용 이름 (Lua에서 검색 시 comment 필터로 사용)",
  "content": "AI에 전달될 실제 텍스트 (CBS 사용 가능)",
  "mode": "normal",
  "insertorder": 100,
  "alwaysActive": false,
  "secondkey": "",
  "selective": false,
  "useRegex": false,
  "folder": "folder:uuid"
}
```

**핵심 필드 설명:**
- `key`: 대화에 이 키워드가 등장하면 content가 프롬프트에 삽입됨. 빈 문자열이면 키워드 비활성.
- `comment`: 관리용 이름. Lua `getLoreBooks(triggerId, commentFilter)`에서 검색 필터로도 쓰임.
- `alwaysActive`: true면 키워드 매칭 없이 항상 삽입.
- `insertorder`: 높을수록 프롬프트 뒤쪽에 배치.
- `selective` + `secondkey`: 둘 다 설정 시 key와 secondkey가 모두 매칭되어야 활성화.
- `folder`: 폴더 그룹 UUID. `mode: "folder"`인 항목이 폴더 자체.
- `key=""` + `alwaysActive=false` → **0 토큰** (완전히 스킵됨). DB 저장용으로 활용.

### 정규식 항목 구조
```json
{
  "comment": "스크립트 이름",
  "type": "editdisplay | editoutput | editinput | editrequest",
  "find": "정규식 패턴 (IN)",
  "replace": "치환 텍스트 (OUT, CBS/HTML 가능)",
  "flag": "g | gi | gm | gs",
  "ableFlag": true
}
```

**type별 적용 시점:**
| type | 시점 | 용도 |
|------|------|------|
| `editinput` | 유저 입력 → 서버 전송 전 | 명령어 변환, 입력 전처리 |
| `editoutput` | AI 응답 생성 후 저장 전 | 응답 후처리, 변수 파싱 |
| `editdisplay` | 화면 렌더링 시 | UI 표시용 변환, 태그 숨김 |
| `editrequest` | 프롬프트 조립 후 API 전송 전 | 프롬프트 수정, 토큰 최적화 |

---

## 3. CBS 핵심 문법 (Custom Bracket Syntax)

```
{{getvar::변수명}}              — 변수 읽기
{{setvar::변수명::값}}           — 변수 쓰기
{{addvar::변수명::값}}           — 변수에 더하기
{{#when::값::is::비교값}}...{{/when}}  — 조건문
{{#if 조건}}...{{/if}}            — 조건문 (기본)
{{calc::수식}}                    — 계산
{{random::A::B::C}}               — 랜덤 선택
{{asset::이름}}                   — 에셋 표시
{{user}} / {{char}}               — 유저/캐릭터 이름
```

---

## 4. Lua API 핵심 (RisuAI)

```lua
-- 변수 읽기/쓰기
getChatVar(triggerId, "변수명")
setChatVar(triggerId, "변수명", 값)

-- 로어북
getLoreBooks(triggerId, "comment 필터")  -- DB 로어북 검색 (comment 부분 매칭)
upsertLocalLoreBook(triggerId, "id", "content", { key="키워드", alwaysActive=false })

-- 출력
setOutput(triggerId, "텍스트")        -- HTML 출력 (사이드패널 등)
print("디버그 메시지")                -- 콘솔 출력

-- 모델 호출
callAxModel(triggerId, systemPrompt, userPrompt, options)
```

**주의:** `upsertLocalLoreBook`으로 생성한 로어북은 **다음 턴**에야 AI 프롬프트에 반영됨 (1턴 딜레이).

---

## 5. 효과적인 작업 흐름

### 로어북 검색 시
1. `list_lorebook`은 항목이 수백 개면 결과가 매우 클 수 있음
2. 결과가 파일로 저장되면 **Grep/Python으로 검색** (comment, key 기준)
3. 찾은 index로 `read_lorebook(index)` 호출

### 로어북 수정 시
1. 먼저 `read_lorebook(index)`로 현재 내용 확인
2. `write_lorebook(index, data)` — **변경할 필드만** 전달 (부분 수정 가능)
3. comment 네이밍이 Lua 검색에 영향을 주므로 **기존 패턴과 일치**시킬 것

### Lua 코드 수정 시
1. `list_lua`로 섹션 목록 확인 (index, 이름, 크기)
2. **소형 섹션** (수 KB): `read_lua(index)` → `write_lua(index, content)` 로 전체 교체
3. **대형 섹션** (수십 KB+): 전체를 읽지 않고 아래 도구 사용
   - `replace_in_lua(index, find, replace)` — 문자열 치환 (정규식 지원)
   - `insert_in_lua(index, content, position, anchor?)` — 코드 삽입 (end/start/after/before)
4. `read_field("lua")`는 전체 합산 반환 (수백 KB). 전체 탐색이 필요할 때만 사용

### 대용량 필드 처리
- `lua`, `css` 등 대용량 필드는 `read_field` 시 파일로 저장될 수 있음
- 파일 경로가 반환되면 `Read`/`Grep` 도구로 탐색
- 수정 시에는 전체 내용을 읽은 뒤 변경 부분만 교체하여 `write_field`

---

## 6. 주의사항

- `write_field`와 `write_lorebook`은 **사용자 확인 팝업**이 뜸 (에디터 측)
- 로어북 `comment`는 Lua `getLoreBooks()` 검색에 사용되므로, **comment 변경 시 Lua 코드의 검색 패턴과 일치하는지 반드시 확인**
- 로어북 `key`가 비어있어도 `getLoreBooks()`의 comment 필터로 접근 가능 (DB 저장용)
- 참고 자료(references)는 **읽기 전용** — 수정 불가, 레퍼런스로만 활용
- `list_lorebook` 결과에서 `mode: "folder"`인 항목은 폴더 자체 (내용 없음)

---

## 7. 프로젝트별 참고사항

> 아래는 프로젝트 제작자가 작성하는 영역입니다.
> 프로젝트 고유의 규칙, 구조, 가이드 경로 등을 여기에 추가하세요.

### 가이드 파일 위치
`resources/guides/` 폴더에 프로젝트별 상세 가이드가 있을 수 있습니다.

```
resources/guides/
├── CLAUDE.md              — 프로젝트별 작업 인수인계 문서
├── TECHNICAL_REFERENCE.md — 기술 노트, 함수 레퍼런스
├── PROJECT_GUIDE.md       — 프로젝트 구조, 빌드 파이프라인
└── ...기타 문법가이드 등
```

세션 시작 시 `resources/guides/CLAUDE.md`를 먼저 읽으면 프로젝트 맥락을 빠르게 파악할 수 있습니다.

### 프로젝트 규칙
<!-- 프로젝트별 절대 규칙, 네이밍 컨벤션, 빌드 절차 등을 여기에 작성 -->
