# 문법가이드 HTML/CSS

일반 웹 개발과 달리 파싱 엔진의 특성상 몇 가지 제약 사항과 권장 패턴이 존재합니다. 안정적인 렌더링을 위해 아래 가이드를 준수해주세요.

---

## CSS 최적화 전략

### 중요: `<style>` 태그 위치

**CSS는 정규식 스크립트가 아닌 [백그라운드 임베딩]에 선언하는 것을 강력히 권장합니다.**

| 위치 | 결과 |
|------|------|
| 정규식 스크립트에 포함 시 | 매칭될 때마다 CSS가 중복 삽입되어 성능 저하 및 렌더링 충돌 발생 |
| 백그라운드 임베딩 사용 시 | 페이지 로드 시 한 번만 스타일이 적용되어 효율적 |

### 사용 불가 및 주의사항

- `:root` 선택자 사용 불가
- JavaScript (`<script>`) 사용 불가
- `<input type="radio">` 파싱 문제로 비추천

---

## 빈 줄(Empty Line) 포함 금지

마크다운과 HTML 동시 파싱 문제로 인해, **태그 사이에 빈 줄이 있으면 HTML 구조가 깨집니다.**

### 잘못된 예시 (빈 줄 포함)

```html
<div>
  <div>내용1</div>

  <div>내용2</div>
</div>
```

### 올바른 예시 (연속 작성)

```html
<div>
  <div>내용1</div>
  <div>내용2</div>
</div>
```

---

## CSS 클래스 네이밍 규칙

연속된 클래스 선택자(`.class.subclass`) 사용 시 파싱 엔진의 접두사 처리 규칙을 따라야 합니다.

리스는 렌더링 시 **모든 클래스에 `x-risu-` 접두사를 자동으로 붙입니다.** 클래스가 붙어있으면 이를 제대로 반환하지 못합니다. 따라서 CSS 정의 시, 붙어있는 클래스에는 **수동으로 접두사를 명시**해야 합니다.

```css
/* 잘못된 사용: 접두사 누락 */
.status.active { color: green; }

/* 올바른 사용: x-risu- 접두사 추가 */
.status.x-risu-active { color: green; }

/* 예외: 띄어쓰기(부모-자식)는 그대로 사용 */
.parent .child { color: blue; }
```

HTML에서는 평소처럼 `class="status active"`로 작성하면 됩니다.

---

## 실전 예시: 상태창 출력

### 1. 백그라운드 임베딩 (CSS)

```html
<style>
.status-panel {
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 12px;
  color: white;
}
/* 클래스가 붙어있으므로 x-risu- 추가 */
.status-panel.x-risu-stat {
  display: flex;
  justify-content: space-between;
}
</style>
```

### 2. 정규식 스크립트 OUT (HTML + CBS)

```html
<div class="status-panel">
  <div class="status-panel header">캐릭터 상태</div>
  <div class="status-panel stat">
    <span>이름:</span>
    <span>{{getvar::char_name}}</span>
  </div>
  <div class="status-panel stat">
    <span>HP:</span>
    <span>{{getvar::hp}}/{{getvar::max_hp}}</span>
  </div>
</div>
```

### CBS와의 조합

HTML보다 CBS가 먼저 처리되므로, `class="{{getvar::status_color}}"`처럼 **클래스명을 동적으로 할당**할 수도 있습니다.

---

**마지막 업데이트**: 2025년 2월
