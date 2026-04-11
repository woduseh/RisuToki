---
name: writing-plugins-v3
description: 'Guides writing RisuAI Plugin API v3.0 scripts. Covers metadata headers, iframe sandbox model, all-async API usage, SafeElement/SafeDocument wrappers, storage tiers, UI registration, provider/MCP integration, security boundaries, and permissions. Use when creating, editing, or reviewing plugin .js/.ts files.'
tags: ['plugin', 'v3', 'sandbox', 'api', 'javascript']
artifact_types: ['plugin-v3']
canonical_sources:
  [
    'Risuai/plugins.md',
    'Risuai/src/ts/plugins/apiV3/risuai.d.ts',
    'Risuai/src/ts/plugins/migrationGuide.md',
    'Risuai/src/ts/plugins/apiV3/v3.svelte.ts',
    'Risuai/src/ts/plugins/apiV3/factory.ts',
    'Risuai/src/ts/plugins/pluginSafety.ts',
  ]
---

# Writing RisuAI Plugins (API v3.0)

RisuAI plugins are JavaScript/TypeScript extensions that run inside a **sandboxed iframe**. API v3.0 is the current recommended surface for new plugins.

Every host call crosses an iframe `postMessage` boundary, so **all `risuai.*` methods and all `SafeElement` methods are async**.

## Canonical upstream sources

- `Risuai/src/ts/plugins/apiV3/risuai.d.ts`
- `Risuai/plugins.md`
- `Risuai/src/ts/plugins/migrationGuide.md`
- `Risuai/src/ts/plugins/apiV3/v3.svelte.ts`
- `Risuai/src/ts/plugins/apiV3/factory.ts`
- `Risuai/src/ts/plugins/pluginSafety.ts`

## Supporting files

| File                                                 | Contents                            |
| ---------------------------------------------------- | ----------------------------------- |
| [`../docs/API_QUICKREF.md`](../docs/API_QUICKREF.md) | API categories and method reminders |
| [`../docs/MIGRATION.md`](../docs/MIGRATION.md)       | v2.x → v3.0 migration steps         |

## Mental model

```text
Plugin code
  -> runs inside sandboxed iframe
  -> talks to host through postMessage
  -> receives SafeElement/SafeDocument wrappers for host DOM
```

Key implications:

1. **All API calls are async**
2. **Your iframe `document` is different from the host/root document**
3. **Data crossing the boundary must be structured-clone-safe**
4. **Each plugin is isolated unless you intentionally use storage or IPC**

## Metadata header

Place metadata comments at the top of the script:

```javascript
//@name my_plugin
//@display-name My Plugin
//@api 3.0
//@version 1.2.0
//@arg api_key string Your API key
//@arg max_items int Maximum items
//@link https://example.com Docs
//@update-url https://raw.githubusercontent.com/user/repo/main/plugin.js
```

### Critical rules

- `//@name` is the internal identity; do not rename it after release.
- `//@api 3.0` opts into the v3 sandbox/runtime contract.
- `//@allowed-ipc other_plugin` is required on both sides for plugin IPC.

## Entry-point pattern

```javascript
//@name my_plugin
//@api 3.0

(async () => {
  try {
    const char = await risuai.getCharacter();
    console.log(char?.name);
  } catch (error) {
    console.log(`Plugin failed: ${error.message}`);
  }
})();
```

Wrap top-level logic in an async IIFE and handle failures explicitly. Silent async mistakes are otherwise hard to diagnose.

## The all-async rule

```javascript
// Wrong
const char = risuai.getCharacter();

// Right
const char = await risuai.getCharacter();

// Wrong
element.setTextContent('hello');

// Right
await element.setTextContent('hello');
```

Missing `await` is the most common plugin v3 mistake.

## Two DOM contexts

### 1. Iframe DOM (preferred for plugin UI)

Your plugin owns its iframe `document`. Use it for custom screens, settings UIs, and applets.

