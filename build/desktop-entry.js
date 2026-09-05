'use strict';
/* global document, window */

// Test bootstrap only: the shipped main/preload/renderer and IPC handlers run unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { stripVTControlCharacters } = require('node:util');
const { app, BrowserWindow, dialog } = require('electron');

const ROOT = path.resolve(__dirname, '..');
const directory = process.env.RISUTOKI_DESKTOP_RUN_DIR;
if (!directory || app.isPackaged) throw new Error('Use build/desktop.js to start a disposable desktop session.');
const session = JSON.parse(fs.readFileSync(path.join(directory, 'session.json'), 'utf8'));
assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(path.join(ROOT, '.build', 'desktop')));
assert.equal(session.directory, directory);
assert.equal(session.data, path.join(directory, 'data'));
assert.equal(
  fs.realpathSync(os.homedir()),
  fs.realpathSync(path.join(session.data, 'home')),
  'Home must be isolated before importing main',
);
assert.equal(fs.realpathSync(os.tmpdir()), fs.realpathSync(path.join(session.data, 'temp')), 'Temp must be isolated');
app.setPath('home', path.join(session.data, 'home'));
app.setPath('appData', path.join(session.data, 'app-data'));
app.setPath('userData', path.join(session.data, 'user-data'));
app.setPath('temp', path.join(session.data, 'temp'));
app.setAppLogsPath(path.join(session.data, 'user-data', 'logs'));
app.setAppPath(ROOT);

const result = {
  schemaVersion: 1,
  status: 'running',
  checks: [],
  errors: [],
  electron: process.versions.electron,
  chrome: process.versions.chrome,
};
const persist = () => fs.writeFileSync(path.join(directory, 'app-result.json'), `${JSON.stringify(result, null, 2)}\n`);
let currentWindow;
let stage = 'startup';
let handlingFailure = false;
persist();

async function capture(name) {
  if (!currentWindow || currentWindow.isDestroyed()) return;
  const screenshot = await currentWindow.webContents.capturePage();
  assert.ok(!screenshot.isEmpty(), 'Chromium screenshot must contain pixels');
  fs.writeFileSync(path.join(directory, `${name}.png`), screenshot.toPNG());
}

async function fail(error) {
  if (handlingFailure) return;
  handlingFailure = true;
  result.status = 'failed';
  result.stage = stage;
  result.error = error.stack || String(error);
  if (currentWindow && !currentWindow.isDestroyed()) {
    try {
      result.inputDiagnostic = await evaluate(() => ({
        activeTag: document.activeElement?.tagName,
        activeClass: document.activeElement?.className,
        editors: window.monaco?.editor.getEditors().map((editor) => ({
          length: editor.getValue().length,
          focused: editor.hasTextFocus(),
          visible: editor.getDomNode()?.getBoundingClientRect().height,
        })),
      }));
    } catch {
      /* Keep the original failure. */
    }
  }
  try {
    await capture('failure');
  } catch {
    /* Preserve the original failure if the renderer died. */
  }
  persist();
  console.error(`[desktop-check] ${stage}: ${result.error}`);
  app.exit(1);
}

