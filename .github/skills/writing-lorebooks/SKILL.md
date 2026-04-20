---
name: writing-lorebooks
description: 'Guides writing and structuring lorebook entries for RisuAI charx and risum files. Covers keyword activation, insertion order, decorator syntax (@@depth, @@role, @@position, etc.), folder organization, CBS integration, and conditional activation. Use when creating, editing, or organizing lorebook entries.'
tags: ['lorebook', 'reference', 'worldbuilding']
related_tools: ['list_lorebook', 'read_lorebook', 'write_lorebook', 'validate_lorebook_keys']
---

# Writing Lorebook Entries

Lorebooks are collections of context entries injected into the AI prompt **only when their keywords match** the conversation, enabling efficient token management for world-building, character details, and game systems.

## Entry Fields

| Field                     | Description                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `key`                     | Comma-separated activation keywords. Empty = never keyword-triggered. Keywords do **not** need to be globally unique across entries. |
| `comment`                 | Management name. Also used by Lua `getLoreBooks(id, commentFilter)`.                                                                 |
| `content`                 | Text sent to AI. Supports CBS `{{}}` syntax.                                                                                         |
| `insertorder`             | Higher = placed later in prompt. Low-order entries are **cut first** when hitting token limits.                                      |
| `alwaysActive`            | If `true`, always injected regardless of keyword match.                                                                              |
| `selective` + `secondkey` | When both set, **both** key and secondkey must match to activate.                                                                    |
| `mode`                    | `normal` \| `constant` \| `multiple` \| `child` \| `folder`                                                                          |
| `useRegex`                | Interpret `key` as regex pattern.                                                                                                    |
| `folder`                  | Reference to parent folder. `"folder:UUID"` format — must match the folder entry's **`key`** field (NOT `id`).                       |
| `activationPercent`       | Activation probability 0–100. Default 100.                                                                                           |

**Zero-token pattern:** `key=""` + `alwaysActive=false` → entry is completely skipped. Use for data storage accessed only by Lua.

**Keyword overlap note:** Lorebook trigger keywords are not unique IDs. Multiple entries can share the same trigger when you want layered activation or different slices of context to wake up together. That said, overlapping keywords are still worth reviewing intentionally — `validate_lorebook_keys` reports duplicates as a quality signal because many duplicate triggers are accidental rather than planned.

## Mode Values

| Mode       | Behavior                                            |
| ---------- | --------------------------------------------------- |
| `normal`   | Activates on keyword match                          |
| `constant` | Always active (like `alwaysActive: true`)           |
| `multiple` | All keywords must match                             |
| `child`    | Child of another entry                              |
| `folder`   | Folder container (no content, groups other entries) |

## Folder Management

**IMPORTANT:** Folder identity is stored in the **`key`** field (format `"folder:<UUID v4>"`), NOT in the `id` field.

- **Create folder:** `add_lorebook({ comment: "FolderName", mode: "folder", key: "folder:<UUID v4>", content: "" })`
  - Generate a proper UUID v4 for each folder (e.g., `"folder:35c826ba-36aa-46ac-abb3-c2d93714be6b"`)
- **Move to folder:** `write_lorebook(index, { folder: "folder:<UUID>" })` — must match the folder entry's `key` value
- **Remove from folder:** `write_lorebook(index, { folder: "" })`

```json
// Folder entry
{ "key": "folder:35c826ba-36aa-46ac-abb3-c2d93714be6b", "comment": "🌍 World", "mode": "folder", "content": "" }

// Child entry (folder field matches parent's key)
{ "key": "keyword1, keyword2", "folder": "folder:35c826ba-36aa-46ac-abb3-c2d93714be6b", "mode": "normal", ... }
```

## Decorator Syntax

Add `@@decorator` lines at the **top of the content field** to control entry behavior:

| Decorator                 | Description                                           | Example                         |
| ------------------------- | ----------------------------------------------------- | ------------------------------- |
| `@@depth N`               | Insert at depth N in prompt (higher = more important) | `@@depth 0`                     |
| `@@reverse_depth N`       | Insert at reverse depth N (less important)            | `@@reverse_depth 3`             |
| `@@role A`                | Set message role: `user`, `assistant`, `system`       | `@@role user`                   |
| `@@position A`            | Position in prompt: `personality`, `scenario`, `pt_*` | `@@position personality`        |
| `@@activate_only_after N` | Only activate after message N                         | `@@activate_only_after 5`       |
| `@@activate_only_every N` | Activate every N messages                             | `@@activate_only_every 3`       |
| `@@scan_depth N`          | Keyword search depth override                         | `@@scan_depth 10`               |
| `@@additional_keys A,B`   | Require additional keywords to activate               | `@@additional_keys magic,spell` |
| `@@exclude_keys A,B`      | Deactivate if these keywords present                  | `@@exclude_keys safe,peaceful`  |
| `@@match_full_word`       | Match plain keywords as whole words only              |                                 |
| `@@probability N`         | N% chance of activation                               | `@@probability 50`              |
| `@@activate`              | Force activate unconditionally                        |                                 |
| `@@dont_activate`         | Force deactivate unconditionally                      |                                 |
| `@@ignore_on_max_context` | Skip when context window is full                      |                                 |
| `@@is_greeting N`         | Treat as greeting message N                           | `@@is_greeting 2`               |

**Multiple decorators** can be stacked:

```
@@role user
@@depth 0
@@activate_only_after 5

The actual content starts here...
```

## Preview Support in RisuToki

RisuToki's F5 preview currently models the core lorebook decorator subset:

- `@@depth`, `@@position`, `@@role`, `@@scan_depth`
- `@@probability`, `@@activate`, `@@dont_activate`
- `@@match_full_word`, `@@additional_keys`, `@@exclude_keys`

Preview uses a deterministic simulated roll for `@@probability` so repeated renders and debug output stay reproducible. The preview debug panel exposes matched keys, checked exclude keys, decorator tags, probability outcomes, and warnings for the supported subset.

## CBS in Lorebook Content

Lorebook content supports full CBS template syntax:

```
# Character Status
- Name: {{getvar::char_name}}
- Level: {{getvar::char_level}}
- HP: {{calc::{{getvar::base_hp}}+{{getvar::bonus_hp}}}}
- Mood: {{random::good::neutral::bad}}

{{#when::{{getvar::char_level}}::>::10}}
## Veteran Warrior
You are a battle-hardened veteran of many conflicts.
{{/when}}
```

## Global Settings

| Setting                 | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| **Recursive search**    | Lorebook content itself is scanned for keyword matches (entry A can trigger entry B) |
| **Word-level matching** | Keywords match whole words only (key "Jin" matches "Jin" but not "Jingle")           |
| **Search depth**        | Number of recent messages scanned for keywords                                       |
| **Max lorebook tokens** | Token cap for all lorebook entries combined. Low-order entries cut first.            |

## Best Practices

1. **Comment naming matters** — Lua scripts search by `comment` via `getLoreBooks()`. Keep naming patterns consistent.
2. **Insertion order strategy** — Critical lore (world rules, character core) at high order; flavor text at low order.
3. **Keep entries self-contained** — Each entry may activate in isolation. Don't depend on other entries being present.
4. **Match description voice** — Write entries in the same tone as the bot description to avoid tonal whiplash.
5. **Signal density over token count** — The question isn't "how long?" but "does every sentence change LLM output?" A cohesive 600-token entry with high signal density outperforms 3 scattered 200-token fragments. Split only when narrative coherence breaks, not at an arbitrary token threshold.
6. **Natural trigger keywords** — Choose words that naturally appear when the info is relevant.
7. **Duplicate triggers are allowed, but should be deliberate** — Shared keywords can be useful for layered activation, but accidental overlap can make the lorebook noisy. Treat `validate_lorebook_keys` duplicate reports as review prompts, not as proof the file is invalid.
8. **Layer secrets by trigger depth** — Deep secrets should be triggered by words that only appear after trust is built, not by the character's name.
9. **Watch alwaysActive budget** — Every alwaysActive entry competes for attention on every turn. Reserve always-on for core world rules and system instructions; move detailed content to keyword triggers.

## Critical Gotchas

| Issue                                             | Detail                                                                                                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Folder identity is `key`, not `id`**            | Folder entries use the `key` field (format `"folder:<UUID>"`) as their identity. Child entries reference this `key` value in their `folder` field. Using the entry's `id` instead will silently fail to group entries. |
| **`alwaysActive` + empty key still costs tokens** | An entry with `alwaysActive: true` is injected every turn even if `key` is empty. This is intentional but often accidental — review always-on entries for token budget impact.                                         |
| **`comment` field renaming breaks Lua**           | Lua's `getLoreBooks(id, commentFilter)` matches against the `comment` field. Renaming a comment without updating corresponding Lua calls silently breaks the integration.                                              |
| **`upsertLocalLoreBook` takes effect next turn**  | Lorebook entries created or updated via Lua `upsertLocalLoreBook` are not included in the current turn's prompt — they appear on the next turn only.                                                                   |
| **Decorator stacking order matters**              | `@@role` and `@@depth` must come before content text. Placing decorators after the first line of content causes them to be treated as literal text in the prompt.                                                      |
| **Recursive search can cause loops**              | With "Recursive search" enabled, entry A's content can trigger entry B, and B's content can trigger A. Large mutual-trigger chains consume the token budget rapidly with no visible error.                             |

## Lorebook–Lua Integration

```lua
-- Search entries by comment filter
local entries = getLoreBooks(id, "inventory")

-- Dynamically create/update entries (takes effect NEXT turn)
upsertLocalLoreBook(id, "castle-lore", "A vast castle with...", {
  key = {"castle", "fortress"},
  alwaysActive = false
})
```

**Important:** `upsertLocalLoreBook` entries are injected **next turn**, not the current one.

## Related Skills

| Skill                     | Relationship                                                                   |
| ------------------------- | ------------------------------------------------------------------------------ |
| `writing-cbs-syntax`      | CBS `{{}}` syntax is fully supported inside lorebook `content` fields          |
| `writing-lua-scripts`     | Lua accesses lorebooks via `getLoreBooks()` and `upsertLocalLoreBook()`        |
| `writing-trigger-scripts` | Triggers can activate lorebook entries and manipulate variables they reference |

## Smoke Tests

Use these prompts to verify the skill produces correct guidance:

1. "Create a lorebook folder structure with 3 character entries and 2 location entries, using proper UUID folder keys."
2. "Write a lorebook entry that only activates after message 5, at depth 0, with role `system`."
3. "My Lua script calls `getLoreBooks()` but returns empty — the entry exists. What could be wrong?"