```javascript
document.body.innerHTML = '<button id="close">Close</button>';
document.getElementById('close').addEventListener('click', async () => {
  await risuai.hideContainer();
});
await risuai.showContainer('fullscreen');
```

### 2. Host DOM (`getRootDocument()`)

This returns `SafeDocument` / `SafeElement` wrappers and usually requires `mainDom` permission.

Use it only when you must touch the main app DOM.

## `SafeElement` essentials

| Standard DOM instinct       | v3 equivalent                       | Notes               |
| --------------------------- | ----------------------------------- | ------------------- |
| `el.textContent = 'x'`      | `await el.setTextContent('x')`      | async setter        |
| `el.innerHTML = ...`        | `await el.setInnerHTML(...)`        | sanitized           |
| `el.setAttribute('id','x')` | `await el.setAttribute('x-id','x')` | `x-` prefix only    |
| `el.style.color = 'red'`    | `await el.setStyle('color', 'red')` | style helper        |
| `el.addEventListener(...)`  | `await el.addEventListener(...)`    | returns listener id |

Extra constraints:

- keyboard events are filtered/delayed
- non-whitelisted tags may downgrade to `<div>`
- only `http:` / `https:` anchors are allowed

## Storage tiers

| Storage                           | Scope                | Notes             |
| --------------------------------- | -------------------- | ----------------- |
| `pluginStorage`                   | save-file / syncable | JSON-serializable |
| `safeLocalStorage`                | device-local         | strings only      |
| `getLocalPluginStorage()`         | device-local         | JSON-serializable |
| plugin arguments                  | plugin config        | `string` / `int`  |
| `getDatabase()` / `setDatabase()` | app DB subset        | permission-gated  |

Prefer `pluginStorage` for plugin-owned durable state that should move with the save.

## UI registration

### Settings entry

```javascript
await risuai.registerSetting(
  'My Plugin',
  async () => {
    await risuai.showContainer('fullscreen');
  },
  '⚙️',
  'html',
);
```

### Buttons

```javascript
await risuai.registerButton({ name: 'Quick Action', icon: '🔥', iconType: 'html', location: 'action' }, async () => {
  /* ... */
});
```

Use stable `id` values when you want reload/update behavior to replace existing UI cleanly.

## Advanced capabilities

| Capability           | API                                                                  | Notes                                   |
| -------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| custom provider      | `addProvider(...)`                                                   | permission-gated                        |
| MCP bridge           | `registerMCP(...)`                                                   | identifier must start with `plugin:`    |
| prompt/request hooks | `addRisuScriptHandler`, `addRisuReplacer`, `registerBodyIntercepter` | note upstream misspelling `Intercepter` |
| LLM calls            | `runLLMModel(...)`                                                   | async helper                            |
| plugin IPC           | `addPluginChannelListener`, `postPluginChannelMessage`               | both sides need `//@allowed-ipc`        |

## Security boundary

| Layer              | Mechanism                                           |
| ------------------ | --------------------------------------------------- |
| iframe sandbox     | plugin runs outside the main app DOM/context        |
| CSP                | no freeform network from iframe itself              |
| AST safety         | blocks patterns such as `eval()` / `new Function()` |
| global rewrites    | guarded globals and storage wrappers                |
| structured cloning | no raw DOM/function transfer across boundary        |
| permissions        | sensitive areas require explicit user consent       |

Design with these limits, do not fight them.

## TypeScript support

Plugins can be written in TypeScript. RisuAI transpiles plugin TS with Sucrase (TypeScript transform only; no JSX). The app can generate a plugin template that includes `risuai.d.ts`.

## Best practices

1. `await` every `risuai.*` and `SafeElement` call.
2. Use iframe `document` for plugin-owned UI before reaching for host DOM.
3. Clean up listeners/UI with `onUnload(...)`.
4. Keep metadata stable, especially `//@name`.
5. Prefer official APIs (`registerSetting`, `registerButton`, `registerMCP`) over DOM hacks.
6. Respect permission prompts and fail explicitly when access is denied.
