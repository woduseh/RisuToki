import { escapePreviewHtml } from './preview-format';
import type { PreviewSnapshot } from './preview-session';

const EMPTY_STYLE = 'color:#666;padding:8px;';
const TABLE_STYLE = 'width:100%;border-collapse:collapse;font-size:11px;';
const TH_STYLE = 'text-align:left;padding:3px 6px;border-bottom:1px solid #44475a;color:#8be9fd;font-weight:600;';
const TD_STYLE = 'padding:3px 6px;border-bottom:1px solid #2a2e4a;';
const ACTIVE_LORE_STYLE = 'background:rgba(76,175,80,0.1);';
const LUA_BUTTON_STYLE = 'margin-bottom:6px;padding:4px 12px;background:#4a90d9;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;';

export function buildPreviewDebugClipboardText(snapshot: PreviewSnapshot, timeText = new Date().toLocaleTimeString()): string {
  const lines: string[] = [];
  lines.push(`=== 프리뷰 디버그 (${timeText}) ===`);
  lines.push(`\n[Lua] ${snapshot.luaInitialized ? '활성' : '비활성'}`);

  if (snapshot.luaOutput.length) {
    lines.push(snapshot.luaOutput.join('\n'));
  }

  const loreCount = snapshot.lorebook.filter((entry) => entry.mode !== 'folder').length;
  lines.push(`\n[로어북] ${loreCount}개`);
  lines.push(`[정규식] ${snapshot.scripts.length}개`);
  lines.push(`\n[메시지] ${snapshot.messages.length}개`);

  for (const message of snapshot.messages) {
    lines.push(`  [${message.role}] ${String(message.content || '').substring(0, 100)}`);
  }

  return lines.join('\n');
}

export function renderPreviewDebugHtml({
  activeTab,
  snapshot,
  luaInitButtonId = 'lua-init-btn'
}: {
  activeTab: 'variables' | 'lorebook' | 'lua' | 'regex' | string;
  snapshot: PreviewSnapshot;
  luaInitButtonId?: string;
}): string {
  if (activeTab === 'variables') {
    const keys = Object.keys(snapshot.variables);
    if (!keys.length) {
      return `<div style="${EMPTY_STYLE}">변수 없음</div>`;
    }

    let html = `<table style="${TABLE_STYLE}"><tr><th style="${TH_STYLE}">이름</th><th style="${TH_STYLE}">값</th></tr>`;
    for (const key of keys) {
      html += `<tr><td style="${TD_STYLE}">${escapePreviewHtml(key)}</td><td style="${TD_STYLE}">${escapePreviewHtml(String(snapshot.variables[key]))}</td></tr>`;
    }
    html += '</table>';

    if (snapshot.defaultVariables) {
      html += `<pre style="background:#161b33;padding:8px;border-radius:4px;overflow-x:auto;font-size:11px;min-height:50px;margin:6px 0 0;">${escapePreviewHtml(snapshot.defaultVariables)}</pre>`;
    }

    return html;
  }

  if (activeTab === 'lorebook') {
    if (!snapshot.lorebook.length) {
      return `<div style="${EMPTY_STYLE}">로어북 없음</div>`;
    }

    const matchSet = new Set(snapshot.loreMatches.map((match) => match.index));
    let html = `<table style="${TABLE_STYLE}"><tr><th style="${TH_STYLE}">#</th><th style="${TH_STYLE}">이름</th><th style="${TH_STYLE}">키</th><th style="${TH_STYLE}">상태</th></tr>`;

    for (let index = 0; index < snapshot.lorebook.length; index += 1) {
      const entry = snapshot.lorebook[index];
      if (entry.mode === 'folder') continue;

      const active = matchSet.has(index);
      const match = snapshot.loreMatches.find((item) => item.index === index);
      html += `<tr style="${active ? ACTIVE_LORE_STYLE : ''}"><td style="${TD_STYLE}">${index}</td><td style="${TD_STYLE}">${escapePreviewHtml(entry.comment || '')}</td><td style="${TD_STYLE}">${escapePreviewHtml(entry.key || '')}</td><td style="${TD_STYLE}">${
        entry.alwaysActive ? '🟢 항상' : active ? `🟢 ${escapePreviewHtml(match?.reason || '')}` : entry.key ? '⚫' : '⬜'
      }</td></tr>`;
    }

    html += '</table>';
    return html;
  }

  if (activeTab === 'lua') {
    let html = '';
    if (!snapshot.luaInitialized) {
      html += `<button id="${luaInitButtonId}" style="${LUA_BUTTON_STYLE}">Lua 초기화</button>`;
    } else {
      html += '<div style="color:#4caf50;font-size:11px;margin-bottom:4px;">✅ Lua 활성</div>';
    }

    html += `<pre style="background:#161b33;padding:8px;border-radius:4px;overflow-x:auto;font-size:11px;min-height:50px;margin:0;">${snapshot.luaOutput.length ? escapePreviewHtml(snapshot.luaOutput.join('\n')) : '(출력 없음)'}</pre>`;
    return html;
  }

  if (activeTab === 'regex') {
    if (!snapshot.scripts.length) {
      return `<div style="${EMPTY_STYLE}">정규식 없음</div>`;
    }

    const types = ['editinput', 'editoutput', 'editdisplay', 'editrequest'];
    let html = '';

    for (const type of types) {
      const filtered = snapshot.scripts.filter((script) => script.type === type && script.ableFlag !== false);
      if (!filtered.length) continue;

      html += `<div style="font-weight:600;color:#4a90d9;margin:4px 0 2px;font-size:11px;">${type} (${filtered.length})</div>`;
      html += `<table style="${TABLE_STYLE}"><tr><th style="${TH_STYLE}">이름</th><th style="${TH_STYLE}">찾기</th><th style="${TH_STYLE}">바꾸기</th></tr>`;

      for (const script of filtered) {
        html += `<tr><td style="${TD_STYLE}">${escapePreviewHtml(script.comment || '')}</td><td style="${TD_STYLE}"><code>${escapePreviewHtml(script.find || script.in || '')}</code></td><td style="${TD_STYLE}"><code>${escapePreviewHtml(String(script.replace || script.out || '').substring(0, 50))}</code></td></tr>`;
      }

      html += '</table>';
    }

    return html || `<div style="${EMPTY_STYLE}">정규식 없음</div>`;
  }

  return '';
}
