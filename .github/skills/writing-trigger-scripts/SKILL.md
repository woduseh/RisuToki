---
name: writing-trigger-scripts
description: 'Guides writing trigger scripts for RisuAI charx and risum files. Covers all trigger types (start, input, output, display, request, manual/button), execution order in the processing pipeline, listenEdit event listeners, and the relationship between V2 GUI triggers, Lua triggers, CBS, and regex scripts. Use when planning or debugging trigger-based automation.'
tags: ['triggers', 'workflow', 'automation']
related_tools: ['list_triggers', 'read_trigger', 'write_trigger', 'add_trigger']
---

# Writing Trigger Scripts

Triggers are event-driven scripts that execute automatically on specific chat events (send, receive, button click). They enable variable manipulation, UI changes, prompt control, and complex game systems.

> **Mode boundary:** In current RisuAI authoring flow, structured trigger scripts and Lua script mode are treated as separate modes. Lua is stored as a `triggerlua` entry in the first trigger slot, but the editor/UI and MCP accessors use that first-slot wrapper as the dedicated Lua mode. If the artifact is in Lua mode, do **not** treat it as a normal mixed trigger list — use [writing-lua-scripts](../writing-lua-scripts/SKILL.md) instead of trying to combine Lua with separate V1/V2 trigger entries.

## Trigger Script Types

### V2 (GUI-based)

Built through RisuAI's GUI menus. Simple to configure, no coding required, but limited in capability. Cannot leverage LLM calls or complex logic.

### Lua (Scripting)

Lua 5.4 engine. Best for complex logic, LLM integration, and dynamic systems. See the [writing-lua-scripts](../writing-lua-scripts/SKILL.md) skill for full Lua API reference.

When Lua mode is active, treat it as the alternative to structured trigger scripts, not as one trigger flavor to mix freely into a larger trigger stack.

## Processing Pipeline

```
CBS parse (variable substitution)
    ↓
Trigger scripts execute
    ↓
CBS parse (re-evaluation)
    ↓
Regex scripts (with internal CBS)
```

**Important:** CBS `{{}}` is **not parsed inside trigger script logic**. You cannot write `if {{getvar::hp}} > 10 then` in Lua. CBS only works in strings that get output to chat or data fields.

## Event Types

| Event       | Lua Function   | listenEdit Event | When It Fires                                     |
| ----------- | -------------- | ---------------- | ------------------------------------------------- |
| **Start**   | `onStart(id)`  | `editRequest`    | User presses send, before prompt generation       |
| **Input**   | `onInput(id)`  | `editInput`      | User input confirmed, after prompt generation     |
| **Output**  | `onOutput(id)` | `editOutput`     | AI response received                              |
| **Display** | —              | `editDisplay`    | Screen rendering (UI-only, no data change)        |
| **Request** | —              | `editRequest`    | Before API send (prompt-only, no chat log change) |
| **Manual**  | Named function | —                | Button click or explicit call                     |

## Event Details

### Start (onStart)

Fires when the user hits send. Runs **before prompt generation**, so changes here affect what the AI sees.

```lua
function onStart(id)
  local hp = getState(id, "hp") or 100
  if hp <= 0 then
    alertError(id, "You are dead! Cannot send messages.")
  end
end
```

### Output (onOutput)

Fires after the AI generates a response. Use for post-processing, variable updates, and turn-end events.

```lua
function onOutput(id)
  local msg = getCharacterLastMessage(id)
  if msg:find("attack") then
    local hp = getState(id, "hp") or 100
    setState(id, "hp", hp - 10)
  end
end
```

### Input (onInput)

Fires when user input is confirmed. Runs **after prompt generation**, so it does NOT affect the current prompt.

```lua
function onInput(id)
  local msg = getUserLastMessage(id)
  -- Process user input after it's been sent
end
```

### listenEdit (Event Listeners)

Intercept and modify data at various pipeline stages. The callback receives data and must return the modified version.

```lua
listenEdit("editDisplay", function(id, data)
  return data .. "<div class='status'>HP: " .. (getState(id, "hp") or "?") .. "</div>"
end)

listenEdit("editRequest", function(id, data)
  return "[System instruction injected]\n" .. data
end)
```

### Manual Triggers (Buttons)

Triggered explicitly via UI buttons or CBS:

**HTML button:**

```html
<button risu-trigger="onHeal">Heal</button> <button risu-btn="apple">Use Apple</button>
```

**CBS button:**

```
{{button::Heal::onHeal}}
```

**Lua handlers:**

```lua
function onHeal(id)
  local hp = getState(id, "hp") or 100
  setState(id, "hp", math.min(hp + 20, 100))
  alertNormal(id, "Healed! HP: " .. getState(id, "hp"))
end

-- Generic handler for risu-btn buttons
function onButtonClick(id, data)
  alertNormal(id, "Used item: " .. data)
end
```

## Best Practices

1. **Use `onStart` for prompt-affecting logic** — it runs before prompt generation.
2. **Use `listenEdit("editDisplay", ...)` for UI** — it doesn't touch actual chat data.
3. **Use `listenEdit("editRequest", ...)` for prompt tweaks** — modifies AI input without changing history.
4. **Event functions must be global** — `function onStart(id) end`, not inside other scopes.
5. **Don't mix CBS and Lua logic** — CBS isn't parsed inside Lua. Use Lua API functions (`getChatVar`, `getState`) instead.
6. **Choose Lua mode or structured trigger mode** — if the first trigger is a `triggerlua` wrapper, treat the artifact as being in Lua mode and edit it through the Lua workflow rather than mixing in separate V1/V2 trigger entries.
7. **Mind the pipeline order** — triggers run before regex scripts. Design accordingly.

## Related Skills

| Skill                   | Relationship                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `writing-lua-scripts`   | Lua is one of two trigger authoring modes — use for complex state and async operations |
| `writing-regex-scripts` | Regex scripts run after triggers in the pipeline; understand the handoff               |
| `writing-lorebooks`     | Triggers can manipulate lorebook variables that control entry activation               |

## Smoke Tests

Use these prompts to verify the skill produces correct guidance:

1. "Set up a trigger that runs on chat start (`onStart`) to initialize game variables, and another on each AI output (`onOutput`) to update a turn counter."
2. "Should I use a Lua trigger or a V2 GUI trigger for this task? I need to call an LLM mid-conversation."
3. "Create a manual button trigger that lets the user roll a d20 and displays the result."
