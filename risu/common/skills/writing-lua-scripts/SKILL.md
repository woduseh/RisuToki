---
name: writing-lua-scripts
description: 'Guides writing Lua 5.4 trigger scripts for RisuAI charx and risum files. Covers event callbacks (onInput, onStart, onOutput, listenEdit), chat manipulation, variables, LLM calls, UI alerts, lorebook access, and async patterns. Use when creating or editing Lua code in the lua field of charx or risum files.'
tags: ['lua', 'triggers', 'scripting']
related_tools: ['list_lua', 'read_lua', 'write_lua', 'add_lua_section']
---

# Writing Lua Scripts for RisuAI

## Agent Operating Contract

- **Use when:** creating, editing, reviewing, or diagnosing Lua 5.4 scripts in `.charx` or `.risum` files.
- **Do not use when:** the user needs V2 GUI trigger entries, CBS-only logic, regex postprocessing, or plugin JavaScript.
- **Read first:** this `SKILL.md`; it covers lifecycle events, safe access, and common patterns.
- **Load deeper only if:** an API is not listed here or parameter/return details matter (`API_REFERENCE.md`).
- **Output/validation contract:** keep Lua and structured trigger modes separate, preserve section boundaries, verify callback access level, and use `list_lua`/`read_lua`/`write_lua` rather than bulk `read_field("lua")`.

RisuAI uses **Lua 5.4** trigger scripts to add interactivity to characters (`.charx`) and modules (`.risum`). Scripts live in the `lua` field, organized into sections delimited by `-- ===== sectionName =====`. Most host APIs take the lifecycle `id` access key as their first argument; helper wrappers such as `log(value)` and `cbs(value)` do not.

Source-grounded areas: lifecycle/access and async-wrapper claims are checked against `Risuai/src/ts/process/scriptings.ts`, `Risuai/src/ts/process/triggers.ts`, and `Risuai/src/lib/ChatScreens/DefaultChatScreen.svelte`.

> **Authoring-mode boundary:** In current RisuAI authoring flow, Lua mode and structured trigger-script mode are treated as separate choices. Lua is persisted as a `triggerlua` wrapper in the first trigger slot, and the editor/MCP accessors treat that first-slot wrapper as "the Lua script" mode. In practice, do **not** plan to mix a Lua script with separate V1/V2 trigger entries in the same card or module — choose one mode or the other.

## Event Functions

| Function               | Fires When                                                 | Typical Use                                     |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| `onInput(id)`          | User presses send, before the new user message is appended | Pre-send validation, cancellation, state checks |
| `onStart(id)`          | Prompt is being built (before AI call)                     | Inject context, modify prompt content           |
| `onOutput(id)`         | AI response received                                       | Post-processing, stat updates, side effects     |
| `listenEdit(type, cb)` | Text passes through an edit pipeline                       | Real-time text transformation                   |

`listenEdit` types: `editInput`, `editOutput`, `editRequest`, `editDisplay`. The callback receives `(id, data, meta)` and **must return** the possibly modified value. `editInput`, `editOutput`, and `editDisplay` usually pass strings; `editRequest` passes the OpenAI-style request array.

```lua
listenEdit('editDisplay', function(id, data)
    return data:gsub("%*%*(.-)%*%*", "<b>%1</b>")
end)
```

## Core Patterns

### Variable Management

```lua
-- Chat variables (string only, safe-context writes)
setChatVar(id, "hp", "100")
local hp = getChatVar(id, "hp")

-- State (auto JSON-serializes tables — preferred for complex data)
setState(id, "inventory", { "sword", "potion" })
local inv = getState(id, "inventory")  -- returns table

-- Global variables (read-only from scripts)
local theme = getGlobalVar(id, "theme")
```

`setChatVar` only works during callbacks with a valid runtime `id`. All modes except `editDisplay` get Safe access; `editDisplay` gets a narrower display-only access key that permits `setChatVar` but not Safe-only APIs such as alerts, state writes, chat edits, or low-level calls. For structured data, prefer `getState`/`setState` which handle tables natively.

### Chat Manipulation