process.on('uncaughtException', (error) => {
  void fail(error);
});
process.on('unhandledRejection', (error) => {
  void fail(error);
});
app.on('browser-window-created', (_event, window) => {
  currentWindow = window;
  if (!session.dev || session.devSmoke) {
    window.webContents.setBackgroundThrottling(false);
    window.hide();
  }
  window.webContents.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
    if (isMainFrame) void fail(new Error(`Renderer load failed: ${code} ${description}`));
  });
  window.webContents.on('render-process-gone', (_e, details) => {
    void fail(new Error(`Renderer process exited: ${details.reason}`));
  });
  window.webContents.on('console-message', ({ level, message }) => {
    if (level !== 'error') return;
    if (stage === 'invalid-file' && message.includes('[renderer] handleOpen error:')) return;
    result.errors.push({ stage, message: message.slice(0, 2000) });
  });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(condition, description, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description} (${timeoutMs}ms)`);
}
function evaluate(fn, ...args) {
  return currentWindow.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
}
async function check(name, fn) {
  stage = name;
  const started = Date.now();
  await fn();
  assert.deepEqual(result.errors, [], 'Unexpected Chromium console errors');
  result.checks.push({ name, durationMs: Date.now() - started });
  persist();
  console.log(`[desktop-check] PASS ${name}`);
}
async function rendererReady() {
  await until(
    () =>
      evaluate(() => !!document.querySelector('#menu-button-file') && typeof window.tokiAPI?.getMcpInfo === 'function'),
    'Vue menu and real preload IPC',
  );
  // Vite mounts the Vue shell before its controller import finishes.
  await until(
    async () => {
      const info = await evaluate(() => window.tokiAPI.getMcpInfo());
      if (!info?.port) return false;
      const response = await fetch(`http://127.0.0.1:${info.port}/session/status`, {
        headers: { Authorization: `Bearer ${info.token}` },
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 200);
      return typeof (await response.json()).renderer?.hasUnsavedChanges === 'boolean';
    },
    'renderer controller IPC',
    30000,
  );
}
async function menu(label) {
  await until(
    () =>
      evaluate((text) => {
        const dropdown = document.querySelector('#menu-dropdown-file');
        if (!dropdown) {
          document.querySelector('#menu-button-file').click();
          return false;
        }
        const button = [...dropdown.querySelectorAll('.menu-action')].find((item) =>
          item.textContent.trim().startsWith(text),
        );
        if (!button || button.disabled) throw new Error(`Missing/enabled menu action: ${text}`);
        button.click();
        return true;
      }, label),
    `file menu ${label}`,
  );
  await until(() => evaluate(() => !document.querySelector('#menu-dropdown-file')), 'file menu close');
}
async function openDescription() {
  await until(
    () => evaluate(() => !!document.querySelector('.tree-item[data-label="설명"]')),
    'description sidebar item',
  );
  await evaluate(() => {
    const item = document.querySelector('.tree-item[data-label="설명"]');
    if (!item.getBoundingClientRect().height) throw new Error('Description sidebar item is hidden');
    item.click();
  });
  await until(
    () =>
      evaluate(
        () =>
          !!document.querySelector(
            '#editor-container .native-edit-context, #editor-container textarea.inputarea:not([readonly])',
          ),
      ),
    'Monaco input',
  );
}

function visibleEditorValue() {
  return window.monaco?.editor
    .getEditors()
    .find((editor) => {
      const node = editor.getDomNode();
      return node?.isConnected && node.closest('#editor-container') && node.getBoundingClientRect().height > 0;
    })
    ?.getValue();
}

