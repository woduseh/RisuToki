import { escapePreviewHtml } from './preview-format';
import type { PreviewLoreMatch, PreviewSnapshot } from './preview-session';

const EMPTY_STYLE = 'color:#666;padding:8px;';
const TABLE_STYLE = 'width:100%;border-collapse:collapse;font-size:11px;';
const TH_STYLE = 'text-align:left;padding:3px 6px;border-bottom:1px solid #44475a;color:#8be9fd;font-weight:600;';
const TD_STYLE = 'padding:3px 6px;border-bottom:1px solid #2a2e4a;';
const ACTIVE_LORE_STYLE = 'background:rgba(76,175,80,0.1);';
const DISABLED_STYLE = 'opacity:0.45;';
const SUMMARY_STYLE =
  'font-size:11px;color:#8be9fd;padding:4px 6px;margin-bottom:4px;background:rgba(139,233,253,0.06);border-radius:3px;';
const LUA_BUTTON_STYLE =
  'margin-bottom:6px;padding:4px 12px;background:#4a90d9;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;';

// ── Shared helpers for decorator / probability rendering ─────────────

function formatDecoratorTags(match: PreviewLoreMatch): string[] {
  const tags: string[] = [];
  if (match.decorators) {
    const d = match.decorators;
    if (d.depth != null) tags.push(`depth:${d.depth}`);
    if (d.role) tags.push(`role:${d.role}`);
    if (d.position) tags.push(`position:${d.position}`);
    if (d.matchFullWord) tags.push('fullword');
  }
  if (match.effectiveScanDepth != null) {
    tags.push(`scan:${match.effectiveScanDepth}`);
  }
  return tags;
}

function formatProbabilityText(match: PreviewLoreMatch): string | null {
  if (match.probabilityRoll == null || match.activationPercent == null) return null;
  if (match.decorators?.activate || match.reason === '@@activate') return null;
  const pass = match.probabilityRoll <= match.activationPercent;
  return pass
    ? `확률 통과 (${match.probabilityRoll} <= ${match.activationPercent})`
    : `확률 실패 (${match.probabilityRoll} > ${match.activationPercent})`;
}

export function buildPreviewDebugClipboardText(
  snapshot: PreviewSnapshot,
  timeText = new Date().toLocaleTimeString(),
): string {
  const lines: string[] = [];
  lines.push(`=== 프리뷰 디버그 (${timeText}) ===`);
  lines.push(`\n[Lua] ${snapshot.luaInitialized ? '활성' : '비활성'}`);

  if (snapshot.luaOutput.length) {
    lines.push(snapshot.luaOutput.join('\n'));
  }

  // Variable dump
  const varKeys = Object.keys(snapshot.variables);
  if (varKeys.length) {
    lines.push('\n[변수]');
    for (const key of varKeys) {
      lines.push(`  ${key} = ${String(snapshot.variables[key])}`);
    }
  } else {
    lines.push('\n[변수] 없음');
  }

  // Lorebook with match details
  const loreEntries = snapshot.lorebook.filter((entry) => entry.mode !== 'folder');
  const loreCount = loreEntries.length;
  const matchCount = snapshot.loreMatches.length;
  lines.push(`\n[로어북] ${loreCount}개 (${matchCount}개 활성)`);

  if (matchCount > 0) {
    for (const match of snapshot.loreMatches) {
      const entry = snapshot.lorebook[match.index];
      const name = entry?.comment || `#${match.index}`;
      const pctStr = match.activationPercent != null ? ` (${match.activationPercent}%)` : '';
      lines.push(`  ✓ ${name}: ${match.reason}${pctStr}`);

      if (match.matchedKeys?.length) {
        lines.push(`    매칭: ${match.matchedKeys.join(', ')}`);
      }
      if (match.excludedKeys?.length) {
        lines.push(`    제외키: ${match.excludedKeys.join(', ')}`);
      }
      const decoTags = formatDecoratorTags(match);
      if (decoTags.length) {
        lines.push(`    ${decoTags.join(', ')}`);
      }
      const probText = formatProbabilityText(match);
      if (probText) {
        lines.push(`    ${probText}`);
      }
      if (match.warnings?.length) {
        for (const w of match.warnings) {
          lines.push(`    ⚠ ${w}`);
        }
      }
    }
  }

  // Regex with disabled count
  const activeScripts = snapshot.scripts.filter((s) => s.ableFlag !== false);
  const disabledScripts = snapshot.scripts.filter((s) => s.ableFlag === false);
  if (disabledScripts.length > 0) {
    lines.push(`[정규식] ${activeScripts.length}개 활성, ${disabledScripts.length}개 비활성`);
  } else {
    lines.push(`[정규식] ${snapshot.scripts.length}개`);
  }

  lines.push(`\n[메시지] ${snapshot.messages.length}개`);

  for (const message of snapshot.messages) {
    lines.push(`  [${message.role}] ${String(message.content || '').substring(0, 100)}`);
  }

  return lines.join('\n');
}

