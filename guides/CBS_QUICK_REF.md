# RisuAI CBS 간편 가이드

**버전:** V166 축약본
**용도:** RisuAI 프로젝트용 필수 CBS 레퍼런스

---

## 1. 변수

### 읽기/쓰기
| CBS | 설명 |
|-----|------|
| `{{getvar::A}}` | 변수 A 읽기 |
| `{{setvar::A::B}}` | 변수 A를 B로 설정 |
| `{{addvar::A::B}}` | 변수 A에 B 더하기 |
| `{{setdefaultvar::A::B}}` | A가 없을 때만 B 설정 |

> setvar/addvar는 **채팅 컨텍스트**에서만 작동

---

## 2. 조건문

### #if (기본)
```html
{{#if {{equal::{{getvar::cv_step}}::1}}}}
  1단계입니다
{{/if}}
```

### #when (권장 - 고급)
```html
{{#when::{{getvar::cv_step}}::is::1}}
  1단계입니다
{{:else}}
  다른 단계입니다
{{/when}}
```

### #when 연산자
| 연산자 | 설명 |
|--------|------|
| `is` | 같음 |
| `isnot` | 다름 |
| `>` | 크다 |
| `<` | 작다 |
| `>=` | 크거나 같다 |
| `<=` | 작거나 같다 |
| `and` | 논리 AND |
| `or` | 논리 OR |
| `not` | 부정 |
| `var` | 변수가 truthy |

예시:
```html
{{#when::{{getvar::cv_gold}}::>::1000000}}부자{{/when}}
{{#when::not::{{getvar::cv_init_complete}}}}미완료{{/when}}
{{#when::{{getvar::cv_level}}::is::1::and::{{getvar::cv_gold}}::>::0}}1레벨 부자{{/when}}
```

---

## 3. 비교 함수

| CBS | 설명 |
|-----|------|
| `{{equal::A::B}}` | A == B → "1" / "0" |
| `{{not_equal::A::B}}` | A != B |
| `{{greater::A::B}}` | A > B |
| `{{greater_equal::A::B}}` | A >= B |
| `{{less::A::B}}` | A < B |
| `{{less_equal::A::B}}` | A <= B |

---

## 4. 계산

### 기본 계산
```html
{{calc::1+2}}        → 3
{{calc::10*5}}       → 50
{{calc::100/4}}      → 25
{{calc::10%3}}       → 1
```

### 수학 함수
| CBS | 설명 |
|-----|------|
| `{{floor::A}}` | 내림 |
| `{{ceil::A}}` | 올림 |
| `{{round::A}}` | 반올림 |
| `{{abs::A}}` | 절대값 |
| `{{min::A::B::C}}` | 최솟값 |
| `{{max::A::B::C}}` | 최댓값 |
| `{{sum::A::B::C}}` | 합계 |

---

## 5. 문자열

| CBS | 설명 |
|-----|------|
| `{{lower::A}}` | 소문자로 |
| `{{upper::A}}` | 대문자로 |
| `{{length::A}}` | 길이 |
| `{{replace::A::B::C}}` | A에서 B를 C로 교체 |
| `{{contains::A::B}}` | A가 B 포함? |
| `{{startswith::A::B}}` | A가 B로 시작? |

---

## 6. 배열

```html
{{array::a::b::c}}                   → ["a","b","c"]
{{array_element::배열::0}}            → 첫 번째 요소
{{array_length::배열}}                → 길이
{{split::문자열::구분자}}             → 배열로 분리
{{join::배열::구분자}}                → 문자열로 합침
```

### 반복문
```html
{{#each {{array::사과::바나나::오렌지}} as fruit}}
  과일: {{slot::fruit}}
{{/each}}
```

---

## 7. 랜덤

| CBS | 설명 |
|-----|------|
| `{{random}}` | 0~1 랜덤 |
| `{{random::A::B::C}}` | A,B,C 중 랜덤 선택 |
| `{{randint::A::B}}` | A~B 정수 랜덤 |
| `{{roll::2d6}}` | 주사위 (2d6 = 6면체 2개) |

---

## 8. 시간/날짜

| CBS | 설명 |
|-----|------|
| `{{time}}` | 현재 시간 (HH:MM:SS) |
| `{{date}}` | 현재 날짜 (YYYY-M-D) |
| `{{unixtime}}` | 유닉스 타임스탬프 |
| `{{date::YYYY-MM-DD}}` | 포맷 지정 |

---

## 9. 시스템

| CBS | 설명 |
|-----|------|
| `{{user}}` | 유저 이름 |
| `{{char}}` | 캐릭터 이름 |
| `{{chat_index}}` | 현재 메시지 인덱스 |
| `{{lastmessageid}}` | 마지막 메시지 인덱스 |
| `{{lastmessage}}` | 마지막 메시지 내용 |
| `{{model}}` | 현재 AI 모델 ID |

---

## 10. 특수 문자

| CBS | 출력 |
|-----|------|
| `{{br}}` | 줄바꿈 |
| `{{none}}` | 빈 문자열 |
| `{{bo}}` | `{` |
| `{{bc}}` | `}` |
| `{{<}}` | `<` |
| `{{>}}` | `>` |

---

## 11. 에셋

```html
{{asset::이름}}      <!-- 에셋 표시 -->
{{emotion::표정}}    <!-- 표정 이미지 -->
{{image::이름}}      <!-- 이미지 -->
```

---

## 12. 함수 정의

```html
<!-- 함수 정의 -->
{{#func myFunc param1 param2}}
  결과: {{arg::param1}} + {{arg::param2}}
{{/func}}

<!-- 함수 호출 -->
{{call::myFunc::값1::값2}}
```

---

## 자주 쓰는 패턴

### 변수가 특정 값인지 확인
```html
{{#when::var::cv_init_complete}}셋업 완료{{:else}}미완료{{/when}}
```

### 숫자 비교
```html
{{#when::{{getvar::cv_gold}}::>=::1000000}}백만 이상{{/when}}
```

### 조건부 표시 (마지막 메시지만)
```html
{{#when::{{chat_index}}::is::{{lastmessageid}}}}
  (마지막 메시지에만 표시)
{{/when}}
```

### 퍼스트메시지 감지
```html
{{#when::{{lastmessageid}}::is::-1}}
  (퍼스트메시지)
{{/when}}
```

---

**전체 CBS 문서:** [RisuAI CBS Docs](https://kwaroran.github.io/docs/syntax/cbs/)