```lua
local len = getChatLength(id)         -- message count
local msg = getChat(id, len - 1)      -- 0-based index -> last message
local same = getChat(id, -1)          -- negative indices also work
setChat(id, 0, "Modified first message")
addChat(id, "char", "* The door creaks open. *")
insertChat(id, 2, "user", "Wait—")
removeChat(id, len - 1)               -- remove last
```

> **Indexing**: `getChatLength` returns a count, while `getChat`/`setChat` use 0-based indices. Last message index = `getChatLength(id) - 1`; negative indices use JS `Array.at` semantics (`-1` = last).

Batch operations: `getFullChat(id)` returns the full array; `setFullChat(id, chatArray)` replaces it; `cutChat(id, start, end_)` trims a range.

### LLM Calls and Async Boundaries

`LLM` and `axLLM` are Lua wrapper helpers that already await the raw host call before returning an `LLMResult`. `simpleLLM` is a direct async host function, so call `:await()` on it. All LLM calls require `lowLevelAccess`.

```lua
-- Simple string prompt
local res = simpleLLM(id, "Summarize this scene"):await()
if res.success then
    addChat(id, "char", res.result)
end

-- Structured prompt with roles
local res = LLM(id, {
    { role = "system", content = "You are a narrator." },
    { role = "user",   content = "Describe the forest." }
})

-- Auxiliary model (subModel)
local res = axLLM(id, {
    { role = "user", content = "Rate mood 1-10" }
}, false, { streaming = true })
```

`LLMResult`: `{ success: boolean, result: string }`

Use `useMultimodal = true` to extract `{{inlay::*}}`/`{{inlayed::*}}` image tags into multimodal request parts. The fourth `options` table currently recognizes `{ streaming = true }`.

### UI Alerts

```lua
alertNormal(id, "Quest accepted!")
alertError(id, "Invalid command.")

-- Async — must :await()
local name = alertInput(id, "Enter your name:"):await()
local pick = alertSelect(id, {"Warrior", "Mage", "Rogue"}):await()
local ok   = alertConfirm(id, "Are you sure?"):await()
```

`alertSelect` returns the selected string (or `nil`), not a numeric index.

### CBS and Display Helpers

```lua
local rendered = cbs("{{user}} has {{getvar::hp}} HP") -- no id argument
local bg = getBackgroundEmbedding(id)
setBackgroundEmbedding(id, bg .. "\n<!-- status panel -->")
local note = getAuthorsNote(id)
log({ rendered = rendered, note = note })              -- no id argument
```

### Button Triggers

**HTML attribute** — attach to any element:

```html
<button risu-trigger="onAttack">Attack</button>
```

**risu-btn** — passes a data string to `onButtonClick`:

```html
<button risu-btn="item-potion">Use Potion</button>
```

```lua
function onAttack(id)
    alertNormal(id, "You swing your sword!")
end

function onButtonClick(id, data)
    -- data == "item-potion"
    alertNormal(id, "Used: " .. data)
end
```

**CBS shorthand**: `{{button::Attack::onAttack}}` renders a button that calls `onAttack`.

## Critical Gotchas