async function smoke() {
  const saved = path.join(session.data, 'work', 'smoke card 한글.charx');
  const broken = path.join(session.data, 'work', 'broken.charx');
  fs.writeFileSync(broken, 'deliberately invalid synthetic archive');
  let nextOpen;
  let savedDialogs = 0;
  // Only OS file pickers are deterministic. Parsing, editor changes, IPC and disk writes are real.
  dialog.showSaveDialog = async () => {
    savedDialogs++;
    return { canceled: false, filePath: saved };
  };
  dialog.showOpenDialog = async () => {
    assert.ok(nextOpen, 'Unexpected file picker');
    const file = nextOpen;
    nextOpen = null;
    return { canceled: false, filePaths: [file] };
  };
  dialog.showErrorBox = (title, message) => {
    void fail(new Error(`Unexpected native error dialog: ${title}: ${message}`));
  };

  await check('renderer-ready', async () => {
    await rendererReady();
    if (session.injectRendererError) {
      await evaluate(() => console.error('RISUTOKI_SMOKE_INJECTED_RENDERER_ERROR'));
      await sleep(100);
    }
  });
  const text = 'RisuToki desktop verification — 실제 편집·저장·재열기';
  const { openCharx } = require(path.join(ROOT, '.build', 'electron', 'src', 'charx-io.js'));
  await check('create-edit-save', async () => {
    await menu('새로 만들기');
    await openDescription();
    // Monaco's EditContext mode also contains a readonly IME textarea; use its live input.
    currentWindow.webContents.focus();
    await until(
      () =>
        evaluate(() => {
          document
            .querySelector(
              '#editor-container .native-edit-context, #editor-container textarea.inputarea:not([readonly])',
            )
            .focus();
          return window.monaco.editor.getEditors().some((editor) => editor.hasTextFocus());
        }),
      'Monaco input focus',
    );
    await currentWindow.webContents.insertText(text);
    // Observe the editor value; do not replace the editor model or invoke a save handler directly.
    await until(() => evaluate(visibleEditorValue).then((value) => value === text), 'typed description');
    await menu('저장');
    await until(
      () => fs.existsSync(saved) && openCharx(saved).description === text,
      'saved archive with typed description',
    );
    assert.equal(savedDialogs, 1);
    assert.equal(openCharx(saved).name, 'New Character');
    await until(
      () => evaluate(() => document.querySelector('#status-text')?.textContent.includes('저장 완료')),
      'save completion status',
    );
  });
  await check('reopen-saved-file', async () => {
    await menu('새로 만들기');
    await until(
      () => evaluate(() => document.querySelector('#status-text')?.textContent.includes('새 파일 생성됨')),
      'new document',
    );
    nextOpen = saved;
    await menu('열기');
    await until(
      () => evaluate(() => window.tokiAPI.getFilePath()).then((value) => value === saved),
      'reopened file path',
    );
    await openDescription();
    await until(() => evaluate(visibleEditorValue).then((value) => value === text), 'reopened description in editor');
    await capture('saved-and-reopened');
  });
  await check('invalid-file', async () => {
    const before = fs.readFileSync(saved);
    nextOpen = broken;
    await menu('열기');
    await until(
      () => evaluate(() => document.querySelector('#status-text')?.textContent.includes('열기 실패')),
      'visible invalid archive error',
    );
    assert.equal(
      await evaluate(() => window.tokiAPI.getFilePath()),
      saved,
      'Failed open must preserve active document',
    );
    assert.deepEqual(fs.readFileSync(saved), before, 'Failed open must preserve saved bytes');
  });
  await check('authenticated-api', async () => {
    let info;
    await until(async () => {
      info = await evaluate(() => window.tokiAPI.getMcpInfo());
      return !!info?.port;
    }, 'local API readiness');
    const url = `http://127.0.0.1:${info.port}/session/status`;
    assert.equal((await fetch(url, { signal: AbortSignal.timeout(5000) })).status, 401);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${info.token}` },
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.loaded, true);
    assert.equal(status.document.filePath, saved, 'HTTP API must observe the file opened by the UI');
    assert.equal(status.renderer?.hasUnsavedChanges, false, 'Renderer IPC must confirm a clean saved document');
    // Credentials stay in process memory and the disposable home, never the report.
    result.apiPort = info.port;
  });
  await check('native-image', async () => {
    const sharp = require('sharp');
    const png = await sharp({ create: { width: 3, height: 2, channels: 4, background: '#ff4000' } })
      .png()
      .toBuffer();
    const webp = await sharp(png).webp({ lossless: true }).toBuffer();
    const metadata = await sharp(webp).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 3);
    assert.equal(metadata.height, 2);
    assert.deepEqual(await sharp(webp).ensureAlpha().raw().toBuffer(), await sharp(png).ensureAlpha().raw().toBuffer());
  });
  await check('native-terminal', async () => {
    const marker = `RISUTOKI_NATIVE_${Date.now()}`;
    const output = await evaluate(async (marker) => {
      const api = window.tokiAPI;
      const terminal = await api.terminalNewSession('Desktop native check');
      let output = '';
      let timer;
      const removeData = api.onTerminalDataSession((id, data) => {
        if (id === terminal.id) output += data;
      });
      let removeExit;
      const exited = new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), 10000);
        removeExit = api.onTerminalExitSession((id) => {
          if (id === terminal.id) resolve(true);
        });
      });
      try {
        if (!(await api.terminalStartSession(terminal.id, 240, 30))) throw new Error('Native terminal failed to start');
        api.terminalResizeSession(terminal.id, 320, 32);
        api.terminalInputSession(terminal.id, `echo ${marker}\rexit\r`);
        if (!(await exited)) throw new Error('Native terminal did not exit');
        if (await api.terminalIsSessionRunning(terminal.id)) throw new Error('Native terminal is still running');
        return output;
      } finally {
        clearTimeout(timer);
        removeData();
        removeExit();
        await api.terminalStopSession(terminal.id);
      }
    }, marker);
    // Match the output line, not the echoed input command.
    const lines = stripVTControlCharacters(output).split(/[\r\n]+/);
    assert.ok(lines.some((line) => line.trim() === marker), 'Native terminal output was not received');
  });
  await check('clean-close', async () => {
    result.status = 'passed';
    persist();
  });
  currentWindow.close();
  // A blocked dirty-dialog or hung shutdown must not appear to pass.
  setTimeout(() => {
    result.status = 'failed';
    result.error = 'Application failed to close normally';
    persist();
    app.exit(1);
  }, 10000).unref();
}

require(path.join(ROOT, '.build', 'electron', 'main.js'));
app
  .whenReady()
  .then(async () => {
    await until(() => !!currentWindow && !currentWindow.webContents.isLoading(), 'main window load');
    if (session.dev && !session.devSmoke) {
      await check('renderer-ready', rendererReady);
      currentWindow.show();
      result.status = 'passed';
      persist();
      console.log('[desktop-check] READY: close the app or press Ctrl+C to stop and clean this session.');
      return;
    }
    await smoke();
  })
  .catch(fail);
app.on('will-quit', () => {
  if (result.errors.length) {
    result.status = 'failed';
    result.error = 'Unexpected renderer errors';
  }
  result.windowsRemaining = BrowserWindow.getAllWindows().length;
  result.shutdown = result.windowsRemaining === 0 ? 'closed' : 'incomplete';
  if (result.shutdown !== 'closed') {
    result.status = 'failed';
    result.error = 'Application quit with a live window';
  }
  persist();
});
