/**
 * Help popup and syntax reference overlay.
 *
 * Extracted from controller.js — purely DOM-based, no external state
 * dependencies.
 */

// ==================== Help Popup ====================

let closeHelpOverlay: (() => void) | null = null;
let closeSyntaxReferenceOverlay: (() => void) | null = null;

function restoreFocus(element: HTMLElement | null): void {
  if (element?.isConnected) {
    element.focus();
  }
}

function getOverlayByType(type: string): HTMLElement | null {
  return document.querySelector(`.help-popup-overlay[data-overlay="${type}"]`);
}

export function showHelpPopup(): void {
  const existing = getOverlayByType('help');
  if (existing && closeHelpOverlay) {
    closeHelpOverlay();
    return;
  }
  if (!existing) {
    closeHelpOverlay = null;
  }

  const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const overlay = document.createElement('div');
  overlay.className = 'help-popup-overlay';
  overlay.dataset.overlay = 'help';

  const popup = document.createElement('div');
  popup.className = 'help-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'true');
  popup.setAttribute('aria-label', 'RisuToki 도움말');

  const header = document.createElement('div');
  header.className = 'help-popup-header';
  header.innerHTML = '<span>💬 RisuToki 도움말</span>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', '닫기');
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'help-popup-body';
  body.innerHTML = `
    <h3>📁 파일</h3>
    <div class="help-shortcut"><span>새로 만들기</span><kbd>Ctrl+N</kbd></div>
    <div class="help-shortcut"><span>열기</span><kbd>Ctrl+O</kbd></div>
    <div class="help-shortcut"><span>저장</span><kbd>Ctrl+S</kbd></div>
    <div class="help-shortcut"><span>다른 이름 저장</span><kbd>Ctrl+Shift+S</kbd></div>
    <div class="help-shortcut"><span>탭 닫기</span><kbd>Ctrl+W</kbd></div>

    <h3>✏️ 편집</h3>
    <div class="help-shortcut"><span>실행 취소 / 다시 실행</span><kbd>Ctrl+Z / Ctrl+Y</kbd></div>
    <div class="help-shortcut"><span>찾기 / 바꾸기</span><kbd>Ctrl+F / Ctrl+H</kbd></div>

    <h3>👁️ 보기</h3>
    <div class="help-shortcut"><span>사이드바 토글</span><kbd>Ctrl+B</kbd></div>
    <div class="help-shortcut"><span>터미널 토글</span><kbd>Ctrl+\`</kbd></div>
    <div class="help-shortcut"><span>설정</span><kbd>Ctrl+,</kbd></div>
    <div class="help-shortcut"><span>프리뷰</span><kbd>F5</kbd></div>
    <div class="help-shortcut"><span>확대 / 축소 / 기본</span><kbd>Ctrl++ / Ctrl+- / Ctrl+0</kbd></div>

    <h3>💬 TokiTalk 터미널</h3>
    <div class="help-shortcut"><span>채팅 모드 전환</span><span>💭 버튼</span></div>
    <div class="help-shortcut"><span>배경 이미지 설정</span><span>🖼 버튼</span></div>
    <div class="help-shortcut"><span>Claude Code 시작</span><span>터미널 메뉴</span></div>
    <div class="help-shortcut"><span>GitHub Copilot CLI 시작</span><span>터미널 메뉴</span></div>
    <div class="help-shortcut"><span>Codex 시작</span><span>터미널 메뉴</span></div>

    <h3>🔘 터미널 헤더 버튼</h3>
    <div class="help-shortcut"><span>🐰 RP 모드</span><span>클릭: AI CLI에 캐릭터 말투 적용</span></div>
    <div class="help-shortcut"><span>🔇 BGM</span><span>클릭: ON/OFF, 우클릭: 파일 변경</span></div>
    <div class="help-shortcut"><span>🖼 배경</span><span>터미널 배경 이미지 설정</span></div>
    <div class="help-shortcut"><span>━ 토글</span><span>터미널 표시/숨김</span></div>

    <h3>🖱️ 패널 관리</h3>
    <div class="help-shortcut"><span>패널 이동</span><span>헤더 드래그</span></div>
    <div class="help-shortcut"><span>팝아웃 (분리)</span><span>우클릭 → 팝아웃</span></div>
    <div class="help-shortcut"><span>사이드바 위치</span><span>보기 메뉴</span></div>
    <div class="help-shortcut"><span>터미널 위치</span><span>보기 메뉴</span></div>
    <div class="help-shortcut"><span>아바타 우클릭</span><span>이미지 수동 변경</span></div>
    <div class="help-shortcut"><span>다크 모드</span><span>보기 메뉴 → 다크 모드 토글</span></div>

    <h3>🔧 편집 항목 안내</h3>
    <div class="help-shortcut"><span>Lua</span><span>트리거 스크립트 (게임 로직)</span></div>
    <div class="help-shortcut"><span>글로벌노트</span><span>AI에 항상 전달되는 지시문</span></div>
    <div class="help-shortcut"><span>첫 메시지</span><span>대화 시작 시 표시 (HTML/CBS)</span></div>
    <div class="help-shortcut"><span>CSS</span><span>Background Embedding (채팅 UI 스타일)</span></div>
    <div class="help-shortcut"><span>로어북</span><span>조건부 프롬프트 (키워드 매칭)</span></div>
    <div class="help-shortcut"><span>정규식</span><span>입출력 텍스트 변환 스크립트</span></div>
    <div class="help-shortcut"><span>에셋</span><span>.charx 내부 이미지 파일</span></div>
    <div class="help-shortcut"><span>참고 자료</span><span>다른 .charx 읽기 전용 참조</span></div>

    <h3>📦 .charx 파일 구조</h3>
    <p style="margin:4px 0;color:var(--text-secondary);font-size:12px;">
      .charx = ZIP 파일 (card.json + module.risum + assets/)<br>
      module.risum에 Lua, 정규식, 로어북이 RPack 인코딩으로 저장됩니다.
    </p>

    <div style="margin-top:10px;border-top:1px solid var(--border-color);padding-top:8px;">
      <button id="btn-syntax-ref" style="width:100%;padding:8px;border:none;border-radius:var(--radius-sm);background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">📖 문법 레퍼런스 보기</button>
    </div>
  `;

  // Syntax reference button
  setTimeout(() => {
    const syntaxBtn = popup.querySelector('#btn-syntax-ref');
    if (syntaxBtn) {
      syntaxBtn.addEventListener('click', () => {
        close();
        showSyntaxReference();
      });
    }
  }, 0);

  let closed = false;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (document.body.lastElementChild !== overlay) return;
    e.preventDefault();
    close();
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    closeHelpOverlay = null;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    restoreFocus(previousActive);
  };
  closeHelpOverlay = close;
  closeBtn.addEventListener('click', close);

  popup.appendChild(header);
  popup.appendChild(body);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  closeBtn.focus();

  // Click overlay background to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
}