| Issue                         | Detail                                                                                                                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Indexing**                  | `getChatLength` returns a count; chat accessors use 0-based indices and support negative `Array.at` indices. Last message = `getChatLength(id) - 1` or `-1`.                                                                                                                                        |
| **Async :await()**            | Direct async host calls require `:await()`: `simpleLLM`, `alertInput`, `alertSelect`, `alertConfirm`, `getTokens`, `hash`, `sleep`, `request`, `generateImage`, `similarity`. Wrapper helpers `LLM`, `axLLM`, `loadLoreBooks`, `getCharacterImage`, and `getPersonaImage` already await internally. |
| **Safe context**              | State-write APIs work only during runtime callbacks with a valid access key. All modes except `editDisplay` get Safe access; `editDisplay` has display-only access for `setChatVar` but not alerts, state writes, chat edits, or low-level calls. Top-level code has no valid access key.           |
| **lowLevelAccess**            | `LLM`, `axLLM`, `simpleLLM`, `loadLoreBooks`, `request`, `generateImage`, and `similarity` require the `lowLevelAccess` flag enabled on the module/character.                                                                                                                                       |
| **Canceling sends**           | Return literal `false` from `onInput`, `onOutput`, `onStart`, or a custom-mode function, or call `stopChat(id)` from a safe callback.                                                                                                                                                               |
| **Lua patterns**              | Lua uses `%` for escapes (not `\`). Use `str:find("text", 1, true)` for literal search.                                                                                                                                                                                                             |
| **upsertLocalLoreBook delay** | Lorebook entries created via `upsertLocalLoreBook` only appear in the AI prompt on the **next** turn.                                                                                                                                                                                               |
| **Mode exclusivity**          | Treat Lua mode and structured trigger-script mode as mutually exclusive authoring paths. Although Lua is stored as `triggerlua` inside the trigger array, current editor/tooling flows expect that wrapper to stand in for the whole Lua mode rather than coexist with separate trigger entries.    |

## Practical Examples

### 1. HP System with State

```lua
function onStart(id)
    if getState(id, "hp") == nil then
        setState(id, "hp", 100)
        setState(id, "maxHp", 100)
    end
end

function onOutput(id)
    local msg = getCharacterLastMessage(id)
    if msg:find("attack") or msg:find("hit") then
        local hp = getState(id, "hp") or 100
        local dmg = math.random(5, 20)
        hp = math.max(0, hp - dmg)
        setState(id, "hp", hp)
        if hp <= 0 then
            alertError(id, "You have fallen!")
            addChat(id, "char", "*collapses to the ground*")
        else
            alertNormal(id, string.format("HP -%d! Now: %d/%d", dmg, hp, getState(id, "maxHp")))
        end
    end
end
```

### 2. Emotion Tracking via LLM

```lua
function onOutput(id)
    local msg = getCharacterLastMessage(id)
    local res = simpleLLM(id, "Classify the emotion in one word: " .. msg):await()
    if res.success then
        setState(id, "emotion", res.result:lower():match("%a+") or "neutral")
    end
end
```

### 3. Dynamic Lorebook Injection

```lua
function onInput(id)
    local msg = getUserLastMessage(id)
    if msg:find("castle") then
        upsertLocalLoreBook(id, "lore-castle",
            "The ancient castle stands atop a cliff. Its walls are covered in ivy.",
            { key = "castle", secondKey = "fortress", alwaysActive = false })
        alertNormal(id, "Lorebook entry added: Castle")
    end
end
```

### 4. Output Filter with listenEdit

```lua
listenEdit('editOutput', function(id, data)
    -- Remove OOC blocks
    data = data:gsub("%[OOC.-%]", "")
    -- Enforce character speech suffix
    data = data .. " ~nya"
    return data
end)
```

## API Reference

See [API_REFERENCE.md](./API_REFERENCE.md) for the complete function listing organized by category, including parameter details, return types, and async/permission markers.

## Related Skills

| Skill                     | Relationship                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `writing-lorebooks`       | Lua manipulates lorebooks via `getLoreBooks()` and `upsertLocalLoreBook()`                |
| `writing-trigger-scripts` | Lua scripts are one of two trigger authoring modes (Lua mode vs V2 GUI mode)              |
| `writing-cbs-syntax`      | CBS variables (`getvar`/`setvar`) interoperate with Lua state (`getChatVar`/`setChatVar`) |

## Smoke Tests

| Prompt                                                                | Expected routing                                                               | Expected output                                                                 | Forbidden behavior                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| "My `upsertLocalLoreBook` entry doesn't appear in the AI's response." | Primary: `writing-lua-scripts`; load `writing-lorebooks` only for entry shape. | Explanation that local lorebook updates affect the next turn, plus debug steps. | Claiming the entry should inject in the current prompt build.              |
| "Add a Lua display formatter to an existing card."                    | Primary: `writing-lua-scripts`; use `list_lua` then `read_lua`.                | Section-aware Lua edit using the correct callback.                              | Mixing Lua mode with separate V1/V2 trigger entries or bulk-reading `lua`. |
