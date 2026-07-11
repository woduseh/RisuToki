---
name: writing-lua-scripts
description: 'Use when writing or debugging Lua 5.4 function bodies, state, chat APIs, LLM calls, UI alerts, or edit listeners in RisuAI Lua mode. Primary skill for Lua code; hand structured/V2 trigger orchestration to writing-trigger-scripts. Do not use when the task is CBS, regex, or mixed trigger modes.'
tags: ['lua', 'scripting', 'automation']
related_tools: ['read_content', 'preview_edit', 'apply_edit', 'manage_items', 'list_lua', 'read_lua']
---

# Writing Lua Scripts for RisuAI

## Mode boundary

Lua mode is stored through the first `triggerlua` wrapper but is edited as a dedicated Lua surface. Treat it as an alternative to structured V1/V2 trigger lists; do not append ordinary trigger entries beside it. Use `list_lua`/`read_lua` or the Lua facade family rather than broad field reads.

## Minimal workflow

1. Identify the event or named function and its input/output contract.
2. Read only the relevant function or range plus any state keys and helpers it calls.
3. Implement global event functions and small local helpers. Keep state names stable and guard absent/invalid values.
4. Await asynchronous APIs and LLM calls where required. Handle cancellation/failure without corrupting state.
5. For `listenEdit`, return the correctly transformed data for the exact edit mode.
6. Preview/apply through the guarded Lua surface, then exercise success, no-op, invalid input, and repeated-event paths.

Core events include `onInput`, `onStart`, `onOutput`, named manual/button handlers, and `listenEdit` modes such as `editInput`, `editOutput`, `editDisplay`, and `editRequest`. Display edits are UI-only; request edits affect model input but not saved history. CBS is not evaluated as Lua syntax—use Lua APIs for state and place CBS only in strings destined for a CBS-enabled surface.

Load [`API_REFERENCE.md`](API_REFERENCE.md) only for exact function signatures. Hand CBS strings, HTML rendering, lorebook mechanics, or regex stages to their owning Skills.

## Safety and validation

Respect low-level-access and sandbox boundaries. Avoid unbounded loops, recursive event feedback, duplicate listeners, uncontrolled LLM calls, and hidden mutation in display handlers. Verify event order, async completion, state persistence, nil handling, id scoping, and that manual handlers match their button names.
