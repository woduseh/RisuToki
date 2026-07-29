# RisuToki

> Desktop editor for RisuAI `.charx` / `.risum` / `.risup` files with an integrated AI CLI terminal

[![Version](https://img.shields.io/badge/version-2.2.1-blue.svg)](https://github.com/woduseh/RisuToki/releases)
[![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-40-47848F.svg)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-22.13%2B%20%7C%2024%2B-339933.svg)](https://nodejs.org/)

## What is RisuToki?

RisuToki is a **desktop editor** purpose-built for [RisuAI](https://risuai.net/) character cards (`.charx`), modules (`.risum`), and presets (`.risup`). It pairs a VS Code–grade Monaco editor with a built-in terminal that connects directly to AI CLIs (Claude Code, GitHub Copilot CLI, Codex, Antigravity CLI) and automatically exposes the open file's structure to those CLIs through MCP (Model Context Protocol).

### Key Features

| Feature                    | Description                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📝 **Monaco Editor**       | Same editing engine as VS Code, with a focused prose view for descriptions and messages plus per-tab code-view switching                                                                                                                                                                                                                                                                                       |
| 🤖 **AI CLI Integration**  | Run Claude Code · GitHub Copilot CLI · Codex · Antigravity CLI in dedicated terminal tabs with automatic MCP connection                                                                                                                                                                                                                                                                                        |
| 📦 **File & Card Import**  | Open, edit, and save `.charx` (character cards) · `.risum` (modules) · `.risup` (presets), plus import PNG/JSON Character Cards into the structured editor                                                                                                                                                                                                                                                     |
| 📁 **Project Folders**     | Use a folder workspace as the save backend for the normal structured editor, with advanced raw markdown/json/assets access for external-tool collaboration, project-folder cloning, and `.charx`/`.risum`/`.risup` export                                                                                                                                                                                      |
| 📚 **Unified Workspaces**  | Document-specific CHARX/RISUM/RISUP workspaces with focused navigation, a wide editor canvas, and a resizable right sidebar with peer tabs for contextual properties, guides, and reference files                                                                                                                                                                                                              |
| 🪄 **Asset Rule Wizard**   | Analyze real `assets/other` filenames, map name/outfit/emotion/custom dimensions, and safely generate editable `<img src="Asset_Name">` rules into a lorebook or CHARX `globalNote` block                                                                                                                                                                                                                      |
| 🔧 **200+ MCP Tools**      | Read/write fields, lorebooks, regex, Lua/CSS sections, greetings, triggers, risup `promptTemplate`/`formatingOrder`, assets, CBS validation, references, Danbooru tags, skill docs + unopened-file probe/open + batch search/replace + structured `4xx/409` error envelopes + machine-readable confirmation / dry-run tool metadata + indexed-write stale-index guards + normalized batch `results[]` payloads |
| 🎭 **Preview Mode**        | `.charx` chat simulation in a reusable central editor tab plus sanitized rendered Markdown guide previews (F5), including tables, code, images, and safe external links                                                                                                                                                                                                                                        |
| 📚 **References**          | Load other `.charx`/`.risum`/`.risup` files as read-only references and drill into individual entries                                                                                                                                                                                                                                                                                                          |
| 🐰 **RP Mode**             | Adjust AI CLI response style with Toki / Aris / custom personas                                                                                                                                                                                                                                                                                                                                                |
| 🔀 **Sidebar Drag & Drop** | Reorder lorebook entries, regex scripts, Lua/CSS sections, greetings, and assets by dragging                                                                                                                                                                                                                                                                                                                   |
| 🧰 **Utility Tools**       | Switch the bottom terminal and tabbed right sidebar from adjacent Codex-style workspace buttons                                                                                                                                                                                                                                                                                                                |
| 💾 **Autosave & Backup**   | Configurable-interval autosave per file type (`.charx`/`.risum`/`.risup`) with `.toki-recovery.json` provenance sidecar + up to 20 backup versions per item                                                                                                                                                                                                                                                    |
| 🔄 **Session Recovery**    | After an abnormal exit, offers to **Restore autosave / Open original / Ignore** with an `[Auto-restored]` badge and provenance status                                                                                                                                                                                                                                                                          |
| 🎨 **Character Themes**    | Ten character-driven palettes with matching editor, terminal, preview, and animated-avatar presentation                                                                                                                                                                                                                                                                                                        |

---

## Installation

### Download (end users)

Grab the latest release from the [Releases](https://github.com/woduseh/RisuToki/releases) page.

- **RisuToki Setup x.x.x.exe** — installer
- **RisuToki-x.x.x-portable.exe** — portable (no installation required)

### From Source (developers)

Node.js 22.13+ or 24+ is required. The repository's `.node-version` pins Node 22.13 as the recommended CI-compatible baseline.

```bash
git clone https://github.com/woduseh/RisuToki.git
cd RisuToki
npm install
npm run dev:build
```

### Development Scripts

```bash
npm run dev          # Vite + Electron dev mode
npm run dev:build    # Rebuild Electron files, then start dev mode
npm run start:build  # Rebuild Electron + renderer files, then start the built app
npm run lint         # ESLint
npm run typecheck    # Vue + TypeScript type checking
npm run test:evals   # Deterministic agent/harness eval scenarios, including src/lib/mcp-agent-workflow-eval.test.ts
npm run test:evals:replay # Deterministic 12-scenario MCP replay covering 35 catalog mappings
npm run test:mcp:contracts # Verify tools/list and HTTP contract fingerprints
npm run test:mcp:contracts:update # Intentionally regenerate contract fingerprints with a change summary
npm test             # Node regression tests + Vitest
npm run build        # lint + typecheck + test + Electron + Vite build
npm run dist:all     # Windows NSIS + portable build
npm run mcp:standalone -- --file C:\path\to\card.charx --allow-writes
```

### Developer Documentation

- `docs/README.md` — Knowledge-base index for agents and contributors
- `AGENTS.md` + local `risu/*/AGENTS.md` routers — Product-first root routing plus subtree-specific authoring guidance
- `docs/MCP_WORKFLOW.md` — MCP runtime modes, startup profiles, and common execution sequence
- `skills/using-mcp-tools` — MCP artifact tool selection and task-intent playbooks (`read_skill("using-mcp-tools")`)
- `docs/MCP_TOOL_SURFACE.md` — MCP tool families, boundaries, and follow-up action map
- `src/lib/mcp-agent-workflow-eval.test.ts` — Declarative route/safety matrix and documentation guards
- `test/run-workflow-eval-replay.ts` — Synthetic measured replay covering all 35 replayable workflow tasks across 12 scenarios, including route accuracy, recovery, bounded reads, validation, and final artifact state
- `docs/MCP_ERROR_CONTRACT.md` — MCP success/error/no-op response contract and agent recovery rules
- `docs/PROJECT_RULES.md` — Project rules (versioning, CI, and guide locations)
- `docs/MODULE_MAP.md` — TypeScript source navigation module map
- `docs/analysis/ARCHITECTURE.md` — Runtime architecture, process boundaries, ownership rules, large-module hotspots
- `skills/project-workflow` — Project onboarding skill (`read_skill("project-workflow")`)
- `CONTRIBUTING.md` — Change principles and validation procedures
- `CHANGELOG.md` — Version-by-version change history
- GitHub Actions `CI` — On push/PR: Ubuntu lint · typecheck · test · MCP workflow replay · MCP contract baseline · renderer build + Windows Electron/Renderer build
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
  - **Claude Code**: `claude` · **GitHub Copilot CLI**: `copilot` · **Codex**: `codex` · **Antigravity CLI**: `agy`
- If no CLI is installed the editor itself works normally — AI integration is optional.

---

## 2. Interface Layout

<img width="1913" height="1004" alt="Interface layout" src="https://github.com/user-attachments/assets/6398e854-f7a8-49bb-a8e2-c73861446b97" />

| Area                   | Description                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| **Workspace switcher** | CHARX, RISUM, or RISUP task groups backed only by fields supported for that document type |
| **Navigator**          | Search, select, create, filter, and sort items for the active workspace                   |
| **Editor**             | Wide Monaco/form/image canvas with persistent document tabs                               |
| **Right sidebar**      | Resizable peer tabs for selected-item properties, guides, and reference files             |
| **Terminal shelf**     | Bottom-anchored terminal with an optional avatar beside it                                |

- Drag the navigator, right sidebar, or terminal border to resize it; the dimensions persist between launches.
- Workspace panels use fixed semantic homes and do not support arbitrary panel repositioning. Drag-and-drop inside lorebook, regex, prompt, script, greeting, and asset lists continues to reorder document content.
- Below 1180px the right sidebar becomes an overlay, and below 1020px the navigator does too. Opening one compact overlay closes the other. The editor remains pinned to the center workspace column in every visibility combination.
- Toggle the navigator with `Ctrl+B` and the terminal shelf with `` Ctrl+` ``, or use the adjacent terminal and right-sidebar buttons at the right end of the workspace bar.
- `F5` opens or reuses a `.charx` preview tab in the central editor. All product surfaces stay inside the main workspace.
- The status bar keeps document stats visible while transient save/open/error messages appear beside them.

---

## 3. Opening & Saving Files

<img width="240" height="258" alt="File menu" src="https://github.com/user-attachments/assets/d7dca751-3044-44dc-b93b-d99dc02226c2" />

| Action      | How                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------- |
| **New**     | `Ctrl+N` or File → New                                                                         |
| **Open**    | `Ctrl+O` or File → Open (select a `.charx` / `.risum` / `.risup` / PNG or JSON Character Card) |
| **Save**    | `Ctrl+S` or File → Save                                                                        |
| **Save As** | `Ctrl+Shift+S` or File → Save As                                                               |

- **PNG/JSON Character Card import**: PNG cards with `ccv3` / `chara` `tEXt` metadata and JSON Character Cards open directly in the structured `.charx` editor. Imported PNG/JSON files are remembered as sources, but **Save** opens a `.charx` save dialog instead of overwriting the import source.
- **최근 항목**: File → **최근 항목** lists the last 10 files and project folders. Failed entries are removed automatically, and the menu includes **최근 항목 지우기**.
- **Project folders**: File → **프로젝트 폴더로 추출** expands `.charx`, `.risum`, or `.risup` files into folder workspaces. File → **프로젝트 폴더 복제** copies the active project folder to an empty target folder and opens the clone. `.charx` keeps the RisuMari-compatible `card.json` shape; `.risum` uses `module.json`; `.risup` uses `preset.json` with sensitive key fields removed.
- In a project folder, **Save** writes the structured editor state back to the folder files. File → **파일로 내보내기** and **Save As** create the matching `.charx`, `.risum`, or `.risup` output when you want to import the result into RisuAI.
- `.charx` project folders track only the generated `assets/**` and `x_meta/**` files they manage. Removing or renaming an asset removes the stale generated file on save, while unrelated files added by external tools are preserved.
- Raw project files remain available under the collapsed **프로젝트 원본 파일** advanced sidebar area. Direct raw edits are debounced and synchronized back into the structured editor state.
- `.charx` and `.risum` files expose integrated **로어북** and **에셋** workspaces. Selecting an item opens the central editor and the matching inspector together. Lorebook entries can be reordered by dragging, including moves between folders, and folder membership is edited by its visible name rather than an internal UUID. `.risup` uses **기본 / 프롬프트 / 모델·API / 파라미터 / 고급** progressive disclosure while preserving every supported field on save; prompt and custom-toggle rows also support drag reordering, and prompt type can be changed in the inspector.
- Opening another document clears the previous document's tab selection and contextual inspector, while keeping any compatible workspace (for example, 로어북) selected for rapid cross-file editing.
- The asset workspace defaults to a filename-derived tree and uses a compact **트리 / 썸네일** view switch above the results. **전체 선택 / 전체 해제** applies to the currently visible filtered assets, and clicking an already-selected asset checkbox deselects it. **출력식 마법사** analyzes only `assets/other`, never invents missing combinations, and replaces only its stable generated block when run again.
- View → **UI 배치 초기화** restores the default navigator, tabbed right sidebar, terminal, and avatar layout. Workspace splitters update at most once per animation frame, and vertical handles consistently grow their panel when dragged upward.
- MCP agents can also use the `manage_file` facade for preview-first project-folder extract/reassemble workflows when a field or whole document is too large to handle comfortably through MCP responses.
- Modified tabs show a **●** dot next to their name. Closing the window triggers a MomoTalk-style save confirmation popup.
- **New** and **Open** also prompt to save if the current document has unsaved changes.
- **Autosave**: Set the interval (1–30 min) in Settings. Autosave writes a file matching the current document type alongside a `.toki-recovery.json` provenance sidecar.
- After an abnormal exit, on the next launch you can choose **Restore autosave / Open original / Ignore** for each document that has a recoverable autosave.
- A document restored from autosave shows an `[Auto-restored]` label and provenance info in the status bar. The badge clears automatically once you save, open a file, or create a new file.

### Drag & Drop

| File Type                    | Action                                          |
| ---------------------------- | ----------------------------------------------- |
| **.charx / .risum / .risup** | Added as a read-only reference                  |
| **.json**                    | Auto-detected as lorebook or regex and imported |
| **.png / .jpg / .gif…**      | Added as an image asset                         |

---

## 4. Sidebar (Item Tree)

The left navigator contains the editable item tree for the active workspace. **Guides** and **Reference files** are peer tabs in the resizable right sidebar, alongside the selected item's contextual properties.

### Navigator

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
- `promptTemplate` opens as a **card-style item list + detail editor** (not raw JSON). The `.risup` **프롬프트 관리자** gives a RisuMari-style side list for search/filter/reorder/bulk deletion, and clicking an item opens a focused single-block editor tab for `type`, `type2`, `role`, `text`, `range`, `innerFormat`, `defaultText`, and cache options. The full prompt editor remains available for broad review and advanced batch edits.
- `formatingOrder` opens as a **reorderable token list** that preserves both known and unknown tokens. You can reorder tokens with either drag-and-drop or the existing buttons; duplicate or unmatched tokens still surface warnings without blocking saving.
- `customPromptTemplateToggle` opens in a **visual/raw dual-mode editor** that keeps the original line syntax while making toggles, groups, captions, dividers, and select/text inputs easier to manage, including drag-and-drop reorder in visual mode.
- For persistent block reuse across sessions, MCP now exposes a **sidecar-backed risup prompt snippet library** on top of the text serializer (`list_risup_prompt_snippets`, `save_risup_prompt_snippet`, `insert_risup_prompt_snippet`, etc.).
- For prompt-vs-reference review, MCP also exposes **`diff_risup_prompt`**, which compares the current preset against a loaded reference `.risup` using serializer-backed `promptTemplate` line diffs plus `formatingOrder` token/warning diffs.
- Legacy and provider-specific fields remain preserved for compatibility. The primary RISUP workspaces prioritize current fields, while the **고급** workspace and search keep supported less-common fields reachable.
- `.charx` saving follows RisuToki's stricter practical protection boundary: `personality`, `scenario`, `systemPrompt`, `nickname`, `source`, `groupOnlyGreetings`, `additionalText`, `license`, and unsafe `virtualscript` are hidden from normal editing and removed on save.
- RisuToki can open `.risup` exports in gzip, zlib, and raw-deflate variants, and it preserves the detected compression mode on save.
- If any JSON-backed preset field contains malformed data, saving is blocked and the status bar shows the offending field. Structured fields (`promptTemplate`, `formatingOrder`, `presetBias`, `localStopStrings`) also enforce their expected array/item shapes.
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
- Right-click to add entries/folders, import JSON, rename, delete, or restore from backup. SillyTavern `world_info` JSON is detected and converted automatically.
- Drag & drop to reorder entries or move them between folders.

#### Regex / Assets

- **Regex**: Form editor (find, replace, type, flag) with right-click CRUD and drag-&-drop reordering.
- **Assets**: Image file list. Click to open an image viewer (zoom / pan). Right-click to add or delete. Select 2+ assets in the asset manager to batch rename by pattern-number or find/replace preview.

### Right Sidebar: Guides and Reference Files

<img width="518" height="186" alt="References" src="https://github.com/user-attachments/assets/0535187b-5ae8-4873-b641-2478f94914b3" />

- **Guides tab**: Browse built-in syntax guides (Lua, CBS, lorebook, regex, HTML/CSS, etc.) as a searchable folder tree.
- **Reference files tab**: Load other `.charx`/`.risum`/`.risup` files as read-only references. A compact file list leads to document-specific workspace tabs, mirroring the main navigator's CHARX, RISUM, and RISUP organization in the narrower sidebar.
- Reference lorebooks use the same folder and row language as the editable lorebook manager, without add, rename, delete, selection, or drag controls.
- Reference forms show a persistent read-only notice above their fields, and embedded Monaco editors use the DOM read-only state instead of relying on a transient overlay message.
- Guides and reference fields open directly in the main editor even when no primary document is loaded; closing the last such tab restores the welcome screen.
- References are automatically restored on app restart and are also accessible to AI CLIs via MCP tools, even when no main file is currently open.

### Backup System

- Automatic backups are created when editing starts, tabs switch, or MCP overwrites content (up to 20 versions per tab).
- Right-click an item → **Restore from Backup** → pick a timestamped version with preview.

---

## 5. Editor (Monaco)

RisuToki uses the same Monaco editing engine that powers VS Code.

- Syntax highlighting (Lua, HTML, CSS, JSON, etc.), autocomplete, find & replace (`Ctrl+F` / `Ctrl+H`).
- Mouse-wheel zoom (`Ctrl + scroll`), minimap.
- Open multiple items as tabs simultaneously; drag tabs to reorder.
- `F5` opens the CHARX preview as another central editor tab, so it follows the same reorder and close behavior.

---

## 6. TokiTalk Terminal

<img width="259" height="38" alt="Terminal header" src="https://github.com/user-attachments/assets/a336229d-dc6d-4dc2-bf5d-64ee75e98f45" />

- Runs shell commands (bash / PowerShell). **Copy**: `Ctrl+C`. **Paste**: `Ctrl+V` or right-click.
- Use the terminal tab bar to keep multiple shell sessions open. The `+` button creates uniquely named tabs (`Shell`, `Shell (2)`, and so on); closing the last tab creates a fresh Shell tab automatically.
- Use a tab's edit button, double-click its label, or press `F2` on the focused tab to rename it inline. Duplicate names are automatically numbered.
- Drag the terminal's upper edge upward to expand it; its lower edge remains anchored to the bottom of the workspace, including when a guide or reference is the only open editor tab. The navigator and editor always stretch down to meet the shelf, so resizing does not leave an unused strip between them.

### Terminal Menu

<img width="227" height="148" alt="Terminal menu" src="https://github.com/user-attachments/assets/e4f5397a-6925-4d70-83d6-5b7e8b4ca7cb" />

- **Start Claude Code / Copilot CLI / Codex / Antigravity** — creates a new dedicated tab, switches to it, and launches the AI CLI with the current file context.
- **Clear Terminal** / **Restart Terminal** act on the active terminal tab.

### Header Buttons

| Button        | Function                                                    |
| ------------- | ----------------------------------------------------------- |
| Avatar        | Show or hide the character avatar beside the terminal       |
| Music         | Toggle BGM without opening Settings                         |
| `RP OFF/토키` | Cycle through the available RP modes                        |
| Image         | Set the terminal background image                           |
| Close         | Hide the terminal; a compact launcher restores it afterward |

---

## 7. AI CLI Integration + MCP

This is a core feature of RisuToki. When you launch an AI CLI from the terminal, RisuToki supplies compact, type-aware artifact metadata and configures MCP so the CLI can inspect only the document content needed for the task.

When a project folder is open, the terminal starts in that project folder and generated `AGENTS.md` context uses the folder as the project root. For ordinary files, the terminal continues to use the opened file's directory.

### Supported CLIs

| CLI                | MCP Config Location                | Context Delivery                                      |
| ------------------ | ---------------------------------- | ----------------------------------------------------- |
| Claude Code        | `~/.mcp.json`                      | Compact artifact context via `--append-system-prompt` |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json`       | Managed `AGENTS.md` session block + project guide     |
| Codex              | `~/.codex/config.toml`             | Managed `AGENTS.md` session block + project guide     |
| Antigravity CLI    | `~/.gemini/config/mcp_config.json` | Managed `AGENTS.md` session block + project guide     |

> All four CLI config files are created automatically at app startup and cleaned up on exit.

### Standalone MCP Server

RisuToki MCP can also run without launching the desktop app. This is useful for external clients such as Codex App when you want file-backed `.charx` / `.risum` / `.risup` tools but do not need the editor UI.

```bash
npm run build:mcp
node toki-mcp-server.js --standalone --file C:\path\to\card.charx --allow-writes
```

For Codex App, point the MCP server at the built script:

```toml
[mcp_servers.risutoki]
command = "node"
args = ["C:/path/to/RisuToki/toki-mcp-server.js", "--standalone", "--allow-writes"]
```

The default server registers the compact `facade-first` profile. Existing clients that call granular tools directly must opt into the complete surface and restart the MCP process:

```toml
[mcp_servers.risutoki]
command = "node"
args = ["C:/path/to/RisuToki/toki-mcp-server.js", "--standalone", "--allow-writes", "--tool-profile", "advanced-full"]
```

Useful options:

| Option            | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `--file <path>`   | Load a `.charx`, `.risum`, or `.risup` as the active document at startup    |
| `--ref <path>`    | Load a read-only reference file; repeat for multiple references             |
| `--allow-writes`  | Permit write tools in headless mode; omitted means mutation requests reject |
| `--user-data-dir` | Override the standalone sidecar state directory                             |
| `--tool-profile`  | Register `facade-first`, `authoring`, `readonly`, or `advanced-full` tools  |

Use `session_status` to verify the active standalone `allowWrites` and `userDataPath` values. Standalone process, stdio lifecycle, mutating tool, sanitized API request/response, and MCP logging diagnostics are written to `%USERPROFILE%\.risutoki\mcp-standalone\mcp-server.log` without field content bodies.

Environment variable equivalents are `RISUTOKI_MCP_FILE`, `RISUTOKI_MCP_REFS` (path-delimited), `RISUTOKI_MCP_ALLOW_WRITES`, `RISUTOKI_MCP_USER_DATA_DIR`, and `RISUTOKI_MCP_TOOL_PROFILE`.

> **Facade migration note:** 1.6.0 changed the unconfigured default to the compact facade profile. In 1.8.0 it contains 13 bootstrap-capable tools: 11 preferred Facade v1 tools plus `list_skills` and `read_skill`. `load_guidance` and all granular tools remain available through compatible non-default profiles.

### Unified Skill Catalog

This repository ships skills from multiple tracked roots:

| Root                   | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `skills/`              | Product/editor workflow, MCP routing, and project conventions         |
| `risu/common/skills/`  | Shared authoring syntax/reference across `.charx`, `.risum`, `.risup` |
| `risu/bot/skills/`     | Bot, character, world, scenario, desire, and media-mix IP composition |
| `risu/prompts/skills/` | `.risup` preset and prompt composition                                |
| `risu/modules/skills/` | `.risum` module composition                                           |
| `risu/plugins/skills/` | RisuAI plugin v3 authoring                                            |

`list_skills` returns a unified catalog across all of these roots with each Skill's source `scope`, `name`, `description`, `tags`, `relatedTools`, and optional file detail. Existing no-argument calls retain the full catalog; newer clients can use `scopes`, `query`, `detail: "summary"`, `limit`, and `cursor`, then continue large `read_skill` documents with `cursor` and `max_bytes`.

`npm run sync:skills` rebuilds a generated `.skill-catalog/` from the tracked skill roots above, then repairs the two supported Skill discovery paths: `.agents/skills` for Codex and `.claude/skills` for Claude Code. On Windows the app tries a real symlink first and falls back to a junction if permissions do not allow it; if either path already exists as a managed checked-out directory copy, it refreshes that directory in place instead of failing. The retired Gemini and GitHub Copilot Skill mirrors are not generated.

> **Skill discovery uses the repo-root catalog in this repository.** Claude Code reads `.claude/skills`, while Codex reads `.agents/skills`; Codex itself can scan that directory from the current working directory up to the repository root, but RisuToki only provisions a generated repo-root link after `npm run sync:skills` (or `npm install`, via `prepare`). Placing a `skills/` folder in a subdirectory (for example `risu/bot/.agents/skills/`) does **not** create a subtree-specific catalog in this repo. Subtree scoping is handled by `AGENTS.md` routing: the nearest `risu/{scope}/AGENTS.md` decides which skills from the global catalog are relevant to the current task.

If a Windows git checkout leaves behind stale managed directory copies or the generated catalog looks empty, run `npm run sync:skills`. The command also removes the retired `.copilot-skill-catalog/` directory. It runs automatically during the `prepare` phase of `npm install` and silently skips if no tracked skill roots exist.

### Built-in Skill Map

| Category                | Key Skills                                                                                                                                                                                                                                 | Purpose                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Project workflow**    | `project-workflow`                                                                                                                                                                                                                         | Repository code, validation, documentation, versioning, and release work                                       |
| **Tool Selection**      | `using-mcp-tools`                                                                                                                                                                                                                          | MCP tool selection, large-field editing, batch-first principle                                                 |
| **Shared Syntax/Ref**   | `file-structure-reference`, `writing-cbs-syntax`, `writing-lua-scripts`, `writing-lorebooks`, `writing-regex-scripts`, `writing-html-css`, `writing-trigger-scripts`                                                                       | Shared authoring mechanics across RisuAI artifact types                                                        |
| **Shared Presentation** | `writing-arca-html`                                                                                                                                                                                                                        | Restricted WYSIWYG intro/profile HTML for paste targets like Arca.live                                         |
| **Asset Prompting**     | `writing-asset-prompts`, `writing-danbooru-tags`                                                                                                                                                                                           | Character image prompt composition and Danbooru tag cleanup                                                    |
| **Bot Authoring**       | `core-craft`, `authoring-media-mix`, `authoring-characters`, `authoring-worlds`, `authoring-scenarios`, `authoring-desire`, `trope-library`, `authoring-self-introduction-sheets`, `authoring-lorebook-bots`, `writing-translation-guides` | `.charx` composition plus cross-media IP, visual identity, world, event, desire, trope, and translation design |
| **Preset Authoring**    | `writing-risup-presets`                                                                                                                                                                                                                    | `.risup` prompt/preset composition and promptTemplate workflow                                                 |
| **Module Authoring**    | `writing-risum-modules`                                                                                                                                                                                                                    | `.risum` module composition, merge order, and toggle design                                                    |
| **Plugin Authoring**    | `writing-plugins-v3`                                                                                                                                                                                                                       | RisuAI plugin v3 sandbox/API authoring                                                                         |

### MCP Tool Catalogue

When an AI CLI starts, the MCP server connects automatically so the AI can read and write the active document directly. By default `tools/list` contains 13 `facade-first` bootstrap tools; each preserves its JSON text response and also exposes a compact public input schema, compact `outputSchema`, and equivalent `structuredContent`. Detailed Zod validation still runs immediately before the existing handler. The current full response is 29,484 bytes and is guarded at 42 KiB overall and 10 KiB per tool. `advanced-full` exposes all 203 compatible facade and granular tools with their legacy text contract.

| Category             | Tools                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Facade v1**        | default: `list_tool_profiles` · `inspect_document` · `read_content` · `search_document` · `analyze_content` · `preview_edit` · `apply_edit` · `validate_content` · `manage_items` · `manage_assets` · `manage_file`; legacy compatibility: `load_guidance` — byte-bounded/profiled workflow entrypoints, including field/token statistics, lorebook/regex simulation, Lua validation, guarded edits, asset management, and file/session/project-folder management |
| **Fields**           | `list_fields` · `read_field` · `write_field` · `search_in_field` · `read_field_range` · `replace_in_field` · `replace_in_field_batch` · `insert_in_field` · `search_all_fields`                                                                                                                                                                                                                                                                                   |
| **Folder Workspace** | facade: `manage_file` for covered preview-first `.charx`/`.risum`/`.risup` project-folder extract/reassemble / granular: `extract_charx_to_project_folder` · `reassemble_project_folder_to_charx` for exact legacy payloads or unsupported filesystem workflows                                                                                                                                                                                                   |
| **Surfaces**         | `list_surfaces` · `read_surface` · `patch_surface` · `replace_in_surface` · `save_current_file` — JSON Pointer fallback editing for content not covered by a specialized family                                                                                                                                                                                                                                                                                   |
| **Unopened Files**   | facade: `inspect_document` · `read_content` · `preview_edit` · `apply_edit` · `manage_file` / granular: `probe_field` · `probe_field_batch` · `probe_lorebook` · `probe_regex` · `probe_lua` · `external_read_surface` · `external_patch_surface` · `open_file` — read or edit an unopened file by absolute path, or switch it to the active document                                                                                                             |
| **Lua Sections**     | facade `preview_edit` / `apply_edit` for write/replace/insert/delete; granular `list_lua` · `read_lua` · `write_lua` · `replace_in_lua` · `insert_in_lua` · `add_lua_section`                                                                                                                                                                                                                                                                                     |
| **CSS Sections**     | facade `preview_edit` / `apply_edit` for write/replace/insert/delete; granular `list_css` · `read_css` · `write_css` · `replace_in_css` · `insert_in_css` · `add_css_section`                                                                                                                                                                                                                                                                                     |
| **Lorebook**         | `list_lorebook` · `read_lorebook_by_id` · `write_lorebook_by_id` · `delete_lorebook_by_id` · `read_lorebook` · `write_lorebook` · `add_lorebook` · `replace_in_lorebook` · `replace_across_all_lorebook` + batch tools                                                                                                                                                                                                                                            |
| **Regex**            | `list_regex` · `read_regex_by_identity` · `write_regex_by_identity` · `delete_regex_by_identity` · `read_regex` · `read_regex_batch` · `write_regex` · `add_regex` · `delete_regex` · `replace_in_regex` · `insert_in_regex` · `add_regex_batch` · `write_regex_batch`                                                                                                                                                                                            |
| **Greetings**        | `list_greetings` · `read_greeting_by_hash` · `write_greeting_by_hash` · `delete_greeting_by_hash` · `read_greeting` · `read_greeting_batch` · `write_greeting` · `add_greeting` · `delete_greeting` · `batch_write_greeting`                                                                                                                                                                                                                                      |
| **Triggers**         | `list_triggers` · `read_trigger` · `read_trigger_batch` · `write_trigger` · `add_trigger` · `delete_trigger`                                                                                                                                                                                                                                                                                                                                                      |
| **risup Prompts**    | `list_risup_prompt_items` · `read_risup_prompt_item_by_id` · `write_risup_prompt_item_by_id` · `delete_risup_prompt_item_by_id` · `write_risup_prompt_item_by_id_batch` · `batch_delete_risup_prompt_items_by_id` · `reorder_risup_prompt_items_by_id` · indexed prompt-item tools · `read_risup_formating_order` · `write_risup_formating_order`                                                                                                                 |
| **References**       | `list_references` · `read_reference_field` · `search_in_reference_field` · `read_reference_field_range` + greeting/trigger/lorebook/Lua/CSS/regex/risup sub-query tools, including batch readers for sibling comparisons — works without a main file open                                                                                                                                                                                                         |
| **Assets**           | facade: `manage_assets` for active/external `.charx`/`.risum` asset list/read/add/delete/rename/compress / granular: `list_charx_assets` · `read_charx_asset` · `add_charx_asset` · `delete_charx_asset` · `rename_charx_asset` · `list_risum_assets` · `read_risum_asset` · `add_risum_asset` · `delete_risum_asset` · `compress_assets_webp`                                                                                                                    |
| **Danbooru**         | `validate_danbooru_tags` · `search_danbooru_tags` · `get_popular_danbooru_tags`                                                                                                                                                                                                                                                                                                                                                                                   |
| **CBS Validation**   | `validate_cbs` · `list_cbs_toggles` · `simulate_cbs` · `diff_cbs` — structural CBS validation + toggle simulation                                                                                                                                                                                                                                                                                                                                                 |
| **Skills**           | `list_skills` · `read_skill` — scope/query/summary discovery and UTF‑8-safe paged Skill/reference reads                                                                                                                                                                                                                                                                                                                                                           |

- `write` / `add` / `delete` calls follow the MCP approval policy selected in Settings: **Always ask**, **Auto approve** (ordinary edits are allowed while destructive/external/file-level operations still prompt), or **Allow all**. A prompt can also allow all MCP operations until the app exits without suppressing ordinary editor confirmations.
- Changes made by the AI CLI are reflected in the editor in real time.
- `analyze_content` owns transformation/statistics/simulation (`field_stats`, exact encoding-based `token_count`, `simulate_lorebook`, `test_regex`, CBS/Danbooru/diff/import verification). `validate_content` owns pass/fail diagnostics, including compile-only Lua and `triggerlua` syntax checks.
- For unopened files, the recommended flow is facade `inspect_document` / `read_content` first, then `preview_edit` / `apply_edit` for covered field, surface, lorebook, regex, alternate greeting, trigger, Lua/CSS section, or `.risup` prompt-item mutations; use `manage_assets` for covered external `.charx`/`.risum` asset management including WebP compression and `manage_file` for guarded open/extract/reassemble workflows; use `probe_*` / `external_*` for exact legacy shapes or unsupported direct path edits, and granular `open_file` only when exact legacy active-document switching is needed.
- Route-local failures carry `action`, `target`, `status`, stable `code`, `suggestion`, `retryable`, `retry_mode`, `outcome`, and `next_actions`. Stale conflicts refresh before retry; mutation timeout, cancellation after dispatch, and partial apply require state inspection and a new preview instead of automatic replay. Global guards and HTTP-200 no-op paths use the same additive recovery contract. Success responses include byte and semantic-truncation metadata so agents can narrow follow-up reads. The full contract is documented in `docs/MCP_ERROR_CONTRACT.md`.
- Lorebook folders are tracked by the canonical `key` of the folder entry (`folder:UUID`). Child entries normalize their `folder` value to the same `folder:UUID` form. Legacy bare-UUID / `id`-based folder data is auto-upgraded on read.

<img width="1593" height="380" alt="MCP integration" src="https://github.com/user-attachments/assets/bb2cf1b0-d8f9-4eb7-afe4-37491ca9cfc6" />

### Usage Examples

```
"Add a system prompt to the global note"
"Find the lorebook entry with keyword 'Saber' and edit its content"
"Look for bugs in the Lua code"
"Compare the reference file's lorebook with the current one"
"Inspect C:\\cards\\villain.charx with inspect_document/read_content, then use manage_file open_file if you need to switch it into the active editor"
"Generate an image prompt with Danbooru tags matching this character's appearance"
```

---

## 8. Preview Mode / RP Mode

### Preview Mode (F5)

<img width="1380" height="783" alt="Preview" src="https://github.com/user-attachments/assets/c16a9e11-b7ac-460a-80a3-b779c70bed1b" />

Simulates a chat screen using the same rendering pipeline as RisuAI.

- The **firstMessage** is displayed automatically → you type a user message → type an AI reply to test the conversation flow.
- Select the default or any alternate greeting from the preview toolbar; changing it resets the runtime with the matching RisuAI `firstmsgindex`.
- First-message CBS conditionals use RisuAI-compatible arithmetic and boolean operators, including the common single-character `=`, `&`, and `|` forms.
- Switch the input role between **Conversation / User only / Character only** to inspect either side independently without invoking a model.
- Use desktop, tablet, and mobile viewport presets to verify responsive CSS and CBS `screenwidth` / `screenheight` behavior.
- Open the typed asset gallery to inspect image/audio/video/font entries and insert `{{asset::name}}` at the current input cursor.
- Character messages use the card's real icon and honor the RisuAI `largePortrait` aspect ratio.
- Preview is available only for `.charx` files. When a `.risum` or `.risup` is the active tab, both the View menu entry and `F5` are disabled.
- Preview uses a RisuAI-compatible Markdown pipeline with tables, nested lists, fenced syntax highlighting, inline KaTeX (`$$...$$`), safe structural HTML, and Risu quote styling.
- Preview-only Markdown, syntax-highlighting, math, CSS-processing, and sanitization libraries load when the central preview tab is first opened instead of during application startup.
- Character CSS is class-prefixed and scoped to each `.chattext` surface like RisuAI, including nested at-rules and preserved keyframes, so card and background styling can be checked without leaking into preview controls.
- **CBS (Conditional Block System)** execution — variable branching, button-click handling, functions (`#func`/`call`), loops (`#each`), dice/random, Unicode/encryption tags, and more, compatible with RisuAI.
- Character replies follow editOutput → CBS/Lua → editDisplay, while user messages follow editInput → CBS/Lua → editDisplay; regex entries run in RisuAI's descending order and support display placement actions.
- Asset references are resolved automatically after display regex processing across CCv2/CCv3 and embedded modules (`{{raw::name}}`, `{{asset::name}}`, `{{source::char}}`, `__asset:N`, `ccdefault:`, `embeded://`), keeping authored asset names available to regex capture labels while preserving image, audio, video, and font MIME types.
- Character background HTML and an embedded `module.risum` `backgroundEmbedding` are rendered together in RisuAI order.
- Lorebook preview respects `@@depth` / `@@position` / `@@role` / `@@scan_depth` / `@@probability` / `@@activate` / `@@dont_activate` / `@@match_full_word` / `@@additional_keys` / `@@exclude_keys`. `@@probability` is simulated with a reproducible deterministic roll.
- **Debug panel**: variable dump · lorebook activation summary (active/total + probability display) · matched/excluded keys · decorator tags · scan depth · probability verdict · warnings · insertion-order/selective badges · regex flags/inactive sections · live Lua logs.
- The preview opens as a normal central editor tab, can be reordered or closed with the other document tabs, and exposes Reset, Debug, and Focus actions in its own header. Focus temporarily collapses the navigator, right sidebar, and terminal through their normal layout transitions, then restores their previous open state without changing saved sizes.
- `risu-btn` / `risu-trigger` buttons and `triggerScripts`-based Lua handlers work in preview.
- Lua calls to `setDescription`, `setPersonality`, `setScenario`, `setFirstMessage` take effect in the preview session immediately, letting you verify field-changing scripts more closely.
- `{{charpersona}}` reads personality and `{{chardesc}}` reads description, so you can distinguish between the two in preview templates.
- First-message rendering avoids a forced scroll-to-bottom, so long cards can be read from the top right away.
- The preview header highlights the debug button while the debug panel is open.
- IME composition in preview inputs does not trigger a send on Enter, preventing accidental submissions during CJK input.
- In `npm run dev` mode, the preview bridge avoids conflicts with the sandbox iframe security policy — no `SecurityError` in the browser console.
- `{{cbr}}` / `{{cnl}}` / `{{cnewline}}` render as actual line breaks. `chatindex`, `isfirstmsg`, and Lua `onOutput` follow the real message order.
- During preview initialization an inline status banner appears: a timeout error if the iframe is not ready within 5 seconds, or a runtime error message (e.g., Lua trigger failure). While initializing, the input, send, and reset buttons are disabled.
- Preview renders inside a sandboxed iframe. `<script>` tags, inline event attributes (`on*`), frame-escape HTML, executable CSS, and unsafe URLs are not executed, while safe image/audio/video/font sources remain available for visual verification.
- The app no longer opens a hidden local sync HTTP server; file exchange is handled exclusively through direct open/save and MCP.

### RP Mode

- Toggle with the 🐰 button in the terminal header.
- Choose between Toki (light) / Aris (dark) / Custom.
- Adjusts the AI CLI's response style.
- The setting takes effect from the next CLI launch and persists across app restarts.

### Theme Presets

- Settings provide Toki, Aris, Kei, Yuzu, Midori, Momoi, Yuuka, Hina, Mika, Kisaki, and Custom themes in that order.
- Custom themes are palette-based: background, surface, text, secondary text, accent, warning, pink, and border colors can be edited safely without arbitrary CSS.
- Theme selection updates the app chrome, lorebook forms and embedded editors, terminal and preview colors, and matching `TokiTalk` / `ArisTalk` / character-specific terminal title together.

### Avatar Panel

<img width="184" height="250" alt="Avatar" src="https://github.com/user-attachments/assets/8c3f79b3-e7e4-4b13-92a2-dade8ddeb5a9" />
<img width="522" height="509" alt="Avatar settings" src="https://github.com/user-attachments/assets/83c4ee4a-f726-45df-8713-4b25883a5c76" />

- Each built-in character theme supplies matching transparent animated WebP idle (💤) and working (✨) states without palette-fringe artifacts.
- Toki and Aris use the same generated four-frame animation system as the other themes, while the compact Toki icon remains the app and welcome-screen mark.
- The status line uses distinct idle and working dialogue written for the selected theme character.
- The avatar stays beside the terminal and can be shown or hidden from the robot button in the terminal header.
- Select **도움말** below the avatar to open the built-in usage guide.
- Right-click to register a custom image. Green-screen GIF backgrounds are chroma-keyed automatically.
- Changing the app theme automatically switches the default avatar, while a manually selected custom avatar remains in place.

---

## 9. Settings

<img width="398" height="555" alt="Settings" src="https://github.com/user-attachments/assets/6682dfa3-103e-495c-8192-97cdb3c74e9b" />

Open from the menu bar **Settings** or with `Ctrl+,`.

| Setting             | Description                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **Autosave ON/OFF** | Save at a regular interval                                                                     |
| **Save Interval**   | 1 min / 5 min / 10 min / 20 min / 30 min                                                       |
| **Autosave Path**   | Default (next to the file) or a custom folder                                                  |
| **Dark Mode**       | Light (Toki) ↔ Dark (Aris)                                                                     |
| **BGM**             | Background music on/off                                                                        |
| **RP Mode**         | Toki / Aris / Custom                                                                           |
| **Persona Editor**  | Edit RP persona text; customizations persist in the user profile and override bundled defaults |
| **Preview Focus**   | Automatically collapse surrounding panels when opening a preview (enabled by default)          |

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

| Shortcut       | Action                    |
| -------------- | ------------------------- |
| `Ctrl+B`       | Toggle sidebar            |
| `` Ctrl+` ``   | Toggle terminal           |
| `Ctrl+,`       | Open settings             |
| `Ctrl++`       | Zoom in (editor)          |
| `Ctrl+-`       | Zoom out (editor)         |
| `Ctrl+0`       | Reset editor zoom         |
| `F5`           | Preview (.charx only)     |
| `Ctrl+Shift+F` | Toggle preview focus mode |
| `F12`          | Developer tools           |

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

- Via MCP, the preferred `manage_assets` facade handles active/external `.risum` asset list/read/add/delete/rename/WebP compression through preview-first workflows. Successful conversion updates binary data and extension metadata together; failed or larger output preserves the original.

### .risup — Preset

Encrypted AI preset file containing model settings, generation parameters, prompt templates, and more.

- Opens all compression variants exported by RisuAI: gzip, zlib, and raw-deflate.
- The visible **Prompts** group uses a **template-first prompt surface** built around `promptTemplate`, `formatingOrder`, `customPromptTemplateToggle`, and template variables.
- `promptTemplate` opens in a per-item structured editor supporting `plain` / `jailbreak` / `cot` / `chatML` / `persona` / `description` / `lorebook` / `postEverything` / `memory` / `authornote` / `chat` / `cache` types, plus toolbar search/filter, grouped type-aware add menus, per-item insert-below controls, drag-and-drop reorder, quick duplicate, and collapse/expand controls for longer lists.
- `formatingOrder` opens in an order-only list editor that preserves legacy/custom string tokens and supports drag-and-drop reorder alongside button controls.
- `customPromptTemplateToggle` opens in a visual/raw editor that preserves the stored newline-delimited toggle syntax while exposing row-level controls for toggle/select/text/textarea/group/divider/caption items and drag-and-drop reorder in visual mode.
- Legacy fields (`mainPrompt`, `jailbreak`, `globalNote`, `useInstructPrompt`, `instructChatTemplate`, `JinjaTemplate`) remain as compatibility data but are demoted from the primary prompt flow.
- Via MCP, the preferred `manage_items` facade handles active/external prompt-item add, batch add, stable-id or index reorder, selected-item text copy, text import append/replace, **persistent prompt snippet library** list/read/save/insert/delete, and lorebook/regex/alternate greeting/trigger/Lua/CSS add/reorder through preview-first workflows. Granular prompt-item CRUD/reorder, batch read/write/add, prompt-item search, whole-template text export/import, snippet tools, prompt-vs-reference compare via `diff_risup_prompt`, formatting-order tools, and unsupported structured add/reorder shapes remain available as advanced fallbacks. Prompt-item responses include an additive `id`, prompt mutation/import responses include additive `orderWarnings`, structured add/reorder previews include collection/hash guards, `read_risup_formating_order` / `write_risup_formating_order` return advisory `warnings` arrays, and `diff_risup_prompt` reports serializer-based `promptTemplate` line deltas plus `formatingOrder` token/warning differences against a loaded reference preset. The text serializer preserves supported-item IDs, supported-item extra JSON fields, and unsupported/raw prompt items, while append-mode imports reassign fresh IDs so copied blocks and stored snippets can be reused safely across sessions.

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
| `moduleDescription`   | Module description                       |
| `lua`                 | Lua trigger scripts                      |
| `triggerScripts`      | Structured trigger list/condition/effect |
| `lowLevelAccess`      | Low-level access enabled (boolean)       |
| `hideIcon`            | Hide chat icons when module is active    |
| `backgroundEmbedding` | Background embedding HTML                |
| `moduleNamespace`     | Module namespace/alias                   |
| `customModuleToggle`  | Custom module toggle definitions         |
| `lorebook[]`          | Lorebook entry array                     |
| `regex[]`             | Regex script array                       |

`mcpUrl` is preserved for compatibility with RisuAI MCP modules, but it is read-only in the normal editor/MCP mutation surfaces.
`customModuleToggle` opens in the same visual/raw toggle editor used by preset template toggles, while preserving the stored line syntax.

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

- Verify that the CLI you want (`claude`, `copilot`, `codex`, `agy`) is on your PATH.
- Try running the command directly in the terminal.
- GitHub Copilot CLI may require `/login` authentication on first use.

### MCP connection failure

- Config files are auto-created when each CLI starts: `~/.mcp.json` (Claude Code), `~/.copilot/mcp-config.json` (Copilot CLI), `~/.codex/config.toml` (Codex), and `~/.gemini/config/mcp_config.json` (Antigravity CLI).
- Restarting the editor may change the port; the new port is picked up automatically.
- You must start each CLI **from inside the editor** for RisuToki's MCP tools to connect.
- If Codex reports that the MCP connection closed before the `initialize` response, update to RisuToki 1.8.1 or later; 1.8.0 portable packages omitted the tiktoken WASM runtime asset.
- If `search_all_fields` still reports `MCP server 'risutoki': Not found` right after an update, an older CLI session may be running. Fully restart the CLI from the terminal menu.

### File won't open

- Make sure the file has a `.charx`, `.risum`, or `.risup` extension.
- `.charx` files must be valid ZIP archives.
- `.risup` files must be presets exported from RisuAI. gzip, zlib, and raw-deflate exports are all supported.

### Avatar animation not playing

- Check that the terminal shelf is open and the avatar is enabled from the robot button in its header (or View → toggle avatar).

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
