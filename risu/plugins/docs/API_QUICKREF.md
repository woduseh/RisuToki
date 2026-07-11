# RisuAI Plugin API v3.0 — Quick Reference

> Verified against RisuAI `2026.6.214`, commit `9d8791ea842404ef3c7e6410c2359a2db7ca4bcd`, on 2026-07-11.
> Canonical sources: `src/ts/plugins/apiV3/risuai.d.ts`, `factory.ts`, and the repository-root `plugins.md`.
> Both global names `risuai` and `Risuai` reference the same API proxy. Examples prefer lowercase `risuai` consistently.
> API and safe-wrapper methods are asynchronous. Cached properties such as `apiVersion` are read directly.

## Runtime / version

| API                               | Returns                                | Notes                                |
| --------------------------------- | -------------------------------------- | ------------------------------------ |
| `risuai.apiVersion`               | `string`                               | `"3.0"`                              |
| `risuai.apiVersionCompatibleWith` | `string[]`                             | compatible versions                  |
| `risuai.getRuntimeInfo()`         | `{ apiVersion, platform, saveMethod }` | `platform`: `web` / `tauri` / `node` |

## Character / chat

| API                                                             | Returns                | Notes                                     |
| --------------------------------------------------------------- | ---------------------- | ----------------------------------------- |
| `getCharacter()` / `setCharacter(char)`                         | current char / `void`  | preferred over legacy `getChar`/`setChar` |
| `getCharacterFromIndex(idx)` / `setCharacterToIndex(idx, char)` | `any \| null` / `void` | indexed character access                  |
| `getChatFromIndex(charIdx, chatIdx)` / `setChatToIndex(...)`    | `any \| null` / `void` | indexed chat access                       |
| `getCurrentCharacterIndex()`                                    | `number`               | current character index                   |
| `getCurrentChatIndex()`                                         | `number`               | current chat index                        |
| `sendChat(message)`                                             | `boolean`              | requires `sendChat` permission            |

## Storage

| API                                                             | Scope                | Notes                    |
| --------------------------------------------------------------- | -------------------- | ------------------------ |
| `pluginStorage.getItem/setItem/removeItem/clear/keys/length`    | save-file / syncable | JSON-serializable values |
| `safeLocalStorage.getItem/setItem/removeItem/clear/keys/length` | device-local         | string values only       |
| `getLocalPluginStorage()`                                       | device-local         | JSON-serializable values |
| `getArgument(key)` / `setArgument(key, value)`                  | plugin config        | `string` or `int` args   |

## Database

| API                         | Returns                  | Notes                    |
| --------------------------- | ------------------------ | ------------------------ |
| `getDatabase(includeOnly?)` | `DatabaseSubset \| null` | requires `db` permission |
| `setDatabaseLite(db)`       | `void`                   | lighter save             |
| `setDatabase(db)`           | `void`                   | full save / sync path    |

## Container / DOM

| API                                | Returns                | Notes                         |
| ---------------------------------- | ---------------------- | ----------------------------- |
| `showContainer('fullscreen')`      | `void`                 | make iframe UI visible        |
| `hideContainer()`                  | `void`                 | hide iframe UI                |
| `getRootDocument()`                | `SafeDocument \| null` | requires `mainDom` permission |
| `createMutationObserver(callback)` | `SafeMutationObserver` | host-side observation         |
| `unwarpSafeArray(safeArray)`       | `T[]`                  | unwrap helper                 |

## `SafeElement`

`SafeElement` wraps host DOM nodes. Use async methods instead of direct DOM property assignment.

### Common methods

- text: `innerText()`, `textContent()`, `setInnerText(val)`, `setTextContent(val)`
- html: `getInnerHTML()`, `getOuterHTML()`, `setInnerHTML(val)`, `setOuterHTML(val)`
- tree: `appendChild`, `removeChild`, `replaceChild`, `replaceWith`, `prepend`, `remove`
- query: `querySelector`, `querySelectorAll`, `getElementById`, `getElementsByClassName`, `getChildren`, `getParent`, `matches`
- style/class: `setStyle`, `getStyle`, `setStyleAttribute`, `addClass`, `removeClass`, `setClassName`, `hasClass`
- misc: `focus`, `scrollIntoView`, `nodeName`, `nodeType`

### Restrictions

- `setAttribute` only accepts **`x-`-prefixed** attributes
- `setInnerHTML` / `setOuterHTML` are sanitized
- keyboard events are delayed / filtered
- `createAnchorElement(href)` only accepts `http:` / `https:`

## UI registration

| API                                                                  | Notes                        |
| -------------------------------------------------------------------- | ---------------------------- |
| `registerSetting(name, callback, icon?, iconType?, id?)`             | settings menu entry          |
| `registerButton({ name, icon, iconType, location?, id? }, callback)` | action/chat/hamburger button |
| `unregisterUIPart(id)`                                               | remove registered UI part    |

## Network / providers / LLM

| API                                             | Notes                                      |
| ----------------------------------------------- | ------------------------------------------ |
| `nativeFetch(url, options?)`                    | host-side fetch; blocked for some domains  |
| `addProvider(name, func, options?)`             | custom provider; requires periodic consent |
| `runLLMModel({ mode, messages, staticModel? })` | ask an LLM from plugin code                |

## Script handlers / replacers / interceptors

| API                                                                   | Notes                                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `addRisuScriptHandler(mode, func)` / `removeRisuScriptHandler(...)`   | modes: `display`, `output`, `input`, `process`                       |
| `addRisuReplacer(type, func)` / `removeRisuReplacer(...)`             | types: `beforeRequest`, `afterRequest`                               |
| `registerBodyIntercepter(callback)` / `unregisterBodyIntercepter(id)` | note upstream spelling `Intercepter`; requires `replacer` permission |

## MCP / IPC

| API                                                      | Notes                                            |
| -------------------------------------------------------- | ------------------------------------------------ |
| `registerMCP(config, getToolList, callTool)`             | `config.identifier` must start with `plugin:`    |
| `unregisterMCP(identifier)`                              | remove plugin MCP provider                       |
| `addPluginChannelListener(channel, callback)`            | inbound IPC                                      |
| `postPluginChannelMessage(pluginName, channel, message)` | outbound IPC; both plugins need `//@allowed-ipc` |

## Permissions / logging / utility

| API                                                              | Notes                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `requestPluginPermission(perm)`                                  | `fetchLogs`, `db`, `mainDom`, `replacer`, `provider`, `sendChat` |
| `getFetchLogs()`                                                 | requires `fetchLogs` permission                                  |
| `alert(msg)`, `alertConfirm(msg)`, `alertError(msg)`             | host dialogs                                                     |
| `searchTranslationCache(partialKey)`, `getTranslationCache(key)` | translation-cache helpers                                        |
| `onUnload(callback)`                                             | cleanup hook                                                     |

## High-level rules

1. Await API and safe-wrapper method calls; read cached properties such as `apiVersion` directly.
2. Use iframe `document` for plugin-owned UI; it is simpler and less restricted.
3. Treat API spellings literally, including upstream typos such as `registerBodyIntercepter`.
4. Handle permission denial and rejected calls as normal failure paths, and unregister listeners/UI/hooks on unload where supported.
