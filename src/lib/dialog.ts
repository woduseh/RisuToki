import type { McpApprovalMode } from './app-settings';

// ==================== Custom Confirm (MomoTalk style) ====================

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.className = 'settings-popup';
    box.style.cssText += 'min-width:320px;max-width:400px;';

    const header = document.createElement('div');
    header.className = 'help-popup-header';
    header.innerHTML = '<span>확인</span>';

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px;';

    const msg = document.createElement('div');
    msg.style.cssText =
      'font-size:13px;color:var(--text-primary);margin-bottom:14px;line-height:1.5;white-space:pre-wrap;';
    msg.textContent = message;
    body.appendChild(msg);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    const btnNo = document.createElement('button');
    btnNo.textContent = '아니오';
    btnNo.style.cssText =
      'padding:6px 20px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:13px;';
    const btnYes = document.createElement('button');
    btnYes.textContent = '예';
    btnYes.style.cssText =
      'padding:6px 20px;border:none;border-radius:4px;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;';
    btns.appendChild(btnNo);
    btns.appendChild(btnYes);
    body.appendChild(btns);

    box.appendChild(header);
    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    btnYes.focus();

    const close = (val: boolean): void => {
      overlay.remove();
      resolve(val);
    };
    btnYes.addEventListener('click', () => close(true));
    btnNo.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') close(true);
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey, { once: true });
  });
}

let mcpConfirmAllowAllForSession = false;

const SENSITIVE_MCP_CONFIRM_PATTERNS = [
  /delete|remove|삭제|제거/i,
  /external|unopened|외부\s*파일|열지\s*않은/i,
  /open\s+file|switch|파일\s*열기|전환/i,
  /import|restore|reassemble|가져오기|복원|재조립/i,
  /compress|rename|압축|이름\s*변경/i,
  /overwrite|replace\s+entire|전체\s*(교체|덮어쓰기)|덮어쓰기/i,
];

export function mcpConfirmationNeedsPrompt(title: string, message: string): boolean {
  const source = `${title}\n${message}`;
  return SENSITIVE_MCP_CONFIRM_PATTERNS.some((pattern) => pattern.test(source));
}

export function showMcpConfirm(title: string, message: string, mode: McpApprovalMode): Promise<boolean> {
  if (mode === 'allow-all' || mcpConfirmAllowAllForSession) return Promise.resolve(true);
  if (mode === 'auto' && !mcpConfirmationNeedsPrompt(title, message)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.className = 'settings-popup';
    box.style.cssText += 'min-width:320px;max-width:440px;';
    const header = document.createElement('div');
    header.className = 'help-popup-header';
    header.innerHTML = '<span>MCP 작업 승인</span>';
    const body = document.createElement('div');
    body.style.cssText = 'padding:16px;';
    const msg = document.createElement('div');
    msg.style.cssText =
      'font-size:13px;color:var(--text-primary);margin-bottom:14px;line-height:1.5;white-space:pre-wrap;';
    msg.textContent = `[${title}]\n${message}`;
    body.appendChild(msg);

    const toggleRow = document.createElement('label');
    toggleRow.style.cssText =
      'display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);margin-bottom:14px;cursor:pointer;user-select:none;';
    const toggleCb = document.createElement('input');
    toggleCb.type = 'checkbox';
    toggleRow.append(toggleCb, document.createTextNode('앱을 종료할 때까지 MCP 작업 전부 허용'));
    body.appendChild(toggleRow);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    const btnNo = document.createElement('button');
    btnNo.textContent = '거부';
    btnNo.className = 'settings-btn';
    const btnYes = document.createElement('button');
    btnYes.textContent = '허용';
    btnYes.className = 'settings-btn';
    btns.append(btnNo, btnYes);
    body.appendChild(btns);
    box.append(header, body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    btnYes.focus();

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') close(true);
      if (event.key === 'Escape') close(false);
    };
    const close = (allowed: boolean): void => {
      if (allowed && toggleCb.checked) mcpConfirmAllowAllForSession = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(allowed);
    };
    btnYes.addEventListener('click', () => close(true));
    btnNo.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false);
    });
    document.addEventListener('keydown', onKey);
  });
}

export function resetMcpConfirmAllowAll(): void {
  mcpConfirmAllowAllForSession = false;
}

