---
name: writing-lua-scripts
description: "Guides writing Lua 5.4 trigger scripts for RisuAI charx and risum files. Covers event callbacks (onInput, onStart, onOutput, listenEdit), chat manipulation, variables, LLM calls, UI alerts, lorebook access, and async patterns. Use when creating or editing Lua code in the lua field of charx or risum files."
---

# Writing Lua Scripts for RisuAI

RisuAI uses **Lua 5.4** trigger scripts to add interactivity to characters (`.charx`) and modules (`.risum`). Scripts live in the `lua` field, organized into sections delimited by `-- ===== sectionName =====`. Every API function takes a `triggerId` (the chat session ID) as its first argument.

## Event Functions

| Function | Fires When | Typical Use |
|---|---|---|
| `onInput(id)` | User sends a message (after prompt assembly) | Input validation, preprocessing, variable updates |
| `onStart(id)` | Prompt is being built (before AI call) | Inject context, modify prompt content |
| `onOutput(id)` | AI response received | Post-processing, stat updates, side effects |
| `listenEdit(type, cb)` | Text passes through an edit pipeline | Real-time text transformation |

`listenEdit` types: `editInput`, `editOutput`, `editRequest`, `editDisplay`. The callback receives `(id, data)` and **must return** the (possibly modified) string.

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

`setChatVar` only works in **safe context** (inside `onInput`, `onOutput`, `listenEdit(editInput/editOutput/editDisplay)`). For structured data, prefer `getState`/`setState` which handle tables natively.

### Chat Manipulation

```lua
local len = getChatLength(id)         -- 1-based count
local msg = getChat(id, len - 1)      -- 0-based index → last message
setChat(id, 0, "Modified first message")
addChat(id, "char", "* The door creaks open. *")
insertChat(id, 2, "user", "Wait—")
removeChat(id, len - 1)               -- remove last
```

> **⚠️ Index mismatch**: `getChatLength` returns count starting from 1, but `getChat`/`setChat` use 0-based indices. Last message index = `getChatLength(id) - 1`.

Batch operations: `getFullChat(id)` returns the full array; `setFullChat(id, chatArray)` replaces it; `cutChat(id, start, end_)` trims a range.

### LLM Calls (Async)

All LLM functions are **async** — you must call `:await()`.

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
}):await()

-- Auxiliary model (subModel)
local res = axLLM(id, {
    { role = "user", content = "Rate mood 1-10" }
}):await()
```

`LLMResult`: `{ success: boolean, result: string }`

### UI Alerts

```lua
alertNormal(id, "Quest accepted!")
alertError(id, "Invalid command.")

-- Async — must :await()
local name = alertInput(id, "Enter your name:"):await()
local idx  = alertSelect(id, {"Warrior", "Mage", "Rogue"}):await()
local ok   = alertConfirm(id, "Are you sure?"):await()
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

| Issue | Detail |
|---|---|
| **Index mismatch** | `getChatLength` is 1-based count; `getChat`/`setChat` are 0-based. Last message = `getChatLength(id) - 1`. |
| **Async :await()** | `LLM`, `simpleLLM`, `axLLM`, `alertInput`, `alertSelect`, `alertConfirm`, `getTokens`, `hash`, `sleep`, `request`, `generateImage`, `loadLoreBooks`, `similarity`, `getCharacterImage`, `getPersonaImage` all require `:await()`. |
| **Safe context** | Write functions (`setChatVar`, `setChat`, `addChat`, etc.) only work inside event callbacks, not at top-level or in `listenEdit(editRequest)`. |
| **lowLevelAccess** | `request`, `generateImage`, `similarity` require the `lowLevelAccess` flag enabled on the module/character. |
| **stopChat bug** | `stopChat(id)` is currently broken — do not use. |
| **Lua patterns** | Lua uses `%` for escapes (not `\`). Use `str:find("text", 1, true)` for literal search. |
| **upsertLocalLoreBook delay** | Lorebook entries created via `upsertLocalLoreBook` only appear in the AI prompt on the **next** turn. |

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
            { key = {"castle", "fortress"}, alwaysActive = false })
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
