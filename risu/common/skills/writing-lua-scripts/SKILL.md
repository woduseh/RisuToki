---
name: writing-lua-scripts
description: 'Use for RisuAI Lua event functions, state, chat APIs, LLM calls, and edit listeners.'
tags: ['lua', 'scripting', 'automation']
related_tools: ['read_content', 'preview_edit', 'apply_edit', 'manage_items', 'list_lua', 'read_lua']
---

# Writing Lua Scripts for RisuAI

## Mode boundary

Lua mode is stored through the first `triggerlua` wrapper but is edited as a dedicated Lua surface. Treat it as an alternative to structured V1/V2 trigger lists; do not append ordinary trigger entries beside it. Use `list_lua`/`read_lua` or the Lua facade family rather than broad field reads.

## Event contracts

Event functions are globals. A `listenEdit` callback returns the transformed data for its exact edit mode.

Core events include `onInput`, `onStart`, `onOutput`, named manual/button handlers, and `listenEdit` modes such as `editInput`, `editOutput`, `editDisplay`, and `editRequest`. Display edits are UI-only; request edits affect model input but not saved history. CBS is not evaluated as Lua syntax—use Lua APIs for state and place CBS only in strings destined for a CBS-enabled surface.

At the verified RisuAI `2026.8.250` baseline, engines are cached by execution mode and serialized with a per-engine mutex. Globals may survive repeated calls in the same mode but do not cross modes and disappear after source reload or application restart; persist durable state with chat variables or `getState`/`setState`. Use `setChatVarChanged`/`setStateChanged` when downstream work should run only after a real value change, and `getChatData`/`getChatRole`/`getRecentChats` when a full chat snapshot is unnecessary. The callback access key is a capability token, not a chat ID. Edit listeners are forced to non-LLA execution, while `editDisplay` writes are temporary. Returning `false` only sets `stopSending`; cancellation occurs only where the caller consumes it, which the current send path does for `onStart`.

Load [`API_REFERENCE.md`](API_REFERENCE.md) only for exact function signatures, and the guide `risu/common/docs/문법가이드_Lua.md` only when Lua 5.4 language syntax itself is in question. For a genuinely mixed runtime-order problem, load [`RUNTIME_INTEROP.md`](../writing-trigger-scripts/RUNTIME_INTEROP.md). Hand CBS strings, HTML rendering, lorebook mechanics, or regex stages to their owning Skills.

Direct Promise APIs require `:await()` inside a coroutine/async callback. Wrappers that await internally must not be awaited again.