// ==================== Syntax Reference Popout ====================

function showSyntaxReference(): void {
  const existing = getOverlayByType('syntax-reference');
  if (existing && closeSyntaxReferenceOverlay) {
    closeSyntaxReferenceOverlay();
    return;
  }
  if (!existing) {
    closeSyntaxReferenceOverlay = null;
  }

  const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'help-popup-overlay';
  overlay.dataset.overlay = 'syntax-reference';

  const popup = document.createElement('div');
  popup.className = 'syntax-ref-popup';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'true');
  popup.setAttribute('aria-label', '문법 레퍼런스');

  const header = document.createElement('div');
  header.className = 'help-popup-header';
  header.innerHTML = '<span>📖 문법 레퍼런스</span>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', '닫기');
  header.appendChild(closeBtn);

  // Navigation tabs
  const nav = document.createElement('div');
  nav.className = 'syntax-nav';
  const sections = [
    { id: 'cbs', label: 'CBS 매크로' },
    { id: 'lua', label: 'Lua API' },
    { id: 'lorebook', label: '로어북' },
    { id: 'regex', label: '정규식' },
    { id: 'html', label: 'HTML/CSS' },
    { id: 'patterns', label: '핵심 패턴' },
    { id: 'tips', label: '팁' },
  ];

  const body = document.createElement('div');
  body.className = 'syntax-ref-body';

  function showSection(sectionId: string): void {
    for (const btn of Array.from(nav.children) as HTMLElement[]) btn.classList.remove('active');
    nav.querySelector(`[data-id="${sectionId}"]`)!.classList.add('active');
    body.innerHTML = syntaxContent[sectionId] || '';
  }

  for (const s of sections) {
    const btn = document.createElement('button');
    btn.className = 'syntax-nav-btn';
    btn.dataset.id = s.id;
    btn.textContent = s.label;
    btn.addEventListener('click', () => showSection(s.id));
    nav.appendChild(btn);
  }

  popup.appendChild(header);
  popup.appendChild(nav);
  popup.appendChild(body);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  closeBtn.focus();

  let closed = false;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (document.body.lastElementChild !== overlay) return;
    e.preventDefault();
    close();
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    closeSyntaxReferenceOverlay = null;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    restoreFocus(previousActive);
  };
  closeSyntaxReferenceOverlay = close;
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  showSection('cbs');
}

