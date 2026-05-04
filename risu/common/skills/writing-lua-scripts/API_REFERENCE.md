# RisuAI Lua API Reference

Complete API for Lua 5.4 trigger scripts in RisuAI `.charx` and `.risum` files.

**Legend:**

- ⚡ = Direct async host call — must call `:await()` on the result
- ✅ = Lua wrapper awaits internally — do **not** call `:await()` on the wrapper result
- 🔒 = Requires `lowLevelAccess` enabled on the module/character
- Most functions take the lifecycle access key (`id`) as the first parameter unless noted otherwise. This `id` is not the chat session ID.

---

## 1. Callback Functions

These are **defined** by the script author, **called** by the engine.

| Function                     | Description                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onInput(id)`                | Called when the user presses send, before the new user message is appended and before prompt assembly.                                                                           |
| `onStart(id)`                | Called when the prompt is being built (before the AI call).                                                                                                                      |
| `onOutput(id)`               | Called after the AI response is received.                                                                                                                                        |
| `listenEdit(type, callback)` | Registers an edit listener. `type`: `"editInput"`, `"editOutput"`, `"editRequest"`, `"editDisplay"`. Callback signature: `function(id, data, meta) ... return modifiedData end`. |

**Button callbacks** — defined as global functions, invoked by HTML attributes:

| Trigger                       | Description                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| `risu-trigger="funcName"`     | HTML attribute. Clicking calls `funcName(id)`.                      |
| `risu-btn="dataString"`       | HTML attribute. Clicking calls `onButtonClick(id, dataString)`.     |
| `{{button::Label::funcName}}` | CBS shorthand. Renders a button that calls `funcName(id)` on click. |

---

## 2. Chat Message Management

### Individual Messages

| Function                             | Description                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `getChat(id, index)`                 | Get message at 0-based `index`. Negative indices follow JS `Array.at` semantics. Returns a message table or `nil`. |
| `setChat(id, index, value)`          | Set message content at 0-based `index`.                                                                            |
| `setChatRole(id, index, role)`       | Change the role (`"user"` or `"char"`) of message at `index`.                                                      |
| `addChat(id, role, value)`           | Append a new message. `role`: `"user"` or `"char"`.                                                                |
| `insertChat(id, index, role, value)` | Insert a message at `index`, shifting later messages down.                                                         |
| `removeChat(id, index)`              | Remove the message at `index`.                                                                                     |

### Batch Operations

| Function                   | Description                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `getFullChat(id)`          | Returns the entire chat array.                                                                                 |
| `setFullChat(id, value)`   | Replaces the entire chat array.                                                                                |
| `cutChat(id, start, end_)` | Trims the chat to messages in range `[start, end_)`.                                                           |
| `getChatLength(id)`        | Returns the message count. Last message index = `getChatLength(id) - 1`; `-1` also refers to the last message. |

### Last Message Shortcuts

| Function                      | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `getCharacterLastMessage(id)` | Returns the content of the most recent `"char"` message. |
| `getUserLastMessage(id)`      | Returns the content of the most recent `"user"` message. |

> **Message format:** `{ role: "user" | "char", data: string, time?: number }`

---

## 3. State and Variables

| Function                     | Description                                                       |
| ---------------------------- | ----------------------------------------------------------------- |
| `getChatVar(id, key)`        | Read a chat variable (string).                                    |
| `setChatVar(id, key, value)` | Write a chat variable (string only). **Safe context only.**       |
| `getGlobalVar(id, key)`      | Read a global variable (shared across chats, read-only from Lua). |
| `getState(id, name)`         | Read a state value. Tables are auto-deserialized from JSON.       |
| `setState(id, name, value)`  | Write a state value. Tables are auto-serialized to JSON.          |

> **Safe context**: write functions work only during callbacks with a valid runtime `id`. All modes except `editDisplay` receive Safe access. `editDisplay` has display-only access for `setChatVar`, but alerts, state writes, chat edits, and low-level APIs require Safe/low-level access. Top-level code has no valid access key.

---

## 4. Character Info

### Basic

| Function                             | Description                     |
| ------------------------------------ | ------------------------------- |
| `getName(id)`                        | Get character name.             |
| `setName(id, name)`                  | Set character name.             |
| `getDescription(id)`                 | Get character description.      |
| `setDescription(id, desc)`           | Set character description.      |
| `getCharacterFirstMessage(id)`       | Get the first message template. |
| `setCharacterFirstMessage(id, data)` | Set the first message template. |

### Images

| Function                   | Description                                                                  |
| -------------------------- | ---------------------------------------------------------------------------- |
| ✅ `getCharacterImage(id)` | Returns `{{inlayed::<id>}}` markup for the current character image, or `""`. |

### Persona (User)

| Function                    | Description                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `getPersonaName(id)`        | Get the user's persona name.                                       |
| `getPersonaDescription(id)` | Get the user's persona description, CBS-parsed.                    |
| ✅ `getPersonaImage(id)`    | Returns `{{inlayed::<id>}}` markup for the persona image, or `""`. |

---

## 5. AI Model Calls (LLM)

| Function                                            | Description                                                                                                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ 🔒 `LLM(id, prompt, useMultimodal?, options?)`   | Call the main model. `prompt`: array of `{ role, content }`. Returns `LLMResult`. Set `useMultimodal = true` to extract `{{inlay::*}}` image tags; `options.streaming = true` enables streaming collection. |
| ⚡ 🔒 `simpleLLM(id, prompt)`                       | Call the main model with a plain string prompt. Returns `LLMResult`.                                                                                                                                        |
| ✅ 🔒 `axLLM(id, prompt, useMultimodal?, options?)` | Call the auxiliary/sub model. Same interface as `LLM`. Returns `LLMResult`.                                                                                                                                 |

**`LLMResult`**: `{ success: boolean, result: string }`

```lua
local res = LLM(id, {
    { role = "system", content = "You are a helpful narrator." },
    { role = "user",   content = "Describe the room." }
})

