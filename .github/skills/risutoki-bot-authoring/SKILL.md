---
name: risutoki-bot-authoring
description: Draft, revise, complete, and QA RisuToki bot cards and `.charx` content. Use when working on bot descriptions, first messages, lorebooks, global notes, UI-language variants, lorebook activation keys, bot consistency checks, or structured RisuToki MCP edits for character/chatbot authoring.
---

# RisuToki Bot Authoring

Use this skill for creative bot-card work where RisuToki structure matters as much as prose quality. It pairs creative drafting with safe `.charx` inspection, MCP edits, and consistency validation.

## Workflow

1. Establish the target bot and scope: active editor, explicit `.charx` path, reference bot, field list, language policy, and whether the user wants planning, editing, critique, or final QA.
2. Load local project guidance when inside a RisuToki workspace. Read `project-workflow` first if present, then `using-mcp-tools` before any MCP read/write decision.
3. Inspect before writing. Prefer active-document or external-file MCP inspection over raw JSON editing. Use bounded reads for `description`, first messages, lorebook entries, global notes, regex, Lua, assets, and language-setting structures.
4. Draft from stable sources: existing bot fields, reference cards, user constraints, genre premise, and any requested critique guide. Keep canonical names, roles, activation keys, and language variants aligned across fields.
5. For edits, use preview/dry-run routes where available, carry stale guards for indexed lorebook/greeting/regex/prompt edits, then apply the smallest coherent batch.
6. Validate with the same surfaces touched: targeted re-reads, lorebook key checks, export compatibility for `.charx` cards intended for upload, and a prose consistency pass.

## Authoring Checks

- Description: states the premise, user role, core cast, interaction loop, constraints, and tone without bloated exposition.
- First message: opens with a playable situation, preserves character voice, avoids translationese when bilingual, and matches the bot's actual state.
- Lorebook: each entry has a clear purpose, concise activation keys, no dead names, no contradictory facts, and no duplicate world rules.
- Global note: contains operational rules only when needed; do not force language or behavior that belongs in user-facing settings or lorebook entries.
- UI-language variants: keep English/Korean or other variants equivalent in function, not necessarily word-for-word. Verify default language behavior and fallback.
- Assets and UI snippets: confirm referenced asset names, cargo/status UI, or Lua-facing labels match the actual bot fields.

## Output Contract

For planning or critique, return the concrete edit plan, risks, and required source reads. For implementation, finish with touched fields, validation performed, remaining caveats, and any user decision still required.

Do not treat `.charx` authoring as a repo source change unless tracked product code or shared project skills/docs were edited.
