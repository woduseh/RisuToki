# RisuToki

> Desktop editor for RisuAI `.charx` / `.risum` / `.risup` files with an integrated AI CLI terminal

[![Version](https://img.shields.io/badge/version-0.41.1-blue.svg)](https://github.com/woduseh/RisuToki/releases)
[![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-40-47848F.svg)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933.svg)](https://nodejs.org/)

## What is RisuToki?

RisuToki is a **desktop editor** purpose-built for [RisuAI](https://risuai.net/) character cards (`.charx`), modules (`.risum`), and presets (`.risup`). It pairs a VS Code–grade Monaco editor with a built-in terminal that connects directly to AI CLIs (Claude Code, GitHub Copilot CLI, Codex, Gemini CLI) and automatically exposes the open file's structure to those CLIs through MCP (Model Context Protocol).

### Key Features

| Feature                    | Description                                                                                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📝 **Monaco Editor**       | Same editing engine as VS Code — syntax highlighting, autocomplete, find & replace                                                                                                                                                                                          |
| 🤖 **AI CLI Integration**  | Run Claude Code · GitHub Copilot CLI · Codex · Gemini CLI inside the terminal with automatic MCP connection                                                                                                                                                                 |
| 📦 **Three File Formats**  | Open, edit, and save `.charx` (character cards) · `.risum` (modules) · `.risup` (presets)                                                                                                                                                                                   |
| 🔧 **120+ MCP Tools**      | Read/write fields, lorebooks, regex, Lua/CSS sections, greetings, triggers, risup `promptTemplate`/`formatingOrder`, assets, CBS validation, references, Danbooru tags, skill docs + unopened-file probe/open + batch search/replace + structured `4xx/409` error envelopes |
| 🎭 **Preview Mode**        | `.charx`-only chat simulation (F5) with CBS/Lua rendering, lorebook decorator matching/debug, and inline loading/error diagnostics                                                                                                                                          |
| 📚 **References**          | Load other `.charx`/`.risum` files as read-only references and drill into individual entries                                                                                                                                                                                |
| 🐰 **RP Mode**             | Adjust AI CLI response style with Toki / Aris / custom personas                                                                                                                                                                                                             |
| 🔀 **Sidebar Drag & Drop** | Reorder lorebook entries, regex scripts, Lua/CSS sections, greetings, and assets by dragging                                                                                                                                                                                |
| 🖼 **Slot Layout**         | Freely arrange panels with drag & drop + pop-out editors in separate windows                                                                                                                                                                                                |
| 💾 **Autosave & Backup**   | Configurable-interval autosave per file type (`.charx`/`.risum`/`.risup`) with `.toki-recovery.json` provenance sidecar + up to 20 backup versions per item                                                                                                                 |
| 🔄 **Session Recovery**    | After an abnormal exit, offers to **Restore autosave / Open original / Ignore** with an `[Auto-restored]` badge and provenance status                                                                                                                                       |
| 🎵 **MomoTalk UI**         | MomoTalk-themed popups, NSIS installer, animated avatar GIF system                                                                                                                                                                                                          |

---

## Installation

### Download (end users)

Grab the latest release from the [Releases](https://github.com/woduseh/RisuToki/releases) page.

- **RisuToki Setup x.x.x.exe** — installer
- **RisuToki-x.x.x-portable.exe** — portable (no installation required)

### From Source (developers)

```bash
git clone https://github.com/woduseh/RisuToki.git
cd RisuToki
npm install
npm run dev
```

### Development Scripts

```bash
npm run dev          # Vite + Electron dev mode
npm run lint         # ESLint
npm run typecheck    # Vue + TypeScript type checking
npm run test:evals   # Deterministic agent/harness eval scenarios
npm test             # Node regression tests + Vitest
npm run build        # lint + typecheck + test + Electron + Vite build
npm run dist:all     # Windows NSIS + portable build
```

### Developer Documentation

- `docs/README.md` — Knowledge-base index for agents and contributors
- `docs/MCP_WORKFLOW.md` — MCP tool selection, read rules, and workflow patterns
- `docs/MCP_TOOL_SURFACE.md` — MCP tool families, boundaries, and follow-up action map
- `docs/MCP_ERROR_CONTRACT.md` — MCP success/error/no-op response contract and agent recovery rules
- `docs/PROJECT_RULES.md` — Project rules (versioning, CI, and guide locations)
- `docs/MODULE_MAP.md` — TypeScript source navigation module map
- `docs/analysis/ARCHITECTURE.md` — Runtime architecture, process boundaries, ownership rules, large-module hotspots
- `skills/project-workflow` — Project onboarding skill (`read_skill("project-workflow")`)
- `CONTRIBUTING.md` — Change principles and validation procedures
- `CHANGELOG.md` — Version-by-version change history
- GitHub Actions `CI` — On push/PR: Ubuntu lint · typecheck · test + Windows Electron/Renderer build
- GitHub Actions `Release` — On `v*` tag push: automated Windows build and release

---

# User Guide

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Interface Layout](#2-interface-layout)
3. [Opening & Saving Files](#3-opening--saving-files)
4. [Sidebar (Item Tree)](#4-sidebar-item-tree)
5. [Editor (Monaco)](#5-editor-monaco)
6. [TokiTalk Terminal](#6-tokitalk-terminal)
7. [AI CLI Integration + MCP](#7-ai-cli-integration--mcp)
8. [Preview Mode / RP Mode](#8-preview-mode--rp-mode)
9. [Settings](#9-settings)
10. [Keyboard Shortcuts](#10-keyboard-shortcuts)

---

## 1. Getting Started

Double-click the RisuToki executable (`.exe`) to launch.

### Prerequisites

- To use the AI CLI integration, the CLI you want must be on your system PATH:
  - **Claude Code**: `claude` · **GitHub Copilot CLI**: `copilot` · **Codex**: `codex` · **Gemini CLI**: `gemini`
- If no CLI is installed the editor itself works normally — AI integration is optional.

---

## 2. Interface Layout

<img width="1913" height="1004" alt="Interface layout" src="https://github.com/user-attachments/assets/6398e854-f7a8-49bb-a8e2-c73861446b97" />

| Area                  | Description                                             |
| --------------------- | ------------------------------------------------------- |
| **Sidebar**           | Item tree + References tab                              |
| **Editor**            | Monaco-based code/text editor                           |
| **TokiTalk Terminal** | Built-in terminal (shell + AI CLI)                      |
| **Avatar Panel**      | Toki/Aris character (idle: icon / working: dancing GIF) |

- Reposition the sidebar and terminal from the **View** menu.
- Drag panel borders to resize.
- Toggle the sidebar with `Ctrl+B`, the terminal with `` Ctrl+` ``.

---

## 3. Opening & Saving Files

<img width="240" height="258" alt="File menu" src="https://github.com/user-attachments/assets/d7dca751-3044-44dc-b93b-d99dc02226c2" />

| Action      | How                                                               |
| ----------- | ----------------------------------------------------------------- |
| **New**     | `Ctrl+N` or File → New                                            |
| **Open**    | `Ctrl+O` or File → Open (select a `.charx` / `.risum` / `.risup`) |
| **Save**    | `Ctrl+S` or File → Save                                           |
| **Save As** | `Ctrl+Shift+S` or File → Save As                                  |

- Modified tabs show a **●** dot next to their name. Closing the window triggers a MomoTalk-style save confirmation popup.
- **New** and **Open** also prompt to save if the current document has unsaved changes.
- **Autosave**: Set the interval (1–30 min) in Settings. Autosave writes a file matching the current document type alongside a `.toki-recovery.json` provenance sidecar.
- After an abnormal exit, on the next launch you can choose **Restore autosave / Open original / Ignore** for each document that has a recoverable autosave.
- A document restored from autosave shows an `[Auto-restored]` label and provenance info in the status bar. The badge clears automatically once you save, open a file, or create a new file.

### Drag & Drop

| File Type               | Action                                          |
| ----------------------- | ----------------------------------------------- |
| **.charx / .risum**     | Added as a read-only reference                  |
| **.json**               | Auto-detected as lorebook or regex and imported |
| **.png / .jpg / .gif…** | Added as an image asset                         |

---

## 4. Sidebar (Item Tree)

The sidebar has two tabs: **Items** and **References**.

### Items Tab

Which items appear depends on the file type:

<img width="269" height="365" alt="Sidebar" src="https://github.com/user-attachments/assets/80fc85c8-1b06-4094-a752-9ef99e765a10" />
<img width="262" height="357" alt="Lorebook" src="https://github.com/user-attachments/assets/baa21125-ee5e-477b-855e-c79bbd2e122b" />

#### Default Items

| Item                    | Description                                                                                      | File Types          |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| **Lua**                 | Lua trigger scripts (section-based editing)                                                      | charx, risum        |
| **Trigger Scripts**     | Individual trigger editing                                                                       | charx, risum        |
| **Global Note**         | Instruction inserted after the system prompt                                                     | charx               |
| **First Message**       | Opening message shown at the start of a conversation                                             | charx               |
| **Alternate Greetings** | Alternative first messages (each in its own tab)                                                 | charx               |
| **Group Greetings**     | Group-only greetings (each in its own tab)                                                       | charx               |
| **CSS**                 | Custom chat-UI styles for RisuAI (section-based)                                                 | charx               |
| **Description**         | Character / module / preset description                                                          | charx, risum, risup |
| **Preset: General**     | Preset name and basic metadata                                                                   | risup               |
| **Preset: Prompts**     | Structured `promptTemplate` / `formatingOrder`, `customPromptTemplateToggle`, template variables | risup               |
| **Preset: Model/API**   | Model name, sub-model, API type, preprocessing options                                           | risup               |
| **Preset: Parameters**  | Base parameters / sampling / reasoning options                                                   | risup               |

- `.risup` files show **preset-specific form groups + description + regex folder** instead of Lua / CSS / lorebook / assets.
- The visible **Prompts** group is built around **structured `promptTemplate` / `formatingOrder` + template variables** rather than the legacy `mainPrompt` / `jailbreak` / `globalNote` fields.
- `promptTemplate` opens as a **card-style item list + detail editor** (not raw JSON). You can structurally edit `type`, `type2`, `role`, `text`, `range`, `innerFormat`, `defaultText`, and cache options. Supported items receive a stable `id` that persists across type changes and reordering.
- `formatingOrder` opens as a **reorderable token list** that preserves both known and unknown tokens. Duplicate or unmatched tokens trigger a warning but do not block saving.
- `customPromptTemplateToggle` is edited in a **multiline textarea** matching the RisuAI usage flow.
- Legacy fields (`mainPrompt`, `jailbreak`, `globalNote`, `useInstructPrompt`, `instructChatTemplate`, `JinjaTemplate`) are preserved in the file but demoted from the primary prompt UI — they remain as compatibility data.
- RisuToki can open `.risup` exports in gzip, zlib, and raw-deflate variants, and it preserves the detected compression mode on save.
- If JSON-based preset fields (`presetBias`, `localStopStrings`) or structured prompt fields (`promptTemplate`, `formatingOrder`) contain malformed data, saving is blocked and the status bar shows the offending field.
- MCP `write_field` / `write_field_batch` and autosave share the same risup validation boundary, so malformed JSON/shape is rejected immediately — it never silently persists in memory or in autosave files.
- `.charx` **Character Info** includes `description`, `globalNote`, `defaultVariables`, `creatorcomment`, and `characterVersion`.
- `triggerScripts` opens in a **structured trigger form editor** (not raw JSON). If unsupported trigger/effect/condition types are present, saving is blocked.
- `.charx` / `.risum` files with an empty `triggerScripts` array or a lone `triggerlua` wrapper are treated as **Lua mode**. In that case, the trigger item appears dimmed; conversely, when standalone triggers exist, the Lua folder appears dimmed.

#### Lua / CSS Section System

<img width="1629" height="709" alt="Lua sections" src="https://github.com/user-attachments/assets/da9deeb0-fcc3-44f8-a64f-63ed40571444" />

- Lua sections are delimited by `-- ===== SectionName =====`; CSS sections by `/* ===== SectionName ===== */`.
- **Unified view**: edit all code in a single tab. **Individual sections**: edit each section in its own tab.
- Right-click to add, rename, delete, or restore a section from backup.

#### Lorebook

<img width="1627" height="709" alt="Lorebook" src="https://github.com/user-attachments/assets/556eadc9-e377-4955-b7bf-7963562dc00a" />

- Supports folder hierarchy. Click an entry to open a form editor (comment, key, content, mode, etc.).
- Right-click to add entries/folders, import JSON, rename, delete, or restore from backup.
- Drag & drop to reorder entries or move them between folders.

#### Regex / Assets

- **Regex**: Form editor (find, replace, type, flag) with right-click CRUD and drag-&-drop reordering.
- **Assets**: Image file list. Click to open an image viewer (zoom / pan). Right-click to add or delete.

### References Tab

<img width="518" height="186" alt="References" src="https://github.com/user-attachments/assets/0535187b-5ae8-4873-b641-2478f94914b3" />

- **Guides**: Built-in syntax guides (Lua, CBS, lorebook, regex, HTML/CSS, etc.).
- **Reference files**: Load other `.charx`/`.risum` files as read-only references — you can drill down to individual lorebook/Lua/CSS items.
- References are automatically restored on app restart and are also accessible to AI CLIs via MCP tools.

### Backup System

- Automatic backups are created when editing starts, tabs switch, or MCP overwrites content (up to 20 versions per tab).
- Right-click an item → **Restore from Backup** → pick a timestamped version with preview.

---

## 5. Editor (Monaco)

RisuToki uses the same Monaco editing engine that powers VS Code.

- Syntax highlighting (Lua, HTML, CSS, JSON, etc.), autocomplete, find & replace (`Ctrl+F` / `Ctrl+H`).
- Mouse-wheel zoom (`Ctrl + scroll`), minimap.
- Open multiple items as tabs simultaneously; drag tabs to reorder.
- `↗` button on a tab → pop out into a separate window. `⧉` button → split into a slot inside the main window.
- Pop-out buttons are keyboard-focusable. While an editor is popped out, its slot shows a "📌 Dock to restore here" placeholder.
- Popping out a read-only tab shows a title badge and a disabled Save button so you can tell at a glance that the tab is not editable. The main-window placeholder also says "Viewing" to avoid confusion with editable pop-outs.

---

## 6. TokiTalk Terminal

<img width="259" height="38" alt="Terminal header" src="https://github.com/user-attachments/assets/a336229d-dc6d-4dc2-bf5d-64ee75e98f45" />

- Runs shell commands (bash / PowerShell). **Copy**: `Ctrl+C`. **Paste**: `Ctrl+V` or right-click.

### Terminal Menu

<img width="227" height="148" alt="Terminal menu" src="https://github.com/user-attachments/assets/e4f5397a-6925-4d70-83d6-5b7e8b4ca7cb" />

- **Start Claude Code / Copilot CLI / Codex / Gemini** — launches the AI CLI with the current file context.
- **Clear Terminal** / **Restart Terminal**

### Header Buttons

| Button | Function                                            |
| ------ | --------------------------------------------------- |
| 🐰     | Toggle RP mode (Toki/Aris persona for AI responses) |
| 🔇     | BGM on/off (right-click to change the track)        |
| 🖼     | Set terminal background image                       |
| ⚙      | Open settings panel                                 |
| ━      | Collapse / expand the terminal panel                |

- Terminal pop-outs reuse the main window's layout, avatar, and surface styles so light and dark modes look consistent.
- If xterm fails to initialize in a pop-out, a message is shown instead of a blank screen. Closing the pop-out cleans up both terminal UI and settings subscriptions to avoid stale state on re-open.

---

## 7. AI CLI Integration + MCP

This is a core feature of RisuToki. When you launch an AI CLI from the terminal, the structure and content of the currently open file are automatically provided.

### Supported CLIs

| CLI                | MCP Config Location          | Context Delivery                                  |
| ------------------ | ---------------------------- | ------------------------------------------------- |
| Claude Code        | `~/.mcp.json`                | File info injected via `--append-system-prompt`   |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` | `AGENTS.md` auto-generated + project guide merged |
| Codex              | `~/.codex/config.toml`       | `AGENTS.md` auto-generated + project guide merged |
| Gemini CLI         | `~/.gemini/settings.json`    | `AGENTS.md` auto-generated + project guide merged |

> All four CLI config files are created automatically at app startup and cleaned up on exit.

### Project Skills Folder

The root `skills/` folder holds project skill documents. This repository ships bundled skill docs there; you can add your own alongside them.

`.claude/skills`, `.gemini/skills`, and `.github/skills` are the paths each CLI looks for. Locally, these are maintained as directory links pointing to the root `skills/` folder. On Windows the app tries a real symlink first and falls back to a junction if permissions do not allow it, keeping the git working tree clean.

If a Windows git checkout turns these links into plain text files (`../skills`) or the `skills/` folder looks empty, run `npm run sync:skills`. This also runs automatically during the `prepare` phase of `npm install` (and is silently skipped if `skills/` does not exist).

`list_skills` returns each skill's `name`, `description`, `tags`, `relatedTools`, and `files`, so an AI can discover and read only the skills it needs on demand instead of keeping the entire `AGENTS.md` in context.

### Built-in Skill Map

| Category           | Key Skills                                                                                                                               | Purpose                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Onboarding**     | `project-workflow`                                                                                                                       | Project rules and MCP workflow onboarding at session start     |
| **Tool Selection** | `using-mcp-tools`                                                                                                                        | MCP tool selection, large-field editing, batch-first principle |
| **Structure Ref**  | `file-structure-reference`                                                                                                               | `.charx` / `.risum` / `.risup`, lorebook, and regex structures |
| **Tag Guide**      | `writing-danbooru-tags`                                                                                                                  | Danbooru tag search, validation, and cleanup                   |
| **Char Authoring** | `authoring-characters`, `authoring-lorebook-bots`                                                                                        | Solo, ensemble, and large-worldcast bot description guides     |
| **Syntax Guides**  | `writing-cbs-syntax`, `writing-lua-scripts`, `writing-lorebooks`, `writing-regex-scripts`, `writing-html-css`, `writing-trigger-scripts` | Concrete syntax and patterns per surface                       |

### MCP Tool Catalogue

When an AI CLI starts, the MCP server connects automatically so the AI can read and write the active document directly. It can also probe unopened `.charx` / `.risum` / `.risup` files by absolute path and switch to them with `open_file`.

| Category           | Tools                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fields**         | `list_fields` · `read_field` · `write_field` · `search_in_field` · `read_field_range` · `replace_in_field` · `replace_in_field_batch` · `insert_in_field` · `search_all_fields`                                                       |
| **Unopened Files** | `probe_field` · `probe_field_batch` · `probe_lorebook` · `probe_regex` · `probe_lua` · `open_file` — read an unopened file by absolute path and switch it to the active document                                                      |
| **Lua Sections**   | `list_lua` · `read_lua` · `write_lua` · `replace_in_lua` · `insert_in_lua` · `add_lua_section`                                                                                                                                        |
| **CSS Sections**   | `list_css` · `read_css` · `write_css` · `replace_in_css` · `insert_in_css` · `add_css_section`                                                                                                                                        |
| **Lorebook**       | `list_lorebook` · `read_lorebook` · `write_lorebook` · `add_lorebook` · `delete_lorebook` · `replace_in_lorebook` · `replace_across_all_lorebook` + batch tools                                                                       |
| **Regex**          | `list_regex` · `read_regex` · `write_regex` · `add_regex` · `delete_regex` · `replace_in_regex` · `insert_in_regex` · `add_regex_batch` · `write_regex_batch`                                                                         |
| **Greetings**      | `list_greetings` · `read_greeting` · `write_greeting` · `add_greeting` · `delete_greeting`                                                                                                                                            |
| **Triggers**       | `list_triggers` · `read_trigger` · `write_trigger` · `add_trigger` · `delete_trigger`                                                                                                                                                 |
| **risup Prompts**  | `list_risup_prompt_items` · `read_risup_prompt_item` · `write_risup_prompt_item` · `add_risup_prompt_item` · `delete_risup_prompt_item` · `reorder_risup_prompt_items` · `read_risup_formating_order` · `write_risup_formating_order` |
| **References**     | `list_references` · `read_reference_field` + lorebook/Lua/CSS/regex sub-query tools                                                                                                                                                   |
| **Assets**         | charx: `list_charx_assets` · `read_charx_asset` · `add_charx_asset` · `delete_charx_asset` · `rename_charx_asset` / risum: `list_risum_assets` · `read_risum_asset` · `add_risum_asset` · `delete_risum_asset`                        |
| **Danbooru**       | `validate_danbooru_tags` · `search_danbooru_tags` · `get_popular_danbooru_tags`                                                                                                                                                       |
| **CBS Validation** | `validate_cbs` · `list_cbs_toggles` · `simulate_cbs` · `diff_cbs` — structural CBS validation + toggle simulation                                                                                                                     |
| **Skills**         | `list_skills` · `read_skill` — CBS/Lua/lorebook/regex syntax guides                                                                                                                                                                   |

- `write` / `add` / `delete` calls trigger a **MomoTalk-style confirmation popup** (a "Allow all for this session" toggle lets you skip it).
- Changes made by the AI CLI are reflected in the editor in real time.
- For unopened files, the recommended flow is to `probe_*` first, then `open_file` only when edits are actually needed.
- Route-local `4xx/409` errors across regex, greetings, Lua/CSS sections, fields, lorebook, references, assets, risup reorder/formating-order, skill-file reads, and unopened-file probe/open validation carry structured fields (`action`, `target`, `status`, `suggestion`, `retryable`, `next_actions`) so the AI CLI can diagnose and recover automatically. Global `Unauthorized` / `No file open` guards and HTTP-200 `success: false` no-op paths provide the same recovery metadata. Success responses include `artifacts.byte_size` as a context-budget hint. The full contract is documented in `docs/MCP_ERROR_CONTRACT.md`.
- Lorebook folders are tracked by the canonical `key` of the folder entry (`folder:UUID`). Child entries normalize their `folder` value to the same `folder:UUID` form. Legacy bare-UUID / `id`-based folder data is auto-upgraded on read.

<img width="1593" height="380" alt="MCP integration" src="https://github.com/user-attachments/assets/bb2cf1b0-d8f9-4eb7-afe4-37491ca9cfc6" />

### Usage Examples

```
"Add a system prompt to the global note"
"Find the lorebook entry with keyword 'Saber' and edit its content"
"Look for bugs in the Lua code"
"Compare the reference file's lorebook with the current one"
"Probe C:\\cards\\villain.charx with probe_lorebook, then open_file if you need to edit the description"
"Generate an image prompt with Danbooru tags matching this character's appearance"
```

---

## 8. Preview Mode / RP Mode

### Preview Mode (F5)

<img width="1380" height="783" alt="Preview" src="https://github.com/user-attachments/assets/c16a9e11-b7ac-460a-80a3-b779c70bed1b" />

Simulates a chat screen using the same rendering pipeline as RisuAI.

- The **firstMessage** is displayed automatically → you type a user message → type an AI reply to test the conversation flow.
- Preview is available only for `.charx` files. When a `.risum` or `.risup` is the active tab, both the View menu entry and `F5` are disabled.
- **CBS (Conditional Block System)** execution — variable branching, button-click handling, functions (`#func`/`call`), loops (`#each`), dice/random, Unicode/encryption tags, and more, compatible with RisuAI.
- Regex and Lua triggers are applied in order: editOutput → editDisplay → editInput.
- Asset references are resolved automatically (`{{raw::name}}`, `{{asset::name}}`, `ccdefault:`, `embeded://`).
- Lorebook preview respects `@@depth` / `@@position` / `@@role` / `@@scan_depth` / `@@probability` / `@@activate` / `@@dont_activate` / `@@match_full_word` / `@@additional_keys` / `@@exclude_keys`. `@@probability` is simulated with a reproducible deterministic roll.
- **Debug panel**: variable dump · lorebook activation summary (active/total + probability display) · matched/excluded keys · decorator tags · scan depth · probability verdict · warnings · insertion-order/selective badges · regex flags/inactive sections · live Lua logs.
- Reset the preview or pop it out (`↗`) into a separate window.
- `risu-btn` / `risu-trigger` buttons and `triggerScripts`-based Lua handlers work in preview.
- Lua calls to `setDescription`, `setPersonality`, `setScenario`, `setFirstMessage` take effect in the preview session immediately, letting you verify field-changing scripts more closely.
- `{{charpersona}}` reads personality and `{{chardesc}}` reads description, so you can distinguish between the two in preview templates.
- First-message rendering avoids a forced scroll-to-bottom, so long cards can be read from the top right away.
- The pop-out preview toolbar separates **Reset / Debug Panel / Dock to Main / Close** explicitly; both main and pop-out previews highlight the debug button when the panel is open.
- IME composition in main and pop-out preview inputs does not trigger a send on Enter, preventing accidental submissions during CJK input.
- Pop-out header buttons and the chat/debug surfaces share a common theme for light and dark modes, so button colors stay subdued in dark mode and the overall tone is consistent across editor, preview, and terminal pop-outs.
- In `npm run dev` mode, the preview bridge avoids conflicts with the sandbox iframe security policy — no `SecurityError` in the browser console.
- `{{cbr}}` / `{{cnl}}` / `{{cnewline}}` render as actual line breaks. `chatindex`, `isfirstmsg`, and Lua `onOutput` follow the real message order.
- During preview initialization an inline status banner appears: a timeout error if the iframe is not ready within 5 seconds, or a runtime error message (e.g., Lua trigger failure). While initializing, the input, send, and reset buttons are disabled.
- Preview renders inside a sandboxed iframe. `<script>` tags, inline event attributes (`on*`), and frame-escape HTML are not executed.
- The app no longer opens a hidden local sync HTTP server; file exchange is handled exclusively through direct open/save and MCP.

### RP Mode

- Toggle with the 🐰 button in the terminal header.
- Choose between Toki (light) / Aris (dark) / Custom.
- Adjusts the AI CLI's response style.
- The setting takes effect from the next CLI launch and persists across app restarts.
- IME composition in the terminal pop-out chat input also does not trigger a send on Enter, reducing misfires during CJK input.

### Avatar Panel

<img width="184" height="250" alt="Avatar" src="https://github.com/user-attachments/assets/8c3f79b3-e7e4-4b13-92a2-dade8ddeb5a9" />
<img width="522" height="509" alt="Avatar settings" src="https://github.com/user-attachments/assets/83c4ee4a-f726-45df-8713-4b25883a5c76" />

- Idle: default icon (💤) / Working: dancing GIF (✨).
- Right-click to register a custom image. Green-screen GIF backgrounds are chroma-keyed automatically.
- Dark mode automatically switches between Toki and Aris.

---

## 9. Settings

<img width="398" height="555" alt="Settings" src="https://github.com/user-attachments/assets/6682dfa3-103e-495c-8192-97cdb3c74e9b" />

Open from the menu bar **Settings** or with `Ctrl+,`.

| Setting             | Description                                        |
| ------------------- | -------------------------------------------------- |
| **Autosave ON/OFF** | Save at a regular interval                         |
| **Save Interval**   | 1 min / 5 min / 10 min / 20 min / 30 min           |
| **Autosave Path**   | Default (next to the file) or a custom folder      |
| **Dark Mode**       | Light (Toki) ↔ Dark (Aris)                         |
| **BGM**             | Background music on/off                            |
| **RP Mode**         | Toki / Aris / Custom                               |
| **Persona Editor**  | Edit the static RP persona text (Toki/Aris/Custom) |

> Set up your persona **before** starting an AI CLI session when using RP mode.

---

## 10. Keyboard Shortcuts

### File

| Shortcut       | Action    |
| -------------- | --------- |
| `Ctrl+N`       | New       |
| `Ctrl+O`       | Open      |
| `Ctrl+S`       | Save      |
| `Ctrl+Shift+S` | Save As   |
| `Ctrl+W`       | Close tab |

### Edit

| Shortcut | Action     |
| -------- | ---------- |
| `Ctrl+Z` | Undo       |
| `Ctrl+Y` | Redo       |
| `Ctrl+F` | Find       |
| `Ctrl+H` | Replace    |
| `Ctrl+A` | Select all |

### View

| Shortcut     | Action                |
| ------------ | --------------------- |
| `Ctrl+B`     | Toggle sidebar        |
| `` Ctrl+` `` | Toggle terminal       |
| `Ctrl+,`     | Open settings         |
| `Ctrl++`     | Zoom in (editor)      |
| `Ctrl+-`     | Zoom out (editor)     |
| `Ctrl+0`     | Reset editor zoom     |
| `F5`         | Preview (.charx only) |
| `F12`        | Developer tools       |

### Terminal

| Shortcut             | Action |
| -------------------- | ------ |
| `Ctrl+C` (selection) | Copy   |
| `Ctrl+V`             | Paste  |
| Right-click          | Paste  |

---

## Supported File Formats

### .charx — Character Card v3

```
example.charx (ZIP archive)
├── card.json          ← V3 character card spec (name, description, firstMessage, etc.)
├── module.risum       ← RPack-encoded binary (Lua triggers, regex, lorebook)
└── assets/            ← Image resources
    ├── icon/          ← Character icon
    └── other/image/   ← Other images
```

### .risum — Module

RPack-encoded binary file containing Lua triggers, regex scripts, lorebook entries, CJS, assets, and more.

### .risup — Preset

Encrypted AI preset file containing model settings, generation parameters, prompt templates, and more.

- Opens all compression variants exported by RisuAI: gzip, zlib, and raw-deflate.
- The visible **Prompts** group uses a **template-first prompt surface** built around `promptTemplate`, `formatingOrder`, `customPromptTemplateToggle`, and template variables.
- `promptTemplate` opens in a per-item structured editor supporting `plain` / `jailbreak` / `cot` / `chatML` / `persona` / `description` / `lorebook` / `postEverything` / `memory` / `authornote` / `chat` / `cache` types.
- `formatingOrder` opens in an order-only list editor that preserves legacy/custom tokens as-is (if they are strings).
- `customPromptTemplateToggle` opens in a multiline textarea, styled with the app's standard card/select/button UI alongside the structured prompt editor.
- Legacy fields (`mainPrompt`, `jailbreak`, `globalNote`, `useInstructPrompt`, `instructChatTemplate`, `JinjaTemplate`) remain as compatibility data but are demoted from the primary prompt flow.
- Via MCP, in addition to raw `read_field` / `write_field`, dedicated prompt-item CRUD/reorder and formatting-order tools are available. Prompt-item responses include an additive `id`; `read_risup_formating_order` responses include an advisory `warnings` array. Raw `write_field("promptTemplate")` preserves explicit `id` values.

### Editable Fields (charx)

| Field                  | Description                                   |
| ---------------------- | --------------------------------------------- |
| `lua`                  | Lua 5.4 trigger scripts (RisuAI CBS API)      |
| `triggerScripts`       | Structured trigger list/condition/effect data |
| `globalNote`           | Post-history instruction                      |
| `firstMessage`         | First message (HTML / Markdown)               |
| `alternateGreetings[]` | Alternate first-message array                 |
| `groupOnlyGreetings[]` | Group-only first-message array                |
| `description`          | Character description                         |
| `creatorcomment`       | Creator's note                                |
| `characterVersion`     | Character version                             |
| `css`                  | Custom CSS                                    |
| `defaultVariables`     | Default variables                             |
| `lorebook[]`           | Lorebook entry array                          |
| `regex[]`              | Regex script array                            |

### Editable Fields (risum)

| Field                 | Description                              |
| --------------------- | ---------------------------------------- |
| `name`                | Module name                              |
| `description`         | Module description                       |
| `lua`                 | Lua trigger scripts                      |
| `triggerScripts`      | Structured trigger list/condition/effect |
| `cjs`                 | CommonJS code                            |
| `lowLevelAccess`      | Low-level access enabled (boolean)       |
| `backgroundEmbedding` | Background embedding HTML                |
| `lorebook[]`          | Lorebook entry array                     |
| `regex[]`             | Regex script array                       |

### Editable Fields (risup)

| Field Group                  | Example Fields                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| General                      | `name`                                                                                                                                                 |
| Description                  | `description`                                                                                                                                          |
| Prompts                      | Structured `promptTemplate`, structured `formatingOrder`, `customPromptTemplateToggle`, `templateDefaultVariables`, `moduleIntergration`, `presetBias` |
| Legacy Prompts (compat data) | `mainPrompt`, `jailbreak`, `globalNote`, `useInstructPrompt`, `instructChatTemplate`, `JinjaTemplate`                                                  |
| Model/API                    | `aiModel`, `subModel`, `apiType`, `promptPreprocess`                                                                                                   |
| Base Parameters              | `temperature`, `maxContext`, `maxResponse`, `frequencyPenalty`, `presencePenalty`                                                                      |
| Sampling/Reasoning           | `top_p`, `top_k`, `repetition_penalty`, `min_p`, `top_a`, `reasonEffort`, `thinkingTokens`, `thinkingType`                                             |
| JSON Schema                  | `jsonSchemaEnabled`, `jsonSchema`, `strictJsonSchema`, `extractJson`                                                                                   |
| Other                        | `groupTemplate`, `autoSuggestPrompt`, `localStopStrings`, `verbosity`, `systemContentReplacement`, `systemRoleReplacement`                             |
| Regex                        | `regex[]`                                                                                                                                              |

> Note: Complex nested preset objects like `ooba`, `NAISettings`, and `customFlags` are **preserved** in the file but are not exposed as individual forms in the current UI. Unsupported `promptTemplate` item shapes show a read-only warning in the structured editor. For raw edits, use `write_field("promptTemplate")` or the risup prompt MCP fallback.

---

## Troubleshooting

### AI CLI won't start

- Verify that the CLI you want (`claude`, `copilot`, `codex`, `gemini`) is on your PATH.
- Try running the command directly in the terminal.
- GitHub Copilot CLI may require `/login` authentication on first use.

### MCP connection failure

- Config files are auto-created when each CLI starts: `~/.mcp.json` (Claude Code), `~/.copilot/mcp-config.json` (Copilot CLI), `~/.codex/config.toml` (Codex), `~/.gemini/settings.json` (Gemini).
- Restarting the editor may change the port; the new port is picked up automatically.
- You must start each CLI **from inside the editor** for RisuToki's MCP tools to connect.
- If `search_all_fields` still reports `MCP server 'risutoki': Not found` right after an update, an older CLI session may be running. Fully restart the CLI from the terminal menu.

### File won't open

- Make sure the file has a `.charx`, `.risum`, or `.risup` extension.
- `.charx` files must be valid ZIP archives.
- `.risup` files must be presets exported from RisuAI. gzip, zlib, and raw-deflate exports are all supported.

### GIF avatar not animating

- Check that the avatar panel is visible (View → toggle avatar).

### Modified indicator remains after saving

- All tab changes are saved at once. Press `Ctrl+S` — the indicator clears.

### Autosave not working

- Confirm that autosave is enabled in Settings.
- For a new file (never saved), you must set an autosave path first.

### Autosave recovery dialog on startup

- This appears when the previous session exited abnormally and a recoverable autosave with a `.toki-recovery.json` sidecar exists.
- Choose **Restore autosave** to continue from the saved state, **Open original** for the last-saved file, or **Ignore** to skip.
- After restoring, the `[Auto-restored]` badge and recovery status clear automatically once you save, open another file, or create a new file.

---

## License

[CC BY-NC 4.0](LICENSE) — free for non-commercial use.