if res.success then
    addChat(id, "char", res.result)
end
```

---

## 6. Lorebook

| Function                                           | Description                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getLoreBooks(id, search)`                         | Search local-chat lore, character global lore, and module lorebooks where `comment == search`. Returns matching entries with CBS-parsed content.                                                                                                                       |
| ✅ 🔒 `loadLoreBooks(id)`                          | Loads currently active lorebook prompt entries, filtered to fit context. The raw `loadLoreBooksMain(id, reserve)` can be awaited manually when you need a reserve token budget.                                                                                        |
| `upsertLocalLoreBook(id, name, content, options?)` | Create or replace a chat-local lorebook entry whose `comment == name`. `options`: `{ alwaysActive = false, insertOrder = 100, key = "", secondKey = "", regex = false }`. **Note:** Newly created entries appear in the AI prompt on the **next** turn (1-turn delay). |

---

## 7. UI Alerts

| Function                     | Description                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `alertNormal(id, value)`     | Show an info notification.                                                                |
| `alertError(id, value)`      | Show an error notification.                                                               |
| ⚡ `alertInput(id, value)`   | Show a text input dialog. Returns the entered string.                                     |
| ⚡ `alertSelect(id, value)`  | Show a selection dialog. `value`: array of strings. Returns the selected string or `nil`. |
| ⚡ `alertConfirm(id, value)` | Show a yes/no confirmation dialog. Returns `boolean`.                                     |

---

## 8. Utilities

### Token Counting

| Function                  | Description                                       |
| ------------------------- | ------------------------------------------------- |
| ⚡ `getTokens(id, value)` | Count tokens in `value` string. Returns a number. |

### Hashing

| Function             | Description                                  |
| -------------------- | -------------------------------------------- |
| ⚡ `hash(id, value)` | Compute a hash of `value`. Returns a string. |

### Text Similarity

| Function                              | Description                                               |
| ------------------------------------- | --------------------------------------------------------- |
| ⚡ 🔒 `similarity(id, source, value)` | Compute semantic similarity between `source` and `value`. |

### CBS Parsing

| Function     | Description                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `cbs(value)` | Process CBS (Custom Bracket Syntax) tags in `value` and return the resolved string. No `id` argument. |

### Sleep

| Function             | Description                              |
| -------------------- | ---------------------------------------- |
| ⚡ `sleep(id, time)` | Pause execution for `time` milliseconds. |

### Logging

| Function       | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `log(message)` | Write to the debug log. `print(message)` is also available and preferred. |

---

## 9. Network

| Function                 | Description                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚡ 🔒 `request(id, url)` | HTTP GET request. **HTTPS only, URL limit: 120 characters, 5 requests/minute, RisuAI domains blocked.** Returns a JSON string `{status, data}`; decode it with `json.decode`. |

---

## 10. Media

| Function                                    | Description                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ⚡ 🔒 `generateImage(id, value, negValue?)` | Generate an image from a text prompt. `negValue` is an optional negative prompt. Returns `{{inlay::<id>}}` markup or an error string. |

---

## 11. Chat Control

| Function                | Description                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `stopChat(id)`          | Cancel the in-progress send from a safe callback. Returning literal `false` from `onInput`/`onOutput`/`onStart` has the same effect. |
| `reloadDisplay(id)`     | Force the UI to re-render all messages.                                                                                              |
| `reloadChat(id, index)` | Force re-render of a specific message at `index`.                                                                                    |

---

## 12. Background and Metadata

| Function                           | Description                                                      |
| ---------------------------------- | ---------------------------------------------------------------- |
| `getAuthorsNote(id)`               | Read the author's note (globalNote / post_history_instructions). |
| `getBackgroundEmbedding(id)`       | Read the background HTML embedding.                              |
| `setBackgroundEmbedding(id, data)` | Write the background HTML embedding.                             |

---

## 13. Async Helpers

| Function          | Description                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `async(callback)` | Wraps a Lua function into an async context (coroutine → Promise) and forwards the original callback arguments. |
| `promise:await()` | Blocks the coroutine until the async operation completes and returns the result.                               |

```lua
listenEdit('editOutput', async(function(id, value, meta)
    local tokens = getTokens(id, value):await()
    return value .. "\n[tokens: " .. tokens .. "]"
end))
```

---

## 14. JSON Library

| Function             | Description                               |
| -------------------- | ----------------------------------------- |
| `json.encode(value)` | Serialize a Lua table to a JSON string.   |
| `json.decode(str)`   | Deserialize a JSON string to a Lua table. |

```lua
-- Useful with setChatVar (string-only storage)
local data = { hp = 100, items = { "sword", "shield" } }
setChatVar(id, "player", json.encode(data))

local player = json.decode(getChatVar(id, "player"))
print(player.hp)  -- 100
```

> **Tip:** `getState`/`setState` handle JSON serialization automatically. Use `json.encode`/`json.decode` only when you need explicit control (e.g., storing in `setChatVar`).