export function renderPreviewDebugHtml({
  activeTab,
  snapshot,
  luaInitButtonId = 'lua-init-btn',
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
    const nonFolderEntries = snapshot.lorebook.filter((e) => e.mode !== 'folder');
    const totalCount = nonFolderEntries.length;
    const activeCount = snapshot.loreMatches.length;
    const probCount = snapshot.loreMatches.filter((m) => m.activationPercent != null).length;

    // Summary banner
    let html = `<div style="${SUMMARY_STYLE}">${activeCount}/${totalCount} 활성`;
    if (probCount > 0) {
      html += ` · ${probCount}개 확률`;
    }
    html += '</div>';

    html += `<table style="${TABLE_STYLE}"><tr><th style="${TH_STYLE}">#</th><th style="${TH_STYLE}">이름</th><th style="${TH_STYLE}">키</th><th style="${TH_STYLE}">순서</th><th style="${TH_STYLE}">상태</th></tr>`;

    for (let index = 0; index < snapshot.lorebook.length; index += 1) {
      const entry = snapshot.lorebook[index];
      if (entry.mode === 'folder') continue;

      const active = matchSet.has(index);
      const match = snapshot.loreMatches.find((item) => item.index === index);
      const pct = match?.activationPercent;
      const pctSuffix = pct != null ? ` (${pct}%)` : '';
      const insertOrder = entry['insertorder'] as number | undefined;
      const orderStr = insertOrder != null ? String(insertOrder) : '';

      // Selective/secondkey badge
      const isSelective = entry['selective'] === true;
      const secondkey = entry['secondkey'] as string | undefined;
      const selectiveBadge = isSelective && secondkey ? ` 🔗 ${escapePreviewHtml(secondkey)}` : '';

      // Build the base status text
      let statusText: string;
      if (entry.alwaysActive && active) {
        statusText = '🟢 항상' + pctSuffix;
      } else if (entry.alwaysActive) {
        statusText = '⚫ 항상';
      } else if (active) {
        statusText = (pct != null ? '🟡' : '🟢') + ` ${escapePreviewHtml(match?.reason || '')}` + pctSuffix;
      } else if ((entry['activationPercent'] as number | undefined) === 0) {
        statusText = '⛔ 0%';
      } else {
        statusText = entry.key ? '⚫' : '⬜';
      }

      // Append decorator metadata for active entries
      if (active && match) {
        const decoTags = formatDecoratorTags(match);
        if (decoTags.length) {
          statusText += '<br>' + decoTags.map((t) => escapePreviewHtml(t)).join(' ');
        }
        const probText = formatProbabilityText(match);
        if (probText) {
          statusText += '<br>' + probText;
        }
        if (match.warnings?.length) {
          for (const w of match.warnings) {
            statusText += '<br>⚠ ' + escapePreviewHtml(w);
          }
        }
      }

      html += `<tr style="${active ? ACTIVE_LORE_STYLE : ''}"><td style="${TD_STYLE}">${index}</td><td style="${TD_STYLE}">${escapePreviewHtml(entry.comment || '')}${selectiveBadge}</td><td style="${TD_STYLE}">${escapePreviewHtml(entry.key || '')}</td><td style="${TD_STYLE}">${orderStr}</td><td style="${TD_STYLE}">${statusText}</td></tr>`;
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

    const types = ['editinput', 'editoutput', 'editdisplay', 'editprocess', 'edittrans'];
    let html = '';

    // Active scripts grouped by type
    for (const type of types) {
      const filtered = snapshot.scripts.filter((script) => script.type === type && script.ableFlag !== false);
      if (!filtered.length) continue;

      html += `<div style="font-weight:600;color:#4a90d9;margin:4px 0 2px;font-size:11px;">${type} (${filtered.length})</div>`;
      html += `<table style="${TABLE_STYLE}"><tr><th style="${TH_STYLE}">이름</th><th style="${TH_STYLE}">찾기</th><th style="${TH_STYLE}">바꾸기</th><th style="${TH_STYLE}">플래그</th></tr>`;

      for (const script of filtered) {
        const flag = (script['flag'] as string | undefined) || '';
        html += `<tr><td style="${TD_STYLE}">${escapePreviewHtml(script.comment || '')}</td><td style="${TD_STYLE}"><code>${escapePreviewHtml(script.find || script.in || '')}</code></td><td style="${TD_STYLE}"><code>${escapePreviewHtml(String(script.replace || script.out || '').substring(0, 50))}</code></td><td style="${TD_STYLE}"><code>${escapePreviewHtml(flag)}</code></td></tr>`;
      }

      html += '</table>';
    }

    // Disabled scripts section
    const disabled = snapshot.scripts.filter((script) => script.ableFlag === false);
    if (disabled.length > 0) {
      html += `<div style="font-weight:600;color:#666;margin:8px 0 2px;font-size:11px;">비활성 (${disabled.length})</div>`;
      html += `<table style="${TABLE_STYLE}${DISABLED_STYLE}"><tr><th style="${TH_STYLE}">이름</th><th style="${TH_STYLE}">유형</th><th style="${TH_STYLE}">찾기</th></tr>`;
      for (const script of disabled) {
        html += `<tr><td style="${TD_STYLE}">${escapePreviewHtml(script.comment || '')}</td><td style="${TD_STYLE}">${escapePreviewHtml(script.type || '')}</td><td style="${TD_STYLE}"><code>${escapePreviewHtml(script.find || script.in || '')}</code></td></tr>`;
      }
      html += '</table>';
    }

    return html || `<div style="${EMPTY_STYLE}">정규식 없음</div>`;
  }

  return '';
}