// ==================== Close Confirm (3-button MomoTalk popup) ====================
export function showCloseConfirm(): Promise<number> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.className = 'settings-popup';
    box.style.cssText += 'min-width:340px;max-width:420px;';

    const header = document.createElement('div');
    header.className = 'help-popup-header';
    header.innerHTML = '<span>종료 확인</span>';

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px;';

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:13px;color:var(--text-primary);margin-bottom:16px;line-height:1.5;';
    msg.textContent = '저장하지 않은 변경사항이 있을 수 있습니다.\n종료하시겠습니까?';
    body.appendChild(msg);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = '취소';
    btnCancel.style.cssText =
      'padding:6px 16px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:13px;';

    const btnNoSave = document.createElement('button');
    btnNoSave.textContent = '저장하지 않고 닫기';
    btnNoSave.style.cssText =
      'padding:6px 16px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-secondary);color:#e74c3c;cursor:pointer;font-size:13px;';

    const btnSave = document.createElement('button');
    btnSave.textContent = '저장하고 닫기';
    btnSave.style.cssText =
      'padding:6px 16px;border:none;border-radius:4px;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;';

    btns.appendChild(btnCancel);
    btns.appendChild(btnNoSave);
    btns.appendChild(btnSave);
    body.appendChild(btns);

    box.appendChild(header);
    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    btnSave.focus();

    const close = (val: number): void => {
      overlay.remove();
      resolve(val);
    };
    btnSave.addEventListener('click', () => close(0));
    btnNoSave.addEventListener('click', () => close(1));
    btnCancel.addEventListener('click', () => close(2));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(2);
    });
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') close(2);
      },
      { once: true },
    );
  });
}

// ==================== Custom Prompt (Electron has no window.prompt) ====================
export function showPrompt(message: string, defaultValue?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText =
      'background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;padding:16px;min-width:320px;box-shadow:0 4px 16px rgba(0,0,0,0.3);';
    const label = document.createElement('div');
    label.textContent = message;
    label.style.cssText = 'margin-bottom:8px;font-size:13px;color:var(--text-primary);';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue || '';
    input.style.cssText =
      'width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px;box-sizing:border-box;';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px;';
    const btnOk = document.createElement('button');
    btnOk.textContent = '확인';
    btnOk.style.cssText =
      'padding:4px 16px;border:none;border-radius:4px;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = '취소';
    btnCancel.style.cssText =
      'padding:4px 16px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:13px;';
    btns.appendChild(btnCancel);
    btns.appendChild(btnOk);
    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
    input.select();
    const close = (val: string | null): void => {
      overlay.remove();
      resolve(val);
    };
    btnOk.addEventListener('click', () => close(input.value));
    btnCancel.addEventListener('click', () => close(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value);
      if (e.key === 'Escape') close(null);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
  });
}

export function showSessionRecoveryDialog(summary: {
  sourceFileName: string;
  savedAt: string;
  staleWarning?: string | null;
}): Promise<'restore' | 'open-original' | 'ignore'> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.className = 'settings-popup';
    box.style.cssText += 'min-width:340px;max-width:440px;';

    const header = document.createElement('div');
    header.className = 'help-popup-header';
    header.innerHTML = '<span>자동 저장 복원</span>';

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px;';

    const msg = document.createElement('div');
    msg.style.cssText =
      'font-size:13px;color:var(--text-primary);margin-bottom:16px;line-height:1.6;white-space:pre-wrap;';
    msg.textContent = [
      '비정상 종료 뒤 자동 저장 파일이 발견되었습니다.',
      `자동 저장: ${summary.savedAt}`,
      `원본: ${summary.sourceFileName}`,
      summary.staleWarning || '',
    ]
      .filter(Boolean)
      .join('\n');
    body.appendChild(msg);

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;';

    const btnIgnore = document.createElement('button');
    btnIgnore.textContent = '무시';
    btnIgnore.style.cssText =
      'padding:6px 16px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:13px;';

    const btnOpenOriginal = document.createElement('button');
    btnOpenOriginal.textContent = '원본 열기';
    btnOpenOriginal.style.cssText =
      'padding:6px 16px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:13px;';

    const btnRestore = document.createElement('button');
    btnRestore.textContent = '자동 저장 복원';
    btnRestore.style.cssText =
      'padding:6px 16px;border:none;border-radius:4px;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;';

    btns.appendChild(btnIgnore);
    btns.appendChild(btnOpenOriginal);
    btns.appendChild(btnRestore);
    body.appendChild(btns);

    box.appendChild(header);
    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    btnRestore.focus();

    const onKeydown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close('ignore');
    };

    const close = (value: 'restore' | 'open-original' | 'ignore'): void => {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(value);
    };

    btnRestore.addEventListener('click', () => close('restore'));
    btnOpenOriginal.addEventListener('click', () => close('open-original'));
    btnIgnore.addEventListener('click', () => close('ignore'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('ignore');
    });
    document.addEventListener('keydown', onKeydown);
  });
}
