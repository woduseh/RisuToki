---
name: writing-lorebooks
description: 'Guides writing and structuring lorebook entries for RisuAI charx and risum files. Covers keyword activation, insertion order, decorator syntax (@@depth, @@role, @@position, etc.), folder organization, CBS integration, and conditional activation. Use when creating, editing, or organizing lorebook entries.'
---

# Writing Lorebook Entries

Lorebooks are collections of context entries injected into the AI prompt **only when their keywords match** the conversation, enabling efficient token management for world-building, character details, and game systems.

## Entry Fields

| Field                     | Description                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `key`                     | Comma-separated activation keywords. Empty = never keyword-triggered.                                          |
| `comment`                 | Management name. Also used by Lua `getLoreBooks(id, commentFilter)`.                                           |
| `content`                 | Text sent to AI. Supports CBS `{{}}` syntax.                                                                   |
| `insertorder`             | Higher = placed later in prompt. Low-order entries are **cut first** when hitting token limits.                |
| `alwaysActive`            | If `true`, always injected regardless of keyword match.                                                        |
| `selective` + `secondkey` | When both set, **both** key and secondkey must match to activate.                                              |
| `mode`                    | `normal` \| `constant` \| `multiple` \| `child` \| `folder`                                                    |
| `useRegex`                | Interpret `key` as regex pattern.                                                                              |
| `folder`                  | Reference to parent folder. `"folder:UUID"` format — must match the folder entry's **`key`** field (NOT `id`). |
| `activationPercent`       | Activation probability 0–100. Default 100.                                                                     |

**Zero-token pattern:** `key=""` + `alwaysActive=false` → entry is completely skipped. Use for data storage accessed only by Lua.

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
7. **Layer secrets by trigger depth** — Deep secrets should be triggered by words that only appear after trust is built, not by the character's name.
8. **Watch alwaysActive budget** — Every alwaysActive entry competes for attention on every turn. Reserve always-on for core world rules and system instructions; move detailed content to keyword triggers.

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
