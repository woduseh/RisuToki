# 문법가이드 Lua

Lua 5.4 문법과 RisuAI 스크립트 작성·API를 하나로 정리한 가이드입니다.

---

## 목차

1. [Lua 5.4 문법](#1-lua-54-문법)
2. [RisuAI 스크립트 작성](#2-risuai-스크립트-작성)
3. [API 참조](#3-api-참조)
4. [실전 예시](#4-실전-예시)

---

## 1. Lua 5.4 문법

### 기본 개념

#### 값과 타입 (Values and Types)

Lua는 8가지 기본 타입을 가집니다:

- **nil**: 값이 없음을 나타냄
- **boolean**: `true` 또는 `false`
- **number**: 정수 및 부동소수점 숫자 (Lua 5.3+에서 정수와 부동소수점 구분)
- **string**: 문자열 (불변)
- **function**: 함수
- **userdata**: C 데이터를 Lua에서 사용할 수 있게 함
- **thread**: 코루틴
- **table**: 연관 배열 (배열, 딕셔너리, 객체 등)

#### 타입 확인
```lua
type(value)  -- 타입 이름을 문자열로 반환
math.type(x)  -- number 타입인 경우 "integer" 또는 "float" 반환
```

#### 숫자 타입 (Lua 5.3+)
```lua
local int = 42        -- 정수
local float = 3.14    -- 부동소수점
math.type(42)         -- "integer"
math.type(3.14)       -- "float"
math.tointeger(3.14)  -- nil (변환 불가)
math.tointeger(42.0)  -- 42 (정수로 변환)
```

#### 변수 (Variables)
```lua
x = 10  -- 전역 변수
local x = 10  -- 지역 변수
local a, b, c = 1, 2, 3  -- 다중 할당
```

#### 환경 (Environments)
- `_G`: 전역 환경 테이블
- `_VERSION`: Lua 버전 문자열

---

### 언어 문법

#### 주석·식별자·예약어
```lua
-- 한 줄 주석
--[[ 여러 줄 주석 ]]
```
- 식별자: 문자, 숫자, 언더스코어 / 숫자로 시작 불가
- 예약어: `and break do else elseif end false for function goto if in local nil not or repeat return then true until while`

#### 제어 구조
```lua
if condition then -- 코드
elseif condition then -- 코드
else -- 코드
end

while condition do -- 코드 end
repeat -- 코드 until condition

for i = 1, 10 do -- 코드 end
for i = 1, 10, 2 do -- 코드 end
for k, v in pairs(table) do -- 코드 end
for i, v in ipairs(array) do -- 코드 end
```

#### 함수
```lua
function func(param1, param2) return result end
local function func(param1, param2) return result end
local func = function(param1, param2) return result end
function obj:method(param) end  -- self = obj
function func(...) local args = {...}; return select('#', ...) end
```

#### 연산자 (요약)
- 산술: `+ - * / // % ^`
- 비트: `& | ~ >> <<`
- 관계: `== ~= < > <= >=`
- 논리: `and or not`
- 연결: `..` / 길이: `#table`, `#"string"`

#### 테이블 생성자
```lua
t = {1, 2, 3}
t = {name = "Lua", version = 5.4}
t = {[key] = "value"}
```

---

### 표준 라이브러리 (요약)

- **기본**: `tonumber`, `tostring`, `type`, `pairs`, `ipairs`, `pcall`, `error`, `assert`, `print`, `select`
- **문자열**: `string.len`, `string.sub`, `string.find`, `string.match`, `string.gmatch`, `string.gsub`, `string.format`
  - 패턴: `. %a %d %s %w + * - ? ^ $ () %1 %2 ...`
- **테이블**: `table.insert`, `table.remove`, `table.concat`, `table.sort`
- **수학**: `math.abs`, `math.floor`, `math.ceil`, `math.random`, `math.max`, `math.min`
- **코루틴**: `coroutine.create`, `coroutine.resume`, `coroutine.yield`
- **UTF-8**: `utf8.len`, `utf8.char`, `utf8.codes`

---

### 메타메서드 (Metamethods)

`__add`, `__sub`, `__mul`, `__div`, `__concat`, `__len`, `__eq`, `__lt`, `__le`, `__index`, `__newindex`, `__call`, `__tostring`, `__gc`, `__close`, `__pairs` 등.

---

### 고급 기능

- **가비지 컬렉션**: `collectgarbage("collect")`, `collectgarbage("count")` 등
- **약한 테이블**: `setmetatable({}, {__mode = "k"})` 등
- **To-be-closed 변수** (Lua 5.4+): `local <close> f = open_file("x")`
- **디버그**: `debug.getinfo`, `debug.traceback` 등

상세 문법·라이브러리는 [Lua 5.4 Reference Manual](https://www.lua.org/manual/5.4/) 참고.

---

## 2. RisuAI 스크립트 작성

### 기본 템플릿

```lua
function onInput(triggerId)
    print("User is about to send a message")
    local lastMsg = getUserLastMessage(triggerId)
end

function onStart(triggerId)
    print("Processing prompt")
end

function onOutput(triggerId)
    print("AI response generated")
end
```

### 주요 이벤트 함수

| 함수 | 실행 시점 | 주요 용도 |
|------|----------|----------|
| `onInput(id)` | 유저 전송 시 | 입력 검증, 전처리 |
| `onStart(id)` | 프롬프트 생성 시 | 내용 수정, 변수 처리 |
| `onOutput(id)` | AI 응답 후 | 결과 처리, 이벤트 |

전역 API 함수(채팅 조작, 변수, 알림, LLM 등)는 **3. API 참조**를 사용하세요.

### listenEdit: 이벤트 리스너

```lua
listenEdit('editOutput', function(triggerId, data)
    return data .. " (수정됨)"
end)
```
**이벤트:** `editInput`, `editOutput`, `editRequest`, `editDisplay`

### 비동기 함수

비동기 함수는 `:await()` 또는 `async()` 래퍼와 함께 사용해야 합니다.
예: `generateImage`, `simpleLLM`, `getTokens`, `hash`, `loadLoreBooks` (자세한 목록은 3장).

### 버튼 트리거

**HTML**
```html
<button risu-trigger="onButton">클릭</button>
<div risu-trigger="onDivClick">영역 클릭</div>
```

**Lua**
```lua
function onButton(triggerId)
  alertNormal(triggerId, "버튼 클릭!")
end
```

**CBS 버튼**: `{{button::라벨::함수명}}` → 클릭 시 해당 함수 호출.

**risu-btn**
```html
<button risu-btn="item-apple">사과</button>
```
```lua
function onButtonClick(triggerId, data)
  alertNormal(triggerId, "아이템: " .. data)
end
```

> 이벤트 함수(`onStart`, `onOutput`, `onInput`)는 **전역**으로 정의: `function onStart(id) ... end` / `local function onStart(id) ... end`

### JSON 라이브러리

```lua
local data = {name = "Alice", items = {"sword", "potion"}}
local jsonStr = json.encode(data)
setChatVar(id, "player_data", jsonStr)

local data = json.decode(getChatVar(id, "player_data"))
```

`setState`는 테이블 직접 저장 가능, `setChatVar`는 문자열만 가능하므로 복잡한 데이터는 JSON 활용.

### 중요 주의사항

1. **triggerId**: 트리거 함수 첫 인자 = 채팅 id. `id` 또는 `triggerId`로 통일 권장.
2. **Lua 문자열 패턴**: `%`는 특수 문자이므로 리터럴은 `%%`. 패턴 오류 시 에러 없이 중단될 수 있음.
   리터럴 검색: `str:find("text", 1, true)` (4번째 인자 `true`).
3. **인덱스 불일치**: `getChatLength(id)`는 **1부터**, `getChat(id, i)` / `setChat(id, i, ...)`는 **0부터**.
4. **비동기**: 해당 함수는 반드시 `:await()` 사용 (3장에 표시).
5. **stopChat(id)** 는 버그로 사용 불가.

---

## 3. API 참조

### 3.1 콜백 함수

| 함수 | 설명 |
|------|------|
| `onStart(triggerId)` | 채팅이 전송될 때 호출 |
| `onOutput(triggerId)` | AI 응답 수신 시 호출 |
| `onInput(triggerId)` | 사용자 입력 수신 시 호출 |
| `listenEdit(type, callback)` | 수정 이벤트 감지 (`editRequest`, `editDisplay`, `editInput`, `editOutput`) |

버튼: `{{button::Display::TriggerName}}` 클릭 시 **TriggerName** 함수 호출.

### 3.2 채팅 메시지 관리

**개별:** `getChat(id, index)`, `setChat(id, index, value)`, `setChatRole(id, index, role)`, `addChat(id, role, value)`, `insertChat(id, index, role, value)`, `removeChat(id, index)` — index는 **0부터**. role: `'user'` 또는 `'char'`.

**전체:** `getFullChat(id)`, `setFullChat(id, value)`, `cutChat(id, start, end_)`, `getChatLength(id)` (개수는 **1부터**).

**마지막 메시지:** `getCharacterLastMessage(id)`, `getUserLastMessage(id)`.

### 3.3 상태 및 변수

| 함수 | 설명 |
|------|------|
| `getChatVar(id, key)` / `setChatVar(id, key, value)` | 채팅 변수 |
| `getGlobalVar(id, key)` | 전역 변수 (읽기) |
| `getState(id, name)` / `setState(id, name, value)` | 객체/배열 저장 (JSON 자동 변환) |

### 3.4 캐릭터 정보

**기본:** `getName(id)`, `setName(id, name)`, `getDescription(id)`, `setDescription(id, desc)`, `getCharacterFirstMessage(id)`, `setCharacterFirstMessage(id, data)`.

**이미지:** `getCharacterImage(id)` — **await 필요**.

**페르소나:** `getPersonaName(id)`, `getPersonaDescription(id)`, `getPersonaImage(id)` — **await 필요**.

**기타:** `getAuthorsNote(id)`, `getBackgroundEmbedding(id)`, `setBackgroundEmbedding(id, data)`.

### 3.5 AI 모델 호출 (LLM)

| 함수 | 설명 | 비고 |
|------|------|------|
| `LLM(id, prompt, useMultimodal?)` | 메인 모델 호출 | LLMResult |
| `simpleLLM(id, prompt)` | 간단 질문 | **await 필요** |
| `axLLM(id, prompt, useMultimodal?)` | 대체 모델 | LLMResult |

- prompt: `{ {role: "user/system/assistant", content: "..."} }`
- LLMResult: `{ success: boolean, result: string }`

### 3.6 로어북

`getLoreBooks(id, search)`, `loadLoreBooks(id)` (**await 필요**), `upsertLocalLoreBook(id, name, content, options)`.

### 3.7 UI 알림

`alertError(id, value)`, `alertNormal(id, value)`, `alertInput(id, value)`, `alertSelect(id, value)`, `alertConfirm(id, value)` — Input/Select/Confirm은 **await 필요**.

### 3.8 유틸리티

**텍스트:** `getTokens(id, value)`, `hash(id, value)`, `similarity(id, source, value)` — **await 필요**. `cbs(id, value)` — CBS 파싱.

**네트워크:** `request(id, url)` — **await 필요**, 120자·분당 5회 제한.

**미디어:** `generateImage(id, value, negValue?)` — **await 필요**.

**기타:** `sleep(id, time)` (밀리초), `log(message)` (가능하면 `print` 권장).

### 3.9 채팅 제어

`stopChat(id)`, `reloadDisplay(id)`, `reloadChat(id, index)` — stopChat 현재 오류로 비추천.

### 3.10 비동기 헬퍼

`async(callback)` — Lua 코루틴을 Promise로 변환. `promise:await()` — 결과 대기.

```lua
result = async(function(triggerId)
  local response = simpleLLM(id, "안녕"):await()
  return response
end)
```

---

## 4. 실전 예시

### HP 시스템

```lua
function onStart(triggerId)
    local hp = getState(triggerId, "hp")
    if hp == nil then
        setState(triggerId, "hp", 100)
        alertNormal(triggerId, "HP 초기화: 100/100")
    end
end

function onOutput(triggerId)
    local msg = getCharacterLastMessage(triggerId)
    if msg:find("공격") or msg:find("타격") then
        local hp = getState(triggerId, "hp") or 100
        hp = hp - 10
        setState(triggerId, "hp", hp)
        if hp <= 0 then
            alertError(triggerId, "HP가 0입니다!")
            addChat(triggerId, "char", "*쓰러진다*")
        else
            alertNormal(triggerId, "HP -10! 현재: " .. hp)
        end
    end
end
```

### 감정 추적

```lua
function onOutput(triggerId)
    local msg = getCharacterLastMessage(triggerId)
    local emotion = "중립"
    if msg:find("기쁘") or msg:find("행복") then emotion = "기쁨"
    elseif msg:find("슬프") then emotion = "슬픔"
    elseif msg:find("화나") then emotion = "분노"
    end
    setState(triggerId, "current_emotion", emotion)
end
```

### 동적 로어북 추가

```lua
function onInput(triggerId)
    local msg = getUserLastMessage(triggerId)
    if msg:find("성") then
        upsertLocalLoreBook(triggerId, "왕의 성", "거대한 성. 높은 탑과 두꺼운 성벽.", {key={"성", "왕성"}})
        alertNormal(triggerId, "로어북 추가됨")
    end
end
```

### AI 응답 수정 (금지어 필터)

```lua
listenEdit('editOutput', function(triggerId, data, meta)
    local forbidden = {"금지어1", "금지어2"}
    for _, word in ipairs(forbidden) do
        data = data:gsub(word, "***")
    end
    return data .. " ~냥"
end)
```

---

*RisuAI 프로젝트 템플릿 · 문법가이드 Lua*
