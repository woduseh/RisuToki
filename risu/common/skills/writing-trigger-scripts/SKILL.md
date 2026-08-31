---
name: writing-trigger-scripts
description: 'Use when planning or debugging structured/V2 trigger entries, event ordering, GUI actions, or manual trigger orchestration. Primary skill for structured trigger systems; hand Lua-mode function bodies to writing-lua-scripts. Do not use when the artifact uses a first-slot triggerlua wrapper, regex-only behavior, or CBS-only logic.'
tags: ['triggers', 'workflow', 'automation']
related_tools: ['read_content', 'preview_edit', 'apply_edit', 'manage_items', 'list_triggers', 'read_trigger_batch']
---

# Writing Structured Trigger Scripts

## Mode boundary

Structured/V2 triggers and Lua mode are alternative authoring modes. If the first trigger is a `triggerlua` wrapper, stop and use `writing-lua-scripts`; do not mix additional V1/V2 entries into that list.

## Minimal workflow

1. Define the event, condition, action, state effects, and whether the result is model-visible, stored, or display-only.
2. Select the structured event and inspect sibling triggers to preserve order and avoid duplicate effects.
3. Build the smallest GUI/V2 action sequence. Use manual/button triggers for explicit user action and stable trigger names.
4. Hand embedded CBS, regex, or HTML details to their owning Skill rather than duplicating syntax rules.
5. Preview/apply through the structured trigger surface, then test event order, no-op conditions, repeated firing, and state boundaries.

Important timing distinctions: input logic occurs around user submission, start/request logic affects prompt construction, output logic follows generation, display logic is UI-only, and manual triggers run only on explicit invocation. There is no universal pipeline that makes every trigger, Lua listener, regex stage, and CBS evaluation interchangeable.

At the verified RisuAI `2026.8.250` baseline, `input` runs before the new user message is appended, `start` runs during prompt assembly on every send, `output` runs after the response `runVar` pass, and `display`/`request` admit only their supported structured state operations. A Lua wrapper is loaded across event modes and selects its own callback, but ordinary V1/V2 entries are filtered by trigger type. `stopSending` cancels the current send only when the caller consumes it; the normal send path checks it after `start`. Guard rerolls, `sendAIprompt`, and nested manual triggers against repeated side effects and feedback loops.

CBS expressions are not executable inside Lua or arbitrary trigger logic. Use the mode's variable/action mechanisms, and reserve CBS for supported output/data strings.

Load [`RUNTIME_INTEROP.md`](RUNTIME_INTEROP.md) only when the task depends on two or more scripting layers, exact turn ordering, shared variables, rerolls, module merging, or permission propagation.

## Validation

Verify that trigger mode is correct, event names and manual button targets match, ordering is intentional, display-only changes are not relied on as model input, request changes do not claim to alter saved chat, and repeated events do not create feedback loops. Use batch reads for multiple entries and preserve current identity/index guards.