const syntaxContent: Record<string, string> = {
  cbs: `
<h3>변수</h3>
<table class="syn-table">
  <tr><td><code>{{getvar::이름}}</code></td><td>변수 읽기</td></tr>
  <tr><td><code>{{setvar::이름::값}}</code></td><td>변수 쓰기</td></tr>
  <tr><td><code>{{addvar::이름::값}}</code></td><td>숫자 더하기</td></tr>
  <tr><td><code>{{getglobalvar::이름}}</code></td><td>전역 변수 읽기</td></tr>
  <tr><td><code>{{setglobalvar::이름::값}}</code></td><td>전역 변수 쓰기</td></tr>
</table>

<h3>임시 변수 (Temp Var)</h3>
<table class="syn-table">
  <tr><td><code>{{settempvar::이름::값}}</code></td><td>임시 변수 설정 (현재 턴만)</td></tr>
  <tr><td><code>{{gettempvar::이름}}</code></td><td>임시 변수 읽기</td></tr>
</table>
<p class="syn-tip">💡 임시 변수는 현재 턴/파싱 내에서만 유효, 저장 안됨</p>

<h3>딕셔너리 (Dict)</h3>
<table class="syn-table">
  <tr><td><code>{{dict::A=값1::B=값2}}</code></td><td>딕셔너리 생성</td></tr>
  <tr><td><code>{{dict_element::dict::키}}</code></td><td>딕셔너리에서 값 조회</td></tr>
  <tr><td><code>{{dict_assert::dict::키::값}}</code></td><td>키의 값이 맞는지 확인 (true/false)</td></tr>
</table>

<h3>조건문</h3>
<div class="syn-code">{{#if {{getvar::hp}} &gt; 0}}
  살아있음
{{#else}}
  사망
{{/if}}</div>

<div class="syn-code">{{#when A is B}}...{{/when}}
{{#when A isnot B}}...{{/when}}
{{#when A > B}}...{{/when}}</div>
<p class="syn-tip">💡 <code>#when</code>이 <code>#if</code>보다 직관적. 연산자: is, isnot, &gt;, &lt;, &gt;=, &lt;=, and, or, not</p>

<table class="syn-table">
  <tr><td><code>{{all::A::B::C}}</code></td><td>A, B, C 모두 true면 true</td></tr>
  <tr><td><code>{{any::A::B::C}}</code></td><td>하나라도 true면 true</td></tr>
  <tr><td><code>{{isfirstmsg}}</code></td><td>첫 메시지인지 확인</td></tr>
</table>

<h3>수학</h3>
<table class="syn-table">
  <tr><td><code>{{calc::A+B}}</code></td><td>계산 (+ - * / %)</td></tr>
  <tr><td><code>{{floor::}}</code> <code>{{ceil::}}</code> <code>{{round::}}</code></td><td>올림/내림/반올림</td></tr>
  <tr><td><code>{{min::A::B}}</code> <code>{{max::A::B}}</code></td><td>최소/최대</td></tr>
  <tr><td><code>{{pow::A::B}}</code></td><td>A의 B제곱</td></tr>
  <tr><td><code>{{average::A::B::C}}</code></td><td>평균값</td></tr>
  <tr><td><code>{{fix_number::값::소수점}}</code></td><td>소수점 자릿수 고정</td></tr>
  <tr><td><code>{{? 수식}}</code></td><td><code>{{calc::}}</code>의 약어</td></tr>
  <tr><td><code>{{tonumber::텍스트}}</code></td><td>문자열 → 숫자 변환</td></tr>
</table>

<h3>문자열</h3>
<table class="syn-table">
  <tr><td><code>{{replace::대상::찾기::바꾸기}}</code></td><td>치환</td></tr>
  <tr><td><code>{{contains::텍스트::검색}}</code></td><td>포함 여부 (true/false)</td></tr>
  <tr><td><code>{{length::텍스트}}</code></td><td>글자 수</td></tr>
  <tr><td><code>{{split::텍스트::구분자}}</code></td><td>분할 → 배열</td></tr>
  <tr><td><code>{{endswith::텍스트::접미사}}</code></td><td>접미사 확인</td></tr>
  <tr><td><code>{{capitalize::텍스트}}</code></td><td>첫 글자 대문자</td></tr>
  <tr><td><code>{{trim::텍스트}}</code></td><td>앞뒤 공백 제거</td></tr>
</table>

<h3>배열 조작</h3>
<table class="syn-table">
  <tr><td><code>{{array_push::배열::값}}</code></td><td>배열 끝에 추가</td></tr>
  <tr><td><code>{{array_pop::배열}}</code></td><td>배열 끝 제거 + 반환</td></tr>
  <tr><td><code>{{array_shift::배열}}</code></td><td>배열 앞 제거 + 반환</td></tr>
  <tr><td><code>{{array_splice::배열::시작::삭제수}}</code></td><td>배열 잘라내기</td></tr>
  <tr><td><code>{{filter::배열::조건}}</code></td><td>조건에 맞는 요소만</td></tr>
</table>

<h3>랜덤</h3>
<table class="syn-table">
  <tr><td><code>{{random::A::B::C}}</code></td><td>A, B, C 중 랜덤</td></tr>
  <tr><td><code>{{randint::1::100}}</code></td><td>1~100 랜덤 정수</td></tr>
  <tr><td><code>{{roll::2d6}}</code></td><td>주사위 (2d6 = 6면체 2개)</td></tr>
  <tr><td><code>{{pick::시드::A::B::C}}</code></td><td>결정적 랜덤 (시드 고정 = 같은 결과)</td></tr>
  <tr><td><code>{{rollp::시드::2d6}}</code></td><td>결정적 주사위 (시드 고정)</td></tr>
</table>

<h3>데이터 참조</h3>
<table class="syn-table">
  <tr><td><code>{{personality}}</code></td><td>캐릭터 personality 필드</td></tr>
  <tr><td><code>{{description}}</code></td><td>캐릭터 description 필드</td></tr>
  <tr><td><code>{{char}}</code></td><td>캐릭터 이름</td></tr>
  <tr><td><code>{{user}}</code></td><td>유저 이름</td></tr>
  <tr><td><code>{{previous_chat_log::N}}</code></td><td>최근 N개 채팅 로그</td></tr>
  <tr><td><code>{{lastmessage}}</code></td><td>마지막 메시지 내용</td></tr>
  <tr><td><code>{{lastmessageid}}</code></td><td>마지막 메시지 인덱스</td></tr>
  <tr><td><code>{{chat_index}}</code></td><td>현재 메시지 인덱스</td></tr>
</table>

<h3>반복</h3>
<div class="syn-code">{{#each {{split::a,b,c::,}} as item}}
  항목: {{item}}
{{/each}}</div>

<h3>함수</h3>
<div class="syn-code">{{#func 함수명 param}}
  결과: {{param}}
{{/func}}
{{call::함수명::인자}}</div>

<h3>제어</h3>
<table class="syn-table">
  <tr><td><code>{{return::메시지}}</code></td><td>현재 메시지를 대체 + CBS 중단</td></tr>
</table>
<p class="syn-tip">💡 <code>{{return::}}</code>은 남은 CBS 처리를 모두 중단하고 지정 텍스트로 대체</p>

<h3>버튼</h3>
<div class="syn-code">{{button::버튼이름::함수명}}</div>
<p class="syn-tip">💡 Lua에서 <code>onButtonClick(id, data)</code>로 받음</p>
  `,

  lua: `
<h3>이벤트 함수</h3>
<table class="syn-table">
  <tr><td><code>onStart(id)</code></td><td>프롬프트 생성 전 (매 턴)</td></tr>
  <tr><td><code>onOutput(id)</code></td><td>AI 응답 후 (표시 전)</td></tr>
  <tr><td><code>onInput(id)</code></td><td>유저 입력 확인 후</td></tr>
  <tr><td><code>onButtonClick(id, data)</code></td><td>버튼 클릭 시</td></tr>
  <tr><td><code>editDisplay(id)</code></td><td>UI 표시 변경 (데이터 불변)</td></tr>
</table>

<h3>채팅 API</h3>
<table class="syn-table">
  <tr><td><code>getChat(id, idx)</code></td><td>메시지 읽기 (0-based)</td></tr>
  <tr><td><code>setChat(id, idx, data)</code></td><td>메시지 수정</td></tr>
  <tr><td><code>addChat(id, data)</code></td><td>메시지 추가</td></tr>
  <tr><td><code>removeChat(id, idx)</code></td><td>메시지 삭제</td></tr>
  <tr><td><code>getChatLength(id)</code></td><td>메시지 수 <b>(1-based!)</b></td></tr>
</table>
<p class="syn-tip">⚠️ <code>getChatLength</code>는 1-based, <code>getChat/setChat</code>은 0-based. 마지막: <code>getChat(id, getChatLength(id)-1)</code></p>

<h3>변수 API</h3>
<table class="syn-table">
  <tr><td><code>getChatVar(id, "key")</code></td><td>채팅 변수 읽기 (문자열)</td></tr>
  <tr><td><code>setChatVar(id, "key", val)</code></td><td>채팅 변수 쓰기</td></tr>
  <tr><td><code>getState(id, "key")</code></td><td>상태 읽기 (자동 JSON 파싱)</td></tr>
  <tr><td><code>setState(id, "key", val)</code></td><td>상태 쓰기 (자동 JSON 직렬화)</td></tr>
</table>

<h3>LLM 호출</h3>
<div class="syn-code">local result = LLM(id, "질문 내용"):await()
-- simpleLLM: 시스템 프롬프트 없이 간단한 호출
local text = simpleLLM(id, "간단한 질문"):await()</div>
<p class="syn-tip">⚠️ 비동기 함수는 반드시 <code>:await()</code> 필요</p>

<h3>UI 알림</h3>
<table class="syn-table">
  <tr><td><code>alertNormal(id, "메시지")</code></td><td>일반 알림</td></tr>
  <tr><td><code>alertError(id, "메시지")</code></td><td>에러 알림</td></tr>
  <tr><td><code>alertInput(id, "질문"):await()</code></td><td>입력 받기</td></tr>
  <tr><td><code>alertSelect(id, {"옵션1","옵션2"}):await()</code></td><td>선택지</td></tr>
  <tr><td><code>alertConfirm(id, "질문"):await()</code></td><td>확인/취소</td></tr>
</table>

<h3>로어북 조작</h3>
<div class="syn-code">local books = getLoreBooks(id)  -- 전체 로어북
loadLoreBooks(id):await()        -- 리로드
upsertLocalLoreBook(id, {        -- 추가/수정
  key = "키",
  content = "내용",
  alwaysActive = true
})</div>

<h3>기타</h3>
<table class="syn-table">
  <tr><td><code>getTokens(id, "텍스트")</code></td><td>토큰 수 계산</td></tr>
  <tr><td><code>reloadDisplay(id)</code></td><td>화면 갱신</td></tr>
  <tr><td><code>stopChat(id)</code></td><td>응답 중단 (현재 불안정)</td></tr>
</table>
  `,

  lorebook: `
<h3>기본 필드</h3>
<table class="syn-table">
  <tr><td><b>이름</b></td><td>관리용 코멘트 (AI에 안 보임)</td></tr>
  <tr><td><b>활성화 키</b></td><td>쉼표(,) 구분, 하나라도 매칭되면 활성화</td></tr>
  <tr><td><b>멀티플 키</b></td><td>"선택적" 체크 시, 활성화 키 + 멀티플 키 <b>둘 다</b> 매칭 필요</td></tr>
  <tr><td><b>배치 순서</b></td><td>숫자가 클수록 프롬프트 뒤쪽에 배치</td></tr>
</table>

<h3>체크박스</h3>
<table class="syn-table">
  <tr><td><b>언제나 활성화</b></td><td>키워드 매칭 없이 항상 삽입</td></tr>
  <tr><td><b>강제 활성화</b></td><td>토큰 제한 무시하고 강제 삽입</td></tr>
  <tr><td><b>선택적</b></td><td>활성화 키 + 멀티플 키 동시 매칭 필요</td></tr>
</table>

<h3>데코레이터 (content 첫 줄에 작성)</h3>
<div class="syn-code">@@depth 0               삽입 깊이 (0=최하단)
@@position personality 삽입 위치 지정
@@role system           역할 (system/user/assistant)
@@scan_depth 5          최근 5개 메시지만 검색
@@additional_keys A,B   A와 B도 함께 매칭되어야 활성화
@@exclude_keys A,B      A 또는 B 존재 시 비활성화
@@match_full_word       부분문자열 대신 단어 단위 매칭
@@activate              키 매칭 없이 강제 활성화
@@dont_activate         수동 활성화 전용 (Lua로 제어)
@@probability 50        50% 확률로 활성화
@@activate_only_after 5 5턴 이후부터 활성화
@@activate_only_every 3 3턴마다 활성화</div>

<h3>역할 지정 데코레이터</h3>
<table class="syn-table">
  <tr><td><code>@@@system</code></td><td>system 역할로 삽입</td></tr>
  <tr><td><code>@@@user</code></td><td>user 역할로 삽입</td></tr>
  <tr><td><code>@@@assistant</code></td><td>assistant 역할로 삽입</td></tr>
  <tr><td><code>@@@end</code></td><td>프롬프트 최하단에 강제 배치</td></tr>
</table>
<p class="syn-tip">💡 <code>@@@end</code>는 @@depth 0보다 더 아래. 최종 지시문에 사용</p>
<p class="syn-tip">💡 프리뷰(F5)는 핵심 로어북 데코레이터를 반영하며, 디버그 패널에서 매칭 키 · 제외 키 · 확률 결과 · 경고를 함께 확인할 수 있습니다.</p>

<h3>CBS 사용</h3>
<p class="syn-tip">💡 로어북 content 안에서 CBS 매크로 전부 사용 가능</p>
<div class="syn-code">{{#if {{getvar::phase}} is battle}}
  전투 관련 설정...
{{/if}}</div>
  `,

  regex: `
<h3>Modification Type</h3>
<table class="syn-table">
  <tr><td><b>입력문 수정</b></td><td>유저 입력 → LLM 전송 전에 변환</td></tr>
  <tr><td><b>출력문 수정</b></td><td>AI 응답 → 저장 전에 변환 (데이터 변경됨)</td></tr>
  <tr><td><b>리퀘스트 데이터 수정</b></td><td>프롬프트 전체 → LLM 전송 전에 변환</td></tr>
  <tr><td><b>디스플레이 수정</b></td><td>표시만 변경 (원본 데이터 불변)</td></tr>
  <tr><td><b>번역문 수정</b></td><td>번역 후에 적용</td></tr>
</table>

<h3>Normal Flag</h3>
<table class="syn-table">
  <tr><td><code>g</code> Global</td><td>전체 매칭 (첫 번째만 X)</td></tr>
  <tr><td><code>i</code> Case Insensitive</td><td>대소문자 무시</td></tr>
  <tr><td><code>m</code> Multi Line</td><td>^ $ 가 각 줄에 매칭</td></tr>
  <tr><td><code>s</code> Dot All</td><td>. 이 줄바꿈도 매칭</td></tr>
  <tr><td><code>u</code> Unicode</td><td>유니코드 지원</td></tr>
</table>

<h3>Special Flag</h3>
<table class="syn-table">
  <tr><td><b>Move Top</b></td><td>매칭 결과를 최상단으로 이동</td></tr>
  <tr><td><b>Move Bottom</b></td><td>매칭 결과를 최하단으로 이동</td></tr>
  <tr><td><b>Repeat Back</b></td><td>역방향으로 반복 적용</td></tr>
  <tr><td><b>IN CBS Parsing</b></td><td>CBS 파싱 단계에서 적용</td></tr>
  <tr><td><b>No Newline Suffix</b></td><td>치환 후 줄바꿈 미추가</td></tr>
</table>

<h3>OUT에서 CBS/HTML 사용</h3>
<div class="syn-code">IN:  \\{STATUS\\|([^}]+)\\}
OUT: &lt;div class="status"&gt;$1&lt;/div&gt;</div>
<p class="syn-tip">💡 <code>$&amp;</code> = 매칭된 전체 문자열, <code>$1</code> = 첫 번째 캡처 그룹</p>

<h3>특수 치환 명령 (OUT)</h3>
<table class="syn-table">
  <tr><td><code>@@emo 이름</code></td><td>감정 이미지 설정 (아바타 변경)</td></tr>
  <tr><td><code>@@repeat_back 위치</code></td><td>미매칭 시 이전 결과 복사 (위치: before/after)</td></tr>
</table>

<h3>토큰 최적화 패턴</h3>
<div class="syn-code">IN:  패턴
OUT: {{#if {{greater_equal::{{chat_index}}::
       {{? {{lastmessageid}}-5}}}}}}$&amp;{{/if}}</div>
<p class="syn-tip">💡 최근 5개 메시지만 표시, 이전 것은 숨김 → 토큰 절약</p>

<h3>처리 순서</h3>
<div class="syn-code">CBS 파싱 → Lua 트리거 → CBS 재파싱 → 정규식(CBS포함) → 표시</div>
  `,

  html: `
<h3>제약사항</h3>
<table class="syn-table">
  <tr><td>❌ <code>:root</code></td><td>사용 금지</td></tr>
  <tr><td>❌ <code>&lt;script&gt;</code></td><td>사용 금지</td></tr>
  <tr><td>❌ 빈 줄</td><td>태그 사이에 <b>빈 줄 금지</b> (파싱 깨짐)</td></tr>
  <tr><td>❌ <code>&lt;input type="radio"&gt;</code></td><td>파싱 버그 있음</td></tr>
  <tr><td>✅ CSS</td><td><b>Background Embedding</b>에 작성 (정규식 X)</td></tr>
</table>

<h3>CSS 클래스 자동 변환</h3>
<p class="syn-tip">⚠️ RisuAI가 모든 클래스에 <code>x-risu-</code> 접두사 자동 추가</p>
<div class="syn-code">/* 작성 */
.status { color: red; }
/* 실제 적용 */
.x-risu-status { color: red; }

/* 인접 셀렉터 (수동 접두사 필요) */
.status.x-risu-active { ... }

/* 부모-자식은 자동 변환됨 */
.parent .child { ... }</div>

<h3>HTML 패턴 예시</h3>
<div class="syn-code">&lt;div class="panel"&gt;
  &lt;div class="panel stat"&gt;
    &lt;span&gt;HP:&lt;/span&gt;
    &lt;span&gt;{{getvar::hp}}/{{getvar::max_hp}}&lt;/span&gt;
  &lt;/div&gt;
&lt;/div&gt;</div>
<p class="syn-tip">💡 CBS 매크로를 HTML 안에서 직접 사용 가능</p>

<h3>버튼 연동</h3>
<div class="syn-code">&lt;button risu-btn="attack"&gt;공격&lt;/button&gt;
&lt;button risu-trigger="onButton"&gt;트리거&lt;/button&gt;</div>
<p class="syn-tip">💡 <code>risu-btn</code>: Lua <code>onButtonClick(id, "attack")</code>으로 전달</p>
  `,

  patterns: `
<h3>1. 버튼 → 변수 → 표시</h3>
<div class="syn-code">-- HTML에서 risu-btn="start" 클릭
function onButtonClick(id, data)
  if data == "start" then
    setChatVar(id, "cv_phase", "battle")
    reloadDisplay(id)
  end
end</div>

<h3>2. 단계별 UI (Step)</h3>
<div class="syn-code">{{#if {{getvar::cv_step}} is 0}}
  [시작 화면]
  {{button::다음::nextStep}}
{{/if}}
{{#if {{getvar::cv_step}} is 1}}
  [두 번째 화면]
{{/if}}</div>

<h3>3. AI 응답 태그 파싱</h3>
<div class="syn-code">-- 글로벌노트에 지시: {DAMAGE|30} 형식 출력
-- Lua에서 파싱:
local msg = getChat(id, getChatLength(id)-1)
local dmg = msg.data:match("{DAMAGE|(%d+)}")
if dmg then
  local hp = getState(id, "hp") - tonumber(dmg)
  setState(id, "hp", hp)
end</div>

<h3>4. 동적 로어북</h3>
<div class="syn-code">-- @@dont_activate로 미리 만들어 두고
-- Lua에서 필요할 때 활성화
upsertLocalLoreBook(id, {
  key = "battle_info",
  content = "현재 전투 상태...",
  alwaysActive = true
})</div>

<h3>5. 비동기 입력</h3>
<div class="syn-code">-- async() 래퍼 필수
async(function()
  local name = alertInput(id, "이름 입력"):await()
  setState(id, "player_name", name)
end)</div>

<h3>6. 접두사 기반 버튼 처리</h3>
<div class="syn-code">function onButtonClick(id, data)
  if data:match("^item%-") then
    local itemId = data:sub(6) -- "item-" 이후
    -- 아이템 처리...
  elseif data:match("^skill%-") then
    local skillId = data:sub(7)
    -- 스킬 처리...
  end
end</div>

<h3>7. 사이드 패널</h3>
<p class="syn-tip">💡 첫 메시지에 태그 삽입 → 정규식으로 매 표시마다 렌더링 → CSS <code>position: fixed</code></p>
  `,

  tips: `
<h3>⚠️ 흔한 실수</h3>
<table class="syn-table">
  <tr><td><code>getChatLength</code></td><td><b>1-based</b>! 마지막 인덱스 = length-1</td></tr>
  <tr><td>비동기 함수</td><td><code>:await()</code> 빼먹으면 nil 반환</td></tr>
  <tr><td>HTML 빈 줄</td><td>태그 사이 빈 줄 → 파싱 깨짐</td></tr>
  <tr><td>CSS :root</td><td>사용하면 전체 UI 깨짐</td></tr>
  <tr><td>Lua % 이스케이프</td><td>패턴에서 <code>.</code>은 <code>%.</code>, <code>-</code>은 <code>%-</code></td></tr>
  <tr><td><code>stopChat(id)</code></td><td>현재 불안정 — 사용 주의</td></tr>
</table>

<h3>🚀 성능 팁</h3>
<table class="syn-table">
  <tr><td>토큰 최적화</td><td>이미지/UI를 최근 N개만 표시 (정규식 + chat_index)</td></tr>
  <tr><td>CSS 위치</td><td>Background Embedding에 작성 (정규식 OUT X)</td></tr>
  <tr><td>로어북 분리</td><td>긴 내용은 여러 항목으로 분할</td></tr>
  <tr><td>상태 변수</td><td>장기 상태(HP, 아이템)는 토큰 최적화에서 제외</td></tr>
</table>

<h3>📐 처리 순서</h3>
<div class="syn-code">1. CBS 매크로 파싱
2. Lua 트리거 실행 (onStart/onOutput/onInput)
3. CBS 재파싱 (Lua가 변경한 내용)
4. 정규식 적용 (CBS 포함)
5. 화면 표시</div>

<h3>🔧 디버깅</h3>
<table class="syn-table">
  <tr><td><code>alertNormal(id, tostring(val))</code></td><td>변수값 확인</td></tr>
  <tr><td><code>print()</code></td><td>Lua 콘솔 출력 (개발자 도구)</td></tr>
  <tr><td>정규식 테스트</td><td>디스플레이 수정 타입으로 먼저 테스트</td></tr>
</table>
  `,
};
